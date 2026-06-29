import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DataSource, PortfolioHolding, PortfolioState, RiskWindow } from "@/lib/portfolio";

const DEFAULT_DB_FILE = path.join(process.cwd(), "data", "aladdin.sqlite");
const RENDER_DISK_DIR = "/var/data";

function resolveDatabaseFilePath(): string {
  const configured = (process.env.SQLITE_DB_PATH || "").trim();

  if (configured.length === 0) {
    if (fs.existsSync(RENDER_DISK_DIR)) {
      return path.join(RENDER_DISK_DIR, "aladdin.sqlite");
    }

    return DEFAULT_DB_FILE;
  }

  if (path.isAbsolute(configured)) {
    return configured;
  }

  if (fs.existsSync(RENDER_DISK_DIR)) {
    return path.join(RENDER_DISK_DIR, configured);
  }

  return path.join(process.cwd(), configured);
}

const DB_FILE = resolveDatabaseFilePath();
const DATA_DIR = path.dirname(DB_FILE);

const UPDATED_AT_KEY = "updated_at";
const LAST_PRICE_REFRESH_KEY = "last_price_refresh_at";
const DEFAULT_SNAPSHOT_RETENTION_DAYS = 730;
const MAX_SNAPSHOT_RETENTION_DAYS = 3650;

const LOCAL_USER_ID = "local-user";
const SNAPSHOT_RETENTION_DAYS = readSnapshotRetentionDays();

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
  session_open: number;
  session_date: string;
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

interface BullionHoldingRow {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  units: number;
}

interface HoldingRiskRow {
  source: string;
  ticker: string;
  value: number;
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  regularMarketOpen?: number;
  previousClose?: number;
  chartPreviousClose?: number;
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

interface AsxQuoteData {
  price: number | null;
  prevClose: number | null;
  openPrice: number | null;
}

interface DatedPricePoint {
  date: string;
  close: number;
}

interface DatedReturnPoint {
  date: string;
  value: number;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  created_at: string;
  terms_accepted_at?: string;
  email_verified_at?: string | null;
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

interface PriceDipAlertRow {
  id: string;
  user_id: string;
  ticker: string;
  drop_pct_threshold: number;
  enabled: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PreSignupBillingRow {
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  stripe_status: string | null;
  current_period_end: string | null;
  checkout_completed_at: string | null;
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
  emailVerifiedAt: string | null;
}

export interface AuthSessionUser extends AuthPublicUser {
  sessionExpiresAt: string;
  emailVerifiedAt: string | null;
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

export interface PreSignupBillingEligibility {
  email: string;
  status: string | null;
  currentPeriodEnd: string | null;
  checkoutCompletedAt: string | null;
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
  benchmarkSymbol: string;
  benchmarkName: string;
  riskWindow: RiskWindow;
  pointsTarget: number;
  pointsUsed: number;
  returnsCount: number;
  benchmarkPointsUsed: number;
  usedTickers: string[];
  failedTickers: string[];
  volatilityAnnualPct: number | null;
  maxDrawdownPct: number | null;
  var95Pct: number | null;
  var95Amount: number | null;
  cvar95Pct: number | null;
  cvar95Amount: number | null;
  betaToBenchmark: number | null;
  trackingErrorAnnualPct: number | null;
  correlationToBenchmark: number | null;
  outlierReturnsRemoved: number;
  cornishFisherVar95Pct: number | null;
  cornishFisherVar95Amount: number | null;
  rsi14: number | null;
  stochastic14: number | null;
  obvValue: number | null;
  obvTrend: string | null;
  correlationMatrix: { tickers: string[]; matrix: number[][] } | null;
  regime: { vix: number | null; label: string; cssClass: string } | null;
  factorExposure: { marketBeta: number | null; sizeBeta: number | null } | null;
  sharpeRatioAnnual: number | null;
  sortinoRatioAnnual: number | null;
  returnSkewness: number | null;
}

export interface PriceDipAlertSetting {
  id: string;
  ticker: string;
  dropPctThreshold: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PriceDipAlertUpsertInput {
  ticker: string;
  dropPctThreshold: number;
  enabled: boolean;
}

const RISK_WINDOW_SETTINGS: Record<RiskWindow, { label: string; yahooRange: string; maxPoints: number }> = {
  "1M": { label: "1M", yahooRange: "3mo", maxPoints: 21 },
  "3M": { label: "3M", yahooRange: "6mo", maxPoints: 63 },
  "1Y": { label: "1Y", yahooRange: "2y", maxPoints: 252 },
};

export function getDb(): DatabaseSync {
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
      session_open REAL NOT NULL DEFAULT 0,
      session_date TEXT NOT NULL DEFAULT '',
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
      terms_accepted_at TEXT NOT NULL DEFAULT '',
      email_verified_at TEXT
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

    CREATE TABLE IF NOT EXISTS price_dip_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      ticker TEXT NOT NULL,
      drop_pct_threshold REAL NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_triggered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      UNIQUE(user_id, ticker)
    );

