/** يجمع الوحدات والمقدمة والوقائع في نموذجٍ واحد تقرؤه المولّدات كلها. */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, SRS_DIR, loadMeta, loadActors, loadModules, readJson } from "./common.mjs";
import { computeFacts } from "./facts.mjs";
import { techModel, techFingerprintFiles } from "./tech.mjs";
import { readUsage, USAGE_SOURCE } from "./usage.mjs";
import { loadAlgorithms, algorithmFiles } from "./algorithms.mjs";
import { loadIntegration, INTEGRATION_FILE } from "./integration.mjs";

export const STATUS_ORDER = ["implemented", "in-progress", "planned"];
export const PRIORITY_ORDER = ["must", "should", "could"];

export const LABELS = {
  status: { implemented: { ar: "منفّذ", en: "Implemented" }, "in-progress": { ar: "قيد التطوير", en: "In progress" }, planned: { ar: "مخطط", en: "Planned" } },
  priority: { must: { ar: "يجب", en: "Must" }, should: { ar: "ينبغي", en: "Should" }, could: { ar: "يمكن", en: "Could" } },
  kind: { functional: { ar: "وظيفي", en: "Functional" }, nonfunctional: { ar: "غير وظيفي", en: "Non-functional" }, data: { ar: "بيانات", en: "Data" }, interface: { ar: "واجهة", en: "Interface" } },
};

/** بصمةُ المحتوى المكتوب فقط (لا الأرقام المستخرجة): يحرس حداثةَ ملفي PDF. */
export function contentHash() {
  const h = crypto.createHash("sha256");
  const add = file => h.update(file + "\0").update(fs.readFileSync(path.join(ROOT, file)));
  for (const f of ["docs/srs/meta.json", "docs/srs/actors.json", "docs/srs/front.json", "docs/srs/revisions.json", ...techFingerprintFiles(), USAGE_SOURCE, ...algorithmFiles(), INTEGRATION_FILE]) add(f);
  for (const { file } of loadModules()) add(file);
  const libs = fs.readdirSync(path.join(ROOT, "scripts/srs/lib")).filter(f => f.endsWith(".mjs")).sort().map(f => `scripts/srs/lib/${f}`);
  const themes = fs.readdirSync(path.join(ROOT, "scripts/srs/theme")).sort().map(f => `scripts/srs/theme/${f}`);
  for (const f of [...libs, ...themes, "scripts/srs/build.mjs", "scripts/srs/pdf.mjs"]) if (fs.existsSync(path.join(ROOT, f))) add(f);
  return h.digest("hex").slice(0, 16);
}

export function buildModel() {
  const meta = loadMeta(), actors = loadActors(), mods = loadModules();
  const front = readJson(path.join(SRS_DIR, "front.json"));
  const revisions = readJson(path.join(SRS_DIR, "revisions.json"));
  const facts = computeFacts(mods);
  const tech = techModel(facts);
  const usage = readUsage();
  const actorMap = new Map(actors.map(a => [a.id, a]));
  const modules = mods.map(({ file, data }, i) => {
    const reqs = (data.requirements || []).map(r => ({ ...r, module: data.id }));
    const count = (key, vals) => Object.fromEntries(vals.map(v => [v, reqs.filter(r => r[key] === v).length]));
    return {
      ...data, file, index: i + 1, reqs,
      counts: { total: reqs.length, status: count("status", STATUS_ORDER), priority: count("priority", PRIORITY_ORDER), inferred: reqs.filter(r => r.inferred).length },
      facts: facts.perModule[data.id] || { endpoints: 0, files: 0 },
    };
  });
  const reqs = modules.flatMap(m => m.reqs);
  const algorithms = loadAlgorithms(modules);
  for (const x of modules) x.algos = algorithms.filter(a => a.module === x.id);
  const implemented = reqs.filter(r => r.status === "implemented");
  const withTests = implemented.filter(r => (r.evidence?.tests || []).length);
  const codeFiles = new Set(reqs.flatMap(r => r.evidence?.code || []).map(p => p.replace(/[#:].*$/, "")));
  const testFiles = new Set(reqs.flatMap(r => r.evidence?.tests || []).map(p => p.replace(/[#:].*$/, "")));
  const actorUse = new Map(actors.map(a => [a.id, { reqs: 0, modules: new Set() }]));
  for (const m of modules) for (const r of m.reqs) for (const a of r.actors || []) { const u = actorUse.get(a); if (u) { u.reqs++; u.modules.add(m.id); } }
  const stats = {
    modules: modules.length, requirements: reqs.length,
    status: Object.fromEntries(STATUS_ORDER.map(s => [s, reqs.filter(r => r.status === s).length])),
    priority: Object.fromEntries(PRIORITY_ORDER.map(p => [p, reqs.filter(r => r.priority === p).length])),
    kind: Object.fromEntries(Object.keys(LABELS.kind).map(k => [k, reqs.filter(r => r.kind === k).length])),
    inferred: reqs.filter(r => r.inferred).length,
    traced: withTests.length, tracedPct: implemented.length ? Math.round(withTests.length / implemented.length * 100) : 0,
    codeFiles: codeFiles.size, testFiles: testFiles.size,
    edgeCases: modules.reduce((n, m) => n + (m.edgeCases?.length || 0), 0),
    journeys: modules.reduce((n, m) => n + (m.journeys?.length || 0), 0),
    diagrams: modules.reduce((n, m) => n + (m.diagrams?.length || 0), 0),
    screens: modules.reduce((n, m) => n + (m.screens?.length || 0), 0),
    acceptance: reqs.reduce((n, r) => n + (r.acceptance?.length || 0), 0),
    implementedPct: reqs.length ? Math.round(implemented.length / reqs.length * 100) : 0,
  };
  /* المصطلحات: المطابقة بالعربية؛ تعارضُ المقابل الإنجليزي يُبلَّغ. */
  const glossary = new Map(), conflicts = [];
  for (const m of modules) for (const t of m.terms || []) {
    const key = t.ar.trim();
    if (!glossary.has(key)) glossary.set(key, { ...t, modules: [m.id] });
    else { const g = glossary.get(key); g.modules.push(m.id); if (g.en.toLowerCase() !== t.en.toLowerCase()) conflicts.push(`${key}: «${g.en}» ≠ «${t.en}» (${m.id})`); }
  }
  const groups = front.groups.map(g => ({ ...g, mods: g.modules.map(id => modules.find(m => m.id === id)).filter(Boolean) }));
  const grouped = new Set(groups.flatMap(g => g.mods.map(m => m.id)));
  const ungrouped = modules.filter(m => !grouped.has(m.id));
  if (ungrouped.length) groups.push({ id: "other", icon: "boxes", title: { ar: "أخرى", en: "Other" }, mods: ungrouped });
  const model = {
    meta, actors, actorMap, actorUse, front, revisions, tech, usage, algorithms, facts, modules, reqs, stats, groups,
    glossary: [...glossary.values()].sort((a, b) => a.en.localeCompare(b.en)), glossaryConflicts: conflicts,
    hash: contentHash(),
  };
  model.integration = loadIntegration(model);
  return model;
}
