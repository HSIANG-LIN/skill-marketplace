const fs = require("fs");
const path = require("path");

const SKILLS_DIR = path.join(process.env.HOME || "/home/simon_dou", ".hermes", "skills");
const OUTPUT = path.join(process.cwd(), "data", "skills-cache.json");

function parseFrontmatter(content) {
  const fm = {};
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return fm;

  const lines = match[1].split("\n");
  let currentKey = "";
  let currentArr = [];
  let inArray = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Array item
    if (line.startsWith("- ") || line.startsWith("-")) {
      if (inArray) {
        const item = line.slice(line.startsWith("- ") ? 2 : 1).trim().replace(/^["']|["']$/g, "");
        if (item) currentArr.push(item);
      }
      continue;
    }

    // Save previous array
    if (inArray && currentKey) {
      fm[currentKey] = JSON.stringify(currentArr);
      currentArr = [];
      inArray = false;
    }

    // Key: value
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      currentKey = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();

      // Inline array
      if (val.startsWith("[") && val.endsWith("]")) {
        const items = val
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        fm[currentKey] = JSON.stringify(items);
      } else if (val === "") {
        inArray = true;
        currentArr = [];
      } else {
        val = val.replace(/^["']|["']$/g, "");
        fm[currentKey] = val;
        inArray = false;
      }
    }
  }

  if (inArray && currentKey) {
    fm[currentKey] = JSON.stringify(currentArr);
  }

  return fm;
}

function main() {
  const skills = [];

  function scanDir(dir, category) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const skillFile = path.join(fullPath, "SKILL.md");
        if (fs.existsSync(skillFile)) {
          const raw = fs.readFileSync(skillFile, "utf-8");
          const size = fs.statSync(skillFile).size;
          if (size === 0) continue;

          const fm = parseFrontmatter(raw);
          const bodyMatch = raw.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/);
          const body = bodyMatch ? bodyMatch[1].trim() : "";

          const slug = entry.name;
          let platforms = [];
          let tags = [];
          try { platforms = JSON.parse(fm["platforms"] || "[]"); } catch(e) {}
          try { tags = JSON.parse(fm["tags"] || "[]"); } catch(e) {}

          skills.push({
            name: fm["name"] || slug,
            slug,
            category,
            description: fm["description"] || "",
            version: fm["version"] || "1.0.0",
            author: fm["author"] || "Hermes Community",
            license: fm["license"] || "MIT",
            platforms,
            tags,
            body,
            relPath: path.relative(SKILLS_DIR, skillFile),
            installCmd: `hermes skill install https://raw.githubusercontent.com/HSIANG-LIN/skill-marketplace/main/public/skills/${category}/${slug}/SKILL.md`,
          });
        }
      }
    }
  }

  // Scan each top-level category
  const topEntries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const entry of topEntries) {
    if (entry.name.startsWith(".") || !entry.isDirectory()) continue;
    scanDir(path.join(SKILLS_DIR, entry.name), entry.name);
  }

  // Ensure output dir
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(skills, null, 2), "utf-8");

  console.log(`✅ Scanned ${skills.length} skills`);

  // Copy skill files to public dir for raw download
  const pubDir = path.join(process.cwd(), "public", "skills");
  for (const skill of skills) {
    const srcFile = path.join(SKILLS_DIR, skill.relPath);
    const destDir = path.join(pubDir, skill.category, skill.slug);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcFile, path.join(destDir, "SKILL.md"));
  }
  console.log(`📦 Copied ${skills.length} skill files to public/skills/`);
}

main();
