/**
 * OAuth 2.1, so an AI can reach a SPECTRE account with a URL.
 *
 * Connecting an assistant to SPECTRE used to mean downloading a zip, unzipping
 * it, opening a terminal and running a setup command — four steps and a shell,
 * which is most of the reason nobody did it. A remote MCP server is a URL
 * pasted into a settings box and a sign-in. That only works if something here
 * can issue tokens, and if the client can register itself: Claude has no way to
 * know about SPECTRE in advance, and a person should not have to broker that by
 * hand. Hence dynamic client registration (RFC 7591).
 *
 * This is a small authorization server, not a general one. It issues tokens for
 * one resource — this site's MCP endpoint — on top of the accounts that already
 * exist. Authorising is a signed-in user pressing a button; there is no second
 * identity system, no password here, no new place a credential can leak from.
 *
 * What it implements, and why each piece is not optional:
 *
 *   PKCE S256, required           an authorization code stolen in transit is
 *                                 useless without the verifier
 *   exact redirect URI matching   prefix matching is how open redirects happen
 *   audience-bound tokens         a token minted for this resource must not
 *                                 work anywhere else, and this server must
 *                                 refuse anything minted elsewhere (RFC 8707)
 *   hashed at rest                a leaked database should not hand over
 *                                 working credentials
 *   rotating refresh tokens       public clients cannot keep a secret, so a
 *                                 stolen refresh token has to stop working the
 *                                 moment the real one is used
 */
import crypto from "node:crypto";
import {
  consumeOAuthCode,
  readOAuthClient,
  readOAuthToken,
  revokeOAuthToken,
  writeOAuthClient,
  writeOAuthCode,
  writeOAuthToken,
} from "@/lib/db";

/** The one scope there is. Read-only: nothing here can change a portfolio. */
export const MCP_SCOPE = "spectre:read";

/** Short, because a leaked access token should stop working quickly. */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Long enough to sign in and press approve, short enough to be useless later. */
export const AUTH_CODE_TTL_MS = 10 * 60 * 1000;

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Stored hashed, so the database never holds a usable credential. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Where this server lives, from the request it is answering.
 *
 * Taken from the forwarded headers rather than configured, because the issuer
 * in the metadata, the audience in the token and the URL the user actually
 * typed must all agree — and a hardcoded base URL disagrees with every
 * preview deployment and local run.
 */
