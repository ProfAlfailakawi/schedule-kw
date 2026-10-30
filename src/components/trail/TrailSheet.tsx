import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDrawerA11y } from "../ui";
import { TRAIL_KIND_META, TRAIL_KINDS, trailClock, trailDayLabel, trailInitial, trailWhen, type TrailKind } from "../../utils/activityTrail";
import { AR, countOf } from "../../utils/arabicCount";
import "./trail.css";

/**
 * ── «👣 الأثر»: ورقةٌ جانبية لا شاشة (الملاحظة 9) ──────────────────────────────────
 *
 * وجوهُ من عمل بحلقةٍ تقيس حركاته هذا الأسبوع، وشريطٌ زمنيٌّ ملوّن بالنوع، وضغطةٌ على السطر
 * تفتح «قبل ← بعد». للقراءة فقط: لا زرَّ هنا يعدّل شيئاً. وما يصل الورقةَ قرّره الخادم.
 */
interface Face { key: string; name: string; seat: string; week: number; total: number }
interface Entry { id: string; at: string; key: string; who: string; seat: string; kind: TrailKind; target: string; detail?: string; before?: string; after?: string }
interface TrailBody {
  audience: string;
  period: { current: { name: string } | null; previous: { name: string } | null };
  people: Face[];
  entries: Entry[];
  truncated: boolean;
}

const RING = 2 * Math.PI * 21;

function FaceRing({ face, max, on, onPick }: { key?: React.Key; face: Face; max: number; on: boolean; onPick: () => void }) {
  const share = max ? Math.max(0.06, face.week / max) : 0;
  return (
    <button type="button" className={`trail-face${on ? " on" : ""}`} aria-pressed={on} onClick={onPick}
      title={`${face.name} · ${countOf(face.week, AR.move, "لا حركة")} هذا الأسبوع`}
      data-guide-ignore="ورقة «الأثر»: تصفية الشريط على حركات هذا الشخص؛ قراءة فقط">
      <span className="trail-ring" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="21" className="trail-ring-track" />
          <circle cx="24" cy="24" r="21" className="trail-ring-fill" strokeDasharray={`${share * RING} ${RING}`} />
        </svg>
        <i>{trailInitial(face.name)}</i>
        <b>{face.week.toLocaleString("ar-KW-u-nu-latn")}</b>
      </span>
      <small>{face.name.replace(/^(د|أ|م)\.\s*/, "")}</small>
    </button>
  );
}

function Delta({ entry }: { entry: Entry }) {
  /* كلُّ طرفٍ معزولٌ باتجاهه (bdi): «08:00–09:15» يُقرأ كما كُتب داخل سطرٍ عربي. */
  if (entry.before && entry.after) return <><s><bdi>{entry.before}</bdi></s><em aria-label="صار">←</em><b><bdi>{entry.after}</bdi></b></>;
  if (entry.after) return <><em aria-hidden="true">＋</em><b><bdi>{entry.after}</bdi></b></>;
  if (entry.before) return <s><bdi>{entry.before}</bdi></s>;
  return <span>{entry.detail || "—"}</span>;
}

