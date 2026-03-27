import { getDb } from "@/lib/db";

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

/* ── In-memory fallback for development mode ── */

type RateLimitStore = Map<string, RateLimitBucket>;

declare global {
  var __spectreRateLimitStore: RateLimitStore | undefined;
}

function getStore(): RateLimitStore {
  if (!global.__spectreRateLimitStore) {
    global.__spectreRateLimitStore = new Map<string, RateLimitBucket>();
  }

  return global.__spectreRateLimitStore;
}

function consumeRateLimitInMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const store = getStore();
  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, limit - 1),
    };
  }

  existing.count += 1;
  store.set(key, existing);

  if (existing.count > limit) {
    const retryAfterMs = Math.max(0, windowMs - (now - existing.windowStart));
    return {
      allowed: false,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
      remaining: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, limit - existing.count),
  };
}

/* ── SQLite-backed implementation ── */

interface RateLimitRow {
  count: number;
  window_start: number;
}

function consumeRateLimitSqlite(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const db = getDb();

  // BEGIN IMMEDIATE acquires a write lock upfront so the read-then-write
  // is atomic — prevents two concurrent requests both seeing count=N and
  // both deciding they are allowed.
  db.exec("BEGIN IMMEDIATE");

  let result: RateLimitResult;
  try {
    const row = db
      .prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
      .get(key) as RateLimitRow | undefined;

    if (!row || now - row.window_start >= windowMs) {
      db.prepare("INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)")
        .run(key, now);
      result = { allowed: true, retryAfterSec: 0, remaining: Math.max(0, limit - 1) };
    } else {
      const newCount = row.count + 1;
      db.prepare("UPDATE rate_limits SET count = ? WHERE key = ?")
        .run(newCount, key);

      if (newCount > limit) {
        const retryAfterMs = Math.max(0, windowMs - (now - row.window_start));
        result = { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000), remaining: 0 };
      } else {
        result = { allowed: true, retryAfterSec: 0, remaining: Math.max(0, limit - newCount) };
      }
    }

    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }

  // Probabilistic cleanup: ~1% of calls (outside transaction to keep it short)
  if (Math.random() < 0.01) {
    db.prepare("DELETE FROM rate_limits WHERE window_start + ? < ?")
      .run(windowMs, now);
  }

  return result;
}

/* ── Public API ── */

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  if (process.env.NODE_ENV === "development") {
    return consumeRateLimitInMemory(key, limit, windowMs);
  }

  return consumeRateLimitSqlite(key, limit, windowMs);
}
