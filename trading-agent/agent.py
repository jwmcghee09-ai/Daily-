import os
import json
import requests
from datetime import datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

from alpaca_tools import get_account, get_portfolio, get_stock_price, get_bars, place_order, get_open_orders, cancel_all_orders
from memory import read_memory, write_memory, log_trade, get_trade_history

SPECTRE_URL    = os.getenv("SPECTRE_URL", "").rstrip("/")
TRADING_SECRET = os.getenv("TRADING_SECRET", "")


def push_memory_to_spectre():
    if not SPECTRE_URL or not TRADING_SECRET:
        return
    try:
        mem = read_memory()
        requests.post(
            f"{SPECTRE_URL}/api/trading/memory",
            json={"strategy": mem.get("strategy", ""), "lessons": mem.get("lessons", [])},
            headers={"x-trading-secret": TRADING_SECRET},
            timeout=10,
        )
    except Exception as e:
        print(f"[memory sync] failed: {e}")


SYSTEM = """You are Myrmidon - SPECTRE's autonomous trading agent. You manage an Alpaca paper trading account.

6-STEP SESSION:
1. READ MEMORY - call read_memory to load current strategy and lessons
2. REVIEW PERFORMANCE - check account and portfolio, review recent trades
3. ANALYSE MARKETS - get prices and bars for watchlist, identify opportunities
4. EXECUTE TRADES - place orders that fit the strategy and risk rules
5. LOG TRADES - call log_trade for every order placed
6. UPDATE MEMORY - call write_memory with refined strategy and any new lessons

RULES:
- Max 10% of portfolio value per single position
- Always maintain >=20% cash floor
- Cut losses at -15% unrealised P&L per position
- Never chase a position up >30% in 2 weeks

CORE-SATELLITE ALLOCATION:
- Maintain 70-80% of portfolio in core index ETFs: SPY 40%, QQQ 20%, VEA 15%
- Only rebalance core if any position drifts >5% from target weight
- Remaining 20-30% is the active satellite sleeve
- Never sell core positions to fund satellite trades"""

TOOLS = [
    {"name": "get_account",       "description": "Get Alpaca paper account info.",           "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "get_portfolio",     "description": "Get all open positions with P&L.",         "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "get_stock_price",   "description": "Get current price for a symbol.",          "input_schema": {"type": "object", "properties": {"symbol": {"type": "string"}}, "required": ["symbol"]}},
    {"name": "get_bars",          "description": "Get daily OHLCV bars.",                    "input_schema": {"type": "object", "properties": {"symbol": {"type": "string"}, "days": {"type": "integer"}}, "required": ["symbol"]}},
    {"name": "place_order",       "description": "Place a buy or sell order.",               "input_schema": {"type": "object", "properties": {"symbol": {"type": "string"}, "qty": {"type": "number"}, "side": {"type": "string", "enum": ["buy", "sell"]}}, "required": ["symbol", "qty", "side"]}},
    {"name": "get_open_orders",   "description": "Get all open orders.",                     "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "cancel_all_orders", "description": "Cancel all open orders.",                  "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "read_memory",       "description": "Read strategy memory and lessons.",        "input_schema": {"type": "object", "properties": {}, "required": []}},
    {"name": "write_memory",      "description": "Update strategy memory.",                  "input_schema": {"type": "object", "properties": {"strategy": {"type": "string"}, "lesson": {"type": "string"}}, "required": ["strategy"]}},
    {"name": "log_trade",         "description": "Log a completed trade.",                   "input_schema": {"type": "object", "properties": {"symbol": {"type": "string"}, "side": {"type": "string"}, "qty": {"type": "number"}, "price": {"type": "number"}, "reason": {"type": "string"}}, "required": ["symbol", "side", "qty", "price", "reason"]}},
    {"name": "get_trade_history", "description": "Get recent trade history.",                "input_schema": {"type": "object", "properties": {"days": {"type": "integer"}}, "required": []}},
]


def run_tool(name: str, inp: dict) -> str:
    try:
        if name == "get_account":       return json.dumps(get_account())
        if name == "get_portfolio":     return json.dumps(get_portfolio())
        if name == "get_stock_price":   return json.dumps(get_stock_price(inp["symbol"]))
        if name == "get_bars":          return json.dumps(get_bars(inp["symbol"], inp.get("days", 5)))
        if name == "place_order":       return json.dumps(place_order(inp["symbol"], inp["qty"], inp["side"]))
        if name == "get_open_orders":   return json.dumps(get_open_orders())
        if name == "cancel_all_orders": return json.dumps(cancel_all_orders())
        if name == "read_memory":       return json.dumps(read_memory())
        if name == "write_memory":
            write_memory(inp["strategy"], inp.get("lesson"))
            return json.dumps({"ok": True})
        if name == "log_trade":
            log_trade(inp["symbol"], inp["side"], inp["qty"], inp["price"], inp["reason"])
            return json.dumps({"ok": True})
        if name == "get_trade_history": return json.dumps(get_trade_history(inp.get("days", 7)))
        return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


def run():
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    print(f"[{datetime.now()}] Myrmidon session starting")

    # Read scanner trigger if present
    _trigger_ctx = ""
    try:
        _tf = BASE / "scanner_trigger.json"
        if _tf.exists():
            _t = json.loads(_tf.read_text())
            _syms = ", ".join(_t.get("priority_symbols", [])) or "none highlighted"
            _anomalies_str = json.dumps(_t.get("anomalies", []), indent=2)
            _trigger_ctx = (
                f"\n\n=== SCANNER ALERT (auto-triggered {_t.get('timestamp', '?')}) ==="
                f"\nPriority symbols: {_syms}"
                f"\n\nAnomalies:\n{_anomalies_str}"
                f"\n\nYou were invoked by the 5-minute market scanner. "
                f"Focus on these anomalies first — check positions, assess risk, act if warranted."
            )
            _tf.unlink()
    except Exception:
        pass

    messages = [{"role": "user", "content": f"Run your full 6-step session now.{_trigger_ctx}"}]

    for _ in range(12):
        resp = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=8192,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages,
            thinking={"type": "adaptive"},
        )
        for block in resp.content:
            if hasattr(block, "text"):
                print(f"[Myrmidon] {block.text}")
        if resp.stop_reason != "tool_use":
            break
        tool_results = []
        for block in resp.content:
            if block.type == "tool_use":
                print(f"  -> {block.name}({json.dumps(block.input)[:80]})")
                result = run_tool(block.name, block.input)
                tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
        messages.append({"role": "assistant", "content": resp.content})
        messages.append({"role": "user", "content": tool_results})

    print(f"[{datetime.now()}] Session complete. Syncing memory to SPECTRE...")
    push_memory_to_spectre()
    print(f"[{datetime.now()}] Done.")


if __name__ == "__main__":
    run()
