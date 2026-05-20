import { notFound } from "next/navigation";
import Link from "next/link";
import { getSkillBySlug, getAllSkills } from "@/lib/skills-data";
import SkillContent from "@/components/SkillContent";
import InstallButton from "@/components/InstallButton";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const skills = getAllSkills();
  return skills.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const skill = getSkillBySlug(slug);
  if (!skill) return { title: "Skill Not Found" };
  return {
    title: `${skill.name} — Hermes Skill`,
    description: skill.description,
  };
}

export default async function SkillPage({ params }: Props) {
  const { slug } = await params;
  const skill = getSkillBySlug(slug);

  if (!skill) notFound();

  // Find related skills (same category, excluding current)
  const related = getAllSkills()
    .filter((s) => s.category === skill.category && s.slug !== skill.slug)
    .slice(0, 4);

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-white transition-colors">Home</Link>
        <span>/</span>
        <Link href={`/category/${skill.category}`} className="hover:text-white transition-colors capitalize">
          {skill.category.replace(/-/g, " ")}
        </Link>
        <span>/</span>
        <span className="text-gray-300">{skill.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="flex items-start gap-4 mb-6">
            <div className="text-4xl">
              {skill.category === "software-development" ? "💻" :
               skill.category === "mlops" ? "🤖" :
               skill.category === "creative" ? "🎨" :
               skill.category === "productivity" ? "📊" :
               skill.category === "data-science" ? "📈" :
               skill.category === "devops" ? "⚙️" :
               skill.category === "autonomous-ai-agents" ? "🧠" :
               skill.category === "github" ? "🐙" :
               skill.category === "troubleshooting" ? "🔧" :
               skill.category === "research" ? "🔬" :
               skill.category === "media" ? "🎬" :
               skill.category === "mcp" ? "🔌" : "📦"}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{skill.name}</h1>
              <p className="text-gray-400 text-lg leading-relaxed">{skill.description}</p>
            </div>
          </div>

          {/* Tags */}
          {skill.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-8">
              {skill.tags.map((tag) => (
                <span key={tag} className="text-xs px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Markdown content */}
          <div className="markdown-body">
            <SkillContent body={skill.body} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-5">
            {/* Install card */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Install This Skill</h3>
              <InstallButton slug={skill.slug} category={skill.category} />

              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="text-xs text-gray-500 mb-2">Or install via CLI:</div>
                <code className="block text-xs bg-black/30 rounded-lg p-3 text-green-400 font-mono break-all">
                  hermes skill install {skill.slug}
                </code>
              </div>
            </div>

            {/* Meta info */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Details</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Version</span>
                  <span className="text-gray-300">{skill.version || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Author</span>
                  <span className="text-gray-300">{skill.author || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">License</span>
                  <span className="text-gray-300">{skill.license || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Category</span>
                  <Link href={`/category/${skill.category}`} className="text-indigo-400 hover:underline capitalize">
                    {skill.category.replace(/-/g, " ")}
                  </Link>
                </div>
                {skill.platforms.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Platforms</span>
                    <span className="text-gray-300">{skill.platforms.join(", ")}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Related skills */}
            {related.length > 0 && (
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Related Skills</h3>
                <div className="space-y-3">
                  {related.map((r) => (
                    <Link key={r.slug} href={`/skill/${r.slug}`} className="block group">
                      <div className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">
                        {r.name}
                      </div>
                      <div className="text-xs text-gray-500 line-clamp-1">{r.description}</div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
