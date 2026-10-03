// Is this ticker a fund, or a company?
//
// The bug this guards against was not a crash. BHP was listed in the
// look-through panel as a fund with no holdings data and an Upload button, so
// the product asked a user to supply a mining company's portfolio. Nothing
// errored, nothing looked broken, and the advice was impossible to follow.
//
// The checks here are about which source is believed, and in what order. Order
// is the whole difficulty: exchange reference data calls VTS.AX an EQUITY
// because it is a depositary interest rather than a local fund, so a classifier
// that asked the exchange first would relabel the one kind of fund this engine
// resolves best. Every ordering rule below has a ticker behind it that broke it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-kind-"));
const outDir = join(dir, "build");
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler",
    baseUrl: root, paths: { "@/*": ["./src/*"] },
    outDir, rootDir: join(root, "src"), skipLibCheck: true,
  },
  files: [
    join(root, "src/lib/instrument-kind.ts"),
    join(root, "src/lib/fund-crosslist.ts"),
  ],
}));
try {
  execFileSync("npx", ["tsc", "-p", join(dir, "tsconfig.json")], { stdio: ["ignore", "pipe", "pipe"] });
} catch { /* emit anyway */ }

// tsc emits the "@/..." specifier verbatim and drops the extension; Node
// accepts neither.
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

