#!/usr/bin/env node
/**
 * يتحقق من ملفات وحدات الوثيقة (docs/srs/modules/*.json): البنية، الثنائية اللغوية، المراجع إلى
 * الكود والاختبارات، العبارات الممنوعة، وتفرّد الأرقام. الاستعمال:
 *   node scripts/srs/validate.mjs                      # كل الوحدات
 *   node scripts/srs/validate.mjs docs/srs/modules/04-sch.json
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadActors, loadModules, readJson, trackedFiles, globToRegExp, stripRef, walkStrings, forbiddenHits, GEMINI_ALLOWED_MODULES } from "./lib/common.mjs";

const PRIORITIES = new Set(["must", "should", "could"]);
const STATUSES = new Set(["implemented", "in-progress", "planned"]);
const KINDS = { FR: "functional", NFR: "nonfunctional", DR: "data", IR: "interface" };
const DIAGRAM_KINDS = new Set(["start", "state", "decision", "end", "system"]);
const PATH_KEYS = new Set(["code", "tests", "sources", "file", "evidence", "icon", "id", "from", "to", "actor", "actors", "kind", "layout", "type", "priority", "status", "source"]);

const isBi = v => v && typeof v === "object" && typeof v.ar === "string" && v.ar.trim().length > 1 && typeof v.en === "string" && v.en.trim().length > 1;
const hasArabic = s => /[؀-ۿ]/.test(s);
const hasLatinWord = s => /[A-Za-z]{3,}/.test(s);

export function validateModule(mod, file, ctx) {
  const errors = [], warnings = [];
  const err = m => errors.push(`${file}: ${m}`), warn = m => warnings.push(`${file}: ${m}`);
  const id = mod.id;
  if (!/^[A-Z]{3}$/.test(id || "")) err("id يجب أن يكون ثلاثة أحرف كبيرة مثل SCH");
  if (!Number.isFinite(mod.order)) err("order رقم مطلوب");
  if (typeof mod.icon !== "string" || !mod.icon) err("icon (اسم أيقونة lucide بصيغة kebab-case) مطلوب");
  for (const k of ["title", "tagline", "summary"]) if (!isBi(mod[k])) err(`${k} ثنائي اللغة {ar,en} مطلوب`);
  if (!Array.isArray(mod.actors) || !mod.actors.length) err("actors مطلوبة");
  for (const a of mod.actors || []) if (!ctx.actorIds.has(a)) err(`actor غير معروف: ${a}`);
  if (!Array.isArray(mod.sources) || !mod.sources.length) err("sources (الملفات/الأنماط التي تغطيها الوحدة) مطلوبة");
  for (const pat of mod.sources || []) {
    if (/github/i.test(pat)) err(`sources: مسارٌ يخصّ منصة الاستضافة لا يُذكر في الوثيقة: ${pat}`);
    const re = globToRegExp(pat);
    if (!ctx.files.some(f => re.test(f))) err(`sources: النمط لا يطابق أي ملف: ${pat}`);
  }
  const checkPath = (p, where) => {
    const clean = stripRef(p);
    if (/github/i.test(clean)) err(`${where}: مسارٌ يخصّ منصة الاستضافة لا يُذكر في الوثيقة: ${p}`);
    if (!ctx.fileSet.has(clean)) err(`${where}: المسار غير موجود في المستودع: ${p}`);
  };
  mod.screens?.forEach((s, i) => {
    if (!isBi(s.name)) err(`screens[${i}].name ثنائي اللغة مطلوب`);
    if (s.file) checkPath(s.file, `screens[${i}].file`);
  });
  mod.journeys?.forEach((j, i) => {
    if (!ctx.actorIds.has(j.actor)) err(`journeys[${i}].actor غير معروف: ${j.actor}`);
    if (!isBi(j.title)) err(`journeys[${i}].title مطلوب`);
    if (!Array.isArray(j.steps) || j.steps.length < 3 || j.steps.length > 9) err(`journeys[${i}].steps بين 3 و9 خطوات`);
    j.steps?.forEach((s, k) => { if (!isBi(s)) err(`journeys[${i}].steps[${k}] ثنائي اللغة مطلوب`); });
  });
  mod.diagrams?.forEach((d, i) => {
    const w = `diagrams[${i}]`;
    if (!/^[a-z0-9-]+$/.test(d.id || "")) err(`${w}.id غير صالح`);
    if (d.type !== "flow") err(`${w}.type يجب أن يكون flow`);
    if (!isBi(d.title)) err(`${w}.title مطلوب`);
    if (!Array.isArray(d.nodes) || d.nodes.length < 3 || d.nodes.length > 14) err(`${w}.nodes بين 3 و14 عقدة`);
    const ids = new Set();
    d.nodes?.forEach(n => {
      if (!n.id || ids.has(n.id)) err(`${w}: معرّف عقدة مكرر/ناقص ${n.id}`); ids.add(n.id);
      if (!isBi(n.label)) err(`${w}.${n.id}.label مطلوب`);
      if (n.kind && !DIAGRAM_KINDS.has(n.kind)) err(`${w}.${n.id}.kind غير صالح`);
    });
    d.edges?.forEach((e, k) => {
      if (!ids.has(e.from) || !ids.has(e.to)) err(`${w}.edges[${k}] يشير إلى عقدة غير موجودة`);
      if (e.label && !isBi(e.label)) err(`${w}.edges[${k}].label ثنائي اللغة`);
    });
  });
  if (mod.matrix) {
    const m = mod.matrix;
    if (!isBi(m.title)) err("matrix.title مطلوب");
    if (!Array.isArray(m.cols) || !m.cols.every(isBi)) err("matrix.cols ثنائية اللغة");
    if (!Array.isArray(m.rows)) err("matrix.rows مطلوبة");
    m.rows?.forEach((r, i) => {
      if (!ctx.actorIds.has(r.actor)) err(`matrix.rows[${i}].actor غير معروف`);
      if (!Array.isArray(r.cells) || r.cells.length !== m.cols?.length) err(`matrix.rows[${i}].cells يجب أن تطابق عدد الأعمدة`);
      else if (!r.cells.every(c => [0, 1, 2].includes(c))) err(`matrix.rows[${i}].cells قيمها 0 (لا) 1 (قراءة) 2 (كتابة)`);
    });
  }
  const seen = new Set();
  if (!Array.isArray(mod.requirements) || mod.requirements.length < 3) err("requirements: ثلاثة على الأقل");
  mod.requirements?.forEach((r, i) => {
    const w = `requirements[${i}](${r.id})`;
    const m = /^(FR|NFR|DR|IR)-([A-Z]{3})-(\d{3})$/.exec(r.id || "");
    if (!m) { err(`${w}: صيغة الرقم FR-XXX-001 (FR|NFR|DR|IR)`); return; }
    if (m[2] !== id) err(`${w}: رمز الوحدة في الرقم لا يطابق ${id}`);
    if (seen.has(r.id)) err(`${w}: رقم مكرر`); seen.add(r.id);
    if (ctx.allReqIds.get(r.id) && ctx.allReqIds.get(r.id) !== file) err(`${w}: الرقم مستعمل في ${ctx.allReqIds.get(r.id)}`);
    if (r.kind !== KINDS[m[1]]) err(`${w}: kind يجب أن يكون ${KINDS[m[1]]}`);
    if (!isBi(r.title)) err(`${w}.title مطلوب`);
    if (!isBi(r.text)) err(`${w}.text مطلوب`);
    if (isBi(r.text)) {
      if (!hasArabic(r.text.ar)) err(`${w}.text.ar يجب أن يكون عربياً`);
      if (!hasLatinWord(r.text.en) || hasArabic(r.text.en)) err(`${w}.text.en يجب أن يكون إنجليزياً صرفاً`);
      if (r.text.ar.length < 25 || r.text.en.length < 25) warn(`${w}: النص قصير جداً`);
    }
    if (!PRIORITIES.has(r.priority)) err(`${w}.priority`);
    if (!STATUSES.has(r.status)) err(`${w}.status`);
    if (!Array.isArray(r.actors) || !r.actors.length) err(`${w}.actors مطلوبة`);
    r.actors?.forEach(a => { if (!ctx.actorIds.has(a)) err(`${w}: actor غير معروف ${a}`); });
    if (!Array.isArray(r.acceptance) || !r.acceptance.length || !r.acceptance.every(isBi)) err(`${w}.acceptance: معيارٌ واحد ثنائي اللغة على الأقل`);
    const ev = r.evidence || {};
    for (const p of ev.code || []) checkPath(p, `${w}.evidence.code`);
    for (const p of ev.tests || []) checkPath(p, `${w}.evidence.tests`);
    if (r.status === "implemented" && !(ev.code || []).length) err(`${w}: متطلبٌ منفَّذ بلا مرجع كود`);
    if (r.status === "implemented" && !(ev.tests || []).length && !r.inferred) warn(`${w}: منفَّذ بلا اختبار — ضع inferred:true أو أضف اختباراً`);
    if (r.status !== "implemented" && (ev.code || []).length === 0 && r.status === "in-progress") warn(`${w}: قيد التطوير بلا مرجع`);
  });
  mod.edgeCases?.forEach((e, i) => {
    for (const k of ["title", "scenario", "behavior"]) if (!isBi(e[k])) err(`edgeCases[${i}].${k} ثنائي اللغة مطلوب`);
    e.evidence?.forEach(p => checkPath(p, `edgeCases[${i}].evidence`));
  });
  mod.terms?.forEach((t, i) => { if (!t.ar || !t.en || !isBi(t.def)) err(`terms[${i}]: ar/en/def مطلوبة`); });
  mod.ownerRules?.forEach((o, i) => { if (!isBi(o)) err(`ownerRules[${i}] ثنائي اللغة مطلوب`); });

  /* العبارات الممنوعة في كل نص مقروء (لا في المسارات والمعرّفات). */
  const allowGemini = GEMINI_ALLOWED_MODULES.has(id);
  const prune = (node, key) => (PATH_KEYS.has(key) ? undefined : node);
  const readable = JSON.parse(JSON.stringify(mod, (k, v) => prune(v, k)));
  for (const [trail, text] of walkStrings(readable)) {
    const hits = forbiddenHits(text, { allowGemini });
    if (hits.length) err(`عبارة ممنوعة «${hits.join("، ")}» في ${trail}`);
  }
  return { errors, warnings };
}

