export const SPECTRE_TEMPLATE_CSS = String.raw`
/* ============================================================================
 * SPECTRE landing page — styles ported verbatim from the Lovable prototype
 * (template.css), with a token block + button base that replace the Lovable
 * build's design tokens and shadcn Button. Injected at runtime via <style>,
 * exactly as the Lovable page did, and scoped under .spectre-page so it never
 * touches the rest of the Next app. Do not hand-edit the template section
 * below; regenerate it from the source if the design changes.
 * ========================================================================== */

/* --- Design tokens: SPECTRE dark theme (from the Lovable styles.css) --- */
.spectre-page {
  --background: oklch(0.14 0.004 25);
  --foreground: oklch(0.92 0 0);
  --card: oklch(0.185 0.004 25);
  --card-foreground: oklch(0.92 0 0);
  --primary: oklch(0.56 0.235 27);
  --primary-foreground: oklch(0.98 0 0);
  --muted: oklch(0.26 0.004 25);
  --muted-foreground: oklch(0.72 0 0);
  --accent: oklch(0.3 0.04 27);
  --accent-foreground: oklch(0.92 0 0);
  --border: oklch(0.31 0.004 25);
  --ring: oklch(0.56 0.235 27);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --spectre-dark: oklch(0.1 0.003 25);
  --spectre-dark-muted: oklch(0.6 0.005 60);
  --spectre-dark-line: oklch(0.325 0.002 150);
  --spectre-teal: oklch(0.72 0.13 165);
  --spectre-blue: oklch(0.68 0.11 245);
  --spectre-gold: oklch(0.78 0.13 85);
  --spectre-chart-fill: oklch(0.55 0.24 27 / 0.16);
  --spectre-shadow: 0 20px 65px oklch(0 0 0 / 0.45);
  min-height: 100vh;
  overflow-x: clip; /* clip the scrolling tape etc.; clip (not hidden) keeps position:sticky working */
}

/* --- Button/link base replacing shadcn Button (template.css styles .cta etc. on top) --- */
.spectre-page .cta { display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; font-weight: 500; cursor: pointer; border: 1px solid transparent; background: var(--primary); color: var(--primary-foreground); line-height: 1; transition: opacity .15s ease; text-decoration: none; white-space: nowrap; }
.spectre-page .cta:hover { opacity: .9; }
.spectre-page .cta svg { width: 15px; height: 15px; }
.spectre-page .cta-outline { background: transparent; border-color: var(--border); color: var(--foreground); }
.spectre-page .cta-ghost { background: transparent; color: var(--foreground); }
.spectre-page .btn-sm { height: 36px; padding: 0 14px; font-size: 12px; border-radius: 5px; }
.spectre-page .btn-ghost { display: inline-flex; align-items: center; gap: 8px; font-family: inherit; cursor: pointer; border: 0; background: transparent; color: inherit; font-weight: 500; }
.spectre-page .mb-6 { margin-bottom: 24px; }
.spectre-page button { font-family: inherit; }
/* Three hero CTAs (incl. Download) wrap instead of overflowing on narrow screens. */
.spectre-page .hero-actions { flex-wrap: wrap; }

/* The .tone-N classes set fill (for bars and legend dots), but the Source Mix
 * donut is a stroked ring whose <circle fill="none"> is overridden by that CSS.
 * Restore the ring by forcing the donut's own circles back to no fill. */
.spectre-page .donut circle { fill: none; }

/* Neutralize global table styles from app globals.css that leak in: a bare
 * table rule forcing min-width 900px (blew the step tables out to the right)
 * and a sticky light-grey th (the white band across the header). The landing
 * page tables are small and want neither. */
.spectre-page table { min-width: 0; }
.spectre-page th { position: static; top: auto; z-index: auto; background: transparent; }
/* globals.css also sets a bare td colour of near-black for the app data tables;
 * on the dark landing that makes the fund-table cells invisible. The fund table
 * does not set its own cell colour, so pin it to the light foreground. */
.spectre-page td { color: var(--foreground); border-color: var(--border); }
.spectre-page tr:hover td { background: transparent; }

/* --- Checkout banner (kept from the real app's homepage) --- */
.spectre-page .checkout-banner { margin: 16px 0 0; padding: 12px 16px; border-radius: 6px; font-size: 13px; border: 1px solid var(--border); background: var(--card); color: var(--foreground); }
.spectre-page .checkout-banner.success { border-color: var(--spectre-teal); }

/* ============================ template.css (verbatim) ====================== */
.spectre-page { font-family: 'DM Sans', sans-serif; color: var(--foreground); background: var(--background); letter-spacing: 0; }
.spectre-page * { box-sizing: border-box; }
.spectre-page h1,.spectre-page h2,.spectre-page h3,.spectre-page h4,.spectre-page p,.spectre-page figure { margin: 0; }
.spectre-page h1,.spectre-page h2,.spectre-page h3,.spectre-brand,.big-number { font-family: 'Space Grotesk', sans-serif; }
.spectre-page a { text-decoration: none; }
.spectre-page section { scroll-margin-top: 100px; }
.spectre-container { width: min(1160px, calc(100% - 64px)); margin: auto; }
.spectre-nav { height: 90px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); gap: 24px; }
.spectre-brand { display: inline-flex; align-items: center; gap: 10px; font-size: 24px; font-weight: 700; color: var(--foreground); }
.spectre-brand img { width: 29px; height: 29px; object-fit: contain; }
.nav-links,.nav-actions { display: flex; align-items: center; gap: 24px; }
.nav-links a { font-size: 13px; color: var(--muted-foreground); }
.nav-links a:hover { color: var(--primary); }
.nav-actions { gap: 8px; }
.spectre-page .cta { border-radius: 6px; height: 46px; padding: 0 23px; font-size: 13px; box-shadow: none; }
.hero-intro { padding: 65px 0 44px; text-align: center; }
.eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; color: var(--muted-foreground); text-transform: uppercase; }
.eyebrow svg { width: 14px; height: 14px; color: var(--primary); }
.hero-intro h1 { font-size: 72px; letter-spacing: -0.02em; line-height: 1.08; font-weight: 500; margin: 20px 0 18px; }
.hero-intro h1 span { color: var(--primary); }
.hero-intro p { font-size: 16px; line-height: 1.7; color: var(--muted-foreground); max-width: 520px; margin: auto; }
.hero-actions { display: flex; justify-content: center; gap: 10px; margin-top: 25px; }
.hero-note { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 11px; color: var(--muted-foreground); margin-top: 14px; }
.hero-note svg { width: 12px; height: 12px; color: var(--spectre-teal); }
.workspace { display: grid; grid-template-columns: 185px minmax(0,1fr); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--spectre-shadow); background: var(--card); overflow: hidden; text-align: left; }
.workspace-sidebar { background: var(--spectre-dark); color: var(--primary-foreground); padding: 24px 16px; display: flex; flex-direction: column; gap: 25px; }
.workspace-sidebar .spectre-brand { color: var(--primary-foreground); font-size: 17px; gap: 7px; }
.workspace-sidebar .spectre-brand img { width: 22px; height: 22px; }
.workspace-sidebar small { font-size: 9px; color: var(--spectre-dark-muted); }
.workspace-tabs { display: flex; flex-direction: column; gap: 5px; }
.spectre-page .workspace-tabs button { justify-content: flex-start; color: var(--spectre-dark-muted); font-size: 11px; gap: 9px; background: transparent; padding: 11px; height: 40px; }
.spectre-page .workspace-tabs button[aria-pressed=true] { background: var(--primary); color: var(--primary-foreground); }
.sidebar-bottom { margin-top: auto; padding-top: 16px; border-top: 1px solid var(--spectre-dark-line); display: flex; gap: 8px; align-items: center; font-size: 10px; color: var(--spectre-dark-muted); }
.sidebar-bottom svg { width: 16px; }
.workspace-main { min-width: 0; }
.workspace-top { display: flex; align-items: center; justify-content: space-between; padding: 17px 24px; border-bottom: 1px solid var(--border); font-size: 11px; color: var(--muted-foreground); }
.workspace-top span { display: flex; align-items: center; gap: 8px; }
.workspace-top svg { width: 13px; height: 13px; }
.sample-tag { display: inline-flex; border: 1px solid var(--border); border-radius: 4px; padding: 4px 7px; font-size: 9px; color: var(--muted-foreground); }
.workspace-content { padding: 24px; min-height: 382px; }
.workspace-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 22px; }
.workspace-heading h3 { font-size: 20px; font-weight: 500; }
.workspace-heading p { font-size: 10px; color: var(--muted-foreground); margin-top: 5px; }
.stats-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
.stats-row > div + div { border-left: 1px solid var(--border); padding-left: 24px; }
.stat-label { font-size: 10px; color: var(--muted-foreground); }
.big-number { font-size: 27px; line-height: 1.3; font-weight: 500; margin-top: 5px; }
.stat-detail { font-size: 10px; color: var(--muted-foreground); margin-top: 4px; }
.positive { color: var(--spectre-teal); }
.negative { color: var(--primary); }
.chart-columns { display: grid; grid-template-columns: 1.7fr 1fr; margin-top: 19px; gap: 28px; }
.chart-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
.chart-head h4 { font-size: 11px; font-weight: 600; }
.spectre-page .periods { display: flex; gap: 2px; }
.spectre-page .periods button { padding: 2px 7px; font-size: 9px; height: 24px; border-radius: 3px; color: var(--muted-foreground); }
.spectre-page .periods button[aria-pressed=true] { background: var(--muted); color: var(--foreground); }
.line-chart { width: 100%; height: 160px; display: block; overflow: visible; }
.chart-grid { stroke: var(--border); stroke-width: 1; }
.chart-axis { fill: var(--muted-foreground); font: 9px 'DM Sans',sans-serif; }
.chart-line { fill: none; stroke: var(--primary); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.chart-area { fill: var(--spectre-chart-fill); }
.chart-benchmark { fill: none; stroke: var(--spectre-blue); stroke-width: 1.5; stroke-dasharray: 4 4; }
.chart-legend { font-size: 9px; color: var(--muted-foreground); display: flex; gap: 15px; align-items: center; }
.chart-legend span { display: flex; align-items: center; gap: 5px; }
.legend-dot { width: 6px; height: 6px; background: var(--primary); border-radius: 50%; }
.legend-dot.blue { background: var(--spectre-blue); }
.donut-content { display: flex; align-items: center; gap: 14px; margin-top: 12px; }
.donut { width: 110px; height: 110px; flex-shrink: 0; }
.donut-number { fill: var(--foreground); font: 500 17px 'Space Grotesk',sans-serif; }
.donut-caption { fill: var(--muted-foreground); font: 7px 'DM Sans',sans-serif; }
.allocation-legend { list-style: none; padding: 0; margin: 0; display: grid; gap: 11px; flex: 1; }
.allocation-legend li { display: flex; gap: 5px; align-items: center; font-size: 9px; white-space: nowrap; }
.allocation-legend strong { margin-left: auto; font-weight: 500; }
.tone-0 { stroke: var(--primary); fill: var(--primary); }
.tone-1 { stroke: var(--spectre-teal); fill: var(--spectre-teal); }
.tone-2 { stroke: var(--spectre-gold); fill: var(--spectre-gold); }
.tone-3 { stroke: var(--spectre-blue); fill: var(--spectre-blue); }
.allocation-legend svg { width: 6px; height: 6px; }
.workspace-insight { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--border); padding: 13px 24px; color: var(--muted-foreground); font-size: 10px; }
.workspace-insight svg { color: var(--primary); width: 14px; flex-shrink: 0; }
.workspace-insight strong { color: var(--foreground); font-weight: 600; }
.source-strip { text-align: center; padding: 42px 0 45px; border-bottom: 1px solid var(--border); }
.source-strip p { font-size: 11px; color: var(--muted-foreground); }
.source-names { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 42px; margin-top: 23px; font-size: 20px; font-weight: 600; color: var(--muted-foreground); }
.source-names span:nth-child(2) { font-style: italic; }
.section-pad { padding: 92px 0; }
.section-heading { display: flex; align-items: end; justify-content: space-between; gap: 50px; margin-bottom: 38px; }
.section-heading h2,.section-copy h2 { font-size: 40px; line-height: 1.15; font-weight: 500; margin-top: 15px; }
.section-heading > p { font-size: 14px; line-height: 1.7; color: var(--muted-foreground); max-width: 340px; }
.product-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.product-item { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 30px; display: flex; flex-direction: column; min-width: 0; }
.product-item h3 { font-size: 24px; font-weight: 500; line-height: 1.2; margin-top: 14px; }
.product-item > p { color: var(--muted-foreground); font-size: 13px; line-height: 1.7; max-width: 420px; margin-top: 13px; }
.product-item > .eyebrow { color: var(--primary); }
.fund-flow { display: grid; grid-template-columns: 1fr 35px 1fr; align-items: center; gap: 12px; margin: 30px 0 10px; }
.fund-flow svg { color: var(--muted-foreground); width: 24px; }
.fund-node { display: flex; flex-direction: column; gap: 4px; background: var(--muted); padding: 17px; border-radius: 4px; }
.fund-node span { font-size: 10px; color: var(--muted-foreground); }
.fund-node strong { font-size: 18px; font-weight: 500; }
.fund-result { background: var(--accent); border-left: 2px solid var(--primary); }
.fund-sources { display: grid; gap: 8px; }
.flow-caption { font-size: 10px; color: var(--muted-foreground); margin-top: 7px; }
.ai-preview { margin-top: 27px; border-top: 1px solid var(--border); padding-top: 17px; }
.ai-question { font-size: 12px; font-weight: 500; margin-bottom: 15px; display: flex; gap: 8px; }
.ai-question svg { width: 15px; color: var(--primary); }
.ai-answer { font-size: 12px; color: var(--muted-foreground); line-height: 1.8; }
.ai-answer strong { color: var(--foreground); }
.tool-tokens { display: flex; flex-wrap: wrap; gap: 10px; font-size: 9px; color: var(--spectre-teal); margin-top: 15px; }
.text-link { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; color: var(--foreground); margin-top: 25px; }
.text-link svg { width: 15px; }
.metrics-strip { display: grid; grid-template-columns: repeat(4,1fr); margin-top: 42px; }
.metrics-strip div { border-right: 1px solid var(--border); text-align: center; }
.metrics-strip div:last-child { border: 0; }
.metrics-strip strong { font: 500 36px 'Space Grotesk',sans-serif; display: block; }
.metrics-strip span { font-size: 11px; color: var(--muted-foreground); }
.workflow-band { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--muted); }
.workflow-grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 80px; align-items: center; }
.section-copy p { font-size: 14px; color: var(--muted-foreground); line-height: 1.8; margin-top: 20px; }
.workflow-steps { display: grid; gap: 0; }
.workflow-step { padding: 24px 0; border-bottom: 1px solid var(--border); display: grid; grid-template-columns: 36px 1fr; gap: 15px; }
.workflow-step:last-child { border-bottom: 0; }
.workflow-step > span { font: 500 13px 'Space Grotesk',sans-serif; color: var(--primary); padding-top: 3px; }
.workflow-step h3 { font-size: 18px; font-weight: 500; }
.workflow-step p { font-size: 12px; color: var(--muted-foreground); line-height: 1.7; margin-top: 8px; }
.market-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; }
.market-tool { margin-top: 22px; border-top: 1px solid var(--border); padding-top: 18px; }
.market-row { display: grid; grid-template-columns: 1fr 1fr 65px; align-items: center; padding: 15px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.market-row span:last-child { text-align: right; }
.market-row strong { font-weight: 500; }
.market-row svg { width: 90px; height: 25px; }
.research-label { font-size: 10px; color: var(--muted-foreground); margin-top: 15px; }
.market-title { display: flex; align-items: center; gap: 12px; }
.market-title > svg { color: var(--primary); width: 20px; }
.market-title h3 { font-size: 25px; font-weight: 500; }
.market-grid article > p { font-size: 13px; line-height: 1.7; color: var(--muted-foreground); margin-top: 12px; }
.scan-input { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 5px; padding: 6px 7px 6px 12px; background: var(--card); }
.scan-input > svg { width: 15px; color: var(--muted-foreground); }
.scan-input input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; font-size: 12px; color: var(--foreground); }
.scan-input button { font-size: 11px; }
.scanner-result { margin-top: 22px; min-height: 181px; }
.scanner-result-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
.scanner-result-head small { display: block; color: var(--muted-foreground); font-size: 10px; margin-top: 4px; }
.scanner-result .line-chart { height: 105px; }
.scanner-flags { display: flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 12px; font-size: 10px; color: var(--muted-foreground); gap: 10px; }
.scan-error { color: var(--primary); font-size: 12px; margin-top: 10px; }
.features-band { background: var(--spectre-dark); color: var(--primary-foreground); }
.features-band .eyebrow,.features-band .section-heading > p { color: var(--spectre-dark-muted); }
.feature-list { display: grid; grid-template-columns: repeat(5,1fr); gap: 34px 24px; }
.feature-list article { border-top: 1px solid var(--spectre-dark-line); padding-top: 22px; }
.feature-list svg { width: 20px; height: 20px; color: var(--primary); }
.feature-list h3 { font-size: 14px; font-weight: 500; margin-top: 16px; }
.feature-list p { font-size: 11px; line-height: 1.75; color: var(--spectre-dark-muted); margin-top: 9px; }
.connect-band { border-bottom: 1px solid var(--border); }
.connect-grid { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 70px; }
.connector-diagram { display: flex; flex-direction: column; align-items: center; gap: 20px; }
.connector-clients { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.connector-clients span { border: 1px solid var(--border); padding: 11px 16px; border-radius: 4px; font-size: 12px; background: var(--card); }
.connector-diagram > svg { width: 20px; color: var(--muted-foreground); }
.connector-hub { display: flex; gap: 10px; align-items: center; font: 600 22px 'Space Grotesk',sans-serif; }
.connector-hub img { width: 35px; }
.connector-data { display: flex; gap: 20px; font-size: 11px; color: var(--muted-foreground); }
.trust-row { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 30px; margin-top: 65px; gap: 25px; }
.trust-row h3 { font-size: 20px; font-weight: 500; }
.trust-row > div { display: flex; gap: 25px; flex-wrap: wrap; }
.trust-row span { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--muted-foreground); }
.trust-row svg { width: 15px; color: var(--spectre-teal); }
.faq-grid { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 80px; }
.faq-item { border-bottom: 1px solid var(--border); }
.spectre-page .faq-trigger { height: auto; min-height: 66px; padding: 20px 0; display: flex; width: 100%; justify-content: space-between; white-space: normal; text-align: left; border-radius: 0; font-size: 13px; font-weight: 500; background: transparent; color: var(--foreground); }
.faq-trigger svg { color: var(--muted-foreground); flex-shrink: 0; }
.faq-answer { padding-bottom: 20px; font-size: 12px; line-height: 1.85; color: var(--muted-foreground); }
.start-band { background: var(--primary); color: var(--primary-foreground); }
.start-inner { display: flex; align-items: center; justify-content: space-between; gap: 50px; padding-top: 62px; padding-bottom: 62px; }
.start-inner h2 { font-size: 40px; font-weight: 500; line-height: 1.15; }
.start-inner p { font-size: 13px; line-height: 1.7; opacity: 0.85; margin-top: 14px; max-width: 500px; }
.spectre-page .start-cta { background: var(--card); color: var(--foreground); flex-shrink: 0; }
.spectre-footer { padding: 40px 0 25px; }
.footer-top { display: flex; justify-content: space-between; gap: 25px; align-items: center; }
.footer-links { display: flex; gap: 22px; }
.footer-links a { font-size: 11px; color: var(--muted-foreground); }
.footer-bottom { display: flex; gap: 30px; justify-content: space-between; padding-top: 25px; border-top: 1px solid var(--border); margin-top: 30px; font-size: 10px; color: var(--muted-foreground); line-height: 1.7; }
.footer-bottom p { max-width: 700px; }
.risk-bars { display: grid; gap: 18px; margin-top: 15px; }
.risk-bar-row { display: grid; grid-template-columns: 105px 1fr 30px; gap: 15px; align-items: center; font-size: 11px; }
.risk-bar-row svg { width: 100%; height: 8px; }
.risk-track { fill: var(--muted); }
.fund-table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
.fund-table th { font-size: 9px; color: var(--muted-foreground); text-align: left; font-weight: 500; }
.fund-table th,.fund-table td { padding: 13px 7px; border-bottom: 1px solid var(--border); }
.fund-table td:last-child { text-align: right; font-weight: 500; }
@media (min-width:1600px) { .hero-intro { padding-top: 70px; } }
@media (max-width:1050px) { .nav-links { gap: 17px; } .workspace { grid-template-columns: 155px minmax(0,1fr); } .donut-content { flex-direction: column; gap: 8px; } .allocation-legend { width: 100%; gap: 6px; } .feature-list { grid-template-columns: repeat(3,1fr); } .workflow-grid,.connect-grid,.faq-grid { gap: 40px; } .source-names { gap: 28px; } }
@media (max-width:760px) { .spectre-container { width: calc(100% - 36px); } .spectre-nav { height: 74px; gap: 10px; } .nav-links { display: none; } .nav-actions > a:first-child { display: none; } .spectre-page .nav-actions .cta { height: 38px; padding: 0 12px; font-size: 11px; } .spectre-brand { font-size: 20px; } .spectre-brand img { width: 24px; height: 24px; } .hero-intro { padding: 42px 0 32px; } .hero-intro h1 { font-size: 39px; margin: 20px 0 17px; line-height: 1.12; } .hero-intro p { font-size: 14px; } .eyebrow { font-size: 9px; } .hero-actions { gap: 8px; } .spectre-page .cta { padding: 0 17px; font-size: 12px; } .workspace { grid-template-columns: 1fr; } .workspace-sidebar { padding: 12px; gap: 0; } .workspace-sidebar > .spectre-brand,.workspace-sidebar > small,.sidebar-bottom { display: none; } .workspace-tabs { flex-direction: row; gap: 3px; } .spectre-page .workspace-tabs button { flex: 1; justify-content: center; font-size: 10px; padding: 8px 5px; height: 34px; gap: 5px; } .workspace-tabs button svg { width: 13px; } .workspace-top { padding: 12px 15px; font-size: 9px; } .workspace-content { padding: 20px 15px; min-height: 478px; } .workspace-heading h3 { font-size: 17px; } .workspace-heading { margin-bottom: 18px; } .stats-row { gap: 10px; } .stats-row > div+div { padding-left: 10px; } .big-number { font-size: 21px; } .stat-label,.stat-detail { font-size: 8px; } .chart-columns { grid-template-columns: 1fr; gap: 22px; } .line-chart { height: 140px; } .donut-content { flex-direction: row; margin-top: 8px; gap: 22px; } .donut { width: 100px; height: 100px; } .allocation-legend { gap: 10px; } .allocation-legend li { font-size: 10px; } .workspace-insight { padding: 12px 15px; line-height: 1.6; font-size: 9px; } .source-strip { padding: 30px 0; } .source-names { gap: 18px 25px; font-size: 17px; } .section-pad { padding: 60px 0; } .section-heading { flex-direction: column; align-items: start; gap: 20px; margin-bottom: 28px; } .section-heading h2,.section-copy h2 { font-size: 31px; } .section-heading > p { font-size: 13px; } .product-grid,.workflow-grid,.market-grid,.connect-grid,.faq-grid { grid-template-columns: 1fr; gap: 28px; } .product-item { padding: 24px 20px; } .product-item h3 { font-size: 23px; } .fund-flow { gap: 7px; grid-template-columns: 1fr 20px 1fr; } .fund-node { padding: 13px 10px; } .fund-node strong { font-size: 17px; } .metrics-strip { grid-template-columns: repeat(2,1fr); gap: 25px 0; } .metrics-strip div:nth-child(2) { border: 0; } .metrics-strip strong { font-size: 30px; } .feature-list { grid-template-columns: repeat(2,1fr); gap: 30px 20px; } .feature-list h3 { font-size: 13px; } .connector-diagram { padding-top: 15px; } .connector-clients { gap: 8px; } .connector-clients span { font-size: 10px; padding: 10px 12px; } .trust-row { margin-top: 40px; align-items: start; flex-direction: column; } .trust-row > div { gap: 15px; } .start-inner { padding-top: 45px; padding-bottom: 45px; flex-direction: column; align-items: start; gap: 25px; } .start-inner h2 { font-size: 32px; } .footer-top { align-items: start; flex-direction: column; gap: 25px; } .footer-links { gap: 17px; flex-wrap: wrap; } .footer-bottom { flex-direction: column; gap: 12px; } .risk-bar-row { grid-template-columns: 95px 1fr 25px; gap: 10px; } }
@media (prefers-reduced-motion:reduce) { .spectre-page * { scroll-behavior: auto; transition: none; } }
/* Scroll reveal: gentle fade-and-rise as elements enter view. */
.reveal { opacity: 0; transform: translateY(22px); transition: opacity .7s ease, transform .7s cubic-bezier(.22,.61,.36,1); transition-delay: var(--reveal-delay, 0ms); will-change: opacity, transform; }
.reveal.is-visible { opacity: 1; transform: none; }
@media (prefers-reduced-motion:reduce) { .reveal { opacity: 1; transform: none; transition: none; } }
.tape b { color: var(--foreground); font-weight: 600; }
.tape i { font-style: normal; }
.stats-row.four { grid-template-columns: repeat(4,1fr); }
.gauge { position: relative; height: 10px; border-radius: 5px; background: var(--muted); margin: 14px 0 8px; }
.gauge-fill { height: 100%; border-radius: 5px; background: linear-gradient(90deg, var(--spectre-teal), var(--spectre-gold), var(--primary)); }
.gauge > span { position: absolute; top: -20px; transform: translateX(-50%); font-size: 10px; font-weight: 600; }
.gauge.small { flex: 1; margin: 0; height: 7px; }
.fan-outer { fill: var(--spectre-chart-fill); }
.fan-inner { fill: color-mix(in oklab, var(--primary) 18%, transparent); }
.drawdown-area { fill: var(--spectre-chart-fill); }
.monte-row { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; margin-top: 12px; }
.monte-row div { background: var(--muted); border-radius: 4px; padding: 8px; display: grid; gap: 2px; }
.monte-row span { font-size: 9px; color: var(--muted-foreground); }
.monte-row strong { font-size: 13px; font-weight: 500; }
.why-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; }
.why-item { border: 1px solid var(--border); border-radius: 8px; padding: 22px; background: var(--card); }
.why-item svg { width: 20px; height: 20px; color: var(--primary); margin-top: 10px; }
.why-num { font: 500 11px 'Space Grotesk',sans-serif; color: var(--muted-foreground); }
.why-item h3 { font-size: 15px; font-weight: 500; margin-top: 14px; }
.why-item p { font-size: 12px; line-height: 1.7; color: var(--muted-foreground); margin-top: 8px; }
.two-notes,.note-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; }
.note-grid { grid-template-columns: repeat(3,1fr); margin-top: 32px; }
.note-grid.four { grid-template-columns: repeat(4,1fr); }
.two-notes h4,.note-grid h4,.product-item h4 { font-size: 13px; font-weight: 600; }
.two-notes p,.note-grid p { font-size: 12px; line-height: 1.7; color: var(--muted-foreground); margin-top: 6px !important; }
.note-icon { width: 20px; height: 20px; color: var(--primary); margin-bottom: 12px; }
.console { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 22px; box-shadow: var(--spectre-shadow); }
.console-bar { display: flex; justify-content: space-between; font-size: 10px; text-transform: uppercase; color: var(--muted-foreground); padding-bottom: 14px; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
.driver-bars { margin-top: 10px; }
.product-item > p:not(.flow-caption) { color: var(--muted-foreground); font-size: 12px; margin-top: 8px; }
.product-item .fund-table td:first-child { width: 60px; }
.overlap { display: grid; grid-template-columns: 1fr 1.1fr; gap: 40px; align-items: center; margin-top: 22px; padding: 30px; border-radius: 8px; background: var(--accent); }
.overlap h3 { font-size: 24px; font-weight: 500; margin-top: 10px; }
.overlap p { font-size: 13px; line-height: 1.7; color: var(--muted-foreground); margin-top: 10px; }
.overlap .fund-node { background: var(--card); }
.look-chart { margin-top: 22px; border: 1px solid var(--border); border-radius: 8px; padding: 26px; background: var(--card); }
.look-row { display: grid; grid-template-columns: 140px 1fr 90px; gap: 16px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
.look-row strong { font-size: 11px; font-weight: 500; text-align: right; }
.look-bars { display: grid; gap: 4px; }
.look-bar { height: 18px; border-radius: 3px; font-size: 9px; display: flex; align-items: center; padding-left: 6px; min-width: 40px; }
.look-bar.statement { background: var(--muted); color: var(--muted-foreground); }
.look-bar.real { background: var(--primary); color: var(--primary-foreground); }
.legend-dot.muted { background: var(--muted-foreground); }
.scanner-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 22px; box-shadow: var(--spectre-shadow); }
.rsi { display: flex; align-items: center; gap: 12px; font-size: 10px; color: var(--muted-foreground); margin: 22px 0 14px; }
.scan-stats { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; }
.scan-stats div { background: var(--muted); border-radius: 4px; padding: 8px; display: grid; gap: 3px; }
.scan-stats span { font-size: 9px; color: var(--muted-foreground); }
.scan-stats strong { font-size: 11px; font-weight: 500; }
.scan-flags { display: grid; gap: 8px; margin-top: 14px; font-size: 11px; color: var(--muted-foreground); line-height: 1.6; }
.flag { font-size: 9px; padding: 2px 6px; border-radius: 3px; margin-right: 6px; color: var(--primary-foreground); }
.flag.alert { background: var(--primary); }
.flag.watch { background: var(--spectre-gold); }
.connector-hub small { font: 400 11px 'DM Sans',sans-serif; color: var(--muted-foreground); }
.feature-list.light { margin-top: 50px; }
.feature-list.light article { border-top-color: var(--border); }
.feature-list.light p { color: var(--muted-foreground); }
.research-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.market-row.two { grid-template-columns: 1fr auto; }
.steps-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; }
.steps-row h3 { font-size: 20px !important; }
.file-list { list-style: none; padding: 0; margin: 16px 0 0; display: grid; gap: 8px; }
.file-list li { display: flex; align-items: center; gap: 8px; font-size: 11px; background: var(--muted); padding: 9px 10px; border-radius: 4px; }
.file-list svg { width: 14px; color: var(--muted-foreground); }
.file-list svg:last-child { margin-left: auto; color: var(--spectre-teal); }
.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.column-chart { display: flex; align-items: end; gap: 12px; height: 140px; margin-top: 20px; }
.column-chart > div { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; font-size: 10px; }
.column-chart strong { font-weight: 500; }
.column-chart span { color: var(--muted-foreground); }
.col { width: 100%; border-radius: 3px 3px 0 0; }
.tone-bg-0 { background: var(--primary); } .tone-bg-1 { background: var(--spectre-teal); } .tone-bg-2 { background: var(--spectre-gold); } .tone-bg-3 { background: var(--spectre-blue); }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.compare > div { border: 1px solid var(--border); border-radius: 8px; padding: 28px; display: grid; gap: 14px; background: var(--card); }
.compare .ai-native { border-color: var(--primary); background: var(--accent); }
.compare h4 { font-size: 15px; font-weight: 600; }
.compare p { display: flex; gap: 10px; font-size: 13px; line-height: 1.5; }
.compare svg { width: 16px; flex-shrink: 0; }
.start-band .eyebrow { color: var(--primary-foreground); opacity: .8; }
@media (max-width:1050px) { .why-grid { grid-template-columns: repeat(2,1fr); } .stats-row.four { grid-template-columns: repeat(2,1fr); } .stats-row.four > div:nth-child(3) { border-left: 0; padding-left: 0; } }
@media (max-width:760px) { .tape { padding: 8px 18px; } .why-grid,.two-notes,.note-grid,.note-grid.four,.overlap,.research-grid,.steps-row,.dash-grid,.compare { grid-template-columns: 1fr; } .overlap { padding: 20px; gap: 20px; } .look-row { grid-template-columns: 90px 1fr 70px; gap: 8px; } .scan-stats,.monte-row { grid-template-columns: repeat(3,1fr); } .spectre-page .workspace-tabs { flex-wrap: wrap; } .spectre-page .workspace-tabs button { flex: 1 1 45%; } }
.tape { overflow: hidden; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 11px; white-space: nowrap; background: var(--card); }
.tape-track { display: flex; width: max-content; animation: tape-scroll 70s linear infinite; }
.tape:hover .tape-track { animation-play-state: paused; }
.tape-group { display: flex; gap: 28px; padding-right: 28px; }
.tape-group span { display: inline-flex; gap: 6px; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
@keyframes tape-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion:reduce) { .tape { overflow-x: auto; } .tape-track { animation: none; } }
.hero-connector { display: flex; align-items: center; justify-content: center; gap: 0; margin: 30px auto 0; max-width: 760px; }
.hc-col { display: grid; gap: 6px; min-width: 130px; }
.hc-col small { font-size: 9px; text-transform: uppercase; color: var(--muted-foreground); letter-spacing: .06em; }
.hc-col span { border: 1px solid var(--border); background: var(--card); border-radius: 4px; padding: 6px 10px; font-size: 11px; }
.hc-line { flex: 1; position: relative; min-width: 40px; display: flex; justify-content: center; }
.hc-line i { position: absolute; top: 50%; left: 0; right: 0; border-top: 1.5px dashed var(--primary); }
.hc-line em { position: relative; background: var(--background); padding: 0 6px; font-style: normal; font-size: 9px; color: var(--primary); text-transform: uppercase; }
.hc-hub { display: grid; justify-items: center; gap: 4px; background: var(--spectre-dark); color: var(--primary-foreground); border-radius: 8px; padding: 16px 18px; }
.hc-hub img { width: 30px; height: 30px; }
.hc-hub strong { font: 600 15px 'Space Grotesk',sans-serif; }
.hc-hub small { font-size: 9px; color: var(--spectre-dark-muted); }
@media (max-width:760px) { .hero-connector { flex-direction: column; } .hc-col { grid-template-columns: repeat(2,1fr); width: 100%; } .hc-col small { grid-column: 1/-1; text-align: center; } .hc-line { min-height: 28px; width: 1px; flex: none; } .hc-line i { top: 0; bottom: 0; left: 50%; right: auto; border-top: 0; border-left: 1.5px dashed var(--primary); } .hc-line em { align-self: center; } }

.hero-intro { position: relative; }
.hero-intro::before { content: ""; position: absolute; inset: -40px 10% auto; height: 420px; background: radial-gradient(closest-side, color-mix(in oklab, var(--primary) 22%, transparent), transparent); pointer-events: none; z-index: -1; }
.hero-charts { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 14px; margin-top: 44px; text-align: left; }
.hcard { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 16px; box-shadow: 0 20px 40px -24px color-mix(in oklab, var(--primary) 40%, transparent); }
.hcard-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: var(--muted-foreground); margin-bottom: 12px; }
.hcard-head strong { font-size: 13px; color: var(--foreground); }
.hcard-head strong.up { color: var(--spectre-teal, var(--primary)); font-size: 18px; }
.hline { width: 100%; height: 140px; display: block; }
.hcard-legend { display: flex; gap: 14px; font-size: 11px; color: var(--muted-foreground); margin-top: 8px; }
.hcard-legend span:last-child { margin-left: auto; font-style: italic; }
.hcard-legend i, .hlist i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }
.hdonut { width: 108px; height: 108px; border-radius: 50%; margin: 0 auto 12px; display: grid; place-items: center; }
.hdonut div { width: 70px; height: 70px; border-radius: 50%; background: var(--card); display: grid; place-items: center; font-size: 13px; font-weight: 600; }
.hlist { list-style: none; padding: 0; margin: 0; font-size: 12px; display: grid; gap: 6px; }
.hlist li { display: flex; align-items: center; color: var(--muted-foreground); }
.hlist b { margin-left: auto; color: var(--foreground); font-weight: 600; }
.hbar { font-size: 12px; color: var(--muted-foreground); margin-bottom: 12px; }
.hbar div { height: 6px; background: var(--muted); border-radius: 4px; margin-top: 6px; overflow: hidden; }
.hbar i { display: block; height: 100%; background: linear-gradient(90deg, var(--primary), color-mix(in oklab, var(--primary) 50%, var(--foreground))); border-radius: 4px; }
@media (max-width: 900px) { .hero-charts { grid-template-columns: 1fr 1fr; } .hcard-wide { grid-column: 1 / -1; } .hero-intro h1 { font-size: 48px; } }
@media (max-width: 560px) { .hero-charts { grid-template-columns: 1fr; } .hero-intro h1 { font-size: 38px; } }

.ps-grid { display: grid; grid-template-columns: 1.4fr 1fr; grid-template-rows: 220px 220px; gap: 14px; }
.ps-photo { position: relative; margin: 0; border-radius: 18px; overflow: hidden; border: 1px solid var(--border); }
.ps-tall { grid-row: span 2; }
.ps-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ps-photo figcaption { position: absolute; inset: auto 0 0; padding: 18px; background: linear-gradient(transparent, color-mix(in oklab, var(--background) 92%, transparent)); display: grid; gap: 4px; }
.ps-photo figcaption strong { font-size: 18px; }
.ps-photo figcaption span { font-size: 13px; color: var(--muted-foreground); }
.ps-charts { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; margin-top: 14px; }
.sector-bars { display: grid; gap: 10px; }
.sb-row { display: grid; grid-template-columns: 90px 1fr 40px; align-items: center; gap: 10px; font-size: 12px; color: var(--muted-foreground); }
.sb-row b { color: var(--foreground); text-align: right; }
.sb-track { display: grid; gap: 3px; }
.sb-track i { display: block; height: 6px; border-radius: 3px; }
.sb-track .you { background: var(--primary); }
.sb-track .idx { background: var(--muted-foreground); opacity: .6; }
.month-bars { display: grid; grid-template-columns: repeat(12, 1fr); gap: 6px; height: 190px; }
.mb-col { display: grid; grid-template-rows: 1fr 0.45fr auto; text-align: center; }
.mb-pos { display: flex; align-items: flex-end; border-bottom: 1px solid var(--border); }
.mb-neg { display: flex; align-items: flex-start; }
.mb-pos i, .mb-neg i { display: block; width: 100%; border-radius: 3px; }
.mb-pos i { background: var(--spectre-teal, var(--primary)); }
.mb-neg i { background: var(--primary); }
.mb-col small { font-size: 10px; color: var(--muted-foreground); margin-top: 4px; }
@media (max-width: 900px) { .ps-grid { grid-template-columns: 1fr 1fr; grid-template-rows: 260px 200px; } .ps-tall { grid-column: 1 / -1; grid-row: auto; } .ps-charts { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .ps-grid { grid-template-columns: 1fr; grid-template-rows: none; grid-auto-rows: 220px; } }

.laptop-reveal { height: 300vh; position: relative; }
.lr-sticky { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; perspective: 2000px; overflow: hidden; padding: 0 16px; }
.lr-glow { position: absolute; width: 900px; height: 600px; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in oklab, var(--primary) 35%, transparent), transparent 70%); filter: blur(40px); pointer-events: none; }
.lr-caption { display: flex; align-items: center; gap: 10px; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted-foreground); margin: 0; position: relative; }
.lr-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 0 var(--primary); animation: lr-pulse 1.8s infinite; }
@keyframes lr-pulse { 0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--primary) 70%, transparent); } 100% { box-shadow: 0 0 0 12px transparent; } }
.lr-after { font-size: 24px; font-weight: 500; text-align: center; margin: 0; position: relative; }
.laptop-stage { position: relative; width: min(880px, 86vw); transform-style: preserve-3d; will-change: transform; }
.laptop { position: relative; transform-style: preserve-3d; }
.laptop-lid { position: relative; transform-origin: center bottom; transform-style: preserve-3d; background: linear-gradient(160deg, var(--muted), var(--card)); border: 1px solid var(--border); border-radius: 18px 18px 4px 4px; padding: 2%; aspect-ratio: 16 / 10.4; box-shadow: 0 40px 100px -30px color-mix(in oklab, var(--primary) 55%, transparent), inset 0 1px 0 color-mix(in oklab, var(--foreground) 12%, transparent); will-change: transform; }
.laptop-screen { position: relative; width: 100%; height: 100%; background: var(--background); border-radius: 6px; overflow: hidden; }
.laptop-screen > img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; transform-origin: top center; will-change: transform, opacity, filter; }
.screen-boot { position: absolute; inset: 0; display: grid; place-items: center; background: var(--background); }
.screen-boot img { width: 18%; filter: drop-shadow(0 0 24px var(--primary)); }
.screen-shine { position: absolute; inset: 0; width: 40%; background: linear-gradient(100deg, transparent, color-mix(in oklab, var(--foreground) 10%, transparent), transparent); pointer-events: none; }
.laptop-base { position: relative; height: 20px; width: 114%; margin-left: -7%; background: linear-gradient(var(--muted), var(--card)); border-radius: 2px 2px 20px 20px; border: 1px solid var(--border); }
.laptop-base span { position: absolute; left: 50%; top: 0; width: 16%; height: 6px; transform: translateX(-50%); background: var(--background); border-radius: 0 0 8px 8px; opacity: .7; }
.laptop-shadow { position: absolute; left: 0; right: 0; bottom: -40px; height: 40px; background: radial-gradient(closest-side, color-mix(in oklab, var(--background) 90%, transparent), transparent); filter: blur(8px); }
.lr-chip { position: absolute; display: grid; gap: 2px; min-width: 150px; padding: 12px 16px; border-radius: 14px; background: color-mix(in oklab, var(--card) 85%, transparent); border: 1px solid var(--border); backdrop-filter: blur(12px); box-shadow: 0 20px 40px -20px color-mix(in oklab, var(--primary) 50%, transparent); will-change: transform, opacity; }
.lr-chip small { font-size: 11px; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: .08em; }
.lr-chip strong { font-size: 20px; }
.lr-chip em { font-style: normal; font-size: 12px; color: var(--spectre-teal, var(--primary)); }
@media (max-width: 760px) { .lr-chip { display: none; } .laptop-reveal { height: 220vh; } .lr-after { font-size: 17px; } }
.brand-dot { color: var(--primary); }
.spectre-brand { font-weight: 700; letter-spacing: -0.01em; }
.screen-boot > span { font-size: clamp(22px, 4vw, 44px); font-weight: 700; text-shadow: 0 0 30px color-mix(in oklab, var(--primary) 60%, transparent); }
@media (max-width: 760px) { .why-grid { grid-template-columns: 1fr; } .note-grid.four { grid-template-columns: 1fr 1fr; } }

#funds { border-top: 2px solid var(--primary); }
.fund-source-strip { display:flex; align-items:center; flex-wrap:wrap; gap:20px; padding:20px 0; border-block:1px solid var(--border); margin-bottom:20px; }
.fund-source-strip > span { display:flex; gap:8px; align-items:center; font-size:12px; color:var(--muted-foreground); }
.fund-source-strip svg { width:16px; color:var(--primary); }
.fund-source-strip > a { margin-left:auto; }
.risk-summary-table { width:100%; border-collapse:collapse; font-size:11px; text-align:left; font-variant-numeric:tabular-nums; }
.risk-summary-table th,.risk-summary-table td { padding:12px 0; border-bottom:1px solid var(--border); font-weight:400; }
.risk-summary-table thead { color:var(--muted-foreground); }
.risk-summary-table td { text-align:right; color:var(--foreground); font-weight:600; }
@media(max-width:760px){.fund-source-strip > a{margin-left:0}.fund-source-strip{gap:14px}}

/* ============================================================================
 * Innovative dark backdrop: a near-black page with a faint graph-paper grid
 * and a crimson radial glow behind the hero, both masked so they're strongest
 * at the top and fade down the page. Overlay sits behind the content via a
 * fixed ::before; .spectre-page is a stacking context and its children ride
 * above it. Placed after template.css so it wins.
 * ========================================================================== */
.spectre-page { position: relative; z-index: 0; background: var(--background); isolation: isolate; }
.spectre-page > * { position: relative; z-index: 1; }
.spectre-page::before {
  content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1180px; z-index: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 58% 46% at 50% 18%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 72%),
    linear-gradient(color-mix(in oklab, var(--foreground) 5.5%, transparent) 1px, transparent 1px) 0 0 / 56px 56px,
    linear-gradient(90deg, color-mix(in oklab, var(--foreground) 5.5%, transparent) 1px, transparent 1px) 0 0 / 56px 56px;
  -webkit-mask-image: radial-gradient(ellipse 100% 64% at 50% 12%, #000 34%, transparent 84%);
          mask-image: radial-gradient(ellipse 100% 64% at 50% 12%, #000 34%, transparent 84%);
}

/* ============================================================================
 * Phone mitigations (mobile-only, layered on top): the page's standing rule is
 * that a phone must scroll smoothly, not reveal section by section. The
 * scroll-reveal is disabled in JS at <=760px (so everything is visible at
 * rest), and the laptop section un-pins and shows statically open.
 * ========================================================================== */
@media (max-width: 760px) {
  .spectre-page .laptop-reveal { height: auto; }
  .spectre-page .lr-sticky { position: static; height: auto; min-height: 0; padding: 48px 16px 52px; gap: 18px; }
}
`;
