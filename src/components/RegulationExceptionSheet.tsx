import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { CalendarClock, Clock3, GraduationCap, Layers, ShieldAlert, X } from "lucide-react";
import { REGULATION_EXCEPTION_CODE, REGULATION_EXCEPTION_FLAG, type RegulationExceptionIssue, type RegulationExceptionRule } from "../utils/regulationException";

/**
 * ── «هذا الموعد يخالف اللائحة» (ملاحظتا المالك 10 و20) ──────────────────────────
 * ورقةٌ واحدة لكل حفظٍ من القسم: النموذج الكامل، والبطاقة السريعة، والسحب، والمقترح الدراسي.
 * كلُّ قاعدةٍ سطرٌ بمادّتها، والحفظُ لا يتمّ إلا بزرّ «المتابعة استثناءً»؛ و«تراجع» يُبقي النموذج كما هو.
 */
const RULE_ICON: Record<RegulationExceptionRule, typeof Clock3> = {
  "lecture-length": Clock3,
  "start-ladder": Clock3,
  "fixed-start": CalendarClock,
  "consecutive-long": Layers,
  "consecutive-one-hour": Layers,
};

/** وسمُ الملاحظة الليّنة (الخريجون): تُقال ولا تمنع. */
const SOFT_NOTE = "ملاحظة · لا تمنع";

function RegulationExceptionSheet({ issues, note, onChoose }: { issues: readonly RegulationExceptionIssue[]; note?: string; onChoose: (accepted: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
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
        <div className="request-hold-actions">
          <button type="button" className="is-primary regulation-exception-confirm" data-guide-ignore="يحفظ الموعد استثناءً من اللائحة ويسجّله في سجل التدقيق" onClick={() => onChoose(true)}>
            <ShieldAlert aria-hidden="true" />المتابعة استثناءً
          </button>
          <button type="button" ref={cancelRef} data-guide-ignore="تراجع — لا يحفظ شيئاً ويبقى النموذج كما هو" onClick={() => onChoose(false)}>تراجع</button>
        </div>
      </div>
    </div>
  );
}

/** يفتح الورقة ويعيد القرار: true للمتابعة استثناءً. مركّبٌ مستقل لأن السؤال يقع داخل مسار حفظ. */
export function askRegulationException(issues: readonly RegulationExceptionIssue[], note?: string): Promise<boolean> {
  return new Promise(resolve => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<RegulationExceptionSheet issues={issues} note={note} onChoose={accepted => { root.unmount(); host.remove(); resolve(accepted); }} />);
  });
}

/** رسالةُ «لم يُحفظ» حين يتراجع المستخدم: النموذج باقٍ ولا شيء كُتب. */
export const REGULATION_EXCEPTION_DECLINED = "لم يُحفظ: الموعد يخالف اللائحة، ولم تُختر المتابعة استثناءً.";

/** ردُّ خادمٍ يطلب التأكيد؟ يعيد مخالفاته، أو null. */
export function regulationIssuesOf(status: number, data: any): RegulationExceptionIssue[] | null {
  return status === 409 && data?.code === REGULATION_EXCEPTION_CODE && Array.isArray(data?.regulation) && data.regulation.length ? data.regulation : null;
}

/** جسمُ الطلب نفسه موسوماً بالموافقة الصريحة (JSON فقط؛ غيرُه لا يُعاد). */
export function withRegulationException(body: BodyInit | null | undefined): string | null {
  if (typeof body !== "string") return null;
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" ? JSON.stringify({ ...parsed, [REGULATION_EXCEPTION_FLAG]: true }) : null;
  } catch { return null; }
}
