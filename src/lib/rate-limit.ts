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

  const row = db
    .prepare("SELECT count, window_start FROM rate_limits WHERE key = ?")
    .get(key) as RateLimitRow | undefined;

  if (!row || now - row.window_start >= windowMs) {
    db.prepare("INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)")
      .run(key, now);

    // Probabilistic cleanup: ~1% of calls
    if (Math.random() < 0.01) {
      db.prepare("DELETE FROM rate_limits WHERE window_start + ? < ?")
        .run(windowMs, now);
    }

    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, limit - 1),
    };
  }

  const newCount = row.count + 1;
  db.prepare("UPDATE rate_limits SET count = ? WHERE key = ?")
    .run(newCount, key);

  // Probabilistic cleanup: ~1% of calls
  if (Math.random() < 0.01) {
    db.prepare("DELETE FROM rate_limits WHERE window_start + ? < ?")
      .run(windowMs, now);
  }

  if (newCount > limit) {
    const retryAfterMs = Math.max(0, windowMs - (now - row.window_start));
    return {
      allowed: false,
      retryAfterSec: Math.ceil(retryAfterMs / 1000),
      remaining: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, limit - newCount),
  };
}

/* ── Public API ── */

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  if (process.env.NODE_ENV === "development") {
    return consumeRateLimitInMemory(key, limit, windowMs);
  }

  return consumeRateLimitSqlite(key, limit, windowMs);
}
