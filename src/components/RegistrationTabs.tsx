import React from "react";
import { ClipboardCheck, Ticket } from "lucide-react";
import "./registration-tabs.css";

/**
 * ── كشف التسجيل ورادار التسجيل: تبويبان لشاشةٍ واحدة في ذهن من يتابع ─────
 * كلٌّ منهما ما زال وجهةً مستقلةً في القائمة (وصلاحيتُه منها)؛ والتبويبان يجمعانهما
 * أعلى الشاشة فيُنتقل بينهما بضغطة. من لا يملك إلا أحدهما لا يرى الشريط.
 */
export type RegistrationView = "studentRegistration" | "simulation";

export default function RegistrationTabs({ active, canRoster, canRadar, onGo }: {
  active: RegistrationView; canRoster: boolean; canRadar: boolean; onGo: (view: RegistrationView) => void;
}) {
  if (!canRoster || !canRadar) return null;
  const tabs = [
    { view: "studentRegistration" as const, label: "كشف التسجيل", Icon: ClipboardCheck },
    /* الاسمُ نفسُه في القائمة وفي التبويب وفي عنوان الشاشة: «رادار التسجيل». */
    { view: "simulation" as const, label: "رادار التسجيل", Icon: Ticket },
  ];
  return (
    <nav className="registration-tabs no-print" aria-label="متابعة التسجيل">
      {tabs.map(({ view, label, Icon }) => (
        <button key={view} type="button" className={active === view ? "on" : ""} aria-current={active === view ? "page" : undefined}
          onClick={() => onGo(view)} data-guide-ignore="ينتقل بين كشف التسجيل والرادار؛ كلاهما مسجّل وجهةً في المرشد">
          <Icon aria-hidden="true" />{label}
        </button>
      ))}
    </nav>
  );
}
