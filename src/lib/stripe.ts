import Stripe from "stripe";

let stripeClient: Stripe | null = null;
export type BillingPlan = "starter" | "pro";

function readValue(name: string): string {
  return (process.env[name] || "").trim();
}

export function getStripeSecretKey(): string {
  const value = readValue("STRIPE_SECRET_KEY");
  if (!value) {
    throw new Error("Stripe is not configured: STRIPE_SECRET_KEY is missing.");
  }
  return value;
}

export function getStripeWebhookSecret(): string {
  const value = readValue("STRIPE_WEBHOOK_SECRET");
  if (!value) {
    throw new Error("Stripe webhook is not configured: STRIPE_WEBHOOK_SECRET is missing.");
  }
  return value;
}

export function getStarterPriceId(): string {
  const value = readValue("STRIPE_PRICE_STARTER_MONTHLY");
  if (!value) {
    throw new Error("Stripe is not configured: STRIPE_PRICE_STARTER_MONTHLY is missing.");
  }
  return value;
}

export function getProPriceId(): string {
  const value = readValue("STRIPE_PRO_PRICE_ID");
  if (!value) {
    throw new Error("Stripe is not configured: STRIPE_PRO_PRICE_ID is missing.");
  }
  return value;
}

export function getPriceIdForPlan(plan: BillingPlan): string {
  if (plan === "pro") {
    return getProPriceId();
  }

  return getStarterPriceId();
}

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey());
  }
  return stripeClient;
}

export function getAppBaseUrl(request: Request): string {
  const explicit = readValue("APP_BASE_URL");
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }

  const renderExternal = readValue("RENDER_EXTERNAL_URL");
  if (renderExternal) {
    return renderExternal.replace(/\/$/, "");
  }

  try {
    const url = new URL(request.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "http://localhost:3000";
  }
}
