---
name: finmind-api-mappings
description: Workflow and mappings for FinMind API mismatches in the stock_scanner project.
category: software-development
---
# FinMind API Debugging & Mappings

This skill provides the workflow and reference for resolving API mismatches between the `FinMind` library and the `stock_scanner` project.

## Discovery Workflow
When `AttributeError`, `KeyError`, or `ModuleNotFoundError` occurs during data fetching:
1. **Locate Source**: Find the `DataLoader` source in the project's virtual environment (e.g., `.../venv/lib/python3.12/site-packages/FinMind/data/data_loader.py`).
2. **Inspect API**: Use `read_file` to examine method signatures and docstrings in `data_loader.py`.
3. **Verify Columns**: Check the `Dataset` usage in `get_data` calls to identify actual column names.
4. **Patch Wrapper**: Update the `data_provider.py` with correct renames and ensure `try-except` blocks use `logger.debug` (instead of bare `except: continue`) to prevent silent failures.

## Mappings Reference

### Import Mappings
| Expected | FinMind Actual |
| :--- | :--- |
| `from finmind_api import DataLoader` | `from FinMind.data.data_loader import DataLoader` |

### Method Mappings
| Expected | FinMind Actual |
| :--- | :--- |
| `stock_info()` | `taiwan_stock_info()` |
| `stock_daily()` | `taiwan_stock_daily()` |

### Column Mappings: `taiwan_stock_info()`
| Standard Name | FinMind Actual | Notes |
| :--- | :--- | :--- |
| `code` | `stock_id` | Primary key, dedupe by this |
| `name` | `stock_name` | |
| `industry` | `industry_category` | |

### Column Mappings: `taiwan_stock_daily()`
| Standard Name | FinMind Actual | Notes |
| :--- | :--- | :--- |
| `code` | `stock_id` | Must be manually assigned after fetch |
| `date` | `date` | |
| `close` | `close` | |
| `volume` | `Trading_Volume` | Most common failure point |
| `open` | `open` | |
| `high` | `max` | TWSE uses `max` not `high` |
| `low` | `min` | TWSE uses `min` not `low` |
| `trade_value` | `Trading_money` | Optional |
| `spread` | `spread` | Daily spread (price change) |

### Recommended Normalization Function
Always apply column normalization after every FinMind fetch:
```python
FINMIND_COLUMN_MAP = {
    'stock_id': 'code',
    'Trading_Volume': 'volume',
    'Trading_money': 'trade_value',
    'open': 'open',
    'max': 'high',
    'min': 'low',
    'close': 'close',
    'spread': 'spread',
}

def _normalize_finmind_df(df):
    if df is None or df.empty:
        return df
    df = df.copy()
    for old, new in FINMIND_COLUMN_MAP.items():
        if old in df.columns:
            df = df.rename(columns={old: new})
    return df
```

### ⚡ Batch Async API (Critical Performance Optimization)

`taiwan_stock_daily()` supports `stock_id_list` (list of codes) + `use_async=True` for batch fetching.

**Signature:**
```python
loader.taiwan_stock_daily(
    stock_id_list=['2330', '2317', '2454', ...],  # up to ~100 codes
    start_date='2026-03-01',
    end_date='2026-04-27',
    use_async=True              # REQUIRED for batch mode
)
```

**Batch size:** 100 stocks per call. FinMind's async internally fetches each stock in parallel, then returns all results combined. 26 batches cover the full ~2600-stock Taiwan market.

**Performance:**
| Method | Time for 2600 stocks |
| :--- | :--- |
| Stock-by-stock (old) | ~30-60 minutes |
| Batch async (100/batch) | **~30 seconds** |

**Column normalization note for async output:**
- `date` is a normal column (not index)
- `stock_id` column is present in results (unlike single-fetch where you assign it)
- Still need `_normalize_finmind_df()` for standard column names

### ⚠️ Known issue:** When passed industry names instead of stock codes (due to data corruption in marketplace_info), FinMind's async silently includes them in results. Always filter market_info to valid codes before calling batch API.

