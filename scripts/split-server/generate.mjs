/**
 * ── كتابةُ الوحدات من الخطة ───────────────────────────────────────────────────
 *
 * نصُّ كل جملةٍ يُنسخ كما هو بالبايت (مع تعليقاته)، ولا يُمسّ إلا بأمرين:
 *   - `export ` قبل تعريفٍ تستعمله وحدةٌ أخرى؛
 *   - `x` ← `state.x` لمتغيّرٍ مشترك نُقل إلى core/state.ts.
 * والطرقُ تُوضع في دوال register* بعمودها الأصلي (بلا إزاحة) ليبقى نصُّها هو هو:
 * إزاحةُ سطرٍ داخل قالبٍ نصّيّ تغيّر ما يُرسَل إلى المتصفح.
 */
import path from "node:path";
import { ts } from "./analyze.mjs";
import { SERVER } from "./plan.mjs";
import { ORDER_FILE, describeImport, statementKey } from "../../tests/helpers/serverSource.mjs";

const SERVER_FILE = "server.ts";
/** علامةُ الملف المولَّد: الأداةُ لا تمسح ملفاً بلا هذه العلامة. */
export const GENERATED_MARK = "نُقل من server.ts نقلاً بلا تغيير (scripts/split-server";

export function moduleFile(target) {
  return target === SERVER ? SERVER_FILE : path.join("src/server", target + ".ts");
}

