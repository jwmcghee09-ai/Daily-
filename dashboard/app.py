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

from market_scanner.scanner import scan_tickers  # noqa: E402

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
SYSTEM_PROMPT = "You are a trading analyst assistant. Answer concisely."


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
        results = scan_tickers(ticker_list)
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
