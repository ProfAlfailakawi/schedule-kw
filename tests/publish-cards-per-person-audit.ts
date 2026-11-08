/**
 * «نشر ← بطاقة الأستاذ» لكل شخص (قرار المالك 2026-11-08):
 *   N  مطابقةُ المقرر القديم بالجديد بالاسم بعد التوحيد العربي (همزات، تاء مربوطة، ياء، تشكيل، تطويل، «ال»، أرقام)؛
 *   O  حدُّ مقررات البطاقة: ما خارجها يُرفض، وما طلبه قبل القيد يبقى؛
 *   X  المستبعَدون من 👁️/✏️: المنتدبون والمتدرّبون (ومن هو أستاذٌ ومتدرّبٌ معاً في 🎓 وحدها)؛
 *   M  «ذكّر من لم يرد» يقع على من لم يرسل في بطاقة ✏️ وحده؛
 *   ثم رحلةٌ حيّة على صندوق الديمو (منفذٌ خاص 3671-3679): القائمةُ والإصدارُ يستبعدان، والحدُّ يُحفظ ويُفرض
 *   في القراءة والإرسال، والمعاينةُ لا تُصدر شيئاً ولا تسجّل فتحاً، والتذكيرُ لمن لم يرد وحده (تسليمُ الديمو).
 */
import { spawn, type ChildProcess } from "child_process";
import fs from "node:fs";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { courseNameKey, personCourseDefaults, selectionCounts } from "../src/utils/personCourseDefaults";
import { normalizeOfferedCourses, offeredBreach, offeredCourseSet } from "../src/utils/offeredCourses";
import { cardExclusions, followUpState, reminderTargets } from "../src/utils/cardRecipients";

const PORT = Number(process.env.CARDS_FLOW_PORT || 3672);
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};

