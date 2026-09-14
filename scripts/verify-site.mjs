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
  "public/apple-touch-icon.png",
];
for (const a of assets) {
  if (existsSync(join(root, a))) ok(`${a} present`);
  else fail(`${a} missing`);
}

// ── 3b. The mark must appear on every surface, not just the landing page ──
// A logo that quietly falls off a page is the kind of regression nobody
// notices until the product looks unbranded in a screenshot.
const MARK_SURFACES = [
  "public/spectre-dashboard-v3.html",
  "public/spectre-settings-v3.html",
  "public/spectre-market-research-v1.html",
  "src/components/marketing/landing-page.tsx",
  "src/components/auth/sign-in-page.tsx",
  "src/app/terminal/route.ts",
  "src/app/strategy/route.ts",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
];
for (const surface of MARK_SURFACES) {
  const path = join(root, surface);
  if (!existsSync(path)) { fail(`${surface} missing`); continue; }
  const count = (readFileSync(path, "utf8").match(/spectre-mark\.svg/g) ?? []).length;
  if (count > 0) ok(`${surface}: brand mark present (${count}×)`);
  else fail(`${surface}: no brand mark — the logo has fallen off this page`);
}

// ── 3bb. Route-served pages must declare their own favicon ──
// Pages returned as raw HTML by a route handler never pass through Next's
// metadata system, so they declare no icon unless it is written in by hand —
// and then the browser falls back to whatever it cached for /favicon.ico,
// which is how a stale icon survives a rebrand.
const FAVICON_SURFACES = [
  "public/spectre-dashboard-v3.html",
  "public/spectre-settings-v3.html",
  "public/spectre-market-research-v1.html",
  "src/app/terminal/route.ts",
  "src/app/strategy/route.ts",
];
for (const surface of FAVICON_SURFACES) {
  const path = join(root, surface);
  if (!existsSync(path)) { fail(`${surface} missing`); continue; }
  const html = readFileSync(path, "utf8");
  if (/rel="icon"/.test(html)) ok(`${surface}: declares a favicon`);
  else fail(`${surface}: no <link rel="icon"> — the browser will use a cached one`);
}

// ── 3c. Brand gradients must use the deep ramp, not the old light orange ──
// #ff7a30 still has a legitimate job as the "watch" severity colour on risk
// chips, so this checks gradients only: a flat colour:#ff7a30 is amber and
// fine, the same hex inside a linear-gradient is the old brand orange and is
// not. Keeping the two apart is what stops amber drifting into red.
const PALETTE_SURFACES = [
  "public/spectre-dashboard-v3.html",
  "public/spectre-settings-v3.html",
  "public/spectre-market-research-v1.html",
  "src/app/terminal/route.ts",
  "src/app/strategy/route.ts",
  "src/app/dashboard/route.ts",
  "src/components/auth/sign-in-page.module.css",
];
const LIGHT_ORANGE = /linear-gradient\([^)]*(?:#ff7a30|#ffb347|#f97316|#fb923c)[^)]*\)/gi;
for (const surface of PALETTE_SURFACES) {
  const path = join(root, surface);
  if (!existsSync(path)) { fail(`${surface} missing`); continue; }
  const hits = readFileSync(path, "utf8").match(LIGHT_ORANGE) ?? [];
  if (hits.length === 0) ok(`${surface}: brand gradients on the deep ramp`);
  else fail(`${surface}: ${hits.length} gradient(s) still on the old light orange — ${hits[0].slice(0, 70)}`);
}

// ── 3d. No graph-paper grid overlays ──
// The homepage has none. Other pages each painted their own fixed grid of
// criss-cross lines or dots over everything, which is the single loudest way
// they stopped looking like the same product.
const GRID_PATTERN = /(1px|\.6px)\s*,\s*transparent\s+(1px|\.6px)/;
for (const surface of PALETTE_SURFACES) {
  const path = join(root, surface);
  if (!existsSync(path)) continue;
  const css = readFileSync(path, "utf8");
  if (GRID_PATTERN.test(css)) fail(`${surface}: has a repeating grid/dot overlay — the homepage has none`);
  else ok(`${surface}: no grid overlay`);
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
