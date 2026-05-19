---
name: restaurant-dashboard
description: 管理 Smith 的個人美食地圖 Dashboard — 連結路由 + 地圖管理 + 待看清單
version: 2.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [restaurant, food, map, dashboard, leaflet, github-pages, watchlist]
    category: productivity
---

# 🍽️ 餐廳美食地圖 Dashboard + 連結路由器

## 系統概覽

```
用戶丟連結
    │
    ▼
用 browser_navigate 確認內容
    │
    ├─ 是餐廳/美食 ──→ pending.json ──→ cron 24:00 ──→ restaurants.json → GitHub Pages
    │
    ├─ 是有趣內容  ──→ 摘要提取 ──→ ~/.hermes/watchlist.md（統一看完再讀）
    │                              └─→ http://localhost:8512（Watchlist Dashboard）
    │
    └─ 明顯無關    ──→ 跳過，不回報
```

## 資料位置

| 項目 | 路徑 |
|------|------|
| Dashboard 目錄 | `~/workspace/hermes_project/restaurant-dashboard/` |
| 前端 | `index.html` (Leaflet) |
| 正式資料庫 | `restaurants.json` |
| 待處理佇列 | `pending.json` |
| 批次處理腳本 | `batch_process.py` |
| 本地備用 server | `server.py` (port 8788) |
| 待看清單（原始資料） | `~/.hermes/watchlist.md` |
| **Watchlist Dashboard** | **`http://localhost:8512`** — Streamlit 瀏覽器，支援日期/標籤搜尋過濾 |
| Watchlist Dashboard 腳本 | `~/.hermes/scripts/watchlist_dashboard.py` — parse markdown + 深色主題卡片渲染 |
| Watchlist 啟動/停止腳本 | `~/.hermes/scripts/watchlist_dashboard_start.sh` / `watchlist_dashboard_stop.sh` |
| Watchlist 啟動 cron | `watchlist-dashboard-start` — 07:30 daily (no_agent) |
| Watchlist 停止 cron | `watchlist-dashboard-stop` — 22:00 daily (no_agent) |
| GitHub Repo | `https://github.com/HSIANG-LIN/restaurant-dashboard` (public) |
| GitHub Pages | `https://hsiang-lin.github.io/restaurant-dashboard/` |

## 連結路由器 — 用戶貼連結時的處理流程

### Step 1: 判斷是否為餐廳/美食

用 `browser_navigate` 確認內容。美食關鍵詞：
餐廳、美食、餐館、小吃、咖啡廳、cafe、restaurant、菜單、menu、訂位、
水餃、冰品、烘焙、早午餐、老店、鐵道旅行（內含美食）、Google Maps 商家頁面、美食部落格

**已知美食 IG 帳號**：`harollfoodmap`、`littlenado`、`yong90128`、`newnew.food`、`mooni.eateat`、`1000cc_ig` — 他們發的幾乎都是餐廳。

若明顯不是（新聞、技術文、娛樂、政治等），直接跳過不回報。

### Step 2a: 餐廳/美食 → 存入 pending.json

**不 geocode、不直接寫入 restaurants.json**。只存佇列：

```json
{
  "pending": [
    {
      "name": "等日初",
      "url": "https://www.instagram.com/reel/DV8EpxUku4T/",
      "address": "宜蘭縣壯圍鄉壯濱路四段388巷25號二樓",
      "notes": "海景第一排咖啡廳，落地窗看龜山島 by yong90128",
      "captured_at": "2026-04-30T09:45:00+08:00"
    }
  ]
}
```

回報：「🍽️ 已排入佇列，今晚 24:00 批次處理」

### Step 2b: 非美食但有趣 → 存入待看清單

對於 Threads、X/Twitter、一般文章連結：

1. 用 `browser_navigate` 獲取內容
2. Threads：優先讀 `og:description`，若無則嘗試 regex 匹配 JSON 區塊中的 `"text":"..."`。回退方案見舊 `threads-link-summarizer` skill。
3. X/Twitter：用 `browser_navigate`，免登入可看推文文字
4. 寫入 `~/.hermes/watchlist.md`（append 模式）：

```markdown
## 2026-04-30 — @來源帳號

**連結：** {url}

**摘要：** {1-2句摘要}

**標籤：** #待看 #{平台}
```

回報：「📌 已加入待看清單」

### 處理「一篇多店」的貼文

