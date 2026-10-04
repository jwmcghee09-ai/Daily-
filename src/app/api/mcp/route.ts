/**
 * SPECTRE as a remote MCP server.
 *
 * Connecting an assistant used to mean downloading a zip, unzipping it, opening
 * a terminal and running a setup command. This is a URL: Settings → Connectors
 * → Add custom connector, paste, sign in, done — and it works in a browser and
 * on a phone, where a local connector cannot run at all.
 *
 * Streamable HTTP, per the 2025-06-18 transport. One endpoint, POST for every
 * client message. The replies are plain JSON rather than an SSE stream: that is
 * explicitly allowed, and this server never pushes anything unprompted, so a
 * long-lived stream would be an idle connection and a thing to get wrong. GET
 * therefore answers 405, which the spec defines as "no stream here".
 *
 * Sessions exist so a client's `initialize` is remembered, but nothing
 * important hangs off them: the identity that matters is the bearer token,
 * checked on every single request. A dropped session costs a re-initialize.
 */
import { NextResponse } from "next/server";
import { identifyBearer, originOf, resourceIdentifier } from "@/lib/oauth";
import { MCP_TOOLS, runMcpTool } from "@/lib/mcp-tools";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getClientAddress } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A risk call resolves funds and prices constituents; the default would cut it.
export const maxDuration = 90;

const SERVER_INFO = { name: "spectre", version: "2.0.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL = "2025-06-18";

/*
 * Live sessions, in memory.
 *
 * Deliberately not in the database. A session here carries no authority — the
 * bearer token does — so losing the lot on a deploy costs each client one
 * re-initialize, which clients handle, and it avoids a table that grows
 * forever and has to be swept.
 */
interface McpSession { userId: string; protocol: string; createdAt: number }
const sessions = new Map<string, McpSession>();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 5000;

function pruneSessions(): void {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of sessions) if (s.createdAt < cutoff) sessions.delete(id);
  // A hard ceiling, so a client looping on initialize cannot exhaust memory.
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (const [id] of oldest.slice(0, sessions.size - MAX_SESSIONS)) sessions.delete(id);
  }
}

function cors(response: NextResponse): NextResponse {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  );
  response.headers.set("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
  return response;
}

/**
 * The 401 that starts the whole flow.
 *
 * The WWW-Authenticate header is what tells a client where to find the
 * resource metadata, and from there the authorization server. Without it the
 * client has a URL and no idea how to sign in to it, which is exactly the
 * situation this feature exists to end.
 */
function unauthorized(request: Request, detail: string): NextResponse {
  const metadata = `${originOf(request)}/.well-known/oauth-protected-resource`;
  const response = NextResponse.json(
    { error: "invalid_token", error_description: detail },
    { status: 401 },
  );
  response.headers.set(
    "WWW-Authenticate",
    `Bearer realm="SPECTRE", error="invalid_token", error_description="${detail}", resource_metadata="${metadata}"`,
  );
  return cors(response);
}

function rpcError(id: unknown, code: number, message: string, status = 200): NextResponse {
  return cors(NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status }));
}