    CREATE INDEX IF NOT EXISTS idx_price_dip_alerts_user_id ON price_dip_alerts (user_id);
  `);

  const hasPrevCloseColumn = db
    .prepare("SELECT 1 AS ok FROM pragma_table_info('holdings') WHERE name = 'prev_close'")
    .get() as { ok: number } | undefined;

  if (!hasPrevCloseColumn) {
    db.exec("ALTER TABLE holdings ADD COLUMN prev_close REAL NOT NULL DEFAULT 0;");
  }

  const hasSessionOpenColumn = db
    .prepare("SELECT 1 AS ok FROM pragma_table_info('holdings') WHERE name = 'session_open'")
    .get() as { ok: number } | undefined;

  if (!hasSessionOpenColumn) {
    db.exec("ALTER TABLE holdings ADD COLUMN session_open REAL NOT NULL DEFAULT 0;");
  }

  const hasSessionDateColumn = db
    .prepare("SELECT 1 AS ok FROM pragma_table_info('holdings') WHERE name = 'session_date'")
    .get() as { ok: number } | undefined;

  if (!hasSessionDateColumn) {
    db.exec("ALTER TABLE holdings ADD COLUMN session_date TEXT NOT NULL DEFAULT '';");
  }

  const hasTermsAcceptedColumn = db
    .prepare("SELECT 1 AS ok FROM pragma_table_info('users') WHERE name = 'terms_accepted_at'")
    .get() as { ok: number } | undefined;

  if (!hasTermsAcceptedColumn) {
    db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at TEXT NOT NULL DEFAULT '';");
    db.exec("UPDATE users SET terms_accepted_at = created_at WHERE terms_accepted_at = '';");
  }

  const hasEmailVerifiedAtColumn = db
    .prepare("SELECT 1 AS ok FROM pragma_table_info('users') WHERE name = 'email_verified_at'")
    .get() as { ok: number } | undefined;

  if (!hasEmailVerifiedAtColumn) {
    db.exec("ALTER TABLE users ADD COLUMN email_verified_at TEXT;");
    db.exec("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;");
  }

  // One-time migration: reset session_open to 0 so that the next price refresh writes the
  // actual market open price from Yahoo Finance (regularMarketOpen) instead of prevClose.
  const hasSessionOpenReset = db
    .prepare("SELECT value FROM meta WHERE key = 'migration_session_open_reset_v1'")
    .get() as { value: string } | undefined;

  if (!hasSessionOpenReset) {
    db.exec("UPDATE holdings SET session_open = 0;");
    db.exec("INSERT OR IGNORE INTO meta (key, value) VALUES ('migration_session_open_reset_v1', '1');");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS pre_signup_billing (
      email TEXT PRIMARY KEY,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_price_id TEXT,
      stripe_status TEXT,
      current_period_end TEXT,
      checkout_completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pre_signup_billing_customer ON pre_signup_billing (stripe_customer_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pre_signup_billing_subscription
      ON pre_signup_billing (stripe_subscription_id)
      WHERE stripe_subscription_id IS NOT NULL;
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      window_start INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, read_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_totp (
      user_id TEXT PRIMARY KEY,
      encrypted_secret TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT,
      recovery_codes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS totp_challenges (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_totp_challenges_expires_at ON totp_challenges (expires_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      call_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, month),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS trading_memory (
      id TEXT PRIMARY KEY,
      strategy TEXT NOT NULL DEFAULT '',
      lessons TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trading_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      user_message TEXT NOT NULL,
      tool_calls TEXT NOT NULL DEFAULT '[]',
      ai_response TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      equity_usd TEXT,
      cash_usd TEXT,
      outcome_note TEXT NOT NULL DEFAULT ''
    );
  `);

}

function normalizeSource(value: unknown): DataSource {
  if (value === "super") {
    return "super";
  }

  if (value === "savings") {
    return "savings";
  }

  if (value === "tax") {
    return "tax";
  }

  if (value === "gold") {
    return "gold";
  }

  if (value === "index") {
    return "index";
  }

  if (value === "fund") {
    return "fund";
  }

  if (value === "crypto") {
    return "crypto";
  }

  if (value === "us") {
    return "us";
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

function readSnapshotRetentionDays(): number {
  const raw = String(process.env.SNAPSHOT_RETENTION_DAYS || "").trim();
  if (!raw) {
    return DEFAULT_SNAPSHOT_RETENTION_DAYS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 30) {
    return DEFAULT_SNAPSHOT_RETENTION_DAYS;
  }

  return Math.min(MAX_SNAPSHOT_RETENTION_DAYS, parsed);
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

function pruneSnapshotsForUser(db: DatabaseSync, userId: string, retentionDays: number): number {
  if (retentionDays <= 0) {
    return 0;
  }

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const prefix = userPrefix(userId);
  const startIndex = prefix.length + 1;

  const result = db
    .prepare("DELETE FROM snapshots WHERE date LIKE ? AND substr(date, ?, 10) < ?")
    .run(userLikePattern(userId), startIndex, cutoffDate) as { changes?: number };

  return Number(result.changes || 0);
}

function sanitizeHolding(raw: PortfolioHolding, source: DataSource, index: number): PortfolioHolding | null {
  const value = sanitizeNumber(raw.value, Number.NaN);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return {
    id: sanitizeString(raw.id, `${source}-${index}-${Date.now()}`),
    source,
    account: sanitizeString(
      raw.account,
      source === "super"
        ? "Superannuation"
        : source === "savings"
          ? "Savings Account"
        : source === "tax"
          ? "Tax Records"
        : source === "gold"
          ? "ABC Bullion"
          : source === "index"
            ? "Index Holdings"
            : source === "fund"
              ? "Mutual Funds"
              : source === "crypto"
                ? "Crypto Wallet"
                : source === "us"
                  ? "Global Holdings"
                  : "Brokerage",
    ),
    ticker: sanitizeString(raw.ticker, "UNKNOWN").toUpperCase(),
    name: sanitizeString(raw.name, "Unnamed Holding"),
    units: sanitizeNumber(raw.units, 0),
    price: sanitizeNumber(raw.price, 0),
    prevClose: sanitizeNumber(raw.prevClose, sanitizeNumber(raw.price, 0)),
    value,
    costBase: sanitizeNumber(raw.costBase, value),
    sector: sanitizeString(
      raw.sector,
      source === "super"
        ? "Super"
        : source === "savings"
          ? "Savings"
        : source === "tax"
          ? "Tax"
        : source === "gold"
          ? "Precious Metals"
          : source === "index"
            ? "Index"
            : source === "fund"
              ? "Mutual Fund"
              : source === "crypto"
                ? "Crypto"
                : source === "us"
                  ? "Equity"
                  : "Equity",
    ),
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

function normalizeTicker(value: string): string {
  return sanitizeString(value, "")
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, "")
    .slice(0, 20);
}

const ASX_SYMBOL_ALIASES: Record<string, string> = {
  XJO: "^AXJO",
  AXJO: "^AXJO",
  ASX200: "^AXJO",
  AORD: "^AORD",
  ALLORDS: "^AORD",
};

function normalizeListedTicker(rawTicker: string): string {
  let clean = sanitizeString(rawTicker, "").toUpperCase();
  if (!clean) {
    return "";
  }

  clean = clean
    .replace(/^ASXCODE[:/\s-]+/, "")
    .replace(/^ASX[:/\s-]+/, "")
    .replace(/^AU[:/\s-]+/, "")
    .replace(/\s+/g, "")
    .replace(/\.AX$/, "");

  const alias = ASX_SYMBOL_ALIASES[clean];
  if (alias) {
    return alias;
  }

  if (clean.startsWith("^")) {
    return clean;
  }

  if (clean.includes("-") || clean.includes("=")) {
    return "";
  }

  if (["UNKNOWN", "CASH", "AUD", "SUPERCASH"].includes(clean)) {
    return "";
  }

  return clean.replace(/[^A-Z0-9.]/g, "");
}

function isLikelyAsxListedTicker(ticker: string): boolean {
  const normalized = normalizeListedTicker(ticker);
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("^")) {
    return true;
  }

  return /^[A-Z0-9]{2,6}$/.test(normalized);
}

function getHoldingPricingDescriptor(holding: {
  source: string;
  ticker: string;
  name?: string;
  sector?: string;
}): { mode: "live" | "daily" | "file"; label: string; refreshableTicker: string | null } {
  const source = normalizeSource(holding.source);
  const listedTicker = normalizeListedTicker(holding.ticker);
  const isListed = isLikelyAsxListedTicker(holding.ticker);

  switch (source) {
    case "asx":
      return {
        mode: isListed ? "live" : "file",
        label: isListed ? "Live" : "From uploaded report",
        refreshableTicker: isListed ? listedTicker : null,
      };
    case "us": {
      const usListed = isLikelyUsListedTicker(holding.ticker);
      return {
        mode: usListed ? "live" : "file",
        label: usListed ? "Live (USD→AUD)" : "From uploaded report",
        refreshableTicker: usListed ? listedTicker : null,
      };
    }
    case "index":
    case "fund":
    case "super":
      return {
        mode: isListed ? "live" : "daily",
        label: isListed ? "Live" : "Daily priced",
        refreshableTicker: isListed ? listedTicker : null,
      };
    case "crypto":
      return {
        mode: holding.ticker ? "live" : "file",
        label: holding.ticker ? "Live" : "From uploaded report",
        refreshableTicker: holding.ticker ? sanitizeString(holding.ticker, "").toUpperCase() : null,
      };
    case "gold":
      return {
        mode: "live",
        label: "Live",
        refreshableTicker: sanitizeString(holding.ticker, "").toUpperCase() || "XAU",
      };
    case "savings":
    case "tax":
    default:
      return {
        mode: "file",
        label: "From uploaded report",
        refreshableTicker: null,
      };
  }
}

function toSydneyDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function resetSessionMoversForUserDate(db: DatabaseSync, userId: string, sessionDate: string): number {
  // Set session_open = 0 (sentinel) on date rollover so the first price update of the new day
  // can write the actual market open price from Yahoo Finance.
  const result = db.prepare(`
    UPDATE holdings
    SET
      session_open = 0,
      session_date = ?
    WHERE id LIKE ? AND price > 0 AND COALESCE(session_date, '') <> ?
  `).run(sessionDate, userLikePattern(userId), sessionDate) as { changes?: number };

  return Number(result.changes || 0);
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
  const clean = normalizeListedTicker(ticker);
  if (clean.length === 0) {
    return clean;
  }

  if (clean.startsWith("^") || clean.includes(".")) {
    return clean;
  }

  return `${clean}.AX`;
}

function toCryptoYahooSymbol(ticker: string): string {
  const clean = ticker.trim().toUpperCase();
  if (clean.length === 0) {
    return clean;
  }

  if (clean.includes("-")) {
    return clean;
  }

  if (clean.endsWith("USD") && clean.length > 3) {
    return `${clean.slice(0, -3)}-USD`;
  }

  return `${clean}-USD`;
}

function toUsYahooSymbol(ticker: string): string {
  const clean = normalizeListedTicker(ticker);
  // US tickers are used as-is on Yahoo Finance (AAPL, TSLA, BRK.B, ^GSPC, etc.)
  return clean;
}

function isLikelyUsListedTicker(ticker: string): boolean {
  const normalized = normalizeListedTicker(ticker);
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("^")) {
    return true;
  }

  // Standard NYSE/NASDAQ format: 1–5 letters, optional class suffix (BRK.B, BF.B)
  return /^[A-Z]{1,5}(\.[A-Z]{1,3})?$/.test(normalized);
}

function detectBullionMetal(holding: { name: string; ticker: string; sector: string }): "gold" | "silver" {
  const text = `${holding.name} ${holding.ticker} ${holding.sector}`.toLowerCase();
  if (text.includes("silver") || /(^|\W)ag(\W|$)/.test(text)) {
    return "silver";
  }

  return "gold";
}

function extractAsxQuote(result: YahooChartResult | undefined): AsxQuoteData {
  const regular = sanitizeNumber(result?.meta?.regularMarketPrice, Number.NaN);
  const marketOpen = sanitizeNumber(result?.meta?.regularMarketOpen, Number.NaN);

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
    openPrice: Number.isFinite(marketOpen) && marketOpen > 0 ? marketOpen : null,
  };
}

function extractDatedCloseSeries(result: YahooChartResult | undefined): DatedPricePoint[] {
  const timestamps = result?.timestamp ?? [];
  const adjustedCloses = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const preferredSeries = adjustedCloses.length > 0 ? adjustedCloses : closes;
  const pointCount = Math.min(timestamps.length, preferredSeries.length);
  const points: DatedPricePoint[] = [];

  for (let i = 0; i < pointCount; i += 1) {
    const timestamp = Number(timestamps[i]);
    const close = sanitizeNumber(preferredSeries[i], Number.NaN);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(close) || close <= 0) {
      continue;
    }

    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    points.push({ date, close });
  }

  return points;
}

async function fetchAsxQuoteFromYahoo(ticker: string): Promise<AsxQuoteData | null> {
  const symbol = toYahooSymbol(ticker);
  return fetchYahooQuoteBySymbol(symbol);
}

async function fetchCryptoQuoteFromYahoo(ticker: string): Promise<AsxQuoteData | null> {
  const symbol = toCryptoYahooSymbol(ticker);
  if (!symbol) {
    return null;
  }

  return fetchYahooQuoteBySymbol(symbol);
}

async function fetchBullionSpotFromYahoo(metal: "gold" | "silver"): Promise<AsxQuoteData | null> {
  const commoditySymbol = metal === "gold" ? "XAUUSD=X" : "XAGUSD=X";
  const commodityQuote = await fetchYahooQuoteBySymbol(commoditySymbol);
  const audUsdQuote = await fetchYahooQuoteBySymbol("AUDUSD=X");

  const commodityPrice = sanitizeNumber(commodityQuote?.price, Number.NaN);
  const commodityPrevClose = sanitizeNumber(commodityQuote?.prevClose, commodityPrice);
  const commodityOpenPrice = sanitizeNumber(commodityQuote?.openPrice, Number.NaN);
  const audUsd = sanitizeNumber(audUsdQuote?.price, Number.NaN);
  const audUsdPrevClose = sanitizeNumber(audUsdQuote?.prevClose, audUsd);
  const audUsdOpenPrice = sanitizeNumber(audUsdQuote?.openPrice, Number.NaN);

  if (!Number.isFinite(commodityPrice) || commodityPrice <= 0 || !Number.isFinite(audUsd) || audUsd <= 0) {
    return null;
  }

  const priceAud = commodityPrice / audUsd;
  const prevCloseAud =
    Number.isFinite(commodityPrevClose) &&
    commodityPrevClose > 0 &&
    Number.isFinite(audUsdPrevClose) &&
    audUsdPrevClose > 0
      ? commodityPrevClose / audUsdPrevClose
      : priceAud;
  const openPriceAud =
    Number.isFinite(commodityOpenPrice) &&
    commodityOpenPrice > 0 &&
    Number.isFinite(audUsdOpenPrice) &&
    audUsdOpenPrice > 0
      ? commodityOpenPrice / audUsdOpenPrice
      : null;

  return {
    price: priceAud,
    prevClose: prevCloseAud,
    openPrice: openPriceAud,
  };
}

async function fetchUsQuoteFromYahoo(ticker: string): Promise<AsxQuoteData | null> {
  const symbol = toUsYahooSymbol(ticker);
  if (!symbol) {
    return null;
  }

  return fetchYahooQuoteBySymbol(symbol);
}

async function fetchUsSeriesFromYahoo(ticker: string, range: string): Promise<DatedPricePoint[] | null> {
  const symbol = toUsYahooSymbol(ticker);
  if (!symbol) {
    return null;
  }

  return fetchYahooSeriesBySymbol(symbol, range);
}

async function yahooFetchWithRetry(url: string, signal: AbortSignal): Promise<Response | null> {
  const delays = [1000, 2000];
  let attempt = 0;
  while (true) {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SPECTRE/1.0)",
        Accept: "application/json",
      },
    });
    if (response.ok) {
      return response;
    }
    // Retry on rate-limit or server errors
    if ((response.status === 429 || response.status >= 500) && attempt < delays.length) {
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      attempt++;
      continue;
    }
    return null;
  }
}

async function fetchYahooQuoteBySymbol(symbol: string): Promise<AsxQuoteData | null> {
  if (!symbol) {
    return null;
  }

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await yahooFetchWithRetry(url, controller.signal);
    if (!response) {
      return null;
    }
    const payload = (await response.json()) as YahooChartResponse;
    return extractAsxQuote(payload.chart?.result?.[0]);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYahooSeriesBySymbol(symbol: string, range: string): Promise<DatedPricePoint[] | null> {
  if (!symbol) {
    return null;
  }

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${encodeURIComponent(range)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await yahooFetchWithRetry(url, controller.signal);
    if (!response) {
      return null;
    }
    const payload = (await response.json()) as YahooChartResponse;
    const series = extractDatedCloseSeries(payload.chart?.result?.[0]);
    return series.length >= 2 ? series : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAsxSeriesFromYahoo(ticker: string, range: string): Promise<DatedPricePoint[] | null> {
  const symbol = toYahooSymbol(ticker);
  if (!symbol) {
    return null;
  }

  return fetchYahooSeriesBySymbol(symbol, range);
}

async function fetchCryptoSeriesFromYahoo(ticker: string, range: string): Promise<DatedPricePoint[] | null> {
  const symbol = toCryptoYahooSymbol(ticker);
  if (!symbol) {
    return null;
  }

  return fetchYahooSeriesBySymbol(symbol, range);
}

async function fetchAsx200SeriesFromYahoo(range: string): Promise<DatedPricePoint[] | null> {
  return fetchYahooSeriesBySymbol("^AXJO", range);
}

function calculateReturnsFromPrices(prices: DatedPricePoint[]): DatedReturnPoint[] {
  const returns: DatedReturnPoint[] = [];

  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1]?.close;
    const current = prices[i]?.close;
    const date = prices[i]?.date;

    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(current) && date) {
      returns.push({ date, value: current / prev - 1 });
    }
  }

  return returns;
}

