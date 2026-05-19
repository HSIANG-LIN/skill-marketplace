---
name: pyinstaller-windows-from-linux-ci
description: Build a Windows .exe from a Python project using GitHub Actions with a Windows runner. Required when PyInstaller on Linux can't cross-compile to Windows.
version: 1.2.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [pyinstaller, windows, ci-cd, github-actions, build]
    related_skills: []
---

# PyInstaller: Build Windows Executable from Linux CI/CD

## When to Use

You need to build a Windows `.exe` from a Python project, but you are running on Linux (WSL, CI/CD, Unix). PyInstaller on Linux natively produces **Linux** executables only — it cannot cross-compile to Windows without a Windows runner.

## The Problem

```
PyInstaller on Linux → produces Linux ELF binary
PyInstaller on Windows → produces Windows .exe
```

Even with Wine, Python executables can't run under Wine's ABI. You need an actual Windows machine or VM.

## The Solution: GitHub Actions with Windows Runner

1. Push Python source to a GitHub repo
2. Add `.github/workflows/build.yml` using `runs-on: windows-latest`
3. On the Windows runner: `pip install pyinstaller requests && pyinstaller ...`
4. Upload artifact from the Windows runner
5. Download the `.exe` from the Actions run

## Implementation

### `.github/workflows/build.yml`

```yaml
name: Build Windows Executable

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install pyinstaller robotframework PyQt6

      - name: Build exe
        run: pyinstaller --name=FactoryTestRunner --onefile --windowed main.py

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: FactoryTestRunner-exe
          path: dist/FactoryTestRunner.exe
```

### Key PyInstaller Flags
- `--onefile`: Single executable, no separate DLLs
- `--windowed`: No console window (GUI mode)
- `--name`: Output exe name

### Config File Handling

Since `config.py` is bundled into the exe, the user needs a way to configure `SERVER_URL` before running. Best approach:

Make `config.py` look for a `config_local.py` next to the exe first, then fall back to defaults:

```python
# At the top of agent.py (before other imports)
import os, sys
_extra_config = os.path.join(os.path.dirname(sys.executable), "config_local.py")
if os.path.exists(_extra_config):
    exec(open(_extra_config).read())
```

This way the `.exe` ships with defaults, and users can drop a `config_local.py` next to it to override settings.

## Cross-Platform Path Note

When using `--add-data`:
- Unix separator: `--add-data "config.py:."`
- Windows separator (in YAML/CMD): `--add-data "config.py;."`

## Verification
Download the artifact from the Actions run, then on a Windows machine:
```powershell
.\AutoTestAgent.exe
```
Check `agent.log` for startup output.

## Artifact Download (Post-Build)

After a successful build, download the artifact via the GitHub REST API:

```bash
# 1. Get artifact info
ARTIFACT_URL=$(curl -sL "https://api.github.com/repos/OWNER/REPO/actions/runs/{run_id}/artifacts" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['artifacts'][0]['archive_download_url'])")

# 2. Download (requires authenticated token in header)
curl -sL -H "Authorization: Bearer YOUR_GH_TOKEN" \
  "$ARTIFACT_URL" -o artifact.zip
```

Note: Direct browser URLs like `/suites/{id}/artifacts` require GitHub login. The API approach works with a PAT.

## Troubleshooting GitHub Actions Setup

### 403 Forbidden when pushing workflow files
If you encounter a `403 Forbidden` error while trying to push `.github/workflows/build.yml` from your local terminal (especially if using a Classic Personal Access Token (PAT)), it is likely because your token lacks the necessary permissions.

**The Fix:**
Go to your GitHub Settings -> Developer Settings -> Personal Access Tokens (Classic) and ensure the **`workflow`** scope is checked. This scope is required to manage GitHub Actions workflow files via the API or Git.

### Missing Source Files
If your GitHub Action fails with "file not found" errors (e.g., `agent.py` not found), ensure that all source files and subdirectories (like `agent/`, `controller/`, etc.) are actually committed to your repository. If they appear in your local filesystem but are not in the repo, check their status with `git status`.

### Large/Unintended Files in Commit
When committing, avoid `git add -A` if you have `venv/`, `__pycache__/`, or other large directories present. Use explicit paths instead:
```bash
git add agent/ api/ db/ parsers/ wha/ agent_tool_ui.py requirements.txt .github/
```
Large venv folders (2M+ files) will bloat the repo and slow down Actions checkout.

### Node.js 20 Deprecation Warning
Actions using `actions/checkout@v4`, `actions/setup-python@v5`, `actions/upload-artifact@v4` show deprecation warnings about Node.js 20. This is cosmetic and does not affect the build — the warning can be ignored until September 2026.

## Related Commands

```bash
# Local dev test (on Linux)
uv run --with pyinstaller --with requests pyinstaller --name=AutoTestAgent --onefile --windowed agent.py
```
