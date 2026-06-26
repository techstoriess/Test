import json
import threading
import time

from flask import Flask, jsonify, request, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS

import data_source as ds

app = Flask(__name__)
app.config["SECRET_KEY"] = "trading-dashboard-secret"
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# ---------------------------------------------------------------------------
# Hyperliquid WebSocket relay
# ---------------------------------------------------------------------------

_hl_ws = None
_hl_subscriptions: set = set()   # set of coin names currently subscribed
_hl_lock = threading.Lock()


def _hl_connect():
    """Open (or reuse) a connection to Hyperliquid WS and listen for trades."""
    import websocket as ws_lib

    def on_message(ws, message):
        try:
            data = json.loads(message)
            if data.get("channel") == "trades":
                for trade in data.get("data", []):
                    coin = trade.get("coin", "")
                    price = float(trade.get("px", 0))
                    side = trade.get("side", "")
                    socketio.emit(
                        "price_update",
                        {"symbol": coin, "price": price, "side": side, "source": "hyperliquid"},
                        room=f"hyperliquid:{coin}",
                    )
        except Exception as e:
            print(f"[hl_ws] parse error: {e}")

    def on_error(ws, error):
        print(f"[hl_ws] error: {error}")

    def on_close(ws, *args):
        print("[hl_ws] closed — reconnecting in 5s")
        time.sleep(5)
        _start_hl_ws()

    def on_open(ws):
        global _hl_ws
        _hl_ws = ws
        print("[hl_ws] connected")
        with _hl_lock:
            for coin in list(_hl_subscriptions):
                _hl_subscribe_coin(coin, ws)

    wsa = ws_lib.WebSocketApp(
        "wss://api.hyperliquid.xyz/ws",
        on_open=on_open,
        on_message=on_message,
        on_error=on_error,
        on_close=on_close,
    )
    wsa.run_forever(ping_interval=30, ping_timeout=10)


def _start_hl_ws():
    t = threading.Thread(target=_hl_connect, daemon=True)
    t.start()


def _hl_subscribe_coin(coin: str, ws=None):
    target = ws or _hl_ws
    if target:
        msg = json.dumps({"method": "subscribe", "subscription": {"type": "trades", "coin": coin}})
        try:
            target.send(msg)
        except Exception as e:
            print(f"[hl_ws] subscribe error for {coin}: {e}")


def _hl_unsubscribe_coin(coin: str):
    if _hl_ws:
        msg = json.dumps({"method": "unsubscribe", "subscription": {"type": "trades", "coin": coin}})
        try:
            _hl_ws.send(msg)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# yfinance price polling
# ---------------------------------------------------------------------------

_yf_poll_symbols: dict = {}   # symbol -> set of sids
_yf_poll_lock = threading.Lock()


def _yf_poller():
    while True:
        time.sleep(3)
        with _yf_poll_lock:
            symbols = list(_yf_poll_symbols.keys())
        for symbol in symbols:
            try:
                price = ds.get_price(symbol, "yfinance")
                if price:
                    socketio.emit(
                        "price_update",
                        {"symbol": symbol, "price": price, "source": "yfinance"},
                        room=f"yfinance:{symbol}",
                    )
            except Exception as e:
                print(f"[yf_poll] {symbol}: {e}")


# ---------------------------------------------------------------------------
# REST API
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/providers")
def api_providers():
    result = {}
    for key, cfg in ds.PROVIDERS.items():
        result[key] = {
            "label": cfg["label"],
            "default_symbols": cfg["default_symbols"],
            "timeframes": cfg["timeframes"],
        }
    return jsonify(result)


@app.route("/api/history")
def api_history():
    symbol = request.args.get("symbol", "")
    timeframe = request.args.get("timeframe", "1h")
    source = request.args.get("source", "hyperliquid")
    if not symbol:
        return jsonify({"error": "symbol required"}), 400
    candles = ds.get_history(symbol, timeframe, source)
    return jsonify(candles)


