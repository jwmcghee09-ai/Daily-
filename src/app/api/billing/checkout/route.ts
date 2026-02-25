import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getAppBaseUrl, getStarterPriceId, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    let stripe;
    let starterPriceId;

    try {
      stripe = getStripeClient();
      starterPriceId = getStarterPriceId();
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Stripe is not configured." }, { status: 503 });
    }

    const baseUrl = getAppBaseUrl(request);

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: starterPriceId, quantity: 1 }],
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        priceId: starterPriceId,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          priceId: starterPriceId,
        },
      },
      allow_promotion_codes: true,
      success_url: `${baseUrl}/?checkout=success`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
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
