import { notFound } from "next/navigation";
import { getSkillsByCategory, getAllCategories } from "@/lib/skills-data";
import SkillCard from "@/components/SkillCard";
import Link from "next/link";

interface Props {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  const categories = getAllCategories();
  return categories.map((c) => ({ category: c }));
}

export default async function CategoryPage({ params }: Props) {
  const { category } = await params;
  const skills = getSkillsByCategory(category);

  if (skills.length === 0) notFound();

  const allCats = getAllCategories();

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-white transition-colors">Home</Link>
        <span>/</span>
        <span className="text-gray-300 capitalize">{category.replace(/-/g, " ")}</span>
      </nav>

      <div className="flex items-center gap-4 mb-10">
        <h1 className="text-3xl font-bold text-white capitalize">
          {category.replace(/-/g, " ")}
        </h1>
        <span className="text-sm text-gray-500 bg-white/5 px-3 py-1 rounded-full">
          {skills.length} skill{skills.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {skills.map((skill) => (
          <SkillCard key={skill.slug} skill={skill} />
        ))}
      </div>

      {/* Other categories */}
      <div className="mt-16 pt-10 border-t border-white/5">
        <h2 className="text-lg font-semibold text-gray-400 mb-6">Other Categories</h2>
        <div className="flex flex-wrap gap-3">
          {allCats
            .filter((c) => c !== category)
            .map((c) => (
              <Link
                key={c}
                href={`/category/${c}`}
                className="px-4 py-2 rounded-lg border border-white/5 bg-white/[0.02] text-sm text-gray-400 hover:text-white hover:border-white/10 transition-all capitalize"
              >
                {c.replace(/-/g, " ")}
              </Link>
            ))}
        </div>
      </div>
    </main>
  );
}
