// Who gets what.
//
// Every account is meant to get the whole product free. It did not: the flag
// that granted it lived in render.yaml, which this deployment does not read,
// and the fallback that would have covered for that switched itself off the
// moment Stripe was configured — which it is, in the dashboard, which the
// deployment does read. So every account except the allowlisted one sat on the
// free tier with most of the research terminal hidden, imports capped at four
// holdings and five AI questions a month, while the configuration file said the
// opposite.
//
// Nothing failed. Two reasonable mechanisms, each correct alone, combined into
// a product nobody could use. So the decision is now the default and this pins
// it: adding a Stripe key, deploying, or losing a variable must not take access
// away. Only switching it off on purpose does.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-ent-"));
const outDir = join(dir, "build");
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler",
    baseUrl: root, paths: { "@/*": ["./src/*"] },
    outDir, rootDir: join(root, "src"), skipLibCheck: true,
  },
  files: [join(root, "src/lib/db.ts")],
}));
try {
  execFileSync("npx", ["tsc", "-p", join(dir, "tsconfig.json")], { stdio: ["ignore", "pipe", "pipe"] });
} catch { /* emit anyway */ }

function rewriteSpecifiers(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) { rewriteSpecifiers(full); continue; }
    if (!full.endsWith(".js")) continue;
    writeFileSync(full, readFileSync(full, "utf8").replace(
      /(\bfrom\s*)(["'])([^"']+)\2/g,
      (match, lead, quote, spec) => {
        let target = spec;
        if (spec.startsWith("@/")) {
          target = relative(dirname(full), join(outDir, spec.slice(2))).replace(/\\/g, "/");
          if (!target.startsWith(".")) target = `./${target}`;
        } else if (!spec.startsWith(".")) return match;
        if (!/\.[cm]?js$/.test(target)) target += ".js";
        return `${lead}${quote}${target}${quote}`;
      },
    ));
  }
}
rewriteSpecifiers(outDir);

process.env.SQLITE_DB_PATH = join(dir, "test.sqlite");
const db = await import(join(outDir, "lib/db.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

/** Run with a given environment, then put it back. */
function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try { return fn(); } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const NO_BILLING = { FOUNDING_FREE_ACCESS: undefined, STRIPE_SECRET_KEY: undefined, STRIPE_PRO_PRICE_ID: undefined, STRIPE_PRICE_STARTER_MONTHLY: undefined };

// ── The default ────────────────────────────────────────────────────────────
{
  check("with nothing configured, access is granted",
    withEnv(NO_BILLING, () => db.isFoundingFreeAccess()) === true);

  // The exact shape of production: Stripe set in the host's dashboard, the
  // flag only ever present in a file the host ignores.
  check("configuring Stripe does not quietly take it away",
    withEnv({ ...NO_BILLING, STRIPE_SECRET_KEY: "sk_live_x", STRIPE_PRO_PRICE_ID: "price_x" },
      () => db.isFoundingFreeAccess()) === true);

  check("nor does a starter price on its own",
    withEnv({ ...NO_BILLING, STRIPE_SECRET_KEY: "sk_live_x", STRIPE_PRICE_STARTER_MONTHLY: "price_s" },
      () => db.isFoundingFreeAccess()) === true);

  check("an empty flag is not an off switch",
    withEnv({ ...NO_BILLING, FOUNDING_FREE_ACCESS: "" }, () => db.isFoundingFreeAccess()) === true);
}

// ── Turning it off is an act ───────────────────────────────────────────────
{
  for (const off of ["0", "false", "off", "no", "OFF", " No "]) {
    check(`FOUNDING_FREE_ACCESS=${JSON.stringify(off)} enforces paid tiers`,
      withEnv({ ...NO_BILLING, FOUNDING_FREE_ACCESS: off }, () => db.isFoundingFreeAccess()) === false);
  }
  for (const on of ["1", "true", "on", "yes"]) {
    check(`FOUNDING_FREE_ACCESS=${JSON.stringify(on)} still reads as on`,
      withEnv({ ...NO_BILLING, FOUNDING_FREE_ACCESS: on }, () => db.isFoundingFreeAccess()) === true);
  }
  // Anything unrecognised must not silently revoke access.
  check("an unrecognised value does not revoke access",
    withEnv({ ...NO_BILLING, FOUNDING_FREE_ACCESS: "maybe" }, () => db.isFoundingFreeAccess()) === true);
}

// ── What an account actually gets ──────────────────────────────────────────
{
  const user = db.createAuthUser(
    `ent-${Date.now()}@example.com`,
    "hash",
    "Ent",
    new Date().toISOString(),
  );
  const id = user.id;

  const granted = withEnv({ ...NO_BILLING, STRIPE_SECRET_KEY: "sk_live_x", STRIPE_PRO_PRICE_ID: "price_x" },
    () => db.readUserEntitlements(id));
  check("a brand new account is Pro, with Stripe configured and no flag",
    granted.planTier === "pro" && granted.proEnabled === true,
    `${granted.planTier} / proEnabled=${granted.proEnabled}`);

  const enforced = withEnv({ ...NO_BILLING, FOUNDING_FREE_ACCESS: "0", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_PRO_PRICE_ID: "price_x" },
    () => db.readUserEntitlements(id));
  check("and drops to the unpaid tier once it is switched off",
    enforced.proEnabled === false,
    `${enforced.planTier} / proEnabled=${enforced.proEnabled}`);
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll entitlement checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
