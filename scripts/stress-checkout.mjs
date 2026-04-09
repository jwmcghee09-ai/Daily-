/**
 * Checkout & registration stress test.
 *
 * Scenarios:
 *   1. Concurrent guest checkout (expect 503 Stripe-not-configured, or 200 with URL)
 *   2. Rate-limit enforcement on checkout (>10 req/10min same IP → 429)
 *   3. Concurrent registration (expect 503 email-not-configured, or 200/409)
 *   4. Rate-limit enforcement on registration (>10 req/15min → 429)
 *   5. Duplicate email checkout (same email fired N times concurrently)
 *   6. Invalid email / bad input rejection (expect 400)
 *
 * Usage: node scripts/stress-checkout.mjs [BASE_URL]
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";
const CONCURRENCY = 20; // simultaneous agents per scenario

// ─── helpers ────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function guestEmail(tag = "") {
  return `stress+${tag}${uid()}@example.com`;
}

// Each scenario gets a unique fake IP so rate-limit buckets don't bleed across scenarios.
// getClientAddress() uses the LAST entry in X-Forwarded-For, so we append the fake IP.
async function post(path, body, scenarioIp = "127.0.0.1", cookie = "") {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": scenarioIp,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json, ms: Date.now() - t0 };
  } catch (err) {
    return { status: 0, body: { error: String(err) }, ms: Date.now() - t0 };
  }
}

function tally(results, label) {
  const counts = {};
  let totalMs = 0;
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    totalMs += r.ms;
  }
  const avgMs = Math.round(totalMs / results.length);
  console.log(`\n  [${label}]`);
  for (const [code, n] of Object.entries(counts).sort()) {
    const pct = ((n / results.length) * 100).toFixed(0).padStart(3);
    console.log(`    HTTP ${code}: ${String(n).padStart(3)} (${pct}%)`);
  }
  console.log(`    avg latency: ${avgMs}ms  total: ${results.length} req`);
  return counts;
}

function assert(condition, msg) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ PASS: ${msg}`);
  }
}

// ─── scenarios ───────────────────────────────────────────────────────────────

async function scenarioGuestCheckout() {
  console.log("\n━━ Scenario 1: Concurrent guest checkout ━━");
  const ip = "10.0.1.1";
  const workers = Array.from({ length: CONCURRENCY }, (_, i) =>
    post("/api/billing/checkout", { email: guestEmail(`s1-${i}-`), plan: "plus" }, ip),
  );
  const results = await Promise.all(workers);
  const counts = tally(results, "guest checkout");

  // Should not crash (500) — expect 503 (Stripe not configured) or 200/429
  assert(
    (counts[503] || 0) + (counts[200] || 0) + (counts[429] || 0) === CONCURRENCY,
    `All ${CONCURRENCY} requests handled cleanly (200/429/503)`,
  );
  assert(!(counts[500] || 0), "No 500 internal errors");
}

async function scenarioCheckoutRateLimit() {
  console.log("\n━━ Scenario 2: Checkout rate-limit enforcement ━━");
  const ip = "10.0.2.1"; // fresh IP for this scenario
  const BURST = 25;
  const workers = Array.from({ length: BURST }, (_, i) =>
    post("/api/billing/checkout", { email: guestEmail(`s2-${i}-`), plan: "plus" }, ip),
  );
  const results = await Promise.all(workers);
  const counts = tally(results, "checkout burst 25");

  assert((counts[429] || 0) > 0, "At least one 429 rate-limit response received");
  assert(!(counts[500] || 0), "No 500 internal errors");
  const allowed = BURST - (counts[429] || 0);
  assert(allowed <= 10, `No more than 10 requests allowed before rate limit (got ${allowed})`);
}

async function scenarioConcurrentRegistration() {
  console.log("\n━━ Scenario 3: Concurrent registration ━━");
  const ip = "10.0.3.1";
  const workers = Array.from({ length: CONCURRENCY }, (_, i) =>
    post("/api/auth/register", {
      email: guestEmail(`s3-${i}-`),
      password: "StressTest1!",
      displayName: `Stress User ${i}`,
      acceptsTerms: true,
    }, ip),
  );
  const results = await Promise.all(workers);
  const counts = tally(results, "concurrent register");

  // 503 = email not configured (expected in local dev), 200 = success, 429 = rate limited
  assert(
    (counts[503] || 0) + (counts[200] || 0) + (counts[429] || 0) === CONCURRENCY,
    `All ${CONCURRENCY} register requests handled (200/429/503)`,
  );
  assert(!(counts[500] || 0), "No 500 internal errors");
}

async function scenarioRegistrationRateLimit() {
  console.log("\n━━ Scenario 4: Registration rate-limit enforcement ━━");
  const ip = "10.0.4.1"; // fresh IP for this scenario
  const BURST = 15;
  const workers = Array.from({ length: BURST }, (_, i) =>
    post("/api/auth/register", {
      email: guestEmail(`s4-${i}-`),
      password: "StressTest1!",
      displayName: `Burst User ${i}`,
      acceptsTerms: true,
    }, ip),
  );
  const results = await Promise.all(workers);
  const counts = tally(results, "register burst 15");

  assert((counts[429] || 0) > 0, "At least one 429 rate-limit response received");
  assert(!(counts[500] || 0), "No 500 internal errors");
  const allowed = BURST - (counts[429] || 0);
  assert(allowed <= 10, `No more than 10 registrations allowed before rate limit (got ${allowed})`);
}

async function scenarioDuplicateEmail() {
  console.log("\n━━ Scenario 5: Same email fired concurrently (race condition check) ━━");
  const ip = "10.0.5.1";
  const email = guestEmail("s5-shared-");
  const workers = Array.from({ length: 8 }, () =>
    post("/api/billing/checkout", { email, plan: "plus" }, ip),
  );
  const results = await Promise.all(workers);
  const counts = tally(results, `duplicate email: ${email}`);

  // All should be handled without crashing
  assert(!(counts[500] || 0), "No 500 errors on duplicate email burst");
}

async function scenarioBadInput() {
  console.log("\n━━ Scenario 6: Invalid input rejection ━━");
  const ip = "10.0.6.1"; // fresh IP — no prior rate limit burn on this scenario
  const cases = [
    { label: "empty body",          body: {} },
    { label: "bad email (no TLD)",  body: { email: "notanemail@foo", plan: "plus" } },
    { label: "bad email (no @)",    body: { email: "notemail.com",   plan: "plus" } },
    { label: "single-char TLD",     body: { email: "a@b.c",          plan: "plus" } },
    { label: "email with spaces",   body: { email: "foo bar@x.com",  plan: "plus" } },
    { label: "no email field",      body: { plan: "plus" } },
  ];

  const results = await Promise.all(
    cases.map(({ body }) => post("/api/billing/checkout", body, ip)),
  );

  for (let i = 0; i < cases.length; i++) {
    const { label } = cases[i];
    const { status, body } = results[i];
    const ok = status === 400;
    console.log(`    ${ok ? "✓" : "✗"} ${label} → HTTP ${status}${ok ? "" : ` (${body?.error || ""})`}`);
    assert(ok, `"${label}" rejected with 400`);
  }
}

async function scenarioLoginBruteForce() {
  console.log("\n━━ Scenario 7: Login brute-force rate limiting ━━");
  const ip = "10.0.7.1"; // fresh IP
  const BURST = 25;
  const workers = Array.from({ length: BURST }, () =>
    post("/api/auth/login", {
      email: "victim@example.com",
      password: "wrongpassword",
    }, ip),
  );
  const results = await Promise.all(workers);
  const counts = tally(results, "login burst 25");

  assert((counts[429] || 0) > 0, "Login rate limit kicks in (429 received)");
  assert(!(counts[500] || 0), "No 500 errors on login burst");
  const allowed = BURST - (counts[429] || 0);
  assert(allowed <= 20, `No more than 20 login attempts allowed per window (got ${allowed})`);
}

// ─── main ────────────────────────────────────────────────────────────────────

console.log(`\nSpectre checkout stress test`);
console.log(`Target: ${BASE_URL}`);
console.log(`Concurrency: ${CONCURRENCY} agents per scenario`);
console.log("─".repeat(50));

const t0 = Date.now();

await scenarioGuestCheckout();
await scenarioCheckoutRateLimit();
await scenarioConcurrentRegistration();
await scenarioRegistrationRateLimit();
await scenarioDuplicateEmail();
await scenarioBadInput();
await scenarioLoginBruteForce();

console.log(`\n${"─".repeat(50)}`);
console.log(`Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(process.exitCode === 1 ? "\n✗ Some assertions failed." : "\n✓ All assertions passed.");
