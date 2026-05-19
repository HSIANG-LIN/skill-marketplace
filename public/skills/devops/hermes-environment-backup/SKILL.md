---
name: hermes-environment-backup
description: Back up, migrate, or recover the complete Hermes Agent environment — skills, config, memory DBs, secrets, and automation scripts — across machines.
version: 1.1.0
tags: [hermes, backup, migration, disaster-recovery, devops, git, github, wsl]
---

# Hermes Environment Backup

Full Hermes Agent crash recovery requires more than just project repos — the agent's skills, configuration, memory databases, and automation scripts live locally and must be backed up separately.

## What to Back Up

| Item | Path | Size | Critical? | Notes |
|------|------|------|-----------|-------|
| Skills | `~/.hermes/skills/` | ~12MB | ✅ Essential | 135+ SKILL.md files + references/scripts |
| Config | `~/.hermes/config.yaml` | ~12K | ✅ Essential | Providers, models, gateway settings |
| Memory Store | `~/.hermes/memory_store.db` | ~4K | ✅ Essential | Persistent memory + holographic facts |
| Kanban | `~/.hermes/kanban.db` | ~100K | ⭐ Important | Active task boards |
| Response Store | `~/.hermes/response_store.db` | ~20K | ⭐ Important | Response cache |
| Scripts | `~/.hermes/scripts/` | varies | ⭐ Important | Custom automation scripts |
| State DB | `~/.hermes/state.db` | ~155M | ❌ DO NOT BACKUP | Session history — too large for git |

**Key insight**: `state.db` (conversation history) is 155MB and should NOT be in a git repo. Everything else totals ~18MB — perfectly manageable on GitHub.

## Backup Repository Structure

Use a single private repo (`hermes-memory`) as the backup target:

```
hermes-memory/
├── config.yaml              # Hermes config
├── memory_store.db          # Persistent memory
├── kanban.db                # Kanban boards
├── response_store.db        # Response cache
├── skills/                  # Full skills directory
│   ├── software-development/
│   ├── devops/
│   ├── data-science/
│   └── ...
├── projects/                # activeContext.md per project
│   ├── benchmaster/
│   ├── stock_scanner/
│   └── restaurant-dashboard/
├── scripts/                 # Custom automation scripts
├── .gitignore               # Excludes state.db, __pycache__, etc.
└── README.md
```

## Pre-Backup Audit

Before migrating or trusting automated backup, audit which local projects are on GitHub:

```bash
for d in ~/workspace/* ~/workspace/hermes_project/*/; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  if [ -d "$d/.git" ]; then
    remote=$(cd "$d" && git remote get-url origin 2>/dev/null || echo "no remote")
    echo "✅ $name → $remote"
  else
    echo "🔴 $name → NOT VERSIONED"
  fi
done
```

Creating a repo for an unversioned project (needs GITHUB_TOKEN in .env):
```bash
curl -s -X POST "https://api.github.com/user/repos" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"repo-name","description":"...","private":true}'
cd ~/project && git init && git add -A && git commit -m "feat: init"
git remote add origin "https://github.com/ACCOUNT/repo.git"
git branch -M main && git push -u origin main
```

**Critical .gitignore check before push:**
```bash
du -sh venv/ .venv/ node_modules/ __pycache__/ 2>/dev/null
# If venv got committed:
git rm -r --cached venv/ && echo "venv/\n.venv/" >> .gitignore
git add -A && git commit -m "fix: remove venv from tracking" && git push
```

## Automated Backup Script

Save this as `~/.hermes/scripts/sync-hermes-memory.sh`:

