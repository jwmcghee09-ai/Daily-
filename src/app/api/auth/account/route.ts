import { NextResponse } from "next/server";
import { clearSessionCookie, destroySessionToken, getAuthenticatedUser, SESSION_COOKIE_NAME } from "@/lib/auth";
import { deleteUserAccountData, readBillingSubscription } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function DELETE() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    }

    // Cancel Stripe subscription if one exists (best-effort, never blocks deletion)
    try {
      const subscription = readBillingSubscription(user.id);
      if (subscription?.stripeSubscriptionId) {
        const stripe = getStripeClient();
        await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
      }
    } catch {
      // Stripe not configured or subscription already gone — continue
    }

    // Delete all user data from the database
    deleteUserAccountData(user.id);

    // Clear the session token (session row already gone after deleteUserAccountData)
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
    if (token) {
      try { destroySessionToken(token); } catch { /* already deleted */ }
    }

    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    console.error("Account deletion failed", error);
    return NextResponse.json(
      { error: "Account deletion failed. Please contact support." },
      { status: 500 },
    );
  }
}
