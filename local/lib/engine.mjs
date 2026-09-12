// Deterministic market analysis — the same rules the SPECTRE web scanner runs,
// ported to plain ESM so it can run offline on a user's machine.
//
// IMPORTANT: every number a local model ever sees is computed HERE, in code.
// Small local models are good at explaining structured data and bad at doing
// arithmetic on price series, so they never get to calculate anything.

export function mean(xs) {
  return xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
}

export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function rsi14(closes) {
  if (closes.length < 15) return null;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - 14; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  if (gain + loss === 0) return 50;
  const rs = loss === 0 ? 100 : gain / loss;
  return 100 - 100 / (1 + rs);
}

/**
 * Turn a series of daily bars into the SPECTRE stat block + anomaly flags.
 * @param {{c:number,o:number,h:number,l:number,v:number}[]} rows oldest → newest
 */
export function analyse(rows, meta = {}) {
  if (rows.length < 30) {
    return { error: "Not enough trading history to scan (need 30+ sessions)" };
  }

  const closes = rows.map((r) => r.c);
  const vols = rows.map((r) => r.v).filter((v) => v > 0);
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const price = last.c;
  const dayPct = prev.c > 0 ? ((last.c - prev.c) / prev.c) * 100 : 0;

  const ma50 = closes.length >= 50 ? mean(closes.slice(-50)) : null;
  const ma200 = closes.length >= 200 ? mean(closes.slice(-200)) : null;
  const rsi = rsi14(closes);
  const hi52 = Math.max(...rows.map((r) => r.h));
  const lo52 = Math.min(...rows.map((r) => r.l));
  const avgVol20 = vols.length >= 21 ? mean(vols.slice(-21, -1)) : null;
  const volRatio = avgVol20 && avgVol20 > 0 ? last.v / avgVol20 : null;
  const gapPct = prev.c > 0 ? ((last.o - prev.c) / prev.c) * 100 : 0;
  const rets = closes.slice(1).map((c, i) => (closes[i] > 0 ? (c - closes[i]) / closes[i] : 0));
  const vol10 = stdev(rets.slice(-10));
  const vol60 = stdev(rets.slice(-60));
  const drawdownPct = hi52 > 0 ? ((price - hi52) / hi52) * 100 : 0;
  const retFrom = (daysBack) => {
    const base = closes[closes.length - 1 - daysBack];
    return base != null && base > 0 ? ((price - base) / base) * 100 : null;
  };

  const stats = {
    symbol: meta.symbol ?? "",
    name: meta.name ?? "",
    currency: meta.currency ?? "",
    exchange: meta.exchange ?? "",
    price,
    open: last.o,
    high: last.h,
    low: last.l,
    prevClose: prev.c,
    dayPct,
    gapPct,
    ret30: closes.length > 21 ? retFrom(21) : null,
    ret90: closes.length > 63 ? retFrom(63) : null,
    ret1y: closes[0] > 0 ? ((price - closes[0]) / closes[0]) * 100 : null,
    rsi,
    ma50,
    ma200,
    ma50DistPct: ma50 != null && ma50 > 0 ? ((price - ma50) / ma50) * 100 : null,
    ma200DistPct: ma200 != null && ma200 > 0 ? ((price - ma200) / ma200) * 100 : null,
    hi52,
    lo52,
    pos52w: hi52 > lo52 ? ((price - lo52) / (hi52 - lo52)) * 100 : null,
    lastVol: last.v || null,
    avgVol20,
    volRatio,
    volXNorm: vol60 > 0 ? vol10 / vol60 : null,
    annVolPct: vol60 > 0 ? vol60 * Math.sqrt(252) * 100 : null,
    drawdownPct,
  };

  const anomalies = [];
  const add = (severity, title, detail) => anomalies.push({ severity, title, detail });

  if (rsi != null && rsi >= 75) add("alert", `RSI ${rsi.toFixed(0)} — heavily overbought`, "Momentum is stretched. Late entries here historically face pullback risk.");
  else if (rsi != null && rsi >= 68) add("watch", `RSI ${rsi.toFixed(0)} — running hot`, "Approaching overbought territory. Watch for exhaustion.");
  else if (rsi != null && rsi <= 25) add("alert", `RSI ${rsi.toFixed(0)} — heavily oversold`, "Selling pressure is extreme. Sometimes a washout, sometimes a falling knife — check the news before touching it.");
  else if (rsi != null && rsi <= 32) add("watch", `RSI ${rsi.toFixed(0)} — oversold zone`, "Weak momentum. If fundamentals are intact this is where dip-buyers start looking.");

  if (volRatio != null && volRatio >= 3) add("alert", `Volume ${volRatio.toFixed(1)}× the 20-day average`, "Unusual activity — something moved the crowd today. Check announcements before acting.");
  else if (volRatio != null && volRatio >= 1.8) add("watch", `Volume ${volRatio.toFixed(1)}× average`, "Elevated turnover versus the last month.");

  if (Math.abs(gapPct) >= 4) add("alert", `Opened ${gapPct > 0 ? "up" : "down"} ${Math.abs(gapPct).toFixed(1)}% on a gap`, "Price jumped between sessions — usually news-driven. Gaps often get retested.");
  if (Math.abs(dayPct) >= 5) add("alert", `Moved ${dayPct > 0 ? "+" : ""}${dayPct.toFixed(1)}% today`, "An outsized single-day move for most names. Confirm the cause before reacting.");

  if (hi52 > 0 && price >= hi52 * 0.98) add("watch", "Within 2% of its 52-week high", "Breakout territory — momentum names can run, but this is also where profit-taking clusters.");
  if (lo52 > 0 && price <= lo52 * 1.02) add("watch", "Within 2% of its 52-week low", "Testing the floor. Either deep value or a business problem — the chart can't tell you which.");

  if (ma50 != null && ma200 != null) {
    if (ma50 > ma200 && price < ma50) add("info", "Uptrend, but under the 50-day average", "Longer trend still up; short-term momentum has cooled.");
    if (ma50 < ma200) add("watch", "50-day average below 200-day (death-cross regime)", "The medium-term trend is down. Rallies inside this regime fail more often.");
  }
  if (vol60 > 0 && vol10 / vol60 >= 1.8) add("watch", `Volatility ${(vol10 / vol60).toFixed(1)}× its recent norm`, "Daily swings have widened sharply — size positions accordingly.");
  if (drawdownPct <= -30) add("info", `${Math.abs(drawdownPct).toFixed(0)}% below its 52-week high`, "Deep drawdown. Recovery requires the underlying problem to be fixed, not just time.");

  if (anomalies.length === 0) add("info", "No anomalies flagged", "Price, volume, momentum and volatility all look unremarkable versus this stock's own recent history.");

  return { stats, anomalies };
}

