---
name: cron-job-troubleshooting
category: devops
description: Workflow for diagnosing and resolving cron job failures — HTTP 429, connection errors, model config issues, and silent failures.
---
# cron-job-troubleshooting

Workflow for diagnosing and resolving cron job failures — including HTTP rate limits, API connection errors, model caching issues, and silent failures where `last_status: ok` but output is broken.

## Trigger Conditions
- Cron job logs show `HTTP 429`, `Connection error`, `RESOURCE_EXHAUSTED`, `timeout`, or `API call failed`.
- User reports "not receiving results" from a scheduled task.
- `last_status: ok` but user says output is missing or broken.

## Troubleshooting Steps

### 0. Check If the Gateway Was Running at All (🟢 #1 silent failure: agent was down)
**Before assuming a cron job bug, verify the agent/gateway was alive when the job was scheduled.**

If the machine (Windows/WSL) was shut down or the Hermes gateway wasn't restarted, cron jobs silently fail — they simply never execute. The `last_run_at` stays at the previous run date.

#### Squash it fast:
```bash
hermes gateway status          # Check if gateway is running NOW
```
Compare `last_run_at` in `cronjob(action='list')` against the expected schedule — if it's yesterday's date, the gateway was down.

#### Root cause: Windows shutdown kills WSL2
- Windows shutdown → WSL2 terminates → Hermes Gateway dies → scheduler stops ticking
- Cron jobs scheduled during the outage simply never fire
- **Permanent fix**: Set up auto-start via Windows Task Scheduler or startup folder (see `hermes-agent` skill → "Gateway Auto-Start on WSL2" section)
- **Quick fix (post-outage)**: `cronjob(action='run', job_id='...')` — but may not work on first attempt; fall back to running the script directly via `terminal()`

#### Pitfalls
- `cronjob(action='run')` triggers on the **next scheduler tick**, not immediately. If the gateway was just restarted, the first tick may use cached config. Always run twice if output looks wrong, or run the underlying script directly via terminal.
- `last_status: ok` + `last_run_at: yesterday` = gateway was down. Don't confuse this with a job failure.

### 1. Check Prompt Paths First (⛔ #1 failure mode for local-exec cron jobs)
**The `workdir` setting does NOT propagate to the cron agent's shell.** Even if you set `workdir=/home/user/project`, the prompt still needs to use an absolute path in the command.

❌ **Broken** (will fail silently or fall back to wrong script):
```bash
bash scripts/scan_and_push.sh
```
✅ **Works**:
```bash
cd /home/user/project && bash scripts/scan_and_push.sh
```

Always scan the prompt for relative paths and `~` expansions immediately. If the cron output shows "找不到專案目錄" or "no such file" = path issue.

### 1. Check Deliver Mode (before assuming failure)
If the user reports not seeing output, check `deliver` first:

- `deliver: local` → output saved to `~/.hermes/cron/output/<job_id>/` only. NOT delivered to user chat. The script itself may still send notifications (e.g., Discord webhook inside the script).
- `deliver: origin` → output sent through the chat gateway (Telegram/Discord). This is what users expect.

Switch with: `cronjob(action='update', job_id='...', deliver='origin')`

### 2. Read the Actual Output, Not Just the Status
**Critical**: `cronjob(action='list')` showing `last_status: ok` does NOT mean the job produced valid output. "ok" means the job ran to completion — but the LLM call inside could have failed silently.

Check the actual output file:
```bash
ls -lt ~/.hermes/cron/output/<job_id>/
cat ~/.hermes/cron/output/<job_id>/<latest_file>
```

Look for:
- `API call failed after 3 retries` — data collection succeeded but LLM couldn't generate report.
- `[SILENT]` — report was suppressed (nothing new).
- Empty or template-only response — prompt wasn't filled in.
- "找不到專案目錄" or "no such file" — absolute path missing, see Step 0.

### 2a. Response Truncation (RuntimeError: Response truncated due to output length limit)

**Pattern:** The cron job runs, collects data successfully, but the final LLM-generated output is truncated because it exceeds the system's output length limit. The `last_run_at` is current, `last_status` is `error`, and the output file contains `RuntimeError: Response truncated due to output length limit`.

**Root cause:** The cron prompt asks the LLM to produce a long-form summary, report, or brief that exceeds the system's maximum output character count. The agent loop enforces an output token/turn limit; when the LLM's response exceeds it, the entire response is truncated and the error is raised — the output never reaches the user.

**Fix — add explicit output length constraints to the cron prompt:**

