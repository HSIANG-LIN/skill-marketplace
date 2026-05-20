import Link from "next/link";
import type { Skill } from "@/lib/skills-data";

const CATEGORY_COLORS: Record<string, string> = {
  "software-development": "from-blue-500/20 to-blue-600/10 border-blue-500/20",
  mlops: "from-purple-500/20 to-purple-600/10 border-purple-500/20",
  creative: "from-pink-500/20 to-pink-600/10 border-pink-500/20",
  productivity: "from-green-500/20 to-green-600/10 border-green-500/20",
  "data-science": "from-cyan-500/20 to-cyan-600/10 border-cyan-500/20",
  devops: "from-orange-500/20 to-orange-600/10 border-orange-500/20",
  "autonomous-ai-agents": "from-indigo-500/20 to-indigo-600/10 border-indigo-500/20",
  github: "from-gray-500/20 to-gray-600/10 border-gray-500/20",
  troubleshooting: "from-red-500/20 to-red-600/10 border-red-500/20",
  research: "from-teal-500/20 to-teal-600/10 border-teal-500/20",
  media: "from-amber-500/20 to-amber-600/10 border-amber-500/20",
  mcp: "from-violet-500/20 to-violet-600/10 border-violet-500/20",
  gaming: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20",
  "social-media": "from-sky-500/20 to-sky-600/10 border-sky-500/20",
  "red-teaming": "from-rose-500/20 to-rose-600/10 border-rose-500/20",
  leisure: "from-lime-500/20 to-lime-600/10 border-lime-500/20",
  dogfood: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/20",
  "smart-home": "from-teal-500/20 to-teal-600/10 border-teal-500/20",
  "note-taking": "from-indigo-500/20 to-indigo-600/10 border-indigo-500/20",
  email: "from-blue-500/20 to-blue-600/10 border-blue-500/20",
  yuanbao: "from-red-500/20 to-red-600/10 border-red-500/20",
  apple: "from-gray-500/20 to-gray-600/10 border-gray-500/20",
  feeds: "from-orange-500/20 to-orange-600/10 border-orange-500/20",
  gifs: "from-pink-500/20 to-pink-600/10 border-pink-500/20",
  domain: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/20",
  "inference-sh": "from-purple-500/20 to-purple-600/10 border-purple-500/20",
  diagramming: "from-blue-500/20 to-blue-600/10 border-blue-500/20",
};

const CATEGORY_ICONS: Record<string, string> = {
  "software-development": "💻",
  mlops: "🤖",
  creative: "🎨",
  productivity: "📊",
  "data-science": "📈",
  devops: "⚙️",
  "autonomous-ai-agents": "🧠",
  github: "🐙",
  troubleshooting: "🔧",
  research: "🔬",
  media: "🎬",
  mcp: "🔌",
  gaming: "🎮",
  "social-media": "💬",
  "red-teaming": "🛡️",
  leisure: "🌴",
  dogfood: "🍖",
  "smart-home": "🏠",
  "note-taking": "📝",
  email: "📧",
  yuanbao: "🪙",
  apple: "🍎",
  feeds: "📡",
  gifs: "🎞️",
  domain: "🌐",
  "inference-sh": "⚡",
  diagramming: "📐",
};

export default function SkillCard({ skill }: { skill: Skill }) {
  const gradient = CATEGORY_COLORS[skill.category] || "from-gray-500/20 to-gray-600/10 border-gray-500/20";
  const icon = CATEGORY_ICONS[skill.category] || "📦";

  return (
    <Link href={`/skill/${skill.slug}`}>
      <div
        className={`group relative rounded-2xl border bg-gradient-to-br ${gradient} p-5 hover:scale-[1.02] transition-all duration-200 cursor-pointer h-full`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {skill.category}
            </span>
          </div>
          {skill.version && (
            <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
              v{skill.version}
            </span>
          )}
        </div>

        <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-indigo-400 transition-colors">
          {skill.name}
        </h3>

        <p className="text-sm text-gray-400 line-clamp-2 mb-4 leading-relaxed">
          {skill.description}
        </p>

        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skill.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400"
              >
                {tag}
              </span>
            ))}
            {skill.tags.length > 4 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-500">
                +{skill.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
