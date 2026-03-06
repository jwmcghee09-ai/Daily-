import { NextResponse } from "next/server";
import { getAuthenticatedUser, normalizeEmail } from "@/lib/auth";
import { getPlatinumPaperState, runPlatinumDailyScan } from "@/lib/platinum";

export const runtime = "nodejs";

const PLATINUM_EMAIL = "jwmcghee09@gmail.com";

function isPlatinumUser(email: string): boolean {
  return normalizeEmail(email) === PLATINUM_EMAIL;
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isPlatinumUser(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const state = getPlatinumPaperState(user.id);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Platinum paper model." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isPlatinumUser(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const mode = (url.searchParams.get("mode") || "daily").toLowerCase();
    const isLiveMode = mode === "live";
    const isForceMode = mode === "force";

    const result = await runPlatinumDailyScan(user.id, {
      allowIntraday: isLiveMode || isForceMode,
      requireMarketOpen: isLiveMode,
      forceRun: isForceMode,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run Platinum daily scan." },
      { status: 500 },
    );
  }
}
