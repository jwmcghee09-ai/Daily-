import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  upsertBillingSubscriptionForUser,
  updateBillingSubscriptionByStripeCustomerId,
  updateBillingSubscriptionByStripeSubscriptionId,
} from "@/lib/db";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let stripe: Stripe;
  let webhookSecret: string;

  try {
    stripe = getStripeClient();
    webhookSecret = getStripeWebhookSecret();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = (await headers()).get("stripe-signature") || "";
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    handleStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

function handleStripeEvent(event: Stripe.Event): void {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = sanitizeMaybeString(session.metadata?.userId) || sanitizeMaybeString(session.client_reference_id);
      if (!userId) {
        return;
      }

      upsertBillingSubscriptionForUser({
        userId,
        stripeCustomerId: extractStripeId(session.customer),
        stripeSubscriptionId: extractStripeId(session.subscription),
        stripePriceId: sanitizeMaybeString(session.metadata?.priceId),
        status: session.payment_status === "paid" ? "active" : "incomplete",
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = sanitizeMaybeString(subscription.metadata?.userId);
      const customerId = extractStripeId(subscription.customer);
      const subscriptionId = sanitizeMaybeString(subscription.id);
      const stripePriceId = sanitizeMaybeString(subscription.items.data[0]?.price?.id) || sanitizeMaybeString(subscription.metadata?.priceId);
      const currentPeriodEnd = unixSecondsToIso(subscription.items.data[0]?.current_period_end);

      if (userId) {
        upsertBillingSubscriptionForUser({
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId,
          status: sanitizeMaybeString(subscription.status),
          currentPeriodEnd,
        });
        return;
      }

      if (subscriptionId) {
        updateBillingSubscriptionByStripeSubscriptionId(subscriptionId, {
          stripeCustomerId: customerId,
          stripePriceId,
          status: sanitizeMaybeString(subscription.status),
          currentPeriodEnd,
        });
      } else if (customerId) {
        updateBillingSubscriptionByStripeCustomerId(customerId, {
          stripeSubscriptionId: subscriptionId,
          stripePriceId,
          status: sanitizeMaybeString(subscription.status),
          currentPeriodEnd,
        });
      }
      return;
    }

    default:
      return;
  }
}

function sanitizeMaybeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractStripeId(value: unknown): string | null {
  if (typeof value === "string") {
    return sanitizeMaybeString(value);
  }

  if (value && typeof value === "object") {
    const objectId = Reflect.get(value, "id");
    if (typeof objectId === "string") {
      return sanitizeMaybeString(objectId);
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