@app.route("/api/indicators")
def api_indicators():
    """
    Compute technical indicators server-side from OHLCV data.
    Query params: symbol, timeframe, source, indicator (sma/ema/bb/rsi/macd), period
    Returns a list of {time, value} or {time, upper, middle, lower} for BB,
    or {time, macd, signal, hist} for MACD.
    """
    symbol    = request.args.get("symbol", "")
    timeframe = request.args.get("timeframe", "1h")
    source    = request.args.get("source", "hyperliquid")
    indicator = request.args.get("indicator", "sma").lower()
    period    = int(request.args.get("period", 20))

    if not symbol:
        return jsonify({"error": "symbol required"}), 400

    candles = ds.get_history(symbol, timeframe, source)
    if not candles:
        return jsonify([])

    closes = [c["close"] for c in candles]
    times  = [c["time"]  for c in candles]

    def sma(data, n):
        out = []
        for i in range(len(data)):
            if i < n - 1:
                out.append(None)
            else:
                out.append(sum(data[i - n + 1:i + 1]) / n)
        return out

    def ema(data, n):
        out = [None] * len(data)
        k = 2 / (n + 1)
        # find first valid window
        start = n - 1
        if start >= len(data):
            return out
        out[start] = sum(data[:n]) / n
        for i in range(start + 1, len(data)):
            out[i] = data[i] * k + out[i - 1] * (1 - k)
        return out

    if indicator == "sma":
        vals = sma(closes, period)
        return jsonify([{"time": t, "value": round(v, 4)} for t, v in zip(times, vals) if v is not None])

    if indicator == "ema":
        vals = ema(closes, period)
        return jsonify([{"time": t, "value": round(v, 4)} for t, v in zip(times, vals) if v is not None])

    if indicator == "bb":
        sma_vals = sma(closes, period)
        result = []
        for i, (t, mid) in enumerate(zip(times, sma_vals)):
            if mid is None:
                continue
            window = closes[i - period + 1:i + 1]
            std = (sum((x - mid) ** 2 for x in window) / period) ** 0.5
            result.append({"time": t, "upper": round(mid + 2 * std, 4),
                           "middle": round(mid, 4), "lower": round(mid - 2 * std, 4)})
        return jsonify(result)

    if indicator == "rsi":
        n = period
        result = []
        for i in range(n, len(closes)):
            window = closes[i - n:i + 1]
            gains = [max(window[j] - window[j-1], 0) for j in range(1, len(window))]
            losses = [max(window[j-1] - window[j], 0) for j in range(1, len(window))]
            ag = sum(gains) / n
            al = sum(losses) / n
            rs = ag / al if al != 0 else 100
            rsi = 100 - (100 / (1 + rs))
            result.append({"time": times[i], "value": round(rsi, 2)})
        return jsonify(result)

    if indicator == "macd":
        fast, slow, sig = 12, 26, 9
        fast_ema = ema(closes, fast)
        slow_ema = ema(closes, slow)
        macd_line = [f - s if f is not None and s is not None else None
                     for f, s in zip(fast_ema, slow_ema)]
        valid_macd = [v for v in macd_line if v is not None]
        # signal = EMA(9) of macd_line
        sig_ema_raw = ema(valid_macd, sig)
        # re-align
        offset = next(i for i, v in enumerate(macd_line) if v is not None)
        result = []
        for i, (t, m) in enumerate(zip(times, macd_line)):
            if m is None:
                continue
            vi = i - offset
            sv = sig_ema_raw[vi]
            if sv is None:
                continue
            result.append({"time": t, "macd": round(m, 6),
                           "signal": round(sv, 6), "hist": round(m - sv, 6)})
        return jsonify(result)

    return jsonify({"error": f"unknown indicator: {indicator}"}), 400


# ---------------------------------------------------------------------------
# Socket.IO events
# ---------------------------------------------------------------------------

@socketio.on("subscribe")
def on_subscribe(data):
    symbol = data.get("symbol", "")
    source = data.get("source", "hyperliquid")
    if not symbol:
        return
    room = f"{source}:{symbol}"
    join_room(room)

    if source == "hyperliquid":
        coin = symbol.split("-")[0].upper()
        with _hl_lock:
            if coin not in _hl_subscriptions:
                _hl_subscriptions.add(coin)
                _hl_subscribe_coin(coin)
    elif source == "yfinance":
        with _yf_poll_lock:
            if symbol not in _yf_poll_symbols:
                _yf_poll_symbols[symbol] = set()
            _yf_poll_symbols[symbol].add(request.sid)


@socketio.on("unsubscribe")
def on_unsubscribe(data):
    symbol = data.get("symbol", "")
    source = data.get("source", "hyperliquid")
    if not symbol:
        return
    room = f"{source}:{symbol}"
    leave_room(room)

    if source == "yfinance":
        with _yf_poll_lock:
            sids = _yf_poll_symbols.get(symbol, set())
            sids.discard(request.sid)
            if not sids:
                _yf_poll_symbols.pop(symbol, None)


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    with _yf_poll_lock:
        for symbol in list(_yf_poll_symbols.keys()):
            _yf_poll_symbols[symbol].discard(sid)
            if not _yf_poll_symbols[symbol]:
                del _yf_poll_symbols[symbol]


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    _start_hl_ws()
    t = threading.Thread(target=_yf_poller, daemon=True)
    t.start()
    socketio.run(app, host="0.0.0.0", port=5000, debug=False, allow_unsafe_werkzeug=True)
