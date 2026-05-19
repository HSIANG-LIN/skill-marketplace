---
name: quant-strategy-engine
description: Workflow for developing modular, multi-factor quantitative scanning engines with built-in rate limiting and strategy pattern support.
---

# quant-strategy-engine

A workflow for developing robust, modular, and rate-limited quantitative scanning engines.

## Core Patterns

### 1. Multi-Strategy Pattern (Strategy Pattern)
Instead of a single filter, use a base class to implement multiple trading styles (e.g., Breakout, Trend, Mean Reversion).

**Implementation Structure:**
- `BaseStrategy` (ABC): Defines `calculate_scores(df_market, df_history) -> pd.DataFrame`.
- `StrategyA`, `StrategyB`: Implement specific scoring logic.
- `Engine`/`Scanner`: Orchestrates strategies, uses weighted score merging and `drop_duplicates(subset=['code'], keep='first')` on sorted scores to take the highest-scoring match.

### 1b. Parallel Data Sources (Non-API Data)

When your primary API (e.g., FinMind) lacks the dataset you need, add a **parallel data fetcher** that uses a completely different backend (e.g., TWSE official JSON API, web scraping):

**Pattern:**
- Create a standalone fetcher module (e.g., `data_twse.py`) that uses raw `requests.get()` calls
- Add a new DB table for the external dataset (e.g., `institutional_flows` with PK `(code, date)`)
- The strategy fetches its own data from the DB in `calculate_scores()` — it's NOT provided via `df_history`
- Cache aggressively: fetch last N trading days, store in SQLite, only re-fetch when date is missing

**TWSE Institutional API Example:**
```python
# TWSE 三大法人買賣超 endpoint
url = f"https://www.twse.com.tw/fund/T86?response=json&date={yyyymmdd}&selectType=ALL"
resp = requests.get(url)
resp.raise_for_status()
data = resp.json()
# data['data'] is a list of [code, name, foreign_buy, foreign_sell, ..., total_net]
```

**Cross-source enrichment:** When the strategy needs prices (from primary API) but its core data comes from the external source, query both DB tables and join in-memory. Display prices are a nice-to-have; never let a price fetch failure block the strategy.

**🔥 Performance optimization — skip expensive primary API fetch:**  
If the strategy's core analysis relies entirely on the external data source (e.g., TWSE institutional data) and only uses primary API data for cosmetic display (prices), **do NOT call the primary API's full-market batch fetch** (`get_daily_history(days=40)`). Instead, read prices directly from the SQLite cache — even if some prices are missing, display will still work for most stocks:

```python
# Fast path: skip FinMind batch, read prices from cache directly
history = provider.db.get_all_prices(
    start_date=(today - timedelta(days=2)).strftime('%Y-%m-%d'),
)
if not history.empty:
    history = history[['code', 'date', 'close', 'volume']]
```
This reduces execution time from 60-90s to ~2s.

**Discord 2000-char limit — Message Truncation:**
Messages over 2000 characters are rejected by Discord API with `BASE_TYPE_MAX_LENGTH`. Add truncation logic:
```python
if len(msg) > 1900:
    # Keep header + footer, trim the stock list to fit budget
    # Append "… 尚有 N 檔未顯示" at the end of the trimmed list
```

### 2. Local Caching Layer (SQLite)
Never re-fetch historical data on every run. Use a local SQLite cache to store stock info and daily prices.

**Schema Design:**
- `stock_info(code PK, name, industry, updated_at)` — stock metadata, refresh weekly
- `stock_prices(code PK, date PK, open, high, low, close, volume, trade_value)` — daily OHLCV
- `scan_history(id PK, scan_date, strategy, code, score, reasons, created_at)` — scan result audit trail

**Cache Flow:**
1. On `get_market_info()`: check cache age → if >1 day old, refresh from API
2. On `get_daily_history()`: check which dates are missing for each stock → only fetch gaps
3. `refresh_cache()`: one-time full population; subsequent runs are instant

**Incremental Update Strategy:**
- Determine what date range is needed (e.g., last 40 trading days)
- Query `SELECT DISTINCT date FROM stock_prices WHERE code = ?` for cached dates
- Only fetch codes that have missing dates in the range
- After first full cache build, incremental daily fetches take seconds

### 3. Strategy Registration (Decorator Pattern)
Use a decorator + registry to auto-discover strategies without manual registration:

```python
STRATEGY_REGISTRY = {}  # module-level dict

def register_strategy(name, weight=1.0):
    def decorator(cls):
        STRATEGY_REGISTRY[name] = {'class': cls, 'weight': weight}
        return cls
    return decorator

# In engine: force-import all strategy modules to trigger decorators
import strategies.trend
import strategies.mean_reversion
import strategies.volume_breakout
```

