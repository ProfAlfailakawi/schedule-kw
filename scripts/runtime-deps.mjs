#!/usr/bin/env node
/**
 * ── الصورةُ تحمل ما يشغّل الخادمَ وحده ─────────────────────────────────────
 *
 * The server is one esbuild bundle, dist/server.cjs, that leaves npm packages
 * external. So what the image needs from node_modules is exactly the packages
 * that bundle names, plus everything those depend on — not the React client,
 * the build tools and the test runners that `npm prune --omit=dev` keeps
 * because package.json lists them as dependencies.
 *
 *   node scripts/runtime-deps.mjs           list what the server needs
 *   node scripts/runtime-deps.mjs --prune   delete every other package
 *   node scripts/runtime-deps.mjs --smoke   load every name the server requires
 *
 * The Dockerfile runs `--prune --smoke` after the build: a package this
 * misses fails the image build on the runner, never the running site.
 */
import fs from "node:fs";
import path from "node:path";
import { builtinModules, createRequire } from "node:module";

const root = process.cwd();
const bundle = path.join(root, "dist", "server.cjs");
const modules = path.join(root, "node_modules");
const args = new Set(process.argv.slice(2));

/* Imported only when NODE_ENV is not "production" (server.ts: `if (!isProduction)`
   around `await import("vite")`), and the image runs with NODE_ENV=production. */
const DEV_ONLY = new Set(["vite"]);

if (!fs.existsSync(bundle)) {
  console.error("runtime-deps: dist/server.cjs is missing — run `npm run build` first.");
  process.exit(1);
}

const builtins = new Set(builtinModules.flatMap(name => [name, name.split("/")[0]]));
const packageOf = spec => spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
const source = fs.readFileSync(bundle, "utf8");
const specifiers = new Map();
for (const match of source.matchAll(/\b(require(?:\.resolve)?|import)\(\s*["']([^"'./][^"']*)["']\s*\)/g)) {
  const [, how, spec] = match;
  if (spec.startsWith("node:") || builtins.has(spec) || builtins.has(packageOf(spec))) continue;
  if (DEV_ONLY.has(packageOf(spec))) continue;
  specifiers.set(spec, how);
}
const entry = [...new Set([...specifiers.keys()].map(packageOf))].sort();

/* Node's own lookup: the nearest node_modules/<name> on the way up from the
   package that asks. A package kept is kept whole, nested node_modules and all. */
const resolveFrom = (fromDir, name) => {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return fs.realpathSync(candidate);
    if (dir === root || path.dirname(dir) === dir) return null;
  }
};
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

const keep = new Set();
const missing = [];
const queue = entry.map(name => ({ name, from: root, required: true, by: "dist/server.cjs" }));
while (queue.length) {
  const { name, from, required, by } = queue.shift();
  const dir = resolveFrom(from, name);
  if (!dir) { if (required) missing.push(`${name} (needed by ${by})`); continue; }
  if (keep.has(dir)) continue;
  keep.add(dir);
  const pkg = readJson(path.join(dir, "package.json"));
  for (const dep of Object.keys(pkg.dependencies || {})) queue.push({ name: dep, from: dir, required: true, by: pkg.name });
  /* Optional dependencies carry the platform binaries (@napi-rs/canvas-linux-x64-gnu)
     and firebase-admin's Firestore client; peers are whatever the host installed. */
  for (const dep of Object.keys({ ...pkg.optionalDependencies, ...pkg.peerDependencies })) queue.push({ name: dep, from: dir, required: false, by: pkg.name });
}

const sizeOf = dir => {
  let total = 0;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) total += sizeOf(full);
    else if (item.isFile()) total += fs.statSync(full).size;
  }
  return total;
};
const mb = bytes => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/* Top-level packages only: anything nested lives inside a package that is
   either kept whole or removed whole. */
const topLevel = () => fs.readdirSync(modules, { withFileTypes: true })
  .filter(item => item.isDirectory() && !item.name.startsWith("."))
  .flatMap(item => item.name.startsWith("@")
    ? fs.readdirSync(path.join(modules, item.name), { withFileTypes: true }).filter(sub => sub.isDirectory()).map(sub => path.join(modules, item.name, sub.name))
    : [path.join(modules, item.name)]);

const keptTop = topLevel().filter(dir => keep.has(fs.realpathSync(dir)));
console.log(`runtime-deps: the server names ${entry.length} packages (${entry.join(", ")}); with what they depend on, ${keep.size} packages.`);
if (missing.length) {
  console.error(`runtime-deps: not installed, yet required:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

if (args.has("--prune")) {
  let removed = 0, freed = 0;
  for (const dir of topLevel()) {
    if (keep.has(fs.realpathSync(dir))) continue;
    freed += sizeOf(dir);
    fs.rmSync(dir, { recursive: true, force: true });
    removed++;
  }
  for (const item of fs.readdirSync(modules, { withFileTypes: true })) {
    const scope = path.join(modules, item.name);
    if (item.isDirectory() && item.name.startsWith("@") && fs.readdirSync(scope).length === 0) fs.rmdirSync(scope);
  }
  console.log(`runtime-deps: removed ${removed} packages (${mb(freed)}); kept ${keptTop.length} at the top level (${mb(keptTop.reduce((sum, dir) => sum + sizeOf(dir), 0))}).`);
}

if (args.has("--smoke")) {
  /* Loaded the way the bundle loads them: require() from dist/, import() for the
     rest (ESM resolution from scripts/ reaches the same node_modules as dist/). */
  const requireFromBundle = createRequire(bundle);
  const failures = [];
  for (const [spec, how] of [...specifiers].sort()) {
    try {
      if (how === "import") await import(spec);
      else if (how === "require.resolve") requireFromBundle.resolve(spec);
      else requireFromBundle(spec);
    } catch (error) {
      failures.push(`${spec}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
  }
  if (failures.length) {
    console.error(`runtime-deps: the server could not load:\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`runtime-deps: all ${specifiers.size} names the server requires load from here.`);
}
