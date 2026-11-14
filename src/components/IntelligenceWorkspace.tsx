import CourseTags from "./CourseTags";
import { askRegulationException, REGULATION_EXCEPTION_DECLINED, regulationIssuesOf, withRegulationException } from "./RegulationExceptionSheet";
import AcademicAdvicePanel from "./AcademicAdvicePanel";
import VisitingBadge, { withVisitingSuffix } from "./VisitingBadge";
import { useVisitingLookup } from "../hooks/useVisitingLookup";
import TermSelect from "./TermSelect";
import SearchableSelect from "./SearchableSelect";
import IntelligenceScopeSwitch from "./IntelligenceScopeSwitch";
import { departmentFamily } from "../utils/sectionLabel";
import PredictiveInsightPanel from "./PredictiveInsightPanel";
import SectionPlan, { type PlanReadingView } from "./SectionPlan";
import { WhatIfDesk } from "./TimeMachine";
import LivingScheduleLayer from "./LivingScheduleLayer";
import { openInScheduleEditor, takeTwinHandoff } from "../utils/intelligenceLink";
import { safetyPointKind, safetyPointTitle, type SafetyPointKind } from "../utils/safetyNet";
import { roleDefinition } from "../utils/academicRoles";
import { mergeOperationsReadings, mergeDecisionReadings, scopedReadingList, sameIntelligenceScope, type IntelligenceScope, type ScopedReading } from "../utils/intelligenceReadingScope";
import { DEMO_STAGE_SECTION_ID, isDemoSession } from "../utils/demoSession";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimeField } from "./TimeField";
import { DnaStepper } from "./dna";
import { CampusTravelMap, EquationChips } from "./VisualBits";
import { runVisualTransition } from "../utils/visualTransition";
import { showPwaPrintHelp } from "../utils/pwaPrintHelp";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  BrainCircuit,
  Building2,
  CalendarClock,
  Ban,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  ClipboardList,
  Clock3,
  Command,
  Dna,
  FileClock,
  FileText,
  FileSpreadsheet,
  Gauge,
  History,
  Hourglass,
  LayoutGrid,
  Lightbulb,
  LockKeyhole,
  FileUp,
  Undo2,
  CalendarPlus,
  CalendarX,
  Pencil,
  Stamp,
  Copy,
  BookOpen,
  MessageSquareText,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UsersRound,
  WandSparkles,
  Workflow,
  Link2,
  QrCode,
  Printer,
  Plus,
  X,
} from "lucide-react";
import {
  Badge,
  Field,
  GhostButton,
  Notice,
  Num,
  PageTitle,
  PrimaryButton,
  PrintLetterhead,
  PrintPortal,
  SecondaryButton,
  Segmented,
  StatCard,
  Surface,
  visualConfirm,
} from "./ui";
import type {
  AdCollege,
  AdCourse,
  AdInstructor,
  AdSection,
  AdTerm,
  FSchedule,
} from "../types";
import IntelligenceContextBar from "./IntelligenceContextBar";
import { useScopedTerms } from "./useScopedTerms";
import { AR, countOf, nounFor, oblique } from "../utils/arabicCount";
import { resolveScopeSelection, singleDepartmentOf } from "../utils/scopeContext";
import { hidesCollege, hidesSection, scopeShape } from "../utils/scopeShape";
import { readSharedScope, resolveSharedScope, useSharedScope } from "../utils/sharedScope";
import { sortByName, byRoom, byArabic } from "../utils/sorting";
import { sortTermsNewest, termIsArchive } from "../utils/termSequence";
import { isAssignableInstructor } from "../utils/instructorStatus";
import { applyWithOverwriteConfirm } from "../utils/scopeOverwrite";
import LocationPicker, { BuildingPicker } from "./LocationPicker";
import { roomIdentityKey } from "../utils/locationRegistry";
import { parseNaturalQuery } from "../utils/naturalQuery";
import {
  IntelligenceVersionCanvas as VersionCanvas,
  IntelligenceVersionDiffTable,
  intelligenceDayLabels as dayLabels,
  intelligenceMinutes as twinMinutes,
} from "./IntelligenceVersionCanvas";
import { formatCompactDurationArabic, formatMinuteMetricArabic, formatUnitMetricArabic, formatScheduleTimeRange, SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START_TIME, SCHEDULE_SLOT_MINUTES, scheduleClockForDisplay } from "../utils/scheduleTime";

import { setTelemetryScope, telemetryApi, telemetryBreadcrumb, telemetryError, telemetryTiming } from "../utils/clientTelemetry";
import MiniRing, { ringFromScoreText } from "./MiniRing";
import ActionableErrorNotice from "./ActionableErrorNotice";
import { classifyActionableError, type ActionableError } from "../utils/actionableError";


type Tab = "command" | "copilot" | "twin" | "whatif" | "history";

