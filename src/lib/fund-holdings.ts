/**
 * Resolving a fund into its holdings, from whichever source can answer.
 *
 * Three routes, in descending order of how much they can be trusted:
 *
 *   1. SEC N-PORT, for anything that is a US registered fund. Stable, uniform,
 *      ~28,000 funds, and a government filing system rather than a marketing
 *      site, so it keeps working.
 *   2. A cross-listing map, for ASX tickers that are the same fund as a US one
 *      — IVV on the ASX is a cross-listing of the US fund, VTS feeds VTI. Those
 *      resolve through route 1 for free. Funds that merely track a similar
 *      index are deliberately NOT mapped: NDQ is not QQQ, and pretending
 *      otherwise would put holdings in the book that the user does not own.
 *   3. An uploaded CSV, for everything else.
 *
 * Route 3 exists because the Australian data is published but not fetchable.
 * Super funds have been required to publish portfolio holdings as a downloadable
 * CSV since March 2022, and ASX issuers publish constituent files — but their
 * sites block automated requests (AustralianSuper answers 403, the ASX API 403)
 * and their URLs move. A signed-in human can download those files in one click.
 * So rather than ship a scraper that works this quarter and silently rots the
 * next, the file the regulator already requires is accepted directly.
 */
import type { FundComposition, FundConstituent } from "@/lib/lookthrough";
import { fetchNportComposition } from "@/lib/fund-sec";
import { fetch13fComposition } from "@/lib/fund-13f";
import { fetchBetasharesComposition } from "@/lib/fund-asx";
import { ASX_TO_US_FUND, AUD_HEDGED_FEEDERS } from "@/lib/fund-crosslist";
import { normaliseTicker } from "@/lib/lookthrough";

/**
 * The cross-listing map lives in its own module so the classifier can read it
 * too, and is re-exported here because this is where callers expect it.
 */
export { ASX_TO_US_FUND } from "@/lib/fund-crosslist";

export type ResolutionRoute = "sec" | "cross-listed" | "uploaded" | "13f" | "issuer";

export interface ResolvedFund extends FundComposition {
  route: ResolutionRoute;
}

export interface ResolveOptions {
  /** Compositions the user has uploaded, keyed by normalised ticker. */
  uploaded?: ReadonlyMap<string, FundComposition>;
  /** Treat the ticker as Australian when it carries no suffix. */
  market?: "asx" | "us";
}

/**
 * One fund's constituents, or null if nothing can answer for it.
 *
 * Never throws: an unresolvable fund is a normal outcome — most tickers in a
 * portfolio are ordinary shares — and the caller keeps the wrapper whole.
 */
