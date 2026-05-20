import { getAllSkills } from "@/lib/skills-data";
import Link from "next/link";

// Simon's most used skills, ranked by actual usage frequency
// Data source: session logs + cron jobs + memory analysis
const MY_SKILLS = [
  // Tier 1: Daily / Core (score 15+)
  { slug: "github", tier: "core", note: "PR workflow, code review, repo management — 幾乎每天用" },
  { slug: "mcp", tier: "core", note: "MCP servers & tool integration — 所有 agent 的基礎" },
  { slug: "hermes-agent", tier: "core", note: "核心平台 — 所有功能的基礎" },

  // Tier 2: Frequently Used (score 5-14)
  { slug: "stock-scanner", tier: "frequent", note: "盤後法人資料掃描 + retry logic — 週一到五 16:30" },
  { slug: "intel-daily-briefing", tier: "frequent", note: "每日情報搜集 + 技能推薦 — 每天 07:00" },
  { slug: "research", tier: "frequent", note: "arXiv, blogwatcher, Polymarket 研究工具" },
  { slug: "dspy", tier: "frequent", note: "GEPA 技能演化 + DSPy 框架整合" },
  { slug: "plan", tier: "frequent", note: "spec-driven 開發流程" },
  { slug: "codegraph", tier: "frequent", note: "Code knowledge graph — 2,155 files indexed" },
  { slug: "restaurant-dashboard", tier: "frequent", note: "美食地圖 + 待看清單管理" },
  { slug: "browser-watcher", tier: "frequent", note: "Chrome extension 追蹤閱讀行為" },

  // Tier 3: Regularly Used (score 3-4)
  { slug: "watchlist-dashboard", tier: "regular", note: "待看清單瀏覽器 — Streamlit" },
  { slug: "skills-portfolio-dashboard", tier: "regular", note: "技能庫儀表板 — 每日自動更新" },
  { slug: "github-pr-workflow", tier: "regular", note: "GitHub PR 生命週期管理" },
  { slug: "media", tier: "regular", note: "YouTube, GIF, 音樂生成" },
  { slug: "agentmemory", tier: "regular", note: "Local embeddings memory server" },
  { slug: "plur", tier: "regular", note: "跨 Agent 共享記憶層" },
  { slug: "rtk-hermes", tier: "regular", note: "終端輸出壓縮 60-90%" },
  { slug: "codex", tier: "regular", note: "OpenAI Codex CLI 委派編碼" },
  { slug: "models", tier: "regular", note: "模型管理與切換" },

  // Tier 4: Occasionally Used (score 1-2)
  { slug: "fix-version-mismatch-api", tier: "occasional", note: "版本相容性修復 — DSPy 3.2.0" },
  { slug: "notion", tier: "occasional", note: "Notion API 整合" },
  { slug: "native-mcp", tier: "occasional", note: "原生 MCP client" },
  { slug: "mcporter", tier: "occasional", note: "MCP CLI bridge" },
  { slug: "arxiv", tier: "occasional", note: "學術論文搜尋" },
  { slug: "spec-driven-brief", tier: "occasional", note: "專案啟動 spec 撰寫" },
  { slug: "quant-tracking-dashboard", tier: "occasional", note: "量化追蹤儀表板" },
  { slug: "news-aggregator-workflow", tier: "occasional", note: "新聞彙整 workflow" },
  { slug: "hermes-agent-skill-authoring", tier: "occasional", note: "Skill 撰寫指南" },
  { slug: "blogwatcher", tier: "occasional", note: "RSS/Atom feed 監控" },
  { slug: "quant-smart-report", tier: "occasional", note: "量化報告轉換" },
  { slug: "atlas-ppm", tier: "occasional", note: "平行專案管理" },
  { slug: "spec-driven-implementation", tier: "occasional", note: "Spec-driven 實作流程" },
];

const TIER_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  core: { label: "🔴 Core", color: "border-red-500/30 bg-red-500/5", desc: "每天使用，核心基礎設施" },
  frequent: { label: "🟠 Frequent", color: "border-orange-500/30 bg-orange-500/5", desc: "經常使用，每週多次" },
  regular: { label: "🟡 Regular", color: "border-yellow-500/30 bg-yellow-500/5", desc: "定期使用，每週一次" },
  occasional: { label: "⚪ Occasional", color: "border-gray-500/30 bg-gray-500/5", desc: "偶爾使用，按需取用" },
};

