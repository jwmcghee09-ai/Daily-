"""
Mock data tools for TradingAgents.

All functions return realistic-looking fake data so that the framework can run
without any market-data subscriptions.  A deterministic seed is derived from the
ticker so that repeated calls for the same symbol return consistent values.
"""

from __future__ import annotations

import hashlib
import math
import random
from datetime import datetime, timedelta
from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _rng(ticker: str, salt: str = "") -> random.Random:
    """Return a seeded Random instance so results are reproducible per ticker."""
    seed_bytes = hashlib.md5(f"{ticker}{salt}".encode()).digest()
    seed = int.from_bytes(seed_bytes[:8], "little")
    return random.Random(seed)


def _price_seed(ticker: str) -> float:
    """Map ticker to a plausible base price."""
    rng = _rng(ticker, "price")
    return round(rng.uniform(20.0, 800.0), 2)


# ---------------------------------------------------------------------------
# Public data tools
# ---------------------------------------------------------------------------

def get_price_history(ticker: str, days: int = 30) -> dict[str, Any]:
    """
    Return OHLCV data for the past *days* trading days.

    Returns
    -------
    dict with keys:
        ticker, days, data (list of daily bars)
    """
    rng = _rng(ticker, "ohlcv")
    base = _price_seed(ticker)
    volatility = rng.uniform(0.01, 0.04)

    bars: list[dict] = []
    price = base
    today = datetime.today()

    for i in range(days, 0, -1):
        date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_return = rng.gauss(0.0003, volatility)
        open_price = round(price, 2)
        close_price = round(price * (1 + daily_return), 2)
        high = round(max(open_price, close_price) * rng.uniform(1.001, 1.02), 2)
        low = round(min(open_price, close_price) * rng.uniform(0.98, 0.999), 2)
        volume = int(rng.uniform(500_000, 20_000_000))
        bars.append(
            {
                "date": date,
                "open": open_price,
                "high": high,
                "low": low,
                "close": close_price,
                "volume": volume,
            }
        )
        price = close_price

    return {"ticker": ticker, "days": days, "data": bars}


def get_financial_statements(ticker: str) -> dict[str, Any]:
    """
    Return simplified income statement and balance sheet data (TTM).

    Returns
    -------
    dict with keys:
        ticker, income_statement, balance_sheet, key_ratios
    """
    rng = _rng(ticker, "financials")
    revenue = rng.uniform(1e9, 5e11)
    gross_margin = rng.uniform(0.25, 0.75)
    operating_margin = gross_margin * rng.uniform(0.3, 0.7)
    net_margin = operating_margin * rng.uniform(0.6, 0.9)

    net_income = revenue * net_margin
    total_assets = revenue * rng.uniform(0.8, 3.0)
    total_debt = total_assets * rng.uniform(0.1, 0.5)
    equity = total_assets - total_debt
    shares_outstanding = rng.uniform(1e8, 1e10)
    eps = net_income / shares_outstanding
    price = _price_seed(ticker)
    pe_ratio = price / eps if eps > 0 else None

    def fmt(v: float) -> str:
        if v >= 1e9:
            return f"${v/1e9:.2f}B"
        if v >= 1e6:
            return f"${v/1e6:.2f}M"
        return f"${v:.2f}"

    return {
        "ticker": ticker,
        "income_statement": {
            "revenue_ttm": fmt(revenue),
            "gross_profit_ttm": fmt(revenue * gross_margin),
            "operating_income_ttm": fmt(revenue * operating_margin),
            "net_income_ttm": fmt(net_income),
            "gross_margin_pct": round(gross_margin * 100, 1),
            "operating_margin_pct": round(operating_margin * 100, 1),
            "net_margin_pct": round(net_margin * 100, 1),
        },
        "balance_sheet": {
            "total_assets": fmt(total_assets),
            "total_debt": fmt(total_debt),
            "shareholders_equity": fmt(equity),
            "cash_and_equivalents": fmt(total_assets * rng.uniform(0.05, 0.25)),
            "debt_to_equity": round(total_debt / equity, 2) if equity > 0 else "N/A",
        },
        "key_ratios": {
            "eps_ttm": round(eps, 2),
            "pe_ratio": round(pe_ratio, 1) if pe_ratio else "N/A",
            "price_to_book": round(price / (equity / shares_outstanding), 2),
            "return_on_equity_pct": round((net_income / equity) * 100, 1) if equity > 0 else "N/A",
            "return_on_assets_pct": round((net_income / total_assets) * 100, 1),
            "revenue_growth_yoy_pct": round(rng.uniform(-5, 35), 1),
        },
    }


