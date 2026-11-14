/**
 * ── اختبار الدخان الأسبوعي: الضمانات التي لا تُكسر (بلا خادم ولا متصفّح) ─────────────────────────
 *
 *  W1 سيرُ العمل أسبوعيٌّ ويدويّ، بصلاحية قراءة المحتوى وحدها، ولا يحوي اعتماداً ولا نشراً ولا Docker ولا gcloud.
 *  W2 يعمل على البيئة التجريبية وحدها (DATA_MODE=demo) ولا يحصر نفسه بغير المستودع الرسمي.
 *  W3 المتصفّحُ يُثبَّت للسكربت وحده بنسخةٍ مثبّتة (لا يغيّر package.json ولا القفل).
 *  W4 السكربتُ: كلُّ دورٍ فيه معرَّفٌ في الأدوار التجريبية، وكلُّ مسارٍ مسجّلٌ في App.tsx، وفحصُ Enter وعرضُ الهاتف باقيان.
 *  W5 لا أسرار ولا بيانات حقيقية في السكربت، ولا رفعَ artifact (مستودعٌ عام).
 */
import fs from "node:fs";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");

const workflowRaw = read(".github/workflows/weekly-smoke.yml");
/* التعليقاتُ تشرح ما لا يفعله السيرُ (تسمّي gcloud وDocker)؛ الفحصُ على الأوامر لا على الشرح. */
const workflow = workflowRaw.split("\n").filter(line => !/^\s*#/.test(line)).join("\n");
const script = read("scripts/ci/weekly-smoke.mjs");
const app = read("src/App.tsx");
const demo = read("src/db/demoSandbox.ts");
const pkg = JSON.parse(read("package.json"));

check(/schedule:\s*\n\s*- cron: "\d+ \d+ \* \* 0"/.test(workflow) && workflow.includes("workflow_dispatch:"), "W1 جدولٌ أسبوعيّ (الأحد) وتشغيلٌ يدويّ");
check(/permissions:\s*\n\s+contents: read\s*\n/.test(workflow) && !/id-token|actions: write|contents: write|issues: write|pull-requests: write/.test(workflow), "W1 صلاحيةُ قراءة المحتوى وحدها");
check(!/gcloud|docker|google-github-actions|secrets\.|GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_|upload-artifact/.test(workflow), "W1 لا اعتماد ولا نشر ولا Docker ولا رفعَ artifact");
check(/DATA_MODE: demo/.test(workflow) && /NODE_ENV: production/.test(workflow) && workflow.includes("node dist/server.cjs"), "W2 الخادمُ يعمل بـDATA_MODE=demo من البناء نفسه");
check(/github\.repository == '[\w.-]+\/schedule-kw'/.test(workflow) && /timeout-minutes: \d+/.test(workflow), "W2 للمستودع الرسمي وحده، بمهلة");
const pinned = workflow.match(/npm install --no-save playwright@(\d+\.\d+\.\d+)/)?.[1];
check(Boolean(pinned) && workflow.includes("npx playwright install --with-deps chromium"), `W3 المتصفّح يُثبَّت للسكربت بنسخةٍ مثبّتة (${pinned})`);
check(!("playwright" in (pkg.dependencies || {})) && !("playwright" in (pkg.devDependencies || {})), "W3 playwright لا يدخل package.json");

const journeys = script.slice(script.indexOf("export const JOURNEYS"), script.indexOf("export const PHONE_SCREENS"));
const roles = [...journeys.matchAll(/^\s{2}(\w+): \[/gm)].map(match => match[1]).filter(role => role !== "demo");
check(roles.length >= 5 && roles.every(role => demo.includes(role)), `W4 كلُّ دورٍ في الرحلات (${roles.join("، ")}) معرَّفٌ في الأدوار التجريبية`);
const paths = [...new Set([...script.matchAll(/"(\/(?:Home|Ad\w+|FSchedule|System\w*|SystemUser|Schedule)\/[A-Za-z]+)"/g)].map(match => match[1]))];
check(paths.length >= 12 && paths.every(path => app.includes(`"${path}"`)), `W4 كلُّ مسارٍ (${paths.length}) مسجّلٌ في App.tsx`);
check(script.includes("قرار سريع") && script.includes("keyboard.press(\"Enter\")") && script.includes("course-state") === false && script.includes("/api/student-registration"), "W4 انحدارُ Enter في «قرار سريع» باقٍ");
check(script.includes("width: 390") && script.includes("state.overflow > 1"), "W4 فحصُ التمرير الأفقي على عرض الهاتف باقٍ");
check(/status >= 500 && url\.includes\("\/api\/"\)/.test(script) && script.includes("pageerror"), "W4 ردُّ 5xx وأخطاءُ الصفحة تُسقط التشغيل");
check(/status >= 400 && status !== 429 && \(url\.includes\("\/api\/"\) \|\| url\.includes\("\/assets\/"\)\)/.test(script), "W4 رفضٌ 4xx على مسار /api/ أو ملف /assets/ (ملفٌّ مفقود، مسارٌ مغلق على دور) يُسقط التشغيل لا يمرّ صامتاً");
check(/const BENIGN_CONSOLE = \[\/Failed to load resource: the server responded with a status of 429\/\];/.test(script), "W4 المسموح من console.error هو تحديدُ المعدّل 429 وحده");
check(script.includes("let watching = false;") && script.includes("watching = true;") && script.includes("if (!watching) return;"), "W4 المراقبةُ تبدأ بعد الدخول التجريبي (فحصُ الجلسة قبله يردّ 401 عمداً)");
check((script.match(/await switchRole\(/g) || []).length >= 2 && script.includes("phoneRole") && !/await post\("\/api\/demo\/role"/.test(script.replace(/async function switchRole[\s\S]*?\n}\n/, "")), "W4 كلُّ تبديل دورٍ يُفحص ردُّه، فلا يُختبر الهاتفُ بدورٍ خطأ");
check(script.includes('process.exit(failures.length ? 1 : 0)'), "W4 الفشلُ يُخرج رمزاً غير صفري");
check(!/password|SESSION_SECRET|serviceAccount|GEMINI|admin123/i.test(script) && !workflow.includes("admin123"), "W5 لا أسرار ولا كلماتِ سرٍّ في السكربت وسير العمل");
check(read("docs/DELIVERY_OPERATIONS.md").includes("Weekly smoke test"), "W5 موثَّقٌ في docs/DELIVERY_OPERATIONS.md");

console.log(failed ? `\n${failed} فحصاً فشل` : "\nكل الفحوص نجحت");
process.exit(failed ? 1 : 0);
