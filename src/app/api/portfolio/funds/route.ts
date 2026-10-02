/**
 * The funds you own, and what is inside each one.
 *
 * The look-through panel answers "what do I actually hold?" by blending every
 * fund into one book — which is the right answer to that question and the wrong
 * shape for a different one: "what is inside THIS fund?" Once blended, a fund's
 * own sector mix and its own holdings are gone, and the only way back to them
 * was to read a filing yourself.
 *
 * Two shapes, deliberately:
 *   - no `ticker`  -> the list of funds, with enough to choose between them
 *   - with `ticker` -> that one fund's holdings and its own rollups
 *
 * The list stays small while a single fund can run to thousands of lines, and
 * sending every fund's full constituents to draw a list of six would be most of
 * a megabyte for nothing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readFundComposition, readPortfolioState } from "@/lib/db";
import {
  exposureBy,
  normaliseTicker,
  type EffectivePosition,
  type FundConstituent,
} from "@/lib/lookthrough";
import { displayHoldingLabel, isSyntheticTicker } from "@/lib/portfolio";

export const runtime = "nodejs";

/** How many holdings one fund returns. AGG reports over 13,000. */
const MAX_HOLDINGS = 250;

/**
 * Constituents as positions, so the same rollups the whole-portfolio view uses
 * can be reused here rather than reimplemented against a second shape.
 */
function toPositions(constituents: readonly FundConstituent[], fundValue: number): EffectivePosition[] {
  const reported = constituents.reduce(
    (sum, c) => sum + (Number.isFinite(c.weightPct) ? Math.max(0, c.weightPct) : 0), 0);
  if (reported <= 0) return [];

  return constituents.map((c) => {
    const weight = Number.isFinite(c.weightPct) ? Math.max(0, c.weightPct) : 0;
    return {
      key: c.isin ?? c.cusip ?? c.ticker ?? c.name,
      ticker: c.ticker,
      name: c.name,
      isin: c.isin,
      cusip: c.cusip,
      // What this line is worth inside the parcel the user actually owns.
      value: fundValue * (weight / reported),
      // Rescaled to the fund, which is what "11.7% of A200" means.
      weightPct: (weight / reported) * 100,
      country: c.country,
      sector: c.sector,
      assetClass: c.assetClass,
      direct: false,
      via: [],
    };
  });
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const state = readPortfolioState(user.id);
  const holdings = (state.holdings ?? []).filter((h) => {
    const ticker = String(h.ticker ?? "").trim();
    return ticker.length > 0 && !isSyntheticTicker(ticker.toUpperCase());
  });

  const wanted = normaliseTicker(request.nextUrl.searchParams.get("ticker") ?? "");

  // ── One fund ──────────────────────────────────────────────────────────────
  if (wanted) {
    const holding = holdings.find((h) => normaliseTicker(h.ticker) === wanted);
    if (!holding) {
      return NextResponse.json({ error: `You do not hold ${wanted}.` }, { status: 404 });
    }

    const cached = readFundComposition(wanted, user.id);
    if (!cached || cached.constituents.length === 0) {
      return NextResponse.json(
        {
          ticker: wanted,
          label: displayHoldingLabel(holding.ticker, holding.name),
          value: holding.value,
          resolved: false,
          reason: "No constituent data for this holding yet. US funds resolve from SEC filings; "
            + "for an ASX fund or a super option, upload its holdings file.",
        },
        { status: 200 },
      );
    }

    const constituents = cached.constituents as FundConstituent[];
    const positions = toPositions(constituents, holding.value);
    const sorted = [...positions].sort((a, b) => b.value - a.value);

    /*
     * Does the issuer's own arithmetic add up?
     *
     * Constituents are rescaled to the holding, so they always sum to 100% by
     * construction — which means a parser that quietly dropped a tenth of the
     * fund would produce a page that looks perfectly consistent and is wrong by
     * a tenth. The reported weights are kept unscaled for exactly this check.
     *
     * A couple of percent is ordinary: issuers round, and some report a
     * position with no weight at all. A200 carries one such row, an index
     * futures contract with blank weight and blank value, and the remaining
     * lines still total 100%. A large shortfall is not rounding.
     */
    const reportedSum = constituents.reduce(
      (sum, c) => sum + (Number.isFinite(c.weightPct) ? Math.max(0, c.weightPct) : 0), 0);
    const weightsAccountedFor = reportedSum > 0 ? reportedSum : null;

    return NextResponse.json({
      ticker: wanted,
      label: cached.fundName || displayHoldingLabel(holding.ticker, holding.name),
      value: holding.value,
      resolved: true,
      source: cached.source,
      asOf: cached.asOf,
      route: cached.route,
      coveragePct: cached.coveragePct,
      coverageNote: cached.coverageNote,
      holdingCount: positions.length,
      // Rollups over the fund alone — its own sector mix, not the portfolio's.
      bySector: exposureBy(positions, "sector"),
      byCountry: exposureBy(positions, "country"),
      byAssetClass: exposureBy(positions, "assetClass"),
      holdings: sorted.slice(0, MAX_HOLDINGS).map((p) => ({
        name: p.name,
        ticker: p.ticker ?? null,
        weightPct: p.weightPct,
        // Your money in this company, through this fund.
        value: p.value,
        sector: p.sector ?? null,
        country: p.country ?? null,
      })),
      truncated: positions.length > MAX_HOLDINGS,
      // The issuer's own weights before rescaling — near 100 means nothing of
      // substance was lost between their file and this page.
      weightsAccountedFor,
      weightsNote: weightsAccountedFor != null && Math.abs(weightsAccountedFor - 100) > 3
        ? `The file's own weights total ${weightsAccountedFor.toFixed(1)}%, not 100%. `
          + "Percentages here are scaled to what it reported, so they describe that part of the fund."
        : null,
      note: "Weights are the fund's own, as reported in the filing or file named in `source`, "
        + "effective `asOf` — not today. `value` is your share of each company through this holding.",
    });
  }

  // ── The list ──────────────────────────────────────────────────────────────
  interface FundSummary {
    ticker: string;
    label: string;
    value: number;
    source: string;
    asOf: string;
    route: string;
    coveragePct: number | null;
    holdingCount: number;
    topSectors: ReturnType<typeof exposureBy>;
    topHolding: string | null;
  }

  const funds: FundSummary[] = [];
  for (const holding of holdings) {
    const ticker = normaliseTicker(holding.ticker);
    const cached = readFundComposition(ticker, user.id);
    if (!cached || cached.constituents.length === 0) continue;

    const positions = toPositions(cached.constituents as FundConstituent[], holding.value);
    funds.push({
      ticker,
      label: cached.fundName || displayHoldingLabel(holding.ticker, holding.name),
      value: holding.value,
      source: cached.source,
      asOf: cached.asOf,
      route: cached.route,
      coveragePct: cached.coveragePct,
      holdingCount: positions.length,
      // Enough to tell two funds apart without opening either.
      topSectors: exposureBy(positions, "sector").slice(0, 3),
      topHolding: positions.length
        ? [...positions].sort((a, b) => b.weightPct - a.weightPct)[0].name
        : null,
    });
  }

  funds.sort((a, b) => b.value - a.value);

  return NextResponse.json({
    funds,
    // Named so the UI can say why a fund the user holds is missing from the list.
    unresolved: holdings
      .filter((h) => {
        const t = normaliseTicker(h.ticker);
        return !funds.some((f) => f.ticker === t);
      })
      .map((h) => ({
        ticker: normaliseTicker(h.ticker),
        label: displayHoldingLabel(h.ticker, h.name),
        value: h.value,
      })),
  });
}
