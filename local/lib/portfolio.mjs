// Holdings CSV reader. Deliberately forgiving about column names so broker
// exports (CommSec, Selfwealth, CoinSpot, a hand-rolled spreadsheet) work
// without editing. Nothing here leaves the machine.

import { readFile } from "node:fs/promises";

const TICKER_KEYS = ["ticker", "code", "symbol", "asx code", "security", "instrument"];
const UNIT_KEYS = ["units", "quantity", "qty", "shares", "holding", "amount"];
const COST_KEYS = ["cost", "avg cost", "average cost", "purchase price", "unit cost", "buy price", "cost base"];

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if ((ch === "," || ch === "\t") && !quoted) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function pickIndex(headers, keys) {
  for (const key of keys) {
    const i = headers.findIndex((h) => h === key);
    if (i !== -1) return i;
  }
  for (const key of keys) {
    const i = headers.findIndex((h) => h.includes(key));
    if (i !== -1) return i;
  }
  return -1;
}

function toNumber(raw) {
  if (raw == null) return NaN;
  return Number(String(raw).replace(/[$,\s]/g, ""));
}

/** @returns {{ticker:string,units:number,costBase:number|null}[]} */
export async function readPortfolio(filePath) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`No such file: ${filePath}`);
    throw err;
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV needs a header row and at least one holding");

  // Tolerate preamble lines above the real header (common in broker exports).
  let headerIdx = 0;
  let headers = [];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cols = splitCsvLine(lines[i]).map((h) => h.toLowerCase());
    if (pickIndex(cols, TICKER_KEYS) !== -1 && pickIndex(cols, UNIT_KEYS) !== -1) {
      headerIdx = i;
      headers = cols;
      break;
    }
  }
  if (!headers.length) {
    throw new Error(
      "Could not find ticker and units columns. Expected headers like: Ticker,Units,Cost",
    );
  }

  const tIdx = pickIndex(headers, TICKER_KEYS);
  const uIdx = pickIndex(headers, UNIT_KEYS);
  const cIdx = pickIndex(headers, COST_KEYS);

  const holdings = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cols = splitCsvLine(line);
    const ticker = (cols[tIdx] || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    const units = toNumber(cols[uIdx]);
    if (!ticker || !Number.isFinite(units) || units <= 0) continue;
    const costBase = cIdx === -1 ? null : (Number.isFinite(toNumber(cols[cIdx])) ? toNumber(cols[cIdx]) : null);
    holdings.push({ ticker, units, costBase });
  }

  if (!holdings.length) throw new Error("No valid holdings rows found");
  return holdings;
}