function pureChecks() {
  /* ── N: الاسمُ بعد التوحيد ── */
  check(courseNameKey("مقدمة في الحاسوب") === courseNameKey("مقدمه في الحاسوب"), "N التاء المربوطة = الهاء");
  check(courseNameKey("إحصاء تربوي") === courseNameKey("احصاء تربوى"), "N الهمزات والياء");
  check(courseNameKey("التـــربيةُ العمليّة") === courseNameKey("التربية العملية"), "N التطويل والتشكيل");
  check(courseNameKey("ﺍﻟﺘﺼﻮﻳﺮ") === courseNameKey("التصوير"), "N أشكال العرض (منسوخ من PDF)");
  check(courseNameKey("أصول التربية (1)") === courseNameKey("اصول تربية 1"), "N الأقواس و«ال» أول الكلمة");
  check(courseNameKey("رياضيات ١") === courseNameKey("رياضيات 1"), "N الأرقام العربية = اللاتينية");
  check(courseNameKey("رياضيات 1") !== courseNameKey("رياضيات 2"), "N والرقمُ يفرّق: «رياضيات 1» غيرُ «رياضيات 2»");
  check(courseNameKey("علم النفس") !== courseNameKey("علم الاجتماع"), "N واسمان مختلفان لا يتطابقان");
  check(courseNameKey("  مناهج   البحث  ") === courseNameKey("مناهج البحث"), "N المسافات تُطوى");

  const courses = [
    { id: 1, name: "أصول التربية", side: "old" as const },
    { id: 2, name: "علم النفس التربوي", side: "old" as const },
    { id: 3, name: "مناهج البحث", side: "shared" as const },
    { id: 11, name: "اصول التربيه", side: "new" as const },
    { id: 12, name: "الذكاء الاصطناعي في التعليم", side: "new" as const },
    { id: 13, name: "علم النفس التربوى", side: "new" as const },
  ];
  const d = personCourseDefaults(courses, [{ id: 1, name: "أصول التربية" }, { id: 3, name: "مناهج البحث" }]);
  const mark = (list: Array<{ id: number; mark: string }>, id: number) => list.find(row => row.id === id)?.mark;
  check(d.tabs, "N تبويبان حين في القسم صحيفتان");
  check(mark(d.old, 1) === "taught" && mark(d.old, 3) === "taught" && mark(d.old, 2) === "plain", "N 🕘 «درّسه» في القديمة لما درّسه وحده");
  check(mark(d.fresh, 11) === "match", "N 🔗 «مقابل»: جديدٌ يطابق اسمُه ما درّسه");
  check(mark(d.fresh, 3) === "match", "N والمقررُ في الصحيفتين مقابلُ نفسه");
  check(mark(d.fresh, 12) === "fresh", "N ✨ «جديد»: لا مقابلَ له في القديمة");
  check(mark(d.fresh, 13) === "plain", "N جديدٌ له مقابلٌ قديم لم يدرّسه: لا يُختار ولا يُسمّى «جديد»");
  check(JSON.stringify([...d.selected].sort((a, b) => a - b)) === JSON.stringify([1, 3, 11]), "N المختارُ ابتداءً: ما درّسه ومقابلُه", d.selected);
  const counts = selectionCounts(courses, d.selected);
  check(counts.total === 3 && counts.fresh === 2, "N الملخّص: 3 مقررات · 2 من الجديدة", counts);
  const flat = personCourseDefaults([{ id: 1, name: "أ" }, { id: 2, name: "ب" }], [{ id: 2, name: "ب" }]);
  check(!flat.tabs && !flat.fresh.length && flat.selected.join() === "2", "N قسمٌ بلا صحيفتين: قائمةٌ واحدة");

  /* ── O: حدُّ مقررات البطاقة ── */
  check(offeredCourseSet({}) === null && offeredCourseSet({ offeredCourseIds: null }) === null, "O بلا قائمة = كلُّ المقررات (اليوم كما هو)");
  const set = offeredCourseSet({ offeredCourseIds: [7, 8] });
  check(offeredBreach(set, [{ action: "keep" }, { action: "add", courseId: 7 }], () => undefined) === -1, "O إضافةٌ من القائمة تُقبل، ومواعيدُه القائمة لا تُمسّ");
  check(offeredBreach(set, [{ action: "add", courseId: 7 }, { action: "add", courseId: 9 }], () => undefined) === 1, "O إضافةُ مقررٍ خارجها تُرفض ببندها");
  check(offeredBreach(set, [{ action: "add", offeringId: 55 }], id => (id === 55 ? 9 : undefined)) === 0, "O والشعبةُ الشاغرة لمقررٍ خارجها تُرفض");
  check(offeredBreach(set, [{ action: "add", offeringId: 55 }], () => 9, item => Number(item.offeringId) === 55) === -1, "O وما طلبه قبل القيد يبقى له");
  check(offeredBreach(null, [{ action: "add", courseId: 9 }], () => undefined) === -1, "O وبلا قيدٍ لا رفض");
  const norm = normalizeOfferedCourses({ 5: [3, 3, "4", -1], 6: [], 99: [1], x: "y" }, new Set([5, 6]));
  check(JSON.stringify([...norm]) === JSON.stringify([[5, [3, 4]]]), "O ما يصل يُنقّى: للمختارين وحدهم، بلا تكرار، والفارغةُ بلا قيد", [...norm]);

  /* ── X: المستبعَدون ── */
  const ex = cardExclusions({
    instructors: [{ AdInstructorId: 1 }, { AdInstructorId: 2, AdInstructorCategory: "ta" }, { AdInstructorId: 3 }, { AdInstructorId: 4 }],
    visitingIds: [3],
    requests: [{ AdInstructorId: 4, linkMode: "ta", status: "sent" }, { AdInstructorId: 1, linkMode: "ta", status: "superseded" }],
    taPhaseIds: [],
  });
  check(ex.get(3) === "visiting" && ex.get(2) === "trainee" && ex.get(4) === "trainee" && !ex.has(1), "X المنتدبُ والمتدرّبُ (تصنيفاً أو بطاقةَ 🎓) مستبعَدان، والمستبدَلُ لا يُحسب", [...ex]);

  /* ── M: من يُذكَّر ── */
  const rows = [
    { AdInstructorId: 1, status: "sent", linkMode: "edit", createdAt: "2026-11-01" },
    { AdInstructorId: 2, status: "submitted", submittedAt: "x", linkMode: "edit", createdAt: "2026-11-01" },
    { AdInstructorId: 3, status: "sent", linkMode: "view", createdAt: "2026-11-01" },
    { AdInstructorId: 4, status: "sent", linkMode: "ta", createdAt: "2026-11-01" },
    { AdInstructorId: 5, status: "sent", linkMode: "edit", createdAt: "2026-11-01", linkOpenedAt: "y" },
    { AdInstructorId: 6, status: "sent", linkMode: "edit", createdAt: "2026-11-01" },
    { AdInstructorId: 6, status: "submitted", submittedAt: "z", linkMode: "edit", createdAt: "2026-11-03" },
    { AdInstructorId: 7, status: "sent", linkMode: "edit", createdAt: "2026-11-01" },
  ] as any[];
  const targets = reminderTargets(rows, row => row.AdInstructorId !== 7, new Map([[8, "visiting"]])).map(row => row.AdInstructorId).sort();
  check(JSON.stringify(targets) === JSON.stringify([1, 5]), "M لمن لم يرد في ✏️ وحده (فتح أو لم يفتح)؛ لا 👁️ ولا 🎓، ولا من ردّ في طلبه الأحدث، ولا من أُغلقت نافذتُه", targets);
  check(followUpState(rows[0]) === "sent" && followUpState(rows[4]) === "opened" && followUpState(rows[1]) === "replied", "M ✉️ لم يفتح · 👀 فتح · ✅ ردّ");
}

