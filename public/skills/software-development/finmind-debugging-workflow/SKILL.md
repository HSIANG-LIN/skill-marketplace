---
name: finmind-debugging-workflow
description: Procedure for correctly using and debugging the FinMind library in this environment.
category: software-development
---

# FinMind Debugging Workflow

When working with financial data using the `FinMind` library in this environment, follow these steps to avoid common pitfalls.

## Known Pitfalls

### 1. Incorrect Import Path
**Problem**: `ModuleNotFoundError` or `ImportError`.
**Solution**: The correct import is:
```python
from FinMind.data.data_loader import DataLoader
```

### 2. Column Name Mismatches
**Problem**: FinMind returns non-standard column names that differ from what the code expects.
**Solution**: FinMind uses `Trading_Volume` (not `Volume`), `stock_id` (not `code`), `max`/`min` (not `high`/`low`). Always normalize:
```python
FINMIND_COLUMN_MAP = {
    'stock_id': 'code',
    'Trading_Volume': 'volume',
    'open': 'open',
    'max': 'high',
    'min': 'low',
    'close': 'close',
    'spread': 'spread',
}
```

### 3. API Response Errors (`KeyError: 'data'`)
**Problem**: The API returned an error response (rate limit, invalid token, or server error) instead of the expected data. FinMind's `DataLoader` tries to access `response['data']` without checking for error keys first.
**Solution**: Wrap calls in a retry loop and check for empty DataFrames:
```python
def _finmind_with_retry(func, *args, max_retries=3, **kwargs):
    for attempt in range(max_retries):
        result = func(*args, **kwargs)
        if result is not None and not result.empty:
            return result
        time.sleep(2 ** attempt * 5)  # Exponential backoff
    return None
```

### 4. CRITICAL: nest_asyncio + uvloop Conflict in Streamlit/WebSocket
**Problem**: `ValueError: Can't patch loop of type <class 'uvloop.Loop'>` — FinMind's `utility/request.py` calls `nest_asyncio.apply()` at **import time**. In environments with uvloop (Streamlit, async web servers), this crashes because uvloop's event loop cannot be patched.
**Solution**: Lazy-load FinMind only when actually calling it, and patch the event loop policy BEFORE importing:
```python
class DataProvider:
    @property
    def loader(self):
        if self._loader is None:
            import asyncio, sys
            # Remove cached FinMind modules
            mods_to_remove = [k for k in sys.modules.keys() if k.startswith('FinMind')]
            for mod in mods_to_remove:
                del sys.modules[mod]
            # Switch from uvloop to selector policy before importing FinMind
            policy = asyncio.get_event_loop_policy()
            if hasattr(policy, '_loop_factory') and 'uvloop' in str(policy._loop_factory):
                asyncio.set_event_loop_policy(asyncio.SelectorEventLoopPolicy())
            from FinMind.data.data_loader import DataLoader
            self._loader = DataLoader()
        return self._loader
```

## FinMind API Stability
- Rate limit (HTTP 402: `"Requests reach the upper limit"`) is the most common failure mode for the free tier (600 requests/hour). The response lacks a `data` key, causing silent `KeyError: 'data'` crashes in the wrapper.
- **Critical implementation detail**: FinMind's `use_async=True` fires N **concurrent HTTP requests** (one per stock code), not one batched request. A batch of 100 stocks = 100 GET requests. The free tier quota of 600/hr is exhausted after ~6 batches.
- **Current architecture**: yfinance is the **primary** source for daily price data. FinMind serves as a **secondary fallback** for stocks yfinance cannot reach (e.g., some OTC stocks, delisted stocks). See skills `quant-strategy-engine` → references/yfinance-tw-stock-pattern.md for the production implementation.
- For real-time monitoring, use batch polling (every 30-60s) via yfinance `fast_info` (0.5s per stock) rather than FinMind streaming.
- Cache market_info to avoid repeated API calls.

## Recommended Workspace
Project: `~/workspace/hermes_project/stock_scanner/`
- Pre-configured venv with FinMind + yfinance + streamlit
- CLI entry: `python src/main.py [scan|sector|watch]`
- Dashboard: `streamlit run src/dashboard.py --server.port 8501`
