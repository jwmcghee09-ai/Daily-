import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDatabaseFilePath } from "@/lib/db";
import { isEmailDeliveryConfigured, isOperationalAlertConfigured } from "@/lib/mailer";

export const runtime = "nodejs";

export async function GET() {
  const dbPath = getDatabaseFilePath();
  const dbExists = fs.existsSync(dbPath);

  const stripeConfigured =
    Boolean((process.env.STRIPE_SECRET_KEY || "").trim()) &&
    Boolean((process.env.STRIPE_PRICE_STARTER_MONTHLY || "").trim()) &&
    Boolean((process.env.STRIPE_WEBHOOK_SECRET || "").trim());

  return NextResponse.json({
    ok: true,
    service: "spectre-web",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "unknown",
    version: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      databaseFileExists: dbExists,
      databasePath: dbPath,
      emailDeliveryConfigured: isEmailDeliveryConfigured(),
      webhookAlertingConfigured: isOperationalAlertConfigured(),
      stripeConfigured,
      sentryConfigured: Boolean((process.env.SENTRY_DSN || "").trim()),
    },
  });
}
