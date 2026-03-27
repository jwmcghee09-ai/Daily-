import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { runProDipAlertBackgroundScan } from "@/lib/pro-dip-alert-scan";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);
    const result = await runProDipAlertBackgroundScan();

    return NextResponse.json({
      ok: true,
      candidateUsers: result.candidateUsers,
      scannedUsers: result.scannedUsers.length,
      skippedUsers: result.skippedUsers,
      failedUsers: result.failedUsers,
      totalAlertsChecked: result.totalAlertsChecked,
      totalAlertsTriggered: result.totalAlertsTriggered,
      results: result.scannedUsers,
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
