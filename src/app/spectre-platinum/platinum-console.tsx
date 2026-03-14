"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./page.module.css";

interface PlatinumConsoleProps {
  userEmail: string;
}

interface PlatinumPaperPosition {
  ticker: string;
  units: number;
  avgCost: number;
  lastPrice: number;
  peakPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  updatedAt: string;
}

interface PlatinumRecommendation {
  id: string;
  scanDate: string;
  ticker: string;
  action: "buy" | "sell" | "hold";
  score: number;
  expectedReturnPct: number;
  confidence: number;
  indicatorCount: number;
  finalScore: number;
  aiAdjustment: number;
  aiConfidence: number;
  aiSummary: string;
  price: number;
  maShort: number;
  maLong: number;
  momentum: number;
  zScore: number;
  reason: string;
  createdAt: string;
}

interface PlatinumPaperTrade {
  id: string;
  scanDate: string;
  ticker: string;
  side: "buy" | "sell";
  units: number;
  price: number;
  notional: number;
  fee: number;
  reason: string;
  createdAt: string;
}

interface PlatinumPaperSnapshot {
  scanDate: string;
  cash: number;
  investedValue: number;
  equity: number;
  createdAt: string;
}

interface PlatinumPaperState {
  portfolio: {
    startingCash: number;
    cash: number;
    investedValue: number;
    equity: number;
    realizedPnl: number;
    unrealizedPnl: number;
    totalPnl: number;
    totalReturnPct: number;
    lastScanAt: string | null;
  };
  riskControls: {
    killSwitchEnabled: boolean;
    maxOrderNotionalAud: number;
    maxOrderEquityPct: number;
    dailyLossCapAud: number;
    dayStartEquity: number | null;
    dailyPnlAud: number;
    dailyLossCapTriggered: boolean;
    marketOpenRequired: boolean;
  };
  latestScanDate: string | null;
  positions: PlatinumPaperPosition[];
  latestRecommendations: PlatinumRecommendation[];
  recentTrades: PlatinumPaperTrade[];
  snapshots: PlatinumPaperSnapshot[];
  signalLeaderboard: Array<{
    label: string;
    wins: number;
    losses: number;
    observations: number;
    pnlSum: number;
    adaptiveWeight: number;
    updatedAt: string;
  }>;
  latestDiagnostics: {
    scanDate: string;
    marketRegime: string;
    generatedRecommendations: number;
    executedTrades: number;
    skippedTickers: number;
    avgScore: number;
    avgFinalScore: number;
    topSignalLeaders: string;
    notes: string;
    createdAt: string;
  } | null;
  universeSize: number;
}

interface PlatinumPayload {
  ok: boolean;
  state?: PlatinumPaperState;
  result?: {
    state: PlatinumPaperState;
    scanDate: string;
    executedTrades: number;
    generatedRecommendations: number;
    skippedTickers: string[];
    alreadyRanToday: boolean;
    marketOpen: boolean;
    skippedBecauseMarketClosed: boolean;
    skippedBecauseKillSwitch: boolean;
    skippedBecauseDailyLossCap: boolean;
    usedAiOverlay: boolean;
    aiModel: string | null;
  };
  error?: string;
}

interface PlatinumAnalysis {
  generatedAt: string;
  model: string;
  overview: string;
  riskSignals: string[];
  tradeSignals: string[];
  watchlist: string[];
  nextActions: string[];
}

interface PlatinumAnalysisPayload {
  ok: boolean;
  analysis?: PlatinumAnalysis;
  error?: string;
}

type ApiPayload = {
  ok?: boolean;
  error?: string;
};

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

const numberFmt = new Intl.NumberFormat("en-AU", {
  maximumFractionDigits: 4,
});

function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

interface ParsedRecommendationReason {
  regime: string | null;
  topSignals: string[];
  patternTags: string[];
  aiNote: string | null;
  patternForecast: string | null;
}

function parseRecommendationReason(reason: string): ParsedRecommendationReason {
  const text = String(reason || "");
  const regime = text.match(/regime\[([^\]]+)\]/i)?.[1]?.trim() || null;
  const signalsRaw = text.match(/signals\[([^\]]+)\]/i)?.[1] || "";
  const patternsRaw = text.match(/patterns\[([^\]]+)\]/i)?.[1] || "";
  const aiNote = text.match(/AI\[([^\]]+)\]/i)?.[1]?.trim() || null;
  const patternForecast = text.match(/Pattern\d+\s+[-+]?\d+(?:\.\d+)?%\s+@\s+\d+%\s+hit\s+\/\s+\d+%\s+conf/i)?.[0] || null;

  const topSignals = signalsRaw
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 4);

  const patternTags = patternsRaw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return {
    regime,
    topSignals,
    patternTags,
    aiNote,
    patternForecast,
  };
}

