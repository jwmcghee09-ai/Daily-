import { NextResponse } from "next/server";
import { clearSessionCookie, getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const sessionUser = await getAuthenticatedUser();

  if (!sessionUser) {
    const response = NextResponse.json({ authenticated: false });
    clearSessionCookie(response);
    return response;
  }

  const entitlements = readUserEntitlements(sessionUser.id);

  return NextResponse.json({
    authenticated: true,
    user: {
      id: sessionUser.id,
      email: sessionUser.email,
      displayName: sessionUser.displayName,
      createdAt: sessionUser.createdAt,
      planTier: entitlements.planTier,
      proEnabled: entitlements.proEnabled,
      subscriptionStatus: entitlements.subscriptionStatus,
    },
  });
}
