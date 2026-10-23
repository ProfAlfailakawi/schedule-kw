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
import type { AdCourse, CurriculumPlan, CurriculumRuleSet, CurriculumCourseRule, ElectiveGroup } from "../src/types";
import { extractPlanItems } from "../src/server/planPdfExtract";
import { parsePlanItems, type ParsedPlan, type PlanCourse } from "../src/utils/planPdfParser";
import { sheetToReference, DEPARTMENT_EXTRA_CODES } from "../src/utils/planSheetImport";
import { buildReferenceRules } from "../src/utils/referenceApply";
import { normalizeRules, withDerivedGroups, dedupeGroups, normalizeGroup } from "../src/utils/curriculumRules";
import { correctCourseName } from "../src/utils/courseNameCorrection";
import { arabicMatchKey } from "../src/utils/arabicText";
import { courseNameRelation } from "../src/utils/courseNameRelation";
import { academicDigits } from "../src/utils/authorityAcademicCodes";

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

const deptOf = (code: string) => code.slice(2, 4);
const numOf = (code: string) => code.slice(-3);
const sectionDigits = (row: any) => academicDigits(row.AdSectionCode);
/* رمزُ قسمٍ يتبع قسماً آخر في النظام: 14 (قسم التربية القديم) للأصول (20)، و73 للكهرباء (72). */
const ALIAS: Record<string, string> = { "14": "20", ...Object.fromEntries(Object.entries(DEPARTMENT_EXTRA_CODES).flatMap(([owner, extras]) => extras.map(extra => [extra, owner]))) };
const aliasesOf = (code: string) => Object.entries(ALIAS).filter(([, owner]) => owner === code).map(([alias]) => alias);
const normName = (value: string) => arabicMatchKey(String(value || "").replace(/ىء/g, "ئ")).replace(/[\s()\-/]+/g, "");
const nameRelation = courseNameRelation;

const report: any[] = [];
const log = (cid: number, kind: string, detail: any) => report.push({ college: cid, kind, ...detail });
let writes = 0;
const write = async <T>(fn: () => Promise<T>): Promise<T | undefined> => { writes += 1; return apply ? fn() : undefined; };

