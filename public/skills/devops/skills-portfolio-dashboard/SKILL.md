---
name: skills-portfolio-dashboard
description: Build and manage the Skills Portfolio dashboard + daily discovery cron job — Streamlit skills browser with category filter/search + 07:00 daily intelligence gathering (GitHub Trending, YouTube, Reddit, X)
version: 1.2.0
tags: [skills, dashboard, streamlit, cron, intelligence, discovery]
---

# Skills Portfolio Dashboard

The Skills Portfolio system consists of two components:

## 1. Skills Dashboard (Streamlit)

- **Script**: `~/.hermes/scripts/skills_portfolio.py`
- **Port**: 8511
- **URL**: `http://localhost:8511`
- **Data source**: Scans `~/.hermes/skills/<category>/<skill>/SKILL.md` frontmatter
- **Features**:
  - 3 tabs: Skills List, Daily Recommendations, Category Stats
  - Category filter (sidebar selectbox)
  - Search (fuzzy match on name + description + tags)
  - Dark theme (matching Hermes aesthetic)
- **Start**: `bash ~/.hermes/scripts/skills_dashboard_start.sh`
- **Stop**: `bash ~/.hermes/scripts/skills_dashboard_stop.sh`

## 2. Daily Discovery (Merged into Intel Briefing)

⚠️ **2026-05-18: Cost optimization merge.** `skills-daily-discovery` was removed. Skills discovery was merged into the `intel-daily-briefing` cron job at 07:00.

- **Job name**: `intel-daily-briefing` (07:00 daily)
- **What it does**: One LLM call does TWO things:
  1. Intelligence briefing (AI/LLM/agent news → Telegram)
  2. Skills discovery (GitHub Trending, Reddit → `latest_recommendations.json`)
- **Output**: Saves to `~/.hermes/data/latest_recommendations.json`
- **Dashboard reads**: `load_recommendations()` from that JSON
- **Opinionated output**: Each recommendation includes `agent_opinion` — a first-person take from the agent's perspective on why this tool matters to this specific user. The cron prompt instructs the agent to evaluate: "裝了這個我能幫你多做什麼？跟我們既有的 workflow 有什麼實際交集？解決了哪個以前看著你手動操作的痛苦？"

### Cron Merging Pattern (Cost Optimization)

When multiple cron jobs run at the same time (~07:00), **merge them into one** to save LLM calls:

1. Identify co-located jobs (same time-of-day schedule)
2. Update one job's prompt to do both tasks (use `### Part 1` / `### Part 2` sections)
3. Remove the redundant job with `cronjob(action='remove')='remove')`
4. This saves: 1 full agent + 4 delegate_task sub-calls per day (~5-15 LLM calls saved)

**Rule of thumb**: If two cron jobs fire within 30 minutes of each other, they can probably merge.

### Dashboard Start/Stop Cron Jobs
- Start: `skills-dashboard-start` → 07:30 daily (no_agent=True)
- Stop: `skills-dashboard-stop` → 22:00 daily (no_agent=True)

## Architecture Notes

- `load_skills()` scans disk by default (more reliable than CLI parsing)
- CLI fallback: `hermes skills list` if disk scan returns empty
- `load_recommendations()` reads from `~/.hermes/data/latest_recommendations.json`
  - **Must handle both formats**: the file can be a dict (`{recommendations: [...]}`) OR a bare list (`[...]`)
  - Pattern: check `isinstance(data, list)` and wrap if needed:
    ```python
    if isinstance(data, list):
        return {"timestamp": "", "recommendations": data}
    return data
    ```
  - This happens when the cron agent writes JSON as a bare array instead of a wrapped object — always be defensive
- The daily discovery uses zero-LLM CLI collection (`intel_collect.py` via yt-dlp, rdt-cli, curl) — no `web_search` or `delegate_task` calls. See `intel-monitoring-system` skill for details.
  - **Cost savings**: 1 LLM call/day vs ~5-15 previously.
- Priority: quality > quantity for recommendations

## Design Principles (Smith Standard)

Smith 對 UI 品質有要求 — 不接受 basic Streamlit 預設風格。參考 `references/streamlit-design-patterns.md` 取得複用 pattern。

**核心原則：**
1. 深色主題（背景 `#0a0a0f` + 三層 radial gradient 光暈）
2. Inter font（Google Fonts import），覆蓋 Streamlit 預設 Source Sans
3. 玻璃擬態卡片（`rgba(255,255,255,0.04)` 背景 + `backdrop-filter: blur()` + 圓角 + hover 動畫）
4. 分類配色系統 — 每個 category 有自己的顏色（devops 藍、creative 粉、data-science 綠…）
5. Hover 動畫要細膩 — border color 轉變、`translateY(-2px)` 微上浮、頂部 gradient border reveal

