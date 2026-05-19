---
name: wsl-windows-agent-troubleshooting
description: Workflow for deploying, diagnosing, and fixing Python agents on Windows that communicate with a WSL2-hosted FastAPI server — covering dependency verification, path mismatches, agent lifecycle, and stale state cleanup.
---

# WSL ↔ Windows Agent Deployment & Troubleshooting

## When to Use

Use this skill when:
- A Windows Python agent isn't connecting to its WSL2/Linux server
- You need to verify Windows-side dependencies, config, or agent process from WSL
- A benchmark tool (Cinebench, 3DMark, etc.) installation path doesn't match what the agent expects
- The server has stale/stuck jobs (pending/running) from prior crashes or test runs
- An agent was running but stopped or is showing "idle" on the server
- Setting up a new agent machine that needs to talk to an existing server
- Resuming the system after a restart (machine reboot, Hermes restart, or server crash) — need to recall project state, restart server, launch agent, and verify the pipeline
- A job is stuck in "running" state but the agent process has exited (e.g., agent was launched from WSL and couldn't complete a GUI benchmark)

## Prerequisites

- WSL2 running on the same machine as the Windows agent
- Windows filesystem accessible via `/mnt/c/`
- Python 3.x installed on Windows (check with `/mnt/c/Users/$USER/AppData/Local/Programs/Python/Python*/python.exe`)

## Workflow

### Phase 1 — Check Current State

1. **Is the server running?** Inside WSL:
   ```bash
   curl -s http://localhost:8000/api/v1/jobs | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f\"  {j['id'][:8]:<10} tool={j['tool']:<18} status={j['status']:<10} dut={j['dut_id']}\") for j in data.get('jobs',[])]"
   ```

2. **Is the agent registered and online?**
   ```bash
   curl -s http://localhost:8000/api/v1/duts 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f\"  {d['id']:<20} status={d['status']:<10} last_seen={str(d.get('last_seen',''))[:19]:<20} tool={d.get('current_tool') or '-'}\") for d in data.get('duts',[])]"
   ```
   - `online` + recent `last_seen` = agent is alive
   - `idle` with old `last_seen` = agent stopped
   - No entry = agent never registered (or config mismatch)

3. **Check Windows-side agent directory:**
   ```bash
   ls -la /mnt/c/Users/$USER/Desktop/bench_agent/
   ```

4. **Check agent config** — verify api_key matches server config:
   ```bash
   python3 -c "import json; cfg=json.load(open('/mnt/c/Users/$USER/Desktop/bench_agent/config.json')); print(cfg)"
   ```

### Phase 2 — Verify Dependencies & Agent Integrity

1. **Check Python version on Windows:**
   ```bash
   /mnt/c/Users/$USER/AppData/Local/Programs/Python/Python312/python.exe --version
   ```

2. **Verify all agent dependencies are installed** (use ASCII-safe output for CP950):
   ```bash
   /mnt/c/Users/$USER/AppData/Local/Programs/Python/Python312/python.exe -c "
   import sys
   for p in ['wmi','psutil','requests','mss','PIL','watchdog','pystray']:
       try:
           __import__(p); print(f'  {p}: OK')
       except Exception as e: print(f'  {p}: FAIL - {type(e).__name__}')
   "
   ```

3. **Test all agent module imports** (without running the main loop):
   ```bash
   /mnt/c/Users/$USER/AppData/Local/Programs/Python/Python312/python.exe -c "
   import sys; sys.path.insert(0, r'C:\Users\$USER\Desktop\bench_agent')
   for mod in ['hw_collector','uploader','screenshot','preflight','job_runner']:
       try:
           __import__(mod); print(f'{mod}: OK')
       except Exception as e: print(f'{mod}: {e}')
   "
   ```

4. **Check compiled cache** — presence of `.pyc` files indicates successful import:
   ```bash
   ls /mnt/c/Users/$USER/Desktop/bench_agent/__pycache__/
   ```

### Phase 3 — Fix Path Mismatches

When benchmark tools install to a different location than the agent expects (e.g., fallback path vs Program Files):

1. Identify actual install location:
   ```bash
   find /mnt/c/Users/$USER/Desktop/ -name "Cinebench.exe" 2>/dev/null
   ```

2. Patch the `job_runner.py` TOOL_CONFIG path:
   ```bash
   python3 -c "
   from hermes_tools import patch
   patch(mode='replace',
         path='/mnt/c/Users/$USER/Desktop/bench_agent/job_runner.py',
         old_string=r'\"exe\": r\"C:\\\Program Files\\\Maxon Cinebench R23\\\Cinebench.exe\"',
         new_string=r'\"exe\": r\"C:\\\Users\\\YOUR_USER\\\Desktop\\\bench_agent\\\tools\\\CinebenchR23\\\Cinebench.exe\"')
   "
   ```
   Or use the `patch` tool with `mode=replace` directly.

3. **Verify the path was updated:**
   ```bash
   grep -n "Cinebench.exe" /mnt/c/Users/$USER/Desktop/bench_agent/job_runner.py
   ```

### Phase 4 — Clean Up Stale Server State

After server restarts or test runs, stale `pending` and `running` jobs accumulate.

**Option A: Selective cleanup** (preserve job history, only clear stuck items):
```python
import sqlite3
from datetime import datetime, timezone

db = sqlite3.connect('/path/to/bench.db')
db.row_factory = sqlite3.Row

# Delete all pending (never executed)
cursor = db.execute("DELETE FROM job_queue WHERE status='pending'")
deleted = cursor.rowcount

# Mark stale running jobs (running > 60 min = server restart zombie)
# NOTE: Jobs stuck running for only a few seconds (agent exited mid-run) won't be caught by this!
cursor = db.execute("SELECT id, started_at FROM job_queue WHERE status='running'")
for r in cursor:
    if r['started_at']:
        started = datetime.fromisoformat(r['started_at'].replace('Z', '+00:00'))
        age = (datetime.now(timezone.utc) - started).total_seconds() / 60
        if age > 60:
            db.execute("UPDATE job_queue SET status='done', finished_at=datetime('now'), error_message='stale (server restart)' WHERE id=?", [r['id']])

db.commit()
db.close()
print(f"Cleaned: {deleted} pending deleted, stale running marked done")
```

**Option B: Full hard reset** (after agent crash / server restart — wipe everything, let scheduler rebuild):
```python
import sqlite3, os, shutil

# Locate the DB (colocated with bench_server/main.py)
bench_dir = os.path.expanduser("~/workspace/autobenchmarksystem/bench_server")
db_path = os.path.join(bench_dir, "bench.db")
data_dir = os.path.join(bench_dir, "data")

conn = sqlite3.connect(db_path)
# Wipe all transient tables — scheduler will recreate jobs when agent reconnects
for t in ["job_queue", "benchmark_runs", "benchmark_results",
           "upload_queue", "vision_queue", "hw_snapshots", "hw_change_log"]:
    conn.execute(f"DELETE FROM {t}")
# Reset DUT to offline (current_tool is computed by the API, not stored as DB column)
conn.execute("UPDATE duts SET status='offline', last_seen=NULL")
conn.commit()
conn.close()
print("DB tables cleared, DUTs reset to offline")

# Also clean screenshot/data directory
if os.path.exists(data_dir):
    shutil.rmtree(data_dir)
    os.makedirs(data_dir)
    print(f"{data_dir}/ cleaned")
```

### Phase 5 — Restart Server

If the WSL2 server process died:

```bash
cd ~/workspace/autobenchmarksystem/bench_server
../venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

**Always start uvicorn from inside `bench_server/`** — imports (`from db import ...`, `from routers import ...`) are relative to that directory. Starting from the parent dir causes `ModuleNotFoundError: No module named 'db'`.

Use `terminal(background=true)` or `nohup` so server persists in background.

After restart, the job scheduler runs every **60 seconds** (hardcoded `asyncio.sleep(60)` in `job_scheduler.py`). If a DUT has already registered but no jobs appear, wait up to 60s for the first scheduler tick before assuming anything is broken. Query progress with:

```bash
# Check DUT registration and current tool
curl -s http://localhost:8000/api/v1/duts | python3 -c "import sys,json; d=json.load(sys.stdin)['duts']; [print(f\"{x['id']:<24} status={x['status']:<8} tool={x.get('current_tool') or '-'}\") for x in d]"
# Check job queue
curl -s http://localhost:8000/api/v1/jobs | python3 -c "import sys,json; [print(f\"{j['id']:<10} {j['tool']:<18} {j['status']:<10}\") for j in json.load(sys.stdin)['jobs']]"
```

### Phase 6 — Start the Agent

The agent **must be started from a native Windows terminal** (cmd or PowerShell), since it uses Windows-only modules (`wmi`, `mss`, `ctypes.windll`, `pystray`):

```cmd
cd C:\Users\USER\Desktop\bench_agent
python agent.py
```

**You CAN launch from WSL** for quick testing (registers, polls, and receives jobs), BUT benchmark tools with GUIs (Cinebench, etc.) will fail to execute properly — the process exits without completing the job, leaving it stuck in `running` state on the server. Only use WSL launch for connectivity/registration checks.

The agent will:
1. Collect hardware via WMI and register with server
2. Show a system tray icon (pystray) — keep terminal window open
3. Send heartbeats every 10s
4. Poll for pending jobs every 3s
5. Run benchmark tools automatically when assigned

**Resume-after-restart checklist:**
1. `session_search(limit=3)` — recall what project state was before restart
2. `ls ~/workspace/autobenchmarksystem/` — verify project exists
3. `curl -s http://localhost:8000/api/v1/jobs` — check for stale jobs (clean them per Phase 4 if needed)
4. `ls /mnt/c/Users/$USER/Desktop/bench_agent/` — verify Windows agent files intact
5. Restart server (Phase 5) → wait for log output → start agent (Phase 6)

## Agent Lifecycle Reference

```
Agent Start → Registration → Heartbeat Loop ─┬─ Poll Loop ──┬─ Pick Job → Ack → Run → Report
                                               │              └─ (idle → wait 3s)
                                               ├─ Upload Retry (every 30s)
                                               └─ Anti-Idle (mouse wiggle every 60s)
```

Common status transitions:
- `idle` → waiting for a job
- `running` → executing a benchmark (sets `status` in heartbeat)
- If the agent window closes: server marks as `idle` after missed heartbeats

## Cinebench R23 CLI Reference (Headless/Automated)

Cinebench R23 accepts command-line arguments **without `--` prefix**, passed directly as positional args:

| Argument | Effect |
|----------|--------|
| `g_CinebenchAllTests=true` | Run all tests (single + multi core) sequentially |
| `g_CinebenchCpu1Test=true` | Single core test only |
| `g_CinebenchCpuXTest=true` | Multi core test only |
| `g_CinebenchMinimumTestDuration=<seconds>` | Minimum test duration (default runs longer) |

Windows example:
```cmd
start /b /wait "parentconsole" Cinebench.exe g_CinebenchAllTests=true g_CinebenchMinimumTestDuration=10
```

**Common mistake**: Using `--` prefix (like `--g_Cinebench...`) or typos (`Cinench` vs `Cinebench`) causes the arguments to be silently ignored, and Cinebench either shows the **Maxon Console** launcher instead of running the benchmark, or runs the full-length default benchmark (~10 min per test).

**Zip extraction must preserve directory structure**: Cinebench R23's zip has Cinebench.exe at the root, with `resource/`, `corelibs/`, and `cb_ranking/` as subdirectories. If files are moved from subdirs to root (e.g., via buggy extraction code that "flattens" the structure), Cinebench crashes with:
```
CRITICAL: error open: file:///.../resource/UnicodeData.txt error: Couldn't open file.
CRITICAL: Duplicate definition for net.maxon.interface.runloop
```
Always use plain `zipfile.ZipFile.extractall()` — do NOT flatten or rearrange subdirectory contents.

**Troubleshooting the Maxon Console**: If Cinebench launches a console/launcher window instead of running the benchmark, check that:
1. CLI arguments have no `--` prefix
2. Spelling is correct (`Cinebench` not `Cinench`)
3. The `g_CinebenchAllTests=true` or specific test flag is present
4. The ZIP was extracted correctly (check `resource/UnicodeData.txt` exists)

**Process locking on Windows**: Cinebench.exe or other process may hold file locks preventing deletion/rename from WSL (`rm: cannot remove: Input/output error`, Windows error 32). Solutions:
- Kill the process: `subprocess.run(['taskkill', '/f', '/im', 'Cinebench.exe'])`
- Check for lingering python.exe processes: `tasklist /fi "IMAGENAME eq python.exe"`
- If deletion fails, extract to a NEW directory path instead of overwriting
- Don't use `/mnt/c/` to delete locked files; use Windows Python with `subprocess.run(f'rmdir /s /q \"{dir}\"', shell=True)`

**Choosing which tests to run**: For automated/headless testing:
- `g_CinebenchCpuXTest=true` — multi-core only (faster, ~10s with minimum duration)
- `g_CinebenchCpu1Test=true` — single-core only
- `g_CinebenchAllTests=true` — both (runs sequential, takes longer)
- `g_CinebenchMinimumTestDuration=<seconds>` — minimum per test (default runs the full ~10 min benchmark)

## Reference Files

- `references/windows-cookie-to-wsl-auth.md` — Extract browser cookies from Windows Chrome/Edge to authenticate CLI tools in WSL2 (twitter-cli, gh CLI, etc.).

## Pitfalls

- **CP950 encoding**: Windows Traditional Chinese cmd/PowerShell can't print emoji or Unicode symbols. Use ASCII-safe output (`[OK]`, `[FAIL]`) when running on Windows.
- **Path inconsistency**: `install_tools.ps1` may install to fallback path (`Desktop\\bench_agent\\tools\\`) instead of `Program Files\\` if not run as Administrator. Always verify the actual path afterwards.
- **Server DB persistence**: On server restart, asyncio background tasks (scheduler, vision worker) restart fresh, but the SQLite DB persists old state. Clean stale jobs after restart.
- **Multi DUT entries**: The same machine may appear as multiple DUT entries with different `dut_id` prefixes (e.g., `AA1200614-PC` vs `DUT-AA1200614-PC`). Check `config.json` to see which one the agent is using.
- **Test data pollution**: `test_comm.py` and `test_communication.py` register fake DUTs and jobs. Don't confuse these with real agent registrations.
- **Agent status "idle" vs "online"**: The agent sends `_status` verbatim in heartbeats. By default `_status = "idle"`, but the job scheduler queries `WHERE d.status='online'`. This causes registered agents to appear connected but never receive jobs. Fix: change `_status = "idle"` to `_status = "online"` in `agent.py`, update the post-job-completion status from `"idle"` to `"online"`, and add `"online"` to the pystray color map with the same green value.
- **Tool in AUTO_TOOLS but missing from TOOL_CONFIG = infinite loop**: If a tool is listed in the server's `AUTO_TOOLS` (in `bench_server/services/job_scheduler.py`) but has no `TOOL_CONFIG` entry in the agent's `job_runner.py`, the agent will loop infinitely: pick up job → `"Unknown tool: <tool>"` → fail → job goes back to pending → agent picks it up again immediately. Fix: either add the tool to `TOOL_CONFIG` in `job_runner.py`, or remove it from `AUTO_TOOLS` in `job_scheduler.py`. After fixing, also clean the stuck jobs from the DB and restart the server.
- **Cinebench structure corruption**: The Cinebench R23 zip has `resource/`, `corelibs/`, and `cb_ranking/` as subdirectories at the root level. Any extraction code that "flattens" subdirs (moves files up) will cause `CRITICAL: Couldn't open file` errors and the benchmark won't start. Always use `extractall()` without modification.
- **Screenshot uploads without progress = tool not really running**: If the agent continuously uploads screenshots (every ~50s) but the job never completes and the `error_message` stays at a low "running for Xs" value, the benchmark tool likely launched the wrong UI (e.g., Maxon Console instead of the actual benchmark). Check command-line arguments for typos or wrong format. Close the errant console window and restart the agent with corrected args.
- **Agent launched from WSL = half-functional**: The agent will register, poll, and receive jobs, but cannot complete GUI-based benchmarks (Cinebench, etc.) because there's no Windows desktop session attached to the WSL-launched Python process. The job stays stuck in `running` state forever. Use native Windows cmd for real runs; only use WSL launch for quick connectivity checks.\n- **Server startup directory**: The server imports (`from db import ...`, `from routers import ...`, `from services import ...`) are relative to the `bench_server/` directory. Always start uvicorn from within that directory: `cd bench_server && uvicorn main:app --host 0.0.0.0 --port 8000`. Starting from parent dir fails with `ModuleNotFoundError: No module named 'db'`.
- **Venv naming**: The project's virtual environment may be at `venv/` not `.venv/`. Always verify before sourcing: `find <project_root> -name "activate" -path "*/bin/activate"`.