for (const cid of collegeIds) {
  const collegeSections = sections.filter(row => Number(row.AdCollegeId) === cid);
  /* ما دُرِّس فعلاً في هذه الكلية (عبر تاريخ الجدول): سجلُّ المقرر الحقيقي عند قسمه. */
  const taught = new Set<number>((await Repository.getSchedulesByScope({ collegeId: cid })).map(row => Number(row.AdCourseId)));
  const coursesIn = (sid: number) => courses.filter(row => Number(row.AdSectionId) === sid);
  /* رمزٌ فيه حرف («18-F» برنامج اللغة الفرنسية القديم) قسمٌ آخر وإن شاركت أرقامُه رمزَ قسم: لا يُعدّ منه. */
  const sectionsWithCode = (code: string) => collegeSections.filter(row => sectionDigits(row) === code && !/[A-Za-z\u0621-\u064A]/.test(String(row.AdSectionCode)));
  /* مقررات «لغة إنجليزية» العامة (30) محفوظة برمزها الكامل في قسمٍ إنجليزي واحد: ذاك مالكها. */
  const englishHost = () => collegeSections.find(row => coursesIn(Number(row.AdSectionId)).some(course => academicDigits(course.CourseCode).startsWith("0130")))
    || sectionsWithCode("18").find(row => !/^قسم/.test(String(row.AdSectionName)));
  const keyOf = (row: AdCourse) => {
    const code = academicDigits(row.CourseCode), section = sections.find(item => Number(item.AdSectionId) === Number(row.AdSectionId));
    const digits = section ? sectionDigits(section) : "";
    if (code.length <= 3 && digits.length === 2) return `01${digits}${code.padStart(3, "0")}`;
    if (code.length === 6 && code.startsWith("1")) return `0${code}`;
    return code;
  };
  /** المقرر في قسمٍ بعينه: بالرمز الكامل، أو برقمه إن كان رمزُ قسمه رمزَ هذا القسم (أو تابعاً له). */
  const findIn = (sid: number, code: string): AdCourse | undefined => {
    const section = sections.find(row => Number(row.AdSectionId) === sid);
    /* بالرقم وحده: رمزُ القسم نفسه ورموزه الفرعية المحفوظة بأرقامها (73 عند الكهرباء). رمزُ قسم التربية القديم (14) لا يُطابَق
       بالرقم أبداً: «464» عند الأصول هو 0120464 الجديد، و0114464 القديم مقررٌ آخر برمزه الكامل (القديم للقديم والجديد للجديد). */
    const own = section ? [sectionDigits(section), ...aliasesOf(sectionDigits(section)).filter(code => code !== "14")] : [];
    const rows = coursesIn(sid);
    const exact = rows.filter(row => keyOf(row) === code);
    if (exact.length === 1) return exact[0];
    const byNumber = own.includes(deptOf(code)) ? rows.filter(row => academicDigits(row.CourseCode).length <= 3 && academicDigits(row.CourseCode).padStart(3, "0") === numOf(code)) : [];
    const pool = exact.length ? exact : byNumber;
    if (pool.length <= 1) return pool[0];
    const wanted = truth.get(code)?.name || "";
    const rank = (row: AdCourse) => ["same", "spelling", "related", "different"].indexOf(nameRelation(row.CourseName, wanted));
    return [...pool].sort((a, b) => rank(a) - rank(b))[0];
  };
  /** القسم المالك لمقررٍ ليس من قسم الصحيفة. */
  const ownerOf = (code: string, preferSid?: number): any | undefined => {
    const dept = deptOf(code);
    /* مقررٌ محفوظٌ برمزه الكامل في قسمٍ ما: ذاك قسمه، أينما كان (طرق التدريس العام 0114304 عند المناهج). */
    const stored = collegeSections.find(row => coursesIn(Number(row.AdSectionId)).some(course => academicDigits(course.CourseCode) === code));
    if (stored) return stored;
    if (dept === "30") return englishHost();
    const target = ALIAS[dept] || dept;
    const candidates = sectionsWithCode(target);
    if (preferSid && candidates.some(row => Number(row.AdSectionId) === preferSid)) return candidates.find(row => Number(row.AdSectionId) === preferSid);
    return candidates.find(row => findIn(Number(row.AdSectionId), code)) || candidates.find(row => /^قسم/.test(String(row.AdSectionName))) || candidates[0];
  };
  /** يجد المقرر في قسمه المالك أو يُنشئه بالاسم والوحدات والساعات من الصحيفة، ويصحّح ما اختلف منها. */
  /** سجلُّ المقرر الذي دُرِّس فعلاً، في أي قسمٍ من الكلية، بالرقم نفسه والاسم: مقررات قسم التربية القديم (14) بقيت بأرقامها عند
   *  القسم الذي يدرّسها («طرق التدريس العام» 304 عند المناهج). لا يُؤخذ سجلٌّ هو نفسه مقررُ رمزٍ آخر في الصحائف. */
  const taughtTwin = (code: string, name: string): AdCourse | undefined => {
    /* في قسم الرمز نفسه فقط؛ ومقررات قسم التربية القديم (14) عند الأقسام التي ورثت أرقامه (المناهج 21، الأصول 20، علم النفس 15). */
    const homes = new Set((deptOf(code) === "14" ? ["21", "20", "15"] : [ALIAS[deptOf(code)] || deptOf(code)])
      .flatMap(dept => sectionsWithCode(dept).map(row => Number(row.AdSectionId))));
    const sameNumber = (row: AdCourse) => keyOf(row) === code || (academicDigits(row.CourseCode).length <= 3 && academicDigits(row.CourseCode).padStart(3, "0") === numOf(code));
    const claimedElsewhere = (row: AdCourse) => keyOf(row) !== code && truth.has(keyOf(row)) && ["same", "spelling"].includes(nameRelation(row.CourseName, truth.get(keyOf(row))!.name));
    const found = courses.filter(row => {
      if (Number(row.AdCollegeId) !== cid || !taught.has(Number(row.AdCourseId)) || !homes.has(Number(row.AdSectionId)) || !sameNumber(row) || claimedElsewhere(row)) return false;
      const relation = nameRelation(row.CourseName, name);
      return relation === "same" || relation === "spelling" || (relation === "related" && keyOf(row) === code);
    });
    const rank = (row: AdCourse) => (keyOf(row) === code ? 0 : 2) + (["same", "spelling"].includes(nameRelation(row.CourseName, name)) ? 0 : 1);
    const best = found.sort((x, y) => rank(x) - rank(y));
    return best.length && (best.length === 1 || rank(best[0]) < rank(best[1])) ? best[0] : undefined;
  };
  const ensureCourse = async (sid: number, code: string): Promise<AdCourse | undefined> => {
    const t = truth.get(code)!;
    let row = findIn(sid, code);
    if (!row || !taught.has(Number(row.AdCourseId))) {
      const twin = taughtTwin(code, t.name);
      if (twin && twin !== row) { log(cid, "ربط بالسجل المدرَّس", { code, name: t.name, twin: twin.AdCourseId, twinCode: twin.CourseCode, twinSection: sections.find(item => Number(item.AdSectionId) === Number(twin.AdSectionId))?.AdSectionName, replaces: row?.AdCourseId }); row = twin; }
    }
    /* الرقم نفسه لمقررٍ آخر في القسم (مقررات التربية الخاصة القديمة بأرقامٍ قصيرة عند علم النفس): لا يُعاد تسميتُه،
       بل يُستعمل للصحيفة مقررٌ مستقل برمزها الكامل. */
    let distinct = false;
    if (row && nameRelation(row.CourseName, t.name) === "different") {
      const full = coursesIn(sid).find(item => academicDigits(item.CourseCode) === code);
      log(cid, "رقم لمقرر آخر", { code, catalog: row.CourseName, sheet: t.name, resolved: full ? "مقرر مستقل قائم" : "يُنشأ مقرر مستقل" });
      row = full; distinct = true;
    }
    if (!row) {
      const section = sections.find(item => Number(item.AdSectionId) === sid);
      /* رقمٌ بلا رمز قسم يُحفظ لقسمه نفسه؛ ومقررُ رمزٍ تابع (14، 73، 30) يُحفظ برمزه الكامل فلا يلتبس بمقررٍ للقسم بالرقم ذاته. */
      const stored = !distinct && deptOf(code) === sectionDigits(section) && !coursesIn(sid).some(item => academicDigits(item.CourseCode).padStart(3, "0") === numOf(code) && academicDigits(item.CourseCode).length <= 3) ? numOf(code) : code;
      log(cid, "إنشاء مقرر", { section: section?.AdSectionName, code, stored, ...t });
      const created = await write(() => Repository.createCourse(cid, sid, stored, t.name, t.units, t.hours, 0, false));
      row = created || { AdCourseId: -(writes), AdCollegeId: cid, AdSectionId: sid, CourseCode: stored, CourseName: t.name, CourseCredit: t.units, CourseHours: t.hours, MaxStudent: 0 } as AdCourse;
      courses.push(row);
      return row;
    }
    /* رقمٌ واحدٌ لأكثر من مقرر في القسم: مكوّناتٌ يُجدوِل بها القسم مقرر الصحيفة (التربية الموسيقية: «بيانو1» و«اناشيد1»
       لـ«بيانو وأناشيد (1)»، و«منوع كمان1/عود1…» لـ«عزف منوع (1)»). لا يُعاد تسمية أحدها ولا تُغيَّر وحداته. */
    const siblings = coursesIn(sid).filter(item => academicDigits(item.CourseCode) === academicDigits(row!.CourseCode));
    if (siblings.length > 1) { log(cid, "مقرر بمكوّنات", { code, ids: siblings.map(item => item.AdCourseId), names: siblings.map(item => item.CourseName) }); return row; }
    const relation = nameRelation(row.CourseName, t.name);
    /* الاسم المصحَّح يدوياً من كسر الـPDF يُكتب حرفياً، ولو كان الفرق إملاءً فقط. */
    const nameDiffers = relation === "related" || relation === "different" || (code in PRINTED_NAME_FIXES && row.CourseName.trim() !== t.name);
    if (nameDiffers || Number(row.CourseCredit) !== t.units || Number(row.CourseHours) !== t.hours) {
      const name = nameDiffers ? t.name : row.CourseName;
      log(cid, "تصحيح مقرر", { code, id: row.AdCourseId, before: { name: row.CourseName, units: row.CourseCredit, hours: row.CourseHours }, after: { ...t, name } });
      await write(() => Repository.updateCourse(row!.AdCourseId, row!.AdCollegeId, row!.AdSectionId, row!.CourseCode, name, t.units, t.hours, Number(row!.MaxStudent) || 0));
      Object.assign(row, { CourseName: name, CourseCredit: t.units, CourseHours: t.hours });
    }
    return row;
  };

  /* الصحائف التي تقابل كل صحيفة مطبوعة في هذه الكلية. */
  const allPlans = (await Promise.all(collegeSections.map(row => Repository.getCurriculumPlans(Number(row.AdSectionId))))).flat().filter(plan => !plan.virtual && plan.status !== "archived");
  const trackOf = (sheet: Sheet): string => {
    if (/^BA-\d{6}$/.test(sheet.program)) return sheet.program;
    if (sheet.program === "BA-0119" || sheet.program === "BA-0110") return sheet.program;
    return "";
  };
  const homeDeptOf = (sheet: Sheet) => {
    const counts = new Map<string, number>();
    for (const course of sheet.courses.filter(row => row.sectionNo === 2)) { const dept = ALIAS[course.dept] || course.dept; counts.set(dept, (counts.get(dept) || 0) + 1); }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  };

  for (const sheet of plansToMatch) {
    const status = sheet.era === "new" ? "active" : "transition";
    const track = trackOf(sheet);
    const list = sheet.courses.filter(course => !(course.girlsOnly && !girlsCollege(cid)));
    let targets: CurriculumPlan[];
    if (track) {
      /* صحيفةُ المسار لأقسام برنامجها وحدها: التربية الخاصة وقسمُ المادة (عربية/إسلامية/رياضيات/علوم)، والتخصص المزدوج لقسمه،
         والإنجليزية للمتوسط والثانوي لقسم اللغة الإنجليزية، ورياض الأطفال لقسمها. القسمُ الذي يمدّها بمقرراتٍ فقط (علم النفس…) لا يحمل نسخةً منها. */
      const subject = (() => { const counts = new Map<string, number>(); for (const course of sheet.courses.filter(row => row.sectionNo === 2 && !["19", "15", "14", "20", "21"].includes(row.dept))) counts.set(course.dept, (counts.get(course.dept) || 0) + 1); return [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] || ""; })();
      const homes: any[] = track === "BA-0110" ? collegeSections.filter(row => String(row.AdSectionCode) === "KG")
        : track === "BA-0119" ? sectionsWithCode("18")
        : /تربيه\s*خاصه|تربية\s*خاصة/.test(sheet.programName || "") ? [...sectionsWithCode("19"), ...sectionsWithCode(subject)]
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

    for (const plan of targets) {
      const sid = Number(plan.AdSectionId), section = sections.find(row => Number(row.AdSectionId) === sid);
      const sectionCode = sectionDigits(section);
      const ownCodes = new Set([sectionCode, ...aliasesOf(sectionCode)]);
      /* مقرر القسم: رمزُ قسمه رمزُ هذا القسم أو تابعٌ له؛ و«لغة إنجليزية» العامة لقسمها المضيف وحده. */
      const isOwn = (course: PlanCourse) => course.dept === "30" ? Number(englishHost()?.AdSectionId) === sid : ownCodes.has(course.dept);
      const memberIdByCode = new Map<string, number>(), externalIdByCode = new Map<string, number>();
      for (const course of list) {
        if (isOwn(course)) {
          const row = await ensureCourse(sid, course.codeKey);
          /* سجلُّه المدرَّس عند قسمٍ آخر: يدخل متطلباً عاماً لا عضواً (العضوية لسجلات القسم نفسه). */
          if (row && Number(row.AdSectionId) === sid) memberIdByCode.set(course.codeKey, Number(row.AdCourseId));
          else if (row) externalIdByCode.set(course.codeKey, Number(row.AdCourseId));
        } else {
          const owner = ownerOf(course.codeKey);
          if (!owner) { log(cid, "مقرر خدمي بلا قسم", { file: sheet.file, code: course.codeKey, name: course.name }); continue; }
          const row = await ensureCourse(Number(owner.AdSectionId), course.codeKey);
          if (row) externalIdByCode.set(course.codeKey, Number(row.AdCourseId));
        }
      }

      /* العضوية: مقررات القسم في الصحيفة كما طُبعت، لا زيادة ولا نقص. */
      const links = (await Repository.getCurriculumPlanCourses(sid)).filter(link => link.planId === plan.id);
      const have = new Set(links.map(link => Number(link.AdCourseId))), want = new Set(memberIdByCode.values());
      for (const id of want) if (!have.has(id)) {
        const row = courses.find(item => Number(item.AdCourseId) === id)!;
        log(cid, "ربط مقرر بالصحيفة", { plan: plan.name, section: section?.AdSectionName, code: keyOf(row), name: row.CourseName });
        await write(() => Repository.addCourseToCurriculumPlan(plan.id, row, BY));
      }
      for (const id of have) if (!want.has(id)) {
        const row = courses.find(item => Number(item.AdCourseId) === id);
        log(cid, "فك مقرر ليس في الصحيفة", { plan: plan.name, section: section?.AdSectionName, code: row ? keyOf(row) : id, name: row?.CourseName });
        await write(() => Repository.removeCourseFromCurriculumPlan(plan.id, id));
      }

      /* القواعد: المسبقات لمقررات القسم من الصحيفة حرفياً، ومقررات الأقسام الأخرى متطلباتٌ عامة بمجموعاتها. */
      const own = list.filter(isOwn), foreign = list.filter(course => !isOwn(course) && externalIdByCode.has(course.codeKey));
      const names = new Map(list.map(course => [course.codeKey, truth.get(course.codeKey)?.name || course.name] as const));
      /* المسبقات كما طُبعت لكل مقررٍ في الصحيفة (لمقررات القسم ولمقررات الأقسام الأخرى): لا تعتمد الصحيفة على نسخةٍ في قسمٍ آخر. */
      const { reference } = sheetToReference(sheet, [...own, ...foreign], names, []);
      const scope = new Map([...memberIdByCode, ...externalIdByCode]);
      const known = new Map<string, number>(courses.filter(row => Number(row.AdCollegeId) === cid).map(row => [keyOf(row), Number(row.AdCourseId)] as const));
      const built = buildReferenceRules(reference, scope, new Map([...known, ...scope]), new Set());
      const stamp = (id: string) => `y${sheet.startYear || 0}-${id.replace(/^new-/, "")}`;
      const creditOf = (id: number) => Number(courses.find(row => Number(row.AdCourseId) === id)?.CourseCredit) || 0;
      for (const group of built.groups) {
        const printed = reference.groups.find(row => `${reference.id}-${row.id}` === group.id);
        const offered = (printed?.courses || []).reduce((sum, course) => sum + (Number(course.credit) || 0), 0);
        const present = group.courseIds.reduce((sum, id) => sum + creditOf(id), 0);
        group.id = stamp(group.id);
        if (offered > present) group.pendingUnits = offered - present;
      }
      for (const rule of built.rules) if (rule.groupId) rule.groupId = stamp(rule.groupId);
      const ownIds = new Set(memberIdByCode.values());
      const live = await Repository.getRuleSet(plan.id), draft = await Repository.getRuleDraft(plan.id);
      const base = draft || live;
      const held = new Map((base?.rules || []).map(rule => [rule.courseId, rule] as const));
      const rules: CurriculumCourseRule[] = built.rules.map(fresh => {
        const prior = held.get(fresh.courseId);
        return { ...(prior || {}), ...fresh, ...(fresh.prereq ? { prereq: fresh.prereq } : { prereq: undefined }), ...(prior?.coreq?.length ? { coreq: prior.coreq } : {}) } as CurriculumCourseRule;
      }).map(rule => { const copy: any = { ...rule }; if (!copy.prereq) delete copy.prereq; if (!copy.groupId) delete copy.groupId; return copy; });
      const groups = dedupeGroups(built.groups.map(group => normalizeGroup(group)).filter(Boolean) as ElectiveGroup[]);
      const externals = [...new Set(externalIdByCode.values())].sort((a, b) => a - b);
      const next = { rules: withDerivedGroups(normalizeRules(rules), groups), groups, externals };
      const canon = (set: Pick<CurriculumRuleSet, "rules" | "groups" | "externals"> | undefined) => JSON.stringify({
        rules: [...(set?.rules || [])].map(rule => ({ c: rule.courseId, k: rule.kind, l: rule.level, g: rule.groupId || "", p: rule.prereq ? [[...rule.prereq.all].sort(), rule.prereq.anyOf.map(group => [...group].sort()).sort()] : null, q: rule.coreq || [] })).sort((a, b) => a.c - b.c),
        groups: [...(set?.groups || [])].map(group => ({ i: group.id, u: group.minUnits, m: group.minCourses, c: [...group.courseIds].sort(), p: group.pendingUnits || 0 })).sort((a, b) => a.i.localeCompare(b.i)),
        externals: [...(set?.externals || [])].map(Number).sort((a, b) => a - b),
      });
      if (canon(live) !== canon(next as any) || (draft && draft.status === "review")) {
        const before = JSON.parse(canon(live)), after = JSON.parse(canon(next as any));
        const prereqChanged = after.rules.filter((rule: any) => { const old = before.rules.find((row: any) => row.c === rule.c); return ownIds.has(rule.c) && JSON.stringify(old?.p ?? null) !== JSON.stringify(rule.p); }).length;
        log(cid, "تحديث قواعد الصحيفة", { plan: plan.name, section: section?.AdSectionName, externalsBefore: before.externals.length, externalsAfter: after.externals.length, rulesBefore: before.rules.length, rulesAfter: after.rules.length, prereqChanged });
        await write(async () => {
          const saved = await Repository.updateRuleDraft(plan.id, current => ({
            ...(current || { id: plan.id, planId: plan.id, AdCollegeId: cid, AdSectionId: sid, version: live?.version || 0, basedOnVersion: live?.version || 0 }),
            ...next, status: "review", updatedAt: new Date().toISOString(), updatedBy: `${BY} · ${sheet.file}`,
          } as CurriculumRuleSet));
          await Repository.approveRuleDraft(plan.id, String(saved?.updatedAt || ""), BY);
        });
      }

      /* شروط التخرج: صحيفةٌ بلا قاعدة تأخذ وحدات تخرجها من الصحيفة، وحدودها بالنسبة والتناسب من قاعدة القسم. */
      if (!plan.degreeRule && sheet.degreeUnits) {
        /* قاعدة القسم في موقعه، وإلا قاعدةُ القسم نفسه (بالرمز) في كلية البنات الأصل: الفحيحيل بلا قواعد أقسام. */
        const rules = await Repository.getDegreeRules();
        const twin = sections.find(row => Number(row.AdCollegeId) === 6 && sectionDigits(row) === sectionCode);
        const stored = (rules.find(row => Number(row.AdSectionId) === sid && Number(row.degreeUnits) > 0) || rules.find(row => Number(row.AdSectionId) === Number(twin?.AdSectionId))) as any;
        const STD130 = { degreeUnits: 130, fieldTrainingRequired: 102, graduateRegularPassed: 107, graduateSummerPassed: 109 };
        const baseRule = stored?.degreeUnits ? stored : STD130;
        if (baseRule) {
          const f = sheet.degreeUnits / Number(baseRule.degreeUnits);
          const rule = { degreeUnits: sheet.degreeUnits, fieldTrainingRequired: Math.round(baseRule.fieldTrainingRequired * f), graduateRegularPassed: Math.round(baseRule.graduateRegularPassed * f), graduateSummerPassed: Math.round(baseRule.graduateSummerPassed * f), updatedAt: new Date().toISOString(), updatedBy: BY };
          log(cid, "شروط تخرج", { plan: plan.name, section: section?.AdSectionName, rule });
          if (!String(plan.id).startsWith("dry-")) await write(() => Repository.updateCurriculumPlan(plan.id, sid, { degreeRule: rule }));
        } else log(cid, "صحيفة بلا شروط تخرج", { plan: plan.name, section: section?.AdSectionName });
      }
    }
  }
}

writeFileSync(arg("--report") || "reconcile-report.json", JSON.stringify(report, null, 1));
const counts = new Map<string, number>();
for (const row of report) counts.set(`${row.college} ${row.kind}`, (counts.get(`${row.college} ${row.kind}`) || 0) + 1);
for (const [key, count] of [...counts].sort()) console.log(key, count);
console.log(apply ? `نُفّذ: ${writes} كتابة.` : `معاينة فقط: ${writes} كتابة مقترحة. أعد التشغيل بـ --apply للتنفيذ.`);
process.exit(0);
