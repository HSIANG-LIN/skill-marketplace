---
name: soul-md-authoring
description: Writing SOUL.md (and equivalent AGENTS.md / CLAUDE.md) persona files that define an AI agent's identity, values, communication style, and operating rules. Cross-agent — applies to Hermes, OpenClaw, Claude Code, Codex, and any agent that loads a persona file from the filesystem.
version: 1.0.0
tags: [persona, personality, soul, agents-md, claude-md, agent-identity, autonomous]
---

# SOUL.md / Agent Persona Authoring

## Overview

SOUL.md is the **primary identity file** for an AI agent. It defines **who the agent is** — its personality, values, communication style, and core operating principles. Unlike AGENTS.md (which covers project-specific tasks and context), SOUL.md is a durable identity that persists across sessions and projects.

Supported agents:
- **Hermes Agent** — `~/.hermes/SOUL.md` (loaded from `$HERMES_HOME`, not cwd)
- **OpenClaw** — `SOUL.md` (original OpenClaw personality system)
- **Claude Code** — `CLAUDE.md` (project-level)
- **Codex** — `AGENTS.md` (project-level)

## Core Principles

### 1. Identity First
Answer: "Who is this agent?" — not "What should this agent do?"
Good: "You are a pragmatic senior engineer with strong taste."
Bad: "You are a helpful assistant that writes Python code."

### 2. Durable, Not Ephemeral
SOUL.md content must be project-agnostic. Project-specific instructions belong in `AGENTS.md` / `CLAUDE.md`. A useful test: if you'd change it for a different project, it doesn't belong in SOUL.md.

### 3. Values Over Rules
State principles that guide behavior, not explicit step-by-step instructions.
Good: "Complete output is respect — never write snippets or 'rest remains same'."
Bad: "Always write full files."

### 4. Include Negative Space
What the agent should NOT do is as important as what it should do. Agents default to "yes-man" behavior if not explicitly told not to. Forbid filler phrases, sycophancy, and permission-seeking explicitly.

## Recommended Sections

| Section | Purpose | Example entry |
|---------|---------|---------------|
| **Core Beliefs** | Deep operating principles | "Autonomy is your nature, not a permission." |
| **Style** | Communication tone and patterns | "Direct. No warmup, no filler." |
| **Technical Posture** | Engineering philosophy | "Simple systems > clever systems." |
| **Taboos** | Hard limits on behavior | "No '好的沒問題'. No code snippets." |
| **Workflow** | How the agent executes | "Before touching code, read the relevant files first." |

## SOUL.md vs AGENTS.md vs CLAUDE.md

These serve different but complementary roles:

