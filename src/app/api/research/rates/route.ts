/**
 * Central bank policy rates, fetched rather than written down.
 *
 * The research page carried these as literal text in the HTML — "4.35%" for the
 * RBA, with nothing anywhere that could ever change it. It was correct when it
 * was typed and silently wrong from the next rate decision onward; by the time
 * this was reported the RBA had moved to 4.60% two days earlier. A number a
 * reader cannot distinguish from a live one has to be live.
 *
 * Two sources, and a rule about the third case:
 *
 *   - The RBA publishes its own cash rate target as a CSV, no key required.
 *     That is the authority for the Australian rate and the one that matters
 *     most to this audience, so it is fetched directly.
 *   - FRED covers the Fed and the ECB, but needs an API key.
 *   - Where a rate cannot be fetched, nothing is shown for it. Not a cached
 *     guess, not the last value anyone typed — a dash and a reason. A stale
 *     policy rate presented as current is worse than an obvious gap, because
 *     the gap prompts a question and the stale number does not.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const RBA_F1_CSV = "https://www.rba.gov.au/statistics/tables/csv/f1-data.csv";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

/** Policy rates move a handful of times a year; an hour is plenty. */
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface PolicyRate {
  key: string;
  flag: string;
  label: string;
  /** Null when no source could answer — never a remembered value. */
  value: number | null;
  /** Rendered form, which for the Fed is a range rather than a point. */
  display: string;
  asOf: string | null;
  /** Direction of the most recent move, where the source reports one. */
  direction: "hike" | "cut" | "hold" | null;
  source: string;
  unavailable?: string;
}

let cache: { at: number; rates: PolicyRate[] } | null = null;

/** Parse a CSV honouring quotes — the RBA file has commas inside fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const RBA_DATE = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function rbaDateToIso(value: string): string | null {
  const m = value.trim().match(RBA_DATE);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]}`;
}

/**
 * The RBA's cash rate target, from table F1.
 *
 * The file is daily and its most recent rows can be blank — it is published
 * before the day's figure lands — so the last row with a value is taken rather
 * than the last row.
 */
async function fetchRbaCashRate(): Promise<PolicyRate> {
  const base: PolicyRate = {
    key: "rba", flag: "🇦🇺", label: "RBA Cash Rate",
    value: null, display: "—", asOf: null, direction: null,
    source: "Reserve Bank of Australia, table F1",
  };

  try {
    const res = await fetch(RBA_F1_CSV, {
      headers: { "User-Agent": "SPECTRE Portfolio Analytics admin@spectre-assets.com" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { ...base, unavailable: `RBA returned ${res.status}` };

    const rows = parseCsv(await res.text());
    const observations = rows
      .filter((r) => r.length > 1 && RBA_DATE.test(String(r[0] ?? "").trim()))
      .map((r) => ({
        date: rbaDateToIso(r[0]),
        // The file is published before the day's figure lands, so its last rows
        // carry an empty rate cell. Number("") is 0, not NaN — left to the
        // finite check alone that reads as a cash rate of zero.
        raw: String(r[1] ?? "").trim(),
      }))
      .filter((o) => o.date && o.raw.length > 0)
      .map((o) => ({ date: o.date, rate: Number(o.raw) }))
      .filter((o) => Number.isFinite(o.rate));

    const latest = observations[observations.length - 1];
    if (!latest) return { ...base, unavailable: "No observations in the RBA file" };

    // Direction from the previous distinct level, so "HOLD" means genuinely
    // unchanged rather than "no change column on today's row".
    const earlier = [...observations].reverse().find((o) => o.rate !== latest.rate);
    const direction: PolicyRate["direction"] = !earlier
      ? "hold"
      : latest.rate > earlier.rate ? "hike" : latest.rate < earlier.rate ? "cut" : "hold";

    return {
      ...base,
      value: latest.rate,
      display: `${latest.rate.toFixed(2)}%`,
      asOf: latest.date,
      direction,
    };
  } catch (error) {
    return { ...base, unavailable: error instanceof Error ? error.message : "RBA unreachable" };
  }
}

async function fetchFredLatest(apiKey: string, seriesId: string): Promise<{ value: number; date: string } | null> {
  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json`
      + "&sort_order=desc&limit=8";
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { observations?: Array<{ value?: string; date?: string }> };
    for (const o of body.observations ?? []) {
      const n = Number(o.value);
      // FRED writes "." for a missing observation.
      if (Number.isFinite(n) && o.date) return { value: n, date: o.date };
    }
    return null;
  } catch {
    return null;
  }
}

const FRED_RATES = [
  { key: "fed", flag: "🇺🇸", label: "Fed Funds Rate", lower: "DFEDTARL", upper: "DFEDTARU" },
  { key: "ecb", flag: "🇪🇺", label: "ECB Deposit Rate", series: "ECBDFR" },
] as const;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json({ rates: cache.rates, cached: true });
  }

  const apiKey = String(process.env.FRED_API_KEY ?? "").trim();
  const rates: PolicyRate[] = [await fetchRbaCashRate()];

  for (const spec of FRED_RATES) {
    const base: PolicyRate = {
      key: spec.key, flag: spec.flag, label: spec.label,
      value: null, display: "—", asOf: null, direction: null,
      source: "Federal Reserve Economic Data (FRED)",
    };

    if (!apiKey) {
      rates.push({ ...base, unavailable: "FRED_API_KEY is not configured" });
      continue;
    }

    if ("upper" in spec) {
      // The Fed sets a band, and reporting one edge of it as "the rate" is
      // wrong by 25bp half the time.
      const [lower, upper] = await Promise.all([
        fetchFredLatest(apiKey, spec.lower),
        fetchFredLatest(apiKey, spec.upper),
      ]);
      if (!upper) { rates.push({ ...base, unavailable: "No observation from FRED" }); continue; }
      rates.push({
        ...base,
        value: upper.value,
        display: lower ? `${lower.value.toFixed(2)}–${upper.value.toFixed(2)}%` : `${upper.value.toFixed(2)}%`,
        asOf: upper.date,
      });
      continue;
    }

    const point = await fetchFredLatest(apiKey, spec.series);
    if (!point) { rates.push({ ...base, unavailable: "No observation from FRED" }); continue; }
    rates.push({ ...base, value: point.value, display: `${point.value.toFixed(2)}%`, asOf: point.date });
  }

  cache = { at: Date.now(), rates };
  return NextResponse.json({
    rates,
    cached: false,
    note: "Policy rates as published by each central bank. A rate shown as — could not be "
      + "fetched; no previous value is substituted, because a stale policy rate is "
      + "indistinguishable from a current one.",
  });
}
