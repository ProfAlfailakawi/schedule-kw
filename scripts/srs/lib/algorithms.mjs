/**
 * خوارزميات النظام: docs/srs/algorithms/*.json (حصرٌ من الكود، لكل خوارزمية مراجعها ومتطلباتها).
 * يجيب عن سؤال «خوارزميات أم حساب؟» بالدليل، ويُعرض في تبويبٍ خاص وفي كل وحدةٍ وفي ملف PDF.
 */
import fs from "node:fs";
import path from "node:path";
import { SRS_DIR, readJson, trackedFiles, stripRef, walkStrings, forbiddenHits } from "./common.mjs";
import { icon, missingIcons } from "./icons.mjs";

const DIR = path.join(SRS_DIR, "algorithms");
const esc = v => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const KINDS = {
  deterministic: { icon: "cpu", ar: "حتمية", en: "Deterministic", hint: { ar: "قواعد ومقارنات صريحة: المدخل نفسه يعطي النتيجة نفسها دائماً.", en: "Explicit rules and comparisons: the same input always yields the same result." } },
  search: { icon: "list-ordered", ar: "بحث وترتيب", en: "Search and ranking", hint: { ar: "تستكشف البدائل الممكنة ضمن القيود وترتّبها بمعيار معلن.", en: "Explores the possible options within constraints and ranks them by a stated criterion." } },
  statistical: { icon: "chart-line", ar: "إحصاء من التاريخ", en: "Statistics from history", hint: { ar: "إحصاء وصفي من الفصول السابقة بعتبات معلنة، وهو كودٌ حتمي لا نموذج مدرَّب.", en: "Descriptive statistics over past terms with stated thresholds; deterministic code, not a trained model." } },
  assisted: { icon: "file-input", ar: "قراءة مساعدة بتأكيد", en: "Assisted reading, confirmed", hint: { ar: "خدمة Gemini تقرأ وتقترح، والمدققات الحتمية تحكم، والمستخدم يؤكد.", en: "The Gemini service reads and proposes, deterministic validators decide, and the user confirms." } },
};

export function algorithmFiles() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith(".json")).sort().map(f => `docs/srs/algorithms/${f}`);
}

export function loadAlgorithms(modules) {
  const order = new Map(modules.map(m => [m.id, m.order ?? 0]));
  const items = algorithmFiles().flatMap(f => readJson(path.join(SRS_DIR, "..", "..", f)).items || []);
  return items.sort((a, b) => (order.get(a.module) ?? 999) - (order.get(b.module) ?? 999) || a.id.localeCompare(b.id));
}

/** كل خوارزمية: رقمٌ فريد، وحدةٌ موجودة، نوعٌ معروف، مراجع موجودة، متطلبات موجودة، ولا عبارة ممنوعة. */
export function validateAlgorithms(m) {
  const errs = [], seen = new Set(), files = new Set(trackedFiles()), reqIds = new Set(m.reqs.map(r => r.id)), mods = new Set(m.modules.map(x => x.id));
  const isBi = v => v && typeof v.ar === "string" && v.ar.trim() && typeof v.en === "string" && v.en.trim();
  for (const a of m.algorithms) {
    const w = a.id || "?";
    if (!/^ALG-[A-Z]{3}-\d{2}$/.test(a.id || "")) errs.push(`${w}: صيغة الرقم`);
    if (seen.has(a.id)) errs.push(`${w}: رقم مكرر`); seen.add(a.id);
    if (!mods.has(a.module)) errs.push(`${w}: وحدة غير موجودة ${a.module}`);
    if (!KINDS[a.kind]) errs.push(`${w}: نوع غير معروف ${a.kind}`);
    for (const k of ["name", "question", "inputs", "output", "guarantee"]) if (!isBi(a[k])) errs.push(`${w}: ${k} ثنائي اللغة مطلوب`);
    if (!Array.isArray(a.method) || a.method.length < 2 || !a.method.every(isBi)) errs.push(`${w}: method خطوتان ثنائيتا اللغة على الأقل`);
    for (const p of [...(a.evidence?.code || []), ...(a.evidence?.tests || [])]) if (!files.has(stripRef(p))) errs.push(`${w}: مرجع غير موجود ${p}`);
    if (!(a.evidence?.code || []).length) errs.push(`${w}: بلا مرجع كود`);
    for (const r of a.requirements || []) if (!reqIds.has(r)) errs.push(`${w}: متطلب غير موجود ${r}`);
    const readable = JSON.parse(JSON.stringify(a, (k, v) => (["evidence", "requirements", "icon", "id", "module", "kind"].includes(k) ? undefined : v)));
    for (const [trail, text] of walkStrings(readable)) {
      const hits = forbiddenHits(text, { allowGemini: a.kind === "assisted" || a.module === "IMP" || a.module === "INT" });
      if (hits.length) errs.push(`${w}: عبارة ممنوعة «${hits.join("، ")}» في ${trail}`);
    }
  }
  if (errs.length) throw new Error(`الخوارزميات:\n  ${errs.join("\n  ")}`);
}