/** مسارُ استيرادٍ من ملفٍّ إلى آخر (بلا امتداد .ts للوحدات المولَّدة). */
function relSpec(fromFile, toPathNoExt) {
  let rel = path.relative(path.dirname(fromFile), toPathNoExt).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

/** مسارُ استيرادٍ أصليّ (نسبةً إلى جذر المستودع) كما يُكتب من ملفٍّ آخر. */
function repathSpec(spec, fromFile) {
  if (!spec.startsWith(".")) return spec;
  return relSpec(fromFile, path.normalize(spec));
}

function headerFor(target, mapping) {
  const info = mapping.modules?.[target];
  const title = info?.title || target;
  const lines = ["/**", ` * ── ${title} ──`, " *"];
  for (const l of info?.about || []) lines.push(l ? ` * ${l}` : " *");
  if (info?.about?.length) lines.push(" *");
  lines.push(` * ${GENERATED_MARK}؛ الخريطة في docs/SERVER_MAP.md):`);
  lines.push(" * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،");
  lines.push(" * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.");
  if (target.startsWith("routes/")) {
    lines.push(" * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.");
  }
  lines.push(" */");
  return lines.join("\n") + "\n";
}

export function generate(analysis, plan, mapping, { root }) {
  const { units, text, imports } = analysis;
  const { runs, stateVars, declUnitByName } = plan;
  const files = new Map();
  const warnings = [];
  const checker = analysis.checker;

  /* ── لكل وحدةٍ وجهتُها ── */
  const targets = new Set(units.filter(u => u.kind !== "import").map(u => u.target));
  const byTarget = new Map();
  for (const u of units) {
    if (u.kind === "import") continue;
    if (!byTarget.has(u.target)) byTarget.set(u.target, []);
    byTarget.get(u.target).push(u);
  }

  /* ── ما يُصدَّر: تعريفٌ يستعمله غيرُ وحدته ── */
  const exported = new Set(); // unit index
  for (const u of units) {
    if (u.kind === "import") continue;
    for (const name of u.refs.keys()) {
      if (name === "app" && u.kind === "route") continue; // app: وسيطُ دالة التسجيل
      const d = declUnitByName.get(name);
      if (!d || d === u || d.state) continue;
      if (d.target !== u.target) exported.add(d.index);
    }
  }

  // بانٍ لصفحةٍ يُصدَّر ولو لم يستعمله أحد (surveyPage): يقرؤه اختبارُ تكافؤ الصفحات
  for (const u of units) if (u.kind === "decl" && u.declKind === "function" && String(u.target).startsWith("pages/") && /Page$/.test(u.names[0])) exported.add(u.index);

  /* ── «state» لا يُحجب حيث يُستبدل ── */
  const sf = analysis.sf;
  const nodeAt = pos => {
    let found = null;
    const visit = node => { if (pos >= node.getStart(sf) && pos < node.end) { found = node; ts.forEachChild(node, visit); } };
    visit(sf);
    return found;
  };
  if (stateVars.size) {
    for (const u of units) for (const [name, r] of u.refs) {
      if (!stateVars.has(name)) continue;
      for (const p of r.positions) {
        if (p.inType) throw new Error(`مرجعُ نوعٍ إلى متغيّر الحالة ${name} (سطر ${u.line}) غير مدعوم`);
        const node = nodeAt(p.start);
        const shadow = node && checker.resolveName("state", node, ts.SymbolFlags.Value, false);
        if (shadow) throw new Error(`«state» محجوبٌ عند مرجع ${name} في سطر ${u.line}`);
      }
    }
  }

  /* ── نصُّ وحدةٍ بعد التعديلين ── */
  const unitText = u => {
    const edits = [];
    for (const [name, r] of u.refs) {
      if (!stateVars.has(name)) continue;
      for (const p of r.positions) edits.push({ at: p.start, end: p.end, text: p.shorthand ? `${name}: state.${name}` : `state.${name}` });
    }
    if (u.kind === "decl" && exported.has(u.index)) {
      for (const node of u.nodes) {
        const hasExport = ts.canHaveModifiers(node) && (ts.getModifiers(node) || []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!hasExport) edits.push({ at: node.getStart(sf), end: node.getStart(sf), text: "export " });
      }
    }
    if (u.target !== SERVER) for (const r of u.relSpecs || []) edits.push({ at: r.start, end: r.end, text: JSON.stringify(repathSpec(r.spec, moduleFile(u.target))) });
    edits.sort((a, b) => b.at - a.at);
    let out = u.text;
    for (const e of edits) out = out.slice(0, e.at - u.start) + e.text + out.slice(e.end - u.start);
    return (u.prefix || "") + out;
  };

  /* ── الاستيرادات لملفٍّ: من الاستيرادات الأصلية، ومن الوحدات الأخرى، ومن state ── */
  const importsFor = (file, target, list, extraValue = new Map()) => {
    const external = new Map(); // spec -> { default, namespace, named: Map(imported -> {local, value}) , order }
    const internal = new Map(); // target -> Map(name -> value?)
    let needState = false;
    const note = (name, value) => {
      if (stateVars.has(name)) { if (target !== "core/state") needState = true; return; }
      const imp = imports.get(name);
      if (imp) {
        let e = external.get(imp.spec);
        if (!e) { e = { order: imp.unit, def: null, ns: null, named: new Map() }; external.set(imp.spec, e); }
        e.order = Math.min(e.order, imp.unit);
        const isValue = value && !imp.typeOnly;
        if (imp.kind === "default") e.def = { local: imp.local, value: (e.def?.value || false) || isValue };
        else if (imp.kind === "namespace") e.ns = { local: imp.local, value: (e.ns?.value || false) || isValue };
        else {
          const prev = e.named.get(imp.local);
          e.named.set(imp.local, { imported: imp.imported, local: imp.local, pos: imp.pos, typeOnly: imp.typeOnly, value: (prev?.value || false) || isValue });
        }
        return;
      }
      const d = declUnitByName.get(name);
      if (!d) return;
      const t = d.state ? "core/state" : d.target;
      if (t === target) return;
      if (t === SERVER) throw new Error(`${file} يحتاج «${name}» من server.ts`);
      if (!internal.has(t)) internal.set(t, new Map());
      const isType = ["interface", "type"].includes(d.declKind);
      const m = internal.get(t);
      m.set(name, (m.get(name) || false) || (value && !isType));
    };
    for (const u of list) for (const [name, r] of u.refs) {
      if (name === "app" && u.kind === "route") continue;
      note(name, r.value);
    }
    for (const [name, value] of extraValue) note(name, value);
    const lines = [];
    const sortedExternal = [...external].sort((a, b) => a[1].order - b[1].order);
    for (const [spec, e] of sortedExternal) {
      const s = JSON.stringify(repathSpec(spec, file));
      e.named = new Map([...e.named].sort((a, b) => a[1].pos - b[1].pos)); // بترتيبها في الاستيراد الأصلي
      const named = [...e.named.values()].map(n => `${n.typeOnly ? "type " : ""}${n.imported === n.local ? n.local : `${n.imported} as ${n.local}`}`);
      const allTypes = named.length && [...e.named.values()].every(n => n.typeOnly);
      if (e.ns) lines.push(`import ${e.ns.value ? "" : "type "}* as ${e.ns.local} from ${s};`);
      if (e.def && !e.def.value) { lines.push(`import type ${e.def.local} from ${s};`); e.def = null; }
      if (e.def && named.length) lines.push(`import ${e.def.local}, { ${named.join(", ")} } from ${s};`);
      else if (e.def) lines.push(`import ${e.def.local} from ${s};`);
      else if (named.length) lines.push(allTypes ? `import type { ${[...e.named.values()].map(n => n.imported === n.local ? n.local : `${n.imported} as ${n.local}`).join(", ")} } from ${s};` : `import { ${named.join(", ")} } from ${s};`);
    }
    if (needState) lines.push(`import { state } from ${JSON.stringify(relSpec(file, moduleFile("core/state").replace(/\.ts$/, "")))};`);
    for (const [t, names] of [...internal].sort((a, b) => a[0].localeCompare(b[0]))) {
      const spec = JSON.stringify(relSpec(file, moduleFile(t).replace(/\.ts$/, "")));
      const list2 = [...names].sort((a, b) => a[0].localeCompare(b[0]));
      const allTypes = list2.every(([, v]) => !v);
      lines.push(allTypes ? `import type { ${list2.map(([n]) => n).join(", ")} } from ${spec};` : `import { ${list2.map(([n, v]) => (v ? n : `type ${n}`)).join(", ")} } from ${spec};`);
    }
    return { lines, internal, external };
  };

  /* ── الوحدات المولَّدة ── */
  const runsOf = new Map();
  for (const r of runs) { if (!runsOf.has(r.target)) runsOf.set(r.target, []); runsOf.get(r.target).push(r); }
  for (const target of [...targets].sort()) {
    if (target === SERVER) continue;
    const file = moduleFile(target);
    const list = byTarget.get(target) || [];
    const topLevel = list.filter(u => u.kind !== "route" && !u.state);
    const stateUnits = target === "core/state" ? list.filter(u => u.state) : [];
    const routeRuns = runsOf.get(target) || [];
    const extra = new Map();
    const { lines } = importsFor(file, target, [...topLevel, ...stateUnits, ...routeRuns.flatMap(r => r.units)], extra);
    let body = "";
    if (routeRuns.length) {
      const names = new Set([...units.filter(u => u.kind === "decl").flatMap(u => u.names), ...imports.keys()]);
      if (names.has("Express")) throw new Error("الاسم Express مأخوذ — عدّل المولِّد");
      lines.unshift(`import type { Express } from "express";`);
    }
    for (const u of topLevel) body += unitText(u);
    if (stateUnits.length) {
      body += "\n\n/** متغيّراتُ الحالة المشتركة: تُكتب من أكثر من وحدة، والاستيرادُ للقراءة وحدها. */\nexport const state = {";
      for (const u of stateUnits) {
        const st = u.nodes[0];
        const decl = st.declarationList.declarations[0];
        const lead = text.slice(u.start, st.getStart(sf)).replace(/^\n+/, "\n");
        const init = decl.initializer ? decl.initializer.getText(sf) : "undefined";
        const value = decl.type ? `${init} as ${decl.type.getText(sf)}` : init;
        body += `${lead.replace(/\n/g, "\n  ")}${decl.name.getText(sf)}: ${value},`;
        const after = text.slice(st.end, u.end);
        if (after.trim()) body += after;
      }
      body += "\n};";
    }
    for (const r of routeRuns) {
      for (const u of r.units) if (u.deps?.size) throw new Error(`deps غير مدعومة: ${u.line}`);
      body += `\n\nexport function ${r.fn}(app: Express): void {`;
      for (const u of r.units) body += unitText(u);
      body += "\n}";
    }
    const content = headerFor(target, mapping) + lines.join("\n") + "\n" + body.replace(/^\n*/, "\n") + "\n";
    files.set(path.join(root, file), content);
  }

  /* ── boot.ts: ترتيبُ تحميل الوحدات الأصلية، ثم البيئة ── */
  {
    const file = moduleFile("core/boot");
    const bootUnits = byTarget.get("core/boot") || [];
    const evaluated = new Set();
    const lines = [];
    // أيُّ تصريحِ استيرادٍ كان يُحمَّل فعلاً؟ ما استُعمل منه اسمٌ قيمةً (esbuild يحذف غيره)
    const valueUsed = new Set();
    for (const u of units) for (const [name, r] of u.refs) if (r.value && imports.has(name) && !imports.get(name).typeOnly) valueUsed.add(name);
    const bootNeeds = new Map();
    for (const u of bootUnits) for (const [name, r] of u.refs) if (imports.has(name)) bootNeeds.set(name, r.value);
    for (const u of units) {
      if (u.kind !== "import") continue;
      const loaded = u.sideEffectOnly || u.bindings.some(b => valueUsed.has(b.local));
      const needed = (u.bindings || []).filter(b => bootNeeds.has(b.local));
      if (needed.length) {
        lines.push(`import { ${needed.map(b => (b.imported === b.local ? b.local : `${b.imported} as ${b.local}`)).join(", ")} } from ${JSON.stringify(repathSpec(u.spec, file))};`);
        evaluated.add(u.spec);
        continue;
      }
      if (!loaded || evaluated.has(u.spec)) continue;
      evaluated.add(u.spec);
      lines.push(`import ${JSON.stringify(repathSpec(u.spec, file))};`);
    }
    const header = [
      "/**",
      " * ── الإقلاع: ترتيبُ تحميل الوحدات، ثم البيئة ─────────────────────────────────",
      " *",
      " * كان server.ts يستورد هذه الوحدات بهذا الترتيب، فتُحمَّل كلُّها قبل أن يقرأ",
      " * configureRuntimeEnvironment() ملفَّ البيئة، ثم يعمل بقيةُ الملف. فلمّا قُسّم",
      " * server.ts صار أولُ ما يستورده هذا الملف: تُحمَّل الوحداتُ الأصلية بترتيبها القديم",
      " * نفسه، ثم تُضبط البيئة — قبل أن تُحمَّل أيُّ وحدةٍ من src/server/{core,routes,pages}",
      " * (فهي تقرأ process.env ساعةَ تحميلها كما كانت تقرؤه بعد هذا السطر في server.ts).",
      " * لا تُضف هنا شيئاً ولا تحذف منه إلا مع server.ts.",
      " *",
      ` * ${GENERATED_MARK}؛ الخريطة في docs/SERVER_MAP.md).`,
      " */",
    ].join("\n");
    let body = "";
    for (const u of bootUnits) body += unitText(u);
    files.set(path.join(root, file), header + "\n" + lines.join("\n") + "\n" + body + "\n");
  }

  /* ── server.ts ── */
  {
    const file = SERVER_FILE;
    const kept = units.filter(u => u.kind !== "import" && u.target === SERVER);
    const runStarts = new Map(runs.map(r => [r.units[0].index, r]));
    const extra = new Map();
    for (const r of runs) extra.set(`__run__${r.fn}`, true);
    // استيراداتُ ما بقي فيه، ودوالُ التسجيل
    const { lines } = importsFor(file, SERVER, kept);
    const runImports = new Map();
    for (const r of runs) {
      const spec = relSpec(file, moduleFile(r.target).replace(/\.ts$/, ""));
      if (!runImports.has(spec)) runImports.set(spec, []);
      runImports.get(spec).push(r.fn);
    }
    // دمجُ دوال التسجيل في استيراد الوحدة نفسها إن وُجد
    const merged = lines.map(line => {
      const m = line.match(/^import \{ (.*) \} from "(.*)";$/);
      if (m && runImports.has(m[2])) {
        const fns = runImports.get(m[2]);
        runImports.delete(m[2]);
        return `import { ${[...m[1].split(", "), ...fns].sort((a, b) => a.replace(/^type /, "").localeCompare(b.replace(/^type /, ""))).join(", ")} } from "${m[2]}";`;
      }
      return line;
    });
    for (const [spec, fns] of [...runImports].sort((a, b) => a[0].localeCompare(b[0]))) merged.push(`import { ${fns.sort().join(", ")} } from "${spec}";`);
    let out = `import "./src/server/core/boot";\n` + merged.join("\n");
    let first = true;
    for (const u of units) {
      if (u.kind === "import") continue;
      if (u.target === SERVER) { out += first ? unitText(u).replace(/^\n*/, "\n\n") : unitText(u); first = false; continue; }
      const r = runStarts.get(u.index);
      if (r) { out += `\n${r.fn}(app);`; first = false; }
    }
    out += analysis.tail;
    files.set(path.join(root, file), out.endsWith("\n") ? out : out + "\n");
  }

  files.set(path.join(root, "docs/SERVER_MAP.md"), serverMap(analysis, plan, mapping, files, root));
  // ترتيبُ جمل server.ts الأصلي: به يعيد tests/helpers/serverSource.mjs جمعَ النصّ كما كان
  {
    const seen = new Map();
    const keys = [];
    for (const st of analysis.sf.statements) {
      const base = statementKey(ts, st, analysis.sf);
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      keys.push(n === 1 ? base : `${base}#${n}`);
    }
    const importDecls = analysis.sf.statements.filter(st => ts.isImportDeclaration(st)).map(st => describeImport(ts, st));
    files.set(path.join(root, ORDER_FILE), JSON.stringify({ note: "ترتيبُ جمل server.ts قبل التقسيم واستيراداتُه — scripts/split-server؛ يقرؤه tests/helpers/serverSource.mjs", keys, imports: importDecls }, null, 1) + "\n");
  }
  return { files, warnings };
}

/* ── docs/SERVER_MAP.md: أين يعيش كلُّ شيء، وخريطةُ النقل ── */
function serverMap(analysis, plan, mapping, files, root) {
  const lineCount = t => files.get(path.join(root, moduleFile(t)))?.split("\n").length ?? 0;
  const targets = [...new Set(plan.units.filter(u => u.kind !== "import").map(u => u.target))].filter(t => t !== SERVER).sort();
  const out = [];
  out.push("# خريطةُ الخادم", "");
  out.push("> مولَّدةٌ بـ `node scripts/split-server/split.mjs` — لا تُحرَّر باليد؛ تُعاد مع كل تشغيل.", "");
  out.push(`المرحلة: \`${plan.phase}\`. حجمُ \`server.ts\` بعد التقسيم: ${lineCount(SERVER)} سطراً (كان ${analysis.text.split("\n").length - 1}).`, "");
  out.push("## البنية", "");
  out.push("- `server.ts` — جذرُ التركيب: إنشاءُ `app`، الوسائطُ العامة بترتيبها، استدعاءاتُ `register*` بالترتيب الذي يحفظ أسبقيةَ الطرق المتلاقية، و`startServer`.");
  out.push("- `src/server/core/` — المساعداتُ المشتركة والوسائطُ والحالة. `core/boot.ts` أولُ ما يستورده `server.ts`: يحمّل الوحداتِ الأصلية بترتيبها القديم ثم يستدعي `configureRuntimeEnvironment()` قبل أن تُحمَّل أيُّ وحدةٍ مقسومة. `core/state.ts` يجمع متغيّراتِ `let` التي تُكتب من أكثر من وحدة (`state.x`).");
  out.push("- `src/server/pages/` — بُناةُ الصفحات العامة بأنماطها وسكربتاتها.");
  out.push("- `src/server/routes/` — `registerXRoutes(app)`: طرقُ كل مجالٍ بترتيبها الأصلي، ومساعداتُها التي لا يستعملها غيرُها.");
  out.push("");
  out.push("الوحداتُ المقسومة تستورد ما تحتاجه من `core/` مباشرة؛ فلا `deps` في دوال التسجيل الجديدة (كانت `deps` في الوحدات القديمة لأن ما تحتاجه كان حبيسَ `server.ts`). ولا وحدةَ تستورد `server.ts` (يتحقق منه `test:server-parity`).", "");
  out.push("نصُّ كل جملةٍ منقولٌ بالبايت مع تعليقاته؛ لا يُمسّ إلا بإضافة `export` وبـ`state.x`. والطرقُ داخل دوال التسجيل بلا إزاحة: إزاحةُ سطرٍ داخل قالبٍ نصّيّ تغيّر ما يُرسَل.", "");
  out.push("## إعادةُ التقسيم على main أحدث", "");
  out.push("```sh");
  out.push("# فرعُ التقسيم ما زال مفتوحاً وتقدّم main: دمجٌ (لا rebase)، وserver.ts من main كما هو");
  out.push("git fetch origin && git merge --no-commit origin/main");
  out.push("git show origin/main:server.ts > server.ts                # لا يُحلّ تعارضٌ في الكود المنقول باليد");
  out.push("git checkout --theirs -- <اختبارٌ متعارض>                  # ثم تعيد الأداةُ توجيهَه إلى readServerSource()");
  out.push("npx tsx tests/server-route-parity-audit.ts --update        # ١) لقطتا الموجّه والصفحات من server.ts غير المقسوم ← commit");
  out.push("cp server.ts /tmp/server.orig.ts");
  out.push("node scripts/split-server/split.mjs --plan                 # تقرير: مساراتٌ بلا قاعدة، أحجام، دوالُ تسجيلٍ مقسومة");
  out.push("node scripts/split-server/split.mjs --write --phase routes --source /tmp/server.orig.ts  # (أو pages ثم helpers ثم routes، commit لكلٍّ)");
  out.push("npx tsx tests/server-route-parity-audit.ts && npm run lint");
  out.push("```", "");
  out.push("كلُّ مرحلةٍ تُكتب كاملةً من `server.ts` الأصلي (تمسح `src/server/{core,routes,pages}` المولَّدة وتعيد كتابتها)، وتعيد توجيهَ الاختبارات التي تقرأ نصَّ `server.ts` إلى `readServerSource()` (`tests/helpers/serverSource.mjs`). مسارٌ جديد بلا قاعدة يوقف الأداة: أضِفه إلى `routes` في `scripts/split-server/mapping.mjs`. ومساعدٌ جديد يتبع مستعمليه تلقائياً (وحدةٌ واحدة تستعمله ← إليها؛ أكثر ← وحدةُ منطقته في `regions`).", "");
  out.push("## الوحدات", "");
  out.push("| الملف | الأسطر | المحتوى |", "|---|---:|---|");
  out.push(`| \`server.ts\` | ${lineCount(SERVER)} | جذرُ التركيب |`);
  for (const t of targets) out.push(`| \`${moduleFile(t)}\` | ${lineCount(t)} | ${mapping.modules?.[t]?.title || ""} |`);
  out.push("");
  out.push("## ترتيبُ التسجيل في server.ts", "");
  for (const r of plan.runs) out.push(`- \`${r.fn}(app)\` — ${r.units.length} طريقاً، من \`${moduleFile(r.target)}\``);
  out.push("");
  out.push("## خريطةُ النقل: الطرق", "");
  out.push("| الطريق | السطر القديم | الملف الجديد |", "|---|---:|---|");
  for (const u of plan.units) if (u.kind === "route") out.push(`| \`${u.verb.toUpperCase()} ${(u.paths || [u.pathText]).join(" ، ")}\` | ${u.line} | \`${moduleFile(u.target)}\` |`);
  out.push("");
  out.push("## خريطةُ النقل: التعريفات والجمل", "");
  out.push("| الاسم | النوع | السطر القديم | الملف الجديد |", "|---|---|---:|---|");
  for (const u of plan.units) {
    if (u.kind === "decl") out.push(`| \`${u.names.join(", ")}\` | ${u.declKind} | ${u.line} | \`${moduleFile(u.target)}\` |`);
    else if (u.kind === "stmt" || u.kind === "app") out.push(`| \`${(u.code || u.text.trim().split("\n").find(l => !/^\s*(\/\/|\/\*|\*)/.test(l)) || "").slice(0, 70).replace(/\|/g, "\\|")}\` | ${u.kind === "app" ? "app" : "جملة"} | ${u.line} | \`${moduleFile(u.target)}\` |`);
  }
  out.push("");
  return out.join("\n");
}
