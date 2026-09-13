import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { brokerCredentials } from "@/lib/broker";
import { buildPortfolioFeed } from "@/lib/portfolio-feed";

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

  const credentials = brokerCredentials();
  const apiKey = credentials?.key;
  const apiSecret = credentials?.secret;
  if (!apiKey || !apiSecret) {
    // No broker — fall back to the portfolio the user has uploaded, projected
    // into the same shape so the Analytics page renders it unchanged.
    const feed = buildPortfolioFeed(user.id);
    if (!feed) {
      return NextResponse.json(
        {
          error: "No portfolio imported yet — upload a holdings file on the Quant tab first.",
          source: "portfolio",
          brokerConnected: false,
        },
        { status: 404 },
      );
    }
    const macroQuotes = await Promise.all(
      ["AUDUSD=X", "^VIX", "^GSPC", "^IXIC", "^TNX", "GC=F", "CL=F", "BTC-USD"].map(yahooQuote),
    );
    const [audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc] = macroQuotes;
    return NextResponse.json({
      ...feed,
      macro: { audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc },
    });
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
    source: "broker",
    brokerConnected: true,
    currency: "USD",
    sourceLabel: "Alpaca paper account",
    sleeves: {
      core: { label: "Core · Index Sleeve", targetPct: 70 },
      alpha: { label: "Alpha · Satellite Sleeve", targetPct: 30 },
    },
    history,
    orders,
    account,
    positions,
    openOrders,
    audUsdRate: audUsd?.price ?? null,
    macro: { audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc },
  });
}
