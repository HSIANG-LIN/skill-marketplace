---
name: tw-intraday-monitor
description: "Build TWSE intraday monitoring system — real-time stock alerts using TWSE MIS API (free, no key). Detects price surges, volume spikes, limit moves, and turnaround events during trading hours."
version: 1.0.0
author: Hermes Agent
platforms: [linux]
prerequisites:
  commands: [python3, curl]
metadata:
  hermes:
    tags: [twse, intraday, realtime, stock-monitor, taiwan]
---

# TWSE Intraday Monitor

Build a real-time intraday monitoring system for Taiwan stocks using the TWSE MIS API (free, no API key required).

## Architecture

```
TWSE MIS API (mis.twse.com.tw, free, no auth)
  → twse_realtime.py (fetch snapshots for N stocks)
  → intraday_state.py (SQLite: snapshots + events)
  → intraday_monitor.py (watchlist + event detection + alert formatting)
  → Telegram / Discord push
```

## Files to Create

### 1. `src/twse_realtime.py` — TWSE Real-time Quote Fetcher

Key API endpoint: `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=<codes>`

Codes format: `tse_2330.tw` (listed) or `otc_6147.tw` (OTC). Batch up to ~100 stocks with `|` separator.

Key response fields:
- `c`: stock code
- `n`: stock name
- `z`: current price (cumulative weighted average, `-` if no trades)
- `tv`: total volume (shares)
- `h`/`l`/`o`: daily high/low/open
- `y`: yesterday's close
- `t`: last trade time
- `d`: date (YYYYMMDD)
- `b`/`a`: bid/ask prices (underscore-separated levels)

Create a `RealtimeSnapshot` dataclass with:
- `code`, `name`, `date`, `time`, `price`, `open_price`, `high`, `low`, `prev_close`, `total_volume`, `bid`, `ask`
- Properties: `is_trading`, `change_pct`, `is_limit_up`, `is_limit_down`

Implement `fetch_snapshots(codes: list[str]) -> dict[str, RealtimeSnapshot]`:
- Auto-retry OTC for codes not found in TSE
- Parse `-` as None for price fields

### 2. `src/intraday_state.py` — SQLite State Management

Tables:
- `intraday_snapshots`: code, scan_time, date, trade_time, price, open_price, high, low, prev_close, total_volume, bid, ask, change_pct
- `intraday_events`: code, date, event_type, severity, price, change_pct, volume, message, details (JSON), created_at

Key methods:
- `save_snapshot` / `save_batch` — store snapshots
- `get_latest_snapshot` / `get_previous_snapshot` — for diff comparison
- `log_event` — record detected events
- `has_recent_event(code, event_type, cooldown_minutes)` — cooldown check
- `get_recent_alerts` / `today_stats` — reporting

### 3. `src/intraday_monitor.py` — Main Monitor

**Watchlist composition** (priority order):
1. Config `watchlist_default` (e.g. 2330/2317/2454)
2. Latest `institutional_accumulation` scan results (by score)
3. Latest general scan results (by score)
4. Cap at `watchlist_max` (default 50)

**Event detection** (compare current snapshot vs previous):
- `limit_up` / `limit_down`: price within 9.5% of prev_close
- `price_surge_up` / `price_surge_down`: >3% change between scans (30min cooldown)
- `volume_spike`: today's volume >30% of yesterday's (60min cooldown)
- `turnaround_red2green` / `turnaround_green2red`: sign flip with >2% move (30min cooldown)

**Alert format**: HTML for Telegram (`<b>`, emoji indicators)

### 4. Config (`config/settings.yaml`)

```yaml
intraday:
  enabled: true
  interval_minutes: 30
  trading_start: "09:00"
  trading_end: "13:30"
  watchlist_max: 50
  events:
    price_surge:
      enabled: true
      threshold_pct: 3.0
      cooldown_minutes: 30
    volume_spike:
      enabled: true
      threshold_ratio: 0.3
      cooldown_minutes: 60
    limit_move:
      enabled: true
      cooldown_minutes: 0
    big_turnaround:
      enabled: true
      threshold_pct: 2.0
      cooldown_minutes: 30
  watchlist_default:
    - {code: "2330", name: "台積電"}
    - {code: "2317", name: "鴻海"}
    - {code: "2454", name: "聯發科"}
```

### 5. Cron Job

Schedule: `0,30 9-13 * * 1-5` (every 30 min, Mon-Fri, 09:00-13:30)
Prompt: cd to project, activate venv, run `python src/intraday_monitor.py -v`
Deliver: origin (back to Telegram chat)

## Pitfalls

- TWSE API returns last trading day's data on weekends/holidays — the monitor will still detect events from that day
- OTC stocks need `otc_` prefix instead of `tse_` — auto-retry logic required
- `z` field can be `-` (no trades yet today) — handle as None
- Volume from TWSE is in shares, not 千張
- Import path issues: when running from `src/main.py`, modules are importable without `src.` prefix; when running directly, need `src.` prefix. Use try/except ImportError to handle both.
- `StockDatabase()` logs "Database ready" on every init — change to DEBUG level to reduce noise
- Event cooldown is essential to prevent alert spam during volatile periods