export default function TrailSheet({ onClose }: { onClose: () => void }) {
  const ref = useDrawerA11y<HTMLElement>(onClose);
  const [body, setBody] = useState<TrailBody | null>(null);
  const [failed, setFailed] = useState(false);
  const [person, setPerson] = useState("");
  const [kind, setKind] = useState<TrailKind | "">("");
  const [open, setOpen] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/activity-trail", { cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("trail")))
      .then(next => { if (alive) setBody(next); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const ofPerson = useMemo(() => (body?.entries || []).filter(entry => !person || entry.key === person), [body, person]);
  const counts = useMemo(() => {
    const out: Partial<Record<TrailKind, number>> = {};
    for (const entry of ofPerson) out[entry.kind] = (out[entry.kind] || 0) + 1;
    return out;
  }, [ofPerson]);
  const shown = useMemo(() => ofPerson.filter(entry => !kind || entry.kind === kind), [ofPerson, kind]);
  const days = useMemo(() => {
    const groups: Array<{ label: string; items: Entry[] }> = [];
    for (const entry of shown) {
      const label = trailDayLabel(entry.at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(entry); else groups.push({ label, items: [entry] });
    }
    return groups;
  }, [shown]);
  const max = Math.max(1, ...(body?.people || []).map(face => face.week));
  const period = body?.period;

  return createPortal(
    <>
      <div className="trail-backdrop no-print" onMouseDown={onClose} aria-hidden="true" />
      <aside ref={ref} className="trail-sheet no-print" role="dialog" aria-modal="true" aria-label="الأثر: من فعل ماذا">
        <header className="trail-head">
          <span className="trail-mark" aria-hidden="true">👣</span>
          <div>
            <h2>الأثر</h2>
            {period?.current ? <small>{period.current.name}{period.previous ? ` · ${period.previous.name}` : ""}</small> : null}
          </div>
          <button data-guide-ignore="إغلاق ورقة «الأثر»" type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></button>
        </header>

        {!body && !failed ? (
          <div className="trail-skeleton" role="status" aria-label="يجري تحميل الأثر"><span /><span /><span /></div>
        ) : null}

        {failed ? <p className="trail-empty-line" role="alert">تعذّر تحميل الأثر.</p> : null}

        {body && (body.audience === "none" || !body.entries.length) ? (
          <div className="trail-empty">
            <span aria-hidden="true">👣</span>
            <b>{body.audience === "none" ? "لا أثر لك هنا" : "لا أثر بعد"}</b>
            <small>{body.audience === "none" ? "هذه الورقة لغير صفتك." : "تظهر هنا كل إضافةٍ وتعديلٍ واعتماد."}</small>
          </div>
        ) : null}

        {body && body.entries.length ? (
          <>
            {body.people.length > 1 ? (
              <section className="trail-faces" aria-label="الأعضاء وحركاتهم هذا الأسبوع">
                {body.people.map(face => (
                  <FaceRing key={face.key} face={face} max={max} on={person === face.key} onPick={() => { setPerson(person === face.key ? "" : face.key); setOpen(""); }} />
                ))}
              </section>
            ) : null}

            <div className="trail-kinds" role="group" aria-label="نوع الحركة">
              {TRAIL_KINDS.filter(k => counts[k]).map(k => (
                <button key={k} type="button" className={`trail-kind tone-${TRAIL_KIND_META[k].tone}${kind === k ? " on" : ""}`} aria-pressed={kind === k}
                  onClick={() => { setKind(kind === k ? "" : k); setOpen(""); }} title={TRAIL_KIND_META[k].label}
                  data-guide-ignore="ورقة «الأثر»: تصفية الشريط بنوع الحركة؛ قراءة فقط">
                  <span aria-hidden="true">{TRAIL_KIND_META[k].icon}</span>
                  <b>{(counts[k] || 0).toLocaleString("ar-KW-u-nu-latn")}</b>
                  <small>{TRAIL_KIND_META[k].label}</small>
                </button>
              ))}
            </div>

            <ol className="trail-line">
              {days.map(day => (
                <li key={day.label} className="trail-day">
                  <h3>{day.label}</h3>
                  <ol>
                    {day.items.map(entry => {
                      const meta = TRAIL_KIND_META[entry.kind];
                      const expanded = open === entry.id;
                      return (
                        <li key={entry.id} className={`trail-item tone-${meta.tone}${expanded ? " open" : ""}`}>
                          <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? "" : entry.id)}
                            data-guide-ignore="ورقة «الأثر»: يفتح سطر «قبل ← بعد» لهذه الحركة؛ قراءة فقط">
                            <span className="trail-dot" aria-label={meta.label}>{meta.icon}</span>
                            <span className="trail-text"><b>{entry.who}</b><span>{entry.target}</span></span>
                            <time dateTime={entry.at}>{trailClock(entry.at)}</time>
                          </button>
                          {expanded ? (
                            <p className="trail-delta">
                              <Delta entry={entry} />
                              <small>{entry.seat !== entry.who ? `${entry.seat} · ` : ""}{trailWhen(entry.at)}</small>
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </li>
              ))}
            </ol>
            {!shown.length ? <p className="trail-empty-line">لا حركة بهذا المرشّح.</p> : null}
            {body.truncated ? <p className="trail-more">الأحدث فقط</p> : null}
          </>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}
