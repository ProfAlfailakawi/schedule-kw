/**
 * ── «مساري»: تلميحُ التنقّل بين الحرمين (هادئٌ لا يمنع) ─────────────────────────
 *
 *   T1 القاعدة: حرمٌ واحد = لا تلميح؛ حرمان وفاصلٌ كافٍ = لا؛ فاصلٌ أقصر = تلميحٌ بمدة السياسة (٣٠ ثم ٦٠)؛
 *      يومان مختلفان = لا؛ متداخلان = خارج النطاق؛ تلميحٌ واحدٌ لكل زوج؛ اثنان لكل يومٍ في الأكثر.
 *   T2 مصدرٌ واحد: نصُّ الصفحة يعطي النتيجةَ نفسَها (vm)، وفحصُ الأساتذة يستعمل دالّة الفارق نفسها.
 *   T3 الحمولة: التذكرةُ تحمل مفتاحَ الحرم ودقائقَ الأزواج فقط، ولا أستاذَ ولا قاعةً ولا مستثنَين.
 *   T4 السياسة: الغائبةُ = الأصل (٣٠/٣٠/٦٠)، والمخزَّنةُ تُقرأ (٦٠)، والصفرُ يوقف الزوج.
 *   T5 الصفحة: لا حجبَ ولا نافذةَ ولا لافتة؛ نصٌّ يقرؤه قارئُ الشاشة؛ لا شيء حين لا ينطبق.
 */
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import express from "express";
import { createHmac, createHash } from "crypto";
import type { AddressInfo } from "net";
import { shortTravelGap, travelHints, TRAVEL_HINT_SCRIPT } from "../src/utils/campusTravelHint";
import { cleanTravelPolicy, defaultTravelPolicy, travelShortfalls } from "../src/utils/campusTravelPolicy";
import { campusOf } from "../src/utils/campusTravel";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const clock = (h: number, m = 0) => h * 60 + m;

/* ── T1 ── */
{
  const policy = (n: number) => ({ "fahaheel|jahra": n, "jahra|main": n, "fahaheel|main": n });
  const slot = (id: string, day: number, start: number, end: number, c?: string) => ({ id, day, start, end, ...(c ? { c } : {}) });
  const run = (n: number, slots: any[]) => travelHints(policy(n), slots);
  check(run(60, [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(9, 10), clock(10))]).length === 0, "T1 حرمٌ واحد (الرئيسي): لا تلميح");
  check(run(60, [slot("a", 0, clock(8), clock(9), "jahra"), slot("b", 0, clock(9, 10), clock(10), "jahra")]).length === 0, "T1 الجهراء مع الجهراء: لا تلميح");
  check(run(30, [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(9, 30), clock(10, 30), "jahra")]).length === 0, "T1 حرمان والفاصلُ يساوي المدة (٣٠): كافٍ، لا تلميح");
  check(run(30, [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(11), clock(12), "jahra")]).length === 0, "T1 فاصلٌ كافٍ بكثير: لا تلميح");
  const h30 = run(30, [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(9, 20), clock(10, 20), "jahra")]);
  check(h30.length === 1 && h30[0].id === "b" && h30[0].need === 30 && h30[0].gap === 20, "T1 فاصلٌ أقصر: تلميحٌ على الموعد اللاحق بمدة ٣٠", h30);
  const h60 = run(60, [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(9, 30), clock(10, 30), "fahaheel")]);
  check(h60.length === 1 && h60[0].need === 60, "T1 والمدةُ ٦٠ تجعل فاصل ٣٠ ضيّقاً", h60);
  check(run(60, [slot("a", 0, clock(8), clock(9)), slot("b", 1, clock(9, 10), clock(10), "jahra")]).length === 0, "T1 يومان مختلفان: لا تلميح");
  check(run(60, [slot("a", 0, clock(8), clock(9, 30)), slot("b", 0, clock(9), clock(10), "jahra")]).length === 0, "T1 تداخلٌ: خارج النطاق (للتعارض حكمُه)");
  check(run(60, [slot("a", 0, clock(8), clock(9), "fahaheel"), slot("b", 0, clock(9, 5), clock(10), "jahra")])[0]?.need === 60, "T1 الجهراء ↔ الفحيحيل بمفتاحها");
  check(run(0, [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(9), clock(10), "jahra")]).length === 0, "T1 مدةٌ صفر توقف الزوج");
  const order = run(60, [slot("b", 0, clock(9, 10), clock(10), "jahra"), slot("a", 0, clock(8), clock(9))]);
  check(order.length === 1 && order[0].id === "b", "T1 ترتيبُ الإدخال لا يهمّ");
  const three = run(60, [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(9, 10), clock(10), "jahra"), slot("c", 0, clock(10, 10), clock(11)), slot("d", 0, clock(11, 10), clock(12), "fahaheel")]);
  check(three.length === 2, "T1 اثنان لكل يومٍ في الأكثر", three);
  const four = travelHints(policy(60), [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(9, 10), clock(10), "jahra"), slot("c", 0, clock(10, 10), clock(11)),
    slot("d", 0, clock(11, 10), clock(12), "jahra"), slot("e", 0, clock(12, 10), clock(13))]);
  check(four.length === 2 && four.map(x => x.id).join() === "b,c", "T1 والباقي صامت (الأولان بالترتيب الزمني)", four);
  const twoDays = run(60, [slot("a", 0, clock(8), clock(9)), slot("b", 0, clock(9, 10), clock(10), "jahra"), slot("c", 2, clock(8), clock(9)), slot("d", 2, clock(9, 10), clock(10), "jahra")]);
  check(twoDays.length === 2 && twoDays[0].day === 0 && twoDays[1].day === 2, "T1 الحدُّ لكل يوم لا للأسبوع");
  check(shortTravelGap(60, 480, 540, 570, 630) === 30, "T1 دالّة الفارق: ٣٠ دقيقة أقصر من ٦٠");
  check(shortTravelGap(30, 480, 540, 570, 630) === -1 && shortTravelGap(60, 480, 570, 540, 600) === -1, "T1 دالّة الفارق: كافٍ أو متداخل = -١");
}

