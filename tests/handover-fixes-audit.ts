/**
 * ── إصلاحاتُ مراجعة المواصفات قبل التسليم ─────────────────────────────────────
 *
 *   H1  صفحة التعريف: أرقامُ «النبض» واللوحة موسومةٌ توضيحيةً لا حيّة، ولا بريدَ شخصي — النموذجُ هو الطريق
 *   H2  لا سكربتَ يرسل أعطالاً إلى جهةٍ خارجية؛ الأعطالُ إلى خادم البرنامج، وصفحةُ القياس تقول ذلك
 *   H3  حفظُ الصلاحيات طلبٌ واحد يستبدل المجموعة في كتابةٍ واحدة مع سطر سجل، ويزيل الصفوف بلا معرّف
 *   H4  لا شاشةَ «صلاحيات» ميتة، و«نسخ فصل» لا يسقط في السجل
 *   H5  بطاقةُ الأستاذ: لا رقمَ مدنيّاً في تخزين المتصفح، والحدُّ الأدنى ثمانية أرقام كالخادم
 *   H6  المقررات: الرمزُ المكرّر يمنع الحفظ
 *   H7  ورقةُ الرفض: لا بديلَ مختارٌ سلفاً
 *   H8  الاستثناءُ الفردي لا يترك طلبين مفتوحين (رحلةٌ حيّة على صندوق الديمو)
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/* ── H1 ── */
const landing = read("public/landing/index.html");
check(!/[A-Za-z0-9._%+-]+@(?!paaet\.edu\.kw")[A-Za-z0-9-]+\.[a-z.]{2,}/.test(landing.replace(/placeholder="name@[^"]+"/g, "")) && !/mailto:/i.test(landing), "صفحة التعريف بلا بريدٍ شخصي ولا mailto");
check(!/copyOfficialEmail/.test(landing) && (landing.match(/href="#inquiry-form"/g) || []).length >= 2, "زرّا المراسلة يوجّهان إلى النموذج");
check(/النموذجُ يحفظ الطلب ويُبلغ مدير النظام/.test(landing), "رسالةُ الفشل تعيد إلى النموذج لا إلى بريد");
const pulse = landing.slice(landing.indexOf('<section id="telemetry"'), landing.indexOf("</section>", landing.indexOf('<section id="telemetry"')));
check(/توضيحي/.test(pulse) && /لا قراءة حيّة/.test(pulse) && !/قراءة حيّة<\/p>|محسوبة لحظياً|77 محاضرة الآن/.test(pulse), "قسمُ النبض يقول إن أرقامه توضيحية");
check(/لوحة المتابعة · مثالٌ توضيحي/.test(landing) && /مثال توضيحي، لا بيانات حيّة/.test(landing) && !/لوحة المتابعة المباشرة · الفصل الحالي/.test(landing), "لوحةُ الواجهة الأولى موسومةٌ توضيحية");