❌ **Broken (no constraint):**
```
Summarize today's top AI tools from the collected data.
```

✅ **Works:**
```
Summarize today's top AI tools from the collected data.
CRITICAL: Final Telegram message must be under 3000 characters total.
Be concise — prioritize the most important items, use brief bullet format.
```

**Key design decisions:**
- Specify a concrete character limit (3000 is safe for Telegram — well under the 4096 message limit with margin)
- Place the constraint near the END of the prompt (recency bias means the last instruction is most likely followed)
- If the agent also needs to output JSON/formatted data, separate the internal work from the delivery: "Write a summary JSON to memory, then produce a <3000 char Telegram message"

**Verification after fix:**
```bash
cronjob(action='run', job_id='...')   # First run — may use cached prompt
cronjob(action='run', job_id='...')   # Second run — new prompt in effect
```

**Alternative approach — script-only with no_agent=True:**
If the report format is fixed (always the same structure, just different data), consider switching to `no_agent=True` with a Python/bash script that builds the message programmatically. This skips the LLM entirely and avoids truncation risks.

### 3. Confirm the Error Type
Check the logs for the precise error:
```bash
grep "<job_id>" ~/.hermes/logs/agent.log | tail -10
grep "API call failed" ~/.hermes/logs/errors.log | tail -10
```

Common failure modes:
| Error Pattern | Root Cause | Typical Provider |
|---|---|---|
| `HTTP 429` / `RESOURCE_EXHAUSTED` | Rate limit / quota exceeded | Gemini, OpenRouter free tier |
| `HTTP 402` | Insufficient credits | OpenRouter paid models |
| `Connection error` | API unreachable (network / provider outage) | MiniMax, Ollama Cloud |
| `Request timed out` | Model too slow or network issue | Local models, slow providers |
| `Model not found` (HTTP 404) | Wrong model ID | Any |

### 4. Resolve by Error Type

#### Connection Errors (Connection error)
Common with MiniMax in early morning hours (07:30-09:00).
- **Recommended**: Switch provider entirely (e.g., MiniMax → OpenRouter).
- If switching provider, also change the model for compatibility.
- Example: `cronjob(action='update', job_id='...', model={"model": "deepseek/deepseek-v4-flash", "provider": "openrouter"})`

#### Rate Limiting (HTTP 429)
- **Option A — Model Swap**: Switch to a model with higher limits.
- **Option B — Schedule Adjustment**: Move to a less contended time slot.
  `cronjob(action='update', job_id='...', schedule='30 8 * * *')`

#### Insufficient Credits (HTTP 402)
- Check `https://openrouter.ai/settings/credits` for OpenRouter, or switch to a free/cheaper model.
- If switching, update both model and provider.
### 5. Data Timing Migration (when API data isn't ready yet)

User reports missing data → investigation reveals the **API hasn't published today's data yet** at the scheduled time.

#### Steps:
1. Check data availability timing — consult `references/data-availability-timing.md` for the relevant source.
2. Update the cron schedule to a time when the data IS reliably available:
   ```
   cronjob(action='update', job_id='...', schedule='0 16 * * 1-5')
   ```
3. If you also want output delivered to the user, change `deliver` to `'origin'`:
   ```
   cronjob(action='update', job_id='...', deliver='origin')
   ```
4. **IMPORTANT — check prompt paths too**: After any schedule update, scan the prompt for relative paths. `cd /absolute/path && command` is the only safe form.
5. Re-run immediately to backfill today's data (may need a second run if first uses cached prompt, see pitfalls below).
6. Verify by reading the output file AND the script's own logs for the actual API response.

#### Caveat: Moving the schedule alone is not enough for variable-publish-time APIs
Some APIs (TWSE T86, government data portals) publish at a wide time window (15:30-16:30). Moving to the latest possible time still risks failure. For these, use the **script-level retry pattern** in Section 5a.

#### Example (Taiwan stock scanner):
- Problem: Stock scanner at 14:00 couldn't fetch TWSE institutional data (available ~15:00-16:00). Plus `deliver: local` so user never saw output.
- Fix: Schedule → `0 16 * * 1-5`, deliver → `origin`, prompt → `cd /home/... && bash scripts/scan_and_push.sh`
- Result: Second re-run fetched 16,228 institutional records from TWSE

### 5a. Data Freshness Retry Pattern (script-level retry for variable-publish-time APIs)

For APIs where publication time varies day to day, don't rely on the cron schedule to be precise. Embed the retry **inside the shell script** itself.

