import { NextResponse } from "next/server";
import { consumeEmailVerificationRecord } from "@/lib/db";
import { getClientAddress, hashEmailVerificationToken } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const VERIFY_LIMIT_PER_IP = 30;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

interface VerifyPayload {
  token?: string;
}

export async function GET(request: Request) {
  const ip = getClientAddress(request);
  const rate = consumeRateLimit(`verify-email:ip:${ip}`, VERIFY_LIMIT_PER_IP, VERIFY_WINDOW_MS);
  if (!rate.allowed) {
    return NextResponse.redirect(buildRedirectUrl(request, "rate_limited"));
  }

  const url = new URL(request.url);
  const token = (url.searchParams.get("token") || "").trim();

  if (token.length < 20) {
    return NextResponse.redirect(buildRedirectUrl(request, "invalid"));
  }

  const tokenHash = hashEmailVerificationToken(token);
  const result = consumeEmailVerificationRecord(tokenHash);

  if (!result) {
    return NextResponse.redirect(buildRedirectUrl(request, "invalid"));
  }

  return NextResponse.redirect(buildRedirectUrl(request, "success"));
}

export async function POST(request: Request) {
  try {
    const ip = getClientAddress(request);
    const rate = consumeRateLimit(`verify-email:ip:${ip}`, VERIFY_LIMIT_PER_IP, VERIFY_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } },
      );
    }

    const payload = (await request.json()) as VerifyPayload;
    const token = (payload.token || "").trim();

    if (token.length < 20) {
      return NextResponse.json({ error: "Invalid verification token." }, { status: 400 });
    }

    const tokenHash = hashEmailVerificationToken(token);
    const result = consumeEmailVerificationRecord(tokenHash);

    if (!result) {
      return NextResponse.json({ error: "Verification token is invalid or expired." }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: "Email verified. You can now sign in." });
  } catch {
    return NextResponse.json({ error: "Email verification failed." }, { status: 500 });
  }
}

function buildRedirectUrl(request: Request, state: "success" | "invalid" | "rate_limited"): URL {
  const url = new URL("/", request.url);
  url.searchParams.set("verified", state);
  return url;
}
