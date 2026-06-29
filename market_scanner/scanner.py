"""
scanner.py - Fetches market data and detects anomalies using pure Python/pandas.
No TA library dependencies (no ta-lib, pandas-ta, etc.)
"""

import warnings
import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")


# ---------------------------------------------------------------------------
# Technical indicator helpers
# ---------------------------------------------------------------------------

def compute_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    """Compute RSI without any TA library."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    # Use Wilder's smoothing (equivalent to EWM with alpha=1/period, adjust=False)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, float("nan"))
    rsi = 100 - (100 / (1 + rs))
    return rsi


def compute_macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    """
    Compute MACD line, signal line, and histogram.
    Returns (macd_line, signal_line, histogram) as pd.Series.
    """
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def compute_bollinger(close: pd.Series, period: int = 20, num_std: float = 2.0):
    """
    Compute Bollinger Bands.
    Returns (middle_band, upper_band, lower_band) as pd.Series.
    """
    middle = close.rolling(window=period).mean()
    std = close.rolling(window=period).std()
    upper = middle + num_std * std
    lower = middle - num_std * std
    return middle, upper, lower


# ---------------------------------------------------------------------------
# Main anomaly detection
# ---------------------------------------------------------------------------

def detect_anomalies(ticker: str, df: pd.DataFrame) -> list[dict]:
    """
    Given a DataFrame with columns [Open, High, Low, Close, Volume] (daily),
    return a list of anomaly dicts for the most recent trading day.

    Every anomaly dict includes extended fields:
      rsi, volume_ratio, macd_value, signal_value,
      price_52w_high, price_52w_low, pct_from_52w_high
    """
    if df is None or len(df) < 30:
        return []

    anomalies = []

    close = df["Close"]
    open_ = df["Open"]
    volume = df["Volume"]

    today_close = float(close.iloc[-1])
    today_open = float(open_.iloc[-1])
    today_volume = float(volume.iloc[-1])
    prev_close = float(close.iloc[-2])

    # Calculate daily change pct
    change_pct = (today_close - prev_close) / prev_close * 100

    # ------------------------------------------------------------------
    # Pre-compute shared indicators (used in every anomaly dict)
    # ------------------------------------------------------------------
    avg_volume_20 = float(volume.iloc[-21:-1].mean())
    volume_ratio = (today_volume / avg_volume_20) if avg_volume_20 > 0 else 0.0

    rsi_series = compute_rsi(close)
    rsi_today = float(rsi_series.iloc[-1]) if not pd.isna(rsi_series.iloc[-1]) else 0.0

    macd_line, signal_line, histogram = compute_macd(close)
    macd_val = float(macd_line.iloc[-1]) if not pd.isna(macd_line.iloc[-1]) else 0.0
    signal_val = float(signal_line.iloc[-1]) if not pd.isna(signal_line.iloc[-1]) else 0.0

    price_52w_high = float(close.max())
    price_52w_low = float(close.min())
    pct_from_52w_high = (today_close - price_52w_high) / price_52w_high * 100  # negative %

    def _extra() -> dict:
        return {
            "rsi": round(rsi_today, 2),
            "volume_ratio": round(volume_ratio, 4),
            "macd_value": round(macd_val, 4),
            "signal_value": round(signal_val, 4),
            "price_52w_high": round(price_52w_high, 2),
            "price_52w_low": round(price_52w_low, 2),
            "pct_from_52w_high": round(pct_from_52w_high, 2),
        }

    # ------------------------------------------------------------------
    # 1. Volume spike
    # ------------------------------------------------------------------
    if avg_volume_20 > 0:
        if volume_ratio > 2.0:
            severity = "HIGH" if volume_ratio > 3.0 else "MEDIUM"
            anomalies.append({
                "ticker": ticker,
                "type": "volume_spike",
                "severity": severity,
                "details": (
                    f"Volume {volume_ratio:.1f}x above 20-day avg "
                    f"({today_volume / 1e6:.1f}M vs {avg_volume_20 / 1e6:.1f}M avg)"
                ),
                "price": today_close,
                "change_pct": round(change_pct, 2),
                **_extra(),
            })

    # ------------------------------------------------------------------
    # 2. Price gap
    # ------------------------------------------------------------------
    gap_pct = (today_open - prev_close) / prev_close * 100
    if abs(gap_pct) > 2.0:
        direction = "gap_up" if gap_pct > 0 else "gap_down"
        severity = "HIGH" if abs(gap_pct) > 4.0 else "MEDIUM"
        anomalies.append({
            "ticker": ticker,
            "type": "price_gap",
            "severity": severity,
            "details": (
                f"{direction.replace('_', ' ').title()} of {gap_pct:+.2f}% "
                f"(opened ${today_open:.2f} vs prev close ${prev_close:.2f})"
            ),
            "price": today_close,
            "change_pct": round(change_pct, 2),
            **_extra(),
        })

    # ------------------------------------------------------------------
    # 3. RSI extreme
    # ------------------------------------------------------------------
    if rsi_today != 0.0:
        if rsi_today > 70:
            anomalies.append({
                "ticker": ticker,
                "type": "rsi_extreme",
                "severity": "HIGH" if rsi_today > 80 else "MEDIUM",
                "details": f"RSI(14) overbought at {rsi_today:.1f} (>70 threshold)",
                "price": today_close,
                "change_pct": round(change_pct, 2),
                **_extra(),
            })
        elif rsi_today < 30:
            anomalies.append({
                "ticker": ticker,
                "type": "rsi_extreme",
                "severity": "HIGH" if rsi_today < 20 else "MEDIUM",
                "details": f"RSI(14) oversold at {rsi_today:.1f} (<30 threshold)",
                "price": today_close,
                "change_pct": round(change_pct, 2),
                **_extra(),
            })

    # ------------------------------------------------------------------
    # 4. MACD crossover (today)
    # ------------------------------------------------------------------
    if len(histogram) >= 2:
        hist_today = float(histogram.iloc[-1])
        hist_prev = float(histogram.iloc[-2])
        if not (pd.isna(hist_today) or pd.isna(hist_prev)):
            if hist_prev < 0 and hist_today > 0:
                anomalies.append({
                    "ticker": ticker,
                    "type": "macd_crossover",
                    "severity": "MEDIUM",
                    "details": (
                        f"Bullish MACD crossover — MACD({macd_val:.3f}) "
                        f"crossed above signal({signal_val:.3f})"
                    ),
                    "price": today_close,
                    "change_pct": round(change_pct, 2),
                    **_extra(),
                })
            elif hist_prev > 0 and hist_today < 0:
                anomalies.append({
                    "ticker": ticker,
                    "type": "macd_crossover",
                    "severity": "MEDIUM",
                    "details": (
                        f"Bearish MACD crossover — MACD({macd_val:.3f}) "
                        f"crossed below signal({signal_val:.3f})"
                    ),
                    "price": today_close,
                    "change_pct": round(change_pct, 2),
                    **_extra(),
                })

    # ------------------------------------------------------------------
    # 5. Bollinger Band breakout
    # ------------------------------------------------------------------
    _, bb_upper, bb_lower = compute_bollinger(close)
    bb_upper_today = float(bb_upper.iloc[-1])
    bb_lower_today = float(bb_lower.iloc[-1])
    if not (pd.isna(bb_upper_today) or pd.isna(bb_lower_today)):
        if today_close > bb_upper_today:
            pct_above = (today_close - bb_upper_today) / bb_upper_today * 100
            anomalies.append({
                "ticker": ticker,
                "type": "bollinger_breakout",
                "severity": "HIGH" if pct_above > 2.0 else "MEDIUM",
                "details": (
                    f"Price ${today_close:.2f} broke above upper Bollinger Band "
                    f"${bb_upper_today:.2f} (+{pct_above:.2f}%)"
                ),
                "price": today_close,
                "change_pct": round(change_pct, 2),
                **_extra(),
            })
        elif today_close < bb_lower_today:
            pct_below = (bb_lower_today - today_close) / bb_lower_today * 100
            anomalies.append({
                "ticker": ticker,
                "type": "bollinger_breakout",
                "severity": "HIGH" if pct_below > 2.0 else "MEDIUM",
                "details": (
                    f"Price ${today_close:.2f} broke below lower Bollinger Band "
                    f"${bb_lower_today:.2f} (-{pct_below:.2f}%)"
                ),
                "price": today_close,
                "change_pct": round(change_pct, 2),
                **_extra(),
            })

    # ------------------------------------------------------------------
    # 6. Price momentum (5-day)
    # ------------------------------------------------------------------
    if len(close) >= 6:
        price_5d_ago = float(close.iloc[-6])
        momentum_pct = (today_close - price_5d_ago) / price_5d_ago * 100
        if abs(momentum_pct) > 3.0:
            direction = "up" if momentum_pct > 0 else "down"
            severity = "HIGH" if abs(momentum_pct) > 7.0 else "MEDIUM"
            anomalies.append({
                "ticker": ticker,
                "type": "price_momentum",
                "severity": severity,
                "details": (
                    f"Price moved {momentum_pct:+.2f}% over last 5 days "
                    f"(${price_5d_ago:.2f} → ${today_close:.2f}, trending {direction})"
                ),
                "price": today_close,
                "change_pct": round(change_pct, 2),
                **_extra(),
            })

    return anomalies


# ---------------------------------------------------------------------------
# Single-ticker summary
# ---------------------------------------------------------------------------

def get_ticker_summary(ticker: str) -> dict:
    """
    Fetch data for a single ticker and return a comprehensive summary dict.
    """
    try:
        stock = yf.Ticker(ticker)
        df = stock.history(period="45d", interval="1d", auto_adjust=True)

        if df is None or df.empty:
            return {"ticker": ticker, "error": "No data"}

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        if hasattr(df.index, "tz") and df.index.tz is not None:
            df.index = df.index.tz_localize(None)

        if len(df) < 30:
            return {"ticker": ticker, "error": f"Insufficient data ({len(df)} days)"}

        close = df["Close"]
        volume = df["Volume"]

        today_close = float(close.iloc[-1])
        prev_close = float(close.iloc[-2])
        today_volume = float(volume.iloc[-1])
        avg_volume_20 = float(volume.iloc[-21:-1].mean())
        volume_ratio = (today_volume / avg_volume_20) if avg_volume_20 > 0 else 0.0

        change_pct = (today_close - prev_close) / prev_close * 100

        rsi_series = compute_rsi(close)
        rsi_val = float(rsi_series.iloc[-1]) if not pd.isna(rsi_series.iloc[-1]) else 0.0

        macd_line, signal_line, _ = compute_macd(close)
        macd_val = float(macd_line.iloc[-1]) if not pd.isna(macd_line.iloc[-1]) else 0.0
        signal_val = float(signal_line.iloc[-1]) if not pd.isna(signal_line.iloc[-1]) else 0.0

        _, bb_upper, bb_lower = compute_bollinger(close)
        bb_upper_val = float(bb_upper.iloc[-1]) if not pd.isna(bb_upper.iloc[-1]) else 0.0
        bb_lower_val = float(bb_lower.iloc[-1]) if not pd.isna(bb_lower.iloc[-1]) else 0.0

        momentum_5d = 0.0
        if len(close) >= 6:
            price_5d = float(close.iloc[-6])
            momentum_5d = (today_close - price_5d) / price_5d * 100 if price_5d else 0.0

        momentum_20d = 0.0
        if len(close) >= 21:
            price_20d = float(close.iloc[-21])
            momentum_20d = (today_close - price_20d) / price_20d * 100 if price_20d else 0.0

        high_52w = float(close.max())
        low_52w = float(close.min())
        pct_from_high = (today_close - high_52w) / high_52w * 100 if high_52w else 0.0

        anomalies = detect_anomalies(ticker, df)

        return {
            "ticker": ticker,
            "price": round(today_close, 2),
            "change_pct": round(change_pct, 2),
            "volume": today_volume,
            "volume_ratio": round(volume_ratio, 4),
            "rsi": round(rsi_val, 2),
            "macd": round(macd_val, 4),
            "signal": round(signal_val, 4),
            "bb_upper": round(bb_upper_val, 2),
            "bb_lower": round(bb_lower_val, 2),
            "momentum_5d": round(momentum_5d, 2),
            "momentum_20d": round(momentum_20d, 2),
            "52w_high": round(high_52w, 2),
            "52w_low": round(low_52w, 2),
            "pct_from_52w_high": round(pct_from_high, 2),
            "anomalies": anomalies,
        }

    except Exception as exc:
        return {"ticker": ticker, "error": str(exc)}


# ---------------------------------------------------------------------------
# Batch scan functions
# ---------------------------------------------------------------------------

def scan_tickers(tickers: list[str]) -> list[dict]:
    """
    Fetch data for each ticker and run anomaly detection.
    Returns combined list of all anomaly dicts.
    """
    all_anomalies = []

    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            # Fetch ~45 days to have enough history for MACD (26-day EWM needs warmup)
            df = stock.history(period="45d", interval="1d", auto_adjust=True)

            if df is None or df.empty:
                print(f"  [WARNING] No data returned for {ticker}, skipping.")
                continue

            # Flatten MultiIndex columns if present (yfinance >= 0.2.x)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Drop timezone from index for cleaner display
            if hasattr(df.index, "tz") and df.index.tz is not None:
                df.index = df.index.tz_localize(None)

            if len(df) < 30:
                print(f"  [WARNING] Insufficient data for {ticker} ({len(df)} days), skipping.")
                continue

            anomalies = detect_anomalies(ticker, df)
            all_anomalies.extend(anomalies)

        except Exception as exc:
            print(f"  [WARNING] Failed to fetch/process {ticker}: {exc}")

    return all_anomalies


def scan_with_summary(tickers: list[str]) -> dict:
    """
    Fetch summaries for each ticker, run anomaly detection, and compute market breadth.

    Returns:
        {
            "tickers": {ticker: summary_dict, ...},
            "anomalies": [all anomaly dicts],
            "market_breadth": {
                "advancing": int,
                "declining": int,
                "avg_rsi": float,
                "high_volume_count": int,
            }
        }
    """
    ticker_summaries = {}
    all_anomalies = []

    advancing = 0
    declining = 0
    rsi_values = []
    high_volume_count = 0

    for ticker in tickers:
        summary = get_ticker_summary(ticker)
        ticker_summaries[ticker] = summary

        if "error" in summary:
            continue

        all_anomalies.extend(summary.get("anomalies", []))

        if summary.get("change_pct", 0) > 0:
            advancing += 1
        else:
            declining += 1

        rsi = summary.get("rsi", 0)
        if rsi:
            rsi_values.append(rsi)

        if summary.get("volume_ratio", 0) > 2:
            high_volume_count += 1

    avg_rsi = round(sum(rsi_values) / len(rsi_values), 2) if rsi_values else 0.0

    return {
        "tickers": ticker_summaries,
        "anomalies": all_anomalies,
        "market_breadth": {
            "advancing": advancing,
            "declining": declining,
            "avg_rsi": avg_rsi,
            "high_volume_count": high_volume_count,
        },
    }
