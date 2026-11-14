/**
 * ── «سجلّ الأساتذة»: حالةٌ هادئة واحدة لكل أستاذ ─────────────────────────────────
 *
 * الواردُ يعرض طلباً طلباً؛ والقسمُ يسأل عن الأستاذ: ثبّت جدولَه؟ عدّل؟ لم يردّ؟ هو عندك قيد المراجعة؟ أم بطاقتُه
 * للعرض فقط؟ هنا خمسُ حالاتٍ لا تتداخل، تُحسب من الطلب الأحدث للأستاذ وحده — أياً كان عددُ الإرسالات التي وصلته
 * (مجموعةٌ أولى ثم ثانية ثم خاص): رابطُه واحد وطلبُه واحد وسجلُّه واحد.
 *
 *   silent     لم يردّ       أُرسلت له ولم يرسل شيئاً (فتح الرابط أو لم يفتحه)
 *   review     قيد المراجعة   أرسل، والقسمُ بدأ يقرّر في بنوده
 *   edited     عدّل          أرسل طلباً فيه تعديلٌ أو إضافةٌ أو حذفٌ أو ملاحظة
 *   confirmed  ثبّت          أرسل «جدولي كما هو» بلا تغيير
 *   viewOnly   للعرض فقط     بطاقتُه عرضٌ لا ينتظر منه جواباً
 *
 * و«العالق في العرض»: بطاقتُه عرضٌ لا تعديلَ فيه (نافذتُه أُغلقت أو رابطُه للعرض) والقسمُ لم يُنهِ طلبَه — له
 * زرُّ «افتح التعديل» على سطره. دوالُّ خالصة تقرؤها الشاشةُ والاختبار معاً.
 */
import type { InstructorRequest, InstructorRequestItem } from "../types";
import { requestWindowOpen } from "./instructorRequestWindows";
import { linkMode } from "./linkMode";
import { latestRequestByInstructor } from "./requestReissue";

export type RegistryStatus = "silent" | "review" | "edited" | "confirmed" | "viewOnly";
export const REGISTRY_STATUSES: readonly RegistryStatus[] = ["silent", "review", "edited", "confirmed", "viewOnly"];
export const REGISTRY_LABEL: Record<RegistryStatus, string> = {
  silent: "لم يردّ", review: "قيد المراجعة", edited: "عدّل", confirmed: "ثبّت", viewOnly: "للعرض فقط",
};

export type RegistryRow = Pick<InstructorRequest, "status" | "linkMode" | "submittedAt" | "createdAt" | "window" | "individualException" | "linkOpenedAt" | "linkOpenDays" | "linkLastOpenAt" | "note" | "pinViolations" | "remindedAt"> & {
  AdInstructorId: number;
  items?: ReadonlyArray<Pick<InstructorRequestItem, "action"> & { hidden?: boolean }>;
};

/** حالةُ الأستاذ، أو null لمن لا يدخل السجلّ (مستبدَل، أو مرحلة التدريب ولها لوحتُها). */
export function registryStatusOf(row: RegistryRow): RegistryStatus | null {
  if (row.status === "superseded" || linkMode(row) === "ta") return null;
  if (linkMode(row) === "view") return "viewOnly";
  if (row.status === "sent") return "silent";
  if (row.status === "in-review") return "review";
  const asked = (row.items || []).some(item => item.action !== "keep" && !item.hidden);
  return asked || row.note || row.pinViolations ? "edited" : "confirmed";
}

/** أحدثُ طلبٍ لكل أستاذٍ يدخل السجلّ: «الإرسالان» يُقرآن تاريخاً واحداً لا صفّين. */
export function registryLatest<T extends RegistryRow>(rows: readonly T[]): T[] {
  return [...latestRequestByInstructor(rows.filter(row => registryStatusOf(row) !== null)).values()];
}

export function registryTally(rows: readonly RegistryRow[]): Record<RegistryStatus, number> {
  const tally = Object.fromEntries(REGISTRY_STATUSES.map(status => [status, 0])) as Record<RegistryStatus, number>;
  for (const row of rows) { const status = registryStatusOf(row); if (status) tally[status] += 1; }
  return tally;
}

/** بطاقتُه عرضٌ لا تعديلَ فيه والقسمُ لم يُنهِ طلبَه: يستحقّ «افتح التعديل». */
export function viewOnlyStuck(row: RegistryRow, now: number = Date.now()): boolean {
  if (row.status === "settled" || row.status === "superseded" || linkMode(row) === "ta") return false;
  return linkMode(row) === "view" || !requestWindowOpen(row, now);
}

/** مرّاتُ فتح الرابط وآخرُها: من عدّاد الأيام الذي يكتبه الخادم (مرةً كل نصف ساعة على الأكثر). */
export function registryOpens(row: Pick<RegistryRow, "linkOpenDays" | "linkLastOpenAt" | "linkOpenedAt">): { count: number; lastAt: string } {
  const count = Object.values(row.linkOpenDays || {}).reduce((sum, value) => sum + (Number(value) || 0), 0) || (row.linkOpenedAt ? 1 : 0);
  return { count, lastAt: String(row.linkLastOpenAt || row.linkOpenedAt || "") };
}

/** الموعدُ المقترح لفتح التعديل: بعد ثلاثة أيام، آخرَ اليوم بتوقيت الكويت (YYYY-MM-DDTHH:mm كما يكتبه الإصدار). */
export function suggestedDeadline(now: number = Date.now(), days = 3): string {
  return `${new Date(now + days * 86400000 + 3 * 3600000).toISOString().slice(0, 10)}T23:59`;
}
