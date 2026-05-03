import { NextResponse } from "next/server";
import { clearSessionCookie, getAuthenticatedUser } from "@/lib/auth";
import { readUserEntitlements, getAiUsageThisMonth } from "@/lib/db";

const AI_MONTHLY_LIMITS: Record<string, number> = { none: 10, free: 10, plus: 20, pro: -1 };

export const runtime = "nodejs";

export async function GET() {
  const sessionUser = await getAuthenticatedUser();

  if (!sessionUser) {
    const response = NextResponse.json({ authenticated: false });
    clearSessionCookie(response);
    return response;
  }

  const entitlements = readUserEntitlements(sessionUser.id);
  const aiUsed = getAiUsageThisMonth(sessionUser.id);
  const aiLimit = AI_MONTHLY_LIMITS[entitlements.planTier] ?? 3;

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
      aiUsedThisMonth: aiUsed,
      aiMonthlyLimit: aiLimit,
      emailVerified: !!sessionUser.emailVerifiedAt,
    },
  });
}
