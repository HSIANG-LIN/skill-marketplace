---
name: hermes-telegram-conflict-debug
description: Debug Telegram polling conflict when Hermes gateway fails to connect to Telegram bot
version: 1.0.0
author: Hermes Agent
tags: [hermes, telegram, debugging, gateway]
---

# Hermes Telegram Polling Conflict 處理流程

## 症狀
`hermes gateway status` 顯示 gateway 正常運行，但日誌出現：
```
WARNING gateway.platforms.telegram: [Telegram] Telegram polling conflict (1/3)
Error: Conflict: terminated by other getUpdates request; make sure that only one bot instance is running
```

## 確診步驟

### 1. 確認有幾個程式連線到 Telegram
```bash
ss -tnp | grep "149.154.166.110:443"
```
- PID 3349 是你的 hermes-gateway
- 如果有其他程式（常見：`openclaw-gateway`、`nightcity`、或其他 python bot）也連到同一位址，就是衝突源

### 2. 確認其他 bot 的身份
```bash
cat /proc/<PID>/cmdline | tr '\0' ' ' && echo
ps aux | grep <PID>
```

### 3. 列出所有可能的 bot 程式
```bash
ps aux | grep -iE "hermes|openclaw|nightcity|bot|python.*gateway" | grep -v grep
```

## 解決方案

### 方案 A：停用衝突的程式
```bash
kill <PID>                    # 建議先嘗試正常終止
hermes gateway restart
sleep 8
hermes gateway status        # 確認重啟後衝突消失
```

### 方案 B：永久停用 systemd 管理的 bot（如 openclaw-gateway）
```bash
# 暫時停用（這次）
systemctl --user stop openclaw-gateway
kill <PID>

# 永久停用（下次開機也不會回來）
systemctl --user disable openclaw-gateway
```

### 方案 C：變更 bot token
如果需要同時跑兩個獨立的 Telegram bot，在 config 裡設定不同的 token。

## 驗證修復
```bash
# 確認只剩一個程式連線到 Telegram
ss -tnp | grep "149.154.166.110:443"

# 檢查 agent.log 最新狀態
tail -20 ~/.hermes/logs/agent.log

# 預期看到
# INFO gateway.platforms.telegram: [Telegram] Connected to Telegram (polling mode)
# INFO gateway.run: ✓ telegram connected
```

## 陷阱
- `grep telegram` 在 Windows 系統日誌（WebView2 cache）會撈到大量不相關的記錄，別被誤導
- 真正的衝突源一定是另一支也呼叫 Telegram Bot API 的程式，網路層 `149.154.167.x` 是特徵
- PID 在不同 restart 後會改變，每次都要重新確認
- `kill -9` 可能趕不走被 systemd 管理的程式，用 `systemctl --user stop` 會更乾淨
- 如果衝突雙方沒有同時存在但衝突仍發生，試 `hermes gateway restart` 強迫重新建立 polling session（對方殘留的 long-polling 連線有時需要 server 端超時才會釋放）
- `journalctl --user -u hermes-gateway -n 30 --since "HH:MM"` 可看指定時段後的 log，比 `tail` 更精準