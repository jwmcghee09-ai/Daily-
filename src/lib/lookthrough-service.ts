/**
 * Look-through for a whole portfolio: cache, resolve, fold, report.
 *
 * Sits between the raw holdings and the risk engine. Everything expensive or
 * failure-prone lives here so that `buildEffectiveBook` stays pure and the
 * callers stay simple.
 *
 * The governing rule is that a partial answer beats a missing one. Resolution
 * touches the network and the network fails; when it does, the fund stays in
 * the book as itself and is named in `unresolved`. The totals are therefore
 * always right even when the detail is incomplete — which is the only way a
 * risk number is safe to show.
 */
import {
  isRecentResolutionMiss,
  readFundComposition,
  recordResolutionMiss,
  writeFundComposition,
} from "@/lib/db";
import { resolveFund } from "@/lib/fund-holdings";
import {
  buildEffectiveBook,
  effectiveHhi,
  exposureBy,
  hiddenConcentration,
  normaliseTicker,
  type FundComposition,
  type FundConstituent,
  type LookThroughInput,
  type LookThroughResult,
} from "@/lib/lookthrough";
import { isSyntheticTicker } from "@/lib/portfolio";

/** Resolution is capped per request so one page view cannot stall on EDGAR. */
const MAX_LIVE_RESOLUTIONS = 12;

export interface PortfolioLookThrough extends LookThroughResult {
  /** Share of the portfolio that was successfully looked through. */
  coveragePct: number;
  hhi: number;
  byCountry: ReturnType<typeof exposureBy>;
  bySector: ReturnType<typeof exposureBy>;
  byAssetClass: ReturnType<typeof exposureBy>;
  hidden: ReturnType<typeof hiddenConcentration>;
  /** True when at least one fund resolved — the UI says nothing otherwise. */
  hasLookThrough: boolean;
}

function toComposition(cached: {
  ticker: string; fundName: string; route: string; source: string; asOf: string;
  constituents: unknown[]; coveragePct?: number | null; coverageNote?: string | null;
}): FundComposition {
  return {
    fundTicker: cached.ticker,
    fundName: cached.fundName || undefined,
    constituents: cached.constituents as FundConstituent[],
    source: cached.source,
    asOf: cached.asOf,
    // Carried through the cache: without it a 13F holding would read as fully
    // covered on every load after the first.
    coveragePct: cached.coveragePct ?? undefined,
    coverageNote: cached.coverageNote ?? undefined,
  };
}

/**
 * Which holdings are worth asking about.
 *
 * Cash, savings and the synthetic placeholder tickers the importer generates
 * for unlisted assets have nothing underneath them, and sending them to EDGAR
 * would spend the per-request budget on certain misses.
 */
function resolvableHoldings(holdings: readonly LookThroughInput[]): LookThroughInput[] {
  return holdings.filter((h) => {
    const ticker = (h.ticker || "").trim();
    if (!ticker || isSyntheticTicker(ticker.toUpperCase())) return false;
    return true;
  });
}

/**
 * Resolve every fund in a portfolio and fold them into one effective book.
 *
 * `userId` scopes uploaded compositions; public ones are shared.
 */
export async function lookThroughPortfolio(
  holdings: readonly LookThroughInput[],
  userId = "",
  options: { allowNetwork?: boolean } = {},
): Promise<PortfolioLookThrough> {
  const allowNetwork = options.allowNetwork !== false;
  const compositions = new Map<string, FundComposition>();
  const reasons = new Map<string, string>();

  const candidates = resolvableHoldings(holdings);
  // Largest first: with a capped budget, the positions that move the risk
  // numbers most should be the ones that get resolved.
  const ordered = [...candidates].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

  let liveCalls = 0;

  for (const holding of ordered) {
    const symbol = normaliseTicker(holding.ticker);
    if (compositions.has(symbol)) continue;

    const cached = readFundComposition(symbol, userId);
    if (cached) {
      if (cached.constituents.length > 0) compositions.set(symbol, toComposition(cached));
      continue;
    }

    if (isRecentResolutionMiss(symbol)) continue;
    if (!allowNetwork || liveCalls >= MAX_LIVE_RESOLUTIONS) {
      reasons.set(symbol, "Not resolved yet — refresh to look this fund through");
      continue;
    }

    liveCalls += 1;
    try {
      // The import's own source is the reliable signal; the suffix is not,
      // since Australian portfolios list bare codes.
      const australian = holding.source === "asx" || holding.source === "super"
        || holding.source === "index" || holding.source === "fund"
        || /\.(AX|AU)$/i.test(holding.ticker);
      const resolved = await resolveFund(holding.ticker, {
        market: australian ? "asx" : undefined,
      });
      if (resolved && resolved.constituents.length > 0) {
        compositions.set(symbol, resolved);
        writeFundComposition({
          ticker: symbol,
          fundName: resolved.fundName,
          route: resolved.route,
          source: resolved.source,
          asOf: resolved.asOf,
          constituents: resolved.constituents,
          coveragePct: resolved.coveragePct,
          coverageNote: resolved.coverageNote,
        });
      } else {
        // Not a fund, or a fund with no public filing. Both are normal.
        recordResolutionMiss(symbol, "No public constituent data");
      }
    } catch (error) {
      // A network failure must not be cached as "not a fund" — that would make
      // one bad minute look like a permanent absence of data.
      reasons.set(symbol, error instanceof Error ? error.message : "Lookup failed");
    }
  }

  const result = buildEffectiveBook(holdings, compositions, {
    unresolvedReason: (ticker) => reasons.get(normaliseTicker(ticker)) ?? "No constituents reported",
  });

  return {
    ...result,
    coveragePct: result.totalValue > 0 ? (result.resolvedValue / result.totalValue) * 100 : 0,
    hhi: effectiveHhi(result.positions),
    byCountry: exposureBy(result.positions, "country"),
    bySector: exposureBy(result.positions, "sector"),
    byAssetClass: exposureBy(result.positions, "assetClass"),
    hidden: hiddenConcentration(result),
    hasLookThrough: compositions.size > 0,
  };
}

/**
 * The same fold using only what is already cached.
 *
 * For paths that must not touch the network — a page render, or the MCP server
 * answering a question — so they get look-through when it is available and the
 * plain book when it is not, without ever waiting on EDGAR.
 */
export async function lookThroughCached(
  holdings: readonly LookThroughInput[],
  userId = "",
): Promise<PortfolioLookThrough> {
  return lookThroughPortfolio(holdings, userId, { allowNetwork: false });
}
