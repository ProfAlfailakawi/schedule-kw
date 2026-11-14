#!/usr/bin/env node
/**
 * ── اختبار الدخان الأسبوعي: رحلات الأدوار في المتصفّح على البيئة التجريبية ─────────────────────
 *
 * اختباراتُ المستودع ثابتةٌ ومنطقية؛ وكثيرٌ من أخطاء الواجهة لا يظهر إلا في متصفّحٍ حقيقي (مثل «Enter» في «قرار
 * سريع» الذي كان يوافق من أي زرّ). فهذا السكربت يفتح الخادمَ التجريبي (DATA_MODE=demo)، ويدخل بصفة كل دورٍ من
 * الأدوار التجريبية، ويزور شاشاتِه الرئيسية، ويفشل إن ظهر:
 *   • خطأٌ غيرُ ملتقَط في الصفحة (pageerror) أو console.error غير الموثَّق أدناه؛
 *   • ردُّ خادمٍ 5xx من أي مسار /api؛
 *   • شاشةٌ بلا محتوى أو تحمل رسالةَ انهيار؛
 *   • تمريرٌ أفقيٌّ على عرض الهاتف (390px)؛
 *   • وانحدارُ «Enter» في «قرار سريع»: ضغطُ Enter والتركيزُ على «تخطّ» يجب ألا يكتب شيئاً.
 *
 * بياناتٌ تجريبية فقط: لا يلمس بياناتِ الجامعة ولا يحتاج سراً. يُشغَّل أسبوعياً من .github/workflows/weekly-smoke.yml
 * (مجانيٌّ في مستودعٍ عام)، ومحلياً: BASE_URL=http://localhost:3000 node scripts/ci/weekly-smoke.mjs
 */
import fs from "node:fs";
import { createRequire } from "node:module";

/* require لا import: يجد playwright في node_modules (المشغّل) وفي NODE_PATH (الحاويات التي ثُبّت فيها عموماً). */
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

/** دورٌ ← الشاشاتُ التي يزورها. «demo» = مدير البيئة التجريبية (الجلسةُ الافتراضية). */
export const JOURNEYS = {
  demo: ["/Home/Index", "/AdTerm/Index", "/AdCollege/Index", "/AdSection/Index", "/AdInstructor/Index", "/AdCourse/Index",
    "/SystemUser/Index", "/System/AuditLog", "/System/Backup", "/System/LocationSetup", "/FSchedule/Index",
    "/FSchedule/InstructorRequests", "/FSchedule/StudentRegistration", "/FSchedule/Rehearsal"],
  committeeChair: ["/Home/Index", "/FSchedule/Index", "/FSchedule/InstructorRequests", "/FSchedule/StudentRegistration", "/FSchedule/Rehearsal", "/FSchedule/Changes"],
  departmentHead: ["/Home/Index", "/FSchedule/Changes"],
  registrarStaff: ["/FSchedule/StudentRegistration", "/FSchedule/Changes"],
  advisor: ["/FSchedule/StudentRegistration", "/FSchedule/Rehearsal"],
  dean: ["/Home/Index", "/FSchedule/Changes"],
};
/** شاشاتٌ تُفحص على عرض الهاتف. */
export const PHONE_SCREENS = ["/Home/Index", "/FSchedule/InstructorRequests", "/FSchedule/StudentRegistration", "/FSchedule/Rehearsal"];

/**
 * رسائلُ console.error موثَّقةٌ بأنها لا تدل على خلل: تحديدُ المعدّل (429) عند الدخول وتبديل الدور وحده.
 * 401/403/404/409 ليست منها: ملفٌّ مفقود (404) أو مسارٌ يُغلق على دورٍ (403) يجب أن يُسقط التشغيل، لا أن يمرّ صامتاً.
 */
const BENIGN_CONSOLE = [/Failed to load resource: the server responded with a status of 429/];
/** تحديثُ الرادار التلقائي يردّ 409 («يُحدَّث الآن» أو «قبل قليل») بتصميمٍ تبتلعه الواجهة؛ هذا المسارُ وحده وبـ409 وحده. */
const isRadarBusy = (status, url) => status === 409 && url.includes("/api/simulation/run");
/** قبل الدخول التجريبي يردّ الخادم 401 على فحص الجلسة عمداً؛ تُراقَب الردودُ والأخطاءُ بعده وحده. */
let watching = false;
const CRASH_TEXT = /حدث خطأ غير متوقع|Something went wrong|Application error|Unexpected Application Error/;

/* SMOKE_ONLY=enter (أو journeys,phone) لتشغيل جزءٍ منه عند التشخيص؛ الافتراضي كلُّها. */
const only = new Set((process.env.SMOKE_ONLY || "journeys,phone,enter").split(",").map(item => item.trim()).filter(Boolean));
const failures = [];
const note = (message) => { failures.push(message); console.log(`✗ ${message}`); };
const ok = (message) => console.log(`✓ ${message}`);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-KW" });
await context.addInitScript(() => {
  /* تُغلَق جولةُ الترحيب لكل دورٍ كي لا تغطي الشاشة. */
  try {
    const roles = ["committeeChair", "departmentHead", "registrarHead", "collegeRegistrar", "registrarStaff", "dean", "registrarDean", "viceDean", "admin", "advisor", "advisorGeneral", "standard", "viewer"];
    for (let id = 1; id < 400; id++) { localStorage.setItem(`schedule-onboarding-v4-${id}`, "done"); for (const role of roles) localStorage.setItem(`schedule-onboarding-v5-${id}-${role}`, "done"); }
  } catch { /* بلا تخزين */ }
});
const page = await context.newPage();

