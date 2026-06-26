"""
Pluggable data source layer.

To add a new broker (Alpaca, Binance, Zerodha, Polygon…):
  1. Add a function: get_history_<name>(symbol, timeframe) -> list[OHLCV]
  2. Add a function: get_price_<name>(symbol) -> float
  3. Register them in PROVIDERS below.

OHLCV format: {"time": unix_timestamp_seconds, "open": f, "high": f, "low": f, "close": f, "volume": f}
"""

import time
import datetime
import yfinance as yf

# ---------------------------------------------------------------------------
# yfinance (Indian stocks + anything Yahoo supports)
# ---------------------------------------------------------------------------

_YF_INTERVAL_MAP = {
    "1m":  "1m",
    "5m":  "5m",
    "15m": "15m",
    "30m": "30m",
    "1h":  "1h",
    "1d":  "1d",
    "1w":  "1wk",
}

_YF_PERIOD_MAP = {
    "1m":  "5d",
    "5m":  "60d",
    "15m": "60d",
    "30m": "60d",
    "1h":  "730d",
    "1d":  "5y",
    "1w":  "10y",
}


def get_history_yfinance(symbol: str, timeframe: str) -> list:
    interval = _YF_INTERVAL_MAP.get(timeframe, "1d")
    period = _YF_PERIOD_MAP.get(timeframe, "1y")
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval, auto_adjust=True)
    if df.empty:
        return []
    df = df.dropna()
    result = []
    for ts, row in df.iterrows():
        t = int(ts.timestamp())
        result.append({
            "time": t,
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": round(float(row["Volume"]), 2),
        })
    return result


def get_price_yfinance(symbol: str) -> float:
    ticker = yf.Ticker(symbol)
    info = ticker.fast_info
    try:
        return float(info.last_price)
    except Exception:
        hist = ticker.history(period="1d", interval="1m")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
        return 0.0


# ---------------------------------------------------------------------------
# Hyperliquid (crypto) — history via their REST API, price via WS in app.py
# ---------------------------------------------------------------------------

_HL_INTERVAL_MAP = {
    "1m":  "1m",
    "5m":  "5m",
    "15m": "15m",
    "30m": "30m",
    "1h":  "1h",
    "4h":  "4h",
    "1d":  "1d",
    "1w":  "1w",
}


def get_history_hyperliquid(symbol: str, timeframe: str) -> list:
    import requests as req
    interval = _HL_INTERVAL_MAP.get(timeframe, "1h")
    # Hyperliquid uses coin names like BTC, ETH (strip -USD etc.)
    coin = symbol.split("-")[0].split("/")[0].upper()
    end_ms = int(time.time() * 1000)
    # Request ~500 candles worth of data
    interval_ms = {
        "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000,
        "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000,
    }.get(interval, 3_600_000)
    start_ms = end_ms - 500 * interval_ms
    payload = {
        "type": "candleSnapshot",
        "req": {"coin": coin, "interval": interval, "startTime": start_ms, "endTime": end_ms},
    }
    try:
        r = req.post("https://api.hyperliquid.xyz/info", json=payload, timeout=10)
        r.raise_for_status()
        candles = r.json()
        result = []
        for c in candles:
            result.append({
                "time": int(c["t"] // 1000),
                "open": float(c["o"]),
                "high": float(c["h"]),
                "low": float(c["l"]),
                "close": float(c["c"]),
                "volume": float(c["v"]),
            })
        return result
    except Exception as e:
        print(f"[hyperliquid] history error: {e}")
        return []


def get_price_hyperliquid(symbol: str) -> float:
    import requests as req
    coin = symbol.split("-")[0].split("/")[0].upper()
    try:
        r = req.post(
            "https://api.hyperliquid.xyz/info",
            json={"type": "allMids"},
            timeout=5,
        )
        mids = r.json()
        return float(mids.get(coin, 0))
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Provider registry — add new brokers here
# ---------------------------------------------------------------------------

PROVIDERS = {
    "hyperliquid": {
        "label": "Hyperliquid (Crypto)",
        "get_history": get_history_hyperliquid,
        "get_price": get_price_hyperliquid,
        "default_symbols": ["BTC", "ETH", "SOL", "ARB", "AVAX", "DOGE", "MATIC", "LINK"],
        "timeframes": ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"],
    },
    "yfinance": {
        "label": "yfinance (Stocks/ETFs)",
        "get_history": get_history_yfinance,
        "get_price": get_price_yfinance,
        "default_symbols": [
            "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
            "SBIN.NS", "WIPRO.NS", "BAJFINANCE.NS", "AAPL", "MSFT", "GOOGL", "TSLA",
        ],
        "timeframes": ["1m", "5m", "15m", "30m", "1h", "1d", "1w"],
    },
    # -----------------------------------------------------------------------
    # Template for adding a new provider:
    # "alpaca": {
    #     "label": "Alpaca (US Stocks)",
    #     "get_history": get_history_alpaca,   # implement above
    #     "get_price": get_price_alpaca,
    #     "default_symbols": ["AAPL", "MSFT"],
    #     "timeframes": ["1m", "5m", "1h", "1d"],
    # },
    # -----------------------------------------------------------------------
}


def get_history(symbol: str, timeframe: str, source: str) -> list:
    provider = PROVIDERS.get(source)
    if not provider:
        return []
    return provider["get_history"](symbol, timeframe)


def get_price(symbol: str, source: str) -> float:
    provider = PROVIDERS.get(source)
    if not provider:
        return 0.0
    return provider["get_price"](symbol)