當 caption 包含多個餐廳（如「北台灣鐵道一日小旅行」列出 7 家）：
1. 識別列表格式（數字編號 1. 2. 3. 或 • • •）
2. **逐一擷取每家店的名稱與地址**
3. 為每一家店建立獨立 pending entry
4. 每家店的 `url` 指向同一篇原始貼文
5. `notes` 標註出處（如「鐵道小旅行 by littlenado」）

## 批次處理（半夜 cron）

### Cron Job
- 名稱：「美食地圖批次處理」
- Schedule: `0 0 * * *`（每天 24:00）
- Job ID: `8803a1d0c9d6`
- Workdir: `~/workspace/hermes_project/restaurant-dashboard/`
- 執行內容：`python3 batch_process.py`

### batch_process.py 做的事
1. 讀取 `pending.json`
2. 對每個 pending entry 進行 Nominatim geocode（含遞進降級）
3. 跳過重複 URL（比對 `restaurants.json`）
4. 寫入 `restaurants.json`
5. 清空 `pending.json`
6. `git commit` + `git push` 到 GitHub（自動觸發 Pages build）

### 地理編碼細節

**Nominatim 降級策略**（台灣門牌覆蓋率低）：
- Level 1: 完整地址
- Level 2: 街道路名（去掉門牌號）
- Level 3: 區域名（「新北市雙溪區」）

**Nominatim 坑**：
- 必須帶 `User-Agent` header，否則 HTTP 400
- 中文必須先 URL-encode（`urllib.parse.quote()`）
- rate limit ~1 req/sec

## 回報格式

| 情境 | 回報 |
|------|------|
| 餐廳/美食 | `🍽️ 已排入佇列，今晚24:00批次處理` |
| 非美食有趣內容 | `📌 已加入待看清單` |
| 一篇多店 | 表格列出所有店名 + `（以上已排入佇列）` |
| 跳過 | 不回報 |

## 前端特徵（index.html）

### 地區篩選下拉選單
- 搜尋框下方新增 `<select id="city-filter">`
- 載入時由 `getCityList()` 動態填入城市選項
- 選擇某城市 → 側欄只顯示該區餐廳 + 地圖只顯示該區 pin + auto-fit bounds
- 預設值為「🏙️ 全部地區」

### Google Maps 導航連結
每間餐廳都有兩個地方可以一鍵導航：

**地圖 popup**：
```
🔗 查看原文  🗺️ Google 導航
```

**側欄列表**：
```
💬 備註  🔗 連結  🗺️ 導航
```

URL 格式：`https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`

### 城市分類（禁止寫死）
Header 動態顯示：`<span id="cities">` 由 `getCities()` 填充。

核心函數 `extractCity(addr)` 用正則解析地址中的縣市：
```javascript
function extractCity(addr) {
  const m = (addr || '').match(/([臺台紐新桃苗中彰投雲嘉南高屏宜花東澎金連]..?[北市縣鄉鎮區])/);
  return m ? m[1] : null;
}
```

### 地圖初始視角（禁止只釘第一間）
```javascript
// ✅ 正確
const group = L.featureGroup(markers.map(m => m.marker));
map.fitBounds(group.getBounds().pad(0.15));

// ❌ 錯誤
// map.setView([allRestaurants[0].lat, allRestaurants[0].lng], 14);
```

### 底層架構
- Leaflet + CartoDB dark tiles
- 自訂 divIcon marker（圓形 + 🍽）
- 顏色依 index 從調色盤循環：`#e94560, #f5a623, #4ecdc4, #6c5ce7, ...`
- 側欄：搜尋過濾 + 城市下拉 + 餐廳列表
- 所有邏輯在單一 `index.html`（純靜態，無外部 JS 依賴）

## 注意事項
- 重複 URL 檢查：比對 `restaurants.json` + `pending.json` 兩邊
- Instagram 免登入可看 caption 文字，但影片/圖片無法解析
- 非美食連結 → `~/.hermes/watchlist.md`，不進地圖
- 完全無關直接跳過，不需告知用戶
- push 由 cron 自動處理，不需手動
- 緊急手動 push：`git push https://$GITHUB_TOKEN@github.com/HSIANG-LIN/restaurant-dashboard.git master`（推完恢復 clean remote URL）
- **前端改完一定驗證**：curl HTTP 200 + 瀏覽器確認地圖 pin 正確
