/**
 * ── الشاغر وعضو التدريب داخل الموعد ─────────────────────────────────────────
 * في المقترح الدراسي: شعبةٌ شاغرة («هيئة تدريسية») تُسند إلى أستاذٍ حقيقي، وعضوُ تدريبٍ يحمل شارته.
 * هنا «أسند إلى…» لموعدٍ محفوظٍ شاغر (والتبديل السريع من التدريب والشاغر في AppointmentQuickSwap):
 *   • VacantAssign: لموعدٍ محفوظٍ شاغر — «أسند إلى…» يفتح منتقياً، ثم شريحتا الحكم (الأستاذ حرّ/يتداخل ·
 *     النصاب) وزرّ «أسند» الذي يمرّ بمسار الإسناد القائم (placeholder-action) نفسه: تأكيدٌ ثم طلبٌ ذرّيٌّ بتراجع.
 * لا منطقَ خادمٍ جديد، ولا شيء يُكتب من هنا بنفسه.
 */
import React from "react";
import PersonChips from "./PersonChips";
import { CalendarCheck, CalendarX2, Loader2, Scale, UserRoundCheck, UserRoundX, X } from "lucide-react";

export interface SeatVerdict { free: boolean; clashWith?: string; load?: { now: number; after: number; limit: number | null } | null }

export function VacantAssign({ picker, pickedName, pickedVisiting = false, pickedTrainee = false, verdict, busy, onAssign, onClear }: {
  /** منتقي الأستاذ (الحقيقي وحده) يُمرَّر جاهزاً من الأب. */
  picker: React.ReactNode;
  pickedName: string;
  pickedVisiting?: boolean;
  pickedTrainee?: boolean;
  verdict: SeatVerdict | null;
  busy: boolean;
  onAssign: () => void;
  onClear: () => void;
}) {
  return <div className="seat-assign" data-seat-assign>
    <p className="seat-assign-head"><UserRoundX aria-hidden="true" /><b>شاغر</b><small>أسند هذا الموعد كما هو</small></p>
    <div className="seat-assign-pick">{picker}</div>
    {pickedName ? <div className="seat-assign-verdict">
      <span className="seat-assign-who"><UserRoundCheck aria-hidden="true" /><b>{pickedName}</b><PersonChips visiting={pickedVisiting} trainee={pickedTrainee} /></span>
      {verdict ? <>
        <small className={`seat-fact ${verdict.free ? "good" : "bad"}`} title={verdict.clashWith || undefined}>{verdict.free ? <CalendarCheck aria-hidden="true" /> : <CalendarX2 aria-hidden="true" />}{verdict.free ? "حرّ" : "يتداخل"}</small>
        {verdict.load ? <small className={`seat-fact ${verdict.load.limit !== null && verdict.load.after > verdict.load.limit ? "warn" : "muted"}`} title="النصاب الآن ثم بعد الإسناد"><Scale aria-hidden="true" /><bdi dir="ltr">{verdict.load.now} ← {verdict.load.after}</bdi></small> : null}
      </> : null}
      <button type="button" className="seat-assign-go" disabled={busy || (verdict ? !verdict.free : false)}
        data-guide-ignore="يسند الشعبة الشاغرة إلى الأستاذ المختار بتأكيدٍ ثم طلبٍ ذرّيٍّ بتراجع؛ لا يُنشأ موعدٌ جديد"
        onClick={onAssign}>{busy ? <Loader2 aria-hidden="true" className="checks-spin" /> : <UserRoundCheck aria-hidden="true" />}<span>أسند</span></button>
      <button type="button" className="seat-assign-x" aria-label="إلغاء الاختيار" data-guide-ignore="يلغي اختيار الأستاذ لإسناد الشعبة الشاغرة؛ لا يحفظ شيئاً" onClick={onClear}><X aria-hidden="true" /></button>
    </div> : null}
  </div>;
}
