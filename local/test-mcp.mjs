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
check("tools/list", names.length === 7, names.join(", "));
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
const acctData = JSON.parse(acct.result.content[0].text);
if (acctData.positions) {
  check("get_portfolio reads live account", acctData.positions.length > 0,
    `${acctData.positions.length} positions, source=${acctData.source}`);
  check("get_portfolio stamps fetch time", !!acctData.fetchedAt);
} else {
  check("get_portfolio responds sensibly when signed out or empty", !!acctData.message || acct.result.isError === true,
    (acctData.message || acct.result.content[0].text).slice(0, 70));
}

const pong = await rpc("ping");
check("ping", pong.result && Object.keys(pong.result).length === 0);

check("stderr used for logs, not stdout", stderrOut.includes("ready"));

server.kill();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll MCP checks passed");
process.exit(failures ? 1 : 0);
