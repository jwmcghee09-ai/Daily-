"""
CLI entry point for the TradingAgents framework.

Usage
-----
    python -m trading_agents.main --ticker AAPL --date 2024-06-01

Flags
-----
    --ticker  TICKER   Stock ticker symbol (required)
    --date    DATE     Analysis date in YYYY-MM-DD format (default: today)
    --quiet            Suppress orchestrator progress messages
"""

from __future__ import annotations

import argparse
import json
import sys
import textwrap
from datetime import date as _date
from typing import Any


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

_LINE = "─" * 72
_DOUBLE = "═" * 72


def _wrap(text: str, indent: int = 4) -> str:
    """Word-wrap text and indent every line."""
    prefix = " " * indent
    return textwrap.fill(text, width=80, initial_indent=prefix, subsequent_indent=prefix)


def _section(title: str) -> None:
    print(f"\n{_LINE}")
    print(f"  {title}")
    print(_LINE)


def _print_analyst_report(label: str, report: dict) -> None:
    _section(f"ANALYST REPORT: {label.upper()}")
    role = report.get("role", label)
    print(f"  Role       : {role}")
    confidence = report.get("confidence")
    if confidence is not None:
        print(f"  Confidence : {confidence:.0%}")

    findings = report.get("key_findings", [])
    if findings:
        print("  Key Findings:")
        for finding in findings:
            print(_wrap(f"• {finding}", indent=6))

    report_text = report.get("report", "")
    if report_text:
        print("  Report:")
        for paragraph in report_text.split("\n"):
            if paragraph.strip():
                print(_wrap(paragraph, indent=6))


def _print_research_report(label: str, report: dict) -> None:
    _section(f"RESEARCH: {label.upper()}")
    print(f"  Role       : {report.get('role', label)}")
    confidence = report.get("confidence")
    if confidence is not None:
        print(f"  Confidence : {confidence:.0%}")

    findings = report.get("key_findings", [])
    if findings:
        print("  Key Arguments:")
        for finding in findings:
            print(_wrap(f"• {finding}", indent=6))

    report_text = report.get("report", "")
    if report_text:
        print("  Full Thesis:")
        for paragraph in report_text.split("\n"):
            if paragraph.strip():
                print(_wrap(paragraph, indent=6))


def _print_decision(label: str, decision_dict: dict) -> None:
    _section(f"DECISION: {label.upper()}")
    print(f"  Role       : {decision_dict.get('role', label)}")
    decision = decision_dict.get("decision", "N/A")
    confidence = decision_dict.get("confidence")
    pos_size = decision_dict.get("suggested_position_size_pct")

    action_color = {"BUY": "✅", "SELL": "🔴", "HOLD": "⏸️"}.get(decision, "")
    print(f"  Decision   : {action_color} {decision}")
    if confidence is not None:
        print(f"  Confidence : {confidence:.0%}")
    if pos_size is not None:
        print(f"  Position   : {pos_size:.1f}% of portfolio")

    reasoning = decision_dict.get("reasoning", "")
    if reasoning:
        print("  Reasoning:")
        for paragraph in reasoning.split("\n"):
            if paragraph.strip():
                print(_wrap(paragraph, indent=6))

    risk_notes = decision_dict.get("risk_notes", "")
    if risk_notes:
        print("  Risk Notes:")
        print(_wrap(risk_notes, indent=6))


def _print_final_summary(result: dict) -> None:
    ticker = result["ticker"]
    date = result["date"]
    final = result["stage_5_fund_manager"]
    decision = final.get("decision", "N/A")
    confidence = final.get("confidence", 0.0)
    pos_size = final.get("suggested_position_size_pct")

    print(f"\n{_DOUBLE}")
    print(f"  FINAL TRADE DECISION — {ticker} — {date}")
    print(_DOUBLE)
    action_label = {"BUY": "BUY  ✅", "SELL": "SELL 🔴", "HOLD": "HOLD ⏸️"}.get(decision, decision)
    print(f"  Action     : {action_label}")
    print(f"  Confidence : {confidence:.0%}")
    if pos_size is not None:
        print(f"  Position   : {pos_size:.1f}% of portfolio")
    reasoning = final.get("reasoning", "")
    if reasoning:
        print("  Summary:")
        # First 3 sentences only for the summary banner
        sentences = reasoning.replace("\n", " ").split(". ")
        summary = ". ".join(sentences[:3]).strip()
        if not summary.endswith("."):
            summary += "."
        print(_wrap(summary, indent=6))
    print(_DOUBLE)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="TradingAgents: multi-agent LLM financial trading framework",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent(
            """
            Examples:
              python -m trading_agents.main --ticker AAPL
              python -m trading_agents.main --ticker TSLA --date 2024-06-01 --quiet
            """
        ),
    )
    parser.add_argument(
        "--ticker",
        required=True,
        metavar="TICKER",
        help="Stock ticker symbol (e.g. AAPL, TSLA, MSFT)",
    )
    parser.add_argument(
        "--date",
        default=str(_date.today()),
        metavar="DATE",
        help="Analysis date in YYYY-MM-DD format (default: today)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress orchestrator progress log messages",
    )
    parser.add_argument(
        "--json",
        dest="output_json",
        action="store_true",
        help="Output the full pipeline result as JSON instead of formatted text",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)

    # Validate ANTHROPIC_API_KEY early
    from trading_agents import config as _cfg
    if not _cfg.ANTHROPIC_API_KEY:
        print(
            "ERROR: ANTHROPIC_API_KEY environment variable is not set.\n"
            "Export it before running:\n"
            "  export ANTHROPIC_API_KEY=sk-ant-...",
            file=sys.stderr,
        )
        sys.exit(1)

    from trading_agents.orchestrator import TradingOrchestrator

    orchestrator = TradingOrchestrator(verbose=not args.quiet)
    result = orchestrator.run(ticker=args.ticker, date=args.date)

    if args.output_json:
        print(json.dumps(result, indent=2))
        return

    # ------------------------------------------------------------------
    # Pretty-print the full pipeline
    # ------------------------------------------------------------------
    print(f"\n{'═' * 72}")
    print(f"  TRADINGAGENTS PIPELINE REPORT")
    print(f"  Ticker: {result['ticker']}   Date: {result['date']}")
    print(f"{'═' * 72}")

    # Stage 1: Analysts
    analysts = result["stage_1_analysts"]
    _print_analyst_report("Fundamental", analysts["fundamental"])
    _print_analyst_report("Sentiment", analysts["sentiment"])
    _print_analyst_report("News", analysts["news"])
    _print_analyst_report("Technical", analysts["technical"])

    # Stage 2: Researchers
    researchers = result["stage_2_researchers"]
    _print_research_report("Bull Case", researchers["bull"])
    _print_research_report("Bear Case", researchers["bear"])

    # Stage 3: Trader
    _print_decision("Trader", result["stage_3_trader"])

    # Stage 4: Risk Manager
    _print_decision("Risk Manager", result["stage_4_risk_manager"])

    # Stage 5: Fund Manager
    _print_decision("Fund Manager", result["stage_5_fund_manager"])

    # Final summary banner
    _print_final_summary(result)


if __name__ == "__main__":
    main()
