/**
 * ── الطلب الفعلي: تقرير التسجيل SWRDASH (src/utils/actualDemand.ts · src/server/actualDemand.ts) ──
 *
 *  P1  النسخة العامة الحقيقية (وحدات متبقية 1–300): القسم والفصل والأعضاء والنصاب، وخمسون مقرراً،
 *      وأرقامٌ بعينها (0109105، 0109108 بلا شعبة، 0109114 بخلية مقترحة فارغة)، والبرامج تجمع المجموع.
 *  P2  نسخة الخريجين الحقيقية (1–30): تُقرأ بالقاعدة نفسها، وأعدادها أصغر.
 *  P3  الملفان بلا بيانات شخصية: لا رقم مدني ولا اسم طالب — أعدادٌ وبرامج فقط.
 *  P4  ما ليس SWRDASH يُرفض برسالة، والنسخة تُخمَّن من اسم الملف.
 *  M1  المطابقة بالرقم وحده في كل عضوٍ من العائلة، والربط المحفوظ والتجاهل.
 *  M2  عضوان بمفتاحين مختلفين (0109 و0209): الرقم يُقرأ بمفتاح كل عضو.
 *  M3  الربط اليدوي هويةٌ للعائلة: الرمز القصير والكامل يلتقيان.
 *  A1  التنبيه الأحمر: طلبٌ كبير بلا شعبة في جدولنا، والخريجون أولاً.
 *  H2  بعد الرفع: نسبة خدمة الطلب والقائمة بالأشد والحقائق من الجدول الحيّ.
 *  H1  خادمٌ حيّ (تجربة): القراءة بلا حفظ، ثم الحفظ، ثم القراءة، والصلاحية، والربط، وسجلّ التدقيق.
 */
import fs from "node:fs";
import { extractDemandItems } from "../src/server/actualDemand";
import {
  demandAlerts, demandDepartmentMatches, demandLinkIdentity, demandName, demandTermMatches, guessDemandVariant, matchDemandCourses, parseDemandReport, DemandReportError,
  type DemandReport,
} from "../src/utils/actualDemand";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};
const GENERAL = "tests/fixtures/actual-demand/swrdash-general-0109.pdf";
const GRADUATES = "tests/fixtures/actual-demand/swrdash-graduates-0109.pdf";

