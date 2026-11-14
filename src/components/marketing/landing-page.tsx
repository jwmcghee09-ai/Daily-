"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ChatGPTMark,
  ClaudeMark,
  CursorMark,
  LMStudioMark,
  OllamaMark,
  ZedMark,
} from "./client-logos";
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

/*
 * Every figure on this page comes from one dataset: the demo workspace in
 * src/lib/demo-portfolio.ts.
 *
 * It used to come from wherever each section was written. The ticker said BHP
 * 45.82 up 1.2% while the research panel below said 57.54 down 2.7%; CBA was
 * down 0.4% in one and up 0.4% in the other; the hero claimed a $1.27M book and
 * the connector example a $54,428 one. Any of those read alone is fine. Read
 * together — which is what a finance person does — they say the numbers are
 * decoration, and that is a bad first impression for a risk tool.
 *
 * So the prices and day moves below are DEMO_HOLDINGS' price and prevClose, the
 * totals are that portfolio's actual arithmetic, and a visitor who clicks
 * through to the demo sees the same book. scripts/verify-site.mjs asserts the
 * agreement, because this is the kind of thing that drifts back silently.
 */
const tickerItems = [
  ["BHP", "45.82", "+1.2%", "up"],
  ["CBA", "131.44", "+0.4%", "up"],
  ["IVV", "68.31", "-0.3%", "dn"],
  ["AUD/USD", "0.629", "+0.2%", "up"],
  ["GOLD", "3,112", "+0.8%", "up"],
  ["WTI", "69.86", "-1.9%", "dn"],
  ["BTC", "84.2k", "-1.8%", "dn"],
  ["ETH", "3,140", "+0.6%", "up"],
  ["CSL", "288.10", "+0.7%", "up"],
  ["MQG", "218.75", "+1.4%", "up"],
  ["VAS", "104.60", "+0.6%", "up"],
  ["FMG", "18.44", "-2.1%", "dn"],
  ["VIX", "21.4", "-6.1%", "dn"],
] as const;

/*
 * The selling-points band: the proof points SPECTRE delivers to a connected AI.
 * Every claim here is one the product makes good on elsewhere on the page.
 */
type ValueProp = { title: string; copy: string; icon: ReactNode };
const VALUE_PROPS: readonly ValueProp[] = [
  {
    title: "Sees inside your funds",
    copy: "Your AI reads each ETF and super fund's filings and breaks it down to the companies you really own — not just the ticker.",
    icon: <LayersIcon />,
  },
  {
    title: "Knows your true concentration",
    copy: "Overlap across funds and super surfaces, so your AI sees you hold 5.3% CBA, not the 5.0% your holdings table shows.",
    icon: <PulseIcon />,
  },
  {
    title: "Quotes numbers that are right",
    copy: "VaR, beta, drawdown and correlation are computed in code and handed over — not a chatbot's confident guess.",
    icon: <ShieldIcon />,
  },
  {
    title: "Reads your whole book",
    copy: "Super, broker, crypto and bullion, merged into one picture your AI can reason over instead of a screenshot at a time.",
    icon: <GridIcon />,
  },
  {
    title: "Never loses the thread",
    copy: "It re-reads your live holdings on every question and watches for the drops you asked about. A chatbot forgets; SPECTRE doesn't.",
    icon: <BellIcon />,
  },
] as const;

