/**
 * ── ملاحظاتُ الجدول وحالاتُها ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import type { ScheduleComment, ScheduleNoteField } from "../../types";
import { normalizeClock } from "../../utils/scheduleTime";
import { legacyFDetail } from "./scope";

export const NOTE_FIELD_LABEL: Record<ScheduleNoteField, string> = {
  time: "الوقت", days: "الأيام", room: "القاعة", instructor: "أستاذ المقرر",
  sectionCode: "رقم الشعبة", course: "المقرر", row: "الموعد كاملاً",
};

/**
 * القيمة التي تحملها الخانة الآن.
 *
 * هي أساسُ كل شيء بعدها: تُحفظ لحظة الملاحظة، وتُقارن بما صار إليه الصفّ فتقول
 * الحالة. ولذلك تُشتقّ من مكانٍ واحد — لو اختلفت صيغةُ القراءة عن صيغة الكتابة
 * لظهرت كل خانةٍ متغيّرةً وهي لم تُمسّ.
 */
export function noteFieldValue(row: any, field: ScheduleNoteField): string {
  if (!row) return "";
  switch (field) {
    case "time": return `${normalizeClock(String(row.fstarttime || ""))}-${normalizeClock(String(row.fendtime || ""))}`;
    case "days": return legacyFDetail(row);
    case "room": return `${String(row.AdRoomCode || "")}/${String(row.AdRoomHall || "")}`;
    case "instructor": return String(Number(row.AdInstructorId || 0));
    case "sectionCode": return String(row.SCode || "");
    case "course": return String(Number(row.AdCourseId || 0));
    case "row": return [
      normalizeClock(String(row.fstarttime || "")), normalizeClock(String(row.fendtime || "")),
      legacyFDetail(row), String(row.AdRoomCode || ""), String(row.AdRoomHall || ""),
      String(Number(row.AdInstructorId || 0)), String(row.SCode || ""), String(Number(row.AdCourseId || 0)),
    ].join("|");
  }
}

/** حالة الملاحظة، محسوبةً من الواقع لا مقروءةً من علَم. */
export function noteState(note: ScheduleComment, row: any): "open" | "changed" | "answered" | "resolved" | "removed" {
  if (!row) return "removed";
  /* ── الملاحظةُ المحسومة ليست ملاحظةً تنتظر ─────────────────────────────
   *
   * قبولُ التسجيل لتبرير القسم يُغلق الملاحظة ويُبقي نصَّ الردّ — وهو مقصود،
   * فالحجّةُ تُحفظ. لكنّ قراءة الردّ وحدها كانت تُبقيها «أُجيب عنها» إلى
   * الأبد: يعدّها الوارد ردّاً ينتظر قراراً، وتُعرض أزرارُ القرار على قرارٍ
   * اتُّخذ.
   *
   * فالحسمُ يُقرأ قبل الردّ: ما قُبل انتهى، وما بقي ردُّه بلا قرارٍ ينتظر. */
  if (note.resolved || note.rebuttalVerdict === "accepted") return "resolved";
  if (note.rebuttal) return "answered";
  const field = (note.field || "row") as ScheduleNoteField;
  return noteFieldValue(row, field) !== String(note.valueAtNote ?? "") ? "changed" : "open";
}

/** الملاحظات مع حالتها الحيّة، لكل من يعرضها. */
export async function notesWithState(collegeId: number, sectionId: number, termId: number) {
  const [notes, rows] = await Promise.all([
    Repository.getScheduleCommentsByScope(collegeId, sectionId, termId),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
  ]);
  const byId = new Map(rows.map((row: any) => [Number(row.id), row]));
  return notes
    .filter(note => note.origin === "registrar" || note.origin === "department")
    .map(note => {
      const row = byId.get(Number(note.scheduleId));
      const field = (note.field || "row") as ScheduleNoteField;
      return {
        ...note,
        field,
        fieldLabel: NOTE_FIELD_LABEL[field],
        state: noteState(note, row),
        valueNow: row ? noteFieldValue(row, field) : undefined,
      };
    });
}