function cleanReturnsForRisk(returns: DatedReturnPoint[]): DatedReturnPoint[] {
  const finiteReturns = returns.filter((point) => Number.isFinite(point.value));
  if (finiteReturns.length <= 2) {
    return finiteReturns;
  }

  const withoutSpikes = finiteReturns.filter((point) => Math.abs(point.value) <= 0.4);
  if (withoutSpikes.length <= 2) {
    return withoutSpikes;
  }

  if (withoutSpikes.length >= 30) {
    const winsorized = winsorize(withoutSpikes.map((point) => point.value), 0.01, 0.99);
    return withoutSpikes.map((point, index) => ({ date: point.date, value: winsorized[index] }));
  }

  return withoutSpikes;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
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
  return Math.sqrt(Math.max(0, variance));
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

  return tail.reduce((acc, value) => acc + value, 0) / tail.length;
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

function calcSkewness(values: number[]): number {
  if (values.length < 3) return 0;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const m2 = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const m3 = values.reduce((a, b) => a + (b - mean) ** 3, 0) / n;
  const sigma = Math.sqrt(m2);
  return sigma > 0 ? m3 / sigma ** 3 : 0;
}

function calcExcessKurtosis(values: number[]): number {
  if (values.length < 4) return 0;
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const m2 = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const m4 = values.reduce((a, b) => a + (b - mean) ** 4, 0) / n;
  return m2 > 0 ? m4 / m2 ** 2 - 3 : 0;
}

// Returns VaR as a positive fraction (e.g. 0.02 = 2% daily loss)
function cornishFisherVar95(returns: number[]): number | null {
  const vals = returns.filter(Number.isFinite);
  if (vals.length < 10) return null;
  const n = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sigma = stdDev(vals);
  if (sigma <= 0) return null;
  const s = calcSkewness(vals);
  const k = calcExcessKurtosis(vals);
  const z = -1.6449; // 5th percentile z-score
  // Cornish-Fisher expansion
  const zCF = z + (z ** 2 - 1) * s / 6 + (z ** 3 - 3 * z) * k / 24 - (2 * z ** 3 - 5 * z) * s ** 2 / 36;
  return -(mean + zCF * sigma);
}

function calcCorrelationMatrix(
  returnsByTicker: Map<string, Map<string, number>>,
  valueByTicker: Map<string, { value: number; label: string }>,
  selectedDates: string[],
  maxTickers = 10,
): { tickers: string[]; matrix: number[][] } | null {
  const sortedKeys = Array.from(returnsByTicker.keys())
    .sort((a, b) => (valueByTicker.get(b)?.value || 0) - (valueByTicker.get(a)?.value || 0))
    .slice(0, maxTickers);
  if (sortedKeys.length < 2) return null;
  const tickers = sortedKeys.map((k) => valueByTicker.get(k)?.label || k);
  const returnArrays = sortedKeys.map((k) => {
    const map = returnsByTicker.get(k)!;
    return selectedDates.map((d) => map.get(d) ?? 0);
  });
  const n = sortedKeys.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else {
        const cov = covariance(returnArrays[i], returnArrays[j]);
        const sigI = stdDev(returnArrays[i]);
        const sigJ = stdDev(returnArrays[j]);
        const corr = cov != null && sigI > 0 && sigJ > 0 ? Math.max(-1, Math.min(1, cov / (sigI * sigJ))) : 0;
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }
  }
  return { tickers, matrix };
}

function intersectReturnDates(returnsByTicker: Map<string, Map<string, number>>): string[] {
  let commonDates: Set<string> | null = null;

  for (const returnMap of returnsByTicker.values()) {
    const dateSet = new Set(returnMap.keys());
    if (commonDates == null) {
      commonDates = dateSet;
      continue;
    }

    commonDates = new Set(Array.from(commonDates).filter((date) => dateSet.has(date)));
  }

  if (commonDates == null) {
    return [];
  }

  return Array.from(commonDates).sort((a, b) => a.localeCompare(b));
}

