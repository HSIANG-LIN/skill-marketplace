---
name: fix-version-mismatch-api
description: "Systematic workflow for fixing version API mismatches in inherited codebases. Covers: check API signatures, instantiate to discover errors, fix iteratively, verify end-to-end."
version: 1.0.0
author: Hermes Agent
---

# Fix Version API Mismatch Workflow

## When to Use

You're debugging a codebase (especially ML/DSPy/AI frameworks) where the installed package version differs from what the code expects. Common symptoms:

- `TypeError: X() got unexpected keyword argument 'Y'`
- `TypeError: X() missing N required positional arguments`
- `AttributeError: module 'X' has no attribute 'Y'`
- Code falls back to a secondary path (the original error is hidden by a `try/except`)

## Workflow

### Step 1: Check versions

```bash
python -c "import dspy; print(dspy.__version__)"
python -c "import gepa; print(gepa.__version__)"  # or whatever package
```

If the version mismatch is obvious (e.g., code written for old API but installed is new), **don't guess the API** — inspect it.

### Step 2: Inspect actual API (don't guess, don't read old code)

```bash
python -c "
import inspect, dspy
# Check the actual signature of the class/function being called
sig = inspect.signature(dspy.GEPA)
print(sig)
"
```

Key things to look for:
- Parameter names (especially changed ones like `max_steps` → `max_metric_calls`)
- Required vs optional parameters
- New required parameters that didn't exist before
- Callback/metric signature changes

### Step 3: The "instantiate first" rule

Before running the full pipeline, try to **instantiate the problematic object in isolation**:

```python
# BAD: Run full pipeline, wait 60s+ for the error
# GOOD: Isolate and test the instantiation first
try:
    opt = dspy.GEPA(metric=my_metric, max_metric_calls=10)
    print('✅ GEPA instantiated successfully')
except Exception as e:
    print(f'❌ Failed: {e}')
```

This catches 90% of API mismatches in under 1 second instead of 60+ seconds.

### Step 4: Fix errors one at a time

Each error tells you exactly what's wrong. Fix and re-test:

```
Error 1: unexpected keyword argument 'max_steps'
  → Check signature, find correct param name → fix
Error 2: AssertionError: GEPA requires reflection_lm
  → Add the required param → fix
Error 3: metric must accept 5 arguments
  → Create a wrapper function → fix
```

### Step 5: Test end-to-end after all instantiations pass

Once instantiation succeeds, run a minimal real test:

```bash
python run.py --iterations 2
```

This verifies that the pipeline actually works with the fixed API.

### Step 6: Fix peripheral issues found during real test

Common peripheral issues:
- **Venv activation**: The script runs with system Python, but venv has compiled extensions for a different version. Fix: auto-re-exec with venv Python via `os.execv()`.
- **Wrong data passed to validators**: Code passes `body` (without frontmatter) when validator expects full file. Fix: trace what's actually in the variable vs what the consumer expects.

## Pitfalls

1. **Don't trust the fallback path**: If there's a `try/except` that catches `Exception` broadly, the real error might be hidden. Look at the original code being tried, not just the fallback path.
2. **Don't read old code to guess the API**: Read the *new* package's API (via `inspect.signature`). The old code was written for an old version and will mislead you.
3. **Try/catch swallows too much**: The original code had `except Exception as e: logging/printing e` which let MIPROv2 run as fallback but masked the actual GEPA errors. Add explicit error logging when debugging.
4. **Venv vs system Python**: When a script has `#!/usr/bin/env python3` but the project has `venv/bin/python3` at a different version, compiled C extensions (pydantic-core, etc.) will fail. Always re-exec with venv Python.

## Example: GEPA Fix Applied

For reference, the GEPA in DSPy 3.2.0 vs the old code expectations:

| Old Code (guessed) | DSPy 3.2.0 Actual | Fix |
|---|---|---|
| `max_steps=N` | `max_metric_calls=N` | Rename parameter |
| `metric(example, pred, trace)` | `metric(gold, pred, trace, pred_name, pred_trace)` | Add 5-param wrapper |
| (missing) | `reflection_lm=dspy.LM(...)` required | Add reflection_lm param |
| `validator(body, ...)` | validator needs frontmatter in text | Pass `raw` instead of `body` |
| `python run.py` uses system python | venv has different python version | `os.execv(venv_python, ...)` |
