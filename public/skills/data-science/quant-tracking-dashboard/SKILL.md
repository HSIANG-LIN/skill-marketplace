---
name: quant-tracking-dashboard
description: Patterns for building Streamlit-based historical tracking dashboards that visualize quantitative scan results over time — daily trends, strategy performance, stock track records, and cross-strategy overlap.
---

# quant-tracking-dashboard

Patterns for building a **Streamlit dashboard** that tracks **historical quantitative scan results** over time. Reads from a SQLite `scan_history` table (populated by daily scans) and visualizes trends, recurring stocks, strategy performance, and cross-strategy signals.

Complements `quant-strategy-engine` (which covers building the scan engine itself) and `quant-smart-report` (which covers message formatting).

## Core Architecture

### 1. Data Source: SQLite scan_history Table

The dashboard reads from a `scan_history` table with this schema:

```sql
CREATE TABLE IF NOT EXISTS scan_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_date   TEXT NOT NULL,
    strategy    TEXT NOT NULL,
    code        TEXT NOT NULL,
    name        TEXT,
    score       REAL,
    price       REAL,
    change_pct  REAL,
    volume      INTEGER,
    reasons     TEXT,       -- JSON array of reason strings
    details     TEXT,       -- JSON extra metadata
    created_at  TEXT DEFAULT (datetime('now', 'localtime'))
);
```

Optionally join with `stock_info` for industry mapping:
```sql
SELECT h.*, i.industry
FROM scan_history h
LEFT JOIN stock_info i ON h.code = i.code
```

### 2. Streamlit Setup

```python
import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import sqlite3, json, datetime

st.set_page_config(page_title="Scanner Tracker", page_icon="📈",
                   layout="wide", initial_sidebar_state="collapsed")

# Common dark theme dict for Plotly
DARK_THEME = {
    'paper_bgcolor': '#0e1117',
    'plot_bgcolor': '#0e1117',
    'font': dict(color='#e0e0e0'),
    'title_font_color': '#ffffff',
    'legend_font_color': '#e0e0e0',
}
```

Use `@st.cache_data(ttl=N)` for loading queries — data only changes once per day.

### 3. Key Query Patterns

**Daily Summary (line chart data):**
```sql
SELECT scan_date,
       COUNT(*) as total,
       COUNT(DISTINCT code) as unique_stocks,
       ROUND(AVG(score), 1) as avg_score
FROM scan_history GROUP BY scan_date ORDER BY scan_date
```

**Per-Strategy Breakdown (stacked bar data):**
```sql
SELECT scan_date, strategy,
       COUNT(*) as cnt,
       ROUND(AVG(score), 1) as avg_score
FROM scan_history GROUP BY scan_date, strategy ORDER BY scan_date
```

**Recurring Stocks (flagged on 2+ days):**
```sql
SELECT code, name, COUNT(DISTINCT scan_date) as days_flagged,
       ROUND(AVG(score), 1) as avg_score,
       MAX(scan_date) as last_seen
FROM scan_history
GROUP BY code
HAVING days_flagged >= 2
ORDER BY days_flagged DESC, avg_score DESC
```

**Stock Track Record:**
```sql
SELECT scan_date, strategy, score, price, change_pct, reasons
FROM scan_history WHERE code = ?
ORDER BY scan_date DESC
```

**Cross-Strategy Overlap (same stock flagged by 2+ strategies same day):**
```sql
SELECT scan_date, code, name,
       GROUP_CONCAT(strategy) as strategies,
       COUNT(*) as strategy_count,
       ROUND(AVG(score), 1) as avg_score
FROM scan_history
GROUP BY scan_date, code
HAVING strategy_count >= 2
ORDER BY strategy_count DESC, avg_score DESC
```

### 4. Visualization Patterns

| View | Chart Type | Pattern |
|------|-----------|---------|
| Daily candidates count | Line chart | `px.line(daily_df, x='scan_date', y='total', markers=True)` |
| Avg score over time | Line chart | `px.line(daily_df, x='scan_date', y='avg_score')` |
| Strategy distribution | Stacked bar | `px.bar(strat_df, x='scan_date', y='cnt', color='strategy', barmode='stack')` |
| Score distribution | Histogram | `px.histogram(date_data, x='score', color='strategy', nbins=10)` |
| Stock price + scan markers | Line + vlines | `px.line(prices, x='date', y='close')` + `fig.add_vline(x=sd, line_dash='dash')` |
| Strategy comparison | Bar chart | `px.bar(avg_by_strat, x='strategy', y='avg_score', text='avg_score')` |

### 5. Stock Price Overlay

To add historical stock prices alongside scan markers, query the `stock_prices` table:

```python
db = StockDatabase()
prices = db.get_prices_for_codes([code], start_date=start_date_str)
fig = px.line(prices, x='date', y='close', ...)
# Add vertical lines for scan dates
for sd in scan_dates:
    fig.add_vline(x=sd, line_dash='dash', line_color='#ff6b35', opacity=0.5)
```

### 6. Real-Time Monitoring Tab (第 6 分頁)

整合 TWSE/TPEX 盤中即時行情，採全面卡片式佈局，每檔個股獨立卡片、每行 3 欄並排。

**注意：所有表格化顯示（st.dataframe）已被使用者明確拒絕 — 即時監控必須使用卡片式佈局。** 使用者需要一眼同時掃視多檔數據，表格不利於看盤。

#### 資料源：Fugle WebSocket（Primary）→ `twstock.realtime.get_raw()`（Fallback）

**2026-05-05 更新：** 主要即時資料源已從 twstock HTTP polling 改為 **Fugle WebSocket**（Push-based）。twstock 降為離線備援。

詳見參考文件：`references/fugle-websocket-integration.md`

**架構要點：**
- **realtime_fugle.py（Background Daemon）：** 單獨啟動的背景行程，透過 WebSocket 接收有成交才推送的即時資料，寫入兩個檔案：
  - `realtime_latest.json`（覆寫）— 最新成交快照
  - `realtime_ticks.jsonl`（append）— 每筆價格變動的歷史紀錄
