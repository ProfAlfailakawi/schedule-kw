import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, BookOpenCheck, GraduationCap, Scale, UsersRound } from "lucide-react";
import type { AcademicRank, TeachingLoadAssignment } from "../types";
import { ExceptionBadge, LoadExceptionEditor } from "./LoadException";
import { Notice, SecondaryButton } from "./ui";
import { ROSTER_GROUPS, rosterGroupOf, type RosterGroup } from "../utils/rosterGroups";
import "./registration-tabs.css";

/**
 * ── «الأساتذة» في أدوات البيانات ────────────────────────────────────────────
 * قسمُ الجدول يدير أساتذته من مكانٍ واحد: TA مفصولون، والنصابُ والدرجةُ والإضافيُّ
 * والاستثناء، والتفرّغُ والتقاعد. التقاعدُ يُخرج صاحبَه من القائمة وتبقى بياناته.
 * لا رقمَ مدنيّاً ولا هاتفاً هنا: الخادمُ لا يرسلهما لهذا الباب.
 */
interface Person {
  id: number; name: string; AdInstructorStatus: "retired" | "sabbatical" | null; AdInstructorCategory: "ta" | null;
  hours: number; assignment: TeachingLoadAssignment; rankName: string; min: number | null; max: number | null; extra: number; exception?: { reason?: string } | null;
}
interface Roster { enabled: boolean; ranks: AcademicRank[]; terms: Array<{ id: number; name: string }>; people: Person[] }

export default function DepartmentRoster({ collegeId, sectionId, termId }: { collegeId: number; sectionId: number; termId: number }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [group, setGroup] = useState<RosterGroup>("faculty");
  const [editing, setEditing] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const read = () => fetch(`/api/section-roster?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { cache: "no-store" })
    .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "تعذّر قراءة الأساتذة"); setRoster(data); })
    .catch(e => setError(e.message));
  useEffect(() => { void read(); }, [collegeId, sectionId, termId]);
  const save = async (person: Person, body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/section-roster/${person.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, ...body }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذّر الحفظ");
      setEditing(null);
      await read();
    } catch (e: any) { setError(e.message || "تعذّر الحفظ"); } finally { setBusy(false); }
  };
  const counts = useMemo(() => {
    const out: Record<RosterGroup, number> = { faculty: 0, ta: 0, sabbatical: 0, retired: 0 };
    for (const person of roster?.people || []) out[rosterGroupOf(person)]++;
    return out;
  }, [roster]);
  if (!roster) return error ? <Notice>{error}</Notice> : <p>⏳</p>;
  const shown = roster.people.filter(person => rosterGroupOf(person) === group);
  const icons = { faculty: UsersRound, ta: GraduationCap, sabbatical: BookOpenCheck, retired: Archive };
  return (
    <div className="dept-roster">
      {error ? <Notice>{error}</Notice> : null}
      <div className="roster-tabs" role="tablist" aria-label="مجموعات أساتذة القسم">
        {ROSTER_GROUPS.map(entry => {
          const Icon = icons[entry.id];
          return (
            <button key={entry.id} type="button" role="tab" aria-selected={group === entry.id} className={group === entry.id ? "on" : ""}
              onClick={() => setGroup(entry.id)} data-guide-ignore="تصفية أساتذة القسم بالمجموعة — لا يغيّر بياناً">
              <Icon aria-hidden="true" />{entry.label}<b>{counts[entry.id]}</b>
            </button>
          );
        })}
      </div>
      {shown.length ? (
        <div className="dept-roster-list">
          {shown.map(person => (
            <article key={person.id} className="dept-roster-card">
              <header><b>{person.name}</b><span>{person.hours} س</span></header>
              <div className="dept-roster-load">
                <span>{person.rankName || "بلا درجة"}{person.max !== null ? ` · ${person.min ?? 0}–${person.max}${person.extra ? ` +${person.extra}` : ""}` : ""}</span>
                {person.exception ? <ExceptionBadge reason={person.exception.reason as any} /> : null}
              </div>
              <div className="dept-roster-actions">
                {roster.enabled ? <button type="button" disabled={busy} onClick={() => setEditing(person)} data-guide-ignore="يفتح محرّر النصاب؛ لا يحفظ حتى «تطبيق»"><Scale aria-hidden="true" />النصاب</button> : null}
                <button type="button" disabled={busy} className={person.AdInstructorCategory === "ta" ? "on" : ""} aria-pressed={person.AdInstructorCategory === "ta"}
                  onClick={() => void save(person, { category: person.AdInstructorCategory === "ta" ? null : "ta" })} data-guide-ignore="يبدّل تصنيف العضو بين أستاذ وTA؛ لا يغيّر المواعيد السابقة"><GraduationCap aria-hidden="true" />TA</button>
                <button type="button" disabled={busy} className={person.AdInstructorStatus === "sabbatical" ? "on" : ""} aria-pressed={person.AdInstructorStatus === "sabbatical"}
                  onClick={() => void save(person, { status: person.AdInstructorStatus === "sabbatical" ? null : "sabbatical" })} data-guide-ignore="يبدّل حالة التفرّغ؛ لا يغيّر المواعيد السابقة"><BookOpenCheck aria-hidden="true" />تفرّغ</button>
                <button type="button" disabled={busy} className={person.AdInstructorStatus === "retired" ? "on" : ""} aria-pressed={person.AdInstructorStatus === "retired"}
                  onClick={() => void save(person, { status: person.AdInstructorStatus === "retired" ? null : "retired" })} data-guide-ignore="يبدّل حالة التقاعد: يُخفى من القائمة وتبقى بياناته"><Archive aria-hidden="true" />{person.AdInstructorStatus === "retired" ? "إعادة" : "تقاعد"}</button>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="sd-muted">لا أحد في هذه المجموعة.</p>}
      {editing ? createPortal(
        <LoadExceptionEditor name={editing.name} ranks={roster.ranks} value={editing.assignment} terms={roster.terms} hours={editing.hours}
          readOnly={false} busy={busy} onApply={next => void save(editing, { load: next || {} })} onClose={() => setEditing(null)} />,
        document.body,
      ) : null}
    </div>
  );
}
