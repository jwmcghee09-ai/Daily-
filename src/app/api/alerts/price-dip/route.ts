import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  deletePriceDipAlert,
  readPortfolioState,
  readPriceDipAlerts,
  readUserEntitlements,
  upsertPriceDipAlert,
} from "@/lib/db";

export const runtime = "nodejs";

interface UpsertAlertBody {
  ticker?: unknown;
  dropPctThreshold?: unknown;
  enabled?: unknown;
}

function toPlanAlertLimit(planTier: "none" | "starter" | "pro", proEnabled: boolean): number {
  if (proEnabled || planTier === "pro") {
    return 10;
  }

  if (planTier === "starter") {
    return 2;
  }

  return 0;
}

function normalizeTicker(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }

  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, 20);
}

function toThreshold(input: unknown): number {
  const value = Number(input);
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }

  return Math.min(90, Math.max(0.1, value));
}

export async function GET() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const entitlements = readUserEntitlements(sessionUser.id);
    const alerts = readPriceDipAlerts(sessionUser.id);
    const portfolio = readPortfolioState(sessionUser.id);

    const availableTickers = Array.from(
      new Set(
        portfolio.holdings
          .filter((holding) => holding.source === "asx" || holding.source === "crypto")
          .map((holding) => holding.ticker.toUpperCase())
          .filter((ticker) => ticker.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));

    return NextResponse.json({
      alerts,
      maxAlerts: toPlanAlertLimit(entitlements.planTier, entitlements.proEnabled),
      planTier: entitlements.planTier,
      proEnabled: entitlements.proEnabled,
      availableTickers,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load price dip alerts." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const entitlements = readUserEntitlements(sessionUser.id);
    const maxAlerts = toPlanAlertLimit(entitlements.planTier, entitlements.proEnabled);

    if (maxAlerts <= 0) {
      return NextResponse.json({ error: "An active subscription is required to use alerts." }, { status: 403 });
    }

    let body: UpsertAlertBody;
    try {
      body = (await request.json()) as UpsertAlertBody;
    } catch {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const ticker = normalizeTicker(body.ticker);
    const dropPctThreshold = toThreshold(body.dropPctThreshold);
    const enabled = typeof body.enabled === "boolean" ? body.enabled : true;

    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    }

    if (!Number.isFinite(dropPctThreshold)) {
      return NextResponse.json({ error: "Drop threshold must be a valid number." }, { status: 400 });
    }

    const existingAlerts = readPriceDipAlerts(sessionUser.id);
    const existing = existingAlerts.find((alert) => alert.ticker === ticker);

    if (!existing && existingAlerts.length >= maxAlerts) {
      return NextResponse.json(
        { error: `Plan limit reached. You can track up to ${maxAlerts} dip alert${maxAlerts === 1 ? "" : "s"}.` },
        { status: 403 },
      );
    }

    const alert = upsertPriceDipAlert(sessionUser.id, {
      ticker,
      dropPctThreshold,
      enabled,
    });

    return NextResponse.json({ alert, maxAlerts });
  } catch {
    return NextResponse.json({ error: "Failed to save price dip alert." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const url = new URL(request.url);
    const ticker = normalizeTicker(url.searchParams.get("ticker"));

    if (!ticker) {
      return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    }

    deletePriceDipAlert(sessionUser.id, ticker);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete price dip alert." }, { status: 500 });
  }
}
