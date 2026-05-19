---
name: knowledge-base-authoring
description: Build comprehensive documentation/knowledge base repos — content planning, parallel subagent writing, architecture diagrams, GitHub setup.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [documentation, knowledge-base, content-generation, delegate-task, subagent]
    related_skills: [project-readme, subagent-driven-development, architecture-diagram, github-repo-management]
---

# Knowledge Base Authoring

Create a well-structured, content-rich documentation or knowledge base repository. This skill handles the full lifecycle from planning to push, with heavy use of parallel subagent delegation for the content-heavy phases.

## Workflow

### 1. Scope & Structure (Clarify, Don't Over-Ask)

Ask 1-2 focused questions, then propose a structure. For this user, prefer acting over deliberating — if the user says "好了嗎" ("done yet?"), you've been overthinking. Commit to a structure and move to execution.

Required clarifiers:
- Repo name (default: snake-case descriptive name)
- Format preference (plain Markdown vs static site generator)
- Content depth (overview-only vs implementation details + diagrams)
- GitHub destination (personal vs org)

### 2. Content Outline Design

Design a hierarchical directory structure under `docs/`:

```
docs/
├── 01-topic/          # Numbered for ordering
│   ├── 01-subtopic.md
│   └── 02-subtopic.md
├── 02-topic/
assets/
├── diagrams/          # HTML/SVG architecture diagrams
examples/              # Code samples
references/            # External resources, paper lists
```

Each doc file should include YAML frontmatter (title, description, tags) for downstream compat with static site generators.

### 3. Repository Initialization

```bash
# Create GH repo, clone, build dir tree
gh repo create <name> --public --clone
mkdir -p docs/{01-*,02-*,...} assets/diagrams examples references
```

If `gh` is unavailable, use curl + GITHUB_TOKEN (see github-repo-management skill).

### 4. Parallel Content Generation (Critical Pattern)

**Split the content into balanced work packages of 5-8 files each.**

Use `delegate_task` to write subagent-tasks (max 3 concurrent, per config). Each task gets:
- The target directory path
- Exact file list with content requirements
- YAML frontmatter specification
- Language preference
- Toolsets: `["file", "terminal"]` (subagents need `write_file` access)

**Good task splits (for ~30 files):**
- Task 1: Core concepts (5 files)
- Task 2: Frameworks + protocols (9 files — 5 frameworks + 4 mcp)
- Task 3: Patterns + memory (11 files — 6 patterns + 5 memory)
- Task 4: Deploy + advanced + diagrams (9 files + 3 HTML)

**Subagent task context must include:**
```
目錄: <absolute-path>
每篇檔案需有 YAML frontmatter (title, description, tags) 和詳細內容。
全部繁體中文（if applicable）。
<file-by-file content requirements>
檔案用 write_file 寫入。
```

### 5. Content Depth Enforcement

Subagents (especially smaller models like Gemma-4) default to **shallow overview content** — 2-3 paragraphs max, no implementation details. If the user requested "詳細實作細節", you must explicitly enforce depth in the task context:

```markdown
**內容要求：** 每篇檔案需包含：
- YAML frontmatter (title, description, tags, date: 2026-XX-XX)
- 至少 3-5 個段落，包含實作細節、程式碼範例（如有）、架構說明
- 不要只寫概述 — 要有具體步驟、設定方式、常見陷阱
- date 欄位請使用正確年份（當前為 2026），不要用 2024/2025
```

**Coordinate directory structure across subagents:** When multiple subagents write to the same repo, specify the exact target path (`~/repo-name/docs/XX-topic/`) in each task's context. Different subagents may otherwise write to root-level dirs vs. `docs/` subdirs, creating duplicates.

### 6. Post-Generation Quality Assurance (Always)

After ALL subagent tasks complete, run systematic verification:

```bash
# 1. File count — compare actual vs expected
find . -type f \( -name "*.md" -o -name "*.html" \) | wc -l

# 2. Detect empty files (subagents can "create" a file but write 0 bytes)
find . -name "*.md" -empty -o -name "*.html" -empty
# Fix: write_file with complete content

# 3. Check for wrong dates (common subagent error — defaults to 2024/2025)
grep -rn "date: 2024\|date: 2025" . --include="*.md"
# Fix batch: use patch(old_string="date: 2024", new_string="date: 2026")

# 4. Check directory hygiene — subagents may write to root-level dirs
# instead of docs/ subdirs. Ensure all content is under docs/:
ls -d 0*/ 2>/dev/null && echo "WARNING: content at root level, move to docs/"

# 5. Verify internal link integrity — all [text](path) references resolve
# Use a Python script to parse markdown links and check file existence:
#   - Skip external URLs (http://, https://, #, mailto:)
#   - Resolve relative paths against the file's directory
#   - Report any broken links by source file
# Common victims: README links to docs/ paths, cross-references between chapters

# 6. Verify specific gaps
CHAPTERS=("docs/01-fundamentals" "docs/02-frameworks" ...)
for dir in "${CHAPTERS[@]}"; do
  count=$(find "$dir" -name "*.md" 2>/dev/null | wc -l)
  if [ "$count" -lt 3 ]; then echo "LOW: $dir ($count files)"; fi
done
```

