import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DataSource, PortfolioHolding, PortfolioState, RiskWindow } from "@/lib/portfolio";

const DEFAULT_DB_FILE = path.join(process.cwd(), "data", "aladdin.sqlite");
const DB_FILE = process.env.SQLITE_DB_PATH?.trim() || DEFAULT_DB_FILE;
const DATA_DIR = path.dirname(DB_FILE);

const UPDATED_AT_KEY = "updated_at";
const LAST_PRICE_REFRESH_KEY = "last_price_refresh_at";

const LOCAL_USER_ID = "local-user";

let dbInstance: DatabaseSync | null = null;

interface MetaRow {
  value: string;
}

interface HoldingRow {
  id: string;
  source: string;
  account: string;
  ticker: string;
  name: string;
  units: number;
  price: number;
  prev_close: number;
  value: number;
  cost_base: number;
  sector: string;
  report_date: string;
  imported_at: string;
}

interface SnapshotRow {
  date: string;
  value: number;
}

interface HoldingTickerRow {
  ticker: string;
  units: number;
}

interface HoldingRiskRow {
  ticker: string;
  value: number;
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
}

interface YahooChartIndicator {
  close?: Array<number | null>;
}

interface YahooChartResult {
  meta?: YahooChartMeta;
  indicators?: {
    quote?: YahooChartIndicator[];
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[];
  };
}

interface AsxQuoteData {
  price: number | null;
  prevClose: number | null;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  created_at: string;
  terms_accepted_at?: string;
}

interface SessionUserRow {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
  expires_at: string;
}

interface BillingSubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_status: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthPublicUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
}

export interface AuthUserWithPassword extends AuthPublicUser {
  passwordHash: string;
}

export interface AuthSessionUser extends AuthPublicUser {
  sessionExpiresAt: string;
}

export interface BillingSubscription {
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceRefreshResult {
  state: PortfolioState;
  updatedTickers: string[];
  failedTickers: string[];
  fetchedAt: string;
}

export interface HistoricalRiskEstimateResult {
  source: "yahoo_estimate";
  lessAccurateThanSnapshots: true;
  note: string;
  riskWindow: RiskWindow;
  pointsTarget: number;
  pointsUsed: number;
  returnsCount: number;
  usedTickers: string[];
  failedTickers: string[];
  volatilityAnnualPct: number | null;
  maxDrawdownPct: number | null;
  var95Pct: number | null;
  var95Amount: number | null;
}

const RISK_WINDOW_SETTINGS: Record<RiskWindow, { label: string; yahooRange: string; maxPoints: number }> = {
  "1M": { label: "1M", yahooRange: "3mo", maxPoints: 21 },
  "3M": { label: "3M", yahooRange: "6mo", maxPoints: 63 },
  "1Y": { label: "1Y", yahooRange: "2y", maxPoints: 252 },
};

function getDb(): DatabaseSync {
  if (!dbInstance) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    dbInstance = new DatabaseSync(DB_FILE);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    initSchema(dbInstance);
  }

  return dbInstance;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      account TEXT NOT NULL,
      ticker TEXT NOT NULL,
      name TEXT NOT NULL,
      units REAL NOT NULL,
      price REAL NOT NULL,
      prev_close REAL NOT NULL DEFAULT 0,
      value REAL NOT NULL,
      cost_base REAL NOT NULL,
      sector TEXT NOT NULL,
      report_date TEXT NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_holdings_source ON holdings (source);
    CREATE INDEX IF NOT EXISTS idx_holdings_report_date ON holdings (report_date);

