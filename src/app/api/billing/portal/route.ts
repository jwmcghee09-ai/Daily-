import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { readBillingSubscription } from "@/lib/db";
import { getAppBaseUrl, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
    }

    const subscription = readBillingSubscription(user.id);
    if (!subscription?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No active billing profile was found for this account." },
        { status: 400 },
      );
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

    const baseUrl = getAppBaseUrl(request);
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${baseUrl}/?classic=1#settings`,
    });

    if (!portalSession.url) {
      return NextResponse.json({ error: "Billing portal URL was not generated." }, { status: 502 });
    }

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error("Stripe billing portal session creation failed", error);
    return NextResponse.json({ error: "Unable to open billing portal." }, { status: 500 });
  }
}
