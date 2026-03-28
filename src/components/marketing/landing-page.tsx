"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import styles from "./landing-page.module.css";

type CheckoutPlan = "free" | "plus" | "pro";
type MarketingCard = {
  title: string;
  copy: string;
  icon: ReactNode;
  alt?: boolean;
};
type WorkflowStep = MarketingCard & {
  number: string;
};

const tickerItems = [
  ["BHP", "45.82", "+1.2%", "up"],
  ["CBA", "131.44", "-0.4%", "dn"],
  ["CSL", "288.10", "+0.7%", "up"],
  ["WES", "77.30", "-1.1%", "dn"],
  ["ANZ", "29.55", "+0.3%", "up"],
  ["NAB", "38.20", "+0.5%", "up"],
  ["FMG", "18.44", "-2.1%", "dn"],
  ["RIO", "112.60", "+0.9%", "up"],
  ["MQG", "218.75", "+1.4%", "up"],
  ["WBC", "32.10", "-0.2%", "dn"],
] as const;

const workflowSteps: readonly WorkflowStep[] = [
  {
    number: "01 — IMPORT",
    title: "Import Reports",
    copy:
      "Upload super, savings, tax reports, ASX brokerage, crypto wallet, index funds, mutual funds, and bullion exports directly into SPECTRE.",
    icon: <UploadIcon />,
  },
  {
    number: "02 — NORMALIZE",
    title: "Normalize Exposure",
    copy:
      "SPECTRE aggregates positions by source, account, sector, and instrument in one unified workspace.",
    icon: <GridIcon />,
    alt: true,
  },
  {
    number: "03 — REVIEW",
    title: "Act on Risk Signals",
    copy:
      "Use risk score, drawdown, VaR95, concentration metrics, and dip alert emails to monitor your portfolio posture.",
    icon: <PulseIcon />,
  },
] as const;

const researchSteps: readonly WorkflowStep[] = [
  {
    number: "01 — SCAN",
    title: "Get the Full Market Picture",
    copy:
      "Open the terminal to see live ASX 200, AUD/USD, VIX fear index, Gold, BTC and ETH side by side. Scan sector pressure, US movers and a live news feed tagged by theme before touching your portfolio.",
    icon: <PulseIcon />,
  },
  {
    number: "02 — COMPARE",
    title: "Drill Into Stocks & Earnings",
    copy:
      "Review 15 ASX blue chips with live PE ratios, dividend yields and 52-week ranges. Compare against the latest earnings snapshots and analyst bull/bear cases so each holding is judged against its actual operating context.",
    icon: <GridIcon />,
    alt: true,
  },
  {
    number: "03 — ACT",
    title: "Trade With Market Conviction",
    copy:
      "Return to your risk dashboard with a clear view of what is driving the market. Make concentration, rebalancing and dip alert decisions backed by the same macro data that professional analysts use.",
    icon: <BarsIcon />,
  },
] as const;

const features: readonly MarketingCard[] = [
  {
    title: "ASX + Crypto + Super Imports",
    copy:
      "Ingest brokerage, crypto wallet, super, savings, tax reports, index, fund, and bullion exports in one workflow.",
    icon: <UploadIcon />,
  },
  {
    title: "Risk Score + Dashboard",
    copy:
      "Track one clear risk score alongside VaR95, drawdown, volatility, and concentration in a live dashboard.",
    icon: <PulseIcon />,
    alt: true,
  },
  {
    title: "Market Research Terminal",
    copy:
      "Open a dedicated research view for ASX leadership, macro context, earnings snapshots, sector pressure, and cross-asset sentiment.",
    icon: <BarsIcon />,
  },
  {
    title: "Session Movers",
    copy:
      "Surface ASX top movers and trigger dip alert emails using refreshed market prices each session.",
    icon: <BarsIcon />,
  },
  {
    title: "Snapshot Audit Trail",
    copy:
      "Review portfolio trend history and data quality signals over time with automated snapshot captures.",
    icon: <ClockIcon />,
    alt: true,
  },
  {
    title: "Dip Alert Emails",
    copy:
      "Set price thresholds and receive email alerts when holdings reach dip levels worth reviewing.",
    icon: <BellIcon />,
    alt: true,
  },
] as const;

const riskSignals = [
  { label: "Concentration", value: 82, tone: "purple" },
  { label: "VaR 95%", value: 68, tone: "pink" },
  { label: "Drawdown", value: 55, tone: "orange" },
  { label: "Volatility", value: 47, tone: "amber" },
  { label: "Data Quality", value: 91, tone: "soft" },
] as const;

const sectorConcentration = [
  { label: "Materials", value: 28 },
  { label: "Financials", value: 22 },
  { label: "Healthcare", value: 16 },
  { label: "Energy", value: 14 },
  { label: "Consumer", value: 10 },
  { label: "Other", value: 10 },
] as const;

const sessionMovers = [
  { symbol: "BHP", change: "+1.2%", width: 78, tone: "up" },
  { symbol: "MQG", change: "+1.4%", width: 92, tone: "up" },
  { symbol: "RIO", change: "+0.9%", width: 58, tone: "up" },
  { symbol: "CSL", change: "+0.7%", width: 44, tone: "up" },
  { symbol: "WBC", change: "-0.2%", width: 14, tone: "down" },
  { symbol: "CBA", change: "-0.4%", width: 28, tone: "down" },
  { symbol: "WES", change: "-1.1%", width: 72, tone: "down" },
  { symbol: "FMG", change: "-2.1%", width: 100, tone: "down" },
] as const;

