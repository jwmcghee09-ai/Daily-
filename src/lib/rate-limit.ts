interface RateLimitBucket {
  count: number;
  windowStart: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

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

export function consumeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
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
