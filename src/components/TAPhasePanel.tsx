/**
 * F1–F3 — «🎓 مرحلة التدريب» في نشر بطاقة الأستاذ.
 * ملخّص الشعب الشاغرة («هيئة تدريسية») ← المدرّبون في موجات بالأولوية (أو دفعة واحدة)، ولكلٍّ مقرراته
 * المسموحة (شرائح) ← نافذة زمنية بعدّاد ← تذكير بواتساب (رسالة جاهزة، والمنسّق يضغط «إرسال»).
 * الإرسال والحجز في الخادم (/api/ta-phase).
 */
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, GraduationCap, MessageCircle, Plus, Send, Timer, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";
import { reachAboutTaPhase } from "../utils/reachInstructor";

type Vacant = { key: string; courseId: number; courseName: string; sectionCode: string; days: string[]; start: string; end: string; room: string };
type Ta = { id: number; name: string; load: number; chosen: number; opened: boolean; sent: boolean; linkId: string; mobile: string; allowed: number[] };
type Phase = {
  doc: null | { closesAt: string; waves: Array<{ n: number; instructorIds: number[]; sendAt: string; sentAt?: string }>; closedAt?: string; reminderHours: number };
  open: boolean; countdown: null | { days: number; hours: number; minutes: number; remind: boolean; closed: boolean };
  facultyPhase: { closesAt: string; closed: boolean };
  vacant: Vacant[]; summary: { sections: number; courses: number }; tas: Ta[];
  courses: Array<{ id: number; name: string; code: string }>;
};
const DAY = { fsunday: "ح", fmonday: "ن", ftuesday: "ث", fwednesday: "ر", fthursday: "خ" } as Record<string, string>;
const IGNORE = "مرحلة التدريب — إعداد الموجات والنافذة";

