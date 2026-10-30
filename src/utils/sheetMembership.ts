/**
 * ── عضويةُ الصحيفة: مصدرٌ واحد لوسم «صحيفة 2026» ولتبويبي «🆕 الجديدة / 📘 القديمة» ─────────────
 *
 * ملاحظةُ المالك: في «حالة طرح المقررات» كان مقررٌ يحمل «صحيفة 2026» في تبويب القديمة، ومقرراتٌ قديمة في
 * تبويب الجديدة. السبب: الوسمُ والتبويبُ كانا يُحسبان من مصدرين — الوسمُ من روابط الصحيفة مصفّاةً بالصحيفة
 * المرجعية ومن متطلبات الأقسام الأخرى، والتبويبُ من روابط الصحيفة وحدها بلا تصفية ولا متطلبات. هنا القاعدةُ
 * الواحدة، يقرؤها الخادمُ للوسم (/api/plan-badges) وللتبويبين (حالةُ الطرح، «كل المقررات»، محاكي الشعب):
 *
 *   • «في الجديدة»: المقررُ في الصحيفة الفعّالة لقسمه (رابطٌ مقبول)، أو تطلبه الصحيفةُ الفعّالة لقسمٍ آخر.
 *   • «في القديمة»: المقررُ في الصحيفة السابقة الجارية لقسمه، أو تطلبه الصحيفةُ السابقة لقسمٍ آخر.
 *   • لا ثنائيةَ إلا لقسمٍ (أو مسارٍ) له الصحيفتان معاً؛ وإلا فلا جديدةَ ولا قديمة.
 *   • الوسم «صحيفة 2026»: في الجديدة وحدها. وفي الاثنتين: التبويبان معاً، بلا وسم، وبملاحظة «في الصحيفتين».
 *   • قسمٌ بلا صحائف في فرعه يستعير صحيفةَ أخيه في فرعٍ آخر بالرمز القصير (كحكم الوصول).
 *
 * ملفٌّ خالص بلا قراءة ولا كتابة: يُختبر بمدخلاتٍ مصنوعة (tests/sheet-membership-audit.ts).
 */

export interface MembershipPlan { id: string; sectionId: number; status?: string; track?: string | null; virtual?: boolean; sheetYear?: number | null; name?: string | null }
export interface MembershipCourse { id: number; sectionId: number; collegeId: number; code: string }
export interface MembershipInput {
  plans: readonly MembershipPlan[];
  /** روابطُ الصحائف: أيُّ مقررٍ في أيّ صحيفة. */
  links: ReadonlyArray<{ planId: string; courseId: number }>;
  /** متطلباتُ كل صحيفة من مقررات أقسامٍ أخرى (externals في قواعدها). */
  externals: ReadonlyArray<{ planId: string; courseIds: readonly number[] }>;
  courses: readonly MembershipCourse[];
  /** رابطٌ في الصحيفة الجديدة مقبول؟ (تكنولوجيا التعليم: ما في الصحيفة المرجعية المطبوعة فقط — يُسقط الروابطَ القديمة العالقة). */
  acceptNew?: (sectionId: number, course: MembershipCourse) => boolean;
  /** أقسامُ العائلة نفسها في فروعٍ أخرى (للاستعارة). */
  familyOf?: (sectionId: number) => readonly number[];
}

export interface Membership {
  courseId: number; sectionId: number; collegeId: number;
  /** اسمُ الصحيفة الجديدة («صحيفة 2026») إن كان فيها، وإلا "". */
  fresh: string;
  old: boolean;
  /** جاءت الجديدةُ من متطلبات قسمٍ آخر (لا من صحيفة قسمه). */
  service: boolean;
}

export type SheetSide = "new" | "old" | "shared";

/** نصُّ الوسم: سنةُ الصحيفة المرفوعة، وإلا سنةٌ في اسمها، وإلا اسمُها. */
export function sheetBadgeLabel(plan: Pick<MembershipPlan, "sheetYear" | "name">): string {
  const year = Number(plan.sheetYear) || Number(/(?:19|20)\d{2}/.exec(String(plan.name || ""))?.[0]) || 0;
  return year ? `صحيفة ${year}` : String(plan.name || "").trim().slice(0, 30) || "الصحيفة الجديدة";
}

