import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { clearPortfolioData, clearPortfolioSource, readPortfolioState } from "@/lib/db";
import { attachDemoGuestCookie, clearDemoGuestCookie, clearDemoGuestWorkspace, createDemoGuestContext, getDemoGuestContext, resetDemoGuestPortfolio } from "@/lib/demo-guest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const sessionUser = await getAuthenticatedUser();
    const isDemo = new URL(request.url).searchParams.get("demo") === "1";

    if (!sessionUser && isDemo) {
      /*
       * Start the demo here, rather than waiting for an upload.
       *
       * The guest workspace used to be created by the import route, so anyone
       * who clicked "Live Demo" and simply looked around had no guest session
       * at all — and every demo-aware endpoint answered 401 to a visitor who
       * had done nothing wrong. The portfolio is the first thing the page asks
       * for, so it is the right place to begin, and creating it seeds the
       * sample holdings so the server has the same book the page is drawing.
       */
      const existing = await getDemoGuestContext();
      const demoGuest = existing ?? createDemoGuestContext();

      const response = NextResponse.json({
        ...readPortfolioState(demoGuest.userId),
        demoGuest,
      });
      if (!existing) {
        attachDemoGuestCookie(response, demoGuest.userId, demoGuest.expiresAt);
      }
      return response;
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
    const purgeDemo = new URL(request.url).searchParams.get("purge") === "1";

    if (!sessionUser && isDemo) {
      const demoGuest = await getDemoGuestContext();
      if (!demoGuest) {
        return NextResponse.json({ state: null, demoGuest: null });
      }

      if (purgeDemo) {
        clearDemoGuestWorkspace(demoGuest.userId);
        const response = NextResponse.json({ state: null, demoGuest: null });
        clearDemoGuestCookie(response);
        return response;
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

    // ?source=us clears just that import (e.g. broker-synced positions),
    // leaving every other source intact. Without it, everything is cleared.
    const source = new URL(request.url).searchParams.get("source");
    if (source) {
      const allowed = ["super", "asx", "us", "gold", "index", "fund", "crypto", "tax", "savings"];
      if (!allowed.includes(source)) {
        return NextResponse.json(
          { error: `Unknown source "${source}". Expected one of: ${allowed.join(", ")}` },
          { status: 400 },
        );
      }
      const scoped = clearPortfolioSource(sessionUser.id, source as Parameters<typeof clearPortfolioSource>[1]);
      return NextResponse.json(scoped);
    }

    const state = clearPortfolioData(sessionUser.id);
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: "Failed to clear portfolio data." }, { status: 500 });
  }
}
