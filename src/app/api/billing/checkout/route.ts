import { NextResponse } from "next/server";
import { getAuthenticatedUser, isLikelyEmail, normalizeEmail } from "@/lib/auth";
import { readBillingSubscription, upsertBillingSubscriptionForUser } from "@/lib/db";
import { BillingPlan, getAppBaseUrl, getPriceIdForPlan, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

interface CheckoutRequestBody {
  email?: unknown;
  plan?: unknown;
}

function toGuestEmail(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const email = normalizeEmail(input);
  return isLikelyEmail(email) ? email : null;
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    let body: CheckoutRequestBody = {};

    try {
      body = (await request.json()) as CheckoutRequestBody;
    } catch {
      body = {};
    }

    const guestEmail = toGuestEmail(body.email);
    const plan = toBillingPlan(body.plan);
    if (!user && !guestEmail) {
      return NextResponse.json({ error: "A valid email is required to start checkout." }, { status: 400 });
    }

    let stripe;
    let priceId;

    try {
      stripe = getStripeClient();
      priceId = getPriceIdForPlan(plan);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Stripe is not configured." }, { status: 503 });
    }

    const baseUrl = getAppBaseUrl(request);
    const checkoutEmail = user?.email ?? guestEmail;
    if (!checkoutEmail) {
      return NextResponse.json({ error: "Unable to determine checkout email." }, { status: 400 });
    }

    if (user && plan === "pro") {
      const upgraded = await tryUpgradeExistingSubscription({
        userId: user.id,
        stripe,
        proPriceId: priceId,
      });
      if (upgraded) {
        return NextResponse.json({ url: `${baseUrl}/spectre-settings-v3.html` });
      }
    }

    const metadata: Record<string, string> = {
      plan,
      priceId,
      checkoutEmail,
    };

    if (user) {
      metadata.userId = user.id;
    }

    const existingSubscription = user ? readBillingSubscription(user.id) : null;
    const stripeCustomerId = existingSubscription?.stripeCustomerId || null;
    const checkoutCustomer =
      stripeCustomerId && stripeCustomerId.trim().length > 0 ? stripeCustomerId : null;

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user?.id,
      metadata,
      subscription_data: {
        metadata,
      },
      allow_promotion_codes: true,
      branding_settings: {
        background_color: "#07070b",
        button_color: "#ff4b33",
        border_style: "rounded",
      },
      success_url: `${baseUrl}/?checkout=success&plan=${encodeURIComponent(plan)}`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      ...(checkoutCustomer ? { customer: checkoutCustomer } : { customer_email: checkoutEmail }),
    });

    if (!checkoutSession.url) {
      return NextResponse.json({ error: "Stripe checkout URL was not generated." }, { status: 502 });
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error("Stripe checkout session creation failed", error);
    return NextResponse.json({ error: "Unable to create checkout session." }, { status: 500 });
  }
}

function toBillingPlan(value: unknown): BillingPlan {
  if (value === "pro") {
    return "pro";
  }

  return "starter";
}

const ACTIVE_OR_RECOVERABLE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

async function tryUpgradeExistingSubscription(input: {
  userId: string;
  stripe: ReturnType<typeof getStripeClient>;
  proPriceId: string;
}): Promise<boolean> {
  const existing = readBillingSubscription(input.userId);
  const existingSubscriptionId = (existing?.stripeSubscriptionId || "").trim();
  if (!existingSubscriptionId) {
    return false;
  }

  const subscription = await input.stripe.subscriptions.retrieve(existingSubscriptionId);
  const status = (subscription.status || "").trim().toLowerCase();
  if (!ACTIVE_OR_RECOVERABLE_STATUSES.has(status)) {
    return false;
  }

  const currentItem = subscription.items.data[0];
  if (!currentItem) {
    return false;
  }

  if (currentItem.price.id === input.proPriceId) {
    return true;
  }

  const updated = await input.stripe.subscriptions.update(subscription.id, {
    cancel_at_period_end: false,
    proration_behavior: "create_prorations",
    items: [{ id: currentItem.id, price: input.proPriceId }],
    metadata: {
      ...(subscription.metadata || {}),
      plan: "pro",
      priceId: input.proPriceId,
      userId: input.userId,
    },
  });

  upsertBillingSubscriptionForUser({
    userId: input.userId,
    stripeCustomerId: extractStripeId(updated.customer),
    stripeSubscriptionId: updated.id,
    stripePriceId: input.proPriceId,
    status: updated.status || existing?.status || null,
    currentPeriodEnd: unixSecondsToIso(updated.current_period_end),
  });

  return true;
}

function extractStripeId(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (value && typeof value === "object") {
    const id = Reflect.get(value, "id");
    if (typeof id === "string") {
      const normalized = id.trim();
      return normalized.length > 0 ? normalized : null;
    }
  }
  return null;
}

function unixSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}
