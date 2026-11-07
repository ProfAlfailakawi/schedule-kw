/**
 * ── حارسُ صرامة فحص الأنواع (NFR-NFR-035) ────────────────────────────────────
 *
 * «npm run lint» يفحص المشروعَ كلَّه بالخيارات المفعّلة هنا، فلا يُخفَّف بصمت:
 *  1) قائمة الاستثناء لا تتجاوز node_modules وdist (لا ملفَّ مصدرٍ يُعفى من الفحص).
 *  2) لا include/files يضيّق نطاقَ الفحص.
 *  3) الخيارات الصارمة المفعّلة باقيةٌ وقيمتُها true.
 *  4) سكربت lint ما زال tsc --noEmit على هذا الملف.
 */
import fs from "node:fs";
import path from "node:path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const tsconfig = JSON.parse(read("tsconfig.json"));
const options = tsconfig.compilerOptions || {};
const exclude: string[] = Array.isArray(tsconfig.exclude) ? tsconfig.exclude : [];

const allowedExclude = ["node_modules", "dist"];
const extra = exclude.filter(entry => !allowedExclude.includes(entry));
check(extra.length === 0, `لا استثناء من الفحص غير node_modules وdist${extra.length ? ` (زائد: ${extra.join("، ")})` : ""}`);
check(tsconfig.include === undefined && tsconfig.files === undefined, "لا include/files يضيّق نطاق الفحص");

const required = [
  "alwaysStrict",
  "noImplicitThis",
  "useUnknownInCatchVariables",
  "noFallthroughCasesInSwitch",
  "strictBuiltinIteratorReturn",
  "noImplicitOverride",
  "strictFunctionTypes",
  "strictBindCallApply",
];
for (const flag of required) check(options[flag] === true, `الخيار ${flag} مفعّل`);
check(options.noEmit === true, "noEmit مفعّل");

const lint = String(JSON.parse(read("package.json")).scripts?.lint || "");
check(/\btsc --noEmit\b/.test(lint) && !/\s-p\s|--project/.test(lint), "سكربت lint يشغّل tsc --noEmit على tsconfig.json");

/* الملفّان الدخيلان حُذفا؛ عودتهما تعيد الاستثناء أو تكسر الفحص. */
for (const stray of ["src/pages/Impact.tsx", "src/components/InterfacePolish.tsx"])
  check(!fs.existsSync(path.join(process.cwd(), stray)), `الملف الدخيل ${stray} غير موجود`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
