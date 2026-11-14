/**
 * ── الطلب الفعلي: تقرير التسجيل يقود الجدول ويحرسه ──
 *
 * قراءةٌ في مركز الذكاء: زرٌّ واحد «ارفع تقرير الطلب»، ثم رقمٌ واحد كبير، ثم قائمةٌ قصيرة
 * مرتبة بالأشد (أيقونة · رقم · «عالج»). لا جداول طويلة ولا فقرات شرح.
 * الحساب كلُّه على الخادم (src/server/actualDemand.ts)؛ هنا العرض والرفع والربط.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight, CalendarPlus, CircleCheck, Gauge, TrendingDown, ClipboardList, EyeOff, FileUp, GraduationCap, Link2, OctagonAlert, TriangleAlert, Unlink, Users, X,
} from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import CourseTags from "./CourseTags";
import { Num } from "./ui";
import { AR, countOf, nounFor, oblique } from "../utils/arabicCount";
import { DEMAND_VARIANT_LABEL, guessDemandVariant, type DemandVariant } from "../utils/actualDemand";
import { announceActualDemandChange, openActualDemandFix } from "../utils/actualDemandHandoff";
import type { DemandAlertSummary } from "../utils/actualDemandSupply";

interface Target { courseId: number; collegeId: number; sectionId: number; track: string }
interface Alert { code: string; name: string; students: number; boys: number; girls: number; graduates: number; targets: Target[] }
interface SupplyBranchView { track: string; demand: number; graduates: number; sections: number; seats: number; gap: number }
export interface SupplyItemView {
  code: string; name: string; demand: number; graduates: number; sections: number; seats: number; gap: number;
  unmetStudents: number; unmetGraduates: number; branches: SupplyBranchView[]; move: { from: string; to: string; sections: number } | null; targets: Target[];
}
type SupplyKind = "zero" | "grad" | "short" | "move" | "spare";
/** نوعُ البند: بلا شعبة أصلاً، خريجون بلا مقعد، عجز، نقلٌ يكفي، أو فائض. */
const kindOf = (item: SupplyItemView): SupplyKind =>
  item.unmetGraduates > 0 ? "grad" : item.sections === 0 && item.unmetStudents > 0 ? "zero" : item.gap > 0 || item.unmetStudents > 0 ? (item.move && item.gap <= 0 ? "move" : "short") : item.move ? "move" : "spare";
