/**
 * F1–F3 + E1 + C5 — رحلةٌ حيّة كاملة على صندوق الديمو (خادمٌ خاصٌّ بمنفذٍ خاص):
 *   فتح مرحلة التدريب بموجتين ← الموجة الأولى تصل وحدها ← المقررات المسموحة ← كرت المدرّب مقفلٌ على
 *   الشعب الشاغرة (لا إضافة حرّة) ← يختار شعبةً ويوقّع ← الطلب في الوارد بفلتر «تدريب» ←
 *   رابط «للعرض فقط» لا يكتب ← مقررٌ 🔒 يختفي من كرت الأستاذ ومن الشعب الشاغرة.
 */
import { spawn, type ChildProcess } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";

const PORT = Number(process.env.TA_FLOW_PORT || 3500 + Math.floor(Math.random() * 300));
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
async function http(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set ? set.split(";")[0] : undefined };
}
let child: ChildProcess | null = null;
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
const SCOPE = "collegeId=1&sectionId=1&termId=1";
const tomorrow = () => { const d = new Date(Date.now() + 2 * 86400000); return `${d.toISOString().slice(0, 10)}T23:59`; };

async function main() {
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 1000)); }
  const login = await http("POST", "/api/auth/demo", {});
  const cookie = login.cookie!;
  await waitForDemoSeed(BASE, cookie);
  await http("POST", "/api/demo/role", { role: "admin" }, cookie);
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);

  /* ── F1: الملخّص ── */
  const before = await A("GET", `/api/ta-phase?${SCOPE}`);
  check(before.status === 200 && before.json.tas.length >= 2 && before.json.tas.some((t: any) => t.id === 29) && before.json.tas.some((t: any) => t.id === 30), "F1 الصندوق فيه مدرّبان TA", before.json.tas);
  check(before.json.vacant.length >= 1 && before.json.summary.sections === before.json.vacant.length, "F1 ملخّص الشعب الشاغرة («هيئة تدريسية»)", before.json.summary);
  check(Array.isArray(before.json.courses) && before.json.courses.length > 0, "F3 مقررات القسم لاختيار «المسموح»");
  const vacantCourse = Number(before.json.vacant[0].courseId);

  /* ── F2: الفتح بموجتين ── */
  const opened = await A("POST", "/api/ta-phase/open", { ...Object.fromEntries(new URLSearchParams(SCOPE)), collegeId: 1, sectionId: 1, termId: 1, waves: [[29], [30]], delayHours: 12, closesAt: tomorrow(), reminderHours: 24, allowedCourses: { 29: [vacantCourse] } });
  check(opened.status === 200 && opened.json.sent.length === 1 && opened.json.sent[0].instructorId === 29, "F2 الموجة الأولى وحدها تُرسل الآن", opened.json);
  check(opened.json.doc.waves.length === 2 && !opened.json.doc.waves[1].sentAt, "F2 الموجة الثانية مجدولة بعد التأخير");
  const after = await A("GET", `/api/ta-phase?${SCOPE}`);
  const ta29 = after.json.tas.find((t: any) => t.id === 29);
  check(ta29?.sent && ta29.linkId && ta29.allowed.includes(vacantCourse) && ta29.mobile, "F3 للمدرّب رابطٌ ومقرراتٌ مسموحة ورقمٌ للتذكير بواتساب", ta29);
  check(after.json.countdown && !after.json.countdown.closed, "F2 العدّاد يعمل");
  const allowedEdit = await A("POST", "/api/ta-phase/allowed", { collegeId: 1, sectionId: 1, termId: 1, instructorId: 30, courseIds: [vacantCourse] });
  check(allowedEdit.json.ok === true, "F3 تعديل المقررات المسموحة أثناء المرحلة");

  /* ── F3: كرت المدرّب ── */
  const card = await http("GET", `/api/public/request/${encodeURIComponent(ta29.linkId)}`);
  check(card.status === 200 && card.json.mode === "ta" && card.json.windowOpen === true, "F3 الكرت بصفة «ta» ومفتوح", { mode: card.json.mode, open: card.json.windowOpen });
  check(Array.isArray(card.json.courses) && card.json.courses.length === 0, "F3 لا مقررات للإضافة الحرّة (لا وقت ولا شعبة ولا قاعة جديدة)");
  check(card.json.taLoad?.label === `نصابك ${card.json.taLoad?.hours}/12`, "F3 حلقة النصاب «نصابك x/12»", card.json.taLoad);
  check((card.json.availableOfferings || []).every((o: any) => Number(o.courseId) === vacantCourse), "F3 الشعب المعروضة ضمن المقررات المسموحة فقط", card.json.availableOfferings);
  const offering = (card.json.availableOfferings || [])[0];
  check(!!offering, "F3 شعبةٌ شاغرة بلا تعارض متاحة للاختيار");
  const instructors = (await A("GET", "/api/instructors")).json;
  const list = Array.isArray(instructors) ? instructors : (instructors.rows || instructors.instructors || []);
  const civil = String(list.find((i: any) => Number(i.AdInstructorId) === 29)?.AdInstructorCivil || "");
  const free = await http("POST", `/api/public/request/${encodeURIComponent(ta29.linkId)}`, { civil, requestRevision: Number(card.json.request.requestRevision || 0),
    items: [{ action: "add", courseId: vacantCourse, collegeId: 1, sectionId: 1, days: ["fsunday"], start: "08:00" }] });
  check(free.status === 400, "F3 الخادم يرفض الإضافة الحرّة في مرحلة التدريب", free.json);
  if (offering) {
    const pick = await http("POST", `/api/public/request/${encodeURIComponent(ta29.linkId)}`, { civil, requestRevision: Number(card.json.request.requestRevision || 0),
      items: [...(card.json.request.items || []).map((it: any) => ({ rowId: it.rowId, action: "keep", days: [], start: "" })),
        { offeringId: offering.id, action: "add", courseId: offering.courseId, collegeId: offering.collegeId, sectionId: offering.sectionId, days: offering.slots.map((s: any) => s.day), start: offering.slots[0].start }] });
    check(pick.status === 200, "F3 المدرّب يختار الشعبة الشاغرة بضغطة ويوقّع", pick.json);
    const inbox = await A("GET", `/api/instructor-requests?${SCOPE}`);
    const row = (inbox.json.rows || []).find((r: any) => Number(r.AdInstructorId) === 29 && r.linkMode === "ta");
    check(row && (row.items || []).some((i: any) => i.offeringRowIds?.length || i.action === "add"), "F3 الطلب في الوارد تحت «🎓 تدريب»", row && { linkMode: row.linkMode, status: row.status });
    const again = await http("GET", `/api/public/request/${encodeURIComponent(ta29.linkId)}`);
    check(!(again.json.availableOfferings || []).some((o: any) => o.id === offering.id), "F3 الشعبة المحجوزة لا تُعرض مرةً ثانية");
  }

  /* ── E1: للعرض فقط ── */
  const rows = (await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows || [];
  const someone = rows.find((r: any) => r.phase !== "ta" && r.status === "sent");
  if (someone) {
    const issue = await A("POST", "/api/instructor-requests/issue", { collegeId: 1, sectionId: 1, termId: 1, closesAt: tomorrow(), source: "draft", mode: "view", instructorId: someone.AdInstructorId, reason: "اختبار للعرض فقط", reopen: true });
    check(issue.status === 200, "E1 إرسالٌ فرديٌّ بصفة «للعرض فقط»", issue.json);
    const view = await http("GET", `/api/public/request/${encodeURIComponent(someone.linkId)}`);
    check(view.json.mode === "view" && view.json.windowOpen === false && (view.json.courses || []).length === 0, "E1 رابط للعرض فقط: لا كتابة ولا أدوات", { mode: view.json.mode, open: view.json.windowOpen });
    const write = await http("POST", `/api/public/request/${encodeURIComponent(someone.linkId)}`, { civil: "0", requestRevision: view.json.request.requestRevision, items: [] });
    check(write.status === 403, "E1 الخادم يرفض الكتابة على رابط للعرض فقط", write.status);
  }

  /* ── C5: مقررٌ 🔒 يختفي من الكرت والشعب الشاغرة ── */
  const lock = await A("PUT", "/api/course-offering", { collegeId: 1, sectionId: 1, termId: 1, display: "hide", courses: [{ courseId: vacantCourse, state: "closed" }] });
  check(lock.status === 200, "C5 المسؤول يقفل مقرراً");
  const ta30 = (await A("GET", `/api/ta-phase?${SCOPE}`)).json.tas.find((t: any) => t.id === 30);
  const anyEdit = rows.find((r: any) => r.phase !== "ta" && r.linkId && r.linkId !== someone?.linkId);
  if (anyEdit) {
    const editCard = await http("GET", `/api/public/request/${encodeURIComponent(anyEdit.linkId)}`);
    check(!(editCard.json.courses || []).some((c: any) => Number(c.id) === vacantCourse), "C5 المقرر المخفيّ لا يظهر في إضافة الكرت");
    check(!(editCard.json.availableOfferings || []).some((o: any) => Number(o.courseId) === vacantCourse), "C5 ولا شعبُه الشاغرة");
  }
  void ta30;
  const unlock = await A("PUT", "/api/course-offering", { collegeId: 1, sectionId: 1, termId: 1, display: "fade", courses: [{ courseId: vacantCourse, state: "closed" }] });
  if (anyEdit && unlock.status === 200) {
    const faded = await http("GET", `/api/public/request/${encodeURIComponent(anyEdit.linkId)}`);
    const c = (faded.json.courses || []).find((x: any) => Number(x.id) === vacantCourse);
    check(!c || c.offering?.state === "closed", "C5 «باهت بقفل» يرسله مقفلاً لا قابلاً للاختيار", c);
  }
}

main().catch(error => { failed++; console.error(error); }).finally(() => {
  stop();
  console.log(`\nTA phase flow audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
