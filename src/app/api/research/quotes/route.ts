import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

const ASX_TICKERS = ["BHP","CBA","CSL","WES","ANZ","NAB","FMG","RIO","MQG","WBC","WDS","TLS","ALL","GMG","STO"];


const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)",
  Accept: "application/json",
};
const DEMO_CACHE_HEADERS = { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=900" };
const DEFAULT_HEADERS = { "Cache-Control": "no-store" };

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
    oil: QuoteData;
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

      /*
       * Previous close for the day move.
       *
       * meta.previousClose is the actual prior trading-day close and is what
       * pairs with regularMarketPrice for "today". Prefer it. The year-of-bars
       * series is here for the 52-week range; its second-to-last close is only a
       * safe stand-in when today's bar is already in the series — out of market
       * hours it can be two days old (that is what made the ASX 200 read -2.46%
       * instead of a real day). meta.chartPreviousClose is the close from a year
       * ago, so it stays last.
       */
      const prevClose: number | null =
        typeof meta.previousClose === "number" && meta.previousClose > 0 ? meta.previousClose
        : closes.length > 1 ? closes[closes.length - 2]
        : typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose
        : null;
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
    // All authenticated users may fetch market data; client-side gating controls what they see
  }

  // Serve from cache if fresh — all users share one fetch cycle
  const now = Date.now();
  if (quotesCache && now < quotesCache.expiresAt) {
    return NextResponse.json(quotesCache.data, { headers: isDemo ? DEMO_CACHE_HEADERS : DEFAULT_HEADERS });
  }

  const extraSymbols = ["^AXJO", "^AORD", "AUDUSD=X", "^VIX", "BTC-USD", "ETH-USD", "SOL-USD", "XAUUSD=X", "GC=F", "CL=F"];
  const asxSymbols = ASX_TICKERS.map((t) => `${t}.AX`);

  // All market data comes from free, key-less sources: Yahoo Finance for ASX
  // stocks, indices, gold and oil (its daily series gives a real previous close,
  // so day changes are accurate), CoinGecko for crypto, and Frankfurter (ECB)
  // for AUD/USD. No paid provider.
  const [asxQuotes, extraQuotes, coingecko, frankfurterAudUsd] = await Promise.all([
    Promise.all(asxSymbols.map(fetchQuote)),
    Promise.all(extraSymbols.map(fetchQuote)),
    fetchCryptoFromCoinGecko(),
    fetchAudUsdFromFrankfurter(),
  ]);

  const bySymbol: Record<string, QuoteData> = Object.fromEntries(
    [...extraQuotes, ...asxQuotes].map((q) => [q.symbol, q]),
  );
  for (const t of ASX_TICKERS) {
    const sym = `${t}.AX`;
    if (!bySymbol[sym]) bySymbol[sym] = nullQuote(sym);
  }

  // Crypto from CoinGecko (free)
  if (coingecko.btc) bySymbol["BTC-USD"] = coingecko.btc;
  if (coingecko.eth) bySymbol["ETH-USD"] = coingecko.eth;
  if (coingecko.sol) bySymbol["SOL-USD"] = coingecko.sol;

  // AUD/USD from Frankfurter (ECB), keeping Yahoo's previous close for the day move.
  if (frankfurterAudUsd !== null) {
    bySymbol["AUDUSD=X"] = {
      ...(bySymbol["AUDUSD=X"] ?? nullQuote("AUDUSD=X")),
      symbol: "AUDUSD=X",
      price: frankfurterAudUsd,
      prevClose: bySymbol["AUDUSD=X"]?.prevClose ?? frankfurterAudUsd,
      name: bySymbol["AUDUSD=X"]?.name ?? "AUD/USD",
    };
  }

  // Gold stays in USD so the live cards match the macro gold chart (GC=F / XAUUSD context).
  const goldUsd = bySymbol["XAUUSD=X"]?.price ? bySymbol["XAUUSD=X"] : bySymbol["GC=F"];

  // ASX constituents straight from the Yahoo quotes. Sector is filled in by the
  // page's own ticker→sector map; market cap, PE and dividend are not in the free
  // feed, so they are left null (the UI shows "—").
  const asxConstituents: AsxConstituentQuote[] = ASX_TICKERS.map((ticker) => {
    const q = bySymbol[`${ticker}.AX`] ?? nullQuote(`${ticker}.AX`);
    return { ...q, name: q.name ?? ticker, marketCap: null, sector: null, volume: null, exchange: "ASX" };
  });

  const payload: QuotesPayload = {
    fetchedAt: new Date().toISOString(),
    asx: Object.fromEntries(ASX_TICKERS.map((t) => [t, bySymbol[`${t}.AX`]])),
    asxConstituents,
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
      gold: {
        symbol: "XAUUSD",
        price: goldUsd?.price ?? null,
        prevClose: goldUsd?.prevClose ?? null,
        yearHigh: goldUsd?.yearHigh ?? null,
        yearLow: goldUsd?.yearLow ?? null,
        pe: null,
        divYield: null,
        name: "Gold",
      },
      oil: bySymbol["CL=F"] ?? { symbol: "CL=F", price: null, prevClose: null, yearHigh: null, yearLow: null, pe: null, divYield: null, name: "WTI Crude" },
    },
  };

  quotesCache = { data: payload, expiresAt: now + QUOTES_CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: isDemo ? DEMO_CACHE_HEADERS : DEFAULT_HEADERS });
}
