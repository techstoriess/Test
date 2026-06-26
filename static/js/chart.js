/**
 * ChartPane — wraps a single Lightweight Charts instance with:
 *   - colour-coded ticker bar (flashes green/red on price change)
 *   - symbol / timeframe / source dropdowns
 *   - live WebSocket price updates via the shared Socket.IO socket
 */
class ChartPane {
  /**
   * @param {HTMLElement} container  The .chart-pane element
   * @param {number}      index      Pane index (for localStorage)
   * @param {object}      providers  Provider config from /api/providers
   * @param {Socket}      socket     Shared Socket.IO socket
   * @param {object}      savedState { symbol, timeframe, source } or null
   */
  constructor(container, index, providers, socket, savedState) {
    this.container = container;
    this.index = index;
    this.providers = providers;
    this.socket = socket;

    this._chart = null;
    this._series = null;
    this._lastPrice = null;
    this._openPrice = null;
    this._currentSubscription = null;   // { symbol, source }

    // Resolve initial state
    const firstProvider = Object.keys(providers)[0];
    this.source    = (savedState && savedState.source) || firstProvider;
    this.symbol    = (savedState && savedState.symbol) || providers[this.source].default_symbols[0];
    this.timeframe = (savedState && savedState.timeframe) || providers[this.source].timeframes[2] || "1h";

    this._buildDOM();
    this._buildChart();
    this._loadData();
    this._subscribe();
  }

  // ------------------------------------------------------------------
  // DOM construction
  // ------------------------------------------------------------------

