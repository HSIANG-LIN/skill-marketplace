---
name: quant-scan-backtesting
description: Build a backtesting framework to evaluate whether a daily stock scanning system actually predicts future returns. Covers forward-return calculation, strategy-level aggregation, and the "data accumulation period" pitfall.
---

# quant-scan-backtesting

## Overview

Evaluates a daily stock scanning system by checking whether stocks it recommended actually outperformed N trading days later. This is the **validation** counterpart to `quant-strategy-engine` (which is about *building* the scanner).

## When to Use

Use this skill when:
- You have a quant scanning system with `scan_history` (daily stock picks tagged by strategy)
- You have a `stock_prices` table with historical OHLCV data
- The user asks: "does this scanner work?", "backtest my strategies", or "show me how my picks performed"
- You need to compare strategy performance before tuning parameters

## Core Architecture

### Data Requirements

Backtesting needs **three** things that must exist before it can run:
1. **Scan history** — which stocks were recommended on which dates by which strategy
2. **Forward price data** — prices extending *after* each scan date (N trading days later)
3. **Sufficient accumulation period** — scans must be at least `holding_days` old to have forward data

**Critical pitfall:** If today's scan is the only scan, backtesting produces "no data" because there are no forward prices yet. This is expected — the framework is ready but the user must wait ~20 trading days for meaningful results.

### Algorithm

```
For each (scan_date, stock, strategy) in scan_history:
    find price_at_scan = closest price on or after scan_date
    find price_at_scan + holding_days = closest price on or after target date
    calculate return = (price_future - price_at_scan) / price_at_scan
    
Aggregate by:
    - strategy (which strategy performs best?)
    - holding_days (5-day vs 20-day performance?)
    - score_percentile (do top-scored picks outperform bottom?)
```

### SQL Implementation

```python
# Query scan results
scans = conn.execute("""
    SELECT scan_date, strategy, code, score, price as entry_price
    FROM scan_history
    WHERE scan_date < ?
""", (latest_future_date,)).fetchall()

# For each scan, find forward price
for scan in scans:
    future_price = conn.execute("""
        SELECT close FROM stock_prices 
        WHERE code = ? AND date >= ? 
        AND date <= ?
        ORDER BY date ASC LIMIT 1
    """, (scan.code, target_date, target_date_plus_margin)).fetchone()
```

### Metrics to Report

| Metric | Formula | What it means |
|--------|---------|---------------|
| Win Rate | wins / total | % of recommendations that went up |
| Avg Return | mean(returns) | Average profit per trade |
| Max Drawdown | min(cumulative_returns) | Worst peak-to-trough |
| Sharpe (approx) | avg_return / std(returns) | Risk-adjusted return |
| Per-Strategy | group by strategy | Which strategy actually works? |
| Top-N vs Bottom-N | top 5 vs bottom 5 picks | Does scoring actually rank? |

## Advanced Analysis Methods

### `equity_curve(results_dict, holding_days=5)` — Cumulative Return Over Time

For each scan date, calculate the average forward return of all signals on that day, then cumulatively sum them to simulate a portfolio equity curve.

```python
def equity_curve(self, results_dict, holding_days=5):
    rows = []
    for strategy, df in results_dict.items():
        if df is None or df.empty:
            continue
        col = f"return_{holding_days}d_pct"
        if col not in df.columns:
            continue
        daily = df.groupby("scan_date")[col].agg(["mean", "count", "std"]).reset_index()
        daily.columns = ["scan_date", "avg_return", "signal_count", "std_return"]
        daily["strategy"] = strategy
        daily = daily.sort_values("scan_date")
        daily["cumulative_return"] = daily["avg_return"].cumsum()
        rows.append(daily)
    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True)
```

**Key insight:** This simulates "what if I followed every signal on each day equally?" The curve tells if the strategy makes money consistently over time, not just from one lucky pick.

### `signal_detail(strategy, holding_days=5, min_score=0, limit=100)` — Per-Signal Breakdown

Get individual signal-level data for a strategy, with win/loss classification:

```python
def signal_detail(self, strategy, holding_days=5, min_score=0, limit=100):
    engine = BacktestEngine(self.db_path)
    df = engine.backtest_strategy(strategy, [holding_days], min_score)
    if df is None or df.empty:
        return pd.DataFrame()
    col = f"return_{holding_days}d_pct"
    if col not in df.columns:
        return df
    df["result"] = df[col].apply(
        lambda x: "win" if x is not None and x > 0
        else ("loss" if x is not None and x < 0 else "flat")
    )
    return df.head(limit)
```

### Signal Quality Aggregation

Aggregate win/loss counts across strategies with profit ratio (win magnitude vs loss magnitude):