#### Pattern overview
```
cron fires → script runs main work → fetches time-sensitive data → validates output has today's date → if missing: wait → retry → retry → up to N times
```

This handles:
- API data not yet published when the script runs
- Variable publication windows (15:30-16:30, sometimes later)
- Silent stale data (script succeeds but outputs yesterday's data)

#### Implementation template

```bash
#!/bin/bash
# Inside the main scan/push script

TODAY=$(date '+%Y%m%d')
MAX_RETRIES=3
RETRY_DELAY=1200  # 20 minutes between retries
DATA_OK=false

for attempt in $(seq 1 $MAX_RETRIES); do
    # Step 1: Fetch today's data from API (skips dates already cached)
    python3 -c "
import sys; sys.path.insert(0, 'src')
from data_twse import fetch_institutional_flows_batch
from database import StockDatabase
db = StockDatabase()
fetch_institutional_flows_batch(db, days=3)
"

    # Step 2: Re-export to output JSON
    python3 -c "from export_data import export_institutional; export_institutional()"

    # Step 3: Validate — does the output file contain today's date?
    if python3 -c "
import json
with open('data_output/institutional_today.json') as f:
    data = json.load(f)
dates = [r.get('date','') for r in data]
exit(0 if '$TODAY' in dates else 1)
"; then
        DATA_OK=true
        break
    fi

    if [ $attempt -lt $MAX_RETRIES ]; then
        echo "⚠️  Data not yet published, retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
    fi
done

if [ "$DATA_OK" = false ]; then
    echo "⚠️  Today's data not available after ${MAX_RETRIES} retries (will backfill next run)"
fi
```

#### Key design decisions
- **Retry inside the script, not the cron schedule**: The cron fires once at a sensible time. Retries are self-contained in the script, so the cron agent doesn't burn extra LLM calls.
- **Validate by data content, not API status code**: AP| may return `stat: OK` but be yesterday's cached data. Always check the actual date in the output.
- **Use `sleep` for delay**: Blocks the shell script — this is fine for 3 × 20 min. The cron job's timeVisit fine as long as it stays under the agent's timeout (600s for foreground). The agent waits for the script to complete.
- **Silent success on missing data**: If all retries fail, log a warning and continue. The next day's cron will backfill (function.

#### When to use this pattern vs. moving the schedule
| Situation | Approach |
|---|---|
| API publishes at a KNOWN time | Move schedule to that time |
| API publishes at a VARIABLE time (15:30-16:30) | Script-level retry |
| API is unreliable / often down for hours | Don't retry in script; use a separate cron to check and backfill later |
| Multiple data sources with different availability | Retry only the late-arriving source; let others proceed immediately |

#### Real-world implementation: TWSE T86 Institutional Data
See `references/twse-t86-retry-example.md` for the exact implementation this pattern was derived from — shell script modifications, API response formats, acceptance criteria, and edge cases.

### 6. Verification After Fix

**Important**: After updating a cron job's config, the FIRST `cronjob(action='run', ...)` may still use OLD cached config (model, prompt, or both).

✅ Best practice:
1. Update the job config
2. Run `cronjob(action='run', job_id='...')` once
3. Wait for the job to complete
4. Run `cronjob(action='run', job_id='...')` a second time to verify with the new config
5. Read the output file to confirm the fix

## Pitfalls

- **`last_status: ok` is misleading**: Always check the actual output file content. Even a completed script can produce stale data (yesterday's prices instead of today's).
- **Silent fallback execution**: If the cron agent can't find the expected script, it may silently run a different command instead. This passes `status=ok` but produces degraded output.
- **Path resolution mismatch**: The cron agent may resolve `~` or relative paths unpredictably. `workdir` setting does NOT guarantee the CWD. Use `cd /abs/path && command` in the prompt.
- **Data freshness verification**: After a successful run, verify the output data's date matches expectations. Different TWSE data sources come online at different times after 13:30 close.
- **Cached config (model + prompt)**: After changing a job's model/provider/prompt, the next immediate `run` may still use old config. Always run a second time.
- **Provider pinning**: Always specify BOTH model and provider in the `model` parameter object.
- **Delivery mode**: `deliver: origin` goes through the chat gateway. `deliver: local` saves to output file — the script's own notification (e.g., Discord webhook) may still fire independently.
- **Browser skill in cron**: If the job has `browser` skill listed but not installed, you'll see `⚠️ Skill(s) not found and skipped: browser`. Remove it if not needed.
