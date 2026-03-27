import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const FMP_BASE = "https://financialmodelingprep.com/api";
const CACHE_TTL_MS = 30 * 60 * 1000;

let cache: { data: FmpPayload; expiresAt: number } | null = null;

interface IndexQuote { symbol: string; name: string; price: number | null; changePct: number | null; }
interface CommodityQuote { symbol: string; name: string; price: number | null; changePct: number | null; unit: string; }
interface FxRate { pair: string; label: string; rate: number | null; changePct: number | null; }
interface EconEvent { date: string; country: string; event: string; actual: string | null; estimate: string | null; prior: string | null; impact: string; }
interface EarningsEvent { date: string; symbol: string; name: string; epsEstimate: number | null; }
interface SectorPerf { sector: string; changePct: number; }
interface AnalystRating { symbol: string; rating: string; targetConsensus: number | null; targetLow: number | null; targetHigh: number | null; }
interface FmpNewsItem { title: string; publishedDate: string; url: string; symbol: string; site: string; }

interface FmpPayload {
  fetchedAt: string;
  indices: IndexQuote[];
  commodities: CommodityQuote[];
  fx: FxRate[];
  economicCalendar: EconEvent[];
  earningsCalendar: EarningsEvent[];
  sectorPerformance: SectorPerf[];
  analystRatings: AnalystRating[];
  news: FmpNewsItem[];
}

const KEY = process.env.FMP_API_KEY ?? "";

async function fmpGet<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  if (!KEY) return null;
  const url = new URL(`${FMP_BASE}${path}`);
  url.searchParams.set("apikey", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url.toString(), { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---- Indices ----
// FMP uses these symbols in /v3/quotes/index
const INDEX_MAP: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones",
  "^FTSE": "FTSE 100", "^GDAXI": "DAX", "^N225": "Nikkei 225",
  "^HSI": "Hang Seng", "^AXJO": "ASX 200", "^FCHI": "CAC 40",
};

async function fetchIndices(): Promise<IndexQuote[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/quotes/index");
  if (!Array.isArray(data)) return [];
  const out: IndexQuote[] = [];
  for (const sym of Object.keys(INDEX_MAP)) {
    // FMP may omit the ^ prefix in some responses — try both
    const q = data.find((d) => d.symbol === sym || d.symbol === sym.replace("^", ""));
    if (!q?.price) continue;
    out.push({
      symbol: sym,
      name: INDEX_MAP[sym],
      price: q.price ?? null,
      changePct: q.changesPercentage ?? q.changePercentage ?? null,
    });
  }
  return out;
}

// ---- Commodities ----
// Symbols verified against FMP /v3/quotes/commodity
const COMMODITY_WANT: { syms: string[]; name: string; unit: string }[] = [
  { syms: ["CLUSD", "CLF", "CL"],         name: "Crude Oil (WTI)",  unit: "USD/bbl" },
  { syms: ["BZUSD", "BZF", "BZ"],         name: "Brent Crude",      unit: "USD/bbl" },
  { syms: ["GCUSD", "GCF", "GC"],         name: "Gold",             unit: "USD/oz"  },
  { syms: ["SIUSD", "SIF", "SI"],         name: "Silver",           unit: "USD/oz"  },
  { syms: ["HGUSD", "HGF", "HG"],         name: "Copper",           unit: "USD/lb"  },
  { syms: ["NGUSD", "NGF", "NG"],         name: "Natural Gas",      unit: "USD/MMBtu" },
  { syms: ["ZWUSD", "ZWF", "ZW"],         name: "Wheat",            unit: "USD/bu"  },
  { syms: ["ZSUSD", "ZSF", "ZS"],         name: "Soybeans",         unit: "USD/bu"  },
];

async function fetchCommodities(): Promise<CommodityQuote[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/quotes/commodity");
  if (!Array.isArray(data)) return [];
  const out: CommodityQuote[] = [];
  for (const want of COMMODITY_WANT) {
    const q = data.find((d) => want.syms.includes(d.symbol));
    if (!q?.price) continue;
    out.push({ symbol: q.symbol, name: want.name, unit: want.unit, price: q.price, changePct: q.changesPercentage ?? q.changePercentage ?? null });
  }
  return out;
}

// ---- FX: compute AUD crosses from base rates ----
async function fetchFx(): Promise<FxRate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/fx");
  if (!Array.isArray(data)) return [];

  // Build lookup by ticker (case-insensitive, strip slash)
  const byTicker: Record<string, { bid: number; changes: number }> = {};
  for (const d of data) {
    if (!d.ticker) continue;
    byTicker[d.ticker.toUpperCase()] = { bid: d.bid ?? d.ask ?? 0, changes: d.changes ?? 0 };
  }

  // Helper: get rate for a pair, try both directions
  const rate = (t: string) => byTicker[t.toUpperCase()] ?? null;

  const audUsd = rate("AUDUSD")?.bid ?? 0;

  const pairs: { label: string; calc: () => { r: number | null; c: number | null } }[] = [
    { label: "AUD/USD", calc: () => { const q = rate("AUDUSD"); return { r: q?.bid ?? null, c: q?.changes ?? null }; } },
    { label: "AUD/EUR", calc: () => { const eur = rate("EURUSD"); return eur && audUsd ? { r: audUsd / eur.bid, c: null } : { r: null, c: null }; } },
    { label: "AUD/GBP", calc: () => { const gbp = rate("GBPUSD"); return gbp && audUsd ? { r: audUsd / gbp.bid, c: null } : { r: null, c: null }; } },
    { label: "AUD/JPY", calc: () => { const jpy = rate("USDJPY"); return jpy && audUsd ? { r: audUsd * jpy.bid, c: null } : { r: null, c: null }; } },
    { label: "AUD/CNY", calc: () => { const cny = rate("USDCNY"); return cny && audUsd ? { r: audUsd * cny.bid, c: null } : { r: null, c: null }; } },
    { label: "AUD/NZD", calc: () => { const q = rate("AUDNZD"); return { r: q?.bid ?? null, c: q?.changes ?? null }; } },
    { label: "AUD/CAD", calc: () => { const q = rate("AUDCAD"); return { r: q?.bid ?? null, c: q?.changes ?? null }; } },
    { label: "AUD/SGD", calc: () => { const sgd = rate("USDSGD"); return sgd && audUsd ? { r: audUsd * sgd.bid, c: null } : { r: null, c: null }; } },
  ];

  return pairs.map(({ label, calc }) => {
    const { r, c } = calc();
    return { pair: label.replace("/", ""), label, rate: r && r > 0 ? r : null, changePct: c };
  });
}