function PdfDifferenceBody({report,courses,instructors,isVisiting}:{report:any;courses:AdCourse[];instructors:AdInstructor[];isVisiting:(instructorId:unknown,collegeId:unknown,sectionId:unknown)=>boolean}){
  return <>
    <div className="pdf-report-summary">
      <article className="added"><strong>{report.counts.added}</strong><span>{nounFor(report.counts.added, AR.course)} {nounFor(report.counts.added, AR.addedAdj)}</span></article>
      <article className="deleted"><strong>{report.counts.deleted}</strong><span>{nounFor(report.counts.deleted, AR.course)} {nounFor(report.counts.deleted, AR.deletedAdj)}</span></article>
      <article className="changed"><strong>{report.counts.changed}</strong><span>{nounFor(report.counts.changed, AR.course)} {nounFor(report.counts.changed, AR.editedVerb)}</span></article>
      <article><strong>{report.counts.unchanged}</strong><span>دون تغيير</span></article>
    </div>
    <div className="pdf-report-legend" aria-label="دليل الألوان"><span className="added"><i />إضافة جديدة — الرقم المرجعي فارغ</span><span className="deleted"><i />حذف</span><span className="changed"><i />الخانة المعدّلة</span></div>
    <div className="pdf-report-table-wrap">
      <table className="pdf-report-table">
        <thead><tr><th>الرقم المرجعي</th><th>رمز المقرر</th><th>اسم المقرر</th><th>الشعبة</th><th>أستاذ المقرر</th><th>الأيام</th><th>الوقت</th><th>المبنى</th><th>القاعة</th></tr></thead>
        <tbody>{report.rows.map((entry:any,index:number)=>{
          const row=entry.current||entry.source||{};
          const changed=new Set<string>(entry.changedFields||[]);
          const daysChanged=["fsunday","fmonday","ftuesday","fwednesday","fthursday"].some(day=>changed.has(day));
          const days=Object.keys(dayLabels).filter(day=>row[day]).map(day=>(dayLabels as any)[day]).join(" - ")||"—";
          const instructor=instructors.find(person=>Number(person.AdInstructorId)===Number(row.AdInstructorId))?.AdInstructorName||"—";
          const course=courses.find(item=>Number(item.AdCourseId)===Number(row.AdCourseId));
          const mark=(...fields:string[])=>entry.status==="changed"&&fields.some(field=>changed.has(field))?"cell-changed":"";
          return <tr key={`${entry.status}-${row.sourceOrder}-${index}`} className={entry.status}>
            <td className="pdf-report-reference-number">{entry.status==="added"?"":entry.referenceNumber||"—"}</td>
            <td>{course?.CourseCode||"—"}</td>
            <td>{row.AdCourseName||course?.CourseName||"—"}<CourseTags courseId={row.AdCourseId} /></td>
            <td className={mark("SCode")}>{row.SCode||"—"}</td>
            <td className={mark("AdInstructorId")}>{instructor}{isVisiting(row.AdInstructorId,row.AdCollegeId,row.AdSectionId)?<> <VisitingBadge compact /></>:null}</td>
            <td className={daysChanged&&entry.status==="changed"?"cell-changed":""}>{days}</td>
            <td className={mark("fstarttime","fendtime")} dir="ltr">{formatScheduleTimeRange(row.fstarttime,row.fendtime)}</td>
            <td className={mark("AdRoomCode")}>{row.AdRoomCode||"—"}</td>
            <td className={mark("AdRoomHall")}>{row.AdRoomHall||"—"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <footer className="pdf-report-foot"><ShieldCheck /> اسم المقرر الوارد في الأصل محمي من التبديل. الحذف مسموح، وأي مقرر جديد يظهر برقمه المرجعي فارغاً.</footer>
  </>;
}

type InsightScene =
  | "quality"
  | "attention"
  | "density"
  | "spatial"
  | "health"
  | "genome"
  /* قراءةُ الفصل القادم: اللوحةُ نفسها في رادار التسجيل، لا نسخة. */
  | "predict"
  /* Carved out of the quality panel, which was the last reading still holding
     two cards. One reading, one card, one screen — a panel that stacks two is
     exactly the thing this strip exists to end. */
  | "approval"
  /* «فرصة لتحسين الجدول»: بطاقتُها هنا، وأيقونتُها في «أدوات الجدول» — ولا مكان ثالث. */
  | "improve"
  /* الطلب الفعلي: تقرير التسجيل (SWRDASH) — الرفعُ والتنبيه والعلاج في بطاقةٍ واحدة. */
  | "actualDemand"
  /* «لماذا هذا الحل؟» — من «مركز القرار» الذي صار هنا: لماذا هذا البديل، ولماذا لا. */
  | "why";
/* «جرّب» — every card it holds, including the three that used to appear on
   their own the moment a scenario existed. */
type TwinCard = "hero" | "lab" | "board" | "editor" | "ledger" | "genesis";
/* «السجل» (كان «اعتمد»): ودفترُ القرار بطاقةٌ واحدة بثلاثة ألسنة — دفتر القرارات، ومحضر القرار، وذاكرة القرار. */
type ApproveCard = "compare" | "drafts" | "versions" | "decisions";
/* ── المرحلةُ والبطاقةُ في الرابط ───────────────────────────────────────────
   «لما أضغط أي بطاقة كيف أرجع؟»: زرُّ الرجوع في المتصفح كان يخرج من المركز كله،
   لأن فتح البطاقة لم يكن خطوةً في التاريخ. الآن كلُّ فتحٍ خطوة: ?stage=…&card=…،
   فالرجوع يعيدك إلى شبكة البطاقات، أو إلى البطاقة التي أرسلتك إلى مرحلةٍ أخرى. */
const TAB_VALUES: Tab[] = ["command", "copilot", "twin", "whatif", "history"];
const INSIGHT_SCENE_VALUES: InsightScene[] = ["quality", "approval", "attention", "density", "why", "spatial", "health", "genome", "improve", "predict", "actualDemand"];
const TWIN_CARD_VALUES: TwinCard[] = ["hero", "genesis", "lab", "board", "editor", "ledger"];
const APPROVE_CARD_VALUES: ApproveCard[] = ["compare", "drafts", "versions", "decisions"];
/* ── أيقونةُ نقطة النسخة: ما الذي أُخذت قبله (من «شبكة الأمان» التي صارت «سجل النسخ»). ── */
const SAFETY_POINT_ICONS: Record<SafetyPointKind, React.ComponentType<any>> = {
  import: FileUp, publish: Send, undo: Undo2, restore: History, add: CalendarPlus,
  edit: Pencil, delete: CalendarX, approval: Stamp, copy: Copy, other: ShieldCheck,
};
const CARD_BACK_LABEL = "كل البطاقات";
type IntelNav = { tab: Tab; card: string | null };
const readIntelNav = (fallbackTab: Tab): IntelNav | null => {
  try {
    const params = new URLSearchParams(window.location.search);
    const stage = params.get("stage") as Tab | null;
    if (!stage || !TAB_VALUES.includes(stage)) return params.has("card") ? null : { tab: fallbackTab, card: null };
    const card = params.get("card");
    const valid = stage === "command" ? INSIGHT_SCENE_VALUES.includes(card as InsightScene)
      : stage === "twin" ? TWIN_CARD_VALUES.includes(card as TwinCard)
        : stage === "history" ? APPROVE_CARD_VALUES.includes(card as ApproveCard) : false;
    return { tab: stage, card: valid ? card : null };
  } catch { return null; }
};
const intelNavUrl = (nav: IntelNav) => {
  const params = new URLSearchParams(window.location.search);
  params.delete("stage"); params.delete("card");
  /* المرحلةُ تُكتب دائماً: رابطُ «آلة الزمن» القديم يفتح على «ماذا لو»، فغيابُ stage
     هناك يعني «ماذا لو» لا «افهم» — فالصريحُ وحده يرجع إلى ما كان المستخدم فيه. */
  params.set("stage", nav.tab);
  if (nav.card) params.set("card", nav.card);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
};
type ChatItem = { prompt: string; answer: any };
type InsightReason = {
  kicker: string;
  title: string;
  metric?: string;
  tone?: "good" | "warn" | "bad" | "plain";
  icon?: React.ReactNode;
  summary?: string;
  facts?: Array<{ label: string; value: string }>;
  bars?: Array<{ label: string; value: number; max: number; caption?: string }>;
  items?: Array<{ title: string; subtitle?: string; meta?: string; value?: string }>;
};
interface Props {
  user: any;
  scopes: any[];
  /** «آلة الزمن» صارت «جرّب ← ماذا لو»: رابطُها القديم يفتح المركز على هذا اللسان. */
  initialTab?: Tab;
}
/**
 * ── بطاقة واحدة، صفحة واحدة ─────────────────────────────────────────────────
 *
 * Three screens here kept re-inventing the same thing badly. «افهم» got a
 * dashboard of tiles that open as pages; «جرّب» and «اعتمد» got a strip of
 * chips — and a strip only ever governed the cards it knew about. Everything
 * else stayed stacked underneath it, so choosing «مختبر القرار» still left the
 * board, the what-if editor and the change ledger sitting below, and the page
 * did not move an inch when you pressed.
 *
 * One mechanism now, used by all three: a deck. Closed, it is a dashboard of
 * small cards. Open, it is a single card as a full page, with the way back
 * pinned above everything.
 */
interface DeckCard {
  value: string;
  label: string;
  detail: string;
  metric?: string;
  icon?: React.ReactNode;
  /* «متقدم»: لا يظهر في شبكة المرحلة؛ بابُه مجموعةُ «متقدم» في «افهم»، ويبقى في شريط المرحلة. */
  advanced?: boolean;
}

/**
 * Put whatever just appeared at the top of the screen.
 *
 * Measured after paint, and only on an element that is actually on screen: a
 * `display:none` element measures zero, which silently reads as "you are
 * already there" and leaves the page exactly where it was. That was the whole
 * bug — pressing a card changed the content a thousand pixels below the fold
 * and never scrolled to it.
 */
/**
 * ── افتح القراءة من أعلى الصفحة ─────────────────────────────────────────────
 *
 * Two bugs lived here, and the second one hid inside the fix for the first.
 *
 *  1. Measuring one frame after the state change measured the panel React had
 *     not swapped yet.
 *  2. The real one: `.insight-page-head` is `position: sticky; top: 84px`. A
 *     stuck element's `getBoundingClientRect().top` reports where it is STUCK
 *     — 84 — not where it lives in the document. So the arithmetic
 *     `rect.top + scrollY` resolved to "roughly where you already are", the
 *     guard then decided the page was close enough, and nothing moved. It was
 *     never a timing problem at heart; it was measuring a lie.
 *
 * A sticky element cannot answer "where do you begin?", so it is not asked.
 * The destination is the workspace container itself, measured through the
 * offset chain — a value stickiness cannot touch — and the reading always
 * opens at the top of its own page.
 */
const documentTop = (node: HTMLElement | null) => {
  let top = 0;
  let walker: HTMLElement | null = node;
  while (walker) {
    top += walker.offsetTop;
    walker = walker.offsetParent as HTMLElement | null;
  }
  return top;
};

const liftToTop = (instant: boolean) => {
  let tries = 0;
  const measure = () => {
    const page = document.querySelector<HTMLElement>(".intelligence-page");
    const marker = [
      ...document.querySelectorAll<HTMLElement>(".insight-page-head, .insight-preview-rail"),
    ].find(el => el.getClientRects().length > 0);
    if (!page && !marker) { if (tries++ < 8) requestAnimationFrame(measure); return; }
    /* بطاقةٌ مفتوحة: يصعد صفُّ «كل البطاقات» إلى موضع التصاقه، فيظهر المحتوى تحته
       مباشرةً — والعنوانُ وشريطُ النطاق فوقه على بُعد تمريرة. يُقاس الحاويةُ لا الصفّ
       الملتصق (موضعُ الملتصق كذبة). وإلا فأعلى الصفحة كما كان. */
    const nav = [...document.querySelectorAll<HTMLElement>(".intelligence-page .insight-page-nav")].find(el => el.getClientRects().length > 0);
    const stick = nav ? parseFloat(getComputedStyle(nav).top) || 0 : 0;
    const top = nav?.parentElement
      ? Math.max(0, documentTop(nav.parentElement) - stick - 4)
      : Math.max(0, documentTop(page || marker!) - 12);
    if (Math.abs(window.scrollY - top) >= 4) window.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
  };
  requestAnimationFrame(() => requestAnimationFrame(measure));
};

/**
 * ── رأسُ البطاقة المفتوحة: رجوعٌ واحد، وشريطُ بطاقات المرحلة ────────────────
 * فتحُ بطاقةٍ كان يُخفي الشبكة وعنوان الصفحة وشريط النطاق معاً، فلا يبقى إلا
 * «العودة» — وبنصٍّ مختلف في كل مرحلة. الآن: زرٌّ واحد باسمٍ واحد «كل البطاقات»،
 * وبجانبه شريطٌ أفقي مضغوط ببطاقات المرحلة نفسها، فالانتقال إلى بطاقةٍ أخرى نقرةٌ واحدة.
 */
const CardPageHead = ({ cards, value, onChange, title, metric }: {
  cards: DeckCard[];
  value: string;
  onChange: (next: string | null) => void;
  title: string;
  metric?: React.ReactNode;
}) => {
  const active = cards.find(card => card.value === value) || null;
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const chip = strip.current?.querySelector<HTMLElement>("[aria-current='true']");
    const box = strip.current;
    if (!box) return;
    box.toggleAttribute("data-overflow", box.scrollWidth > box.clientWidth + 2);
    if (!chip) return;
    /* الشريط وحده يتحرّك أفقياً — لا تُسحب الصفحة كلها كما يفعل scrollIntoView. */
    const offset = chip.offsetLeft - (box.clientWidth - chip.offsetWidth) / 2;
    box.scrollTo({ left: offset, behavior: "auto" });
  }, [value]);
  if (!active) return null;
  return (
    <>
      <div className="insight-page-nav no-print">
        <button type="button" className="insight-back" data-guide-ignore="يعيد إلى شبكة بطاقات المرحلة نفسها؛ تنقّلٌ لا فعل" onClick={() => onChange(null)}>
          <LayoutGrid aria-hidden="true" />
          {CARD_BACK_LABEL}
        </button>
        <div className="insight-card-strip" ref={strip} role="list" aria-label={title}>
          {cards.map(card => (
            <button
              key={card.value}
              type="button"
              role="listitem"
              className="insight-card-chip"
              aria-current={card.value === value ? "true" : undefined}
              title={card.detail}
              data-guide-ignore="شريط بطاقات المرحلة: يفتح البطاقة نفسها التي في الشبكة"
              onClick={() => onChange(card.value)}
            >
              {card.icon ? <span aria-hidden="true">{card.icon}</span> : null}
              <span>{card.label}</span>
            </button>
          ))}
        </div>
      </div>
      <header className="insight-page-head">
        <div className="insight-page-title">
          <span className="surface-kicker">{active.detail}</span>
          <span className="insight-title-line"><strong>{active.label}</strong>{metric ?? (active.metric ? <b className="insight-page-metric">{active.metric}</b> : null)}</span>
        </div>
      </header>
    </>
  );
};

const CardDeck = ({ cards, value, onChange, title, hint }: {
  cards: DeckCard[];
  value: string | null;
  onChange: (next: string | null) => void;
  title: string;
  hint: string;
}) => {
  const active = cards.find(card => card.value === value) || null;
  if (active) return <CardPageHead cards={cards} value={active.value} onChange={onChange} title={title} />;
  return (
    <nav className="insight-preview-rail no-print" aria-label={title}>
      <div className="insight-preview-head">
        <span className="surface-kicker">{title}</span>
        <strong>اختر بطاقة</strong>
        <small>{hint}</small>
      </div>
      <div className="insight-preview-list" role="list">
        {cards.filter(card => !card.advanced).map(card => (
          <button
            key={card.value}
            type="button"
            data-guide-ignore="بطاقة اختيار معاينة داخل الورشة، السلوك نفسه قبل إعادة التنسيق"
            className="insight-preview"
            role="listitem"
            aria-label={`${card.label} — ${card.detail}`}
            onClick={() => onChange(card.value)}
          >
            {card.icon ? (
              <span className="insight-preview-icon" aria-hidden="true">{card.icon}</span>
            ) : null}
            <span className="insight-preview-copy">
              <strong>{card.label}</strong>
              <small>{card.detail}</small>
            </span>
            {card.metric ? (ringFromScoreText(card.metric) ? <b className="insight-preview-ring">{ringFromScoreText(card.metric)}</b> : <b data-long={card.metric.length > 7 || undefined} data-word={/[\u0600-\u06FF]/.test(card.metric) || undefined}>{card.metric}</b>) : null}
          </button>
        ))}
      </div>
    </nav>
  );
};

const smartMessage = (value: any) => {
  const text = String(value?.message || value || "حدث خطأ غير متوقع");
  if (/Failed to fetch|NetworkError/i.test(text))
    return "تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة؛ لم يتم حفظ أي تغيير.";
  if (/API endpoint not found/i.test(text))
    return "جزء من التحديث لم يُرفع على الخادم بعد. ارفع ملفات الحزمة الجديدة كاملة مع الحفاظ على المسارات.";
  const issues = Array.isArray(value?.issues) ? value.issues.filter(Boolean).slice(0, 4) : [];
  return issues.length ? `${text}: ${issues.join(" · ")}` : text;
};

/** مصدر النسخة كما يُخزَّن رمزاً إنجليزياً، مقروءاً بالعربية في سجل النسخ. */
const VERSION_SOURCE_LABELS: Record<string, string> = {
  manual: "حفظ يدوي",
  draft: "مسودة",
  publish: "نشر",
  undo: "تراجع",
  copy: "نسخ",
  import: "استيراد",
};
const versionSourceLabel = (source: unknown) =>
  VERSION_SOURCE_LABELS[String(source || "")] || "تعديل";

/** رقمُ بطاقة القراءة، أو لا شيء حين يكون صفراً أو فارغاً (قاعدة إخفاء الفارغ). */
function metricBadge(metric: unknown) {
  const text = String(metric ?? "").trim();
  /* «84%» is a real out-of-100 figure too (the genome match): same ring. */
  const pct = /^(\d{1,3}(?:\.\d+)?)\s*%$/.exec(text);
  const ring = ringFromScoreText(pct ? `${pct[1]}/100` : text);
  if (ring) return <b className="insight-preview-ring">{ring}</b>;
  /* قيمةٌ نصيةٌ طويلة («لا موانع»، «تاريخ غير كافٍ») تُصغَّر فلا تنكسر بخطّ الرقم الكبير. */
  return text && !/^[0٠]$/.test(text) ? <b data-long={text.length > 7 || undefined} data-word={/[\u0600-\u06FF]/.test(text) || undefined}>{text}</b> : null;
}

export default function IntelligenceWorkspace({ user, scopes, initialTab }: Props) {
  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);
  /* لوحة القواعد: الخادم (requirePowerAdmin) يقصر الكتابة على الإدارة الرئيسية. */
  const canEditRules = isPowerAdmin;
  /* نشرُ الصحائف للعامة: رئيس لجنة الجدول وإدارة النظام وحدهما (والخادمُ يتحقق ثانيةً). */
  /* رقمُ بطاقة «الطلب الفعلي»: يُقرأ مع النطاق، وتحدّثه اللوحةُ نفسها بعد كل رفعٍ أو ربط. */
  const [actualDemand, setActualDemand] = useState<PlanReadingView | null>(null);
  const [colleges, setColleges] = useState<AdCollege[]>([]),
    [sections, setSections] = useState<AdSection[]>([]),
    [terms, setTerms] = useState<AdTerm[]>([]),
    [courses, setCourses] = useState<AdCourse[]>([]),
    [instructors, setInstructors] = useState<AdInstructor[]>([]);
  const [collegeId, setCollegeId] = useState(0),
    [sectionId, setSectionId] = useState(0),
    [termId, setTermId] = useState(0),
    [tab, setTab] = useState<Tab>(() => {
      const fromUrl = readIntelNav(initialTab || "command");
      if (fromUrl && new URLSearchParams(window.location.search).has("stage")) return fromUrl.tab;
      if (initialTab) return initialTab;
      const v = sessionStorage.getItem(
        "schedule-intelligence-tab",
      ) as Tab | null;
      sessionStorage.removeItem("schedule-intelligence-tab");
      /* الاستيراد يعيش في «نقل الجدول» وحده؛ قيمةٌ قديمة محفوظة («import») تعود إلى القراءة. */
      return v &&
        ["command", "copilot", "twin", "whatif", "history"].includes(v)
        ? v
        : "command";
    });
  useEffect(() => {
    setActualDemand(null);
    if (!collegeId || !sectionId || !termId) return;
    const controller = new AbortController();
    fetch(`/api/actual-demand?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include", signal: controller.signal })
      .then(res => (res.ok ? res.json() : null)).then(body => { if (!controller.signal.aborted) setActualDemand(body); }).catch(() => undefined);
    return () => controller.abort();
  }, [collegeId, sectionId, termId]);
  /* رابطُ آلة الزمن والمركزُ مفتوح: اللسانُ المطلوب يُفرض كلما تغيّر، لا عند أول تركيبٍ وحده. */
  useEffect(() => {
    if (!initialTab) return;
    const follow = () => { if (new URLSearchParams(window.location.search).has("ask")) setTab(initialTab); };
    /* رابطٌ يحمل مرحلته (?stage=) يُحترم؛ وإلا فالرابطُ القديم يفتح لسانه. */
    if (!new URLSearchParams(window.location.search).has("stage")) setTab(initialTab);
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, [initialTab]);
  const { lookup: visitingLookup, isVisiting } = useVisitingLookup(termId);
  const scopeOwner = Number(user?.SystemUserId || 0);
  const [analysisScope, setAnalysisScope] = useState<"college" | "department">("college");
  const hasMultipleDepartmentColleges = useMemo(() => {
    if (!collegeId || !sectionId) return false;
    const scopeMode = roleDefinition((user as any)?.Role).scopeMode;
    const family = departmentFamily(sections, collegeId, sectionId).filter(member =>
      isPowerAdmin || scopeMode === "allColleges" || scopes.some(scope =>
        Number(scope.AdCollegeId) === member.collegeId &&
        (Number(scope.AdSectionId) === member.sectionId ||
          (scopeMode === "college" && Number(scope.AdSectionId) === 0)),
      ),
    );
    return new Set(family.map(member => member.collegeId)).size > 1;
  }, [sections, collegeId, sectionId, scopes, isPowerAdmin, user?.Role]);
  const readingMode = tab === "twin" || !hasMultipleDepartmentColleges ? "college" : analysisScope;
  const pendingReadingAction = useRef<any>(null);
  const [scopeReady, setScopeReady] = useState("");
  const [overview, setOverview] = useState<any>(null),
    [rows, setRows] = useState<FSchedule[]>([]),
    [drafts, setDrafts] = useState<any[]>([]),
    [versions, setVersions] = useState<any[]>([]),
    [operationsReview, setOperationsReview] = useState<any>(null),
    [experienceHealth, setExperienceHealth] = useState<any>(null),
    [decisionInbox, setDecisionInbox] = useState<any>({ manual: [], inferred: [], totalOpen: 0 }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  /* K3: the classified form of the last thrown error, with the action that can
     repeat it. Shown only while `error` is still the same message. */
  const [errorDetail, setErrorDetail] = useState<{ message: string; info: ActionableError; retry?: () => void } | null>(null);
  /* Secondary readings that did not arrive. The board still paints; only these cards wait. */
  const [degraded, setDegraded] = useState<{ sources: string[]; info: ActionableError } | null>(null);
  /* Readings the server answered only in part (X-Reading-Partial): the card shows
     what arrived with a small icon, never the full-width error. */
  const partialPaths = useRef(new Set<string>());
  const [partialSources, setPartialSources] = useState<string[]>([]);
  const fail = (e: unknown, retry?: () => void) => {
    const text = smartMessage(e);
    const info = classifyActionableError(e);
    console.warn("[intelligence]", info.kind, info.technical || "", e);
    setError(text);
    setErrorDetail({ message: text, info, retry });
  };
  /**
   * ── الوصول إلى المشهد، لا تغييره فقط ────────────────────────────────────
   *
   * Choosing a reading changed which panel was rendered and left the page
   * exactly where it stood. Measured on the live board: pressing «الأساتذة»
   * from 5,886px down moved the page ZERO pixels, and the panel it had just
   * opened began 1,273 pixels ABOVE the viewport — so what the reader saw was
   * whatever happened to sit at that scroll height, which was a different
   * reading entirely. The tab worked; the page never went there, and that is
   * indistinguishable from a tab that does nothing.
   *
   * The destination is the STRIP, not the panel. Measuring the panel looked
   * right and worked once in four: the measurement happens before React has
   * hidden the previous panel, so the page is a different height by the time
   * the scroll lands. Exactly one panel is ever visible and it always begins
   * under the strip — so bringing the strip to the top of the window puts the
   * chosen reading under it every time. A fixed anchor cannot go stale.
   */
  /**
   * ── شريط داخل المشهد ────────────────────────────────────────────────────
   *
   * The reading tabs solved stacking for «افهم» and left the other two scenes
   * exactly as they were: «جرّب» stacks three cards and «اعتمد» three more,
   * each one a full screen tall, with nothing to say which is which until you
   * have scrolled past the previous one.
   *
   * The same strip answers it. One card at a time, chosen by name — not a
   * second mechanism, the same one these readings already use.
   */
  /* null is the dashboard. Every card below — including the ones that used to
     sit stacked under the strip with no way to choose them — is now a page. */
  /* «الضغط والكثافة»: خريطةُ الضغط (من «مركز القرار») والكثافة قراءتان مختلفتان في بطاقةٍ واحدة. */
  const [densityView, setDensityView] = useState<"density" | "pressure">("density");
  /* «اسأل الجدول» و«مساعد السياق» أداتان مختلفتان تحت عنوانٍ واحد. */
  const [askMode, setAskMode] = useState<"table" | "context">("table");
  /* دفتر القرار: ثلاث أدوات مختلفة، لكلٍّ بياناتها — لا تُدمج. */
  const [ledgerTab, setLedgerTab] = useState<"decisions" | "minutes" | "memory">("decisions");
  /* «تراجع عن النشر» بعد نشر مسودة (كان في «بداية الفصل» وحدها): نقطةُ الأمان التي أُخذت قبل النشر. */
  /* نشرٌ عبر أكثر من موقع يعيد نسخةً قبل النشر لكل موقع: التراجعُ يعيدها كلها. */
  const [publishUndo, setPublishUndo] = useState<{ points: Array<{ id: string }>; draftName: string } | null>(null);
  /* نقاطُ «شبكة الأمان» على «سجل النسخ»: الأثرُ قبل الاسترجاع — للإدارة الرئيسية كما كانت. */
  const [safetyPoints, setSafetyPoints] = useState<Map<string, any>>(new Map());
  const [twinCard, setTwinCard] = useState<TwinCard | null>(() => {
    const nav = readIntelNav(initialTab || "command");
    return nav?.tab === "twin" ? (nav.card as TwinCard | null) : null;
  });
  const [approveCard, setApproveCard] = useState<ApproveCard | null>(() => {
    const nav = readIntelNav(initialTab || "command");
    return nav?.tab === "history" ? (nav.card as ApproveCard | null) : null;
  });

  const showScene = (value: InsightScene | null) => {
    setInsightScene(value);
    liftToTop(reduceMotion.current);
  };
  const showTwinCard = (value: TwinCard | null) => {
    setTwinCard(value);
    liftToTop(reduceMotion.current);
  };
  const showApproveCard = (value: ApproveCard | null) => {
    setApproveCard(value);
    liftToTop(reduceMotion.current);
  };

  const [heatMode, setHeatMode] = useState("department"),
    [detail, setDetail] = useState<any>(null),
    /* null = the dashboard itself. A reading is a page that opens ON TOP of it
       and closes back to it — not a section further down the same scroll.
       Publishing can hand off directly to the students reading; consume that
       one-shot request here so the shortcut lands on the exact destination. */
    [insightScene, setInsightScene] = useState<InsightScene | null>(() => {
      const nav = readIntelNav(initialTab || "command");
      if (nav?.tab === "command" && nav.card) return nav.card as InsightScene;
      try {
        const requested = sessionStorage.getItem("schedule-intelligence-insight") as InsightScene | null;
        sessionStorage.removeItem("schedule-intelligence-insight");
        /* كلُّ بطاقةٍ في «افهم» تُفتح برابطها — ومنها «فرصة لتحسين الجدول» و«تنبّؤ الفصل القادم» و«الطلب الفعلي». */
        return requested && INSIGHT_SCENE_VALUES.includes(requested) ? requested : null;
      } catch { return null; }
    });
  const [insightReason, setInsightReason] = useState<InsightReason | null>(null);
  useEffect(() => { if (!isPowerAdmin && heatMode !== "department") setHeatMode("department"); }, [isPowerAdmin, heatMode]);
  const [prompt, setPrompt] = useState(""),
    [chat, setChat] = useState<ChatItem[]>([]);
  const copilotThread = useRef<HTMLDivElement | null>(null);
  const pendingCopilotAnswer = useRef<number | null>(null);
  const drawerClose = useRef<HTMLButtonElement | null>(null),
    drawerReturnFocus = useRef<HTMLElement | null>(null),
    reduceMotion = useRef(false);
  const [scenario, setScenario] = useState<FSchedule[] | null>(null),
    [scenarioEval, setScenarioEval] = useState<any>(null),
    [scenarioId, setScenarioId] = useState<number | "">(""),
    [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [guideSimulationMeta, setGuideSimulationMeta] = useState<null | { before:FSchedule; after:FSchedule; request:any }>(null);
  const intelligenceGuideOperationRef = useRef<null | { featureId:string; transactionId?:string; startedAt:number; expected:string }>(null);
  const [compareFrom, setCompareFrom] = useState(0),
    [compareTo, setCompareTo] = useState(0),
    [termCompare, setTermCompare] = useState<any>(null);
  const [versionFrom, setVersionFrom] = useState(""),
    [versionTo, setVersionTo] = useState(""),
    [versionCompare, setVersionCompare] = useState<any>(null),
    [timeTravel, setTimeTravel] = useState(50);
  const [online, setOnline] = useState(navigator.onLine);
  // Help never opens on its own; one deliberate question mark owns it.
  const [decisionCompose, setDecisionCompose] = useState(false);
  const [decisionTitle, setDecisionTitle] = useState("");
  const [versionScrubIndex, setVersionScrubIndex] = useState(0);
  /* ما قاله الطلاب — والنقلة التي تُصلحه.
     Loaded with everything else, and empty is the ordinary state: a department
     that has never opened the survey sees the door and nothing more. */
  const [genome, setGenome] = useState<any>(null),
    [constraints, setConstraints] = useState<any[]>([]),
    [innovationMode, setInnovationMode] = useState<
      "constraints" | "war" | "autopilot" | "policy"
    >("constraints"),
    [warRoom, setWarRoom] = useState<any>(null),
    [warRowId, setWarRowId] = useState<number | "">(""),
    [warBusy, setWarBusy] = useState(false),
    [autopilotGoal, setAutopilotGoal] = useState(
      "قلل الفراغات ومواضع التحقق بأقل تغيير ممكن، وحافظ على القاعات والأيام الحالية",
    ),
    [autopilot, setAutopilot] = useState<any>(null),
    [autopilotBusy, setAutopilotBusy] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<any>({ type: "day_off", day: "fwednesday", time: "17:00", building: "", growth: 10, scope: "department" });
  const [policyResult, setPolicyResult] = useState<any>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  useEffect(() => {
    if (hasMultipleDepartmentColleges) return;
    setAnalysisScope("college");
    setPolicyDraft((current: any) => current.scope === "family" ? { ...current, scope: "department" } : current);
  }, [hasMultipleDepartmentColleges]);
  const [constraintDraft, setConstraintDraft] = useState<any>({
    type: "instructor_latest_end",
    AdInstructorId: 0,
    AdCourseId: 0,
    day: "fwednesday",
    time: "14:00",
    buildingId: "",
    roomId: "",
    roomCode: "",
    roomHall: "",
    maxMinutes: 120,
  });
  const fetchJson = async (url: string, options?: RequestInit) => {
    const method=String(options?.method||"GET").toUpperCase();
    if (method !== "GET" && !navigator.onLine)
      throw new Error("أنت الآن دون اتصال. القراءة متاحة، لكن الحفظ والنشر ينتظر عودة الاتصال.");
    telemetryBreadcrumb(`${method} ${url.split("?")[0]}`);
    const started=performance.now();
    let r:Response;
    try{r=await fetch(url,{...options,credentials:options?.credentials||"include"});telemetryApi(url.split("?")[0],performance.now()-started,r.status,r.ok);}
    catch(error){telemetryError(url.split("?")[0],error,performance.now()-started);throw error;}
    const body = await r.text();
    let d: any = {};
    if (body) {
      try { d = JSON.parse(body); }
      catch { const error=new Error(r.ok ? "وصل رد غير متوقع من الخادم. أعد المحاولة بعد لحظات." : `الخادم مشغول حالياً (${r.status}). أعد المحاولة بعد قليل.`);telemetryError("response.parse",error);throw error; }
    }
    /* النقلُ المقترح حفظٌ كالسحب: مخالفةُ لائحةٍ لا تمنع تُسأل عنها صراحةً (ملاحظتا المالك 10 و20). */
    const regulationIssues = method !== "GET" ? regulationIssuesOf(r.status, d) : null;
    const marked = regulationIssues ? withRegulationException(options?.body) : null;
    if (regulationIssues && marked) {
      if (await askRegulationException(regulationIssues)) return fetchJson(url, { ...options, body: marked });
      throw Object.assign(new Error(REGULATION_EXCEPTION_DECLINED), { code: d.code, status: r.status, url });
    }
    if (!r.ok)
      throw Object.assign(new Error(d.error || "تعذر تنفيذ العملية"), { issues: d.issues, code: d.code, changes: d.changes, status: r.status, url, ref: d.ref });
    if (r.headers.get("x-reading-partial")) partialPaths.current.add(url.split("?")[0]);
    return d;
  };
  useEffect(() => {
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduceMotion.current = query.matches;
    };
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        /**
         * A power-only panel must not take the whole room down with it.
         *
         * `lookups` is reserved for the main administrator, and `Promise.all`
         * rejects on the first refusal — so a department coordinator, who is
         * allowed on this screen and needs most of it, used to arrive at a
         * blank page with a permission error and no way forward. The optional
         * pieces now fail alone: their panels stay quiet, the rest opens.
         */
        const [c, s, t, lookups] = await Promise.all([
          fetchJson("/api/colleges"),
          fetchJson("/api/sections"),
          fetchJson("/api/terms"),
          fetchJson("/api/intelligence/lookups").catch(() => null),
        ]);
        setColleges(sortByName(c, (row:any)=>row.AdCollegeName));
        setSections(sortByName(s, (row:any)=>row.AdSectionName));
        const sortedTerms = sortTermsNewest<AdTerm>(t);
        setTerms(sortedTerms);
        setCourses(sortByName(lookups?.courses || [], (row:any)=>row.CourseName));
        setInstructors(sortByName(lookups?.instructors || [], (row:any)=>row.AdInstructorName));
        // مركز الذكاء يقرأ نفس آخر نطاق فعّال في الجدول والاستعلامات.
        // طلب محاكاة حديث من المرشد يبقى أولوية مؤقتة، وإلا فآخر كلية/قسم/فصل
        // صالح يعود Active تلقائيًا بعد الدخول من جديد.
        try { sessionStorage.removeItem("schedule-intelligence-scope"); } catch {}
        let guideRequest:any = null;
        try { guideRequest = JSON.parse(sessionStorage.getItem("schedule-guide-simulation") || "null"); } catch {}
        const guideFresh = guideRequest && Date.now() - Number(guideRequest.createdAt || 0) < 10 * 60 * 1000;
        /* النطاق المشترك (src/utils/sharedScope.ts)، وطلب المرشد الحديث يتقدّمه
           مؤقّتاً دون أن يُكتب فوقه. */
        const stored = guideFresh
          ? { collegeId: Number(guideRequest.collegeId || 0), sectionId: Number(guideRequest.sectionId || 0), termId: Number(guideRequest.termId || 0) }
          : readSharedScope(scopeOwner);
        const scoped = resolveSharedScope(stored, {
          scopes, isAdmin: isPowerAdmin, colleges: c, sections: s, terms: sortedTerms,
          fallbackTermId: stored.termId ? Number(sortedTerms[0]?.AdTermId || 0) : 0,
        });
        setCollegeId(scoped.collegeId);
        /* التجربة: شاشةٌ لا تعمل إلا على قسمٍ واحد لا تُفتح على «اختر القسم» — قسم الحاسب مسرح البيانات. */
        setSectionId(scoped.sectionId || (isDemoSession() && scoped.collegeId ? DEMO_STAGE_SECTION_ID : 0));
        setTermId(scoped.termId);
        setCompareTo(sortedTerms[0]?.AdTermId || 0);
        setCompareFrom(sortedTerms[1]?.AdTermId || sortedTerms[0]?.AdTermId || 0);
      } catch (e: any) {
        fail(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  /* يُكتب في النطاق المشترك ما يختاره القارئ في شريط السياق وحده؛ وتغيّرٌ من
     شاشةٍ أخرى أو لسانٍ آخر يُعرض على النطاق ثم يُتبع. */
  const sharedScope = useSharedScope((incoming) => {
    if (!terms.length) return;
    pendingReadingAction.current = null;
    const next = resolveSharedScope(incoming, { scopes, isAdmin: isPowerAdmin, colleges, sections, terms, fallbackTermId: termId });
    setCollegeId(next.collegeId);
    setSectionId(next.sectionId);
    setTermId(next.termId);
  }, scopeOwner);
  const availableSections = useMemo(
    () => sections.filter((s) => !collegeId || s.AdCollegeId === collegeId),
    [sections, collegeId],
  );
  const contextQuery = useMemo(
    () =>
      new URLSearchParams({
        collegeId: String(collegeId),
        sectionId: String(sectionId),
        termId: String(termId),
      }).toString(),
    [collegeId, sectionId, termId],
  );
  const analysisQuery = `${contextQuery}&analysisScope=${readingMode}`;
  const ownScope = { collegeId, sectionId, collegeName: colleges.find(c => Number(c.AdCollegeId) === Number(collegeId))?.AdCollegeName || "" };
  const scopeLabel = (item: any) => readingMode === "department" ? item?.readingScope?.collegeName || "" : "";
  const sourceScope = (item: any): IntelligenceScope => item?.readingScope || {
    collegeId: Number(item?.AdCollegeId || collegeId), sectionId: Number(item?.AdSectionId || sectionId),
    collegeName: colleges.find(c => Number(c.AdCollegeId) === Number(item?.AdCollegeId || collegeId))?.AdCollegeName || "",
  };
  /* المنتدب بقسم الصفّ نفسه: لعنصرٍ يحمل قراءته (readingScope) أو كليتَه وقسمَه، وإلا فنطاق الشاشة. */
  const visitingAt = (instructorId: unknown, item: any) => {
    const source = sourceScope(item);
    return isVisiting(instructorId, source.collegeId, source.sectionId);
  };
  const enterSourceScope = (item: any, kind: string, extra?: any) => {
    const source = sourceScope(item);
    if (sameIntelligenceScope(source, ownScope)) return true;
    pendingReadingAction.current = { kind, item, extra, source, termId };
    setCollegeId(source.collegeId); setSectionId(source.sectionId);
    setAnalysisScope("college");
    return false;
  };
  const readAcross = async (path: string, merge: (readings: ScopedReading[]) => any, family = overview?.family) => {
    const members: IntelligenceScope[] = readingMode === "department" && family?.length ? family : [ownScope];
    const readings = await Promise.all(members.map(async scope => ({ scope, data: await fetchJson(`${path}?${new URLSearchParams({ collegeId: String(scope.collegeId), sectionId: String(scope.sectionId), termId: String(termId) })}`) })));
    return merge(readings);
  };
  const refreshDecisionInbox = () => readAcross("/api/intelligence/open-decisions", mergeDecisionReadings);
  useEffect(() => {
    setTelemetryScope({collegeId,sectionId,termId});
    if(collegeId&&sectionId&&termId)telemetryBreadcrumb(`مركز الذكاء ${collegeId}/${sectionId}/${termId}`);
  },[collegeId,sectionId,termId]);

  /**
   * The same instructor vocabulary as Add/Edit Schedule.
   *
   * `lookups.instructors` is power-admin only, so a coordinator's constraint
   * and placement pickers would open empty. Load
   * this department's historical staff plus this term's delegates explicitly;
   * InstructorPicker can still widen to the whole university when someone types.
   */
  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let alive = true;
    const paramsBase = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId) });
    const paramsTerm = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) });
    Promise.all([
      fetchJson(`/api/instructors?${paramsBase.toString()}`).catch(() => []),
      fetchJson(`/api/instructors?${paramsTerm.toString()}`).catch(() => []),
      fetchJson(`/api/visiting-roster?${paramsTerm.toString()}`).catch(() => ({ instructorIds: [], instructors: [] })),
      fetchJson(`/api/courses?sectionId=${sectionId}`).catch(() => []),
    ]).then(([historyPeople, termPeople, roster, sectionCourses]) => {
      if (!alive) return;
      const localPeople = [...new Map(
        [...(Array.isArray(historyPeople) ? historyPeople : []),
         ...(Array.isArray(termPeople) ? termPeople : []),
         ...(Array.isArray(roster?.instructors) ? roster.instructors : [])]
          .map((person:any) => [Number(person.AdInstructorId), person] as const),
      ).values()].filter((person:any) => Number(person.AdInstructorId));
      if (localPeople.length) {
        setInstructors(current => sortByName(
          [...new Map([...current, ...localPeople].map((person:any) => [Number(person.AdInstructorId), person] as const)).values()],
          (row:any) => row.AdInstructorName,
        ));
      }
      if (Array.isArray(sectionCourses) && sectionCourses.length) {
        setCourses(current => sortByName(
          [...new Map([...current, ...sectionCourses].map((course:any) => [Number(course.AdCourseId), course] as const)).values()],
          (row:any) => row.CourseName,
        ));
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [collegeId, sectionId, termId]);
  /** Only the newest read may paint. Switching scope quickly used to let an
   *  older answer land last and describe another department's numbers under
   *  the new department's name. */
  const reloadSerial = useRef(0);
  const intelligenceReadyScope = useRef("");
  const reload = async () => {
    if (!collegeId || !sectionId || !termId) return;
    const uiStarted = performance.now();
    const serial = ++reloadSerial.current;
    setLoading(true);
    setOverview(null); setGenome(null); setOperationsReview(null); setExperienceHealth(null);
    setDrafts([]); setVersions([]); setDecisionInbox({manual:[],inferred:[],totalOpen:0}); setDegraded(null);
    setPartialSources([]); partialPaths.current.clear();
    setError(null);
    let painted = false;
    try {
      // The board and its score are the first paint. Everything else is useful
      // context, not a reason to hold the whole intelligence room behind a
      // spinner. This keeps the page responsive even when history/telemetry is
      // cold in Firestore.
      const [o, r] = await Promise.all([
        fetchJson(`/api/intelligence/overview?${analysisQuery}`),
        fetchJson(`/api/schedules?${contextQuery}`),
      ]);
      if (serial !== reloadSerial.current) return;
      setOverview(o);
      setRows(r);
      setScopeReady(`${collegeId}:${sectionId}:${termId}`);
      if (!scenario) setScenarioId(r[0]?.id || "");
      painted = true;
      setLoading(false);
      const readyKey = `${collegeId}:${sectionId}:${termId}`;
      if (intelligenceReadyScope.current !== readyKey) {
        intelligenceReadyScope.current = readyKey;
        requestAnimationFrame(() => telemetryTiming("intelligence.ready", performance.now() - uiStarted));
      }

      // Secondary evidence arrives in parallel and quietly fills only the cards
      // that use it. A slow history query can no longer make «مركز الذكاء» feel
      // blank or make a department think the feature is missing.
      /* ── K3: one failed card is not a failed page ─────────────────────────
         These eight readings went through Promise.all, so the first one to fail
         (a cold history read, a sister college outside the reader's scope…)
         threw away the other seven AND replaced the painted board's context with
         the server's generic «تعذّر إتمام العملية الآن» — the message the owner
         saw. Each reading now settles on its own: what arrived is shown, what
         did not is named, logged, and can be retried. */
      const sources = [
        { label: "المسودات", run: () => readAcross("/api/intelligence/drafts", readings => scopedReadingList(readings), o.family) },
        { label: "النسخ", run: () => readAcross("/api/intelligence/versions", readings => scopedReadingList(readings), o.family) },
        { label: "بصمة القسم", run: () => fetchJson(`/api/intelligence/genome?${analysisQuery}`) },
        { label: "القيود", run: () => fetchJson(`/api/intelligence/constraints?${contextQuery}`) },
        { label: "مراجعة التشغيل", run: () => readAcross("/api/intelligence/operations-review", mergeOperationsReadings, o.family) },
        { label: "القرارات المفتوحة", run: () => readAcross("/api/intelligence/open-decisions", mergeDecisionReadings, o.family) },
        { label: "صحة التجربة", run: () => fetchJson(`/api/intelligence/experience-health?${analysisQuery}`) },
      ];
      const settled = await Promise.allSettled(sources.map(source => source.run()));
      if (serial !== reloadSerial.current) return;
      const valueAt = (index: number) => settled[index].status === "fulfilled" ? (settled[index] as PromiseFulfilledResult<any>).value : null;
      const failedAt = settled.map((item, index) => item.status === "rejected" ? index : -1).filter(index => index >= 0);
      failedAt.forEach(index => console.warn("[intelligence] secondary reading failed:", sources[index].label, (settled[index] as PromiseRejectedResult).reason));
      setDegraded(failedAt.length ? {
        sources: failedAt.map(index => sources[index].label),
        info: classifyActionableError((settled[failedAt[0]] as PromiseRejectedResult).reason),
      } : null);
      setPartialSources(partialPaths.current.has("/api/intelligence/versions") ? ["النسخ"] : []);
      const [d, v, g, cx, ops, decisions, ux] = sources.map((_, index) => valueAt(index));
      setDrafts(Array.isArray(d) ? d : []);
      setOverview((current: any) => current ? {...current, draftCount: Array.isArray(d) ? d.filter((draft:any) => draft.status === "draft").length : 0} : current);
      setVersions(Array.isArray(v) ? v : []);
      setGenome(g);
      setConstraints(Array.isArray(cx) ? cx : []);
      setOperationsReview(ops);
      setDecisionInbox(decisions || {manual:[],inferred:[],totalOpen:0});
      setExperienceHealth(ux);
      setVersionScrubIndex(Math.max(0,(Array.isArray(v)?v.length:0)-1));
    } catch (e: any) {
      if (serial === reloadSerial.current) fail(e, () => void reload());
    } finally {
      if (!painted && serial === reloadSerial.current) setLoading(false);
    }
  };
  const previousReadingMode = useRef(readingMode);
  useEffect(() => {
    if (previousReadingMode.current === readingMode) return;
    previousReadingMode.current = readingMode;
    reloadSerial.current++;
    setChat([]); setTermCompare(null); setVersionCompare(null); setVersionFrom(""); setVersionTo("");
    if (collegeId && sectionId && termId) void reload();
  }, [readingMode]);
  useEffect(() => {
    setScenario(null);
    setScenarioEval(null);
    setActiveDraftId(null);
    setVersionCompare(null);
    setDetail(null);
    setWarRoom(null);
    setAutopilot(null);
    setWarRowId("");
    if (collegeId && sectionId && termId) {
      void reload();
    } else {
      // An incomplete scope is a true idle state, never the previous scope
      // dimmed behind empty selectors. This also removes the visual flash that
      // used to occur while switching college/term.
      // A permission error from the previous scope must not survive into it
      // either: the empty-scope screen was showing a red «خارج صلاحيات الأقسام»
      // above «اختر الكلية والفصل», turning an ordinary starting state into an
      // apparent failure.
      setError(null);
      setOverview(null);
      setRows([]);
      setDrafts([]);
      setVersions([]);
      setGenome(null);
      setConstraints([]);
      setOperationsReview(null);
      setDecisionInbox({ manual: [], inferred: [], totalOpen: 0 });
      setExperienceHealth(null);
    }
  }, [collegeId, sectionId, termId]);
  useEffect(() => {
    const index = pendingCopilotAnswer.current;
    if (index == null || chat.length <= index) return;
    const frame = window.requestAnimationFrame(() => {
      const thread = copilotThread.current;
      const answer = thread?.querySelector<HTMLElement>(`[data-copilot-answer="${index}"]`);
      if (!thread || !answer) return;
      const threadBox = thread.getBoundingClientRect();
      const answerBox = answer.getBoundingClientRect();
      const nextTop = Math.max(0, thread.scrollTop + answerBox.top - threadBox.top - 12);
      thread.scrollTo({
        top: nextTop,
        behavior: reduceMotion.current ? "auto" : "smooth",
      });
      // Keep keyboard/screen-reader focus with the answer without asking the
      // browser to scroll the document itself. `preventScroll` is essential:
      // scrollIntoView on this nested chat was the reason the whole page used
      // to jump to its bottom.
      answer.focus({ preventScroll: true });
      pendingCopilotAnswer.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chat.length]);
  const detailOpen = Boolean(detail);
  useEffect(() => {
    if (!detailOpen) return;
    drawerReturnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => drawerClose.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      drawerReturnFocus.current?.focus();
      drawerReturnFocus.current = null;
    };
  }, [detailOpen]);
  useEffect(()=>{if(versions.length>=2){setVersionFrom(v=>v||String(versions[1].id));setVersionTo(v=>v||String(versions[0].id));}},[versions]);
  useEffect(() => {
    if (!scenario) return;
    const timer = window.setTimeout(async () => {
      try {
        const d = await fetchJson("/api/intelligence/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collegeId,
            sectionId,
            termId,
            rows: scenario,
          }),
        });
        setScenarioEval(d);
      } catch (e: any) {
        fail(e);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [scenario, collegeId, sectionId, termId]);
  const heatData =
    heatMode === "university"
      ? overview?.universityHeatmap || []
      : overview?.heatmap || [];
  const heatMax = Math.max(1, ...heatData.map((x: any) => x.count));
  // Only the hours that carry teaching. A campus that finishes at noon should
  // not read its density map through nine empty rows.
  const heatTimes = useMemo(() => {
    const all = Array.from(new Set(heatData.map((x: any) => x.time))).sort() as string[];
    const busy = new Set(heatData.filter((x: any) => Number(x.count) > 0).map((x: any) => x.time));
    if (!busy.size) return all;
    const first = all.findIndex((time) => busy.has(time));
    let last = all.length - 1;
    while (last > first && !busy.has(all[last])) last -= 1;
    return all.slice(Math.max(0, first - 1), Math.min(all.length, last + 2));
  }, [heatData]);
  const selectedScenario = useMemo(
    () => scenario?.find((r) => r.id === Number(scenarioId)) || null,
    [scenario, scenarioId],
  );
  const twinSlots = useMemo(
    () =>
      Array.from({ length: 21 }, (_, i) => {
        const mins = 8 * 60 + i * 30;
        return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      }),
    [],
  );
  const originalById = useMemo(
    () => new Map(rows.map((r) => [r.id, r])),
    [rows],
  );
  const changedRows = useMemo(
    () =>
      !scenario
        ? []
        : scenario.filter((r) => {
            const o = originalById.get(r.id);
            return (
              !o ||
              o.fstarttime !== r.fstarttime ||
              o.fendtime !== r.fendtime ||
              o.AdRoomCode !== r.AdRoomCode ||
              o.AdRoomHall !== r.AdRoomHall ||
              o.fsunday !== r.fsunday ||
              o.fmonday !== r.fmonday ||
              o.ftuesday !== r.ftuesday ||
              o.fwednesday !== r.fwednesday ||
              o.fthursday !== r.fthursday
            );
          }),
    [scenario, originalById],
  );
  const twinTime = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const moveTwinTime = (id: number, start: string) => {
    if (!scenario) return;
    const row = scenario.find((r) => r.id === id);
    if (!row) return;
    const duration = Math.max(
      30,
      twinMinutes(row.fendtime) - twinMinutes(row.fstarttime),
    );
    const startMinutes = twinMinutes(start);
    setScenario(
      (s) =>
        s?.map((r) =>
          r.id === id
            ? {
                ...r,
                fstarttime: start,
                fendtime: twinTime(startMinutes + duration),
              }
            : r,
        ) || null,
    );
    setScenarioId(id);
  };
  const readinessLabel =
    overview?.readiness === "ready"
      ? "جاهز للاعتماد"
      : overview?.readiness === "review"
        ? "جاهز بعد مراجعة"
        : overview?.readiness === "blocked"
          ? "يوجد ما يمنع الاعتماد"
          : "يحتاج تحسين";
  const sendCopilot = async (text = prompt) => {
    const q = text.trim();
    if (!q) return;
    // There is only one request at a time. Capture the exact slot that will
    // receive this answer so the question can hand the reader to that answer,
    // not to the bottom of the document.
    const requestSerial = reloadSerial.current;
    pendingCopilotAnswer.current = chat.length;
    setBusy(true);
    setError(null);
    setPrompt("");
    try {
      // Idea 3: an imperative like "انقل 101 إلى 11:00" becomes a previewed move,
      // not just an answer. Everything else stays a normal read-only question.
      if (parseNaturalQuery(q).intent === "move") {
        if (readingMode === "department") {
          setAnalysisScope("college");
          setPrompt(q); pendingCopilotAnswer.current = null;
          setMessage("اختر كلية الموعد ثم أرسل أمر النقل.");
          return;
        }
        const move = await fetchJson("/api/intelligence/nl-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collegeId, sectionId, termId, q }),
        });
        if (requestSerial !== reloadSerial.current) return;
        setChat((p) => [...p, { prompt: q, move } as any]);
        return;
      }
      const answer = await fetchJson("/api/intelligence/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, prompt: q, analysisScope: readingMode }),
      });
      if (requestSerial !== reloadSerial.current) return;
      setChat((p) => [...p, { prompt: q, answer }]);
    } catch (e: any) {
      pendingCopilotAnswer.current = null;
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  // Applying a previewed natural-language move is a second, deliberate press —
  // the same atomic door as a drag, so the same conflict rules protect it.
  const applyMove = async (mv: any, index: number) => {
    if (!mv?.move) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/schedules/move-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strict: false, moves: [mv.move] }),
      });
      setChat((p) => p.map((item, i) => (i === index ? ({ ...item, move: { ...(item as any).move, applied: true } } as any) : item)));
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const evaluateScenario = async (next = scenario) => {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      setScenarioEval(
        await fetchJson("/api/intelligence/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collegeId, sectionId, termId, rows: next }),
        }),
      );
    } catch (e: any) {
      fail(e);
      if (e.issues) setMessage(e.issues.slice(0, 3).join(" · "));
    } finally {
      setBusy(false);
    }
  };
  const startTwin = async () => {
    const copy = rows.map((r) => ({ ...r }));
    setActiveDraftId(null);
    setScenario(copy);
    setScenarioId(copy[0]?.id || "");
    await evaluateScenario(copy);
    setTwinCard("board");
  };
  const autoSchedule = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await fetchJson("/api/intelligence/auto-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId }),
      });
      /* An empty term answers with the way forward, not with rows. */
      if (d?.empty) { setMessage(d.message); return; }
      setActiveDraftId(null);
      setScenario(d.rows);
      setScenarioEval({ baseline: d.before, scenario: d.after });
      setScenarioId(d.rows[0]?.id || "");
      setMessage(d.summary);
      setTab("twin");
      setTwinCard("board");
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  /**
   * Take a student-clash proposal into the trial copy — applied, not saved.
   *
   * The engine's answer stops at "this would work"; a person still decides. So
   * the press lands where deciding is safe: a duplicate week with the move
   * already made, the before/after score beside it, and publishing behind the
   * two doors it has always been behind. The real schedule is untouched until
   * somebody saves a draft and publishes it.
   */
  /**
   * Open a proposed section inside the trial copy — added, not saved.
   *
   * Same doctrine as every other proposal here: the engine's answer ends at
   * "this would fit". The row appears in the duplicate week with a negative id
   * so nothing can mistake it for something the database has seen, and it stays
   * a draft until a person saves and publishes it.
   */
  const openSectionDraft = async (proposal: any, slot: any) => {
    if (!enterSourceScope(proposal, "opening", slot)) return;
    const base = (scenario || rows).map(row => ({ ...row }));
    const sibling = base.find(row => Number(row.AdCourseId) === Number(proposal.courseId)) || base[0];
    if (!sibling) return;
    const fresh: any = {
      ...sibling,
      AdCourseId: Number(proposal.courseId), AdCourseName: proposal.courseName,
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
      id: -Math.abs(Date.now() % 100000) - proposal.courseId,
      // Comes from the engine: the save path refuses anything non-numeric.
      SCode: String(slot.sectionCode || proposal.openSections + slot.index),
      AdRoomCode: slot.roomCode,
      AdRoomHall: slot.roomHall,
      buildingId: slot.buildingId,
      roomId: slot.roomId,
      locationStatus: slot.buildingId && slot.roomId ? "VERIFIED" : undefined,
      AdInstructorId: slot.instructorId || 0,
      fstarttime: slot.start,
      fendtime: slot.end,
      fsunday: slot.day === "fsunday",
      fmonday: slot.day === "fmonday",
      ftuesday: slot.day === "ftuesday",
      fwednesday: slot.day === "fwednesday",
      fthursday: slot.day === "fthursday",
    };
    const applied = [...base, fresh];
    setActiveDraftId(null);
    setScenario(applied);
    setScenarioId(fresh.id);
    setTab("twin");
    showTwinCard("editor");
    setMessage(
      `أُضيفت شعبة «${proposal.courseName}» داخل النسخة التجريبية فقط: ${slot.dayLabel} ${scheduleClockForDisplay(slot.start)}` +
      `${slot.roomCode ? ` · ${slot.roomCode}${slot.roomHall ? "/" + slot.roomHall : ""}` : ""}. ` +
      (slot.instructorId ? "" : "اختر لها أستاذاً. ") +
      "لا شيء منشور — راجعها ثم احفظها كمسودة.",
    );
    await evaluateScenario(applied);
  };

  const openRepair = async (fix: any) => {
    if (!enterSourceScope(fix, "repair")) return;
    const base = (scenario || rows).map(row => ({ ...row }));
    const moves = [fix, ...(fix.swapWith ? [fix.swapWith] : [])];
    const byId = new Map(moves.map((move: any) => [Number(move.rowId), move.to]));
    const applied = base.map(row => {
      const to: any = byId.get(Number(row.id));
      return to ? {
        ...row,
        fsunday: to.day === "fsunday",
        fmonday: to.day === "fmonday",
        ftuesday: to.day === "ftuesday",
        fwednesday: to.day === "fwednesday",
        fthursday: to.day === "fthursday",
        fstarttime: to.start,
        fendtime: to.end,
      } : row;
    });
    setActiveDraftId(null);
    setScenario(applied);
    setScenarioId(fix.rowId);
    setTab("twin");
    showTwinCard("editor");
    setMessage(
      `${fix.swapWith ? "طُبِّق تبديل الموعدين" : "طُبِّقت النقلة"} داخل النسخة التجريبية فقط: «${fix.courseName}» إلى ${fix.to.dayLabel} ${scheduleClockForDisplay(fix.to.start)}` +
      `${fix.swapWith ? `، و«${fix.swapWith.courseName}» إلى ${fix.swapWith.to.dayLabel} ${scheduleClockForDisplay(fix.swapWith.to.start)}` : ""}. ` +
      `أُعيد حساب جداول المشاركين. هذه معاينة محلية؛ لا تحفظ المسودة الأصلية ولا تنشر التغيير.`,
    );
    await evaluateScenario(applied);
  };

  const patchScenario = (fields: Partial<FSchedule>) => {
    if (!scenario || !selectedScenario) return;
    setScenario(
      scenario.map((r) =>
        r.id === selectedScenario.id ? { ...r, ...fields } : r,
      ),
    );
  };
  const saveDraft = async (
    source = "what-if",
    draftRows = scenario,
    customName = "",
  ) => {
    if (!draftRows) return;
    setBusy(true);
    setError(null);
    try {
      const existing =
        source === "what-if" && activeDraftId
          ? drafts.find((d) => String(d.id) === String(activeDraftId))
          : null;
      const d =
        existing && existing.status === "draft"
          ? await fetchJson(`/api/intelligence/drafts/${existing.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rows: draftRows }),
            })
          : await fetchJson("/api/intelligence/drafts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                collegeId,
                sectionId,
                termId,
                source,
                name:
                  customName ||
                  `${source === "auto" ? "اقتراح تلقائي" : "سيناريو"} — ${new Date().toLocaleString("ar-KW-u-nu-latn")}`,
                rows: draftRows,
              }),
            });
      setActiveDraftId(String(d.id));
      setMessage(
        existing
          ? `تم تحديث «${d.name}» داخل المسودة المشتركة للقسم. الجدول الفعلي لم يتغير.`
          : `تم حفظ «${d.name}» كمسودة مشتركة للقسم، ولم يتغير الجدول الفعلي.`,
      );
      await reload();
      return d;
    } catch (e: any) {
      setError(smartMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const openDraft = async (d: any) => {
    if (!enterSourceScope(d, "draft")) return;
    const draftRows = Array.isArray(d?.rows) ? d.rows.map((r:any)=>({...r})) : [];
    if (!draftRows.length) { setError("هذه المسودة لا تحتوي مواعيد قابلة للفتح."); return; }
    setActiveDraftId(String(d.id));
    setScenario(draftRows);
    setScenarioId(draftRows[0]?.id || "");
    setTab("twin");
    setTwinCard("board");
    await evaluateScenario(draftRows);
  };
  const publishDraft = async (d: any) => {
    if (!enterSourceScope(d, "publish")) return;
    if (!online) {
      setError("النشر متوقف أثناء عدم الاتصال لحماية الجدول.");
      return;
    }
    // One deliberate click publishes. The server always captures a rollback
    // point first, so a browser-native confirmation dialog adds friction but
    // no extra safety — and on iOS it can be suppressed permanently.
    setBusy(true);
    try {
      /* A draft saved earlier may be published over edits made since; the
         server names them and this asks before erasing them. */
      const published = await applyWithOverwriteConfirm("publish",
        confirm => fetchJson(`/api/intelligence/drafts/${d.id}/publish`, {
          method: "POST",
          headers: { "x-schedule-confirm": confirm },
        }),
        options => visualConfirm(options));
      if (published === null) return;
      setMessage("تم النشر بنجاح، وحُفظت نسخة زمنية قبل التغيير.");
      /* «تراجع عن النشر» (من «بداية الفصل»): النسخةُ التي أخذها الخادمُ قبل النشر. */
      const undoIds = Array.isArray(published?.undoVersions) ? published.undoVersions.map((id: unknown) => String(id || "")).filter(Boolean) : [];
      setPublishUndo(undoIds.length ? { points: undoIds.map((id: string) => ({ id })), draftName: String(d.name || "المسودة") } : null);
      setScenario(null);
      setScenarioEval(null);
      setActiveDraftId(null);
      await reload();
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  /* تراجعٌ إلى نقطة أمان («شبكة الأمان» سابقاً): يأخذ هو نفسه نسخةً قبل الاسترجاع، فيبقى قابلاً للتراجع. */
  const undoToSafetyPoint = async (point: any, after?: () => void) => {
    if (!point?.id) return;
    setBusy(true);
    try {
      const d = await applyWithOverwriteConfirm("decision-undo",
        confirm => fetchJson(`/api/intelligence/safety-net/${encodeURIComponent(String(point.id))}/undo`, {
          method: "POST",
          headers: { "x-schedule-confirm": confirm },
        }),
        options => visualConfirm(options));
      if (d === null) return;
      setMessage(d.message || "تم الاسترجاع.");
      after?.();
      await reload();
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  /* «تراجع عن النشر»: كلُّ نسخةٍ أُخذت قبل النشر (موقعٌ لكلٍّ منها) تُسترجع بالترتيب؛ ورفضُ التأكيد يوقف ما بعده. */
  const undoPublishPoints = async (points: Array<{ id: string }>, after?: () => void) => {
    if (!points.length) return;
    setBusy(true);
    let restored = 0;
    try {
      for (const point of points) {
        const d = await applyWithOverwriteConfirm("decision-undo",
          confirm => fetchJson(`/api/intelligence/safety-net/${encodeURIComponent(String(point.id))}/undo`, {
            method: "POST",
            headers: { "x-schedule-confirm": confirm },
          }),
          options => visualConfirm(options));
        if (d === null) break;
        restored += 1;
      }
      if (restored === points.length) { setMessage("تم التراجع عن النشر في كل المواقع."); after?.(); }
      else if (restored) setMessage(`تم التراجع في ${restored} من ${points.length} من مواقع النشر؛ البقية لم تُسترجع.`);
      if (restored) await reload();
    } catch (e: any) {
      fail(e);
      if (restored) await reload();
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (approveCard !== "versions" || !isPowerAdmin || !collegeId || !sectionId || !termId) return;
    let live = true;
    fetchJson(`/api/intelligence/safety-net?${new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId) })}`)
      .then((points: any) => { if (live && Array.isArray(points)) setSafetyPoints(new Map(points.map((item: any) => [String(item.id), item]))); })
      .catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveCard, isPowerAdmin, collegeId, sectionId, termId, versions.length]);
  const restoreVersion = async (v: any) => {
    if (!enterSourceScope(v, "restore")) return;
    // Restore is itself versioned before it runs, so it is reversible without
    // relying on a native confirm dialog.
    setBusy(true);
    try {
      const restored = await applyWithOverwriteConfirm("restore",
        confirm => fetchJson(`/api/intelligence/versions/${v.id}/restore`, {
          method: "POST",
          headers: { "x-schedule-confirm": confirm },
        }),
        options => visualConfirm(options));
      if (restored === null) return;
      setMessage("تم الاسترجاع، والنسخة التي كانت قبل الاسترجاع محفوظة أيضاً.");
      await reload();
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const compareVersionPair = async (fromId: string, toId: string, quiet = false) => {
    if (!fromId || !toId || fromId === toId) return;
    const fromVersion = versions.find(v => v.id === fromId), toVersion = versions.find(v => v.id === toId);
    if (!fromVersion || !toVersion || !sameIntelligenceScope(sourceScope(fromVersion), sourceScope(toVersion))) {
      if (!quiet) setError("اختر نسختين من الكلية نفسها.");
      return;
    }
    if (!quiet) setBusy(true);
    try {
      setVersionCompare(await fetchJson(`/api/intelligence/versions/compare?fromId=${encodeURIComponent(fromId)}&toId=${encodeURIComponent(toId)}`));
      setVersionFrom(fromId); setVersionTo(toId); setTimeTravel(50);
    } catch (e: any) {
      if (!quiet) fail(e);
    } finally {
      if (!quiet) setBusy(false);
    }
  };
  const compareVersions = async () => {
    if (!versionFrom || !versionTo) { setError("اختر نسختين للمقارنة."); return; }
    if (versionFrom === versionTo) { setError("اختر نسختين مختلفتين للمقارنة."); return; }
    await compareVersionPair(versionFrom, versionTo);
  };
  useEffect(() => {
    if (approveCard !== "versions" || versions.length < 2) return;
    const chronological=[...versions].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    const index=Math.max(1,Math.min(chronological.length-1,versionScrubIndex));
    const timer=window.setTimeout(()=>{void compareVersionPair(String(chronological[index-1].id),String(chronological[index].id),true);},220);
    return()=>window.clearTimeout(timer);
  },[versionScrubIndex,approveCard,versions.length]);
  const addOpenDecision = async () => {
    const title=decisionTitle.trim(); if(title.length<3)return;
    setBusy(true);
    try{
      await fetchJson("/api/intelligence/open-decisions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionId,termId,title,priority:"medium",source:"manual"})});
      setDecisionTitle("");setDecisionCompose(false);
      setDecisionInbox(await refreshDecisionInbox());
    }catch(e:any){fail(e);}finally{setBusy(false);}
  };
  const closeOpenDecision = async (item:any) => {
    if(!item?.id||String(item.id).startsWith("inferred:"))return;
    try{
      await fetchJson(`/api/intelligence/open-decisions/${encodeURIComponent(item.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId:sourceScope(item).collegeId,sectionId:sourceScope(item).sectionId,termId,status:item.status==="done"?"open":"done"})});
      setDecisionInbox(await refreshDecisionInbox());
    }catch(e:any){fail(e);}
  };
  const proposeUnwrittenRule = async (rule:any) => {
    if (!enterSourceScope(rule, "rule")) return;
    if(!rule?.title)return;
    setBusy(true);
    try{
      await fetchJson("/api/intelligence/open-decisions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionId,termId,title:`قاعدة مقترحة: ${String(rule.title).slice(0,110)}`,detail:`مكتشفة من التاريخ بثقة ${Number(rule.confidence||0)}% · ${String(rule.detail||"").slice(0,220)}`,priority:Number(rule.confidence||0)>=90?"high":"medium",source:"assistant"})});
      setDecisionInbox(await refreshDecisionInbox());
      setMessage("أُضيفت القاعدة المقترحة إلى دفتر القرارات للمراجعة.");
    }catch(e:any){fail(e);}finally{setBusy(false);}
  };
  const runPolicy = async () => {
    setPolicyBusy(true);setError(null);
    try{
      setPolicyResult(await fetchJson("/api/intelligence/policy-simulate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionId,termId,...policyDraft,analysisScope:policyDraft.scope === "family" ? "department" : "college",scope:policyDraft.scope === "university" && isPowerAdmin ? "university" : "department"})}));
    }catch(e:any){fail(e);}finally{setPolicyBusy(false);}
  };
  /* قائمتا المقارنة: فصولٌ فيها بيانات في النطاق الذي تقرؤه المقارنة نفسه — وفي قراءة «القسم كله» تقرأ كل مواقعه، فيُسأل عن نطاق القارئ كله. */
  const compareFamily = readingMode === "department";
  const compareTermOptions = useScopedTerms<AdTerm>(terms, collegeId, sectionId, 0, undefined, compareFamily ? "department" : "college");
  useEffect(() => {
    if (compareTermOptions.length < 2) setApproveCard(current => current === "compare" ? null : current);
  }, [compareTermOptions.length]);
  /* اختيارٌ خارج المرشَّح (افتراضيٌّ فارغ أو قديمٌ من نطاق سابق) يُستبدل حين يصل الجواب بدل أن يبقى في القائمة. */
  useEffect(() => {
    if (compareTermOptions.length < 1) return;
    const ids = compareTermOptions.map(t => Number(t.AdTermId));
    const ordered = sortTermsNewest(compareTermOptions).map(t => Number(t.AdTermId));
    if (compareTo && !ids.includes(Number(compareTo))) setCompareTo(ordered[0] || 0);
    if (compareFrom && !ids.includes(Number(compareFrom))) setCompareFrom(ordered[1] || ordered[0] || 0);
  }, [compareTermOptions, compareFrom, compareTo]);
  const compareTerms = async () => {
    if (!compareFrom || !compareTo || compareFrom === compareTo) return; // مقارنةُ فصلٍ بنفسه بلا معنى
    setBusy(true);
    try {
      const p = new URLSearchParams({
        collegeId: String(collegeId),
        sectionId: String(sectionId),
        analysisScope: readingMode,
        fromTermId: String(compareFrom),
        toTermId: String(compareTo),
      });
      setTermCompare(await fetchJson(`/api/intelligence/compare-terms?${p}`));
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const scopedCourses = useMemo(
    () => sortByName(
      courses.filter((c) => c.AdCollegeId === collegeId && c.AdSectionId === sectionId),
      (c: any) => c.CourseName,
    ),
    [courses, collegeId, sectionId],
  );
  const reloadConstraints = async () =>
    setConstraints(
      await fetchJson(`/api/intelligence/constraints?${contextQuery}`),
    );
  const createConstraint = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/intelligence/constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          termId,
          ...constraintDraft,
        }),
      });
      await reloadConstraints();
      setMessage(
        "تمت إضافة القاعدة إلى لوحة القيود. ستدخل فوراً في تقييم النسخة التجريبية وغرفة القرار والتحسين الآلي.",
      );
    } catch (e: any) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const toggleConstraint = async (c: any) => {
    try {
      await fetchJson(`/api/intelligence/constraints/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          termId,
          enabled: !c.enabled,
        }),
      });
      await reloadConstraints();
    } catch (e: any) {
      fail(e);
    }
  };
  const deleteConstraint = async (c: any) => {
    if (!(await visualConfirm({ title: `حذف القاعدة «${c.label}»`, message: "ستُحذف هذه القاعدة من لوحة القيود.", confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    try {
      await fetchJson(`/api/intelligence/constraints/${c.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId }),
      });
      await reloadConstraints();
    } catch (e: any) {
      fail(e);
    }
  };
  const runWarRoom = async () => {
    setWarBusy(true);
    setError(null);
    try {
      const room = await fetchJson("/api/intelligence/war-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          termId,
          rowId: warRowId || undefined,
        }),
      });
      if (room?.empty) { setWarRoom(null); setMessage(room.message); }
      else setWarRoom(room);
    } catch (e: any) {
      fail(e);
    } finally {
      setWarBusy(false);
    }
  };
  const runAutopilot = async () => {
    setAutopilotBusy(true);
    setError(null);
    try {
      const plan = await fetchJson("/api/intelligence/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          termId,
          goal: autopilotGoal,
        }),
      });
      if (plan?.empty) { setAutopilot(null); setMessage(plan.message); }
      else setAutopilot(plan);
    } catch (e: any) {
      fail(e);
    } finally {
      setAutopilotBusy(false);
    }
  };
  const openScenarioOption = async (option: any) => {
    setActiveDraftId(null);
    setScenario(option.rows.map((r: any) => ({ ...r })));
    setScenarioId(option.rows[0]?.id || "");
    setInnovationMode("constraints");
    await evaluateScenario(option.rows);
    setTwinCard("board");
  };
  const saveOptionAsDraft = async (option: any, label: string) => {
    const d = await saveDraft(
      "auto",
      option.rows,
      `${label} — ${new Date().toLocaleString("ar-KW-u-nu-latn")}`,
    );
    if (d)
      setMessage(
        `${label} أصبح مسودة فقط. لم يُنشر أي تغيير على الجدول الحقيقي.`,
      );
  };

  const openScheduleWorkspace = (message?: string) => {
    if (message) sessionStorage.setItem("schedule-return-note", message);
    sessionStorage.setItem("schedule-command", "focus");
    window.location.assign("/FSchedule/Index");
  };

  const scopedContext = resolveScopeSelection(scopes, collegeId, isPowerAdmin);
  const contextColleges = isPowerAdmin ? colleges : colleges.filter((college) => resolveScopeSelection(scopes, 0, false).collegeIds.includes(Number(college.AdCollegeId)));
  const contextBar = (
    <IntelligenceContextBar
      collegeId={collegeId}
      sectionId={sectionId}
      termId={termId}
      colleges={contextColleges}
      sections={sections}
      availableSections={availableSections}
      terms={terms}
      online={online}
      hideCollege={hidesCollege(scopeShape(scopes, isPowerAdmin))}
      lockSection={singleDepartmentOf(scopes, collegeId, isPowerAdmin) !== null}
      hideSection={hidesSection(scopeShape(scopes, isPowerAdmin))}
      onCollegeChange={(nextCollegeId, firstSectionId) => {
        pendingReadingAction.current = null;
        const nextSectionId = nextCollegeId ? (isPowerAdmin ? firstSectionId : (resolveScopeSelection(scopes, nextCollegeId, false).defaultSectionId || firstSectionId)) : 0;
        sharedScope.pick({ collegeId: nextCollegeId, sectionId: nextSectionId });
        setCollegeId(nextCollegeId);
        setSectionId(nextSectionId);
      }}
      onSectionChange={(nextSectionId) => { pendingReadingAction.current = null; sharedScope.pick({ sectionId: nextSectionId }); setSectionId(nextSectionId); }}
      onTermChange={(nextTermId) => { pendingReadingAction.current = null; sharedScope.pick({ termId: nextTermId }); setTermId(nextTermId); }}
    />
  );
  const scene: "understand" | "try" | "approve" =
    tab === "command" || tab === "copilot"
      ? "understand"
      : tab === "history"
        ? "approve"
        : "try";
  /* تبديلُ المرحلة أو أداتِها يغلق البطاقة المفتوحة: المرحلةُ الجديدة تبدأ من شبكتها.
     أمّا الانتقالُ من داخل بطاقةٍ («افتحها في النسخة التجريبية»، «اسأل المساعد»…)
     فيضبط بطاقة الوجهة بنفسه، والرجوعُ في المتصفح يعيد إلى البطاقة التي أرسلته. */
  const switchTab = (next: Tab) => {
    setInsightScene(null);
    setTwinCard(null);
    setApproveCard(null);
    setTab(next);
  };
  const changeScene = (value: string) =>
    switchTab(
      value === "understand" ? "command" : value === "try" ? "twin" : "history",
    );

  const intelligenceGuideTask = useMemo(() => tab === "copilot" ? ({
    title: "اسأل الجدول",
    featureId: "intelligence.ask-table",
    target: "intelligence.ask-table",
    command: { scope: "intelligence", type: "tab", value: "copilot" },
  }) : ({
    title: scene === "understand" ? "فهم حالة الجدول" : scene === "try" ? "تجربة السيناريو" : "سجل القرار",
    featureId: scene === "understand" ? "intelligence.scene.understand" : scene === "try" ? "intelligence.scene.try" : "intelligence.scene.approve",
    target: scene === "understand" ? "intelligence.scene.understand" : scene === "try" ? "intelligence.scene.try" : "intelligence.scene.approve",
    command: { scope: "intelligence", type: "scene", value: scene },
  }), [scene, tab]);
  const intelligenceGuideSummary = !collegeId || !termId
    ? "اختر الكلية والفصل أولًا ليبدأ مركز الذكاء في القراءة والتجربة والاعتماد."
    : scene === "understand"
      ? "أنت الآن داخل «افهم» لقراءة الجودة والضغط والأسئلة الذكية."
      : scene === "try"
        ? "أنت الآن داخل «جرّب» لتجربة ماذا لو؟ دون لمس الجدول الحقيقي."
        : "أنت الآن داخل «السجل»: المسودات والنشر، وسجل النسخ واسترجاعها، ودفتر القرار.";
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("schedule-smart-guide-context", {
      detail: {
        scope: "intelligence",
        view: "intelligence",
        title: "مركز الذكاء",
        collegeId: collegeId || undefined,
        sectionId: sectionId || undefined,
        termId: termId || undefined,
        currentFeatureId: tab === "copilot" ? "intelligence.ask-table" : scene === "understand" ? "intelligence.scene.understand" : scene === "try" ? "intelligence.scene.try" : "intelligence.scene.approve",
        summary: intelligenceGuideSummary,
        placeLabel: scene === "understand" ? "افهم" : scene === "try" ? "جرّب" : "السجل",
        stageLabel: scene === "understand" ? "افهم" : scene === "try" ? "جرّب" : "السجل",
        scopeLabel: [colleges.find(item => item.AdCollegeId === collegeId)?.AdCollegeName, terms.find(item => item.AdTermId === termId)?.AdTermName].filter(Boolean).join(" · "),
        whatHappens: intelligenceGuideSummary,
        currentTask: intelligenceGuideTask,
        metrics: { isExpert: false },
        detectedHelp: !collegeId || !termId
          ? {
              title: "ابدأ من النطاق أولًا",
              detail: "اختر الكلية والفصل، وبعد ذلك سيعرف المرشد ما الذي يعرضه لك في هذا المركز.",
              level: "soft",
            }
          : null,
      },
    }));
  }, [collegeId, colleges, intelligenceGuideSummary, intelligenceGuideTask, scene, sectionId, tab, termId, terms]);
  useEffect(() => {
    const onGuideCommand = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.scope !== "intelligence") return;
      const featureId = String(detail.featureId || "");
      if (detail.type === "scene" && detail.value) {
        const value=String(detail.value);
        if (featureId) intelligenceGuideOperationRef.current={ featureId, transactionId:detail.transactionId ? String(detail.transactionId) : undefined, startedAt:Date.now(), expected:value === "understand" ? "intelligence.scene.understand" : value === "try" ? "intelligence.scene.try" : "intelligence.scene.approve" };
        changeScene(value);
      }
      /* «مركز القرار» صار بطاقاتٍ هنا: المرشدُ يفتح البطاقة نفسها (stage:card). */
      if (detail.type === "card" && detail.value) {
        const [stage, card] = String(detail.value).split(":") as [Tab, string];
        if (TAB_VALUES.includes(stage)) {
          setInsightScene(stage === "command" && INSIGHT_SCENE_VALUES.includes(card as InsightScene) ? card as InsightScene : null);
          setTwinCard(stage === "twin" && TWIN_CARD_VALUES.includes(card as TwinCard) ? card as TwinCard : null);
          setApproveCard(stage === "history" && APPROVE_CARD_VALUES.includes(card as ApproveCard) ? card as ApproveCard : null);
          setTab(stage);
          if (featureId) window.dispatchEvent(new CustomEvent("schedule-smart-guide-action-result",{detail:{featureId,ok:true,signal:featureId,transactionId:detail.transactionId,durationMs:0,stepCount:1}}));
        }
      }
      if (detail.type === "tab" && detail.value && ["command","copilot","twin","whatif","history"].includes(String(detail.value))) {
        const value=String(detail.value);
        if (featureId) intelligenceGuideOperationRef.current={ featureId, transactionId:detail.transactionId ? String(detail.transactionId) : undefined, startedAt:Date.now(), expected:value === "copilot" ? "intelligence.ask-table" : featureId };
        setTab(value as Tab);
      }
    };
    window.addEventListener("schedule-smart-guide-command", onGuideCommand as EventListener);
    return () => window.removeEventListener("schedule-smart-guide-command", onGuideCommand as EventListener);
  }, []);
  useEffect(() => {
    const operation=intelligenceGuideOperationRef.current;
    if(!operation)return;
    const current=tab === "copilot" ? "intelligence.ask-table" : scene === "understand" ? "intelligence.scene.understand" : scene === "try" ? "intelligence.scene.try" : "intelligence.scene.approve";
    if(current!==operation.expected)return;
    intelligenceGuideOperationRef.current=null;
    window.dispatchEvent(new CustomEvent("schedule-smart-guide-action-result",{detail:{featureId:operation.featureId,ok:true,signal:current,transactionId:operation.transactionId,durationMs:Date.now()-operation.startedAt,stepCount:1}}));
  }, [scene,tab]);
  useEffect(() => {
    if (!rows.length || !collegeId || !termId) return;
    let request: any = null;
    try { request = JSON.parse(sessionStorage.getItem("schedule-guide-simulation") || "null"); } catch {}
    if (!request || Date.now() - Number(request.createdAt || 0) > 10 * 60 * 1000) return;
    try { sessionStorage.removeItem("schedule-guide-simulation"); } catch {}
    const run = async () => {
      const copy = rows.map((row) => ({ ...row }));
      const requestedId = Number(request.selectedId || 0);
      const selectedId = requestedId && copy.some(row => Number(row.id) === requestedId) ? requestedId : Number(copy[0]?.id || 0);
      const index = copy.findIndex(row => Number(row.id) === selectedId);
      const before = index >= 0 ? { ...copy[index] } : null;
      const intent = request.intent || {};
      if (before && index >= 0) {
        const after:any = { ...before };
        const day = String(intent?.entities?.day || "");
        if (["fsunday","fmonday","ftuesday","fwednesday","fthursday"].includes(day)) {
          ["fsunday","fmonday","ftuesday","fwednesday","fthursday"].forEach(key => { after[key] = key === day; });
        }
        const time = String(intent?.entities?.time || "");
        if (/^\d{2}:\d{2}$/.test(time)) {
          const toMinutes = (value:string) => { const [h,m]=String(value||"0:0").split(":").map(Number); return h*60+m; };
          const fromMinutes = (value:number) => `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
          const duration = Math.max(30, toMinutes(before.fendtime) - toMinutes(before.fstarttime));
          after.fstarttime = time;
          after.fendtime = fromMinutes(Math.min(23*60+59, toMinutes(time) + duration));
        }
        if (intent?.entities?.room) after.AdRoomCode = String(intent.entities.room);
        if (intent?.constraints?.findAlternativeRoom && !intent?.entities?.room) {
          const activeDays = ["fsunday","fmonday","ftuesday","fwednesday","fthursday"].filter(key => Boolean(after[key]));
          const toMinutes = (value:string) => { const [h,m]=String(value||"0:0").split(":").map(Number); return h*60+m; };
          const start = toMinutes(after.fstarttime);
          const end = toMinutes(after.fendtime);
          const unique = new Map<string,{key:string;code:string;hall:string;buildingId:string;roomId:string}>();
          (overview?.rooms || []).forEach((room:any) => {
            const code=String(room?.code||"").trim(), hall=String(room?.hall||"").trim(), buildingId=String(room?.buildingId||""), roomId=String(room?.roomId||"");
            if(code&&hall&&buildingId&&roomId) unique.set(`id:${roomId}`,{key:`id:${roomId}`,code,hall,buildingId,roomId});
          });
          copy.forEach((row:any) => {
            const code=String(row?.AdRoomCode||"").trim(), hall=String(row?.AdRoomHall||"").trim(), buildingId=String(row?.buildingId||""), roomId=String(row?.roomId||"");
            if(code&&hall&&buildingId&&roomId) unique.set(`id:${roomId}`,{key:`id:${roomId}`,code,hall,buildingId,roomId});
          });
          const occupied = (room:{key:string;code:string;hall:string;buildingId:string;roomId:string}) => copy.some((row:any,rowIndex:number) => {
            if(rowIndex===index) return false;
            if(roomIdentityKey(row)!==room.key) return false;
            if(!activeDays.some(day => Boolean(row[day]))) return false;
            const rowStart=toMinutes(row.fstarttime), rowEnd=toMinutes(row.fendtime);
            return start < rowEnd && end > rowStart;
          });
          const candidates=[...unique.values()]
            .filter(room => room.key !== roomIdentityKey(before))
            .filter(room => !occupied(room))
            .sort((a,b) => {
              const aSame=a.buildingId===String(before.buildingId||"")?0:1;
              const bSame=b.buildingId===String(before.buildingId||"")?0:1;
              return aSame-bSame || byRoom(a.code, a.hall, b.code, b.hall);
            });
          if(candidates[0]) {
            after.buildingId=candidates[0].buildingId;
            after.roomId=candidates[0].roomId;
            after.AdRoomCode=candidates[0].code;
            after.AdRoomHall=candidates[0].hall;
            after.locationStatus="VERIFIED";
          }
        }
        if (Number(intent?.entities?.instructorId || 0) && !intent?.constraints?.keepInstructor) after.AdInstructorId = Number(intent.entities.instructorId);
        copy[index] = after;
        setGuideSimulationMeta({ before, after:{...after}, request });
        try { sessionStorage.setItem("schedule-guide-ghost-preview", JSON.stringify({ id:before.id, before, after, createdAt:Date.now() })); } catch {}
      }
      setActiveDraftId(null);
      setScenario(copy);
      setScenarioId(selectedId || "");
      setTab("twin");
      setTwinCard("board");
      await evaluateScenario(copy);
      const subject = String(request.selectedCourse || "").trim();
      const taskLabel = request.task === "move-room" || request.task === "schedule.action.move-room" ? "نقل القاعة" : request.task === "change-time" || request.task === "schedule.action.change-time" ? "تغيير الوقت" : request.task === "change-instructor" || request.task === "schedule.action.change-instructor" ? "تغيير الأستاذ" : "التغيير المطلوب";
      setMessage(`${subject ? `أنشأت نسخة تجريبية للمقرر «${subject}»` : "أنشأت نسخة تجريبية من الجدول"} وطبقت فيها ${taskLabel}. الجدول الحقيقي لم يتغير.`);
    };
    void run();
  }, [collegeId, overview?.rooms, rows, sectionId, termId]);
  /* ملخّصُ بطاقة «تنبّؤ الفصل القادم»: يُقرأ من الخادم (أعدادٌ فقط، من القراءة المخزَّنة نفسها) فتظهر قيمتُها قبل فتح اللوحة، ويتبع مفتاحَ الكلية/القسم. */
  const [predictSummary, setPredictSummary] = useState<{ historyTerms: number; thin: boolean; actions: number } | null>(null);
  useEffect(() => {
    if (!overview || !collegeId || !sectionId) return;
    let live = true;
    setPredictSummary(null);
    fetchJson(`/api/simulation/predictive-summary?analysisScope=${readingMode}&collegeId=${collegeId}&sectionId=${sectionId}`)
      .then(body => { if (live && body?.ready && body.summary) setPredictSummary(body.summary); })
      .catch(() => undefined);
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(overview), collegeId, sectionId, readingMode, termId]);
  const insightScenes: Array<{
    value: InsightScene;
    label: string;
    detail: string;
    metric: string;
    icon: React.ReactNode;
    advanced?: boolean;
  }> = overview
    ? [
        {
          /* «صحة الجدول»: الجودة والجاهزية، ومعها نظرةُ «مركز القرار» العامة والمرونة والعدالة —
             الحلقاتُ الثلاث فوق الجدول تفتح هذه البطاقة. */
          value: "quality",
          label: "صحة الجدول",
          detail: readinessLabel,
          metric: `${overview.score}/100`,
          icon: <Gauge />,
        },
        {
          value: "approval",
          label: "قبل الاعتماد",
          detail: "ما يمنع النشر، ومتى نُشر آخر مرة",
          /* «لا موانع» بدل شرطةٍ غامضة بعد «قبل الاعتماد»: عرضٌ فقط. */
          metric: Number(overview.blockers ?? overview.metrics?.criticalConflicts ?? 0) ? String(overview.blockers ?? overview.metrics?.criticalConflicts) : "لا موانع",
          icon: <ShieldCheck />,
        },
        {
          value: "attention",
          label: "الانتباه",
          detail: "المواضع التي تستحق قرارك أولاً",
          metric: String(overview.alerts?.length || 0),
          icon: <AlertTriangle />,
        },
        {
          value: "density",
          label: "الضغط والكثافة",
          detail: "أين يتركّز الضغط، وشكله عبر الأيام والأوقات",
          metric: String(
            Math.max(
              0,
              ...heatData.map((item: any) => Number(item.count) || 0),
            ),
          ),
          icon: <BarChart3 />,
        },
        {
          value: "why" as const,
          label: "لماذا هذا الحل؟",
          detail: "لماذا هذا البديل أفضل، ولماذا لا",
          metric: "—",
          icon: <CircleHelp />,
        },
        ...(overview.spatialBurnout
          ? [
              {
                value: "spatial" as const,
                label: "الحركة المكانية",
                detail: "راحة الانتقال بين المباني والقاعات",
                metric: `${overview.spatialBurnout.score}/100`,
                icon: <Building2 />,
                advanced: true,
              },
            ]
          : []),
        /* «القاعات» و«الأساتذة» صارتا في التقارير: نسبة الإشغال (الأكثر استخداماً ودرج القاعة)،
           والأساتذة (أطول فراغ و«شكل الأسبوع»). */
        ...(isPowerAdmin ? [{
          /* «تشخيص النظام» (كان «صحة البيانات»): الشذوذ المنطقي وصحة التجربة للإدارة الرئيسية. */
          value: "health" as const,
          label: "تشخيص النظام",
          detail: "الشذوذ، وزمن الاستجابة، وأعطال الواجهة",
          metric: experienceHealth?.score != null ? `${experienceHealth.score}/100` : String(operationsReview?.anomalies?.length || "—"),
          icon: <CheckCircle2 />,
          advanced: true,
        }] : []),
        /* «طلبات الطلاب» انتقلت كاملةً إلى «كشف التسجيل ← تحليل الطلب». */
        ...(genome
          ? [
              {
                value: "genome" as const,
                label: "بصمة القسم",
                detail: "النمط المتكرر عبر الفصول",
                metric:
                  genome.compatibility == null
                    ? "—"
                    : `${genome.compatibility}%`,
                icon: <Dna />,
                advanced: true,
              },
            ]
          : []),
        /* «الصحيفة» صارت في «أدوات الجدول ← نشر» (ScheduleTransfer) لرئيس اللجنة وإدارة النظام. */
        {
          value: "actualDemand" as const,
          label: "تخطيط الشعب",
          detail: "الخريجون أولاً ثم بقية الطلبة، من تقرير التسجيل",
          /* رقمُ البطاقة: الخريجون الذين لهم مقعد إن رُفع تقريرهم، وإلا الشعب الناقصة. */
          metric: actualDemand?.plan
            ? actualDemand.plan.graduatesServed !== null ? `${actualDemand.plan.graduatesServed}%` : `${actualDemand.plan.totals.open}`
            : actualDemand && (actualDemand.variants.general || actualDemand.variants.graduates) ? "—" : "ارفع",
          icon: <ClipboardList />,
        },
        {
          value: "improve" as const,
          label: "فرصة لتحسين الجدول",
          detail: "موعدٌ بديل يُكمل جداول الطلبة",
          metric: "—",
          icon: <Lightbulb />,
        },
        {
          value: "predict" as const,
          label: "تنبّؤ الفصل القادم",
          detail: predictSummary?.thin ? "التاريخ لا يكفي بعد" : predictSummary ? `من ${countOf(predictSummary.historyTerms, AR.term)} سابقة · وبأي ثقة` : "ما سيحتاجه الفصل، وبأي ثقة",
          metric: !predictSummary ? "—" : predictSummary.thin ? "تاريخ غير كافٍ" : predictSummary.actions ? countOf(predictSummary.actions, AR.procedure) : "لا مقترح",
          icon: <Sparkles />,
        },
      ]
    : [];
  /* Escape يغلق الأقرب أولاً في كل المراحل: شرحُ المؤشر، ثم الدرج، ثم البطاقة المفتوحة.
     كان يعمل في «افهم» وحدها، وكان الدرج والبطاقة يُغلقان معاً بضغطةٍ واحدة. */
  const openCard = tab === "command" ? insightScene : tab === "twin" ? twinCard : tab === "history" ? approveCard : null;
  useEffect(() => {
    if (!openCard && !insightReason && !detail) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      /* نافذةُ تأكيدٍ أو لائحةٍ مفتوحة فوق المركز تملك Escape وحدها. */
      if (document.querySelector("[role='alertdialog']")) return;
      if (insightReason) setInsightReason(null);
      else if (detail) setDetail(null);
      else if (tab === "command") showScene(null);
      else if (tab === "twin") showTwinCard(null);
      else if (tab === "history") showApproveCard(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCard, insightReason, detail, tab]);

  /* ── المرحلةُ والبطاقةُ خطوةٌ في تاريخ المتصفح ─────────────────────────
     كلُّ تغييرٍ في (المرحلة، البطاقة) يُكتب في الرابط بخطوةٍ جديدة؛ والتغييراتُ
     المتتابعة في اللحظة نفسها (setTab ثم setTwinCard) تُجمع في خطوةٍ واحدة،
     فلا يتطلّب الرجوعُ ضغطتين. وأوّلُ كتابةٍ تستبدل الرابط ولا تضيف خطوة. */
  /* المسارُ الذي يملكه المركز. ما يحدث في التاريخ خارج هذا المسار شأنُ App.tsx وحده:
     لا يكتب المركز رابطاً ولا يقرأ رجوعاً إلا وهو على مساره. */
  const workspacePath = useRef(window.location.pathname);
  const onWorkspacePath = () => window.location.pathname === workspacePath.current;
  const navSynced = useRef(false);
  const navTimer = useRef<number | null>(null);
  const navWanted = useRef<IntelNav>({ tab, card: openCard });
  navWanted.current = { tab, card: openCard };
  useEffect(() => {
    if (navTimer.current != null) window.clearTimeout(navTimer.current);
    navTimer.current = window.setTimeout(() => {
      navTimer.current = null;
      if (!onWorkspacePath()) return;
      const target = intelNavUrl(navWanted.current);
      if (target === `${window.location.pathname}${window.location.search}`) { navSynced.current = true; return; }
      if (!navSynced.current) window.history.replaceState(window.history.state, "", target);
      else window.history.pushState({ intelligence: navWanted.current }, "", target);
      navSynced.current = true;
    }, 0);
  }, [tab, openCard]);
  useEffect(() => () => { if (navTimer.current != null) window.clearTimeout(navTimer.current); }, []);
  /* رابطٌ يفتح على بطاقة (الحلقات فوق الجدول، «بداية الفصل» من الفصل الفارغ): تصل البطاقةُ إلى أعلى الشاشة. */
  const arrivedLifted = useRef(false);
  useEffect(() => {
    if (arrivedLifted.current || !overview || !openCard) return;
    arrivedLifted.current = true;
    liftToTop(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(overview)]);
  /* الدرجُ ونافذةُ الشرح خطوةٌ خاصة في التاريخ: تُضاف عند الفتح (بالرابط نفسه)، والرجوعُ
     يُسقطها فيُغلق الطبقة وحدها. والإغلاقُ من الواجهة (✕ أو Escape) يُسقط خطوتها بنفسه،
     فلا تبقى خطوةٌ ميتة ولا يُمسح «التقدّم» في المتصفح. */
  const overlayIsOpen = Boolean(insightReason || detail);
  const overlayEntry = useRef(false);
  useEffect(() => {
    if (!onWorkspacePath()) { overlayEntry.current = false; return; }
    if (overlayIsOpen && !overlayEntry.current) {
      overlayEntry.current = true;
      window.history.pushState({ intelligence: navWanted.current, overlay: true }, "", `${window.location.pathname}${window.location.search}`);
    } else if (!overlayIsOpen && overlayEntry.current) {
      overlayEntry.current = false;
      if (window.history.state?.overlay) window.history.back();
    }
  }, [overlayIsOpen]);
  useEffect(() => {
    const onPop = () => {
      if (!onWorkspacePath()) return;
      if (overlayEntry.current && !window.history.state?.overlay) {
        overlayEntry.current = false;
        setInsightReason(null);
        setDetail(null);
        return;
      }
      const nav = readIntelNav(initialTab || "command");
      if (!nav) return;
      setTab(nav.tab);
      setInsightScene(nav.tab === "command" ? (nav.card as InsightScene | null) : null);
      setTwinCard(nav.tab === "twin" ? (nav.card as TwinCard | null) : null);
      setApproveCard(nav.tab === "history" ? (nav.card as ApproveCard | null) : null);
      liftToTop(true);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [initialTab]);

  const activeInsight = insightScenes.find((item) => item.value === insightScene) || null;
  /* One heading per reading: an eyebrow inside the open reading that merely
     repeats the page heading's title is marked, and the stylesheet quiets it.
     Attribute only; no text or structure changes. */
  useEffect(() => {
    const label = activeInsight?.label?.trim();
    const root = document.querySelector(".insight-canvas.open");
    if (!label || !root) return;
    root.querySelectorAll<HTMLElement>(".insight-scene-panel:not([hidden]) .surface-kicker").forEach(el => {
      const text = (el.textContent || "").trim();
      if (text && (text === label || text.includes(label) || label.includes(text))) el.setAttribute("data-dup", "");
      else el.removeAttribute("data-dup");
    });
  });
  const activeInsightKey = activeInsight?.value || "";
  const reasonCourseById = useMemo(() => new Map(courses.map(course => [Number(course.AdCourseId), course])), [courses]);
  const reasonInstructorById = useMemo(() => new Map(instructors.map(instructor => [Number(instructor.AdInstructorId), instructor])), [instructors]);
  const readingRows: FSchedule[] = overview?.readingRows || rows;
  const reasonRowById = useMemo(() => new Map(readingRows.map(row => [Number(row.id), row])), [readingRows]);
  const reasonCollege = (row: FSchedule | undefined) => readingMode === "department" && row ? `${colleges.find(c => Number(c.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeName || ""} · ` : "";
  const reasonDays = (row: FSchedule | undefined) => row ? Object.entries(dayLabels).filter(([key]) => Boolean((row as any)[key])).map(([,label]) => label).join("، ") : "";
  const reasonCourse = (row: FSchedule | undefined) => row ? (reasonCourseById.get(Number(row.AdCourseId))?.CourseCode || row.AdCourseName || "المقرر") : "موعد";
  const reasonInstructor = (row: FSchedule | undefined) => row ? withVisitingSuffix(reasonInstructorById.get(Number(row.AdInstructorId))?.AdInstructorName || "بدون أستاذ", Boolean(row.AdInstructorId) && isVisiting(row.AdInstructorId, row.AdCollegeId, row.AdSectionId)) : "";
  /* قوائم الحمل تجمع صفوف قراءةٍ قد تمتد لأقسام: منتدبٌ إن كان منتدباً في أيٍّ من أقسام صفوفه. */
  const visitingInReading = (instructorId: unknown) => readingRows.some(row => Number(row.AdInstructorId) === Number(instructorId) && isVisiting(row.AdInstructorId, row.AdCollegeId, row.AdSectionId)) || isVisiting(instructorId, collegeId, sectionId);
  const conflictReasonItems = useMemo<NonNullable<InsightReason["items"]>>(() => {
    const conflicts = Array.isArray(overview?.conflicts) ? overview.conflicts.filter((item:any) => item?.severity === "high") : [];
    return conflicts.slice(0, 12).map((conflict:any) => {
      const first = reasonRowById.get(Number(conflict.rowId));
      const second = reasonRowById.get(Number(conflict.otherId));
      const title = conflict.type === "instructor"
        ? reasonInstructor(first) || "أستاذ المقرر"
        : conflict.type === "room"
          ? `القاعة ${first?.AdRoomCode || "—"}/${first?.AdRoomHall || "—"}`
          : reasonCourse(first);
      const left = first ? `${reasonCollege(first)}${reasonCourse(first)} · شعبة ${first.SCode || "—"} · ${reasonDays(first) || "بلا أيام"}` : "الموعد الأول";
      const right = second ? `${reasonCollege(second)}${reasonCourse(second)} · شعبة ${second.SCode || "—"}` : "موعد آخر";
      return {
        title,
        readingScopes: [first, second].filter(Boolean).map(row => sourceScope(row)),
        meta: `${left} ↔ ${right}`,
        value: first ? formatScheduleTimeRange(first.fstarttime, first.fendtime) : "تعارض",
      };
    });
  }, [overview?.conflicts, reasonRowById, reasonCourseById, reasonInstructorById, readingMode, colleges, visitingLookup]);
  const longGapReasonItems = useMemo<NonNullable<InsightReason["items"]>>(() => {
    const loads = Array.isArray(overview?.professorLoads) ? overview.professorLoads : [];
    return loads.filter((item:any) => Number(item.maxGap || 0) >= 180).sort((a:any,b:any) => Number(b.maxGap||0)-Number(a.maxGap||0)).slice(0, 12).map((item:any) => ({
      title: withVisitingSuffix(String(item.name || "أستاذ"), visitingInReading(item.id)),
      meta: `${formatUnitMetricArabic(Number(item.weeklyHours || 0), "ساعة أسبوعيًا")} · ${formatUnitMetricArabic(Number(item.days || 0), "أيام")}`,
      value: formatCompactDurationArabic(Number(item.maxGap || 0)),
    }));
  }, [overview?.professorLoads, readingRows, visitingLookup]);
  const lateReasonItems = useMemo<NonNullable<InsightReason["items"]>>(() => readingRows.filter(row => twinMinutes(row.fstarttime) >= 16 * 60).sort((a,b) => twinMinutes(a.fstarttime) - twinMinutes(b.fstarttime)).slice(0, 12).map(row => {
    const course = reasonCourseById.get(Number(row.AdCourseId));
    const courseName = String(row.AdCourseName || course?.CourseName || "").trim();
    return {
      title: reasonCourse(row),
      subtitle: courseName || undefined,
      readingScopes: [sourceScope(row)],
      meta: `${reasonCollege(row)}${reasonInstructor(row)} · شعبة ${row.SCode || "—"} · ${reasonDays(row) || "بلا أيام"}`,
      value: formatScheduleTimeRange(row.fstarttime, row.fendtime),
    };
  }), [readingRows, reasonCourseById, reasonInstructorById, readingMode, colleges, visitingLookup]);
  const invalidReasonItems = useMemo<NonNullable<InsightReason["items"]>>(() => readingRows.filter(row => !row.AdInstructorId || !row.AdCourseId || !row.AdRoomCode || !row.AdRoomHall || twinMinutes(row.fendtime) <= twinMinutes(row.fstarttime) || !reasonDays(row)).slice(0, 12).map(row => {
    const missing = [!row.AdInstructorId ? "الأستاذ" : "", !row.AdCourseId ? "المقرر" : "", !row.AdRoomCode || !row.AdRoomHall ? "القاعة" : "", twinMinutes(row.fendtime) <= twinMinutes(row.fstarttime) ? "الوقت" : "", !reasonDays(row) ? "الأيام" : ""].filter(Boolean);
    return { readingScopes: [sourceScope(row)], title: `${reasonCourse(row)} · شعبة ${row.SCode || "—"}`, meta: `${reasonCollege(row)}ناقص: ${missing.join("، ")}`, value: countOf(missing.length, AR.field) };
  }), [readingRows, reasonCourseById, readingMode, colleges]);
  const dayBalanceReasonItems = useMemo<NonNullable<InsightReason["items"]>>(() => {
    const load = Array.isArray(overview?.dayLoad) ? [...overview.dayLoad].sort((a:any,b:any)=>Number(b.count||0)-Number(a.count||0)) : [];
    const max = Math.max(1,...load.map((item:any)=>Number(item.count||0)));
    return load.map((item:any) => ({ title:String(item.label || item.key || "يوم"), meta:`${Math.round(Number(item.count||0)/max*100)}% من أعلى يوم`, value:countOf(Number(item.count||0), AR.appointment) }));
  }, [overview?.dayLoad]);
  const reasonForSmartAlert = (alert:any, index:number): InsightReason => {
    const title = String(alert?.title || "تنبيه ذكي");
    const member = alert?.readingScope ? overview?.collegeReadings?.find((item:any) => sameIntelligenceScope(item, alert.readingScope)) : null;
    const metrics = member?.metrics || overview?.metrics;
    const scopedItems = (items: any[]) => member ? items.filter(item => (item.readingScopes || []).some((scope: IntelligenceScope) => sameIntelligenceScope(scope, member))) : items;
    const conflicts = scopedItems(conflictReasonItems || []), late = scopedItems(lateReasonItems || []), invalid = scopedItems(invalidReasonItems || []);
    const gaps = member ? (member.professorLoads || []).filter((item:any) => Number(item.maxGap || 0) >= 180).map((item:any) => ({title:withVisitingSuffix(String(item.name || ""), isVisiting(item.id, member.collegeId, member.sectionId)),meta:formatUnitMetricArabic(item.weeklyHours, "ساعة أسبوعيًا"),value:formatCompactDurationArabic(item.maxGap)})) : longGapReasonItems;
    const days = member ? (member.dayLoad || []).map((item:any) => ({title:item.label,meta:"",value:countOf(item.count,AR.appointment)})) : dayBalanceReasonItems;
    const base = { kicker:member?.collegeName || "تفاصيل التنبيه", title, metric:String(index + 1), tone:(alert?.severity === "critical" || alert?.severity === "high" || alert?.severity === "danger" ? "bad" : alert?.severity === "ok" ? "good" : "warn") as InsightReason["tone"] };
    if (/مانع اعتماد|مانعا اعتماد|موانع اعتماد|تعارض|حجز|مزدوج/.test(title)) return { ...base, icon:<ShieldAlert />, summary:"هذه هي الموانع الفعلية التي كوّنت الرقم:", items:conflicts, facts:[{label:"الموانع",value:String(metrics?.criticalConflicts || 0)},{label:"النوع",value:"حجز فعلي"},{label:"اللائحة",value:"تحذيرية"}] };
    if (/فراغ/.test(title)) return { ...base, icon:<CalendarClock />, summary:"الأساتذة الذين تجاوز لديهم الفراغ 3 ساعات:", items:gaps, facts:[{label:"الأساتذة",value:String(gaps.length)},{label:"الحد",value:formatUnitMetricArabic(3,"ساعات",0)},{label:"القراءة",value:"إرشادية"}] };
    if (/متأخر|بعد 4|وقت/.test(title)) return { ...base, icon:<Clock3 />, summary:`المواعيد التي تبدأ من ${scheduleClockForDisplay("16:00")} فأكثر:`, items:late, facts:[{label:"المواعيد",value:String(late.length)},{label:"من",value:scheduleClockForDisplay("16:00")},{label:"النوع",value:"توقيت"}] };
    if (/بيانات|سجل/.test(title)) return { ...base, icon:<FileClock />, summary:"السجلات التي ينقصها شيء محدد:", items:invalid, facts:[{label:"السجلات",value:String(invalid.length)},{label:"الحالة",value:"تحتاج إكمال"}] };
    if (/توزيع|أيام/.test(title)) return { ...base, icon:<BarChart3 />, summary:"هذا هو توزيع الحمل بين الأيام:", items:days, facts:[{label:"التفاوت",value:`${metrics?.imbalance || 0}%`},{label:"الأيام",value:String(days.length)}] };
    return { ...base, icon:<AlertTriangle />, summary:"تفاصيل هذا التنبيه:", items:[{title,meta:String(alert?.detail || "لا توجد تفاصيل إضافية."),value:""}] };
  };
  const chronologicalVersions = useMemo(() => versions.filter(v => sameIntelligenceScope(sourceScope(v), ownScope)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))), [versions, collegeId, sectionId]);
  const versionActivityHeatmap = useMemo(() => {
    const labels=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"],hours=Array.from({length:16},(_,i)=>i+7),counts=new Map<string,number>();
    versions.forEach(version=>{const stamp=new Date(version.createdAt);if(Number.isNaN(stamp.getTime()))return;const hour=stamp.getHours();if(hour<7||hour>22)return;const key=`${stamp.getDay()}-${hour}`;counts.set(key,(counts.get(key)||0)+1);});
    const max=Math.max(0,...counts.values());
    return{labels,hours,max,cells:labels.map((label,day)=>({label,hours:hours.map(hour=>({hour,count:counts.get(`${day}-${hour}`)||0}))}))};
  },[versions]);

  const openSpatialProposal = async (proposal: any) => {
    if (!enterSourceScope(proposal, "spatial")) return;
    const changes = new Map((proposal.changes || []).map((change: any) => [Number(change.id), change]));
    if ([...changes.keys()].some(id => !rows.some(row => Number(row.id) === id))) { setError("الاقتراح يتضمن موعداً خارج هذه الكلية."); return; }
    const next = rows.map(row => { const change: any = changes.get(Number(row.id)); return change ? { ...row, ...change, locationStatus: change.locationStatus || "VERIFIED" } : row; });
    setScenario(next); setScenarioEval(null); setTab("twin"); setTwinCard("board");
    await evaluateScenario(next);
  };
  useEffect(() => {
    const pending = pendingReadingAction.current;
    if (pending && pending.termId !== termId) { pendingReadingAction.current = null; return; }
    if (!pending || loading || scopeReady !== `${collegeId}:${sectionId}:${termId}` || !sameIntelligenceScope(pending.source, ownScope)) return;
    pendingReadingAction.current = null;
    const actions: Record<string, () => unknown> = {
      draft: () => openDraft(pending.item), publish: () => publishDraft(pending.item), restore: () => restoreVersion(pending.item),
      opening: () => openSectionDraft(pending.item, pending.extra), repair: () => openRepair(pending.item),
      spatial: () => openSpatialProposal(pending.item), rule: () => proposeUnwrittenRule(pending.item),
    };
    void actions[pending.kind]?.();
  }, [loading, scopeReady, collegeId, sectionId, termId]);
  /* ── من «كشف التسجيل ← تحليل الطلب» إلى النسخة التجريبية ───────────────
     «افتحها في النسخة التجريبية» و«معاينة التأثير» هناك تسلّمان الاقتراح نفسه؛
     يُفتح هنا حين تصل صفوفُ النطاق نفسه، كما كان يُفتح من بطاقة «طلبات الطلاب». */
  const twinHandoff = useRef<ReturnType<typeof takeTwinHandoff> | undefined>(undefined);
  if (twinHandoff.current === undefined) twinHandoff.current = takeTwinHandoff();
  useEffect(() => {
    const handoff = twinHandoff.current;
    if (!handoff || !collegeId || !sectionId || !termId) return;
    if (Number(handoff.collegeId) !== Number(collegeId) || Number(handoff.sectionId) !== Number(sectionId) || Number(handoff.termId) !== Number(termId)) {
      /* الاقتراح من قسمٍ آخر في العائلة: يُفتح النطاقُ نفسه أولاً، ثم يُفتح الاقتراح حين تصل صفوفه. */
      setCollegeId(Number(handoff.collegeId)); setSectionId(Number(handoff.sectionId)); setTermId(Number(handoff.termId));
      return;
    }
    if (loading || !rows.length) return;
    twinHandoff.current = null;
    if (handoff.kind === "opening") void openSectionDraft(handoff.item, handoff.extra);
    else if (handoff.kind === "repair") void openRepair(handoff.item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows.length, collegeId, sectionId, termId]);
  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const stage = e.currentTarget.parentElement;
    if (!stage) return;

    const updatePosition = (clientX: number) => {
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0) return;
      const offset = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, Math.round((offset / rect.width) * 100)));
      setTimeTravel(pct);
    };

    const handlePointerMove = (ev: PointerEvent) => {
      updatePosition(ev.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };
  /* ── أدواتُ «مركز القرار» داخل البطاقات ───────────────────────────────── */
  const livingCommon = {
    user,
    rows,
    courses,
    instructors,
    terms,
    colleges,
    sections,
    collegeId: Number(collegeId) || 0,
    sectionId: Number(sectionId) || 0,
    termId: Number(termId) || 0,
    analysisScope: readingMode as "college" | "department",
    onRefresh: () => void reload(),
    onDraftsChanged: () => void reload(),
    /* «افتح في نموذج التعديل»: الجدولُ يفتح الموعد ممتلئاً بالبديل، كما كان من نافذة «مركز القرار». */
    onOpenRow: (row: FSchedule) => openInScheduleEditor([Number(row.id)], row as any),
    onNavigate: (target: "topology" | "health" | "drafts") => {
      if (target === "topology") { setDensityView("pressure"); setTab("command"); showScene("density"); }
      else if (target === "health") { setTab("command"); showScene("quality"); }
      else { setTab("history"); showApproveCard("drafts"); }
    },
  };
  const moveInsightFocus = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next = index;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = (index + 1) % insightScenes.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = (index - 1 + insightScenes.length) % insightScenes.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = insightScenes.length - 1;
    else return;
    event.preventDefault();
    const value = insightScenes[next]?.value;
    if (!value) return;
    showScene(value);
    window.requestAnimationFrame(() =>
      document.getElementById(`insight-tab-${value}`)?.focus(),
    );
  };

  return (
    <div className={`content-stack intelligence-page scene-${scene} visual-minimal`}>
      <PageTitle
        eyebrow="ذكاء الجدول"
        subtitle="افهم · جرّب · السجل"
      >
        مركز الذكاء
      </PageTitle>
      {contextBar}
      {collegeId && sectionId && termId && (tab === "twin" || hasMultipleDepartmentColleges) ? <div className="intelligence-reading-toolbar no-print">
        {tab === "twin" ? <span className="intelligence-working-scope">{ownScope.collegeName}</span>
          : <IntelligenceScopeSwitch value={analysisScope} onChange={value => {pendingReadingAction.current = null; setAnalysisScope(value);}} />}
      </div> : null}
      {guideSimulationMeta ? (
        <section className="guide-simulation-brief no-print">
          <header><ShieldCheck aria-hidden="true" /><div><small>محاكاة حقيقية · لا حفظ</small><strong>{guideSimulationMeta.before.AdCourseName || "المقرر المحدد"}<CourseTags courseId={guideSimulationMeta.before.AdCourseId} /></strong></div></header>
          <div className="guide-simulation-flow">
            <span><small>قبل</small><b>{Object.keys(dayLabels).filter(key => (guideSimulationMeta.before as any)[key]).map(key => (dayLabels as any)[key]).join(" · ") || "—"}</b><em>{formatScheduleTimeRange(guideSimulationMeta.before.fstarttime, guideSimulationMeta.before.fendtime)}</em></span>
            <ChevronLeft aria-hidden="true" />
            <span className="after"><small>بعد</small><b>{Object.keys(dayLabels).filter(key => (guideSimulationMeta.after as any)[key]).map(key => (dayLabels as any)[key]).join(" · ") || "—"}</b><em>{formatScheduleTimeRange(guideSimulationMeta.after.fstarttime, guideSimulationMeta.after.fendtime)}</em></span>
          </div>
          <p>{scenarioEval?.scenario?.conflicts || scenarioEval?.scenario?.conflictCount ? "توجد آثار تحتاج مراجعة في النسخة التجريبية." : "النسخة التجريبية جاهزة للمقارنة، والجدول الحقيقي لم يتغير."}</p>
          <footer>
            <button type="button" onClick={async () => {
              if (!scenario || !guideSimulationMeta) return;
              const copy=scenario.map(item=>({...item})); const index=copy.findIndex(item=>item.id===guideSimulationMeta.after.id); if(index<0)return;
              const before={...copy[index]}; const after:any={...before};
              const toMinutes=(value:string)=>{const [h,m]=String(value||"0:0").split(":").map(Number);return h*60+m;}; const fromMinutes=(value:number)=>`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
              const duration=Math.max(30,toMinutes(before.fendtime)-toMinutes(before.fstarttime)); const nextStart=fromMinutes(Math.min(22*60,toMinutes(before.fstarttime)+30)); after.fstarttime=nextStart; after.fendtime=fromMinutes(toMinutes(nextStart)+duration); copy[index]=after; setScenario(copy); setGuideSimulationMeta(current=>current?{...current,after}:current); await evaluateScenario(copy);
            }}>جرّب بديلًا</button>
            <button type="button" onClick={() => { try { sessionStorage.setItem("schedule-guide-ghost-preview", JSON.stringify({ id:guideSimulationMeta.before.id, before:guideSimulationMeta.before, after:guideSimulationMeta.after, createdAt:Date.now() })); } catch {} openScheduleWorkspace("هذه معاينة من مساحة «جرّب». راجعها على الجدول ثم اعتمدها يدويًا إذا رغبت."); }}>معاينة على الجدول</button>
            <button type="button" data-guide-ignore="يحفظ المحاكاة كمسودة تجريبية فقط ولا ينشر أي تغيير حقيقي" className="primary" onClick={async () => { if(!scenario)return; const draft=await saveDraft("guide-simulation",scenario,"محاكاة المرشد"); if(draft)setMessage("حُفظ الحل كمسودة فقط. راجعه في «اعتمد» قبل أي نشر."); }}>اعتماد كمسودة</button>
          </footer>
        </section>
      ) : null}
      {!collegeId || !termId ? (
        <Surface className="intel-context-idle" aria-live="polite">
          <Target aria-hidden="true" />
          <div><strong>اختر الكلية والفصل</strong><span>تبدأ القراءات بعد تحديد النطاق؛ وبعد أول اختيار سيعود آخر نطاق فعّال تلقائيًا.</span></div>
        </Surface>
      ) : null}
      <nav className="intelligence-scenes no-print" aria-label="مراحل مركز الذكاء">
        {/* افهم ← جرّب ← اعتمد: مِرقاةٌ تُرى، وكلُّ مرحلةٍ زرُّها باسمها. */}
        <DnaStepper
          size="sm"
          className="intelligence-steps"
          ariaLabel="مراحل مركز الذكاء"
          steps={([
            { value: "understand", label: <span data-guide-target="intelligence.scene.understand">افهم</span>, icon: <BrainCircuit /> },
            { value: "try", label: <span data-guide-target="intelligence.scene.try">جرّب</span>, icon: <Network /> },
            { value: "approve", label: <span data-guide-target="intelligence.scene.approve">السجل</span>, icon: <History /> },
          ] as const).map((option, index, all) => {
            const at = all.findIndex(item => item.value === scene);
            return {
              key: option.value,
              onSelect: () => runVisualTransition(() => changeScene(option.value)),
              actionLabel: `فتح مرحلة ${option.value === "understand" ? "افهم" : option.value === "try" ? "جرّب" : "السجل"}`,
              icon: option.icon,
              state: option.value === scene ? "current" as const : index < at ? "done" as const : "pending" as const,
              label: (
                <button
                  type="button"
                  className={scene === option.value ? "active" : ""}
                  aria-pressed={scene === option.value}
                  data-guide-ignore="تنقّل بين مراحل مركز الذكاء — عرضٌ لا فعل؛ الهدف على اسم المرحلة"
                  onClick={() => runVisualTransition(() => changeScene(option.value))}
                >
                  {option.label}
                </button>
              ),
            };
          })}
        />
        <span className="scene-caption">
          {scene === "understand"
            ? "صحة · انتباه · ضغط · لماذا"
            : scene === "try"
              ? "تجريبي · خارج الجدول الحقيقي"
              : "مسودات · نسخ · دفتر القرار"}
        </span>
      </nav>
      {scene === "understand" ? (
        <nav className="scene-subnav no-print" aria-label="أدوات الفهم">
          <button
            type="button"
            data-guide-ignore="أداةٌ داخل المرحلة: تفتح شبكة بطاقاتها؛ تنقّلٌ لا فعل"
            className={tab === "command" ? "active" : ""}
            aria-pressed={tab === "command"}
            onClick={() => switchTab("command")}
          >
            <Gauge /> قراءة القرار
          </button>
          <button
            type="button"
            data-guide-target="intelligence.ask-table"
            className={tab === "copilot" ? "active" : ""}
            aria-pressed={tab === "copilot"}
            onClick={() => switchTab("copilot")}
          >
            <BrainCircuit /> اسأل الجدول
          </button>
        </nav>
      ) : scene === "try" ? (
        <nav className="scene-subnav no-print" aria-label="أدوات التجربة">
          <button
            type="button"
            data-guide-ignore="أداةٌ داخل المرحلة: تفتح شبكة بطاقاتها؛ تنقّلٌ لا فعل"
            className={tab === "twin" ? "active" : ""}
            aria-pressed={tab === "twin"}
            onClick={() => switchTab("twin")}
          >
            <Network /> النسخة التجريبية
          </button>
          {/* «آلة الزمن» ومحاكي الشعب والاقتراحات الذكية: لسانٌ واحد هنا بدل زرٍّ في القائمة ولسانين في أدوات الجدول. */}
          <button
            type="button"
            data-guide-ignore="وجهةُ «آلة الزمن» مسجّلة في المرشد باسم page.timeMachine"
            className={tab === "whatif" ? "active" : ""}
            aria-pressed={tab === "whatif"}
            onClick={() => switchTab("whatif")}
          >
            <Hourglass /> ماذا لو
          </button>
          {/* Importing a timetable lives in Data Tools only. Two doors to the
              same reviewed route split attention and let one screen fall behind
              the other; the guide points at «أدوات الجدول» for this. */}
        </nav>
      ) : null}
      {degraded && collegeId && sectionId && termId ? (
        <ActionableErrorNotice
          error={{ ...degraded.info, reason: `لم تكتمل: ${degraded.sources.join(" · ")}. ${degraded.info.reason}` }}
          showTechnical={isPowerAdmin}
          onRetry={() => void reload()}
          onDismiss={() => setDegraded(null)}
        />
      ) : null}
      {partialSources.length && !degraded && collegeId && sectionId && termId ? (
        <p className="intel-partial-chip" role="status">
          <History aria-hidden="true" />
          <span>{partialSources.join(" · ")}: قراءة جزئية</span>
          <button type="button" onClick={() => void reload()} aria-label="أعد قراءة النسخ" data-guide-ignore="يعيد قراءة مركز الذكاء فقط؛ لا يكتب شيئاً"><RefreshCw aria-hidden="true" /></button>
        </p>
      ) : null}
      {error && collegeId && sectionId && termId && errorDetail?.message === error ? (
        <ActionableErrorNotice
          error={errorDetail.info}
          showTechnical={isPowerAdmin}
          retrying={busy || loading}
          onRetry={errorDetail.retry ? () => { setError(null); setErrorDetail(null); errorDetail.retry?.(); } : undefined}
          onDismiss={() => { setError(null); setErrorDetail(null); }}
        />
      ) : error && collegeId && sectionId && termId ? (
        <Notice onDismiss={() => setError(null)}>
          {error}
        </Notice>
      ) : null}
      {message ? <Notice type="success">{message}</Notice> : null}
      {loading && !overview ? (
        <div className="intel-loading" role="status" aria-live="polite">
          <span />
          <strong>أقرأ الجدول وأبني صورة القرار...</strong>
        </div>
      ) : null}

      {tab === "command" && overview ? (
        <div className="intel-command-grid intel-insight-workspace">
          <nav
            className="insight-preview-rail no-print"
            aria-label="مشاهد قراءة القرار"
          >
            <div className="insight-preview-head">
              <span className="surface-kicker">مشاهد الذكاء</span>
              <strong>اختر قراءة</strong>
              <small>كل قراءة تفتح صفحتها — رقم واحد أولاً، ثم التفاصيل.</small>
            </div>
            {/* الصفرُ لا يُكتب رقماً على بطاقة القراءة (قاعدة إخفاء الفارغ). */}
            <div className="insight-preview-list" role="list">
              {insightScenes.map((item, index) => {
                if (item.advanced) return null;
                const selected = activeInsightKey === item.value;
                return (
                  <button
                    type="button"
                    key={item.value}
                    id={`insight-tab-${item.value}`}
                    className={`insight-preview ${selected ? "active" : ""}`}
                    role="listitem"
                    aria-label={`${item.label} — ${item.detail}`}
                    title={item.detail}
                    data-guide-ignore="بطاقة اختيار قراءة داخل مركز الذكاء: تفتح القراءة نفسها كما قبل، والوصف صار تلميحاً فقط"
                    onClick={() => showScene(item.value)}
                    onKeyDown={(event) => moveInsightFocus(event, index)}
                  >
                    <span className="insight-preview-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="insight-preview-copy">
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                    {metricBadge(item.metric)}
                  </button>
                );
              })}
            </div>
            {/* ── «متقدم» ─────────────────────────────────────────────────────
                ما يُحتاج نادراً، بالشكل نفسه، مطويٌّ تحت الشبكة: بصمة القسم، والحركة
                المكانية، ومقارنة الفصول، ومختبر القرار المتقدم، وتشخيص النظام. */}
            <details className="insight-advanced" open={insightScenes.some(item => item.advanced && item.value === activeInsightKey) || undefined}>
              <summary data-guide-ignore="يفتح مجموعة «متقدم» المطويّة؛ عرضٌ لا فعل"><SlidersHorizontal aria-hidden="true" /><span>متقدم</span></summary>
              <div className="insight-preview-list" role="list">
              {insightScenes.map((item, index) => {
                  if (!item.advanced) return null;
                  const selected = activeInsightKey === item.value;
                  return (
                    <button
                      type="button"
                      key={item.value}
                      id={`insight-tab-${item.value}`}
                      className={`insight-preview ${selected ? "active" : ""}`}
                      role="listitem"
                      aria-label={`${item.label} — ${item.detail}`}
                      title={item.detail}
                      data-guide-ignore="بطاقة اختيار قراءة داخل مركز الذكاء: تفتح القراءة نفسها كما قبل، والوصف صار تلميحاً فقط"
                      onClick={() => showScene(item.value)}
                      onKeyDown={(event) => moveInsightFocus(event, index)}
                    >
                      <span className="insight-preview-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="insight-preview-copy">
                        <strong>{item.label}</strong>
                        <small>{item.detail}</small>
                      </span>
                      {metricBadge(item.metric)}
                    </button>
                  );
                })}
                {compareTermOptions.length > 1 ? (
                  <button type="button" className="insight-preview" role="listitem" aria-label="مقارنة الفصول — ما تغيّر بين فصل وفصل" data-guide-ignore="يفتح «مقارنة الفصول» في «السجل»؛ تنقّلٌ لا فعل" onClick={() => { setTab("history"); showApproveCard("compare"); }}>
                    <span className="insight-preview-icon" aria-hidden="true"><ArrowLeftRight /></span>
                    <span className="insight-preview-copy"><strong>مقارنة الفصول</strong><small>ما تغيّر بين فصل وفصل</small></span>
                  </button>
                ) : null}
                <button type="button" className="insight-preview" role="listitem" aria-label="مختبر القرار المتقدم — القواعد والمحاكاة والتحسين" data-guide-ignore="يفتح «مختبر القرار» في «جرّب»؛ تنقّلٌ لا فعل" onClick={() => { setTab("twin"); showTwinCard("lab"); }}>
                  <span className="insight-preview-icon" aria-hidden="true"><BrainCircuit /></span>
                  <span className="insight-preview-copy"><strong>مختبر القرار المتقدم</strong><small>القواعد، ومحاكاة السياسات، والتحسين الآلي</small></span>
                </button>
              </div>
            </details>
          </nav>
          {/*
            ── القراءة صفحة، لا قسم أسفل الصفحة ──────────────────────────────
            Tabs were not enough, and the reason is simple: a panel is a
            thousand pixels tall, so switching between them still felt like
            scrolling one long page. A reading opens as its own page over the
            dashboard now, with a way back — the dashboard stays one place, and
            nothing is ever under anything else.
          */}
          <section
            className={`insight-canvas${activeInsight ? " open" : ""}`}
            aria-label={activeInsight?.label || "قراءة القرار"}
            aria-hidden={activeInsight ? undefined : true}
          >
            {activeInsight ? (
              <CardPageHead
                cards={insightScenes}
                value={activeInsight.value}
                onChange={next => showScene(next as InsightScene | null)}
                title="بطاقات «افهم»"
                metric={<b className="insight-page-metric"><Num value={activeInsight.metric} /></b>}
              />
            ) : null}
            <p className="sr-only" role="status" aria-live="polite">
              المشهد الحالي: {activeInsight?.label}. {activeInsight?.detail}
            </p>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-quality"
              role="tabpanel"
              aria-labelledby="insight-tab-quality"
              hidden={activeInsightKey !== "quality"}
              tabIndex={activeInsightKey === "quality" ? 0 : -1}
            >
          <Surface className="quality-hero">
            <div
              className="quality-orbit"
              style={{ "--score": `${overview.score}%` } as React.CSSProperties}
            >
              <div>
                <Num value={overview.score} className="quality-orbit-score" />
                <small>من 100</small>
              </div>
            </div>
            <div className="quality-copy">
              <span className="surface-kicker">مؤشر جودة الجدول</span>
              <h2>{readinessLabel}</h2>
              <p>
                الدرجة تجمع موانع الاعتماد، فراغات الأساتذة، توازن الأيام، الأوقات
                المتأخرة وصحة البيانات.
              </p>
              {/*
                Where the hundred went.
                The old row printed "-0" beside every factor that cost nothing,
                which reads as an error and says nothing: a minus sign in front
                of zero is not a deduction. Each factor is now a bar showing how
                much of the score it took, the ones that took nothing say so in
                words, and the whole row adds up to the number in the ring.
              */}
              <details className="insight-disclosure quality-breakdown">
                <summary>كيف تكوّنت الدرجة؟</summary>
                <div
                  className="quality-factors"
                  role="img"
                  aria-label="توزيع نقاط الجودة"
                >
                  {overview.factors.map((f: any) => {
                    const cost = Math.max(0, Number(f.penalty) || 0);
                    return (
                      <span key={f.label} className={cost ? "costly" : "clean"}>
                        <em>{f.label}</em>
                        <i aria-hidden="true">
                          <b
                            style={{ width: `${Math.min(100, cost * 2)}%` }}
                          />
                        </i>
                        <u>{cost ? `−${cost}` : "سليم"}</u>
                      </span>
                    );
                  })}
                </div>
              </details>
            </div>
            <div className="quality-actions">
              <PrimaryButton onClick={autoSchedule} disabled={busy}>
                <WandSparkles /> تحسين تلقائي
              </PrimaryButton>
              <SecondaryButton onClick={() => setTab("copilot")}>
                <BrainCircuit /> اسأل المساعد
              </SecondaryButton>
            </div>
          </Surface>
              {activeInsightKey === "quality" ? <LivingScheduleLayer {...livingCommon} embeddedScenes={["pulse", "health"]} pulseWithoutTiles /> : null}
            </div>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-approval"
              role="tabpanel"
              aria-labelledby="insight-tab-approval"
              hidden={activeInsightKey !== "approval"}
              tabIndex={activeInsightKey === "approval" ? 0 : -1}
            >
          <Surface className="approval-center">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">قبل الاعتماد</span>
                <h2>مركز القيادة</h2>
              </div>
              <ShieldCheck />
            </div>
            {readingMode === "department" ? <div className="intelligence-college-status">
              {(overview.collegeReadings || []).map((item: any) => <button key={`${item.collegeId}:${item.sectionId}`} type="button" data-guide-ignore="فتح قراءة الاعتماد في كلية بعينها دون نشر" onClick={() => { setCollegeId(item.collegeId); setSectionId(item.sectionId); setAnalysisScope("college"); }}>
                <span>{item.collegeName}</span><b>{item.blockers ? countOf(item.blockers, AR.position) : "بلا موانع"}</b><small>{item.publication ? "منشور" : "غير منشور"}</small>
              </button>)}
            </div> : null}
            <div className="approval-metrics">
              {/* بطاقاتُ الصفر لا تُعرض: «جاهز للاعتماد» تقولها بطاقةُ الحالة تحتها. */}
              {overview.metrics.criticalConflicts ? <button type="button" data-guide-ignore="يفتح شرحاً بصرياً لهذا المؤشر داخل مركز القيادة فقط" className={`approval-metric-card ${overview.metrics.criticalConflicts ? "danger" : "ok"}`} onClick={() => setInsightReason({
                kicker:"قبل الاعتماد", title:"موانع الاعتماد", metric:String(overview.metrics.criticalConflicts), tone:overview.metrics.criticalConflicts?"bad":"good", icon:<ShieldAlert />,
                summary:overview.metrics.criticalConflicts?"هذه هي الموانع الموجودة الآن:":"لا تظهر موانع حفظ في النطاق الحالي.",
                facts:[{label:"الموانع",value:String(overview.metrics.criticalConflicts)},{label:"حالة الاعتماد",value:overview.metrics.criticalConflicts?"متوقف":"جاهز"},{label:"اللائحة",value:"تحذيرية"}],
                items:conflictReasonItems,
                bars:[{label:"المتأثر",value:Number(overview.metrics.criticalConflicts||0),max:Math.max(1,Number(rows.length||1)),caption:countOf(overview.metrics.criticalConflicts, AR.position)}]
              })}>
                <strong>{overview.metrics.criticalConflicts}</strong>
                <span>موضع يحتاج تحقق</span>
                <ChevronLeft aria-hidden="true" />
              </button> : null}
              {overview.metrics.invalidRows ? <button type="button" data-guide-ignore="يفتح شرحاً بصرياً لهذا المؤشر داخل مركز القيادة فقط" className="approval-metric-card" onClick={() => setInsightReason({
                kicker:"سلامة البيانات", title:"سجلات تحتاج مراجعة", metric:String(overview.metrics.invalidRows), tone:overview.metrics.invalidRows?"warn":"good", icon:<FileClock />,
                summary:overview.metrics.invalidRows?"هذه السجلات وما ينقص كل واحد منها:":"لا توجد سجلات ناقصة ظاهرة في النطاق الحالي.",
                items:invalidReasonItems,
                facts:[{label:"السجلات",value:String(overview.metrics.invalidRows)},{label:"الجدول",value:String(readingRows.length)},{label:"الأثر",value:overview.metrics.invalidRows?"مراجعة":"لا شيء"}]
              })}>
                <strong>{overview.metrics.invalidRows}</strong>
                <span>سجل يحتاج مراجعة</span><ChevronLeft aria-hidden="true" />
              </button> : null}
              {overview.draftCount ? <button type="button" data-guide-ignore="يفتح شرحاً بصرياً لهذا المؤشر داخل مركز القيادة فقط" className="approval-metric-card" onClick={() => setInsightReason({
                kicker:"مساحة العمل", title:"المسودات الداخلية", metric:String(overview.draftCount), tone:"plain", icon:<Save />,
                summary:"هذه نسخ تجريبية أو محفوظة للمراجعة ولم تُنشر على الجدول المعتمد.",
                facts:[{label:"المسودات",value:String(overview.draftCount)},{label:"النشر",value:"لا"},{label:"الجدول الحقيقي",value:"لم يتغير"}]
              })}>
                <strong>{overview.draftCount}</strong>
                <span>مسودة داخلية</span><ChevronLeft aria-hidden="true" />
              </button> : null}
              <button type="button" data-guide-ignore="يفتح شرحاً بصرياً لهذا المؤشر داخل مركز القيادة فقط" className="approval-metric-card" onClick={() => setInsightReason({
                kicker:"راحة الجدول", title:"متوسط فراغ الأساتذة", metric:formatCompactDurationArabic(overview.metrics.avgInstructorGap), tone:Number(overview.metrics.avgInstructorGap)>=180?"warn":"plain", icon:<CalendarClock />,
                summary:longGapReasonItems.length?"أصحاب الفراغات الأطول الآن:":"لا يوجد أستاذ بفراغ يومي يتجاوز 3 ساعات.",
                items:longGapReasonItems,
                facts:[{label:"المتوسط",value:formatMinuteMetricArabic(overview.metrics.avgInstructorGap)},{label:"أكثر من 3س",value:String(longGapReasonItems.length)},{label:"القراءة",value:"إرشادية"}]
              })}>
                <strong>{overview.metrics.avgInstructorGap}</strong>
                <span>دقيقة متوسط الفراغ</span><ChevronLeft aria-hidden="true" />
              </button>
            </div>
            <div className="approval-status approval-status-grid" hidden={readingMode === "department"}>
              <button type="button" data-guide-ignore="يفتح سبب حالة الاعتماد داخل القراءة الحالية فقط" className={overview.metrics.criticalConflicts ? "blocked" : "ready"} onClick={() => setInsightReason({
                kicker:"حالة الاعتماد", title:overview.metrics.criticalConflicts?"لماذا الاعتماد متوقف؟":"لماذا الجدول جاهز؟", metric:overview.metrics.criticalConflicts?String(overview.metrics.criticalConflicts):"✓", tone:overview.metrics.criticalConflicts?"bad":"good", icon:overview.metrics.criticalConflicts?<ShieldAlert />:<ShieldCheck />,
                summary:overview.metrics.criticalConflicts?"الموانع الفعلية التي توقف الاعتماد:":"لا توجد موانع حفظ ظاهرة. ملاحظات اللائحة — إن وجدت — تبقى للمراجعة فقط.",
                items:overview.metrics.criticalConflicts?conflictReasonItems:[],
                facts:[{label:"موانع حقيقية",value:String(overview.metrics.criticalConflicts)},{label:"اللائحة",value:"تحذيرية"},{label:"الحالة",value:overview.metrics.criticalConflicts?"يحتاج معالجة":"جاهز"}]
              })}>
                <small>حالة الاعتماد</small>
                <strong>{overview.metrics.criticalConflicts ? "يمنع الاعتماد" : "جاهز للاعتماد"}</strong>
                <span>{overview.metrics.criticalConflicts ? `${countOf(overview.metrics.criticalConflicts, AR.position)} بحاجة إلى تحقق` : "لا توجد موانع اعتماد ظاهرة"}</span><ChevronLeft aria-hidden="true" />
              </button>
              <button type="button" data-guide-ignore="يفتح شرح حالة النشر داخل القراءة الحالية فقط" className="publication-state" onClick={() => setInsightReason({
                kicker:"حالة النشر", title:overview.publication?"الجدول منشور":"لم يُنشر بعد", metric:overview.publication?"✓":"—", tone:overview.publication?"good":"plain", icon:<Upload />,
                summary:overview.publication?"هذه النسخة سبق نشرها للمستخدمين.":"النشر خطوة مستقلة وتبقى بقرار المستخدم صاحب الصلاحية.",
                facts:[{label:"الحالة",value:overview.publication?"منشور":"غير منشور"},{label:"الاعتماد",value:"مستقل"},{label:"التحكم",value:"يدوي"}]
              })}>
                <small>حالة النشر</small>
                <strong>{overview.publication ? "تم النشر" : "لم يُنشر بعد"}</strong>
                <span>{overview.publication ? new Date(overview.publication.publishedAt).toLocaleString("ar-KW-u-nu-latn") : "النشر مستقل عن نتيجة الاعتماد"}</span><ChevronLeft aria-hidden="true" />
              </button>
            </div>
          </Surface>
            </div>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-attention"
              role="tabpanel"
              aria-labelledby="insight-tab-attention"
              hidden={activeInsightKey !== "attention"}
              tabIndex={activeInsightKey === "attention" ? 0 : -1}
            >
          <Surface className="attention-center">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">يحتاج انتباهك</span>
                <h2>تنبيهات ذكية</h2>
              </div>
              <AlertTriangle />
            </div>
            <div className="smart-alerts">
              {overview.alerts.slice(0, 3).map((a: any, i: number) => {
                const icon = /اعتماد|تعارض|حجز|مزدوج/.test(a.title) ? <ShieldAlert />
                  : /فراغ|موعد|وقت/.test(a.title) ? <CalendarClock />
                  : /توزيع|أيام/.test(a.title) ? <BarChart3 />
                  : a.severity === "ok" ? <CheckCircle2 /> : <AlertTriangle />;
                return (
                  <button type="button" data-guide-ignore="يفتح سبب التنبيه الذكي داخل مركز القيادة فقط" key={i} className={`smart-alert-card ${a.severity}`} onClick={() => setInsightReason(reasonForSmartAlert(a, i))}>
                    <span className="smart-alert-icon">{icon}</span>
                    <div><strong>{a.title}</strong>{scopeLabel(a) ? <small className="reading-college-label">{scopeLabel(a)}</small> : null}<p>{a.detail}</p></div>
                    <ChevronLeft className="smart-alert-open" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
            {overview.alerts.length > 3 ? (
              <details className="insight-disclosure alert-disclosure">
                <summary>
                  عرض الباقي ({countOf(overview.alerts.length - 3, AR.alert)})
                </summary>
                <div className="smart-alerts">
                  {overview.alerts.slice(3).map((a: any, i: number) => (
                    <button type="button" data-guide-ignore="يفتح سبب التنبيه الذكي داخل مركز القيادة فقط" key={i + 3} className={`smart-alert-card ${a.severity}`} onClick={() => setInsightReason(reasonForSmartAlert(a, i + 3))}>
                      <span className="smart-alert-icon"><AlertTriangle /></span>
                      <div><strong>{a.title}</strong>{scopeLabel(a) ? <small className="reading-college-label">{scopeLabel(a)}</small> : null}<p>{a.detail}</p></div><ChevronLeft className="smart-alert-open" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </Surface>
              {activeInsightKey === "attention" ? <LivingScheduleLayer {...livingCommon} embeddedScenes={["brief"]} briefUniqueOnly /> : null}
            </div>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-density"
              role="tabpanel"
              aria-labelledby="insight-tab-density"
              hidden={activeInsightKey !== "density"}
              tabIndex={activeInsightKey === "density" ? 0 : -1}
            >
          <div className="density-view-switch no-print">
            <Segmented
              value={densityView}
              onChange={value => setDensityView(value as "density" | "pressure")}
              options={[
                { value: "pressure", label: "خريطة الضغط" },
                { value: "density", label: "الكثافة" },
              ]}
            />
          </div>
          {densityView === "pressure" ? (
            activeInsightKey === "density" ? <LivingScheduleLayer {...livingCommon} embeddedScenes={["topology"]} /> : null
          ) : (
          <Surface className="heatmap-card">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">خريطة الكثافة</span>
                <h2>
                  {heatMode === "university" ? "حركة الجامعة" : "حركة القسم"}
                </h2>
              </div>
              {isPowerAdmin ? (
                <Segmented
                  value={heatMode}
                  onChange={setHeatMode}
                  options={[
                    { value: "department", label: "القسم" },
                    { value: "university", label: "الجامعة" },
                  ]}
                />
              ) : null}
            </div>
            <div className="schedule-heatmap">
              <div className="heat-corner">الوقت</div>
              {Object.values(dayLabels).map((d: any) => (
                <strong key={d}>{d}</strong>
              ))}
              {heatTimes.map((time) => (
                <React.Fragment key={time}>
                  <span className="heat-time" dir="ltr">
                    {time}
                  </span>
                  {Object.keys(dayLabels).map((day) => {
                    const cell = heatData.find(
                      (x: any) => x.day === day && x.time === time,
                    );
                    const ratio = (cell?.count || 0) / heatMax;
                    return (
                      <span
                        key={`${day}-${time}`}
                        className="heat-cell"
                        style={{ "--heat": ratio } as React.CSSProperties}
                        role="img"
                        aria-label={`${dayLabels[day]}، الساعة ${time}، ${countOf(cell?.count || 0, AR.appointment)}`}
                        title={`${dayLabels[day]} ${time}: ${cell?.count || 0}`}
                      >
                        <i aria-hidden="true" />
                        {(cell?.count || 0) > 0 ? <b>{cell?.count}</b> : null}
                      </span>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div className="heat-legend" role="img" aria-label="تدرج الألوان من هادئ إلى ذروة">
              <i />
              <i />
              <i />
              <i />
            </div>
            <details className="insight-disclosure">
              <summary>كيف وصلنا لهذه النتيجة؟</summary>
              {(() => {
                const counts = heatData.map((x: any) => Number(x.count) || 0).filter((n: number) => n > 0);
                const sample = counts.length && heatMax > 0 ? Math.min(...counts) : 0;
                return (
                  <>
                    {sample ? (
                      <EquationChips
                        parts={[{ value: String(sample), label: "مواعيد الخانة" }, { op: "÷" }, { value: String(heatMax), label: "أعلى خانة" }]}
                        result={{ value: String(Math.round((sample / heatMax) * 100)), unit: "%", label: "شدة اللون" }}
                      />
                    ) : null}
                    <p className={`insight-method${sample ? " sr-only" : ""}`}>تُحسب الكثافة بعدّ المواعيد المتزامنة في كل خانة (يوم × ساعة) داخل النطاق المختار، ثم تُقارن كل خانة بالخانة الأعلى ازدحامًا لتحديد شدّة التلوين.</p>
                  </>
                );
              })()}
            </details>
          </Surface>
          )}
            </div>
          {activeInsightKey === "why" ? (
            <div className="content-stack insight-scene-panel" id="insight-panel-why" role="tabpanel" aria-labelledby="insight-tab-why" tabIndex={0}>
              <LivingScheduleLayer {...livingCommon} embeddedScenes={["why"]} />
            </div>
          ) : null}
          {overview.spatialBurnout ? (
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-spatial"
              role="tabpanel"
              aria-labelledby="insight-tab-spatial"
              hidden={activeInsightKey !== "spatial"}
              tabIndex={activeInsightKey === "spatial" ? 0 : -1}
            >
            <Surface className="spatial-burnout-card">
              <div className="surface-head">
                <div>
                  <span className="surface-kicker">الحركة المكانية</span>
                  <h2>راحة الحركة</h2>
                </div>
                <Building2 />
              </div>
              <div className="spatial-score-row">
                <div className={`spatial-score ${overview.spatialBurnout.highRisk ? "danger" : overview.spatialBurnout.guardedRisk ? "guarded" : "safe"}`}>
                  <Num value={overview.spatialBurnout.score} suffix=" / 100" className="spatial-score-value" />
                  {readingMode === "department" ? <small title="الدرجة تعرض الكلية ذات أكبر ضغط في الحركة">أشد ضغط بين الكليات</small> : null}
                  <small>{overview.spatialBurnout.highRisk ? "الحركة مرهقة" : overview.spatialBurnout.guardedRisk ? "تحتاج مراجعة" : "حركة مريحة"}</small>
                </div>
                <div className="spatial-metrics">
                  {overview.spatialBurnout.highRisk ? <article><span className="spatial-metric-icon"><AlertTriangle /></span><b><Num value={overview.spatialBurnout.highRisk} /></b><span>انتقال مرهق</span></article> : null}
                  {overview.spatialBurnout.guardedRisk ? <article><span className="spatial-metric-icon"><CalendarClock /></span><b><Num value={overview.spatialBurnout.guardedRisk} /></b><span>انتقال ضيق</span></article> : null}
                  {overview.roomCastling?.length ? <article><span className="spatial-metric-icon"><Building2 /></span><b><Num value={overview.roomCastling.length} /></b><span>تبديل آمن</span></article> : null}
                </div>
              </div>
              {overview.spatialBurnout.risks?.length ? <CampusTravelMap risks={overview.spatialBurnout.risks} /> : null}
              {overview.spatialBurnout.risks?.length ? (
                <div className="spatial-risk-list">
                  {overview.spatialBurnout.risks.slice(0, 5).map((risk: any) => (
                    <article key={`${risk.instructorId}-${risk.day}-${risk.fromRowId}-${risk.toRowId}`} className={risk.level}>
                      <span className="risk-mark"><AlertTriangle /></span>
                      <div><strong>{risk.instructorName}{visitingAt(risk.instructorId, risk) ? <> <VisitingBadge compact /></> : null}</strong>{scopeLabel(risk) ? <small className="reading-college-label">{scopeLabel(risk)}</small> : null}<small className="visual-flow-inline">{risk.dayLabel} · <b>{risk.fromBuilding}</b><ArrowLeftRight aria-hidden="true" /><b>{risk.toBuilding}</b></small></div>
                      <b>{risk.gapMinutes}د <small>متاح</small></b>
                      <span>{risk.requiredMinutes}د مطلوبة</span>
                    </article>
                  ))}
                </div>
              ) : <div className="spatial-clear"><CheckCircle2 /><div><strong>لا توجد انتقالات مرهقة</strong><span>الفواصل تستوعب زمن الحركة.</span></div></div>}
              {overview.roomCastling?.length ? (
                <div className="castling-strip castling-cards">
                  <div className="castling-head"><span className="castling-mark"><Building2 /></span><div><strong>تبديل القاعات</strong><span>اقتراحات أقرب دون تغيير الوقت</span></div></div>
                  <div className="castling-options">
                  {overview.roomCastling.slice(0, 3).map((proposal: any, index: number) => (
                    <button key={`${proposal.rowId}-${index}`} type="button" data-guide-ignore="اقتراح تبديل قاعة تجريبي داخل مساحة الذكاء؛ يفتح سيناريو للمراجعة ولا يحفظ تلقائيًا" onClick={() => void openSpatialProposal(proposal)}>
                      <span className="castling-person"><UsersRound />{proposal.instructorName}{visitingAt(proposal.instructorId, proposal) ? <> <VisitingBadge compact /></> : null}</span>{scopeLabel(proposal) ? <span className="reading-college-label">{scopeLabel(proposal)}</span> : null}
                      <strong dir="ltr">{proposal.before.roomCode}/{proposal.before.roomHall} <ArrowLeftRight /> {proposal.after.roomCode}/{proposal.after.roomHall}</strong>
                      <small role="img" aria-label="متاح وآمن" title="متاح وآمن"><CheckCircle2 aria-hidden="true" /></small>
                      <ChevronLeft className="castling-open" />
                    </button>
                  ))}
                  </div>
                </div>
              ) : null}
              <details className="insight-disclosure">
                <summary>كيف وصلنا لهذه النتيجة؟</summary>
                {(() => {
                  const top: any = overview.spatialBurnout.risks?.[0];
                  const gap = Number(top?.gapMinutes), need = Number(top?.requiredMinutes);
                  const ok = Number.isFinite(gap) && Number.isFinite(need);
                  return (
                    <>
                      {ok ? (
                        <EquationChips
                          parts={[{ value: String(gap), unit: "د", label: "فراغ متاح" }, { op: "\u2212" }, { value: String(need), unit: "د", label: "مطلوب" }]}
                          result={{ value: String(gap - need), unit: "د", label: "الهامش" }}
                          tone={gap - need < 0 ? "danger" : "ok"}
                        />
                      ) : null}
                      <p className={`insight-method${ok ? " sr-only" : ""}`}>نقارن الفراغ المتاح بزمن الانتقال المطلوب بين المباني؛ كل انتقال أضيق من اللازم يخفض راحة الحركة.</p>
                    </>
                  );
                })()}
              </details>
            </Surface>
            </div>
          ) : null}
            {isPowerAdmin ? <div
              className="content-stack insight-scene-panel"
              id="insight-panel-health"
              role="tabpanel"
              aria-labelledby="insight-tab-health"
              hidden={activeInsightKey !== "health"}
              tabIndex={activeInsightKey === "health" ? 0 : -1}
            >
          <Surface className="data-health">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">للإدارة الرئيسية</span>
                <h2>تشخيص النظام</h2>
              </div>
              <CheckCircle2 />
            </div>
            <div className="health-advanced-row">
              <article className={operationsReview?.anomalies?.length ? "hit" : ""}><span>منطقياً</span><b>{Number(operationsReview?.anomalies?.length||0).toLocaleString("ar-KW-u-nu-latn")}</b><small>شذوذ محتمل</small></article>
              <article className={experienceHealth?.score<75 ? "hit" : ""}><span>تجربة القسم</span><b>{experienceHealth?.score ?? "—"}</b><small>{experienceHealth?.label || "تُقاس مع الاستخدام"}</small></article>
              <article><span>زمن الاستجابة (المئين 95)</span><b>{experienceHealth?.p95 ? countOf(experienceHealth.p95, AR.millisecond) : "—"}</b><small>أبطأ 5%</small></article>
              <article className={experienceHealth?.failures ? "hit" : ""}><span>أخطاء الواجهة</span><b>{experienceHealth?.failures ?? 0}</b><small>آخر 14 يوماً</small></article>
            </div>
            {operationsReview?.anomalies?.length ? <details className="insight-disclosure"><summary>الشذوذ المنطقي ({operationsReview.anomalies.length})</summary><ul className="health-anomaly-list">{operationsReview.anomalies.slice(0,6).map((item:any,index:number)=><li key={`${item.kind}-${item.rowId||index}`} className={item.severity}><strong>{item.title}</strong>{scopeLabel(item) ? <small>{scopeLabel(item)}</small> : null}<span>{item.detail}</span></li>)}</ul></details>:null}
            {experienceHealth?.replays?.length ? <details className="insight-disclosure"><summary>إعادة عرض الأعطال الأخيرة ({experienceHealth.replays.length})</summary><div className="failure-replays">{experienceHealth.replays.slice(0,4).map((item:any,index:number)=><article key={`${item.timestamp}-${index}`}><strong>{item.name}</strong><small>{new Date(item.timestamp).toLocaleString("ar-KW-u-nu-latn")}</small><p>{item.message}</p><ol>{(item.breadcrumbs||[]).slice(-6).map((b:any,i:number)=><li key={i}>{b.action}</li>)}</ol></article>)}</div></details>:null}
            {experienceHealth?.slowest?.length ? <details className="insight-disclosure"><summary>أبطأ مسارات الخادم</summary><div className="slow-endpoints">{experienceHealth.slowest.map((item:any)=><span key={item.path}><code>{item.path}</code><b>{countOf(item.avg, AR.millisecond)}</b></span>)}</div></details>:null}
            <p>
              هذه القراءة لا تحذف ولا تصحح شيئاً تلقائياً؛ هدفها فقط كشف ما قد
              يفوت أثناء العمل السريع.
            </p>
          </Surface>
            </div> : null}
          {genome ? (
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-genome"
              role="tabpanel"
              aria-labelledby="insight-tab-genome"
              hidden={activeInsightKey !== "genome"}
              tabIndex={activeInsightKey === "genome" ? 0 : -1}
            >
            <Surface className="schedule-genome">
              <div className="surface-head">
                <div>
                  <span className="surface-kicker">بصمة الجدول</span>
                  <h2>نمط القسم عبر الفصول</h2>
                </div>
                <Dna />
              </div>
              <div className="genome-core">
                <div className="genome-score">
                  <span>مطابقة النمط</span>
                  <strong>
                    {genome.compatibility == null
                      ? "—"
                      : `${genome.compatibility}%`}
                  </strong>
                  <small>
                    {genome.available
                      ? `${countOf(genome.history.length, AR.term)} سابق في البصمة`
                      : "البصمة تبدأ من هذا الفصل"}
                  </small>
                </div>
                <div className="genome-days">
                  {Object.entries(genome.dna?.dayShares || {}).map(
                    ([key, value]: any) => (
                      <article key={key}>
                        <span>{dayLabels[key]}</span>
                        <i>
                          <b
                            style={{
                              width: `${Math.min(100, Number(value) || 0)}%`,
                            }}
                          />
                        </i>
                        <strong>{value}%</strong>
                      </article>
                    ),
                  )}
                </div>
                <div className="genome-rooms">
                  <span>القاعات المعتادة</span>
                  {(genome.dna?.rooms || []).slice(0, 5).map((r: any) => (
                    <b key={r.key}>{r.label}</b>
                  ))}
                </div>
              </div>
              <details className="insight-disclosure genome-details">
                <summary>تفاصيل القراءة</summary>
              <div className="genome-patterns">
                <section>
                  <span>نمط ساعات البداية</span>
                  <div>
                    {Object.entries(genome.dna?.timeShares || {}).sort((a:any,b:any)=>Number(b[1])-Number(a[1])).slice(0, 4).map(
                      ([key, value]: any) => (
                        <b key={key}>
                          <small>{/^(\d{2})-(\d{2})$/.test(key) ? formatScheduleTimeRange(`${key.slice(0, 2)}:00`, `${key.slice(3, 5)}:00`) : key.replace(/^0/, "")}</small>
                          <strong>{value}%</strong>
                        </b>
                      ),
                    )}
                  </div>
                </section>
                <section>
                  <span>أماكن الاختناق التاريخية</span>
                  <div>
                    {(genome.dna?.bottlenecks || [])
                      .slice(0, 3)
                      .map((b: any) => (
                        <b key={`${b.day}-${b.time}`}>
                          <small>
                            {b.label || dayLabels[b.day]} · {scheduleClockForDisplay(b.time)}
                          </small>
                          <strong>{b.avgLoad}</strong>
                        </b>
                      ))}
                  </div>
                </section>
              </div>
              {(() => {
                /* من ورقة «بصمة القسم» التي كانت فوق الجدول: الأستاذُ الأكثر تقييداً، وشرائحُ الفصول السابقة. */
                const counts = new Map<number, number>();
                readingRows.forEach(row => counts.set(Number(row.AdInstructorId), (counts.get(Number(row.AdInstructorId)) || 0) + Math.max(1, Object.keys(dayLabels).filter(day => (row as any)[day]).length)));
                const constrained = new Map<number, number>();
                (constraints || []).filter((c: any) => c.enabled !== false && c.AdInstructorId).forEach((c: any) => constrained.set(Number(c.AdInstructorId), (constrained.get(Number(c.AdInstructorId)) || 0) + 1));
                const id = [...new Set([...constrained.keys(), ...counts.keys()])].filter(Boolean)
                  .sort((a, b) => (constrained.get(b) || 0) - (constrained.get(a) || 0) || (counts.get(b) || 0) - (counts.get(a) || 0))[0];
                const name = id ? instructors.find(person => Number(person.AdInstructorId) === id)?.AdInstructorName || `أستاذ ${id}` : "";
                const history = Array.isArray(genome.history) ? genome.history : [];
                if (!id && !history.length) return null;
                return (
                  <div className="genome-extra">
                    {id ? (
                      <article className="genome-constrained">
                        <UsersRound aria-hidden="true" />
                        <span>
                          <small>الأستاذ الأكثر تقييداً</small>
                          <strong>{name}{visitingInReading(id) ? <> <VisitingBadge compact /></> : null}</strong>
                          <small>{constrained.get(id) ? `${countOf(constrained.get(id) || 0, AR.constraint)} مباشرةً · ` : ""}{countOf(counts.get(id) || 0, AR.appointment)} أسبوعياً</small>
                        </span>
                      </article>
                    ) : null}
                    {history.length ? (
                      <div className="genome-history" aria-label="الفصول في البصمة">
                        {history.map((item: any) => (
                          <span key={item.termId}><b>{item.termName}</b><small>{countOf(item.count, AR.appointment)} · {item.avgGap}د فراغ</small></span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
              <div className="genome-deviations">
                {(genome.deviations || [])
                  .slice(0, 2)
                  .map((d: any, i: number) => (
                    <article className={d.severity || "info"} key={i}>
                      <i />
                      <div>
                        <strong>{d.title}</strong>
                        <p>{d.detail}</p>
                      </div>
                    </article>
                  ))}
              </div>
              </details>
              {operationsReview?.unwrittenRules?.length ? (
                <div className="unwritten-rules">
                  <div className="unwritten-rules-head"><Sparkles /><span><small>قواعد لم يكتبها أحد</small><strong>مكتشفة من التاريخ</strong></span></div>
                  <div className="unwritten-rules-list">{operationsReview.unwrittenRules.slice(0,6).map((rule:any)=><article key={rule.id}><b>{rule.confidence}%</b><span><strong>{rule.title}</strong>{scopeLabel(rule) ? <small>{scopeLabel(rule)}</small> : null}<small>{rule.detail}</small></span><button type="button" onClick={()=>void proposeUnwrittenRule(rule)} disabled={busy} title="أضفها كقاعدة مقترحة إلى دفتر القرارات" aria-label={`اقتراح قاعدة: ${rule.title}`}><Plus /></button></article>)}</div>
                </div>
              ) : null}
              <div className="genome-foot">
                <History />
                <span>
                  متوسط الفراغ التاريخي:{" "}
                  <b>{formatUnitMetricArabic(genome.dna?.avgGap ?? "—", "دقيقة", 0)}</b>. هذه قراءة نمطية
                  وليست قاعدة إلزامية.
                </span>
              </div>
            </Surface>
            </div>
          ) : null}
          {activeInsightKey === "actualDemand" && collegeId && sectionId && termId ? (
            <div className="content-stack insight-scene-panel" id="insight-panel-actualDemand" role="tabpanel" aria-labelledby="insight-tab-actualDemand" tabIndex={0}>
              <SectionPlan collegeId={Number(collegeId)} sectionId={Number(sectionId)} termId={Number(termId)} onReading={setActualDemand} />
            </div>
          ) : null}
          {activeInsightKey === "improve" && collegeId && sectionId && termId ? (
            <div className="content-stack insight-scene-panel" id="insight-panel-improve" role="tabpanel" aria-labelledby="insight-tab-improve" tabIndex={0}>
              <AcademicAdvicePanel collegeId={collegeId} sectionId={sectionId} termId={termId} defaultOpen />
            </div>
          ) : null}
          {activeInsightKey === "predict" ? (
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-predict"
              role="tabpanel"
              aria-labelledby="insight-tab-predict"
              tabIndex={0}
            >
              <PredictiveInsightPanel
                canSchedule
                onChanged={() => undefined}
                scope={{ mode: readingMode === "department" ? "department" : "college", collegeId: Number(collegeId) || 0, sectionId: Number(sectionId) || 0 }}
              />
            </div>
          ) : null}
          </section>
        </div>
      ) : null}

      {insightReason ? (
        <div className="intel-reason-backdrop no-print" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInsightReason(null); }}>
          <section className={`intel-reason-sheet tone-${insightReason.tone || "plain"}`} role="dialog" aria-modal="true" aria-label={insightReason.title}>
            <header className="intel-reason-head">
              <span className="intel-reason-icon" aria-hidden="true">{insightReason.icon || <CircleHelp />}</span>
              <div><small>{insightReason.kicker}</small><strong>{insightReason.title}</strong></div>
              {insightReason.metric ? <b className="intel-reason-metric">{insightReason.metric === "✓"
                ? <><Check className="intel-reason-check" aria-hidden="true" /><span className="sr-only">✓</span></>
                : <Num value={insightReason.metric} />}</b> : null}
              <button type="button" data-guide-ignore="إغلاق نافذة شرح المؤشر فقط" onClick={() => setInsightReason(null)} aria-label="إغلاق التفاصيل" title="إغلاق"><X /></button>
            </header>
            {insightReason.summary ? <p className="intel-reason-summary">{insightReason.summary}</p> : null}
            {insightReason.facts?.length ? (
              <div className="intel-reason-facts">
                {insightReason.facts.map((fact, index) => <article key={`${fact.label}-${index}`}><small>{fact.label}</small><strong><Num value={fact.value} /></strong></article>)}
              </div>
            ) : null}
            {insightReason.items?.length ? (
              <div className="intel-reason-items" aria-label="التفاصيل الفعلية">
                {insightReason.items.map((item, index) => (
                  <article key={`${item.title}-${index}`}>
                    <span className="intel-reason-item-index">{(index + 1).toLocaleString("ar-KW-u-nu-latn")}</span>
                    <div><strong>{item.title}</strong>{item.subtitle ? <small className="intel-reason-course-name">{item.subtitle}</small> : null}{item.meta ? <small>{item.meta}</small> : null}</div>
                    {item.value ? <b dir="ltr"><Num value={item.value} /></b> : null}
                  </article>
                ))}
              </div>
            ) : null}
            {insightReason.bars?.length ? (
              <div className="intel-reason-bars" role="img" aria-label="رسم توضيحي للسبب">
                {insightReason.bars.map((bar, index) => (
                  <div key={`${bar.label}-${index}`}><span>{bar.label}</span><i><b style={{ width:`${Math.max(3,Math.min(100,(bar.value/Math.max(1,bar.max))*100))}%` }} /></i><em><Num value={bar.caption ?? bar.value} /></em></div>
                ))}
              </div>
            ) : null}
            <footer><ShieldCheck aria-hidden="true" /><span>شرح فقط · لا يغيّر الجدول</span><button type="button" data-guide-ignore="إغلاق نافذة شرح المؤشر فقط" onClick={() => setInsightReason(null)}>تم</button></footer>
          </section>
        </div>
      ) : null}

      {tab === "copilot" ? (
        <nav className="ask-tools-switch no-print" aria-label="أدوات السؤال">
          <span className="surface-kicker">اسأل</span>
          <Segmented
            value={askMode}
            onChange={value => setAskMode(value as "table" | "context")}
            options={[
              { value: "table", label: "اسأل الجدول" },
              { value: "context", label: "مساعد السياق" },
            ]}
          />
        </nav>
      ) : null}
      {tab === "copilot" && askMode === "context" ? (
        <LivingScheduleLayer {...livingCommon} embeddedScenes={["copilot"]} />
      ) : null}
      {tab === "copilot" && askMode === "table" ? (
        <div className="copilot-layout">
          <Surface className="copilot-panel">
            <div className="copilot-head">
              <span className="copilot-mark">
                <BrainCircuit />
              </span>
              <div>
                <span className="surface-kicker">مساعد الجدول</span>
                <h2>اسأل الجدول نفسه</h2>
                <p>تحليل فقط · بلا تعديل</p>
              </div>
              <Badge tone="success">تحليل فقط</Badge>
              {chat.length ? (
                <SecondaryButton
                  type="button"
                  data-guide-ignore="طباعة نتائج الاستعلام فقط ولا تغيّر الجدول"
                  className="copilot-print no-print"
                  onClick={() => { if (!showPwaPrintHelp()) window.print(); }}
                  title="طباعة نتائج الاستعلامات"
                >
                  <Printer aria-hidden="true" /> طباعة النتائج
                </SecondaryButton>
              ) : null}
            </div>
            <div className="prompt-chips">
              {[
                "لماذا يوم الاثنين مزدحم؟",
                "من لديه أكثر من 3 ساعات فراغ؟",
                "ما أفضل القاعات الأقل استخداماً؟",
                "أعطني أفضل توزيع يقلل الفراغات",
              ].map((x) => (
                <button key={x} onClick={() => sendCopilot(x)} disabled={busy}>
                  <Lightbulb />
                  {x}
                </button>
              ))}
            </div>
            <div className="copilot-thread" ref={copilotThread}>
              {chat.length ? (
                chat.map((item, i) => (
                  <React.Fragment key={i}>
                    <div className="chat-user">
                      <span>{user.Name.trim().charAt(0) || "د"}</span>
                      <p>{item.prompt}</p>
                    </div>
                    <div className="chat-assistant" data-copilot-answer={i} tabIndex={-1}>
                      <span>
                        <Sparkles />
                      </span>
                      {(item as any).move ? (
                        <div className="nl-move">
                          {(item as any).move.ok ? (() => {
                            const mv = (item as any).move;
                            return (
                              <>
                                <strong>{mv.preview.course}{mv.preview.section ? ` · شعبة ${mv.preview.section}` : ""}</strong>
                                <div className="nl-move-change">
                                  <span className="nl-from"><i>من</i>{mv.preview.before.days} · <time dir="ltr">{formatScheduleTimeRange(mv.preview.before.start, mv.preview.before.end)}</time></span>
                                  <ArrowLeft aria-hidden="true" />
                                  <span className="nl-to"><i>إلى</i>{mv.preview.after.days} · <time dir="ltr">{formatScheduleTimeRange(mv.preview.after.start, mv.preview.after.end)}</time></span>
                                </div>
                                {mv.conflicts?.length ? (
                                  <ul className="nl-move-conflicts">
                                    {mv.conflicts.slice(0, 4).map((c: any, j: number) => (
                                      <li key={j} className={c.soft ? "soft" : c.severity}>{c.message}</li>
                                    ))}
                                  </ul>
                                ) : <p className="nl-move-clear">لا مانع ظاهر لهذا النقل.</p>}
                                {mv.applied ? (
                                  <span className="nl-move-done"><CheckCircle2 aria-hidden="true" /> تم النقل بنجاح</span>
                                ) : mv.canApply ? (
                                  <button type="button" data-guide-feature-id="schedule.action.move-room" className="nl-move-apply" disabled={busy} onClick={() => applyMove(mv, i)}><WandSparkles aria-hidden="true" /> طبّق النقل</button>
                                ) : (
                                  <span className="nl-move-blocked"><ShieldAlert aria-hidden="true" /> {mv.blockedReason || "يوجد تعارض يمنع النقل"}</span>
                                )}
                              </>
                            );
                          })() : (
                            <p className="nl-move-hint">{(item as any).move.hint || "لم أفهم أمر النقل."}</p>
                          )}
                        </div>
                      ) : (
                        <div className="nl-answer">
                          <strong>{item.answer?.title}</strong>
                          {item.answer?.scope ? <small className="nl-scope-proof"><ShieldCheck aria-hidden="true" /> النطاق: {item.answer.scope.sectionName} · {countOf(item.answer.scope.rowCount, AR.appointment)}</small> : null}

                          {/* The assistant already measured these; a paragraph
                              is the slowest way to hand over a number. */}
                          {item.answer?.figures?.length ? (
                            <div className="nl-figures">
                              {item.answer.figures.map((f: any, j: number) => (
                                <article key={j} className={`nl-figure tone-${f.tone || "plain"} ${/[^\d.,\/\s٠-٩]/.test(String(f.value)) ? "is-text" : ""}`.trim()}>
                                  <b><Num value={f.value} /></b>
                                  {f.hint ? <i>{f.hint}</i> : null}
                                  <span>{f.label}</span>
                                </article>
                              ))}
                            </div>
                          ) : null}

                          {/* A change is two numbers and an arrow between them. */}
                          {item.answer?.shift ? (
                            <div className={`nl-shift ${item.answer.shift.better ? "better" : "worse"}`}>
                              <span>{item.answer.shift.label}</span>
                              <b><Num value={item.answer.shift.before} /></b>
                              <ArrowLeft aria-hidden="true" />
                              <b className="to"><Num value={item.answer.shift.after} /></b>
                            </div>
                          ) : null}

                          {/* Six bars are read in the time one sentence takes. */}
                          {item.answer?.bars?.length ? (
                            <div className="nl-bars">
                              {item.answer.bars.map((b: any, j: number) => (
                                <div key={j} className="nl-bar">
                                  <span>{b.label}</span>
                                  <div><i style={{ width: `${Math.max(2, Math.min(100, (b.value / (b.max || 1)) * 100))}%` }} /></div>
                                  <em><Num value={b.caption ?? b.value} /></em>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {!(item.answer?.figures?.length || item.answer?.bars?.length || item.answer?.shift) ? (
                            <>
                              <p>{item.answer?.summary}</p>
                              {item.answer?.bullets?.length ? (
                                <ul>
                                  {item.answer.bullets.map((b: string, j: number) => (
                                    <li key={j}>{b}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                ))
              ) : (
                <div className="copilot-empty">
                  <BrainCircuit />
                  <strong>اسأله كما تسأل زميلك</strong>
                  <span>مثال: انقل 101 إلى {scheduleClockForDisplay("11:00")}</span>
                </div>
              )}
            </div>
            <form
              className="copilot-compose"
              onSubmit={(e) => {
                e.preventDefault();
                sendCopilot();
              }}
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="اكتب سؤالك عن جدول هذا القسم..."
                aria-label="سؤالك عن جدول هذا القسم"
                rows={2}
              />
              <button
                type="submit"
                aria-label="إرسال السؤال"
                title="إرسال السؤال"
                disabled={busy || !prompt.trim()}
              >
                <Send />
              </button>
            </form>
          </Surface>
          <aside className="copilot-context">
            <Surface>
              <span className="surface-kicker">حدود المعرفة</span>
              <h3>{overview?.context?.sectionName}</h3>
              <p>{readingMode === "department" ? "القسم عبر كلياته المسموحة" : "هذه الكلية"} · الحجوزات الخارجية محسوبة.</p>
            </Surface>
            <Surface>
              <span className="surface-kicker">أوامر مفيدة</span>
              {/* These were <span>s: they looked pressable and did nothing.
                  Each now writes its own question into the box. */}
              <div className="mini-command-list">
                {[
                  "أين الفراغات الطويلة عند الأساتذة؟",
                  "إذا نقلت 101 إلى الساعة 11، فما الذي سيتأثر؟",
                  "اقترح أفضل توزيع يقلل الفراغ",
                  "اقرأ القاعات وأقلها استخداماً",
                ].map(text => (
                  <button key={text} type="button" onClick={() => setPrompt(text)}>
                    <Command aria-hidden="true" />
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </Surface>
          </aside>
        </div>
      ) : null}

      {tab === "twin" ? (
        <div className="twin-layout">
          <CardDeck
            value={twinCard}
            onChange={(next) => showTwinCard(next as TwinCard | null)}
            title="بطاقات التجربة"
            hint="كل بطاقة تفتح صفحتها وحدها — لا شيء تحت شيء."
            cards={[
              { value: "hero", label: "النسخة التجريبية", detail: "حالة النسخة وما غيّرته فيها", icon: <Dna />,
                metric: scenario ? String(changedRows.length) : undefined },
              /* «بداية الفصل» من «مركز القرار»: مسودةُ الفصل من فصلٍ سابق، تُراجَع صفاً صفاً ثم تُنشر من «المسودات». */
              { value: "genesis", label: "بداية الفصل", detail: "مسودة الفصل من فصلٍ سابق", icon: <CalendarPlus /> },
              { value: "lab", label: "مختبر القرار", detail: "القواعد والمحاكاة والتحسين", icon: <BrainCircuit />, advanced: true },
              ...(scenario
                ? [
                    { value: "board", label: "لوحة التجربة", detail: "حرّك الوقت وشاهد النتيجة لحظياً", icon: <CalendarClock />,
                      metric: String(scenarioEval?.scenario?.score ?? overview?.score ?? "") },
                    { value: "ledger", label: "سجل التغييرات", detail: "ما غيّرته، موعداً موعداً", icon: <FileClock />,
                      metric: String(changedRows.length) },
                    /* «عدّل موعداً داخل النسخة»: بلا بطاقةٍ في الشبكة (يُفتح من «تعديل السيناريو» والشعبة والنقلة)،
                       لكنه في شريط المرحلة فيبقى «كل البطاقات» فوقه كأي بطاقة. */
                    { value: "editor", label: "تعديل موعد", detail: "عدّل موعداً داخل النسخة", icon: <Pencil />, advanced: true },
                  ]
                : []),
            ]}
          />
          {twinCard === "genesis" && collegeId && sectionId && termId ? (
            <LivingScheduleLayer {...livingCommon} embeddedScenes={["genesis"]} />
          ) : null}
          {twinCard === "hero" ? (
          <Surface className="twin-hero">
            <div>
              <span className="surface-kicker">نسخة الجدول التجريبية</span>
              <h2>
                {scenario
                  ? activeDraftId
                    ? "أنت تعدّل مسودة القسم المشتركة"
                    : "أنت تعمل الآن على نسخة وهمية"
                  : "جرّب أي شيء بدون لمس الجدول الحقيقي"}
              </h2>
              <p>
                {scenario
                  ? `غيّرت ${countOf(changedRows.length, oblique(AR.appointment))} داخل السيناريو حتى الآن. لا شيء منها منشور.`
                  : "انسخ الجدول إلى مساحة تجريبية، حرّك الأوقات والقاعات، قارن النتيجة، وبعدها فقط احفظه كمسودة أو انشره."}
              </p>
            </div>
            <div className="twin-actions">
              {!scenario ? (
                <>
                  <PrimaryButton onClick={startTwin}>
                    <Play /> ابدأ نسخة مطابقة
                  </PrimaryButton>
                  <SecondaryButton onClick={autoSchedule} disabled={busy}>
                    <WandSparkles /> ولّد اقتراحاً ذكياً
                  </SecondaryButton>
                </>
              ) : (
                <>
                  <SecondaryButton
                    onClick={() => evaluateScenario()}
                    disabled={busy}
                  >
                    <RefreshCw /> أعد التقييم
                  </SecondaryButton>
                  <PrimaryButton
                    onClick={async () => {
                      const draft = await saveDraft("what-if");
                      if (draft) openScheduleWorkspace(`تم حفظ «${draft.name}» كمسودة. أنت الآن في الجدول الحقيقي؛ المسودة لم تُنشر بعد.`);
                    }}
                    disabled={busy || !changedRows.length}
                  >
                    <Save /> احفظ كمسودة
                  </PrimaryButton>
                  <GhostButton onClick={() => openScheduleWorkspace("عدت إلى الجدول الحقيقي. النسخة التجريبية لم تغيّر أي موعد منشور.")}>
                    <CalendarClock /> افتح الجدول الحقيقي
                  </GhostButton>
                  <GhostButton
                    onClick={() => {
                      setScenario(null);
                      setScenarioEval(null);
                      setActiveDraftId(null);
                    }}
                  >
                    إغلاق النسخة
                  </GhostButton>
                </>
              )}
            </div>
          </Surface>
          ) : null}
          {twinCard === "lab" ? (
          <Surface className="innovation-suite">
            <div className="innovation-suite-head">
              <div>
                <span className="surface-kicker">مختبر القرار</span>
                <h2>مختبر القرار المتقدم</h2>
                <p>
                  اختبر القواعد والبدائل قبل تطبيقها على الجدول.
                </p>
              </div>
              <span className="innovation-suite-status">النسخة التجريبية</span>
            </div>
            <div className="innovation-tabs" role="group" aria-label="أدوات مختبر القرار">
              <button
                type="button"
                data-guide-ignore="اختيار لوحة القيود داخل مختبر القرار"
                aria-pressed={innovationMode === "constraints"}
                className={innovationMode === "constraints" ? "active" : ""}
                onClick={() => setInnovationMode("constraints")}
              >
                <span>لوحة القيود</span>
                <b aria-label={`${constraints.length} قاعدة`}>{constraints.length}</b>
              </button>
              <button
                type="button"
                data-guide-ignore="اختيار غرفة القرار داخل مختبر القرار"
                aria-pressed={innovationMode === "war"}
                className={innovationMode === "war" ? "active" : ""}
                onClick={() => setInnovationMode("war")}
              >
                <span>غرفة القرار</span>
              </button>
              <button
                type="button"
                data-guide-ignore="اختيار التحسين الآلي داخل مختبر القرار"
                aria-pressed={innovationMode === "autopilot"}
                className={innovationMode === "autopilot" ? "active" : ""}
                onClick={() => setInnovationMode("autopilot")}
              >
                <span>التحسين الآلي</span>
              </button>
              <button
                type="button"
                data-guide-ignore="اختيار مختبر السياسات داخل مختبر القرار"
                aria-pressed={innovationMode === "policy"}
                className={innovationMode === "policy" ? "active" : ""}
                onClick={() => setInnovationMode("policy")}
              >
                <span>مختبر السياسات</span>
              </button>
            </div>
            {innovationMode === "constraints" ? (
              <div className="constraint-canvas">
                <div className="constraint-builder">
                  <div className="constraint-builder-copy">
                    <div>
                      <strong>حوّل قواعد القسم البشرية إلى قيود مفهومة</strong>
                      <span>
                        لا محاضرات بعد وقت محدد، يوم بحث، قاعة إلزامية، حد
                        أقصى للفراغ، أو فاصل بين محاضرتين في القاعة.
                      </span>
                    </div>
                  </div>
                  {/* الخادم يقبل إنشاء القاعدة وتبديلها وحذفها من الإدارة الرئيسية وحدها؛ الباقون يقرؤونها. */}
                  {canEditRules ? (
                  <div className="constraint-form">
                    <Field label="نوع القاعدة">
                      <select
                        value={constraintDraft.type}
                        onChange={(e) =>
                          setConstraintDraft((p: any) => ({
                            ...p,
                            type: e.target.value,
                            /* فاصل الباب دقائق قليلة (١–٦٠)، وحد الفراغ يبدأ من ٣٠. */
                            maxMinutes: e.target.value === "room_doorway" ? 10 : e.target.value === "max_instructor_gap" ? 120 : p.maxMinutes,
                          }))
                        }
                      >
                        <option value="instructor_latest_end">
                          أستاذ · آخر وقت
                        </option>
                        <option value="instructor_day_off">
                          أستاذ · يوم محجوز
                        </option>
                        <option value="department_day_off">
                          القسم · يوم بحث/محجوز
                        </option>
                        <option value="course_room">مقرر · قاعة إلزامية</option>
                        <option value="max_instructor_gap">
                          حد أقصى للفراغ
                        </option>
                        <option value="room_doorway">
                          القاعة · فاصل بين محاضرتين
                        </option>
                      </select>
                    </Field>
                    {constraintDraft.type === "course_room" ? (
                      <Field label="المقرر">
                        <SearchableSelect
                          value={constraintDraft.AdCourseId || ""}
                          onChange={(picked) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              AdCourseId: Number(picked) || 0,
                            }))
                          }
                          options={scopedCourses.map((c) => ({ value: c.AdCourseId, label: c.CourseName, hint: c.CourseCode, keywords: String(c.CourseCode || "") }))}
                          placeholder="اختر المقرر..."
                          ariaLabel="المقرر"
                          searchPlaceholder="اكتب اسم المقرر أو رمزه"
                        />
                      </Field>
                    ) : constraintDraft.type === "department_day_off" ? (
                      <div className="constraint-rule-note">
                        <span>
                          <strong>قاعدة على القسم كله</strong>
                          <small>
                            كل موعد في هذا اليوم = مخالفة.
                          </small>
                        </span>
                      </div>
                    ) : constraintDraft.type === "room_doorway" ? (
                      <div className="constraint-rule-note">
                        <span>
                          <strong>قاعدة على قاعات القسم كلها</strong>
                          <small>
                            محاضرتان متتاليتان في القاعة نفسها بفاصل أقصر = تعارض.
                          </small>
                        </span>
                      </div>
                    ) : (
                      <Field label="أستاذ المقرر">
                        <select
                          value={constraintDraft.AdInstructorId || ""}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              AdInstructorId: Number(e.target.value) || 0,
                            }))
                          }
                        >
                          {constraintDraft.type === "max_instructor_gap" ? (
                            <option value="">كل الأساتذة</option>
                          ) : (
                            <option value="">اختر الأستاذ...</option>
                          )}
                          {instructors.filter(isAssignableInstructor).map((i) => (
                            <option
                              key={i.AdInstructorId}
                              value={i.AdInstructorId}
                            >
                              {withVisitingSuffix(i.AdInstructorName, isVisiting(i.AdInstructorId, collegeId, sectionId))}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {constraintDraft.type === "instructor_latest_end" ? (
                      <Field label="آخر نهاية">
                        <TimeField
                         
                          min={SCHEDULE_DAY_START_TIME}
                          max={SCHEDULE_DAY_END_TIME}
                          value={constraintDraft.time}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              time: e.target.value,
                            }))
                          }
                        />
                      </Field>
                    ) : null}
                    {constraintDraft.type === "instructor_day_off" ||
                    constraintDraft.type === "department_day_off" ? (
                      <Field label="اليوم">
                        <select
                          value={constraintDraft.day}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              day: e.target.value,
                            }))
                          }
                        >
                          {Object.entries(dayLabels).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label as string}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                    {constraintDraft.type === "course_room" ? (
                      <LocationPicker
                        collegeId={collegeId}
                        sectionId={sectionId}
                        termId={termId}
                        allowPending={false}
                        value={{
                          buildingId: constraintDraft.buildingId || undefined,
                          roomId: constraintDraft.roomId || undefined,
                          AdRoomCode: constraintDraft.roomCode || "",
                          AdRoomHall: constraintDraft.roomHall || "",
                          locationStatus: constraintDraft.roomId ? "VERIFIED" : undefined,
                        }}
                        onChange={(patch) => setConstraintDraft((p: any) => ({
                          ...p,
                          buildingId: "buildingId" in patch ? (patch.buildingId || "") : p.buildingId,
                          roomId: "roomId" in patch ? (patch.roomId || "") : p.roomId,
                          roomCode: "AdRoomCode" in patch ? (patch.AdRoomCode || "") : p.roomCode,
                          roomHall: "AdRoomHall" in patch ? (patch.AdRoomHall || "") : p.roomHall,
                        }))}
                      />
                    ) : null}
                    {constraintDraft.type === "max_instructor_gap" ? (
                      <Field label="الدقائق">
                        <input
                          type="number"
                          min="30"
                          max="480"
                          step="30"
                          value={constraintDraft.maxMinutes}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              maxMinutes: Number(e.target.value) || 120,
                            }))
                          }
                        />
                      </Field>
                    ) : null}
                    {constraintDraft.type === "room_doorway" ? (
                      <Field label="الفاصل بالدقائق">
                        <input
                          type="number"
                          min="1"
                          max="60"
                          step="1"
                          value={constraintDraft.maxMinutes}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              maxMinutes: Math.max(1, Math.min(60, Number(e.target.value) || 10)),
                            }))
                          }
                        />
                      </Field>
                    ) : null}
                    <PrimaryButton onClick={createConstraint} disabled={busy}>
                      أضف القاعدة
                    </PrimaryButton>
                  </div>
                  ) : (
                    <div className="constraint-rule-note" role="note">
                      <span>
                        <strong>للقراءة فقط</strong>
                        <small>
                          إضافة القواعد وإيقافها وحذفها لإدارة النظام الرئيسية وحدها؛ تُقرأ هنا وتُحتسب في التقييم.
                        </small>
                      </span>
                    </div>
                  )}
                </div>
                <div className="constraint-list">
                  <div className="constraint-list-head">
                    <strong>القواعد الفعالة لهذا الفصل</strong>
                    {scenarioEval?.constraints ? (
                      <Badge
                        tone={
                          scenarioEval.constraints.scenario.total
                            ? "warning"
                            : "success"
                        }
                      >
                        {scenarioEval.constraints.scenario.total
                          ? `${countOf(scenarioEval.constraints.scenario.total, AR.breach)} في السيناريو`
                          : "السيناريو يحترمها كلها"}
                      </Badge>
                    ) : null}
                  </div>
                  {constraints.length ? (
                    constraints.map((c) => (
                      <article
                        className={c.enabled ? "enabled" : "disabled"}
                        key={c.id}
                      >
                        {canEditRules ? (
                        <button
                          className="constraint-toggle"
                          onClick={() => toggleConstraint(c)}
                        >
                          <i />
                          {c.enabled ? "فعالة" : "متوقفة"}
                        </button>
                        ) : (
                          <span className="constraint-toggle" aria-label={c.enabled ? "قاعدة فعالة" : "قاعدة متوقفة"}>
                            <i />
                            {c.enabled ? "فعالة" : "متوقفة"}
                          </span>
                        )}
                        <div>
                          <strong>{c.label}</strong>
                          <small>
                            {c.userName} ·{" "}
                            {new Date(c.createdAt).toLocaleDateString("ar-KW-u-nu-latn")}
                          </small>
                        </div>
                        {canEditRules ? (
                        <button
                          data-guide-ignore="حذف قاعدة محلية داخل النسخة التجريبية وله تأكيده الخاص"
                          className="constraint-delete"
                          onClick={() => deleteConstraint(c)}
                          title="حذف القاعدة"
                        >
                          حذف
                        </button>
                        ) : null}
                      </article>
                    ))
                  ) : (
                    <div className="innovation-empty">
                      {canEditRules
                        ? "لا توجد قواعد بعد. أضف أول قاعدة بشرية وستبدأ النسخة التجريبية بمحاسبة السيناريوهات عليها."
                        : "لا توجد قواعد بعد لهذا الفصل."}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            {innovationMode === "war" ? (
              <div className="war-room">
                <div className="war-control">
                  <div>
                    <strong>غرفة قرار اللجنة</strong>
                    <p>
                      اختر المشكلة، ثم اعرض ثلاثة حلول على اللجنة جنباً إلى جنب.
                      اختيار اللجنة يتحول إلى مسودة فقط.
                    </p>
                  </div>
                  <div className="war-picker">
                    <Field label="المشكلة">
                      <select
                        value={warRowId}
                        onChange={(e) =>
                          setWarRowId(Number(e.target.value) || "")
                        }
                      >
                        <option value="">القرار الأهم الآن — يختاره النظام</option>
                        {Array.from(
                          new Map(
                            (overview?.conflicts || []).map((c: any) => [
                              c.rowId,
                              c,
                            ]),
                          ).values(),
                        )
                          .slice(0, 12)
                          .map((c: any) => (
                            <option key={c.rowId} value={c.rowId}>
                              {c.message} · موعد #{c.rowId}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <PrimaryButton onClick={runWarRoom} disabled={warBusy}>
                      {warBusy ? "أبني السيناريوهات…" : "افتح غرفة القرار"}
                    </PrimaryButton>
                  </div>
                </div>
                {warRoom ? (
                  <>
                    {/* «القرار الأهم الآن» (كان نافذةً فوق الجدول): المشكلةُ نفسها، وبابُها إلى الموعد الأصلي. */}
                    <div className="decision-problem war-problem">
                      <span>المشكلة التي تستحق القرار</span>
                      <h3>
                        {warRoom.issue
                          ? <>{warRoom.issue.courseName}<CourseTags courseId={rows.find((r) => r.id === warRoom.issue.rowId)?.AdCourseId} />{` · شعبة ${warRoom.issue.sectionCode}`}</>
                          : "الجدول مستقر"}
                      </h3>
                      <p>
                        {warRoom.issue
                          ? `${countOf(warRoom.issue.conflictCount, AR.position)} بحاجة إلى تحقق · ${warRoom.issue.professorName || ""} · ${(() => { const issueRow = rows.find((r) => r.id === warRoom.issue.rowId); return issueRow?.AdRoomCode ? `${issueRow.AdRoomCode}/${issueRow.AdRoomHall || ""}` : ""; })()}`
                          : "لا يوجد مانع زمني واضح؛ حافظ على الوضع الحالي وراجع نقطة الهشاشة فقط."}
                      </p>
                      {warRoom.issue ? (
                        <SecondaryButton
                          type="button"
                          data-guide-ignore="يفتح الموعد الأصلي (ومعه المواعيد المتداخلة معه) في نموذج التعديل على الجدول؛ لا يحفظ شيئاً"
                          onClick={() => {
                            const row = rows.find((r) => r.id === warRoom.issue.rowId);
                            if (!row) return;
                            const days = Object.keys(dayLabels);
                            const sameDay = (a: FSchedule, b: FSchedule) => days.some(day => Boolean((a as any)[day] && (b as any)[day]));
                            const overlaps = (a: FSchedule, b: FSchedule) => String(a.fstarttime) < String(b.fendtime) && String(a.fendtime) > String(b.fstarttime);
                            const sameRoom = (a: FSchedule, b: FSchedule) => roomIdentityKey(a) !== "|" && roomIdentityKey(a) === roomIdentityKey(b);
                            const sameSection = (a: FSchedule, b: FSchedule) => Number(a.AdCourseId) === Number(b.AdCourseId) && String(a.SCode) === String(b.SCode);
                            const queue = [row, ...rows.filter(other =>
                              other.id !== row.id && sameDay(other, row) && overlaps(other, row) && (
                                Number(other.AdInstructorId) === Number(row.AdInstructorId) || sameRoom(other, row) || sameSection(other, row)
                              ))];
                            openInScheduleEditor(queue.map(item => Number(item.id)));
                          }}
                        >
                          افتح الموعد الأصلي
                        </SecondaryButton>
                      ) : null}
                    </div>
                    <div className="war-baseline">
                      <span>الوضع الحالي</span>
                      <b className="score-ring-slot"><MiniRing value={Number(warRoom.baseline.score)} /></b>
                      <small>
                        {countOf(warRoom.baseline.conflicts, AR.blocker)} ·{" "}
                        {warRoom.baseline.avgGap}د فراغ
                      </small>
                    </div>
                    <div className="war-options">
                      {warRoom.options.map((o: any) => (
                        <article
                          key={o.id}
                          className={o.rank === 1 ? "recommended" : ""}
                        >
                          <span className="war-rank">0{o.rank}</span>
                          <h3>{o.title}</h3>
                          <p>{o.reason}</p>
                          <div className="war-metrics">
                            <span>
                              <b>{o.score}</b> جودة
                            </span>
                            <span>
                              <b>
                                {o.deltaScore > 0
                                  ? `+${o.deltaScore}`
                                  : o.deltaScore}
                              </b>{" "}
                              فرق
                            </span>
                            <span>
                              <b>{o.conflicts}</b> {nounFor(o.conflicts, AR.blocker)}
                            </span>
                            <span>
                              <b>{o.avgGap}د</b> فراغ عام
                            </span>
                            <span
                              title={withVisitingSuffix(String(o.professorImpact?.name || ""), Boolean(o.professorImpact?.visiting))}
                              className={
                                o.professorImpact?.gapDelta > 0
                                  ? "warn"
                                  : o.professorImpact?.gapDelta < 0
                                    ? "ok"
                                    : ""
                              }
                            >
                              <b>
                                {o.professorImpact?.gapDelta > 0
                                  ? `+${o.professorImpact.gapDelta}`
                                  : o.professorImpact?.gapDelta || 0}
                                د
                              </b>{" "}
                              أثر الأستاذ
                            </span>
                            <span
                              title={`من ${o.roomImpact?.from || "—"} إلى ${o.roomImpact?.to || "—"}`}
                            >
                              <b>{o.roomImpact?.changed ? "تغيير" : "ثابتة"}</b>{" "}
                              القاعة
                            </span>
                            <span
                              className={o.constraintViolations ? "warn" : "ok"}
                            >
                              <b>{o.constraintViolations}</b> كسر قاعدة
                            </span>
                          </div>
                          <div className="war-actions">
                            <SecondaryButton
                              data-guide-ignore="يفتح خيار اللجنة داخل النسخة التجريبية فقط؛ لا يكتب شيئاً"
                              onClick={() => openScenarioOption(o)}
                            >
                              افتح في النسخة التجريبية
                            </SecondaryButton>
                            <PrimaryButton
                              data-guide-ignore="يحفظ خيار اللجنة كمسودة تجريبية فقط"
                              onClick={() =>
                                saveOptionAsDraft(o, `خيار اللجنة ${o.rank}`)
                              }
                            >
                              اختيار اللجنة · مسودة
                            </PrimaryButton>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="innovation-empty">
                    غرفة القرار لا تغيّر شيئاً. ستبني ثلاثة مسارات قابلة
                    للمقارنة فقط.
                  </div>
                )}
              </div>
            ) : null}
            {innovationMode === "policy" ? (
              <div className="policy-lab">
                <div className="policy-lab-head">
                  <div><strong>اختبر السياسة قبل إصدارها</strong><p>{isPowerAdmin ? "الجامعة أو القسم · آخر 10 سنوات كمرجع" : "قسمك · آخر 10 سنوات كمرجع"}</p></div>
                  <Badge tone="success">محاكاة فقط</Badge>
                </div>
                <div className="policy-controls">
                  <Field label="السياسة">
                    <select value={policyDraft.type} onChange={e=>setPolicyDraft((p:any)=>({...p,type:e.target.value}))}>
                      <option value="day_off">يوم بلا محاضرات</option>
                      <option value="close_building">إغلاق مبنى</option>
                      <option value="no_classes_after">لا محاضرات بعد وقت</option>
                      <option value="growth">نمو الطلب</option>
                    </select>
                  </Field>
                  {policyDraft.type==="day_off"?<Field label="اليوم"><select value={policyDraft.day} onChange={e=>setPolicyDraft((p:any)=>({...p,day:e.target.value}))}>{Object.entries(dayLabels).map(([key,label])=><option key={key} value={key}>{String(label)}</option>)}</select></Field>:null}
                  {policyDraft.type==="close_building"?<Field label="المبنى"><BuildingPicker collegeId={collegeId} sectionId={sectionId} termId={termId} value={policyDraft.buildingId||""} onChange={building=>setPolicyDraft((p:any)=>({...p,buildingId:building?.id||"",building:building?.officialCode||""}))} /></Field>:null}
                  {policyDraft.type==="no_classes_after"?<Field label="آخر وقت"><TimeField value={policyDraft.time} onChange={e=>setPolicyDraft((p:any)=>({...p,time:e.target.value}))} /></Field>:null}
                  {policyDraft.type==="growth"?<Field label="النمو %"><input type="number" min="1" max="100" value={policyDraft.growth} onChange={e=>setPolicyDraft((p:any)=>({...p,growth:Number(e.target.value)||1}))} /></Field>:null}
                  <Field label="النطاق"><select value={policyDraft.scope} onChange={e=>{setPolicyResult(null);setPolicyDraft((p:any)=>({...p,scope:e.target.value}));}}><option value="department">هذه الكلية</option>{hasMultipleDepartmentColleges ? <option value="family">كل كليات القسم</option> : null}{isPowerAdmin?<option value="university">الجامعة</option>:null}</select></Field>
                  <PrimaryButton onClick={runPolicy} disabled={policyBusy||(policyDraft.type==="close_building"&&!policyDraft.building.trim())}>{policyBusy?"أحاكي…":"اختبر"}</PrimaryButton>
                </div>
                {policyResult?<div className="policy-result">
                  <div className="policy-result-hero"><strong>{Number(policyResult.affected||0).toLocaleString("ar-KW-u-nu-latn")}</strong><span>{policyDraft.type==="growth"?"موعد/شعبة إضافية تقديرياً":"موعداً سيتأثر"}</span><i style={{["--policy-share" as any]:`${Math.min(100,Number(policyResult.share||0))}%`}} /></div>
                  <div className="policy-metrics"><article><b>{policyResult.share}%</b><span>الحالي</span></article><article><b>{policyResult.historicalShare}%</b><span>تاريخياً</span></article><article><b>{policyResult.impact?.sections||0}</b><span>{nounFor(policyResult.impact?.sections||0, AR.department)}</span></article><article><b>{policyResult.impact?.instructors||0}</b><span>{nounFor(policyResult.impact?.instructors||0, AR.instructor)}</span></article></div>
                  <p>{policyResult.summary}</p><small>{policyResult.guardrail}</small>
                </div>:<div className="innovation-empty">اختر سياسة واحدة. سترى أثرها على الواقع الحالي وعلى التاريخ قبل أن تتحول إلى قاعدة.</div>}
              </div>
            ) : null}
            {innovationMode === "autopilot" ? (
              <div className="autopilot-lab">
                <div className="autopilot-command">
                  <div>
                    <div>
                      <strong>تحسين آلي ببوابة بشرية</strong>
                      <p>
                        اكتب هدفك · يعرض أفضل ثلاثة.
                      </p>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={autopilotGoal}
                    onChange={(e) => setAutopilotGoal(e.target.value)}
                    placeholder="مثال: قلل الفراغات، لا تغيّر الأيام…"
                    aria-label="هدف الطيار الآلي"
                  />
                  <div className="autopilot-guard">
                    <span>
                      لا يغيّر الأيام ولا القاعات في هذا الإصدار الآمن، ولا يملك
                      صلاحية النشر.
                    </span>
                    <PrimaryButton
                      onClick={runAutopilot}
                      disabled={autopilotBusy || !autopilotGoal.trim()}
                    >
                      {autopilotBusy ? "أجرب السيناريوهات…" : "شغّل التحسين الآلي"}
                    </PrimaryButton>
                  </div>
                </div>
                {autopilot ? (
                  <>
                    <div className="autopilot-summary">
                      <strong>{autopilot.explored}</strong>
                      <span>سيناريو تم توليده</span>
                      <i />
                      <small>
                        البوابة البشرية فعالة · النشر = مستحيل من هذه الأداة
                      </small>
                    </div>
                    <div className="autopilot-options">
                      {autopilot.options.map((o: any) => (
                        <article key={o.id}>
                          <div className="auto-option-head">
                            <span>#{o.rank}</span>
                            <div>
                              <strong>{o.title}</strong>
                              <small>{countOf(o.changed, AR.appointment)} {nounFor(o.changed, AR.changesVerb)}</small>
                            </div>
                            <b className="score-ring-slot"><MiniRing value={Number(o.score)} /></b>
                          </div>
                          <div className="auto-metrics">
                            <span>{countOf(o.conflicts, AR.blocker)}</span>
                            <span>{o.avgGap}د فراغ</span>
                            <span>{o.imbalance}% عدم توازن</span>
                            <span
                              className={o.constraintViolations ? "warn" : "ok"}
                            >
                              {countOf(o.constraintViolations, AR.breach)} للقواعد
                            </span>
                          </div>
                          <ul>
                            {o.explanation.map((x: string, i: number) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                          <div className="war-actions">
                            <SecondaryButton
                              onClick={() => openScenarioOption(o)}
                            >
                              افتح السيناريو
                            </SecondaryButton>
                            <PrimaryButton
                              onClick={async () => {
                                await saveOptionAsDraft(o, `خطة تلقائية ${o.rank}`);
                                openScheduleWorkspace("حُفظت الخطة التلقائية كمسودة فقط. أنت الآن في الجدول الحقيقي للمراجعة.");
                              }}
                            >
                              احفظ كمسودة
                            </PrimaryButton>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="innovation-empty">
                    التحسين الآلي لن يلمس الجدول الحقيقي. حتى أفضل نتيجة تحتاج منك
                    تحويلها إلى مسودة ثم مراجعتها ثم نشرها يدوياً من شاشة
                    الاعتماد.
                  </div>
                )}
              </div>
            ) : null}
          </Surface>
          ) : null}
          {scenario && twinCard === "board" ? (
            <>
              <section className="twin-score-row" aria-label="مقارنة جودة الجدول والسيناريو">
                <article className="twin-score-card baseline">
                  <span>الجدول الحالي</span>
                  <strong><Num value={scenarioEval?.baseline?.score ?? overview?.score} /></strong>
                  <small>من 100</small>
                </article>
                <span className="twin-score-arrow" aria-hidden="true"><ArrowLeftRight /></span>
                <button
                  type="button"
                  className="twin-delta twin-score-action"
                  onClick={() => void evaluateScenario()}
                  disabled={busy}
                  aria-label="إعادة حساب فرق الجودة"
                  title="إعادة حساب الجودة الآن"
                >
                  <b>
                    {scenarioEval
                      ? <Num
                          prefix={(scenarioEval.scenario.score || 0) - (scenarioEval.baseline.score || 0) >= 0 ? "+" : ""}
                          value={(scenarioEval.scenario.score || 0) - (scenarioEval.baseline.score || 0)} />
                      : "—"}
                  </b>
                  <span>{busy ? "أحسب الجودة…" : "فرق الجودة"}</span>
                </button>
                {scenarioEval?.constraints ? (
                  <div
                    className={`twin-constraint-score ${scenarioEval.constraints.scenario.total ? "warn" : "ok"}`}
                  >
                    <b>{scenarioEval.constraints.scenario.total}</b>
                    <span>مخالفات القيود</span>
                  </div>
                ) : null}
              </section>
              <Surface className="twin-visual-board">
                <div className="surface-head">
                  <div>
                    <span className="surface-kicker">المساحة البصرية التجريبية</span>
                    <h2>حرّك الوقت… وشاهد النتيجة لحظياً</h2>
                  </div>
                  <div className="twin-board-head-actions">
                    <button type="button" className="twin-editor-link" onClick={() => showTwinCard("editor")}>
                      تعديل السيناريو
                    </button>
                    <span className="twin-live">
                      <i /> تقييم تلقائي
                    </span>
                  </div>
                </div>
                <p className="soft-copy">
                  اسحب أي موعد إلى نصف ساعة أخرى. أيام اللقاء تبقى كما هي
                  للحماية؛ غيّر الأيام من محرر السيناريو إذا كان القرار مقصوداً.
                </p>
                <div className="twin-week-scroll">
                  <div className="twin-week-grid">
                    <div className="twin-grid-corner">الوقت</div>
                    {Object.entries(dayLabels).map(([key, label]) => (
                      <strong className="twin-day-head" key={key}>
                        {label as string}
                      </strong>
                    ))}
                    {twinSlots.map((time) => (
                      <React.Fragment key={time}>
                        <span className="twin-time" dir="ltr">
                          {time}
                        </span>
                        {Object.keys(dayLabels).map((day) => (
                          <div
                            className="twin-drop-cell"
                            key={`${day}-${time}`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const id = Number(
                                e.dataTransfer.getData("text/twin-id"),
                              );
                              if (id) moveTwinTime(id, time);
                            }}
                          >
                            {scenario
                              .filter(
                                (r) =>
                                  Boolean((r as any)[day]) &&
                                  r.fstarttime === time,
                              )
                              .map((r) => (
                                <article
                                  className="twin-event"
                                  draggable
                                  key={`${day}-${r.id}`}
                                  onDragStart={(e) =>
                                    e.dataTransfer.setData(
                                      "text/twin-id",
                                      String(r.id),
                                    )
                                  }
                                  onClick={() => setScenarioId(r.id)}
                                  title={`${r.AdCourseName} · شعبة ${r.SCode}`}
                                >
                                  <strong>{r.AdCourseName}<CourseTags courseId={r.AdCourseId} /></strong>
                                  <span>
                                    {r.SCode} · {r.AdRoomCode}/{r.AdRoomHall}
                                  </span>
                                </article>
                              ))}
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </Surface>
            </>
          ) : null}
          {scenario && twinCard === "editor" ? (
              <div className="twin-workbench">
                <Surface className="scenario-editor">
                  <div className="surface-head">
                    <div>
                      <span className="surface-kicker">ماذا لو؟</span>
                      <h2>عدّل موعداً داخل النسخة</h2>
                    </div>
                    <Network />
                  </div>
                  <Field label="الموعد">
                    <select
                      value={scenarioId}
                      onChange={(e) =>
                        setScenarioId(Number(e.target.value) || "")
                      }
                    >
                      <option value="">اختر ...</option>
                      {scenario.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.AdCourseName} — شعبة {r.SCode}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selectedScenario ? (
                    <div className="scenario-fields">
                      <Field label="البداية">
                        <TimeField
                         
                          min={SCHEDULE_DAY_START_TIME}
                          max={SCHEDULE_DAY_END_TIME}
                          value={selectedScenario.fstarttime}
                          onChange={(e) =>
                            patchScenario({ fstarttime: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="النهاية">
                        <TimeField
                         
                          min={SCHEDULE_DAY_START_TIME}
                          max={SCHEDULE_DAY_END_TIME}
                          value={selectedScenario.fendtime}
                          onChange={(e) =>
                            patchScenario({ fendtime: e.target.value })
                          }
                        />
                      </Field>
                      <LocationPicker
                        collegeId={collegeId}
                        sectionId={sectionId}
                        termId={termId}
                        value={selectedScenario}
                        onChange={(location) => patchScenario(location as Partial<FSchedule>)}
                        showRaw
                      />
                      <div className="scenario-days">
                        {Object.entries(dayLabels).map(([key, label]) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={Boolean((selectedScenario as any)[key])}
                              onChange={(e) =>
                                patchScenario({
                                  [key]: e.target.checked,
                                } as any)
                              }
                            />
                            <span>{label as string}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="safety-note">
                    <ShieldCheck /> أي تعديل هنا محلي داخل السيناريو حتى تضغط
                    «احفظ كمسودة» ثم «نشر» صراحة.
                  </p>
                </Surface>
              </div>
          ) : null}
          {scenario && twinCard === "ledger" ? (
              <div className="twin-workbench">
                <Surface className="change-ledger">
                  <div className="surface-head">
                    <div>
                      <span className="surface-kicker">سجل التعديلات</span>
                      <h2>{changedRows.length === 1 ? "تعديل واحد" : countOf(changedRows.length, AR.edit)}</h2>
                    </div>
                    <FileClock />
                  </div>
                  <div className="change-list">
                    {changedRows.length ? (
                      changedRows.slice(0, 30).map((r) => {
                        const o = originalById.get(r.id);
                        return (
                          <article key={r.id} className="change-card">
                            <div className="change-card-main">
                              <div className="change-card-title"><strong>{r.AdCourseName}<CourseTags courseId={r.AdCourseId} /></strong><Badge tone="neutral">شعبة {r.SCode}</Badge></div>
                              <div className="change-time-flow">
                                <span><small>قبل</small><time dir="ltr">{formatScheduleTimeRange(o?.fstarttime, o?.fendtime)}</time></span>
                                <ArrowLeftRight aria-hidden="true" />
                                <span className="after"><small>بعد</small><time dir="ltr">{formatScheduleTimeRange(r.fstarttime, r.fendtime)}</time></span>
                              </div>
                            </div>
                            {o?.AdRoomCode !== r.AdRoomCode ||
                            o?.AdRoomHall !== r.AdRoomHall ? (
                              <Badge tone="info">
                                <span className="change-room-flow">
                                  <small>قاعة</small>
                                  <bdi>{o?.AdRoomCode}/{o?.AdRoomHall}</bdi>
                                  <ArrowLeftRight aria-hidden="true" />
                                  <bdi>{r.AdRoomCode}/{r.AdRoomHall}</bdi>
                                </span>
                              </Badge>
                            ) : null}
                          </article>
                        );
                      })
                    ) : (
                      <div className="empty-state-compact">
                        مطابقة للجدول الحقيقي.
                      </div>
                    )}
                  </div>
                </Surface>
              </div>
          ) : null}
        </div>
      ) : null}

      {tab === "whatif" && collegeId && sectionId && termId ? (
        <WhatIfDesk collegeId={collegeId} sectionId={sectionId} termId={termId} />
      ) : null}
      {tab === "history" ? (
        <div className="history-layout">
          <CardDeck
            value={approveCard}
            onChange={(next) => showApproveCard(next as ApproveCard | null)}
            title="بطاقات السجل"
            hint="كل بطاقة تفتح صفحتها وحدها — لا شيء تحت شيء."
            cards={[
              ...(compareTermOptions.length > 1 ? [{ value: "compare", label: "مقارنة الفصول", detail: "ما تغيّر بين فصل وفصل", icon: <ArrowLeftRight />, advanced: true }] : []),
              { value: "drafts", label: "المسودات", detail: "ما لم يُنشر بعد", icon: <FileClock />,
                metric: String(drafts.length || 0) },
              { value: "versions", label: "سجل النسخ", detail: "كل نسخة، وما يفعله استرجاعها", icon: <History /> },
              { value: "decisions", label: "دفتر القرار", detail: "القرارات والمحاضر والذاكرة", icon: <BookOpen />,
                metric: decisionInbox?.totalOpen ? String(decisionInbox.totalOpen) : undefined },
            ]}
          />
          {approveCard === "compare" ? (
          <Surface className="term-compare">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">مقارنة الفصول</span>
                <h2>ماذا تغيّر؟</h2>
              </div>
              <ArrowLeftRight />
            </div>
            <div className="compare-controls">
              <TermSelect
                aria-label="قارن من فصل"
                value={compareFrom || ""}
                onValueChange={(id) => setCompareFrom(id)}
              >
                {compareTermOptions.map((t) => (
                  <option key={t.AdTermId} value={t.AdTermId}>
                    {t.AdTermName}
                  </option>
                ))}
              </TermSelect>
              <ArrowLeftRight />
              <TermSelect
                aria-label="إلى فصل"
                value={compareTo || ""}
                onValueChange={(id) => setCompareTo(id)}
              >
                {compareTermOptions.map((t) => (
                  <option key={t.AdTermId} value={t.AdTermId}>
                    {t.AdTermName}
                  </option>
                ))}
              </TermSelect>
              <SecondaryButton onClick={compareTerms}>قارن</SecondaryButton>
            </div>
            {termCompare ? (
              <div className="compare-result">
                <article>
                  <strong>
                    <span className="visual-metric-flow"><b>{termCompare.fromCount}</b><ArrowLeftRight aria-hidden="true" /><b>{termCompare.toCount}</b></span>
                  </strong>
                  <span>عدد المواعيد</span>
                </article>
                <article>
                  <strong>
                    <span className="visual-metric-flow"><b>{termCompare.fromScore}</b><ArrowLeftRight aria-hidden="true" /><b>{termCompare.toScore}</b></span>
                  </strong>
                  <span>مؤشر الجودة</span>
                </article>
                <article>
                  <strong>
                    +{termCompare.added} / -{termCompare.removed}
                  </strong>
                  <span>تغييرات تركيبية</span>
                </article>
                <article>
                  <strong>
                    <span className="visual-metric-flow"><b>{termCompare.uniqueRoomsFrom}</b><ArrowLeftRight aria-hidden="true" /><b>{termCompare.uniqueRoomsTo}</b></span>
                  </strong>
                  <span>القاعات المستخدمة</span>
                </article>
              </div>
            ) : (
              <p className="soft-copy">
                مقارنة فصلين · بدون تغيير.
              </p>
            )}
            {termCompare && (termCompare.appeared?.length || termCompare.disappeared?.length || termCompare.moved?.length) ? (
              <div className="compare-diff">
                {[
                  { key: "appeared", title: "أُضيف", tone: "add", rows: termCompare.appeared || [] },
                  { key: "moved", title: "انتقل", tone: "move", rows: termCompare.moved || [] },
                  { key: "disappeared", title: "اختفى", tone: "drop", rows: termCompare.disappeared || [] }
                ].map(group => (
                  <section key={group.key} className={`compare-column tone-${group.tone}`}>
                    <h3>
                      {group.title}
                      <b>{Number(group.rows.length).toLocaleString("ar-KW-u-nu-latn")}</b>
                    </h3>
                    {group.rows.length ? (
                      <div className="compare-rows">
                        {group.rows.slice(0, 24).map((row: any) => (
                          <article key={`${group.key}-${row.collegeId}-${row.sectionId}-${row.id}`}>
                            <header>
                              <span className="code-chip">{row.code || "—"}</span>
                              <strong>{row.name}<CourseTags courseId={row.courseId} /></strong>
                              {row.section ? <small>{row.section}</small> : null}
                              {readingMode === "department" ? <small className="reading-college-label">{row.collegeName}</small> : null}
                            </header>
                            {group.key === "moved" ? (
                              <div className="compare-move">
                                {row.fields.map((field: string) => {
                                  const pick = (side: any) =>
                                    field === "الأيام" ? side.days : field === "الوقت" ? side.time : field === "القاعة" ? side.room : side.instructor;
                                  return (
                                    <p key={field}>
                                      <i>{field}</i>
                                      <del dir="auto">{pick(row.before) || "—"}{field === "الأستاذ" && row.before?.visiting ? <> <VisitingBadge compact /></> : null}</del>
                                      <ArrowLeft aria-hidden="true" />
                                      <ins dir="auto">{pick(row.after) || "—"}{field === "الأستاذ" && row.after?.visiting ? <> <VisitingBadge compact /></> : null}</ins>
                                    </p>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="compare-facts">
                                <time dir="ltr">{scheduleClockForDisplay(row.time)}</time>
                                <span>{row.room || "—"}</span>
                                <span>{row.instructor || "—"}{row.instructor && row.visiting ? <> <VisitingBadge compact /></> : null}</span>
                              </p>
                            )}
                          </article>
                        ))}
                        {group.rows.length > 24 ? <p className="compare-more">و{Number(group.rows.length - 24).toLocaleString("ar-KW-u-nu-latn")} غيرها</p> : null}
                      </div>
                    ) : (
                      <p className="compare-none">لا شيء</p>
                    )}
                  </section>
                ))}
              </div>
            ) : null}
          </Surface>
          ) : null}
          {approveCard === "drafts" ? (
          <Surface className="drafts-card">
            {publishUndo ? (
              <div className="publish-undo-banner" role="status">
                <CheckCircle2 aria-hidden="true" />
                <span><strong>نُشرت «{publishUndo.draftName}»</strong><small>أُخذت نسخةٌ قبل النشر؛ التراجع يعيد الجدول إليها.</small></span>
                <SecondaryButton type="button" data-guide-feature-id="schedule.undo" disabled={busy || !online} onClick={() => void undoPublishPoints(publishUndo.points, () => setPublishUndo(null))}>
                  <RotateCcw /> تراجع عن النشر
                </SecondaryButton>
              </div>
            ) : null}
            <div className="surface-head">
              <div>
                <span className="surface-kicker">وضع النشر</span>
                <h2>المسودات الداخلية</h2>
              </div>
              <Save />
            </div>
            <p className="soft-copy">
              المسودة لا تغيّر الجدول الذي يعتمد عليه القسم. المسؤولون المخولون
              يستطيعون مراجعتها داخل نفس النطاق.
            </p>
            <div className="draft-list">
              {drafts.length ? (
                drafts.map((d) => (
                  <article key={d.id} className={d.status}>
                    <span className="draft-source">
                      {d.source === "auto" ? (
                        <WandSparkles />
                      ) : d.source === "import" ? (
                        <FileSpreadsheet />
                      ) : (
                        <Network />
                      )}
                    </span>
                    <div>
                      <strong>{d.name}</strong>{scopeLabel(d) ? <small className="reading-college-label">{scopeLabel(d)}</small> : null}
                      <small>
                        {new Date(d.updatedAt).toLocaleString("ar-KW-u-nu-latn")} ·{" "}
                        {countOf(d.rows.length, AR.appointment)} · {d.userName}
                      </small>
                    </div>
                    <Badge
                      tone={d.status === "published" ? "success" : "warning"}
                    >
                      {d.status === "published" ? "منشورة" : "مسودة"}
                    </Badge>
                    <div className="draft-actions">
                      <GhostButton onClick={() => openDraft(d)}>
                        فتح
                      </GhostButton>
                      {d.status === "draft" ? (
                        <PrimaryButton
                          data-guide-target="intelligence.publish-draft"
                          data-guide-feature-id="intelligence.publish-draft"
                          onClick={() => publishDraft(d)}
                          disabled={!online || busy}
                        >
                          نشر
                        </PrimaryButton>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state-compact">
                  لا توجد مسودات لهذا الفصل.
                </div>
              )}
            </div>
          </Surface>
          ) : null}
          {approveCard === "versions" ? (
          <Surface className="versions-card">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">سجل النسخ</span>
                <h2>النسخ الزمنية</h2>
              </div>
              <History />
            </div>
            {operationsReview?.accuracy ? (
              <div className="accuracy-strip">
                <article><span>دقة الجدول</span><strong>{operationsReview.accuracy.available ? `${operationsReview.accuracy.accuracy}%` : "—"}</strong><small>{operationsReview.accuracy.available ? `${operationsReview.accuracy.unchanged} بقيت كما اعتمدت${operationsReview.accuracy.complete === false ? " · بحسب النسخ المتاحة" : ""}` : "تحتاج نسخة محفوظة"}</small></article>
                <article><span>تغيّر</span><strong>{operationsReview.accuracy.changed || 0}</strong><small>{nounFor(operationsReview.accuracy.changed || 0, AR.appointment)}</small></article>
                <article><span>أضيف / حُذف</span><strong>+{operationsReview.accuracy.added || 0} / -{operationsReview.accuracy.removed || 0}</strong><small>هوية شعبة</small></article>
              </div>
            ) : null}
            {chronologicalVersions.length >= 2 ? (
              <div className="version-scrubber">
                <div><span className="surface-kicker">الوضع الزمني</span><strong>{new Date(chronologicalVersions[Math.max(1,Math.min(chronologicalVersions.length-1,versionScrubIndex))]?.createdAt).toLocaleString("ar-KW-u-nu-latn")}</strong></div>
                <input type="range" min="1" max={Math.max(1,chronologicalVersions.length-1)} value={Math.max(1,Math.min(chronologicalVersions.length-1,versionScrubIndex))} onChange={e=>setVersionScrubIndex(Number(e.target.value))} aria-label="اسحب عبر تاريخ الجدول" />
                <small>المحفوظ: {countOf(chronologicalVersions.length, AR.station)}</small>
              </div>
            ) : null}
            <div className="version-compare">
              <select
                value={versionFrom}
                aria-label="نسخة البداية"
                onChange={(e) => { setVersionFrom(e.target.value); setVersionTo(""); setVersionCompare(null); }}
              >
                <option value="">نسخة البداية...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {scopeLabel(v) ? `${scopeLabel(v)} · ` : ""}{new Date(v.createdAt).toLocaleString("ar-KW-u-nu-latn")} — {v.label}
                  </option>
                ))}
              </select>
              <ArrowLeftRight />
              <select
                value={versionTo}
                aria-label="نسخة المقارنة"
                onChange={(e) => setVersionTo(e.target.value)}
              >
                <option value="">نسخة المقارنة...</option>
                {versions.filter(v => !versionFrom || sameIntelligenceScope(sourceScope(v), sourceScope(versions.find(first => first.id === versionFrom)))).map((v) => (
                  <option key={v.id} value={v.id}>
                    {scopeLabel(v) ? `${scopeLabel(v)} · ` : ""}{new Date(v.createdAt).toLocaleString("ar-KW-u-nu-latn")} — {v.label}
                  </option>
                ))}
              </select>
              <SecondaryButton onClick={compareVersions}>قارن</SecondaryButton>
            </div>
            {versionCompare ? (
              <>
                <div className="version-diff">
                  <article>
                    <strong>+{versionCompare.added}</strong>
                    <span>أضيف</span>
                  </article>
                  <article>
                    <strong>-{versionCompare.removed}</strong>
                    <span>أزيل</span>
                  </article>
                  <article>
                    <strong>{versionCompare.unchanged}</strong>
                    <span>لم يتغير</span>
                  </article>
                </div>
                <div className="time-travel-compare">
                  <div className="time-travel-head">
                    <div>
                      <span className="surface-kicker">
                        مقارنة النسخ الزمنية
                      </span>
                      <h3>مقارنة بصرية بين النسختين</h3>
                    </div>
                    <div className="time-travel-meta">
                      <span>{versionCompare.from.label || "نسخة البداية"}</span>
                      <ArrowLeftRight />
                      <span>{versionCompare.to.label || "نسخة المقارنة"}</span>
                    </div>
                  </div>

                  <div className="time-travel-control-bar">
                    <div className="time-travel-control-presets">
                      <button
                        type="button"
                        className={`time-preset-btn ${timeTravel === 0 ? "active" : ""}`}
                        onClick={() => setTimeTravel(0)}
                      >
                        النسخة الأولى (0%)
                      </button>
                      <button
                        type="button"
                        className={`time-preset-btn ${timeTravel === 50 ? "active" : ""}`}
                        onClick={() => setTimeTravel(50)}
                      >
                        مقارنة بالمنتصف (50%)
                      </button>
                      <button
                        type="button"
                        className={`time-preset-btn ${timeTravel === 100 ? "active" : ""}`}
                        onClick={() => setTimeTravel(100)}
                      >
                        النسخة الثانية (100%)
                      </button>
                    </div>

                    <div className="time-travel-slider-wrapper">
                      <input
                        className="time-travel-range-input"
                        type="range"
                        min="0"
                        max="100"
                        value={timeTravel}
                        onChange={(e) => setTimeTravel(Number(e.target.value))}
                        aria-label="مقارنة النسختين"
                      />
                      <span className="time-travel-slider-badge">{timeTravel}%</span>
                    </div>
                  </div>

                  <div className="time-travel-scroll-container">
                    <div className="time-travel-stage">
                      <div className="time-travel-before">
                        <VersionCanvas
                          rows={versionCompare.from.rows || []}
                          label={versionCompare.from.label ? `النسخة السابقة (${versionCompare.from.label})` : "قبل"}
                          isAfter={false}
                        />
                      </div>
                      <div
                        className="time-travel-after"
                        style={{ clipPath: `inset(0 ${100 - timeTravel}% 0 0)` }}
                      >
                        <VersionCanvas
                          rows={versionCompare.to.rows || []}
                          label={versionCompare.to.label ? `النسخة المحدثة (${versionCompare.to.label})` : "بعد"}
                          isAfter={true}
                        />
                      </div>
                      <div
                        className="time-travel-divider"
                        style={{ left: `${timeTravel}%` }}
                        onPointerDown={handleDividerPointerDown}
                        title="اسحب لمقارنة النسختين"
                      >
                        <span className="time-travel-handle">
                          <ArrowLeftRight aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </div>

                  <IntelligenceVersionDiffTable comparison={versionCompare} />
                </div>
              </>
            ) : null}
            <div className="timeline-versions">
              {versions.length ? (
                versions.map((v, i) => {
                  /* «شبكة الأمان» صارت هنا: نوعُ النقطة وأيقونتُها لكل نسخة، وأثرُ استرجاعها
                     للإدارة الرئيسية التي تملك «استرجع هذا القرار» كما كانت. */
                  const kind = safetyPointKind(v.label, v.source);
                  const KindIcon = SAFETY_POINT_ICONS[kind.kind];
                  const point = isPowerAdmin ? safetyPoints.get(String(v.id)) : null;
                  return (
                  <article key={v.id} className={`version-point kind-${kind.kind}`}>
                    <span className="version-dot version-kind" title={kind.kindLabel}><KindIcon aria-hidden="true" /></span>
                    <div>
                      <strong title={v.label}>{safetyPointTitle(v.label) || v.label}</strong>{scopeLabel(v) ? <small className="reading-college-label">{scopeLabel(v)}</small> : null}
                      <small>
                        {kind.kindLabel} · {new Date(v.createdAt).toLocaleString("ar-KW-u-nu-latn")} ·{" "}
                        {v.userName} · {countOf(v.rowCount, AR.appointment)}
                      </small>
                      {point?.impactSummary ? (
                        <p className="safety-impact" data-same={point.impact?.same ? "true" : undefined}>
                          {point.impact?.same ? point.impactSummary : <>الاسترجاع {point.impactSummary}</>}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      tone={
                        v.source === "publish"
                          ? "success"
                          : v.source === "undo"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {versionSourceLabel(v.source)}
                    </Badge>
                    {point ? (
                      <GhostButton
                        data-guide-ignore="استرجاع نقطةٍ من سجل النسخ بأثرها المعروض؛ يسأل قبل محو ما تغيّر بعدها — للإدارة الرئيسية"
                        disabled={!online || busy || Boolean(point.impact?.same)}
                        onClick={() => void undoToSafetyPoint(point)}
                      >
                        <RotateCcw /> استرجع هذا القرار
                      </GhostButton>
                    ) : (
                      <GhostButton
                        onClick={() => restoreVersion(v)}
                        disabled={!online || busy}
                      >
                        <RotateCcw /> استرجاع
                      </GhostButton>
                    )}
                  </article>
                  );
                })
              ) : (
                <div className="empty-state-compact">
                  نسخة قبل كل تعديل.
                </div>
              )}
            </div>
            {operationsReview?.accuracy?.postmortem?.length ? (
              <div className="postmortem-card"><div><FileClock/><span><small>تشريح الفصل</small><strong>ماذا تعلّمنا من النسخ؟</strong></span></div><ul>{operationsReview.accuracy.postmortem.slice(0,4).map((line:string,index:number)=><li key={index}>{line}</li>)}</ul></div>
            ) : null}
            {versions.length ? (
              <div className="edit-heatmap"><div className="edit-heatmap-head"><span><small>حرارة التعديلات البشرية</small><strong>متى يكثر التغيير</strong></span><Badge>{countOf(versions.length, AR.version)}</Badge></div><div className="edit-heatmap-grid"><i/>{versionActivityHeatmap.hours.map(hour=><small key={hour}>{scheduleClockForDisplay(`${String(hour).padStart(2,"0")}:00`)}</small>)}{versionActivityHeatmap.cells.map(day=><React.Fragment key={day.label}><b>{day.label}</b>{day.hours.map(cell=>{const strength=versionActivityHeatmap.max?cell.count/versionActivityHeatmap.max:0;return <span key={`${day.label}-${cell.hour}`} title={`${day.label} ${scheduleClockForDisplay(`${String(cell.hour).padStart(2,"0")}:00`)} · ${countOf(cell.count, AR.edit)}`} style={{["--heat-pct" as any]:`${Math.max(10,Math.round(strength*85))}%`}}>{cell.count||""}</span>;})}</React.Fragment>)}</div></div>
            ) : null}
          </Surface>
          ) : null}
          {approveCard === "decisions" ? (
            <Surface className="decision-ledger">
              {/* «دفتر القرار»: ثلاث أدوات مختلفة في بطاقةٍ واحدة — لكلٍّ بياناتها كما كانت. */}
              <div className="decision-ledger-tabs no-print">
                <Segmented
                  value={ledgerTab}
                  onChange={value => setLedgerTab(value as "decisions" | "minutes" | "memory")}
                  options={[
                    { value: "decisions", label: "دفتر القرارات" },
                    { value: "minutes", label: "محضر القرار" },
                    ...(isPowerAdmin ? [{ value: "memory", label: "ذاكرة القرار" }] : []),
                  ]}
                />
              </div>
              {ledgerTab === "decisions" ? (
                <div className="decision-ledger-inbox">
            <Surface className="decision-inbox-mini">
              <div className="decision-inbox-mini-head"><div><span className="surface-kicker">دفتر القرارات</span><h3>{Number(decisionInbox?.totalOpen||0).toLocaleString("ar-KW-u-nu-latn")} مفتوح</h3></div><button type="button" onClick={()=>setDecisionCompose(value=>!value)} aria-label="إضافة قرار"><Plus /></button></div>
              {decisionCompose?<form onSubmit={e=>{e.preventDefault();void addOpenDecision();}} className="decision-inbox-compose"><input autoFocus value={decisionTitle} onChange={e=>setDecisionTitle(e.target.value)} placeholder="قرار يحتاج حسم…" aria-label="نص القرار" maxLength={140}/><button type="submit" aria-label="أضف القرار" title="أضف القرار" data-guide-ignore="زر إرسال داخل نموذج «قرار يحتاج حسم» — يضيف السطر الذي كُتب في الحقل بجواره ولا يمثل ميزة مستقلة" disabled={busy||decisionTitle.trim().length<3}><Save /></button></form>:null}
              <div className="decision-inbox-list">
                {[...(decisionInbox?.manual||[]).filter((item:any)=>item.status==="open"),...(decisionInbox?.inferred||[])].slice(0,5).map((item:any)=><button key={item.id} type="button" className={`priority-${item.priority||"medium"}`} onClick={()=>{if(!String(item.id).startsWith("inferred:"))void closeOpenDecision(item);}} title={String(item.id).startsWith("inferred:")?"مستنتج تلقائياً من الجدول":"اضغط لإغلاق القرار"}><i/><span><strong>{item.title}</strong>{scopeLabel(item) ? <small>{scopeLabel(item)}</small> : null}{item.detail?<small>{item.detail}</small>:null}</span>{String(item.id).startsWith("inferred:")?<Sparkles/>:<CheckCircle2/>}</button>)}
              </div>
            </Surface>
                </div>
              ) : null}
              {ledgerTab === "minutes" && collegeId && sectionId && termId ? <LivingScheduleLayer {...livingCommon} embeddedScenes={["meeting"]} /> : null}
              {ledgerTab === "memory" && isPowerAdmin && collegeId && sectionId && termId ? <LivingScheduleLayer {...livingCommon} embeddedScenes={["memory"]} /> : null}
            </Surface>
          ) : null}
        </div>
      ) : null}


      {tab === "copilot" && chat.length ? (() => {
        /* Same explicit-page structure as every other landscape report. */
        const PER_PAGE = 4;
        const pages: any[][] = [];
        for (let at = 0; at < chat.length; at += PER_PAGE) pages.push(chat.slice(at, at + PER_PAGE));
        const scopeLine = [overview?.context?.sectionName, terms.find(term => Number(term.AdTermId) === Number(termId))?.AdTermName].filter(Boolean).join(" · ");
        const stamp = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
        return <PrintPortal><div className="print-report print-wide query-print">
          {pages.map((slice, pageIndex) => (
            <section className="print-explicit-page" key={`q-${pageIndex}`}>
              <PrintLetterhead title="نتائج استعلامات الجدول" scope={scopeLine} footer={false} />
              {slice.map((item: any, index: number) => {
                const answer = item.answer || {};
                const figures = Array.isArray(answer.figures) ? answer.figures : [];
                return <section key={index} className="query-print-item">
                  <h2>{(pageIndex * PER_PAGE + index + 1).toLocaleString("ar-KW-u-nu-latn")}. {item.prompt}</h2>
                  {answer.title ? <strong>{answer.title}</strong> : null}
                  {answer.summary ? <p>{answer.summary}</p> : null}
                  {figures.length ? <table><tbody>{figures.map((f: any, j: number) => (
                    <tr key={j}><th>{f.label}</th><td dir="ltr">{String(f.value)}{f.hint ? ` ${f.hint}` : ""}</td></tr>
                  ))}</tbody></table> : null}
                  {Array.isArray(answer.bullets) && answer.bullets.length
                    ? <ul>{answer.bullets.map((b: string, j: number) => <li key={j}>{b}</li>)}</ul> : null}
                </section>;
              })}
              <footer className="print-explicit-page-meta">
                <span>{scopeLine || "الجدول الأكاديمي"}</span>
                <bdi dir="ltr">{pageIndex + 1} / {pages.length}</bdi>
                <time dir="ltr">{stamp}</time>
              </footer>
            </section>
          ))}
        </div></PrintPortal>;
      })() : null}


    </div>
  );
}
