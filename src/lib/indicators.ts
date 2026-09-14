/**
 * Technical indicators, computed once and shared.
 *
 * The scanner previously covered RSI, moving averages, the 52-week range and
 * volume ratio — the standard set, and enough to say whether something is
 * stretched. What it could not say is whether a trend is actually strong, how
 * wide the normal daily range is, whether volatility has compressed ahead of a
 * move, or whether a stock is beating the market it trades in. Those are the
 * questions that separate "this moved" from "this is worth looking at".
 *
 * Everything here is a pure function over OHLCV arrays (oldest first), so the
 * same code serves the web scanner and anything reading it over MCP. Every
 * function returns null rather than a fabricated number when there is not
 * enough history — a 14-day ATR from 6 bars is a guess wearing a suit.
 */

export interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const window = values.slice(-period);
  return window.reduce((sum, value) => sum + value, 0) / period;
}

/** Exponential moving average series, NaN-padded to match the input length. */
export function emaSeries(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export interface Macd {
  line: number;
  signal: number;
  histogram: number;
  /** Bars since the line last crossed the signal, and which way. */
  crossedAgo: number | null;
  crossDirection: "bullish" | "bearish" | null;
}

/**
 * MACD with crossover detection. The value alone says little; what matters is
 * that the line has just crossed its signal, and how recently.
 */
export function macd(closes: number[], fast = 12, slow = 26, smooth = 9): Macd | null {
  if (closes.length < slow + smooth) return null;
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const line = closes.map((_, i) =>
    Number.isNaN(fastEma[i]) || Number.isNaN(slowEma[i]) ? NaN : fastEma[i] - slowEma[i],
  );
  const valid = line.filter((value) => !Number.isNaN(value));
  if (valid.length < smooth) return null;
  const signalValid = emaSeries(valid, smooth);

  // Re-align the signal against the original index space.
  const signal: number[] = new Array(line.length).fill(NaN);
  let cursor = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (Number.isNaN(line[i])) continue;
    signal[i] = signalValid[cursor];
    cursor += 1;
  }

  const last = line.length - 1;
  if (Number.isNaN(line[last]) || Number.isNaN(signal[last])) return null;

  // A crossing only counts once the two lines have actually separated. When
  // momentum is flat the line and its signal converge, and noise flips their
  // order every few bars — reporting each flip as a signal would produce a
  // stream of "bullish crossovers" through a steady decline. The gap is
  // measured against price so the threshold means the same thing on a $2 stock
  // and a $200 one.
  const price = closes[closes.length - 1];
  const meaningful = (index: number) =>
    price > 0 && Math.abs(line[index] - signal[index]) / price > 0.001;

  let crossedAgo: number | null = null;
  let crossDirection: Macd["crossDirection"] = null;
  if (meaningful(last)) {
    for (let i = last; i > 0; i -= 1) {
      if (Number.isNaN(line[i - 1]) || Number.isNaN(signal[i - 1])) break;
      const nowAbove = line[i] > signal[i];
      const thenAbove = line[i - 1] > signal[i - 1];
      if (nowAbove !== thenAbove) {
        crossedAgo = last - i;
        crossDirection = nowAbove ? "bullish" : "bearish";
        break;
      }
    }
  }

  return {
    line: line[last],
    signal: signal[last],
    histogram: line[last] - signal[last],
    crossedAgo,
    crossDirection,
  };
}

export interface Bollinger {
  upper: number;
  mid: number;
  lower: number;
  /** Band width as a percentage of the middle band. */
  widthPct: number;
  /** Where price sits in the band: 0 = lower, 1 = upper. */
  positionPct: number;
  /** True when width is in the bottom fifth of the last six months. */
  squeeze: boolean;
}

/**
 * Bollinger bands plus a squeeze flag. A squeeze — unusually narrow bands —
 * says volatility has compressed, which historically precedes expansion. It
 * gives no direction, and the flag is worded that way wherever it surfaces.
 */
