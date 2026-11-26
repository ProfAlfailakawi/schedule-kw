import React from "react";
export default function IntelligenceScopeSwitch({ value, onChange }: { value: "college" | "department"; onChange: (value: "college" | "department") => void }) {
  /* الكلمتان نفسهما في خيارات «التقرير الشامل» و«تقرير تغييرات الجدول» (utils/reportChoices):
     «كل الفروع» مواقعُ فرع القسم وحده — البنات مع الجهراء والفحيحيل. */
  return <div className="intelligence-scope-switch" role="group" aria-label="نطاق التحليل">
    {([['college', 'هذا الموقع'], ['department', 'كل الفروع']] as const).map(([scope, label]) =>
      <button data-guide-ignore="اختيار نطاق القراءة في لوحة الذكاء عرض تحليلي فقط" key={scope} type="button" aria-pressed={value === scope} onClick={() => onChange(scope)}>{label}</button>)}
  </div>;
}
