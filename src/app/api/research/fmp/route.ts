import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const FMP_BASE = "https://financialmodelingprep.com/api";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

let cache: { data: FmpPayload; expiresAt: number } | null = null;

interface IndexQuote { symbol: string; name: string; price: number | null; change: number | null; changePct: number | null; }
interface CommodityQuote { symbol: string; name: string; price: number | null; change: number | null; changePct: number | null; unit: string; }
interface FxRate { pair: string; label: string; rate: number | null; change: number | null; }
interface EconEvent { date: string; country: string; event: string; actual: string | null; estimate: string | null; prior: string | null; impact: string; }
interface EarningsEvent { date: string; symbol: string; name: string; epsEstimate: number | null; revenueEstimate: number | null; }
interface SectorPerf { sector: string; changePct: number; }
interface AnalystRating { symbol: string; rating: string; targetHigh: number | null; targetLow: number | null; targetConsensus: number | null; buy: number; hold: number; sell: number; }
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
const INDEX_SYMBOLS = ["^GSPC", "^IXIC", "^DJI", "^FTSE", "^GDAXI", "^N225", "^HSI", "000001.SS", "^AXJO"];
const INDEX_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones", "^FTSE": "FTSE 100",
  "^GDAXI": "DAX", "^N225": "Nikkei 225", "^HSI": "Hang Seng", "000001.SS": "Shanghai", "^AXJO": "ASX 200",
};

async function fetchIndices(): Promise<IndexQuote[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/quotes/index");
  if (!Array.isArray(data)) return [];
  return INDEX_SYMBOLS
    .map((sym) => {
      const q = data.find((d) => d.symbol === sym);
      if (!q) return null;
      return { symbol: sym, name: INDEX_NAMES[sym] ?? q.name ?? sym, price: q.price ?? null, change: q.change ?? null, changePct: q.changesPercentage ?? null };
    })
    .filter((x): x is IndexQuote => x !== null);
}

// ---- Commodities ----
const COMMODITY_MAP: Record<string, { name: string; unit: string }> = {
  CLUSD: { name: "Crude Oil (WTI)", unit: "USD/bbl" },
  BZUSD: { name: "Brent Crude", unit: "USD/bbl" },
  GCUSD: { name: "Gold", unit: "USD/oz" },
  SIUSD: { name: "Silver", unit: "USD/oz" },
  HGUSD: { name: "Copper", unit: "USD/lb" },
  NGUSD: { name: "Natural Gas", unit: "USD/MMBtu" },
  ZSUSD: { name: "Soybeans", unit: "USD/bu" },
  ZWUSD: { name: "Wheat", unit: "USD/bu" },
  LBNUSD: { name: "Lumber", unit: "USD/MBF" },
};

async function fetchCommodities(): Promise<CommodityQuote[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/quotes/commodity");
  if (!Array.isArray(data)) return [];
  const out: CommodityQuote[] = [];
  for (const sym of Object.keys(COMMODITY_MAP)) {
    const q = data.find((d) => d.symbol === sym);
    if (!q) continue;
    const meta = COMMODITY_MAP[sym];
    out.push({ symbol: sym, name: meta.name, unit: meta.unit, price: q.price ?? null, change: q.change ?? null, changePct: q.changesPercentage ?? null });
  }
  return out;
}

// ---- FX ----
const AUD_PAIRS = [
  { pair: "AUDUSD", label: "AUD/USD" }, { pair: "AUDEUR", label: "AUD/EUR" },
  { pair: "AUDGBP", label: "AUD/GBP" }, { pair: "AUDJPY", label: "AUD/JPY" },
  { pair: "AUDCNY", label: "AUD/CNY" }, { pair: "AUDNZD", label: "AUD/NZD" },
  { pair: "AUDCAD", label: "AUD/CAD" }, { pair: "AUDSGD", label: "AUD/SGD" },
];

async function fetchFx(): Promise<FxRate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/fx");
  if (!Array.isArray(data)) return [];
  return AUD_PAIRS.map(({ pair, label }) => {
    const q = data.find((d) => d.ticker === pair || d.name === pair);
    return { pair, label, rate: q?.bid ?? q?.ask ?? null, change: q?.changes ?? null };
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
    .filter((e) => (e.impact === "High" || e.impact === "Medium"))
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
const ASX_TICKERS = ["BHP.AX","CBA.AX","CSL.AX","WES.AX","ANZ.AX","NAB.AX","FMG.AX","RIO.AX","MQG.AX","WBC.AX"];
const US_TICKERS  = ["AAPL","MSFT","NVDA","GOOGL","META","AMZN","TSLA","JPM","BAC"];

async function fetchEarningsCalendar(): Promise<EarningsEvent[]> {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/earning_calendar", { from, to });
  if (!Array.isArray(data)) return [];
  const watchlist = new Set([...ASX_TICKERS, ...US_TICKERS]);
  return data
    .filter((e) => watchlist.has(e.symbol))
    .slice(0, 20)
    .map((e) => ({
      date: e.date ?? "",
      symbol: e.symbol ?? "",
      name: e.name ?? e.symbol ?? "",
      epsEstimate: typeof e.epsEstimated === "number" ? e.epsEstimated : null,
      revenueEstimate: typeof e.revenueEstimated === "number" ? e.revenueEstimated : null,
    }));
}

// ---- Sector Performance ----
async function fetchSectorPerformance(): Promise<SectorPerf[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/sector_performance");
  if (!Array.isArray(data)) return [];
  return data.map((s) => ({ sector: s.sector ?? "", changePct: parseFloat(s.changesPercentage ?? "0") }))
    .sort((a, b) => b.changePct - a.changePct);
}

// ---- Analyst Ratings ----
async function fetchAnalystRatings(): Promise<AnalystRating[]> {
  const symbols = ["BHP.AX", "CBA.AX", "CSL.AX", "WES.AX", "ANZ.AX", "RIO.AX"];
  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [rating, target] = await Promise.all([
        fmpGet<any[]>(`/v3/rating/${sym}`),
        fmpGet<any[]>(`/v3/price-target-consensus/${sym}`),
      ]);
      const r = Array.isArray(rating) ? rating[0] : null;
      const t = Array.isArray(target) ? target[0] : null;
      return {
        symbol: sym.replace(".AX", ""),
        rating: r?.rating ?? "—",
        targetHigh: t?.targetHigh ?? null,
        targetLow: t?.targetLow ?? null,
        targetConsensus: t?.targetConsensus ?? null,
        buy: r?.ratingDetailsDCFRecommendation === "Strong Buy" ? 1 : (r?.ratingDetailsROERecommendation === "Buy" ? 1 : 0),
        hold: 0,
        sell: 0,
      };
    })
  );
  return results
    .filter((r): r is PromiseFulfilledResult<AnalystRating> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ---- News ----
async function fetchFmpNews(): Promise<FmpNewsItem[]> {
  const tickers = [...ASX_TICKERS, ...US_TICKERS].join(",");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/v3/stock_news", { tickers, limit: "25" });
  if (!Array.isArray(data)) return [];
  return data.map((n) => ({
    title: n.title ?? "",
    publishedDate: n.publishedDate ?? "",
    url: n.url ?? "",
    symbol: n.symbol ?? "",
    site: n.site ?? "",
  }));
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

  if (!KEY) return NextResponse.json({ error: "FMP_API_KEY not configured." }, { status: 503 });

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
    indices,
    commodities,
    fx,
    economicCalendar,
    earningsCalendar,
    sectorPerformance,
    analystRatings,
    news,
  };

  cache = { data: payload, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
