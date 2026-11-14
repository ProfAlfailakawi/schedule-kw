/**
 * ── مساري: الكتالوج يتبع كلية الطالب (كلُّ كليات الجامعة تعمل) ─────────────────
 *
 *   C1 قائمةُ الكليات والأقسام النقية: مبنيةٌ من البيانات، بلا دمجٍ بين كليتين أو موقعين.
 *   C2 مساراتُ الخادم (في الذاكرة ببياناتٍ مزروعة لكلياتٍ مختلفة): ملفٌّ جديد ← قسم ← صحيفة ← رغبات ← مطروح ← خريطة،
 *      وطالبان من كليتين لا يريان أقسامَ بعضهما ولا أعدادَ بعضهما.
 *   C3 إصلاحاتٌ صغيرة: الرغباتُ تُحدّث آخرَ تعديل، وأعدادُ الزملاء لا تُرسل في القسم الصغير.
 *   C4 الصفحة (في vm): اختيارُ الكلية ثم القسم، وإعادةُ اختيار الصحيفة نفسها تُبقي المنجَز، والخروجُ الفاشل يُبقي الطالب داخلاً.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import { runInNewContext } from "vm";
import { createHash, createHmac } from "crypto";
import type { AddressInfo } from "net";
import { doorColleges, doorSpecializations } from "../src/utils/studentCatalog";
import { STUDENT_HOME_SCRIPT } from "../src/server/studentHomePage";
import { AR, countOf } from "../src/utils/arabicCount";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

/* ── C1 ──────────────────────────────────────────────────────────────────── */
{
  const colleges = [
    { AdCollegeId: 1, AdCollegeName: "كلية التربية الأساسية - بنين" }, { AdCollegeId: 2, AdCollegeName: "كلية التربية الأساسية - بنات" },
    { AdCollegeId: 3, AdCollegeName: "كلية التربية الأساسية - بنات - الجهراء" }, { AdCollegeId: 4, AdCollegeName: "كلية العلوم الصحية - بنين" },
    { AdCollegeId: 5, AdCollegeName: "كلية الحقوق" }, { AdCollegeId: 6, AdCollegeName: "كلية بلا أقسام" },
  ];
  const sections = [
    { AdSectionId: 11, AdCollegeId: 1, AdSectionName: "قسم علم النفس", AdSectionCode: "PSY" }, { AdSectionId: 21, AdCollegeId: 2, AdSectionName: "قسم علم النفس", AdSectionCode: "PSY" },
    { AdSectionId: 31, AdCollegeId: 3, AdSectionName: "قسم علم النفس", AdSectionCode: "PSY" }, { AdSectionId: 41, AdCollegeId: 4, AdSectionName: "قسم التمريض", AdSectionCode: "NUR" },
    { AdSectionId: 51, AdCollegeId: 5, AdSectionName: "قسم القانون الخاص", AdSectionCode: "PRV" }, { AdSectionId: 52, AdCollegeId: 5, AdSectionName: "قسم القانون الخاص", AdSectionCode: "PRV2" },
    { AdSectionId: 53, AdCollegeId: 5, AdSectionName: "قسم القانون العام", AdSectionCode: "PUB" },
  ];
  const all = doorColleges(colleges, sections);
  check(all.length === 5 && !all.some(c => c.id === 6), "C1 كلُّ كليةٍ لها أقسام تظهر، وما لا أقسامَ لها لا تظهر", all.map(c => c.id));
  check(all.find(c => c.id === 5)?.track === "" && all.find(c => c.id === 4)?.track === "boys" && all.find(c => c.id === 3)?.track === "girls", "C1 المسارُ يُشتقّ من بيانات الكلية، والكليةُ بلا انقسام بلا مسار");
  check(doorColleges(colleges, sections, "boys").map(c => c.id).sort().join() === "1,4,5" && doorColleges(colleges, sections, "girls").map(c => c.id).sort().join() === "2,3,5", "C1 المسارُ يُضيّق ويُبقي الكليةَ التي لا تنقسم");
  const psy = [1, 2, 3].map(id => doorSpecializations(id, sections));
  check(psy.every(list => list.length === 1) && new Set(psy.map(list => list[0].id)).size === 3, "C1 قسمٌ بالاسم نفسه في ثلاث كلياتٍ/مواقع: ثلاثةُ معرّفات لا دمج", psy);
  const law = doorSpecializations(5, sections);
  check(law.length === 3 && new Set(law.map(item => item.name)).size === 3 && law.some(item => item.id === 51 && item.name.includes("PRV")) && law.some(item => item.id === 53 && item.name === "قسم القانون العام"), "C1 اسمٌ مكرَّر داخل الكلية يُميَّز برمز القسم ولا يُحذف أحدهما", law);
  check(doorSpecializations(4, sections).every(item => item.id === 41), "C1 أقسامُ كليةٍ لا تتسرّب إليها أقسامُ غيرها");
}

