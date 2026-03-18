import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { clearPortfolioData, readPortfolioState } from "@/lib/db";
import { getDemoGuestContext, resetDemoGuestPortfolio } from "@/lib/demo-guest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    const isDemo = new URL(request.url).searchParams.get("demo") === "1";

    if (!sessionUser && isDemo) {
      const demoGuest = await getDemoGuestContext();
      if (!demoGuest) {
        return NextResponse.json({ state: null, demoGuest: null });
      }

      return NextResponse.json({
        ...readPortfolioState(demoGuest.userId),
        demoGuest,
      });
    }

    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const state = readPortfolioState(sessionUser.id);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Failed to load portfolio data." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    const isDemo = new URL(request.url).searchParams.get("demo") === "1";

    if (!sessionUser && isDemo) {
      const demoGuest = await getDemoGuestContext();
      if (!demoGuest) {
        return NextResponse.json({ state: null, demoGuest: null });
      }

      const state = resetDemoGuestPortfolio(demoGuest.userId);
      return NextResponse.json({
        ...state,
        demoGuest,
      });
    }

    if (!sessionUser) {
      return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
    }

    const state = clearPortfolioData(sessionUser.id);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Failed to clear portfolio data." }, { status: 500 });
  }
}
