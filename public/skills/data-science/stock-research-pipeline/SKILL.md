---
name: stock-research-pipeline
description: 台股個股深度研究 Pipeline — 針對單一標的自動生成完整研究報告（財報/營收/法人流/技術面/估值/訊號）
trigger: 當使用者要求對某個台股代碼進行深度研究、研究報告、基本面分析時
---

# 個股深度研究 Pipeline

針對掃描亮點標的（如巧新 1563），自動生成結構化研究報告，包含：
- 基本資料（股名、產業、現價）
- 月營收趨勢（近 6 月營收 + 月增率）
- 財務亮點（近季 EPS、毛利率、營益率、淨利率）
- 法人動向（近 10 日三大法人買賣超）
- 技術面（MA5/10/20/60、漲跌幅、量比）
- 估值（本益比、股價淨值比、殖利率）
- 綜合訊號（正面訊號 + 風險提示）

## 使用方式

```bash
cd ~/workspace/hermes_project/stock_scanner
source venv/bin/activate

# 生成報告
python src/main.py research 1563    # 巧新
python src/main.py research 2330    # 台積電
python src/main.py research 4904    # 遠傳

# JSON 輸出（供程式調用）
python src/research_pipeline.py 1563 --json
```

## 模組位置

- `src/research_pipeline.py` — 主模組（ResearchPipeline class + format_report）

## 資料源

| 資料 | API |
|------|-----|
| 即時報價 | TWSE MIS API（`mis.twse.com.tw`） |
| 月營收 | FinMind `taiwan_stock_month_revenue` |
| 財報 | FinMind `taiwan_stock_financial_statement` |
| 法人流 | SQLite `institutional_flows` 表（盤後更新） |
| 股價 | SQLite `stock_prices` 表（FinMind 快取） |
| 估值 | FinMind `taiwan_stock_per_pbr` |

## 注意事項

- 法人動向資料來自 `institutional_flows` 表，需先跑過盤後掃描才有資料
- 本益比偏高（>30）或偏低（<10）會自動標註風險/正面訊號
- 訊號規則在 `ResearchPipeline._generate_signals()` 中定義，可依需求調整閾值
- Stock info（股名/產業）來自 DB `stock_info` 表