/* ── C2/C3 ───────────────────────────────────────────────────────────────── */
const DAY = 86_400_000;
const W = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const civil = (seed: number) => {
  for (let n = seed; ; n += 1) {
    const body = "3050612" + String(n).padStart(4, "0");
    const sum = body.split("").reduce((s, d, i) => s + Number(d) * W[i], 0);
    const c = 11 - (sum % 11);
    if (c <= 9) return body.slice(0, 11) + c;
  }
};
const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const courses: any[] = [], planCourses: any[] = [], schedules: any[] = [];
let cid = 100, row = 1;
const defs: Array<[string, number, number, string[]]> = [
  ["NUR", 41, 4, ["أساسيات التمريض", "علم التشريح", "التمريض الباطني", "صحة المجتمع"]],
  ["LAW", 51, 5, ["مدخل القانون", "العقود", "الالتزامات", "الملكية"]],
  ["ISL", 11, 1, ["فقه العبادات", "علوم القرآن", "السيرة النبوية"]],
];
const idsOf: Record<number, number[]> = {};
for (const [code, sid, college, list] of defs) list.forEach((name, i) => {
  cid += 1; (idsOf[sid] ||= []).push(cid);
  courses.push({ AdCourseId: cid, AdCollegeId: college, AdSectionId: sid, CourseCode: `${code}${100 + i}`, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
  planCourses.push({ id: `a${cid}`, planId: `p-${sid}-new`, AdCollegeId: college, AdSectionId: sid, AdCourseId: cid, createdAt: "2026-01-01" });
  if (i % 2 === 0) for (const s of ["501", "502"]) schedules.push({ id: row++, AdCollegeId: college, AdSectionId: sid, AdTermId: 1, AdCourseId: cid, AdCourseName: name, SCode: s, AdInstructorId: 1, fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "A", AdRoomHall: "1" });
});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "student-colleges-"));
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  users: [], formNames: [], formSecurity: [], collegeUserAssign: [],
  terms: [{ AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 14, AdTermClosed: false, AdTermSubmissionDeadline: add(today, -8),
    AdTermStudentPhases: { wishesOpen: add(today, -3), wishesClose: add(today, 10), rounds: [{ id: "r1", name: "مبكر", start: add(today, 16), end: add(today, 22) }], requestsClose: add(today, 60) } }],
  colleges: [
    { AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية التربية الأساسية - بنين" }, { AdCollegeId: 4, AdCollegeCode: "HS", AdCollegeName: "كلية العلوم الصحية - بنين" },
    { AdCollegeId: 5, AdCollegeCode: "LAW", AdCollegeName: "كلية الحقوق" }, { AdCollegeId: 6, AdCollegeCode: "EMPTY", AdCollegeName: "كلية بلا أقسام" },
  ],
  sections: [
    { AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: "قسم التربية الإسلامية" }, { AdSectionId: 41, AdCollegeId: 4, AdSectionCode: "NUR", AdSectionName: "قسم التمريض" },
    { AdSectionId: 51, AdCollegeId: 5, AdSectionCode: "PRV", AdSectionName: "قسم القانون الخاص" },
  ],
  instructors: [{ AdInstructorId: 1, AdInstructorName: "د. تجريبي", AdInstructorCivil: "", AdInstructorMobile: "" }],
  courses, curriculumPlans: [41, 51, 11].map(sid => ({ id: `p-${sid}-new`, AdCollegeId: sid === 41 ? 4 : sid === 51 ? 5 : 1, AdSectionId: sid, name: "الجديدة", status: "active", createdAt: "2026-02-01" })),
  curriculumPlanCourses: planCourses, courseTransitions: [], schedules, rooms: [], studentNeeds: [], studentProfiles: [],
  featureDocs: { universityStudentSettings: { university: { maxUnits: 18 } } },
}), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
const { registerStudentDoorRoutes } = await import("../src/server/studentDoorRoutes");
await initDatabase(); console.warn = quiet;

