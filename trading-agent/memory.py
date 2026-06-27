import json
from datetime import datetime, timedelta
from pathlib import Path

BASE        = Path(__file__).parent
MEMORY_FILE = BASE / "memory.json"
TRADES_FILE = BASE / "trades_log.json"


def read_memory() -> dict:
    if MEMORY_FILE.exists():
        try:
            return json.loads(MEMORY_FILE.read_text())
        except Exception:
            pass
    return {"strategy": "", "lessons": []}


def write_memory(strategy: str, lesson: str = None):
    mem = read_memory()
    mem["strategy"] = strategy
    mem["updated"]  = datetime.utcnow().isoformat()
    if lesson:
        mem.setdefault("lessons", []).append({
            "lesson": lesson,
            "date":   datetime.utcnow().strftime("%Y-%m-%d"),
        })
        mem["lessons"] = mem["lessons"][-20:]
    MEMORY_FILE.write_text(json.dumps(mem, indent=2))


def log_trade(symbol: str, side: str, qty: float, price: float, reason: str):
    trades = []
    if TRADES_FILE.exists():
        try:
            trades = json.loads(TRADES_FILE.read_text())
        except Exception:
            pass
    trades.append({
        "symbol":    symbol,
        "side":      side,
        "qty":       qty,
        "price":     price,
        "reason":    reason,
        "timestamp": datetime.utcnow().isoformat(),
    })
    TRADES_FILE.write_text(json.dumps(trades, indent=2))


def get_trade_history(days: int = 7) -> list:
    if not TRADES_FILE.exists():
        return []
    try:
        trades  = json.loads(TRADES_FILE.read_text())
        cutoff  = datetime.utcnow() - timedelta(days=days)
        return [t for t in trades if datetime.fromisoformat(t["timestamp"]) > cutoff]
    except Exception:
        return []