Fill gaps by priority:
- **Many files missing (8+)**: Rerun a new delegate_task for just the missing section
- **5-10 files missing or shallow**: Use `execute_code` with Python's `write_file` in a batch (fastest for bulk)
- **1-4 files missing or empty**: Direct write_file calls

### 5a. Extending an Existing Knowledge Base

When adding new chapters to an already-deployed knowledge base repo (not creating from scratch):

**Workflow:**
1. **Assess the existing structure** — Read README.md, docs/ directory tree. Understand the numbering scheme and what's already covered.
2. **Design the addition** — Each new numbered chapter gets its own directory (e.g., `09-security/`). Each tutorial sequence gets a flat directory (`tutorials/`). Individual reference files like `glossary.md` go directly under `docs/`.
3. **Build content in parallel** — Split new sections into 2-3 independent `delegate_task` or batch `execute_code`/`write_file` blocks. Independent sections can run simultaneously. Example split from a real session:
   - Task 1: Security chapter (5 files on Prompt Injection, Tirith, sandbox, secrets, threats)
   - Task 2: Cost management + glossary (3 files + 1 file)
   - Task 3: Tutorials (5 step-by-step guides)
4. **Update README** — Two spots must be updated:
   - **Directory tree**: Add new entries in `├── docs/` section in correct alpha/numeric order
   - **Quick navigation table**: Add rows for the new sections (format: "If you're looking for X → [link] → [link]")
5. **Replace old content carefully** — If removing old files (e.g., corporate-specific case studies), verify README had no dangling links. Use `git add -A` to auto-stage deletions.

**Proprietary content policy:** When building a knowledge base for public GitHub sharing, **never include user-specific case studies, real project details, or proprietary architecture** without explicit permission. Instead, replace with generic template examples (e.g., "客服 Agent", "研究助理") that demonstrate the pattern without revealing internal specifics. If the user says "這是我們的專業 不要透露", immediately replace those files with sanitized versions.

**Verification after extension:**
- [ ] All new files exist at expected paths (compare against plan)
- [ ] Old files removed (if applicable) — no dangling README links
- [ ] README directory tree reflects new structure
- [ ] README quick-nav table includes entries for new sections
- [ ] Internal link check passes (`find . -name "*.md"` + regex parse `[text](link)`)

### 7. Handling Partial Subagent Failures

Subagents may fail silently (401 auth errors, max_iterations) or write only a subset. Common failure modes:
- **Auth errors**: The subagent's model provider key may differ from the main agent's. If delegate_task fails with 401, try again — it may resolve, or dispatch fewer tasks.
- **Partial writes**: A subagent assigned 9 files might only write 3-4 before hitting the turn limit. The tool_trace shows actual write_file calls — compare against expected count.
- **Empty files**: A subagent may create the file on disk but write 0 bytes (the write_file call succeeded with empty content). Always check `find . -name "*.md" -empty`.

### 8. Architecture Diagrams

For technical documentation, create 2-3 HTML/SVG architecture diagrams using `architecture-diagram` skill's dark theme (slate-950 bg, neon semantic colors). Save in `assets/diagrams/`.

Diagrams should cover:
- System architecture overview
- Key process flows
- Layered abstractions (if applicable)

### 9. README Authoring

Write a comprehensive README with:
- Project title + badge bar
- Content table of contents mirroring `docs/` structure
- Quick navigation table ("If you're X, start here")
- Architecture diagram previews (use relative paths)
- Contributing guidelines
- License

Use the `project-readme` skill for format guidance.

### 8. Git Push

```bash
cd <repo>
git remote set-url origin https://github.com/<user>/<repo>.git  # strip embedded token
git config user.name "<username>"
git config user.email "<email>"
git add -A
git commit -m "Initial <description> knowledge base"
git push origin main
```

## Pitfalls

- **Proprietary case studies on public repos**: When the user says "這是我們的專業 不要透露" (this is our expertise, don't reveal), immediately replace real project case studies with generic sanitized templates. Real session: stock-scanner case study (yfinance batching, FinMind fallback, Discord delivery, strategy engine) was replaced with generic "building-a-customer-support-agent" and "building-a-research-agent" templates. These demonstrate the pattern without leaking our specific architecture. Delete old files, write new generic ones, update README references.
- **Over-deliberation**: The user hates "analysis paralysis." If you've been researching/analyzing for more than 2-3 tool calls without executing, you're already too slow. Commit to a path and start building.
- **Subagent partial writes**: Subagents using Gemma-4 as the model may hit auth issues (401) or max_iterations and only write 3-4 of their 9 assigned files. Always verify file count after delegation.
- **GitHub token in remote URL**: When cloning with `https://$TOKEN@github.com/...`, the token is embedded in the remote URL. Strip it after commit: `git remote set-url origin https://github.com/user/repo.git`.
- **Commit message with special characters**: `feat: ... & ...` — the `&` is interpreted by bash as backgrounding. Use simple commit messages or single quotes.
- **README collision**: If repo was created with `auto_init=true`, `README.md` already exists. The `git add -A` + commit will properly overwrite it.
