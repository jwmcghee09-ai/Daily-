import { NextResponse } from "next/server";
import {
  consumePasswordResetRecord,
  deleteAuthSessionsByUserId,
  updateAuthUserPasswordHash,
} from "@/lib/db";
import { getClientAddress, hashPassword, hashPasswordResetToken } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RESET_SUBMIT_LIMIT_PER_IP = 10;
const RESET_SUBMIT_WINDOW_MS = 15 * 60 * 1000;

interface PasswordResetSubmitPayload {
  token?: string;
  newPassword?: string;
}

export async function POST(request: Request) {
  try {
    const ip = getClientAddress(request);
    const rate = consumeRateLimit(`pwd-reset-submit:ip:${ip}`, RESET_SUBMIT_LIMIT_PER_IP, RESET_SUBMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many reset attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
      );
    }

    const payload = (await request.json()) as PasswordResetSubmitPayload;
    const token = (payload.token || "").trim();
    const newPassword = payload.newPassword || "";

    if (token.length < 20) {
      return NextResponse.json({ error: "Invalid reset token." }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
    }

    const tokenHash = hashPasswordResetToken(token);
    const reset = consumePasswordResetRecord(tokenHash);

    if (!reset) {
      return NextResponse.json({ error: "Reset token is invalid or expired." }, { status: 400 });
    }

    const passwordHash = hashPassword(newPassword);
    updateAuthUserPasswordHash(reset.userId, passwordHash);
    deleteAuthSessionsByUserId(reset.userId);

    return NextResponse.json({ ok: true, message: "Password reset complete. Please sign in again." });
  } catch {
    return NextResponse.json({ error: "Failed to reset password." }, { status: 500 });
  }
}
