import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

async function af(path: string) {
  const res = await fetch(`${ALPACA_BASE}${path}`, {
    headers: {
      "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
      "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function yahooQuote(symbol: string) {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const d = await res.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number } }> } };
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? price;
    return { price, changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0 };
  } catch { return null; }
}

export async function GET(request: Request) {
  try {
    assertCronTokenAuthorized(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return NextResponse.json({ error: "ALPACA_API_KEY or ALPACA_API_SECRET not configured" }, { status: 503 });
  }

  const [account, positions, openOrders, closedOrders, history] = await Promise.all([
    af("/account"),
    af("/positions"),
    af("/orders?status=open&limit=20"),
    af("/orders?status=closed&limit=50&direction=desc"),
    af("/account/portfolio/history?period=1M&timeframe=1D"),
  ]);

  if (!account) {
    return NextResponse.json({ error: "Alpaca API unreachable or keys invalid" }, { status: 502 });
  }

  // Basic macro
  const [audUsd, vix, spx] = await Promise.all([
    yahooQuote("AUDUSD=X"),
    yahooQuote("^VIX"),
    yahooQuote("^GSPC"),
  ]);

  const equity = parseFloat((account as Record<string, string>).equity ?? "0");
  const cash = parseFloat((account as Record<string, string>).cash ?? "0");

  // Summarise positions
  const posArray = Array.isArray(positions) ? positions as Record<string, string>[] : [];
  const positionSummary = posArray.map(p => ({
    symbol: p.symbol,
    qty: p.qty,
    market_value_usd: parseFloat(p.market_value),
    pct_of_equity: equity > 0 ? ((parseFloat(p.market_value) / equity) * 100).toFixed(1) + "%" : "—",
    unrealized_pl_usd: parseFloat(p.unrealized_pl),
    unrealized_plpc: (parseFloat(p.unrealized_plpc) * 100).toFixed(2) + "%",
    day_change_pct: (parseFloat(p.change_today) * 100).toFixed(2) + "%",
  }));

  // Win rate on closed trades
  const closedArray = Array.isArray(closedOrders) ? closedOrders as Record<string, string>[] : [];
  const filled = closedArray.filter(o => o.status === "filled" && o.side === "sell");
  const totalPl = filled.reduce((s, o) => s + (parseFloat(o.filled_avg_price) - parseFloat(o.filled_avg_price)) * parseFloat(o.filled_qty), 0);

  // 30-day equity stats
  const histEquity = (history as Record<string, number[]> | null)?.equity ?? [];
  const validEquity = histEquity.filter((v: number) => v != null && v > 0);
  const equityStart = validEquity[0] ?? equity;
  const return30d = equityStart > 0 ? ((equity - equityStart) / equityStart) * 100 : 0;

  return NextResponse.json({
    fetched_at: new Date().toISOString(),
    account: {
      equity_usd: equity,
      equity_aud: audUsd ? +(equity / audUsd.price).toFixed(0) : null,
      cash_usd: cash,
      cash_pct: equity > 0 ? +((cash / equity) * 100).toFixed(1) : null,
      buying_power_usd: parseFloat((account as Record<string, string>).buying_power ?? "0"),
      return_30d_pct: +return30d.toFixed(2),
      return_30d_usd: +(equity - equityStart).toFixed(0),
    },
    macro: {
      aud_usd: audUsd?.price ?? null,
      vix: vix?.price ?? null,
      vix_change_pct: vix?.changePct ?? null,
      spx: spx?.price ?? null,
      spx_change_pct: spx?.changePct ?? null,
    },
    positions: positionSummary,
    open_orders: Array.isArray(openOrders) ? (openOrders as Record<string, string>[]).map(o => ({
      symbol: o.symbol,
      side: o.side,
      qty: o.qty,
      type: o.type,
      status: o.status,
      submitted_at: o.submitted_at,
    })) : [],
    recent_closed_trades: closedArray.slice(0, 20).map(o => ({
      symbol: o.symbol,
      side: o.side,
      qty: o.filled_qty,
      fill_price: o.filled_avg_price,
      filled_at: o.filled_at,
    })),
    stats: {
      total_positions: posArray.length,
      total_closed_orders_fetched: closedArray.length,
      filled_sell_orders: filled.length,
      estimated_realized_pl_note: "P&L requires cost-basis data not available here; use Alpaca dashboard for exact figures",
    },
  });
}
