import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const CACHE_TTL_MS = 15 * 60 * 1000;
let cache: { data: FmpPayload; expiresAt: number } | null = null;

interface IndexQuote { symbol: string; name: string; price: number | null; changePct: number | null; }
interface CommodityQuote { symbol: string; name: string; price: number | null; changePct: number | null; unit: string; }
interface FxRate { pair: string; label: string; rate: number | null; changePct: number | null; }
interface EconEvent { date: string; country: string; event: string; actual: string | null; estimate: string | null; prior: string | null; impact: string; }
interface EarningsEvent { date: string; symbol: string; name: string; epsEstimate: number | null; revenueEstimate: number | null; }
interface SectorPerf { sector: string; changePct: number; }
interface AnalystRating { symbol: string; name: string; targetLow: number | null; targetHigh: number | null; targetConsensus: number | null; analystCount: number; }
interface FmpNewsItem { title: string; publishedDate: string; url: string; symbol: string; site: string; image: string | null; }

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

const FMP_BASE = "https://financialmodelingprep.com/stable";
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)", Accept: "application/json" };

// ---- FMP single-symbol quote ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fmpQuote(symbol: string, apiKey: string): Promise<any | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`${FMP_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`, {
      cache: "no-store", signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch { return null; }
}

// ---- Yahoo Finance fallback ----
async function yahooQuote(symbol: string): Promise<{ price: number | null; prevClose: number | null; name: string | null }> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal, headers: YAHOO_HEADERS });
    clearTimeout(t);
    if (!res.ok) return { price: null, prevClose: null, name: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    const meta = data?.chart?.result?.[0]?.meta ?? {};
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const prevClose = typeof meta.previousClose === "number" ? meta.previousClose
      : typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose : null;
    const name = meta.shortName ?? meta.longName ?? null;
    return { price, prevClose, name };
  } catch { return { price: null, prevClose: null, name: null }; }
}

function changePctCalc(price: number | null, prev: number | null): number | null {
  if (!price || !prev || prev === 0) return null;
  return ((price - prev) / prev) * 100;
}

// ---- Global Indices ----
// Free plan supports these index symbols via /quote?symbol=X (one at a time)
const FMP_INDEX_SYMBOLS: { sym: string; name: string }[] = [
  { sym: "^GSPC",  name: "S&P 500"     },
  { sym: "^IXIC",  name: "NASDAQ"      },
  { sym: "^DJI",   name: "Dow Jones"   },
  { sym: "^FTSE",  name: "FTSE 100"    },
  { sym: "^N225",  name: "Nikkei 225"  },
  { sym: "^HSI",   name: "Hang Seng"   },
  { sym: "^RUT",   name: "Russell 2000"},
  { sym: "^VIX",   name: "VIX"         },
];
// These require Yahoo Finance as FMP premium plan only
const YAHOO_INDEX_SYMBOLS: { sym: string; name: string }[] = [
  { sym: "^GDAXI",    name: "DAX"      },
  { sym: "^AXJO",     name: "ASX 200"  },
  { sym: "000001.SS", name: "Shanghai" },
];

async function fetchIndices(apiKey: string): Promise<IndexQuote[]> {
  const [fmpResults, yahooResults] = await Promise.all([
    Promise.allSettled(FMP_INDEX_SYMBOLS.map(({ sym }) => fmpQuote(sym, apiKey))),
    Promise.allSettled(YAHOO_INDEX_SYMBOLS.map(({ sym }) => yahooQuote(sym))),
  ]);

  const out: IndexQuote[] = [];

  FMP_INDEX_SYMBOLS.forEach(({ sym, name }, i) => {
    const r = fmpResults[i];
    const q = r.status === "fulfilled" ? r.value : null;
    if (q && typeof q.price === "number") {
      out.push({ symbol: sym, name, price: q.price, changePct: typeof q.changePercentage === "number" ? q.changePercentage : null });
    }
  });

  YAHOO_INDEX_SYMBOLS.forEach(({ sym, name }, i) => {
    const r = yahooResults[i];
    const q = r.status === "fulfilled" ? r.value : { price: null, prevClose: null, name: null };
    if (q.price !== null) {
      out.push({ symbol: sym, name, price: q.price, changePct: changePctCalc(q.price, q.prevClose) });
    }
  });

  return out;
}

