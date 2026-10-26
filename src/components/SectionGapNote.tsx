/**
 * ── شعبٌ يُفضَّل زيادتها ─────────────────────────────────────────────────────────────
 *
 * شارةٌ هادئة في شريط الاعتماد، اختيارية: تظهر فقط إن كان لمقررٍ شعبٌ أقل مما يطلبه الطلبة أو يقرّره تخطيط القسم.
 * تفتح قائمةً قصيرة («٥ ← ٧») وفي ذيلها دعوةٌ لرفع كشف المتبقي لمقارنةٍ أدق. لا تمنع توقيعاً ولا تكتب شيئاً.
 * الحساب في utils/sectionGap.ts؛ المصدران: /api/schedules/section-gap و/api/registration-stats.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_SEEDED_EVENT } from "../utils/demoSeedEvent";
import { AlertTriangle, Armchair, ArrowLeft, ChevronDown, ClipboardList, History, Layers, Minus, UserCheck, UserMinus, UserPlus, Users, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { planGaps, planSurpluses, studentGaps, type GapCourse, type GapItem, type GapPlan } from "../utils/sectionGap";
import { sortByName } from "../utils/sorting";
import { VISITOR_MAX_SECTIONS, visitingNeed, type CourseStaffing } from "../utils/visitingNeed";

interface GapPayload {
  respondents: number; planImported: boolean; planSource: { fileName: string; importedAt: string } | null;
  accepted: Record<string, number>; remaining: Record<string, number>; courses: GapCourse[];
}
interface StaffingPayload { staffing: Record<string, CourseStaffing>; visitorFreeSlots: number }
const SHOWN = 5;
const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * القراءتان تُوسمان بنطاقهما: تبدّل القسم أو الفصل لا يُبقي أسماء القسم السابق ولا أرقامه لحظةً (الشريط نفسه يبقى مركّباً).
 * «المختار» يأتي مع القراءة الخفيفة (يتجدد مع كل تعديلٍ في الجدول)، أما التاريخ — وهو الثقيل — فيُجلب مرةً لكل كشفٍ مرفوع.
 */
export const PLAN_SAVED_EVENT = "schedule:plan-saved";