```bash
#!/bin/bash
# 每天備份 Hermes 完整環境到 hermes-memory repo
REPO="$HOME/.hermes/hermes-memory"

cd "$REPO" || exit 1

# 1. Projects activeContext
cp "$HOME/benchmaster/activeContext.md" "$REPO/projects/benchmaster/" 2>/dev/null
cp "$HOME/workspace/hermes_project/stock_scanner/activeContext.md" "$REPO/projects/stock_scanner/" 2>/dev/null
cp "$HOME/workspace/hermes_project/restaurant-dashboard/activeContext.md" "$REPO/projects/restaurant-dashboard/" 2>/dev/null

# 2. Skills (exclude internal dirs)
rsync -a --delete "$HOME/.hermes/skills/" "$REPO/skills/" \
  --exclude='.hub/' --exclude='__pycache__/' --exclude='node_modules/' 2>/dev/null

# 3. Config
cp "$HOME/.hermes/config.yaml" "$REPO/config.yaml" 2>/dev/null

# 4. DBs (skip state.db)
cp "$HOME/.hermes/memory_store.db" "$REPO/memory_store.db" 2>/dev/null
cp "$HOME/.hermes/kanban.db" "$REPO/kanban.db" 2>/dev/null
cp "$HOME/.hermes/response_store.db" "$REPO/response_store.db" 2>/dev/null

# 5. Scripts
mkdir -p "$REPO/scripts"
cp "$HOME/.hermes/scripts/"*.py "$REPO/scripts/" 2>/dev/null

# Commit + push only if changes exist
if ! git diff --quiet; then
    git add -A
    git commit -m "🔄 全量備份 $(date +%Y-%m-%d)"
    git push origin main
    echo "✅ hermes-memory 已同步 $(date)"
else
    echo "⏹️  無變更，跳過 $(date)"
fi
```

### .gitignore for the backup repo

```
state.db
__pycache__/
node_modules/
.hub/
*.log
```

## Recovery Procedure

After a system crash, to fully restore Hermes Agent:

```bash
# 1. Reinstall Hermes (follow official docs)
pip install hermes-agent

# 2. Clone your backup
git clone https://github.com/YOUR_USER/hermes-memory.git ~/.hermes/hermes-memory

# 3. Restore config
cp ~/.hermes/hermes-memory/config.yaml ~/.hermes/config.yaml

# 4. Restore skills
cp -r ~/.hermes/hermes-memory/skills/* ~/.hermes/skills/

# 5. Restore DBs
cp ~/.hermes/hermes-memory/memory_store.db ~/.hermes/memory_store.db
cp ~/.hermes/hermes-memory/kanban.db ~/.hermes/kanban.db
cp ~/.hermes/hermes-memory/response_store.db ~/.hermes/response_store.db

# 6. Restore scripts
cp ~/.hermes/hermes-memory/scripts/* ~/.hermes/scripts/

# 7. Clone project repos
git clone https://github.com/YOUR_USER/BenchMaster.git ~/benchmaster
git clone https://github.com/YOUR_USER/stock-scanner.git ~/workspace/hermes_project/stock_scanner
# ... etc.
```

## Migration to Another Machine

Use when moving Hermes Agent to a new computer (same OS: WSL2→WSL2, Linux→Linux, macOS→macOS). Unlike backup (secrets stay out of git), migration **includes** `.env` and `auth.json` so the new machine is fully operational without re-entering API keys.

### Total Size

Everything except `state.db`: **~16MB**. Highly portable.

### Step 1 — Create Migration Tarball

```bash
cd ~
tar czf /tmp/hermes-migration.tar.gz \
  --exclude='state.db' \
  --exclude='__pycache__' \
  --exclude='.git' \
  --exclude='sessions' \
  --exclude='logs' \
  --exclude='cron/output' \
  -C ~ .hermes/config.yaml \
  -C ~ .hermes/.env \
  -C ~ .hermes/auth.json \
  -C ~ .hermes/memory_store.db \
  -C ~ .hermes/kanban.db \
  -C ~ .hermes/response_store.db \
  -C ~ .hermes/skills/ \
  -C ~ .hermes/scripts/
```

### Step 2 — Transport Options

