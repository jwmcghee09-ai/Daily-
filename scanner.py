#!/usr/bin/env python3
"""
scanner.py — Myrmidon 5-minute market anomaly scanner.
Runs during US market hours, uses Haiku (cheap) to triage,
invokes agent.py (Opus) only when actionable.
"""

import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import anthropic
import requests
from dotenv import load_dotenv

load_dotenv("C:/trading-agent/.env")

# ── Config ────────────────────────────────────────────────────────────────────
ALPACA_BASE  = "https://paper-api.alpaca.markets/v2"
ALPACA_DATA  = "https://data.alpaca.markets/v2"
STATE_FILE   = Path("C:/trading-agent/scanner_state.json")
LOG_FILE     = Path("C:/trading-agent/scanner.log")
TRIGGER_FILE = Path("C:/trading-agent/scanner_trigger.json")

MAX_OPUS_PER_DAY   = 5
HARD_USD_CAP       = 3.0
COOLDOWN_MINUTES   = 30

WATCHLIST_EXTRA = [
    "NVDA","MSFT","GOOGL","AMZN","META","TSLA","AVGO",
    "JPM","V","UNH","LLY","XOM","COST","NFLX","AMD",
]

HAIKU_MODEL = "claude-haiku-4-5"
ET = ZoneInfo("America/New_York")
# ─────────────────────────────────────────────────────────────────────────────


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def alpaca_headers() -> dict:
    return {
        "APCA-API-KEY-ID":     os.environ["ALPACA_API_KEY"],
        "APCA-API-SECRET-KEY": os.environ["ALPACA_API_SECRET"],
    }


def is_market_open() -> bool:
    now = datetime.now(ET)
    if now.weekday() >= 5:
        return False
    open_  = now.replace(hour=9,  minute=30, second=0, microsecond=0)
    close_ = now.replace(hour=16, minute=0,  second=0, microsecond=0)
    return open_ <= now <= close_


def load_state() -> dict:
    today = datetime.now(ET).strftime("%Y-%m-%d")
    if STATE_FILE.exists():
        try:
            s = json.loads(STATE_FILE.read_text())
            if s.get("date") == today:
                return s
        except Exception:
            pass
    return {"date": today, "opus_count": 0, "cost_usd": 0.0, "cooldowns": {}}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def in_cooldown(state: dict, symbol: str) -> bool:
    ts = state["cooldowns"].get(symbol)
    if not ts:
        return False
    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(ts)).total_seconds() / 60
    return elapsed < COOLDOWN_MINUTES


def set_cooldown(state: dict, symbol: str):
    state["cooldowns"][symbol] = datetime.now(timezone.utc).isoformat()


def fetch_positions() -> list:
    r = requests.get(f"{ALPACA_BASE}/positions", headers=alpaca_headers(), timeout=10)
    return r.json() if r.ok else []


def fetch_bars(symbols: list, limit: int = 26) -> dict:
    if not symbols:
        return {}
    r = requests.get(
        f"{ALPACA_DATA}/stocks/bars",
        headers=alpaca_headers(),
        params={"symbols": ",".join(symbols), "timeframe": "5Min", "limit": limit, "feed": "iex"},
        timeout=15,
    )
    return r.json().get("bars", {}) if r.ok else {}


