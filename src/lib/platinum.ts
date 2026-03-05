import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabaseFilePath } from "@/lib/db";

const STARTING_CAPITAL_AUD = 5000;
const MA_SHORT_PERIOD = 20;
const MA_LONG_PERIOD = 50;
const MOMENTUM_LOOKBACK = 20;
const ZSCORE_LOOKBACK = 20;
const MAX_OPEN_POSITIONS = 5;
const TARGET_EQUITY_PER_BUY = 0.2;
const MAX_CASH_PER_BUY = 0.45;
const MIN_TRADE_NOTIONAL = 250;
const FEE_RATE = 0.001;
const SLIPPAGE_RATE = 0.0005;
const SCAN_TIME_ZONE = process.env.PLATINUM_TIME_ZONE || "Australia/Sydney";

const DEFAULT_ASX_UNIVERSE = [
  "BHP",
  "CBA",
  "CSL",
  "NAB",
  "WBC",
  "ANZ",
  "MQG",
  "WES",
  "WOW",
  "TLS",
  "RIO",
  "FMG",
  "COL",
  "GMG",
  "TCL",
  "QBE",
  "SUN",
  "IAG",
  "ALL",
  "XRO",
  "SEK",
  "REA",
  "COH",
  "RMD",
  "WDS",
  "STO",
  "ORG",
  "AGL",
  "MIN",
  "S32",
  "BSL",
  "APA",
  "ILU",
  "EVN",
  "NST",
  "GPT",
  "SCG",
  "AMC",
  "CPU",
  "ASX",
];

type RecommendationAction = "buy" | "sell" | "hold";

interface PortfolioRow {
  starting_cash: number;
  cash: number;
  realized_pnl: number;
  last_scan_at: string | null;
}

interface PositionRow {
  ticker: string;
  units: number;
  avg_cost: number;
  last_price: number;
  updated_at: string;
}

interface RecommendationRow {
  id: string;
  scan_date: string;
  ticker: string;
  action: RecommendationAction;
  score: number;
  price: number;
  ma_short: number;
  ma_long: number;
  momentum: number;
  z_score: number;
  reason: string;
  created_at: string;
}

interface TradeRow {
  id: string;
  scan_date: string;
  ticker: string;
  side: "buy" | "sell";
  units: number;
  price: number;
  notional: number;
  fee: number;
  reason: string;
  created_at: string;
}

interface SnapshotRow {
  scan_date: string;
  cash: number;
  invested_value: number;
  equity: number;
  created_at: string;
}

interface DatedPricePoint {
  date: string;
  close: number;
}

interface YahooChartMeta {
  regularMarketPrice?: number;
}

interface YahooChartIndicator {
  close?: Array<number | null>;
}

interface YahooAdjCloseIndicator {
  adjclose?: Array<number | null>;
}

interface YahooChartResult {
  meta?: YahooChartMeta;
  timestamp?: Array<number | null>;
  indicators?: {
    quote?: YahooChartIndicator[];
    adjclose?: YahooAdjCloseIndicator[];
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
  };
}

interface PositionMutable {
  ticker: string;
  units: number;
  avgCost: number;
  lastPrice: number;
}

interface RecommendationCandidate {
  ticker: string;
  action: RecommendationAction;
  score: number;
  price: number;
  maShort: number;
  maLong: number;
  momentum: number;
  zScore: number;
  reason: string;
}

interface TradeCandidate {
  id: string;
  scanDate: string;
  ticker: string;
  side: "buy" | "sell";
  units: number;
  price: number;
  notional: number;
  fee: number;
  reason: string;
  createdAt: string;
}

export interface PlatinumPaperPosition {
  ticker: string;
  units: number;
  avgCost: number;
  lastPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  updatedAt: string;
}

export interface PlatinumRecommendation {
  id: string;
  scanDate: string;
  ticker: string;
  action: RecommendationAction;
  score: number;
  price: number;
  maShort: number;
  maLong: number;
  momentum: number;
  zScore: number;
  reason: string;
  createdAt: string;
}

export interface PlatinumPaperTrade {
  id: string;
  scanDate: string;
  ticker: string;
  side: "buy" | "sell";
  units: number;
  price: number;
  notional: number;
  fee: number;
  reason: string;
  createdAt: string;
}

