// Look-through maths. The failure this guards against is subtle and one-sided:
// if resolution silently loses or double-counts value, the portfolio total moves
// and every weight derived from it is wrong — but nothing errors, and the page
// still renders a confident number. So the totals are asserted on every case.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-lt-"));
const outDir = join(dir, "build");
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler",
    baseUrl: root, paths: { "@/*": ["./src/*"] },
    outDir, rootDir: join(root, "src"), skipLibCheck: true,
  },
  files: [join(root, "src/lib/lookthrough.ts")],
}));
try {
  execFileSync("npx", ["tsc", "-p", join(dir, "tsconfig.json")], { stdio: ["ignore", "pipe", "pipe"] });
} catch { /* emit anyway */ }

const lt = await import(join(outDir, "lib/lookthrough.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

const fund = (ticker, constituents, extra = {}) => [
  ticker,
  { fundTicker: ticker, constituents, source: "test", asOf: "2026-06-30", ...extra },
];
const hold = (ticker, value, name = ticker) => ({ ticker, name, value });

// ── Identity ──────────────────────────────────────────────────────────────
{
  check("an ISIN wins over a ticker, so two sources agree on one security",
    lt.constituentKey({ isin: "US0378331005", ticker: "AAPL", name: "Apple" })
    === lt.constituentKey({ isin: "US0378331005", name: "APPLE INC" }));
  check("a CUSIP is used when there is no ISIN",
    lt.constituentKey({ cusip: "037833100", name: "Apple" }).startsWith("cusip:"));
  check("BHP and BHP.AX are the same company",
    lt.constituentKey({ ticker: "BHP.AX", name: "BHP" })
    === lt.constituentKey({ ticker: "BHP", name: "BHP Group" }));
  check("name matching survives legal suffixes and share classes",
    lt.normaliseName("Apple Inc.") === lt.normaliseName("APPLE INC")
    && lt.normaliseName("Alphabet Inc Class A") === lt.normaliseName("Alphabet"));
  check("different companies do not collide",
    lt.constituentKey({ name: "BHP Group" }) !== lt.constituentKey({ name: "Rio Tinto" }));
}

// ── Value is conserved ────────────────────────────────────────────────────
{
  const compositions = new Map([
    fund("VAS", [
      { name: "BHP Group", ticker: "BHP", weightPct: 10 },
      { name: "CBA", ticker: "CBA", weightPct: 9 },
      { name: "CSL", ticker: "CSL", weightPct: 6 },
    ]),
  ]);
  const r = lt.buildEffectiveBook([hold("VAS", 10000), hold("BHP", 5000)], compositions);
  check("the portfolio total is unchanged by resolution", near(r.totalValue, 15000), String(r.totalValue));
  const sumOfPositions = r.positions.reduce((s, p) => s + p.value, 0);
  check("the resolved positions sum back to the total", near(sumOfPositions, 15000), String(sumOfPositions));
  check("weights sum to 100%", near(r.positions.reduce((s, p) => s + p.weightPct, 0), 100, 1e-9));
}

// ── Weights that do not sum to 100 ────────────────────────────────────────
{
  // Real issuer files are rounded, and some report only the top holdings.
  const compositions = new Map([
    fund("TOP10", [
      { name: "A", ticker: "A", weightPct: 20 },
      { name: "B", ticker: "B", weightPct: 15 },
    ]),
  ]);
  const r = lt.buildEffectiveBook([hold("TOP10", 1000)], compositions);
  check("a fund reporting only 35% of itself still places its whole value",
    near(r.totalValue, 1000) && near(r.positions.reduce((s, p) => s + p.value, 0), 1000));
  const a = r.positions.find((p) => p.ticker === "A");
  check("and does so in the reported proportions", near(a.value, 1000 * (20 / 35)), String(a?.value));
}

// ── The headline: concentration hidden inside funds ───────────────────────
{
  const compositions = new Map([
    fund("VAS", [{ name: "BHP Group", ticker: "BHP", weightPct: 10 }, { name: "CBA", ticker: "CBA", weightPct: 90 }]),
    fund("A200", [{ name: "BHP Group", ticker: "BHP", weightPct: 10 }, { name: "CBA", ticker: "CBA", weightPct: 90 }]),
  ]);
  const holdings = [hold("BHP", 1000), hold("VAS", 5000), hold("A200", 4000)];
  const r = lt.buildEffectiveBook(holdings, compositions);

  const bhp = r.positions.find((p) => p.ticker === "BHP");
  // 1000 direct + 10% of 5000 + 10% of 4000 = 1900 of 10000
  check("true exposure counts the direct parcel and every fund slice",
    near(bhp.value, 1900) && near(bhp.weightPct, 19), `${bhp?.value} (${bhp?.weightPct}%)`);
  check("a security held both ways is still marked as directly held", bhp.direct === true);
  check("and names the funds it also arrives through",
    bhp.via.map((v) => v.fundTicker).sort().join(",") === "A200,VAS");

  const hidden = lt.hiddenConcentration(r, holdings);
  const bhpHidden = hidden.find((h) => h.ticker === "BHP");
  check("hidden concentration reports direct vs effective",
    near(bhpHidden.directPct, 10) && near(bhpHidden.effectivePct, 19),
    `${bhpHidden?.directPct}% direct vs ${bhpHidden?.effectivePct}% real`);

  check("HHI measured on securities, not on wrappers",
    near(lt.effectiveHhi(r.positions), 19 * 19 + 81 * 81, 1e-6),
    String(Math.round(lt.effectiveHhi(r.positions))));
}

// ── Overlap ───────────────────────────────────────────────────────────────
{
  const same = [{ name: "BHP", ticker: "BHP", weightPct: 50 }, { name: "CBA", ticker: "CBA", weightPct: 50 }];
  const compositions = new Map([fund("VAS", same), fund("A200", same)]);
  const r = lt.buildEffectiveBook([hold("VAS", 5000), hold("A200", 5000)], compositions);
  check("two trackers of the same index overlap completely",
    r.overlaps.length === 1 && near(r.overlaps[0].overlapPct, 100), `${r.overlaps[0]?.overlapPct}%`);
}
{
  const compositions = new Map([
    fund("AUS", [{ name: "BHP", ticker: "BHP", weightPct: 100 }]),
    fund("USA", [{ name: "Apple", ticker: "AAPL", weightPct: 100 }]),
  ]);
  const r = lt.buildEffectiveBook([hold("AUS", 5000), hold("USA", 5000)], compositions);
  check("funds with nothing in common report no overlap", r.overlaps.length === 0);
}
{
  // Overlap is measured against the smaller position: the question is whether
  // the second fund adds anything, not how big it happens to be.
  const compositions = new Map([
    fund("BIG", [{ name: "BHP", ticker: "BHP", weightPct: 100 }]),
    fund("SMALL", [{ name: "BHP", ticker: "BHP", weightPct: 100 }]),
  ]);
  const r = lt.buildEffectiveBook([hold("BIG", 9000), hold("SMALL", 1000)], compositions);
  check("a small fund fully duplicated by a large one reads as 100% overlap",
    near(r.overlaps[0].overlapPct, 100), `${r.overlaps[0]?.overlapPct}%`);
}

// ── Degrading rather than losing money ────────────────────────────────────
{
  const r = lt.buildEffectiveBook([hold("MYSTERY", 7000), hold("BHP", 3000)], new Map());
  check("an unknown ticker is kept whole, not dropped",
    near(r.totalValue, 10000) && near(r.positions.reduce((s, p) => s + p.value, 0), 10000));
  check("nothing is reported as resolved when nothing was", near(r.resolvedValue, 0));
}
{
  const compositions = new Map([fund("EMPTY", [])]);
  const r = lt.buildEffectiveBook([hold("EMPTY", 1000)], compositions);
  check("a fund that reports no constituents keeps its value", near(r.totalValue, 1000));
  check("and is named as unresolved rather than silently passed over",
    r.unresolved.length === 1 && r.unresolved[0].ticker === "EMPTY", JSON.stringify(r.unresolved[0]));
}
{
  const compositions = new Map([fund("ZEROW", [{ name: "X", ticker: "X", weightPct: 0 }])]);
  const r = lt.buildEffectiveBook([hold("ZEROW", 1000)], compositions);
  check("weights that are all zero do not divide by zero",
    near(r.totalValue, 1000) && r.unresolved.length === 1, JSON.stringify(r.unresolved[0]?.reason));
}
{
  const r = lt.buildEffectiveBook([], new Map());
  check("an empty portfolio produces an empty book, not NaN",
    r.totalValue === 0 && r.positions.length === 0 && r.overlaps.length === 0);
}
{
  const r = lt.buildEffectiveBook(
    [hold("A", -500), hold("B", 0), hold("C", Number.NaN), hold("D", 1000)], new Map());
  check("non-positive and non-finite values are ignored, not propagated",
    near(r.totalValue, 1000) && r.positions.length === 1, String(r.totalValue));
}

// ── Exposure rollups ──────────────────────────────────────────────────────
{
  const compositions = new Map([
    fund("GLOBAL", [
      { name: "Apple", ticker: "AAPL", weightPct: 50, country: "US", sector: "Tech", assetClass: "EC" },
      { name: "BHP", ticker: "BHP", weightPct: 30, country: "AU", sector: "Materials", assetClass: "EC" },
      { name: "Cash", weightPct: 20, assetClass: "STIV" },
    ]),
  ]);
  const r = lt.buildEffectiveBook([hold("GLOBAL", 10000)], compositions);
  const byCountry = lt.exposureBy(r.positions, "country");
  check("country exposure comes from the constituents",
    byCountry[0].label === "US" && near(byCountry[0].pct, 50), JSON.stringify(byCountry[0]));
  check("constituents with no country are labelled, not dropped",
    byCountry.some((x) => x.label === "Unclassified" && near(x.pct, 20)),
    JSON.stringify(byCountry));
  const byAsset = lt.exposureBy(r.positions, "assetClass");
  check("asset-class exposure separates the cash sleeve",
    byAsset.find((x) => x.label === "STIV")?.pct === 20, JSON.stringify(byAsset));
}

// ── A fund of funds must not be double counted ────────────────────────────
{
  // The same security reached through two different wrappers is one position
  // whose value is the sum — never two lines, and never counted twice.
  const compositions = new Map([
    fund("F1", [{ name: "Apple Inc", isin: "US0378331005", weightPct: 100 }]),
    fund("F2", [{ name: "APPLE INC.", isin: "US0378331005", weightPct: 100 }]),
  ]);
  const r = lt.buildEffectiveBook([hold("F1", 3000), hold("F2", 2000)], compositions);
  const apple = r.positions.filter((p) => p.isin === "US0378331005");
  check("one security, one line", apple.length === 1, `${apple.length} lines`);
  check("holding the full value", near(apple[0].value, 5000), String(apple[0]?.value));
  check("and the total is still right", near(r.totalValue, 5000));
}

// ── One company, two identifier shapes ────────────────────────────────────
{
  // The real case this was written for: N-PORT reports Apple with an ISIN and
  // no ticker, the user holds AAPL with a ticker and no ISIN. Keyed on
  // identifiers alone those are two positions, and the book reports less Apple
  // than it holds — understating concentration, which is the one direction a
  // risk number must never be wrong in.
  const compositions = new Map([
    fund("SP500", [
      { name: "Apple, Inc.", isin: "US0378331005", weightPct: 50 },
      { name: "Microsoft Corp.", isin: "US5949181045", weightPct: 50 },
    ]),
  ]);
  const holdings = [hold("SP500", 8000), hold("AAPL", 2000, "Apple Inc")];
  const r = lt.buildEffectiveBook(holdings, compositions);

  const apples = r.positions.filter((p) => lt.normaliseName(p.name) === "APPLE");
  check("a direct ticker and a fund's ISIN resolve to one company",
    apples.length === 1, `${apples.length} Apple lines: ${apples.map((a) => `${a.name} ${a.weightPct}%`).join(" | ")}`);
  // 2000 direct + 50% of 8000 = 6000 of 10000
  check("and its weight is the direct parcel plus the fund slice",
    near(apples[0].value, 6000) && near(apples[0].weightPct, 60), `${apples[0]?.weightPct}%`);
  check("still marked as held directly", apples[0].direct === true);
  check("the portfolio total is unaffected by the merge", near(r.totalValue, 10000));
}
{
  // Share classes of one issuer are one exposure: they move together, so
  // counting them separately would read as diversification that is not there.
  const compositions = new Map([
    fund("IDX", [
      { name: "Alphabet Inc Class A", isin: "US02079K3059", weightPct: 50 },
      { name: "Alphabet Inc Class C", isin: "US02079K1079", weightPct: 50 },
    ]),
  ]);
  const r = lt.buildEffectiveBook([hold("IDX", 1000)], compositions);
  check("two share classes of one issuer are one position",
    r.positions.length === 1 && near(r.positions[0].weightPct, 100),
    `${r.positions.length} lines`);
}
{
  // The merge must not reach across genuinely different issuers.
  const compositions = new Map([
    fund("IDX", [
      { name: "Apple Inc", isin: "US0378331005", weightPct: 50 },
      { name: "Apple Hospitality REIT Inc", isin: "US03784Y2000", weightPct: 50 },
    ]),
  ]);
  const r = lt.buildEffectiveBook([hold("IDX", 1000)], compositions);
  check("similarly-named but different issuers stay apart",
    r.positions.length === 2, `${r.positions.length} lines`);
}
{
  // Overlap is computed from the same merged keys, so two funds holding one
  // company under different identifier shapes still register as overlapping.
  const compositions = new Map([
    fund("F1", [{ name: "Apple Inc", isin: "US0378331005", weightPct: 100 }]),
    fund("F2", [{ name: "Apple, Inc.", ticker: "AAPL", weightPct: 100 }]),
  ]);
  const r = lt.buildEffectiveBook([hold("F1", 5000), hold("F2", 5000)], compositions);
  check("overlap follows the merge rather than the raw identifiers",
    r.overlaps.length === 1 && near(r.overlaps[0].overlapPct, 100),
    `${r.overlaps.length} overlap(s) at ${r.overlaps[0]?.overlapPct}%`);
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll look-through checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