export async function resolveFund(
  ticker: string,
  options: ResolveOptions = {},
): Promise<ResolvedFund | null> {
  const symbol = normaliseTicker(ticker);
  if (!symbol) return null;

  // An upload is the user telling us what they hold; it outranks a guess.
  const uploaded = options.uploaded?.get(symbol);
  if (uploaded && uploaded.constituents.length > 0) {
    return { ...uploaded, route: "uploaded" };
  }

  const isAsx = options.market === "asx" || /\.(AX|AU)$/i.test(ticker.trim());

  /*
   * What is this, before asking anyone what is inside it?
   *
   * Most tickers in a portfolio are ordinary shares, and every request spent
   * asking Betashares for BHP's constituent file is a request that returns 404
   * and a slot of the per-page resolution budget that a real fund could have
   * used. The classifier is cached in the database, so this costs one lookup
   * per ticker ever.
   *
   * A company is not skipped outright: Berkshire is a company and holds a
   * portfolio worth seeing. It is skipped on the routes that only a fund can
   * answer — an issuer constituent file, a fund register — and sent straight
   * to the 13F route, which is the one built for companies.
   */
  const identity = await import("@/lib/instrument-kind")
    .then((m) => m.classifyInstrument(ticker, { market: isAsx ? "asx" : options.market }))
    .catch(() => null);
  const isCompany = identity?.kind === "company" && !ASX_TO_US_FUND[symbol];

  // An index is a benchmark, not a holding with constituents anyone owns.
  if (identity?.kind === "index") return null;

  if (isAsx) {
    // The issuer's own file first: it is the fund itself, daily, and dated.
    const issuer = isCompany ? null : await fetchBetasharesComposition(symbol).catch(() => null);
    if (issuer) return { ...issuer, route: "issuer" };

    const usEquivalent = ASX_TO_US_FUND[symbol];
    if (usEquivalent) {
      const sec = await fetchNportComposition(usEquivalent).catch(() => null);
      if (sec) {
        return {
          ...sec,
          fundTicker: symbol,
          // Not the US fund's name. The user holds IHVV, and labelling their
          // holding "iShares Core S&P 500 ETF" because that is what the filing
          // says reads as though the ticker had been mixed up. `source` names
          // the filing, which is where that belongs.
          fundName: undefined,
          source: `SEC N-PORT via ${usEquivalent}`,
          route: "cross-listed",
          coverageNote: AUD_HEDGED_FEEDERS.has(symbol)
            ? `These are ${usEquivalent}'s holdings, which this fund owns through its units in it. `
              + "The AUD/USD forwards that hedge the currency are a separate position and are not "
              + "shown — the companies are right, the currency exposure is not represented."
            : undefined,
        };
      }
    }
    // No issuer file and no US twin: Australia has no central database, so
    // this one needs the holdings file uploaded.
    return null;
  }

  const sec = isCompany ? null : await fetchNportComposition(symbol).catch(() => null);
  if (sec) return { ...sec, route: "sec" };

  /*
   * Not a registered fund — but it may still be a vehicle held for the
   * portfolio inside it. Berkshire files 13Fs and no N-PORT, so without this
   * step it stays an opaque lump in an engine built to see inside things.
   *
   * Coverage is carried through rather than assumed: a 13F reports only
   * US-listed equities, which for Berkshire is about a quarter of the company.
   */
  const thirteenF = await fetch13fComposition(symbol).catch(() => null);
  if (thirteenF && thirteenF.constituents.length > 0) {
    const pct = thirteenF.coveragePct;
    return {
      fundTicker: symbol,
      constituents: thirteenF.constituents,
      source: "SEC Form 13F",
      asOf: thirteenF.asOf,
      route: "13f",
      // With no balance sheet to compare against there is no honest
      // denominator, so nothing is allocated rather than guessing one.
      coveragePct: pct ?? 0,
      coverageNote: pct != null
        ? `A 13F reports only US-listed equities — about ${pct.toFixed(0)}% of this holding's assets. `
          + "Operating businesses, cash, bonds and foreign listings are not in it."
        : "A 13F reports only US-listed equities, and this filer's total assets could not be read, "
          + "so the share it represents is unknown.",
    };
  }

  return null;
}

// ── Holdings files ──────────────────────────────────────────────────────────

/**
 * Column names seen across the files this has to read: the regulated Schedule
 * 8D layout Australian super funds publish, and the constituent exports from
 * the big ETF issuers. Matched loosely because no two of them agree on
 * capitalisation, spacing or wording.
 */
const COLUMN_PATTERNS: Record<string, RegExp> = {
  name: /^(name|security\s*name|issuer\s*name|holding|description|asset\s*name|company|investment)/i,
  ticker: /^(ticker|symbol|asx\s*code|code|security\s*id|exchange\s*code)/i,
  isin: /^isin/i,
  cusip: /^cusip/i,
  weight: /(weight|%\s*of|percent|allocation|holding\s*%)/i,
  value: /^(value|market\s*value|dollar\s*value|aud|amount|fair\s*value)/i,
  country: /^(country|domicile|listing\s*country|currency\s*country)/i,
  sector: /^(sector|gics|industry|asset\s*class\s*detail)/i,
  assetClass: /^(asset\s*class|asset\s*type|security\s*type|instrument)/i,
};

function matchColumns(header: readonly string[]): Record<string, number> {
  const found: Record<string, number> = {};
  header.forEach((raw, index) => {
    const cell = String(raw ?? "").trim();
    if (!cell) return;
    for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (found[field] === undefined && pattern.test(cell)) found[field] = index;
    }
  });
  return found;
}