export default function TAPhasePanel({ collegeId, sectionId, termId }: { collegeId: number; sectionId: number; termId: number }) {
  const [phase, setPhase] = useState<Phase | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waves, setWaves] = useState<number[][]>([[]]);
  const [delay, setDelay] = useState(24);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("23:59");
  const [reminder, setReminder] = useState(24);
  const [done, setDone] = useState("");
  /* المقررات المسموحة لكل مدرّب: مسودةٌ قبل الفتح، وتُحفظ فوراً بعده. فارغة = كل المقررات. */
  const [allowed, setAllowed] = useState<Record<number, number[]>>({});
  const [editing, setEditing] = useState<number | null>(null);

  const load = async () => {
    setError("");
    try {
      const response = await fetch(`/api/ta-phase?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "تعذّر فتح مرحلة التدريب");
      setPhase(data);
      setAllowed(Object.fromEntries((data.tas || []).filter((ta: Ta) => ta.allowed?.length).map((ta: Ta) => [ta.id, ta.allowed])));
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { if (collegeId && sectionId && termId) void load(); }, [collegeId, sectionId, termId]);

  const placed = useMemo(() => new Set(waves.flat()), [waves]);
  const toggle = (wave: number, id: number) => setWaves(current => current.map((list, index) =>
    index === wave ? (list.includes(id) ? list.filter(x => x !== id) : [...list, id]) : list.filter(x => x !== id)));
  /* مقررات الشعب الشاغرة أولاً: هي ما يمكن اختياره فعلاً. */
  const courseChoices = useMemo(() => {
    const vacantIds = new Set((phase?.vacant || []).map(row => row.courseId));
    return [...(phase?.courses || [])].sort((a, b) => Number(vacantIds.has(b.id)) - Number(vacantIds.has(a.id)) || a.name.localeCompare(b.name, "ar"))
      .map(course => ({ ...course, vacant: vacantIds.has(course.id) }));
  }, [phase]);

  const toggleCourse = async (taId: number, courseId: number) => {
    const current = allowed[taId] || [];
    const next = current.includes(courseId) ? current.filter(id => id !== courseId) : [...current, courseId];
    setAllowed(all => ({ ...all, [taId]: next }));
    if (phase?.doc && !phase.doc.closedAt) {
      await fetch("/api/ta-phase/allowed", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, instructorId: taId, courseIds: next }) }).catch(() => undefined);
    }
  };

  const open = async () => {
    setBusy(true); setError(""); setDone("");
    try {
      const response = await fetch("/api/ta-phase/open", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ collegeId, sectionId, termId, waves: waves.filter(list => list.length), delayHours: waves.length > 1 ? delay : 0,
          closesAt: `${date}T${time}`, reminderHours: reminder, allowedCourses: allowed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "تعذّر فتح المرحلة");
      setDone(`أُرسل · ${countOf(data.sent?.length || 0, AR.instructor)}`);
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const close = async () => {
    setBusy(true);
    try { await fetch("/api/ta-phase/close", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ collegeId, sectionId, termId }) }); await load(); }
    finally { setBusy(false); }
  };

  if (!phase) return <div className="of-section" role="status">{error || "…"}</div>;
  const cd = phase.countdown;
  const closesLabel = phase.doc ? new Intl.DateTimeFormat("ar-KW-u-nu-latn", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuwait" }).format(new Date(phase.doc.closesAt)) : "";
  const allowedEditor = (ta: Ta) => editing === ta.id ? (
    <div className="ta-allowed" aria-label={`مقررات ${ta.name}`}>
      <div className="of-chips">
        {courseChoices.map(course => (
          <button data-guide-ignore="مرحلة التدريب — إعداد الموجات والنافذة" type="button" key={course.id} className="of-chip" aria-pressed={(allowed[ta.id] || []).includes(course.id)} onClick={() => void toggleCourse(ta.id, course.id)}>
            {course.vacant ? "🪑" : "📘"} {course.name}
          </button>
        ))}
      </div>
      <small className="ta-allowed-hint">{(allowed[ta.id] || []).length ? countOf((allowed[ta.id] || []).length, AR.course) : "كل المقررات"}</small>
    </div>
  ) : null;
  const allowedButton = (ta: Ta) => (
    <button data-guide-ignore="مرحلة التدريب — إعداد الموجات والنافذة" type="button" className="ta-mini" aria-expanded={editing === ta.id} title="المقررات المسموحة" aria-label={`المقررات المسموحة لـ${ta.name}`} onClick={() => setEditing(current => current === ta.id ? null : ta.id)}>
      <BookOpen aria-hidden="true" /><b>{(allowed[ta.id] || []).length || "∞"}</b>
    </button>
  );
  return (
    <div className="of-section" aria-label="مرحلة التدريب">
      <h4><GraduationCap aria-hidden="true" /> مرحلة التدريب</h4>
      <div className="of-kpis">
        <div className="of-kpi"><span className="of-ic" aria-hidden="true">🪑</span><b>{phase.summary.sections}</b><span>الشعب الشاغرة</span></div>
        <div className="of-kpi"><span className="of-ic" aria-hidden="true">📚</span><b>{phase.summary.courses}</b><span>المقررات</span></div>
        <div className="of-kpi"><span className="of-ic" aria-hidden="true">🎓</span><b>{phase.tas.length}</b><span>المدرّبون</span></div>
        <div className="of-kpi"><span className="of-ic" aria-hidden="true">{phase.facultyPhase.closed ? "🔒" : "✏️"}</span><span>{phase.facultyPhase.closed ? "مرحلة الأساتذة مغلقة" : "مرحلة الأساتذة مفتوحة"}</span></div>
      </div>
      {phase.vacant.length ? (
        <div className="of-chips" aria-label="الشعب الشاغرة">
          {phase.vacant.slice(0, 24).map(row => (
            <span className="of-chip" key={row.key}>🪑 {row.courseName} · {row.sectionCode} · {row.days.map(d => DAY[d] || "").join("·")} <bdi dir="ltr">{row.start}–{row.end}</bdi>{row.room ? ` · ${row.room}` : ""}</span>
          ))}
          {phase.vacant.length > 24 ? <span className="of-chip">+{phase.vacant.length - 24}</span> : null}
        </div>
      ) : <p className="of-msg" data-tone="ok">✅ لا شعب شاغرة</p>}

      {phase.doc && !phase.doc.closedAt ? (
        <div className="of-section">
          <div className="of-row" style={{ justifyContent: "space-between" }}>
            <b><Timer aria-hidden="true" /> النافذة مفتوحة {cd?.remind ? "· 🔔 وقت التذكير" : ""}</b>
            {cd && !cd.closed ? <div className="of-countdown" aria-label="المتبقي">
              <span>{cd.days}<small>{nounFor(cd.days, AR.day)}</small></span><span>{cd.hours}<small>{nounFor(cd.hours, AR.hour)}</small></span><span>{cd.minutes}<small>{nounFor(cd.minutes, AR.minute)}</small></span>
            </div> : <b>انتهت النافذة</b>}
          </div>
          <div className="of-grid" style={{ marginTop: 10 }}>
            {phase.doc.waves.map(wave => (
              <div className="of-card" key={wave.n}>
                <header><b>موجة {wave.n}</b><small>{wave.sentAt ? "✅ أُرسلت" : `⏳ ${new Date(wave.sendAt).toLocaleString("ar-KW-u-nu-latn", { timeZone: "Asia/Kuwait" })}`}</small></header>
                {wave.instructorIds.map(id => {
                  const ta = phase.tas.find(t => t.id === id);
                  if (!ta) return null;
                  const reach = ta.linkId && !ta.chosen ? reachAboutTaPhase({ AdInstructorName: ta.name, AdInstructorMobile: ta.mobile }, `${window.location.origin}/r/${ta.linkId}`, closesLabel) : null;
                  return (
                    <div key={id} className="ta-row">
                      <span className="ta-state" title={ta.chosen ? "اختار" : ta.opened ? "فتح الرابط" : "لم يفتح"}>{ta.chosen ? "✅" : ta.opened ? "👀" : "✉️"}</span>
                      <b>{ta.name}</b>
                      {allowedButton(ta)}
                      {reach ? (reach.href
                        ? <a className="ta-mini ta-wa" href={reach.href} target="_blank" rel="noopener" title={reach.text} aria-label={`تذكير ${ta.name} بواتساب`} data-guide-ignore="مرحلة التدريب — إعداد الموجات والنافذة"><MessageCircle aria-hidden="true" /> تذكير</a>
                        : <span className="ta-mini" title={reach.blocked || ""}>📵</span>) : null}
                      {allowedEditor(ta)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <SecondaryButton data-guide-ignore="مرحلة التدريب — إعداد الموجات والنافذة" type="button" disabled={busy} onClick={() => void close()} style={{ marginTop: 10 }}><X aria-hidden="true" /> إغلاق المرحلة</SecondaryButton>
        </div>
      ) : (
        <div className="of-section">
          {!phase.tas.length ? <p className="of-msg" data-tone="warn">⚠️ لا مدرّبين مصنّفين «TA» في بطاقات الأساتذة.</p> : null}
          {waves.map((list, index) => (
            <div className="of-wave" key={index}>
              <b>{waves.length > 1 ? `موجة ${index + 1} · أولوية ${index + 1}` : "دفعة واحدة"}</b>
              {phase.tas.filter(ta => list.includes(ta.id) || !placed.has(ta.id)).map(ta => (
                <div key={ta.id} className="ta-row">
                  <button data-guide-ignore="مرحلة التدريب — إعداد الموجات والنافذة" type="button" className="of-chip" aria-pressed={list.includes(ta.id)} onClick={() => toggle(index, ta.id)}>
                    🎓 {ta.name}{ta.load ? <small> · {countOf(ta.load, AR.hour)}</small> : null}
                  </button>
                  {allowedButton(ta)}
                  {allowedEditor(ta)}
                </div>
              ))}
            </div>
          ))}
          <div className="of-row" style={{ marginTop: 10 }}>
            <SecondaryButton data-guide-ignore="مرحلة التدريب — إعداد الموجات والنافذة" type="button" onClick={() => setWaves(current => [...current, []])}><Plus aria-hidden="true" /> موجة</SecondaryButton>
            {waves.length > 1 ? <label>⏱️ بين الموجات (ساعة)<input type="number" min={1} max={336} value={delay} onChange={e => setDelay(Number(e.target.value))} /></label> : null}
            <label>📅 الإغلاق<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <label>🕐 الساعة<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
            <label>🔔 تذكير قبل (ساعة)<input type="number" min={1} max={168} value={reminder} onChange={e => setReminder(Number(e.target.value))} /></label>
          </div>
          <PrimaryButton data-guide-ignore="مرحلة التدريب — إعداد الموجات والنافذة" type="button" style={{ marginTop: 10 }} disabled={busy || !date || !waves.some(list => list.length)} onClick={() => void open()}>
            <Send aria-hidden="true" /> فتح مرحلة التدريب
          </PrimaryButton>
        </div>
      )}
      {done ? <p className="of-msg" data-tone="ok" role="status">✅ {done}</p> : null}
      {error ? <p className="of-msg" data-tone="bad" role="alert">⛔ {error}</p> : null}
    </div>
  );
}
