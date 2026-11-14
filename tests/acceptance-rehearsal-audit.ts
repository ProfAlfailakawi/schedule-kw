/**
 * ── «جولة القبول»: الأجزاء النقية ──────────────────────────────────────────────
 *  M  نموذج الخطوة والتلخيص ورمز الخروج (لا يُسقط التخطّي ولا الملاحظةُ الأمرَ، والفشلُ يُسقطه).
 *  C  الاتساق: كلُّ معرّفٍ في الفهرس موجودٌ في الوثيقة والسكربت، والعكس؛ وما كان manual فهو skip في السكربت وما كان auto فهو run.
 *  R  التقرير: مكتفٍ بنفسه (بلا روابط خارجية)، RTL، يهرّب النصوص، أرقامُه لاتينية، ولا يُظهر نجاحاً لخطوةٍ متخطّاة.
 *  S  الأمان: السكربتُ يختار منفذاً حرّاً بنفسه، لا منفذَ ثابتاً ولا مساراً من هذه البيئة، ولا يتصل إلا بخادمه المحلي التجريبي.
 * بلا خادمٍ ولا متصفح.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ROLES, STEPS, STATUS_META, completeResults, escapeHtml, exitCodeFor, formatDuration, formatStamp, issuesDowngrade, jsonSummary,
  parseDocStepIds, parseScriptStepIds, renderReport, ringArcs, stepById, summarize, worseOf,
  type StepResult, type StepStatus,
} from "../scripts/lib/acceptanceRehearsal";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const make = (id: string, status: StepStatus, extra: Partial<StepResult> = {}): StepResult => ({ id, status, note: "n", details: [], shots: [], issues: [], ms: 1200, ...extra });

/* ── M: النموذج ── */
check(new Set(STEPS.map(step => step.id)).size === STEPS.length, "معرّفاتُ الفهرس فريدة");
check(STEPS.every(step => /^[A-Z]\d{1,2}$/.test(step.id)), "المعرّف حرفٌ ورقم");
check(STEPS.every(step => ROLES.some(role => role.id === step.role)), "لكل خطوةٍ دورٌ معرَّف");
check(ROLES.every(role => STEPS.some(step => step.role === role.id)), "لكل دورٍ خطوةٌ واحدة على الأقل");
check(STEPS.filter(step => step.mode === "manual").every(step => Boolean(step.skipReason)), "كلُّ خطوةٍ يدويةٍ تحمل سبب عدم إثبات الديمو لها");
check(STEPS.filter(step => step.mode === "auto").every(step => !step.skipReason), "الخطوة الآلية بلا سبب تخطٍّ ثابت");
check(["S5", "R2", "R3"].every(id => stepById(id)?.mode === "manual"), "التنبيه الحقيقي وإصدارُ رمز الاستعادة واستعادةُ الطالب يدويةٌ دائماً");
check(stepById("T3")?.mode === "auto", "التوقيع بالرقم التجريبيّ آليّ");

