/**
 * ETF holdings from Financial Modeling Prep, the structured route.
 *
 * This is the honest version of "search the web for what is in the fund". It is
 * NOT a scrape of a results page and NOT a model reading a snippet — both of
 * which would put a confident, fictional portfolio into someone's risk numbers,
 * the one failure this engine exists to avoid. It is a structured financial-data
 * API the product already pays for, which returns a fund's constituents as rows
 * with weights and identifiers, dated. A real source, treated as one.
 *
 * Where it sits in the order: SEC N-PORT first, always, because a government
 * filing is more authoritative than a vendor's aggregation. FMP is the fallback
 * for a fund N-PORT could not answer — a listing FMP covers that the N-PORT
 * path missed, or a US-twin lookup that came back empty. 13F still handles
 * holding companies, which are a different thing.
 *
 * Every row of caution the rest of the resolver takes, this takes too:
 *   - Returns null, never throws: an unresolved fund is an ordinary outcome.
 *   - Returns null on no key, a non-200, an empty body, or rows it cannot read,
 *     so a rate limit or a free-tier gate degrades to "upload the file", never
 *     to a wrong portfolio.
 *   - Carries the date FMP reports and flags partial coverage as partial.
 */
import type { FundComposition, FundConstituent } from "@/lib/lookthrough";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const TIMEOUT_MS = 15_000;

/** A single ISO-3166 country, when FMP reports one in a shape worth trusting. */
function cleanCountry(raw: unknown): string | undefined {
  const text = String(raw ?? "").trim();
  // FMP mixes "US", "United States" and "" here; only a two-letter code is
  // used, because a full name would not match the ISO codes the rest of the
  // engine groups by and would silently create a second "United States" bucket.
  return /^[A-Za-z]{2}$/.test(text) ? text.toUpperCase() : undefined;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

interface FmpRow {
  asset?: unknown; symbol?: unknown; name?: unknown;
  isin?: unknown; cusip?: unknown;
  weightPercentage?: unknown; weight?: unknown; pctVal?: unknown;
  marketValue?: unknown; marketValueUsd?: unknown;
  sector?: unknown; country?: unknown; updated?: unknown; asOfDate?: unknown;
}

/**
 * One fund's holdings from FMP, or null if it cannot answer for this symbol.
 *
 * The field names are read defensively because FMP's own shape has drifted
 * across its v3 and "stable" tiers (weightPercentage vs weight, asset vs
 * symbol) and the account tier changes what is populated. Anything the parse
 * cannot make sense of is a null, not a guess.
 */
export async function fetchFmpHoldings(symbol: string): Promise<FundComposition | null> {
  const key = String(process.env.FMP_API_KEY ?? "").trim();
  if (!key) return null;

  const clean = symbol.trim().toUpperCase().replace(/\.(AX|AU)$/i, "");
  if (!/^[A-Z0-9.\-]{1,12}$/.test(clean)) return null;

  const url = `${FMP_BASE}/etf/holdings?symbol=${encodeURIComponent(clean)}&apikey=${encodeURIComponent(key)}`;

  let rows: FmpRow[];
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    // A 402/403 is the premium gate, a 429 a rate limit. None of them is a fund
    // with no holdings, so none is cached as a miss by the caller — they are
    // just "not from here, this time".
    if (!res.ok) return null;
    const body = await res.json();
    if (!Array.isArray(body) || body.length === 0) return null;
    rows = body as FmpRow[];
  } catch {
    return null;
  }

  // Build constituents, keeping each row's own reported weight. Where FMP gives
  // only a market value, weight is derived from the rows' total — correct only
  // if the set is complete, which is why the completeness of the weight sum is
  // what decides coverage below rather than being assumed.
  const withValue: Array<FundConstituent & { mv: number }> = [];
  for (const row of rows) {
    const name = String(row.name ?? "").trim();
    const ticker = String(row.asset ?? row.symbol ?? "").trim().toUpperCase();
    if (!name && !ticker) continue;
    // A totals or cash sweep line is not a company holding.
    if (/^(total|net\s+other|cash|usd|u\.s\. dollar)/i.test(name)) continue;

    const weight = num(row.weightPercentage ?? row.weight ?? row.pctVal);
    const mv = num(row.marketValue ?? row.marketValueUsd);

    withValue.push({
      name: name || ticker,
      ticker: ticker && /^[A-Z0-9.\-]{1,10}$/.test(ticker) ? ticker : undefined,
      isin: /^[A-Z0-9]{12}$/.test(String(row.isin ?? "").trim().toUpperCase())
        ? String(row.isin).trim().toUpperCase() : undefined,
      cusip: /^[A-Z0-9]{9}$/.test(String(row.cusip ?? "").trim().toUpperCase())
        ? String(row.cusip).trim().toUpperCase() : undefined,
      sector: String(row.sector ?? "").trim() || undefined,
      country: cleanCountry(row.country),
      weightPct: Number.isFinite(weight) && weight > 0 ? weight : 0,
      mv: Number.isFinite(mv) && mv > 0 ? mv : 0,
    });
  }

  if (withValue.length === 0) return null;

  // Derive weights from market value only when the file reported none at all.
  const anyWeight = withValue.some((c) => c.weightPct > 0);
  if (!anyWeight) {
    const totalMv = withValue.reduce((sum, c) => sum + c.mv, 0);
    if (totalMv <= 0) return null;
    for (const c of withValue) c.weightPct = (c.mv / totalMv) * 100;
  }

  const constituents: FundConstituent[] = withValue
    .filter((c) => c.weightPct > 0)
    .map((c) => {
      const out = { ...c } as FundConstituent & { mv?: number };
      delete out.mv;
      return out;
    });

  if (constituents.length === 0) return null;

  // Coverage from the reported weights: a complete set sums to ~100 (rounding
  // aside) and stands for the whole fund; a short set is carried as partial so
  // the engine allocates only what was reported and keeps the rest as the fund.
  const weightSum = constituents.reduce((sum, c) => sum + c.weightPct, 0);
  const complete = weightSum >= 95 && weightSum <= 101;

  const reportedDate = String(rows[0]?.updated ?? rows[0]?.asOfDate ?? "").trim();
  const asOf = /^\d{4}-\d{2}-\d{2}/.test(reportedDate)
    ? reportedDate.slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return {
    fundTicker: clean,
    constituents,
    source: "Financial Modeling Prep (etf/holdings)",
    asOf,
    coveragePct: complete ? undefined : Math.min(100, weightSum),
    coverageNote: complete
      ? undefined
      : `Financial Modeling Prep reported holdings covering about ${weightSum.toFixed(0)}% of the fund. `
        + "The rest is shown as the holding itself rather than scaled up.",
  };
}
