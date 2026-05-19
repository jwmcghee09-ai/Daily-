import { NextResponse } from "next/server";
import {
  findAuthUserByEmail,
  readUserEntitlements,
} from "@/lib/db";
import {
  applySessionCookie,
  createAndPersistSession,
  getClientAddress,
  isLikelyEmail,
  normalizeEmail,
  readAuthBody,
  verifyPassword,
} from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const LOGIN_LIMIT_PER_IP = 20;
const LOGIN_LIMIT_PER_EMAIL = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

interface LoginPayload {
  email?: string;
  password?: string;
}

function buildAuthenticatedResponse(userId: string, email: string, displayName: string) {
  const entitlements = readUserEntitlements(userId);
  const session = createAndPersistSession(userId);

  const response = NextResponse.json({
    authenticated: true,
    user: {
      id: userId,
      email,
      displayName,
      planTier: entitlements.planTier,
      proEnabled: entitlements.proEnabled,
      subscriptionStatus: entitlements.subscriptionStatus,
    },
  });

  applySessionCookie(response, session.token, session.expiresAt);
  return response;
}

export async function POST(request: Request) {
  try {
    const ip = getClientAddress(request);
    const ipRate = consumeRateLimit(`login:ip:${ip}`, LOGIN_LIMIT_PER_IP, LOGIN_WINDOW_MS);
    if (!ipRate.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(ipRate.retryAfterSec) } },
      );
    }

    const rawBody = await readAuthBody(request);
    if (rawBody === null) {
      return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    }
    let payload: LoginPayload;
    try {
      payload = JSON.parse(rawBody) as LoginPayload;
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const email = normalizeEmail(payload.email || "");
    const password = payload.password || "";

    if (!isLikelyEmail(email) || email.length > 254 || password.length === 0 || password.length > 128) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
    }

    const emailRate = consumeRateLimit(`login:email:${email}`, LOGIN_LIMIT_PER_EMAIL, LOGIN_WINDOW_MS);
    if (!emailRate.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts for this account. Please try again later." },
        { status: 429, headers: { "Retry-After": String(emailRate.retryAfterSec) } },
      );
    }

    const user = findAuthUserByEmail(email);
    // Always run scrypt even when user doesn't exist — prevents timing-based email enumeration
    const hashToVerify = user?.passwordHash ?? "spectre_sentinel:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    if (!user || !verifyPassword(password, hashToVerify)) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    return buildAuthenticatedResponse(user.id, user.email, user.displayName);
  } catch {
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