// ---- Commodities ----
// Available on FMP free plan: Gold (GCUSD), Silver (SIUSD), Brent (BZUSD), XAUUSD
// Premium on FMP: WTI Crude (CLUSD), Copper (HGUSD), Natural Gas (NGUSD) — use Yahoo Finance
const FMP_COMMODITIES: { sym: string; name: string; unit: string }[] = [
  { sym: "GCUSD",  name: "Gold",        unit: "USD/oz"  },
  { sym: "SIUSD",  name: "Silver",      unit: "USD/oz"  },
  { sym: "BZUSD",  name: "Brent Crude", unit: "USD/bbl" },
];
const YAHOO_COMMODITIES: { sym: string; name: string; unit: string }[] = [
  { sym: "CL=F", name: "Crude Oil (WTI)", unit: "USD/bbl"   },
  { sym: "HG=F", name: "Copper",          unit: "USD/lb"    },
  { sym: "NG=F", name: "Natural Gas",     unit: "USD/MMBtu" },
  { sym: "ZW=F", name: "Wheat",           unit: "USD/bu"    },
  { sym: "ZS=F", name: "Soybeans",        unit: "USD/bu"    },
];

async function fetchCommodities(apiKey: string): Promise<CommodityQuote[]> {
  const [fmpResults, yahooResults] = await Promise.all([
    Promise.allSettled(FMP_COMMODITIES.map(({ sym }) => fmpQuote(sym, apiKey))),
    Promise.allSettled(YAHOO_COMMODITIES.map(({ sym }) => yahooQuote(sym))),
  ]);

  const out: CommodityQuote[] = [];

  FMP_COMMODITIES.forEach(({ sym, name, unit }, i) => {
    const r = fmpResults[i];
    const q = r.status === "fulfilled" ? r.value : null;
    if (q && typeof q.price === "number") {
      out.push({ symbol: sym, name, unit, price: q.price, changePct: typeof q.changePercentage === "number" ? q.changePercentage : null });
    }
  });

  YAHOO_COMMODITIES.forEach(({ sym, name, unit }, i) => {
    const r = yahooResults[i];
    const q = r.status === "fulfilled" ? r.value : { price: null, prevClose: null, name: null };
    if (q.price !== null) {
      out.push({ symbol: sym, name, unit, price: q.price, changePct: changePctCalc(q.price, q.prevClose) });
    }
  });

  return out;
}

// ---- FX via FMP — AUD crosses all available on free plan ----
const FMP_FX_PAIRS: { sym: string; label: string }[] = [
  { sym: "AUDUSD", label: "AUD/USD" },
  { sym: "AUDEUR", label: "AUD/EUR" },
  { sym: "AUDGBP", label: "AUD/GBP" },
  { sym: "AUDJPY", label: "AUD/JPY" },
  { sym: "AUDCAD", label: "AUD/CAD" },
  { sym: "AUDNZD", label: "AUD/NZD" },
  { sym: "AUDCNY", label: "AUD/CNY" },
  { sym: "AUDSGD", label: "AUD/SGD" },
  { sym: "EURUSD", label: "EUR/USD" },
  { sym: "GBPUSD", label: "GBP/USD" },
  { sym: "USDJPY", label: "USD/JPY" },
];

async function fetchFx(apiKey: string): Promise<FxRate[]> {
  const results = await Promise.allSettled(FMP_FX_PAIRS.map(({ sym }) => fmpQuote(sym, apiKey)));
  return FMP_FX_PAIRS
    .map(({ sym, label }, i) => {
      const r = results[i];
      const q = r.status === "fulfilled" ? r.value : null;
      if (!q || typeof q.price !== "number") return null;
      return {
        pair: sym,
        label,
        rate: q.price,
        changePct: typeof q.changePercentage === "number" ? q.changePercentage : null,
      };
    })
    .filter((x): x is FxRate => x !== null);
}

// ---- Sector Performance via US sector ETFs (Yahoo Finance — no FMP endpoint available) ----
const SECTOR_ETFS: { sym: string; sector: string }[] = [
  { sym: "XLK",  sector: "Technology"            },
  { sym: "XLF",  sector: "Financials"             },
  { sym: "XLV",  sector: "Healthcare"             },
  { sym: "XLE",  sector: "Energy"                 },
  { sym: "XLI",  sector: "Industrials"            },
  { sym: "XLY",  sector: "Consumer Discretionary" },
  { sym: "XLP",  sector: "Consumer Staples"       },
  { sym: "XLB",  sector: "Materials"              },
  { sym: "XLRE", sector: "Real Estate"            },
  { sym: "XLU",  sector: "Utilities"              },
  { sym: "XLC",  sector: "Communication"          },
];

async function fetchSectorPerformance(): Promise<SectorPerf[]> {
  const results = await Promise.allSettled(SECTOR_ETFS.map(({ sym }) => yahooQuote(sym)));
  return SECTOR_ETFS
    .map(({ sector }, i) => {
      const r = results[i];
      const q = r.status === "fulfilled" ? r.value : { price: null, prevClose: null, name: null };
      const pct = changePctCalc(q.price, q.prevClose);
      return { sector, changePct: pct ?? 0 };
    })
    .filter((_, i) => {
      const r = results[i];
      return r.status === "fulfilled" && r.value.price !== null;
    })
    .sort((a, b) => b.changePct - a.changePct);
}

