/**
 * Authorization server metadata — RFC 8414.
 *
 * Tells a client where to register, where to send the user, and where to
 * exchange the code. Everything advertised here is implemented; nothing is
 * listed that is not, because a client will believe it.
 *
 * S256 is the only challenge method offered. "plain" is in the PKCE spec and is
 * no protection at all — the verifier travels as the challenge — so offering it
 * would let a client negotiate the security away.
 */
import { NextResponse } from "next/server";
import { MCP_SCOPE, originOf } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = originOf(request);
  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      registration_endpoint: `${origin}/api/oauth/register`,
      scopes_supported: [MCP_SCOPE],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      service_documentation: `${origin}/mcp-setup`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
