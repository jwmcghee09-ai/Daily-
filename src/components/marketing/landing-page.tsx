"use client";

/**
 * SPECTRE landing page — a faithful port of the Lovable prototype
 * (spectre-asset-flow-studio / src/routes/index.tsx), rebuilt for this Next.js
 * app. The markup, copy, data and visuals are the Lovable design verbatim; only
 * the wiring at the edges is the real app's — the nav/CTA links point at the
 * real /signin, /dashboard demo and /research routes, so the working MCP
 * connector, auth and dashboard stay intact behind this page.
 *
 * Styling is the Lovable template.css, injected at runtime via <style> exactly
 * as the prototype did (see ./spectre-template-css), scoped under .spectre-page.
 *
 * Phone note: the page's standing rule is that a phone scrolls smoothly, not
 * section by section — so the scroll-reveal is disabled at <=760px and the
 * laptop section un-pins and shows statically open (the rest is the exact
 * Lovable layout, which is already responsive).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, ArrowDown, BarChart3, Brain, Check, ChevronDown, Database, Download, Eye, FileSpreadsheet,
  Layers, Lock, Newspaper, PieChart, Plug, Search, Server, ShieldCheck, Sparkles, Target,
  Trash2, TrendingUp, Wallet, X,
} from "lucide-react";
import { SPECTRE_TEMPLATE_CSS } from "./spectre-template-css";

// Real-app routes the Lovable links map onto.
const REGISTER = "/signin?mode=register&plan=free";
const SIGNIN = "/signin";
const DEMO = "/dashboard?demo=1";
const RESEARCH = "/research";

const DASH_PREVIEW = "/spectre-dashboard-preview.jpg";
const PHOTO_INVESTOR = "/spectre-photo-investor.jpg";
const PHOTO_SYDNEY = "/spectre-photo-sydney.jpg";
const PHOTO_CHART = "/spectre-photo-chart.jpg";

const PERF = [100, 101.2, 100.6, 102.4, 103.1, 102.2, 104.6, 105.3, 104.1, 106.8, 107.9, 107.2, 109.4, 110.6, 109.8, 112.3];
const BENCH = [100, 100.4, 100.1, 101.0, 101.6, 101.1, 102.3, 102.7, 102.0, 103.4, 103.9, 103.5, 104.6, 105.2, 104.8, 106.0];
function heroPath(d: number[], w: number, h: number) {
  const min = 99, max = 113;
  return d.map((v, i) => `${i ? "L" : "M"}${(i / (d.length - 1)) * w},${h - ((v - min) / (max - min)) * h}`).join(" ");
}
function HeroCharts() {
  const alloc: [string, number, string][] = [["ASX shares", 38, "var(--primary)"], ["Global ETFs", 27, "var(--spectre-teal, var(--chart-2))"], ["Super", 22, "var(--chart-3)"], ["Crypto & bullion", 13, "var(--chart-4)"]];
  let acc = 0;
  const stops = alloc.map(([, v, c]) => { const a = acc; acc += v; return `${c} ${a}% ${acc}%`; }).join(", ");
  return (
    <div className="hero-charts" aria-label="Illustrative portfolio snapshot">
      <div className="hcard hcard-wide">
        <div className="hcard-head"><span>Portfolio vs ASX 200</span><strong className="up">+12.3%</strong></div>
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="hline">
          <defs><linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--primary)" stopOpacity=".35" /><stop offset="1" stopColor="var(--primary)" stopOpacity="0" /></linearGradient></defs>
          <path d={`${heroPath(PERF, 400, 120)} L400,120 L0,120 Z`} fill="url(#hg)" />
          <path d={heroPath(BENCH, 400, 120)} fill="none" stroke="var(--muted-foreground)" strokeWidth="1.5" strokeDasharray="4 4" />
          <path d={heroPath(PERF, 400, 120)} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
        </svg>
        <div className="hcard-legend"><span><i style={{ background: "var(--primary)" }} />Your book</span><span><i style={{ background: "var(--muted-foreground)" }} />ASX 200</span><span>Sample data</span></div>
      </div>
      <div className="hcard">
        <div className="hcard-head"><span>Allocation</span><strong>4 sources</strong></div>
        <div className="hdonut" style={{ background: `conic-gradient(${stops})` }}><div>100%</div></div>
        <ul className="hlist">{alloc.map(([n, v, c]) => <li key={n}><i style={{ background: c }} />{n}<b>{v}%</b></li>)}</ul>
      </div>
      <div className="hcard">
        <div className="hcard-head"><span>Risk signals</span><strong>Sample data</strong></div>
        <table className="risk-summary-table"><thead><tr><th>Signal</th><th>Value</th></tr></thead><tbody>{[["1-day VaR (95%)", "−1.3%"], ["Beta vs ASX 200", "1.18"], ["Max drawdown", "−12.1%"], ["Top-10 concentration", "57%"]].map(([n, v]) => <tr key={n}><th scope="row">{n}</th><td>{v}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}

function LaptopReveal() {
  const [p, setP] = useState(0);
  useEffect(() => {
    // Phones and reduced-motion get the laptop statically open (the section is
    // un-pinned in CSS at <=760px) so the page scrolls smoothly.
    const still =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 760px)").matches;
    const el = document.getElementById("laptop-reveal");
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (still) { setP(1); return; }
        if (!el) return;
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight;
        setP(Math.min(1, Math.max(0, -r.top / (total * 0.8))));
      });
    };
    onScroll();
    if (still) return () => cancelAnimationFrame(raf);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  const open = ease(p / 0.6);
  const settle = ease((p - 0.35) / 0.5);
  const chips = ease((p - 0.65) / 0.35);
  const lid = -100 + open * 100;
  const tiltX = 28 - settle * 28;
  const tiltY = -18 + settle * 18;
  const scale = 0.7 + settle * 0.32;
  const chipData: [string, string, string, number, number][] = [
    ["Portfolio value", "$314,320", "+11.1%", -1, -0.6],
    ["Risk score", "11 / 100", "Controlled", 1, -0.4],
    ["1-day VaR", "$4.2k", "95% conf.", -1, 0.55],
    ["AI connected", "Claude", "10 tools", 1, 0.5],
  ];
  return (
    <section id="laptop-reveal" className="laptop-reveal" aria-label="SPECTRE dashboard on a laptop">
      <div className="lr-sticky">
        <div className="lr-glow" style={{ opacity: open * 0.9, transform: `scale(${0.6 + open * 0.6})` }} />
        <p className="lr-caption" style={{ opacity: 1 - open * 1.4, transform: `translateY(${-open * 30}px)` }}><span className="lr-dot" />Scroll to open your SPECTRE dashboard</p>
        <div className="laptop-stage" style={{ transform: `scale(${scale}) rotateX(${tiltX}deg) rotateY(${tiltY}deg)` }}>
          <div className="laptop">
            <div className="laptop-lid" style={{ transform: `rotateX(${lid}deg)` }}>
              <div className="laptop-screen">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={DASH_PREVIEW} alt="SPECTRE portfolio dashboard with metrics, history and allocation" width={1440} height={900} loading="lazy"
                  style={{ opacity: ease((p - 0.2) / 0.35), transform: `scale(${1.15 - settle * 0.15})`, filter: `blur(${(1 - ease((p - 0.2) / 0.35)) * 8}px)` }} />
                <div className="screen-boot" style={{ opacity: 1 - ease((p - 0.15) / 0.3) }}><span>SPECTRE<span className="brand-dot">.</span></span></div>
                <div className="screen-shine" style={{ transform: `translateX(${-120 + settle * 260}%)` }} />
              </div>
            </div>
            <div className="laptop-base"><span /></div>
            <div className="laptop-shadow" style={{ opacity: 0.4 + open * 0.6 }} />
          </div>
          {chipData.map(([l, v, sub, sx, sy], i) => (
            <div key={l} className="lr-chip" style={{
              left: sx < 0 ? "-6%" : "auto", right: sx > 0 ? "-6%" : "auto", top: `${50 + sy * 60}%`,
              opacity: ease((chips - i * 0.12) / 0.6),
              transform: `translate(${(1 - ease((chips - i * 0.12) / 0.6)) * sx * 80}px, -50%) translateZ(60px)`,
            }}><small>{l}</small><strong>{v}</strong><em>{sub}</em></div>
          ))}
        </div>
        <p className="lr-after" style={{ opacity: chips, transform: `translateY(${(1 - chips) * 24}px)` }}>Your whole book, risk and research in one dashboard.</p>
      </div>
    </section>
  );
}

function PhotoStory() {
  const sectors: [string, number, number][] = [["Financials", 31, 24], ["Materials", 19, 22], ["Tech", 17, 9], ["Healthcare", 11, 10], ["Energy", 8, 6], ["Consumer", 7, 12], ["Other", 7, 17]];
  const months = [2.1, -0.8, 1.6, 3.2, -1.4, 2.7, 0.9, 1.8, -0.5, 2.4, 1.1, 3.0];
  return (
    <section className="section-pad spectre-container photo-story">
      <div className="ps-grid">
        {/* eslint-disable @next/next/no-img-element */}
        <figure className="ps-photo ps-tall"><img src={PHOTO_INVESTOR} alt="Investor reviewing portfolio charts on a laptop at night" width={1200} height={800} loading="lazy" />
          <figcaption><strong>Ask at midnight.</strong><span>Your AI answers from your live book, not a guess.</span></figcaption></figure>
        <figure className="ps-photo"><img src={PHOTO_SYDNEY} alt="Sydney skyline and Harbour Bridge at dusk" width={1200} height={800} loading="lazy" />
          <figcaption><strong>Built for Australia.</strong><span>ASX, super funds, franking and AUD first.</span></figcaption></figure>
        <figure className="ps-photo"><img src={PHOTO_CHART} alt="Close-up of candlestick chart on a trading screen" width={1200} height={800} loading="lazy" />
          <figcaption><strong>Numbers computed in code.</strong><span>VaR, beta and drawdown you can trust.</span></figcaption></figure>
        {/* eslint-enable @next/next/no-img-element */}
      </div>
      <div className="ps-charts">
        <div className="hcard">
          <div className="hcard-head"><span>Sector exposure: you vs ASX 200</span><strong>Look-through</strong></div>
          <div className="sector-bars">{sectors.map(([n, a, b]) => (
            <div key={n} className="sb-row"><span>{n}</span><div className="sb-track"><i className="you" style={{ width: `${a * 2.6}%` }} /><i className="idx" style={{ width: `${b * 2.6}%` }} /></div><b>{a}%</b></div>
          ))}</div>
          <div className="hcard-legend"><span><i style={{ background: "var(--primary)" }} />Your book</span><span><i style={{ background: "var(--muted-foreground)" }} />ASX 200</span><span>Sample data</span></div>
        </div>
        <div className="hcard">
          <div className="hcard-head"><span>Monthly returns</span><strong className="up">+16.1% YTD</strong></div>
          <div className="month-bars">{months.map((v, i) => (
            <div key={i} className="mb-col"><div className="mb-pos">{v > 0 && <i style={{ height: `${v * 28}%` }} />}</div><div className="mb-neg">{v < 0 && <i style={{ height: `${-v * 28}%` }} />}</div><small>{"JFMAMJJASOND"[i]}</small></div>
          ))}</div>
          <div className="hcard-legend"><span>Last 12 months</span><span>Sample data</span></div>
        </div>
      </div>
    </section>
  );
}