```python
quality_rows = []
for strategy, df in results.items():
    if df is None or df.empty or "return_5d_pct" not in df.columns:
        continue
    valid = df["return_5d_pct"].dropna()
    if len(valid) < 2:
        continue
    wins = (valid > 0).sum()
    losses = (valid < 0).sum()
    quality_rows.append({
        "strategy": strategy,
        "total_signals": len(df),
        "with_fwd_data": len(valid),
        "wins": wins, "losses": losses,
        "win_rate": f"{wins/len(valid)*100:.0f}%",
        "avg_pnl": f"{valid.mean():+.2f}%",
        "profit_ratio": f"{valid[valid>0].mean()/abs(valid[valid<0].mean()):.2f}x" if losses > 0 and wins > 0 else "-",
    })
```

**Profit ratio** is critical: a 40% win rate with 3:1 ratio beats a 55% win rate with 1:1 ratio.

### Best/Worst Signals

```python
all_signals = []
for strategy, df in results.items():
    if df is None or df.empty or "return_5d_pct" not in df.columns:
        continue
    valid = df[df["return_5d_pct"].notna()].copy()
    if valid.empty: continue
    valid["strategy"] = strategy
    all_signals.append(valid[["scan_date","code","name","strategy","score","price_at_scan","return_5d_pct"]])
combined = pd.concat(all_signals, ignore_index=True)
best = combined.nlargest(10, "return_5d_pct")
worst = combined.nsmallest(10, "return_5d_pct")
```

## Dashboard Integration

### CLI Integration

Add to the existing scanner's `main.py`:

```python
elif args.mode == 'backtest':
    from backtest import run_backtest_cli
    run_backtest_cli()
```

And add `'backtest'` to the parser's choices list.

### Dashboard Integration

Embed the `BacktestEngine` directly into the Streamlit dashboard so users see live results without leaving the web UI. Replace placeholder text with actual data.

#### Import (Cross-Directory Pattern)

`app.py` lives in the project root, `BacktestEngine` lives in `src/backtest.py`. Since `src/` has no `__init__.py`, use `sys.path` injection:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'src'))
from backtest import BacktestEngine
```

> ⚠️ **Pitfall:** `from src.backtest import BacktestEngine` won't work without an `__init__.py` in `src/`. Use `sys.path.insert(0, ...)` instead.

#### Cached Backtest Runner

Use `@st.cache_data(ttl=300)` — scan_history only changes once per day, so 5-minute cache prevents redundant SQLite queries on every rerun:

```python
@st.cache_data(ttl=300)
def run_backtest():
    engine = BacktestEngine()
    results = engine.run_all(holding_days=[5, 10, 20])
    summary_df = engine.summary(results)
    top_df = engine.top_picks(results, top_n=20)
    return summary_df, top_df

with st.spinner("⏳ 執行回測中..."):
    try:
        bt_summary, bt_top = run_backtest()
    except Exception as e:
        st.error(f"回測執行失敗: {e}")
        st.stop()

if bt_summary.empty:
    st.info("📭 尚無足夠資料進行回測，等待每日掃描累積資料。")
    st.stop()
```

#### Summary Table

Format numeric columns with human-readable strings. The `summary()` DataFrame has this schema:

| Column | Type | Description |
|--------|------|-------------|
| strategy | str | Strategy name |
| holding_days | int | 5, 10, or 20 |
| signals | int | Total scan signals |
| with_fwd_data | int | Signals with valid forward prices |
| avg_return | float | Mean return % |
| median_return | float | Median return % |
| win_rate | float | % of positive-return signals (0-100) |
| max_return | float | Best return % |
| min_return | float | Worst return % |
| std_return | float | Return std dev |

```python
display = bt_summary.copy()
display.columns = [
    '策略', '持有日數', '總訊號數', '有後續價', '平均報酬',
    '中位數', '勝率', '最大', '最小', '標準差'
]
for c in ['平均報酬', '中位數', '最大', '最小']:
    display[c] = display[c].apply(lambda x: f"{x:+.2f}%")
display['勝率'] = display['勝率'].apply(lambda x: f"{x}%" if x != '-' else '-')
st.dataframe(display, use_container_width=True, hide_index=True)
```

#### Average Return Bar Chart (Grouped by Holding Days)

Use `px.bar(barmode='group')` to show 5/10/20-day returns side by side per strategy. Add a `hline(y=0)` as the baseline:

```python
fig = px.bar(
    bt_summary,
    x='strategy', y='avg_return',
    color='holding_days',
    barmode='group',
    title='📈 各策略平均報酬 (5/10/20 日)',
    labels={'strategy': '策略', 'avg_return': '平均報酬率 (%)', 'holding_days': '持有天數'},
    color_discrete_sequence=px.colors.qualitative.Set2,
    text=bt_summary['avg_return'].apply(lambda x: f"{x:+.1f}%")
)
fig.add_hline(y=0, line_dash='dash', line_color='gray', opacity=0.5)
fig.update_layout(**DARK_THEME, height=400,
                  yaxis=dict(gridcolor='#333', title='平均報酬率 (%)'),
                  legend=dict(orientation='h', y=1.12))
