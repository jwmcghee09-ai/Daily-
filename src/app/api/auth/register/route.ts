import { NextResponse } from "next/server";
import {
  createAuthUser,
  createEmailVerificationRecord,
  findAuthUserByEmail,
  linkPreSignupBillingToUser,
  readUserEntitlements,
} from "@/lib/db";
import {
  EMAIL_VERIFICATION_TTL_MS,
  applySessionCookie,
  createAndPersistSession,
  generateEmailVerificationToken,
  getClientAddress,
  hashEmailVerificationToken,
  hashPassword,
  isLikelyEmail,
  normalizeDisplayName,
  normalizeEmail,
  readAuthBody,
} from "@/lib/auth";
import { isEmailDeliveryConfigured, isOperationalAlertConfigured, sendAccountVerificationEmail, sendOperationalAlertEmail } from "@/lib/mailer";
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

    const rawBody = await readAuthBody(request);
    if (rawBody === null) {
      return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    }
    let payload: RegisterPayload;
    try {
      payload = JSON.parse(rawBody) as RegisterPayload;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const email = normalizeEmail(payload.email || "");
    const password = payload.password || "";
    const displayName = normalizeDisplayName(payload.displayName || "", email);
    const acceptsTerms = payload.acceptsTerms === true;

    if (!acceptsTerms) {
      return NextResponse.json({ error: "You must agree to the Terms of Service and Privacy Policy to create an account." }, { status: 400 });
    }

    if (!isLikelyEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (email.length > 254) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    if (password.length > 128) {
      return NextResponse.json({ error: "Password must be at most 128 characters." }, { status: 400 });
    }

    if (password.trim().length === 0) {
      return NextResponse.json({ error: "Password must contain non-whitespace characters." }, { status: 400 });
    }

    const existing = findAuthUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Sign in, or reset your password if you've forgotten it." },
        { status: 409 },
      );
    }

    const passwordHash = hashPassword(password);
    const termsAcceptedAt = new Date().toISOString();
    let user: ReturnType<typeof createAuthUser>;
    try {
      user = createAuthUser(email, passwordHash, displayName, termsAcceptedAt);
    } catch (err) {
      // Catch UNIQUE constraint race (two requests for same email in parallel)
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json(
          { error: "An account with this email already exists. Sign in, or reset your password if you've forgotten it." },
          { status: 409 },
        );
      }
      throw err;
    }
    linkPreSignupBillingToUser(user.id, user.email);

    // Send verification email in the background — don't block signup
    if (isEmailDeliveryConfigured()) {
      const verificationToken = generateEmailVerificationToken();
      const verificationTokenHash = hashEmailVerificationToken(verificationToken);
      const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString();
      createEmailVerificationRecord(user.id, verificationTokenHash, expiresAt);
      sendAccountVerificationEmail({
        toEmail: user.email,
        displayName: user.displayName,
        verificationToken,
      }).catch((err) => console.error("Verification email send failed", err));
    }

    if (isOperationalAlertConfigured()) {
      sendOperationalAlertEmail({
        subject: "New SPECTRE signup",
        lines: [
          `Name: ${user.displayName}`,
          `Email: ${user.email}`,
          `Signed up: ${new Date().toUTCString()}`,
        ],
      }).catch((err) => console.error("New user alert email failed", err));
    }

    // Auto-login — create session immediately so user lands straight in the dashboard
    const entitlements = readUserEntitlements(user.id);
    const session = createAndPersistSession(user.id);

    const response = NextResponse.json({
      authenticated: true,
      verificationRequired: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        planTier: entitlements.planTier,
        proEnabled: entitlements.proEnabled,
        subscriptionStatus: entitlements.subscriptionStatus,
      },
    });

    applySessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch {
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}
