// End-to-end ingestion test: forwarding address, signed webhook, parsing,
// review, apply, and the security cases that must be rejected.
import crypto from "node:crypto";

const BASE = "http://localhost:3457";
const KEY = process.env.INBOUND_EMAIL_SIGNING_KEY;
const COOKIE = process.env.TEST_COOKIE;
let fails = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
};

const authed = (extra = {}) => ({ Cookie: COOKIE, "Content-Type": "application/json", ...extra });

function sign(fields, key = KEY, at = Math.floor(Date.now() / 1000)) {
  const token = crypto.randomBytes(8).toString("hex");
  const signature = crypto.createHmac("sha256", key).update(String(at) + token).digest("hex");
  return { ...fields, timestamp: String(at), token, signature };
}

async function post(fields) {
  const form = new URLSearchParams(fields);
  return fetch(`${BASE}/api/ingest/email`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

// ── 1. Forwarding address ──
let res = await fetch(`${BASE}/api/ingest/trades`, { headers: authed() });
let data = await res.json();
const address = data.forwardingAddress ?? "";
check("forwarding address issued", /^[a-z0-9]{8,40}@/.test(address), address);
const alias = address.split("@")[0];

// stable across calls
data = await (await fetch(`${BASE}/api/ingest/trades`, { headers: authed() })).json();
check("address is stable", data.forwardingAddress === address);

// ── 2. Security: unsigned / bad signature / replay ──
res = await post({ recipient: address, subject: "x", "body-plain": "You bought 10 BHP at $40.00" });
check("unsigned post rejected", res.status === 401, String(res.status));

res = await post(sign({ recipient: address, subject: "x", "body-plain": "y" }, "wrong-key"));
check("bad signature rejected", res.status === 401, String(res.status));

res = await post(sign({ recipient: address, subject: "x", "body-plain": "y" }, KEY, Math.floor(Date.now() / 1000) - 4000));
check("stale timestamp rejected (replay)", res.status === 401, String(res.status));

// ── 3. Unknown alias is swallowed, not attributed ──
res = await post(sign({ recipient: "aaaaaaaaaaaaaaaa@in.spectre-assets.com", subject: "x", "body-plain": "You bought 10 BHP at $40.00" }));
data = await res.json();
check("unknown alias ignored", res.ok && data.ignored === "unknown recipient", JSON.stringify(data));

// ── 4. A real CommSec confirmation ──
const note = `Dear John,
You bought 300 BHP at $41.20 on the ASX.
Confirmation Number: N12345678
Trade Date: 14/03/2026
Brokerage: $19.95
Total Value: $12,379.95`;
res = await post(sign({ recipient: address, from: "no-reply@commsec.com.au", subject: "CommSec Trade Confirmation", "body-plain": note }));
data = await res.json();
check("confirmation parsed", data.parsed === 1 && data.broker === "CommSec", JSON.stringify(data));

// ── 5. Duplicate forward is not double counted ──
res = await post(sign({ recipient: address, from: "no-reply@commsec.com.au", subject: "CommSec Trade Confirmation", "body-plain": note }));
data = await res.json();
check("duplicate forward suppressed", data.duplicate === true, JSON.stringify(data));

// ── 6. Junk mail records a reason, creates no trade ──
res = await post(sign({ recipient: address, from: "news@commsec.com.au", subject: "Market wrap", "body-plain": "The ASX rose today." }));
data = await res.json();
check("junk mail parsed to nothing", data.parsed === 0 && !!data.reason, (data.reason ?? "").slice(0, 40));

// ── 7. Pending list ──
data = await (await fetch(`${BASE}/api/ingest/trades`, { headers: authed() })).json();
const pending = data.pending ?? [];
check("one pending trade awaiting review", pending.length === 1, `${pending.length}`);
check("pending trade correct", pending[0]?.ticker === "BHP" && pending[0]?.units === 300 && pending[0]?.unitPrice === 41.2);
check("activity log shows all three emails", (data.recent ?? []).length >= 3, `${(data.recent ?? []).length} entries`);

// ── 8. Nothing has touched holdings yet ──
let pf = await (await fetch(`${BASE}/api/portfolio`, { headers: authed() })).json();
const before = (pf.holdings ?? []).find((h) => h.ticker === "BHP");
check("holdings untouched before apply", !before, before ? `BHP present: ${before.units}` : "no BHP yet");

// ── 9. Apply ──
res = await fetch(`${BASE}/api/ingest/trades`, {
  method: "POST", headers: authed(), body: JSON.stringify({ action: "apply", ids: [pending[0].id] }),
});
data = await res.json();
check("apply succeeds", data.applied === 1, JSON.stringify(data.skipped ?? []));

pf = await (await fetch(`${BASE}/api/portfolio`, { headers: authed() })).json();
const after = (pf.holdings ?? []).find((h) => h.ticker === "BHP");
check("holding created", !!after && after.units === 300, after ? `${after.units} units, cost ${after.costBase}` : "missing");
check("cost base includes brokerage", after && Math.abs(after.costBase - (300 * 41.2 + 19.95)) < 0.01, after ? String(after.costBase) : "");

// ── 10. Applying twice is a no-op ──
res = await fetch(`${BASE}/api/ingest/trades`, {
  method: "POST", headers: authed(), body: JSON.stringify({ action: "apply", ids: [pending[0].id] }),
});
check("re-applying the same trade is refused", res.status === 404, String(res.status));

// ── 11. Sell reduces the position ──
const sellNote = "You sold 100 BHP at $60.00\nTrade Date: 20/03/2026";
await post(sign({ recipient: address, from: "no-reply@commsec.com.au", subject: "CommSec Confirmation", "body-plain": sellNote }));
data = await (await fetch(`${BASE}/api/ingest/trades`, { headers: authed() })).json();
const sellTrade = (data.pending ?? []).find((t) => t.side === "sell");
check("sell parsed", !!sellTrade, sellTrade ? `${sellTrade.units} @ ${sellTrade.unitPrice}` : "missing");
if (sellTrade) {
  await fetch(`${BASE}/api/ingest/trades`, {
    method: "POST", headers: authed(), body: JSON.stringify({ action: "apply", ids: [sellTrade.id] }),
  });
  pf = await (await fetch(`${BASE}/api/portfolio`, { headers: authed() })).json();
  const post200 = (pf.holdings ?? []).find((h) => h.ticker === "BHP");
  check("sell reduced units to 200", post200 && Math.abs(post200.units - 200) < 1e-6, post200 ? String(post200.units) : "gone");
}

// ── 12. Oversell is refused, not applied ──
await post(sign({ recipient: address, from: "no-reply@commsec.com.au", subject: "Confirmation", "body-plain": "You sold 9999 BHP at $60.00" }));
data = await (await fetch(`${BASE}/api/ingest/trades`, { headers: authed() })).json();
const over = (data.pending ?? []).find((t) => t.units === 9999);
if (over) {
  res = await fetch(`${BASE}/api/ingest/trades`, {
    method: "POST", headers: authed(), body: JSON.stringify({ action: "apply", ids: [over.id] }),
  });
  data = await res.json();
  check("oversell skipped with a reason", (data.skipped ?? []).length === 1, JSON.stringify(data.skipped?.[0] ?? {}));
} else check("oversell trade queued", false, "not parsed");

// ── 13. Unauthenticated access ──
res = await fetch(`${BASE}/api/ingest/trades`);
check("review endpoint requires sign-in", res.status === 401, String(res.status));

// ── 14. Rotating the alias invalidates the old one ──
res = await fetch(`${BASE}/api/ingest/trades`, {
  method: "POST", headers: authed(), body: JSON.stringify({ action: "rotate" }),
});
data = await res.json();
const rotated = data.forwardingAddress ?? "";
check("rotate issues a new address", rotated && rotated !== address, rotated);
res = await post(sign({ recipient: address, from: "no-reply@commsec.com.au", subject: "Confirmation", "body-plain": "You bought 5 CSL at $288.00" }));
data = await res.json();
check("old address no longer accepted", data.ignored === "unknown recipient", JSON.stringify(data));

console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll email-ingestion checks passed");
process.exit(fails ? 1 : 0);
