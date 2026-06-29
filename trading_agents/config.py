"""Configuration for TradingAgents framework."""

import os

# --- Anthropic API ---
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")

# --- Model ---
MODEL: str = "claude-sonnet-4-6"
MAX_TOKENS: int = 4096

# --- Risk parameters ---
RISK_PARAMS: dict = {
    "max_position_size_pct": 0.10,   # max 10 % of portfolio in a single position
    "max_drawdown_pct": 0.05,        # stop-loss at 5 % drawdown
    "min_confidence_score": 0.60,    # minimum analyst confidence to proceed
    "allowed_sectors": [             # sectors approved for trading
        "Technology",
        "Healthcare",
        "Consumer Discretionary",
        "Financials",
        "Energy",
        "Industrials",
        "Communication Services",
        "Utilities",
        "Materials",
        "Real Estate",
        "Consumer Staples",
    ],
    "blacklisted_tickers": [],       # tickers that may never be traded
    "max_daily_trades": 5,
}

# --- Portfolio defaults ---
PORTFOLIO_VALUE: float = 1_000_000.0   # $1 M paper portfolio