const TAPE: [string, string, string][] = [
  ["BHP", "45.82", "+1.2%"], ["CBA", "131.44", "+0.4%"], ["IVV", "68.31", "-0.3%"], ["AUD/USD", "0.629", "+0.2%"],
  ["GOLD", "3,112", "+0.8%"], ["WTI", "69.86", "-1.9%"], ["BTC", "84.2k", "-1.8%"], ["ETH", "3,140", "+0.6%"],
  ["CSL", "288.10", "+0.7%"], ["MQG", "218.75", "+1.4%"], ["VAS", "104.60", "+0.6%"], ["FMG", "18.44", "-2.1%"], ["VIX", "21.4", "-6.1%"],
  ["NAB", "38.12", "+0.5%"], ["WBC", "32.40", "+0.3%"], ["ANZ", "29.85", "-0.4%"], ["WES", "74.90", "+0.9%"], ["WOW", "31.22", "-0.6%"],
  ["RIO", "118.30", "+1.1%"], ["WDS", "23.70", "-1.3%"], ["TLS", "4.02", "+0.2%"], ["PLS", "3.42", "+6.8%"], ["XRO", "172.50", "+1.8%"],
  ["NVDA", "142.10", "+2.3%"], ["AAPL", "228.40", "+0.4%"], ["MSFT", "421.90", "-0.2%"],
];

