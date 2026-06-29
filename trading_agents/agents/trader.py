"""
Trader agent.

Receives the bull and bear research reports, weighs both sides, and makes
a concrete BUY / SELL / HOLD decision via submit_decision.
"""

from __future__ import annotations

from trading_agents.agents.base import BaseAgent, SUBMIT_DECISION_TOOL

# The trader may also look at live price / technicals to validate entry timing
_PRICE_HISTORY_TOOL = {
    "name": "get_price_history",
    "description": "Retrieve OHLCV price history for a ticker.",
    "input_schema": {
        "type": "object",
        "properties": {
            "ticker": {"type": "string"},
            "days": {"type": "integer"},
        },
        "required": ["ticker"],
    },
}

_TECHNICAL_INDICATORS_TOOL = {
    "name": "get_technical_indicators",
    "description": "Retrieve RSI, MACD, Bollinger Bands and moving averages.",
    "input_schema": {
        "type": "object",
        "properties": {"ticker": {"type": "string"}},
        "required": ["ticker"],
    },
}


class Trader(BaseAgent):
    """
    The Trader synthesises the bull and bear research and makes the
    final preliminary trading decision before risk review.
    """

    role = "Trader"
    system_prompt = (
        "You are an experienced Equity Trader at a multi-strategy hedge fund. "
        "You receive bull-case and bear-case research reports and must decide "
        "whether to BUY, SELL, or HOLD a stock. "
        "Weigh both sides objectively. Consider the strength of each argument, "
        "the current technical setup (use tools if needed), and the asymmetry of "
        "risk vs. reward. "
        "Your decision should include the action, a suggested position size as a "
        "percentage of portfolio, and a clear rationale. "
        "When you have reached a conclusion, call submit_decision."
    )
    tools = [
        _PRICE_HISTORY_TOOL,
        _TECHNICAL_INDICATORS_TOOL,
        SUBMIT_DECISION_TOOL,
    ]
    terminal_tool = "submit_decision"

    def decide(self, ticker: str, date: str, research_reports: dict) -> dict:
        prompt = (
            f"Review the bull and bear research for {ticker} as of {date} "
            "and make a trading decision. "
            "The research reports are provided in the context. "
            "You may call tools to check current price action or technicals "
            "before committing. Submit your final decision via submit_decision."
        )
        return self.run_with_tools(prompt, extra_context={"research_reports": research_reports})
