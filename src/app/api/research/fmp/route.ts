import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

// FMP moved to stable API after Aug 2025 — v3 endpoints are legacy
const FMP_BASE = "https://financialmodelingprep.com/stable";
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
const INDEX_MAP: Record<string, string> = {
  "^GSPC": "S&P 500", "^IXIC": "NASDAQ", "^DJI": "Dow Jones",
  "^FTSE": "FTSE 100", "^GDAXI": "DAX", "^N225": "Nikkei 225",
  "^HSI": "Hang Seng", "^AXJO": "ASX 200", "^FCHI": "CAC 40",
};

async function fetchIndices(): Promise<IndexQuote[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/index-quotes");
  if (!Array.isArray(data)) return [];
  const out: IndexQuote[] = [];
  for (const sym of Object.keys(INDEX_MAP)) {
    const q = data.find((d) => d.symbol === sym || d.symbol === sym.replace("^", ""));
    if (!q?.price) continue;
    out.push({ symbol: sym, name: INDEX_MAP[sym], price: q.price ?? null, changePct: q.changesPercentage ?? q.changePercentage ?? null });
  }
  return out;
}

// ---- Commodities ----
const COMMODITY_WANT: { syms: string[]; name: string; unit: string }[] = [
  { syms: ["CLUSD", "CLF", "CL", "OUSX"],   name: "Crude Oil (WTI)",  unit: "USD/bbl" },
  { syms: ["BZUSD", "BZF", "BZ", "BRNT"],   name: "Brent Crude",      unit: "USD/bbl" },
  { syms: ["GCUSD", "GCF", "GC", "XAUUSD"], name: "Gold",             unit: "USD/oz"  },
  { syms: ["SIUSD", "SIF", "SI", "XAGUSD"], name: "Silver",           unit: "USD/oz"  },
  { syms: ["HGUSD", "HGF", "HG"],           name: "Copper",           unit: "USD/lb"  },
  { syms: ["NGUSD", "NGF", "NG"],           name: "Natural Gas",      unit: "USD/MMBtu" },
  { syms: ["ZWUSD", "ZWF", "ZW"],           name: "Wheat",            unit: "USD/bu"  },
  { syms: ["ZSUSD", "ZSF", "ZS"],           name: "Soybeans",         unit: "USD/bu"  },
];

async function fetchCommodities(): Promise<CommodityQuote[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/commodity-quotes");
  if (!Array.isArray(data)) return [];
  const out: CommodityQuote[] = [];
  for (const want of COMMODITY_WANT) {
    const q = data.find((d) => want.syms.includes(d.symbol));
    if (!q?.price) continue;
    out.push({ symbol: q.symbol, name: want.name, unit: want.unit, price: q.price, changePct: q.changesPercentage ?? q.changePercentage ?? null });
  }
  return out;
}

// ---- FX ----
async function fetchFx(): Promise<FxRate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/forex-quotes");
  if (!Array.isArray(data)) return [];

  const byTicker: Record<string, { bid: number; changes: number }> = {};
  for (const d of data) {
    const key = (d.symbol ?? d.ticker ?? "").toUpperCase().replace("/", "");
    if (key) byTicker[key] = { bid: d.bid ?? d.price ?? d.ask ?? 0, changes: d.changesPercentage ?? d.changes ?? 0 };
  }

  const r = (t: string) => byTicker[t.toUpperCase()] ?? null;
  const audUsd = r("AUDUSD")?.bid ?? 0;

  const pairs: { label: string; calc: () => { rate: number | null; changePct: number | null } }[] = [
    { label: "AUD/USD", calc: () => { const q = r("AUDUSD"); return { rate: q?.bid ?? null, changePct: q?.changes ?? null }; } },
    { label: "AUD/EUR", calc: () => { const q = r("EURUSD"); return { rate: q && audUsd ? audUsd / q.bid : null, changePct: null }; } },
    { label: "AUD/GBP", calc: () => { const q = r("GBPUSD"); return { rate: q && audUsd ? audUsd / q.bid : null, changePct: null }; } },
    { label: "AUD/JPY", calc: () => { const q = r("USDJPY"); return { rate: q && audUsd ? audUsd * q.bid : null, changePct: null }; } },
    { label: "AUD/CNY", calc: () => { const q = r("USDCNY"); return { rate: q && audUsd ? audUsd * q.bid : null, changePct: null }; } },
    { label: "AUD/NZD", calc: () => { const q = r("AUDNZD"); return { rate: q?.bid ?? null, changePct: q?.changes ?? null }; } },
    { label: "AUD/CAD", calc: () => { const q = r("AUDCAD"); return { rate: q?.bid ?? null, changePct: q?.changes ?? null }; } },
    { label: "AUD/SGD", calc: () => { const q = r("USDSGD"); return { rate: q && audUsd ? audUsd * q.bid : null, changePct: null }; } },
  ];

  return pairs.map(({ label, calc }) => {
    const { rate, changePct } = calc();
    return { pair: label.replace("/", ""), label, rate: rate && rate > 0 ? rate : null, changePct };
  });
}

