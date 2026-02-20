import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthSessionUser, createAuthSession, deleteAuthSession, findAuthSessionUserByTokenHash } from "@/lib/db";

export const SESSION_COOKIE_NAME = "spectre_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeDisplayName(displayName: string, email: string): string {
  const cleaned = displayName.trim();
  if (cleaned.length > 0) {
    return cleaned.slice(0, 80);
  }

  const localPart = normalizeEmail(email).split("@")[0] || "User";
  return localPart.slice(0, 80);
}

export function isLikelyEmail(email: string): boolean {
  const value = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hashHex] = storedHash.split(":");
  if (!salt || !hashHex) {
    return false;
  }

  const derivedHash = crypto.scryptSync(password, salt, 64);
  const expectedHash = Buffer.from(hashHex, "hex");

  if (derivedHash.length !== expectedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedHash, expectedHash);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function applySessionCookie(response: NextResponse, token: string, expiresAt: string): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(expiresAt),
    path: "/",
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}

export function createAndPersistSession(userId: string): { token: string; expiresAt: string } {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  createAuthSession(userId, tokenHash, expiresAt);

  return { token, expiresAt };
}

export function destroySessionToken(token: string): void {
  const tokenHash = hashSessionToken(token);
  deleteAuthSession(tokenHash);
}

export async function getAuthenticatedUser(): Promise<AuthSessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  return findAuthSessionUserByTokenHash(tokenHash);
}

export function getClientAddress(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const xRealIp = request.headers.get("x-real-ip") || "";

  const firstForwarded = forwardedFor
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)[0];

  const candidate = firstForwarded || xRealIp.trim() || "unknown";
  return candidate.slice(0, 128);
}