// ---- Economic Calendar ----
async function fetchEconomicCalendar(): Promise<EconEvent[]> {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/economic_calendar", { from, to });
  if (!Array.isArray(data)) return [];
  return data
    .filter((e) => ["AU", "US", "CN", "GB", "EU", "JP"].includes(e.country))
    .filter((e) => e.impact === "High" || e.impact === "Medium")
    .slice(0, 30)
    .map((e) => ({
      date: e.date ?? "",
      country: e.country ?? "",
      event: e.event ?? "",
      actual: e.actual != null ? String(e.actual) : null,
      estimate: e.estimate != null ? String(e.estimate) : null,
      prior: e.previous != null ? String(e.previous) : null,
      impact: e.impact ?? "Low",
    }));
}

// ---- Earnings Calendar ----
const WATCHLIST = ["BHP.AX","CBA.AX","CSL.AX","WES.AX","ANZ.AX","NAB.AX","RIO.AX","MQG.AX","AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA"];

async function fetchEarningsCalendar(): Promise<EarningsEvent[]> {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/earning_calendar", { from, to });
  if (!Array.isArray(data)) return [];
  const set = new Set(WATCHLIST);
  return data
    .filter((e) => set.has(e.symbol))
    .slice(0, 20)
    .map((e) => ({ date: e.date ?? "", symbol: e.symbol ?? "", name: e.name ?? e.symbol ?? "", epsEstimate: typeof e.epsEstimated === "number" ? e.epsEstimated : null }));
}