const kinds = await import(join(outDir, "lib/instrument-kind.js"));
const crosslist = await import(join(outDir, "lib/fund-crosslist.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

/*
 * A fake exchange, and a record of what was asked.
 *
 * The network is stubbed rather than reached so these checks mean the same
 * thing offline and in CI, and so "which symbol did it ask about" — the part
 * that was wrong for Australian holdings, which arrive as bare codes — is
 * observable rather than inferred.
 */
const QUOTES = {
  "BHP.AX":  { instrumentType: "EQUITY", exchangeName: "ASX", longName: "BHP Group Limited" },
  "CBA.AX":  { instrumentType: "EQUITY", exchangeName: "ASX", longName: "Commonwealth Bank of Australia" },
  "IHVV.AX": { instrumentType: "ETF", exchangeName: "ASX", longName: "iShares S&P 500 AUD Hedged ETF" },
  "NDQ.AX":  { instrumentType: "ETF", exchangeName: "ASX", longName: "BetaShares NASDAQ 100 ETF" },
  "VTS.AX":  { instrumentType: "EQUITY", exchangeName: "ASX", longName: "Vanguard US Total Market Shares Index ETF" },
  AAPL:      { instrumentType: "EQUITY", exchangeName: "NMS", longName: "Apple Inc." },
  "BRK-B":   { instrumentType: "EQUITY", exchangeName: "NYQ", longName: "Berkshire Hathaway Inc." },
  "^AXJO":   { instrumentType: "INDEX", exchangeName: "ASX", longName: "S&P/ASX 200" },
};

let asked = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const symbol = decodeURIComponent(String(url).replace(/^.*\/chart\//, "").replace(/\?.*$/, ""));
  asked.push(symbol);
  const meta = QUOTES[symbol];
  if (!meta) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => ({ chart: { result: [{ meta }] } }) };
};

// The store is loaded lazily and this build has no database, so every call is
// a cold one — which is the case worth testing.
const classify = (ticker, options) => {
  asked = [];
  return kinds.classifyInstrument(ticker, options);
};

// ── The reported bug ────────────────────────────────────────────────────────
{
  const bhp = await classify("BHP", { market: "asx" });
  check("BHP is a company, not a fund awaiting a file",
    bhp.kind === "company", `${bhp.kind} — ${bhp.basis}`);
  check("its name comes back for the panel to show",
    bhp.name === "BHP Group Limited", String(bhp.name));

  const ihvv = await classify("IHVV", { market: "asx" });
  check("IHVV is a fund", ihvv.kind === "fund", `${ihvv.kind} — ${ihvv.basis}`);
  check("and it is known to be IVV, so the exchange is never asked",
    /cross-listing of IVV/.test(ihvv.basis) && asked.length === 0, `asked ${asked.join(",") || "nothing"}`);
}

// ── Which symbol gets asked about ──────────────────────────────────────────
{
  await classify("CBA", { market: "asx" });
  check("an Australian holding is asked about as CBA.AX, not CBA",
    asked.includes("CBA.AX") && !asked.includes("CBA"), asked.join(","));

  // CBA is in neither SEC register. Before the exchange lookup there was
  // nothing left to try, so it stayed "a fund with no file".
  const cba = await classify("CBA", { market: "asx" });
  check("a ticker in neither SEC register is still identified",
    cba.kind === "company", `${cba.kind} — ${cba.basis}`);

  await classify("BRK.B", { market: "us" });
  check("a class share is asked about as BRK-B as well as BRK.B",
    asked.includes("BRK-B"), asked.join(","));
}

// ── Order of precedence ────────────────────────────────────────────────────
{
  const vts = await classify("VTS", { market: "asx" });
  check("VTS is a fund although the exchange calls it an EQUITY",
    vts.kind === "fund", `${vts.kind} — ${vts.basis}`);

  const index = await classify("^AXJO");
  check("an index is neither a fund nor a company",
    index.kind === "index", index.kind);
}

// ── Degrading honestly ─────────────────────────────────────────────────────
{
  const unknown = await classify("ZZZZ", { market: "asx" });
  check("a ticker nobody can identify is unknown, not assumed",
    unknown.kind === "unknown", unknown.kind);
  check("and unknown still offers the upload, since that is the safe error",
    /upload/i.test(kinds.unresolvedReason("unknown")));

  const offline = await classify("NDQ", { market: "asx", allowNetwork: false });
  check("with the network withheld nothing is guessed",
    offline.kind === "unknown" && asked.length === 0, `${offline.kind}, asked ${asked.length}`);

  const crossOffline = await classify("IVV", { market: "asx", allowNetwork: false });
  check("but a known cross-listing needs no network at all",
    crossOffline.kind === "fund", crossOffline.kind);
}

// ── What the user is told ──────────────────────────────────────────────────
{
  check("a company is told it has nothing inside it, and not asked for a file",
    /nothing inside/i.test(kinds.unresolvedReason("company"))
    && !/upload/i.test(kinds.unresolvedReason("company")),
    kinds.unresolvedReason("company"));
  check("a fund is told how to fix it",
    /upload/i.test(kinds.unresolvedReason("fund")));
}

// ── The cross-listing map ──────────────────────────────────────────────────
//
// Each entry claims the ASX ticker gives you a claim on the US fund's actual
// portfolio. A wrong entry does not fail loudly — it produces a confident,
// detailed, fictional portfolio — so the two that were wrong are asserted
// absent by name.
{
  const map = crosslist.ASX_TO_US_FUND;
  check("IHVV resolves through IVV, whose units are 99.4% of it",
    map.IHVV === "IVV", String(map.IHVV));
  check("IEM points at EEM, whose index it tracks, not IEMG's",
    map.IEM === "EEM", String(map.IEM));
  check("IWLD is absent: it holds 635 stocks of its own, not URTH's",
    !("IWLD" in map), String(map.IWLD));
  check("IHOO is absent: hedged does not mean feeder, and it replicates itself",
    !("IHOO" in map), String(map.IHOO));
  check("every entry maps to a plausible US ticker",
    Object.values(map).every((t) => /^[A-Z]{1,5}$/.test(t)), Object.values(map).join(","));
  check("no entry maps an ASX ticker to itself by accident of case",
    Object.entries(map).every(([asx, us]) => asx === asx.toUpperCase() && us === us.toUpperCase()));
}

globalThis.fetch = realFetch;
rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll instrument-kind checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
