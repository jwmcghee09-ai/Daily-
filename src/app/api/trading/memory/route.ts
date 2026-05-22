import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readTradingMemory, writeTradingMemory } from "@/lib/db";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.TRADING_SECRET;
  if (secret && request.headers.get("x-trading-secret") === secret) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
  }

  const memory = readTradingMemory();
  return NextResponse.json(memory ?? { strategy: "", lessons: [], updatedAt: null });
}

interface MemoryBody {
  strategy?: unknown;
  lessons?: unknown;
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  const authed = user?.email === TRADER_EMAIL || isAuthorized(request);
  if (!authed) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: MemoryBody;
  try { body = (await request.json()) as MemoryBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const strategy = typeof body.strategy === "string" ? body.strategy : "";
  const lessons = Array.isArray(body.lessons)
    ? (body.lessons as unknown[]).filter((l): l is string => typeof l === "string")
    : [];

  writeTradingMemory(strategy, lessons);
  return NextResponse.json({ ok: true });
}
