"""
Analyst agents: Fundamental, Sentiment, News, Technical.

Each analyst:
  - Has a role-specific system prompt.
  - Has access to a subset of data tools from data_tools.py plus submit_report.
  - Loops via BaseAgent.run_with_tools() until submit_report is called.
"""

from __future__ import annotations

from trading_agents.agents.base import BaseAgent, SUBMIT_REPORT_TOOL

# ---------------------------------------------------------------------------
# Shared data-tool schemas (Anthropic format)
# ---------------------------------------------------------------------------

_PRICE_HISTORY_TOOL = {
    "name": "get_price_history",
    "description": "Retrieve OHLCV price history for a ticker over a given number of days.",
    "input_schema": {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "description": "Stock ticker symbol, e.g. AAPL."},
            "days": {"type": "integer", "description": "Number of trading days to retrieve (default 30)."},
        },
        "required": ["ticker"],
    },
}

_FINANCIAL_STATEMENTS_TOOL = {
    "name": "get_financial_statements",
    "description": "Retrieve income statement, balance sheet, and key financial ratios for a ticker.",
    "input_schema": {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "description": "Stock ticker symbol."},
        },
        "required": ["ticker"],
    },
}

_NEWS_ARTICLES_TOOL = {
    "name": "get_news_articles",
    "description": "Retrieve recent news articles and their sentiment for a ticker.",
    "input_schema": {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "description": "Stock ticker symbol."},
            "days": {"type": "integer", "description": "Number of past days to search (default 7)."},
        },
        "required": ["ticker"],
    },
}

_SOCIAL_SENTIMENT_TOOL = {
    "name": "get_social_sentiment",
    "description": "Retrieve aggregated social-media sentiment scores for a ticker.",
    "input_schema": {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "description": "Stock ticker symbol."},
            "days": {"type": "integer", "description": "Number of past days to aggregate (default 7)."},
        },
        "required": ["ticker"],
    },
}

_TECHNICAL_INDICATORS_TOOL = {
    "name": "get_technical_indicators",
    "description": (
        "Retrieve technical indicators for a ticker including RSI, MACD, "
        "moving averages, and Bollinger Bands."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "description": "Stock ticker symbol."},
        },
        "required": ["ticker"],
    },
}

_INSIDER_TRANSACTIONS_TOOL = {
    "name": "get_insider_transactions",
    "description": "Retrieve recent insider buy/sell transactions for a ticker.",
    "input_schema": {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "description": "Stock ticker symbol."},
        },
        "required": ["ticker"],
    },
}


# ---------------------------------------------------------------------------
# FundamentalAnalyst
# ---------------------------------------------------------------------------

class FundamentalAnalyst(BaseAgent):
    """
    Analyses the financial health and valuation of a company using income
    statements, balance sheet data, and key ratios.
    """

    role = "Fundamental Analyst"
    system_prompt = (
        "You are a senior Fundamental Analyst at a quantitative hedge fund. "
        "Your job is to evaluate a company's financial health, profitability, "
        "valuation, and growth trajectory using financial statements and key ratios. "
        "Use the available tools to gather data, then synthesise your findings into "
        "a concise, structured report. Focus on: revenue growth, margins, "
        "debt levels, valuation multiples (P/E, P/B), and insider activity as a "
        "signal of management confidence. "
        "When you have enough information, call submit_report with your findings."
    )
    tools = [
        _FINANCIAL_STATEMENTS_TOOL,
        _INSIDER_TRANSACTIONS_TOOL,
        _PRICE_HISTORY_TOOL,
        SUBMIT_REPORT_TOOL,
    ]
    terminal_tool = "submit_report"

    def analyse(self, ticker: str, date: str) -> dict:
        prompt = (
            f"Perform a fundamental analysis of {ticker} as of {date}. "
            "Retrieve the financial statements and insider transactions, "
            "examine the data carefully, and submit a comprehensive report "
            "covering valuation, financial health, and key risks."
        )
        return self.run_with_tools(prompt)


