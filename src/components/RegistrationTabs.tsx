import React, { useEffect, useRef } from "react";
import { ClipboardCheck, Ticket } from "lucide-react";
import { arrowChoice } from "../utils/arrowChoice";
import "./registration-tabs.css";

/**
 * ── كشف التسجيل ورادار التسجيل: تبويبان لشاشةٍ واحدة في ذهن من يتابع ─────
 * كلٌّ منهما ما زال وجهةً مستقلةً في القائمة (وصلاحيتُه منها)؛ والتبويبان يجمعانهما
 * أعلى الشاشة فيُنتقل بينهما بضغطة. من لا يملك إلا أحدهما لا يرى الشريط.
 */
export type RegistrationView = "studentRegistration" | "simulation";

/* معرّفا التبويب واللوحة: تحملهما اللوحةُ في الشاشتين (role="tabpanel") فيرتبطان بقارئ الشاشة. */
export const registrationTabId = (view: RegistrationView) => `registration-tab-${view}`;
export const registrationPanelId = (view: RegistrationView) => `registration-panel-${view}`;

/* التبويبان يوصلان إلى شاشتين منفصلتين، فالتفعيلُ «يدويّ»: الأسهمُ وHome/End تنقل التركيز فقط،
   وEnter أو المسافة تفتح الشاشة. وبعد الفتح بلوحة المفاتيح يعود التركيز إلى التبويب النشط في الشاشة الجديدة. */
let keepFocus = false;

export default function RegistrationTabs({ active, canRoster, canRadar, onGo }: {
  active: RegistrationView; canRoster: boolean; canRadar: boolean; onGo: (view: RegistrationView) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!keepFocus) return;
    keepFocus = false;
    strip.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }, []);
  if (!canRoster || !canRadar) return null;
  const tabs = [
    { view: "studentRegistration" as const, label: "كشف التسجيل", Icon: ClipboardCheck },
    /* الاسمُ نفسُه في القائمة وفي التبويب وفي عنوان الشاشة: «رادار التسجيل». */
    { view: "simulation" as const, label: "رادار التسجيل", Icon: Ticket },
  ];
  return (
    <nav className="registration-tabs no-print" aria-label="متابعة التسجيل">
      <div ref={strip} role="tablist" aria-label="متابعة التسجيل" aria-orientation="horizontal" className="registration-tabs-list"
        onKeyDown={event => { if (event.key === "Home" || event.key === "End" || event.key.startsWith("Arrow")) arrowChoice(event, { activate: false }); }}>
      {tabs.map(({ view, label, Icon }) => (
        <button key={view} type="button" role="tab" id={registrationTabId(view)} aria-selected={active === view} aria-controls={registrationPanelId(view)}
          tabIndex={active === view ? 0 : -1} className={active === view ? "on" : ""}
          onClick={event => { if (event.detail === 0) keepFocus = true; onGo(view); }} data-guide-ignore="ينتقل بين كشف التسجيل والرادار؛ كلاهما مسجّل وجهةً في المرشد">
          <Icon aria-hidden="true" />{label}
        </button>
      ))}
      </div>
    </nav>
  );
}
