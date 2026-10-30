/**
 * C5 — «حالة طرح المقرر» للمسؤول: 🟢 مطروح / 🔒 غير مطروح / 🌱 صحيفة جديدة / 🎯 شعب محدودة.
 * إخفاء أو باهت في كرت الأستاذ، واقتراحٌ تلقائي من الصحيفة يؤكّده المسؤول، وقائمة 🌟 الاهتمام المستقبلي.
 * القاعدة: src/utils/courseOffering.ts — يقرؤها الخادم للكرت والإضافة.
 * وتبويبا «🆕 الصحيفة الجديدة» و«📘 الصحيفة القديمة» بعدّاديهما، وعلى كل بطاقةٍ وسمُ
 * «وصلنا ✓ / لم نصل بعد 🔒» وسلسلتُه، و«افتحه للطرح» — من src/utils/courseReach.ts.
 */
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { useEffect, useMemo, useState } from "react";
import { Check, Layers } from "lucide-react";
import { OFFERING_META, type CourseOfferingDoc, type OfferingState } from "../utils/courseOffering";
import { reachLocked, splitBySheet } from "../utils/courseReach";
import { PrimaryButton } from "./ui";
import { ReachChain, ReachChip, ReachOpenButton, type ReachPayload } from "./CourseReach";

type Course = { id: number; name: string; code: string; level: number; sections: number };
type Payload = { doc: CourseOfferingDoc; reach?: ReachPayload; courses: Course[]; suggestions: Array<{ courseId: number; level: number; reachedLevel: number }>; interest: Array<{ courseId: number; instructors: string[] }> };
const STATES: OfferingState[] = ["offered", "closed", "future", "limited"];

