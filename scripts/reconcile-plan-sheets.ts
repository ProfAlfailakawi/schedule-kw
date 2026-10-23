/**
 * ── مطابقة النظام مع صحائف التخرج (الصحيفة هي الأصل) ─────────────────────────
 *
 * يقرأ ملفات «الخطة الدراسية» (PDF) الجديدة والقديمة بالقارئ نفسه الذي يستعمله الرفع، ثم يجعل
 * كل صحيفةٍ في النظام مطابقةً لصحيفتها: المقررات والأسماء والوحدات والساعات والمسبقات والمقررات
 * الخدمية، في كل المواقع (بنات · بنين · الجهراء · الفحيحيل).
 *
 * - القديمة للقديمة والجديدة للجديدة: صحيفةٌ قديمة تُطابَق مع «السابقة» وجديدةٌ مع «الجديدة».
 * - مقررُ القسم يكون عضواً في صحيفة القسم، ومقرر قسمٍ آخر (إجبارياً كان أو اختيارياً) متطلباً عاماً
 *   (externals) يُحتسب للطالب ولا يدخل كتالوج القسم.
 * - المقرر الخدمي يتبع القسم الذي يدل عليه رمزه (14 القديم و20 للأصول، 73 للكهرباء، 30 للإنجليزية).
 * - برنامجٌ ثانٍ داخل القسم (الإنجليزية للمتوسط والثانوي BA-0119) ورياض الأطفال (BA-0110) صحائفُ مسارات.
 *
 * التشغيل (قراءة فقط ما لم يُمرَّر --apply):
 *   FIREBASE_PROJECT_ID=… FIREBASE_DATABASE_ID=… npx tsx scripts/reconcile-plan-sheets.ts --new <مجلد> --old <مجلد> [--apply] [--college 6]
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AdCourse, CurriculumPlan } from "../src/types";
import { extractPlanItems } from "../src/server/planPdfExtract";
import { parsePlanItems, type ParsedPlan } from "../src/utils/planPdfParser";
import { correctCourseName } from "../src/utils/courseNameCorrection";
import { createReconciler, CODE_ALIAS, sectionDigits, isSpecialEducationSheet } from "../src/server/sheetReconcile";

const argv = process.argv.slice(2);
const arg = (name: string) => { const at = argv.indexOf(name); return at >= 0 ? argv[at + 1] : undefined; };
const apply = argv.includes("--apply");
const onlyCollege = Number(arg("--college") || 0);
const newDir = arg("--new"), oldDir = arg("--old");
if (!newDir || !oldDir) throw new Error("حدّد --new و--old.");
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_DATABASE_ID) throw new Error("حدّد FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID صراحةً.");
process.env.DATA_MODE = "firestore";
const BY = "مطابقة الصحيفة";

/* ── 1) الصحائف ─────────────────────────────────────────────────────────────── */
type Sheet = ParsedPlan & { era: "new" | "old"; file: string };
const sheets: Sheet[] = [];
for (const [era, dir] of [["new", newDir], ["old", oldDir]] as const) {
  for (const file of readdirSync(dir).filter(name => name.toLowerCase().endsWith(".pdf")).sort()) {
    const parsed = parsePlanItems(await extractPlanItems(readFileSync(join(dir, file))));
    /* ملفٌّ يجمع عدة صحائف (وحدات تخرجه فوق أي صحيفة) لا يُطابَق: مساراته مرفوعةٌ كلٌّ بملفه. */
    if (parsed.degreeUnits > 160) { console.log(`تخطّي ${file}: ليس صحيفةً واحدة (${parsed.degreeUnits} وحدة).`); continue; }
    sheets.push({ ...parsed, era, file });
  }
}
/* من كل برنامجٍ ومرحلة: أحدث نسخة (صحائف 1995 و2015 التي حلّت محلها أحدث منها لا تُطابَق). */
const current = new Map<string, Sheet>();
for (const sheet of sheets) {
  const key = `${sheet.era}:${sheet.program}`, held = current.get(key);
  if (!held || sheet.startYear > held.startYear) current.set(key, sheet);
}
const plansToMatch = [...current.values()];

