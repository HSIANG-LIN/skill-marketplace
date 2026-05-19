---
name: local-to-cloud-streamlit-sync
description: Pattern for syncing local SQLite data to Streamlit Cloud via scheduled git push of exported JSON files. Enables fully automated "data pipeline → cloud dashboard" without cloud database access.
---

# local-to-cloud-streamlit-sync

## Description

When your data pipeline runs **locally** (e.g., WSL cron job, batch ETL, daily scanner) but you want a **public Streamlit Cloud dashboard** that shows the latest results without manual uploads.

The core insight: Streamlit Cloud cannot access your local database. So instead, you:
1. **Export** your DB query results to small JSON files (git-friendly)
2. **Push** them to GitHub via cron
3. Streamlit Cloud reads the JSON files from the repo

## Architecture

```
Local Machine (WSL)                       Cloud
─────────────────────                    ─────────
14:30 cron job                         Streamlit Cloud
    │                                       │
    ├─ Run data pipeline (SQLite)           │
    ├─ Export DB → JSON files               │
    ├─ git add + commit + push  ──────────►  ├─ Reads JSON from repo
    │                                       │  (data_output/*.json)
    │                                       ├─ Renders dashboard
    │                                       └─ Auto-updates on push
    │
    └─ Discord/Telegram notification
```

## Implementation Steps

### 1. Create the Export Script

Create `src/export_data.py` that reads from your SQLite DB and writes JSON:

```python
import json, sqlite3, os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "scanner.db"
OUTPUT_DIR = PROJECT_ROOT / "data_output"

def export_all():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    # Export each query result to a JSON file
    queries = {
        "daily_summary.json": """SELECT scan_date, COUNT(*) as total, ...
                                 FROM scan_history GROUP BY scan_date""",
        "recent_scans.json": """SELECT ... FROM scan_history ORDER BY scan_date DESC LIMIT 500""",
        # ... more queries
    }

    for filename, sql in queries.items():
        rows = conn.execute(sql).fetchall()
        data = [dict(r) for r in rows] if rows else []
        # Ensure numeric types are JSON-safe
        for item in data:
            for k, v in item.items():
                if isinstance(v, (sqlite3.Row,)):
                    item[k] = dict(v)
        _write_json(filename, data)

    conn.close()
```

**Pitfalls:**
- SQLite types like `Decimal` or numpy types are NOT JSON-serializable. Convert to native Python types explicitly.
- Use `conn.row_factory = sqlite3.Row` then `dict(r)` for clean dict conversion.
- Handle empty result sets gracefully (write empty list `[]`, not None).

### 2. Make the Cloud Dashboard Read from JSON

Instead of importing the local-dashboard module (which reads SQLite directly), create a standalone `app.py` that loads from JSON:

```python
import streamlit as st
import json, pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data_output"

@st.cache_data(ttl=30)
def load_all():
    data = {}
    for key, fname in [("daily", "daily_summary.json"), ...]:
        path = DATA_DIR / fname
        if path.exists():
            with open(path) as f:
                data[key] = json.load(f)
        else:
            data[key] = []
    return data
```

**Key difference from local dashboard:** No SQL queries at runtime. All data is pre-processed into JSON. This means:
- Charts and tables are simpler to render (no SQL JOINs in the cloud)
- The cloud dashboard can't do ad-hoc queries — pre-export everything you might need
- Works well for up to ~500 records; beyond that, paginate or aggregate in the export step

### 3. Create the Automation Script

Create `scripts/scan_and_push.sh`:

```bash
#!/bin/bash
set -e
PROJECT_DIR="/path/to/project"
cd "$PROJECT_DIR"
source venv/bin/activate

echo "[1/3] Running data pipeline..."
python src/main.py all

echo "[2/3] Exporting dashboard data..."
python src/export_data.py

echo "[3/3] Pushing to GitHub..."
git add data_output/
if ! git diff --cached --quiet; then
    git commit -m "daily update $(date '+%Y-%m-%d %H:%M')"
    git push origin main
fi
```

### 4. Git Setup

- **`data_output/` MUST NOT be in `.gitignore`.** If your `.gitignore` has `data/`, that only matches the literal `data/` directory—`data_output/` is not affected. If you use a catch-all like `data*`, rename the output dir.
- **Embed GitHub token in remote URL** for headless cron push:
  ```bash
  git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/USER/REPO.git"
  ```
  Security note: The token is stored in `.git/config`. Acceptable for personal WSL/cron setups.

### 5. Streamlit Cloud Deployment

1. Go to https://share.streamlit.io
2. **Create app → From existing repo** → select repo, branch `main`, file `app.py`
3. After deployment, **enable "Reboot on push"** in the app dashboard — this makes Streamlit Cloud automatically redeploy when new data is pushed to GitHub
4. Verify JSON data is accessible at:
   `https://raw.githubusercontent.com/USER/REPO/main/data_output/filename.json`

### 6. Cron/Job Scheduler

Configure via Hermes Agent cron jobs:

```bash
# Schedule: 30 14 * * 1-5  (weekdays at 14:30)
# Run: bash scripts/scan_and_push.sh
# Workdir: <project root>
# Tools: [terminal]
```

## Data File Organization

Keep `data_output/` JSON files small and focused:

| File | Purpose | Typical Size |
|------|---------|-------------|
| `daily_summary.json` | Aggregated daily metrics | <1 KB |
| `strategy_daily.json` | Per-strategy breakdown | <2 KB |
| `recurring_stocks.json` | Frequently flagged stocks | <5 KB |
| `recent_scans.json` | Last N individual scan results | 20-50 KB (limit to 500 rows) |
| `stock_codes.json` | Code→Name lookup table | <5 KB |
| `metadata.json` | Last scan date, total counts | <0.1 KB |

## Verification Checklist

- [ ] Export script runs successfully: `python src/export_data.py`
- [ ] JSON files appear in `data_output/`
- [ ] `git push` works without user interaction
- [ ] GitHub raw URL returns valid JSON: `curl -s https://raw.githubusercontent.com/...`
- [ ] Streamlit Cloud deploys and shows data
- [ ] Streamlit Cloud "Reboot on push" is enabled

## When NOT to Use This Pattern

- If your cloud platform supports mounting volumes or direct DB access (e.g., Railway.app with PostgreSQL, or a cloud VPS)
- If your data changes multiple times per minute (JSON-files-in-git is not real-time)
- If your data exceeds ~10 MB per export (git repos shouldn't bloat)
- If you need read-write capability from the cloud (this is read-only from local)
