import { NextResponse } from "next/server";
import { findAuthUserByEmail } from "@/lib/db";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { runPlatinumDailyScan } from "@/lib/platinum";

export const runtime = "nodejs";

const PLATINUM_EMAIL = "jwmcghee09@gmail.com";

export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);

    const user = findAuthUserByEmail(PLATINUM_EMAIL);
    if (!user) {
      return NextResponse.json({ error: `Platinum user not found for ${PLATINUM_EMAIL}.` }, { status: 404 });
    }

    const result = await runPlatinumDailyScan(user.id);

    return NextResponse.json({
      ok: true,
      scanDate: result.scanDate,
      alreadyRanToday: result.alreadyRanToday,
      generatedRecommendations: result.generatedRecommendations,
      executedTrades: result.executedTrades,
      skippedTickers: result.skippedTickers,
      equity: result.state.portfolio.equity,
      totalReturnPct: result.state.portfolio.totalReturnPct,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Platinum scan failed." },
      { status: 500 },
    );
  }
}
