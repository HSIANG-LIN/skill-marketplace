"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getAllSkills } from "@/lib/skills-data";
import SkillCard from "@/components/SkillCard";
import SearchBar from "@/components/SearchBar";

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  const allSkills = getAllSkills();

  const results = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    return allSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.category.toLowerCase().includes(q)
    );
  }, [query, allSkills]);

  if (query) {
    return (
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
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {allSkills.slice(0, 12).map((skill) => (
        <SkillCard key={skill.slug} skill={skill} />
      ))}
    </div>
  );
}

export default function SearchPage() {
  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-white mb-2">Search Skills</h1>
      <p className="text-gray-400 mb-8">Find the perfect skill for your Hermes Agent</p>

      <div className="max-w-2xl mb-10">
        <SearchBar />
      </div>

      <Suspense fallback={<div className="text-gray-500 text-center py-10">Loading...</div>}>
        <SearchContent />
      </Suspense>
    </main>
  );
}
