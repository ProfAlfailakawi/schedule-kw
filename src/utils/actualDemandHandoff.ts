/**
 * ── من «الطلب الفعلي» إلى محرّر الموعد ──────────────────────────────────────────
 *
 * «عالج» على مقررٍ يحتاجه الطلبة ولا شعبة له يفتح الورشة على محرّر الإضافة وفيه المقرر
 * وكليته وقسمه وفصله، ويُقال للجنة كم طالباً ينتظره. لا يُكتب شيء قبل الحفظ هناك.
 * كأختيه (requestHandoff · sectionRequestHandoff): تخزينُ اللسان لا العنوان، ويُمحى بأول قراءة.
 */
import { AR, countOf, oblique } from "./arabicCount";

export interface ActualDemandHandoff {
  courseId: number;
  collegeId: number;
  sectionId: number;
  termId: number;
  students: number;
  graduates: number;
}

const KEY = "schedule.actualDemandHandoff";

export function putActualDemandHandoff(handoff: ActualDemandHandoff): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(handoff)); }
  catch { /* تخزينٌ ممنوع: تُفتح الورشة فارغة. */ }
}

export function takeActualDemandHandoff(): ActualDemandHandoff | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); }
  catch { return null; }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ActualDemandHandoff>;
    if (!Number(value.courseId) || !Number(value.collegeId) || !Number(value.termId)) return null;
    const count = (n: unknown) => Math.max(0, Math.trunc(Number(n) || 0));
    return { courseId: Number(value.courseId), collegeId: Number(value.collegeId), sectionId: Number(value.sectionId) || 0, termId: Number(value.termId), students: count(value.students), graduates: count(value.graduates) };
  } catch { return null; }
}

/** يسمعه الجدول الدراسي حين يُضغط «عالج» من داخله: يفتح المحرّر بلا إعادة تحميل الصفحة. */
export const ACTUAL_DEMAND_HANDOFF_EVENT = "schedule:actual-demand-handoff";

/** يُطلق بعد كل رفعٍ أو ربطٍ ناجح للطلب الفعلي (أدوات الجدول، مركز التحليلات)، فيعيد تنبيهُ الجدول الدراسي قراءته. */
export const ACTUAL_DEMAND_CHANGED_EVENT = "schedule:actual-demand-changed";
export function announceActualDemandChange(): void {
  try { window.dispatchEvent(new Event(ACTUAL_DEMAND_CHANGED_EVENT)); } catch { /* بلا نافذة: لا شيء يسمع. */ }
}

/**
 * «عالج»: تُخزَّن البذرة ثم يُفتح المحرّر. من داخل الجدول الدراسي (inPlace) يكفي حدثٌ يسمعه،
 * ومن خارجه (مركز التحليلات) يُنتقل إليه فيقرؤها عند فتحه.
 */
export function openActualDemandFix(handoff: ActualDemandHandoff, inPlace = false): void {
  putActualDemandHandoff(handoff);
  if (inPlace) window.dispatchEvent(new Event(ACTUAL_DEMAND_HANDOFF_EVENT));
  else window.location.assign("/FSchedule/Index");
}

/** أثرُ الموعد على الخريجين قبل حفظه: «يمسّ ٧ خريجين» (تعارضٌ بين مقررين يحتاجهما خريجو البرنامج نفسه). */
export const graduateImpactNote = (graduates: number) => `يمسّ ${countOf(graduates, oblique(AR.graduate))}: يتعارض مع مقررٍ يحتاجه خريجو البرنامج نفسه`;

/** سطرٌ يقول للجنة من أين جاء النموذج. */
export function actualDemandNotice(handoff: ActualDemandHandoff): string {
  const who = handoff.graduates ? `${countOf(handoff.students, AR.student)}، منهم ${countOf(handoff.graduates, AR.graduate)}` : countOf(handoff.students, AR.student);
  return `الطلب الفعلي: ${who} يحتاجون هذا المقرر ولا شعبة له.`;
}