function staticChecks() {
  const picker = fs.readFileSync("src/components/PublishRecipientPicker.tsx", "utf8");
  const sheet = fs.readFileSync("src/components/PersonCoursesSheet.tsx", "utf8");
  const ta = fs.readFileSync("src/components/TAPhasePanel.tsx", "utf8");
  const publish = fs.readFileSync("src/components/SchedulePublish.tsx", "utf8");
  check(picker.includes("<PersonCoursesSheet") && ta.includes("<PersonCoursesSheet"), "S ورقةُ المقررات واحدةٌ للأستاذ (✏️) والمدرّب (🎓)");
  check(sheet.includes("الصحيفة السابقة") && sheet.includes("🕘") && sheet.includes("🔗") && sheet.includes("✨") && sheet.includes("<CourseTags"), "S تبويبان، ورموز «درّسه/مقابل/جديد»، ووسمُ الصحيفة");
  check(sheet.includes("countOf(") && publish.includes("offeredCourses"), "S الملخّصُ بـcountOf، والإرسالُ يحمل مقرراتِ كل شخص");
  check(publish.includes("ذكّر من لم يرد"), "S زرُّ «ذكّر من لم يرد» بورقة تأكيد");
}

async function http(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { text }; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, text, cookie: set ? set.split(";")[0] : undefined };
}
let child: ChildProcess | null = null;
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
const SCOPE = "collegeId=1&sectionId=1&termId=1";
const BODY = { collegeId: 1, sectionId: 1, termId: 1, source: "draft" };
const ahead = (days: number) => { const d = new Date(Date.now() + days * 86400000); return `${d.toISOString().slice(0, 10)}T22:30`; };
const print = (r: any) => JSON.stringify([r.id, r.linkId, r.linkMode, r.status, r.window?.closesAt, r.linkOpenedAt || "", (r.items || []).length, r.offeredCourseIds ?? null]);

