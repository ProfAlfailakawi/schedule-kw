import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Archive, BookOpenCheck, Check, GraduationCap, Pencil, Plus, Scale, UsersRound, X } from "lucide-react";
import NewInstructorForm from "./NewInstructorForm";
import type { AcademicRank, TeachingLoadAssignment } from "../types";
import { ExceptionBadge, LoadExceptionEditor } from "./LoadException";
import { Notice, SecondaryButton, visualConfirm } from "./ui";
import { ROSTER_GROUPS, rosterGroupOf, type RosterGroup } from "../utils/rosterGroups";
import "./registration-tabs.css";

/**
 * ── «الأساتذة» في أدوات الجدول ────────────────────────────────────────────
 * قسمُ الجدول يدير أساتذته من مكانٍ واحد: TA مفصولون، والنصابُ والدرجةُ والإضافيُّ
 * والاستثناء، والتفرّغُ والتقاعد. التقاعدُ يُخرج صاحبَه من القائمة وتبقى بياناته.
 * لا رقمَ مدنيّاً ولا هاتفاً في القائمة: الخادمُ لا يرسلهما لهذا الباب. و«أستاذ جديد» (NewInstructorForm) هو المكان الوحيد
 * للإضافة مع الدرجة؛ ولوحة «موعد» تفتح النموذج نفسه (المالك 2026-11-14).
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
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState("");
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
      setRenaming(null);
      await read();
    } catch (e: any) { setError(e.message || "تعذّر الحفظ"); } finally { setBusy(false); }
  };
  /* تغييرُ الحالة يبدّل ظهور الأستاذ في الاختيار، فلا يقع بلمسةٍ عابرة. */
  const confirmed = async (person: Person, title: string, message: string, label: string, body: Record<string, unknown>) => {
    if (await visualConfirm({ title, message, confirmLabel: label, tone: "warning" })) await save(person, body);
  };
  const toggleStatus = (person: Person, status: "retired" | "sabbatical") => {
    const word = status === "retired" ? "التقاعد" : "التفرّغ";
    return person.AdInstructorStatus === status
      ? confirmed(person, `إلغاء ${word}`, `يعود ${person.name} إلى قائمة الأساتذة.`, "إلغاء الحالة", { status: null })
      : confirmed(person, status === "retired" ? "تسجيل التقاعد" : "تسجيل التفرّغ", `${person.name}: يبقى في السجل مع مواعيده السابقة، ولا يظهر في الاختيار.`, "تأكيد", { status });
  };
  const counts = useMemo(() => {
    const out: Record<RosterGroup, number> = { faculty: 0, ta: 0, sabbatical: 0, retired: 0 };
    for (const person of roster?.people || []) out[rosterGroupOf(person)]++;
    return out;
  }, [roster]);
  if (!roster) return error ? <Notice>{error}</Notice> : <p>⏳</p>;
  const shown = roster.people.filter(person => rosterGroupOf(person) === group);
  /* الزرّ ظاهرٌ دائماً: تعطيلُ النصاب أو خلوُّ الدرجات يُقال داخل المحرّر، ولا يختفي الزرّ بلا سبب. */
  const editorNote = !roster.ranks.length
    ? "لم تُعرَّف درجاتٌ علمية بعد؛ يعرّفها المدير الرئيسي من «النصاب التدريسي»."
    : roster.enabled ? "" : "النصاب غير مفعّل: تُحفظ الدرجة الآن، وتُحتسب حدودها حين يفعّله المدير الرئيسي.";
  const icons = { faculty: UsersRound, ta: GraduationCap, sabbatical: BookOpenCheck, retired: Archive };
  return (
    <div className="dept-roster">
      {error ? <Notice>{error}</Notice> : null}
      {justAdded ? <p className="dept-roster-added" role="status">أُضيف {justAdded}. الاستثناء والتفرّغ والتقاعد من بطاقته.</p> : null}
      {adding ? (
        <NewInstructorForm collegeId={collegeId} sectionId={sectionId}
          onCancel={() => setAdding(false)}
          onCreated={async created => {
            setAdding(false);
            setJustAdded(created.AdInstructorName);
            /* يُفتح تبويبُه ليراه صاحبُ الطلب فور الإضافة: المدرب في «المدربون»، وغيره في «الأساتذة». */
            setGroup(created.AdInstructorCategory === "ta" ? "ta" : "faculty");
            await read();
          }} />
      ) : (
        <button type="button" className="dept-roster-add" onClick={() => { setJustAdded(""); setAdding(true); }}
          data-guide-ignore="يفتح نموذج أستاذ جديد داخل القسم؛ لا يحفظ حتى «أضف»">
          <Plus aria-hidden="true" />أستاذ جديد
        </button>
      )}
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
              <header>
                {renaming?.id === person.id ? (
                  <form className="dept-roster-rename" onSubmit={event => { event.preventDefault(); void save(person, { name: renaming.name }); }}>
                    <input value={renaming.name} maxLength={120} autoFocus aria-label="اسم الأستاذ" onChange={event => setRenaming({ id: person.id, name: event.target.value })} />
                    <button type="submit" disabled={busy || !renaming.name.trim()} aria-label="حفظ الاسم" data-guide-ignore="يحفظ اسم العضو فقط"><Check aria-hidden="true" /></button>
                    <button type="button" disabled={busy} aria-label="إلغاء" onClick={() => setRenaming(null)} data-guide-ignore="يلغي تعديل الاسم"><X aria-hidden="true" /></button>
                  </form>
                ) : (
                  <b>{person.name}<button type="button" className="dept-roster-rename-open" disabled={busy} aria-label={`تعديل اسم ${person.name}`} onClick={() => setRenaming({ id: person.id, name: person.name })} data-guide-ignore="يفتح تعديل الاسم؛ لا يحفظ حتى التأكيد"><Pencil aria-hidden="true" /></button></b>
                )}
                <span>{person.hours} س</span>
              </header>
              <div className="dept-roster-load">
                <span>{person.rankName || "بلا درجة"}{person.max !== null ? ` · ${person.min ?? 0}–${person.max}${person.extra ? ` +${person.extra}` : ""}` : ""}</span>
                {person.exception ? <ExceptionBadge reason={person.exception.reason as any} /> : null}
              </div>
              <div className="dept-roster-actions">
                <button type="button" disabled={busy} onClick={() => { setError(""); setEditing(person); }} data-guide-ignore="يفتح محرّر الدرجة العلمية؛ لا يحفظ حتى «تطبيق»"><Scale aria-hidden="true" />الدرجة العلمية</button>
                {person.AdInstructorCategory === "ta" ? <button type="button" disabled={busy}
                  onClick={() => void confirmed(person, "تحويله إلى أستاذ", `${person.name}: يصبح أستاذاً ولا يعود TA من هذه الشاشة.`, "حوّله", { category: null })} data-guide-ignore="يحوّل TA إلى أستاذ؛ لا يغيّر المواعيد السابقة"><GraduationCap aria-hidden="true" />حوّله أستاذاً</button> : null}
                <button type="button" disabled={busy} className={person.AdInstructorStatus === "sabbatical" ? "on" : ""} aria-pressed={person.AdInstructorStatus === "sabbatical"}
                  onClick={() => void toggleStatus(person, "sabbatical")} data-guide-ignore="يبدّل حالة التفرّغ؛ لا يغيّر المواعيد السابقة"><BookOpenCheck aria-hidden="true" />تفرّغ</button>
                <button type="button" disabled={busy} className={person.AdInstructorStatus === "retired" ? "on" : ""} aria-pressed={person.AdInstructorStatus === "retired"}
                  onClick={() => void toggleStatus(person, "retired")} data-guide-ignore="يبدّل حالة التقاعد: يُخفى من القائمة وتبقى بياناته"><Archive aria-hidden="true" />{person.AdInstructorStatus === "retired" ? "إعادة" : "تقاعد"}</button>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="sd-muted">لا أحد في هذه المجموعة.</p>}
      {editing ? createPortal(
        <LoadExceptionEditor name={editing.name} ranks={roster.ranks} value={editing.assignment} terms={roster.terms} hours={editing.hours}
          readOnly={false} busy={busy} raised error={error} note={editorNote} onApply={next => void save(editing, { load: next || {} })} onClose={() => setEditing(null)} />,
        document.body,
      ) : null}
    </div>
  );
}