/** الرمزُ القصير: آخرُ ثلاثة أرقام («0109217» ← «217»). */
const shortCode = (code: unknown) => { const digits = String(code ?? "").replace(/\D/g, ""); return digits.length >= 3 ? digits.slice(-3) : String(code ?? "").trim(); };

/** الصحيفتان لكل مسار: الفعّالة الجديدة والسابقة الجارية — وإلا لا ثنائية. */
function pairs(plans: readonly MembershipPlan[]) {
  const live = plans.filter(plan => !plan.virtual && plan.status !== "archived");
  const byTrack = new Map<string, MembershipPlan[]>();
  for (const plan of live) byTrack.set(String(plan.track || ""), [...(byTrack.get(String(plan.track || "")) || []), plan]);
  const out: Array<{ fresh: MembershipPlan; previous: MembershipPlan[] }> = [];
  for (const group of byTrack.values()) {
    const fresh = group.find(plan => plan.status === "active"), previous = group.filter(plan => plan.status === "transition");
    if (fresh && previous.length) out.push({ fresh, previous });
  }
  return out;
}

export function sheetMembership(input: MembershipInput): Map<string, Membership> {
  const courseById = new Map(input.courses.map(course => [Number(course.id), course]));
  const coursesOf = new Map<number, MembershipCourse[]>();
  for (const course of input.courses) coursesOf.set(Number(course.sectionId), [...(coursesOf.get(Number(course.sectionId)) || []), course]);
  const plansOf = new Map<number, MembershipPlan[]>();
  for (const plan of input.plans) plansOf.set(Number(plan.sectionId), [...(plansOf.get(Number(plan.sectionId)) || []), plan]);
  const linksOf = new Map<string, number[]>();
  for (const link of input.links) linksOf.set(String(link.planId), [...(linksOf.get(String(link.planId)) || []), Number(link.courseId)]);
  const externalsOf = new Map<string, number[]>();
  for (const row of input.externals) externalsOf.set(String(row.planId), [...(externalsOf.get(String(row.planId)) || []), ...row.courseIds.map(Number)]);

  const out = new Map<string, Membership>();
  const entry = (course: MembershipCourse) => {
    const key = `${Number(course.sectionId)}:${Number(course.id)}`;
    let row = out.get(key);
    if (!row) { row = { courseId: Number(course.id), sectionId: Number(course.sectionId), collegeId: Number(course.collegeId), fresh: "", old: false, service: false }; out.set(key, row); }
    return row;
  };
  const markNew = (course: MembershipCourse, label: string, service: boolean) => {
    const row = entry(course);
    /* صحيفةُ القسم المالك هي الأصل: لا تكتب صحيفةُ قسمٍ آخر فوقها. */
    if (!row.fresh || (row.service && !service)) { row.fresh = label; row.service = service; }
  };
  const live = (plans: readonly MembershipPlan[] | undefined) => (plans || []).some(plan => !plan.virtual && plan.status !== "archived");

  for (const [sid, own] of coursesOf) {
    /* صحائفُ القسم نفسه، وإلا صحيفةُ أخيه في فرعٍ آخر بالرمز القصير. */
    let plans = plansOf.get(sid) || [];
    let remap = (id: number): MembershipCourse | undefined => { const course = courseById.get(id); return course && Number(course.sectionId) === sid ? course : undefined; };
    if (!live(plans)) {
      const sibling = (input.familyOf?.(sid) || []).find(other => other !== sid && live(plansOf.get(other)));
      if (sibling == null) continue;
      plans = plansOf.get(sibling) || [];
      const mine = new Map(own.map(course => [shortCode(course.code), course] as const));
      remap = id => { const course = courseById.get(id); return course && Number(course.sectionId) === sibling ? mine.get(shortCode(course.code)) : undefined; };
    }
    for (const { fresh, previous } of pairs(plans)) {
      const label = sheetBadgeLabel(fresh);
      for (const id of linksOf.get(String(fresh.id)) || []) {
        const course = remap(id);
        if (course && (!input.acceptNew || input.acceptNew(sid, course))) markNew(course, label, false);
      }
      for (const plan of previous) for (const id of linksOf.get(String(plan.id)) || []) {
        const course = remap(id);
        if (course) entry(course).old = true;
      }
    }
  }
  /* متطلباتُ الأقسام الأخرى: مقررُ الخدمة في جديدة القسم الطالب أو قديمته — بمقرره هو (لا بنسخة الفرع). */
  for (const [sid, plans] of plansOf) {
    for (const { fresh, previous } of pairs(plans)) {
      const label = sheetBadgeLabel(fresh);
      for (const id of externalsOf.get(String(fresh.id)) || []) {
        const course = courseById.get(id);
        if (course && Number(course.sectionId) !== sid) markNew(course, label, true);
      }
      for (const plan of previous) for (const id of externalsOf.get(String(plan.id)) || []) {
        const course = courseById.get(id);
        if (course && Number(course.sectionId) !== sid) entry(course).old = true;
      }
    }
  }
  return out;
}