// ---- Economic Calendar ----
async function fetchEconomicCalendar(): Promise<EconEvent[]> {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/economic-calendar", { from, to });
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
  const data = await fmpGet<any[]>("/earnings-calendar", { from, to });
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
  const data = await fmpGet<any[]>("/sector-performance");
  if (!Array.isArray(data)) return [];
  return data
    .map((s) => ({ sector: s.sector ?? "", changePct: parseFloat(String(s.changesPercentage ?? s.changePercentage ?? "0").replace("%", "")) }))
    .sort((a, b) => b.changePct - a.changePct);
}

// ---- Analyst Ratings ----
async function fetchAnalystRatings(): Promise<AnalystRating[]> {
  const symbols = ["BHP.AX", "CBA.AX", "CSL.AX", "WES.AX", "ANZ.AX", "RIO.AX"];
  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const [ratingArr, targetArr] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fmpGet<any[]>(`/ratings/${encodeURIComponent(sym)}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fmpGet<any[]>(`/price-target-consensus?symbol=${encodeURIComponent(sym)}`),
      ]);
      const r = Array.isArray(ratingArr) ? ratingArr[0] : null;
      const t = Array.isArray(targetArr) ? targetArr[0] : null;
      return {
        symbol: sym.replace(".AX", ""),
        rating: r?.ratingRecommendation ?? r?.rating ?? "—",
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fmpGet<any[]>("/news/stock", { symbols: WATCHLIST.join(","), limit: "20" });
  if (!Array.isArray(data)) return [];
  return data.map((n) => ({ title: n.title ?? "", publishedDate: n.publishedDate ?? n.date ?? "", url: n.url ?? "", symbol: n.symbol ?? n.tickers?.[0] ?? "", site: n.site ?? n.source ?? "" }));
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

  // Debug mode
  if (request.nextUrl.searchParams.get("debug") === "1") {
    const keyPreview = KEY.slice(0, 6) + "…";
    const probe = async (path: string) => {
      const url = `${FMP_BASE}${path}?apikey=${KEY}`;
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
        const text = await r.text();
        return { status: r.status, body: text.slice(0, 150) };
      } catch (e) { return { status: 0, body: String(e) }; }
    };
    const [idx, comm, fx, econ, earn, sec, news] = await Promise.all([
      probe("/index-quotes"),
      probe("/commodity-quotes"),
      probe("/forex-quotes"),
      probe("/economic-calendar?from=2026-03-01&to=2026-04-01"),
      probe("/earnings-calendar?from=2026-03-01&to=2026-06-01"),
      probe("/sector-performance"),
      probe("/news/stock?symbols=AAPL&limit=1"),
    ]);
    return NextResponse.json({ keyPreview, idx, comm, fx, econ, earn, sec, news });
  }

  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  const [indices, commodities, fx, economicCalendar, earningsCalendar, sectorPerformance, analystRatings, news] =
    await Promise.all([
      fetchIndices(), fetchCommodities(), fetchFx(),
      fetchEconomicCalendar(), fetchEarningsCalendar(),
      fetchSectorPerformance(), fetchAnalystRatings(), fetchFmpNews(),
    ]);

  const payload: FmpPayload = {
    fetchedAt: new Date().toISOString(),
    indices, commodities, fx, economicCalendar, earningsCalendar, sectorPerformance, analystRatings, news,
  };

  cache = { data: payload, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
