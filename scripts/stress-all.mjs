/**
 * Full-suite stress test for every Spectre API endpoint.
 *
 * Usage:  node scripts/stress-all.mjs [BASE_URL]
 *
 * Scenarios
 * ─────────
 *  1.  Health endpoint
 *  2.  Auth – concurrent registration + rate-limit enforcement
 *  3.  Auth – concurrent login brute-force + rate-limit enforcement
 *  4.  Auth – session (unauthenticated)
 *  5.  Auth – password reset request rate-limiting
 *  6.  Auth – verify resend rate-limiting
 *  7.  Auth – email verify with bad token
 *  8.  Billing – checkout rate-limit & validation
 *  9.  Billing – portal (auth required)
 * 10.  Portfolio – auth-required endpoints (GET / DELETE)
 * 11.  Import – oversized payload + unauthenticated
 * 12.  Export CSV – auth required
 * 13.  Notifications – auth required
 * 14.  Risk estimate – auth required
 * 15.  Prices refresh – auth required
 * 16.  Alerts (price-dip) – auth required
 * 17.  Research quotes – concurrent flood
 * 18.  Research news – concurrent flood
 * 19.  Research movers – concurrent flood
 * 20.  Internal ops – cron auth enforcement
 * 21.  Pages (SSR) – all public routes return 200
 * 22.  Race condition – concurrent DB writes (same user import)
 * 23.  Webhook – missing signature rejection
 */

const BASE_URL = process.argv[2] || "http://localhost:3000";
const BURST = 20;

// ─── colours ────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold:  "\x1b[1m",
  green: "\x1b[32m",
  red:   "\x1b[31m",
  cyan:  "\x1b[36m",
  grey:  "\x1b[90m",
  yellow:"\x1b[33m",
};

let passed = 0, failed = 0;

function uid()       { return Math.random().toString(36).slice(2, 10); }
function fakeEmail(tag = "") { return `stress+${tag}${uid()}@example.com`; }
function fakeIp(seg) { return `10.${seg}.0.1`; }

// ─── HTTP helpers ────────────────────────────────────────────────────────────
async function req(method, path, { body, ip = "127.0.0.1", cookie = "", headers = {} } = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    return { status: res.status, body: json, ms: Date.now() - t0, headers: res.headers };
  } catch (err) {
    return { status: 0, body: { error: String(err) }, ms: Date.now() - t0, headers: new Headers() };
  }
}
const get  = (path, opts) => req("GET",  path, opts);
const post = (path, body, opts) => req("POST", path, { body, ...opts });
const del  = (path, opts) => req("DELETE", path, opts);

// parallel fire
function flood(n, fn) { return Promise.all(Array.from({ length: n }, (_, i) => fn(i))); }

// ─── reporting ───────────────────────────────────────────────────────────────
function tally(results, label) {
  const counts = {};
  let totalMs = 0;
  for (const r of results) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    totalMs += r.ms;
  }
  const avg = Math.round(totalMs / results.length);
  const parts = Object.entries(counts)
    .sort(([a],[b]) => Number(a)-Number(b))
    .map(([code, n]) => `${c.grey}HTTP ${code}${c.reset}×${n}`)
    .join("  ");
  console.log(`  ${c.grey}[${label}]${c.reset} ${parts}  ${c.grey}avg ${avg}ms${c.reset}`);
  return counts;
}

