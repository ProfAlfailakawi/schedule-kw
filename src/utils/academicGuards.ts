/**
 * ── حرّاس «البيانات الأكاديمية»: قاعدةٌ واحدة للعميل والخادم ─────────────────
 *
 * التكرار، وحدُّ النصاب، والحسابات التي تبقى معلّقةً بكليةٍ أو قسمٍ يُحذف —
 * تُقرأ هنا في الموضعين، فلا يقول النموذج شيئاً ويقول الخادم غيره.
 */
import { normalizeArabicText } from "./arabicText";
import { AR, countOf } from "./arabicCount";
import { SAME_BUILDING_MINUTES } from "./campusTravel";

/** الرمز: بلا مسافات أطراف وبلا فرق حالة الأحرف (COE و coe رمزٌ واحد). */
export const sameReferenceCode = (a: unknown, b: unknown): boolean => {
  const norm = (v: unknown) => String(v ?? "").normalize("NFKC").trim().toLowerCase();
  return norm(a) !== "" && norm(a) === norm(b);
};

/** الاسم: بأشكال الحروف العادية وبمسافةٍ واحدة بين الكلمات. */
export const sameReferenceName = (a: unknown, b: unknown): boolean => {
  const norm = (v: unknown) => normalizeArabicText(String(v ?? "")).replace(/\s+/g, " ").trim();
  return norm(a) !== "" && norm(a) === norm(b);
};

/** «داخل المبنى نفسه» صفرٌ مشروع (قاعتان متجاورتان)؛ الغيابُ وحده يعيد الافتراضي. */
export function sameBuildingMinutesOf(raw: unknown, fallback = SAME_BUILDING_MINUTES): number {
  const value = raw === null || raw === undefined || String(raw).trim() === "" ? NaN : Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(30, Math.round(value))) : fallback;
}

/** أعلى نصابٍ يُقبل — كما يقرؤه الخادم منذ البداية (instructorsRoutes). */
export const INSTRUCTOR_LOAD_MAX = 40;

/**
 * قراءةُ النصاب المرسَل: فارغٌ أو صفرٌ = بلا نصاب، ورقمٌ من ١ إلى ٤٠ يُقرَّب ويُحفظ،
 * وغيرُ ذلك خطأٌ يُقال لصاحبه — لا يُمحى النصابُ المحفوظ بصمت.
 */
export function readInstructorLoad(raw: unknown): { load: number | null } | { error: string } {
  if (raw === undefined || raw === null || String(raw).trim() === "") return { load: null };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return { error: "النصاب رقمٌ موجب من الساعات." };
  if (value === 0) return { load: null };
  if (value > INSTRUCTOR_LOAD_MAX) return { error: `النصاب لا يتجاوز ${countOf(INSTRUCTOR_LOAD_MAX, AR.hour)}. اتركه فارغاً إن لم يكن له نصاب.` };
  return { load: Math.round(value) };
}

/**
 * حساباتٌ نطاقُها الكلية (أو القسم) المراد حذفها. حذفُ الكلية وهي باقية يترك
 * حساباً يدخل إلى نطاقٍ لا وجود له، فيُمنع الحذف ويُسمّى كل حسابٍ ليُعالَج من «المستخدمون».
 */
export function accountsScopedTo(
  users: ReadonlyArray<{ SystemUserId: number; SystemUserLogin?: string; Name?: string; IsDeleted?: boolean }>,
  assigns: ReadonlyArray<{ SystemUserId: number; AdCollegeId: number; AdSectionId: number }>,
  target: { collegeId?: number; sectionId?: number },
): string[] {
  const live = new Map(users.filter(user => !user.IsDeleted).map(user => [Number(user.SystemUserId), user]));
  const ids = new Set<number>();
  for (const row of assigns) {
    const hit = target.sectionId
      ? Number(row.AdSectionId) === Number(target.sectionId)
      : Number(row.AdCollegeId) === Number(target.collegeId);
    if (hit && live.has(Number(row.SystemUserId))) ids.add(Number(row.SystemUserId));
  }
  return [...ids].map(id => String(live.get(id)?.SystemUserLogin || live.get(id)?.Name || id)).sort((a, b) => a.localeCompare(b));
}
