import json
import threading
import time

import eventlet
eventlet.monkey_patch()

from flask import Flask, jsonify, request, render_template
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS

import data_source as ds

app = Flask(__name__)
app.config["SECRET_KEY"] = "trading-dashboard-secret"
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

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
        eventlet.sleep(3)
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
    eventlet.spawn(_yf_poller)
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)
