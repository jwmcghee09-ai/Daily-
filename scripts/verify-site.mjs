#!/usr/bin/env node
// Site guardrail — catches the bug classes that have actually bitten this repo:
//   1. Broken <script> blocks in the served static HTML pages (a single syntax
//      error silently kills every button on the page).
//   2. Accidental edits to the trader-authorization email.
//   3. Brand/asset references pointing at files that no longer exist.
// Run before every deploy: `npm run verify:site`

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (msg) => { failures++; console.error("  ✗ " + msg); };
const ok = (msg) => console.log("  ✓ " + msg);

// ── 1. Parse-check every <script> block in served static HTML ──
const staticPages = [
  "public/spectre-dashboard-v3.html",
  "public/spectre-settings-v3.html",
  "public/spectre-market-research-v1.html",
];
for (const page of staticPages) {
  const path = join(root, page);
  if (!existsSync(path)) { fail(`${page} missing`); continue; }
  const html = readFileSync(path, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let bad = 0;
  scripts.forEach(([, src], i) => {
    try { new Function(src); } catch (e) { bad++; fail(`${page} script #${i}: ${e.message}`); }
  });
  if (!bad) ok(`${page}: ${scripts.length} script blocks parse cleanly`);
}

// ── 1b. Parse-check standalone client scripts ──
import { readdirSync } from "node:fs";
const jsDir = join(root, "public/js");
if (existsSync(jsDir)) {
  for (const f of readdirSync(jsDir).filter((f) => f.endsWith(".js"))) {
    try { new Function(readFileSync(join(jsDir, f), "utf8")); ok(`public/js/${f} parses cleanly`); }
    catch (e) { fail(`public/js/${f}: ${e.message}`); }
  }
}

// ── 2. Trader email must never change ──
const TRADER_EMAIL = "jwmcghee09@gmail.com";
const traderFiles = [
  "src/app/dashboard/route.ts",
  "src/lib/terminal-auth.ts",
];
for (const f of traderFiles) {
  const path = join(root, f);
  if (!existsSync(path)) { fail(`${f} missing`); continue; }
  const src = readFileSync(path, "utf8");
  const m = src.match(/TRADER_EMAIL\s*=\s*"([^"]+)"/);
  if (!m) fail(`${f}: TRADER_EMAIL constant not found`);
  else if (m[1] !== TRADER_EMAIL) fail(`${f}: TRADER_EMAIL is "${m[1]}" — expected "${TRADER_EMAIL}"`);
  else ok(`${f}: TRADER_EMAIL intact`);
}

// ── 3. Brand assets referenced by the app must exist ──
const assets = [
  "public/spectre-wordmark.svg",
  "public/spectre-mark.svg",
  "public/og-image.png",
  "src/app/icon.svg",
  "src/app/favicon.ico",
];
for (const a of assets) {
  if (existsSync(join(root, a))) ok(`${a} present`);
  else fail(`${a} missing`);
}

// ── 4. Landing page must not reference CSS classes that don't exist ──
const cssModule = readFileSync(join(root, "src/components/marketing/landing-page.module.css"), "utf8");
const definedClasses = new Set([...cssModule.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]));
const tsx = readFileSync(join(root, "src/components/marketing/landing-page.tsx"), "utf8");
const usedClasses = [...tsx.matchAll(/styles\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
const missing = [...new Set(usedClasses.filter((c) => !definedClasses.has(c)))];
if (missing.length) fail(`landing-page.tsx uses undefined classes: ${missing.join(", ")}`);
else ok(`landing page: all ${new Set(usedClasses).size} referenced classes exist`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll site guardrails passed");
process.exit(failures ? 1 : 0);