- **動態 watchlist 訂閱（ReconnectNow 模式）：** daemon 每 5 秒檢查 `watchlist.json` 內容是否變化。若變動，disconnect 並 `raise ReconnectNow` → 外層迴圈捕獲後自動重連 → 以新 watchlist 重新呼叫 `stock.subscribe()`。實現**新增代碼後 5 秒內自動訂閱**。
- **Streamlit app.py：** 每 2s rerun 讀取這兩個本地檔案，**零網路成本**
- 若 daemon 未執行，自動 fallback 到 twstock polling

**呼叫模式：**
```python
# app.py
LATEST_FILE = DATA_DIR / "realtime_latest.json"

def fetch_with_fugle(wl):
    fugle_data = read_fugle_latest()
    if fugle_data:
        # 使用 WebSocket 資料
        for code in wl:
            d = fugle_data.get(code)
            if d and d.get("price") is not None:
                snapshot[code] = {
                    "name": code_map.get(code, ""),
                    "price": float(d["price"]),
                    "vol": d.get("volume", 0),
                    "bid": d.get("bid", "-"),
                    "ask": d.get("ask", "-"),
                    "ts": d.get("ts", ""),
                }
        if snapshot:
            return snapshot, snapshot_ts
    # Fallback
    return fetch_twse_raw(wl)
```

**Free Tier 限制：** Fugle 免費方案僅支援 **5 檔**訂閱。daemon 會動態取 watchlist 前 5 檔。若需更多股票，考慮 upgrade 或合併 twstock 補齊其餘。

**使用者體驗：** 側邊欄顯示 `✅ WebSocket 連線中` 狀態。無網路成本，預設 2s 刷新（純讀本地檔案）。

---

*舊資料源保留供 fallback 參考：*

#### 資料源（Fallback）：`twstock.realtime.get_raw()`（非 `get()`）

**使用 `twstock.realtime.get_raw()`，不要用 `twstock.realtime.get()`。** 兩者關鍵差異：

| 函式 | 回傳格式 | 包含 `y`（昨收） | 適用場景 |
|------|---------|-----------------|---------|
| `twstock.realtime.get(stocks)` | 解析後 dict（`{code: {info, realtime, ...}}`） | ❌ 被 `_format_stock_info()` 丟棄 | 只要看現價不看漲跌 |
| `twstock.realtime.get_raw(stocks)` | 原始 JSON（同 API 回傳，含 msgArray） | ✅ 保留完整欄位 | **即時監控漲跌計算** |

`get_raw()` 回傳的 `msgArray` 中每個 item 保有 TWSE API 所有原始欄位（含 `z`、`y`、`o`、`h`、`l`、`v`、`b`、`a`、`n`、`d`、`t`），且內建 retry 機制（預設 3 次）。不必自己處理 session cookie 或 `User-Agent` header — twstock 已封裝。

```python
def fetch_twse_raw(codes):
    """Fetch raw TWSE/TPEX data via twstock (incl. y = yesterday close)."""
    if not codes:
        return {'msgArray': []}
    data = twstock.realtime.get_raw(codes)
    return data if data.get('rtcode') == '0000' else {'msgArray': []}
```

**原始 API 關鍵欄位對照：**
| 欄位 | 意義 | 型態 |
|------|------|------|
| `z` | latest_trade_price (現價) | str |
| `y` | yesterday_close (**昨日收盤價**) | str |
| `o` | today_open (今日開盤) | str |
| `h` | high (最高) | str |
| `l` | low (最低) | str |
| `v` | accumulate_trade_volume (累積量) | str |
| `b` | best_bid_price (買價，底線分隔) | str |
| `a` | best_ask_price (賣價，底線分隔) | str |
| `n` | name (名稱) | str |
| `d` | date (日期) | str |
| `t` | time (時間) | str |

`b`/`a` 的解析方式：`(item.get('b', '') or '').split('_')[0]`

#### 漲跌計算基準（⚠️ 曾被使用者糾正）

**必須使用昨日收盤價 `y`，不能用開盤價 `o`。**

```
正確: change = current_price - yesterday_close     → +1.35 (+4.77%)  ✓
錯誤: change = current_price - today_open           → +0.44 (+1.51%)  ✗ (跳空時偏差)
```

```python
y_f = float(item['y']) if item.get('y') else None
p_f = float(item['z']) if item.get('z') else None
if p_f is not None and y_f is not None and y_f != 0:
    change = p_f - y_f
    pct = change / y_f * 100
```

#### 卡片式佈局（使用者偏好）

每檔個股用 `st.markdown(html, unsafe_allow_html=True)` 渲染為獨立卡片，`st.columns(3)` 多欄並排：