function covariance(a: number[], b: number[]): number | null {
  if (a.length < 2 || b.length < 2 || a.length !== b.length) {
    return null;
  }

  const meanA = a.reduce((acc, value) => acc + value, 0) / a.length;
  const meanB = b.reduce((acc, value) => acc + value, 0) / b.length;
  let acc = 0;

  for (let i = 0; i < a.length; i += 1) {
    acc += (a[i] - meanA) * (b[i] - meanB);
  }

  return acc / (a.length - 1);
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

function buildSyntheticPriceSeriesFromReturns(returns: number[], startingValue: number): number[] {
  if (!returns.length || !Number.isFinite(startingValue) || startingValue <= 0) {
    return [];
  }

  const series: number[] = [startingValue];
  let current = startingValue;

  for (const dailyReturn of returns) {
    if (!Number.isFinite(dailyReturn)) {
      continue;
    }
    current *= 1 + dailyReturn;
    if (!Number.isFinite(current) || current <= 0) {
      continue;
    }
    series.push(current);
  }

  return series;
}

function computeRsi(values: number[], period = 14): number | null {
  const closes = values.filter(Number.isFinite);
  if (closes.length <= period) {
    return null;
  }

  const start = Math.max(1, closes.length - period);
  let gains = 0;
  let losses = 0;

  for (let i = start; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0 && avgGain === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeStochastic(values: number[], period = 14): number | null {
  const closes = values.filter(Number.isFinite);
  if (closes.length < period) {
    return null;
  }

  const window = closes.slice(-period);
  const lowest = Math.min(...window);
  const highest = Math.max(...window);
  const current = closes[closes.length - 1];

  if (!Number.isFinite(lowest) || !Number.isFinite(highest) || !Number.isFinite(current)) {
    return null;
  }

  if (highest === lowest) {
    return 50;
  }

  return Math.max(0, Math.min(100, ((current - lowest) / (highest - lowest)) * 100));
}

function computeObvProxy(values: number[]): { value: number | null; trend: string | null } {
  const closes = values.filter(Number.isFinite);
  if (closes.length < 2) {
    return { value: null, trend: null };
  }

  let obv = 0;
  const series = [0];

  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const current = closes[i];
    const flowMagnitude = Math.abs(current - prev);
    if (current > prev) obv += flowMagnitude;
    if (current < prev) obv -= flowMagnitude;
    series.push(obv);
  }

  const lookback = Math.min(5, series.length - 1);
  const trendDelta = lookback > 0 ? series[series.length - 1] - series[series.length - 1 - lookback] : 0;
  const trend =
    trendDelta > 0 ? "Rising buying pressure" : trendDelta < 0 ? "Falling buying pressure" : "Flat flow";

  return { value: obv, trend };
}

export function countUserHoldings(userId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS cnt FROM holdings WHERE id LIKE ?")
    .get(userLikePattern(userId)) as { cnt: number };
  return row?.cnt ?? 0;
}

export function readPortfolioState(userId = LOCAL_USER_ID): PortfolioState {
  const db = getDb();
  const scopedPattern = userLikePattern(userId);

  const holdingRows = db
    .prepare(`
      SELECT id, source, account, ticker, name, units, price, prev_close, session_open, session_date, value, cost_base, sector, report_date, imported_at
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
    holdings: holdingRows.map((row) => {
      const pricing = getHoldingPricingDescriptor({
        source: row.source,
        ticker: row.ticker,
        name: row.name,
        sector: row.sector,
      });

      return {
        id: unscopeValue(userId, row.id),
        source: normalizeSource(row.source),
        account: row.account,
        ticker: row.ticker,
        name: row.name,
        units: sanitizeNumber(row.units),
        price: sanitizeNumber(row.price),
        prevClose: sanitizeNumber(row.prev_close),
        sessionOpen: sanitizeNumber(row.session_open),
        value: sanitizeNumber(row.value),
        costBase: sanitizeNumber(row.cost_base),
        sector: row.sector,
        reportDate: row.report_date,
        importedAt: row.imported_at,
        pricingMode: pricing.mode,
        pricingLabel: pricing.label,
      };
    }),
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
  const normalizedSource: DataSource = normalizeSource(source);
  const scopedPattern = userLikePattern(userId);

  const cleanedHoldings = holdings
    .map((holding, index) => sanitizeHolding(holding, normalizedSource, index))
    .filter((holding): holding is PortfolioHolding => Boolean(holding));

  if (cleanedHoldings.length === 0) {
    throw new Error("No valid holdings to save.");
  }

  const nowIso = new Date().toISOString();
  const sessionDate = toSydneyDateKey(new Date(nowIso));
  const scopedSnapshotAt = scopeId(userId, nowIso);

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM holdings WHERE source = ? AND id LIKE ?").run(normalizedSource, scopedPattern);

    const insert = db.prepare(`
      INSERT INTO holdings (
        id, source, account, ticker, name, units, price, prev_close, session_open, session_date, value, cost_base, sector, report_date, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        sanitizeNumber(holding.sessionOpen, holding.price),
        sessionDate,
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

    pruneSnapshotsForUser(db, userId, SNAPSHOT_RETENTION_DAYS);

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
  const now = new Date();
  const nowIso = now.toISOString();
  const sessionDate = toSydneyDateKey(now);

  const asxLikeRows = db
    .prepare(`
      SELECT ticker, units, source, name, sector
      FROM holdings
      WHERE source IN ('asx', 'index', 'fund', 'super') AND id LIKE ?
    `)
    .all(scopedPattern) as (HoldingTickerRow & { source: string; name: string; sector: string })[];

  const cryptoRows = db
    .prepare(`
      SELECT ticker, units
      FROM holdings
      WHERE source = 'crypto' AND id LIKE ?
    `)
    .all(scopedPattern) as HoldingTickerRow[];

  const bullionRows = db
    .prepare(`
      SELECT id, ticker, name, sector, units
      FROM holdings
      WHERE source = 'gold' AND id LIKE ?
    `)
    .all(scopedPattern) as BullionHoldingRow[];

  const usRows = db
    .prepare(`
      SELECT ticker, units, source, name, sector
      FROM holdings
      WHERE source = 'us' AND id LIKE ?
    `)
    .all(scopedPattern) as (HoldingTickerRow & { source: string; name: string; sector: string })[];

  const asxLikeTickerRows = new Map<string, Array<{ source: DataSource; rawTicker: string }>>();
  for (const row of asxLikeRows) {
    const pricing = getHoldingPricingDescriptor(row);
    const ticker = pricing.refreshableTicker;
    if (pricing.mode !== "live" || !ticker) {
      continue;
    }

    if (!asxLikeTickerRows.has(ticker)) {
      asxLikeTickerRows.set(ticker, []);
    }
    asxLikeTickerRows.get(ticker)!.push({
      source: normalizeSource(row.source),
      rawTicker: row.ticker,
    });
  }
  const uniqueAsxLikeTickers = Array.from(asxLikeTickerRows.keys());

  const uniqueCryptoTickers = Array.from(
    new Set(
      cryptoRows
        .map((row) => sanitizeString(row.ticker, "").toUpperCase())
        .filter((ticker) => ticker.length > 0),
    ),
  );

  const usTickerRows = new Map<string, Array<{ rawTicker: string }>>();
  for (const row of usRows) {
    const pricing = getHoldingPricingDescriptor(row);
    const ticker = pricing.refreshableTicker;
    if (pricing.mode !== "live" || !ticker) {
      continue;
    }

    if (!usTickerRows.has(ticker)) {
      usTickerRows.set(ticker, []);
    }
    usTickerRows.get(ticker)!.push({ rawTicker: row.ticker });
  }
  const uniqueUsTickers = Array.from(usTickerRows.keys());

  if (uniqueAsxLikeTickers.length === 0 && uniqueCryptoTickers.length === 0 && bullionRows.length === 0 && uniqueUsTickers.length === 0) {
    setScopedMetaValue(db, userId, LAST_PRICE_REFRESH_KEY, nowIso);
    return {
      state: readPortfolioState(userId),
      updatedTickers: [],
      failedTickers: [],
      fetchedAt: nowIso,
    };
  }

  const quoteUpdates: Array<{ source: string; ticker: string; price: number; prevClose: number; openPrice: number }> = [];
  const bullionUpdates: Array<{ id: string; price: number; prevClose: number; openPrice: number; metal: "gold" | "silver" }> = [];
  const updatedLabels = new Set<string>();
  const failedTickers: string[] = [];

  // Sequential fetch reduces the chance of upstream rate limiting.
  for (const ticker of uniqueAsxLikeTickers) {
    let quote: AsxQuoteData | null = null;
    // Retry once on failure
    quote = await fetchAsxQuoteFromYahoo(ticker);
    if (!quote) {
      quote = await fetchAsxQuoteFromYahoo(ticker);
    }
    const price = sanitizeNumber(quote?.price, Number.NaN);
    const prevClose = sanitizeNumber(quote?.prevClose, price);
    const openPrice = sanitizeNumber(quote?.openPrice, Number.NaN);

    if (Number.isFinite(price) && price > 0) {
      const safePrevClose = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : price;
      // Push an update for each source that holds this ticker
      const rowsForTicker = asxLikeTickerRows.get(ticker) ?? [{ source: "asx" as DataSource, rawTicker: ticker }];
      for (const row of rowsForTicker) {
        quoteUpdates.push({
          source: row.source,
          ticker: row.rawTicker,
          price,
          prevClose: safePrevClose,
          openPrice: Number.isFinite(openPrice) && openPrice > 0 ? openPrice : safePrevClose,
        });
      }
      const distinctSources = Array.from(new Set(rowsForTicker.map((row) => row.source)));
      const sourceLabel = distinctSources.length > 1 ? `${ticker} (${distinctSources.join(",")})` : ticker;
      updatedLabels.add(sourceLabel);
    } else {
      failedTickers.push(ticker);
    }
  }

  for (const ticker of uniqueCryptoTickers) {
    let quote = await fetchCryptoQuoteFromYahoo(ticker);
    if (!quote) {
      quote = await fetchCryptoQuoteFromYahoo(ticker);
    }
    const price = sanitizeNumber(quote?.price, Number.NaN);
    const prevClose = sanitizeNumber(quote?.prevClose, price);
    const openPrice = sanitizeNumber(quote?.openPrice, Number.NaN);

    if (Number.isFinite(price) && price > 0) {
      const safePrevClose = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : price;
      quoteUpdates.push({
        source: "crypto",
        ticker,
        price,
        prevClose: safePrevClose,
        openPrice: Number.isFinite(openPrice) && openPrice > 0 ? openPrice : safePrevClose,
      });
      updatedLabels.add(`${ticker} (crypto)`);
    } else {
      failedTickers.push(`${ticker} (crypto)`);
    }
  }

  if (bullionRows.length > 0) {
    const goldQuote = await fetchBullionSpotFromYahoo("gold");
    const silverQuote = await fetchBullionSpotFromYahoo("silver");

    for (const row of bullionRows) {
      const metal = detectBullionMetal(row);
      const quote = metal === "gold" ? goldQuote : silverQuote;
      const price = sanitizeNumber(quote?.price, Number.NaN);
      const prevClose = sanitizeNumber(quote?.prevClose, price);
      const openPrice = sanitizeNumber(quote?.openPrice, Number.NaN);

      if (Number.isFinite(price) && price > 0) {
        const safePrevClose = Number.isFinite(prevClose) && prevClose > 0 ? prevClose : price;
        bullionUpdates.push({
          id: row.id,
          price,
          prevClose: safePrevClose,
          openPrice: Number.isFinite(openPrice) && openPrice > 0 ? openPrice : safePrevClose,
          metal,
        });
        updatedLabels.add(metal === "gold" ? "XAU (gold)" : "XAG (silver)");
      } else {
        failedTickers.push(metal === "gold" ? "XAU (gold)" : "XAG (silver)");
      }
    }
  }

  if (uniqueUsTickers.length > 0) {
    // Fetch AUD/USD once and reuse for all US stock conversions
    const audUsdQuote = await fetchYahooQuoteBySymbol("AUDUSD=X");
    const audUsdRate = sanitizeNumber(audUsdQuote?.price, Number.NaN);
    const audUsdPrevRate = sanitizeNumber(audUsdQuote?.prevClose, audUsdRate);
    const audUsdOpenRate = sanitizeNumber(audUsdQuote?.openPrice, audUsdPrevRate);

    if (!Number.isFinite(audUsdRate) || audUsdRate <= 0) {
      for (const ticker of uniqueUsTickers) {
        failedTickers.push(`${ticker} (us)`);
      }
    } else {
      for (const ticker of uniqueUsTickers) {
        let quote = await fetchUsQuoteFromYahoo(ticker);
        if (!quote) {
          quote = await fetchUsQuoteFromYahoo(ticker);
        }
        const usdPrice = sanitizeNumber(quote?.price, Number.NaN);
        const usdPrevClose = sanitizeNumber(quote?.prevClose, usdPrice);
        const usdOpenPrice = sanitizeNumber(quote?.openPrice, Number.NaN);

        if (Number.isFinite(usdPrice) && usdPrice > 0) {
          const audPrice = usdPrice / audUsdRate;
          const prevRate = Number.isFinite(audUsdPrevRate) && audUsdPrevRate > 0 ? audUsdPrevRate : audUsdRate;
          const audPrevClose = Number.isFinite(usdPrevClose) && usdPrevClose > 0 ? usdPrevClose / prevRate : audPrice;
          const openRate = Number.isFinite(audUsdOpenRate) && audUsdOpenRate > 0 ? audUsdOpenRate : prevRate;
          const audOpenPrice = Number.isFinite(usdOpenPrice) && usdOpenPrice > 0 ? usdOpenPrice / openRate : audPrevClose;

          const rowsForTicker = usTickerRows.get(ticker) ?? [{ rawTicker: ticker }];
          for (const row of rowsForTicker) {
            quoteUpdates.push({
              source: "us",
              ticker: row.rawTicker,
              price: audPrice,
              prevClose: audPrevClose,
              openPrice: audOpenPrice,
            });
          }
          updatedLabels.add(`${ticker} (us)`);
        } else {
          failedTickers.push(`${ticker} (us)`);
        }
      }
    }
  }

  if (quoteUpdates.length === 0 && bullionUpdates.length === 0) {
    db.exec("BEGIN IMMEDIATE");

    try {
      resetSessionMoversForUserDate(db, userId, sessionDate);
      setScopedMetaValue(db, userId, LAST_PRICE_REFRESH_KEY, nowIso);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return {
      state: readPortfolioState(userId),
      updatedTickers: [],
      failedTickers,
      fetchedAt: nowIso,
    };
  }

  db.exec("BEGIN IMMEDIATE");

  try {
    resetSessionMoversForUserDate(db, userId, sessionDate);

    const updateStmt = db.prepare(`
      UPDATE holdings
      SET
        prev_close = ?,
        price = ?,
        value = CASE WHEN units > 0 THEN units * ? ELSE value END,
        session_open = CASE WHEN session_open = 0 THEN ? ELSE session_open END
      WHERE source = ? AND ticker = ? AND id LIKE ?
    `);

    const bullionUpdateStmt = db.prepare(`
      UPDATE holdings
      SET
        prev_close = ?,
        price = ?,
        value = CASE WHEN units > 0 THEN units * ? ELSE value END,
        session_open = CASE WHEN session_open = 0 THEN ? ELSE session_open END
      WHERE id = ? AND source = 'gold'
    `);

    for (const quote of quoteUpdates) {
      updateStmt.run(quote.prevClose, quote.price, quote.price, quote.openPrice, quote.source, quote.ticker, scopedPattern);
    }

    for (const quote of bullionUpdates) {
      bullionUpdateStmt.run(quote.prevClose, quote.price, quote.price, quote.openPrice, quote.id);
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
    updatedTickers: Array.from(updatedLabels),
    failedTickers,
    fetchedAt: nowIso,
  };
}

/**
 * Reset session movers by setting prev_close = price for all holdings.
 * Intended to run daily at midnight Sydney time so the "Session Movers"
 * panel starts each trading day from 0% change.
 */
export function resetSessionMovers(userId: string): { resetCount: number } {
  const db = getDb();
  const sessionDate = toSydneyDateKey(new Date());

  return { resetCount: resetSessionMoversForUserDate(db, userId, sessionDate) };
}

/**
 * Reset session movers for ALL users. Used by the scheduled midnight task.
 */
export function resetAllSessionMovers(): { resetCount: number } {
  const db = getDb();
  const sessionDate = toSydneyDateKey(new Date());

  const result = db.prepare(`
    UPDATE holdings
    SET
      session_open = price,
      session_date = ?
    WHERE price > 0 AND COALESCE(session_date, '') <> ?
  `).run(sessionDate, sessionDate) as { changes?: number };

  return { resetCount: Number(result.changes || 0) };
}

export async function estimateHistoricalRiskFromYahoo(
  userId: string,
  riskWindow: RiskWindow = "3M",
): Promise<HistoricalRiskEstimateResult> {
  const db = getDb();
  const scopedPattern = userLikePattern(userId);
  const windowSettings = RISK_WINDOW_SETTINGS[riskWindow];
  const benchmarkSymbol = "^AXJO";
  const benchmarkName = "ASX 200";

  const rows = db
    .prepare(`
      SELECT source, ticker, name, sector, value
      FROM holdings
      WHERE value > 0 AND id LIKE ?
    `)
    .all(scopedPattern) as (HoldingRiskRow & { name?: string; sector?: string })[];

  const totalPortfolioValue = rows.reduce((acc, row) => acc + sanitizeNumber(row.value, 0), 0);

  if (rows.length === 0 || totalPortfolioValue <= 0) {
    return {
      source: "yahoo_estimate",
      lessAccurateThanSnapshots: true,
      note: "Estimated from Yahoo historical market performance. This is less accurate than your own portfolio snapshot history. No holdings available yet.",
      benchmarkSymbol,
      benchmarkName,
      riskWindow,
      pointsTarget: windowSettings.maxPoints,
      pointsUsed: 0,
      returnsCount: 0,
      benchmarkPointsUsed: 0,
      usedTickers: [],
      failedTickers: [],
      volatilityAnnualPct: null,
      maxDrawdownPct: null,
      var95Pct: null,
      var95Amount: null,
      cvar95Pct: null,
      cvar95Amount: null,
      betaToBenchmark: null,
      trackingErrorAnnualPct: null,
      correlationToBenchmark: null,
      outlierReturnsRemoved: 0,
      cornishFisherVar95Pct: null,
      cornishFisherVar95Amount: null,
      rsi14: null,
      stochastic14: null,
      obvValue: null,
      obvTrend: null,
      correlationMatrix: null,
      regime: null,
      factorExposure: null,
      sharpeRatioAnnual: null,
      sortinoRatioAnnual: null,
      returnSkewness: null,
    };
  }

  const valueByTicker = new Map<string, { ticker: string; source: DataSource; value: number; label: string }>();
  const nonLiveLabels = new Set<string>();
  for (const row of rows) {
    const source = normalizeSource(row.source);
    if (source === "tax" || source === "savings") {
      continue;
    }

    const pricing = getHoldingPricingDescriptor(row);
    const ticker = sanitizeString(pricing.refreshableTicker || row.ticker, "").toUpperCase();
    const value = sanitizeNumber(row.value, 0);
    if (!ticker || value <= 0) {
      continue;
    }

    if (pricing.mode !== "live") {
      nonLiveLabels.add(sanitizeString(row.ticker, sanitizeString(row.name, source)).toUpperCase());
      continue;
    }

    const key = `${source}:${ticker}`;
    const existing = valueByTicker.get(key);
    valueByTicker.set(key, {
      ticker,
      source,
      value: (existing?.value || 0) + value,
      label: source === "crypto" ? `${ticker} (crypto)` : ticker,
    });
  }

  const returnsByTicker = new Map<string, Map<string, number>>();
  const failedTickers: string[] = Array.from(nonLiveLabels);
  let outlierReturnsRemoved = 0;

  for (const [key, holding] of valueByTicker.entries()) {
    const series = holding.source === "crypto"
      ? await fetchCryptoSeriesFromYahoo(holding.ticker, windowSettings.yahooRange)
      : holding.source === "us"
        ? await fetchUsSeriesFromYahoo(holding.ticker, windowSettings.yahooRange)
        : await fetchAsxSeriesFromYahoo(holding.ticker, windowSettings.yahooRange);

    if (!series || series.length < 2) {
      failedTickers.push(holding.label);
      continue;
    }

    const rawReturns = calculateReturnsFromPrices(series);
    const returns = cleanReturnsForRisk(rawReturns);
    outlierReturnsRemoved += Math.max(0, rawReturns.length - returns.length);
    if (returns.length >= 1) {
      returnsByTicker.set(
        key,
        new Map(
          returns
            .filter((point) => point.date.length > 0 && Number.isFinite(point.value))
            .map((point) => [point.date, point.value]),
        ),
      );
    } else {
      failedTickers.push(holding.label);
    }
  }

  if (returnsByTicker.size === 0) {
    return {
      source: "yahoo_estimate",
      lessAccurateThanSnapshots: true,
      note: "Estimated from Yahoo historical market performance. This is less accurate than your own portfolio snapshot history. Could not fetch enough history for current tickers.",
      benchmarkSymbol,
      benchmarkName,
      riskWindow,
      pointsTarget: windowSettings.maxPoints,
      pointsUsed: 0,
      returnsCount: 0,
      benchmarkPointsUsed: 0,
      usedTickers: [],
      failedTickers,
      volatilityAnnualPct: null,
      maxDrawdownPct: null,
      var95Pct: null,
      var95Amount: null,
      cvar95Pct: null,
      cvar95Amount: null,
      betaToBenchmark: null,
      trackingErrorAnnualPct: null,
      correlationToBenchmark: null,
      outlierReturnsRemoved,
      cornishFisherVar95Pct: null,
      cornishFisherVar95Amount: null,
      rsi14: null,
      stochastic14: null,
      obvValue: null,
      obvTrend: null,
      correlationMatrix: null,
      regime: null,
      factorExposure: null,
      sharpeRatioAnnual: null,
      sortinoRatioAnnual: null,
      returnSkewness: null,
    };
  }

  const usedKeys = Array.from(returnsByTicker.keys());
  const usedTickers = usedKeys.map((key) => valueByTicker.get(key)?.label || key);
  const usedValueTotal = usedKeys.reduce((acc, key) => acc + (valueByTicker.get(key)?.value || 0), 0);

  const commonDates = intersectReturnDates(returnsByTicker);
  const selectedDates = commonDates.slice(-windowSettings.maxPoints);
  const pointsUsed = selectedDates.length;

  if (!Number.isFinite(pointsUsed) || pointsUsed < 2) {
    return {
      source: "yahoo_estimate",
      lessAccurateThanSnapshots: true,
      note: "Estimated from Yahoo historical market performance. This is less accurate than your own portfolio snapshot history. Not enough date-aligned return points available.",
      benchmarkSymbol,
      benchmarkName,
      riskWindow,
      pointsTarget: windowSettings.maxPoints,
      pointsUsed: 0,
      returnsCount: 0,
      benchmarkPointsUsed: 0,
      usedTickers,
      failedTickers,
      volatilityAnnualPct: null,
      maxDrawdownPct: null,
      var95Pct: null,
      var95Amount: null,
      cvar95Pct: null,
      cvar95Amount: null,
      betaToBenchmark: null,
      trackingErrorAnnualPct: null,
      correlationToBenchmark: null,
      outlierReturnsRemoved,
      cornishFisherVar95Pct: null,
      cornishFisherVar95Amount: null,
      rsi14: null,
      stochastic14: null,
      obvValue: null,
      obvTrend: null,
      correlationMatrix: null,
      regime: null,
      factorExposure: null,
      sharpeRatioAnnual: null,
      sortinoRatioAnnual: null,
      returnSkewness: null,
    };
  }

  const portfolioReturns: number[] = [];

  for (const date of selectedDates) {
    let dayReturn = 0;

    for (const key of usedKeys) {
      const tickerReturns = returnsByTicker.get(key);
      const r = tickerReturns?.get(date);
      if (r == null || !Number.isFinite(r)) {
        continue;
      }
      const weight = usedValueTotal > 0 ? (valueByTicker.get(key)?.value || 0) / usedValueTotal : 0;
      dayReturn += weight * r;
    }

    portfolioReturns.push(dayReturn);
  }

  const volatilityAnnualPct = pointsUsed >= 2 ? stdDev(portfolioReturns) * Math.sqrt(252) * 100 : null;
  const maxDrawdownPct = pointsUsed >= 2 ? calcMaxDrawdownFromReturns(portfolioReturns) * 100 : null;

  const var95Raw = portfolioReturns.length >= 20 ? percentile(portfolioReturns, 0.05) : null;
  const var95Pct = var95Raw != null ? Math.max(0, -var95Raw * 100) : null;
  const var95Amount = var95Pct != null ? (var95Pct / 100) * usedValueTotal : null;
  const cvar95Raw = portfolioReturns.length >= 20 ? expectedShortfall95(portfolioReturns) : null;
  const cvar95Pct = cvar95Raw != null ? Math.max(0, -cvar95Raw * 100) : null;
  const cvar95Amount = cvar95Pct != null ? (cvar95Pct / 100) * usedValueTotal : null;

  // Cornish-Fisher adjusted VaR
  const cfVar95Raw = cornishFisherVar95(portfolioReturns);
  const cornishFisherVar95Pct = cfVar95Raw != null ? Math.max(0, cfVar95Raw * 100) : null;
  const cornishFisherVar95Amount = cornishFisherVar95Pct != null ? (cornishFisherVar95Pct / 100) * usedValueTotal : null;
  const syntheticPortfolioCurve = buildSyntheticPriceSeriesFromReturns(portfolioReturns, usedValueTotal);
  const rsi14 = computeRsi(syntheticPortfolioCurve, 14);
  const stochastic14 = computeStochastic(syntheticPortfolioCurve, 14);
  const obvProxy = computeObvProxy(syntheticPortfolioCurve);

  // Correlation matrix (top 10 holdings by value)
  const correlationMatrix = calcCorrelationMatrix(returnsByTicker, valueByTicker, selectedDates);

  let benchmarkPointsUsed = 0;
  let betaToBenchmark: number | null = null;
  let trackingErrorAnnualPct: number | null = null;
  let correlationToBenchmark: number | null = null;

  const benchmarkSeries = await fetchAsx200SeriesFromYahoo(windowSettings.yahooRange);
  if (benchmarkSeries && benchmarkSeries.length >= 2) {
    const rawBenchmarkReturns = calculateReturnsFromPrices(benchmarkSeries);
    const cleanedBenchmarkReturns = cleanReturnsForRisk(rawBenchmarkReturns);
    const benchmarkMap = new Map(cleanedBenchmarkReturns.map((point) => [point.date, point.value]));
    const portfolioReturnByDate = new Map(selectedDates.map((date, index) => [date, portfolioReturns[index]]));
    const benchmarkAlignedDates = selectedDates.filter((date) => benchmarkMap.has(date));
    const portfolioAlignedReturns: number[] = [];
    const benchmarkAlignedReturns: number[] = [];

    for (const date of benchmarkAlignedDates) {
      const benchmarkReturn = benchmarkMap.get(date);
      const portfolioReturn = portfolioReturnByDate.get(date);

      if (
        benchmarkReturn == null ||
        portfolioReturn == null ||
        !Number.isFinite(benchmarkReturn) ||
        !Number.isFinite(portfolioReturn)
      ) {
        continue;
      }

      portfolioAlignedReturns.push(portfolioReturn);
      benchmarkAlignedReturns.push(benchmarkReturn);
    }

    benchmarkPointsUsed = portfolioAlignedReturns.length;

    if (benchmarkPointsUsed >= 2) {
      const cov = covariance(portfolioAlignedReturns, benchmarkAlignedReturns);
      const benchmarkVar = stdDev(benchmarkAlignedReturns) ** 2;
      const portfolioStd = stdDev(portfolioAlignedReturns);
      const benchmarkStd = stdDev(benchmarkAlignedReturns);
      const activeReturns = portfolioAlignedReturns.map(
        (value, index) => value - benchmarkAlignedReturns[index],
      );

      betaToBenchmark = cov != null && benchmarkVar > 0 ? cov / benchmarkVar : null;
      trackingErrorAnnualPct = activeReturns.length >= 2 ? stdDev(activeReturns) * Math.sqrt(252) * 100 : null;
      correlationToBenchmark =
        cov != null && portfolioStd > 0 && benchmarkStd > 0
          ? cov / (portfolioStd * benchmarkStd)
          : null;
    }
  }

  // Regime detection — try VIX first, fall back to annualised portfolio volatility
  let regime: { vix: number | null; label: string; cssClass: string } | null = null;
  const vixSeries = await fetchYahooSeriesBySymbol("^VIX", windowSettings.yahooRange);
  if (vixSeries && vixSeries.length > 0) {
    const latestVix = vixSeries[vixSeries.length - 1].close;
    const vixLabel = latestVix < 15 ? "Risk-On" : latestVix < 25 ? "Neutral" : "Risk-Off";
    const vixCssClass = latestVix < 15 ? "accent" : latestVix < 25 ? "purple" : "danger";
    regime = { vix: latestVix, label: vixLabel, cssClass: vixCssClass };
  } else if (volatilityAnnualPct != null) {
    // Fallback: classify using annualised portfolio vol (low <12%, high >25%)
    const volPct = volatilityAnnualPct;
    const vixLabel = volPct < 12 ? "Risk-On" : volPct < 25 ? "Neutral" : "Risk-Off";
    const vixCssClass = volPct < 12 ? "accent" : volPct < 25 ? "purple" : "danger";
    regime = { vix: null, label: vixLabel, cssClass: vixCssClass };
  }

  // Factor exposure — size factor via ASX Small Ords (^AXSO) as SMB proxy
  let sizeBeta: number | null = null;
  const smallOrdsSeries = await fetchYahooSeriesBySymbol("^AXSO", windowSettings.yahooRange);
  if (smallOrdsSeries && smallOrdsSeries.length >= 2 && benchmarkPointsUsed >= 2) {
    const rawSmallOrdsReturns = calculateReturnsFromPrices(smallOrdsSeries);
    const cleanedSmallOrdsReturns = cleanReturnsForRisk(rawSmallOrdsReturns);
    const smallOrdsMap = new Map(cleanedSmallOrdsReturns.map((p) => [p.date, p.value]));
    const benchmarkMap2 = new Map(
      cleanReturnsForRisk(calculateReturnsFromPrices(
        (await fetchAsx200SeriesFromYahoo(windowSettings.yahooRange)) || []
      )).map((p) => [p.date, p.value])
    );
    const portfolioReturnByDate2 = new Map(selectedDates.map((date, i) => [date, portfolioReturns[i]]));
    const smbDates = selectedDates.filter((d) => smallOrdsMap.has(d) && benchmarkMap2.has(d) && portfolioReturnByDate2.has(d));
    if (smbDates.length >= 10) {
      const smbReturns = smbDates.map((d) => (smallOrdsMap.get(d) || 0) - (benchmarkMap2.get(d) || 0));
      const portfolioForSmb = smbDates.map((d) => portfolioReturnByDate2.get(d) || 0);
      const smbCov = covariance(portfolioForSmb, smbReturns);
      const smbVar = stdDev(smbReturns) ** 2;
      sizeBeta = smbCov != null && smbVar > 0 ? smbCov / smbVar : null;
    }
  }
  const factorExposure = { marketBeta: betaToBenchmark, sizeBeta };

  const noteParts = [
    `Estimated from Yahoo adjusted-close history with date-aligned returns and current portfolio weights (${windowSettings.label} window).`,
    "This is less accurate than your own portfolio snapshot history.",
  ];

  if (portfolioReturns.length < 20) {
    noteParts.push("VaR needs at least 20 return points in the selected window.");
  }

  if (failedTickers.length > 0) {
    noteParts.push(`Missing history for: ${failedTickers.join(", ")}` + ".");
  }

  if (outlierReturnsRemoved > 0) {
    noteParts.push(`Filtered ${outlierReturnsRemoved} extreme daily return outlier(s).`);
  }

  if (benchmarkPointsUsed < 2) {
    noteParts.push("Not enough benchmark overlap to estimate beta/tracking error.");
  }

  return {
    source: "yahoo_estimate",
    lessAccurateThanSnapshots: true,
    note: noteParts.join(" "),
    benchmarkSymbol,
    benchmarkName,
    riskWindow,
    pointsTarget: windowSettings.maxPoints,
    pointsUsed,
    returnsCount: portfolioReturns.length,
    benchmarkPointsUsed,
    usedTickers,
    failedTickers,
    volatilityAnnualPct,
    maxDrawdownPct,
    var95Pct,
    var95Amount,
    cvar95Pct,
    cvar95Amount,
    betaToBenchmark,
    trackingErrorAnnualPct,
    correlationToBenchmark,
    outlierReturnsRemoved,
    cornishFisherVar95Pct,
    cornishFisherVar95Amount,
    rsi14,
    stochastic14,
    obvValue: obvProxy.value,
    obvTrend: obvProxy.trend,
    correlationMatrix,
    regime,
    factorExposure,
    sharpeRatioAnnual: null,
    sortinoRatioAnnual: null,
    returnSkewness: null,
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
    db.prepare("DELETE FROM price_dip_alerts WHERE user_id = ?").run(userId);
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
    email_verified_at: null,
  };

  db.prepare(`
    INSERT INTO users (id, email, display_name, password_hash, created_at, terms_accepted_at, email_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.email, row.display_name, row.password_hash, row.created_at, row.terms_accepted_at, row.email_verified_at);

  return toPublicUser(row as UserRow);
}

export function findAuthUserById(userId: string): AuthPublicUser | null {
  const db = getDb();

  const row = db
    .prepare("SELECT id, email, display_name, password_hash, created_at FROM users WHERE id = ? LIMIT 1")
    .get(userId) as UserRow | undefined;

  if (!row) {
    return null;
  }

  return toPublicUser(row);
}

export function findAuthUserByEmail(email: string): AuthUserWithPassword | null {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);

  const row = db
    .prepare(`
      SELECT id, email, display_name, password_hash, created_at, email_verified_at
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
    emailVerifiedAt: row.email_verified_at ?? null,
  };
}

export function listAllUsers(): { id: string; email: string; displayName: string; createdAt: string; emailVerifiedAt: string | null }[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, email, display_name, created_at, email_verified_at FROM users ORDER BY created_at DESC",
    )
    .all() as { id: string; email: string; display_name: string; created_at: string; email_verified_at: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    createdAt: r.created_at,
    emailVerifiedAt: r.email_verified_at ?? null,
  }));
}

export function listUsersWithEnabledDipAlerts(): AuthPublicUser[] {
  const db = getDb();

  const rows = db
    .prepare(`
      SELECT DISTINCT u.id, u.email, u.display_name, u.created_at
      FROM users u
      INNER JOIN price_dip_alerts a ON a.user_id = u.id
      WHERE a.enabled = 1
      ORDER BY u.created_at ASC
    `)
    .all() as UserRow[];

  return rows.map(toPublicUser);
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
      SELECT s.user_id, s.expires_at, u.email, u.display_name, u.created_at, u.email_verified_at
      FROM sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at >= ?
      LIMIT 1
    `)
    .get(tokenHash, nowIso) as (SessionUserRow & { email_verified_at: string | null }) | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    sessionExpiresAt: row.expires_at,
    emailVerifiedAt: row.email_verified_at ?? null,
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

function ensureEmailVerificationSchema(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS email_verifications (" +
      "token_hash TEXT PRIMARY KEY," +
      "user_id TEXT NOT NULL," +
      "expires_at TEXT NOT NULL," +
      "used_at TEXT," +
      "created_at TEXT NOT NULL," +
      "FOREIGN KEY(user_id) REFERENCES users(id)" +
    ");" +
    "CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications (user_id);" +
    "CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON email_verifications (expires_at);"
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

export function createEmailVerificationRecord(userId: string, tokenHash: string, expiresAt: string): void {
  const db = getDb();
  ensureEmailVerificationSchema(db);
  const nowIso = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM email_verifications WHERE user_id = ? OR expires_at < ? OR used_at IS NOT NULL").run(userId, nowIso);
    db.prepare("INSERT INTO email_verifications (token_hash, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)").run(
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

export function hasActiveEmailVerificationForUser(userId: string): boolean {
  const db = getDb();
  ensureEmailVerificationSchema(db);
  const nowIso = new Date().toISOString();

  const row = db
    .prepare(
      "SELECT 1 AS ok FROM email_verifications WHERE user_id = ? AND used_at IS NULL AND expires_at >= ? LIMIT 1",
    )
    .get(userId, nowIso) as { ok: number } | undefined;

  return Boolean(row?.ok);
}

export function consumeEmailVerificationRecord(tokenHash: string): { userId: string } | null {
  const db = getDb();
  ensureEmailVerificationSchema(db);
  const nowIso = new Date().toISOString();

  db.exec("BEGIN IMMEDIATE");

  try {
    const row = db
      .prepare("SELECT user_id, expires_at, used_at FROM email_verifications WHERE token_hash = ? LIMIT 1")
      .get(tokenHash) as { user_id: string; expires_at: string; used_at: string | null } | undefined;

    if (!row || row.used_at != null || row.expires_at < nowIso) {
      db.exec("COMMIT");
      return null;
    }

    db.prepare("UPDATE email_verifications SET used_at = ? WHERE token_hash = ? AND used_at IS NULL").run(nowIso, tokenHash);
    db.prepare("UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?").run(nowIso, row.user_id);
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

interface PreSignupBillingPatchInput {
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  checkoutCompletedAt?: string | null;
}

export interface BillingSubscriptionUpsertInput extends BillingSubscriptionPatchInput {
  userId: string;
}

export interface PreSignupBillingUpsertInput extends PreSignupBillingPatchInput {
  email: string;
}

export type PlanTier = "none" | "free" | "plus" | "pro";

export interface UserEntitlements {
  planTier: PlanTier;
  proEnabled: boolean;
  subscriptionStatus: string | null;
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

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

function toPreSignupBillingEligibility(row: PreSignupBillingRow): PreSignupBillingEligibility {
  return {
    email: row.email,
    status: row.stripe_status,
    currentPeriodEnd: row.current_period_end,
    checkoutCompletedAt: row.checkout_completed_at,
    updatedAt: row.updated_at,
  };
}

export function readBillingSubscription(userId: string): BillingSubscription | null {
  const db = getDb();

  const row = db
    .prepare(
      "SELECT user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, created_at, updated_at " +
        "FROM billing_subscriptions WHERE user_id = ? LIMIT 1",
    )
    .get(userId) as BillingSubscriptionRow | undefined;

  return row ? toBillingSubscription(row) : null;
}

export function findUserIdByStripeCustomerId(stripeCustomerId: string): string | null {
  const db = getDb();
  const normalizedCustomerId = toOptionalNullableString(stripeCustomerId);
  if (!normalizedCustomerId) {
    return null;
  }

  const row = db
    .prepare("SELECT user_id FROM billing_subscriptions WHERE stripe_customer_id = ? LIMIT 1")
    .get(normalizedCustomerId) as { user_id: string } | undefined;

  return row?.user_id || null;
}

export function findUserIdByStripeSubscriptionId(stripeSubscriptionId: string): string | null {
  const db = getDb();
  const normalizedSubscriptionId = toOptionalNullableString(stripeSubscriptionId);
  if (!normalizedSubscriptionId) {
    return null;
  }

  const row = db
    .prepare("SELECT user_id FROM billing_subscriptions WHERE stripe_subscription_id = ? LIMIT 1")
    .get(normalizedSubscriptionId) as { user_id: string } | undefined;

  return row?.user_id || null;
}

export function deleteUserAccountData(userId: string): boolean {
  const db = getDb();
  const scopedPattern = userLikePattern(userId);

  ensurePasswordResetSchema(db);
  ensureEmailVerificationSchema(db);

  const user = db.prepare("SELECT email FROM users WHERE id = ? LIMIT 1").get(userId) as { email: string } | undefined;
  if (!user) {
    return false;
  }

  const normalizedEmail = normalizeEmail(user.email);

  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM holdings WHERE id LIKE ?").run(scopedPattern);
    db.prepare("DELETE FROM snapshots WHERE date LIKE ?").run(scopedPattern);
    db.prepare("DELETE FROM meta WHERE key LIKE ?").run(scopedPattern);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM email_verifications WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM price_dip_alerts WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM billing_subscriptions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM pre_signup_billing WHERE email = ?").run(normalizedEmail);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function hasActiveSubscription(record: { status: string | null; currentPeriodEnd: string | null }): boolean {
  const status = (record.status || "").toLowerCase();
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    return false;
  }

  if (record.currentPeriodEnd) {
    const periodEnd = new Date(record.currentPeriodEnd);
    if (!Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() < Date.now()) {
      return false;
    }
  }

  return true;
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseEmailList(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((item) => normalizeEmail(item))
      .filter((item) => item.length > 0),
  );
}

function readUserEmailById(userId: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT email FROM users WHERE id = ? LIMIT 1").get(userId) as { email: string } | undefined;
  return row?.email ? normalizeEmail(row.email) : null;
}

function toPriceDipAlertSetting(row: PriceDipAlertRow): PriceDipAlertSetting {
  return {
    id: row.id,
    ticker: row.ticker,
    dropPctThreshold: sanitizeNumber(row.drop_pct_threshold, 0),
    enabled: sanitizeNumber(row.enabled, 0) === 1,
    lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function readPriceDipAlerts(userId: string): PriceDipAlertSetting[] {
  const db = getDb();

  const rows = db
    .prepare(`
      SELECT id, user_id, ticker, drop_pct_threshold, enabled, last_triggered_at, created_at, updated_at
      FROM price_dip_alerts
      WHERE user_id = ?
      ORDER BY ticker ASC
    `)
    .all(userId) as PriceDipAlertRow[];

  return rows.map(toPriceDipAlertSetting);
}

export function upsertPriceDipAlert(userId: string, input: PriceDipAlertUpsertInput): PriceDipAlertSetting {
  const db = getDb();
  const ticker = normalizeTicker(input.ticker);

  if (!ticker) {
    throw new Error("Ticker is required.");
  }

  const threshold = clampNumber(sanitizeNumber(input.dropPctThreshold, Number.NaN), 0.1, 90);
  if (!Number.isFinite(threshold)) {
    throw new Error("Drop threshold must be a valid number.");
  }

  const nowIso = new Date().toISOString();

  const existing = db
    .prepare(`
      SELECT id, user_id, ticker, drop_pct_threshold, enabled, last_triggered_at, created_at, updated_at
      FROM price_dip_alerts
      WHERE user_id = ? AND ticker = ?
      LIMIT 1
    `)
    .get(userId, ticker) as PriceDipAlertRow | undefined;

  const id = existing?.id ?? crypto.randomUUID();
  const createdAt = existing?.created_at ?? nowIso;

  db.prepare(`
    INSERT INTO price_dip_alerts (
      id, user_id, ticker, drop_pct_threshold, enabled, last_triggered_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, ticker) DO UPDATE SET
      drop_pct_threshold = excluded.drop_pct_threshold,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).run(
    id,
    userId,
    ticker,
    threshold,
    input.enabled ? 1 : 0,
    existing?.last_triggered_at ?? null,
    createdAt,
    nowIso,
  );

  const row = db
    .prepare(`
      SELECT id, user_id, ticker, drop_pct_threshold, enabled, last_triggered_at, created_at, updated_at
      FROM price_dip_alerts
      WHERE user_id = ? AND ticker = ?
      LIMIT 1
    `)
    .get(userId, ticker) as PriceDipAlertRow | undefined;

  if (!row) {
    throw new Error("Failed to save dip alert.");
  }

  return toPriceDipAlertSetting(row);
}

export function deletePriceDipAlert(userId: string, ticker: string): void {
  const db = getDb();
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) {
    return;
  }

  db.prepare("DELETE FROM price_dip_alerts WHERE user_id = ? AND ticker = ?").run(userId, normalizedTicker);
}

export function markPriceDipAlertTriggered(userId: string, ticker: string, triggeredAtIso: string): void {
  const db = getDb();
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) {
    return;
  }

  db.prepare(`
    UPDATE price_dip_alerts
    SET last_triggered_at = ?, updated_at = ?
    WHERE user_id = ? AND ticker = ?
  `).run(triggeredAtIso, new Date().toISOString(), userId, normalizedTicker);
}

