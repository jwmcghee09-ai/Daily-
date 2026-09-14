// Drives the SPECTRE MCP server exactly like a real client: spawn it, do the
// initialize handshake, list tools, then call each one and check the results.
import { spawn } from "node:child_process";

const server = spawn("node", ["mcp-server.mjs"], { cwd: new URL(".", import.meta.url).pathname });
let buf = "";
const pending = new Map();
let stderrOut = "";

server.stderr.on("data", (d) => { stderrOut += d.toString(); });
server.stdout.setEncoding("utf8");
server.stdout.on("data", (chunk) => {
  buf += chunk;
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch { console.log("✗ NON-JSON ON STDOUT:", line.slice(0, 120)); continue; }
    const resolve = pending.get(msg.id);
    if (resolve) { pending.delete(msg.id); resolve(msg); }
  }
});

let nextId = 1;
function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    setTimeout(() => reject(new Error(`timeout on ${method}`)), 90000);
  });
}
function notify(method, params) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${extra ? "  " + extra : ""}`);
  if (!ok) failures++;
};

const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test-harness", version: "1.0.0" },
});
check("initialize", init.result?.serverInfo?.name === "spectre", `protocol ${init.result?.protocolVersion}`);
check("declares tools capability", !!init.result?.capabilities?.tools);
check("sends instructions", (init.result?.instructions ?? "").includes("never"));

// A notification must produce no reply — if it does, ids desync.
notify("notifications/initialized");
await new Promise((r) => setTimeout(r, 250));
check("notification drew no response", pending.size === 0);

const list = await rpc("tools/list");
const names = (list.result?.tools ?? []).map((t) => t.name);
// Name the tools rather than counting them: a count says nothing about which
// one went missing, and it fails for the wrong reason when one is added.
const EXPECTED_TOOLS = [
  "scan_stock", "compare_stocks", "get_portfolio", "myrmidon_status",
  "myrmidon_decisions", "myrmidon_strategy", "analyse_portfolio", "portfolio_risk",
  "market_scan", "market_news", "market_movers", "macro_indicators",
];
const missingTools = EXPECTED_TOOLS.filter((t) => !names.includes(t));
check("tools/list", missingTools.length === 0,
  missingTools.length ? `MISSING: ${missingTools.join(", ")}` : names.join(", "));
check("every tool has an inputSchema", (list.result?.tools ?? []).every((t) => t.inputSchema?.type === "object"));

const scan = await rpc("tools/call", { name: "scan_stock", arguments: { ticker: "BHP" } });
const scanData = JSON.parse(scan.result.content[0].text);
check("scan_stock returns ASX resolution", scanData.stats?.symbol === "BHP.AX", `price ${scanData.stats?.price?.toFixed(2)} ${scanData.stats?.currency}`);
check("scan_stock computes RSI", typeof scanData.stats?.rsi === "number", `rsi ${scanData.stats?.rsi?.toFixed(1)}`);
check("scan_stock carries disclaimer", (scanData.disclaimer ?? "").includes("final say"));

const cmp = await rpc("tools/call", { name: "compare_stocks", arguments: { tickers: ["CBA", "NVDA"] } });
const cmpData = JSON.parse(cmp.result.content[0].text);
check("compare_stocks", cmpData.compared?.length === 2, cmpData.compared?.map((c) => c.symbol).join(" vs "));

const pf = await rpc("tools/call", { name: "analyse_portfolio", arguments: { csv_path: "sample-portfolio.csv" } });
const pfData = JSON.parse(pf.result.content[0].text);
check("analyse_portfolio", pfData.positions?.length > 0, `${pfData.positions?.length} positions, $${Math.round(pfData.totalValue).toLocaleString()}`);
check("portfolio computes concentration", typeof pfData.top3Pct === "number", `top3 ${pfData.top3Pct?.toFixed(0)}%`);

// Error paths must come back in-band, not as protocol errors.
const bad = await rpc("tools/call", { name: "scan_stock", arguments: { ticker: "ZZZQQ999" } });
check("bad ticker → isError, not a crash", bad.result?.isError === true, bad.result?.content?.[0]?.text?.slice(0, 48));

const missing = await rpc("tools/call", { name: "no_such_tool", arguments: {} });
check("unknown tool → JSON-RPC error", missing.error?.code === -32602);

const badFile = await rpc("tools/call", { name: "analyse_portfolio", arguments: { csv_path: "/nope.csv" } });
check("missing CSV → isError", badFile.result?.isError === true);

const acct = await rpc("tools/call", { name: "get_portfolio", arguments: {} });
const acctText = acct.result.content[0].text;
// Signed out, the tool answers with a plain-text error rather than JSON —
// a normal state for anyone running this before `spectre.mjs login`, so the
// harness must report it instead of dying on JSON.parse.
let acctData = null;
try { acctData = JSON.parse(acctText); } catch { /* plain-text error */ }

if (acctData?.positions) {
  check("get_portfolio reads live account", acctData.positions.length > 0,
    `${acctData.positions.length} positions, source=${acctData.source}`);
  check("get_portfolio stamps fetch time", !!acctData.fetchedAt);
  check("get_portfolio stamps its version", !!acctData.spectreToolVersion,
    `v${acctData.spectreToolVersion}`);
  // The whole point of v1.1.0: cash and unquoted holdings stay in the book.
  check("get_portfolio totals the whole book",
    typeof acctData.totalValue === "number" && typeof acctData.cashValue === "number"
      && Array.isArray(acctData.cashHoldings) && Array.isArray(acctData.statsUnavailable),
    `total=${Math.round(acctData.totalValue)}, cash=${Math.round(acctData.cashValue)}, ` +
      `${acctData.statsUnavailable.length} without stats`);
} else {
  check("get_portfolio responds sensibly when signed out or empty",
    !!acctData?.message || acct.result.isError === true,
    (acctData?.message || acctText).slice(0, 70));
  console.log("  (sign in with `node spectre.mjs login` to test the live account path)");
}

// portfolio_risk is a passthrough to the website's own analysis, so the check
// that matters is that SPECTRE's figures actually arrive — not that the local
// engine recomputed something resembling them.
const risk = await rpc("tools/call", { name: "portfolio_risk", arguments: { window: "3M" } });
let riskData = null;
try { riskData = JSON.parse(risk.result.content[0].text); } catch { /* plain-text error */ }
if (riskData?.portfolio) {
  check("portfolio_risk returns SPECTRE's concentration figures",
    typeof riskData.portfolio.hhi === "number" && Array.isArray(riskData.portfolio.sectorAllocation),
    `top3 ${riskData.portfolio.top3ConcentrationPct?.toFixed(1)}%, hhi ${riskData.portfolio.hhi?.toFixed(0)}`);
  const h = riskData.historicalRisk;
  check("portfolio_risk returns the full risk surface",
    !!h && "betaToBenchmark" in h && "sharpeRatioAnnual" in h && "correlationMatrix" in h,
    h ? `vol ${h.volatilityAnnualPct?.toFixed(1)}%, beta ${h.betaToBenchmark?.toFixed(2)}` : String(riskData.historicalRiskError));
  check("portfolio_risk never labels a holding with an import placeholder",
    (riskData.portfolio.topHoldings ?? []).every((x) => !/^(GOLD|INDEX|FUND|SAVINGS|TAX|CRYPTO)-\d+$/.test(x.label)),
    (riskData.portfolio.topHoldings ?? []).map((x) => x.label).join(", "));
} else {
  check("portfolio_risk responds sensibly when signed out",
    risk.result.isError === true || !!riskData?.error,
    (riskData?.error || risk.result.content[0].text).slice(0, 70));
}

// market_scan is a passthrough to the website's scanner, so what matters is
// that the advanced indicators actually arrive — not that a local copy
// recomputed something resembling them.
const mscan = await rpc("tools/call", { name: "market_scan", arguments: { symbol: "BHP" } });
let mscanData = null;
try { mscanData = JSON.parse(mscan.result.content[0].text); } catch { /* plain-text error */ }
if (mscanData?.price) {
  check("market_scan returns the advanced indicator set",
    ["macd", "bollinger", "atr", "adx", "stochastic", "obv", "levels"].every((k) => k in mscanData),
    `${mscanData.symbol} $${mscanData.price?.toFixed(2)}, ADX ${mscanData.adx?.adx?.toFixed(1)}`);
  check("market_scan compares against the right benchmark",
    !mscanData.relativeStrength || mscanData.relativeStrength.benchmark === (mscanData.symbol.endsWith(".AX") ? "^AXJO" : "^GSPC"),
    mscanData.relativeStrength?.benchmarkName ?? "none");
  // The bug this guards: a swing low above the current price is not support.
  const levels = mscanData.levels ?? { support: [], resistance: [] };
  check("market_scan never reports support above the price",
    levels.support.every((l) => l < mscanData.price) && levels.resistance.every((l) => l > mscanData.price),
    `price ${mscanData.price.toFixed(2)}`);
} else {
  check("market_scan responds sensibly when signed out",
    mscan.result.isError === true || !!mscanData?.error,
    (mscanData?.error || mscan.result.content[0].text).slice(0, 60));
}

const pong = await rpc("ping");
check("ping", pong.result && Object.keys(pong.result).length === 0);

check("stderr used for logs, not stdout", stderrOut.includes("ready"));

server.kill();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll MCP checks passed");
process.exit(failures ? 1 : 0);
