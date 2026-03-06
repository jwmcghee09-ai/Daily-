import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDatabaseFilePath } from "@/lib/db";

const STARTING_CAPITAL_AUD = 5000;
const ASX_DIRECTORY_URL = "https://asx.api.markitdigital.com/asx-research/1.0/companies/directory/file";
const ASX_FETCH_CONCURRENCY = clampInteger(process.env.PLATINUM_FETCH_CONCURRENCY, 12, 2, 40);
const SCAN_TIME_ZONE = process.env.PLATINUM_TIME_ZONE || "Australia/Sydney";
const PLATINUM_HISTORY_DAYS = clampInteger(process.env.PLATINUM_HISTORY_DAYS, 240, 30, 1825);
const MIN_LIVE_SCAN_INTERVAL_MS = clampInteger(process.env.PLATINUM_LIVE_SCAN_INTERVAL_MINUTES, 5, 1, 60) * 60 * 1000;
const ASX_OPEN_START_MINUTES = 10 * 60;
const ASX_OPEN_END_MINUTES = 16 * 60 + 10;
const AI_MODEL = (process.env.PLATINUM_AI_MODEL || "gpt-4.1-mini").trim();
const AI_MAX_CANDIDATES = clampInteger(process.env.PLATINUM_AI_MAX_CANDIDATES, 40, 10, 120);
const AI_TIMEOUT_MS = clampInteger(process.env.PLATINUM_AI_TIMEOUT_MS, 15000, 3000, 40000);

const MA_MEDIUM_PERIOD = 50;
const MA_LONG_PERIOD = 200;
const MOMENTUM_LOOKBACK = 20;
const ZSCORE_LOOKBACK = 20;
const INDICATOR_MIN_BARS = 220;

const MAX_OPEN_POSITIONS = clampInteger(process.env.PLATINUM_MAX_POSITIONS, 12, 3, 40);
const TARGET_EQUITY_PER_BUY = clampNumber(process.env.PLATINUM_TARGET_PER_POSITION, 0.1, 0.02, 0.35);
const MAX_CASH_PER_BUY = clampNumber(process.env.PLATINUM_MAX_CASH_PER_BUY, 0.35, 0.05, 0.8);
const MIN_TRADE_NOTIONAL = clampNumber(process.env.PLATINUM_MIN_TRADE_NOTIONAL, 300, 50, 5000);
const FEE_RATE = clampNumber(process.env.PLATINUM_FEE_RATE, 0.001, 0, 0.01);
const SLIPPAGE_RATE = clampNumber(process.env.PLATINUM_SLIPPAGE_RATE, 0.0006, 0, 0.02);
const STOP_LOSS_PCT = clampNumber(process.env.PLATINUM_STOP_LOSS_PCT, 0.1, 0.02, 0.4);
const TRAILING_STOP_PCT = clampNumber(process.env.PLATINUM_TRAILING_STOP_PCT, 0.09, 0.02, 0.35);
const REGIME_BENCHMARK_SYMBOL = (process.env.PLATINUM_REGIME_SYMBOL || "^AXJO").trim();
const MIN_AVG_DOLLAR_VOLUME_AUD = clampNumber(process.env.PLATINUM_MIN_AVG_DOLLAR_VOLUME_AUD, 1000000, 100000, 100000000);
const TARGET_ANNUAL_VOLATILITY = clampNumber(process.env.PLATINUM_TARGET_ANNUAL_VOLATILITY, 0.18, 0.05, 0.8);
const MIN_CASH_RESERVE_PCT = clampNumber(process.env.PLATINUM_MIN_CASH_RESERVE_PCT, 0.08, 0, 0.5);

const FALLBACK_UNIVERSE = [
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

const DEFAULT_UNIVERSE_SIZE_ESTIMATE = 1843;

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
  peak_price: number;
  updated_at: string;
}

