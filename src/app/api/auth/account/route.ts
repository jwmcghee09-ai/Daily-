import { NextResponse } from "next/server";
import { clearSessionCookie, destroySessionToken, getAuthenticatedUser, SESSION_COOKIE_NAME } from "@/lib/auth";
import { deleteUserAccountData, readBillingSubscription } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function DELETE() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  // Cancel Stripe subscription if one exists
  const subscription = readBillingSubscription(user.id);
  if (subscription?.stripeSubscriptionId) {
    try {
      const stripe = getStripeClient();
      await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch {
      // Best-effort — do not block account deletion if Stripe fails
    }
  }

  // Delete all user data from the database
  deleteUserAccountData(user.id);

  // Clear the session cookie
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
  if (token) {
    try {
      destroySessionToken(token);
    } catch {
      // Already cleaned up by deleteUserAccountData (sessions table deleted)
    }
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
