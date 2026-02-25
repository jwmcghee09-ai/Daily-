import { NextResponse } from "next/server";
import { getAuthenticatedUser, isLikelyEmail, normalizeEmail } from "@/lib/auth";
import { getAppBaseUrl, getStarterPriceId, getStripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

interface CheckoutRequestBody {
  email?: unknown;
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
    if (!user && !guestEmail) {
      return NextResponse.json({ error: "A valid email is required to start checkout." }, { status: 400 });
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
    const checkoutEmail = user?.email ?? guestEmail;
    if (!checkoutEmail) {
      return NextResponse.json({ error: "Unable to determine checkout email." }, { status: 400 });
    }

    const metadata: Record<string, string> = {
      priceId: starterPriceId,
      checkoutEmail,
    };

    if (user) {
      metadata.userId = user.id;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: starterPriceId, quantity: 1 }],
      customer_email: checkoutEmail,
      client_reference_id: user?.id,
      metadata,
      subscription_data: {
        metadata,
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
