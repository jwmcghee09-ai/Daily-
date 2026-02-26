import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { runEncryptedBackupNow } from "@/lib/backup-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);

    const result = runEncryptedBackupNow();

    return NextResponse.json({
      ok: true,
      backupPath: result.backupPath,
      databasePath: result.databasePath,
      rawSizeBytes: result.rawSizeBytes,
      compressedSizeBytes: result.compressedSizeBytes,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backup failed." },
      { status: 500 },
    );
  }
}
