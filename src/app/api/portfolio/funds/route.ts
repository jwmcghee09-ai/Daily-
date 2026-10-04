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
import { guardDemoGuest, resolvePortfolioActor } from "@/lib/portfolio-actor";
import { readFundComposition, readPortfolioState } from "@/lib/db";
import { hasIssuerPage } from "@/lib/fund-render";
import { isIssuerCategorySet } from "@/lib/fund-sec";
import {
  cachedInstrumentKind,
  classifyInstrument,
  unresolvedReason,
  type InstrumentIdentity,
} from "@/lib/instrument-kind";
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
 * How many holdings get identified on one request.
 *
 * Classification is cached for a quarter, so this only bites on the first load
 * of a new portfolio. Capping it means a fifty-line book draws the panel
 * promptly with the largest holdings named and the tail filled in next time,
 * rather than holding the panel open behind fifty lookups.
 */
const MAX_LIVE_CLASSIFICATIONS = 12;
/** Lookups in parallel — enough to be quick, few enough to be polite. */
const CLASSIFY_CONCURRENCY = 4;

/**
 * Identify a batch of holdings, newest answers cached in the database.
 *
 * `allowNetwork` is false past the cap rather than the whole call being
 * skipped, so anything already known still comes back named.
 */
async function identify(
  wanted: readonly { ticker: string; market: "asx" | "us" | undefined }[],
): Promise<Map<string, InstrumentIdentity>> {
  const out = new Map<string, InstrumentIdentity>();
  let spent = 0;

  const queue = [...wanted];
  const workers = Array.from({ length: Math.min(CLASSIFY_CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;

      // A cached answer costs nothing, so it does not consume the budget —
      // which matters on a long book, where otherwise the first twelve
      // already-known holdings would use up the allowance meant for the
      // unknown ones.
      const known = await cachedInstrumentKind(next.ticker).catch(() => null);
      if (known) { out.set(next.ticker, known); continue; }

      const allowNetwork = spent < MAX_LIVE_CLASSIFICATIONS;
      if (allowNetwork) spent += 1;
      const identity = await classifyInstrument(next.ticker, { market: next.market, allowNetwork })
        .catch(() => null);
      if (identity) out.set(next.ticker, identity);
    }
  });

  await Promise.all(workers);
  return out;
}

/** Australian unless the import says otherwise; bare codes carry no suffix. */
function marketOf(holding: { ticker?: string | null; source?: string | null }): "asx" | "us" | undefined {
  const source = String(holding.source ?? "");
  if (source === "asx" || source === "super" || source === "index" || source === "fund") return "asx";
  if (/\.(AX|AU)$/i.test(String(holding.ticker ?? ""))) return "asx";
  if (source === "us") return "us";
  return undefined;
}

/**
 * Constituents as positions, so the same rollups the whole-portfolio view uses
 * can be reused here rather than reimplemented against a second shape.
 */
function toPositions(constituents: readonly FundConstituent[], fundValue: number): EffectivePosition[] {
  const reported = constituents.reduce(
    (sum, c) => sum + (Number.isFinite(c.weightPct) ? Math.max(0, c.weightPct) : 0), 0);
  if (reported <= 0) return [];

  /*
   * Rescale a complete file, never a partial one.
   *
   * A full holdings file misses 100% only by rounding, so normalising it is a
   * tidy-up. A partial source is different: an issuer page lists a top ten
   * adding to a third of the fund, and scaling that to 100% reports BHP at 35%
   * of VAS when Vanguard says 11.78%. Worse, it would disagree with the
   * portfolio view, which allocates only the covered share — the same holding
   * showing two different weights on one screen.
   *
   * So weights below the rounding band are left exactly as the issuer stated
   * them, and the panel's own warning explains why they do not reach 100.
   */
  const complete = Math.abs(reported - 100) <= 5;
  const divisor = complete ? reported : 100;

  return constituents.map((c) => {
    const weight = Number.isFinite(c.weightPct) ? Math.max(0, c.weightPct) : 0;
    return {
      key: c.isin ?? c.cusip ?? c.ticker ?? c.name,
      ticker: c.ticker,
      name: c.name,
      isin: c.isin,
      cusip: c.cusip,
      // What this line is worth inside the parcel the user actually owns.
      value: fundValue * (weight / divisor),
      // The issuer's own figure, so "11.78% of VAS" means what Vanguard says.
      weightPct: (weight / divisor) * 100,
      country: c.country,
      sector: c.sector,
      assetClass: c.assetClass,
      direct: false,
      // Everything here arrived through the fund being inspected, by definition.
      directValue: 0,
      via: [],
    };
  });
}

/**
 * What to call a holding beside its ticker.
 *
 * displayHoldingLabel prefers the symbol, which is right for a table keyed by
 * ticker and wrong here: the ticker already has its own column, so repeating it
 * as the name told the reader nothing. The imported name is used when it says
 * something the symbol does not.
 */
