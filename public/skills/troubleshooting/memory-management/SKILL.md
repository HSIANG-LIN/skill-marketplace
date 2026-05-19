---
name: memory-management
description: Keep Hermes memory under 80% capacity. When to clean, what to remove, practical workflow.
---

# Memory Management

## 核心原則

**永遠保持記憶低於 80% capacity（1,760/2,200 chars）。** 高於 80% 就主動清理，不要等到被卡住。

## 主動卸載：使用 activeContext.md

對於跨 session 的專案，不要在 memory 裡存完整進度。改用 **project-root/activeContext.md** 做為狀態追蹤文件，memory 只存一則短指針。

### 做法

1. **在專案根目錄建立 `activeContext.md`**，包含：
   - 當前階段與完成狀態
   - 技術上下文（root dir, venv, port, last commit）
   - 活躍決策（pending 選項 + 選擇狀態）
   - 快速啟動指令
2. **memory 裡只存這條**：
   ```
   專案狀態已移至 activeContext.md
   ```
3. **每次 session 啟動時自動讀取**該檔（已內建慣例，memory 有對應規則）

### 哪些東西該卸載

| 留在 memory | 卸載到 activeContext.md |
|------------|------------------------|
| GitHub Token、Discord 頻道 ID、系統級 config | 各專案的進度、策略清單、Cron 排程 |
| 跨專案的慣例規則 | 專案架構、檔案結構、技術決策 |
| 使用者個人偏好 | 待辦事項、pending 決策 |

### 哪些專案適合

任何有跨 session 工作的專案都該建立 activeContext.md：
- Benchmark 系統
- 股票掃描器
- 個人 Dashboard
- 複雜的開發專案

## Post-Change 備份審計流程

完成重大修改後（擴充資料、重構架構、新增功能），執行一次備份審計：

### 審計清單

```bash
# 1. 檢查所有專案的 git 狀態
for dir in ~/benchmaster ~/workspace/hermes_project/*/ ~/scenic-spots-dashboard; do
  echo "=== $(basename $dir) ==="
  cd "$dir" && git status --short && git log origin/main..HEAD --oneline 2>/dev/null
done

# 2. 確認 hermes-memory 備份已 push
cd ~/.hermes/hermes-memory
git status
git push origin main

# 3. 檢查 hermes 核心資產備份狀態
#    ~/.hermes/skills/  — 無 git 備份，重大災難時需手動還原
#    ~/.hermes/config.yaml
```

### 待辦優先級

| 項目 | 備份狀態 | 建議 |
|------|---------|------|
| 專案 (benchmaster, stock-scanner, etc.) | ✅ GitHub | 確認 commit 已 push |
| activeContext 備份 (hermes-memory) | ⚠️ 每日 00:00 複製 + git push | 確認 remote 最新 |
| Hermes skills (~/.hermes/skills/) | ❌ 無遠端備份 | 偶爾手動 tar 或加入 hermes-memory |
| Hermes config (~/.hermes/config.yaml) | ❌ 無遠端備份 | 含 API keys，不適合公開備份 |

### 觸發時機

- 擴充了大量資料（如 30→50 景點）
- 重構了核心邏輯
- User 主動提「看看有沒有要備份的」
- 跨多個 session 的專案工作完成後

## 備份機制：hermes-memory repo

activeContext.md 只活在 local disk，需要備份保護。使用一個集中的 private GitHub repo：

- **Repo:** `hermes-memory` (private, GitHub)
- **路徑:** `~/.hermes/hermes-memory/`
- **結構:**
  ```
  hermes-memory/
  ├── README.md
  └── projects/
      ├── benchmaster/activeContext.md
      ├── stock_scanner/activeContext.md
      └── ...
  ```
- **同步 Script:** `~/.hermes/scripts/sync-hermes-memory.sh`
- **排程:** 每日 00:00 (crontab，非 Hermes cronjob — 只是 git push 不需要 agent)
- **Log:** `~/.hermes/logs/sync-hermes-memory.log`

出問題時還原：
```bash
git clone https://github.com/HSIANG-LIN/hermes-memory.git
# 把對應的 activeContext.md 放回專案根目錄
```

## 何時清理

- 每次任務完成後，檢查記憶用量
- 對話開始時如果已經 >80%，先清理再繼續
- 長期專案記錄（如股票、任務狀態）完成後及時移除

## 清理優先順序

1. **過期資料**（不同天的重複記錄，只留最新）
2. **一次性任務結果**（完成後可刪除）
3. **已被新資訊取代的舊條目**（例如專案更新後，舊的架構描述）
4. **已卸載到 activeContext.md 的條目**（移至 activeContext 後立刻從 memory 刪除）

## 實務做法

每次 `memory` tool 返回 `usage: XX%` 時，用眼睛掃一遍：
- 超過 80% → 立刻刪 3-5 筆舊的
- 超過 90% → 刪到低於 70% 再繼續

## 不要留的東西

- 股票/價格等時效性很強的 raw data（留一筆結論就好，不要留過程）
- 一次性的查詢結果
- 已被取代的計畫版本
- 已被 activeContext.md 涵蓋的專案狀態（見卸載策略）

## 範例：卸載專案狀態

```
情景：Stock Scanner 原先在 memory 裡有 2 條（策略 + 過濾規則），佔 ~400 chars。
做法：
  1. 在 ~/workspace/hermes_project/stock_scanner/ 建立 activeContext.md
  2. 將策略清單、過濾規則、Cron 排程全部寫入該檔
  3. 從 memory 刪除那 2 條
  4. memory 只留一則簡短指針
結果：memory 節省 ~400 chars，同時狀態更完整且可備份
```

記住：**記憶是用來存「對未來有價值的事」，不是用來存「過去發生過的事的完整紀錄」。**
