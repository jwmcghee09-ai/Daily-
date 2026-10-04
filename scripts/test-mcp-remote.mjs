// The remote MCP server, driven exactly as a client would drive it.
//
// This is the flow a person triggers by pasting a URL into a settings box:
// discover, register, authorize, exchange, then speak MCP. Every step is a
// place where getting it subtly wrong produces a connector that looks
// connected and does nothing, so each is asserted rather than assumed — and so
// are the refusals, because an authorization server that accepts a bad request
// is worse than one that accepts none.
//
// Run against a started server:  node scripts/test-mcp-remote.mjs http://localhost:3000
import crypto from "node:crypto";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

const json = async (res) => {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { __raw: text.slice(0, 200) }; }
};

// ── Discovery ──────────────────────────────────────────────────────────────
//
// A client with nothing but the URL has to find its way to a sign-in. The 401
// carries the pointer; everything else follows from it.
let resourceMetadataUrl = "";
{
  const res = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  check("an unauthenticated call is refused", res.status === 401, `HTTP ${res.status}`);

  const header = res.headers.get("www-authenticate") || "";
  const match = /resource_metadata="([^"]+)"/.exec(header);
  resourceMetadataUrl = match ? match[1] : "";
  check("and says where the resource metadata is", Boolean(resourceMetadataUrl), header.slice(0, 90));
}

{
  const res = await fetch(resourceMetadataUrl);
  const body = await json(res);
  check("resource metadata names this server as the resource",
    body.resource === `${base}/api/mcp`, String(body.resource));
  check("and names an authorization server",
    Array.isArray(body.authorization_servers) && body.authorization_servers.length > 0,
    JSON.stringify(body.authorization_servers));
}

{
  const res = await fetch(`${base}/.well-known/oauth-authorization-server`);
  const body = await json(res);
  check("authorization server metadata advertises the three endpoints",
    Boolean(body.authorization_endpoint && body.token_endpoint && body.registration_endpoint));
  check("S256 is the only PKCE method offered",
    JSON.stringify(body.code_challenge_methods_supported) === '["S256"]',
    JSON.stringify(body.code_challenge_methods_supported));
}

// ── Registration ───────────────────────────────────────────────────────────
const REDIRECT = "http://localhost:51777/callback";
let clientId = "";
{
  const res = await fetch(`${base}/api/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Test Client", redirect_uris: [REDIRECT] }),
  });
  const body = await json(res);
  clientId = body.client_id || "";
  check("a client can register itself", res.status === 201 && Boolean(clientId), `HTTP ${res.status}`);
  check("a public client gets no secret", body.client_secret === undefined);

  // A redirect we would not send a user back to must be refused at the door,
  // not later: an http:// callback on a public host is an interception point.
  const bad = await fetch(`${base}/api/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Bad", redirect_uris: ["http://evil.example.com/cb"] }),
  });
  check("a non-loopback http redirect is rejected", bad.status === 400, `HTTP ${bad.status}`);
}

// ── An account to authorize with ───────────────────────────────────────────
const email = `mcp-${Date.now()}@example.com`;
let cookie = "";
{
  const res = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "CiTestPass123!", displayName: "MCP", acceptsTerms: true }),
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const token = /spectre_session=([^;]+)/.exec(setCookie);
  cookie = token ? `spectre_session=${token[1]}` : "";
  check("a test account exists to authorize with", res.status === 200 && Boolean(cookie), `HTTP ${res.status}`);
}

// ── Authorization ──────────────────────────────────────────────────────────
const verifier = crypto.randomBytes(40).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

const authorizeUrl = (overrides = {}) => {
  const u = new URL(`${base}/api/oauth/authorize`);
  const params = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "xyz",
    resource: `${base}/api/mcp`,
    ...overrides,
  };
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  return u;
};

