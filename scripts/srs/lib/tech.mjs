/**
 * البنية التقنية: بياناتها في docs/srs/tech.json، وأرقام إصداراتها تُقرأ من package.json وDockerfile
 * في كل بناء، فلا يشيخ الرقم. الشعارات صورٌ صغيرة في docs/srs/assets/tech تُضمَّن في الصفحة والـPDF.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, SRS_DIR, readJson, walkStrings, forbiddenHits } from "./common.mjs";
import { icon } from "./icons.mjs";
const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ASSETS = path.join(SRS_DIR, "assets/tech");
const uriCache = new Map();
const logoUri = name => {
  if (!uriCache.has(name)) {
    const f = path.join(ASSETS, `${name}.png`);
    if (!fs.existsSync(f)) throw new Error(`tech.json: شعار غير موجود ${name}.png`);
    uriCache.set(name, `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`);
  }
  return uriCache.get(name);
};

const pkgs = () => { const p = readJson(path.join(ROOT, "package.json")); return { ...p.dependencies, ...p.devDependencies }; };
function versionOf(spec, deps) {
  if (!spec) return "";
  if (spec.docker) { const m = new RegExp(`FROM ${spec.docker}:(\\d+)`).exec(fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8")); if (!m) throw new Error(`tech.json: لا إصدار ${spec.docker} في Dockerfile`); return m[1]; }
  const raw = deps[spec.pkg];
  if (!raw) throw new Error(`tech.json: الحزمة ${spec.pkg} غير موجودة في package.json`);
  const m = /(\d+)\.(\d+)/.exec(raw);
  return spec.minor ? `${m[1]}.${m[2]}` : m[1];
}

export function techModel(facts) {
  const t = readJson(path.join(SRS_DIR, "tech.json")), deps = pkgs();
  const readable = JSON.parse(JSON.stringify(t, (k, v) => (["logos", "icon", "id", "tone", "no", "pkg", "docker", "stat", "wordmark", "minor"].includes(k) ? undefined : v)));
  for (const [trail, text] of walkStrings(readable)) {
    const hits = forbiddenHits(text, { allowGemini: true });
    if (hits.length) throw new Error(`tech.json: عبارة ممنوعة «${hits.join("، ")}» في ${trail}`);
  }
  const resolve = it => ({ ...it, v: versionOf(it.version, deps), n: it.stat === "tests" ? facts.totals.tests : null });
  return { ...t, columns: t.columns.map(c => ({ ...c, items: c.items.map(resolve) })), services: { ...t.services, items: t.services.items.map(resolve) } };
}

export function techFingerprintFiles() {
  const out = ["docs/srs/tech.json"];
  for (const f of fs.readdirSync(ASSETS).sort()) out.push(`docs/srs/assets/tech/${f}`);
  return out;
}

export function techBlock(c, tech, { withTitle = false } = {}) {
  const T = o => (typeof o === "string" ? esc(o) : c.T(o));
  const prod = it => `${T(it.product)}${it.v ? ` <em class="v">v${esc(it.v)}</em>` : ""}`;
  const logos = it => `<div class="tl">${it.icon ? `<span class="tl-ic">${icon(it.icon, 22)}</span>` : ""}${(it.logos || []).map(n => `<img class="tlogo" src="${logoUri(n)}" alt="">`).join("")}${it.wordmark ? `<span class="tword">${esc(it.wordmark)}</span>` : ""}</div>`;
  const item = it => `<li>${logos(it)}<div class="tt"><b>${T(it.label)}</b><span>${it.n != null ? `<strong class="tn">${it.n}</strong> ` : ""}${prod(it)}</span></div></li>`;
  const col = k => `<section class="tcol tone-${k.tone}"><header><span class="no">${esc(k.no)}</span><h3>${T(k.title)}</h3>${icon(k.icon, 28)}</header><ul>${k.items.map(item).join("")}</ul></section>`;
  const svc = it => `<li><span class="si">${icon(it.icon, 20)}</span><div class="tt"><b>${T(it.label)}</b><span>${prod(it)}</span></div></li>`;
  return `<div class="tech">${withTitle ? `<h3 class="tech-title">${T(tech.title)}</h3>` : ""}<p class="tech-lead">${T(tech.lead)}</p><div class="tcols">${tech.columns.map(col).join("")}</div>`
    + `<div class="tsvc"><h4>${T(tech.services.title)}</h4><ul>${tech.services.items.map(svc).join("")}</ul></div></div>`;
}
