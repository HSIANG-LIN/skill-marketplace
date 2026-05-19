---
name: quant-smart-report
description: Workflow for transforming raw quantitative scan results into professional, human-readable "Smart Reports" with reasoning and expert opinions.
---

# quant-smart-report

A workflow for transforming raw quantitative scan results (from stock scanners, crypto bots, etc.) into professional, human-readable "Smart Reports" suitable for messaging platforms like Telegram.

## Overview
Instead of delivering raw data tables, this skill focuses on providing **actionable intelligence** by combining semantic reasoning, heuristic-based opinions, and mobile-optimized formatting.

## Workflow

### 1. Data Cleaning & Filtering (The "Signal" Phase)
* **De-duplication**: Remove redundant information (e.g., if the stock code is already in the name, don't repeat it: `0050 [0050] Taiwan 50` -> `0050 Taiwan 50`).
* **Quality Filtering**: Filter out "noise" by removing results with near-zero scores, zero price movement, or `NaN` values.
* **Significance Thresholds**: Only include results that meet a minimum "interest" threshold (e.g., `score > 1.0` or `vol_surge > 2.0`).

### 2. Semantic Reasoning (The "Why" Phase)
Convert technical metadata into natural language explanations.
* **Mapping Metrics to Verbs**:
    * `Volume Surge (x)` $\rightarrow$ "Volume expansion/explosion of [x]x".
    * `Price Relative (MA)` $\rightarrow$ "Price breaking out of the [period] day moving average".
    * `Industry Strength` $\rightarrow$ "Supported by strong sector rotation/momentum".
* **Template**: `💡 [Reasoning Statement]`

### 3. Heuristic Analysis (The "Alpha/Opinion" Phase)
Apply expert-level heuristics to provide a "Quant View" or "Risk/Reward" assessment.
* **Exhaustion Detection**: If `Volume Surge` is extremely high (e.g., > 5x) AND `Price Change` is extreme $\rightarrow$ "Warning: Potential buying climax/exhaustion."
* **Trend Confirmation**: If `Industry Strength` is high AND `Price > MA` $\rightarrow$ "Stable sector-driven trend; good for swing trading."
* **Fragility Check**: If `Price Change` is high BUT `Volume Surge` is low $\rightarrow$ "Fragile breakout; watch for low-volume reversal."
* **Template**: `🧠 [Expert View/Warning]`

### 4. Messaging Platform-Optimized Formatting

Avoid Markdown tables, which break on mobile (Telegram/Pigeon re-writes them to row-group bullets anyway, so produce bullets directly). Use a hierarchical list structure.

#### Conciseness Heuristic: Less Is More

Users on messaging platforms (Telegram, Discord) suffer from **notification fatigue** — they scan, not read. A single ~700-char message that fits in one glance beats three messages requiring scrolling, even if the three contain more data.

**Signal recognition:** When a user says "不然很累" (it's tiring), "太長" (too long), or similar fatigue signals, apply the conciseness heuristic on next delivery:

1. **Cut the top-N**: Reduce from 20→8 or 15→5. The tail items matter less.
2. **One message only**: If total chars exceed platform limit (Discord=2000), cut more instead of splitting.
3. **Add cumulative signals**: Capture "quiet accumulation" (5-day rolling sums) to replace individual daily noise.
4. **Save full data for dashboard**: The single message is a teaser; the full dataset lives in a web dashboard link.

**Case study — Institutional flow report (user call: "不然很累"):**

| Before | After |
|--------|-------|
| 3 messages × ~800 chars (~2400 total) | 1 message × ~680 chars |
| 4 sections (total/foreign/trust/dealer × top 20) | 3 sections (buy top 8 / sell top 8 / 5-day cumulative top 5) |
| Separate foreign/trust/dealer breakdowns | Only total net (consolidated) |
| No cumulative tracking | 5-day cumulative buy as "low-key accumulation" signal |
| User response: requested change | User response: "好 這樣比較好" |

**Formatting guardrails for concise mode:**

- Buy and sell each get ONE compact block (not per-institution)
- Use abbreviated units: `萬` instead of `萬張`, omit `張`/`股` when clear from context
- Rank change badges: `🔺2` (up 2 spots), `🔴新` (new entry), `⚪3d` (3 days in a row)
- Legend line at bottom: `_🔴新 🔺↑ 🔻↓ ⚪─ ⚪Nd=連N天_`

#### Groupings
* **Hierarchy**:
    * **Primary Line**: `• [Code] [Name] | [Price] ([Change]) | Score: [Score]`
    * **Sub-line 1**: `  └ 💡 [Reasoning]`
    * **Sub-line 2**: `  └ 🧠 [Opinion]`

## Example Output
🚀 **今日選股報告 (精選)**

🔹 **【突破型】強勢爆量**
• `01001T` 土銀富邦R1 | 11.95 (+0.25%) | Score: 2.75
  └ 💡 成交量爆發 4.92 倍，價格伴隨量能緩步突破。
  └ 🧠 典型量價配合，建議觀察明日是否能持續站穩。

🔹 **【趨勢型】穩健上揚**
• `5481` 新華 | 22.80 (+6.05%) | Score: 0.02
  └ 💡 股價穩定站於均線，且產業趨勢同步轉強。
  └ 🧠 產業帶動趨勢，屬於穩健型走勢。
