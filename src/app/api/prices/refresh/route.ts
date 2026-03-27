import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { refreshPricesAndTriggerDipAlertsForUser } from "@/lib/price-dip-alerts";

export const runtime = "nodejs";

export async function POST() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const result = await refreshPricesAndTriggerDipAlertsForUser(sessionUser);

    return NextResponse.json({
      ...result.refreshedState,
      triggeredAlerts: result.triggeredAlerts,
      failedAlertTickers: result.failedAlertTickers,
      checkedAlerts: result.checkedAlerts,
    });
  } catch {
    return NextResponse.json({ error: "Failed to refresh live market prices." }, { status: 500 });
  }
}
