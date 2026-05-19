---
name: agentmemory
description: "#1 Persistent memory for AI coding agents — cross-session memory with 95.2% retrieval accuracy (LongMemEval benchmark)."
version: 1.0.0
author: Hermes Agent
license: Apache-2.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Memory, Coding-Agent, MCP, Persistent, Claude, Codex, Hermes]
    related_skills: [claude-code, codex, opencode, memory-management, hermes-agent]
---

# agentmemory: Persistent Memory for Coding Agents

[agentmemory](https://github.com/rohitg00/agentmemory) is a **persistent memory server** for AI coding agents. It captures tool usage across sessions, compresses it into searchable memory, and injects relevant context at session start — so you never have to re-explain architecture, preferences, or context.

**Benchmark (LongMemEval-S, ICLR 2025):** 95.2% R@5 — #1 among memory systems.

## Prerequisites

- **Node.js >= 18** (install via `nvm` or system package manager)
- `npm` (comes with Node.js)

## Installation & Quick Start

### Start the Server (one command)

```bash
npx @agentmemory/agentmemory
```

This starts the memory server on port **3111** and the live viewer on port **3113**.

### Demo Mode (seed sample data)

```bash
# In another terminal:
npx @agentmemory/agentmemory demo
```

Open `http://localhost:3113` to watch memory build live.

### Global Install (alternative)

```bash
npm install -g @agentmemory/agentmemory
```

### Non-interactive Setup (for automation / headless)

`agentmemory start` triggers an interactive first-run wizard (agent selection). To bypass:

```bash
# 1. Create minimal .env
mkdir -p ~/.agentmemory
cat > ~/.agentmemory/.env << 'EOF'
EMBEDDING_PROVIDER=local
AGENTMEMORY_INJECT_CONTEXT=true
AGENTMEMORY_AUTO_COMPRESS=false
CONSOLIDATION_ENABLED=false
TOKEN_BUDGET=2000
EOF

# 2. Mark first-run as done (skips wizard)
cat > ~/.agentmemory/preferences.json << 'EOF'
{
  "schemaVersion": 1,
  "lastAgent": ["hermes"],
  "lastAgents": ["hermes"],
  "lastProvider": null,
  "skipSplash": true,
  "skipNpxHint": true,
  "skipGlobalInstall": true,
  "skipConsoleInstall": true,
  "firstRunAt": "2026-05-18T00:00:00.000Z"
}
EOF

# 3. Start daemon (now non-interactive)
agentmemory start
```

### Other Commands

```bash
agentmemory start      # start server
agentmemory demo       # seed sample data + show recall
agentmemory connect    # wire agent hooks (interactive picker)
agentmemory connect hermes --dry-run  # see config without writing
agentmemory status     # show health, uptime, flags
agentmemory doctor     # interactive diagnostics
agentmemory stop       # tear down
agentmemory init       # copy .env.example to ~/.agentmemory/.env
```

## How It Works

### Memory Pipeline

```
PostToolUse hook fires
→ SHA-256 dedup (5min window)
→ Privacy filter (strip secrets, API keys)
→ Store raw observation
→ LLM compress → structured facts + concepts
→ Vector embedding + BM25 index

SessionEnd
→ Summarize session
→ Knowledge graph extraction

SessionStart
→ Hybrid search (BM25 + vector + graph)
→ Token budget (default: 2000 tokens)
→ Inject into conversation
```

### 4-Tier Memory

| Tier | What | Analogy |
|------|------|---------|
| Working | Raw observations from tool use | Short-term memory |
| Episodic | Compressed session summaries | "What happened" |
| Semantic | Extracted facts and patterns | "What I know" |
| Procedural | Workflows and decision patterns | "How to do it" |

### 12 Auto-Capture (12 hooks)

SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PreCompact, SubagentStart/Stop, Stop, SessionEnd

## Key Features

- **Automatic capture** — zero manual effort
- **Semantic search** — BM25 + vector (6 providers) + knowledge graph with RRF fusion
- **Memory evolution** — versioning, supersession, relationship graphs
- **Auto-forgetting** — TTL expiry, contradiction detection, importance eviction
- **Privacy first** — API keys, secrets, `<secret>` tags stripped
- **Real-time viewer** — `http://localhost:3113`
- **Self-hosted** — SQLite only, no external deps
- **Multi-agent** — one server, memories shared across all agents

## Supported Agents

| Agent | Integration |
|-------|-------------|
| Claude Code | 12 hooks + MCP + skills |
| Codex CLI | 6 hooks + MCP + skills |
| Hermes Agent | MCP + memory provider plugin |
| Cursor / Cline / Roo Code | MCP server |
| Gemini CLI / OpenClaw | MCP server |
| Aider / any agent | REST API |

## Token Efficiency

| Approach | Tokens/yr | Cost/yr |
|----------|-----------|---------|
| Paste full context | 19.5M+ | Impossible |
| LLM-summarized | ~650K | ~$500 |
| **agentmemory** | **~170K** | **~$10** |
| agentmemory + local embeddings | ~170K | **$0** |
## Pitfalls

1. **Persistent server required** — agentmemory runs as a background server (port 3111). It must be running for memory capture/injection to work. Add to startup (systemd/autostart) if you want it always on.
2. **First-run wizard blocks automation** — `agentmemory start` shows an interactive agent picker on first run. Bypass by writing `~/.agentmemory/preferences.json` with `firstRunAt` set (see Non-interactive Setup above).
3. **`agentmemory connect hermes` shows config but doesn't auto-write it** — Hermes YAML merge is not implemented. You must manually add the MCP server block (see `references/hermes-config.md`).
4. **First LLM compress call costs tokens** — the first few sessions use tokens to compress observations; after that, retrieval is cheap. Runs fine without any LLM key (local embeddings only = free).
5. **Local embedding model downloads on first run** — `all-MiniLM-L6-v2` (~80MB) downloads once; subsequent runs are offline and free.
6. **Potential memory leak if agent runs many short sessions** — each session generates observations; monitor `~/.agentmemory/` disk usage periodically.
7. **Port conflicts** — check ports 3111 (server) and 3113 (viewer) aren't in use before starting.

## Verification

```bash
# Server is running
curl -s http://localhost:3111/health

# Viewer accessible
curl -s -o /dev/null -w "%{http_code}" http://localhost:3113/

# Global install check
agentmemory --version
```

## Reference Files

- `references/setup.md` — Full installation transcript: first-run wizard bypass (preferences.json), env config, Hermes MCP wiring, and known issues.
