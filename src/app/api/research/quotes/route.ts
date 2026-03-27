import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const ASX_TICKERS = ["BHP","CBA","CSL","WES","ANZ","NAB","FMG","RIO","MQG","WBC","WDS","TLS","ALL","GMG","STO"];

const FMP_BASE = "https://financialmodelingprep.com/stable";

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

interface AsxConstituentQuote extends QuoteData {
  marketCap: number | null;
  sector: string | null;
  volume: number | null;
  exchange: string | null;
}

interface QuotesPayload {
  fetchedAt: string;
  asx: Record<string, QuoteData>;
  asxConstituents: AsxConstituentQuote[];
  indices: {
    asx200: QuoteData;
    allOrds: QuoteData;
    audUsd: QuoteData;
    vix: QuoteData;
  };
  crypto: {
    btc: QuoteData;
    eth: QuoteData;
    sol: QuoteData;
    gold: QuoteData;
  };
}

async function fetchAsxConstituents(apiKey: string): Promise<AsxConstituentQuote[]> {
  if (!apiKey) return [];
  const query = new URLSearchParams({
    exchange: "ASX",
    country: "AU",
    isEtf: "false",
    isFund: "false",
    isActivelyTrading: "true",
    limit: "200",
    apikey: apiKey,
  });

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(`${FMP_BASE}/company-screener?${query.toString()}`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => {
        const rawSymbol = typeof item.symbol === "string" ? item.symbol.toUpperCase() : null;
        if (!rawSymbol) return null;
        const symbol = rawSymbol.endsWith(".AX") ? rawSymbol : `${rawSymbol}.AX`;
        const price = typeof item.price === "number" ? item.price : null;
        const change = typeof item.change === "number" ? item.change : null;
        return {
          symbol,
          price,
          prevClose: price != null && change != null ? price - change : null,
          yearHigh: typeof item.yearHigh === "number" ? item.yearHigh : null,
          yearLow: typeof item.yearLow === "number" ? item.yearLow : null,
          pe: typeof item.pe === "number" ? item.pe : null,
          divYield: typeof item.dividendYield === "number" ? item.dividendYield : null,
          name: typeof item.companyName === "string" ? item.companyName : symbol.replace(".AX", ""),
          marketCap: typeof item.marketCap === "number" ? item.marketCap : null,
          sector: typeof item.sector === "string" ? item.sector : null,
          volume: typeof item.volume === "number" ? item.volume : null,
          exchange: typeof item.exchangeShortName === "string" ? item.exchangeShortName : null,
        };
      })
      .filter((item): item is AsxConstituentQuote => item !== null)
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  } catch {
    return [];
  }
}

