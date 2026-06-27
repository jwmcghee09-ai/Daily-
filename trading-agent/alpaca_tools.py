import os
import json
import requests
from datetime import datetime, timedelta
from indicators import analyse

ALPACA_BASE = "https://paper-api.alpaca.markets/v2"
ALPACA_DATA = "https://data.alpaca.markets/v2"


def _headers():
    return {
        "APCA-API-KEY-ID":     os.environ["ALPACA_API_KEY"],
        "APCA-API-SECRET-KEY": os.environ["ALPACA_API_SECRET"],
    }


def get_account():
    r = requests.get(f"{ALPACA_BASE}/account", headers=_headers(), timeout=10)
    return r.json()


def get_portfolio():
    r = requests.get(f"{ALPACA_BASE}/positions", headers=_headers(), timeout=10)
    return r.json() if r.ok else []


def get_stock_price(symbol: str):
    r = requests.get(
        f"{ALPACA_DATA}/stocks/{symbol}/trades/latest",
        headers=_headers(),
        params={"feed": "iex"},
        timeout=10,
    )
    if r.ok:
        price = r.json().get("trade", {}).get("p")
        return {"symbol": symbol, "price": price}
    return {"symbol": symbol, "price": None, "error": r.text}


def get_bars(symbol: str, days: int = 5):
    end   = datetime.utcnow()
    start = end - timedelta(days=days + 4)
    r = requests.get(
        f"{ALPACA_DATA}/stocks/{symbol}/bars",
        headers=_headers(),
        params={
            "timeframe": "1Day",
            "start":     start.strftime("%Y-%m-%dT00:00:00Z"),
            "end":       end.strftime("%Y-%m-%dT00:00:00Z"),
            "limit":     days,
            "feed":      "iex",
        },
        timeout=10,
    )
    return r.json().get("bars", []) if r.ok else []


def get_technical_analysis(symbol: str):
    """Fetch 200 daily bars and compute full technical indicator suite."""
    end   = datetime.utcnow()
    start = end - timedelta(days=300)
    r = requests.get(
        f"{ALPACA_DATA}/stocks/{symbol}/bars",
        headers=_headers(),
        params={
            "timeframe": "1Day",
            "start":     start.strftime("%Y-%m-%dT00:00:00Z"),
            "end":       end.strftime("%Y-%m-%dT00:00:00Z"),
            "limit":     220,
            "feed":      "iex",
        },
        timeout=15,
    )
    if not r.ok:
        return {"symbol": symbol, "error": r.text}
    bars = r.json().get("bars", [])
    result = analyse(bars)
    result["symbol"] = symbol
    return result


def place_order(symbol: str, qty: float, side: str):
    r = requests.post(
        f"{ALPACA_BASE}/orders",
        headers=_headers(),
        json={
            "symbol":        symbol,
            "qty":           qty,
            "side":          side,
            "type":          "market",
            "time_in_force": "day",
        },
        timeout=10,
    )
    return r.json()


def get_open_orders():
    r = requests.get(
        f"{ALPACA_BASE}/orders",
        headers=_headers(),
        params={"status": "open"},
        timeout=10,
    )
    return r.json() if r.ok else []


def cancel_all_orders():
    r = requests.delete(f"{ALPACA_BASE}/orders", headers=_headers(), timeout=10)
    return {"cancelled": r.status_code in (200, 207), "status": r.status_code}
