/**
 * مطابقة ترقيم التسجيل (تلقائيةٌ بعد الفحص) على مستودعٍ حقيقي: الصلاحية والنطاق (النموذج 7)،
 * والكتابة لا تغيّر إلا رقم الشعبة والرقم المرجعي، وتسبقها نسخةٌ للتراجع، والتصادم لا يُكتب،
 * والملف نفسه ثانيةً لا يكتب، والجديدة تأخذ رقمهم في الملف التالي، وسجلّ الفصل لا ينقص.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 900)); }
};

const row = (id: number, course: number, section: string, crn: string, start: string, extra: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, AdCourseId: course, AdCourseName: "", SCode: section, referenceNumber: crn, AdInstructorId: 7,
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: start, fendtime: start.replace(/^(\d\d)/, h => String(Number(h) + 1).padStart(2, "0")),
  AdRoomCode: "012B07", AdRoomHall: "A1", fdetail: "", rev: 1, ...extra,
});
const pdfRow = (course: string, section: string, crn: string, start: string, extra: Record<string, unknown> = {}) => ({
  sourceCourseCode: course, sourceSectionText: section, SCode: section, referenceNumber: crn, AdInstructorId: 7, sourcePage: 1, sourceReadMode: "pdf-text",
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: start, fendtime: start.replace(/^(\d\d)/, h => String(Number(h) + 1).padStart(2, "0")),
  AdRoomCode: "012B07", AdRoomHall: "A1", ...extra,
});

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-registrar-numbering-"));
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [{ AdTermId: 5, AdTermName: "الفصل الأول 2026/2027" }],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "01", AdCollegeName: "كلية التربية الأساسية" }],
    sections: [{ AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم أ" }, { AdSectionId: 12, AdCollegeId: 1, AdSectionCode: "10", AdSectionName: "قسم ب" }],
    instructors: [{ AdInstructorId: 7, AdInstructorName: "أحمد علي الصالح" }], rooms: [], courseTransitions: [],
    courses: [
      { AdCourseId: 301, AdCollegeId: 1, AdSectionId: 11, CourseCode: "0109105", CourseName: "أسس التعلم", CourseCredit: 3, CourseHours: 3, MaxStudent: 40 },
      { AdCourseId: 302, AdCollegeId: 1, AdSectionId: 11, CourseCode: "0109106", CourseName: "تصميم التعليم", CourseCredit: 3, CourseHours: 3, MaxStudent: 40 },
    ],
    schedules: [
      row(9001, 301, "501", "11064", "08:00"),                       // ← 504 / 2026
      row(9002, 301, "502", "", "10:00"),                            // جديدة بلا مرجعي ← 539 / 10191
      row(9003, 302, "501", "11085", "12:00"),                       // ← 503 / 2045 (يصطدم بشعبةٍ عندنا 503)
      row(9004, 302, "503", "", "14:00"),                            // غائبةٌ عن ملفهم، تحمل 503
      row(9005, 302, "504", "11086", "08:00", { fmonday: true }),    // شعبةٌ بموعدين (صفّان) ← 506 / 2041
      row(9006, 302, "504", "11086", "08:00", { fsunday: false, ftuesday: false, fthursday: true }),
    ],
    curriculumPlans: [], curriculumPlanCourses: [],
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  const { registerScheduleImportRoutes } = await import("../src/server/routes/scheduleImportRoutes");
  await initDatabase();
  console.warn = quiet;

  const USERS: Record<string, any> = {
    head: { user: { SystemUserId: 2, Role: "committeeChair", Name: "رئيس اللجنة", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [7] },
    noPermission: { user: { SystemUserId: 3, Role: "committeeChair", Name: "بلا صلاحية", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [] },
    other: { user: { SystemUserId: 5, Role: "committeeChair", Name: "قسم آخر", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 12 }], permissions: [7] },
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; req.permissions = who.permissions; } next(); });
  registerScheduleImportRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, url: string, who: string | null, body?: unknown) => {
    const res = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", ...(who ? { "x-who": who } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => ({})) as any };
  };
  const live = async () => (await Repository.getSchedulesByScope({ collegeId: 1, sectionId: 11, termId: 5 }, { fresh: true })) as any[];
  const rows = [
    pdfRow("0109105", "504", "2026", "08:00"),
    pdfRow("0109105", "539", "10191", "10:00"),
    pdfRow("0109106", "503", "2045", "12:00"),
    pdfRow("0109106", "506", "2041", "08:00", { fmonday: true }),
    pdfRow("0109106", "506", "2041", "08:00", { fsunday: false, ftuesday: false, fthursday: true }),
  ];
  const body = { collegeId: 1, sectionId: 11, termId: 5, rows };
  const URL = "/api/schedules/registrar-numbering";
  try {
    check((await call("POST", URL, null, body)).status === 401, "بلا دخول: ٤٠١");
    check((await call("POST", URL, "noPermission", body)).status === 403, "بلا النموذج 7: ٤٠٣");
    check((await call("POST", URL, "other", body)).status === 403, "قسمٌ خارج النطاق: ٤٠٣");
    check((await call("POST", URL, "head", { ...body, rows: undefined })).status === 400, "بلا صفوف: ٤٠٠");

    const before = JSON.stringify(await live());
    check(JSON.stringify(await live()) === before && !(await Repository.getScheduleVersions(1, 11, 5, 10)).length, "قبل المطابقة: لا نسخة ولا كتابة (الرفضُ لا يكتب)");
    const done = await call("POST", URL, "head", body);
    check(done.status === 200 && done.json.changed === 3 && done.json.rows === 4 && typeof done.json.undoVersionId === "string", "المطابقة التلقائية: ثلاث شعب في أربعة صفوف، ومعها نسخة للتراجع", done.json);
    check((done.json.collisions || []).some((c: any) => c.section === "503"), "503 عندهم تحمله شعبةٌ عندنا: تصادمٌ مسمّى لـ«تحتاج نظرك» لا يُكتب", done.json.collisions);
    const after = await live();
    const prior = JSON.parse(before) as any[];
    const changedKeys = new Set<string>();
    for (const now of after) {
      const was = prior.find(r => r.id === now.id);
      for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) if (JSON.stringify(was[key]) !== JSON.stringify(now[key])) changedKeys.add(key);
    }
    check([...changedKeys].sort().join() === ["SCode", "referenceNumber", "registrarNumberedAt", "rev"].sort().join(), "لا يتغيّر إلا رقم الشعبة والمرجعي (وختم المطابقة والمراجعة)", [...changedKeys]);
    const byId = new Map(after.map(r => [r.id, r]));
    check(byId.get(9001).SCode === "504" && byId.get(9001).referenceNumber === "2026", "بالرقم المرجعي: 501 ← 504 / 2026");
    check(byId.get(9002).SCode === "539" && byId.get(9002).referenceNumber === "10191", "الجديدة بلا مرجعي، بالموعد والأستاذ: 502 ← 539 / 10191");
    check(byId.get(9003).SCode === "501" && byId.get(9003).referenceNumber === "11085" && byId.get(9004).SCode === "503", "المتصادمة بقيت كما هي");
    check(byId.get(9005).SCode === "506" && byId.get(9006).SCode === "506" && byId.get(9006).referenceNumber === "2041", "صفّا الشعبة الواحدة برقمٍ واحد");
    const version = await Repository.getScheduleVersionById(done.json.undoVersionId);
    check(version?.label === "قبل مطابقة ترقيم التسجيل" && (version.rows as any[]).find(r => r.id === 9001)?.SCode === "501" && Boolean((version as any).baseFingerprint), "النسخة «قبل مطابقة ترقيم التسجيل» بأرقامها القديمة وأساسها للتراجع", version?.label);

    const versionsBefore = (await Repository.getScheduleVersions(1, 11, 5, 50)).length;
    const again = await call("POST", URL, "head", body);
    check(again.status === 200 && again.json.changed === 0 && (await Repository.getScheduleVersions(1, 11, 5, 50)).length === versionsBefore, "الملف نفسه مرّةً ثانية: لا شيء يتغيّر ولا نسخة جديدة", again.json);

    /* ملفٌّ لاحق: شعبةٌ جديدة فتحناها ظهرت عندهم — تُطابَق تلقائياً. */
    const created = await Repository.createSchedule(row(9010, 301, "540", "", "16:00") as any);
    const later = [...rows, pdfRow("0109105", "545", "10220", "16:00")];
    const one = await call("POST", URL, "head", { ...body, rows: later });
    const now = (await live()).find(r => r.id === created.id);
    check(one.status === 200 && one.json.changed === 1 && now?.SCode === "545" && now?.referenceNumber === "10220", "الجديدة ظهرت عندهم: أخذت رقمهم 545 والمرجعي 10220", one.json);

    /* الجدول بين يدي التسجيل (مُرسَل): لا تُكتب المطابقة، ويُقال السبب. */
    await Repository.createSchedule(row(9011, 302, "541", "", "18:00") as any);
    await Repository.saveScheduleApproval({ scopeKey: "1:11:5", AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, status: "submitted", currentRound: 1, rounds: [{ number: 1, submittedAt: "2026-11-01T08:00:00Z" }], signatures: [], pendingAdditions: [], revision: 0 } as any);
    const lockedRows = [...later, pdfRow("0109106", "550", "10230", "18:00")];
    const locked = await call("POST", URL, "head", { ...body, rows: lockedRows });
    check(locked.status === 200 && locked.json.changed === 0 && typeof locked.json.locked === "string" && locked.json.locked.length > 0, "جدولٌ مُرسَل للتسجيل: لا كتابة، والسبب في الردّ", locked.json);
    await Repository.saveScheduleApproval({ scopeKey: "1:11:5", AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, status: "draft", currentRound: 1, rounds: [{ number: 1, submittedAt: "2026-11-01T08:00:00Z", returnedAt: "2026-11-02T08:00:00Z" }], signatures: [], pendingAdditions: [], revision: 1 } as any);

    /* سجلّ أرقام الفصل: يحفظ أكبر رقم، ولا ينقص بالحذف. */
    const { recordSectionNumberLedger } = await import("../src/server/core/sectionNumbers");
    await recordSectionNumberLedger(1, 11, 5, [{ AdCourseId: 301, SCode: "560" }]);
    const ledger = await call("GET", "/api/schedules/section-numbers?collegeId=1&sectionId=11&termId=5", "head");
    check(ledger.status === 200 && ledger.json.courses["301"] === 560 && ledger.json.courses["302"] >= 506, "سجلّ الفصل: 560 حُذفت فبقيت، و506 بعد الاعتماد", ledger.json);
    check((await call("GET", "/api/schedules/section-numbers?collegeId=1&sectionId=12&termId=5", "head")).status === 403, "سجلّ قسمٍ آخر: ٤٠٣");
  } finally {
    server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