/* ── T2 ── */
{
  const sandbox: any = {};
  vm.createContext(sandbox);
  vm.runInContext(TRAVEL_HINT_SCRIPT, sandbox);
  check(typeof sandbox.travelHints === "function" && typeof sandbox.shortTravelGap === "function", "T2 النصُّ المُسلَّم للصفحة يعرّف الدالتين");
  let same = true, seeded = 7;
  const rnd = (n: number) => { seeded = (seeded * 1103515245 + 12345) % 2147483648; return seeded % n; };
  for (let round = 0; round < 300 && same; round++) {
    const slots = Array.from({ length: 2 + rnd(6) }, (_, i) => { const start = 480 + rnd(8) * 30; return { id: "s" + i, day: rnd(3), start, end: start + 30 + rnd(3) * 30, c: ["main", "jahra", "fahaheel", undefined][rnd(4)] }; });
    const rules = { "fahaheel|jahra": 60, "jahra|main": rnd(2) * 30, "fahaheel|main": 30 };
    same = JSON.stringify(sandbox.travelHints(rules, slots)) === JSON.stringify(travelHints(rules, slots));
  }
  check(same, "T2 الدالّة في الصفحة (vm) = دالّة الخادم على ٣٠٠ حالة عشوائية");
  const policy = cleanTravelPolicy({ pairs: { "jahra|main": { minutes: 60 } } });
  const rows = [{ fsunday: true, fstarttime: "8:00", fendtime: "9:00", AdCollegeId: 1 }];
  const found = travelShortfalls(policy, 5, id => (id === 2 ? "jahra" : "main"), { collegeId: 2, slots: [{ day: "fsunday", start: "9:30", end: "10:30" }] }, rows);
  check(found.length === 1 && found[0].need === 60 && found[0].gap === 30, "T2 فحصُ الأساتذة يعطي الفارقَ نفسه من الدالّة نفسها", found);
}

