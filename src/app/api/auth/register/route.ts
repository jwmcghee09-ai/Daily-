import { NextResponse } from "next/server";
import {
  createAuthUser,
  findAuthUserByEmail,
  hasActivePreSignupBillingByEmail,
  linkPreSignupBillingToUser,
} from "@/lib/db";
import {
  applySessionCookie,
  createAndPersistSession,
  getClientAddress,
  hashPassword,
  isLikelyEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const REGISTER_LIMIT = 10;
const REGISTER_WINDOW_MS = 15 * 60 * 1000;

interface RegisterPayload {
  email?: string;
  password?: string;
  displayName?: string;
  acceptsTerms?: boolean;
}

export async function POST(request: Request) {
  try {
    const ip = getClientAddress(request);
    const rate = consumeRateLimit(`register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-up attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
      );
    }

    const payload = (await request.json()) as RegisterPayload;

    const email = normalizeEmail(payload.email || "");
    const password = payload.password || "";
    const displayName = normalizeDisplayName(payload.displayName || "", email);
    const acceptsTerms = payload.acceptsTerms === true;

    if (!acceptsTerms) {
      return NextResponse.json({ error: "You must agree to the Terms & Conditions to create an account." }, { status: 400 });
    }

    if (!isLikelyEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = findAuthUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    if (!hasActivePreSignupBillingByEmail(email)) {
      return NextResponse.json(
        { error: "Complete Stripe checkout first, then sign up with the same email." },
        { status: 402 },
      );
    }

    const passwordHash = hashPassword(password);
    const termsAcceptedAt = new Date().toISOString();
    const user = createAuthUser(email, passwordHash, displayName, termsAcceptedAt);
    linkPreSignupBillingToUser(user.id, user.email);
    const session = createAndPersistSession(user.id);

    const response = NextResponse.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });

    applySessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}
