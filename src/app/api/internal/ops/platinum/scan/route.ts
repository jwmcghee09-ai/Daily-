import { NextResponse } from "next/server";
import { findAuthUserByEmail } from "@/lib/db";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { runPlatinumDailyScan } from "@/lib/platinum";

export const runtime = "nodejs";

const PLATINUM_EMAIL = "jwmcghee09@gmail.com";

export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);
    const url = new URL(request.url);
    const mode = (url.searchParams.get("mode") || "daily").toLowerCase();
    const isLiveMode = mode === "live";

    const user = findAuthUserByEmail(PLATINUM_EMAIL);
    if (!user) {
      return NextResponse.json({ error: `Platinum user not found for ${PLATINUM_EMAIL}.` }, { status: 404 });
    }

    const result = await runPlatinumDailyScan(user.id, {
      allowIntraday: isLiveMode,
      requireMarketOpen: isLiveMode,
    });

    return NextResponse.json({
      ok: true,
      mode: isLiveMode ? "live" : "daily",
      scanDate: result.scanDate,
      alreadyRanToday: result.alreadyRanToday,
      marketOpen: result.marketOpen,
      skippedBecauseMarketClosed: result.skippedBecauseMarketClosed,
      generatedRecommendations: result.generatedRecommendations,
      executedTrades: result.executedTrades,
      skippedTickers: result.skippedTickers,
      usedAiOverlay: result.usedAiOverlay,
      aiModel: result.aiModel,
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