# ---------------------------------------------------------------------------
# SentimentAnalyst
# ---------------------------------------------------------------------------

class SentimentAnalyst(BaseAgent):
    """
    Analyses social-media and retail-investor sentiment around a ticker.
    """

    role = "Sentiment Analyst"
    system_prompt = (
        "You are a Sentiment Analyst specialising in quantitative social-media "
        "analysis for equity markets. "
        "Your task is to assess the current mood of retail and institutional "
        "investors towards a given stock using aggregated sentiment scores from "
        "Reddit, Twitter/X, StockTwits, and news comment sections. "
        "Identify whether sentiment is bullish, bearish, or neutral, and note "
        "any meaningful trend changes or extreme readings. "
        "When you have enough information, call submit_report with your findings."
    )
    tools = [
        _SOCIAL_SENTIMENT_TOOL,
        _NEWS_ARTICLES_TOOL,
        SUBMIT_REPORT_TOOL,
    ]
    terminal_tool = "submit_report"

    def analyse(self, ticker: str, date: str) -> dict:
        prompt = (
            f"Perform a sentiment analysis of {ticker} as of {date}. "
            "Retrieve social sentiment data and any relevant news, "
            "then submit a report on market sentiment, its trend, and "
            "what it implies for near-term price action."
        )
        return self.run_with_tools(prompt)


# ---------------------------------------------------------------------------
# NewsAnalyst
# ---------------------------------------------------------------------------

class NewsAnalyst(BaseAgent):
    """
    Reviews recent news coverage to identify catalysts and risk events.
    """

    role = "News Analyst"
    system_prompt = (
        "You are a News Analyst at a macro hedge fund. "
        "Your role is to scan recent news articles about a stock and identify "
        "material events, catalysts, and risks that could move the price. "
        "Categorise news as positive, neutral, or negative. "
        "Highlight any earnings surprises, M&A activity, regulatory actions, "
        "product launches, or macro-economic developments that are relevant. "
        "When you have enough information, call submit_report with your findings."
    )
    tools = [
        _NEWS_ARTICLES_TOOL,
        _SOCIAL_SENTIMENT_TOOL,
        SUBMIT_REPORT_TOOL,
    ]
    terminal_tool = "submit_report"

    def analyse(self, ticker: str, date: str) -> dict:
        prompt = (
            f"Perform a news analysis of {ticker} as of {date}. "
            "Retrieve recent news articles, identify the key themes and events, "
            "and submit a report summarising the news flow and its likely market impact."
        )
        return self.run_with_tools(prompt)


# ---------------------------------------------------------------------------
# TechnicalAnalyst
# ---------------------------------------------------------------------------

class TechnicalAnalyst(BaseAgent):
    """
    Uses price charts and technical indicators to assess trend and momentum.
    """

    role = "Technical Analyst"
    system_prompt = (
        "You are a Technical Analyst with expertise in price-action, momentum, "
        "and volatility indicators. "
        "Your role is to evaluate a stock's technical picture using RSI, MACD, "
        "moving averages, Bollinger Bands, and volume. "
        "Determine whether the stock is in an uptrend or downtrend, whether "
        "momentum is strengthening or weakening, and identify key support/resistance "
        "levels. Note any overbought/oversold signals or trend reversals. "
        "When you have enough information, call submit_report with your findings."
    )
    tools = [
        _TECHNICAL_INDICATORS_TOOL,
        _PRICE_HISTORY_TOOL,
        SUBMIT_REPORT_TOOL,
    ]
    terminal_tool = "submit_report"

    def analyse(self, ticker: str, date: str) -> dict:
        prompt = (
            f"Perform a technical analysis of {ticker} as of {date}. "
            "Retrieve the technical indicators and recent price history, "
            "then submit a report on the technical setup, trend direction, "
            "momentum signals, and near-term price outlook."
        )
        return self.run_with_tools(prompt)
