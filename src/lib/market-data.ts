/**
 * Broker-independent price data.
 *
 * Myrmidon's quotes and bars used to come from Alpaca's data feed, which
 * arrived with the broker credentials and only covered US listings. With no
 * broker connected, these read from Yahoo instead — which also means ASX
 * symbols (BHP.AX) work, and those are what an Australian imported portfolio is
 * actually made of.
 */

export interface DailyBar {
  /** ISO timestamp, matching the Alpaca bar shape the callers already parse. */
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const YAHOO_CHART = "https://query2.finance.yahoo.com/v8/finance/chart";

/** Daily OHLCV bars covering at least `days` trading days, newest last. */
export async function yahooDailyBars(symbol: string, days: number): Promise<DailyBar[]> {
  // Enough history for a 200-day EMA warmup on top of the requested window.
  const needed = days + 280;
  const range = needed > 500 ? "5y" : needed > 250 ? "2y" : "1y";
  const url = `${YAHOO_CHART}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: {
          quote?: Array<{
            open?: (number | null)[];
            high?: (number | null)[];
            low?: (number | null)[];
            close?: (number | null)[];
            volume?: (number | null)[];
          }>;
        };
      }>;
    };
  };

  const result = data?.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!stamps.length || !quote?.close) return [];

  const bars: DailyBar[] = [];
  for (let i = 0; i < stamps.length; i += 1) {
    const close = quote.close[i];
    if (close == null || !Number.isFinite(close)) continue;
    bars.push({
      t: new Date(stamps[i] * 1000).toISOString(),
      o: quote.open?.[i] ?? close,
      h: quote.high?.[i] ?? close,
      l: quote.low?.[i] ?? close,
      c: close,
      v: quote.volume?.[i] ?? 0,
    });
  }
  return bars;
}

/** Strip a user-supplied ticker to something safe, keeping Yahoo's dot suffix. */
export function normaliseSymbol(value: unknown, fallback = ""): string {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9.]/g, "") || fallback;
}