/** "1,234.56", "$1,234.56", "12.5%", "(500)" — all of these appear. */
function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const text = String(value ?? "").trim();
  if (!text) return Number.NaN;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[()$,%\s]/g, "").replace(/[A-Za-z]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return Number.NaN;
  return negative ? -n : n;
}

export interface ParsedHoldingsFile {
  constituents: FundConstituent[];
  /** Whether weights were given or had to be derived from dollar values. */
  weightBasis: "reported" | "derived-from-value";
  rowsRead: number;
  rowsSkipped: number;
}

/**
 * Turn a holdings file's rows into constituents.
 *
 * Takes already-parsed rows rather than raw text so the caller can use whatever
 * reader suits the upload — the app already parses CSV, TSV and every
 * spreadsheet format for portfolio imports.
 *
 * Weights are preferred when the file reports them. Where it reports only
 * dollar values, weight is derived from the row's share of the file's total,
 * which is correct for a complete holdings file and is why `weightBasis` is
 * returned: a partial file derived this way will overstate every weight, and
 * the caller should say so rather than present it as fact.
 */
export function parseHoldingsRows(rows: readonly (readonly unknown[])[]): ParsedHoldingsFile {
  let headerIndex = -1;
  let columns: Record<string, number> = {};

  // Super PHD files carry several lines of fund and option metadata before the
  // table starts, so the header is searched for rather than assumed to be row 0.
  for (let i = 0; i < Math.min(rows.length, 30); i += 1) {
    const candidate = matchColumns((rows[i] ?? []).map((c) => String(c ?? "")));
    if (candidate.name !== undefined && (candidate.weight !== undefined || candidate.value !== undefined)) {
      headerIndex = i;
      columns = candidate;
      break;
    }
  }

  if (headerIndex === -1) {
    return { constituents: [], weightBasis: "reported", rowsRead: 0, rowsSkipped: rows.length };
  }

  const useWeight = columns.weight !== undefined;
  const raw: Array<FundConstituent & { rawValue: number }> = [];
  let skipped = 0;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const cell = (index: number | undefined) =>
      index === undefined ? "" : String(row[index] ?? "").trim();

    const name = cell(columns.name);
    if (!name) { skipped += 1; continue; }
    // Files often end with a totals line, which is not a holding.
    if (/^(total|grand\s*total|sum|net\s*assets)/i.test(name)) { skipped += 1; continue; }

    const weight = useWeight ? parseNumber(row[columns.weight!]) : Number.NaN;
    const value = columns.value !== undefined ? parseNumber(row[columns.value]) : Number.NaN;

    // A row has to carry one usable magnitude; shorts are out of scope.
    const magnitude = useWeight && Number.isFinite(weight) ? weight : value;
    if (!Number.isFinite(magnitude) || magnitude <= 0) { skipped += 1; continue; }

    raw.push({
      name,
      ticker: cell(columns.ticker) || undefined,
      isin: cell(columns.isin) || undefined,
      cusip: cell(columns.cusip) || undefined,
      country: cell(columns.country) || undefined,
      sector: cell(columns.sector) || undefined,
      assetClass: cell(columns.assetClass) || undefined,
      weightPct: useWeight && Number.isFinite(weight) ? weight : 0,
      rawValue: Number.isFinite(value) ? value : 0,
    });
  }

  let weightBasis: ParsedHoldingsFile["weightBasis"] = "reported";
  if (!useWeight || raw.every((r) => r.weightPct === 0)) {
    const total = raw.reduce((sum, r) => sum + r.rawValue, 0);
    if (total > 0) {
      for (const r of raw) r.weightPct = (r.rawValue / total) * 100;
      weightBasis = "derived-from-value";
    }
  }

  const constituents: FundConstituent[] = raw
    .filter((r) => r.weightPct > 0)
    .map((r) => {
      const c = { ...r } as FundConstituent & { rawValue?: number };
      delete c.rawValue;
      return c;
    });

  return {
    constituents,
    weightBasis,
    rowsRead: constituents.length,
    rowsSkipped: skipped + (raw.length - constituents.length),
  };
}
