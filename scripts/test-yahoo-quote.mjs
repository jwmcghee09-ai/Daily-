// Where a previous close comes from.
//
// Yahoo's `chartPreviousClose` reads like "yesterday" and means "the close
// before the range you asked for". Every quote reader in this codebase listed
// it ahead of the series, so the research page reported BHP at +46.07%, oil at
// +46.47% and AUD/USD at +5.71% — against real daily moves of -2.02%, +3.78%
// and -0.36%. Three of those had the wrong sign.
//
// Nothing errored. The numbers were real, internally consistent, and wrong, and
// a product whose whole claim is trustworthy figures had been quoting
// twelve-month moves as today's for as long as the page existed.
//
// Two things are checked: the helper picks the series, and no reader in the
// tree has quietly gone back to preferring the metadata.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-yq-"));
const outDir = join(dir, "build");
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler",
    baseUrl: root, paths: { "@/*": ["./src/*"] },
    outDir, rootDir: join(root, "src"), skipLibCheck: true,
  },
  files: [join(root, "src/lib/yahoo-quote.ts")],
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

const yq = await import(join(outDir, "lib/yahoo-quote.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

const chart = (closes, meta = {}) => ({ meta, indicators: { quote: [{ close: closes }] } });

// ── The actual bug ─────────────────────────────────────────────────────────
{
  // BHP as Yahoo returned it on a 1y range: a year of bars, and a
  // chartPreviousClose from a year ago.
  const bhp = chart([60.1, 62.45, 61.19], { regularMarketPrice: 61.19, chartPreviousClose: 41.89 });

  check("the previous close is the bar before the last, not the range's edge",
    yq.previousCloseFrom(bhp) === 62.45, String(yq.previousCloseFrom(bhp)));
  check("so the day's move is a day's move",
    yq.dayChangePct(61.19, yq.previousCloseFrom(bhp)).toFixed(2) === "-2.02",
    yq.dayChangePct(61.19, yq.previousCloseFrom(bhp)).toFixed(2) + "%");
  check("and not the +46% a year's change reads as",
    yq.dayChangePct(61.19, bhp.meta.chartPreviousClose).toFixed(2) === "46.07");
}

// ── Falling back ───────────────────────────────────────────────────────────
{
  // A listing so new it has one bar cannot answer from the series, and the
  // metadata is better than nothing — it is only wrong by the range.
  const fresh = chart([10.5], { regularMarketPrice: 10.5, chartPreviousClose: 10.0 });
  check("one bar falls back to the metadata", yq.previousCloseFrom(fresh) === 10.0);

  check("previousClose is preferred over chartPreviousClose when it appears",
    yq.previousCloseFrom(chart([1], { previousClose: 9, chartPreviousClose: 3 })) === 9);

  check("nothing usable returns null, rather than a number nobody can trust",
    yq.previousCloseFrom(chart([], {})) === null
    && yq.previousCloseFrom(undefined) === null);
}

// ── Dirty series ───────────────────────────────────────────────────────────
{
  // Yahoo pads with nulls on non-trading days and halts.
  const gappy = chart([50, null, 52, null, 53], { regularMarketPrice: 53 });
  check("nulls in the series are skipped, not read as zero",
    yq.previousCloseFrom(gappy) === 52, String(yq.previousCloseFrom(gappy)));

  check("a zero or negative close is not a close",
    yq.previousCloseFrom(chart([0, -1, 20, 21])) === 20);
  check("and neither is a non-finite one",
    yq.previousCloseFrom(chart([Number.NaN, 30, 31])) === 30);
}

// ── The change itself ──────────────────────────────────────────────────────
{
  check("a zero previous close does not divide by zero",
    yq.dayChangePct(10, 0) === null);
  check("a missing side is null rather than a fabricated 0%",
    yq.dayChangePct(10, null) === null && yq.dayChangePct(null, 10) === null);
  check("an ordinary move is computed the ordinary way",
    yq.dayChangePct(110, 100) === 10);
}

// ── No reader may go back ──────────────────────────────────────────────────
//
// The helper being right is worth nothing if a route keeps its own copy of the
// old order. Every file that reads chartPreviousClose must reach for the close
// series first, and this fails if one stops doing so.
{
  const readers = [
    "src/lib/db.ts",
    "src/app/api/research/quotes/route.ts",
    "src/app/api/research/fmp/route.ts",
    "src/app/api/pro/holdings-ai/route.ts",
    "src/app/dashboard/route.ts",
    "src/app/api/terminal/route.ts",
    "src/app/api/trading/analytics/route.ts",
  ];

  // Comments explaining the bug name the field, so they have to come out
  // before the order of real code can be read.
  const stripComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const SERIES_TOKENS = ["seriesPrevClose", "closeSeries", "seriesCloses", "closes.length", "closes["];

  for (const file of readers) {
    const src = stripComments(readFileSync(join(root, file), "utf8"));

    /*
     * Find the expression that actually decides the previous close, and check
     * the series is consulted inside it.
     *
     * Position in the file is not enough: a first attempt asserted that a
     * series variable appeared before chartPreviousClose anywhere in the file,
     * which kept passing when the decision was reverted, because the now-unused
     * declaration still sat above it. The decision is what matters, so the
     * decision is what gets read.
     */
    const decisions = [...src.matchAll(/(?:const|let)\s+(?:prev|prevClose)\s*(?::[^=]+)?=\s*([\s\S]*?);/g)]
      .map((m) => m[1])
      .filter((expr) => /chartPrev/i.test(expr));

    if (decisions.length === 0) {
      // Either the file does not choose one, or it does it through named
      // variables — db.ts reads both into locals and orders them in a return.
      const returned = [...src.matchAll(/prevClose:\s*([\s\S]*?),\n/g)].map((m) => m[1])
        .filter((expr) => /chartPrev/i.test(expr));
      if (returned.length === 0) { check(`${file.replace("src/", "")}: no previous-close decision to check`, true); continue; }
      decisions.push(...returned);
    }

    for (const expr of decisions) {
      const metaAt = expr.search(/chartPrev/i);
      const seriesAt = Math.min(...SERIES_TOKENS.map((t) => {
        const i = expr.indexOf(t);
        return i === -1 ? Infinity : i;
      }));
      check(`${file.replace("src/", "")} picks the series over chartPreviousClose`,
        seriesAt < metaAt,
        seriesAt === Infinity ? "the decision never looks at the close series" : "");
    }
  }
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll previous-close checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