const identityKey = createHmac("sha256", "t").update("identity").digest();
const sealIdentity = async (v: string) => "sealed:" + Buffer.from(v).toString("base64url");
const fingerprintOf = async (c: string) => createHash("sha256").update("fp|" + c).digest("hex").slice(0, 32);
const app = express(); app.use(express.json());
registerStudentDoorRoutes(app, {
  surveyFingerprint: fingerprintOf, sealIdentity, openIdentity: async c => Buffer.from(c.replace("sealed:", ""), "base64url").toString(),
  identityKey: async () => identityKey, isProduction: () => false, planSheetTemplate: "",
});
const server = app.listen(0); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
type Res = { status: number; json: any; cookie: string };
const http = async (method: string, url: string, body?: unknown, cookie = ""): Promise<Res> => {
  const res = await fetch(base + url, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json, cookie: (res.headers.getSetCookie()[0] || "").split(";")[0] };
};
const join = async (seed: number) => {
  const id = civil(seed);
  const made = await http("POST", "/api/public/me/enter", { civil: id, code: "135790", create: true, agree: true, name: "طالب تجريبي ثلاثي" });
  return { id, jar: made.cookie, status: made.status, fingerprint: await fingerprintOf(id) };
};

try {
  /* الكتالوج من البيانات: كلُّ الكليات التي لها أقسام، بلا كليةٍ فارغة */
  const cat = (await http("GET", "/api/public/me/catalog")).json;
  check(cat.colleges.map((c: any) => c.id).join() === "1,4,5" || cat.colleges.map((c: any) => c.id).sort().join() === "1,4,5", "C2 قائمةُ الكليات تضمّ كلَّ كليةٍ لها أقسام (تربية، علوم صحية، حقوق)", cat);
  check(cat.colleges.find((c: any) => c.id === 5)?.track === "", "C2 كليةُ الحقوق بلا مسارٍ ولا تُخفى");
  const nursing = (await http("GET", "/api/public/me/catalog?collegeId=4")).json;
  const law = (await http("GET", "/api/public/me/catalog?collegeId=5")).json;
  check(nursing.specializations.length === 1 && nursing.specializations[0].id === 41 && law.specializations.length === 1 && law.specializations[0].id === 51, "C2 أقسامُ كلّ كلية بمعرّفاتها وحدها", [nursing.specializations, law.specializations]);
  check((await http("GET", "/api/public/me/catalog?collegeId=6")).json.code === "bad-college", "C2 كليةٌ بلا أقسام ليست خياراً");

  /* طالبان من كليتين غير التربية الأساسية */
  const a = await join(101), b = await join(131);
  check(a.status === 201 && b.status === 201, "C2 طالبُ التمريض وطالبُ الحقوق ينشئان ملفَّيهما");
  const planA = (await http("GET", "/api/public/me/plan?sectionId=41", undefined, a.jar)).json, planB = (await http("GET", "/api/public/me/plan?sectionId=51", undefined, b.jar)).json;
  check(planA.plans[0].courses.every((c: any) => idsOf[41].includes(c.id)) && planB.plans[0].courses.every((c: any) => idsOf[51].includes(c.id)), "C2 الصحيفةُ لكلّ طالبٍ من قسم كليته وحدها");
  check((await http("PUT", "/api/public/me/profile", { sectionId: 41, collegeId: 5, passedCourseIds: [] }, a.jar)).json.code === "bad-college", "C2 قسمٌ لا يطابق الكليةَ المرسلة مرفوض");
  check((await http("PUT", "/api/public/me/profile", { sectionId: 11, collegeId: 4, passedCourseIds: [] }, a.jar)).json.code === "bad-college", "C2 قسمُ كليةٍ أخرى مرفوض");
  const savedA = await http("PUT", "/api/public/me/profile", { sectionId: 41, collegeId: 4, curriculumPlanId: "p-41-new", passedCourseIds: [idsOf[41][0]] }, a.jar);
  const savedB = await http("PUT", "/api/public/me/profile", { sectionId: 51, collegeId: 5, passedCourseIds: [] }, b.jar);
  check(savedA.status === 200 && savedA.json.collegeId === 4 && savedA.json.sectionId === 41 && savedA.json.setupDone && savedA.json.passedCourseIds.length === 1, "C2 طالبُ التمريض يحفظ قسمَه وصحيفتَه ومنجَزَه", savedA.json);
  check(savedB.status === 200 && savedB.json.collegeId === 5 && savedB.json.sectionId === 51 && savedB.json.setupDone, "C2 طالبُ الحقوق (بلا صحيفةٍ مختارة) يحفظ قسمَه", savedB.json);

  /* المطروح والخريطة: كلٌّ من كليته */
  const offA = (await http("GET", "/api/public/me/offered", undefined, a.jar)).json, offB = (await http("GET", "/api/public/me/offered", undefined, b.jar)).json;
  check(offA.ready && offA.courses.length > 0 && offA.courses.every((c: any) => idsOf[41].includes(c.id)) && offA.courses.some((c: any) => c.sections > 0), "C2 مطروحُ طالب التمريض من كليته وحدها وفيه شعب", offA);
  check(offB.ready && offB.courses.length > 0 && offB.courses.every((c: any) => idsOf[51].includes(c.id)), "C2 مطروحُ طالب الحقوق من كليته وحدها", offB);
  check(!JSON.stringify(offA).includes("قانون") && !JSON.stringify(offA).includes("العقود") && !JSON.stringify(offB).includes("تمريض") && !JSON.stringify(offB).includes("التشريح"), "C2 لا يرى أحدُهما مقرراتِ الآخر");
  const mapA = (await http("GET", "/api/public/me/map", undefined, a.jar)).json;
  check(mapA.ready === true && mapA.model.courses.length > 0 && mapA.model.courses.every((c: any) => idsOf[41].includes(c.id)), "C2 خريطةُ طالب التمريض من كليته وحدها", { ready: mapA.ready, reason: mapA.reason });

  /* الرغبات: ما ليس من قسمه يُسقَط، وتُحدَّث آخرُ تعديل */
  const before = await Repository.getStudentProfile(a.fingerprint);
  await new Promise(r => setTimeout(r, 15));
  const wishA = await http("PUT", "/api/public/me/wishes", { targetUnits: 12, courseIds: [idsOf[41][2], idsOf[51][0], idsOf[11][0]], constraints: {} }, a.jar);
  check(wishA.status === 200 && wishA.json.wishes.courseIds.join() === String(idsOf[41][2]), "C2 رغباتُ طالب التمريض: مقرراتُ كليته وحدها", wishA.json);
  const after = await Repository.getStudentProfile(a.fingerprint);
  check(Boolean(before && after) && Date.parse(after!.updatedAt) > Date.parse(before!.updatedAt), "C3 حفظُ الرغبات يحدّث «آخر تعديل»", { before: before?.updatedAt, after: after?.updatedAt });
  check(Boolean(after?.deleteAt) && Boolean(after?.deleteReason), "C3 وعمرُ الملف يُحسب بعد الكتابة", after?.deleteAt);

  /* أعدادُ الزملاء: القسمُ الصغير لا يُرسل n ولا of؛ والكبير يُرسلهما؛ وأعدادُ كليةٍ لا تظهر في أخرى */
  const small = (await http("GET", "/api/public/me/wishes-count", undefined, a.jar)).json;
  check(small.ready === true && small.show === false && !("n" in small) && !("of" in small) && Object.keys(small.byCourse).length === 0, "C3 قسمٌ صغير: لا n ولا of ولا أعداد مقررات", small);
  for (let i = 0; i < 11; i += 1) {
    await Repository.updateStudentProfile(`seed-law-${i}`, () => ({ id: `seed-law-${i}`, fingerprint: `seed-law-${i}`, AdCollegeId: 5, AdSectionId: 51, passedCourseIds: [], passedUnits: 0, codeHash: "x", codeSalt: "x",
      createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deleteAt: new Date(Date.now() + 9e11).toISOString(), deleteReason: "initial",
      wishes: { termId: 1, targetUnits: 12, courseIds: [idsOf[51][0]], constraints: {}, updatedAt: new Date().toISOString() } } as any));
  }
  const big = (await http("GET", "/api/public/me/wishes-count", undefined, b.jar)).json;
  check(big.ready === true && big.show === true && big.of === 12 && typeof big.n === "number", "C3 قسمٌ كبير: العددان يُرسلان", big);
  check(big.byCourse[idsOf[51][0]] === 11, "C2 أعدادُ الزملاء من قسم الطالب وكليته", big.byCourse);
  const smallAgain = (await http("GET", "/api/public/me/wishes-count", undefined, a.jar)).json;
  check(smallAgain.show === false && JSON.stringify(smallAgain).indexOf(String(idsOf[51][0])) < 0, "C2 طالبُ التمريض لا يرى أعدادَ طلبة الحقوق");
} catch (error) {
  check(false, `C2 المسارات: ${error instanceof Error ? error.stack : error}`);
} finally {
  server.close();
}

