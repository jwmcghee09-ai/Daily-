// Bounds on imported figures, tested against the failure that motivated them.
//
// `value` being finite is not enough. An import may carry MAX_HOLDINGS rows and
// every value is summed into totalValue, so values near Number.MAX_VALUE
// overflow that sum to Infinity. Infinity spreads through P&L, concentration,
// VaR, drawdown and the stress scenarios, and JSON.stringify writes it out as
// `null` — so the Quant page renders blank instead of erroring. That silence is
// what makes this worth a regression test.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-bounds-"));
process.env.SQLITE_DB_PATH = join(dir, "test.sqlite");

// db.ts reaches for its siblings through the "@/..." alias, so tsc needs the
// same mapping Next uses. `paths` is only honoured from a config file.
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
} catch {
  // Diagnostics from unrelated transitive files must not block the emit.
}

// tsc resolves "@/..." for typechecking but emits the specifier verbatim, and
// it drops the file extension — neither of which Node's ESM loader accepts.
// Rewrite both so the emitted build runs as-is.
function rewriteSpecifiers(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) { rewriteSpecifiers(full); continue; }
    if (!full.endsWith(".js")) continue;
    const patched = readFileSync(full, "utf8").replace(
      /(\bfrom\s*|\bimport\s*\(\s*)(["'])([^"']+)\2/g,
      (match, lead, quote, spec) => {
        let target = spec;
        if (spec.startsWith("@/")) {
          const abs = join(outDir, spec.slice(2));
          target = relative(dirname(full), abs).replace(/\\/g, "/");
          if (!target.startsWith(".")) target = `./${target}`;
        } else if (!spec.startsWith(".")) {
          return match; // a real package — leave it to Node
        }
        if (!/\.[cm]?js$/.test(target)) target += ".js";
        return `${lead}${quote}${target}${quote}`;
      },
    );
    writeFileSync(full, patched);
  }
}
rewriteSpecifiers(outDir);

const db = await import(join(outDir, "lib/db.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

const USER = "bounds-test-user";
const holding = (over = {}) => ({
  id: over.id ?? `h-${Math.random().toString(36).slice(2)}`,
  ticker: "BHP", name: "BHP Group", units: 100, price: 45,
  value: 4500, costBase: 4000, ...over,
});
const save = (holdings) => db.saveImport(USER, "asx", holdings);
const tickers = (state) => Object.fromEntries(state.holdings.map((h) => [h.ticker, h]));

// ── The reported failure: a book that overflows its own total ──
{
  const state = save([
    holding({ ticker: "OVR1", value: 1e308 }),
    holding({ ticker: "OVR2", value: 1e308 }),
    holding({ ticker: "OVR3", value: 1e308 }),
  ]);
  const total = state.holdings.reduce((sum, h) => sum + h.value, 0);
  check("a book of 1e308 rows still totals to a real number", Number.isFinite(total), `total=${total}`);
  check("the total survives JSON round-tripping", JSON.parse(JSON.stringify(total)) !== null, `${JSON.stringify(total)}`);
  check("every stored value is finite", state.holdings.every((h) => Number.isFinite(h.value)));
}

// ── The cap has to hold at the row count an import actually permits ──
{
  const rows = Array.from({ length: 10000 }, (_, i) =>
    holding({ id: `max-${i}`, ticker: `T${i}`, value: Number.MAX_VALUE }));
  const state = save(rows);
  const total = state.holdings.reduce((sum, h) => sum + h.value, 0);
  check("10,000 maximal rows do not overflow the sum", Number.isFinite(total), `total=${total}`);
}

// ── Values a real user could plausibly have must pass through untouched ──
{
  const state = save([
    holding({ ticker: "SMALL", value: 0.01, units: 0.00001, price: 0.0001 }),
    holding({ ticker: "LARGE", value: 25_000_000, units: 500_000, price: 50 }),
  ]);
  const t = tickers(state);
  check("a one-cent holding is not rounded away", t.SMALL?.value === 0.01, String(t.SMALL?.value));
  check("fractional units survive", t.SMALL?.units === 0.00001, String(t.SMALL?.units));
  check("a $25m holding is untouched", t.LARGE?.value === 25_000_000, String(t.LARGE?.value));
  check("500k units are untouched", t.LARGE?.units === 500_000, String(t.LARGE?.units));
}

// ── Impossible share counts ──
{
  const state = save([holding({ ticker: "NEG", units: -500 })]);
  const t = tickers(state);
  check("a negative share count is refused", t.NEG?.units >= 0, String(t.NEG?.units));
  check("but the holding's value is kept", t.NEG?.value === 4500, String(t.NEG?.value));
}

// ── Text that would wreck a table cell ──
{
  const state = save([
    holding({ ticker: "A".repeat(5000), name: "N".repeat(5000) }),
    holding({ id: "x".repeat(5000), ticker: "IDLONG" }),
  ]);
  const longest = Math.max(...state.holdings.map((h) => h.ticker.length));
  check("tickers are capped to a sane length", longest <= 32, `longest ticker ${longest} chars`);
  const longestName = Math.max(...state.holdings.map((h) => h.name.length));
  check("names are capped too", longestName <= 128, `longest name ${longestName} chars`);
  check("ids are capped", state.holdings.every((h) => h.id.length <= 200), "ids stay bounded");
}

// ── Non-numeric input must not become NaN in the database ──
{
  const state = save([holding({ ticker: "STR", units: "lots", price: "dear", costBase: "free" })]);
  const t = tickers(state);
  check("a non-numeric unit count becomes a number", Number.isFinite(t.STR?.units), String(t.STR?.units));
  check("a non-numeric price becomes a number", Number.isFinite(t.STR?.price), String(t.STR?.price));
  check("a non-numeric cost base becomes a number", Number.isFinite(t.STR?.costBase), String(t.STR?.costBase));
}

// ── Rows with no usable value are a bad request, not a server fault ──
{
  let caught = null;
  try { save([holding({ value: 0 }), holding({ value: null })]); } catch (e) { caught = e; }
  check("an all-invalid import throws NoValidHoldingsError", caught?.name === "NoValidHoldingsError", String(caught?.name));
  check("the error names the column to look at", /value/i.test(caught?.message || ""), caught?.message?.slice(0, 90));
  check("the error reports how many rows arrived", caught?.rowsReceived === 2, String(caught?.rowsReceived));

  let empty = null;
  try { save([]); } catch (e) { empty = e; }
  check("an empty import is also NoValidHoldingsError", empty?.name === "NoValidHoldingsError", String(empty?.name));
}

// ── One bad row must not discard the good ones ──
{
  const state = save([holding({ ticker: "KEEP", value: 1234 }), holding({ ticker: "DROP", value: -1 })]);
  const t = tickers(state);
  check("the valid row is kept", t.KEEP?.value === 1234, String(t.KEEP?.value));
  check("the row with no usable value is dropped", t.DROP === undefined);
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll import-bounds checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
