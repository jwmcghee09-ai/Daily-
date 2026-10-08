/**
 * Reading a previous close out of a Yahoo chart response.
 *
 * One small function, because getting it wrong is both easy and invisible.
 *
 * `meta.chartPreviousClose` reads like "yesterday's close" and is not: it is
 * the close immediately BEFORE the requested range. Ask for a year of daily
 * bars and it hands back the close from a year ago. Nothing errors, the number
 * is real, and every percentage derived from it is a year's move wearing the
 * label of a day's.
 *
 * On the research page that produced BHP at +46.07%, oil at +46.47% and
 * AUD/USD at +5.71% — against true daily moves of −2.02%, +3.78% and −0.36%.
 * Three of those have the wrong sign, which is worse than being merely large:
 * a reader checking whether their holding is up or down was told the opposite.
 *
 * Measured on BHP, the error scales with the window you asked for:
 *
 *     range=2d   chartPreviousClose −2.66%   closes[-2] −2.02%
 *     range=5d   chartPreviousClose +1.54%   closes[-2] −2.02%
 *     range=1y   chartPreviousClose +46.07%  closes[-2] −2.02%
 *
 * So the series is the answer at every range, and the last bar is today's —
 * partial while the market is open, final after it closes — which makes the one
 * before it yesterday in both cases.
 *
 * `meta.previousClose` would be correct if it were there. It is not: the chart
 * endpoint does not return that field at all, which is why every caller that
 * listed it first silently fell through to the wrong one.
 */

export interface YahooChartMetaLike {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
}

export interface YahooChartResultLike {
  meta?: YahooChartMetaLike;
  indicators?: { quote?: Array<{ close?: (number | null)[] }> };
}

/** Daily closes from a chart result, nulls and non-positives removed. */
export function validCloses(result: YahooChartResultLike | undefined): number[] {
  const raw = result?.indicators?.quote?.[0]?.close ?? [];
  return raw.filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0);
}

/**
 * The close before the latest one, which is what a day's change is measured
 * against.
 *
 * Falls back to `chartPreviousClose` only when the series is too short to
 * answer — a brand new listing, or a response that carried no quote block. That
 * fallback is wrong by however long the requested range was, so callers asking
 * for more than a couple of days should treat it as a last resort, which is
 * exactly what this ordering makes it.
 */
export function previousCloseFrom(result: YahooChartResultLike | undefined): number | null {
  const closes = validCloses(result);
  if (closes.length > 1) return closes[closes.length - 2];

  const meta = result?.meta ?? {};
  // Kept first among the metadata for the day it starts being returned; it is
  // the field that actually means what this function wants.
  if (typeof meta.previousClose === "number" && meta.previousClose > 0) return meta.previousClose;
  if (typeof meta.chartPreviousClose === "number" && meta.chartPreviousClose > 0) {
    return meta.chartPreviousClose;
  }
  return null;
}

/** Percentage change against the previous close, or null when it cannot be had. */
export function dayChangePct(price: number | null, prevClose: number | null): number | null {
  if (price == null || prevClose == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose <= 0) return null;
  return ((price - prevClose) / prevClose) * 100;
}