def get_news_articles(ticker: str, days: int = 7) -> dict[str, Any]:
    """
    Return a list of recent mock news articles about *ticker*.

    Returns
    -------
    dict with keys:
        ticker, days, articles (list)
    """
    rng = _rng(ticker, "news")
    today = datetime.today()

    headlines_pool = [
        f"{ticker} Reports Strong Quarterly Earnings, Beats Estimates",
        f"Analysts Upgrade {ticker} on Improved Outlook",
        f"{ticker} Announces Share Buyback Program Worth $2B",
        f"Regulatory Scrutiny Increases for {ticker} Operations",
        f"{ticker} Expands Into New Markets with Strategic Acquisition",
        f"Supply Chain Disruptions Impact {ticker} Production",
        f"{ticker} CEO Discusses Growth Strategy at Investor Day",
        f"Competitors Gain Market Share Against {ticker}",
        f"{ticker} Launches Innovative Product Line",
        f"Macroeconomic Headwinds Weigh on {ticker} Shares",
        f"{ticker} Partners with Leading Tech Firm to Boost AI Capabilities",
        f"Short Sellers Increase Bets Against {ticker}",
    ]

    sentiments = ["positive", "positive", "positive", "neutral", "neutral", "negative"]
    sources = ["Reuters", "Bloomberg", "CNBC", "Wall Street Journal", "Financial Times", "MarketWatch"]

    n_articles = rng.randint(4, 8)
    articles = []
    used = set()
    for i in range(n_articles):
        idx = rng.randint(0, len(headlines_pool) - 1)
        while idx in used and len(used) < len(headlines_pool):
            idx = (idx + 1) % len(headlines_pool)
        used.add(idx)
        pub_date = (today - timedelta(days=rng.randint(0, days - 1))).strftime("%Y-%m-%d")
        articles.append(
            {
                "headline": headlines_pool[idx],
                "source": rng.choice(sources),
                "published_date": pub_date,
                "sentiment": rng.choice(sentiments),
                "relevance_score": round(rng.uniform(0.65, 0.99), 2),
                "summary": (
                    f"Article discusses recent developments at {ticker}. "
                    "Analysts and market participants are closely watching the situation."
                ),
            }
        )

    return {"ticker": ticker, "days": days, "articles": articles}


def get_social_sentiment(ticker: str, days: int = 7) -> dict[str, Any]:
    """
    Return aggregated social-media sentiment scores for *ticker*.

    Returns
    -------
    dict with keys:
        ticker, days, overall_score, breakdown (by platform), trend
    """
    rng = _rng(ticker, "sentiment")
    base_score = rng.uniform(0.35, 0.75)  # 0 = very negative, 1 = very positive

    platforms = {
        "reddit": round(base_score + rng.gauss(0, 0.08), 3),
        "twitter_x": round(base_score + rng.gauss(0, 0.08), 3),
        "stocktwits": round(base_score + rng.gauss(0, 0.05), 3),
        "news_comments": round(base_score + rng.gauss(0, 0.06), 3),
    }
    platforms = {k: max(0.0, min(1.0, v)) for k, v in platforms.items()}

    overall = round(sum(platforms.values()) / len(platforms), 3)
    trend_options = ["improving", "stable", "declining"]
    trend_weights = [0.35, 0.40, 0.25]
    trend = rng.choices(trend_options, weights=trend_weights, k=1)[0]

    daily_scores = []
    today = datetime.today()
    score = overall
    for i in range(days, 0, -1):
        date = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        score = max(0.0, min(1.0, score + rng.gauss(0, 0.03)))
        daily_scores.append({"date": date, "score": round(score, 3)})

    label = "bullish" if overall >= 0.6 else ("bearish" if overall <= 0.4 else "neutral")

    return {
        "ticker": ticker,
        "days": days,
        "overall_score": overall,
        "sentiment_label": label,
        "trend": trend,
        "breakdown": platforms,
        "daily_scores": daily_scores,
        "total_mentions": int(rng.uniform(500, 50_000)),
    }


