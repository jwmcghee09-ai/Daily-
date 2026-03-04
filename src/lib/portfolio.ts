export type DataSource = "super" | "asx" | "gold" | "index" | "fund" | "crypto";

export interface CsvRow {
  [key: string]: string | number | null | undefined;
}

export interface PortfolioHolding {
  id: string;
  source: DataSource;
  account: string;
  ticker: string;
  name: string;
  units: number;
  price: number;
  prevClose: number;
  value: number;
  costBase: number;
  sector: string;
  reportDate: string;
  importedAt: string;
}

export interface PortfolioSnapshot {
  date: string;
  value: number;
}

export interface PortfolioState {
  holdings: PortfolioHolding[];
  snapshots: PortfolioSnapshot[];
  updatedAt: string;
  lastPriceRefreshAt: string;
}

export interface AllocationItem {
  name: string;
  value: number;
  pct: number;
}

export interface PortfolioMetrics {
  totalValue: number;
  totalCost: number;
  pnl: number;
  pnlPct: number;
  top3ConcentrationPct: number;
  largestAccountPct: number;
  hhi: number;
  topHoldings: Array<PortfolioHolding & { weightPct: number }>;
  accountAllocation: AllocationItem[];
  sectorAllocation: AllocationItem[];
  history: PortfolioSnapshot[];
  dailyReturns: number[];
  rawDailyReturnsCount: number;
  returnOutliersRemoved: number;
  volatilityAnnualPct: number | null;
  maxDrawdownPct: number | null;
  var95Pct: number | null;
  var95Amount: number | null;
  cvar95Pct: number | null;
  cvar95Amount: number | null;
  riskWindow: RiskWindow;
  riskPointsUsed: number;
  riskStartDate: string | null;
  riskEndDate: string | null;
}

export type RiskWindow = "1M" | "3M" | "1Y";

const RISK_WINDOW_DAYS: Record<RiskWindow, number> = {
  "1M": 31,
  "3M": 92,
  "1Y": 366,
};

const FIELD_ALIASES = {
  account: ["account", "accountname", "portfolio", "broker", "fund", "superaccount", "accountnumber"],
  ticker: ["ticker", "symbol", "pair", "asxcode", "code", "securitycode", "instrument", "stock", "metal", "bullion", "product", "isin", "cusip", "sedol", "ric", "fundcode", "identifier"],
  name: ["name", "fundname", "security", "securityname", "holding", "description", "investment", "asset", "company"],
  units: ["units", "quantity", "qty", "shares", "vol", "cvol", "unitsheld", "availunits", "availableunits", "weight", "weightoz", "weightg", "gram", "grams", "ounce", "ounces", "oz", "troyounce", "troyounces"],
  price: ["price", "unit", "unitprice", "lastprice", "marketprice", "currentprice", "close", "last"],
  value: ["value", "marketvalue", "currentvalue", "valuation", "balance", "amount", "mktvalue", "cost", "ccost", "net"],
  cost: ["costbase", "cost", "bookvalue", "purchasevalue", "avgcost", "averagecost", "purchase"],
  sector: ["sector", "industry", "assetclass", "class", "category"],
  date: ["date", "unitdate", "valuationdate", "asat", "reportdate", "pricedate"],
};

const NON_HOLDING_MARKERS = ["subtotal", "total", "grand total", "chess", "issuer sponsored holdings", "there are no"];

export const EMPTY_STATE: PortfolioState = {
  holdings: [],
  snapshots: [],
  updatedAt: "",
  lastPriceRefreshAt: "",
};

export function extractCsvDataSection(csvText: string): string {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return csvText;
  }

  const headerIndex = lines.findIndex(isLikelyHeaderLine);
  if (headerIndex <= 0) {
    return csvText;
  }

  return lines.slice(headerIndex).join("\n");
}

function isLikelyHeaderLine(line: string): boolean {
  const normalized = normalizeHeader(line);
  const signals = ["code", "ticker", "symbol", "units", "weight", "value", "mktvalue", "purchase", "last"];
  let hits = 0;

  for (const signal of signals) {
    if (normalized.includes(signal)) {
      hits += 1;
    }
  }

  return hits >= 2 && line.includes(",");
}

