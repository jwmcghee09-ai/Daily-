#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split("=");
  if (key.startsWith("--")) args.set(key.slice(2), value ?? "true");
}

const base = (args.get("base") || process.env.LOAD_TEST_BASE_URL || "").trim().replace(/\/$/, "");
const profile = (args.get("profile") || "safe").trim().toLowerCase();
const enableWrites = ((args.get("writes") || process.env.LOAD_TEST_ENABLE_WRITES || "").trim().toLowerCase() === "1"
  || (args.get("writes") || process.env.LOAD_TEST_ENABLE_WRITES || "").trim().toLowerCase() === "true");
const testEmail = (args.get("email") || process.env.LOAD_TEST_TEST_EMAIL || "").trim().toLowerCase();
const testPassword = (args.get("password") || process.env.LOAD_TEST_TEST_PASSWORD || "").trim();
const testName = (args.get("name") || process.env.LOAD_TEST_TEST_NAME || "SPECTRE Load Test").trim();
const verifyToken = (args.get("verify-token") || process.env.LOAD_TEST_VERIFY_TOKEN || "").trim();
const resetToken = (args.get("reset-token") || process.env.LOAD_TEST_RESET_TOKEN || "").trim();

if (!base) {
  console.error(
    "Usage: node scripts/load-test.mjs --base=https://staging.example.com [--profile=safe|heavy|soak] [--writes=true --email=test@example.com --password=secret123]",
  );
  process.exit(1);
}

if (spawnSync("which", ["ab"], { stdio: "ignore" }).status !== 0) {
  console.error("ApacheBench (`ab`) is required for this script.");
  process.exit(1);
}

const profiles = {
  safe: [
    { label: "landing", path: "/", n: 60, c: 6 },
    { label: "signin", path: "/signin", n: 40, c: 4 },
    { label: "dashboard-demo", path: "/dashboard?demo=1", n: 50, c: 5 },
    { label: "research-demo", path: "/research?demo=1", n: 40, c: 4 },
    { label: "quotes-demo", path: "/api/research/quotes?demo=1", n: 60, c: 6 },
    { label: "fmp-demo", path: "/api/research/fmp?demo=1", n: 40, c: 4 },
  ],
  heavy: [
    { label: "landing", path: "/", n: 400, c: 25 },
    { label: "dashboard-demo", path: "/dashboard?demo=1", n: 300, c: 20 },
    { label: "research-demo", path: "/research?demo=1", n: 200, c: 12 },
    { label: "quotes-demo", path: "/api/research/quotes?demo=1", n: 200, c: 15 },
    { label: "fmp-demo", path: "/api/research/fmp?demo=1", n: 150, c: 10 },
  ],
  soak: [
    { label: "landing", path: "/", n: 1200, c: 20 },
    { label: "signin", path: "/signin", n: 600, c: 10 },
    { label: "dashboard-demo", path: "/dashboard?demo=1", n: 900, c: 16 },
    { label: "research-demo", path: "/research?demo=1", n: 600, c: 10 },
    { label: "quotes-demo", path: "/api/research/quotes?demo=1", n: 1200, c: 20 },
    { label: "fmp-demo", path: "/api/research/fmp?demo=1", n: 600, c: 10 },
    { label: "chart-btc-demo", path: "/api/research/chart?demo=1&symbol=btc&range=1m", n: 900, c: 16 },
  ],
};

const scenarios = profiles[profile];
if (!scenarios) {
  console.error(`Unknown profile: ${profile}`);
  process.exit(1);
}

function runAb(url, n, c) {
  const output = execFileSync("ab", ["-n", String(n), "-c", String(c), url], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  const parse = (regex) => {
    const match = output.match(regex);
    return match ? match[1] : "n/a";
  };

  return {
    failed: Number(parse(/Failed requests:\s+(\d+)/)),
    rps: parse(/Requests per second:\s+([\d.]+)/),
    meanMs: parse(/Time per request:\s+([\d.]+)\s+\[ms\]\s+\(mean\)/),
    p95Ms: parse(/95%\s+(\d+)/),
    maxMs: parse(/100%\s+(\d+)\s+\(longest request\)/),
  };
}

function curlCode(url) {
  const output = execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", url], {
    encoding: "utf8",
  });
  return output.trim();
}

