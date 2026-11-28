import fs from "node:fs";
import { execFileSync } from "node:child_process";
const ROUTES = "tests/fixtures/server-route-table.json", PAGES = "tests/fixtures/server-pages.json";
const keep = { routes: fs.readFileSync(ROUTES, "utf8"), pages: fs.readFileSync(PAGES, "utf8") };
const wanted = new Set(["get /api/courses", "get /api/schedules/copy-preview", "get /api/intelligence/compare-terms", "get /api/study-proposals/context", "get /api/course-offering", "get /api/plan-badges"]);
try { execFileSync("npx", ["tsx", "tests/server-route-parity-audit.ts", "--update", "--force"], { encoding: "utf8", maxBuffer: 1 << 26 }); } catch (e: any) { console.log(String(e.stdout || "").slice(-500)); }
const fresh = JSON.parse(fs.readFileSync(ROUTES, "utf8"));
fs.writeFileSync(ROUTES, keep.routes); fs.writeFileSync(PAGES, keep.pages);
const fixture = JSON.parse(keep.routes);
let changed = 0;
for (const layer of fixture.layers) {
  const key = `${(layer.methods || [])[0]} ${layer.path}`;
  if (!wanted.has(key)) continue;
  const next = fresh.layers.filter((l: any) => `${(l.methods || [])[0]} ${l.path}` === key);
  if (next.length !== 1) { console.log("ambiguous", key, next.length); continue; }
  console.log(key, layer.call, "→", next[0].call);
  layer.call = next[0].call; changed++;
}
fs.writeFileSync(ROUTES, JSON.stringify(fixture, null, 1) + (keep.routes.endsWith("\n") ? "\n" : ""));
console.log("changed", changed);
