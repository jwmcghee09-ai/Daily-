/**
 * The forward-looking parts of the Quant tab, computed on the server.
 *
 * Monte Carlo and the stress scenarios previously ran only in the browser and
 * were handed to the AI through `clientQuantContext`, which meant anything not
 * rendering that page — the MCP server, a connected AI, any API caller — could
 * not see them at all. The maths is small and has no business being tied to a
 * canvas, so it lives here and both sides read the same implementation.
 *
 * One deliberate difference from the browser version: the simulation is seeded.
 * `Math.random()` gave a different projection on every render, which is fine for
 * a chart that redraws but wrong for a figure an assistant quotes back to the
 * user — ask twice, get two answers, and neither is reproducible. The seed is
 * derived from the inputs, so the same portfolio and horizon always produce the
 * same projection, and a changed portfolio produces a new one.
 */
import type { PortfolioSnapshot } from "@/lib/portfolio";

export interface MonteCarloResult {
  horizonDays: number;
  startValue: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** Percentile bands per day, oldest first — the fan the chart draws. */
  bands: { p10: number[]; p25: number[]; p50: number[]; p75: number[]; p90: number[] };
  paths: number;
  /** True when there was too little history and generic assumptions were used. */
  usedFallback: boolean;
  dailyMeanPct: number;
  dailyVolPct: number;
  returnsUsed: number;
  note: string;
  /**
   * Set when the fitted drift is too steep to extrapolate honestly. A short
   * run of gains produces a daily mean that, compounded over the horizon,
   * pushes even the 10th percentile above today's value — which reads as
   * "almost certainly up" when it only means "recently up".
   */
  driftWarning: string | null;
}

export interface StressScenario {
  name: string;
  shockPct: number;
  impact: number;
  projected: number;
}

/** Scenario set the Quant tab shows, kept in the same order. */
const STRESS_DEFS: Array<{ name: string; shockPct: number }> = [
  { name: "GFC-style crash", shockPct: -40 },
  { name: "Market correction", shockPct: -8 },
  { name: "Flash crash", shockPct: -5 },
  { name: "Bull rally", shockPct: 14.5 },
];

/** A single-day move applied to the whole book. Deterministic by definition. */
export function stressScenarios(totalValue: number): StressScenario[] {
  return STRESS_DEFS.map((def) => {
    const impact = totalValue * (def.shockPct / 100);
    return {
      name: def.name,
      shockPct: def.shockPct,
      impact: Math.round(impact),
      projected: Math.round(totalValue + impact),
    };
  });
}

/**
 * A fitted drift beyond roughly ±50% annualised says more about the length of
 * the sample than about the portfolio. The projection is still returned — it is
 * what the data implies — but it should not be read as a likely outcome.
 */
function driftWarning(dailyMean: number, usedFallback: boolean): string | null {
  if (usedFallback) return null;
  const annualisedPct = dailyMean * 252 * 100;
  if (Math.abs(annualisedPct) < 50) return null;
  return (
    `The fitted drift is ${annualisedPct.toFixed(0)}% annualised, taken from a short run of history. ` +
    `Compounded over the horizon it dominates the projection — every percentile inherits it, ` +
    `so treat the spread between p10 and p90 as the useful part and the level as unreliable.`
  );
}

/** mulberry32 — small, fast, and good enough for a projection fan. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, drawing from the seeded stream rather than Math.random. */
function normal(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Project the portfolio forward with a geometric random walk fitted to the
 * user's own daily returns.
 *
 * Returns null when there is not enough history to start from — a projection
 * from a single data point is a straight line dressed up as a forecast.
 */
export function runMonteCarlo(
  snapshots: PortfolioSnapshot[],
  options: { horizonDays?: number; paths?: number } = {},
): MonteCarloResult | null {
  const horizonDays = Math.min(Math.max(Math.trunc(options.horizonDays ?? 30), 1), 365);
  const pathCount = Math.min(Math.max(Math.trunc(options.paths ?? 500), 100), 5000);

  // One point per day, oldest first — the browser de-duplicates the same way,
  // because several imports on one day would otherwise read as daily moves.
  const byDay = new Map<string, { value: number; composition: string }>();
  for (const snapshot of snapshots) {
    const day = String(snapshot.date).slice(0, 10);
    const value = Number(snapshot.value);
    if (Number.isFinite(value) && value > 0) {
      byDay.set(day, { value, composition: snapshot.composition ?? "" });
    }
  }
  const points = Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, point]) => point);

  if (points.length < 2) return null;
  const values = points.map((point) => point.value);

  const returns: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    // A value move across a composition change is the book changing, not the
    // market. Fitting drift to it projects a crash or a boom that never
    // happened, and every percentile inherits it.
    const before = points[i - 1].composition;
    const after = points[i].composition;
    if (before && after && before !== after) continue;
    const r = points[i].value / points[i - 1].value - 1;
    // A >50% daily move is an import artefact, not a market move.
    if (Number.isFinite(r) && Math.abs(r) < 0.5) returns.push(r);
  }

  // Under ~20 observations the fitted parameters are noise, so fall back to
  // generic long-run assumptions and say so rather than projecting from dust.
  const usedFallback = returns.length < 20;
  let dailyMean: number;
  let dailySigma: number;
  if (usedFallback) {
    dailyMean = 0.08 / 252;
    dailySigma = 0.15 / Math.sqrt(252);
  } else {
    dailyMean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - dailyMean) ** 2, 0) / (returns.length - 1);
    dailySigma = Math.sqrt(variance);
  }

  const startValue = values[values.length - 1];

  // Seed from the inputs so the same portfolio always projects the same way.
  const seed = Math.abs(
    Math.round(startValue * 1000) ^ (returns.length * 2654435761) ^ (horizonDays * 40503),
  );
  const rand = seededRandom(seed || 1);

  const bands = { p10: [] as number[], p25: [] as number[], p50: [] as number[], p75: [] as number[], p90: [] as number[] };
  let current = new Float64Array(pathCount).fill(startValue);

  const pushDay = (day: Float64Array) => {
    const sorted = Float64Array.from(day).sort();
    bands.p10.push(percentile(sorted, 0.10));
    bands.p25.push(percentile(sorted, 0.25));
    bands.p50.push(percentile(sorted, 0.50));
    bands.p75.push(percentile(sorted, 0.75));
    bands.p90.push(percentile(sorted, 0.90));
  };

  pushDay(current);
  for (let day = 0; day < horizonDays; day += 1) {
    const next = new Float64Array(pathCount);
    for (let p = 0; p < pathCount; p += 1) {
      next[p] = current[p] * (1 + dailyMean + dailySigma * normal(rand));
    }
    current = next;
    pushDay(current);
  }

  const last = (series: number[]) => Math.round(series[series.length - 1]);

  return {
    horizonDays,
    startValue: Math.round(startValue),
    p10: last(bands.p10),
    p25: last(bands.p25),
    p50: last(bands.p50),
    p75: last(bands.p75),
    p90: last(bands.p90),
    bands,
    paths: pathCount,
    usedFallback,
    dailyMeanPct: Number((dailyMean * 100).toFixed(4)),
    dailyVolPct: Number((dailySigma * 100).toFixed(4)),
    returnsUsed: returns.length,
    note: usedFallback
      ? `Fewer than 20 daily returns available, so this uses generic assumptions (8% annual return, 15% annual volatility) rather than the portfolio's own history. Treat it as illustrative.`
      : `Fitted to ${returns.length} of the portfolio's own daily returns. A projection of volatility, not a forecast of value.`,
    driftWarning: driftWarning(dailyMean, usedFallback),
  };
}
