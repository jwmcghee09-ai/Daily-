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

// Entitlements fail closed: with this unset, every account resolves to
// planTier "none". That is the right default for a variable going missing, but
// it means the growth-mode giveaway has to be stated out loud, so say plainly
// which way this deployment is pointed rather than leaving it to be discovered.
const freeAccess = ["1", "true", "on", "yes"]
  .includes(String(process.env.FOUNDING_FREE_ACCESS || "").trim().toLowerCase());
console.log(
  freeAccess
    ? "Access tier: FOUNDING_FREE_ACCESS is on — every account gets Pro free"
    : "Access tier: paid tiers enforced — set FOUNDING_FREE_ACCESS=1 to give the product away",
);

console.log("Checklist: docs/CUSTOMER_LAUNCH_CHECKLIST.md");

if (hardMissing > 0) {
  process.exitCode = 1;
}
