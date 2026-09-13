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

import { analyse } from "./lib/engine.mjs";
import { loadBars } from "./lib/quotes.mjs";
import { valueHoldings } from "./lib/holdings.mjs";
import { readPortfolio } from "./lib/portfolio.mjs";
import { fetchAccountPortfolio, readConfig, apiGet } from "./lib/account.mjs";

// Bump this whenever the shape of what a tool returns changes. It is stamped
// onto get_portfolio's result so you can tell, from the AI's own answer,
// whether the machine running this server is on current code — a stale copy
// is otherwise indistinguishable from a bug.
const SERVER_VERSION = "1.1.0";
const SERVER_INFO = { name: "spectre", version: SERVER_VERSION };
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
    name: "get_portfolio",
    description:
      "Read the user's CURRENT portfolio straight from their signed-in SPECTRE account and analyse it. " +
      "This is the live portfolio they maintain on spectre-assets.com — it reflects whatever they have " +
      "imported or changed, re-read fresh every time this is called, so it is always up to date. " +
      "Prefer this over analyse_portfolio whenever the user refers to 'my portfolio' or 'my holdings' " +
      "without naming a file. Returns EVERY holding in the account — listed securities with full " +
      "statistics and anomaly flags, plus cash balances (`cashHoldings`, `cashValue`, `cashPct`) and " +
      "anything without a public quote such as super or unlisted funds, which carry their value from " +
      "the account and appear under `statsUnavailable`. `totalValue` and every weight cover all of it. " +
      "Also returns portfolio-level concentration and risk analysis. " +
      "Requires the user to have run `node spectre.mjs login` once.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "myrmidon_status",
    description:
      "Read the current state of Myrmidon, the autonomous paper-trading agent: account equity, cash, " +
      "buying power, open positions with unrealised P/L, and whether the strategy is running or in " +
      "autopilot. Myrmidon trades a PAPER account — simulated money, not real funds. " +
      "Only available on the trader's own account.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "myrmidon_decisions",
    description:
      "Read Myrmidon's decision log: what it did on each run, why, which trades it proposed or executed, " +
      "and which its guardrails rejected. Use this to review or audit the agent's behaviour over time. " +
      "Only available on the trader's own account.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many recent decisions to return (default 20, max 100)" },
      },
    },
  },
  {
    name: "myrmidon_strategy",
    description:
      "Read the plain-English strategy Myrmidon is currently following, plus its configured guardrails " +
      "(cash floor, position caps, daily trade cap, confirm window). Read-only — this tool cannot change " +
      "the strategy or place trades. Only available on the trader's own account.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "analyse_portfolio",
    description:
      "Analyse a holdings CSV FILE on disk, for a portfolio that is not in the user's SPECTRE account " +
      "(a what-if, an old export, someone else's book). For the user's own current holdings use " +
      "get_portfolio instead. Paths may use ~ for the home directory. " +
      "Prices every position live and returns per-holding " +
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
  {
    name: "portfolio_risk",
    description:
      "The user's FULL risk analysis, computed by SPECTRE itself rather than by this tool — every " +
      "measure the Quant tab on spectre-assets.com shows. Returns concentration (top-3 share, HHI, " +
      "largest account, index-fund share), allocation by sector and by account, and two independent " +
      "risk reads: `snapshotRisk` from the user's own recorded portfolio values, and `historicalRisk` " +
      "rebuilt from market price history, which adds annualised volatility, max drawdown, VaR 95, " +
      "CVaR 95, Cornish-Fisher VaR, beta and correlation to benchmark, tracking error, Sharpe, " +
      "Sortino, return skewness, RSI, stochastic, OBV, a full correlation matrix across holdings, " +
      "factor exposure (market and size beta) and the current volatility regime. " +
      "Use this whenever the user asks about risk, volatility, drawdown, correlation, diversification, " +
      "beta or how exposed they are — get_portfolio covers holdings and per-stock anomalies, this " +
      "covers portfolio risk. Requires `node spectre.mjs login`.",
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          enum: ["1M", "3M", "1Y"],
          description: "Look-back window for the risk measures (default 3M)",
        },
      },
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

async function priceHoldings(holdings) {
  return { ...(await valueHoldings(holdings)), disclaimer: DISCLAIMER };
}

