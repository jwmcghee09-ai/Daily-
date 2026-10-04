/**
 * The assistants a person has connected, and how to disconnect one.
 *
 * The consent screen promises this exists, so it has to. Revoking deletes every
 * token that grant issued — access and refresh alike — which takes effect on
 * the next call rather than whenever something expires.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { listOAuthGrants, revokeOAuthGrant } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  return NextResponse.json({ connections: listOAuthGrants(user.id) });
}

/**
 * Posted by a form on the setup page, so it is a same-origin submission
 * carrying the session cookie rather than a link anyone could be led to follow.
 */
export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const form = new URLSearchParams(await request.text());
  const clientId = String(form.get("client_id") ?? "").trim();
  if (!clientId) return NextResponse.json({ error: "Which connection?" }, { status: 400 });

  const removed = revokeOAuthGrant(user.id, clientId);

  // A form post wants the page back, not JSON.
  const back = new URL("/mcp-setup", new URL(request.url).origin);
  back.searchParams.set("revoked", removed > 0 ? "1" : "0");
  return NextResponse.redirect(back.toString(), 303);
}
