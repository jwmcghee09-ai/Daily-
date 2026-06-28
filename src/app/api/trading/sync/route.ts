import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { saveImport } from "@/lib/db";
import { PortfolioHolding } from "@/lib/portfolio";

const TRADER_EMAIL = "jwmcghee09@gmail.com";
const ALPACA_BASE = "https://paper-api.alpaca.markets/v2";

export const runtime = "nodejs";

interface AlpacaPosition {
  symbol: string;
  qty: string;
  current_price: string;
  lastday_price: string;
  market_value: string;
  cost_basis: string;
  asset_class?: string;
}

interface AlpacaAccount {
  cash: string;
  portfolio_value: string;
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

export async function POST() {
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

  const [posRes, acctRes] = await Promise.all([
    fetch(`${ALPACA_BASE}/positions`, { headers, cache: "no-store" }),
    fetch(`${ALPACA_BASE}/account`, { headers, cache: "no-store" }),
  ]);

  if (!posRes.ok) {
    return NextResponse.json({ error: "Failed to fetch positions from Alpaca" }, { status: 502 });
  }

  const positions = (await posRes.json()) as AlpacaPosition[];
  const account = acctRes.ok ? (await acctRes.json()) as AlpacaAccount : null;

  if (!Array.isArray(positions) || positions.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "No open positions to sync" });
  }

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

  // Add uninvested cash as a separate holding so it appears in the portfolio total
  const cashUsd = account ? parseFloat(account.cash) : 0;
  if (isFinite(cashUsd) && cashUsd > 0) {
    const cashAud = toAud(cashUsd);
    holdings.push({
      id: "alpaca-cash",
      source: "us" as const,
      account: "Alpaca Paper",
      ticker: "ALPACACASH",
      name: "Uninvested Cash",
      units: 1,
      price: cashAud,
      prevClose: cashAud,
      value: cashAud,
      costBase: cashAud,
      sector: "Cash",
      reportDate: today,
      importedAt: now,
    });
  }

  if (holdings.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: "No equity positions to sync" });
  }

  saveImport(user.id, "us", holdings);
  return NextResponse.json({ ok: true, synced: holdings.length, cashAud: cashUsd > 0 ? toAud(cashUsd) : null });
}
