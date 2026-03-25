import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const ASX_TICKERS = ["BHP","CBA","CSL","WES","ANZ","NAB","FMG","RIO","MQG","WBC","WDS","TLS","ALL","GMG","STO"];

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)",
  Accept: "application/json",
};

// 5-minute server-side cache shared across all users
const QUOTES_CACHE_TTL_MS = 5 * 60 * 1000;
let quotesCache: { data: QuotesPayload; expiresAt: number } | null = null;

interface QuoteData {
  symbol: string;
  price: number | null;
  prevClose: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  pe: number | null;
  divYield: number | null;
  name: string | null;
}

interface QuotesPayload {
  fetchedAt: string;
  asx: Record<string, QuoteData>;
  indices: {
    asx200: QuoteData;
    allOrds: QuoteData;
    audUsd: QuoteData;
    vix: QuoteData;
  };
  crypto: {
    btc: QuoteData;
    eth: QuoteData;
    gold: QuoteData;
  };
}

// Try query2 first, fall back to query1 on any failure
async function fetchQuote(symbol: string): Promise<QuoteData> {
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: YAHOO_HEADERS });
      clearTimeout(timeout);
      if (!response.ok) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await response.json()) as any;
      const result = data?.chart?.result?.[0];
      const meta = result?.meta ?? {};
      const closes: number[] = ((result?.indicators?.quote?.[0]?.close ?? []) as (number | null)[])
        .map((c) => (typeof c === "number" && Number.isFinite(c) && c > 0 ? c : null))
        .filter((c): c is number => c !== null);

      const price: number | null = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
      if (price === null) continue;

      const prevClose: number | null =
        typeof meta.previousClose === "number" ? meta.previousClose
        : typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose
        : closes.length > 1 ? closes[closes.length - 2] : null;
      const yearHigh: number | null =
        typeof meta.fiftyTwoWeekHigh === "number" ? meta.fiftyTwoWeekHigh
        : closes.length > 0 ? Math.max(...closes) : null;
      const yearLow: number | null =
        typeof meta.fiftyTwoWeekLow === "number" ? meta.fiftyTwoWeekLow
        : closes.length > 0 ? Math.min(...closes) : null;
      const pe: number | null = typeof meta.trailingPE === "number" && Number.isFinite(meta.trailingPE) ? meta.trailingPE : null;
      const divYield: number | null = typeof meta.dividendYield === "number" && Number.isFinite(meta.dividendYield) ? meta.dividendYield * 100 : null;
      const name: string | null = typeof meta.shortName === "string" ? meta.shortName : typeof meta.longName === "string" ? meta.longName : null;

      return { symbol, price, prevClose, yearHigh, yearLow, pe, divYield, name };
    } catch {
      continue;
    }
  }
  return nullQuote(symbol);
}

