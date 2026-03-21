import { NextResponse } from "next/server";
import { assertCronTokenAuthorized } from "@/lib/internal-cron-auth";
import { listAllUsers, readBillingSubscription } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    assertCronTokenAuthorized(request);

    const users = listAllUsers();

    const result = users.map((u) => {
      const sub = readBillingSubscription(u.id);
      return {
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        createdAt: u.createdAt,
        emailVerified: Boolean(u.emailVerifiedAt),
        plan: sub?.stripePriceId ? (sub.status === "active" || sub.status === "trialing" ? "paid" : "inactive") : "free",
        subscriptionStatus: sub?.status ?? null,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      };
    });

    return NextResponse.json({ count: result.length, users: result });
  } catch (error) {
    if (error instanceof Error && error.name === "UnauthorizedError") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to list users." }, { status: 500 });
  }
}