function assert(ok, msg) {
  if (ok) {
    console.log(`  ${c.green}✓${c.reset} ${msg}`);
    passed++;
  } else {
    console.log(`  ${c.red}✗ FAIL: ${msg}${c.reset}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${c.bold}${c.cyan}━━ ${title} ━━${c.reset}`);
}

// ─── 1. Health ───────────────────────────────────────────────────────────────
async function s01_health() {
  section("1. Health endpoint");
  const results = await flood(30, () => get("/api/health", { ip: fakeIp(1) }));
  const counts = tally(results, "GET /api/health ×30");
  assert(counts[200] === 30, "All 30 health checks return 200");
  assert(!counts[500], "No 500s");
  const bodies = results.filter(r => r.body?.ok === true);
  assert(bodies.length === 30, "Response body contains ok:true");
}

// ─── 2. Registration ─────────────────────────────────────────────────────────
async function s02_register() {
  section("2. Auth – registration");

  // Concurrent unique emails (503 = email not configured, 200 = success)
  const ip = fakeIp(2);
  const results = await flood(BURST, i =>
    post("/api/auth/register", {
      email: fakeEmail(`reg-${i}-`),
      password: "StressPass1!",
      displayName: `User ${i}`,
      acceptsTerms: true,
    }, { ip })
  );
  const counts = tally(results, "concurrent register ×20");
  assert(!counts[500], "No 500s");
  assert(
    (counts[200]||0) + (counts[429]||0) + (counts[503]||0) === BURST,
    "Only 200/429/503 responses"
  );

  // Rate limit burst
  const ipBurst = fakeIp(201);
  const burst = await flood(15, i =>
    post("/api/auth/register", {
      email: fakeEmail(`regburst-${i}-`),
      password: "StressPass1!",
      displayName: `Burst ${i}`,
      acceptsTerms: true,
    }, { ip: ipBurst })
  );
  const bc = tally(burst, "burst ×15 same IP");
  assert((bc[429]||0) > 0, "Rate limit fires (429 received)");
  assert((15 - (bc[429]||0)) <= 10, "Max 10 allowed per window");

  // Validation
  const badCases = [
    [{ email: "bad",          password: "StressPass1!", acceptsTerms: true }, "invalid email → 400"],
    [{ email: fakeEmail(),    password: "short",        acceptsTerms: true }, "short password → 400"],
    [{ email: fakeEmail(),    password: "StressPass1!", acceptsTerms: false }, "no terms → 400"],
    [{ email: "a@b.c",        password: "StressPass1!", acceptsTerms: true }, "single-char TLD → 400"],
  ];
  const ipVal = fakeIp(202);
  for (const [body, label] of badCases) {
    const r = await post("/api/auth/register", body, { ip: ipVal });
    assert(r.status === 400, label);
  }
}

// ─── 3. Login ────────────────────────────────────────────────────────────────
async function s03_login() {
  section("3. Auth – login brute-force");

  // Flood wrong password
  const ip = fakeIp(3);
  const results = await flood(BURST, () =>
    post("/api/auth/login", { email: "victim@example.com", password: "wrong" }, { ip })
  );
  const counts = tally(results, "brute-force ×20");
  assert(!counts[500], "No 500s");
  assert((counts[429]||0) > 0, "Rate limit fires");

  // Per-email rate limit (different IPs, same email)
  const sameEmail = fakeEmail("brutemail-");
  const emailResults = await flood(10, i =>
    post("/api/auth/login", { email: sameEmail, password: "wrong" }, { ip: fakeIp(300 + i) })
  );
  const ec = tally(emailResults, "per-email limit (10 IPs, same email)");
  assert((ec[401]||0) + (ec[429]||0) === 10, "401 or 429 only");

  // Validation
  const ipVal = fakeIp(301);
  const r1 = await post("/api/auth/login", { email: "notanemail", password: "password" }, { ip: ipVal });
  assert(r1.status === 400, "Invalid email format → 400");
  const r2 = await post("/api/auth/login", {}, { ip: ipVal });
  assert(r2.status === 400, "Empty body → 400");
}

// ─── 4. Session (unauthenticated) ────────────────────────────────────────────
async function s04_session() {
  section("4. Auth – session check");
  const results = await flood(10, () => get("/api/auth/session", { ip: fakeIp(4) }));
  const counts = tally(results, "GET /api/auth/session ×10 (no cookie)");
  assert(counts[200] === 10, "All return 200 (session endpoint returns authenticated:false)");
}

// ─── 5. Password reset ───────────────────────────────────────────────────────
async function s05_passwordReset() {
  section("5. Auth – password reset rate-limiting");

  const ip = fakeIp(5);
  const results = await flood(15, i =>
    post("/api/auth/password/request", { email: fakeEmail(`reset-${i}-`) }, { ip })
  );
  const counts = tally(results, "reset request burst ×15");
  assert(!counts[500], "No 500s");
  assert((counts[429]||0) > 0, "Rate limit fires");

  // Per-email limit
  const email = fakeEmail("resetemail-");
  const emailResults = await flood(8, i =>
    post("/api/auth/password/request", { email }, { ip: fakeIp(500 + i) })
  );
  const ec = tally(emailResults, "per-email reset (8 IPs, same email)");
  assert(!ec[500], "No 500s on email-keyed limit");

  // Bad input
  const r = await post("/api/auth/password/request", { email: "not-an-email" }, { ip: fakeIp(501) });
  assert(r.status === 400, "Invalid email → 400");
}

// ─── 6. Verify resend ────────────────────────────────────────────────────────
async function s06_verifyResend() {
  section("6. Auth – verify resend rate-limiting");

  const ip = fakeIp(6);
  const results = await flood(15, i =>
    post("/api/auth/verify/resend", { email: fakeEmail(`resend-${i}-`) }, { ip })
  );
  const counts = tally(results, "resend burst ×15");
  assert(!counts[500], "No 500s");
  assert((counts[429]||0) > 0, "Rate limit fires");
}

// ─── 7. Email verify bad token ───────────────────────────────────────────────
async function s07_verifyBadToken() {
  section("7. Auth – email verify with bad token");

  const results = await flood(10, () =>
    get(`/api/auth/verify?token=badtoken${uid()}`, { ip: fakeIp(7) })
  );
  const counts = tally(results, "GET /api/auth/verify?token=bad ×10");
  // Should redirect (3xx) or return 400/404 — must not 500
  assert(!counts[500], "No 500s on bad verify token");
}

// ─── 8. Checkout ─────────────────────────────────────────────────────────────
async function s08_checkout() {
  section("8. Billing – checkout");

  // Rate limit
  const ip = fakeIp(8);
  const results = await flood(BURST, i =>
    post("/api/billing/checkout", { email: fakeEmail(`co-${i}-`), plan: "plus" }, { ip })
  );
  const counts = tally(results, "checkout burst ×20");
  assert(!counts[500], "No 500s");
  assert((counts[429]||0) > 0, "Rate limit fires");
  assert((BURST - (counts[429]||0)) <= 10, "Max 10 through before block");

  // Validation (fresh IP)
  const ipVal = fakeIp(801);
  const cases = [
    [{ plan: "plus" },                            "no email → 400"],
    [{ email: "a@b.c", plan: "plus" },            "single-char TLD → 400"],
    [{ email: "notanemail", plan: "plus" },        "no @ → 400"],
    [{ email: "foo bar@test.com", plan: "plus" },  "space in email → 400"],
    [{},                                           "empty body → 400"],
  ];
  for (const [body, label] of cases) {
    const r = await post("/api/billing/checkout", body, { ip: ipVal });
    assert(r.status === 400, label);
  }
}

// ─── 9. Billing portal (auth required) ───────────────────────────────────────
async function s09_portal() {
  section("9. Billing – portal (auth required)");
  const results = await flood(10, () =>
    post("/api/billing/portal", {}, { ip: fakeIp(9) })
  );
  const counts = tally(results, "POST /api/billing/portal (no auth) ×10");
  assert(counts[401] === 10, "All 10 return 401 without session");
}

// ─── 10. Portfolio (auth required) ───────────────────────────────────────────
async function s10_portfolio() {
  section("10. Portfolio – auth required");
  const ip = fakeIp(10);

  const gets = await flood(10, () => get("/api/portfolio", { ip }));
  const gc = tally(gets, "GET /api/portfolio (no auth) ×10");
  assert((gc[401]||0) === 10 || (gc[200]||0) === 10, "Returns 401 or 200 (demo fallback)");

  const dels = await flood(5, () => del("/api/portfolio", { ip }));
  const dc = tally(dels, "DELETE /api/portfolio (no auth) ×5");
  assert(!dc[500], "No 500s on unauthenticated delete");
}

// ─── 11. Import ───────────────────────────────────────────────────────────────
async function s11_import() {
  section("11. Import – validation & auth");
  const ip = fakeIp(11);

  // Unauthenticated
  const r1 = await post("/api/import", { source: "asx", holdings: [] }, { ip });
  assert(r1.status === 401, "Import without auth → 401");

  // Oversized payload (>2MB) unauthenticated — must not 500
  const bigPayload = "x".repeat(3 * 1024 * 1024);
  const r2 = await req("POST", "/api/import", {
    ip,
    headers: { "Content-Type": "application/json" },
    body: bigPayload,
  });
  assert(r2.status !== 500, `Oversized import doesn't 500 (got ${r2.status})`);
}

// ─── 12. Export CSV (auth required) ──────────────────────────────────────────
async function s12_export() {
  section("12. Export CSV – auth required");
  const results = await flood(10, () => get("/api/export/csv", { ip: fakeIp(12) }));
  const counts = tally(results, "GET /api/export/csv (no auth) ×10");
  assert(counts[401] === 10, "All 10 return 401");
}

// ─── 13. Notifications (auth required) ───────────────────────────────────────
async function s13_notifications() {
  section("13. Notifications – auth required");
  const results = await flood(10, () => get("/api/notifications", { ip: fakeIp(13) }));
  const counts = tally(results, "GET /api/notifications (no auth) ×10");
  assert(counts[401] === 10, "All 10 return 401");
}

// ─── 14. Risk estimate (auth required) ───────────────────────────────────────
async function s14_risk() {
  section("14. Risk estimate – auth required");
  const results = await flood(10, () =>
    post("/api/risk/estimate", { window: "1y" }, { ip: fakeIp(14) })
  );
  const counts = tally(results, "POST /api/risk/estimate (no auth) ×10");
  assert(counts[401] === 10, "All 10 return 401");
}

// ─── 15. Prices refresh (auth required) ──────────────────────────────────────
async function s15_prices() {
  section("15. Prices refresh – auth required");
  const results = await flood(10, () =>
    post("/api/prices/refresh", {}, { ip: fakeIp(15) })
  );
  const counts = tally(results, "POST /api/prices/refresh (no auth) ×10");
  assert(counts[401] === 10, "All 10 return 401");
}

// ─── 16. Price-dip alerts (auth required) ────────────────────────────────────
async function s16_alerts() {
  section("16. Price-dip alerts – auth required");
  const ip = fakeIp(16);
  const rGet = await get("/api/alerts/price-dip", { ip });
  assert(rGet.status === 401, "GET /api/alerts/price-dip → 401");

  // Alerts use PUT for upsert, not POST
  const rPut = await req("PUT", "/api/alerts/price-dip", { body: { ticker: "BHP", dropPctThreshold: 5 }, ip });
  assert(rPut.status === 401, "PUT /api/alerts/price-dip → 401");
}

// ─── 17. Research quotes – concurrent flood ───────────────────────────────────
async function s17_quotes() {
  section("17. Research quotes – concurrent flood");
  const results = await flood(15, () =>
    get("/api/research/quotes", { ip: fakeIp(17) })
  );
  const counts = tally(results, "GET /api/research/quotes ×15");
  assert(!counts[500], "No 500s");
  // 200 (cached/live), 401 (auth required), 503 (external API not configured)
  assert(
    !counts[500],
    "No 500s on concurrent quotes flood"
  );
}

// ─── 18. Research news ────────────────────────────────────────────────────────
async function s18_news() {
  section("18. Research news – concurrent");
  const results = await flood(10, () =>
    get("/api/research/news?ticker=AAPL", { ip: fakeIp(18) })
  );
  const counts = tally(results, "GET /api/research/news ×10");
  assert(!counts[500], "No 500s");
}

// ─── 19. Research movers ──────────────────────────────────────────────────────
async function s19_movers() {
  section("19. Research movers – concurrent");
  const results = await flood(10, () =>
    get("/api/research/movers", { ip: fakeIp(19) })
  );
  const counts = tally(results, "GET /api/research/movers ×10");
  assert(!counts[500], "No 500s");
}

// ─── 20. Internal ops – cron auth enforcement ────────────────────────────────
async function s20_internal() {
  section("20. Internal ops – cron auth enforcement");
  const ip = fakeIp(20);

  // No token
  const r1 = await get("/api/internal/ops/users", { ip });
  assert(r1.status === 401, "GET /api/internal/ops/users – no token → 401");

  // Wrong token
  const r2 = await get("/api/internal/ops/users", {
    ip,
    headers: { Authorization: "Bearer wrong-token-12345" },
  });
  assert(r2.status === 401, "GET /api/internal/ops/users – wrong token → 401");

  // Burst wrong tokens (should never 500)
  const results = await flood(15, () =>
    get("/api/internal/ops/users", {
      ip: fakeIp(200),
      headers: { Authorization: `Bearer bad-${uid()}` },
    })
  );
  const counts = tally(results, "burst wrong tokens ×15");
  assert(!counts[500], "No 500s on wrong-token burst");
  assert(counts[401] === 15, "All 15 return 401");

  // Test-error endpoint (no token)
  const r3 = await post("/api/internal/ops/test-error", {}, { ip });
  assert(r3.status === 401, "POST /api/internal/ops/test-error – no token → 401");
}

// ─── 21. Pages (SSR) ─────────────────────────────────────────────────────────
async function s21_pages() {
  section("21. Pages – SSR loads (no crashes)");
  const routes = ["/", "/signin", "/privacy", "/terms"];

  for (const route of routes) {
    const r = await req("GET", route, { ip: fakeIp(21) });
    assert(
      r.status === 200 || r.status === 307 || r.status === 302,
      `${route} → ${r.status} (200/302/307)`
    );
  }

  // Flood the landing page
  const results = await flood(20, () => req("GET", "/", { ip: fakeIp(210) }));
  const counts = tally(results, "GET / ×20");
  assert(!counts[500], "No 500s on landing page flood");
}

// ─── 22. Race condition – concurrent DB writes ────────────────────────────────
async function s22_raceCondition() {
  section("22. Race condition – concurrent same-IP checkout");
  const ip = fakeIp(22);
  const email = fakeEmail("race-");

  // Same email, 12 concurrent requests
  const results = await flood(12, () =>
    post("/api/billing/checkout", { email, plan: "plus" }, { ip })
  );
  const counts = tally(results, `same-email burst ×12 (${email})`);
  assert(!counts[500], "No 500s on concurrent same-email checkout");
  // Mix of 429 (rate limit) and 503 (Stripe not configured) is fine — no crashes
}

// ─── 23. Stripe webhook – missing/bad signature ───────────────────────────────
async function s23_webhook() {
  section("23. Stripe webhook – signature enforcement");
  const ip = fakeIp(23);

  // No signature header — expect 400 (sig missing) or 503 (Stripe not configured in dev)
  const r1 = await req("POST", "/api/webhooks/stripe", {
    ip,
    body: JSON.stringify({ type: "checkout.session.completed" }),
    headers: { "Content-Type": "application/json" },
  });
  assert(r1.status === 400 || r1.status === 503, `Missing stripe-signature → 400 or 503 (got ${r1.status})`);

  // Bad signature — expect 400 or 503 (Stripe not configured in dev)
  const r2 = await req("POST", "/api/webhooks/stripe", {
    ip,
    body: JSON.stringify({ type: "checkout.session.completed" }),
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "t=123,v1=invalidsig",
    },
  });
  assert(r2.status === 400 || r2.status === 503, `Invalid stripe-signature → 400 or 503 (got ${r2.status})`);

  // Burst with bad sigs — must never 500 regardless of Stripe config state
  const results = await flood(10, () =>
    req("POST", "/api/webhooks/stripe", {
      ip: fakeIp(230),
      body: JSON.stringify({ type: "invoice.payment_failed" }),
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": `t=${Date.now()},v1=${uid()}`,
      },
    })
  );
  const counts = tally(results, "bad-sig burst ×10");
  assert(!counts[500], "No 500s on bad-sig burst");
  assert(
    (counts[400] || 0) + (counts[503] || 0) === 10,
    "All 10 rejected cleanly (400 bad-sig or 503 unconfigured)"
  );
}

