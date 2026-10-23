/**
 * مسح جدول فصلٍ واحد لقسمٍ واحد في كليةٍ واحدة — وبلا شيءٍ سواه.
 *
 * يمسح صفوف الجدول (مواعيد الشعب) لنطاقٍ واحد: كلية + قسم + فصل. لا يمسّ القسم ولا
 * مقرراته ولا أساتذته ولا فصلاً آخر ولا المسودات والاعتمادات والطلبات (تبقى كما هي)،
 * ولا أقسام الفرع الشقيقة (بنات/الجهراء/الفحيحيل). قاعدة SCHEDULE الحية بلا PITR ولا
 * حماية حذف (scripts/firestore-backup.md)، فالمسح نهائي: لذا يُكتب ملف JSON احتياطي أولاً
 * ويُتحقَّق من قراءته قبل أي حذف، ويمكن إرجاعه بـ --restore.
 *
 * معاينة (لا تحذف شيئاً — الافتراضي):
 *   FIREBASE_PROJECT_ID=... FIREBASE_DATABASE_ID=... npx tsx scripts/clear-term-schedule.ts
 *   (يُحسم النطاق بالاسم: تكنولوجيا التعليم · التربية بنين · الفصل الثاني 2026/2027؛ ويقف إن لم يُحسم
 *    بنتيجة واحدة، أو مرّر --college-id --section-id --term-id صراحةً.)
 * تنفيذ (بعد مراجعة المعاينة):
 *   ... npx tsx scripts/clear-term-schedule.ts --apply --expect-rows <عدد المعاينة>
 * إرجاع (إلى نطاقٍ فارغ فقط):
 *   ... npx tsx scripts/clear-term-schedule.ts --restore <ملف.json> --apply
 */
import fs from "fs";
import path from "path";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const option = (name: string) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const apply = flag("--apply");
const restoreFile = option("--restore");
const backupDir = option("--backup-dir") || "schedule-backups";

const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();
if (!projectId || !databaseId) throw new Error("حدّد FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID صراحةً.");
process.env.DATA_MODE = "firestore";

const { initDatabase, Repository } = await import("../src/db/repository");
await initDatabase();

const fold = (value: unknown) => String(value || "").normalize("NFKC").replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[أإآ]/g, "ا").replace(/\s+/g, " ").trim();
const fail = (message: string): never => { console.error(`✗ ${message}`); process.exit(1); };

const [colleges, sections, terms] = await Promise.all([Repository.getColleges(), Repository.getSections(), Repository.getTerms()]);

/* ── النطاق: بالأرقام إن مُرِّرت، وإلا بالاسم وبنتيجةٍ واحدة فقط ── */
const pick = <T,>(label: string, list: T[], describe: (row: T) => string): T => {
  if (list.length === 1) return list[0];
  console.error(`✗ ${label}: ${list.length ? `${list.length} نتائج، حدّد بالرقم صراحةً` : "لا نتيجة"}`);
  for (const row of list) console.error(`   · ${describe(row)}`);
  return process.exit(1);
};
const idOption = (name: string) => { const value = Number(option(name) || 0); return Number.isInteger(value) && value > 0 ? value : 0; };

const collegeId = idOption("--college-id"), sectionId = idOption("--section-id"), termId = idOption("--term-id");
const college = pick("الكلية", colleges.filter(row => collegeId ? Number(row.AdCollegeId) === collegeId : (/التربيه|التربية/.test(fold(row.AdCollegeName)) && /بنين/.test(fold(row.AdCollegeName)))), row => `${row.AdCollegeId} · ${row.AdCollegeName}`);
const section = pick("القسم", sections.filter(row => Number(row.AdCollegeId) === Number(college.AdCollegeId) && (sectionId ? Number(row.AdSectionId) === sectionId : /تكنولوجيا التعليم/.test(fold(row.AdSectionName)))), row => `${row.AdSectionId} · ${row.AdSectionName}`);
const term = pick("الفصل", terms.filter(row => termId ? Number(row.AdTermId) === termId : (/الثاني|الثانى/.test(fold(row.AdTermName)) && /2026/.test(fold(row.AdTermName)) && /2027/.test(fold(row.AdTermName)))), row => `${row.AdTermId} · ${row.AdTermName}`);
const scope = { collegeId: Number(college.AdCollegeId), sectionId: Number(section.AdSectionId), termId: Number(term.AdTermId) };
if (Number(section.AdCollegeId) !== scope.collegeId) fail("القسم لا يتبع الكلية المحددة.");

console.log(JSON.stringify({
  mode: restoreFile ? (apply ? "restore" : "restore-dry-run") : (apply ? "apply" : "dry-run"), projectId, databaseId,
  college: `${college.AdCollegeId} · ${college.AdCollegeName}`, section: `${section.AdSectionId} · ${section.AdSectionName}`, term: `${term.AdTermId} · ${term.AdTermName}`,
}, null, 2));
const siblings = sections.filter(row => fold(row.AdSectionName) === fold(section.AdSectionName) && Number(row.AdSectionId) !== scope.sectionId);
if (siblings.length) console.log(`ℹ أقسام بالاسم نفسه في كلياتٍ أخرى — لا تُمسّ: ${siblings.map(row => `${row.AdCollegeId}:${row.AdSectionId}`).join("، ")}`);

