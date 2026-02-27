import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { captureMonitoringException } from "@/lib/monitoring";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertCronTokenAuthorized(request);

    const error = new Error("Sentry test error from /api/internal/ops/test-error");

    captureMonitoringException(error, {
      area: "ops_test",
      stage: "manual_trigger",
      metadata: {
        route: "/api/internal/ops/test-error",
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Test error captured and sent to monitoring.",
      at: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test error trigger failed." },
      { status: 500 },
    );
  }
}