    CREATE TABLE IF NOT EXISTS snapshots (
      date TEXT PRIMARY KEY,
      value REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      terms_accepted_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

    CREATE TABLE IF NOT EXISTS billing_subscriptions (
      user_id TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_price_id TEXT,
      stripe_status TEXT,
      current_period_end TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer ON billing_subscriptions (stripe_customer_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_subscriptions_subscription
      ON billing_subscriptions (stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL;
  `);

  const hasPrevCloseColumn = db
    .prepare("SELECT 1 AS ok FROM pragma_table_info('holdings') WHERE name = 'prev_close'")
    .get() as { ok: number } | undefined;

  if (!hasPrevCloseColumn) {
    db.exec("ALTER TABLE holdings ADD COLUMN prev_close REAL NOT NULL DEFAULT 0;");
  }

  const hasTermsAcceptedColumn = db
    .prepare("SELECT 1 AS ok FROM pragma_table_info('users') WHERE name = 'terms_accepted_at'")
    .get() as { ok: number } | undefined;

  if (!hasTermsAcceptedColumn) {
    db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT NOT NULL DEFAULT '';");
    db.exec("UPDATE users SET terms_accepted_at = created_at WHERE terms_accepted_at = '';");
  }
}

function normalizeSource(value: unknown): DataSource {
  if (value === "super") {
    return "super";
  }

  if (value === "gold") {
    return "gold";
  }

  return "asx";
}

function sanitizeString(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function sanitizeNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sanitizeDate(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return new Date().toISOString().slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function sanitizeUserId(userId: string): string {
  const cleaned = userId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned.length > 0 ? cleaned : LOCAL_USER_ID;
}

function userPrefix(userId: string): string {
  return `${sanitizeUserId(userId)}::`;
}

function userLikePattern(userId: string): string {
  return `${userPrefix(userId)}%`;
}

function scopeKey(userId: string, key: string): string {
  return `${userPrefix(userId)}${key}`;
}

function scopeId(userId: string, value: string): string {
  return `${userPrefix(userId)}${value}`;
}

function unscopeValue(userId: string, value: string): string {
  const prefix = userPrefix(userId);
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function sanitizeHolding(raw: PortfolioHolding, source: DataSource, index: number): PortfolioHolding | null {
  const value = sanitizeNumber(raw.value, Number.NaN);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return {
    id: sanitizeString(raw.id, `${source}-${index}-${Date.now()}`),
    source,
    account: sanitizeString(raw.account, source === "super" ? "Superannuation" : source === "gold" ? "ABC Bullion" : "Brokerage"),
    ticker: sanitizeString(raw.ticker, "UNKNOWN").toUpperCase(),
    name: sanitizeString(raw.name, "Unnamed Holding"),
    units: sanitizeNumber(raw.units, 0),
    price: sanitizeNumber(raw.price, 0),
    prevClose: sanitizeNumber(raw.prevClose, sanitizeNumber(raw.price, 0)),
    value,
    costBase: sanitizeNumber(raw.costBase, value),
    sector: sanitizeString(raw.sector, source === "super" ? "Super" : source === "gold" ? "Precious Metals" : "Equity"),
    reportDate: sanitizeDate(raw.reportDate),
    importedAt: sanitizeString(raw.importedAt, new Date().toISOString()),
  };
}

function getMetaValue(db: DatabaseSync, key: string): string {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as MetaRow | undefined;
  return row?.value ?? "";
}

function setMetaValue(db: DatabaseSync, key: string, value: string): void {
  db.prepare(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function getScopedMetaValue(db: DatabaseSync, userId: string, key: string): string {
  return getMetaValue(db, scopeKey(userId, key));
}

function setScopedMetaValue(db: DatabaseSync, userId: string, key: string, value: string): void {
  setMetaValue(db, scopeKey(userId, key), value);
}

function normalizeEmail(email: string): string {
  return sanitizeString(email, "").toLowerCase();
}

function toPublicUser(row: UserRow): AuthPublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
  };
}

function toYahooSymbol(ticker: string): string {
  const clean = ticker.trim().toUpperCase();
  if (clean.length === 0) {
    return clean;
  }

  if (clean.includes(".")) {
    return clean;
  }

  return `${clean}.AX`;
}

function extractAsxQuote(result: YahooChartResult | undefined): AsxQuoteData {
  const regular = sanitizeNumber(result?.meta?.regularMarketPrice, Number.NaN);

  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const validCloses = closes
    .map((value) => sanitizeNumber(value, Number.NaN))
    .filter((value) => Number.isFinite(value) && value > 0);

  const latestClose = validCloses.length > 0 ? validCloses[validCloses.length - 1] : null;
  const seriesPrevClose = validCloses.length > 1 ? validCloses[validCloses.length - 2] : null;

  const metaPrevClose = sanitizeNumber(result?.meta?.previousClose, Number.NaN);
  const chartPrevClose = sanitizeNumber(result?.meta?.chartPreviousClose, Number.NaN);

  return {
    price: Number.isFinite(regular) && regular > 0 ? regular : latestClose,
    prevClose:
      Number.isFinite(metaPrevClose) && metaPrevClose > 0
        ? metaPrevClose
        : Number.isFinite(chartPrevClose) && chartPrevClose > 0
          ? chartPrevClose
          : seriesPrevClose,
  };
}

function extractCloseSeries(result: YahooChartResult | undefined): number[] {
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  return closes
    .map((value) => sanitizeNumber(value, Number.NaN))
    .filter((value) => Number.isFinite(value) && value > 0);
}

async function fetchAsxQuoteFromYahoo(ticker: string): Promise<AsxQuoteData | null> {
  const symbol = toYahooSymbol(ticker);
  if (!symbol) {
    return null;
  }

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as YahooChartResponse;
    return extractAsxQuote(payload.chart?.result?.[0]);
  } catch {
    return null;
  }
}

async function fetchAsxSeriesFromYahoo(ticker: string, range: string): Promise<number[] | null> {
  const symbol = toYahooSymbol(ticker);
  if (!symbol) {
    return null;
  }

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as YahooChartResponse;
    const series = extractCloseSeries(payload.chart?.result?.[0]);
    return series.length >= 2 ? series : null;
  } catch {
    return null;
  }
}

function calculateReturnsFromPrices(prices: number[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1];
    const current = prices[i];
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(current)) {
      returns.push(current / prev - 1);
    }
  }

  return returns;
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

  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function calcMaxDrawdownFromReturns(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  let peak = 1;
  let current = 1;
  let maxDrawdown = 0;

  for (const dailyReturn of returns) {
    current *= 1 + dailyReturn;
    if (current > peak) {
      peak = current;
    }

    const drawdown = peak > 0 ? (peak - current) / peak : 0;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

export function readPortfolioState(userId = LOCAL_USER_ID): PortfolioState {
  const db = getDb();
  const scopedPattern = userLikePattern(userId);

  const holdingRows = db
    .prepare(`
      SELECT id, source, account, ticker, name, units, price, prev_close, value, cost_base, sector, report_date, imported_at
      FROM holdings
      WHERE id LIKE ?
      ORDER BY value DESC, ticker ASC
    `)
    .all(scopedPattern) as HoldingRow[];

  const snapshotRows = db
    .prepare(`
      SELECT date, value
      FROM snapshots
      WHERE date LIKE ?
      ORDER BY date ASC
    `)
    .all(scopedPattern) as SnapshotRow[];

  return {
    holdings: holdingRows.map((row) => ({
      id: unscopeValue(userId, row.id),
      source: normalizeSource(row.source),
      account: row.account,
      ticker: row.ticker,
      name: row.name,
      units: sanitizeNumber(row.units),
      price: sanitizeNumber(row.price),
      prevClose: sanitizeNumber(row.prev_close),
      value: sanitizeNumber(row.value),
      costBase: sanitizeNumber(row.cost_base),
      sector: row.sector,
      reportDate: row.report_date,
      importedAt: row.imported_at,
    })),
    snapshots: snapshotRows.map((row) => ({
      date: unscopeValue(userId, row.date),
      value: sanitizeNumber(row.value),
    })),
    updatedAt: getScopedMetaValue(db, userId, UPDATED_AT_KEY),
    lastPriceRefreshAt: getScopedMetaValue(db, userId, LAST_PRICE_REFRESH_KEY),
  };
}

export function saveImport(userId: string, source: DataSource, holdings: PortfolioHolding[]): PortfolioState {
  const db = getDb();
  const normalizedSource: DataSource = source === "super" ? "super" : source === "gold" ? "gold" : "asx";
  const scopedPattern = userLikePattern(userId);

  const cleanedHoldings = holdings
    .map((holding, index) => sanitizeHolding(holding, normalizedSource, index))
    .filter((holding): holding is PortfolioHolding => Boolean(holding));

  if (cleanedHoldings.length === 0) {
    throw new Error("No valid holdings to save.");
  }

  const latestReportDate = cleanedHoldings.map((holding) => holding.reportDate).sort((a, b) => b.localeCompare(a))[0];
  const nowIso = new Date().toISOString();
  const snapshotAt = latestReportDate + "T" + nowIso.slice(11);
  const scopedSnapshotAt = scopeId(userId, snapshotAt);

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM holdings WHERE source = ? AND id LIKE ?").run(normalizedSource, scopedPattern);

    const insert = db.prepare(`
      INSERT INTO holdings (
        id, source, account, ticker, name, units, price, prev_close, value, cost_base, sector, report_date, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const holding of cleanedHoldings) {
      insert.run(
        scopeId(userId, holding.id),
        holding.source,
        holding.account,
        holding.ticker,
        holding.name,
        holding.units,
        holding.price,
        sanitizeNumber(holding.prevClose, holding.price),
        holding.value,
        holding.costBase,
        holding.sector,
        holding.reportDate,
        holding.importedAt,
      );
    }

    const totalRow = db
      .prepare("SELECT COALESCE(SUM(value), 0) AS total_value FROM holdings WHERE id LIKE ?")
      .get(scopedPattern) as { total_value: number };

    db.prepare(`
      INSERT INTO snapshots (date, value)
      VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET value = excluded.value
    `).run(scopedSnapshotAt, sanitizeNumber(totalRow.total_value));

    setScopedMetaValue(db, userId, UPDATED_AT_KEY, nowIso);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return readPortfolioState(userId);
}

export async function refreshAsxPrices(userId: string): Promise<PriceRefreshResult> {
  const db = getDb();
  const scopedPattern = userLikePattern(userId);

  const asxRows = db
    .prepare(`
      SELECT ticker, units
      FROM holdings
      WHERE source = 'asx' AND id LIKE ?
    `)
    .all(scopedPattern) as HoldingTickerRow[];

  const uniqueTickers = Array.from(
    new Set(
      asxRows
        .map((row) => sanitizeString(row.ticker, "").toUpperCase())
        .filter((ticker) => ticker.length > 0),
    ),
  );

  const nowIso = new Date().toISOString();

  if (uniqueTickers.length === 0) {
    setScopedMetaValue(db, userId, LAST_PRICE_REFRESH_KEY, nowIso);
    return {
      state: readPortfolioState(userId),
      updatedTickers: [],
      failedTickers: [],
      fetchedAt: nowIso,
    };
  }

  const quoteByTicker = new Map<string, { price: number; prevClose: number }>();
  const failedTickers: string[] = [];

  // Sequential fetch reduces the chance of upstream rate limiting.
  for (const ticker of uniqueTickers) {
    const quote = await fetchAsxQuoteFromYahoo(ticker);
    const price = sanitizeNumber(quote?.price, Number.NaN);
    const prevClose = sanitizeNumber(quote?.prevClose, price);

    if (Number.isFinite(price) && price > 0) {
      quoteByTicker.set(ticker, {
        price,
        prevClose: Number.isFinite(prevClose) && prevClose > 0 ? prevClose : price,
      });
    } else {
      failedTickers.push(ticker);
    }
  }

  if (quoteByTicker.size === 0) {
    setScopedMetaValue(db, userId, LAST_PRICE_REFRESH_KEY, nowIso);
    return {
      state: readPortfolioState(userId),
      updatedTickers: [],
      failedTickers,
      fetchedAt: nowIso,
    };
  }

  db.exec("BEGIN IMMEDIATE");

  try {
    const updateStmt = db.prepare(`
      UPDATE holdings
      SET
        prev_close = ?,
        price = ?,
        value = CASE WHEN units > 0 THEN units * ? ELSE value END
      WHERE source = 'asx' AND ticker = ? AND id LIKE ?
    `);

    for (const [ticker, quote] of quoteByTicker.entries()) {
      updateStmt.run(quote.prevClose, quote.price, quote.price, ticker, scopedPattern);
    }

    const totalRow = db
      .prepare("SELECT COALESCE(SUM(value), 0) AS total_value FROM holdings WHERE id LIKE ?")
      .get(scopedPattern) as { total_value: number };

    db.prepare(`
      INSERT INTO snapshots (date, value)
      VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET value = excluded.value
    `).run(scopeId(userId, nowIso), sanitizeNumber(totalRow.total_value));

    setScopedMetaValue(db, userId, UPDATED_AT_KEY, nowIso);
    setScopedMetaValue(db, userId, LAST_PRICE_REFRESH_KEY, nowIso);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    state: readPortfolioState(userId),
    updatedTickers: Array.from(quoteByTicker.keys()),
    failedTickers,
    fetchedAt: nowIso,
  };
}

export async function estimateHistoricalRiskFromYahoo(
  userId: string,
  riskWindow: RiskWindow = "3M",
): Promise<HistoricalRiskEstimateResult> {
  const db = getDb();
  const scopedPattern = userLikePattern(userId);
  const windowSettings = RISK_WINDOW_SETTINGS[riskWindow];

  const rows = db
    .prepare(`
      SELECT ticker, value
      FROM holdings
      WHERE value > 0 AND id LIKE ?
    `)
    .all(scopedPattern) as HoldingRiskRow[];

  const totalPortfolioValue = rows.reduce((acc, row) => acc + sanitizeNumber(row.value, 0), 0);

  if (rows.length === 0 || totalPortfolioValue <= 0) {
    return {
      source: "yahoo_estimate",
      lessAccurateThanSnapshots: true,
      note: "Estimated from Yahoo historical stock performance. This is less accurate than your own portfolio snapshot history. No holdings available yet.",
      riskWindow,
      pointsTarget: windowSettings.maxPoints,
      pointsUsed: 0,
      returnsCount: 0,
      usedTickers: [],
      failedTickers: [],
      volatilityAnnualPct: null,
      maxDrawdownPct: null,
      var95Pct: null,
      var95Amount: null,
    };
  }

  const valueByTicker = new Map<string, number>();
  for (const row of rows) {
    const ticker = sanitizeString(row.ticker, "").toUpperCase();
    const value = sanitizeNumber(row.value, 0);
    if (!ticker || value <= 0) {
      continue;
    }

    valueByTicker.set(ticker, (valueByTicker.get(ticker) || 0) + value);
  }

  const returnsByTicker = new Map<string, number[]>();
  const failedTickers: string[] = [];

  for (const ticker of Array.from(valueByTicker.keys())) {
    const series = await fetchAsxSeriesFromYahoo(ticker, windowSettings.yahooRange);
    if (!series || series.length < 2) {
      failedTickers.push(ticker);
      continue;
    }

    const returns = calculateReturnsFromPrices(series);
    if (returns.length >= 1) {
      returnsByTicker.set(ticker, returns);
    } else {
      failedTickers.push(ticker);
    }
  }

  if (returnsByTicker.size === 0) {
    return {
      source: "yahoo_estimate",
      lessAccurateThanSnapshots: true,
      note: "Estimated from Yahoo historical stock performance. This is less accurate than your own portfolio snapshot history. Could not fetch enough history for current tickers.",
      riskWindow,
      pointsTarget: windowSettings.maxPoints,
      pointsUsed: 0,
      returnsCount: 0,
      usedTickers: [],
      failedTickers,
      volatilityAnnualPct: null,
      maxDrawdownPct: null,
      var95Pct: null,
      var95Amount: null,
    };
  }

  const usedTickers = Array.from(returnsByTicker.keys());
  const usedValueTotal = usedTickers.reduce((acc, ticker) => acc + (valueByTicker.get(ticker) || 0), 0);

  const pointsAvailable = usedTickers
    .map((ticker) => returnsByTicker.get(ticker)?.length || 0)
    .reduce((min, len) => Math.min(min, len), Number.MAX_SAFE_INTEGER);

  const pointsUsed = Math.min(pointsAvailable, windowSettings.maxPoints);

  if (!Number.isFinite(pointsUsed) || pointsUsed < 2) {
    return {
      source: "yahoo_estimate",
      lessAccurateThanSnapshots: true,
      note: "Estimated from Yahoo historical stock performance. This is less accurate than your own portfolio snapshot history. Not enough common return points available.",
      riskWindow,
      pointsTarget: windowSettings.maxPoints,
      pointsUsed: 0,
      returnsCount: 0,
      usedTickers,
      failedTickers,
      volatilityAnnualPct: null,
      maxDrawdownPct: null,
      var95Pct: null,
      var95Amount: null,
    };
  }

  const portfolioReturns: number[] = [];

  for (let i = 0; i < pointsUsed; i += 1) {
    let dayReturn = 0;

    for (const ticker of usedTickers) {
      const tickerReturns = returnsByTicker.get(ticker) || [];
      const pointIndex = tickerReturns.length - pointsUsed + i;
      const r = tickerReturns[pointIndex];
      const weight = usedValueTotal > 0 ? (valueByTicker.get(ticker) || 0) / usedValueTotal : 0;
      dayReturn += weight * r;
    }

    portfolioReturns.push(dayReturn);
  }

  const volatilityAnnualPct = pointsUsed >= 2 ? stdDev(portfolioReturns) * Math.sqrt(252) * 100 : null;
  const maxDrawdownPct = pointsUsed >= 2 ? calcMaxDrawdownFromReturns(portfolioReturns) * 100 : null;

  const var95Raw = portfolioReturns.length >= 20 ? percentile(portfolioReturns, 0.05) : null;
  const var95Pct = var95Raw != null ? Math.max(0, -var95Raw * 100) : null;
  const var95Amount = var95Pct != null ? (var95Pct / 100) * usedValueTotal : null;

  const noteParts = [
    `Estimated from Yahoo historical stock performance and current portfolio weights (${windowSettings.label} window).`,
    "This is less accurate than your own portfolio snapshot history.",
  ];

  if (portfolioReturns.length < 20) {
    noteParts.push("VaR needs at least 20 return points in the selected window.");
  }

  if (failedTickers.length > 0) {
    noteParts.push(`Missing history for: ${failedTickers.join(", ")}` + ".");
  }

  return {
    source: "yahoo_estimate",
    lessAccurateThanSnapshots: true,
    note: noteParts.join(" "),
    riskWindow,
    pointsTarget: windowSettings.maxPoints,
    pointsUsed,
    returnsCount: portfolioReturns.length,
    usedTickers,
    failedTickers,
    volatilityAnnualPct,
    maxDrawdownPct,
    var95Pct,
    var95Amount,
  };
}

export function clearPortfolioData(userId: string): PortfolioState {
  const db = getDb();
  const scopedPattern = userLikePattern(userId);

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM holdings WHERE id LIKE ?").run(scopedPattern);
    db.prepare("DELETE FROM snapshots WHERE date LIKE ?").run(scopedPattern);
    db.prepare("DELETE FROM meta WHERE key LIKE ?").run(scopedPattern);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    holdings: [],
    snapshots: [],
    updatedAt: "",
    lastPriceRefreshAt: "",
  };
}

export function createAuthUser(
  email: string,
  passwordHash: string,
  displayName: string,
  termsAcceptedAt: string,
): AuthPublicUser {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const normalizedEmail = normalizeEmail(email);
  const acceptedAt = sanitizeString(termsAcceptedAt, nowIso);

  const row = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    display_name: sanitizeString(displayName, normalizedEmail.split("@")[0] || "User"),
    password_hash: passwordHash,
    created_at: nowIso,
    terms_accepted_at: acceptedAt,
  };

  db.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, created_at, terms_accepted_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.email, row.display_name, row.password_hash, row.created_at, row.terms_accepted_at);

  return toPublicUser(row as UserRow);
}

export function findAuthUserByEmail(email: string): AuthUserWithPassword | null {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);

