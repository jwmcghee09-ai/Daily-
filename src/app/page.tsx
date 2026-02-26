"use client";

import Image from "next/image";
import { CSSProperties, ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa, { ParseError } from "papaparse";
import {
  Bar,
  BarChart,
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
}

interface HistoricalRiskEstimatePayload {
  source: "yahoo_estimate";
  lessAccurateThanSnapshots: true;
  note: string;
  riskWindow: RiskWindow;
  pointsTarget: number;
  pointsUsed: number;
  returnsCount: number;
  usedTickers: string[];
  failedTickers: string[];
  volatilityAnnualPct: number | null;
  maxDrawdownPct: number | null;
  var95Pct: number | null;
  var95Amount: number | null;
}

interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

interface AuthSessionPayload {
  authenticated: boolean;
  user?: SessionUser;
}

interface PasswordResetRequestResponse {
  message?: string;
}

interface BillingCheckoutResponse {
  url?: string;
}

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
  const refreshInFlight = useRef(false);

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
      if (!payload.authenticated || !payload.user) {
        throw new Error("Authentication failed.");
      }

      clearPendingRegistrationDraft();
      setSessionUser(payload.user);
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

        setSessionUser(sessionPayload.user);

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

    if (checkoutState === "success") {
      setBanner({ type: "success", message: "Starter plan checkout complete. Your subscription will activate shortly." });
      void completePendingRegistrationAfterCheckout();
    } else if (checkoutState === "cancelled") {
      setBanner({ type: "info", message: "Stripe checkout was cancelled." });
    }

    if (checkoutState) {
      params.delete("checkout");
      const query = params.toString();
      const nextUrl = query.length > 0 ? `${window.location.pathname}?${query}` : window.location.pathname;
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
        const message =
          "Live prices updated: " +
          payload.updatedTickers.length +
          " tickers refreshed" +
          (payload.failedTickers.length > 0 ? ", " + payload.failedTickers.length + " failed" : "") +
          ".";
        setBanner({ type: payload.failedTickers.length > 0 ? "info" : "success", message });
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

  useEffect(() => {
    if (!sessionUser || loading) {
      return;
    }

    void refreshPrices(false);

    const timer = window.setInterval(() => {
      void refreshPrices(false);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [loading, refreshPrices, sessionUser]);

  const metrics = useMemo(() => computeMetrics(state.holdings, state.snapshots, riskWindow), [state.holdings, state.snapshots, riskWindow]);
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
  const effectiveMaxDrawdownPct = metrics.maxDrawdownPct ?? historicalRiskEstimate?.maxDrawdownPct ?? null;
  const usingYahooFallback = metrics.var95Amount == null && historicalRiskEstimate != null;

  const todayMovers = useMemo<TodayMover[]>(() => {
    const grouped = new Map<string, { changeAmount: number; previousValue: number; currentValue: number }>();

    for (const holding of state.holdings) {
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

  const todayPortfolioPreviousValue = useMemo(
    () => todayMovers.reduce((total, mover) => total + mover.previousValue, 0),
    [todayMovers],
  );
  const todayPortfolioChangeAmount = useMemo(
    () => todayMovers.reduce((total, mover) => total + mover.changeAmount, 0),
    [todayMovers],
  );
  const todayPortfolioChangePct = todayPortfolioPreviousValue > 0 ? (todayPortfolioChangeAmount / todayPortfolioPreviousValue) * 100 : null;
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

    return [
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
    ] as const;
  }, [metrics.history, state.holdings, usingYahooFallback]);

  const riskFlags = useMemo<RiskFlag[]>(() => {
    return [
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
    ].filter((flag) => flag.value !== "N/A");
  }, [effectiveMaxDrawdownPct, effectiveVar95Pct, effectiveVolatilityAnnualPct, metrics.hhi, metrics.largestAccountPct, metrics.top3ConcentrationPct]);

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

  const startStarterCheckout = async (guestEmail?: string) => {
    let checkoutEmail = sessionUser?.email || "";

    if (!checkoutEmail) {
      const fromGuestEmail = (guestEmail || "").trim().toLowerCase();
      const fromAuthEmail = authEmail.trim().toLowerCase();

      checkoutEmail = fromGuestEmail || fromAuthEmail;

      if (!checkoutEmail) {
        const promptedEmail = window.prompt("Enter your email to start Starter checkout:", "");
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
      const requestInit: RequestInit = { method: "POST" };

      if (!sessionUser) {
        requestInit.headers = {
          "Content-Type": "application/json",
        };
        requestInit.body = JSON.stringify({ email: checkoutEmail });
      }

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
      if (!payload.authenticated || !payload.user) {
        throw new Error("Authentication failed.");
      }

      setSessionUser(payload.user);
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
            <a href="#pricing">Pricing</a>
            <a href="#access">Client Access</a>
          </nav>
          <a href="#access" className="landing-nav-button">Sign In</a>
        </header>

        <main className="landing-main">
          <section id="top" className="landing-hero">
            <div className="landing-hero-copy">
              <p className="landing-kicker">Portfolio Intelligence Platform</p>
              <h1>Monitor exposure and risk in one private workspace.</h1>
              <p className="landing-hero-text">
                SPECTRE combines super, ASX, and bullion holdings in one view so you can upload reports, track risk signals, and review portfolio snapshots without switching tools.
              </p>
              <div className="landing-hero-actions">
                <a href="#access" className="landing-btn landing-btn-primary">Open Workspace</a>
                <a href="#insights" className="landing-btn landing-btn-ghost">View Feature Preview</a>
              </div>
              <div className="landing-hero-stats">
                <article>
                  <strong>Data Inputs</strong>
                  <span>CSV uploads for super, ASX holdings, and bullion reports.</span>
                </article>
                <article>
                  <strong>Risk Signals</strong>
                  <span>VaR95, drawdown, volatility, concentration, and stress scenarios.</span>
                </article>
                <article>
                  <strong>Account Security</strong>
                  <span>User sessions with sign-in, registration, and password reset.</span>
                </article>
              </div>
            </div>

            <aside className="landing-hero-panel" aria-label="Platform highlights">
              <p className="landing-panel-kicker">SPECTRE OPS</p>
              <h2>What teams can do</h2>
              <ul>
                <li>
                  <span>01</span>
                  <p>Import holdings and normalize them by source, account, and sector.</p>
                </li>
                <li>
                  <span>02</span>
                  <p>Refresh live ASX prices while the dashboard is open.</p>
                </li>
                <li>
                  <span>03</span>
                  <p>Review historical snapshots, metrics, and stress-test outcomes.</p>
                </li>
              </ul>
            </aside>
          </section>

          <section className="landing-proof-strip" aria-label="Current product capabilities">
            <article>
              <strong>SQLite Storage</strong>
              <span>Portfolio data persists in local SQLite for each account.</span>
            </article>
            <article>
              <strong>Auto Refresh</strong>
              <span>ASX prices refresh every 5 minutes while the page is active.</span>
            </article>
            <article>
              <strong>Risk Windowing</strong>
              <span>Switch between 1M, 3M, and 1Y risk windows.</span>
            </article>
            <article>
              <strong>Bullion Tracking</strong>
              <span>Gold and silver weights, value, and unrealized P/L monitoring.</span>
            </article>
          </section>

          <section id="features" className="landing-feature-grid">
            <article>
              <p>Unified Imports</p>
              <h3>Ingest super, brokerage, and bullion exports in one workflow.</h3>
            </article>
            <article>
              <p>Risk Dashboard</p>
              <h3>Track VaR95, drawdown, volatility, and concentration in one place.</h3>
            </article>
            <article>
              <p>Live Movers</p>
              <h3>Surface top gainers and losers using refreshed market prices.</h3>
            </article>
            <article>
              <p>Snapshot History</p>
              <h3>Review portfolio trends and quality signals across time.</h3>
            </article>
          </section>

          <section id="insights" className="landing-analytics">
            <div className="landing-analytics-head">
              <p className="landing-kicker">Feature Preview</p>
              <h2>Example chart layouts used in the dashboard.</h2>
              <p>These are illustrative demo values showing the chart experience. Your actual charts populate from imported portfolio data.</p>
            </div>
            <div className="landing-analytics-grid">
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
              <h2>Built for disciplined portfolio operations.</h2>
              <p>
                Start with existing CSV exports, centralize holdings in SPECTRE, and monitor exposure changes with risk indicators and stress scenarios.
              </p>
            </div>
            <div className="landing-steps">
              <article>
                <span>01</span>
                <div>
                  <h3>Import Reports</h3>
                  <p>Upload super, ASX, and bullion files directly into SPECTRE.</p>
                </div>
              </article>
              <article>
                <span>02</span>
                <div>
                  <h3>Normalize Exposure</h3>
                  <p>Aggregate positions by source, account, sector, and instrument.</p>
                </div>
              </article>
              <article>
                <span>03</span>
                <div>
                  <h3>Review Risk Signals</h3>
                  <p>Use drawdown, VaR, and concentration metrics to monitor risk posture.</p>
                </div>
              </article>
            </div>
          </section>

          <section id="pricing" className="landing-pricing">
            <div className="landing-pricing-head">
              <p className="landing-kicker">Pricing</p>
              <h2>Starter and Pro plans.</h2>
              <p>Starter is available now at $3/month. Pro is listed as planned for teams.</p>
            </div>
            <div className="landing-pricing-grid landing-pricing-centered">
              <article className="landing-plan landing-plan-starter landing-plan-highlight">
                <p className="landing-plan-tier">Starter</p>
                <h3>$3<span>/month</span></h3>
                <p className="landing-plan-subtitle">Live now</p>
                <ul>
                  <li>One private account workspace</li>
                  <li>CSV import for super, ASX, and bullion</li>
                  <li>Risk dashboard, charts, and snapshots</li>
                  <li>Account sign-in and password reset</li>
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
                <h3>Coming<span> soon</span></h3>
                <p className="landing-plan-subtitle">Planned for team workflows</p>
                <ul>
                  <li>Everything in Starter</li>
                  <li>Multi-user collaboration (planned)</li>
                  <li>Advanced reporting controls (planned)</li>
                  <li>Extended billing controls (planned)</li>
                </ul>
                <a href="#access" className="landing-btn landing-btn-ghost">Join Pro Waitlist</a>
              </article>
            </div>
            <p className="landing-pricing-note">Features labeled “planned” are not in the current release.</p>
          </section>

          <section id="access" className="landing-access">
            <article className="landing-access-copy">
              <p className="landing-kicker">Client Access</p>
              <h2>Enter your private SPECTRE workspace.</h2>
              <p>
                Sign in to continue from your last snapshot, or create your account with Stripe checkout in one flow. Starter plan is $3/month.
              </p>
              <div className="landing-proof">
                <p>Designed for analyst teams and active portfolio operators.</p>
                <p>Single interface for holdings, allocation, and risk posture.</p>
              </div>
            </article>

            <article className="auth-login-card landing-auth-card">
              <h2>{authMode === "register" ? "Create Account" : "Sign In"}</h2>
              <p>Access your private SPECTRE workspace.</p>

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
          <p className="footer-legal">T&C apply. Copyright 2026 SPECTRE.</p>
        </footer>
      </div>
    );
  }
  return (
    <div className="shell">
      <header className="hero">
        <div className="hero-copy">
          <h1><Image src="/spectre-wordmark-plain.svg" alt="SPECTRE" width={344} height={82} className="hero-wordmark-image" priority /></h1>
          <p className="hero-tagline">System for Portfolio Exposure, Correlation, Threat & Risk Evaluation</p>
          <p className="hero-description">Upload super, ASX, and ABC Bullion gold/silver CSV reports to track your portfolio and risk in one place.</p>
        </div>
        <div className="meta">
          <span className="meta-item">Account: {sessionUser.displayName} ({sessionUser.email})</span>
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
            <button type="button" onClick={() => void startStarterCheckout()} className="refresh-btn" disabled={loading || working || refreshingPrices || checkoutWorking}>
              {checkoutWorking ? "Redirecting..." : "Starter Plan ($3/mo)"}
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
          onUpload={(event) => onUpload(event, "super")}
          template={superTemplateCsv()}
          templateName="super-template.csv"
          disabled={working || loading}
        />
        <UploadCard
          title="ASX Report (CSV)"
          description="Upload brokerage or watchlist holdings export."
          onUpload={(event) => onUpload(event, "asx")}
          template={asxTemplateCsv()}
          templateName="asx-template.csv"
          disabled={working || loading}
        />
        <UploadCard
          title="Index Report (CSV)"
          description="Upload index holdings or benchmark positions."
          onUpload={(event) => onUpload(event, "index")}
          template={indexTemplateCsv()}
          templateName="index-template.csv"
          disabled={working || loading}
        />
        <UploadCard
          title="Mutual Fund Report (CSV)"
          description="Upload managed fund or mutual fund holdings."
          onUpload={(event) => onUpload(event, "fund")}
          template={fundTemplateCsv()}
          templateName="mutual-fund-template.csv"
          disabled={working || loading}
        />
        <UploadCard
          title="ABC Bullion Report (Gold/Silver CSV)"
          description="Upload ABC Bullion gold/silver holdings. Put metal weight in units/weight (oz or grams)."
          onUpload={(event) => onUpload(event, "gold")}
          template={goldTemplateCsv()}
          templateName="bullion-template.csv"
          disabled={working || loading}
        />
      </section>

      
      <section className="kpi-grid">
        <KpiCard label="Total Portfolio" value={formatCurrency(metrics.totalValue)} />
        <KpiCard label="Cost Base" value={formatCurrency(metrics.totalCost)} />
        <KpiCard
          label="Unrealized P/L"
          value={(metrics.pnl >= 0 ? "▲ " : "▼ ") + formatCurrency(Math.abs(metrics.pnl)) + " (" + formatPercent(metrics.pnlPct) + ")"}
          tone={metrics.pnl >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label="Today Change"
          value={
            todayPortfolioChangePct != null
              ? (todayPortfolioChangeAmount >= 0 ? "▲ " : "▼ ") + formatCurrency(Math.abs(todayPortfolioChangeAmount)) + " (" + formatPercent(todayPortfolioChangePct) + ")"
              : "Need live prices"
          }
          tone={todayPortfolioChangePct == null ? "neutral" : todayPortfolioChangeAmount >= 0 ? "positive" : "negative"}
        />
        <KpiCard
          label={"1-Day VaR (95%, " + riskWindow + ")"}
          value={
            effectiveVar95Amount != null
              ? `${formatCurrency(effectiveVar95Amount)} (${formatPercent(effectiveVar95Pct)})${metrics.var95Amount == null ? " • Yahoo estimate" : ""}`
              : loadingHistoricalEstimate && metrics.var95Amount == null
                ? "Estimating from Yahoo..."
                : "Need 20+ daily snapshots"
          }
        />
      </section>

      
      <section className="insights-section">
        <h2>Performance & Stress</h2>
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
            <h3>Top Gainer / Loser Today</h3>
            {todayTopGainer == null || todayTopLoser == null ? (
              <div className="empty">Need live prices to calculate intraday movers.</div>
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
          <h2>Risk Signals</h2>
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
        </div>
        <p className="risk-window-note">
          Window {riskWindow}: {metrics.riskPointsUsed} snapshot points
          {metrics.riskStartDate ? " from " + formatRiskWindowDate(metrics.riskStartDate) : ""}
          {metrics.riskEndDate ? " to " + formatRiskWindowDate(metrics.riskEndDate) : ""}
          .
        </p>
        {usingYahooFallback ? (
          <p className="estimate-note">
            {historicalRiskEstimate.note} ({historicalRiskEstimate.pointsUsed}/{historicalRiskEstimate.pointsTarget} points, {historicalRiskEstimate.usedTickers.length} tickers)
          </p>
        ) : null}
        <div className="risk-grid">
          {riskFlags.length === 0 ? (
            <div className="empty">Import reports over time to unlock drawdown/volatility/VaR metrics.</div>
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
        <ChartCard title="Account Allocation" tone="portfolio">
          <PieAllocation data={metrics.accountAllocation} palette={PORTFOLIO_COLORS} />
        </ChartCard>
        <ChartCard title="Sector Allocation" tone="exposure">
          <PieAllocation data={metrics.sectorAllocation} palette={EXPOSURE_COLORS} />
        </ChartCard>
        <ChartCard title="Top Holdings" tone="holdings">
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
        <ChartCard title="Portfolio Snapshot History" tone="history">
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={metrics.history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#303036" />
              <XAxis dataKey="date" tickFormatter={formatSnapshotTick} minTickGap={28} />
              <YAxis tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
              <Tooltip formatter={tooltipFormatter} labelFormatter={formatSnapshotLabel} contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Line type="monotone" dataKey="value" stroke={ACCENT_COLOR} strokeWidth={2.5} dot={false} />
            </LineChart>
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
        <p className="footer-legal">T&C apply. Copyright 2026 SPECTRE.</p>
      </footer>
    </div>
  );
}

function UploadCard({
  title,
  description,
  onUpload,
  template,
  templateName,
  disabled,
}: {
  title: string;
  description: string;
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
    <article className="upload-card">
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
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <article className={"kpi-card" + (tone !== "neutral" ? " kpi-" + tone : "")}>
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

function ChartCard({ title, children, tone = "default" }: { title: string; children: ReactNode; tone?: "default" | "portfolio" | "exposure" | "history" | "holdings" }) {
  return (
    <article className={"chart-card chart-" + tone}>
      <h2>{title}</h2>
      {children}
    </article>
  );
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