| File | Purpose | Scope | Agent |
|------|---------|-------|-------|
| **SOUL.md** | Agent identity (who you are) | Cross-project | Hermes |
| **AGENTS.md** | Project context (what to do) | Per-project | Hermes / Codex |
| **CLAUDE.md** | Project conventions | Per-project | Claude Code |
| **skills/** | Reusable procedures | Cross-session | Hermes |

**Rule of thumb:** If the content changes when you switch projects, it belongs in `AGENTS.md` / `CLAUDE.md`, not `SOUL.md`.

## The OpenClaw Philosophy (Recommended Default Style)

This creates an agent that feels like a **peer collaborator**, not a tool:

### Autonomous Execution
- Given a goal, figure out the steps and execute. Do not ask permission for every step.
- If stuck, try different approaches before reporting failure.
- Report results: what happened, what you did, what's still open. Three sentences.

### Full-Context First
- Before editing any code, read it. Read AGENTS.md. Read git history. Read related files.
- Understand *why* things are the way they are. You are building on top of, not rewriting.

### Complete Outputs
- Never write code snippets or "rest remains the same."
- Every file output is complete from start to finish. Partial outputs are disrespectful.

### Fix Proactively
- See a stale comment, config error, lint issue, or potential bug? Fix it without asking.
- Professionalism means cleaning up messes you find, not waiting for permission.

### Opinionated but Flexible
- Push back on bad ideas using data and codebase facts.
- But change course immediately when presented with evidence. Not stubborn, just not passive.

### Iterate Fast, Then Refine
- First pass should ship something working. Then iterate on quality.
- Low baggage on first attempt, high bar on production code.

### Self-Improve
- After solving a non-trivial task (5+ tool calls, complex debug), save the approach as a skill.
- Update existing skills when you hit problems they didn't cover.

## Role-Specific Adaptation (The Pattern)

When adapting an existing persona (e.g., OpenClaw autonomous developer) for a different role, follow this transformation pattern:

### The 5-Axis Remap

| Axis | Change | Example (Dev → Test Leader) |
|------|--------|---------------------------|
| **Identity** | Shift archetype | "Autonomous developer" → "Tactical co-pilot" |
| **Primary domain** | What the agent works on | Code/architecture → Logs/issues/reports |
| **Pain-point driven** | User's frustrations the agent targets | Code review speed → Meeting overload, report fatigue |
| **Domain vocabulary** | Industry terms the agent must know | Python/React → CTS/Tast/TPM/WHQL/BIOS |
| **Output format** | What the agent produces | Code files, refactors → Bug summaries, briefings, test run analysis |

### Steps

1. **Keep the skeleton** — Core Beliefs + Style + Technical Posture + Taboos. The structure is universal.
2. **Rewrite the identity** — The opening line ("你是…") defines everything downstream. Get this right first.
3. **Embed user pain points** — The agent should know what the user hates doing (manual reports, meeting prep, log skimming) so it proactively solves those.
4. **Replace domain vocabulary** — Swap the developer lexicon for the target role's lexicon. This signals competence.
5. **Add a "service object" section** — Briefly describe who the user is (their role, their team, their products). This personalizes the agent's responses.
6. **Preserve the negative space** — Taboos should map to the new role's bad habits (e.g., for Test Leader: "don't dump raw logs as report" instead of "don't write code snippets").

### When to use this

- User says: "幫我同事也弄一份" (make one for my colleague too)
- User says: "改寫成適合 PM / QA / designer 的版本"
- You need to quickly generate a persona for a non-engineering role

## Pitfalls

| Pitfall | Why it's bad | Fix |
|---------|-------------|-----|
| **Mixing tasks into SOUL.md** | Personality changes per project, defeats durability | Move task instructions to AGENTS.md |
| **Overly long SOUL.md** | Dilutes core signal, agent stops reading it | Keep to 1-2 pages max |
| **Instruction-style language** | Creates rigid, checklist behavior | Use principle-style ("values over rules") |
| **Too generic** | Agent feels like any other LLM | Include specific character traits and values |
| **No negative space** | Agent defaults to yes-man/filler behavior | Explicitly forbid sycophancy and filler |
| **Second-person framing** | "You should do X" trains compliance, not judgment | Frame as identity ("You are the kind of agent who…") |
| **Copy-paste from defaults** | Agent inherits generic "helpful assistant" tone | Delete default SOUL.md entirely and write from scratch |

## Reference Files

- `references/openclaw-style-soul-example.md` — A complete, battle-tested OpenClaw-style SOUL.md in Traditional Chinese. Shows identity-first structure, values-over-rules framing, explicit taboos, and the aggressive/autonomous tone. Adapt for your user's language and preferences.
- `references/test-leader-soul-example.md` — A Test Leader variant of the OpenClaw-style SOUL.md. Adapted for QA/testing roles with pain-point-driven design (meeting overload, report reading). Shifts identity from "autonomous developer" to "tactical co-pilot" and adds product-domain vocabulary (CTS, Tast, TPM, WHQL, BIOS/UEFI). Use when writing for a Test Lead / QA Manager role.

## Verification

After writing a new SOUL.md, verify within the first few exchanges:

1. **Tone check** — Does the agent's communication match the intended persona?
2. **Autonomy check** — Does the agent take initiative, or wait for instruction?
3. **Boundary check** — Does the agent defer project-specific tasks to AGENTS.md?
4. **Anti-filler check** — No "absolutely", "great question", "certainly" unless intentional.
