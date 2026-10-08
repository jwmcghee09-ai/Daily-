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
// be discovered. Growth mode is the default: every account gets the whole
// product free unless FOUNDING_FREE_ACCESS is explicitly switched off. It is
// not conditional on Stripe — the previous version switched itself off the
// moment billing was configured, which quietly put every account on the free
// tier while the flag meant to prevent that sat in a file the host ignores.
const flag = String(process.env.FOUNDING_FREE_ACCESS || "").trim().toLowerCase();
const freeAccess = !["0", "false", "off", "no"].includes(flag);

console.log(
  freeAccess
    ? `Access tier: every account gets Pro free (${flag ? "FOUNDING_FREE_ACCESS is set" : "the default"})`
    : "Access tier: paid tiers enforced — FOUNDING_FREE_ACCESS is switched off",
);
if (freeAccess && !flag) {
  console.log("  This is the default. Set FOUNDING_FREE_ACCESS=0 when you start charging; "
    + "configuring Stripe alone will not change it.");
}

console.log("Checklist: docs/CUSTOMER_LAUNCH_CHECKLIST.md");

if (hardMissing > 0) {
  process.exitCode = 1;
}