export function parseRowsToHoldings(rows: CsvRow[], source: DataSource): PortfolioHolding[] {
  const importedAt = new Date().toISOString();

  if (source === "crypto" && looksLikeCryptoTradeLedger(rows)) {
    return parseCryptoTradeRows(rows, importedAt);
  }

  return rows
    .map((row, index) => toHolding(row, source, importedAt, index))
    .filter((holding): holding is PortfolioHolding => Boolean(holding));
}

function looksLikeCryptoTradeLedger(rows: CsvRow[]): boolean {
  return rows.some((raw) => {
    const row = normalizeRowKeys(raw);
    return Boolean(row.pair && (row.vol || row.cvol || row.quantity || row.qty) && (row.type || row.side || row.action));
  });
}

function parseCryptoTradeRows(rows: CsvRow[], importedAt: string): PortfolioHolding[] {
  interface CryptoAggregate {
    account: string;
    ticker: string;
    name: string;
    units: number;
    costBase: number;
    lastPrice: number;
    reportDate: string;
  }

  const map = new Map<string, CryptoAggregate>();

  rows.forEach((raw) => {
    const row = normalizeRowKeys(raw);
    const pairRaw = readFirst(row, ["pair", ...FIELD_ALIASES.ticker]);
    if (!pairRaw) {
      return;
    }

    const ticker = normalizeTicker(toCryptoBaseSymbol(pairRaw));
    if (!ticker) {
      return;
    }

    const side = readFirst(row, ["type", "side", "action"]).toLowerCase();
    const isBuy = side.includes("buy");
    const isSell = side.includes("sell");
    if (!isBuy && !isSell) {
      return;
    }

    const units = toNumber(readFirst(row, ["vol", "cvol", ...FIELD_ALIASES.units]));
    if (!Number.isFinite(units) || units <= 0) {
      return;
    }

    const price = toNumber(readFirst(row, ["price", "cprice", ...FIELD_ALIASES.price]));
    const notional = toNumber(readFirst(row, ["cost", "ccost", "net", ...FIELD_ALIASES.value]));
    const account = readFirst(row, FIELD_ALIASES.account) || "Crypto Wallet";
    const reportDate = parseDate(readFirst(row, FIELD_ALIASES.date)) || todayDate();
    const existing = map.get(ticker) || {
      account,
      ticker,
      name: `${ticker} Position`,
      units: 0,
      costBase: 0,
      lastPrice: Number.isFinite(price) && price > 0 ? price : 0,
      reportDate,
    };

    if (Number.isFinite(price) && price > 0) {
      existing.lastPrice = price;
    }
    if (reportDate > existing.reportDate) {
      existing.reportDate = reportDate;
    }

    if (isBuy) {
      existing.units += units;
      if (Number.isFinite(notional) && notional > 0) {
        existing.costBase += notional;
      } else if (Number.isFinite(price) && price > 0) {
        existing.costBase += units * price;
      }
    } else {
      if (existing.units > 0 && existing.costBase > 0) {
        const reduceUnits = Math.min(units, existing.units);
        const averageCostPerUnit = existing.costBase / existing.units;
        existing.costBase = Math.max(0, existing.costBase - averageCostPerUnit * reduceUnits);
      }
      existing.units = Math.max(0, existing.units - units);
    }

    map.set(ticker, existing);
  });

  let index = 0;
  return Array.from(map.values())
    .map((entry) => {
      if (!Number.isFinite(entry.units) || entry.units <= 0) {
        return null;
      }

      const price = entry.lastPrice > 0 ? entry.lastPrice : entry.costBase > 0 ? entry.costBase / entry.units : 0;
      const value = entry.units * price;
      if (!Number.isFinite(value) || value <= 0) {
        return null;
      }

      const costBase = entry.costBase > 0 ? entry.costBase : value;
      const holding: PortfolioHolding = {
        id: `crypto-${slug(entry.account)}-${slug(entry.ticker)}-${entry.reportDate}-${index}`,
        source: "crypto",
        account: entry.account,
        ticker: entry.ticker,
        name: entry.name,
        units: entry.units,
        price,
        prevClose: price,
        value,
        costBase,
        sector: "Crypto",
        reportDate: entry.reportDate,
        importedAt,
      };
      index += 1;
      return holding;
    })
    .filter((holding): holding is PortfolioHolding => Boolean(holding));
}

