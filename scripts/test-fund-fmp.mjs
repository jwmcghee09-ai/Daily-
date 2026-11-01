// Holdings from the structured vendor feed.
//
// This is the one new source that returns actual holdings rather than just
// pointing at where to find them, so it carries the most risk and gets the most
// scrutiny. The thing being pinned down is that it never turns a bad response
// into a confident portfolio: no key, a gated tier, a rate limit, an empty body
// or rows it cannot read must all come back as null — "upload the file" — and
// never as a fund resolved to nothing or to garbage. The happy path is checked
// too: reported weights, weights derived from value, partial coverage carried
// as partial, and totals/cash lines dropped.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-fmp-"));
const outDir = join(dir, "build");
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler",
    baseUrl: root, paths: { "@/*": ["./src/*"] },
    outDir, rootDir: join(root, "src"), skipLibCheck: true,
  },
  files: [join(root, "src/lib/fund-fmp.ts"), join(root, "src/lib/lookthrough.ts")],
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

const { fetchFmpHoldings } = await import(join(outDir, "lib/fund-fmp.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures += 1;
};
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const realFetch = globalThis.fetch;
let lastUrl = "";
function stub(status, body) {
  globalThis.fetch = async (url) => {
    lastUrl = String(url);
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}
process.env.FMP_API_KEY = "test-key";

// ── The guards: a bad answer is never a portfolio ───────────────────────────
{
  const saved = process.env.FMP_API_KEY;
  delete process.env.FMP_API_KEY;
  stub(200, []);
  const noKey = await fetchFmpHoldings("QQQ");
  check("no API key resolves nothing, rather than reaching out", noKey === null && lastUrl === "");
  process.env.FMP_API_KEY = saved;

  stub(402, { error: "premium" });
  check("a premium gate (402) is null, not a fund with no holdings", (await fetchFmpHoldings("QQQ")) === null);

  stub(429, { error: "rate" });
  check("a rate limit (429) is null", (await fetchFmpHoldings("QQQ")) === null);

  stub(200, []);
  check("an empty body is null", (await fetchFmpHoldings("QQQ")) === null);

  stub(200, { not: "an array" });
  check("a non-array body is null", (await fetchFmpHoldings("QQQ")) === null);

  globalThis.fetch = async () => { throw new Error("network down"); };
  check("a thrown network error is null, never a throw", (await fetchFmpHoldings("QQQ")) === null);

  stub(200, [{ foo: "bar" }, { baz: 1 }]);
  check("rows with no name and no ticker resolve to null", (await fetchFmpHoldings("QQQ")) === null);
}

// ── The happy path: reported weights ────────────────────────────────────────
{
  // A complete set: two holdings whose reported weights sum to ~100, plus the
  // totals and cash lines a real file carries, which must be dropped.
  stub(200, [
    { asset: "AAPL", name: "Apple Inc", isin: "US0378331005", weightPercentage: 52.4, country: "US", sector: "Technology", updated: "2026-10-31" },
    { asset: "MSFT", name: "Microsoft Corp", weightPercentage: 47.3, country: "United States", sector: "Technology" },
    { asset: "", name: "Total", weightPercentage: 100 },
    { asset: "", name: "Cash & Other", weightPercentage: 0.3 },
  ]);
  const comp = await fetchFmpHoldings("QQQ");
  check("a normal response resolves", comp !== null);
  check("the endpoint asked is stable /etf/holdings with the symbol",
    /\/stable\/etf\/holdings\?symbol=QQQ/.test(lastUrl), lastUrl.replace(/apikey=[^&]*/, "apikey=***"));
  check("the totals line is dropped", comp && !comp.constituents.some((c) => /total/i.test(c.name)));
  check("the cash line is dropped", comp && !comp.constituents.some((c) => /cash/i.test(c.name)));
  check("two real holdings remain", comp && comp.constituents.length === 2, String(comp?.constituents.length));

  const aapl = comp?.constituents.find((c) => c.ticker === "AAPL");
  check("Apple carries its reported weight", aapl && near(aapl.weightPct, 52.4), String(aapl?.weightPct));
  check("and its ISIN", aapl && aapl.isin === "US0378331005", String(aapl?.isin));
  check("a two-letter country is kept", aapl && aapl.country === "US", String(aapl?.country));

  const msft = comp?.constituents.find((c) => c.ticker === "MSFT");
  check("a full country name is dropped, not turned into a bad bucket",
    msft && msft.country === undefined, String(msft?.country));

  check("the reported date is carried, not the fetch time", comp && comp.asOf === "2026-10-31", String(comp?.asOf));
  check("a complete set is not marked partial", comp && comp.coveragePct === undefined, String(comp?.coveragePct));
  check("the source names FMP", comp && /financial modeling prep/i.test(comp.source), comp?.source);
}

// ── Weights derived from value when none are reported ────────────────────────
{
  stub(200, [
    { asset: "AAA", name: "Alpha", marketValue: 600 },
    { asset: "BBB", name: "Beta", marketValue: 400 },
  ]);
  const comp = await fetchFmpHoldings("XYZ");
  const a = comp?.constituents.find((c) => c.ticker === "AAA");
  const b = comp?.constituents.find((c) => c.ticker === "BBB");
  check("with no weights, they are derived from market value",
    a && b && near(a.weightPct, 60, 0.1) && near(b.weightPct, 40, 0.1),
    `${a?.weightPct?.toFixed(1)} / ${b?.weightPct?.toFixed(1)}`);
}

// ── Partial coverage is carried as partial ──────────────────────────────────
{
  stub(200, [
    { asset: "AAA", name: "Alpha", weightPercentage: 20 },
    { asset: "BBB", name: "Beta", weightPercentage: 15 },
  ]);
  const comp = await fetchFmpHoldings("XYZ");
  check("a short weight sum is flagged as partial coverage",
    comp && near(comp.coveragePct, 35, 0.1), String(comp?.coveragePct));
  check("and the note says the rest stays as the fund",
    comp && /rest is shown as the holding/i.test(comp.coverageNote ?? ""), comp?.coverageNote?.slice(0, 50));
}

globalThis.fetch = realFetch;
rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll FMP holdings checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
