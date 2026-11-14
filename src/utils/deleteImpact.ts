/**
 * ── «لو حذفت؟»: المنطقُ الصِّرف لخريطة ما يرتبط بالسجل قبل حذفه ─────────────────
 *
 * مصدرٌ واحد للحقيقة: الخادمُ يحمّل الحقائق (server/deleteImpact.ts) ثم يسأل هذه الدوال
 * «ما الذي يمنع الحذف؟» — فحرّاسُ الحذف الفعلية وخريطةُ التأكيد تقرآن الدالةَ نفسها،
 * فلا يَعِد التأكيدُ بما يرفضه الحذف ولا العكس. لا قراءةَ قاعدة بيانات ولا شبكة هنا.
 */
import { AR, countOf } from "./arabicCount";

export const DELETE_ENTITIES = ["term", "college", "section", "instructor", "course", "room", "building", "user"] as const;
export type DeleteEntity = (typeof DELETE_ENTITIES)[number];
export const isDeleteEntity = (value: unknown): value is DeleteEntity => (DELETE_ENTITIES as readonly string[]).includes(String(value));

/** الشاشةُ التي تُعالَج منها العقبة (يفتحها الرابط في الواجهة). */
export type DeleteFixView = "users" | "scopes" | "sections" | "courses" | "roomSetup";
/** مسارُ الشاشة كما في App.tsx (pathByView) — تتحقّق منه اختباراتُ الدفعة. */
export const DELETE_FIX_PATHS: Record<DeleteFixView, string> = {
  users: "/SystemUser/Index",
  scopes: "/AdCollegeUserAssign/Index",
  sections: "/AdSection/Index",
  courses: "/AdCourse/Index",
  roomSetup: "/System/LocationSetup",
};

/** عقبةٌ تمنع الحذف الآن، وهي نفسُها سببُ رفض الخادم (الحالة والنصّ والحقول الإضافية). */
export interface DeleteBlocker {
  code: string;
  /** نصُّ الرفض الذي يعيده الخادم حرفياً. */
  message: string;
  status: number;
  /** حقولٌ إضافية يعيدها الرفضُ مع الخطأ (مثل code وsectionId للصحيفة). */
  body?: Record<string, unknown>;
  /** أسماءُ الحسابات التي يسمّيها الحارس (أسماء دخولٍ لا بياناتٌ شخصية). */
  names?: string[];
  fix?: { view: DeleteFixView; label: string };
}

export type ImpactNoun = Exclude<keyof typeof AR, never>;
export interface ImpactItem {
  id: string;
  noun: ImpactNoun;
  count: number;
  /** عبارةٌ تلي العدد والمعدود: «في الفصل الحالي». */
  when?: string;
}
export interface ImpactGroup { id: string; title: string; items: ImpactItem[] }
export interface ImpactWarning { code: string; message: string }

export interface DeleteImpact {
  entity: DeleteEntity;
  id: string;
  /** اسمُ السجل للعرض (فصل/كلية/…)، بلا بياناتٍ شخصية. */
  name: string;
  groups: ImpactGroup[];
  blockers: DeleteBlocker[];
  warnings: ImpactWarning[];
  /** الحذفُ إيقافٌ يحتاج تأكيداً صريحاً (X-Schedule-Confirm) لأن مواعيد قائمة تقف فيه. */
  requiresConfirm: boolean;
  /** مجموعُ المرتبطات (لسطر «لا شيء مرتبط»). */
  total: number;
}

/* ── المواعيد مقسومةً على الفصول ─────────────────────────────────────────── */
export interface AppointmentBuckets { current: number; later: number; past: number }
export interface TermBucketContext { activeId: number; laterIds: ReadonlySet<number> }

/** الفصلُ الجاري، وما بعده، وما قبله — بالمنطق نفسه الذي يعدّ به الخادمُ مواعيد القاعة. */
export function bucketAppointments(rows: ReadonlyArray<{ AdTermId?: unknown }>, ctx: TermBucketContext): AppointmentBuckets {
  const out: AppointmentBuckets = { current: 0, later: 0, past: 0 };
  for (const row of rows) {
    const term = Number(row.AdTermId);
    if (term === ctx.activeId) out.current += 1;
    else if (ctx.laterIds.has(term)) out.later += 1;
    else out.past += 1;
  }
  return out;
}

export const appointmentsTotal = (buckets: AppointmentBuckets): number => buckets.current + buckets.later + buckets.past;

export function appointmentGroup(buckets: AppointmentBuckets): ImpactGroup {
  return {
    id: "appointments",
    title: "المواعيد في الجدول",
    items: [
      { id: "appointments-current", noun: "appointment", count: buckets.current, when: "في الفصل الحالي" },
      { id: "appointments-later", noun: "appointment", count: buckets.later, when: "في فصولٍ لاحقة" },
      { id: "appointments-past", noun: "appointment", count: buckets.past, when: "في فصولٍ سابقة" },
    ],
  };
}

/** يحذف البنودَ الصفرية والمجموعاتِ الفارغة: الخريطةُ تعرض ما يوجد فقط. */
export function compactGroups(groups: ImpactGroup[]): ImpactGroup[] {
  return groups
    .map(group => ({ ...group, items: group.items.filter(item => Number(item.count) > 0) }))
    .filter(group => group.items.length > 0);
}

export const groupsTotal = (groups: ReadonlyArray<ImpactGroup>): number =>
  groups.reduce((sum, group) => sum + group.items.reduce((inner, item) => inner + Math.max(0, Number(item.count) || 0), 0), 0);