/** جهةُ المقرر: «new» في الجديدة وحدها، «old» في القديمة وحدها، «shared» في الاثنتين؛ وإلا null. */
export function sheetSideOf(row: Pick<Membership, "fresh" | "old"> | null | undefined): SheetSide | null {
  if (!row) return null;
  if (row.fresh && row.old) return "shared";
  if (row.fresh) return "new";
  if (row.old) return "old";
  return null;
}

/** وسمُ «صحيفة 2026»: للمقرر في الجديدة وحدها. */
export const sheetBadgeOf = (row: Pick<Membership, "fresh" | "old"> | null | undefined) => (row && row.fresh && !row.old ? row.fresh : "");

/**
 * التبويبان من جهة كل مقرر: «في الصحيفتين» في الاثنين، وما لا جهةَ له (خدمةٌ لصحيفةٍ واحدة، قديمٌ بلا صحيفة) في القديمة.
 * لا ثنائيةَ في القسم (لا جديدةَ أو لا قديمة) ⇒ لا تبويب: قائمةٌ واحدة كما كانت.
 */
export function splitBySide(courseIds: Iterable<number>, sideOf: (id: number) => SheetSide | null | undefined): { tabs: boolean; new: number[]; old: number[] } {
  const all = [...courseIds].map(Number).filter(id => Number.isFinite(id) && id > 0);
  const sides = new Map(all.map(id => [id, sideOf(id) || null] as const));
  const hasNew = all.some(id => sides.get(id) === "new" || sides.get(id) === "shared");
  const hasOld = all.some(id => sides.get(id) === "old" || sides.get(id) === "shared");
  if (!hasNew || !hasOld) return { tabs: false, new: [], old: all };
  return {
    tabs: true,
    new: all.filter(id => sides.get(id) === "new" || sides.get(id) === "shared"),
    old: all.filter(id => sides.get(id) !== "new"),
  };
}

/**
 * ترتيبُ المقررات برقم المقرر تصاعدياً: الرقمُ القصير أولاً («105» قبل «217» ولو كُتب أحدهما «0109105»)،
 * ثم الرمزُ كاملاً رقمياً، ثم الاسم. بلا رقمٍ في الآخر.
 */
export function byCourseNumber<T>(codeOf: (item: T) => unknown, nameOf?: (item: T) => unknown) {
  const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
  const short = (value: unknown) => { const d = digits(value); return d ? Number(d.slice(-3)) : Number.POSITIVE_INFINITY; };
  const full = (value: unknown) => { const d = digits(value); return d ? Number(d) : Number.POSITIVE_INFINITY; };
  const diff = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);
  return (a: T, b: T) => diff(short(codeOf(a)), short(codeOf(b))) || diff(full(codeOf(a)), full(codeOf(b)))
    || String(nameOf?.(a) ?? "").localeCompare(String(nameOf?.(b) ?? ""), "ar");
}
