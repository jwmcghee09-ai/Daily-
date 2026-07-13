import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { runStrategy } from "@/lib/strategy-runner";

export const runtime = "nodejs";
export const maxDuration = 120;

async function handle(request: Request) {
  try {
    assertCronTokenAuthorized(request);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runStrategy("cron");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { status: "error", summary: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) { return handle(request); }
export async function GET(request: Request) { return handle(request); }
