"""
Risk Manager agent.

Reviews the Trader's decision against portfolio risk parameters and either
approves, modifies (e.g. reduces position size), or vetoes the trade.
"""

from __future__ import annotations

import json

from trading_agents.agents.base import BaseAgent, SUBMIT_DECISION_TOOL
from trading_agents import config

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


class RiskManager(BaseAgent):
    """
    Evaluates the Trader's decision from a risk-management perspective.
    Checks position-size limits, drawdown risk, and portfolio constraints.
    """

    role = "Risk Manager"
    system_prompt = (
        "You are the Chief Risk Officer at a hedge fund. "
        "Your job is to evaluate proposed trades before they are executed. "
        "You must check the proposed trade against the following risk parameters:\n"
        f"  - Maximum position size: {config.RISK_PARAMS['max_position_size_pct']*100:.0f}% of portfolio\n"
        f"  - Maximum acceptable drawdown: {config.RISK_PARAMS['max_drawdown_pct']*100:.0f}%\n"
        f"  - Minimum confidence required: {config.RISK_PARAMS['min_confidence_score']:.0%}\n"
        "You may approve the trade as-is, approve with a reduced position size, "
        "or veto the trade (change decision to HOLD) if risk is too high. "
        "Justify your risk assessment clearly. "
        "Call submit_decision with your final risk-adjusted recommendation."
    )
    tools = [
        _PRICE_HISTORY_TOOL,
        _TECHNICAL_INDICATORS_TOOL,
        SUBMIT_DECISION_TOOL,
    ]
    terminal_tool = "submit_decision"

    def assess(
        self,
        ticker: str,
        date: str,
        trader_decision: dict,
        research_reports: dict,
    ) -> dict:
        prompt = (
            f"Assess the risk of the proposed trade for {ticker} as of {date}. "
            "Review the trader's decision and the supporting research in the context. "
            "Apply the risk parameters specified in your role description. "
            "Approve, modify, or veto the trade and submit your risk-adjusted decision."
        )
        context = {
            "trader_decision": trader_decision,
            "research_reports": research_reports,
            "risk_params": config.RISK_PARAMS,
        }
        return self.run_with_tools(prompt, extra_context=context)
