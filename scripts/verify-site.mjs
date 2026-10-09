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

/*
 * ── 5. Nothing on the landing page may be hidden waiting for a class that
 *       nobody adds ──
 *
 * The scroll-reveal animation was removed and its observer with it, so every
 * reveal class was flattened to opacity 1. .revealTilt was missed, because it
 * is declared twelve hundred lines below the others: it kept `opacity: 0` and
 * a `.revealTilt.visible` rule to undo it, and since nothing adds .visible any
 * more, the four cards carrying it were invisible for good. The Dashboard
 * Preview section shipped as a heading above eight hundred pixels of nothing,
 * and nothing failed — no error, no warning, valid CSS, correct markup.
 *
 * Two rules, so the same silence cannot happen twice:
 *   - a selector compounding .visible is dead weight, since nothing adds it
 *   - a class used in the markup must not resolve to opacity 0 with no
 *     mechanism to raise it
 */
const VISIBLE_COMPOUND = /\.[A-Za-z0-9_-]+\.visible\b/g;
const deadVisible = [...cssModule.matchAll(VISIBLE_COMPOUND)].map((m) => m[0]);
if (!tsx.includes("styles.visible") && deadVisible.length) {
  fail(`landing page: ${deadVisible.length} rule(s) depend on .visible, which nothing adds — `
    + `${[...new Set(deadVisible)].slice(0, 3).join(", ")}. Content behind them never appears.`);
} else {
  ok("landing page: no rule waits on a class nothing adds");
}

// Every class the markup uses, checked for a bare `opacity: 0` in its own
// block. Scroll-driven elements are exempt by name: their opacity is set from
// JavaScript on scroll, which this cannot see, and each is verified to reach
// opacity 1 in a browser.
const SCROLL_DRIVEN = new Set(["stickyPreview", "stickyPanel", "aiConsoleReveal"]);
const hiddenForever = [];
for (const cls of new Set(usedClasses)) {
  if (SCROLL_DRIVEN.has(cls)) continue;
  // The block that defines this class on its own, not as part of a compound.
  const block = new RegExp(`^\\.${cls}\\s*\\{([^}]*)\\}`, "m").exec(cssModule);
  if (!block) continue;
  if (!/opacity:\s*0\s*;/.test(block[1])) continue;
  // An animation or transition that ends visible is a fade-in, not a trap.
  if (/animation:/.test(block[1])) continue;
  hiddenForever.push(cls);
}
if (hiddenForever.length) {
  fail(`landing page: ${hiddenForever.join(", ")} set opacity 0 with nothing to raise it — `
    + "whatever carries them never renders.");
} else {
  ok("landing page: nothing is left permanently invisible");
}

/*
 * ── 6. No dark-theme surfaces left over on a light page ──
 *
 * Converting the app from dark to light recoloured text and left some
 * backgrounds behind at full saturation. The sign-in card wore a #2e10c6 band
 * across its top with dim lavender text on it, its plan picker sat on the same
 * indigo under dark grey text, and the dip-alert inputs were #4336a1 behind
 * near-black type. All three were legible-ish, none of them errored, and each
 * had been shipping since the conversion.
 *
 * The rule: on these light surfaces a background may be dark, and it may be
 * saturated, but not both — unless it is a brand hue. A deliberately dark panel
 * is a near-neutral charcoal and passes; a semantic dot or badge is small and
 * light enough to pass; a leftover from a purple-and-indigo dark theme is
 * neither and fails.
 */
const BRAND_HUE = (h) => h <= 35 || h >= 340;

