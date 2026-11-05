import React from "react";
import { createRoot } from "react-dom/client";
import { CalendarCheck, Clock3, X } from "lucide-react";
import type { FSchedule } from "../types";

/**
 * ── حجزُ طلبٍ ينتظر قرارك (ملاحظتا المالك 4 و10) ─────────────────────────────
 * اختيارُ الأستاذ يحجز القاعة حتى «ثبّت/رفض»، و«موعد» يقارن ولا يمنع: ورقةٌ واحدة تقول مَن حجز
 * وماذا طلب، والقرارُ للقسم. الوقتُ نفسُه للأستاذ والمقرر نفسيهما: ثبّت الطلب أو ارفضه؛ وغيرُ ذلك:
 * استخدمها ويبقى الطلب، أو استخدمها وارفض الطلب.
 */
export interface RequestHold {
  requestId: string;
  requestRevision?: number;
  instructorId?: number;
  instructorName?: string;
  itemIndex?: number;
  itemId?: string;
  courseId?: number;
  courseName?: string;
  days?: string[];
  start?: string;
  end?: string;
}
export type RequestHoldChoice = "use" | "fix" | "reject" | null;

const DAY_NAMES: Record<string, string> = { fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس" };
const DAY_KEYS = Object.keys(DAY_NAMES);

/** ما يُحفظ هو ما طلبه الأستاذ بعينه: الأستاذ والمقرر والأيام والبداية. */
export function holdMatchesDraft(hold: RequestHold, draft?: Partial<FSchedule>): boolean {
  if (!draft || !hold.days?.length) return false;
  const days = DAY_KEYS.filter(day => Boolean((draft as any)[day]));
  return Number(draft.AdInstructorId) === Number(hold.instructorId) && Number(draft.AdCourseId) === Number(hold.courseId)
    && String(draft.fstarttime || "").slice(0, 5) === String(hold.start || "").slice(0, 5)
    && days.join("+") === DAY_KEYS.filter(day => hold.days!.includes(day)).join("+");
}

function RequestHoldSheet({ holds, verb, draft, onChoose }: { holds: RequestHold[]; verb: string; draft?: Partial<FSchedule>; onChoose: (choice: RequestHoldChoice) => void }) {
  const same = holds.every(hold => holdMatchesDraft(hold, draft));
  const canReject = holds.every(hold => hold.itemIndex != null);
  return (
    <div className="changes-extend-sheet request-hold-sheet" role="dialog" aria-modal="true" aria-label="حجز طلب أستاذ" dir="rtl">
      <div className="changes-extend-card">
        <header>
          <strong><Clock3 aria-hidden="true" />{same ? "الوقت نفسه في طلب الأستاذ" : "هناك حجز"}</strong>
          <button type="button" onClick={() => onChoose(null)} aria-label="إغلاق" data-guide-ignore="إغلاق الورقة — لا يغيّر شيئاً"><X /></button>
        </header>
        <ul className="request-hold-list">
          {holds.map(hold => (
            <li key={`${hold.requestId}:${hold.itemId || ""}`}>
              <b>{hold.instructorName || "أستاذ"}</b>
              {hold.courseName ? <span>{hold.courseName}</span> : null}
              {hold.days?.length ? <small>{hold.days.map(day => DAY_NAMES[day] || day).join(" · ")} <bdi dir="ltr">{hold.start}–{hold.end}</bdi></small> : null}
            </li>
          ))}
        </ul>
        <div className="request-hold-actions">
          {same ? <button type="button" className="is-primary" data-guide-ignore="يحفظ الموعد ويثبّت بند الطلب المطابق" onClick={() => onChoose("fix")}><CalendarCheck aria-hidden="true" />ثبّت الطلب</button>
            : <button type="button" className="is-primary" data-guide-ignore="يكمل الحفظ ويبقى الطلب في الوارد" onClick={() => onChoose("use")}>{verb === "الحذف" ? "متابعة الحذف" : "استخدمها"} · يبقى الطلب</button>}
          {canReject ? <button type="button" data-guide-ignore="يرفض بند الطلب ثم يكمل الحفظ" onClick={() => onChoose("reject")}>{same ? "ارفض الطلب" : "ارفض الطلب واستخدمها"}</button> : null}
          <button type="button" data-guide-ignore="تراجع — لا يغيّر شيئاً" onClick={() => onChoose(null)}>تراجع</button>
        </div>
      </div>
    </div>
  );
}

/** يفتح الورقة ويعيد القرار. مركّبٌ مستقل لأن السؤال يقع داخل مسار حفظٍ لا داخل رسمٍ بعينه. */
export function askRequestHold(input: { holds: RequestHold[]; verb: string; draft?: Partial<FSchedule> }): Promise<RequestHoldChoice> {
  return new Promise(resolve => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<RequestHoldSheet {...input} onChoose={choice => { root.unmount(); host.remove(); resolve(choice); }} />);
  });
}