### 4. Rate Limiting

Two proven patterns for third-party API rate limiting. Choose based on your API's throttle model:

#### Pattern A: Sliding Window (deque-based)

Best for APIs with a hard cap (e.g., "max 20 requests per minute") — tracks precise timestamps.

**Implementation logic:**
- Maintain a `deque` of timestamps of the last `N` calls.
- Before each call, `popleft()` timestamps older than the `period`.
- If `len(deque) >= N`, calculate `sleep_time = deque[0] + period - now` and `time.sleep(sleep_time)`.
- Integrate this into the `DataProvider` class to make it "Zero-Config".

#### Pattern B: Token Bucket

Best for APIs with a soft hourly cap + burst allowance (e.g., "600 requests/hour"). Allows bursts then enforces steady-state refill.

```python
import time
import threading

class RateLimiter:
    """Token bucket rate limiter. Thread-safe, burst-friendly."""

    def __init__(self, max_tokens=600, refill_per_sec=600/3600):
        self._max = max_tokens
        self._rate = refill_per_sec           # tokens/second
        self._tokens = max_tokens
        self._last_refill = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._tokens = min(self._max, self._tokens + elapsed * self._rate)
        self._last_refill = now

    def acquire(self):
        """Block until a token is available, then consume one."""
        while True:
            with self._lock:
                self._refill()
                if self._tokens >= 1:
                    self._tokens -= 1
                    return
                deficit = 1 - self._tokens
                sleep_secs = deficit / self._rate
            time.sleep(min(sleep_secs, 1))  # wake every 1s to avoid drift
```

**Integration into DataProvider:**

```python
_limiter = RateLimiter()  # module-level singleton — shared across instances

class DataProvider:
    def _rate_limited_call(self, fn, *args, **kwargs):
        _limiter.acquire()
        return fn(*args, **kwargs)
```

Then wrap every FinMind API call:
```python
df = self._rate_limited_call(self.loader.taiwan_stock_daily,
                             stock_id_list=batch, ...)
```

This ensures the rate is never exceeded regardless of how many scans are run. The burst allowance (max_tokens) means a full scan's worth of calls completes instantly if the quota hasn't been touched recently.

**Trade-offs:**
- Sliding window: more precise for hard minute-level caps; wastes no burst capacity.
- Token bucket: simpler and more appropriate for hourly limits; naturally supports bursts.

**⚠️ CRITICAL: FinMind `use_async=True` does NOT count as 1 call — it's N parallel HTTP requests.** Despite the name suggesting a single async request, FinMind's `_get_data_with_async` internally creates ONE HTTP request per stock code in the `stock_id_list`, then fires them all concurrently via `async_request_get()`. A batch of 100 stocks = 100 concurrent HTTP GET requests. The free tier's 600 requests/hour limit is exhausted after ~6 batches (600 stocks), and subsequent calls return HTTP 402 (`"Requests reach the upper limit."`) without a `data` key, causing a silent `KeyError: 'data'` in the wrapper.

**Preferred approach for TW stock data:** Use `yfinance` as the primary source for daily prices. The implementation pattern (tested on ~2300 Taiwan stocks) is:

```python
import yfinance as yf
import time

YFINANCE_BATCH_SIZE = 100      # batch size to avoid Yahoo rate limiting
YFINANCE_BATCH_DELAY = 5        # seconds between batches

def _fetch_yfinance_batch(codes_batch, period="5d", suffix="TW"):
    """Batch download via yfinance. Returns DataFrame with [code, date, open, high, low, close, volume]."""
    if not codes_batch:
        return pd.DataFrame()
    
    # Silence yfinance's noisy ERROR logs
    logging.getLogger('yfinance').handlers.clear()
    logging.getLogger('yfinance').setLevel(logging.CRITICAL + 10)
    
    tickers = [f"{c}.{suffix}" for c in codes_batch]
    try:
        df = yf.download(tickers, period=period, group_by="ticker",
                          threads=True, timeout=15, progress=False)
    except Exception:
        return pd.DataFrame()
    
    if df is None or df.empty:
        return pd.DataFrame()
    
    rows = []
    for ticker in tickers:
        code = ticker.replace(f".{suffix}", "")
        try:
            ticker_df = df[ticker]
            if ticker_df is None or ticker_df['Close'].isna().all():
                continue
            ticker_df = ticker_df.reset_index()
            for _, row in ticker_df.iterrows():
                if pd.isna(row['Close']):
                    continue
                rows.append({
                    'code': code, 'date': row['Date'].strftime('%Y-%m-%d'),
                    'open': row.get('Open'), 'high': row.get('High'),
                    'low': row.get('Low'), 'close': row['Close'],
                    'volume': row.get('Volume', 0),
                })
        except (KeyError, TypeError):
            continue
    return pd.DataFrame(rows)
```

