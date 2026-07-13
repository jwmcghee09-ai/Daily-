import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  readTradingStrategy, writeTradingStrategy,
  listPendingTrades, listStrategyRuns,
  StrategyMode, RiskTolerance,
} from "@/lib/db";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

export const runtime = "nodejs";

const DEFAULT_CONFIG = {
  mode: "dip_buyer" as StrategyMode,
  custom_prompt: "",
  enabled: false,
  autopilot: false,
  max_position_pct: 10,
  max_trades_per_run: 3,
  max_daily_spend_usd: 10000,
  market_hours_only: true,
  risk_tolerance: "balanced" as RiskTolerance,
  watchlist: [] as string[],
};

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const config = readTradingStrategy() ?? { ...DEFAULT_CONFIG, updated_at: "" };
  return NextResponse.json({
    config,
    pending: listPendingTrades(20),
    runs: listStrategyRuns(15),
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const modes: StrategyMode[] = ["dip_buyer", "momentum", "index_rotator", "custom"];
  const risks: RiskTolerance[] = ["conservative", "balanced", "aggressive"];

  const clampNum = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : dflt;
  };

  const watchlist = Array.isArray(body.watchlist)
    ? (body.watchlist as unknown[])
        .map(s => String(s).toUpperCase().replace(/[^A-Z]/g, ""))
        .filter(s => /^[A-Z]{1,5}$/.test(s))
        .slice(0, 30)
    : [];

  writeTradingStrategy({
    mode: modes.includes(body.mode as StrategyMode) ? body.mode as StrategyMode : "dip_buyer",
    custom_prompt: String(body.custom_prompt ?? "").slice(0, 2000),
    enabled: body.enabled === true,
    autopilot: body.autopilot === true,
    max_position_pct: clampNum(body.max_position_pct, 1, 25, 10),
    max_trades_per_run: Math.round(clampNum(body.max_trades_per_run, 1, 10, 3)),
    max_daily_spend_usd: clampNum(body.max_daily_spend_usd, 100, 100000, 10000),
    market_hours_only: body.market_hours_only !== false,
    risk_tolerance: risks.includes(body.risk_tolerance as RiskTolerance) ? body.risk_tolerance as RiskTolerance : "balanced",
    watchlist,
  });

  return NextResponse.json({ saved: true, config: readTradingStrategy() });
}
