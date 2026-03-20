import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const ASX_TICKERS = ["BHP","CBA","CSL","WES","ANZ","NAB","FMG","RIO","MQG","WBC","WDS","TLS","ALL","GMG","STO"];

interface QuoteData {
  symbol: string;
  price: number | null;
  prevClose: number | null;
  yearHigh: number | null;
  yearLow: number | null;
}

async function fetchQuote(symbol: string): Promise<QuoteData> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)", Accept: "application/json" },
    });
    clearTimeout(timeout);
    if (!response.ok) return { symbol, price: null, prevClose: null, yearHigh: null, yearLow: null };

    const data = await response.json() as Record<string, unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any)?.chart?.result?.[0];
    const meta = result?.meta ?? {};
    const closes: number[] = ((result?.indicators?.quote?.[0]?.close ?? []) as (number | null)[])
      .map((c) => (typeof c === "number" && Number.isFinite(c) && c > 0 ? c : null))
      .filter((c): c is number => c !== null);

    const price: number | null = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
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

    return { symbol, price, prevClose, yearHigh, yearLow };
  } catch {
    return { symbol, price: null, prevClose: null, yearHigh: null, yearLow: null };
  }
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

  const asxSymbols = ASX_TICKERS.map((t) => `${t}.AX`);
  const extraSymbols = ["^AXJO", "^AORD", "AUDUSD=X", "^VIX", "BTC-USD", "ETH-USD", "XAUUSD=X"];
  const allSymbols = [...asxSymbols, ...extraSymbols];

  const quotes = await Promise.all(allSymbols.map(fetchQuote));
  const bySymbol: Record<string, QuoteData> = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  // Convert gold from USD to AUD
  const goldUsd = bySymbol["XAUUSD=X"];
  const audUsdQ = bySymbol["AUDUSD=X"];
  let goldAudPrice: number | null = null;
  let goldAudPrevClose: number | null = null;
  if (goldUsd.price && audUsdQ.price && audUsdQ.price > 0) {
    goldAudPrice = goldUsd.price / audUsdQ.price;
    if (goldUsd.prevClose && audUsdQ.prevClose && audUsdQ.prevClose > 0) {
      goldAudPrevClose = goldUsd.prevClose / audUsdQ.prevClose;
    }
  }

  return NextResponse.json(
    {
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
        gold: { symbol: "XAUAUD", price: goldAudPrice, prevClose: goldAudPrevClose, yearHigh: null, yearLow: null },
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