function toHolding(
  raw: CsvRow,
  source: DataSource,
  importedAt: string,
  index: number,
): PortfolioHolding | null {
  const row = normalizeRowKeys(raw);

  const account =
    readFirst(row, FIELD_ALIASES.account) ||
    (source === "super"
      ? "Superannuation"
      : source === "gold"
        ? "ABC Bullion"
        : source === "index"
          ? "Index Holdings"
          : source === "fund"
            ? "Mutual Funds"
            : source === "crypto"
              ? "Crypto Wallet"
              : "Brokerage");

  const tickerRaw = readFirst(row, FIELD_ALIASES.ticker);
  const nameRaw = readFirst(row, FIELD_ALIASES.name);

  if (isNonHoldingRow(tickerRaw, nameRaw)) {
    return null;
  }

  const name = nameRaw || tickerRaw || "Unnamed Holding";
  const tickerCandidate =
    tickerRaw ||
    (source === "gold"
      ? `GOLD-${index + 1}`
      : source === "index"
        ? `INDEX-${index + 1}`
        : source === "fund"
          ? `FUND-${index + 1}`
          : source === "crypto"
            ? `CRYPTO-${index + 1}`
          : name);
  const ticker = normalizeTicker(tickerCandidate);
  const maxTickerLength = source === "asx" ? 8 : source === "crypto" ? 20 : 16;

  if (!ticker || ticker.length > maxTickerLength) {
    return null;
  }

  const unitsField = readFirstMatch(row, FIELD_ALIASES.units);
  let units = toNumber(unitsField.value);
  if (Number.isFinite(units) && isGramWeightKey(unitsField.key)) {
    units /= 31.1034768;
  }

  let price = toNumber(readFirst(row, FIELD_ALIASES.price));
  let value = toNumber(readFirst(row, FIELD_ALIASES.value));
  const costField = readFirstMatch(row, FIELD_ALIASES.cost);
  let costBase = toNumber(costField.value);

  if (Number.isFinite(costBase) && Number.isFinite(units) && units > 0 && isPerUnitCostKey(costField.key)) {
    costBase *= units;
  }

  if ((!Number.isFinite(value) || value <= 0) && Number.isFinite(units) && Number.isFinite(price)) {
    value = units * price;
  }

  if ((!Number.isFinite(price) || price <= 0) && Number.isFinite(value) && Number.isFinite(units) && units > 0) {
    price = value / units;
  }

  if (!Number.isFinite(costBase) || costBase <= 0) {
    costBase = value;
  }

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const sector =
    readFirst(row, FIELD_ALIASES.sector) ||
    (source === "super"
      ? "Super"
      : source === "gold"
        ? "Precious Metals"
        : source === "index"
          ? "Index"
          : source === "fund"
            ? "Mutual Fund"
            : source === "crypto"
              ? "Crypto"
              : "Equity");
  const reportDate = parseDate(readFirst(row, FIELD_ALIASES.date)) || todayDate();

  return {
    id: `${source}-${slug(account)}-${slug(ticker)}-${reportDate}-${index}`,
    source,
    account,
    ticker,
    name,
    units: Number.isFinite(units) ? units : 0,
    price: Number.isFinite(price) ? price : 0,
    prevClose: Number.isFinite(price) ? price : 0,
    value,
    costBase,
    sector,
    reportDate,
    importedAt,
  };
}

function isNonHoldingRow(rawTicker: string, rawName = ""): boolean {
  const value = (rawTicker || rawName).trim().toLowerCase();

  if (!value) {
    return true;
  }

  return NON_HOLDING_MARKERS.some((marker) => value.includes(marker));
}