function hsl(hex) {
  const parts = hex.length === 4
    ? hex.slice(1).split("").map((c) => parseInt(c + c, 16))
    : [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r, g, b] = parts.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
    h *= 60;
  }
  return { h, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

/*
 * Semantic colours that are meant to be what they are: the green "live" dot,
 * the traffic-light window dots on the mock browser chrome, the amber marker on
 * the 52-week range. Listed by value so adding one is a decision rather than a
 * silence.
 */
const SEMANTIC = new Set(["#0a7d3c", "#23b338", "#c68d10", "#c67b10", "#f52014"]);

for (const surface of PALETTE_SURFACES) {
  const path = join(root, surface);
  if (!existsSync(path)) continue;
  const css = readFileSync(path, "utf8");
  const strays = [];
  for (const match of css.matchAll(/background(?:-color)?:\s*(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})\b/g)) {
    const hex = match[1].toLowerCase();
    if (SEMANTIC.has(hex)) continue;
    const { h, s, l } = hsl(hex);
    if (s > 0.4 && l < 0.62 && !BRAND_HUE(h)) {
      const line = css.slice(0, match.index).split("\n").length;
      strays.push(`${hex} at line ${line}`);
    }
  }
  if (strays.length) {
    fail(`${surface}: dark saturated non-brand background(s) — ${strays.join(", ")}. `
      + "Left over from the dark theme; light-theme text is unreadable on these.");
  } else {
    ok(`${surface}: no dark-theme surfaces left behind`);
  }
}

/*
 * ── 7. No form-field declarations stranded on a container rule ──
 *
 * The Ask AI card lost a selector. Everything meant for .ai-input-textarea —
 * min-height, resize, caret-color, the transparent background — was swallowed
 * into .ai-input-card:focus-within above it, which produced two faults from one
 * missing line: the textarea had no styling at all and rendered as a bare
 * browser box with a grey border and a resize grip, and focusing the card set
 * it to background:transparent;border:none so the card disappeared as you
 * typed. Valid CSS, no warning, shipped.
 *
 * `resize` and `caret-color` apply only to editable fields, so finding either
 * on a selector that is not one means a rule has been merged into its
 * neighbour.
 */
