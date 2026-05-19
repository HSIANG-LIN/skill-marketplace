---
name: cron-mechanical-jobs
category: devops
description: Create no-agent cron jobs that run shell scripts without LLM cost — start/stop services, cleanup tasks, health checks, and any fully deterministic operation.
---

# cron-mechanical-jobs

Create cron jobs that run pure shell scripts with **zero token consumption** using `no_agent=true`. The script's stdout/stderr is captured and delivered — no LLM is invoked.

## When to Use

Mechanical cron jobs are for operations that need **no reasoning** — just execute and report:

| Good Fit | Bad Fit |
|---|---|
| Start/stop a local web service | Generate a market summary report |
| Clean up temp files / rotate logs | Analyze scan results |
| Health check → webhook if unhealthy | Research a topic and write an article |
| Back up a database | Answer a user's question on a schedule |
| Run a data-fetch script that saves to disk | Transform data that needs interpretation |

## How to Create

### Step 1: Write the Script

Place scripts in `~/.hermes/scripts/`. Keep them simple:

```bash
#!/bin/bash
PORT=8503
PID=$(ss -tlnp 2>/dev/null | grep ":$PORT" | grep -oP 'pid=\K[0-9]+')
if [ -n "$PID" ]; then
    echo "✅ Already running (pid=$PID)"
    exit 0
fi
cd /home/user/project && nohup ./venv/bin/streamlit run app.py --server.port "$PORT" > /tmp/app.log 2>&1 &
sleep 3
echo "✅ Started → http://localhost:$PORT"
```

Make it executable: `chmod +x ~/.hermes/scripts/myscript.sh`

### Step 2: Create the Cron Job

```bash
cronjob(
    action='create',
    name='my-job-name',
    schedule='30 13 * * *',
    script='myscript.sh',
    no_agent=true
)
```

Key parameters:
- `script`: path relative to `~/.hermes/scripts/` (searched there first) OR absolute path
- `no_agent=true`: **critical** — this is what skips the LLM
- `deliver`: `'local'` saves to `~/.hermes/cron/output/<job_id>/`; `'origin'` sends to chat gateway
- `schedule`: standard cron syntax

### Step 3: Verify

```bash
cronjob(action='list')         # check the job was created
cronjob(action='run', name='my-job-name')  # test immediately
# Then check output:
ls -lt ~/.hermes/cron/output/<job_id>/
cat ~/.hermes/cron/output/<job_id>/<latest>
```

## Script Patterns

### Start a Web Service (graceful)

```bash
#!/bin/bash
PORT=8503
PID=$(ss -tlnp 2>/dev/null | grep ":$PORT" | grep -oP 'pid=\K[0-9]+')
if [ -n "$PID" ]; then
    echo "✅ Already running (pid=$PID)"
    exit 0
fi
cd /path/to/project
nohup ./venv/bin/streamlit run app.py --server.port "$PORT" > /tmp/app.log 2>&1 &
sleep 5
PID=$(ss -tlnp 2>/dev/null | grep ":$PORT" | grep -oP 'pid=\K[0-9]+')
if [ -n "$PID" ]; then
    echo "✅ Started → http://localhost:$PORT (pid=$PID)"
else
    echo "❌ Failed — check /tmp/app.log"
    exit 1
fi
```

### Stop a Web Service (graceful → force)

```bash
#!/bin/bash
PORT=8503
PID=$(ss -tlnp 2>/dev/null | grep ":$PORT" | grep -oP 'pid=\K[0-9]+')
if [ -z "$PID" ]; then
    echo "ℹ️ Not running"
    exit 0
fi
kill $PID 2>/dev/null
sleep 2
if ps -p $PID > /dev/null 2>&1; then
    kill -9 $PID 2>/dev/null
    echo "⚠️ Force killed (pid=$PID)"
else
    echo "✅ Stopped (pid=$PID)"
fi
```

## Verification Best Practices

1. After creating, run a manual test: `cronjob(action='run', name='...')`
2. Check the output file content, not just `last_status`
3. If the script sends its own notifications (Discord webhook, Telegram, etc.), verify independently

## Pitfalls

- **`no_agent=true` must be set when creating** — it cannot be updated after creation via `cronjob(action='update', ...)` currently. Delete and recreate if you forgot it.
- **Converting agent → no_agent**: When converting an existing agent-based job to no_agent, prefer delete + recreate over update. `cronjob(action='update', no_agent=true, script='...')` works but leaves the old prompt in the job record — if you later convert back, the stale prompt may cause confusion. Clean slate is safer.
- **Script path**: Hermes searches `~/.hermes/scripts/` first, then your home directory, then absolute paths. Relative paths without `~/.hermes/scripts/` may not resolve. Use absolute paths for safety.
- **Detect-before-start**: Always check if the service is already running (via port/PID) to avoid duplicate processes.
- **Graceful-kill-then-force**: Kill with SIGTERM first, wait 2s, then SIGKILL if still alive. Never SIGKILL immediately.
- **Logging**: Redirect output to a log file (`>/tmp/app.log 2>&1 &`) so you can debug failures.
- **Port collision**: If multiple services share a port, the PID check may match the wrong process. Use a unique port per service.