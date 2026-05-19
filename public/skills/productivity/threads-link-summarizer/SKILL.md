---
name: threads-link-summarizer
description: 當用戶丟 Threads 連結時，爬取內容、摘要並存入待看清單
---

# Threads 連結彙整 workflow

⚠️ **注意：此 skill 已被整合至 `restaurant-dashboard` 的連結路由器。**
Threads 連結現在統一走路由系統，摘要存入 `~/.hermes/watchlist.md`（共用待看清單）。
此 skill 保留作為參考，新流程請見 `restaurant-dashboard` skill。

## 觸發條件（保留文檔參考）
用戶丟出任何 Threads 連結（`threads.com` 或 `threads.net` 結尾）

## 執行流程

### Step 1：抓取內容
使用 `curl` 對 Threads URL 發送請求，從 HTML 中解析：

**優先讀取 `og:description`（OG Meta tag）：**
```
og:description → 文章摘要
og:title → 作者名稱
og:image → 附圖（如有）
```

**解析正則表達式：**
```python
# og:description
re.search(r'<meta property="og:description" content="([^"]+)"', html)

# og:title
re.search(r'<meta property="og:title" content="([^"]+)"', html)
```

### Step 2：存入清單
路徑：`~/.hermes/watchlist.md`（統一待看清單）

格式：
```markdown
## {日期} — {作者}

**連結：** {url}

**摘要：** {og:description 內容或從 HTML 推斷的主要文字}

**標籤：** #待看 #Threads
```

### Step 3：回覆用戶
用繁體中文簡述：
- 作者
- 主要內容（1-2句）
- 存入待看清單

## 注意事項
- Threads 有 anti-bot，curl 可能拿到 JS-heavy HTML
- 若 `og:description` 為空或過短，嘗試從頁面中正則匹配 `"text":"..."` 區塊
- 若完全抓不到，回覆「無法抓取此 Threads 內容，請確認公開存取權限」
- 不依賴 browser tool，直接 curl

## 清單管理
- 檔案：`~/.hermes/watchlist.md`（統一待看清單）
- 每次寫入使用 append 模式，不覆蓋既有內容
- 日期格式：`YYYY-MM-DD`