export default function MySkillsPage() {
  const allSkills = getAllSkills();

  // Group by tier
  const tiers = ["core", "frequent", "regular", "occasional"] as const;

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-12">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-300">My Skills</span>
        </nav>

        <h1 className="text-4xl font-bold text-white mb-3">My Skills</h1>
        <p className="text-gray-400 text-lg max-w-2xl">
          Simon Dou 的常用技能清單。根據 session 對話紀錄、cron job 執行頻率、
          與記憶中的使用模式綜合分析，自動排序。
        </p>

        {/* Stats */}
        <div className="flex items-center gap-8 mt-8">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{MY_SKILLS.length}</div>
            <div className="text-xs text-gray-500 mt-1">Tracked Skills</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{MY_SKILLS.filter(s => s.tier === "core").length}</div>
            <div className="text-xs text-gray-500 mt-1">Core</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">{MY_SKILLS.filter(s => s.tier === "frequent").length}</div>
            <div className="text-xs text-gray-500 mt-1">Frequent</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">{MY_SKILLS.filter(s => s.tier === "regular").length}</div>
            <div className="text-xs text-gray-500 mt-1">Regular</div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-400">{MY_SKILLS.filter(s => s.tier === "occasional").length}</div>
            <div className="text-xs text-gray-500 mt-1">Occasional</div>
          </div>
        </div>
      </div>

      {/* Tiers */}
      {tiers.map((tier) => {
        const tierSkills = MY_SKILLS.filter((s) => s.tier === tier);
        if (tierSkills.length === 0) return null;
        const info = TIER_LABELS[tier];

        return (
          <section key={tier} className="mb-14">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-white">{info.label}</h2>
              <span className="text-sm text-gray-500">— {info.desc}</span>
            </div>
            <div className="text-sm text-gray-500 mb-6">
              {tierSkills.length} skills
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {tierSkills.map((ts) => {
                const skill = allSkills.find((s) => s.slug === ts.slug);
                if (!skill) {
                  // Skill not in marketplace, show placeholder
                  return (
                    <div
                      key={ts.slug}
                      className={`rounded-2xl border ${info.color} p-5`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                          {ts.slug}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{ts.slug}</h3>
                      <p className="text-sm text-gray-400">{ts.note}</p>
                      <div className="mt-3 text-xs text-gray-500">Not in marketplace</div>
                    </div>
                  );
                }
                return (
                  <div key={ts.slug} className="relative">
                    <Link href={`/skill/${skill.slug}`}>
                      <div className={`group rounded-2xl border ${info.color} p-5 hover:scale-[1.02] transition-all duration-200 cursor-pointer h-full`}>
                        <div className="flex items-start justify-between mb-3">
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                            {skill.category}
                          </span>
                          {skill.version && (
                            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                              v{skill.version}
                            </span>
                          )}
                        </div>
                        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                          {skill.name}
                        </h3>
                        <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                          {skill.description}
                        </p>
                        <div className="text-xs text-indigo-400/70 border-t border-white/5 pt-3 mt-3">
                          💡 {ts.note}
                        </div>
                        {skill.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {skill.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Methodology */}
      <section className="mt-20 pt-10 border-t border-white/5">
        <h2 className="text-lg font-semibold text-gray-400 mb-4">📊 分析方法</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-500">
          <div>
            <h3 className="font-medium text-gray-300 mb-2">Session Logs</h3>
            <p>分析所有對話紀錄中 skill 被提及的頻率，反映實際使用時的上下文</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-300 mb-2">Cron Jobs</h3>
            <p>13 個活躍排程任務，涵蓋股票掃描、情報搜集、儀表板等自動化流程</p>
          </div>
          <div>
            <h3 className="font-medium text-gray-300 mb-2">Memory</h3>
            <p>跨 session 記憶中明確記錄的重要 skill 與使用模式</p>
          </div>
        </div>
      </section>
    </main>
  );
}
