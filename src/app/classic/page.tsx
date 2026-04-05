"use client";

import Image from "next/image";
import { CSSProperties, ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa, { ParseError } from "papaparse";
import * as XLSX from "xlsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CsvRow,
  DataSource,
  EMPTY_STATE,
  PortfolioHolding,
  PortfolioSnapshot,
  PortfolioState,
  RiskWindow,
  computeMetrics,
  extractCsvDataSection,
  parseRowsToHoldings,
} from "@/lib/portfolio";

const ACCENT_COLOR = "#ff4b33";
const PORTFOLIO_COLORS = ["#f8f8f8", "#d9d9d9", "#bababa", "#969696", "#707070", "#525252", "#3a3a3a", "#242424"];
const EXPOSURE_COLORS = [ACCENT_COLOR, "#ff664f", "#ff7f6b", "#ff9988", "#ffb8ad", "#f1d5d0", "#b8b8b8", "#6f6f6f"];

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#f3f3f5",
  border: "1px solid #8e8e96",
  borderRadius: "10px",
  color: "#111114",
};

const TOOLTIP_LABEL_STYLE = {
  color: "#111114",
  fontWeight: 700,
};

const TOOLTIP_ITEM_STYLE = {
  color: "#111114",
  fontWeight: 600,
};

const ACCOUNT_CHIP_STYLES = [
  { bg: "#f8f8f8", fg: "#101012", border: "#ffffff" },
  { bg: "#d9d9d9", fg: "#131317", border: "#efefef" },
  { bg: "#b2b2b2", fg: "#121214", border: "#cfcfcf" },
  { bg: "#7b7b7b", fg: "#f8f8f8", border: "#a1a1a1" },
  { bg: "#4e4e4e", fg: "#f2f2f2", border: "#6a6a6a" },
  { bg: "#2b2b2f", fg: "#f5f5f5", border: "#4a4a52" },
];

const RISK_WINDOW_OPTIONS: RiskWindow[] = ["1M", "3M", "1Y"];

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_REFRESH_RESUME_GRACE_MS = 20 * 1000;
const ADMIN_CONTACT_EMAIL = "admin@spectre-assets.com";
const LANDING_SAMPLE_RISK_SCORE = 72;
const TEXT_UPLOAD_EXTENSIONS = new Set(["csv", "txt", "tsv", "psv", "json"]);
const WORKBOOK_UPLOAD_EXTENSIONS = new Set(["xlsx", "xls", "xlsm", "xlsb", "numbers", "ods"]);
const SUPPORTED_UPLOAD_FORMATS_LABEL = "CSV, TSV, PSV, TXT, JSON, XLSX, XLS, XLSM, XLSB, NUMBERS, or ODS";
const INVALID_UPLOAD_FORMAT_MESSAGE = `Does not accept this file type. Please convert to - ${SUPPORTED_UPLOAD_FORMATS_LABEL}.`;
const INVALID_UPLOAD_MESSAGE_TTL_MS = 5 * 60 * 1000;
const AI_RISK_NEGATIVE_KEYWORDS = [
  "concentration",
  "drawdown",
  "volatility spike",
  "tail risk",
  "downside",
  "bearish",
  "sell",
  "overvalued",
  "correlation",
  "stress",
  "headwind",
  "liquidity risk",
  "rate risk",
];
const AI_RISK_POSITIVE_KEYWORDS = [
  "diversified",
  "broad exposure",
  "defensive",
  "hedged",
  "resilient",
  "quality",
  "upside",
  "buy",
  "support",
  "momentum",
  "breakout",
  "undervalued",
  "risk-on",
];

const LANDING_PREVIEW_SERIES = [
  { month: "Jan", portfolio: 1180000, buffer: 1100000 },
  { month: "Feb", portfolio: 1165000, buffer: 1100000 },
  { month: "Mar", portfolio: 1218000, buffer: 1100000 },
  { month: "Apr", portfolio: 1196000, buffer: 1100000 },
  { month: "May", portfolio: 1243000, buffer: 1100000 },
  { month: "Jun", portfolio: 1271000, buffer: 1100000 },
];

const LANDING_METRIC_SERIES = [
  { metric: "Concentration", value: 41 },
  { metric: "Drawdown", value: 11 },
  { metric: "VaR95", value: 2 },
  { metric: "Volatility", value: 16 },
];

const LANDING_ALLOCATION_SERIES = [
  { name: "Equities", value: 46 },
  { name: "Super", value: 28 },
  { name: "Bullion", value: 16 },
  { name: "Cash", value: 10 },
];

const LANDING_ALLOCATION_COLORS = ["#ff4b33", "#ff8f80", "#ffd0c9", "#6f7382"];

const LANDING_TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "#12131a",
  border: "1px solid #3e4150",
  borderRadius: "10px",
  color: "#f8f8fb",
};

const LANDING_TOOLTIP_LABEL_STYLE = {
  color: "#f8f8fb",
  fontWeight: 700,
};

const LANDING_TOOLTIP_ITEM_STYLE = {
  color: "#f8f8fb",
  fontWeight: 600,
};
interface Banner {
  type: "success" | "error" | "info";
  message: string;
}

interface RiskFlag {
  label: string;
  value: string;
  tone: "green" | "yellow" | "red";
  help: string;
}

interface StressScenarioResult {
  name: string;
  impactAmount: number;
  impactPct: number;
  projectedValue: number;
}

interface TodayMover {
  ticker: string;
  changeAmount: number;
  changePct: number;
  previousValue: number;
  currentValue: number;
}

interface ApiError {
  error?: string;
}

interface PriceRefreshPayload {
  state: PortfolioState;
  updatedTickers: string[];
  failedTickers: string[];
  fetchedAt: string;
  triggeredAlerts?: Array<{
    ticker: string;
    dropPct: number;
    thresholdPct: number;
  }>;
  failedAlertTickers?: string[];
}

interface HistoricalRiskEstimatePayload {
  source: "yahoo_estimate";
  lessAccurateThanSnapshots: true;
  note: string;
  benchmarkSymbol: string;
  benchmarkName: string;
  riskWindow: RiskWindow;
  pointsTarget: number;
  pointsUsed: number;
  returnsCount: number;
  benchmarkPointsUsed: number;
  usedTickers: string[];
  failedTickers: string[];
  volatilityAnnualPct: number | null;
  maxDrawdownPct: number | null;
  var95Pct: number | null;
  var95Amount: number | null;
  cvar95Pct: number | null;
  cvar95Amount: number | null;
  betaToBenchmark: number | null;
  trackingErrorAnnualPct: number | null;
  correlationToBenchmark: number | null;
  outlierReturnsRemoved: number;
  cornishFisherVar95Pct: number | null;
  cornishFisherVar95Amount: number | null;
  rsi14: number | null;
  stochastic14: number | null;
  obvValue: number | null;
  obvTrend: string | null;
  correlationMatrix: { tickers: string[]; matrix: number[][] } | null;
  regime: { vix: number | null; label: string; cssClass: string } | null;
  factorExposure: { marketBeta: number | null; sizeBeta: number | null } | null;
  sharpeRatioAnnual: number | null;
  sortinoRatioAnnual: number | null;
  returnSkewness: number | null;
}

interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  createdAt?: string;
  planTier: "none" | "free" | "plus" | "pro";
  proEnabled: boolean;
  subscriptionStatus: string | null;
}

interface AuthSessionPayload {
  authenticated: boolean;
  user?: SessionUser;
  verificationRequired?: boolean;
  message?: string;
}

interface PasswordResetRequestResponse {
  message?: string;
}

interface VerificationResendResponse {
  message?: string;
}

interface BillingCheckoutResponse {
  url?: string;
}

interface BillingPortalResponse {
  url?: string;
}

