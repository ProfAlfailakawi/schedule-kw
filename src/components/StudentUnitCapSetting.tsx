import React, { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { DEFAULT_STUDENT_UNIT_CAP, STUDENT_UNIT_CAP_MAX, STUDENT_UNIT_CAP_MIN, studentUnitCapProblem } from "../utils/studentUnitCap";

/** سقفُ وحدات الطالب في «مساري»: إعدادٌ واحدٌ للجامعة يضعه المدير الرئيسي. */
export default function StudentUnitCapSetting() {
  const [saved, setSaved] = useState<number>(DEFAULT_STUDENT_UNIT_CAP);
  const [draft, setDraft] = useState("");
  /* يبقى الحقل مقفلاً حتى تصل القيمة المحفوظة: لا يُرى ١٥ الافتراضيُّ لحظةً على أنه المحفوظ. */
  const [busy, setBusy] = useState(true), [note, setNote] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/student-unit-cap", { cache: "no-store" })
      .then(async r => { const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error || "تعذّر التحميل"); return data; })
      .then(data => { const value = Number(data.maxUnits) || DEFAULT_STUDENT_UNIT_CAP; setSaved(value); setDraft(String(value)); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);
  const problem = busy && !draft ? null : studentUnitCapProblem(draft);
  const dirty = !problem && Number(draft) !== saved;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty) return;
    setBusy(true); setError(""); setNote("");
    try {
      const response = await fetch("/api/student-unit-cap", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxUnits: Number(draft) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذّر الحفظ");
      setSaved(Number(data.maxUnits)); setNote("حُفظ");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <form className="unit-cap-setting" onSubmit={save}>
      <label htmlFor="student-unit-cap"><GraduationCap aria-hidden="true" /> سقف الوحدات في مساري</label>
      <input id="student-unit-cap" type="number" inputMode="numeric" min={STUDENT_UNIT_CAP_MIN} max={STUDENT_UNIT_CAP_MAX} step={1}
        value={draft} onChange={e => { setDraft(e.target.value); setNote(""); setError(""); }}
        aria-invalid={Boolean(problem)} aria-describedby="student-unit-cap-hint" disabled={busy} />
      <button type="submit" disabled={!dirty || busy} data-guide-ignore="يحفظ سقف وحدات الطالب في مساري للجامعة كلها">حفظ</button>
      <small id="student-unit-cap-hint" role={error || problem ? "alert" : undefined} className={error || problem ? "bad" : ""}>
        {error || problem || note || `من ${STUDENT_UNIT_CAP_MIN} إلى ${STUDENT_UNIT_CAP_MAX} · للجامعة كلها`}
      </small>
    </form>
  );
}
