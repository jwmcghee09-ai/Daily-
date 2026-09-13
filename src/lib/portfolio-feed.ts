/**
 * The imported portfolio, expressed in the shape the Myrmidon terminal and the
 * Analytics page already speak.
 *
 * Those two pages were written against Alpaca: an account object, a list of
 * positions, a portfolio-history series and an order list. Now that Myrmidon is
 * disconnected from any broker (see lib/broker.ts) they had nothing to read and
 * rendered empty. Rather than rewrite both front ends, this module projects the
 * user's uploaded holdings — CSVs, and trades ingested from forwarded broker
 * confirmations — into the same shape, with a `source` marker so the clients can
 * adjust wording, currency and the sleeve split.
 *
 * The numbers here are already in AUD (that is what the importers store), so the
 * feed reports `currency: "AUD"` and `audUsdRate: null` — the clients divide by
 * the rate only when one is present, which keeps the broker path unchanged.
 */
import { listIngestTrades, readPortfolioState } from "@/lib/db";
import { displayHoldingLabel, type PortfolioHolding, type PortfolioState } from "@/lib/portfolio";

/** Sources that behave like a long-term base rather than an active pick. */
const CORE_SOURCES = new Set(["index", "fund", "super"]);
/** Sources that are cash rather than a position. */
const CASH_SOURCES = new Set(["savings"]);

export interface FeedPosition {
  symbol: string;
  qty: string;
  current_price: string;
  market_value: string;
  cost_basis: string;
  avg_entry_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  change_today: string;
  side: "long";
  asset_class: string;
  exchange: string;
  /** Extras the portfolio feed adds; the broker path leaves them undefined. */
  sleeve: "core" | "alpha";
  name: string;
  sector: string;
  account: string;
  pricingLabel: string;
}

export interface FeedOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  type: string;
  status: string;
  submitted_at: string | null;
  filled_at: string | null;
  /** Extras for the portfolio feed. */
  broker?: string;
  confidence?: number;
}

export interface SleeveDescriptor {
  label: string;
  /** Target weight as a percentage, or null when the sleeve has no target. */
  targetPct: number | null;
}

export interface PortfolioFeed {
  source: "portfolio";
  brokerConnected: false;
  currency: "AUD";
  sourceLabel: string;
  holdingsCount: number;
  updatedAt: string | null;
  sleeves: { core: SleeveDescriptor; alpha: SleeveDescriptor };
  account: {
    account_number: string;
    status: string;
    currency: "AUD";
    equity: string;
    last_equity: string;
    cash: string;
    buying_power: string;
    portfolio_value: string;
  };
  positions: FeedPosition[];
  history: { equity: number[]; timestamp: number[]; base_value: number; timeframe: string } | null;
  orders: FeedOrder[];
  openOrders: FeedOrder[];
  audUsdRate: null;
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return value.toFixed(2);
}

function holdingSymbol(holding: PortfolioHolding): string {
  return displayHoldingLabel(holding.ticker, holding.name).slice(0, 24);
}

function toPosition(holding: PortfolioHolding): FeedPosition {
  const units = num(holding.units);
  const price = num(holding.price);
  const value = num(holding.value) || units * price;
  const costBase = num(holding.costBase);
  // costBase is the position total, not a per-unit figure — reading it as
  // per-unit is what once turned a +47% holding into a -99% one.
  const unrealised = costBase > 0 ? value - costBase : 0;
  const prevClose = num(holding.prevClose) || price;
  const dayChange = prevClose > 0 ? (price - prevClose) / prevClose : 0;

  return {
    symbol: holdingSymbol(holding),
    qty: String(units),
    current_price: money(price),
    market_value: money(value),
    cost_basis: money(costBase),
    avg_entry_price: money(units > 0 ? costBase / units : 0),
    unrealized_pl: money(unrealised),
    unrealized_plpc: costBase > 0 ? (unrealised / costBase).toFixed(6) : "0",
    unrealized_intraday_pl: money((price - prevClose) * units),
    change_today: dayChange.toFixed(6),
    side: "long",
    asset_class: holding.source,
    exchange: holding.account || holding.source.toUpperCase(),
    sleeve: CORE_SOURCES.has(holding.source) ? "core" : "alpha",
    name: holding.name || holdingSymbol(holding),
    sector: holding.sector || "—",
    account: holding.account || "—",
    pricingLabel: holding.pricingLabel || "",
  };
}

function buildHistory(state: PortfolioState): PortfolioFeed["history"] {
  const points = state.snapshots
    .map((snapshot) => ({ at: Date.parse(snapshot.date), value: num(snapshot.value) }))
    .filter((point) => Number.isFinite(point.at) && point.value > 0)
    .sort((a, b) => a.at - b.at)
    .slice(-90);

  if (points.length < 2) return null;

  return {
    equity: points.map((point) => point.value),
    timestamp: points.map((point) => Math.round(point.at / 1000)),
    base_value: points[0].value,
    timeframe: "1D",
  };
}

function ingestOrders(userId: string, status: "applied" | "pending"): FeedOrder[] {
  let rows;
  try {
    rows = listIngestTrades(userId, status, 100);
  } catch {
    // The ingest tables are optional — an older database simply has no trades.
    return [];
  }

  return rows.map((row) => {
    const at = row.tradeDate ? `${row.tradeDate}T00:00:00.000Z` : row.createdAt;
    return {
      id: row.id,
      symbol: row.ticker,
      side: row.side,
      qty: String(row.units),
      filled_qty: status === "applied" ? String(row.units) : "0",
      filled_avg_price: status === "applied" ? money(num(row.unitPrice)) : null,
      type: row.broker || "contract note",
      status: status === "applied" ? "filled" : "pending review",
      submitted_at: at,
      filled_at: status === "applied" ? at : null,
      broker: row.broker,
      confidence: row.confidence,
    };
  });
}

