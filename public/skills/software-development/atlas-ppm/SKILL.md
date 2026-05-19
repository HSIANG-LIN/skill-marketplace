---
name: atlas-ppm
description: APPM (Atlas-Parallel Project Management) — AI Agent 的並行專案記憶管理系統，解決 session 重置後失憶、Context 溢出、專案混淆等問題。適用於多專案並行開發場景。
category: software-development
---

# APPM: Atlas-Parallel Project Management

## 1. 簡介

APPM 是一套專為 AI Agent 設計的「並行專案記憶管理系統」，透過在專案目錄下建立標準化的 `.openclaw/` 快照，讓 Agent 能在數秒內恢復意識，實現無縫的並行開發。

## 2. 核心痛點

- **重複解釋的地獄**：每次 `/new` session 都要重新解釋專案架構，浪費時間與 Token
- **Context 溢出與失憶**：Context 窗口有限，塞太多歷史對話既昂貴又低效
- **並行專案混淆**：同時多專案時，Agent 常將 A 的邏輯套用到 B
- **Agent 漂移**：缺乏 Single Source of Truth，Agent 偏離原始設計

## 3. 核心特色

### 雙軌開發者通道 (Dual-Track Initialization)
- **標準通道 (Standard Track)**：適合計畫明確的開發，快速建立 `.openclaw/` 結構
- **模糊通道 (Vague Channel)**：適合靈感雛形階段，AI 顧問式訪談協助釐清專案輪廓

### 動態權重定錨系統 (Dynamic Weight Anchor System)
- 自動根據對話關鍵字頻率增加權重
- 結合時間衰減機制 (Decay)
- 實現「開機即定錨」，Agent 無需提問即可恢復最活躍專案意識

### 重啟反射 (Reboot Reflection)
- 解決 `/new` session 後的失憶與單向停訊問題
- 透過 `atlas_bootstrap.py` 在開機時自動執行「定錨回報」
- 確保 Agent 首條訊息即具備專案意識

### 零 Context 切換成本
- `MISSION.md` + `SNAPSHOT.md` 讓 Agent 秒懂專案背景

## 4. 工具組

| 腳本 | 功能 |
|------|------|
| `scripts/appm_recall.py` | 啟動時執行，彙報權重最高的前三個專案脈絡 |
| `scripts/appm_update_weights.py` | 背景動態更新權重，處理 hit 與 decay |
| `scripts/appm_init_dual.py` | 雙軌初始化腳本 |
| `atlas_bootstrap.py` | 開機自動定錨腳本 |

## 5. 目錄結構

```
.openclaw/           # 專案快照根目錄
  MISSION.md         # 專案使命與目標
  SNAPSHOT.md        # 最新進度快照
  WEIGHT.md          # 動態權重記錄
scripts/
  appm_recall.py
  appm_update_weights.py
  appm_init_dual.py
templates/           # 初始化模板
```

## 6. 使用情境

適合以下場景：
- 同時管理多個複雜 AI 開發專案
- 需要多個 Agent 並行開發
- 頻繁新建 session 但不想每次重新解釋專案
- 工廠/機構有多 tool 需同步測試（如 Auto Test System）

## 7. 取得方式

- GitHub: `https://github.com/hanchunlee/Atlas-Parallel-Project-Management`
- 作者: `hanchunlee`
- 目前 3 stars，0 forks
