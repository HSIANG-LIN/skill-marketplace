import * as fs from "fs";
import * as path from "path";

export interface Skill {
  name: string;
  slug: string;
  category: string;
  description: string;
  version: string;
  author: string;
  license: string;
  platforms: string[];
  tags: string[];
  body: string;
  relPath: string;
  installCmd: string;
}

const CACHE_PATH = path.join(process.cwd(), "data", "skills-cache.json");

function loadSkills(): Skill[] {
  if (!fs.existsSync(CACHE_PATH)) return [];
  return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
}

export function getAllSkills(): Skill[] {
  return loadSkills();
}

export function getSkillBySlug(slug: string): Skill | undefined {
  return loadSkills().find((s) => s.slug === slug);
}

export function getSkillsByCategory(category: string): Skill[] {
  return loadSkills().filter((s) => s.category === category);
}

export function getAllCategories(): string[] {
  const cats = new Set(loadSkills().map((s) => s.category));
  return Array.from(cats).sort();
}

export function searchSkills(query: string): Skill[] {
  const q = query.toLowerCase();
  return loadSkills().filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)) ||
      s.category.toLowerCase().includes(q)
  );
}
