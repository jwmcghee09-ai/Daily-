import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — FRED updates intraday but daily is fine
let cache: { data: FredPayload; expiresAt: number } | null = null;

interface FredSeries {
  id: string;
  label: string;
  value: number | null;
  prev: number | null;
  change: number | null;
  date: string | null;
  unit: string;
  description: string;
}

interface CotPosition {
  market: string;
  reportDate: string | null;
  netLong: number | null;       // managed money net (longs - shorts)
  longPct: number | null;       // longs / (longs + shorts) * 100
  weekChange: number | null;    // net change vs prior week
  sentiment: "bullish" | "bearish" | "neutral" | null;
}

interface FredPayload {
  fetchedAt: string;
  series: FredSeries[];
  cot: {
    oil: CotPosition;
    gold: CotPosition;
  };
}

// ── Static fallback data (used when FRED_API_KEY is absent) ──────────────────
const STATIC_FRED: FredSeries[] = [
  { id: "BAMLH0A0HYM2", label: "HY Credit Spread", value: 3.22, prev: 3.31, change: -0.09, date: "2025-03-28", unit: "%", description: "ICE BofA US High Yield OAS — spreads below 4% = risk-on" },
  { id: "T10YIE",       label: "Breakeven Inflation (10Y)", value: 2.27, prev: 2.30, change: -0.03, date: "2025-03-28", unit: "%", description: "Market-implied 10Y inflation expectations" },
  { id: "M2SL",         label: "M2 Money Supply", value: 21842, prev: 21780, change: 62, date: "2025-02-01", unit: "B", description: "US M2 money supply in billions — expansion = liquidity tailwind" },
  { id: "WALCL",        label: "Fed Balance Sheet", value: 6712, prev: 6740, change: -28, date: "2025-03-26", unit: "B", description: "Federal Reserve total assets in billions (QT = declining)" },
  { id: "DTWEXBGS",     label: "USD Index (Broad)", value: 107.4, prev: 108.1, change: -0.7, date: "2025-03-28", unit: "", description: "Trade-weighted broad USD index — higher = headwind for commodities/EM" },
  { id: "SOFR",         label: "SOFR", value: 4.31, prev: 4.31, change: 0, date: "2025-03-28", unit: "%", description: "Secured Overnight Financing Rate — risk-free benchmark replacing LIBOR" },
];

// ── FRED series to fetch ─────────────────────────────────────────────────────
const FRED_SERIES = [
  { id: "BAMLH0A0HYM2", label: "HY Credit Spread",         unit: "%",  description: "ICE BofA US High Yield OAS — spreads below 4% = risk-on" },
  { id: "T10YIE",       label: "Breakeven Inflation (10Y)", unit: "%",  description: "Market-implied 10Y inflation expectations" },
  { id: "M2SL",         label: "M2 Money Supply",           unit: "B",  description: "US M2 money supply in billions — expansion = liquidity tailwind" },
  { id: "WALCL",        label: "Fed Balance Sheet",         unit: "B",  description: "Federal Reserve total assets (QT = declining)" },
  { id: "DTWEXBGS",     label: "USD Index (Broad)",         unit: "",   description: "Trade-weighted broad USD index — higher = headwind for commodities/EM" },
  { id: "SOFR",         label: "SOFR",                      unit: "%",  description: "Secured Overnight Financing Rate — risk-free rate benchmark" },
];

