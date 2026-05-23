import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — chart data doesn't change often
let cache: { closes: number[]; expiresAt: number } | null = null;

export async function GET(request: NextRequest) {
  const isDemo = request.nextUrl.searchParams.get("demo") === "1";
  if (!isDemo) {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  if (cache && Date.now() < cache.expiresAt) {
    return NextResponse.json({ closes: cache.closes }, { headers: { "Cache-Control": "public, max-age=3600" } });
  }

  const closes = await fetchASX200Closes();
  if (closes.length > 0) {
    cache = { closes, expiresAt: Date.now() + CACHE_TTL_MS };
  }

  return NextResponse.json(
    { closes },
    { headers: { "Cache-Control": closes.length > 0 ? "public, max-age=3600" : "no-store" } }
  );
}

async function fetchASX200Closes(): Promise<number[]> {
  for (const host of ["query2.finance.yahoo.com", "query1.finance.yahoo.com"]) {
    try {
      const url = `https://${host}/v8/finance/chart/%5EAXJO?interval=1d&range=1mo`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, {
        cache: "no-store",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)", Accept: "application/json" },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json = (await res.json()) as any;
      const raw: (number | null)[] = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      const closes = raw.filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0);
      if (closes.length > 0) return closes;
    } catch {
      continue;
    }
  }
  return [];
}