{
  // An unregistered redirect must never receive a code, however well-formed
  // the rest of the request is. This is the open-redirect check.
  const res = await fetch(authorizeUrl({ redirect_uri: "http://localhost:51777/stolen" }), {
    headers: { Cookie: cookie }, redirect: "manual",
  });
  check("a redirect_uri that was not registered is refused",
    res.status === 400 && !res.headers.get("location"), `HTTP ${res.status}`);

  // Plain PKCE is no protection; offering it would let a client negotiate the
  // security away.
  const plain = await fetch(authorizeUrl({ code_challenge_method: "plain" }), {
    headers: { Cookie: cookie }, redirect: "manual",
  });
  const loc = plain.headers.get("location") || "";
  check("plain PKCE is rejected", loc.includes("error=invalid_request"), loc.slice(0, 80));

  // A token for an audience this server does not control is how a confused
  // deputy starts.
  const wrongResource = await fetch(authorizeUrl({ resource: "https://somewhere-else.example/mcp" }), {
    headers: { Cookie: cookie }, redirect: "manual",
  });
  check("a resource this server does not own is refused",
    (wrongResource.headers.get("location") || "").includes("error=invalid_target"));

  const anon = await fetch(authorizeUrl(), { redirect: "manual" });
  check("an unauthenticated user is sent to sign in",
    anon.status === 302 && (anon.headers.get("location") || "").includes("/signin"),
    (anon.headers.get("location") || "").slice(0, 60));

  const consent = await fetch(authorizeUrl(), { headers: { Cookie: cookie } });
  const html = await consent.text();
  check("a signed-in user is shown a consent screen, not an automatic grant",
    consent.status === 200 && /Allow access/.test(html) && /cannot<\/strong> change/.test(html));
  check("and the screen names the account and the client",
    html.includes(email) && html.includes("Test Client"));
}

let code = "";
{
  const res = await fetch(`${authorizeUrl().toString()}&approve=1`, {
    method: "POST", headers: { Cookie: cookie }, redirect: "manual",
  });
  const loc = res.headers.get("location") || "";
  code = new URL(loc, base).searchParams.get("code") || "";
  check("approving returns a code to the registered redirect",
    res.status === 302 && loc.startsWith(REDIRECT) && Boolean(code), loc.slice(0, 70));
  check("and preserves state", new URL(loc, base).searchParams.get("state") === "xyz");
}

// ── Token exchange ─────────────────────────────────────────────────────────
const tokenForm = (overrides = {}) => new URLSearchParams({
  grant_type: "authorization_code",
  code,
  redirect_uri: REDIRECT,
  client_id: clientId,
  code_verifier: verifier,
  ...overrides,
});

let accessToken = "";
let refreshToken = "";
{
  // The wrong verifier must fail. If it does not, PKCE is decorative.
  const wrong = await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm({ code_verifier: crypto.randomBytes(40).toString("base64url") }),
  });
  check("a mismatched PKCE verifier is rejected", wrong.status === 400, `HTTP ${wrong.status}`);

  // That failed attempt consumed the code, which is the correct behaviour —
  // so the real exchange needs a fresh one, and proving the code is single-use
  // matters more than convenience here.
  const again = await fetch(`${authorizeUrl().toString()}&approve=1`, {
    method: "POST", headers: { Cookie: cookie }, redirect: "manual",
  });
  code = new URL(again.headers.get("location"), base).searchParams.get("code");

  const res = await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm(),
  });
  const body = await json(res);
  accessToken = body.access_token || "";
  refreshToken = body.refresh_token || "";
  check("the correct verifier exchanges for a token",
    res.status === 200 && Boolean(accessToken), `HTTP ${res.status}`);
  check("with a refresh token and an expiry", Boolean(refreshToken) && body.expires_in > 0);

  const replay = await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenForm(),
  });
  check("the same code cannot be used twice", replay.status === 400, `HTTP ${replay.status}`);
}

// ── MCP ────────────────────────────────────────────────────────────────────
const rpc = async (body, headers = {}) => {
  const res = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { res, body: res.status === 202 || res.status === 204 ? null : await json(res) };
};

