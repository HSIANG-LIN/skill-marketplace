---
name: project-readme
description: "Write a comprehensive, professional GitHub project README from scratch — architecture, features, install, CLI usage, config, project structure."
version: 1.0.0
author: Hermes Agent
license: MIT
---

# Project README Writing

A workflow for writing (or completely rewriting) a GitHub project README that covers all essential sections for an open-source or internal tool.

## When to Use

- User says "my README is empty / minimal, write one"
- Starting a new project that needs a proper landing page on GitHub
- Refreshing an outdated README after major feature additions
- The README exists but lacks architecture docs, install steps, or usage examples

Do NOT use this for README edits like fixing a typo or adding one line — that's not worth a skill workflow. Use it when the README is being written from scratch or substantially rewritten.

## The Sections (in order)

### 1. Project Title + Tagline
One-liner below the title that explains what the project does in ~10 words. Use a relevant emoji.

```markdown
# Project Name 📊

**Multi-strategy scanning system** — short, punchy description.
```

### 2. Architecture Diagram
An ASCII or Mermaid diagram showing the data flow. Keep it simple — 3-4 layers max with directional arrows.

```text
Source API (batch async)
    │
    ▼
Cache Layer (SQLite -> tables)
    │
    ▼
Engine (orchestrator -> strategies)
    │
    ├─ Output 1 (Discord / CLI)
    └─ Output 2 (Dashboard JSON)
```

### 3. Feature Table
For multi-component projects, use a markdown table:

```markdown
| Component | Description |
|-----------|-------------|
| **Feature A** | What it does |
| **Feature B** | What it does |
```

For feature lists under one component, use a table with columns:

```markdown
| Strategy | Logic | Inputs |
|----------|-------|--------|
| Strategy A | MA crossover + volume confirmation | price, volume |
```

### 4. Quick Start / Installation

```markdown
## Install

\`\`\`bash
# 1. Clone
git clone https://github.com/user/project.git
cd project

# 2. Venv
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Dependencies
pip install -r requirements.txt

# 4. Config
cp config/settings.yaml config.local.yaml
# Edit with your API keys...
\`\`\`
```

**Key rules:**
- One numbered step per line
- Show both Linux and Windows commands where they differ
- Config files should have a template/sample that users copy

### 5. CLI / Usage

Show the most common commands as a list, each with a one-line comment:

```markdown
python main.py scan           # Quick scan
python main.py all            # Full pipeline
```

Then show an **example output** in a code block so users know what to expect:

```text
📊 **Scanner | 2026-04-28**
━━━━━━━━━━━━━━━━━━━━
🟢 **1. Stock A** (1234) — `+10.00%`
   分數: 96.2 | 價格: 143.0
```

### 6. Configuration Reference

Explain what each config section does, and where secrets/tokens go. Make it clear what's in `.env` vs `config.yaml`:

```markdown
## Config

| Key | Description | Source |
|-----|-------------|--------|
| `api_key` | API token | `~/.env` (never in git) |
| `batch_size` | Number per fetch | config.yaml |

All secrets in \`~/.env\`, all settings in \`config.yaml\`.
```

### 7. Project Structure

Tree view showing only the important files/dirs:

```text
project/
├── src/
│   ├── main.py       # CLI entry
│   ├── engine.py     # Orchestrator
│   └── strategies/   # Plugins
├── data/
└── README.md
```

### 8. Requirements / Dependencies

List in `requirements.txt` — reference it rather than duplicating unless the project has very few deps.

### 9. Roadmap & Disclaimer

Links to ROADMAP.md if it exists. A brief disclaimer for financial/quant projects:

```markdown
## Disclaimer

For **educational purposes only**. Not financial advice.
```

## Technique Tips

### Architecture Diagram
- Use ASCII art with `│`, `├─`, `└─`, `▼`, `▲`
- Keep it narrow (under 60 chars wide) so it renders well on mobile GitHub
- 3-4 levels max — don't try to show every component

### Tone
- English for international projects, Chinese (or user's language) for local-market tools
- Technical but friendly — avoid buzzwords
- Don't oversell: use "scanning" not "AI-powered predictive engine"

### Asset Links
- For screenshots: use the repo's raw URL or `/assets/` directory
- Don't embed media — just link to it
- Badges (CI status, coverage) are nice-to-have, link from shields.io

### Final Check
1. User can clone and run in ≤5 minutes from reading the README
2. Every command in the README actually works (test at least one example)
3. No placeholder text like `YOUR_API_KEY_HERE` that users have to guess at
4. Config secrets are clearly separated from code config
5. README renders correctly on GitHub (check that tables and code blocks close properly)
6. **LICENSE file exists** — MIT is the default for personal projects. Include it alongside the README.
7. **AGENTS.md (optional but recommended for AI-agent-friendly repos)** — Include a brief project structure overview with key file paths and conventions. AI agents working on the repo later will load this file.
