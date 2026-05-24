import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

export const runtime = "nodejs";

async function fetchAudUsdRate(): Promise<number | null> {
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/AUDUSD%3DX?interval=1d&range=5d";
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch {
    return null;
  }
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

  const headers = {
    "APCA-API-KEY-ID": apiKey,
    "APCA-API-SECRET-KEY": apiSecret,
  };

  const [histRes, ordersRes, acctRes, audUsdRate] = await Promise.all([
    fetch(`${ALPACA_BASE}/account/portfolio/history?period=1M&timeframe=1D`, { headers, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/orders?status=closed&limit=200&direction=desc`, { headers, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/account`, { headers, cache: "no-store" }),
    fetchAudUsdRate(),
  ]);

  const [history, orders, account] = await Promise.all([
    histRes.ok ? histRes.json() : null,
    ordersRes.ok ? ordersRes.json() : [],
    acctRes.ok ? acctRes.json() : null,
  ]);

  return NextResponse.json({ history, orders, account, audUsdRate });
}
