import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, CircleSlash, Info, RefreshCw, Users } from "lucide-react";
import { MicroLoader, SecondaryButton } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { request } from "./RadarSchedule";
import CourseTags from "./CourseTags";
import { SuggestionCard, type SuggestionRow } from "./RadarSuggestions";
import { onLiveSignal } from "../utils/livePulse";
import { alternativeAnchors, asOfLine, SOURCE_LABEL, STATE_LABEL, type BoardHeader, type BoardRow } from "../utils/liveBoard";

/**
 * ── «يوم التسجيل الحي» ──────────────────────────────────────────────────────
 *
 * لوحةُ شعبٍ مرتّبةٌ بالإلحاح فوق الرادار: متاح / يمتلئ (٨٠٪ فأكثر) / ممتلئ، ومن ينتظر (عدداً لا أسماء)،
 * وللممتلئ أو الذي يمتلئ وفيه منتظرون بطاقةُ الشعبة البديلة الجاهزة (بطاقةُ «الرادار يقترح الحل» نفسُها،
 * ومسارُ «اعتمد الشعبة» نفسُه وقاعدتُه: من يحرّر جدول القسم وحده يراه، وغيرُه يعرف من يعتمدها).
 *
 * لا اتصالَ بنظام التسجيل الرسمي: الأرقامُ من أجوبة الطلبة وطلبات الشعب والمحاكاة، وفي الرأس
 * «آخر تحديث للأرقام: … · المصدر: …» وتحذيرٌ حين تقدم. تتجدّد بنبضة التطبيق الحيّة، لا باستطلاعٍ متواصل.
 * تظهر مفتوحةً وبارزةً خلال جولة التسجيل، وفي غيرها تُفتح من زرّ «يوم التسجيل».
 * خادمُها: GET /api/simulation/live-board (src/server/liveBoard.ts).
 */
interface Reply {
  ready: boolean; reason?: string; termId?: number;
  header?: BoardHeader; rows?: BoardRow[]; more?: number;
  counts?: { open: number; filling: number; full: number; unknown: number; waiting: number };
  phase?: { key: string; line: string; active: boolean };
  suggestions?: Array<SuggestionRow & { canAdopt: boolean }>;
}

const nf = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");
const timeText = (iso: string | null) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("ar-KW-u-nu-latn", { timeZone: "Asia/Kuwait", dateStyle: "medium", timeStyle: "short" }); } catch { return iso; }
};