const securityCards: readonly MarketingCard[] = [
  {
    title: "Privacy Promise",
    copy:
      "We do not sell your data. Portfolio uploads are used only to generate your analytics workspace.",
    icon: <UsersIcon />,
  },
  {
    title: "Data Control & Deletion",
    copy:
      "Clear imported holdings, snapshots, and dip alerts anytime from the dashboard. Cancelling your paid plan does not unexpectedly wipe your workspace.",
    icon: <TrashIcon />,
    alt: true,
  },
  {
    title: "Account & Payment Security",
    copy:
      "Email verification, scrypt password hashing, secure cookies, and Stripe-hosted checkout are already wired into production flows.",
    icon: <LockIcon />,
  },
  {
    title: "Hosting & Hardening",
    copy:
      "Production runs over HTTPS with CSP, HSTS, anti-framing headers, and encrypted backups with restore verification checks.",
    icon: <ShieldIcon />,
    alt: true,
  },
] as const;

const faqs = [
  {
    question: "What file formats does SPECTRE accept?",
    answer:
      "SPECTRE accepts CSV and XLSX exports from major Australian brokers, superannuation funds, crypto exchanges, and bullion dealers. If your platform exports a spreadsheet, SPECTRE can likely normalize it.",
  },
  {
    question: "Is my financial data safe?",
    answer:
      "Yes. SPECTRE uses modern password hashing, HTTPS with CSP and HSTS headers, encrypted backups, and Stripe-hosted checkout. Your portfolio data is never sold or shared.",
  },
  {
    question: "What is the SPECTRE risk score?",
    answer:
      "The risk score is a 0 to 100 composite metric built from concentration, VaR95, maximum drawdown, historical volatility, and data quality confidence.",
  },
  {
    question: "How is AI analysis different on Pro vs Free?",
    answer:
      "AI holdings analysis is available on all plans including Free. Every tier gets a natural-language console where you can ask questions about your holdings. Pro unlocks unlimited AI queries, while Free and Plus include a daily allowance.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Subscriptions are managed through Stripe and can be cancelled at any time from your billing portal.",
  },
] as const;

