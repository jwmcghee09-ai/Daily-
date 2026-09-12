// Price history fetcher. This is the only thing that touches the network —
// your holdings file never leaves the machine, and neither does the analysis.

const UA = "Mozilla/5.0";

/** ASX-first resolution, matching the web scanner: bare tickers try .AX first. */
export function candidatesFor(raw) {
  const cleaned = String(raw).trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (!cleaned) return [];
  return cleaned.includes(".") ? [cleaned] : [`${cleaned}.AX`, cleaned];
}

async function fetchChart(symbol, { timeoutMs = 12000 } = {}) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!quote?.close?.length) return null;

  const rows = [];
  for (let i = 0; i < quote.close.length; i++) {
    const c = quote.close[i];
    if (c == null || !(c > 0)) continue;
    rows.push({
      c,
      o: quote.open?.[i] ?? c,
      h: quote.high?.[i] ?? c,
      l: quote.low?.[i] ?? c,
      v: quote.volume?.[i] ?? 0,
    });
  }
  return {
    rows,
    meta: {
      symbol,
      name: result.meta?.shortName || result.meta?.longName || symbol,
      currency: result.meta?.currency || "",
      exchange: result.meta?.exchangeName || "",
    },
  };
}

/** Resolve a ticker to bars, trying ASX before the US listing. */
export async function loadBars(ticker, opts) {
  for (const symbol of candidatesFor(ticker)) {
    try {
      const hit = await fetchChart(symbol, opts);
      if (hit) return hit;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}