// FMP /profile — primary source for ASX stocks (returns price, changePct, 52wk range, marketCap, divYield)
async function fetchFmpProfile(ticker: string, apiKey: string): Promise<QuoteData | null> {
  if (!apiKey) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`${FMP_BASE}/profile?symbol=${ticker}.AX&apikey=${apiKey}`, {
      cache: "no-store", signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const p = data[0];
    const price: number | null = typeof p.price === "number" ? p.price : null;
    if (price === null) return null;
    // Compute prevClose from change: prevClose = price - change
    const change: number | null = typeof p.change === "number" ? p.change : null;
    const prevClose: number | null = change !== null ? price - change : null;
    // Parse "lo-hi" range string
    let yearHigh: number | null = null;
    let yearLow: number | null = null;
    if (typeof p.range === "string" && p.range.includes("-")) {
      const parts = p.range.split("-");
      yearLow = parseFloat(parts[0]) || null;
      yearHigh = parseFloat(parts[1]) || null;
    }
    const pe: number | null = typeof p.pe === "number" && Number.isFinite(p.pe) ? p.pe : null;
    // lastDividend from FMP is annual dividend in AUD — compute yield
    let divYield: number | null = null;
    if (typeof p.lastDividend === "number" && p.lastDividend > 0 && price > 0) {
      divYield = (p.lastDividend / price) * 100;
    }
    const name: string | null = p.companyName ?? null;
    return { symbol: `${ticker}.AX`, price, prevClose, yearHigh, yearLow, pe, divYield, name };
  } catch { return null; }
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


// CoinGecko free API — primary source for BTC/ETH/SOL
async function fetchCryptoFromCoinGecko(): Promise<{ btc: QuoteData | null; eth: QuoteData | null; sol: QuoteData | null }> {
  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return { btc: null, eth: null, sol: null };
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
      sol: makeQuote("SOL-USD", "solana", "Solana"),
    };
  } catch {
    return { btc: null, eth: null, sol: null };
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

  const fmpApiKey = process.env.FMP_API_KEY ?? "";
  const extraSymbols = ["^AXJO", "^AORD", "AUDUSD=X", "^VIX", "BTC-USD", "ETH-USD", "SOL-USD", "XAUUSD=X", "GC=F"];

  const [fmpAsxResults, asxConstituents, extraQuotes, coingecko, frankfurterAudUsd] = await Promise.all([
    // Use FMP profile as primary source for ASX stocks (more reliable than Yahoo for AU exchange)
    Promise.all(ASX_TICKERS.map((t) => fetchFmpProfile(t, fmpApiKey))),
    fetchAsxConstituents(fmpApiKey),
    Promise.all(extraSymbols.map(fetchQuote)),
    fetchCryptoFromCoinGecko(),
    fetchAudUsdFromFrankfurter(),
  ]);

  const bySymbol: Record<string, QuoteData> = Object.fromEntries(extraQuotes.map((q) => [q.symbol, q]));

  // Merge FMP ASX profiles — fall back to Yahoo Finance if FMP returned null
  const yahooFallbackSymbols = ASX_TICKERS
    .filter((_, i) => fmpAsxResults[i] === null)
    .map((t) => `${t}.AX`);

  const yahooFallbackQuotes = yahooFallbackSymbols.length > 0
    ? await Promise.all(yahooFallbackSymbols.map(fetchQuote))
    : [];

  for (const q of yahooFallbackQuotes) bySymbol[q.symbol] = q;

  for (let i = 0; i < ASX_TICKERS.length; i++) {
    const fmpQ = fmpAsxResults[i];
    const sym = `${ASX_TICKERS[i]}.AX`;
    if (fmpQ) {
      bySymbol[sym] = fmpQ;
    } else if (!bySymbol[sym]) {
      bySymbol[sym] = nullQuote(sym);
    }
  }

  // Use CoinGecko for BTC/ETH/SOL if available, fall back to Yahoo
  if (coingecko.btc) bySymbol["BTC-USD"] = coingecko.btc;
  if (coingecko.eth) bySymbol["ETH-USD"] = coingecko.eth;
  if (coingecko.sol) bySymbol["SOL-USD"] = coingecko.sol;

  // Use FMP AUDUSD rate if available, else Frankfurter, else Yahoo
  const fmpAudUsd = await (async () => {
    if (!fmpApiKey) return null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6_000);
      const res = await fetch(`${FMP_BASE}/quote?symbol=AUDUSD&apikey=${fmpApiKey}`, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any[];
      const rate = data?.[0]?.price;
      return typeof rate === "number" && rate > 0 ? rate : null;
    } catch { return null; }
  })();

  const audUsdRate = fmpAudUsd ?? frankfurterAudUsd;
  if (audUsdRate !== null) {
    bySymbol["AUDUSD=X"] = {
      ...bySymbol["AUDUSD=X"],
      price: audUsdRate,
      prevClose: bySymbol["AUDUSD=X"]?.prevClose ?? audUsdRate,
    };
  }

  // Convert gold USD→AUD; prefer XAUUSD=X, fall back to GC=F (COMEX futures)
  const goldUsd = bySymbol["XAUUSD=X"]?.price ? bySymbol["XAUUSD=X"] : bySymbol["GC=F"];
  const audUsdQ = bySymbol["AUDUSD=X"];
  let goldAudPrice: number | null = null;
  let goldAudPrevClose: number | null = null;
  if (goldUsd?.price && audUsdQ?.price && audUsdQ.price > 0) {
    goldAudPrice = goldUsd.price / audUsdQ.price;
    if (goldUsd.prevClose && audUsdQ.prevClose && audUsdQ.prevClose > 0) {
      goldAudPrevClose = goldUsd.prevClose / audUsdQ.prevClose;
    }
  }

  const mergedAsxConstituents = asxConstituents.map((item) => {
    const live = bySymbol[item.symbol];
    if (!live) return item;
    return {
      ...item,
      price: live.price ?? item.price,
      prevClose: live.prevClose ?? item.prevClose,
      yearHigh: live.yearHigh ?? item.yearHigh,
      yearLow: live.yearLow ?? item.yearLow,
      pe: live.pe ?? item.pe,
      divYield: live.divYield ?? item.divYield,
      name: live.name ?? item.name,
    };
  });

  const fallbackAsxConstituents: AsxConstituentQuote[] = ASX_TICKERS.map((ticker) => {
    const q = bySymbol[`${ticker}.AX`] ?? nullQuote(`${ticker}.AX`);
    return {
      ...q,
      marketCap: null,
      sector: null,
      volume: null,
      exchange: "ASX",
      name: q.name ?? ticker,
    };
  });

  const payload: QuotesPayload = {
    fetchedAt: new Date().toISOString(),
    asx: Object.fromEntries(ASX_TICKERS.map((t) => [t, bySymbol[`${t}.AX`]])),
    asxConstituents: mergedAsxConstituents.length > 0 ? mergedAsxConstituents : fallbackAsxConstituents,
    indices: {
      asx200: bySymbol["^AXJO"],
      allOrds: bySymbol["^AORD"],
      audUsd: bySymbol["AUDUSD=X"],
      vix: bySymbol["^VIX"],
    },
    crypto: {
      btc: bySymbol["BTC-USD"],
      eth: bySymbol["ETH-USD"],
      sol: bySymbol["SOL-USD"] ?? nullQuote("SOL-USD"),
      gold: { symbol: "XAUAUD", price: goldAudPrice, prevClose: goldAudPrevClose, yearHigh: null, yearLow: null, pe: null, divYield: null, name: "Gold" },
    },
  };

  quotesCache = { data: payload, expiresAt: now + QUOTES_CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