/* ── الحقائق التي تحكم المنع، وقاعدةُ المنع الواحدة لكل نوع ─────────────────── */
export interface TermGuardFacts { appointments: number }
export interface CollegeGuardFacts { sections: number; scopedAccounts: string[] }
export interface SectionGuardFacts { courses: number; scopedAccounts: string[] }
export interface InstructorGuardFacts { appointments: number }
export interface CourseGuardFacts { curriculumSectionId: number | null; appointments: number }
export interface UserGuardFacts { found: boolean; refusal: string | null }

export type GuardFactsByEntity = {
  term: TermGuardFacts;
  college: CollegeGuardFacts;
  section: SectionGuardFacts;
  instructor: InstructorGuardFacts;
  course: CourseGuardFacts;
  user: UserGuardFacts;
  room: Record<string, never>;
  building: Record<string, never>;
};

/** رفضُ حذف كلية/قسمٍ لحساباتٍ نطاقُها فيه — النصُّ الذي كان في referenceRoutes. */
export function scopedAccountsMessage(logins: readonly string[], what: string): string | null {
  if (!logins.length) return null;
  return `لا يمكن حذف ${what}: حساباتٌ نطاقها فيه ما زالت قائمة (${logins.join("، ")}). عدّل نطاقها أو احذفها من «المستخدمون» أولاً.`;
}

const accountsBlocker = (logins: readonly string[], what: string): DeleteBlocker[] => {
  const message = scopedAccountsMessage(logins, what);
  return message ? [{ code: "scoped-accounts", message, status: 409, names: [...logins], fix: { view: "users", label: "افتح «المستخدمون»" } }] : [];
};

/** العقباتُ بترتيب الحارس الفعلي؛ الحارسُ يرفض بأولها، والخريطةُ تعرضها كلَّها. */
export function blockersFor<E extends DeleteEntity>(entity: E, facts: GuardFactsByEntity[E]): DeleteBlocker[] {
  switch (entity) {
    case "term": {
      const f = facts as TermGuardFacts;
      return f.appointments > 0 ? [{ code: "term-has-appointments", status: 409, message: "لا يمكن حذف الفصل الدراسي لوجود بيانات مرتبطة به في الجدول الدراسي" }] : [];
    }
    case "college": {
      const f = facts as CollegeGuardFacts;
      return [
        ...(f.sections > 0 ? [{ code: "college-has-sections", status: 409, message: "لا يمكن حذف الكلية لوجود أقسام علمية مرتبطة بها", fix: { view: "sections" as const, label: "افتح «الأقسام العلمية»" } }] : []),
        ...accountsBlocker(f.scopedAccounts, "الكلية"),
      ];
    }
    case "section": {
      const f = facts as SectionGuardFacts;
      return [
        ...(f.courses > 0 ? [{ code: "section-has-courses", status: 409, message: "لا يمكن حذف القسم العلمي لوجود مقررات دراسية مرتبطة به", fix: { view: "courses" as const, label: "افتح «المقررات»" } }] : []),
        ...accountsBlocker(f.scopedAccounts, "القسم العلمي"),
      ];
    }
    case "instructor": {
      const f = facts as InstructorGuardFacts;
      return f.appointments > 0 ? [{ code: "instructor-has-appointments", status: 409, message: "لا يمكن حذف عضو هيئة التدريس لوجود بيانات مرتبطة به في الجدول الدراسي" }] : [];
    }
    case "course": {
      const f = facts as CourseGuardFacts;
      return [
        ...(f.curriculumSectionId !== null ? [{
          code: "curriculum-linked", status: 409,
          message: "لا يمكن حذف المقرر لأنه مرتبط بصحيفة أكاديمية. أخرجه من الصحيفة («المقررات ← الصحائف الأكاديمية») أو اتركه تاريخياً بدلاً من حذفه.",
          body: { code: "curriculum-linked", sectionId: f.curriculumSectionId },
          fix: { view: "courses" as const, label: "افتح «الصحائف الأكاديمية»" },
        }] : []),
        ...(f.appointments > 0 ? [{ code: "course-has-appointments", status: 409, message: "لا يمكن حذف المقرر الدراسي لوجود بيانات مرتبطة به في الجدول الدراسي" }] : []),
      ];
    }
    case "user": {
      const f = facts as UserGuardFacts;
      return f.refusal ? [{ code: f.found ? "user-protected" : "user-missing", status: f.found ? 403 : 404, message: f.refusal }] : [];
    }
    default:
      return [];
  }
}

/** الجملةُ التي تلخّص الخريطة للقارئ (وللنص البديل): «١٢ موعداً في الفصل الحالي، ٣ طلبات…». */
export function impactSummaryLine(groups: ReadonlyArray<ImpactGroup>): string {
  const parts = groups.flatMap(group => group.items.filter(item => item.count > 0).map(item => `${countOf(item.count, AR[item.noun] as any)}${item.when ? ` ${item.when}` : ""}`));
  return parts.length ? parts.join("، ") : "لا شيء آخر مرتبط بهذا السجل.";
}

/** مواعيدُ القاعات: يعدّها الخادمُ بالقاعة أو بالرمز القديم في المبنى نفسه. */
export function legacyRoomKey(buildingId: unknown, hall: unknown): string {
  return `${String(buildingId || "")}|${String(hall || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "")}`;
}
