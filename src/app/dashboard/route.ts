import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const TRADER_EMAIL = "jwmcghee09@gmail.com";

const MYRMIDON_AI_TERMINAL = `<!-- MYRMIDON AI terminal (embeds /terminal) -->
<div id="myrm-ai" style="padding:0 2.5rem 2rem;max-width:1400px;margin:0 auto;box-sizing:border-box">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem">
    <span style="font-family:monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#ff6a52">Myrmidon — Autonomous Trading Agent</span>
    <a href="/terminal" target="_blank" style="font-family:monospace;font-size:.56rem;letter-spacing:.1em;text-transform:uppercase;color:#ff6a52;background:rgba(255,106,82,.1);border:1px solid rgba(255,106,82,.25);border-radius:5px;padding:.3rem .8rem;text-decoration:none">Open full screen ↗</a>
  </div>
  <iframe id="myrm-terminal-frame" data-src="/terminal" title="Myrmidon Terminal" style="width:100%;height:calc(100vh - 220px);min-height:540px;border:1px solid rgba(255,106,82,.25);border-radius:10px;background:#000;display:block"></iframe>
</div>
<script>(function(){
  // Lazy-load the terminal only when the AI tab is actually opened —
  // otherwise every dashboard visit paid for a full Alpaca fetch it never showed.
  var armed=false;
  function arm(){
    if(armed)return;armed=true;
    var f=document.getElementById('myrm-terminal-frame');
    if(f&&!f.src)f.src=f.getAttribute('data-src');
  }
  if(new URLSearchParams(location.search).get('tab')==='ai')arm();
  document.addEventListener('click',function(e){
    var t=e.target;
    while(t&&t!==document){
      if(t.getAttribute&&t.getAttribute('data-tab')==='ai'){arm();break;}
      t=t.parentElement;
    }
  },true);
})();</script>`;

