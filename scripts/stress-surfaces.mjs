// Adversarial pass over the surfaces with the least production exposure.
//
// stress-all.mjs covers the long-standing endpoints. This one goes at what was
// built most recently and has therefore been run the fewest times: the OAuth
// authorization server, the MCP transport, the demo workspace, and the
// classifier's shared cache. It is written to find faults rather than to
// confirm the happy path, so most of what it asserts is a refusal.
//
//   node scripts/stress-surfaces.mjs http://localhost:PORT
import crypto from "node:crypto";

const base = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");

let failures = 0;
const findings = [];
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) { failures++; findings.push(label); }
};
const section = (name) => console.log(`\n── ${name} ${"─".repeat(Math.max(0, 58 - name.length))}`);

const json = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 160) }; } };
const ip = () => `198.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

// ── An account and an authorised client, to attack with ────────────────────
const email = `stress-${Date.now()}@example.com`;
const reg = await fetch(`${base}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() },
  body: JSON.stringify({ email, password: "CiTestPass123!", displayName: "S", acceptsTerms: true }),
});
const cookie = "spectre_session=" + (/spectre_session=([^;]+)/.exec(reg.headers.get("set-cookie") || "")?.[1] ?? "");

const REDIRECT = "http://localhost:51999/cb";
const client = await json(await fetch(`${base}/api/oauth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() },
  body: JSON.stringify({ client_name: "Stress", redirect_uris: [REDIRECT] }),
}));

async function freshToken() {
  const verifier = crypto.randomBytes(40).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const u = new URL(`${base}/api/oauth/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT,
    code_challenge: challenge, code_challenge_method: "S256", resource: `${base}/api/mcp`,
  })) u.searchParams.set(k, v);
  const appr = await fetch(`${u}&approve=1`, { method: "POST", headers: { Cookie: cookie }, redirect: "manual" });
  const code = new URL(appr.headers.get("location"), base).searchParams.get("code");
  return json(await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": ip() },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT,
      client_id: client.client_id, code_verifier: verifier,
    }),
  }));
}

// ── OAuth under pressure ───────────────────────────────────────────────────
section("OAuth");
{
  const tokens = await freshToken();
  check("a token can be obtained at all", Boolean(tokens.access_token), JSON.stringify(tokens).slice(0, 70));

  /*
   * Two refreshes racing on one token.
   *
   * Rotation reads the row, deletes it, then issues a new pair. Those are three
   * steps, and if two requests interleave between the read and the delete both
   * can succeed — which is precisely the situation rotation exists to make
   * visible, so a stolen token would stop being detectable.
   */
  const body = () => new URLSearchParams({
    grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client.client_id,
  });
  const raced = await Promise.all([0, 1, 2, 3].map(() => fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": ip() },
    body: body(),
  })));
  const ok = raced.filter((r) => r.status === 200).length;
  check("one refresh token yields exactly one new pair, even raced", ok === 1, `${ok} of 4 succeeded`);
}

{
  // A code minted for one client must not be spendable by another.
  const other = await json(await fetch(`${base}/api/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() },
    body: JSON.stringify({ client_name: "Other", redirect_uris: ["http://localhost:51998/cb"] }),
  }));
  const verifier = crypto.randomBytes(40).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const u = new URL(`${base}/api/oauth/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT,
    code_challenge: challenge, code_challenge_method: "S256",
  })) u.searchParams.set(k, v);
  const appr = await fetch(`${u}&approve=1`, { method: "POST", headers: { Cookie: cookie }, redirect: "manual" });
  const code = new URL(appr.headers.get("location"), base).searchParams.get("code");

  const stolen = await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": ip() },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: "http://localhost:51998/cb",
      client_id: other.client_id, code_verifier: verifier,
    }),
  });
  check("another client cannot redeem this client's code", stolen.status === 400, `HTTP ${stolen.status}`);
}

{
  // A redirect that only looks like the registered one.
  const sneaky = [
    `${REDIRECT}/../evil`,
    `${REDIRECT}?x=1`,
    `${REDIRECT}#frag`,
    "http://localhost:51999@evil.example.com/cb",
    `${REDIRECT.toUpperCase()}`,
  ];
  let refused = 0;
  for (const uri of sneaky) {
    const u = new URL(`${base}/api/oauth/authorize`);
    for (const [k, v] of Object.entries({
      response_type: "code", client_id: client.client_id, redirect_uri: uri,
      code_challenge: "a".repeat(43), code_challenge_method: "S256",
    })) u.searchParams.set(k, v);
    const r = await fetch(u, { headers: { Cookie: cookie }, redirect: "manual" });
    const loc = r.headers.get("location") || "";
    if (r.status === 400 && !loc) refused += 1;
  }
  check("near-miss redirect URIs are all refused", refused === sneaky.length, `${refused}/${sneaky.length}`);

  const noAuth = await fetch(`${base}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": ip() },
    body: new URLSearchParams({ grant_type: "authorization_code" }),
  });
  // RFC 6749 §5.2 lets a server answer an unidentifiable client with 401, and
  // that is what no client_id is. Either is fine; a 500 is not.
  check("a token request with nothing in it is a clean refusal",
    noAuth.status === 400 || noAuth.status === 401, `HTTP ${noAuth.status}`);
}

// ── MCP transport ──────────────────────────────────────────────────────────
section("MCP");
const mcpTokens = await freshToken();
const rpc = (body, headers = {}, raw = false) => fetch(`${base}/api/mcp`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${mcpTokens.access_token}`,
    ...headers,
  },
  body: raw ? body : JSON.stringify(body),
});

