import { NextRequest, NextResponse } from "next/server";
import { readTradingMemory } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { isTerminalRequestAuthorized } from "@/lib/terminal-auth";
import { brokerHeaders, isBrokerConnected, BROKER_DISCONNECTED_MESSAGE } from "@/lib/broker";
import { buildPortfolioFeed } from "@/lib/portfolio-feed";

export const runtime = "nodejs";

const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

function headers() {
  return {
    ...(brokerHeaders() ?? {}),
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
          meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number }; indicators?: { quote?: Array<{ close?: (number | null)[] }> };
        }>;
      };
    };
    const result = d?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    // chartPreviousClose is the close BEFORE the requested range rather than
    // yesterday's, which made this a multi-day move labelled as a daily one.
    // See src/lib/yahoo-quote.ts.
    const closeSeries = (result?.indicators?.quote?.[0]?.close ?? [])
      .filter((c: number | null): c is number => typeof c === "number" && Number.isFinite(c) && c > 0);
    const prev = closeSeries.length > 1
      ? closeSeries[closeSeries.length - 2]
      : meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = price - prev;
    const changePct = prev > 0 ? (change / prev) * 100 : 0;
    return { price, prev, change, changePct };
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  if (!(await isTerminalRequestAuthorized(req))) {
    return NextResponse.json({ error: "Not authorized — sign in at /signin first" }, { status: 403 });
  }

  if (!isBrokerConnected()) {
    // No broker to read from — serve the uploaded portfolio in the same shape.
    // The terminal's trade-placing controls stay disabled: this is a read-only
    // view of holdings the user imported, not an account Myrmidon can act on.
    const user = await getAuthenticatedUser();
    const feed = user ? buildPortfolioFeed(user.id) : null;
    if (!feed) {
      return NextResponse.json(
        {
          error: user
            ? `${BROKER_DISCONNECTED_MESSAGE} No portfolio has been imported either — upload a holdings file on the dashboard.`
            : BROKER_DISCONNECTED_MESSAGE,
          brokerConnected: false,
        },
        { status: 503 },
      );
    }

    const [macroQuotes, memory] = await Promise.all([
      Promise.all(["AUDUSD=X", "^VIX", "^GSPC", "^IXIC", "^TNX", "GC=F", "CL=F", "BTC-USD"].map(yahooQuote)),
      (async () => { try { return readTradingMemory(); } catch { return null; } })(),
    ]);
    const [audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc] = macroQuotes;

    return NextResponse.json({
      ...feed,
      memory,
      // The broker path reports the AUD/USD rate here because its figures are
      // USD. The portfolio feed is already AUD, so rate stays null and the
      // clients skip conversion.
      rate: null,
      macro: { audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc },
    });
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
    source: "broker",
    brokerConnected: true,
    currency: "USD",
    sourceLabel: "Alpaca paper account",
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