let sessionId = "";
{
  const { res, body } = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  sessionId = res.headers.get("mcp-session-id") || "";
  check("initialize succeeds with a token", res.status === 200 && Boolean(body.result), `HTTP ${res.status}`);
  check("and issues a session id", Boolean(sessionId));
  check("negotiating the protocol version", body.result?.protocolVersion === "2025-06-18",
    String(body.result?.protocolVersion));
  check("naming the server", body.result?.serverInfo?.name === "spectre");
}

{
  const { res } = await rpc(
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { "Mcp-Session-Id": sessionId },
  );
  check("a notification is accepted with 202 and no body", res.status === 202, `HTTP ${res.status}`);
}

{
  const { body } = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "Mcp-Session-Id": sessionId });
  const tools = body.result?.tools ?? [];
  check("tools/list returns the tool set", tools.length >= 10, `${tools.length} tools`);
  check("every tool has a name, a description and a schema",
    tools.every((t) => t.name && t.description && t.inputSchema));
  check("the fund look-through is among them",
    tools.some((t) => t.name === "portfolio_funds"));
}

{
  const { body } = await rpc(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_portfolio", arguments: {} } },
    { "Mcp-Session-Id": sessionId },
  );
  const text = body.result?.content?.[0]?.text ?? "";
  check("a tool call reaches the account", Boolean(body.result), JSON.stringify(body.error ?? "").slice(0, 80));
  check("an empty portfolio is explained rather than returned bare",
    /no holdings imported yet/i.test(text), text.slice(0, 70));
}

{
  const { body } = await rpc(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "no_such_tool", arguments: {} } },
    { "Mcp-Session-Id": sessionId },
  );
  check("an unknown tool is a tool error the model can read, not a protocol error",
    body.result?.isError === true && !body.error);
}

{
  const bad = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-real-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
  });
  check("a forged token is refused", bad.status === 401, `HTTP ${bad.status}`);

  const getRes = await fetch(`${base}/api/mcp`, {
    headers: { Accept: "text/event-stream", Authorization: `Bearer ${accessToken}` },
  });
  check("GET says there is no server-initiated stream", getRes.status === 405, `HTTP ${getRes.status}`);

  const stale = await rpc({ jsonrpc: "2.0", id: 10, method: "tools/list" }, { "Mcp-Session-Id": "not-a-session" });
  check("an unknown session id asks the client to start again", stale.res.status === 404, `HTTP ${stale.res.status}`);
}

// ── Refresh ────────────────────────────────────────────────────────────────
{
  const res = await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }),
  });
  const body = await json(res);
  check("a refresh token exchanges for a new pair",
    res.status === 200 && Boolean(body.access_token) && Boolean(body.refresh_token), `HTTP ${res.status}`);

  // Rotation: the old one must die with its use, or a stolen refresh token
  // keeps working for a month beside the real one.
  const reuse = await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }),
  });
  check("and the spent refresh token stops working", reuse.status === 400, `HTTP ${reuse.status}`);
}

{
  const res = await fetch(`${base}/api/mcp`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}`, "Mcp-Session-Id": sessionId },
  });
  check("a client can end its session", res.status === 204, `HTTP ${res.status}`);
}

// ── Disconnecting ──────────────────────────────────────────────────────────
//
// The consent screen promises the user can revoke this. A revocation that left
// the access token working until it expired would make that promise false for
// up to an hour, which is exactly the window someone revoking in a hurry cares
// about.
{
  const before = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 20, method: "tools/list" }),
  });
  check("the token works before revoking", before.status === 200, `HTTP ${before.status}`);

  const revoke = await fetch(`${base}/api/oauth/connections`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId }),
    redirect: "manual",
  });
  check("disconnecting is accepted", revoke.status === 303, `HTTP ${revoke.status}`);

  const after = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 21, method: "tools/list" }),
  });
  check("and the access token stops working immediately, not at expiry",
    after.status === 401, `HTTP ${after.status}`);

  const listed = await (await fetch(`${base}/api/oauth/connections`, { headers: { Cookie: cookie } })).json();
  check("the connection is gone from the list",
    Array.isArray(listed.connections) && listed.connections.length === 0,
    JSON.stringify(listed.connections));
}

console.log(failures === 0 ? "\nAll remote-MCP checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
