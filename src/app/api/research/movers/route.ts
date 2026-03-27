import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)",
  Accept: "application/json",
};

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

async function fetchSparkline(symbol: string): Promise<number[]> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal, headers: YAHOO_HEADERS });
    clearTimeout(timeout);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const closes = ((data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []) as Array<number | null>)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
    return closes.slice(-10);
  } catch {
    return [];
  }
}

async function fetchScreener(scrId: string, count = 5): Promise<Mover[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=${count}&region=US&lang=en-US`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    const res = await fetch(url, { cache: "no-store", signal: controller.signal, headers: YAHOO_HEADERS });
    clearTimeout(timeout);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const quotes: unknown[] = data?.finance?.result?.[0]?.quotes ?? [];
    const movers: Mover[] = quotes
      .map((q) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = q as any;
        if (!r?.symbol || typeof r.regularMarketPrice !== "number") return null;
        return {
          symbol: r.symbol as string,
          name: (r.shortName ?? r.longName ?? r.symbol) as string,
          price: r.regularMarketPrice as number,
          changePct: typeof r.regularMarketChangePercent === "number" ? r.regularMarketChangePercent : 0,
          sparkline: [] as number[],
        };
      })
      .filter((m): m is Mover => m !== null);

    const sparklines = await Promise.allSettled(movers.map((m) => fetchSparkline(m.symbol)));
    return movers.map((m, index) => ({
      ...m,
      sparkline: sparklines[index]?.status === "fulfilled" ? sparklines[index].value : [],
    }));
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

  const [gainers, losers, mostActive] = await Promise.all([
    fetchScreener("day_gainers"),
    fetchScreener("day_losers"),
    fetchScreener("most_actives"),
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
