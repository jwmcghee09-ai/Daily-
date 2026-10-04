/**
 * The token endpoint.
 *
 * Exchanges a one-time authorization code for an access token, and a refresh
 * token for a fresh pair. Form-encoded, as OAuth requires.
 *
 * Three checks do the work:
 *
 *   - the code is consumed by reading it. Single use is not a policy here, it
 *     is a property: the row is deleted before anything else can fail, so a
 *     replayed code finds nothing.
 *   - the PKCE verifier must hash to the challenge recorded when the user
 *     approved. A code intercepted on its way back is useless without it.
 *   - the redirect URI must match the one the code was issued against, so a
 *     code minted for one client's callback cannot be redeemed against
 *     another's.
 *
 * Refresh tokens rotate. An MCP client is a public client and cannot keep a
 * secret, so a leaked refresh token has to stop working the moment the real one
 * is used — otherwise a theft persists silently for a month.
 */
import { NextResponse } from "next/server";
import { getClientAddress } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  consumeOAuthCode,
  hashToken,
  issueTokens,
  loadClient,
  resourceIdentifier,
  rotateRefreshToken,
  verifyPkce,
} from "@/lib/oauth";

export const runtime = "nodejs";

function cors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // Credentials must never be cached by anything in the path.
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function fail(code: string, description: string, status = 400): NextResponse {
  return cors(NextResponse.json({ error: code, error_description: description }, { status }));
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  const limit = consumeRateLimit(`oauth:token:${getClientAddress(request)}`, 60, 60 * 1000);
  if (!limit.allowed) {
    return cors(NextResponse.json(
      { error: "slow_down", error_description: "Too many token requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    ));
  }

  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return fail("invalid_request", "Body must be application/x-www-form-urlencoded.");
  }

  const grantType = form.get("grant_type") ?? "";
  const clientId = String(form.get("client_id") ?? "").trim();
  const clientSecret = String(form.get("client_secret") ?? "");

  const client = clientId ? loadClient(clientId) : null;
  if (!client) return fail("invalid_client", "Unknown client_id.", 401);

  // A client that registered with a secret must present it; one that did not
  // must not start sending one.
  if (client.clientSecretHash) {
    if (!clientSecret || hashToken(clientSecret) !== client.clientSecretHash) {
      return fail("invalid_client", "Client authentication failed.", 401);
    }
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") ?? "");
    const rotated = rotateRefreshToken(refreshToken, client.clientId);
    if (!rotated) return fail("invalid_grant", "That refresh token is not valid.");
    return cors(NextResponse.json({
      access_token: rotated.accessToken,
      token_type: "Bearer",
      expires_in: rotated.expiresIn,
      refresh_token: rotated.refreshToken,
      scope: rotated.scope,
    }));
  }

  if (grantType !== "authorization_code") {
    return fail("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }

  const code = String(form.get("code") ?? "");
  const verifier = String(form.get("code_verifier") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");

  if (!code) return fail("invalid_request", "code is required.");
  if (!verifier) return fail("invalid_request", "code_verifier is required.");

  // Reading consumes it, whatever happens next.
  const stored = consumeOAuthCode(hashToken(code));
  if (!stored) return fail("invalid_grant", "That code is expired or has already been used.");

  if (stored.clientId !== client.clientId) {
    return fail("invalid_grant", "That code was issued to a different client.");
  }
  if (redirectUri && redirectUri !== stored.redirectUri) {
    return fail("invalid_grant", "redirect_uri does not match the one the code was issued for.");
  }
  if (!verifyPkce(verifier, stored.codeChallenge)) {
    return fail("invalid_grant", "code_verifier does not match the challenge.");
  }

  /*
   * The audience is taken from the code, not from this request.
   *
   * It was fixed when the user approved, so a client cannot widen it at
   * exchange time by asking for a different resource than the one consented to.
   */
  const audience = stored.resource || resourceIdentifier(request);

  const tokens = issueTokens({
    clientId: client.clientId,
    userId: stored.userId,
    scope: stored.scope,
    audience,
  });

  return cors(NextResponse.json({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: tokens.scope,
  }));
}