const KIND_ICON: Record<SupplyKind, React.ReactNode> = {
  zero: <OctagonAlert />, grad: <GraduationCap />, short: <Users />, move: <ArrowLeftRight />, spare: <TrendingDown />,
};
const percent = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${Math.round(value)}%`);
const toneOf = (value: number | null | undefined) => (value === null || value === undefined ? "" : value >= 100 ? "is-good" : value >= 85 ? "is-warn" : "is-bad");

interface VariantInfo { uploadedAt: string; by: string; courses: number; students: number; termLabel: string; department: string }
export interface DemandReadingView {
  family: { key: string; name: string; members: Array<{ collegeId: number; sectionId: number; collegeName: string; track: string }> };
  variants: Record<DemandVariant, VariantInfo | null>;
  history: Array<{ variant: DemandVariant; at: string; by: string; hash: string; courses: number; students: number }>;
  matched: number;
  /** «نسبة خدمة الطلب» (٪) للعام وللخريجين ولكل مسار؛ null قبل الرفع. */
  service: { general: number | null; graduates: number | null; byTrack: Array<{ track: string; general: number | null; graduates: number | null }> } | null;
  supply: SupplyItemView[];
  /** أرقام التنبيه من كل البنود على الخادم (القائمة supply مقصوصة)، وعددُ البنود قبل القص. */
  alertSummary?: DemandAlertSummary | null;
  supplyTotal?: number;
  alerts: Alert[];
  unmatched: Array<{ code: string; name: string; students: number }>;
  catalogue: Array<{ courseId: number; code: string; name: string }>;
}
interface Preview {
  variant: DemandVariant; termLabel: string; department: string; courses: number; students: number; matched: number; unmatched: number;
  termMatches: boolean | null; departmentMatches: boolean; duplicate: boolean; warnings: string[];
}

const dateLabel = (iso: string) => {
  try { return new Date(iso).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "short" }); } catch { return ""; }
};

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || "تعذّر الاتصال."), { status: response.status, body });
  return body;
}

export default function ActualDemandPanel({ collegeId, sectionId, termId, initial = null, onReading, mode = "full", inPlace = false }: {
  collegeId: number; sectionId: number; termId: number;
  /** «data» في أدوات الجدول: الرفعُ والربط والرقم وحده — قائمة العلاج مكانُها الجدول ومركز التحليلات. */
  mode?: "full" | "data";
  /** داخل الجدول الدراسي: «عالج» يفتح المحرّر في مكانه بلا انتقال. */
  inPlace?: boolean;
  /** ما قرأه مركز الذكاء للبطاقة: يُعرض فوراً ثم يُحدَّث. */
  initial?: DemandReadingView | null;
  /** يُبلَّغ به مركز الذكاء ليكتب رقم البطاقة. */
  onReading?: (reading: DemandReadingView | null) => void;
}) {
  const [reading, setReading] = useState<DemandReadingView | null>(initial);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "error">(initial ? "ready" : "loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [variant, setVariant] = useState<DemandVariant>("general");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [linking, setLinking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const query = `collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`;

  /* الجدولُ يتغيّر في الورشة: النسبةُ تُقرأ من جديد كلما عاد المستخدم إلى هذه الصفحة. */
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const back = () => { if (document.visibilityState === "visible") setRevision(value => value + 1); };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => { document.removeEventListener("visibilitychange", back); window.removeEventListener("focus", back); };
  }, []);
  const show = useCallback((next: DemandReadingView | null) => { setReading(next); onReading?.(next); }, [onReading]);

  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    const controller = new AbortController();
    if (!revision) {
      if (!initial) setStatus("loading");
      setPreview(null); setFile(null); setError("");
    }
    fetch(`/api/actual-demand?${query}`, { credentials: "include", signal: controller.signal })
      .then(readJson)
      .then(body => { if (!controller.signal.aborted) { show(body); setStatus("ready"); } })
      .catch(failure => { if (!controller.signal.aborted && !revision) { show(null); setStatus(failure?.status === 403 ? "denied" : "error"); } });
    return () => controller.abort();
  }, [query, revision]);

  const send = async (picked: File, kind: DemandVariant, commit: boolean, confirm = false) => {
    setBusy(true); setError("");
    try {
      const url = `/api/actual-demand/upload?${query}&variant=${kind}${commit ? "&commit=1" : ""}${confirm ? "&confirm=1" : ""}`;
      const body = await readJson(await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/octet-stream" }, body: picked }));
      if (commit) { show(body.reading); setPreview(null); setFile(null); announceActualDemandChange(); }
      else setPreview(body.preview);
    } catch (failure: any) {
      setError(failure?.message || "تعذّرت قراءة الملف.");
    } finally { setBusy(false); }
  };

  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    const kind = guessDemandVariant(picked.name);
    setFile(picked); setVariant(kind);
    void send(picked, kind, false);
  };

  const changeVariant = (kind: DemandVariant) => {
    setVariant(kind);
    if (file) void send(file, kind, false);
  };

  const link = async (code: string, payload: { courseId?: number; ignore?: boolean }) => {
    setLinking(true); setError("");
    try {
      const body = await readJson(await fetch("/api/actual-demand/link", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, code, ...payload }),
      }));
      show(body);
      announceActualDemandChange();
    } catch (failure: any) { setError(failure?.message || "تعذّر الحفظ."); }
    finally { setLinking(false); }
  };


  if (status === "denied") return null;
  const hasReport = Boolean(reading?.variants.general || reading?.variants.graduates);
  const mismatch = preview && (preview.termMatches === false || !preview.departmentMatches);

  return (
    <section className="ad-panel" aria-label="الطلب الفعلي" aria-busy={status === "loading" || busy}>
      <header className="ad-head">
        <span className="ad-mark" aria-hidden="true"><ClipboardList /></span>
        <div className="ad-title">
          <strong>{reading?.family.name || "عائلة القسم"}</strong>
          <small>بنين وبنات · كل الكليات</small>
        </div>
        <button type="button" className="btn btn-primary ad-upload" disabled={busy} onClick={() => input.current?.click()}
          data-guide-ignore="يختار ملف PDF من التسجيل ويقرؤه أولاً؛ لا يُحفظ شيء قبل «احفظ»">
          <FileUp aria-hidden="true" /> ارفع تقرير الطلب
        </button>
        <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={pick} />
      </header>

      <div className="ad-variants" role="list">
        {(["general", "graduates"] as const).map(kind => {
          const info = reading?.variants[kind];
          return (
            <span key={kind} role="listitem" className={`ad-variant${info ? " is-on" : ""}`} title={info ? `${info.by} · ${countOf(info.courses, AR.course)}` : "لم يُرفع"}>
              {kind === "general" ? <Users aria-hidden="true" /> : <GraduationCap aria-hidden="true" />}
              <b>{DEMAND_VARIANT_LABEL[kind]}</b>
              {info ? <><CircleCheck aria-hidden="true" className="ad-ok" /><small>{dateLabel(info.uploadedAt)}</small></> : <small>—</small>}
            </span>
          );
        })}
      </div>

      {error ? <p className="ad-error" role="alert"><TriangleAlert aria-hidden="true" /> {error}</p> : null}

      {preview && file ? (
        <article className={`ad-preview${mismatch ? " is-warn" : ""}`} aria-live="polite">
          <header>
            <b>{preview.department || "قسم غير مقروء"}</b>
            <small>{preview.termLabel}</small>
            <button type="button" className="ad-close" aria-label="إلغاء" onClick={() => { setPreview(null); setFile(null); }}
              data-guide-ignore="يلغي الملف المقروء قبل حفظه"><X aria-hidden="true" /></button>
          </header>
          <ul className="ad-facts">
            <li><Num value={preview.courses} /><small>{nounFor(preview.courses, AR.course)}</small></li>
            <li><Num value={preview.students.toLocaleString("en-US")} /><small>{nounFor(preview.students, AR.student)}</small></li>
            <li className={preview.unmatched ? "is-warn" : ""}><Num value={`${preview.matched}/${preview.courses}`} /><small>مطابق</small></li>
          </ul>
          <div className="ad-seg" role="group" aria-label="نوع التقرير">
            {(["general", "graduates"] as const).map(kind => (
              <button key={kind} type="button" aria-pressed={variant === kind} className={variant === kind ? "on" : ""} disabled={busy}
                onClick={() => changeVariant(kind)} data-guide-ignore="يختار نوع التقرير قبل حفظه">
                {kind === "general" ? <Users aria-hidden="true" /> : <GraduationCap aria-hidden="true" />}{DEMAND_VARIANT_LABEL[kind]}
              </button>
            ))}
          </div>
          {preview.termMatches === false ? <p className="ad-flag"><TriangleAlert aria-hidden="true" /> فصلٌ غير الفصل المفتوح</p> : null}
          {!preview.departmentMatches ? <p className="ad-flag"><TriangleAlert aria-hidden="true" /> قسمٌ غير القسم المفتوح</p> : null}
          {preview.duplicate ? <p className="ad-flag is-soft"><CircleCheck aria-hidden="true" /> الملف نفسه محفوظ</p> : null}
          <footer>
            <button type="button" className={`btn ${mismatch ? "btn-secondary" : "btn-primary"}`} disabled={busy}
              onClick={() => void send(file, variant, true, Boolean(mismatch))}
              data-guide-ignore="يحفظ التقرير لعائلة القسم في هذا الفصل؛ لا يغيّر الجدول">
              {mismatch ? "احفظ رغم ذلك" : "احفظ"}
            </button>
          </footer>
        </article>
      ) : null}

      {status === "loading" && !reading ? <div className="ad-skeleton" aria-hidden="true"><i /><i /><i /></div> : null}

      {busy && !preview ? <div className="ad-reading" role="status"><span className="ad-spin" aria-hidden="true" /> أقرأ الملف…</div> : null}

      {status === "ready" && !hasReport && !preview && !busy ? (
        <button type="button" className="ad-empty" onClick={() => input.current?.click()} data-guide-ignore="يختار ملف PDF من التسجيل؛ لا يُحفظ قبل التأكيد">
          <FileUp aria-hidden="true" />
          <b>ارفع تقرير الطلب</b>
          <small>PDF من التسجيل · عام أو خريجون</small>
        </button>
      ) : null}

      {hasReport && reading ? (
        <>
          {reading.service ? (
            <div className={`ad-hero ${toneOf(reading.service.general ?? reading.service.graduates)}`}>
              <span className="ad-hero-icon" aria-hidden="true">{(reading.service.general ?? reading.service.graduates ?? 0) >= 100 ? <CircleCheck /> : <Gauge />}</span>
              <div className="ad-hero-stack">
                <b className="ad-hero-number"><Num value={percent(reading.service.general ?? reading.service.graduates)} /></b>
                <span className="ad-hero-label">نسبة خدمة الطلب</span>
              </div>
              <div className="ad-hero-side">
                {reading.service.general !== null && reading.service.graduates !== null ? (
                  <span className={`ad-grad ${toneOf(reading.service.graduates)}`} title="الهدف 100%">
                    <GraduationCap aria-hidden="true" /><Num value={percent(reading.service.graduates)} /><small>الخريجون</small>
                  </span>
                ) : null}
                {reading.service.byTrack.filter(row => row.track).map(row => (
                  <span key={row.track} className="ad-track"><small>{row.track === "boys" ? "بنين" : "بنات"}</small><Num value={percent(row.general ?? row.graduates)} /></span>
                ))}
              </div>
            </div>
          ) : null}
          {mode === "data" ? null : reading.supply.length ? <DemandSupplyList items={reading.supply} termId={termId} inPlace={inPlace} />
            : reading.service ? <p className="ad-all-good"><CircleCheck aria-hidden="true" /> كل مقرر مطلوب له مقاعده</p> : null}
          {reading.unmatched.length ? (
            <details className="ad-unmatched" open={mode === "data" || undefined}>
              <summary><Unlink aria-hidden="true" /> <b>{countOf(reading.unmatched.length, AR.course)}</b> بلا ربط</summary>
              <ul>
                {reading.unmatched.slice(0, 20).map(row => (
                  <li key={row.code}>
                    <span className="ad-item-main"><span className="ad-code" dir="ltr">{row.code}</span><span>{row.name}</span></span>
                    <SearchableSelect value="" ariaLabel={`اربط ${row.code} بمقرر`} placeholder="اربط بمقرر…" disabled={linking}
                      options={reading.catalogue.map(course => ({ value: course.courseId, label: `${course.code} · ${course.name}` }))}
                      onChange={value => void link(row.code, { courseId: Number(value) })} />
                    <button type="button" className="ad-ignore" disabled={linking} onClick={() => void link(row.code, { ignore: true })}
                      aria-label={`${row.code} لا يخص القسم`} title="لا يخص القسم"
                      data-guide-ignore="يحفظ أن هذا المقرر لا يخص القسم فلا يُسأل عنه ثانية">
                      <EyeOff aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="ad-note"><Link2 aria-hidden="true" /> الربط يُحفظ للقسم مرةً واحدة</p>
            </details>
          ) : null}
        </>
      ) : null}
      {status === "error" ? <p className="ad-error" role="alert"><TriangleAlert aria-hidden="true" /> تعذّرت القراءة الآن.</p> : null}
    </section>
  );
}

/** نوعُ البند بالأشد، لمن يعرض القائمة خارج اللوحة (تنبيه الجدول الدراسي). */
export const demandKindOf = kindOf;

/**
 * القائمة القصيرة بالأشد: أيقونة · رقم · «عالج». تُعرض في اللوحة وفي تنبيه الجدول الدراسي،
 * فلا تُكتب مرتين. «عالج» يفتح محرّر موعدٍ جديد في كلية المسار الأعجز؛ لا يكتب شيئاً قبل الحفظ هناك.
 */
export function DemandSupplyList({ items, termId, inPlace = false, limit = 8 }: { items: SupplyItemView[]; termId: number; inPlace?: boolean; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  /* العاجز أولاً: الفرعُ الأكبر عجزاً، وإلا مسارُ الأكثر طلبة. */
  const fixSupply = (item: SupplyItemView) => {
    const short = [...item.branches].sort((a, b) => b.gap - a.gap || (b.demand - b.seats) - (a.demand - a.seats))[0];
    const target = item.targets.find(entry => !short?.track || entry.track === short.track) || item.targets[0];
    if (!target) return;
    openActualDemandFix({ courseId: target.courseId, collegeId: target.collegeId, sectionId: target.sectionId, termId, students: item.unmetStudents || item.demand, graduates: item.unmetGraduates }, inPlace);
  };
  return (
    <>
      {items.length ? (
        <ol className="ad-list" aria-label="المقررات بالأشد أولاً">
          {items.slice(0, showAll ? items.length : limit).map(item => {
            const kind = kindOf(item);
            return (
              <li key={item.code} className={`is-${kind}`}>
                <span className="ad-item-icon" aria-hidden="true">{KIND_ICON[kind]}</span>
                <span className="ad-item-main">
                  <span className="ad-code" dir="ltr">{item.code}</span>
                  <span>{item.name}{item.targets.length ? <CourseTags courseIds={item.targets.map(target => target.courseId)} /> : null}</span>
                  <span className="ad-chips">
                    {item.branches.filter(branch => branch.gap !== 0).map(branch => (
                      <em key={branch.track || "all"} className={branch.gap > 0 ? "is-short" : "is-spare"}>
                        {branch.gap > 0 ? `ينقصه ${countOf(branch.gap, AR.section)}` : `فائض ${countOf(-branch.gap, oblique(AR.section))}`}{branch.track ? ` · ${branch.track === "boys" ? "بنين" : "بنات"}` : ""}
                      </em>
                    ))}
                    {item.move ? <em className="is-move"><ArrowLeftRight aria-hidden="true" />{countOf(item.move.sections, AR.section)} · {item.move.from === "girls" ? "بنات ← بنين" : "بنين ← بنات"}</em> : null}
                  </span>
                </span>
                <span className="ad-item-num" title={`${countOf(item.demand, AR.student)} · ${countOf(item.seats, AR.seat)}`}>
                  <Num value={(kind === "spare" ? item.seats - item.demand : item.unmetStudents || item.demand).toLocaleString("en-US")} />
                  {/* الوحدة تحت الرقم: «طالب» للمحتاجين، و«مقعد فائض» للفائض — فلا يُقرأ رقماً مجرّداً. */}
                  <span className="ad-item-unit">
                    <Users aria-hidden="true" />
                    {kind === "spare"
                      ? `${nounFor(item.seats - item.demand, AR.seat)} فائض`
                      : nounFor(item.unmetStudents || item.demand, AR.student)}
                  </span>
                  {item.unmetGraduates ? <small><GraduationCap aria-hidden="true" /><Num value={item.unmetGraduates} /></small> : null}
                </span>
                {kind === "spare" ? <span className="ad-fix-gap" aria-hidden="true" /> : (
                  <button type="button" className="btn btn-primary ad-fix" disabled={!item.targets.length} onClick={() => fixSupply(item)}
                    data-guide-ignore="يفتح محرّر موعدٍ جديد لهذا المقرر في الفرع العاجز؛ لا يكتب قبل الحفظ هناك">
                    <CalendarPlus aria-hidden="true" /> عالج
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}
      {items.length > limit && !showAll ? (
        <button type="button" className="ad-more" onClick={() => setShowAll(true)} data-guide-ignore="يعرض بقية المقررات في القائمة نفسها">+{countOf(items.length - limit, AR.course)}</button>
      ) : null}
    </>
  );
}
