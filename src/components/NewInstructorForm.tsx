import React, { useEffect, useState } from "react";
import { validateCivilId } from "../utils/civilId";
import { numericText } from "../utils/digits";

/**
 * ── «أستاذ جديد»: نموذجٌ واحد لأدوات الجدول ولوحة «موعد» (المالك 2026-11-14) ──────
 * الاسم ثم الدرجة العلمية (ومنها تُحسب ساعاته)، وخيارُ «مدرب» عند الإضافة. والاستثناءُ والتفرّغُ والتقاعد
 * بعد الإضافة من بطاقة العضو في «الأساتذة» بأدوات الجدول (DepartmentRoster) — مكانٌ واحد لها، بلا نسخة ثانية.
 * الخادمُ يضمّه إلى دليل القسم ويحكم بالنطاق (POST /api/instructors)، فلا يُسجَّل أستاذٌ في قسمٍ خارج نطاق صاحب الطلب.
 */
export interface RankChoice { id: string; name: string; minHours: number; maxHours: number; overtimeHours?: number }
export interface CreatedInstructor { existing?: boolean; loadApplied?: boolean; AdInstructorId: number; AdInstructorName: string; AdInstructorCivil?: string; AdInstructorMobile?: string; AdInstructorCategory?: string | null }

/** الدرجاتُ تُقرأ عند كل فتحٍ للنموذج: مرجعٌ يعدّله الأدمن، ولا يُبقي النموذجُ درجةً حُذفت. */
function useRanks() {
  const [state, setState] = useState<{ enabled: boolean; ranks: RankChoice[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/section-roster/ranks", { cache: "no-store", credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (!cancelled && data && Array.isArray(data.ranks)) setState(data); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return state;
}

export default function NewInstructorForm({ collegeId, sectionId, initialName = "", precheck, onCreated, onCancel, submitLabel = "أضف", inline = false }: {
  collegeId: number; sectionId: number; initialName?: string;
  /** فحصٌ محلي سريع قبل الطلب (رقمٌ مدني معروف…): نصُّ خطأٍ أو null. */
  precheck?: (civil: string) => string | null;
  onCreated: (person: CreatedInstructor) => void;
  onCancel: () => void;
  submitLabel?: string;
  /** في صفحةٍ لا نافذةٍ منسدلة: بلا سقف ارتفاع. */
  inline?: boolean;
}) {
  const ranks = useRanks();
  const [name, setName] = useState(initialName);
  const [civil, setCivil] = useState("");
  const [mobile, setMobile] = useState("");
  const [rankId, setRankId] = useState("");
  const [trainee, setTrainee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = ranks?.ranks.find(rank => rank.id === rankId) || null;

  const submit = async () => {
    setError(null);
    const cleanName = name.trim(), cleanCivil = civil.trim();
    if (!cleanName || !cleanCivil) { setError("الاسم والرقم المدني مطلوبان."); return; }
    const check = validateCivilId(cleanCivil);
    if (!check.isValid) { setError(check.message || "الرقم المدني غير صحيح."); return; }
    /* الدرجةُ لازمة (قرار المالك 2026-11-14): تُختار من النصاب، فلا إضافةَ بدونها ما دامت درجاتٌ معرَّفة. */
    if (ranks?.ranks.length && !rankId) { setError("اختر الدرجة العلمية من النصاب."); return; }
    const known = precheck?.(cleanCivil);
    if (known) { setError(known); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/instructors", {
        method: "POST", headers: { "Content-Type": "application/json" },
        /* النطاقُ يرافق الإضافة كي تُسجَّل العضويةُ في دليل القسم لا سجلاً جامعياً عائماً. */
        body: JSON.stringify({
          AdInstructorCivil: cleanCivil, AdInstructorName: cleanName, AdInstructorMobile: mobile.trim(), collegeId, sectionId,
          ...(trainee ? { AdInstructorCategory: "ta" } : {}),
          ...(rankId ? { load: { rankId } } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر إضافة الأستاذ");
      onCreated(data);
    } catch (e: any) { setError(e.message || "تعذر إضافة الأستاذ"); } finally { setBusy(false); }
  };

  return (
    <div className={`instructor-new${inline ? " instructor-new--inline" : ""}`} role="group" aria-label="أستاذ جديد">
      <strong>أستاذ جديد</strong>
      <input value={name} onChange={event => setName(event.target.value)} placeholder="الاسم الكامل" aria-label="اسم الأستاذ" autoFocus />
      <input value={civil} onChange={event => setCivil(numericText(event.target.value).slice(0, 12))} inputMode="numeric" placeholder="12 رقمًا" aria-label="الرقم المدني" />
      <input value={mobile} onChange={event => setMobile(numericText(event.target.value).slice(0, 8))} inputMode="numeric" placeholder="الهاتف (اختياري)" aria-label="الهاتف" dir="ltr" />
      {ranks?.ranks.length ? (
        <label className="instructor-new-rank">
          <span className="sr-only">الدرجة العلمية (لازمة)</span>
          <select value={rankId} onChange={event => setRankId(event.target.value)} aria-label="الدرجة العلمية" aria-required="true" required>
            <option value="" disabled>الدرجة العلمية *</option>
            {ranks.ranks.map(rank => <option key={rank.id} value={rank.id}>{rank.name} · {rank.minHours}–{rank.maxHours} س</option>)}
          </select>
          {picked ? <small>نصابُه {picked.minHours}–{picked.maxHours} س{picked.overtimeHours ? ` · +${picked.overtimeHours} إضافي` : ""}</small> : <small>لازمة: منها تُحسب ساعاتُه</small>}
        </label>
      ) : ranks ? <small className="instructor-new-norank">لم تُعرَّف درجات علمية في النصاب بعد؛ يعرّفها المدير الرئيسي من «النصاب التدريسي».</small> : null}
      <label className="instructor-new-trainee">
        <input type="checkbox" checked={trainee} onChange={event => setTrainee(event.target.checked)} />
        <span>مدرب <small>يُضاف إلى قائمة المدربين</small></span>
      </label>
      {error ? <em>{error}</em> : null}
      <div>
        <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || Boolean(ranks?.ranks.length && !rankId)} data-guide-ignore="يحفظ أستاذاً جديداً في القسم بعد التأكيد في النموذج؛ الإضافة نفسها موثقة في schedule.action.change-instructor">{busy ? "يحفظ…" : submitLabel}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy} data-guide-ignore="يغلق نموذج الأستاذ الجديد دون حفظ">إلغاء</button>
      </div>
    </div>
  );
}
