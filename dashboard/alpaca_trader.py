"""
dashboard/alpaca_trader.py - Alpaca brokerage integration
"""

import os
import alpaca_trade_api as tradeapi

API_KEY = os.environ.get("ALPACA_API_KEY")
SECRET_KEY = os.environ.get("ALPACA_SECRET_KEY")
BASE_URL = "https://paper-api.alpaca.markets"


def get_api():
    return tradeapi.REST(API_KEY, SECRET_KEY, BASE_URL, api_version='v2')


def get_account() -> dict:
    try:
        api = get_api()
        acct = api.get_account()
        equity = float(acct.equity)
        last_equity = float(acct.last_equity)
        pnl_today = equity - last_equity
        pnl_today_pct = (pnl_today / last_equity * 100) if last_equity else 0.0
        return {
            "buying_power": float(acct.buying_power),
            "portfolio_value": float(acct.portfolio_value),
            "cash": float(acct.cash),
            "equity": equity,
            "pnl_today": round(pnl_today, 2),
            "pnl_today_pct": round(pnl_today_pct, 4),
            "status": acct.status,
        }
    except Exception as e:
        return {"error": str(e)}


def get_positions() -> list:
    try:
        api = get_api()
        positions = api.list_positions()
        result = []
        for pos in positions:
            qty = float(pos.qty)
            avg_cost = float(pos.avg_entry_price)
            current_price = float(pos.current_price)
            market_value = float(pos.market_value)
            pnl = float(pos.unrealized_pl)
            pnl_pct = float(pos.unrealized_plpc) * 100
            result.append({
                "ticker": pos.symbol,
                "qty": qty,
                "avg_cost": avg_cost,
                "current_price": current_price,
                "market_value": market_value,
                "pnl": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 4),
                "side": pos.side,
            })
        return result
    except Exception as e:
        return {"error": str(e)}


def get_orders(status="open") -> list:
    try:
        api = get_api()
        orders = api.list_orders(status=status)
        result = []
        for o in orders:
            result.append({
                "id": o.id,
                "ticker": o.symbol,
                "qty": float(o.qty) if o.qty else None,
                "side": o.side,
                "type": o.type,
                "status": o.status,
                "limit_price": float(o.limit_price) if o.limit_price else None,
                "submitted_at": str(o.submitted_at) if o.submitted_at else None,
            })
        return result
    except Exception as e:
        return {"error": str(e)}


def place_order(ticker, qty, side, order_type="market", limit_price=None, stop_loss_pct=None) -> dict:
    try:
        api = get_api()
        ticker = ticker.upper()
        kwargs = {
            "symbol": ticker,
            "qty": qty,
            "side": side,
            "type": order_type,
            "time_in_force": "gtc" if order_type == "limit" else "day",
        }
        if order_type == "limit" and limit_price is not None:
            kwargs["limit_price"] = str(limit_price)

        order = api.submit_order(**kwargs)

        # Place stop-loss if requested
        if stop_loss_pct is not None:
            try:
                # Determine entry price for stop loss calculation
                if limit_price is not None:
                    entry_price = float(limit_price)
                else:
                    # Use last price
                    bar = api.get_latest_trade(ticker)
                    entry_price = float(bar.price)
                stop_price = round(entry_price * (1 - float(stop_loss_pct) / 100), 2)
                stop_side = "sell" if side == "buy" else "buy"
                api.submit_order(
                    symbol=ticker,
                    qty=qty,
                    side=stop_side,
                    type="stop",
                    time_in_force="gtc",
                    stop_price=str(stop_price),
                )
            except Exception:
                pass  # Non-fatal: main order already placed

        # Estimate value
        estimated_value = None
        try:
            if limit_price is not None:
                estimated_value = round(float(limit_price) * float(qty), 2)
            else:
                bar = api.get_latest_trade(ticker)
                estimated_value = round(float(bar.price) * float(qty), 2)
        except Exception:
            pass

        return {
            "id": order.id,
            "ticker": order.symbol,
            "qty": float(order.qty) if order.qty else qty,
            "side": order.side,
            "status": order.status,
            "estimated_value": estimated_value,
        }
    except Exception as e:
        return {"error": str(e)}


def cancel_order(order_id) -> dict:
    try:
        api = get_api()
        api.cancel_order(order_id)
        return {"cancelled": order_id}
    except Exception as e:
        return {"error": str(e)}


def close_position(ticker) -> dict:
    try:
        api = get_api()
        result = api.close_position(ticker.upper())
        return {
            "id": result.id,
            "ticker": result.symbol,
            "status": result.status,
        }
    except Exception as e:
        return {"error": str(e)}


def is_market_open() -> bool:
    try:
        api = get_api()
        clock = api.get_clock()
        return clock.is_open
    except Exception:
        return False