interface RecommendationRow {
  id: string;
  scan_date: string;
  ticker: string;
  action: RecommendationAction;
  score: number;
  expected_return_pct: number;
  confidence: number;
  indicator_count: number;
  final_score: number;
  ai_adjustment: number;
  ai_confidence: number;
  ai_summary: string;
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

interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface YahooChartIndicator {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
}

interface YahooAdjCloseIndicator {
  adjclose?: Array<number | null>;
}

interface YahooChartResult {
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
  peakPrice: number;
}

interface IndicatorPack {
  close: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
  rsi14: number;
  stochK: number;
  stochD: number;
  bollingerPos: number;
  atr14: number;
  atrPct: number;
  adx14: number;
  plusDi: number;
  minusDi: number;
  roc20: number;
  mfi14: number;
  cci20: number;
  volumeSurge: number;
  avgDollarVolume20: number;
  realizedVol20: number;
  drawdown63: number;
  obvSlope: number;
  zScore20: number;
  donchianBreakout: boolean;
  bullishEngulfing: boolean;
  bearishEngulfing: boolean;
  hammer: boolean;
  shootingStar: boolean;
  insideBarBreakoutUp: boolean;
  insideBarBreakoutDown: boolean;
  higherHighHigherLow: boolean;
  lowerHighLowerLow: boolean;
}

interface RecommendationCandidate {
  ticker: string;
  action: RecommendationAction;
  score: number;
  expectedReturnPct: number;
  confidence: number;
  indicatorCount: number;
  finalScore: number;
  aiAdjustment: number;
  aiConfidence: number;
  aiSummary: string;
  price: number;
  maShort: number;
  maLong: number;
  momentum: number;
  zScore: number;
  realizedVol20: number;
  avgDollarVolume20: number;
  reason: string;
}

interface MarketRegime {
  state: "risk_on" | "neutral" | "risk_off";
  score: number;
  positionSizeMultiplier: number;
  allowNewLongs: boolean;
  summary: string;
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

interface ScanOutcome {
  ticker: string;
  recommendation: RecommendationCandidate | null;
  latestPrice: number | null;
  skipReason: string | null;
}

interface SignalBreakdownItem {
  label: string;
  value: number;
  weight: number;
}

export interface PlatinumPaperPosition {
  ticker: string;
  units: number;
  avgCost: number;
  lastPrice: number;
  peakPrice: number;
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
  expectedReturnPct: number;
  confidence: number;
  indicatorCount: number;
  finalScore: number;
  aiAdjustment: number;
  aiConfidence: number;
  aiSummary: string;
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
  marketOpen: boolean;
  skippedBecauseMarketClosed: boolean;
  usedAiOverlay: boolean;
  aiModel: string | null;
}

interface RunScanOptions {
  allowIntraday?: boolean;
  requireMarketOpen?: boolean;
}

interface AiOverlayEntry {
  ticker: string;
  adjustment: number;
  confidence: number;
  summary: string;
}

interface AiOverlayResult {
  model: string;
  entries: AiOverlayEntry[];
}

let dbInstance: DatabaseSync | null = null;
let schemaReady = false;

function clampInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function clampNumber(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseFloat(String(raw || "").trim());
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

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

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const row = db.prepare(`SELECT 1 AS ok FROM pragma_table_info('${table}') WHERE name = ? LIMIT 1`).get(column) as
    | { ok: number }
    | undefined;

  return Boolean(row?.ok);
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
      peak_price REAL NOT NULL DEFAULT 0,
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
      expected_return_pct REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      indicator_count INTEGER NOT NULL DEFAULT 0,
      final_score REAL NOT NULL DEFAULT 0,
      ai_adjustment REAL NOT NULL DEFAULT 0,
      ai_confidence REAL NOT NULL DEFAULT 0,
      ai_summary TEXT NOT NULL DEFAULT '',
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

  if (!hasColumn(db, "platinum_paper_positions", "peak_price")) {
    db.exec("ALTER TABLE platinum_paper_positions ADD COLUMN peak_price REAL NOT NULL DEFAULT 0;");
    db.exec("UPDATE platinum_paper_positions SET peak_price = CASE WHEN peak_price <= 0 THEN last_price ELSE peak_price END;");
  }

  if (!hasColumn(db, "platinum_recommendations", "expected_return_pct")) {
    db.exec("ALTER TABLE platinum_recommendations ADD COLUMN expected_return_pct REAL NOT NULL DEFAULT 0;");
  }

  if (!hasColumn(db, "platinum_recommendations", "confidence")) {
    db.exec("ALTER TABLE platinum_recommendations ADD COLUMN confidence REAL NOT NULL DEFAULT 0;");
  }

  if (!hasColumn(db, "platinum_recommendations", "indicator_count")) {
    db.exec("ALTER TABLE platinum_recommendations ADD COLUMN indicator_count INTEGER NOT NULL DEFAULT 0;");
  }

  if (!hasColumn(db, "platinum_recommendations", "final_score")) {
    db.exec("ALTER TABLE platinum_recommendations ADD COLUMN final_score REAL NOT NULL DEFAULT 0;");
  }

  if (!hasColumn(db, "platinum_recommendations", "ai_adjustment")) {
    db.exec("ALTER TABLE platinum_recommendations ADD COLUMN ai_adjustment REAL NOT NULL DEFAULT 0;");
  }

  if (!hasColumn(db, "platinum_recommendations", "ai_confidence")) {
    db.exec("ALTER TABLE platinum_recommendations ADD COLUMN ai_confidence REAL NOT NULL DEFAULT 0;");
  }

  if (!hasColumn(db, "platinum_recommendations", "ai_summary")) {
    db.exec("ALTER TABLE platinum_recommendations ADD COLUMN ai_summary TEXT NOT NULL DEFAULT '';");
  }
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

function floorTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;
  return Math.floor(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
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

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  return average(values.slice(-period));
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let emaValue = average(values.slice(0, period));

  for (let index = period; index < values.length; index += 1) {
    emaValue = (values[index] - emaValue) * multiplier + emaValue;
  }

  return emaValue;
}

function emaSeries(values: number[], period: number): number[] {
  const result = new Array<number>(values.length).fill(Number.NaN);
  if (values.length < period) {
    return result;
  }

  const multiplier = 2 / (period + 1);
  let emaValue = average(values.slice(0, period));
  result[period - 1] = emaValue;

  for (let index = period; index < values.length; index += 1) {
    emaValue = (values[index] - emaValue) * multiplier + emaValue;
    result[index] = emaValue;
  }

  return result;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) {
    return null;
  }

  let gains = 0;
  let losses = 0;

  for (let index = values.length - period; index < values.length; index += 1) {
    const diff = values[index] - values[index - 1];
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  if (losses === 0) {
    return 100;
  }

  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function trueRange(high: number, low: number, prevClose: number): number {
  return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return null;
  }

  const ranges: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    ranges.push(trueRange(highs[index], lows[index], closes[index - 1]));
  }

  return average(ranges.slice(-period));
}

function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): { adx: number; plusDi: number; minusDi: number } | null {
  if (highs.length < period + 2 || lows.length < period + 2 || closes.length < period + 2) {
    return null;
  }

  const trValues: number[] = [];
  const plusDmValues: number[] = [];
  const minusDmValues: number[] = [];

  for (let index = 1; index < highs.length; index += 1) {
    const upMove = highs[index] - highs[index - 1];
    const downMove = lows[index - 1] - lows[index];

    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    trValues.push(trueRange(highs[index], lows[index], closes[index - 1]));
    plusDmValues.push(plusDm);
    minusDmValues.push(minusDm);
  }

  if (trValues.length < period || plusDmValues.length < period || minusDmValues.length < period) {
    return null;
  }

  const trN = sum(trValues.slice(-period));
  const plusDmN = sum(plusDmValues.slice(-period));
  const minusDmN = sum(minusDmValues.slice(-period));

  if (trN <= 0) {
    return null;
  }

  const plusDi = (plusDmN / trN) * 100;
  const minusDi = (minusDmN / trN) * 100;
  const diSum = plusDi + minusDi;
  const dx = diSum > 0 ? (Math.abs(plusDi - minusDi) / diSum) * 100 : 0;

  return {
    adx: dx,
    plusDi,
    minusDi,
  };
}

function stochasticK(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (highs.length < period || lows.length < period || closes.length < period) {
    return null;
  }

  const high = Math.max(...highs.slice(-period));
  const low = Math.min(...lows.slice(-period));
  const close = closes[closes.length - 1];

  if (high <= low) {
    return 50;
  }

  return ((close - low) / (high - low)) * 100;
}

function bollingerPosition(values: number[], period = 20): number | null {
  if (values.length < period) {
    return null;
  }

  const window = values.slice(-period);
  const center = average(window);
  const deviation = stdDev(window);

  if (deviation <= 0) {
    return 0.5;
  }

  const lower = center - deviation * 2;
  const upper = center + deviation * 2;
  const close = values[values.length - 1];

  if (upper <= lower) {
    return 0.5;
  }

  return clamp((close - lower) / (upper - lower), 0, 1);
}

function roc(values: number[], lookback: number): number | null {
  if (values.length <= lookback) {
    return null;
  }

  const start = values[values.length - 1 - lookback];
  const end = values[values.length - 1];

  if (!Number.isFinite(start) || start <= 0) {
    return null;
  }

  return end / start - 1;
}

function mfi(highs: number[], lows: number[], closes: number[], volumes: number[], period = 14): number | null {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1 || volumes.length < period + 1) {
    return null;
  }

  let positiveFlow = 0;
  let negativeFlow = 0;

  for (let index = closes.length - period; index < closes.length; index += 1) {
    const typicalPrice = (highs[index] + lows[index] + closes[index]) / 3;
    const prevTypicalPrice = (highs[index - 1] + lows[index - 1] + closes[index - 1]) / 3;
    const flow = typicalPrice * Math.max(volumes[index], 0);

    if (typicalPrice >= prevTypicalPrice) {
      positiveFlow += flow;
    } else {
      negativeFlow += flow;
    }
  }

  if (negativeFlow <= 0) {
    return 100;
  }

  const ratio = positiveFlow / negativeFlow;
  return 100 - 100 / (1 + ratio);
}

function cci(highs: number[], lows: number[], closes: number[], period = 20): number | null {
  if (highs.length < period || lows.length < period || closes.length < period) {
    return null;
  }

  const tps: number[] = [];

  for (let index = closes.length - period; index < closes.length; index += 1) {
    tps.push((highs[index] + lows[index] + closes[index]) / 3);
  }

  const meanTp = average(tps);
  const meanDeviation = average(tps.map((value) => Math.abs(value - meanTp)));

  if (meanDeviation <= 0) {
    return 0;
  }

  const latestTp = tps[tps.length - 1];
  return (latestTp - meanTp) / (0.015 * meanDeviation);
}

