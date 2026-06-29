"""
BaseAgent: shared ReAct-style agentic loop using the Anthropic SDK.

Pattern
-------
1.  Send system prompt + initial user message to Claude.
2.  If the response contains tool_use blocks, execute each tool and append
    tool_result blocks, then call Claude again.
3.  Repeat until a terminal tool (submit_report or submit_decision) is called,
    at which point the loop exits and the submitted content is returned.
"""

from __future__ import annotations

import json
from typing import Any

import anthropic

from trading_agents import config
from trading_agents.data_tools import call_tool

# ---------------------------------------------------------------------------
# Anthropic client (module-level singleton)
# ---------------------------------------------------------------------------

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


# ---------------------------------------------------------------------------
# Shared terminal tool schemas
# ---------------------------------------------------------------------------

SUBMIT_REPORT_TOOL: dict = {
    "name": "submit_report",
    "description": (
        "Submit your final analysis report. Call this tool when you have gathered "
        "enough information and are ready to provide your complete assessment."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "report": {
                "type": "string",
                "description": "Your complete analysis report.",
            },
            "confidence": {
                "type": "number",
                "description": "Your confidence score from 0.0 to 1.0.",
            },
            "key_findings": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Bullet-point list of the most important findings.",
            },
        },
        "required": ["report", "confidence", "key_findings"],
    },
}

SUBMIT_DECISION_TOOL: dict = {
    "name": "submit_decision",
    "description": (
        "Submit your final trading decision or risk/fund assessment. "
        "Call this when you are ready to commit to a recommendation."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "decision": {
                "type": "string",
                "enum": ["BUY", "SELL", "HOLD"],
                "description": "The trading action to take.",
            },
            "reasoning": {
                "type": "string",
                "description": "Detailed reasoning behind the decision.",
            },
            "confidence": {
                "type": "number",
                "description": "Confidence score from 0.0 to 1.0.",
            },
            "suggested_position_size_pct": {
                "type": "number",
                "description": "Suggested position size as a percentage of portfolio (0-100).",
            },
            "risk_notes": {
                "type": "string",
                "description": "Any risk caveats or conditions attached to the decision.",
            },
        },
        "required": ["decision", "reasoning", "confidence"],
    },
}


# ---------------------------------------------------------------------------
# BaseAgent
# ---------------------------------------------------------------------------

class BaseAgent:
    """
    Abstract base for all TradingAgents agents.

    Sub-classes must set:
        role          : str  – human-readable role name
        system_prompt : str  – passed to Claude as the system message
        tools         : list – list of Anthropic tool schema dicts
        terminal_tool : str  – name of the tool that ends the loop
                               ("submit_report" or "submit_decision")
    """

    role: str = "BaseAgent"
    system_prompt: str = "You are a helpful assistant."
    tools: list[dict] = []
    terminal_tool: str = "submit_report"

    def __init__(self) -> None:
        self.client = _get_client()

    # ------------------------------------------------------------------
    # Core agentic loop
    # ------------------------------------------------------------------

    def run_with_tools(
        self,
        user_message: str,
        extra_context: dict | None = None,
    ) -> dict[str, Any]:
        """
        Run the ReAct agentic loop.

        Parameters
        ----------
        user_message:
            The initial instruction / prompt for this agent.
        extra_context:
            Optional extra data injected into the first user turn as JSON.

        Returns
        -------
        A dict containing the role, the terminal submission content, and
        the full message history.
        """
        messages: list[dict] = []

        # Build initial user turn
        if extra_context:
            context_str = json.dumps(extra_context, indent=2)
            full_message = f"{user_message}\n\n<context>\n{context_str}\n</context>"
        else:
            full_message = user_message

        messages.append({"role": "user", "content": full_message})

        terminal_result: dict | None = None
        max_iterations = 12  # safety guard

        for _iteration in range(max_iterations):
            response = self.client.messages.create(
                model=config.MODEL,
                max_tokens=config.MAX_TOKENS,
                system=self.system_prompt,
                tools=self.tools,
                messages=messages,
            )

            # Append assistant message
            messages.append({"role": "assistant", "content": response.content})

            # Check stop reason
            if response.stop_reason == "end_turn":
                # Model stopped without calling a tool – extract text
                text_parts = [
                    block.text for block in response.content
                    if hasattr(block, "text")
                ]
                terminal_result = {
                    "report": " ".join(text_parts),
                    "confidence": 0.5,
                    "key_findings": [],
                }
                break

            # Collect tool calls
            tool_use_blocks = [
                block for block in response.content
                if block.type == "tool_use"
            ]

            if not tool_use_blocks:
                # No tool calls; nothing more to do
                break

            # Build tool_result content list
            tool_results: list[dict] = []
            found_terminal = False

            for block in tool_use_blocks:
                tool_name: str = block.name
                tool_input: dict = block.input

                if tool_name == self.terminal_tool:
                    # Terminal tool – capture and signal end of loop
                    terminal_result = dict(tool_input)
                    found_terminal = True
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": "Decision recorded. Loop complete.",
                        }
                    )
                else:
                    # Regular data tool
                    result = call_tool(tool_name, tool_input)
                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, indent=2),
                        }
                    )

            # Append tool results as user message
            messages.append({"role": "user", "content": tool_results})

            if found_terminal:
                break

        # Fallback if loop exhausted without terminal
        if terminal_result is None:
            terminal_result = {
                "report": "Agent did not produce a final submission within iteration limit.",
                "confidence": 0.0,
                "key_findings": [],
            }

        return {
            "role": self.role,
            **terminal_result,
        }
