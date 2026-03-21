import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

// Cache per range: { timestamps: number[], closes: number[], high: number, low: number }
const cache: Record<string, { data: ChartPayload; expiresAt: number }> = {};

interface ChartPayload {
  timestamps: number[];
  closes: number[];
  high: number;
  low: number;
  range: string;
}

const RANGE_CONFIG: Record<string, { interval: string; range: string; ttlMs: number }> = {
  "1d": { interval: "5m",  range: "1d",  ttlMs: 2 * 60 * 1000 },
  "1w": { interval: "1h",  range: "5d",  ttlMs: 10 * 60 * 1000 },
  "1m": { interval: "1d",  range: "1mo", ttlMs: 15 * 60 * 1000 },
  "3m": { interval: "1d",  range: "3mo", ttlMs: 15 * 60 * 1000 },
  "6m": { interval: "1d",  range: "6mo", ttlMs: 30 * 60 * 1000 },
  "1y": { interval: "1wk", range: "1y",  ttlMs: 60 * 60 * 1000 },
};

async function fetchChart(range: string): Promise<ChartPayload | null> {
  const cfg = RANGE_CONFIG[range];
  if (!cfg) return null;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EAXJO?interval=${cfg.interval}&range=${cfg.range}&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return null;

  const timestamps: number[] = result.timestamp ?? [];
  const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

  // Filter out nulls (market closed gaps)
  const pairs: [number, number][] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) pairs.push([timestamps[i], closes[i]]);
  }
  if (!pairs.length) return null;

  const allCloses = pairs.map((p) => p[1]);
  return {
    timestamps: pairs.map((p) => p[0]),
    closes: allCloses,
    high: Math.max(...allCloses),
    low: Math.min(...allCloses),
    range,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const demo = searchParams.get("demo") === "1";
  const range = searchParams.get("range") ?? "6m";

  if (!RANGE_CONFIG[range]) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  if (!demo) {
    const sessionUser = await getAuthenticatedUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const entitlements = readUserEntitlements(sessionUser.id);
    if (entitlements.planTier === "none") {
      return NextResponse.json({ error: "Research requires a paid plan" }, { status: 403 });
    }
  }

  const now = Date.now();
  const cached = cache[range];
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const data = await fetchChart(range);
    if (!data) {
      return NextResponse.json({ error: "Failed to fetch chart data" }, { status: 502 });
    }
    cache[range] = { data, expiresAt: now + RANGE_CONFIG[range].ttlMs };
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Chart fetch failed" }, { status: 502 });
  }
}
