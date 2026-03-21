import { NextResponse } from "next/server";
import { createEmailVerificationRecord, findAuthUserByEmail } from "@/lib/db";
import {
  EMAIL_VERIFICATION_TTL_MS,
  generateEmailVerificationToken,
  getClientAddress,
  hashEmailVerificationToken,
  isLikelyEmail,
  normalizeEmail,
} from "@/lib/auth";
import { isEmailDeliveryConfigured, sendAccountVerificationEmail } from "@/lib/mailer";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RESEND_LIMIT_PER_IP = 10;
const RESEND_LIMIT_PER_EMAIL = 5;
const RESEND_WINDOW_MS = 15 * 60 * 1000;

interface ResendPayload {
  email?: string;
}

export async function POST(request: Request) {
  try {
    const ip = getClientAddress(request);
    const ipRate = consumeRateLimit(`verify-resend:ip:${ip}`, RESEND_LIMIT_PER_IP, RESEND_WINDOW_MS);
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: "Too many verification resend attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSec) } },
      );
    }

    const payload = (await request.json()) as ResendPayload;
    const email = normalizeEmail(payload.email || "");

    if (!isLikelyEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const emailRate = consumeRateLimit(`verify-resend:email:${email}`, RESEND_LIMIT_PER_EMAIL, RESEND_WINDOW_MS);
    if (!emailRate.allowed) {
      return NextResponse.json(
        { error: "Too many verification requests for this account. Please try again later." },
        { status: 429, headers: { "Retry-After": String(emailRate.retryAfterSec) } },
      );
    }

    if (!isEmailDeliveryConfigured()) {
      return NextResponse.json({ error: "Email verification is not configured yet. Please contact support." }, { status: 503 });
    }

    const user = findAuthUserByEmail(email);

    if (!user) {
      return NextResponse.json({ ok: true, message: "If an account exists, a verification email was sent." });
    }

    if (user.emailVerifiedAt) {
      return NextResponse.json({ ok: true, message: "If an account exists, a verification email was sent." });
    }

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
      console.error("Verification resend email failed", error);
      return NextResponse.json({ error: "Could not send verification email. Please try again in a minute." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, message: "Verification email sent. Check your inbox." });
  } catch {
    return NextResponse.json({ error: "Failed to resend verification email." }, { status: 500 });
  }
}