export interface PlatinumPaperSnapshot {
  scanDate: string;
  cash: number;
  investedValue: number;
  equity: number;
  createdAt: string;
}

export interface PlatinumPaperPortfolioSummary {
  startingCash: number;
  cash: number;
  investedValue: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalReturnPct: number;
  lastScanAt: string | null;
}

export interface PlatinumPaperState {
  portfolio: PlatinumPaperPortfolioSummary;
  latestScanDate: string | null;
  positions: PlatinumPaperPosition[];
  latestRecommendations: PlatinumRecommendation[];
  recentTrades: PlatinumPaperTrade[];
  snapshots: PlatinumPaperSnapshot[];
  universeSize: number;
}

export interface PlatinumScanRunResult {
  state: PlatinumPaperState;
  scanDate: string;
  executedTrades: number;
  generatedRecommendations: number;
  skippedTickers: string[];
  alreadyRanToday: boolean;
}

let dbInstance: DatabaseSync | null = null;
let schemaReady = false;

function getDb(): DatabaseSync {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(getDatabaseFilePath());
    dbInstance.exec("PRAGMA journal_mode = WAL;");
  }

  if (!schemaReady) {
    ensurePlatinumSchema(dbInstance);
    schemaReady = true;
  }

  return dbInstance;
}

function ensurePlatinumSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS platinum_paper_portfolios (
      user_id TEXT PRIMARY KEY,
      starting_cash REAL NOT NULL DEFAULT 5000,
      cash REAL NOT NULL DEFAULT 5000,
      realized_pnl REAL NOT NULL DEFAULT 0,
      last_scan_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platinum_paper_positions (
      user_id TEXT NOT NULL,
      ticker TEXT NOT NULL,
      units REAL NOT NULL,
      avg_cost REAL NOT NULL,
      last_price REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, ticker)
    );

    CREATE TABLE IF NOT EXISTS platinum_recommendations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scan_date TEXT NOT NULL,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      score REAL NOT NULL,
      price REAL NOT NULL,
      ma_short REAL NOT NULL,
      ma_long REAL NOT NULL,
      momentum REAL NOT NULL,
      z_score REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_platinum_recommendations_user_scan
      ON platinum_recommendations (user_id, scan_date, created_at DESC);

    CREATE TABLE IF NOT EXISTS platinum_paper_trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scan_date TEXT NOT NULL,
      ticker TEXT NOT NULL,
      side TEXT NOT NULL,
      units REAL NOT NULL,
      price REAL NOT NULL,
      notional REAL NOT NULL,
      fee REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_platinum_paper_trades_user_scan
      ON platinum_paper_trades (user_id, scan_date, created_at DESC);

    CREATE TABLE IF NOT EXISTS platinum_paper_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scan_date TEXT NOT NULL,
      cash REAL NOT NULL,
      invested_value REAL NOT NULL,
      equity REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, scan_date)
    );

    CREATE INDEX IF NOT EXISTS idx_platinum_paper_snapshots_user_scan
      ON platinum_paper_snapshots (user_id, scan_date DESC);
  `);
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeTicker(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, 20);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function floorTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }

  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const window = values.slice(-period);
  return average(window);
}

function toYahooAsxSymbol(ticker: string): string {
  const normalized = normalizeTicker(ticker);
  return normalized.includes(".") ? normalized : `${normalized}.AX`;
}

async function fetchAsxSeriesFromYahoo(ticker: string, range = "1y"): Promise<DatedPricePoint[] | null> {
  const symbol = toYahooAsxSymbol(ticker);
  if (!symbol) {
    return null;
  }

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SPECTRE-Platinum/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as YahooChartResponse;
    const result = payload.chart?.result?.[0];
    const timestamps = result?.timestamp ?? [];
    const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    const preferred = adjusted.length > 0 ? adjusted : closes;
    const pointCount = Math.min(timestamps.length, preferred.length);

    const points: DatedPricePoint[] = [];

    for (let index = 0; index < pointCount; index += 1) {
      const timestamp = Number(timestamps[index]);
      const close = Number(preferred[index]);

      if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(close) || close <= 0) {
        continue;
      }

      points.push({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close,
      });
    }

    return points.length >= MA_LONG_PERIOD + 2 ? points : null;
  } catch {
    return null;
  }
}

function readUniverseFromEnv(): string[] {
  const raw = String(process.env.PLATINUM_ASX_UNIVERSE || "").trim();
  if (!raw) {
    return DEFAULT_ASX_UNIVERSE;
  }

  const parsed = raw
    .split(",")
    .map((ticker) => normalizeTicker(ticker))
    .filter((ticker) => ticker.length > 0);

  return parsed.length > 0 ? Array.from(new Set(parsed)) : DEFAULT_ASX_UNIVERSE;
}

function currentScanDate(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "1970";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  const day = parts.find((part) => part.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function ensurePortfolioRow(db: DatabaseSync, userId: string): PortfolioRow {
  const existing = db
    .prepare(`
      SELECT starting_cash, cash, realized_pnl, last_scan_at
      FROM platinum_paper_portfolios
      WHERE user_id = ?
      LIMIT 1
    `)
    .get(userId) as PortfolioRow | undefined;

  if (existing) {
    return existing;
  }

  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO platinum_paper_portfolios (user_id, starting_cash, cash, realized_pnl, last_scan_at, created_at, updated_at)
    VALUES (?, ?, ?, 0, NULL, ?, ?)
  `).run(userId, STARTING_CAPITAL_AUD, STARTING_CAPITAL_AUD, nowIso, nowIso);

  return {
    starting_cash: STARTING_CAPITAL_AUD,
    cash: STARTING_CAPITAL_AUD,
    realized_pnl: 0,
    last_scan_at: null,
  };
}

