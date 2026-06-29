"""
main.py - CLI entry point for the market anomaly scanner.

Usage:
    python3 -m market_scanner.main --tickers AAPL TSLA NVDA --loop
    python3 -m market_scanner.main --tickers AAPL MSFT --once
    python3 -m market_scanner.main
"""

import argparse
import time
from datetime import datetime, time as dtime
import zoneinfo

from .scanner import scan_tickers
from .ollama_client import query_ollama

RESET = "\033[0m"
BOLD = "\033[1m"
RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
CYAN = "\033[96m"
DIM = "\033[2m"

MARKET_OPEN = dtime(9, 30)
MARKET_CLOSE = dtime(16, 0)
ET = zoneinfo.ZoneInfo("America/New_York")


def is_market_open() -> bool:
    now_et = datetime.now(ET)
    if now_et.weekday() >= 5:  # Saturday=5, Sunday=6
        return False
    return MARKET_OPEN <= now_et.time() <= MARKET_CLOSE


def seconds_until_market_open() -> int:
    now_et = datetime.now(ET)
    # Find next weekday 9:30am ET
    days_ahead = 0
    while True:
        candidate = now_et.replace(hour=9, minute=30, second=0, microsecond=0)
        if days_ahead > 0:
            from datetime import timedelta
            candidate = candidate + timedelta(days=days_ahead)
        if candidate > now_et and candidate.weekday() < 5:
            return int((candidate - now_et).total_seconds())
        days_ahead += 1
        if days_ahead > 7:
            return 86400


def severity_color(severity: str) -> str:
    return {"HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}.get(severity.upper(), RESET)


def print_anomaly(anomaly: dict) -> None:
    color = severity_color(anomaly["severity"])
    chg_color = GREEN if anomaly["change_pct"] >= 0 else RED
    print(
        f"  {color}{BOLD}[{anomaly['severity']}]{RESET} "
        f"{BOLD}{anomaly['ticker']}{RESET} — {CYAN}{anomaly['type'].replace('_', ' ').title()}{RESET}\n"
        f"        Price: ${anomaly['price']:.2f}  Change: {chg_color}{anomaly['change_pct']:+.2f}%{RESET}\n"
        f"        {DIM}{anomaly['details']}{RESET}"
    )


def print_header(tickers: list[str]) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    now_et = datetime.now(ET)
    market_status = f"{GREEN}OPEN{RESET}" if is_market_open() else f"{RED}CLOSED{RESET}"
    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"  Market Anomaly Scanner  |  {ts}")
    print(f"  Scanning {len(tickers)} ticker(s): {', '.join(tickers)}")
    print(f"  Market Status: {market_status}  ({now_et.strftime('%H:%M ET')})")
    print(f"{BOLD}{'=' * 60}{RESET}")


def run_scan(tickers: list[str]) -> None:
    print_header(tickers)
    print(f"\n{DIM}Fetching data...{RESET}")
    anomalies = scan_tickers(tickers)

    if not anomalies:
        print(f"\n  {GREEN}No significant anomalies detected.{RESET}\n")
        return

    by_ticker: dict[str, list[dict]] = {}
    for a in anomalies:
        by_ticker.setdefault(a["ticker"], []).append(a)

    print(f"\n  {BOLD}Found {len(anomalies)} anomaly/anomalies across {len(by_ticker)} ticker(s):{RESET}\n")
    for ticker, ticker_anomalies in by_ticker.items():
        print(f"  {BOLD}{ticker}{RESET}  ({len(ticker_anomalies)} signal(s))")
        for a in ticker_anomalies:
            print_anomaly(a)
        print()

    query_ollama(anomalies)


def main() -> None:
    parser = argparse.ArgumentParser(description="Market anomaly scanner powered by yfinance + Ollama")
    parser.add_argument("--tickers", nargs="+",
                        default=["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "AMZN", "META", "NFLX", "AMD", "INTC"],
                        metavar="TICKER", help="Ticker symbols to scan")
    parser.add_argument("--market-hours-only", action="store_true",
                        help="Only scan during market hours (9:30am-4pm ET, Mon-Fri)")
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument("--loop", action="store_true", help="Scan every 5 minutes")
    mode_group.add_argument("--once", action="store_true", default=True, help="Scan once and exit (default)")
    args = parser.parse_args()
    tickers = [t.upper() for t in args.tickers]

    if args.loop:
        print(f"{CYAN}Loop mode — scanning every 5 minutes. Ctrl+C to stop.{RESET}")
        if args.market_hours_only:
            print(f"{CYAN}Market hours only mode — will pause outside 9:30am-4pm ET Mon-Fri.{RESET}")
        try:
            while True:
                if args.market_hours_only and not is_market_open():
                    secs = seconds_until_market_open()
                    hrs = secs // 3600
                    mins = (secs % 3600) // 60
                    print(f"\n{YELLOW}Market closed. Next open in {hrs}h {mins}m. Sleeping...{RESET}")
                    time.sleep(min(secs, 300))
                    continue
                run_scan(tickers)
                print(f"{DIM}Next scan in 5 minutes...{RESET}\n")
                time.sleep(300)
        except KeyboardInterrupt:
            print(f"\n{YELLOW}Stopped.{RESET}\n")
    else:
        run_scan(tickers)


if __name__ == "__main__":
    main()
