/**
 * The full portfolio risk picture, in one call.
 *
 * SPECTRE already computes all of this for the Quant tab — concentration,
 * volatility, VaR, CVaR, beta, Sharpe, the correlation matrix — but the only
 * way to read it was to be a browser rendering that page. The local MCP server
 * therefore carried its own cut-down copy of the analysis (local/lib/engine.mjs)
 * and an AI connected to SPECTRE saw a fraction of what SPECTRE knows.
 *
 * Exposing it here means the tools report SPECTRE's real numbers rather than an
 * approximation of them, and a metric added to the site shows up for connected
 * AIs without anyone updating files on their own machine.
 *
 * Monte Carlo is deliberately absent: it runs in the browser on the Quant tab,
 * so there is nothing to read here yet. Saying so is better than implying the
 * absence is an error.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { estimateHistoricalRiskFromYahoo, readPortfolioState } from "@/lib/db";
import { computeMetrics, displayHoldingLabel, type PortfolioHolding, type RiskWindow } from "@/lib/portfolio";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The Yahoo estimate prices every holding; cap it so one slow feed cannot hang the call. */
const RISK_TIMEOUT_MS = 25_000;

function toRiskWindow(raw: string | null): RiskWindow {
  return raw === "1M" || raw === "3M" || raw === "1Y" ? raw : "3M";
}

/** Holdings carry more than a risk reader needs; keep what identifies and sizes them. */
function slimHolding(holding: PortfolioHolding & { weightPct: number }) {
  return {
    // What to call it: a placeholder ticker is never shown as a symbol.
    label: displayHoldingLabel(holding.ticker, holding.name),
    ticker: holding.ticker,
    name: holding.name,
    account: holding.account,
    sector: holding.sector,
    kind: holding.source,
    units: holding.units,
    price: holding.price,
    value: Number(holding.value.toFixed(2)),
    costBase: Number(holding.costBase.toFixed(2)),
    weightPct: Number(holding.weightPct.toFixed(2)),
  };
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  }

  const riskWindow = toRiskWindow(request.nextUrl.searchParams.get("window"));
  const state = readPortfolioState(user.id);

  if (!state.holdings.length) {
    return NextResponse.json(
      {
        error: "No portfolio imported yet — import a holdings file on spectre-assets.com first.",
        holdingCount: 0,
      },
      { status: 404 },
    );
  }

  const metrics = computeMetrics(state.holdings, state.snapshots, riskWindow);

  // Snapshot-derived risk needs a history the account may not have yet; the
  // Yahoo estimate rebuilds it from real price series instead. It is the slower
  // and less exact of the two, so it never blocks the rest of the answer.
  let historicalRisk: unknown = null;
  let historicalRiskError: string | null = null;
  try {
    historicalRisk = await Promise.race([
      estimateHistoricalRiskFromYahoo(user.id, riskWindow),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), RISK_TIMEOUT_MS)),
    ]);
    if (historicalRisk === null) historicalRiskError = "Timed out fetching price history.";
  } catch (error) {
    historicalRiskError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json({
    source: "spectre-account",
    riskWindow,
    updatedAt: state.updatedAt || null,
    holdingCount: state.holdings.length,

    // Position-level figures, computed from what the account holds.
    portfolio: {
      totalValue: metrics.totalValue,
      totalCost: metrics.totalCost,
      pnl: metrics.pnl,
      pnlPct: metrics.pnlPct,
      top3ConcentrationPct: metrics.top3ConcentrationPct,
      largestAccountPct: metrics.largestAccountPct,
      diversifiedIndexFundPct: metrics.diversifiedIndexFundPct,
      sourceRiskLoad: metrics.sourceRiskLoad,
      hhi: metrics.hhi,
      topHoldings: metrics.topHoldings.map(slimHolding),
      accountAllocation: metrics.accountAllocation,
      sectorAllocation: metrics.sectorAllocation,
    },

    // Risk from the account's own value history, when there is enough of it.
    snapshotRisk: {
      volatilityAnnualPct: metrics.volatilityAnnualPct,
      maxDrawdownPct: metrics.maxDrawdownPct,
      var95Pct: metrics.var95Pct,
      var95Amount: metrics.var95Amount,
      cvar95Pct: metrics.cvar95Pct,
      cvar95Amount: metrics.cvar95Amount,
      pointsUsed: metrics.riskPointsUsed,
      startDate: metrics.riskStartDate,
      endDate: metrics.riskEndDate,
      returnsCount: metrics.rawDailyReturnsCount,
      outliersRemoved: metrics.returnOutliersRemoved,
      note:
        metrics.riskPointsUsed > 0
          ? "Derived from your own portfolio value history."
          : "Not enough portfolio history yet — use historicalRisk instead.",
    },

    // Risk rebuilt from real price series: beta, Sharpe, correlations, regime.
    historicalRisk,
    historicalRiskError,

    // Last 90 value points, oldest first — enough to describe a trend.
    history: metrics.history.slice(-90),

    monteCarlo: null,
    notes: [
      "Every figure here is computed by SPECTRE, not estimated — cite them exactly.",
      "snapshotRisk comes from your recorded portfolio values; historicalRisk rebuilds the same measures from market price history and adds beta, Sharpe, Sortino, correlations and regime. They will not match exactly, and neither is wrong.",
      "monteCarlo is null because that simulation currently runs in the browser on the Quant tab, not on the server. It is not an error.",
      "In historicalRisk, `notPriced` lists holdings that have no market quote by design (super, unlisted funds, gold) — they are still part of the portfolio and are counted in every value and weight above. Only `failedTickers` means a lookup actually failed.",
    ],
  });
}