let server: LiveServer | null = null;
async function main() {
  /* P1 */
  const general = parseDemandReport(await extractDemandItems(fs.readFileSync(GENERAL)));
  check(general.department === "تكنولوجيا التعليم" && general.facultyCount === 26 && general.legalLoad === 256, "P1 القسم وعدد الأعضاء ومجموع النصاب من الترويسة", general);
  check(/الثاني/.test(general.termLabel) && /2026/.test(general.termLabel) && /2027/.test(general.termLabel), "P1 الفصل كما طُبع", general.termLabel);
  check(general.courses.length === 50, "P1 خمسون مقرراً في تسع صفحات", general.courses.length);
  check(general.courses.every(course => /^0109\d{3}$/.test(course.code)), "P1 كل رقمٍ بسبع خانات (المادة + المقرر)");
  const c105 = general.courses.find(course => course.code === "0109105")!;
  check(c105?.name === "أسس تكنولوجيا التعلم" && c105.units === 3 && c105.offered.boys === 2 && c105.offered.girls === 2
    && c105.average.boys === 70 && c105.average.girls === 75 && c105.students.total === 218 && c105.students.girls === 125 && c105.students.boys === 93
    && c105.suggested.total === 4 && c105.programs.length === 1 && c105.programs[0].code === "BA-0115", "P1 0109105: الوحدات والشعب والمتوسط والطلبة والمقترح والبرنامج في أعمدتها", c105);
  const c108 = general.courses.find(course => course.code === "0109108")!;
  check(c108?.students.total === 458 && c108.offered.boys + c108.offered.girls === 0 && c108.suggested.total === 0, "P1 0109108: ٤٥٨ طالباً بلا شعبة مطروحة ولا مقترح", c108);
  const c107 = general.courses.find(course => course.code === "0109107")!;
  check(c107?.students.total === 2443 && c107.programs.length === 12, "P1 0109107: برامجه الاثنا عشر على أسطرها", c107?.programs.length);
  check(general.courses.every(course => course.programs.reduce((sum, program) => sum + program.total, 0) === course.students.total), "P1 البرامج تجمع مجموع كل مقرر", general.warnings);
  check(general.courses.every(course => course.students.boys + course.students.girls === course.students.total), "P1 البنون والبنات يجمعان المجموع في كل مقرر");
  check(general.warnings.length === 0, "P1 بلا تحذيرات حسابية", general.warnings);
  check(general.courses.find(course => course.code === "0109148")?.name === "مبادىء التصوير الضوئى (1)", "P1 الأقواس المعكوسة تُصحَّح", general.courses.find(course => course.code === "0109148")?.name);
  check(demandName("حلقه بحث)تكنولوجيا التعليم (") === "حلقه بحث (تكنولوجيا التعليم)", "P1 قوسان حول كلمتين");

  /* P2 */
  const grads = parseDemandReport(await extractDemandItems(fs.readFileSync(GRADUATES)));
  check(grads.department === "تكنولوجيا التعليم" && grads.courses.length > 10 && grads.warnings.length === 0, "P2 نسخة الخريجين تُقرأ بلا تحذيرات", { n: grads.courses.length, w: grads.warnings });
  const g114 = grads.courses.find(course => course.code === "0109114");
  check(Boolean(g114) && g114!.suggested.total === 1 && g114!.suggested.boys === 1 && g114!.suggested.girls === 0, "P2 0109114: خلية بنات المقترحة الفارغة صفرٌ لا إزاحة", g114?.suggested);
  const sum = (report: DemandReport) => report.courses.reduce((total, course) => total + course.students.total, 0);
  check(sum(grads) < sum(general), "P2 الخريجون أقل من العام");

  /* P3 */
  const text = [general, grads].flatMap(report => report.courses.flatMap(course => [course.name, ...course.programs.map(program => program.name)])).join(" ");
  check(!/\d{12}/.test(JSON.stringify([general, grads])) && !/طالب\s*:/.test(text), "P3 لا رقم مدني ولا اسم طالب في الملفين");

  /* P4 */
  let refused = "";
  try { parseDemandReport([[{ str: "جدول آخر", x: 10, y: 10, w: 20 }]]); } catch (error) { refused = error instanceof DemandReportError ? error.message : ""; }
  check(/SWRDASH/.test(refused), "P4 ملفٌ آخر يُرفض باسم التقرير", refused);
  check(guessDemandVariant("دراسة احصائيات - وحدات متبقية من  1 ل 30- تكنولوجيا تعليم.pdf") === "graduates"
    && guessDemandVariant("دراسة احصائيات - وحدات متبقية من 1 ل 300 - تكنولوجيا تعليم.pdf") === "general", "P4 النسخة من اسم الملف: 30 خريجون و300 عام");
  check(demandTermMatches(general.termLabel, "الفصل الثاني 2026/2027") === true && demandTermMatches(general.termLabel, "الفصل الأول 2026/2027") === false, "P4 فصل التقرير يُقارن بالموسم والسنتين");
  check(demandDepartmentMatches("تكنولوجيا التعليم", "تكنولوجيا التعليم") && !demandDepartmentMatches("التربية الفنية", "تكنولوجيا التعليم"), "P4 القسم يُقارن بمفتاح العائلة");

  /* M1 */
  const members = [{ collegeId: 11, sectionId: 101, departmentKey: "0109" }, { collegeId: 12, sectionId: 201, departmentKey: "0109" }];
  const catalogue = [
    { AdCourseId: 1, AdSectionId: 101, AdCollegeId: 11, CourseCode: "105", CourseName: "أسس تكنولوجيا التعلم" },
    { AdCourseId: 2, AdSectionId: 201, AdCollegeId: 12, CourseCode: "0109105", CourseName: "أسس تكنولوجيا التعلم" },
    { AdCourseId: 3, AdSectionId: 101, AdCollegeId: 11, CourseCode: "777", CourseName: "مقرر قديم" },
    { AdCourseId: 4, AdSectionId: 201, AdCollegeId: 12, CourseCode: "777", CourseName: "مقرر قديم" },
    { AdCourseId: 5, AdSectionId: 999, AdCollegeId: 13, CourseCode: "108", CourseName: "قسم آخر" },
  ];
  const matched = matchDemandCourses([{ code: "0109105" }, { code: "0109108" }, { code: "0109199" }, { code: "0109300" }], catalogue, members,
    { "0109199": { courseCode: "777" }, "0109300": { ignore: true } });
  check(matched[0].status === "matched" && matched[0].courseIds.join() === "1,2", "M1 الرقم يطابق نسخة البنين (105) والبنات (0109105)", matched[0]);
  check(matched[1].status === "unmatched" && !matched[1].courseIds.length, "M1 مقررُ قسمٍ آخر لا يُطابَق لأنه خارج العائلة", matched[1]);
  check(matched[2].status === "linked" && matched[2].courseIds.join() === "3,4" && matched[3].status === "ignored", "M1 الربط المحفوظ يمتد للعائلة، والتجاهل يُحترم", matched.slice(2));
  /* M2: عضوان بمفتاحين مختلفين (0109 و0209): الرقمُ يُقرأ بمفتاح كل عضو، والقسمُ والمقررُ هويةٌ واحدة. */
  const split = [{ collegeId: 11, sectionId: 101, departmentKey: "0109" }, { collegeId: 21, sectionId: 301, departmentKey: "0209" }];
  const splitCatalogue = [
    { AdCourseId: 11, AdSectionId: 101, AdCollegeId: 11, CourseCode: "105", CourseName: "أسس تكنولوجيا التعلم" },
    { AdCourseId: 12, AdSectionId: 301, AdCollegeId: 21, CourseCode: "105", CourseName: "أسس تكنولوجيا التعلم" },
    { AdCourseId: 13, AdSectionId: 301, AdCollegeId: 21, CourseCode: "0209110", CourseName: "مقدمة في الكمبيوتر التعليمي" },
    { AdCourseId: 14, AdSectionId: 101, AdCollegeId: 11, CourseCode: "777", CourseName: "مقرر قديم" },
    { AdCourseId: 15, AdSectionId: 301, AdCollegeId: 21, CourseCode: "0209777", CourseName: "مقرر قديم" },
  ];
  const across = matchDemandCourses([{ code: "0109105" }, { code: "0109110" }, { code: "0109199" }, { code: "0109198" }], splitCatalogue, split,
    { "0109199": { courseCode: "777" }, "0109198": { courseCode: "0209777" } });
  check(across[0].status === "matched" && across[0].courseIds.join() === "11,12", "M2 0109105 يطابق 105 تحت 0109 و105 تحت 0209", across[0]);
  check(across[1].status === "matched" && across[1].courseIds.join() === "13", "M2 0109110 يطابق 0209110 الكامل في الفرع الآخر", across[1]);
  check(across[2].status === "linked" && across[2].courseIds.join() === "14,15" && across[3].status === "linked" && across[3].courseIds.join() === "14,15",
    "M3 الربط اليدوي هويةٌ للعائلة: القصير (777) والكامل (0209777) يلتقيان في النسختين", across.slice(2));
  check(demandLinkIdentity("105") === "105" && demandLinkIdentity("0109105") === "105" && demandLinkIdentity("114101") === "101", "M3 هوية الربط: آخر ثلاث خانات من الرمز القصير أو الكامل");

  /* A1 */
  const matches = new Map(matchDemandCourses(general.courses, catalogue, members).map(match => [match.code, match] as const));
  const alerts = demandAlerts({ general, graduates: grads, matches, scheduledSections: new Map([[1, 2]]) });
  check(!alerts.some(alert => alert.code === "0109105"), "A1 مقررٌ له شعبٌ في جدولنا لا يُنبَّه عليه", alerts.slice(0, 3));
  check(alerts.some(alert => alert.code === "0109108" && alert.students === 458), "A1 0109108 بلا شعبة: تنبيهٌ أحمر بعدد طلبته");
  const firstPlain = alerts.findIndex(alert => alert.graduates === 0);
  check(firstPlain === -1 || alerts.slice(firstPlain).every(alert => alert.graduates === 0), "A1 الخريجون أولاً ثم الأكثر طلبة");
  check(alerts.every(alert => alert.students >= 20 || alert.graduates > 0), "A1 لا تنبيه لطلبٍ دون شعبةٍ واحدة إلا للخريجين");

  /* H1 */
  server = await startDemoServer("actual-demand");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  const call = (url: string, init: RequestInit & { raw?: Buffer } = {}) => fetch(BASE + url, {
    ...init, body: init.raw ?? init.body, redirect: "manual",
    headers: { cookie, origin: BASE, ...(init.raw ? { "content-type": "application/octet-stream" } : init.body ? { "content-type": "application/json" } : {}) },
  });
  const terms = await (await call("/api/terms")).json().catch(() => []);
  const second = (Array.isArray(terms) ? terms : []).find((term: any) => /الثاني/.test(term.AdTermName) && /2026/.test(term.AdTermName));
  const termId = Number(second?.AdTermId || 2);
  const q = `collegeId=1&sectionId=1&termId=${termId}`;
  const empty = await (await call(`/api/actual-demand?${q}`)).json();
  check(!empty.variants?.general && !empty.alerts?.length && empty.family?.name === "تكنولوجيا التعليم", "H1 قبل الرفع: لا تقرير ولا تنبيه، والعائلة باسمها", empty);
  const pdf = fs.readFileSync(GENERAL);
  const preview = await call(`/api/actual-demand/upload?${q}&variant=general`, { method: "POST", raw: pdf });
  const previewBody = await preview.json();
  check(preview.status === 200 && previewBody.preview?.courses === 50 && previewBody.preview.departmentMatches === true && previewBody.preview.termMatches === true, "H1 القراءة بلا حفظ: القسم والفصل مطابقان", previewBody);
  check(previewBody.preview?.matched >= 30, "H1 أغلب مقررات التقرير تطابق كتالوج القسم التجريبي بالرقم", previewBody.preview);
  const still = await (await call(`/api/actual-demand?${q}`)).json();
  check(!still.variants?.general, "H1 القراءة لم تحفظ شيئاً");
  const saved = await call(`/api/actual-demand/upload?${q}&variant=general&commit=1`, { method: "POST", raw: pdf });
  const savedBody = await saved.json();
  check(saved.status === 200 && savedBody.reading?.variants?.general?.courses === 50 && savedBody.reading.history?.length === 1 && savedBody.reading.history[0].hash?.length === 64, "H1 الحفظ: النسخة العامة وسجلّ الرفع ببصمة الملف", savedBody.reading?.history);
  check(Array.isArray(savedBody.reading?.alerts) && savedBody.reading.alerts.every((alert: any) => /^\d{7}$/.test(alert.code)), "H1 التنبيهات بأرقام سبعة", savedBody.reading?.alerts?.slice(0, 3));
  const service = savedBody.reading?.service;
  check(typeof service?.general === "number" && service.general >= 0 && service.general <= 100 && service.graduates === null, "H2 «نسبة خدمة الطلب» من الجدول الحيّ (٠–١٠٠)، ولا نسبة خريجين قبل رفع نسختهم", service);
  const items = savedBody.reading?.supply || [];
  check(items.length > 0 && items.every((item: any) => /^\d{7}$/.test(item.code) && Array.isArray(item.branches)) && Object.keys(savedBody.reading?.facts || {}).length > 0,
    "H2 القائمة بالأشد بأرقام سبعة وحقائق كل مقرر للشارة والحذف", items.slice(0, 2));
  const wrongTerm = Number((Array.isArray(terms) ? terms : []).find((term: any) => Number(term.AdTermId) !== termId)?.AdTermId || 0);
  if (wrongTerm) {
    const refusedSave = await call(`/api/actual-demand/upload?collegeId=1&sectionId=1&termId=${wrongTerm}&variant=general&commit=1`, { method: "POST", raw: pdf });
    check(refusedSave.status === 409, "H1 فصلٌ غير فصل الملف لا يُحفظ بلا تأكيد", refusedSave.status);
  }
  const notPdf = await call(`/api/actual-demand/upload?${q}&variant=general`, { method: "POST", raw: Buffer.from("hello") });
  check(notPdf.status === 422, "H1 ما ليس PDF يُرفض", notPdf.status);
  const noScope = await call(`/api/actual-demand?collegeId=1&termId=${termId}`);
  check(noScope.status === 400, "H1 بلا قسمٍ لا قراءة", noScope.status);
  const anonymous = await fetch(`${BASE}/api/actual-demand?${q}`);
  check(anonymous.status === 401 || anonymous.status === 403, "H1 بلا دخولٍ لا قراءة", anonymous.status);
  const unmatched = savedBody.reading?.unmatched?.[0];
  if (unmatched) {
    const target = savedBody.reading.catalogue?.[0];
    const linked = await call("/api/actual-demand/link", { method: "POST", body: JSON.stringify({ collegeId: 1, sectionId: 1, termId, code: unmatched.code, ignore: true }) });
    const linkedBody = await linked.json();
    check(linked.status === 200 && !linkedBody.unmatched.some((row: any) => row.code === unmatched.code), "H1 «لا يخص القسم» يُحفظ ويُخرج المقرر من القائمة", linkedBody.unmatched?.slice(0, 2));
    check(Boolean(target), "H1 قائمة الربط من كتالوج العائلة بأرقام سبعة", target);
  }
  const audit = await (await call("/api/audit-logs?limit=20")).json().catch(() => null);
  const rows = Array.isArray(audit) ? audit : Array.isArray(audit?.rows) ? audit.rows : Array.isArray(audit?.logs) ? audit.logs : [];
  check(!rows.length || rows.some((row: any) => /الطلب الفعلي/.test(String(row.changes || ""))), "H1 الحفظ في سجلّ التدقيق", rows.slice(0, 2));
}

main().catch(error => { failed++; console.error(error); }).finally(async () => {
  await server?.stop();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
