/**
 * The authorization endpoint.
 *
 * Where a person decides. A client sends the user's browser here; if they are
 * not signed in they go to the sign-in page and come back; then they see what
 * is being asked for and press a button. Approving mints a single-use code the
 * client exchanges for a token.
 *
 * The rules that keep this safe are all about the redirect:
 *
 *   - the redirect URI must match one registered for that client exactly.
 *     Prefix matching is how open redirects happen, and an open redirect on an
 *     authorization endpoint hands an attacker the code.
 *   - an error is only redirected back to a URI that already passed that check.
 *     Anything wrong with the client or the redirect itself is shown here, in
 *     the user's own browser, rather than bounced to a URL we do not trust.
 *   - PKCE S256 is required, not negotiated.
 */
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  MCP_SCOPE,
  issueAuthorizationCode,
  loadClient,
  resourceIdentifier,
} from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Shown in the user's browser when the request itself cannot be trusted. */
function problem(title: string, detail: string, status = 400): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — SPECTRE</title>
<style>
 body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#fafaf9;color:#16161a;
      margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
 main{max-width:460px;background:#fff;border:1px solid rgba(0,0,0,.09);border-radius:14px;padding:28px 30px;
      box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 30px rgba(0,0,0,.05)}
 h1{font-size:1.15rem;margin:0 0 10px}
 p{line-height:1.65;color:#4b4b55;margin:0}
 code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.86em;background:rgba(0,0,0,.05);
      padding:1px 5px;border-radius:5px}
</style></head><body><main>
<h1>${escapeHtml(title)}</h1><p>${detail}</p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/** An OAuth error the client is entitled to see, sent to its own redirect URI. */
function redirectError(redirectUri: string, state: string, code: string, description: string): NextResponse {
  const url = new URL(redirectUri);
  url.searchParams.set("error", code);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString(), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams;

  const clientId = String(q.get("client_id") ?? "").trim();
  const redirectUri = String(q.get("redirect_uri") ?? "").trim();
  const state = String(q.get("state") ?? "");
  const responseType = String(q.get("response_type") ?? "");
  const challenge = String(q.get("code_challenge") ?? "").trim();
  const challengeMethod = String(q.get("code_challenge_method") ?? "").trim();
  const resource = String(q.get("resource") ?? "").trim();

  const client = clientId ? loadClient(clientId) : null;
  if (!client) {
    return problem(
      "Unknown application",
      "The application that sent you here is not registered with SPECTRE. "
      + "Nothing has been shared. Close this tab and try connecting again.",
    );
  }

  // Exact match, against the list registered for this client.
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return problem(
      "Redirect address does not match",
      "The address this application asked to be returned to is not one it registered. "
      + "SPECTRE will not send an authorization code anywhere unregistered, so the request stops here.",
    );
  }

  // From here the redirect URI is trusted, so protocol errors go back to it —
  // the client can read and report them, which a browser page cannot.
  if (responseType !== "code") {
    return redirectError(redirectUri, state, "unsupported_response_type",
      "Only the authorization code flow is supported.");
  }
  if (challengeMethod !== "S256") {
    return redirectError(redirectUri, state, "invalid_request",
      "code_challenge_method must be S256. Plain PKCE offers no protection and is not accepted.");
  }
  if (challenge.length < 43 || challenge.length > 128) {
    return redirectError(redirectUri, state, "invalid_request", "A valid code_challenge is required.");
  }

  /*
   * The resource the token will be for.
   *
   * A client is required to send it and some still do not, so a missing one
   * defaults to this server's own MCP endpoint rather than failing the
   * connection. A resource naming something else is refused outright: issuing a
   * token for an audience we do not control is how a confused deputy starts.
   */
  const expected = resourceIdentifier(request);
  if (resource && resource.replace(/\/+$/, "") !== expected.replace(/\/+$/, "")) {
    return redirectError(redirectUri, state, "invalid_target",
      `This server only issues tokens for ${expected}.`);
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    // Sign in, then come straight back to this exact request.
    const signIn = new URL("/signin", url.origin);
    signIn.searchParams.set("next", `${url.pathname}${url.search}`);
    return NextResponse.redirect(signIn.toString(), 302);
  }

  const approve = new URL(url.toString());
  approve.searchParams.set("approve", "1");

  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to SPECTRE</title>
