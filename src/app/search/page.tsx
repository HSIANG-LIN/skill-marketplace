import { searchSkills, getAllSkills } from "@/lib/skills";
import SkillCard from "@/components/SkillCard";
import SearchBar from "@/components/SearchBar";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q || "";
  const results = query ? searchSkills(query) : [];
  const allSkills = getAllSkills();

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-white mb-2">Search Skills</h1>
      <p className="text-gray-400 mb-8">Find the perfect skill for your Hermes Agent</p>

      <div className="max-w-2xl mb-10">
        <SearchBar />
      </div>

      {query ? (
        <>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-sm text-gray-400">
              {results.length} result{results.length !== 1 ? "s" : ""} for
            </span>
            <span className="text-sm font-medium text-indigo-400">&quot;{query}&quot;</span>
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {results.map((skill) => (
                <SkillCard key={skill.slug} skill={skill} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="text-4xl mb-4">🔍</div>
              <h2 className="text-xl font-semibold text-white mb-2">No skills found</h2>
              <p className="text-gray-400">Try a different search term or browse all skills</p>
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {allSkills.slice(0, 12).map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      )}
    </main>
  );
}
