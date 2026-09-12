#!/usr/bin/env node
// SPECTRE Local — portfolio intelligence that runs on your machine.
//
//   node spectre.mjs scan BHP
//   node spectre.mjs portfolio my-holdings.csv
//   node spectre.mjs scan NVDA --no-ai        # numbers only, no model needed
//
// The statistics are computed locally by code. A local Ollama model writes the
// explanation. Your holdings never leave the machine.

import { analyse, analysePortfolio } from "./lib/engine.mjs";
import { loadBars } from "./lib/quotes.mjs";
import { readPortfolio } from "./lib/portfolio.mjs";
import { chat, ensureModel, OllamaUnavailable, OllamaModelMissing, DEFAULT_HOST } from "./lib/ollama.mjs";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[38;5;203m", orange: "\x1b[38;5;209m",
  green: "\x1b[38;5;114m", grey: "\x1b[38;5;245m", white: "\x1b[97m",
};
const DISCLAIMER = "Possible anomalies only — statistical flags, not financial advice. You have the final say.";

function parseArgs(argv) {
  const opts = { command: argv[0], target: argv[1], ai: true, model: "spectre", host: DEFAULT_HOST, json: false };
  for (let i = 2; i < argv.length; i++) {
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
    symbol: p.symbol, name: p.name, weightPct: Number(p.weight.toFixed(2)),
    value: Math.round(p.value), dayPct: p.dayPct, ret30: p.ret30,
    rsi: p.rsi, drawdownPct: p.drawdownPct, annVolPct: p.annVolPct,
    pnlPct: p.pnlPct, alerts: p.anomalies.filter((a) => a.severity !== "info").map((a) => a.title),
  }));
  return [
    "Explain what this portfolio's data shows. Use only the figures below.",
    "Cover: what is driving today, where risk is concentrated, and which holdings the flags point at.",
    "",
    "PORTFOLIO TOTALS",
    JSON.stringify(
      {
        totalValue: Math.round(summary.totalValue),
        weightedDayPct: summary.weightedDayPct,
        top3Pct: summary.top3Pct,
        effectiveNames: summary.effectiveNames,
        weightedAnnVolPct: summary.weightedAnnVolPct,
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

async function cmdPortfolio(opts) {
  if (!opts.target) throw new Error("Usage: spectre portfolio <holdings.csv>");
  const holdings = await readPortfolio(opts.target);
  console.log(`${C.grey}Analysing ${holdings.length} holdings locally…${C.reset}`);

  const positions = [];
  const missing = [];
  for (const h of holdings) {
    const bars = await loadBars(h.ticker);
    if (!bars) { missing.push(h.ticker); continue; }
    const res = analyse(bars.rows, bars.meta);
    if (res.error) { missing.push(h.ticker); continue; }
    const value = res.stats.price * h.units;
    const pnlPct = h.costBase && h.costBase > 0 ? ((res.stats.price - h.costBase) / h.costBase) * 100 : null;
    positions.push({ ...res.stats, units: h.units, costBase: h.costBase, value, pnlPct, anomalies: res.anomalies });
  }
  if (!positions.length) throw new Error("Could not price any holdings — check the tickers in your CSV");

  const summary = analysePortfolio(positions);
  if (summary.error) throw new Error(summary.error);

  if (opts.json) { console.log(JSON.stringify(summary, null, 2)); return; }

  console.log(
    `\n${C.bold}${C.white}Portfolio${C.reset}  ${C.bold}${money(summary.totalValue)}${C.reset}` +
      `   ${tone(summary.weightedDayPct)}${pct(summary.weightedDayPct, 2)} today${C.reset}` +
      `   ${C.grey}${positions.length} priced${missing.length ? `, ${missing.length} skipped` : ""}${C.reset}\n`,
  );
  console.log(
    `  ${C.grey}${"SYMBOL".padEnd(10)}${"WEIGHT".padStart(8)}${"VALUE".padStart(12)}` +
      `${"TODAY".padStart(9)}${"30D".padStart(9)}${"P/L".padStart(9)}${"RSI".padStart(6)}${C.reset}`,
  );
  for (const p of summary.positions) {
    console.log(
      `  ${C.white}${p.symbol.padEnd(10)}${C.reset}${String(fmt(p.weight, 1) + "%").padStart(8)}` +
        `${money(p.value).padStart(12)}` +
        `${tone(p.dayPct)}${pct(p.dayPct).padStart(9)}${C.reset}` +
        `${tone(p.ret30)}${pct(p.ret30).padStart(9)}${C.reset}` +
        `${tone(p.pnlPct)}${(p.pnlPct == null ? "—" : pct(p.pnlPct)).padStart(9)}${C.reset}` +
        `${String(fmt(p.rsi, 0)).padStart(6)}`,
    );
  }
  if (missing.length) console.log(`\n  ${C.grey}Skipped (no price data): ${missing.join(", ")}${C.reset}`);

  console.log(`\n${C.bold}Flags${C.reset}`);
  printFlags(summary.flags);
  const holdingAlerts = summary.positions.flatMap((p) =>
    p.anomalies.filter((a) => a.severity !== "info").map((a) => ({ ...a, title: `${p.symbol}: ${a.title}` })),
  );
  if (holdingAlerts.length) { console.log(`\n${C.bold}Holding-level flags${C.reset}`); printFlags(holdingAlerts); }

  await runAi(opts, null, buildPortfolioPrompt(summary));
  console.log(`\n${C.dim}${DISCLAIMER}${C.reset}`);
}

function usage() {
  console.log(`
${C.bold}${C.orange}SPECTRE Local${C.reset} ${C.grey}— portfolio intelligence on your own machine${C.reset}

  ${C.bold}scan${C.reset} <TICKER>            Scan one stock (ASX tickers resolve first)
  ${C.bold}portfolio${C.reset} <file.csv>     Analyse a whole holdings file

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
  else usage();
} catch (err) {
  console.error(`\n${C.red}${err.message}${C.reset}\n`);
  process.exit(1);
}
