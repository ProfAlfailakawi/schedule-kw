import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarClock, Clock3, GraduationCap, Layers, ShieldAlert, X } from "lucide-react";
import { REGULATION_EXCEPTION_CODE, REGULATION_EXCEPTION_FLAG, REGULATION_EXCEPTION_REASON, REGULATION_REASON_MAX, type RegulationExceptionIssue, type RegulationExceptionRule } from "../utils/regulationException";

/**
 * ── «هذا الموعد يخالف اللائحة» (ملاحظتا المالك 10 و20) ──────────────────────────
 * ورقةٌ واحدة لكل حفظٍ من القسم: النموذج الكامل، والبطاقة السريعة، والسحب، والمقترح الدراسي.
 * كلُّ قاعدةٍ سطرٌ بمادّتها، والحفظُ لا يتمّ إلا بزرّ «المتابعة استثناءً»؛ و«تراجع» يُبقي النموذج كما هو.
 */
const RULE_ICON: Record<RegulationExceptionRule, typeof Clock3> = {
  "lecture-length": Clock3,
  "pattern-days": CalendarClock,
  "start-ladder": Clock3,
  "fixed-start": CalendarClock,
  "consecutive-long": Layers,
  "consecutive-one-hour": Layers,
};

/** وسمُ الملاحظة الليّنة (الخريجون): تُقال ولا تمنع. */
const SOFT_NOTE = "ملاحظة · لا تمنع";

/** قرارُ الورقة: false للتراجع، أو المتابعةُ استثناءً بسببها (فارغٌ حين لا تطلب المخالفةُ سبباً). */
export type RegulationExceptionChoice = false | { reason: string };

function RegulationExceptionSheet({ issues, note, onChoose }: { issues: readonly RegulationExceptionIssue[]; note?: string; onChoose: (choice: RegulationExceptionChoice) => void }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  /* مخالفةٌ تطلب سبباً (تجزئةُ مقررٍ نظريٍّ وعمليّ): لا تُقبل المتابعة بلا سطرٍ يُحفظ في سجل التدقيق. */
  const needsReason = issues.some(issue => issue.needsReason);
  const [reason, setReason] = useState("");
  const reasonReady = !needsReason || reason.trim().length >= 3;
  useEffect(() => {
    cancelRef.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onChoose(false); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onChoose]);
  return (
    <div className="changes-extend-sheet regulation-exception-sheet" role="alertdialog" aria-modal="true" aria-labelledby="regulation-exception-title" dir="rtl">
      <div className="changes-extend-card">
        <header>
          <strong id="regulation-exception-title"><ShieldAlert aria-hidden="true" />هذا الموعد يخالف اللائحة</strong>
          <button type="button" onClick={() => onChoose(false)} aria-label="إغلاق" data-guide-ignore="إغلاق الورقة — لا يحفظ شيئاً"><X /></button>
        </header>
        <ul className="regulation-exception-list">
          {issues.map(issue => {
            const Icon = RULE_ICON[issue.rule] || ShieldAlert;
            return (
              <li key={`${issue.rule}:${issue.text}`}>
                <Icon aria-hidden="true" />
                <span>{issue.text}</span>
                <b className="regulation-exception-article">{issue.article}</b>
              </li>
            );
          })}
        </ul>
        {note ? <p className="regulation-exception-soft" role="note"><GraduationCap aria-hidden="true" />{note}<small>{SOFT_NOTE}</small></p> : null}
        <p className="regulation-exception-ask">هل تريد المتابعة استثناءً؟ يُسجَّل الاستثناء في سجل التدقيق.</p>
        {needsReason ? (
          <label className="regulation-exception-reason">
            <span>سبب الاستثناء <small>(يُحفظ في سجل التدقيق)</small></span>
            <textarea rows={2} maxLength={REGULATION_REASON_MAX} value={reason} onChange={event => setReason(event.target.value)}
              placeholder="مثال: طبيعة المختبر في القسم تتطلب لقاءين قصيرين" aria-required="true" />
          </label>
        ) : null}
        <div className="request-hold-actions">
          <button type="button" className="is-primary regulation-exception-confirm" disabled={!reasonReady} data-guide-ignore="يحفظ الموعد استثناءً من اللائحة ويسجّله في سجل التدقيق" onClick={() => onChoose({ reason: needsReason ? reason.trim() : "" })}>
            <ShieldAlert aria-hidden="true" />المتابعة استثناءً
          </button>
          <button type="button" ref={cancelRef} data-guide-ignore="تراجع — لا يحفظ شيئاً ويبقى النموذج كما هو" onClick={() => onChoose(false)}>تراجع</button>
        </div>
      </div>
    </div>
  );
}

/** يفتح الورقة ويعيد القرار: false للتراجع، أو { reason } للمتابعة استثناءً. مركّبٌ مستقل لأن السؤال يقع داخل مسار حفظ. */
export function askRegulationException(issues: readonly RegulationExceptionIssue[], note?: string): Promise<RegulationExceptionChoice> {
  return new Promise(resolve => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<RegulationExceptionSheet issues={issues} note={note} onChoose={choice => { root.unmount(); host.remove(); resolve(choice); }} />);
  });
}

/** رسالةُ «لم يُحفظ» حين يتراجع المستخدم: النموذج باقٍ ولا شيء كُتب. */
export const REGULATION_EXCEPTION_DECLINED = "لم يُحفظ: الموعد يخالف اللائحة، ولم تُختر المتابعة استثناءً.";

/** ردُّ خادمٍ يطلب التأكيد؟ يعيد مخالفاته، أو null. */
export function regulationIssuesOf(status: number, data: any): RegulationExceptionIssue[] | null {
  return status === 409 && data?.code === REGULATION_EXCEPTION_CODE && Array.isArray(data?.regulation) && data.regulation.length ? data.regulation : null;
}

/** نداءٌ خارج غلاف الورشة (اعتمادُ اقتراح، آلة الزمن، طلبُ أستاذ، تخطيطُ الشعب): ردُّ «استثناءٍ لائحي» يفتح الورقة،
    فإن وافق أُعيد الطلبُ نفسه موسوماً (resend)، وإن تراجع رُمي «لم يُحفظ». ولردٍّ آخر null فيمضي النداءُ كما كان. */
export async function settleRegulationException<T>(status: number, data: any, body: BodyInit | null | undefined, resend: (marked: string) => Promise<T>): Promise<{ value: T } | null> {
  const issues = regulationIssuesOf(status, data);
  if (!issues || !withRegulationException(body)) return null;
  const choice = await askRegulationException(issues);
  const marked = choice ? withRegulationException(body, choice.reason) : null;
  if (marked) return { value: await resend(marked) };
  throw Object.assign(new Error(REGULATION_EXCEPTION_DECLINED), { code: data?.code, regulation: issues });
}

/** جسمُ الطلب نفسه موسوماً بالموافقة الصريحة، وبسببها إن كُتب (JSON فقط؛ غيرُه لا يُعاد). */
export function withRegulationException(body: BodyInit | null | undefined, reason = ""): string | null {
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? JSON.stringify({ ...parsed, [REGULATION_EXCEPTION_FLAG]: true, ...(reason.trim() ? { [REGULATION_EXCEPTION_REASON]: reason.trim() } : {}) }) : null;
  } catch { return null; }
}