/* ── البيئة: مستودعٌ مؤقّت وتذكرةٌ فيها زوجا حرمين ── */
const W = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const civil = (() => {
  for (let n = 1; ; n += 1) {
    const body = "3050612" + String(n).padStart(4, "0");
    const sum = body.split("").reduce((s, d, i) => s + Number(d) * W[i], 0);
    const c = 11 - (sum % 11);
    if (c <= 9) return body.slice(0, 11) + c;
  }
})();
const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const ROOM = "ROOM-SECRET-77", HALL = "HALL-SECRET-88", INSTRUCTOR = 424242;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "masari-travel-"));
const days = (d: number) => ({ fsunday: d === 0, fmonday: d === 1, ftuesday: d === 2, fwednesday: d === 3, fthursday: d === 4 });
let rowId = 1;
const schedule = (collegeId: number, sectionId: number, courseId: number, d: number, start: string, end: string, building?: string) => ({
  id: rowId++, AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: 1, AdCourseId: courseId, AdCourseName: "م" + courseId, SCode: "01", AdInstructorId: INSTRUCTOR,
  ...days(d), fstarttime: start, fendtime: end, AdRoomCode: ROOM, AdRoomHall: HALL, ...(building ? { buildingId: building } : {}),
});
/* الأحد: رئيسي ٨–٩:٣٠ ثم الجهراء ١٠–١١ (فاصل ٣٠). الاثنين: فاصل ٩٠. الثلاثاء: حرمٌ واحد. الأربعاء: تداخل. */
const schedules = [
  schedule(1, 11, 101, 0, "8:00", "9:30", "b-main"), schedule(2, 21, 201, 0, "10:00", "11:00", "b-jahra"),
  schedule(1, 11, 102, 1, "8:00", "9:00"), schedule(2, 21, 202, 1, "10:30", "11:30"),
  schedule(1, 11, 103, 2, "8:00", "9:00"), schedule(1, 11, 104, 2, "9:10", "10:00"),
  schedule(1, 11, 105, 3, "8:00", "9:30"), schedule(2, 21, 205, 3, "9:00", "10:00"),
];
const offeringKey = (collegeId: number, sectionId: number, courseId: number) => `1|${collegeId}|${sectionId}|${courseId}|01`;
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  users: [], formNames: [], formSecurity: [], collegeUserAssign: [],
  terms: [{ AdTermId: 1, AdTermName: "فصل الاختبار", AdTermStart: "2026-09-13", AdTermWeeks: 14, AdTermClosed: false,
    AdTermStudentPhases: { wishesOpen: add(today, -3), wishesClose: add(today, 10), rounds: [{ id: "r1", name: "مبكر", start: add(today, 16), end: add(today, 22) }], requestsClose: add(today, 60) } }],
  colleges: [{ AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية التربية" }, { AdCollegeId: 2, AdCollegeCode: "JHR", AdCollegeName: "كلية التربية - الجهراء" }],
  sections: [{ AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: "قسم" }, { AdSectionId: 21, AdCollegeId: 2, AdSectionCode: "JHR", AdSectionName: "قسم الجهراء" }],
  instructors: [{ AdInstructorId: INSTRUCTOR, AdInstructorName: "د", AdInstructorCivil: "", AdInstructorMobile: "" }],
  courses: [{ AdCourseId: 101, AdCollegeId: 1, AdSectionId: 11, CourseCode: "ISL101", CourseName: "أصول", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 }],
  curriculumPlans: [{ id: "p11", AdCollegeId: 1, AdSectionId: 11, name: "الجديدة", status: "active", createdAt: "2026-02-01" }],
  curriculumPlanCourses: [{ id: "l101", planId: "p11", AdCollegeId: 1, AdSectionId: 11, AdCourseId: 101, createdAt: "2026-01-01" }],
  courseTransitions: [], schedules, rooms: [], studentNeeds: [], studentProfiles: [],
}), { mode: 0o600 });
process.env.STUDENT_DOOR_WRITES_PER_MINUTE = "100000"; process.env.STUDENT_DOOR_IDENTITY_MAX = "100000";
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
const { registerStudentDoorRoutes } = await import("../src/server/studentDoorRoutes");
const { resetTicketContext } = await import("../src/server/simulationData");
const { saveTravelPolicy } = await import("../src/server/core/travelPolicy");
await initDatabase();
console.warn = quiet;

