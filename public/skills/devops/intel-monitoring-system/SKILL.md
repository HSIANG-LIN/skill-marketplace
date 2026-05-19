---
name: intel-monitoring-system
description: Set up automated intelligence monitoring — RSS readers, web-scraping cron jobs, multi-source daily briefings (tech/AI/quant/taiwan-market), and Streamlit dashboards for browsing collected articles. For users who want the agent to proactively hunt for information rather than wait for links.
trigger: user says "你才去學" / "你自己去搜集" / "弄個cron" / "有沒有什麼更新的" / "幫我監控" / wants proactive daily briefing or tech monitoring
---

# Intel Monitoring System

Build a self-updating intelligence gathering pipeline that collects from RSS feeds, web searches, and optional X/Twitter/YouTube sources, then delivers a curated daily briefing.

## Architecture

```
┌────────────────────────────────────────────────────┐
│  PHASE 1: 0 LLM Token Collection (CLI tools)      │
│  intel_collect.py: curl + yt-dlp + rdt-cli         │
│    → GitHub Trending (15 repos)                    │
│    → YouTube (10 videos)                           │
│    → Reddit (10 posts)                             │
│    → X/Twitter (via twitter-cli, needs cookie)     │
└──────────────┬─────────────────────────────────────┘
               │ raw JSON data
               ▼
┌────────────────────────────────────────────────────┐
│  PHASE 2: LLM Briefing (single agent call)        │
│  Reads Phase 1 JSON + RSS output →                │
│  Summary + Skills Recommendations → Telegram      │
└────────────────────────────────────────────────────┘

cron job A (no_agent=True, every 4h) → RSS reader script → SQLite dedup
cron job B (agent mode, daily 07:00) → runs BOTH Phase 1 + 2)
Dashboard (Streamlit) → reads SQLite DB + recommendations JSON
```

**Cost model**: Phase 1 = $0 (no LLM calls). Phase 2 = 1 LLM call.
Previous approach: 1 LLM call for cron + 4 delegate_task sub-calls for web_search = ~5-15 LLM calls.
Savings: ~90% reduction in LLM token cost for daily briefing.

## Step 1: RSS Reader Script (`intel_gather.py`)

Place in `~/.hermes/scripts/intel_gather.py`. Key design:

**Don't use blogwatcher-cli** — its feed auto-discovery is unreliable. Write a pure-Python script with:
- `urllib.request` for feed fetching (no extra deps)
- Manual RSS/Atom XML parsing via `xml.etree.ElementTree`
- SQLite for article dedup (`seen` table with hash on url+title)
- Category grouping in a `DEFAULT_SOURCES` dict

Structure the sources as a dict of categories → list of feeds:

```python
DEFAULT_SOURCES = {
    "AI & ML": [
        {"name": "Hugging Face Blog", "url": "https://huggingface.co/blog/feed.xml"},
    ],
    "AI Agent & LLM Optimization": [...],
    "Quant & Trading": [...],
    "Tech News": [...],
    "YouTube (AI channels)": [...],
}
```

**Critical implementation details:**
- `no_agent=True` cron with empty stdout = SILENT — perfect for RSS scanning
- Use `_MLStripper(HTMLParser)` subclass for HTML cleaning (not bare HTMLParser — it lacks `get_data()`)
- Rate-limit timeout: 15s per fetch
- First run will dump ALL historical articles (thousands). Use `--reset` for fresh start

## Step 2: Cron Jobs

### RSS Scan (no_agent)
```bash
cronjob action=create name="intel-rss-scan" schedule="0 */4 * * *" \
  script="intel_gather.py" no_agent=true deliver=local
```
- Silent when 0 new articles
- Only messages when new content found

### Daily Briefing (two-phase: 0-token collection + 1 LLM call)

```bash
cronjob action=create name="intel-daily-briefing" schedule="0 7 * * *" \
  enabled_toolsets='["terminal","web"]' deliver=origin
```

**Phase 1: Zero-LLM Collection** — Cron agent runs `intel_collect.py` first:
- `python3 ~/.hermes/scripts/intel_collect.py`
- Uses CLI tools (curl, yt-dlp, rdt-cli) — **zero LLM tokens**
- Returns structured JSON with GitHub repos, Reddit posts, YouTube videos
- Twitter requires cookie auth (skipped by default; see Pitfalls)

