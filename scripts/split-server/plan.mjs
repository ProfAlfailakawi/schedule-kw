/**
 * ── أين تذهب كلُّ وحدة؟ وبأيّ ترتيبٍ تُسجَّل الطرق؟ ─────────────────────────────
 *
 * ١) الطرق (app.get/post/...) تذهب بحسب مسارها (mapping.routes: أولُ قاعدةٍ تطابق).
 * ٢) التعريفات: ما سُمّي في mapping.place يذهب حيث سُمّي؛ وما بقي يتبع مستعمليه —
 *    إن استعمله مكانٌ واحدٌ ذهب إليه، وإن استعمله أكثرُ من مكانٍ ذهب إلى «منطقته»
 *    (mapping.regions: آخرُ مرساةٍ قبله في الملف الأصلي).
 * ٣) الجملُ ذات الأثر (onSchedulesInvalidated(...)، setInterval(...)) تتبع ما تمسّه.
 * ٤) ما يمسّ app (وسائطُ عامة، register*، حلقةُ asyncSafe) يبقى في server.ts.
 * ٥) متغيّرُ let يُكتب فيه من خارج وحدته ينتقل إلى core/state.ts (state.x).
 *
 * ثم ترتيبُ التسجيل: كلُّ وحدةِ طرقٍ تُسجّل طرقَها بترتيبها الأصلي في دالةٍ واحدة،
 * ما لم يُلزم طريقٌ يلتقي مع طريقٍ في وحدةٍ أخرى أن تُقسَم دالتُها (registerX1/2...).
 */
import fs from "node:fs";
import path from "node:path";
import { ts } from "./analyze.mjs";
import { layersOverlap, makeLayer } from "./routeOverlap.mjs";

export const SERVER = "server";

function firstCodeLine(text) {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");
  return withoutComments.trim().split("\n")[0] || "";
}

function matchRoute(rules, p) {
  for (const [rule, target] of rules) {
    if (typeof rule === "string" ? (rule.endsWith("*") ? p.startsWith(rule.slice(0, -1)) : p === rule || p.startsWith(rule + "/")) : rule.test(p)) return target;
  }
  return null;
}

/** طبقاتُ register* القائمة: تُقرأ مساراتُها حرفياً من وحداتها (src/server/*.ts). */
function existingModuleLayers(spec, cache) {
  if (cache.has(spec)) return cache.get(spec);
  let file = path.join(process.cwd(), spec.replace(/^\.\//, ""));
  if (!/\.tsx?$/.test(file)) file += ".ts";
  let layers = null;
  if (fs.existsSync(file)) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    layers = [];
    const visit = node => {
      if (layers && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "app") {
        const verb = node.expression.name.text;
        const arg = node.arguments[0];
        // قالبٌ فيه ${...}: يُستبدل كلُّ تعويضٍ بـ* (يطابق أيَّ نص) — تقريبٌ أوسع من الحقيقة، فهو أحوط.
        const pattern = e => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) ? e.text
          : ts.isTemplateExpression(e) ? e.head.text + e.templateSpans.map(s => "*" + s.literal.text).join("") : null;
        const lit = arg && pattern(arg) !== null ? [pattern(arg)]
          : arg && ts.isArrayLiteralExpression(arg) && arg.elements.every(e => pattern(e) !== null) ? arg.elements.map(pattern) : null;
        if (verb === "use") layers.push(makeLayer({ kind: "middleware", paths: node.arguments.length < 2 ? ["/"] : lit }));
        else if (["get", "post", "put", "patch", "delete", "all", "head", "options"].includes(verb)) layers.push(makeLayer({ kind: "route", methods: [verb], paths: lit }));
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  cache.set(spec, layers);
  return layers;
}

/** حلقةُ for (const p of ["/a", "/b"]) app.use(p, ...) */
function loopLayers(stmt) {
  if (!ts.isForOfStatement(stmt) || !ts.isArrayLiteralExpression(stmt.expression)) return null;
  if (!stmt.expression.elements.every(e => ts.isStringLiteral(e))) return null;
  const values = stmt.expression.elements.map(e => e.text);
  const decl = stmt.initializer;
  const varName = ts.isVariableDeclarationList(decl) && ts.isIdentifier(decl.declarations[0].name) ? decl.declarations[0].name.text : null;
  const body = ts.isBlock(stmt.statement) ? stmt.statement.statements : [stmt.statement];
  if (body.length !== 1 || !ts.isExpressionStatement(body[0])) return null;
  const call = body[0].expression;
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression) || call.expression.expression.getText() !== "app") return null;
  const verb = call.expression.name.text;
  if (!call.arguments[0] || !ts.isIdentifier(call.arguments[0]) || call.arguments[0].text !== varName) return null;
  return values.map(v => verb === "use" ? makeLayer({ kind: "middleware", paths: [v] }) : makeLayer({ kind: "route", methods: [verb], paths: [v] }));
}

/** طبقاتُ وحدةٍ في الموجّه: [] لا شيء؛ null مجهول (حاجزٌ أمام كل شيء). */
function unitLayers(u, analysis, cache) {
  if (u.kind === "route") return [makeLayer({ kind: "route", methods: [u.verb], paths: u.paths })];
  if (u.kind === "app") {
    if (u.verb !== "use") return [];
    return [makeLayer({ kind: "middleware", paths: u.paths })];
  }
  if (u.kind === "stmt" && u.refs.has("app")) {
    const st = u.nodes[0];
    const loop = loopLayers(st);
    if (loop) return loop;
    // registerX(app, ...) — مساراتُها من وحدتها
    const call = ts.isExpressionStatement(st) ? st.expression : ts.isBlock(st) && st.statements.length === 1 && ts.isExpressionStatement(st.statements[0]) ? st.statements[0].expression : null;
    if (call && ts.isCallExpression(call) && ts.isIdentifier(call.expression)) {
      const imp = analysis.imports.get(call.expression.text);
      if (imp && imp.spec.startsWith(".")) return existingModuleLayers(imp.spec, cache);
    }
    return null;
  }
  return [];
}

function unitsOverlap(la, lb) {
  if (la === null || lb === null) return true;
  for (const a of la) for (const b of lb) if (layersOverlap(a, b)) return true;
  return false;
}

/** Tarjan: مكوّناتٌ قويّة الترابط، الأعمقُ أولاً. */
function tarjan(nodes, edgesOf) {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  const strong = v => {
    // تكرارٌ صريح لتجنّب عمق الاستدعاء
    const work = [[v, 0]];
    idx.set(v, index); low.set(v, index); index += 1; stack.push(v); onStack.add(v);
    while (work.length) {
      const frame = work[work.length - 1];
      const [node, i] = frame;
      const edges = edgesOf(node);
      if (i < edges.length) {
        frame[1] += 1;
        const w = edges[i];
        if (!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index += 1; stack.push(w); onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) low.set(node, Math.min(low.get(node), idx.get(w)));
      } else {
        work.pop();
        if (work.length) { const parent = work[work.length - 1][0]; low.set(parent, Math.min(low.get(parent), low.get(node))); }
        if (low.get(node) === idx.get(node)) {
          const comp = [];
          let w;
          do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== node);
          out.push(comp);
        }
      }
    }
  };
  for (const n of nodes) if (!idx.has(n)) strong(n);
  return out;
}

