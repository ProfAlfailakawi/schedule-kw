/**
 * ── كل هدف جولة موجود في الشيفرة ──
 * يمشي جولة كل ميزة بكل الحالات (من شاشة أخرى، بتحديد وبلا تحديد، هاتف وحاسوب)
 * ويبلّغ عن أي هدف أو محدد لا أثر له في المصدر.
 */
import fs from "node:fs";
import path from "node:path";
import { GUIDE_FEATURES } from "../src/guide/smartGuide";
import { buildTour } from "../src/guide/tour/tours";

const files: string[] = [];
const walk = (dir: string) => { for (const name of fs.readdirSync(dir)) { const p = path.join(dir, name); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(name) && !p.includes("src/guide/")) files.push(p); } };
walk("src");
const code = files.map(f => fs.readFileSync(f, "utf8")).join("\n");
const targets = new Set([...code.matchAll(/data-guide-(?:target|feature-id)=(?:"|\{")([^"]+)"/g)].map(m => m[1]));
for (const m of code.matchAll(/guide(?:FeatureId|Target)=(?:"|\{")([^"]+)"/g)) targets.add(m[1]);
const prefixes = [...code.matchAll(/data-guide-target=\{`([^`$]*)\$\{/g)].map(m => m[1]);
const hasTarget = (t: string) => targets.has(t) || prefixes.some(p => t.startsWith(p)) || code.includes(`"${t}"`);
const hasSelector = (s: string) => s.split(",").every(part => {
  const cls = part.match(/\.([a-zA-Z][\w-]+)/)?.[1];
  const attr = part.match(/\[([a-z-]+)/)?.[1];
  return (!cls || code.includes(cls)) && (!attr || code.includes(attr));
});

const missing: string[] = [];
let steps = 0;
const states = [
  { activeView: "elsewhere" }, { activeView: "schedules", scheduleView: "list" }, { activeView: "schedules", scheduleView: "rooms", selectedId: 7 },
  { activeView: "elsewhere", phone: true, phoneReadOnly: true },
];
for (const f of GUIDE_FEATURES) {
  for (const env of states) {
    const plan = buildTour(f, env);
    if (f.view && !plan.steps.length && !plan.note) missing.push(`${f.id}: جولة فارغة`);
    for (const s of plan.steps) {
      steps += 1;
      if (s.target && !hasTarget(s.target)) missing.push(`${f.id}: هدف ${s.target}`);
      if (s.selector && !hasSelector(s.selector)) missing.push(`${f.id}: محدد ${s.selector}`);
      if (!s.target && !s.selector) missing.push(`${f.id}: خطوة بلا هدف`);
      if (!s.text.trim()) missing.push(`${f.id}: خطوة بلا نص`);
    }
  }
}
const unique = [...new Set(missing)];
if (unique.length) { console.error("أهداف جولات مفقودة من الشيفرة:\n- " + unique.join("\n- ")); process.exit(1); }
console.log(`أهداف الجولات سليمة: ${GUIDE_FEATURES.length} ميزة، ${steps} خطوة في ${states.length} حالات.`);
