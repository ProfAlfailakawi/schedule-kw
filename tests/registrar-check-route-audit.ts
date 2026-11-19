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
    registrar: { user: { SystemUserId: 4, Role: "registrarStaff", Name: "موظف التسجيل", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [] },
    otherRegistrar: { user: { SystemUserId: 5, Role: "registrarStaff", Name: "تسجيل قسم آخر", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 12 }], permissions: [] },
    teacher: { user: { SystemUserId: 6, Role: "instructor", Name: "أستاذ", IsAdminUser: false }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [] },
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
  const call = async (method: string, url: string, who: string | null, body?: unknown) => {
    const res = await fetch(`${base}${url}`, { method, headers: { "content-type": "application/json", ...(who ? { "x-who": who } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
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
    const notCarried = (found.json.findings || []).filter((item: any) => item.group === "notSent");
    check(notCarried.length === 1 && notCarried[0].fields[0].field === "time" && notCarried[0].fields[0].was === "08:00–09:15" && notCarried[0].fields[0].ours === "09:00–10:15", "تعديل بعد الإرسال ما زال الملف على قديمه: «لم يُرسل بعد»", found.json.findings);
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

    /* ── طلبُ التعديل للتسجيل: حفظٌ وقراءةٌ وشطبٌ وتحققٌ وحذف ── */
    const fileRows = [pdfRow("105", "1", "08:00", "09:15"), pdfRow("106", "1", "11:00", "12:15", { AdRoomHall: "Z9" }), pdfRow("999", "1", "13:00", "14:15")];
    const R = "/api/schedules/registrar-requests";
    check((await call("POST", R, null, { ...body, rows: fileRows })).status === 401, "حفظ الطلب بلا دخول: ٤٠١");
    check((await call("POST", R, "noPermission", { ...body, rows: fileRows })).status === 403, "حفظ الطلب بلا النموذج 7: ٤٠٣");
    check((await call("POST", R, "registrar", { ...body, rows: fileRows })).status === 403, "التسجيل لا يحفظ طلباً باسم القسم: ٤٠٣");
    check((await call("POST", R, "head", { ...body, sectionId: 12, rows: fileRows })).status === 403, "حفظ طلبٍ لقسمٍ خارج النطاق: ٤٠٣");
    const saved = await call("POST", R, "head", { ...body, fileName: "جدول.pdf", rows: fileRows });
    const doc = saved.json.request;
    check(saved.status === 200 && doc?.items?.length >= 2 && doc.round === 2 && doc.fileName === "جدول.pdf", "حفظ الطلب: بنودٌ وجولةُ الاعتماد الجارية واسم الملف", saved.json);
    check(!JSON.stringify(doc).match(/Civil|civil/), "لا رقمَ مدنيّاً في الطلب المحفوظ");
    check(doc.items.some((item: any) => item.action === "delete") && doc.items.some((item: any) => item.action === "edit"), "البنود: عدّلوا واحذفوا", doc.items);

    const listQ = `${R}?collegeId=1&sectionId=11&termId=5`;
    check((await call("GET", listQ, null)).status === 401, "قراءة الطلبات بلا دخول: ٤٠١");
    check((await call("GET", listQ, "teacher")).status === 403, "الأستاذ لا يرى طلبات التعديل: ٤٠٣");
    check((await call("GET", listQ, "otherRegistrar")).status === 403, "تسجيلُ قسمٍ آخر لا يرى طلبات هذا القسم: ٤٠٣");
    const listed = await call("GET", listQ, "head");
    check(listed.status === 200 && listed.json.requests?.length === 1 && listed.json.canTick === false, "القسم يقرأ طلبه ولا يشطب", listed.json);
    const listedRegistrar = await call("GET", listQ, "registrar");
    check(listedRegistrar.status === 200 && listedRegistrar.json.canTick === true, "التسجيل يقرأ طلب القسم ويشطب", listedRegistrar.json);

    check((await call("GET", `${R}/inbox?termId=5`, "head")).status === 403, "وارد الطلبات للتسجيل وحده: ٤٠٣ للقسم");
    const inbox = await call("GET", `${R}/inbox?termId=5`, "registrar");
    check(inbox.status === 200 && inbox.json.requests?.length === 1 && inbox.json.requests[0].progress.total === doc.items.length && inbox.json.requests[0].progress.done === 0, "وارد التسجيل: بطاقةٌ للقسم بتقدّمها", inbox.json);
    const inboxOther = await call("GET", `${R}/inbox?termId=5`, "otherRegistrar");
    check(inboxOther.status === 200 && inboxOther.json.requests.length === 0, "تسجيلُ قسمٍ آخر لا يرى بطاقته", inboxOther.json);

    const tickUrl = `${R}/${encodeURIComponent(doc.id)}/tick`;
    const target = doc.items.find((item: any) => item.action === "edit" && item.fields.some((f: any) => f.field === "room"));
    check((await call("POST", tickUrl, null, { itemId: target.id })).status === 401, "الشطب بلا دخول: ٤٠١");
    check((await call("POST", tickUrl, "head", { itemId: target.id })).status === 403, "القسم لا يشطب بنود طلبه: ٤٠٣");
    check((await call("POST", tickUrl, "otherRegistrar", { itemId: target.id })).status === 403, "تسجيلُ قسمٍ آخر لا يشطب: ٤٠٣");
    check((await call("POST", tickUrl, "registrar", { itemId: "edit:#nope" })).status === 404, "بندٌ غير موجود: ٤٠٤");
    const ticked = await call("POST", tickUrl, "registrar", { itemId: target.id, done: true });
    const tickedItem = ticked.json.request?.items?.find((item: any) => item.id === target.id);
    check(ticked.status === 200 && tickedItem?.done?.byName === "موظف التسجيل" && typeof tickedItem.done.at === "string", "الشطب «نُفّذ» باسم الموظف ووقته", ticked.json);
    const untick = await call("POST", tickUrl, "registrar", { itemId: target.id, done: false });
    check(untick.status === 200 && !untick.json.request.items.find((item: any) => item.id === target.id).done, "رفع الشطب");
    await call("POST", tickUrl, "registrar", { itemId: target.id, done: true });

    /* الملف التالي: القاعة صُحّحت ⇒ البند المشطوب «تأكّد». */
    check((await call("POST", `${R}/verify`, "registrar", { ...body, rows: fileRows })).status === 403, "التحقق الذاتي للقسم (النموذج 7): ٤٠٣ للتسجيل");
    const verify = await call("POST", `${R}/verify`, "head", { ...body, rows: [pdfRow("105", "1", "08:00", "09:15"), pdfRow("106", "1", "11:00", "12:15"), pdfRow("999", "1", "13:00", "14:15")] });
    check(verify.status === 200 && verify.json.confirmed === 1 && verify.json.reopened === 0, "ملفٌّ يُثبت البند المشطوب: «تأكّد»", verify.json);
    const afterVerify = await call("GET", listQ, "head");
    check(afterVerify.json.requests[0].items.find((item: any) => item.id === target.id)?.state === "confirmed", "والحالُ محفوظة");

    const delUrl = `${R}/${encodeURIComponent(doc.id)}`;
    check((await call("DELETE", delUrl, null)).status === 401, "الحذف بلا دخول: ٤٠١");
    check((await call("DELETE", delUrl, "registrar")).status === 403, "التسجيل لا يحذف طلب القسم: ٤٠٣");
    check((await call("DELETE", delUrl, "head")).status === 200 && (await call("GET", listQ, "head")).json.requests.length === 0, "القسم يحذف طلبه");

    check(await state() === before, "الطلبات لا تمسّ الجداول ولا النُّسخ ولا الاعتماد");
  } finally {
    server.close();
  }

  /* حارسٌ على قارئ PDF: readOnly=1 يتخطّى تسجيل مواقع الفرع في سجلّ المباني. */
  const reader = fs.readFileSync("src/server/routes/pdfImportRoutes.ts", "utf8");
  check(/const readOnly=String\(req\.query\.readOnly\|\|""\)==="1";/.test(reader) && /const dryRun=readOnly\|\|/.test(reader), "القارئ يعرف readOnly ويجعله تجربةً بلا حفظ");
  check(/if\(!readOnly\)provisioned=await provisionBranchSiteLocationsFromAuthority\(/.test(reader), "readOnly لا يسجّل مواقع الفرع في سجلّ المباني");
  const route = fs.readFileSync("src/server/routes/scheduleImportRoutes.ts", "utf8");
  const handler = route.slice(route.indexOf('app.post("/api/schedules/registrar-check"'), route.indexOf("Carry a whole term out"))
    + route.slice(route.indexOf("function registrarCheckScope"), route.indexOf("/** طلباتُ التعديل للتسجيل"));
  check(handler.length > 200 && !/Repository\.(create|update|save|delete|upsert|set|insert|add|remove|wipe|copy)/.test(handler) && !/noteScheduleMutation/.test(handler), "مسار الفحص لا يستدعي أيّ كتابة");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