export function bollinger(closes: number[], period = 20, mult = 2): Bollinger | null {
  if (closes.length < period) return null;

  const widthAt = (endIndex: number): number | null => {
    if (endIndex + 1 < period) return null;
    const window = closes.slice(endIndex + 1 - period, endIndex + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    if (mean <= 0) return null;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    return ((2 * mult * Math.sqrt(variance)) / mean) * 100;
  };

  const last = closes.length - 1;
  const window = closes.slice(-period);
  const mid = window.reduce((sum, value) => sum + value, 0) / period;
  const sd = Math.sqrt(window.reduce((sum, value) => sum + (value - mid) ** 2, 0) / period);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const width = widthAt(last);
  if (width == null || mid <= 0) return null;

  const history: number[] = [];
  for (let i = Math.max(period - 1, last - 125); i <= last; i += 1) {
    const w = widthAt(i);
    if (w != null) history.push(w);
  }
  const sorted = [...history].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.2)] ?? width;

  return {
    upper,
    mid,
    lower,
    widthPct: width,
    positionPct: upper > lower ? ((closes[last] - lower) / (upper - lower)) * 100 : 50,
    squeeze: history.length >= 30 && width <= threshold,
  };
}

/**
 * Average True Range, as an absolute value and as a percentage of price.
 *
 * Unlike standard deviation of closes, this counts gaps — the move that happens
 * between sessions, which is exactly where an overnight announcement lands. It
 * is the honest answer to "how much does this normally move in a day".
 */
export function atr(bars: Bar[], period = 14): { value: number; pct: number } | null {
  if (bars.length < period + 1) return null;
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prevClose = bars[i - 1].c;
    trueRanges.push(
      Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - prevClose),
        Math.abs(bars[i].l - prevClose),
      ),
    );
  }
  // Wilder's smoothing.
  let value = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  for (let i = period; i < trueRanges.length; i += 1) {
    value = (value * (period - 1) + trueRanges[i]) / period;
  }
  const price = bars[bars.length - 1].c;
  if (!(price > 0)) return null;
  return { value, pct: (value / price) * 100 };
}

/**
 * ADX — trend strength, direction-agnostic. Above 25 is a real trend; below 20
 * means range-bound, where trend-following signals misfire most often. This is
 * the measure that tells you whether a moving-average cross is worth anything.
 */
export function adx(bars: Bar[], period = 14): { adx: number; plusDi: number; minusDi: number } | null {
  if (bars.length < period * 2 + 1) return null;

  const plusDm: number[] = [];
  const minusDm: number[] = [];
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const up = bars[i].h - bars[i - 1].h;
    const down = bars[i - 1].l - bars[i].l;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    const prevClose = bars[i - 1].c;
    trueRanges.push(
      Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prevClose), Math.abs(bars[i].l - prevClose)),
    );
  }

  const wilder = (values: number[]): number[] => {
    const out: number[] = [];
    let sum = values.slice(0, period).reduce((total, value) => total + value, 0);
    out.push(sum);
    for (let i = period; i < values.length; i += 1) {
      sum = sum - sum / period + values[i];
      out.push(sum);
    }
    return out;
  };

  const smoothedTr = wilder(trueRanges);
  const smoothedPlus = wilder(plusDm);
  const smoothedMinus = wilder(minusDm);

  const dx: number[] = [];
  for (let i = 0; i < smoothedTr.length; i += 1) {
    if (smoothedTr[i] <= 0) continue;
    const plusDi = (smoothedPlus[i] / smoothedTr[i]) * 100;
    const minusDi = (smoothedMinus[i] / smoothedTr[i]) * 100;
    const denom = plusDi + minusDi;
    if (denom <= 0) continue;
    dx.push((Math.abs(plusDi - minusDi) / denom) * 100);
  }
  if (dx.length < period) return null;

  let adxValue = dx.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let i = period; i < dx.length; i += 1) {
    adxValue = (adxValue * (period - 1) + dx[i]) / period;
  }

  const lastIndex = smoothedTr.length - 1;
  return {
    adx: adxValue,
    plusDi: smoothedTr[lastIndex] > 0 ? (smoothedPlus[lastIndex] / smoothedTr[lastIndex]) * 100 : 0,
    minusDi: smoothedTr[lastIndex] > 0 ? (smoothedMinus[lastIndex] / smoothedTr[lastIndex]) * 100 : 0,
  };
}