export function readUserEntitlements(userId: string): UserEntitlements {
  const subscription = readBillingSubscription(userId);
  const userEmail = readUserEmailById(userId);
  const proAccessEmails = parseEmailList(process.env.PRO_ACCESS_EMAILS);
  const isAllowlistedForPro = userEmail ? proAccessEmails.has(userEmail) : false;

  if (isAllowlistedForPro) {
    return { planTier: "pro", proEnabled: true, subscriptionStatus: subscription?.status || null };
  }

  if (!subscription || !hasActiveSubscription({ status: subscription.status, currentPeriodEnd: subscription.currentPeriodEnd })) {
    return { planTier: "none", proEnabled: false, subscriptionStatus: subscription?.status || null };
  }

  const configuredProPriceId = (process.env.STRIPE_PRO_PRICE_ID || "").trim();
  const isProByPrice = configuredProPriceId.length > 0 && subscription.stripePriceId === configuredProPriceId;
  const allowProForStarter = isTruthyEnvFlag(process.env.PRO_ANALYTICS_FOR_STARTER);

  if (isProByPrice || allowProForStarter) {
    return { planTier: "pro", proEnabled: true, subscriptionStatus: subscription.status };
  }

  return { planTier: "plus", proEnabled: false, subscriptionStatus: subscription.status };
}

