/**
 * مسار «فحص جدول التسجيل» على مستودعٍ حقيقي: الصلاحية والنطاق كما لاستيراد PDF
 * (النموذج 7 ونطاق القسم)، والمدخلات المعيبة تُردّ قبل أي قراءة، ونسخةُ آخر ما
 * رآه التسجيل تُقرأ أساساً لـ«لم يُنفَّذ» — وقبل ذلك كلّه وبعده: لا بايتَ واحداً
 * يتغيّر في قاعدة البيانات (الجداول والنُّسخ والاعتماد).
 *
 * ومعه حارسٌ على قراءة الملف: readOnly=1 يمنع تسجيلَ مواقع الفرع في سجلّ المباني.
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 800)); }
};

const row = (id: number, course: number, section: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, AdCourseId: course, AdCourseName: "", SCode: section, AdInstructorId: 7,
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: start, fendtime: end,
  AdRoomCode: "012B07", AdRoomHall: "A1", fdetail: "", ...extra,
});
const pdfRow = (course: string, section: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
  sourceCourseCode: course, sourceSectionText: section, SCode: section, AdInstructorId: 7, sourcePage: 1, sourceReadMode: "pdf-text",
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: start, fendtime: end,
  AdRoomCode: "012B07", AdRoomHall: "A1", ...extra,
});

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-registrar-check-"));
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [{ AdTermId: 5, AdTermName: "الفصل الأول 2026/2027" }],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "01", AdCollegeName: "كلية التربية الأساسية" }],
    sections: [
      { AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم أ" },
      { AdSectionId: 12, AdCollegeId: 1, AdSectionCode: "10", AdSectionName: "قسم ب" },
    ],
    instructors: [{ AdInstructorId: 7, AdInstructorName: "أحمد علي الصالح" }], rooms: [], courseTransitions: [],
    courses: [
      { AdCourseId: 301, AdCollegeId: 1, AdSectionId: 11, CourseCode: "0109105", CourseName: "أسس التعلم", CourseCredit: 3, CourseHours: 3, MaxStudent: 40 },
      { AdCourseId: 302, AdCollegeId: 1, AdSectionId: 11, CourseCode: "0109106", CourseName: "تصميم التعليم", CourseCredit: 3, CourseHours: 3, MaxStudent: 40 },
    ],
    schedules: [row(9001, 301, "1", "09:00", "10:15"), row(9002, 302, "1", "11:00", "12:15")],
    curriculumPlans: [], curriculumPlanCourses: [],
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  const { registerScheduleImportRoutes } = await import("../src/server/routes/scheduleImportRoutes");
  await initDatabase();
  console.warn = quiet;

  /* ما رآه التسجيل آخر مرّة: نسخةٌ فيها الموعد الأول كان في الثامنة. */
  const version = await Repository.createScheduleVersion({
    AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, kind: "capture", label: "قبل التعديل", createdBy: "test",
    rows: [row(9001, 301, "1", "08:00", "09:15"), row(9002, 302, "1", "11:00", "12:15")],
  } as any);
  const approval = { scopeKey: "1:11:5", AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, status: "submitted", currentRound: 2, rounds: [{ number: 1, submittedAt: "2026-10-01T08:00:00Z", returnedAt: "2026-10-02T08:00:00Z", reviewedVersionId: version.id }, { number: 2, submittedAt: "2026-10-03T08:00:00Z" }], signatures: [], pendingAdditions: [], revision: 0 };
  await Repository.saveScheduleApproval(approval as any);

  const USERS: Record<string, any> = {
    admin: { user: { SystemUserId: 1, Role: "committeeChair", Name: "المدير", IsAdminUser: true }, scopes: [], permissions: [7] },
    head: { user: { SystemUserId: 2, Role: "departmentHead", Name: "رئيس القسم", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [7] },
    noPermission: { user: { SystemUserId: 3, Role: "departmentHead", Name: "بلا صلاحية", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [] },
  };
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; req.permissions = who.permissions; } next(); });
  registerScheduleImportRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (who: string, body: unknown) => {
    const res = await fetch(`${base}/api/schedules/registrar-check`, { method: "POST", headers: { "content-type": "application/json", "x-who": who }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => ({})) as any };
  };
  const fileHash = () => crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, "db.json"))).digest("hex");
  const state = async () => JSON.stringify({
    schedules: await Repository.getSchedulesByScope({ collegeId: 1, sectionId: 11, termId: 5 }),
    versions: await Repository.getScheduleVersions(1, 11, 5, 50),
    approval: await Repository.getScheduleApproval(1, 11, 5),
  });

  try {
    const before = await state();
    const beforeFile = fileHash();
    const body = { collegeId: 1, sectionId: 11, termId: 5 };

    check((await fetch(`${base}/api/schedules/registrar-check`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status === 401, "بلا تسجيل دخول: ٤٠١");
    check((await post("noPermission", { ...body, rows: [] })).status === 403, "بلا صلاحية استيراد PDF (النموذج 7): ٤٠٣");
    const foreign = await post("head", { ...body, sectionId: 12, rows: [pdfRow("105", "1", "09:00", "10:15")] });
    check(foreign.status === 403, "قسمٌ خارج نطاق الحساب: ٤٠٣ قبل أي قراءة", foreign);
    check((await post("head", { collegeId: 1, sectionId: 11, rows: [] })).status === 400, "بلا فصل: ٤٠٠");
    check((await post("head", { ...body })).status === 400, "بلا صفوف: ٤٠٠");
    check((await post("head", { ...body, rows: Array.from({ length: 601 }, () => pdfRow("105", "1", "09:00", "10:15")) })).status === 400, "صفوفٌ فوق الحدّ الآمن: ٤٠٠");

    /* الملف يخالف: 9001 غُيّر بعد الإرسال (08:00 → 09:00) وما زال الملف على القديم، و9002 قاعتُه مختلفة في الملف. */
    const found = await post("head", { ...body, rows: [
      pdfRow("105", "1", "08:00", "09:15"),
      pdfRow("106", "1", "11:00", "12:15", { AdRoomHall: "Z9" }),
      pdfRow("999", "1", "13:00", "14:15"),
    ] });
    check(found.status === 200 && found.json.baseline?.available === true, "قراءةٌ ناجحة ومعها نسخةُ آخر ما رآه التسجيل", found);
    const notCarried = (found.json.findings || []).filter((item: any) => item.group === "notCarried");
    check(notCarried.length === 1 && notCarried[0].fields[0].field === "time" && notCarried[0].fields[0].was === "08:00–09:15" && notCarried[0].fields[0].ours === "09:00–10:15", "تعديل بعد الإرسال لم يُنفَّذ", found.json.findings);
    check(typeof notCarried[0]?.scheduleId === "number" && notCarried[0].scheduleId === 9001, "ومعه معرّف الموعد لفتحه");
    const mismatch = (found.json.findings || []).filter((item: any) => item.group === "mismatch");
    check(mismatch.some((item: any) => item.kind === "fields" && item.fields[0].field === "room") && mismatch.some((item: any) => item.kind === "onlyPdf"), "خللٌ في القاعة وشعبةٌ على طرف الملف وحده", mismatch);
    check(found.json.counts?.total === 3, "ثلاث شعب قُورنت", found.json.counts);

    const same = await post("admin", { ...body, rows: [pdfRow("105", "1", "09:00", "10:15"), pdfRow("106", "1", "11:00", "12:15")] });
    check(same.status === 200 && same.json.counts.matched === 2 && same.json.percent === 100, "ملفٌ مطابقٌ تماماً: ١٠٠٪", same.json);

    const empty = await post("head", { ...body, rows: [] });
    check(empty.status === 200 && empty.json.empty === "pdfEmpty", "ملفٌ بلا صفوف: تُقال العلّة", empty.json);

    const junk = await post("head", { ...body, rows: [null, 5, "x", { AdCourseId: "abc", ocrLine: "x".repeat(100000) }] });
    check(junk.status === 200 && Array.isArray(junk.json.findings), "صفوفٌ مشوّهة لا تُسقط المسار", junk);

    check(await state() === before && fileHash() === beforeFile, "قراءةٌ محضة: الجداول والنُّسخ والاعتماد وملفُّ القاعدة كما كانت بايتاً ببايت");
  } finally {
    server.close();
  }

  /* حارسٌ على قارئ PDF: readOnly=1 يتخطّى تسجيل مواقع الفرع في سجلّ المباني. */
  const reader = fs.readFileSync("src/server/routes/pdfImportRoutes.ts", "utf8");
  check(/const readOnly=String\(req\.query\.readOnly\|\|""\)==="1";/.test(reader) && /const dryRun=readOnly\|\|/.test(reader), "القارئ يعرف readOnly ويجعله تجربةً بلا حفظ");
  check(/if\(!readOnly\)provisioned=await provisionBranchSiteLocationsFromAuthority\(/.test(reader), "readOnly لا يسجّل مواقع الفرع في سجلّ المباني");
  const route = fs.readFileSync("src/server/routes/scheduleImportRoutes.ts", "utf8");
  const handler = route.slice(route.indexOf('app.post("/api/schedules/registrar-check"'), route.indexOf("Carry a whole term out"));
  check(handler.length > 200 && !/Repository\.(create|update|save|delete|upsert|set|insert|add|remove|wipe|copy)/.test(handler) && !/noteScheduleMutation/.test(handler), "مسار الفحص لا يستدعي أيّ كتابة");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
