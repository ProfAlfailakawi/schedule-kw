/**
 * ── مطابقة صحيفةٍ في النظام مع ملفها (الصحيفة هي الأصل) ───────────────────────
 *
 * قلبٌ واحد يستعمله رفعُ الصحيفة وسكربت المطابقة، فلا تفترق قواعدهما:
 * - مقرر القسم عضوٌ في صحيفته، ومقرر قسمٍ آخر (إجبارياً كان أو اختيارياً) متطلبٌ عام يُحتسب للطالب.
 * - المقرر يتبع القسم الذي يدل عليه رمزه (14 القديم والأصول 20، 73 للكهرباء، 30 لوحدة اللغة الإنجليزية)،
 *   ويُنشأ عند قسمه إن لم يوجد. القسمُ الخدمي الذي لا قسم له في النظام يبقى معلّقاً.
 * - سجلُّ المقرر الذي درّسه القسم فعلاً (بالرقم والاسم، داخل قسم رمزه) يُقدَّم على نسخةٍ بلا تاريخ.
 * - الاسم والوحدات والساعات من الصحيفة؛ الإملاء وحده لا يغيّر الاسم، ومقررٌ آخر يحمل الرقم لا يُعاد تسميتُه
 *   بل يُستعمل للصحيفة مقررٌ مستقل برمزها الكامل، ورقمٌ يحمله أكثر من سجل (مكوّنات يجدول بها القسم) لا يُمسّ.
 * - العضوية والمتطلبات العامة والمجموعات والمسبقات (لكل مقررات الصحيفة) كما طُبعت، لا زيادة ولا نقص.
 * - صحيفةٌ بلا شروط تخرج تأخذ وحداتها من الصحيفة وحدودها بالنسبة والتناسب من قاعدة القسم.
 */
import type { AdCourse, CurriculumPlan, CurriculumRuleSet, CurriculumCourseRule, ElectiveGroup } from "../types";
import type { ParsedPlan, PlanCourse } from "../utils/planPdfParser";
import { sheetToReference, DEPARTMENT_EXTRA_CODES } from "../utils/planSheetImport";
import { buildReferenceRules } from "../utils/referenceApply";
import { normalizeRules, withDerivedGroups, dedupeGroups, normalizeGroup } from "../utils/curriculumRules";
import { courseNameRelation } from "../utils/courseNameRelation";
import { academicDigits } from "../utils/authorityAcademicCodes";

export interface SheetTruth { name: string; units: number; hours: number }
export type ReconcileLog = (kind: string, detail: Record<string, unknown>) => void;

export interface ReconcilerInput {
  Repository: any;
  collegeId: number;
  sections: any[];
  /** كتالوج الكليات كلها؛ يُحدَّث في مكانه عند الإنشاء والتصحيح. */
  courses: AdCourse[];
  /** ما دُرِّس في هذه الكلية عبر تاريخ الجدول. */
  taught: ReadonlySet<number>;
  truth: ReadonlyMap<string, SheetTruth>;
  /** أسماءٌ تُكتب حرفياً ولو كان الفرق إملاءً (ما يكسره نصّ الـPDF). */
  exactNames?: ReadonlySet<string>;
  /** رموزٌ لا تُكتب وحداتُها فوق الكتالوج (خطأ طباعةٍ ظاهر في الصحيفة). */
  keepUnits?: ReadonlySet<string>;
  /** يمنع تصحيح سجلٍّ (الصحيفة القديمة لا تنقض مقرراً في صحيفةٍ فعّالة). */
  mayCorrect?: (row: AdCourse) => Promise<boolean>;
  apply: boolean;
  /** اعتماد القواعد مباشرةً (السكربت) أو تركها مسوّدةً يعتمدها القسم (الرفع). */
  approve: boolean;
  by: string;
  log: ReconcileLog;
}

