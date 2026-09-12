// Talks to your SPECTRE account so local tools can read the live portfolio —
// whatever you last imported on the website, not a CSV you keep in sync by hand.
//
// Login stores the session token (never your password) in ~/.spectre/config.json
// with owner-only permissions. Tokens last 30 days; re-run `login` after that.

import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".spectre");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const DEFAULT_BASE_URL = process.env.SPECTRE_URL?.replace(/\/$/, "") || "https://spectre-assets.com";

export class SessionExpired extends Error {
  constructor() {
    super("Your SPECTRE session has expired or been revoked.\n  Run:  node spectre.mjs login");
  }
}

export class NotPermitted extends Error {
  constructor(path) {
    super(
      `The signed-in SPECTRE account isn't permitted to use ${path}.\n` +
        "  Myrmidon endpoints are restricted to the trader account — sign in as that account:\n" +
        "    node spectre.mjs login",
    );
  }
}

export class NotSignedIn extends Error {
  constructor() {
    super(
      "Not signed in to SPECTRE.\n" +
        "  Run:  node spectre.mjs login\n" +
        "  Or work from a CSV instead:  node spectre.mjs portfolio holdings.csv",
    );
  }
}

export async function readConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

export async function writeConfig(config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  // Owner read/write only — this file holds a live session token.
  await chmod(CONFIG_PATH, 0o600);
  return CONFIG_PATH;
}

export async function clearConfig() {
  await writeConfig({});
  return CONFIG_PATH;
}

/** Exchange email + password for a session token. The password is never stored. */
export async function login(email, password, baseUrl = DEFAULT_BASE_URL) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `Login failed (${res.status})`);
  }
  if (payload.requiresTotp || payload.totpRequired) {
    throw new Error("This account uses two-factor auth, which the CLI can't complete yet.");
  }

  // The session token comes back in the Set-Cookie header.
  const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean);
  let token = "";
  for (const cookie of setCookie) {
    const match = /(?:^|;\s*)spectre_session=([^;]+)/.exec(cookie);
    if (match) { token = decodeURIComponent(match[1]); break; }
  }
  if (!token) throw new Error("Login succeeded but no session token was returned.");

  const path = await writeConfig({ baseUrl, email, token, savedAt: new Date().toISOString() });
  return { email, path, baseUrl };
}

/** Authenticated GET against the SPECTRE API using the stored token. */
export async function apiGet(path, { timeoutMs = 20000 } = {}) {
  const config = await readConfig();
  if (!config?.token) throw new NotSignedIn();

  const res = await fetch(`${config.baseUrl || DEFAULT_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${config.token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  // 401 means the token is no longer good; 403 means this account is signed in
  // but isn't allowed at this endpoint. Conflating them sends people off to
  // re-login when the real problem is that they're on the wrong account.
  if (res.status === 401) {
    throw new SessionExpired();
  }
  if (res.status === 403) {
    throw new NotPermitted(path);
  }
  if (!res.ok) throw new Error(`SPECTRE API returned ${res.status} for ${path}`);
  return res.json();
}

/**
 * Live holdings from the signed-in account. Read fresh on every call, so
 * anything imported or changed on the website shows up immediately.
 */
export async function fetchAccountPortfolio() {
  const state = await apiGet("/api/portfolio");
  const holdings = (state?.holdings ?? []).map((h) => {
    const units = Number(h.units) || 0;
    // The account stores cost base as the TOTAL paid for the position, while
    // everything downstream works in per-unit terms (as a CSV "cost" column
    // does). Normalise here so profit/loss is not off by the unit count.
    const totalCost = Number(h.costBase ?? h.cost_base) || null;
    return {
      ticker: String(h.ticker || "").toUpperCase(),
      name: h.name || "",
      source: h.source || "",
      account: h.account || "",
      sector: h.sector || "",
      units,
      lastPrice: Number(h.price) || null,
      value: Number(h.value) || 0,
      totalCostBase: totalCost,
      costBase: totalCost && units > 0 ? totalCost / units : null,
    };
  }).filter((h) => h.ticker && h.units > 0);

  return {
    holdings,
    snapshots: state?.snapshots ?? [],
    importedAt: state?.holdings?.[0]?.importedAt ?? null,
  };
}

export { CONFIG_PATH, DEFAULT_BASE_URL };
