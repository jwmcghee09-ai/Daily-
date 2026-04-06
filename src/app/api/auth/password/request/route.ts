import { NextResponse } from "next/server";
import { createPasswordResetRecord, findAuthUserByEmail } from "@/lib/db";
import {
  PASSWORD_RESET_TTL_MS,
  generatePasswordResetToken,
  getClientAddress,
  hashPasswordResetToken,
  isLikelyEmail,
  normalizeEmail,
  readAuthBody,
} from "@/lib/auth";
import { isEmailDeliveryConfigured, sendPasswordResetEmail } from "@/lib/mailer";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RESET_REQUEST_LIMIT_PER_IP = 10;
const RESET_REQUEST_LIMIT_PER_EMAIL = 5;
const RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;

interface PasswordResetRequestPayload {
  email?: string;
}

export async function POST(request: Request) {
  try {
    const ip = getClientAddress(request);
    const ipRate = consumeRateLimit(`pwd-reset-request:ip:${ip}`, RESET_REQUEST_LIMIT_PER_IP, RESET_REQUEST_WINDOW_MS);
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: "Too many reset requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSec) } },
      );
    }

    const rawBody = await readAuthBody(request);
    if (rawBody === null) {
      return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    }
    let payload: PasswordResetRequestPayload;
    try {
      payload = JSON.parse(rawBody) as PasswordResetRequestPayload;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const email = normalizeEmail(payload.email || "");

    if (!isLikelyEmail(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const emailRate = consumeRateLimit(`pwd-reset-request:email:${email}`, RESET_REQUEST_LIMIT_PER_EMAIL, RESET_REQUEST_WINDOW_MS);
    if (!emailRate.allowed) {
      return NextResponse.json(
        { error: "Too many reset requests for this account. Please try again later." },
        { status: 429, headers: { "Retry-After": String(emailRate.retryAfterSec) } },
      );
    }

    const emailConfigured = isEmailDeliveryConfigured();
    if (!emailConfigured) {
      return NextResponse.json(
        { error: "Password reset email is not configured yet. Please contact support." },
        { status: 503 },
      );
    }

    const user = findAuthUserByEmail(email);

    if (user) {
      const resetToken = generatePasswordResetToken();
      const resetTokenHash = hashPasswordResetToken(resetToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

      createPasswordResetRecord(user.id, resetTokenHash, expiresAt);

      try {
        await sendPasswordResetEmail({
          toEmail: user.email,
          displayName: user.displayName,
          resetToken,
        });
      } catch (error) {
        console.error("Password reset email send failed", error);
        return NextResponse.json(
          { error: "Could not send password reset email. Please try again in a minute." },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      message: "If an account exists for that email, reset instructions were sent.",
    });
  } catch {
    return NextResponse.json({ error: "Failed to start password reset." }, { status: 500 });
  }
}