export function validateAll(onlyFiles = null) {
  const modules = loadModules();
  const actorIds = new Set(loadActors().map(a => a.id));
  const files = trackedFiles();
  const ctx = { actorIds, files, fileSet: new Set(files), allReqIds: new Map() };
  const errors = [], warnings = [];
  const ids = new Map();
  for (const { file, data } of modules) {
    if (ids.has(data.id)) errors.push(`${file}: رمز الوحدة ${data.id} مستعمل في ${ids.get(data.id)}`);
    ids.set(data.id, file);
    for (const r of data.requirements || []) if (r.id && !ctx.allReqIds.has(r.id)) ctx.allReqIds.set(r.id, file);
  }
  for (const { file, data } of modules) {
    if (onlyFiles && !onlyFiles.includes(file)) continue;
    const r = validateModule(data, file, ctx);
    errors.push(...r.errors); warnings.push(...r.warnings);
  }
  return { errors, warnings, modules };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2).map(f => path.relative(ROOT, path.resolve(f)));
  for (const f of only) if (!fs.existsSync(path.join(ROOT, f))) { console.error(`ملف غير موجود: ${f}`); process.exit(1); }
  const { errors, warnings, modules } = validateAll(only.length ? only : null);
  for (const w of warnings) console.warn(`⚠ ${w}`);
  if (errors.length) { console.error(errors.map(e => `✗ ${e}`).join("\n")); console.error(`\n${errors.length} خطأ`); process.exit(1); }
  const reqs = modules.reduce((n, m) => n + (m.data.requirements?.length || 0), 0);
  console.log(`✓ وثيقة المتطلبات: ${modules.length} وحدة، ${reqs} متطلباً${warnings.length ? `، ${warnings.length} تنبيه` : ""}.`);
}