def rsi(closes: list, period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    gains = [max(closes[i] - closes[i-1], 0) for i in range(1, len(closes))]
    losses = [max(closes[i-1] - closes[i], 0) for i in range(1, len(closes))]
    ag = sum(gains[-period:]) / period
    al = sum(losses[-period:]) / period
    return 100.0 if al == 0 else 100 - 100 / (1 + ag / al)


def detect_anomalies(symbol: str, bars: list, position: dict | None) -> dict | None:
    if len(bars) < 10:
        return None

    closes  = [b["c"] for b in bars]
    volumes = [b["v"] for b in bars]
    cur_c, cur_v = closes[-1], volumes[-1]

    avg_v  = sum(volumes[:-1]) / len(volumes[:-1])
    mean_c = sum(closes[:-1]) / len(closes[:-1])
    std_c  = (sum((c - mean_c) ** 2 for c in closes[:-1]) / len(closes[:-1])) ** 0.5
    z      = (cur_c - mean_c) / std_c if std_c > 0 else 0
    vr     = cur_v / avg_v if avg_v > 0 else 1
    r      = rsi(closes)

    pos_pnl = None
    if position:
        try:
            pos_pnl = float(position.get("unrealized_plpc", 0)) * 100
        except (ValueError, TypeError):
            pass

    triggers = []
    if abs(z) >= 2.0:
        triggers.append(f"price {'+' if z > 0 else ''}{z:.1f}σ")
    if vr >= 3.0:
        triggers.append(f"volume {vr:.1f}x avg")
    if r is not None and r < 25:
        triggers.append(f"RSI oversold {r:.0f}")
    if r is not None and r > 75:
        triggers.append(f"RSI overbought {r:.0f}")
    if pos_pnl is not None and pos_pnl <= -5.0:
        triggers.append(f"position {pos_pnl:.1f}% (stop-watch)")
    if pos_pnl is not None and pos_pnl >= 20.0:
        triggers.append(f"position +{pos_pnl:.1f}% (trim?)")

    if not triggers:
        return None

    return {
        "symbol":      symbol,
        "price":       cur_c,
        "z_score":     round(z, 2),
        "vol_ratio":   round(vr, 2),
        "rsi":         round(r, 1) if r else None,
        "pos_pnl_pct": round(pos_pnl, 2) if pos_pnl is not None else None,
        "triggers":    triggers,
        "in_portfolio": position is not None,
    }


def ask_haiku(anomalies: list, positions: list, state: dict) -> dict:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    pos_summary = ", ".join(
        f"{p['symbol']}({float(p.get('unrealized_plpc',0))*100:.1f}%)" for p in positions
    )
    budget_left = MAX_OPUS_PER_DAY - state["opus_count"]
    cost_left   = HARD_USD_CAP - state["cost_usd"]

    msg = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=200,
        messages=[{"role": "user", "content": f"""Trading scanner triage. Paper account ~$106k USD.

Positions: {pos_summary}

Anomalies:
{json.dumps(anomalies, indent=2)}

Remaining budget: {budget_left} agent invocations, ${cost_left:.2f} USD today.

Reply in JSON only:
{{"action":"invoke"|"skip","reason":"one sentence","priority":["SYM1"]}}

Invoke only for genuine opportunities or position risk. Skip noise."""}],
    )

    state["cost_usd"] = round(state["cost_usd"] + 0.002, 4)

    try:
        text = msg.content[0].text.strip().strip("```json").strip("```").strip()
        return json.loads(text)
    except Exception as e:
        log(f"Haiku parse error: {e}")
        return {"action": "skip", "reason": "parse error", "priority": []}


def invoke_agent(anomalies: list, priority: list):
    TRIGGER_FILE.write_text(json.dumps({
        "trigger":          "scanner",
        "anomalies":        anomalies,
        "priority_symbols": priority,
        "timestamp":        datetime.now(ET).isoformat(),
    }, indent=2))
    log(f"Triggering agent.py — priority: {priority}")
    subprocess.Popen(
        [sys.executable, "C:/trading-agent/agent.py"],
        cwd="C:/trading-agent",
        creationflags=0x00000008,  # DETACHED_PROCESS on Windows
    )


def main():
    log("── scan start ──")

    if not is_market_open():
        log("Market closed — exit")
        return

    state = load_state()

    if state["opus_count"] >= MAX_OPUS_PER_DAY:
        log(f"Opus cap {MAX_OPUS_PER_DAY}/day reached — exit")
        return
    if state["cost_usd"] >= HARD_USD_CAP:
        log(f"Cost cap ${HARD_USD_CAP} reached — exit")
        return

    positions   = fetch_positions()
    pos_symbols = [p["symbol"] for p in positions if p.get("symbol")]
    watchlist   = list(dict.fromkeys(pos_symbols + WATCHLIST_EXTRA))
    log(f"Positions: {pos_symbols}  |  Watching {len(watchlist)} symbols")

    bars_map = fetch_bars(watchlist)
    pos_map  = {p["symbol"]: p for p in positions}

    anomalies = []
    for sym in watchlist:
        if in_cooldown(state, sym):
            continue
        feat = detect_anomalies(sym, bars_map.get(sym, []), pos_map.get(sym))
        if feat:
            log(f"  ⚡ {sym}: {', '.join(feat['triggers'])}")
            anomalies.append(feat)

    if not anomalies:
        log("No anomalies — done")
        save_state(state)
        return

    log(f"{len(anomalies)} anomaly(ies) — asking Haiku")
    decision = ask_haiku(anomalies, positions, state)
    log(f"Haiku → {decision.get('action')}: {decision.get('reason')}")

    if decision.get("action") == "invoke":
        for a in anomalies:
            set_cooldown(state, a["symbol"])
        state["opus_count"] += 1
        state["cost_usd"]    = round(state["cost_usd"] + 0.30, 4)
        save_state(state)
        invoke_agent(anomalies, decision.get("priority", []))
    else:
        save_state(state)

    log("── scan end ──")


if __name__ == "__main__":
    main()
