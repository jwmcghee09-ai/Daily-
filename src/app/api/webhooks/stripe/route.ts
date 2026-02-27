import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { notifyWebhookFailure } from "@/lib/alerts";
import {
  findAuthUserByEmail,
  updateBillingSubscriptionByStripeCustomerId,
  updateBillingSubscriptionByStripeSubscriptionId,
  updatePreSignupBillingByStripeCustomerId,
  updatePreSignupBillingByStripeSubscriptionId,
  upsertBillingSubscriptionForUser,
  upsertPreSignupBillingByEmail,
} from "@/lib/db";
import { captureMonitoringException } from "@/lib/monitoring";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let stripe: Stripe;
  let webhookSecret: string;

  try {
    stripe = getStripeClient();
    webhookSecret = getStripeWebhookSecret();
  } catch (error) {
    const message = toErrorMessage(error, "Stripe webhook is not configured.");

    captureMonitoringException(error, {
      area: "stripe_webhook",
      stage: "bootstrap",
      metadata: { message },
    });

    await notifyWebhookFailure({
      provider: "stripe",
      stage: "bootstrap",
      message,
    });

    return NextResponse.json({ error: message }, { status: 503 });
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
    captureMonitoringException(error, {
      area: "stripe_webhook",
      stage: "signature_validation",
    });

    const message = toErrorMessage(error, "Invalid Stripe signature.");
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    handleStripeEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = toErrorMessage(error, "Webhook processing failed.");
    console.error("Stripe webhook processing failed", error);

    captureMonitoringException(error, {
      area: "stripe_webhook",
      stage: "event_processing",
      metadata: {
        eventId: event.id,
        eventType: event.type,
      },
    });

    await notifyWebhookFailure({
      provider: "stripe",
      stage: "event_processing",
      message,
      eventId: event.id,
      eventType: event.type,
    });

    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}

function handleStripeEvent(event: Stripe.Event): void {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const checkoutEmail =
        sanitizeMaybeString(session.metadata?.checkoutEmail) ||
        sanitizeMaybeString(session.customer_email) ||
        sanitizeMaybeString(session.customer_details?.email);
      const customerId = extractStripeId(session.customer);
      const subscriptionId = extractStripeId(session.subscription);
      const stripePriceId = sanitizeMaybeString(session.metadata?.priceId);
      const status = checkoutStatusToSubscriptionStatus(session.payment_status);

      if (checkoutEmail) {
        upsertPreSignupBillingByEmail({
          email: checkoutEmail,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId,
          status,
          checkoutCompletedAt: new Date().toISOString(),
        });
      }

      const userId =
        sanitizeMaybeString(session.metadata?.userId) ||
        sanitizeMaybeString(session.client_reference_id) ||
        findUserIdByEmail(checkoutEmail);

      if (!userId) {
        return;
      }

      upsertBillingSubscriptionForUser({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId,
        status,
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
      const status = sanitizeMaybeString(subscription.status);
      const patch = {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId,
        status,
        currentPeriodEnd,
      };

      if (userId) {
        upsertBillingSubscriptionForUser({ userId, ...patch });
      }

      if (subscriptionId) {
        updateBillingSubscriptionByStripeSubscriptionId(subscriptionId, patch);
        updatePreSignupBillingByStripeSubscriptionId(subscriptionId, patch);
      }

      if (customerId) {
        updateBillingSubscriptionByStripeCustomerId(customerId, patch);
        updatePreSignupBillingByStripeCustomerId(customerId, patch);
      }

      return;
    }

    default:
      return;
  }
}

function findUserIdByEmail(email: string | null): string | null {
  if (!email) {
    return null;
  }

  const user = findAuthUserByEmail(email);
  return user?.id || null;
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

function checkoutStatusToSubscriptionStatus(paymentStatus: Stripe.Checkout.Session.PaymentStatus | null): string {
  if (paymentStatus === "paid" || paymentStatus === "no_payment_required") {
    return "active";
  }

  return "incomplete";
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}