function readPositions(db: DatabaseSync, userId: string): PositionRow[] {
  return db
    .prepare(`
      SELECT ticker, units, avg_cost, last_price, updated_at
      FROM platinum_paper_positions
      WHERE user_id = ?
      ORDER BY ticker ASC
    `)
    .all(userId) as PositionRow[];
}

function buildSignalRecommendation(
  ticker: string,
  closes: number[],
  hasOpenPosition: boolean,
): RecommendationCandidate | null {
  if (closes.length < MA_LONG_PERIOD + 2 || closes.length <= MOMENTUM_LOOKBACK) {
    return null;
  }

  const latestPrice = closes[closes.length - 1];
  const maShort = sma(closes, MA_SHORT_PERIOD);
  const maLong = sma(closes, MA_LONG_PERIOD);

  if (maShort == null || maLong == null || latestPrice <= 0) {
    return null;
  }

  const momentumBase = closes[closes.length - 1 - MOMENTUM_LOOKBACK];
  if (!Number.isFinite(momentumBase) || momentumBase <= 0) {
    return null;
  }

  const momentum = latestPrice / momentumBase - 1;
  const zWindow = closes.slice(-ZSCORE_LOOKBACK);
  const zMean = average(zWindow);
  const zStd = stdDev(zWindow);
  const zScore = zStd > 0 ? (latestPrice - zMean) / zStd : 0;

  const trendSignal = maShort > maLong ? 1 : -1;
  const momentumSignal = clamp(momentum / 0.08, -1.5, 1.5);
  const reversionSignal = clamp(-zScore / 2, -1.2, 1.2);
  const score = trendSignal * 1.3 + momentumSignal * 0.9 + reversionSignal * 0.6;

  let action: RecommendationAction = "hold";

  if (hasOpenPosition) {
    if (maShort < maLong || momentum < -0.04 || zScore > 1.8) {
      action = "sell";
    }
  } else if (maShort > maLong && momentum > 0.03 && zScore < 1.25) {
    action = "buy";
  }

  const reason =
    `MA${MA_SHORT_PERIOD} ${maShort.toFixed(2)} vs MA${MA_LONG_PERIOD} ${maLong.toFixed(2)}; ` +
    `momentum ${((momentum || 0) * 100).toFixed(2)}%; ` +
    `z-score ${zScore.toFixed(2)}`;

  return {
    ticker,
    action,
    score,
    price: latestPrice,
    maShort,
    maLong,
    momentum,
    zScore,
    reason,
  };
}

