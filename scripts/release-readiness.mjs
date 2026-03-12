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
console.log("Checklist: docs/CUSTOMER_LAUNCH_CHECKLIST.md");

if (hardMissing > 0) {
  process.exitCode = 1;
}
