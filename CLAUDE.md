# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local trading charts dashboard with a Flask backend and vanilla HTML/CSS/JS frontend. Displays live crypto (Hyperliquid WebSocket) and Indian stock (yfinance) data on Lightweight Charts in a configurable split-screen grid.

## Running the App

```bash
# Install Python dependencies
pip install -r requirements.txt

# Start the Flask backend (serves both the API and static files)
python app.py
# App runs at http://localhost:5000
```

## Architecture

### Backend (`app.py` + `data_source.py`)
- `app.py` — Flask server; exposes REST endpoints (`/api/history`, `/api/symbols`) and a Socket.IO namespace for streaming tick data to the browser.
- `data_source.py` — **Single pluggable file** for all data providers. Adding a new broker (Alpaca, Zerodha, Binance, Polygon…) means adding one fetch function here and registering it in `PROVIDERS`. The file exports:
  - `get_history(symbol, timeframe, source)` → OHLCV list
  - `get_realtime_price(symbol, source)` → current price float
  - `PROVIDERS` dict mapping source name → provider config

### Frontend (`static/` + `templates/`)
- `templates/index.html` — Single-page app shell; contains the chart-count selector and grid container.
- `static/js/dashboard.js` — Orchestrates chart panes: reads/writes `localStorage` for chart count and per-pane symbol/timeframe selections, builds the grid, and manages WebSocket subscriptions.
- `static/js/chart.js` — Wrapper around `LightweightCharts.createChart`; each pane is an instance. Handles candlestick data, the colour-coded ticker bar (flashes green/red on price change), and symbol/timeframe dropdowns.
- `static/css/grid.css` — Responsive grid layouts for 1/2/4/6/8 panes using CSS Grid. No framework.

### Grid layouts (CSS classes)
| Count | Class | Layout |
|-------|-------|--------|
| 1 | `grid-1` | Full screen |
| 2 | `grid-2` | 2 columns |
| 4 | `grid-4` | 2×2 |
| 6 | `grid-6` | 3×2 |
| 8 | `grid-8` | 4×2 |

### Data flow
1. Browser requests historical OHLCV via `GET /api/history?symbol=&timeframe=&source=`.
2. Browser subscribes to live ticks via Socket.IO; backend relays Hyperliquid WS messages and yfinance polling to the correct room.
3. Each chart pane independently holds its own symbol/timeframe state; changes trigger a new `/api/history` fetch + re-subscribe.

## Key Conventions
- All symbol/timeframe state is per-pane and stored in `localStorage` as a JSON array indexed by pane position.
- Chart count preference is stored in `localStorage` under `chartCount`.
- To add a new data source: edit only `data_source.py`; no changes to `app.py` or frontend JS are needed beyond adding the source name to the dropdown options in `index.html`.
