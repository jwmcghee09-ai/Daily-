"use client";

import Image from "next/image";
import { CSSProperties, ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa, { ParseError } from "papaparse";
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
}

interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  planTier: "none" | "starter" | "pro";
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
  planTier: "none" | "starter" | "pro";
  proEnabled: boolean;
  availableTickers: string[];
}

type CheckoutPlan = "starter" | "pro";

interface PendingRegistrationDraft {
  email: string;
  password: string;
  displayName: string;
  acceptsTerms: boolean;
  createdAt: number;
}

const PENDING_REGISTRATION_KEY = "spectre.pending-registration.v1";
const PENDING_REGISTRATION_MAX_AGE_MS = 30 * 60 * 1000;

export default function Home() {
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
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authAcceptsTerms, setAuthAcceptsTerms] = useState(false);
  const [authWorking, setAuthWorking] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checkoutWorking, setCheckoutWorking] = useState(false);
  const [dipAlerts, setDipAlerts] = useState<PriceDipAlertSetting[]>([]);
  const [availableDipTickers, setAvailableDipTickers] = useState<string[]>([]);
  const [dipAlertMax, setDipAlertMax] = useState(0);
  const [dipAlertTicker, setDipAlertTicker] = useState("");
  const [dipAlertThreshold, setDipAlertThreshold] = useState("3");
  const [dipAlertSaving, setDipAlertSaving] = useState(false);
  const refreshInFlight = useRef(false);
  const lastAutoRefreshAttemptAtRef = useRef(0);

  const completePendingRegistrationAfterCheckout = useCallback(async () => {
    const draft = readPendingRegistrationDraft();
    if (!draft) {
      return;
    }

    setAuthMode("register");
    setAuthEmail(draft.email);
    setAuthDisplayName(draft.displayName);
    setAuthAcceptsTerms(draft.acceptsTerms);
    setAuthWorking(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: draft.email,
          password: draft.password,
          displayName: draft.displayName,
          acceptsTerms: draft.acceptsTerms,
        }),
      });

      if (!response.ok) {
        const errorMessage = await parseApiError(response, "Failed to create account after checkout.");
        if (response.status === 402) {
          setAuthError("Payment is still syncing. Wait a few seconds, then click Create Account & Checkout again.");
          return;
        }
        throw new Error(errorMessage);
      }

      const payload = (await response.json()) as AuthSessionPayload;
      if (payload.verificationRequired && !payload.authenticated) {
        clearPendingRegistrationDraft();
        setAuthMode("login");
        setAuthPassword("");
        setAuthAcceptsTerms(false);
        setAuthError("");
        setBanner({ type: "info", message: payload.message || "Account created. Check your email to verify before signing in." });
        return;
      }

      if (!payload.authenticated || !payload.user) {
        throw new Error("Authentication failed.");
      }

      clearPendingRegistrationDraft();
      setSessionUser(normalizeSessionUser(payload.user));
      setAuthPassword("");
      setAuthAcceptsTerms(false);
      setAuthError("");
      setBanner({ type: "success", message: "Subscription confirmed. Account created and signed in." });

      const portfolioResponse = await fetch("/api/portfolio", { cache: "no-store" });
      if (portfolioResponse.ok) {
        const payloadState = (await portfolioResponse.json()) as PortfolioState;
        setState(payloadState);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to complete signup.");
    } finally {
      setAuthWorking(false);
    }
  }, []);

  useEffect(() => {
    const loadSessionAndState = async () => {
      setLoading(true);

      try {
        const sessionResponse = await fetch("/api/auth/session", { cache: "no-store" });
        if (!sessionResponse.ok) {
          throw new Error("Failed to load account session.");
        }

        const sessionPayload = (await sessionResponse.json()) as AuthSessionPayload;

        if (!sessionPayload.authenticated || !sessionPayload.user) {
          setSessionUser(null);
          setState(EMPTY_STATE);
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
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get("checkout");
    const checkoutPlan = toCheckoutPlan(params.get("plan"));
    const verifiedState = params.get("verified");

    if (checkoutState === "success") {
      const planLabel = checkoutPlan === "pro" ? "Pro" : "Starter";
      setBanner({ type: "success", message: `${planLabel} plan checkout complete. Your subscription will activate shortly.` });
      void completePendingRegistrationAfterCheckout();
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
  }, [completePendingRegistrationAfterCheckout]);

  const refreshPrices = useCallback(async (showBanner: boolean) => {
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
  }, [sessionUser]);

  const loadDipAlerts = useCallback(async () => {
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
  }, [sessionUser]);

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
  }, [dipAlertThreshold, dipAlertTicker, loadDipAlerts, sessionUser]);

  const toggleDipAlert = useCallback(async (alert: PriceDipAlertSetting, enabled: boolean) => {
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
  }, [loadDipAlerts]);

  const deleteDipAlert = useCallback(async (ticker: string) => {
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
  }, [loadDipAlerts]);

  useEffect(() => {
    if (!sessionUser || loading) {
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
  }, [loading, refreshPrices, sessionUser]);

  useEffect(() => {
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
  }, [loadDipAlerts, sessionUser, state.updatedAt]);

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
    if (!sessionUser || loading) {
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
  }, [loading, needsYahooEstimate, riskWindow, sessionUser, state.updatedAt]);

  const effectiveVolatilityAnnualPct = metrics.volatilityAnnualPct ?? historicalRiskEstimate?.volatilityAnnualPct ?? null;
  const effectiveVar95Pct = metrics.var95Pct ?? historicalRiskEstimate?.var95Pct ?? null;
  const effectiveVar95Amount = metrics.var95Amount ?? historicalRiskEstimate?.var95Amount ?? null;
  const effectiveCvar95Pct = metrics.cvar95Pct ?? historicalRiskEstimate?.cvar95Pct ?? null;
  const effectiveCvar95Amount = metrics.cvar95Amount ?? historicalRiskEstimate?.cvar95Amount ?? null;
  const effectiveMaxDrawdownPct = metrics.maxDrawdownPct ?? historicalRiskEstimate?.maxDrawdownPct ?? null;
  const benchmarkBeta = historicalRiskEstimate?.betaToBenchmark ?? null;
  const benchmarkTrackingErrorAnnualPct = historicalRiskEstimate?.trackingErrorAnnualPct ?? null;
  const proAnalyticsEnabled = sessionUser?.proEnabled === true;
  const starterPlan = !proAnalyticsEnabled;
  const dipAlertSlotsRemaining = Math.max(0, dipAlertMax - dipAlerts.length);
  const dipAlertPlanMessage = proAnalyticsEnabled
    ? `Pro plan: up to ${dipAlertMax} active dip alerts.`
    : `Starter plan: up to ${dipAlertMax} active dip alerts. Upgrade to Pro for more coverage.`;
  const usingYahooFallback = metrics.var95Amount == null && historicalRiskEstimate != null;
  const riskReturnsUsed = usingYahooFallback ? (historicalRiskEstimate?.returnsCount ?? 0) : metrics.dailyReturns.length;

  const portfolioRiskScore = useMemo(() => {
    if (state.holdings.length === 0 || metrics.totalValue <= 0) {
      return null;
    }

    const volatilityPenalty = normalizePenalty(effectiveVolatilityAnnualPct, 8, 30) * 30;
    const varPenalty = normalizePenalty(effectiveVar95Pct, 0.7, 3.2) * 22;
    const drawdownPenalty = normalizePenalty(effectiveMaxDrawdownPct, 6, 25) * 20;
    const concentrationPenalty = normalizePenalty(metrics.top3ConcentrationPct, 30, 75) * 16;
    const accountPenalty = normalizePenalty(metrics.largestAccountPct, 45, 85) * 12;
    const confidencePenalty = (1 - clamp(riskReturnsUsed / 63, 0, 1)) * 12;
    const totalPenalty = volatilityPenalty + varPenalty + drawdownPenalty + concentrationPenalty + accountPenalty + confidencePenalty;
    const score = Math.round(clamp(100 - totalPenalty, 1, 99));

    const label = score >= 75 ? "Controlled" : score >= 55 ? "Moderate" : "Elevated";
    const confidence = riskReturnsUsed >= 63 ? "High" : riskReturnsUsed >= 20 ? "Medium" : "Low";

    return {
      score,
      label,
      confidence,
      returnsUsed: riskReturnsUsed,
    };
  }, [effectiveMaxDrawdownPct, effectiveVar95Pct, effectiveVolatilityAnnualPct, metrics.largestAccountPct, metrics.top3ConcentrationPct, metrics.totalValue, riskReturnsUsed, state.holdings.length]);

  const portfolioRiskScoreTone = portfolioRiskScore == null
    ? "neutral"
    : portfolioRiskScore.score >= 75
      ? "positive"
      : portfolioRiskScore.score >= 55
        ? "neutral"
        : "negative";

  const todayMovers = useMemo<TodayMover[]>(() => {
    const grouped = new Map<string, { changeAmount: number; previousValue: number; currentValue: number }>();

    for (const holding of state.holdings) {
      if (holding.source !== "asx") {
        continue;
      }

      const quantity = resolveHoldingUnits(holding.units, holding.value, holding.price);
      if (quantity <= 0 || !Number.isFinite(holding.price) || !Number.isFinite(holding.prevClose) || holding.price <= 0 || holding.prevClose <= 0) {
        continue;
      }

      const previousValue = quantity * holding.prevClose;
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

  const todaySnapshotSeries = useMemo(() => {
    const todaySydney = toSydneyDateKey(new Date());

    return state.snapshots
      .map((snapshot) => ({ date: new Date(snapshot.date), value: snapshot.value }))
      .filter(
        (snapshot) =>
          !Number.isNaN(snapshot.date.getTime()) &&
          Number.isFinite(snapshot.value) &&
          snapshot.value >= 0 &&
          toSydneyDateKey(snapshot.date) === todaySydney,
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [state.snapshots]);

  const todayBaselineValue = todaySnapshotSeries.length > 0 ? todaySnapshotSeries[0].value : metrics.totalValue;
  const todayPortfolioChangeAmount = metrics.totalValue - todayBaselineValue;
  const todayPortfolioChangePct = todayBaselineValue > 0 ? (todayPortfolioChangeAmount / todayBaselineValue) * 100 : null;
  const asxSessionOpenNow = isAsxRegularSessionOpenNow();
  const asxSessionDataFreshNow = isAsxSessionDataFreshNow(state.lastPriceRefreshAt);
  const showTodaySessionChange = asxSessionOpenNow && asxSessionDataFreshNow;
  const portfolioChangeLabel = "Today Change";
  const moverPeriodLabel = showTodaySessionChange ? "Today" : "Latest Session";
  const todayTopGainer = todayMovers.length > 0 ? todayMovers[0] : null;
  const todayTopLoser = todayMovers.length > 0 ? todayMovers[todayMovers.length - 1] : null;

  const dataQualityRows = useMemo(() => {
    const asxHoldings = state.holdings.filter((holding) => holding.source === "asx");
    const asxTickers = new Set(asxHoldings.map((holding) => holding.ticker.toUpperCase()));
    const pricedTickers = new Set(
      asxHoldings
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
        label: "ASX tickers with live pricing",
        value: String(pricedTickers.size) + "/" + String(asxTickers.size),
        status: asxTickers.size === 0 || pricedTickers.size === asxTickers.size ? "good" : "warn",
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
        toRiskFlag(
          "Largest account share",
          metrics.largestAccountPct,
          55,
          75,
          "%",
          "(Largest account value / total portfolio value) x 100.",
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

    return flags.filter((flag) => flag.value !== "N/A");
  }, [benchmarkBeta, benchmarkTrackingErrorAnnualPct, effectiveCvar95Pct, effectiveMaxDrawdownPct, effectiveVar95Pct, effectiveVolatilityAnnualPct, metrics.hhi, metrics.largestAccountPct, metrics.top3ConcentrationPct, starterPlan]);

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
    const asxValue = state.holdings.filter((holding) => holding.source === "asx").reduce((acc, holding) => acc + holding.value, 0);
    const indexValue = state.holdings.filter((holding) => holding.source === "index").reduce((acc, holding) => acc + holding.value, 0);
    const fundValue = state.holdings.filter((holding) => holding.source === "fund").reduce((acc, holding) => acc + holding.value, 0);
    const bullionValue = state.holdings.filter((holding) => holding.source === "gold").reduce((acc, holding) => acc + holding.value, 0);

    const raw = [
      { name: "Super", value: superValue },
      { name: "ASX Shares", value: asxValue },
      { name: "Indices", value: indexValue },
      { name: "Mutual Funds", value: fundValue },
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
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setWorking(true);

    try {
      const csvText = await file.text();
      const cleanCsvText = extractCsvDataSection(csvText);
      const parsed = Papa.parse<CsvRow>(cleanCsvText, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (header) => header.trim(),
      });

      const holdings = parseRowsToHoldings(parsed.data, source);

      if (holdings.length === 0) {
        setBanner({
          type: "error",
          message: "No valid holdings were found. Check that your CSV includes value/price/units (or weight) columns.",
        });
        event.target.value = "";
        return;
      }

      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source, holdings }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to save imported report."));
      }

      const persistedState = (await response.json()) as PortfolioState;
      setState(persistedState);

      const warningText = getUserVisibleCsvWarning(parsed.errors);
      setBanner({
        type: "success",
        message: `${holdings.length} ${source.toUpperCase()} holdings loaded from ${file.name} and saved to SQLite.${warningText}`,
      });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Upload failed." });
    } finally {
      event.target.value = "";
      setWorking(false);
    }
  };

  const clearData = async () => {
    if (!window.confirm("Delete all imported holdings and snapshots?")) {
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
      setBanner({ type: "info", message: "Portfolio data cleared from SQLite." });
    } catch (error) {
      setBanner({ type: "error", message: error instanceof Error ? error.message : "Failed to clear data." });
    } finally {
      setWorking(false);
    }
  };

  const startCheckout = async (plan: CheckoutPlan, guestEmail?: string) => {
    let checkoutEmail = sessionUser?.email || "";
    const planLabel = plan === "pro" ? "Pro" : "Starter";

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
  };

  const startStarterCheckout = async (guestEmail?: string) => {
    await startCheckout("starter", guestEmail);
  };

  const startProCheckout = async (guestEmail?: string) => {
    await startCheckout("pro", guestEmail);
  };

  const submitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (authMode === "register" && !authAcceptsTerms) {
      setAuthError("You must agree to the Terms & Conditions to create an account.");
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
        if (authMode === "register" && response.status === 402) {
          writePendingRegistrationDraft({
            email: authEmail.trim().toLowerCase(),
            password: authPassword,
            displayName: authDisplayName.trim(),
            acceptsTerms: authAcceptsTerms,
            createdAt: Date.now(),
          });
          setAuthError("");
          setBanner({ type: "info", message: "Payment required. Redirecting to Stripe checkout..." });
          await startStarterCheckout(authEmail);
          return;
        }

        throw new Error(await parseApiError(response, "Authentication failed."));
      }

      const payload = (await response.json()) as AuthSessionPayload;

      if (authMode === "register" && payload.verificationRequired && !payload.authenticated) {
        clearPendingRegistrationDraft();
        setAuthMode("login");
        setAuthPassword("");
        setAuthAcceptsTerms(false);
        setAuthError("");
        setBanner({ type: "info", message: payload.message || "Account created. Check your email to verify before signing in." });
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

  if (!sessionUser) {
    return (
      <div className="landing-shell">
        <div className="landing-gridlines" aria-hidden="true" />
        <header className="landing-nav">
          <a href="#top" className="landing-logo" aria-label="SPECTRE home">
            <Image src="/spectre-wordmark-banner.svg" alt="SPECTRE" width={344} height={82} className="landing-logo-image" priority />
          </a>
          <nav className="landing-nav-links">
            <a href="#features">Capabilities</a>
            <a href="#insights">Preview</a>
            <a href="#workflow">Workflow</a>
            <a href="#safety">Data Safety</a>
            <a href="#pricing">Pricing</a>
            <a href="#access">Client Access</a>
          </nav>
          <a href="#access" className="landing-nav-button">Sign In</a>
        </header>

        <main className="landing-main">
          <section id="top" className="landing-hero">
            <div className="landing-hero-copy">
              <p className="landing-kicker">System for Portfolio Exposure, Correlation, Threat &amp; Risk Evaluation</p>
              <h1>Monitor exposure and risk in one private workspace.</h1>
              <p className="landing-hero-text">
                SPECTRE turns CSV exports from super, ASX, index funds, mutual funds, and bullion into one clear risk view so you can act with confidence.
              </p>
              <div className="landing-hero-actions">
                <a href="#access" className="landing-btn landing-btn-primary">Start For $3/Month</a>
                <a href="#insights" className="landing-btn landing-btn-ghost">See Live Dashboard Preview</a>
              </div>
              <div className="landing-hero-stats">
                <article>
                  <strong>3-Step Workflow</strong>
                  <span>Upload CSV, normalize holdings, then review risk score and exposure metrics.</span>
                </article>
                <article>
                  <strong>SPECTRE Framework</strong>
                  <span>System for Portfolio Exposure, Correlation, Threat & Risk Evaluation.</span>
                </article>
                <article>
                  <strong>Security Controls</strong>
                  <span>Email verification, hashed passwords, encrypted backups, and hardened headers.</span>
                </article>
              </div>
            </div>

            <aside className="landing-hero-panel" aria-label="Platform highlights">
              <p className="landing-panel-kicker">SPECTRE OPS</p>
              <h2>From CSV to risk clarity</h2>
              <ul>
                <li>
                  <span>01</span>
                  <p>Import super, ASX, index, mutual fund, and bullion CSV exports.</p>
                </li>
                <li>
                  <span>02</span>
                  <p>SPECTRE normalizes holdings by account, source, and sector in one workspace.</p>
                </li>
                <li>
                  <span>03</span>
                  <p>Review risk score, concentration, VaR, drawdown, and scenario stress outcomes.</p>
                </li>
              </ul>
            </aside>
          </section>

          <section className="landing-proof-strip" aria-label="Current product capabilities">
            <article>
              <strong>Example Risk Score: {LANDING_SAMPLE_RISK_SCORE}/100</strong>
              <span>Sample portfolio score after CSV import and risk normalization.</span>
            </article>
            <article>
              <strong>Before: &quot;Looks diversified&quot;</strong>
              <span>Investor sees many line items across multiple statements.</span>
            </article>
            <article>
              <strong>After: Top-3 = 42% Exposure</strong>
              <span>SPECTRE surfaces hidden concentration and downside sensitivity.</span>
            </article>
            <article>
              <strong>Email Dip Alert Automation</strong>
              <span>Get notified when tracked holdings fall past your chosen percentage threshold.</span>
            </article>
            <article>
              <strong>Built for ASX + SMSF workflows</strong>
              <span>Purpose-built for Australian investors managing multi-source portfolios.</span>
            </article>
          </section>

          <section id="features" className="landing-feature-grid">
            <article>
              <p>ASX + Super Imports</p>
              <h3>Ingest brokerage, superannuation, index, fund, and bullion exports in one workflow.</h3>
            </article>
            <article>
              <p>Risk Score + Dashboard</p>
              <h3>Track one clear risk score alongside VaR95, drawdown, volatility, and concentration.</h3>
            </article>
            <article>
              <p>Session Movers</p>
              <h3>Surface ASX top movers and trigger dip alert emails using refreshed market prices.</h3>
            </article>
            <article>
              <p>Snapshot Audit Trail</p>
              <h3>Review portfolio trend history and data quality signals over time.</h3>
            </article>
          </section>

          <section id="insights" className="landing-analytics">
            <div className="landing-analytics-head">
              <p className="landing-kicker">Feature Preview</p>
              <h2>Concrete dashboard visuals, not abstract promises.</h2>
              <p>These demo values show the exact dashboard style. Your real data loads from your own imported portfolio exports.</p>
            </div>
            <div className="landing-analytics-grid">
              <article className="landing-chart-card landing-score-preview">
                <h3>Example Portfolio Risk Score</h3>
                <p className="landing-score-value">{LANDING_SAMPLE_RISK_SCORE}<span>/100</span></p>
                <p className="landing-score-caption">Moderate risk profile based on concentration, VaR, drawdown, volatility, and data quality confidence.</p>
              </article>

              <article className="landing-chart-card">
                <h3>Example Portfolio Snapshot Trend</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={LANDING_PREVIEW_SERIES}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#292b35" />
                    <XAxis dataKey="month" stroke="#9fa3b2" />
                    <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} stroke="#9fa3b2" />
                    <Tooltip formatter={tooltipFormatter} contentStyle={LANDING_TOOLTIP_CONTENT_STYLE} labelStyle={LANDING_TOOLTIP_LABEL_STYLE} itemStyle={LANDING_TOOLTIP_ITEM_STYLE} />
                    <Legend />
                    <Line type="monotone" dataKey="portfolio" name="Portfolio value" stroke="#ff4b33" strokeWidth={2.6} dot={false} />
                    <Line type="monotone" dataKey="buffer" name="Risk buffer reference" stroke="#7a7f90" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </article>

              <article className="landing-chart-card">
                <h3>Example Risk Signal Levels</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={LANDING_METRIC_SERIES}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#292b35" />
                    <XAxis dataKey="metric" stroke="#9fa3b2" />
                    <YAxis tickFormatter={(value) => `${value}%`} stroke="#9fa3b2" />
                    <Tooltip
                      formatter={(value) => {
                        const numeric = Number(Array.isArray(value) ? value[0] : value);
                        return Number.isFinite(numeric) ? `${numeric.toFixed(1)}%` : String(value ?? "");
                      }}
                      contentStyle={LANDING_TOOLTIP_CONTENT_STYLE}
                      labelStyle={LANDING_TOOLTIP_LABEL_STYLE}
                      itemStyle={LANDING_TOOLTIP_ITEM_STYLE}
                    />
                    <Bar dataKey="value" name="Metric level" fill="#ff4b33" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </article>

              <article className="landing-chart-card">
                <h3>Example Allocation Breakdown</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={LANDING_ALLOCATION_SERIES} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={96}>
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
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </article>
            </div>
          </section>

          <section id="workflow" className="landing-workflow">
            <div className="landing-workflow-copy">
              <p className="landing-kicker">How It Works</p>
              <h2>One clear 3-step path from files to risk decisions.</h2>
              <p>
                Start with existing statements, centralize exposure in SPECTRE, then monitor risk signals from one private dashboard.
              </p>
            </div>
            <div className="landing-steps">
              <article>
                <span>01</span>
                <div>
                  <h3>Import Reports</h3>
                  <p>Upload super, ASX, index, mutual fund, and bullion files directly into SPECTRE.</p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <h3>Normalize Exposure</h3>
                  <p>Aggregate positions by source, account, sector, and instrument in one structure.</p>
                </div>
              </article>
              <article>
                <span>03</span>
                <div>
                  <h3>Act On Risk Signals</h3>
                  <p>Use risk score, drawdown, VaR, concentration metrics, and dip alert emails to monitor risk posture.</p>
                </div>
              </article>
            </div>
          </section>

          <section id="safety" className="landing-safety">
            <div className="landing-safety-head">
              <p className="landing-kicker">Data Safety</p>
              <h2>Plain-English security and privacy controls.</h2>
              <p>These safeguards reflect controls active in the current release.</p>
            </div>
            <div className="landing-safety-grid">
              <article>
                <h3>Privacy promise</h3>
                <p><strong>We do not sell your data.</strong> Portfolio uploads are used only to generate your analytics workspace.</p>
              </article>
              <article>
                <h3>Data control and deletion</h3>
                <p>You can clear imported holdings and snapshots anytime from the dashboard using Clear Data.</p>
              </article>
              <article>
                <h3>Account and payment security</h3>
                <p>Email verification, scrypt password hashing, secure cookies, and Stripe-hosted checkout are enabled in production.</p>
              </article>
              <article>
                <h3>Hosting and hardening</h3>
                <p>Production runs over HTTPS with CSP/HSTS/anti-framing headers, plus encrypted backups and restore checks.</p>
              </article>
            </div>
            <p className="landing-safety-note">No platform can guarantee zero risk. Use strong passwords and keep deployment secrets protected.</p>
          </section>

          <section id="pricing" className="landing-pricing">
            <div className="landing-pricing-head">
              <p className="landing-kicker">Pricing</p>
              <h2>Simple pricing, low barrier to start.</h2>
            </div>
            <div className="landing-pricing-grid landing-pricing-centered">
              <article className="landing-plan landing-plan-starter landing-plan-highlight">
                <p className="landing-plan-tier">Starter</p>
                <h3>$3<span>/month</span></h3>
                <p className="landing-plan-subtitle">Live now</p>
                <ul>
                  <li>One private investor workspace</li>
                  <li>CSV import for super, ASX, index, funds, and bullion</li>
                  <li>Risk score, dashboard charts, and snapshots</li>
                  <li>Email verification and password reset</li>
                </ul>
                <button
                  type="button"
                  onClick={() => void startStarterCheckout(authEmail)}
                  className="landing-btn landing-btn-primary"
                  disabled={checkoutWorking}
                >
                  {checkoutWorking ? "Redirecting..." : "Get Starter"}
                </button>
              </article>

              <article className="landing-plan landing-plan-pro">
                <p className="landing-plan-tier">Pro</p>
                <h3>$15<span>/month</span></h3>
                <p className="landing-plan-subtitle">Advanced quant analytics</p>
                <ul>
                  <li>Everything in Starter</li>
                  <li>Expected Shortfall (ES 95) tail risk</li>
                  <li>Beta and tracking error vs ASX 200</li>
                  <li>Date-aligned benchmark analytics</li>
                  <li>Advanced reporting and team workflows</li>
                </ul>
                <button
                  type="button"
                  onClick={() => void startProCheckout(authEmail)}
                  className="landing-btn landing-btn-ghost"
                  disabled={checkoutWorking}
                >
                  {checkoutWorking ? "Redirecting..." : "Get Pro"}
                </button>
              </article>
            </div>
            <p className="landing-pricing-note">Pro analytics unlock automatically when your subscription uses the Pro Stripe price.</p>
          </section>

          <section id="access" className="landing-access">
            <article className="landing-access-copy">
              <p className="landing-kicker">Client Access</p>
              <h2>Enter your private SPECTRE workspace.</h2>
              <p>
                Sign in to continue from your last snapshot, or create your account with Stripe checkout in one flow. System for Portfolio Exposure, Correlation, Threat & Risk Evaluation.
              </p>
              <div className="landing-proof">
                <p>Designed for active DIY investors who want pro-style risk visibility.</p>
                <p>Single interface for holdings, exposure, and risk posture.</p>
              </div>
            </article>

            <article className="auth-login-card landing-auth-card">
              <h2>{authMode === "register" ? "Create Account" : "Sign In"}</h2>
              <p>Access your private SPECTRE workspace.</p>

              {banner ? <div className={"banner " + banner.type}>{banner.message}</div> : null}
              <div className="auth-actions">
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => void startProCheckout(authEmail)}
                  disabled={authWorking || checkoutWorking}
                >
                  {checkoutWorking ? "Redirecting..." : "Start Pro Checkout ($15/mo)"}
                </button>
              </div>

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
                  <input
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    required
                    minLength={8}
                    autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  />
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
                        I agree to the Terms & Conditions and understand SPECTRE provides informational analytics only, not financial advice.
                      </span>
                    </label>
                  </>
                ) : null}

                <button type="submit" className="refresh-btn auth-submit" disabled={authWorking}>
                  {authWorking ? "Please wait..." : authMode === "register" ? "Create Account & Checkout" : "Sign In"}
                </button>
              </form>

              <div className="auth-actions">
                <button
                  type="button"
                  className="template-btn"
                  onClick={() => {
                    setAuthMode((current) => (current === "register" ? "login" : "register"));
                    setAuthAcceptsTerms(false);
                    setAuthError("");
                  }}
                  disabled={authWorking}
                >
                  {authMode === "register" ? "Use Sign In" : "Use Register"}
                </button>
                <button type="button" className="template-btn" onClick={() => void resendVerificationEmail()} disabled={authWorking}>
                  Resend Verification
                </button>
                <button type="button" className="template-btn" onClick={() => void requestPasswordReset()} disabled={authWorking}>
                  Forgot Password
                </button>
                <button type="button" className="template-btn" onClick={() => void completePasswordReset()} disabled={authWorking}>
                  Reset With Token
                </button>
              </div>
            </article>
          </section>
        </main>

        <footer className="landing-footer">
          <p className="footer-disclaimer">Disclaimer: SPECTRE provides informational analytics only. It is not financial, investment, tax, or legal advice, and no result is guaranteed to be complete, current, or accurate.</p>
          <p className="footer-disclaimer">Use at your own risk. Always verify pricing, corporate actions, and holdings with official statements before making decisions. If this app is deployed online, database access and backups are your responsibility.</p>
          <p className="footer-contact">Contact us: <a href={`mailto:${ADMIN_CONTACT_EMAIL}`}>{ADMIN_CONTACT_EMAIL}</a></p>
          <p className="footer-legal">T&C apply. Copyright 2026 SPECTRE.</p>
        </footer>
      </div>
    );
  }
  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-copy">
          <h1><Image src="/spectre-wordmark-plain.svg" alt="SPECTRE" width={620} height={148} className="hero-wordmark-image" priority /></h1>
          <p className="hero-tagline">System for Portfolio Exposure, Correlation, Threat & Risk Evaluation</p>
          <p className="hero-description">Upload super, ASX, index, mutual fund, and ABC Bullion CSV reports to track exposure, concentration, and downside risk in one private workspace.</p>
        </div>
        <div className="meta">
          <span className="meta-item">Account: {sessionUser.displayName} ({sessionUser.email})</span>
          <span className="meta-item">
            Plan:
            {" "}
            <span className={`plan-chip ${sessionUser.proEnabled ? "pro" : "starter"}`}>
              {sessionUser.proEnabled ? "PRO ACTIVE" : sessionUser.planTier.toUpperCase()}
            </span>
          </span>
          <span className="meta-item">Holdings: {state.holdings.length}</span>
          <span className="meta-item">Latest report: {latestReportDate || "N/A"}</span>
          <span className="meta-item">Last saved: {state.updatedAt ? new Date(state.updatedAt).toLocaleString("en-AU") : "N/A"}</span>
          <span className="meta-item">Live prices: {state.lastPriceRefreshAt ? new Date(state.lastPriceRefreshAt).toLocaleString("en-AU") : "Not refreshed yet"}</span>
          <div className="meta-actions">
            <button type="button" onClick={() => void refreshPrices(true)} className="refresh-btn" disabled={loading || working || refreshingPrices}>
              {refreshingPrices ? "Refreshing..." : "Refresh Prices"}
            </button>
            <button type="button" onClick={clearData} className="clear-btn" disabled={working || refreshingPrices || checkoutWorking}>
              {working ? "Working..." : "Clear Data"}
            </button>
            <button type="button" onClick={logout} className="clear-btn" disabled={working || refreshingPrices || checkoutWorking}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {banner ? <div className={`banner ${banner.type}`}>{banner.message}</div> : null}

      
      <section className="upload-grid">
        <UploadCard
          title="Super Report (CSV)"
          description="Upload your superannuation holdings export."
          help="Imports super holdings into account, ticker, units, price, value, and cost base fields."
          onUpload={(event) => onUpload(event, "super")}
          template={superTemplateCsv()}
          templateName="super-template.csv"
          disabled={working || loading}
        />
        <UploadCard
          title="ASX Report (CSV)"
          description="Upload brokerage or watchlist holdings export."
          help="Imports ASX holdings and enables live quote refresh for pricing and daily portfolio movement."
          onUpload={(event) => onUpload(event, "asx")}
          template={asxTemplateCsv()}
          templateName="asx-template.csv"
          disabled={working || loading}
        />
        <UploadCard
          title="Index Report (CSV)"
          description="Upload index holdings or benchmark positions."
          help="Imports index or benchmark positions so they are included in value, allocation, and risk views."
          onUpload={(event) => onUpload(event, "index")}
          template={indexTemplateCsv()}
          templateName="index-template.csv"
          disabled={working || loading}
        />
        <UploadCard
          title="Mutual Fund Report (CSV)"
          description="Upload managed fund or mutual fund holdings."
          help="Imports managed fund holdings and includes them in total value, cost base, and portfolio analytics."
          onUpload={(event) => onUpload(event, "fund")}
          template={fundTemplateCsv()}
          templateName="mutual-fund-template.csv"
          disabled={working || loading}
        />
        <UploadCard
          title="ABC Bullion Report (Gold/Silver CSV)"
          description="Upload ABC Bullion gold/silver holdings. Put metal weight in units/weight (oz or grams)."
          help="Imports gold and silver holdings by metal weight and tracks bullion exposure alongside other assets."
          onUpload={(event) => onUpload(event, "gold")}
          template={goldTemplateCsv()}
          templateName="bullion-template.csv"
          disabled={working || loading}
        />
      </section>

      <section className="dip-alerts-section">
        <div className="dip-alerts-head">
          <h2>Email Dip Alerts</h2>
          <p>Send an email when a selected ASX holding drops past your threshold versus previous close.</p>
          <p className="dip-alerts-plan-note">{dipAlertPlanMessage}</p>
        </div>

        <form className="dip-alerts-form" onSubmit={(event) => void saveDipAlert(event)}>
          <label>
            <span>Ticker</span>
            <input
              type="text"
              list="dip-alert-tickers"
              value={dipAlertTicker}
              onChange={(event) => setDipAlertTicker(event.target.value.toUpperCase())}
              placeholder={availableDipTickers[0] || "e.g. CBA"}
              maxLength={20}
              disabled={dipAlertSaving}
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
              disabled={dipAlertSaving}
            />
          </label>

          <button
            type="submit"
            className="refresh-btn"
            disabled={dipAlertSaving || dipAlertMax <= 0 || (dipAlerts.length >= dipAlertMax && !dipAlerts.some((alert) => alert.ticker === dipAlertTicker.trim().toUpperCase()))}
          >
            {dipAlertSaving ? "Saving..." : "Save Alert"}
          </button>
        </form>

        {dipAlertMax > 0 ? (
          <p className="dip-alerts-slots">
            {dipAlerts.length}/{dipAlertMax} alert slots in use ({dipAlertSlotsRemaining} remaining).
          </p>
        ) : (
          <p className="dip-alerts-slots">Enable a paid plan to use dip alerts.</p>
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
                    disabled={dipAlertSaving}
                  >
                    {alert.enabled ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className="clear-btn"
                    onClick={() => void deleteDipAlert(alert.ticker)}
                    disabled={dipAlertSaving}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        {!proAnalyticsEnabled ? (
          <div className="dip-alert-upgrade">
            <button type="button" onClick={() => void startProCheckout(authEmail)} className="template-btn" disabled={checkoutWorking}>
              {checkoutWorking ? "Redirecting..." : "Upgrade for More Alerts"}
            </button>
          </div>
        ) : null}
      </section>

      
      <section className="kpi-grid">
        <KpiCard label="Total Portfolio" value={formatCurrency(metrics.totalValue)} help="Current market value across all imported holdings." />
        <KpiCard label="Cost Base" value={formatCurrency(metrics.totalCost)} help="Total invested amount from imported cost-base values." />
        <KpiCard
          label="Risk Score"
          value={portfolioRiskScore ? `${portfolioRiskScore.score}/100 (${portfolioRiskScore.label})` : "Need holdings"}
          help={
            portfolioRiskScore
              ? `Composite score from volatility, VaR, drawdown, concentration, and sample confidence. Confidence: ${portfolioRiskScore.confidence} (${portfolioRiskScore.returnsUsed} daily returns).`
              : "Composite score appears after holdings are imported."
          }
          tone={portfolioRiskScoreTone}
        />
        <KpiCard
          label="Unrealized P/L"
          value={(metrics.pnl >= 0 ? "▲ " : "▼ ") + formatCurrency(Math.abs(metrics.pnl)) + " (" + formatPercent(metrics.pnlPct) + ")"}
          help="Unrealized profit or loss equals current portfolio value minus cost base."
          tone={metrics.pnl >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label={portfolioChangeLabel}
          value={
            todayPortfolioChangePct != null
              ? (todayPortfolioChangeAmount >= 0 ? "▲ " : "▼ ") + formatCurrency(Math.abs(todayPortfolioChangeAmount)) + " (" + formatPercent(todayPortfolioChangePct) + ")"
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
                  ? `${formatCurrency(effectiveVar95Amount)} (${formatPercent(effectiveVar95Pct)})${metrics.var95Amount == null ? " • Yahoo estimate" : ""}`
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
                  ? `${formatCurrency(effectiveCvar95Amount)} (${formatPercent(effectiveCvar95Pct)})${metrics.cvar95Amount == null ? " • Yahoo estimate" : ""}`
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
          <span className="pro-analytics-status">{proAnalyticsEnabled ? "UNLOCKED" : "LOCKED • $15/MONTH"}</span>
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
        </div>
        {!proAnalyticsEnabled ? (
          <div className="pro-analytics-cta">
            <button type="button" onClick={() => void startProCheckout(authEmail)} className="refresh-btn" disabled={checkoutWorking}>
              {checkoutWorking ? "Redirecting..." : "Unlock Pro Analytics"}
            </button>
          </div>
        ) : null}
      </section>

      
      <section className="insights-section">
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
            {todayTopGainer == null || todayTopLoser == null ? (
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
        ) : (
          <div className="empty">Starter keeps this simple. Stress scenarios are available on Pro.</div>
        )}
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
                {(goldValue - goldCostBase >= 0 ? "▲ " : "▼ ") + formatCurrency(Math.abs(goldValue - goldCostBase))}
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
                {(silverValue - silverCostBase >= 0 ? "▲ " : "▼ ") + formatCurrency(Math.abs(silverValue - silverCostBase))}
              </strong>
            </article>
          </div>
        )}
      </section>

      
      <section className="quality-section">
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

      
      <section className="risk-section">
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
          <p className="risk-window-note">Starter focuses on core risk visibility (risk score + concentration). Upgrade to Pro for full quant risk windows.</p>
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

      
      <section className="chart-grid">
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

      
      <section className="table-section">
        <h2>Current Holdings</h2>
        {loading ? (
          <div className="empty">Loading stored data...</div>
        ) : state.holdings.length === 0 ? (
          <div className="empty">Upload super, ASX, index, mutual fund, and/or bullion CSVs to populate this dashboard.</div>
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
                        <td><span className={"pnl-chip " + (pnl >= 0 ? "up" : "down")}>{(pnl >= 0 ? "▲ " : "▼ ") + formatCurrency(Math.abs(pnl))}</span></td>
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
}: {
  title: string;
  description: string;
  help?: string;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  template: string;
  templateName: string;
  disabled: boolean;
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
        <input type="file" accept=".csv,text/csv" onChange={onUpload} disabled={disabled} />
        <span>{disabled ? "Please wait..." : "Select CSV"}</span>
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
  const planTier = user.planTier === "pro" ? "pro" : user.planTier === "starter" ? "starter" : "none";
  const proEnabled = user.proEnabled === true || planTier === "pro";
  const subscriptionStatus = typeof user.subscriptionStatus === "string" && user.subscriptionStatus.length > 0 ? user.subscriptionStatus : null;

  return {
    ...user,
    planTier,
    proEnabled,
    subscriptionStatus,
  };
}

function toCheckoutPlan(value: string | null): CheckoutPlan {
  if (value === "pro") {
    return "pro";
  }

  return "starter";
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

function writePendingRegistrationDraft(draft: PendingRegistrationDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify(draft));
}

function readPendingRegistrationDraft(): PendingRegistrationDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.sessionStorage.getItem(PENDING_REGISTRATION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PendingRegistrationDraft;

    if (
      typeof parsed.email !== "string" ||
      typeof parsed.password !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.acceptsTerms !== "boolean" ||
      typeof parsed.createdAt !== "number"
    ) {
      clearPendingRegistrationDraft();
      return null;
    }

    if (Date.now() - parsed.createdAt > PENDING_REGISTRATION_MAX_AGE_MS) {
      clearPendingRegistrationDraft();
      return null;
    }

    return parsed;
  } catch {
    clearPendingRegistrationDraft();
    return null;
  }
}

function clearPendingRegistrationDraft(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PENDING_REGISTRATION_KEY);
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

function goldTemplateCsv(): string {
  return [
    "account,ticker,name,units,price,value,cost base,sector,date",
    "ABC Bullion,ABC1,1oz Gold Cast Bar,2,4980,9960,9400,Precious Metals,2026-02-18",
    "ABC Bullion,ABC2,100g Gold Minted Bar,3.215,4980,16010.7,15050,Precious Metals,2026-02-18",
    "ABC Bullion,ABC-AG,1kg Silver Cast Bar,32.151,58,1864.76,1715,Precious Metals,2026-02-18",
  ].join("\n");
}
