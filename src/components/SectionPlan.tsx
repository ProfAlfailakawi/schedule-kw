/**
 * ── تخطيط الشعب: تقرير التسجيل (SWRDASH) وحده ──────────────────────────────────────────
 *
 * شاشةٌ واحدة في كل مكانٍ للتخطيط (أدوات البيانات، مركز التحليلات، شريط الاعتماد، لوحة القرار):
 *   رفعُ «الكل» (يكفي) و«الخريجون» (يقدّم أهلَه) ← ثلاثة أرقام ← درجتان:
 *   ① الخريجون  ② بقية الطلبة — سطرٌ لكل مقرر وحرم، مرتبٌ برقم المقرر، مطويٌّ:
 *   شريطٌ و«المطروح من المطلوب» ورقمٌ كبير وزرٌّ واحد. والضغط يفتح الحساب بطاقاتٍ وأيقونات.
 *   ثم المنتدبون: ساعاتٌ بلا أستاذ − المتاح ÷ ٦.
 * كل شيءٍ اقتراح: «افتح شعبة» يفتح المحرّر، و«اختر ما يُغلق» يُظهر شعب المقرر في الجدول.
 * الحساب كلُّه على الخادم (src/utils/sectionPlan.ts)؛ هنا العرض والرفع والربط.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair, CalendarCheck2, CalendarPlus, Check, ChevronDown, CircleCheck, ClipboardList, Divide, Equal, EyeOff, FileUp, GraduationCap,
  Layers, Link2, ListChecks, Minus, PencilRuler, TrendingDown, TriangleAlert, Unlink, UserPlus, UserRoundX, Users, X,
} from "lucide-react";
import SearchableSelect from "./SearchableSelect";
import CourseTags from "./CourseTags";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { guessDemandVariant, type DemandVariant } from "../utils/actualDemand";
import { ACTUAL_DEMAND_CHANGED_EVENT, announceActualDemandChange, openActualDemandFix, openCourseSections } from "../utils/actualDemandHandoff";
import type { PlanCourseFact, PlanRow, PlanVisitors, SectionPlanReading } from "../utils/sectionPlan";

export interface PlanRowView extends PlanRow { courseCode: string; report: string }
export interface SectionPlanView extends Omit<SectionPlanReading, "rows"> { rows: PlanRowView[] }
interface VariantInfo { uploadedAt: string; by: string; courses: number; students: number; termLabel: string; department: string }
export interface PlanReadingView {
  family: { key: string; name: string; members: Array<{ collegeId: number; sectionId: number; collegeName: string; track: string }> };
  variants: Record<DemandVariant, VariantInfo | null>;
  plan: SectionPlanView | null;
  facts: Record<string, PlanCourseFact>;
  unmatched: Array<{ code: string; name: string; students: number }>;
  catalogue: Array<{ courseId: number; code: string; name: string }>;
}
interface Preview {
  variant: DemandVariant; termLabel: string; department: string; courses: number; students: number; matched: number; unmatched: number;
  termMatches: boolean | null; departmentMatches: boolean; duplicate: boolean;
}

const num = (value: number) => Math.round(value).toLocaleString("ar-KW-u-nu-latn");
const TRACK: Record<string, string> = { boys: "بنين", girls: "بنات" };
const dateLabel = (iso: string) => { try { return new Date(iso).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "short" }); } catch { return ""; } };

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body?.error || "تعذّر الاتصال."), { status: response.status, body });
  return body;
}

/** يقرأ التخطيط للقسم والفصل، ويعيد القراءة بعد كل رفعٍ أو ربط أو تغيّرٍ في الجدول (refresh). */
export function useSectionPlan(collegeId: number, sectionId: number, termId: number, refresh = 0) {
  const scope = `${collegeId}|${sectionId}|${termId}`;
  const [state, setState] = useState<{ scope: string; reading: PlanReadingView | null; status: "loading" | "ready" | "denied" | "error" }>({ scope, reading: null, status: "loading" });
  const [changed, setChanged] = useState(0);
  useEffect(() => {
    const bump = () => setChanged(value => value + 1);
    window.addEventListener(ACTUAL_DEMAND_CHANGED_EVENT, bump);
    return () => window.removeEventListener(ACTUAL_DEMAND_CHANGED_EVENT, bump);
  }, []);
  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    const controller = new AbortController();
    fetch(`/api/actual-demand?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include", signal: controller.signal })
      .then(readJson)
      .then(body => { if (!controller.signal.aborted) setState({ scope, reading: body, status: "ready" }); })
      .catch(failure => { if (!controller.signal.aborted) setState(current => ({ scope, reading: current.scope === scope ? current.reading : null, status: failure?.status === 403 ? "denied" : "error" })); });
    return () => controller.abort();
  }, [scope, refresh, changed]);
  const current = state.scope === scope ? state : { scope, reading: null, status: "loading" as const };
  const set = useCallback((reading: PlanReadingView | null) => setState({ scope, reading, status: "ready" }), [scope]);
  return { reading: current.reading, status: current.status, set };
}

/** شارةُ شريط الاعتماد: رقمٌ واحد — شعبُ الخريجين الناقصة إن وُجدت، وإلا كل ما يُفتح أو يُغلق. */
export function SectionPlanningBadge({ reading, open, onToggle }: { reading: PlanReadingView | null; open: boolean; onToggle: () => void }) {
  const plan = reading?.plan;
  const has = Boolean(reading?.variants.general || reading?.variants.graduates);
  const label = !has ? "ارفع تقرير التسجيل لتخطيط الشعب"
    : plan ? `تخطيط الشعب: ${plan.totals.gradOpen ? `ينقص الخريجين ${countOf(plan.totals.gradOpen, AR.section)} · ` : ""}افتح ${num(plan.totals.open)} · أغلق ${num(plan.totals.close)}` : "تخطيط الشعب";
  if (has && plan && !plan.totals.open && !plan.totals.close && !plan.totals.nocap) return null;
  return (
    <button type="button" className="apb-badge apb-data-btn spl-badge" data-tone={plan?.totals.gradOpen ? "warning" : "info"} aria-expanded={open} onClick={onToggle}
      title={label} aria-label={label} data-guide-ignore="تخطيط الشعب من تقرير التسجيل — يفتح الدرجتين: الخريجون ثم بقية الطلبة">
      <ClipboardList aria-hidden="true" /><span>التخطيط</span>
      {!has ? <FileUp aria-hidden="true" className="spl-badge-up" /> : null}
      {plan?.totals.gradOpen ? <span className="spl-badge-grad"><GraduationCap aria-hidden="true" /><b>{num(plan.totals.gradOpen)}</b></span> : null}
      {plan && plan.totals.open ? <span className="spl-badge-n"><CalendarPlus aria-hidden="true" /><b>{num(plan.totals.open)}</b></span> : null}
      {plan && plan.totals.close ? <span className="spl-badge-n"><TrendingDown aria-hidden="true" /><b>{num(plan.totals.close)}</b></span> : null}
      <ChevronDown aria-hidden="true" className="apb-data-chev" />
    </button>
  );
}

export default function SectionPlan({ collegeId, sectionId, termId, mode = "full", inPlace = false, reading: given, onReading, onClose, onOpenCourses }: {
  collegeId: number; sectionId: number; termId: number;
  /** «full» الشاشة كاملة؛ «bar» داخل شريط الاعتماد (بإغلاق)؛ «read» لوحة القرار: قراءةٌ بلا رفعٍ ولا أفعال. */
  mode?: "full" | "bar" | "read";
  /** داخل الجدول الدراسي: «افتح شعبة» و«اختر ما يُغلق» في مكانهما بلا انتقال. */
  inPlace?: boolean;
  /** قراءةٌ جاهزة (من useSectionPlan عند الأم): تُعرض ولا تُجلب ثانية. */
  reading?: PlanReadingView | null;
  onReading?: (reading: PlanReadingView | null) => void;
  onClose?: () => void;
  onOpenCourses?: () => void;
}) {
  const own = useSectionPlan(given === undefined ? collegeId : 0, sectionId, termId);
  const reading = given === undefined ? own.reading : given;
  const status = given === undefined ? own.status : "ready";
  const show = (next: PlanReadingView | null) => { if (given === undefined) own.set(next); onReading?.(next); };
  useEffect(() => { if (given === undefined) onReading?.(own.reading); }, [own.reading]); // eslint-disable-line react-hooks/exhaustive-deps
  const read = mode === "read";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [variant, setVariant] = useState<DemandVariant>("general");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [linking, setLinking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const query = `collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`;
  const pickVariant = useRef<DemandVariant | null>(null);

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
  const choose = (kind?: DemandVariant) => { pickVariant.current = kind || null; input.current?.click(); };
  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    const kind = pickVariant.current || guessDemandVariant(picked.name);
    setFile(picked); setVariant(kind);
    void send(picked, kind, false);
  };
  const link = async (code: string, payload: { courseId?: number; ignore?: boolean }) => {
    setLinking(true); setError("");
    try {
      const body = await readJson(await fetch("/api/actual-demand/link", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, code, ...payload }),
      }));
      show(body); announceActualDemandChange();
    } catch (failure: any) { setError(failure?.message || "تعذّر الحفظ."); }
    finally { setLinking(false); }
  };

  if (status === "denied") return null;
  const plan = reading?.plan || null;
  const has = Boolean(reading?.variants.general || reading?.variants.graduates);
  const mismatch = preview && (preview.termMatches === false || !preview.departmentMatches);
  const gradRows = plan ? plan.rows.filter(row => row.tier === "grad") : [];
  const restRows = plan ? plan.rows.filter(row => row.tier === "short" || row.tier === "surplus" || row.tier === "nocap") : [];

  return (
    <section className={`spl spl-mode-${mode}`} aria-label="تخطيط الشعب" aria-busy={status === "loading" || busy}>
      <header className="spl-head">
        <span className="spl-mark" aria-hidden="true"><ClipboardList /></span>
        <div className="spl-title">
          <strong>تخطيط الشعب</strong>
          <small>{reading?.family.name || "عائلة القسم"} · بنين وبنات</small>
        </div>
        {has ? (
          <div className="spl-reports" role="list" aria-label="تقارير التسجيل">
            {(["general", "graduates"] as const).map(kind => {
              const info = reading?.variants[kind];
              const Icon = kind === "general" ? Users : GraduationCap;
              const body = <><Icon aria-hidden="true" /><b>{kind === "general" ? "الكل" : "الخريجون"}</b>{info ? <><Check aria-hidden="true" className="spl-ok" /><small>{dateLabel(info.uploadedAt)}</small></> : <FileUp aria-hidden="true" className="spl-up" />}</>;
              return read || info
                ? <span key={kind} role="listitem" className={`spl-report${info ? " is-on" : ""}${kind === "graduates" ? " is-grad" : ""}`} title={info ? `${info.termLabel} · ${info.by}` : "لم يُرفع"}>{body}</span>
                : <button key={kind} type="button" role="listitem" className={`spl-report is-grad is-missing`} onClick={() => choose(kind)} disabled={busy}
                    data-guide-ignore="يرفع تقرير الخريجين؛ يُقرأ أولاً ولا يُحفظ قبل «احفظ»">{body}</button>;
            })}
          </div>
        ) : null}
        {!read && has ? (
          <button type="button" className="spl-icon-btn" disabled={busy} onClick={() => choose()} aria-label="ارفع تقريراً أحدث" title="ارفع تقريراً أحدث"
            data-guide-ignore="يختار ملف PDF من التسجيل ويقرؤه أولاً؛ لا يُحفظ قبل «احفظ»"><FileUp aria-hidden="true" /></button>
        ) : null}
        {onClose ? <button type="button" className="spl-icon-btn" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاق تخطيط الشعب"><X aria-hidden="true" /></button> : null}
        {!read ? <input ref={input} type="file" accept="application/pdf,.pdf" hidden onChange={pick} /> : null}
      </header>

      {error ? <p className="spl-error" role="alert"><TriangleAlert aria-hidden="true" /> {error}</p> : null}

      {preview && file ? (
        <article className={`spl-preview${mismatch ? " is-warn" : ""}`} aria-live="polite">
          <header>
            <span className="spl-preview-kind">{variant === "graduates" ? <GraduationCap aria-hidden="true" /> : <Users aria-hidden="true" />}</span>
            <b>{preview.department || "قسم غير مقروء"}</b>
            <small>{preview.termLabel}</small>
            <button type="button" className="spl-icon-btn" aria-label="إلغاء" onClick={() => { setPreview(null); setFile(null); }} data-guide-ignore="يلغي الملف المقروء قبل حفظه"><X aria-hidden="true" /></button>
          </header>
          <ul className="spl-facts">
            <li><b>{num(preview.courses)}</b><small>{nounFor(preview.courses, AR.course)}</small></li>
            <li><b>{num(preview.students)}</b><small>{nounFor(preview.students, AR.student)}</small></li>
            <li className={preview.unmatched ? "is-warn" : ""}><b dir="ltr">{preview.matched}/{preview.courses}</b><small>مطابق</small></li>
          </ul>
          <div className="spl-seg" role="group" aria-label="نوع التقرير">
            {(["general", "graduates"] as const).map(kind => (
              <button key={kind} type="button" aria-pressed={variant === kind} className={variant === kind ? "on" : ""} disabled={busy}
                onClick={() => { setVariant(kind); void send(file, kind, false); }} data-guide-ignore="يختار نوع التقرير قبل حفظه">
                {kind === "general" ? <Users aria-hidden="true" /> : <GraduationCap aria-hidden="true" />}{kind === "general" ? "الكل" : "الخريجون"}
              </button>
            ))}
          </div>
          {preview.termMatches === false ? <p className="spl-flag"><TriangleAlert aria-hidden="true" /> فصلٌ غير الفصل المفتوح</p> : null}
          {!preview.departmentMatches ? <p className="spl-flag"><TriangleAlert aria-hidden="true" /> قسمٌ غير القسم المفتوح</p> : null}
          {preview.duplicate ? <p className="spl-flag is-soft"><CircleCheck aria-hidden="true" /> الملف نفسه محفوظ</p> : null}
          <footer>
            <button type="button" className={`btn ${mismatch ? "btn-secondary" : "btn-primary"}`} disabled={busy}
              onClick={() => void send(file, variant, true, Boolean(mismatch))} data-guide-ignore="يحفظ التقرير لعائلة القسم في هذا الفصل؛ لا يغيّر الجدول">
              {mismatch ? "احفظ رغم ذلك" : "احفظ"}
            </button>
          </footer>
        </article>
      ) : null}

      {status === "loading" && !reading ? <div className="spl-skeleton" aria-hidden="true"><i /><i /><i /></div> : null}
      {busy && !preview ? <div className="spl-reading" role="status"><span className="spl-spin" aria-hidden="true" /> أقرأ الملف…</div> : null}
      {status === "error" && !reading ? <p className="spl-error" role="alert"><TriangleAlert aria-hidden="true" /> تعذّرت القراءة الآن.</p> : null}

      {status === "ready" && !has && !preview && !busy ? (
        read ? <p className="spl-quiet"><FileUp aria-hidden="true" /> لم يُرفع تقرير التسجيل لهذا الفصل.</p> : (
          <button type="button" className="spl-empty" onClick={() => choose()} data-guide-ignore="يختار ملف PDF من التسجيل؛ لا يُحفظ قبل التأكيد">
            <span className="spl-empty-icons" aria-hidden="true"><Users /><GraduationCap /></span>
            <b>ارفع تقرير التسجيل</b>
            <small>«الكل» يكفي · «الخريجون» يقدّم أهله</small>
          </button>
        )
      ) : null}

      {plan ? (
        <>
          <div className="spl-stats" role="list">
            {plan.hasGraduates ? (
              <span role="listitem" className={`spl-stat is-grad${plan.graduatesServed === 100 ? " is-done" : ""}`}>
                <GraduationCap aria-hidden="true" /><b>{plan.graduatesServed === null ? "—" : `${num(plan.graduatesServed)}%`}</b><small>الخريجون لهم مقعد</small>
              </span>
            ) : null}
            <span role="listitem" className={`spl-stat is-open${plan.totals.open ? "" : " is-zero"}`}>
              <CalendarPlus aria-hidden="true" /><b>{num(plan.totals.open)}</b><small>{nounFor(plan.totals.open, AR.section)} ناقصة</small>
              {plan.totals.gradOpen ? <em><GraduationCap aria-hidden="true" />{num(plan.totals.gradOpen)} للخريجين</em> : null}
            </span>
            <span role="listitem" className={`spl-stat is-close${plan.totals.close ? "" : " is-zero"}`}>
              <TrendingDown aria-hidden="true" /><b>{num(plan.totals.close)}</b><small>{nounFor(plan.totals.close, AR.section)} فائضة</small>
            </span>
          </div>

          <section className="spl-stage is-grad" aria-label="الدرجة الأولى: الخريجون">
            <h4><span className="spl-step" aria-hidden="true">1</span><GraduationCap aria-hidden="true" /> الخريجون</h4>
            {!plan.hasGraduates ? (
              read ? <p className="spl-quiet"><GraduationCap aria-hidden="true" /> لم يُرفع تقرير الخريجين.</p> : (
                <button type="button" className="spl-grad-missing" onClick={() => choose("graduates")} disabled={busy} data-guide-ignore="يرفع تقرير الخريجين لتُقدَّم شعبهم">
                  <GraduationCap aria-hidden="true" /><span>ارفع تقرير الخريجين لتُفتح شعبهم أولاً</span><FileUp aria-hidden="true" />
                </button>
              )
            ) : gradRows.length ? (
              <ol className="spl-rows">{gradRows.map(row => <PlanLine key={`${row.code}:${row.track}`} row={row} termId={termId} read={read} inPlace={inPlace} onOpenCourses={onOpenCourses} />)}</ol>
            ) : <p className="spl-done"><CircleCheck aria-hidden="true" /> كل الخريجين لهم مقعد</p>}
          </section>

          <section className="spl-stage" aria-label="الدرجة الثانية: بقية الطلبة">
            <h4><span className="spl-step" aria-hidden="true">2</span><Users aria-hidden="true" /> بقية الطلبة</h4>
            {plan.totals.gradOpen > 0 && restRows.length ? <p className="spl-first"><GraduationCap aria-hidden="true" /> أكمل الخريجين أولاً</p> : null}
            {restRows.length ? <Rows rows={restRows} termId={termId} read={read} inPlace={inPlace} onOpenCourses={onOpenCourses} limit={mode === "bar" ? 8 : 14} />
              : <p className="spl-done"><CircleCheck aria-hidden="true" /> كل مقررٍ مطلوب شعبُه كافية</p>}
          </section>

          <Visitors graduates={plan.hasGraduates ? plan.visitors.graduates : null} all={plan.visitors.all} perVisitor={plan.visitors.perVisitor} />
        </>
      ) : null}

      {!read && reading?.unmatched.length ? (
        <details className="spl-unmatched">
          <summary><Unlink aria-hidden="true" /> <b>{countOf(reading.unmatched.length, AR.course)}</b> في التقرير بلا ربط</summary>
          <ul>
            {reading.unmatched.slice(0, 20).map(row => (
              <li key={row.code}>
                <span className="spl-unmatched-main"><span className="spl-code" dir="ltr">{row.code}</span><span>{row.name}</span></span>
                <SearchableSelect value="" ariaLabel={`اربط ${row.code} بمقرر`} placeholder="اربط بمقرر…" disabled={linking}
                  options={reading.catalogue.map(course => ({ value: course.courseId, label: `${course.code} · ${course.name}` }))}
                  onChange={value => void link(row.code, { courseId: Number(value) })} />
                <button type="button" className="spl-icon-btn" disabled={linking} onClick={() => void link(row.code, { ignore: true })}
                  aria-label={`${row.code} لا يخص القسم`} title="لا يخص القسم" data-guide-ignore="يحفظ أن هذا المقرر لا يخص القسم فلا يُسأل عنه ثانية">
                  <EyeOff aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <p className="spl-note"><Link2 aria-hidden="true" /> الربط يُحفظ للقسم مرةً واحدة</p>
        </details>
      ) : null}
    </section>
  );
}

function Rows({ rows, limit, ...rest }: { rows: PlanRowView[]; termId: number; read: boolean; inPlace: boolean; onOpenCourses?: () => void; limit: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, limit);
  return (
    <>
      <ol className="spl-rows">{shown.map(row => <PlanLine key={`${row.code}:${row.track}`} row={row} {...rest} />)}</ol>
      {rows.length > limit && !all ? (
        <button type="button" className="spl-more" onClick={() => setAll(true)} data-guide-ignore="يعرض بقية المقررات في القائمة نفسها">+{countOf(rows.length - limit, AR.course)}</button>
      ) : null}
    </>
  );
}

/** سطرٌ مطويّ: الهوية، والشريط، والرقم الكبير، وزرٌّ واحد. والضغط يفتح الحساب. */
function PlanLine({ row, termId, read, inPlace, onOpenCourses }: { row: PlanRowView; termId: number; read: boolean; inPlace: boolean; onOpenCourses?: () => void; key?: React.Key }) {
  const [open, setOpen] = useState(false);
  const scale = Math.max(row.required, row.offered, 1);
  const pct = (value: number) => `${Math.min(100, (Math.max(0, value) / scale) * 100)}%`;
  const big = row.tier === "grad" ? row.gradShort : row.tier === "short" ? row.gap : row.tier === "surplus" ? -row.gap : 0;
  const word = row.tier === "grad" ? "ينقص الخريجين" : row.tier === "short" ? "ينقصه" : row.tier === "surplus" ? "فائض" : "";
  const open1 = () => row.target && openActualDemandFix({ courseId: row.target.courseId, collegeId: row.target.collegeId, sectionId: row.target.sectionId, termId, students: row.unseated, graduates: row.graduates }, inPlace);
  const action = read ? null
    : row.tier === "nocap" ? (onOpenCourses
        ? <button type="button" className="spl-act is-soft" onClick={onOpenCourses} data-guide-ignore="يفتح شاشة المقررات لإدخال سعة الشعبة"><PencilRuler aria-hidden="true" /> أدخل السعة</button>
        : <span className="spl-act-note"><PencilRuler aria-hidden="true" /> أدخل السعة في المقررات</span>)
    : row.tier === "surplus" ? <button type="button" className="spl-act is-soft" disabled={!row.courseCode} onClick={() => openCourseSections(row.courseCode, inPlace)}
        data-guide-ignore="يُظهر شعب المقرر في الجدول لتختار ما يُغلق؛ لا يحذف شيئاً"><ListChecks aria-hidden="true" /> اختر ما يُغلق</button>
    : <button type="button" className="spl-act" disabled={!row.target} onClick={open1}
        data-guide-ignore="يفتح محرّر شعبةٍ جديدة لهذا المقرر في حرمه؛ لا يُكتب شيء قبل الحفظ هناك"><CalendarPlus aria-hidden="true" /> افتح شعبة</button>;
  return (
    <li className={`spl-row is-${row.tier}`} data-open={open || undefined}>
      <div className="spl-line">
        <button type="button" className="spl-line-main" aria-expanded={open} onClick={() => setOpen(value => !value)} data-guide-ignore="يفتح حساب هذا المقرر بطاقاتٍ">
          <span className="spl-id">
            <span className="spl-id-top">
              <span className="spl-code" dir="ltr">{row.code}</span>
              {row.track ? <span className={`spl-track is-${row.track}`}>{TRACK[row.track]}</span> : null}
              {row.capSource === "report" ? <span className="spl-captag" title="سعة الشعبة من متوسط التقرير حتى تُدخل سعة المقرر">السعة من التقرير</span> : null}
            </span>
            <span className="spl-name">{row.name}{row.target ? <CourseTags courseId={row.target.courseId} /> : null}</span>
          </span>
          {row.tier === "nocap" ? (
            <span className="spl-meter is-nocap"><Users aria-hidden="true" /> {countOf(row.students, AR.student)} · لا سعة للحساب</span>
          ) : (
            <span className="spl-meter">
              <span className="spl-meter-bar" aria-hidden="true">
                {row.gradRequired ? <i className="spl-meter-bar-grad" style={{ width: pct(row.gradRequired) }} /> : null}
                <i className="spl-meter-bar-fill" style={{ width: pct(Math.min(row.offered, row.required)) }} />
                {row.gradRequired ? <i className="spl-meter-bar-gradfill" style={{ width: pct(Math.min(row.offered, row.gradRequired)) }} /> : null}
                {row.offered > row.required ? <i className="spl-meter-bar-over" style={{ insetInlineStart: pct(row.required), width: pct(row.offered - row.required) }} /> : null}
              </span>
              <span className="spl-meter-cap">
                <span><b>{num(row.offered)}</b> من <b>{num(row.required)}</b></span>
                {row.graduates ? <span className={`spl-gradchip${row.gradShort ? "" : " is-ok"}`}><GraduationCap aria-hidden="true" />{num(row.graduates)}{row.gradShort ? null : <Check aria-hidden="true" />}</span> : null}
              </span>
            </span>
          )}
          {big ? <span className="spl-big"><b>{num(big)}</b><small>{word}</small></span> : <span className="spl-big" />}
          <ChevronDown aria-hidden="true" className="spl-chev" />
        </button>
        {action ? <span className="spl-line-act">{action}</span> : null}
      </div>
      {open ? <PlanMath row={row} /> : null}
    </li>
  );
}

/** الحساب بطاقاتٍ: الطلبة ÷ السعة = المطلوب، ثم الخريجون والمطروح والفرق ومن بلا مقعد. */
function PlanMath({ row }: { row: PlanRowView }) {
  if (row.tier === "nocap") {
    return <div className="spl-math"><div className="spl-eq"><Tile icon={<Users />} n={row.students} label={nounFor(row.students, AR.student)} /><span className="spl-op"><Divide aria-hidden="true" /></span><Tile icon={<Armchair />} n={null} label="بلا سعة" tone="warn" /></div></div>;
  }
  return (
    <div className="spl-math" role="group" aria-label={`${row.students} ÷ ${row.cap} = ${countOf(row.required, AR.section)}`}>
      <div className="spl-eq">
        <Tile icon={<Users />} n={row.students} label={nounFor(row.students, AR.student)} />
        <span className="spl-op"><Divide aria-hidden="true" /></span>
        <Tile icon={<Armchair />} n={row.cap} label={row.capSource === "report" ? "سعة من التقرير" : "سعة الشعبة"} tone={row.capSource === "report" ? "info" : undefined} />
        <span className="spl-op"><Equal aria-hidden="true" /></span>
        <Tile icon={<Layers />} n={row.required} label="مطلوبة" tone="strong" />
      </div>
      <div className="spl-eq is-facts">
        {row.graduates ? <Tile icon={<GraduationCap />} n={row.gradRequired} label={`للخريجين (${num(row.graduates)})`} tone="grad" /> : null}
        <Tile icon={<CalendarCheck2 />} n={row.offered} label="مطروحة" />
        {row.gap > 0 ? <Tile icon={<CalendarPlus />} n={row.gap} label="ناقصة" tone="bad" /> : row.gap < 0 ? <Tile icon={<TrendingDown />} n={-row.gap} label="فائضة" tone="spare" /> : <Tile icon={<CircleCheck />} n={0} label="متوازن" tone="ok" />}
        {row.unseated ? <Tile icon={<UserRoundX />} n={row.unseated} label="بلا مقعد" /> : null}
      </div>
      {row.registrar ? <p className="spl-registrar">التسجيل اقترح {num(row.registrar)}</p> : null}
    </div>
  );
}

function Tile({ icon, n, label, tone }: { icon: React.ReactElement; n: number | null; label: string; tone?: string }) {
  return (
    <span className="spl-tile" data-tone={tone}>
      <span className="spl-tile-ic" aria-hidden="true">{icon}</span>
      <b>{n === null ? "—" : num(n)}</b>
      <small>{label}</small>
    </span>
  );
}

/** المنتدبون: سطرٌ واحد مطويّ، ويُفتح على المعادلة للخريجين وللجميع. */
function Visitors({ graduates, all, perVisitor }: { graduates: PlanVisitors | null; all: PlanVisitors; perVisitor: number }) {
  const [open, setOpen] = useState(false);
  const scopes = useMemo(() => [
    ...(graduates ? [{ key: "grad", label: "للخريجين", icon: <GraduationCap />, value: graduates }] : []),
    { key: "all", label: "للجميع", icon: <Users />, value: all },
  ], [graduates, all]);
  return (
    <footer className="spl-visitors" data-open={open || undefined}>
      <button type="button" className="spl-visitors-btn" aria-expanded={open} onClick={() => setOpen(value => !value)} data-guide-ignore="عدد المنتدبين: الضغط يبيّن الحساب">
        <UserPlus aria-hidden="true" />
        {scopes.map(scope => (
          <span key={scope.key} className={`spl-visitors-n is-${scope.key}`}><b>{num(scope.value.visitors)}</b><small>{nounFor(scope.value.visitors, AR.visitor)} {scope.label}</small></span>
        ))}
        <ChevronDown aria-hidden="true" className="spl-chev" />
      </button>
      {open ? (
        <div className="spl-visitors-math">
          {scopes.map(scope => (
            <div key={scope.key} className="spl-eq" role="group" aria-label={`${scope.label}: ${countOf(scope.value.hours, AR.hour)} بلا أستاذ − ${Math.min(scope.value.free, scope.value.hours)} متاحة ÷ ${perVisitor} = ${countOf(scope.value.visitors, AR.visitor)}`}>
              <span className="spl-eq-label">{scope.icon}{scope.label}</span>
              <Tile icon={<Layers />} n={scope.value.hours} label="ساعة بلا أستاذ" />
              <span className="spl-op"><Minus aria-hidden="true" /></span>
              <Tile icon={<Armchair />} n={Math.min(scope.value.free, scope.value.hours)} label="متاحة في الأنصبة" />
              <span className="spl-op"><Divide aria-hidden="true" /></span>
              <Tile icon={<Users />} n={perVisitor} label="لكل منتدب" />
              <span className="spl-op"><Equal aria-hidden="true" /></span>
              <Tile icon={<UserPlus />} n={scope.value.visitors} label={nounFor(scope.value.visitors, AR.visitor)} tone="strong" />
            </div>
          ))}
        </div>
      ) : null}
      <p className="spl-assume">نفترض {countOf(perVisitor, AR.hour)} لكل منتدب</p>
    </footer>
  );
}
