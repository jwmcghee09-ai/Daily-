import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { listUsersWithEnabledDipAlerts, readUserEntitlements } from "@/lib/db";
import { refreshPricesAndTriggerDipAlertsForUser } from "@/lib/price-dip-alerts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);

    const candidates = listUsersWithEnabledDipAlerts();
    const scannedUsers: Array<{
      userId: string;
      email: string;
      checkedAlerts: number;
      triggeredAlerts: number;
      failedAlertTickers: string[];
      lastPriceRefreshAt: string;
    }> = [];
    const skippedUsers: Array<{ userId: string; email: string; reason: string }> = [];
    const failedUsers: Array<{ userId: string; email: string; error: string }> = [];

    for (const user of candidates) {
      const entitlements = readUserEntitlements(user.id);
      if (!entitlements.proEnabled) {
        skippedUsers.push({
          userId: user.id,
          email: user.email,
          reason: "No paid Pro access",
        });
        continue;
      }

      try {
        const result = await refreshPricesAndTriggerDipAlertsForUser(user);
        scannedUsers.push({
          userId: user.id,
          email: user.email,
          checkedAlerts: result.checkedAlerts,
          triggeredAlerts: result.triggeredAlerts.length,
          failedAlertTickers: result.failedAlertTickers,
          lastPriceRefreshAt: result.refreshedState.state.lastPriceRefreshAt,
        });
      } catch (error) {
        failedUsers.push({
          userId: user.id,
          email: user.email,
          error: error instanceof Error ? error.message : "Dip alert background scan failed.",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      candidateUsers: candidates.length,
      scannedUsers: scannedUsers.length,
      skippedUsers,
      failedUsers,
      totalAlertsChecked: scannedUsers.reduce((sum, user) => sum + user.checkedAlerts, 0),
      totalAlertsTriggered: scannedUsers.reduce((sum, user) => sum + user.triggeredAlerts, 0),
      results: scannedUsers,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pro dip alert scan failed." },
      { status: 500 },
    );
  }
}
