import React, { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { STUDENT_UNIT_CAPS, DEFAULT_STUDENT_UNIT_CAP } from "../utils/studentUnitCap";

/** سقفُ وحدات الطالب في «مساري»: يختاره القسم، ويسري على حرم القسم كلِّها. */
export default function StudentUnitCapField({ collegeId, sectionId }: { collegeId: number; sectionId: number }) {
  const [cap, setCap] = useState<number>(DEFAULT_STUDENT_UNIT_CAP);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/section-student-settings?collegeId=${collegeId}&sectionId=${sectionId}`, { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null)).then(data => { if (data?.maxUnits) setCap(Number(data.maxUnits)); }).catch(() => undefined);
  }, [collegeId, sectionId]);
  const choose = async (next: number) => {
    const previous = cap;
    setCap(next); setBusy(true); setError("");
    try {
      const response = await fetch("/api/section-student-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, maxUnits: next }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذّر الحفظ");
    } catch (e: any) { setCap(previous); setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="unit-cap-field" role="radiogroup" aria-label="سقف وحدات الطالب في مساري">
      <span><GraduationCap aria-hidden="true" /> سقف الوحدات في مساري</span>
      {STUDENT_UNIT_CAPS.map(value => (
        <button key={value} type="button" role="radio" aria-checked={cap === value} className={cap === value ? "on" : ""} disabled={busy} onClick={() => void choose(value)}
          data-guide-ignore="يضبط سقف وحدات الطالب في مساري لهذا القسم">{value}</button>
      ))}
      {error ? <small role="alert">{error}</small> : null}
    </div>
  );
}
