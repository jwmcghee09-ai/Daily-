/**
 * The portfolio the demo shows.
 *
 * It used to exist only in the browser: the dashboard built it in JavaScript
 * and assigned it to its own state. That is fine for drawing a table and wrong
 * for everything else, because every feature worth demonstrating is computed on
 * the server — look-through, risk, per-holding contributions, the fund
 * drill-down. The server saw an empty account, so those panels had nothing and
 * hid themselves, and a visitor evaluating the product saw the half of it that
 * needs no data.
 *
 * So the sample lives here, is written into the guest's own workspace, and the
 * demo reads it back through the same endpoints a real account uses. One
 * definition, and the demo exercises the real code path rather than a drawing
 * of it.
 *
 * The holdings are chosen to show the things that are hard to show:
 *
 *   IVV   an ASX-listed feeder into the US iShares Core S&P 500 ETF, which
 *         resolves from SEC filings with no key and no upload. This is the one
 *         that makes "Inside Your Funds" worth opening — without a fund that
 *         resolves, the panel can only offer to look through nothing.
 *   CBA   held directly AND inside IVV's Australian cousin, so concentration
 *   BHP   measured on securities differs from concentration measured on
 *         wrappers, which is the whole argument for look-through.
 *   SUPBAL a super balance with no public quote, to show it is still counted.
 *   GGF   a managed fund nothing can resolve, so the panel's honest "upload its
 *         file" state is visible too rather than only the happy path.
 */
import type { PortfolioHolding } from "@/lib/portfolio";

export interface DemoHoldingSeed {
  source: PortfolioHolding["source"];
  account: string;
  ticker: string;
  name: string;
  units: number;
  price: number;
  prevClose: number;
  costBase: number;
  sector: string;
}

export const DEMO_HOLDINGS: readonly DemoHoldingSeed[] = [
  { source: "super",   account: "AustralianSuper", ticker: "SUPBAL",      name: "Balanced Super Option",            units: 1,    price: 112000, prevClose: 112000, costBase: 104500, sector: "Super" },
  { source: "index",   account: "CommSec",         ticker: "IVV",         name: "iShares S&P 500 ETF",              units: 420,  price: 68.31,  prevClose: 68.52,  costBase: 25200,  sector: "Index" },
  { source: "asx",     account: "CommSec",         ticker: "CBA",         name: "Commonwealth Bank",                units: 120,  price: 131.44, prevClose: 130.92, costBase: 14820,  sector: "Banks" },
  { source: "asx",     account: "CommSec",         ticker: "BHP",         name: "BHP Group",                        units: 280,  price: 45.82,  prevClose: 45.28,  costBase: 11984,  sector: "Materials" },
  { source: "asx",     account: "CommSec",         ticker: "MQG",         name: "Macquarie Group",                  units: 35,   price: 218.75, prevClose: 215.72, costBase: 7035,   sector: "Financials" },
  { source: "index",   account: "Vanguard",        ticker: "VAS",         name: "Vanguard Australian Shares ETF",   units: 95,   price: 104.6,  prevClose: 103.95, costBase: 9120,   sector: "Index" },
  { source: "fund",    account: "Managed Funds",   ticker: "GGF",         name: "Global Growth Fund",               units: 220,  price: 68.4,   prevClose: 67.9,   costBase: 13750,  sector: "Managed Fund" },
  { source: "crypto",  account: "Kraken",          ticker: "BTC",         name: "Bitcoin",                          units: 0.42, price: 84200,  prevClose: 85740,  costBase: 28000,  sector: "Crypto" },
  { source: "crypto",  account: "Kraken",          ticker: "ETH",         name: "Ethereum",                         units: 7.5,  price: 3140,   prevClose: 3121.27, costBase: 18750, sector: "Crypto" },
  { source: "gold",    account: "ABC Bullion",     ticker: "ABC-AU",      name: "Allocated Gold Holdings",          units: 7.8,  price: 4490,   prevClose: 4472,   costBase: 31200,  sector: "Precious Metals" },
  { source: "savings", account: "Offset Saver",    ticker: "SAVINGSCASH", name: "Savings Cash Position",            units: 1,    price: 18450,  prevClose: 18450,  costBase: 18450,  sector: "Savings" },
];

/** The seed as full holdings, ready to write for a given workspace. */
export function demoHoldings(): PortfolioHolding[] {
  const now = new Date();
  const reportDate = now.toISOString().slice(0, 10);
  // Dated a couple of days back so the UI's "imported" line reads sensibly
  // rather than claiming the portfolio appeared this second.
  const importedAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

  return DEMO_HOLDINGS.map((h) => ({
    id: `demo:${h.source}:${h.ticker}`,
    source: h.source,
    account: h.account,
    ticker: h.ticker,
    name: h.name,
    units: h.units,
    price: h.price,
    prevClose: h.prevClose,
    value: Number((h.units * h.price).toFixed(2)),
    costBase: h.costBase,
    sector: h.sector,
    reportDate,
    importedAt,
  }));
}

/**
 * A value history to sit behind the risk figures.
 *
 * Deterministic from the total, so two visitors see the same demo and a
 * screenshot taken today still matches the product tomorrow. Shaped with a
 * couple of drawdowns because a line that only rises demonstrates nothing a
 * risk engine is for.
 */
export function demoSnapshots(totalValue: number): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  const days = 180;
  const start = Date.now() - days * 24 * 60 * 60 * 1000;

  for (let i = 0; i < days; i += 1) {
    const drift = totalValue * 0.00055 * i;
    const seasonal = Math.sin(i / 5) * (totalValue * 0.004) + Math.cos(i / 11) * (totalValue * 0.0026);
    const shock =
      i === 44 ? -totalValue * 0.021 :
      i === 92 ? -totalValue * 0.031 :
      i === 139 ? -totalValue * 0.016 : 0;
    const value = totalValue * 0.88 + drift + seasonal + shock;
    out.push({
      date: new Date(start + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      value: Number(Math.max(totalValue * 0.6, value).toFixed(2)),
    });
  }

  // End exactly on the real total, so the chart agrees with the KPI above it.
  out[out.length - 1] = {
    date: new Date().toISOString().slice(0, 10),
    value: Number(totalValue.toFixed(2)),
  };
  return out;
}
