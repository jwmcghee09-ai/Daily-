import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { estimateHistoricalRiskFromYahoo } from "@/lib/db";
import { getDemoGuestContext } from "@/lib/demo-guest";
import { RiskWindow } from "@/lib/portfolio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    const url = new URL(request.url);
    const isDemo = url.searchParams.get("demo") === "1";
    const demoGuest = !sessionUser && isDemo ? await getDemoGuestContext() : null;

    if (!sessionUser && !demoGuest) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const riskWindow = toRiskWindow(url.searchParams.get("window"));

    const estimate = await estimateHistoricalRiskFromYahoo(sessionUser?.id || demoGuest?.userId || "", riskWindow);
    return NextResponse.json(estimate);
  } catch {
    return NextResponse.json({ error: "Failed to estimate historical risk from Yahoo." }, { status: 500 });
  }
}

function toRiskWindow(raw: string | null): RiskWindow {
  if (raw === "1M" || raw === "3M" || raw === "1Y") {
    return raw;
  }

  return "3M";
}