const MYRMIDON_ANALYTICS_HTML = `<!-- MYRMIDON ANALYTICS PAGE -->
<style>
.myrm-stat-card{background:#201d1c;border:1px solid rgba(255,106,82,.22);border-radius:10px;padding:1.2rem}
.myrm-stat-label{font-family:monospace;font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,157,138,.8);margin-bottom:.4rem}
.myrm-stat-value{font-family:monospace;font-size:1.3rem;font-weight:600;color:#fff;margin-bottom:.2rem;line-height:1.2}
.myrm-stat-sub{font-family:monospace;font-size:.62rem;color:rgba(255,157,138,.65)}
.myrm-dark-card{background:#201d1c;border:1px solid rgba(255,106,82,.22);border-radius:10px;padding:1.2rem;margin-bottom:1.2rem}
.myrm-section-label{font-family:monospace;font-size:.55rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,157,138,.85);margin-bottom:.9rem;display:flex;align-items:center;gap:.5rem}
.myrm-section-label::before{content:'';display:block;width:14px;height:1px;background:linear-gradient(90deg,#ff7a30,#ff6a52);flex-shrink:0}
.myrm-table{width:100%;border-collapse:collapse;font-size:.78rem}
.myrm-table th{text-align:left;padding:.45rem .6rem;font-family:monospace;font-size:.52rem;letter-spacing:.1em;color:rgba(255,157,138,.7);font-weight:600;text-transform:uppercase;border-bottom:1px solid rgba(255,106,82,.12)}
.myrm-table td{padding:.5rem .6rem;border-bottom:1px solid rgba(255,106,82,.06);vertical-align:middle}
.myrm-table tr:last-child td{border-bottom:none}
.myrm-table tr:hover td{background:rgba(255,106,82,.04)}
.myrm-pos{color:#4ade80}.myrm-neg{color:#f87171}.myrm-amb{color:#ff6a52}.myrm-ora{color:#ff7a30}.myrm-cyn{color:#5fb8ff}
/* macro ticker */
.myrm-macro-bar{display:flex;flex-wrap:wrap;gap:0;border:1px solid rgba(255,106,82,.15);border-radius:10px;overflow:hidden;margin-bottom:1rem;background:rgba(10,10,18,.8)}
.myrm-mkt{display:flex;align-items:center;gap:.5rem;padding:.6rem 1rem;border-right:1px solid rgba(255,106,82,.1);flex:1;min-width:90px}
.myrm-mkt:last-child{border-right:none}
.myrm-mkt-sym{font-family:monospace;font-size:.52rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,106,82,.45)}
.myrm-mkt-val{font-family:monospace;font-size:.82rem;font-weight:600;color:#fff}
.myrm-mkt-chg{font-family:monospace;font-size:.6rem}
/* risk signals */
.myrm-risk-bar{display:flex;flex-wrap:wrap;gap:.4rem;padding:.75rem 1rem;border:1px solid rgba(255,106,82,.22);border-radius:10px;margin-bottom:1rem;background:#201d1c;align-items:center}
.myrm-risk-lbl{font-family:monospace;font-size:.52rem;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,157,138,.6);flex-shrink:0;margin-right:.2rem}
.myrm-sig{font-family:monospace;font-size:.6rem;padding:.2rem .7rem;border-radius:3px;border:1px solid;white-space:nowrap}
.myrm-sig-ok{color:#4ade80;border-color:rgba(74,222,128,.35);background:rgba(74,222,128,.1)}
.myrm-sig-amb{color:#ff7a30;border-color:rgba(255,122,48,.3);background:rgba(255,122,48,.06)}
.myrm-sig-red{color:#f87171;border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.06);font-weight:700}
</style>
<div class="wrap" data-page="analytics">
  <section class="sec">
    <div style="padding:.5rem 0 1.5rem;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:.8rem">
      <div>
        <div style="font-family:monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:#ff6a52;margin-bottom:.4rem">Myrmidon · Alpaca Paper Trading</div>
        <h2 style="font-family:var(--disp);font-size:clamp(1.6rem,3vw,2.6rem);margin:0;background:linear-gradient(120deg,#ff3f34 0%,#ff7a30 35%,#ff7a30 72%,#ffb347 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">Analytics</h2>
        <div id="myrm-api-status" style="font-family:monospace;font-size:.58rem;color:#ff7a30;margin-top:.4rem;min-height:1em">⚙ Initialising…</div>
      </div>
      <div style="display:flex;align-items:center;gap:.6rem">
        <span id="myrm-mkt-status" style="font-family:monospace;font-size:.58rem;letter-spacing:.08em;color:#b0a8a1">—</span>
        <button onclick="window.myrmRefreshAnalytics&&window.myrmRefreshAnalytics()" style="font-family:monospace;font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;color:#ff6a52;background:rgba(255,106,82,.1);border:1px solid rgba(255,106,82,.25);border-radius:6px;padding:.3rem .8rem;cursor:pointer">↺ Refresh</button>
      </div>
    </div>

    <!-- Ticker search (macro ticker removed — duplicated the scrolling nav tape) -->
    <div class="myrm-dark-card" style="margin-bottom:1rem">
      <div class="myrm-section-label">Ticker Search — any US symbol</div>
      <form onsubmit="myrmTickerSearch(event)" style="display:flex;gap:.6rem;margin-bottom:.4rem">
        <input id="myrm-ticker-input" placeholder="e.g. NVDA, TSLA, SPY…" autocomplete="off"
          style="flex:1;max-width:280px;background:rgba(255,255,255,.05);border:1px solid rgba(255,106,82,.25);border-radius:6px;color:#fff;font-family:monospace;font-size:.85rem;letter-spacing:.06em;text-transform:uppercase;padding:.5rem .8rem;outline:none" />
        <button type="submit" id="myrm-ticker-btn" style="font-family:monospace;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:#ff6a52;background:rgba(255,106,82,.12);border:1px solid rgba(255,106,82,.3);border-radius:6px;padding:.5rem 1.1rem;cursor:pointer">Search</button>
      </form>
      <div id="myrm-ticker-result"><span style="font-family:monospace;font-size:.62rem;color:rgba(255,106,82,.4)">Search a ticker for a 90-day chart, live stats, RSI and trend read.</span></div>
    </div>

    <!-- Risk signals -->
    <div class="myrm-risk-bar">
      <span class="myrm-risk-lbl">Risk</span>
      <div id="myrm-risk-sigs"><span class="myrm-sig myrm-sig-amb">Scanning…</span></div>
    </div>

    <!-- Metrics grid -->
    <div id="myrm-metrics-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:.8rem;margin-bottom:1.2rem">
      <div class="myrm-stat-card"><div class="myrm-stat-label">Portfolio Equity</div><div class="myrm-stat-value" style="color:rgba(255,106,82,.4)">Loading…</div></div>
    </div>

    <!-- Equity curve -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">30-Day Equity Curve</div>
      <svg id="myrm-equity-chart" style="width:100%;height:180px;display:block" preserveAspectRatio="none">
        <text x="50%" y="50%" text-anchor="middle" fill="rgba(255,106,82,.35)" font-size="11" font-family="monospace">Loading…</text>
      </svg>
    </div>

    <!-- Positions: Core -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">Core · Index Sleeve <span id="myrm-core-pct" style="color:rgba(255,106,82,.4);font-weight:normal;margin-left:.5rem"></span></div>
      <div style="overflow-x:auto">
        <table class="myrm-table">
          <thead><tr>
            <th>Symbol</th><th style="text-align:right">Qty</th><th style="text-align:right">Price $</th>
            <th style="text-align:right">Mkt Value A$</th><th style="text-align:right">Day %</th>
            <th style="text-align:right">Day P&amp;L A$</th><th style="text-align:right">Total P&amp;L A$</th>
          </tr></thead>
          <tbody id="myrm-core-tbody"><tr><td colspan="7" style="text-align:center;color:rgba(255,106,82,.35);padding:1rem;font-family:monospace;font-size:.7rem">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Positions: Alpha -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label" style="color:#4ade80">Alpha · Satellite Sleeve <span id="myrm-alpha-pct" style="color:rgba(74,222,128,.4);font-weight:normal;margin-left:.5rem"></span></div>
      <div style="overflow-x:auto">
        <table class="myrm-table">
          <thead><tr>
            <th>Symbol</th><th style="text-align:right">Qty</th><th style="text-align:right">Price $</th>
            <th style="text-align:right">Mkt Value A$</th><th style="text-align:right">Day %</th>
            <th style="text-align:right">Day P&amp;L A$</th><th style="text-align:right">Total P&amp;L A$</th>
          </tr></thead>
          <tbody id="myrm-alpha-tbody"><tr><td colspan="7" style="text-align:center;color:rgba(255,106,82,.35);padding:1rem;font-family:monospace;font-size:.7rem">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Open orders -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">Open Orders</div>
      <div style="overflow-x:auto">
        <table class="myrm-table">
          <thead><tr>
            <th>Symbol</th><th>Side</th><th style="text-align:right">Qty</th>
            <th>Type</th><th>Status</th><th style="text-align:right">Submitted</th>
          </tr></thead>
          <tbody id="myrm-orders-tbody"><tr><td colspan="6" style="text-align:center;color:rgba(255,106,82,.35);padding:1rem;font-family:monospace;font-size:.7rem">Loading…</td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- Trade history -->
    <div class="myrm-dark-card">
      <div class="myrm-section-label">Recent Filled Trades</div>
      <div style="overflow-x:auto">
        <table class="myrm-table">
          <thead><tr>
            <th>Symbol</th><th>Side</th><th style="text-align:right">Qty</th>
            <th style="text-align:right">Fill Price $</th><th style="text-align:right">Total (A$)</th>
            <th style="text-align:right">Total (USD)</th><th style="text-align:right">Date</th>
          </tr></thead>
          <tbody id="myrm-trades-tbody">
            <tr><td colspan="7" style="text-align:center;color:rgba(255,106,82,.35);padding:1.5rem;font-family:monospace;font-size:.7rem">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</div>`;