export const kindBadge = (c, k) => `<span class="akind k-${k}">${icon(KINDS[k].icon, 13)}${c.T({ ar: KINDS[k].ar, en: KINDS[k].en })}</span>`;

export function algoCard(c, m, a) {
  const T = o => c.T(o), M = o => c.M ? c.M(o) : c.T(o);
  const mod = m.modules.find(x => x.id === a.module);
  const detail = `<div class="aio"><div><small>${T({ ar: "المدخلات", en: "Inputs" })}</small><p>${M(a.inputs)}</p></div><div><small>${T({ ar: "المخرج", en: "Output" })}</small><p>${M(a.output)}</p></div></div>`
    + `<div class="aguar">${icon("shield-check", 15)}<p>${M(a.guarantee)}</p></div>`
    + ((a.numbers || []).length ? `<div class="anums">${a.numbers.map(n => `<span>${M(n)}</span>`).join("")}</div>` : "")
    + `<div class="ev">${(a.evidence?.code || []).map(p => `<code>${esc(p)}</code>`).join("")}${(a.evidence?.tests || []).map(p => `<code class="t">${esc(p)}</code>`).join("")}</div>`
    + ((a.requirements || []).length ? `<div class="areqs">${a.requirements.map(r => `<a class="hreq" href="#${r}">${r}</a>`).join("")}</div>` : "");
  return `<article class="algo" id="${a.id}" data-kind="${a.kind}" data-module="${a.module}">`
    + `<header>${icon(a.icon || KINDS[a.kind].icon, 22)}<div><span class="aid">${a.id}${mod ? ` · ${c.T(mod.title)}` : ""}</span><h4>${T(a.name)}</h4></div>${kindBadge(c, a.kind)}</header>`
    + `<p class="aq">${icon("circle-help", 15)}${M(a.question)}</p>`
    + `<ol class="asteps">${a.method.map(s => `<li>${M(s)}</li>`).join("")}</ol>`
    + (c.print ? detail : `<details><summary>${T({ ar: "المدخلات والضمانات والمراجع", en: "Inputs, guarantees and evidence" })}</summary>${detail}</details>`)
    + `</article>`;
}

/** جواب السؤال، وتوزيع الأنواع، بدليلٍ من الأعداد. */
export function algoAnswer(c, m) {
  const ans = m.front.algorithms, counts = Object.fromEntries(Object.keys(KINDS).map(k => [k, m.algorithms.filter(a => a.kind === k).length]));
  const total = m.algorithms.length, modsWith = new Set(m.algorithms.map(a => a.module)).size;
  const fill = s => String(s).replace("{n}", total).replace("{m}", modsWith).replace("{since}", m.usage.since);
  return `<div class="aanswer"><div class="aq-big">${icon("message-circle-question", 22)}<b>${c.T(ans.question)}</b></div><p class="aa">${c.T({ ar: fill(ans.answer.ar), en: fill(ans.answer.en) })}</p>`
    + `<div class="akinds">${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="akcard k-${k}" data-akind="${k}" aria-pressed="false">${icon(v.icon, 20)}<b>${counts[k]}</b><span>${c.T({ ar: v.ar, en: v.en })}</span><small>${c.T(v.hint)}</small></button>`).join("")}</div></div>`;
}

export function algoIndex(c, m) {
  const L = o => c.T(o);
  return `<table class="tbl"><thead><tr><th>ID</th><th>${L({ ar: "الخوارزمية", en: "Algorithm" })}</th><th>${L({ ar: "الوحدة", en: "Module" })}</th><th>${L({ ar: "النوع", en: "Kind" })}</th></tr></thead><tbody>${m.algorithms.map(a => `<tr><td class="mono"><a href="#${a.id}">${a.id}</a></td><td>${L(a.name)}</td><td>${a.module}</td><td>${L({ ar: KINDS[a.kind].ar, en: KINDS[a.kind].en })}</td></tr>`).join("")}</tbody></table>`;
}

export { missingIcons };
