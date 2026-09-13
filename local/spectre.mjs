#!/usr/bin/env node
// SPECTRE Local — portfolio intelligence that runs on your machine.
//
//   node spectre.mjs scan BHP
//   node spectre.mjs portfolio my-holdings.csv
//   node spectre.mjs scan NVDA --no-ai        # numbers only, no model needed
//
// The statistics are computed locally by code. A local Ollama model writes the
// explanation. Your holdings never leave the machine.

import { createInterface } from "node:readline/promises";
import { analyse } from "./lib/engine.mjs";
import { valueHoldings } from "./lib/holdings.mjs";
import { loadBars } from "./lib/quotes.mjs";
import { readPortfolio } from "./lib/portfolio.mjs";
import { chat, ensureModel, OllamaUnavailable, OllamaModelMissing, DEFAULT_HOST } from "./lib/ollama.mjs";
import { login, readConfig, clearConfig, fetchAccountPortfolio, CONFIG_PATH, DEFAULT_BASE_URL } from "./lib/account.mjs";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[38;5;203m", orange: "\x1b[38;5;209m",
  green: "\x1b[38;5;114m", grey: "\x1b[38;5;245m", white: "\x1b[97m",
};
const LOCAL_VERSION = "1.1.0";
const DISCLAIMER = "Possible anomalies only — statistical flags, not financial advice. You have the final say.";

function parseArgs(argv) {
  // A flag in the target slot is a flag, not a filename — `portfolio --no-ai`
  // must still mean "my account", not a file called --no-ai.
  const target = argv[1] && !argv[1].startsWith("-") ? argv[1] : undefined;
  const opts = { command: argv[0], target, ai: true, model: "spectre", host: DEFAULT_HOST, json: false };
  for (let i = target ? 2 : 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-ai") opts.ai = false;
    else if (a === "--json") { opts.json = true; opts.ai = false; }
    else if (a === "--model") opts.model = argv[++i];
    else if (a === "--host") opts.host = argv[++i];
  }
  return opts;
}

const fmt = (v, dp = 2) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(dp));
const pct = (v, dp = 1) => (v == null || Number.isNaN(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`);
const money = (v) => (v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: 0 }));
const tone = (v) => (v == null ? C.grey : v >= 0 ? C.green : C.red);
const sevColour = (s) => (s === "alert" ? C.red : s === "watch" ? C.orange : C.grey);

function printFlags(flags) {
  for (const f of flags) {
    const c = sevColour(f.severity);
    console.log(`  ${c}${C.bold}${f.severity.toUpperCase().padEnd(5)}${C.reset} ${C.white}${f.title}${C.reset}`);
    console.log(`        ${C.grey}${f.detail}${C.reset}`);
  }
}

function printScan({ stats, anomalies }) {
  console.log(
    `\n${C.bold}${C.white}${stats.symbol}${C.reset}  ${C.grey}${stats.name}${C.reset}` +
      `   ${C.bold}${fmt(stats.price)} ${stats.currency}${C.reset}  ` +
      `${tone(stats.dayPct)}${pct(stats.dayPct, 2)} today${C.reset}\n`,
  );
  const row = (label, value, colour = C.white) =>
    `${C.grey}${label.padEnd(16)}${C.reset}${colour}${value}${C.reset}`;

  console.log(`  ${row("RSI 14", fmt(stats.rsi, 0), stats.rsi >= 70 ? C.red : stats.rsi <= 30 ? C.green : C.white)}`);
  console.log(`  ${row("30d / 90d / 1y", `${pct(stats.ret30)}  ${pct(stats.ret90)}  ${pct(stats.ret1y)}`)}`);
  console.log(`  ${row("vs MA50 / 200", `${pct(stats.ma50DistPct)}  ${pct(stats.ma200DistPct)}`)}`);
  console.log(`  ${row("52w range", `${fmt(stats.lo52)} – ${fmt(stats.hi52)}  (${fmt(stats.pos52w, 0)}% of range)`)}`);
  console.log(`  ${row("Volume", stats.volRatio ? `${fmt(stats.volRatio, 1)}× 20-day avg` : "—", stats.volRatio >= 2 ? C.orange : C.white)}`);
  console.log(`  ${row("Ann. volatility", stats.annVolPct ? `${fmt(stats.annVolPct, 0)}%` : "—")}`);
  console.log(`\n${C.bold}Flags${C.reset}`);
  printFlags(anomalies);
}

function buildScanPrompt({ stats, anomalies }) {
  return [
    "Explain what today's data shows for this stock. Use only the figures below.",
    "",
    "DATA",
    JSON.stringify(stats, null, 1),
    "",
    "FLAGS RAISED BY THE RULE ENGINE",
    JSON.stringify(anomalies, null, 1),
  ].join("\n");
}

function buildPortfolioPrompt(summary) {
  const slim = summary.positions.map((p) => ({
    symbol: p.symbol || p.label, name: p.name, weightPct: Number(p.weight.toFixed(2)),
    value: Math.round(p.value), dayPct: p.dayPct, ret30: p.ret30,
    rsi: p.rsi, drawdownPct: p.drawdownPct, annVolPct: p.annVolPct,
    pnlPct: p.pnlPct,
    alerts: (p.anomalies ?? []).filter((a) => a.severity !== "info").map((a) => a.title),
    ...(p.statsUnavailable ? { statsUnavailable: p.statsUnavailable } : {}),
  }));
  for (const c of summary.cashHoldings) {
    slim.push({
      symbol: c.label, name: c.name || "Cash", kind: "cash",
      weightPct: summary.totalValue > 0 ? Number(((c.value / summary.totalValue) * 100).toFixed(2)) : 0,
      value: Math.round(c.value), alerts: [],
    });
  }
  return [
    "Explain what this portfolio's data shows. Use only the figures below.",
    "Cover: what is driving today, where risk is concentrated, and which holdings the flags point at.",
    "",
    "PORTFOLIO TOTALS",
    JSON.stringify(
      {
        totalValue: Math.round(summary.totalValue),
        investedValue: Math.round(summary.investedValue),
        cashValue: Math.round(summary.cashValue),
        cashPct: summary.cashPct,
        weightedDayPct: summary.weightedDayPct,
        top3Pct: summary.top3Pct,
        effectiveNames: summary.effectiveNames,
        weightedAnnVolPct: summary.weightedAnnVolPct,
        statsCoveragePct: summary.statsCoveragePct,
      },
      null, 1,
    ),
    "",
    "HOLDINGS",
    JSON.stringify(slim, null, 1),
    "",
    "PORTFOLIO FLAGS",
    JSON.stringify(summary.flags, null, 1),
  ].join("\n");
}

async function runAi(opts, system, user) {
  if (!opts.ai) return;
  try {
    await ensureModel(opts.model, opts.host);
  } catch (err) {
    if (err instanceof OllamaUnavailable || err instanceof OllamaModelMissing) {
      console.log(`\n${C.orange}Skipping the written summary.${C.reset}\n${C.grey}${err.message}${C.reset}`);
      return;
    }
    throw err;
  }
  console.log(`\n${C.bold}${C.orange}SPECTRE${C.reset} ${C.grey}(${opts.model}, running locally)${C.reset}\n`);
  await chat({
    model: opts.model, host: opts.host, user,
    system, onToken: (t) => process.stdout.write(t),
  });
  console.log("");
}

async function cmdScan(opts) {
  if (!opts.target) throw new Error("Usage: spectre scan <TICKER>");
  process.stderr.write(`${C.grey}Fetching a year of daily bars for ${opts.target.toUpperCase()}…${C.reset}\r`);
  const bars = await loadBars(opts.target);
  process.stderr.write(" ".repeat(60) + "\r");
  if (!bars) throw new Error(`No data found for "${opts.target}" — check the ticker`);

  const result = analyse(bars.rows, bars.meta);
  if (result.error) throw new Error(result.error);

  if (opts.json) { console.log(JSON.stringify(result, null, 2)); return; }
  printScan(result);
  await runAi(opts, null, buildScanPrompt(result));
  console.log(`\n${C.dim}${DISCLAIMER}${C.reset}`);
}

async function cmdLogin() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = (await rl.question("SPECTRE email: ")).trim();
    // Node has no portable no-echo prompt; warn rather than pretend it is hidden.
    console.log(`${C.grey}(password will be visible as you type)${C.reset}`);
    const password = await rl.question("Password: ");
    rl.close();
    const result = await login(email, password);
    console.log(`\n${C.green}Signed in as ${result.email}${C.reset}`);
    console.log(`${C.grey}Token saved to ${result.path} (owner-only). Valid for 30 days.${C.reset}`);
    console.log(`${C.grey}Your AI can now read your live portfolio — try: node spectre.mjs portfolio${C.reset}`);
  } finally {
    rl.close();
  }
}

async function cmdWhoami() {
  const config = await readConfig();
  if (!config?.token) {
    console.log(`${C.grey}Not signed in. Run: node spectre.mjs login${C.reset}`);
    return;
  }
  console.log(`${C.white}${config.email}${C.reset} ${C.grey}on ${config.baseUrl || DEFAULT_BASE_URL}${C.reset}`);
  console.log(`${C.grey}Token saved ${config.savedAt || "unknown"} · ${CONFIG_PATH}${C.reset}`);
}

async function cmdLogout() {
  await clearConfig();
  console.log(`${C.grey}Signed out — token cleared from ${CONFIG_PATH}${C.reset}`);
}

async function cmdPortfolio(opts) {
  // No file given → use the live portfolio from the signed-in SPECTRE account.
  let holdings;
  if (opts.target) {
    holdings = await readPortfolio(opts.target);
    console.log(`${C.grey}Analysing ${holdings.length} holdings from ${opts.target}…${C.reset}`);
  } else {
    const account = await fetchAccountPortfolio();
    // Pass the whole holding through — cash balances and unquoted funds carry
    // their value from the account and must stay in the book.
    holdings = account.holdings;
    if (!holdings.length) {
      console.log(`\n${C.orange}Your SPECTRE account has no holdings imported yet.${C.reset}`);
      console.log(`${C.grey}Import a broker, super or crypto export on spectre-assets.com, then run this again.${C.reset}`);
      return;
    }
    console.log(`${C.grey}Analysing ${holdings.length} live holdings from your SPECTRE account…${C.reset}`);
  }

  const summary = await valueHoldings(holdings);

  if (opts.json) { console.log(JSON.stringify(summary, null, 2)); return; }

  const cashNote = summary.cashValue > 0
    ? `, ${money(summary.cashValue)} cash (${fmt(summary.cashPct, 0)}%)`
    : "";
  console.log(
    `\n${C.bold}${C.white}Portfolio${C.reset}  ${C.bold}${money(summary.totalValue)}${C.reset}` +
      `   ${tone(summary.weightedDayPct)}${pct(summary.weightedDayPct, 2)} today${C.reset}` +
      `   ${C.grey}${summary.positions.length} holding${summary.positions.length === 1 ? "" : "s"}${cashNote}${C.reset}\n`,
  );
  console.log(
    `  ${C.grey}${"SYMBOL".padEnd(10)}${"WEIGHT".padStart(8)}${"VALUE".padStart(12)}` +
      `${"TODAY".padStart(9)}${"30D".padStart(9)}${"P/L".padStart(9)}${"RSI".padStart(6)}${C.reset}`,
  );
  const rows = [...summary.positions, ...summary.cashHoldings.map((c) => ({
    ...c, weight: summary.totalValue > 0 ? (c.value / summary.totalValue) * 100 : 0,
  }))];
  for (const p of rows) {
    // Cash and unquoted holdings have a value and a weight but no market
    // statistics — show them in the book with dashes rather than hiding them.
    console.log(
      `  ${C.white}${String(p.symbol || p.label).slice(0, 10).padEnd(10)}${C.reset}${String(fmt(p.weight, 1) + "%").padStart(8)}` +
        `${money(p.value).padStart(12)}` +
        `${tone(p.dayPct)}${pct(p.dayPct).padStart(9)}${C.reset}` +
        `${tone(p.ret30)}${pct(p.ret30).padStart(9)}${C.reset}` +
        `${tone(p.pnlPct)}${(p.pnlPct == null ? "—" : pct(p.pnlPct)).padStart(9)}${C.reset}` +
        `${String(fmt(p.rsi, 0)).padStart(6)}`,
    );
  }
  if (summary.statsUnavailable.length) {
    console.log(
      `\n  ${C.grey}Counted in the total, but no market statistics: ` +
        `${summary.statsUnavailable.map((u) => u.label).join(", ")}${C.reset}`,
    );
  }
  if (summary.unvalued.length) {
    console.log(`  ${C.grey}Could not value: ${summary.unvalued.map((u) => u.label).join(", ")}${C.reset}`);
  }

  console.log(`\n${C.bold}Flags${C.reset}`);
  printFlags(summary.flags);
  const holdingAlerts = summary.positions.flatMap((p) =>
    (p.anomalies ?? []).filter((a) => a.severity !== "info")
      .map((a) => ({ ...a, title: `${p.symbol || p.label}: ${a.title}` })),
  );
  if (holdingAlerts.length) { console.log(`\n${C.bold}Holding-level flags${C.reset}`); printFlags(holdingAlerts); }

  await runAi(opts, null, buildPortfolioPrompt(summary));
  console.log(`\n${C.dim}${DISCLAIMER}${C.reset}`);
}

/**
 * Which copy of the code this machine is actually running.
 *
 * The MCP server and this CLI run from files on your own computer, so a fix
 * pushed to the repository changes nothing here until those files are updated.
 * A stale copy behaves exactly like a bug, so make the version checkable.
 */
async function cmdVersion() {
  console.log(`\n${C.bold}${C.orange}SPECTRE Local${C.reset} ${C.bold}v${LOCAL_VERSION}${C.reset}`);
  console.log(`${C.grey}Running from: ${new URL(".", import.meta.url).pathname}${C.reset}`);
  console.log(`${C.grey}Node ${process.version}${C.reset}`);

  // v1.1.0 is the first release that keeps cash and unquoted holdings in the
  // book, so it is the thing worth confirming.
  let holdingsModule = false;
  try {
    await import("./lib/holdings.mjs");
    holdingsModule = true;
  } catch { /* older copy */ }
  console.log(
    holdingsModule
      ? `\n  ${C.green}✓${C.reset} Cash and unquoted holdings are included in your portfolio total`
      : `\n  ${C.red}✗${C.reset} This copy is out of date — cash and unlisted funds will be missing.\n` +
        `    ${C.grey}Update it with: git pull${C.reset}`,
  );

  const config = await readConfig();
  console.log(
    config?.email
      ? `  ${C.green}✓${C.reset} Signed in as ${config.email} ${C.grey}(${config.baseUrl || DEFAULT_BASE_URL})${C.reset}`
      : `  ${C.orange}○${C.reset} Not signed in — run ${C.white}node spectre.mjs login${C.reset}`,
  );

  // A checkout on a detached HEAD silently refuses every `git pull` — the copy
  // then sits frozen at whatever commit it was pinned to while looking like a
  // normal clone, which is indistinguishable from the tools being broken.
  // Diagnose it here rather than leaving it to be discovered.
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    const dir = new URL(".", import.meta.url).pathname;
    const { stdout } = await run("git", ["-C", dir, "symbolic-ref", "--quiet", "HEAD"]);
    const branch = stdout.trim().replace("refs/heads/", "");
    console.log(`  ${C.green}✓${C.reset} On branch ${branch} ${C.grey}— \`git pull\` will update this copy${C.reset}\n`);
  } catch {
    console.log(
      `  ${C.red}✗${C.reset} Detached HEAD — ${C.white}git pull does nothing here${C.reset}, this copy is frozen.\n` +
      `    ${C.grey}Fix: git fetch origin && git checkout -B live origin/claude/review-spectre-repo-ezHA3${C.reset}\n`,
    );
  }
}