function obvSlope(closes: number[], volumes: number[], lookback = 20): number | null {
  if (closes.length < lookback + 1 || volumes.length < lookback + 1) {
    return null;
  }

  const obv: number[] = [0];

  for (let index = 1; index < closes.length; index += 1) {
    const previous = obv[obv.length - 1];
    const volume = Math.max(volumes[index], 0);

    if (closes[index] > closes[index - 1]) {
      obv.push(previous + volume);
    } else if (closes[index] < closes[index - 1]) {
      obv.push(previous - volume);
    } else {
      obv.push(previous);
    }
  }

  const recent = obv.slice(-lookback);
  const n = recent.length;
  if (n < 3) {
    return null;
  }

  const xMean = (n - 1) / 2;
  const yMean = average(recent);

  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < n; index += 1) {
    const dx = index - xMean;
    numerator += dx * (recent[index] - yMean);
    denominator += dx * dx;
  }

  if (denominator <= 0) {
    return null;
  }

  const slope = numerator / denominator;
  const volumeBase = average(volumes.slice(-lookback).map((value) => Math.max(value, 0)));

  if (volumeBase <= 0) {
    return 0;
  }

  return slope / volumeBase;
}

function zScore(values: number[], period = 20): number | null {
  if (values.length < period) {
    return null;
  }

  const window = values.slice(-period);
  const mean = average(window);
  const deviation = stdDev(window);

  if (deviation <= 0) {
    return 0;
  }

  return (values[values.length - 1] - mean) / deviation;
}

function realizedVolatility(values: number[], lookback = 20): number | null {
  if (values.length < lookback + 1) {
    return null;
  }

  const returns: number[] = [];
  for (let index = values.length - lookback; index < values.length; index += 1) {
    const prev = values[index - 1];
    const current = values[index];
    if (!Number.isFinite(prev) || !Number.isFinite(current) || prev <= 0 || current <= 0) {
      return null;
    }

    returns.push(Math.log(current / prev));
  }

  const sigma = stdDev(returns);
  if (!Number.isFinite(sigma)) {
    return null;
  }

  return sigma * Math.sqrt(252);
}

function drawdownFromRecentHigh(values: number[], lookback = 63): number | null {
  if (values.length < lookback) {
    return null;
  }

  const window = values.slice(-lookback);
  const peak = Math.max(...window);
  const last = window[window.length - 1];

  if (!Number.isFinite(peak) || !Number.isFinite(last) || peak <= 0) {
    return null;
  }

  return last / peak - 1;
}

function lineSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) {
    return 0;
  }

  const xMean = (n - 1) / 2;
  const yMean = average(values);
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < n; index += 1) {
    const dx = index - xMean;
    numerator += dx * (values[index] - yMean);
    denominator += dx * dx;
  }

  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function detectPricePatterns(bars: PriceBar[]): {
  bullishEngulfing: boolean;
  bearishEngulfing: boolean;
  hammer: boolean;
  shootingStar: boolean;
  insideBarBreakoutUp: boolean;
  insideBarBreakoutDown: boolean;
  higherHighHigherLow: boolean;
  lowerHighLowerLow: boolean;
} {
  const fallback = {
    bullishEngulfing: false,
    bearishEngulfing: false,
    hammer: false,
    shootingStar: false,
    insideBarBreakoutUp: false,
    insideBarBreakoutDown: false,
    higherHighHigherLow: false,
    lowerHighLowerLow: false,
  };

  if (bars.length < 4) {
    return fallback;
  }

  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const prev2 = bars[bars.length - 3];

  const latestBody = Math.abs(latest.close - latest.open);
  const latestRange = Math.max(0.0000001, latest.high - latest.low);
  const latestUpperWick = latest.high - Math.max(latest.open, latest.close);
  const latestLowerWick = Math.min(latest.open, latest.close) - latest.low;

  const prevBearish = prev.close < prev.open;
  const prevBullish = prev.close > prev.open;
  const latestBullish = latest.close > latest.open;
  const latestBearish = latest.close < latest.open;

  const bullishEngulfing =
    prevBearish && latestBullish && latest.open <= prev.close && latest.close >= prev.open;
  const bearishEngulfing =
    prevBullish && latestBearish && latest.open >= prev.close && latest.close <= prev.open;

  const hammer =
    latestLowerWick >= latestBody * 2 &&
    latestUpperWick <= latestBody * 1.2 &&
    latest.close > latest.open &&
    latestBody / latestRange <= 0.45;

  const shootingStar =
    latestUpperWick >= latestBody * 2 &&
    latestLowerWick <= latestBody * 1.2 &&
    latest.close < latest.open &&
    latestBody / latestRange <= 0.45;

  const insideBar = prev.high <= prev2.high && prev.low >= prev2.low;
  const insideBarBreakoutUp = insideBar && latest.close > prev2.high;
  const insideBarBreakoutDown = insideBar && latest.close < prev2.low;

  const highs = bars.slice(-12).map((bar) => bar.high);
  const lows = bars.slice(-12).map((bar) => bar.low);
  const avgClose = average(bars.slice(-12).map((bar) => bar.close));
  const normalizedHighSlope = avgClose > 0 ? lineSlope(highs) / avgClose : 0;
  const normalizedLowSlope = avgClose > 0 ? lineSlope(lows) / avgClose : 0;

  const higherHighHigherLow = normalizedHighSlope > 0.0015 && normalizedLowSlope > 0.0012;
  const lowerHighLowerLow = normalizedHighSlope < -0.0015 && normalizedLowSlope < -0.0012;

  return {
    bullishEngulfing,
    bearishEngulfing,
    hammer,
    shootingStar,
    insideBarBreakoutUp,
    insideBarBreakoutDown,
    higherHighHigherLow,
    lowerHighLowerLow,
  };
}

function parseConfiguredUniverse(): string[] {
  const raw = String(process.env.PLATINUM_ASX_UNIVERSE || "").trim();
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((ticker) => normalizeTicker(ticker))
        .filter((ticker) => /^[A-Z0-9]{2,5}$/.test(ticker)),
    ),
  );
}

async function fetchAsxUniverseFromDirectory(): Promise<string[]> {
  try {
    const response = await fetch(ASX_DIRECTORY_URL, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SPECTRE-Platinum/1.0)",
        Accept: "text/csv,application/octet-stream,text/plain,*/*",
      },
    });

    if (!response.ok) {
      return [];
    }

    const csv = await response.text();
    const lines = csv.split(/\r?\n/);
    const tickers: string[] = [];

    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) {
        continue;
      }

      const match = line.match(/^"([^"]+)"/);
      const rawCode = match?.[1] || "";
      const code = normalizeTicker(rawCode);
      if (/^[A-Z0-9]{2,5}$/.test(code)) {
        tickers.push(code);
      }
    }

    return Array.from(new Set(tickers));
  } catch {
    return [];
  }
}

async function resolveUniverse(): Promise<string[]> {
  const configured = parseConfiguredUniverse();
  if (configured.length > 0) {
    return configured;
  }

  const directory = await fetchAsxUniverseFromDirectory();
  if (directory.length >= 500) {
    return directory;
  }

  return FALLBACK_UNIVERSE;
}

function estimateUniverseSizeFromConfig(): number {
  const configured = parseConfiguredUniverse();
  if (configured.length > 0) {
    return configured.length;
  }

  return DEFAULT_UNIVERSE_SIZE_ESTIMATE;
}

