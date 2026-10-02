/**
 * Risk, per holding rather than per portfolio.
 *
 * Every risk figure SPECTRE reports is a single number for the whole book:
 * one volatility, one VaR, one beta. That answers "how risky is this
 * portfolio?" and refuses the more useful question, "which part of it is
 * carrying the risk?"
 *
 * The data for the second question was already being fetched and discarded.
 * estimateHistoricalRiskFromYahoo builds a daily return series per ticker to
 * compute the correlation matrix, then blends everything into one series and
 * throws the parts away. This module runs the same maths over each series
 * instead.
 *
 * The figure that matters most here is `riskContributionPct`, not volatility.
 * Volatility ranks a holding by how much it moves on its own; contribution
 * ranks it by how much of the PORTFOLIO's risk it is responsible for, which
 * accounts for both its weight and how it moves against everything else. Those
 * two rankings disagree often, and when they do the contribution one is the one
 * worth acting on: a 5% position at 40% volatility can carry more risk than a
 * 30% position at 10%, and a volatile holding that moves opposite the rest can
 * contribute almost nothing.
 */

export interface HoldingRisk {
  ticker: string;
  label: string;
  value: number;
  weightPct: number;
  volatilityAnnualPct: number | null;
  maxDrawdownPct: number | null;
  var95Pct: number | null;
  cvar95Pct: number | null;
  betaToBenchmark: number | null;
  correlationToPortfolio: number | null;
  sharpeRatioAnnual: number | null;
  sortinoRatioAnnual: number | null;
  /** Share of total portfolio volatility this holding is responsible for. */
  riskContributionPct: number | null;
  /** Its risk share divided by its weight. Above 1 means it punches above its size. */
  riskPerUnitWeight: number | null;
  pointsUsed: number;
}

const TRADING_DAYS = 252;
/** Below this many observations a standard deviation is noise, not a measure. */
const MIN_POINTS = 20;

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) ** 2;
  // Sample standard deviation: these are observations, not the population.
  return Math.sqrt(sum / (values.length - 1));
}

function covariance(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += (a[i] - ma) * (b[i] - mb);
  return sum / (n - 1);
}

function correlation(a: readonly number[], b: readonly number[]): number | null {
  const sa = stdDev(a);
  const sb = stdDev(b);
  if (sa === 0 || sb === 0) return null;
  return covariance(a, b) / (sa * sb);
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[index];
}

/** Average of the losses beyond the 5th percentile — what the tail costs. */
function expectedShortfall95(returns: readonly number[]): number | null {
  const cutoff = percentile(returns, 0.05);
  if (cutoff == null) return null;
  const tail = returns.filter((r) => r <= cutoff);
  return tail.length === 0 ? null : mean(tail);
}

/** Worst peak-to-trough on the curve these returns imply. */
function maxDrawdownFromReturns(returns: readonly number[]): number | null {
  if (returns.length < 2) return null;
  let level = 1;
  let peak = 1;
  let worst = 0;
  for (const r of returns) {
    level *= 1 + r;
    if (level > peak) peak = level;
    if (peak > 0) worst = Math.min(worst, level / peak - 1);
  }
  return worst;
}

function sharpe(returns: readonly number[]): number | null {
  const sd = stdDev(returns);
  if (sd === 0) return null;
  // Excess over cash is omitted deliberately: the rate would have to be chosen,
  // and every holding here is measured the same way, so the ranking is unchanged.
  return (mean(returns) / sd) * Math.sqrt(TRADING_DAYS);
}

function sortino(returns: readonly number[]): number | null {
  const downside = returns.filter((r) => r < 0);
  if (downside.length < 2) return null;
  // Downside deviation is taken about zero, not about the mean: the question is
  // how badly it loses, not how much its losses vary.
  let sum = 0;
  for (const r of downside) sum += r * r;
  const dd = Math.sqrt(sum / downside.length);
  if (dd === 0) return null;
  return (mean(returns) / dd) * Math.sqrt(TRADING_DAYS);
}

export interface HoldingRiskInput {
  /**
   * Lookup identity into `returnsByTicker`, which is keyed "source:TICKER" so
   * the same symbol on two exchanges stays distinct. Kept separate from
   * `ticker` because that key is not something to put in front of a reader.
   */
  key: string;
  ticker: string;
  label: string;
  value: number;
}

