import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getPendingTrade, resolvePendingTrade, listPendingTrades } from "@/lib/db";
import { executePendingTradeNow } from "@/lib/strategy-runner";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  let body: { id?: unknown; action?: unknown };
  try { body = await request.json() as { id?: unknown; action?: unknown }; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = Number(body.id);
  const action = String(body.action ?? "");
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id required" }, { status: 400 });

  const trade = getPendingTrade(id);
  if (!trade) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (action === "cancel") {
    resolvePendingTrade(id, "cancelled", "cancelled by trader");
    return NextResponse.json({ ok: true, status: "cancelled", pending: listPendingTrades(20) });
  }
  if (action === "execute_now") {
    const r = await executePendingTradeNow(id);
    return NextResponse.json({ ok: r.ok, note: r.note, pending: listPendingTrades(20) });
  }
  return NextResponse.json({ error: "action must be cancel or execute_now" }, { status: 400 });
}