function toYahooAsxSymbol(ticker: string): string {
  const normalized = normalizeTicker(ticker);
  if (!normalized) {
    return "";
  }

  return normalized.includes(".") ? normalized : `${normalized}.AX`;
}

function parseYahooBars(payload: YahooChartResponse): PriceBar[] {
  const result = payload.chart?.result?.[0];

  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const adjusted = result?.indicators?.adjclose?.[0]?.adjclose ?? [];

  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];

  const pointCount = Math.min(
    timestamps.length,
    opens.length,
    highs.length,
    lows.length,
    closes.length,
    volumes.length,
    adjusted.length > 0 ? adjusted.length : Number.MAX_SAFE_INTEGER,
  );

  const bars: PriceBar[] = [];

  for (let index = 0; index < pointCount; index += 1) {
    const timestamp = Number(timestamps[index]);
    const open = Number(opens[index]);
    const high = Number(highs[index]);
    const low = Number(lows[index]);
    const closeRaw = adjusted.length > 0 ? Number(adjusted[index]) : Number(closes[index]);
    const close = Number.isFinite(closeRaw) && closeRaw > 0 ? closeRaw : Number(closes[index]);
    const volume = Number(volumes[index]);

    if (
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0
    ) {
      continue;
    }

    bars.push({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) && volume > 0 ? volume : 0,
    });
  }

  return bars;
}

async function fetchYahooSeriesBySymbol(symbol: string, range = "1y"): Promise<PriceBar[] | null> {
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
    const bars = parseYahooBars(payload);
    return bars.length >= INDICATOR_MIN_BARS ? bars : null;
  } catch {
    return null;
  }
}

async function fetchAsxSeriesFromYahoo(ticker: string, range = "1y"): Promise<PriceBar[] | null> {
  const symbol = toYahooAsxSymbol(ticker);
  return fetchYahooSeriesBySymbol(symbol, range);
}

function buildIndicators(bars: PriceBar[]): IndicatorPack | null {
  if (bars.length < INDICATOR_MIN_BARS) {
    return null;
  }

  const closes = bars.map((bar) => bar.close);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const volumes = bars.map((bar) => bar.volume);

  const close = closes[closes.length - 1];
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, MA_MEDIUM_PERIOD);
  const sma200 = sma(closes, MA_LONG_PERIOD);
  const ema12Series = emaSeries(closes, 12);
  const ema26Series = emaSeries(closes, 26);
  const ema12 = ema12Series[ema12Series.length - 1];
  const ema26 = ema26Series[ema26Series.length - 1];

  const macdBaseSeries = ema12Series
    .map((value, index) => {
      const ema26Value = ema26Series[index];
      if (!Number.isFinite(value) || !Number.isFinite(ema26Value)) {
        return Number.NaN;
      }

      return value - ema26Value;
    })
    .filter((value) => Number.isFinite(value));

  const macdSignal = ema(macdBaseSeries, 9);

  if (
    sma20 == null ||
    sma50 == null ||
    sma200 == null ||
    !Number.isFinite(ema12) ||
    !Number.isFinite(ema26) ||
    macdSignal == null
  ) {
    return null;
  }

  const macdLine = ema12 - ema26;
  const macdHist = macdLine - macdSignal;

  const rsi14 = rsi(closes, 14);
  const stochK = stochasticK(highs, lows, closes, 14);
  const stochD = stochasticK(highs.slice(0, -1), lows.slice(0, -1), closes.slice(0, -1), 14);
  const bollPos = bollingerPosition(closes, 20);
  const atr14 = atr(highs, lows, closes, 14);
  const adxPack = adx(highs, lows, closes, 14);
  const roc20 = roc(closes, MOMENTUM_LOOKBACK);
  const mfi14 = mfi(highs, lows, closes, volumes, 14);
  const cci20 = cci(highs, lows, closes, 20);
  const obv = obvSlope(closes, volumes, 20);
  const z = zScore(closes, ZSCORE_LOOKBACK);
  const realizedVol20 = realizedVolatility(closes, 20);
  const drawdown63 = drawdownFromRecentHigh(closes, 63);

  if (
    rsi14 == null ||
    stochK == null ||
    stochD == null ||
    bollPos == null ||
    atr14 == null ||
    adxPack == null ||
    roc20 == null ||
    mfi14 == null ||
    cci20 == null ||
    obv == null ||
    z == null ||
    realizedVol20 == null ||
    drawdown63 == null
  ) {
    return null;
  }

  const avgVolume20 = average(volumes.slice(-20));
  const avgDollarVolume20 = average(
    bars.slice(-20).map((bar) => bar.close * Math.max(bar.volume, 0)),
  );
  const latestVolume = Math.max(volumes[volumes.length - 1], 0);
  const volumeSurge = avgVolume20 > 0 ? latestVolume / avgVolume20 : 1;

  const highest20 = Math.max(...highs.slice(-20));
  const donchianBreakout = close >= highest20 * 0.997;
  const patterns = detectPricePatterns(bars);

  return {
    close,
    sma20,
    sma50,
    sma200,
    ema12,
    ema26,
    macdLine,
    macdSignal,
    macdHist,
    rsi14,
    stochK,
    stochD,
    bollingerPos: bollPos,
    atr14,
    atrPct: close > 0 ? atr14 / close : 0,
    adx14: adxPack.adx,
    plusDi: adxPack.plusDi,
    minusDi: adxPack.minusDi,
    roc20,
    mfi14,
    cci20,
    volumeSurge,
    avgDollarVolume20,
    realizedVol20,
    drawdown63,
    obvSlope: obv,
    zScore20: z,
    donchianBreakout,
    bullishEngulfing: patterns.bullishEngulfing,
    bearishEngulfing: patterns.bearishEngulfing,
    hammer: patterns.hammer,
    shootingStar: patterns.shootingStar,
    insideBarBreakoutUp: patterns.insideBarBreakoutUp,
    insideBarBreakoutDown: patterns.insideBarBreakoutDown,
    higherHighHigherLow: patterns.higherHighHigherLow,
    lowerHighLowerLow: patterns.lowerHighLowerLow,
  };
}