export function planSplit(analysis, mapping, options = {}) {
  const { units } = analysis;
  const problems = [];
  const notes = [];
  const declUnitByName = new Map();
  for (const u of units) if (u.kind === "decl") for (const n of u.names) declUnitByName.set(n, u);

  /* ── التحقق من أسماء الخريطة: ما سُمّي ولم يُوجد خطأٌ صريح ── */
  for (const name of Object.keys(mapping.place || {})) if (!declUnitByName.has(name)) problems.push(`mapping.place: «${name}» غير موجود في server.ts`);
  for (const name of mapping.keep || []) if (!declUnitByName.has(name)) problems.push(`mapping.keep: «${name}» غير موجود في server.ts`);
  const regionAnchors = [];
  for (const [anchor, target] of mapping.regions || []) {
    const u = declUnitByName.get(anchor);
    if (!u) { problems.push(`mapping.regions: المرساة «${anchor}» غير موجودة`); continue; }
    regionAnchors.push({ index: u.index, target, anchor });
  }
  regionAnchors.sort((a, b) => a.index - b.index);
  const regionOf = u => {
    let target = mapping.defaultRegion || "core/shared";
    for (const r of regionAnchors) if (r.index <= u.index) target = r.target; else break;
    return target;
  };

  /* ── ١) الثوابت: الاستيرادات، ما يمسّ app، الطرق ── */
  const keep = new Set(mapping.keep || []);
  for (const u of units) {
    if (u.kind === "import") { u.target = SERVER; u.fixed = true; continue; }
    if (u.kind === "app") { u.target = SERVER; u.fixed = true; continue; }
    if (u.kind === "route") {
      const t = matchRoute(mapping.routes, u.paths[0]);
      if (!t) problems.push(`لا قاعدة لمسار ${u.verb.toUpperCase()} ${u.paths[0]} (سطر ${u.line})`);
      u.target = t || SERVER;
      u.fixed = true;
      continue;
    }
    if (u.kind === "stmt") {
      const code = firstCodeLine(u.text);
      u.code = code;
      const rule = (mapping.stmts || []).find(([rx]) => rx.test(code));
      if (rule) { u.target = rule[1]; u.fixed = true; continue; }
      if (u.refs.has("app")) { u.target = SERVER; u.fixed = true; continue; }
      u.follow = true; // يتبع ما يمسّه، بعد وضع التعريفات
      continue;
    }
    if (u.kind === "decl") {
      const explicit = u.names.map(n => mapping.place?.[n]).find(Boolean);
      if (explicit) { u.target = explicit; u.fixed = true; continue; }
      if (u.names.some(n => keep.has(n))) { u.target = SERVER; u.fixed = true; continue; }
    }
  }

  /* ── ٢) التعريفات بالتبعية: من المستعمِل إلى المستعمَل ── */
  const usersOf = new Map(); // decl unit index -> Set(user unit index)
  for (const u of units) {
    if (u.kind === "import") continue;
    for (const name of u.refs.keys()) {
      const d = declUnitByName.get(name);
      if (!d || d === u) continue;
      if (!usersOf.has(d.index)) usersOf.set(d.index, new Set());
      usersOf.get(d.index).add(u.index);
    }
  }
  const declUnits = units.filter(u => u.kind === "decl");
  const edgesOf = idx => {
    const u = units[idx];
    const out = [];
    for (const name of u.refs.keys()) { const d = declUnitByName.get(name); if (d && d !== u) out.push(d.index); }
    return out;
  };
  const comps = tarjan(declUnits.map(u => u.index), edgesOf).reverse(); // المستعمِلُ أولاً
  for (const comp of comps) {
    const members = new Set(comp);
    const pending = comp.filter(i => !units[i].fixed);
    if (!pending.length) continue;
    const targets = new Set();
    for (const i of comp) for (const userIdx of usersOf.get(i) || []) {
      if (members.has(userIdx)) continue;
      const user = units[userIdx];
      if (user.follow) continue;
      if (!user.target) throw new Error(`ترتيبٌ خاطئ: ${user.line} قبل أن يوضع`);
      targets.add(user.target);
    }
    for (const i of comp) if (units[i].fixed) targets.add(units[i].target);
    let target;
    if (targets.size === 1) target = [...targets][0];
    else target = regionOf(units[pending[0]]);
    if (target === SERVER && targets.size === 1 && !units[pending[0]].names.some(n => keep.has(n))) {
      // لا يستعمله إلا server.ts: يبقى فيه إن كانت منطقتُه server، وإلا يذهب إلى منطقته
      const region = regionOf(units[pending[0]]);
      target = region;
    }
    for (const i of pending) { units[i].target = target; units[i].auto = targets.size === 1 ? "affinity" : "region"; }
  }

  /* ── ٣) الجملُ ذات الأثر تتبع ما تمسّه ── */
  for (const u of units) if (u.follow) {
    const counts = new Map();
    let written = null;
    for (const [name, r] of u.refs) {
      const d = declUnitByName.get(name);
      if (!d) continue;
      if (r.write && d.declKind === "let") written = d.target;
      counts.set(d.target, (counts.get(d.target) || 0) + d.lines);
    }
    u.target = written || [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || SERVER;
  }

  /* ── ٣ب) المرحلة: ما لا يُنقل في هذه المرحلة يبقى في server.ts ──
     pages   : بُناةُ الصفحات وكلُّ ما يحتاجونه من تعريفات (إلى وحداتها النهائية)
     helpers : كلُّ ما وجهتُه core/ أو pages/ (والطرقُ وما يخصّها باقيةٌ في server.ts)
     routes  : كلُّ شيء (التقسيمُ الكامل) */
  const phase = options.phase || "routes";
  for (const u of units) u.finalTarget = u.target;
  if (phase !== "routes") {
    const moved = new Set();
    const always = u => u.target === "core/boot";
    if (phase === "pages") {
      const queue = units.filter(u => u.kind === "decl" && String(u.target).startsWith("pages/"));
      for (const u of queue) moved.add(u.index);
      while (queue.length) {
        const u = queue.pop();
        for (const name of u.refs.keys()) {
          const d = declUnitByName.get(name);
          if (!d || moved.has(d.index) || d.target === SERVER) continue;
          moved.add(d.index);
          queue.push(d);
        }
      }
      // جملةٌ ذات أثر تنتقل إن انتقل كلُّ ما تمسّه
      for (const u of units) if (u.follow) {
        const refs = [...u.refs.keys()].map(n => declUnitByName.get(n)).filter(Boolean);
        if (refs.length && refs.every(d => moved.has(d.index))) moved.add(u.index);
      }
    } else if (phase === "helpers") {
      for (const u of units) if ((u.kind === "decl" || u.kind === "stmt") && /^(core|pages)\//.test(String(u.target))) moved.add(u.index);
    } else throw new Error(`مرحلةٌ غير معروفة: ${phase}`);
    for (const u of units) {
      if (u.kind === "import" || u.target === SERVER) continue;
      if (!moved.has(u.index) && !always(u)) { u.target = SERVER; u.deferred = true; }
    }
  }

  /* ── ٤) let يُكتب فيه من خارج وحدته ← state ── */
  const stateVars = new Set();
  for (const d of declUnits) if (d.declKind === "let") {
    for (const name of d.names) {
      for (const u of units) {
        const r = u.refs.get(name);
        if (!r) continue;
        if ((r.write && u.target !== d.target) || (d.target === SERVER && u.target !== SERVER)) stateVars.add(name);
      }
    }
  }
  for (const name of mapping.state || []) stateVars.add(name);
  for (const name of stateVars) {
    const d = declUnitByName.get(name);
    if (d.names.length !== 1) problems.push(`let متعدّد الأسماء لا يُنقل إلى state: ${d.names.join(",")}`);
    d.target = "core/state";
    d.state = true;
  }

  /* ── ٥) مراجعُ إلى ما بقي في server.ts من خارجه ── */
  for (const u of units) {
    if (u.target === SERVER || u.kind === "import") continue;
    for (const [name] of u.refs) {
      const d = declUnitByName.get(name);
      if (!d || d.target !== SERVER || d.state) continue;
      if (u.kind === "route" && name === "app") continue; // app: وسيطُ دالة التسجيل نفسها
      if (u.kind === "route") { (u.deps ||= new Set()).add(name); continue; }
      problems.push(`${u.target} (سطر ${u.line}) يستعمل «${name}» الباقي في server.ts`);
    }
  }

  /* ── ٦) ترتيبُ التسجيل ── */
  const cache = new Map();
  const seq = [];
  for (const u of units) {
    if (u.kind === "import" || u.kind === "decl") continue;
    if (u.kind === "stmt" && !u.refs.has("app") && u.target !== SERVER) continue;
    const layers = unitLayers(u, analysis, cache);
    if (layers && layers.length === 0 && u.target === SERVER) {
      // جملةٌ باقية لا طبقة لها: حاجزٌ إن مسّت app (حلقةُ asyncSafe مثلاً)
      if (u.refs.has("app")) seq.push({ u, layers: null });
      continue;
    }
    if (layers && layers.length === 0) continue;
    seq.push({ u, layers });
  }
  // تعارضاتُ السابق مع اللاحق
  const n = seq.length;
  const preds = seq.map(() => []);
  for (let j = 0; j < n; j += 1) for (let i = 0; i < j; i += 1) {
    const a = seq[i], b = seq[j];
    if (a.u.target === b.u.target && a.u.target !== SERVER) continue; // داخل الوحدة يُحفظ الترتيبُ بنفسه
    if (unitsOverlap(a.layers, b.layers)) preds[j].push(i);
  }
  const emitted = new Array(n).fill(false);
  const nextOfModule = new Map(); // target -> sorted indexes
  seq.forEach((s, i) => { if (s.u.target !== SERVER) { if (!nextOfModule.has(s.u.target)) nextOfModule.set(s.u.target, []); nextOfModule.get(s.u.target).push(i); } });
  const cursor = new Map([...nextOfModule.keys()].map(k => [k, 0]));
  const ready = i => preds[i].every(p => emitted[p]);
  const runs = []; // { target, items: [seq idx] }
  let current = null;
  let earliest = 0;
  let done = 0;
  while (done < n) {
    while (earliest < n && emitted[earliest]) earliest += 1;
    if (current) {
      const list = nextOfModule.get(current.target);
      const c = cursor.get(current.target);
      if (c < list.length && ready(list[c])) {
        emitted[list[c]] = true; done += 1; cursor.set(current.target, c + 1); current.items.push(list[c]);
        continue;
      }
      current = null;
    }
    const e = earliest;
    const s = seq[e];
    if (s.u.target === SERVER) { emitted[e] = true; done += 1; continue; }
    current = { target: s.u.target, items: [] };
    runs.push(current);
    const list = nextOfModule.get(current.target);
    const c = cursor.get(current.target);
    if (list[c] !== e) throw new Error("ترتيبُ الوحدة اختلّ");
    emitted[e] = true; done += 1; cursor.set(current.target, c + 1); current.items.push(e);
  }
  // أسماءُ دوال التسجيل
  const runsOf = new Map();
  for (const r of runs) { if (!runsOf.has(r.target)) runsOf.set(r.target, []); runsOf.get(r.target).push(r); }
  for (const [target, list] of runsOf) {
    const base = "register" + path.basename(target).replace(/^./, c => c.toUpperCase());
    list.forEach((r, k) => { r.fn = list.length === 1 ? base : `${base}${k + 1}`; r.units = r.items.map(i => seq[i].u); });
  }
  // كلُّ طريقٍ يعرف دالته
  for (const r of runs) for (const u of r.units) u.run = r;

  return { units, runs, stateVars, problems, notes, declUnitByName, regionOf, phase };
}
