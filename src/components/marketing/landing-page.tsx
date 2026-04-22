"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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

const TICKER_FALLBACK = [
  { label: "BHP",     price: "45.82",  delta: "+1.2%", tone: "up" },
  { label: "CBA",     price: "131.44", delta: "-0.4%", tone: "dn" },
  { label: "AUD/USD", price: "0.6290", delta: "+0.2%", tone: "up" },
  { label: "GOLD",    price: "3112",   delta: "+0.8%", tone: "up" },
  { label: "WTI",     price: "69.86",  delta: "-1.9%", tone: "dn" },
  { label: "BTC",     price: "84.2k",  delta: "+1.4%", tone: "up" },
  { label: "ETH",     price: "1,965",  delta: "+2.3%", tone: "up" },
  { label: "CSL",     price: "288.10", delta: "+0.7%", tone: "up" },
  { label: "MQG",     price: "218.75", delta: "+1.4%", tone: "up" },
  { label: "FMG",     price: "18.44",  delta: "-2.1%", tone: "dn" },
  { label: "VIX",     price: "21.4",   delta: "-6.1%", tone: "dn" },
] as { label: string; price: string; delta: string; tone: string }[];

const workflowSteps: readonly WorkflowStep[] = [
  {
    number: "01 — IMPORT",
    title: "Import Every Source",
    copy: "Bring in broker, super, crypto, fund, savings, tax, and bullion exports without rebuilding your spreadsheet stack.",
    icon: <UploadIcon />,
  },
  {
    number: "02 — NORMALIZE",
    title: "Build Portfolio Context",
    copy: "SPECTRE merges holdings, prices, sectors, account buckets, snapshots, and benchmark context into one AI-ready workspace.",
    icon: <GridIcon />,
    alt: true,
  },
  {
    number: "03 — REVIEW",
    title: "Ask, Simulate, Monitor",
    copy: "Run AI analysis, Monte Carlo scenarios, VaR and drawdown checks, and live dip alerts from the same system.",
    icon: <PulseIcon />,
  },
] as const;

const features: readonly MarketingCard[] = [
  {
    title: "AI Portfolio Analyst",
    copy: "Natural-language answers grounded in holdings, weights, live pricing, snapshots, and research context.",
    icon: <UploadIcon />,
  },
  {
    title: "Cross-Source Ingestion",
    copy: "CommSec, broker exports, super, ETFs, funds, crypto, savings, tax reports, and bullion in one workflow.",
    icon: <PulseIcon />,
    alt: true,
  },
  {
    title: "Quant Risk Engine",
    copy: "Risk score, VaR95, Expected Shortfall, beta, tracking error, correlation, drawdown, and data-quality checks.",
    icon: <BarsIcon />,
  },
  {
    title: "Research Terminal",
    copy: "ASX, macro, earnings, crypto, commodities, FRED signals, central-bank rates, and CFTC positioning.",
    icon: <BarsIcon />,
  },
  {
    title: "Monte Carlo & Stress",
    copy: "10,000-path portfolio projections with bull, base, and bear outcomes tied to your imported holdings.",
    icon: <ClockIcon />,
    alt: true,
  },
  {
    title: "Alerts & History",
    copy: "Snapshot history, data-quality confidence, and dip alerts so AI has memory and you have follow-through.",
    icon: <BellIcon />,
    alt: true,
  },
] as const;

const riskSignals = [
  { label: "Concentration", value: 82, tone: "purple" },
  { label: "Expected Shortfall", value: 74, tone: "pink" },
  { label: "Tracking Error", value: 58, tone: "orange" },
  { label: "Beta vs ASX 200", value: 63, tone: "amber" },
  { label: "Data Quality", value: 91, tone: "soft" },
] as const;

const sectorConcentration = [
  { label: "ASX Equities", value: 32 },
  { label: "Super", value: 28 },
  { label: "Funds / ETFs", value: 16 },
  { label: "Crypto", value: 12 },
  { label: "Bullion", value: 8 },
  { label: "Cash", value: 4 },
] as const;

const sessionMovers = [
  { symbol: "P90", change: "$1.62M", width: 100, tone: "up" },
  { symbol: "P75", change: "$1.49M", width: 82, tone: "up" },
  { symbol: "P50", change: "$1.36M", width: 66, tone: "up" },
  { symbol: "P25", change: "$1.22M", width: 46, tone: "down" },
  { symbol: "P10", change: "$1.08M", width: 28, tone: "down" },
] as const;

