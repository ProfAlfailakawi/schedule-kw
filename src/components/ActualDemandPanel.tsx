/**
 * ── الطلب الفعلي: تقرير التسجيل يقود الجدول ويحرسه ──
 *
 * قراءةٌ في مركز الذكاء: زرٌّ واحد «ارفع تقرير الطلب»، ثم رقمٌ واحد كبير، ثم قائمةٌ قصيرة
 * مرتبة بالأشد (أيقونة · رقم · «عالج»). لا جداول طويلة ولا فقرات شرح.
 * الحساب كلُّه على الخادم (src/server/actualDemand.ts)؛ هنا العرض والرفع والربط.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarPlus, CircleCheck, ClipboardList, EyeOff, FileUp, GraduationCap, Link2, OctagonAlert, TriangleAlert, Unlink, Users, X,
} from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import CourseTags from "./CourseTags";
import { Num } from "./ui";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { DEMAND_VARIANT_LABEL, guessDemandVariant, type DemandVariant } from "../utils/actualDemand";
import { putActualDemandHandoff } from "../utils/actualDemandHandoff";

interface Target { courseId: number; collegeId: number; sectionId: number; track: string }
interface Alert { code: string; name: string; students: number; boys: number; girls: number; graduates: number; targets: Target[] }
interface VariantInfo { uploadedAt: string; by: string; courses: number; students: number; termLabel: string; department: string }
export interface DemandReadingView {
  family: { key: string; name: string; members: Array<{ collegeId: number; sectionId: number; collegeName: string; track: string }> };
  variants: Record<DemandVariant, VariantInfo | null>;
  history: Array<{ variant: DemandVariant; at: string; by: string; hash: string; courses: number; students: number }>;
  matched: number;
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

/** الكلية التي تُفتح فيها الشعبة: الكلية المفتوحة إن كان لمسارها طلبة، وإلا مسارُ الأكثر طلبة. */
function pickTarget(alert: Alert, collegeId: number): Target | null {
  const own = alert.targets.find(target => target.collegeId === collegeId);
  const needs = (track: string) => (track === "boys" ? alert.boys : track === "girls" ? alert.girls : alert.students) > 0;
  if (own && needs(own.track)) return own;
  const wanted = alert.boys >= alert.girls ? "boys" : "girls";
  return alert.targets.find(target => target.track === wanted) || own || alert.targets[0] || null;
}

export default function ActualDemandPanel({ collegeId, sectionId, termId, initial = null, onReading }: {
  collegeId: number; sectionId: number; termId: number;
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
  const [showAll, setShowAll] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const query = `collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`;

  const show = useCallback((next: DemandReadingView | null) => { setReading(next); onReading?.(next); }, [onReading]);

  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    const controller = new AbortController();
    if (!initial) setStatus("loading");
    setPreview(null); setFile(null); setError("");
    fetch(`/api/actual-demand?${query}`, { credentials: "include", signal: controller.signal })
      .then(readJson)
      .then(body => { if (!controller.signal.aborted) { show(body); setStatus("ready"); } })
      .catch(failure => { if (!controller.signal.aborted) { show(null); setStatus(failure?.status === 403 ? "denied" : "error"); } });
    return () => controller.abort();
  }, [query]);

  const send = async (picked: File, kind: DemandVariant, commit: boolean, confirm = false) => {
    setBusy(true); setError("");
    try {
      const url = `/api/actual-demand/upload?${query}&variant=${kind}${commit ? "&commit=1" : ""}${confirm ? "&confirm=1" : ""}`;
      const body = await readJson(await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/octet-stream" }, body: picked }));
      if (commit) { show(body.reading); setPreview(null); setFile(null); }
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
    } catch (failure: any) { setError(failure?.message || "تعذّر الحفظ."); }
    finally { setLinking(false); }
  };

  const fix = (alert: Alert) => {
    const target = pickTarget(alert, collegeId);
    if (!target) return;
    putActualDemandHandoff({ courseId: target.courseId, collegeId: target.collegeId, sectionId: target.sectionId, termId, students: alert.students, graduates: alert.graduates });
    window.location.assign("/FSchedule/Index");
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
          <div className={`ad-hero${reading.alerts.length ? " is-bad" : " is-good"}`}>
            <span className="ad-hero-icon" aria-hidden="true">{reading.alerts.length ? <OctagonAlert /> : <CircleCheck />}</span>
            <b className="ad-hero-number"><Num value={reading.alerts.length} /></b>
            <span className="ad-hero-label">{reading.alerts.length ? `${nounFor(reading.alerts.length, AR.course)} بلا شعبة` : "كل مقرر مطلوب له شعبة"}</span>
          </div>
          {reading.alerts.length ? (
            <ol className="ad-list" aria-label="مقررات بلا شعبة، الأشد أولاً">
              {reading.alerts.slice(0, showAll ? reading.alerts.length : 8).map(alert => (
                <li key={alert.code} className={alert.graduates ? "is-grad" : ""}>
                  <span className="ad-item-icon" aria-hidden="true">{alert.graduates ? <GraduationCap /> : <OctagonAlert />}</span>
                  <span className="ad-item-main"><span className="ad-code" dir="ltr">{alert.code}</span><span>{alert.name}{alert.targets.length ? <CourseTags courseIds={alert.targets.map(target => target.courseId)} /> : null}</span></span>
                  <span className="ad-item-num" title={countOf(alert.students, AR.student)}>
                    <Num value={alert.students.toLocaleString("en-US")} />
                    {alert.graduates ? <small><GraduationCap aria-hidden="true" /><Num value={alert.graduates} /></small> : null}
                  </span>
                  <button type="button" className="btn btn-primary ad-fix" disabled={!alert.targets.length} onClick={() => fix(alert)}
                    data-guide-ignore="يفتح محرّر موعدٍ جديد لهذا المقرر في الورشة؛ لا يكتب قبل الحفظ هناك">
                    <CalendarPlus aria-hidden="true" /> عالج
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          {reading.alerts.length > 8 && !showAll ? (
            <button type="button" className="ad-more" onClick={() => setShowAll(true)} data-guide-ignore="يعرض بقية المقررات في القائمة نفسها">+{countOf(reading.alerts.length - 8, AR.course)}</button>
          ) : null}
          {reading.unmatched.length ? (
            <details className="ad-unmatched">
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
