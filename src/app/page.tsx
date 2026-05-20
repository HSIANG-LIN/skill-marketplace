import { getAllSkills, getAllCategories } from "@/lib/skills-data";
import SkillCard from "@/components/SkillCard";
import CategoryCard from "@/components/CategoryCard";
import SearchBar from "@/components/SearchBar";

export default function Home() {
  const skills = getAllSkills();
  const categories = getAllCategories();

  // Stats
  const totalSkills = skills.length;
  const totalCategories = categories.length;
  const totalTags = new Set(skills.flatMap((s) => s.tags)).size;

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-400 text-sm font-medium mb-6">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Powered by Hermes Agent
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6">
            <span className="bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              Skill Marketplace
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Browse, install, and share skills for Hermes Agent.
            <br />
            One command to supercharge your AI agent.
          </p>

          <SearchBar />

          {/* Stats */}
          <div className="flex items-center justify-center gap-12 mt-14">
            <div className="text-center">
              <div className="text-3xl font-bold text-white">{totalSkills}</div>
              <div className="text-sm text-gray-500 mt-1">Skills</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white">{totalCategories}</div>
              <div className="text-sm text-gray-500 mt-1">Categories</div>
            </div>
            <div className="w-px h-10 bg-white/10" />
            <div className="text-center">
              <div className="text-3xl font-bold text-white">{totalTags}</div>
              <div className="text-sm text-gray-500 mt-1">Tags</div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-white mb-8">Browse by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <CategoryCard key={cat} category={cat} count={skills.filter((s) => s.category === cat).length} />
          ))}
        </div>
      </section>

      {/* Featured Skills */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-white mb-8">All Skills</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {skills.map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      </section>
    </main>
  );
}