const identityKey = createHmac("sha256", "test-secret").update("identity").digest();
const app = express();
app.use(express.json());
registerStudentDoorRoutes(app, {
  surveyFingerprint: async civilId => createHash("sha256").update("fp|" + civilId).digest("hex").slice(0, 32),
  sealIdentity: async value => "sealed:" + Buffer.from(value).toString("base64url"),
  openIdentity: async cipher => Buffer.from(cipher.replace("sealed:", ""), "base64url").toString(),
  identityKey: async () => identityKey,
  isProduction: () => false,
});
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
async function http(method: string, url: string, opts: { body?: unknown; cookie?: string } = {}) {
  const res = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = (res.headers as any).getSetCookie ? (res.headers as any).getSetCookie() as string[] : [];
  return { status: res.status, json, text, cookie: (set[0] || "").split(";")[0] };
}

try {
  const made = await http("POST", "/api/public/me/enter", { body: { civil, code: "135790", create: true, agree: true, name: "طالب تجريبي اختباري" } });
  const cookie = made.cookie;
  await http("PUT", "/api/public/me/profile", { cookie, body: { sectionId: 11, curriculumPlanId: "p11", passedCourseIds: [] } });
  const fp = createHash("sha256").update("fp|" + civil).digest("hex").slice(0, 32);
  const courses: Array<[number, number, number]> = [[1, 11, 101], [2, 21, 201], [1, 11, 102], [2, 21, 202], [1, 11, 103], [1, 11, 104], [1, 11, 105], [2, 21, 205]];
  const items = courses.map(([c, s, id]) => ({ courseId: id, offeringId: offeringKey(c, s, id), tight: false }));
  await Repository.saveRegistrationRun({ id: "1", termId: 1, runId: "run-1", ranAt: new Date(Date.now() + 60_000).toISOString(), ranBy: "x", students: 1, withoutRules: 0, defaulted: 0, rounds: 1, windows: [1], courses: [] } as any,
    [{ id: `1_${fp}`, termId: 1, runId: "run-1", fp, planId: "p11", window: 1, remainingUnits: 24, defaulted: false, plans: [{ label: "A", units: 24, items }], unmet: [] } as any]);
  await Repository.saveScheduleApproval({ id: "ap1", scopeKey: "1:11:1", AdCollegeId: 1, AdSectionId: 11, AdTermId: 1, status: "head", signatures: [], rounds: [], currentRound: 1, pendingAdditions: [] } as any);
  await Repository.saveScheduleApproval({ id: "ap2", scopeKey: "2:21:1", AdCollegeId: 2, AdSectionId: 21, AdTermId: 1, status: "head", signatures: [], rounds: [], currentRound: 1, pendingAdditions: [] } as any);
  resetTicketContext();

  /* T4 الغائبة = الأصل */
  const ticket = async () => (await http("GET", "/api/public/me/ticket", { cookie })).json;
  let t = await ticket();
  check(t.ready === true, "T3 التذكرةُ تُقرأ", t);
  check(JSON.stringify(t.travel) === JSON.stringify({ "fahaheel|jahra": 60, "jahra|main": 30, "fahaheel|main": 30 }), "T4 سياسةٌ غائبة: الأصل ٣٠/٣٠/٦٠", t.travel);

  const planItems: any[] = t.plans[0].items;
  const slotsOf = (id: number) => planItems.find(i => i.courseId === id).slots;
  const flat = (travel: Record<string, number>) => travelHints(travel, planItems.flatMap(i => i.slots.map((s: any) => ({ id: String(i.courseId), day: s.day, start: s.start, end: s.end, c: s.c }))));

  /* T3 الحمولة */
  check(slotsOf(201).every((s: any) => s.c === "jahra") && slotsOf(101).every((s: any) => !("c" in s)), "T3 الجهراء تحمل مفتاحَها والرئيسيُّ لا يحمل شيئاً");
  const allowed = new Set(["day", "start", "end", "b", "c"]);
  check(planItems.every(i => i.slots.every((s: any) => Object.keys(s).every(k => allowed.has(k)))), "T3 حقولُ الموعد: يوم/بداية/نهاية/مبنى/حرم فقط");
  check(!JSON.stringify(t).includes(ROOM) && !JSON.stringify(t).includes(HALL) && !JSON.stringify(t).includes(String(INSTRUCTOR)) && !/exempt|Instructor|instructor/.test(JSON.stringify(t)), "T3 لا قاعةَ ولا أستاذَ ولا مستثنَين في الحمولة");
  check(Object.keys(t.travel).every(k => typeof t.travel[k] === "number"), "T3 دقائقُ الأزواج أرقامٌ فقط");

  /* أحد: فاصل ٣٠ → عند السياسة الأصلية (٣٠) لا تلميح (الفاصل يساوي المدة)، وعند ٦٠ تلميحٌ واحد على اللاحق */
  check(flat(t.travel).length === 0, "T4 الأصل (٣٠): فاصل ٣٠ كافٍ، فلا شيء على الشاشة", flat(t.travel));
  await saveTravelPolicy(cleanTravelPolicy({ pairs: { "fahaheel|jahra": { minutes: 60 }, "jahra|main": { minutes: 60 }, "fahaheel|main": { minutes: 60 } }, exemptInstructorIds: [INSTRUCTOR] }));
  t = await ticket();
  check(Object.values(t.travel).join() === "60,60,60", "T4 السياسةُ المخزَّنة (٦٠) هي التي تُقرأ", t.travel);
  check(!JSON.stringify(t).includes(String(INSTRUCTOR)), "T3 والمستثنَون لا يصلون الطالب");
  const hints = flat(t.travel);
  check(hints.length === 1 && hints[0].id === "201" && hints[0].day === 0 && hints[0].need === 60 && hints[0].gap === 30, "T1 مع ٦٠: تلميحٌ واحدٌ فقط، على مقرر الجهراء يوم الأحد", hints);
  check(!hints.some(h => ["102", "202", "103", "104", "105", "205"].includes(h.id)), "T1 الاثنين (فاصل ٩٠) والثلاثاء (حرمٌ واحد) والأربعاء (تداخل): لا شيء");
  await saveTravelPolicy(cleanTravelPolicy({ pairs: { "jahra|main": { minutes: 0 } } }));
  t = await ticket();
  check(!("jahra|main" in t.travel) && flat(t.travel).length === 0, "T4 صفرٌ في السياسة يوقف الزوج فلا يصل ولا يُلمَّح", t.travel);
  await saveTravelPolicy(cleanTravelPolicy({ pairs: { "jahra|main": { minutes: 45 } } }));
  check(flat((await ticket()).travel)[0]?.need === 45, "T4 مدةٌ مخصّصة (٤٥) تُقرأ كما هي");
} finally { server.close(); }

