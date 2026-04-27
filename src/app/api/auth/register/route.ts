import { NextResponse } from "next/server";
import {
  createAuthUser,
  createEmailVerificationRecord,
  findAuthUserByEmail,
  linkPreSignupBillingToUser,
} from "@/lib/db";
import {
  EMAIL_VERIFICATION_TTL_MS,
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

    if (!isEmailDeliveryConfigured()) {
      return NextResponse.json(
        { error: "Email verification is not configured yet. Please contact support." },
        { status: 503 },
      );
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
    const user = createAuthUser(email, passwordHash, displayName, termsAcceptedAt);
    linkPreSignupBillingToUser(user.id, user.email);

    const verificationToken = generateEmailVerificationToken();
    const verificationTokenHash = hashEmailVerificationToken(verificationToken);
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString();
    createEmailVerificationRecord(user.id, verificationTokenHash, expiresAt);

    try {
      await sendAccountVerificationEmail({
        toEmail: user.email,
        displayName: user.displayName,
        verificationToken,
      });
    } catch (error) {
      console.error("Account verification email send failed", error);
      return NextResponse.json(
        { error: "Account created, but verification email failed to send. Use resend verification." },
        { status: 502 },
      );
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

    return NextResponse.json({
      authenticated: false,
      verificationRequired: true,
      message: "Account created. Check your email to verify before signing in, then choose your plan from pricing or settings.",
    });
  } catch {
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}
