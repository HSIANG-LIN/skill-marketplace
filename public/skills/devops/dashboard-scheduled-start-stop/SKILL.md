---
name: dashboard-scheduled-start-stop
description: 為 Streamlit / Web Dashboard 設定定時開關排程，使用 no_agent=True 純腳本運行，零 token 消耗
category: devops
trigger: 用戶想讓某個 web app 定時自動開關（如盤前開、收盤關）
---

# Dashboard 定時啟停排程

為 Streamlit 或其他 Web Dashboard 建立 13:30 開 / 22:00 關的定時排程，完全不走 LLM token。

## 步驟

### 1. 建立啟動腳本 → `~/.hermes/scripts/<name>_start.sh`

```bash
#!/bin/bash
# <Project Name> - 定時啟動
PORT=<PORT>
PID=$(ss -tlnp 2>/dev/null | grep ":$PORT" | grep -oP 'pid=\K[0-9]+')

if [ -n "$PID" ]; then
    echo "✅ <Project> 已在運行 (pid=$PID)"
    exit 0
fi

cd <PROJECT_DIR>
nohup <VENV>/bin/streamlit run app.py --server.port "$PORT" > /tmp/<project>_dashboard.log 2>&1 &
sleep 5

PID=$(ss -tlnp 2>/dev/null | grep ":$PORT" | grep -oP 'pid=\K[0-9]+')
if [ -n "$PID" ]; then
    echo "✅ <Project> 已啟動 → http://localhost:$PORT (pid=$PID)"
else
    echo "❌ 啟動失敗，請檢查 /tmp/<project>_dashboard.log"
    exit 1
fi
```

### 2. 建立關閉腳本 → `~/.hermes/scripts/<name>_stop.sh`

```bash
#!/bin/bash
# <Project Name> - 定時關閉
PORT=<PORT>
PID=$(ss -tlnp 2>/dev/null | grep ":$PORT" | grep -oP 'pid=\K[0-9]+')

if [ -z "$PID" ]; then
    echo "ℹ️ <Project> 不在運行中"
    exit 0
fi

kill $PID 2>/dev/null
sleep 2

if ps -p $PID > /dev/null 2>&1; then
    kill -9 $PID 2>/dev/null
    echo "⚠️ 強制終止 <Project> (pid=$PID)"
else
    echo "✅ <Project> 已關閉 (pid=$PID)"
fi
```

### 3. 賦予執行權限

```bash
chmod +x ~/.hermes/scripts/<name>_start.sh ~/.hermes/scripts/<name>_stop.sh
```

### 4. 建立 cron job（no_agent=True）

**啟動排程（13:30）：**

```bash
hermes cron create \
  --name "<project>-start" \
  --schedule "30 13 * * *" \
  --no-agent \
  --script <name>_start.sh
```

**關閉排程（22:00）：**

```bash
hermes cron create \
  --name "<project>-stop" \
  --schedule "0 22 * * *" \
  --no-agent \
  --script <name>_stop.sh
```

> 使用 `no_agent=True`，排程直接跑 shell script 不經 LLM，零 token 消耗。`deliver=local` 不發送通知，純機械執行。

## 實際案例：Stock Scanner

- 專案目錄：`~/workspace/hermes_project/stock_scanner`
- Venv：`./venv/bin/streamlit`
- Port：`8503`
- 腳本：`stock_start.sh` / `stock_stop.sh`
- 時間：13:30 開 → 22:00 關

## 注意事項

- `ss -tlnp` 檢查 port 佔用，確保 pid 抓取正確
- `nohup` + `sleep 5` 等 streamlit 完全啟動再回報
- 同一 port 已有 process 時不重複啟動
- 關閉先 graceful kill，失敗才強制 kill -9