/** Portfolio-level concentration and risk signals across analysed holdings. */
export function analysePortfolio(positions) {
  const valued = positions.filter((p) => p.value > 0);
  const total = valued.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return { error: "No positions with a market value" };

  const weighted = valued
    .map((p) => ({ ...p, weight: (p.value / total) * 100 }))
    .sort((a, b) => b.weight - a.weight);

  const top3 = weighted.slice(0, 3).reduce((s, p) => s + p.weight, 0);
  const herfindahl = weighted.reduce((s, p) => s + (p.weight / 100) ** 2, 0);
  const effectiveNames = herfindahl > 0 ? 1 / herfindahl : 0;
  const portfolioVol = weighted.reduce((s, p) => s + (p.annVolPct ?? 0) * (p.weight / 100), 0);
  const dayMove = weighted.reduce((s, p) => s + (p.dayPct ?? 0) * (p.weight / 100), 0);

  const flags = [];
  const add = (severity, title, detail) => flags.push({ severity, title, detail });

  if (weighted[0] && weighted[0].weight >= 30) add("alert", `${weighted[0].symbol} is ${weighted[0].weight.toFixed(0)}% of the book`, "A single position this large drives most of your outcome, good or bad.");
  if (top3 >= 60) add("watch", `Top 3 positions are ${top3.toFixed(0)}% of the book`, "Concentrated. Diversification benefits fall away quickly past this point.");
  if (effectiveNames < 5) add("watch", `Effectively ${effectiveNames.toFixed(1)} independent positions`, "You hold more tickers than that, but weighting means only a few actually matter.");
  if (portfolioVol >= 35) add("watch", `Weighted annual volatility ${portfolioVol.toFixed(0)}%`, "High-volatility book — expect wide swings in normal conditions.");

  const alerting = weighted.filter((p) => p.anomalies?.some((a) => a.severity === "alert"));
  if (alerting.length) add("alert", `${alerting.length} holding${alerting.length > 1 ? "s" : ""} flagged an alert today`, alerting.map((p) => p.symbol).join(", "));

  if (flags.length === 0) add("info", "No portfolio-level flags", "Concentration, volatility and per-holding signals all look unremarkable.");

  return {
    totalValue: total,
    positions: weighted,
    top3Pct: top3,
    effectiveNames,
    weightedAnnVolPct: portfolioVol,
    weightedDayPct: dayMove,
    flags,
  };
}
