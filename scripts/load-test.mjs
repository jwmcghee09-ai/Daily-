#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split("=");
  if (key.startsWith("--")) args.set(key.slice(2), value ?? "true");
}

const base = (args.get("base") || process.env.LOAD_TEST_BASE_URL || "").trim().replace(/\/$/, "");
const profile = (args.get("profile") || "safe").trim().toLowerCase();

if (!base) {
  console.error("Usage: node scripts/load-test.mjs --base=https://staging.example.com [--profile=safe|heavy]");
  process.exit(1);
}

if (spawnSync("which", ["ab"], { stdio: "ignore" }).status !== 0) {
  console.error("ApacheBench (`ab`) is required for this script.");
  process.exit(1);
}

const profiles = {
  safe: [
    { label: "landing", path: "/", n: 60, c: 6 },
    { label: "signin", path: "/signin", n: 40, c: 4 },
    { label: "dashboard-demo", path: "/dashboard?demo=1", n: 50, c: 5 },
    { label: "research-demo", path: "/research?demo=1", n: 40, c: 4 },
    { label: "quotes-demo", path: "/api/research/quotes?demo=1", n: 60, c: 6 },
    { label: "fmp-demo", path: "/api/research/fmp?demo=1", n: 40, c: 4 },
  ],
  heavy: [
    { label: "landing", path: "/", n: 400, c: 25 },
    { label: "dashboard-demo", path: "/dashboard?demo=1", n: 300, c: 20 },
    { label: "research-demo", path: "/research?demo=1", n: 200, c: 12 },
    { label: "quotes-demo", path: "/api/research/quotes?demo=1", n: 200, c: 15 },
    { label: "fmp-demo", path: "/api/research/fmp?demo=1", n: 150, c: 10 },
  ],
};

const scenarios = profiles[profile];
if (!scenarios) {
  console.error(`Unknown profile: ${profile}`);
  process.exit(1);
}

function runAb(url, n, c) {
  const output = execFileSync("ab", ["-n", String(n), "-c", String(c), url], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  const parse = (regex) => {
    const match = output.match(regex);
    return match ? match[1] : "n/a";
  };

  return {
    failed: Number(parse(/Failed requests:\s+(\d+)/)),
    rps: parse(/Requests per second:\s+([\d.]+)/),
    meanMs: parse(/Time per request:\s+([\d.]+)\s+\[ms\]\s+\(mean\)/),
    p95Ms: parse(/95%\s+(\d+)/),
    maxMs: parse(/100%\s+(\d+)\s+\(longest request\)/),
  };
}

function curlCode(url) {
  const output = execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", url], {
    encoding: "utf8",
  });
  return output.trim();
}

const rows = [];
for (const scenario of scenarios) {
  const url = `${base}${scenario.path}`;
  const code = curlCode(url);
  const result = runAb(url, scenario.n, scenario.c);
  rows.push({
    label: scenario.label,
    code,
    n: scenario.n,
    c: scenario.c,
    ...result,
  });
}

console.log(`Load test profile: ${profile}`);
console.log(`Base URL: ${base}`);
console.log("");
console.table(rows);
