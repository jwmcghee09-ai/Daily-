import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { runEncryptedBackupNow } from "@/lib/backup-service";
import { isOperationalAlertConfigured, sendOperationalAlertEmail } from "@/lib/mailer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);

    const result = runEncryptedBackupNow();
    await sendDiskUsageAlertIfNeeded(result.diskUsageUsedPct);

    return NextResponse.json({
      ok: true,
      backupPath: result.backupPath,
      databasePath: result.databasePath,
      rawSizeBytes: result.rawSizeBytes,
      compressedSizeBytes: result.compressedSizeBytes,
      backupRetentionDays: result.backupRetentionDays,
      deletedBackupFiles: result.deletedBackupFiles,
      remainingBackupFiles: result.remainingBackupFiles,
      diskUsageUsedPct: result.diskUsageUsedPct,
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

async function sendDiskUsageAlertIfNeeded(diskUsageUsedPct: number | null): Promise<void> {
  if (!isOperationalAlertConfigured() || diskUsageUsedPct == null || !Number.isFinite(diskUsageUsedPct)) {
    return;
  }

  const warnThreshold = toPercentThreshold(process.env.DISK_ALERT_WARN_PCT, 80);
  const criticalThreshold = toPercentThreshold(process.env.DISK_ALERT_CRITICAL_PCT, 90);
  if (diskUsageUsedPct < warnThreshold) {
    return;
  }

  const roundedPct = diskUsageUsedPct.toFixed(1);
  const severity = diskUsageUsedPct >= criticalThreshold ? "CRITICAL" : "WARNING";

  await sendOperationalAlertEmail({
    subject: `[SPECTRE Alert] ${severity} disk usage ${roundedPct}%`,
    lines: [
      `Severity: ${severity}`,
      `Disk usage: ${roundedPct}%`,
      `Warn threshold: ${warnThreshold}%`,
      `Critical threshold: ${criticalThreshold}%`,
      "Source: internal backup cron endpoint",
    ],
  }).catch((error) => {
    console.error("Disk usage alert email failed", error);
  });
}

function toPercentThreshold(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(String(rawValue || "").trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(99, Math.max(1, parsed));
}
