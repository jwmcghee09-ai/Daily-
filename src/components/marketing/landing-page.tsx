"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import styles from "./landing-page.module.css";

type CheckoutPlan = "starter" | "pro";
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
    title: "Security Controls",
    copy:
      "Email verification, scrypt hashed passwords, encrypted backups, and hardened HSTS/CSP headers in production.",
    icon: <LockIcon />,
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
    question: "How is Pro AI different from the base dashboard?",
    answer:
      "Starter gives you the quantitative dashboard. Pro AI adds a natural-language console where you can ask questions about your holdings and get plain-English analysis tied to your imported portfolio.",
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

  useEffect(() => {
    const reveals = document.querySelectorAll<HTMLElement>(
      `.${styles.reveal}, .${styles.revealLeft}, .${styles.revealRight}, .${styles.revealScale}`,
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

  const checkoutMessage =
    checkoutState === "success"
      ? `${checkoutPlan === "pro" ? "Pro" : "Starter"} plan checkout complete. Your subscription will activate shortly.`
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
            <a href="#pro-ai">Pro AI</a>
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
            <Link href="/signin?mode=register&plan=starter" className={`${styles.button} ${styles.primaryButton}`}>
              Start for $3/mo
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
              <Link href="/signin?mode=register&plan=starter" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Start for $3 / Month
              </Link>
              <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.outlineButton} ${styles.heroButton}`}>
                See Live Demo →
              </Link>
            </div>
          </div>

          <div className={`${styles.dashboardCard} ${styles.reveal}`}>
            <div className={styles.dashboardHeader}>
              <div className={styles.dashboardDots}>
                <span />
                <span />
                <span />
              </div>
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
      </section>

      <Divider />

      <section className={styles.section} id="workflow">
        <div className={styles.container}>
          <div className={styles.sectionLabel}>3-Step Workflow</div>
          <h2 className={styles.sectionTitle}>From CSV to risk clarity.</h2>
          <p className={styles.sectionSub}>
            Upload files, normalize holdings, then review your risk score and exposure metrics. Purpose-built for Australian investors managing multi-source portfolios.
          </p>

          <div className={styles.steps}>
            {workflowSteps.map((step, index) => (
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

          <div className={styles.beforeAfter}>
            <article className={`${styles.beforeAfterCard} ${styles.revealLeft}`}>
              <span className={`${styles.badge} ${styles.badgeDanger}`}>Before SPECTRE</span>
              <h3>&quot;Looks diversified&quot;</h3>
              <p>
                Many line items scattered across multiple statements and platforms. No unified risk view. Hidden concentration goes undetected.
              </p>
            </article>
            <article className={`${styles.beforeAfterCard} ${styles.afterCard} ${styles.revealRight}`}>
              <span className={`${styles.badge} ${styles.badgeAccent}`}>After SPECTRE</span>
              <h3>Top-3 = 42% Exposure</h3>
              <p>
                SPECTRE surfaces hidden concentration and downside sensitivity in a single risk score. You see exactly where your risk is and can act faster.
              </p>
            </article>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="features">
        <div className={styles.container}>
          <div className={styles.sectionLabel}>Features</div>
          <h2 className={styles.sectionTitle}>Designed for clarity, built for risk decisions.</h2>
          <p className={styles.sectionSub}>
            Every feature is purpose-built for Australian investors who need a clear, consolidated risk view across multiple account types.
          </p>

          <div className={`${styles.featureGrid} ${styles.reveal}`}>
            {features.map((feature) => (
              <article key={feature.title} className={styles.featureItem}>
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
          <div className={styles.sectionLabel}>Feature Preview</div>
          <h2 className={styles.sectionTitle}>Concrete dashboard visuals, not abstract promises.</h2>
          <p className={styles.sectionSub}>
            These charts render from demo values and show the exact layout your real imported data produces.
          </p>

          <div className={`${styles.chartsGrid} ${styles.reveal}`}>
            <article className={`${styles.chartCard} ${styles.chartTall}`}>
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

            <article className={`${styles.chartCard} ${styles.chartTall}`}>
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

            <article className={styles.chartCard}>
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

            <article className={styles.chartCard}>
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

      <section className={styles.section} id="pro-ai">
        <div className={`${styles.container} ${styles.revealScale}`}>
          <div className={styles.proPanel}>
            <div>
              <div className={styles.proTag}>★ Pro AI — Premium Only</div>
              <h2 className={styles.sectionTitle}>Ask AI about your holdings in plain English.</h2>
              <p className={styles.sectionSub}>
                Upgrade to Pro to ask direct questions about what is influencing the value of your current holdings, powered by your imported portfolio data.
              </p>
              <ul className={styles.proList}>
                <li>Ask AI about drivers behind your current holdings</li>
                <li>Get plain-English analysis of momentum and risk signals</li>
                <li>See AI reasoning alongside your portfolio context</li>
                <li>Includes trend, ROC, breakout, and pattern signal tags</li>
                <li>Highlights both upside drivers and downside pressure</li>
              </ul>
              <Link href="/signin?mode=register&plan=pro" className={`${styles.button} ${styles.primaryButton}`}>
                See Pro Plan
              </Link>
            </div>

            <div>
              <div className={styles.smallLabel}>Pro AI Console</div>
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
          <div className={styles.sectionLabel}>Data Safety</div>
          <h2 className={styles.sectionTitle}>Plain-English security and privacy controls.</h2>
          <p className={styles.sectionSub}>These safeguards reflect the controls active in the current SPECTRE release.</p>

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
          <div className={styles.sectionLabel}>Pricing</div>
          <h2 className={`${styles.sectionTitle} ${styles.centered}`}>Simple pricing, low barrier to start.</h2>
          <p className={`${styles.sectionSub} ${styles.centeredSub}`}>One private workspace per account. Cancel anytime through Stripe.</p>

          <div className={styles.pricingGrid}>
            <article className={`${styles.planCard} ${styles.reveal}`}>
              <div className={styles.planTier}>Starter</div>
              <div className={styles.planPrice}>
                <span>$3</span>
                <small>/month</small>
              </div>
              <p>Everything you need to get a clear picture of your investment risk across all account types.</p>
              <ul>
                <li>One private investor workspace</li>
                <li>CSV/XLSX import for super, savings, ASX, crypto, index, funds, bullion</li>
                <li>Risk score, dashboard charts, and snapshots</li>
                <li>Email verification and password reset</li>
              </ul>
              <Link href="/signin?mode=register&plan=starter" className={`${styles.button} ${styles.outlineButton} ${styles.blockButton}`}>
                Get Starter
              </Link>
            </article>

            <article className={`${styles.planCard} ${styles.featuredPlan} ${styles.reveal}`} style={{ transitionDelay: "0.1s" }}>
              <div className={styles.featuredBadge}>Most Popular</div>
              <div className={styles.planTier}>Pro</div>
              <div className={styles.planPrice}>
                <span>$9.99</span>
                <small>/month</small>
              </div>
              <p>Advanced quant analytics and AI-powered holdings analysis for serious investors.</p>
              <ul>
                <li>Everything in Starter</li>
                <li>Expected Shortfall (ES 95) tail risk</li>
                <li>Beta &amp; tracking error vs ASX 200</li>
                <li>Date-aligned benchmark analytics</li>
                <li>Ask AI holdings analysis for portfolio drivers</li>
                <li>Advanced reporting and team workflows</li>
              </ul>
              <Link href="/signin?mode=register&plan=pro" className={`${styles.button} ${styles.primaryButton} ${styles.blockButton}`}>
                Get Pro
              </Link>
            </article>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionLabel}>Why SPECTRE?</div>
          <h2 className={styles.sectionTitle}>There&apos;s a smarter way to manage portfolio risk.</h2>

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
          <div className={styles.sectionLabel}>FAQ</div>
          <h2 className={styles.sectionTitle}>Got questions? We&apos;ve got answers.</h2>

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
            <p>It takes minutes to import your first CSV and get a risk score. Start for $3/month.</p>
            <div className={styles.heroActions}>
              <Link href="/signin?mode=register&plan=starter" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Start for $3 / Month
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
                <li><a href="#pro-ai">Pro AI</a></li>
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
