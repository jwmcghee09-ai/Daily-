import { NextResponse } from "next/server";
import { clearSessionCookie, getAuthenticatedUser } from "@/lib/auth";
import { getAiUsageThisMonth, readBillingSubscription, readUserEntitlements, upsertBillingSubscriptionForUser } from "@/lib/db";
import { getStripeClient } from "@/lib/stripe";
import Stripe from "stripe";

const AI_MONTHLY_LIMITS: Record<string, number> = { none: 3, free: 3, plus: 20, pro: -1 };

export const runtime = "nodejs";

export async function GET() {
  const sessionUser = await getAuthenticatedUser();

  if (!sessionUser) {
    const response = NextResponse.json({ authenticated: false });
    clearSessionCookie(response);
    return response;
  }

  let entitlements = readUserEntitlements(sessionUser.id);
  if (entitlements.planTier === "none") {
    const recovered = await recoverMembershipFromStripe(sessionUser.id, sessionUser.email);
    if (recovered) {
      entitlements = readUserEntitlements(sessionUser.id);
    }
  }
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
    },
  });
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

async function recoverMembershipFromStripe(userId: string, email: string): Promise<boolean> {
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return false;
  }

  const localSubscription = readBillingSubscription(userId);

  const recoveredFromSavedSubscription = await recoverFromSavedSubscription(stripe, userId, localSubscription);
  if (recoveredFromSavedSubscription) {
    return true;
  }

  const recoveredFromSearch = await recoverFromSubscriptionSearch(stripe, userId, email);
  if (recoveredFromSearch) {
    return true;
  }

  return recoverFromCustomerEmail(stripe, userId, email);
}

async function recoverFromSavedSubscription(
  stripe: Stripe,
  userId: string,
  subscription: ReturnType<typeof readBillingSubscription>,
): Promise<boolean> {
  const subscriptionId = (subscription?.stripeSubscriptionId || "").trim();
  if (!subscriptionId) {
    return false;
  }

  try {
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    return persistStripeSubscription(userId, stripeSubscription);
  } catch {
    return false;
  }
}

async function recoverFromSubscriptionSearch(stripe: Stripe, userId: string, email: string): Promise<boolean> {
  const normalizedEmail = (email || "").trim().toLowerCase();
  const queries = [
    `metadata['userId']:'${escapeStripeSearchString(userId)}'`,
    normalizedEmail ? `metadata['checkoutEmail']:'${escapeStripeSearchString(normalizedEmail)}'` : "",
  ].filter(Boolean);

  for (const query of queries) {
    try {
      const result = await stripe.subscriptions.search({ query, limit: 10 });
      const activeSubscription = result.data.find((subscription) =>
        ACTIVE_STATUSES.has((subscription.status || "").toLowerCase()),
      );

      if (activeSubscription && persistStripeSubscription(userId, activeSubscription)) {
        return true;
      }
    } catch {
      // Search is best-effort recovery only.
    }
  }

  return false;
}

async function recoverFromCustomerEmail(stripe: Stripe, userId: string, email: string): Promise<boolean> {
  const normalizedEmail = (email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const customerIds = new Set<string>();

  try {
    const searchResult = await stripe.customers.search({
      query: `email:'${escapeStripeSearchString(normalizedEmail)}'`,
      limit: 10,
    });
    for (const customer of searchResult.data) {
      if (!customer.deleted) {
        customerIds.add(customer.id);
      }
    }
  } catch {
    // Fallback to list below.
  }

  try {
    const listed = await stripe.customers.list({ email: normalizedEmail, limit: 10 });
    for (const customer of listed.data) {
      if (!customer.deleted) {
        customerIds.add(customer.id);
      }
    }
  } catch {
    // If Stripe customer lookup fails entirely, just stop recovery.
  }

  for (const customerId of customerIds) {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });

      const activeSubscription = subscriptions.data.find((subscription) =>
        ACTIVE_STATUSES.has((subscription.status || "").toLowerCase()),
      );

      if (activeSubscription && persistStripeSubscription(userId, activeSubscription)) {
        return true;
      }
    } catch {
      // Try next customer.
    }
  }

  return false;
}

function persistStripeSubscription(userId: string, subscription: Stripe.Subscription): boolean {
  const status = (subscription.status || "").toLowerCase();
  if (!ACTIVE_STATUSES.has(status)) {
    return false;
  }

  const customerId = extractStripeId(subscription.customer);
  if (!customerId) {
    return false;
  }

  upsertBillingSubscriptionForUser({
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: subscription.items.data[0]?.price.id ?? undefined,
    status: subscription.status || undefined,
    currentPeriodEnd: unixSecondsToIso(subscription.items.data[0]?.current_period_end),
  });

  return true;
}

function extractStripeId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (value && typeof value === "object" && "id" in value) {
    return typeof value.id === "string" && value.id.trim() ? value.id.trim() : null;
  }

  return null;
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function escapeStripeSearchString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