**Phase 2: LLM Summary** — Agent reads the collected JSON and produces:
- Intelligence briefing (AI/LLM/agent/tools news)
- Skills recommendations (what to add/update/retire)
- Output: Telegram message + `latest_recommendations.json`

**Prompt guidelines** (embedded in cron prompt):
1. Start by running `intel_collect.py` and reading its output
2. Read RSS results from `intel_gather.py` (cached in SQLite)
3. Run it if stale)
3. Produce: 500-800 char briefing in Traditional Chinese + save recommendations JSON
4. Each recommendation must include: `name`, `description`, `source`, `url`, `priority` (high/medium/low), `related_skills`, `rationale`, and `agent_opinion` (why this matters to this specific user's workflow)
5. Save recommendations to: `~/.hermes/data/latest_recommendations.json` as `{"timestamp": "...", "recommendations": [...]}`
6. Language: Traditional Chinese for all user-facing output

**Previous approach (DEPRECATED)**: Do NOT use `delegate_task` × `web_search` for individual sources. The old approach used 4 parallel web_search calls per source — expensive and slow. The CLI collection script is faster, cheaper, and more structured.

## Step 3: CLI Tools & Zero-LLM Collection (`intel_collect.py`)

### Tool Installation

```bash
# pipx for isolated Python CLI installs
pip install pipx
pipx ensurepath

# YouTube search (--flat-playlist --dump-json for zero-token structured output)
pipx install yt-dlp

# Reddit CLI (no auth needed for browsing)
pipx install rdt-cli

# Twitter/X CLI (needs cookie auth — requires throwaway account)
pipx install twitter-cli

# Verify
yt-dlp --version   # ≥ 2026.03
rdt-cli --version  # ≥ 0.4
twitter-cli version # ≥ 0.8
```

### Script Structure (`~/.hermes/scripts/intel_collect.py`)

The script has three parallel collectors that each return structured JSON:

**GitHub Trending Collector**
```python
import subprocess, json, re

def collect_github_trending():
    """curl GitHub Trending weekly page, 0 LLM tokens"""
    cmd = ["curl", "-s",
           "-H", "Accept: text/html",
           "https://github.com/trending?since=weekly"]
    html = subprocess.check_output(cmd, timeout=30).decode()
    # Extract repo blocks with regex
    pattern = r'<h2[^>]*class="h3 lh-condensed"[^>]*>.*?href="/([^"]+)".*?</h2>'
    repos = re.findall(pattern, html, re.DOTALL)
    return repos[:15]  # limit to 15
```

**YouTube Collector**
```python
def collect_youtube():
    """Search YouTube with yt-dlp --flat-playlist --dump-json"""
    queries = ["AI agent tool review 2026",
               "coding AI agent new release 2026"]
    results = []
    for q in queries:
        cmd = ["yt-dlp", "--flat-playlist", "--dump-json",
               f"ytsearch5:{q}"]
        output = subprocess.check_output(cmd, timeout=30).decode().strip()
        for line in output.split("\n"):
            if not line: continue
            d = json.loads(line)
            results.append({
                "title": d.get("title"),
                "channel": d.get("channel", ""),
                "url": d.get("webpage_url", d.get("url", "")),
                "views": d.get("view_count", 0),
                "duration": d.get("duration_string", ""),
            })
    return results
```

**Reddit Collector**
```python
def collect_reddit():
    """Use rdt-cli to search subreddits"""
    subs = ["LocalLLaMA", "MachineLearning"]
    results = []
    for s in subs:
        cmd = ["rdt-cli", "search", "-r", s, "-l", "5", "-s", "top",
               "-t", "week", "AI agent OR coding agent OR LLM tool"]
        try:
            out = subprocess.check_output(cmd, timeout=30).decode()
            # rdt-cli returns markdown-formatted posts
            results.append({"source": f"r/{s}", "raw": out})
        except subprocess.CalledProcessError:
            continue
    return results
```

**Twitter Collector** (requires cookie auth — skipped by default)
```python
def collect_twitter(env):
    """Requires TWITTER_AUTH_TOKEN + TWITTER_CT0 env vars"""
    token = env.get("TWITTER_AUTH_TOKEN")
    ct0 = env.get("TWITTER_CT0")
    if not token or not ct0:
        print("[SKIP] Twitter: set TWITTER_AUTH_TOKEN + TWITTER_CT0")
        return []
    # ... uses twitter-cli with cookie headers
```

**Main** — runs all three and outputs JSON:
```python
if __name__ == "__main__":
    results = {}
    results["github"] = collect_github_trending()
    results["youtube"] = collect_youtube()
    results["reddit"] = collect_reddit()
    results["twitter"] = collect_twitter(os.environ)
    print("---json-start---")
    print(json.dumps(results, ensure_ascii=False, indent=2))
    # Combined count: ~35 items (15 GH + 10 YT + 10 Reddit)
```

### Key Design Decisions

- `---json-start---` marker: The cron prompt instructs the LLM to extract JSON after this marker. Makes parsing unambiguous even if the script prints debug info.
- Pipenv/isolation: Install CLI tools via `pipx` so each has its own isolated venv — no version conflicts.
- Timeouts: 30s per subprocess call. If any collector times out, it returns empty results for that source (other sources unaffected).
- **shlex.quote()** when interpolating user input into shell commands — never raw f-string interpolation into shell.

## Step 4: Streamlit Dashboard

A simple read-only viewer for `intel_gather.db`:
- Sidebar: category filter, source filter, days slider
- Stats row: total articles, source count, category count, recent count
- Article list with links, source badges, date stamps
- Dark theme CSS for consistency

Run via: `streamlit run ~/.hermes/scripts/intel_dashboard.py`

## Pitfalls & Troubleshooting

- **Feed URLs rot quickly.** Anthropic, Meta AI, Sebastian Raschka feeds all return 404. Test each feed URL with `curl -I` before adding. Hugging Face blog is the most reliable (hundreds of articles).
- **YouTube channel RSS** uses specific feed URLs: `https://www.youtube.com/feeds/videos.xml?channel_id=UC...` — find channel ID from the channel page HTML.
- **Hacker News RSS timeout** — set longer timeout or use `hnrss.org` endpoint.
- **huggingface.co has a huge backlog.** First run will dump 500+ articles dating back years. The SQLite dedup handles this, but the initial output is massive. Use `--reset` after initial test to clear.
- **OpenRouter API limits** — if the briefing cron fails, check OpenRouter key limits first, not the script.

### Zero-LLM Collection Pitfalls

- **GitHub Trending requires `Accept: text/html` header** — without it, GitHub returns JSON API response (no HTML parsing possible). Always include `-H "Accept: text/html"`.
- **yt-dlp rate limits** — at most 5 results per query (`ytsearch5:`). For more results, use multiple queries or paginated search. yt-dlp may return cached results; `--no-cache-dir` forces fresh data.
- **rdt-cli needs explicit flags** — always specify `-r`, `-l`, `-s`, `-t` explicitly. Default behavior varies. The `-t week` flag limits to weekly top posts.
- **rdt-cli exit code ≠ empty** — `rdt-cli search` exits 0 even with no results. Always check output length.
- **pipx PATH issues in cron** — cron runs with a minimal PATH. Add `PATH=$PATH:$HOME/.local/bin` in the cron prompt or script. Hermes cron sessions load user shell profile so this is usually fine, but test.
- **twitter-cli needs cookie auth** — not OAuth. Set `TWITTER_AUTH_TOKEN` and `TWITTER_CT0` env vars from a logged-in browser session. These expire periodically (every few months). Use a throwaway account with no real identity.
- **Subprocess timeout per source** — if one source hangs, the whole script hangs. Use `subprocess.check_output(cmd, timeout=30)` with individual timeouts per collector. Wrap each collector in try/except so one failure doesn't kill the other sources.

## Personal Browsing Data Source: Browser Watcher

An extension to the intel pipeline: a Chrome extension (MV3) + WSL Python server that tracks what pages you actually read, for how long, and how far you scrolled. Data is stored as JSONL on the Windows filesystem bridge.

See `references/browser-watcher-integration.md` for full architecture, file paths, cron lifecycle, data format, and integration code.

## Related

- `stock-research-pipeline` — similar pattern but focused on single-stock deep research via FinMind/TWSE
- `stock-scanner` — daily market scan cron job, similar cron architecture