/* الحقيقة لكل رمز: الجديدة أولاً ثم القديمة، والأغلبية بين الصحائف (صحيفة التربية الفنية 2026 تطبع اختيارات
   «مجموعة إختيارية 2» بثلاث وحدات خلافاً لثلاث عشرة صحيفة: الأغلبية وحدةٌ واحدة، وهو الصحيح). */
type Truth = { name: string; units: number; hours: number };
const truth = new Map<string, Truth>();
for (const era of ["new", "old"] as const) {
  const votes = new Map<string, Map<string, number>>();
  for (const sheet of plansToMatch.filter(row => row.era === era)) for (const course of sheet.courses) {
    const value = JSON.stringify([correctCourseName(course.name).name.replace(/ـ/g, "").replace(/\s+/g, " ").trim(), course.units, course.hours]);
    const box = votes.get(course.codeKey) || new Map<string, number>();
    box.set(value, (box.get(value) || 0) + 1); votes.set(course.codeKey, box);
  }
  for (const [code, box] of votes) {
    if (truth.has(code)) continue;
    const [name, units, hours] = JSON.parse([...box].sort((a, b) => b[1] - a[1])[0][0]);
    truth.set(code, { name, units, hours });
  }
}

/* أسماءٌ يكسرها نصُّ الـPDF (مسافةٌ وسط الكلمة، أو اسمٌ قُطع عند حافة العمود): تُكتب كما تعنيها الصحيفة. */
const PRINTED_NAME_FIXES: Record<string, string> = {
  "0102116": "النحو والصرف (1)", "0102227": "النحو والصرف (2)", "0102249": "القصة",
  "0102129": "علم العروض والقافية (1)", "0102257": "علم العروض والقافية (2)",
  "0103288": "التغيير الاجتماعي والتنمية في الوطن العربي", "0114464": "الإدارة التربوية التعليمية",
  "0106113": "مدخل إلى مبادئ الفيزياء محاضرة", "0105304": "مبادئ في الإحصاء والاحتمال", "0105391": "مقدمة في التحليل العددي",
  "0113202": "بيانو وأناشيد (3)", "0113262": "موشحات وفنون شعبية", "0113312": "تحليل شرقي وفنون شعبية", "0108197": "اللياقة البدنية والرياضة",
};
for (const [code, name] of Object.entries(PRINTED_NAME_FIXES)) if (truth.has(code)) truth.set(code, { ...truth.get(code)!, name });

/* ── 2) قاعدة البيانات ─────────────────────────────────────────────────────── */
const { initDatabase, Repository } = await import("../src/db/repository");
await initDatabase();
let [sections, colleges, courses] = await Promise.all([Repository.getSections(), Repository.getColleges(), Repository.getCourses()]) as [any[], any[], AdCourse[]];
const collegeIds = [5, 6, 10, 20].filter(id => !onlyCollege || id === onlyCollege);
const girlsCollege = (cid: number) => String(colleges.find(row => Number(row.AdCollegeId) === cid)?.AdCollegeName || "").includes("بنات");

const report: any[] = [];
const log = (cid: number, kind: string, detail: any) => report.push({ college: cid, kind, ...detail });
let writes = 0;
const write = async <T>(fn: () => Promise<T>): Promise<T | undefined> => { writes += 1; return apply ? fn() : undefined; };