export function upsertBillingSubscriptionForUser(input: BillingSubscriptionUpsertInput): void {
  const db = getDb();

  const userExists = db.prepare("SELECT 1 AS ok FROM users WHERE id = ? LIMIT 1").get(input.userId) as { ok: number } | undefined;
  if (!userExists) {
    return;
  }

  const existing = db
    .prepare(
      "SELECT user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, created_at, updated_at " +
        "FROM billing_subscriptions WHERE user_id = ? LIMIT 1",
    )
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

  db.prepare(
    "INSERT INTO billing_subscriptions (" +
      "user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, created_at, updated_at" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(user_id) DO UPDATE SET " +
      "stripe_customer_id = excluded.stripe_customer_id, " +
      "stripe_subscription_id = excluded.stripe_subscription_id, " +
      "stripe_price_id = excluded.stripe_price_id, " +
      "stripe_status = excluded.stripe_status, " +
      "current_period_end = excluded.current_period_end, " +
      "updated_at = excluded.updated_at",
  ).run(
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

export function upsertPreSignupBillingByEmail(input: PreSignupBillingUpsertInput): void {
  const db = getDb();
  const normalizedEmail = normalizeEmail(input.email);

  if (!normalizedEmail) {
    return;
  }

  const existing = db
    .prepare(
      "SELECT email, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, checkout_completed_at, created_at, updated_at " +
        "FROM pre_signup_billing WHERE email = ? LIMIT 1",
    )
    .get(normalizedEmail) as PreSignupBillingRow | undefined;

  const nextStripeCustomerId = toOptionalNullableString(input.stripeCustomerId);
  const nextStripeSubscriptionId = toOptionalNullableString(input.stripeSubscriptionId);
  const nextStripePriceId = toOptionalNullableString(input.stripePriceId);
  const nextStatus = toOptionalNullableString(input.status);
  const nextCurrentPeriodEnd = toOptionalNullableString(input.currentPeriodEnd);
  const nextCheckoutCompletedAt = toOptionalNullableString(input.checkoutCompletedAt);

  const nowIso = new Date().toISOString();

  const merged = {
    email: normalizedEmail,
    stripeCustomerId: nextStripeCustomerId !== undefined ? nextStripeCustomerId : (existing?.stripe_customer_id ?? null),
    stripeSubscriptionId: nextStripeSubscriptionId !== undefined ? nextStripeSubscriptionId : (existing?.stripe_subscription_id ?? null),
    stripePriceId: nextStripePriceId !== undefined ? nextStripePriceId : (existing?.stripe_price_id ?? null),
    status: nextStatus !== undefined ? nextStatus : (existing?.stripe_status ?? null),
    currentPeriodEnd: nextCurrentPeriodEnd !== undefined ? nextCurrentPeriodEnd : (existing?.current_period_end ?? null),
    checkoutCompletedAt: nextCheckoutCompletedAt !== undefined ? nextCheckoutCompletedAt : (existing?.checkout_completed_at ?? null),
    createdAt: existing?.created_at ?? nowIso,
    updatedAt: nowIso,
  };

  db.prepare(
    "INSERT INTO pre_signup_billing (" +
      "email, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, checkout_completed_at, created_at, updated_at" +
    ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(email) DO UPDATE SET " +
      "stripe_customer_id = excluded.stripe_customer_id, " +
      "stripe_subscription_id = excluded.stripe_subscription_id, " +
      "stripe_price_id = excluded.stripe_price_id, " +
      "stripe_status = excluded.stripe_status, " +
      "current_period_end = excluded.current_period_end, " +
      "checkout_completed_at = excluded.checkout_completed_at, " +
      "updated_at = excluded.updated_at",
  ).run(
    merged.email,
    merged.stripeCustomerId,
    merged.stripeSubscriptionId,
    merged.stripePriceId,
    merged.status,
    merged.currentPeriodEnd,
    merged.checkoutCompletedAt,
    merged.createdAt,
    merged.updatedAt,
  );
}

export function updatePreSignupBillingByStripeCustomerId(stripeCustomerId: string, patch: PreSignupBillingPatchInput): void {
  const db = getDb();
  const normalizedCustomerId = toOptionalNullableString(stripeCustomerId);

  if (!normalizedCustomerId) {
    return;
  }

  const row = db
    .prepare("SELECT email FROM pre_signup_billing WHERE stripe_customer_id = ? LIMIT 1")
    .get(normalizedCustomerId) as { email: string } | undefined;

  if (!row) {
    return;
  }

  upsertPreSignupBillingByEmail({
    email: row.email,
    ...patch,
  });
}

export function updatePreSignupBillingByStripeSubscriptionId(stripeSubscriptionId: string, patch: PreSignupBillingPatchInput): void {
  const db = getDb();
  const normalizedSubscriptionId = toOptionalNullableString(stripeSubscriptionId);

  if (!normalizedSubscriptionId) {
    return;
  }

  const row = db
    .prepare("SELECT email FROM pre_signup_billing WHERE stripe_subscription_id = ? LIMIT 1")
    .get(normalizedSubscriptionId) as { email: string } | undefined;

  if (!row) {
    return;
  }

  upsertPreSignupBillingByEmail({
    email: row.email,
    ...patch,
  });
}

export function readPreSignupBillingByEmail(email: string): PreSignupBillingEligibility | null {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return null;
  }

  const row = db
    .prepare(
      "SELECT email, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, checkout_completed_at, created_at, updated_at " +
        "FROM pre_signup_billing WHERE email = ? LIMIT 1",
    )
    .get(normalizedEmail) as PreSignupBillingRow | undefined;

  return row ? toPreSignupBillingEligibility(row) : null;
}

export function hasActivePreSignupBillingByEmail(email: string): boolean {
  const record = readPreSignupBillingByEmail(email);
  if (!record) {
    return false;
  }

  const status = (record.status || "").toLowerCase();
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    return false;
  }

  if (record.currentPeriodEnd) {
    const periodEnd = new Date(record.currentPeriodEnd);
    if (!Number.isNaN(periodEnd.getTime()) && periodEnd.getTime() < Date.now()) {
      return false;
    }
  }

  return true;
}

