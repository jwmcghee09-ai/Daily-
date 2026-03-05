"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

interface PlatinumConsoleProps {
  userEmail: string;
}

interface PlatinumPaperPosition {
  ticker: string;
  units: number;
  avgCost: number;
  lastPrice: number;
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
  latestScanDate: string | null;
  positions: PlatinumPaperPosition[];
  latestRecommendations: PlatinumRecommendation[];
  recentTrades: PlatinumPaperTrade[];
  snapshots: PlatinumPaperSnapshot[];
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
  };
  error?: string;
}

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

export default function PlatinumConsole({ userEmail }: PlatinumConsoleProps) {
  const [state, setState] = useState<PlatinumPaperState | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningScan, setRunningScan] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/platinum/paper-trading", { cache: "no-store" });
      const payload = (await response.json()) as PlatinumPayload;

      if (!response.ok || !payload.ok || !payload.state) {
        throw new Error(payload.error || `Request failed (${response.status}).`);
      }

      setState(payload.state);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load Platinum paper model.");
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
      const response = await fetch("/api/platinum/paper-trading", {
        method: "POST",
      });

      const payload = (await response.json()) as PlatinumPayload;
      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(payload.error || `Request failed (${response.status}).`);
      }

      setState(payload.result.state);

      if (payload.result.alreadyRanToday) {
        setStatusMessage(`Daily scan already ran for ${payload.result.scanDate} (Australia/Sydney).`);
      } else {
        setStatusMessage(
          `Scan ${payload.result.scanDate}: ${payload.result.generatedRecommendations} recommendations, ${payload.result.executedTrades} paper trades executed.`,
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to run daily scan.");
    } finally {
      setRunningScan(false);
    }
  }, []);

  const topRecommendations = useMemo<PlatinumRecommendation[]>(() => {
    if (!state) {
      return [];
    }

    return state.latestRecommendations.slice(0, 20);
  }, [state]);

  const recentTrades = useMemo<PlatinumPaperTrade[]>(() => {
    if (!state) {
      return [];
    }

    return state.recentTrades.slice(0, 20);
  }, [state]);

  const positions = useMemo<PlatinumPaperPosition[]>(() => {
    if (!state) {
      return [];
    }

    return state.positions;
  }, [state]);

  if (loading) {
    return <p className={styles.infoText}>Loading Platinum model...</p>;
  }

  if (!state) {
    return <p className={styles.errorText}>{errorMessage || "Unable to load Platinum state."}</p>;
  }

  return (
    <section className={styles.consoleWrap}>
      <div className={styles.toolbar}>
        <div>
          <p className={styles.userRow}>Signed in as {userEmail}</p>
          <p className={styles.infoText}>Model capital starts at {currency.format(state.portfolio.startingCash)} and executes fake trades from BUY/SELL recommendations.</p>
          <p className={styles.infoText}>Universe scanned: {state.universeSize} ASX tickers (configurable via PLATINUM_ASX_UNIVERSE).</p>
        </div>
        <button className={styles.scanButton} onClick={() => void runDailyScan()} disabled={runningScan}>
          {runningScan ? "Running Scan..." : "Run Daily Scan"}
        </button>
      </div>

      {statusMessage ? <p className={styles.successText}>{statusMessage}</p> : null}
      {errorMessage ? <p className={styles.errorText}>{errorMessage}</p> : null}

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
          <p>{state.portfolio.lastScanAt ? new Date(state.portfolio.lastScanAt).toLocaleString("en-AU") : "Never"}</p>
        </article>
      </div>

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
          <h3>Latest Recommendations ({topRecommendations.length})</h3>
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
                    <th>Price</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {topRecommendations.map((recommendation) => (
                    <tr key={recommendation.id}>
                      <td>{recommendation.ticker}</td>
                      <td className={recommendation.action === "buy" ? styles.positive : recommendation.action === "sell" ? styles.negative : ""}>
                        {recommendation.action.toUpperCase()}
                      </td>
                      <td>{recommendation.score.toFixed(2)}</td>
                      <td>{currency.format(recommendation.price)}</td>
                      <td>{recommendation.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

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
                    <td className={trade.side === "buy" ? styles.positive : styles.negative}>{trade.side.toUpperCase()}</td>
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
