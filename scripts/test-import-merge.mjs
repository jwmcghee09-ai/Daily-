// Proves the "auto" import merges by ticker instead of replacing whole
// category buckets: adding a holding never wipes a category, and a ticker that
// changes category between imports is never double-counted.
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SQLITE_DB_PATH = join(mkdtempSync(join(tmpdir(), "spectre-merge-")), "test.sqlite");
const { saveImportMulti, readPortfolioState } = await import("../src/lib/db.ts");

const mk = (ticker, source, value, units = 1) => ({
  id: `seed-${source}-${ticker}`,
  source,
  account: "Acct",
  ticker,
  name: ticker,
  units,
  price: value / units,
  prevClose: value / units,
  value,
  costBase: value,
  costBaseKnown: false,
  sector: "",
  reportDate: "2026-01-01",
  importedAt: new Date().toISOString(),
});

const check = (name, cond) => { assert.ok(cond, name); console.log("✓", name); };
const U = "user-merge-test";

// Seed: AAPL (us) + GGF (a managed fund).
saveImportMulti(U, [mk("AAPL", "us", 1000), mk("GGF", "fund", 5000)]);
let s = readPortfolioState(U);
check("seeded two holdings", s.holdings.length === 2);

// Add one more fund — must KEEP AAPL and the existing GGF fund (no wiped bucket).
saveImportMulti(U, [mk("MGOC", "fund", 2000)]);
s = readPortfolioState(U);
check("adding a fund keeps existing holdings", s.holdings.map((h) => h.ticker).sort().join(",") === "AAPL,GGF,MGOC");

// Re-import AAPL, this time classified as a different category — must NOT double.
saveImportMulti(U, [mk("AAPL", "index", 1200)]);
s = readPortfolioState(U);
const aapls = s.holdings.filter((h) => h.ticker === "AAPL");
check("a ticker that changed category is not doubled", aapls.length === 1);
check("the moved ticker took the new category", aapls[0].source === "index");
check("the moved ticker's value was replaced, not added", aapls[0].value === 1200);

// Total reflects a clean merge: GGF 5000 + MGOC 2000 + AAPL 1200 = 8200.
const total = s.holdings.reduce((a, h) => a + h.value, 0);
check("portfolio total has no double-count", total === 8200);

console.log("\nAll import-merge checks passed");
