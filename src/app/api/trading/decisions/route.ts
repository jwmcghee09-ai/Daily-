import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { listTradingDecisions } from "@/lib/db";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "50"), 200);
  const decisions = listTradingDecisions(limit);
  return NextResponse.json({ decisions });
}
