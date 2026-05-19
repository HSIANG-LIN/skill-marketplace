---
name: spec-driven-implementation
description: A workflow for implementing complex, multi-file software systems by strictly adhering to a master specification and prioritizing full-file integrity.
---

# spec-driven-implementation

A workflow for implementing complex, multi-file software systems by strictly adhering to a master specification (System Prompt) and prioritizing full-file integrity.

## Workflow

1. **Master Spec Audit**: Before any code is written, decompose the master specification into:
   - A complete directory tree.
   - A prioritized implementation sequence.
   - A detailed schema/API/contract definition.
2. **Environment Verification**: Confirm the existence of all required directories. If a directory is missing, create it immediately.
3. **Implementation Sequence**: Proceed strictly through the specified order (e.g., Phase 1 -> Phase 2). Do not deviate to "explore" unless explicitly instructed.
4. **Full-File Output Principle**: Every file implementation must be a complete, non-truncated file. Never use `# ...` or snippets. This ensures the user can copy-paste the entire file without error.
5. **Module-Aware Testing**: 
   - Always ensure `__init__.py` files exist in package directories.
   - To test modules with relative imports, execute via the module flag: `python3 -m <package>.<module>`.
6. **Strict Compliance**: Verify that every function, variable, and endpoint matches the master spec's naming and type requirements.

## Pitfalls

- **Exploratory Drift**: Moving away from the spec to "test ideas" or "find things" can break the architectural integrity.
- **Truncation Errors**: Using snippets makes the agent's output non-functional for the user.
- **Path Mismatch**: Writing files to the wrong project root (e.g., `~/hermes/` vs `~/benchmaster/`).
- **Import Errors**: Running package modules as standalone scripts, causing `ImportError: attempted relative import with no known parent package`.