fig.update_traces(textposition='outside')
st.plotly_chart(fig, use_container_width=True)
```

#### Win Rate Chart

Filter to rows with non-null win_rate (some strategies may have 0 signals for certain holding periods):

```python
win_data = bt_summary[bt_summary['win_rate'].notna()].copy()
if not win_data.empty:
    fig2 = px.bar(
        win_data,
        x='strategy', y='win_rate',
        color='holding_days',
        barmode='group',
        title='🏆 各策略勝率比較',
        labels={'strategy': '策略', 'win_rate': '勝率 (%)', 'holding_days': '持有天數'},
        color_discrete_sequence=px.colors.qualitative.Set2,
        text=win_data['win_rate'].apply(lambda x: f"{x:.0f}%")
    )
    fig2.update_layout(**DARK_THEME, height=350,
                       yaxis=dict(gridcolor='#333', range=[0, 100], title='勝率 (%)'),
                       legend=dict(orientation='h', y=1.12))
    fig2.update_traces(textposition='outside')
    st.plotly_chart(fig2, use_container_width=True)
```

#### Top Picks Table

The `top_picks()` method returns a flat DataFrame. The column name for the return depends on which holding day won (e.g. `return_10d_pct`). Show `scan_date`, `code`, `name`, `strategy`, and return:

```python
if not bt_top.empty:
    top_display = bt_top[['scan_date', 'code', 'name', 'strategy', 'holding', 'return_10d_pct']].copy()
    top_display.columns = ['日期', '代碼', '名稱', '策略', '持有日', '報酬率']
    top_display['報酬率'] = top_display['報酬率'].apply(lambda x: f"{x:+.2f}%")
    st.dataframe(top_display, use_container_width=True, hide_index=True)
```

#### Raw Data Expander

For users who want the full detail without cluttering the default view. Iterate over strategies and show each as a sub-section:

```python
with st.expander("📋 查看原始回測數據", expanded=False):
    for sname in bt_summary['strategy'].unique():
        st.markdown(f"**📈 {sname}**")
        sdf = bt_summary[bt_summary['strategy'] == sname]
        cols = ['holding_days', 'signals', 'with_fwd_data',
                'avg_return', 'median_return', 'win_rate',
                'max_return', 'min_return']
        sdisp = sdf[cols].copy()
        sdisp.columns = ['持有日', '訊號數', '有數據', '均報酬',
                         '中位數', '勝率', '最大', '最小']
        for c in ['均報酬', '中位數', '最大', '最小']:
            sdisp[c] = sdisp[c].apply(lambda x: f"{x:+.2f}%")
        sdisp['勝率'] = sdisp['勝率'].apply(
            lambda x: f"{x:.0f}%" if not pd.isna(x) and x != '-' else '-'
        )
        st.dataframe(sdisp, use_container_width=True, hide_index=True)
        st.markdown("---")
```

## Common Pitfalls

### 1. "No Data" on First Run

**Symptom:** Backtest prints "No sufficient data" even though scans exist.
**Root cause:** Forward prices don't exist yet. Scans need to be older than `holding_days`.
**Fix:** This is by design. Use `--dry-run` or `--info` mode to show how much data is available and when meaningful results will be ready. The framework should report:
- How many scan dates exist
- How many of those have forward prices
- Estimated date when results will be available

### 2. Forward-Looking Survivorship Bias

**Symptom:** Backtest returns unrealistically good results.
**Root cause:** When querying forward prices, stocks that were delisted or stopped trading won't have prices, skewing results upward.
**Fix:** When a forward price is missing, count it as a -100% return (or exclude and report exclusion count separately).

### 3. Price Date Format Mismatch

**Symptom:** SQL comparisons fail silently or return wrong rows.
**Root cause:** `scan_history` stores dates as `YYYY-MM-DD` but `stock_prices` or `institutional_flows` might use `YYYYMMDD`.
**Fix:** Always verify date formats with `SELECT DISTINCT date FROM table LIMIT 5` before writing queries. Use consistent format conversion.

### 4. Data Accumulation Period

**Symptom:** User expects backtesting to work on day 1.
**Root cause:** Backtesting is inherently a "data-after-data" analysis. It requires the scanning system to have been running for at least `holding_days` trading days.
**Fix:** Be upfront about this. In the first session, build the framework. Tell the user it needs ~4 weeks of data before producing meaningful results. Set up a cron job that continuously collects data so backtesting works automatically once sufficient history exists.

## Workflow Steps

1. **Verify data availability** — Check scan dates, price date range, and forward-data availability
2. **Build SQL queries** — For each scan, find entry price and exit price
3. **Compute per-stock returns** — Loop through scan results, compute individual returns
4. **Aggregate by strategy** — Group by strategy name, compute mean/median/win-rate
5. **Report results** — Print or display in dashboard
6. **If no data yet** — Report "accumulation in progress: X scan dates, need Y more days"

## Related Skills

- `quant-strategy-engine` — Builds the scanner this skill evaluates. Load both when a user asks "make my scanner better" — build new strategies with the engine skill, then validate with this one.
- `quant-confluence-testing-workflow` — Mock-driven pre-validation before live backtesting.