type Quote = { t: string; base: number; dec: number; pct: number; k: boolean };
const BASE: Quote[] = TAPE.map(([t, p, c]) => {
  const k = p.endsWith("k");
  const n = parseFloat(p.replace(/[,k]/g, ""));
  return { t, base: n, dec: k ? 1 : (p.split(".")[1]?.length ?? 0), pct: parseFloat(c), k };
});

function fmt(q: Quote, v: number) {
  const s = v.toLocaleString("en-AU", { minimumFractionDigits: q.dec, maximumFractionDigits: q.dec });
  return q.k ? `${s}k` : s;
}

function Tape() {
  const [quotes, setQuotes] = useState(BASE.map((q) => ({ ...q, price: q.base })));
  useEffect(() => {
    const id = setInterval(() => {
      setQuotes((qs) => qs.map((q) => {
        if (Math.random() > 0.35) return q;
        const move = (Math.random() - 0.5) * 0.004;
        const price = q.price * (1 + move);
        return { ...q, price, pct: q.pct + move * 100 };
      }));
    }, 2500);
    return () => clearInterval(id);
  }, []);
  const items = quotes.map((q) => (
    <span key={q.t}><b>{q.t}</b>{fmt(q, q.price)}<i className={q.pct < 0 ? "negative" : "positive"}>{q.pct >= 0 ? "+" : ""}{q.pct.toFixed(1)}%</i></span>
  ));
  return (
    <div className="tape" aria-label="Daily market ticker">
      <div className="tape-track">
        <div className="tape-group">{items}</div>
        <div className="tape-group" aria-hidden="true">{items}</div>
      </div>
    </div>
  );
}

const SOURCE_MIX = [{ name: "ASX Equities", v: 32 }, { name: "Super", v: 28 }, { name: "Funds / ETFs", v: 16 }, { name: "Crypto + Bullion", v: 24 }];
const QUANT = [{ name: "Quant Signals", v: 82 }, { name: "Expected Shortfall", v: 74 }, { name: "Tracking Error", v: 58 }, { name: "Beta vs ASX 200", v: 63 }, { name: "Data Quality", v: 91 }];
const MONTE = [["P90", "$1.62M", 1.62], ["P75", "$1.49M", 1.49], ["P50", "$1.36M", 1.36], ["P25", "$1.22M", 1.22], ["P10", "$1.08M", 1.08]] as const;
const DRAWDOWN = [0, -2, -1, -4, -6, -3, -7, -11, -8, -5, -6, -3, -2];

const IVV = [["NVDA", "NVIDIA", "7.6%", "$2,180"], ["AAPL", "Apple", "6.6%", "$1,894"], ["MSFT", "Microsoft", "6.2%", "$1,779"], ["AMZN", "Amazon", "4.0%", "$1,148"], ["META", "Meta Platforms", "2.7%", "$775"]];
const VAS = [["CBA", "Commonwealth Bank", "9.8%", "$974"], ["BHP", "BHP Group", "8.4%", "$835"], ["CSL", "CSL Limited", "5.6%", "$556"], ["NAB", "National Australia Bank", "4.9%", "$487"], ["WBC", "Westpac", "4.4%", "$437"]];
const LOOK = [{ name: "CBA", statement: 5.0, real: 5.3 }, { name: "Australian banks", statement: 11.4, real: 16.2 }, { name: "US mega-cap tech", statement: 6.1, real: 13.8 }];

const SCAN: Record<string, { name: string; price: string; chg: string; rsi: number; low: string; high: string; m30: string; vol: string; atr: string; trend: string; series: number[] }> = {
  PLS: { name: "Pilbara Minerals", price: "3.42 AUD", chg: "+6.8%", rsi: 71, low: "$2.41", high: "$3.53", m30: "+18.4%", vol: "3.2× avg", atr: "4.1%", trend: "Rising", series: [2.6, 2.5, 2.7, 2.8, 2.75, 3.0, 3.1, 3.2, 3.42] },
  BHP: { name: "BHP Group", price: "45.82 AUD", chg: "+1.2%", rsi: 56, low: "$38.90", high: "$47.10", m30: "+3.1%", vol: "1.1× avg", atr: "1.8%", trend: "Rising", series: [42, 43, 42.5, 44, 43.8, 44.9, 45.2, 45.82] },
  CBA: { name: "Commonwealth Bank", price: "131.44 AUD", chg: "+0.4%", rsi: 62, low: "$108.20", high: "$134.00", m30: "+2.4%", vol: "0.9× avg", atr: "1.2%", trend: "Rising", series: [125, 127, 126, 129, 128, 130, 131.44] },
  FMG: { name: "Fortescue", price: "18.44 AUD", chg: "-2.1%", rsi: 34, low: "$17.10", high: "$26.80", m30: "-9.6%", vol: "1.7× avg", atr: "3.2%", trend: "Falling", series: [21, 20.4, 20.8, 19.9, 19.2, 18.9, 18.44] },
  CSL: { name: "CSL Limited", price: "288.10 AUD", chg: "+0.7%", rsi: 52, low: "$262.00", high: "$312.40", m30: "+1.0%", vol: "1.0× avg", atr: "1.4%", trend: "Flat", series: [284, 286, 283, 287, 285, 288.1] },
};

