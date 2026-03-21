# SPECTRE Assets Review

**Repo:** `gitlab.com/spectre8175508/SPECTRE` (commit `2de6dfb`)
**Review date:** 2026-03-20

---

## 1. Brand / Logo SVGs (`public/`)

| File | Dimensions | Notes |
|------|-----------|-------|
| `spectre-logo.svg` | 260×56 | Full lockup: angular red-gradient emblem + SPECTRE wordmark in white paths |
| `spectre-wordmark-plain.svg` | 344×82 | Red (`#FF4B33`) text-only wordmark on transparent; uses Sora/Montserrat stack |
| `spectre-wordmark-banner.svg` | 344×82 | Same wordmark on a dark striped plate (diagonal red + white micro-stripes) |

**Observations:**
- The emblem in `spectre-logo.svg` is constructed as pure SVG paths — no raster dependency. Scales cleanly to any size.
- `spectre-wordmark-plain.svg` uses a `<text>` element with a web-font stack (`Sora, Montserrat, 'Arial Black'`). Rendering is font-dependent; if Sora is not loaded, fallback metrics will shift letter spacing and layout. For a production logo export, converting to paths is strongly recommended.
- `spectre-wordmark-banner.svg` includes a gradient plate + diagonal stripe pattern — a nice detail for dark backgrounds, but the stripe `<pattern>` may not render consistently across all SVG renderers (particularly older email clients if used in HTML email).
- Accessibility: both files include `role="img"` and `aria-labelledby` pointing to `<title>` and `<desc>` — good practice.
- Brand palette: primary red `#FF4B33` / `#FF624B` → `#CF2E17` gradient, deep navy background `#0F1118`. Consistent across all three files.

**Recommendations:**
- Convert `<text>` in the wordmark SVGs to `<path>` to eliminate font-stack rendering variance.
- Consider adding a `viewBox`-only variant (no fixed `width`/`height`) so the SVGs scale freely via CSS without needing an override.

---

## 2. Ad Creative — Static Feed (`assets/ads/`)

| File | Dimensions | File size |
|------|-----------|-----------|
| `spectre-static-ad-feed-1080x1350.png` | 1080×1350 px | 1.1 MB |
| `spectre-static-ad-feed-2160x2700.png` | 2160×2700 px | 3.8 MB |

**Observations:**
- Both are the standard Meta feed ratio (4:5), delivered at 1× and 2× for Retina. Correct approach.
- File sizes are within Meta's upload limit (30 MB) but the 2× variant at 3.8 MB is on the heavier side for a static PNG. Running through `pngquant` or `oxipng` could reduce it by 30–60% with no perceptual loss, which improves ad load time on slower mobile connections.
- Two resolutions are sufficient; Meta will serve the appropriate one automatically.

---

## 3. Ad Creative — IG Concepts (`assets/ads/concepts/`)

| File | Dimensions | File size |
|------|-----------|-----------|
| `spectre-ig-concept-1-1080x1350.png` | 1080×1350 | 981 KB |
| `spectre-ig-concept-1-2160x2700.png` | 2160×2700 | 3.8 MB |
| `spectre-ig-concept-2-1080x1350.png` | 1080×1350 | 975 KB |
| `spectre-ig-concept-2-2160x2700.png` | 2160×2700 | 3.8 MB |
| `spectre-ig-concept-3-1080x1350.png` | 1080×1350 | 983 KB |
| `spectre-ig-concept-3-2160x2700.png` | 2160×2700 | 3.8 MB |
| `spectre-ig-concepts-sheet.png` | (composite) | 363 KB |

**Observations:**
- Three distinct concept variants — good for A/B testing. The AD_PLAYBOOK specifies rotating the best-performing 2 ads weekly, so 3 concepts at launch is a solid starting set.
- The composite sheet (`spectre-ig-concepts-sheet.png`) is much smaller (363 KB) than the individual files, suggesting it is a reduced-resolution overview/proof sheet. Useful for internal review but should not be uploaded to ad platforms.
- All 1× concept files are ~980 KB — very similar sizes, indicating consistent visual complexity across the three concepts. No outlier that suggests accidental full-resolution embed.
- File naming is consistent and descriptive (`spectre-ig-concept-{n}-{w}x{h}.png`) — easy to automate uploads via Meta Marketing API if needed.

**Recommendations:**
- Run all 2× PNGs through lossless compression before ad upload (target < 2 MB per file).
- After first-week results, archive the lowest-CTR concept and introduce a new variant rather than running all three indefinitely.

---

## 4. Ad Creative — Video (`assets/ads/`)

| File | Duration | File size |
|------|---------|-----------|
| `spectre-facebook-instagram-30s.mp4` | 30 s | 12 MB |

**Observations:**
- 30 seconds is within Meta's recommended video ad length (up to 60 s for feed, 15 s recommended for Reels/Stories). For feed placements 30 s is acceptable but attention often drops after 6–8 s; confirm the key message lands in the first 3 s without sound (most users autoplay muted).
- 12 MB is under Meta's 4 GB upload limit and is a reasonable size for a 30 s MP4. However, for faster delivery on mobile networks, targeting < 8 MB via re-encoding at slightly lower bitrate (e.g. H.264 CRF 23–26, 1080p max) is advisable.
- No captions/SRT file present in the repo. Since 85%+ of Facebook video views are muted, burned-in subtitles or an accompanying SRT are strongly recommended to preserve message delivery.

**Recommendations:**
- Add burned-in captions or an SRT sidecar file.
- Re-encode to H.264 at CRF 24 / 1080p max to reduce file size to ~6–8 MB without perceptible quality loss.
- Verify the first 3 seconds communicate the core value proposition visually without audio.

---

