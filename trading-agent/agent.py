import os
import json
import requests
from datetime import datetime
from pathlib import Path

from groq import Groq
from dotenv import load_dotenv

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

from alpaca_tools import (
    get_account, get_portfolio, get_stock_price, get_bars,
    get_technical_analysis, place_order, get_open_orders, cancel_all_orders,
)
from memory import read_memory, write_memory, log_trade, get_trade_history

GROQ_MODEL     = "llama-3.3-70b-versatile"
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


SYSTEM = """You are Myrmidon — an autonomous trading agent managing an Alpaca paper account.

SESSION STEPS:
1. READ MEMORY — load current strategy and lessons
2. REVIEW ACCOUNT — check balance, positions, recent trades, P&L
3. ANALYSE MARKETS — call get_technical_analysis for each watchlist symbol.
   Evaluate: trend direction (EMAs, ADX), momentum (MACD, RSI), volatility (ATR, Bollinger Bands), volume.
   Only trade when multiple indicators align — require at least 3 confluent signals.
4. EXECUTE — place orders that fit the rules below
5. LOG — call log_trade for every order placed
6. UPDATE MEMORY — write refined strategy and any new lessons

ANALYSIS FRAMEWORK:
- Trend: price above EMA50 and EMA200 = uptrend. Golden cross (EMA50 > EMA200) = bullish bias.
- Momentum: MACD histogram positive and rising = buy momentum. RSI 40-60 = healthy trend, >70 = overbought, <30 = oversold.
- Volatility: ATR tells you position size risk. Bollinger pct_b >0.8 = extended, <0.2 = compressed.
- Volume: ratio >2x = conviction behind the move. Low volume breakouts are fakeouts.
- ADX >25 = trending market (use trend-following). ADX <20 = ranging (use mean reversion or stay flat).

SIGNAL CONFLUENCE RULES:
- BUY: uptrend (above EMA50) + MACD bullish crossover + RSI 45-65 + volume ratio >1.5
- SELL/SHORT: downtrend (below EMA50) + MACD bearish + RSI >70 or <30 + high ADX
- SKIP: ADX <20 and no clear Bollinger signal — choppy market, don't trade

PORTFOLIO RULES:
- Core sleeve (70%): SPY 40%, QQQ 20%, VEA 15% — only rebalance if >5% off target
- Satellite sleeve (30%): active trades — max 10% per position
- Always keep ≥20% cash
- Stop-loss: cut at -15% unrealised P&L
- Never chase: don't add to a position up >30% in 2 weeks

CURRENCY RULE (AUD/USD):
- If AUD/USD < 0.65: prefer unhedged US exposure (USD strength = bonus return in AUD)
- If AUD/USD > 0.65: note hedging recommendation in memory for manual execution"""

