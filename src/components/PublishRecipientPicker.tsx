/**
 * ── «لمن؟» في «نشر ← بطاقة الأستاذ» ─────────────────────────────────────────
 *
 * «الكل» كما كان: يُصدَر لكل أستاذٍ في جدول عائلة القسم. و«أساتذة محددون»: قائمةُ
 * أساتذة الجدول نفسُها التي يُصدِر لها الخادم (/api/instructor-requests/recipients)،
 * سطرٌ لكل شخص (سجلّاه في البنين والبنات سطرٌ واحد — instructorPickerPeople)، ومعه
 * وسومُه (PersonChips) وعددُ شعبه، وبحثٌ وتحديدُ الكل/لا شيء — بإحساس اختيار المدرّبين
 * في مرحلة التدريب. الإرسالُ يقع على كل سجلّات الشخص المختار، ولا يمسّ غيره.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Search, UserCheck, Users } from "lucide-react";
import PersonChips from "./PersonChips";
import { instructorPickerPeople } from "../utils/instructorPickerChoices";
import { AR, countOf } from "../utils/arabicCount";
import { instructorIdentityKey } from "../utils/instructorIdentity";

export type Audience = "all" | "picked";

/** شخصٌ مختار: كلُّ سجلّاته، واسمُه، وجوّالُه للتسليم. */
export interface PickedPerson {
  key: number;
  ids: number[];
  name: string;
  mobile: string;
  sections: number;
}

interface Recipient { AdInstructorId: number; AdInstructorName: string; AdInstructorMobile: string; sections: number }


export function AudiencePicker({ value, onChange }: { value: Audience; onChange: (value: Audience) => void }) {
  const choices: Array<{ id: Audience; icon: ReactNode; label: string; hint: string }> = [
    { id: "all", icon: <Users aria-hidden="true" />, label: "الكل", hint: "كل أساتذة القسم" },
    { id: "picked", icon: <UserCheck aria-hidden="true" />, label: "أساتذة محددون", hint: "تختارهم من القائمة" },
  ];
  return (
    <div className="publish-audience">
      <b className="publish-audience-title" id="publish-audience-title">لمن؟</b>
      <div className="publish-audience-choices" role="radiogroup" aria-labelledby="publish-audience-title">
        {choices.map(choice => (
          <button key={choice.id} type="button" role="radio" data-guide-ignore="لمن؟ — اختيار من يُرسَل إليه في بطاقة الأستاذ، لا يرسل شيئاً بنفسه"
            aria-checked={value === choice.id} aria-pressed={value === choice.id} onClick={() => onChange(choice.id)}>
            {choice.icon}
            <span><b>{choice.label}</b><small>{choice.hint}</small></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PublishRecipientPicker({ collegeId, sectionId, termId, onChange, visitingOf, traineeOf }: {
  collegeId: number; sectionId: number; termId: number;
  onChange: (people: PickedPerson[]) => void;
  visitingOf: (id: number) => boolean;
  traineeOf: (id: number) => boolean;
}) {
  const [rows, setRows] = useState<Recipient[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setRows(null); setError(""); setSelected(new Set());
    void fetch(`/api/instructor-requests/recipients?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" })
      .then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "تعذّرت قراءة أساتذة القسم.");
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      })
      .catch((e: any) => { if (!cancelled) { setRows([]); setError(e.message); } });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId]);

  /* الشخصُ مرّةً واحدة: سجلّاه في البنين والبنات سطرٌ واحد، وشعبُه مجموعُ شعب سجلّاته. */
  const people = useMemo<PickedPerson[]>(() => {
    const list = rows || [];
    const byId = new Map<number, Recipient>(list.map(row => [Number(row.AdInstructorId), row]));
    return instructorPickerPeople(list).map(choice => ({
      key: choice.value,
      ids: choice.ids,
      name: choice.label,
      mobile: choice.ids.map(id => byId.get(id)?.AdInstructorMobile || "").find(Boolean) || "",
      sections: choice.ids.reduce((sum, id) => sum + Number(byId.get(id)?.sections || 0), 0),
    }));
  }, [rows]);

  useEffect(() => { onChange(people.filter(person => selected.has(person.key))); }, [people, selected]);

  const needle = instructorIdentityKey(query.trim());
  const shown = needle ? people.filter(person => instructorIdentityKey(person.name).includes(needle) || person.name.includes(query.trim())) : people;
  const toggle = (key: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectShown = () => setSelected(current => new Set([...current, ...shown.map(person => person.key)]));

  if (!rows) return <div className="publish-pick" role="status"><small className="publish-pick-count">جارٍ تحميل أساتذة القسم…</small></div>;
  if (!people.length) return <div className="publish-pick"><p className="of-msg" data-tone="warn">{error || "لا أساتذة في جدول هذا القسم لهذا الفصل بعد."}</p></div>;
  return (
    <div className="publish-pick" aria-label="اختيار الأساتذة">
      <label className="publish-pick-search">
        <Search aria-hidden="true" />
        <span className="sr-only">ابحث باسم الأستاذ</span>
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بالاسم" />
      </label>
      <div className="publish-pick-bar">
        <small className="publish-pick-count" aria-live="polite">
          {selected.size ? `اخترت ${countOf(selected.size, AR.instructor)} من ${people.length.toLocaleString("ar-KW-u-nu-latn")}` : `لم تختر أحداً بعد · ${countOf(people.length, AR.instructor)} في الجدول`}
        </small>
        <span className="publish-pick-actions">
          <button type="button" className="ta-mini" data-guide-ignore="لمن؟ — اختيار من يُرسَل إليه في بطاقة الأستاذ، لا يرسل شيئاً بنفسه" onClick={selectShown} disabled={!shown.length}>
            {needle ? "تحديد النتائج" : "تحديد الكل"}
          </button>
          <button type="button" className="ta-mini" data-guide-ignore="لمن؟ — اختيار من يُرسَل إليه في بطاقة الأستاذ، لا يرسل شيئاً بنفسه" onClick={() => setSelected(new Set())} disabled={!selected.size}>
            إلغاء التحديد
          </button>
        </span>
      </div>
      <div className="publish-pick-list" role="group" aria-label="أساتذة القسم">
        {shown.map(person => {
          const on = selected.has(person.key);
          return (
            <button key={person.key} type="button" className="of-chip" role="checkbox" aria-checked={on} aria-pressed={on}
              data-guide-ignore="لمن؟ — اختيار من يُرسَل إليه في بطاقة الأستاذ، لا يرسل شيئاً بنفسه" onClick={() => toggle(person.key)}>
              <span className="publish-pick-box" aria-hidden="true">{on ? <Check /> : null}</span>
              <span className="publish-pick-name">{person.name}<PersonChips visiting={person.ids.some(visitingOf)} trainee={person.ids.some(traineeOf)} /></span>
              {person.sections ? <small>{countOf(person.sections, AR.section)}</small> : null}
            </button>
          );
        })}
        {!shown.length ? <small className="publish-pick-count">لا اسم يطابق «{query.trim()}».</small> : null}
      </div>
    </div>
  );
}
