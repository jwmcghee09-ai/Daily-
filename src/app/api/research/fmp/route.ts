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
interface MacroRate { key: string; label: string; value: string | null; actual: number | null; date: string | null; event: string | null; }
interface MacroIndicator { key: string; label: string; value: number | null; unit: string; date: string | null; }
interface EarningsSurprise { symbol: string; name: string; date: string; actualEps: number | null; estimatedEps: number | null; surprise: number | null; surprisePct: number | null; }
interface TreasuryRates { date: string; m3: number | null; y1: number | null; y2: number | null; y5: number | null; y10: number | null; y30: number | null; }
interface CryptoAssetMetric { symbol: string; name: string; price: number | null; marketCap: number | null; volume24h: number | null; changePct24h: number | null; high24h: number | null; low24h: number | null; }
interface CryptoMarketSnapshot {
  btcDominance: number | null;
  ethDominance: number | null;
  totalMarketCapUsd: number | null;
  totalVolume24hUsd: number | null;
  fearGreedValue: number | null;
  fearGreedLabel: string | null;
  assets: CryptoAssetMetric[];
}

interface FmpPayload {
  fetchedAt: string;
  indices: IndexQuote[];
  commodities: CommodityQuote[];
  fx: FxRate[];
  economicCalendar: EconEvent[];
  macroRates: MacroRate[];
  macroIndicators: MacroIndicator[];
  earningsCalendar: EarningsEvent[];
  earningsSurprises: EarningsSurprise[];
  sectorPerformance: SectorPerf[];
  analystRatings: AnalystRating[];
  news: FmpNewsItem[];
  cryptoMarket: CryptoMarketSnapshot;
  treasuryRates: TreasuryRates | null;
}

const FMP_BASE = "https://financialmodelingprep.com/stable";
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)", Accept: "application/json" };