| Method | When to use | Command |
|--------|-------------|---------|
| **Windows /mnt/c/** | Same machine, WSL2→WSL2 | `cp /tmp/hermes-migration.tar.gz /mnt/c/Users/<name>/Desktop/` |
| **GitHub Release** | Different Windows machines, no direct network | See below — upload via API, download via curl |
| **SCP** | Same LAN, both Linux | `scp user@old-machine:/tmp/hermes-migration.tar.gz ~/` |
| **USB** | Offline transfer | Copy to USB via Windows, then into new WSL |

#### GitHub Release Upload (secrets-safe, no git history)

Best for cross-machine transfer when you already have a private `hermes-memory` repo:

```bash
TOKEN=$(grep GITHUB_TOKEN ~/.hermes/.env | cut -d= -f2 | tr -d ' \\t')

# Create release
RELEASE=$(curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "migration-YYYY-MM-DD", "name": "Hermes Migration YYYY-MM-DD",
       "body": "Hermes Agent migration tarball (secrets included)",
       "draft": false, "prerelease": false}' \
  https://api.github.com/repos/YOUR_USER/hermes-memory/releases)

# Extract upload URL from response
UPLOAD_URL=$(echo "$RELEASE" | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print(d['upload_url'].replace('{?name,label}','?name=hermes-migration.tar.gz'))")

# Upload asset
curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/gzip" \
  --data-binary @/tmp/hermes-migration.tar.gz \
  "$UPLOAD_URL"

# Then on the new machine — ⚠️ PRIVATE REPOS REQUIRE AUTH:
curl -L -H "Authorization: token $GITHUB_TOKEN" -o ~/hermes-migration.tar.gz \
  https://github.com/YOUR_USER/hermes-memory/releases/download/migration-YYYY-MM-DD/hermes-migration.tar.gz
```

#### Git Push Fallback (when Release upload fails)

If the Release upload returns 404 on download (common with private repos or API timing issues), push the tarball directly as a git-tracked file:

```bash
cd ~/.hermes/hermes-memory
cp /tmp/hermes-migration.tar.gz .
git remote set-url origin https://$TOKEN@github.com/YOUR_USER/hermes-memory.git
git add hermes-migration.tar.gz
git commit -m "📦 Migration pack YYYY-MM-DD"
git push origin main
git remote set-url origin https://github.com/YOUR_USER/hermes-memory.git  # strip token

# On new machine: clone and extract
git clone https://github.com/YOUR_USER/hermes-memory.git ~/migration
cp ~/migration/hermes-migration.tar.gz ~/ && cd ~ && tar xzf hermes-migration.tar.gz
```

⚠️ **Trade-off**: unlike Release, this embeds secrets in git history. For a private repo used only by you, this is acceptable. Delete the file from git later with `git rm hermes-migration.tar.gz && git commit -m "remove migration pack"` to shrink visibility.

### Step 3 — Restore on New Machine

```bash
# 1. Install Hermes (same version as old machine)
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash

# 2. Extract tarball
cd ~ && tar xzf hermes-migration.tar.gz

# 3. Clone project repos
git clone https://github.com/YOUR_USER/hermes-memory.git ~/.hermes/hermes-memory
git clone https://github.com/YOUR_USER/StockScanner.git ~/benchmaster
# ... etc.

# 4. Start gateway (WSL2 requires systemd=true in /etc/wsl.conf)
hermes gateway restart

# 5. Verify
hermes doctor && hermes gateway status
```

### Skip List (what NOT to include)

| Item | Path | Reason |
|------|------|--------|
| state.db | `~/.hermes/state.db` | ~178MB session history, not needed for fresh start |
| sessions/ | `~/.hermes/sessions/` | Regenerated from scratch |
| logs/ | `~/.hermes/logs/` | Per-machine logs, no value on new machine |
| cron/output | `~/.hermes/cron/output/` | Old cron results irrelevant |

## Pitfalls
`~/.hermes/state.db` contains full conversation history and can be 150MB+. **Never** add it to a git repo — it will make cloning/pushing slow and exceed GitHub's repo size limits. It's regenerated from scratch on first Hermes launch.

### size pitfall: git clone speed
After the initial backup push (which may be 18MB+), subsequent daily syncs are tiny — only changed files. If the skills dir has many generated/derived files, the `rsync --delete` keeps the backup lean.

### stale backup pitfall
If you create/modify skills during a session but the backup script runs at midnight, there's a ~24h window of vulnerability for new skills. Manual backup after major skill-creation sessions is recommended:
```bash
bash ~/.hermes/scripts/sync-hermes-memory.sh
```

### token security pitfall
If the backup repo URL contains a PAT (Personal Access Token), anyone with access to the cloned repo can read it. Use a fine-grained token with minimal scope (just `repo` read/write). The token should be stored in the backup script, NOT in config.yaml.

### migration secrets-in-git pitfall
The migration tarball contains `.env` (API keys) and `auth.json` (OAuth tokens). **Prefer** a GitHub Release, which stores the binary outside the git tree and can be deleted later. If the repo is compromised via git history, all your API keys and bot tokens are exposed.

If Release upload fails (see Git Push Fallback above), pushing to git is acceptable for a single-user private repo — just remember to `git rm` the tarball afterward to minimize exposure window.

### private repo release download pitfall
GitHub Release assets for **private repos** return HTTP 404 for unauthenticated requests. When downloading on the new machine, you must either:
- Use authenticated curl: `curl -L -H "Authorization: token $TOKEN" -o ~/...`
- Use `gh release download` after `gh auth login`
- Add the tarball to the repo directly and `git clone` (has auth via SSH/token)

Plain `curl -L` will silently download a 9-byte "Not Found" text file, which `tar xzf` will reject as "not in gzip format". Always verify the downloaded file with `file ~/hermes-migration.tar.gz` before extracting.

### gateway conflict after migration

When migrating to a new machine, the **old machine's gateway may still be running** and holding the bot token connections (Telegram, Discord). The new machine will appear to have no platform connection even though the tarball extracted correctly — the gateway starts but can't bind because the token is already in use.

**Symptom:** `hermes gateway status` says "running" but Dashboard shows Telegram/Discord as disconnected. Logs show no errors — the gateway simply can't establish a second connection with the same credentials.

**Fix:** Stop the old machine's gateway before starting the new one:

```bash
# On old machine:
hermes gateway stop
systemctl --user disable hermes-gateway  # optional: prevent auto-restart
```

If the old machine is inaccessible (e.g. remote office machine), wait for the gateway's keepalive to expire (~5-10 min) or restart the Telegram bot token from the bot provider (generates a new token, automatically invalidates the old connection).

### wsl2 systemd requirement
WSL2 without `systemd=true` in `/etc/wsl.conf` cannot run `hermes gateway start` as a systemd service. The gateway falls back to `nohup` which dies when the shell exits. Before migrating to a new WSL2, ensure:
```ini
# /etc/wsl.conf
[boot]
systemd=true
```
Then run `wsl --shutdown` (from Windows) and restart WSL.

## Verification

After running the backup script, verify:
```bash
cd ~/.hermes/hermes-memory
git log --oneline -1            # Should show today's date
git diff HEAD -- skills/        # Should be clean if backup ran
ls -lh config.yaml              # Config file present and non-empty
```

For recovery verification (dry run on a separate machine):
```bash
# Simulate restore by checking file count matches
echo "Skills: $(find ~/.hermes/hermes-memory/skills -name 'SKILL.md' | wc -l) files"
echo "Config: $(wc -c < ~/.hermes/hermes-memory/config.yaml) bytes"
echo "DBs: $(ls -lh ~/.hermes/hermes-memory/*.db | wc -l) databases"
```
