/**
 * ── ورقةُ «المقررات» لشخصٍ واحد (✏️ أساتذة محددون · 🎓 مرحلة التدريب) ───────────
 *
 * تبويبان صغيران: «الصحيفة السابقة» والصحيفةُ الجديدة باسمها («صحيفة 2026»). تبدأ من تاريخه
 * (src/utils/personCourseDefaults.ts): 🕘 «درّسه» في القديمة، 🔗 «مقابل» في الجديدة (مطابقةُ الاسم
 * بعد توحيده)، و✨ «جديد» لما لا مقابل له ولا يُختار. شرائحُ القديمة بإطارٍ هادئ، والجديدة ممتلئة
 * بوسم الصحيفة (CourseTags). وتحتها سطرٌ واحد: «8 مقررات · 3 من الجديدة».
 * «اعتمد» يحفظ اختيارَه، و«كل المقررات» يعيده إلى اليوم كما هو (بلا قيد).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, History, Infinity as AllIcon, Search, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";
import CourseTags from "./CourseTags";
import { AR, countOf } from "../utils/arabicCount";
import { personCourseDefaults, selectionCounts, type CourseMark, type DeptCourse, type TaughtCourse } from "../utils/personCourseDefaults";
import { arabicMatchKey } from "../utils/arabicText";

export interface CourseDefaultsPayload {
  courses: Array<DeptCourse & { code: string }>;
  planLabel: string;
  taught: Record<string, TaughtCourse[]>;
}

const MARK: Record<CourseMark, { icon: string; label: string } | null> = {
  taught: { icon: "🕘", label: "درّسه" },
  match: { icon: "🔗", label: "مقابل" },
  fresh: { icon: "✨", label: "جديد" },
  plain: null,
};

/** تاريخُ شخصٍ (بكل سجلّاته) من حمولة الورقة. */
export const taughtOf = (payload: CourseDefaultsPayload | null, ids: readonly number[]) =>
  ids.flatMap(id => payload?.taught?.[String(id)] || []);

/** سطرُ الملخّص بالقاعدة الواحدة (countOf): «8 مقررات · 3 من الجديدة». */
export function selectionSummary(payload: CourseDefaultsPayload | null, selected: readonly number[] | null): string {
  if (!selected) return "كل المقررات";
  const counts = selectionCounts(payload?.courses || [], selected);
  return [countOf(counts.total, AR.course), counts.fresh ? `${counts.fresh.toLocaleString("ar-KW-u-nu-latn")} من الجديدة` : ""].filter(Boolean).join(" · ");
}

