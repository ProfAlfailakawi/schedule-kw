import React, { useEffect, useState } from "react";
import { Route, ShieldAlert, UserX, X } from "lucide-react";
import { Notice, PrimaryButton } from "./ui";
import { TRAVEL_PAIRS, type CampusTravelPolicy } from "../utils/campusTravelPolicy";

/** سياسةُ التنقّل بين المواقع: للمسجّل العام، ضمن مواعيد التسليم. */
export default function CampusTravelPolicyCard() {
  const [policy, setPolicy] = useState<CampusTravelPolicy | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Array<{ id: number; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/campus-travel-policy", { cache: "no-store" }).then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) { setPolicy(data.policy); setNames(data.names || {}); } }).catch(() => undefined);
  }, []);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setFound([]); return; }
    const timer = window.setTimeout(() => {
      fetch(`/api/instructors?q=${encodeURIComponent(term)}&limit=8`).then(r => (r.ok ? r.json() : []))
        .then((rows: any[]) => setFound(rows.map(row => ({ id: Number(row.AdInstructorId), name: String(row.AdInstructorName || "") })))).catch(() => setFound([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  if (!policy) return null;
  const patch = (key: string, next: Partial<CampusTravelPolicy["pairs"][string]>) =>
    setPolicy(current => current && ({ ...current, pairs: { ...current.pairs, [key]: { ...current.pairs[key], ...next } } }));
  const save = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/campus-travel-policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(policy) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذّر الحفظ");
      setPolicy(data.policy); setMessage("حُفظت السياسة.");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <details className="sd-block travel-policy">
      <summary><Route aria-hidden="true" /> التنقّل بين المواقع</summary>
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice type="success" onDismiss={() => setMessage("")}>{message}</Notice> : null}
      <div className="travel-policy-rows">
        {TRAVEL_PAIRS.map(pair => {
          const rule = policy.pairs[pair.key];
          return (
            <div key={pair.key} className="travel-policy-row">
              <b>{pair.label}</b>
              <label><span className="sr-only">المدة بالدقائق</span>
                <input type="number" min={0} max={180} step={5} value={rule.minutes} aria-label={`مدة ${pair.label} بالدقائق`} onChange={e => patch(pair.key, { minutes: Number(e.target.value) })} /> د
              </label>
              <button type="button" className={rule.required ? "on" : ""} aria-pressed={rule.required} onClick={() => patch(pair.key, { required: !rule.required })}
                data-guide-ignore="يبدّل المدة بين تنبيه وإلزام داخل البطاقة؛ لا يحفظ حتى «حفظ»">
                <ShieldAlert aria-hidden="true" />{rule.required ? "إلزام" : "تنبيه"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="travel-policy-exempt">
        <strong><UserX aria-hidden="true" /> مستثنون</strong>
        <div className="travel-policy-chips">
          {policy.exemptInstructorIds.map(id => (
            <button key={id} type="button" onClick={() => setPolicy({ ...policy, exemptInstructorIds: policy.exemptInstructorIds.filter(item => item !== id) })}
              data-guide-ignore="يزيل أستاذاً من قائمة الاستثناء؛ لا يحفظ حتى «حفظ»">{names[id] || id}<X aria-hidden="true" /></button>
          ))}
        </div>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ابحث باسم الأستاذ" aria-label="إضافة أستاذ مستثنى" />
        {found.length ? (
          <div className="travel-policy-found">
            {found.map(person => (
              <button key={person.id} type="button" onClick={() => {
                setNames(current => ({ ...current, [person.id]: person.name }));
                setPolicy({ ...policy, exemptInstructorIds: [...new Set([...policy.exemptInstructorIds, person.id])] });
                setQuery("");
              }} data-guide-ignore="يضيف أستاذاً إلى قائمة الاستثناء؛ لا يحفظ حتى «حفظ»">{person.name}</button>
            ))}
          </div>
        ) : null}
      </div>
      <PrimaryButton type="button" disabled={busy} onClick={() => void save()} data-guide-ignore="يحفظ سياسة التنقّل بين المواقع">حفظ</PrimaryButton>
    </details>
  );
}
