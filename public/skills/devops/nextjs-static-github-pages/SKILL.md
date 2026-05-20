---
name: nextjs-static-github-pages
description: Build and deploy Next.js static sites to GitHub Pages — static export, build-time data generation, search params Suspense boundaries, and GitHub Actions auto-deployment.
version: 1.0.0
tags: [nextjs, github-pages, static-export, github-actions, deployment, ssg]
---

# Next.js Static Site → GitHub Pages

Build a Next.js site with `output: 'export'` and deploy to GitHub Pages. Covers the full pipeline: build-time data generation, SSG-compatible patterns, and GitHub Actions auto-deployment.

## When to Use

- Building a content site, dashboard, or marketplace that doesn't need server-side rendering
- Deploying to GitHub Pages (free, no server needed)
- Data comes from local files that can be scanned at build time

## Project Setup

```bash
npx create-next-app@latest <project-name> --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
cd <project-name>
npm install react-markdown remark-gfm rehype-highlight  # if rendering markdown
```

## next.config.js

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",        // ← REQUIRED for static export
  images: {
    unoptimized: true,     // ← REQUIRED for GitHub Pages (no image optimization server)
  },
};

module.exports = nextConfig;
```

**Do NOT use `next.config.ts`** — it can cause type errors with Next.js 16. Use `.js`.

## Critical: SSG-Compatible Patterns

### `useSearchParams` Requires Suspense

In Next.js 16, any page using `useSearchParams()` **must** wrap the client component in a `<Suspense>` boundary, or the static export will fail:

```tsx
// ❌ This breaks SSG export
export default function SearchPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  // ...
}

// ✅ Correct pattern
"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";
  // ... render results
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}
```

### `searchParams` in Server Components

In Next.js 16, `searchParams` from `pageProps` is **async** in SSG. Accessing it makes the page dynamic. If you need it, use the client-side `useSearchParams()` pattern above instead.

### `generateStaticParams` for Dynamic Routes

For pages like `/skill/[slug]`, export `generateStaticParams`:

```tsx
export async function generateStaticParams() {
  const skills = getAllSkills();
  return skills.map((s) => ({ slug: s.slug }));
}
```

## Build-Time Data Generation Pattern

When your site needs data from local files (e.g., scanning a directory of markdown files), generate a **client-side TypeScript module** at build time:

### scripts/build-data.js

```js
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.env.HOME, ".hermes", "skills");
const CLIENT_OUTPUT = path.join(process.cwd(), "src/lib/data.ts");

// Scan files, parse, generate skills array
const skills = [];
// ... scanning logic ...

// Write client-side module (NOT using fs — this runs in browser)
const code = `// Auto-generated — do not edit
export interface Skill { ... }
export const skillsData: Skill[] = ${JSON.stringify(skills, null, 2)};
export function getAllSkills(): Skill[] { return skillsData; }
export function getBySlug(slug: string) { return skillsData.find(s => s.slug === slug); }
// ... more helpers ...
`;
fs.mkdirSync(path.dirname(CLIENT_OUTPUT), { recursive: true });
fs.writeFileSync(CLIENT_OUTPUT, code);
```

### package.json

```json
{
  "scripts": {
    "prebuild": "node scripts/build-data.js",
    "build": "next build"
  }
}
```

The `prebuild` hook runs automatically before `next build`.

### In Components

```tsx
import { getAllSkills, getBySlug } from "@/lib/data";

// Works in both server and client components
const skills = getAllSkills();
```

**Key:** The generated `.ts` file exports plain data + pure functions. No `fs`, no `path` — it's bundled into the client JS.

## GitHub Actions Auto-Deploy

### .github/workflows/deploy.yml

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./out

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Enable GitHub Pages

```bash
# Via API
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/<user>/<repo>/pages \
  -d '{"source":{"branch":"main","path":"/"}}'
```

Pages URL: `https://<user>.github.io/<repo>/`

## Manual Deploy (One-Time)

If you need to push the `out/` directory directly:

```bash
cd out
git init
git add -A
git commit -m "deploy"
git remote add origin https://<token>@github.com/<user>/<repo>.git
git branch -M main
git push -f origin main
```

**Warning:** This overwrites the repo's `main` branch with only the static files. Use GitHub Actions for ongoing deploys instead.

## Common Pitfalls

### TypeScript Strict Mode + Generated Data

Generated data files (e.g., from `JSON.stringify`) may have type mismatches with strict TS. Either:
1. Set `"strict": false` in `tsconfig.json`, or
2. Add `// @ts-nocheck` to generated files, or
3. Write a proper type-safe serializer

### `author` Field Type Mismatch

Some YAML frontmatter fields may be arrays when you expect strings. Handle defensively:

```js
author: (Array.isArray(fm["author"]) ? fm["author"].join(", ") : fm["author"]) || "Unknown"
```

### Build Script Can't Find Source Files in CI

If `build-data.js` scans `~/.hermes/skills/` locally but the CI runner doesn't have those files, either:
1. Commit the data to the repo and skip the build script in CI
2. Set `SKILLS_DIR` env var in the workflow to point to the committed data

### Next.js 16 Config

- Use `next.config.js` (not `.ts`) to avoid type errors
- `output: "export"` is required for static sites
- `images: { unoptimized: true }` is required for GitHub Pages

## Verification

```bash
# Build locally
npm run build

# Check output
ls out/
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000  # if using `npx serve out`
```
