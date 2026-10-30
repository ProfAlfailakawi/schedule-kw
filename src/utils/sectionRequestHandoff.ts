/**
 * ── من «طلب شعبة» إلى محرّر الموعد ──────────────────────────────────────────
 *
 * لجنةُ الجدول تفتح الشعبة بأدوات الموعد القائمة نفسها لا بنموذجٍ ثانٍ: تضغط «افتح الشعبة»
 * في بطاقة الطلب فتُفتح الورشةُ على محرّر الإضافة وفيه المقرر والحرم والفصل، ويُقال لها
 * العددُ والفترة المفضلة. وما تحفظه هناك يُربط بالطلب تلقائياً بعد الحفظ.
 *
 * كأخته `requestHandoff.ts`: تخزينُ اللسان لا العنوان، ويُمحى بأول قراءة.
 */
import type { SectionRequestPeriod } from "./sectionRequests";
import { AR, countOf } from "./arabicCount";

export interface SectionRequestHandoff {
  requestId: string;
  courseId: number;
  collegeId: number;
  sectionId: number;
  termId: number;
  period: SectionRequestPeriod;
  count: number;
  courseName: string;
}

const KEY = "schedule.sectionRequestHandoff";

export function putSectionRequestHandoff(handoff: SectionRequestHandoff): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(handoff)); }
  catch { /* تخزينٌ ممنوع: تُفتح الورشة فارغة، ويبقى «اربط شعبة قائمة» في البطاقة. */ }
}

export function takeSectionRequestHandoff(): SectionRequestHandoff | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); }
  catch { return null; }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SectionRequestHandoff>;
    if (!value.requestId || !Number(value.courseId) || !Number(value.termId) || !Number(value.collegeId)) return null;
    return {
      requestId: String(value.requestId).slice(0, 80),
      courseId: Number(value.courseId), collegeId: Number(value.collegeId), sectionId: Number(value.sectionId) || 0, termId: Number(value.termId),
      period: value.period === "morning" || value.period === "evening" ? value.period : "any",
      count: Math.max(0, Math.trunc(Number(value.count) || 0)),
      courseName: String(value.courseName || "").slice(0, 120),
    };
  } catch { return null; }
}

/** سطرٌ يقول للجنة من أين جاء النموذج وما المطلوب منها. */
export function sectionRequestNotice(handoff: SectionRequestHandoff): string {
  const period = handoff.period === "morning" ? "الفترة المفضلة صباحية" : handoff.period === "evening" ? "الفترة المفضلة مسائية" : "أي فترة";
  return `شعبةٌ لطلب الإرشاد: ${handoff.count ? countOf(handoff.count, AR.student) : "طلبة محددون"} · ${period}. ما تحفظه هنا يُربط بالطلب تلقائياً.`;
}
