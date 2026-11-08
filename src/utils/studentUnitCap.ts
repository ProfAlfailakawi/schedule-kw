/**
 * سقفُ وحدات الطالب في «مساري»: إعدادٌ واحدٌ للجامعة يضعه المدير الرئيسي في
 * «البيانات الأكاديمية» ← الفصول (قرار المالك 2026-11-08). كان قبلُ قرارَ كل قسم؛
 * ووثائقُ الأقسام القديمة (sectionStudentSettings) تبقى في البيانات ولا تُقرأ.
 */
export const STUDENT_UNIT_CAP_MIN = 3;
export const STUDENT_UNIT_CAP_MAX = 30;
/** الغائبُ ١٥ كما كان. */
export const DEFAULT_STUDENT_UNIT_CAP = 15;
/** أدنى ما يُقترح للطالب في فصله، ما لم يكن السقف دونه. */
export const STUDENT_UNIT_FLOOR = 12;
export const UNIVERSITY_UNIT_CAP_DOC = { collection: "universityStudentSettings", id: "university" } as const;

export const studentUnitCapProblem = (value: unknown): string | null => {
  const n = typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;
  return Number.isInteger(n) && n >= STUDENT_UNIT_CAP_MIN && n <= STUDENT_UNIT_CAP_MAX
    ? null
    : `السقف عددٌ صحيح من ${STUDENT_UNIT_CAP_MIN} إلى ${STUDENT_UNIT_CAP_MAX}.`;
};
export const studentUnitCapOf = (value: unknown): number =>
  studentUnitCapProblem(value) ? DEFAULT_STUDENT_UNIT_CAP : Number(value);
/** أدنى الوحدات تحت سقفٍ ما: ١٢، أو السقفُ نفسه إن كان دونها. */
export const studentUnitFloorOf = (cap: number): number => Math.min(STUDENT_UNIT_FLOOR, cap);