```
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ 2330 台積電    14:30 │  │ 6187 萬潤            │  │ 2344 華邦電          │
│                      │  │                      │  │                      │
│   2275.00            │  │   1330.00            │  │   95.40              │
│   +140.00  +6.56%   │  │   +120.00  +9.92%   │  │   +5.60   +6.24%    │
│                      │  │                      │  │                      │
│ 開 2200   高 2285   │  │ 開 1255   高 1330   │  │ 開 91.90  高 98.40  │
│ 低 2195   量 38,220 │  │ 低 1215   量  6,160 │  │ 低 91.10  量 196,805│
│ 買 2275   賣 2280   │  │ 買 1330   賣     -  │  │ 買 95.40  賣 95.50  │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

卡片設計原則：
- 深色背景（`linear-gradient(135deg, #1a1a2e, #16213e)`）
- 邊框顏色跟漲跌（🔴 `#ff1744` 漲 / 🟢 `#00c853` 跌 / ⚪ `#e0e0e0` 平） — 台股慣例紅漲綠跌
- 現價 2.2rem 大字
- 漲跌額 + 漲跌幅在同一行
- 開/高/低/量/買/賣 以 2×3 grid 排列（`grid-template-columns: 1fr 1fr`）

#### 側邊欄 Watchlist 管理

**使用者偏好：** 非常厭惡「chips 按鈕」式佈局（多行 `✕ 00981A` `✕ 2344` chips），認為「醜」。偏好**表格化 + inline ✕** 的緊湊設計。

**2026-05-05 簡化版偏好：** 使用者要求 **極簡側邊欄** — 移除自動刷新 checkbox、間隔選擇器、儲存按鈕。固定每 2s 刷新（僅盤中），最多顯示 5 檔。

⚠️ **不要用 timestamp 動態排序：** 初始版本用 `sorted(wl, key=lambda c: fugle_data[c]['ts'])` 每次都重新排序，**使用者明確糾正**「左邊的順序固定了就不要跳，有更新就放到第一個」。改為按 watchlist 原始順序顯示前 5 檔，**不要**因為新成交就讓股票跳來跳去。

**最新簡化方案（2026-05-05 最終版）：** 同時拿掉「有資料才顯示」的過濾。所有 watchlist 前 5 檔一律顯示，無資料的以 `-` 代替價格。這樣**新增代碼後立刻出現**（不用等成交推送），刪除代碼也不會造成清單跑掉。使用者說「乾脆單純點」。

```python
shown_codes = wl[:5]   # 全部顯示，無過濾
for code in shown_codes:
    d = display_data.get(code)
    if isinstance(d, dict) and d.get('price') is not None:
        price_str = f"{d['price']:.2f}"
        bid, ask = d.get('bid', '-'), d.get('ask', '-')
    else:
        price_str = "-"
        bid, ask = "-", "-"
    name_short = (get_stock_name(code) or '')[:6]
    # render row...
```

**正確的側邊欄管理佈局（簡化版 Compact Table + Inline ✕）：**

```
📡 即時監控
Fugle WebSocket — 有成交才更新
✅ WebSocket 連線中

2357 華碩    590.00    590/591   ✕
2481 強茂    101.50    101/102   ✕
00981A 主動  29.35     29.34/29.35  ✕
...

📡 11:05:20

[加入代碼] [➕]
```

**實現方式：** 只顯示前 5 檔，照 watchlist 原始順序（**不要**動態依 timestamp 排序 — 使用者明確拒絕跳來跳去）。Fugle WebSocket 無 `y`（昨收）無法算漲跌%，改顯示 `bid/ask`：

```python
# ── 固定順序，不跳 ────────────────
shown_codes = [c for c in wl[:5] if isinstance(display_data.get(c), dict) and display_data[c].get('price') is not None]

for code in shown_codes:
    d = display_data.get(code)
    if not isinstance(d, dict) or d.get('price') is None:
        continue
    price_str = f"{d['price']:.2f}"
    bid = d.get('bid', '-')
    ask = d.get('ask', '-')
    name_short = (d.get('name', '') or '')[:6]

    c1, c2, c3, c4 = st.columns([1.8, 1.2, 1.2, 0.4])
    with c1:
        st.markdown(f"**{code}** {name_short}")
    with c2:
        st.markdown(f"<div style='text-align:right'>{price_str}</div>",
                    unsafe_allow_html=True)
    with c3:
        st.markdown(f"<div style='text-align:right;color:#9e9e9e;font-size:0.8rem'>{bid}/{ask}</div>",
                    unsafe_allow_html=True)
    with c4:
        if st.button("✕", key=f"sb_del_{code}", help=f"移除 {code}"):
            to_rm = code
```

**加入股票（底部精簡列）：** 只有輸入框 + ➕ 按鈕，無儲存按鈕（watchlist 存於 session state，重啟才需重新加入）。

```python
ac1, ac2 = st.columns([3, 1])
with ac1:
    add_code = st.text_input("加入代碼", placeholder="代碼", key="sb_add_code", label_visibility="collapsed")
with ac2:
    pressed_add = st.button("➕", key="sb_add_btn", use_container_width=True)

if pressed_add and add_code:
    code = add_code.strip().upper()
    if code and code not in st.session_state.rt_watchlist:
        st.session_state.rt_watchlist.append(code)
```

**⚠️ st.button 的 session state 陷阱：** `st.button(key="sb_save_btn")` 的返回值是布林值（True when clicked），不是寫到 session state 的。以下寫法是錯的：

```python
# ✗ 錯誤：st.button 不會自動把值存進 session state
st.button("💾", key="sb_save_btn")
if st.session_state.get('sb_save_btn', False):
    ...  # 永遠不會執行到正確的時間點
```

必須直接使用返回值：

```python
# ✓ 正確：直接使用返回值
pressed_save = st.button("💾", key="sb_save_btn")
if pressed_save:
    ...
```

**⚠️ 刪除 `else:` 區塊後的縮排陷阱：** 當從 `if/else` 結構中刪除 `else:` 分支時，該分支內縮排的代碼會自動變成上一層 `if` 塊的內容，導致邏輯錯誤（代碼只會在 if 條件成立時執行）。必須手動將所有被 indent 的代碼退一格。

**持久化：** 儲存至 `data_output/watchlist.json`。注意：檔案存在但內容為 `[]`（空陣列）時，應 fallback 到預設清單而非載入空 list。

```python
wl_path = DATA_DIR / "watchlist.json"
if wl_path.exists() and wl_path.stat().st_size > 2:
    saved = json.load(open(wl_path))
    st.session_state.rt_watchlist = saved if saved else DEFAULT_WATCHLIST
else:
    st.session_state.rt_watchlist = DEFAULT_WATCHLIST
```

#### 盤前/盤中/盤後 Smart Refresh

TWSE MIS API 在 **盤後（13:30 以後）** 回傳的是最後一次收盤快照 — `📡 13:30:00` 一直重複同一筆數據，沒有繼續刷新的意義。同樣地，**盤前（09:00 以前）** 回傳的也是前一天的收盤數據。因此應根據台北時間決定是否刷新，並顯示對應狀態提示。

**實作方式 — 側邊欄狀態標示：**

```python
now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
if now_tw.hour < 9:
    st.caption("📡 盤前 — 等待 09:00 開盤")
elif now_tw.hour > 13 or (now_tw.hour == 13 and now_tw.minute >= 30):
    st.caption("📡 盤後 — 自動刷新已暫停")
else:
    st.caption(f"⏳ 每 {interval}s 自動刷新...")
```

**實作方式 — 底部 Auto-Refresh 區塊跳過（最後一行）：**

```python
if hr_auto:
    now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    if now_tw.hour < 9:
        pass  # 盤前不刷新
    elif now_tw.hour > 13 or (now_tw.hour == 13 and now_tw.minute >= 30):
        pass  # 盤後不刷新
    else:
        interval = st.session_state.get('sb_refresh_int', 30)
        time.sleep(interval)
        st.rerun()
```

**時間條件邏輯注意：** 不要用 `now_tw.hour >= 13 and now_tw.minute >= 30` — 這在 `18:24`（hour=18, minute=24）時會錯誤判斷為盤中（因為 `minute=24 < 30`）。正確寫法是 `now_tw.hour > 13 or (now_tw.hour == 13 and now_tw.minute >= 30)`。

#### 自動刷新（固定 2s，無配置介面）

**請注意：TWSE API 限制為每 5 秒 3 個 request** — 但使用 Fugle WebSocket 後不存在此限制，因為 Steamlit 只讀本地檔案。

**使用者偏好（2026-05-05）：** 不想要任何配置開關。固定 2s 刷新，僅盤中執行，無 checkbox、無 interval selector。

```python
# ── 最後一行（必須在 ALL content 之後） ──
if 'rt_watchlist' in st.session_state and st.session_state.rt_watchlist:
    try:
        now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
        if 9 <= now_tw.hour < 14 or (now_tw.hour == 13 and now_tw.minute < 30):
            time.sleep(2)
            st.rerun()
    except Exception:
        pass
```

**時間條件邏輯注意：** 不要用 `now_tw.hour >= 13 and now_tw.minute >= 30` — 這在 `18:24`（hour=18, minute=24）時會錯誤判斷為盤中（因為 `minute=24 < 30`）。正確寫法是：

```python
# ✓ 正確：先排除所有 >13 的 hour
if 9 <= now_tw.hour < 14 or (now_tw.hour == 13 and now_tw.minute < 30):
```

**舊方案（已棄用 — 當使用者仍需要可配置間隔時參考）：**
```python
ac, bc = st.columns([1, 1])
with ac:
    st.checkbox("🔄 自動刷新", value=True, key="sb_auto")
with bc:
    opts = [2, 3, 5, 10, 15, 30, 60]
    st.selectbox("間隔 (秒)", opts, index=opts.index(30),
                 key="sb_refresh_int", label_visibility="collapsed")
```

### 7. Cross-Tab Real-Time Architecture (Sidebar-Led — Tick Accumulation)

**Pattern:** Move real-time monitoring from a single tab to the **sidebar** so data is visible on every tab simultaneously. Use **tick accumulation** (Section 8) instead of snapshot-based history browsing — the user prefers automatic data accumulation over manual snapshot selection.

**Architecture principle:** The sidebar in Streamlit renders on every page/tab. By placing the watchlist and compact stock strip in `with st.sidebar:`, the real-time data persists across all 6 tabs. Tab 6 then shows per-stock plotly charts + scrollable tick tables.

**2026-05-05 簡化：** 側邊欄不再有自動刷新 toggle 和間隔選擇器，固定 2s 刷新。最多 5 檔，按最新成交時間 reverse sort。

```
┌─ Sidebar (visible on ALL tabs) ────────────┐
│ 📡 即時監控                                  │
│ Fugle WebSocket — 有成交才更新               │
│ ✅ WebSocket 連線中                          │
│                                              │
│ 2357 華碩  590.00  590/591  ✕              │
│ 2481 強茂  101.50  101/102  ✕              │
│                                              │
│ 📡 11:05:20                                  │
│ [加入代碼] [+加入]                            │
└──────────────────────────────────────────────┘

┌─ Tab 6: 即時價量追蹤 ───────────────────────┐
│ 累積 N 個數據點                             │
│                                              │
│ [00981A] 29.35 (N 筆 tick) ▼                │ ← expander, sorted by newest ts
│   ├─ Plotly line chart (今日即時走勢)         │
│   └─ Scrollable data table (時間/價格/漲跌) │
│ [2357] 590.00 (N 筆 tick) ▼                 │
```

#### Watchlist Initialization (Session State)

Keep watchlist in `st.session_state` initialized BEFORE the sidebar and tabs:

```python
if 'rt_watchlist' not in st.session_state:
    wl_path = DATA_DIR / "watchlist.json"
    if wl_path.exists() and wl_path.stat().st_size > 2:
        saved = json.loads(wl_path.read_text(encoding='utf-8'))
        st.session_state.rt_watchlist = saved if saved else ["2330", "2344", "4958", "6187"]
    else:
        st.session_state.rt_watchlist = ["2330", "2344", "4958", "6187"]

if 'rt_last_data' not in st.session_state:
    st.session_state.rt_last_data = {}   # {code: {price, change, pct, name, ...}}
    st.session_state.rt_last_ts = "-"
```

#### Data Fetch — Always Fetch on Rerun, Never Cache

The fetch function runs on **every rerun**, not just twice. Data lives in `st.session_state.rt_last_data` and is updated on each pass:

```python
display_data = st.session_state.rt_last_data
if not is_historical and TWSTOCK_OK:
    try:
        raw = fetch_twse_raw(wl)     # always re-fetch
        items = {item['c']: item for item in raw.get('msgArray', [])}
        snapshot = {code: parse_item(item) for code in wl ...}
        st.session_state.rt_last_data = snapshot  # ← update session_state
        display_data = snapshot
        if snapshot_ts != "-":
            save_snapshot(snapshot_ts, snapshot)
    except Exception as e:
        st.caption(f"⚠️ {e}")
```

**關鍵：不要用 `if not display_data:` 條件判斷** — 那會導致首次載入後再也不更新。每次 rerun 都要重新抓取。

⚠️ **CRITICAL PITFALL — Auto-Refresh Blocks Rendering:** The `time.sleep(30); st.rerun()` statement **blocks the entire Streamlit execution** wherever it appears. If placed inside the sidebar or inside any tab, the script will hang there and NO content below that point will render (charts, tables, other tabs all stay blank).

**Correct placement — at the very END of the script, after ALL content (fixed 2s, market hours only):**

```python
# ─── Footer ──────────────────────────────────────
st.divider()
st.caption("📡 資料每日 14:30 自動更新 · 本機掃描 → Git Push → Streamlit Cloud")

# ── Auto-refresh (fixed 2s, market hours only) ────
if 'rt_watchlist' in st.session_state and st.session_state.rt_watchlist:
    try:
        now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
        if 9 <= now_tw.hour < 14 or (now_tw.hour == 13 and now_tw.minute < 30):
            time.sleep(2)
            st.rerun()
    except Exception:
        pass
```

**Wrong placement (will blank out all tabs):**
```python
with st.sidebar:
    # ... content ...
    if is_refreshing:     # ✗ BUG: blocks sidebar, nothing below renders
        time.sleep(30)
        st.rerun()
```

### 8. Tick Accumulation (取代快照式歷史瀏覽)

**使用者明確拒絕快照式（snapshot）歷史瀏覽**（「你新增的這個有點不是我要的」）。不要用下拉選單選時間點看靜態快照。改用 **Tick 累積制**：每次有成交時，daemon 將最新報價以一筆 tick 寫入累積檔，並以圖表 + 可滾動列表呈現。

**2026-05-05 更新：** Tick 資料現在由 **Fugle WebSocket daemon (`realtime_fugle.py`)** 直接寫入。當 `data` 事件觸發且價格變動時，daemon 呼叫 `save_tick()`。不再經由 Streamlit rerun 的 sidear fetch 判斷。

**流程：**
```
Fugle WebSocket Push
  └─ on_message("data") → save_tick()  ← 有成交、價格變了才寫
     └─ realtime_ticks.jsonl (append)
        └─ Streamlit rerun 讀取 → Plotly 圖表
```

#### 資料格式：`realtime_ticks.jsonl`

每行一筆 tick，以股票代碼為 key：

```jsonl
{"code":"2344","ts":"20260504 13:30:00","price":95.4,"change":5.6,"pct":6.24,"vol":15000}
{"code":"2344","ts":"20260504 13:30:30","price":96.2,"change":6.4,"pct":7.11,"vol":18000}
```

#### 儲存函式 (append + cap)

```python
TICK_FILE = DATA_DIR / "realtime_ticks.jsonl"

def save_tick(code, ts, price, change, pct, vol):
    entry = {"code": code, "ts": ts, "price": price,
             "change": round(change, 2), "pct": round(pct, 2), "vol": vol}
    with open(TICK_FILE, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')
    # Cap at 10,000 lines (about 2 full trading days for 7 stocks)
    if TICK_FILE.exists():
        lines = TICK_FILE.read_text(encoding='utf-8').strip().split('\n')
        if len(lines) > 10000:
            TICK_FILE.write_text('\n'.join(lines[-10000:]) + '\n', encoding='utf-8')
```

#### 讀取函式

```python
def load_ticks():
    if not TICK_FILE.exists():
        return []
    lines = TICK_FILE.read_text(encoding='utf-8').strip().split('\\n')
    ticks = []
    for line in lines:
        if line.strip():
            try:
                ticks.append(json.loads(line))
            except:
                pass
    return ticks  # oldest first (insertion order)
```

#### 🎯 「有成交才更新」策略 — Price-Change Detection（取代純 Dedup）

**原則：** 不再是單純的「防重複寫入」，而是「價格變了才寫入」。這實現了使用者要求的「有成交才更新」即時監控模式。

**為何需要：** `time.sleep(N); st.rerun()` 每次 rerun 都會從頭執行 script，側邊欄的資料擷取區塊每次都會再次呼叫 `save_tick()`。但我們更進一步 — 不是比對 timestamp+price 是否重複，而是只比對**價格是否變化**：

- 價格沒變 → 跳過不寫（沒有成交，不需要新 tick 點）
- 價格變了 → 寫入一筆新 tick（有成交了）

```python
def save_tick(code, ts, price, change, pct, vol):
    """Append one tick data point to accumulation file.
    Only writes when price actually changed from last entry for this code."""
    entry = {"code": code, "ts": ts, "price": price,
             "change": round(change, 2), "pct": round(pct, 2), "vol": vol}
    # Skip if price unchanged from last recorded tick for this code
    if TICK_FILE.exists():
        try:
            lines = TICK_FILE.read_text(encoding='utf-8').strip().split('\\n')
            for line in reversed(lines):
                if not line.strip():
                    continue
                try:
                    last = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if last.get('code') != code:
                    continue
                # Found last entry — skip if price unchanged
                if last.get('price') == price:
                    return
                break  # price changed, proceed to write
        except Exception:
            pass  # dedup failure is non-fatal
    with open(TICK_FILE, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\\n')
    # Cap at 10,000 lines
    if TICK_FILE.exists():
        lines = TICK_FILE.read_text(encoding='utf-8').strip().split('\\n')
        if len(lines) > 10000:
            TICK_FILE.write_text('\\n'.join(lines[-10000:]) + '\\n', encoding='utf-8')
```

**效果實測：** 343 行中清除 250 行重複（72%），僅保留 93 筆真正的價格變動 ticks。

#### 開盤自動清空 Tick 資料

使用者在盤後不需要保留前一天的 tick 資料。在**每天 09:00~09:05（開盤瞬間）**，檢查是否有 `_tick_cleared` session state flag，若無則清空 `realtime_ticks.jsonl`：

```python
# 放在 fetch 區塊中，for code in wl: 迴圈之前
now_tw = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
if (now_tw.hour == 9 and now_tw.minute < 5
        and not st.session_state.get('_tick_cleared', False)
        and TICK_FILE.exists()):
    TICK_FILE.write_text('', encoding='utf-8')
    st.session_state._tick_cleared = True
```

這個時間窗口（09:00-09:05）涵蓋了第一次自動刷新的延遲，且只用一次，之後整個 session 不再清除。

#### 在 Sidebar Fetch 中儲存 Tick

每次資料抓取完成後，逐檔個股呼叫 `save_tick()`：

```python
# ... inside the per-stock loop
snapshot[code] = { ... }  # latest snapshot data
if p is not None and snapshot_ts != "-":
    save_tick(code, snapshot_ts, p, change, pct, item.get('v', ''))
```

#### Tab 6 即時價量追蹤（圖表 + 滾動列表）

不要用卡片或表格，改用 **Plotly 線圖 + 可滾動 HTML 表格** 呈現每檔股票的累積 tick 資料。順序照 watchlist（不跳），expander 加 key 保留折疊狀態：

```python
all_ticks = load_ticks()

for code in wl:  # 照 watchlist 順序，不跳
    stock_ticks = [t for t in all_ticks if t['code'] == code]
    
    with st.expander(f"{code} {name} — {price_str} ({tick_count} 筆 tick)",
                     key=f"tab6_exp_{code}"):  # ← 關鍵：key 保留展開/折疊狀態
        # 1. Line chart
        df_tick = pd.DataFrame(stock_ticks)
        df_tick['time_only'] = df_tick['ts'].str.split(' ').str[-1]
        df_tick['price_f'] = pd.to_numeric(df_tick['price'], errors='coerce')
        
        fig = px.line(df_tick, x='time_only', y='price_f', ...)
        st.plotly_chart(fig, width='stretch')
        
         # 2. Scrollable data table (newest on top via .iloc[::-1])
        df_display = df_tick[['ts', 'price', 'vol']].copy().iloc[::-1]  # ← 時間倒序
        df_display['ts'] = df_display['ts'].str.split(' ').str[-1]
        df_display['price'] = df_display['price'].apply(
            lambda x: f"{float(x):.2f}" if x else '-')
        df_display['vol'] = df_display['vol'].apply(
            lambda x: f"{int(float(x)):,}" if x and x != '-' else '-')
        df_display.columns = ['時間', '價格', '成交量']  # Fugle 無昨收
        
        st.markdown(f"""
        <div style="max-height:300px;overflow-y:auto;border:1px solid #333;border-radius:8px;margin-top:8px;">
        {df_display.to_html(index=False, classes='rt-table', escape=False)}
        </div>
        """, unsafe_allow_html=True)
```

| 元件 | 用途 | 
|------|------|
| `st.expander(...)` | 個股折疊面板，預設展開 |
| `px.line()` | Plotly 即時走勢線圖 |
| `<div style="max-height:300px;overflow-y:auto">` | 可滾動容器，「超過這個看板用下拉可以拉」 |
| `.to_html(classes='rt-table')` | 套用已有 CSS `.rt-table` 樣式 |

#### 與快照制比較

| 面向 | 快照制 (已棄用) | Tick 累積制 (建議) |
|------|-----------------|-------------------|
| 儲存單位 | 全體清單快照 `{ts, stocks:{...}}` | 單一股票 tick `{code, ts, price, ...}` |
| 瀏覽方式 | 下拉選單選時間點 | 線圖 + 滾動列表 |
| 資料粒度 | 整批快照 (每 30 秒一筆) | 單檔 tick (每 30 秒每檔一筆) |
| 適合情境 | "我想回看 13:30 的整體狀況" | "我想看 2344 從開盤到現在怎麼走" |
| 資料檔 | `realtime_history.jsonl` (500 lines) | `realtime_ticks.jsonl` (10,000 lines) |

#### 🔄 無成交時保留上次價格（Price Persistence Fallback）

當 TWSE API 回傳不包含某支股票（尚未被 API 納入），或 `z` 欄位為 `"-"`（開盤後尚未有第一筆成交），程式不應讓該股票從畫面消失或顯示 `-`。應保留上次已知價格，確保 watchlist 中的所有股票一直可見。

**實作 — 在 per-stock loop 中加入 fallback：**

```python
for code in wl:
    item = items.get(code)
    # Fallback: if no data from API, keep last known price
    fallback = st.session_state.rt_last_data.get(code, {})
    if not item:
        if isinstance(fallback, dict) and fallback.get('price') is not None:
            snapshot[code] = fallback
        continue
    p = fmt_price(item.get('z'))
    # If API returned '-' (no trade yet), keep last price & update name
    if p is None and isinstance(fallback, dict) and fallback.get('price') is not None:
        snapshot[code] = {**fallback, 'name': item.get('n', fallback.get('name', ''))}
        continue
    # ... normal price computation ...
```

**關鍵邏輯：**
1. API 完全沒回傳該股票 → 保留 `rt_last_data` 中的全部舊資料
2. API 回傳了但 `z` 是 `"-"` → 保留價格，僅更新名稱（API 可能更新了名稱）
3. API 有價格 → 正常計算漲跌並更新 snapshot

**注意：** `st.session_state.rt_last_data = snapshot` (L262) 每次 rerun 都**完全取代**舊的 snapshot。所以若一支股票連續 N 次都沒資料，fallback 仍會從上一次的有效 snapshot 保留價格。

For the sidebar, render each stock as a slim row (not a full card) — code, name (truncated), price, colored percentage, with an inline ✕ delete button.

⚠️ **不要用 chips 按鈕**（`st.columns(5)` 一排 `✕ 00981A`）— 使用者明確表示這樣「醜」。改用 inline ✕ 按鈕整合在每列資料最右邊（詳見上方「側邊欄 Watchlist 管理」章節）。

Old pattern (已棄用), do NOT use:

```python
for code, d in (display_data or {}).items():
    if isinstance(d, dict):
        sign = '+' if d.get('change', 0) >= 0 else ''
        color = '#ff1744' if d.get('change', 0) >= 0 else ('#00c853' if d.get('change', 0) < 0 else '#e0e0e0')
        price_str = f"{d['price']:.2f}" if d.get('price') is not None else '-'
        pct_str = f"{sign}{d.get('pct', 0):.2f}%" if d.get('pct') is not None else '-'
        st.markdown(
            f"<div style='display:flex;justify-content:space-between;font-size:0.85rem;"
            f"padding:4px 0;border-bottom:1px solid #222'>"
            f"<span><b>{code}</b> {d.get('name','')[:6]}</span>"
            f"<span style='color:{color};font-weight:600'>{price_str} {pct_str}</span>"
            f"</div>",
            unsafe_allow_html=True
        )
```

### 9. Institutional Flow Tab (法人動向)

A specialized tab for tracking **三大法人買賣超** (institutional net buy/sell) data. Reads from SQLite `institutional_flows` table and visualizes daily rankings, cumulative trends, and multi-institution consensus.

#### Data Export: `export_institutional()`

The dashboard runs on Streamlit Cloud and consumes pre-exported JSON files. Add a dedicated export function alongside your main `export_all()`:

```python
def export_institutional(db_path, output_dir):
    """Export institutional flow data for dashboard."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    
    latest_date = conn.execute("SELECT MAX(date) FROM institutional_flows").fetchone()[0]
    all_dates = conn.execute("SELECT DISTINCT date FROM institutional_flows ORDER BY date").fetchall()
    date_list = [r['date'] for r in all_dates]
    
    # 1) Per-date top 15 buy/sell (last 30 days)
    daily_records = []
    for d in date_list[-30:]:
        rows = conn.execute("""
            SELECT f.*, COALESCE(i.name, f.code) as name
            FROM institutional_flows f
            LEFT JOIN stock_info i ON f.code = i.code
            WHERE f.date = ?
        """, (d,)).fetchall()
        records = [dict(r) for r in rows]
        top_buy = sorted(records, key=lambda x: x['total_net'], reverse=True)[:15]
        top_sell = sorted(records, key=lambda x: x['total_net'])[:15]
        daily_records.append({
            'date': d,
            'buy': [{'code': r['code'], 'name': r['name'],
                     'total_net': r['total_net'], 'foreign_net': r['foreign_net'],
                     'trust_net': r['trust_net'], 'dealer_net': r['dealer_net']} for r in top_buy],
            'sell': [{'code': r['code'], 'name': r['name'],
                      'total_net': r['total_net'], 'foreign_net': r['foreign_net'],
                      'trust_net': r['trust_net'], 'dealer_net': r['dealer_net']} for r in top_sell],
        })
    
    # 2) Today's top 50 buys + top 50 sells (for stock search & ranking)
    today_buys = conn.execute("""
        SELECT f.*, COALESCE(i.name, f.code) as name
        FROM institutional_flows f LEFT JOIN stock_info i ON f.code = i.code
        WHERE f.date = ? AND f.total_net > 0
        ORDER BY f.total_net DESC LIMIT 50
    """, (latest_date,)).fetchall()
    today_sells = conn.execute("""
        SELECT f.*, COALESCE(i.name, f.code) as name
        FROM institutional_flows f LEFT JOIN stock_info i ON f.code = i.code
        WHERE f.date = ? AND f.total_net < 0
        ORDER BY f.total_net ASC LIMIT 50
    """, (latest_date,)).fetchall()
    from itertools import chain
    today_data = [dict(r) for r in chain(today_buys, today_sells)]
    
    # 3) Recurring presence (stocks appearing in top 15 buy list over N days)
    for period, label in [(5, "5d"), (10, "10d"), (20, "20d")]:
        recent = date_list[-period:] if len(date_list) >= period else date_list
        code_appearances, code_names = {}, {}
        for d in recent:
            rows = conn.execute("""
                SELECT f.code, COALESCE(i.name, f.code) as name, f.total_net
                FROM institutional_flows f LEFT JOIN stock_info i ON f.code = i.code
                WHERE f.date = ?
            """, (d,)).fetchall()
            recs = [dict(r) for r in rows]
            top_buy = sorted(recs, key=lambda x: x['total_net'], reverse=True)[:15]
            for r in top_buy:
                c = r['code']
                code_appearances[c] = code_appearances.get(c, 0) + 1
                code_names[c] = r['name']
        sorted_codes = sorted(code_appearances.items(), key=lambda x: x[1], reverse=True)[:20]
        cum_data = [{'code': c, 'name': code_names.get(c, c),
                     'appearances': n, 'period_days': len(recent)}
                    for c, n in sorted_codes]
        write_json(output_dir / f"institutional_recurring_{label}.json", cum_data)
    
    write_json(output_dir / "institutional_daily.json", daily_records)
    write_json(output_dir / "institutional_today.json", today_data)
```

#### JSON File Structure

| File | Content |
|------|---------|
| `institutional_today.json` | Top 50 buys (total_net > 0, DESC) + Top 50 sells (total_net < 0, ASC). Fields: code, name, total_net, foreign_net, trust_net, dealer_net, date |
| `institutional_daily.json` | Last 30 days: each day has `buy: [...]` and `sell: [...]` (top 15 each) |
| `institutional_recurring_5d.json` | Stocks in top 15 buy list over 5d: `{code, name, appearances, period_days}` |
| `institutional_recurring_10d.json` | Same, over 10 days |
| `institutional_recurring_20d.json` | Same, over 20 days |

#### Dashboard Tab Structure

Organize with sub-tabs for clear hierarchy:

```python
with st.tabs([...])[6]:  # 7th tab
    # ── Overview KPIs ──
    col1, col2, col3, col4 = st.columns(4)
    # 涵蓋檔數 | 前10買超總和 | 前10賣超總和 | 買超王
    
    sub_t1, sub_t2, sub_t3 = st.tabs(["📗 買超排行", "📕 賣超排行", "🔁 三法人分歧度"])
```

#### Pattern: Institutional Breakdown Table

Use HTML tables for colored buy/sell values. Always split into individual institution columns.

⚠️ **Key data handling**: The JSON has buys first (positive → DESC), then sells (negative → ASC). Always filter explicitly — never use `.tail()`.

#### Pattern: Three-Institution Consensus (分歧度)

Find stocks where ≥2 institutions buy simultaneously. Score 0-3. Display: `'★' * score` (3★ = ✅ all buying).

#### Pattern: Cumulative Tracking (連續買超頻率)

Show appearance frequency in top 15 buy list over N days with visual bar: `"🟥" * n + "⬜" * (period - n)`. Switch between 5d/10d/20d via `st.radio`.

#### Pattern: Stock Search + History Chart

Search by code, show 4 metrics (total/foreign/trust/dealer), plus a Plotly bar chart from `institutional_daily.json` showing the stock's buy/sell history: red bars for buys, green for sells.

## Pitfalls

- **Empty results at startup**: Guard every query with `if not results: st.info("尚無資料")` before trying to render charts.
- **Reasons is a JSON string**: Parse with `json.loads()` before displaying. Guard against `None` or invalid JSON.
- **change_pct may be 0 or NaN**: When formatting display values, use `f"{x:+.2f}%" if pd.notna(x) else "-"`.
- **Left join with stock_info**: `industry` may be empty string for stocks not in stock_info table. Use `COALESCE(i.industry, '')` in SQL.
- **Streamlit port conflicts**: Run each dashboard on a different port (8501, 8502, etc.). Use `--server.headless=true` for WSL/headless environments.
- **`__import__()` 無 `silent` 參數**: 檢查套件安裝用 `try/except ImportError`，不要用 `__import__('twstock', silent=True)`（Python 內建不接受 keyword arg）。
- **Startup Script Pattern**: For local-only use (not Streamlit Cloud), create a `start.sh` that kills stale processes and launches the dashboard in one command. Handles both foreground and background modes. Add a bash alias (`alias stock='~/project/start.sh -b'`) for one-word launch. Note: the alias won't be available in the same terminal session until `source ~/.bashrc` is run.
- **Cross-directory import for dashboard app.py**: When `app.py` lives in the project root and helpers live in `src/` (without `__init__.py`), use `sys.path.insert(0, ...)` to import modules: `sys.path.insert(0, str(Path(__file__).resolve().parent / 'src'))`. Without this, `from backtest import BacktestEngine` raises `ModuleNotFoundError`.
- **Streamlit empty label warning**: `st.text_input("", placeholder="", label_visibility="collapsed")` 觸發 `label got an empty value`。改 `text_input("隱藏標籤", placeholder="...", label_visibility="collapsed")`。
- **Fugle WebSocket 無 `y`（昨收）欄位**: sidebar 無法顯示漲跌%，改顯示 `bid/ask`。若需漲跌%需額外查詢昨收。
- **Dual-source 同步**: daemon 寫 `latest.json`，Streamlit 讀。daemon 未啟動時 fallback 到 twstock。勿讓兩者同時寫入同一檔案。
- **Stock name 需有 fallback**: `code_map` 來自 `stock_codes`（掃描資料），每日 14:00 才更新。盤中若掃描未跑，`code_map` 是空的，側邊欄名稱會消失。**必須**準備硬編碼的 fallback 對照表：
  ```python
  FALLBACK_NAMES = {"2330": "台積電", "2344": "華邦電", "2357": "華碩", ...}
  return code_map.get(code) or FALLBACK_NAMES.get(code, "")
  ```
- **Cached data staleness**: `@st.cache_data(ttl=30)` is appropriate for scan data — scan_history only changes once per day at most.
- **`use_container_width=True` deprecated** (Streamlit >=1.56): Replace with `width='stretch'`. The deprecation warning prints on every re-render until fixed.
- **twstock `get()` vs `get_raw()` distinction**: `twstock.realtime.get(stocks)` drops the `y` (yesterday close) field through its internal `_format_stock_info()`. Use `twstock.realtime.get_raw(stocks)` instead — it returns the raw API JSON with `y` preserved, has built-in retry, and handles both TSE and OTC symbols automatically. No manual `requests` needed.
- **ETF codes contain letters**: Codes like `00981A`, `00982A` are valid TWSE ETF codes. Never use `code.isdigit()` as an input validator — it silently rejects these.
- **Empty saved watchlist file**: A `watchlist.json` with content `[]` (saved by user clearing all items) will cause `json.load()` to return `[]`, bypassing the default. Check `st_size > 2` before reading, or check if the loaded list is empty and fallback to defaults.
- **Card layout replaces table for real-time**: Users explicitly prefer individual cards (`st.columns(3)` + `st.markdown(html)`) over `st.dataframe()` for real-time monitoring. The table view is perceived as "像報表，不適合看盤" (looks like a report, not good for monitoring).
- **`else:` branch deletion indent trap**: When removing an `else:` branch (e.g. `if not TWSTOCK_OK: ... else:`), the formerly-indented code stays indented under the `if` block, silently becoming conditional on the `if` condition being false. Always manually de-indent the code to the parent level after deleting `else:`. Run a syntax check or re-read the file to catch this.
- **`>2` watchlist empty check fragility**: `st_size > 2` works for `[]` (2 bytes) but reads an empty file `st_size == 0` as missing. Use `st_size > 0 and json.load(...)` instead, or handle `[]` explicitly.
- **TWSE API after-hours static snapshot**: After 13:30 (market close), the API returns the same `📡 13:30:00` data on every request. Don't waste requests refreshing — add time-aware auto-stop logic.
- **Time condition for market-hours check**: Don't use `now_tw.hour >= 13 and now_tw.minute >= 30`. At 18:24 this evaluates to `True and False = False` (incorrectly treated as market-open). Use `now_tw.hour > 13 or (now_tw.hour == 13 and now_tw.minute >= 30)`.
- **Runtime data files in .gitignore**: `realtime_ticks.jsonl`, `realtime_history.jsonl`, and `watchlist.json` are volatile runtime files that should NOT be committed to git. Add `data_output/realtime_*.jsonl` and `data_output/watchlist.json` to `.gitignore`. The daily scan output JSON files (daily_summary.json, recent_scans.json, etc.) SHOULD be committed as they're the data source for Streamlit Cloud deployment.
- **Port conflict on restart**: Killing Streamlit processes with `pgrep -f streamlit` then starting a new one often fails with `Port 8501 is not available` because the old process is still releasing the port. Use `fuser -k 8501/tcp` to forcefully free the port, then wait 1-2 seconds before starting the new instance.
- **`streamlit: command not found` after background start**: Running `streamlit run app.py` via terminal tool's `background=true` often fails because the shell doesn't load the venv. Two solutions:
  - **Preferred (simpler for background):** `./venv/bin/streamlit run app.py --server.port 8501` — direct path to the venv binary, no subshell sourcing needed.
  - **Alternative:** `source venv/bin/activate && streamlit run app.py --server.port 8501` — works but requires a shell that handles sourcing correctly in the background context.
  Verify with `curl -s -o /dev/null -w "%{http_code}" http://localhost:8501` after a few seconds.
- **Starting multiple streamlit instances**: When running several dashboards simultaneously, start each as a separate background process on distinct ports (8501, 8502, etc.). Confirm port binding with `ss -tlnp | grep <port>` — both IPv4 and IPv6 listeners should appear for a healthy streamlit process.
