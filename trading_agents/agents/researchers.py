"""
Research agents: BullResearcher and BearResearcher.

Each researcher receives all four analyst reports and argues their side of the
investment thesis.  They can also pull supplementary data if needed, and
ultimately submit a research report via submit_report.
"""

from __future__ import annotations

from trading_agents.agents.base import BaseAgent, SUBMIT_REPORT_TOOL

# Supplementary data tools available to researchers
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

_FINANCIAL_STATEMENTS_TOOL = {
    "name": "get_financial_statements",
    "description": "Retrieve financial statements and key ratios.",
    "input_schema": {
        "type": "object",
        "properties": {"ticker": {"type": "string"}},
        "required": ["ticker"],
    },
}


# ---------------------------------------------------------------------------
# BullResearcher
# ---------------------------------------------------------------------------

class BullResearcher(BaseAgent):
    """
    Constructs the bullish investment case, drawing on analyst reports and
    any additional data needed to support a buy thesis.
    """

    role = "Bull Researcher"
    system_prompt = (
        "You are a Bull-side Research Analyst at a long-only equity fund. "
        "You have received reports from four specialist analysts (Fundamental, "
        "Sentiment, News, Technical). Your task is to synthesise these reports "
        "and build the strongest possible bullish investment case for the stock. "
        "Challenge bearish data points with counter-arguments and highlight all "
        "upside catalysts, valuation support, and positive technical setups. "
        "You may use tools to pull additional data to strengthen your case. "
        "When you are satisfied, call submit_report with your bull thesis."
    )
    tools = [
        _PRICE_HISTORY_TOOL,
        _TECHNICAL_INDICATORS_TOOL,
        _FINANCIAL_STATEMENTS_TOOL,
        SUBMIT_REPORT_TOOL,
    ]
    terminal_tool = "submit_report"

    def research(self, ticker: str, date: str, analyst_reports: dict) -> dict:
        prompt = (
            f"Build the bull case for {ticker} as of {date}. "
            "You have the following analyst reports available in the context. "
            "Use them as the foundation for your thesis, supplementing with "
            "additional data tool calls if needed. "
            "Argue persuasively for why this stock should be bought."
        )
        return self.run_with_tools(prompt, extra_context={"analyst_reports": analyst_reports})


# ---------------------------------------------------------------------------
# BearResearcher
# ---------------------------------------------------------------------------

class BearResearcher(BaseAgent):
    """
    Constructs the bearish investment case, arguing for caution or a sell
    based on the same analyst reports.
    """

    role = "Bear Researcher"
    system_prompt = (
        "You are a Bear-side Research Analyst and short-seller specialist. "
        "You have received reports from four specialist analysts (Fundamental, "
        "Sentiment, News, Technical). Your task is to synthesise these reports "
        "and build the strongest possible bearish case or highlight the risks "
        "that make this stock a poor investment at this time. "
        "Challenge bullish narratives, identify overvaluation, negative catalysts, "
        "deteriorating fundamentals, or weak technical setups. "
        "You may use tools to pull additional data to support your case. "
        "When you are satisfied, call submit_report with your bear thesis."
    )
    tools = [
        _PRICE_HISTORY_TOOL,
        _TECHNICAL_INDICATORS_TOOL,
        _FINANCIAL_STATEMENTS_TOOL,
        SUBMIT_REPORT_TOOL,
    ]
    terminal_tool = "submit_report"

    def research(self, ticker: str, date: str, analyst_reports: dict) -> dict:
        prompt = (
            f"Build the bear case for {ticker} as of {date}. "
            "You have the following analyst reports available in the context. "
            "Use them as the foundation for your thesis, supplementing with "
            "additional data tool calls if needed. "
            "Argue persuasively for why this stock should be avoided or sold."
        )
        return self.run_with_tools(prompt, extra_context={"analyst_reports": analyst_reports})
