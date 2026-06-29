"""
main.py - CLI entry point for the market anomaly scanner.

Usage:
    python -m market_scanner.main --tickers AAPL TSLA NVDA --loop
    python -m market_scanner.main --tickers AAPL MSFT --once
    python -m market_scanner.main          # uses default tickers, runs once
"""

import argparse
import time
from datetime import datetime

from .scanner import scan_tickers
from .ollama_client import query_ollama

# ---------------------------------------------------------------------------
# ANSI colour helpers (no external deps)
# ---------------------------------------------------------------------------

RESET = "\033[0m"
BOLD = "\033[1m"
RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
CYAN = "\033[96m"
DIM = "\033[2m"


def severity_color(severity: str) -> str:
    return {
        "HIGH": RED,
        "MEDIUM": YELLOW,
        "LOW": GREEN,
    }.get(severity.upper(), RESET)


def print_anomaly(anomaly: dict) -> None:
    color = severity_color(anomaly["severity"])
    ticker = anomaly["ticker"]
    atype = anomaly["type"].replace("_", " ").title()
    sev = anomaly["severity"]
    price = anomaly["price"]
    chg = anomaly["change_pct"]
    details = anomaly["details"]

    chg_str = f"{chg:+.2f}%"
    chg_color = GREEN if chg >= 0 else RED

    print(
        f"  {color}{BOLD}[{sev}]{RESET} "
        f"{BOLD}{ticker}{RESET} — {CYAN}{atype}{RESET}\n"
        f"        Price: ${price:.2f}  Change: {chg_color}{chg_str}{RESET}\n"
        f"        {DIM}{details}{RESET}"
    )


def print_header(tickers: list[str]) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"  Market Anomaly Scanner  |  {ts}")
    print(f"  Scanning {len(tickers)} ticker(s): {', '.join(tickers)}")
    print(f"{BOLD}{'=' * 60}{RESET}")


def run_scan(tickers: list[str]) -> None:
    print_header(tickers)
    print(f"\n{DIM}Fetching data...{RESET}")

    anomalies = scan_tickers(tickers)

    if not anomalies:
        print(f"\n  {GREEN}No significant anomalies detected.{RESET}\n")
        return

    # Group by ticker for nicer display
    by_ticker: dict[str, list[dict]] = {}
    for a in anomalies:
        by_ticker.setdefault(a["ticker"], []).append(a)

    print(f"\n  {BOLD}Found {len(anomalies)} anomaly/anomalies across "
          f"{len(by_ticker)} ticker(s):{RESET}\n")

    for ticker, ticker_anomalies in by_ticker.items():
        print(f"  {BOLD}{ticker}{RESET}  ({len(ticker_anomalies)} signal(s))")
        for a in ticker_anomalies:
            print_anomaly(a)
        print()

    # Send to Ollama for analysis
    query_ollama(anomalies)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Market anomaly scanner powered by yfinance + Ollama",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m market_scanner.main\n"
            "  python -m market_scanner.main --tickers AAPL TSLA NVDA\n"
            "  python -m market_scanner.main --tickers AAPL --loop\n"
        ),
    )
    parser.add_argument(
        "--tickers",
        nargs="+",
        default=["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL"],
        metavar="TICKER",
        help="Space-separated list of ticker symbols (default: AAPL TSLA NVDA MSFT GOOGL)",
    )

    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--loop",
        action="store_true",
        help="Scan repeatedly every 5 minutes (press Ctrl+C to stop)",
    )
    mode_group.add_argument(
        "--once",
        action="store_true",
        default=True,
        help="Scan once and exit (default behaviour)",
    )

    args = parser.parse_args()
    tickers = [t.upper() for t in args.tickers]

    if args.loop:
        interval = 300  # 5 minutes
        print(
            f"{CYAN}Loop mode enabled — scanning every {interval // 60} minutes. "
            f"Press Ctrl+C to stop.{RESET}"
        )
        try:
            while True:
                run_scan(tickers)
                print(
                    f"{DIM}Next scan in {interval // 60} minutes "
                    f"(Ctrl+C to quit)...{RESET}\n"
                )
                time.sleep(interval)
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Scan loop stopped by user.{RESET}\n")
    else:
        run_scan(tickers)


if __name__ == "__main__":
    main()
