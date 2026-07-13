"""
dashboard/app.py - FastAPI trading terminal backend
"""

import os
import sys
import json
import asyncio
import pathlib
import httpx
import yfinance as yf
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

# ---------------------------------------------------------------------------
# Path setup so market_scanner is importable
# ---------------------------------------------------------------------------
BASE_DIR = pathlib.Path(__file__).parent
PARENT_DIR = BASE_DIR.parent
sys.path.insert(0, str(PARENT_DIR))

from market_scanner.scanner import scan_tickers, scan_with_summary, get_ticker_summary, get_ticker_fundamentals  # noqa: E402
from dashboard import alpaca_trader  # noqa: E402

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Trading Terminal")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HOLDINGS_FILE = BASE_DIR / "data" / "holdings.json"
STRATEGIES_FILE = BASE_DIR / "data" / "strategies.json"
CHAT_HISTORY_FILE = BASE_DIR / "data" / "chat_history.json"
LAST_SCAN_FILE = BASE_DIR / "data" / "last_scan.json"
STATIC_DIR = BASE_DIR / "static"
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "qwen2.5"
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
SYSTEM_PROMPT = (
    "You are an AI trading analyst for a single Alpaca paper trading account. "
    "The portfolio context (positions, cash, total value) is provided at the start of each message — use it as the source of truth. "
    "\n\n"
    "Portfolio strategy: 70% index ETFs (SPY/QQQ/EWJ rotated by market conditions), "
    "30% high-growth single stocks (swing trades, 2-8 week holds). "
    "\n\n"
    "Respond naturally to whatever the user asks. "
    "If they ask a simple question, give a short direct answer. "
    "If they ask for analysis or recommendations, be specific: include ticker, BUY/SELL/HOLD, "
    "exact share count and dollar amount, stop-loss level, and which bucket (70% index or 30% alpha). "
    "When analyzing stocks factor in: PEG ratio (prefer <1.5), analyst targets, earnings dates, RSI, volume, news. "
    "Be concise. Do not recalculate the full portfolio unprompted — only do so when the user asks for a full review."
)

INDEX_ETFS = ["SPY", "QQQ", "EWJ", "VTI"]


# ---------------------------------------------------------------------------
# Helper: holdings persistence
# ---------------------------------------------------------------------------

def load_holdings() -> list[dict]:
    if not HOLDINGS_FILE.exists():
        HOLDINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        HOLDINGS_FILE.write_text("[]")
        return []
    try:
        return json.loads(HOLDINGS_FILE.read_text())
    except Exception:
        return []


def save_holdings(holdings: list[dict]) -> None:
    HOLDINGS_FILE.write_text(json.dumps(holdings, indent=2))


# ---------------------------------------------------------------------------
# Memory: chat history + last scan
# ---------------------------------------------------------------------------

MAX_HISTORY = 20  # number of message pairs to remember

def load_chat_history() -> list[dict]:
    try:
        if CHAT_HISTORY_FILE.exists():
            return json.loads(CHAT_HISTORY_FILE.read_text())
    except Exception:
        pass
    return []


def save_chat_history(history: list[dict]) -> None:
    CHAT_HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    CHAT_HISTORY_FILE.write_text(json.dumps(history[-MAX_HISTORY * 2:], indent=2))


def load_last_scan() -> dict:
    try:
        if LAST_SCAN_FILE.exists():
            return json.loads(LAST_SCAN_FILE.read_text())
    except Exception:
        pass
    return {}


def save_last_scan(data: dict) -> None:
    LAST_SCAN_FILE.parent.mkdir(parents=True, exist_ok=True)
    LAST_SCAN_FILE.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def root():
    index = STATIC_DIR / "index.html"
    return HTMLResponse(content=index.read_text())


@app.get("/static/{path:path}")
async def static_files(path: str):
    file_path = STATIC_DIR / path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path))