<style>
 body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#fafaf9;color:#16161a;
      margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
 main{max-width:470px;width:100%;background:#fff;border:1px solid rgba(0,0,0,.09);border-radius:14px;
      padding:30px 32px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 30px rgba(0,0,0,.05)}
 .mark{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.62rem;letter-spacing:.22em;
       text-transform:uppercase;color:#e03a16;margin:0 0 16px}
 h1{font-size:1.3rem;line-height:1.3;margin:0 0 14px;letter-spacing:-.01em}
 p{line-height:1.7;color:#4b4b55;margin:0 0 14px;font-size:.93rem}
 ul{margin:0 0 20px;padding-left:20px;color:#4b4b55;line-height:1.8;font-size:.93rem}
 .who{font-weight:600;color:#16161a}
 .row{display:flex;gap:10px;margin-top:22px}
 button,a.cancel{font:inherit;font-size:.93rem;font-weight:600;border-radius:9px;padding:11px 20px;
                 cursor:pointer;border:1px solid transparent;text-decoration:none;display:inline-block}
 button{background:linear-gradient(90deg,#ee2d1b,#f55314);color:#fff;flex:1}
 a.cancel{background:#fff;border-color:rgba(0,0,0,.14);color:#16161a}
 .foot{font-size:.78rem;color:#76767f;line-height:1.6;margin:18px 0 0}
</style></head><body><main>
<p class="mark">SPECTRE</p>
<h1>Connect <span class="who">${escapeHtml(client.clientName)}</span> to your portfolio?</h1>
<p>Signed in as <span class="who">${escapeHtml(user.email)}</span>.</p>
<p>It will be able to read:</p>
<ul>
  <li>Your holdings, their values and your account history</li>
  <li>SPECTRE's risk analysis of them — concentration, volatility, VaR, look-through</li>
  <li>Market research and Myrmidon's paper-trading activity</li>
</ul>
<p>It <strong>cannot</strong> change your portfolio, place trades, or alter your account. You can
disconnect it at any time from the <a href="/mcp-setup" style="color:#c7300f">connection page</a>.</p>
<form method="POST" action="${escapeHtml(approve.pathname + approve.search)}">
  <div class="row">
    <button type="submit">Allow access</button>
    <a class="cancel" href="${escapeHtml(redirectUri)}?error=access_denied${state ? `&state=${encodeURIComponent(state)}` : ""}">Cancel</a>
  </div>
</form>
<p class="foot">Approving sends a one-time code to ${escapeHtml(new URL(redirectUri).origin)}. Your password is never shared.</p>
</main></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/**
 * Approval. Posted by the consent form above, so it carries the session cookie
 * and a same-origin form post rather than a link anyone could be tricked into
 * following.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams;
  if (q.get("approve") !== "1") {
    return problem("Bad request", "This endpoint is reached through the consent screen.", 400);
  }

  const clientId = String(q.get("client_id") ?? "").trim();
  const redirectUri = String(q.get("redirect_uri") ?? "").trim();
  const state = String(q.get("state") ?? "");
  const challenge = String(q.get("code_challenge") ?? "").trim();

  const client = clientId ? loadClient(clientId) : null;
  if (!client || !redirectUri || !client.redirectUris.includes(redirectUri)) {
    return problem("Redirect address does not match",
      "This request no longer matches a registered application. Nothing has been shared.");
  }
  if (String(q.get("code_challenge_method") ?? "") !== "S256" || challenge.length < 43) {
    return redirectError(redirectUri, state, "invalid_request", "A valid S256 code_challenge is required.");
  }

  const user = await getAuthenticatedUser();
  if (!user) {
    const signIn = new URL("/signin", url.origin);
    signIn.searchParams.set("next", `/api/oauth/authorize${url.search.replace(/&?approve=1/, "")}`);
    return NextResponse.redirect(signIn.toString(), 302);
  }

  const code = issueAuthorizationCode({
    clientId: client.clientId,
    userId: user.id,
    redirectUri,
    codeChallenge: challenge,
    scope: MCP_SCOPE,
    resource: resourceIdentifier(request),
  });

  const back = new URL(redirectUri);
  back.searchParams.set("code", code);
  if (state) back.searchParams.set("state", state);
  return NextResponse.redirect(back.toString(), 302);
}
