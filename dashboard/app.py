"""
dashboard/app.py - FastAPI trading terminal backend
"""

import os
import sys
import json
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
        results = scan_with_summary(ticker_list)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/fundamentals/{ticker}")
async def get_fundamentals(ticker: str):
    """Return fundamental data, analyst targets, earnings dates, and news for a ticker."""
    ticker = ticker.strip().upper()
    try:
        data = get_ticker_fundamentals(ticker)
        return JSONResponse(content=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/market-overview")
async def market_overview():
    """Scan index ETFs (SPY, QQQ, EWJ, VTI) and return their summaries."""
    try:
        results = {}
        for ticker in INDEX_ETFS:
            results[ticker] = get_ticker_summary(ticker)
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

    return "[LIVE PORTFOLIO CONTEXT: " + " | ".join(lines) + "]\n\n" if lines else ""


@app.post("/chat")
async def chat(body: ChatMessage):
    context = build_portfolio_context() if _alpaca_keys_configured() else ""
    user_message = context + body.message

    async def stream_groq():
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": GROQ_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
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
        if GROQ_API_KEY:
            try:
                async for chunk in stream_groq():
                    yield chunk
                return
            except Exception as e:
                yield f"data: [Groq unavailable, falling back to local model: {e}]\\n\n\n"
        async for chunk in stream_ollama():
            yield chunk

    return StreamingResponse(stream_with_fallback(), media_type="text/event-stream")


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
