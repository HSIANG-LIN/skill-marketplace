---
name: finmind-api-troubleshooting
description: Workflow for debugging FinMind API integration issues, specifically handling duplicates and malformed API responses in the stock scanner.
---

# FinMind API Troubleshooting

Use this skill when encountering issues with the FinMind `DataLoader` in the Stock Scanner project.

## Diagnostic Decision Tree

When `taiwan_stock_daily()` returns empty or partial data, first distinguish **why**:

```
Q1: Does FinMind's OWN website (https://finmindtrade.com/analysis/#/dashboards/taiwan-stock-analysis)
    show today's price data (e.g., "2026-05-04 BIAS" heading visible)?

    YES → Issue is NOT FinMind data availability. Check API rate limit (402).
           → Go to Section 3 (KeyError: 'data') — 402 case

    NO  → FinMind hasn't published today's data yet.
           → Go to Section 6 (Wholesale Data Unavailability)

Q2: If website has data but only ~500-800 stocks appear in local DB:
    → 99% → 402 RATE LIMIT (Section 3)
    → Check with: python3 -c "import requests; r=requests.get(
         'https://api.finmindtrade.com/api/v4/data',
         params={'dataset':'TaiwanStockPrice','data_id':'2330',
                 'start_date':'2026-05-04','end_date':'2026-05-04'}
       ).json(); print(r.get('status'), r.get('msg'))"
       
Q3: If specific stock IDs consistently fail across multiple days:
    → Silent batch drop (Section 5)
```

## Common Issues & Fixes

### 1. Duplicate Stock Results
- **Symptoms**: The scanner returns the same stock multiple times, or logs show repeated downloads for the same `data_id`.
- **Root Cause**: The `get_market_info()` method in `data_provider.py` returns a DataFrame where the `code` column contains duplicates (often due to how the API categorizes stocks).
- **Fix**: In `data_provider.py`, ensure the returned DataFrame is deduplicated:
  ```python
  return df.drop_duplicates(subset=['code'])[['code', 'name', 'industry']]
  ```

### 2. Incorrect Result Count
- **Symptoms**: The scanner returns fewer stocks than expected (e.g., always 10).
- **Root Cause**: The `scan()` method in `scanner.py` has a hardcoded slice at the end of the function.
- **Fix**: Update the slice index in `scanner.py` (e.g., `return results[:20]`).

### 3. `KeyError: 'data'` — API Error Response without Data Key
- **Symptoms**: `get_market_info()` or `taiwan_stock_daily()` fails with `KeyError: 'data'`, or async batch silently returns an empty DataFrame.
- **Root Cause**: The FinMind API returned an error response instead of the expected data. Common causes:
  - **Anonymous rate limit exhausted (402)**: The free anonymous tier has a daily cap. API returns `{"status": 402, "msg": "Requests reach the upper limit."}` — no `"data"` key exists. Single-fetch crashes with KeyError; async batch silently returns empty.
  - **Invalid/expired token**: Same pattern — error response without data.
  - **Transient server error**: Same — error without data.
- **Diagnostic**: Check the raw API response to distinguish these cases. Use `requests.get()` directly with the same params:
  ```python
  import requests
  r = requests.get("https://api.finmindtrade.com/api/v4/data", params={
      "dataset": "TaiwanStockPrice", "data_id": "2330",
      "start_date": "2026-03-28", "end_date": "2026-04-28"
  }).json()
  print(r.get("status"), r.get("msg"))  # e.g. 402 + "Requests reach the upper limit."
  ```
- **Fix for 402/anonymous limit**: Pass a valid API token to `DataLoader(token="...")`. Without a token, FinMind's free anonymous tier has severe daily rate limits.
- **Fix for zero-data strategies**: When FinMind returns empty, strategies relying on `df_history` (from `get_daily_history()`) get empty DataFrames and all prices become 0. Decouple strategy price lookup to read directly from the SQLite cache via per-stock `GROUP BY code + MAX(date)` queries — see `quant-strategy-engine` skill for the robust pattern.

### 4. `TaiwanStockInstitutionalInvestorsBuySell` Dataset Unavailable
- **Symptoms**: `taiwan_stock_institutional_investors(stock_id="2330")` raises `KeyError: 'data'`, or async batch returns empty DataFrame.
- **Root Cause**: This FinMind dataset appears to require a paid/upgraded API tier or has been deprecated in the current library version. The async batch silently returns an empty DataFrame rather than raising an error.
- **Fix**: Do NOT rely on FinMind for institutional flow data. Use the **TWSE official API** instead:
  ```python
  url = f"https://www.twse.com.tw/fund/T86?response=json&date={yyyymmdd}&selectType=ALL"
  ```
  This returns per-stock foreign/trust/dealer buy/sell data for free. Create a separate fetcher module (`data_twse.py`) with its own DB cache table.

