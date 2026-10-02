// Per-holding risk. The property that matters most is that risk contributions
// sum to 100%: that is what makes the column answer "where is my risk?" rather
// than just ranking volatilities, and it is the part most easily broken by a
// plausible-looking change to the covariance maths.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-hr-"));
const outDir = join(dir, "build");
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler",
    baseUrl: root, paths: { "@/*": ["./src/*"] },
    outDir, rootDir: join(root, "src"), skipLibCheck: true,
  },
  files: [join(root, "src/lib/holding-risk.ts")],
}));
try {
  execFileSync("npx", ["tsc", "-p", join(dir, "tsconfig.json")], { stdio: ["ignore", "pipe", "pipe"] });
} catch { /* emit anyway */ }

const hr = await import(join(outDir, "lib/holding-risk.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};
const near = (a, b, tol = 1e-6) => a != null && Math.abs(a - b) <= tol;

// A deterministic pseudo-random walk, so runs are comparable.
function walk(n, vol, seed, drift = 0) {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    // Box-Muller for a normal from two uniforms.
    const u1 = Math.max(rnd(), 1e-9), u2 = rnd();
    out.push(drift + vol * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
  }
  return out;
}

const DATES = Array.from({ length: 160 }, (_, i) =>
  new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

const toMap = (arr) => new Map(DATES.map((d, i) => [d, arr[i]]));

// ── Contributions sum to the whole ────────────────────────────────────────
{
  const returns = new Map([
    ["AAA", toMap(walk(160, 0.01, 1))],
    ["BBB", toMap(walk(160, 0.02, 2))],
    ["CCC", toMap(walk(160, 0.005, 3))],
  ]);
  const holdings = [
    { key: "AAA", ticker: "AAA", label: "AAA", value: 5000 },
    { key: "BBB", ticker: "BBB", label: "BBB", value: 3000 },
    { key: "CCC", ticker: "CCC", label: "CCC", value: 2000 },
  ];
  const r = hr.computeHoldingRisk(holdings, returns, DATES);
  check("one row per holding", r.length === 3, `${r.length} rows`);
  const sum = r.reduce((s, x) => s + (x.riskContributionPct ?? 0), 0);
  check("risk contributions sum to 100%", near(sum, 100, 1e-6), `${sum.toFixed(6)}%`);
  const weights = r.reduce((s, x) => s + x.weightPct, 0);
  check("weights sum to 100%", near(weights, 100, 1e-9), `${weights}%`);
  check("sorted by risk contribution, largest first",
    r.every((x, i) => i === 0 || (r[i - 1].riskContributionPct ?? 0) >= (x.riskContributionPct ?? 0)),
    r.map((x) => `${x.ticker} ${x.riskContributionPct.toFixed(1)}%`).join("  "));
}

// ── The headline claim: contribution ranks differently from volatility ────
{
  // A small, wild holding against a large, calm one. Weight alone says the big
  // one dominates; volatility alone says the small one does. Only contribution
  // weighs both, and it is the answer worth showing.
  const returns = new Map([
    ["CALM", toMap(walk(160, 0.004, 11))],
    ["WILD", toMap(walk(160, 0.05, 12))],
  ]);
  const r = hr.computeHoldingRisk(
    [{ key: "CALM", ticker: "CALM", label: "Calm", value: 9000 }, { key: "WILD", ticker: "WILD", label: "Wild", value: 1000 }],
    returns, DATES);
  const calm = r.find((x) => x.ticker === "CALM");
  const wild = r.find((x) => x.ticker === "WILD");
  check("a 10% holding can out-contribute a 90% one",
    wild.riskContributionPct > calm.riskContributionPct,
    `WILD ${wild.riskContributionPct.toFixed(1)}% of risk on ${wild.weightPct}% of value`);
  check("risk per unit of weight exposes it", wild.riskPerUnitWeight > 3,
    `${wild.riskPerUnitWeight.toFixed(2)}x its weight`);
  check("and the calm majority reads below its weight", calm.riskPerUnitWeight < 1,
    `${calm.riskPerUnitWeight.toFixed(2)}x`);
}

// ── A hedge should contribute little or negative risk ─────────────────────
{
  const base = walk(160, 0.02, 21);
  const inverse = base.map((x) => -x);   // moves exactly opposite
  const returns = new Map([["LONG", toMap(base)], ["HEDGE", toMap(inverse)]]);
  const r = hr.computeHoldingRisk(
    [{ key: "LONG", ticker: "LONG", label: "Long", value: 7000 }, { key: "HEDGE", ticker: "HEDGE", label: "Hedge", value: 3000 }],
    returns, DATES);
  const hedge = r.find((x) => x.ticker === "HEDGE");
  check("a holding moving opposite the book contributes negative risk",
    hedge.riskContributionPct < 0, `${hedge.riskContributionPct.toFixed(1)}%`);
  check("and is reported as inversely correlated",
    hedge.correlationToPortfolio < -0.9, `r=${hedge.correlationToPortfolio.toFixed(3)}`);
  const sum = r.reduce((s, x) => s + x.riskContributionPct, 0);
  check("contributions still sum to 100% with a hedge present", near(sum, 100, 1e-6), `${sum.toFixed(4)}%`);
}

// ── Beta is measured against the benchmark, not the book ──────────────────
{
  const bm = walk(160, 0.01, 31);
  const double = bm.map((x) => x * 2);      // beta 2 by construction
  const returns = new Map([["LEV", toMap(double)], ["IDX", toMap(bm)]]);
  const r = hr.computeHoldingRisk(
    [{ key: "LEV", ticker: "LEV", label: "Leveraged", value: 5000 }, { key: "IDX", ticker: "IDX", label: "Index", value: 5000 }],
    returns, DATES, toMap(bm));
  check("a holding that moves twice the benchmark has beta 2",
    near(r.find((x) => x.ticker === "LEV").betaToBenchmark, 2, 1e-9),
    String(r.find((x) => x.ticker === "LEV").betaToBenchmark));
  check("the benchmark itself has beta 1",
    near(r.find((x) => x.ticker === "IDX").betaToBenchmark, 1, 1e-9),
    String(r.find((x) => x.ticker === "IDX").betaToBenchmark));
}

// ── Volatility is annualised consistently ─────────────────────────────────
{
  // A constant daily move has zero standard deviation, so a flat series must
  // report zero volatility rather than something small and arbitrary.
  const flat = Array(160).fill(0.001);
  const r = hr.computeHoldingRisk(
    [{ key: "FLAT", ticker: "FLAT", label: "Flat", value: 1000 }], new Map([["FLAT", toMap(flat)]]), DATES);
  check("a series with no variation has zero volatility",
    near(r[0].volatilityAnnualPct, 0, 1e-9), String(r[0].volatilityAnnualPct));
  check("and no drawdown, since it only rises",
    near(r[0].maxDrawdownPct, 0, 1e-9), String(r[0].maxDrawdownPct));
}
{
  // A long run, so the sample standard deviation converges on the true one.
  // The dates and the series must be built from the same length — keyed on a
  // shorter date set, every lookup misses and the series reads as flat.
  const vol = 0.01;
  const longDates = Array.from({ length: 2000 }, (_, i) =>
    new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10));
  const longSeries = walk(2000, vol, 41);
  const r = hr.computeHoldingRisk(
    [{ key: "V", ticker: "V", label: "V", value: 1000 }],
    new Map([["V", new Map(longDates.map((d, i) => [d, longSeries[i]]))]]),
    longDates);
  const expected = vol * Math.sqrt(252) * 100;
  check("annualised volatility matches sqrt(252) scaling",
    Math.abs(r[0].volatilityAnnualPct - expected) < expected * 0.08,
    `${r[0].volatilityAnnualPct.toFixed(1)}% vs ${expected.toFixed(1)}% expected`);
}

// ── Degenerate input must not produce a confident wrong number ────────────
{
  const r = hr.computeHoldingRisk([], new Map(), DATES);
  check("an empty portfolio returns no rows", r.length === 0);
}
{
  const r = hr.computeHoldingRisk(
    [{ key: "X", ticker: "X", label: "X", value: 1000 }], new Map(), DATES);
  check("a holding with no price history is kept, with nulls",
    r.length === 1 && r[0].volatilityAnnualPct === null && r[0].pointsUsed === 0,
    JSON.stringify({ vol: r[0]?.volatilityAnnualPct, pts: r[0]?.pointsUsed }));
  check("but its weight is still reported", near(r[0].weightPct, 100));
}
{
  const r = hr.computeHoldingRisk(
    [{ key: "A", ticker: "A", label: "A", value: 0 }, { key: "B", ticker: "B", label: "B", value: 0 }],
    new Map([["A", toMap(walk(160, 0.01, 51))]]), DATES);
  check("a portfolio with no value returns no rows rather than dividing by zero", r.length === 0);
}
{
  const short = ["2026-01-01", "2026-01-02", "2026-01-03"];
  const r = hr.computeHoldingRisk(
    [{ key: "S", ticker: "S", label: "S", value: 100 }],
    new Map([["S", new Map(short.map((d, i) => [d, 0.01 * (i + 1)]))]]), short);
  check("too few points leaves VaR null rather than guessing",
    r[0].var95Pct === null && r[0].cvar95Pct === null,
    `var=${r[0].var95Pct} cvar=${r[0].cvar95Pct}`);
  check("but volatility, which needs only two points, is still given",
    r[0].volatilityAnnualPct != null);
}

// ── Every number that is returned is a real number ────────────────────────
{
  const returns = new Map([
    ["A", toMap(walk(160, 0.01, 61))],
    ["B", toMap(Array(160).fill(0))],          // never moves
    ["C", toMap(walk(160, 0.09, 63, -0.004))], // falls hard
  ]);
  const r = hr.computeHoldingRisk(
    [{ key: "A", ticker: "A", label: "A", value: 4000 }, { key: "B", ticker: "B", label: "B", value: 3000 },
     { key: "C", ticker: "C", label: "C", value: 3000 }], returns, DATES);
  const bad = [];
  for (const row of r) {
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === "number" && !Number.isFinite(v)) bad.push(`${row.ticker}.${k}=${v}`);
    }
  }
  check("no NaN or Infinity anywhere in the output", bad.length === 0, bad.join(", "));
  const still = r.find((x) => x.ticker === "B");
  check("a holding that never moves contributes no risk",
    near(still.riskContributionPct, 0, 1e-9), `${still.riskContributionPct}`);
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll holding-risk checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
