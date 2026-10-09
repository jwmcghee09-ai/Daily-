import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearPortfolioData, getDb, readPortfolioState, saveImport, writeSnapshotSeries } from "@/lib/db";
import { demoHoldings, demoSnapshots } from "@/lib/demo-portfolio";

export const DEMO_GUEST_COOKIE_NAME = "spectre_demo_guest";
export const DEMO_GUEST_TTL_MS = 30 * 60 * 1000;
export const DEMO_GUEST_MAX_UPLOADS = 2;

const DEMO_GUEST_EXPIRES_KEY = "demo_guest_expires_at";
const DEMO_GUEST_UPLOAD_COUNT_KEY = "demo_guest_upload_count";
const UPDATED_AT_KEY = "updated_at";
const LAST_PRICE_REFRESH_KEY = "last_price_refresh_at";

export interface DemoGuestContext {
  userId: string;
  expiresAt: string;
  uploadCount: number;
  uploadsRemaining: number;
}

function sanitizeGuestId(raw: string): string {
  const value = raw.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return value.startsWith("demo_guest_") ? value : "";
}

function scopeKey(userId: string, key: string): string {
  return `${userId}::${key}`;
}

function getMeta(key: string): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value?: string } | undefined;
  return row?.value ?? "";
}

function setMeta(key: string, value: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function deleteMeta(key: string): void {
  const db = getDb();
  db.prepare("DELETE FROM meta WHERE key = ?").run(key);
}

function readUploadCount(userId: string): number {
  const raw = Number(getMeta(scopeKey(userId, DEMO_GUEST_UPLOAD_COUNT_KEY)) || "0");
  if (!Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  return Math.min(Math.floor(raw), DEMO_GUEST_MAX_UPLOADS);
}

function toContext(userId: string, expiresAt: string): DemoGuestContext {
  const uploadCount = readUploadCount(userId);
  return {
    userId,
    expiresAt,
    uploadCount,
    uploadsRemaining: Math.max(DEMO_GUEST_MAX_UPLOADS - uploadCount, 0),
  };
}

function isExpired(expiresAt: string): boolean {
  if (!expiresAt) {
    return true;
  }
  const parsed = new Date(expiresAt).getTime();
  if (!Number.isFinite(parsed)) {
    return true;
  }
  return parsed <= Date.now();
}

export function attachDemoGuestCookie(response: NextResponse, userId: string, expiresAt: string): void {
  response.cookies.set({
    name: DEMO_GUEST_COOKIE_NAME,
    value: userId,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/",
  });
}

export function clearDemoGuestCookie(response: NextResponse): void {
  response.cookies.set({
    name: DEMO_GUEST_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}

export function clearDemoGuestWorkspace(userId: string): void {
  clearPortfolioData(userId);
  deleteMeta(scopeKey(userId, DEMO_GUEST_EXPIRES_KEY));
  deleteMeta(scopeKey(userId, DEMO_GUEST_UPLOAD_COUNT_KEY));
}

export function resetDemoGuestPortfolio(userId: string) {
  const db = getDb();
  const scopedPattern = `${userId}::%`;
  db.prepare("DELETE FROM holdings WHERE id LIKE ?").run(scopedPattern);
  db.prepare("DELETE FROM snapshots WHERE date LIKE ?").run(scopedPattern);
  deleteMeta(scopeKey(userId, UPDATED_AT_KEY));
  deleteMeta(scopeKey(userId, LAST_PRICE_REFRESH_KEY));
  return readPortfolioState(userId);
}

export async function getDemoGuestContext(): Promise<DemoGuestContext | null> {
  const cookieStore = await cookies();
  const userId = sanitizeGuestId(cookieStore.get(DEMO_GUEST_COOKIE_NAME)?.value || "");
  if (!userId) {
    return null;
  }

  const expiresAt = getMeta(scopeKey(userId, DEMO_GUEST_EXPIRES_KEY));
  if (isExpired(expiresAt)) {
    clearDemoGuestWorkspace(userId);
    return null;
  }

  return toContext(userId, expiresAt);
}

export function createDemoGuestContext(): DemoGuestContext {
  const userId = `demo_guest_${crypto.randomBytes(12).toString("hex")}`;
  const expiresAt = new Date(Date.now() + DEMO_GUEST_TTL_MS).toISOString();
  setMeta(scopeKey(userId, DEMO_GUEST_EXPIRES_KEY), expiresAt);
  setMeta(scopeKey(userId, DEMO_GUEST_UPLOAD_COUNT_KEY), "0");
  seedDemoPortfolio(userId);
  return toContext(userId, expiresAt);
}

/**
 * Write the sample portfolio into a guest's own workspace.
 *
 * The demo used to keep its portfolio in the browser alone, which meant the
 * server saw an empty account and every panel computed server-side — the fund
 * look-through, the risk engine, per-holding contributions — had nothing to say
 * and hid itself. A visitor saw the half of the product that needs no data.
 *
 * Seeding it here means the demo runs the same code a real account does, by
 * reading its own holdings back through the same endpoints. Grouped by source
 * because saveImport replaces one source at a time, which is how a real import
 * behaves.
 */
export function seedDemoPortfolio(userId: string): void {
  const holdings = demoHoldings();
  const bySource = new Map<string, typeof holdings>();
  for (const holding of holdings) {
    const list = bySource.get(holding.source) ?? [];
    list.push(holding);
    bySource.set(holding.source, list);
  }

  for (const [source, list] of bySource) {
    try {
      saveImport(userId, source as (typeof holdings)[number]["source"], list);
    } catch {
      // One bad group must not cost the visitor the whole demo.
    }
  }

  // saveImport records a single point per import; the risk figures want a
  // history, so the sample's own curve is written over the top.
  const total = holdings.reduce((sum, h) => sum + (Number(h.value) || 0), 0);
  try {
    writeSnapshotSeries(userId, demoSnapshots(total));
  } catch {
    // Risk falls back to the Yahoo estimate without it.
  }
}

/**
 * Atomically check-and-increment the upload count for a demo guest.
 * Returns null if the guest has already reached DEMO_GUEST_MAX_UPLOADS,
 * preventing a TOCTOU race between the check in the route handler and the
 * increment here (the async file-processing in between creates a window).
 */
export function incrementDemoGuestUploadCount(userId: string): DemoGuestContext | null {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const currentCount = readUploadCount(userId);
    if (currentCount >= DEMO_GUEST_MAX_UPLOADS) {
      db.exec("ROLLBACK");
      return null;
    }
    const nextCount = currentCount + 1;
    setMeta(scopeKey(userId, DEMO_GUEST_UPLOAD_COUNT_KEY), String(nextCount));
    const expiresAt = getMeta(scopeKey(userId, DEMO_GUEST_EXPIRES_KEY));
    db.exec("COMMIT");
    return toContext(userId, expiresAt);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
