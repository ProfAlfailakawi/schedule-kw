/** سقفُ وحدات الطالب في «مساري»: خياراتٌ ثلاثة يحددها القسم (ملاحظة المالك 14)، والغائبُ ١٥ كما كان. */
export const STUDENT_UNIT_CAPS = [15, 18, 21] as const;
export const DEFAULT_STUDENT_UNIT_CAP = 15;
export const studentUnitCapOf = (value: unknown): number =>
  (STUDENT_UNIT_CAPS as readonly number[]).includes(Number(value)) ? Number(value) : DEFAULT_STUDENT_UNIT_CAP;
export const sectionStudentSettingsId = (sectionId: unknown) => `section_${Number(sectionId) || 0}`;
