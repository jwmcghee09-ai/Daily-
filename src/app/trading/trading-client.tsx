"use client";

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from "react";
import {
  ComposedChart, LineChart, BarChart,
  Line, Bar, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell,
} from "recharts";
import type { TooltipProps } from "recharts";
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
  ema50: number | null; ema200: number | null;
  bb_band?: number | null;
}

interface Message { role: "user" | "assistant"; content: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const WATCHLIST = ["SPY","QQQ","VEA","NVDA","MSFT","AMZN","META","TSLA","AMD","GOOGL","AVGO","JPM"];
const PERIODS = [{ label: "1M", days: 30 }, { label: "3M", days: 90 }, { label: "6M", days: 180 }, { label: "1Y", days: 252 }];
const ET = "America/New_York";

// ── Helpers ───────────────────────────────────────────────────────────────────

const f = (n: string | number, d = 2) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

const pct = (n: string | number) => {
  const v = Number(n);
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
};

const usd = (n: string | number) => {
  const v = Number(n);
  return (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const sign = (n: number) => n >= 0;

function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: ET }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const h = et.getHours(), m = et.getMinutes();
  const mins = h * 60 + m;
  return mins >= 570 && mins < 960; // 9:30–16:00
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-AU", { month: "short", day: "numeric" });
}

function lessonText(l: string | { lesson: string; date: string }): string {
  return typeof l === "string" ? l : l.lesson;
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function PriceTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartBar;
  const rsiColor = d.rsi == null ? "#666" : d.rsi > 70 ? "#ff4b33" : d.rsi < 30 ? "#00e676" : "#a1a1aa";
  return (
    <div className={styles.tooltip}>
      <div className={styles.ttDate}>{label}</div>
      <div>O <b>${d.open?.toFixed(2)}</b> H <b>${d.high?.toFixed(2)}</b> L <b>${d.low?.toFixed(2)}</b> C <b>${d.close?.toFixed(2)}</b></div>
      {d.rsi != null && <div>RSI <span style={{ color: rsiColor }}>{d.rsi.toFixed(1)}</span></div>}
      {d.macd != null && <div>MACD <span style={{ color: "#ff8c40" }}>{d.macd.toFixed(3)}</span> Sig <span style={{ color: "#a1a1aa" }}>{d.signal?.toFixed(3)}</span></div>}
      {d.bb_upper != null && <div>BB <span style={{ color: "#ff4b3366" }}>{d.bb_lower?.toFixed(2)} – {d.bb_upper?.toFixed(2)}</span></div>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TradingClient() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [symbol, setSymbol] = useState("SPY");
  const [days, setDays] = useState(90);
  const [chartData, setChartData] = useState<ChartBar[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([{
    role: "assistant",
    content: "I'm Myrmidon. Ask me to analyse a position, explain a trade decision, or place an order.",
  }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"positions" | "chat" | "history">("positions");
  const [marketOpen, setMarketOpen] = useState(false);
  const [clock, setClock] = useState("");

  const chatRef = useRef<HTMLDivElement>(null);

  // Clock
  useEffect(() => {
    function tick() {
      const now = new Date();
      const et = now.toLocaleTimeString("en-US", { timeZone: ET, hour12: false });
      setClock(et + " ET");
      setMarketOpen(isMarketOpen());
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // Fetch portfolio data
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
    } catch { /* network error */ }
    finally { setDataLoading(false); }
  }, []);

  useEffect(() => {
    loadPortfolio();
    const iv = setInterval(loadPortfolio, 30_000);
    return () => clearInterval(iv);
  }, [loadPortfolio]);

  // Fetch chart data
  useEffect(() => {
    let alive = true;
    setChartLoading(true);
    fetch(`/api/trading/chart?symbol=${symbol}&days=${days}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return;
        const bars = (d.bars ?? []) as ChartBar[];
        // Pre-compute bb_band for stacked area Bollinger fill
        setChartData(bars.map(b => ({
          ...b,
          bb_band: b.bb_upper != null && b.bb_lower != null ? +(b.bb_upper - b.bb_lower).toFixed(2) : null,
        })));
      })
      .catch(() => { /* */ })
      .finally(() => { if (alive) setChartLoading(false); });
    return () => { alive = false; };
  }, [symbol, days]);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  // Send chat message
  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/trading/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      setMessages([...next, { role: "assistant", content: data.reply ?? data.error ?? "No response." }]);
      setTimeout(loadPortfolio, 2500);
    } catch {
      setMessages([...next, { role: "assistant", content: "Connection error — try again." }]);
    } finally {
      setSending(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // ── Derived account numbers ────────────────────────────────────────────────

  const equity     = account ? Number(account.equity) : 0;
  const cash       = account ? Number(account.cash) : 0;
  const lastEquity = account ? Number(account.last_equity) : 0;
  const dayPL      = equity && lastEquity ? equity - lastEquity : 0;
  const cashPct    = equity ? (cash / equity * 100) : 0;
  const totalUPL   = positions.reduce((s, p) => s + Number(p.unrealized_pl), 0);

  const latestClose = chartData.length ? chartData[chartData.length - 1].close : null;
  const latestRSI   = chartData.length ? chartData[chartData.length - 1].rsi : null;

  // Tick interval for X axis
  const tickEvery = days <= 30 ? 5 : days <= 90 ? 10 : days <= 180 ? 20 : 30;
  const xTicks = chartData.filter((_, i) => i % tickEvery === 0).map(d => d.date);

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
            <span className={styles.cardVal} style={{ color: cashPct < 20 ? "#ff4b33" : "#00e676" }}>
              ${f(cash)}
            </span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>TODAY P&amp;L</span>
            <span className={styles.cardVal} style={{ color: sign(dayPL) ? "#00e676" : "#ff4b33" }}>
              {usd(dayPL)}
            </span>
          </div>
          <div className={styles.card}>
            <span className={styles.cardLabel}>UNREALISED</span>
            <span className={styles.cardVal} style={{ color: sign(totalUPL) ? "#00e676" : "#ff4b33" }}>
              {usd(totalUPL)}
            </span>
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
          <span className={marketOpen ? styles.open : styles.closed}>
            {marketOpen ? "● OPEN" : "○ CLOSED"}
          </span>
          <span className={styles.clock}>{clock}</span>
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <div className={styles.main}>

        {/* ── LEFT: CHARTS ── */}
        <section className={styles.chartPanel}>

          {/* Symbol + period selectors */}
          <div className={styles.controls}>
            <div className={styles.symbols}>
              {WATCHLIST.map(s => (
                <button
                  key={s}
                  className={`${styles.symBtn} ${s === symbol ? styles.symActive : ""}`}
                  onClick={() => setSymbol(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className={styles.periods}>
              {PERIODS.map(p => (
                <button
                  key={p.label}
                  className={`${styles.periodBtn} ${p.days === days ? styles.periodActive : ""}`}
                  onClick={() => setDays(p.days)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {chartLoading ? (
            <div className={styles.chartLoader}>Loading {symbol}…</div>
          ) : (
            <>
              {/* Price + Bollinger + EMAs */}
              <div className={styles.chartLabel}>PRICE — BOLLINGER BANDS — EMA 50/200</div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff4b33" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#ff4b33" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e26" vertical={false} />
                  <XAxis dataKey="date" ticks={xTicks} tickFormatter={fmtDate}
                    tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#555", fontSize: 10 }}
                    axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
                  <Tooltip content={<PriceTooltip />} />

                  {/* Bollinger band fill via stacked areas */}
                  <Area type="monotone" dataKey="bb_lower" stackId="bb"
                    fill="transparent" stroke="none" dot={false} legendType="none" />
                  <Area type="monotone" dataKey="bb_band" stackId="bb"
                    fill="rgba(255,75,51,0.06)" stroke="none" dot={false} legendType="none" />

                  {/* Bollinger band lines */}
                  <Line type="monotone" dataKey="bb_upper" stroke="rgba(255,75,51,0.35)"
                    strokeDasharray="3 2" dot={false} strokeWidth={1} legendType="none" />
                  <Line type="monotone" dataKey="bb_lower" stroke="rgba(255,75,51,0.35)"
                    strokeDasharray="3 2" dot={false} strokeWidth={1} legendType="none" />

                  {/* EMAs */}
                  <Line type="monotone" dataKey="ema50" stroke="#40c4ff"
                    strokeWidth={1.5} dot={false} legendType="none" />
                  <Line type="monotone" dataKey="ema200" stroke="#ffd740"
                    strokeWidth={1.5} dot={false} legendType="none" />

                  {/* Price area */}
                  <Area type="monotone" dataKey="close" fill="url(#priceGrad)"
                    stroke="#ff4b33" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>

              {/* RSI */}
              <div className={styles.chartLabel}>RSI (14)</div>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e26" vertical={false} />
                  <XAxis dataKey="date" ticks={xTicks} tickFormatter={fmtDate}
                    tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} ticks={[30, 50, 70]}
                    tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip formatter={(v: number) => v?.toFixed(1)} labelFormatter={fmtDate} />
                  <ReferenceLine y={70} stroke="rgba(255,75,51,0.4)" strokeDasharray="3 2" />
                  <ReferenceLine y={30} stroke="rgba(0,230,118,0.4)" strokeDasharray="3 2" />
                  <ReferenceLine y={50} stroke="rgba(255,255,255,0.07)" />
                  <Line type="monotone" dataKey="rsi" stroke="#ff8c40"
                    strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>

              {/* MACD */}
              <div className={styles.chartLabel}>MACD (12/26/9)</div>
              <ResponsiveContainer width="100%" height={90}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#1e1e26" vertical={false} />
                  <XAxis dataKey="date" ticks={xTicks} tickFormatter={fmtDate}
                    tick={{ fill: "#555", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#555", fontSize: 10 }}
                    axisLine={false} tickLine={false} width={36} />
                  <Tooltip formatter={(v: number) => v?.toFixed(4)} labelFormatter={fmtDate} />
                  <ReferenceLine y={0} stroke="#333340" />
                  <Bar dataKey="histogram" maxBarSize={3}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={(entry.histogram ?? 0) >= 0 ? "#00e676" : "#ff4b33"} />
                    ))}
                  </Bar>
                  <Line type="monotone" dataKey="macd" stroke="#ff8c40"
                    strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="signal" stroke="#a1a1aa"
                    strokeWidth={1} dot={false} strokeDasharray="2 2" />
                </ComposedChart>
              </ResponsiveContainer>

              {/* Chart legend */}
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

          {/* Tabs */}
          <div className={styles.tabs}>
            {(["positions", "chat", "history"] as const).map(t => (
              <button
                key={t}
                className={`${styles.tab} ${activeTab === t ? styles.tabActive : ""}`}
                onClick={() => setActiveTab(t)}
              >
                {t === "positions" ? `POSITIONS (${positions.length})` : t === "chat" ? "MYRMIDON" : "HISTORY"}
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
                    <tr>
                      <th>SYM</th><th>QTY</th><th>ENTRY</th><th>PRICE</th><th>P&amp;L%</th><th>P&amp;L$</th><th>ALLOC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions
                      .sort((a, b) => Number(b.market_value) - Number(a.market_value))
                      .map(p => {
                        const plpc = Number(p.unrealized_plpc) * 100;
                        const pl = Number(p.unrealized_pl);
                        const alloc = equity ? (Number(p.market_value) / equity * 100) : 0;
                        const pos = plpc >= 0;
                        return (
                          <tr key={p.symbol}>
                            <td>
                              <button className={styles.symLink} onClick={() => setSymbol(p.symbol)}>
                                {p.symbol}
                              </button>
                              <div className={styles.allocBar}>
                                <div className={styles.allocFill} style={{ width: `${Math.min(alloc * 2.5, 100)}%` }} />
                              </div>
                            </td>
                            <td>{Number(p.qty).toFixed(0)}</td>
                            <td>${Number(p.avg_entry_price).toFixed(2)}</td>
                            <td>${Number(p.current_price).toFixed(2)}</td>
                            <td style={{ color: pos ? "#00e676" : "#ff4b33" }}>
                              {pos ? "+" : ""}{plpc.toFixed(2)}%
                            </td>
                            <td style={{ color: pos ? "#00e676" : "#ff4b33" }}>
                              {pl >= 0 ? "+" : "-"}${Math.abs(pl).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </td>
                            <td style={{ color: "#666" }}>{alloc.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}

              {/* Scanner / Strategy summary */}
              {memory?.strategy && (
                <div className={styles.strategyBox}>
                  <div className={styles.strategyLabel}>STRATEGY MEMORY</div>
                  <div className={styles.strategyText}>{memory.strategy.slice(0, 400)}{memory.strategy.length > 400 ? "…" : ""}</div>
                  {memory.updatedAt && (
                    <div className={styles.strategyDate}>Last updated: {memory.updatedAt.slice(0, 16).replace("T", " ")}</div>
                  )}
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
                    <div className={styles.msgRole}>{m.role === "user" ? "YOU" : "MYRMIDON"}</div>
                    <div className={styles.msgContent}>{m.content}</div>
                  </div>
                ))}
                {sending && (
                  <div className={styles.assistantMsg}>
                    <div className={styles.msgRole}>MYRMIDON</div>
                    <div className={styles.thinking}>Analysing<span className={styles.dots}>...</span></div>
                  </div>
                )}
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
              <div className={styles.chatHint}>Shift+Enter for new line. Myrmidon can check balances, analyse stocks, and place orders.</div>
            </div>
          )}

          {/* ── HISTORY ── */}
          {activeTab === "history" && (
            <div className={styles.tabContent}>
              {memory?.lessons && memory.lessons.length > 0 ? (
                <>
                  <div className={styles.sectionLabel}>LESSONS LEARNED</div>
                  <div className={styles.lessonList}>
                    {[...memory.lessons].reverse().map((l, i) => (
                      <div key={i} className={styles.lessonItem}>
                        {typeof l !== "string" && l.date && (
                          <div className={styles.lessonDate}>{l.date}</div>
                        )}
                        <div className={styles.lessonText}>{lessonText(l)}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.empty}>No lessons recorded yet — run the agent to generate insights.</div>
              )}

              {memory?.strategy && (
                <>
                  <div className={styles.sectionLabel} style={{ marginTop: 20 }}>FULL STRATEGY</div>
                  <pre className={styles.strategyFull}>{memory.strategy}</pre>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
