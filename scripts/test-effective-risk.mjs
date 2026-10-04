// Decomposing a fund into the securities inside it, for risk.
//
// The claim this makes is strong and worth pinning down: measuring risk on the
// securities rather than the wrappers must not change the portfolio's own
// volatility or VaR, because it is the same portfolio. Only the attribution
// moves. The arithmetic that makes that true is one subtraction —
//
//     r_tail = (r_fund - SUM w_i * r_i) / tailShare
//
// — and if it is wrong the error is invisible: every figure still computes, the
// risk contributions still sum to 100%, and the portfolio's volatility quietly
// drifts away from what the account actually did. So the invariant is asserted
// directly: blend the pieces back together and the fund's own return must come
// out, to floating-point tolerance.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-eff-"));
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

// db.ts opens SQLite on load, so give it somewhere disposable to do it.
process.env.SQLITE_DB_PATH = join(dir, "test.sqlite");
const db = await import(join(outDir, "lib/db.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const series = (values, from = 0) =>
  new Map(values.map((v, i) => [`2026-0${1 + Math.floor((from + i) / 28)}-${String(((from + i) % 28) + 1).padStart(2, "0")}`, v]));

// ── The invariant ──────────────────────────────────────────────────────────
{
  // A fund that is 30% Apple, 20% Microsoft and 50% everything else, where
  // "everything else" moved in a way we never observe directly.
  const apple = series([0.01, -0.02, 0.015, 0.004, -0.009]);
  const msft = series([0.005, -0.01, 0.02, -0.001, 0.012]);
  const trueTail = [0.002, -0.004, 0.006, 0.001, -0.003];

  const dates = [...apple.keys()];
  const fund = new Map(dates.map((d, i) =>
    [d, 0.3 * apple.get(d) + 0.2 * msft.get(d) + 0.5 * trueTail[i]]));

  const tail = db.deriveTailReturns(
    fund,
    [{ weight: 0.3, returns: apple }, { weight: 0.2, returns: msft }],
    0.5,
  );

  check("the tail is recovered for every date the constituents cover",
    tail.size === dates.length, `${tail.size} of ${dates.length}`);
  check("and it is the series that was actually there",
    dates.every((d, i) => near(tail.get(d), trueTail[i])),
    dates.map((d) => tail.get(d)?.toFixed(6)).join(", "));

  // The point of the whole exercise: blending the pieces reproduces the fund,
  // so the portfolio's own risk figures cannot move.
  check("blending the pieces back gives the fund's own return",
    dates.every((d, i) =>
      near(0.3 * apple.get(d) + 0.2 * msft.get(d) + 0.5 * tail.get(d), fund.get(d))),
    "exact to 1e-9");
}

// ── Where it must refuse ───────────────────────────────────────────────────
{
  const a = series([0.01, 0.02, 0.03]);
  const fund = series([0.01, 0.02, 0.03]);

  check("no tail share means no tail, rather than dividing by zero",
    db.deriveTailReturns(fund, [{ weight: 1, returns: a }], 0).size === 0);
  check("a negative tail share is refused too",
    db.deriveTailReturns(fund, [{ weight: 1, returns: a }], -0.2).size === 0);

  // A constituent missing a day cannot be subtracted on that day, and charging
  // the whole gap to the tail would invent a move the fund did not make.
  const gappy = new Map(a);
  gappy.delete([...a.keys()][1]);
  const partial = db.deriveTailReturns(fund, [{ weight: 0.5, returns: gappy }], 0.5);
  check("a date a constituent is missing is dropped, not charged to the tail",
    partial.size === 2, `${partial.size} of 3 dates`);

  const nonFinite = new Map(a);
  nonFinite.set([...a.keys()][0], Number.NaN);
  check("a non-finite constituent return does not poison the series",
    db.deriveTailReturns(fund, [{ weight: 0.5, returns: nonFinite }], 0.5).size === 2);
}

// ── Scale ──────────────────────────────────────────────────────────────────
{
  /*
   * The amplification that makes a small tail share unusable, stated as a
   * test so the reason the builder keeps a fund whole below the floor is not
   * just a comment. The same unexplained move divided by a tenth instead of a
   * half reads five times as large.
   */
  const flat = series([0, 0, 0]);
  const drift = series([0.001, 0.001, 0.001]);
  const half = db.deriveTailReturns(drift, [{ weight: 0.5, returns: flat }], 0.5);
  const tenth = db.deriveTailReturns(drift, [{ weight: 0.9, returns: flat }], 0.1);
  const first = (m) => m.get([...m.keys()][0]);
  check("an unexplained move is amplified by 1/tailShare",
    near(first(half), 0.002) && near(first(tenth), 0.01),
    `${first(half)} at half, ${first(tenth)} at a tenth`);
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll effective-risk checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
