#!/usr/bin/env node
// SPECTRE MCP server — connect your own AI to your portfolio.
//
// Speaks the Model Context Protocol over stdio, so any MCP client can use it:
// Claude Desktop, LM Studio, Cursor, Zed, Open WebUI (and therefore Ollama).
//
// Deliberately zero-dependency. The whole protocol surface is ~150 lines of
// JSON-RPC below, so you can read every line that touches your holdings before
// you run it. Nothing is sent anywhere except public price lookups.
//
// Setup: see README.md → "Connect your own AI"

import { analyse, analysePortfolio } from "./lib/engine.mjs";
import { loadBars } from "./lib/quotes.mjs";
import { readPortfolio } from "./lib/portfolio.mjs";

const SERVER_INFO = { name: "spectre", version: "1.0.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL = "2025-06-18";
const DISCLAIMER =
  "Possible anomalies only — statistical flags computed from public market data, " +
  "not financial advice or a recommendation. The user has the final say on every decision.";

// stdout carries protocol frames only. Anything diagnostic goes to stderr,
// otherwise the client sees corrupt JSON-RPC and drops the connection.
const log = (...args) => console.error("[spectre-mcp]", ...args);

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "scan_stock",
    description:
      "Analyse one listed stock and return computed statistics plus any statistical anomalies. " +
      "Covers price, RSI, moving averages, 52-week position, volume vs average, volatility and drawdown. " +
      "Bare tickers resolve to the ASX first (BHP means BHP.AX); use a suffix or a US symbol for other markets. " +
      "All figures are computed deterministically from a year of daily bars — use them as given, do not recalculate.",
    inputSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Ticker symbol, e.g. BHP, CBA.AX, NVDA" },
      },
      required: ["ticker"],
    },
  },
  {
    name: "compare_stocks",
    description:
      "Analyse several stocks at once and return their statistics side by side for comparison. " +
      "Same engine and caveats as scan_stock.",
    inputSchema: {
      type: "object",
      properties: {
        tickers: {
          type: "array",
          items: { type: "string" },
          description: "Ticker symbols to compare (max 10)",
        },
      },
      required: ["tickers"],
    },
  },
  {
    name: "analyse_portfolio",
    description:
      "Read a holdings CSV from the local machine, price every position live, and return per-holding " +
      "statistics plus portfolio-level concentration and risk analysis (weights, top-3 share, effective " +
      "number of positions, weighted volatility, per-holding anomaly flags). " +
      "The CSV needs a ticker column and a units column; a cost column adds profit/loss. " +
      "Holdings are read locally and never transmitted anywhere.",
    inputSchema: {
      type: "object",
      properties: {
        csv_path: { type: "string", description: "Absolute or relative path to the holdings CSV" },
      },
      required: ["csv_path"],
    },
  },
];

// ── Tool implementations ────────────────────────────────────────────────────

async function scanStock({ ticker }) {
  if (!ticker || typeof ticker !== "string") throw new Error("ticker is required");
  const bars = await loadBars(ticker);
  if (!bars) throw new Error(`No price data found for "${ticker}" — check the ticker symbol`);
  const result = analyse(bars.rows, bars.meta);
  if (result.error) throw new Error(result.error);
  return { ...result, disclaimer: DISCLAIMER };
}

async function compareStocks({ tickers }) {
  if (!Array.isArray(tickers) || tickers.length === 0) throw new Error("tickers must be a non-empty array");
  const list = tickers.slice(0, 10);
  const results = [];
  const failed = [];
  for (const t of list) {
    try {
      const bars = await loadBars(t);
      if (!bars) { failed.push(t); continue; }
      const r = analyse(bars.rows, bars.meta);
      if (r.error) { failed.push(t); continue; }
      results.push({ ...r.stats, anomalies: r.anomalies });
    } catch {
      failed.push(t);
    }
  }
  if (!results.length) throw new Error(`Could not price any of: ${list.join(", ")}`);
  return { compared: results, unavailable: failed, disclaimer: DISCLAIMER };
}

async function analysePortfolioTool({ csv_path: csvPath }) {
  if (!csvPath || typeof csvPath !== "string") throw new Error("csv_path is required");
  const holdings = await readPortfolio(csvPath);
  const positions = [];
  const unavailable = [];
  for (const h of holdings) {
    const bars = await loadBars(h.ticker);
    if (!bars) { unavailable.push(h.ticker); continue; }
    const r = analyse(bars.rows, bars.meta);
    if (r.error) { unavailable.push(h.ticker); continue; }
    const value = r.stats.price * h.units;
    positions.push({
      ...r.stats,
      units: h.units,
      costBase: h.costBase,
      value,
      pnlPct: h.costBase > 0 ? ((r.stats.price - h.costBase) / h.costBase) * 100 : null,
      anomalies: r.anomalies,
    });
  }
  if (!positions.length) throw new Error("Could not price any holdings — check the tickers in the CSV");
  const summary = analysePortfolio(positions);
  if (summary.error) throw new Error(summary.error);
  return { ...summary, unavailable, disclaimer: DISCLAIMER };
}

const HANDLERS = {
  scan_stock: scanStock,
  compare_stocks: compareStocks,
  analyse_portfolio: analysePortfolioTool,
};

// ── JSON-RPC over stdio ─────────────────────────────────────────────────────

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handleRequest(msg) {
  const { id, method, params } = msg;

  // Notifications carry no id and must never be answered.
  if (id === undefined || id === null) return;

  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      const version = SUPPORTED_PROTOCOLS.includes(asked) ? asked : DEFAULT_PROTOCOL;
      respond(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "SPECTRE computes portfolio and market statistics deterministically. " +
          "Every figure these tools return was calculated in code — cite them exactly and never " +
          "recompute or estimate them. Surface what is statistically unusual and what it has " +
          "historically implied, but never tell the user to buy, sell or hold: they decide.",
      });
      return;
    }

    case "ping":
      respond(id, {});
      return;

    case "tools/list":
      respond(id, { tools: TOOLS });
      return;

    case "tools/call": {
      const name = params?.name;
      const handler = HANDLERS[name];
      if (!handler) {
        respondError(id, -32602, `Unknown tool: ${name}`);
        return;
      }
      try {
        const result = await handler(params?.arguments ?? {});
        respond(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 1) }],
        });
      } catch (err) {
        // Tool failures are reported in-band so the model can react to them,
        // rather than as protocol errors which would abort the call.
        respond(id, {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          isError: true,
        });
      }
      return;
    }

    default:
      respondError(id, -32601, `Method not found: ${method}`);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      log("ignoring unparseable line");
      continue;
    }
    handleRequest(msg).catch((err) => {
      log("handler crashed:", err.message);
      if (msg?.id != null) respondError(msg.id, -32603, `Internal error: ${err.message}`);
    });
  }
});

process.stdin.on("end", () => process.exit(0));
log(`ready — ${TOOLS.length} tools over stdio`);
