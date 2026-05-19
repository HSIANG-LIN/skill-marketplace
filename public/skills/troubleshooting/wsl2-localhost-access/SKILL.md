---
name: wsl2-localhost-access
description: Running Windows-native tools (Python, curl, browser) against WSL2-hosted services — localhost forwarding, IP resolution, cross-platform debugging
---

# WSL2 Cross-Platform Access — Running Windows Tools Against WSL2 Services

## Core Concept
WSL2 is a lightweight VM with its own network namespace. Modern WSL2 (kernel 5.10.60+) auto-forwards `localhost:<port>` from Windows to WSL2 — but **only** for services bound to `0.0.0.0` (not `127.0.0.1`). Services bound to `127.0.0.1` inside WSL are NOT reachable from Windows.

## Diagnosis

From **inside WSL**:
```bash
# Check service binding
ss -tlnp | grep <port>

# Check WSL2 kernel (localhost forwarding requires >= 5.10.60)
uname -r

# Get WSL internal IP (NOT reachable from Windows)
hostname -I

# Test service locally
curl -s http://localhost:<port>/health
```

From **Windows** (run via WSL `/mnt/c/...` or cmd):
```powershell
# Test via localhost (should work for 0.0.0.0 bound services)
curl http://localhost:<port>/api/v1/time

# Test via Windows Python
python -c "import requests; print(requests.get('http://localhost:8000/time').status_code)"
```

## Common Patterns

### 1. Service on 0.0.0.0 (auto-forwarded)
Windows `http://localhost:<port>` → WSL2 ✔️
- Bind with: `uvicorn main:app --host 0.0.0.0 --port 8000`
- Or: `app.run(host='0.0.0.0', port=8000)`

### 2. Service on 127.0.0.1 (WSL-only)
Windows cannot reach it directly.
- Must use SSH tunnel: `ssh -N -L <port>:127.0.0.1:<port> user@localhost`

### 3. WSL Internal IP (10.x.x.x)
The IP from `hostname -I` is WSL's virtual NIC IP. It is:
- Reachable from **within WSL**
- Sometimes reachable from Windows (firewall-dependent)
- **NOT reliable** — changes on WSL reboot
- ✔️ Use `localhost` instead (always works)

## Practical Testing Patterns

### Running Windows Python from WSL Terminal
```bash
# Find Windows Python path
ls /mnt/c/Users/<username>/AppData/Local/Programs/Python/Python<version>/python.exe

# Test with inline code (most reliable)
/mnt/c/Users/simon_dou/AppData/Local/Programs/Python/Python312/python.exe -c "
import requests
r = requests.get('http://localhost:8000/api/v1/time', timeout=5)
print(r.status_code, r.text)
"

# Run script file — MUST use Windows path format
/mnt/c/Users/simon_dou/AppData/Local/Programs/Python/Python312/python.exe \
  "C:\\Users\\simon_dou\\Desktop\\test.py"
```

### Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| **CP950 encoding** | `UnicodeEncodeError: 'cp950'` on emoji/Unicode | Remove emoji from output, use ASCII-only (`[OK]`/`[FAIL]`) |
| **WSL→Windows pipe timeout** | Python script hangs when run from WSL terminal | Use inline `-c` scripts, or run from native Windows cmd/powershell |
| **Wrong path format** | `python.exe: can't open file` | Use Windows path `C:\...` not `/mnt/c/...` |
| **Service on 127.0.0.1** | Windows connection refused | Rebind to `0.0.0.0` (for uvicorn: `--host 0.0.0.0`) |
| **PowerShell `curl` alias** | `curl -s http://localhost:8000/...` prompts `Uri:` parameter | Use `curl.exe` instead — PowerShell aliases `curl` to `Invoke-WebRequest`, not the real curl |

### Debugging Script for Windows
Create `test_wsl_connect.py` on Windows Desktop:
```python
import requests
BASE = "http://localhost:8000"
r = requests.get(BASE + "/api/v1/time", timeout=5)
print(r.text)
```

## Key Insight
**Always use `http://localhost:<port>` from Windows**, never the WSL internal IP (`10.x.x.x`). Modern WSL2 auto-forwards localhost. The WSL internal IP changes on reboot and is blocked by Windows firewall.
