// Valuing a book of holdings, without losing any of it.
//
// A market data feed can only quote listed securities. A real portfolio also
// contains cash sitting in a broker account, a super balance, and unlisted
// managed funds — all with a genuine value the SPECTRE account already knows.
// Earlier versions asked Yahoo for a quote and silently dropped anything it
// could not answer, which understated the total, skewed every weight, and left
// an assistant unable to say how much cash the user held.
//
// Nothing is dropped here. Holdings without a quote keep the account's own
// valuation and carry a reason; they are excluded only from the statistics that
// genuinely need a price history.

import { analyse, analysePortfolio } from "./engine.mjs";
import { loadBars } from "./quotes.mjs";

function labelOf(holding) {
  return holding.label || holding.ticker || holding.name || "Unnamed holding";
}

function baseFields(holding) {
  return {
    symbol: holding.ticker || "",
    label: labelOf(holding),
    name: holding.name || "",
    units: holding.units,
    costBase: holding.costBase,
    source: holding.source || "",
    account: holding.account || "",
    sector: holding.sector || "",
  };
}

/**
 * Value and analyse every holding.
 *
 * @param holdings each {ticker, units, costBase} and optionally {kind, name,
 *   label, value, lastPrice, source, account, sector} when they came from the
 *   SPECTRE account rather than a bare CSV.
 * @returns the portfolio summary plus `cashHoldings`, `statsUnavailable`
 *   (valued, but no market statistics) and `unvalued` (no value at all).
 */
export async function valueHoldings(holdings) {
  const positions = [];
  const cashHoldings = [];
  const statsUnavailable = [];
  const unvalued = [];

  for (const holding of holdings) {
    const base = baseFields(holding);

    if (holding.kind === "cash") {
      cashHoldings.push({ ...base, value: Number(holding.value) || 0, kind: "cash" });
      continue;
    }

    // Unquoted by nature (super, unlisted funds) — do not even ask the feed.
    const quotable = holding.kind !== "unquoted" && Boolean(holding.ticker);
    const bars = quotable ? await loadBars(holding.ticker) : null;
    const result = bars ? analyse(bars.rows, bars.meta) : null;

    if (result && !result.error) {
      positions.push({
        ...result.stats,
        ...base,
        symbol: result.stats.symbol || holding.ticker,
        value: result.stats.price * holding.units,
        pnlPct: holding.costBase > 0 ? ((result.stats.price - holding.costBase) / holding.costBase) * 100 : null,
        anomalies: result.anomalies,
        kind: "security",
      });
      continue;
    }

    const reason = !quotable
      ? (holding.kind === "unquoted" ? "Not publicly quoted — valued from your account" : "No ticker to price")
      : bars
        ? "Not enough price history to compute statistics"
        : "No market data found for this symbol";

    const value = Number(holding.value)
      || (holding.lastPrice != null ? holding.lastPrice * holding.units : 0);

    if (value > 0) {
      // Valued from the account, just without market statistics.
      statsUnavailable.push({ label: base.label, reason });
      positions.push({
        ...base,
        price: holding.lastPrice ?? null,
        value,
        pnlPct: holding.costBase > 0 && holding.lastPrice > 0
          ? ((holding.lastPrice - holding.costBase) / holding.costBase) * 100
          : null,
        anomalies: [],
        statsUnavailable: reason,
        kind: holding.kind === "unquoted" ? "unquoted" : "security",
      });
    } else {
      // Genuinely unknowable — a CSV row with a ticker nothing can price.
      unvalued.push({ label: base.label, units: holding.units, reason });
    }
  }

  const cash = cashHoldings.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
  if (!positions.length && cash <= 0) {
    throw new Error("Could not value any holdings — check the ticker symbols");
  }

  const summary = analysePortfolio(positions, { cash });
  if (summary.error) throw new Error(summary.error);

  return { ...summary, cashHoldings, statsUnavailable, unvalued };
}
