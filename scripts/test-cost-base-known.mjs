// Proves that P/L is only ever computed from a cost base the user actually
// supplied — a screenshot/no-cost import must never fabricate gains from the
// post-import price drift that a live refresh introduces.
import assert from "node:assert";
import { parseRowsToHoldings, computeMetrics } from "../src/lib/portfolio.ts";

function check(name, cond) {
  assert.ok(cond, name);
  console.log("✓", name);
}

// 1) Import WITH a cost column -> cost base is known.
const withCost = parseRowsToHoldings(
  [{ ticker: "AAA", units: "10", price: "100", value: "1000", cost: "800" }],
  "us",
);
check("with-cost import parses one holding", withCost.length === 1);
check("with-cost holding is flagged known", withCost[0].costBaseKnown === true);
check("with-cost cost base is the supplied figure", withCost[0].costBase === 800);

// 2) Import WITHOUT a cost column (a screenshot) -> cost base is unknown and
//    defaulted to value.
const noCost = parseRowsToHoldings(
  [{ ticker: "BBB", units: "10", price: "100", value: "1000" }],
  "us",
);
check("no-cost import parses one holding", noCost.length === 1);
check("no-cost holding is flagged NOT known", noCost[0].costBaseKnown !== true);
check("no-cost cost base defaulted to value", noCost[0].costBase === noCost[0].value);

// 3) Simulate a price refresh: value drifts up while cost base stays frozen.
//    This is exactly the scenario that used to show a fake gain.
const drifted = { ...noCost[0], value: 1500 }; // live price rose since import
const knownDrift = { ...withCost[0], value: 1500 }; // same drift, real cost

const mUnknown = computeMetrics([drifted], []);
check("unknown-cost holding shows ZERO P/L after drift", mUnknown.pnl === 0);
check("unknown-cost holding shows 0% P/L after drift", mUnknown.pnlPct === 0);

const mKnown = computeMetrics([knownDrift], []);
check("known-cost holding shows REAL P/L (1500-800=700)", mKnown.pnl === 700);
check("known-cost holding shows real P/L %", Math.round(mKnown.pnlPct) === 88);

// 4) Mixed portfolio: only the known-cost holding contributes to P/L.
const mMixed = computeMetrics([drifted, knownDrift], []);
check("mixed portfolio P/L counts only the known holding", mMixed.pnl === 700);
check("mixed portfolio total value still counts both", mMixed.totalValue === 3000);

// 5) A managed fund with a long name and NO ticker, but a dollar value, must be
//    kept (with a short derived code), not dropped.
const fund = parseRowsToHoldings(
  [{ name: "Vanguard High Growth Index", units: "4748", value: "10736.65" }],
  "fund",
);
check("long-named fund is kept, not dropped", fund.length === 1);
check("fund gets a short derived code", fund[0].ticker.length >= 2 && fund[0].ticker.length <= 16);
check("fund keeps its stated market value", Math.round(fund[0].value) === 10737);

console.log("\nAll cost-base-known checks passed");