**Filter fix for non-numeric codes:** `taiwan_stock_info()` returns non-stock entries like `"IronSteel"`, `"TAIEX"`, `"Other"` alongside real numeric codes. The regex filter `r'^(0|7\d{4,})|.*[TP]\d*$'` does NOT catch these. Use a strict numeric-only filter:
```python
mask = df['code'].str.match(r'^\d+$')          # only pure digits
mask &= ~df['code'].str.match(r'^(0|7\d{4,})$') # exclude 0/7-prefix
```
Without this, the batch API wastes calls on invalid stock_ids and returns empty results for those entries.

### 🐛 Async batch silently returning empty for uncached stocks

**Symptom:** Batch progress bars show 100/100 downloads, but `_fetch_batch_prices` returns an empty DataFrame for batches containing stocks not already in the local SQLite cache. The log says `批次抓取完成: 0/N 檔有新資料` despite a valid token.

**Root cause:** The FinMind async batch API (`_get_data_with_async`) iterates over async responses and silently skips any that are `None` or lack a `"data"` key. For stocks not previously cached, the API may return empty responses without raising an error. The batch function counts `len(batch)` only when the returned DataFrame is non-empty, so stocks with no data are silently ignored.

**Diagnostic:** Compare DB cache coverage vs stock_info:
```python
conn.execute('SELECT COUNT(DISTINCT code) FROM stock_prices').fetchone()
# vs
conn.execute('SELECT COUNT(DISTINCT code) FROM stock_info').fetchone()
```
If stock_prices has significantly fewer distinct codes, the async batch is silently dropping uncached stocks.

**Workaround:** Pre-seed the cache for target stocks via single-fetch before running async batches, or accept that async batch only refreshes stocks already in the cache. The existing cached coverage (~791 stocks) is sufficient for scanning — it includes all actively traded common stocks.

### 🔌 SSL ConnectionReset(104) in WSL2

**Symptom:** Direct `requests.get()` to `https://api.finmind.ai/` raises `ConnectionResetError(104, 'Connection reset by peer')` from WSL2. However, the FinMind library's own `DataLoader` (using its internal `aiohttp`/async client) works fine.

**Root cause:** WSL2's networking stack may interfere with FinMind's CDN/cloudflare TLS handshake for synchronous requests. The library's async client handles this differently.

**Fix:** Always use the FinMind `DataLoader` wrapper methods (which use async internally) rather than raw `requests` calls. If you must use raw HTTP, add `verify=False` or set `REQUESTS_CA_BUNDLE`:
```python
import urllib3; urllib3.disable_warnings()
r = requests.get(url, params=params, verify=False, timeout=30)
```
Prefer the DataLoader for all production use.

### yfinance Fallback
When FinMind returns empty (HTTP 429 or data gap), yfinance returns columns with different casing:
- `Close` not `close`, `Volume` not `volume`, `High`/`Low`/`Open`/`Date` (DatetimeIndex)
- Must normalize separately after fallback fetch.

### Common Failures
1. **KeyError `'volume'`** → `Trading_Volume` not normalized; apply `_normalize_finmind_df()`
2. **Empty results after retries** → Stock may be delisted; try yfinance fallback
3. **HTTP 429** → Exponential backoff (5s, 10s, 20s) + rate limiter at 0.5 calls/sec
4. **`stock_id` in data but no `code`** → Must assign `df['code'] = stock_id` after fetch (FinMind doesn't include it)
5. **HTTP 402 — Anonymous rate limit exhausted** → API returns `{"status": 402, "msg": "Requests reach the upper limit."}` without a `"data"` key. Single-fetch raises `KeyError: 'data'`. Async batch silently returns empty DataFrame. **Fix:** Pass a valid API token to `DataLoader(token="...")`.
6. **Async batch returning empty while single-fetch crashes** — Async batch silently skips error responses (the library filters out `resp` that are `None` or lack `"data"`), so the symptom is an empty DataFrame. Single-fetch crashes with `KeyError: 'data'`. Always check both to distinguish auth errors from genuine missing data.

### Missing Dependencies
If `ModuleNotFoundError: No module named 'tqdm'` occurs:
`pip install tqdm`