/* ── C4: الصفحة ──────────────────────────────────────────────────────────── */
const fnSrc = (name: string) => {
  const begin = STUDENT_HOME_SCRIPT.indexOf("function " + name + "(");
  if (begin < 0) throw new Error("missing " + name);
  const next = STUDENT_HOME_SCRIPT.indexOf("\nfunction ", begin + 1);
  return STUDENT_HOME_SCRIPT.slice(begin, next < 0 ? undefined : next);
};
{
  /* ensureCatalog: كلياتٌ ثم أقسام الكلية؛ وفشلُ أيٍّ منهما لا يُخزَّن فارغاً؛ وكليةٌ واحدة تُختار وحدها؛ وملفٌّ محفوظ يبدأ من كليته */
  const calls: string[] = [];
  const ctx: any = { S: { track: "", colleges: null, college: null, catalog: null, catalogErr: "", state: { profile: { setupDone: true, collegeId: 5 } } }, encodeURIComponent };
  let reply: any = { ok: false, status: 0, d: { error: "تعذّر الاتصال" } };
  ctx.api = (_m: string, url: string) => { calls.push(url); return { then: (f: any) => f(reply) }; };
  runInNewContext(fnSrc("ensureCatalog") + ";this.e=ensureCatalog;", ctx);
  let done = 0; ctx.e(() => done++);
  check(done === 1 && ctx.S.colleges === null && ctx.S.catalogErr === "تعذّر الاتصال", "C4 فشلُ تحميل الكليات لا يُخزَّن فارغاً");
  reply = { ok: true, status: 200, d: { colleges: [{ id: 4, name: "كلية العلوم الصحية - بنين" }, { id: 5, name: "كلية الحقوق" }] } };
  ctx.S.state.profile.setupDone = false; calls.length = 0; ctx.e(() => done++);
  check(ctx.S.colleges.length === 2 && ctx.S.college === null && calls.length === 1, "C4 ملفٌّ جديد: تُعرض الكلياتُ ليختار منها", calls);
  ctx.S.colleges = null; ctx.S.state.profile.setupDone = true; calls.length = 0;
  reply = { ok: true, status: 200, d: { colleges: [{ id: 4, name: "أ" }, { id: 5, name: "ب" }], specializations: [{ id: 51, name: "قسم القانون" }] } };
  ctx.e(() => done++);
  check(ctx.S.college?.id === 5 && ctx.S.catalog?.length === 1 && calls[1].includes("collegeId=5"), "C4 ملفٌّ محفوظ يبدأ من كليته ويحمّل أقسامَها", calls);
  const one: any = { S: { track: "", colleges: null, college: null, catalog: null, catalogErr: "", state: null }, encodeURIComponent, api: (_m: string, url: string) => ({ then: (f: any) => f({ ok: true, status: 200, d: { colleges: [{ id: 9, name: "كلية وحيدة" }], specializations: [{ id: 1, name: "قسم" }] } }) }) };
  runInNewContext(fnSrc("ensureCatalog") + ";this.e=ensureCatalog;", one); one.e(() => {});
  check(one.S.college?.id === 9 && one.S.catalog?.length === 1, "C4 جامعةٌ بكليةٍ واحدة: تُختار بلا سؤال");
  check(/id="bkcol"/.test(STUDENT_HOME_SCRIPT) && /history\.pushState\(\{masari:"college"\}/.test(STUDENT_HOME_SCRIPT) && /ما كليتك؟/.test(STUDENT_HOME_SCRIPT) && !/اختر مسار الدراسة|أقسام كلية التربية الأساسية/.test(STUDENT_HOME_SCRIPT), "C4 شاشةُ «ما كليتك؟» وزرُّ رجوعٍ إليها، ولا اسمَ كليةٍ بعينها في الصفحة");

  /* إعادة اختيار الصحيفة نفسها تُبقي المنجَز؛ وتغيّرُها يُصفّره */
  const click = (draft: any, picked: string) => {
    const els: Record<string, any> = {};
    const el = (id: string) => (els[id] ||= { listeners: {} as Record<string, any>, addEventListener(type: string, f: any) { this.listeners[type] = f; }, set innerHTML(_v: string) {} });
    let viewed = 0;
    const c: any = { S: { draft, plans: [{ id: "p1", name: "الجديدة", status: "active", courses: [{ id: 1 }] }, { id: "p2", name: "السابقة", status: "transition", courses: [{ id: 1 }] }] },
      app: {}, prog: () => "", ic: () => "", esc: (v: unknown) => String(v), countOf, AR, document: { getElementById: el }, viewSetup: () => { viewed++; } };
    runInNewContext(fnSrc("setupPlan") + ";this.go=setupPlan;", c); c.go();
    el("pl").listeners.click({ target: { closest: () => ({ disabled: false, getAttribute: () => picked }) } });
    return { draft, viewed };
  };
  const same = click({ planId: "p1", passed: [1, 2, 3], step: 2 }, "p1");
  check(same.draft.passed.join() === "1,2,3" && same.draft.step === 3 && same.viewed === 1, "C4 إعادةُ اختيار الصحيفة نفسها تُبقي ما علّمه الطالب منجَزاً", same.draft);
  const other = click({ planId: "p1", passed: [1, 2, 3], step: 2 }, "p2");
  check(other.draft.passed.length === 0 && other.draft.planId === "p2", "C4 تغيّرُ الصحيفة يُصفّر المنجَز (مقرراتُها غيرُها)", other.draft);

  /* الخروج: لا يُعرض الباب إلا بتأكيد الخادم */
  const exit = (reply: any) => {
    const toasts: any[] = []; let view = "";
    const c: any = { S: { state: { signedIn: true, profile: { x: 1 } }, civil: "1", remember: true, draft: {}, offered: {} }, toast: (m: string, bad: boolean) => toasts.push([m, bad]), setView: (v: string) => { view = v; },
      api: () => ({ then: (f: any) => f(reply) }) };
    runInNewContext(fnSrc("doExit") + ";this.go=doExit;", c);
    const btn: any = { disabled: false }; c.go(btn);
    return { c, toasts, view, btn };
  };
  const offline = exit({ ok: false, status: 0, d: { error: "تعذّر الاتصال" } });
  check(offline.view === "" && offline.c.S.state.signedIn === true && offline.c.S.state.profile !== null && offline.btn.disabled === false && offline.toasts[0]?.[0] === "لم يكتمل الخروج، تأكد من الاتصال وأعد المحاولة" && offline.toasts[0]?.[1] === true, "C4 خروجٌ فاشل (انقطاع): يبقى الطالب داخلاً وتظهر رسالةٌ واضحة ويُعاد الزرّ", offline);
  const unknown = exit({ ok: false, status: 0, unknown: true, d: {} });
  check(unknown.view === "" && unknown.c.S.state.signedIn === true, "C4 خروجٌ غيرُ مؤكَّد (مهلة): يبقى داخلاً");
  const okExit = exit({ ok: true, status: 200, d: { ok: true } });
  check(okExit.view === "gate" && okExit.c.S.state.signedIn === false && okExit.c.S.state.profile === null && okExit.toasts.length === 0, "C4 خروجٌ مؤكَّد من الخادم: يظهر الباب ويُمسح الملف من الصفحة");

  /* نصوصٌ وأزرار */
  check(!/لا يُحفظان في ملفّك الدائم/.test(STUDENT_HOME_SCRIPT) && /يُحفظان مختومَين، ولا يظهران إلا في طلبك هذا، ويُحذفان مع ملفّك/.test(STUDENT_HOME_SCRIPT), "C4 نصُّ الخصوصية صادقٌ: الاسمُ والرقم يُحفظان مختومَين ويُحذفان مع الملف");
  check(/if\(visibleTimes\|\|w\.start\)h\+='<div class="row"/.test(STUDENT_HOME_SCRIPT) && /\(w\.start\?'<button type="button" class="btn alt small" data-act="ics"/.test(STUDENT_HOME_SCRIPT) && /\(visibleTimes\?'<button type="button" class="btn alt small" data-act="share"/.test(STUDENT_HOME_SCRIPT), "C4 «ذكّرني بموعد تسجيلي» يظهر متى عُرف موعدُ الدور ولو خُفيت مواعيدُ المحاضرات، والمشاركةُ بالصورة تبقى للمواعيد الظاهرة");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
