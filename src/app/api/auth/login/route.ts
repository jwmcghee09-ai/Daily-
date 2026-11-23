import { NextResponse } from "next/server";
import {
  consumeTotpChallenge,
  createTotpChallenge,
  findAuthUserByEmail,
  findAuthUserById,
  getTotpRecord,
  isUserTotpEnabled,
  readUserEntitlements,
  saveRecoveryCodes,
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
import { decryptSecret, hashRecoveryCode, verifyTotpCode } from "@/lib/totp";

export const runtime = "nodejs";

const LOGIN_LIMIT_PER_IP = 20;
const LOGIN_LIMIT_PER_EMAIL = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

interface LoginPayload {
  email?: string;
  password?: string;
  challengeToken?: string;
  totpCode?: string;
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

    /* ---------------------------------------------------------------- */
    /*  TOTP challenge verification flow                                 */
    /*  Reached only after a correct password issued a challenge token.  */
    /* ---------------------------------------------------------------- */
    if (payload.challengeToken && payload.totpCode) {
      const challengeToken = payload.challengeToken.trim();
      const totpCode = payload.totpCode.trim();

      if (!challengeToken || !totpCode) {
        return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
      }

      const challenge = consumeTotpChallenge(challengeToken);
      if (!challenge) {
        return NextResponse.json({ error: "Verification expired. Please sign in again." }, { status: 401 });
      }

      const totpRecord = getTotpRecord(challenge.userId);
      if (!totpRecord || !totpRecord.enabled) {
        return NextResponse.json({ error: "Two-factor authentication is not enabled." }, { status: 400 });
      }

      const secret = decryptSecret(totpRecord.encryptedSecret);
      let valid = verifyTotpCode(secret, totpCode);

      // If the authenticator code doesn't match, accept a one-time recovery code.
      if (!valid && totpRecord.recoveryCodes) {
        const hashedInput = hashRecoveryCode(totpCode);
        const storedHashes: string[] = JSON.parse(totpRecord.recoveryCodes);
        const matchIndex = storedHashes.indexOf(hashedInput);
        if (matchIndex !== -1) {
          valid = true;
          storedHashes.splice(matchIndex, 1);
          saveRecoveryCodes(challenge.userId, JSON.stringify(storedHashes));
        }
      }

      if (!valid) {
        return NextResponse.json({ error: "Invalid verification code." }, { status: 401 });
      }

      const userById = findAuthUserById(challenge.userId);
      if (!userById) {
        return NextResponse.json({ error: "User not found." }, { status: 401 });
      }

      return buildAuthenticatedResponse(userById.id, userById.email, userById.displayName);
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

    // Password is correct. If 2FA is on, issue a short-lived challenge instead
    // of a session; the client then posts the challenge token + a TOTP code.
    if (isUserTotpEnabled(user.id)) {
      const challengeToken = createTotpChallenge(user.id);
      return NextResponse.json({ totpRequired: true, challengeToken });
    }

    return buildAuthenticatedResponse(user.id, user.email, user.displayName);
  } catch {
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
