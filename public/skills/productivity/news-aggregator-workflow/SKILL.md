---
name: news-aggregator-workflow
description: Direct Fetch 新聞彙整 workflow（TWSE API + UDN RSS），不走 Browser
---

# 新聞彙整 workflow

## 觸發場景
每日新聞彙整 cron job（job_id: 8f24b825d028），或其他需要即時台股+新聞資料的任務。

## 核心原則
1. **Direct Fetch 優先**，不走 Browser（Browser 在 cron 環境不穩定）
2. Script 失敗 → `exit 1`，不回假資料給 LLM
3. 有真實資料才交付，LLM 只能引用 Script 數據，不得捏造

## Script 資料來源（news_aggregator_task.py）

### TWSE 台股數據
- URL: `https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date={YYYYMMDD}&type=MS&response=json`
- 解析：`tables[].title` 含「大盤統計資訊」的那個 block
- 資料狀態判斷：`stat == "OK"` 才取用

### UDN 經濟日報 RSS
- URL: `https://money.udn.com/rssfeed/news/1001`
- 解析：`<item>` 區塊，正規表達式抽出 `<title>` + `<link>`

### 其他來源（可選，需 API key）
- GNews: `https://gnews.io/api/v4/search?q={kw}&lang=zh&country=tw&max=5&token={key}`
- NewsData.io: `https://newsdata.io/api/1/news?q={kw}&language=zh&apiKey={key}`

## Failover 邏輯
- 任一來源失敗 → 繼續其他來源
- **全部失敗** → `print("[ERROR] ...")` + `sys.exit(1)`
- LLM 看到 `exit 1` 視為無資料，不生成假報告

## 數據驗證
- TWSE: `stat == "OK"` 且 `len(data) > 0`
- RSS: `len(items) > 0`
- HTTP 429/503: 等 3 秒 retry，最多 2 次
- 其他 HTTP error: 直接 None，不重試

## 執行時間與 Provider 注意事項（重要）
- **MiniMax API 在早高峰時段反覆出現 Connection error**，確認案例：
  - 4/25 08:48, 4/26 07:31, 4/27 07:31、08:31, 5/1 08:31 均失敗
  - 即使將排程調到 08:30 後仍不可靠（5/1 08:31 再次失敗）
- **建議直接換 Provider**，不建議保留 MiniMax：
  - ✅ **OpenRouter + deepseek/deepseek-v4-flash** — 經實測可穩定運行
  - 若 OpenRouter credit 不足，可備用本地模型（LocalGemma4 經 LM Studio）
- 排程時間建議維持 08:30 以後（TWSE 前一日資料已就緒）

## 參考文件
- `references/minimax-connection-error-history.md` — MiniMax 早高峰 Connection error 完整歷史記錄與時間軸

## 日期注意事項
- TWSE 平日 15:00 後才有當日資料
- 週六/日抓的是最近一個交易日（仍以 `date=YYYYMMDD` 指定）
- 抓昨天：`datetime.now() - timedelta(days=1)`