export default function CourseOfferingPanel({ collegeId, sectionId, termId }: { collegeId: number; sectionId: number; termId: number }) {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<number, { state: OfferingState; level?: number; maxSections?: number }>>({});
  const [display, setDisplay] = useState<"hide" | "fade">("fade");
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"new" | "old" | null>(null);
  const [opening, setOpening] = useState(0);

  const load = async () => {
    const response = await fetch(`/api/course-offering?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) { setMsg(payload?.error || "تعذّر القراءة"); return; }
    setData(payload); setDisplay(payload.doc.display === "hide" ? "hide" : "fade");
    setDraft(Object.fromEntries(Object.values(payload.doc.courses || {}).filter((e: any) => !e.suggested).map((e: any) => [e.courseId, { state: e.state, level: e.level, maxSections: e.maxSections }])));
  };
  useEffect(() => { if (collegeId && sectionId && termId) void load(); }, [collegeId, sectionId, termId]);

  const stateOf = (id: number) => draft[id]?.state || "offered";
  const set = (id: number, patch: Partial<{ state: OfferingState; level: number; maxSections: number }>) =>
    setDraft(current => ({ ...current, [id]: { state: stateOf(id), ...current[id], ...patch } }));
  const counts = useMemo(() => {
    const out: Record<OfferingState, number> = { offered: 0, closed: 0, future: 0, limited: 0 };
    for (const course of data?.courses || []) out[stateOf(course.id)]++;
    return out;
  }, [data, draft]);
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const courses = (data?.courses || []).map(course => ({ courseId: course.id, ...(draft[course.id] || { state: "offered" }) }));
      const response = await fetch("/api/course-offering", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, display, courses }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.error || "تعذّر الحفظ");
      setMsg("✅ حُفظ · يظهر في بطاقة الأستاذ فوراً"); await load();
    } catch (e: any) { setMsg(`⛔ ${e.message}`); } finally { setBusy(false); }
  };
  /* «افتحه للطرح»: قرارٌ فوريّ يُحفظ وحده (لا ينتظر «حفظ»)، ويقرؤه الكرتُ والنموذجُ والاعتماد. */
  const toggleReach = async (courseId: number, open: boolean) => {
    setOpening(courseId); setMsg("");
    try {
      const response = await fetch("/api/course-reach/open", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collegeId, sectionId, termId, courseId, open }) });
      const reach = await response.json().catch(() => null);
      if (!response.ok || !reach) throw new Error(reach?.error || "تعذّر الحفظ");
      setData(current => current ? { ...current, reach } : current);
      setMsg(open ? "🔓 فُتح للطرح · يظهر في بطاقة الأستاذ فوراً" : "🔒 أُعيد للقاعدة");
    } catch (e: any) { setMsg(`⛔ ${e.message}`); } finally { setOpening(0); }
  };
  if (!data) return <div className="of-section" role="status">{msg || "…"}</div>;
  const nameOf = (id: number) => data.courses.find(c => c.id === id)?.name || `#${id}`;
  const reachOf = (id: number) => data.reach?.courses?.[id] || null;
  const split = splitBySheet(data.courses.map(c => c.id), data.reach?.sheets || []);
  const activeTab = split.tabs ? (tab ?? (split.new.length ? "new" : "old")) : null;
  const inTab = new Set(activeTab === "new" ? split.new : split.old);
  const lockedIn = (list: number[]) => list.filter(id => reachLocked(reachOf(id))).length;
  const shown = data.courses.filter(course => (!split.tabs || inTab.has(course.id)) && (!query || `${course.name} ${course.code}`.includes(query)));
  return (
    <div className="of-section" aria-label="حالة طرح المقررات">
      <h4><Layers aria-hidden="true" /> حالة طرح المقررات</h4>
      <div className="of-kpis">
        {STATES.map(state => <div className="of-kpi" key={state}><span className="of-ic" aria-hidden="true">{OFFERING_META[state].icon}</span><b>{counts[state]}</b><span>{OFFERING_META[state].label}</span></div>)}
      </div>
      <div className="of-row">
        <span>في بطاقة الأستاذ:</span>
        <button data-guide-ignore="حالة طرح المقرر — اختيار بصري داخل اللوحة" type="button" className="of-chip" aria-pressed={display === "fade"} onClick={() => setDisplay("fade")}>🔒 باهت بقفل</button>
        <button data-guide-ignore="حالة طرح المقرر — اختيار بصري داخل اللوحة" type="button" className="of-chip" aria-pressed={display === "hide"} onClick={() => setDisplay("hide")}>🙈 مخفي</button>
        <input type="search" placeholder="بحث…" value={query} onChange={e => setQuery(e.target.value)} style={{ minHeight: 36, borderRadius: 10, border: "1px solid var(--line)", padding: "4px 10px", font: "inherit" }} />
      </div>
      {data.suggestions.length ? (
        <div className="of-suggest" role="note">🌱 من الصحيفة: {countOf(data.suggestions.length, AR.course)} لم تصل دفعته (أعلى مستوى مطروح {data.suggestions[0].reachedLevel})
          <button data-guide-ignore="حالة طرح المقرر — اختيار بصري داخل اللوحة" type="button" className="of-chip" onClick={() => data.suggestions.forEach(s => set(s.courseId, { state: "future", level: s.level }))}><Check aria-hidden="true" /> تأكيد الاقتراح</button>
        </div>
      ) : null}
      {split.tabs ? (
        <div className="of-tabs" role="tablist" aria-label="الصحيفة">
          {(["new", "old"] as const).map(key => {
            const list = key === "new" ? split.new : split.old, locked = lockedIn(list);
            return <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setTab(key)}
              data-guide-ignore="يبدّل بين مقررات الصحيفة الجديدة والقديمة في اللوحة — عرض فقط">
              <span aria-hidden="true">{key === "new" ? "🆕" : "📘"}</span>{key === "new" ? "الصحيفة الجديدة" : "الصحيفة القديمة"}<b>{list.length}</b>
              {locked ? <span className="of-tab-lock">🔒 {locked}</span> : null}
            </button>;
          })}
        </div>
      ) : null}
      <div className="of-grid" style={{ marginTop: 10 }}>
        {shown.map(course => {
          const state = stateOf(course.id);
          const level = draft[course.id]?.level || course.level;
          const reach = reachOf(course.id);
          return (
            <div className="of-card" key={course.id} data-reach={reachLocked(reach) ? "locked" : undefined}>
              <header><div><b>{course.name}</b><small> {course.code}</small></div><span aria-hidden="true">{OFFERING_META[state].icon}</span></header>
              <div className="of-path" aria-label="مسار الصحيفة">{[100, 200, 300, 400].map(l => <i key={l} data-on={level && l <= level ? "1" : "0"} data-at={level === l ? "1" : "0"} title={`مستوى ${l}`} />)}<span>{level ? `م${level}` : "—"} · {countOf(course.sections, AR.section)}</span></div>
              {reach && reach.state !== "unknown" ? (
                <div className="of-reach" title={reach.reason || undefined}>
                  <div className="of-reach-top"><ReachChip reach={reach} /><ReachOpenButton reach={reach} busy={opening === course.id} onToggle={open => void toggleReach(course.id, open)}
                    data-guide-ignore="يفتح المقرر للطرح رغم «لم نصل بعد» (أو يعيده للقاعدة) — يُحفظ في حالة الطرح ويظهر في بطاقة الأستاذ" /></div>
                  <ReachChain reach={reach} />
                </div>
              ) : null}
              <div className="of-states" role="group" aria-label={`حالة ${course.name}`}>
                {STATES.map(s => <button data-guide-ignore="حالة طرح المقرر — اختيار بصري داخل اللوحة" type="button" key={s} aria-pressed={state === s} title={OFFERING_META[s].label} onClick={() => set(course.id, { state: s, ...(s === "future" && !draft[course.id]?.level ? { level: course.level || 0 } : {}) })}>{OFFERING_META[s].icon}</button>)}
              </div>
              {state === "future" ? <div className="of-row"><label>يُطرح عند المستوى<input type="number" step={100} min={100} max={400} value={level || ""} onChange={e => set(course.id, { level: Number(e.target.value) })} /></label></div> : null}
              {state === "limited" ? <div className="of-row"><label>🎯 أقصى شعب<input type="number" min={0} max={99} value={draft[course.id]?.maxSections ?? ""} onChange={e => set(course.id, { maxSections: Number(e.target.value) })} /></label><small>متبقٍّ {Math.max(0, (draft[course.id]?.maxSections || 0) - course.sections)}</small></div> : null}
            </div>
          );
        })}
      </div>
      {data.interest.length ? (
        <div className="of-section"><h4>🌟 اهتمام مستقبلي</h4>
          <div className="of-chips">{data.interest.map(row => <span className="of-chip" key={row.courseId}>🌟 {nameOf(row.courseId)} · {row.instructors.join("، ")}</span>)}</div>
        </div>
      ) : null}
      <div className="of-row" style={{ marginTop: 12 }}>
        <PrimaryButton data-guide-ignore="حالة طرح المقرر — اختيار بصري داخل اللوحة" type="button" disabled={busy} onClick={() => void save()}><Check aria-hidden="true" /> حفظ</PrimaryButton>
        {msg ? <span role="status">{msg}</span> : null}
      </div>
    </div>
  );
}
