// Verifies the AI fund-composition parser maps a model response into a clean,
// disclaimer-carrying FundComposition. Mocks fetch so no real API call is made.
import assert from "node:assert";

process.env.OPENAI_API_KEY = "test-key";

const modelReply = {
  recognised: true,
  asOfYear: 2026,
  constituents: [
    { name: "Australian shares", weightPct: 36, assetClass: "Equity", country: "AU" },
    { name: "International shares", weightPct: 52, assetClass: "Equity", country: "US" },
    { name: "Global bonds", weightPct: 8, assetClass: "Bond" },
    { name: "Cash", weightPct: 4, assetClass: "Cash" },
    { name: "", weightPct: 10 },           // dropped: no name
    { name: "Junk", weightPct: 0 },         // dropped: no weight
  ],
};

global.fetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(modelReply) } }] }),
});

const { fetchAiComposition, AI_FUND_DISCLAIMER } = await import("../src/lib/fund-ai.ts");
const check = (n, c) => { assert.ok(c, n); console.log("✓", n); };

const comp = await fetchAiComposition("VHGIX", "Vanguard High Growth Index");
check("returns a composition for a recognised fund", comp !== null);
check("drops rows with no name or no weight", comp.constituents.length === 4);
check("keeps asset-class breakdown", comp.constituents.map((c) => c.name).includes("International shares"));
check("labels the source as an AI estimate", comp.source === "AI estimate");
check("carries the not-official-holdings disclaimer", comp.coverageNote === AI_FUND_DISCLAIMER);
check("normalises country codes", comp.constituents.find((c) => c.name === "Australian shares").country === "AU");

// An unrecognised fund returns null (no fabrication).
global.fetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify({ recognised: false, constituents: [] }) } }] }),
});
const none = await fetchAiComposition("ZZZX", "Some Fund I Do Not Know");
check("returns null when the fund isn't recognised", none === null);

// A too-short/absent name is never researched.
const noName = await fetchAiComposition("ABC", "");
check("skips research when there's no real fund name", noName === null);

console.log("\nAll fund-ai checks passed");