async function getPortfolioTool() {
  const account = await fetchAccountPortfolio();
  if (!account.holdings.length) {
    return {
      holdings: [],
      message:
        "The SPECTRE account is signed in but has no holdings imported yet. " +
        "Import a broker, super or crypto export on spectre-assets.com, then ask again.",
      disclaimer: DISCLAIMER,
    };
  }
  const result = await priceHoldings(account.holdings);
  return {
    source: "spectre-account",
    spectreToolVersion: SERVER_VERSION,
    fetchedAt: new Date().toISOString(),
    holdingCount: account.holdings.length,
    ...result,
    coverageNote:
      "totalValue covers every holding in the account, including cash and anything without a " +
      "public quote. Holdings listed under statsUnavailable are part of the portfolio and are " +
      "counted in totalValue and in every weight — report them, do not describe them as missing.",
  };
}

/**
 * Risk straight from SPECTRE.
 *
 * Deliberately a thin passthrough: the numbers are computed on the server that
 * already holds the portfolio, so this tool cannot drift from what the website
 * shows, and a measure added there reaches connected AIs without anyone
 * updating files on their own machine.
 */
async function portfolioRiskTool({ window } = {}) {
  const allowed = new Set(["1M", "3M", "1Y"]);
  const riskWindow = allowed.has(String(window)) ? String(window) : "3M";
  const data = await apiGet(`/api/portfolio/metrics?window=${riskWindow}`);
  return { ...data, spectreToolVersion: SERVER_VERSION, disclaimer: DISCLAIMER };
}

async function analysePortfolioTool({ csv_path: csvPath }) {
  if (!csvPath || typeof csvPath !== "string") throw new Error("csv_path is required");
  const holdings = await readPortfolio(csvPath);
  return { source: csvPath, ...(await priceHoldings(holdings)) };
}

// Myrmidon tools are read-only by design. The agent's order path stays behind
// its own guardrails and confirm window — an AI assistant can inspect and
// critique what it did, but cannot place or approve a trade through here.
const PAPER_NOTE =
  "Myrmidon trades a PAPER account — simulated money, not real funds. " +
  "These figures are not a real brokerage balance.";

async function myrmidonStatus() {
  // Fetch the account first: if the caller isn't permitted, fail the whole tool
  // rather than returning a success payload with an error buried inside it.
  const account = await apiGet("/api/trading/account");
  const [positions, strategy] = await Promise.all([
    apiGet("/api/trading/positions").catch((e) => ({ error: e.message })),
    apiGet("/api/trading/strategy").catch(() => null),
  ]);
  return {
    account,
    positions,
    strategyRunning: strategy?.enabled ?? null,
    autopilot: strategy?.autopilot ?? null,
    accountType: "paper",
    note: PAPER_NOTE,
    disclaimer: DISCLAIMER,
  };
}

async function myrmidonDecisions({ limit }) {
  const n = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const data = await apiGet(`/api/trading/decisions?limit=${n}`);
  return { ...data, accountType: "paper", note: PAPER_NOTE, disclaimer: DISCLAIMER };
}

async function myrmidonStrategy() {
  const data = await apiGet("/api/trading/strategy");
  return {
    ...data,
    readOnly: true,
    note: PAPER_NOTE + " This tool cannot modify the strategy or place trades.",
    disclaimer: DISCLAIMER,
  };
}

const HANDLERS = {
  scan_stock: scanStock,
  compare_stocks: compareStocks,
  get_portfolio: getPortfolioTool,
  myrmidon_status: myrmidonStatus,
  myrmidon_decisions: myrmidonDecisions,
  myrmidon_strategy: myrmidonStrategy,
  analyse_portfolio: analysePortfolioTool,
  portfolio_risk: portfolioRiskTool,
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
          "historically implied, but never tell the user to buy, sell or hold: they decide. " +
          "When the user mentions 'my portfolio' or 'my holdings', call get_portfolio — it reads " +
          "their live SPECTRE account and is always current. Do not ask them for a file path first. " +
          "get_portfolio returns the whole book: cash sits in cashHoldings/cashValue, and holdings " +
          "without a public quote (super, unlisted funds) appear in positions with a statsUnavailable " +
          "reason. Those are part of the portfolio and are already counted in totalValue and in every " +
          "weight — report them as holdings, never as unavailable or missing. Only say a figure is " +
          "unavailable when it appears under `unvalued`. " +
          "For anything about risk, volatility, drawdown, correlation, diversification or beta, call portfolio_risk — it returns SPECTRE's own full analysis rather than a local approximation of it. The myrmidon_* tools cover the autonomous trading agent, which runs on a PAPER account: " +
          "always say so rather than presenting its equity as real money, and note that these tools " +
          "are read-only — you cannot place, approve or cancel a trade.",
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