let current = "login";
page.on("pageerror", error => note(`[${current}] خطأ غير ملتقَط في الصفحة: ${String(error).slice(0, 200)}`));
page.on("console", message => {
  if (!watching || message.type() !== "error") return;
  const text = message.text();
  if (BENIGN_CONSOLE.some(pattern => pattern.test(text))) return;
  if (/status of 409/.test(text) && isRadarBusy(409, message.location().url || "")) return;
  note(`[${current}] console.error: ${text.slice(0, 200)}`);
});
page.on("response", response => {
  if (!watching) return;
  const status = response.status(), url = response.url();
  if (isRadarBusy(status, url)) return;
  if (status >= 500 && url.includes("/api/")) note(`[${current}] ردّ خادمٍ ${status} من ${response.request().method()} ${url.replace(BASE, "")}`);
  else if (status >= 400 && status !== 429 && (url.includes("/api/") || url.includes("/assets/"))) note(`[${current}] رُدّ ${status} على ${response.request().method()} ${url.replace(BASE, "")}`);
});

async function post(path, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = await page.evaluate(async ([url, payload]) => {
      const reply = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return { status: reply.status, text: (await reply.text()).slice(0, 200) };
    }, [path, body]);
    if (result.status !== 429) return result;
    await sleep(15_000 * (attempt + 1));
  }
  return { status: 429, text: "تحديد المعدّل" };
}

async function visit(path, label) {
  current = `${label} ${path}`;
  const response = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60_000 }).catch(error => { note(`[${current}] تعذّر فتح الصفحة: ${String(error).slice(0, 160)}`); return null; });
  if (!response) return;
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => {
    const main = document.querySelector("main") || document.body;
    const de = document.documentElement;
    return { text: main.innerText.replace(/\s+/g, " ").trim(), overflow: de.scrollWidth - de.clientWidth };
  });
  if (state.text.length < 20) note(`[${current}] الشاشة بلا محتوى`);
  else if (CRASH_TEXT.test(state.text)) note(`[${current}] الشاشة تعرض رسالةَ انهيار`);
  return state;
}

console.log(`اختبار الدخان على ${BASE}`);
/* fetch النسبي يحتاج صفحةً على أصل الموقع، لا about:blank. */
await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60_000 });
const start = await post("/api/auth/demo", {});
if (start.status !== 200) { note(`تعذّر الدخول التجريبي: ${start.status} ${start.text}`); }
watching = true;

/** تبديلُ الدور يُفحص ردُّه دائماً: فشلُه يعني أن ما بعده يُختبر بدورٍ خطأ (نجاحٌ كاذب). */
async function switchRole(role) {
  const result = await post("/api/demo/role", { role });
  if (result.status !== 200) note(`تعذّر التبديل إلى دور ${role}: ${result.status} ${result.text}`);
  return result.status === 200;
}

for (const [role, screens] of only.has("journeys") ? Object.entries(JOURNEYS) : []) {
  if (!(await switchRole(role === "demo" ? "admin" : role))) continue;
  let seen = 0;
  for (const screen of screens) { const state = await visit(screen, role); if (state) seen++; }
  ok(`${role}: ${seen} من ${screens.length} شاشة فُتحت`);
}

/* الهاتف: بلا تمريرٍ أفقي. */
const phoneRole = await switchRole("committeeChair");
await page.setViewportSize({ width: 390, height: 844 });
for (const screen of only.has("phone") && phoneRole ? PHONE_SCREENS : []) {
  const state = await visit(screen, "phone");
  if (state && state.overflow > 1) note(`[phone ${screen}] تمريرٌ أفقي بمقدار ${state.overflow}px على عرض 390`);
}
ok("فحص عرض الهاتف انتهى");
await page.setViewportSize({ width: 1440, height: 900 });

/* انحدار «Enter» في «قرار سريع». */
if (only.has("enter")) {
  const writes = [];
  page.on("request", request => { if (request.method() !== "GET" && request.url().includes("/api/student-registration")) writes.push(`${request.method()} ${request.url().replace(BASE, "")}`); });
  await visit("/FSchedule/StudentRegistration", "enter");
  const quick = page.getByRole("button", { name: /قرار سريع/ });
  if (await quick.count()) {
    await quick.first().click();
    await page.waitForTimeout(700);
    const skip = page.locator("[role=dialog] button", { hasText: /تخطّ|تخط/ }).first();
    if (await skip.count()) {
      await skip.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1200);
      if (writes.length) note(`[enter] Enter على «تخطّ» كتب قراراً: ${writes.join(" | ")}`);
      else ok("Enter على «تخطّ» لا يكتب شيئاً");
    } else note("[enter] لم يظهر زرّ «تخطّ» في «قرار سريع»");
  } else ok("«قرار سريع» غير ظاهر في بيانات اليوم (لا بنود)؛ فحص Enter تُخطّي");
}

await browser.close();

const summary = failures.length
  ? `## اختبار الدخان الأسبوعي: ${failures.length} مشكلة\n\n${failures.map(line => `- ${line}`).join("\n")}\n`
  : "## اختبار الدخان الأسبوعي: كل الرحلات سليمة\n";
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(failures.length ? `\n${failures.length} مشكلة` : "\nكل الرحلات سليمة");
process.exit(failures.length ? 1 : 0);