const FIELD_ONLY = /(^|[;{])\s*(resize|caret-color)\s*:/;
/*
 * The exemption is tested on the selector's LAST token, with pseudo-classes
 * removed. A looser match on the whole string let .ai-input-card:focus-within
 * through on the strength of "-input" in the card's own name — which is the
 * exact rule the check exists to catch.
 */
function targetsAField(selector) {
  const last = selector.split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
  const bare = last.replace(/::?[a-z-]+(\([^)]*\))?/gi, "");
  return /(^|[.#-])(textarea|input|select|field)$/i.test(bare)
    || /\[contenteditable/i.test(last);
}

for (const surface of PALETTE_SURFACES) {
  const path = join(root, surface);
  if (!existsSync(path)) continue;
  const css = readFileSync(path, "utf8");
  /*
   * An id selector is only a container if the markup says so. These files carry
   * their own HTML, so #chat-in can be looked up rather than guessed at — and
   * it is a textarea, which the first version of this check called a fault.
   */
  const fieldIds = new Set(
    [...css.matchAll(/<(?:textarea|input|select)\b[^>]*\bid=["']([^"']+)["']/g)].map((m) => m[1]),
  );
  const stranded = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].split("\n").pop().trim();
    if (!FIELD_ONLY.test(match[2])) continue;
    if (targetsAField(selector)) continue;
    // Every id named in the selector resolving to a real field means the rule
    // is where it belongs.
    const ids = [...selector.matchAll(/#([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    if (ids.length > 0 && ids.every((id) => fieldIds.has(id))) continue;
    stranded.push(selector.slice(0, 60));
  }
  if (stranded.length) {
    fail(`${surface}: resize/caret-color on a non-field selector — ${stranded.join(", ")}. `
      + "A rule has been merged into its neighbour and something has lost its styling.");
  } else {
    ok(`${surface}: no field styles stranded on a container`);
  }
}

/*
 * ── 8. The Ask AI box is not pre-filled ──
 *
 * It used to be, from inside a render that runs on eight paths including every
 * chunk of a streaming reply. The field never showed its placeholder, you had
 * to delete a sentence before asking your own question, and clearing it put
 * the sentence back under your cursor. The route already defaults an empty
 * question, so writing one into the input buys nothing and costs that.
 */
{
  const dashboard = readFileSync(join(root, "public/spectre-dashboard-v3.html"), "utf8");
  const prefills = [...dashboard.matchAll(/questionInput\.value\s*=\s*HOLDINGS_AI_DEFAULT_QUESTION/g)];
  if (prefills.length) {
    fail(`dashboard: the Ask AI box is pre-filled with the default question in ${prefills.length} place(s). `
      + "Let the placeholder show; the route supplies a default when none is typed.");
  } else {
    ok("dashboard: the Ask AI box is left for the user to fill");
  }
}

/*
 * ── 9. The homepage's numbers agree with the demo workspace ──
 *
 * Every figure on the landing page is a mock, which made each section's numbers
 * someone's free choice, and they diverged: the ticker had BHP at 45.82 up 1.2%
 * while the research panel below it had 57.54 down 2.7%, CBA was down 0.4% in
 * one place and up 0.4% in another, and the hero showed a $1.27M book beside a
 * connector example quoting $54,428. Nothing was broken and nothing looked
 * broken — but reading two of them together tells a visitor the numbers in a
 * risk product are decoration, and a finance reader does read them together.
 *
 * The fix was to source them all from the demo portfolio a visitor actually
 * lands in. This keeps them there: the price and day move the page prints for a
 * demo holding must be the price and day move that holding has, and the total
 * must be the arithmetic of the seed.
 */
{
  const demo = readFileSync(join(root, "src/lib/demo-portfolio.ts"), "utf8");
  const seeds = new Map();
  for (const line of demo.split("\n")) {
    const m = line.match(
      /ticker:\s*"([A-Z0-9.\-]+)".*?units:\s*([\d.]+),\s*price:\s*([\d.]+),\s*prevClose:\s*([\d.]+)/,
    );
    if (m) seeds.set(m[1], { units: +m[2], price: +m[3], prevClose: +m[4] });
  }
  if (seeds.size < 8) {
    fail(`demo-portfolio.ts: only parsed ${seeds.size} seed holdings — the guardrail below is not reading them`);
  }

  // What the page prints, and which demo holding each claim is about.
  const claims = [
    ["ticker strip", "BHP", /\["BHP", "([\d.]+)", "([+\-][\d.]+)%"/],
    ["ticker strip", "CBA", /\["CBA", "([\d.]+)", "([+\-][\d.]+)%"/],
    ["ticker strip", "IVV", /\["IVV", "([\d.]+)", "([+\-][\d.]+)%"/],
    ["ticker strip", "MQG", /\["MQG", "([\d.]+)", "([+\-][\d.]+)%"/],
    ["ticker strip", "VAS", /\["VAS", "([\d.]+)", "([+\-][\d.]+)%"/],
    ["research panel", "BHP", /\["BHP", "([\d.]+)", "([+\-][\d.]+)%", (?:true|false)\]/],
    ["research panel", "CBA", /\["CBA", "([\d.]+)", "([+\-][\d.]+)%", (?:true|false)\]/],
  ];

  let drift = [];
  for (const [where, ticker, pattern] of claims) {
    const seed = seeds.get(ticker);
    if (!seed) { drift.push(`${ticker} is not in the demo seed`); continue; }
    const m = tsx.match(pattern);
    if (!m) { drift.push(`${where}: no ${ticker} row found`); continue; }

    if (Math.abs(+m[1] - seed.price) > 0.011) {
      drift.push(`${where}: ${ticker} priced ${m[1]}, demo holds it at ${seed.price}`);
    }
    const truth = ((seed.price - seed.prevClose) / seed.prevClose) * 100;
    if (Math.abs(+m[2] - truth) > 0.06) {
      drift.push(`${where}: ${ticker} moved ${m[2]}%, demo implies ${truth.toFixed(2)}%`);
    }
  }

  // The headline total, which is the one a reader checks against the demo.
  const total = [...seeds.values()].reduce((sum, h) => sum + h.units * h.price, 0);
  const shown = tsx.match(/label="Portfolio Value" value="\$([\d,]+)"/);
  if (!shown) {
    drift.push("no Portfolio Value stat card found in the hero");
  } else if (Math.abs(Number(shown[1].replace(/,/g, "")) - total) > 1) {
    drift.push(`hero: portfolio value $${shown[1]}, demo seed totals $${total.toFixed(2)}`);
  }

  if (drift.length) {
    fail("landing page disagrees with the demo workspace it links to:\n    - " + drift.join("\n    - "));
  } else {
    ok(`landing page: all ${claims.length} quoted figures and the total match demo-portfolio.ts`);
  }
}

/*
 * ── 10. The homepage does not advertise the paper-trading agent ──
 *
 * Myrmidon is a separate thing from the portfolio product this page sells, and
 * putting an autonomous trader on the marketing page set an expectation the
 * signup flow does not meet. It was a feature card, a lifecycle chip reading
 * "Automate", and two typed commands in the hero that were trade instructions.
 */
{
  /*
   * Comments stripped first. This check failed on the comment explaining why
   * the trade instructions were removed, which is a note to the next reader,
   * not a promise to a visitor. What matters is what the page renders.
   */
  const rendered = tsx
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const banned = [/myrmidon/i, /autonomous trader/i, /paper money/i, /\bTake profit\b/i, /\bBuy the dip\b/i];
  const present = banned.filter((p) => p.test(rendered)).map((p) => String(p));
  if (present.length) {
    fail(`landing-page.tsx advertises automated trading again: ${present.join(", ")}`);
  } else {
    ok("landing page: no automated-trading claims");
  }
}

/*
 * ── 11. Claims the product has to keep ──
 *
 * The connector bullet said "twelve tools" when there were ten, and said the
 * holdings "stay on your machine" after the hosted connector shipped, which
 * made it plainly untrue. Both were accurate when written. This ties the two
 * claims most likely to rot to the thing they describe.
 */
{
  const mcpTools = readFileSync(join(root, "src/lib/mcp-tools.ts"), "utf8");
  const toolCount = new Set([...mcpTools.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1])).size;
  const words = { 9: "Nine", 10: "Ten", 11: "Eleven", 12: "Twelve", 13: "Thirteen" };
  const word = words[toolCount];

  /*
   * Every mention has to be right, not just one of them.
   *
   * The page states the count in two places — a feature card and a connector
   * bullet — and an earlier version of this check passed as soon as it found a
   * correct one anywhere, so a stale "twelve" beside a fresh "ten" went
   * through. Collect them all instead.
   */
  const counts = [...tsx.matchAll(/\b(Nine|Ten|Eleven|Twelve|Thirteen) tools\b/gi)].map((m) => m[0]);

  if (!word) {
    fail(`mcp-tools.ts exposes ${toolCount} tools and this check has no word for that — add one`);
  } else if (!counts.length) {
    fail(`landing page never states the tool count; mcp-tools.ts exposes ${toolCount}`);
  } else {
    const wrong = counts.filter((c) => c.toLowerCase() !== `${word.toLowerCase()} tools`);
    if (wrong.length) {
      fail(`landing page says ${[...new Set(wrong)].map((w) => `"${w}"`).join(", ")} `
        + `but mcp-tools.ts exposes ${toolCount} — expected "${word} tools"`);
    } else {
      ok(`landing page: all ${counts.length} tool-count mentions match the ${toolCount} in mcp-tools.ts`);
    }
  }

  if (/never handed to a third party|stays on your machine/i.test(tsx)) {
    fail("landing page claims holdings never leave your machine. The hosted MCP connector sends them "
      + "to the assistant the user connects, so say that instead.");
  } else {
    ok("landing page: no local-only claim contradicting the hosted connector");
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll site guardrails passed");
process.exit(failures ? 1 : 0);