export default function PersonCoursesSheet({ name, payload, taught, initial, onApply, onClose }: {
  name: string;
  payload: CourseDefaultsPayload;
  taught: TaughtCourse[];
  /** اختيارُه المعتمد إن كان؛ null = لم يُختر له شيء بعد (تبدأ الورقة من تاريخه). */
  initial: number[] | null;
  onApply: (selected: number[] | null) => void;
  onClose: () => void;
}) {
  const defaults = useMemo(() => personCourseDefaults(payload.courses, taught), [payload, taught]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initial ?? defaults.selected));
  const [tab, setTab] = useState<"old" | "new">("old");
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { box.current?.querySelector<HTMLButtonElement>("[role=tab][aria-selected=true], .pcs-chip")?.focus(); }, []);
  const byId = useMemo(() => new Map(payload.courses.map(course => [course.id, course])), [payload]);
  /* ما درّسه ومقابلُه أولاً (برقمه)، ثم البقية: يرى المنسّقُ تاريخَ صاحبه قبل أن يمرّر. */
  const rank = (mark: CourseMark) => (mark === "taught" || mark === "match" ? 0 : 1);
  const list = [...(defaults.tabs && tab === "new" ? defaults.fresh : defaults.old)].sort((a, b) => rank(a.mark) - rank(b.mark));
  const needle = arabicMatchKey(query.trim());
  const shown = needle ? list.filter(row => arabicMatchKey(`${byId.get(row.id)?.name || ""} ${byId.get(row.id)?.code || ""}`).includes(needle)) : list;
  const toggle = (id: number) => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const chosenIn = (rows: Array<{ id: number }>) => rows.filter(row => selected.has(row.id)).length;
  const newLabel = payload.planLabel || "الصحيفة الجديدة";
  /* عائلةٌ بمواقع شقيقة: يُكتب موقعُ كل مقرر بجانبه، فلا يلتبس مقرران باسمٍ واحد. */
  const campuses = new Set(payload.courses.map(course => course.collegeId).filter(Boolean)).size > 1;
  const summary = selectionSummary(payload, [...selected]);

  return createPortal(
    <div className="ppr-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={box} className="ppr-sheet pcs-sheet" role="dialog" aria-modal="true" aria-labelledby="pcs-title"
        onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } }}>
        <header className="ppr-head pcs-head">
          <span className="pcs-glyph" aria-hidden="true">📚</span>
          <div>
            <h3 id="pcs-title">مقررات {name}</h3>
            <small>ما تعرضه بطاقتُه وحده</small>
          </div>
          <button type="button" className="pcs-close" aria-label="إغلاق" onClick={onClose} data-guide-ignore="ورقة مقررات البطاقة لشخص واحد — اختيار داخل الورقة، لا يرسل شيئاً"><X aria-hidden="true" /></button>
        </header>
        {defaults.tabs ? (
          <div className="of-tabs pcs-tabs" role="tablist" aria-label="الصحيفة">
            {(["old", "new"] as const).map(key => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} data-plan={key} data-guide-ignore="ورقة مقررات البطاقة لشخص واحد — اختيار داخل الورقة، لا يرسل شيئاً">
                <span aria-hidden="true">{key === "old" ? "📘" : "🆕"}</span>{key === "old" ? "الصحيفة السابقة" : newLabel}
                <b>{chosenIn(key === "old" ? defaults.old : defaults.fresh)}/{(key === "old" ? defaults.old : defaults.fresh).length}</b>
              </button>
            ))}
          </div>
        ) : null}
        <label className="publish-pick-search pcs-search">
          <Search aria-hidden="true" />
          <span className="sr-only">ابحث في المقررات</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الرقم" />
        </label>
        <div className="ppr-scroll">
          <div className="pcs-chips" role="group" aria-label={defaults.tabs && tab === "new" ? newLabel : "الصحيفة السابقة"}>
            {shown.map(row => {
              const course = byId.get(row.id);
              const on = selected.has(row.id);
              const mark = MARK[row.mark];
              return (
                <button key={row.id} type="button" role="checkbox" aria-checked={on} aria-pressed={on} className="pcs-chip"
                  data-plan={defaults.tabs && tab === "new" ? "new" : "old"} data-mark={row.mark} onClick={() => toggle(row.id)} data-guide-ignore="ورقة مقررات البطاقة لشخص واحد — اختيار داخل الورقة، لا يرسل شيئاً">
                  <span className="pcs-box" aria-hidden="true">{on ? <Check /> : null}</span>
                  <span className="pcs-name"><bdi className="pcs-code">{String(course?.code || "").replace(/\D/g, "").slice(-3)}</bdi> {course?.name}
                    {defaults.tabs && tab === "new" ? <CourseTags courseId={row.id} /> : null}
                    {campuses && course?.collegeName ? <small className="pcs-campus">{course.collegeName}</small> : null}</span>
                  {mark ? <span className="pcs-mark" title={mark.label}><span aria-hidden="true">{mark.icon}</span>{mark.label}</span> : null}
                </button>
              );
            })}
            {!shown.length ? <small className="publish-pick-count">لا مقرر يطابق «{query.trim()}».</small> : null}
          </div>
        </div>
        <p className="pcs-summary" aria-live="polite"><b>{summary}</b></p>
        <footer className="ppr-actions">
          <PrimaryButton type="button" disabled={!selected.size} onClick={() => onApply([...selected])} data-guide-ignore="ورقة مقررات البطاقة لشخص واحد — اختيار داخل الورقة، لا يرسل شيئاً"><Check aria-hidden="true" />اعتمد</PrimaryButton>
          <SecondaryButton type="button" onClick={() => setSelected(new Set(defaults.selected))} title="من تاريخه" data-guide-ignore="ورقة مقررات البطاقة لشخص واحد — اختيار داخل الورقة، لا يرسل شيئاً"><History aria-hidden="true" />من تاريخه</SecondaryButton>
          <SecondaryButton type="button" onClick={() => onApply(null)} title="بلا قيد — كما اليوم" data-guide-ignore="ورقة مقررات البطاقة لشخص واحد — اختيار داخل الورقة، لا يرسل شيئاً"><AllIcon aria-hidden="true" />كل المقررات</SecondaryButton>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