// Myrmidon analytics client logic lives in public/js/myrmidon-analytics.js so
// tooling can syntax-check it; only the tiny dynamic bits below stay inline.
const MYRMIDON_ANALYTICS_SCRIPT = `<script src="/js/myrmidon-analytics.js"></script>`;


interface MqData { price: number; prev: number; change: number; changePct: number; }

async function dashYahooQuote(symbol: string): Promise<MqData | null> {
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }> } };
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.previousClose ?? meta.chartPreviousClose ?? price;
    return { price, prev, change: price - prev, changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0 };
  } catch { return null; }
}

async function fetchTraderAnalytics(): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  try {
    const h = { "APCA-API-KEY-ID": apiKey, "APCA-API-SECRET-KEY": apiSecret };
    const BASE = "https://paper-api.alpaca.markets/v2";
    const af = (url: string) => fetch(url, { headers: h, cache: "no-store", signal: AbortSignal.timeout(20000) });
    const [histRes, ordersRes, acctRes, posRes, openOrdRes] = await Promise.all([
      af(`${BASE}/account/portfolio/history?period=1M&timeframe=1D`),
      af(`${BASE}/orders?status=closed&limit=200&direction=desc`),
      af(`${BASE}/account`),
      af(`${BASE}/positions`),
      af(`${BASE}/orders?status=open&limit=20`),
    ]);
    if (!acctRes.ok) return null;
    const [history, orders, account, positions, openOrders] = await Promise.all([
      histRes.ok ? histRes.json() : null,
      ordersRes.ok ? ordersRes.json() : [],
      acctRes.json(),
      posRes.ok ? posRes.json() : [],
      openOrdRes.ok ? openOrdRes.json() : [],
    ]);
    const macro = await Promise.all(["AUDUSD=X", "^VIX", "^GSPC", "^IXIC", "^TNX", "GC=F", "CL=F", "BTC-USD"].map(dashYahooQuote));
    const [audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc] = macro;
    return { history, orders, account, positions, openOrders, audUsdRate: audUsd?.price ?? null, macro: { audUsd, vix, spx, nasdaq, treasury10y, gold, oil, btc } };
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const isDemo = request.nextUrl.searchParams.get("demo") === "1";
  let isTrader = false;

  if (!isDemo) {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.redirect(buildRedirectUrl(request, "/signin"));
    }
    isTrader = user.email === TRADER_EMAIL;
  }

  let html = await fs.readFile(path.join(process.cwd(), "public", "spectre-dashboard-v3.html"), "utf8");

  if (isTrader) {
    html = html.replace("<head>", "<head><!-- MYRM_DEBUG:trader=true -->");
    // Inject Myrmidon terminal inside #dashboard-top (which has data-page="ai"),
    // and hide the original Ask AI widget. switchTab('ai') shows #dashboard-top
    // and everything inside it, so the terminal appears with no extra JS needed.
    // NOTE: replacement callbacks everywhere dynamic content is injected —
    // a plain replacement string treats $', $&, $` etc. as special patterns,
    // which silently corrupted any injected script containing '$' + '...'.
    html = html.replace(
      '  <div class="ai-page-layout">',
      () => MYRMIDON_AI_TERMINAL + '\n  <div class="ai-page-layout" style="display:none">',
    );
    // Rebrand all visible SPECTRE text to Myrmidon for the trader account.
    html = html.replace("<title>SPECTRE — Dashboard</title>", "<title>Myrmidon — Trading Terminal</title>");
    html = html.replace('<span class="boot-label">SPECTRE</span>', '<span class="boot-label">Myrmidon</span>');
    html = html.replace('id="nav-dashboard-logo">SPECTRE</a>', 'id="nav-dashboard-logo">Myrmidon</a>');
    html = html.replace('<div class="hero-brand">SPECTRE</div>', '<div class="hero-brand">Myrmidon</div>');
    html = html.replace('<span class="foot-logo">SPECTRE</span>', '<span class="foot-logo">Myrmidon</span>');
    // Add Analytics nav tab.
    html = html.replace(
      '<button type="button" class="nav-tab" data-tab="research">Research</button>',
      '<button type="button" class="nav-tab" data-tab="research">Research</button>\n      <button type="button" class="nav-tab" data-tab="analytics">Analytics</button>',
    );
    // Inject analytics page content after the research section.
    html = html.replace("<!-- UPLOADS (moved to quant tab) -->", () => MYRMIDON_ANALYTICS_HTML + "\n<!-- UPLOADS (moved to quant tab) -->");
    // Server-side preload: fetch analytics data now so the page renders instantly.
    // Hard 4.5s cap — a slow Alpaca/Yahoo must never stall the whole dashboard;
    // the client falls back to fetching /api/trading/analytics itself.
    const hasKey = !!process.env.ALPACA_API_KEY;
    const hasSec = !!process.env.ALPACA_API_SECRET;
    const preload = await Promise.race([
      fetchTraderAnalytics(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 4500)),
    ]);
    const preloadScript = preload
      ? `<script>window.__MYRM_PRELOAD=${JSON.stringify(preload).replace(/<\/script>/gi, "<\\/script>")};</script>`
      : "";
    // Inject server-side status immediately (no JS async needed — text set synchronously).
    let srvStatus: string;
    if (!hasKey || !hasSec) {
      srvStatus = `SERVER: ALPACA_API_KEY ${hasKey ? "OK" : "MISSING"} | ALPACA_API_SECRET ${hasSec ? "OK" : "MISSING"} — add in Render → Environment`;
    } else if (preload) {
      srvStatus = `SERVER: keys OK, preloaded ${preload.account ? "account data" : "but account null — check key validity"}`;
    } else {
      srvStatus = `SERVER: preload skipped (slow upstream) — loading live in browser…`;
    }
    const srvStatusScript = `<script>(function(){var e=document.getElementById('myrm-api-status');if(e)e.textContent=${JSON.stringify(srvStatus)};})();</script>`;
    html = html.replace("</body>", () => preloadScript + "\n" + srvStatusScript + "\n" + MYRMIDON_ANALYTICS_SCRIPT + "\n</body>");
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function buildRedirectUrl(request: NextRequest, pathname: string): URL {
  return new URL(pathname, resolvePublicBaseUrl(request));
}

function resolvePublicBaseUrl(request: NextRequest): string {
  const configured = normalizeBaseUrl(process.env.APP_BASE_URL || "") || normalizeBaseUrl(process.env.RENDER_EXTERNAL_URL || "");
  if (configured) {
    return configured;
  }

  const forwardedHost = (request.headers.get("x-forwarded-host") || "").trim();
  if (forwardedHost) {
    const forwardedProto = (request.headers.get("x-forwarded-proto") || "https").trim() || "https";
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    return "";
  }

  return "";
}
