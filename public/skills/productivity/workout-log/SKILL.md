---
name: workout-log
description: 記錄用戶的重訓日誌 — 動作名稱、重量、組數×次數。支援跨 session 的進度追蹤。
version: 1.0.0
platforms: [linux]
metadata:
  hermes:
    tags: [fitness, workout, training, gym, tracking]
    category: productivity
---

# 🏋️ 重訓日誌記錄

## 觸發條件

用戶提及以下關鍵詞時觸發：
- 重訓、健身、重量、練、gym、workout
- 開始報數字（「chest press 90」、「背 75 15下」等）
- 「記錄今天的訓練」、「記一下」+ 運動名

## 記錄格式

### 用戶輸入模式

用戶典型的輸入模式是分段給資料：

```
Chest Press
90
4組 各12 12 10 9下
```

→ 解析為：Chest Press, 90kg, 4 sets × [12, 12, 10, 9] reps

或者一行式：
```
Back Extension 75 15下, 89 15下, 96 13下, 96 12下
```

### Memory 儲存格式

跨 session 參考用，存入 memory 的結構化字串：

```
User YYYY-MM-DD 重訓紀錄: (1) Chest Press 90kg x 12/12/10/9 (4 sets). (2) Back Extension: 75x15, 89x15, 96x13, 96x12.
```

- 每個動作用編號 `(1)` `(2)` 區隔
- 重量與次數之間用 `x` 或 `:` 區隔
- 不同組次數用 `/` 分隔
- 若各組重量不同，逐組標註：`75x15, 89x15, 96x13, 96x12`

### 顯示格式

對用戶回報用表格：

```
| 動作 | 重量 | 組×次數 |
|------|:----:|:--------:|
| 🏋️ Chest Press | 90kg | 12 / 12 / 10 / 9 |
| 📐 Back Extension | 75→89→96→96kg | 15 / 15 / 13 / 12 |
```

- emoji prefix 幫助識別動作類型
- 重量欄若各組不同顯示 range（最小值→最大值）
- 表格後加上總組數統計（如「共 4 個動作、16 組」）

## 動作命名慣例

保持用戶原始用詞，不要翻譯。常見：
- Chest Press（胸推）
- Back Extension（背伸展）
- Core Seated Rowing Machine（坐姿划船）
- V Crunch（V字捲腹）
- Deadlift / Squat / Bench Press / Shoulder Press / Lat Pulldown

## 漸進追蹤

同一動作在不同日期出現時，比較重量變化：

```
- 2026-05-07: Chest Press 90kg x 12/12/10/9
- 2026-05-14: Chest Press 92.5kg x 12/12/11/10 ✅ +2.5kg
```

若有明顯進步（重量上升 or 次數增加），標註 ✅ 鼓勵。

## 注意事項

- **不假設單位** — 用戶說的數字預設為 kg，若無明確標示不額外追問
- **不問「還有嗎」超過兩次** — 用戶給完自然會停，不需要一直催
- **每完成一個動作就更新 memory** — 用 replace 更新完整紀錄，避免累積未存的 data loss
- **保留原始用詞** — 用戶說「Core Seated Rowing Machine」就照記，不要中譯
- **重量漸增策略** — 若用戶同一動作的組間重量遞增（如 75→89→96），是刻意設計，不需提示「重量不一致」