const FAQS = [
  ["What file formats does SPECTRE accept?", "CSV and XLSX exports from Australian brokers, super funds, crypto exchanges and bullion dealers. If your platform exports a spreadsheet, SPECTRE can likely normalize it."],
  ["Is my financial data safe?", "Modern password hashing, HTTPS with CSP and HSTS, encrypted backups — and your portfolio data is never sold or shared. Third-party analytics run on the marketing pages only: they see page views, never holdings."],
  ["Can SPECTRE see inside my ETFs and managed funds?", "Usually. US-registered funds resolve in full from SEC N-PORT filings, ASX feeders like IVV resolve through the US fund they hold, and Betashares publishes full daily files. Vanguard Australia and VanEck publish only their largest positions, so those resolve partway and SPECTRE shows how much it accounted for. Anything else, upload the fund's holdings file."],
  ["What is the SPECTRE risk score?", "A 0 to 100 portfolio health signal built from concentration, drawdown, VaR and Expected Shortfall, benchmark sensitivity, volatility and data-quality confidence."],
  ["How much does it cost?", "Nothing. While SPECTRE grows, every account gets the entire product free — the full research terminal, all pro analytics, dip alerts and our strongest AI model. Just an email address to start."],
];

function path(vals: number[], w: number, h: number, pad = 12) {
  const min = Math.min(...vals), max = Math.max(...vals), r = max - min || 1;
  return vals.map((v, i) => `${i ? "L" : "M"}${(i / (vals.length - 1)) * w},${h - pad - ((v - min) / r) * (h - pad * 2)}`).join(" ");
}

function Donut({ data, center, caption }: { data: { name: string; v: number }[]; center: string; caption: string }) {
  const C = 2 * Math.PI * 38;
  const segs = data.map((d, i) => {
    const len = (d.v / 100) * C;
    const start = data.slice(0, i).reduce((s, x) => s + (x.v / 100) * C, 0);
    return { name: d.name, len, start };
  });
  return (
    <svg className="donut" viewBox="0 0 100 100" role="img" aria-label={caption}>
      {segs.map((seg, i) => (
        <circle key={seg.name} className={`tone-${i % 4}`} cx="50" cy="50" r="38" fill="none" strokeWidth="11" strokeDasharray={`${seg.len - 1} ${C}`} strokeDashoffset={-seg.start} transform="rotate(-90 50 50)" />
      ))}
      <text className="donut-number" x="50" y="52" textAnchor="middle">{center}</text>
      <text className="donut-caption" x="50" y="63" textAnchor="middle">{caption}</text>
    </svg>
  );
}

function Bars({ data }: { data: { name: string; v: number }[] }) {
  return (
    <div className="risk-bars">
      {data.map((r, i) => (
        <div className="risk-bar-row" key={r.name}>
          <span>{r.name}</span>
          <svg viewBox="0 0 100 8" preserveAspectRatio="none"><rect className="risk-track" width="100" height="8" rx="4" /><rect className={`tone-${i % 4}`} width={r.v} height="8" rx="4" /></svg>
          <strong>{r.v}</strong>
        </div>
      ))}
    </div>
  );
}

function MonteFan() {
  const W = 400, H = 170;
  const y = (v: number) => H - 20 - ((v - 0.95) / 0.75) * (H - 40);
  return (
    <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Monte Carlo projection fan">
      {[0.25, 0.5, 0.75].map((g) => <line key={g} className="chart-grid" x1="0" x2={W} y1={H * g} y2={H * g} />)}
      <path className="fan-outer" d={`M0,${y(1.0)} L${W},${y(1.62)} L${W},${y(1.08)} Z`} />
      <path className="fan-inner" d={`M0,${y(1.0)} L${W},${y(1.49)} L${W},${y(1.22)} Z`} />
      <path className="chart-line" d={`M0,${y(1.0)} L${W},${y(1.36)}`} />
      {MONTE.map(([p, , v]) => <text key={p} className="chart-axis" x={W - 26} y={y(v) - 3}>{p}</text>)}
    </svg>
  );
}

function DrawdownChart() {
  const W = 400, H = 140;
  const y = (v: number) => 10 + (-v / 12) * (H - 30);
  const d = DRAWDOWN.map((v, i) => `${i ? "L" : "M"}${(i / (DRAWDOWN.length - 1)) * W},${y(v)}`).join(" ");
  return (
    <svg className="line-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="12-month drawdown">
      <line className="chart-grid" x1="0" x2={W} y1={y(0)} y2={y(0)} />
      <line className="chart-grid" x1="0" x2={W} y1={y(-11)} y2={y(-11)} />
      <path className="drawdown-area" d={`${d} L${W},${y(0)} L0,${y(0)} Z`} />
      <path className="chart-line" d={d} />
      <text className="chart-axis" x="4" y={y(-11) - 4}>Max -11%</text>
    </svg>
  );
}

type Tab = "overview" | "risk" | "funds" | "monte";