const mixed = [make("S1", "pass"), make("S2", "pass"), make("S3", "warn"), make("S4", "skip"), make("S5", "skip"), make("T1", "fail")];
const summary = summarize(mixed);
check(summary.total === 6 && summary.counts.pass === 2 && summary.counts.warn === 1 && summary.counts.fail === 1 && summary.counts.skip === 2, "العدّ بالحالات");
check(summary.automated === 4, "المشغَّلة = كلُّ ما ليس تخطّياً");
check(summary.percentClean === 50, "نسبة النظيفة = الناجحة ÷ المشغَّلة (2 من 4)");
check(summary.failedIds.join() === "T1", "معرّفاتُ الفاشلة");
check(summarize([]).percentClean === 0, "بلا نتائج: صفر لا NaN");
check(summarize([make("S5", "skip")]).percentClean === 0, "كلُّها متخطّاة: صفر لا قسمةً على صفر");
check(exitCodeFor(mixed) === 1, "فشلُ خطوةٍ يُخرج 1");
check(exitCodeFor([make("S1", "pass"), make("S3", "warn"), make("S5", "skip")]) === 0, "الملاحظةُ والتخطّي لا يُسقطان الأمر");
check(exitCodeFor([]) === 0, "قائمةٌ فارغة: 0");
check(worseOf("pass", "warn") === "warn" && worseOf("warn", "fail") === "fail" && worseOf("fail", "pass") === "fail" && worseOf("pass", "skip") === "pass", "الأسوأ بين نتيجتين، والتخطّي لا يُسقط");
check(issuesDowngrade([]) === false, "بلا أخطاء لا تنزيل");
check(issuesDowngrade([{ kind: "http", text: "404 GET /x" }]) === false, "404 متوقَّع لا يُنزل خطوةً");
check(issuesDowngrade([{ kind: "http", text: "503 GET /x" }]) === true, "5xx تُنزل");
check(issuesDowngrade([{ kind: "pageerror", text: "boom" }]) === true && issuesDowngrade([{ kind: "console", text: "x" }]) === true, "استثناءُ الصفحة وخطأ الكونسول يُنزلان");
const completed = completeResults([make("S1", "pass")]);
check(completed.length === STEPS.length, "completeResults تُكمل بكل خطوات الفهرس");
check(completed.find(result => result.id === "S2")?.status === "fail", "ما لم يُسجَّل يُعدّ فاشلاً لا ناجحاً");
check(completed.map(result => result.id).join() === STEPS.map(step => step.id).join(), "الترتيب هو ترتيب الفهرس");

/* ── C: الاتساق مع الوثيقة والسكربت ── */
const doc = read("docs/ACCEPTANCE_ROUND.md");
const script = read("scripts/acceptance-rehearsal.ts");
const catalogIds = STEPS.map(step => step.id);
const docIds = parseDocStepIds(doc);
const docSet = new Set(docIds);
const parsed = parseScriptStepIds(script);
const scriptIds = new Set([...parsed.run, ...parsed.skip]);
check(parseDocStepIds("| `S1` | a |\n| T2 | b |\n|---|---|\n| x | y |\n| `A1` | z |").join() === "S1,T2,A1", "قارئ جداول الوثيقة يلتقط المعرّفات وحدها");
check(parseScriptStepIds('run("S1", a); skip("S5"); await run( "T2", b); somerun("X9"); runWidths("A1", [1], c)').run.join() === "S1,T2,A1", "قارئ السكربت يلتقط run بمعرّفها");
check(catalogIds.every(id => docSet.has(id)), `كلُّ معرّف في الفهرس في الوثيقة${catalogIds.filter(id => !docSet.has(id)).map(id => ` — غائب: ${id}`).join("")}`);
check([...docSet].every(id => catalogIds.includes(id)), `كلُّ معرّفٍ في الوثيقة في الفهرس${[...docSet].filter(id => !catalogIds.includes(id)).map(id => ` — زائد: ${id}`).join("")}`);
check(catalogIds.every(id => scriptIds.has(id)), `كلُّ معرّف في الفهرس في السكربت${catalogIds.filter(id => !scriptIds.has(id)).map(id => ` — غائب: ${id}`).join("")}`);
check([...scriptIds].every(id => catalogIds.includes(id)), `كلُّ معرّفٍ في السكربت في الفهرس${[...scriptIds].filter(id => !catalogIds.includes(id)).map(id => ` — زائد: ${id}`).join("")}`);
check(catalogIds.every(id => docIds.filter(found => found === id).length >= 2), "كلُّ خطوةٍ في جدول الخطوات وفي جدول النتيجة معاً");
check(STEPS.filter(step => step.mode === "manual").every(step => parsed.skip.includes(step.id) && !parsed.run.includes(step.id)), "الخطوات اليدوية skip في السكربت لا run");
check(STEPS.filter(step => step.mode === "auto").every(step => !parsed.skip.includes(step.id) && (parsed.run.includes(step.id))), "الخطوات الآلية run في السكربت لا skip");
check(new Set(parsed.run).size === parsed.run.length && new Set(parsed.skip).size === parsed.skip.length, "لا معرّفَ مسجَّلٌ مرتين في السكربت")
check(/ACCEPTANCE_ROUND/.test(read("README.md")), "README يرتبط بالوثيقة");
check(/ACCEPTANCE_ROUND/.test(read("docs/DELIVERY_OPERATIONS.md")), "DELIVERY_OPERATIONS يرتبط بالوثيقة");
check(/ماذا أفعل إن فشلت خطوة/.test(doc) && /نتيجة الجولة/.test(doc), "الوثيقة فيها «ماذا أفعل إن فشلت خطوة» وجدول النتيجة");
check(/VAPID_PUBLIC_KEY/.test(doc) && /التنبيهات غير مفعّلة على هذا الخادم/.test(doc), "الوثيقة تقول كيف يُعرف أن مفاتيح التنبيه غير مضبوطة");
check(/يرسل تذكيراً حقيقياً/.test(doc), "الوثيقة تحذّر أن «ذكّر الباقين» يرسل تذكيراً حقيقياً");