interface PriceDipAlertSetting {
  id: string;
  ticker: string;
  dropPctThreshold: number;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PriceDipAlertsPayload {
  alerts: PriceDipAlertSetting[];
  maxAlerts: number;
  planTier: "none" | "free" | "plus" | "pro";
  proEnabled: boolean;
  availableTickers: string[];
}

interface UploadCandidate {
  label: string;
  text: string;
}

interface HoldingsAiBreakdown {
  ticker: string;
  summary: string;
  influences: string[];
  riskFlags: string[];
  confidence: number;
}

interface HoldingsAiAnalysis {
  generatedAt: string;
  model: string;
  question: string;
  answer: string;
  portfolioDrivers: string[];
  holdingBreakdown: HoldingsAiBreakdown[];
  riskChecks: string[];
  nextActions: string[];
}

interface HoldingsAiApiPayload {
  ok?: boolean;
  analysis?: HoldingsAiAnalysis;
  error?: string;
}

type CheckoutPlan = "free" | "plus" | "pro";

const HOLDINGS_AI_DEFAULT_PROMPT = "What may be influencing the value of my current holdings?";
const DEMO_USER_ID = "demo-portfolio";
const DEMO_AVAILABLE_TICKERS = ["CBA", "BHP", "MQG", "BTC", "ETH"];
const DEMO_SESSION_USER: SessionUser = {
  id: DEMO_USER_ID,
  email: "demo@spectre-assets.com",
  displayName: "Demo Portfolio",
  createdAt: "2026-01-10T09:30:00.000Z",
  planTier: "pro",
  proEnabled: true,
  subscriptionStatus: "active",
};
const DEMO_DIP_ALERTS: PriceDipAlertSetting[] = [
  {
    id: "demo-alert-cba",
    ticker: "CBA",
    dropPctThreshold: 3.5,
    enabled: true,
    lastTriggeredAt: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "demo-alert-btc",
    ticker: "BTC",
    dropPctThreshold: 5,
    enabled: true,
    lastTriggeredAt: "2026-03-05T04:00:00.000Z",
    createdAt: "2026-03-02T00:00:00.000Z",
    updatedAt: "2026-03-05T04:00:00.000Z",
  },
];
const DEMO_PORTFOLIO_STATE = createDemoPortfolioState();

export default function Home() {
  const [demoMode, setDemoMode] = useState(false);
  const [state, setState] = useState<PortfolioState>(EMPTY_STATE);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [riskWindow, setRiskWindow] = useState<RiskWindow>("3M");
  const [historicalRiskEstimate, setHistoricalRiskEstimate] = useState<HistoricalRiskEstimatePayload | null>(null);
  const [loadingHistoricalEstimate, setLoadingHistoricalEstimate] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authAcceptsTerms, setAuthAcceptsTerms] = useState(false);
  const [registerCheckoutPlan, setRegisterCheckoutPlan] = useState<CheckoutPlan>("free");
  const [authWorking, setAuthWorking] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checkoutWorking, setCheckoutWorking] = useState(false);
  const [billingPortalWorking, setBillingPortalWorking] = useState(false);
  const [landingMenuOpen, setLandingMenuOpen] = useState(false);
  const [dipAlerts, setDipAlerts] = useState<PriceDipAlertSetting[]>([]);
  const [availableDipTickers, setAvailableDipTickers] = useState<string[]>([]);
  const [dipAlertMax, setDipAlertMax] = useState(0);
  const [dipAlertTicker, setDipAlertTicker] = useState("");
  const [dipAlertThreshold, setDipAlertThreshold] = useState("3");
  const [dipAlertSaving, setDipAlertSaving] = useState(false);
  const [holdingsAiQuestion, setHoldingsAiQuestion] = useState(HOLDINGS_AI_DEFAULT_PROMPT);
  const [holdingsAiLoading, setHoldingsAiLoading] = useState(false);
  const [holdingsAiError, setHoldingsAiError] = useState("");
  const [holdingsAiResult, setHoldingsAiResult] = useState<HoldingsAiAnalysis | null>(null);
  const [activePage, setActivePage] = useState<"quant" | "ai" | "import" | "settings">("quant");

  // Trigger Recharts ResponsiveContainer to remeasure after tab switch
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 30);
    return () => clearTimeout(t);
  }, [activePage]);

  const refreshInFlight = useRef(false);
  const lastAutoRefreshAttemptAtRef = useRef(0);

  const syncDemoModeFromLocation = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setDemoMode(params.get("demo") === "1");
  }, []);

  useEffect(() => {
    syncDemoModeFromLocation();

    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("popstate", syncDemoModeFromLocation);

    return () => {
      window.removeEventListener("popstate", syncDemoModeFromLocation);
    };
  }, [syncDemoModeFromLocation]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (demoMode) {
      window.location.replace("/dashboard?demo=1");
      return;
    }

    if (!loading && sessionUser) {
      window.location.replace("/dashboard?mode=account");
    }
  }, [demoMode, loading, sessionUser]);

  useEffect(() => {
    const loadSessionAndState = async () => {
      setLoading(true);

      if (demoMode) {
        setSessionUser(DEMO_SESSION_USER);
        setState(DEMO_PORTFOLIO_STATE);
        setHistoricalRiskEstimate(buildDemoHistoricalRiskEstimate(DEMO_PORTFOLIO_STATE, riskWindow));
        setDipAlerts(DEMO_DIP_ALERTS);
        setAvailableDipTickers(DEMO_AVAILABLE_TICKERS);
        setDipAlertMax(10);
        setDipAlertTicker(DEMO_AVAILABLE_TICKERS[0]);
        setBanner(null);
        setLoading(false);
        return;
      }

      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        if (!sessionResponse.ok) {
          throw new Error("Failed to load account session.");
        }

        const sessionPayload = (await sessionResponse.json()) as AuthSessionPayload;

        if (!sessionPayload.authenticated || !sessionPayload.user) {
          setSessionUser(null);
          setState(EMPTY_STATE);
          setDipAlerts([]);
          setAvailableDipTickers([]);
          setDipAlertMax(0);
          setLoading(false);
          return;
        }

        setSessionUser(normalizeSessionUser(sessionPayload.user));

        const response = await fetch("/api/portfolio", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(await parseApiError(response, "Failed to load portfolio state."));
        }

        const payload = (await response.json()) as PortfolioState;
        setState(payload);
      } catch (error) {
        setBanner({ type: "error", message: error instanceof Error ? error.message : "Failed to load portfolio." });
      } finally {
        setLoading(false);
      }
    };

    void loadSessionAndState();
  }, [demoMode, riskWindow]);

  useEffect(() => {
    if (!banner || banner.message !== INVALID_UPLOAD_FORMAT_MESSAGE) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setBanner((current) => (current?.message === INVALID_UPLOAD_FORMAT_MESSAGE ? null : current));
    }, INVALID_UPLOAD_MESSAGE_TTL_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [banner]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get("checkout");
    const checkoutPlan = toCheckoutPlan(params.get("plan"));
    const verifiedState = params.get("verified");

    if (checkoutState === "success") {
      const planLabel = checkoutPlan === "pro" ? "Pro" : "Plus";
      setBanner({ type: "success", message: `${planLabel} plan checkout complete. Your subscription will activate shortly.` });
    } else if (checkoutState === "cancelled") {
      setBanner({ type: "info", message: "Stripe checkout was cancelled." });
    }

    if (verifiedState === "success") {
      setAuthMode("login");
      setAuthError("");
      setBanner({ type: "success", message: "Email verified. You can now sign in." });
    } else if (verifiedState === "invalid") {
      setBanner({ type: "error", message: "Verification link is invalid or expired. Click Resend Verification." });
    } else if (verifiedState === "rate_limited") {
      setBanner({ type: "error", message: "Too many verification attempts. Please wait and try again." });
    }

    if (checkoutState || verifiedState) {
      params.delete("checkout");
      params.delete("plan");
      params.delete("verified");
      const query = params.toString();
      const hash = window.location.hash;
      const nextUrl = query.length > 0 ? `${window.location.pathname}?${query}${hash}` : `${window.location.pathname}${hash}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  const refreshPrices = useCallback(async (showBanner: boolean) => {
    if (demoMode) {
      if (showBanner) {
        setBanner({ type: "info", message: "Demo prices are static. Create an account to refresh live prices." });
      }
      return;
    }

    if (!sessionUser) {
      return;
    }

    if (refreshInFlight.current) {
      return;
    }

    refreshInFlight.current = true;
    setRefreshingPrices(true);

    try {
      const response = await fetch("/api/prices/refresh", { method: "POST" });
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to refresh live prices."));
      }

      const payload = (await response.json()) as PriceRefreshPayload;
      setState(payload.state);

      if (showBanner) {
        const triggeredCount = payload.triggeredAlerts?.length ?? 0;
        const failedAlertCount = payload.failedAlertTickers?.length ?? 0;
        const message =
          "Live prices updated: " +
          payload.updatedTickers.length +
          " tickers refreshed" +
          (payload.failedTickers.length > 0 ? ", " + payload.failedTickers.length + " failed" : "") +
          (triggeredCount > 0 ? ", " + triggeredCount + " dip alert" + (triggeredCount === 1 ? "" : "s") + " sent" : "") +
          (failedAlertCount > 0 ? ", " + failedAlertCount + " alert email" + (failedAlertCount === 1 ? "" : "s") + " failed" : "") +
          ".";
        setBanner({ type: payload.failedTickers.length > 0 || failedAlertCount > 0 ? "info" : "success", message });
      }
    } catch (error) {
      if (showBanner) {
        setBanner({ type: "error", message: error instanceof Error ? error.message : "Live price refresh failed." });
      }
    } finally {
      setRefreshingPrices(false);
      refreshInFlight.current = false;
    }
  }, [demoMode, sessionUser]);

  const loadDipAlerts = useCallback(async () => {
    if (demoMode) {
      setDipAlerts(DEMO_DIP_ALERTS);
      setAvailableDipTickers(DEMO_AVAILABLE_TICKERS);
      setDipAlertMax(10);
      setDipAlertTicker((current) => current || DEMO_AVAILABLE_TICKERS[0]);
      return;
    }

    if (!sessionUser) {
      setDipAlerts([]);
      setAvailableDipTickers([]);
      setDipAlertMax(0);
      return;
    }

    const response = await fetch("/api/alerts/price-dip", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(await parseApiError(response, "Failed to load dip alert settings."));
    }

    const payload = (await response.json()) as PriceDipAlertsPayload;
    const nextTickers = payload.availableTickers || [];

    setDipAlerts(payload.alerts || []);
    setAvailableDipTickers(nextTickers);
    setDipAlertMax(Number.isFinite(payload.maxAlerts) ? Math.max(0, payload.maxAlerts) : 0);
    setDipAlertTicker((current) => {
      const normalizedCurrent = current.trim().toUpperCase();
      if (normalizedCurrent.length > 0) {
        return normalizedCurrent;
      }
      return nextTickers[0] || "";
    });
  }, [demoMode, sessionUser]);

  const saveDipAlert = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();

    if (!sessionUser) {
      return;
    }

    const ticker = dipAlertTicker.trim().toUpperCase();
    const threshold = Number(dipAlertThreshold);

    if (!ticker) {
      setBanner({ type: "error", message: "Pick an ASX ticker for the dip alert." });
      return;
    }

    if (!Number.isFinite(threshold) || threshold < 0.1 || threshold > 90) {
      setBanner({ type: "error", message: "Dip threshold must be between 0.1% and 90%." });
      return;
    }

    if (demoMode) {
      const nowIso = new Date().toISOString();
      let didPersist = false;

      setDipAlerts((current) => {
        const existing = current.find((alert) => alert.ticker === ticker);
        if (!existing && current.length >= dipAlertMax) {
          return current;
        }

        didPersist = true;
        if (existing) {
          return current.map((alert) => (
            alert.ticker === ticker
              ? { ...alert, dropPctThreshold: threshold, enabled: true, updatedAt: nowIso }
              : alert
          ));
        }

        return [
          ...current,
          {
            id: `demo-alert-${ticker.toLowerCase()}`,
            ticker,
            dropPctThreshold: threshold,
            enabled: true,
            lastTriggeredAt: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ];
      });

      if (!didPersist) {
        setBanner({ type: "error", message: "Demo alert limit reached. Remove one to add another." });
        return;
      }

      setBanner({ type: "success", message: `Demo alert saved for ${ticker} at ${threshold.toFixed(2)}%.` });
      return;
    }

    setDipAlertSaving(true);
    try {
      const response = await fetch("/api/alerts/price-dip", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker,
          dropPctThreshold: threshold,
          enabled: true,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to save dip alert."));
      }

      await loadDipAlerts();
      setBanner({ type: "success", message: `Dip alert saved for ${ticker} at ${threshold.toFixed(2)}%.` });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Failed to save dip alert." });
    } finally {
      setDipAlertSaving(false);
    }
  }, [demoMode, dipAlertMax, dipAlertThreshold, dipAlertTicker, loadDipAlerts, sessionUser]);

  const toggleDipAlert = useCallback(async (alert: PriceDipAlertSetting, enabled: boolean) => {
    if (demoMode) {
      const nowIso = new Date().toISOString();
      setDipAlerts((current) => current.map((item) => (
        item.id === alert.id ? { ...item, enabled, updatedAt: nowIso } : item
      )));
      return;
    }

    setDipAlertSaving(true);
    try {
      const response = await fetch("/api/alerts/price-dip", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker: alert.ticker,
          dropPctThreshold: alert.dropPctThreshold,
          enabled,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to update dip alert."));
      }

      await loadDipAlerts();
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Failed to update dip alert." });
    } finally {
      setDipAlertSaving(false);
    }
  }, [demoMode, loadDipAlerts]);

  const deleteDipAlert = useCallback(async (ticker: string) => {
    if (demoMode) {
      setDipAlerts((current) => current.filter((alert) => alert.ticker !== ticker));
      setBanner({ type: "info", message: `Demo alert removed for ${ticker}.` });
      return;
    }

    setDipAlertSaving(true);
    try {
      const response = await fetch(`/api/alerts/price-dip?ticker=${encodeURIComponent(ticker)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to delete dip alert."));
      }

      await loadDipAlerts();
      setBanner({ type: "info", message: `Dip alert removed for ${ticker}.` });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Failed to delete dip alert." });
    } finally {
      setDipAlertSaving(false);
    }
  }, [demoMode, loadDipAlerts]);

  const runHoldingsAi = useCallback(async (event?: FormEvent) => {
    event?.preventDefault();

    const question = holdingsAiQuestion.trim().length > 0
      ? holdingsAiQuestion.trim()
      : HOLDINGS_AI_DEFAULT_PROMPT;

    if (demoMode) {
      setHoldingsAiLoading(true);
      setHoldingsAiError("");

      await new Promise((resolve) => {
        window.setTimeout(resolve, 350);
      });

      setHoldingsAiResult(buildDemoHoldingsAiAnalysis(question));
      setHoldingsAiLoading(false);
      return;
    }

    if (!sessionUser) {
      return;
    }

    if (state.holdings.length === 0) {
      setHoldingsAiError("Import holdings first, then run Ask AI.");
      return;
    }

    setHoldingsAiLoading(true);
    setHoldingsAiError("");

    try {
      const response = await fetch("/api/pro/holdings-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to run Ask AI holdings analysis."));
      }

      const payload = (await response.json()) as HoldingsAiApiPayload;
      if (!payload.ok || !payload.analysis) {
        throw new Error(payload.error || "AI analysis response was empty.");
      }

      setHoldingsAiResult(payload.analysis);
    } catch (error) {
      setHoldingsAiError(error instanceof Error ? error.message : "Failed to run Ask AI holdings analysis.");
    } finally {
      setHoldingsAiLoading(false);
    }
  }, [demoMode, holdingsAiQuestion, sessionUser, state.holdings.length]);

  useEffect(() => {
    if (!sessionUser || loading || demoMode) {
      return;
    }

    let cancelled = false;
    let timerId: number | null = null;

    const runRefresh = async () => {
      if (cancelled) {
        return;
      }

      lastAutoRefreshAttemptAtRef.current = Date.now();
      await refreshPrices(false);
    };

    const scheduleNext = () => {
      if (cancelled) {
        return;
      }

      timerId = window.setTimeout(() => {
        void runRefresh().finally(() => {
          scheduleNext();
        });
      }, AUTO_REFRESH_INTERVAL_MS);
    };

    const refreshOnResume = () => {
      if (cancelled) {
        return;
      }

      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      const elapsed = Date.now() - lastAutoRefreshAttemptAtRef.current;
      if (elapsed < AUTO_REFRESH_INTERVAL_MS - AUTO_REFRESH_RESUME_GRACE_MS) {
        return;
      }

      void runRefresh();
    };

    void runRefresh();
    scheduleNext();

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", refreshOnResume);
    }

    window.addEventListener("focus", refreshOnResume);
    window.addEventListener("online", refreshOnResume);

    return () => {
      cancelled = true;

      if (timerId != null) {
        window.clearTimeout(timerId);
      }

      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", refreshOnResume);
      }

      window.removeEventListener("focus", refreshOnResume);
      window.removeEventListener("online", refreshOnResume);
    };
  }, [demoMode, loading, refreshPrices, sessionUser]);

  useEffect(() => {
    if (demoMode) {
      setDipAlerts(DEMO_DIP_ALERTS);
      setAvailableDipTickers(DEMO_AVAILABLE_TICKERS);
      setDipAlertMax(10);
      setDipAlertTicker((current) => current || DEMO_AVAILABLE_TICKERS[0]);
      return;
    }

    if (!sessionUser) {
      setDipAlerts([]);
      setAvailableDipTickers([]);
      setDipAlertMax(0);
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        await loadDipAlerts();
      } catch {
        if (!cancelled) {
          setDipAlerts([]);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [demoMode, loadDipAlerts, sessionUser, state.updatedAt]);

  useEffect(() => {
    if (sessionUser?.proEnabled) {
      return;
    }

    setHoldingsAiError("");
    setHoldingsAiResult(null);
    setHoldingsAiLoading(false);
  }, [sessionUser?.proEnabled]);

  const metrics = useMemo(() => computeMetrics(state.holdings, state.snapshots, riskWindow), [state.holdings, state.snapshots, riskWindow]);

  const portfolioHistorySeries = useMemo(() => {
    const latestByDay = new Map<string, { date: string; value: number }>();

    for (const snapshot of metrics.history) {
      const dayKey = snapshot.date.slice(0, 10);
      const existing = latestByDay.get(dayKey);

      if (!existing || snapshot.date > existing.date) {
        latestByDay.set(dayKey, snapshot);
      }
    }

    const dailySeries = Array.from(latestByDay.values()).sort((a, b) => a.date.localeCompare(b.date));
    return dailySeries.length > 1 ? dailySeries : metrics.history;
  }, [metrics.history]);
  const needsYahooEstimate = metrics.dailyReturns.length < 20 && state.holdings.length > 0;

  useEffect(() => {
    if (demoMode) {
      setHistoricalRiskEstimate(buildDemoHistoricalRiskEstimate(DEMO_PORTFOLIO_STATE, riskWindow));
      setLoadingHistoricalEstimate(false);
      return;
    }

    if (!sessionUser || loading) {
      setHistoricalRiskEstimate(null);
      setLoadingHistoricalEstimate(false);
      return;
    }

    if (!needsYahooEstimate) {
      setHistoricalRiskEstimate(null);
      setLoadingHistoricalEstimate(false);
      return;
    }

    let ignore = false;

    const loadHistoricalEstimate = async () => {
      setLoadingHistoricalEstimate(true);
      try {
        const response = await fetch("/api/risk/estimate?window=" + encodeURIComponent(riskWindow), { method: "POST" });
        if (!response.ok) {
          throw new Error(await parseApiError(response, "Failed to estimate historical risk from Yahoo."));
        }

        const payload = (await response.json()) as HistoricalRiskEstimatePayload;
        if (!ignore) {
          setHistoricalRiskEstimate(payload);
        }
      } catch {
        if (!ignore) {
          setHistoricalRiskEstimate(null);
        }
      } finally {
        if (!ignore) {
          setLoadingHistoricalEstimate(false);
        }
      }
    };

    void loadHistoricalEstimate();

    return () => {
      ignore = true;
    };
  }, [demoMode, loading, needsYahooEstimate, riskWindow, sessionUser, state.updatedAt]);

  const effectiveVolatilityAnnualPct = metrics.volatilityAnnualPct ?? historicalRiskEstimate?.volatilityAnnualPct ?? null;
  const effectiveVar95Pct = metrics.var95Pct ?? historicalRiskEstimate?.var95Pct ?? null;
  const effectiveVar95Amount = metrics.var95Amount ?? historicalRiskEstimate?.var95Amount ?? null;
  const effectiveCvar95Pct = metrics.cvar95Pct ?? historicalRiskEstimate?.cvar95Pct ?? null;
  const effectiveCvar95Amount = metrics.cvar95Amount ?? historicalRiskEstimate?.cvar95Amount ?? null;
  const effectiveMaxDrawdownPct = metrics.maxDrawdownPct ?? historicalRiskEstimate?.maxDrawdownPct ?? null;
  const benchmarkBeta = historicalRiskEstimate?.betaToBenchmark ?? null;
  const benchmarkTrackingErrorAnnualPct = historicalRiskEstimate?.trackingErrorAnnualPct ?? null;
  const proAnalyticsEnabled = sessionUser?.proEnabled === true;
  const askAiEnabled = sessionUser != null;
  const starterPlan = !proAnalyticsEnabled;
  const dipAlertSlotsRemaining = Math.max(0, dipAlertMax - dipAlerts.length);
  const dipAlertPlanMessage = proAnalyticsEnabled
    ? `Pro plan: up to ${dipAlertMax} active dip alerts.`
    : "Dip alerts are now Pro only. Upgrade to Pro to enable alert emails.";
  const hasMembership =
    (sessionUser?.subscriptionStatus || "").trim().length > 0 || (sessionUser?.planTier ?? "none") !== "none";
  const settingsMembershipStatus = sessionUser?.subscriptionStatus
    ? sessionUser.subscriptionStatus.toUpperCase()
    : hasMembership
      ? "ACTIVE"
      : "NOT ACTIVE";
  const usingYahooFallback = metrics.var95Amount == null && historicalRiskEstimate != null;
  const riskReturnsUsed = usingYahooFallback ? (historicalRiskEstimate?.returnsCount ?? 0) : metrics.dailyReturns.length;

  const portfolioRiskScore = useMemo(() => {
    if (state.holdings.length === 0 || metrics.totalValue <= 0) {
      return null;
    }

    const volatilityPenalty = normalizePenalty(effectiveVolatilityAnnualPct, 8, 30) * 30;
    const varPenalty = normalizePenalty(effectiveVar95Pct, 0.7, 3.2) * 22;
    const drawdownPenalty = normalizePenalty(effectiveMaxDrawdownPct, 6, 25) * 20;
    const diversifiedSleeveRelief = clamp(metrics.diversifiedIndexFundPct / 100, 0, 1);
    const concentrationWeight = 16 * (1 - 0.55 * diversifiedSleeveRelief);
    const accountWeight = 12 * (1 - 0.45 * diversifiedSleeveRelief);
    const concentrationPenalty = normalizePenalty(metrics.top3ConcentrationPct, 30, 75) * concentrationWeight;
    const accountPenalty = normalizePenalty(metrics.largestAccountPct, 45, 85) * accountWeight;
    const sourceMixPenalty = normalizePenalty(metrics.sourceRiskLoad, 0.55, 1.35) * 10;
    const confidencePenalty = (1 - clamp(riskReturnsUsed / 63, 0, 1)) * 12;
    const totalPenalty = volatilityPenalty + varPenalty + drawdownPenalty + concentrationPenalty + accountPenalty + sourceMixPenalty + confidencePenalty;
    const baseScore = Math.round(clamp(totalPenalty, 1, 99));
    const qualitativeAdjustment = proAnalyticsEnabled ? computeAiRiskAdjustment(holdingsAiResult) : 0;
    const aiAdjustment = -qualitativeAdjustment;
    const score = Math.round(clamp(baseScore + aiAdjustment, 1, 99));

    const label = score >= 75 ? "Elevated" : score >= 55 ? "Moderate" : "Controlled";
    const confidence = riskReturnsUsed >= 63 ? "High" : riskReturnsUsed >= 20 ? "Medium" : "Low";

    return {
      baseScore,
      score,
      label,
      confidence,
      returnsUsed: riskReturnsUsed,
      aiAdjustment,
    };
  }, [effectiveMaxDrawdownPct, effectiveVar95Pct, effectiveVolatilityAnnualPct, holdingsAiResult, metrics.diversifiedIndexFundPct, metrics.largestAccountPct, metrics.sourceRiskLoad, metrics.top3ConcentrationPct, metrics.totalValue, proAnalyticsEnabled, riskReturnsUsed, state.holdings.length]);

  const portfolioRiskScoreTone = portfolioRiskScore == null
    ? "neutral"
    : portfolioRiskScore.score >= 75
      ? "negative"
      : portfolioRiskScore.score >= 55
        ? "neutral"
        : "positive";
  const aiRiskAdjustmentLabel = portfolioRiskScore
    ? `${portfolioRiskScore.aiAdjustment >= 0 ? "+" : ""}${portfolioRiskScore.aiAdjustment} pts`
    : "+0 pts";

  const todayMovers = useMemo<TodayMover[]>(() => {
    const grouped = new Map<string, { changeAmount: number; previousValue: number; currentValue: number }>();

    for (const holding of state.holdings) {
      if (holding.source !== "asx") {
        continue;
      }

      const sessionOpen = holding.sessionOpen ?? Number.NaN;
      const moverBase = Number.isFinite(sessionOpen) && sessionOpen > 0
        ? sessionOpen
        : holding.prevClose;
      const quantity = resolveHoldingUnits(holding.units, holding.value, holding.price);
      if (quantity <= 0 || !Number.isFinite(holding.price) || !Number.isFinite(moverBase) || holding.price <= 0 || moverBase <= 0) {
        continue;
      }

      const previousValue = quantity * moverBase;
      const currentValue = quantity * holding.price;
      const changeAmount = currentValue - previousValue;
      const ticker = holding.ticker.toUpperCase();
      const existing = grouped.get(ticker);

      grouped.set(ticker, {
        changeAmount: (existing?.changeAmount ?? 0) + changeAmount,
        previousValue: (existing?.previousValue ?? 0) + previousValue,
        currentValue: (existing?.currentValue ?? 0) + currentValue,
      });
    }

    return Array.from(grouped.entries())
      .map(([ticker, values]) => ({
        ticker,
        changeAmount: values.changeAmount,
        previousValue: values.previousValue,
        currentValue: values.currentValue,
        changePct: values.previousValue > 0 ? (values.changeAmount / values.previousValue) * 100 : 0,
      }))
      .sort((a, b) => b.changePct - a.changePct);
  }, [state.holdings]);

  const todaySydney = toSydneyDateKey(new Date());

  const preExistingHoldings = useMemo(() => {
    return state.holdings.filter((holding) => {
      const importedAt = new Date(holding.importedAt);
      if (Number.isNaN(importedAt.getTime())) {
        return true;
      }

      return toSydneyDateKey(importedAt) < todaySydney;
    });
  }, [state.holdings, todaySydney]);

  const hasSameDayImports = preExistingHoldings.length < state.holdings.length;

  const todaySnapshotSeries = useMemo(() => {
    const todaySydneyKey = toSydneyDateKey(new Date());

    return state.snapshots
      .map((snapshot) => ({ date: new Date(snapshot.date), value: snapshot.value }))
      .filter(
        (snapshot) =>
          !Number.isNaN(snapshot.date.getTime()) &&
          Number.isFinite(snapshot.value) &&
          snapshot.value >= 0 &&
          toSydneyDateKey(snapshot.date) === todaySydneyKey,
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [state.snapshots]);

  const todaySessionFallback = useMemo(() => {
    let previousTotal = 0;
    let currentTotal = 0;

    for (const holding of preExistingHoldings) {
      const sessionOpen = holding.sessionOpen ?? Number.NaN;
      const changeBase = Number.isFinite(sessionOpen) && sessionOpen > 0
        ? sessionOpen
        : holding.prevClose;
      const quantity = resolveHoldingUnits(holding.units, holding.value, holding.price);
      if (
        quantity <= 0 ||
        !Number.isFinite(holding.price) ||
        !Number.isFinite(changeBase) ||
        holding.price <= 0 ||
        changeBase <= 0
      ) {
        if (Number.isFinite(holding.value) && holding.value > 0) {
          previousTotal += holding.value;
          currentTotal += holding.value;
        }
        continue;
      }

      previousTotal += quantity * changeBase;
      currentTotal += quantity * holding.price;
    }

    if (previousTotal <= 0) {
      return null;
    }

    const amount = currentTotal - previousTotal;
    return {
      amount,
      pct: (amount / previousTotal) * 100,
    };
  }, [preExistingHoldings]);

  const hasTodaySnapshotBaseline =
    !hasSameDayImports && todaySnapshotSeries.length > 0 && todaySnapshotSeries[0].value > 0;
  const todayBaselineValue = hasTodaySnapshotBaseline ? todaySnapshotSeries[0].value : null;
  const todayPortfolioChangeAmount =
    todayBaselineValue != null ? metrics.totalValue - todayBaselineValue : (todaySessionFallback?.amount ?? 0);
  const todayPortfolioChangePct =
    todayBaselineValue != null
      ? (todayPortfolioChangeAmount / todayBaselineValue) * 100
      : (todaySessionFallback?.pct ?? null);
  const asxSessionOpenNow = isAsxRegularSessionOpenNow();
  const asxSessionDataFreshNow = isAsxSessionDataFreshNow(state.lastPriceRefreshAt);
  const showTodaySessionChange = asxSessionOpenNow && asxSessionDataFreshNow;
  const portfolioChangeLabel = "Today Change";
  const moverPeriodLabel = showTodaySessionChange ? "Today" : "Latest Session";
  const todayTopGainer = todayMovers.length > 0 ? todayMovers[0] : null;
  const todayTopLoser = todayMovers.length > 0 ? todayMovers[todayMovers.length - 1] : null;

  const dataQualityRows = useMemo(() => {
    const marketHoldings = state.holdings.filter((holding) => holding.source === "asx" || holding.source === "crypto");
    const marketTickers = new Set(marketHoldings.map((holding) => holding.ticker.toUpperCase()));
    const pricedTickers = new Set(
      marketHoldings
        .filter((holding) => Number.isFinite(holding.price) && Number.isFinite(holding.prevClose) && holding.price > 0 && holding.prevClose > 0)
        .map((holding) => holding.ticker.toUpperCase()),
    );

    const dailySnapshotDates = new Set(metrics.history.map((snapshot) => snapshot.date.slice(0, 10)));
    const latestSnapshotAt = metrics.history.length > 0 ? metrics.history[metrics.history.length - 1].date : "";
    const outliersFiltered = usingYahooFallback ? (historicalRiskEstimate?.outlierReturnsRemoved ?? 0) : metrics.returnOutliersRemoved;
    const benchmarkOverlap = usingYahooFallback ? (historicalRiskEstimate?.benchmarkPointsUsed ?? 0) : null;

    const starterRows = [
      {
        label: "Daily snapshots",
        value: String(dailySnapshotDates.size),
        status: dailySnapshotDates.size >= 20 ? "good" : "warn",
      },
      {
        label: "Latest snapshot",
        value: latestSnapshotAt ? formatSnapshotLabel(latestSnapshotAt) : "N/A",
        status: latestSnapshotAt ? "good" : "warn",
      },
      {
        label: "Market tickers with live pricing",
        value: String(pricedTickers.size) + "/" + String(marketTickers.size),
        status: marketTickers.size === 0 || pricedTickers.size === marketTickers.size ? "good" : "warn",
      },
      {
        label: "Risk model source",
        value: usingYahooFallback ? "Yahoo estimate fallback" : "Your snapshots",
        status: usingYahooFallback ? "warn" : "good",
      },
      {
        label: "Plan tier",
        value: sessionUser ? sessionUser.planTier.toUpperCase() : "N/A",
        status: sessionUser?.proEnabled ? "good" : "warn",
      },
    ] as const;

    if (starterPlan) {
      return starterRows;
    }

    return [
      ...starterRows,
      {
        label: "Risk returns used",
        value: String(riskReturnsUsed),
        status: riskReturnsUsed >= 20 ? "good" : "warn",
      },
      {
        label: "Outliers filtered",
        value: String(outliersFiltered),
        status: outliersFiltered <= 2 ? "good" : "warn",
      },
      {
        label: "Benchmark overlap days",
        value: benchmarkOverlap == null ? "N/A" : String(benchmarkOverlap),
        status: benchmarkOverlap == null || benchmarkOverlap >= 20 ? "good" : "warn",
      },
    ] as const;
  }, [historicalRiskEstimate?.benchmarkPointsUsed, historicalRiskEstimate?.outlierReturnsRemoved, metrics.history, metrics.returnOutliersRemoved, riskReturnsUsed, sessionUser, starterPlan, state.holdings, usingYahooFallback]);

  const riskFlags = useMemo<RiskFlag[]>(() => {
    if (starterPlan) {
      return [
        toRiskFlag(
          "Top 3 concentration",
          metrics.top3ConcentrationPct,
          40,
          60,
          "%",
          "(Top 3 holding values / total portfolio value) x 100.",
        ),
      ].filter((flag) => flag.value !== "N/A");
    }

    const flags: RiskFlag[] = [
      toRiskFlag(
        "Annualized volatility",
        effectiveVolatilityAnnualPct,
        15,
        25,
        "%",
        "Std dev of daily returns in selected window multiplied by sqrt(252).",
      ),
      toRiskFlag(
        "Top 3 concentration",
        metrics.top3ConcentrationPct,
        40,
        60,
        "%",
        "(Top 3 holding values / total portfolio value) x 100.",
      ),
      toRiskFlag(
        "Largest account share",
        metrics.largestAccountPct,
        55,
        75,
        "%",
        "(Largest account value / total portfolio value) x 100.",
      ),
      toRiskFlag(
        "Portfolio concentration (HHI)",
        metrics.hhi,
        1500,
        2500,
        "",
        "Sum of squared holding weights multiplied by 10,000.",
      ),
      toRiskFlag(
        "Max drawdown",
        effectiveMaxDrawdownPct,
        10,
        20,
        "%",
        "Largest peak-to-trough drop inside the selected risk window.",
      ),
      toRiskFlag(
        "1-day VaR 95",
        effectiveVar95Pct,
        1.2,
        2.5,
        "%",
        "95% historical VaR using the 5th percentile of daily returns in the selected window.",
      ),
    ];

    flags.push(
      toRiskFlag(
        "1-day Expected Shortfall 95",
        effectiveCvar95Pct,
        1.8,
        3.5,
        "%",
        "Average loss within the worst 5% of daily returns in the selected window.",
      ),
    );
    flags.push(
      toRiskFlag(
        "Beta vs ASX 200",
        benchmarkBeta,
        1.1,
        1.35,
        "",
        "Sensitivity of portfolio returns to ASX 200 returns using date-aligned daily data.",
      ),
    );
    flags.push(
      toRiskFlag(
        "Tracking error (annualized)",
        benchmarkTrackingErrorAnnualPct,
        6,
        12,
        "%",
        "Std dev of (portfolio return - ASX 200 return), annualized from daily data.",
      ),
    );
    flags.push(
      toRiskFlag(
        "CF-adjusted VaR 95",
        historicalRiskEstimate?.cornishFisherVar95Pct ?? null,
        1.5,
        3.0,
        "%",
        "Cornish-Fisher VaR adjusts the standard normal quantile for return skewness and excess kurtosis, giving a more accurate tail-risk estimate for non-normal portfolios.",
      ),
    );
    flags.push(
      toRiskFlag(
        "Correlation to ASX 200",
        historicalRiskEstimate?.correlationToBenchmark ?? null,
        0.8,
        0.92,
        "",
        "Pearson correlation of daily portfolio returns to the ASX 200. Values near 1.0 mean the portfolio largely tracks the index with limited diversification benefit.",
      ),
    );
    flags.push(
      toRiskFlagLow(
        "Sharpe ratio (annualized)",
        historicalRiskEstimate?.sharpeRatioAnnual ?? null,
        0.5,
        0,
        "",
        "Annualized excess return (above ~4.35% RBA cash rate) per unit of total volatility. Below 0.5 is below market average; below 0 means returns failed to beat the risk-free rate.",
      ),
    );
    flags.push(
      toRiskFlagLow(
        "Sortino ratio (annualized)",
        historicalRiskEstimate?.sortinoRatioAnnual ?? null,
        0.7,
        0,
        "",
        "Like Sharpe but only penalizes downside volatility, ignoring upside moves. Below 0.7 suggests weak risk-adjusted performance; below 0 means negative excess return.",
      ),
    );
    const skewVal = historicalRiskEstimate?.returnSkewness ?? null;
    if (skewVal != null && Number.isFinite(skewVal)) {
      const skewTone: "green" | "yellow" | "red" = skewVal <= -1.0 ? "red" : skewVal <= -0.5 ? "yellow" : "green";
      flags.push({
        label: "Return skewness",
        value: skewVal.toFixed(2),
        tone: skewTone,
        help: "Negative skewness means the return distribution has a fatter left tail — more frequent or larger losses than gains. Below -0.5 warrants attention; below -1.0 indicates significant crash risk.",
      });
    }

    return flags.filter((flag) => flag.value !== "N/A");
  }, [benchmarkBeta, benchmarkTrackingErrorAnnualPct, effectiveCvar95Pct, effectiveMaxDrawdownPct, effectiveVar95Pct, effectiveVolatilityAnnualPct, historicalRiskEstimate?.cornishFisherVar95Pct, historicalRiskEstimate?.correlationToBenchmark, historicalRiskEstimate?.returnSkewness, historicalRiskEstimate?.sharpeRatioAnnual, historicalRiskEstimate?.sortinoRatioAnnual, metrics.hhi, metrics.largestAccountPct, metrics.top3ConcentrationPct, starterPlan]);

  const latestReportDate = useMemo(() => {
    if (state.holdings.length === 0) {
      return "";
    }

    return [...state.holdings].sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0].reportDate;
  }, [state.holdings]);

  const bullionHoldings = useMemo(() => state.holdings.filter((holding) => holding.source === "gold"), [state.holdings]);

  const goldHoldings = useMemo(
    () => bullionHoldings.filter((holding) => detectBullionMetal(holding) === "gold"),
    [bullionHoldings],
  );

  const silverHoldings = useMemo(
    () => bullionHoldings.filter((holding) => detectBullionMetal(holding) === "silver"),
    [bullionHoldings],
  );

  const goldWeightOz = useMemo(
    () => goldHoldings.reduce((total, holding) => total + (Number.isFinite(holding.units) ? holding.units : 0), 0),
    [goldHoldings],
  );

  const silverWeightOz = useMemo(
    () => silverHoldings.reduce((total, holding) => total + (Number.isFinite(holding.units) ? holding.units : 0), 0),
    [silverHoldings],
  );

  const goldValue = useMemo(() => goldHoldings.reduce((total, holding) => total + holding.value, 0), [goldHoldings]);
  const goldCostBase = useMemo(() => goldHoldings.reduce((total, holding) => total + holding.costBase, 0), [goldHoldings]);
  const silverValue = useMemo(() => silverHoldings.reduce((total, holding) => total + holding.value, 0), [silverHoldings]);
  const silverCostBase = useMemo(() => silverHoldings.reduce((total, holding) => total + holding.costBase, 0), [silverHoldings]);

  const assetSplit = useMemo(() => {
    const superValue = state.holdings.filter((holding) => holding.source === "super").reduce((acc, holding) => acc + holding.value, 0);
    const savingsValue = state.holdings.filter((holding) => holding.source === "savings").reduce((acc, holding) => acc + holding.value, 0);
    const asxValue = state.holdings.filter((holding) => holding.source === "asx").reduce((acc, holding) => acc + holding.value, 0);
    const cryptoValue = state.holdings.filter((holding) => holding.source === "crypto").reduce((acc, holding) => acc + holding.value, 0);
    const indexValue = state.holdings.filter((holding) => holding.source === "index").reduce((acc, holding) => acc + holding.value, 0);
    const fundValue = state.holdings.filter((holding) => holding.source === "fund").reduce((acc, holding) => acc + holding.value, 0);
    const taxValue = state.holdings.filter((holding) => holding.source === "tax").reduce((acc, holding) => acc + holding.value, 0);
    const bullionValue = state.holdings.filter((holding) => holding.source === "gold").reduce((acc, holding) => acc + holding.value, 0);

    const raw = [
      { name: "Super", value: superValue },
      { name: "Savings", value: savingsValue },
      { name: "ASX Shares", value: asxValue },
      { name: "Crypto", value: cryptoValue },
      { name: "Indices", value: indexValue },
      { name: "Mutual Funds", value: fundValue },
      { name: "Tax Records", value: taxValue },
      { name: "Bullion", value: bullionValue },
    ];

    const total = raw.reduce((acc, item) => acc + item.value, 0);

    return raw
      .filter((item) => item.value > 0)
      .map((item) => ({
        ...item,
        pct: total > 0 ? (item.value / total) * 100 : 0,
      }));
  }, [state.holdings]);

  const holdingPerformance = useMemo(() => {
    return state.holdings
      .map((holding) => {
        const pnl = holding.value - holding.costBase;
        const pnlPct = holding.costBase > 0 ? (pnl / holding.costBase) * 100 : Number.NaN;

        return {
          id: holding.id,
          ticker: holding.ticker,
          name: holding.name,
          pnl,
          pnlPct,
        };
      })
      .filter((item) => Number.isFinite(item.pnlPct))
      .sort((a, b) => b.pnlPct - a.pnlPct);
  }, [state.holdings]);

  const bestPerformer = holdingPerformance[0] ?? null;
  const worstPerformer = holdingPerformance.length > 0 ? holdingPerformance[holdingPerformance.length - 1] : null;

  const stressScenarios = useMemo<StressScenarioResult[]>(() => {
    if (metrics.totalValue <= 0 || state.holdings.length === 0) {
      return [];
    }

    const scenarios = [
      {
        name: "Equities -5%",
        shock: (source: DataSource, metal: "gold" | "silver") => {
          void metal;
          if (source === "crypto") {
            return -0.08;
          }
          return source === "asx" || source === "super" || source === "index" || source === "fund" ? -0.05 : 0;
        },
      },
      {
        name: "Bullion Stress (Gold -4%, Silver -7%)",
        shock: (source: DataSource, metal: "gold" | "silver") => (source === "gold" ? (metal === "gold" ? -0.04 : -0.07) : 0),
      },
      {
        name: "Mixed Shock",
        shock: (source: DataSource, metal: "gold" | "silver") => {
          if (source === "asx") {
            return -0.06;
          }

          if (source === "super") {
            return -0.04;
          }

          if (source === "index") {
            return -0.05;
          }

          if (source === "fund") {
            return -0.035;
          }

          if (source === "crypto") {
            return -0.12;
          }

          if (source === "gold") {
            return metal === "gold" ? 0.02 : -0.02;
          }

          return 0;
        },
      },
    ];

    return scenarios.map((scenario) => {
      const impactAmount = state.holdings.reduce((acc, holding) => {
        const metal = holding.source === "gold" ? detectBullionMetal(holding) : "gold";
        return acc + holding.value * scenario.shock(holding.source, metal);
      }, 0);

      const impactPct = metrics.totalValue > 0 ? (impactAmount / metrics.totalValue) * 100 : 0;

      return {
        name: scenario.name,
        impactAmount,
        impactPct,
        projectedValue: metrics.totalValue + impactAmount,
      };
    });
  }, [metrics.totalValue, state.holdings]);

  const onUpload = async (event: ChangeEvent<HTMLInputElement>, source: DataSource) => {
    if (demoMode) {
      event.target.value = "";
      setBanner({ type: "info", message: "Uploads are disabled in demo mode. Create an account to import your own reports." });
      return;
    }

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setWorking(true);

    try {
      const candidates = await readUploadFileCandidates(file);
      let bestHoldings: ReturnType<typeof parseRowsToHoldings> = [];
      let bestWarning = "";

      for (const candidate of candidates) {
        const parsed = parseUploadRows(candidate.text);
        if (parsed.rows.length === 0) {
          continue;
        }

        const holdings = parseRowsToHoldings(parsed.rows, source);
        if (holdings.length > bestHoldings.length) {
          bestHoldings = holdings;
          bestWarning = getUserVisibleCsvWarning(parsed.errors);
        }
      }

      if (bestHoldings.length === 0) {
        setBanner({
          type: "error",
          message: "No valid holdings were found. Check that your file includes value/price/units columns and uses supported file formats.",
        });
        event.target.value = "";
        return;
      }

      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source, holdings: bestHoldings }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to save imported report."));
      }

      const persistedState = (await response.json()) as PortfolioState;
      setState(persistedState);

      setBanner({
        type: "success",
        message: `${bestHoldings.length} ${source.toUpperCase()} holdings loaded from ${file.name} and saved to SQLite.${bestWarning}`,
      });
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Upload failed.";
      const normalizedMessage = rawMessage.toLowerCase().includes("unsupported file type")
        ? INVALID_UPLOAD_FORMAT_MESSAGE
        : rawMessage;
      setBanner({ type: "error", message: normalizedMessage });
    } finally {
      event.target.value = "";
      setWorking(false);
    }
  };

  const clearData = async () => {
    if (demoMode) {
      setState(DEMO_PORTFOLIO_STATE);
      setHistoricalRiskEstimate(buildDemoHistoricalRiskEstimate(DEMO_PORTFOLIO_STATE, riskWindow));
      setDipAlerts(DEMO_DIP_ALERTS);
      setAvailableDipTickers(DEMO_AVAILABLE_TICKERS);
      setDipAlertMax(10);
      setDipAlertTicker(DEMO_AVAILABLE_TICKERS[0]);
      setHoldingsAiQuestion(HOLDINGS_AI_DEFAULT_PROMPT);
      setHoldingsAiError("");
      setHoldingsAiResult(null);
      setBanner({ type: "info", message: "Demo workspace reset to the sample portfolio." });
      return;
    }

    if (!window.confirm("Delete all imported holdings, snapshots, and dip alerts? Your sign-in email/password stays active.")) {
      return;
    }

    setWorking(true);

    try {
      const response = await fetch("/api/portfolio", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to clear stored portfolio data."));
      }

      const cleared = (await response.json()) as PortfolioState;
      setState(cleared);
      setDipAlerts([]);
      setAvailableDipTickers([]);
      setDipAlertTicker("");
      setBanner({ type: "info", message: "Portfolio and alert data cleared. Login credentials were kept." });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Failed to clear data." });
    } finally {
      setWorking(false);
    }
  };

  const startCheckout = useCallback(async (plan: CheckoutPlan, guestEmail?: string) => {
    if (demoMode) {
      window.location.assign("/classic#access");
      return;
    }

    if (plan === "free") {
      window.location.assign("/dashboard?mode=account");
      return;
    }

    let checkoutEmail = sessionUser?.email || "";
    const planLabel = plan === "pro" ? "Pro" : "Plus";

    if (!checkoutEmail) {
      const fromGuestEmail = (guestEmail || "").trim().toLowerCase();
      const fromAuthEmail = authEmail.trim().toLowerCase();

      checkoutEmail = fromGuestEmail || fromAuthEmail;

      if (!checkoutEmail) {
        const promptedEmail = window.prompt(`Enter your email to start ${planLabel} checkout:`, "");
        if (!promptedEmail) {
          return;
        }
        checkoutEmail = promptedEmail.trim().toLowerCase();
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkoutEmail)) {
        setBanner({ type: "error", message: "Enter a valid email address to start checkout." });
        return;
      }
    }

    setCheckoutWorking(true);

    try {
      const requestInit: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: !sessionUser ? checkoutEmail : undefined,
          plan,
        }),
      };

      const response = await fetch("/api/billing/checkout", requestInit);
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Unable to start Stripe checkout."));
      }

      const payload = (await response.json()) as BillingCheckoutResponse;
      if (!payload.url) {
        throw new Error("Stripe checkout URL was missing.");
      }

      window.location.assign(payload.url);
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Unable to start Stripe checkout." });
      setCheckoutWorking(false);
    }
  }, [authEmail, demoMode, sessionUser]);

  const startPlusCheckout = async (guestEmail?: string) => {
    await startCheckout("plus", guestEmail);
  };

  const startProCheckout = async (guestEmail?: string) => {
    await startCheckout("pro", guestEmail);
  };

  const openCreateAccountForPlan = useCallback((plan: CheckoutPlan) => {
    if (!demoMode && sessionUser) {
      void startCheckout(plan);
      return;
    }

    setAuthMode("register");
    setRegisterCheckoutPlan(plan);
    setAuthError("");

    if (typeof window === "undefined") {
      return;
    }

    const accessSection = document.getElementById("access");
    if (accessSection) {
      accessSection.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState({}, "", "#access");
      return;
    }

    window.location.assign("/classic#access");
  }, [demoMode, sessionUser, startCheckout]);

  const openBillingPortal = async () => {
    if (demoMode) {
      window.location.assign("/classic#pricing");
      return;
    }

    setBillingPortalWorking(true);

    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Unable to open billing settings."));
      }

      const payload = (await response.json()) as BillingPortalResponse;
      if (!payload.url) {
        throw new Error("Billing portal URL was missing.");
      }

      window.location.assign(payload.url);
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Unable to open billing settings." });
      setBillingPortalWorking(false);
      return;
    }

    setBillingPortalWorking(false);
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (authMode === "register" && !authAcceptsTerms) {
      setAuthError("You must agree to the Terms of Service and Privacy Policy to create an account.");
      return;
    }

    setAuthWorking(true);
    setAuthError("");

    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          displayName: authDisplayName,
          acceptsTerms: authMode === "register" ? authAcceptsTerms : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Authentication failed."));
      }

      const payload = (await response.json()) as AuthSessionPayload;

      if (authMode === "register" && payload.verificationRequired && !payload.authenticated) {
        setAuthMode("login");
        setAuthPassword("");
        setAuthAcceptsTerms(false);
        setAuthError("");
        setBanner({ type: "info", message: payload.message || "Account created. Check your email to verify before signing in, then choose your plan from pricing or settings." });
        return;
      }

      if (!payload.authenticated || !payload.user) {
        throw new Error("Authentication failed.");
      }

      setSessionUser(normalizeSessionUser(payload.user));
      setAuthPassword("");
      setAuthAcceptsTerms(false);
      setAuthError("");
      setBanner({ type: "success", message: "Signed in as " + payload.user.displayName + "." });

      const portfolioResponse = await fetch("/api/portfolio", { cache: "no-store" });
      if (portfolioResponse.ok) {
        const payloadState = (await portfolioResponse.json()) as PortfolioState;
        setState(payloadState);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthWorking(false);
    }
  };

  const requestPasswordReset = async () => {
    const emailInput = window.prompt("Enter your account email for password reset:", authEmail);

    if (!emailInput) {
      return;
    }

    setAuthWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/password/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: emailInput }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Could not start password reset."));
      }

      const payload = (await response.json()) as PasswordResetRequestResponse;
      setAuthEmail(emailInput);

      const message = payload.message || "If an account exists, reset instructions were generated.";
      setBanner({ type: "info", message });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not start password reset.");
    } finally {
      setAuthWorking(false);
    }
  };

  const resendVerificationEmail = async () => {
    const emailInput = authEmail.trim();

    if (!emailInput) {
      setAuthError("Enter your email, then click Resend Verification.");
      return;
    }

    setAuthWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: emailInput }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Could not resend verification email."));
      }

      const payload = (await response.json()) as VerificationResendResponse;
      setBanner({ type: "info", message: payload.message || "If the account exists, a verification email was sent." });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not resend verification email.");
    } finally {
      setAuthWorking(false);
    }
  };

  const completePasswordReset = async () => {
    const token = window.prompt("Paste your reset token:", "");
    if (!token) {
      return;
    }

    const newPassword = window.prompt("Enter new password (min 8 chars):", "");
    if (!newPassword) {
      return;
    }

    setAuthWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Password reset failed."));
      }

      setAuthMode("login");
      setAuthPassword("");
      setBanner({ type: "success", message: "Password reset complete. Please sign in with your new password." });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Password reset failed.");
    } finally {
      setAuthWorking(false);
    }
  };

  const logout = async () => {
    if (demoMode) {
      window.location.assign("/classic");
      return;
    }

    setWorking(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSessionUser(null);
      setState(EMPTY_STATE);
      setHistoricalRiskEstimate(null);
      setBanner(null);
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="spectre-landing spectre-landing--sleek">
        <main className="spectre-main">
          <section className="spectre-section">
            <div className="spectre-wrap">
              <p className="spectre-section-label">Loading</p>
              <h2 className="spectre-section-title">Loading your SPECTRE workspace...</h2>
              <p className="spectre-section-sub">Please wait while we confirm your account session and portfolio state.</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!sessionUser) {
    const landingTicker = [
      { symbol: "BHP", price: "45.82", delta: "+1.2%", tone: "up" },
      { symbol: "CBA", price: "131.44", delta: "-0.4%", tone: "down" },
      { symbol: "CSL", price: "288.10", delta: "+0.7%", tone: "up" },
      { symbol: "WES", price: "77.30", delta: "-1.1%", tone: "down" },
      { symbol: "ANZ", price: "29.55", delta: "+0.3%", tone: "up" },
      { symbol: "NAB", price: "38.20", delta: "+0.5%", tone: "up" },
      { symbol: "FMG", price: "18.44", delta: "-2.1%", tone: "down" },
      { symbol: "RIO", price: "112.60", delta: "+0.9%", tone: "up" },
      { symbol: "WBC", price: "32.10", delta: "-0.2%", tone: "down" },
      { symbol: "MQG", price: "218.75", delta: "+1.4%", tone: "up" },
    ];

    return (
      <div className="spectre-landing spectre-landing--sleek">
        <header className="spectre-nav">
          <div className="spectre-wrap spectre-nav-inner">
            <a href="#top" className="spectre-nav-logo">SPECTRE</a>
            <nav className="spectre-nav-links">
              <a href="#features">Capabilities</a>
              <a href="#workflow">Workflow</a>
              <a href="#pro-ai">Pro AI</a>
              <a href="#insights">Preview</a>
              <a href="/dashboard?demo=1" className="spectre-nav-demo-link">Live Demo</a>
              <a href="#safety">Data Safety</a>
              <a href="#pricing">Pricing</a>
            </nav>
            <div className="spectre-nav-utility">
              <a href="#access" className="spectre-nav-cta">Sign In</a>
            </div>
            <button
              type="button"
              className={"spectre-nav-hamburger" + (landingMenuOpen ? " open" : "")}
              onClick={() => setLandingMenuOpen((current) => !current)}
              aria-label="Toggle menu"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          <div className={"spectre-nav-mobile" + (landingMenuOpen ? " open" : "")}>
            <a href="/dashboard?demo=1" className="spectre-nav-demo-link" onClick={() => setLandingMenuOpen(false)}>
              Live Demo
            </a>
            {["features", "workflow", "pro-ai", "insights", "safety", "pricing", "access"].map((section) => (
              <a key={section} href={`#${section}`} onClick={() => setLandingMenuOpen(false)}>
                {section === "insights"
                  ? "Preview"
                  : section === "pro-ai"
                    ? "Pro AI"
                    : section === "safety"
                      ? "Data Safety"
                      : section === "access"
                        ? "Sign In"
                        : section.charAt(0).toUpperCase() + section.slice(1)}
              </a>
            ))}
          </div>
        </header>

        <section id="top" className="spectre-hero">
          <div className="spectre-hero-gridlines" aria-hidden="true" />
          <div className="spectre-hero-glow" aria-hidden="true" />
          <div className="spectre-wrap spectre-hero-layout">
            <div className="spectre-hero-left">
              <p className="spectre-hero-eye">SPECTRE OPS</p>
              <h1 className="spectre-hero-title">See your entire investment portfolio risk in <span>one place.</span></h1>
              <p className="spectre-hero-system">System for Portfolio Exposure, Correlation, Threat &amp; Risk Evaluation</p>
              <p className="spectre-hero-desc">
                Import exports from super funds, brokers, savings, tax reports, crypto, index funds, mutual funds, and bullion.
                SPECTRE consolidates every holding into one portfolio view with concentration, VaR, drawdown, and Pro AI analysis.
              </p>
              <div className="spectre-hero-actions">
                <a href="#access" className="spectre-btn spectre-btn-primary">Start For $2.99 / Month</a>
                <a href="/classic?demo=1" className="spectre-btn spectre-btn-demo">Try Live Demo Portfolio</a>
              </div>
              <div className="spectre-hero-panels">
                <article>
                  <h3>3-Step Workflow</h3>
                </article>
                <article>
                  <h3>SPECTRE Framework</h3>
                </article>
                <article>
                  <h3>Security Controls</h3>
                </article>
                <article>
                  <h3>Pro AI + Savings/Tax Uploads</h3>
                </article>
              </div>
              <div className="spectre-hero-proof">
                <article>
                  <strong>72<span>/100</span></strong>
                  <span>Risk Score</span>
                </article>
                <article>
                  <strong>42%</strong>
                  <span>Top-3 Concentration</span>
                </article>
                <article>
                  <strong>-8.4%</strong>
                  <span>VaR 95 Daily</span>
                </article>
                <article>
                  <strong>5 min</strong>
                  <span>ASX Refresh</span>
                </article>
              </div>
            </div>
            <div className="spectre-hero-right">
              <aside className="spectre-hero-dashboard">
                <p className="spectre-dash-title">Portfolio Snapshot</p>
                <div className="spectre-snapshot-grid">
                  <article className="spectre-snapshot-card">
                    <p>Total Value</p>
                    <strong>$4K</strong>
                  </article>
                  <article className="spectre-snapshot-card">
                    <p>Unrealised P/L</p>
                    <strong className="accent">+$559</strong>
                  </article>
                  <article className="spectre-snapshot-card">
                    <p>Today&apos;s Change</p>
                    <strong>+$6</strong>
                  </article>
                  <article className="spectre-snapshot-card">
                    <p>1-Day VaR 95%</p>
                    <strong className="accent">-0.7%</strong>
                  </article>
                </div>
                <div className="spectre-snapshot-risk">
                  <div className="spectre-snapshot-risk-top">
                    <span>Risk Score</span>
                    <strong>8 / 100</strong>
                  </div>
                  <div className="spectre-snapshot-track">
                    <span className="spectre-snapshot-fill" style={{ width: "8%" }} />
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <div className="spectre-ticker">
          <div className="spectre-ticker-track">
            {landingTicker.concat(landingTicker).map((item, index) => (
              <span key={item.symbol + "-" + index} className="spectre-ticker-item">
                <strong>{item.symbol}</strong>
                {item.price}
                <em className={item.tone === "up" ? "up" : "down"}>{item.delta}</em>
              </span>
            ))}
          </div>
        </div>

        <main className="spectre-main">
          <section id="features" className="spectre-section spectre-alt">
            <div className="spectre-wrap">
              <p className="spectre-section-label orange">SPECTRE OPS</p>
              <h2 className="spectre-section-title">From CSV to <span>risk clarity.</span></h2>
              <p className="spectre-section-sub">Upload files, normalize holdings, then review risk score and exposure metrics. Purpose-built for Australian investors managing multi-source portfolios.</p>

              <div className="spectre-ops-grid">
                <article><p>01</p><h3>Import</h3><span>Import super, savings, tax report, ASX, crypto, index, mutual fund, and bullion exports.</span></article>
                <article><p>02</p><h3>Normalize</h3><span>SPECTRE normalizes holdings by account, source, and sector in one workspace.</span></article>
                <article><p>03</p><h3>Review</h3><span>Review risk score, concentration, VaR, drawdown, and scenario stress outcomes.</span></article>
              </div>

              <div className="spectre-callouts">
                <article>
                  <p>Before: &quot;Looks diversified&quot;</p>
                  <h3>Many line items</h3>
                  <span>Investor sees many line items across multiple statements with no unified risk view.</span>
                </article>
                <article className="after">
                  <p>After: Top-3 = 42% Exposure</p>
                  <h3>Hidden concentration</h3>
                  <span>SPECTRE surfaces hidden concentration and downside sensitivity in a single risk score.</span>
                </article>
              </div>

              <div className="spectre-feature-grid">
                <article><h3>ASX + Crypto + Super Imports</h3><p>Ingest brokerage, crypto wallet, superannuation, savings, tax report, index, fund, and bullion exports in one workflow.</p></article>
                <article><h3>Risk Score + Dashboard</h3><p>Track one clear risk score alongside VaR95, drawdown, volatility, and concentration.</p></article>
                <article><h3>Session Movers</h3><p>Surface ASX top movers and trigger dip alert emails using refreshed market prices.</p></article>
                <article><h3>Snapshot Audit Trail</h3><p>Review portfolio trend history and data quality signals over time.</p></article>
              </div>
            </div>
          </section>

          <section id="insights" className="spectre-section">
            <div className="spectre-wrap">
              <p className="spectre-section-label">Feature Preview</p>
              <h2 className="spectre-section-title">Concrete dashboard visuals, not abstract promises.</h2>
              <p className="spectre-section-sub">These demo values show the exact dashboard style. Your real data loads from your own imported portfolio exports.</p>
              <div className="spectre-db-frame">
                <div className="spectre-db-grid">
                  <article className="spectre-db-card">
                    <p>Example Portfolio Risk Score</p>
                    <h3>{LANDING_SAMPLE_RISK_SCORE}<span>/100</span></h3>
                    <span>Moderate risk profile based on concentration, VaR, drawdown, volatility, and data quality confidence.</span>
                  </article>

                  <article className="spectre-db-card">
                    <p>Example Portfolio Snapshot Trend</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={LANDING_PREVIEW_SERIES}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2b2438" />
                        <XAxis dataKey="month" stroke="#8f88a9" />
                        <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} stroke="#8f88a9" />
                        <Tooltip formatter={tooltipFormatter} contentStyle={LANDING_TOOLTIP_CONTENT_STYLE} labelStyle={LANDING_TOOLTIP_LABEL_STYLE} itemStyle={LANDING_TOOLTIP_ITEM_STYLE} />
                        <Line type="monotone" dataKey="portfolio" stroke="#ff4d1a" strokeWidth={2.4} dot={false} />
                        <Line type="monotone" dataKey="buffer" stroke="#9085a8" strokeWidth={1.6} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </article>

                  <article className="spectre-db-card">
                    <p>Example Risk Signal Levels</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={LANDING_METRIC_SERIES}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2b2438" />
                        <XAxis dataKey="metric" stroke="#8f88a9" />
                        <YAxis tickFormatter={(value) => `${value}%`} stroke="#8f88a9" />
                        <Tooltip
                          formatter={(value) => {
                            const numeric = Number(Array.isArray(value) ? value[0] : value);
                            return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : String(value ?? "");
                          }}
                          contentStyle={LANDING_TOOLTIP_CONTENT_STYLE}
                          labelStyle={LANDING_TOOLTIP_LABEL_STYLE}
                          itemStyle={LANDING_TOOLTIP_ITEM_STYLE}
                        />
                        <Bar dataKey="value" fill="#ff4d1a" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </article>

                  <article className="spectre-db-card">
                    <p>Example Allocation Breakdown</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie data={LANDING_ALLOCATION_SERIES} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={86}>
                          {LANDING_ALLOCATION_SERIES.map((segment, index) => (
                            <Cell key={segment.name} fill={LANDING_ALLOCATION_COLORS[index % LANDING_ALLOCATION_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => {
                            const numeric = Number(Array.isArray(value) ? value[0] : value);
                            return Number.isFinite(numeric) ? `${numeric.toFixed(0)}%` : String(value ?? "");
                          }}
                          contentStyle={LANDING_TOOLTIP_CONTENT_STYLE}
                          labelStyle={LANDING_TOOLTIP_LABEL_STYLE}
                          itemStyle={LANDING_TOOLTIP_ITEM_STYLE}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </article>
                </div>
              </div>
            </div>
          </section>

          <section id="workflow" className="spectre-section spectre-alt">
            <div className="spectre-wrap">
              <p className="spectre-section-label">How It Works</p>
              <h2 className="spectre-section-title">One clear 3-step path from files to risk decisions.</h2>
              <p className="spectre-section-sub">Start with existing statements, centralize exposure in SPECTRE, then monitor risk signals from one private dashboard.</p>
              <div className="spectre-steps-grid">
                <article><p>01</p><h3>Import Reports</h3><span>Upload super, savings, tax report, ASX, crypto, index, mutual fund, and bullion files directly into SPECTRE.</span></article>
                <article><p>02</p><h3>Normalize Exposure</h3><span>Aggregate positions by source, account, sector, and instrument in one structure.</span></article>
                <article><p>03</p><h3>Act On Risk Signals</h3><span>Use risk score, drawdown, VaR, concentration metrics, and dip alert emails to monitor risk posture.</span></article>
              </div>
            </div>
          </section>

          <section id="pro-ai" className="spectre-section">
            <div className="spectre-wrap">
              <p className="spectre-section-label orange">Pro AI</p>
              <h2 className="spectre-section-title">Ask AI holdings analysis in a dedicated box.</h2>
              <p className="spectre-section-sub">This feature is premium only. Upgrade to Pro to ask questions about what may be influencing the value of your current holdings.</p>
              <div className="spectre-pro-ai-grid">
                <article className="spectre-plan featured spectre-pro-ai-box">
                  <p className="badge">Premium Only</p>
                  <p className="tier">Pro AI Console</p>
                  <h3>Included in Pro</h3>
                  <p className="sub">Not available on Starter</p>
                  <p className="spectre-pro-ai-copy">
                    Ask direct questions about your holdings and get a plain-English read on what is driving changes in value, momentum, and risk posture.
                  </p>
                  <ul>
                    <li>Ask AI about drivers behind your current holdings</li>
                    <li>Get plain-English analysis of momentum and risk signals</li>
                    <li>See AI reasoning alongside your portfolio context</li>
                    <li>Includes signal context like trend, ROC, breakout, and pattern tags</li>
                    <li>Highlights both upside drivers and downside pressure in one response</li>
                    <li>Built into your private workspace with your imported portfolio data</li>
                  </ul>
                  <div className="spectre-pro-ai-facts">
                    <article>
                      <h4>What AI Reads</h4>
                      <p>Holdings, weights, live price context, technical signals, and portfolio concentration.</p>
                    </article>
                    <article>
                      <h4>What You Get</h4>
                      <p>Top drivers, confidence-aware explanation, and practical follow-up points to review.</p>
                    </article>
                    <article>
                      <h4>Access</h4>
                      <p>Pro only. Starter users can still view core risk metrics and upgrade anytime.</p>
                    </article>
                  </div>
                  <a href="#pricing" className="spectre-btn spectre-btn-pro">See Pro Plan</a>
                </article>
              </div>
            </div>
          </section>

          <section id="safety" className="spectre-section">
            <div className="spectre-wrap">
              <p className="spectre-section-label orange">Data Safety</p>
              <h2 className="spectre-section-title">Plain-English security and privacy controls.</h2>
              <p className="spectre-section-sub">These safeguards reflect controls active in the current release.</p>
              <div className="spectre-safety-grid">
                <article><h3>Privacy Promise</h3><p><strong>We do not sell your data.</strong> Portfolio uploads are used only to generate your analytics workspace. Read our <a href="/privacy">Privacy Policy</a> for the full details.</p></article>
                <article><h3>Data Control and Deletion</h3><p>You can clear imported holdings, snapshots, and dip alerts anytime from the dashboard using Clear Data. This keeps your account login (email + password hash) so you can still sign in. Cancelling a paid plan removes paid access; account deletion is handled separately so your data is not lost by surprise.</p></article>
                <article><h3>Account and Payment Security</h3><p>Email verification, scrypt password hashing, secure cookies, and Stripe-hosted checkout are enabled in production.</p></article>
                <article><h3>Hosting and Hardening</h3><p>Production runs over HTTPS with CSP/HSTS/anti-framing headers, plus encrypted backups and restore checks.</p></article>
              </div>
              <p className="spectre-safety-note">No platform can guarantee zero risk. Use strong passwords, review our Terms of Service, and keep deployment secrets protected.</p>
            </div>
          </section>

          <section id="pricing" className="spectre-section spectre-alt">
            <div className="spectre-wrap">
              <p className="spectre-section-label">Pricing</p>
              <h2 className="spectre-section-title">Create your account first, then activate the plan that fits.</h2>
              <p className="spectre-section-sub">Create your workspace, verify your email, then upgrade to Plus or Pro anytime. Free plan available with no payment needed.</p>
              <div className="spectre-pricing-grid">
                <article className="spectre-plan">
                  <p className="tier">Free</p>
                  <h3>$0<span>/month</span></h3>
                  <p className="sub">No card required</p>
                  <ul>
                    <li>One private investor workspace</li>
                    <li>CSV/XLSX import for super, savings, ASX, crypto, index, funds, and bullion</li>
                    <li>Basic risk score and dashboard charts</li>
                    <li>Email verification and password reset</li>
                  </ul>
                  <button type="button" className="spectre-btn spectre-btn-primary" onClick={() => openCreateAccountForPlan("free")} disabled={checkoutWorking}>
                    {checkoutWorking ? "Redirecting..." : sessionUser ? "You&apos;re on Free" : "Create Free Account"}
                  </button>
                </article>

                <article className="spectre-plan">
                  <p className="tier">Plus</p>
                  <h3>$2.99<span>/month</span></h3>
                  <p className="sub">Live now</p>
                  <ul>
                    <li>Everything in Free</li>
                    <li>Market research terminal for ASX, macro, and sector context</li>
                    <li>Snapshots, dip alerts, and email notifications</li>
                  </ul>
                  <button type="button" className="spectre-btn spectre-btn-primary" onClick={() => openCreateAccountForPlan("plus")} disabled={checkoutWorking}>
                    {checkoutWorking ? "Redirecting..." : sessionUser ? "Start Plus" : "Create Account for Plus"}
                  </button>
                </article>

                <article className="spectre-plan featured">
                  <p className="badge">Most Popular</p>
                  <p className="tier">Pro</p>
                  <h3>$15<span>/month</span></h3>
                  <p className="sub">Advanced quant analytics</p>
                  <ul>
                    <li>Everything in Starter</li>
                    <li>Expected Shortfall (ES 95) tail risk</li>
                    <li>Beta and tracking error vs ASX 200</li>
                    <li>Date-aligned benchmark analytics</li>
                    <li>Ask AI holdings analysis for current portfolio drivers</li>
                    <li>Advanced reporting and team workflows</li>
                  </ul>
                  <button type="button" className="spectre-btn spectre-btn-pro" onClick={() => openCreateAccountForPlan("pro")} disabled={checkoutWorking}>
                    {checkoutWorking ? "Redirecting..." : sessionUser ? "Start Pro" : "Create Account for Pro"}
                  </button>
                  <span className="spectre-plan-note">After you create your account, you can activate Starter or Pro and manage billing from settings.</span>
                </article>
              </div>
            </div>
          </section>

          <section id="access" className="spectre-section">
            <div className="spectre-wrap spectre-access-layout">
              <article className="spectre-access-copy">
                <p className="spectre-section-label">Account Access</p>
                <h2 className="spectre-section-title">Create your workspace, then activate a plan when you need it.</h2>
                <p className="spectre-section-sub">Sign in to continue from your last snapshot, or create your account first and activate a plan when you are ready.</p>
                <div className="spectre-access-points">
                  <p>System for Portfolio Exposure, Correlation, Threat &amp; Risk Evaluation.</p>
                  <p>Designed for retail investors who track portfolios.</p>
                  <p>Single interface for holdings, exposure, and risk posture.</p>
                </div>
              </article>

              <article className="spectre-signin-box">
                <h2 className="spectre-signin-heading">{authMode === "register" ? "Create Account" : "Sign In"}</h2>
                <p className="spectre-signin-sub">Create your account or sign in to your private SPECTRE workspace</p>

                {banner ? <div className={"banner " + banner.type}>{banner.message}</div> : null}
                {authError ? <div className="banner error">{authError}</div> : null}

                <form onSubmit={submitAuth} className="auth-form-grid">
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      required
                      autoComplete="email"
                    />
                  </label>

                  <label>
                    <span>Password</span>
                    <div className="spectre-password-row">
                      <input
                        type={showAuthPassword ? "text" : "password"}
                        placeholder="Minimum 8 characters"
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        required
                        minLength={8}
                        autoComplete={authMode === "register" ? "new-password" : "current-password"}
                      />
                      <button
                        type="button"
                        className="spectre-password-toggle"
                        onClick={() => setShowAuthPassword((current) => !current)}
                        aria-label={showAuthPassword ? "Hide password" : "Show password"}
                      >
                        {showAuthPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </label>

                  {authMode === "register" ? (
                    <>
                      <label>
                        <span>Display Name</span>
                        <input
                          type="text"
                          placeholder="How your account appears"
                          value={authDisplayName}
                          onChange={(event) => setAuthDisplayName(event.target.value)}
                          autoComplete="name"
                        />
                      </label>

                      <label className="auth-terms">
                        <input
                          type="checkbox"
                          checked={authAcceptsTerms}
                          onChange={(event) => setAuthAcceptsTerms(event.target.checked)}
                          required
                        />
                        <span>
                          I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> and understand SPECTRE provides informational analytics only, not financial advice.
                        </span>
                      </label>

                      <fieldset className="spectre-register-plan-picker">
                        <legend>Preferred Plan</legend>
                        <label>
                          <input
                            type="radio"
                            name="register-checkout-plan"
                            value="free"
                            checked={registerCheckoutPlan === "free"}
                            onChange={() => setRegisterCheckoutPlan("free")}
                          />
                          <span>Free ($0)</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="register-checkout-plan"
                            value="plus"
                            checked={registerCheckoutPlan === "plus"}
                            onChange={() => setRegisterCheckoutPlan("plus")}
                          />
                          <span>Plus ($2.99/mo)</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="register-checkout-plan"
                            value="pro"
                            checked={registerCheckoutPlan === "pro"}
                            onChange={() => setRegisterCheckoutPlan("pro")}
                          />
                          <span>Pro ($9.99/mo)</span>
                        </label>
                      </fieldset>
                    </>
                  ) : null}

                  <button type="submit" className="spectre-signin-btn" disabled={authWorking}>
                    {authWorking ? "Please wait..." : authMode === "register" ? "Create Account" : "Sign In"}
                  </button>
                </form>

                <div className="spectre-auth-links">
                  <button
                    type="button"
                    className="template-btn"
                    onClick={() => {
                      setAuthMode((current) => (current === "register" ? "login" : "register"));
                      setAuthAcceptsTerms(false);
                      setShowAuthPassword(false);
                      setAuthError("");
                    }}
                    disabled={authWorking}
                  >
                    {authMode === "register" ? "Already Have an Account?" : "Create New Account"}
                  </button>
                  <button type="button" className="template-btn" onClick={() => void resendVerificationEmail()} disabled={authWorking}>Resend Verification</button>
                  <button type="button" className="template-btn" onClick={() => void requestPasswordReset()} disabled={authWorking}>Forgot Password</button>
                  <button type="button" className="template-btn" onClick={() => void completePasswordReset()} disabled={authWorking}>Reset With Token</button>
                </div>

                <div className="spectre-signin-divider" />

                <div className="spectre-checkout-actions">
                  <button type="button" className="spectre-checkout-btn" onClick={() => openCreateAccountForPlan("pro")} disabled={authWorking || checkoutWorking}>
                    <span>Create account for Pro</span>
                    <strong>$9.99/mo</strong>
                  </button>
                  <button type="button" className="spectre-checkout-btn" onClick={() => openCreateAccountForPlan("plus")} disabled={authWorking || checkoutWorking}>
                    <span>Create account for Plus</span>
                    <strong>$2.99/mo</strong>
                  </button>
                </div>
              </article>
            </div>
          </section>
        </main>

        <footer className="spectre-footer">
          <div className="spectre-wrap spectre-footer-inner">
            <p className="spectre-footer-logo">SPECTRE</p>
            <p className="spectre-footer-copy">
              Disclaimer: SPECTRE provides informational analytics only. It is not financial, investment, tax, or legal advice, and no result is guaranteed to be complete, current, or accurate.
              Use at your own risk. Always verify pricing, corporate actions, and holdings with official statements before making decisions. If this app is deployed online, database access and backups are your responsibility. See Terms of Service and Privacy Policy. Copyright 2026 SPECTRE.
            </p>
            <p className="spectre-footer-contact">Contact us: <a href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a></p>
          </div>
        </footer>
      </div>
    );
  }
  return (
    <div className="shell spectre-app">
      <nav className="spectre-app-nav">
        <div className="spectre-app-nav-inner">
          <button type="button" className="spectre-app-nav-logo" onClick={() => setActivePage("quant")}>SPECTRE</button>
          <div className="spectre-app-nav-tabs">
            <button type="button" className={`nav-tab${activePage === "quant" ? " nav-tab-active" : ""}`} onClick={() => setActivePage("quant")}>Quant</button>
            <button type="button" className={`nav-tab${activePage === "ai" ? " nav-tab-active" : ""}`} onClick={() => setActivePage("ai")}>AI</button>
            <a href="/research" className="nav-tab">Research</a>
            <button type="button" className={`nav-tab${activePage === "import" ? " nav-tab-active" : ""}`} onClick={() => setActivePage("import")}>Import</button>
          </div>
          <div className="nav-right">
            <button
              type="button"
              className={`nav-settings-btn${activePage === "settings" ? " nav-settings-active" : ""}`}
              onClick={() => setActivePage(activePage === "settings" ? "quant" : "settings")}
              aria-label="Settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <span className="nav-user">{demoMode ? "Demo workspace" : sessionUser.email}</span>
            <button type="button" className="nav-signout" onClick={logout} disabled={working || refreshingPrices || checkoutWorking || billingPortalWorking}>
              {demoMode ? "Exit Demo" : "Sign Out"}
            </button>
          </div>
        </div>
      </nav>
      <div className="ticker">
        <div className="ticker-track">
          <span className="ti"><span className="ti-sym">BHP</span>45.82<span className="ti-up">+1.2%</span></span>
          <span className="ti"><span className="ti-sym">CBA</span>131.44<span className="ti-dn">-0.4%</span></span>
          <span className="ti"><span className="ti-sym">CSL</span>288.10<span className="ti-up">+0.7%</span></span>
          <span className="ti"><span className="ti-sym">WES</span>77.30<span className="ti-dn">-1.1%</span></span>
          <span className="ti"><span className="ti-sym">ANZ</span>29.55<span className="ti-up">+0.3%</span></span>
          <span className="ti"><span className="ti-sym">NAB</span>38.20<span className="ti-up">+0.5%</span></span>
          <span className="ti"><span className="ti-sym">FMG</span>18.44<span className="ti-dn">-2.1%</span></span>
          <span className="ti"><span className="ti-sym">RIO</span>112.60<span className="ti-up">+0.9%</span></span>
          <span className="ti"><span className="ti-sym">BTC</span>84,200<span className="ti-dn">-1.8%</span></span>
          <span className="ti"><span className="ti-sym">ETH</span>3,140<span className="ti-up">+0.6%</span></span>
          <span className="ti"><span className="ti-sym">MQG</span>218.75<span className="ti-up">+1.4%</span></span>
          <span className="ti"><span className="ti-sym">WBC</span>32.10<span className="ti-dn">-0.2%</span></span>
          <span className="ti"><span className="ti-sym">BHP</span>45.82<span className="ti-up">+1.2%</span></span>
          <span className="ti"><span className="ti-sym">CBA</span>131.44<span className="ti-dn">-0.4%</span></span>
          <span className="ti"><span className="ti-sym">CSL</span>288.10<span className="ti-up">+0.7%</span></span>
          <span className="ti"><span className="ti-sym">WES</span>77.30<span className="ti-dn">-1.1%</span></span>
          <span className="ti"><span className="ti-sym">ANZ</span>29.55<span className="ti-up">+0.3%</span></span>
          <span className="ti"><span className="ti-sym">NAB</span>38.20<span className="ti-up">+0.5%</span></span>
          <span className="ti"><span className="ti-sym">FMG</span>18.44<span className="ti-dn">-2.1%</span></span>
          <span className="ti"><span className="ti-sym">RIO</span>112.60<span className="ti-up">+0.9%</span></span>
          <span className="ti"><span className="ti-sym">BTC</span>84,200<span className="ti-dn">-1.8%</span></span>
          <span className="ti"><span className="ti-sym">ETH</span>3,140<span className="ti-up">+0.6%</span></span>
          <span className="ti"><span className="ti-sym">MQG</span>218.75<span className="ti-up">+1.4%</span></span>
          <span className="ti"><span className="ti-sym">WBC</span>32.10<span className="ti-dn">-0.2%</span></span>
        </div>
      </div>
      <header id="dashboard-top" className="hero" style={{display: activePage === "quant" ? undefined : "none"}}>
        <div className="hero-copy">
          <h1><Image src="/spectre-wordmark-plain.svg" alt="SPECTRE" width={620} height={148} className="hero-wordmark-image" priority /></h1>
          <p className="hero-tagline">System for Portfolio Exposure, Correlation, Threat & Risk Evaluation</p>
          <p className="hero-description">Upload super, savings, tax report, ASX, crypto, index, mutual fund, and ABC Bullion reports to track exposure, concentration, and downside risk in one private workspace. Pro also adds Ask AI holdings analysis.</p>
        </div>
        <div className="meta">
          <span className="meta-item">Account: {sessionUser.displayName} ({demoMode ? "sample holdings" : sessionUser.email})</span>
          <span className="meta-item">
            Plan:
            {" "}
            <span className={`plan-chip ${sessionUser.proEnabled ? "pro" : sessionUser.planTier === "none" ? "starter" : sessionUser.planTier}`}>
              {demoMode ? "PRO DEMO" : sessionUser.proEnabled ? "PRO ACTIVE" : sessionUser.planTier === "none" ? "FREE" : sessionUser.planTier.toUpperCase()}
            </span>
          </span>
          <span className="meta-item">Holdings: {state.holdings.length}</span>
          <span className="meta-item">Latest report: {latestReportDate || "N/A"}</span>
          <span className="meta-item">Last saved: {state.updatedAt ? new Date(state.updatedAt).toLocaleString("en-AU") : "N/A"}</span>
          <span className="meta-item">Live prices: {demoMode ? "Demo snapshot" : state.lastPriceRefreshAt ? new Date(state.lastPriceRefreshAt).toLocaleString("en-AU") : "Not refreshed yet"}</span>
          <div className="meta-actions">
            {demoMode ? (
              <>
                <button type="button" onClick={() => window.location.assign("/classic#access")} className="refresh-btn">
                  Create Account
                </button>
                <button type="button" onClick={clearData} className="clear-btn">
                  Reset Demo
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void refreshPrices(true)} className="refresh-btn" disabled={loading || working || refreshingPrices}>
                  {refreshingPrices ? "Refreshing..." : "Refresh Prices"}
                </button>
                <button type="button" onClick={clearData} className="clear-btn" disabled={working || refreshingPrices || checkoutWorking}>
                  {working ? "Working..." : "Clear Data"}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {demoMode ? (
        <div className="banner info">
          Demo mode uses seeded sample holdings and snapshot history. Create an account to upload your own files, refresh live prices, and save portfolio changes.
        </div>
      ) : null}
      {banner ? <div className={`banner ${banner.type}`}>{banner.message}</div> : null}

      {!demoMode && sessionUser.planTier === "none" && !sessionUser.proEnabled ? (
        <div className="upgrade-cta upgrade-cta-plus">
          <div className="upgrade-cta-content">
            <span className="upgrade-cta-badge">Free Plan</span>
            <strong className="upgrade-cta-title">Unlock Plus — $2.99/mo</strong>
            <span className="upgrade-cta-desc">20 AI queries/month, dip alerts, and full portfolio analytics.</span>
          </div>
          <button
            type="button"
            className="upgrade-cta-btn"
            onClick={() => void startPlusCheckout(sessionUser.email)}
            disabled={checkoutWorking}
          >
            {checkoutWorking ? "Redirecting..." : "Upgrade to Plus →"}
          </button>
        </div>
      ) : null}

      {!demoMode && sessionUser.planTier === "plus" && !sessionUser.proEnabled ? (
        <div className="upgrade-cta upgrade-cta-pro">
          <div className="upgrade-cta-content">
            <span className="upgrade-cta-badge upgrade-cta-badge-pro">Plus Plan</span>
            <strong className="upgrade-cta-title">Upgrade to Pro — $9.99/mo</strong>
            <span className="upgrade-cta-desc">Unlimited AI, Holdings AI analysis, advanced risk analytics.</span>
          </div>
          <button
            type="button"
            className="upgrade-cta-btn upgrade-cta-btn-pro"
            onClick={() => void startProCheckout(sessionUser.email)}
            disabled={checkoutWorking}
          >
            {checkoutWorking ? "Redirecting..." : "Upgrade to Pro →"}
          </button>
        </div>
      ) : null}

      {activePage === "settings" && (
      <section id="settings" className="settings-section">
        <div className="settings-head">
          <h2>Settings</h2>
          <p>View account details, manage membership, and contact support.</p>
        </div>
        <div className="settings-grid">
          <article className="settings-card">
            <h3>Account Details</h3>
            <div className="settings-rows">
              <p><span>Name</span><strong>{sessionUser.displayName}</strong></p>
              <p><span>Email</span><strong>{sessionUser.email}</strong></p>
              <p><span>Plan</span><strong>{sessionUser.proEnabled ? "PRO" : sessionUser.planTier.toUpperCase()}</strong></p>
              <p><span>Membership Status</span><strong>{settingsMembershipStatus}</strong></p>
              <p>
                <span>Member Since</span>
                <strong>
                  {sessionUser.createdAt && !Number.isNaN(new Date(sessionUser.createdAt).getTime())
                    ? new Date(sessionUser.createdAt).toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "2-digit" })
                    : "N/A"}
                </strong>
              </p>
            </div>
          </article>

          <article className="settings-card">
            <h3>Membership</h3>
            {demoMode ? (
              <>
                <p className="settings-note">
                  Demo mode includes sample Pro analytics only. Create an account to import your own reports and start a real Starter or Pro plan.
                </p>
                <div className="settings-actions">
                  <button type="button" className="refresh-btn" onClick={() => window.location.assign("/classic#access")}>
                    Create Account
                  </button>
                  <button type="button" className="template-btn" onClick={() => window.location.assign("/classic#pricing")}>
                    See Pricing
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="settings-note">
                  Open Stripe billing to manage payment details, invoices, change plans, or cancel your membership without losing your workspace data.
                </p>
                <div className="settings-actions">
                  {hasMembership ? (
                    <button
                      type="button"
                      className="refresh-btn"
                      onClick={() => void openBillingPortal()}
                      disabled={billingPortalWorking || working || refreshingPrices || checkoutWorking}
                    >
                      {billingPortalWorking ? "Opening..." : "Manage / Change Plan"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="refresh-btn"
                      onClick={() => void startPlusCheckout(sessionUser.email)}
                      disabled={billingPortalWorking || working || refreshingPrices || checkoutWorking}
                    >
                      {checkoutWorking ? "Redirecting..." : "Start Membership ($2.99/mo)"}
                    </button>
                  )}
                </div>
              </>
            )}
          </article>

          <article className="settings-card">
            <h3>Contact Us</h3>
            <p className="settings-note">Need help with account access, imports, plan changes, or billing?</p>
            <a className="settings-email" href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a>
            <p className="settings-note settings-note-small">Support email is available directly inside your program settings.</p>
          </article>
        </div>
      </section>
      )}

      {activePage === "import" && (
      <>
      <section id="uploads" className="upload-grid">
        <UploadCard
          title="Super Report File"
          description="Upload your superannuation holdings export."
          help="Imports super holdings into account, ticker, units, price, value, and cost base fields."
          onUpload={(event) => onUpload(event, "super")}
          template={superTemplateCsv()}
          templateName="super-template.csv"
          disabled={working || loading || demoMode}
          disabledLabel={demoMode ? "Create account to upload" : undefined}
        />
        <UploadCard
          title="ASX Report File"
          description="Upload brokerage or watchlist holdings export."
          help="Imports ASX holdings and enables live quote refresh for pricing and daily portfolio movement."
          onUpload={(event) => onUpload(event, "asx")}
          template={asxTemplateCsv()}
          templateName="asx-template.csv"
          disabled={working || loading || demoMode}
          disabledLabel={demoMode ? "Create account to upload" : undefined}
        />
        <UploadCard
          title="Index Report File"
          description="Upload index holdings or benchmark positions."
          help="Imports index or benchmark positions so they are included in value, allocation, and risk views."
          onUpload={(event) => onUpload(event, "index")}
          template={indexTemplateCsv()}
          templateName="index-template.csv"
          disabled={working || loading || demoMode}
          disabledLabel={demoMode ? "Create account to upload" : undefined}
        />
        <UploadCard
          title="Mutual Fund Report File"
          description="Upload managed fund or mutual fund holdings."
          help="Imports managed fund holdings and includes them in total value, cost base, and portfolio analytics."
          onUpload={(event) => onUpload(event, "fund")}
          template={fundTemplateCsv()}
          templateName="mutual-fund-template.csv"
          disabled={working || loading || demoMode}
          disabledLabel={demoMode ? "Create account to upload" : undefined}
        />
        <UploadCard
          title="Crypto Report File"
          description="Upload crypto wallet or exchange holdings."
          help="Imports crypto holdings and refreshes live prices using Yahoo crypto pairs (for example BTC-USD)."
          onUpload={(event) => onUpload(event, "crypto")}
          template={cryptoTemplateCsv()}
          templateName="crypto-template.csv"
          disabled={working || loading || demoMode}
          disabledLabel={demoMode ? "Create account to upload" : undefined}
        />
        <UploadCard
          title="Savings Report File"
          description="Upload savings account report or transaction export."
          help="Imports savings account reports. Transaction-ledger files are converted into a net savings cash position when possible."
          onUpload={(event) => onUpload(event, "savings")}
          template={savingsTemplateCsv()}
          templateName="savings-template.csv"
          disabled={working || loading || demoMode}
          disabledLabel={demoMode ? "Create account to upload" : undefined}
        />
        <UploadCard
          title="Tax Report File"
          description="Upload tax report or transaction export (CSV, XLSX, XLS, NUMBERS, ODS)."
          help="Imports tax report data. Transaction-ledger tax files are converted into a net tax position; holding-style reports are imported row by row."
          onUpload={(event) => onUpload(event, "tax")}
          template={taxTemplateCsv()}
          templateName="tax-template.csv"
          disabled={working || loading || demoMode}
          disabledLabel={demoMode ? "Create account to upload" : undefined}
        />
        <UploadCard
          title="ABC Bullion Report File"
          description="Upload ABC Bullion gold/silver holdings. Put metal weight in units/weight (oz or grams)."
          help="Imports gold and silver holdings by metal weight and tracks bullion exposure alongside other assets."
          onUpload={(event) => onUpload(event, "gold")}
          template={goldTemplateCsv()}
          templateName="bullion-template.csv"
          disabled={working || loading || demoMode}
          disabledLabel={demoMode ? "Create account to upload" : undefined}
        />
      </section>
      <div className="research-placeholder">
        <div className="research-placeholder-inner">
          <p className="research-placeholder-label">Research Terminal</p>
          <h2>Research tools coming soon.</h2>
          <p>Your uploaded reports are managed above. Advanced research capabilities — screeners, fundamentals, and market data — are planned for a future release.</p>
        </div>
      </div>
      </>
      )}

      {proAnalyticsEnabled && activePage === "ai" ? (
        <section id="alerts" className="dip-alerts-section">
          <div className="dip-alerts-head">
            <h2>Email Dip Alerts</h2>
            <p>Send an email when a selected ASX or crypto holding drops past your threshold versus previous close.</p>
            <p className="dip-alerts-plan-note">{demoMode ? "Demo mode: sample alerts can be edited locally, but no emails are sent." : dipAlertPlanMessage}</p>
          </div>

          <form className="dip-alerts-form" onSubmit={(event) => void saveDipAlert(event)}>
            <label>
              <span>Ticker</span>
              <input
                type="text"
                list="dip-alert-tickers"
                value={dipAlertTicker}
                onChange={(event) => setDipAlertTicker(event.target.value.toUpperCase())}
                placeholder={availableDipTickers[0] || "e.g. CBA or BTC"}
                maxLength={20}
                disabled={dipAlertSaving || !proAnalyticsEnabled}
              />
              <datalist id="dip-alert-tickers">
                {availableDipTickers.map((ticker) => (
                  <option key={ticker} value={ticker} />
                ))}
              </datalist>
            </label>

            <label>
              <span>Drop threshold (%)</span>
              <input
                type="number"
                min={0.1}
                max={90}
                step={0.1}
                value={dipAlertThreshold}
                onChange={(event) => setDipAlertThreshold(event.target.value)}
                disabled={dipAlertSaving || !proAnalyticsEnabled}
              />
            </label>

            <button
              type="submit"
              className="refresh-btn"
              disabled={!proAnalyticsEnabled || dipAlertSaving || dipAlertMax <= 0 || (dipAlerts.length >= dipAlertMax && !dipAlerts.some((alert) => alert.ticker === dipAlertTicker.trim().toUpperCase()))}
            >
              {dipAlertSaving ? "Saving..." : "Save Alert"}
            </button>
          </form>

          {dipAlertMax > 0 ? (
            <p className="dip-alerts-slots">
              {dipAlerts.length}/{dipAlertMax} alert slots in use ({dipAlertSlotsRemaining} remaining).
            </p>
          ) : (
            <p className="dip-alerts-slots">Upgrade to Pro to use dip alerts.</p>
          )}

          <div className="dip-alerts-grid">
            {dipAlerts.length === 0 ? (
              <div className="empty">No dip alerts yet. Add your first alert above.</div>
            ) : (
              dipAlerts.map((alert) => (
                <article key={alert.id} className="dip-alert-card">
                  <div className="dip-alert-card-head">
                    <h3>{alert.ticker}</h3>
                    <span className={"dip-alert-status " + (alert.enabled ? "enabled" : "disabled")}>{alert.enabled ? "Enabled" : "Paused"}</span>
                  </div>
                  <p>Trigger when drop is at least <strong>{alert.dropPctThreshold.toFixed(2)}%</strong>.</p>
                  <p className="dip-alert-last">
                    Last sent: {alert.lastTriggeredAt ? new Date(alert.lastTriggeredAt).toLocaleString("en-AU") : "Never"}
                  </p>
                  <div className="dip-alert-actions">
                    <button
                      type="button"
                      className="template-btn"
                      onClick={() => void toggleDipAlert(alert, !alert.enabled)}
                      disabled={!proAnalyticsEnabled || dipAlertSaving}
                    >
                      {alert.enabled ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      className="clear-btn"
                      onClick={() => void deleteDipAlert(alert.ticker)}
                      disabled={!proAnalyticsEnabled || dipAlertSaving}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}


      <div style={{display: activePage === "quant" ? undefined : "none"}}>
      <section id="metrics" className="kpi-grid">
        <KpiCard label="Total Portfolio" value={formatCurrency(metrics.totalValue)} help="Current market value across all imported holdings." />
        <KpiCard label="Cost Base" value={formatCurrency(metrics.totalCost)} help="Total invested amount from imported cost-base values." />
        <KpiCard
          label="Risk Score"
          value={portfolioRiskScore ? `${portfolioRiskScore.score}/100 (${portfolioRiskScore.label})` : "Need holdings"}
          help={
            portfolioRiskScore
              ? `Composite score from volatility, VaR, drawdown, diversification-adjusted concentration, source mix, and sample confidence. Broad index/fund-heavy sleeves reduce concentration penalty impact; single-stock/crypto-heavy mixes increase it. Confidence: ${portfolioRiskScore.confidence} (${portfolioRiskScore.returnsUsed} daily returns).${proAnalyticsEnabled ? ` Pro AI adjustment: ${portfolioRiskScore.aiAdjustment >= 0 ? "+" : ""}${portfolioRiskScore.aiAdjustment} points (bounded ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â±5).` : ""}`
              : "Composite score appears after holdings are imported."
          }
          tone={portfolioRiskScoreTone}
        />
        <KpiCard
          label="Unrealized P/L"
          value={(metrics.pnl >= 0 ? "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â² " : "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ ") + formatCurrency(Math.abs(metrics.pnl)) + " (" + formatPercent(metrics.pnlPct) + ")"}
          help="Unrealized profit or loss equals current portfolio value minus cost base."
          tone={metrics.pnl >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label={portfolioChangeLabel}
          value={
            todayPortfolioChangePct != null
              ? (todayPortfolioChangeAmount >= 0 ? "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â² " : "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ ") + formatCurrency(Math.abs(todayPortfolioChangeAmount)) + " (" + formatPercent(todayPortfolioChangePct) + ")"
              : "Need live prices"
          }
          help="Change since the first Sydney-time snapshot today. Resets at midnight Sydney time."
          tone={todayPortfolioChangePct == null ? "neutral" : todayPortfolioChangeAmount >= 0 ? "positive" : "negative"}
        />
        {proAnalyticsEnabled ? (
          <>
            <KpiCard
              label={"1-Day VaR (95%, " + riskWindow + ")"}
              value={
                effectiveVar95Amount != null
                  ? `${formatCurrency(effectiveVar95Amount)} (${formatPercent(effectiveVar95Pct)})${metrics.var95Amount == null ? " ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Yahoo estimate" : ""}`
                  : loadingHistoricalEstimate && metrics.var95Amount == null
                    ? "Estimating from Yahoo..."
                    : "Need 20+ daily snapshots"
              }
              help="Estimated one-day loss threshold at 95% confidence, based on the selected risk window."
            />
            <KpiCard
              label={"1-Day ES (95%, " + riskWindow + ")"}
              value={
                effectiveCvar95Amount != null
                  ? `${formatCurrency(effectiveCvar95Amount)} (${formatPercent(effectiveCvar95Pct)})${metrics.cvar95Amount == null ? " ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ Yahoo estimate" : ""}`
                  : loadingHistoricalEstimate && metrics.cvar95Amount == null
                    ? "Estimating from Yahoo..."
                    : "Need 20+ daily snapshots"
              }
              help="Expected Shortfall is the average loss on the worst 5% of days in the selected window."
            />
          </>
        ) : (
          <KpiCard
            label="Pro Quant Pack"
            value="VaR, ES, beta, stress tests"
            help="Starter keeps the dashboard simple. Upgrade to Pro for deeper quant risk analytics."
          />
        )}
      </section>

      <section className={`pro-analytics-section ${proAnalyticsEnabled ? "unlocked" : "locked"}`}>
        <div className="pro-analytics-head">
          <h2>Pro Quant Console</h2>
          <span className="pro-analytics-status">{proAnalyticsEnabled ? "UNLOCKED" : "LOCKED • $9.99/MONTH"}</span>
        </div>
        <p className="pro-analytics-note">
          {proAnalyticsEnabled
            ? "Advanced quant analytics are active for this account."
            : "Starter stays streamlined. Upgrade to Pro to unlock VaR, Expected Shortfall, benchmark beta, tracking error, and stress scenarios."}
        </p>
        <div className="pro-analytics-grid">
          <article className="pro-analytics-card">
            <p>Expected Shortfall (ES 95)</p>
            <strong>
              {proAnalyticsEnabled && effectiveCvar95Amount != null
                ? `${formatCurrency(effectiveCvar95Amount)} (${formatPercent(effectiveCvar95Pct)})`
                : "LOCKED"}
            </strong>
          </article>
          <article className="pro-analytics-card">
            <p>Beta vs ASX 200</p>
            <strong>{proAnalyticsEnabled && benchmarkBeta != null ? benchmarkBeta.toFixed(2) : "LOCKED"}</strong>
          </article>
          <article className="pro-analytics-card">
            <p>Tracking Error (Annualized)</p>
            <strong>{proAnalyticsEnabled && benchmarkTrackingErrorAnnualPct != null ? formatPercent(benchmarkTrackingErrorAnnualPct) : "LOCKED"}</strong>
          </article>
          <article className="pro-analytics-card">
            <p>AI Risk Adjustment</p>
            <strong>{proAnalyticsEnabled ? aiRiskAdjustmentLabel : "LOCKED"}</strong>
          </article>
        </div>
        {askAiEnabled ? (
          <div className="holdings-ai-panel">
            <div className="holdings-ai-head">
              <h3>Ask AI: Holdings Drivers</h3>
              {holdingsAiResult ? (
                <span>
                  {new Date(holdingsAiResult.generatedAt).toLocaleString("en-AU")} via {holdingsAiResult.model}
                </span>
              ) : null}
            </div>
            <p className="holdings-ai-note">Ask what may be influencing value, momentum, risk, and concentration in your current portfolio.</p>
            <form className="holdings-ai-form" onSubmit={(event) => void runHoldingsAi(event)}>
              <textarea
                value={holdingsAiQuestion}
                onChange={(event) => setHoldingsAiQuestion(event.target.value)}
                placeholder={HOLDINGS_AI_DEFAULT_PROMPT}
                maxLength={700}
                disabled={holdingsAiLoading}
              />
              <div className="holdings-ai-actions">
                <button type="submit" className="refresh-btn" disabled={holdingsAiLoading || state.holdings.length === 0}>
                  {holdingsAiLoading ? "Analyzing..." : "Ask AI"}
                </button>
              </div>
            </form>
            {holdingsAiError ? <p className="holdings-ai-error">{holdingsAiError}</p> : null}
            {holdingsAiResult ? (
              <div className="holdings-ai-output">
                <article className="holdings-ai-block">
                  <h4>Answer</h4>
                  <p>{holdingsAiResult.answer}</p>
                </article>

                <article className="holdings-ai-block">
                  <h4>Portfolio Drivers</h4>
                  {holdingsAiResult.portfolioDrivers.length === 0 ? (
                    <p className="empty">No portfolio drivers returned.</p>
                  ) : (
                    <ul>
                      {holdingsAiResult.portfolioDrivers.map((driver, index) => (
                        <li key={`${driver}-${index}`}>{driver}</li>
                      ))}
                    </ul>
                  )}
                </article>

                <article className="holdings-ai-block">
                  <h4>Holding-Level Influences</h4>
                  {holdingsAiResult.holdingBreakdown.length === 0 ? (
                    <p className="empty">No holding-level breakdown returned.</p>
                  ) : (
                    <div className="holdings-ai-breakdown-grid">
                      {holdingsAiResult.holdingBreakdown.map((item, index) => (
                        <div className="holdings-ai-breakdown-card" key={`${item.ticker}-${index}`}>
                          <div className="holdings-ai-breakdown-head">
                            <strong>{item.ticker}</strong>
                            <span>Confidence {item.confidence}%</span>
                          </div>
                          <p>{item.summary}</p>
                          {item.influences.length > 0 ? (
                            <ul>
                              {item.influences.map((influence, influenceIndex) => (
                                <li key={`${influence}-${influenceIndex}`}>{influence}</li>
                              ))}
                            </ul>
                          ) : null}
                          {item.riskFlags.length > 0 ? (
                            <p className="holdings-ai-risk-flags">Risk: {item.riskFlags.join(" | ")}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <div className="holdings-ai-block-grid">
                  <article className="holdings-ai-block">
                    <h4>Risk Checks</h4>
                    {holdingsAiResult.riskChecks.length === 0 ? (
                      <p className="empty">No risk checks returned.</p>
                    ) : (
                      <ul>
                        {holdingsAiResult.riskChecks.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                  <article className="holdings-ai-block">
                    <h4>Next Actions</h4>
                    {holdingsAiResult.nextActions.length === 0 ? (
                      <p className="empty">No next actions returned.</p>
                    ) : (
                      <ul>
                        {holdingsAiResult.nextActions.map((item, index) => (
                          <li key={`${item}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {!proAnalyticsEnabled ? (
          <div className="pro-analytics-cta">
            <button type="button" onClick={() => void startProCheckout(authEmail)} className="refresh-btn" disabled={checkoutWorking}>
              {checkoutWorking ? "Redirecting..." : "Unlock Pro Analytics"}
            </button>
          </div>
        ) : null}
      </section>
      </div>

      <section className="ai-page-section" style={{display: activePage === "ai" ? undefined : "none"}}>
          {askAiEnabled ? (
            <div className="holdings-ai-panel">
              <div className="holdings-ai-head">
                <h3>Ask AI: Holdings Drivers</h3>
                {holdingsAiResult ? (
                  <span>
                    {new Date(holdingsAiResult.generatedAt).toLocaleString("en-AU")} via {holdingsAiResult.model}
                  </span>
                ) : null}
              </div>
              <p className="holdings-ai-note">Ask what may be influencing value, momentum, risk, and concentration in your current portfolio.</p>
              <form className="holdings-ai-form" onSubmit={(event) => void runHoldingsAi(event)}>
                <textarea
                  value={holdingsAiQuestion}
                  onChange={(event) => setHoldingsAiQuestion(event.target.value)}
                  placeholder={HOLDINGS_AI_DEFAULT_PROMPT}
                  maxLength={700}
                  disabled={holdingsAiLoading}
                />
                <div className="holdings-ai-actions">
                  <button type="submit" className="refresh-btn" disabled={holdingsAiLoading || state.holdings.length === 0}>
                    {holdingsAiLoading ? "Analyzing..." : "Ask AI"}
                  </button>
                </div>
              </form>
              {holdingsAiError ? <p className="holdings-ai-error">{holdingsAiError}</p> : null}
              {holdingsAiResult ? (
                <div className="holdings-ai-output">
                  <article className="holdings-ai-block">
                    <h4>Answer</h4>
                    <p>{holdingsAiResult.answer}</p>
                  </article>

                  <article className="holdings-ai-block">
                    <h4>Portfolio Drivers</h4>
                    {holdingsAiResult.portfolioDrivers.length === 0 ? (
                      <p className="empty">No portfolio drivers returned.</p>
                    ) : (
                      <ul>
                        {holdingsAiResult.portfolioDrivers.map((driver, index) => (
                          <li key={`${driver}-${index}`}>{driver}</li>
                        ))}
                      </ul>
                    )}
                  </article>

                  <article className="holdings-ai-block">
                    <h4>Holding-Level Influences</h4>
                    {holdingsAiResult.holdingBreakdown.length === 0 ? (
                      <p className="empty">No holding-level breakdown returned.</p>
                    ) : (
                      <div className="holdings-ai-breakdown-grid">
                        {holdingsAiResult.holdingBreakdown.map((item, index) => (
                          <div className="holdings-ai-breakdown-card" key={`${item.ticker}-${index}`}>
                            <div className="holdings-ai-breakdown-head">
                              <strong>{item.ticker}</strong>
                              <span>Confidence {item.confidence}%</span>
                            </div>
                            <p>{item.summary}</p>
                            {item.influences.length > 0 ? (
                              <ul>
                                {item.influences.map((influence, influenceIndex) => (
                                  <li key={`${influence}-${influenceIndex}`}>{influence}</li>
                                ))}
                              </ul>
                            ) : null}
                            {item.riskFlags.length > 0 ? (
                              <p className="holdings-ai-risk-flags">Risk: {item.riskFlags.join(" | ")}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>

                  <div className="holdings-ai-block-grid">
                    <article className="holdings-ai-block">
                      <h4>Risk Checks</h4>
                      {holdingsAiResult.riskChecks.length === 0 ? (
                        <p className="empty">No risk checks returned.</p>
                      ) : (
                        <ul>
                          {holdingsAiResult.riskChecks.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                    <article className="holdings-ai-block">
                      <h4>Next Actions</h4>
                      {holdingsAiResult.nextActions.length === 0 ? (
                        <p className="empty">No next actions returned.</p>
                      ) : (
                        <ul>
                          {holdingsAiResult.nextActions.map((item, index) => (
                            <li key={`${item}-${index}`}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {!proAnalyticsEnabled ? (
            <div className="pro-analytics-cta">
              <button type="button" onClick={() => void startProCheckout(authEmail)} className="refresh-btn" disabled={checkoutWorking}>
                {checkoutWorking ? "Redirecting..." : "Unlock Pro Analytics"}
              </button>
            </div>
          ) : null}
        </section>

      <div style={{display: activePage === "quant" ? undefined : "none"}}>
      <section id="insights" className="insights-section">
        <h2>{proAnalyticsEnabled ? "Performance & Stress" : "Performance"}</h2>
        <div className="insights-grid">
          <article className="insight-card">
            <h3>Asset Split</h3>
            {assetSplit.length === 0 ? (
              <div className="empty">Import holdings to view asset split.</div>
            ) : (
              <div className="asset-list">
                {assetSplit.map((item) => (
                  <div className="asset-row" key={item.name}>
                    <span>{item.name}</span>
                    <strong>{formatCurrency(item.value)} ({formatPercent(item.pct)})</strong>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="insight-card">
            <h3>Best / Worst Performer</h3>
            {bestPerformer == null || worstPerformer == null ? (
              <div className="empty">Need holdings with cost base to calculate performance.</div>
            ) : (
              <div className="performer-list">
                <div className="performer-row">
                  <p>Best: {bestPerformer.ticker}</p>
                  <strong className={bestPerformer.pnl >= 0 ? "positive" : "negative"}>
                    {formatSignedCurrency(bestPerformer.pnl)} ({formatPercent(bestPerformer.pnlPct)})
                  </strong>
                </div>
                <div className="performer-row">
                  <p>Worst: {worstPerformer.ticker}</p>
                  <strong className={worstPerformer.pnl >= 0 ? "positive" : "negative"}>
                    {formatSignedCurrency(worstPerformer.pnl)} ({formatPercent(worstPerformer.pnlPct)})
                  </strong>
                </div>
              </div>
            )}
          </article>

          <article className="insight-card">
            <h3>Top Gainer / Loser {moverPeriodLabel}</h3>
            {proAnalyticsEnabled ? (
              todayTopGainer == null || todayTopLoser == null ? (
                <div className="empty">Need live prices to calculate movers.</div>
              ) : (
                <div className="performer-list">
                  <div className="performer-row">
                    <p>Gainer: {todayTopGainer.ticker}</p>
                    <strong className={todayTopGainer.changeAmount >= 0 ? "positive" : "negative"}>
                      {formatSignedCurrency(todayTopGainer.changeAmount)} ({formatPercent(todayTopGainer.changePct)})
                    </strong>
                  </div>
                  <div className="performer-row">
                    <p>Loser: {todayTopLoser.ticker}</p>
                    <strong className={todayTopLoser.changeAmount >= 0 ? "positive" : "negative"}>
                      {formatSignedCurrency(todayTopLoser.changeAmount)} ({formatPercent(todayTopLoser.changePct)})
                    </strong>
                  </div>
                </div>
              )
            ) : (
              <div className="empty">Pro only. Upgrade to unlock live top gainer/loser insights.</div>
            )}
          </article>
        </div>

        {proAnalyticsEnabled ? (
          <div className="stress-grid">
            {stressScenarios.length === 0 ? (
              <div className="empty">Import holdings to run stress scenarios.</div>
            ) : (
              stressScenarios.map((scenario) => (
                <article key={scenario.name} className={"stress-card " + (scenario.impactAmount <= 0 ? "down" : "up")}>
                  <p>{scenario.name}</p>
                  <strong>{formatSignedCurrency(scenario.impactAmount)} ({formatPercent(scenario.impactPct)})</strong>
                  <span>Projected value: {formatCurrency(scenario.projectedValue)}</span>
                </article>
              ))
            )}
          </div>
        ) : null}
      </section>

      
      <section className="gold-section">
        <h2>Bullion Tracking (ABC Bullion)</h2>
        {bullionHoldings.length === 0 ? (
          <div className="empty">Upload an ABC Bullion CSV to track gold and silver weights and values.</div>
        ) : (
          <div className="gold-grid">
            <article className="gold-card">
              <p>Total gold weight (troy oz)</p>
              <strong>{formatWeightOz(goldWeightOz)}</strong>
            </article>
            <article className="gold-card">
              <p>Total gold value</p>
              <strong>{formatCurrency(goldValue)}</strong>
            </article>
            <article className="gold-card">
              <p>Gold unrealized P/L</p>
              <strong className={goldValue - goldCostBase >= 0 ? "positive" : "negative"}>
                {(goldValue - goldCostBase >= 0 ? "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â² " : "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ ") + formatCurrency(Math.abs(goldValue - goldCostBase))}
              </strong>
            </article>
            <article className="gold-card silver">
              <p>Total silver weight (troy oz)</p>
              <strong>{formatWeightOz(silverWeightOz)}</strong>
            </article>
            <article className="gold-card silver">
              <p>Total silver value</p>
              <strong>{formatCurrency(silverValue)}</strong>
            </article>
            <article className="gold-card silver">
              <p>Silver unrealized P/L</p>
              <strong className={silverValue - silverCostBase >= 0 ? "positive" : "negative"}>
                {(silverValue - silverCostBase >= 0 ? "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â² " : "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ ") + formatCurrency(Math.abs(silverValue - silverCostBase))}
              </strong>
            </article>
          </div>
        )}
      </section>

      
      <section id="quality" className="quality-section">
        <h2>Data Quality</h2>
        <div className="quality-grid">
          {dataQualityRows.map((row) => (
            <article key={row.label} className={"quality-card " + row.status}>
              <p>{row.label}</p>
              <strong>{row.value}</strong>
            </article>
          ))}
        </div>
      </section>

      
      <section id="risk" className="risk-section">
        <div className="risk-head">
          <h2>{proAnalyticsEnabled ? "Risk Signals" : "Risk Snapshot"}</h2>
          {proAnalyticsEnabled ? (
            <div className="risk-window-controls" role="group" aria-label="Select risk window">
              {RISK_WINDOW_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={"risk-window-btn" + (riskWindow === option ? " active" : "")}
                  onClick={() => setRiskWindow(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {proAnalyticsEnabled ? (
          <p className="risk-window-note">
            Window {riskWindow}: {metrics.riskPointsUsed} snapshot points
            {metrics.riskStartDate ? " from " + formatRiskWindowDate(metrics.riskStartDate) : ""}
            {metrics.riskEndDate ? " to " + formatRiskWindowDate(metrics.riskEndDate) : ""}
            .
          </p>
        ) : (
          <p className="risk-window-note">Starter now shows a slim risk snapshot. Upgrade to Pro for full risk windows and advanced measurements.</p>
        )}
        {usingYahooFallback ? (
          <p className="estimate-note">
            {historicalRiskEstimate.note} ({historicalRiskEstimate.pointsUsed}/{historicalRiskEstimate.pointsTarget} points, {historicalRiskEstimate.usedTickers.length} tickers{proAnalyticsEnabled ? `, ${historicalRiskEstimate.benchmarkPointsUsed} benchmark overlap days` : ""})
          </p>
        ) : null}
        <div className="risk-grid">
          {riskFlags.length === 0 ? (
            <div className="empty">Import reports over time to unlock drawdown/volatility/VaR/ES metrics.</div>
          ) : (
            riskFlags.map((flag) => (
              <article key={flag.label} className={`risk-card ${flag.tone}`}>
                <div className="risk-label-row">
                  <p>{flag.label}</p>
                  <span className="metric-help" tabIndex={0} aria-label={flag.help}>
                    ?
                    <span className="metric-help-popup">{flag.help}</span>
                  </span>
                </div>
                <strong>{flag.value}</strong>
              </article>
            ))
          )}
        </div>
      </section>

      
      <section id="charts" className="chart-grid">
        <ChartCard title="Account Allocation" tone="portfolio" help="Value split by account. Percentages are based on total portfolio value.">
          <PieAllocation data={metrics.accountAllocation} palette={PORTFOLIO_COLORS} />
        </ChartCard>
        <ChartCard title="Sector Allocation" tone="exposure" help="Value concentration by sector/category from your imported holdings.">
          <PieAllocation data={metrics.sectorAllocation} palette={EXPOSURE_COLORS} />
        </ChartCard>
        <ChartCard title="Top Holdings" tone="holdings" help="Largest positions ranked by current market value.">
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={metrics.topHoldings.map((item) => ({ name: item.ticker, value: item.value }))} margin={{ top: 14, right: 24, left: 24, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#303036" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {metrics.topHoldings.map((item, index) => (
                  <Cell key={item.id} fill={item.ticker.toUpperCase() === "ABC2" ? "#000000" : EXPOSURE_COLORS[index % EXPOSURE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Portfolio Snapshot History" tone="history" help="Total portfolio history from saved snapshots at import and live-price refresh times.">
          <ResponsiveContainer width="100%" height={420}>
            <AreaChart data={portfolioHistorySeries} margin={{ top: 14, right: 24, left: 24, bottom: 8 }}>
              <defs>
                <linearGradient id="portfolio-history-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT_COLOR} stopOpacity={0.48} />
                  <stop offset="70%" stopColor={ACCENT_COLOR} stopOpacity={0.14} />
                  <stop offset="100%" stopColor={ACCENT_COLOR} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#303036" />
              <XAxis dataKey="date" tickFormatter={formatSnapshotTick} minTickGap={28} />
              <YAxis tickFormatter={formatAxisValue} width={82} />
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={formatSnapshotLabel}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ stroke: "#7d8290", strokeDasharray: "4 4" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={ACCENT_COLOR}
                strokeWidth={2.2}
                fill="url(#portfolio-history-fill)"
                dot={false}
                activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 1, fill: ACCENT_COLOR }}
              />
              {portfolioHistorySeries.length > 1 ? (
                <Brush
                  dataKey="date"
                  height={30}
                  stroke="#7d8290"
                  travellerWidth={10}
                  tickFormatter={formatSnapshotTick}
                  fill="rgba(255, 255, 255, 0.04)"
                />
              ) : null}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      
      <section id="holdings" className="table-section">
        <h2>Current Holdings</h2>
        {loading ? (
          <div className="empty">Loading stored data...</div>
        ) : state.holdings.length === 0 ? (
          <div className="empty">Upload super, ASX, crypto, index, mutual fund, and/or bullion CSVs to populate this dashboard.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Account</th>
                  <th>Ticker</th>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Cost Base</th>
                  <th>P/L</th>
                  <th>Sector</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {[...state.holdings]
                  .sort((a, b) => b.value - a.value)
                  .map((holding) => {
                    const pnl = holding.value - holding.costBase;
                    return (
                      <tr key={holding.id}>
                        <td><span className={"source-badge " + holding.source}>{holding.source.toUpperCase()}</span></td>
                        <td><span className="account-chip" style={getAccountChipStyle(holding.account)}>{holding.account}</span></td>
                        <td>{holding.ticker}</td>
                        <td>{holding.name}</td>
                        <td>{formatCurrency(holding.value)}</td>
                        <td>{formatCurrency(holding.costBase)}</td>
                        <td><span className={"pnl-chip " + (pnl >= 0 ? "up" : "down")}>{(pnl >= 0 ? "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â² " : "ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼ ") + formatCurrency(Math.abs(pnl))}</span></td>
                        <td>{holding.sector}</td>
                        <td>{holding.reportDate}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      </div>

      <footer className="footer-note">
        <p className="footer-disclaimer">Disclaimer: SPECTRE provides informational analytics only. It is not financial, investment, tax, or legal advice, and no result is guaranteed to be complete, current, or accurate.</p>
        <p className="footer-disclaimer">Use at your own risk. Always verify pricing, corporate actions, and holdings with official statements before making decisions. If this app is deployed online, database access and backups are your responsibility.</p>
        <p className="footer-contact">Contact us: <a href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a></p>
        <p className="footer-legal">T&C apply. Copyright 2026 SPECTRE.</p>
      </footer>
    </div>
  );
}

function UploadCard({
  title,
  description,
  help,
  onUpload,
  template,
  templateName,
  disabled,
  disabledLabel,
}: {
  title: string;
  description: string;
  help?: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  template: string;
  templateName: string;
  disabled: boolean;
  disabledLabel?: string;
}) {
  const downloadTemplate = () => {
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", templateName);
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <article className="upload-card card-with-help">
      {help ? <InfoKey text={help} /> : null}
      <h2>{title}</h2>
      <p>{description}</p>
      <label className="file-input">
        <input
          type="file"
          accept=".csv,.tsv,.psv,.txt,.json,.xlsx,.xls,.xlsm,.xlsb,.numbers,.ods,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel.sheet.binary.macroEnabled.12,application/vnd.oasis.opendocument.spreadsheet,application/x-iwork-numbers-sffnumbers"
          onChange={onUpload}
          disabled={disabled}
        />
        <span>{disabled ? (disabledLabel || "Please wait...") : "Select File"}</span>
      </label>
      <button type="button" onClick={downloadTemplate} className="template-btn" disabled={disabled}>
        Download template
      </button>
    </article>
  );
}

function KpiCard({
  label,
  value,
  help,
  tone = "neutral",
}: {
  label: string;
  value: string;
  help?: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <article className={"kpi-card card-with-help" + (tone !== "neutral" ? " kpi-" + tone : "")}>
      {help ? <InfoKey text={help} /> : null}
      <p>{label}</p>
      <strong className={tone}>{value}</strong>
    </article>
  );
}

function PieAllocation({ data, palette }: { data: Array<{ name: string; value: number; pct: number }>; palette: string[] }) {
  if (data.length === 0) {
    return <div className="empty">No data yet</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data.slice(0, 7)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
          {data.slice(0, 7).map((entry, index) => (
            <Cell key={entry.name + "-" + entry.value} fill={palette[index % palette.length]} />
          ))}
        </Pie>
        <Tooltip formatter={tooltipFormatter} contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
        <Legend formatter={(value) => String(value)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ChartCard({
  title,
  children,
  tone = "default",
  help,
}: {
  title: string;
  children: ReactNode;
  tone?: "default" | "portfolio" | "exposure" | "history" | "holdings";
  help?: string;
}) {
  return (
    <article className={"chart-card chart-" + tone + " card-with-help"}>
      {help ? <InfoKey text={help} /> : null}
      <h2>{title}</h2>
      {children}
    </article>
  );
}

function InfoKey({ text }: { text: string }) {
  return (
    <details className="card-help-toggle card-help-corner">
      <summary className="metric-help" aria-label={text}>
        i
      </summary>
      <span className="metric-help-popup">{text}</span>
    </details>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizePenalty(value: number | null, low: number, high: number): number {
  if (value == null || !Number.isFinite(value)) {
    return 0.5;
  }

  if (high <= low) {
    return 0;
  }

  return clamp((value - low) / (high - low), 0, 1);
}

function countKeywordHits(corpus: string, keywords: string[]): number {
  return keywords.reduce((total, keyword) => total + (corpus.includes(keyword) ? 1 : 0), 0);
}

function buildHoldingsAiSignalCorpus(analysis: HoldingsAiAnalysis): string {
  const segments = new Set<string>();

  const addSegment = (value: string | null | undefined): void => {
    const normalized = (value || "").trim().toLowerCase();
    if (normalized.length > 0) {
      segments.add(normalized);
    }
  };

  addSegment(analysis.answer);
  analysis.portfolioDrivers.forEach(addSegment);
  analysis.riskChecks.forEach(addSegment);
  analysis.nextActions.forEach(addSegment);
  analysis.holdingBreakdown.forEach((item) => {
    addSegment(item.summary);
    item.influences.forEach(addSegment);
    item.riskFlags.forEach(addSegment);
  });

  return Array.from(segments).join(" | ");
}

function computeAiRiskAdjustment(analysis: HoldingsAiAnalysis | null): number {
  if (!analysis) {
    return 0;
  }

  const corpus = buildHoldingsAiSignalCorpus(analysis);
  if (corpus.length === 0) {
    return 0;
  }

  const negativeHits = countKeywordHits(corpus, AI_RISK_NEGATIVE_KEYWORDS);
  const positiveHits = countKeywordHits(corpus, AI_RISK_POSITIVE_KEYWORDS);
  const confidenceSamples = analysis.holdingBreakdown
    .map((item) => Number(item.confidence))
    .filter((value) => Number.isFinite(value));
  const averageConfidence = confidenceSamples.length > 0
    ? confidenceSamples.reduce((total, value) => total + value, 0) / confidenceSamples.length
    : 60;
  const confidenceWeight = clamp(averageConfidence / 100, 0.4, 1);
  const weightedDelta = (positiveHits - negativeHits) * confidenceWeight;

  return Math.round(clamp(weightedDelta, -5, 5));
}

function toRiskFlag(
  label: string,
  value: number | null,
  yellowThreshold: number,
  redThreshold: number,
  suffix: string,
  help: string,
): RiskFlag {
  if (value == null || !Number.isFinite(value)) {
    return { label, value: "N/A", tone: "green", help };
  }

  if (value >= redThreshold) {
    return { label, value: `${value.toFixed(2)}${suffix}`, tone: "red", help };
  }

  if (value >= yellowThreshold) {
    return { label, value: `${value.toFixed(2)}${suffix}`, tone: "yellow", help };
  }

  return { label, value: `${value.toFixed(2)}${suffix}`, tone: "green", help };
}

// For metrics where lower = worse (e.g. Sharpe, Sortino)
function toRiskFlagLow(
  label: string,
  value: number | null,
  yellowThreshold: number,
  redThreshold: number,
  suffix: string,
  help: string,
): RiskFlag {
  if (value == null || !Number.isFinite(value)) {
    return { label, value: "N/A", tone: "green", help };
  }

  if (value <= redThreshold) {
    return { label, value: `${value.toFixed(2)}${suffix}`, tone: "red", help };
  }

  if (value <= yellowThreshold) {
    return { label, value: `${value.toFixed(2)}${suffix}`, tone: "yellow", help };
  }

  return { label, value: `${value.toFixed(2)}${suffix}`, tone: "green", help };
}

function getSydneyClockParts(date: Date): { weekday: string; hour: number; minute: number } | null {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value || "";
  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value || "", 10);
  const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value || "", 10);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  return { weekday, hour, minute };
}

function toSydneyDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isAsxRegularSessionOpenNow(date = new Date()): boolean {
  const clock = getSydneyClockParts(date);
  if (!clock) {
    return false;
  }

  if (clock.weekday === "Sat" || clock.weekday === "Sun") {
    return false;
  }

  const minutesSinceMidnight = clock.hour * 60 + clock.minute;
  const openMinutes = 10 * 60;
  const closeMinutes = 16 * 60 + 10;

  return minutesSinceMidnight >= openMinutes && minutesSinceMidnight < closeMinutes;
}

function isAsxSessionDataFreshNow(lastPriceRefreshAt: string, now = new Date()): boolean {
  if (!lastPriceRefreshAt) {
    return false;
  }

  const refreshedAt = new Date(lastPriceRefreshAt);
  if (Number.isNaN(refreshedAt.getTime())) {
    return false;
  }

  if (toSydneyDateKey(refreshedAt) !== toSydneyDateKey(now)) {
    return false;
  }

  if (!isAsxRegularSessionOpenNow(now)) {
    return true;
  }

  const refreshClock = getSydneyClockParts(refreshedAt);
  if (!refreshClock) {
    return false;
  }

  const openMinutes = 10 * 60;
  const refreshMinutesSinceMidnight = refreshClock.hour * 60 + refreshClock.minute;
  return refreshMinutesSinceMidnight >= openMinutes;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedCurrency(value: number): string {
  const prefix = value >= 0 ? "+" : "-";
  return prefix + formatCurrency(Math.abs(value));
}

function formatPercent(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)}%`;
}

function formatAxisValue(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value ?? "");
  }

  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(numeric);
}
function formatSnapshotTick(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  if (value.length <= 10) {
    return value.slice(5);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(5, 16);
  }

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const hour = String(parsed.getHours()).padStart(2, "0");
  const minute = String(parsed.getMinutes()).padStart(2, "0");

  return `${day}/${month} ${hour}:${minute}`;
}

function formatSnapshotLabel(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRiskWindowDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatWeightOz(value: number): string {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  return `${new Intl.NumberFormat("en-AU", { maximumFractionDigits: 3 }).format(value)} oz`;
}

function resolveHoldingUnits(units: number, value: number, price: number): number {
  if (Number.isFinite(units) && units > 0) {
    return units;
  }

  if (Number.isFinite(value) && Number.isFinite(price) && value > 0 && price > 0) {
    return value / price;
  }

  return 0;
}

function detectBullionMetal(holding: { name: string; ticker: string; sector: string }): "gold" | "silver" {
  const text = (holding.name + " " + holding.ticker + " " + holding.sector).toLowerCase();
  if (text.includes("silver") || /(^|\W)ag(\W|$)/.test(text)) {
    return "silver";
  }

  return "gold";
}

function tooltipFormatter(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const numeric = Number(raw);

  if (Number.isFinite(numeric)) {
    return formatCurrency(numeric);
  }

  return String(raw ?? "");
}

function getUserVisibleCsvWarning(errors: ParseError[]): string {
  const relevantWarnings = errors.filter((error) => {
    if (error.type !== "FieldMismatch") {
      return true;
    }

    const message = error.message.toLowerCase();
    return !message.includes("too few fields") && !message.includes("too many fields");
  });

  if (relevantWarnings.length === 0) {
    return "";
  }

  return " Parsed with warning: " + relevantWarnings[0].message;
}

function getAccountChipStyle(account: string): CSSProperties {
  const hash = account
    .split("")
    .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 2147483647, 7);
  const tone = ACCOUNT_CHIP_STYLES[hash % ACCOUNT_CHIP_STYLES.length];

  return {
    backgroundColor: tone.bg,
    color: tone.fg,
    borderColor: tone.border,
  };
}

function normalizeSessionUser(user: SessionUser): SessionUser {
  const planTier = user.planTier === "pro" ? "pro" : user.planTier === "plus" ? "plus" : user.planTier === "free" ? "free" : "none";
  const proEnabled = user.proEnabled === true || planTier === "pro";
  const subscriptionStatus = typeof user.subscriptionStatus === "string" && user.subscriptionStatus.length > 0 ? user.subscriptionStatus : null;
  const createdAt = typeof user.createdAt === "string" && user.createdAt.length > 0 ? user.createdAt : undefined;

  return {
    ...user,
    createdAt,
    planTier,
    proEnabled,
    subscriptionStatus,
  };
}

function toCheckoutPlan(value: string | null): CheckoutPlan {
  if (value === "pro") {
    return "pro";
  }

  if (value === "plus") {
    return "plus";
  }

  return "free";
}

function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === trimmed.length - 1) {
    return "";
  }
  return trimmed.slice(dotIndex + 1).toLowerCase();
}

async function readUploadFileCandidates(file: File): Promise<UploadCandidate[]> {
  const extension = getFileExtension(file.name);
  if (TEXT_UPLOAD_EXTENSIONS.has(extension)) {
    const text = await file.text();
    return [{ label: file.name, text }];
  }

  if (WORKBOOK_UPLOAD_EXTENSIONS.has(extension)) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("Workbook file has no sheets.");
    }

    const candidates: UploadCandidate[] = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        continue;
      }

      const csvText = XLSX.utils.sheet_to_csv(worksheet, { blankrows: false });
      if (csvText.trim().length === 0) {
        continue;
      }

      candidates.push({
        label: `${file.name} :: ${sheetName}`,
        text: csvText,
      });
    }

    if (candidates.length === 0) {
      throw new Error("Workbook file appears empty.");
    }

    return candidates;
  }

  throw new Error(INVALID_UPLOAD_FORMAT_MESSAGE);
}

function coerceJsonRows(value: unknown): CsvRow[] {
  const toRow = (record: Record<string, unknown>): CsvRow => {
    return Object.entries(record).reduce<CsvRow>((acc, [key, cell]) => {
      if (cell == null || typeof cell === "string" || typeof cell === "number") {
        acc[key] = cell;
      } else if (typeof cell === "boolean") {
        acc[key] = cell ? "true" : "false";
      } else {
        acc[key] = JSON.stringify(cell);
      }
      return acc;
    }, {});
  };

  const toRows = (rows: unknown[]): CsvRow[] => {
    return rows
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      .map((item) => toRow(item));
  };

  if (Array.isArray(value)) {
    return toRows(value);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const container = value as Record<string, unknown>;
  const preferredKeys = ["holdings", "rows", "data", "items", "transactions", "positions"];
  for (const key of preferredKeys) {
    const candidate = container[key];
    if (!Array.isArray(candidate)) {
      continue;
    }

    const rows = toRows(candidate);
    if (rows.length > 0) {
      return rows;
    }
  }

  const singleRow = toRow(container);
  return Object.keys(singleRow).length > 0 ? [singleRow] : [];
}

function parseUploadRows(text: string): { rows: CsvRow[]; errors: ParseError[] } {
  const normalizedText = extractCsvDataSection(text);
  const trimmed = normalizedText.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsedJson = JSON.parse(trimmed) as unknown;
      const rows = coerceJsonRows(parsedJson);
      if (rows.length > 0) {
        return { rows, errors: [] };
      }
    } catch {
      // Fall through to CSV parser.
    }
  }

  const parsed = Papa.parse<CsvRow>(normalizedText, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter: "",
    transformHeader: (header) => header.trim(),
  });

  return {
    rows: parsed.data,
    errors: parsed.errors,
  };
}

async function parseApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiError;
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return fallback;
  }

  return fallback;
}


function buildDemoHoldingsAiAnalysis(question: string): HoldingsAiAnalysis {
  return {
    generatedAt: "2026-03-06T06:12:00.000Z",
    model: "SPECTRE Demo AI",
    question,
    answer:
      "This demo portfolio is driven by a few large risk buckets: super exposure as the core base, concentrated Australian equities, and two higher-volatility sleeves in crypto and bullion. The main downside sensitivity comes from concentration in the top three positions and the crypto allocation.",
    portfolioDrivers: [
      "Super remains the anchor allocation and keeps the overall portfolio diversified by account.",
      "CBA, BHP, and MQG drive most of the listed-equity sensitivity to the ASX.",
      "BTC and ETH add upside momentum but materially increase tail-risk and drawdown sensitivity.",
      "Bullion offsets part of the equity/crypto shock profile during mixed-stress scenarios.",
    ],
    holdingBreakdown: [
      {
        ticker: "SUPBAL",
        summary: "The super sleeve is the largest account and acts as the portfolio base layer.",
        influences: ["Largest account weight in the portfolio", "Moderates concentration outside listed holdings"],
        riskFlags: ["Largest account share"],
        confidence: 88,
      },
      {
        ticker: "BTC",
        summary: "Bitcoin is the biggest single source of downside swing risk in the demo set.",
        influences: ["High volatility contribution", "Strong impact on 1-day VaR and drawdown"],
        riskFlags: ["Tail risk", "Volatility"],
        confidence: 84,
      },
      {
        ticker: "CBA",
        summary: "CBA is one of the largest ASX positions and adds bank concentration risk.",
        influences: ["Large equity weight", "Contributes to top-3 concentration"],
        riskFlags: ["Concentration"],
        confidence: 79,
      },
    ],
    riskChecks: [
      "Top-3 holdings still account for a large share of total value.",
      "Crypto increases expected shortfall more than it increases diversification quality.",
      "Bullion helps in mixed-shock scenarios but does not fully offset equity drawdowns.",
    ],
    nextActions: [
      "Reduce concentration in the largest listed positions if capital preservation matters.",
      "Review whether the crypto sleeve is sized appropriately relative to overall risk tolerance.",
      "Track new snapshots over time to improve confidence in VaR and drawdown estimates.",
    ],
  };
}

function createDemoPortfolioState(): PortfolioState {
  const importedAt = "2026-03-05T22:00:00.000Z";
  const reportDate = "2026-03-06";
  const holdings: PortfolioHolding[] = [
    {
      id: "demo-super-balanced",
      source: "super",
      account: "AustralianSuper",
      ticker: "SUPBAL",
      name: "Balanced Super Option",
      units: 1,
      price: 112000,
      prevClose: 112000,
      value: 112000,
      costBase: 104500,
      sector: "Super",
      reportDate,
      importedAt,
    },
    {
      id: "demo-asx-cba",
      source: "asx",
      account: "CommSec",
      ticker: "CBA",
      name: "Commonwealth Bank",
      units: 120,
      price: 131.44,
      prevClose: 130.92,
      value: 15772.8,
      costBase: 14820,
      sector: "Banks",
      reportDate,
      importedAt,
    },
    {
      id: "demo-asx-bhp",
      source: "asx",
      account: "CommSec",
      ticker: "BHP",
      name: "BHP Group",
      units: 280,
      price: 45.82,
      prevClose: 45.28,
      value: 12829.6,
      costBase: 11984,
      sector: "Materials",
      reportDate,
      importedAt,
    },
    {
      id: "demo-asx-mqg",
      source: "asx",
      account: "CommSec",
      ticker: "MQG",
      name: "Macquarie Group",
      units: 35,
      price: 218.75,
      prevClose: 215.72,
      value: 7656.25,
      costBase: 7035,
      sector: "Financials",
      reportDate,
      importedAt,
    },
    {
      id: "demo-crypto-btc",
      source: "crypto",
      account: "Kraken",
      ticker: "BTC",
      name: "Bitcoin",
      units: 0.42,
      price: 84200,
      prevClose: 85740,
      value: 35364,
      costBase: 28000,
      sector: "Crypto",
      reportDate,
      importedAt,
    },
    {
      id: "demo-crypto-eth",
      source: "crypto",
      account: "Kraken",
      ticker: "ETH",
      name: "Ethereum",
      units: 7.5,
      price: 3140,
      prevClose: 3121.27,
      value: 23550,
      costBase: 18750,
      sector: "Crypto",
      reportDate,
      importedAt,
    },
    {
      id: "demo-gold",
      source: "gold",
      account: "ABC Bullion",
      ticker: "ABC-AU",
      name: "Allocated Gold Holdings",
      units: 7.8,
      price: 4490,
      prevClose: 4472,
      value: 35022,
      costBase: 31200,
      sector: "Precious Metals",
      reportDate,
      importedAt,
    },
    {
      id: "demo-savings",
      source: "savings",
      account: "Offset Saver",
      ticker: "SAVINGSCASH",
      name: "Savings Cash Position",
      units: 1,
      price: 18450,
      prevClose: 18450,
      value: 18450,
      costBase: 18450,
      sector: "Savings",
      reportDate,
      importedAt,
    },
    {
      id: "demo-index",
      source: "index",
      account: "Vanguard",
      ticker: "VAS",
      name: "Vanguard Australian Shares ETF",
      units: 95,
      price: 104.6,
      prevClose: 103.95,
      value: 9937,
      costBase: 9120,
      sector: "Index",
      reportDate,
      importedAt,
    },
    {
      id: "demo-fund",
      source: "fund",
      account: "Managed Funds",
      ticker: "GGF",
      name: "Global Growth Fund",
      units: 220,
      price: 68.4,
      prevClose: 67.9,
      value: 15048,
      costBase: 13750,
      sector: "Managed Fund",
      reportDate,
      importedAt,
    },
  ];

  const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);

  return {
    holdings,
    snapshots: createDemoSnapshots(totalValue),
    updatedAt: "2026-03-06T06:10:00.000Z",
    lastPriceRefreshAt: "2026-03-06T06:05:00.000Z",
  };
}

function createDemoSnapshots(finalValue: number): PortfolioSnapshot[] {
  const snapshots: PortfolioSnapshot[] = [];
  const days = 92;
  const startMs = Date.UTC(2025, 11, 5, 6, 0, 0);
  let value = finalValue * 0.88;

  for (let index = 0; index < days; index += 1) {
    const drift = finalValue * 0.00075;
    const seasonal = Math.sin(index / 5) * 950 + Math.cos(index / 11) * 620;
    const shock =
      index === 19 ? -4200 :
      index === 43 ? -6100 :
      index === 68 ? 3200 :
      index === 79 ? -2800 :
      0;

    value = Math.max(finalValue * 0.8, value + drift + seasonal + shock);

    if (index === days - 1) {
      value = finalValue;
    }

    snapshots.push({
      date: new Date(startMs + index * 24 * 60 * 60 * 1000).toISOString(),
      value: Number(value.toFixed(2)),
    });
  }

  snapshots.push({
    date: "2026-03-06T14:10:00.000Z",
    value: Number(finalValue.toFixed(2)),
  });

  return snapshots;
}

function buildDemoHistoricalRiskEstimate(
  portfolioState: PortfolioState,
  riskWindow: RiskWindow,
): HistoricalRiskEstimatePayload {
  const fallbackTotalValue = DEMO_PORTFOLIO_STATE.holdings.reduce((sum, holding) => sum + holding.value, 0);
  const totalValue = Math.max(
    portfolioState.holdings.reduce((sum, holding) => sum + (Number.isFinite(holding.value) ? holding.value : 0), 0),
    fallbackTotalValue,
  );
  const marketTickers = Array.from(
    new Set(
      portfolioState.holdings
        .filter((holding) => ["asx", "crypto", "index", "fund", "gold"].includes(holding.source))
        .map((holding) => holding.ticker.trim().toUpperCase())
        .filter((ticker) => ticker.length > 0),
    ),
  );
  const usedTickers = (marketTickers.length > 0 ? marketTickers : ["CBA", "BHP", "MQG", "BTC", "ETH", "VAS"]).slice(0, 6);
  const correlationTickers = (usedTickers.length >= 4 ? usedTickers : ["CBA", "BHP", "MQG", "BTC"]).slice(0, 4);
  const baseMatrix = [
    [1, 0.74, 0.66, 0.24],
    [0.74, 1, 0.59, 0.19],
    [0.66, 0.59, 1, 0.21],
    [0.24, 0.19, 0.21, 1],
  ];
  const profile =
    riskWindow === "1M"
      ? {
          pointsTarget: 22,
          pointsUsed: 22,
          benchmarkPointsUsed: 22,
          volatilityAnnualPct: 16.8,
          maxDrawdownPct: 7.4,
          var95Pct: 1.9,
          cvar95Pct: 2.8,
          betaToBenchmark: 0.84,
          trackingErrorAnnualPct: 5.6,
          correlationToBenchmark: 0.72,
          cornishFisherVar95Pct: 2.1,
          rsi14: 57.8,
          stochastic14: 61.4,
          obvValue: 1_840_000,
          obvTrend: "Accumulation bias",
          regime: { vix: 15.9, label: "Risk-On", cssClass: "purple" },
          factorExposure: { marketBeta: 0.84, sizeBeta: -0.12 },
          sharpeRatioAnnual: 0.74,
          sortinoRatioAnnual: 1.02,
          returnSkewness: -0.28,
        }
      : riskWindow === "1Y"
        ? {
            pointsTarget: 252,
            pointsUsed: 118,
            benchmarkPointsUsed: 118,
            volatilityAnnualPct: 21.2,
            maxDrawdownPct: 14.9,
            var95Pct: 2.9,
            cvar95Pct: 4.1,
            betaToBenchmark: 0.97,
            trackingErrorAnnualPct: 8.8,
            correlationToBenchmark: 0.79,
            cornishFisherVar95Pct: 3.2,
            rsi14: 56.2,
            stochastic14: 58.9,
            obvValue: 2_670_000,
            obvTrend: "Steady accumulation",
            regime: { vix: 19.6, label: "Watchful", cssClass: "danger" },
            factorExposure: { marketBeta: 0.97, sizeBeta: -0.05 },
            sharpeRatioAnnual: 0.41,
            sortinoRatioAnnual: 0.58,
            returnSkewness: -0.67,
          }
        : {
            pointsTarget: 63,
            pointsUsed: 63,
            benchmarkPointsUsed: 63,
            volatilityAnnualPct: 18.6,
            maxDrawdownPct: 10.8,
            var95Pct: 2.4,
            cvar95Pct: 3.5,
            betaToBenchmark: 0.91,
            trackingErrorAnnualPct: 7.4,
            correlationToBenchmark: 0.76,
            cornishFisherVar95Pct: 2.7,
            rsi14: 59.6,
            stochastic14: 64.8,
            obvValue: 2_310_000,
            obvTrend: "Positive participation",
            regime: { vix: 17.8, label: "Balanced", cssClass: "purple" },
            factorExposure: { marketBeta: 0.91, sizeBeta: -0.08 },
            sharpeRatioAnnual: 0.58,
            sortinoRatioAnnual: 0.81,
            returnSkewness: -0.44,
          };

  const var95Amount = Number(((profile.var95Pct / 100) * totalValue).toFixed(2));
  const cvar95Amount = Number(((profile.cvar95Pct / 100) * totalValue).toFixed(2));
  const cornishFisherVar95Amount = Number(((profile.cornishFisherVar95Pct / 100) * totalValue).toFixed(2));

  return {
    source: "yahoo_estimate",
    lessAccurateThanSnapshots: true,
    note: "Demo showcase values seed the benchmark, factor, and regime analytics so every risk card is populated.",
    benchmarkSymbol: "^AXJO",
    benchmarkName: "S&P/ASX 200",
    riskWindow,
    pointsTarget: profile.pointsTarget,
    pointsUsed: profile.pointsUsed,
    returnsCount: profile.pointsUsed,
    benchmarkPointsUsed: profile.benchmarkPointsUsed,
    usedTickers,
    failedTickers: [],
    volatilityAnnualPct: profile.volatilityAnnualPct,
    maxDrawdownPct: profile.maxDrawdownPct,
    var95Pct: profile.var95Pct,
    var95Amount,
    cvar95Pct: profile.cvar95Pct,
    cvar95Amount,
    betaToBenchmark: profile.betaToBenchmark,
    trackingErrorAnnualPct: profile.trackingErrorAnnualPct,
    correlationToBenchmark: profile.correlationToBenchmark,
    outlierReturnsRemoved: 0,
    cornishFisherVar95Pct: profile.cornishFisherVar95Pct,
    cornishFisherVar95Amount,
    rsi14: profile.rsi14,
    stochastic14: profile.stochastic14,
    obvValue: profile.obvValue,
    obvTrend: profile.obvTrend,
    correlationMatrix: {
      tickers: correlationTickers,
      matrix: correlationTickers.map((_, rowIndex) =>
        correlationTickers.map((_, columnIndex) => baseMatrix[rowIndex]?.[columnIndex] ?? (rowIndex === columnIndex ? 1 : 0.35)),
      ),
    },
    regime: profile.regime,
    factorExposure: profile.factorExposure,
    sharpeRatioAnnual: profile.sharpeRatioAnnual,
    sortinoRatioAnnual: profile.sortinoRatioAnnual,
    returnSkewness: profile.returnSkewness,
  };
}

function superTemplateCsv(): string {
  return [
    "account,ticker,name,units,price,value,cost base,sector,date",
    "Hostplus Super,CBA,Commonwealth Bank,80,146.2,11696,10200,Banks,2026-02-18",
    "Hostplus Super,BHP,BHP Group,120,45.1,5412,4900,Materials,2026-02-18",
  ].join("\n");
}

function asxTemplateCsv(): string {
  return [
    "account,ticker,name,units,price,value,cost base,sector,date",
    "SelfWealth,IVV,ISHARES S&P 500 ETF,40,58.4,2336,2100,ETF,2026-02-18",
    "SelfWealth,WOW,Woolworths Group,35,34.7,1214.5,1180,Consumer Staples,2026-02-18",
  ].join("\n");
}

function indexTemplateCsv(): string {
  return [
    "account,ticker,name,units,price,value,cost base,sector,date",
    "Benchmark Account,SPX,S&P 500 Index Proxy,10,620.4,6204,5900,Index,2026-02-18",
    "Benchmark Account,NDQ,NASDAQ 100 Proxy,12,520.1,6241.2,6000,Index,2026-02-18",
  ].join("\n");
}

function fundTemplateCsv(): string {
  return [
    "account,ticker,name,units,price,value,cost base,sector,date",
    "Managed Funds,VTSAX,Vanguard Total Stock Market Index Fund,35,152.6,5341,5000,Mutual Fund,2026-02-18",
    "Managed Funds,VBMFX,Vanguard Total Bond Market Index Fund,40,11.1,444,420,Mutual Fund,2026-02-18",
  ].join("\n");
}

function cryptoTemplateCsv(): string {
  return [
    "account,ticker,name,units,price,value,cost base,sector,date",
    "Binance Wallet,BTC,Bitcoin,0.1500,97250,14587.5,13200,Crypto,2026-02-18",
    "Coinbase,ETH,Ethereum,1.8000,5320,9576,8400,Crypto,2026-02-18",
  ].join("\n");
}

function savingsTemplateCsv(): string {
  return [
    "date,description,amount,balance,account",
    "2026-03-01,Salary Deposit,2500,17240.55,Savings Account",
    "2026-03-03,Rent Payment,-680,16560.55,Savings Account",
  ].join("\n");
}

function taxTemplateCsv(): string {
  return [
    "date,transaction type,transaction subcategory,description payer details,amount",
    "2026-03-01,Tax,PAYG,Withholding Tax,-1250.45",
    "2026-03-04,Tax,Refund,ATO Tax Refund,340.1",
  ].join("\n");
}

function goldTemplateCsv(): string {
  return [
    "account,ticker,name,units,price,value,cost base,sector,date",
    "ABC Bullion,ABC1,1oz Gold Cast Bar,2,4980,9960,9400,Precious Metals,2026-02-18",
    "ABC Bullion,ABC2,100g Gold Minted Bar,3.215,4980,16010.7,15050,Precious Metals,2026-02-18",
    "ABC Bullion,ABC-AG,1kg Silver Cast Bar,32.151,58,1864.76,1715,Precious Metals,2026-02-18",
  ].join("\n");
}
