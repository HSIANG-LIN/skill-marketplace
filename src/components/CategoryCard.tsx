import Link from "next/link";

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

export default function CategoryCard({ category, count }: { category: string; count: number }) {
  const icon = CATEGORY_ICONS[category] || "📦";

  return (
    <Link href={`/category/${category}`}>
      <div className="group flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition-all cursor-pointer">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors capitalize">
            {category.replace(/-/g, " ")}
          </div>
          <div className="text-xs text-gray-500">{count} skill{count !== 1 ? "s" : ""}</div>
        </div>
        <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
