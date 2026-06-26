/**
 * ChartPane — wraps a Lightweight Charts instance with:
 *   - colour-coded ticker bar (flashes green/red on price change)
 *   - symbol / timeframe / source dropdowns
 *   - indicator toolbar: SMA, EMA, Bollinger Bands (overlay), RSI, MACD (sub-pane)
 *   - live WebSocket price updates via the shared Socket.IO socket
 */

const INDICATOR_COLORS = ["#58a6ff", "#f0883e", "#bc8cff", "#3fb950", "#ff7b72", "#79c0ff"];

class ChartPane {
  constructor(container, index, providers, socket, savedState) {
    this.container = container;
    this.index     = index;
    this.providers = providers;
    this.socket    = socket;

    this._chart    = null;
    this._mainSeries = null;
    this._subChart = null;
    this._lastPrice  = null;
    this._openPrice  = null;
    this._currentSubscription = null;
    this._colorIdx = 0;

    // active indicators: [{id, type, period, series, subSeries, badge}]
    this._indicators = [];

    const firstProvider = Object.keys(providers)[0];
    this.source    = (savedState && savedState.source)    || firstProvider;
    this.symbol    = (savedState && savedState.symbol)    || providers[this.source].default_symbols[0];
    this.timeframe = (savedState && savedState.timeframe) || providers[this.source].timeframes[2] || "1h";

    this._buildDOM();
    this._buildChart();
    this._loadData();
    this._subscribe();
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  _buildDOM() {
    const p = this.providers;

    // ── Ticker bar ──────────────────────────────────────────────────────────
    this.tickerBar = el("div", "ticker-bar");
    this.tickerSymbol = el("span", "ticker-symbol");
    this.tickerPrice  = el("span", "ticker-price");
    this.tickerChange = el("span", "ticker-change");
    this.tickerSourceBadge = el("span", "ticker-source");
    this.tickerBar.append(this.tickerSymbol, this.tickerPrice, this.tickerChange, this.tickerSourceBadge);

    // ── Symbol / TF toolbar ─────────────────────────────────────────────────
    this.toolbar = el("div", "chart-toolbar");

    this.sourceSelect = el("select", "source-select");
    Object.entries(p).forEach(([key, cfg]) => {
      const opt = document.createElement("option");
      opt.value = key; opt.textContent = cfg.label;
      if (key === this.source) opt.selected = true;
      this.sourceSelect.appendChild(opt);
    });

    this.symbolSelect = el("select", "symbol-select");
    this._populateSymbols();

    this.customInput = el("input", "custom-symbol-input");
    this.customInput.placeholder = "Type symbol & press Enter";
    this.customInput.type = "text";

    this.tfSelect = el("select", "tf-select");
    this._populateTimeframes();

    this.toolbar.append(this.sourceSelect, this.symbolSelect, this.customInput, this.tfSelect);

    // ── Indicator toolbar ────────────────────────────────────────────────────
    this.indToolbar = el("div", "indicator-toolbar");

    const indLabel = el("label"); indLabel.textContent = "Indicator:";

    this.indSelect = el("select", "ind-type-select");
    [["sma","SMA"],["ema","EMA"],["bb","BB"],["rsi","RSI"],["macd","MACD"]].forEach(([v,t]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = t;
      this.indSelect.appendChild(o);
    });

    const periodLabel = el("label"); periodLabel.textContent = "Period:";
    this.indPeriod = el("input"); this.indPeriod.type = "number";
    this.indPeriod.value = "20"; this.indPeriod.min = "2"; this.indPeriod.max = "200";

    this.indAddBtn = el("button", "ind-add-btn"); this.indAddBtn.textContent = "+ Add";
    this.indBadgeContainer = el("span");

    this.indToolbar.append(indLabel, this.indSelect, periodLabel, this.indPeriod, this.indAddBtn, this.indBadgeContainer);

    // ── Chart areas ─────────────────────────────────────────────────────────
    this.chartArea = el("div", "chart-area");

    this.chartMain = el("div", "chart-main");
    this.loadingOverlay = el("div", "chart-loading");
    this.loadingOverlay.textContent = "Loading…";
    this.chartMain.appendChild(this.loadingOverlay);

    this.chartSub = el("div", "chart-sub");   // RSI / MACD sub-pane

    this.chartArea.append(this.chartMain, this.chartSub);
    this.container.append(this.tickerBar, this.toolbar, this.indToolbar, this.chartArea);

    // ── Events ──────────────────────────────────────────────────────────────
    this.sourceSelect.addEventListener("change", () => {
      this.source = this.sourceSelect.value;
      this._populateSymbols();
      this._populateTimeframes();
      this.symbol    = this.providers[this.source].default_symbols[0];
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

    this.indAddBtn.addEventListener("click", () => this._addIndicator());
  }

  _populateSymbols() {
    this.symbolSelect.innerHTML = "";
    this.providers[this.source].default_symbols.forEach(s => {
      const o = document.createElement("option");
      o.value = s; o.textContent = s;
      if (s === this.symbol) o.selected = true;
      this.symbolSelect.appendChild(o);
    });
    const cust = document.createElement("option");
    cust.value = "__custom__"; cust.textContent = "Custom…";
    this.symbolSelect.appendChild(cust);
  }

  _populateTimeframes() {
    this.tfSelect.innerHTML = "";
    const tfs = this.providers[this.source].timeframes;
    tfs.forEach(tf => {
      const o = document.createElement("option");
      o.value = tf; o.textContent = tf;
      if (tf === this.timeframe) o.selected = true;
      this.tfSelect.appendChild(o);
    });
    if (!tfs.includes(this.timeframe)) {
      this.timeframe = tfs[2] || tfs[0];
      this.tfSelect.value = this.timeframe;
    }
  }

  // -------------------------------------------------------------------------
  // Chart lifecycle
  // -------------------------------------------------------------------------

  _buildChart() {
    const chartOpts = {
      layout: { background: { color: "#0d1117" }, textColor: "#8b949e" },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: { borderColor: "#30363d", timeVisible: true, secondsVisible: false },
    };

    this._chart = LightweightCharts.createChart(this.chartMain, chartOpts);
    this._mainSeries = this._chart.addCandlestickSeries({
      upColor: "#3fb950", downColor: "#f85149",
      borderUpColor: "#3fb950", borderDownColor: "#f85149",
      wickUpColor: "#3fb950", wickDownColor: "#f85149",
    });

    this._subChart = LightweightCharts.createChart(this.chartSub, {
      ...chartOpts,
      timeScale: { ...chartOpts.timeScale, visible: false },
      rightPriceScale: { borderColor: "#30363d", scaleMargins: { top: 0.1, bottom: 0.1 } },
    });

    // Keep timescales in sync
    this._chart.timeScale().subscribeVisibleTimeRangeChange(range => {
      if (range) this._subChart.timeScale().setVisibleRange(range);
    });

    this._ro = new ResizeObserver(() => {
      const r = this.chartMain.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        this._chart.applyOptions({ width: r.width, height: r.height });
      if (this.chartSub.classList.contains("visible")) {
        const rs = this.chartSub.getBoundingClientRect();
        if (rs.width > 0 && rs.height > 0)
          this._subChart.applyOptions({ width: rs.width, height: rs.height });
      }
    });
    this._ro.observe(this.chartMain);
    this._ro.observe(this.chartSub);
  }

  destroyChart() {
    if (this._ro) this._ro.disconnect();
    if (this._chart) { this._chart.remove(); this._chart = null; }
    if (this._subChart) { this._subChart.remove(); this._subChart = null; }
    this._mainSeries = null;
    this._indicators = [];
    this._unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Indicators
  // -------------------------------------------------------------------------

  async _addIndicator() {
    const type   = this.indSelect.value;
    const period = parseInt(this.indPeriod.value, 10) || 20;
    const color  = INDICATOR_COLORS[this._colorIdx % INDICATOR_COLORS.length];
    this._colorIdx++;

    const id = `${type}_${period}_${Date.now()}`;
    const label = type === "bb" ? `BB(${period})` : type === "macd" ? "MACD" : `${type.toUpperCase()}(${period})`;

    // Fetch indicator data
    const url = `/api/indicators?symbol=${encodeURIComponent(this.symbol)}&timeframe=${this.timeframe}&source=${this.source}&indicator=${type}&period=${period}`;
    let data;
    try {
      const r = await fetch(url);
      data = await r.json();
    } catch (e) {
      console.error("indicator fetch failed", e);
      return;
    }
    if (!data || data.error || data.length === 0) return;

    const isSubPane = type === "rsi" || type === "macd";

    let series = null;
    let extraSeries = {};   // for BB bands / MACD signal+hist

    if (type === "sma" || type === "ema") {
      series = this._chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      series.setData(data.map(d => ({ time: d.time, value: d.value })));

    } else if (type === "bb") {
      const mid   = this._chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const upper = this._chart.addLineSeries({ color, lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false });
      const lower = this._chart.addLineSeries({ color, lineWidth: 1, lineStyle: 1, priceLineVisible: false, lastValueVisible: false });
      mid.setData(data.map(d => ({ time: d.time, value: d.middle })));
      upper.setData(data.map(d => ({ time: d.time, value: d.upper })));
      lower.setData(data.map(d => ({ time: d.time, value: d.lower })));
      series = mid;
      extraSeries = { upper, lower };

    } else if (type === "rsi") {
      this._showSubPane();
      series = this._subChart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      series.setData(data.map(d => ({ time: d.time, value: d.value })));
      // Overbought/oversold lines
      const ob = this._subChart.addLineSeries({ color: "#f85149", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      const os = this._subChart.addLineSeries({ color: "#3fb950", lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      const times70 = data.map(d => ({ time: d.time, value: 70 }));
      const times30 = data.map(d => ({ time: d.time, value: 30 }));
      ob.setData(times70); os.setData(times30);
      extraSeries = { ob, os };

    } else if (type === "macd") {
      this._showSubPane();
      const macdLine = this._subChart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      macdLine.setData(data.map(d => ({ time: d.time, value: d.macd })));
      const sigLine = this._subChart.addLineSeries({ color: "#f0883e", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      sigLine.setData(data.map(d => ({ time: d.time, value: d.signal })));
      const hist = this._subChart.addHistogramSeries({ color: "#21262d", priceLineVisible: false, lastValueVisible: false });
      hist.setData(data.map(d => ({ time: d.time, value: d.hist, color: d.hist >= 0 ? "#3fb950" : "#f85149" })));
      series = macdLine;
      extraSeries = { sigLine, hist };
    }

    // Badge in toolbar
    const badge = el("span", "ind-badge");
    const dot = el("span"); dot.style.color = color; dot.textContent = "● ";
    const lbl = el("span"); lbl.textContent = label;
    const rm  = el("button"); rm.textContent = "✕";
    rm.addEventListener("click", () => this._removeIndicator(id));
    badge.append(dot, lbl, rm);
    this.indBadgeContainer.appendChild(badge);

    this._indicators.push({ id, type, period, series, extraSeries, badge, isSubPane });
  }

  _removeIndicator(id) {
    const idx = this._indicators.findIndex(i => i.id === id);
    if (idx === -1) return;
    const ind = this._indicators[idx];

    const removeFrom = (chart, s) => { try { chart.removeSeries(s); } catch (_) {} };
    const chart = ind.isSubPane ? this._subChart : this._chart;
    if (ind.series) removeFrom(chart, ind.series);
    Object.values(ind.extraSeries).forEach(s => removeFrom(chart, s));
    ind.badge.remove();
    this._indicators.splice(idx, 1);

    // Hide sub-pane if no sub-pane indicators remain
    if (!this._indicators.some(i => i.isSubPane)) this._hideSubPane();
  }

  _showSubPane() {
    this.chartSub.classList.add("visible");
    const rs = this.chartSub.getBoundingClientRect();
    if (rs.width > 0) this._subChart.applyOptions({ width: rs.width, height: 90 });
  }

  _hideSubPane() {
    this.chartSub.classList.remove("visible");
  }

  _clearAllIndicators() {
    [...this._indicators].forEach(i => this._removeIndicator(i.id));
  }

  async _reloadIndicators() {
    const snapshot = this._indicators.map(i => ({ type: i.type, period: i.period }));
    this._clearAllIndicators();
    for (const { type, period } of snapshot) {
      this.indSelect.value   = type;
      this.indPeriod.value   = period;
      await this._addIndicator();
    }
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  async _loadData() {
    this._setLoading(true);
    this._updateTickerLabel();
    try {
      const url = `/api/history?symbol=${encodeURIComponent(this.symbol)}&timeframe=${this.timeframe}&source=${this.source}`;
      const resp = await fetch(url);
      const candles = await resp.json();
      if (Array.isArray(candles) && candles.length > 0) {
        this._mainSeries.setData(candles);
        this._openPrice = candles[0].open;
        const last = candles[candles.length - 1];
        this._updateTickerPrice(last.close, false);
        this._chart.timeScale().fitContent();
        await this._reloadIndicators();
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

  // -------------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------------

  _subscribe() {
    this._currentSubscription = { symbol: this.symbol, source: this.source };
    this.socket.emit("subscribe", this._currentSubscription);
    this._priceHandler = (data) => {
      if (data.source === this.source && data.symbol === this._canonSymbol())
        this._onPriceUpdate(data.price);
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
    return this.source === "hyperliquid"
      ? this.symbol.split("-")[0].split("/")[0].toUpperCase()
      : this.symbol;
  }

  // -------------------------------------------------------------------------
  // Price updates
  // -------------------------------------------------------------------------

  _onPriceUpdate(price) {
    const prev = this._lastPrice;
    const up   = prev === null ? true : price >= prev;
    this._updateTickerPrice(price, true, up);
    if (this._mainSeries) {
      const now = Math.floor(Date.now() / 1000);
      try {
        this._mainSeries.update({ time: now, open: this._openPrice || price, high: price, low: price, close: price });
      } catch (_) {}
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
    if (this._openPrice) {
      const pct = (price - this._openPrice) / this._openPrice * 100;
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
    void this.tickerBar.offsetWidth;
    this.tickerBar.classList.add(up ? "flash-green" : "flash-red");
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => this.tickerBar.classList.remove("flash-green", "flash-red"), 600);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  _setLoading(v) { this.loadingOverlay.classList.toggle("visible", v); }

  _saveState() {
    const all = JSON.parse(localStorage.getItem("paneStates") || "[]");
    all[this.index] = { symbol: this.symbol, timeframe: this.timeframe, source: this.source };
    localStorage.setItem("paneStates", JSON.stringify(all));
  }

  getState() {
    return { symbol: this.symbol, timeframe: this.timeframe, source: this.source };
  }
}

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
