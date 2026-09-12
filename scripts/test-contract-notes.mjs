// Parser checks against realistic confirmation shapes from each broker,
// plus the adversarial cases: junk mail, statements, forwarded duplicates,
// and figures that don't add up.
import { parseContractNote, htmlToText, normaliseDate } from "../src/lib/contract-notes.ts";

let fails = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) fails++;
};

// ── CommSec ──
const commsec = `
Dear John,
You bought 300 BHP at $41.20 on the ASX.
Confirmation Number: N12345678
Trade Date: 14/03/2026
Brokerage: $19.95
Total Value: $12,379.95
`;
let r = parseContractNote("CommSec Trade Confirmation", commsec, "no-reply@commsec.com.au");
check("CommSec parses", r.trades.length === 1, r.trades[0] && `${r.trades[0].side} ${r.trades[0].units} ${r.trades[0].ticker} @ ${r.trades[0].unitPrice}`);
if (r.trades[0]) {
  const t = r.trades[0];
  check("CommSec broker", t.broker === "CommSec");
  check("CommSec side/units/price", t.side === "buy" && t.units === 300 && t.unitPrice === 41.2);
  check("CommSec date normalised", t.tradeDate === "2026-03-14", t.tradeDate ?? "null");
  check("CommSec brokerage", t.brokerage === 19.95, String(t.brokerage));
  check("CommSec confirmation no.", t.confirmation === "N12345678", t.confirmation ?? "null");
  check("CommSec currency", t.currency === "AUD");
  check("CommSec high confidence", t.confidence >= 0.9);
}

// ── CommSec sell ──
r = parseContractNote("Confirmation", "You sold 120 CBA at $131.44\nTrade Date: 2 Apr 2026", "commsec@commsec.com.au");
check("CommSec sell + written date", r.trades[0]?.side === "sell" && r.trades[0]?.tradeDate === "2026-04-02", r.trades[0]?.tradeDate ?? "null");

// ── Selfwealth labelled block ──
const selfwealth = `
SelfWealth Trade Confirmation
Your order has been filled - you bought the following:
Code: CSL
Quantity: 25
Price: $288.10
Brokerage: $9.50
Total: $7,212.00
Trade Date: 01/04/2026
`;
r = parseContractNote("SelfWealth Order Filled", selfwealth, "notifications@selfwealth.com.au");
check("Selfwealth parses", r.trades.length === 1, r.trades[0] && `${r.trades[0].ticker} ${r.trades[0].units} @ ${r.trades[0].unitPrice}`);
check("Selfwealth broker", r.trades[0]?.broker === "Selfwealth");

// ── Stake (USD) ──
const stake = `
Stake trade confirmation
You bought
Symbol: NVDA
Quantity: 40
Unit Price: US$202.81
Total: US$8,112.40
Trade Date: 2026-04-03
`;
r = parseContractNote("Your Stake order filled", stake, "hello@stake.com.au");
check("Stake parses", r.trades.length === 1);
check("Stake currency USD", r.trades[0]?.currency === "USD", r.trades[0]?.currency);
check("Stake ISO date", r.trades[0]?.tradeDate === "2026-04-03");

// ── HTML email ──
const html = `<html><body><p>You bought <b>150</b> WES at <b>$72.50</b></p>
<table><tr><td>Trade Date</td><td>10/04/2026</td></tr><tr><td>Brokerage</td><td>$19.95</td></tr></table></body></html>`;
r = parseContractNote("Confirmation", htmlToText(html), "no-reply@commsec.com.au");
check("HTML email parses", r.trades.length === 1, r.trades[0] && `${r.trades[0].units} ${r.trades[0].ticker} @ ${r.trades[0].unitPrice}`);

// ── Forwarded thread with the note quoted twice ──
const fwd = commsec + "\n\n--- Forwarded message ---\n" + commsec;
r = parseContractNote("Fwd: CommSec Trade Confirmation", fwd, "john@example.com");
check("duplicate in forwarded thread collapsed", r.trades.length === 1, `${r.trades.length} trade(s)`);

// ── Totals that don't reconcile ──
const bad = "You bought 300 BHP at $41.20\nTotal Value: $99,999.00";
r = parseContractNote("Confirmation", bad, "commsec@commsec.com.au");
check("mismatched total flagged", (r.trades[0]?.notes.length ?? 0) > 0 && (r.trades[0]?.confidence ?? 1) <= 0.5,
  r.trades[0]?.notes[0]?.slice(0, 54));

// ── Things that must NOT produce a trade ──
for (const [label, subject, body] of [
  ["marketing email", "Markets update", "The ASX rose today. Check out our new app!"],
  ["empty body", "Confirmation", ""],
  ["statement with no trade", "Your monthly statement", "Portfolio value: $155,000. Holdings: BHP, CBA."],
  ["password reset", "Reset your password", "Click here to reset your CommSec password."],
]) {
  const res = parseContractNote(subject, body, "no-reply@commsec.com.au");
  check(`rejects ${label}`, res.trades.length === 0, res.reason?.slice(0, 44) ?? "");
}

// ── Implausible values must be rejected ──
for (const [label, body] of [
  ["zero units", "You bought 0 BHP at $41.20"],
  ["negative price", "You bought 10 BHP at $-5.00"],
  ["absurd units", "You bought 999999999999 BHP at $41.20"],
]) {
  const res = parseContractNote("Confirmation", body, "commsec@commsec.com.au");
  check(`rejects ${label}`, res.trades.length === 0);
}

// ── Date normalisation ──
check("date: dd/mm/yyyy", normaliseDate("14/03/2026") === "2026-03-14");
check("date: d Mon yyyy", normaliseDate("2 April 2026") === "2026-04-02");
check("date: iso passthrough", normaliseDate("2026-04-03") === "2026-04-03");
check("date: junk → null", normaliseDate("sometime last week") === null);

console.log(fails ? `\n${fails} check(s) FAILED` : "\nAll contract-note parser checks passed");
process.exit(fails ? 1 : 0);