async function fetchFredSeries(apiKey: string, seriesId: string): Promise<{ value: number; prev: number; date: string } | null> {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5&observation_start=2020-01-01`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json() as { observations?: { date: string; value: string }[] };
    const obs = (json.observations ?? []).filter(o => o.value !== "." && o.value !== "");
    if (obs.length < 1) return null;
    const value = parseFloat(obs[0].value);
    const prev  = obs.length >= 2 ? parseFloat(obs[1].value) : value;
    if (!isFinite(value)) return null;
    // WALCL and M2SL are in millions — convert to billions
    const scale = (seriesId === "WALCL" || seriesId === "M2SL") ? 0.001 : 1;
    return { value: value * scale, prev: prev * scale, date: obs[0].date };
  } catch {
    return null;
  }
}

async function fetchAllFredSeries(apiKey: string): Promise<FredSeries[]> {
  const results = await Promise.allSettled(
    FRED_SERIES.map(s => fetchFredSeries(apiKey, s.id))
  );

  return FRED_SERIES.map((s, i) => {
    const res = results[i];
    const data = res.status === "fulfilled" ? res.value : null;
    const value = data?.value ?? null;
    const prev  = data?.prev  ?? null;
    const change = value != null && prev != null ? parseFloat((value - prev).toFixed(4)) : null;
    return { ...s, value, prev, change, date: data?.date ?? null };
  });
}

// ── CFTC Commitment of Traders ───────────────────────────────────────────────
const COT_API = "https://publicreporting.cftc.gov/api/cot/futures-and-options-combined";

async function fetchCot(marketName: string): Promise<CotPosition | null> {
  try {
    const params = new URLSearchParams({
      "$top": "2",
      "$filter": `Market_and_Exchange_Names eq '${marketName}'`,
      "$orderby": "Report_Date_as_MM_DD_YYYY desc",
    });
    const res = await fetch(`${COT_API}?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const latest = data[0];
    const prior  = data[1] ?? null;

    const mmLong  = Number(latest.Money_Manager_Positions_Long_All  ?? latest.Managed_Money_Positions_Long_All  ?? 0);
    const mmShort = Number(latest.Money_Manager_Positions_Short_All ?? latest.Managed_Money_Positions_Short_All ?? 0);
    const net = mmLong - mmShort;
    const total = mmLong + mmShort;
    const longPct = total > 0 ? (mmLong / total) * 100 : null;

    let weekChange: number | null = null;
    if (prior) {
      const pLong  = Number(prior.Money_Manager_Positions_Long_All  ?? prior.Managed_Money_Positions_Long_All  ?? 0);
      const pShort = Number(prior.Money_Manager_Positions_Short_All ?? prior.Managed_Money_Positions_Short_All ?? 0);
      weekChange = net - (pLong - pShort);
    }

    const sentiment: CotPosition["sentiment"] =
      longPct == null  ? null :
      longPct >= 60    ? "bullish" :
      longPct <= 40    ? "bearish" : "neutral";

    // Parse date — CFTC uses MM/DD/YYYY
    let reportDate: string | null = null;
    const rawDate = latest.Report_Date_as_MM_DD_YYYY ?? latest.As_of_Date_In_Form_YYMMDD ?? null;
    if (rawDate) {
      reportDate = rawDate;
    }

    return { market: marketName, reportDate, netLong: isFinite(net) ? net : null, longPct: longPct != null ? parseFloat(longPct.toFixed(1)) : null, weekChange: weekChange != null && isFinite(weekChange) ? weekChange : null, sentiment };
  } catch {
    return null;
  }
}

const STATIC_COT: FredPayload["cot"] = {
  oil:  { market: "WTI Crude Oil", reportDate: "03/25/2025", netLong: 142800, longPct: 63.2, weekChange: -4100,  sentiment: "bullish" },
  gold: { market: "Gold",          reportDate: "03/25/2025", netLong: 201500, longPct: 71.4, weekChange:  8200,  sentiment: "bullish" },
};

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET() {
  // Auth: free tier gets FRED/CoT data too — it's macro, not portfolio
  const sessionUser = await getAuthenticatedUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const entitlements = readUserEntitlements(sessionUser.id);
  if (entitlements.planTier === "none" && !entitlements.proEnabled) {
    return NextResponse.json({ error: "Subscription required." }, { status: 403 });
  }

  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return NextResponse.json(cache.data, { headers: { "Cache-Control": "no-store" } });
  }

  const fredApiKey = String(process.env.FRED_API_KEY ?? "").trim();

  const [fredSeries, oilCot, goldCot] = await Promise.allSettled([
    fredApiKey ? fetchAllFredSeries(fredApiKey) : Promise.resolve(null),
    fetchCot("CRUDE OIL, LIGHT SWEET - NEW YORK MERCANTILE EXCHANGE"),
    fetchCot("GOLD - COMMODITY EXCHANGE INC."),
  ]);

  const series: FredSeries[] = fredSeries.status === "fulfilled" && fredSeries.value
    ? fredSeries.value
    : STATIC_FRED;

  const oil  = (oilCot.status === "fulfilled"  && oilCot.value)  ? oilCot.value  : STATIC_COT.oil;
  const gold = (goldCot.status === "fulfilled" && goldCot.value) ? goldCot.value : STATIC_COT.gold;

  const payload: FredPayload = {
    fetchedAt: new Date().toISOString(),
    series,
    cot: { oil, gold },
  };

  cache = { data: payload, expiresAt: now + CACHE_TTL_MS };
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
