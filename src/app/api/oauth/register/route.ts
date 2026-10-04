/**
 * Dynamic client registration — RFC 7591.
 *
 * An MCP client registers itself here, unauthenticated, which looks alarming
 * and is not: a client id grants nothing. It is a name for a set of redirect
 * URIs, and nothing happens until a real person signs in and approves it. The
 * redirect URIs are checked here, again at the authorize endpoint and again at
 * the token endpoint.
 *
 * It has to be open, because the alternative is a person creating credentials
 * by hand before they can connect anything — which is the friction this whole
 * feature exists to remove.
 */
import { NextResponse } from "next/server";
import { getClientAddress } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { registerClient } from "@/lib/oauth";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;

function cors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  // Open registration writes a row per call, so it is capped per address.
  // Generous, because one client legitimately registers once per install and a
  // person setting up several assistants should not hit it.
  const limit = consumeRateLimit(`oauth:register:${getClientAddress(request)}`, 20, 60 * 60 * 1000);
  if (!limit.allowed) {
    return cors(NextResponse.json(
      { error: "too_many_requests", error_description: "Too many registrations from this address." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    ));
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return cors(NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Registration body is too large." },
      { status: 400 },
    ));
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return cors(NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON." },
      { status: 400 },
    ));
  }

  const result = registerClient((body ?? {}) as Record<string, unknown>);
  if ("error" in result) {
    return cors(NextResponse.json(
      { error: "invalid_redirect_uri", error_description: result.error },
      { status: 400 },
    ));
  }

  // 201 with the credentials, which is the only time the secret is ever
  // readable — it is stored hashed.
  return cors(NextResponse.json(
    {
      client_id: result.clientId,
      ...(result.clientSecret ? { client_secret: result.clientSecret } : {}),
      client_name: result.clientName,
      redirect_uris: result.redirectUris,
      token_endpoint_auth_method: result.clientSecret ? "client_secret_post" : "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      // No expiry: a registration that lapsed would break a working connector
      // for no benefit, since the id alone can do nothing.
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201 },
  ));
}
