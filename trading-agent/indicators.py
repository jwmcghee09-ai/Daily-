"""Pure-Python technical indicator calculations. No external dependencies."""


def ema_series(values: list, period: int) -> list:
    if len(values) < period:
        return []
    k = 2.0 / (period + 1)
    result = [sum(values[:period]) / period]
    for v in values[period:]:
        result.append(v * k + result[-1] * (1 - k))
    return result


def rsi(closes: list, period: int = 14) -> object:
    if len(closes) < period + 1:
        return None
    gains  = [max(closes[i] - closes[i-1], 0) for i in range(1, len(closes))]
    losses = [max(closes[i-1] - closes[i], 0) for i in range(1, len(closes))]
    ag = sum(gains[-period:])  / period
    al = sum(losses[-period:]) / period
    return 100.0 if al == 0 else round(100 - 100 / (1 + ag / al), 2)


def macd(closes: list) -> object:
    if len(closes) < 35:
        return None
    fast   = ema_series(closes, 12)
    slow   = ema_series(closes, 26)
    n      = min(len(fast), len(slow))
    line   = [fast[i + len(fast) - n] - slow[i + len(slow) - n] for i in range(n)]
    signal = ema_series(line, 9)
    if not signal:
        return None
    return {
        "macd":      round(line[-1],   4),
        "signal":    round(signal[-1], 4),
        "histogram": round(line[-1] - signal[-1], 4),
        "crossover": "bullish" if line[-1] > signal[-1] and line[-2] <= signal[-2]
                     else "bearish" if line[-1] < signal[-1] and line[-2] >= signal[-2]
                     else "none",
    }


def bollinger_bands(closes: list, period: int = 20, mult: float = 2.0) -> object:
    if len(closes) < period:
        return None
    window   = closes[-period:]
    mid      = sum(window) / period
    std      = (sum((c - mid) ** 2 for c in window) / period) ** 0.5
    upper, lower = mid + mult * std, mid - mult * std
    cur = closes[-1]
    return {
        "upper":    round(upper, 4),
        "mid":      round(mid,   4),
        "lower":    round(lower, 4),
        "pct_b":    round((cur - lower) / (upper - lower), 3) if upper != lower else 0.5,
        "signal":   "overbought" if cur > upper else "oversold" if cur < lower else "neutral",
    }


def atr(highs: list, lows: list, closes: list, period: int = 14) -> object:
    if len(closes) < period + 1:
        return None
    trs = [
        max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
        for i in range(1, len(closes))
    ]
    return round(sum(trs[-period:]) / period, 4)


def adx(highs: list, lows: list, closes: list, period: int = 14) -> object:
    if len(closes) < period * 2 + 1:
        return None
    pdm, mdm, trs = [], [], []
    for i in range(1, len(closes)):
        up   = highs[i]  - highs[i-1]
        down = lows[i-1] - lows[i]
        pdm.append(up   if up   > down and up   > 0 else 0)
        mdm.append(down if down > up   and down > 0 else 0)
        trs.append(max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1])))

    def wilder(data):
        s = sum(data[:period])
        out = [s]
        for d in data[period:]:
            s = s - s / period + d
            out.append(s)
        return out

    satr = wilder(trs)
    spdm = wilder(pdm)
    smdm = wilder(mdm)
    pdi  = [100 * p / a if a else 0 for p, a in zip(spdm, satr)]
    mdi  = [100 * m / a if a else 0 for m, a in zip(smdm, satr)]
    dx   = [100 * abs(p - m) / (p + m) if (p + m) else 0 for p, m in zip(pdi, mdi)]
    adx_val = sum(dx[-period:]) / period if len(dx) >= period else None
    return {
        "adx":    round(adx_val, 2) if adx_val else None,
        "pdi":    round(pdi[-1],  2),
        "mdi":    round(mdi[-1],  2),
        "trend":  "strong" if adx_val and adx_val > 25 else "weak",
        "direction": "up" if pdi[-1] > mdi[-1] else "down",
    }


def moving_averages(closes: list) -> dict:
    result = {}
    cur = closes[-1]
    for period in [20, 50, 200]:
        s = ema_series(closes, period)
        if s:
            val = s[-1]
            result[f"ema{period}"] = round(val, 4)
            result[f"above_ema{period}"] = cur > val
    if "ema50" in result and "ema200" in result:
        result["golden_cross"] = result["ema50"] > result["ema200"]
    return result


def volume_analysis(volumes: list, period: int = 20) -> object:
    if len(volumes) < period + 1:
        return None
    avg = sum(volumes[-period-1:-1]) / period
    ratio = volumes[-1] / avg if avg else 1
    return {
        "ratio":  round(ratio, 2),
        "signal": "high" if ratio > 2 else "low" if ratio < 0.5 else "normal",
    }


def analyse(bars: list) -> dict:
    """Run all indicators on a list of Alpaca bar dicts (keys: o,h,l,c,v)."""
    if len(bars) < 20:
        return {"error": "insufficient bars"}

    opens   = [b["o"] for b in bars]
    highs   = [b["h"] for b in bars]
    lows    = [b["l"] for b in bars]
    closes  = [b["c"] for b in bars]
    volumes = [b["v"] for b in bars]

    cur = closes[-1]
    prev = closes[-2]
    day_chg = round((cur - prev) / prev * 100, 2) if prev else 0

    return {
        "price":        cur,
        "day_change_pct": day_chg,
        "rsi":          rsi(closes),
        "macd":         macd(closes),
        "bollinger":    bollinger_bands(closes),
        "atr":          atr(highs, lows, closes),
        "adx":          adx(highs, lows, closes),
        "emas":         moving_averages(closes),
        "volume":       volume_analysis(volumes),
        "bars_used":    len(bars),
    }
