import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { runRestoreIntegrityTestNow } from "@/lib/backup-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);

    const result = runRestoreIntegrityTestNow();

    return NextResponse.json({
      ok: true,
      backupPath: result.backupPath,
      tables: result.tables,
      usersCount: result.usersCount,
      holdingsCount: result.holdingsCount,
      snapshotsCount: result.snapshotsCount,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Restore test failed." },
      { status: 500 },
    );
  }
}
