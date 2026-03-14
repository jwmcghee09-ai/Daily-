import { NextResponse } from "next/server";
import { findAuthUserByEmail } from "@/lib/db";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { refreshPricesAndTriggerDipAlertsForUser } from "@/lib/price-dip-alerts";
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
    const dipAlertResult = await refreshPricesAndTriggerDipAlertsForUser({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    return NextResponse.json({
      ok: true,
      mode: isLiveMode ? "live" : "daily",
      scanDate: result.scanDate,
      alreadyRanToday: result.alreadyRanToday,
      marketOpen: result.marketOpen,
      skippedBecauseMarketClosed: result.skippedBecauseMarketClosed,
      skippedBecauseKillSwitch: result.skippedBecauseKillSwitch,
      skippedBecauseDailyLossCap: result.skippedBecauseDailyLossCap,
      generatedRecommendations: result.generatedRecommendations,
      executedTrades: result.executedTrades,
      skippedTickers: result.skippedTickers,
      usedAiOverlay: result.usedAiOverlay,
      aiModel: result.aiModel,
      equity: result.state.portfolio.equity,
      totalReturnPct: result.state.portfolio.totalReturnPct,
      dailyPnlAud: result.state.riskControls.dailyPnlAud,
      dailyLossCapAud: result.state.riskControls.dailyLossCapAud,
      killSwitchEnabled: result.state.riskControls.killSwitchEnabled,
      dipAlertsChecked: dipAlertResult.checkedAlerts,
      dipAlertsTriggered: dipAlertResult.triggeredAlerts,
      dipAlertFailures: dipAlertResult.failedAlertTickers,
      lastPriceRefreshAt: dipAlertResult.refreshedState.state.lastPriceRefreshAt,
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
