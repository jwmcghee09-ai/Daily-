import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { clearPortfolioData, readPortfolioState } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const state = readPortfolioState(sessionUser.id);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Failed to load portfolio data." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const sessionUser = await getAuthenticatedUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const state = clearPortfolioData(sessionUser.id);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Failed to clear portfolio data." }, { status: 500 });
  }
}