function inferMarketRegime(indicators: IndicatorPack | null): MarketRegime {
  if (!indicators) {
    return {
      state: "neutral",
      score: 0,
      positionSizeMultiplier: 0.72,
      allowNewLongs: true,
      summary: `Regime neutral (benchmark unavailable: ${REGIME_BENCHMARK_SYMBOL}).`,
    };
  }

  let score = 0;
  score += indicators.close > indicators.sma200 ? 0.45 : -0.45;
  score += indicators.sma50 > indicators.sma200 ? 0.3 : -0.3;
  score += clamp(indicators.roc20 / 0.14, -0.22, 0.22);
  score += clamp((0.32 - indicators.realizedVol20) / 0.42, -0.18, 0.18);
  score += clamp((indicators.drawdown63 + 0.12) / 0.26, -0.18, 0.18);

  const normalizedScore = clamp(score, -1, 1);

  if (normalizedScore <= -0.22) {
    return {
      state: "risk_off",
      score: normalizedScore,
      positionSizeMultiplier: 0.42,
      allowNewLongs: false,
      summary: `Regime risk_off (${REGIME_BENCHMARK_SYMBOL}) score ${normalizedScore.toFixed(2)}; ROC20 ${(indicators.roc20 * 100).toFixed(2)}%, vol ${(indicators.realizedVol20 * 100).toFixed(1)}%, DD63 ${(indicators.drawdown63 * 100).toFixed(1)}%.`,
    };
  }

  if (normalizedScore >= 0.35) {
    return {
      state: "risk_on",
      score: normalizedScore,
      positionSizeMultiplier: 1,
      allowNewLongs: true,
      summary: `Regime risk_on (${REGIME_BENCHMARK_SYMBOL}) score ${normalizedScore.toFixed(2)}; ROC20 ${(indicators.roc20 * 100).toFixed(2)}%, vol ${(indicators.realizedVol20 * 100).toFixed(1)}%, DD63 ${(indicators.drawdown63 * 100).toFixed(1)}%.`,
    };
  }

  return {
    state: "neutral",
    score: normalizedScore,
    positionSizeMultiplier: 0.72,
    allowNewLongs: true,
    summary: `Regime neutral (${REGIME_BENCHMARK_SYMBOL}) score ${normalizedScore.toFixed(2)}; ROC20 ${(indicators.roc20 * 100).toFixed(2)}%, vol ${(indicators.realizedVol20 * 100).toFixed(1)}%, DD63 ${(indicators.drawdown63 * 100).toFixed(1)}%.`,
  };
}

async function resolveMarketRegime(): Promise<MarketRegime> {
  const benchmarkSeries = await fetchYahooSeriesBySymbol(REGIME_BENCHMARK_SYMBOL, "1y");
  const benchmarkIndicators = benchmarkSeries ? buildIndicators(benchmarkSeries) : null;
  return inferMarketRegime(benchmarkIndicators);
}

function toSignalBreakdown(indicators: IndicatorPack): SignalBreakdownItem[] {
  const trendAlignment =
    (indicators.close > indicators.sma20 ? 1 : -1) * 0.3 +
    (indicators.close > indicators.sma50 ? 1 : -1) * 0.35 +
    (indicators.sma50 > indicators.sma200 ? 1 : -1) * 0.35;

  const emaSignal = indicators.ema12 > indicators.ema26 ? 1 : -1;
  const macdSignal = clamp(indicators.macdHist / Math.max(indicators.atr14, indicators.close * 0.004), -1, 1);
  const adxSignal =
    indicators.adx14 > 20
      ? clamp((indicators.plusDi - indicators.minusDi) / 20, -1, 1) * clamp((indicators.adx14 - 20) / 20, 0, 1)
      : 0;

  const rsiSignal =
    indicators.rsi14 > 55 && indicators.rsi14 < 75
      ? 0.9
      : indicators.rsi14 >= 75 && indicators.rsi14 <= 85
        ? 0.25
        : indicators.rsi14 > 85
          ? -0.7
          : indicators.rsi14 < 30
            ? 0.5
            : indicators.rsi14 < 45
              ? -0.35
              : 0;

  const stochasticSignal = clamp((indicators.stochK - indicators.stochD) / 20, -1, 1);
  const bollSignal =
    indicators.bollingerPos > 0.8
      ? 0.45
      : indicators.bollingerPos < 0.2
        ? -0.3
        : clamp((indicators.bollingerPos - 0.5) * 2, -0.8, 0.8);

  const momentumSignal = clamp(indicators.roc20 / 0.18, -1, 1);
  const mfiSignal =
    indicators.mfi14 > 55 && indicators.mfi14 < 80
      ? 0.8
      : indicators.mfi14 >= 80
        ? -0.35
        : indicators.mfi14 < 20
          ? 0.35
          : 0;

  const cciSignal = clamp(indicators.cci20 / 180, -1, 1);
  const obvSignal = clamp(indicators.obvSlope / 0.6, -1, 1);
  const volumeSignal = clamp((indicators.volumeSurge - 1) / 1.2, -1, 1);
  const liquiditySignal = clamp((Math.log10(Math.max(indicators.avgDollarVolume20, 1)) - 6.2) / 1.4, -1, 1);
  const volQualitySignal = clamp((0.36 - indicators.realizedVol20) / 0.32, -1, 1);
  const drawdownSignal = clamp((indicators.drawdown63 + 0.18) / 0.18, -1, 1);
  const zSignal = clamp(-indicators.zScore20 / 2.5, -1, 1);
  const breakoutSignal = indicators.donchianBreakout ? 1 : 0;
  const volatilityPenalty = clamp((indicators.atrPct - 0.045) / 0.08, -1, 1);
  const candlePatternSignal =
    (indicators.bullishEngulfing ? 0.8 : 0) +
    (indicators.hammer ? 0.55 : 0) +
    (indicators.bearishEngulfing ? -0.8 : 0) +
    (indicators.shootingStar ? -0.55 : 0);
  const structurePatternSignal =
    (indicators.higherHighHigherLow ? 0.9 : 0) +
    (indicators.lowerHighLowerLow ? -0.9 : 0) +
    (indicators.insideBarBreakoutUp ? 0.7 : 0) +
    (indicators.insideBarBreakoutDown ? -0.7 : 0);

  return [
    { label: "Trend MA", value: trendAlignment, weight: 1.2 },
    { label: "EMA", value: emaSignal, weight: 0.8 },
    { label: "MACD", value: macdSignal, weight: 1.1 },
    { label: "ADX", value: adxSignal, weight: 1.0 },
    { label: "RSI", value: rsiSignal, weight: 0.8 },
    { label: "Stoch", value: stochasticSignal, weight: 0.5 },
    { label: "Bollinger", value: bollSignal, weight: 0.6 },
    { label: "ROC", value: momentumSignal, weight: 1.1 },
    { label: "MFI", value: mfiSignal, weight: 0.6 },
    { label: "CCI", value: cciSignal, weight: 0.55 },
    { label: "OBV", value: obvSignal, weight: 0.65 },
    { label: "Volume", value: volumeSignal, weight: 0.7 },
    { label: "Liquidity", value: liquiditySignal, weight: 0.85 },
    { label: "VolQuality", value: volQualitySignal, weight: 0.85 },
    { label: "Drawdown", value: drawdownSignal, weight: 0.75 },
    { label: "Z-Score", value: zSignal, weight: 0.55 },
    { label: "Breakout", value: breakoutSignal, weight: 0.9 },
    { label: "Volatility", value: -volatilityPenalty, weight: 0.55 },
    { label: "CandlePattern", value: candlePatternSignal, weight: 0.95 },
    { label: "StructurePattern", value: structurePatternSignal, weight: 1.0 },
  ];
}

