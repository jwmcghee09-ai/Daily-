import fs from "node:fs";
import { NextResponse } from "next/server";
import { getDatabaseFilePath } from "@/lib/db";
export const runtime = "nodejs";

export async function GET() {
  const dbPath = getDatabaseFilePath();
  const dbExists = fs.existsSync(dbPath);

  return NextResponse.json({
    ok: true,
    service: "spectre-web",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      databaseFileExists: dbExists,
    },
  });
}