async function liveChecks() {
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 1000)); }
  const login = await http("POST", "/api/auth/demo", {});
  const cookie = login.cookie!;
  await waitForDemoSeed(BASE, cookie);
  await http("POST", "/api/demo/role", { role: "admin" }, cookie);
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);
  const inbox = async () => ((await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows || []) as any[];

  /* ── X: القائمةُ والإصدار ── */
  const visiting: number[] = ((await A("GET", "/api/visiting-lookup?termId=1")).json.scopes?.["1:1"] || []).map(Number);
  const people: any[] = (await A("GET", `/api/instructor-requests/recipients?${SCOPE}`)).json;
  check(visiting.length > 0, "X في الديمو منتدبون في القسم", visiting);
  check(Array.isArray(people) && people.length >= 4 && people.every(p => !visiting.includes(Number(p.AdInstructorId))), "X قائمةُ «أساتذة محددون» بلا منتدبين", people?.map?.((p: any) => p.AdInstructorId));
  const before = await inbox();
  const refused = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(4), mode: "edit", instructorIds: [visiting[0]] });
  check(refused.status === 400 || refused.status === 409, "X إرسالٌ محددٌ لمنتدبٍ يُرفض في الخادم", refused.json);
  check(JSON.stringify((await inbox()).map(print).sort()) === JSON.stringify(before.map(print).sort()), "X ولم يُكتب شيء");
  const viewAll = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(4), mode: "view" });
  const viewIds = new Set<number>((viewAll.json.issued || []).map((r: any) => Number(r.instructorId)));
  check(viewAll.status === 200 && viewIds.size > 0 && visiting.every(id => !viewIds.has(id)), "X «الكل» 👁️ لا يصل منتدباً", { issued: [...viewIds], visiting });
  const afterView = await inbox();
  check(visiting.every(id => JSON.stringify(afterView.filter(r => Number(r.AdInstructorId) === id).map(print)) === JSON.stringify(before.filter(r => Number(r.AdInstructorId) === id).map(print))), "X وطلباتُ المنتدبين كما هي");

  /* أستاذٌ في القسم ومتدرّبٌ معاً: يُصنَّف «TA» فيغيب عن 👁️/✏️ ويبقى في 🎓. */
  const staff: any[] = (await A("GET", "/api/instructors")).json || [];
  const dual = people.map(p => staff.find(s => Number(s.AdInstructorId) === Number(p.AdInstructorId))).find(s => s && s.AdInstructorCivil);
  if (dual) {
    const made = await A("PUT", `/api/instructors/${dual.AdInstructorId}`, { ...dual, AdInstructorCategory: "ta" });
    check(made.status === 200, "X (تهيئة) أستاذٌ صار متدرّباً هذا الفصل", made.json);
    const people2: any[] = (await A("GET", `/api/instructor-requests/recipients?${SCOPE}`)).json;
    check(!people2.some(p => Number(p.AdInstructorId) === Number(dual.AdInstructorId)), "X المتدرّبُ لا يظهر في قائمة 👁️/✏️");
    const toTrainee = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(4), mode: "edit", instructorIds: [Number(dual.AdInstructorId)] });
    check(toTrainee.status === 400 || toTrainee.status === 409, "X ولا يُصدَر له ✏️ ولو طُلب صراحةً", toTrainee.json);
    const phase = (await A("GET", `/api/ta-phase?${SCOPE}`)).json;
    check((phase.tas || []).some((t: any) => Number(t.id) === Number(dual.AdInstructorId)), "X ويظهر في 🎓 مرحلة التدريب وحدها");
  } else check(false, "X (تهيئة) لم يوجد أستاذٌ برقمٍ مدني لتجربة «أستاذ ومتدرّب»");

  /* ── O: مقرراتُ كل شخص ── */
  const people3: any[] = (await A("GET", `/api/instructor-requests/recipients?${SCOPE}`)).json;
  const defaults = (await A("GET", `/api/instructor-requests/course-defaults?${SCOPE}`)).json;
  check(Array.isArray(defaults.courses) && defaults.courses.length > 3 && defaults.taught && typeof defaults.taught === "object", "O مقرراتُ القسم وتاريخُ كل أستاذ تُقرأ للورقة", Object.keys(defaults || {}));
  const fresh = await inbox();
  const held = new Set(fresh.filter(r => r.linkMode !== "view").map(r => Number(r.AdInstructorId)));
  const pickA = people3.find(p => !held.has(Number(p.AdInstructorId))) || people3[0];
  const pickB = people3.find(p => p !== pickA)!;
  const allowed = defaults.courses.slice(0, 2).map((c: any) => Number(c.id));
  const outside = Number(defaults.courses.find((c: any) => !allowed.includes(Number(c.id)))?.id);
  const sent = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(5), mode: "edit",
    instructorIds: [Number(pickA.AdInstructorId), Number(pickB.AdInstructorId)], offeredCourses: { [pickA.AdInstructorId]: allowed } });
  check(sent.status === 200, "O الإرسالُ بمقرراتٍ خاصة يُقبل", sent.json);
  const rows = await inbox();
  const reqA = rows.filter(r => Number(r.AdInstructorId) === Number(pickA.AdInstructorId) && r.status !== "superseded").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const reqB = rows.filter(r => Number(r.AdInstructorId) === Number(pickB.AdInstructorId) && r.status !== "superseded").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  check(JSON.stringify(reqA?.offeredCourseIds) === JSON.stringify(allowed), "O مقرراتُه تُحفظ مع بطاقته", reqA?.offeredCourseIds);
  check(reqB && (reqB.offeredCourseIds == null), "O ومن لم يُختر له شيء: كلُّ المقررات كاليوم", reqB?.offeredCourseIds);
  const card = await http("GET", `/api/public/request/${reqA.linkId}`);
  check(card.status === 200 && (card.json.courses || []).every((c: any) => allowed.includes(Number(c.id))) && (card.json.availableOfferings || []).every((o: any) => allowed.includes(Number(o.courseId))),
    "O بطاقتُه لا تعرض إلا مقرراته", { courses: (card.json.courses || []).map((c: any) => c.id), offerings: (card.json.availableOfferings || []).map((o: any) => o.courseId) });
  const cardB = await http("GET", `/api/public/request/${reqB.linkId}`);
  check(cardB.status === 200 && (cardB.json.courses || []).length > allowed.length, "O وبطاقةُ زميله بكل المقررات", (cardB.json.courses || []).length);
  if (outside) {
    const opt = (cardB.json.courses || []).find((c: any) => Number(c.id) === outside) || { collegeId: 1, sectionId: 1 };
    const breach = await http("POST", `/api/public/request/${reqA.linkId}`, { requestRevision: reqA.requestRevision ?? 0,
      items: [...(reqA.items || []).map((it: any) => ({ rowId: it.rowId, action: "keep" })), { action: "add", courseId: outside, collegeId: opt.collegeId, sectionId: opt.sectionId, days: ["fsunday"], start: "08:00" }] });
    check(breach.status === 400 && /مقرر/.test(String(breach.json.error || "")) && /بطاقتك/.test(String(breach.json.error || "")), "O طلبُ مقررٍ خارج قائمته يُرفض في الخادم ولو أُرسل من خارج الواجهة", breach);
  }

  /* ── P: المعاينة ── */
  const beforePreview = await inbox();
  const logBefore = JSON.stringify((await A("GET", `/api/instructor-requests/send-log?${SCOPE}`)).json);
  const shareBefore = JSON.stringify(((await A("GET", `/api/share?${SCOPE}`)).json || []).map((l: any) => [l.id, l.views || 0, l.revoked || false]));
  const someone = people3.find(p => !rows.some(r => Number(r.AdInstructorId) === Number(p.AdInstructorId))) || pickA;
  const preview = await A("GET", `/api/instructor-requests/preview?${SCOPE}&instructorId=${someone.AdInstructorId}&mode=edit&courseIds=${allowed.join(",")}`);
  check(preview.status === 200 && preview.json.preview === true && Array.isArray(preview.json.request?.items), "P المعاينةُ تُرجع بطاقتَه كما يراها", preview.json.error || Object.keys(preview.json));
  check((preview.json.courses || []).every((c: any) => allowed.includes(Number(c.id))), "P بمقرراته المختارة");
  check(!JSON.stringify(preview.json).includes("AdInstructorCivil"), "P ولا رقمٌ مدني");
  const pageHtml = await A("GET", `/api/instructor-requests/preview-page?${SCOPE}&instructorId=${someone.AdInstructorId}&mode=edit`);
  check(pageHtml.status === 200 && pageHtml.text.includes("معاينة") && pageHtml.text.includes("/api/instructor-requests/preview?"), "P صفحةُ البطاقة نفسها في وضع المعاينة");
  check(JSON.stringify((await inbox()).map(print).sort()) === JSON.stringify(beforePreview.map(print).sort()), "P لم يُصدَر شيء ولم يُسجَّل فتحٌ");
  check(JSON.stringify((await A("GET", `/api/instructor-requests/send-log?${SCOPE}`)).json) === logBefore, "P ولا سطرَ في سجل الإرسال");
  check(JSON.stringify(((await A("GET", `/api/share?${SCOPE}`)).json || []).map((l: any) => [l.id, l.views || 0, l.revoked || false])) === shareBefore, "P ولا رابطَ جديداً ولا فتحة");
  check((await http("GET", `/api/instructor-requests/preview?${SCOPE}&instructorId=${someone.AdInstructorId}`)).status >= 401, "P المعاينةُ لا تُقرأ بلا جلسة");
  check((await A("GET", `/api/instructor-requests/preview?${SCOPE}&instructorId=${visiting[0]}`)).status >= 400, "P ولا تُعاين بطاقةُ منتدب");

  /* ── F/M: المتابعة والتذكير ── */
  const follow = await A("GET", `/api/instructor-requests/follow-up?${SCOPE}`);
  const states = new Map<number, string>((follow.json.people || []).map((p: any) => [Number(p.instructorId), String(p.state)]));
  const expectState = (row: any) => (row.submittedAt || !["sent", "superseded"].includes(row.status) ? "replied" : row.linkOpenedAt ? "opened" : "sent");
  const latestA = (await inbox()).filter(r => Number(r.AdInstructorId) === Number(pickA.AdInstructorId) && r.status !== "superseded").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  check(follow.status === 200 && latestA && states.get(Number(pickA.AdInstructorId)) === expectState(latestA) && expectState(latestA) !== "sent", "F من فتح بطاقتَه: 👀 (أو ✅ إن ردّ)", { states: [...states], expected: latestA && expectState(latestA) });
  check([...states.keys()].every(id => !visiting.includes(id)), "F ولا منتدبَ في المتابعة");
  check([...states.values()].every(state => ["sent", "opened", "replied"].includes(state)) && [...states.values()].includes("sent"), "F ✉️ لمن لم يفتح بعد");
  const now = await inbox();
  const skip = new Map<number, string>([...visiting.map(id => [id, "visiting"] as [number, string]), ...(dual ? [[Number(dual.AdInstructorId), "trainee"] as [number, string]] : [])]);
  const awaiting = reminderTargets(now as any, (row: any) => Date.parse(row.window?.closesAt || "") > Date.now(), skip).map(r => Number(r.AdInstructorId)).sort();
  check(JSON.stringify([...(follow.json.awaiting || [])].map(Number).sort()) === JSON.stringify(awaiting), "M قائمةُ من لم يرد قبل التأكيد هي حكمُ الخادم", { server: follow.json.awaiting, expected: awaiting });
  const replied = now.filter(r => r.submittedAt).map(r => Number(r.AdInstructorId));
  const remind = await A("POST", "/api/instructor-requests/remind", { ...BODY });
  const reminded = (remind.json.reminded || []).map((r: any) => Number(r.instructorId)).sort();
  check(remind.status === 200 && JSON.stringify(reminded) === JSON.stringify(awaiting), "M التذكيرُ يقع على من لم يرد وحدهم", { reminded, awaiting });
  check(reminded.every((id: number) => !replied.includes(id) && !visiting.includes(id)), "M لا من ردّ ولا منتدب");
  check(remind.json.delivery === "demo", "M في الديمو: تسليمٌ وهميّ، لا رسالةَ حقيقية", remind.json.delivery);
  const afterRemind = await inbox();
  check(afterRemind.filter(r => reminded.includes(Number(r.AdInstructorId))).some(r => (r.remindedAt || []).length), "M ويُعلَّم وقتُ التذكير على طلباتهم");
  check(afterRemind.filter(r => !reminded.includes(Number(r.AdInstructorId))).every(r => !(r.remindedAt || []).length), "M وغيرُهم بلا تذكير");
  check((await http("POST", "/api/instructor-requests/remind", { ...BODY })).status >= 401, "M والتذكيرُ لا يقع بلا جلسة");
}

async function main() {
  pureChecks();
  if (process.argv.includes("--pure")) return;
  staticChecks();
  await liveChecks();
}

main().catch(error => { failed++; console.error(error); }).finally(() => {
  stop();
  console.log(`\nPublish cards per person audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