function usage() {
  console.log(`
${C.bold}${C.orange}SPECTRE Local${C.reset} ${C.grey}— portfolio intelligence on your own machine${C.reset}

  ${C.bold}scan${C.reset} <TICKER>            Scan one stock (ASX tickers resolve first)
  ${C.bold}portfolio${C.reset}              Analyse your live SPECTRE account holdings
  ${C.bold}portfolio${C.reset} <file.csv>     Analyse a holdings CSV instead
  ${C.bold}login${C.reset}                  Connect this machine to your SPECTRE account
  ${C.bold}whoami${C.reset} / ${C.bold}logout${C.reset}        Show or clear the signed-in account
  ${C.bold}version${C.reset}                Which copy of SPECTRE Local this machine is running

${C.grey}Options${C.reset}
  --no-ai              Statistics and flags only; no local model needed
  --json               Machine-readable output (implies --no-ai)
  --model <name>       Ollama model to use (default: spectre)
  --host <url>         Ollama host (default: ${DEFAULT_HOST})

${C.grey}Examples${C.reset}
  node spectre.mjs scan BHP
  node spectre.mjs scan NVDA --model llama3.1:8b
  node spectre.mjs portfolio sample-portfolio.csv
  node spectre.mjs scan CBA --json > cba.json

${C.dim}${DISCLAIMER}${C.reset}
`);
}

const opts = parseArgs(process.argv.slice(2));
try {
  if (opts.command === "scan") await cmdScan(opts);
  else if (opts.command === "portfolio") await cmdPortfolio(opts);
  else if (opts.command === "login") await cmdLogin();
  else if (opts.command === "whoami") await cmdWhoami();
  else if (opts.command === "logout") await cmdLogout();
  else if (opts.command === "version" || opts.command === "--version") await cmdVersion();
  else usage();
} catch (err) {
  console.error(`\n${C.red}${err.message}${C.reset}\n`);
  process.exit(1);
}