**Hybrid 3-phase fetch strategy:**

```
Phase 1: `.TW` suffix for all valid codes (100/batch, 5s delay between batches)
Phase 2: `.TWO` suffix for stocks where .TW returned no data (OTC stocks)
Phase 3: FinMind fallback for stocks neither .TW nor .TWO could serve
```

Empirical benchmark (2296 Taiwan stocks, 2026-05-04):
- Phase 1 (.TW): ~3100 records in ~2.5 min (23 batches × ~7s each = ~160s + batch delays)
- Phase 2 (.TWO): ~340 records in ~45s (4 batches + delays)
- Phase 3 (FinMind): Typically 0 hits — FinMind and Yahoo have overlapping coverage
- Final 5/4 coverage: ~1670/2296 stocks (73%), up from ~572 with FinMind-only (25%)

**Taiwan Stock Yahoo Finance ticker conventions:**
- TWSE (上市, listed exchange): `{code}.TW` — e.g., `2330.TW`
- OTC (上櫃, over-the-counter): `{code}.TWO` — e.g., `6187.TWO`
- There is no reliable way to determine TWSE vs OTC from the stock code prefix alone
- Strategy: try `.TW` first for all, then retry `.TWO` for failures
- `yf.download()` handles mixed `.TW` + `.TWO` tickers in a single call gracefully

**Yahoo Finance rate limit handling:**
- Yahoo will return `YFRateLimitError('Too Many Requests. Rate limited.')` when client hits their threshold
- 5 seconds between batches of 100 is sufficient to avoid this in practice
- If rate limited, the batch returns empty for that subset; retry with longer delay or smaller batch
- yfinance also has a "crumb" authentication system that may return 401 errors after many requests — this is the same rate limit manifesting differently

**FinMind rate-limit detection (402 error):**
```python
# In _fetch_batch_prices, check for FinMind's rate limit response
if not isinstance(data, list) or not data:
    if isinstance(data, dict) and data.get('status') == 402:
        self.logger.error(f"FinMind rate limited (402): {data.get('msg', '')}")
        self._finmind_rate_limited = True
    return pd.DataFrame()
```
Set `self._finmind_rate_limited = True` on detection, then skip subsequent FinMind calls in the same session (e.g., in `get_daily_history()`):
```python
if self._finmind_rate_limited:
    self.logger.info("FinMind 已達限額，從 SQLite 讀取既有資料")
    return self.db.get_all_prices(start_date=..., end_date=...)[['code','date','close','volume']]
```

The `_finmind_rate_limited` flag is initialized to `False` in `__init__` and persists for the lifecycle of that DataProvider instance. It does NOT reset within a session — once triggered, no more FinMind calls will be made until a new DataProvider is constructed.

See `references/yfinance-tw-stock-pattern.md` in this skill for the complete production-tested fetch_latest_data() implementation.

Only use FinMind async batch when you have a paid tier that supports higher limits, or for one-time historical backfill (60+ days) where the rate limit resets between runs.

### 5. Notification Delivery
Separate the notification layer from the scanning logic for clean architecture.

**Pattern:**
- `Notifier` base class with `send(content) -> bool`
- Platform implementations: `DiscordNotifier`, `TelegramNotifier` (optional)
- Credentials from environment variables (never hardcode tokens)
- Integrate at the `main.py` level, not inside strategy logic

**Discord-only delivery (recommended):**
```python
import os, requests
token = os.environ['DISCORD_BOT_TOKEN']
channel_id = os.environ['DISCORD_CHANNEL_ID'] 
url = f'https://discord.com/api/v10/channels/{channel_id}/messages'
headers = {'Authorization': f'Bot {token}', 'Content-Type': 'application/json'}
requests.post(url, headers=headers, json={'content': message})
```

**Common pitfall:** `DISCORD_CHANNEL_ID` is often mistakenly set to the server/guild ID instead of a text channel ID. Verify with `GET /api/v10/guilds/{guild_id}/channels` to list all channels.

**Cron `deliver` setting to avoid Telegram+Dicord duplication:**
The Hermes cron job has a `deliver` field. If set to `"origin"`, the cron's raw script output is sent to wherever the job was created (possibly Telegram). If the script already sends to Discord internally via `Notifier`, this creates duplicate delivery: Discord from code + Telegram from cron. **Fix: set `deliver: "local"`** so cron output stays local and only the code's Discord notifier fires.

