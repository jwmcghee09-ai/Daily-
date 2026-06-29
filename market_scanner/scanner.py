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
    # 1. Volume spike
    # ------------------------------------------------------------------
    avg_volume_20 = float(volume.iloc[-21:-1].mean())  # previous 20 days, not today
    if avg_volume_20 > 0:
        volume_ratio = today_volume / avg_volume_20
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
        })

    # ------------------------------------------------------------------
    # 3. RSI extreme
    # ------------------------------------------------------------------
    rsi = compute_rsi(close)
    rsi_today = float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else None
    if rsi_today is not None:
        if rsi_today > 70:
            anomalies.append({
                "ticker": ticker,
                "type": "rsi_extreme",
                "severity": "HIGH" if rsi_today > 80 else "MEDIUM",
                "details": f"RSI(14) overbought at {rsi_today:.1f} (>70 threshold)",
                "price": today_close,
                "change_pct": round(change_pct, 2),
            })
        elif rsi_today < 30:
            anomalies.append({
                "ticker": ticker,
                "type": "rsi_extreme",
                "severity": "HIGH" if rsi_today < 20 else "MEDIUM",
                "details": f"RSI(14) oversold at {rsi_today:.1f} (<30 threshold)",
                "price": today_close,
                "change_pct": round(change_pct, 2),
            })

    # ------------------------------------------------------------------
    # 4. MACD crossover (today)
    # ------------------------------------------------------------------
    macd_line, signal_line, histogram = compute_macd(close)
    if len(histogram) >= 2:
        hist_today = float(histogram.iloc[-1])
        hist_prev = float(histogram.iloc[-2])
        if not (pd.isna(hist_today) or pd.isna(hist_prev)):
            if hist_prev < 0 and hist_today > 0:
                # Bullish crossover
                anomalies.append({
                    "ticker": ticker,
                    "type": "macd_crossover",
                    "severity": "MEDIUM",
                    "details": (
                        f"Bullish MACD crossover — MACD({macd_line.iloc[-1]:.3f}) "
                        f"crossed above signal({signal_line.iloc[-1]:.3f})"
                    ),
                    "price": today_close,
                    "change_pct": round(change_pct, 2),
                })
            elif hist_prev > 0 and hist_today < 0:
                # Bearish crossover
                anomalies.append({
                    "ticker": ticker,
                    "type": "macd_crossover",
                    "severity": "MEDIUM",
                    "details": (
                        f"Bearish MACD crossover — MACD({macd_line.iloc[-1]:.3f}) "
                        f"crossed below signal({signal_line.iloc[-1]:.3f})"
                    ),
                    "price": today_close,
                    "change_pct": round(change_pct, 2),
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
            })

    return anomalies


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