for (const cid of collegeIds) {
  const collegeSections = sections.filter(row => Number(row.AdCollegeId) === cid);
  /* ما دُرِّس فعلاً في هذه الكلية (عبر تاريخ الجدول): سجلُّ المقرر الحقيقي عند قسمه. */
  const taught = new Set<number>((await Repository.getSchedulesByScope({ collegeId: cid })).map(row => Number(row.AdCourseId)));
  const reconciler = createReconciler({
    Repository, collegeId: cid, sections, courses, taught, truth, exactNames: new Set(Object.keys(PRINTED_NAME_FIXES)),
    apply, approve: true, by: BY, log: (kind, detail) => log(cid, kind, detail),
  });
  const { sectionsWithCode } = reconciler;
  /* الصحائف التي تقابل كل صحيفة مطبوعة في هذه الكلية. */
  const allPlans = (await Promise.all(collegeSections.map(row => Repository.getCurriculumPlans(Number(row.AdSectionId))))).flat().filter(plan => !plan.virtual && plan.status !== "archived");
  const trackOf = (sheet: Sheet): string => {
    if (/^BA-\d{6}$/.test(sheet.program)) return sheet.program;
    if (sheet.program === "BA-0119" || sheet.program === "BA-0110") return sheet.program;
    return "";
  };
  const homeDeptOf = (sheet: Sheet) => {
    const counts = new Map<string, number>();
    for (const course of sheet.courses.filter(row => row.sectionNo === 2)) { const dept = CODE_ALIAS[course.dept] || course.dept; counts.set(dept, (counts.get(dept) || 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  };

  for (const sheet of plansToMatch) {
    const status = sheet.era === "new" ? "active" : "transition";
    const track = trackOf(sheet);
    /* رياض الأطفال للبنات وحدهن: لا قسم لها ولا صحيفة في كلية البنين. */
    if (sheet.program === "BA-0110" && !girlsCollege(cid)) continue;
    const list = sheet.courses.filter(course => !(course.girlsOnly && !girlsCollege(cid)));
    let targets: CurriculumPlan[];
    if (track) {
      /* صحيفةُ المسار لأقسام برنامجها وحدها: مسارات التربية الخاصة لقسم التربية الخاصة وحده، والتخصص المزدوج لقسمه،
         والإنجليزية للمتوسط والثانوي لقسم اللغة الإنجليزية، ورياض الأطفال لقسمها. القسمُ الذي يمدّها بمقرراتٍ فقط (علم النفس…) لا يحمل نسخةً منها. */
      const homes: any[] = track === "BA-0110" ? collegeSections.filter(row => String(row.AdSectionCode) === "KG")
        : track === "BA-0119" ? sectionsWithCode("18")
        : isSpecialEducationSheet(sheet) ? sectionsWithCode("19")
        : sectionsWithCode(homeDeptOf(sheet));
      const homeIds = new Set(homes.map(row => Number(row.AdSectionId)));
      for (const plan of allPlans.filter(row => row.track === track && !homeIds.has(Number(row.AdSectionId)))) {
        log(cid, "حذف نسخة في قسم ليس من أقسام البرنامج", { planId: plan.id, plan: plan.name, section: sections.find(row => Number(row.AdSectionId) === Number(plan.AdSectionId))?.AdSectionName });
      }
      targets = allPlans.filter(plan => plan.track === track && plan.status === status && homeIds.has(Number(plan.AdSectionId)));
      for (const home of homes.filter(row => !targets.some(plan => Number(plan.AdSectionId) === Number(row.AdSectionId)))) {
        const name = `${sheet.programName || track} · ${status === "active" ? "الجديدة" : "السابقة"}`;
        log(cid, "إنشاء صحيفة مسار", { section: home.AdSectionName, name, track });
        const created = await write(() => Repository.createTrackPlan({ collegeId: cid, sectionId: Number(home.AdSectionId), name, track, status, by: BY }));
        const plan = created || ({ id: `dry-${track}-${home.AdSectionId}`, AdCollegeId: cid, AdSectionId: Number(home.AdSectionId), name, track, status, createdAt: "" } as CurriculumPlan);
        if (created) await Repository.patchCurriculumPlan(plan.id, Number(home.AdSectionId), { sheetYear: sheet.startYear });
        allPlans.push({ ...plan, sheetYear: sheet.startYear });
        targets.push(plan);
      }
    } else {
      const home = homeDeptOf(sheet);
      targets = allPlans.filter(plan => !plan.track && plan.status === status && sectionsWithCode(home).some(row => Number(row.AdSectionId) === Number(plan.AdSectionId)));
    }
    if (!targets.length) { log(cid, "صحيفة بلا مقابل", { file: sheet.file, program: sheet.program }); continue; }

    for (const plan of targets) await reconciler.reconcilePlan(sheet, list, plan);
  }
  writes += reconciler.writes();
}

writeFileSync(arg("--report") || "reconcile-report.json", JSON.stringify(report, null, 1));
const counts = new Map<string, number>();
for (const row of report) counts.set(`${row.college} ${row.kind}`, (counts.get(`${row.college} ${row.kind}`) || 0) + 1);
for (const [key, count] of [...counts].sort()) console.log(key, count);
console.log(apply ? `نُفّذ: ${writes} كتابة.` : `معاينة فقط: ${writes} كتابة مقترحة. أعد التشغيل بـ --apply للتنفيذ.`);
process.exit(0);
