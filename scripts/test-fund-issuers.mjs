// Identifying the issuer behind an unresolved fund.
//
// This is the safe half of "search for the fund": it returns who issues a fund
// and where they publish holdings, and NOTHING about what the fund holds. The
// two things worth pinning down are that it recognises the issuers an
// Australian investor actually holds, and — more important — that it stays
// silent rather than guess, because a wrong issuer sends someone to the wrong
// website and an issuer word inside a company name ("BHP Group") must never
// match.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const root = "/home/user/Daily-";
const dir = mkdtempSync(join(tmpdir(), "spectre-issuers-"));
const outDir = join(dir, "build");
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: {
    target: "es2022", module: "esnext", moduleResolution: "bundler",
    baseUrl: root, paths: { "@/*": ["./src/*"] },
    outDir, rootDir: join(root, "src"), skipLibCheck: true,
  },
  files: [join(root, "src/lib/fund-issuers.ts")],
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

const { detectIssuer } = await import(join(outDir, "lib/fund-issuers.js"));

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures += 1;
};

// ── Recognises the common Australian issuers ────────────────────────────────
{
  const cases = [
    ["BetaShares Australia 200 ETF", "BetaShares"],
    ["Vanguard Australian Shares Index ETF", "Vanguard Australia"],
    ["iShares Core S&P 500 AUD Hedged ETF", "iShares (BlackRock)"],
    ["VanEck MSCI International Quality ETF", "VanEck Australia"],
    ["SPDR S&P/ASX 200 Fund", "State Street SPDR"],
    ["Global X Australia 300 ETF", "Global X Australia"],
    ["Magellan Global Fund", "Magellan"],
  ];
  for (const [name, issuer] of cases) {
    const got = detectIssuer(name);
    check(`"${name.slice(0, 28)}…" -> ${issuer}`, got?.issuer === issuer, got?.issuer ?? "null");
  }
}

// ── Stays silent rather than guess ──────────────────────────────────────────
{
  check("a mining company is not an issuer", detectIssuer("BHP Group Limited") === null,
    JSON.stringify(detectIssuer("BHP Group Limited")));
  check("a bank is not an issuer", detectIssuer("Commonwealth Bank of Australia") === null);
  check("an unknown managed fund stays null, keeping the generic instruction",
    detectIssuer("Acme Opportunities Fund") === null);
  check("an empty name is null", detectIssuer("") === null && detectIssuer(null) === null);
}

// ── What it returns is usable guidance, never holdings ──────────────────────
{
  const got = detectIssuer("SPDR S&P/ASX 200 Fund", "STW");
  check("the guidance names the ticker and the issuer",
    got && /STW/.test(got.guidance) && /State Street/.test(got.guidance), got?.guidance?.slice(0, 60));
  check("it points at a real https issuer URL",
    got && /^https:\/\//.test(got.holdingsUrl), got?.holdingsUrl);
  check("it carries no holdings of any kind — identity only",
    got && !("constituents" in got) && !("holdings" in got) && Object.keys(got).sort().join(",") === "guidance,holdingsUrl,issuer",
    got ? Object.keys(got).join(",") : "null");
}

rmSync(dir, { recursive: true, force: true });
console.log(failures === 0 ? "\nAll issuer-detection checks passed" : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