function bearerFrom(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

/**
 * No server-initiated stream. The spec's own answer for a server that does not
 * offer one, and this does not: everything it says is a reply to a request.
 */
export async function GET(request: Request) {
  if (!identifyBearer(bearerFrom(request), resourceIdentifier(request))) {
    return unauthorized(request, "A valid access token is required.");
  }
  return cors(new NextResponse(null, { status: 405 }));
}

/** A client letting go of a session. Courtesy, not security. */
export async function DELETE(request: Request) {
  if (!identifyBearer(bearerFrom(request), resourceIdentifier(request))) {
    return unauthorized(request, "A valid access token is required.");
  }
  const id = request.headers.get("mcp-session-id");
  if (id) sessions.delete(id);
  return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  const audience = resourceIdentifier(request);
  const identity = identifyBearer(bearerFrom(request), audience);
  if (!identity) {
    return unauthorized(request, "A valid access token for this MCP server is required.");
  }

  // Authenticated, but a tool call reaches EDGAR and Yahoo, so a runaway client
  // is still capped.
  const limit = consumeRateLimit(`mcp:${identity.userId}:${getClientAddress(request)}`, 120, 60 * 1000);
  if (!limit.allowed) {
    return rpcError(null, -32000, "Too many requests. Slow down.", 429);
  }

  /*
   * An unsupported protocol version must be refused rather than guessed at.
   * Absent, it means a client that predates the header, which the spec says to
   * treat as 2025-03-26.
   */
  const declared = request.headers.get("mcp-protocol-version");
  if (declared && !SUPPORTED_PROTOCOLS.includes(declared)) {
    return cors(NextResponse.json(
      { error: "unsupported_protocol_version", supported: SUPPORTED_PROTOCOLS },
      { status: 400 },
    ));
  }

  let message: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    message = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error: body must be JSON.", 400);
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return rpcError(null, -32600, "Invalid request: expected a single JSON-RPC message.", 400);
  }

  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  if (method === "initialize") {
    pruneSessions();
    const asked = String((params as { protocolVersion?: string })?.protocolVersion ?? "");
    const protocol = SUPPORTED_PROTOCOLS.includes(asked) ? asked : DEFAULT_PROTOCOL;
    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { userId: identity.userId, protocol, createdAt: Date.now() });

    const response = cors(NextResponse.json({
      jsonrpc: "2.0",
      id: id ?? null,
      result: {
        protocolVersion: protocol,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "SPECTRE holds this user's real portfolio and its risk analysis. Prefer get_portfolio and "
          + "portfolio_risk over anything you could compute yourself — the figures are produced by "
          + "the same engine the user sees on their dashboard, so quoting them keeps your answer and "
          + "their screen in agreement. Every tool is read-only.",
      },
    }));
    response.headers.set("Mcp-Session-Id", sessionId);
    return response;
  }

  // Everything after initialize carries the session id, when one was issued.
  // A session this server no longer knows gets 404, which tells the client to
  // start a new one rather than fail.
  const sessionId = request.headers.get("mcp-session-id");
  if (sessionId && !sessions.has(sessionId)) {
    return cors(NextResponse.json(
      { error: "session_not_found", error_description: "Start a new session with initialize." },
      { status: 404 },
    ));
  }

  // A notification or a response gets 202 and no body, per the transport.
  if (isNotification) return cors(new NextResponse(null, { status: 202 }));

  switch (method) {
    case "ping":
      return cors(NextResponse.json({ jsonrpc: "2.0", id, result: {} }));

    case "tools/list":
      return cors(NextResponse.json({ jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } }));

    case "tools/call": {
      const name = String((params as { name?: string })?.name ?? "");
      const args = ((params as { arguments?: Record<string, unknown> })?.arguments ?? {}) as Record<string, unknown>;
      if (!name) return rpcError(id, -32602, "tools/call needs a tool name.");

      try {
        const result = await runMcpTool(name, args, {
          origin: originOf(request),
          userId: identity.userId,
        });
        return cors(NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] },
        }));
      } catch (error) {
        /*
         * A tool that failed is a result, not a protocol error.
         *
         * isError lets the model read what went wrong and try something else —
         * a JSON-RPC error would surface as the connection misbehaving, which
         * is both wrong and useless to it.
         */
        const detail = error instanceof Error ? error.message : String(error);
        return cors(NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: `${name} failed: ${detail}` }], isError: true },
        }));
      }
    }

    // Declared in no capability, so a conforming client will not ask — but
    // answering empty beats an error for one that does.
    case "resources/list":
      return cors(NextResponse.json({ jsonrpc: "2.0", id, result: { resources: [] } }));
    case "prompts/list":
      return cors(NextResponse.json({ jsonrpc: "2.0", id, result: { prompts: [] } }));

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
