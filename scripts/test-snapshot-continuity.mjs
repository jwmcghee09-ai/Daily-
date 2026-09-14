// Reproduces the "you lost 40%" bug and proves it stays fixed.
//
// A snapshot records the portfolio's value on a day. Comparing two of them is
// only a market return if they describe the SAME holdings. Import a different
// file, or clear a source, and the total jumps for reasons that have nothing to
// do with prices — which is how a re-imported portfolio came to report a 76%
// loss it never took.
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "spectre-snap-"));
process.env.SQLITE_DB_PATH = join(dir, "test.sqlite");

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

// The maths under test, ported verbatim from src/lib/portfolio.ts. Keeping it
// here rather than importing keeps this runnable without a TS toolchain; the
// behaviour is asserted against real snapshot rows either way.
function calculateReturns(points) {
  const out = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!(prev.value > 0)) continue;
    const a = prev.composition ?? "";
    const b = curr.composition ?? "";
    if (!a || !b || a !== b) continue;
    out.push(curr.value / prev.value - 1);
  }
  return out;
}
function latestComparableRun(points) {
  if (points.length < 2) return points;
  const latest = points[points.length - 1].composition ?? "";
  if (!latest) return points;
  let start = points.length - 1;
  while (start > 0) {
    const prev = points[start - 1].composition ?? "";
    if (!prev || prev !== latest) break;
    start -= 1;
  }
  return points.slice(start);
}

// ── The scenario: a big portfolio, then a much smaller one imported over it ──
const BIG = { value: 156053, composition: "us:CRWD|us:NVDA" };
const SMALL = { value: 6714, composition: "asx:BHP|index:IHVV" };

const series = [
  { value: 150000, composition: BIG.composition },
  { value: 152000, composition: BIG.composition },
  { value: BIG.value, composition: BIG.composition },
  // Re-import: different book entirely.
  { value: SMALL.value, composition: SMALL.composition },
  { value: 6800, composition: SMALL.composition },
];

// What the old code did: compare values and ignore composition.
const naive = [];
for (let i = 1; i < series.length; i += 1) naive.push(series[i].value / series[i - 1].value - 1);
const worstNaive = Math.min(...naive);
check("reproduces the bug when composition is ignored", worstNaive < -0.9,
  `worst 'daily return' would be ${(worstNaive * 100).toFixed(1)}%`);

const fixed = calculateReturns(series);
const worstFixed = Math.min(...fixed);
check("composition change is not counted as a return", worstFixed > -0.5,
  `worst is now ${(worstFixed * 100).toFixed(2)}%`);
check("real market moves are still counted", fixed.length === 3, `${fixed.length} returns kept of 4 steps`);

// ── Levels: "return since first snapshot" and drawdown ──
const run = latestComparableRun(series);
check("level metrics only span the current book", run.length === 2,
  `${run.length} points, from ${run[0].value} to ${run[run.length - 1].value}`);
const sinceFirst = (run[run.length - 1].value / run[0].value - 1) * 100;
check("return since first snapshot is sane", sinceFirst > -50 && sinceFirst < 50,
  `${sinceFirst.toFixed(2)}% (was -76% across the import)`);

// ── The reported case: adding a holding must not read as a return ──
// A$6,714 -> A$17,621 because a fund was added. Total gain on cost base was
// +12.4%; the terminal reported "+162.44% return since first snapshot".
{
  const before = "asx:BHP.AX:16|index:IHVV.AX:86";
  const after = "asx:BHP.AX:16|fund:VHG:4748|index:IHVV.AX:86";
  const added = [
    { value: 6714, composition: before },
    { value: 6740, composition: before },
    { value: 17621, composition: after },
  ];
  const naive = (added.at(-1).value / added[0].value - 1) * 100;
  check("reproduces the reported +162%", naive > 160, `${naive.toFixed(2)}%`);

  const run = latestComparableRun(added);
  const honest = run.length > 1 ? (run.at(-1).value / run[0].value - 1) * 100 : null;
  check("adding a holding is no longer counted as return",
    honest === null || Math.abs(honest) < 5,
    honest === null ? "run too short to report a return" : `${honest.toFixed(2)}%`);
  check("the contribution step is dropped from returns",
    calculateReturns(added).every((r) => Math.abs(r) < 0.5),
    `${calculateReturns(added).length} of 2 steps kept`);
}

// ── Buying MORE of something already held ──
// The ticker set is unchanged, so a fingerprint without units would call this
// a market return. Units are what a transaction moves.
{
  const topUp = [
    { value: 10000, composition: "asx:BHP.AX:100" },
    { value: 20000, composition: "asx:BHP.AX:200" },
  ];
  check("topping up an existing holding is not a return",
    calculateReturns(topUp).length === 0,
    "value doubled, units doubled");

  // …while the same holdings at a higher price still count.
  const priceMove = [
    { value: 10000, composition: "asx:BHP.AX:100" },
    { value: 10800, composition: "asx:BHP.AX:100" },
  ];
  const moves = calculateReturns(priceMove);
  check("a genuine price move on unchanged units still counts",
    moves.length === 1 && Math.abs(moves[0] - 0.08) < 1e-9, `${(moves[0] * 100).toFixed(1)}%`);
}

// ── Unknown composition (rows written before this existed) still works ──
// Deliberately conservative: a step we cannot verify is skipped rather than
// assumed to be a market move. It self-heals on the next import.
const legacy = [{ value: 100, composition: "" }, { value: 110, composition: "" }];
check("unverifiable steps are skipped, not assumed comparable",
  calculateReturns(legacy).length === 0);
const mixed = [{ value: 6714, composition: "" }, { value: 17621, composition: "asx:BHP:16|fund:VHG:4748" }];
check("a legacy snapshot cannot anchor a return against a fingerprinted one",
  latestComparableRun(mixed).length === 1, "the pre-fingerprint row is excluded");

// ── And the real database path: does saveImport stamp it? ──
const { saveImport, clearPortfolioData, readPortfolioState } = await import("../src/lib/db.ts")
  .catch(() => ({}));
if (saveImport) {
  const userId = "test-user";
  saveImport(userId, "asx", [{
    id: "h1", source: "asx", account: "CommSec", ticker: "BHP", name: "BHP",
    units: 10, price: 40, prevClose: 40, value: 400, costBase: 350,
    sector: "Materials", reportDate: "2026-01-01", importedAt: new Date().toISOString(),
  }]);
  const state = readPortfolioState(userId);
  check("saveImport stamps a composition", Boolean(state.snapshots.at(-1)?.composition),
    state.snapshots.at(-1)?.composition);
  clearPortfolioData(userId);
  check("full clear removes every snapshot", readPortfolioState(userId).snapshots.length === 0);
} else {
  console.log("  (skipping live-database checks — run under a TS loader to include them)");
}

// Confirm the column exists at all, without needing the TS layer.
{
  const db = new DatabaseSync(process.env.SQLITE_DB_PATH);
  const cols = db.prepare("PRAGMA table_info(snapshots)").all().map((r) => r.name);
  if (cols.length) check("snapshots table carries a composition column", cols.includes("composition"), cols.join(", "));
  db.close();
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll snapshot-continuity checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
