/** وسمُ «👨‍🎓 بنين / 👩‍🎓 بنات» من اسم الكلية (src/utils/campus.ts). لا شيء حين لا يُعرف. */
import React from "react";
import { CAMPUS_ICON, CAMPUS_LABEL, campusOf, type Campus } from "../utils/campus";
import "../styles/39-sections-courses.css";

export default function CampusChip({ collegeName, campus }: { collegeName?: unknown; campus?: Campus | null }) {
  const value = campus === undefined ? campusOf(collegeName) : campus;
  if (!value) return null;
  return <span className={`campus-chip is-${value}`} title={String(collegeName || CAMPUS_LABEL[value])}><span aria-hidden="true">{CAMPUS_ICON[value]}</span>{CAMPUS_LABEL[value]}</span>;
}

/** «الكل · بنين · بنات» لقائمةٍ تجمع الاثنين؛ لا يُرسم حين تكون القائمة من جهةٍ واحدة. */
export function CampusFilter({ campuses, value, onChange }: { campuses: ReadonlyArray<Campus | null>; value: Campus | "all"; onChange: (next: Campus | "all") => void }) {
  const present = new Set(campuses.filter(Boolean) as Campus[]);
  if (present.size < 2) return null;
  const options: Array<Campus | "all"> = ["all", "boys", "girls"];
  return (
    <div className="campus-filter" role="group" aria-label="بنين أو بنات">
      {options.map(option => (
        <button key={option} type="button" aria-pressed={value === option} className={value === option ? "on" : ""} onClick={() => onChange(option)} data-guide-ignore="تصفية القائمة بين البنين والبنات؛ عرضٌ فقط">
          {option === "all" ? "الكل" : `${CAMPUS_ICON[option]} ${CAMPUS_LABEL[option]}`}
        </button>
      ))}
    </div>
  );
}
