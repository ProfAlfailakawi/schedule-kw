/**
 * ── حارسُ الكتابة: «سبقك زميل» ──────────────────────────────────────────────────
 *
 * فحصُ التعارض في معالجَي الحفظ والتعديل يجري قبل الكتابة بلحظات؛ ومنسّقان يحفظان القاعة والساعة نفسيهما
 * معاً كان كلٌّ منهما يمرّ على أسبوعٍ لا يرى فيه الآخر. فالمستودع يستدعي هذا الحارس **داخل** معاملة الكتابة
 * (Firestore) أو تحت قفل الفصل (التجريبي)، على صفوف الفصل كما هي لحظةَ الكتابة، فيُرفض الخاسر بـ409
 * ورمزٍ ثابتٍ `slot-taken` تقرؤه الواجهة فتقول «سبقك زميل» وتعرض البدائل.
 *
 * الحكمُ هو نفسه حكمُ بوابة الحفظ (isBlockingConflict وسقفُ ساعات الشعبة)، ولا يمنع إلا ما استجدّ:
 * موعدٌ محفوظٌ يتعارض أصلاً مع غيره يبقى قابلاً لإعادة حفظه كما هو (A6).
 */
import { Repository, type ScheduleWriteGuard } from "../../db/repository";
import type { FSchedule } from "../../types";
import { findConflicts, isBlockingConflict } from "../../utils/scheduleIntelligence";
import { effectiveCourseHours, maxWeeklyMinutesFor, sectionWeeklyHours } from "../../utils/scheduleRegulations";
import { sectionCodeKey } from "../../utils/sameSlot";
import { overHoursMessage } from "../../utils/hoursIssue";
import { placeholderInstructorIds } from "../../utils/instructorIdentity";
import { canonicalizeHistoricalLocationForRuntime, readLocationRegistry } from "./locations";

export const SLOT_TAKEN_CODE = "slot-taken";

/** خسر هذا الطلبُ السباقَ: القاعةُ أو الأستاذ أو سقفُ الساعات أخذه كاتبٌ آخر قبل لحظةِ الكتابة. */
export class SlotTakenError extends Error {
  readonly code = SLOT_TAKEN_CODE;
  constructor(message: string, public readonly issues: any[]) {
    super(message);
    this.name = "SlotTakenError";
  }
}

/** هويةُ التعارض: النوعُ + الصفُّ الآخر + (الأستاذ أو القاعة) المتعارَض عليه — ليُعرف ما كان قائماً وما استجدّ. */
export function conflictKey(conflict: { type?: unknown; otherId?: unknown }, row: any): string {
  const type = String(conflict?.type || "");
  const detail = type === "instructor" ? String(Number(row?.AdInstructorId || 0))
    : type === "room" ? String(row?.roomId || `${row?.AdRoomCode || ""}/${row?.AdRoomHall || ""}`)
      : type === "duplicate" || type === "sectionTwice" ? `${Number(row?.AdCourseId || 0)}:${sectionCodeKey(row?.SCode)}`
        : "";
  return `${type}|${String(conflict?.otherId ?? "")}|${detail}`;
}

/** يُقرأ بعد فحص التعارض وقبل الكتابة: لا أثر له إلا في الاختبار (يفتح نافذةَ السباق عمداً)، ولا يعمل في الإنتاج. */
export async function pauseAfterCheckForTests(): Promise<void> {
  const ms = Number(process.env.SCHEDULE_TEST_DELAY_AFTER_CHECK_MS || 0);
  if (ms > 0 && process.env.NODE_ENV !== "production") await new Promise(resolve => setTimeout(resolve, ms));
}

/** يبني الحارسَ بما يلزمه من مراجع (السجل والأساتذة) مرةً واحدة قبل دخول المعاملة. */
export async function makeSlotGuard(): Promise<ScheduleWriteGuard> {
  const [registry, instructors] = await Promise.all([readLocationRegistry(), Repository.getInstructors()]);
  const placeholders = placeholderInstructorIds(instructors as any);
  const nameOf = new Map((instructors as any[]).map(person => [Number(person.AdInstructorId), String(person.AdInstructorName || "")]));
  return async (week: FSchedule[], next: FSchedule, current?: FSchedule) => {
    const normalize = (row: FSchedule) => canonicalizeHistoricalLocationForRuntime(row, registry);
    const others = week.filter(row => Number(row.id) !== Number(next.id)).map(normalize);
    const blockersOf = (row: FSchedule) => findConflicts([normalize(row)], others, { placeholderInstructorIds: placeholders }).filter(isBlockingConflict);
    const known = new Set((current ? blockersOf(current) : []).map(conflict => conflictKey(conflict, current)));
    const fresh = blockersOf(next).filter(conflict => !known.has(conflictKey(conflict, next)));
    const issues: any[] = fresh.map(conflict => {
      const message = conflict.type === "instructor"
        ? `الأستاذ ${nameOf.get(Number(next.AdInstructorId)) || ""} لديه محاضرة متداخلة`.replace(/\s+/g, " ")
        : conflict.type === "room" ? `القاعة ${next.AdRoomCode}/${next.AdRoomHall} مشغولة في نفس الوقت`
          : "يوجد موعد مطابق تماماً لنفس المقرر والشعبة";
      return { type: conflict.type, severity: "high", rowId: 0, otherId: 0, message };
    });
    /* سقفُ ساعات الشعبة: الشعبةُ بمفتاحها القانوني (901 = 0901)، ومن لم يزد المجموع بتعديله لا يُمنع. */
    const hours = effectiveCourseHours(await Repository.getCourseById(Number(next.AdCourseId)));
    if (hours > 0) {
      const code = sectionCodeKey(next.SCode);
      const siblings = week.filter(other => Number(other.id) !== Number(next.id) && Number(other.AdCourseId) === Number(next.AdCourseId)
        && Number(other.AdCollegeId) === Number(next.AdCollegeId) && Number(other.AdSectionId) === Number(next.AdSectionId)
        && Number(other.AdTermId) === Number(next.AdTermId) && sectionCodeKey(other.SCode) === code);
      const reading = sectionWeeklyHours(next as any, siblings as any, hours);
      if (reading.total > maxWeeklyMinutesFor(hours)
        && !(current && reading.total <= sectionWeeklyHours(current as any, siblings as any, hours).total)) {
        issues.push({ type: "hours", severity: "high", rowId: 0, otherId: 0, message: overHoursMessage(hours, reading.total) });
      }
    }
    if (issues.length) throw new SlotTakenError(issues[0].message, issues);
  };
}