function toSummary(
  row: PortfolioRow,
  positions: PlatinumPaperPosition[],
): PlatinumPaperPortfolioSummary {
  const investedValue = positions.reduce((sum, position) => sum + position.marketValue, 0);
  const unrealizedPnl = positions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const cash = toFiniteNumber(row.cash, STARTING_CAPITAL_AUD);
  const startingCash = toFiniteNumber(row.starting_cash, STARTING_CAPITAL_AUD);
  const realizedPnl = toFiniteNumber(row.realized_pnl, 0);
  const equity = cash + investedValue;
  const totalPnl = equity - startingCash;
  const totalReturnPct = startingCash > 0 ? (totalPnl / startingCash) * 100 : 0;

  return {
    startingCash,
    cash,
    investedValue,
    equity,
    realizedPnl,
    unrealizedPnl,
    totalPnl,
    totalReturnPct,
    lastScanAt: row.last_scan_at,
  };
}

export function getPlatinumPaperState(userId: string): PlatinumPaperState {
  const db = getDb();
  const portfolioRow = ensurePortfolioRow(db, userId);
  const positionRows = readPositions(db, userId);

  const positions: PlatinumPaperPosition[] = positionRows
    .map((row) => {
      const units = toFiniteNumber(row.units, 0);
      const avgCost = toFiniteNumber(row.avg_cost, 0);
      const lastPrice = toFiniteNumber(row.last_price, 0);
      const marketValue = units * lastPrice;
      const unrealizedPnl = (lastPrice - avgCost) * units;

      return {
        ticker: row.ticker,
        units,
        avgCost,
        lastPrice,
        marketValue,
        unrealizedPnl,
        updatedAt: row.updated_at,
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue);

  const latestScan = db
    .prepare(`
      SELECT scan_date
      FROM platinum_paper_snapshots
      WHERE user_id = ?
      ORDER BY scan_date DESC
      LIMIT 1
    `)
    .get(userId) as { scan_date: string } | undefined;

  const latestScanDate = latestScan?.scan_date || null;

  const recommendations = latestScanDate
    ? (db
        .prepare(`
          SELECT id, scan_date, ticker, action, score, price, ma_short, ma_long, momentum, z_score, reason, created_at
          FROM platinum_recommendations
          WHERE user_id = ? AND scan_date = ?
          ORDER BY
            CASE action WHEN 'buy' THEN 0 WHEN 'sell' THEN 1 ELSE 2 END,
            ABS(score) DESC,
            ticker ASC
          LIMIT 80
        `)
        .all(userId, latestScanDate) as RecommendationRow[])
    : [];

  const trades = db
    .prepare(`
      SELECT id, scan_date, ticker, side, units, price, notional, fee, reason, created_at
      FROM platinum_paper_trades
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 80
    `)
    .all(userId) as TradeRow[];

  const snapshots = db
    .prepare(`
      SELECT scan_date, cash, invested_value, equity, created_at
      FROM platinum_paper_snapshots
      WHERE user_id = ?
      ORDER BY scan_date DESC
      LIMIT 60
    `)
    .all(userId) as SnapshotRow[];

  return {
    portfolio: toSummary(portfolioRow, positions),
    latestScanDate,
    positions,
    latestRecommendations: recommendations.map((row) => ({
      id: row.id,
      scanDate: row.scan_date,
      ticker: row.ticker,
      action: row.action,
      score: toFiniteNumber(row.score, 0),
      price: toFiniteNumber(row.price, 0),
      maShort: toFiniteNumber(row.ma_short, 0),
      maLong: toFiniteNumber(row.ma_long, 0),
      momentum: toFiniteNumber(row.momentum, 0),
      zScore: toFiniteNumber(row.z_score, 0),
      reason: row.reason,
      createdAt: row.created_at,
    })),
    recentTrades: trades.map((row) => ({
      id: row.id,
      scanDate: row.scan_date,
      ticker: row.ticker,
      side: row.side,
      units: toFiniteNumber(row.units, 0),
      price: toFiniteNumber(row.price, 0),
      notional: toFiniteNumber(row.notional, 0),
      fee: toFiniteNumber(row.fee, 0),
      reason: row.reason,
      createdAt: row.created_at,
    })),
    snapshots: snapshots
      .map((row) => ({
        scanDate: row.scan_date,
        cash: toFiniteNumber(row.cash, 0),
        investedValue: toFiniteNumber(row.invested_value, 0),
        equity: toFiniteNumber(row.equity, 0),
        createdAt: row.created_at,
      }))
      .reverse(),
    universeSize: readUniverseFromEnv().length,
  };
}

function mapRowsToMutablePositions(rows: PositionRow[]): Map<string, PositionMutable> {
  const map = new Map<string, PositionMutable>();

  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker);
    if (!ticker) {
      continue;
    }

    map.set(ticker, {
      ticker,
      units: toFiniteNumber(row.units, 0),
      avgCost: toFiniteNumber(row.avg_cost, 0),
      lastPrice: toFiniteNumber(row.last_price, 0),
    });
  }

  return map;
}

