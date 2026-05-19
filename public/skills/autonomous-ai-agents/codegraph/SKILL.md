---
name: codegraph
description: "Pre-indexed code knowledge graph for AI coding agents — fewer tokens, fewer tool calls, 100% local."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Coding-Agent, Code-Intelligence, Claude, MCP, Graph, Token-Optimization]
    related_skills: [claude-code, codex, opencode, subagent-driven-development, spec-driven-implementation, codebase-inspection]
---

# CodeGraph: Pre-indexed Code Knowledge Graph

[CodeGraph](https://github.com/colbymchenry/codegraph) builds a **pre-indexed knowledge graph** of your codebase — symbol relationships, call graphs, and code structure — so AI coding agents can query it instantly instead of scanning files with grep, glob, and Read.

**Why it matters:** Reduces tool calls by ~92% and exploration time by ~71% (benchmarked across 6 real codebases). That's fewer tokens wasted on file discovery, more tokens spent on actual coding.

## Prerequisites

- **Node.js >= 18** (install via `nvm` or system package manager)
- `npm` (comes with Node.js)
- MCP-compatible AI coding agent (Claude Code, Codex CLI, OpenCode, etc.)

## Installation

### Quick Install (Recommended)

```bash
npx @colbymchenry/codegraph
```

The interactive installer handles everything:
1. Prompts to install `codegraph` globally
2. Configures MCP server in `~/.claude.json`
3. Sets up auto-allow permissions for CodeGraph tools
4. Adds global instructions to `~/.claude/CLAUDE.md`
5. Optionally initializes your current project

### Manual Install (Alternative)

```bash
npm install -g @colbymchenry/codegraph
```

Then add to your MCP config (`~/.claude.json` for Claude Code, or `~/.codex/config.json` for Codex):

```json
{
  "mcpServers": {
    "codegraph": {
      "type": "stdio",
      "command": "codegraph",
      "args": ["serve", "--mcp"]
    }
  }
}
```

### Verify Installation

```bash
codegraph --version
# Should show v0.7.x+
```

## Usage

### Initialize a Project

```bash
cd /path/to/your/project
codegraph init -i
```

This creates a `.codegraph/` directory with the indexed knowledge graph. The file watcher automatically stays in sync as you edit code.

### Available Tools (provided via MCP)

Once configured, your AI agent has access to these tools:

| Tool | Purpose |
|------|---------|
| `codegraph_explore` | Explore a codebase by entering at any symbol or file. Returns entry points, related symbols, code snippets |
| `codegraph_search` | Full-text search across the entire codebase using FTS5 |
| `codegraph_impact` | Trace callers, callees, and full impact radius of any symbol |
| `codegraph_routes` | List web framework routes and link to their handler functions |
| `codegraph_graph` | Show dependency graph of symbols (visual output) |

### CLI Commands

| Command | Purpose |
|---------|---------|
| `codegraph init -i` | Interactive project initialization |
| `codegraph init` | Quick init (uses defaults) |
| `codegraph serve --mcp` | Start MCP server (run by your agent automatically) |
| `codegraph rebuild` | Force rebuild the knowledge graph |
| `codegraph status` | Check graph health and stats |

## How It Works in Practice

When your AI agent works on a project with CodeGraph initialized:

**Without CodeGraph (before):**
```
Explore agent spawns → greps for "UserService" → 
  finds 12 files → reads each file → 
  filters symbols → builds mental model → 
  finally can answer → 40-50 tool calls, 1-2 minutes
```

**With CodeGraph (after):**
```
Agent calls codegraph_explore("UserService") → 
  gets back: location, callers, callees, code snippet → 
  answers immediately → 3 tool calls, 20 seconds
```

## Supported Languages (19+)

TypeScript, JavaScript, Python, Go, Rust, Java, C#, PHP, Ruby, C, C++, Swift, Kotlin, Dart, Svelte, Liquid, Pascal/Delphi, Scala, Vue

## Framework-aware Routes

CodeGraph detects web-framework routing files in **13 frameworks** — Django, Flask, FastAPI, Express, Laravel, Rails, Spring, Gin/chi/gorilla/mux, Axum/actix/Rocket, ASP.NET, Vapor, React Router, SvelteKit — and links URL patterns to their handlers.

## Best Practices

1. **Initialize at project root** — `codegraph init -i` in the root directory indexes the full project
2. **Re-index after major refactors** — `codegraph rebuild` if you move/rename many files
3. **Let the file watcher handle daily edits** — it auto-syncs with 2s debounce
4. **Use with large projects** — the bigger the codebase, the more CodeGraph saves (Swift Compiler with 25K files indexed in 4 min)
5. **Combine with `--allowedTools`** — restrict your agent to `[Read, Edit, codegraph_explore, codegraph_search]` for maximum efficiency

## Pitfalls

1. **Requires Node.js** — if you don't have Node 18+, install via `nvm install --lts`
2. **First index takes time** — expect 2-5 minutes for large monorepos; subsequent syncs are instant
3. **`.codegraph/` directory is NOT gitignored by default** — add `.codegraph/` to `.gitignore` unless you want to commit the index (not recommended)
4. **Not a replacement for reading** — CodeGraph's snippets are summaries; your agent will still call `Read` for full files when it needs complete context
5. **MCP config needed** — the tool only works if your agent's MCP config points to the `codegraph` server; verify config after `npm install -g`
6. **Version mismatch** — if tools aren't recognized, run `codegraph --version` and ensure v0.7.x; older versions may have different tool names

## Verification

```bash
# 1. Global install check
codegraph --version

# 2. Project initialized
ls .codegraph/  # Should show graph.db, metadata, etc.

# 3. MCP server works
codegraph serve --mcp --dry-run

# 4. Agent can see tools
# In Claude Code: /mcp → should show "codegraph" with 5 tools
```