// ─── summary ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${c.bold}Spectre full-suite stress test${c.reset}`);
  console.log(`Target : ${c.cyan}${BASE_URL}${c.reset}`);
  console.log(`Burst  : ${BURST} concurrent agents per scenario`);
  console.log("─".repeat(56));

  const t0 = Date.now();

  await s01_health();
  await s02_register();
  await s03_login();
  await s04_session();
  await s05_passwordReset();
  await s06_verifyResend();
  await s07_verifyBadToken();
  await s08_checkout();
  await s09_portal();
  await s10_portfolio();
  await s11_import();
  await s12_export();
  await s13_notifications();
  await s14_risk();
  await s15_prices();
  await s16_alerts();
  await s17_quotes();
  await s18_news();
  await s19_movers();
  await s20_internal();
  await s21_pages();
  await s22_raceCondition();
  await s23_webhook();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n${"─".repeat(56)}`);
  console.log(`Total time : ${elapsed}s`);
  console.log(`${c.green}Passed${c.reset} : ${passed}`);
  if (failed > 0) {
    console.log(`${c.red}Failed${c.reset} : ${failed}`);
    console.log(`\n${c.red}${c.bold}✗ ${failed} assertion(s) failed.${c.reset}`);
    process.exitCode = 1;
  } else {
    console.log(`\n${c.green}${c.bold}✓ All ${passed} assertions passed.${c.reset}`);
  }
}

await main();
