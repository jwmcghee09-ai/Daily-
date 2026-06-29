"""
TradingOrchestrator: runs the full multi-agent pipeline for a given stock and date.

Pipeline stages
---------------
1.  Analyst Team (Fundamental, Sentiment, News, Technical) – run in sequence,
    simulating a parallel workgroup.
2.  Research Team (Bull, Bear) – debate the analyst findings.
3.  Trader – makes a preliminary BUY / SELL / HOLD decision.
4.  Risk Manager – reviews the decision against risk parameters.
5.  Fund Manager – final approval and execution order.
"""

from __future__ import annotations

import time
from typing import Any

from trading_agents.agents.analysts import (
    FundamentalAnalyst,
    SentimentAnalyst,
    NewsAnalyst,
    TechnicalAnalyst,
)
from trading_agents.agents.researchers import BullResearcher, BearResearcher
from trading_agents.agents.trader import Trader
from trading_agents.agents.risk_manager import RiskManager
from trading_agents.agents.fund_manager import FundManager


class TradingOrchestrator:
    """
    Coordinates all agents and returns a fully structured pipeline result.
    """

    def __init__(self, verbose: bool = True) -> None:
        self.verbose = verbose

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _log(self, message: str) -> None:
        if self.verbose:
            print(f"[orchestrator] {message}")

    def _run_stage(self, stage_name: str, fn) -> Any:
        self._log(f"Starting: {stage_name} ...")
        t0 = time.time()
        result = fn()
        elapsed = time.time() - t0
        self._log(f"Finished: {stage_name} ({elapsed:.1f}s)")
        return result

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self, ticker: str, date: str) -> dict[str, Any]:
        """
        Execute the full pipeline.

        Parameters
        ----------
        ticker : str
            The stock ticker to analyse, e.g. "AAPL".
        date : str
            The analysis date in ISO format, e.g. "2024-06-01".

        Returns
        -------
        dict containing all stage outputs and the final decision.
        """
        ticker = ticker.upper().strip()
        self._log(f"Pipeline started for {ticker} on {date}")

        # ------------------------------------------------------------------
        # Stage 1: Analyst Team
        # ------------------------------------------------------------------
        fundamental_report = self._run_stage(
            "Fundamental Analyst",
            lambda: FundamentalAnalyst().analyse(ticker, date),
        )
        sentiment_report = self._run_stage(
            "Sentiment Analyst",
            lambda: SentimentAnalyst().analyse(ticker, date),
        )
        news_report = self._run_stage(
            "News Analyst",
            lambda: NewsAnalyst().analyse(ticker, date),
        )
        technical_report = self._run_stage(
            "Technical Analyst",
            lambda: TechnicalAnalyst().analyse(ticker, date),
        )

        analyst_reports = {
            "fundamental": fundamental_report,
            "sentiment": sentiment_report,
            "news": news_report,
            "technical": technical_report,
        }

        # ------------------------------------------------------------------
        # Stage 2: Research Team
        # ------------------------------------------------------------------
        bull_report = self._run_stage(
            "Bull Researcher",
            lambda: BullResearcher().research(ticker, date, analyst_reports),
        )
        bear_report = self._run_stage(
            "Bear Researcher",
            lambda: BearResearcher().research(ticker, date, analyst_reports),
        )

        research_reports = {
            "bull": bull_report,
            "bear": bear_report,
        }

        # ------------------------------------------------------------------
        # Stage 3: Trader
        # ------------------------------------------------------------------
        trader_decision = self._run_stage(
            "Trader",
            lambda: Trader().decide(ticker, date, research_reports),
        )

        # ------------------------------------------------------------------
        # Stage 4: Risk Manager
        # ------------------------------------------------------------------
        risk_decision = self._run_stage(
            "Risk Manager",
            lambda: RiskManager().assess(ticker, date, trader_decision, research_reports),
        )

        # ------------------------------------------------------------------
        # Stage 5: Fund Manager
        # ------------------------------------------------------------------
        pipeline_summary = {
            "ticker": ticker,
            "date": date,
            "analyst_reports": analyst_reports,
            "research_reports": research_reports,
            "trader_decision": trader_decision,
            "risk_decision": risk_decision,
        }

        final_decision = self._run_stage(
            "Fund Manager",
            lambda: FundManager().approve(ticker, date, pipeline_summary),
        )

        self._log("Pipeline complete.")

        return {
            "ticker": ticker,
            "date": date,
            "stage_1_analysts": analyst_reports,
            "stage_2_researchers": research_reports,
            "stage_3_trader": trader_decision,
            "stage_4_risk_manager": risk_decision,
            "stage_5_fund_manager": final_decision,
        }
