import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { clearPortfolioData, getDb, readPortfolioState } from "@/lib/db";

export const DEMO_GUEST_COOKIE_NAME = "spectre_demo_guest";
export const DEMO_GUEST_TTL_MS = 60 * 60 * 1000;
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
    sameSite: "lax",
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
    sameSite: "lax",
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
  return toContext(userId, expiresAt);
}

export function incrementDemoGuestUploadCount(userId: string): DemoGuestContext {
  const expiresAt = getMeta(scopeKey(userId, DEMO_GUEST_EXPIRES_KEY));
  const nextCount = Math.min(readUploadCount(userId) + 1, DEMO_GUEST_MAX_UPLOADS);
  setMeta(scopeKey(userId, DEMO_GUEST_UPLOAD_COUNT_KEY), String(nextCount));
  return toContext(userId, expiresAt);
}