function normalizeRowKeys(row: CsvRow): Record<string, string> {
  return Object.entries(row).reduce<Record<string, string>>((acc, [key, value]) => {
    const normalizedKey = normalizeHeader(key);
    const normalizedValue = value == null ? "" : String(value).trim();
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readFirst(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value && value.length > 0) {
      return value;
    }
  }
  return "";
}

function readFirstMatch(row: Record<string, string>, keys: string[]): { key: string; value: string } {
  for (const key of keys) {
    const value = row[key];
    if (value && value.length > 0) {
      return { key, value };
    }
  }

  return { key: "", value: "" };
}

function isPerUnitCostKey(key: string): boolean {
  return key === "purchase" || key === "avgcost" || key === "averagecost";
}

function isGramWeightKey(key: string): boolean {
  return key === "weightg" || key === "gram" || key === "grams";
}

function toNumber(raw: string): number {
  if (!raw) {
    return Number.NaN;
  }

  const normalized = raw
    .replace(/\(([^)]+)\)/g, "-$1")
    .replace(/[$,%\s]/g, "")
    .replace(/,/g, "")
    .replace(/[^0-9.-]/g, "");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeTicker(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 20);
}

function toCryptoBaseSymbol(value: string): string {
  const cleaned = value.toUpperCase().trim();
  if (cleaned.includes("/")) {
    return cleaned.split("/")[0];
  }
  if (cleaned.includes(":")) {
    return cleaned.split(":")[0];
  }
  if (cleaned.includes("-")) {
    return cleaned.split("-")[0];
  }
  return cleaned;
}

