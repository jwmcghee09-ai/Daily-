"""
dashboard/app.py - FastAPI trading terminal backend
"""

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
SYSTEM_PROMPT = (
    "You are an AI trading analyst managing a hybrid portfolio: 70% in index funds "
    "(SPY/QQQ/EWJ rotated by market conditions) and 30% in high-growth single stocks "
    "(medium swing trade, 2-8 week holds). "
    "\n\n"
    "When analyzing anomalies, always include: signal strength, suggested action "
    "(BUY/SELL/HOLD/WATCH), position size as % of the 30% allocation, and stop-loss level. "
    "For index rotation decisions, compare momentum and RSI across SPY/QQQ/EWJ."
    "\n\n"
    "Fundamentals and news data are now available for each ticker. When making recommendations, "
    "factor in: upcoming earnings dates (avoid entering positions just before earnings unless "
    "the setup is very strong), P/E vs growth rate (PEG ratio — prefer PEG < 1.5 for growth "
    "plays), analyst price targets and upside %, analyst consensus (buy/hold/sell), and recent "
    "news sentiment (positive catalysts support long trades; negative news or regulatory risk "
    "warrants caution or a tighter stop-loss)."
    "\n\n"
    "Be concise and decisive. Always give a clear recommendation."
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


@app.post("/chat")
async def chat(body: ChatMessage):
    async def stream_ollama():
        payload = {
            "model": OLLAMA_MODEL,
            "system": SYSTEM_PROMPT,
            "prompt": body.message,
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", OLLAMA_URL, json=payload) as resp:
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                            token = chunk.get("response", "")
                            if token:
                                # Escape newlines for SSE
                                safe = token.replace("\n", "\\n")
                                yield f"data: {safe}\n\n"
                            if chunk.get("done", False):
                                yield "data: [DONE]\n\n"
                                return
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            yield f"data: ERROR: {e}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream_ollama(), media_type="text/event-stream")


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