// SPECTRE chart constants
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(10,7,18,0.97)",
  border: "1px solid rgba(255,77,26,0.22)",
  borderRadius: "8px",
  fontFamily: "'DM Mono', monospace",
  fontSize: "11px",
  color: "#f2eeff",
};
const LEGEND_STYLE = {
  fontFamily: "'DM Mono', monospace",
  fontSize: "10px",
  color: "#8a86a8",
};
const AXIS_TICK = {
  fill: "#8a86a8",
  fontSize: 10,
  fontFamily: "'DM Mono', monospace",
};
const GRID_STROKE = "rgba(255,255,255,0.05)";
const API_TIMEOUT_MS = 15000;

function summarizeUnexpectedApiBody(raw: string): string {
  const compact = String(raw || "").replace(/\s+/g, " ").trim();
  if (!compact) {
    return "Empty response body.";
  }

  if (compact.toLowerCase().startsWith("<!doctype") || compact.toLowerCase().startsWith("<html")) {
    return "Server returned an HTML page instead of JSON (likely an upstream/server error).";
  }

  return compact.slice(0, 220);
}

async function readJsonPayload<T extends ApiPayload>(response: Response): Promise<T> {
  const raw = await response.text();

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(
      `API returned non-JSON response (${response.status}). ${summarizeUnexpectedApiBody(raw)}`,
    );
  }
}