/** Stochastic %K and %D — where price sits in its recent range. */
export function stochastic(bars: Bar[], period = 14, smooth = 3): { k: number; d: number } | null {
  if (bars.length < period + smooth) return null;
  const kValues: number[] = [];
  for (let i = period - 1; i < bars.length; i += 1) {
    const window = bars.slice(i + 1 - period, i + 1);
    const high = Math.max(...window.map((bar) => bar.h));
    const low = Math.min(...window.map((bar) => bar.l));
    kValues.push(high > low ? ((bars[i].c - low) / (high - low)) * 100 : 50);
  }
  const k = kValues[kValues.length - 1];
  const d = sma(kValues, smooth);
  if (d == null) return null;
  return { k, d };
}

/**
 * On-Balance Volume trend. The absolute number is meaningless across stocks;
 * the direction over the last month is what says whether volume is confirming
 * the price move or quietly contradicting it.
 */
export function obvTrend(bars: Bar[], lookback = 20): { slopePct: number; direction: "rising" | "falling" | "flat" } | null {
  if (bars.length < lookback + 2) return null;
  const obv: number[] = [0];
  for (let i = 1; i < bars.length; i += 1) {
    const prev = obv[obv.length - 1];
    if (bars[i].c > bars[i - 1].c) obv.push(prev + bars[i].v);
    else if (bars[i].c < bars[i - 1].c) obv.push(prev - bars[i].v);
    else obv.push(prev);
  }
  const recent = obv.slice(-lookback);
  const change = recent[recent.length - 1] - recent[0];
  const scale = Math.max(...recent.map((value) => Math.abs(value)), 1);
  const slopePct = (change / scale) * 100;
  return {
    slopePct,
    direction: slopePct > 5 ? "rising" : slopePct < -5 ? "falling" : "flat",
  };
}

/**
 * Recent swing levels — the prices the market has actually turned at,
 * classified against where price is NOW.
 *
 * A pivot low sitting above the current price is not support; price has already
 * broken through it. Returning it under that label invites a reader to state a
 * floor that is really a ceiling, so those are separated out as `broken`.
 * Levels are ordered nearest-first, which is the order they matter in.
 */
export function pivots(
  bars: Bar[],
  price: number,
  width = 5,
  limit = 3,
): { resistance: number[]; support: number[]; broken: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = bars.length - width - 1; i >= width; i -= 1) {
    const window = bars.slice(i - width, i + width + 1);
    if (bars[i].h >= Math.max(...window.map((bar) => bar.h))) highs.push(bars[i].h);
    if (bars[i].l <= Math.min(...window.map((bar) => bar.l))) lows.push(bars[i].l);
    if (highs.length + lows.length >= limit * 4) break;
  }

  const byDistance = (a: number, b: number) => Math.abs(a - price) - Math.abs(b - price);
  // Separate pivots often land on the same price; listing it twice reads as two
  // levels when it is one that simply held more than once.
  const dedupe = (levels: number[]) => {
    const kept: number[] = [];
    for (const level of levels.sort(byDistance)) {
      if (!kept.some((existing) => Math.abs(existing - level) / Math.max(level, 1e-9) < 0.002)) {
        kept.push(level);
      }
    }
    return kept.slice(0, limit);
  };

  return {
    resistance: dedupe(highs.filter((level) => level > price)),
    support: dedupe(lows.filter((level) => level < price)),
    // Swing highs now below price, and swing lows now above it: levels the
    // market has already traded through, which often reverse their role.
    broken: dedupe([...highs.filter((l) => l <= price), ...lows.filter((l) => l >= price)]),
  };
}

/**
 * Relative strength against a benchmark over several windows.
 *
 * "Up 8% this quarter" means something different when the index is up 12%.
 * This is the difference, so a stock that is rising while lagging its market
 * can be told apart from one that is actually leading.
 */
export function relativeStrength(
  closes: number[],
  benchmarkCloses: number[],
): { ret30: number | null; ret90: number | null; leading: boolean | null } {
  const change = (series: number[], back: number): number | null => {
    if (series.length <= back) return null;
    const then = series[series.length - 1 - back];
    if (!(then > 0)) return null;
    return ((series[series.length - 1] - then) / then) * 100;
  };
  const rel = (back: number): number | null => {
    const own = change(closes, back);
    const bench = change(benchmarkCloses, back);
    if (own == null || bench == null) return null;
    return own - bench;
  };
  const ret30 = rel(21);
  const ret90 = rel(63);
  return { ret30, ret90, leading: ret90 == null ? null : ret90 > 0 };
}
