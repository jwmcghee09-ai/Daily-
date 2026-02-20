import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { estimateHistoricalRiskFromYahoo } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const estimate = await estimateHistoricalRiskFromYahoo(sessionUser.id);
    return NextResponse.json(estimate);
  } catch {
    return NextResponse.json({ error: "Failed to estimate historical risk from Yahoo." }, { status: 500 });
  }
}