@app.get("/scan")
async def scan(tickers: str = "AAPL,TSLA,NVDA"):
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not ticker_list:
        raise HTTPException(status_code=400, detail="No tickers provided")
    try:
        results = await asyncio.to_thread(scan_with_summary, ticker_list)
        from datetime import datetime
        save_last_scan({"timestamp": datetime.now().isoformat(), "tickers": ticker_list, "results": results})
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/fundamentals/{ticker}")
async def get_fundamentals(ticker: str):
    """Return fundamental data, analyst targets, earnings dates, and news for a ticker."""
    ticker = ticker.strip().upper()
    try:
        data = await asyncio.to_thread(get_ticker_fundamentals, ticker)
        return JSONResponse(content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/market-overview")
async def market_overview():
    """Scan index ETFs (SPY, QQQ, EWJ, VTI) and return their summaries."""
    try:
        summaries = await asyncio.gather(
            *(asyncio.to_thread(get_ticker_summary, t) for t in INDEX_ETFS),
            return_exceptions=True,
        )
        results = {}
        for ticker, summary in zip(INDEX_ETFS, summaries):
            if isinstance(summary, Exception):
                results[ticker] = {"error": str(summary)}
            else:
                results[ticker] = summary
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ChatMessage(BaseModel):
    message: str


def build_portfolio_context() -> str:
    """Pull live Alpaca data and format as context for the LLM."""
    lines = []
    try:
        acct = alpaca_trader.get_account()
        if not acct.get("error"):
            lines.append(
                f"ALPACA ACCOUNT: portfolio_value=${float(acct.get('portfolio_value',0)):.2f}, "
                f"cash=${float(acct.get('cash',0)):.2f}, "
                f"buying_power=${float(acct.get('buying_power',0)):.2f}, "
                f"equity=${float(acct.get('equity', acct.get('portfolio_value',0))):.2f}"
            )
    except Exception:
        pass

    try:
        positions = alpaca_trader.get_positions()
        if isinstance(positions, list) and positions:
            pos_parts = []
            for p in positions:
                ticker = p.get("ticker","?")
                qty = p.get("qty","?")
                avg = float(p.get("avg_cost", 0))
                cur = float(p.get("current_price", 0))
                mv = float(p.get("market_value", 0))
                pnl = float(p.get("pnl", 0))
                pnl_pct = float(p.get("pnl_pct", 0))
                pos_parts.append(f"{ticker}: {qty}sh avg=${avg:.2f} cur=${cur:.2f} mktval=${mv:.2f} pnl=${pnl:.2f}({pnl_pct:.2f}%)")
            lines.append("POSITIONS: " + "; ".join(pos_parts))
        else:
            lines.append("POSITIONS: none (all closed or account empty)")
    except Exception:
        lines.append("POSITIONS: unavailable")

    # Add last scan summary
    try:
        scan = load_last_scan()
        if scan.get("timestamp") and scan.get("results"):
            ts = scan["timestamp"][:16].replace("T", " ")
            anomalies = scan["results"].get("anomalies", [])
            if anomalies:
                anom_str = "; ".join(f"{a['ticker']} {a['type']} ({a['severity']})" for a in anomalies[:6])
                lines.append(f"LAST SCAN ({ts}): {anom_str}")
            else:
                lines.append(f"LAST SCAN ({ts}): no anomalies detected")
    except Exception:
        pass

    return "[LIVE PORTFOLIO CONTEXT: " + " | ".join(lines) + "]\n\n" if lines else ""


@app.post("/chat")
async def chat(body: ChatMessage):
    context = build_portfolio_context() if _alpaca_keys_configured() else ""
    user_message = context + body.message

    # Load past conversation for multi-turn memory
    history = load_chat_history()
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    async def stream_groq():
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": GROQ_MODEL,
            "messages": messages,
            "stream": True,
            "max_tokens": 1024,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", GROQ_URL, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    body_text = await resp.aread()
                    raise RuntimeError(f"Groq HTTP {resp.status_code}: {body_text[:200].decode()}")
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        yield "data: [DONE]\n\n"
                        return
                    try:
                        chunk = json.loads(data)
                        token = chunk["choices"][0]["delta"].get("content", "")
                        if token:
                            safe = token.replace("\n", "\\n")
                            yield f"data: {safe}\n\n"
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

    async def stream_ollama():
        payload = {
            "model": OLLAMA_MODEL,
            "system": SYSTEM_PROMPT,
            "prompt": user_message,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", OLLAMA_URL, json=payload) as resp:
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                        error = chunk.get("error", "")
                        if error:
                            safe = error.replace("\n", "\\n")
                            yield f"data: [Ollama error] {safe}\n\n"
                            yield "data: [DONE]\n\n"
                            return
                        token = chunk.get("response", "")
                        if token:
                            safe = token.replace("\n", "\\n")
                            yield f"data: {safe}\n\n"
                        if chunk.get("done", False):
                            yield "data: [DONE]\n\n"
                            return
                    except json.JSONDecodeError:
                        continue

    async def stream_with_fallback():
        full_response = []
        generator = stream_groq() if GROQ_API_KEY else stream_ollama()
        if GROQ_API_KEY:
            try:
                async for chunk in stream_groq():
                    if chunk.startswith("data: ") and chunk.strip() != "data: [DONE]":
                        token = chunk[6:].rstrip("\n").replace("\\n", "\n")
                        full_response.append(token)
                    yield chunk
                # Save to history
                assistant_reply = "".join(full_response)
                if assistant_reply:
                    history.append({"role": "user", "content": body.message})
                    history.append({"role": "assistant", "content": assistant_reply})
                    save_chat_history(history)
                return
            except Exception as e:
                yield f"data: [Groq unavailable, falling back to local model: {e}]\\n\n\n"
        async for chunk in stream_ollama():
            yield chunk

    return StreamingResponse(stream_with_fallback(), media_type="text/event-stream")


@app.get("/chat/history")
async def get_chat_history():
    return JSONResponse(content=load_chat_history())


@app.delete("/chat/history")
async def clear_chat_history():
    save_chat_history([])
    return {"status": "cleared"}


@app.get("/holdings")
async def get_holdings():
    return load_holdings()


class HoldingAdd(BaseModel):
    ticker: str
    shares: float
    avg_cost: float


@app.post("/holdings")
async def add_holding(body: HoldingAdd):
    ticker = body.ticker.strip().upper()
    holdings = load_holdings()

    # Fetch current price
    current_price = None
    try:
        info = yf.Ticker(ticker).fast_info
        current_price = float(info.last_price)
    except Exception:
        current_price = None

    # Update or insert
    existing = next((h for h in holdings if h["ticker"] == ticker), None)
    if existing:
        existing["shares"] = body.shares
        existing["avg_cost"] = body.avg_cost
        existing["current_price"] = current_price
    else:
        holdings.append({
            "ticker": ticker,
            "shares": body.shares,
            "avg_cost": body.avg_cost,
            "current_price": current_price,
        })

    save_holdings(holdings)
    return holdings


@app.delete("/holdings/{ticker}")
async def delete_holding(ticker: str):
    ticker = ticker.strip().upper()
    holdings = load_holdings()
    holdings = [h for h in holdings if h["ticker"] != ticker]
    save_holdings(holdings)
    return holdings


# ---------------------------------------------------------------------------
# Alpaca routes
# ---------------------------------------------------------------------------

def _alpaca_keys_configured():
    return bool(alpaca_trader.API_KEY and alpaca_trader.SECRET_KEY)


@app.get("/alpaca/account")
async def alpaca_account():
    if not _alpaca_keys_configured():
        return JSONResponse(content={"error": "Alpaca API keys not configured"})
    return JSONResponse(content=alpaca_trader.get_account())


@app.get("/alpaca/positions")
async def alpaca_positions():
    if not _alpaca_keys_configured():
        return JSONResponse(content={"error": "Alpaca API keys not configured"})
    return JSONResponse(content=alpaca_trader.get_positions())


@app.get("/alpaca/orders")
async def alpaca_orders(status: str = "open"):
    if not _alpaca_keys_configured():
        return JSONResponse(content={"error": "Alpaca API keys not configured"})
    return JSONResponse(content=alpaca_trader.get_orders(status=status))


class AlpacaOrderRequest(BaseModel):
    ticker: str
    qty: float
    side: str
    order_type: Optional[str] = "market"
    limit_price: Optional[float] = None
    stop_loss_pct: Optional[float] = None


@app.post("/alpaca/order")
async def alpaca_place_order(body: AlpacaOrderRequest):
    if not _alpaca_keys_configured():
        return JSONResponse(content={"error": "Alpaca API keys not configured"})
    result = alpaca_trader.place_order(
        ticker=body.ticker,
        qty=body.qty,
        side=body.side,
        order_type=body.order_type or "market",
        limit_price=body.limit_price,
        stop_loss_pct=body.stop_loss_pct,
    )
    return JSONResponse(content=result)


@app.delete("/alpaca/order/{order_id}")
async def alpaca_cancel_order(order_id: str):
    if not _alpaca_keys_configured():
        return JSONResponse(content={"error": "Alpaca API keys not configured"})
    return JSONResponse(content=alpaca_trader.cancel_order(order_id))


@app.delete("/alpaca/position/{ticker}")
async def alpaca_close_position(ticker: str):
    if not _alpaca_keys_configured():
        return JSONResponse(content={"error": "Alpaca API keys not configured"})
    return JSONResponse(content=alpaca_trader.close_position(ticker))


@app.get("/alpaca/clock")
async def alpaca_clock():
    if not _alpaca_keys_configured():
        return JSONResponse(content={"error": "Alpaca API keys not configured"})
    try:
        api = alpaca_trader.get_api()
        clock = api.get_clock()
        return JSONResponse(content={
            "is_open": clock.is_open,
            "next_open": str(clock.next_open),
            "next_close": str(clock.next_close),
        })
    except Exception as e:
        return JSONResponse(content={"error": str(e)})


@app.get("/prices")
async def get_prices():
    holdings = load_holdings()
    if not holdings:
        return {}

    result = {}
    for h in holdings:
        ticker = h["ticker"]
        try:
            info = yf.Ticker(ticker).fast_info
            price = float(info.last_price)
            prev_close = float(info.previous_close) if info.previous_close else price
            change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0.0
            value = price * h["shares"]
            result[ticker] = {
                "price": price,
                "change_pct": round(change_pct, 2),
                "value": round(value, 2),
            }
        except Exception as e:
            result[ticker] = {"price": None, "change_pct": None, "value": None, "error": str(e)}

    return result

# ---------------------------------------------------------------------------
# AI Strategy Profiles: continuous trade management with adaptive risk stops
# ---------------------------------------------------------------------------
import uuid
from datetime import datetime

STRATEGY_CHECK_INTERVAL = 300  # seconds
MAX_LOG_ENTRIES = 60

DESIGNER_PROMPT = (
    "You are Spectre's strategy designer. Convert the user's trading idea into a JSON "
    "strategy profile. Live market context may be provided - use it to pick sensible "
    "thresholds. Respond with ONLY valid JSON, no markdown fences, matching:\n"
    "{\n"
    '  "name": "Dip Buyer NVDA",\n'
    '  "tickers": ["NVDA"],\n'
    '  "entry": [{"indicator": "rsi|price|change_pct|volume_ratio|momentum_5d|pct_from_52w_high", "op": "<|>|<=|>=", "value": 35}],\n'
    '  "sizing": {"qty": 5} OR {"dollars": 2000},\n'
    '  "exits": {\n'
    '    "atr_mult": 2.0,\n'
    '    "trail": true,\n'
    '    "take_profit_pct": 8,\n'
    '    "tighten_rsi_above": 72,\n'
    '    "tighten_volume_below": 0.6,\n'
    '    "tighten_on_high_anomaly": true\n'
    "  },\n"
    '  "bucket": "alpha|index",\n'
    '  "summary": "one sentence describing entry, size, and exit management"\n'
    "}\n"
    "Rules: entry is a list of conditions ANDed together. All exits fields are required "
    "(pick sensible defaults if the user did not specify: atr_mult 2.0, trail true, "
    "take_profit_pct 8, tighten_rsi_above 72, tighten_volume_below 0.6, "
    "tighten_on_high_anomaly true). If the idea cannot be expressed, respond "
    '{"error": "<short reason>"}.'
)


def load_strategies() -> list:
    try:
        if STRATEGIES_FILE.exists():
            return json.loads(STRATEGIES_FILE.read_text())
    except Exception:
        pass
    return []


def save_strategies(strategies: list) -> None:
    STRATEGIES_FILE.parent.mkdir(parents=True, exist_ok=True)
    STRATEGIES_FILE.write_text(json.dumps(strategies, indent=2))


def _slog(s: dict, event: str, **extra) -> None:
    entry = {"time": datetime.now().isoformat(timespec="seconds"), "event": event}
    entry.update(extra)
    s.setdefault("log", []).append(entry)
    s["log"] = s["log"][-MAX_LOG_ENTRIES:]


# --- gentle data layer: per-ticker summary cache to avoid hammering Yahoo ---
_summary_cache = {}
SUMMARY_TTL = 240  # seconds


async def get_summary_cached(ticker: str) -> dict:
    import time
    now = time.time()
    hit = _summary_cache.get(ticker)
    if hit and now - hit[0] < SUMMARY_TTL:
        return hit[1]
    summary = await asyncio.to_thread(get_ticker_summary, ticker)
    if not summary.get("error"):
        _summary_cache[ticker] = (now, summary)
    return summary


async def groq_json(system: str, user: str) -> dict:
    """One-shot Groq call that must return JSON."""
    if not GROQ_API_KEY:
        return {"error": "GROQ_API_KEY not set - the strategy designer needs Groq"}
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": 700,
        "temperature": 0,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(GROQ_URL, headers=headers, json=payload)
        if resp.status_code != 200:
            return {"error": f"Groq HTTP {resp.status_code}"}
        content = resp.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.strip("`")
            if content.startswith("json"):
                content = content[4:]
        try:
            return json.loads(content.strip())
        except json.JSONDecodeError:
            return {"error": "Could not parse the strategy - try rephrasing"}


class StrategyDesign(BaseModel):
    text: str
    draft: Optional[dict] = None


@app.post("/strategies/design")
async def design_strategy(body: StrategyDesign):
    """Turn a plain-English idea (optionally refining an existing draft) into a profile draft."""
    user = body.text.strip()

    # Give the designer live risk-signal context for any tickers mentioned
    context_lines = []
    scan = load_last_scan()
    anomalies = (scan.get("results") or {}).get("anomalies", [])
    if anomalies:
        context_lines.append("CURRENT ANOMALIES: " + "; ".join(
            f"{a['ticker']} {a['type']} ({a['severity']})" for a in anomalies[:8]))
    words = {w.strip(",.").upper() for w in user.split()}
    for t in list(words)[:4]:
        if 1 < len(t) <= 5 and t.isalpha():
            cached = _summary_cache.get(t)
            if cached:
                d = cached[1]
                context_lines.append(
                    f"{t}: price={d.get('price')} rsi={d.get('rsi')} atr={d.get('atr')} "
                    f"vol_ratio={d.get('volume_ratio')} mom5d={d.get('momentum_5d')}")
    prompt = ""
    if context_lines:
        prompt += "[MARKET CONTEXT: " + " | ".join(context_lines) + "]\n\n"
    if body.draft:
        prompt += "Existing draft to refine:\n" + json.dumps(body.draft) + "\n\nUser adjustment: "
    prompt += user

    draft = await groq_json(DESIGNER_PROMPT, prompt)
    if draft.get("error"):
        return JSONResponse(content=draft, status_code=422)
    return JSONResponse(content=draft)


class StrategyConfirm(BaseModel):
    profile: dict


@app.post("/strategies")
async def create_strategy(body: StrategyConfirm):
    profile = body.profile
    if not profile.get("tickers") or not profile.get("entry"):
        return JSONResponse(content={"error": "Profile needs tickers and entry conditions"}, status_code=422)
    strategy = {
        "id": uuid.uuid4().hex[:8],
        "profile": profile,
        "active": True,
        "status": "scanning",
        "position": None,
        "created": datetime.now().isoformat(timespec="seconds"),
        "log": [],
    }
    _slog(strategy, f"armed: {profile.get('summary', profile.get('name', ''))}")
    strategies = load_strategies()
    strategies.append(strategy)
    save_strategies(strategies)
    return strategy


@app.get("/strategies")
async def list_strategies():
    return JSONResponse(content=load_strategies())


@app.delete("/strategies/{strategy_id}")
async def delete_strategy(strategy_id: str):
    strategies = [s for s in load_strategies() if s["id"] != strategy_id]
    save_strategies(strategies)
    return strategies


@app.post("/strategies/{strategy_id}/toggle")
async def toggle_strategy(strategy_id: str):
    strategies = load_strategies()
    for s in strategies:
        if s["id"] == strategy_id:
            s["active"] = not s["active"]
            _slog(s, "resumed" if s["active"] else "paused")
    save_strategies(strategies)
    return strategies


def _entry_met(conditions: list, summary: dict):
    """All conditions must pass. Returns (met, detail string)."""
    details = []
    for c in conditions:
        cur = summary.get(c.get("indicator"))
        target = c.get("value")
        op = c.get("op")
        if cur is None or target is None:
            return False, f"{c.get('indicator')} unavailable"
        ok = {"<": cur < target, ">": cur > target, "<=": cur <= target, ">=": cur >= target}.get(op, False)
        details.append(f"{c['indicator']}={cur}{op}{target}:{'Y' if ok else 'N'}")
        if not ok:
            return False, " ".join(details)
    return True, " ".join(details)


def _risk_deteriorating(exits: dict, summary: dict):
    """Spectre risk signals: returns list of reasons the stop should tighten."""
    reasons = []
    rsi = summary.get("rsi")
    if rsi is not None and rsi >= exits.get("tighten_rsi_above", 72):
        reasons.append(f"RSI overheated ({rsi})")
    vol = summary.get("volume_ratio")
    if vol is not None and vol <= exits.get("tighten_volume_below", 0.6):
        reasons.append(f"volume fading ({vol}x)")
    if exits.get("tighten_on_high_anomaly", True):
        for a in summary.get("anomalies", []):
            if a.get("severity") == "HIGH":
                reasons.append(f"HIGH anomaly: {a.get('type')}")
                break
    return reasons


async def _manage_strategy(s: dict) -> bool:
    """One management pass for a strategy. Returns True if state changed."""
    profile = s.get("profile", {})
    exits = profile.get("exits", {})
    changed = False

    if s.get("status") == "scanning":
        for ticker in profile.get("tickers", []):
            summary = await get_summary_cached(ticker)
            if summary.get("error"):
                continue
            met, detail = _entry_met(profile.get("entry", []), summary)
            if not met:
                continue
            price = float(summary["price"])
            atr = float(summary.get("atr") or 0) or price * 0.02
            sizing = profile.get("sizing", {})
            qty = float(sizing.get("qty") or 0)
            if not qty and sizing.get("dollars"):
                qty = max(1, int(float(sizing["dollars"]) / price))
            qty = qty or 1
            result = {"status": "paper-skip: Alpaca keys not configured"}
            if _alpaca_keys_configured():
                result = await asyncio.to_thread(
                    alpaca_trader.place_order,
                    ticker=ticker, qty=qty, side="buy", order_type="market",
                )
            if result.get("error"):
                _slog(s, f"ENTRY FAILED {ticker}: {result['error']}")
                changed = True
                continue
            stop = price - exits.get("atr_mult", 2.0) * atr
            s["status"] = "in_position"
            s["position"] = {
                "ticker": ticker, "qty": qty, "entry_price": price,
                "stop": round(stop, 2), "atr": atr, "high_water": price,
                "opened": datetime.now().isoformat(timespec="seconds"),
            }
            _slog(s, f"ENTERED {ticker}: {qty} @ ${price:.2f} ({detail}), initial stop ${stop:.2f}", order=result)
            changed = True
            break

    elif s.get("status") == "in_position" and s.get("position"):
        pos = s["position"]
        ticker = pos["ticker"]
        summary = await get_summary_cached(ticker)
        if summary.get("error"):
            return False
        price = float(summary["price"])
        atr = float(summary.get("atr") or pos.get("atr") or price * 0.02)
        pos["atr"] = atr

        # Adaptive stop: volatility-scaled, trailing, tightened on risk signals
        mult = float(exits.get("atr_mult", 2.0))
        reasons = _risk_deteriorating(exits, summary)
        if reasons:
            mult *= 0.5  # risk deteriorating -> halve the leash
        if exits.get("trail", True):
            pos["high_water"] = max(pos.get("high_water", price), price)
        anchor = pos.get("high_water", price) if exits.get("trail", True) else pos["entry_price"]
        new_stop = round(anchor - mult * atr, 2)
        if new_stop > pos["stop"]:
            _slog(s, f"stop {pos['stop']} -> {new_stop}" + (f" (tightened: {'; '.join(reasons)})" if reasons else " (trail)"))
            pos["stop"] = new_stop
            changed = True

        take_profit = pos["entry_price"] * (1 + float(exits.get("take_profit_pct", 8)) / 100)
        exit_reason = None
        if price <= pos["stop"]:
            exit_reason = f"stop hit (${price:.2f} <= ${pos['stop']:.2f})"
        elif price >= take_profit:
            exit_reason = f"take profit (${price:.2f} >= ${take_profit:.2f})"

        if exit_reason:
            result = {"status": "paper-skip: Alpaca keys not configured"}
            if _alpaca_keys_configured():
                result = await asyncio.to_thread(
                    alpaca_trader.place_order,
                    ticker=ticker, qty=pos["qty"], side="sell", order_type="market",
                )
            pnl = (price - pos["entry_price"]) * pos["qty"]
            _slog(s, f"EXITED {ticker}: {exit_reason}, est P&L ${pnl:+.2f}", order=result)
            s["status"] = "scanning"
            s["position"] = None
            changed = True

    return changed


async def evaluate_strategies():
    strategies = load_strategies()
    any_changed = False
    for s in strategies:
        if not s.get("active"):
            continue
        try:
            if await _manage_strategy(s):
                any_changed = True
        except Exception as e:
            _slog(s, f"manager error: {e}")
            any_changed = True
    if any_changed:
        save_strategies(strategies)


async def _strategy_loop():
    while True:
        try:
            await evaluate_strategies()
        except Exception:
            pass
        await asyncio.sleep(STRATEGY_CHECK_INTERVAL)


@app.on_event("startup")
async def _start_strategy_loop():
    asyncio.create_task(_strategy_loop())