const rows = await Repository.getSchedulesByScope(scope);
const stray = rows.filter(row => Number(row.AdTermId) !== scope.termId);
if (stray.length) fail(`${stray.length} صفاً من فصلٍ آخر ضمن القراءة؛ توقف التنفيذ.`);

/* ── إرجاع ── */
if (restoreFile) {
  const saved = JSON.parse(fs.readFileSync(restoreFile, "utf8"));
  const same = saved?.scope && ["collegeId", "sectionId", "termId"].every(key => Number(saved.scope[key]) === (scope as any)[key]);
  if (!same || !Array.isArray(saved.rows)) fail("الملف لا يخص هذا النطاق أو ليس نسخة صالحة.");
  if (rows.length) fail(`النطاق غير فارغ (${rows.length} صف)؛ لا يُرجَع فوق بيانات.`);
  console.log(`سيُعاد ${saved.rows.length} صفاً.`);
  if (!apply) { console.log("معاينة فقط. أضف --apply للتنفيذ."); process.exit(0); }
  let restored = 0;
  for (const { id: _id, rev: _rev, ...row } of saved.rows) { await Repository.createSchedule(row); restored++; }
  await Repository.createAuditLog({ SystemUserId: 0, userName: "SCHEDULE migration", method: "SCRIPT", path: "scripts/clear-term-schedule.ts", action: "إرجاع جدول فصل", entity: "schedules", entityId: `${scope.collegeId}:${scope.sectionId}:${scope.termId}`, changes: `أُعيد ${restored} صفاً من ${path.basename(restoreFile)}`, status: 200 } as any);
  console.log(`✓ أُعيد ${restored} صفاً (بمعرّفاتٍ جديدة).`);
  process.exit(0);
}

/* ── معاينة المسح ── */
const courses = new Map((await Repository.getCourses()).map(row => [Number(row.AdCourseId), row]));
const byCourse = new Map<string, number>();
for (const row of rows) { const course = courses.get(Number(row.AdCourseId)); const key = `${course?.CourseCode || row.AdCourseId} · ${course?.CourseName || row.AdCourseName || ""}`; byCourse.set(key, (byCourse.get(key) || 0) + 1); }
console.log(`\nالصفوف التي ستُمسح: ${rows.length}`);
for (const [key, count] of [...byCourse.entries()].sort()) console.log(`  ${String(count).padStart(3)} × ${key}`);
if (!rows.length) { console.log("لا شيء يُمسح."); process.exit(0); }
if (!apply) { console.log(`\nمعاينة فقط — لم يُحذف شيء.\nللتنفيذ: --apply --expect-rows ${rows.length}`); process.exit(0); }

/* ── تنفيذ ── */
if (Number(option("--expect-rows")) !== rows.length) fail(`--expect-rows يجب أن يساوي عدد المعاينة الحالي (${rows.length}) — تغيّر العدد أو لم يُمرَّر.`);
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `schedule-${scope.collegeId}-${scope.sectionId}-${scope.termId}-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify({ scope, college: college.AdCollegeName, section: section.AdSectionName, term: term.AdTermName, savedAt: new Date().toISOString(), rows }, null, 2));
const verified = JSON.parse(fs.readFileSync(backupPath, "utf8"));
if (!Array.isArray(verified.rows) || verified.rows.length !== rows.length) fail("تعذّر التحقق من النسخة الاحتياطية؛ لم يُحذف شيء.");
console.log(`\n✓ نسخة احتياطية: ${backupPath} (${verified.rows.length} صفاً)`);

let deleted = 0;
for (const row of rows) { await Repository.deleteSchedule(Number(row.id)); deleted++; }
const left = await Repository.getSchedulesByScope(scope);
await Repository.createAuditLog({
  SystemUserId: 0, userName: "SCHEDULE migration", method: "SCRIPT", path: "scripts/clear-term-schedule.ts",
  action: "مسح جدول فصل", entity: "schedules", entityId: `${scope.collegeId}:${scope.sectionId}:${scope.termId}`,
  changes: `${section.AdSectionName} · ${college.AdCollegeName} · ${term.AdTermName}: مُسح ${deleted} صفاً، والنسخة ${path.basename(backupPath)}`, status: 200,
} as any);
console.log(`✓ مُسح ${deleted} صفاً. المتبقي في النطاق: ${left.length}.`);
if (left.length) fail("بقيت صفوف بعد المسح؛ راجع النطاق.");
console.log(`للإرجاع: ... npx tsx scripts/clear-term-schedule.ts --restore ${backupPath} --apply`);
process.exit(0);
