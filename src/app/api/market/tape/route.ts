import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60;

interface YahooQuoteResult {
  meta?: {
    regularMarketPrice?: number;
    previousClose?: number;
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooQuoteResult[];
  };
}

const TAPE_SYMBOLS: Array<{ label: string; yahoo: string; fmt: "price" | "k" | "fx" }> = [
  { label: "BHP",     yahoo: "BHP.AX",   fmt: "price" },
  { label: "CBA",     yahoo: "CBA.AX",   fmt: "price" },
  { label: "CSL",     yahoo: "CSL.AX",   fmt: "price" },
  { label: "MQG",     yahoo: "MQG.AX",   fmt: "price" },
  { label: "FMG",     yahoo: "FMG.AX",   fmt: "price" },
  { label: "AUD/USD", yahoo: "AUDUSD=X", fmt: "fx"    },
  { label: "GOLD",    yahoo: "GC=F",     fmt: "price" },
  { label: "WTI",     yahoo: "CL=F",     fmt: "price" },
  { label: "BTC",     yahoo: "BTC-USD",  fmt: "k"     },
  { label: "ETH",     yahoo: "ETH-USD",  fmt: "price" },
  { label: "VIX",     yahoo: "^VIX",     fmt: "price" },
];

function formatPrice(value: number, fmt: string): string {
  if (fmt === "k") {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
  }
  if (fmt === "fx") {
    return value.toFixed(4);
  }
  if (value >= 1000) {
    return value.toLocaleString("en-AU", { maximumFractionDigits: 0 });
  }
  return value.toFixed(2);
}

function formatDelta(current: number, prev: number): string {
  if (!prev || prev === 0) return "0.00%";
  const pct = ((current - prev) / prev) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

async function fetchQuote(symbol: string): Promise<{ price: number; prevClose: number } | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as YahooChartResponse;
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.previousClose ?? meta.regularMarketPrice);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { price, prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : price };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const results = await Promise.allSettled(
    TAPE_SYMBOLS.map(async (sym) => {
      const quote = await fetchQuote(sym.yahoo);
      return { sym, quote };
    }),
  );

  const tape = results.map((result, i) => {
    const sym = TAPE_SYMBOLS[i];
    if (result.status === "fulfilled" && result.value.quote) {
      const { price, prevClose } = result.value.quote;
      return {
        label: sym.label,
        price: formatPrice(price, sym.fmt),
        delta: formatDelta(price, prevClose),
        tone: price >= prevClose ? "up" : "dn",
      };
    }
    return null;
  }).filter(Boolean);

  return NextResponse.json({ tape }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