  _buildDOM() {
    const p = this.providers;

    // Ticker bar
    this.tickerBar = el("div", "ticker-bar");
    this.tickerSymbol = el("span", "ticker-symbol");
    this.tickerPrice  = el("span", "ticker-price");
    this.tickerChange = el("span", "ticker-change");
    this.tickerSourceBadge = el("span", "ticker-source");
    this.tickerBar.append(this.tickerSymbol, this.tickerPrice, this.tickerChange, this.tickerSourceBadge);

    // Toolbar
    this.toolbar = el("div", "chart-toolbar");

    // Source select
    this.sourceSelect = el("select", "source-select");
    Object.entries(p).forEach(([key, cfg]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = cfg.label;
      if (key === this.source) opt.selected = true;
      this.sourceSelect.appendChild(opt);
    });

    // Symbol select + custom input
    this.symbolSelect = el("select", "symbol-select");
    this._populateSymbols();

    this.customInput = el("input", "custom-symbol-input");
    this.customInput.placeholder = "Type symbol…";
    this.customInput.type = "text";

    // Timeframe select
    this.tfSelect = el("select", "tf-select");
    this._populateTimeframes();

    this.toolbar.append(this.sourceSelect, this.symbolSelect, this.customInput, this.tfSelect);

    // Chart area
    this.chartArea = el("div", "chart-area");
    this.loadingOverlay = el("div", "chart-loading");
    this.loadingOverlay.textContent = "Loading…";
    this.chartArea.appendChild(this.loadingOverlay);

    this.container.append(this.tickerBar, this.toolbar, this.chartArea);

    // Event listeners
    this.sourceSelect.addEventListener("change", () => {
      this.source = this.sourceSelect.value;
      this._populateSymbols();
      this._populateTimeframes();
      this.symbol = this.providers[this.source].default_symbols[0];
      this.timeframe = this.providers[this.source].timeframes[2] || "1h";
      this._reload();
    });

    this.symbolSelect.addEventListener("change", () => {
      if (this.symbolSelect.value === "__custom__") {
        this.customInput.classList.add("visible");
        this.customInput.focus();
      } else {
        this.customInput.classList.remove("visible");
        this.symbol = this.symbolSelect.value;
        this._reload();
      }
    });

    this.customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this.customInput.value.trim()) {
        this.symbol = this.customInput.value.trim().toUpperCase();
        this._reload();
      }
    });

    this.tfSelect.addEventListener("change", () => {
      this.timeframe = this.tfSelect.value;
      this._reload();
    });
  }

  _populateSymbols() {
    this.symbolSelect.innerHTML = "";
    const syms = this.providers[this.source].default_symbols;
    syms.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      if (s === this.symbol) opt.selected = true;
      this.symbolSelect.appendChild(opt);
    });
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = "Custom…";
    this.symbolSelect.appendChild(custom);
  }

  _populateTimeframes() {
    this.tfSelect.innerHTML = "";
    const tfs = this.providers[this.source].timeframes;
    tfs.forEach(tf => {
      const opt = document.createElement("option");
      opt.value = tf;
      opt.textContent = tf;
      if (tf === this.timeframe) opt.selected = true;
      this.tfSelect.appendChild(opt);
    });
    // Ensure current timeframe is valid for new source
    if (!tfs.includes(this.timeframe)) {
      this.timeframe = tfs[2] || tfs[0];
      this.tfSelect.value = this.timeframe;
    }
  }

  // ------------------------------------------------------------------
  // Chart lifecycle
  // ------------------------------------------------------------------

  _buildChart() {
    this._chart = LightweightCharts.createChart(this.chartArea, {
      layout: {
        background: { color: "#0d1117" },
        textColor: "#8b949e",
      },
      grid: {
        vertLines: { color: "#21262d" },
        horzLines: { color: "#21262d" },
      },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: { borderColor: "#30363d", timeVisible: true, secondsVisible: false },
    });

    this._series = this._chart.addCandlestickSeries({
      upColor: "#3fb950",
      downColor: "#f85149",
      borderUpColor: "#3fb950",
      borderDownColor: "#f85149",
      wickUpColor: "#3fb950",
      wickDownColor: "#f85149",
    });

    // Resize observer
    this._ro = new ResizeObserver(() => {
      const r = this.chartArea.getBoundingClientRect();
      this._chart.applyOptions({ width: r.width, height: r.height });
    });
    this._ro.observe(this.chartArea);
  }

  destroyChart() {
    if (this._ro) this._ro.disconnect();
    if (this._chart) { this._chart.remove(); this._chart = null; }
    this._series = null;
    this._unsubscribe();
  }

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  async _loadData() {
    this._setLoading(true);
    this._updateTickerLabel();
    try {
      const url = `/api/history?symbol=${encodeURIComponent(this.symbol)}&timeframe=${this.timeframe}&source=${this.source}`;
      const resp = await fetch(url);
      const candles = await resp.json();
      if (Array.isArray(candles) && candles.length > 0) {
        this._series.setData(candles);
        this._openPrice = candles[0].open;
        const last = candles[candles.length - 1];
        this._updateTickerPrice(last.close, false);
        this._chart.timeScale().fitContent();
      }
    } catch (e) {
      console.error(`[pane ${this.index}] loadData error`, e);
    } finally {
      this._setLoading(false);
    }
  }

  _reload() {
    this._unsubscribe();
    this._loadData();
    this._subscribe();
    this._saveState();
  }

  // ------------------------------------------------------------------
  // WebSocket subscription
  // ------------------------------------------------------------------

  _subscribe() {
    this._currentSubscription = { symbol: this.symbol, source: this.source };
    this.socket.emit("subscribe", this._currentSubscription);
    const roomKey = `${this.source}:${this.symbol}`;
    this._priceHandler = (data) => {
      if (data.source === this.source && data.symbol === this._canonSymbol()) {
        this._onPriceUpdate(data.price);
      }
    };
    this.socket.on("price_update", this._priceHandler);
  }

  _unsubscribe() {
    if (this._currentSubscription) {
      this.socket.emit("unsubscribe", this._currentSubscription);
      this._currentSubscription = null;
    }
    if (this._priceHandler) {
      this.socket.off("price_update", this._priceHandler);
      this._priceHandler = null;
    }
  }

  _canonSymbol() {
    // Hyperliquid sends coin names without suffix (BTC not BTC-USD)
    return this.source === "hyperliquid"
      ? this.symbol.split("-")[0].split("/")[0].toUpperCase()
      : this.symbol;
  }

  // ------------------------------------------------------------------
  // Price updates
  // ------------------------------------------------------------------

  _onPriceUpdate(price) {
    const prev = this._lastPrice;
    const up = prev === null ? true : price >= prev;
    this._updateTickerPrice(price, true, up);

    // Update the last candle on the series
    if (this._series) {
      const now = Math.floor(Date.now() / 1000);
      try {
        this._series.update({ time: now, open: this._openPrice || price, high: price, low: price, close: price });
      } catch (_) {
        // ignore series update errors (e.g. time went backwards)
      }
    }
  }

  _updateTickerPrice(price, flash, up) {
    this._lastPrice = price;
    const fmt = price >= 1000 ? price.toLocaleString("en-US", { maximumFractionDigits: 2 })
               : price >= 1   ? price.toFixed(4)
               :                price.toFixed(6);
    this.tickerPrice.textContent = fmt;

    if (flash) {
      this.tickerPrice.className = "ticker-price " + (up ? "up" : "down");
      this._flashBar(up);
    }

    // % change from open
    if (this._openPrice) {
      const pct = ((price - this._openPrice) / this._openPrice * 100);
      this.tickerChange.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
      this.tickerChange.className = "ticker-change " + (pct >= 0 ? "up" : "down");
    }
  }

  _updateTickerLabel() {
    this.tickerSymbol.textContent = this.symbol;
    this.tickerSourceBadge.textContent = this.source;
  }

  _flashBar(up) {
    this.tickerBar.classList.remove("flash-green", "flash-red");
    void this.tickerBar.offsetWidth;  // reflow to restart animation
    this.tickerBar.classList.add(up ? "flash-green" : "flash-red");
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      this.tickerBar.classList.remove("flash-green", "flash-red");
    }, 600);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  _setLoading(v) {
    this.loadingOverlay.classList.toggle("visible", v);
  }

  _saveState() {
    const allStates = JSON.parse(localStorage.getItem("paneStates") || "[]");
    allStates[this.index] = { symbol: this.symbol, timeframe: this.timeframe, source: this.source };
    localStorage.setItem("paneStates", JSON.stringify(allStates));
  }

  getState() {
    return { symbol: this.symbol, timeframe: this.timeframe, source: this.source };
  }
}

// ---------------------------------------------------------------------------
// Small DOM helper
// ---------------------------------------------------------------------------
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
