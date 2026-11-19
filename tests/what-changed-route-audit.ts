/**
 * مسار «ماذا غيّرنا؟» على مستودعٍ حقيقي: ٤٠١ بلا دخول، و٤٠٣ بلا النموذج 7 أو
 * بصفة اطّلاع أو خارج النطاق، والأستاذُ لا يراه؛ والفترات الثلاث (اليوم، منذ آخر
 * إرسال، وقتٌ مختار)؛ ولا بايتَ يتغيّر في قاعدة البيانات.
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
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 900)); }
};

const row = (id: number, course: number, section: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, AdCourseId: course, AdCourseName: "", SCode: section, AdInstructorId: 7,
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: start, fendtime: end,
  AdRoomCode: "012B07", AdRoomHall: "A1", fdetail: "", ...extra,
});

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-what-changed-"));
  const live = [row(9001, 301, "1", "10:00", "11:15", { AdRoomHall: "B2" }), row(9002, 302, "1", "11:00", "12:15", { AdInstructorId: 8 })];
  const iso = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600_000).toISOString();
  const version = (id: string, createdAt: string, userName: string, label: string, rows: any[]) => ({
    id, scopeKey: "1:11:5", createdAt, rowCount: rows.length, SystemUserId: 2, userName, AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, label, source: "manual", rows,
  });
  /* الأحدث أولاً كما تُخزَّن. */
  const versions = [
    version("v4", iso(0.5), "سارة", "قبل تعديل موعد دراسي", [row(9001, 301, "1", "10:00", "11:15", { AdRoomHall: "B2" }), row(9002, 302, "1", "11:00", "12:15")]),
    version("v3", iso(1), "أحمد", "قبل تعديل موعد دراسي", [row(9001, 301, "1", "09:00", "10:15", { AdRoomHall: "B2" }), row(9002, 302, "1", "11:00", "12:15")]),
    version("v2", iso(2), "أحمد", "إرسال إلى التسجيل", [row(9001, 301, "1", "09:00", "10:15", { AdRoomHall: "B2" }), row(9002, 302, "1", "11:00", "12:15")]),
    version("v1", iso(3), "أحمد", "قبل تعديل موعد دراسي", [row(9001, 301, "1", "09:00", "10:15"), row(9002, 302, "1", "11:00", "12:15")]),
  ];
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [{ AdTermId: 5, AdTermName: "الفصل الأول 2026/2027" }],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "01", AdCollegeName: "كلية التربية الأساسية" }],
    sections: [
      { AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم أ" },
      { AdSectionId: 12, AdCollegeId: 1, AdSectionCode: "10", AdSectionName: "قسم ب" },
    ],
    instructors: [{ AdInstructorId: 7, AdInstructorName: "أحمد علي", AdInstructorCivil: "280010100001" }, { AdInstructorId: 8, AdInstructorName: "سارة محمد", AdInstructorCivil: "280010100002" }],
    rooms: [], courseTransitions: [],
    courses: [
      { AdCourseId: 301, AdCollegeId: 1, AdSectionId: 11, CourseCode: "105", CourseName: "أسس التعلم", CourseCredit: 3, CourseHours: 3, MaxStudent: 40 },
      { AdCourseId: 302, AdCollegeId: 1, AdSectionId: 11, CourseCode: "106", CourseName: "تصميم التعليم", CourseCredit: 3, CourseHours: 3, MaxStudent: 40 },
    ],
    schedules: live,
    scheduleVersions: versions,
    curriculumPlans: [], curriculumPlanCourses: [],
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  const { registerWhatChangedRoutes } = await import("../src/server/routes/whatChangedRoutes");
  await initDatabase();
  console.warn = quiet;
  await Repository.saveScheduleApproval({ scopeKey: "1:11:5", AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, status: "submitted", currentRound: 1, rounds: [{ number: 1, submittedAt: iso(2), reviewedVersionId: "v2" }], signatures: [], pendingAdditions: [], revision: 0 } as any);

  const USERS: Record<string, any> = {
    admin: { user: { SystemUserId: 1, Role: "committeeChair", Name: "المدير", IsAdminUser: true }, scopes: [], permissions: [7] },
    chair: { user: { SystemUserId: 2, Role: "committeeChair", Name: "رئيس اللجنة", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [7] },
    noPermission: { user: { SystemUserId: 3, Role: "committeeChair", Name: "بلا صلاحية", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [] },
    head: { user: { SystemUserId: 4, Role: "departmentHead", Name: "رئيس القسم", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [7] },
    registrar: { user: { SystemUserId: 5, Role: "registrarStaff", Name: "موظف التسجيل", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [7] },
    teacher: { user: { SystemUserId: 6, Role: "instructor", Name: "أستاذ", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [] },
    otherChair: { user: { SystemUserId: 7, Role: "committeeChair", Name: "قسمٌ آخر", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 12 }], permissions: [7] },
  };
  const app = express();
  app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; req.permissions = who.permissions; } next(); });
  registerWhatChangedRoutes(app);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (who: string | null, query: Record<string, string | number>) => {
    const qs = new URLSearchParams(Object.entries({ collegeId: 1, sectionId: 11, termId: 5, ...query }).map(([k, v]) => [k, String(v)]));
    const res = await fetch(`${base}/api/schedules/what-changed?${qs}`, { headers: who ? { "x-who": who } : {} });
    return { status: res.status, json: await res.json().catch(() => ({})) as any, text: "" };
  };
  const fileHash = () => crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, "db.json"))).digest("hex");
  const state = async () => JSON.stringify({
    schedules: await Repository.getSchedulesByScope({ collegeId: 1, sectionId: 11, termId: 5 }),
    versions: await Repository.getScheduleVersions(1, 11, 5, 100),
    approval: await Repository.getScheduleApproval(1, 11, 5),
  });

  try {
    const before = await state();
    const beforeFile = fileHash();
    const since = iso(4);

    check((await get(null, { from: since })).status === 401, "بلا دخول: ٤٠١");
    check((await get("noPermission", { from: since })).status === 403, "بلا النموذج 7: ٤٠٣");
    check((await get("teacher", { from: since })).status === 403, "الأستاذ لا يراها: ٤٠٣");
    const registrar = await get("registrar", { from: since });
    check(registrar.status === 403 && registrar.json.readOnly === true, "صفةُ اطّلاع (التسجيل) ولو حملت النموذج 7: ٤٠٣", registrar);
    check((await get("head", { from: since })).status === 403, "رئيس القسم (اطّلاع): ٤٠٣");
    check((await get("otherChair", { from: since })).status === 403, "قسمٌ خارج النطاق: ٤٠٣");
    check((await get("chair", { from: since, termId: 0 })).status === 400, "بلا فصل: ٤٠٠");
    check((await get("chair", { from: "not-a-date" })).status === 400, "وقتٌ غير صالح: ٤٠٠");
    check((await get("admin", { from: since, sectionId: 99 })).status === 404, "قسمٌ غير موجود: ٤٠٤");

    const all = await get("chair", { from: since });
    check(all.status === 200, "رئيس اللجنة في نطاقه: ٢٠٠", all);
    const byId = new Map((all.json.entries || []).map((entry: any) => [entry.scheduleId, entry]));
    const first: any = byId.get(9001), second: any = byId.get(9002);
    check(all.json.counts?.total === 2 && first?.tags.join() === "moved,room" && second?.tags.join() === "instructor", "الصافي: 9001 نُقل وقاعته، و9002 أستاذه", all.json.entries);
    check(first?.before?.start === "09:00" && first?.after?.start === "10:00" && second?.after?.instructor === "سارة محمد", "قبل وبعد بالأسماء", { first, second });
    check(first?.by.join() === "أحمد" && second?.by.join() === "سارة", "من عدّل كلَّ شعبة", { first: first?.by, second: second?.by });
    check(all.json.steps?.length === 3 && all.json.steps[0].by === "سارة", "كل الخطوات: ثلاث، الأحدث أولاً (لقطة الإرسال ليست خطوة)", all.json.steps);
    check(!JSON.stringify(all.json).includes("280010100001"), "لا رقم مدنيّ في الردّ");

    const sent = await get("chair", { from: "lastSend" });
    check(sent.status === 200 && sent.json.period?.kind === "lastSend" && sent.json.counts?.total === 2, "منذ آخر إرسال: من نسخة الإرسال إلى الآن", sent.json);
    check(sent.json.entries.find((entry: any) => entry.scheduleId === 9001)?.tags.join() === "moved", "وما قبل الإرسال (القاعة) لا يُحسب", sent.json.entries);

    const recent = await get("chair", { from: iso(0.75) });
    check(recent.status === 200 && recent.json.counts?.total === 1 && recent.json.entries[0].scheduleId === 9002, "وقتٌ مختار: آخر تعديلٍ وحده", recent.json);

    const future = await get("chair", { from: iso(-1) });
    check(future.status === 200 && future.json.counts?.total === 0 && future.json.entries.length === 0, "فترةٌ بلا لقطات: لا تعديلات", future.json);
    const today = await get("chair", {});
    check(today.status === 200 && today.json.period?.kind === "time", "بلا «from»: اليوم افتراضاً", today.json.period);

    check(await state() === before && fileHash() === beforeFile, "قراءةٌ محضة: الجداول والنُّسخ والاعتماد وملفُّ القاعدة كما كانت");
    await Repository.saveScheduleApproval({ scopeKey: "1:11:5", AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, status: "draft", currentRound: 0, rounds: [], signatures: [], pendingAdditions: [], revision: 1 } as any);
    const never = await get("chair", { from: "lastSend" });
    check(never.status === 200 && never.json.notSent === true && never.json.entries.length === 0, "لم يُرسل بعد: يُقال صراحةً", never.json);

  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
