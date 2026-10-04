/**
 * Protected resource metadata — RFC 9728.
 *
 * The first thing an MCP client reads. It reaches /api/mcp without a token,
 * gets a 401 whose WWW-Authenticate header points here, and this says which
 * authorization server can issue a token for that resource. That chain is why a
 * person can paste one URL into a settings box and be signed in a moment later
 * without anyone configuring anything.
 */
import { NextResponse } from "next/server";
import { MCP_SCOPE, originOf, resourceIdentifier } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function metadata(request: Request) {
  return NextResponse.json(
    {
      resource: resourceIdentifier(request),
      authorization_servers: [originOf(request)],
      scopes_supported: [MCP_SCOPE],
      bearer_methods_supported: ["header"],
      resource_documentation: `${originOf(request)}/mcp-setup`,
    },
    {
      headers: {
        // Discovery is public and identical for everyone, but short-lived so a
        // moved endpoint is not cached past the move.
        "Cache-Control": "public, max-age=300",
        // Clients fetch this cross-origin from a browser context.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function GET(request: Request) {
  return metadata(request);
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