function describeSource(holdingsCount: number, updatedAt: string | null, pendingCount: number): string {
  const parts = [`${holdingsCount} holding${holdingsCount === 1 ? "" : "s"} imported`];
  if (updatedAt) {
    const when = new Date(updatedAt);
    if (!Number.isNaN(when.getTime())) {
      parts.push(
        `updated ${when.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`,
      );
    }
  }
  if (pendingCount > 0) {
    parts.push(`${pendingCount} forwarded trade${pendingCount === 1 ? "" : "s"} awaiting review`);
  }
  return parts.join(" · ");
}

/**
 * A compact, plain-language view of the imported portfolio for an AI tool call.
 * Deliberately flatter and smaller than the broker-shaped feed: the models get
 * a token budget, not a rendering job.
 */
export function portfolioSnapshotForAi(userId: string): Record<string, unknown> {
  const state = readPortfolioState(userId);
  if (!state.holdings.length) {
    return {
      source: "imported portfolio",
      holdings: [],
      note: "Nothing imported yet. The user uploads holdings files on the SPECTRE dashboard, or forwards broker confirmation emails to their SPECTRE address.",
    };
  }

  const cash = state.holdings
    .filter((holding) => CASH_SOURCES.has(holding.source))
    .reduce((sum, holding) => sum + num(holding.value), 0);

  const holdings = state.holdings
    .filter((holding) => !CASH_SOURCES.has(holding.source))
    .map((holding) => {
      const value = num(holding.value);
      const costBase = num(holding.costBase);
      return {
        symbol: holdingSymbol(holding),
        name: holding.name,
        account: holding.account,
        kind: holding.source,
        sector: holding.sector,
        units: num(holding.units),
        price: num(holding.price),
        value: Number(value.toFixed(2)),
        costBase: Number(costBase.toFixed(2)),
        gain: costBase > 0 ? Number((value - costBase).toFixed(2)) : null,
        gainPct: costBase > 0 ? Number((((value - costBase) / costBase) * 100).toFixed(2)) : null,
        pricing: holding.pricingLabel || undefined,
      };
    })
    .sort((a, b) => b.value - a.value);

  const invested = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const bySector = new Map<string, number>();
  for (const holding of holdings) {
    const sector = holding.sector || "Unclassified";
    bySector.set(sector, (bySector.get(sector) ?? 0) + holding.value);
  }

  return {
    source: "imported portfolio",
    currency: "AUD",
    note: "These are the user's real holdings, imported from files or forwarded broker confirmations. There is no broker connection, so no orders can be placed.",
    updatedAt: state.updatedAt || null,
    totalValue: Number((invested + cash).toFixed(2)),
    invested: Number(invested.toFixed(2)),
    cash: Number(cash.toFixed(2)),
    holdingCount: holdings.length,
    holdings,
    sectorWeights: Array.from(bySector.entries())
      .map(([sector, value]) => ({
        sector,
        pct: invested > 0 ? Number(((value / invested) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.pct - a.pct),
    pendingForwardedTrades: ingestOrders(userId, "pending").length,
  };
}

/** Trades ingested from forwarded broker confirmations, for an AI tool call. */
export function ingestedTradesForAi(userId: string, status: "applied" | "pending"): Record<string, unknown> {
  return { status, trades: ingestOrders(userId, status) };
}

/**
 * Project the user's uploaded portfolio into the broker-shaped feed.
 * Returns null when nothing has been imported yet, so callers can say so
 * rather than rendering a portfolio worth zero.
 */
export function buildPortfolioFeed(userId: string): PortfolioFeed | null {
  const state = readPortfolioState(userId);
  if (!state.holdings.length) return null;

  const cashHoldings = state.holdings.filter((holding) => CASH_SOURCES.has(holding.source));
  const investedHoldings = state.holdings.filter((holding) => !CASH_SOURCES.has(holding.source));

  const positions = investedHoldings
    .map(toPosition)
    .sort((a, b) => num(b.market_value) - num(a.market_value));

  const cash = cashHoldings.reduce((sum, holding) => sum + num(holding.value), 0);
  const invested = positions.reduce((sum, position) => sum + num(position.market_value), 0);
  const equity = cash + invested;
  const intraday = positions.reduce((sum, position) => sum + num(position.unrealized_intraday_pl), 0);

  const applied = ingestOrders(userId, "applied");
  const pending = ingestOrders(userId, "pending");

  return {
    source: "portfolio",
    brokerConnected: false,
    currency: "AUD",
    sourceLabel: describeSource(state.holdings.length, state.updatedAt || null, pending.length),
    holdingsCount: state.holdings.length,
    updatedAt: state.updatedAt || null,
    sleeves: {
      core: { label: "Core · Index funds and super", targetPct: null },
      alpha: { label: "Direct holdings · shares, crypto, metals", targetPct: null },
    },
    account: {
      account_number: "IMPORTED",
      status: "ACTIVE",
      currency: "AUD",
      equity: money(equity),
      last_equity: money(equity - intraday),
      cash: money(cash),
      buying_power: money(cash),
      portfolio_value: money(equity),
    },
    positions,
    history: buildHistory(state),
    orders: applied,
    openOrders: pending,
    audUsdRate: null,
  };
}