// ---- Economic Calendar via FMP ----
async function fetchEconomicCalendar(apiKey: string): Promise<EconEvent[]> {
  try {
    const from = new Date();
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(
      `${FMP_BASE}/economic-calendar?from=${fmt(from)}&to=${fmt(to)}&apikey=${apiKey}`,
      { cache: "no-store", signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e.country && e.event && (e.impact === "High" || e.impact === "Medium"))
      .slice(0, 20)
      .map((e) => ({
        date: e.date ?? "",
        country: e.country ?? "",
        event: e.event ?? "",
        actual: e.actual != null ? String(e.actual) : null,
        estimate: e.estimate != null ? String(e.estimate) : null,
        prior: e.previous != null ? String(e.previous) : null,
        impact: e.impact ?? "",
      }));
  } catch { return []; }
}

// ---- Earnings Calendar via FMP ----
async function fetchEarningsCalendar(apiKey: string): Promise<EarningsEvent[]> {
  try {
    const from = new Date();
    const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(
      `${FMP_BASE}/earnings-calendar?from=${fmt(from)}&to=${fmt(to)}&apikey=${apiKey}`,
      { cache: "no-store", signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];
    return data
      .filter((e) => e.symbol && e.date && e.epsEstimated != null)
      .slice(0, 20)
      .map((e) => ({
        date: e.date ?? "",
        symbol: e.symbol ?? "",
        name: e.symbol ?? "",
        epsEstimate: typeof e.epsEstimated === "number" ? e.epsEstimated : null,
        revenueEstimate: typeof e.revenueEstimated === "number" ? e.revenueEstimated : null,
      }));
  } catch { return []; }
}

// ---- Analyst Price Targets via FMP (/price-target-summary — US stocks only on free plan) ----
const ANALYST_SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "BRK-B", "UNH"];

async function fetchAnalystRatings(apiKey: string): Promise<AnalystRating[]> {
  const results = await Promise.allSettled(
    ANALYST_SYMBOLS.map(async (sym) => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8_000);
        const res = await fetch(
          `${FMP_BASE}/price-target-summary?symbol=${sym}&apikey=${apiKey}`,
          { cache: "no-store", signal: ctrl.signal }
        );
        clearTimeout(t);
        if (!res.ok) return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (await res.json()) as any[];
        return Array.isArray(data) && data.length > 0 ? data[0] : null;
      } catch { return null; }
    })
  );

  return results
    .map((r, i) => {
      if (r.status !== "fulfilled" || !r.value) return null;
      const d = r.value;
      return {
        symbol: ANALYST_SYMBOLS[i],
        name: ANALYST_SYMBOLS[i],
        targetConsensus: typeof d.lastQuarterAvgPriceTarget === "number" ? d.lastQuarterAvgPriceTarget : null,
        targetLow: typeof d.lastQuarterMinPriceTarget === "number" ? d.lastQuarterMinPriceTarget : null,
        targetHigh: typeof d.lastQuarterMaxPriceTarget === "number" ? d.lastQuarterMaxPriceTarget : null,
        analystCount: typeof d.lastQuarterCount === "number" ? d.lastQuarterCount : 0,
      };
    })
    .filter((x): x is AnalystRating => x !== null && x.targetConsensus !== null);
}

// ---- News via FMP /news/stock ----
async function fetchNews(apiKey: string): Promise<FmpNewsItem[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(
      `${FMP_BASE}/news/stock?limit=20&apikey=${apiKey}`,
      { cache: "no-store", signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!Array.isArray(data)) return [];
    return data.slice(0, 15).map((item) => ({
      title: item.title ?? "",
      publishedDate: item.publishedDate ?? "",
      url: item.url ?? "",
      symbol: item.symbol ?? "",
      site: item.publisher ?? item.site ?? "",
      image: item.image ?? null,
    }));
  } catch { return []; }
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

  const apiKey = process.env.FMP_API_KEY ?? "";

  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  const [indices, commodities, fx, sectorPerformance, economicCalendar, earningsCalendar, analystRatings, news] =
    await Promise.all([
      fetchIndices(apiKey),
      fetchCommodities(apiKey),
      fetchFx(apiKey),
      fetchSectorPerformance(),
      fetchEconomicCalendar(apiKey),
      fetchEarningsCalendar(apiKey),
      fetchAnalystRatings(apiKey),
      fetchNews(apiKey),
    ]);

  const payload: FmpPayload = {
    fetchedAt: new Date().toISOString(),
    indices, commodities, fx, sectorPerformance,
    economicCalendar, earningsCalendar, analystRatings, news,
  };

  cache = { data: payload, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