/* ── H2 ── */
check(!fs.existsSync(path.join(process.cwd(), "public/orbit-sensor.js")), "لا سكربتَ مراقبةٍ يرسل إلى جهةٍ خارجية");
check(!/orbit-sensor/.test(read("index.html")) && !/orbit-sensor/.test(landing), "لا تحمّله الواجهة الرئيسية ولا صفحة التعريف");
const telemetry = read("src/utils/clientTelemetry.ts");
check(/fetch\("\/api\/telemetry\/client"/.test(telemetry) && !/https?:\/\//.test(telemetry), "أعطالُ الواجهة تذهب إلى خادم البرنامج وحده");
const { measurementPage } = await import("../src/server/adsPages");
const policy = measurementPage("N");
check(policy.includes("لا نستعمل شبكات إعلانٍ ولا أدوات تتبّعٍ خارجية") && policy.includes("تُرسل إلى خادم البرنامج نفسه وحده"), "صفحةُ القياس تصف ما يحدث فعلاً للأعطال");

/* ── H3 + H4 ── */
const admin = read("src/components/AdminUsers.tsx");
const save = admin.slice(admin.indexOf("const savePermission"), admin.indexOf("const saveScope"));
check(/api\(`\/api\/permissions\/user\/\$\{permUser\}`/.test(save) && /method: "PUT"/.test(save) && !/method: "DELETE"/.test(save) && !/for \(const/.test(save), "الواجهة تحفظ الصلاحيات بطلبٍ واحد لا حذفٍ ثم إضافة");
const routes = read("src/server/routes/usersRoutes.ts");
check(/app\.put\("\/api\/permissions\/user\/:userId", requirePermission\(12\)/.test(routes) && /res\.locals\.auditChanges = `صلاحيات الحساب/.test(routes), "الخادم يستبدل المجموعة ويكتب سطراً في السجل");
const repo = read("src/db/repository.ts");
const replace = repo.slice(repo.indexOf("saveSecurityByUser: async"), repo.indexOf("// FormNames"));
check(/firestoreDb\.batch\(\)/.test(replace) && /batch\.commit\(\)/.test(replace) && !/deleteSecurity|createSecurity/.test(replace), "الاستبدالُ في كتابةٍ واحدة (دفعةٌ واحدة في القاعدة)");
check(!/permissionsFormDrawer|mode === "permissions"\)|selectedPermKey|deletePermission/.test(admin) && /requestedMode === "permissions" \? "users"/.test(admin), "لا شاشةَ صلاحياتٍ ميتة: الرابطُ القديم يفتح المستخدمين");
check(/if \(mode === "copyTerm"\) onNavigate\?\.\("copyTerm"\)/.test(admin) && /if \(mode === "copyTerm"\) return/.test(admin), "«نسخ فصل» يُحوَّل إلى شاشته ولا يعرض السجل");

/* السلوك: مستودعُ الذاكرة يستبدل الصلاحيات ويزيل الصفوف بلا معرّف */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handover-perms-"));
  process.env.SCHEDULE_PRIVATE_DIR = dir;
  process.env.DATA_MODE = "demo";
  const { Repository, initDatabase } = await import("../src/db/repository");
  await initDatabase();
  const uid = 990001;
  await Repository.saveSecurityByUser(uid, [1, 2, 3]);
  const before = await Repository.getSecurityByUser(uid);
  /* صفٌّ قديمٌ بلا معرّف، كما في البيانات المرحَّلة (القراءةُ في الذاكرة تعيد الصفَّ نفسه) */
  delete (before.find(row => row.FormNameId === 3) as any).legacyId;
  const keep2 = before.find(row => row.FormNameId === 2)!;
  const result = await Repository.saveSecurityByUser(uid, [2, 4]);
  const after = await Repository.getSecurityByUser(uid);
  check(after.map(row => row.FormNameId).sort().join(",") === "2,4" && after.find(row => row.FormNameId === 2)?.legacyId === keep2.legacyId, "يبقى ما بقي بمعرّفه، ويُزال غيرُه، ويُضاف الجديد", after);
  check(result.added.join(",") === "4" && result.removed.sort().join(",") === "1,3", "ويُعيد ما أُضيف وما أُزيل لسطر السجل", result);
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ── H5 ── */
const staff = read("src/server/pages/staffCardPage.ts");
check(!/sessionStorage\.setItem\("sk-civil/.test(staff) && !/localStorage\.setItem\("sk-civil/.test(staff) && /sessionStorage\.removeItem\("sk-civil:"\+TOKEN\)/.test(staff), "الرقمُ المدني لا يُحفظ في المتصفح، وتُمحى النسخةُ القديمة");
check(/if\(value\.length<8\)/.test(staff) && !/value\.length!==12/.test(staff), "الحدُّ الأدنى ثمانية أرقام كالخادم");
check(/if \(!byDevice && digits\.length < 8\) return null;/.test(read("src/server/routes/publicStaffRoutes.ts")), "وقاعدةُ الخادم كما هي");

/* ── H6 ── */
const courses = read("src/components/Courses.tsx");
const submit = courses.slice(courses.indexOf("const submit = async"), courses.indexOf("setSubmitting(true);", courses.indexOf("const submit = async")));
check(/if \(duplicateCourseCode\(\)\) \{\s*setError\(DUPLICATE_COURSE_CODE\);\s*return;/.test(submit), "الرمزُ المكرّر يمنع الحفظ ولا يمحوه الإرسال");

/* ── H7 ── */
const inbox = read("src/components/InstructorInbox.tsx");
const sheet = inbox.slice(inbox.indexOf("function RejectSheet("), inbox.indexOf("سجّل الرفض"));
check(/const \[offered, setOffered\] = useState<string\[\]>\(\[\]\);/.test(sheet) && !/useState<string\[\]>\(\(item\.nearestTimes/.test(sheet), "ورقةُ الرفض تبدأ بلا بديلٍ مختار");

/* ── H8: رحلةٌ حيّة ── */
const issueSrc = read("src/server/routes/instructorRequestsRoutes.ts");
check(issueSrc.includes('if (held && (move === "extend" || ((onlyNoted || individualOnly) && move === "keep")))'), "الاستثناءُ يمدّد الطلبَ المفتوح بدل طلبٍ ثانٍ");

const PORT = Number(process.env.HANDOVER_PORT || 3700 + Math.floor(Math.random() * 100));
const BASE = `http://127.0.0.1:${PORT}`;
let child: ChildProcess | null = null;
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
async function http(method: string, p: string, body?: unknown, cookie?: string) {
  const res = await fetch(BASE + p, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set ? set.split(";")[0] : undefined };
}
const SCOPE = "collegeId=1&sectionId=1&termId=1";
const tomorrow = () => { const d = new Date(Date.now() + 2 * 86400000); return `${d.toISOString().slice(0, 10)}T23:59`; };
try {
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT), SCHEDULE_PRIVATE_DIR: "" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 1000)); }
  const login = await http("POST", "/api/auth/demo", {});
  const cookie = login.cookie!;
  await waitForDemoSeed(BASE, cookie);
  await http("POST", "/api/demo/role", { role: "admin" }, cookie);
  const A = (method: string, p: string, body?: unknown) => http(method, p, body, cookie);

  /* (حفظُ الصلاحيات لا يُجرَّب هنا: الصندوقُ التجريبي يحمي الإدارة من الكتابة؛ سلوكُه مختبرٌ على المستودع أعلاه.) */
  /* الاستثناءُ الفردي على طلبٍ مرسَل */
  const rows: any[] = (await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows || [];
  const open = rows.find(r => (r.status === "submitted" || r.status === "in-review") && r.linkMode !== "ta");
  if (open) {
    const id = Number(open.AdInstructorId);
    const issue = await A("POST", "/api/instructor-requests/issue", { collegeId: 1, sectionId: 1, termId: 1, closesAt: tomorrow(), source: "draft", mode: "edit", instructorId: id, reason: "ظرف طارئ" });
    check(issue.status === 200, "استثناءٌ فردي لأستاذٍ أرسل طلبه", issue.json);
    const afterRows: any[] = ((await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows || []).filter((r: any) => Number(r.AdInstructorId) === id);
    const openAfter = afterRows.filter(r => ["sent", "draft", "submitted", "in-review"].includes(String(r.status)) && r.linkMode !== "ta");
    check(openAfter.length === 1, "يبقى له طلبٌ مفتوحٌ واحد", afterRows.map(r => ({ id: r.id, status: r.status, linkId: r.linkId })));
    const same = afterRows.find(r => r.id === open.id);
    check(same && same.individualException?.reason === "ظرف طارئ" && (same.timeline || []).some((t: any) => t.detail === "استثناء فردي لظرف طارئ"), "الطلبُ نفسه يحمل الاستثناء ويُسجَّل في سجلّه", same && { exc: same.individualException, tl: (same.timeline || []).slice(-2) });
  } else check(false, "لا طلبَ مرسَلاً في الصندوق لاختبار الاستثناء");
} catch (error) {
  check(false, "الرحلة الحيّة", String((error as Error)?.stack || error));
} finally {
  stop();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
