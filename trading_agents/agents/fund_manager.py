"""
Fund Manager agent.

Final gatekeeper.  Reviews the entire pipeline output — analyst reports,
research debate, trader decision, and risk assessment — then gives final
approval or rejection of the trade.
"""

from __future__ import annotations

from trading_agents.agents.base import BaseAgent, SUBMIT_DECISION_TOOL
from trading_agents import config

_FINANCIAL_STATEMENTS_TOOL = {
    "name": "get_financial_statements",
    "description": "Retrieve financial statements and key ratios for a ticker.",
    "input_schema": {
        "type": "object",
        "properties": {"ticker": {"type": "string"}},
        "required": ["ticker"],
    },
}


class FundManager(BaseAgent):
    """
    The Fund Manager makes the final trade decision and execution order.
    """

    role = "Fund Manager"
    system_prompt = (
        "You are the Portfolio Manager and Fund Manager of a multi-strategy hedge fund. "
        "You have the final say on all trades. "
        "You will receive a complete summary of the analyst reports, bull/bear research, "
        "the trader's preliminary decision, and the risk manager's assessment. "
        "Your responsibilities:\n"
        "  1. Confirm that the investment thesis is sound.\n"
        "  2. Ensure the trade fits the fund's mandate and risk budget.\n"
        "  3. Set the final position size (may not exceed risk manager's approved size).\n"
        "  4. Provide a final APPROVED or REJECTED decision.\n"
        "If you approve, set decision to BUY/SELL as recommended. "
        "If you reject, set decision to HOLD with explanation. "
        "Call submit_decision with the final, binding order."
    )
    tools = [
        _FINANCIAL_STATEMENTS_TOOL,
        SUBMIT_DECISION_TOOL,
    ]
    terminal_tool = "submit_decision"

    def approve(
        self,
        ticker: str,
        date: str,
        pipeline_summary: dict,
    ) -> dict:
        prompt = (
            f"Review the complete investment pipeline for {ticker} as of {date} "
            "and make the final fund-level decision. "
            "All prior-stage outputs are in the context. "
            "Confirm or override the risk manager's recommendation and submit "
            "the final binding trade order via submit_decision."
        )
        return self.run_with_tools(prompt, extra_context={"pipeline_summary": pipeline_summary})
