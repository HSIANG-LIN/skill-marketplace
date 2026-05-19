---
name: benchmaster-cinebench-r23
description: How to set up, configure, and execute Cinebench R23 benchmark on Windows via the BenchMaster WHA agent.
---

# Cinebench R23 — WHA Agent Setup

## Installation on Windows

1. Download the official Cinebench R23 zip from Maxon
2. **Critical:** Extract preserving the original folder structure `corelibs/resource`
3. The correct executable path after extraction:
   ```
   CinebenchFresh\Cinebench.exe
   ```
   NOT `Cinebench.exe` directly at root level.

## CLI Arguments

Run with these exact parameters (no `--` prefix!):

```
g_CinebenchCpuXTest=true g_CinebenchMinimumTestDuration=10
```

**Correct:** `Cinebench.exe g_CinebenchCpuXTest=true g_CinebenchMinimumTestDuration=10`
**Wrong:** `Cinebench.exe --g_CinebenchCpuXTest=true`

## WHA Agent Config

In `AUTO_TOOLS`, keep ONLY `cinebench_r23` — do not mix with other benchmark tools in the same run.

## Troubleshooting

- If Cinebench crashes immediately: check that `CinebenchFresh\` is the working directory and `corelibs/resource` exists inside it
- If score is 0 or missing: verify the CLI arguments have no `--` prefix
