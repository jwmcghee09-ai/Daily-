import { listUsersWithEnabledDipAlerts, readUserEntitlements } from "@/lib/db";
import { refreshPricesAndTriggerDipAlertsForUser } from "@/lib/price-dip-alerts";

export interface ProDipAlertScannedUser {
  userId: string;
  email: string;
  checkedAlerts: number;
  triggeredAlerts: number;
  failedAlertTickers: string[];
  lastPriceRefreshAt: string;
}

export interface ProDipAlertSkippedUser {
  userId: string;
  email: string;
  reason: string;
}

export interface ProDipAlertFailedUser {
  userId: string;
  email: string;
  error: string;
}

export interface ProDipAlertBackgroundScanResult {
  candidateUsers: number;
  scannedUsers: ProDipAlertScannedUser[];
  skippedUsers: ProDipAlertSkippedUser[];
  failedUsers: ProDipAlertFailedUser[];
  totalAlertsChecked: number;
  totalAlertsTriggered: number;
}

export async function runProDipAlertBackgroundScan(): Promise<ProDipAlertBackgroundScanResult> {
  const candidates = listUsersWithEnabledDipAlerts();
  const scannedUsers: ProDipAlertScannedUser[] = [];
  const skippedUsers: ProDipAlertSkippedUser[] = [];
  const failedUsers: ProDipAlertFailedUser[] = [];

  for (const user of candidates) {
    const entitlements = readUserEntitlements(user.id);
    if (!entitlements.proEnabled && entitlements.planTier !== "plus") {
      skippedUsers.push({
        userId: user.id,
        email: user.email,
        reason: "No active Plus or Pro subscription",
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

  return {
    candidateUsers: candidates.length,
    scannedUsers,
    skippedUsers,
    failedUsers,
    totalAlertsChecked: scannedUsers.reduce((sum, user) => sum + user.checkedAlerts, 0),
    totalAlertsTriggered: scannedUsers.reduce((sum, user) => sum + user.triggeredAlerts, 0),
  };
}
