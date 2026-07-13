import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { runStrategy } from "@/lib/strategy-runner";

const TRADER_EMAIL = "jwmcghee09@gmail.com";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user || user.email !== TRADER_EMAIL) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  try {
    const result = await runStrategy("manual");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { status: "error", summary: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
