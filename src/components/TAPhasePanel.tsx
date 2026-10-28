/**
 * F1–F2 — «🎓 مرحلة التدريب» في نشر بطاقة الأستاذ.
 * ملخّص الشعب الشاغرة («هيئة تدريسية») ← اختيار المدرّبين في موجات بالأولوية (أو دفعة واحدة)
 * ← نافذة زمنية بعدّاد ← تذكير تلقائي. الإرسال والحجز في الخادم (/api/ta-phase).
 */
import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, Send, Timer, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./ui";

type Vacant = { key: string; courseId: number; courseName: string; sectionCode: string; days: string[]; start: string; end: string; room: string };
type Ta = { id: number; name: string; load: number; chosen: number; opened: boolean; sent: boolean };
type Phase = {
  doc: null | { closesAt: string; waves: Array<{ n: number; instructorIds: number[]; sendAt: string; sentAt?: string }>; closedAt?: string; reminderHours: number };
  open: boolean; countdown: null | { days: number; hours: number; minutes: number; remind: boolean; closed: boolean };
  facultyPhase: { closesAt: string; closed: boolean };
  vacant: Vacant[]; summary: { sections: number; courses: number }; tas: Ta[];
};
const DAY = { fsunday: "ح", fmonday: "ن", ftuesday: "ث", fwednesday: "ر", fthursday: "خ" } as Record<string, string>;

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

  const load = async () => {
    setError("");
    try {
      const response = await fetch(`/api/ta-phase?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "تعذّر فتح مرحلة التدريب");
      setPhase(data);
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { if (collegeId && sectionId && termId) void load(); }, [collegeId, sectionId, termId]);

  const placed = useMemo(() => new Set(waves.flat()), [waves]);
  const toggle = (wave: number, id: number) => setWaves(current => current.map((list, index) =>
    index === wave ? (list.includes(id) ? list.filter(x => x !== id) : [...list, id]) : list.filter(x => x !== id)));

  const open = async () => {
    setBusy(true); setError(""); setDone("");
    try {
      const response = await fetch("/api/ta-phase/open", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ collegeId, sectionId, termId, waves: waves.filter(list => list.length), delayHours: waves.length > 1 ? delay : 0, closesAt: `${date}T${time}`, reminderHours: reminder }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "تعذّر فتح المرحلة");
      setDone(`أُرسل لـ ${data.sent?.length || 0} مدرّب`);
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
  return (
    <div className="of-section" aria-label="مرحلة التدريب">
      <h4><GraduationCap aria-hidden="true" /> مرحلة التدريب</h4>
      <div className="of-kpis">
        <div className="of-kpi"><span className="of-ic" aria-hidden="true">🪑</span><b>{phase.summary.sections}</b><span>شعبة شاغرة</span></div>
        <div className="of-kpi"><span className="of-ic" aria-hidden="true">📚</span><b>{phase.summary.courses}</b><span>مقرر</span></div>
        <div className="of-kpi"><span className="of-ic" aria-hidden="true">🎓</span><b>{phase.tas.length}</b><span>مدرّب</span></div>
        <div className="of-kpi"><span className="of-ic" aria-hidden="true">{phase.facultyPhase.closed ? "🔒" : "✏️"}</span><span>{phase.facultyPhase.closed ? "مرحلة الأساتذة مغلقة" : "مرحلة الأساتذة ما زالت مفتوحة"}</span></div>
      </div>
      {phase.vacant.length ? (
        <div className="of-chips" aria-label="الشعب الشاغرة">
          {phase.vacant.slice(0, 24).map(row => (
            <span className="of-chip" key={row.key}>🪑 {row.courseName} · {row.sectionCode} · {row.days.map(d => DAY[d] || "").join("")} <bdi dir="ltr">{row.start}–{row.end}</bdi>{row.room ? ` · ${row.room}` : ""}</span>
          ))}
          {phase.vacant.length > 24 ? <span className="of-chip">+{phase.vacant.length - 24}</span> : null}
        </div>
      ) : <p className="of-msg" data-tone="ok">✅ لا شعب شاغرة</p>}

      {phase.doc && !phase.doc.closedAt ? (
        <div className="of-section">
          <div className="of-row" style={{ justifyContent: "space-between" }}>
            <b><Timer aria-hidden="true" /> النافذة مفتوحة {cd?.remind ? "· 🔔 وقت التذكير" : ""}</b>
            {cd && !cd.closed ? <div className="of-countdown" aria-label="المتبقي">
              <span>{cd.days}<small>يوم</small></span><span>{cd.hours}<small>ساعة</small></span><span>{cd.minutes}<small>دقيقة</small></span>
            </div> : <b>انتهت النافذة</b>}
          </div>
          <div className="of-grid" style={{ marginTop: 10 }}>
            {phase.doc.waves.map(wave => (
              <div className="of-card" key={wave.n}>
                <header><b>موجة {wave.n}</b><small>{wave.sentAt ? "✅ أُرسلت" : `⏳ ${new Date(wave.sendAt).toLocaleString("ar-KW-u-nu-latn", { timeZone: "Asia/Kuwait" })}`}</small></header>
                <div className="of-chips">{wave.instructorIds.map(id => { const ta = phase.tas.find(t => t.id === id); return <span className="of-chip" key={id}>{ta?.chosen ? "✅" : ta?.opened ? "👀" : "✉️"} {ta?.name || id}</span>; })}</div>
              </div>
            ))}
          </div>
          <SecondaryButton type="button" disabled={busy} onClick={() => void close()} style={{ marginTop: 10 }}><X aria-hidden="true" /> إغلاق المرحلة</SecondaryButton>
        </div>
      ) : (
        <div className="of-section">
          {!phase.tas.length ? <p className="of-msg" data-tone="warn">⚠️ لا مدرّبين مصنّفين «TA» في بطاقات الأساتذة.</p> : null}
          {waves.map((list, index) => (
            <div className="of-wave" key={index}>
              <b>{waves.length > 1 ? `موجة ${index + 1} · أولوية ${index + 1}` : "دفعة واحدة"}</b>
              <div className="of-chips">
                {phase.tas.filter(ta => list.includes(ta.id) || !placed.has(ta.id)).map(ta => (
                  <button type="button" className="of-chip" key={ta.id} aria-pressed={list.includes(ta.id)} onClick={() => toggle(index, ta.id)}>
                    🎓 {ta.name}{ta.load ? ` · ${ta.load}س` : ""}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="of-row" style={{ marginTop: 10 }}>
            <SecondaryButton type="button" onClick={() => setWaves(current => [...current, []])}><Plus aria-hidden="true" /> موجة</SecondaryButton>
            {waves.length > 1 ? <label>⏱️ بين الموجات (ساعة)<input type="number" min={1} max={336} value={delay} onChange={e => setDelay(Number(e.target.value))} /></label> : null}
            <label>📅 الإغلاق<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
            <label>🕐 الساعة<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
            <label>🔔 تذكير قبل (ساعة)<input type="number" min={1} max={168} value={reminder} onChange={e => setReminder(Number(e.target.value))} /></label>
          </div>
          <PrimaryButton type="button" style={{ marginTop: 10 }} disabled={busy || !date || !waves.some(list => list.length)} onClick={() => void open()}>
            <Send aria-hidden="true" /> فتح مرحلة التدريب
          </PrimaryButton>
        </div>
      )}
      {done ? <p className="of-msg" data-tone="ok" role="status">✅ {done}</p> : null}
      {error ? <p className="of-msg" data-tone="bad" role="alert">⛔ {error}</p> : null}
    </div>
  );
}