function evaluateRecommendation(
  ticker: string,
  indicators: IndicatorPack,
  position: PositionMutable | undefined,
  marketRegime: MarketRegime,
): RecommendationCandidate {
  const breakdown = toSignalBreakdown(indicators);
  const weightTotal = sum(breakdown.map((entry) => Math.abs(entry.weight))) || 1;
  const weightedRaw = sum(breakdown.map((entry) => entry.value * entry.weight));
  const score = weightedRaw / weightTotal;

  const regimeExpectedAdj = marketRegime.state === "risk_on" ? 1.5 : marketRegime.state === "risk_off" ? -2.4 : -0.35;
  const expectedReturnRaw = score * 13 + indicators.roc20 * 100 * 0.45 - indicators.atrPct * 100 * 0.25 + regimeExpectedAdj;
  const expectedReturnPct = clamp(
    expectedReturnRaw,
    -25,
    30,
  );

  const confidenceMultiplier = marketRegime.state === "risk_on" ? 1.04 : marketRegime.state === "risk_off" ? 0.86 : 0.95;
  const confidence = clamp(
    (Math.abs(score) * 0.55 + clamp(indicators.adx14 / 40, 0, 1) * 0.25 + clamp(indicators.volumeSurge / 2, 0, 1) * 0.2) *
      100 *
      confidenceMultiplier,
    0,
    99,
  );

  const hasPosition = Boolean(position && position.units > 0);
  const bearishPattern =
    indicators.bearishEngulfing || indicators.shootingStar || indicators.insideBarBreakoutDown || indicators.lowerHighLowerLow;
  const bullishPattern =
    indicators.bullishEngulfing || indicators.hammer || indicators.insideBarBreakoutUp || indicators.higherHighHigherLow;
  const liquidityGate = indicators.avgDollarVolume20 >= MIN_AVG_DOLLAR_VOLUME_AUD;
  const volatilityGate = indicators.realizedVol20 <= 0.95;

  let action: RecommendationAction = "hold";

  if (hasPosition && position) {
    const stopLossHit = indicators.close <= position.avgCost * (1 - STOP_LOSS_PCT);
    const trailingStopHit = position.peakPrice > 0 && indicators.close <= position.peakPrice * (1 - TRAILING_STOP_PCT);
    const trendBreak = indicators.close < indicators.sma50 && indicators.macdHist < 0;
    const regimeExit = marketRegime.state === "risk_off" && (indicators.close < indicators.sma20 || indicators.drawdown63 <= -0.12);

    if (stopLossHit || trailingStopHit || regimeExit || score < -0.15 || bearishPattern || (trendBreak && indicators.rsi14 < 48)) {
      action = "sell";
    }
  } else {
    const trendGate = indicators.close > indicators.sma50 && indicators.sma50 > indicators.sma200;
    const qualityGate = indicators.volumeSurge > 0.9 && indicators.adx14 >= 14 && liquidityGate && volatilityGate;
    const regimeGate = marketRegime.allowNewLongs;

    if (score > 0.22 && expectedReturnPct >= 4 && trendGate && qualityGate && bullishPattern && regimeGate) {
      action = "buy";
    }
  }

  const patternTags = [
    indicators.bullishEngulfing ? "BullEngulf" : "",
    indicators.bearishEngulfing ? "BearEngulf" : "",
    indicators.hammer ? "Hammer" : "",
    indicators.shootingStar ? "ShootingStar" : "",
    indicators.insideBarBreakoutUp ? "InsideBreakUp" : "",
    indicators.insideBarBreakoutDown ? "InsideBreakDown" : "",
    indicators.higherHighHigherLow ? "HHHL" : "",
    indicators.lowerHighLowerLow ? "LHLL" : "",
  ].filter((value) => value.length > 0);

  const topSignals = [...breakdown]
    .sort((a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight))
    .slice(0, 4)
    .map((entry) => `${entry.label}:${(entry.value * entry.weight).toFixed(2)}`)
    .join(" | ");

  const reason =
    `Score ${score.toFixed(3)}; exp ${expectedReturnPct.toFixed(2)}%; conf ${confidence.toFixed(0)}%; ` +
    `MA20 ${indicators.sma20.toFixed(2)} / MA50 ${indicators.sma50.toFixed(2)} / MA200 ${indicators.sma200.toFixed(2)}; ` +
    `ROC20 ${(indicators.roc20 * 100).toFixed(2)}%; RSI ${indicators.rsi14.toFixed(1)}; ATR ${(indicators.atrPct * 100).toFixed(2)}%; ` +
    `ADV20 $${(indicators.avgDollarVolume20 / 1_000_000).toFixed(2)}M; RV20 ${(indicators.realizedVol20 * 100).toFixed(1)}%; DD63 ${(indicators.drawdown63 * 100).toFixed(1)}%; ` +
    `regime[${marketRegime.state}:${marketRegime.score.toFixed(2)}]` +
    `signals[${topSignals}]` +
    `${patternTags.length > 0 ? `; patterns[${patternTags.join(",")}]` : ""}`;

  return {
    ticker,
    action,
    score,
    expectedReturnPct,
    confidence,
    indicatorCount: breakdown.length,
    finalScore: score,
    aiAdjustment: 0,
    aiConfidence: 0,
    aiSummary: "",
    price: indicators.close,
    maShort: indicators.sma20,
    maLong: indicators.sma50,
    momentum: indicators.roc20,
    zScore: indicators.zScore20,
    realizedVol20: indicators.realizedVol20,
    avgDollarVolume20: indicators.avgDollarVolume20,
    reason,
  };
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

function getSydneyClockParts(now: Date): { weekday: string; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: SCAN_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = (parts.find((part) => part.type === "weekday")?.value || "").toLowerCase();
  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value || "0", 10);
  const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value || "0", 10);

  return {
    weekday,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

export function isAsxMarketOpenNow(now = new Date()): boolean {
  const clock = getSydneyClockParts(now);
  const isWeekday = ["mon", "tue", "wed", "thu", "fri"].includes(clock.weekday.slice(0, 3));
  if (!isWeekday) {
    return false;
  }

  const minuteOfDay = clock.hour * 60 + clock.minute;
  return minuteOfDay >= ASX_OPEN_START_MINUTES && minuteOfDay <= ASX_OPEN_END_MINUTES;
}

function clampTickerListForAi(candidates: RecommendationCandidate[]): RecommendationCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    const aMagnitude = Math.abs(a.expectedReturnPct) + Math.abs(a.finalScore) * 8;
    const bMagnitude = Math.abs(b.expectedReturnPct) + Math.abs(b.finalScore) * 8;
    return bMagnitude - aMagnitude;
  });

  return sorted.slice(0, AI_MAX_CANDIDATES);
}

function parseAiOverlayResponse(raw: string): AiOverlayEntry[] {
  const trimmed = String(raw || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/, "")
    .trim();
  if (!trimmed) {
    return [];
  }

  try {
    const payload = JSON.parse(trimmed) as { entries?: Array<{ ticker?: string; adjustment?: number; confidence?: number; summary?: string }> };
    const entries = payload.entries || [];
    return entries
      .map((entry) => ({
        ticker: normalizeTicker(String(entry.ticker || "")),
        adjustment: clamp(Number(entry.adjustment || 0), -3, 3),
        confidence: clamp(Number(entry.confidence || 0), 0, 100),
        summary: String(entry.summary || "").trim().slice(0, 220),
      }))
      .filter((entry) => entry.ticker.length > 0);
  } catch {
    return [];
  }
}