### 5. Silent Batch Data Drop — FinMind Async Returns Empty for Specific Stocks
- **Symptoms**: Most stocks get the latest day's data, but certain stocks (e.g., `2330`, `2881`, `2882`) consistently have stale prices. The scan uses yesterday's close instead of today's. No error shown.
- **Root Cause**: FinMind's async batch API (`taiwan_stock_daily(stock_id_list=[...], use_async=True)`) can silently return empty DataFrames for specific stocks. This happens at the **batch level** — an entire batch of 100 stocks drops silently. The calling code treats "empty" as "no new data for these dates" rather than "fetch failed."
- **Compounding Factor #1 — Global cache check**: `get_all_cached_dates()` checks if a date exists *anywhere* in the DB. If 768 stocks have `2026-04-28`, the date appears "cached" globally, even though 2330 specifically has no `2026-04-28` data. The system skips fetching.
- **Compounding Factor #2 — Weekend pollution**: Date generators include weekends (Saturday/Sunday). When weekends are the *only* missing dates in the range, `date_range.issubset(cached_dates)` fails, triggering a full-market 2361-stock fetch for weekend dates that FinMind can never return.
- **Fix — Per-stock end-date validation**: After batch fetch, check each stock individually for the latest trading day (`end_date`), not the entire date range:
  ```python
  end_str = end_date.strftime('%Y-%m-%d')
  still_missing = [code for code in codes_to_fetch
                   if end_str not in self.db.get_cached_dates(code)]
  ```
- **Fix — Retry with smaller batches**: Re-fetch missing stocks in batches of 20 instead of 100:
  ```python
  for i in range(0, len(still_missing), 20):
      batch = still_missing[i:i + 20]
      df = self._fetch_batch_prices(batch, end_date, end_date)
      if df is not None and not df.empty:
          self.db.save_stock_prices(df)
  ```
- **Fix — Filter weekends from date_range** in `fetch_latest_data()` / `get_daily_history()` / `get_daily_history_for_subset()`:
  ```python
  trading_dates = {
      d for d in date_range
      if datetime.datetime.strptime(d, '%Y-%m-%d').weekday() < 5
  }
  date_range = trading_dates
  ```
- **Note on yfinance fallback (outdated — see yfinance hybrid approach below)**: `yf.Ticker(f\"{code}.TW\").history()` is indeed slow per-stock (~0.5-2s each). But `yf.download([\"2330.TW\", \"2344.TW\", ...], period=\"5d\")` batch mode handles 50 stocks in ~1 second total. Use `yf.download()` as PRIMARY data source (see Section 6A — Option B), not a per-stock fallback.
- **Verification**: After patching, run `python src/main.py scan --no-send` and check logs for "⚠️  N 檔仍缺 YYYY-MM-DD，進行小批次重試..." followed by successful completion. Query the DB: `SELECT date, close FROM stock_prices WHERE code='2330' ORDER BY date DESC LIMIT 1` should show today's close.

### 6. Wholesale Data Unavailability — FinMind Hasn't Published Today's Data Yet (or Rate Limit Exhausted)

**Symptoms:** The retry mechanism (Section 5) runs all retry batches successfully, yet `still_failed` at the end shows 1000+ stocks still missing the latest trading day. The scan results show mixed fresh and stale prices. Multiple stocks show `change_pct=0.00%` (stale data with no day-over-day change).

**Root cause — two possible:**
- **(A) 402 Rate limit exhausted:** FinMind's own website HAS today's data, but our batch-fetch consumed the free API quota after ~500-800 stocks. Remaining batches silently return empty.
- **(B) Genuinely not published yet:** FinMind's EOD processing pipeline hasn't finished. Market closes at 13:30; FinMind typically takes 2-3 hours.

**CRITICAL: Distinguish A from B by checking FinMind's website:**
```bash
# Open in browser:
https://finmindtrade.com/analysis/#/dashboards/taiwan-stock-analysis

# Search a stock that failed (e.g., "6187"):
#   - If "2026-05-04 BIAS" heading is visible → FinMind HAS today's data → It's case (A) — 402 rate limit
#   - If no today's date anywhere → It's case (B) — not published yet
```

**Diagnostic vs Section 5 "Silent Batch Drop":**
| Signal | Section 5 (Silent Drop) | Section 6A (402 Rate Limit) | Section 6B (Not Published) |
|--------|------------------------|-----------------------------|----------------------------|
| Website has data | Yes (for those stocks) | **Yes** | **No** |
| Retry success | Retries fail | Retries succeed (but all return empty) | Retries succeed |
| Scale | 10-50 specific stocks | ~500-800 succeed, rest fail | 1000+ stocks |
| Affected stocks | Same IDs every day | Random — depends on batch order | Random |
| Time sensitivity | Always consistent | Consistent until quota resets | Only early in day |

**Fix for 6A (402 Rate Limit) — Get an API token:**
```python
# Register at https://finmindtrade.com/ to get a token
loader = DataLoader(token="your_token_here")
```
The free anonymous tier has a very low daily cap. With a token, the cap is significantly higher.

**Fix for 6B (Not Published Yet) — Adjust schedule:** Move the automated scan to **16:00** (2.5 hours after market close). This gives FinMind sufficient buffer to process and publish EOD data.
```bash
# cron: 0 16 * * 1-5
```

**Emergency workaround — manual re-run:**
```bash
cd /home/simon_dou/workspace/hermes_project/stock_scanner
bash scripts/scan_and_push.sh
```
Run at any time after FinMind publishes; the second run will find today's data already cached and skip re-fetching for most stocks, completing in ~30 seconds.

## Verification
- After patching, run `test_run_fast.py` via the project's `venv`.
- Check logs to ensure `data_id` values are unique.