  const row = db
    .prepare(`
      SELECT id, email, display_name, password_hash, created_at
      FROM users
      WHERE email = ?
    `)
    .get(normalizedEmail) as UserRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    passwordHash: row.password_hash,
  };
}

export function createAuthSession(userId: string, tokenHash: string, expiresAt: string): void {
  const db = getDb();
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(token_hash) DO UPDATE SET
      user_id = excluded.user_id,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at
  `).run(tokenHash, userId, expiresAt, nowIso);
}

export function deleteAuthSession(tokenHash: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function clearExpiredAuthSessions(): void {
  const db = getDb();
  const nowIso = new Date().toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso);
}

export function findAuthSessionUserByTokenHash(tokenHash: string): AuthSessionUser | null {
  clearExpiredAuthSessions();

  const db = getDb();
  const nowIso = new Date().toISOString();

  const row = db
    .prepare(`
      SELECT s.user_id, s.expires_at, u.email, u.display_name, u.created_at
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at >= ?
      LIMIT 1
    `)
    .get(tokenHash, nowIso) as SessionUserRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    sessionExpiresAt: row.expires_at,
  };
}

function ensurePasswordResetSchema(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS password_resets (" +
      "token_hash TEXT PRIMARY KEY," +
      "user_id TEXT NOT NULL," +
      "expires_at TEXT NOT NULL," +
      "used_at TEXT," +
      "created_at TEXT NOT NULL," +
      "FOREIGN KEY(user_id) REFERENCES users(id)" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets (user_id);" +
    "CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets (expires_at);"
  );
}

export function deleteAuthSessionsByUserId(userId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function createPasswordResetRecord(userId: string, tokenHash: string, expiresAt: string): void {
  const db = getDb();
  ensurePasswordResetSchema(db);
  const nowIso = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM password_resets WHERE user_id = ? OR expires_at < ? OR used_at IS NOT NULL").run(userId, nowIso);
    db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)").run(
      tokenHash,
      userId,
      expiresAt,
      nowIso,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function consumePasswordResetRecord(tokenHash: string): { userId: string } | null {
  const db = getDb();
  ensurePasswordResetSchema(db);
  const nowIso = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");

  try {
    const row = db
      .prepare("SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ? LIMIT 1")
      .get(tokenHash) as { user_id: string; expires_at: string; used_at: string | null } | undefined;

    if (!row || row.used_at != null || row.expires_at < nowIso) {
      db.exec("COMMIT");
      return null;
    }

    db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(nowIso, tokenHash);
    db.exec("COMMIT");
    return { userId: row.user_id };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateAuthUserPasswordHash(userId: string, passwordHash: string): void {
  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

interface BillingSubscriptionPatchInput {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
}

export interface BillingSubscriptionUpsertInput extends BillingSubscriptionPatchInput {
  userId: string;
}

function toOptionalNullableString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBillingSubscription(row: BillingSubscriptionRow): BillingSubscription {
  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    status: row.stripe_status,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function readBillingSubscription(userId: string): BillingSubscription | null {
  const db = getDb();

  const row = db
    .prepare(`
      SELECT user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, created_at, updated_at
      FROM billing_subscriptions
      WHERE user_id = ?
      LIMIT 1
    `)
    .get(userId) as BillingSubscriptionRow | undefined;

  return row ? toBillingSubscription(row) : null;
}

export function upsertBillingSubscriptionForUser(input: BillingSubscriptionUpsertInput): void {
  const db = getDb();

  const userExists = db.prepare("SELECT 1 AS ok FROM users WHERE id = ? LIMIT 1").get(input.userId) as { ok: number } | undefined;
  if (!userExists) {
    return;
  }

  const existing = db
    .prepare(`
      SELECT user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, created_at, updated_at
      FROM billing_subscriptions
      WHERE user_id = ?
      LIMIT 1
    `)
    .get(input.userId) as BillingSubscriptionRow | undefined;

  const nextStripeCustomerId = toOptionalNullableString(input.stripeCustomerId);
  const nextStripeSubscriptionId = toOptionalNullableString(input.stripeSubscriptionId);
  const nextStripePriceId = toOptionalNullableString(input.stripePriceId);
  const nextStatus = toOptionalNullableString(input.status);
  const nextCurrentPeriodEnd = toOptionalNullableString(input.currentPeriodEnd);

  const nowIso = new Date().toISOString();

  const merged = {
    userId: input.userId,
    stripeCustomerId: nextStripeCustomerId !== undefined ? nextStripeCustomerId : (existing?.stripe_customer_id ?? null),
    stripeSubscriptionId: nextStripeSubscriptionId !== undefined ? nextStripeSubscriptionId : (existing?.stripe_subscription_id ?? null),
    stripePriceId: nextStripePriceId !== undefined ? nextStripePriceId : (existing?.stripe_price_id ?? null),
    status: nextStatus !== undefined ? nextStatus : (existing?.stripe_status ?? null),
    currentPeriodEnd: nextCurrentPeriodEnd !== undefined ? nextCurrentPeriodEnd : (existing?.current_period_end ?? null),
    createdAt: existing?.created_at ?? nowIso,
    updatedAt: nowIso,
  };

  db.prepare(`
    INSERT INTO billing_subscriptions (
      user_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      stripe_status,
      current_period_end,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      stripe_status = excluded.stripe_status,
      current_period_end = excluded.current_period_end,
      updated_at = excluded.updated_at
  `).run(
    merged.userId,
    merged.stripeCustomerId,
    merged.stripeSubscriptionId,
    merged.stripePriceId,
    merged.status,
    merged.currentPeriodEnd,
    merged.createdAt,
    merged.updatedAt,
  );
}

export function updateBillingSubscriptionByStripeCustomerId(stripeCustomerId: string, patch: BillingSubscriptionPatchInput): void {
  const db = getDb();
  const normalizedCustomerId = toOptionalNullableString(stripeCustomerId);

  if (!normalizedCustomerId) {
    return;
  }

  const row = db
    .prepare("SELECT user_id FROM billing_subscriptions WHERE stripe_customer_id = ? LIMIT 1")
    .get(normalizedCustomerId) as { user_id: string } | undefined;

  if (!row) {
    return;
  }

  upsertBillingSubscriptionForUser({
    userId: row.user_id,
    ...patch,
  });
}

export function updateBillingSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string, patch: BillingSubscriptionPatchInput): void {
  const db = getDb();
  const normalizedSubscriptionId = toOptionalNullableString(stripeSubscriptionId);

  if (!normalizedSubscriptionId) {
    return;
  }

  const row = db
    .prepare("SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = ? LIMIT 1")
    .get(normalizedSubscriptionId) as { user_id: string } | undefined;

  if (!row) {
    return;
  }

  upsertBillingSubscriptionForUser({
    userId: row.user_id,
    ...patch,
  });
}

export function getDatabaseFilePath(): string {
  return DB_FILE;
}