def get_technical_indicators(ticker: str) -> dict[str, Any]:
    """
    Return common technical indicators for *ticker*.

    Returns
    -------
    dict with keys:
        ticker, price, rsi, macd, sma, bollinger_bands, volume_analysis
    """
    rng = _rng(ticker, "technicals")
    price = _price_seed(ticker)

    # RSI (0-100; >70 overbought, <30 oversold)
    rsi = round(rng.uniform(25, 80), 1)

    # MACD
    macd_line = round(rng.gauss(0, price * 0.02), 3)
    signal_line = round(macd_line + rng.gauss(0, price * 0.01), 3)
    histogram = round(macd_line - signal_line, 3)

    # SMAs
    sma_20 = round(price * rng.uniform(0.92, 1.08), 2)
    sma_50 = round(price * rng.uniform(0.88, 1.12), 2)
    sma_200 = round(price * rng.uniform(0.80, 1.20), 2)

    # Bollinger Bands (20-day, 2 std)
    bb_middle = sma_20
    std_dev = price * rng.uniform(0.015, 0.04)
    bb_upper = round(bb_middle + 2 * std_dev, 2)
    bb_lower = round(bb_middle - 2 * std_dev, 2)
    bb_width = round((bb_upper - bb_lower) / bb_middle, 4)
    bb_pct = round((price - bb_lower) / (bb_upper - bb_lower), 3) if bb_upper != bb_lower else 0.5

    # Volume trend
    avg_volume = int(rng.uniform(1_000_000, 15_000_000))
    current_volume = int(avg_volume * rng.uniform(0.6, 2.0))

    # Price vs SMAs signals
    above_sma20 = price > sma_20
    above_sma50 = price > sma_50
    above_sma200 = price > sma_200

    return {
        "ticker": ticker,
        "current_price": price,
        "rsi": {
            "value": rsi,
            "signal": "overbought" if rsi > 70 else ("oversold" if rsi < 30 else "neutral"),
        },
        "macd": {
            "macd_line": macd_line,
            "signal_line": signal_line,
            "histogram": histogram,
            "signal": "bullish" if histogram > 0 else "bearish",
        },
        "moving_averages": {
            "sma_20": sma_20,
            "sma_50": sma_50,
            "sma_200": sma_200,
            "price_vs_sma20": "above" if above_sma20 else "below",
            "price_vs_sma50": "above" if above_sma50 else "below",
            "price_vs_sma200": "above" if above_sma200 else "below",
        },
        "bollinger_bands": {
            "upper": bb_upper,
            "middle": bb_middle,
            "lower": bb_lower,
            "band_width": bb_width,
            "percent_b": bb_pct,
            "signal": "near_upper" if bb_pct > 0.8 else ("near_lower" if bb_pct < 0.2 else "middle"),
        },
        "volume_analysis": {
            "current_volume": current_volume,
            "average_volume_20d": avg_volume,
            "volume_ratio": round(current_volume / avg_volume, 2),
            "trend": "high_volume" if current_volume > avg_volume * 1.3 else (
                "low_volume" if current_volume < avg_volume * 0.7 else "normal_volume"
            ),
        },
    }


def get_insider_transactions(ticker: str) -> dict[str, Any]:
    """
    Return recent insider buy/sell transactions for *ticker*.

    Returns
    -------
    dict with keys:
        ticker, transactions (list), summary
    """
    rng = _rng(ticker, "insider")
    today = datetime.today()

    roles = ["CEO", "CFO", "COO", "Director", "VP Sales", "General Counsel", "CTO"]
    transaction_types = ["Buy", "Buy", "Sell", "Sell", "Sell"]  # insiders sell more often

    n_transactions = rng.randint(3, 8)
    transactions = []
    total_bought = 0
    total_sold = 0

    for _ in range(n_transactions):
        role = rng.choice(roles)
        txn_type = rng.choice(transaction_types)
        shares = int(rng.uniform(1_000, 200_000))
        price = _price_seed(ticker) * rng.uniform(0.97, 1.03)
        value = shares * price
        date = (today - timedelta(days=rng.randint(1, 90))).strftime("%Y-%m-%d")

        if txn_type == "Buy":
            total_bought += value
        else:
            total_sold += value

        transactions.append(
            {
                "date": date,
                "insider_role": role,
                "transaction_type": txn_type,
                "shares": shares,
                "price_per_share": round(price, 2),
                "total_value": f"${value:,.0f}",
            }
        )

    net_signal = "bullish" if total_bought > total_sold else ("bearish" if total_sold > total_bought * 1.5 else "neutral")

    return {
        "ticker": ticker,
        "transactions": sorted(transactions, key=lambda x: x["date"], reverse=True),
        "summary": {
            "total_bought_value": f"${total_bought:,.0f}",
            "total_sold_value": f"${total_sold:,.0f}",
            "net_signal": net_signal,
            "buy_to_sell_ratio": round(total_bought / total_sold, 2) if total_sold > 0 else "∞",
        },
    }


# ---------------------------------------------------------------------------
# Dispatcher  (used by agents to call tools by name)
# ---------------------------------------------------------------------------

TOOL_REGISTRY: dict[str, Any] = {
    "get_price_history": get_price_history,
    "get_financial_statements": get_financial_statements,
    "get_news_articles": get_news_articles,
    "get_social_sentiment": get_social_sentiment,
    "get_technical_indicators": get_technical_indicators,
    "get_insider_transactions": get_insider_transactions,
}


def call_tool(name: str, arguments: dict) -> Any:
    """Dispatch a tool call by name."""
    if name not in TOOL_REGISTRY:
        return {"error": f"Unknown tool: {name}"}
    try:
        return TOOL_REGISTRY[name](**arguments)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}