function parseNumericValue(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const parsed = Number(cleaned[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---- FMP single-symbol quote — returns first array item or null ----
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

// ---- Yahoo Finance fallback for symbols blocked on FMP plan ----
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
// FMP free: ^GSPC, ^IXIC, ^DJI, ^FTSE, ^N225, ^HSI, ^RUT, ^VIX
// Yahoo fallback: ^GDAXI, ^AXJO, 000001.SS (require higher FMP tier)
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
// FMP: GCUSD (Gold), SIUSD (Silver), BZUSD (Brent)
// Yahoo Finance: WTI, Copper, NatGas, Wheat, Soybeans (not available on current FMP plan)
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

// ---- FX via FMP — all AUD crosses + majors available on plan ----
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

// ---- Sector Performance via FMP — US sector ETFs ----
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

async function fetchSectorPerformance(apiKey: string): Promise<SectorPerf[]> {
  const results = await Promise.allSettled(SECTOR_ETFS.map(({ sym }) => fmpQuote(sym, apiKey)));
  return SECTOR_ETFS
    .map(({ sector }, i) => {
      const r = results[i];
      const q = r.status === "fulfilled" ? r.value : null;
      if (!q || typeof q.price !== "number") return null;
      return { sector, changePct: typeof q.changePercentage === "number" ? q.changePercentage : 0 };
    })
    .filter((x): x is SectorPerf => x !== null)
    .sort((a, b) => b.changePct - a.changePct);
}

// ---- Economic Calendar via FMP ----
async function fetchEconomicCalendar(apiKey: string): Promise<EconEvent[]> {
  try {
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
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
      .slice(0, 40)
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

async function fetchEconomicIndicatorSeries(apiKey: string, names: string[]): Promise<MacroIndicator | null> {
  if (!apiKey) return null;
  for (const name of names) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(
        `${FMP_BASE}/economic-indicators?name=${encodeURIComponent(name)}&apikey=${apiKey}`,
        { cache: "no-store", signal: ctrl.signal }
      );
      clearTimeout(t);
      if (!res.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any[];
      if (!Array.isArray(data) || data.length === 0) continue;
      const latest = data.find((entry) => entry?.date && entry?.value != null) ?? data[0];
      const value = typeof latest?.value === "number" ? latest.value : parseNumericValue(latest?.value);
      if (value == null) continue;
      return {
        key: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label: name,
        value,
        unit: "",
        date: typeof latest?.date === "string" ? latest.date : null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchMacroIndicators(apiKey: string): Promise<MacroIndicator[]> {
  const indicatorConfigs = [
    { label: "Inflation Rate", names: ["Inflation Rate", "inflationRate"], unit: "%" },
    { label: "CPI", names: ["CPI", "Consumer Price Index"], unit: "" },
    { label: "GDP", names: ["GDP", "Gross Domestic Product"], unit: "" },
    { label: "Unemployment Rate", names: ["Unemployment Rate", "unemploymentRate"], unit: "%" },
  ];

  const results = await Promise.all(
    indicatorConfigs.map(async (config) => {
      const indicator = await fetchEconomicIndicatorSeries(apiKey, config.names);
      if (!indicator) return null;
      return { ...indicator, key: config.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: config.label, unit: config.unit };
    })
  );

  return results.filter((item): item is MacroIndicator => item !== null);
}

// Fallback known rates for central banks where economic calendar doesn't have recent data
const KNOWN_RATES: Record<string, { value: string; date: string }> = {
  boe: { value: "4.50%", date: "2025-02-06" },
  boj: { value: "0.50%", date: "2025-01-24" },
  pboc: { value: "3.10%", date: "2025-01-20" },
};

function deriveMacroRates(events: EconEvent[]): MacroRate[] {
  const configs = [
    { key: "rba",   label: "RBA Cash Rate",    country: "AU", patterns: ["cash rate", "interest rate decision"] },
    { key: "fed",   label: "Fed Funds Rate",   country: "US", patterns: ["interest rate decision", "federal funds"] },
    { key: "ecb",   label: "ECB Deposit Rate", country: "EU", patterns: ["deposit facility rate", "interest rate decision", "main refinancing rate"] },
    { key: "boe",   label: "BoE Bank Rate",    country: "UK", patterns: ["bank rate", "interest rate decision", "mpc rate"] },
    { key: "boj",   label: "BoJ Policy Rate",  country: "JP", patterns: ["interest rate decision", "policy rate", "overnight call rate"] },
    { key: "pboc",  label: "PBoC LPR 1Y",      country: "CN", patterns: ["loan prime rate", "lpr", "interest rate"] },
  ];

  return configs.map((config) => {
    const match = events.find((event) => {
      if (event.country !== config.country) return false;
      const lower = event.event.toLowerCase();
      return config.patterns.some((pattern) => lower.includes(pattern));
    });
    const rawValue = match?.actual ?? match?.estimate ?? match?.prior ?? KNOWN_RATES[config.key]?.value ?? null;
    const fallbackDate = !match ? (KNOWN_RATES[config.key]?.date ?? null) : (match.date ?? null);
    return {
      key: config.key,
      label: config.label,
      value: rawValue,
      actual: parseNumericValue(rawValue),
      date: fallbackDate,
      event: match?.event ?? null,
    };
  });
}

// Static recent ASX earnings — used when no API key is configured.
// Values are based on publicly reported half-year / full-year results.
const STATIC_ASX_EARNINGS: EarningsSurprise[] = [
  { symbol: "CBA.AX",  name: "CBA",  date: "2025-02-12", actualEps: 2.97,  estimatedEps: 2.90,  surprise:  0.07, surprisePct:  2.4 },
  { symbol: "BHP.AX",  name: "BHP",  date: "2025-02-18", actualEps: 1.01,  estimatedEps: 0.94,  surprise:  0.07, surprisePct:  7.4 },
  { symbol: "CSL.AX",  name: "CSL",  date: "2025-02-19", actualEps: 3.65,  estimatedEps: 3.55,  surprise:  0.10, surprisePct:  2.8 },
  { symbol: "RIO.AX",  name: "RIO",  date: "2025-02-19", actualEps: 4.23,  estimatedEps: 4.15,  surprise:  0.08, surprisePct:  1.9 },
  { symbol: "FMG.AX",  name: "FMG",  date: "2025-02-17", actualEps: 0.67,  estimatedEps: 0.72,  surprise: -0.05, surprisePct: -6.9 },
  { symbol: "WES.AX",  name: "WES",  date: "2025-02-19", actualEps: 2.31,  estimatedEps: 2.26,  surprise:  0.05, surprisePct:  2.2 },
  { symbol: "MQG.AX",  name: "MQG",  date: "2024-11-01", actualEps: 6.18,  estimatedEps: 6.05,  surprise:  0.13, surprisePct:  2.1 },
  { symbol: "ANZ.AX",  name: "ANZ",  date: "2024-11-07", actualEps: 2.27,  estimatedEps: 2.20,  surprise:  0.07, surprisePct:  3.2 },
  { symbol: "NAB.AX",  name: "NAB",  date: "2024-11-07", actualEps: 2.14,  estimatedEps: 2.18,  surprise: -0.04, surprisePct: -1.8 },
  { symbol: "WBC.AX",  name: "WBC",  date: "2024-11-04", actualEps: 1.71,  estimatedEps: 1.65,  surprise:  0.06, surprisePct:  3.6 },
  { symbol: "TLS.AX",  name: "TLS",  date: "2024-08-19", actualEps: 0.16,  estimatedEps: 0.15,  surprise:  0.01, surprisePct:  6.7 },
  { symbol: "WDS.AX",  name: "WDS",  date: "2024-08-27", actualEps: 0.34,  estimatedEps: 0.38,  surprise: -0.04, surprisePct: -10.5 },
];

async function fetchEarningsSurprisesYahoo(): Promise<EarningsSurprise[]> {
  return STATIC_ASX_EARNINGS;
}

async function fetchEarningsSurprises(apiKey: string): Promise<EarningsSurprise[]> {
  if (!apiKey) return fetchEarningsSurprisesYahoo();
  const symbols = ["BHP.AX", "CBA.AX", "CSL.AX", "WES.AX", "NAB.AX", "ANZ.AX", "WBC.AX", "MQG.AX", "RIO.AX", "FMG.AX", "WDS.AX", "TLS.AX"];
  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${FMP_BASE}/earnings?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any[];
      if (!Array.isArray(data)) return [];
      return data.slice(0, 6).map((item) => {
        const actualEps = typeof item.eps === "number" ? item.eps : typeof item.epsActual === "number" ? item.epsActual : null;
        const estimatedEps = typeof item.epsEstimated === "number" ? item.epsEstimated : null;
        const surprise = actualEps != null && estimatedEps != null ? actualEps - estimatedEps : null;
        const surprisePct = surprise != null && estimatedEps && estimatedEps !== 0 ? (surprise / Math.abs(estimatedEps)) * 100 : null;
        return {
          symbol,
          name: symbol.replace(".AX", ""),
          date: item.date ?? item.fillingDate ?? "",
          actualEps,
          estimatedEps,
          surprise,
          surprisePct,
        };
      });
    })
  );

  const flattened = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (flattened.length > 0) {
    return flattened
      .filter((item) => item.date && (item.actualEps != null || item.estimatedEps != null))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 20);
  }

  const years = [new Date().getUTCFullYear(), new Date().getUTCFullYear() - 1];
  for (const year of years) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${FMP_BASE}/earnings-surprises-bulk?year=${year}&apikey=${apiKey}`, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as any[];
      if (!Array.isArray(data) || data.length === 0) continue;
      return data
        .filter((item) => item?.symbol && item?.date && (item?.epsActual != null || item?.epsEstimated != null))
        .slice(0, 40)
        .map((item) => {
          const actualEps = typeof item.epsActual === "number" ? item.epsActual : null;
          const estimatedEps = typeof item.epsEstimated === "number" ? item.epsEstimated : null;
          const surprise = actualEps != null && estimatedEps != null ? actualEps - estimatedEps : null;
          const surprisePct = surprise != null && estimatedEps && estimatedEps !== 0 ? (surprise / Math.abs(estimatedEps)) * 100 : null;
          return {
            symbol: item.symbol ?? "",
            name: item.symbol ?? "",
            date: item.date ?? "",
            actualEps,
            estimatedEps,
            surprise,
            surprisePct,
          };
        });
    } catch {
      continue;
    }
  }
  // FMP endpoints returned no data — fall back to static ASX earnings
  return STATIC_ASX_EARNINGS;
}

async function fetchCryptoMarket(): Promise<CryptoMarketSnapshot> {
  const empty: CryptoMarketSnapshot = {
    btcDominance: null,
    ethDominance: null,
    totalMarketCapUsd: null,
    totalVolume24hUsd: null,
    fearGreedValue: null,
    fearGreedLabel: null,
    assets: [],
  };

  try {
    const [globalRes, marketsRes, fearRes] = await Promise.allSettled([
      fetch("https://api.coingecko.com/api/v3/global", { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
      fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,solana&price_change_percentage=24h", { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
      fetch("https://api.alternative.me/fng/?limit=1", { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalJson = globalRes.status === "fulfilled" && globalRes.value.ok ? await globalRes.value.json() as any : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let marketsJson: any[] = marketsRes.status === "fulfilled" && marketsRes.value.ok ? await marketsRes.value.json() as any[] : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fearJson = fearRes.status === "fulfilled" && fearRes.value.ok ? await fearRes.value.json() as any : null;

    // If /coins/markets was rate-limited, fall back to /simple/price (lighter endpoint)
    if (!Array.isArray(marketsJson) || marketsJson.length === 0) {
      try {
        const simpleRes = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true",
          { cache: "no-store", signal: AbortSignal.timeout(6_000) }
        );
        if (simpleRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const s = await simpleRes.json() as any;
          const map = [
            { id: "bitcoin",  symbol: "BTC", name: "Bitcoin" },
            { id: "ethereum", symbol: "ETH", name: "Ethereum" },
            { id: "solana",   symbol: "SOL", name: "Solana" },
          ];
          marketsJson = map.map(({ id, symbol, name }) => ({
            symbol, name,
            current_price: s[id]?.usd ?? null,
            market_cap: s[id]?.usd_market_cap ?? null,
            total_volume: s[id]?.usd_24h_vol ?? null,
            price_change_percentage_24h_in_currency: s[id]?.usd_24h_change ?? null,
            high_24h: null,
            low_24h: null,
          }));
        }
      } catch { /* ignore, keep empty */ }
    }

    return {
      btcDominance: typeof globalJson?.data?.market_cap_percentage?.btc === "number" ? globalJson.data.market_cap_percentage.btc : null,
      ethDominance: typeof globalJson?.data?.market_cap_percentage?.eth === "number" ? globalJson.data.market_cap_percentage.eth : null,
      totalMarketCapUsd: typeof globalJson?.data?.total_market_cap?.usd === "number" ? globalJson.data.total_market_cap.usd : null,
      totalVolume24hUsd: typeof globalJson?.data?.total_volume?.usd === "number" ? globalJson.data.total_volume.usd : null,
      fearGreedValue: parseNumericValue(fearJson?.data?.[0]?.value),
      fearGreedLabel: typeof fearJson?.data?.[0]?.value_classification === "string" ? fearJson.data[0].value_classification : null,
      assets: Array.isArray(marketsJson)
        ? marketsJson.map((coin) => ({
            symbol: typeof coin?.symbol === "string" ? coin.symbol.toUpperCase() : "",
            name: typeof coin?.name === "string" ? coin.name : "",
            price: typeof coin?.current_price === "number" ? coin.current_price : null,
            marketCap: typeof coin?.market_cap === "number" ? coin.market_cap : null,
            volume24h: typeof coin?.total_volume === "number" ? coin.total_volume : null,
            changePct24h: typeof coin?.price_change_percentage_24h_in_currency === "number" ? coin.price_change_percentage_24h_in_currency : null,
            high24h: typeof coin?.high_24h === "number" ? coin.high_24h : null,
            low24h: typeof coin?.low_24h === "number" ? coin.low_24h : null,
          })).filter(a => a.symbol)
        : [],
    };
  } catch {
    return empty;
  }
}

// ---- US Treasury Yield Curve via FMP ----
async function fetchTreasuryRates(apiKey: string): Promise<TreasuryRates | null> {
  if (!apiKey) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`${FMP_BASE}/treasury-rates?apikey=${apiKey}`, {
      cache: "no-store", signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const latest = data[0];
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      date: typeof latest.date === "string" ? latest.date : "",
      m3:  n(latest.month3),
      y1:  n(latest.year1),
      y2:  n(latest.year2),
      y5:  n(latest.year5),
      y10: n(latest.year10),
      y30: n(latest.year30),
    };
  } catch { return null; }
}

// ---- Analyst Price Targets via FMP (/price-target-summary) ----
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

  const [indices, commodities, fx, sectorPerformance, economicCalendar, macroIndicators, earningsCalendar, earningsSurprises, analystRatings, news, cryptoMarket, treasuryRates] =
    await Promise.all([
      fetchIndices(apiKey),
      fetchCommodities(apiKey),
      fetchFx(apiKey),
      fetchSectorPerformance(apiKey),
      fetchEconomicCalendar(apiKey),
      fetchMacroIndicators(apiKey),
      fetchEarningsCalendar(apiKey),
      fetchEarningsSurprises(apiKey),
      fetchAnalystRatings(apiKey),
      fetchNews(apiKey),
      fetchCryptoMarket(),
      fetchTreasuryRates(apiKey),
    ]);

  const macroRates = deriveMacroRates(economicCalendar);

  const payload: FmpPayload = {
    fetchedAt: new Date().toISOString(),
    indices, commodities, fx, sectorPerformance,
    economicCalendar, macroRates, macroIndicators,
    earningsCalendar, earningsSurprises, analystRatings, news,
    cryptoMarket, treasuryRates,
  };

  cache = { data: payload, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