{
  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const sid = init.headers.get("mcp-session-id");
  check("initialize still works", init.status === 200 && Boolean(sid));

  // A JSON-RPC batch is an array. The transport takes a single message, so this
  // must be refused cleanly rather than crashing on message.method.
  const batch = await rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  check("a batch array is rejected without a 500", batch.status < 500, `HTTP ${batch.status}`);

  // Bodies are unbounded unless something bounds them.
  const huge = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "x", arguments: { pad: "A".repeat(6 * 1024 * 1024) } } });
  let big;
  try {
    big = await rpc(huge, {}, true);
  } catch {
    big = { status: 0 };
  }
  // Parsing it is the problem, not crashing on it: an unbounded body is memory
  // the server allocates on a stranger's say-so.
  check("a six-megabyte body is refused rather than parsed",
    big.status === 413, `HTTP ${big.status}`);

  const deep = { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_portfolio", arguments: {} } };
  let node = deep.params.arguments;
  for (let i = 0; i < 2000; i += 1) { node.n = {}; node = node.n; }
  const nested = await rpc(deep, { "Mcp-Session-Id": sid });
  check("deeply nested arguments do not 500", nested.status < 500, `HTTP ${nested.status}`);

  const badVersion = await rpc({ jsonrpc: "2.0", id: 4, method: "ping" }, { "MCP-Protocol-Version": "1999-01-01" });
  check("an unsupported protocol version is a 400", badVersion.status === 400, `HTTP ${badVersion.status}`);

  const notJson = await rpc("not json at all", {}, true);
  check("a non-JSON body is a parse error, not a crash", notJson.status === 400, `HTTP ${notJson.status}`);
}

{
  /*
   * Another account's session id.
   *
   * The map holds a userId, and the POST handler only checks the session
   * exists. The tools read the bearer's identity rather than the session's, so
   * this should not leak — but if it ever did, it would leak a whole portfolio.
   */
  const otherEmail = `stress2-${Date.now()}@example.com`;
  const r2 = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip() },
    body: JSON.stringify({ email: otherEmail, password: "CiTestPass123!", displayName: "S2", acceptsTerms: true }),
  });
  const cookie2 = "spectre_session=" + (/spectre_session=([^;]+)/.exec(r2.headers.get("set-cookie") || "")?.[1] ?? "");
  await fetch(`${base}/api/import/csv`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie2 },
    body: JSON.stringify({ source: "asx", fileName: "v.csv", csvText: "Code,Name,Units,Price,Value\nZZZSECRET,Secret Co,1,1,99999" }),
  });

  const init = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const mySid = init.headers.get("mcp-session-id");
  const call = await json(await rpc(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_portfolio", arguments: {} } },
    { "Mcp-Session-Id": mySid },
  ));
  const text = call.result?.content?.[0]?.text ?? "";
  check("a tool call never returns another account's holdings",
    !text.includes("ZZZSECRET"), text.includes("ZZZSECRET") ? "LEAKED" : "");
}

// ── Demo workspace ─────────────────────────────────────────────────────────
section("Demo");
{
  const spamIp = ip();
  let created = 0;
  for (let i = 0; i < 30; i += 1) {
    const r = await json(await fetch(`${base}/api/portfolio?demo=1`, { headers: { "X-Forwarded-For": spamIp } }));
    if (r.demoGuest) created += 1;
  }
  check("cookieless demo starts are capped per address", created <= 8, `${created} workspaces from 30 requests`);

  const r = await fetch(`${base}/api/portfolio?demo=1`, { headers: { "X-Forwarded-For": ip() } });
  const payload = await json(r);
  check("a first-time visitor still gets a seeded workspace",
    Array.isArray(payload.holdings) && payload.holdings.length > 0,
    `${payload.holdings?.length ?? 0} holdings`);
  check("and it contains a fund that resolves without an upload",
    (payload.holdings ?? []).some((h) => h.ticker === "IVV"));
}

// ── Classifier cache ───────────────────────────────────────────────────────
section("Classifier");
{
  // The kind cache is shared by ticker. A source that settles the matter must
  // beat it, or one account's BTC decides every other account's.
  const r = await json(await fetch(`${base}/api/portfolio?demo=1`, { headers: { "X-Forwarded-For": ip() } }));
  if (!r.demoGuest) {
    check("demo available for the classifier probe", false, "throttled");
  } else {
    const funds = await json(await fetch(`${base}/api/portfolio/funds?demo=1`, {
      headers: { Cookie: `spectre_demo_guest=${r.demoGuest.userId}` },
    }));
    const byTicker = Object.fromEntries((funds.unresolved ?? []).map((u) => [u.ticker, u.kind]));
    check("a crypto line is crypto, not a same-named listed trust",
      byTicker.BTC === "crypto", `BTC => ${byTicker.BTC}`);
    check("cash is an asset, not a fund awaiting a file",
      byTicker.SAVINGSCASH === "asset", `SAVINGSCASH => ${byTicker.SAVINGSCASH}`);
    check("a listed company is a company", byTicker.CBA === "company", `CBA => ${byTicker.CBA}`);
  }
}

console.log(
  failures === 0
    ? "\nAll surface-stress checks passed"
    : `\n${failures} finding(s):\n  - ${findings.join("\n  - ")}`,
);
process.exit(failures === 0 ? 0 : 1);