/**
 * Per-holding risk over a set of aligned dates.
 *
 * Holdings are looked up by their `key`, and only dates present for every
 * holding are used, so each figure describes the same period and the
 * contributions sum to the whole.
 */
export function computeHoldingRisk(
  holdings: readonly HoldingRiskInput[],
  returnsByTicker: ReadonlyMap<string, ReadonlyMap<string, number>>,
  dates: readonly string[],
  benchmarkReturnsByDate?: ReadonlyMap<string, number>,
): HoldingRisk[] {
  const totalValue = holdings.reduce((sum, h) => sum + (Number(h.value) || 0), 0);
  if (totalValue <= 0 || dates.length < 2) return [];

  // Each holding's aligned series, and the blended portfolio series they imply.
  const series = new Map<string, number[]>();
  for (const holding of holdings) {
    const byDate = returnsByTicker.get(holding.key);
    if (!byDate) continue;
    series.set(holding.key, dates.map((d) => byDate.get(d) ?? 0));
  }

  const portfolioReturns = dates.map((_, i) => {
    let day = 0;
    for (const holding of holdings) {
      const s = series.get(holding.key);
      if (!s) continue;
      day += ((Number(holding.value) || 0) / totalValue) * s[i];
    }
    return day;
  });

  const portfolioVariance = stdDev(portfolioReturns) ** 2;

  const out: HoldingRisk[] = [];
  for (const holding of holdings) {
    const value = Number(holding.value) || 0;
    const weight = value / totalValue;
    const s = series.get(holding.key);

    if (!s || s.length < 2) {
      out.push({
        ticker: holding.ticker, label: holding.label, value,
        weightPct: weight * 100,
        volatilityAnnualPct: null, maxDrawdownPct: null, var95Pct: null, cvar95Pct: null,
        betaToBenchmark: null, correlationToPortfolio: null,
        sharpeRatioAnnual: null, sortinoRatioAnnual: null,
        riskContributionPct: null, riskPerUnitWeight: null, pointsUsed: 0,
      });
      continue;
    }

    const enough = s.length >= MIN_POINTS;
    const var95 = enough ? percentile(s, 0.05) : null;
    const cvar95 = enough ? expectedShortfall95(s) : null;
    const dd = maxDrawdownFromReturns(s);

    /*
     * Marginal contribution to risk.
     *
     * A holding's share of portfolio variance is its weight times its
     * covariance with the portfolio, divided by portfolio variance. These sum
     * to exactly 100% across all holdings, which is what makes the column
     * answer "where is the risk?" rather than merely ranking volatilities.
     */
    let contribution: number | null = null;
    if (portfolioVariance > 0) {
      contribution = ((weight * covariance(s, portfolioReturns)) / portfolioVariance) * 100;
    }

    let beta: number | null = null;
    if (benchmarkReturnsByDate) {
      const pairsA: number[] = [];
      const pairsB: number[] = [];
      dates.forEach((d, i) => {
        const bm = benchmarkReturnsByDate.get(d);
        if (bm === undefined) return;
        pairsA.push(s[i]);
        pairsB.push(bm);
      });
      const bmVar = stdDev(pairsB) ** 2;
      if (pairsA.length >= 2 && bmVar > 0) beta = covariance(pairsA, pairsB) / bmVar;
    }

    out.push({
      ticker: holding.ticker,
      label: holding.label,
      value,
      weightPct: weight * 100,
      volatilityAnnualPct: stdDev(s) * Math.sqrt(TRADING_DAYS) * 100,
      maxDrawdownPct: dd != null ? dd * 100 : null,
      var95Pct: var95 != null ? Math.max(0, -var95 * 100) : null,
      cvar95Pct: cvar95 != null ? Math.max(0, -cvar95 * 100) : null,
      betaToBenchmark: beta,
      correlationToPortfolio: correlation(s, portfolioReturns),
      sharpeRatioAnnual: sharpe(s),
      sortinoRatioAnnual: sortino(s),
      riskContributionPct: contribution,
      // Above 1: this holding carries more of the risk than its size suggests.
      riskPerUnitWeight: contribution != null && weight > 0 ? contribution / (weight * 100) : null,
      pointsUsed: s.length,
    });
  }

  // Biggest risk contributor first — the row most worth reading.
  return out.sort((a, b) => (b.riskContributionPct ?? -Infinity) - (a.riskContributionPct ?? -Infinity));
}