export default function LandingPage({
  checkoutState,
  checkoutPlan,
}: {
  checkoutState: "success" | "cancelled" | null;
  checkoutPlan: CheckoutPlan;
}) {
  const [activeFaqIndex, setActiveFaqIndex] = useState(0);
  const heroProductRef = useRef<HTMLDivElement>(null);
  const stickySectionRef = useRef<HTMLElement>(null);
  const [activeStickyPanel, setActiveStickyPanel] = useState(0);

  useEffect(() => {
    const reveals = document.querySelectorAll<HTMLElement>(
      `.${styles.reveal}, .${styles.revealLeft}, .${styles.revealRight}, .${styles.revealScale}, .${styles.revealUp}`,
    );

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add(styles.visible);
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.08 },
    );

    reveals.forEach((element) => revealObserver.observe(element));

    const nav = document.querySelector<HTMLElement>(`.${styles.nav}`);
    const sections = [...document.querySelectorAll<HTMLElement>("section[id]")];
    const navLinks = [...document.querySelectorAll<HTMLAnchorElement>(`.${styles.navLinks} a[href^="#"]`)];

    const syncScroll = () => {
      if (nav) {
        nav.classList.toggle(styles.navScrolled, window.scrollY > 40 && window.innerWidth > 960);
      }

      let current = "";
      sections.forEach((section) => {
        if (window.scrollY >= section.offsetTop - 120) {
          current = section.id;
        }
      });

      navLinks.forEach((link) => {
        link.classList.toggle(styles.active, link.getAttribute("href") === `#${current}`);
      });
    };

    syncScroll();
    window.addEventListener("scroll", syncScroll, { passive: true });

    const riskBar = document.querySelector<HTMLElement>(`.${styles.riskBarFill}`);
    let riskObserver: IntersectionObserver | null = null;

    if (riskBar) {
      riskObserver = new IntersectionObserver(
        (entries) => {
          if (!entries[0]?.isIntersecting) return;
          window.setTimeout(() => {
            riskBar.style.width = "72%";
          }, 200);
          riskObserver?.disconnect();
        },
        { threshold: 0.5 },
      );
      riskObserver.observe(riskBar);
    }

    return () => {
      revealObserver.disconnect();
      riskObserver?.disconnect();
      window.removeEventListener("scroll", syncScroll);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const heroProduct = heroProductRef.current;
      if (heroProduct) {
        const p = Math.min(window.scrollY / window.innerHeight, 1);
        const e = 1 - Math.pow(1 - p, 2.5);
        heroProduct.style.transform = `scale(${(0.82 + e * 0.18).toFixed(4)}) translateY(${((1 - e) * 60).toFixed(1)}px)`;
        heroProduct.style.opacity = (0.35 + e * 0.65).toFixed(3);
      }
      const sticky = stickySectionRef.current;
      if (sticky) {
        const scrollable = sticky.offsetHeight - window.innerHeight;
        if (scrollable > 0) {
          const scrolled = Math.max(0, -sticky.getBoundingClientRect().top);
          const progress = Math.min(scrolled / scrollable, 1);
          setActiveStickyPanel(Math.min(Math.floor(progress * 3), 2));
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const checkoutMessage =
    checkoutState === "success"
      ? `${checkoutPlan === "pro" ? "Pro" : "Plus"} plan checkout complete. Your subscription will activate shortly.`
      : checkoutState === "cancelled"
        ? "Stripe checkout was cancelled."
        : null;

  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand}>
            SPECTRE
          </Link>

          <div className={styles.navLinks}>
            <a href="#workflow">Workflow</a>
            <a href="#features">Features</a>
            <a href="#pro-ai">AI Analysis</a>
            <a href="#pricing">Pricing</a>
            <a href="#security">Security</a>
          </div>

          <div className={styles.navActions}>
            <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.demoButton}`}>
              <span className={styles.demoDot} />
              Live Demo
            </Link>
            <Link href="/signin" className={`${styles.button} ${styles.ghostButton}`}>
              Sign In
            </Link>
            <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton}`}>
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      <div className={styles.ticker}>
        <div className={styles.tickerTrack}>
          {[...tickerItems, ...tickerItems].map(([symbol, price, delta, tone], index) => (
            <span key={`${symbol}-${index}`} className={styles.tickerItem}>
              <span className={styles.tickerSymbol}>{symbol}</span>
              <span className={styles.tickerPrice}>{price}</span>
              <span className={tone === "up" ? styles.up : styles.down}>{delta}</span>
            </span>
          ))}
        </div>
      </div>

      <section className={styles.hero} id="top">
        <div className={styles.container}>
          {checkoutMessage ? (
            <div className={`${styles.banner} ${checkoutState === "success" ? styles.bannerSuccess : styles.bannerInfo}`}>
              {checkoutMessage}
            </div>
          ) : null}

          <div className={styles.heroIntro}>
            <div className={`${styles.heroBadge} ${styles.reveal}`}>SPECTRE OPS — Portfolio Risk Analysis</div>
            <h1 className={`${styles.heroTitle} ${styles.reveal}`}>
              See your investment portfolio risk <span>in one place.</span>
            </h1>
            <p className={`${styles.heroSub} ${styles.reveal}`}>
              System for Portfolio Exposure, Correlation, Threat &amp; Risk Evaluation. Turn CSV exports from super, ASX, crypto, and funds into one clear risk view.
            </p>
            <div className={`${styles.heroActions} ${styles.reveal}`}>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Get Started Free
              </Link>
              <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.outlineButton} ${styles.heroButton}`}>
                See Live Demo →
              </Link>
            </div>

            <AITeaser />
          </div>

          <div ref={heroProductRef} className={styles.heroProduct}>
          <div className={styles.dashboardCard}>
            <div className={styles.dashboardHeader}>
              <div className={styles.dashboardUrl}>spectre-assets.com / dashboard</div>
            </div>

            <div className={styles.dashboardStats}>
              <StatCard label="Portfolio Value" value="$1.27M" sub="+2.1% MTD" tone="up" />
              <StatCard label="Holdings" value="24" sub="Across 6 sources" />
              <StatCard label="VaR 95%" value="2.1%" sub="Elevated" tone="down" />
              <StatCard label="Max Drawdown" value="11%" sub="12-month window" />
            </div>

            <div className={styles.dashboardCharts}>
              <div className={styles.chartBox}>
                <div className={styles.chartTitle}>Risk Score Trend — 72 / 100 (Elevated)</div>
                <svg className={styles.sparkline} viewBox="0 0 400 60" aria-hidden="true">
                  <defs>
                    <linearGradient id="landingLineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#a855f7" />
                      <stop offset="100%" stopColor="#ff7a30" />
                    </linearGradient>
                    <linearGradient id="landingFillGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#d946ef" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#ff7a30" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0,48 L60,42 L120,45 L180,35 L240,30 L300,22 L360,28 L400,20"
                    fill="none"
                    stroke="url(#landingLineGrad)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M0,48 L60,42 L120,45 L180,35 L240,30 L300,22 L360,28 L400,20 L400,60 L0,60Z"
                    fill="url(#landingFillGrad)"
                  />
                </svg>
                <div className={styles.riskMeta}>Concentration · Drawdown · VaR95 · Volatility</div>
                <div className={styles.riskBar}>
                  <div className={styles.riskBarFill} />
                </div>
              </div>

              <div className={styles.chartBox}>
                <div className={styles.chartTitle}>Allocation</div>
                <div className={styles.donutWrap}>
                  <svg width="88" height="88" viewBox="0 0 80 80" aria-hidden="true">
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#111318" strokeWidth="16" />
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#a855f7" strokeWidth="16" strokeDasharray="81 95" strokeDashoffset="24" transform="rotate(-90 40 40)" />
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#ff7a30" strokeWidth="16" strokeDasharray="50 95" strokeDashoffset="-57" transform="rotate(-90 40 40)" />
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#e879f9" strokeWidth="16" strokeDasharray="28 95" strokeDashoffset="-107" transform="rotate(-90 40 40)" />
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#fb923c" strokeWidth="16" strokeDasharray="18 95" strokeDashoffset="-135" transform="rotate(-90 40 40)" />
                  </svg>
                  <div className={styles.legend}>
                    <LegendItem color="#a855f7" label="Equities" value="46%" />
                    <LegendItem color="#ff7a30" label="Super" value="28%" />
                    <LegendItem color="#e879f9" label="Bullion" value="16%" />
                    <LegendItem color="#fb923c" label="Cash" value="10%" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      <div className={styles.statsStrip}>
        <div className={styles.container}>
          <div className={styles.statsGrid}>
            {[
              { val: "24+", label: "File Formats" },
              { val: "6", label: "Risk Metrics" },
              { val: "5", label: "Research Tabs" },
              { val: "$0", label: "To Start" },
            ].map(({ val, label }) => (
              <div key={label} className={styles.statStat}>
                <div className={styles.statStatVal}>{val}</div>
                <div className={styles.statStatLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Divider />

      <section className={styles.section} id="research">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>ASX Market Research</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>From ASX market context to portfolio conviction.</h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`} style={{ transitionDelay: "0.14s" }}>
            SPECTRE Research gives Plus and Pro members a 5-tab terminal — Overview, Equities, Macro, Earnings, and Crypto — with live indices, interactive charts, 12 ASX earnings snapshots, analyst sentiment, sector performance, and cross-asset data updated in real time.
          </p>

          <div className={styles.steps}>
            {researchSteps.map((step, index) => (
              <article
                key={step.title}
                className={`${styles.stepCard} ${styles.reveal}`}
                style={{ transitionDelay: `${index * 0.1}s` }}
              >
                <span className={styles.stepNumber}>{step.number}</span>
                <div className={`${styles.iconWrap} ${step.alt ? styles.iconAlt : ""}`}>{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </article>
            ))}
          </div>

          <div className={styles.researchHighlights}>
            {[
              { name: "5-Tab Research Terminal", sub: "Overview, Equities, Macro, Earnings, and Crypto — each with live data and Chart.js charts", alt: false },
              { name: "Live Metrics Strip", sub: "ASX 200, AUD/USD, VIX, Gold, BTC, ETH and SOL refreshing every 5 minutes", alt: false },
              { name: "12 ASX Earnings Snapshots", sub: "BHP, CBA, CSL, WES, NAB, ANZ, WBC, MQG, RIO, FMG, WDS, TLS — beat/miss status and key metrics", alt: false },
              { name: "Sector & Macro Charts", sub: "Interactive Chart.js bar and line charts for sector performance, AUD/USD, Gold, and crypto", alt: true },
              { name: "US Market Movers", sub: "Live gainers, losers and most active from FMP and Yahoo Finance screener", alt: true },
              { name: "Live News Feed", sub: "FMP and Yahoo Finance headlines with economic calendar and earnings calendar", alt: true },
            ].map((tile, index) => (
              <div key={tile.name} className={`${styles.researchTile} ${styles.reveal}`} style={{ transitionDelay: `${index * 0.08}s` }}>
                <div className={`${styles.researchTileIcon} ${tile.alt ? styles.researchTileIconAlt : ""}`}>
                  <BarsIcon />
                </div>
                <div>
                  <div className={styles.researchTileName}>{tile.name}</div>
                  <div className={styles.researchTileSub}>{tile.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.researchCtaRow}>
            <Link href="/research?demo=1" className={`${styles.button} ${styles.primaryButton}`}>
              See Research Demo
            </Link>
            <Link href="/signin?mode=register&plan=plus" className={`${styles.button} ${styles.outlineButton}`}>
              Included in Plus
            </Link>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.stickyWrap} id="workflow" ref={stickySectionRef}>
        <div className={styles.stickyInner}>
          <div className={styles.stickyLeft}>
            <div className={styles.stickyPanels}>
              <div className={`${styles.stickyPreview} ${activeStickyPanel === 0 ? styles.stickyPreviewActive : ""}`}>
                <div className={styles.previewCard}>
                  <div className={styles.previewHeader}>
                    <span className={styles.previewTitle}>Import Portfolio</span>
                    <span className={styles.chartBadge}>Step 01</span>
                  </div>
                  <div className={styles.previewUploadZone}>
                    <UploadIcon />
                    <span>Drop CSV or XLSX files here</span>
                    <span className={styles.previewMuted}>Super · ASX · Crypto · Funds · Bullion</span>
                  </div>
                  <div className={styles.previewFileList}>
                    {["commsec_export.csv", "spaceship_super.csv", "coinspot_wallet.xlsx"].map((f) => (
                      <div key={f} className={styles.previewFileRow}>
                        <span className={styles.previewFileIcon}>📄</span>
                        <span className={styles.previewFileName}>{f}</span>
                        <span className={styles.previewFileCheck}>✓</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`${styles.stickyPreview} ${activeStickyPanel === 1 ? styles.stickyPreviewActive : ""}`}>
                <div className={styles.previewCard}>
                  <div className={styles.previewHeader}>
                    <span className={styles.previewTitle}>Normalized Holdings</span>
                    <span className={styles.chartBadge}>Step 02</span>
                  </div>
                  <div className={styles.previewTable}>
                    <div className={styles.previewTableHead}>
                      <span>Ticker</span><span>Source</span><span>Weight</span><span>Value</span>
                    </div>
                    {[
                      { t: "BHP", s: "CommSec", w: "7.3%", v: "$92.7k" },
                      { t: "CBA", s: "CommSec", w: "5.1%", v: "$64.8k" },
                      { t: "BTC", s: "CoinSpot", w: "4.4%", v: "$55.9k" },
                      { t: "VDHG", s: "Vanguard", w: "18.2%", v: "$231k" },
                      { t: "SUPER", s: "Spaceship", w: "28.1%", v: "$356k" },
                    ].map((row) => (
                      <div key={row.t} className={styles.previewTableRow}>
                        <span className={styles.previewSymbol}>{row.t}</span>
                        <span className={styles.previewMuted}>{row.s}</span>
                        <span>{row.w}</span>
                        <span className={styles.previewValue}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className={`${styles.stickyPreview} ${activeStickyPanel === 2 ? styles.stickyPreviewActive : ""}`}>
                <div className={styles.previewCard}>
                  <div className={styles.previewHeader}>
                    <span className={styles.previewTitle}>Risk Dashboard</span>
                    <span className={`${styles.chartBadge} ${styles.chartBadgeOrange}`}>Step 03</span>
                  </div>
                  <div className={styles.previewRiskScore}>
                    <div className={styles.previewScoreLabel}>Risk Score</div>
                    <div className={styles.previewScoreVal}>72</div>
                    <div className={styles.previewScoreSub}>Elevated — Monitor Concentration</div>
                  </div>
                  <div className={styles.previewMetrics}>
                    {[
                      { label: "VaR 95%", val: "2.1%", color: "var(--accent2)" },
                      { label: "Max Drawdown", val: "−11%", color: "var(--danger)" },
                      { label: "Concentration", val: "42%", color: "var(--accent2)" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className={styles.previewMetricRow}>
                        <span className={styles.previewMuted}>{label}</span>
                        <span className={styles.previewMetricVal} style={{ color }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.stickyRight}>
            <div className={styles.stickyPanels}>
              {workflowSteps.map((step, i) => (
                <div key={step.title} className={`${styles.stickyPanel} ${activeStickyPanel === i ? styles.stickyPanelActive : ""}`}>
                  <div className={`${styles.iconWrap} ${step.alt ? styles.iconAlt : ""}`}>{step.icon}</div>
                  <span className={styles.stepNumber}>{step.number}</span>
                  <h2 className={styles.stickyPanelTitle}>{step.title}</h2>
                  <p className={styles.stickyPanelCopy}>{step.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="features">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Features</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>Designed for clarity, built for risk decisions.</h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`} style={{ transitionDelay: "0.14s" }}>
            Every feature is purpose-built for Australian investors who need a clear, consolidated risk view across multiple account types.
          </p>

          <div className={styles.featureGrid}>
            {features.map((feature, index) => (
              <article key={feature.title} className={`${styles.featureItem} ${styles.reveal}`} style={{ transitionDelay: `${index * 0.07}s` }}>
                <div className={`${styles.iconWrap} ${feature.alt ? styles.iconAlt : ""}`}>{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="charts">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Feature Preview</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>Concrete dashboard visuals, not abstract promises.</h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`} style={{ transitionDelay: "0.14s" }}>
            These charts render from demo values and show the exact layout your real imported data produces.
          </p>

          <div className={styles.chartsGrid}>
            <article className={`${styles.chartCard} ${styles.chartTall} ${styles.revealLeft}`}>
              <div className={styles.chartCardHeader}>
                <span className={styles.chartCardTitle}>Risk Signal Levels</span>
                <span className={styles.chartBadge}>Live Metrics</span>
              </div>

              <div className={styles.metricBars}>
                {riskSignals.map((metric) => (
                  <div key={metric.label} className={styles.metricRow}>
                    <div className={styles.metricLabel}>
                      <span>{metric.label}</span>
                      <span>{metric.value}</span>
                    </div>
                    <div className={styles.metricTrack}>
                      <div
                        className={`${styles.metricFill} ${styles[metric.tone]}`}
                        style={{ width: `${metric.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.chartFooter}>
                Higher bars indicate elevated risk in that dimension. Concentration and VaR95 are your primary signals to monitor.
              </div>
            </article>

            <article className={`${styles.chartCard} ${styles.chartTall} ${styles.revealRight}`}>
              <div className={styles.chartCardHeader}>
                <span className={styles.chartCardTitle}>Portfolio Drawdown (12-Month)</span>
                <span className={`${styles.chartBadge} ${styles.chartBadgeOrange}`}>Max -11%</span>
              </div>

              <div className={styles.drawdownChart}>
                <svg className={styles.drawdownSvg} viewBox="0 0 420 220" aria-hidden="true">
                  <defs>
                    <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(248,113,113,0.28)" />
                      <stop offset="100%" stopColor="rgba(248,113,113,0)" />
                    </linearGradient>
                  </defs>
                  <line x1="22" y1="26" x2="22" y2="184" className={styles.chartAxis} />
                  <line x1="22" y1="184" x2="398" y2="184" className={styles.chartAxis} />
                  <path
                    d="M22 44 H398 M22 84 H398 M22 124 H398 M22 164 H398"
                    className={styles.chartGrid}
                  />
                  <path
                    d="M36 62 C62 70, 76 94, 96 84 S136 140, 156 164 S196 140, 216 126 S256 116, 276 104 S316 98, 336 90 S366 78, 388 72 L388 184 L36 184 Z"
                    fill="url(#drawdownFill)"
                  />
                  <path
                    d="M36 62 C62 70, 76 94, 96 84 S136 140, 156 164 S196 140, 216 126 S256 116, 276 104 S316 98, 336 90 S366 78, 388 72"
                    className={styles.drawdownLine}
                  />
                  {[["Mar", 36], ["May", 96], ["Jul", 156], ["Sep", 216], ["Nov", 276], ["Jan", 336]].map(([label, x]) => (
                    <text key={label} x={x} y="206" className={styles.chartText}>
                      {label}
                    </text>
                  ))}
                </svg>
              </div>

              <div className={styles.chartFooter}>
                Drawdown measures peak-to-trough decline. Your current max drawdown sits at -11% over the trailing 12 months.
              </div>
            </article>

            <article className={`${styles.chartCard} ${styles.reveal}`} style={{ transitionDelay: "0.1s" }}>
              <div className={styles.chartCardHeader}>
                <span className={styles.chartCardTitle}>Sector Concentration</span>
                <span className={styles.chartBadge}>Top-3 = 42%</span>
              </div>

              <div className={styles.concentrationList}>
                {sectorConcentration.map((sector) => (
                  <div key={sector.label} className={styles.concentrationRow}>
                    <span className={styles.concentrationLabel}>{sector.label}</span>
                    <div className={styles.concentrationTrack}>
                      <div className={styles.concentrationFill} style={{ width: `${sector.value}%` }} />
                    </div>
                    <span className={styles.concentrationValue}>{sector.value}%</span>
                  </div>
                ))}
              </div>

              <div className={styles.chartFooter}>
                Hidden concentration is the most common risk for multi-source portfolios. Top-3 positions at 42% exceeds the 35% caution threshold.
              </div>
            </article>

            <article className={`${styles.chartCard} ${styles.reveal}`} style={{ transitionDelay: "0.18s" }}>
              <div className={styles.chartCardHeader}>
                <span className={styles.chartCardTitle}>ASX Session Movers</span>
                <span className={`${styles.chartBadge} ${styles.chartBadgeOrange}`}>Today</span>
              </div>

              <div className={styles.moversList}>
                {sessionMovers.map((mover) => (
                  <div key={mover.symbol} className={styles.moverRow}>
                    <span className={styles.moverSymbol}>{mover.symbol}</span>
                    <div className={styles.moverTrack}>
                      <div
                        className={`${styles.moverFill} ${mover.tone === "up" ? styles.moverUp : styles.moverDown}`}
                        style={{ width: `${mover.width}%` }}
                      />
                    </div>
                    <span className={`${styles.moverChange} ${mover.tone === "up" ? styles.up : styles.down}`}>
                      {mover.change}
                    </span>
                  </div>
                ))}
              </div>

              <div className={styles.chartFooter}>
                Holdings in your portfolio that moved today are highlighted. Dip alerts trigger on your configured thresholds.
              </div>
            </article>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.hero} id="ask-ai-hero" style={{ minHeight: "unset", paddingTop: "5rem", paddingBottom: "5rem" }}>
        <div className={styles.container}>
          <div className={styles.heroIntro}>
            <div className={`${styles.heroBadge} ${styles.reveal}`}>SPECTRE AI — Ask Your Portfolio Anything</div>
            <h2 className={`${styles.heroTitle} ${styles.reveal}`}>
              Grounded in your live holdings, <span>real-time data.</span>
            </h2>
            <p className={`${styles.heroSub} ${styles.reveal}`}>
              Ask direct questions about what is driving changes in value, momentum, and risk posture — powered by your imported portfolio data and live market context.
            </p>
            <div className={`${styles.heroActions} ${styles.reveal}`}>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Get Started Free
              </Link>
              <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.outlineButton} ${styles.heroButton}`}>
                Try Live Demo →
              </Link>
            </div>
          </div>

          <div className={`${styles.revealScale}`} style={{ flex: 1 }}>
            <div className={styles.smallLabel} style={{ marginBottom: "10px" }}>AI Console</div>
            <div className={styles.aiConsole}>
              <div className={styles.aiPrompt}>› What&apos;s driving BHP&apos;s recent price action in my portfolio?</div>
              <div className={styles.aiResponse}>
                <strong>BHP (7.3% of portfolio)</strong> is showing positive momentum driven by iron ore spot prices rebounding above USD 110/t. Concentration is near threshold — monitor if it exceeds <strong>8%</strong>. Upside driver: China stimulus expectations. Downside risk: USD strength.
                <span className={styles.aiCursor} />
              </div>
            </div>
            <div className={styles.miniGrid} style={{ marginTop: "14px" }}>
              <div className={styles.miniCard}>
                <div className={styles.smallLabel}>What AI Reads</div>
                <p>Holdings, weights, live price context, technical signals, concentration.</p>
              </div>
              <div className={styles.miniCard}>
                <div className={styles.smallLabel}>What You Get</div>
                <p>Top drivers, confidence-aware analysis, and follow-up review points.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="pro-ai">
        <div className={`${styles.container} ${styles.revealScale}`}>
          <div className={styles.proPanel}>
            <div>
              <div className={styles.proTag}>★ AI Analysis — All Plans</div>
              <h2 className={styles.sectionTitle}>Ask AI about your holdings — on every plan.</h2>
              <p className={styles.sectionSub}>
                AI holdings analysis is available at every tier. Ask direct questions about what is influencing the value of your current holdings. Pro unlocks unlimited queries.
              </p>
              <ul className={styles.proList}>
                <li>Ask AI about drivers behind your current holdings</li>
                <li>Get plain-English analysis of momentum and risk signals</li>
                <li>See AI reasoning alongside your portfolio context</li>
                <li>Includes trend, ROC, breakout, and pattern signal tags</li>
                <li>Highlights both upside drivers and downside pressure</li>
              </ul>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton}`}>
                Get Started Free →
              </Link>
            </div>

            <div>
              <div className={styles.smallLabel}>AI Console</div>
              <div className={styles.aiConsole}>
                <div className={styles.aiPrompt}>› What&apos;s driving BHP&apos;s recent price action in my portfolio?</div>
                <div className={styles.aiResponse}>
                  <strong>BHP (7.3% of portfolio)</strong> is showing positive momentum driven by iron ore spot prices rebounding above USD 110/t. Concentration is near threshold, so monitor if it exceeds <strong>8%</strong>. Upside driver: China stimulus expectations. Downside risk: USD strength.
                  <span className={styles.aiCursor} />
                </div>
              </div>

              <div className={styles.miniGrid}>
                <div className={styles.miniCard}>
                  <div className={styles.smallLabel}>What AI Reads</div>
                  <p>Holdings, weights, live price context, technical signals, concentration.</p>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.smallLabel}>What You Get</div>
                  <p>Top drivers, confidence-aware analysis, and follow-up review points.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="security">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Data Safety</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>Plain-English security and privacy controls.</h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`} style={{ transitionDelay: "0.14s" }}>These safeguards reflect the controls active in the current SPECTRE release.</p>

          <div className={styles.securityGrid}>
            {securityCards.map((card, index) => (
              <article
                key={card.title}
                className={`${styles.securityCard} ${styles.reveal}`}
                style={{ transitionDelay: `${index * 0.08}s` }}
              >
                <div className={`${styles.iconWrap} ${card.alt ? styles.iconAlt : ""}`}>{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="pricing">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Pricing</div>
          <h2 className={`${styles.sectionTitle} ${styles.centered} ${styles.reveal}`} style={{ transitionDelay: "0.07s" }}>Simple pricing, low barrier to start.</h2>
          <p className={`${styles.sectionSub} ${styles.centeredSub} ${styles.reveal}`} style={{ transitionDelay: "0.14s" }}>One private workspace per account. Cancel anytime through Stripe.</p>

          <div className={styles.pricingGrid}>
            <article className={`${styles.planCard} ${styles.reveal}`}>
              <div className={styles.planTier}>Free</div>
              <div className={styles.planPrice}>
                <span>$0</span>
                <small>/month</small>
              </div>
              <p>Get started at no cost with a private workspace and core dashboard for tracking your portfolio.</p>
              <ul>
                <li>One private investor workspace</li>
                <li>CSV/XLSX import for super, savings, ASX, crypto, index, funds, bullion</li>
                <li>Basic risk score and dashboard charts</li>
                <li>AI holdings analysis — daily queries included</li>
                <li>Email verification and password reset</li>
              </ul>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.outlineButton} ${styles.blockButton}`}>
                Get Started Free
              </Link>
            </article>

            <article className={`${styles.planCard} ${styles.featuredPlan} ${styles.reveal}`} style={{ transitionDelay: "0.1s" }}>
              <div className={styles.featuredBadge}>Most Popular</div>
              <div className={styles.planTier}>Plus</div>
              <div className={styles.planPrice}>
                <span>$2.99</span>
                <small>/month</small>
              </div>
              <p>Everything in Free, plus the market research terminal and full snapshot history.</p>
              <ul>
                <li>Everything in Free</li>
                <li>Market research terminal for ASX, macro, and sector context</li>
                <li>Price dip alerts and dip email notifications</li>
                <li>Snapshots and historical risk tracking</li>
              </ul>
              <div className={styles.planResearchCallout}>
                <div>
                  <strong>See Research</strong>
                  <span>Plus includes the market research terminal for ASX, macro, and sector context.</span>
                </div>
                <Link href="/research?demo=1" className={`${styles.button} ${styles.ghostButton}`}>
                  Preview Research
                </Link>
              </div>
              <Link href="/signin?mode=register&plan=plus" className={`${styles.button} ${styles.primaryButton} ${styles.blockButton}`}>
                Get Plus
              </Link>
            </article>

            <article className={`${styles.planCard} ${styles.reveal}`} style={{ transitionDelay: "0.2s" }}>
              <div className={styles.planTier}>Pro</div>
              <div className={styles.planPrice}>
                <span>$9.99</span>
                <small>/month</small>
              </div>
              <p>Advanced quant analytics with unlimited AI queries for serious investors.</p>
              <ul>
                <li>Everything in Plus, plus unlimited AI queries</li>
                <li>Expected Shortfall (ES 95) tail risk</li>
                <li>Beta &amp; tracking error vs ASX 200</li>
                <li>Date-aligned benchmark analytics</li>
              </ul>
              <div className={styles.planResearchCallout}>
                <div>
                  <strong>See Research</strong>
                  <span>Pro pairs the research terminal with advanced analytics and Ask AI holdings analysis.</span>
                </div>
                <Link href="/research?demo=1" className={`${styles.button} ${styles.ghostButton}`}>
                  Preview Research
                </Link>
              </div>
              <Link href="/signin?mode=register&plan=pro" className={`${styles.button} ${styles.outlineButton} ${styles.blockButton}`}>
                Get Pro
              </Link>
            </article>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Why SPECTRE?</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>There&apos;s a smarter way to manage portfolio risk.</h2>

          <div className={styles.compareGrid}>
            <div className={`${styles.compareColumn} ${styles.revealLeft}`}>
              <div className={styles.compareHead}>Other Approaches</div>
              <CompareItem tone="bad">Scattered spreadsheets, no unified risk view</CompareItem>
              <CompareItem tone="bad">Manual tracking across multiple platforms</CompareItem>
              <CompareItem tone="bad">Hidden concentration goes undetected</CompareItem>
              <CompareItem tone="bad">No VaR, drawdown, or correlation analysis</CompareItem>
              <CompareItem tone="bad">No dip alerts or market-linked signals</CompareItem>
            </div>

            <div className={`${styles.compareColumn} ${styles.compareHighlight} ${styles.revealRight}`}>
              <div className={styles.compareHead}>
                SPECTRE
                <span className={styles.compareTag}>Risk-Ready</span>
              </div>
              <CompareItem tone="good">One unified risk dashboard across all sources</CompareItem>
              <CompareItem tone="good">Automated CSV normalization in seconds</CompareItem>
              <CompareItem tone="good">Concentration alerts with threshold scoring</CompareItem>
              <CompareItem tone="good">VaR95, drawdown, volatility &amp; benchmark analytics</CompareItem>
              <CompareItem tone="good">ASX session movers with dip email alerts</CompareItem>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>FAQ</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>Got questions? We&apos;ve got answers.</h2>

          <div className={`${styles.faqList} ${styles.reveal}`}>
            {faqs.map((faq, index) => (
              <div
                key={faq.question}
                className={`${styles.faqItem} ${activeFaqIndex === index ? styles.faqOpen : ""}`}
              >
                <button
                  type="button"
                  className={styles.faqButton}
                  aria-expanded={activeFaqIndex === index}
                  onClick={() => setActiveFaqIndex((current) => (current === index ? -1 : index))}
                >
                  <span>{faq.question}</span>
                  <svg className={styles.faqChevron} viewBox="0 0 24 24" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className={styles.faqAnswer}>
                  <p>{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className={styles.ctaSection}>
        <div className={`${styles.container} ${styles.revealScale}`}>
          <div className={styles.ctaPanel}>
            <div className={styles.heroBadge}>Start today — no commitment</div>
            <h2>Ready to see your portfolio risk clearly?</h2>
            <p>It takes minutes to import your first CSV and get a risk score. Start free, upgrade anytime.</p>
            <div className={styles.heroActions}>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Get Started Free
              </Link>
              <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.outlineButton} ${styles.heroButton}`}>
                See Live Demo
              </Link>
            </div>
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div>
              <div className={styles.brand}>SPECTRE</div>
              <p className={styles.footerTagline}>
                System for Portfolio Exposure, Correlation, Threat &amp; Risk Evaluation. Purpose-built for investors managing multi-source portfolios.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#workflow">How It Works</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#pro-ai">AI Analysis</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><Link href="/dashboard?demo=1">Live Demo</Link></li>
              </ul>
            </div>
            <div>
              <h4>Legal</h4>
              <ul>
                <li><Link href="/terms">Terms of Service</Link></li>
                <li><Link href="/privacy">Privacy Policy</Link></li>
                <li><a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a></li>
              </ul>
            </div>
          </div>

          <div className={styles.footerBottom}>
            <p>
              Disclaimer: SPECTRE provides informational analytics only. Not financial, investment, tax, or legal advice. No result is guaranteed to be complete, current, or accurate. Use at your own risk. Copyright 2026 SPECTRE.
            </p>
            <a href="mailto:admin@spectre-assets.com">admin@spectre-assets.com</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Divider() {
  return <hr className={styles.divider} />;
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "up" | "down";
}) {
  return (
    <article className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={tone === "up" ? styles.up : tone === "down" ? styles.down : styles.statSub}>{sub}</div>
    </article>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: color }} />
      {label}
      <span className={styles.legendValue}>{value}</span>
    </div>
  );
}

function CompareItem({ children, tone }: { children: ReactNode; tone: "good" | "bad" }) {
  return (
    <div className={styles.compareItem}>
      <span className={`${styles.compareIcon} ${tone === "good" ? styles.compareGood : styles.compareBad}`}>
        {tone === "good" ? "✓" : "✕"}
      </span>
      <span>{children}</span>
    </div>
  );
}

function AITeaser() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const goToSignIn = (q?: string) => {
    router.push(`/signin?mode=register&plan=pro${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  };

  return (
    <div className={styles.aiTeaser}>
      <div className={styles.aiTeaserHeader}>
        <div className={styles.aiTeaserHeaderLeft}>
          <span className={styles.aiPulseDot} />
          <span>Ask SPECTRE AI</span>
        </div>
        <span className={styles.proTag}>Pro AI</span>
      </div>

      <div className={styles.aiTeaserInput}>
        <input
          type="text"
          className={styles.aiInput}
          placeholder="e.g. What's my top concentration risk right now?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && goToSignIn(query)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={styles.aiSendButton}
          onClick={() => goToSignIn(query)}
          aria-label="Ask AI"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <div className={styles.aiSuggestions}>
        {["What's my top risk?", "BHP concentration?", "VaR impact", "Sector exposure"].map((s) => (
          <button
            key={s}
            type="button"
            className={styles.aiChip}
            onClick={() => goToSignIn(s)}
          >
            {s}
          </button>
        ))}
        <span className={styles.aiLockNote}>
          <svg viewBox="0 0 24 24" aria-hidden="true" width="11" height="11">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Sign in to use
        </span>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 20V10" />
      <path d="M12 20V4" />
      <path d="M6 20v-6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