const securityCards: readonly MarketingCard[] = [
  {
    title: "No data selling",
    copy: "Your portfolio is used only to generate your workspace. We don't share or sell it.",
    icon: <UsersIcon />,
  },
  {
    title: "Delete anytime",
    copy: "Clear holdings, snapshots, and alerts from the dashboard whenever you want.",
    icon: <TrashIcon />,
    alt: true,
  },
  {
    title: "Secure accounts",
    copy: "scrypt password hashing, secure cookies, and Stripe-hosted checkout.",
    icon: <LockIcon />,
  },
  {
    title: "Hardened hosting",
    copy: "HTTPS with CSP, HSTS, anti-framing headers, and encrypted backups.",
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
      "The risk score is a 0 to 100 portfolio health signal built from concentration, drawdown, VaR and Expected Shortfall, benchmark sensitivity, volatility, and data quality confidence.",
  },
  {
    question: "How is AI analysis different on Pro vs Free?",
    answer:
      "Every plan gets the same holdings-aware AI workflow, but usage limits differ. Free includes 3 AI sessions per month, Plus includes 20 per month, and Pro unlocks unlimited AI plus the deepest quant analytics.",
  },
  {
    question: "What data does the research terminal include?",
    answer:
      "The research terminal covers ASX equities, earnings, macro, crypto, commodities, oil, gold, central-bank rates, treasury curves, FRED macro signals, CFTC positioning, analyst targets, and live market news.",
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
  const [activeFaqIndex, setActiveFaqIndex] = useState(-1);
  const heroProductRef = useRef<HTMLDivElement>(null);
  const stickySectionRef = useRef<HTMLElement>(null);
  const aiConsoleRef = useRef<HTMLDivElement>(null);
  const aiSectionRef = useRef<HTMLElement>(null);
  const [activeStickyPanel, setActiveStickyPanel] = useState(0);
  const [tickerItems, setTickerItems] = useState(TICKER_FALLBACK);

  useEffect(() => {
    let cancelled = false;

    async function fetchTape() {
      try {
        const res = await fetch("/api/market/tape");
        if (!res.ok) return;
        const data = (await res.json()) as { tape: typeof TICKER_FALLBACK };
        if (!cancelled && Array.isArray(data.tape) && data.tape.length > 0) {
          setTickerItems(data.tape);
        }
      } catch {
        // keep fallback
      }
    }

    void fetchTape();
    const interval = setInterval(() => { void fetchTape(); }, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const reveals = document.querySelectorAll<HTMLElement>(
      `.${styles.reveal}, .${styles.revealLeft}, .${styles.revealRight}, .${styles.revealScale}, .${styles.revealUp}`,
    );
    const compactMotion = typeof window !== "undefined" && window.innerWidth <= 960;

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add(styles.visible);
          revealObserver.unobserve(entry.target);
        });
      },
      {
        threshold: compactMotion ? 0.03 : 0.08,
        rootMargin: compactMotion ? "0px 0px -10% 0px" : "0px",
      },
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
      const compactMotion = window.innerWidth <= 960;
      const heroProduct = heroProductRef.current;
      if (heroProduct) {
        const p = Math.min(window.scrollY / window.innerHeight, 1);
        const e = 1 - Math.pow(1 - p, 2.5);
        const startScale = compactMotion ? 0.92 : 0.82;
        const scaleRange = compactMotion ? 0.08 : 0.18;
        const startOffset = compactMotion ? 24 : 60;
        const startOpacity = compactMotion ? 0.72 : 0.35;
        const opacityRange = compactMotion ? 0.28 : 0.65;
        heroProduct.style.transform = `scale(${(startScale + e * scaleRange).toFixed(4)}) translateY(${((1 - e) * startOffset).toFixed(1)}px)`;
        heroProduct.style.opacity = (startOpacity + e * opacityRange).toFixed(3);
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
      const aiSection = aiSectionRef.current;
      const aiConsole = aiConsoleRef.current;
      if (aiSection && aiConsole) {
        const rect = aiSection.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (window.innerHeight - rect.top) / (window.innerHeight * 0.72)));
        const e = 1 - Math.pow(1 - p, 3);
        const startScale = compactMotion ? 0.9 : 0.72;
        const scaleRange = compactMotion ? 0.1 : 0.28;
        const startOffset = compactMotion ? 18 : 50;
        const startOpacity = compactMotion ? 0.5 : 0;
        aiConsole.style.transform = `scale(${(startScale + e * scaleRange).toFixed(4)}) translateY(${((1 - e) * startOffset).toFixed(1)}px)`;
        aiConsole.style.opacity = (startOpacity + e * (1 - startOpacity)).toFixed(3);
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
            <a href="#ai">AI Analysis</a>
            <a href="#pricing">Pricing</a>
            <a href="#security">Security</a>
          </div>

          <div className={styles.navActions}>
            <a href="/dashboard?demo=1" className={`${styles.button} ${styles.demoButton}`}>
              <span className={styles.demoDot} />
              Live Demo
            </a>
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
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <span key={`${item.label}-${index}`} className={styles.tickerItem}>
              <span className={styles.tickerSymbol}>{item.label}</span>
              <span className={styles.tickerPrice}>{item.price}</span>
              <span className={item.tone === "up" ? styles.up : styles.down}>{item.delta}</span>
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
            <div className={`${styles.heroBadge} ${styles.reveal}`}>SPECTRE — AI Portfolio Intelligence</div>
            <h1 className={`${styles.heroTitle} ${styles.reveal}`}>
              The AI operating system<br /><span>for your portfolio.</span>
            </h1>
            <p className={`${styles.heroSub} ${styles.reveal}`}>
              SPECTRE turns holdings, research, and market data into one AI-native workspace for quant analysis, live research, and faster portfolio decisions.
            </p>
            <div className={`${styles.heroActions} ${styles.reveal}`}>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Get Started Free
              </Link>
              <a href="/dashboard?demo=1" className={`${styles.button} ${styles.outlineButton} ${styles.heroButton}`}>
                See Live Demo →
              </a>
            </div>

          </div>

          <div ref={heroProductRef} className={styles.heroProduct}>
          <div className={styles.dashboardCard}>
            <div className={styles.dashboardHeader}>
              <div className={styles.dashboardUrl}>spectre-assets.com / dashboard</div>
            </div>

            <div className={styles.dashboardStats}>
              <StatCard label="Portfolio Value" value="$1.27M" sub="+2.1% MTD" tone="up" />
              <StatCard label="Import Sources" value="8" sub="Broker, super, crypto, bullion" />
              <StatCard label="AI Coverage" value="24" sub="Holdings + research context" />
              <StatCard label="Monte Carlo" value="10,000" sub="1Y simulation paths" />
            </div>

            <div className={styles.dashboardCharts}>
              <div className={styles.chartBox}>
                <div className={styles.chartTitle}>AI Risk Snapshot — 72 / 100 (Elevated)</div>
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
                <div className={styles.riskMeta}>Concentration · VaR95 · Expected Shortfall · Beta · Tracking Error</div>
                <div className={styles.riskBar}>
                  <div className={styles.riskBarFill} />
                </div>
              </div>

              <div className={styles.chartBox}>
                <div className={styles.chartTitle}>Source Mix</div>
                <div className={styles.donutWrap}>
                  <svg width="88" height="88" viewBox="0 0 80 80" aria-hidden="true">
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#111318" strokeWidth="16" />
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#a855f7" strokeWidth="16" strokeDasharray="81 95" strokeDashoffset="24" transform="rotate(-90 40 40)" />
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#ff7a30" strokeWidth="16" strokeDasharray="50 95" strokeDashoffset="-57" transform="rotate(-90 40 40)" />
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#e879f9" strokeWidth="16" strokeDasharray="28 95" strokeDashoffset="-107" transform="rotate(-90 40 40)" />
                    <circle cx="40" cy="40" r="28" fill="none" stroke="#fb923c" strokeWidth="16" strokeDasharray="18 95" strokeDashoffset="-135" transform="rotate(-90 40 40)" />
                  </svg>
                  <div className={styles.legend}>
                    <LegendItem color="#a855f7" label="ASX Equities" value="32%" />
                    <LegendItem color="#ff7a30" label="Super" value="28%" />
                    <LegendItem color="#e879f9" label="Funds / ETFs" value="16%" />
                    <LegendItem color="#fb923c" label="Crypto + Bullion" value="24%" />
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
              { val: "8", label: "Import Sources" },
              { val: "14+", label: "Risk Signals" },
              { val: "10,000", label: "Monte Carlo Paths" },
              { val: "3", label: "Quant · AI · Research" },
            ].map(({ val, label }) => (
              <div key={label} className={styles.statStat}>
                <div className={styles.statStatVal}>{val}</div>
                <div className={styles.statStatLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className={styles.aiRevealSection} id="ai" ref={aiSectionRef}>
        <div className={styles.container}>
          <div className={styles.aiRevealHead}>
            <div className={`${styles.sectionLabel} ${styles.reveal}`}>AI Portfolio Analyst</div>
            <h2 className={`${styles.aiRevealTitle} ${styles.reveal}`} style={{ transitionDelay: "0.07s" }}>
              Ask your portfolio<br /><span>with context.</span>
            </h2>
            <p className={`${styles.aiRevealSub} ${styles.reveal}`} style={{ transitionDelay: "0.14s" }}>
              Not generic finance chat. SPECTRE AI reads your holdings, live pricing, benchmark risk, research terminal data, and saved snapshots before it answers.
            </p>
          </div>
          <div ref={aiConsoleRef} className={styles.aiConsoleReveal}>
            <div className={styles.aiConsoleRevealInner}>
              <div className={styles.aiConsoleRevealLabel}>
                <span className={styles.aiPulseDot} />
                <span>AI Console</span>
                <span className={styles.proTag} style={{ marginLeft: "auto" }}>All Plans</span>
              </div>
              <div className={styles.aiConsole}>
                <div className={styles.aiPrompt}>› What is most likely influencing the value of my current holdings right now?</div>
                <div className={styles.aiResponse}>
                  <strong>Your top drivers today</strong> are bank concentration, AUD weakness, and the commodity sleeve. CBA and NAB are lifting portfolio value, while FMG and WTI-linked energy exposure are adding downside volatility. Risk remains elevated because the top 3 positions are <strong>42%</strong> of the book and 1-day <strong>VaR 95%</strong> is above your recent median.
                  <span className={styles.aiCursor} />
                </div>
              </div>
              <div className={styles.miniGrid} style={{ marginTop: "14px" }}>
                <div className={styles.miniCard}>
                  <div className={styles.smallLabel}>What AI Reads</div>
                  <p>Holdings, weights, live quotes, sector mix, benchmark risk, research signals, and snapshot history.</p>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.smallLabel}>What AI Returns</div>
                  <p>Portfolio drivers, holding-level explanations, risk flags, next actions, and confidence-based follow-up checks.</p>
                </div>
              </div>
              <div className={styles.aiRevealCta}>
                <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                  Start Asking Free →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="research">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Research Terminal</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>Live market context for every answer.</h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`} style={{ transitionDelay: "0.14s" }}>
            The same research system feeding the product: ASX, macro, earnings, crypto, commodities, oil, gold, treasury curves, and FRED/CFTC signals in one place.
          </p>

          <div className={styles.researchHighlights}>
            {[
              { name: "Live Core Tape", sub: "ASX 200, AUD/USD, VIX, gold, WTI crude, BTC, ETH, and SOL with live hero cards.", alt: false },
              { name: "ASX Equities", sub: "Top constituents, sector breadth, gainers/losers, analyst targets, and interactive stock charts.", alt: false },
              { name: "Macro & Commodities", sub: "Treasury curve, central-bank rates, FX, gold, oil, inflation, and risk-on / risk-off context.", alt: false },
              { name: "FRED + CFTC", sub: "Credit spreads, breakevens, money supply, Fed balance sheet, and managed-money positioning.", alt: true },
              { name: "12 ASX Earnings Names", sub: "Calendar, surprises, fundamentals, and preview context for banks, miners, healthcare, and energy.", alt: true },
              { name: "News + Calendar", sub: "Headline feed, economic calendar, and session context ready to feed the AI workflow.", alt: true },
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
            <a href="/research?demo=1" className={`${styles.button} ${styles.primaryButton}`}>
              See Research Demo
            </a>
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
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>One AI-native workspace across quant, research, and monitoring.</h2>

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
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Dashboard Preview</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>What the live system actually tracks.</h2>

          <div className={styles.chartsGrid}>
            <article className={`${styles.chartCard} ${styles.chartTall} ${styles.revealLeft}`}>
              <div className={styles.chartCardHeader}>
                <span className={styles.chartCardTitle}>Risk Engine Surface</span>
                <span className={styles.chartBadge}>Quant Signals</span>
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
                The production dashboard combines concentration, tail-risk, benchmark, and data-confidence layers.
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
                Snapshot history lets AI compare current stress to prior portfolio states.
              </div>
            </article>

            <article className={`${styles.chartCard} ${styles.reveal}`} style={{ transitionDelay: "0.1s" }}>
              <div className={styles.chartCardHeader}>
                <span className={styles.chartCardTitle}>Portfolio Exposure Mix</span>
                <span className={styles.chartBadge}>Cross-Source</span>
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
                SPECTRE understands asset-type and source exposure, not just ticker counts.
              </div>
            </article>

            <article className={`${styles.chartCard} ${styles.reveal}`} style={{ transitionDelay: "0.18s" }}>
              <div className={styles.chartCardHeader}>
                <span className={styles.chartCardTitle}>Monte Carlo Projection (1Y)</span>
                <span className={`${styles.chartBadge} ${styles.chartBadgeOrange}`}>500 Paths</span>
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
                Pro workspaces project P10 to P90 outcomes from the imported portfolio, not a generic model portfolio.
              </div>
            </article>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="security">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Security</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>Your data stays yours.</h2>

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
          <h2 className={`${styles.sectionTitle} ${styles.centered} ${styles.reveal}`} style={{ transitionDelay: "0.07s" }}>Start with the AI workspace you need.</h2>
          <p className={`${styles.sectionSub} ${styles.centeredSub} ${styles.reveal}`} style={{ transitionDelay: "0.14s" }}>One private workspace per account. Upgrade from quant + AI basics to full research and pro analytics anytime.</p>

          <div className={styles.pricingGrid}>
            <article className={`${styles.planCard} ${styles.reveal}`}>
              <div className={styles.planTier}>Free</div>
              <div className={styles.planPrice}>
                <span>$0</span>
                <small>/month</small>
              </div>
              <p>Your private quant dashboard with foundational AI access.</p>
              <ul>
                <li>Multi-source CSV/XLSX import</li>
                <li>Quant dashboard with risk score, VaR, drawdown, and exposure views</li>
                <li>3 AI sessions per month</li>
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
              <p>The full research stack plus more AI usage.</p>
              <ul>
                <li>Everything in Free</li>
                <li>20 AI sessions per month</li>
                <li>Market research terminal</li>
                <li>Dip alerts and snapshot history</li>
              </ul>
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
              <p>The full AI analyst workflow with the deepest quant tooling.</p>
              <ul>
                <li>Everything in Plus</li>
                <li>Unlimited AI queries</li>
                <li>Monte Carlo simulation and stress projections</li>
                <li>Expected Shortfall, beta, tracking error, and deeper benchmark analytics</li>
              </ul>
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
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>An AI company built around portfolio context.</h2>

          <div className={styles.compareGrid}>
            <div className={`${styles.compareColumn} ${styles.revealLeft}`}>
              <div className={styles.compareHead}>Other Approaches</div>
              <CompareItem tone="bad">Generic chat tools with no view of your actual holdings</CompareItem>
              <CompareItem tone="bad">Portfolio apps with charts but no real research context</CompareItem>
              <CompareItem tone="bad">Manual spreadsheets for super, crypto, bullion, and broker accounts</CompareItem>
              <CompareItem tone="bad">No Monte Carlo, benchmark sensitivity, or tail-risk layer</CompareItem>
              <CompareItem tone="bad">No alerts, snapshots, or memory between decisions</CompareItem>
            </div>

            <div className={`${styles.compareColumn} ${styles.compareHighlight} ${styles.revealRight}`}>
              <div className={styles.compareHead}>
                SPECTRE
                <span className={styles.compareTag}>AI-Native</span>
              </div>
              <CompareItem tone="good">AI answers grounded in holdings, pricing, benchmarks, and research</CompareItem>
              <CompareItem tone="good">One unified workspace across quant, AI, and live research</CompareItem>
              <CompareItem tone="good">Automated normalization across super, broker, crypto, bullion, and funds</CompareItem>
              <CompareItem tone="good">VaR, ES, drawdown, beta, tracking error, and Monte Carlo in one system</CompareItem>
              <CompareItem tone="good">Alerts, snapshots, and market-linked monitoring built in</CompareItem>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>FAQ</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`} style={{ transitionDelay: "0.07s" }}>Common questions.</h2>

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
            <div className={styles.heroBadge}>Start free — no card required</div>
            <h2>Give your portfolio an AI analyst.</h2>
            <p>Import your first files and open Quant, AI, and Research in one private workspace.</p>
            <div className={styles.heroActions}>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Get Started Free
              </Link>
              <a href="/dashboard?demo=1" className={`${styles.button} ${styles.outlineButton} ${styles.heroButton}`}>
                See Live Demo
              </a>
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
                AI portfolio intelligence for Australian investors managing multi-source portfolios across quant, research, and live monitoring.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#workflow">How It Works</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#ai">AI Analysis</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="/dashboard?demo=1">Live Demo</a></li>
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