function Workspace() {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: [Tab, string, typeof PieChart][] = [["overview", "Dashboard", PieChart], ["risk", "Risk engine", ShieldCheck], ["funds", "Inside funds", Layers], ["monte", "Monte Carlo", TrendingUp]];
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <span className="spectre-brand">SPECTRE<span className="brand-dot">.</span></span>
        <small>spectre-assets.com / dashboard</small>
        <div className="workspace-tabs">
          {tabs.map(([id, label, Icon]) => <button key={id} className="btn-ghost" type="button" aria-pressed={tab === id} onClick={() => setTab(id)}><Icon />{label}</button>)}
        </div>
        <div className="sidebar-bottom"><Lock />Read-only AI access</div>
      </aside>
      <div className="workspace-main">
        <div className="workspace-top"><span><Wallet />7 accounts · broker, super, crypto, bullion</span><span className="sample-tag">Demo data</span></div>
        <div className="workspace-content">
          {tab === "overview" && (
            <>
              <div className="stats-row four">
                <div><div className="stat-label">Portfolio Value</div><div className="big-number">$314,320</div><div className="stat-detail positive">+1.7% MTD</div></div>
                <div><div className="stat-label">Accounts Linked</div><div className="big-number">7</div><div className="stat-detail">Broker, super, crypto, bullion</div></div>
                <div><div className="stat-label">Funds Resolved</div><div className="big-number">2 of 3</div><div className="stat-detail">IVV · VAS · one awaiting a file</div></div>
                <div><div className="stat-label">Monte Carlo</div><div className="big-number">500</div><div className="stat-detail">1Y simulation paths</div></div>
              </div>
              <div className="chart-columns">
                <div>
                  <div className="chart-head"><h4>AI Risk Snapshot — 72 / 100 (Elevated)</h4></div>
                  <div className="gauge"><div className="gauge-fill" style={{ width: "72%" }} /><span style={{ left: "72%" }}>72</span></div>
                  <p className="stat-detail">Concentration · VaR95 · Expected Shortfall · Beta · Tracking Error</p>
                  <div className="chart-head" style={{ marginTop: 18 }}><h4>Drawdown (12-month)</h4></div>
                  <DrawdownChart />
                </div>
                <div>
                  <div className="chart-head"><h4>Source Mix</h4></div>
                  <div className="donut-content">
                    <Donut data={SOURCE_MIX} center="7" caption="accounts" />
                    <ul className="allocation-legend">
                      {SOURCE_MIX.map((a, i) => <li key={a.name}><svg viewBox="0 0 6 6"><circle className={`tone-${i}`} cx="3" cy="3" r="3" /></svg>{a.name}<strong>{a.v}%</strong></li>)}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
          {tab === "risk" && (
            <>
              <div className="workspace-heading"><div><h3>Risk Engine Surface</h3><p>Concentration, tail-risk, benchmark and data-confidence layers</p></div></div>
              <Bars data={QUANT} />
              <p className="flow-caption" style={{ marginTop: 20 }}>Computed in code — VaR, beta, drawdown and correlation are handed to your AI, not guessed.</p>
            </>
          )}
          {tab === "funds" && (
            <>
              <div className="workspace-heading"><div><h3>iShares Core S&P 500 ETF · $28,690</h3><p>507 holdings · SEC N-PORT · as of 30 Jun 2026</p></div></div>
              <table className="fund-table"><thead><tr><th>Ticker</th><th>Company</th><th>Weight</th><th>Your $</th></tr></thead>
                <tbody>{IVV.map((r) => <tr key={r[0]}>{r.map((c) => <td key={c}>{c}</td>)}</tr>)}</tbody></table>
              <p className="flow-caption">+ 502 more names</p>
            </>
          )}
          {tab === "monte" && (
            <>
              <div className="workspace-heading"><div><h3>Monte Carlo Projection (1Y)</h3><p>500 paths from the imported portfolio</p></div></div>
              <MonteFan />
              <div className="monte-row">{MONTE.map(([p, v]) => <div key={p}><span>{p}</span><strong>{v}</strong></div>)}</div>
            </>
          )}
        </div>
        <div className="workspace-insight"><Sparkles /><span><strong>Alert me if</strong> CBA drops 5% this week — SPECTRE watches and emails you when it happens.</span></div>
      </div>
    </div>
  );
}

function Scanner() {
  const [q, setQ] = useState("PLS");
  const [key, setKey] = useState("PLS");
  const [err, setErr] = useState("");
  const s = SCAN[key] ?? SCAN["PLS"]!;
  const run = () => {
    const t = q.trim().toUpperCase().replace(".AX", "");
    if (!SCAN[t]) { setErr(`Demo covers ${Object.keys(SCAN).join(", ")} — sign up to scan any stock.`); return; }
    setErr(""); setKey(t);
  };
  const up = s.chg.startsWith("+");
  return (
    <div className="scanner-card">
      <form className="scan-input" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <Search /><input aria-label="Ticker" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try BHP, CBA, FMG" />
        <button type="submit" className="cta btn-sm">Scan</button>
      </form>
      {err && <p className="scan-error">{err}</p>}
      <div className="scanner-result">
        <div className="scanner-result-head"><div><strong>{key}.AX · {s.name}</strong><small>{s.price}</small></div><span className={up ? "positive" : "negative"}>{s.chg} today</span></div>
        <svg className="line-chart" viewBox="0 0 400 105" preserveAspectRatio="none"><path className="chart-line" d={path(s.series, 400, 105)} /></svg>
        <div className="rsi"><span>RSI 14</span><div className="gauge small"><div className="gauge-fill" style={{ width: `${s.rsi}%` }} /><span style={{ left: `${s.rsi}%` }}>{s.rsi}</span></div><span>{s.rsi > 70 ? "Overbought above 70" : s.rsi < 30 ? "Oversold below 30" : "Neutral"}</span></div>
        <div className="scan-stats">
          <div><span>52W range</span><strong>{s.low} – {s.high}</strong></div>
          <div><span>30D change</span><strong>{s.m30}</strong></div>
          <div><span>Volume</span><strong>{s.vol}</strong></div>
          <div><span>ATR 14</span><strong>{s.atr}</strong></div>
          <div><span>50D trend</span><strong>{s.trend}</strong></div>
        </div>
        {key === "PLS" && (
          <div className="scan-flags">
            <p><b className="flag alert">ALERT</b> Volume 3.2× the 20-day average — unusual activity. Check announcements before acting.</p>
            <p><b className="flag watch">WATCH</b> RSI 71 — running hot. Approaching overbought territory.</p>
          </div>
        )}
        <p className="flow-caption">Possible anomalies only — not advice. SPECTRE surfaces; you decide.</p>
      </div>
    </div>
  );
}

function Heading({ eyebrow, title, text, id }: { eyebrow: string; title: string; text?: string; id?: string }) {
  return <div className="section-heading" id={id}><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{text && <p>{text}</p>}</div>;
}

const REVEAL_SELECTOR = ".spectre-page section, .product-item, .why-item, .feature-list article, .workflow-step, .note-grid > div, .metrics-strip > div, .compare > div";

function useScrollReveal() {
  useEffect(() => {
    // Desktop only: on phones the page stays fully visible at rest so it scrolls
    // smoothly instead of revealing section by section.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(max-width: 760px)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px" },
    );
    const seen = new Map<Element, number>();
    document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
      const parent = el.parentElement ?? el;
      const order = seen.get(parent) ?? 0;
      seen.set(parent, order + 1);
      el.classList.add("reveal");
      el.style.setProperty("--reveal-delay", `${Math.min(order, 4) * 80}ms`);
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);
}

type CheckoutState = "success" | "cancelled" | null;
type CheckoutPlan = "free" | "plus" | "pro";

export default function LandingPage({
  checkoutState = null,
  checkoutPlan = "free",
}: {
  checkoutState?: CheckoutState;
  checkoutPlan?: CheckoutPlan;
}) {
  const [open, setOpen] = useState(0);
  useScrollReveal();
  const checkoutMessage =
    checkoutState === "success"
      ? `${checkoutPlan === "pro" ? "Pro" : "Plus"} plan checkout complete. Your subscription will activate shortly.`
      : checkoutState === "cancelled"
        ? "Stripe checkout was cancelled."
        : null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
      />
      <style dangerouslySetInnerHTML={{ __html: SPECTRE_TEMPLATE_CSS }} />
      <main className="spectre-page">
        <Tape />
        <div className="spectre-container">
          <nav className="spectre-nav">
            <Link className="spectre-brand" href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/spectre-mark.svg" alt="" aria-hidden="true" width={29} height={29} />
              SPECTRE<span className="brand-dot">.</span>
            </Link>
            <div className="nav-links"><a href="#ai">AI</a><a href="#funds">Funds</a><a href="#scanner">Scanner</a><a href="#connect">Connect</a><Link href={RESEARCH}>Research</Link><Link href={DEMO}>Demo</Link><Link href="/download">Get the app</Link></div>
            <div className="nav-actions">
              <Link href={SIGNIN} className="cta cta-ghost">Sign In</Link>
              <Link href={REGISTER} className="cta">Get Started Free</Link>
            </div>
          </nav>

          <header className="hero-intro">
            {checkoutMessage ? <div className={`checkout-banner ${checkoutState === "success" ? "success" : ""}`}>{checkoutMessage}</div> : null}
            <span className="eyebrow"><Plug />The connector for your AI · Australia</span>
            <h1>Plug your AI into<br /><span>your real portfolio.</span></h1>
            <p>One link gives your AI your real holdings, the companies inside your funds, and risk numbers that are actually right.</p>
            <div className="hero-connector" aria-label="How SPECTRE connects">
              <div className="hc-col"><small>Your AI</small><span>Claude</span><span>ChatGPT</span><span>Cursor</span><span>Ollama</span></div>
              <div className="hc-line"><i /><em>MCP</em></div>
              <div className="hc-hub"><strong>SPECTRE<span className="brand-dot">.</span></strong><small>10 tools</small></div>
              <div className="hc-line"><i /><em>read-only</em></div>
              <div className="hc-col"><small>Your money</small><span>Broker</span><span>Super</span><span>Crypto & bullion</span><span>Fund filings</span></div>
            </div>
            <div className="hero-actions">
              <Link href={REGISTER} className="cta">Get Started Free <ArrowRight /></Link>
              <Link href={DEMO} className="cta cta-outline">Explore Demo</Link>
              <Link href="/download" className="cta cta-outline"><Download />Download the app</Link>
            </div>
            <p className="hero-note"><Check />Built for Australian investors · No card required · Cancel anytime</p>
            <HeroCharts />
          </header>
        </div>
        <section id="funds" className="section-pad spectre-container">
          <Heading eyebrow="Fund look-through" title="Your funds. The companies underneath." text="Reveal overlapping companies across ETFs, managed funds and super. Match dated issuer holdings or SEC N-PORT to the exact fund; use manager 13F only where independently verified as applicable." />
          <div className="fund-source-strip"><span><Database />SEC N-PORT</span><span><FileSpreadsheet />Manager 13F · partial</span><span><Search />Official fund research</span><Link href={REGISTER} className="cta cta-outline btn-sm">Look through my funds <ArrowRight /></Link></div>
          <p className="flow-caption">Illustrative breakdowns below — not fetched SEC filings.</p>
          <div className="product-grid">
            <article className="product-item">
              <span className="eyebrow">iShares Core S&P 500 ETF · $28,690</span>
              <p>507 holdings · illustrative N-PORT-style breakdown</p>
              <table className="fund-table"><tbody>{IVV.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table>
              <p className="flow-caption">+ 502 more names</p>
            </article>
            <article className="product-item">
              <span className="eyebrow">Vanguard Australian Shares ETF · $9,937</span>
              <p>Top holdings from Vanguard Australia · 33% of the fund accounted for</p>
              <table className="fund-table"><tbody>{VAS.map((r) => <tr key={r[0]}><td><b>{r[0]}</b></td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody></table>
              <p className="flow-caption">Remaining 67% stays as VAS — not guessed at</p>
            </article>
          </div>

          <div className="overlap">
            <div>
              <span className="eyebrow">Overlap</span>
              <h3>You own more CBA than your account says.</h3>
              <p>$15,773 held directly plus $974 inside VAS is <strong>$16,747</strong> — 5.3% of the book, not the 5.0% the holdings table shows. Your risk score uses the 5.3%.</p>
            </div>
            <div className="fund-flow">
              <div className="fund-sources">
                <div className="fund-node"><span>CBA held directly</span><strong>$15,773</strong></div>
                <div className="fund-node"><span>CBA inside VAS</span><strong>$974</strong></div>
              </div>
              <ArrowRight />
              <div className="fund-node fund-result"><span>True CBA exposure</span><strong>$16,747 · 5.3%</strong></div>
            </div>
          </div>

          <div className="look-chart">
            <div className="chart-head"><h4>What your holdings table hides</h4><div className="chart-legend"><span><i className="legend-dot muted" />On your statement</span><span><i className="legend-dot" />Looked through</span></div></div>
            {LOOK.map((l) => (
              <div className="look-row" key={l.name}>
                <span>{l.name}</span>
                <div className="look-bars">
                  <div className="look-bar statement" style={{ width: `${(l.statement / 18) * 100}%` }}>{l.statement}%</div>
                  <div className="look-bar real" style={{ width: `${(l.real / 18) * 100}%` }}>{l.real}%</div>
                </div>
                <strong className="negative">+{(l.real - l.statement).toFixed(1)} hidden</strong>
              </div>
            ))}
            <p className="flow-caption">Your risk score runs on the looked-through figure, because that is the exposure you actually carry.</p>
          </div>

          <p className="flow-caption" style={{ marginTop: 28 }}>Verify fund name, series/share class, report date and coverage before saving. N-PORT describes a registered fund; 13F describes a manager&rsquo;s reportable securities, not the whole fund. Missing holdings stay visible, never guessed. Direct source files can be read where permitted; blocked sources require upload.</p>
        </section>

        <LaptopReveal />
        <div className="spectre-container">
          <div id="workspace-demo"><Workspace /></div>
          <div className="metrics-strip">
            <div><strong>9</strong><span>Import sources</span></div>
            <div><strong>12+</strong><span>Risk signals</span></div>
            <div><strong>500</strong><span>Monte Carlo paths</span></div>
            <div><strong>3</strong><span>Quant · AI · Research</span></div>
          </div>
        </div>

        <PhotoStory />
        <section className="section-pad spectre-container">
          <Heading eyebrow="Why connect it" title="Three things your AI can&rsquo;t do without SPECTRE." />
          <div className="why-grid">
            {[[Eye, "Sees inside your funds", "It reads each ETF and super fund's filings down to the companies you really own — not just the ticker."],
              [Target, "Knows your true concentration", "Overlap across funds and super surfaces, so it sees 5.3% CBA, not the 5.0% your holdings table shows."],
              [BarChart3, "Quotes numbers that are right", "VaR, beta, drawdown and correlation computed in code and handed over — not a chatbot's guess."]].map(([I, t, d], i) => {
              const Icon = I as typeof Eye;
              return <article key={t as string} className="why-item"><span className="why-num">0{i + 1}</span><Icon /><h3>{t as string}</h3><p>{d as string}</p></article>;
            })}
          </div>
        </section>

        <section id="ai" className="workflow-band section-pad">
          <div className="spectre-container workflow-grid">
            <div className="section-copy">
              <span className="eyebrow"><Brain />AI Portfolio Analyst</span>
              <h2>Ask your portfolio anything.</h2>
              <p>Before answering, SPECTRE reads your holdings, the stocks inside your funds, live prices and your risk numbers — so &ldquo;why am I down today?&rdquo; names your tickers.</p>
              <div className="two-notes">
                <div><h4>What it reads</h4><p>Holdings, fund look-through, weights, live quotes, benchmark risk, research signals.</p></div>
                <div><h4>What it returns</h4><p>Drivers, holding-level explanations and risk flags — never an instruction to trade.</p></div>
              </div>
              <Link className="text-link" href={REGISTER}>Start Asking Free <ArrowRight /></Link>
            </div>
            <div className="console">
              <div className="console-bar">AI Console <span>All plans</span></div>
              <p className="ai-question"><Sparkles />What is most likely influencing the value of my current holdings right now?</p>
              <p className="ai-answer"><strong>Your top drivers today</strong> are bank concentration, AUD weakness, and the commodity sleeve. CBA and NAB are lifting portfolio value, while FMG and WTI-linked energy exposure are adding downside volatility. Risk remains elevated because the top 3 positions are <strong>42%</strong> of the book and 1-day <strong>VaR 95%</strong> is above your recent median.</p>
              <div className="driver-bars">
                {[["Bank concentration", 42, 0], ["AUD weakness", 27, 3], ["Commodity sleeve", 19, 2]].map(([n, v, t]) => (
                  <div className="risk-bar-row" key={n as string}><span>{n}</span><svg viewBox="0 0 100 8" preserveAspectRatio="none"><rect className="risk-track" width="100" height="8" rx="4" /><rect className={`tone-${t}`} width={(v as number) * 2} height="8" rx="4" /></svg><strong>{v}%</strong></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="scanner" className="workflow-band section-pad">
          <div className="spectre-container workflow-grid">
            <div className="section-copy">
              <span className="eyebrow"><Search />Live now · Free for everyone</span>
              <h2>Scan any stock. Free, for everyone.</h2>
              <p>Search any stock and SPECTRE checks a year of price, volume, momentum and volatility — then flags what looks unusual: RSI extremes, volume spikes, price gaps, 52-week levels and trend breaks.</p>
              <p className="flow-caption">ASX tickers resolve first; US and global markets work too. Possible anomalies only — the scanner never trades and never tells you what to do.</p>
            </div>
            <Scanner />
          </div>
        </section>

        <section id="connect" className="section-pad spectre-container">
          <Heading eyebrow="The connector" title="Make the AI you already use your financial analyst." text="SPECTRE speaks the Model Context Protocol, so Claude, ChatGPT or a model on your own machine plugs straight into your portfolio." />
          <div className="connect-grid">
            <div className="connector-diagram">
              <p className="research-label">The AI you already use</p>
              <div className="connector-clients"><span>Claude</span><span>ChatGPT</span><span>Cursor</span><span>LM Studio</span><span>Ollama</span><span>Zed</span><span>Your model</span></div>
              <ArrowDown />
              <div className="connector-hub">SPECTRE<span className="brand-dot">.</span> <small>10 tools · MCP</small></div>
              <ArrowDown />
              <div className="connector-clients"><span>Broker &amp; shares</span><span>Superannuation</span><span>Crypto &amp; bullion</span><span>SEC &amp; issuer filings</span></div>
              <p className="research-label">Your money</p>
            </div>
            <div className="console">
              <div className="console-bar">Your AI // connected to SPECTRE</div>
              <p className="ai-question"><Sparkles />How is my portfolio positioned right now?</p>
              <div className="tool-tokens"><span>get_portfolio ✓</span><span>portfolio_funds ✓</span><span>portfolio_risk ✓</span></div>
              <p className="ai-answer" style={{ marginTop: 14 }}>Your book is flat on the day. It&rsquo;s concentrated — super alone is <strong>35.6%</strong> and the top three lines are <strong>58%</strong>. Looking through IVV and VAS, your real CBA exposure is <strong>5.3%</strong>, not the 5.0% your holdings table shows…</p>
            </div>
          </div>
          <p className="flow-caption" style={{ marginTop: 32 }}>Ten tools — holdings, look-through, risk, scanner, news, movers and macro — computed in code before your model sees them. Connect over a URL or run it locally, and nothing is metered on our side.</p>
        </section>

        <section className="workflow-band section-pad">
          <div className="spectre-container">
            <Heading eyebrow="Research terminal" title="The market data behind every answer." text="The same feeds the AI reads: ASX equities, macro, earnings, crypto, commodities, treasury curves, and positioning data." />
            <Link href={RESEARCH} className="cta cta-outline mb-6">Open research terminal <ArrowRight /></Link>
            <div className="research-grid">
              <div className="product-item"><h4>Macro snapshot</h4>
                {[["ASX 200", "8,214"], ["RBA Cash Rate", "3.60%"], ["US 10Y Yield", "4.21%"], ["AU-US 10Y Spread", "-0.42%"], ["Copper", "+1.1%"], ["Brent Crude", "74.20"]].map(([k, v]) => <div className="market-row two" key={k}><span>{k}</span><strong>{v}</strong></div>)}
              </div>
              <div className="product-item"><h4>Live headlines</h4>
                {["RBA holds cash rate, flags patient path on cuts", "Iron ore slips as China stimulus hopes fade", "CSL upgraded — analyst targets lifted to $315", "US CPI in line; treasury curve steepens"].map((h) => <div className="market-row two" key={h}><span><Newspaper style={{ width: 13, display: "inline", marginRight: 6 }} />{h}</span></div>)}
              </div>
            </div>
            <p className="flow-caption" style={{ marginTop: 22 }}>Also in the terminal: FRED and CFTC positioning, 12 ASX earnings names, analyst targets, the economic calendar and the live headline feed.</p>
          </div>
        </section>

        <section className="section-pad spectre-container">
          <Heading eyebrow="How it works" title="From CSV to clear answers in three steps." />
          <div className="steps-row">
            <div className="product-item"><span className="eyebrow">Step 01</span><h3>Import portfolio</h3><p>Drop CSV or XLSX files — super, ASX, crypto, funds, bullion.</p>
              <ul className="file-list"><li><FileSpreadsheet />commsec_export.csv <Check /></li><li><FileSpreadsheet />spaceship_super.csv <Check /></li><li><FileSpreadsheet />coinspot_wallet.xlsx <Check /></li></ul></div>
            <div className="product-item"><span className="eyebrow">Step 02</span><h3>Normalized holdings</h3><p>Every source merged into one clean table with weights and values.</p>
              <table className="fund-table"><thead><tr><th>Source</th><th>Weight</th><th>Value</th></tr></thead><tbody><tr><td>CommSec</td><td>7.3%</td><td>$92.7k</td></tr><tr><td>Super</td><td>5.1%</td><td>$64.8k</td></tr><tr><td>CoinSpot</td><td>—</td><td>—</td></tr></tbody></table></div>
            <div className="product-item"><span className="eyebrow">Step 03</span><h3>Quant, AI &amp; research</h3><p>Risk engine, AI analyst and research terminal open on your real book.</p>
              <Bars data={QUANT.slice(0, 3)} /></div>
          </div>
        </section>

        <section className="connect-band section-pad spectre-container">
          <Heading eyebrow="Security" title="Your data stays yours." />
          <div className="note-grid four">
            {[[Database, "No data selling", "Holdings are used only to build your workspace. Site analytics never carry portfolio data."], [Trash2, "Delete anytime", "Clear holdings, snapshots, and alerts from the dashboard whenever you want."], [Lock, "Secure accounts", "scrypt password hashing, secure session cookies, and no card details on file."], [Server, "Hardened hosting", "HTTPS with CSP, HSTS, anti-framing headers, and encrypted backups."]].map(([I, t, d]) => {
              const Icon = I as typeof Lock;
              return <div key={t as string}><Icon className="note-icon" /><h4>{t as string}</h4><p>{d as string}</p></div>;
            })}
          </div>
        </section>

        <section className="section-pad spectre-container">
          <Heading eyebrow="Why SPECTRE?" title="So why not just a spreadsheet and a chatbot?" />
          <div className="compare">
            <div><h4>Other approaches</h4>
              {["Generic chat tools with no view of your actual holdings", "Manual spreadsheets for super, crypto, bullion and broker accounts", "No Monte Carlo, tail-risk, alerts or memory between decisions"].map((t) => <p key={t}><X className="negative" />{t}</p>)}</div>
            <div className="ai-native"><h4>SPECTRE · AI-native</h4>
              {["AI answers grounded in holdings, pricing, benchmarks and research", "One workspace across quant, AI and live research", "VaR, ES, drawdown, beta and Monte Carlo — with alerts and snapshots"].map((t) => <p key={t}><Check className="positive" />{t}</p>)}</div>
          </div>
        </section>

        <section id="faq" className="workflow-band section-pad">
          <div className="spectre-container faq-grid">
            <div className="section-copy"><span className="eyebrow">FAQ</span><h2>Common questions.</h2><p>Still curious? Email <a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a>.</p></div>
            <div>
              {FAQS.map(([q, a], i) => (
                <div className="faq-item" key={q}>
                  <button type="button" className="faq-trigger" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>{q}<ChevronDown style={{ transform: open === i ? "rotate(180deg)" : undefined }} /></button>
                  {open === i && <p className="faq-answer">{a}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="start" className="start-band">
          <div className="spectre-container start-inner">
            <div><span className="eyebrow">Free while we grow</span><h2>Give your portfolio an AI analyst.</h2><p>No plans, no tiers, no card. Every feature is unlocked for everyone — the full research terminal, all pro analytics, dip alerts, and our best AI model.</p></div>
            <div className="hero-actions">
              <Link href={REGISTER} className="cta start-cta">Start Now — Free <ArrowRight /></Link>
              <Link href={DEMO} className="cta cta-outline">Try The Demo First</Link>
            </div>
          </div>
        </section>

        <footer className="spectre-footer spectre-container">
          <div className="footer-top">
            <div><Link className="spectre-brand" href="/">SPECTRE<span className="brand-dot">.</span></Link><p className="flow-caption" style={{ maxWidth: 380 }}>AI portfolio intelligence for Australian investors managing multi-source portfolios across quant, research, and live monitoring.</p></div>
            <div className="footer-links"><a href="#ai">AI Analysis</a><Link href={DEMO}>Demo</Link><Link href={RESEARCH}>Research</Link><Link href="/download">Desktop app</Link><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a><a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a></div>
          </div>
          <div className="footer-bottom">
            <p>Disclaimer: SPECTRE provides informational analytics only. Not financial, investment, tax, or legal advice. No result is guaranteed to be complete, current, or accurate. Use at your own risk.</p>
            <span>Copyright 2026 SPECTRE</span>
          </div>
        </footer>
      </main>
    </>
  );
}