TOOLS = [
    {"type": "function", "function": {"name": "get_account",             "description": "Get Alpaca account balance and buying power.",          "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "get_portfolio",           "description": "Get all open positions with P&L.",                      "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "get_stock_price",         "description": "Get current live price for a symbol.",                  "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}}, "required": ["symbol"]}}},
    {"type": "function", "function": {"name": "get_technical_analysis",  "description": "Get full technical analysis (RSI, MACD, Bollinger, ATR, ADX, EMAs, volume) for a symbol using 200 days of data. Always call this before trading a symbol.", "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}}, "required": ["symbol"]}}},
    {"type": "function", "function": {"name": "get_bars",                "description": "Get raw OHLCV daily bars for a symbol.",                "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}, "days": {"type": "integer"}}, "required": ["symbol"]}}},
    {"type": "function", "function": {"name": "place_order",             "description": "Place a buy or sell market order.",                     "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}, "qty": {"type": "number"}, "side": {"type": "string", "enum": ["buy", "sell"]}}, "required": ["symbol", "qty", "side"]}}},
    {"type": "function", "function": {"name": "get_open_orders",         "description": "Get all open/pending orders.",                          "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "cancel_all_orders",       "description": "Cancel all open orders.",                               "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "read_memory",             "description": "Read strategy memory and past lessons.",                 "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {"name": "write_memory",            "description": "Update strategy memory with refined strategy and lessons.", "parameters": {"type": "object", "properties": {"strategy": {"type": "string"}, "lesson": {"type": "string"}}, "required": ["strategy"]}}},
    {"type": "function", "function": {"name": "log_trade",               "description": "Log a completed trade.",                                "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}, "side": {"type": "string"}, "qty": {"type": "number"}, "price": {"type": "number"}, "reason": {"type": "string"}}, "required": ["symbol", "side", "qty", "price", "reason"]}}},
    {"type": "function", "function": {"name": "get_trade_history",       "description": "Get recent trade history.",                             "parameters": {"type": "object", "properties": {"days": {"type": "integer"}}, "required": []}}},
]


def run_tool(name: str, inp: dict) -> str:
    try:
        if name == "get_account":             return json.dumps(get_account())
        if name == "get_portfolio":           return json.dumps(get_portfolio())
        if name == "get_stock_price":         return json.dumps(get_stock_price(inp["symbol"]))
        if name == "get_technical_analysis":  return json.dumps(get_technical_analysis(inp["symbol"]))
        if name == "get_bars":                return json.dumps(get_bars(inp["symbol"], inp.get("days", 20)))
        if name == "place_order":             return json.dumps(place_order(inp["symbol"], inp["qty"], inp["side"]))
        if name == "get_open_orders":         return json.dumps(get_open_orders())
        if name == "cancel_all_orders":       return json.dumps(cancel_all_orders())
        if name == "read_memory":             return json.dumps(read_memory())
        if name == "write_memory":
            write_memory(inp["strategy"], inp.get("lesson"))
            return json.dumps({"ok": True})
        if name == "log_trade":
            log_trade(inp["symbol"], inp["side"], inp["qty"], inp["price"], inp["reason"])
            return json.dumps({"ok": True})
        if name == "get_trade_history":       return json.dumps(get_trade_history(inp.get("days", 7)))
        return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        return json.dumps({"error": str(e)})


def run():
    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    print(f"[{datetime.now()}] Myrmidon session starting (Groq / {GROQ_MODEL})")

    # Read scanner trigger if present
    trigger_ctx = ""
    try:
        tf = BASE / "scanner_trigger.json"
        if tf.exists():
            t = json.loads(tf.read_text())
            syms = ", ".join(t.get("priority_symbols", [])) or "none"
            trigger_ctx = (
                f"\n\n=== SCANNER ALERT (triggered {t.get('timestamp', '?')}) ==="
                f"\nPriority symbols: {syms}"
                f"\n\nAnomalies:\n{json.dumps(t.get('anomalies', []), indent=2)}"
                f"\n\nFocus on these symbols first — analyse them technically and act if warranted."
            )
            tf.unlink()
    except Exception:
        pass

    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user",   "content": f"Run your full 6-step trading session now.{trigger_ctx}"},
    ]

    for turn in range(20):
        resp    = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            max_tokens=4096,
        )
        msg     = resp.choices[0].message
        reason  = resp.choices[0].finish_reason

        # Print any text output
        if msg.content:
            print(f"[Myrmidon] {msg.content}")

        # Append assistant turn
        assistant_entry = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            assistant_entry["tool_calls"] = [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ]
        messages.append(assistant_entry)

        if reason != "tool_calls" or not msg.tool_calls:
            break

        # Execute tools and append results
        for tc in msg.tool_calls:
            inp    = json.loads(tc.function.arguments)
            print(f"  -> {tc.function.name}({json.dumps(inp)[:80]})")
            result = run_tool(tc.function.name, inp)
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

    print(f"[{datetime.now()}] Session complete. Syncing memory to SPECTRE...")
    push_memory_to_spectre()
    print(f"[{datetime.now()}] Done.")


if __name__ == "__main__":
    run()