**Smith 參考來源：** [Claude Code Front-End Design Skill 影片](https://youtube.com/watch?v=86HM0RUWhCk) — 核心啟發是用 system prompt / skill 定義視覺風格，讓輸出有品牌感而非 vibe code。

## Daily Picks Cards (Recommendations)

The "Daily Picks" tab renders recommendation cards with clickable source links and optional agent opinion sections.

See `references/daily-picks-card-patterns.md` for full card rendering patterns (HTML structure, f-string quoting rules, CSS classes, conditional opinion block, JSON shape, and patch workflow).

### Data shape (JSON at `~/.hermes/data/latest_recommendations.json`)

Each recommendation has: `name`, `description`, `source`, `url`, `priority`, `related_skills`, `rationale`.

### Card rendering pattern (f-string quoting trick)

Inside `st.markdown(f"""...""", unsafe_allow_html=True)`, use **single quotes** for Python dict keys inside HTML attributes:

```python
<div class="rec-meta">Source: <a href="{item.get('url', '#')}" target="_blank">{item.get('source', '?')}</a>{rel_h}</div>
```

- Triple-quoted f-strings (`f"""..."""`) mean double quotes inside are just HTML, not Python string delimiters
- Use `item.get('url', '#')` (single quotes) inside the f-string to avoid breaking the HTML quoting
- This works: `f"""...<a href="{item.get('url', '#')}">...</a>..."`

### Agent Opinion / "My Take" section

Each recommendation can include an `agent_opinion` field — first-person reasoning from the agent's perspective. Render it conditionally:

```python
opin = item.get('agent_opinion', '')
opin_block = f'<div class="rec-opinion"><div class="rec-opinion-label">My Take</div>{opin}</div>' if opin else ''
```

Then insert `{opin_block}` in the card HTML between `</div>` of rec-meta and `</div>` of rec-card.

CSS for the opinion block:
```css
.rec-opinion {
    font-size: 0.8rem;
    color: #e0e7ff;
    background: rgba(99,102,241,0.08);
    border-left: 2px solid rgba(99,102,241,0.4);
    margin-top: 0.6rem;
    padding: 0.5rem 0.7rem;
    border-radius: 0 6px 6px 0;
    line-height: 1.5;
}
.rec-opinion-label {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #818cf8;
    margin-bottom: 0.25rem;
}
```

### Priority icon mapping

```python
icons = {"high": "🔴", "medium": "🟡", "low": "🟢"}
```

### Related skills display

Show related skill names after the source link, comma-separated:
```python
rel_h = f" · {', '.join(rel)}" if rel else ""
```

### CSS for rec-meta links

```css
.rec-meta a {
    color: #93c5fd;           /* light blue */
    text-decoration: none;
    border-bottom: 1px dotted rgba(147,197,253,0.3);
    transition: border-color 0.2s;
}
.rec-meta a:hover {
    border-bottom-color: #93c5fd;  /* solid underline on hover */
}
```

Link appears as a subtle dotted underline that turns solid on hover — matches the dark glassmorphism aesthetic.

## Dashboard Start Script

Use `python3 -m streamlit` instead of bare `streamlit` for cron compatibility:
```bash
nohup python3 -m streamlit run "$SCRIPT" --server.port "$PORT" > /tmp/skills_dashboard.log 2>&1 &
```

## ⚠️ WSL 手動啟動注意

當 dashboard 沒有在跑時（如 gateway 重啟後），需要手動啟動：

```bash
# 正確方式：用 terminal(background=true) 讓 Hermes 追蹤 process
# 在 agent 工具中執行：
# terminal(command="cd ~/.hermes/scripts && python3 -m streamlit run skills_portfolio.py --server.port 8511 --server.headless true", background=true)

# 錯誤方式（不要用）：
# nohup python3 -m streamlit ... &   ← shell-level background wrapper 會被 Hermes 拒絕
```

驗證啟動成功：`curl -s -o /dev/null -w "%{http_code}" http://localhost:8511` → 應回 200

## CSS Workflow (Streamlit)

Streamlit CSS debugging 容易踩坑：
1. CSS 寫在 Python f-string 裡 → 小心引號跳脫（用 `"""..."""` raw string）
2. `background-image` 和 `background` 是不同屬性 — 設 gradient 時也要設 `!important` 蓋掉 Streamlit 預設
3. Font 載入要在 CSS 最頂層（`@import`）
4. 重啟 Streamlit 才能套 CSS 變更 → 用 stop script 再啟動
5. 用 browser_console 檢查 computed style（`getComputedStyle(el).backgroundImage` 驗證 gradient）
6. 不要用 `st.markdown` 包 `style` tag → 用單獨 `st.markdown(f"<style>{CSS}</style>", unsafe_allow_html=True)` 在最前面
7. Streamlit override Streamlit 元件：`[data-baseweb="tab"]` / `[aria-selected="true"]`