async function requestJson(path, { method = "GET", body, headers = {}, cookie = "" } = {}) {
  const allHeaders = {
    "User-Agent": "SPECTRE-Load-Test/1.0",
    Accept: "application/json",
    ...headers,
  };

  const requestInit = {
    method,
    headers: allHeaders,
  };

  if (cookie) allHeaders.Cookie = cookie;
  if (body !== undefined) {
    allHeaders["Content-Type"] = "application/json";
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(`${base}${path}`, requestInit);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    payload,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function extractSessionCookie(headers) {
  const setCookie = headers["set-cookie"];
  if (!setCookie) return "";
  const match = String(setCookie).match(/spectre_session=[^;]+/);
  return match ? match[0] : "";
}

async function runWriteScenarios() {
  if (!enableWrites) {
    return [{ step: "writes", status: "skipped", note: "Enable with --writes=true or LOAD_TEST_ENABLE_WRITES=1" }];
  }

  if (!testEmail || !testPassword) {
    return [{ step: "writes", status: "blocked", note: "Set test mailbox via --email and --password (or env vars)." }];
  }

  const rows = [];

  const register = await requestJson("/api/auth/register", {
    method: "POST",
    body: {
      email: testEmail,
      password: testPassword,
      displayName: testName,
      acceptsTerms: true,
    },
  });
  rows.push({
    step: "register",
    status: register.status,
    note:
      register.status === 200
        ? "Created or verification-required response returned."
        : (register.payload?.error || "Unexpected register response"),
  });

  const resend = await requestJson("/api/auth/verify/resend", {
    method: "POST",
    body: { email: testEmail },
  });
  rows.push({
    step: "verify-resend",
    status: resend.status,
    note: resend.payload?.message || resend.payload?.error || "",
  });

  const loginBeforeVerify = await requestJson("/api/auth/login", {
    method: "POST",
    body: { email: testEmail, password: testPassword },
  });
  rows.push({
    step: "login-before-verify",
    status: loginBeforeVerify.status,
    note: loginBeforeVerify.payload?.error || (loginBeforeVerify.ok ? "Authenticated" : ""),
  });

  const resetRequest = await requestJson("/api/auth/password/request", {
    method: "POST",
    body: { email: testEmail },
  });
  rows.push({
    step: "password-reset-request",
    status: resetRequest.status,
    note: resetRequest.payload?.message || resetRequest.payload?.error || "",
  });

  if (verifyToken) {
    const verify = await requestJson("/api/auth/verify", {
      method: "POST",
      body: { token: verifyToken },
    });
    rows.push({
      step: "verify-token",
      status: verify.status,
      note: verify.payload?.message || verify.payload?.error || "",
    });

    const loginAfterVerify = await requestJson("/api/auth/login", {
      method: "POST",
      body: { email: testEmail, password: testPassword },
    });
    const cookie = extractSessionCookie(loginAfterVerify.headers);
    rows.push({
      step: "login-after-verify",
      status: loginAfterVerify.status,
      note: loginAfterVerify.payload?.error || (loginAfterVerify.ok ? "Authenticated" : ""),
    });

    const session = await requestJson("/api/auth/session", { cookie });
    rows.push({
      step: "session-after-login",
      status: session.status,
      note: session.payload?.authenticated ? "Session active" : "No active session",
    });

    const logout = await requestJson("/api/auth/logout", {
      method: "POST",
      cookie,
    });
    rows.push({
      step: "logout",
      status: logout.status,
      note: logout.payload?.message || (logout.ok ? "Logged out" : logout.payload?.error || ""),
    });
  } else {
    rows.push({
      step: "verify-token",
      status: "skipped",
      note: "Provide --verify-token or LOAD_TEST_VERIFY_TOKEN to complete verification and login checks.",
    });
  }

  if (resetToken) {
    const reset = await requestJson("/api/auth/password/reset", {
      method: "POST",
      body: { token: resetToken, newPassword: testPassword },
    });
    rows.push({
      step: "password-reset-submit",
      status: reset.status,
      note: reset.payload?.message || reset.payload?.error || "",
    });
  } else {
    rows.push({
      step: "password-reset-submit",
      status: "skipped",
      note: "Provide --reset-token or LOAD_TEST_RESET_TOKEN to complete reset submission.",
    });
  }

  return rows;
}

const rows = [];
for (const scenario of scenarios) {
  const url = `${base}${scenario.path}`;
  const code = curlCode(url);
  const result = runAb(url, scenario.n, scenario.c);
  rows.push({
    label: scenario.label,
    code,
    n: scenario.n,
    c: scenario.c,
    ...result,
  });
}

const writeRows = await runWriteScenarios();

console.log(`Load test profile: ${profile}`);
console.log(`Base URL: ${base}`);
console.log("");
console.table(rows);

if (writeRows.length) {
  console.log("");
  console.log("Auth / write scenarios");
  console.table(writeRows);
}