/* ── R: التقرير ── */
const meta = { generatedAt: new Date(Date.UTC(2026, 10, 14, 9, 5)), durationMs: 83_400, browser: "Chromium 130", widths: [390, 1280], serverNote: "خادم ديمو محلي" };
const sample = completeResults([
  make("S1", "pass", { note: "ok <b>x</b>", shots: [{ caption: "الرئيسية", data: "QUJD", width: 390 }], details: ["✓ شيء"] }),
  make("S5", "skip", { note: "reason" }),
  make("T1", "fail", { issues: [{ kind: "pageerror", text: "Error: <script>alert(1)</script>" }] }),
]);
const html = renderReport(sample, meta);
check(html.startsWith("<!doctype html>") && /<html lang="ar" dir="rtl">/.test(html), "التقرير HTML بـRTL");
check(!/(?:src|href)=["']https?:/i.test(html) && !/@import|<link[^>]+href=/i.test(html), "مكتفٍ بنفسه: بلا مواردَ خارجية");
check(html.includes("data:image/jpeg;base64,QUJD"), "اللقطة مضمَّنة بترميز base64");
check(!html.includes("<script>alert(1)</script>") && html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "نصوص الأخطاء مهرَّبة");
check(!html.includes("<b>x</b>") && html.includes("ok &lt;b&gt;x&lt;/b&gt;"), "نصوص الملاحظات مهرَّبة");
check(STEPS.every(step => html.includes(`id="step-${step.id}"`)), "بطاقةٌ لكل خطوة");
check(ROLES.every(role => html.includes(role.title)), "قسمٌ لكل دور");
check(/stroke-dasharray/.test(html) && /class="ring"/.test(html), "حلقة الملخص موجودة");
check(!/[٠-٩۰-۹٪٫٬]/.test(html), "أرقام التقرير لاتينية بلا «٪»");
check(!/https?:\/\/(?:127\.0\.0\.1|localhost)/.test(html), "لا عنوانَ ولا منفذَ محلياً في التقرير");
check(/data-s="skip"/.test(html) && !/<article class="step" data-s="pass" id="step-S5"/.test(html), "الخطوة المتخطّاة لا تظهر ناجحة");
check(html.includes("2026-11-14 09:05 UTC") && formatStamp(meta.generatedAt) === "2026-11-14 09:05 UTC", "التاريخ لاتينيٌّ بصيغةٍ ثابتة");
check(formatDuration(500) === "500 ms" && formatDuration(83_400) === "1m 23s" && formatDuration(2300) === "2.3 s", "صياغة المدّة");
check(escapeHtml(`<a href="x">&'`) === "&lt;a href=&quot;x&quot;&gt;&amp;&#39;", "escapeHtml");
check(Object.values(STATUS_META).every(meta2 => meta2.icon && meta2.label), "لكل حالةٍ أيقونة وتسمية");
const arcs = ringArcs({ pass: 3, warn: 1, fail: 0, skip: 1 });
check(arcs.length === 3 && !arcs.some(arc => arc.status === "fail"), "قوسٌ لكل حالةٍ غير فارغة");
check(arcs.every(arc => arc.dash.split(" ").length === 2) && arcs[1].offset < arcs[0].offset, "الأقواس متتالية");
check(ringArcs({ pass: 0, warn: 0, fail: 0, skip: 0 }).length === 0, "حلقةٌ بلا قوسٍ حين لا نتائج");
const json = jsonSummary(sample, meta);
check(!JSON.stringify(json).includes("QUJD"), "ملخّص JSON بلا صور");
check(json.exitCode === 1 && json.steps.length === STEPS.length && json.summary.counts.fail >= 1, "ملخّص JSON يحمل رمز الخروج والخطوات");
check(renderReport(completeResults(STEPS.map(step => make(step.id, step.mode === "manual" ? "skip" : "pass"))), meta).includes("نجحت كلُّ الخطوات التي يثبتها الديمو"), "كلُّها ناجحة: الحكم «نجحت كلُّ الخطوات التي يثبتها الديمو»");

/* ── S: أمانُ السكربت ── */
const noComments = script.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check(/listen\(0,/.test(noComments), "يختار منفذاً حرّاً بـlisten(0)");
check(!/\b(?:PORT|port)\s*[:=]\s*\d{4}\b/.test(noComments) && !/:(?:3000|3223|3461)\b/.test(noComments), "لا منفذَ ثابتاً");
check(!/\/home\/|\/tmp\/|\/root\//.test(noComments), "لا مساراتٍ من هذه البيئة");
check(/DATA_MODE:\s*"demo"/.test(noComments), "الخادم المُقلَع تجريبيٌّ دائماً");
check(/K_SERVICE/.test(noComments), "يرفض العمل داخل بيئة إنتاجٍ سحابية");
check(/GOOGLE_APPLICATION_CREDENTIALS/.test(noComments) && /FIREBASE_PROJECT_ID/.test(noComments), "يُسقط إعدادات الإنتاج من بيئة الخادم");
check(!/https?:\/\/(?!127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/i.test(noComments.replace(/https?:\/\/\$\{/g, "")), "لا عنوانَ خارجياً في السكربت");
check(/isolated/.test(noComments) && /\/api\/demo\/config/.test(noComments), "يتحقق أن الخادم ديمو معزول قبل أن يبدأ");
check(/SIGKILL/.test(noComments) && /SIGTERM/.test(noComments) && /stopServer/.test(noComments), "يُطفئ الخادم عند الانتهاء (SIGTERM ثم SIGKILL)");
check(/exitCodeFor/.test(noComments) && /process\.exitCode/.test(noComments), "رمز الخروج من النتائج");
check(/acceptance-report\//.test(read(".gitignore")), "مجلد التقرير الافتراضي مُتجاهَلٌ في git");
const pkg = JSON.parse(read("package.json"));
check(pkg.scripts["rehearsal:acceptance"] === "tsx scripts/acceptance-rehearsal.ts", "npm run rehearsal:acceptance مسجَّل");
check(pkg.scripts["test:acceptance-rehearsal"] === "tsx tests/acceptance-rehearsal-audit.ts", "اختبار الجولة مسجَّل في package.json");
check(read("tests/suite.txt").split(/\r?\n/).includes("test:acceptance-rehearsal"), "واختبار الجولة في tests/suite.txt");
check(!/claude|anthropic|openai|copilot/i.test(doc + script + read("scripts/lib/acceptanceRehearsal.ts")), "لا أسماءَ نماذج أو أدواتٍ في الوثيقة والسكربت");
check(!/[٠-٩۰-۹٪٫٬]/.test(doc + read("scripts/lib/acceptanceRehearsal.ts")), "الوثيقة والنموذج بأرقامٍ لاتينية");
check(!/[\w.+-]+@[\w-]+\.[\w.-]+/.test(doc + script + read("scripts/lib/acceptanceRehearsal.ts")), "لا بريداً إلكترونياً");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
