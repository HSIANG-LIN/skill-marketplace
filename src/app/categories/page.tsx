import { getAllCategories, getAllSkills } from "@/lib/skills-data";
import CategoryCard from "@/components/CategoryCard";

export default function CategoriesPage() {
  const categories = getAllCategories();
  const skills = getAllSkills();

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-white mb-2">Categories</h1>
      <p className="text-gray-400 mb-10">Browse skills by category</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => (
          <CategoryCard key={cat} category={cat} count={skills.filter((s) => s.category === cat).length} />
        ))}
      </div>
    </main>
  );
}
