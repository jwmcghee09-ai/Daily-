const required = [
  "APP_BASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRO_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
];

const optionalButRecommended = [
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "ALERT_EMAIL_TO",
  "BACKUP_PASSPHRASE",
  "BACKUP_CRON_TOKEN",
];

function report(label, names) {
  const missing = names.filter((name) => !String(process.env[name] || "").trim());
  if (missing.length === 0) {
    console.log(`${label}: OK`);
    return 0;
  }

  console.log(`${label}: missing ${missing.join(", ")}`);
  return missing.length;
}

const hardMissing = report("Required env", required);
report("Recommended env", optionalButRecommended);

// Which way this deployment points on access, said plainly rather than left to
// be discovered. Growth mode is on when the flag says so, and also when no
// Stripe configuration exists — with no checkout, denying access would lock out
// every user of a product none of them could buy.
const flag = String(process.env.FOUNDING_FREE_ACCESS || "").trim().toLowerCase();
const billingConfigured = Boolean(
  String(process.env.STRIPE_SECRET_KEY || "").trim()
  && (String(process.env.STRIPE_PRO_PRICE_ID || "").trim()
    || String(process.env.STRIPE_PRICE_STARTER_MONTHLY || "").trim()),
);
const freeAccess = ["1", "true", "on", "yes"].includes(flag)
  || (!["0", "false", "off", "no"].includes(flag) && !billingConfigured);

console.log(
  freeAccess
    ? `Access tier: every account gets Pro free (${flag ? "FOUNDING_FREE_ACCESS is set" : "no Stripe configuration, so nobody could pay"})`
    : "Access tier: paid tiers enforced — set FOUNDING_FREE_ACCESS=1 to give the product away",
);
if (!flag) {
  console.log("  FOUNDING_FREE_ACCESS is not set. Set it explicitly before configuring Stripe, "
    + "or access flips the day billing is turned on.");
}

console.log("Checklist: docs/CUSTOMER_LAUNCH_CHECKLIST.md");

if (hardMissing > 0) {
  process.exitCode = 1;
}
