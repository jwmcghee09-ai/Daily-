import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

// Cache per range+symbol: { timestamps: number[], closes: number[], high: number, low: number }
const cache: Record<string, { data: ChartPayload; expiresAt: number }> = {};

interface ChartPayload {
  timestamps: number[];
  closes: number[];
  high: number;
  low: number;
  range: string;
  symbol: string;
}

const RANGE_CONFIG: Record<string, { interval: string; range: string; ttlMs: number }> = {
  "1d": { interval: "5m",  range: "1d",  ttlMs: 2 * 60 * 1000 },
  "1w": { interval: "1h",  range: "5d",  ttlMs: 10 * 60 * 1000 },
  "1m": { interval: "1d",  range: "1mo", ttlMs: 15 * 60 * 1000 },
  "3m": { interval: "1d",  range: "3mo", ttlMs: 15 * 60 * 1000 },
  "6m": { interval: "1d",  range: "6mo", ttlMs: 30 * 60 * 1000 },
  "1y": { interval: "1wk", range: "1y",  ttlMs: 60 * 60 * 1000 },
};

// Allowed symbols mapped to Yahoo Finance tickers
const SYMBOL_MAP: Record<string, string> = {
  asx200:  "%5EAXJO",
  btc:     "BTC-USD",
  eth:     "ETH-USD",
  sol:     "SOL-USD",
  gold:    "GC%3DF",
  oil:     "CL%3DF",
  aud:     "AUDUSD%3DX",
  vix:     "%5EVIX",
};

function normalizeDynamicSymbol(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toUpperCase();
  if (!/^[A-Z0-9.^=\-]+$/.test(trimmed)) return null;
  if (trimmed.endsWith(".AX") || trimmed.startsWith("^") || trimmed.includes("=") || trimmed.includes("-")) {
    return encodeURIComponent(trimmed);
  }
  return encodeURIComponent(`${trimmed}.AX`);
}

async function fetchChart(range: string, yahooSymbol: string): Promise<ChartPayload | null> {
  const cfg = RANGE_CONFIG[range];
  if (!cfg) return null;

  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  for (const host of hosts) {
    try {
      const url = `https://${host}/v8/finance/chart/${yahooSymbol}?interval=${cfg.interval}&range=${cfg.range}&includePrePost=false`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;

      const timestamps: number[] = result.timestamp ?? [];
      const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

      // Filter out nulls (market closed gaps)
      const pairs: [number, number][] = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) pairs.push([timestamps[i], closes[i]]);
      }
      if (!pairs.length) continue;

      const allCloses = pairs.map((p) => p[1]);
      return {
        timestamps: pairs.map((p) => p[0]),
        closes: allCloses,
        high: Math.max(...allCloses),
        low: Math.min(...allCloses),
        range,
        symbol: yahooSymbol,
      };
    } catch {
      continue;
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const demo = searchParams.get("demo") === "1";
  const range = searchParams.get("range") ?? "6m";
  const symbolParam = searchParams.get("symbol");
  const symbolKey = (symbolParam ?? "asx200").toLowerCase();
  const tickerParam = searchParams.get("ticker");

  if (!RANGE_CONFIG[range]) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  const dynamicSymbol = normalizeDynamicSymbol(tickerParam ?? (SYMBOL_MAP[symbolKey] ? null : symbolParam));
  const yahooSymbol = dynamicSymbol ?? SYMBOL_MAP[symbolKey];
  if (!yahooSymbol) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  if (!demo) {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const entitlements = readUserEntitlements(sessionUser.id);
    if (entitlements.planTier === "none") {
      return NextResponse.json({ error: "Research requires a paid plan" }, { status: 403 });
    }
  }

  const cacheKey = `${dynamicSymbol ?? symbolKey}:${range}`;
  const now = Date.now();
  const cached = cache[cacheKey];
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const data = await fetchChart(range, yahooSymbol);
    if (!data) {
      return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 502 });
    }
    cache[cacheKey] = { data, expiresAt: now + RANGE_CONFIG[range].ttlMs };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Chart fetch failed" }, { status: 502 });
  }
}
