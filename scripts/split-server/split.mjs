#!/usr/bin/env node
/**
 * ── تقسيمُ server.ts إلى وحدات، نقلاً بلا تغيير ────────────────────────────────
 *
 *   node scripts/split-server/split.mjs --plan     تقرير: أين تذهب كل وحدة، وأحجامُ الوحدات
 *   node scripts/split-server/split.mjs --write    يكتب الوحدات وserver.ts الجديد ويطبّق الرقع
 *
 * المدخل: server.ts كما هو قبل التقسيم (أو --source <ملف>). الأداةُ ترفض ملفاً مقسوماً.
 * التفاصيل وخطواتُ إعادة التشغيل على main أحدث: docs/SERVER_MAP.md.
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeServer, describeUnit } from "./analyze.mjs";
import { planSplit, SERVER } from "./plan.mjs";
import * as mapping from "./mapping.mjs";
import { generate, GENERATED_MARK } from "./generate.mjs";
import { rewriteTests } from "./rewriteTests.mjs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const sourceFile = option("--source") || "server.ts";
const text = fs.readFileSync(sourceFile, "utf8");
if (/from "\.\/src\/server\/core\//.test(text)) {
  console.error("server.ts مقسومٌ أصلاً. شغّل الأداة على النسخة غير المقسومة (git checkout <base> -- server.ts).");
  process.exit(1);
}

const t0 = Date.now();
const analysis = analyzeServer(text, sourceFile);
const phase = option("--phase") || "routes";
const plan = planSplit(analysis, mapping, { phase });
console.error(`حُلّل ${analysis.units.length} وحدة في ${((Date.now() - t0) / 1000).toFixed(1)} ث`);

if (flag("--plan") || !flag("--write")) {
  const sizes = new Map();
  for (const u of plan.units) {
    if (u.kind === "import") continue;
    sizes.set(u.target, (sizes.get(u.target) || 0) + u.lines);
  }
  console.log("── الأحجام (أسطر منقولة، قبل الاستيرادات) ──");
  for (const [t, n] of [...sizes].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(6), t);
  console.log("\n── دوال التسجيل ──");
  for (const r of plan.runs) console.log(r.fn.padEnd(40), r.units.length, "طريق", "من سطر", r.units[0].line);
  console.log("\n── متغيّراتٌ إلى state ──", [...plan.stateVars].join(", ") || "لا شيء");
  if (flag("--verbose")) {
    console.log("\n── الوضع ──");
    for (const u of plan.units) if (u.kind === "decl" || u.kind === "stmt") console.log(String(u.line).padStart(6), (u.auto || (u.fixed ? "fixed" : u.follow ? "follow" : "")).padEnd(9), u.target.padEnd(34), describeUnit(u).slice(0, 70));
  }
  const deps = plan.units.filter(u => u.deps?.size);
  if (deps.length) { console.log("\n── طرقٌ تحتاج deps من server.ts ──"); for (const u of deps) console.log(u.line, describeUnit(u), [...u.deps].join(",")); }
  if (plan.problems.length) { console.log("\n── مشكلات ──"); for (const p of plan.problems) console.log(" •", p); }
  process.exit(plan.problems.length ? 1 : 0);
}

if (plan.problems.length) {
  console.error("── مشكلات تمنع الكتابة ──");
  for (const p of plan.problems) console.error(" •", p);
  process.exit(1);
}
const outRoot = option("--out") || process.cwd();
const result = generate(analysis, plan, mapping, { root: outRoot });

/* المجلداتُ المولَّدة تُمسح أولاً: كلُّ مرحلةٍ تُكتب كاملةً من server.ts الأصلي */
for (const dir of ["src/server/core", "src/server/routes", "src/server/pages"]) {
  const abs = path.join(outRoot, dir);
  if (!fs.existsSync(abs)) continue;
  for (const name of fs.readdirSync(abs)) {
    const file = path.join(abs, name);
    if (!fs.readFileSync(file, "utf8").includes(GENERATED_MARK)) {
      console.error(`${path.relative(outRoot, file)} لم تولّده الأداة — لن يُمسح. انقله أو احذفه ثم أعد التشغيل.`);
      process.exit(1);
    }
  }
  fs.rmSync(abs, { recursive: true });
}
for (const [file, content] of result.files) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
console.error(`كُتب ${result.files.size} ملفاً (المرحلة: ${phase}).`);
for (const w of result.warnings) console.error(" ! " + w);

if (!option("--out")) {
  /* الاختباراتُ التي تقرأ نصّ server.ts */
  const { changed, review } = rewriteTests(process.cwd());
  if (changed.length) console.error(`اختباراتٌ صارت تقرأ النصَّ كلّه: ${changed.length}`);
  for (const r of review) console.error(" ? " + r);

  /* الرقع: ما لم تُحسنه الأداة يُصلَح بيدٍ مرّةً ويُعاد تطبيقه في كل تشغيل */
  const order = ["pages", "helpers", "routes"];
  const phases = flag("--all-patches") ? order.slice(0, order.indexOf(phase) + 1) : [phase];
  for (const p of phases) {
    const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "patches", p);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter(n => n.endsWith(".patch")).sort()) {
      const out = spawnSync("git", ["apply", "--whitespace=nowarn", path.join(dir, name)], { encoding: "utf8" });
      if (out.status !== 0) { console.error(`تعذّر تطبيق الرقعة ${p}/${name}:\n${out.stderr}`); process.exit(1); }
      console.error(`طُبّقت الرقعة ${p}/${name}`);
    }
  }
}
void SERVER;
