// Seeing inside superannuation.
//
// Super is the biggest holding most Australians have and the one they
// understand least, and it is the sharpest thing SPECTRE does that a user's own
// ChatGPT or Claude cannot: resolve a balanced super option to the companies
// inside it and fold that into the real risk picture. A general assistant has
// no way to turn "AustralianSuper Balanced" into "and therefore you own 4.1% CBA
// across everything". This does, and these checks pin down that it does.
//
// Two things are asserted:
//   1. The vehicle classifier calls a super line "super" whatever route
//      resolved its holdings, and never mistakes an ETF or a share for it.
//   2. A super balance with an uploaded holdings file folds through into the
//      effective book: its companies appear, priced to the user's real balance,
//      and a company held BOTH directly and inside super shows the combined
//      exposure — which is the whole point, and the dangerous number to get
//      wrong.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-super-"));
const outDir = join(dir, "build");
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler",
    baseUrl: root, paths: { "@/*": ["./src/*"] },
    outDir, rootDir: join(root, "src"), skipLibCheck: true,
  },
  files: [
    join(root, "src/lib/lookthrough.ts"),
    join(root, "src/lib/vehicle.ts"),
  ],
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

const { buildEffectiveBook } = await import(join(outDir, "lib/lookthrough.js"));
const { classifyVehicle, vehicleLabel } = await import(join(outDir, "lib/vehicle.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures += 1;
};
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

// ── 1. The vehicle classifier ───────────────────────────────────────────────
//
// source wins over route: a super line is super however its holdings arrived,
// because the user's own import said so and no filing outranks that.
{
  check("a super line uploaded is super",
    classifyVehicle({ source: "super", route: "uploaded" }) === "super");
  check("a super line is still super even if a filing route answered",
    classifyVehicle({ source: "super", route: "sec" }) === "super");
  check("an unresolved super line is already known to be super",
    classifyVehicle({ source: "super", kind: "unknown" }) === "super");

  check("an N-PORT fund is an etf, not super",
    classifyVehicle({ source: "index", route: "sec" }) === "etf");
  check("a cross-listed feeder is an etf",
    classifyVehicle({ source: "asx", route: "cross-listed" }) === "etf");
  check("a 13F holding company is a company",
    classifyVehicle({ source: "us", route: "13f" }) === "company");
  check("an uploaded managed fund is a managed fund",
    classifyVehicle({ source: "fund", route: "uploaded" }) === "managed-fund");

  check("an unresolved ordinary share is a share, not a fund",
    classifyVehicle({ source: "asx", kind: "company" }) === "share");
  check("an unresolved ASX fund is an etf",
    classifyVehicle({ source: "asx", kind: "fund" }) === "etf");
  check("an unresolved managed fund is a managed fund",
    classifyVehicle({ source: "fund", kind: "fund" }) === "managed-fund");
  check("nothing identifiable is unknown",
    classifyVehicle({ source: "crypto", kind: "crypto" }) === "unknown");

  check("super has a human label",
    vehicleLabel("super") === "Superannuation", vehicleLabel("super"));
}

// ── 2. Super folds through into the effective book ──────────────────────────
//
// The portfolio: $100k super (a balanced option) plus $10k CBA held directly on
// the brokerage. The super's uploaded disclosure is 40% CBA, 30% BHP, 30% CSL —
// a deliberately bank-heavy option so the overlap with the direct CBA is the
// number that matters.
{
  const holdings = [
    { ticker: "SUPBAL", name: "Balanced Super Option", value: 100000, source: "super" },
    { ticker: "CBA", name: "Commonwealth Bank", value: 10000, source: "asx" },
  ];

  const compositions = new Map([
    ["SUPBAL", {
      fundTicker: "SUPBAL",
      fundName: "Balanced Super Option",
      source: "Super portfolio holdings disclosure",
      asOf: "2026-06-30",
      constituents: [
        { name: "Commonwealth Bank of Australia", ticker: "CBA", weightPct: 40, country: "AU", sector: "Financials" },
        { name: "BHP Group Ltd", ticker: "BHP", weightPct: 30, country: "AU", sector: "Materials" },
        { name: "CSL Ltd", ticker: "CSL", weightPct: 30, country: "AU", sector: "Health Care" },
      ],
    }],
  ]);

  const book = buildEffectiveBook(holdings, compositions);
  const byName = (needle) =>
    book.positions.find((p) => p.name.toLowerCase().includes(needle.toLowerCase()));

  check("the super resolved, so the book is looked through",
    book.resolvedValue > 0, `resolved $${book.resolvedValue}`);

  // Totals never move: looking through is a re-attribution of the same money.
  check("the total is unchanged by looking through the super",
    near(book.totalValue, 110000, 1), `$${book.totalValue}`);

  const cba = byName("Commonwealth");
  // $10k held directly + 40% of the $100k super = $10k + $40k = $50k.
  check("CBA combines the direct holding with the slice inside super",
    cba && near(cba.value, 50000, 1), cba ? `$${cba.value.toFixed(0)}` : "missing");
  check("and the book records how much of that CBA was held directly",
    cba && near(cba.directValue, 10000, 1), cba ? `direct $${cba.directValue.toFixed(0)}` : "missing");
  check("and names super as a wrapper that contributed to it",
    cba && cba.via.some((v) => v.fundTicker === "SUPBAL"),
    cba ? cba.via.map((v) => v.fundTicker).join(",") || "none" : "missing");

  const bhp = byName("BHP");
  check("BHP appears purely from inside super (30% of $100k)",
    bhp && near(bhp.value, 30000, 1) && near(bhp.directValue, 0, 1),
    bhp ? `$${bhp.value.toFixed(0)}, direct $${bhp.directValue.toFixed(0)}` : "missing");

  // The whole argument for super look-through: the wrapper hid real
  // concentration. On wrappers, CBA is 10/110 = 9.1% and the super is one 91%
  // lump. Looked through, CBA is 50/110 = 45.5% — which is the true risk.
  const cbaWeight = cba ? cba.weightPct : 0;
  check("CBA's TRUE weight is far above what the holdings table shows",
    near(cbaWeight, 45.45, 0.2), `${cbaWeight.toFixed(1)}%`);

  // The super wrapper itself must be gone from the effective book — it was
  // replaced by its contents, not left sitting alongside them.
  check("the SUPBAL wrapper is no longer a position of its own",
    !book.positions.some((p) => (p.ticker ?? "").toUpperCase() === "SUPBAL"));

  // And nothing double-counts: the positions sum back to the total.
  const sum = book.positions.reduce((s, p) => s + p.value, 0);
  check("looked-through positions still sum to the portfolio total",
    near(sum, 110000, 1), `$${sum.toFixed(0)}`);
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll super look-through checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