export function originOf(request: Request): string {
  const configured = String(process.env.APP_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;

  const headers = request.headers;
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";
  const proto = headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

/** The canonical identifier of the protected resource — RFC 8707 §2. */
export function resourceIdentifier(request: Request): string {
  return `${originOf(request)}/api/mcp`;
}

// ── Clients ─────────────────────────────────────────────────────────────────

export interface RegisteredClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  /** Empty for a public client, which is what an MCP client normally is. */
  clientSecretHash: string;
}

/**
 * A redirect URI we are willing to send a user back to.
 *
 * HTTPS anywhere, or plain HTTP only on loopback — a desktop client listening
 * on 127.0.0.1 is the normal case and cannot have a certificate. A fragment
 * would let a crafted URI smuggle state past the exact-match check.
 */
export function isAcceptableRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

export interface RegistrationRequest {
  client_name?: unknown;
  redirect_uris?: unknown;
  token_endpoint_auth_method?: unknown;
}

export interface RegistrationResult {
  clientId: string;
  clientSecret: string | null;
  clientName: string;
  redirectUris: string[];
}

/**
 * Register a client, RFC 7591 style.
 *
 * Open registration, which is what the MCP spec asks for and is safe here
 * because registering grants nothing: a client id is worthless until a real
 * person signs in and approves it, and the redirect URIs are checked at that
 * point and again at the token endpoint.
 */
export function registerClient(body: RegistrationRequest): RegistrationResult | { error: string } {
  const uris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.map((u) => String(u ?? "").trim()).filter(Boolean)
    : [];
  if (uris.length === 0) return { error: "redirect_uris is required" };
  if (uris.length > 10) return { error: "too many redirect_uris" };

  const bad = uris.find((u) => !isAcceptableRedirectUri(u));
  if (bad) {
    return { error: `redirect_uri must be https, or http on loopback: ${bad.slice(0, 120)}` };
  }

  const confidential = String(body.token_endpoint_auth_method ?? "none") !== "none";
  const clientId = `spectre_${randomToken(18)}`;
  const clientSecret = confidential ? randomToken(32) : null;

  writeOAuthClient({
    clientId,
    clientSecretHash: clientSecret ? hashToken(clientSecret) : "",
    clientName: String(body.client_name ?? "").slice(0, 120) || "Unnamed MCP client",
    redirectUris: JSON.stringify(uris),
  });

  return {
    clientId,
    clientSecret,
    clientName: String(body.client_name ?? "").slice(0, 120) || "Unnamed MCP client",
    redirectUris: uris,
  };
}

export function loadClient(clientId: string): RegisteredClient | null {
  const row = readOAuthClient(clientId);
  if (!row) return null;
  let redirectUris: string[] = [];
  try {
    const parsed = JSON.parse(row.redirectUris);
    if (Array.isArray(parsed)) redirectUris = parsed.map((u) => String(u));
  } catch {
    redirectUris = [];
  }
  return {
    clientId: row.clientId,
    clientName: row.clientName,
    redirectUris,
    clientSecretHash: row.clientSecretHash,
  };
}

// ── Authorization codes ─────────────────────────────────────────────────────

export interface IssueCodeInput {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}

export function issueAuthorizationCode(input: IssueCodeInput): string {
  const code = randomToken(32);
  writeOAuthCode({
    codeHash: hashToken(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    resource: input.resource,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString(),
  });
  return code;
}

/** PKCE S256: base64url(SHA-256(verifier)) must equal the stored challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  // Length bounds are from RFC 7636; a short verifier is not a secret.
  if (verifier.length < 43 || verifier.length > 128) return false;
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── Tokens ──────────────────────────────────────────────────────────────────

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export function issueTokens(input: {
  clientId: string;
  userId: string;
  scope: string;
  audience: string;
}): IssuedTokens {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  const now = Date.now();

  writeOAuthToken({
    tokenHash: hashToken(accessToken),
    kind: "access",
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    audience: input.audience,
    expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
  });
  writeOAuthToken({
    tokenHash: hashToken(refreshToken),
    kind: "refresh",
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    audience: input.audience,
    expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: input.scope,
  };
}

export interface BearerIdentity {
  userId: string;
  clientId: string;
  scope: string;
}

/**
 * Who a bearer token belongs to, or null.
 *
 * The audience check is the part that matters. A token this server issued for
 * its own MCP endpoint is the only thing it will accept: one minted elsewhere,
 * or for a different resource, is refused however valid it looks. Without that
 * an attacker can present a token obtained legitimately from some other service
 * and have it honoured here.
 */
export function identifyBearer(token: string, expectedAudience: string): BearerIdentity | null {
  if (!token) return null;
  const row = readOAuthToken(hashToken(token), "access");
  if (!row) return null;
  if (row.audience !== expectedAudience) return null;
  return { userId: row.userId, clientId: row.clientId, scope: row.scope };
}

/**
 * Exchange a refresh token for a new pair, retiring the old one.
 *
 * Rotation, because an MCP client is a public client and cannot keep a secret.
 * If a refresh token leaks, the first use wins and the second fails, so the
 * theft surfaces instead of persisting silently.
 */
export function rotateRefreshToken(
  refreshToken: string,
  clientId: string,
): IssuedTokens | null {
  const row = readOAuthToken(hashToken(refreshToken), "refresh");
  if (!row || row.clientId !== clientId) return null;

  revokeOAuthToken(hashToken(refreshToken));
  return issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
    audience: row.audience,
  });
}

export { consumeOAuthCode };