function parseDate(value: string): string | null {
  if (!value) {
    return null;
  }

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) {
    return null;
  }

  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const fullYear = year < 100 ? 2000 + year : year;
  const date = new Date(Date.UTC(fullYear, month - 1, day));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function upsertSnapshot(
  snapshots: PortfolioSnapshot[],
  snapshot: PortfolioSnapshot,
): PortfolioSnapshot[] {
  const map = new Map<string, number>();

  for (const item of snapshots) {
    map.set(item.date, item.value);
  }

  map.set(snapshot.date, snapshot.value);

  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function computeMetrics(
  holdings: PortfolioHolding[],
  snapshots: PortfolioSnapshot[],
  riskWindow: RiskWindow = "3M",
): PortfolioMetrics {
  const totalValue = sum(holdings.map((item) => item.value));
  const totalCost = sum(holdings.map((item) => item.costBase));
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  const sortedHoldings = [...holdings].sort((a, b) => b.value - a.value);
  const topHoldings = sortedHoldings.slice(0, 8).map((holding) => ({
    ...holding,
    weightPct: totalValue > 0 ? (holding.value / totalValue) * 100 : 0,
  }));

  const top3ConcentrationPct =
    totalValue > 0 ? (sum(sortedHoldings.slice(0, 3).map((item) => item.value)) / totalValue) * 100 : 0;

  const accountAllocation = buildAllocation(holdings, "account", totalValue);
  const sectorAllocation = buildAllocation(holdings, "sector", totalValue);
  const largestAccountPct = accountAllocation.length > 0 ? accountAllocation[0].pct : 0;

  const hhi =
    totalValue > 0
      ? holdings.reduce((acc, item) => {
          const w = item.value / totalValue;
          return acc + w * w;
        }, 0) * 10000
      : 0;

  const history = snapshots
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Keep risk math daily even when intraday snapshot points exist.
  const latestSnapshotByDay = new Map<string, PortfolioSnapshot>();
  for (const item of history) {
    const dayKey = item.date.slice(0, 10);
    const existing = latestSnapshotByDay.get(dayKey);
    if (!existing || item.date > existing.date) {
      latestSnapshotByDay.set(dayKey, item);
    }
  }

  const dailyHistory = Array.from(latestSnapshotByDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  const riskHistory = applyRiskWindow(dailyHistory, riskWindow);
  const rawDailyReturns = calculateReturns(riskHistory.map((item) => item.value));
  const dailyReturns = cleanReturnsForRisk(rawDailyReturns);
  const returnOutliersRemoved = Math.max(0, rawDailyReturns.length - dailyReturns.length);
  const volatilityAnnualPct = dailyReturns.length >= 2 ? stdDev(dailyReturns) * Math.sqrt(252) * 100 : null;
  const maxDrawdownPct = riskHistory.length >= 2 ? calcMaxDrawdown(riskHistory.map((item) => item.value)) * 100 : null;

  const var95Raw = dailyReturns.length >= 20 ? percentile(dailyReturns, 0.05) : null;
  const var95Pct = var95Raw != null ? Math.max(0, -var95Raw * 100) : null;
  const var95Amount = var95Pct != null ? (var95Pct / 100) * totalValue : null;
  const cvar95Raw = dailyReturns.length >= 20 ? expectedShortfall95(dailyReturns) : null;
  const cvar95Pct = cvar95Raw != null ? Math.max(0, -cvar95Raw * 100) : null;
  const cvar95Amount = cvar95Pct != null ? (cvar95Pct / 100) * totalValue : null;

  return {
    totalValue,
    totalCost,
    pnl,
    pnlPct,
    top3ConcentrationPct,
    largestAccountPct,
    hhi,
    topHoldings,
    accountAllocation,
    sectorAllocation,
    history,
    dailyReturns,
    rawDailyReturnsCount: rawDailyReturns.length,
    returnOutliersRemoved,
    volatilityAnnualPct,
    maxDrawdownPct,
    var95Pct,
    var95Amount,
    cvar95Pct,
    cvar95Amount,
    riskWindow,
    riskPointsUsed: riskHistory.length,
    riskStartDate: riskHistory.length > 0 ? riskHistory[0].date : null,
    riskEndDate: riskHistory.length > 0 ? riskHistory[riskHistory.length - 1].date : null,
  };
}

function applyRiskWindow(history: PortfolioSnapshot[], riskWindow: RiskWindow): PortfolioSnapshot[] {
  if (history.length === 0) {
    return [];
  }

  const latestDate = toDate(history[history.length - 1].date);
  if (latestDate == null) {
    return history;
  }

  const cutoff = new Date(latestDate.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - (RISK_WINDOW_DAYS[riskWindow] - 1));

  return history.filter((item) => {
    const date = toDate(item.date);
    return date != null && date.getTime() >= cutoff.getTime();
  });
}

function toDate(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function buildAllocation(
  holdings: PortfolioHolding[],
  key: "account" | "sector",
  totalValue: number,
): AllocationItem[] {
  const grouped = holdings.reduce<Map<string, number>>((acc, item) => {
    const k = item[key] || "Uncategorized";
    acc.set(k, (acc.get(k) || 0) + item.value);
    return acc;
  }, new Map());

  return Array.from(grouped.entries())
    .map(([name, value]) => ({
      name,
      value,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function calculateReturns(values: number[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1];
    const current = values[i];
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(current)) {
      returns.push(current / prev - 1);
    }
  }

  return returns;
}

function cleanReturnsForRisk(returns: number[]): number[] {
  const finiteReturns = returns.filter((value) => Number.isFinite(value));
  if (finiteReturns.length <= 2) {
    return finiteReturns;
  }

  // Remove extreme one-day moves that are usually bad input data, not real market behavior.
  const withoutSpikes = finiteReturns.filter((value) => Math.abs(value) <= 0.4);
  if (withoutSpikes.length <= 2) {
    return withoutSpikes;
  }

  // Winsorize long series to reduce sensitivity to tail outliers in small, noisy portfolios.
  if (withoutSpikes.length >= 30) {
    return winsorize(withoutSpikes, 0.01, 0.99);
  }

  return withoutSpikes;
}

function calcMaxDrawdown(values: number[]): number {
  let peak = values[0];
  let maxDrawdown = 0;

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }

    const drawdown = (peak - value) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function stdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const mean = sum(values) / values.length;
  const variance = sum(values.map((value) => (value - mean) ** 2)) / (values.length - 1);
  return Math.sqrt(variance);
}

function expectedShortfall95(returns: number[]): number | null {
  if (returns.length < 20) {
    return null;
  }

  const cutoff = percentile(returns, 0.05);
  const tail = returns.filter((value) => value <= cutoff);
  if (tail.length === 0) {
    return null;
  }

  return sum(tail) / tail.length;
}

function winsorize(values: number[], lowerP: number, upperP: number): number[] {
  const lower = percentile(values, lowerP);
  const upper = percentile(values, upperP);

  return values.map((value) => {
    if (value < lower) {
      return lower;
    }
    if (value > upper) {
      return upper;
    }
    return value;
  });
}

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}
