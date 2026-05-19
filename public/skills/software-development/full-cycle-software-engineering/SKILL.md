---
name: full-cycle-software-engineering
description: A workflow for taking a software project from initial concept through robust testing, environment-aware implementation, CI/CD setup (including troubleshooting permission issues), and zero-touch deployment.
---

# full-cycle-software-engineering

## Description
A workflow for taking a software project from initial concept through robust testing, environment-aware implementation, CI/CD setup (including troubleshooting permission issues), and zero-touch deployment.

## Key Lessons & Patterns

### 1. Environment-Aware Implementation
When developing tools intended for Windows but built/tested in Linux/WSL, always implement environment-aware logic.
- **Pattern**: Use `platform.system()` to detect the OS. Use Windows-specific commands (like `wmic`) for production and Linux-compatible fallbacks (like `/proc` or `platform`) for development/testing.
- **Benefit**: Ensures tools work seamlessly in both dev and prod environments without manual adjustments.

### 2. CI/CD Permission Troubleshooting
A common pit-fall when setting up GitHub Actions is the "Workflow Scope" error.
- **Problem**: A Personal Access Token (PAT) with `repo` scope can push code but will be rejected when trying to push `.github/workflows/` files.
- **Resolution Strategy**: 
    1. Push the core codebase first (excluding the `.github` directory) to establish the repository.
    2. Guide the user to update their GitHub PAT to include the `workflow` scope.
    3. Push the workflow files once permissions are updated.

### 3. Zero-Touch Deployment Pattern
To achieve "Plug-and-Play" for large-scale deployments (e.g., 100+ machines):
- **UDP Discovery**: Implement a UDP Broadcast mechanism where the Agent "shouts" for the Controller, and the Controller responds with its IP.
- **Auto-Registration**: Once discovered, the Agent should automatically register itself via the API using its detected hardware specs.
- **Benefit**: Minimates manual configuration and human error during mass deployment.

### 4. Robust Testing Lifecycle
When developing multi-threaded GUI applications, test scripts must evolve alongside the implementation.
- **Pitfall**: Test failures due to mismatching class names, constructor arguments, or signal signatures as the implementation matures.
- **Best Practice**: Use "headless" testing modes (running the core logic without a GUI) to verify threading and signal logic in CI environments.

### 5. Cross-Platform Deployment: Windows Installer from WSL2

When deploying a Windows automation/installer script (PowerShell) from WSL2 filesystem, the following pitfalls are common:

**a) Silent PowerShell Window (no output visible)**
- **Problem**: Running `powershell -ExecutionPolicy Bypass -File install.ps1` from the Windows start menu or Explorer opens a window that closes instantly on completion. User sees nothing.
- **Fix**: Tell the user to run from an **already-open** cmd/PowerShell terminal window, OR add `-NoExit` flag: `powershell -NoExit -ExecutionPolicy Bypass -File install.ps1`, OR wrap output in a `Read-Host "Press Enter to exit"` at the end.

**b) Post-Install Path Verification**
- **Problem**: Script may fall back to a user-space path (e.g., Desktop) if it detects non-admin, but the application config (`job_runner.py` TOOL_CONFIG) still points to `Program Files`.
- **Fix**: After running the installer, always verify where files actually landed:
  ```
  ls /mnt/c/Program\ Files/Maxon\ Cinebench\ R23/ 2>/dev/null || \
  ls /mnt/c/Users/*/Desktop/bench_agent/tools/CinebenchR23/ 2>/dev/null || \
  echo "Not found"
  ```
  Then patch the config to match the real path.

**c) Server State Persistence**
- **Problem**: WSL2 background services (FastAPI, etc.) die when the WSL session ends or the terminal is closed. User assumes server is still running.
- **Fix**: Before any client-side operation, always check server is alive (`curl -s http://localhost:8000/`), and restart if dead. Use Hermes `background=true` terminal process or `process` tool to track server lifecycle.

**d) Stale Job Queue Cleanup**
- **Problem**: After server restarts, the job queue may contain stale `pending` jobs from previous test runs. These can interfere with new runs.
- **Fix**: Offer to clear stale jobs via API after restart, or mark them as `cancelled`.

### 6. Git History Synchronization
When initializing a local repo in a directory that already has a remote with existing files (README/License):
- **Pattern**: Use `git remote remove origin`, `git remote add origin <URL>`, and `git push -f origin <branch>` to force the local state as the single source of truth.

## Usage
Use this skill when managing complex, multi-component software projects that require professional-grade deployment, automation, and cross-platform compatibility.
