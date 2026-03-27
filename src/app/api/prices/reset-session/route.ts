import { NextResponse } from "next/server";
import { resetAllSessionMovers } from "@/lib/db";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";

export const runtime = "nodejs";

function getSydneyClock(date: Date): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value || "", 10);
  return {
    dateKey,
    hour: Number.isFinite(hour) ? hour : -1,
  };
}

/**
 * POST /api/prices/reset-session
 *
 * Resets session movers for all users by setting session_open = price.
 * Invoked by a frequent cron and only executes during the Sydney midnight hour.
 */
export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);

    const now = new Date();
    const sydneyClock = getSydneyClock(now);

    if (sydneyClock.hour !== 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Outside Sydney midnight window.",
        sydneyDate: sydneyClock.dateKey,
        resetAt: now.toISOString(),
      });
    }

    const { resetCount } = resetAllSessionMovers();

    return NextResponse.json({
      ok: true,
      skipped: false,
      resetCount,
      sydneyDate: sydneyClock.dateKey,
      resetAt: now.toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[reset-session] Failed:", error);
    return NextResponse.json(
      { error: "Failed to reset session movers" },
      { status: 500 },
    );
  }
}