// ---- Sector Performance ----
async function fetchSectorPerformance(): Promise<SectorPerf[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/sector_performance");
  if (!Array.isArray(data)) return [];
  return data
    .map((s) => ({ sector: s.sector ?? "", changePct: parseFloat(String(s.changesPercentage ?? "0").replace("%", "")) }))
    .sort((a, b) => b.changePct - a.changePct);
}

// ---- Analyst Ratings ----
async function fetchAnalystRatings(): Promise<AnalystRating[]> {
  const symbols = ["BHP.AX", "CBA.AX", "CSL.AX", "WES.AX", "ANZ.AX", "RIO.AX"];
  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const [ratingArr, targetArr] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fmpGet<any[]>(`/v3/rating/${encodeURIComponent(sym)}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fmpGet<any[]>(`/v3/price-target-consensus/${encodeURIComponent(sym)}`),
      ]);
      const r = Array.isArray(ratingArr) ? ratingArr[0] : null;
      const t = Array.isArray(targetArr) ? targetArr[0] : null;
      return {
        symbol: sym.replace(".AX", ""),
        rating: r?.rating ?? r?.ratingRecommendation ?? "—",
        targetConsensus: t?.targetConsensus ?? null,
        targetLow: t?.targetLow ?? null,
        targetHigh: t?.targetHigh ?? null,
      } as AnalystRating;
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<AnalystRating> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---- News ----
async function fetchFmpNews(): Promise<FmpNewsItem[]> {
  const tickers = WATCHLIST.join(",");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/stock_news", { tickers, limit: "20" });
  if (!Array.isArray(data)) return [];
  return data.map((n) => ({ title: n.title ?? "", publishedDate: n.publishedDate ?? "", url: n.url ?? "", symbol: n.symbol ?? "", site: n.site ?? "" }));
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

  if (!KEY) return NextResponse.json({ error: "FMP_API_KEY not configured.", keyPresent: false }, { status: 503 });

  // Debug mode: return raw FMP responses for troubleshooting
  if (request.nextUrl.searchParams.get("debug") === "1") {
    const keyPreview = KEY.slice(0, 6) + "…";
    // Test a simple known endpoint first
    const testUrl = `${FMP_BASE}/v3/stock/list?apikey=${KEY}`;
    let testStatus = 0;
    let testBody = "";
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(testUrl, { cache: "no-store", signal: ctrl.signal });
      testStatus = r.status;
      const text = await r.text();
      testBody = text.slice(0, 200);
    } catch (e) {
      testBody = String(e);
    }

    const [idx, comm, fx] = await Promise.all([
      fmpGet<unknown[]>("/v3/quotes/index"),
      fmpGet<unknown[]>("/v3/quotes/commodity"),
      fmpGet<unknown[]>("/v3/fx"),
    ]);
    return NextResponse.json({
      keyPreview,
      testStatus,
      testBody,
      indexSymbols: Array.isArray(idx) ? idx.slice(0, 5).map((d: unknown) => (d as Record<string, unknown>).symbol) : "failed",
      commSymbols:  Array.isArray(comm) ? comm.slice(0, 10).map((d: unknown) => (d as Record<string, unknown>).symbol) : "failed",
      fxTickers:    Array.isArray(fx)   ? fx.slice(0, 10).map((d: unknown) => (d as Record<string, unknown>).ticker) : "failed",
    });
  }

  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  const [indices, commodities, fx, economicCalendar, earningsCalendar, sectorPerformance, analystRatings, news] =
    await Promise.all([
      fetchIndices(),
      fetchCommodities(),
      fetchFx(),
      fetchEconomicCalendar(),
      fetchEarningsCalendar(),
      fetchSectorPerformance(),
      fetchAnalystRatings(),
      fetchFmpNews(),
    ]);

  const payload: FmpPayload = {
    fetchedAt: new Date().toISOString(),
    indices, commodities, fx, economicCalendar, earningsCalendar, sectorPerformance, analystRatings, news,
  };

  cache = { data: payload, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
