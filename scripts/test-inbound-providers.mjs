// Verifies the inbound webhook accepts both providers and rejects anything
// that proves neither credential.
import crypto from "node:crypto";

const BASE = "http://localhost:3457";
const MAILGUN_KEY = process.env.INBOUND_EMAIL_SIGNING_KEY;
const BASIC = process.env.INBOUND_EMAIL_BASIC_AUTH;
const COOKIE = process.env.TEST_COOKIE;
let fails = 0;
const check = (l, ok, extra = "") => { console.log(`${ok ? "✓" : "✗"} ${l}${extra ? "  " + extra : ""}`); if (!ok) fails++; };

const alias = (await (await fetch(`${BASE}/api/ingest/trades`, { headers: { Cookie: COOKIE } })).json()).forwardingAddress;
check("alias available", !!alias, alias);

// A unique confirmation per run, so re-running the suite is not mistaken for
// someone forwarding the same email twice.
const RUN = crypto.randomBytes(4).toString("hex").toUpperCase();
const NOTE = (units, code, price) =>
  `You bought ${units} ${code} at $${price}\nTrade Date: 12/05/2026\nBrokerage: $19.95\nConfirmation Number: R${RUN}${units}`;

// ── Postmark (JSON + Basic auth) ──
async function postmark({ auth = BASIC, to = alias, body = NOTE(10, "BHP", "40.00"), subject = "CommSec Trade Confirmation" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = "Basic " + Buffer.from(auth).toString("base64");
  return fetch(`${BASE}/api/ingest/email`, {
    method: "POST", headers,
    body: JSON.stringify({
      From: "no-reply@commsec.com.au",
      FromFull: { Email: "no-reply@commsec.com.au" },
      To: to,
      ToFull: [{ Email: to }],
      OriginalRecipient: to,
      Subject: subject,
      TextBody: body,
      HtmlBody: `<p>${body}</p>`,
      MessageID: crypto.randomUUID(),
    }),
  });
}

let res = await postmark({ body: NOTE(111, "BHP", "40.00") });
let data = await res.json();
check("Postmark JSON accepted + parsed", data.parsed === 1 && data.broker === "CommSec", JSON.stringify(data));

res = await postmark({ auth: null, body: NOTE(222, "CBA", "99.00") });
check("Postmark without Basic auth rejected", res.status === 401, String(res.status));

res = await postmark({ auth: "wrong:creds", body: NOTE(333, "CSL", "50.00") });
check("Postmark wrong Basic auth rejected", res.status === 401, String(res.status));

res = await postmark({ to: "zzzzzzzzzzzzzz@in.spectre-assets.com", body: NOTE(444, "WES", "70.00") });
data = await res.json();
check("Postmark unknown alias ignored", data.ignored === "unknown recipient", JSON.stringify(data));

// Postmark HTML-only email
res = await fetch(`${BASE}/api/ingest/email`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Basic " + Buffer.from(BASIC).toString("base64") },
  body: JSON.stringify({
    From: "no-reply@commsec.com.au", To: alias, ToFull: [{ Email: alias }],
    Subject: "Confirmation", TextBody: "",
    HtmlBody: `<html><body><p>You bought <b>555</b> RIO at <b>$112.60</b></p><p>Confirmation Number: H${RUN}</p></body></html>`,
  }),
});
data = await res.json();
check("Postmark HTML-only body parsed", data.parsed === 1, JSON.stringify(data));

// ── Mailgun still works alongside ──
function sign(fields, key = MAILGUN_KEY, at = Math.floor(Date.now() / 1000)) {
  const token = crypto.randomBytes(8).toString("hex");
  const signature = crypto.createHmac("sha256", key).update(String(at) + token).digest("hex");
  return { ...fields, timestamp: String(at), token, signature };
}
res = await fetch(`${BASE}/api/ingest/email`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(sign({
    recipient: alias, from: "no-reply@commsec.com.au",
    subject: "CommSec Trade Confirmation", "body-plain": NOTE(666, "NAB", "38.20"),
  })).toString(),
});
data = await res.json();
check("Mailgun signed form still accepted", data.parsed === 1, JSON.stringify(data));

res = await fetch(`${BASE}/api/ingest/email`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ recipient: alias, subject: "x", "body-plain": NOTE(777, "ANZ", "29.00") }).toString(),
});
check("Mailgun unsigned still rejected", res.status === 401, String(res.status));

// ── Everything that landed should be pending, nothing applied ──
data = await (await fetch(`${BASE}/api/ingest/trades`, { headers: { Cookie: COOKIE } })).json();
const units = (data.pending ?? []).map((t) => t.units);
check("all accepted trades queued for review", [111, 555, 666].every((u) => units.includes(u)), units.join(", "));
check("rejected ones never stored", ![222, 333, 444, 777].some((u) => units.includes(u)), units.join(", "));

console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll provider checks passed");
process.exit(fails ? 1 : 0);