async function fetchJsonWithTimeout<T extends ApiPayload>(input: RequestInfo | URL, init?: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return await readJsonPayload<T>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function PlatinumConsole({ userEmail }: PlatinumConsoleProps) {
  const [state, setState] = useState<PlatinumPaperState | null>(null);
  const [analysis, setAnalysis] = useState<PlatinumAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningScan, setRunningScan] = useState(false);
  const [runningAnalysis, setRunningAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [marketStatusMessage, setMarketStatusMessage] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/platinum/paper-trading", {
        cache: "no-store",
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      const payload = await readJsonPayload<PlatinumPayload>(response);

      if (!response.ok || !payload.ok || !payload.state) {
        throw new Error(payload.error || `Request failed (${response.status}).`);
      }

      setState(payload.state);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "TimeoutError"
          ? `Platinum workspace timed out after ${Math.round(API_TIMEOUT_MS / 1000)} seconds.`
          : error instanceof Error
            ? error.message
            : "Failed to load Platinum paper model.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const runDailyScan = useCallback(async () => {
    setRunningScan(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/platinum/paper-trading?mode=force", {
        method: "POST",
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      const payload = await readJsonPayload<PlatinumPayload>(response);

      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(payload.error || `Request failed (${response.status}).`);
      }

      setState(payload.result.state);
      setAnalysis(null);
      setAnalysisError(null);

      if (payload.result.skippedBecauseKillSwitch) {
        setStatusMessage("Kill switch is ON. Auto-trading is paused.");
      } else if (payload.result.skippedBecauseDailyLossCap) {
        setStatusMessage("Daily loss cap reached. New trades are paused for today.");
      } else if (payload.result.skippedBecauseMarketClosed) {
        setStatusMessage("ASX is currently closed. Live scan skipped.");
      } else if (payload.result.alreadyRanToday) {
        setStatusMessage(`Daily scan already ran for ${payload.result.scanDate} (${"Australia/Sydney"}).`);
      } else {
        setStatusMessage(
          `Scan ${payload.result.scanDate}: ${payload.result.generatedRecommendations} recommendations generated, ${payload.result.executedTrades} paper trades executed, ${payload.result.skippedTickers.length} skipped tickers.${payload.result.usedAiOverlay ? ` AI model: ${payload.result.aiModel || "enabled"}.` : ""}`,
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to run daily scan.");
    } finally {
      setRunningScan(false);
    }
  }, []);

  const runAiAnalysis = useCallback(async () => {
    setRunningAnalysis(true);
    setAnalysisError(null);

    try {
      const payload = await fetchJsonWithTimeout<PlatinumAnalysisPayload>("/api/platinum/analysis", { method: "POST" }, 22000);
      if (!payload.ok || !payload.analysis) {
        throw new Error(payload.error || "Request failed.");
      }

      setAnalysis(payload.analysis);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Failed to generate AI analysis.");
    } finally {
      setRunningAnalysis(false);
    }
  }, []);

  const runLiveUpdate = useCallback(async () => {
    try {
      const response = await fetch("/api/platinum/paper-trading?mode=live", {
        method: "POST",
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      const payload = await readJsonPayload<PlatinumPayload>(response);

      if (!response.ok || !payload.ok || !payload.result) return;
      setState(payload.result.state);

      if (payload.result.skippedBecauseKillSwitch) {
        setMarketStatusMessage("Kill switch ON: live trading paused.");
        return;
      }

      if (payload.result.skippedBecauseDailyLossCap) {
        setMarketStatusMessage("Daily loss cap reached: no new trades today.");
        return;
      }

      if (payload.result.skippedBecauseMarketClosed) {
        setMarketStatusMessage("ASX closed: waiting for market open.");
        return;
      }

      setMarketStatusMessage(payload.result.marketOpen ? "ASX open: live model running." : "ASX status unavailable.");
    } catch {
      // background updates are best-effort
    }
  }, []);

  useEffect(() => {
    void runLiveUpdate();
    const intervalId = window.setInterval(() => { void runLiveUpdate(); }, 5 * 60 * 1000);
    return () => { window.clearInterval(intervalId); };
  }, [runLiveUpdate]);

  const topRecommendations = useMemo<PlatinumRecommendation[]>(() => {
    if (!state) return [];
    return state.latestRecommendations.slice(0, 40);
  }, [state]);

  const recentTrades = useMemo<PlatinumPaperTrade[]>(() => {
    if (!state) return [];
    return state.recentTrades.slice(0, 30);
  }, [state]);

  const positions = useMemo<PlatinumPaperPosition[]>(() => {
    if (!state) return [];
    return state.positions;
  }, [state]);

  const equityCurveData = useMemo(() => {
    if (!state) return [] as Array<{ date: string; equity: number; cash: number; invested: number }>;
    return state.snapshots.map((snapshot) => ({
      date: snapshot.scanDate.slice(5),
      equity: snapshot.equity,
      cash: snapshot.cash,
      invested: snapshot.investedValue,
    }));
  }, [state]);

  const opportunityData = useMemo(() => {
    if (!state) return [] as Array<{ ticker: string; expected: number; confidence: number }>;
    return state.latestRecommendations
      .filter((r) => r.action === "buy")
      .sort((a, b) => b.expectedReturnPct - a.expectedReturnPct)
      .slice(0, 12)
      .map((r) => ({ ticker: r.ticker, expected: r.expectedReturnPct, confidence: r.confidence }));
  }, [state]);

  const actionMixData = useMemo(() => {
    if (!state) return [] as Array<{ action: string; count: number }>;
    const buyCount  = state.latestRecommendations.filter((r) => r.action === "buy").length;
    const sellCount = state.latestRecommendations.filter((r) => r.action === "sell").length;
    const holdCount = state.latestRecommendations.filter((r) => r.action === "hold").length;
    return [
      { action: "BUY",  count: buyCount  },
      { action: "SELL", count: sellCount },
      { action: "HOLD", count: holdCount },
    ];
  }, [state]);

  if (loading) return <p className={styles.infoText}>Loading Platinum model…</p>;
  if (!state)  return <p className={styles.errorText}>{errorMessage ?? "Unable to load Platinum state."}</p>;

  return (
    <section className={styles.consoleWrap}>

      {/* ── TOOLBAR ── */}
      <div className={styles.toolbar}>
        <div>
          <p className={styles.userRow}>Signed in as {userEmail}</p>
          <p className={styles.infoText}>
            Paper account starts at {currency.format(state.portfolio.startingCash)} and auto-executes BUY/SELL trades from ranked leading indicators.
          </p>
          <p className={styles.infoText}>Universe: whole ASX — {state.universeSize} tickers estimated.</p>
          <p className={styles.infoText}>
            Risk controls: max order {currency.format(state.riskControls.maxOrderNotionalAud)} or {(state.riskControls.maxOrderEquityPct * 100).toFixed(1)}% equity, daily loss cap {currency.format(state.riskControls.dailyLossCapAud)}.
          </p>
          <p className={styles.infoText}>
            Today P/L vs start: <span className={state.riskControls.dailyPnlAud >= 0 ? styles.positive : styles.negative}>{currency.format(state.riskControls.dailyPnlAud)}</span>
            {state.riskControls.killSwitchEnabled ? " · Kill switch ON" : ""}
            {state.riskControls.marketOpenRequired ? " · Market-hours enforcement ON" : ""}
          </p>
          {state.signalLeaderboard.length > 0 ? (
            <p className={styles.infoText}>
              Adaptive signal leaders: {state.signalLeaderboard.slice(0, 3).map((item) => `${item.label}×${item.adaptiveWeight.toFixed(2)}`).join(" · ")}
            </p>
          ) : null}
          {state.latestDiagnostics ? (
            <p className={styles.infoText}>
              Last diagnostics: regime {state.latestDiagnostics.marketRegime}, avg score {state.latestDiagnostics.avgScore.toFixed(3)}, avg final {state.latestDiagnostics.avgFinalScore.toFixed(3)}.
            </p>
          ) : null}
          {marketStatusMessage ? <p className={styles.infoText}>{marketStatusMessage}</p> : null}
        </div>
        <button className={styles.scanButton} onClick={() => void runDailyScan()} disabled={runningScan}>
          {runningScan ? "Scanning ASX…" : "Run Full ASX Daily Scan"}
        </button>
      </div>

      {statusMessage ? <p className={styles.successText}>{statusMessage}</p> : null}
      {errorMessage  ? <p className={styles.errorText}>{errorMessage}</p>   : null}

      {/* ── AI PANEL ── */}
      <article className={styles.aiPanel}>
        <div className={styles.aiToolbar}>
          <div>
            <h3>AI Market Brief</h3>
            {analysis ? (
              <p className={styles.infoText}>
                Generated {new Date(analysis.generatedAt).toLocaleString("en-AU")} via {analysis.model}
              </p>
            ) : (
              <p className={styles.infoText}>Generate a plain-English breakdown of current risk and trade signals.</p>
            )}
          </div>
          <button className={styles.analysisButton} onClick={() => void runAiAnalysis()} disabled={runningAnalysis}>
            {runningAnalysis ? "Generating Analysis…" : "Generate AI Analysis"}
          </button>
        </div>

        {analysisError ? <p className={styles.errorText}>{analysisError}</p> : null}

        {analysis ? (
          <div className={styles.aiBody}>
            <p className={styles.infoText}>{analysis.overview}</p>
            <div className={styles.aiGrid}>
              <section>
                <h4>Risk Signals</h4>
                <ul className={styles.aiList}>
                  {(analysis.riskSignals.length > 0
                    ? analysis.riskSignals
                    : ["No major risk flags in the latest data."]
                  ).map((item) => <li key={`risk-${item}`}>{item}</li>)}
                </ul>
              </section>
              <section>
                <h4>Trade Signals</h4>
                <ul className={styles.aiList}>
                  {(analysis.tradeSignals.length > 0
                    ? analysis.tradeSignals
                    : ["No high-conviction trade setups were identified."]
                  ).map((item) => <li key={`trade-${item}`}>{item}</li>)}
                </ul>
              </section>
              <section>
                <h4>Watchlist</h4>
                <ul className={styles.aiList}>
                  {(analysis.watchlist.length > 0
                    ? analysis.watchlist
                    : ["No watchlist entries returned."]
                  ).map((item) => <li key={`watch-${item}`}>{item}</li>)}
                </ul>
              </section>
              <section>
                <h4>Next Actions</h4>
                <ul className={styles.aiList}>
                  {(analysis.nextActions.length > 0
                    ? analysis.nextActions
                    : ["Refresh scans and rerun AI analysis after next market update."]
                  ).map((item) => <li key={`next-${item}`}>{item}</li>)}
                </ul>
              </section>
            </div>
          </div>
        ) : null}
      </article>

      {/* ── METRIC STRIP ── */}
      <div className={styles.metricGrid}>
        <article className={styles.metricCard}>
          <h3>Cash</h3>
          <p>{currency.format(state.portfolio.cash)}</p>
        </article>
        <article className={styles.metricCard}>
          <h3>Invested</h3>
          <p>{currency.format(state.portfolio.investedValue)}</p>
        </article>
        <article className={styles.metricCard}>
          <h3>Equity</h3>
          <p>{currency.format(state.portfolio.equity)}</p>
        </article>
        <article className={styles.metricCard}>
          <h3>Total Return</h3>
          <p className={state.portfolio.totalReturnPct >= 0 ? styles.positive : styles.negative}>
            {pct(state.portfolio.totalReturnPct)}
          </p>
        </article>
        <article className={styles.metricCard}>
          <h3>Total P/L</h3>
          <p className={state.portfolio.totalPnl >= 0 ? styles.positive : styles.negative}>
            {currency.format(state.portfolio.totalPnl)}
          </p>
        </article>
        <article className={styles.metricCard}>
          <h3>Last Scan</h3>
          <p>{state.portfolio.lastScanAt
            ? new Date(state.portfolio.lastScanAt).toLocaleString("en-AU")
            : "Never"}
          </p>
        </article>
      </div>

      {/* ── CHARTS ── */}
      <div className={styles.chartGrid}>
        <article className={styles.chartCard}>
          <h3>Equity Curve</h3>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={equityCurveData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={LEGEND_STYLE} />
                <Line type="monotone" dataKey="equity"   stroke="#ff4d1a"              strokeWidth={2} dot={false} name="Equity" />
                <Line type="monotone" dataKey="cash"     stroke="#c084fc"              strokeWidth={2} dot={false} name="Cash" />
                <Line type="monotone" dataKey="invested" stroke="rgba(242,238,255,.4)" strokeWidth={1.5} dot={false} name="Invested" strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className={styles.chartCard}>
          <h3>Top Expected Return Ideas</h3>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={opportunityData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                <XAxis dataKey="ticker" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={LEGEND_STYLE} />
                <Bar dataKey="expected" name="Expected Return %">
                  {opportunityData.map((entry) => (
                    <Cell key={entry.ticker} fill={entry.expected >= 0 ? "#ff4d1a" : "rgba(255,77,26,.35)"} />
                  ))}
                </Bar>
                <Bar dataKey="confidence" name="Confidence %" fill="rgba(192,132,252,.55)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className={styles.chartCard}>
          <h3>Signal Action Mix</h3>
          <div className={styles.chartWrap}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={actionMixData} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                <XAxis dataKey="action" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Ticker Count" radius={[3, 3, 0, 0]}>
                  <Cell fill="#f2eeff" />
                  <Cell fill="#ff4d1a" />
                  <Cell fill="rgba(138,134,168,.55)" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      {/* ── POSITIONS + RECOMMENDATIONS ── */}
      <div className={styles.panelGrid}>
        <article className={styles.panel}>
          <h3>Open Positions ({positions.length})</h3>
          {positions.length === 0 ? (
            <p className={styles.infoText}>No open paper positions yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Units</th>
                    <th>Avg Cost</th>
                    <th>Last Price</th>
                    <th>Peak Price</th>
                    <th>Market Value</th>
                    <th>Unrealized P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr key={position.ticker}>
                      <td>{position.ticker}</td>
                      <td>{numberFmt.format(position.units)}</td>
                      <td>{currency.format(position.avgCost)}</td>
                      <td>{currency.format(position.lastPrice)}</td>
                      <td>{currency.format(position.peakPrice)}</td>
                      <td>{currency.format(position.marketValue)}</td>
                      <td className={position.unrealizedPnl >= 0 ? styles.positive : styles.negative}>
                        {currency.format(position.unrealizedPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className={styles.panel}>
          <h3>Top Recommendations ({topRecommendations.length})</h3>
          {topRecommendations.length === 0 ? (
            <p className={styles.infoText}>Run a daily scan to generate recommendations.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Action</th>
                    <th>Score</th>
                    <th>Final</th>
                    <th>Expected</th>
                    <th>Confidence</th>
                    <th>AI Adj</th>
                    <th>AI Conf</th>
                    <th>AI Note</th>
                    <th>Price</th>
                    <th>MA20</th>
                    <th>MA50</th>
                    <th>ROC20</th>
                    <th>Z</th>
                    <th>Signals</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {topRecommendations.map((recommendation) => (
                    <tr key={recommendation.id}>
                      <td>{recommendation.ticker}</td>
                      <td
                        className={
                          recommendation.action === "buy"
                            ? styles.positive
                            : recommendation.action === "sell"
                              ? styles.negative
                              : ""
                        }
                      >
                        {recommendation.action.toUpperCase()}
                      </td>
                      <td>{recommendation.score.toFixed(3)}</td>
                      <td>{recommendation.finalScore.toFixed(3)}</td>
                      <td className={recommendation.expectedReturnPct >= 0 ? styles.positive : styles.negative}>
                        {pct(recommendation.expectedReturnPct)}
                      </td>
                      <td>{pct(recommendation.confidence)}</td>
                      <td className={recommendation.aiAdjustment >= 0 ? styles.positive : styles.negative}>
                        {recommendation.aiAdjustment.toFixed(2)}
                      </td>
                      <td>{pct(recommendation.aiConfidence)}</td>
                      <td>{recommendation.aiSummary || "—"}</td>
                      <td>{currency.format(recommendation.price)}</td>
                      <td>{currency.format(recommendation.maShort)}</td>
                      <td>{currency.format(recommendation.maLong)}</td>
                      <td className={recommendation.momentum >= 0 ? styles.positive : styles.negative}>
                        {pct(recommendation.momentum * 100)}
                      </td>
                      <td className={recommendation.zScore >= 0 ? styles.positive : styles.negative}>
                        {recommendation.zScore.toFixed(2)}
                      </td>
                      <td>{recommendation.indicatorCount}</td>
                      <td>{recommendation.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      {/* ── RECOMMENDATION DRIVERS ── */}
      <article className={styles.panel}>
        <h3>Recommendation Drivers</h3>
        {topRecommendations.length === 0 ? (
          <p className={styles.infoText}>Run a daily scan to see the model drivers.</p>
        ) : (
          <div className={styles.driverGrid}>
            {topRecommendations.slice(0, 12).map((recommendation) => {
              const details = parseRecommendationReason(recommendation.reason);
              return (
                <section key={`driver-${recommendation.id}`} className={styles.driverCard}>
                  <div className={styles.driverHeader}>
                    <p className={styles.driverTicker}>{recommendation.ticker}</p>
                    <p
                      className={
                        recommendation.action === "buy"
                          ? styles.positive
                          : recommendation.action === "sell"
                            ? styles.negative
                            : styles.infoText
                      }
                    >
                      {recommendation.action.toUpperCase()}
                    </p>
                  </div>
                  <p className={styles.driverMeta}>
                    Expected {pct(recommendation.expectedReturnPct)} · Confidence {pct(recommendation.confidence)} · Final {recommendation.finalScore.toFixed(3)}
                  </p>
                  <p className={styles.driverMeta}>
                    MA20 {currency.format(recommendation.maShort)} · MA50 {currency.format(recommendation.maLong)} · ROC20 {pct(recommendation.momentum * 100)} · Z {recommendation.zScore.toFixed(2)}
                  </p>
                  {details.patternForecast ? <p className={styles.driverMeta}>{details.patternForecast}</p> : null}
                  {details.regime ? <p className={styles.driverMeta}>Regime: {details.regime}</p> : null}
                  {details.topSignals.length > 0 ? (
                    <p className={styles.driverSignals}>Top signals: {details.topSignals.join(" · ")}</p>
                  ) : null}
                  {details.patternTags.length > 0 ? (
                    <p className={styles.driverSignals}>Patterns: {details.patternTags.join(", ")}</p>
                  ) : null}
                  {details.aiNote ? <p className={styles.driverAi}>AI: {details.aiNote}</p> : null}
                </section>
              );
            })}
          </div>
        )}
      </article>

      {/* ── RECENT TRADES ── */}
      <article className={styles.panel}>
        <h3>Recent Paper Trades ({recentTrades.length})</h3>
        {recentTrades.length === 0 ? (
          <p className={styles.infoText}>No paper trades executed yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ticker</th>
                  <th>Side</th>
                  <th>Units</th>
                  <th>Price</th>
                  <th>Notional</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td>{new Date(trade.createdAt).toLocaleDateString("en-AU")}</td>
                    <td>{trade.ticker}</td>
                    <td className={trade.side === "buy" ? styles.positive : styles.negative}>
                      {trade.side.toUpperCase()}
                    </td>
                    <td>{numberFmt.format(trade.units)}</td>
                    <td>{currency.format(trade.price)}</td>
                    <td>{currency.format(trade.notional)}</td>
                    <td>{currency.format(trade.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

    </section>
  );
}