export function linkPreSignupBillingToUser(userId: string, email: string): void {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return;
  }

  const row = db
    .prepare(
      "SELECT email, stripe_customer_id, stripe_subscription_id, stripe_price_id, stripe_status, current_period_end, checkout_completed_at, created_at, updated_at " +
        "FROM pre_signup_billing WHERE email = ? LIMIT 1",
    )
    .get(normalizedEmail) as PreSignupBillingRow | undefined;

  if (!row) {
    return;
  }

  upsertBillingSubscriptionForUser({
    userId,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    status: row.stripe_status,
    currentPeriodEnd: row.current_period_end,
  });
}

export function getDatabaseFilePath(): string {
  return DB_FILE;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }

  return Math.min(max, Math.max(min, value));
}

/* ── Notifications ────────────────────────────────────────────────── */

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function createNotification(userId: string, type: string, title: string, body: string): Notification {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  db.prepare(
    "INSERT INTO notifications (id, user_id, type, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, userId, type, title, body, createdAt);

  return { id, userId, type, title, body, readAt: null, createdAt };
}

export function readNotifications(userId: string, limit?: number): Notification[] {
  const db = getDb();
  const effectiveLimit = typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? limit : 50;

  const rows = db
    .prepare(
      "SELECT id, user_id, type, title, body, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(userId, effectiveLimit) as NotificationRow[];

  return rows.map(toNotification);
}

export function markNotificationRead(userId: string, notificationId: string): void {
  const db = getDb();
  const readAt = new Date().toISOString();

  db.prepare(
    "UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?",
  ).run(readAt, notificationId, userId);
}

export function countUnreadNotifications(userId: string): number {
  const db = getDb();

  const row = db
    .prepare("SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .get(userId) as { cnt: number } | undefined;

  return row?.cnt ?? 0;
}

/* ------------------------------------------------------------------ */
/*  TOTP / Two-Factor Authentication                                   */
/* ------------------------------------------------------------------ */

interface TotpRow {
  user_id: string;
  encrypted_secret: string;
  enabled: number;
  verified_at: string | null;
  recovery_codes: string | null;
  created_at: string;
}

export interface TotpRecord {
  userId: string;
  encryptedSecret: string;
  enabled: boolean;
  verifiedAt: string | null;
  recoveryCodes: string | null;
  createdAt: string;
}

function toTotpRecord(row: TotpRow): TotpRecord {
  return {
    userId: row.user_id,
    encryptedSecret: row.encrypted_secret,
    enabled: row.enabled === 1,
    verifiedAt: row.verified_at ?? null,
    recoveryCodes: row.recovery_codes ?? null,
    createdAt: row.created_at,
  };
}

export function saveTotpSecret(userId: string, encryptedSecret: string): void {
  const db = getDb();
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO user_totp (user_id, encrypted_secret, enabled, verified_at, recovery_codes, created_at)
    VALUES (?, ?, 0, NULL, NULL, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_secret = excluded.encrypted_secret,
      enabled = 0,
      verified_at = NULL,
      recovery_codes = NULL,
      created_at = excluded.created_at
  `).run(userId, encryptedSecret, nowIso);
}

export function getTotpRecord(userId: string): TotpRecord | null {
  const db = getDb();

  const row = db
    .prepare("SELECT user_id, encrypted_secret, enabled, verified_at, recovery_codes, created_at FROM user_totp WHERE user_id = ?")
    .get(userId) as TotpRow | undefined;

  if (!row) {
    return null;
  }

  return toTotpRecord(row);
}

export function enableTotp(userId: string): void {
  const db = getDb();
  const nowIso = new Date().toISOString();

  db.prepare("UPDATE user_totp SET enabled = 1, verified_at = ? WHERE user_id = ?").run(nowIso, userId);
}

export function disableTotp(userId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM user_totp WHERE user_id = ?").run(userId);
}

export function saveRecoveryCodes(userId: string, hashedCodes: string): void {
  const db = getDb();
  db.prepare("UPDATE user_totp SET recovery_codes = ? WHERE user_id = ?").run(hashedCodes, userId);
}

export function isUserTotpEnabled(userId: string): boolean {
  const db = getDb();

  const row = db
    .prepare("SELECT enabled FROM user_totp WHERE user_id = ?")
    .get(userId) as { enabled: number } | undefined;

  return row?.enabled === 1;
}

/* ------------------------------------------------------------------ */
/*  TOTP Challenge Tokens                                              */
/* ------------------------------------------------------------------ */

const TOTP_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function createTotpChallenge(userId: string): string {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TOTP_CHALLENGE_TTL_MS).toISOString();
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // Clean up expired challenges
  db.prepare("DELETE FROM totp_challenges WHERE expires_at < ?").run(nowIso);

  db.prepare(`
    INSERT INTO totp_challenges (token_hash, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(tokenHash, userId, expiresAt, nowIso);

  return token;
}

export function consumeTotpChallenge(tokenRaw: string): { userId: string } | null {
  const db = getDb();
  const nowIso = new Date().toISOString();
  const tokenHash = crypto.createHash("sha256").update(tokenRaw).digest("hex");

  db.exec("BEGIN IMMEDIATE");

  try {
    const row = db
      .prepare("SELECT user_id, expires_at FROM totp_challenges WHERE token_hash = ? LIMIT 1")
      .get(tokenHash) as { user_id: string; expires_at: string } | undefined;

    if (!row || row.expires_at < nowIso) {
      if (row) {
        db.prepare("DELETE FROM totp_challenges WHERE token_hash = ?").run(tokenHash);
      }
      db.exec("COMMIT");
      return null;
    }

    db.prepare("DELETE FROM totp_challenges WHERE token_hash = ?").run(tokenHash);
    db.exec("COMMIT");

    return { userId: row.user_id };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}


// ── AI usage tracking ──────────────────────────────────────────────────────────

function currentYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getAiUsageThisMonth(userId: string): number {
  const db = getDb();
  const row = db
    .prepare("SELECT call_count FROM ai_usage WHERE user_id = ? AND month = ? LIMIT 1")
    .get(userId, currentYearMonth()) as { call_count: number } | undefined;
  return row?.call_count ?? 0;
}

export function incrementAiUsage(userId: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO ai_usage (user_id, month, call_count) VALUES (?, ?, 1) " +
      "ON CONFLICT(user_id, month) DO UPDATE SET call_count = call_count + 1",
  ).run(userId, currentYearMonth());
}

export interface AiConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export function reserveAiUsageIfAvailable(userId: string, monthlyLimit: number): { allowed: boolean; used: number } {
  const db = getDb();
  const month = currentYearMonth();
  if (monthlyLimit === -1) {
    return { allowed: true, used: getAiUsageThisMonth(userId) };
  }
  db.prepare(
    "INSERT INTO ai_usage (user_id, month, call_count) VALUES (?, ?, 1) " +
      "ON CONFLICT(user_id, month) DO UPDATE SET call_count = call_count + 1",
  ).run(userId, month);
  const used = getAiUsageThisMonth(userId);
  if (used > monthlyLimit) {
    db.prepare(
      "UPDATE ai_usage SET call_count = call_count - 1 WHERE user_id = ? AND month = ?",
    ).run(userId, month);
    return { allowed: false, used: used - 1 };
  }
  return { allowed: true, used };
}

export function releaseReservedAiUsage(userId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE ai_usage SET call_count = MAX(0, call_count - 1) WHERE user_id = ? AND month = ?",
  ).run(userId, currentYearMonth());
}

function ensureAiConversationSchema(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS ai_conversation_messages (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "user_id TEXT NOT NULL," +
      "conversation_id TEXT NOT NULL," +
      "role TEXT NOT NULL," +
      "content TEXT NOT NULL," +
      "created_at TEXT NOT NULL" +
    ")",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_ai_conv_user_conv ON ai_conversation_messages (user_id, conversation_id, id)");
}

export function getAiConversation(userId: string, conversationId: string, limit: number): AiConversationMessage[] {
  const db = getDb();
  ensureAiConversationSchema(db);
  const rows = db
    .prepare(
      "SELECT role, content FROM ai_conversation_messages " +
        "WHERE user_id = ? AND conversation_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(userId, conversationId, limit) as { role: string; content: string }[];
  return rows.reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

export function appendAiMessage(userId: string, conversationId: string, role: "user" | "assistant", content: string): void {
  const db = getDb();
  ensureAiConversationSchema(db);
  db.prepare(
    "INSERT INTO ai_conversation_messages (user_id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(userId, conversationId, role, content, new Date().toISOString());
}

export function hasProcessedWebhookEvent(eventId: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 AS ok FROM processed_webhook_events WHERE event_id = ? LIMIT 1")
    .get(eventId) as { ok: number } | undefined;
  return row !== undefined;
}

export function markWebhookEventProcessed(eventId: string, eventType: string): void {
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO processed_webhook_events (event_id, event_type, processed_at) VALUES (?, ?, ?)",
  ).run(eventId, eventType, new Date().toISOString());
}

export function findUserByStripeCustomerId(stripeCustomerId: string): AuthUserWithPassword | null {
  const db = getDb();
  const normalized = (stripeCustomerId || "").trim();
  if (!normalized) {
    return null;
  }

  const row = db
    .prepare(
      "SELECT u.id, u.email, u.display_name, u.password_hash, u.created_at, u.email_verified_at " +
      "FROM billing_subscriptions bs " +
      "JOIN users u ON u.id = bs.user_id " +
      "WHERE bs.stripe_customer_id = ? LIMIT 1",
    )
    .get(normalized) as (UserRow & { email_verified_at: string | null }) | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    passwordHash: row.password_hash,
    emailVerifiedAt: row.email_verified_at ?? null,
  };
}

export function runInDbTransaction(fn: () => void): void {
  const db = getDb();
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

interface TradingMemoryRow {
  strategy: string;
  lessons: string;
  updated_at: string;
}

export interface TradingMemory {
  strategy: string;
  lessons: string[];
  updatedAt: string;
}

export function readTradingMemory(): TradingMemory | null {
  const db = getDb();
  const row = db.prepare("SELECT strategy, lessons, updated_at FROM trading_memory WHERE id = 'myrmidon'").get() as TradingMemoryRow | undefined;
  if (!row) return null;
  let lessons: string[] = [];
  try { lessons = JSON.parse(row.lessons) as string[]; } catch { lessons = []; }
  return { strategy: row.strategy, lessons, updatedAt: row.updated_at };
}

export function writeTradingMemory(strategy: string, lessons: string[]): void {
  const db = getDb();
  const updatedAt = new Date().toISOString();
  const lessonsJson = JSON.stringify(lessons.slice(-20));
  db.prepare(
    "INSERT INTO trading_memory (id, strategy, lessons, updated_at) VALUES ('myrmidon', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET strategy=excluded.strategy, lessons=excluded.lessons, updated_at=excluded.updated_at"
  ).run(strategy, lessonsJson, updatedAt);
}

export interface TradingDecision {
  id: number;
  created_at: string;
  user_message: string;
  tool_calls: string;
  ai_response: string;
  model: string;
  equity_usd: string | null;
  cash_usd: string | null;
  outcome_note: string;
}

export function insertTradingDecision(d: {
  user_message: string;
  tool_calls: Array<{ name: string; input: Record<string, unknown>; output_preview: string }>;
  ai_response: string;
  model: string;
  equity_usd?: string | null;
  cash_usd?: string | null;
}): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO trading_decisions (created_at, user_message, tool_calls, ai_response, model, equity_usd, cash_usd) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    new Date().toISOString(),
    d.user_message.slice(0, 2000),
    JSON.stringify(d.tool_calls),
    d.ai_response.slice(0, 8000),
    d.model,
    d.equity_usd ?? null,
    d.cash_usd ?? null,
  );
}

export function listTradingDecisions(limit = 50): TradingDecision[] {
  const db = getDb();
  return db.prepare(
    "SELECT id, created_at, user_message, tool_calls, ai_response, model, equity_usd, cash_usd, outcome_note FROM trading_decisions ORDER BY id DESC LIMIT ?"
  ).all(limit) as TradingDecision[];
}