function holdingName(ticker: string, name: string | null | undefined): string {
  const clean = String(name ?? "").trim();
  const symbol = String(ticker ?? "").trim().toUpperCase();
  if (clean && clean.toUpperCase() !== symbol) return clean;
  return displayHoldingLabel(ticker, name);
}

export async function GET(request: NextRequest) {
  const actor = await resolvePortfolioActor(request);
  if (!actor) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  // Identifying holdings touches the exchange, so a guest gets a budget. The
  // answers are cached by ticker across everyone, so in practice a guest
  // looking at a common Australian book spends nothing.
  const limited = guardDemoGuest(request, actor, "funds", 20, 60_000);
  if (limited) return limited;

  const state = readPortfolioState(actor.userId);
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

    const cached = readFundComposition(wanted, actor.userId);
    if (!cached || cached.constituents.length === 0) {
      // Why it is not here, not just that it is not — "upload its holdings
      // file" is the wrong instruction for a mining company.
      const identity = await classifyInstrument(wanted, { market: marketOf(holding) })
        .catch(() => null);
      return NextResponse.json(
        {
          ticker: wanted,
          label: identity?.name || holdingName(holding.ticker, holding.name),
          value: holding.value,
          resolved: false,
          kind: identity?.kind ?? "unknown",
          kindBasis: identity?.basis ?? null,
          reason: unresolvedReason(identity?.kind ?? "unknown"),
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
    const bySector = exposureBy(positions, "sector");

    const reportedSum = constituents.reduce(
      (sum, c) => sum + (Number.isFinite(c.weightPct) ? Math.max(0, c.weightPct) : 0), 0);
    const weightsAccountedFor = reportedSum > 0 ? reportedSum : null;

    return NextResponse.json({
      ticker: wanted,
      label: cached.fundName || holdingName(holding.ticker, holding.name),
      value: holding.value,
      resolved: true,
      source: cached.source,
      asOf: cached.asOf,
      route: cached.route,
      coveragePct: cached.coveragePct,
      coverageNote: cached.coverageNote,
      holdingCount: positions.length,
      // Rollups over the fund alone — its own sector mix, not the portfolio's.
      bySector,
      // N-PORT classifies the issuer, not the sector, so for a fund resolved
      // from a filing this column is "Corporate issuer" all the way down. It
      // gets its own heading rather than being presented as a sector mix.
      sectorHeading: isIssuerCategorySet(bySector.map((s) => s.label)) ? "Issuer type" : "Sectors",
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
    sectorHeading: string;
    topHolding: string | null;
  }

  const funds: FundSummary[] = [];
  for (const holding of holdings) {
    const ticker = normaliseTicker(holding.ticker);
    const cached = readFundComposition(ticker, actor.userId);
    if (!cached || cached.constituents.length === 0) continue;

    const positions = toPositions(cached.constituents as FundConstituent[], holding.value);
    const sectors = exposureBy(positions, "sector");
    funds.push({
      ticker,
      label: cached.fundName || holdingName(holding.ticker, holding.name),
      value: holding.value,
      source: cached.source,
      asOf: cached.asOf,
      route: cached.route,
      coveragePct: cached.coveragePct,
      holdingCount: positions.length,
      // Enough to tell two funds apart without opening either.
      topSectors: sectors.slice(0, 3),
      sectorHeading: isIssuerCategorySet(sectors.map((s) => s.label)) ? "Issuer type" : "Sectors",
      topHolding: positions.length
        ? [...positions].sort((a, b) => b.weightPct - a.weightPct)[0].name
        : null,
    });
  }

  funds.sort((a, b) => b.value - a.value);

  const missing = holdings.filter((h) => {
    const t = normaliseTicker(h.ticker);
    return !funds.some((f) => f.ticker === t);
  });

  /*
   * What each unlooked-through holding actually is.
   *
   * Until this existed the panel put every one of them under "No holdings data
   * — upload its file to see inside", which for BHP is an instruction to
   * produce a document that does not exist. Largest first, so a capped budget
   * is spent on the holdings that matter most.
   */
  const identities = await identify(
    [...missing]
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
      .map((h) => ({ ticker: normaliseTicker(h.ticker), market: marketOf(h) })),
  );

  return NextResponse.json({
    funds,
    // Named so the UI can say why a fund the user holds is missing from the list.
    unresolved: missing.map((h) => {
      const ticker = normaliseTicker(h.ticker);
      const identity = identities.get(ticker);
      const kind = identity?.kind ?? "unknown";
      return {
        ticker,
        // The issuer's own name where a lookup found one: "iShares S&P 500 AUD
        // Hedged ETF" says more than the imported label usually does.
        label: identity?.name || holdingName(h.ticker, h.name),
        value: h.value,
        kind,
        /** How that was decided, so a wrong label can be traced. */
        kindBasis: identity?.basis ?? null,
        exchange: identity?.exchange ?? null,
        reason: unresolvedReason(kind),
        // Whether the issuer's page can be read on request, so the UI offers
        // fetching only where there is something to fetch. Never for a
        // company: there is no holdings page to render.
        fetchable: kind !== "company" && hasIssuerPage(ticker),
      };
    }),
  });
}
