import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readBillingSubscription, upsertBillingSubscriptionForUser } from "@/lib/db";
import { getAppBaseUrl, getStripeClient } from "@/lib/stripe";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    }

    let stripe;
    try {
      stripe = getStripeClient();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Stripe is not configured." },
        { status: 503 },
      );
    }

    const subscription = readBillingSubscription(user.id);
    const stripeCustomerId = await resolveStripeCustomerId({
      stripe,
      userId: user.id,
      email: user.email,
      subscription,
    });

    if (!stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "Your billing profile could not be linked yet. Please start checkout again or contact support.",
        },
        { status: 400 },
      );
    }

    const baseUrl = getAppBaseUrl(request);
    let portalSession: Stripe.BillingPortal.Session;
    try {
      portalSession = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${baseUrl}/settings`,
      });
    } catch (error) {
      if (!isMissingStripeResource(error, "customer")) {
        throw error;
      }

      upsertBillingSubscriptionForUser({
        userId: user.id,
        stripeCustomerId: null,
      });

      const recoveredCustomerId = await resolveStripeCustomerId({
        stripe,
        userId: user.id,
        email: user.email,
        subscription: readBillingSubscription(user.id),
      });

      if (!recoveredCustomerId) {
        return NextResponse.json(
          {
            error:
              "Your billing profile could not be linked yet. Please start checkout again or contact support.",
          },
          { status: 400 },
        );
      }

      portalSession = await stripe.billingPortal.sessions.create({
        customer: recoveredCustomerId,
        return_url: `${baseUrl}/settings`,
      });
    }

    if (!portalSession.url) {
      return NextResponse.json({ error: "Billing portal URL was not generated." }, { status: 502 });
    }

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Stripe billing portal session creation failed", error);
    return NextResponse.json({ error: "Unable to open billing portal." }, { status: 500 });
  }
}

async function resolveStripeCustomerId(input: {
  stripe: Stripe;
  userId: string;
  email: string;
  subscription: ReturnType<typeof readBillingSubscription>;
}): Promise<string | null> {
  const localCustomerId = (input.subscription?.stripeCustomerId || "").trim();
  if (localCustomerId) {
    return localCustomerId;
  }

  const subscriptionCustomerId = await recoverCustomerIdFromSubscription(input);
  if (subscriptionCustomerId) {
    return subscriptionCustomerId;
  }

  const searchedCustomerId = await recoverCustomerIdFromSubscriptionSearch(input);
  if (searchedCustomerId) {
    return searchedCustomerId;
  }

  return recoverCustomerIdFromEmail(input);
}

async function recoverCustomerIdFromSubscription(input: {
  stripe: Stripe;
  userId: string;
  subscription: ReturnType<typeof readBillingSubscription>;
}): Promise<string | null> {
  const subscriptionId = (input.subscription?.stripeSubscriptionId || "").trim();
  if (!subscriptionId) {
    return null;
  }

  let stripeSubscription: Stripe.Subscription;
  try {
    stripeSubscription = await input.stripe.subscriptions.retrieve(subscriptionId);
  } catch (error) {
    if (!isMissingStripeResource(error, "subscription")) {
      throw error;
    }

    upsertBillingSubscriptionForUser({
      userId: input.userId,
      stripeSubscriptionId: null,
      status: null,
    });
    return null;
  }

  const customerId = extractStripeId(stripeSubscription.customer);
  if (!customerId) {
    return null;
  }

  upsertBillingSubscriptionForUser({
    userId: input.userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: stripeSubscription.items.data[0]?.price.id ?? undefined,
    status: stripeSubscription.status || undefined,
  });

  return customerId;
}

async function recoverCustomerIdFromEmail(input: {
  stripe: Stripe;
  userId: string;
  email: string;
}): Promise<string | null> {
  const normalizedEmail = (input.email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  try {
    const searchResult = await input.stripe.customers.search({
      query: `email:'${escapeStripeSearchString(normalizedEmail)}'`,
      limit: 5,
    });
    const searchedCustomer = searchResult.data.find((customer) => !customer.deleted) || null;
    if (searchedCustomer) {
      upsertBillingSubscriptionForUser({
        userId: input.userId,
        stripeCustomerId: searchedCustomer.id,
      });

      return searchedCustomer.id;
    }
  } catch {
    // Fallback to the broader list API below.
  }

  const customers = await input.stripe.customers.list({
    email: normalizedEmail,
    limit: 10,
  });

  const activeCustomer = customers.data.find((customer) => !customer.deleted) || null;
  if (!activeCustomer) {
    return null;
  }

  upsertBillingSubscriptionForUser({
    userId: input.userId,
    stripeCustomerId: activeCustomer.id,
  });

  return activeCustomer.id;
}

async function recoverCustomerIdFromSubscriptionSearch(input: {
  stripe: Stripe;
  userId: string;
  email: string;
}): Promise<string | null> {
  const queries = [
    `metadata['userId']:'${escapeStripeSearchString(input.userId)}'`,
    `metadata['checkoutEmail']:'${escapeStripeSearchString((input.email || "").trim().toLowerCase())}'`,
  ].filter(Boolean);

  for (const query of queries) {
    try {
      const result = await input.stripe.subscriptions.search({
        query,
        limit: 5,
      });

      const match = result.data.find((subscription) => {
        const status = (subscription.status || "").toLowerCase();
        return ["active", "trialing", "past_due", "unpaid"].includes(status);
      });

      if (!match) {
        continue;
      }

      const customerId = extractStripeId(match.customer);
      if (!customerId) {
        continue;
      }

      upsertBillingSubscriptionForUser({
        userId: input.userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: match.id,
        stripePriceId: match.items.data[0]?.price.id ?? undefined,
        status: match.status || undefined,
      });

      return customerId;
    } catch {
      // Search is a recovery path only; keep trying the next option.
    }
  }

  return null;
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

function getStripeErrorCode(error: unknown): string {
  const code = Reflect.get(error as object, "code");
  return typeof code === "string" ? code : "";
}

function getStripeErrorParam(error: unknown): string {
  const param = Reflect.get(error as object, "param");
  return typeof param === "string" ? param : "";
}

function getStripeErrorMessage(error: unknown): string {
  const message = Reflect.get(error as object, "message");
  return typeof message === "string" ? message : "";
}

function isMissingStripeResource(error: unknown, resource: "customer" | "subscription"): boolean {
  const code = getStripeErrorCode(error);
  const param = getStripeErrorParam(error).toLowerCase();
  const message = getStripeErrorMessage(error).toLowerCase();

  if (message.includes(`no such ${resource}`)) {
    return true;
  }

  if (code !== "resource_missing") {
    return false;
  }

  if (!param) {
    return true;
  }

  return param.includes(resource);
}

function escapeStripeSearchString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