```bash
# Correct cron config: local delivery (no Telegram), code handles Discord
schedule: "0 14 * * 1-5"     # 14:00 weekdays
deliver: "local"
```

### 6. Data Quality: Filter Out Bad Price Data at Engine Level

**Problem:** Strategies like `mean_reversion` can flag stocks with `close=0` as "extreme oversold reversal candidates" — RSI drops to 0 because recent prices are all 0, volume is 0 (passing "volume contraction" checks), and price is 0 (passing "below MA" checks). This produces scan results with price=0, misleading signals.

**Root causes:**
- Halted/delisted stocks (DR stocks like 巨騰-DR 9136, ETNs like 01004T) whose last recorded close in the DB is 0
- FinMind returning `close=0` for non-trading days or halted stocks
- DB cache gaps where `ON CONFLICT DO UPDATE` preserved a 0 value

**Fix:** Filter at the engine level (`run_all()` in `engine.py`) BEFORE passing data to any strategy — removes ALL price=0 stocks in one place rather than fixing each strategy individually:

```python
# In engine.py run_all(), after df_history = df_history.dropna(...)
latest_close = df_history.groupby('code')['close'].last()
valid_stocks = latest_close[latest_close > 0].index
dropped = len(latest_close) - len(valid_stocks)
if dropped:
    logger.info(f"過濾 {dropped} 檔最新收盤價=0 的股票")
df_history = df_history[df_history['code'].isin(valid_stocks)]
```

This is the single point of defense. Don't add price=0 checks in each individual strategy — fix it once in the orchestration layer.

**Related note for institutional strategy:** The existing `per-stock latest price from DB` pattern (see Pitfalls section) handles a different case — missing data rather than zero data. Both guards are needed.

### 7. CLI Routing Verification

**Problem:** A `main.py` with `argparse` can have modes that initialize all services but silently do nothing because the mode routing (`if args.mode == 'x'`) is missing. This happened with `scan` mode — all services initialized, no error, but no scan ran.

**Checklist when adding/modifying CLI modes:**
1. Ensure `args.mode` choices list includes the mode name
2. Add an `elif args.mode == 'my_mode':` branch in the routing section
3. Test the mode directly (`python main.py my_mode`) — not just via `all` or another composite mode
4. For composite modes (e.g., `all` that calls `scan` internally), test BOTH the composite AND the standalone mode

**Debug tip:** When a scan produces no output beyond initialization, the most likely cause is a missing route in `main()`. Check `if/elif` routing before looking deeper.

### 8. Automated Scheduling (Cron)
For daily automated scans, use Hermes's cronjob tool or system cron.

