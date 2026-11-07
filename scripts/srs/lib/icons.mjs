/** أيقونات lucide كما هي في النظام نفسه: تُقرأ من حزمة lucide-react ويُبنى منها SVG مضمَّن. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./common.mjs";

const DIR = path.join(ROOT, "node_modules/lucide-react/dist/esm/icons");
const cache = new Map();
const missing = new Set();
export const missingIcons = () => [...missing];

function parseNode(src) {
  const body = /const __iconNode = (\[[\s\S]*?\]);\s*\nconst /.exec(src)?.[1];
  if (!body) return null;
  // eslint-disable-next-line no-new-func
  return new Function(`return ${body}`)();
}

const ALIAS = { filter: "funnel", "circle-help": "circle-question-mark", "help-circle": "circle-question-mark", "x-circle": "circle-x", "file-bar-chart": "file-chart-column", "check-circle": "circle-check", "alert-triangle": "triangle-alert", "bar-chart-3": "chart-column", "shield-question": "shield-question-mark", unlock: "lock-open", "message-circle-question": "message-circle-question-mark" };
export function iconInner(name) {
  name = ALIAS[name] || name;
  if (cache.has(name)) return cache.get(name);
  const file = path.join(DIR, `${name}.js`);
  let inner = null;
  if (/^[a-z0-9-]+$/.test(name) && fs.existsSync(file)) {
    const node = parseNode(fs.readFileSync(file, "utf8"));
    if (node) inner = node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  }
  if (!inner) { missing.add(name); inner = iconInner("box") || ""; }
  cache.set(name, inner);
  return inner;
}

export function icon(name, size = 20, cls = "") {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconInner(name)}</svg>`;
}

/** علامة SCHEDULE الفعلية (public/schedule-icon.svg): الأسبوع الذي حُلّ. */
let logoCache = null;
export function logo(size = 40, cls = "") {
  if (!logoCache) {
    const raw = fs.readFileSync(path.join(ROOT, "public/schedule-icon.svg"), "utf8");
    logoCache = raw.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
  }
  return logoCache.replace("<svg ", `<svg class="logo ${cls}" width="${size}" height="${size}" `);
}
export function logoDataUri() {
  const raw = fs.readFileSync(path.join(ROOT, "public/schedule-icon.svg"), "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
  return "data:image/svg+xml," + encodeURIComponent(raw);
}