export default function LiveRegistrationBoard({ termId, collegeId = 0, sectionId = 0, canSchedule, frozen = false, roundActive, onChanged }: {
  termId: number; collegeId?: number; sectionId?: number;
  /** يكتب الجدول (صلاحية الجدول وليس للقراءة فقط): شرطٌ لظهور «اعتمد الشعبة»، ويُضاف إليه نطاقُ كل بطاقة من الخادم. */
  canSchedule: boolean;
  /** فصلٌ سابقٌ مجمَّد: لا لوحةَ ولا اعتماد. */
  frozen?: boolean;
  /** جولةُ تسجيلٍ جارية (من مراحل الفصل): تُظهر اللوحةَ مفتوحةً وبارزة. */
  roundActive: boolean;
  onChanged?: () => void;
}) {
  const [pick, setPick] = useState<boolean | null>(null);
  const open = pick ?? roundActive;
  const [reply, setReply] = useState<Reply | null>(null);
  const [error, setError] = useState("");
  const [adopted, setAdopted] = useState<number[]>([]);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    const params = new URLSearchParams({ termId: String(termId) });
    if (collegeId) params.set("collegeId", String(collegeId));
    if (sectionId) params.set("sectionId", String(sectionId));
    try {
      const body = await request(`/api/simulation/live-board?${params}`, { cache: "no-store" });
      if (mine === seq.current) { setReply(body); setError(""); }
    } catch (e: any) { if (mine === seq.current) setError(e.message || "تعذّر قراءة اللوحة."); }
  }, [termId, collegeId, sectionId]);

  useEffect(() => { setReply(null); setAdopted([]); if (open && !frozen) void load(); }, [open, frozen, load]);
  /* النبضةُ الحيّة: حفظُ جدول، أو جوابُ طالب، أو تعليمُ «سُجّل» ← قراءةٌ جديدة (مؤجَّلةٌ ثانيتين فلا تتكرر). */
  useEffect(() => {
    if (!open || frozen) return undefined;
    let timer = 0;
    const stop = onLiveSignal(["notify", "schedules"], () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 2000); });
    return () => { window.clearTimeout(timer); stop(); };
  }, [open, frozen, load]);

  if (frozen) return null;
  if (!open) return (
    <div className="lb-toggle no-print">
      <SecondaryButton type="button" onClick={() => setPick(true)} aria-expanded="false" data-guide-ignore="يفتح لوحة يوم التسجيل داخل شاشةٍ مسجّلة في المرشد باسم page.simulation"><Activity aria-hidden="true" /> يوم التسجيل</SecondaryButton>
    </div>
  );

  const header = reply?.header;
  const rows = reply?.rows || [];
  const anchors = alternativeAnchors(rows);
  const byCourse = new Map<number, SuggestionRow & { canAdopt: boolean }>();
  for (const item of reply?.suggestions || []) byCourse.set(item.courseId, item);
  const changed = adopted.length > 0;
  return (
    <section className={`rs-panel lb-board${roundActive ? " lb-live" : ""}`} aria-label="يوم التسجيل الحي" aria-busy={!reply && !error}>
      <header className="rs-head">
        <span className="rs-ic" aria-hidden="true"><Activity /></span>
        <div><b>يوم التسجيل{roundActive ? " — جارٍ الآن" : ""}</b>
          <small>الشعبُ مرتّبةً بالإلحاح: ما امتلأ وفيه منتظرون أولاً، وتحته الشعبةُ البديلة الجاهزة. أعدادٌ لا أسماء.</small></div>
        <div className="lb-tools no-print">
          <SecondaryButton type="button" onClick={() => void load()} aria-label="حدّث اللوحة الآن" data-guide-ignore="يعيد قراءة اللوحة؛ لا يكتب شيئاً"><RefreshCw aria-hidden="true" /> حدّث</SecondaryButton>
          {!roundActive ? <SecondaryButton type="button" onClick={() => setPick(false)} aria-expanded="true" data-guide-ignore="يغلق لوحة يوم التسجيل؛ لا يكتب شيئاً">أغلق اللوحة</SecondaryButton> : null}
        </div>
      </header>
      {error ? <p className="rs-line" role="alert"><CircleSlash aria-hidden="true" /> {error}</p> : null}
      {!reply && !error ? <MicroLoader label="يقرأ الرادار أرقام الشعب…" /> : null}
      {reply && !reply.ready ? <p className="rs-line"><Info aria-hidden="true" /> لا لوحةَ لهذا الفصل: لوحة يوم التسجيل لفصل الباب وحده.</p> : null}
      {reply?.ready && header ? (
        <>
          <p className={`lb-asof${header.stale ? " stale" : ""}`} role="status">{asOfLine(header, timeText(header.asOf))}</p>
          {header.stale ? <p className="rs-line rs-stale" role="status"><AlertTriangle aria-hidden="true" /> الأرقامُ قديمة{reply.phase?.active ? " ويومُ التسجيل جارٍ" : ""}: لا تبنِ عليها قراراً قبل أن تُحدَّث.</p> : null}
          {header.simulationOnly ? <p className="rs-line rs-stale" role="status"><Info aria-hidden="true" /> هذه أرقامُ محاكاة الرادار لا تسجيلاً فعلياً: لم يصل بعدُ جوابُ طالبٍ ولا تعليمُ «سُجّل». والرادارُ غيرُ موصولٍ بنظام التسجيل الرسمي.</p> : null}
          <ul className="lb-sources" aria-label="مصادر الأرقام">
            {header.sources.map(source => (
              <li key={source.source} className={source.present ? (source.stale ? "stale" : "fresh") : "absent"}>
                <b>{SOURCE_LABEL[source.source]}</b> <span>{source.present ? `${source.ageLine}${source.stale ? " — قديم" : ""}` : "لا بيانات بعد"}</span>
              </li>
            ))}
          </ul>
          {reply.counts ? (
            <p className="lb-counts" aria-label="ملخص اللوحة">
              <span className="lb-chip full">ممتلئ: {nf(reply.counts.full)}</span>
              <span className="lb-chip filling">يمتلئ: {nf(reply.counts.filling)}</span>
              <span className="lb-chip open">متاح: {nf(reply.counts.open)}</span>
              <span className="lb-chip wait"><Users aria-hidden="true" /> {countOf(reply.counts.waiting, AR.student)} بلا مقعد</span>
            </p>
          ) : null}
          {changed ? <p className="rs-line rs-stale" role="status"><RefreshCw aria-hidden="true" /> تغيّر الجدول بعد هذه الاقتراحات؛ تتجدّد مع القراءة التالية.</p> : null}
          {!rows.length ? <p className="rs-line"><Info aria-hidden="true" /> لا شعبَ في نطاقك لهذا الفصل بعد.</p> : (
            <div className="lb-list">
              {rows.map(row => {
                const suggestion = anchors.has(row.key) ? byCourse.get(row.courseId) : undefined;
                return (
                  <React.Fragment key={row.key}>
                    <BoardCard row={row} />
                    {suggestion ? (
                      <SuggestionCard row={suggestion} termId={termId} canSchedule={canSchedule} canAdopt={canSchedule && suggestion.canAdopt && !changed}
                        adopted={adopted.includes(suggestion.courseId)}
                        onApplied={() => { setAdopted(list => [...list, suggestion.courseId]); onChanged?.(); void load(); }} />
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>
          )}
          {reply.more ? <p className="rs-line">و{countOf(reply.more, AR.section)} أخرى أقلّ إلحاحاً؛ ضيّق الكلية أو القسم لتراها.</p> : null}
        </>
      ) : null}
    </section>
  );
}

function BoardCard({ row }: { key?: React.Key; row: BoardRow }) {
  const state = row.state;
  const percent = row.fill === null ? null : Math.round(row.fill * 100);
  return (
    <article className={`lb-card ${state || "unknown"}`} aria-label={`شعبة ${row.sectionCode} من «${row.name}»`}>
      <div className="rs-title">
        <b>{row.name}<CourseTags courseId={row.courseId} /></b><span dir="ltr">{row.code}</span>
        <em className={`lb-state ${state || "unknown"}`}>{state ? STATE_LABEL[state] : "غير معروف"}</em>
      </div>
      <p className="rs-line">شعبة <bdi dir="ltr">{row.sectionCode}</bdi>{row.time ? <> · <bdi dir="ltr">{row.time}</bdi></> : null}{row.capacity ? <> · السعة <bdi>{nf(row.capacity)}</bdi></> : null}</p>
      <div className="lb-bar" role="img" aria-label={percent === null ? "سعةُ الشعبة غير معروفة" : `الامتلاء ${nf(percent)}%`}><i style={{ inlineSize: `${Math.min(100, percent ?? 0)}%` }} /></div>
      <small className="rs-line">
        {percent === null ? "لا سعةَ مسجّلة لهذه الشعبة: لا نخمّن نسبتها." : `الامتلاء ${nf(percent)}%${row.lowerBound ? " (حدٌّ أدنى: أجوبةُ من أجاب فقط)" : ""}`}
        {row.source ? <> · الأساس: {SOURCE_LABEL[row.source]}</> : null}
      </small>
      {row.waiting > 0 ? <small className="rs-wait"><Users aria-hidden="true" /> {countOf(row.waiting, AR.student)} بلا مقعد في المقرر{row.waitingSource ? ` (${SOURCE_LABEL[row.waitingSource]})` : ""}</small> : null}
      {row.advisorAdded > 0 ? <small className="rs-line">أضاف المرشدون {countOf(row.advisorAdded, AR.student)} فوق السعة.</small> : null}
    </article>
  );
}
