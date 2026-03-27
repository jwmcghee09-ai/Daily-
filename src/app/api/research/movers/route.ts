import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const FMP_MARKET_BASE = "https://financialmodelingprep.com/api/v3/stock_market";

// 10-minute cache
let cache: { data: MoversPayload; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface Mover {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  sparkline: number[];
}

interface MoversPayload {
  gainers: Mover[];
  losers: Mover[];
  mostActive: Mover[];
  fetchedAt: string;
}

function parsePct(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchFmpMovers(listType: "gainers" | "losers" | "actives", apiKey: string, count = 8): Promise<Mover[]> {
  if (!apiKey) return [];
  const url = `${FMP_MARKET_BASE}/${listType}?apikey=${apiKey}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];
    return data
      .slice(0, count)
      .map((r) => {
        if (!r?.symbol) return null;
        const price = typeof r.price === "number" ? r.price : Number(r.price);
        if (!Number.isFinite(price)) return null;
        return {
          symbol: r.symbol as string,
          name: (r.shortName ?? r.longName ?? r.symbol) as string,
          price,
          changePct: parsePct(r.changesPercentage ?? r.changePercentage ?? r.changePercent),
          sparkline: [] as number[],
        };
      })
      .filter((m): m is Mover => m !== null);
  } catch {
    return [];
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

  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  const apiKey = process.env.FMP_API_KEY ?? "";
  const [gainers, losers, mostActive] = await Promise.all([
    fetchFmpMovers("gainers", apiKey),
    fetchFmpMovers("losers", apiKey),
    fetchFmpMovers("actives", apiKey),
  ]);

  const payload: MoversPayload = {
    gainers,
    losers,
    mostActive,
    fetchedAt: new Date().toISOString(),
  };

  if (gainers.length > 0 || losers.length > 0 || mostActive.length > 0) {
    cache = { data: payload, expiresAt: now + CACHE_TTL_MS };
  }

  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