**Suggested schedule:** Weekdays 14:00-16:00. Earlier is possible with yfinance (unlike FinMind which doesn't publish until ~16:00), so 14:00 is now viable.

**Empirical data on FinMind publication timing:** At 15:00 (90 min after 13:30 close), FinMind still has NOT published today's data for the vast majority of stocks. In a real-world test (2026-05-04 Monday, scan at 15:02): only 800/1952 stocks had today's data from the initial batch fetch; after retry with smaller batches, 1789/1952 STILL lacked 2026-05-04 data. The scan silently used yesterday's close prices for 1789 stocks, producing misleading results (stale prices, 0% change, incorrect scan rankings).

**yfinance availability:** Yahoo Finance publishes Taiwan stock data within 60-90 minutes after market close (13:30). By 14:00, data is reliably available. This makes 14:00 a safe cron schedule with yfinance as the primary source, whereas 16:00 was necessary with FinMind.

**Self-contained workflow:**
1. Refresh cache (yfinance batch download for latest data)
2. Run all strategies
3. Send formatted results to Discord (via code's Notifier)
4. Export data to JSON, push to GitHub (for Streamlit dashboard)
5. Set `deliver: local` so cron output stays local — Discord notification is handled by the script

**Example scan_and_push.sh:**
```bash
#!/bin/bash
set -e
PROJECT_DIR="/home/simon_dou/workspace/hermes_project/stock_scanner"
cd "$PROJECT_DIR"
source "venv/bin/activate"
echo "[1/4] 執行每日盤後掃描 (掃描 + 法人買賣超 TOP 20)..."
python src/main.py daily 2>&1 | tee -a "$LOG_FILE"
echo "[2/4] 匯出儀表板資料..."
python src/export_data.py 2>&1 | tee -a "$LOG_FILE"
echo "[3/4] 推送至 GitHub..."
git add data_output/ src/export_data.py app.py
git commit -m "daily scan $(date '+%Y-%m-%d %H:%M')"
git push origin main
echo "[4/4] ✅ 完成"
```

### 8a. Full DB Clean Reset Workflow

When switching data sources or fixing corrupted data, a clean DB reset is needed:

```bash
# 1. Backup current DB
cp data/scanner.db data/scanner_backup_$(date +%Y%m%d_%H%M%S).db

# 2. Clear stock_prices table (keep stock_info, scan_results)
python3 -c "import sqlite3; c=sqlite3.connect('data/scanner.db').cursor(); c.execute('DELETE FROM stock_prices'); c.connection.commit()"

# 3. Re-fetch from scratch (uses yfinance primary, FinMind fallback)
python3 -c "
import sys; sys.path.insert(0, 'src')
from data_provider import DataProvider
from database import StockDatabase
provider = DataProvider(db=StockDatabase())
provider.fetch_latest_data(lookback_days=5)
"
```

**⚠️ Coverage caveat after clean reset:** `yfinance` with `period="5d"` only covers the **last 5 trading days**. Older dates that were previously cached (e.g., 60 days of history) will be gone after a clean reset. To restore full history, run `refresh_cache(days=90)` via FinMind *before* any scan that needs historical data (like 30-day MA strategies).

A convenience script at `scripts/reset_stock_prices.py` automates the backup + clear steps. Invoke it before a full re-fetch.

Script also available inside the skill at `scripts/reset_stock_prices.py` — copy it to the project directory.

### 8b. ⚠️ CRITICAL: Pre-Scan Cache Refresh for Latest Trading Day

**Problem — stale data mislabeled as current:** If the scan runs before the API has published today's data, the cache contains yesterday's close prices. The scan silently uses yesterday's prices but labels the result with `scan_date = today`. The user sees prices like "143.0" when the actual today's close is "134.5" — a 6% discrepancy that erodes trust.

**Root cause:** The cache's incremental fetch logic (`get_daily_history()`) only triggers a fetch when dates are missing. But if the API returns empty for today (data not published yet), the cache stays at yesterday's data. The subsequent scan has no way to know the data is stale.

**Fix — explicit pre-scan fetch with a dedicated method:**

```python
class DataProvider:
    def fetch_latest_data(self, lookback_days=3):
        """Targeted fetch: pull the latest N trading days into cache.
        
        Unlike refresh_cache() which does a full market pull, 
        this only fetches dates missing from cache within the lookback window.
        Safe to call every scan — no-op if data is already cached.
        """
        date_range, start_date, end_date = self._gen_date_range(days=lookback_days)
        cached_dates = self.db.get_all_cached_dates()
        missing = date_range - cached_dates
        if not missing:
            return
        market_info = self.get_market_info()
        stock_list = market_info['code'].tolist()
        self._fetch_and_cache_batches(stock_list, date_range, start_date, end_date)
```

Then call it in the scan function **before** fetching history:

```python
def mode_scan(...):
    # Step 0: Ensure latest trading day data is in cache
    provider.fetch_latest_data(lookback_days=3)
    
    market_info = provider.get_market_info()
    history = provider.get_daily_history(days=30)
    result = engine.run_all(history, market_info)
```

**Cron timing synergy:** With yfinance as primary source, 14:00 is safe. With FinMind-only, wait until 16:00.

**Pitfall — `python main.py all` does NOT export dashboard data:** The `all` mode runs sector → scan → cache cleanup, but skips `export_data.py`. The dashboard JSON files in `data_output/` are only updated when `python src/export_data.py` is explicitly called (as done by `scan_and_push.sh`). After running `all --no-send` manually, always run `export_data.py` + `git push` separately if the dashboard should reflect the latest scan.

**Pitfall — weekend/holiday wasted fetch:** `fetch_latest_data` will try to fetch non-trading days (weekends, holidays). The batched FinMind API call covers the full range in one request per batch, so wasted quota is minimal (1 batch × N batches = N requests for the entire window). Still, this is acceptable — the alternative (missing today's data) is far worse.

### 9. Institutional Top 20 Report (Consuming Cached Data for Ranked Reports)

**Problem:** Your database already has institutional flow data (from `data_twse.py` → `institutional_flows` table), but the existing `institutional_accumulation` strategy looks for *consecutive buying over multiple days*. The user wants the daily Top 20 buy/sell rankings — a different report, not a strategy.

**Solution:** Create a standalone **report mode** that:
1. Fetches latest institutional data (if missing from cache)
2. Queries the `institutional_flows` table for the latest date
3. Ranks stocks by net buy/sell per category
4. Formats as a compact Discord message (split into 2 messages if needed for 2000-char limit)

```python
def mode_institutional_top20(config, notifier, provider, db):
    """三大法人買賣超 TOP 20 排行 — from cache, ranked by net buy/sell."""
    from data_twse import fetch_institutional_flows_batch
    
    # Step 1: Ensure latest data is cached
    saved = fetch_institutional_flows_batch(db, days=3)
    
    # Step 2: Find latest date with data
    with db._get_conn() as conn:
        latest = conn.execute(
            "SELECT MAX(date) as max_date FROM institutional_flows"
        ).fetchone()
        if not latest or not latest["max_date"]:
            notifier.send_message("📭 尚無三大法人資料")
            return False
        latest_date = latest["max_date"]

    # Step 3: Query with stock names
    with db._get_conn() as conn:
        rows = conn.execute("""
            SELECT f.*, COALESCE(i.name, f.code) as stock_name
            FROM institutional_flows f
            LEFT JOIN stock_info i ON f.code = i.code
            WHERE f.date = ?
        """, (latest_date,)).fetchall()
        records = [dict(r) for r in rows]

    # Step 4: Rank by net buy/sell for each category
    def fmt_val_part(v):  # Compact Taiwan units: 萬張/張/股
        shares = abs(v)
        if shares >= 10_000_000:   return f"{shares / 1_000_000:.1f}萬張"
        elif shares >= 10_000:     return f"{shares // 1_000:,}張"
        else:                      return f"{shares:,}股"

    def build_section(records, field, label, icon, top_n=20):
        buys = sorted(records, key=lambda r: r[field], reverse=True)[:top_n]
        sells = sorted(records, key=lambda r: r[field])[:top_n]
        lines = [f"{icon} **{label} TOP {top_n}**", ""]
        lines.append("📗 **買超**")
        for i, r in enumerate(buys, 1):
            sign = "+" if r[field] >= 0 else ""
            lines.append(f"  {i}. {r['code']} {r['stock_name']}  {sign}{fmt_val_part(r[field])}")
        lines.append("")
        lines.append("📕 **賣超**")
        for i, r in enumerate(sells, 1):
            lines.append(f"  {i}. {r['code']} {r['stock_name']}  -{fmt_val_part(r[field])}")
        lines.append("")
        return "\n".join(lines)

    # Step 5: Build messages, split to stay under 2000 char Discord limit
    msg_total = build_section(records, "total_net", "三大法人合計", "📊", 20)
    msg_foreign = build_section(records, "foreign_net", "外資", "🏦", 20)
    msg_trust = build_section(records, "trust_net", "投信", "🤝", 15)
    msg_dealer = build_section(records, "dealer_net", "自營商", "🏪", 15)
    
    notifier.send_message(msg_total + msg_foreign)  # Message 1
    notifier.send_message(msg_trust + msg_dealer +  # Message 2
        "\n_資料來源: TWSE 三大法人買賣超日報表_")
```

**Key design decisions:**
- Not a strategy — it's a standalone report mode in `main.py`, not a strategy module
- Never blocks on price data — the report only uses institutional_flows + stock_info
- Compact formatting uses 萬張/張/股 to save characters
- Split into 2 messages (4 categories × buy+sell = 8 sections doesn't fit in 2000 chars)
- LEFT JOIN stock_info for names, COALESCE to code if name missing

**CLI integration:**
```python
# In parser.add_argument choices:
choices=[..., 'top20', 'daily', ...]

# In routing:
elif args.mode == 'top20':
    mode_institutional_top20(config, notifier, provider, db)
```

### 10. Composite CLI Modes (Combining/Aliasing Multiple Sub-Modes)

**Problem:** You have several focused sub-modes (`scan`, `top20`, `sector`, `institutional`) but the daily cron job only needs a specific subset. You want to create a composite mode without duplicating logic.

**Pattern:** Create a new CLI mode in `main.py` that calls multiple existing modes in sequence, skipping the ones you don't need:

```python
elif args.mode == 'daily':
    logger.info("=== 每日盤後流程 (掃描 + 法人買賣超排行) ===")
    logger.info("Step 1/3: 多策略強勢股掃描")
    mode_scan(config, notifier, provider, engine)

    logger.info("Step 2/3: 三大法人買賣超 TOP 20 排行")
    mode_institutional_top20(config, notifier, provider, db)

    logger.info("Step 3/3: 清理舊快取")
    retention = config.get('cache', {}).get('price_retention_days', 90)
    db.purge_old_scans(keep_days=retention)

    logger.info("✅ 每日盤後流程完成")
```

**Benefits over modifying `all`:**
- `all` remains unchanged for manual use
- `daily` is a focused cron-tailored subset
- Easy to add/remove steps without touching existing modes

**Update the cron script to use the new mode:**
```bash
# Before: ran all (included sector heatmap)
python src/main.py all

# After: runs scan + top20 (no sector)
python src/main.py daily
```

**Alternative: flags on existing mode.** If you prefer not to add a new mode, add a flag:
```python
parser.add_argument('--no-sector', action='store_true')
# Then in `all` mode:
if not args.no_sector:
    mode_sector(...)
```

**Pitfall — composite mode shares the same engine/notifier instance:** Since all steps use the same `engine` and `notifier` objects (initialized once in `main()`), state carries over between steps. This is usually fine, but be aware that:
- The scan step may log strategy results that feel redundant when the next step runs
- Calling `db.purge_old_scans()` too early could remove data the next step needs — keep it as the last step

### 11. Recommendation Engine (Meta-Analysis Layer on Top of Strategy Engine)

**Pattern reference:** `references/recommendation-engine-pattern.md` — full specification with scoring model, implementation pattern, and formatting.

The recommendation engine is a higher-level consumer that reads from the same SQLite cache (stock_prices, scan_history, institutional_flows) and produces **ranked buy/sell recommendations with entry/exit prices**. It is NOT a strategy — strategies produce signals per-strategy; the recommendation engine merges all signals + own technical analysis into a single composite score.

**When to build one:** After you have a working strategy engine (strategies producing `scan_history`) and institutional flow data (`institutional_flows` table). The recommendation engine turns "here are N stocks with strategy scores" into "here are the top 20 stocks worth buying, with reasons and target prices."

**Core pattern — 4-Pillar Scoring:**
- Technical Analysis (40%) — RSI, MA position, support/resistance, volume ratio
- Strategy Signals (30%) — highest strategy score, multi-strategy count
- Institutional Flow (20%) — net buy/sell, consecutive buying streak
- Momentum (10%) — N-day return, consecutive up days

### 12. Resilient Testing Workflow
When working with unreliable third-party APIs (e.g., FinMind returning `KeyError: 'data'`):
- **Do not** rely on live data for logic verification.
- **Create a `test_logic_only.py` script** that generates high-fidelity dummy data (e.g., synthetic price/volume trends) to verify scoring, ranking, and rate-limiting logic independently of API stability.

## Pitfalls
- **File corruption from read_file → write_file roundtrip:** When a file is read with `read_file(path)` and then written back via `write_file(path, content=...)`, the `read_file` output includes a `"content"` field that already has the raw file bytes. However, if you read the file via the terminal tool (`cat`, `head`) and then pass that to `write_file`, the line numbers and prefixes (e.g., `     1|""")` are included in the content, corrupting the file. **Fix:** Always use `read_file` for code files (which returns raw content in `content` field, not augmented text), and never reconstruct a file from terminal output. If a file becomes corrupted, immediately `git checkout -- path` to restore.
- **`[truncated]` placeholder poison in AI-generated code**: When an AI assistant truncates long code output and literally writes `[truncated]` (or other placeholder markers like `...`) into raw source files, it causes runtime errors — e.g., `sqlite3.OperationalError: near ".": syntax error` or `near "CREATE": syntax error`. **Prevention:** Whenever inheriting or reviewing AI-generated SQL schemas, search the entire file for literal truncation markers like `[truncated]`, `...`, `[remainder]` using `grep -n "\[truncated\]"` or `search_files`. Also verify that all SQL CREATE TABLE statements are properly terminated with `);`. **Fix:** The most common symptom is an unterminated `CREATE TABLE` — check that every table definition has a complete closing `)` and `;`. The `[truncated]` often replaces the PRIMARY KEY line or closing parenthesis.
- **Merging Results**: When merging multiple strategies, always sort by `score` descending before `drop_duplicates` to ensure you keep the most "confident" signal for a given symbol.
- **Duplicate saves from redundant execution flow**: When a "run all" function executes every strategy, but the same flow also calls a separate "run single" function for a specific strategy (e.g., `mode_all` → `mode_scan` (contains institutional_accumulation) → `mode_institutional` (runs institutional_accumulation again)), the same data is saved twice and sent as duplicate notifications. **Fix:** Remove the redundant call. Either (a) inline the strategy into "run all" and drop the standalone call, or (b) remove the strategy from "run all" and keep only the standalone call. Use a DB UNIQUE INDEX on `(scan_date, strategy, code)` as a safety net — and make `save_scan_results` use `ON CONFLICT DO UPDATE` so repeated saves update rather than insert duplicates.

- **Duplicate DB saves from dual combined + per-strategy writes**: When saving scan results, do NOT save both `combined` (merged) AND `per-strategy` results separately — stocks in the combined list are already tagged with their strategy name. Saving both creates 2× duplicates per stock. **Fix:** Only save one set. Either save per-strategy results individually (and skip the combined save), or save the combined results only (and drop the per-strategy loop). The combined save is sufficient for reporting; per-strategy saves are only needed if you want strategy-level querying.
- **Institutional strategy showing 0 for price**: When the institutional fast path reads prices only from `df_history["date"].max()` (a single common date), stocks that weren't traded on that specific date show price=0. This is exacerbated when the upstream API is rate-limited or returns empty, making `df_history` sparse.
  
  **Robust fix — per-stock latest price from DB:**
  ```python
  # Query the latest close per stock directly from cache
  # Uses GROUP BY code + MAX(date) for per-stock accuracy
  import sqlite3
  sdb = sqlite3.connect("data/scanner.db")
  sdb.row_factory = sqlite3.Row
  price_rows = sdb.execute(
      "SELECT code, MAX(date) as latest_date FROM stock_prices "
      "WHERE close > 0 GROUP BY code"
  ).fetchall()
  price_lookup = {}
  for pr in price_rows:
      row = sdb.execute(
          "SELECT close, volume FROM stock_prices WHERE code=? AND date=?",
          (pr["code"], pr["latest_date"])
      ).fetchone()
      if row:
          price_lookup[pr["code"]] = {"price": row["close"], "volume": row["volume"]}
  ```
  
  **Also filter input codes** to only stocks with cached prices:
  ```python
  price_code_set = set(r["code"] for r in price_rows)
  filtered_codes = [c for c in all_codes if c in price_code_set]
  ```
  This prevents the strategy from analyzing thousands of codes (e.g., ETFs, delisted stocks) that have institutional flow data but no cached prices, reducing the strategy loop from 27K+ codes to only those with available price data.
- **Timezone/Date alignment**: Ensure dummy data `dates` align with the `latest_date` logic in the scanner.
- **Rate Limiter Thread Safety**: Use `threading.Lock` if the DataProvider is used in a multi-threaded environment.
- **`@register_strategy` gotcha**: The decorator requires a string argument — `@register_strategy("trend")` NOT `@register_strategy`. Without the argument, Python passes the class itself as `name`, silently breaking registration. The engine will log "Unknown strategy '...' in config, skipping".
- **Scoring gradient**: When designing a new strategy, ensure scores have meaningful variance (not all 100). If `consecutive_days * 20 = base_score`, cap the base and add conditional bonuses (trend_quality, magnitude, synergy) so stocks with stronger signals clearly outrank weaker ones.
- **Data source independence**: Strategies that use external data (not from `df_history`) should gracefully degrade when that data is unavailable — return an empty DataFrame instead of crashing.
- **yfinance log suppression**: Using `logging.getLogger('yfinance').setLevel(logging.WARNING)` is insufficient because yfinance creates log handlers at child loggers. Use `handlers.clear()` + `setLevel(logging.CRITICAL + 10)` for complete suppression.

### Subagent Output Verification (Integration Quality Gate)

When delegating strategy development to a subagent, **always verify these integration points before accepting the output** — subagents frequently write correct standalone code but miss the integration hooks:

1. **Correct file placement** — Verify the subagent modified the *right module*, not a copy or wrong file. A `health_check` function with `self` parameter placed in a module with no class is a red flag.

2. **Correct import paths** — Subagents often use absolute paths (`from src.database import X`) when the project uses module-relative (`from database import X`). Check imports resolve by running `python -c "from file import function"` from the project root.

3. **No orphaned code** — When a subagent re-indents or restructures a function, leftover lines from the original indent level often remain in the file. After patching, read the full file from the patched line onward and check for orphaned `return`, indented statements, or trailing docstrings that lost their `def`.

4. **Strategy registration completeness** — New strategies need THREE integration points:
   - The strategy file itself (decorated with `@register_strategy`)
   - An import in `engine.py` (force-import stanza: `import strategies.new_strategy  # noqa: F401`)
   - Any CLI dispatch in `main.py` if the strategy has a special mode

5. **One-shot verification** — After all subagent work, run `python main.py --help` to confirm CLI loads without errors, then run the specific strategy mode (e.g., `--test`) to confirm strategy loads and produces output.