/* ── T5 الصفحة ── */
{
  const page = read("src/server/studentHomePage.ts");
  const helper = page.slice(page.indexOf("function tkTravel("), page.indexOf("function tkClock("));
  check(/TRAVEL_HINT_SCRIPT/.test(page) && /travelHints\(t\.travel,/.test(helper), "T5 الصفحة تستعمل الدالّة المشتركة وتقرأ المدةَ من التذكرة لا من رقمٍ مكتوب");
  check(!/\b(30|60)\b/.test(helper.replace(/\.\.\./g, "")), "T5 لا ٣٠ ولا ٦٠ مكتوبةً في الصفحة", helper);
  check(!/toast\(|sheet\(|confirm\(|alert\(|S\.tkErr|S\.tkSel\s*=|tkSet\(/.test(helper), "T5 التلميحُ لا يحجب ولا يفتح نافذة ولا يغيّر اختياراً");
  check(/AR\.minute/.test(helper) && /countOf\(/.test(helper), "T5 المدةُ بصيغة العدّ المعتمدة في المشروع");
  check(/class="wk-tr" title="[^"]*"[^>]*>'\+ic\("swap",""\)\+'<\/i><em class="sr">/.test(page), "T5 على كتلة الأسبوع أيقونةٌ صغيرة ونصٌّ لقارئ الشاشة معاً (ليس لوناً فقط)");
  check(/\.wk-tr\{position:absolute;/.test(page), "T5 أيقونةُ الكتلة مطلقةُ الموضع: لا تُزيح التخطيط");
  check(/class="tk-tr"/.test(page.slice(page.indexOf("var travL="), page.indexOf("var removed="))), "T5 وفي القائمة سطرٌ واحد تحت الموعد");
  check(!/travel/i.test(page.slice(page.indexOf("function tkShareImage"))), "T5 لا شيء في صورة المشاركة (تصميمٌ ثابت)");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
