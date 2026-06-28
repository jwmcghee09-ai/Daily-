import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

function headers() {
  return {
    "APCA-API-KEY-ID": process.env.ALPACA_API_KEY ?? "",
    "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET ?? "",
  };
}

async function audUsd(): Promise<number | null> {
  try {
    const r = await fetch("https://query2.finance.yahoo.com/v8/finance/chart/AUDUSD%3DX?interval=1d&range=5d", {
      headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store",
    });
    if (!r.ok) return null;
    const d = await r.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const rate = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof rate === "number" && rate > 0 ? rate : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  // Dev: always allow. Prod: require x-terminal-key matching TRADING_SECRET.
  if (process.env.NODE_ENV !== "development") {
    const key = req.headers.get("x-terminal-key");
    const secret = process.env.TRADING_SECRET;
    if (!secret || key !== secret) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
  }

  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    return NextResponse.json({ error: "ALPACA_API_KEY / ALPACA_API_SECRET not set in .env.local" }, { status: 503 });
  }

  const h = headers();
  const [acctR, posR, histR, ordR, rate] = await Promise.all([
    fetch(`${ALPACA_BASE}/account`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/positions`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/account/portfolio/history?period=1M&timeframe=1D`, { headers: h, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/orders?status=closed&limit=100&direction=desc`, { headers: h, cache: "no-store" }),
    audUsd(),
  ]);

  const [account, positions, history, orders] = await Promise.all([
    acctR.ok ? acctR.json() : null,
    posR.ok ? posR.json() : [],
    histR.ok ? histR.json() : null,
    ordR.ok ? ordR.json() : [],
  ]);

  return NextResponse.json({ account, positions, history, orders, rate });
}
