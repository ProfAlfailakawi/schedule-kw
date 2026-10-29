/**
 * ── 🎓 مرحلة التدريب (F1–F3) ─────────────────────────────────────────────────
 *
 * تُفتح بعد إغلاق مرحلة الأساتذة. الشعبُ الشاغرة = الشعب المسندة إلى «هيئة تدريسية»
 * (src/utils/placeholderInstructor.ts). يُرسل للمدرّبين (TA) رابطُ البطاقة نفسها بصفة
 * «ta» (src/utils/linkMode.ts): لا وقتَ ولا شعبةَ ولا قاعةَ جديدة — بطاقاتُ الشعب
 * الشاغرة فقط، والمحرّكُ القائم (availableInstructorOfferings) هو من يقرّر أيّها
 * بلا تعارضٍ وضمن النصاب. هذه الوحدة: الملخّص، والموجات، والعدّاد، وحلقة النصاب.
 */
export interface TaWave {
  n: number;
  instructorIds: number[];
  /** موعدُ الإرسال المجدول (ISO). */
  sendAt: string;
  /** لحظةُ الإرسال الفعلي. */
  sentAt?: string;
}

export interface TaPhaseDoc {
  /** `${collegeId}:${sectionId}:${termId}` */
  id: string;
  AdCollegeId: number;
  AdSectionId: number;
  AdTermId: number;
  openedAt: string;
  openedBy?: string;
  /** نهاية نافذة الاختيار (ISO، بتوقيت الكويت عند الإدخال). */
  closesAt: string;
  waves: TaWave[];
  /** instructorId ← المقررات المسموحة (فارغ/غائب = كل مقررات القسم الشاغرة). */
  allowedCourses?: Record<string, number[]>;
  /** التذكير التلقائي: ساعاتٌ قبل الإغلاق يظهر فيها شريطُ «تذكير» في البطاقة واللوحة. */
  reminderHours: number;
  closedAt?: string;
}

export interface VacantRow {
  id: number;
  AdCourseId: number;
  SCode?: string;
  AdInstructorId: number;
  fstarttime: string;
  fendtime: string;
  AdRoomCode?: string;
  AdRoomHall?: string;
  fsunday?: boolean | number; fmonday?: boolean | number; ftuesday?: boolean | number; fwednesday?: boolean | number; fthursday?: boolean | number;
}

export interface VacantSection {
  key: string;
  courseId: number;
  sectionCode: string;
  rowIds: number[];
  days: string[];
  start: string;
  end: string;
  room: string;
}

const DAY_FIELDS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

/** الشعبُ الشاغرة: كلُّ صفوفها على «هيئة تدريسية». شعبةٌ نصفها مسند ليست شاغرة. */
export function vacantSections(rows: readonly VacantRow[], placeholderIds: ReadonlySet<number>): VacantSection[] {
  const groups = new Map<string, VacantRow[]>();
  for (const row of rows) {
    const key = `${row.AdCourseId}:${String(row.SCode || "").trim() || `row-${row.id}`}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups].filter(([, list]) => list.every(row => placeholderIds.has(Number(row.AdInstructorId))))
    .map(([key, list]) => {
      const first = list[0];
      return {
        key, courseId: Number(first.AdCourseId), sectionCode: String(first.SCode || ""), rowIds: list.map(row => Number(row.id)),
        days: [...new Set(list.flatMap(row => DAY_FIELDS.filter(day => row[day])))],
        start: first.fstarttime, end: first.fendtime,
        room: [first.AdRoomCode, first.AdRoomHall].filter(Boolean).join("/"),
      };
    }).sort((a, b) => a.courseId - b.courseId || a.sectionCode.localeCompare(b.sectionCode));
}

/** ملخّص اللوحة: عددُ الشعب الشاغرة وعدد مقرراتها. */
export function vacantSummary(sections: readonly VacantSection[]) {
  return { sections: sections.length, courses: new Set(sections.map(row => row.courseId)).size };
}

/**
 * الموجات: «دفعة واحدة» = موجة واحدة الآن؛ وإلا موجةٌ لكل مجموعة أولوية،
 * تفصل بينها `delayHours`. لا تُكرَّر هويّة في موجتين.
 */
export function planWaves(groups: number[][], delayHours: number, now = new Date()): TaWave[] {
  const seen = new Set<number>();
  const delay = Math.max(0, Math.min(14 * 24, Number(delayHours) || 0));
  return groups.map(list => list.map(Number).filter(id => id > 0 && !seen.has(id) && (seen.add(id), true)))
    .filter(list => list.length)
    .map((list, index) => ({ n: index + 1, instructorIds: list, sendAt: new Date(now.getTime() + index * delay * 3600000).toISOString() }));
}

/** موجاتٌ حلّ موعدها ولم تُرسل. */
export const dueWaves = (doc: TaPhaseDoc, now = Date.now()) =>
  doc.closedAt ? [] : doc.waves.filter(wave => !wave.sentAt && Date.parse(wave.sendAt) <= now);

export function phaseOpen(doc: TaPhaseDoc | null | undefined, now = Date.now()): boolean {
  return !!doc && !doc.closedAt && Date.parse(doc.closesAt) >= now;
}

/** العدّاد: ما بقي حتى الإغلاق، وهل حلّت نافذة التذكير. */
export function countdown(doc: Pick<TaPhaseDoc, "closesAt" | "reminderHours">, now = Date.now()) {
  const left = Math.max(0, Date.parse(doc.closesAt) - now);
  const hours = Math.floor(left / 3600000), minutes = Math.floor((left % 3600000) / 60000);
  return { leftMs: left, days: Math.floor(hours / 24), hours: hours % 24, minutes, remind: left > 0 && left <= Math.max(1, Number(doc.reminderHours || 24)) * 3600000, closed: left <= 0 };
}

/** مقرراتٌ مسموحة لمدرّب: القائمةُ إن وُضعت، وإلا لا قيد. */
export function allowedFor(doc: Pick<TaPhaseDoc, "allowedCourses"> | null | undefined, instructorId: number): Set<number> | null {
  const list = doc?.allowedCourses?.[String(Number(instructorId))];
  return Array.isArray(list) && list.length ? new Set(list.map(Number)) : null;
}

/** حلقة النصاب «نصابك 6/12» — النسبة واللون. بلا نصابٍ مسجّل: لا حلقة (لا يُخترع رقم).
 *  «الإضافي» (من الدرجة أو الاستثناء) يجعل ما بين النصاب والسقف لوناً هادئاً «overtime»، لا امتلاءً أحمر. */
export function loadRing(hours: number, load: number, overtime = 0, limited = load > 0) {
  /* «limited» مع نصابٍ صفر: إعفاءٌ كامل باستثناء — قيدٌ حقيقي، فأيُّ ساعةٍ تملأ الحلقة. */
  if (!(load > 0) && !(limited && load === 0)) return null;
  const extra = Math.max(0, Math.round(Number(overtime) || 0));
  const ratio = load > 0 ? Math.min(1, Math.max(0, hours / load)) : hours > 0 ? 1 : 0;
  const tone = hours > load + extra ? "full" : extra && hours > load ? "overtime" : hours >= load ? (extra ? "near" : "full") : ratio >= 0.75 ? "near" : "open";
  return { hours, load, overtime: extra, ratio, label: extra ? `نصابك ${hours}/${load} وإضافيّ ${extra}` : `نصابك ${hours}/${load}`, tone };
}