export function useSectionGap(collegeId: number, sectionId: number, termId: number, refreshSignal = 0, wantStaffing = false) {
  const scope = `${collegeId}:${sectionId}:${termId}`;
  const [loaded, setLoaded] = useState<{ scope: string; payload: GapPayload } | null>(null);
  const [past, setPast] = useState<{ scope: string; stamp: string; history: GapPlan["history"] } | null>(null);
  const [bump, setBump] = useState(0);
  /* من يدرّس كل مقرر: ثقيلٌ، فيُجلب حين تُفتح اللوحة فقط، ويُجدَّد مع كل تغيّرٍ في الجدول. */
  const [staffed, setStaffed] = useState<{ scope: string; payload: StaffingPayload } | null>(null);
  useEffect(() => {
    if (!wantStaffing || !collegeId || !sectionId || !termId) return;
    let cancelled = false;
    fetch(`/api/schedules/section-gap/staffing?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then((body: StaffingPayload | null) => { if (!cancelled) setStaffed(body ? { scope, payload: body } : null); })
      .catch(() => { if (!cancelled) setStaffed(null); });
    return () => { cancelled = true; };
  }, [wantStaffing, collegeId, sectionId, termId, refreshSignal, scope, bump]);
  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let cancelled = false;
    fetch(`/api/schedules/section-gap?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then((body: GapPayload | null) => { if (!cancelled) setLoaded(body ? { scope, payload: body } : null); })
      .catch(() => { if (!cancelled) setLoaded(null); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, refreshSignal, scope, bump]);
  /* تخطيط الشعب يحفظ في السجلّ نفسه: مسحُ الكشف هناك (أو رفعُه) يُحدِّث الشارات والأيقونة هنا دون إعادة فتح الشاشة. */
  useEffect(() => {
    const onSaved = (event: Event) => {
      const at = (event as CustomEvent<{ scope?: string }>).detail?.scope;
      if (!at || at === scope) setBump(n => n + 1);
    };
    const onSeeded = () => setBump(n => n + 1);
    window.addEventListener(PLAN_SAVED_EVENT, onSaved);
    window.addEventListener(DEMO_SEEDED_EVENT, onSeeded);
    return () => { window.removeEventListener(PLAN_SAVED_EVENT, onSaved); window.removeEventListener(DEMO_SEEDED_EVENT, onSeeded); };
  }, [scope]);
  const data = loaded && loaded.scope === scope ? loaded.payload : null;
  const stamp = data?.planImported ? String(data.planSource?.importedAt || "imported") : "";
  useEffect(() => {
    if (!stamp) return;
    let cancelled = false;
    fetch(`/api/registration-stats?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (!cancelled && body) setPast({ scope, stamp, history: body.history || {} }); })
      .catch(() => { if (!cancelled) setPast(null); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, stamp, scope]);
  const historyReady = Boolean(stamp) && past?.scope === scope && past.stamp === stamp;
  /* مصدران منفصلان: التخطيط (المختار أو كشف المتبقي) ورغبات الطلبة في «مساري». لا يدخل أحدهما في الآخر. */
  const plan = useMemo(() => {
    if (!data) return { gaps: [], surpluses: [] };
    /* المتبقي بلا تاريخه يقترح «شعبةً واحدة» فيُخفي النقص؛ فلا يُعتدّ به حتى يصل التاريخ. */
    const plan: GapPlan = { accepted: data.accepted || {}, remaining: historyReady ? data.remaining || {} : {}, history: historyReady ? past!.history : {} };
    // التخفيض يعتمد حصرياً على كشف الإحصائيات المرفوع لهذا الفصل؛ الفتح كما كان.
    // إدخال «المتبقي» اليدوي لا يُعامل ككشف مرفوع للتخفيض.
    const hasCurrentReport = Boolean(data.planImported && data.planSource?.fileName && data.planSource.fileName !== "إدخال يدوي");
    const currentReport = hasCurrentReport ? { remaining: data.remaining || {}, accepted: {}, history: {} } : null;
    return { gaps: planGaps(data.courses, plan), surpluses: planSurpluses(data.courses, currentReport) };
  }, [data, historyReady, past]);
  const studentItems = useMemo(() => (data ? studentGaps(data.courses) : []), [data]);
  const reload = useCallback(() => setBump(value => value + 1), []);
  /* مع كشفٍ مرفوع لا تكتمل حسبة التخطيط قبل أن يصل تاريخ الفصول (وإلا اقترح «شعبةً واحدة» فأخفى النقص). */
  const ready = data !== null && (!data.planImported || historyReady);
  return { planItems: plan.gaps, planSurplusItems: plan.surpluses, studentItems, staffing: staffed && staffed.scope === scope ? staffed.payload.staffing : null, freeSlots: staffed && staffed.scope === scope ? staffed.payload.visitorFreeSlots : 0, courses: data?.courses || [], planImported: Boolean(data?.planImported), loaded: data !== null, ready, source: data?.planSource?.fileName || "", reload };
}

export type Gap = ReturnType<typeof useSectionGap>;

/** The quick comparison duplicates planning's entry point whenever its badge is shown.
 * Keep the decision tied to the very same planItems used by SectionGapBadge,
 * not only to whether a remaining-students file has been uploaded. */
export function showQuickCompareBadge(gap: { loaded: boolean; planImported: boolean; planItems: GapItem[]; planSurplusItems?: GapItem[] }): boolean {
  return gap.loaded && !gap.planImported && gap.planItems.length === 0 && (gap.planSurplusItems?.length || 0) === 0;
}

export type GapKind = "plan" | "students";
const KIND = {
  plan: { Icon: ClipboardList, word: "التخطيط", title: "مراجعة عدد الشعب بحسب تخطيطك", hint: "الفتح من التخطيط؛ الفائض من إحصائية الفصل الحالي فقط. التقديرات المتعارضة تظهر كمراجعة واحدة" },
  students: { Icon: Users, word: "مساري", title: "شعبٌ يطلبها الطلبة في «مساري»", hint: "من رغبات الطلبة في «مساري» · اختياري ولا يمنع التوقيع" },
} as const;

/** الشارة: عددُ المقررات التي تنقصها شعب بحسب هذا المصدر. شارتان منفصلتان: التخطيط، ومساري. */
export function SectionGapBadge({ items, kind, open, onToggle }: { items: GapItem[]; kind: GapKind; open: boolean; onToggle: () => void }) {
  if (!items.length) return null;
  const { Icon, word, hint } = KIND[kind];
  return (
    <button type="button" className="apb-badge apb-data-btn" data-tone="info" aria-expanded={open} onClick={onToggle} title={hint}
      data-guide-ignore="قائمة الشعب المقترح زيادتها — اختيارية، تعرض مقرراتٍ ينقصها شعب">
      <Icon aria-hidden="true" /><span>{word}</span><b>{num(items.length)}</b><ChevronDown aria-hidden="true" className="apb-data-chev" />
    </button>
  );
}

/** سطرٌ تحت المقرر: أيقونةٌ ورقم، ولكلٍّ جملتُه الكاملة في التلميح. لا أسماء. */
function Staffing({ staffing, visitors }: { staffing: CourseStaffing; visitors: number }) {
  const chips: Array<{ id: string; Icon: typeof Users; n: number; tip: string; tone?: string; always?: boolean }> = [
    { id: "ours", Icon: Users, n: staffing.ours, tip: `يدرّسه ${countOf(staffing.ours, AR.instructor)} من أساتذتنا هذا الفصل`, always: true },
    { id: "covered", Icon: UserCheck, n: staffing.covered, tip: `${countOf(staffing.covered, AR.section)} يغطيها أساتذتنا`, always: true },
    { id: "unassigned", Icon: UserMinus, n: staffing.unassigned, tip: `${countOf(staffing.unassigned, AR.section)} بلا أستاذ (هيئة تدريسية)`, tone: "warn" },
    { id: "visitors", Icon: UserPlus, n: staffing.withVisitors, tip: `${countOf(staffing.withVisitors, AR.section)} عند منتدبٍ حالي` },
    { id: "returnable", Icon: History, n: staffing.returnable, tip: `${countOf(staffing.returnable, AR.instructor)} درّسوه سابقاً ولا يدرّسونه هذا الفصل`, tone: "soft" },
  ];
  /* اللمس لا يعرف «title»: الضغط على أيقونةٍ يكتب معناها تحت الصف، والضغط عليها ثانيةً يطويه.
     يُحفظ مفتاح الأيقونة لا نصُّها، فيُشتق النص من الأرقام الحالية، وتزول الجملة بزوال أيقونتها. */
  const [picked, setPicked] = useState<string | null>(null);
  const shown = chips.filter(chip => chip.always || chip.n > 0).map(chip => ({ ...chip, key: chip.id }));
  const needTip = `نحتاج ${countOf(visitors, AR.visitor)}`;
  const tipOf = picked === "need" ? needTip : shown.find(chip => chip.key === picked)?.tip || null;
  const toggle = (key: string) => setPicked(current => (current === key ? null : key));
  return (
    <div className="apb-staff" role="group" aria-label="من يدرّس المقرر">
      {shown.map(({ Icon, n, tip, tone, key }) => (
        <button key={key} type="button" className="apb-staff-chip" data-tone={tone} data-picked={picked === key || undefined} title={tip} aria-label={tip} aria-pressed={picked === key} onClick={() => toggle(key)} data-guide-ignore="أيقونة تشرح معناها تحت الصف عند الضغط"><Icon aria-hidden="true" /><b>{num(n)}</b></button>
      ))}
      <button type="button" className="apb-staff-need" data-zero={visitors === 0 || undefined} data-picked={picked === "need" || undefined} title={needTip} aria-label={needTip} aria-pressed={picked === "need"} onClick={() => toggle("need")} data-guide-ignore="أيقونة عدد المنتدبين تشرح معناها عند الضغط"><UserPlus aria-hidden="true" /><b>{num(visitors)}</b></button>
      {tipOf ? <p className="apb-staff-tip" role="status">{tipOf}</p> : null}
    </div>
  );
}

/** قائمةٌ قصيرة: اسم المقرر، وما بُني عليه الرقم، و«الموجود ← المطلوب». تفتح البطاقةُ من يدرّسه وكم منتدباً نحتاج. */
export function SectionGapPanel({ items, kind, onClose, staffing, freeSlots = 0 }: { items: GapItem[]; kind: GapKind; onClose: () => void; staffing?: Record<string, CourseStaffing> | null; freeSlots?: number }) {
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [totalOpen, setTotalOpen] = useState(false);
  const ordered = useMemo(() => sortByName(items, item => item.name), [items]);
  const list = all ? ordered : ordered.slice(0, SHOWN);
  const { Icon, title } = KIND[kind];
  const staffingItems = useMemo(() => items.filter(item => !item.surplus && item.extra > 0), [items]);
  const need = useMemo(() => (staffing && kind === "plan" ? visitingNeed(staffingItems, staffing, freeSlots) : null), [staffingItems, staffing, freeSlots, kind]);
  const rowOf = (id: number) => need?.rows.find(row => row.id === id);
  return (
    <section className="apb-gap" aria-label={title}>
      <header>
        <span className="apb-gap-ic"><Icon aria-hidden="true" /></span>
        <strong>{title}</strong>
        <small>اختياري</small>
        <button type="button" className="apb-dr-close" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاق قائمة الشعب المقترحة"><X aria-hidden="true" /></button>
      </header>
      {kind === "plan" ? <p className="apb-gap-source-note"><ClipboardList aria-hidden="true" />الفتح من التخطيط، والفائض من كشف هذا الفصل فقط؛ عند التعارض راجع التقدير.</p> : null}
      <ul className="apb-gap-list">
        {list.map(item => {
          const row = rowOf(item.id);
          const open = openId === item.id && Boolean(row);
          const body = (
            <>
              <span className="apb-gap-name"><b>{item.name}</b><small>{item.code}</small></span>
              {kind === "students"
                ? <span className="apb-gap-why"><Users aria-hidden="true" />{countOf(item.demand, AR.student)}</span>
                : !item.surplus && item.demand > 0 ? <span className="apb-gap-why">المتبقي {num(item.demand)}</span> : null}
              {item.conflict ? (
                <span className="apb-conflict" role="group"
                  aria-label={`تعارض التقدير في ${item.name}: الموجود ${num(item.existing)}، التخطيط يطلب ${num(item.conflict.openingRequired)}، وكشف هذا الفصل يقدّر ${num(item.conflict.reportRequired)} لاستيعاب ${countOf(item.demand, AR.student)} لم يسجلوا. راجع البيانات قبل فتح أو إلغاء أي شعبة.`}>
                  <span className="apb-conflict-title"><AlertTriangle aria-hidden="true" /><span><strong>تعارض التقدير</strong><small>راجع قبل التغيير</small></span></span>
                  <span className="apb-conflict-numbers" aria-hidden="true">
                    <span><b>{num(item.existing)}</b><small>الموجود</small></span>
                    <span><b>{num(item.conflict.openingRequired)}</b><small>التخطيط</small></span>
                    <span><b>{num(item.conflict.reportRequired)}</b><small>كشف المتبقي</small></span>
                  </span>
                </span>
              ) : item.surplus ? (
                <span
                  className="apb-surplus"
                  role="group"
                  aria-label={`فائض ${countOf(item.surplus, AR.section)}: الموجود ${num(item.existing)}، والمطلوب ${num(item.required)} بحسب إحصائية الفصل الحالي: المتبقي ${countOf(item.demand, AR.student)}. راجع الإلغاء؛ لا تُحذف الشعب تلقائياً.`}
                >
                  <span className="apb-surplus-label">
                    <span className="apb-surplus-icon" aria-hidden="true"><Layers /><Minus /></span>
                    <span className="apb-surplus-heading"><strong>فائض {countOf(item.surplus, AR.section)}</strong><small>راجع الإلغاء</small></span>
                  </span>
                  <span className="apb-surplus-divider" aria-hidden="true" />
                  <span className="apb-surplus-flow" aria-hidden="true">
                    <span className="apb-surplus-stat apb-surplus-stat-existing"><b>{num(item.existing)}</b><small>الموجود</small></span>
                    <ArrowLeft className="apb-surplus-arrow" />
                    <span className="apb-surplus-stat apb-surplus-stat-required"><b>{num(item.required)}</b><small>المطلوب</small></span>
                  </span>
                </span>
              ) : (
                <span className="apb-gap-pill" title={`الموجود ${num(item.existing)} والمطلوب ${num(item.required)}`}>
                  <i>{num(item.existing)}</i><em aria-hidden="true">←</em><b>{num(item.required)}</b>
                </span>
              )}
              {row ? <ChevronDown aria-hidden="true" className="apb-gap-chev" /> : null}
            </>
          );
          return (
            <li key={item.id} data-open={open || undefined}>
              {row
                ? <button type="button" className={`apb-gap-row${item.surplus ? " apb-gap-row-surplus" : item.conflict ? " apb-gap-row-conflict" : ""}`} aria-expanded={open} onClick={() => setOpenId(open ? null : item.id)} data-guide-ignore="فتح تفاصيل من يدرّس المقرر وعدد المنتدبين">{body}</button>
                : <div className={`apb-gap-row${item.surplus ? " apb-gap-row-surplus" : item.conflict ? " apb-gap-row-conflict" : ""}`}>{body}</div>}
              {open && row ? <Staffing staffing={row.staffing} visitors={row.visitors} /> : null}
            </li>
          );
        })}
      </ul>
      {need ? (
        <footer className="apb-gap-total" data-zero={need.visitors === 0 || undefined} data-open={totalOpen || undefined}>
          <button type="button" className="apb-gap-total-btn" aria-expanded={totalOpen} onClick={() => setTotalOpen(value => !value)} data-guide-ignore="مجموع المنتدبين للقسم: الضغط يبيّن الحساب">
            <UserPlus aria-hidden="true" /><b>{num(need.visitors)}</b><small>{need.visitors === 1 ? "منتدب" : "منتدبين"}</small><ChevronDown aria-hidden="true" className="apb-gap-chev" />
          </button>
          {totalOpen ? (
            <div className="apb-sum" role="status" aria-label={`${countOf(need.sections, AR.section)} بلا أستاذ، ناقص ${Math.min(need.freeSlots, need.sections)} أماكن عند الحاليين، مقسوماً على ${VISITOR_MAX_SECTIONS}، يساوي ${countOf(need.visitors, AR.visitor)}`}>
              <span className="apb-sum-c"><Layers aria-hidden="true" /><b>{num(need.sections)}</b><small>بلا أستاذ</small></span>
              {need.freeSlots > 0 ? <><i aria-hidden="true">−</i><span className="apb-sum-c" data-tone="soft"><Armchair aria-hidden="true" /><b>{num(Math.min(need.freeSlots, need.sections))}</b><small>أماكن فارغة</small></span></> : null}
              <i aria-hidden="true">÷</i>
              <span className="apb-sum-c" data-tone="soft"><Users aria-hidden="true" /><b>{num(VISITOR_MAX_SECTIONS)}</b><small>لكل منتدب</small></span>
              <i aria-hidden="true">=</i>
              <span className="apb-sum-c" data-tone="result"><UserPlus aria-hidden="true" /><b>{num(need.visitors)}</b><small>{need.visitors === 1 ? "منتدب" : "منتدبين"}</small></span>
            </div>
          ) : null}
        </footer>
      ) : null}
      {items.length > SHOWN ? (
        <footer>
          <button type="button" className="apb-gap-link" onClick={() => setAll(value => !value)} data-guide-ignore="عرض كل المقررات المقترحة أو إخفاؤها">
            {all ? "أقل" : `الكل (${num(items.length)})`}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
