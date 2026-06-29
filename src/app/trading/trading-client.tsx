"use client";

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import {
  ComposedChart, LineChart, AreaChart,
  Line, Bar, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from "recharts";
import styles from "./trading.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountData {
  equity: string; cash: string; buying_power: string; last_equity: string;
}
interface Position {
  symbol: string; qty: string; avg_entry_price: string; current_price: string;
  market_value: string; unrealized_pl: string; unrealized_plpc: string; change_today: string;
}
interface MemoryData {
  strategy: string;
  lessons: Array<string | { lesson: string; date: string }>;
  updated?: string; updatedAt?: string;
}
interface ChartBar {
  date: string; open: number; high: number; low: number; close: number; volume: number;
  rsi: number | null; macd: number | null; signal: number | null; histogram: number | null;
  bb_upper: number | null; bb_mid: number | null; bb_lower: number | null;
  ema50: number | null; ema200: number | null; bb_band?: number | null;
}
interface ToolCall { name: string; status: "calling" | "done"; preview?: string; }
interface Message {
  role: "user" | "assistant"; content: string;
  streaming?: boolean; toolCalls?: ToolCall[]; model?: string;
}
interface Decision {
  id: number; created_at: string; user_message: string; tool_calls: string;
  ai_response: string; model: string; equity_usd: string | null; cash_usd: string | null;
}
interface AnalyticsData {
  account?: { equity: string; cash: string; buying_power: string; };
  history?: { equity: number[]; timestamp: number[]; };
  orders?: Array<{
    status: string; side: string; symbol: string;
    filled_avg_price: string; filled_qty: string; qty: string; filled_at: string | null;
  }>;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WATCHLIST = ["SPY","QQQ","VEA","NVDA","MSFT","AMZN","META","TSLA","AMD","GOOGL","AVGO","JPM"];
const PERIODS = [{ label: "1M", days: 30 }, { label: "3M", days: 90 }, { label: "6M", days: 180 }, { label: "1Y", days: 252 }];
const ET = "America/New_York";
const INITIAL_MSG: Message = {
  role: "assistant",
  content: "I'm Myrmidon. Ask me to analyse a position, explain a trade decision, or place an order.\n\nI can check your account, pull live quotes, read price charts, and execute trades on your Alpaca paper account.",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const f = (n: string | number, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const usd = (n: string | number) => {
  const v = Number(n);
  return (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const sign = (n: number) => n >= 0;

function isMarketOpen(): boolean {
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: ET }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960;
}

function fmtDate(iso: unknown): string {
  return new Date(String(iso) + "T12:00:00").toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

function lessonText(l: string | { lesson: string; date: string }): string {
  return typeof l === "string" ? l : l.lesson;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function PriceTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartBar }>; label?: string; }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rsiColor = d.rsi == null ? "#666" : d.rsi > 70 ? "#ff4b33" : d.rsi < 30 ? "#00e676" : "#a1a1aa";
  return (
    <div className={styles.tooltip}>
      <div>O <b>${d.open?.toFixed(2)}</b> H <b>${d.high?.toFixed(2)}</b> L <b>${d.low?.toFixed(2)}</b> C <b>${d.close?.toFixed(2)}</b></div>
      {d.rsi != null && <div>RSI <span style={{ color: rsiColor }}>{d.rsi.toFixed(1)}</span></div>}
      {d.macd != null && <div>MACD <span style={{ color: "#ff8c40" }}>{d.macd.toFixed(3)}</span> Sig <span style={{ color: "#a1a1aa" }}>{d.signal?.toFixed(3)}</span></div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TradingClient() {
  // Portfolio
  const [account, setAccount] = useState<AccountData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  // Chart
  const [symbol, setSymbol] = useState("SPY");
  const [days, setDays] = useState(90);
  const [chartData, setChartData] = useState<ChartBar[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  // Chat
  const [messages, setMessages] = useState<Message[]>([INITIAL_MSG]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Log
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logLoaded, setLogLoaded] = useState(false);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  // Performance
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfLoaded, setPerfLoaded] = useState(false);

  // UI
  const [activeTab, setActiveTab] = useState<"positions" | "chat" | "log" | "performance">("positions");
  const [marketOpen, setMarketOpen] = useState(false);
  const [clock, setClock] = useState("");

  const chatRef = useRef<HTMLDivElement>(null);

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      setClock(new Date().toLocaleTimeString("en-US", { timeZone: ET, hour12: false }) + " ET");
      setMarketOpen(isMarketOpen());
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Portfolio ──────────────────────────────────────────────────────────────
  const loadPortfolio = useCallback(async () => {
    try {
      const [a, p, m] = await Promise.all([
        fetch("/api/trading/account").then(r => r.json()),
        fetch("/api/trading/positions").then(r => r.json()),
        fetch("/api/trading/memory").then(r => r.json()),
      ]);
      setAccount(a as AccountData);
      if (Array.isArray(p)) setPositions(p as Position[]);
      setMemory(m as MemoryData);
    } catch { /* network */ }
    finally { setDataLoading(false); }
  }, []);

  useEffect(() => {
    loadPortfolio();
    const iv = setInterval(loadPortfolio, 30_000);
    return () => clearInterval(iv);
  }, [loadPortfolio]);

  // ── Chart ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setChartLoading(true);
    fetch(`/api/trading/chart?symbol=${symbol}&days=${days}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        const bars = (d.bars ?? []) as ChartBar[];
        setChartData(bars.map(b => ({
          ...b,
          bb_band: b.bb_upper != null && b.bb_lower != null ? +(b.bb_upper - b.bb_lower).toFixed(2) : null,
        })));
      })
      .catch(() => {})
      .finally(() => { if (alive) setChartLoading(false); });
    return () => { alive = false; };
  }, [symbol, days]);

  // ── Chat scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // ── Send (SSE streaming) ───────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    const history = messages
      .filter(m => !m.streaming && m.content)
      .map(m => ({ role: m.role, content: m.content }));
    const apiMsgs = [...history, { role: "user" as const, content: text }];
    const next: Message[] = [...messages, { role: "user", content: text }];

    setMessages([...next, { role: "assistant", content: "", streaming: true, toolCalls: [], model: "" }]);
    setInput("");
    setSending(true);

    let streamedText = "";
    let toolCalls: ToolCall[] = [];
    let modelName = "";

    try {
      const res = await fetch("/api/trading/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs }),
      });
      if (!res.body) throw new Error("no response body");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let stop = false;

      while (!stop) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let ev: { type: string; name?: string; preview?: string; delta?: string; model?: string; message?: string; };
          try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }

          if (ev.type === "tool_call" && ev.name) {
            toolCalls = [...toolCalls, { name: ev.name, status: "calling" }];
          } else if (ev.type === "tool_result" && ev.name) {
            toolCalls = toolCalls.map(tc => tc.name === ev.name ? { ...tc, status: "done" as const, preview: ev.preview } : tc);
          } else if (ev.type === "text_delta") {
            streamedText += ev.delta ?? "";
          } else if (ev.type === "done") {
            modelName = ev.model ?? "";
          } else if (ev.type === "error") {
            streamedText = "Error: " + (ev.message ?? "unknown");
            stop = true;
          } else if (ev.type === "status" && !streamedText) {
            streamedText = ev.message ?? "";
          }

          setMessages([
            ...next,
            { role: "assistant", content: streamedText, streaming: !stop && ev.type !== "done", toolCalls, model: modelName },
          ]);
        }
      }
      setMessages([...next, { role: "assistant", content: streamedText || "No response.", streaming: false, toolCalls, model: modelName }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: "Error: " + (e instanceof Error ? e.message : String(e)), toolCalls }]);
    } finally {
      setSending(false);
      setTimeout(loadPortfolio, 2000);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // ── Log ────────────────────────────────────────────────────────────────────
  const loadLog = useCallback(async (force = false) => {
    if (logLoaded && !force) return;
    setLogLoading(true);
    try {
      const r = await fetch("/api/trading/decisions?limit=50");
      const data = await r.json() as { decisions?: Decision[] };
      setDecisions(data.decisions ?? []);
      setLogLoaded(true);
    } catch { /* */ }
    finally { setLogLoading(false); }
  }, [logLoaded]);

  // ── Performance ────────────────────────────────────────────────────────────
  const loadPerf = useCallback(async (force = false) => {
    if (perfLoaded && !force) return;
    setPerfLoading(true);
    try {
      const r = await fetch("/api/trading/analytics?t=" + Date.now());
      const data = await r.json() as AnalyticsData;
      setAnalytics(data);
      setPerfLoaded(true);
    } catch { /* */ }
    finally { setPerfLoading(false); }
  }, [perfLoaded]);

  useEffect(() => {
    if (activeTab === "log") loadLog();
    if (activeTab === "performance") loadPerf();
  }, [activeTab, loadLog, loadPerf]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const equity = account ? Number(account.equity) : 0;
  const cash = account ? Number(account.cash) : 0;
  const lastEquity = account ? Number(account.last_equity) : 0;
  const dayPL = equity && lastEquity ? equity - lastEquity : 0;
  const cashPct = equity ? cash / equity * 100 : 0;
  const totalUPL = positions.reduce((s, p) => s + Number(p.unrealized_pl), 0);
  const latestClose = chartData.length ? chartData[chartData.length - 1].close : null;
  const latestRSI = chartData.length ? chartData[chartData.length - 1].rsi : null;
  const tickEvery = days <= 30 ? 5 : days <= 90 ? 10 : days <= 180 ? 20 : 30;
  const xTicks = chartData.filter((_, i) => i % tickEvery === 0).map(d => d.date);

  // Performance derived
  const perfEquity = analytics?.account ? Number(analytics.account.equity) : 0;
  const perfHistory = analytics?.history?.equity?.filter(v => v > 0) ?? [];
  const perfStart = perfHistory[0] ?? perfEquity;
  const perfReturn = perfStart > 0 ? (perfEquity - perfStart) / perfStart * 100 : 0;
  let perfMaxDd = 0;
  { let pk = perfHistory[0] ?? 0; for (const v of perfHistory) { if (v > pk) pk = v; const dd = pk > 0 ? (pk - v) / pk * 100 : 0; if (dd > perfMaxDd) perfMaxDd = dd; } }
  const equityCurve = perfHistory.map((v, i) => ({
    date: analytics?.history?.timestamp?.[i]
      ? new Date(analytics.history.timestamp[i] * 1000).toLocaleDateString("en-AU", { month: "short", day: "numeric" })
      : `D${i}`,
    equity: v,
  }));
  const fills = (analytics?.orders ?? []).filter(o => o.status === "filled" && o.filled_avg_price);
  const perfReturnColor = perfReturn >= 0 ? "#00e676" : "#ff4b33";

  // ── Splash ─────────────────────────────────────────────────────────────────
  if (dataLoading) {
    return (
      <div className={styles.splash}>
        <div className={styles.splashTitle}>MYRMIDON</div>
        <div className={styles.splashSub}>Connecting to Alpaca…</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>

      {/* ── TOP BAR ── */}
      <header className={styles.topbar}>
        <a href="/dashboard" className={styles.back}>← SPECTRE</a>
        <div className={styles.logo}>MYR<span>●</span>MIDON</div>

        <div className={styles.statCards}>
          <div className={styles.card}>
            <span className={styles.cardLabel}>PORTFOLIO</span>
            <span className={styles.cardVal}>${f(equity)}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>CASH {cashPct.toFixed(1)}%</span>
            <span className={styles.cardVal} style={{ color: cashPct < 20 ? "#ff4b33" : "#00e676" }}>${f(cash)}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>TODAY P&amp;L</span>
            <span className={styles.cardVal} style={{ color: sign(dayPL) ? "#00e676" : "#ff4b33" }}>{usd(dayPL)}</span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>UNREALISED</span>
            <span className={styles.cardVal} style={{ color: sign(totalUPL) ? "#00e676" : "#ff4b33" }}>{usd(totalUPL)}</span>
          </div>
          {latestClose && (
            <div className={styles.card}>
              <span className={styles.cardLabel}>{symbol}</span>
              <span className={styles.cardVal}>${latestClose.toFixed(2)}</span>
            </div>
          )}
          {latestRSI != null && (
            <div className={styles.card}>
              <span className={styles.cardLabel}>RSI</span>
              <span className={styles.cardVal} style={{ color: latestRSI > 70 ? "#ff4b33" : latestRSI < 30 ? "#00e676" : "#a1a1aa" }}>
                {latestRSI.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        <div className={styles.marketStatus}>
          <span className={marketOpen ? styles.open : styles.closed}>{marketOpen ? "● OPEN" : "○ CLOSED"}</span>
          <span className={styles.clock}>{clock}</span>
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <div className={styles.main}>

        {/* ── LEFT: CHARTS ── */}
        <section className={styles.chartPanel}>
          <div className={styles.controls}>
            <div className={styles.symbols}>
              {WATCHLIST.map(s => (
                <button key={s} className={`${styles.symBtn} ${s === symbol ? styles.symActive : ""}`} onClick={() => setSymbol(s)}>{s}</button>
              ))}
            </div>
            <div className={styles.periods}>
              {PERIODS.map(p => (
                <button key={p.label} className={`${styles.periodBtn} ${p.days === days ? styles.periodActive : ""}`} onClick={() => setDays(p.days)}>{p.label}</button>
              ))}
            </div>
          </div>

          {chartLoading ? (
            <div className={styles.chartLoader}>Loading {symbol}…</div>
          ) : (
            <>
              <div className={styles.chartLabel}>PRICE — BOLLINGER BANDS — EMA 50/200</div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff4b33" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#ff4b33" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e26" vertical={false} />
                  <XAxis dataKey="date" ticks={xTicks} tickFormatter={fmtDate} tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
                  <Tooltip content={<PriceTooltip />} />
                  <Area type="monotone" dataKey="bb_lower" stackId="bb" fill="transparent" stroke="none" dot={false} legendType="none" />
                  <Area type="monotone" dataKey="bb_band" stackId="bb" fill="rgba(255,75,51,0.06)" stroke="none" dot={false} legendType="none" />
                  <Line type="monotone" dataKey="bb_upper" stroke="rgba(255,75,51,0.35)" strokeDasharray="3 2" dot={false} strokeWidth={1} legendType="none" />
                  <Line type="monotone" dataKey="bb_lower" stroke="rgba(255,75,51,0.35)" strokeDasharray="3 2" dot={false} strokeWidth={1} legendType="none" />
                  <Line type="monotone" dataKey="ema50" stroke="#40c4ff" strokeWidth={1.5} dot={false} legendType="none" />
                  <Line type="monotone" dataKey="ema200" stroke="#ffd740" strokeWidth={1.5} dot={false} legendType="none" />
                  <Area type="monotone" dataKey="close" fill="url(#priceGrad)" stroke="#ff4b33" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>

              <div className={styles.chartLabel}>RSI (14)</div>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e26" vertical={false} />
                  <XAxis dataKey="date" ticks={xTicks} tickFormatter={fmtDate} tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[30, 50, 70]} tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip formatter={(v: number | undefined) => v?.toFixed(1) ?? ""} labelFormatter={fmtDate} />
                  <ReferenceLine y={70} stroke="rgba(255,75,51,0.4)" strokeDasharray="3 2" />
                  <ReferenceLine y={30} stroke="rgba(0,230,118,0.4)" strokeDasharray="3 2" />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.07)" />
                  <Line type="monotone" dataKey="rsi" stroke="#ff8c40" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>

              <div className={styles.chartLabel}>MACD (12/26/9)</div>
              <ResponsiveContainer width="100%" height={90}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e26" vertical={false} />
                  <XAxis dataKey="date" ticks={xTicks} tickFormatter={fmtDate} tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip formatter={(v: number | undefined) => v?.toFixed(4) ?? ""} labelFormatter={fmtDate} />
                  <ReferenceLine y={0} stroke="#333340" />
                  <Bar dataKey="histogram" maxBarSize={3}>
                    {chartData.map((entry, i) => <Cell key={i} fill={(entry.histogram ?? 0) >= 0 ? "#00e676" : "#ff4b33"} />)}
                  </Bar>
                  <Line type="monotone" dataKey="macd" stroke="#ff8c40" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="signal" stroke="#a1a1aa" strokeWidth={1} dot={false} strokeDasharray="2 2" />
                </ComposedChart>
              </ResponsiveContainer>

              <div className={styles.legend}>
                <span style={{ color: "#ff4b33" }}>── Price</span>
                <span style={{ color: "#40c4ff" }}>── EMA50</span>
                <span style={{ color: "#ffd740" }}>── EMA200</span>
                <span style={{ color: "rgba(255,75,51,0.5)" }}>⋯ Bollinger</span>
                <span style={{ color: "#ff8c40" }}>── MACD</span>
                <span style={{ color: "#a1a1aa" }}>⋯ Signal</span>
              </div>
            </>
          )}
        </section>

        {/* ── RIGHT: DATA PANEL ── */}
        <section className={styles.dataPanel}>
          <div className={styles.tabs}>
            {(["positions", "chat", "log", "performance"] as const).map(t => (
              <button key={t} className={`${styles.tab} ${activeTab === t ? styles.tabActive : ""}`} onClick={() => setActiveTab(t)}>
                {t === "positions" ? `POS (${positions.length})` : t === "chat" ? "MYRMIDON" : t === "log" ? "LOG" : "PERF"}
              </button>
            ))}
          </div>

          {/* ── POSITIONS ── */}
          {activeTab === "positions" && (
            <div className={styles.tabContent}>
              {positions.length === 0 ? (
                <div className={styles.empty}>No open positions</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr><th>SYM</th><th>QTY</th><th>ENTRY</th><th>PRICE</th><th>P&amp;L%</th><th>P&amp;L$</th><th>ALLOC</th></tr>
                  </thead>
                  <tbody>
                    {positions
                      .sort((a, b) => Number(b.market_value) - Number(a.market_value))
                      .map(p => {
                        const plpc = Number(p.unrealized_plpc) * 100;
                        const pl = Number(p.unrealized_pl);
                        const alloc = equity ? Number(p.market_value) / equity * 100 : 0;
                        const pos = plpc >= 0;
                        return (
                          <tr key={p.symbol}>
                            <td>
                              <button className={styles.symLink} onClick={() => setSymbol(p.symbol)}>{p.symbol}</button>
                              <div className={styles.allocBar}><div className={styles.allocFill} style={{ width: `${Math.min(alloc * 2.5, 100)}%` }} /></div>
                            </td>
                            <td>{Number(p.qty).toFixed(0)}</td>
                            <td>${Number(p.avg_entry_price).toFixed(2)}</td>
                            <td>${Number(p.current_price).toFixed(2)}</td>
                            <td style={{ color: pos ? "#00e676" : "#ff4b33" }}>{pos ? "+" : ""}{plpc.toFixed(2)}%</td>
                            <td style={{ color: pos ? "#00e676" : "#ff4b33" }}>{pl >= 0 ? "+" : "-"}${Math.abs(pl).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                            <td style={{ color: "#666" }}>{alloc.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
              {memory?.strategy && (
                <div className={styles.strategyBox}>
                  <div className={styles.strategyLabel}>STRATEGY MEMORY</div>
                  <div className={styles.strategyText}>{memory.strategy.slice(0, 400)}{memory.strategy.length > 400 ? "…" : ""}</div>
                  {memory.updatedAt && <div className={styles.strategyDate}>Updated: {memory.updatedAt.slice(0, 16).replace("T", " ")}</div>}
                </div>
              )}
            </div>
          )}

          {/* ── CHAT ── */}
          {activeTab === "chat" && (
            <div className={styles.chatWrapper}>
              <div className={styles.chatMessages} ref={chatRef}>
                {messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? styles.userMsg : styles.assistantMsg}>
                    <div className={styles.msgRole}>
                      {m.role === "user" ? "YOU" : "MYRMIDON"}
                      {m.model && <span className={styles.modelTag}>{m.model.split("/").pop()}</span>}
                    </div>
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div className={styles.toolBadges}>
                        {m.toolCalls.map((tc, ti) => (
                          <span
                            key={ti}
                            className={`${styles.toolBadge} ${tc.status === "calling" ? styles.toolBadgeCalling : styles.toolBadgeDone}`}
                            title={tc.preview ?? ""}
                          >
                            {tc.name.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className={styles.msgContent}>
                      {m.content || (m.streaming && (!m.toolCalls || m.toolCalls.length === 0) ? (
                        <span className={styles.thinking}>Analysing<span className={styles.dots}>…</span></span>
                      ) : null)}
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.chatInputArea}>
                <textarea
                  className={styles.chatInput}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask about a position, request analysis, or place a trade… (Enter to send)"
                  rows={2}
                  disabled={sending}
                />
                <button className={styles.sendBtn} onClick={sendMessage} disabled={sending || !input.trim()}>
                  {sending ? "…" : "SEND"}
                </button>
              </div>
              <div className={styles.chatHint}>Shift+Enter for new line · Myrmidon can check balances, analyse stocks, and execute trades</div>
            </div>
          )}

          {/* ── LOG ── */}
          {activeTab === "log" && (
            <div className={styles.tabContent}>
              <div className={styles.panelHeader}>
                <span className={styles.sectionLabel}>DECISION LOG</span>
                <button className={styles.refreshBtn} onClick={() => { setLogLoaded(false); loadLog(true); }}>↺ REFRESH</button>
              </div>
              {logLoading ? (
                <div className={styles.empty}>Loading…</div>
              ) : decisions.length === 0 ? (
                <div className={styles.empty}>No decisions logged yet — start chatting with Myrmidon.</div>
              ) : (
                <div className={styles.logList}>
                  {decisions.map((d, i) => {
                    let toolNames: string[] = [];
                    try { toolNames = (JSON.parse(d.tool_calls) as Array<{ name: string }>).map(t => t.name.replace(/_/g, " ")); } catch { /* */ }
                    const dt = new Date(d.created_at).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
                    const eq = d.equity_usd ? `$${Math.round(Number(d.equity_usd)).toLocaleString()}` : "";
                    const expanded = expandedLog === i;
                    return (
                      <div key={d.id} className={`${styles.logEntry} ${expanded ? styles.logEntryExpanded : ""}`}>
                        <div className={styles.logEntryHeader} onClick={() => setExpandedLog(expanded ? null : i)}>
                          <span className={styles.logDate}>{dt}</span>
                          <span className={styles.logPrompt}>{d.user_message.slice(0, 65)}{d.user_message.length > 65 ? "…" : ""}</span>
                          <div className={styles.logMeta}>
                            {eq && <span className={styles.logEq}>{eq}</span>}
                            <span className={styles.logModel}>{d.model.split("/").pop()}</span>
                            <span className={styles.logChevron}>{expanded ? "▲" : "▼"}</span>
                          </div>
                        </div>
                        {toolNames.length > 0 && (
                          <div className={styles.logTools}>
                            {toolNames.map((n, ti) => <span key={ti} className={styles.logToolTag}>{n}</span>)}
                          </div>
                        )}
                        {expanded && (
                          <div className={styles.logBody}>
                            <div className={styles.logBodyLabel}>AI RESPONSE</div>
                            <div className={styles.logBodyText}>{d.ai_response}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── PERFORMANCE ── */}
          {activeTab === "performance" && (
            <div className={styles.tabContent}>
              <div className={styles.panelHeader}>
                <span className={styles.sectionLabel}>PERFORMANCE</span>
                <button className={styles.refreshBtn} onClick={() => { setPerfLoaded(false); loadPerf(true); }}>↺ REFRESH</button>
              </div>
              {perfLoading ? (
                <div className={styles.empty}>Loading analytics…</div>
              ) : !analytics?.account ? (
                <div className={styles.empty}>{analytics?.error ?? "No data — check Alpaca keys"}</div>
              ) : (
                <>
                  <div className={styles.perfGrid}>
                    <div className={styles.perfCard}>
                      <div className={styles.perfCardLabel}>EQUITY</div>
                      <div className={styles.perfCardVal}>${f(perfEquity)}</div>
                      <div className={styles.perfCardSub}>USD</div>
                    </div>
                    <div className={styles.perfCard}>
                      <div className={styles.perfCardLabel}>30D RETURN</div>
                      <div className={styles.perfCardVal} style={{ color: perfReturnColor }}>
                        {perfReturn >= 0 ? "+" : ""}{perfReturn.toFixed(2)}%
                      </div>
                      <div className={styles.perfCardSub} style={{ color: perfReturnColor }}>
                        {perfReturn >= 0 ? "+" : ""}{usd(perfEquity - perfStart)}
                      </div>
                    </div>
                    <div className={styles.perfCard}>
                      <div className={styles.perfCardLabel}>MAX DRAWDOWN</div>
                      <div className={styles.perfCardVal} style={{ color: perfMaxDd > 5 ? "#ff4b33" : perfMaxDd > 2 ? "#ff8c40" : "#00e676" }}>
                        {perfMaxDd > 0 ? `-${perfMaxDd.toFixed(2)}%` : "0%"}
                      </div>
                      <div className={styles.perfCardSub}>30-day period</div>
                    </div>
                    <div className={styles.perfCard}>
                      <div className={styles.perfCardLabel}>TOTAL FILLS</div>
                      <div className={styles.perfCardVal}>{fills.length}</div>
                      <div className={styles.perfCardSub}>{fills.filter(o => o.side === "buy").length}B / {fills.filter(o => o.side === "sell").length}S</div>
                    </div>
                  </div>

                  {equityCurve.length > 1 && (
                    <>
                      <div className={styles.chartLabel}>30-DAY EQUITY CURVE</div>
                      <ResponsiveContainer width="100%" height={140}>
                        <AreaChart data={equityCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={perfReturnColor} stopOpacity={0.2} />
                              <stop offset="100%" stopColor={perfReturnColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="2 4" stroke="#1e1e26" vertical={false} />
                          <XAxis dataKey="date" tick={{ fill: "#555", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fill: "#555", fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${Math.round(Number(v) / 1000)}k`} width={38} />
                          <Tooltip formatter={(v: number | undefined) => v != null ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : ""} />
                          <Area type="monotone" dataKey="equity" fill="url(#eqGrad)" stroke={perfReturnColor} strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </>
                  )}

                  {fills.length > 0 && (
                    <>
                      <div className={styles.chartLabel} style={{ marginTop: 14 }}>RECENT FILLS ({fills.length})</div>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>SYM</th><th>SIDE</th>
                            <th style={{ textAlign: "right" }}>QTY</th>
                            <th style={{ textAlign: "right" }}>FILL</th>
                            <th style={{ textAlign: "right" }}>TOTAL</th>
                            <th style={{ textAlign: "right" }}>DATE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fills.slice(0, 30).map((o, i) => {
                            const price = Number(o.filled_avg_price);
                            const qty = Number(o.filled_qty || o.qty);
                            const isBuy = o.side === "buy";
                            const dt = o.filled_at ? new Date(o.filled_at).toLocaleDateString("en-AU", { month: "short", day: "numeric" }) : "—";
                            return (
                              <tr key={i}>
                                <td style={{ fontWeight: 700 }}>{o.symbol}</td>
                                <td style={{ color: isBuy ? "#00e676" : "#ff8c40" }}>{isBuy ? "BUY" : "SELL"}</td>
                                <td style={{ textAlign: "right" }}>{qty.toLocaleString()}</td>
                                <td style={{ textAlign: "right" }}>${price.toFixed(2)}</td>
                                <td style={{ textAlign: "right" }}>${Math.round(price * qty).toLocaleString()}</td>
                                <td style={{ textAlign: "right", color: "#555" }}>{dt}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
