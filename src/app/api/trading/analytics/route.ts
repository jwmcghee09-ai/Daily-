import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

export const runtime = "nodejs";
export const maxDuration = 30;

interface YahooQuote {
  price: number;
  prev: number;
  change: number;
  changePct: number;
}

async function yahooQuote(symbol: string): Promise<YahooQuote | null> {
  try {
    const enc = encodeURIComponent(symbol);
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${enc}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }> };
    };
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? price;
    return { price, prev, change: price - prev, changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0 };
  } catch { return null; }
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "Trading credentials not configured" }, { status: 503 });
  }

  const h = { "APCA-API-KEY-ID": apiKey, "APCA-API-SECRET-KEY": apiSecret };

  const [histRes, ordersRes, acctRes, posRes, openOrdRes, macro] = await Promise.all([
    fetch(`${ALPACA_BASE}/account/portfolio/history?period=1M&timeframe=1D`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/orders?status=closed&limit=200&direction=desc`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/account`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/positions`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/orders?status=open&limit=20`, { headers: h, cache: "no-store" }),
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
  ]);

  const [history, orders, account, positions, openOrders] = await Promise.all([
    histRes.ok ? histRes.json() : null,
    ordersRes.ok ? ordersRes.json() : [],
    acctRes.ok ? acctRes.json() : null,
    posRes.ok ? posRes.json() : [],
    openOrdRes.ok ? openOrdRes.json() : [],
  ]);

  const [audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc] = macro;

  return NextResponse.json({
    history,
    orders,
    account,
    positions,
    openOrders,
    audUsdRate: audUsd?.price ?? null,
    macro: { audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc },
  });
}