function computeInvestedValue(positions: Map<string, PositionMutable>): number {
  let total = 0;
  for (const position of positions.values()) {
    total += position.units * position.lastPrice;
  }
  return total;
}

export async function runPlatinumDailyScan(userId: string): Promise<PlatinumScanRunResult> {
  const db = getDb();
  const scanDate = currentScanDate();
  const nowIso = new Date().toISOString();

  ensurePortfolioRow(db, userId);

  const alreadyRan = db
    .prepare("SELECT 1 AS ok FROM platinum_paper_snapshots WHERE user_id = ? AND scan_date = ? LIMIT 1")
    .get(userId, scanDate) as { ok: number } | undefined;

  if (alreadyRan?.ok) {
    return {
      state: getPlatinumPaperState(userId),
      scanDate,
      executedTrades: 0,
      generatedRecommendations: 0,
      skippedTickers: [],
      alreadyRanToday: true,
    };
  }

  const portfolioRow = ensurePortfolioRow(db, userId);
  const existingPositions = mapRowsToMutablePositions(readPositions(db, userId));

  const universe = Array.from(new Set([...readUniverseFromEnv(), ...Array.from(existingPositions.keys())]));
  const skippedTickers: string[] = [];
  const recommendations: RecommendationCandidate[] = [];
  const latestPriceByTicker = new Map<string, number>();

  for (const ticker of universe) {
    const series = await fetchAsxSeriesFromYahoo(ticker, "1y");
    if (!series) {
      skippedTickers.push(ticker);
      continue;
    }

    const closes = series.map((point) => point.close).filter((value) => Number.isFinite(value) && value > 0);
    const hasOpenPosition = existingPositions.has(ticker);
    const recommendation = buildSignalRecommendation(ticker, closes, hasOpenPosition);

    if (!recommendation) {
      skippedTickers.push(ticker);
      continue;
    }

    recommendations.push(recommendation);
    latestPriceByTicker.set(ticker, recommendation.price);
  }

  let cash = toFiniteNumber(portfolioRow.cash, STARTING_CAPITAL_AUD);
  let realizedPnl = toFiniteNumber(portfolioRow.realized_pnl, 0);

  const trades: TradeCandidate[] = [];

  const sellRecommendations = recommendations
    .filter((item) => item.action === "sell")
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  for (const recommendation of sellRecommendations) {
    const position = existingPositions.get(recommendation.ticker);
    if (!position || position.units <= 0) {
      continue;
    }

    const fillPrice = recommendation.price * (1 - SLIPPAGE_RATE);
    const units = position.units;
    const notional = units * fillPrice;
    const fee = notional * FEE_RATE;

    cash += notional - fee;
    realizedPnl += (fillPrice - position.avgCost) * units - fee;

    existingPositions.delete(recommendation.ticker);

    trades.push({
      id: crypto.randomUUID(),
      scanDate,
      ticker: recommendation.ticker,
      side: "sell",
      units,
      price: fillPrice,
      notional,
      fee,
      reason: recommendation.reason,
      createdAt: nowIso,
    });
  }

  const buyRecommendations = recommendations
    .filter((item) => item.action === "buy")
    .sort((a, b) => b.score - a.score);

  for (const recommendation of buyRecommendations) {
    if (existingPositions.has(recommendation.ticker)) {
      continue;
    }

    if (existingPositions.size >= MAX_OPEN_POSITIONS) {
      break;
    }

    const investedValue = computeInvestedValue(existingPositions);
    const equity = cash + investedValue;
    const buyBudget = Math.min(equity * TARGET_EQUITY_PER_BUY, cash * MAX_CASH_PER_BUY);

    if (!Number.isFinite(buyBudget) || buyBudget < MIN_TRADE_NOTIONAL) {
      continue;
    }

    const fillPrice = recommendation.price * (1 + SLIPPAGE_RATE);
    if (!Number.isFinite(fillPrice) || fillPrice <= 0) {
      continue;
    }

    let units = floorTo(buyBudget / (fillPrice * (1 + FEE_RATE)), 4);
    if (units <= 0) {
      continue;
    }

    let notional = units * fillPrice;
    let fee = notional * FEE_RATE;
    let totalCost = notional + fee;

    if (totalCost > cash) {
      units = floorTo(cash / (fillPrice * (1 + FEE_RATE)), 4);
      if (units <= 0) {
        continue;
      }
      notional = units * fillPrice;
      fee = notional * FEE_RATE;
      totalCost = notional + fee;
    }

    if (notional < MIN_TRADE_NOTIONAL || totalCost > cash) {
      continue;
    }

    cash -= totalCost;

    existingPositions.set(recommendation.ticker, {
      ticker: recommendation.ticker,
      units,
      avgCost: fillPrice,
      lastPrice: recommendation.price,
    });

    trades.push({
      id: crypto.randomUUID(),
      scanDate,
      ticker: recommendation.ticker,
      side: "buy",
      units,
      price: fillPrice,
      notional,
      fee,
      reason: recommendation.reason,
      createdAt: nowIso,
    });
  }

  for (const [ticker, position] of existingPositions.entries()) {
    const latestPrice = latestPriceByTicker.get(ticker);
    if (latestPrice && Number.isFinite(latestPrice) && latestPrice > 0) {
      position.lastPrice = latestPrice;
    }
  }

  const investedValue = computeInvestedValue(existingPositions);
  const equity = cash + investedValue;

  db.exec("BEGIN IMMEDIATE");

  try {
    const recommendationInsert = db.prepare(`
      INSERT INTO platinum_recommendations (
        id, user_id, scan_date, ticker, action, score, price, ma_short, ma_long, momentum, z_score, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const recommendation of recommendations) {
      recommendationInsert.run(
        crypto.randomUUID(),
        userId,
        scanDate,
        recommendation.ticker,
        recommendation.action,
        recommendation.score,
        recommendation.price,
        recommendation.maShort,
        recommendation.maLong,
        recommendation.momentum,
        recommendation.zScore,
        recommendation.reason,
        nowIso,
      );
    }

    const tradeInsert = db.prepare(`
      INSERT INTO platinum_paper_trades (
        id, user_id, scan_date, ticker, side, units, price, notional, fee, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const trade of trades) {
      tradeInsert.run(
        trade.id,
        userId,
        trade.scanDate,
        trade.ticker,
        trade.side,
        trade.units,
        trade.price,
        trade.notional,
        trade.fee,
        trade.reason,
        trade.createdAt,
      );
    }

    db.prepare("DELETE FROM platinum_paper_positions WHERE user_id = ?").run(userId);

    const positionInsert = db.prepare(`
      INSERT INTO platinum_paper_positions (user_id, ticker, units, avg_cost, last_price, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const position of existingPositions.values()) {
      if (position.units <= 0) {
        continue;
      }

      positionInsert.run(userId, position.ticker, position.units, position.avgCost, position.lastPrice, nowIso);
    }

    db.prepare(`
      UPDATE platinum_paper_portfolios
      SET cash = ?, realized_pnl = ?, last_scan_at = ?, updated_at = ?
      WHERE user_id = ?
    `).run(cash, realizedPnl, nowIso, nowIso, userId);

    db.prepare(`
      INSERT INTO platinum_paper_snapshots (id, user_id, scan_date, cash, invested_value, equity, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, scan_date) DO UPDATE SET
        cash = excluded.cash,
        invested_value = excluded.invested_value,
        equity = excluded.equity,
        created_at = excluded.created_at
    `).run(crypto.randomUUID(), userId, scanDate, cash, investedValue, equity, nowIso);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    state: getPlatinumPaperState(userId),
    scanDate,
    executedTrades: trades.length,
    generatedRecommendations: recommendations.length,
    skippedTickers,
    alreadyRanToday: false,
  };
}
