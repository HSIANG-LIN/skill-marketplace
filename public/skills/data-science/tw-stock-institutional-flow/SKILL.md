---
name: tw-stock-institutional-flow
description: >-
  Track institutional investor (三大法人/千張大戶) capital flows in Taiwan stock
  market. Analyze targets, allocation ratios, AND sell-side rationale. Designed
  for Smith's "follow the smart money" approach.
category: data-science
triggers:
  - "追蹤大戶"
  - "法人買賣超"
  - "投信"
  - "千張大戶"
  - "籌碼"
  - "資金流向"
  - "大戶動向"
---
# Taiwan Stock Institutional Flow Analysis

## When to Use This Skill

Use when the user asks to:
- Track what big players (三大法人/千張大戶) are buying/selling
- Analyze institutional capital flows and allocation direction
- Understand WHY institutions are buying or selling specific stocks
- Identify stocks with strong institutional accumulation before they surge

This is a **follow-the-smart-money** approach. The core assumption: large institutional investors have better research, so tracking their flows reveals where value is being discovered before retail catches on.

---

## Research Framework (4 Pillars)

### 1. Market Trend Layer — Where is the money flowing?

Check the **broad direction** before looking at individual stocks:

- **三大法人買賣超日數據** — which institution type is net buying/selling?
- **投信投本比排行** (most critical) — shows where domestic institutional investors are allocating fund NAV. A stock with high 投本比 AND rising trend = strong institutional conviction.
- **外資買賣超排行** — note: 外資 includes passive flows (ETF rebalancing), so cross-reference with 投信.
- **融資餘額** — retail heat indicator. High margin = crowded, risk of reversal.

### 2. Big Player Target Layer — What specific stocks?

For each target stock, gather:

- **集保股權分散表** (weekly) — track 千張大戶 vs 50張以下散戶 ratio changes:
  - 千張大戶 ↑ + 散戶 ↓ = 籌碼集中 bullish
  - 千張大戶 ↓ + 散戶 ↑ = 籌碼分散 bearish
  - Optimal range: 40%-70% concentration
  - >70% = too concentrated, exit risk
- **三大法人持股比率變化** — daily institutional ownership trend
- **投本比上升趨勢** — 3%-6% is accumulation zone; >12% = may be overheated
- **大股東申報轉讓** — insider selling is the strongest sell signal

### 3. Allocation Ratio Layer — How much conviction?

Don't just note "bought." Track **intensity**:

- Compare daily buy volume vs historical average for that stock
- Compare allocation across sectors — where is the largest % of 投信 NAV going?
- Check if buying is concentrated (one institution) or broad consensus (multiple)
- **買超張數占日均量比** — high ratio = strong conviction move

### 4. Sell-Side Analysis Layer — WHY are they selling?

**This is the most overlooked and most valuable layer.** The reason for selling reveals whether the thesis is broken or just taking profits.

| Sell Signal | Interpretation |
|---|---|
| 三大法人同步賣超 | Trend reversal — thesis may be broken |
| 投信賣 + 外資買 (土洋對作) | Short-term noise, trend may continue |
| 外資賣超但投信接 | Rotation within bullish view |
| 大股東申報轉讓 | Strongest sell — insiders exiting |
| 借券賣出餘額暴增 | Institutional hedging/ bearish bet |
| 股價大漲後法人獲利了結 | Normal profit-taking, not thesis break |

**Always search for the news context** — is the sell driven by:
- Company-specific bad news?
- Sector rotation?
- Valuation concern (PE expansion)?
- Portfolio rebalancing (index changes)?

---

## Data Sources

- 玩股網 (wantgoo) — 三大法人買賣超排行, 投本比, 集保股權分散
- 鉅亨網 (cnyes) — 法人動態, 新聞背景
- Goodinfo — 股權分散表, 大戶持股變化
- 永豐金證券 豐雲學堂 — 投本比每日排行
- CMoney / Readmo — 法人籌碼分析文章
- 公開資訊觀測站 (MOPS) — 大股東申報轉讓

---

## Smith's Preferences (Embedded)

- **Focus on sell-side rationale** — "賣的原因比買的原因更有參考價值"
- **Track allocation ratios, not just direction** — "買的比例" matters as much as "買了沒"
- **Start with market-wide flow → sector → individual stock** — don't jump into single stock analysis without context
- **Use 投信 as primary signal** — domestic institutional flows are more deliberate than foreign (which includes passive/index flows)
- **Prefer Chinese-language sources** for Taiwan market data
- **Give percentage/ratio context** — "bought 5,000 shares" is meaningless without % of daily volume or comparison to peers

## Pitfalls

- ONE day of 法人 data means little — look for trends over 5-20 trading days
- 外資 daily data is noisy (ETF rebalancing, derivatives hedging). Cross-reference with 投信 direction for cleaner signal.
- 投本比 >15% in a single name = dangerously concentrated fund position, exit risk
- 集保 monthly data only — check release timing
- New ETF launches distort 外資 flows temporarily (arbitrage between primary and secondary market)
- Do NOT confuse 借券賣出 (short selling via borrowing) with general short selling — different mechanism, same directional implication