const workflowSteps: readonly WorkflowStep[] = [
  {
    number: "01 — IMPORT",
    title: "Import Every Source",
    copy: "Bring in broker, super, crypto, fund, savings, tax, and bullion exports without rebuilding your spreadsheet stack.",
    icon: <UploadIcon />,
  },
  {
    number: "02 — NORMALIZE",
    title: "One view of everything.",
    copy: "SPECTRE merges holdings, prices, sectors, account buckets, snapshots, and benchmark context into one workspace — then looks inside your funds so the view is of securities, not wrappers.",
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

type McpClient = {
  name: string;
  note: string;
  mark: ReactNode;
  copy?: string;
};

/** The assistants most visitors already pay for — so they lead. */
const primaryClients: readonly McpClient[] = [
  {
    name: "Claude",
    note: "Desktop app",
    mark: <ClaudeMark />,
    copy: "Paste the SPECTRE URL into Settings → Connectors, or run it locally with one command.",
  },
  {
    name: "ChatGPT",
    note: "Connectors",
    mark: <ChatGPTMark />,
    copy: "Add SPECTRE as a connector and ask about your holdings in the app you already use.",
  },
] as const;

/** Everything else that speaks MCP — editors and fully local models. */
const otherClients: readonly McpClient[] = [
  { name: "Cursor", note: "Editor", mark: <CursorMark /> },
  { name: "LM Studio", note: "Local models", mark: <LMStudioMark /> },
  { name: "Ollama", note: "Fully offline", mark: <OllamaMark /> },
  { name: "Zed", note: "Editor", mark: <ZedMark /> },
] as const;

const features: readonly MarketingCard[] = [
  {
    title: "AI Portfolio Analyst",
    copy: "Ask in plain English. Answers come from your holdings, not guesses.",
    icon: <PulseIcon />,
  },
  {
    title: "Fund Look-Through",
    copy: "See the stocks inside your ETFs and funds, straight from SEC filings.",
    icon: <LayersIcon />,
    alt: true,
  },
  {
    title: "Import Anything",
    copy: "CommSec, Selfwealth, Stake, super, ETFs, funds, crypto, bullion.",
    icon: <UploadIcon />,
  },
  {
    title: "Forward a Contract Note",
    copy: "Email the broker confirmation to SPECTRE. The trade files itself.",
    icon: <BellIcon />,
    alt: true,
  },
  {
    title: "Quant Risk Engine",
    copy: "VaR 95, CVaR, beta, Sharpe, drawdown, correlation — computed, not estimated.",
    icon: <ShieldIcon />,
  },
  {
    title: "Monte Carlo & Stress",
    copy: "500 paths to p10/p50/p90, plus a GFC-scale shock against your book.",
    icon: <ClockIcon />,
    alt: true,
  },
  {
    title: "Advanced Scanner",
    copy: "ADX, MACD, Bollinger squeeze, ATR and strength against the ASX 200.",
    icon: <GridIcon />,
  },
  {
    title: "Research Terminal",
    copy: "ASX movers, news, macro, rates and commodities in one place.",
    icon: <BarsIcon />,
    alt: true,
  },
  {
    title: "Dip Alerts",
    copy: "Name a drop worth knowing about and SPECTRE emails you when it happens.",
    icon: <UsersIcon />,
  },
  {
    title: "Connect Your Own AI",
    copy: "Ten tools over MCP. Your assistant reads your portfolio, including inside the funds.",
    icon: <LockIcon />,
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
    copy: "Your holdings are used only to build your workspace. We don't share or sell them. Site analytics are separate and never carry portfolio data — the privacy policy names every tool.",
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
    copy: "scrypt password hashing, secure session cookies, and no card details on file anywhere.",
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
      "SPECTRE uses modern password hashing, HTTPS with CSP and HSTS headers, and encrypted backups, and your portfolio data is never sold or shared. Like most sites we do run third-party analytics on the marketing pages — they see page views, never holdings — and the privacy policy lists them by name.",
  },
  {
    question: "Can SPECTRE see inside my ETFs and managed funds?",
    answer:
      "Usually, yes. US-registered funds and ETFs resolve to their full portfolio from SEC N-PORT filings, and ASX feeders like IVV and IHVV resolve through the US fund they hold. Betashares publishes a complete daily holdings file, so their funds resolve in full too. Vanguard Australia and VanEck publish their largest positions rather than the whole portfolio, so those resolve partway and SPECTRE shows you how much of the fund it accounted for instead of pretending to the rest. Anything else, upload the fund's holdings file and it resolves from that. Every breakdown is stamped with the date of the filing it came from.",
  },
  {
    question: "What is the SPECTRE risk score?",
    answer:
      "The risk score is a 0 to 100 portfolio health signal built from concentration, drawdown, VaR and Expected Shortfall, benchmark sensitivity, volatility, and data quality confidence.",
  },
  {
    question: "How much does it cost?",
    answer:
      "Nothing. While SPECTRE grows, every account gets the entire product free — the full research terminal, all pro analytics, dip alerts, and our strongest AI model with 100 AI sessions a month. No card required.",
  },
  {
    question: "What data does the research terminal include?",
    answer:
      "The research terminal covers ASX equities, earnings, macro, crypto, commodities, oil, gold, central-bank rates, treasury curves, FRED macro signals, CFTC positioning, analyst targets, and live market news.",
  },
  {
    question: "Can I scan individual stocks?",
    answer:
      "Yes — the SPECTRE Scanner is free for every account. Search any ASX, US, or global ticker and it flags possible anomalies: RSI extremes, volume spikes, price gaps, 52-week levels, trend breaks, and volatility bursts. It's statistical context only, never advice — you always have the final say.",
  },
  {
    question: "What do I need to sign up?",
    answer:
      "Just an email address. There is no card, no subscription, and no trial clock — create an account, import a CSV, and the whole workspace is yours.",
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const heroProductRef = useRef<HTMLDivElement>(null);
  const heroCardRef = useRef<HTMLDivElement>(null);
  const orbsRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const stickySectionRef = useRef<HTMLElement>(null);
  const aiConsoleRef = useRef<HTMLDivElement>(null);
  const aiSectionRef = useRef<HTMLElement>(null);
  const [activeStickyPanel, setActiveStickyPanel] = useState(0);

  /*
   * Scroll reveal, the safe way.
   *
   * The old global reveal animation was removed because it left eighty-odd
   * elements hidden until JavaScript ran, so a slow or scriptless load showed a
   * blank page. This version is opt-in by class and gated on a root flag added
   * only once JS is live: without that flag the items are fully visible, so
   * nothing can be trapped invisible. A reader with reduced motion never sees it
   * at all. Each item reveals once and is then let go.
   */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    root.classList.add("srOn");
    const items = [...document.querySelectorAll<HTMLElement>(`.${styles.srItem}`)];
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add(styles.srIn);
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    items.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove("srOn");
    };
  }, []);

  // Mouse-tilt on the hero dashboard card (fine pointers only)
  useEffect(() => {
    const zone = heroProductRef.current;
    const card = heroCardRef.current;
    if (!zone || !card) return;
    if (!window.matchMedia("(pointer: fine)").matches || window.innerWidth <= 960) return;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const rect = zone.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        card.style.transform = `perspective(1100px) rotateY(${(x * 4).toFixed(2)}deg) rotateX(${(-y * 3.2).toFixed(2)}deg)`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      card.style.transform = "perspective(1100px) rotateY(0deg) rotateX(0deg)";
    };
    zone.addEventListener("mousemove", onMove);
    zone.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      zone.removeEventListener("mousemove", onMove);
      zone.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  useEffect(() => {
    // The reveal observer is gone with the animation it drove: it watched
    // eighty-eight elements to add a class that no longer does anything, which
    // is observer bookkeeping on every scroll for no visible result.

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
        const startTilt = compactMotion ? 4 : 11;
        heroProduct.style.transform = `perspective(1300px) rotateX(${((1 - e) * startTilt).toFixed(2)}deg) scale(${(startScale + e * scaleRange).toFixed(4)}) translateY(${((1 - e) * startOffset).toFixed(1)}px)`;
        heroProduct.style.opacity = (startOpacity + e * opacityRange).toFixed(3);
      }
      // Parallax orbs drift at different rates; progress bar tracks the page.
      if (orbsRef.current) {
        orbsRef.current.style.setProperty("--sy", String(window.scrollY));
      }
      if (progressRef.current) {
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        progressRef.current.style.width = max > 0 ? `${((window.scrollY / max) * 100).toFixed(2)}%` : "0%";
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
      <div ref={progressRef} className={styles.scrollProgress} aria-hidden="true" />
      <div ref={orbsRef} className={styles.orbLayer} aria-hidden="true">
        <div className={`${styles.orb} ${styles.orbA}`} />
        <div className={`${styles.orb} ${styles.orbB}`} />
        <div className={`${styles.orb} ${styles.orbC}`} />
      </div>
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brandRow} aria-label="SPECTRE home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/spectre-mark.svg" alt="" aria-hidden="true" className={styles.brandKnot} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/spectre-wordmark.svg" alt="SPECTRE" height={20} className={styles.brandWordmark} />
          </Link>

          <div className={styles.navLinks}>
            <a href="#ai">AI</a>
            <a href="#funds">Funds</a>
            <a href="#scanner">Scanner</a>
            <a href="#connect">Connect</a>
            <a href="#features">Features</a>
            <a href="#start">Start</a>
          </div>

          <div className={styles.navActions}>
            <Link href="/signin" className={`${styles.button} ${styles.ghostButton}`}>
              Sign In
            </Link>
            <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton}`}>
              Get Started Free
            </Link>
          </div>

          {/* The mobile menu button — the section links and sign-in were simply
              display:none on a phone, leaving no way to navigate. */}
          <button
            type="button"
            className={styles.navToggle}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((o) => !o)}
          >
            <span className={`${styles.navToggleBar} ${mobileNavOpen ? styles.navToggleBar1 : ""}`} />
            <span className={`${styles.navToggleBar} ${mobileNavOpen ? styles.navToggleBar2 : ""}`} />
            <span className={`${styles.navToggleBar} ${mobileNavOpen ? styles.navToggleBar3 : ""}`} />
          </button>
        </div>

        <div className={`${styles.mobileMenu} ${mobileNavOpen ? styles.mobileMenuOpen : ""}`}>
          {[
            ["#ai", "AI"], ["#funds", "Funds"], ["#scanner", "Scanner"],
            ["#connect", "Connect"], ["#features", "Features"], ["#start", "Start"],
          ].map(([href, label]) => (
            <a key={href} href={href} className={styles.mobileMenuLink} onClick={() => setMobileNavOpen(false)}>
              {label}
            </a>
          ))}
          <div className={styles.mobileMenuActions}>
            <Link href="/signin" className={`${styles.button} ${styles.outlineButton}`} onClick={() => setMobileNavOpen(false)}>
              Sign In
            </Link>
            <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton}`} onClick={() => setMobileNavOpen(false)}>
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      <div className={styles.ticker}>
        <div className={styles.tickerTrack}>
          {[...tickerItems, ...tickerItems, ...tickerItems, ...tickerItems].map(([symbol, price, delta, tone], index) => (
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
            <div className={`${styles.heroKicker} ${styles.reveal}`}>
              <span>THE CONNECTOR FOR YOUR AI</span>
              <span className={styles.heroKickerDot} />
              <span>AUSTRALIA</span>
            </div>
            <h1 className={`${styles.heroHeadline} ${styles.reveal}`}>
              Plug your AI into<br />
              <span className={styles.heroHeadlineAccent}>your real portfolio.</span>
            </h1>
            <p className={`${styles.heroSub} ${styles.reveal}`}>
              SPECTRE is the connector between the AI you already use — Claude, ChatGPT, or a model on
              your own machine — and your money. One link gives it your real holdings, the companies
              inside your funds, and risk numbers that are actually right.
            </p>
            <ConnectorDiagram />
            <div className={`${styles.heroActions} ${styles.reveal}`}>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Get Started Free
              </Link>
              <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.outlineButton} ${styles.heroButton}`}>
                See Live Demo →
              </Link>
            </div>
            <p className={`${styles.reveal} ${styles.heroFinePrint}`}>
              Built for Australian investors · No card required · Cancel anytime
            </p>

          </div>

          <div ref={heroProductRef} className={styles.heroProduct}>
          <div ref={heroCardRef} className={`${styles.dashMock} ${styles.tiltCard}`}>
            <aside className={styles.dashSidebar}>
              <div className={styles.dashBrand}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/spectre-mark.svg" alt="" aria-hidden="true" className={styles.dashBrandMark} />
                <span>SPECTRE</span>
              </div>
              <div className={styles.dashUrl}>spectre-assets.com / dashboard</div>
              <nav className={styles.dashNav}>
                <span className={`${styles.dashNavItem} ${styles.dashNavActive}`}><GridIcon /> Dashboard</span>
                <span className={styles.dashNavItem}><ShieldIcon /> Risk engine</span>
                <span className={styles.dashNavItem}><LayersIcon /> Inside funds</span>
                <span className={styles.dashNavItem}><BarsIcon /> Monte Carlo</span>
              </nav>
              <div className={styles.dashLock}><LockIcon /> Read-only AI access</div>
            </aside>

            <div className={styles.dashMain}>
              <div className={styles.dashTop}>
                <span className={styles.dashTopLabel}>7 accounts · broker, super, crypto, bullion</span>
                <span className={styles.dashDemoTag}>Demo data</span>
              </div>

              <div className={styles.dashKpis}>
                {[
                  ["Portfolio Value", "$314,320", "+1.7% MTD", true],
                  ["Accounts Linked", "7", "Broker, super, crypto, bullion", false],
                  ["Funds Resolved", "2 of 3", "IVV · VAS · one awaiting a file", false],
                  ["Monte Carlo", "500", "1Y simulation paths", false],
                ].map(([label, value, sub, up]) => (
                  <div key={label as string} className={styles.dashKpi}>
                    <div className={styles.dashKpiLabel}>{label}</div>
                    <div className={styles.dashKpiValue}>{value}</div>
                    <div className={`${styles.dashKpiSub} ${up ? styles.up : ""}`}>{sub}</div>
                  </div>
                ))}
              </div>

              <div className={styles.dashBody}>
                <div className={styles.dashBodyL}>
                  <div className={styles.dashChartHead}>AI Risk Snapshot — 72 / 100 (Elevated)</div>
                  <div className={styles.dashRiskBar}>
                    <div className={styles.dashRiskFill} />
                    <span className={styles.dashRiskMark}>72</span>
                  </div>
                  <div className={styles.dashRiskMeta}>Concentration · VaR95 · Expected Shortfall · Beta · Tracking Error</div>

                  <div className={styles.dashChartHead}>Drawdown (12-month)</div>
                  <svg className={styles.dashDrawdown} viewBox="0 0 520 150" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#e0231c" stopOpacity="0.14" />
                        <stop offset="100%" stopColor="#e0231c" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0,24 L58,44 L116,78 L174,58 L232,96 L290,138 L348,96 L406,110 L464,74 L520,58 L520,150 L0,150 Z" fill="url(#ddFill)" />
                    <path d="M0,24 L58,44 L116,78 L174,58 L232,96 L290,138 L348,96 L406,110 L464,74 L520,58" fill="none" stroke="#e0231c" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className={styles.dashDrawMax}>Max −11%</div>
                </div>

                <div className={styles.dashBodyR}>
                  <div className={styles.dashChartHead}>Source Mix</div>
                  <div className={styles.dashDonutWrap}>
                    <svg width="118" height="118" viewBox="0 0 42 42" className={styles.dashDonut} aria-hidden="true">
                      <circle className={styles.dashDonutTrack} cx="21" cy="21" r="15.915" fill="transparent" strokeWidth="6" />
                      {/* ASX 32, Super 28, Funds 16, Crypto+Bullion 24 — distinct hues, like the
                          design. r=15.915 gives circumference ~100 so dasharray reads as percent;
                          offset 25 starts the first segment at 12 o'clock, the rest accumulate. */}
                      <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#dc2626" strokeWidth="6" strokeDasharray="32 68" strokeDashoffset="25" />
                      <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#16a34a" strokeWidth="6" strokeDasharray="28 72" strokeDashoffset="-7" />
                      <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#eab308" strokeWidth="6" strokeDasharray="16 84" strokeDashoffset="-35" />
                      <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#2563eb" strokeWidth="6" strokeDasharray="24 76" strokeDashoffset="-51" />
                      <text x="21" y="20" className={styles.dashDonutNum}>7</text>
                      <text x="21" y="26" className={styles.dashDonutCap}>accounts</text>
                    </svg>
                    <div className={styles.dashLegend}>
                      <LegendItem color="#dc2626" label="ASX Equities" value="32%" />
                      <LegendItem color="#16a34a" label="Super" value="28%" />
                      <LegendItem color="#eab308" label="Funds / ETFs" value="16%" />
                      <LegendItem color="#2563eb" label="Crypto + Bullion" value="24%" />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.dashAlert}>
                <PulseIcon />
                <span><strong>Alert me if</strong> CBA drops 5% this week — SPECTRE watches and emails you when it happens.</span>
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
              { val: "9", label: "Import Sources" },
              { val: "12+", label: "Risk Signals" },
              { val: "500", label: "Monte Carlo Paths" },
              { val: "3", label: "Quant · AI · Research" },
            ].map(({ val, label }) => (
              <div key={label} className={`${styles.statStat} ${styles.reveal}`}>
                <StatCounter value={val} />
                <div className={styles.statStatLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className={styles.valueBandSection}>
        <div className={styles.container}>
          <div className={`${styles.valueBandHead} ${styles.reveal} ${styles.srItem}`}>
            <div className={styles.sectionLabel}>Why connect it</div>
            <h2 className={styles.valueBandTitle}>Five things your AI can’t do without SPECTRE.</h2>
          </div>
          <div className={`${styles.valueGrid} ${styles.srItem}`}>
            {VALUE_PROPS.map((p) => (
              <article key={p.title} className={styles.valueGridCard}>
                <div className={`${styles.iconWrap} ${styles.valueIcon}`}>{p.icon}</div>
                <h3>{p.title}</h3>
                <p>{p.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* A real screenshot of the product, not a drawing of it — the "photo"
          the page was missing. One image, one line. */}
      <section className={styles.shotSection}>
        <div className={styles.container}>
          <div className={`${styles.shotFrame} ${styles.srItem}`}>
            <div className={styles.shotBar}>
              <span className={styles.shotDot} /><span className={styles.shotDot} /><span className={styles.shotDot} />
              <span className={styles.shotUrl}>spectre-assets.com / dashboard</span>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/product-dashboard.png"
              alt="The SPECTRE dashboard: a $314,320 demo portfolio with its risk score and snapshot"
              className={styles.shotImg}
              width={1760}
              height={611}
              loading="lazy"
            />
          </div>
          <p className={styles.shotCaption}>Your whole portfolio, scored — the real dashboard, from the live demo.</p>
        </div>
      </section>

      <section className={styles.aiRevealSection} id="ai" ref={aiSectionRef}>
        <div className={styles.container}>
          <div className={styles.aiRevealHead}>
            <div className={`${styles.sectionLabel} ${styles.reveal}`}>AI Portfolio Analyst</div>
            <h2 className={`${styles.aiRevealTitle} ${styles.reveal}`}>
              Ask your portfolio<br /><span>anything.</span>
            </h2>
            <p className={`${styles.aiRevealSub} ${styles.reveal}`}>
              It reads your holdings, the stocks inside your funds, live prices and your risk numbers first — so “why am I down today?” comes back with your tickers in it.
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
                  <p>Holdings, the stocks inside your funds, live quotes, sector mix, benchmark risk and history.</p>
                </div>
                <div className={styles.miniCard}>
                  <div className={styles.smallLabel}>What AI Returns</div>
                  <p>Drivers, risk flags and things worth checking — never an instruction to trade.</p>
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

      {/*
       * Fund look-through.
       *
       * This is the thing nothing else in the category does, and until now the
       * homepage did not mention it once — a visitor could read the whole page
       * and never learn that SPECTRE opens the wrappers. It goes directly after
       * "ask your portfolio anything", because being able to see inside the
       * funds is what makes those answers different from a chatbot's.
       *
       * Every claim here is one the engine actually makes good on. The coverage
       * card is deliberately the least flattering of the four and is staying:
       * someone who signs up believing their whole book resolves, and finds out
       * afterwards that it does not, is worse than someone who never signed up.
       */}
      <section className={styles.section} id="funds">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Fund Look-Through</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`}>See inside your funds.</h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`}>
            SPECTRE reads each fund’s SEC filings and breaks it down to the stocks inside. Hold three tech-heavy ETFs and you’ll see how much Nvidia you really own.
          </p>

          <div className={styles.connectSplit}>
            <div className={`${styles.connectTerm} ${styles.revealScale}`}>
              <div className={styles.scanTermBar}>SPECTRE // INSIDE YOUR FUNDS</div>
              <div className={styles.lookBody}>
                <div className={styles.lookFund}>
                  <div className={styles.lookFundHead}>
                    <span className={styles.lookFundSym}>IVV</span>
                    <span className={styles.lookFundName}>iShares Core S&amp;P 500 ETF</span>
                    <span className={styles.lookFundVal}>$28,690</span>
                  </div>
                  <div className={styles.lookFundMeta}>
                    507 holdings · SEC N-PORT · as of 30 Jun 2026
                  </div>
                  <div className={styles.lookRows}>
                    {[
                      ["NVDA", "NVIDIA", "7.6%", "$2,180"],
                      ["AAPL", "Apple", "6.6%", "$1,894"],
                      ["MSFT", "Microsoft", "6.2%", "$1,779"],
                      ["AMZN", "Amazon", "4.0%", "$1,148"],
                      ["META", "Meta Platforms", "2.7%", "$775"],
                    ].map(([sym, name, weight, value]) => (
                      <div key={sym} className={styles.lookRow}>
                        <span className={styles.lookRowSym}>{sym}</span>
                        <span className={styles.lookRowName}>{name}</span>
                        <span className={styles.lookRowWeight}>{weight}</span>
                        <span className={styles.lookRowVal}>{value}</span>
                      </div>
                    ))}
                    <div className={styles.lookRowRest}>+ 502 more names</div>
                  </div>
                </div>

                <div className={styles.lookFund}>
                  <div className={styles.lookFundHead}>
                    <span className={styles.lookFundSym}>VAS</span>
                    <span className={styles.lookFundName}>Vanguard Australian Shares ETF</span>
                    <span className={styles.lookFundVal}>$9,937</span>
                  </div>
                  {/* Vanguard publishes its largest positions, not the whole
                      portfolio, so the weights are allocated as far as they go
                      and the remainder stays as VAS. Never rescaled to 100%:
                      that would report CBA at 30% of the fund. */}
                  <div className={styles.lookFundMeta}>
                    Top holdings from Vanguard Australia · 33% of the fund accounted for
                  </div>
                  <div className={styles.lookRows}>
                    {[
                      ["CBA", "Commonwealth Bank", "9.8%", "$974"],
                      ["BHP", "BHP Group", "8.4%", "$835"],
                      ["CSL", "CSL Limited", "5.6%", "$556"],
                      ["NAB", "National Australia Bank", "4.9%", "$487"],
                      ["WBC", "Westpac", "4.4%", "$437"],
                    ].map(([sym, name, weight, value]) => (
                      <div key={sym} className={styles.lookRow}>
                        <span className={styles.lookRowSym}>{sym}</span>
                        <span className={styles.lookRowName}>{name}</span>
                        <span className={styles.lookRowWeight}>{weight}</span>
                        <span className={styles.lookRowVal}>{value}</span>
                      </div>
                    ))}
                    <div className={styles.lookRowRest}>Remaining 67% stays as VAS — not guessed at</div>
                  </div>
                </div>

                <div className={styles.lookCallout}>
                  <span className={styles.lookCalloutTag}>OVERLAP</span>
                  <div>
                    <strong>You own more CBA than your account says.</strong>
                    <p>
                      $15,773 held directly plus $974 inside VAS is <strong>$16,747</strong> — 5.3% of the
                      book, not the 5.0% the holdings table shows. Your risk score uses the 5.3%.
                    </p>
                  </div>
                </div>

                <div className={styles.scanDisclaimer}>
                  Filing-dated, not live. SPECTRE surfaces; you decide.
                </div>
              </div>
            </div>

            <ul className={styles.connectList}>
              {[
                ["Your true exposure", "Overlap across funds surfaces in your risk score instead of hiding behind a ticker."],
                ["Holding companies too", "Hold Berkshire and SPECTRE reads its 13F to show the stocks inside it."],
                ["Dated, not live", "Every breakdown is stamped with the filing date, and partial coverage is labelled as partial."],
                ["Coverage", "US funds and ASX feeders resolve in full from SEC filings; Betashares from its daily file. Vanguard and VanEck resolve partway. Anything else, upload the file."],
              ].map(([title, copy]) => (
                <li key={title} className={styles.reveal}>
                  <strong>{title}</strong> — {copy}
                </li>
              ))}
            </ul>
          </div>

          <HiddenExposureChart />

          <div className={styles.researchCtaRow}>
            <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.primaryButton}`}>
              Open a Fund in the Demo →
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.scannerSection} id="scanner">
        <div className={styles.container}>
          <div className={styles.scannerInner}>
            <div className={`${styles.scannerCard} ${styles.revealScale} ${styles.srItem}`}>
              <div className={styles.scanTermBar}>SPECTRE // SCANNER — LIVE FOR EVERY ACCOUNT</div>
              <div className={styles.scannerCardBody}>
                <div className={styles.scanHead}>
                  <span className={styles.scanSym}>PLS.AX</span>
                  <span className={styles.scanName}>Pilbara Minerals</span>
                  <span className={styles.scanPx}>3.42 AUD</span>
                  <span className={styles.scanDeltaUp}>+6.8% today</span>
                </div>

                <ScannerChart />

                <div className={styles.scanGauges}>
                  <Gauge
                    label="RSI 14"
                    value="71"
                    pct={71}
                    zoneStart={70}
                    tone="warn"
                    lo="0"
                    hi="100"
                    caption="Overbought above 70"
                  />
                  <Gauge
                    label="52-Week Range"
                    value="$3.42"
                    pct={92}
                    lo="$2.41"
                    hi="$3.53"
                    caption="Near the 52-week high"
                  />
                </div>

                <div className={styles.scanStats}>
                  {[
                    ["30D CHANGE", "+18.4%", "up"],
                    ["VOLUME", "3.2× avg", "up"],
                    ["ATR 14", "4.1%", ""],
                    ["50D TREND", "Rising", "up"],
                  ].map(([label, val, tone]) => (
                    <div key={label} className={styles.scanStat}>
                      <span className={styles.scanStatLabel}>{label}</span>
                      <span className={`${styles.scanStatVal} ${tone === "up" ? styles.up : ""}`}>{val}</span>
                    </div>
                  ))}
                </div>

                <div className={`${styles.scanFlag} ${styles.scanFlagAlert}`}>
                  <span className={styles.scanFlagTag}>ALERT</span>
                  <div>
                    <strong>Volume 3.2× the 20-day average</strong>
                    <p>Unusual activity — something moved the crowd today. Check announcements before acting.</p>
                  </div>
                </div>
                <div className={`${styles.scanFlag} ${styles.scanFlagWatch}`}>
                  <span className={styles.scanFlagTag}>WATCH</span>
                  <div>
                    <strong>RSI 71 — running hot</strong>
                    <p>Approaching overbought territory. Watch for exhaustion.</p>
                  </div>
                </div>
                <div className={styles.scanDisclaimer}>
                  Possible anomalies only — not advice. SPECTRE surfaces; you decide.
                </div>
              </div>
            </div>

            <div className={`${styles.scannerCopy} ${styles.srItem}`}>
              <div className={`${styles.scannerBadge} ${styles.reveal}`}>
                <span className={styles.scannerLiveDot} />
                Live Now · Free For Everyone
              </div>
              <h2 className={`${styles.scanTitle} ${styles.revealUp}`}>
                Scan any stock.<br />
                <span>Free, for everyone.</span>
              </h2>
              <p className={`${styles.scanSub} ${styles.reveal}`}>
                Search any stock and SPECTRE checks a year of price, volume and volatility — then flags what looks unusual.
              </p>
              <ul className={styles.scanList}>
                {[
                  ["Search any stock", "ASX first, US and global markets too."],
                  ["Possible anomalies only", "RSI extremes, volume spikes, 52-week levels, trend breaks. Flags, not orders."],
                  ["You have the final say", "It never trades. It surfaces the signal; you make the call."],
                ].map(([title, copy]) => (
                  <li key={title} className={styles.reveal}>
                    <strong>{title}</strong> — {copy}
                  </li>
                ))}
              </ul>
              <div className={`${styles.scannerCtaRow} ${styles.reveal}`}>
                <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton}`}>
                  Scan Your First Stock Free →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="connect">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>The Connector</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`}>
            Make the AI you already use your financial analyst.
          </h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`}>
            Over the Model Context Protocol, Claude, ChatGPT or your own model plugs straight into your portfolio — and starts reading the real thing instead of guessing.
          </p>

          {/* The two most people already have get the room; the rest are there
              to show this is an open protocol, not a two-vendor deal. */}
          <div className={styles.connectPrimary}>
            {primaryClients.map((client) => (
              <div
                key={client.name}
                className={`${styles.connectCard} ${styles.reveal}`}
              >
                <span className={styles.connectCardLogo}>{client.mark}</span>
                <div className={styles.connectCardText}>
                  <span className={styles.connectCardName}>{client.name}</span>
                  <span className={styles.connectCardNote}>{client.note}</span>
                  <span className={styles.connectCardCopy}>{client.copy}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.connectGrid}>
            {otherClients.map((client) => (
              <div
                key={client.name}
                className={`${styles.connectChip} ${styles.reveal}`}
              >
                <span className={styles.connectChipLogo}>{client.mark}</span>
                <span className={styles.connectChipText}>
                  <span className={styles.connectChipName}>{client.name}</span>
                  <span className={styles.connectChipNote}>{client.note}</span>
                </span>
              </div>
            ))}
          </div>

          <p className={`${styles.connectFootnote} ${styles.reveal}`}>
            Any MCP client works — these are simply the common ones. Paste one URL, or run it on your own
            machine. <Link href="/mcp-setup">Setup instructions →</Link>
          </p>

          <div className={styles.connectSplit}>
            <div className={`${styles.connectTerm} ${styles.revealScale}`}>
              <div className={styles.scanTermBar}>YOUR AI // CONNECTED TO SPECTRE</div>
              <div className={styles.connectTermBody}>
                <div className={styles.connectAsk}>› How is my portfolio positioned right now?</div>
                <div className={styles.connectToolRow}>
                  <span className={styles.connectTool}>get_portfolio ✓</span>
                  <span className={styles.connectTool}>portfolio_funds ✓</span>
                  <span className={styles.connectTool}>portfolio_risk ✓</span>
                </div>
                <div className={styles.connectReply}>
                  Your book is <strong>$314,320</strong>, flat on the day. It&rsquo;s concentrated — super alone is
                  <strong> 35.6%</strong> and the top three lines are <strong>58%</strong>. Looking through IVV and
                  VAS, your real CBA exposure is <strong>5.3%</strong>, not the 5.0% your holdings table shows&hellip;
                </div>
              </div>
            </div>

            <ul className={styles.connectList}>
              {[
                ["Your numbers, not its guesses", "Risk and concentration are computed in code before your model sees them."],
                ["Always current", "It reads your live holdings on every question."],
                ["You choose who sees it", "Over a URL or on your own machine — your holdings reach only the assistant you connect."],
                ["No extra AI bill", "You bring your own model, so there's nothing metered on our side."],
                ["Ten tools", "Holdings, fund look-through, risk, the scanner, news, movers and macro — all callable."],
              ].map(([title, copy]) => (
                <li key={title} className={styles.reveal}>
                  <strong>{title}</strong> — {copy}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section} id="research">
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Research Terminal</div>
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`}>The market data behind every answer.</h2>
          <p className={`${styles.sectionSub} ${styles.reveal}`}>
            The same feeds the AI reads — ASX, macro, earnings, crypto, commodities — open to explore yourself.
          </p>

          <div className={`${styles.researchWindow} ${styles.revealScale}`}>
            <div className={styles.researchWindowBar}>spectre-assets.com / research</div>
            <div className={styles.researchTape}>
              {[
                ["ASX 200", "8,214", "+0.6%", true],
                ["AUD/USD", "0.629", "+0.2%", true],
                ["VIX", "21.4", "-6.1%", false],
                ["GOLD", "3,112", "+0.8%", true],
                ["WTI", "69.86", "-1.9%", false],
                ["BTC", "84.2k", "-1.8%", false],
              ].map(([label, val, delta, up]) => (
                <div key={label as string} className={styles.researchTapeCard}>
                  <span className={styles.researchTapeLabel}>{label}</span>
                  <span className={styles.researchTapeVal}>{val}</span>
                  <span className={up ? styles.up : styles.down}>{delta}</span>
                </div>
              ))}
            </div>
            <div className={styles.researchWindowBody}>
              <div className={styles.researchPane}>
                <div className={styles.researchPaneTitle}>ASX Top Constituents</div>
                {[
                  ["BHP", "45.82", "+1.2%", true],
                  ["CBA", "131.44", "+0.4%", true],
                  ["CSL", "288.10", "+0.7%", true],
                  ["MQG", "218.75", "+1.4%", true],
                  ["FMG", "18.44", "-2.1%", false],
                ].map(([sym, px, delta, up]) => (
                  <div key={sym as string} className={styles.researchPaneRow}>
                    <span className={styles.researchPaneSym}>{sym}</span>
                    <span className={styles.researchPaneVal}>{px}</span>
                    <span className={up ? styles.up : styles.down}>{delta}</span>
                  </div>
                ))}
              </div>
              <div className={styles.researchPane}>
                <div className={styles.researchPaneTitle}>Macro Snapshot</div>
                {[
                  ["RBA Cash Rate", "3.60%"],
                  ["US 10Y Yield", "4.21%"],
                  ["AU-US 10Y Spread", "-0.42%"],
                  ["Copper", "+1.1%"],
                  ["Brent Crude", "74.20"],
                ].map(([label, val]) => (
                  <div key={label} className={styles.researchPaneRow}>
                    <span className={styles.researchPaneSym}>{label}</span>
                    <span className={styles.researchPaneVal}>{val}</span>
                  </div>
                ))}
              </div>
              <div className={styles.researchPane}>
                <div className={styles.researchPaneTitle}>Live Headlines</div>
                {[
                  "RBA holds cash rate, flags patient path on cuts",
                  "Iron ore slips as China stimulus hopes fade",
                  "CSL upgraded — analyst targets lifted to $315",
                  "US CPI in line; treasury curve steepens",
                ].map((headline) => (
                  <div key={headline} className={styles.researchNewsRow}>
                    <span className={styles.researchNewsDot} />
                    <span>{headline}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.researchWindowFoot}>
              Every card above is a live feed inside SPECTRE, drawn as the research page draws it.
            </div>
          </div>

          <div className={styles.researchHighlights}>
            {[
              { name: "Live Core Tape", sub: "ASX 200, AUD/USD, VIX, gold, WTI crude, BTC, ETH, and SOL with live hero cards.", alt: false },
              { name: "ASX Equities", sub: "Top constituents, sector breadth, gainers/losers, analyst targets, and interactive stock charts.", alt: false },
              { name: "Macro & Commodities", sub: "Treasury curve, central-bank rates, FX, gold, oil, inflation, and risk-on / risk-off context.", alt: false },
              { name: "FRED + CFTC", sub: "Credit spreads, breakevens, money supply, Fed balance sheet, and managed-money positioning.", alt: true },
              { name: "12 ASX Earnings Names", sub: "Calendar, surprises, fundamentals, and preview context for banks, miners, healthcare, and energy.", alt: true },
              { name: "News + Calendar", sub: "Headline feed, economic calendar, and session context ready to feed the AI workflow.", alt: true },
            ].map((tile) => (
              <div key={tile.name} className={`${styles.researchTile} ${styles.reveal}`}>
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
            <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.outlineButton}`}>
              Create Free Account
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

      <section className={`${styles.section} ${styles.featuresDark}`} id="features">
        <div className={styles.container}>
          <div className={`${styles.featuresHead} ${styles.srItem}`}>
            <div>
              <div className={`${styles.sectionLabel} ${styles.featuresKicker}`}>Everything included</div>
              <h2 className={`${styles.sectionTitle} ${styles.featuresTitle}`}>All features, for everyone.</h2>
            </div>
            <p className={styles.featuresNote}>No tiers. The full toolkit is unlocked the moment you sign up.</p>
          </div>

          <div className={`${styles.featuresGrid} ${styles.srItem}`}>
            {features.map((feature) => (
              <article key={feature.title} className={styles.featCol}>
                <div className={styles.featIcon}>{feature.icon}</div>
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
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`}>What SPECTRE tracks.</h2>

          <div className={styles.chartsGrid}>
            <article className={`${styles.chartCard} ${styles.chartTall} ${styles.revealTilt}`}>
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

            <article className={`${styles.chartCard} ${styles.chartTall} ${styles.revealTilt}`}>
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

            <article className={`${styles.chartCard} ${styles.revealTilt}`}>
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

            <article className={`${styles.chartCard} ${styles.revealTilt}`}>
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
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`}>Your data stays yours.</h2>

          <div className={styles.securityGrid}>
            {securityCards.map((card) => (
              <article
                key={card.title}
                className={`${styles.securityCard} ${styles.reveal}`}
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

      <section className={styles.section} id="start">
        <div className={styles.container}>
          <div className={`${styles.startWrap} ${styles.revealScale}`}>
            <div className={styles.startBadge}>FREE WHILE WE GROW</div>
            <h2 className={styles.startTitle}>Start now.</h2>
            <p className={styles.startSub}>
              No plans, no tiers, no card. Every feature is unlocked for everyone — the full research
              terminal, all pro analytics, dip alerts, and our best AI model. Just sign up and import.
            </p>
            <div className={styles.heroActions}>
              <Link href="/signin?mode=register&plan=free" className={`${styles.button} ${styles.primaryButton} ${styles.heroButton}`}>
                Start Now — Free
              </Link>
              <Link href="/dashboard?demo=1" className={`${styles.button} ${styles.outlineButton} ${styles.heroButton}`}>
                Try The Demo First
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={`${styles.sectionLabel} ${styles.reveal}`}>Why SPECTRE?</div>
          {/* This section's old headline is now the hero. */}
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`}>So why not just a spreadsheet and a chatbot?</h2>

          <div className={styles.compareGrid}>
            <div className={`${styles.compareColumn} ${styles.revealLeft}`}>
              <div className={styles.compareHead}>Other Approaches</div>
              <CompareItem tone="bad">Generic chat tools with no view of your actual holdings</CompareItem>
              <CompareItem tone="bad">Portfolio apps with charts but no research context</CompareItem>
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
          <h2 className={`${styles.sectionTitle} ${styles.revealUp}`}>Common questions.</h2>

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
                AI portfolio intelligence for Australian investors managing multi-source portfolios across quant, research, and live monitoring.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#workflow">How It Works</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#ai">AI Analysis</a></li>
                <li><a href="#funds">Fund Look-Through</a></li>
                <li><a href="#start">Start Now</a></li>
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

/**
 * The connector diagram: your AI, SPECTRE in the middle, your money.
 *
 * Inline SVG so it is crisp at any size and themes with the page, and laid out
 * as three columns that stack on a phone. It shows the one idea the page is
 * about — the assistant on the left can only see what SPECTRE in the middle
 * reads from your accounts on the right — without a screenshot to go stale.
 */
function ConnectorDiagram() {
  const left = ["Claude", "ChatGPT", "Cursor", "Your model"];
  const gives = ["Looks inside your funds", "Your true, merged book", "Real risk, computed", "Live — re-read every ask"];
  const right = ["Broker & shares", "Superannuation", "Crypto & bullion", "SEC & issuer filings"];
  return (
    <div className={`${styles.diagram} ${styles.srItem}`}>
      <div className={`${styles.diagramCol} ${styles.diagramAi}`}>
        <div className={styles.diagramColLabel}>The AI you already use</div>
        {left.map((n) => (
          <div key={n} className={styles.diagramChip}>{n}</div>
        ))}
      </div>

      <div className={styles.diagramFlow} aria-hidden="true">
        <span className={styles.diagramArrow}>→</span>
        <div className={styles.diagramHub}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/spectre-mark.svg" alt="" className={styles.diagramHubMark} />
          <span className={styles.diagramHubName}>SPECTRE</span>
          <span className={styles.diagramHubNote}>10 tools · MCP</span>
        </div>
        <span className={styles.diagramArrow}>→</span>
      </div>

      <div className={`${styles.diagramCol} ${styles.diagramData}`}>
        <div className={styles.diagramColLabel}>Your money</div>
        {right.map((n) => (
          <div key={n} className={styles.diagramChip}>{n}</div>
        ))}
      </div>

      <ul className={styles.diagramGives}>
        {gives.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The scanner's price chart.
 *
 * A richer draw than the old bare sparkline: a recessive grid, a filled area
 * under the price, a lagging 50-day moving average so the "50D TREND: Rising"
 * stat has something to point at, and a marker on the last price. Inline SVG,
 * one accent hue, grid in the faintest ink — the dataviz defaults.
 */
function ScannerChart() {
  const price = "M0,92 L24,88 L48,90 L72,80 L96,84 L120,74 L144,78 L168,66 L192,70 L216,58 L240,60 L264,48 L288,52 L312,40 L336,34 L360,30 L384,20 L400,16";
  const area = `${price} L400,108 L0,108 Z`;
  const ma = "M0,96 C60,92 90,86 120,84 S190,74 240,66 S320,46 400,30";
  return (
    <svg className={styles.scanChart} viewBox="0 0 400 112" preserveAspectRatio="none" role="img" aria-label="PLS.AX price, one year, rising">
      <defs>
        <linearGradient id="scanFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8392c" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#e8392c" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[24, 48, 72, 96].map((y) => (
        <line key={y} x1="0" y1={y} x2="400" y2={y} className={styles.scanGrid} vectorEffect="non-scaling-stroke" />
      ))}
      <path d={area} fill="url(#scanFill)" />
      <path d={ma} className={styles.scanMa} fill="none" vectorEffect="non-scaling-stroke" />
      <path d={price} className={styles.scanLine} fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx="396" cy="16" r="3.5" className={styles.scanDot} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * A labelled gauge: a track, a fill to `pct`, an optional tinted zone (RSI's
 * overbought band), and low/high ends. Identity is carried by the label and the
 * numbers, never by colour alone.
 */
function Gauge({
  label, value, pct, zoneStart, tone, lo, hi, caption,
}: {
  label: string; value: string; pct: number; zoneStart?: number;
  tone?: "warn"; lo: string; hi: string; caption: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={styles.gauge}>
      <div className={styles.gaugeHead}>
        <span className={styles.gaugeLabel}>{label}</span>
        <span className={`${styles.gaugeValue} ${tone === "warn" ? styles.gaugeValueWarn : ""}`}>{value}</span>
      </div>
      <div className={styles.gaugeTrack}>
        {zoneStart !== undefined ? (
          <div className={styles.gaugeZone} style={{ left: `${zoneStart}%`, right: 0 }} />
        ) : null}
        <div
          className={`${styles.gaugeFill} ${tone === "warn" ? styles.gaugeFillWarn : ""}`}
          style={{ width: `${clamped}%` }}
        />
        <div className={styles.gaugeMarker} style={{ left: `${clamped}%` }} />
      </div>
      <div className={styles.gaugeEnds}>
        <span>{lo}</span>
        <span className={styles.gaugeCaption}>{caption}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}

/**
 * What a holdings table hides.
 *
 * The single most important thing look-through does, drawn: for each exposure,
 * the weight your statement shows versus the weight once SPECTRE reads through
 * your funds to the companies inside. One hue — the accent bar is the real
 * figure — and a tick for what the statement claimed, so the gap is the story.
 * Single series plus a reference tick: no categorical palette to get wrong.
 */
function HiddenExposureChart() {
  const SCALE = 18;
  const rows: Array<{ label: string; statement: number; real: number }> = [
    { label: "Commonwealth Bank", statement: 5.0, real: 5.3 },
    { label: "Australian banks", statement: 11.4, real: 16.2 },
    { label: "US mega-cap tech", statement: 6.1, real: 13.8 },
    { label: "BHP Group", statement: 4.2, real: 5.1 },
  ];
  return (
    <div className={`${styles.hiddenChart} ${styles.srItem}`}>
      <div className={styles.hiddenChartHead}>
        <div>
          <div className={styles.sectionLabel}>Look-through, visualised</div>
          <h3 className={styles.hiddenChartTitle}>What your holdings table hides.</h3>
        </div>
        <div className={styles.hiddenKey}>
          <span className={styles.hiddenKeyReal}>Looked through</span>
          <span className={styles.hiddenKeyStatement}>On your statement</span>
        </div>
      </div>
      <div className={styles.hiddenRows}>
        {rows.map((r) => (
          <div key={r.label} className={styles.hiddenRow}>
            <span className={styles.hiddenRowLabel}>{r.label}</span>
            <div className={styles.hiddenBarTrack}>
              <div className={styles.hiddenBarReal} style={{ width: `${(r.real / SCALE) * 100}%` }} />
              <div className={styles.hiddenTick} style={{ left: `${(r.statement / SCALE) * 100}%` }} />
            </div>
            <span className={styles.hiddenRowVals}>
              <strong>{r.real.toFixed(1)}%</strong>
              <span className={styles.hiddenRowGap}>+{(r.real - r.statement).toFixed(1)} hidden</span>
            </span>
          </div>
        ))}
      </div>
      <p className={styles.hiddenChartFoot}>
        Your risk score runs on the looked-through figure, because that is the exposure you actually carry.
      </p>
    </div>
  );
}

function StatCounter({ value }: { value: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const match = value.match(/^(\d+)(.*)$/);
    if (!match) return;
    const target = parseInt(match[1], 10);
    const suffix = match[2] ?? "";

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        const started = performance.now();
        const duration = 1200;
        const tick = (now: number) => {
          const p = Math.min((now - started) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = String(Math.round(target * eased)) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className={styles.statStatVal}>
      {value}
    </div>
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

/** Stacked planes, for the one feature that is about seeing through a layer. */
function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polygon points="12 2 22 8 12 14 2 8 12 2" />
      <polyline points="2 13 12 19 22 13" />
      <polyline points="2 17.5 12 23.5 22 17.5" />
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