async function fetchFundamentals(symbols: string[]): Promise<Record<string, { pe: number | null; divYield: number | null; name: string | null }>> {
  const joined = symbols.map(encodeURIComponent).join(",");
  // Try query1 first for fundamentals, fall back to query2
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v7/finance/quote?symbols=${joined}&fields=trailingPE,dividendYield,shortName,longName`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const response = await fetch(url, { cache: "no-store", signal: controller.signal, headers: YAHOO_HEADERS });
      clearTimeout(timeout);
      if (!response.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await response.json()) as any;
      const results: unknown[] = data?.quoteResponse?.result ?? [];
      if (results.length === 0) continue;
      const out: Record<string, { pe: number | null; divYield: number | null; name: string | null }> = {};
      for (const r of results) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = r as any;
        if (!q?.symbol) continue;
        out[q.symbol] = {
          pe: typeof q.trailingPE === "number" && Number.isFinite(q.trailingPE) ? q.trailingPE : null,
          divYield: typeof q.dividendYield === "number" ? q.dividendYield * 100 : null,
          name: q.shortName ?? q.longName ?? null,
        };
      }
      return out;
    } catch {
      continue;
    }
  }
  return {};
}

// CoinGecko free API — primary source for BTC/ETH
async function fetchCryptoFromCoinGecko(): Promise<{ btc: QuoteData | null; eth: QuoteData | null }> {
  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return { btc: null, eth: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;

    const makeQuote = (symbol: string, id: string, name: string): QuoteData | null => {
      const d = data[id];
      if (typeof d?.usd !== "number" || d.usd <= 0) return null;
      const price = d.usd;
      const changePct = typeof d.usd_24h_change === "number" ? d.usd_24h_change : 0;
      const prevClose = changePct !== -100 ? price / (1 + changePct / 100) : price;
      return { symbol, price, prevClose, yearHigh: null, yearLow: null, pe: null, divYield: null, name };
    };

    return {
      btc: makeQuote("BTC-USD", "bitcoin", "Bitcoin"),
      eth: makeQuote("ETH-USD", "ethereum", "Ethereum"),
    };
  } catch {
    return { btc: null, eth: null };
  }
}

// Frankfurter (ECB data) — primary source for AUD/USD rate
async function fetchAudUsdFromFrankfurter(): Promise<number | null> {
  try {
    const url = "https://api.frankfurter.app/latest?from=USD&to=AUD";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    const usdToAud = data?.rates?.AUD;
    if (typeof usdToAud !== "number" || usdToAud <= 0) return null;
    return 1 / usdToAud; // Frankfurter gives USD→AUD; app needs AUD/USD
  } catch {
    return null;
  }
}

function nullQuote(symbol: string): QuoteData {
  return { symbol, price: null, prevClose: null, yearHigh: null, yearLow: null, pe: null, divYield: null, name: null };
}

export async function GET(request: NextRequest) {
  const isDemo = request.nextUrl.searchParams.get("demo") === "1";
  if (!isDemo) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    const entitlements = readUserEntitlements(user.id);
    if (entitlements.planTier === "none" && !entitlements.proEnabled) {
      return NextResponse.json({ error: "Subscription required." }, { status: 403 });
    }
  }

  // Serve from cache if fresh — all users share one fetch cycle
  const now = Date.now();
  if (quotesCache && now < quotesCache.expiresAt) {
    return NextResponse.json(quotesCache.data, { headers: { "Cache-Control": "no-store" } });
  }

  const asxSymbols = ASX_TICKERS.map((t) => `${t}.AX`);
  const extraSymbols = ["^AXJO", "^AORD", "AUDUSD=X", "^VIX", "BTC-USD", "ETH-USD", "XAUUSD=X", "XAUAUD=X"];
  const allSymbols = [...asxSymbols, ...extraSymbols];

  const [quotes, fundamentals, coingecko, frankfurterAudUsd] = await Promise.all([
    Promise.all(allSymbols.map(fetchQuote)),
    fetchFundamentals(asxSymbols),
    fetchCryptoFromCoinGecko(),
    fetchAudUsdFromFrankfurter(),
  ]);

  const bySymbol: Record<string, QuoteData> = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  // Merge fundamentals (v7) into asx quotes — v7 is more reliable for PE/yield
  for (const ticker of ASX_TICKERS) {
    const sym = `${ticker}.AX`;
    const fund = fundamentals[sym];
    if (fund && bySymbol[sym]) {
      if (fund.pe !== null && bySymbol[sym].pe === null) bySymbol[sym].pe = fund.pe;
      if (fund.divYield !== null && bySymbol[sym].divYield === null) bySymbol[sym].divYield = fund.divYield;
      if (fund.name !== null && bySymbol[sym].name === null) bySymbol[sym].name = fund.name;
    }
  }

  // Use CoinGecko for BTC/ETH if available, fall back to Yahoo
  if (coingecko.btc) bySymbol["BTC-USD"] = coingecko.btc;
  if (coingecko.eth) bySymbol["ETH-USD"] = coingecko.eth;

  // Use Frankfurter for AUD/USD if available, fall back to Yahoo
  if (frankfurterAudUsd !== null) {
    bySymbol["AUDUSD=X"] = {
      ...bySymbol["AUDUSD=X"],
      price: frankfurterAudUsd,
      prevClose: bySymbol["AUDUSD=X"].prevClose ?? frankfurterAudUsd,
    };
  }

  // Convert gold USD→AUD, with direct XAUAUD=X as fallback
  const goldUsd = bySymbol["XAUUSD=X"];
  const audUsdQ = bySymbol["AUDUSD=X"];
  const goldAudDirect = bySymbol["XAUAUD=X"];
  let goldAudPrice: number | null = null;
  let goldAudPrevClose: number | null = null;
  if (goldUsd.price && audUsdQ.price && audUsdQ.price > 0) {
    goldAudPrice = goldUsd.price / audUsdQ.price;
    if (goldUsd.prevClose && audUsdQ.prevClose && audUsdQ.prevClose > 0) {
      goldAudPrevClose = goldUsd.prevClose / audUsdQ.prevClose;
    }
  } else if (goldAudDirect.price) {
    goldAudPrice = goldAudDirect.price;
    goldAudPrevClose = goldAudDirect.prevClose;
  }

  const payload: QuotesPayload = {
    fetchedAt: new Date().toISOString(),
    asx: Object.fromEntries(ASX_TICKERS.map((t) => [t, bySymbol[`${t}.AX`]])),
    indices: {
      asx200: bySymbol["^AXJO"],
      allOrds: bySymbol["^AORD"],
      audUsd: bySymbol["AUDUSD=X"],
      vix: bySymbol["^VIX"],
    },
    crypto: {
      btc: bySymbol["BTC-USD"],
      eth: bySymbol["ETH-USD"],
      gold: { symbol: "XAUAUD", price: goldAudPrice, prevClose: goldAudPrevClose, yearHigh: null, yearLow: null, pe: null, divYield: null, name: "Gold" },
    },
  };

  quotesCache = { data: payload, expiresAt: now + QUOTES_CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
