import { NextRequest, NextResponse } from "next/server";
import { readTradingMemory } from "@/lib/db";

export const runtime = "nodejs";

const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "",
  };
}

interface YahooQuote {
  price: number;
  prev: number;
  change: number;
  changePct: number;
}

async function yahooQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const enc = encodeURIComponent(symbol);
    const r = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!r.ok) return null;
    const d = await r.json() as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number };
        }>;
      };
    };
    const meta = d?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = price - prev;
    const changePct = prev > 0 ? (change / prev) * 100 : 0;
    return { price, prev, change, changePct };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const secret = process.env.TRADING_SECRET;
  if (secret) {
    const key = req.headers.get("x-terminal-key");
    if (key !== secret) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return NextResponse.json({ error: "ALPACA_API_KEY / ALPACA_API_SECRET not set in .env.local" }, { status: 503 });
  }

  const h = headers();

  const [acctR, posR, histR, ordR, openOrdR, macro, memory] = await Promise.all([
    fetch(`${ALPACA_BASE}/account`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/positions`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/account/portfolio/history?period=1M&timeframe=1D`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/orders?status=closed&limit=100&direction=desc`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/orders?status=open&limit=20`, { headers: h, cache: "no-store" }),
    // Macro data in parallel
    Promise.all([
      yahooQuote("AUDUSD=X"),
      yahooQuote("^VIX"),
      yahooQuote("^GSPC"),
      yahooQuote("^IXIC"),
      yahooQuote("^TNX"),
      yahooQuote("GC=F"),
      yahooQuote("CL=F"),
      yahooQuote("BTC-USD"),
    ]),
    (async () => { try { return readTradingMemory(); } catch { return null; } })(),
  ]);

  const [account, positions, history, orders, openOrders] = await Promise.all([
    acctR.ok ? acctR.json() : null,
    posR.ok ? posR.json() : [],
    histR.ok ? histR.json() : null,
    ordR.ok ? ordR.json() : [],
    openOrdR.ok ? openOrdR.json() : [],
  ]);

  const [audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc] = macro;

  return NextResponse.json({
    account,
    positions,
    history,
    orders,
    openOrders,
    memory,
    // AUD/USD rate kept at top level for backwards compat
    rate: audUsd?.price ?? null,
    // Full macro object
    macro: { audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc },
  });
}
