/**
 * التكامل والتشغيل: الربط بحسابات الجامعة، والمفاتيح التي تنتقل مع البيانات، ومتغيرات البيئة،
 * وفهرس كل مسار في الخادم. النصوص من docs/srs/integration.json، والمسارات والمتغيرات تُقرأ من
 * الكود في كل بناء: متغيرٌ يقرؤه الكود ولا تذكره الوثيقة يُفشل الفحص، فتبقى الوثيقة كاملة.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, SRS_DIR, readJson, trackedFiles, stripRef, loadModules } from "./common.mjs";
import { fileOwners } from "./facts.mjs";
import { icon } from "./icons.mjs";

export const INTEGRATION_FILE = "docs/srs/integration.json";
const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

/** كل متغير بيئة يقرؤه الخادم والواجهة (لا أدوات التطوير ولا الاختبارات). */
const ENV_RE = /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[["']([A-Z][A-Z0-9_]*)["']\]|[A-Za-z]*(?:Env|FromEnv)\(\s*["']([A-Z][A-Z0-9_]*)["']|(?<!meta\.)\benv\.([A-Z][A-Z0-9_]{2,})\b/g;
export function scanEnv() {
  const found = new Map();
  for (const f of trackedFiles().filter(f => f === "server.ts" || (/^src\//.test(f) && /\.(ts|tsx|mjs|js)$/.test(f)))) {
    for (const m of read(f).matchAll(ENV_RE)) {
      const k = m[1] || m[2] || m[3] || m[4];
      if (!found.has(k)) found.set(k, new Set());
      found.get(k).add(f);
    }
  }
  return found;
}

export const ACCESS = {
  staff: { icon: "user-round-check", ar: "جلسة موظف", en: "Staff session" },
  student: { icon: "graduation-cap", ar: "جلسة «مساري»", en: "Student session" },
  link: { icon: "link", ar: "رابط شخصي", en: "Personal link" },
  public: { icon: "globe", ar: "عام", en: "Public" },
};
const PUBLIC_API = ["/api/auth/login", "/api/auth/demo", "/api/auth/me", "/api/health", "/api/journey"];
export function accessOf(p) {
  if (p.startsWith("/api/public/me")) return "student";
  if (/^\/api\/public\/(staff|request|cal|ics|schedule|survey|q|m|s|r)\//.test(p) || /:token/.test(p)) return "link";
  if (p.startsWith("/api/public/") || p.startsWith("/api/landing/") || PUBLIC_API.includes(p)) return "public";
  if (p.startsWith("/api/")) return "staff";
  return "public";
}

/** كل مسار: وحدته (من مالك ملفه)، ونوع وصوله، والمتطلبات التي تصفه (بالاسم أولاً، ثم بالملف). */
export function routeIndex(m) {
  const { owners } = fileOwners(loadModules(), m.facts.files);
  const out = [];
  for (const e of m.facts.endpoints) {
    const [method, ...rest] = e.key.split(" "), p = rest.join(" ");
    const mod = m.modules.find(x => x.id === owners.get(e.file));
    const named = m.reqs.filter(r => (r.evidence?.code || []).some(c => c.includes(p)) || r.text.en.includes(p) || r.text.ar.includes(p));
    const byFile = named.length ? [] : m.reqs.filter(r => (r.evidence?.code || []).some(c => stripRef(c) === e.file));
    const reqs = (named.length ? named : byFile).map(r => r.id);
    out.push({ method, path: p, file: e.file, module: mod?.id || "", access: accessOf(p), reqs, direct: named.length > 0 });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

export function loadIntegration(m) {
  const data = readJson(path.join(SRS_DIR, "integration.json"));
  return { ...data, routeRows: routeIndex(m), env: scanEnv() };
}

/** المراجع موجودة (والرمز بعد # موجودٌ في الملف)، وكل متغيرٍ يقرؤه الكود موصوف، ولا وصفَ لمتغيرٍ لا يُقرأ. */
export function validateIntegration(m) {
  const g = m.integration, errs = [], files = new Set(trackedFiles());
  const refs = [...g.identity.rows.flatMap(r => r.evidence || []), ...g.keys.rows.flatMap(r => r.evidence || [])];
  for (const ref of refs) {
    const file = stripRef(ref), sym = String(ref).includes("#") ? String(ref).split("#")[1] : "";
    if (!files.has(file)) { errs.push(`مرجع غير موجود: ${ref}`); continue; }
    if (sym && !read(file).includes(sym)) errs.push(`الرمز «${sym}» ليس في ${file}`);
  }
  const ids = new Set(m.reqs.map(r => r.id));
  for (const r of [...g.identity.rows, ...g.keys.rows]) for (const id of r.reqs || []) if (!ids.has(id)) errs.push(`متطلب غير موجود: ${id}`);
  const described = new Set(g.config.vars.map(v => v.name));
  for (const [name, where] of g.env) if (!described.has(name)) errs.push(`متغير بيئة يقرؤه الكود ولا تصفه الوثيقة: ${name} (${[...where].join("، ")})`);
  for (const v of g.config.vars) if (!g.env.has(v.name)) errs.push(`متغير موصوف لا يقرؤه الكود: ${v.name}`);
  const groups = new Set(g.config.groups.map(x => x.id));
  for (const v of g.config.vars) if (!groups.has(v.group)) errs.push(`مجموعة غير معروفة للمتغير ${v.name}: ${v.group}`);
  for (const r of g.routeRows) if (!r.module) errs.push(`مسار بلا وحدة: ${r.method} ${r.path} (${r.file})`);
  if (errs.length) throw new Error(`التكامل والتشغيل:\n  ${errs.join("\n  ")}`);
}

const accessBadge = (c, k) => `<span class="acc acc-${k}">${icon(ACCESS[k].icon, 13)}${c.T({ ar: ACCESS[k].ar, en: ACCESS[k].en })}</span>`;
const ev = refs => `<div class="ev">${(refs || []).map(p => `<code>${esc(p)}</code>`).join("")}</div>`;
const reqLinks = ids => (ids || []).length ? `<div class="areqs">${ids.map(id => `<a class="hreq" href="#${id}">${id}</a>`).join("")}</div>` : "";

export function identityBlock(c, m) {
  const g = m.integration.identity, T = o => c.T(o);
  const rows = g.rows.map(r => `<article class="idrow"><header>${icon(r.icon, 20)}<b>${T(r.who)}</b></header>`
    + `<div class="idcols"><div><small>${T({ ar: "اليوم", en: "Today" })}</small><p>${T(r.today)}</p></div><div class="idchg"><small>${T({ ar: "مع حسابات الجامعة", en: "With university accounts" })}</small><p>${T(r.change)}</p></div></div>${ev(r.evidence)}${reqLinks(r.reqs)}</article>`).join("");
  const qs = `<div class="idq"><h4>${icon("list-checks", 18)}${T(g.questionsTitle)}</h4><ol>${g.questions.map(q => `<li>${T(q)}</li>`).join("")}</ol></div>`;
  return `<div class="integ"><p class="ilead">${T(g.lead)}</p><div class="idrows">${rows}</div>${qs}</div>`;
}

export function keysBlock(c, m) {
  const g = m.integration.keys, T = o => c.T(o);
  return `<div class="integ"><p class="ilead">${T(g.lead)}</p><div class="keyrows">${g.rows.map(r => `<article class="keyrow"><header>${icon("key-round", 18)}<code>${esc(r.name)}</code></header>`
    + `<dl><dt>${T({ ar: "مكانه", en: "Where" })}</dt><dd>${T(r.where)}</dd><dt>${T({ ar: "يحمي", en: "Protects" })}</dt><dd>${T(r.protects)}</dd><dt>${T({ ar: "إن غاب أو تغيّر", en: "If missing or changed" })}</dt><dd>${T(r.if)}</dd></dl>${ev(r.evidence)}${reqLinks(r.reqs)}</article>`).join("")}</div></div>`;
}

export function configBlock(c, m) {
  const g = m.integration.config, T = o => c.T(o);
  const L = { name: { ar: "المتغير", en: "Variable" }, def: { ar: "الافتراضي", en: "Default" }, eff: { ar: "الأثر", en: "Effect" } };
  return `<div class="integ"><p class="ilead">${T(g.lead)}</p>${g.groups.map(grp => {
    const vars = g.vars.filter(v => v.group === grp.id);
    if (!vars.length) return "";
    return `<h4 class="cfg-h">${T(grp.title)} <span class="n">${vars.length}</span></h4><table class="tbl cfg"><thead><tr><th>${T(L.name)}</th><th>${T(L.def)}</th><th>${T(L.eff)}</th></tr></thead><tbody>${vars.map(v => `<tr><td><code>${esc(v.name)}</code></td><td class="def">${typeof v.default === "object" ? T(v.default) : esc(v.default)}</td><td>${T(v.effect)}</td></tr>`).join("")}</tbody></table>`;
  }).join("")}</div>`;
}

export function routesBlock(c, m, { interactive = false } = {}) {
  const g = m.integration, T = o => c.T(o), rows = g.routeRows;
  const counts = Object.fromEntries(Object.keys(ACCESS).map(k => [k, rows.filter(r => r.access === k).length]));
  const legend = `<div class="acc-legend">${Object.keys(ACCESS).map(k => `${interactive ? `<button type="button" class="acc-chip" data-acc="${k}" aria-pressed="false">` : "<span>"}${accessBadge(c, k)}<b>${counts[k]}</b>${interactive ? "</button>" : "</span>"}`).join("")}</div>`;
  const filter = interactive ? `<div class="rt-tools"><label class="rt-q">${icon("search", 16)}<input id="rt-q" class="ph-i18n" type="search" autocomplete="off" aria-label="ابحث في المسارات / Search routes" data-ph-ar="ابحث في المسارات…" data-ph-en="Search routes…" placeholder="ابحث في المسارات…"></label><select id="rt-mod" aria-label="الوحدة / Module"><option value="" data-ar="كل الوحدات" data-en="All modules">كل الوحدات</option>${m.modules.map(x => `<option value="${x.id}" data-ar="${esc(x.title.ar)}" data-en="${esc(x.title.en)}">${esc(x.title.ar)}</option>`).join("")}</select><span class="rt-count"><b id="rt-n">${rows.length}</b> ${T({ ar: "مساراً", en: "routes" })}</span></div>` : "";
  const reqLinks = r => r.reqs.slice(0, 3).map(id => `<a class="mono" href="#${id}">${id}</a>`).join(" ") + (r.reqs.length > 3 ? ` <span class="more">+${r.reqs.length - 3}</span>` : "");
  const body = rows.map(r => `<tr data-acc="${r.access}" data-mod="${r.module}" data-q="${esc(`${r.method} ${r.path} ${r.file}`.toLowerCase())}"><td class="mth m-${r.method.toLowerCase()}">${r.method}</td><td><code>${esc(r.path)}</code></td><td>${accessBadge(c, r.access)}</td><td class="mono">${r.module}</td><td class="rq">${reqLinks(r)}</td></tr>`).join("");
  return `<div class="integ"><p class="ilead">${T(g.routes.lead)}</p>${legend}${filter}<table class="tbl routes"><thead><tr><th>${T({ ar: "الطريقة", en: "Method" })}</th><th>${T({ ar: "المسار", en: "Path" })}</th><th>${T({ ar: "الوصول", en: "Access" })}</th><th>${T({ ar: "الوحدة", en: "Module" })}</th><th>${T({ ar: "المتطلبات", en: "Requirements" })}</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