## 5. AD_PLAYBOOK.md (`assets/ads/AD_PLAYBOOK.md`)

**Observations:**
- Offer details are clear and concise: Starter at $3/month, URL `spectre-assets.com`, informational analytics (not financial advice).
- Five primary text variants and eight headline options provide enough copy diversity for initial testing.
- CTA is correctly set to "Get Started" (primary) with "Learn More" as alternate. This matches conversion-funnel best practice (direct CTA for warm audiences, softer CTA for cold).
- Campaign structure (Traffic/Conversions → broad + interest targeting, 3–5 creatives, rotate weekly) is sensible for a small-budget launch.
- Compliance footer is included and references the non-financial-advice disclaimer. This is essential for financial product marketing in Australia and aligns with ASIC guidance on financial services advertising.

**Minor gaps:**
- No mention of a pixel/conversion event setup (Meta Pixel or Conversions API) — important for optimising toward purchase/signup events rather than clicks.
- No budget allocation guidance (e.g. split between Ad Set A and B).
- The compliance disclaimer should also appear as overlay text on any static image ad that implies performance metrics (e.g. showing portfolio gain charts), not only on the landing page.

---

## 6. HTML Prototypes (`public/`)

| File | Purpose |
|------|---------|
| `spectre-landing.html` | Marketing landing page prototype |
| `spectre-dashboard-v3.html` | App dashboard UI prototype |
| `spectre-settings-v3.html` | Settings page prototype |
| `spectre-market-research-v1.html` | Market research UI prototype |

**Observations:**
- Landing page uses Google Fonts (`Bebas Neue`, `DM Mono`, `DM Sans`) — these are loaded over CDN, which is fine for prototyping but adds a network dependency and potential GDPR/privacy consideration for production (self-hosting fonts is preferable).
- Colour palette in the landing page (`--bg: #0c0817`, purple `#7c4dff`, orange `#ff6a3d`) differs slightly from the brand palette in the SVG assets (primary red `#FF4B33`, navy `#0F1118`). There is a slight purple/orange shift in the landing page that doesn't appear in the ad creative or logo. This inconsistency should be resolved — pick one palette and apply it across all surfaces.
- The landing page CSS uses `font-family: var(--disp)` referencing `'Bebas Neue'` for display headings, while the logo SVG specifies `Sora/Montserrat`. Two different display typefaces creates a brand fragmentation risk.
- Dashboard prototype (`spectre-dashboard-v3.html`) aligns well with the functional app (`src/app/page.tsx`) — uploads, metrics, risk, charts, and holdings sections match.

**Recommendations:**
- Align all colour tokens across the landing page, app, and ad creative (one source of truth, e.g. a `brand-tokens.css` or design tokens JSON).
- Standardise on a single display typeface. If `Bebas Neue` is the chosen heading font for the landing page, use it in the wordmark SVGs too (or vice versa with Sora).
- Self-host fonts or use `font-display: swap` to prevent layout shifts in production.

---

## 7. Overall Asset Health Summary

| Area | Status | Priority |
|------|--------|----------|
| SVG logos — accessibility | Good | — |
| SVG logos — path vs text | Needs fix | Medium |
| Ad static images — size | Acceptable, can optimise | Low |
| Ad video — captions | Missing | High |
| Ad video — file size | Slightly large | Low |
| AD_PLAYBOOK — copy & CTA | Good | — |
| AD_PLAYBOOK — pixel setup | Not documented | Medium |
| Landing page — font consistency | Inconsistent with ads/logo | Medium |
| Landing page — colour consistency | Inconsistent with brand SVGs | Medium |
| Compliance disclaimer | Present in playbook, verify on ad creatives | High |

---

## 8. Live Dashboard Bug — Gold Price Loading State

**Observed:** The GOLD (XAU/AUD) market data card displays `$Loading...` instead of either a price or a neutral loading indicator.

**Root cause (inferred):** The price display is formatted as `$${price}` (or equivalent template literal) without first checking whether `price` is a resolved value. When the async fetch is still in-flight, `price` holds the string `"Loading..."`, so the rendered output becomes `$Loading...`.

**Fix:** Guard the currency prefix behind a value check before rendering:

```js
// Before (broken)
<span>${price}</span>

// After (fixed) — show prefix only when price is a real value
<span>{price != null && price !== 'Loading...' ? `$${price}` : 'Loading…'}</span>
```

Or, if using a dedicated loading state flag (preferred):

```js
{isLoading ? <span>Loading…</span> : <span>${price}</span>}
```

**Priority:** Medium — visible to all users on the market research / dashboard page; damages trust in live data accuracy.

---

## 9. Recommended Next Actions (Prioritised)

1. **[High]** Add captions to `spectre-facebook-instagram-30s.mp4` (burned-in or SRT).
2. **[High]** Verify the compliance disclaimer (`informational analytics only, not financial advice`) is visible on any ad creative showing performance/risk metrics.
3. **[Medium]** Fix `$Loading...` bug on GOLD (XAU/AUD) card — guard the `$` prefix behind a resolved-value check (see §8).
4. **[Medium]** Convert `<text>` elements in wordmark SVGs to `<path>` for rendering reliability.
5. **[Medium]** Resolve colour token inconsistency between landing page CSS and brand SVGs — document a single canonical palette.
6. **[Medium]** Standardise on one display typeface across all surfaces (landing page, app, ad creative, logo).
7. **[Medium]** Document Meta Pixel / Conversions API event setup in AD_PLAYBOOK.
8. **[Low]** Compress all 2× PNG ad files (target < 2 MB each) before uploading to Meta.
9. **[Low]** Re-encode the MP4 at CRF 24 to reduce from 12 MB to ~6–8 MB.