const deptOf = (code: string) => code.slice(2, 4);
const numOf = (code: string) => code.slice(-3);
export const sectionDigits = (row: any) => academicDigits(row?.AdSectionCode);
/* رمزُ قسمٍ يتبع قسماً آخر في النظام: 14 (قسم التربية القديم) للأصول (20)، و73 للكهرباء (72). */
export const CODE_ALIAS: Record<string, string> = { "14": "20", ...Object.fromEntries(Object.entries(DEPARTMENT_EXTRA_CODES).flatMap(([owner, extras]) => extras.map(extra => [extra, owner]))) };
const aliasesOf = (code: string) => Object.entries(CODE_ALIAS).filter(([, owner]) => owner === code).map(([alias]) => alias);
const STD130 = { degreeUnits: 130, fieldTrainingRequired: 102, graduateRegularPassed: 107, graduateSummerPassed: 109 };

export function createReconciler(input: ReconcilerInput) {
  const { Repository, collegeId: cid, sections, courses, taught, truth, log } = input;
  let writes = 0;
  const write = async <T>(fn: () => Promise<T>): Promise<T | undefined> => { writes += 1; return input.apply ? fn() : undefined; };
  const nameRelation = courseNameRelation;
  const collegeSections = sections.filter(row => Number(row.AdCollegeId) === cid);
  const sectionOf = (sid: number) => sections.find(row => Number(row.AdSectionId) === sid);
  const coursesIn = (sid: number) => courses.filter(row => Number(row.AdSectionId) === sid);
  /* رمزٌ فيه حرف («18-F» برنامج اللغة الفرنسية القديم، «KG») قسمٌ قائمٌ بذاته وإن شاركت أرقامُه رمزَ قسم. */
  const sectionsWithCode = (code: string) => collegeSections.filter(row => sectionDigits(row) === code && !/[A-Za-zء-ي]/.test(String(row.AdSectionCode)));
  /* «لغة إنجليزية» العامة (30) لوحدة اللغة الإنجليزية، وإلا للقسم الذي يحفظها برمزها الكامل. */
  const englishHost = () => sectionsWithCode("30")[0]
    || collegeSections.find(row => coursesIn(Number(row.AdSectionId)).some(course => academicDigits(course.CourseCode).startsWith("0130")));
  const keyOf = (row: AdCourse) => {
    const code = academicDigits(row.CourseCode), digits = sectionDigits(sectionOf(Number(row.AdSectionId)));
    if (code.length <= 3 && digits.length === 2) return `01${digits}${code.padStart(3, "0")}`;
    if (code.length === 6 && code.startsWith("1")) return `0${code}`;
    return code;
  };
  const shortNumber = (row: AdCourse) => academicDigits(row.CourseCode).length <= 3 ? academicDigits(row.CourseCode).padStart(3, "0") : "";

  /** المقرر في قسمٍ بعينه: بالرمز الكامل، أو برقمه إن كان رمزُ قسمه رمزَ هذا القسم (أو رمزاً فرعياً محفوظاً بأرقامه).
   *  رمزُ قسم التربية القديم (14) لا يُطابَق بالرقم: «464» عند الأصول هو 0120464 الجديد، و0114464 القديم مقررٌ آخر. */
  const findIn = (sid: number, code: string): AdCourse | undefined => {
    const section = sectionOf(sid);
    const own = section ? [sectionDigits(section), ...aliasesOf(sectionDigits(section)).filter(alias => alias !== "14")] : [];
    const rows = coursesIn(sid);
    const exact = rows.filter(row => keyOf(row) === code);
    if (exact.length === 1) return exact[0];
    const byNumber = own.includes(deptOf(code)) ? rows.filter(row => shortNumber(row) === numOf(code)) : [];
    const pool = exact.length ? exact : byNumber;
    if (pool.length <= 1) return pool[0];
    const wanted = truth.get(code)?.name || "";
    const rank = (row: AdCourse) => ["same", "spelling", "related", "different"].indexOf(nameRelation(row.CourseName, wanted));
    return [...pool].sort((a, b) => rank(a) - rank(b))[0];
  };
  /** القسم المالك لمقررٍ ليس من قسم الصحيفة. */
  const ownerOf = (code: string): any | undefined => {
    const stored = collegeSections.find(row => coursesIn(Number(row.AdSectionId)).some(course => academicDigits(course.CourseCode) === code));
    if (stored) return stored;
    const dept = deptOf(code);
    if (dept === "30") return englishHost();
    const candidates = sectionsWithCode(CODE_ALIAS[dept] || dept);
    return candidates.find(row => findIn(Number(row.AdSectionId), code)) || candidates.find(row => /^قسم/.test(String(row.AdSectionName))) || candidates[0];
  };
  /** سجلُّ المقرر الذي دُرِّس فعلاً بالرقم نفسه والاسم، داخل قسم رمزه؛ ومقررات قسم التربية القديم (14) عند الأقسام التي ورثت
   *  أرقامه (المناهج 21، الأصول 20، علم النفس 15). لا يُؤخذ سجلٌّ هو نفسه مقررُ رمزٍ آخر في الصحائف. */
  const taughtTwin = (code: string, name: string): AdCourse | undefined => {
    const homes = new Set((deptOf(code) === "14" ? ["21", "20", "15"] : [CODE_ALIAS[deptOf(code)] || deptOf(code)])
      .flatMap(dept => sectionsWithCode(dept).map(row => Number(row.AdSectionId))));
    const sameNumber = (row: AdCourse) => keyOf(row) === code || shortNumber(row) === numOf(code);
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

  /** مقررُ قسم التربية القديم (14) عند وارثه (المناهج 21، الأصول 20، علم النفس 15) بالرقم والاسم وإن لم يُدرَّس بعد:
   *  «المناهج 284» سجلُّه عند المناهج، فلا يُنشأ له سجلٌّ ثانٍ عند الأصول. سجلٌّ واحدٌ مطابق، وإلا فلا شيء. */
  const inheritedTwin = (code: string, name: string): AdCourse | undefined => {
    if (deptOf(code) !== "14") return undefined;
    const homes = new Set(["21", "20", "15"].flatMap(dept => sectionsWithCode(dept).map(row => Number(row.AdSectionId))));
    const found = courses.filter(row => Number(row.AdCollegeId) === cid && homes.has(Number(row.AdSectionId))
      && shortNumber(row) === numOf(code) && ["same", "spelling"].includes(nameRelation(row.CourseName, name)));
    return found.length === 1 ? found[0] : undefined;
  };

  /** يجد المقرر (سجلَّه المدرَّس أولاً) أو يُنشئه عند قسمه، ويصحّح ما خالف الصحيفة. */
  /** سجلٌّ مستعمَل: دُرِّس، أو مربوطٌ بصحيفةٍ غير هذه. لا يُعاد تسمية سجلٍّ مستعمَلٍ باسم مقررٍ آخر. */
  const inUse = async (row: AdCourse, planId?: string) => taught.has(Number(row.AdCourseId))
    || (await Repository.getCurriculumPlanCourses(Number(row.AdSectionId))).some((link: any) => Number(link.AdCourseId) === Number(row.AdCourseId) && link.planId !== planId);
  const ensureCourse = async (sid: number, code: string, planId?: string): Promise<AdCourse | undefined> => {
    const t = truth.get(code);
    if (!t) return undefined;
    let row = findIn(sid, code);
    if (!row || !taught.has(Number(row.AdCourseId))) {
      const twin = taughtTwin(code, t.name) || inheritedTwin(code, t.name);
      if (twin && twin !== row) { log("ربط بالسجل المدرَّس", { code, name: t.name, twin: twin.AdCourseId, twinCode: twin.CourseCode, replaces: row?.AdCourseId }); row = twin; }
    }
    let distinct = false;
    /* سجلٌّ باسم مقررٍ آخر تماماً ودُرِّس لا يُعاد تسميته: يُنشأ للصحيفة مقررٌ مستقل برمزه الكامل. الحكم بالتدريس وحده
       (تاريخٌ ثابت) لا بالربط بصحيفةٍ أخرى، فلا تختلف النتيجة بحسب ترتيب الرفع. */
    if (row && nameRelation(row.CourseName, t.name) === "different" && taught.has(Number(row.AdCourseId))) {
      const full = coursesIn(sid).find(item => academicDigits(item.CourseCode) === code);
      log("رقم لمقرر آخر", { code, catalog: row.CourseName, sheet: t.name, resolved: full ? "مقرر مستقل قائم" : "يُنشأ مقرر مستقل" });
      row = full; distinct = true;
    }
    if (!row) {
      const section = sectionOf(sid);
      const free = !coursesIn(sid).some(item => shortNumber(item) === numOf(code));
      const stored = !distinct && deptOf(code) === sectionDigits(section) && free ? numOf(code) : code;
      log("إنشاء مقرر", { section: section?.AdSectionName, code, stored, ...t });
      const created = await write(() => Repository.createCourse(cid, sid, stored, t.name, t.units, t.hours, 0, false));
      row = (created as AdCourse | undefined) || ({ AdCourseId: -(writes), AdCollegeId: cid, AdSectionId: sid, CourseCode: stored, CourseName: t.name, CourseCredit: t.units, CourseHours: t.hours, MaxStudent: 0 } as AdCourse);
      courses.push(row);
      return row;
    }
    /* رقمٌ واحدٌ لأكثر من سجل في القسم: مكوّناتٌ يُجدوِل بها القسم مقرر الصحيفة («بيانو1» و«اناشيد1»…): لا يُمسّ. */
    const siblings = coursesIn(Number(row.AdSectionId)).filter(item => academicDigits(item.CourseCode) === academicDigits(row!.CourseCode));
    if (siblings.length > 1) { log("مقرر بمكوّنات", { code, ids: siblings.map(item => item.AdCourseId) }); return row; }
    if (input.mayCorrect && !(await input.mayCorrect(row))) return row;
    const relation = nameRelation(row.CourseName, t.name);
    /* «ﻣﻬﺎﺭﺍﺕ» (حروف عرض الـPDF) أو مسافةٌ مكرّرة: الاسم نفسه بكتابةٍ أخرى يُكتب كما في الصحيفة. */
    const sameButEncoded = row.CourseName !== t.name && row.CourseName.normalize("NFKC").replace(/ـ/g, "").replace(/\s+/g, " ").trim() === t.name;
    const nameDiffers = relation === "related" || relation === "different" || sameButEncoded || (input.exactNames?.has(code) && row.CourseName.trim() !== t.name);
    const units = input.keepUnits?.has(code) ? Number(row.CourseCredit) : t.units;
    if (nameDiffers || Number(row.CourseCredit) !== units || Number(row.CourseHours) !== t.hours) {
      const name = nameDiffers ? t.name : row.CourseName;
      log("تصحيح مقرر", { code, id: row.AdCourseId, before: { name: row.CourseName, units: row.CourseCredit, hours: row.CourseHours }, after: { name, units, hours: t.hours } });
      await write(() => Repository.updateCourse(row!.AdCourseId, row!.AdCollegeId, row!.AdSectionId, row!.CourseCode, name, units, t.hours, Number(row!.MaxStudent) || 0));
      Object.assign(row, { CourseName: name, CourseCredit: units, CourseHours: t.hours });
    }
    return row;
  };

  /** مطابقة صحيفةٍ واحدة في قسمها مع ملفها. `list`: مقررات الصحيفة لهذا الموقع (بعد استبعاد «للبنات فقط» في البنين). */
  const reconcilePlan = async (sheet: Pick<ParsedPlan, "groups" | "sections" | "program" | "semesterLabel" | "startYear" | "degreeUnits"> & { courses: PlanCourse[] }, list: PlanCourse[], plan: CurriculumPlan) => {
    const sid = Number(plan.AdSectionId), section = sectionOf(sid);
    const sectionCode = sectionDigits(section);
    const ownCodes = new Set([sectionCode, ...aliasesOf(sectionCode)]);
    const host = englishHost();
    const isOwn = (course: PlanCourse) => course.dept === "30" ? Number(host?.AdSectionId) === sid : ownCodes.has(course.dept);
    const memberIdByCode = new Map<string, number>(), externalIdByCode = new Map<string, number>();
    const pending: string[] = [];
    for (const course of list) {
      if (isOwn(course)) {
        const row = await ensureCourse(sid, course.codeKey, plan.id);
        if (row && Number(row.AdSectionId) === sid) memberIdByCode.set(course.codeKey, Number(row.AdCourseId));
        else if (row) externalIdByCode.set(course.codeKey, Number(row.AdCourseId));
      } else {
        const owner = ownerOf(course.codeKey);
        /* لا يُنشأ مقررٌ عند قسمٍ لا يملك مقرراً واحداً برمز القسم نفسه: رمزٌ خطأ في النظام (وحدة الكهرباء كانت «20»، رمز الأصول)
           يُقال في التقرير ولا يُكتب فيه مقررٌ لغيره. */
        /* يملك الرمزَ قسمٌ رمزُه رمزُ المقرر نفسه (بلا حروف: «20-2» ليست الأصول)، أو قسمٌ يحفظ مقرراً بهذا الرمز. */
        const owns = owner && (sectionsWithCode(CODE_ALIAS[deptOf(course.codeKey)] || deptOf(course.codeKey)).some(row => Number(row.AdSectionId) === Number(owner.AdSectionId)) || coursesIn(Number(owner.AdSectionId)).some(row => deptOf(keyOf(row)) === deptOf(course.codeKey) || (deptOf(course.codeKey) === "14" && keyOf(row).startsWith("0114"))));
        if (!owner || (!owns && !findIn(Number(owner.AdSectionId), course.codeKey) && !taughtTwin(course.codeKey, truth.get(course.codeKey)?.name || course.name))) {
          pending.push(course.codeKey); log("مقرر خدمي بلا قسم", { code: course.codeKey, name: course.name }); continue;
        }
        const row = await ensureCourse(Number(owner.AdSectionId), course.codeKey, plan.id);
        if (row) externalIdByCode.set(course.codeKey, Number(row.AdCourseId));
      }
    }

    /* العضوية كما طُبعت: لا زيادة ولا نقص. */
    const links = (await Repository.getCurriculumPlanCourses(sid)).filter((link: any) => link.planId === plan.id);
    const have = new Set<number>(links.map((link: any) => Number(link.AdCourseId))), want = new Set(memberIdByCode.values());
    let linked = 0, unlinked = 0;
    for (const id of want) if (!have.has(id)) {
      const row = courses.find(item => Number(item.AdCourseId) === id)!;
      log("ربط مقرر بالصحيفة", { plan: plan.name, code: keyOf(row), name: row.CourseName });
      await write(() => Repository.addCourseToCurriculumPlan(plan.id, row, input.by)); linked += 1;
    }
    for (const id of have) if (!want.has(id)) {
      const row = courses.find(item => Number(item.AdCourseId) === id);
      log("فك مقرر ليس في الصحيفة", { plan: plan.name, code: row ? keyOf(row) : id, name: row?.CourseName });
      await write(() => Repository.removeCourseFromCurriculumPlan(plan.id, id)); unlinked += 1;
    }

    /* القواعد: مسبقات كل مقررات الصحيفة كما طُبعت، ومجموعاتها، ومتطلباتها العامة. */
    const inScope = list.filter(course => memberIdByCode.has(course.codeKey) || externalIdByCode.has(course.codeKey));
    const names = new Map(list.map(course => [course.codeKey, truth.get(course.codeKey)?.name || course.name] as const));
    const { reference } = sheetToReference(sheet as ParsedPlan, inScope, names, []);
    const scope = new Map([...memberIdByCode, ...externalIdByCode]);
    const known = new Map<string, number>(courses.filter(row => Number(row.AdCollegeId) === cid).map(row => [keyOf(row), Number(row.AdCourseId)] as const));
    /* مسبقٌ برمز قسم التربية القديم (0114104) لا اسم له في الصحيفة: يُربط بسجلٍّ وحيد بالرقم عند وارثيه (21، 20، 15). */
    const heirs = new Set(["21", "20", "15"].flatMap(dept => sectionsWithCode(dept).map(row => Number(row.AdSectionId))));
    for (const code of new Set(list.flatMap(course => [...course.prereqAll, ...course.prereqAny.flat()]))) {
      if (deptOf(code) !== "14" || known.has(code) || scope.has(code)) continue;
      const found = courses.filter(row => Number(row.AdCollegeId) === cid && heirs.has(Number(row.AdSectionId)) && shortNumber(row) === numOf(code));
      if (found.length === 1) known.set(code, Number(found[0].AdCourseId));
    }
    const built = buildReferenceRules(reference, scope, new Map([...known, ...scope]), new Set());
    const stamp = (id: string) => `y${sheet.startYear || 0}-${id.replace(/^new-/, "")}`;
    const creditOf = (id: number) => Number(courses.find(row => Number(row.AdCourseId) === id)?.CourseCredit) || 0;
    for (const group of built.groups) {
      const printed = reference.groups.find(row => `${reference.id}-${row.id}` === group.id);
      const offered = list.filter(course => course.groupId === printed?.id).reduce((sum, course) => sum + (Number(course.units) || 0), 0);
      const present = group.courseIds.reduce((sum, id) => sum + creditOf(id), 0);
      group.id = stamp(group.id);
      if (offered > present) group.pendingUnits = offered - present;
    }
    for (const rule of built.rules) if (rule.groupId) rule.groupId = stamp(rule.groupId);
    const live = await Repository.getRuleSet(plan.id), draft = await Repository.getRuleDraft(plan.id);
    const held = new Map<number, CurriculumCourseRule>(((draft || live)?.rules || []).map((rule: CurriculumCourseRule) => [rule.courseId, rule] as const));
    const rules = built.rules.map(fresh => {
      const prior = held.get(fresh.courseId);
      const copy: any = { ...(prior || {}), ...fresh, prereq: fresh.prereq, ...(prior?.coreq?.length ? { coreq: prior.coreq } : {}) };
      if (!copy.prereq) delete copy.prereq; if (!copy.groupId) delete copy.groupId;
      return copy as CurriculumCourseRule;
    });
    const groups = dedupeGroups(built.groups.map(group => normalizeGroup(group)).filter(Boolean) as ElectiveGroup[]);
    const externals = [...new Set(externalIdByCode.values())].sort((a, b) => a - b);
    const next = { rules: withDerivedGroups(normalizeRules(rules), groups), groups, externals };
    const canon = (set: Pick<CurriculumRuleSet, "rules" | "groups" | "externals"> | undefined) => JSON.stringify({
      rules: [...(set?.rules || [])].map(rule => ({ c: rule.courseId, k: rule.kind, l: rule.level, g: rule.groupId || "", p: rule.prereq ? [[...rule.prereq.all].sort(), rule.prereq.anyOf.map(group => [...group].sort()).sort()] : null, q: rule.coreq || [] })).sort((a, b) => a.c - b.c),
      groups: [...(set?.groups || [])].map(group => ({ i: group.id, u: group.minUnits, m: group.minCourses, c: [...group.courseIds].sort(), p: group.pendingUnits || 0 })).sort((a, b) => a.i.localeCompare(b.i)),
      externals: [...(set?.externals || [])].map(Number).sort((a, b) => a - b),
    });
    const target = input.approve ? live : (draft || live);
    let rulesChanged = false;
    if (canon(target) !== canon(next as any) || (input.approve && draft?.status === "review")) {
      rulesChanged = true;
      log("تحديث قواعد الصحيفة", { plan: plan.name, externals: externals.length, rules: next.rules.length });
      await write(async () => {
        const saved = await Repository.updateRuleDraft(plan.id, (current: CurriculumRuleSet | undefined) => ({
          ...(current || { id: plan.id, planId: plan.id, AdCollegeId: cid, AdSectionId: sid, version: live?.version || 0, basedOnVersion: live?.version || 0 }),
          ...next, status: "review", updatedAt: new Date().toISOString(), updatedBy: input.by,
        } as CurriculumRuleSet));
        if (input.approve) await Repository.approveRuleDraft(plan.id, String(saved?.updatedAt || ""), input.by);
      });
    }

    /* شروط التخرج: من الصحيفة، وحدودها بالنسبة والتناسب من قاعدة القسم (أو قاعدته في كلية البنات الأصل، أو 130 القياسية). */
    if (!plan.degreeRule && sheet.degreeUnits > 0 && sheet.degreeUnits <= 160) {
      const all = await Repository.getDegreeRules();
      const twin = sections.find(row => Number(row.AdCollegeId) === 6 && sectionDigits(row) === sectionCode && String(row.AdSectionCode) === String(section?.AdSectionCode));
      const stored = all.find((row: any) => Number(row.AdSectionId) === sid && Number(row.degreeUnits) > 0) || all.find((row: any) => Number(row.AdSectionId) === Number(twin?.AdSectionId) && Number(row.degreeUnits) > 0);
      const base = stored?.degreeUnits ? stored : STD130;
      const f = sheet.degreeUnits / Number(base.degreeUnits);
      const rule = { degreeUnits: sheet.degreeUnits, fieldTrainingRequired: Math.round(base.fieldTrainingRequired * f), graduateRegularPassed: Math.round(base.graduateRegularPassed * f), graduateSummerPassed: Math.round(base.graduateSummerPassed * f), updatedAt: new Date().toISOString(), updatedBy: input.by };
      log("شروط تخرج", { plan: plan.name, rule });
      if (!String(plan.id).startsWith("dry-")) await write(() => Repository.updateCurriculumPlan(plan.id, sid, { degreeRule: rule }));
    }
    const unresolvedPrereqs = [...new Set(inScope.flatMap(course => [...course.prereqAll, ...course.prereqAny.flat()]).filter(code => code !== "PEN" && !scope.has(code) && !known.has(code)))];
    return { members: want.size, externals: externals.length, linked, unlinked, pending, unresolvedPrereqs, rules: next.rules.length, groups: groups.length, rulesChanged };
  };

  return { reconcilePlan, ensureCourse, sectionsWithCode, keyOf, writes: () => writes };
}

/** أقسامُ صحيفة المسار (أو صحيفة القسم الإداري): مسارات التربية الخاصة لقسم التربية الخاصة، ورياض الأطفال لقسمها (للبنات وحدهن)،
 *  والإنجليزية للمتوسط والثانوي لقسم اللغة الإنجليزية. القسمُ الذي يمدّها بمقرراتٍ لا يحمل نسخةً منها. */
export function isSpecialEducationSheet(sheet: { programName?: string }): boolean {
  return /تربيه\s*خاصه|تربية\s*خاصة/.test(sheet.programName || "");
}

/** صحيفةُ مسار: برنامجٌ بتخصصٍ مزدوج (BA-012402…)، أو الإنجليزية للمتوسط والثانوي، أو رياض الأطفال. */
export const trackProgramOf = (sheet: { program: string }): string =>
  /^BA-\d{6}$/.test(sheet.program) || sheet.program === "BA-0119" || sheet.program === "BA-0110" ? sheet.program : "";

/** رمزُ القسم صاحب الصحيفة: KG لرياض الأطفال، 18 للإنجليزية للمتوسط والثانوي، 19 للتربية الخاصة، وإلا القسمُ الأكثر مقرراتٍ في التخصص. */
export function sheetHomeCode(sheet: { program: string; programName?: string; courses: Array<{ dept: string; sectionNo: number }> }): string {
  if (sheet.program === "BA-0110") return "KG";
  if (sheet.program === "BA-0119") return "18";
  if (isSpecialEducationSheet(sheet)) return "19";
  const counts = new Map<string, number>();
  for (const course of sheet.courses.filter(row => row.sectionNo === 2)) { const dept = CODE_ALIAS[course.dept] || course.dept; counts.set(dept, (counts.get(dept) || 0) + 1); }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

/** صاحبُ الصحيفة بين أقسام النظام: صحيفة المسار لصاحبها برمزه وحده؛ والرئيسية تُقبل لقسمٍ رمزه خطأٌ يدوي (يُصحَّح إليها)،
 *  ولا تُقبل لوحدةٍ أو برنامجٍ في كليةٍ فيها قسمٌ رمزُه رمزُ الصحيفة («وحدة اللغة الإنجليزية» 30 والقسم 18 قائم). */
export function ownsSheet(sheet: Parameters<typeof sheetHomeCode>[0], section: { AdCollegeId?: unknown; AdSectionCode?: unknown; AdSectionName?: unknown }, all: ReadonlyArray<{ AdCollegeId?: unknown; AdSectionCode?: unknown }>): boolean {
  if (isSheetHome(sheet, section)) return true;
  if (trackProgramOf(sheet)) return false;
  /* «قسمٌ» برمزٍ خطأ يُقبل ويُصحَّح؛ «وحدةٌ» أو «برنامجٌ» يشبه اسمُه القسمَ لا يحمل صحيفته ما دام القسم قائماً. */
  if (/^قسم/.test(String(section.AdSectionName || "").trim())) return true;
  return !all.some(row => Number(row.AdCollegeId) === Number(section.AdCollegeId) && isSheetHome(sheet, row));
}

/** هل القسمُ صاحبُ الصحيفة؟ القسمُ الذي يمدّها بمقرراتٍ فقط (علم النفس، المناهج، وحدة اللغة…) لا يحمل نسخةً منها. */
export function isSheetHome(sheet: Parameters<typeof sheetHomeCode>[0], section: { AdSectionCode?: unknown }): boolean {
  const home = sheetHomeCode(sheet), code = String(section.AdSectionCode ?? "").trim();
  if (!home) return true;
  if (home === "KG") return code === "KG";
  return sectionDigits(section) === home && !/[A-Za-zء-ي]/.test(code);
}

/** أسماءٌ يكسرها نصُّ الـPDF (مسافةٌ وسط الكلمة، أو اسمٌ قُطع عند حافة العمود): تُكتب كما تعنيها الصحيفة. */
export const PRINTED_NAME_FIXES: Record<string, string> = {
  "0102116": "النحو والصرف (1)", "0102227": "النحو والصرف (2)", "0102249": "القصة",
  "0102129": "علم العروض والقافية (1)", "0102257": "علم العروض والقافية (2)",
  "0103288": "التغيير الاجتماعي والتنمية في الوطن العربي", "0114464": "الإدارة التربوية التعليمية",
  "0106113": "مدخل إلى مبادئ الفيزياء محاضرة", "0105304": "مبادئ في الإحصاء والاحتمال", "0105391": "مقدمة في التحليل العددي",
  "0113202": "بيانو وأناشيد (3)", "0113262": "موشحات وفنون شعبية", "0113312": "تحليل شرقي وفنون شعبية", "0108197": "اللياقة البدنية والرياضة",
};

/** ملفٌّ يجمع عدة صحائف (وحدات تخرجه فوق أي صحيفة) لا يُطابَق: مساراته مرفوعةٌ كلٌّ بملفه. */
export const isCombinedSheet = (sheet: { degreeUnits: number }) => sheet.degreeUnits > 160;
