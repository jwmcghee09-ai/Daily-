import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { refreshPricesAndTriggerDipAlertsForUser } from "@/lib/price-dip-alerts";
import { saveImport, readPortfolioState } from "@/lib/db";
import type { PortfolioHolding } from "@/lib/portfolio";

export const runtime = "nodejs";

const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

interface AlpacaPosition {
  symbol: string;
  qty: string;
  current_price: string;
  lastday_price: string;
  market_value: string;
  cost_basis: string;
  asset_class?: string;
}

async function fetchAudUsdRate(): Promise<number> {
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/AUDUSD%3DX?interval=1d&range=5d";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Myrmidon/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } };
    const rate = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof rate === "number" && rate > 0 ? rate : 0;
  } catch {
    return 0;
  }
}

async function syncAlpacaPrices(userId: string): Promise<boolean> {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) return false;

  const posRes = await fetch(`${ALPACA_BASE}/positions`, {
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": apiSecret,
    },
    cache: "no-store",
  });

  if (!posRes.ok) return false;

  const positions = (await posRes.json()) as AlpacaPosition[];
  if (!Array.isArray(positions) || positions.length === 0) return false;

  const audUsdRate = await fetchAudUsdRate();
  const toAud = (usd: string | number) => {
    const n = typeof usd === "string" ? parseFloat(usd) : usd;
    if (!isFinite(n) || n <= 0) return 0;
    return audUsdRate > 0 ? n / audUsdRate : n;
  };

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const holdings: PortfolioHolding[] = positions
    .filter((p) => p.asset_class !== "crypto")
    .map((p, i) => ({
      id: `alpaca-${p.symbol.toLowerCase()}-${i}`,
      source: "us" as const,
      account: "Alpaca Paper",
      ticker: p.symbol.toUpperCase(),
      name: p.symbol.toUpperCase(),
      units: parseFloat(p.qty) || 0,
      price: toAud(p.current_price),
      prevClose: toAud(p.lastday_price),
      value: toAud(p.market_value),
      costBase: toAud(p.cost_basis),
      sector: "Equity",
      reportDate: today,
      importedAt: now,
    }));

  if (holdings.length === 0) return false;

  saveImport(userId, "us", holdings);
  return true;
}

export async function POST() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const result = await refreshPricesAndTriggerDipAlertsForUser(sessionUser);

    let finalState = result.refreshedState;

    // For the trader account, overlay Alpaca live prices after Yahoo refresh
    if (sessionUser.email === TRADER_EMAIL) {
      try {
        const synced = await syncAlpacaPrices(sessionUser.id);
        if (synced) {
          const updatedPortfolio = readPortfolioState(sessionUser.id);
          finalState = { ...finalState, state: updatedPortfolio };
        }
      } catch {
        // Alpaca sync failure is non-fatal; Yahoo prices remain
      }
    }

    return NextResponse.json({
      ...finalState,
      triggeredAlerts: result.triggeredAlerts,
      failedAlertTickers: result.failedAlertTickers,
      checkedAlerts: result.checkedAlerts,
    });
  } catch {
    return NextResponse.json({ error: "Failed to refresh live market prices." }, { status: 500 });
  }
}
