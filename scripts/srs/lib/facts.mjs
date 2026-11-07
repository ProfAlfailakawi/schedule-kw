/**
 * وقائعُ تُستخرج من المستودع نفسه في كل بناء: عددُ المسارات والشاشات والاختبارات،
 * وتغطيةُ الملفات بالوحدات. هذه الأرقام لا تُكتب باليد أبداً.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, trackedFiles, globToRegExp, loadClaims } from "./common.mjs";

/** الملفات التي يجب أن تدّعيها وحدةٌ ما. تغييرُ هذه القائمة قرارٌ بشأن نطاق الوثيقة. */
export const WATCHED = [
  "server.ts", "src/App.tsx", "src/main.tsx", "src/types.ts",
  "src/server/**/*.ts", "src/server/**/*.tsx",
  "src/components/**/*.tsx", "src/components/**/*.ts",
  "src/utils/**/*.ts", "src/utils/**/*.tsx",
  "src/db/**/*.ts", "src/hooks/**/*.ts", "src/hooks/**/*.tsx", "src/pages/**/*.tsx",
  "src/guide/**/*.ts", "src/guide/**/*.tsx", "src/data/**/*.ts",
];
/** مستثنى بنصّ صريح: مولَّد أو تعريفات أنواع. */
export const UNWATCHED = [/^src\/generated\//, /\.d\.ts$/];

const ENDPOINT_RE = /\b(?:app|router|[A-Za-z]*Router)\.(get|post|put|patch|delete)\(\s*(?:\[\s*)?(["'`])([^"'`\n]+)\2/g;
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function watchedFiles() {
  const res = WATCHED.map(globToRegExp);
  return trackedFiles().filter(f => res.some(r => r.test(f)) && !UNWATCHED.some(r => r.test(f)));
}

/** كل مسار خادم: «GET /api/x» مع ملفه. */
export function scanEndpoints(files = watchedFiles()) {
  const out = [];
  for (const f of files.filter(f => f === "server.ts" || f.startsWith("src/server/"))) {
    const text = read(f);
    for (const m of text.matchAll(ENDPOINT_RE)) out.push({ key: `${m[1].toUpperCase()} ${m[3]}`, file: f });
  }
  return out;
}

/** مالكُ الملف: الوحدةُ التي تسمّيه بمسارٍ حرفي، وإلا أولُ وحدةٍ بنمط glob (بترتيب الفصول). */
export function fileOwners(modules, files) {
  const owners = new Map(), claimers = new Map();
  for (const f of files) claimers.set(f, []);
  const extra = loadClaims();
  for (const { data } of modules) {
    for (const pat of [...(data.sources || []), ...(extra[data.id] || [])]) {
      const literal = !/[*?]/.test(pat);
      if (literal) { if (claimers.has(pat)) claimers.get(pat).push({ id: data.id, literal }); continue; }
      const re = globToRegExp(pat);
      for (const f of files) if (re.test(f)) claimers.get(f).push({ id: data.id, literal });
    }
  }
  for (const [f, list] of claimers) owners.set(f, list.find(c => c.literal)?.id || list[0]?.id || null);
  return { owners, claimers };
}

export function computeFacts(modules) {
  const files = watchedFiles();
  const { owners } = fileOwners(modules, files);
  const unclaimed = files.filter(f => !owners.get(f));
  const endpoints = scanEndpoints(files);
  const perModule = {};
  for (const { data } of modules) perModule[data.id] = { endpoints: 0, files: 0 };
  for (const f of files) { const o = owners.get(f); if (o) perModule[o].files++; }
  for (const e of endpoints) { const o = owners.get(e.file); if (o) perModule[o].endpoints++; }
  const all = trackedFiles();
  const tests = all.filter(f => /^tests\/.+\.(ts|tsx|mjs|cjs)$/.test(f));
  const components = all.filter(f => /^src\/components\/[^/]+\.tsx$/.test(f));
  const pkg = JSON.parse(read("package.json"));
  const testScripts = Object.keys(pkg.scripts || {}).filter(k => /^(test|audit)/.test(k)).length;
  let loc = 0;
  for (const f of files) loc += read(f).split("\n").length;
  const routeFiles = all.filter(f => /^src\/server\/routes\/.+\.ts$/.test(f)).length;
  return {
    files, unclaimed, endpoints, perModule,
    totals: { endpoints: endpoints.length, watchedFiles: files.length, tests: tests.length, components: components.length, testScripts, loc, routeFiles },
  };
}

export function endpointSnapshot(endpoints) {
  return { note: "لقطة مسارات الخادم. تُحدَّث بـ npm run srs:sync عند إضافة مسار أو إزالته، وبعدها يُحدَّث متطلبه.", count: endpoints.length, endpoints: endpoints.map(e => e.key).sort() };
}