async function fetchAiOverlay(candidates: RecommendationCandidate[], marketRegime: MarketRegime): Promise<AiOverlayResult | null> {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey || candidates.length === 0) {
    return null;
  }

  const selected = clampTickerListForAi(candidates).map((candidate) => ({
    ticker: candidate.ticker,
    action: candidate.action,
    score: Number(candidate.score.toFixed(4)),
    expectedReturnPct: Number(candidate.expectedReturnPct.toFixed(2)),
    confidence: Number(candidate.confidence.toFixed(1)),
    realizedVolPct: Number((candidate.realizedVol20 * 100).toFixed(2)),
    avgDollarVolumeM: Number((candidate.avgDollarVolume20 / 1_000_000).toFixed(2)),
    maShort: Number(candidate.maShort.toFixed(3)),
    maLong: Number(candidate.maLong.toFixed(3)),
    momentumPct: Number((candidate.momentum * 100).toFixed(3)),
    zScore: Number(candidate.zScore.toFixed(3)),
    reason: candidate.reason.slice(0, 220),
  }));

  const prompt =
    "You are a strict ASX quantitative overlay used in an institutional-style workflow. " +
    "Given quantitative candidates, return JSON only with schema {\"entries\":[{\"ticker\":\"ABC\",\"adjustment\":number,\"confidence\":number,\"summary\":\"...\"}]}. " +
    "adjustment range must be [-3,3], confidence [0,100], summary <= 25 words. " +
    "Use risk-aware adjustments that respect the provided market regime; do not invent tickers.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.1,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: JSON.stringify({
              marketRegime: {
                state: marketRegime.state,
                score: Number(marketRegime.score.toFixed(3)),
                summary: marketRegime.summary,
              },
              entries: selected,
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };

    const content = payload.choices?.[0]?.message?.content || "";
    const entries = parseAiOverlayResponse(content);

    return {
      model: payload.model || AI_MODEL,
      entries,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function applyAiOverlay(
  recommendations: RecommendationCandidate[],
  marketRegime: MarketRegime,
): Promise<{ used: boolean; model: string | null }> {
  for (const recommendation of recommendations) {
    recommendation.aiAdjustment = 0;
    recommendation.aiConfidence = 0;
    recommendation.aiSummary = "";
    recommendation.finalScore = recommendation.score;
  }

  const overlay = await fetchAiOverlay(recommendations, marketRegime);
  if (!overlay || overlay.entries.length === 0) {
    return { used: false, model: null };
  }

  const byTicker = new Map(overlay.entries.map((entry) => [entry.ticker, entry]));

  for (const recommendation of recommendations) {
    const overlayEntry = byTicker.get(recommendation.ticker);
    if (!overlayEntry) {
      continue;
    }

    recommendation.aiAdjustment = clamp(overlayEntry.adjustment, -3, 3);
    recommendation.aiConfidence = clamp(overlayEntry.confidence, 0, 100);
    recommendation.aiSummary = overlayEntry.summary;

    const confidenceBoost = (recommendation.aiConfidence / 100 - 0.5) * 0.12;
    recommendation.finalScore = recommendation.score + recommendation.aiAdjustment * 0.18 + confidenceBoost;
    recommendation.expectedReturnPct = clamp(recommendation.expectedReturnPct + recommendation.aiAdjustment * 1.8, -30, 35);

    if (recommendation.action === "buy" && recommendation.aiAdjustment <= -1.5) {
      recommendation.action = "hold";
    }

    if (recommendation.action === "sell" && recommendation.aiAdjustment >= 1.5) {
      recommendation.action = "hold";
    }

    if (recommendation.aiSummary) {
      recommendation.reason = `${recommendation.reason}; AI[${recommendation.aiSummary}]`;
    }
  }

  return { used: true, model: overlay.model };
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
      SELECT ticker, units, avg_cost, last_price, peak_price, updated_at
      FROM platinum_paper_positions
      WHERE user_id = ?
      ORDER BY ticker ASC
    `)
    .all(userId) as PositionRow[];
}

function toSummary(row: PortfolioRow, positions: PlatinumPaperPosition[]): PlatinumPaperPortfolioSummary {
  const investedValue = positions.reduce((sumValue, position) => sumValue + position.marketValue, 0);
  const unrealizedPnl = positions.reduce((sumValue, position) => sumValue + position.unrealizedPnl, 0);
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
      const peakPrice = Math.max(toFiniteNumber(row.peak_price, 0), lastPrice);
      const marketValue = units * lastPrice;
      const unrealizedPnl = (lastPrice - avgCost) * units;

      return {
        ticker: row.ticker,
        units,
        avgCost,
        lastPrice,
        peakPrice,
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
          SELECT id, scan_date, ticker, action, score, expected_return_pct, confidence, indicator_count, final_score,
            ai_adjustment, ai_confidence, ai_summary, price,
            ma_short, ma_long, momentum, z_score, reason, created_at
          FROM platinum_recommendations
          WHERE user_id = ? AND scan_date = ?
          ORDER BY
            CASE action WHEN 'buy' THEN 0 WHEN 'sell' THEN 1 ELSE 2 END,
            final_score DESC,
            expected_return_pct DESC,
            ABS(score) DESC,
            ticker ASC
          LIMIT 200
        `)
        .all(userId, latestScanDate) as RecommendationRow[])
    : [];

  const trades = db
    .prepare(`
      SELECT id, scan_date, ticker, side, units, price, notional, fee, reason, created_at
      FROM platinum_paper_trades
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 200
    `)
    .all(userId) as TradeRow[];

  const snapshots = db
    .prepare(`
      SELECT scan_date, cash, invested_value, equity, created_at
      FROM platinum_paper_snapshots
      WHERE user_id = ?
      ORDER BY scan_date DESC
      LIMIT 200
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
      expectedReturnPct: toFiniteNumber(row.expected_return_pct, 0),
      confidence: toFiniteNumber(row.confidence, 0),
      indicatorCount: toFiniteNumber(row.indicator_count, 0),
      finalScore: toFiniteNumber(row.final_score, toFiniteNumber(row.score, 0)),
      aiAdjustment: toFiniteNumber(row.ai_adjustment, 0),
      aiConfidence: toFiniteNumber(row.ai_confidence, 0),
      aiSummary: String(row.ai_summary || ""),
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
    universeSize: estimateUniverseSizeFromConfig(),
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
      peakPrice: Math.max(toFiniteNumber(row.peak_price, 0), toFiniteNumber(row.last_price, 0)),
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

function pruneHistoricalData(db: DatabaseSync, userId: string): void {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - PLATINUM_HISTORY_DAYS);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  db.prepare("DELETE FROM platinum_recommendations WHERE user_id = ? AND scan_date < ?").run(userId, cutoffDate);
  db.prepare("DELETE FROM platinum_paper_trades WHERE user_id = ? AND scan_date < ?").run(userId, cutoffDate);
  db.prepare("DELETE FROM platinum_paper_snapshots WHERE user_id = ? AND scan_date < ?").run(userId, cutoffDate);
}

export async function runPlatinumDailyScan(userId: string, options: RunScanOptions = {}): Promise<PlatinumScanRunResult> {
  const db = getDb();
  const scanDate = currentScanDate();
  const nowIso = new Date().toISOString();
  const allowIntraday = options.allowIntraday === true;
  const marketOpen = isAsxMarketOpenNow();

  ensurePortfolioRow(db, userId);

  if (options.requireMarketOpen === true && !marketOpen) {
    return {
      state: getPlatinumPaperState(userId),
      scanDate,
      executedTrades: 0,
      generatedRecommendations: 0,
      skippedTickers: [],
      alreadyRanToday: true,
      marketOpen: false,
      skippedBecauseMarketClosed: true,
      usedAiOverlay: false,
      aiModel: null,
    };
  }

  const alreadyRan = db
    .prepare("SELECT 1 AS ok FROM platinum_paper_snapshots WHERE user_id = ? AND scan_date = ? LIMIT 1")
    .get(userId, scanDate) as { ok: number } | undefined;

  if (!allowIntraday && alreadyRan?.ok) {
    return {
      state: getPlatinumPaperState(userId),
      scanDate,
      executedTrades: 0,
      generatedRecommendations: 0,
      skippedTickers: [],
      alreadyRanToday: true,
      marketOpen,
      skippedBecauseMarketClosed: false,
      usedAiOverlay: false,
      aiModel: null,
    };
  }

  const portfolioRow = ensurePortfolioRow(db, userId);
  const lastScanMs = portfolioRow.last_scan_at ? new Date(portfolioRow.last_scan_at).getTime() : Number.NaN;
  const nowMs = Date.now();

  if (allowIntraday && Number.isFinite(lastScanMs) && nowMs - lastScanMs < MIN_LIVE_SCAN_INTERVAL_MS) {
    return {
      state: getPlatinumPaperState(userId),
      scanDate,
      executedTrades: 0,
      generatedRecommendations: 0,
      skippedTickers: [],
      alreadyRanToday: true,
      marketOpen,
      skippedBecauseMarketClosed: false,
      usedAiOverlay: false,
      aiModel: null,
    };
  }

  const existingPositions = mapRowsToMutablePositions(readPositions(db, userId));
  const marketRegime = await resolveMarketRegime();

  const universeRaw = await resolveUniverse();
  const universe = Array.from(new Set([...universeRaw, ...Array.from(existingPositions.keys())]));

  const outcomes = await mapWithConcurrency(universe, ASX_FETCH_CONCURRENCY, async (ticker): Promise<ScanOutcome> => {
    try {
      const series = await fetchAsxSeriesFromYahoo(ticker, "1y");
      if (!series) {
        return { ticker, recommendation: null, latestPrice: null, skipReason: "no_price_series" };
      }

      const indicators = buildIndicators(series);
      if (!indicators) {
        return { ticker, recommendation: null, latestPrice: null, skipReason: "insufficient_history" };
      }

      const position = existingPositions.get(ticker);
      const recommendation = evaluateRecommendation(ticker, indicators, position, marketRegime);

      return {
        ticker,
        recommendation,
        latestPrice: indicators.close,
        skipReason: null,
      };
    } catch {
      return { ticker, recommendation: null, latestPrice: null, skipReason: "fetch_error" };
    }
  });

  const skippedTickers = outcomes
    .filter((outcome) => outcome.recommendation == null)
    .map((outcome) => outcome.ticker);

  const recommendations = outcomes
    .map((outcome) => outcome.recommendation)
    .filter((item): item is RecommendationCandidate => Boolean(item));

  const aiOverlay = await applyAiOverlay(recommendations, marketRegime);

  const latestPriceByTicker = new Map<string, number>();
  for (const outcome of outcomes) {
    if (outcome.latestPrice != null && Number.isFinite(outcome.latestPrice) && outcome.latestPrice > 0) {
      latestPriceByTicker.set(outcome.ticker, outcome.latestPrice);
    }
  }

  for (const [ticker, position] of existingPositions.entries()) {
    const latestPrice = latestPriceByTicker.get(ticker);
    if (latestPrice && Number.isFinite(latestPrice) && latestPrice > 0) {
      position.lastPrice = latestPrice;
      position.peakPrice = Math.max(position.peakPrice, latestPrice);
    }
  }

  let cash = toFiniteNumber(portfolioRow.cash, STARTING_CAPITAL_AUD);
  let realizedPnl = toFiniteNumber(portfolioRow.realized_pnl, 0);
  const trades: TradeCandidate[] = [];

  const sellRecommendations = recommendations
    .filter((item) => item.action === "sell")
    .sort((a, b) => a.finalScore - b.finalScore);

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
    .sort((a, b) => {
      if (b.expectedReturnPct !== a.expectedReturnPct) {
        return b.expectedReturnPct - a.expectedReturnPct;
      }

      if (b.finalScore !== a.finalScore) {
        return b.finalScore - a.finalScore;
      }

      return b.confidence - a.confidence;
    });

  for (const recommendation of buyRecommendations) {
    if (existingPositions.has(recommendation.ticker)) {
      continue;
    }

    if (existingPositions.size >= MAX_OPEN_POSITIONS) {
      break;
    }

    const investedValue = computeInvestedValue(existingPositions);
    const equity = cash + investedValue;
    const baseBudget = Math.min(equity * TARGET_EQUITY_PER_BUY, cash * MAX_CASH_PER_BUY);
    const convictionMultiplier = clamp(0.65 + recommendation.finalScore * 0.4 + recommendation.confidence / 260, 0.35, 1.35);
    const volScalar = clamp(
      TARGET_ANNUAL_VOLATILITY / Math.max(recommendation.realizedVol20, 0.08),
      0.4,
      1.6,
    );
    const buyBudget = baseBudget * convictionMultiplier * volScalar * marketRegime.positionSizeMultiplier;

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

    const minCashReserve = equity * MIN_CASH_RESERVE_PCT;
    const cashAvailableForTrade = Math.max(0, cash - minCashReserve);

    if (totalCost > cashAvailableForTrade) {
      units = floorTo(cashAvailableForTrade / (fillPrice * (1 + FEE_RATE)), 4);
      if (units <= 0) {
        continue;
      }
      notional = units * fillPrice;
      fee = notional * FEE_RATE;
      totalCost = notional + fee;
    }

    if (notional < MIN_TRADE_NOTIONAL || totalCost > cashAvailableForTrade) {
      continue;
    }

    cash -= totalCost;

    existingPositions.set(recommendation.ticker, {
      ticker: recommendation.ticker,
      units,
      avgCost: fillPrice,
      lastPrice: recommendation.price,
      peakPrice: recommendation.price,
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

  const investedValue = computeInvestedValue(existingPositions);
  const equity = cash + investedValue;

  db.exec("BEGIN IMMEDIATE");

  try {
    const recommendationInsert = db.prepare(`
      INSERT INTO platinum_recommendations (
        id, user_id, scan_date, ticker, action, score, expected_return_pct, confidence, indicator_count, final_score,
        ai_adjustment, ai_confidence, ai_summary, price, ma_short, ma_long, momentum, z_score, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const recommendation of recommendations) {
      recommendationInsert.run(
        crypto.randomUUID(),
        userId,
        scanDate,
        recommendation.ticker,
        recommendation.action,
        recommendation.score,
        recommendation.expectedReturnPct,
        recommendation.confidence,
        recommendation.indicatorCount,
        recommendation.finalScore,
        recommendation.aiAdjustment,
        recommendation.aiConfidence,
        recommendation.aiSummary,
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
      INSERT INTO platinum_paper_positions (user_id, ticker, units, avg_cost, last_price, peak_price, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const position of existingPositions.values()) {
      if (position.units <= 0) {
        continue;
      }

      positionInsert.run(
        userId,
        position.ticker,
        position.units,
        position.avgCost,
        position.lastPrice,
        Math.max(position.peakPrice, position.lastPrice),
        nowIso,
      );
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

    pruneHistoricalData(db, userId);

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
    marketOpen,
    skippedBecauseMarketClosed: false,
    usedAiOverlay: aiOverlay.used,
    aiModel: aiOverlay.model,
  };
}
