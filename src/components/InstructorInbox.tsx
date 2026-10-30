import { isBlockingConflict } from "../utils/scheduleIntelligence";
import PlanBadge from "./PlanBadge";
import AlertShort from "./AlertShort";
import { buildInboxHeat } from "../utils/inboxHeat";
import { byArabic } from "../utils/sorting";
/**
 * ── وارِدُ الأساتذة ─────────────────────────────────────────────────────────
 *
 * القسم أرسل لخمسةٍ وخمسين أستاذاً مسوّدةَ جدولهم. أجاب أربعون: اثنان وعشرون
 * قالوا «كما هو»، وثمانية عشر طلبوا تغييراً. وهذه الشاشة هي ما يُفتح بعدها.
 *
 * **ولا تعرض الجدول.** تعرض ما تحرّك وحده — سطران لكل بند، «كان» و«طلب» —
 * لأن عرضَ الجدول كاملاً يجعل المنسّقَ يبحث عن التعديل بعينه في أربعين صفّاً،
 * وهو يعرف سلفاً أنه أربعةٌ منها.
 *
 * **والترتيب هو العمل.** الأخضرُ أولاً لأنه يُثبَّت بضغطة، ثم الأصفرُ الذي
 * يحتاج قراءةً، ثم الأحمرُ الذي يحتاج قراراً. فينتهي ثمانون بالمئة من الوارد
 * في دقائق، ويذهب الانتباهُ كلُّه إلى ما يستحقّه.
 *
 * **والاثنان والعشرون الذين لم يغيّروا شيئاً سطرٌ واحدٌ مطويّ.** لا بطاقةَ
 * لهم ولا فتحَ: «تثبيت الكل» وينتهون. فتحُ اثنتين وعشرين بطاقةً لتقول كلُّ
 * واحدةٍ منها «لا جديد» تلوّثٌ بصريٌّ لا معلومة.
 *
 * **والتثبيت يمرّ بمسار الحفظ نفسه.** هذه الشاشةُ قائمةُ انتظارٍ أمام الزرّ
 * الذي يضغطه المنسّق بيده كل يوم، لا مخزنٌ موازٍ: حين يُثبَّت بندٌ يُستدعى
 * `/api/schedules` بحمولةِ الصفّ الحقيقي وقد تغيّر فيه اليومُ والوقت وحدهما —
 * فيرث التحقّقَ والتدقيقَ والنسخَ وتقريرَ التغييرات كما هي، ويظهر التعديلُ في
 * «تغييرات الجدول» تلقائياً بلا سطرٍ واحدٍ مكتوبٍ لذلك. ثم يُسجَّل القرار.
 *
 * **والرفض لا يُكتب في الجدول.** يبقى في سجلّ الطلب، يراه صاحبُه وحده مع
 * سببه والبدائل. ولا أثرَ له في تقرير التغييرات، لأن شيئاً لم يتغيّر.
 */

import MiniRing from "./MiniRing";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronDown, Clock3, Inbox, Link2, Loader2, MailQuestion,
  ClipboardPen, Equal, Grid3x3, MailOpen, MessageSquare, Replace, Send, ShieldAlert, ShieldCheck, SlidersHorizontal, X,
  DoorOpen, Wrench, RefreshCw, Home, MapPin, History, Users, Scale, BellRing, UserX,
  CheckCheck, CircleDashed, Plus, Trash2,
} from "lucide-react";
import type { RequestRoomReason } from "../types";
import { DnaCount } from "./dna";
import { RequestTimelineToggle } from "./dna/requestDna";
import VisitingBadge, { withVisitingSuffix } from "./VisitingBadge";
import { useVisitingLookup } from "../hooks/useVisitingLookup";
import { usePageAwake } from "../utils/pageAwake";
import { onLiveSignal } from "../utils/livePulse";
import QuickCreatePopover, { type QuickDraft, type QuickSeed } from "./QuickCreatePopover";
import { nextCourseSectionCode } from "../utils/nextCourseSectionCode";
import { num } from "./proposal/proposalFormat";
import { effectiveStatus } from "../utils/studyProposal";
import { ProposalLauncherBar, ProposalStrip, type OpenWorkspace } from "./proposal/ProposalInboxParts";
import { proposalApi, type StaffProposalView } from "./proposal/proposalApi";
const StudyProposalWorkspace = React.lazy(() => import("./proposal/StudyProposalWorkspace"));
import TermFrozenRibbon, { TermFrozenContext, useFrozenScreen, useTermFrozen } from "./TermFrozenRibbon";
import { useScopedTerms } from "./useScopedTerms";
import ScopeAskBar, { trimScopeSelects, type ScopeAskSelect } from "./ScopeAskBar";
import {
  Badge, EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface,
} from "./ui";
import { AR, countOf, nounFor, oblique } from "../utils/arabicCount";
import { reachAboutCard } from "../utils/reachInstructor";
import { inboxInstructorChoices, isPlaceholderInboxRow } from "../utils/instructorIdentity";
import { proposalLauncherChoices } from "../utils/instructorPickerChoices";
import { isTaRequest, notOpened, notParticipated, openedNotAnswered } from "../utils/requestParticipation";
import { putHandoff } from "../utils/requestHandoff";
import { currentTermId } from "../utils/termSequence";
import { singleDepartmentOf } from "../utils/scopeContext";
import { readSharedScope, resolveSharedScope, useSharedScope } from "../utils/sharedScope";
import { takeNotifyFocus } from "../utils/notifyFocus";
import { NEGOTIATION_LABEL, THREAD_TEXT_LIMIT, negotiationState } from "../utils/instructorRequestThread";
import { isUnchangedConfirmed, unchangedConfirmationKind } from "../utils/instructorRequestConfirmation";
import type {
  AdTerm, FSchedule, InstructorRequest, InstructorRequestItem, InstructorRequestRejectReason,
} from "../types";

interface Props {
  /**
   * نطاقُ الحساب كما يرسله الخادم.
   *
   * الأسماءُ تصل في `AdCollegeName` و`AdSectionName` — وهي أسماءُ الحقول في
   * `clientScopeDetails`، لا أسماءٌ تُخمَّن. وقراءتُها باسمٍ آخر لا تُخطئ
   * بصوتٍ مسموع: تسقط إلى البديل فتظهر «كلية ٥» مكان اسم الكلية، ويبدو
   * كأن الحساب يحمل نطاقاتٍ ليست له.
   */
  scopes: Array<{ AdCollegeId: number; AdSectionId: number; AdCollegeName?: string; AdSectionName?: string }>;
  powerAdmin?: boolean;
  /** يفتح ورشة الجدول. تحتاجه الإضافةُ وحدها، ولا تفعل الشاشةُ شيئاً بدونه. */
  onNavigate?: (view: string) => void;
}

interface InboxRequest extends InstructorRequest {
  instructorName: string;
  instructorMobile: string;
  changedCount: number;
  sectionName?: string;
  requestCollegeName?: string;
}

interface Totals {
  sent: number; answered: number; unchanged: number;
  changed: number; unopened: number; settled: number;
}

const requestItemId = (item: InstructorRequestItem) => String(item.itemId
  || (item.rowId != null ? `row:${item.rowId}` : `add:${(item.offeringRowIds || []).join(",")}`));
const unchangedConfirmedAt = (row: InstructorRequest) => [...(row.timeline || [])]
  .reverse().find(event => event.kind === unchangedConfirmationKind)?.at || row.submittedAt || "";

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const body = await response.text();
  let data: any = {};
  if (body) {
    try { data = JSON.parse(body); }
    catch { throw new Error(response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).`); }
  }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};

/** أسبابُ الرفض كما تُقرأ. قائمةٌ مغلقةٌ تجعل السببَ قابلاً للعدّ عبر الفصول. */
const REJECT_REASONS: Array<[InstructorRequestRejectReason, string]> = [
  ["room", "لا تتوفّر قاعة مناسبة"],
  ["instructor", "يتعارض مع أستاذ آخر"],
  ["regulation", "مخالفة للائحة"],
  ["cohort", "يتقاطع مع مقرّر يشترك طلبتُه"],
  ["load", "النصاب التدريسي"],
  ["department", "قرار القسم"],
  ["other", "سبب آخر"],
];

const ACTION_LABEL: Record<string, string> = {
  keep: "كما هو", change: "تعديل", delete: "حذف", add: "إضافة",
};

/** أخضرُ ثم أصفرُ ثم أحمر — وهو ترتيبُ العمل لا ترتيبُ الخطورة. */
const VERDICT_ORDER: Record<string, number> = { clear: 0, exception: 1, conflict: 2 };

const arabicDate = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
};
const unchangedConfirmedDateTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-KW-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
};

/* ── ما يصل الأستاذ لا يذكر قاعةً ولا مبنى (قاعدة المالك) ─────────────────
 * سطرُ الرفض وردُّ الحوار يصلان صفحةَ الأستاذ كما كُتبا. فإن حمل النصُّ ما يشبه
 * رمزَ قاعةٍ أو مبنى — «901A01»، «/L01»، «القاعة 12»، «المبنى ٧» — قيل ذلك بهدوءٍ
 * تحت الحقل ولا يُمنع الإرسال (التنقيةُ النهائية في الخادم). الأوقاتُ («14:00/15:00»)
 * ورموزُ المقررات (أرقامٌ وحدها) لا تُحسب: رمزُ المكان يخلط حرفاً لاتينياً برقم. */
const PLACE_IN_TEXT = /(?:^|[^A-Za-z0-9])(?:\d+[A-Za-z]+\d*|[A-Za-z]+\d+)(?![A-Za-z0-9])|\/\s*[A-Za-z]{1,3}\d{1,4}|(?:ال)?(?:قاع[ةه]|مبن[ىي])\s*(?:رقم\s*)?[A-Za-z0-9٠-٩۰-۹]/;
export const mentionsPlace = (text: string) => PLACE_IN_TEXT.test(String(text || ""));
function PlaceWarning({ text }: { text: string }) {
  return mentionsPlace(text) ? (
    <small className="request-place-warning" role="status"><AlertTriangle aria-hidden="true" />هذه الملاحظة تصل الأستاذ — لا تذكر القاعة ولا المبنى</small>
  ) : null;
}

/* ── ورقةُ الرفض ────────────────────────────────────────────────────────── */

function RejectSheet({ item, onClose, onSubmit, busy }: {
  item: InstructorRequestItem;
  onClose: () => void;
  onSubmit: (reason: InstructorRequestRejectReason, note: string, alternatives: any[]) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState<InstructorRequestRejectReason | "">("");
  /* البدائلُ يقترحها النظام سلفاً من أقرب الأوقات المتاحة، والمنسّقُ يوافق أو
     يحذف — لا يكتبها. وهو الفرقُ بين رفضٍ يُغلق الباب ورفضٍ يفتح آخر. */
  const slotKey = (slot: { day: string; days?: string[]; start: string; end: string }) =>
    `${(slot.days?.length ? slot.days : [slot.day]).join(",")}|${slot.start}|${slot.end}`;
  const [offered, setOffered] = useState<string[]>((item.nearestTimes || []).map(slotKey));
  const [note, setNote] = useState("");

  const toggle = (key: string) =>
    setOffered(current => current.includes(key) ? current.filter(entry => entry !== key) : [...current, key]);

  return (
    <div className="changes-extend-sheet" role="dialog" aria-modal="true" aria-label="رفض بند">
      <div className="changes-extend-card">
        <header>
          <strong>رفض «{item.after?.courseName || item.before?.courseName || "البند"}»</strong>
          <button type="button" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق الورقة — لا يغيّر شيئاً"><X /></button>
        </header>

        <label>
          <span>السبب</span>
          <select value={reason} onChange={event => setReason(event.target.value as any)}>
            <option value="">اختر السبب</option>
            {REJECT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        {(item.nearestTimes || []).length ? (
          <div className="request-alternatives">
            <span>بدائلُ تُعرض عليه</span>
            <div className="changes-filter-chips">
              {(item.nearestTimes || []).map(slot => {
                const key = slotKey(slot);
                const on = offered.includes(key);
                return (
                  <button
                    key={key} type="button" className="changes-chip"
                    data-active={on || undefined} aria-pressed={on}
                    data-guide-ignore="اختيار بديلٍ يُعرض — يُحفظ مع القرار"
                    onClick={() => toggle(key)}
                  >
                    {(slot.days?.length ? slot.days : [slot.day]).map(day => INBOX_DAY_NAMES[day] || day).join(" · ")} · <bdi dir="ltr">{slot.start} – {slot.end}</bdi>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <label>
          <span>سطرٌ للأستاذ <small>اختياري</small></span>
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="هذا الوقت مخصّصٌ لنشاطٍ آخر في القسم" />
        </label>
        <PlaceWarning text={note} />

        <div className="changes-extend-actions">
          <SecondaryButton type="button" onClick={onClose} data-guide-ignore="إلغاء — لا يغيّر شيئاً">تراجع</SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={busy || !reason}
            data-guide-target="requests.action.reject"
            onClick={() => onSubmit(reason as InstructorRequestRejectReason, note, offered.map(key => {
              const [days, start, end] = key.split("|");
              const list = days.split(",").filter(Boolean);
              return { day: list[0], days: list, start, end };
            }))}
          >
            {busy ? "يحفظ…" : "سجّل الرفض"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── الفحصُ الحيّ: سياسةُ «الجدول الدراسي» نفسُها ─────────────────────────
 *
 * حكمُ الطلب يُحسب لحظةَ فتح الوارد، والجدولُ يتحرّك بعدها. فقبل أن يُعرض زرُّ
 * «ثبّت» يُسأل الخادمُ بالسؤال نفسِه الذي يسأله نموذجُ الجدول الدراسي قبل
 * الحفظ (`check-conflicts`): الأستاذُ والقاعةُ والطلبةُ المشتركون والشعبةُ
 * المكرّرة، في كل الكليات. فما يُمنع هناك يُمنع هنا، ويُقال سببُه هنا. */

/* أسبابُ اختيار القاعة أيقوناتٍ (C2) — الكلمةُ في التلميح وحده. */
const ROOM_WHY_ICON: Record<RequestRoomReason, React.ComponentType<any>> = { dept: Home, near: MapPin, previous: History, capacity: Users, fair: Scale, facility: Wrench };
const ROOM_WHY_LABEL: Record<RequestRoomReason, string> = { dept: "قاعة القسم", near: "قرب قاعات الأستاذ", previous: "قاعته السابقة", capacity: "سعة مناسبة", fair: "توزيع عادل", facility: "مع المرفق" };

export interface LiveIssue { severity: "high" | "medium" | "low"; message: string; detail?: string; otherId?: number; type?: string }

export const proposedRow = (row: InboxRequest, item: InstructorRequestItem, current?: FSchedule): any | null => {
  if (item.action === "delete" || item.action === "keep") return null;
  const slots = item.slots || [];
  if (item.offeringRowIds?.length || new Set(slots.map(slot => `${slot.start}|${slot.end}`)).size > 1) return null;
  if (!slots.length || !slots[0]?.start || !slots[0]?.end) return null;
  const days = new Set(slots.map(slot => slot.day));
  const base: any = item.action === "change"
    ? (current ? { ...current } : null)
    : {
        AdInstructorId: Number(row.AdInstructorId),
        AdCourseId: Number(item.after?.courseId || 0),
        AdCollegeId: Number(item.after?.collegeId || row.AdCollegeId),
        AdSectionId: Number(item.after?.sectionId || row.AdSectionId),
        AdTermId: Number(row.AdTermId),
      };
  if (!base) return null;
  /* القاعةُ التي سيكتبها التثبيت: المحجوزةُ للبند، أو بديلُ القاعة المشغولة (roomSwitch) — لا قاعةُ الصفّ القديمة. */
  const place = item.action === "change" && item.roomSwitch
    ? { roomId: item.roomSwitch.to.roomId, buildingId: item.roomSwitch.to.buildingId, AdRoomCode: item.roomSwitch.to.room, AdRoomHall: item.roomSwitch.to.hall, locationStatus: "VERIFIED" }
    : {};
  return {
    ...base,
    ...place,
    instructorRequestId: row.id,
    fsunday: days.has("fsunday"), fmonday: days.has("fmonday"), ftuesday: days.has("ftuesday"),
    fwednesday: days.has("fwednesday"), fthursday: days.has("fthursday"),
    fstarttime: slots[0].start, fendtime: slots[0].end,
    excludeId: item.action === "change" ? Number(item.rowId || 0) : 0,
  };
};

function useLiveCheck(candidate: any | null, enabled: boolean) {
  const [state, setState] = useState<{ loading: boolean; issues: LiveIssue[] | null }>({ loading: false, issues: null });
  const key = candidate ? JSON.stringify(candidate) : "";
  useEffect(() => {
    if (!enabled || !candidate) { setState({ loading: false, issues: null }); return; }
    const controller = new AbortController();
    setState(prev => ({ loading: true, issues: prev.issues }));
    fetch("/api/schedules/check-conflicts", {
      method: "POST", credentials: "include", signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: key,
    })
      .then(async response => { if (!response.ok) throw new Error("تعذّر فحص الموعد. أعد المحاولة."); return response.json(); })
      .then(data => setState({
        loading: false,
        issues: [...(data.validationIssues || []).map((message: string) => ({ message, severity: "high" })), ...(data.conflicts || [])].map((conflict: any) => ({
          severity: isBlockingConflict(conflict) ? "high" : conflict.severity === "medium" ? "medium" : "low",
          message: String(conflict.message || "تعارض"),
          detail: conflict.detail ? String(conflict.detail) : undefined,
          otherId: Number(conflict.rowId || conflict.otherId || 0) || undefined,
          type: conflict.type ? String(conflict.type) : undefined,
        })),
      }))
      .catch(error => { if (error?.name !== "AbortError") setState({ loading: false, issues: [{ severity: "high", message: "تعذّر فحص الموعد. أعد المحاولة قبل الاعتماد." }] }); });
    return () => controller.abort();
  }, [key, enabled]);
  return state;
}

/** حالةُ البند في كلمة: ما يراه المنسّق قبل أن يقرأ التفاصيل. */
type Readiness = "ready" | "review" | "blocked" | "checking" | "waiting";
const READINESS: Record<Readiness, string> = {
  ready: "جاهز للتثبيت", review: "يحتاج قرارك", blocked: "ممنوع", checking: "يفحص…", waiting: "بانتظار قسمٍ آخر",
};

/* ── «قبل ← بعد» إنفوجرافيكاً ─────────────────────────────────────────────
 * الأيامُ خمسةُ أحرف (ح ن ث ر خ) يُضاء منها ما في الموعد — لغةُ «موعد جديد»
 * نفسُها — والاسمُ الكامل يبقى لقارئ الشاشة وفي التلميح. والوقتُ سطرٌ بخطٍّ
 * ثابت العرض، والقاعةُ سطرٌ ثالثٌ بأيقونتها: لا تلتصق بالوقت على أي شاشة. */
const WEEK_DAYS = [["fsunday", "ح"], ["fmonday", "ن"], ["ftuesday", "ث"], ["fwednesday", "ر"], ["fthursday", "خ"]] as const;
/** أيامُ اللقطة كما يكتبها الخادم («الأحد · الثلاثاء») مفاتيحَ؛ وما لا يُقرأ يبقى نصّاً. */
const weekOf = (text?: string): Set<string> => {
  const names = String(text || "").split("·").map(part => part.trim().replace(/^الإثنين$/, "الاثنين"));
  return new Set(WEEK_DAYS.filter(([key]) => names.includes(INBOX_DAY_NAMES[key])).map(([key]) => key));
};
/** `other`: أيامُ الطرف الآخر من السهم — ما أُضيء هنا وحده يُميَّز (يومٌ جديد أو يومٌ يُترك). */
function WeekStrip({ days, on, other, compact = false }: { days?: string; on: Set<string>; other?: Set<string>; compact?: boolean }) {
  if (!on.size) return days ? <span className="request-slot-days">{days}</span> : null;
  return (
    <>
      <span className={`request-week${compact ? " is-compact" : ""}`} aria-hidden="true">
        {WEEK_DAYS.map(([key, letter]) => (
          <i key={key} data-on={on.has(key) ? "1" : undefined} data-shift={other && on.has(key) && !other.has(key) ? "1" : undefined}>{letter}</i>
        ))}
      </span>
      {days ? <span className="sr-only">{days}</span> : null}
    </>
  );
}

/* ── الوقتُ يوماً يوماً ───────────────────────────────────────────────────
 * «المطلوب» نصٌّ واحد (`after.time`) يحمل نهايةَ اليوم الأول وحده، ونهايةُ كل
 * يومٍ قد تختلف (نمطُ ٧٥ دقيقة يومين و٥٠ في الثالث). والفتراتُ (`slots`) تحمل
 * لكل يومٍ بدايتَه ونهايتَه: تُجمع الأيامُ المتشاركة في الوقت نفسه، فإن اختلفت
 * الأوقات عُرض كلُّ فريقٍ بوقته — «ح·ث 14:00 – 15:15 · خ 14:00 – 14:50». */
type SlotGroup = { days: string[]; start: string; end: string };
const WEEK_KEYS: string[] = WEEK_DAYS.map(([key]) => key);
export const slotGroups = (slots?: InstructorRequestItem["slots"]): SlotGroup[] => {
  const groups = new Map<string, SlotGroup>();
  for (const slot of slots || []) {
    if (!slot?.start || !slot?.end) continue;
    const key = `${slot.start}|${slot.end}`;
    const group = groups.get(key) || { days: [], start: slot.start, end: slot.end };
    if (!group.days.includes(slot.day)) group.days.push(slot.day);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(group => ({ ...group, days: WEEK_KEYS.filter(key => group.days.includes(key)) }))
    .sort((a, b) => WEEK_KEYS.indexOf(a.days[0]) - WEEK_KEYS.indexOf(b.days[0]));
};
const dayLetters = (days: string[]) => days.map(day => WEEK_DAYS.find(([key]) => key === day)?.[1] || "").join("·");
export const groupsLabel = (groups: SlotGroup[]) => groups.map(group => `${dayLetters(group.days)} ${group.start} – ${group.end}`).join(" · ");
function SlotTimes({ groups }: { groups: SlotGroup[] }) {
  return (
    <span className="request-slot-times">
      {groups.map(group => (
        <span key={`${group.start}|${group.end}`}>
          <b aria-hidden="true">{dayLetters(group.days)}</b>
          <span className="sr-only">{group.days.map(day => INBOX_DAY_NAMES[day] || day).join(" و")}</span>
          <bdi dir="ltr">{group.start} – {group.end}</bdi>
        </span>
      ))}
    </span>
  );
}

/** بندٌ يصلح لـ«ثبّت الجاهز كله» كما يقرؤه صفُّه نفسه: حكمُه وفحصُه الحيّ وحاله. */
interface BulkEntry {
  key: string; requestId: string; index: number; itemId: string;
  teacher: string; course: string;
  beforeDays: string; beforeTime: string; afterDays: string; afterTime: string;
  /** جاهزٌ الآن؛ و`false` حين يُعاد فحصُه الحيّ — فينتظره التثبيتُ الجماعيّ ولا يتخطّاه. */
  ready: boolean;
}

/* ── بطاقةُ أستاذ ───────────────────────────────────────────────────────── */

/* ── حوارُ البند ──────────────────────────────────────────────────────────
 * ما قاله القسمُ والأستاذ في البند بترتيبه، وحالتُه من القاعدة الواحدة
 * (`negotiationState`)، وسطرُ ردٍّ يحمل أوقاتاً مقترحة من أقرب المتاح. ليس
 * قراراً: لا يكتب في الجدول. التثبيتُ والرفضُ يبقيان زرّيهما. */
function RequestThread({ item, busy: busyProp, onReply, onClose, onProposal }: {
  item: InstructorRequestItem;
  busy: boolean;
  onReply: (text: string, slots: any[]) => void;
  onClose?: () => void;
  /** يفتح مساحة «إعداد مقترح دراسي» مرتبطةً بهذا البند. */
  onProposal?: () => void;
}) {
  const frozenScreen = useFrozenScreen();
  /* فصلٌ سابق: كلُّ ما يُقرِّر معطَّل كما لو كان مشغولاً. */
  const busy = busyProp || frozenScreen;
  const slotKey = (slot: { day: string; days?: string[]; start: string; end: string }) =>
    `${(slot.days?.length ? slot.days : [slot.day]).join(",")}|${slot.start}|${slot.end}`;
  const [text, setText] = useState("");
  const [offered, setOffered] = useState<string[]>([]);
  const thread = item.thread || [];
  const state = negotiationState(item);
  const choices = item.nearestTimes || [];
  const slotLabel = (slot: { day: string; days?: string[]; start: string; end: string }) => (
    <>{(slot.days?.length ? slot.days : [slot.day]).map(day => INBOX_DAY_NAMES[day] || day).join(" · ")} · <bdi dir="ltr">{slot.start} – {slot.end}</bdi></>
  );
  return (
    <div className="request-thread" data-negotiation={state}>
      <header>
        <strong><MessageSquare aria-hidden="true" /> الحوار مع الأستاذ</strong>
        <span className="request-negotiation" data-negotiation={state}>{NEGOTIATION_LABEL[state]}</span>
        {onProposal ? (
          <button type="button" className="request-thread-proposal" onClick={onProposal} data-guide-target="proposal-from-thread">
            <ClipboardPen aria-hidden="true" /> إعداد مقترح دراسي
          </button>
        ) : null}
        {onClose ? <button type="button" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق الحوار — لا يغيّر شيئاً"><X /></button> : null}
      </header>
      {thread.length ? (
        <ol className="request-thread-list">
          {thread.map((message, at) => (
            <li key={at} data-from={message.from}>
              <small>{message.from === "department" ? (message.by || "القسم") : "الأستاذ"} · {arabicDate(message.at)}</small>
              {message.accepted ? <p><Check aria-hidden="true" /> وافق على المقترح</p> : null}
              {message.text ? <p>{message.text}</p> : null}
              {(message.slots || []).length ? (
                <div className="changes-filter-chips">
                  {(message.slots || []).map(slot => <span key={slotKey(slot)} className="changes-chip">{slotLabel(slot)}</span>)}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {state === "agreed" && item.decision?.state === "fixed" ? null : (
        <div className="request-thread-reply">
          {choices.length ? (
            <div className="request-alternatives">
              <span>أوقاتٌ تقترحها عليه</span>
              <div className="changes-filter-chips">
                {choices.map(slot => {
                  const key = slotKey(slot);
                  const on = offered.includes(key);
                  return (
                    <button
                      key={key} type="button" className="changes-chip"
                      data-active={on || undefined} aria-pressed={on}
                      data-guide-ignore="اختيار وقتٍ يُقترح — يُرسل مع الرد"
                      onClick={() => setOffered(current => on ? current.filter(entry => entry !== key) : [...current, key].slice(-3))}
                    >
                      {slotLabel(slot)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <label>
            <span>ردُّك على الأستاذ</span>
            <textarea rows={2} maxLength={THREAD_TEXT_LIMIT} value={text} onChange={event => setText(event.target.value)}
              placeholder="هل يناسبك الاثنين والأربعاء بدل الأحد؟" />
          </label>
          <PlaceWarning text={text} />
          <PrimaryButton
            type="button"
            disabled={busy || (!text.trim() && !offered.length)}
            data-guide-ignore="إرسال ردٍّ للأستاذ — لا يكتب في الجدول"
            onClick={() => {
              onReply(text, offered.map(key => {
                const [days, start, end] = key.split("|");
                const list = days.split(",").filter(Boolean);
                return { day: list[0], days: list, start, end };
              }));
              setText(""); setOffered([]);
            }}
          >
            {busy ? "يرسل…" : "أرسل الرد"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

function RequestCard({ row, currentRows, onDecide, onReply, busyKey, filter, rowErrors, proposals, onOpenProposal, onBulk }: {
  key?: React.Key;
  row: InboxRequest;
  currentRows: Map<number, FSchedule>;
  onDecide: (index: number, state: "fixed" | "rejected", extra?: any) => void;
  onReply: (index: number, text: string, slots: any[]) => void;
  busyKey: string | null;
  filter: (item: InstructorRequestItem) => boolean;
  rowErrors: Record<string, string>;
  proposals: StaffProposalView[];
  onOpenProposal: (open: OpenWorkspace) => void;
  /** كلُّ صفٍّ يقول للشاشة أهو جاهزٌ لـ«ثبّت الجاهز كله». */
  onBulk?: (key: string, entry: BulkEntry | null) => void;
}) {
  const frozenScreen = useFrozenScreen();
  const [rejecting, setRejecting] = useState<number | null>(null);

  const items = useMemo(() => (row.items || [])
    .map((item, index) => ({ item, index }))
    .filter(entry => entry.item.action !== "keep" && !(entry.item as any).hidden && filter(entry.item))
    .sort((a, b) => (VERDICT_ORDER[a.item.verdict || "clear"] ?? 0) - (VERDICT_ORDER[b.item.verdict || "clear"] ?? 0)),
    [row.items, filter]);

  const { isVisiting } = useVisitingLookup(row.AdTermId);

  /* ملاحظةٌ عامة بلا بنودٍ مغيَّرة تبقى طلباً يُقرأ: الأستاذ أراد أن يوضح شيئاً عن جدوله. */
  if (!items.length && !row.note) return null;
  /* الحرفُ الأول من الاسم بلا اللقب — وجهُ البطاقة كما في «موعد جديد». */
  const initial = String(row.instructorName || "").replace(/^(د\.|أ\.|م\.)\s*/, "").trim().charAt(0) || "؟";

  return (
    <article className="request-card">
      <header className="request-card-head">
        <div className="request-card-who">
          <span className="request-avatar" aria-hidden="true">{initial}</span>
          <div className="request-card-id">
            <strong className="schedule-instructor-with-badge">{row.instructorName}{isVisiting(row.AdInstructorId, row.AdCollegeId, row.AdSectionId) ? <VisitingBadge compact /> : null}</strong>
            <span className="request-card-meta">
              {row.sectionName ? <span className="request-card-section">قسم {row.sectionName.replace(/^قسم\s+/, "")}</span> : null}
              <small>{items.length ? countOf(items.length, AR.change) : "ملاحظة بلا تغييرات"}{row.submittedAt ? ` · ${arabicDate(row.submittedAt)}` : ""}</small>
            </span>
          </div>
        </div>
        {/* ── من وقّعه ────────────────────────────────────────────────────
            الرابطُ يصل في واتساب ويُعاد توجيهه، فضغطةُ «أرسل» وحدَها لا تُثبت
            أن صاحبه هو من أرسل. وقد صار الإرسالُ يُطابِق رقمَه المدنيَّ
            بسجلّه، فيُقال ذلك هنا برمزه — وهو ما يُطابَق به الطلبُ بعد شهرين
            إن أُنكر. وطلبٌ قديمٌ أُرسل قبل هذا لا يحمل توقيعاً، ويُقال ذلك
            صراحةً بدل أن يُفترض. */}
        <div className="request-card-flags">
        {row.signature?.verifyCode ? (
          <span className="request-signed" title={`وقّعه صاحبه بالرقم المدني — ${arabicDate(row.signature.at)}`}>
            <ShieldCheck aria-hidden="true" />موقَّع <code>{row.signature.verifyCode}</code>
          </span>
        ) : row.submittedAt ? (
          <span className="request-signed" data-missing="true" title="أُرسل قبل أن يصبح الإرسال توقيعاً">
            <ShieldAlert aria-hidden="true" />بلا توقيع
          </span>
        ) : null}
        {row.status === "settled" ? <Badge tone="success">انتهى</Badge> : null}
        {/* مقترحٌ فعّال يظهر سطره بزرّه («فتح»/«متابعة»)، فلا يتكرر زرٌّ يفتح المساحة نفسها. */}
        {proposals.some(view => !["withdrawn", "expired"].includes(effectiveStatus(view.proposal))) ? null : (
          <button type="button" className="request-propose" disabled={frozenScreen} onClick={() => onOpenProposal({ requestId: row.id })} data-guide-target="proposal-start">
            <ClipboardPen aria-hidden="true" /> إعداد مقترح دراسي
          </button>
        )}
        {/* ── إبلاغُ الأستاذ بالقرار ──────────────────────────────────────
            حين يُقرَّر بندٌ واحدٌ على الأقل: رسالةُ واتساب جاهزة تعدّ ما ثُبّت
            وما رُفض، ومعها رابطُه نفسه ليرى التفاصيل والبدائل. */}
        {(() => {
          const decidedItems = (row.items || []).filter(item => item.action !== "keep" && !(item as any).hidden && item.decision?.state);
          if (!decidedItems.length) return null;
          const fixed = decidedItems.filter(item => item.decision?.state === "fixed").length;
          const rejected = decidedItems.length - fixed;
          const summary = [fixed ? `ثُبّت: ${countOf(fixed, AR.change)}` : "", rejected ? `رُفض: ${countOf(rejected, AR.change)}` : ""].filter(Boolean).join(" · ");
          const reach = reachAboutCard(
            { AdInstructorName: row.instructorName, AdInstructorMobile: row.instructorMobile },
            `${location.origin}/r/${row.linkId}`, "decided", summary,
          );
          return reach.href ? (
            <a className="request-notify" href={reach.href} target="_blank" rel="noreferrer noopener" title="رسالة واتساب جاهزة بالقرار ورابط الطلب">
              <Send aria-hidden="true" /> أبلغ الأستاذ
            </a>
          ) : (
            <span className="request-notify" data-blocked="true" title={reach.blocked || ""}><Send aria-hidden="true" /> لا رقم جوّال</span>
          );
        })()}
        </div>
        {/* مسارُ الطلب وسجلُّه مطويٌّ خلف أيقونة في رأس البطاقة نفسها، والمقترحاتُ الدراسية سطرٌ فيه. */}
        <RequestTimelineToggle
          timeline={row.timeline}
          itemLabel={index => row.items?.[index]?.after?.courseName || row.items?.[index]?.before?.courseName || undefined}
          detailText={event => !event.detail ? undefined
            : event.kind === "submitted" ? countOf(Number(event.detail) || 0, AR.change)
            : event.kind === "item-rejected" ? (REJECT_REASONS.find(([code]) => code === event.detail)?.[1] || event.detail)
            : event.kind === "alternative-chosen" || event.kind === "proposal-accepted" ? `البديل ${event.detail}`
            : event.detail}
        />
        <ProposalStrip requestId={row.id} proposals={proposals} onOpen={onOpenProposal} compact />
      </header>

      {row.note ? <p className="request-note"><MessageSquare aria-hidden="true" /><span>{row.note}</span></p> : null}
      {(() => {
        const edit = [...(row.timeline || [])].reverse().find(event => event.kind === "schedule-edited");
        return edit ? <p className="request-schedule-edited" role="status"><History aria-hidden="true" /><span><b>تعدّل الجدول المرتبط بهذا الطلب</b>{edit.detail ? ` · ${edit.detail}` : ""}</span></p> : null;
      })()}

      {/* ── بندٌ لكل سطر، بثلاث مناطق ثابتة ─────────────────────────────────
          ما هو (المقرّر وفعلُه)، ثم «كان ← المطلوب» رسماً، ثم منطقةُ القرار
          بحالها وأزرارها. على الحاسوب تتجاور الثلاث فيُقرأ الطلبُ بنظرة،
          وعلى اللوحيّ يتجاور التغييرُ والقرار، وعلى الهاتف تتتابع بلا جدول. */}
      {items.length ? (
        <ol className="request-list">
          {items.map(({ item, index }) => (
            <RequestRow
              key={`${row.id}:${index}`}
              row={row}
              item={item}
              index={index}
              current={item.rowId == null ? undefined : currentRows.get(Number(item.rowId))}
              busy={busyKey === `${row.id}:${index}`}
              rejecting={rejecting === index}
              error={rowErrors[`${row.id}:${index}`]}
              onReject={() => setRejecting(index)}
              onCloseReject={() => setRejecting(null)}
              onDecide={onDecide}
              onReply={onReply}
              onProposal={itemIndex => onOpenProposal({ requestId: row.id, itemIndex })}
              onBulk={onBulk}
            />
          ))}
        </ol>
      ) : null}
    </article>
  );
}

/* ── صفُّ بند ─────────────────────────────────────────────────────────────
 * الحكمُ المحفوظ مع الطلب والفحصُ الحيّ يُقرآن معاً: ما منعه أحدُهما مُنع،
 * وما نبّه إليه أحدُهما قيل. ولا يُكرَّر السببُ نفسُه مرّتين. */
function RequestRow({ row, item, index, current, busy: busyProp, rejecting, error, onReject, onCloseReject, onDecide, onReply, onProposal, onBulk }: {
  key?: React.Key;
  row: InboxRequest; item: InstructorRequestItem; index: number; current?: FSchedule;
  busy: boolean; rejecting: boolean; error?: string;
  onReject: () => void; onCloseReject: () => void;
  onDecide: (index: number, state: "fixed" | "rejected", extra?: any) => void;
  onReply: (index: number, text: string, slots: any[]) => void;
  onProposal?: (index: number) => void;
  onBulk?: (key: string, entry: BulkEntry | null) => void;
}) {
  const frozenScreen = useFrozenScreen();
  /* فصلٌ سابق: كلُّ ما يُقرِّر معطَّل كما لو كان مشغولاً. */
  const busy = busyProp || frozenScreen;
  const decided = item.decision?.state;
  const negotiation = negotiationState(item);
  const [talking, setTalking] = useState(false);
  const hasThread = Boolean((item.thread || []).length);
  const candidate = useMemo(() => proposedRow(row, item, current), [row, item, current]);
  const live = useLiveCheck(candidate, !decided && item.action !== "delete");
  const reasons = item.reasons || [];
  const seen = new Set(reasons.map(reason => reason.text));
  /* ── ما يُفرغه الطلبُ نفسُه ─────────────────────────────────────────────
     أستاذٌ نقل محاضرةً من الثامنة وأضاف أخرى في الثامنة: في الجدول الحاليّ
     هما متعارضتان، وفي الطلب لا. فالتعارضُ مع صفٍّ ينقله أو يحذفه بندٌ شقيقٌ
     لم يُقرَّر بعد ليس مانعاً — هو ترتيب: يُثبَّت الشقيقُ أولاً ثم هذا. */
  const siblings = new Map<number, { index: number; name: string; elsewhere?: boolean }>();
  (row.items || []).forEach((other, at) => {
    if (at === index || other.decision?.state || other.rowId == null) return;
    if (other.action !== "change" && other.action !== "delete") return;
    const elsewhere = Boolean((other as any).hidden);
    siblings.set(Number(other.rowId), {
      index: at, elsewhere,
      name: elsewhere ? "محاضرته في قسمٍ آخر" : String(other.before?.courseName || other.after?.courseName || "محاضرة"),
    });
  });
  const allLive = (live.issues || []).filter(issue => !seen.has(issue.message));
  const dependsOn: Array<{ index: number; name: string; elsewhere?: boolean }> = [...new Map<number, { index: number; name: string; elsewhere?: boolean }>(allLive
    .filter(issue => issue.otherId && siblings.has(issue.otherId))
    .map(issue => [issue.otherId!, siblings.get(issue.otherId!)!] as [number, { index: number; name: string; elsewhere?: boolean }])).values()];
  /* ما يُفرغه قسمٌ آخر لا يُثبَّت من هنا: ينتظر قرارَ ذلك القسم. */
  const waitsElsewhere = dependsOn.some(entry => entry.elsewhere);
  /* الفحصُ الحيّ والحكمُ يقولان التعارضَ نفسَه بلفظين: يُعرض مرّةً واحدة. */
  const judgedSources = new Set(reasons.filter(reason => reason.blocking).map(reason => reason.source));
  const liveIssues = allLive.filter(issue => !(issue.otherId && siblings.has(issue.otherId))
    && !(issue.type && judgedSources.has(issue.type as any)));
  /* كل تعارضٍ حيٍّ يمنع حفظَ الجدول يوقف التثبيت: اختيارُ الأستاذ يمرّ من فحص
     الموعد نفسه الذي يراه القسم، مع استثناء البنود الشقيقة التي ستُفرغها هذه
     الجولة كما عولجت أعلاه. (قاعةٌ مشغولة مع بديلٍ خالٍ لا تصل هنا: roomSwitch.) */
  const blocked = waitsElsewhere || item.verdict === "conflict" || reasons.some(reason => reason.blocking)
    /* ما يمنعه الحفظُ يمنع التثبيت؛ والتنبيهُ اللين (إيقاع القسم، تنقّل الحرم) يُقرأ ولا يمنع — كما في حفظ الجدول نفسه. */
    || liveIssues.some(issue => issue.severity === "high") || (item.action === "change" && !current);
  /* وصل جاهزاً ثم تحرّك الجدول (C7): تنبيهٌ وبديلٌ جاهز، لا «ممنوع». */
  const changedAfterSubmit = !decided && Boolean(row.submittedAt) && item.verdict === "conflict" && item.action !== "delete";
  const readiness: Readiness = decided ? "ready"
    : item.action === "delete" ? "ready"
    : waitsElsewhere && !liveIssues.some(issue => issue.severity === "high") && !reasons.some(reason => reason.blocking) ? "waiting"
    : blocked ? "blocked"
    : live.loading && !live.issues ? "checking"
    : (reasons.length || liveIssues.length || dependsOn.length) ? "review" : "ready";

  /* ── «ثبّت الجاهز كله» يقرأ الجاهزيةَ من هنا، لا من حكمٍ ثانٍ ──────────────
     يصلح له التعديلُ وحده (زرّ «ثبّت»؛ الإضافةُ تفتح بطاقتها والحذفُ لا يُفحص)
     حين يكون جاهزاً بلا موانع ولا تنبيه، لم يتغيّر بعد الإرسال، ولا ينتظر قسماً
     آخر ولا بنداً آخر، ولا مقترحاً من القسم ينتظر ردَّ الأستاذ. وما يُعاد فحصُه
     يُبلَّغ «قيد الفحص» فينتظره التثبيتُ الجماعيّ بدل أن يتخطّاه. */
  const bulkKey = `${row.id}:${index}`;
  const afterGroups = slotGroups(item.slots);
  const perDay = afterGroups.length > 1;
  /* `candidate`: بندٌ لم يمرّ بالفحص الحيّ (أوقاتٌ تختلف بين الأيام فيُكتب صفّين) لا يُعدّ
     جاهزاً للجملة — يبقى لزرّه وحده، ومعاينتُه تعرض ما سيُكتب. */
  const bulkFit = !decided && !frozenScreen && item.action === "change" && candidate !== null
    && !changedAfterSubmit && !dependsOn.length && negotiation !== "proposed";
  const bulkEntry = bulkFit && (live.loading || readiness === "ready") ? JSON.stringify({
    key: bulkKey, requestId: row.id, index, itemId: requestItemId(item),
    teacher: row.instructorName, course: String(item.after?.courseName || item.before?.courseName || ""),
    beforeDays: String(item.before?.days || ""), beforeTime: String(item.before?.time || ""),
    afterDays: String(item.after?.days || ""), afterTime: perDay ? groupsLabel(afterGroups) : String(item.after?.time || ""),
    ready: readiness === "ready" && !live.loading,
  } satisfies BulkEntry) : "";
  useEffect(() => { onBulk?.(bulkKey, bulkEntry ? JSON.parse(bulkEntry) as BulkEntry : null); }, [onBulk, bulkKey, bulkEntry]);
  useEffect(() => () => onBulk?.(bulkKey, null), [onBulk, bulkKey]);

  const beforeWeek = weekOf(item.before?.days);
  const afterText = weekOf(item.after?.days);
  const afterWeek = afterText.size ? afterText : new Set<string>((item.slots || []).map(slot => String(slot.day)));
  const timeMoved = item.action === "change" && String(item.before?.time || "").replace(/\s+/g, "") !== String(item.after?.time || "").replace(/\s+/g, "");
  const ActionIcon = item.action === "add" ? Plus : item.action === "delete" ? Trash2 : Replace;

  return (
    <li className="request-row" data-action={item.action} data-verdict={item.verdict || "clear"} data-decided={decided || undefined} data-readiness={readiness}>
      <div className="request-row-grid">
        <div className="request-what" role="group" aria-label="الطلب">
          <span className="request-action" data-action={item.action}><ActionIcon aria-hidden="true" />{ACTION_LABEL[item.action] || item.action}</span>
          <strong className="request-course">{item.after?.courseName || item.before?.courseName || "—"}<PlanBadge courseId={item.after?.courseId || item.before?.courseId} />{(item as any).offering ? <span className="badge badge-warning" title={(item as any).offering.line} style={{ marginInlineStart: 6 }}>{(item as any).offering.icon} {(item as any).offering.line}</span> : null}</strong>
          {item.before?.sectionCode ? <small>شعبة {item.before.sectionCode}</small> : null}
          {item.action === "add" && item.after?.collegeName ? <small>{item.after.collegeName}</small> : null}
        </div>
        <div className="request-change" role="group" aria-label="التغيير">
          <div className="request-flow">
            {item.before && item.action !== "add" ? (
              <div className="request-slot is-before" title={`كان: ${[item.before.days, item.before.time].filter(Boolean).join(" ")}`}>
                <span className="request-slot-cap">كان</span>
                <WeekStrip days={item.before.days} on={beforeWeek} other={item.action === "change" ? afterWeek : undefined} />
                <bdi dir="ltr" className="request-slot-time">{item.before.time}</bdi>
                {item.before.room ? <small className="request-room"><DoorOpen aria-hidden="true" /><bdi dir="ltr">{item.before.room}</bdi></small> : null}
              </div>
            ) : null}
            {item.before && item.action !== "add" ? <span className="request-flow-arrow" aria-hidden="true"><ArrowLeft /></span> : null}
            {item.action === "delete" ? (
              <div className="request-slot is-gone"><Trash2 aria-hidden="true" /><span className="request-none">حذف الموعد</span></div>
            ) : item.after ? (
              <div className="request-slot is-after" title={`المطلوب: ${perDay ? groupsLabel(afterGroups) : [item.after.days, item.after.time].filter(Boolean).join(" ")}`}>
                <span className="request-slot-cap">{item.action === "add" ? "جديد" : "المطلوب"}</span>
                <WeekStrip days={item.after.days} on={afterWeek} other={item.action === "change" ? beforeWeek : undefined} />
                {/* أوقاتٌ تختلف بين الأيام: كلُّ فريقٍ من الأيام بوقته، لا نهايةُ اليوم الأول للجميع. */}
                {perDay ? <SlotTimes groups={afterGroups} />
                  : <bdi dir="ltr" className="request-slot-time" data-moved={timeMoved ? "1" : undefined}>{item.after.time}</bdi>}
                {/* القاعةُ التي حُجزت للطلب عند إرساله (C1) — أو أنسبُ المرشّحات إن لم يُحجز بعد. */}
                {item.action === "change" && item.roomSwitch && !item.reservedRoom ? (
                  <small className="request-room request-room-switch" data-held="1" title={`القاعة ${item.roomSwitch.from} مشغولة في الوقت الجديد`}>
                    <RefreshCw aria-hidden="true" /><span>القاعة بُدّلت إلى</span><bdi dir="ltr">{[item.roomSwitch.to.room, item.roomSwitch.to.hall].filter(Boolean).join("/")}</bdi>
                  </small>
                ) : (item.reservedRoom?.label || (item.action === "add" && item.roomOptions?.[0])) ? (
                  <small className="request-room" data-held={item.reservedRoom ? "1" : undefined} title={item.reservedRoom ? "قاعةٌ محجوزةٌ للطلب" : "الأنسب الآن"}>
                    <DoorOpen aria-hidden="true" /><bdi dir="ltr">{item.reservedRoom?.label || [item.roomOptions![0].room, item.roomOptions![0].hall].filter(Boolean).join("/")}</bdi>
                    {(item.reservedRoom?.companionLabel || item.roomOptions?.[0]?.companionRoomLabel) ? <><Wrench aria-hidden="true" /><bdi dir="ltr">{item.reservedRoom?.companionLabel || item.roomOptions?.[0]?.companionRoomLabel}</bdi></> : null}
                    {(item.roomOptions?.[0]?.why || []).map(reason => { const Icon = ROOM_WHY_ICON[reason]; return Icon ? <Icon key={reason} aria-label={ROOM_WHY_LABEL[reason]} className="request-room-why" /> : null; })}
                  </small>
                ) : null}
              </div>
            ) : <span className="request-none">—</span>}
          </div>
          {item.excuse ? <p className="request-excuse"><MessageSquare aria-hidden="true" /><span>{item.excuse}</span></p> : null}
        </div>
        <div className="request-decision" role="group" aria-label="القرار">
          <div className="request-decision-head">
            {!decided ? (
              <span className="request-readiness" data-readiness={changedAfterSubmit ? "review" : readiness}>
                {changedAfterSubmit ? <RefreshCw aria-hidden="true" />
                  : readiness === "checking" ? <Loader2 aria-hidden="true" className="spin" />
                  : readiness === "waiting" ? <Clock3 aria-hidden="true" />
                  : readiness === "blocked" ? <ShieldAlert aria-hidden="true" />
                  : readiness === "review" ? <AlertTriangle aria-hidden="true" />
                  : <ShieldCheck aria-hidden="true" />}
                {item.action === "delete" ? "حذفٌ لا يُفحص" : changedAfterSubmit ? "تغيّر بعد الإرسال" : READINESS[readiness]}
              </span>
            ) : null}
            {(item.roomCandidates || []).length && item.action !== "delete" && !decided ? (
              <small className="request-rooms" title="قاعاتٌ متاحة في هذا الوقت"><DoorOpen aria-hidden="true" />متاحٌ في هذا الوقت: {countOf(item.roomCandidates!.length, AR.room)}</small>
            ) : null}
            {hasThread || negotiation === "proposed" ? (
              <span className="request-negotiation" data-negotiation={negotiation}>{NEGOTIATION_LABEL[negotiation]}</span>
            ) : null}
          </div>
          {item.action !== "delete" && (reasons.length || liveIssues.length) ? (
            <ul className="request-issues">
              {reasons.map((reason, at) => (
                <li key={`r${at}`} data-severity={reason.blocking ? "high" : "medium"}>
                  <AlertShort text={reason.text} fallbackIcon={reason.blocking ? ShieldAlert : AlertTriangle} />
                </li>
              ))}
              {liveIssues.map((issue, at) => (
                <li key={`l${at}`} data-severity={issue.severity}>
                  <AlertShort text={issue.message} detail={issue.detail} fallbackIcon={issue.severity === "high" ? ShieldAlert : AlertTriangle} />
                </li>
              ))}
            </ul>
          ) : null}
          {(item as any).awaitedElsewhere && !decided ? (
            <p className="request-depends" data-tone="linked">
              <ArrowRight aria-hidden="true" />
              <span>قسمٌ آخر ينتظر هذا {item.action === "delete" ? "الحذف" : "النقل"} ليُكمل طلبَ الأستاذ — ثبّته أولاً.</span>
            </p>
          ) : null}
          {dependsOn.length && !decided ? (
            <p className="request-depends">
              <ArrowRight aria-hidden="true" />
              <span>{waitsElsewhere
                ? "يعتمد على حذف محاضرته في قسمٍ آخر — بانتظار قرار ذلك القسم."
                : <>يُفرغ هذا الوقتَ من طلبه نفسه: {dependsOn.map(entry => `«${entry.name}»`).join(" و")} — يُثبَّت ذلك أولاً تلقائياً.</>}</span>
            </p>
          ) : null}
          {/* ── وصل جاهزاً ثم تغيّر شيء (C7) ── الطلبُ لا يُقبل عند الإرسال وهو ممنوع، فالمنعُ هنا
              يعني أن الجدول تحرّك بعده: تنبيهٌ واحد وبديلٌ جاهز بضغطة بدل «ممنوع» صامتة. */}
          {changedAfterSubmit && (item.nearestTimes || []).length ? (
            <div className="request-changed" role="group" aria-label="بديلٌ جاهز يُقترح على الأستاذ">
              <Send aria-hidden="true" /><span>بديل جاهز</span>
              {(item.nearestTimes || []).slice(0, 2).map(slot => (
                <SecondaryButton key={`${(slot.days || [slot.day]).join(",")}|${slot.start}`} type="button" disabled={busy}
                  title="يُقترح على الأستاذ فيوافق بضغطة"
                  data-guide-ignore="اقتراحُ بديلٍ جاهز على الأستاذ — ردٌّ في حوار البند لا يكتب في الجدول"
                  onClick={() => onReply(index, "", [{ day: slot.day, days: slot.days?.length ? slot.days : [slot.day], start: slot.start, end: slot.end }])}>
                  {(slot.days?.length ? slot.days : [slot.day]).map(day => INBOX_DAY_NAMES[day as keyof typeof INBOX_DAY_NAMES] || day).join(" · ")} <bdi dir="ltr">{slot.start}</bdi>
                </SecondaryButton>
              ))}
            </div>
          ) : null}
          {item.action === "change" && !current && !decided ? (
            <p className="request-issue-note">لم يعد هذا الموعد في الجدول — ربما حُذف أو نُقل بعد الطلب.</p>
          ) : null}
          {decided ? (
            <p className="request-decided" data-state={decided}>
              {decided === "fixed" ? <><Check aria-hidden="true" /> ثُبّت</> : <><X aria-hidden="true" /> رُفض — {REJECT_REASONS.find(([value]) => value === item.decision?.reasonCode)?.[1] || "بلا سبب"}</>}
              {item.decision?.note ? <span> · {item.decision.note}</span> : null}
            </p>
          ) : (
            <div className="request-actions">
              <PrimaryButton
                type="button"
                data-guide-target="requests.action.fix"
                disabled={busy || blocked || readiness === "checking"}
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onDecide(index, "fixed", { current, anchor: { x: rect.left + rect.width / 2, y: rect.bottom }, after: dependsOn.filter(entry => !entry.elsewhere).map(entry => entry.index) });
                }}
                title={waitsElsewhere ? "ينتظر قرار القسم الآخر في حذف محاضرته" : blocked ? "لا يُثبَّت بندٌ ممنوع — عالج سببه أو ارفضه" : undefined}
              >
                {busyProp ? <Loader2 aria-hidden="true" className="spin" /> : item.action === "add" ? <Plus aria-hidden="true" /> : <Check aria-hidden="true" />}
                {busy ? "يحفظ…" : item.action === "add" ? "أضِفه الآن" : "ثبّت"}
              </PrimaryButton>
              <SecondaryButton type="button" data-guide-target="requests.action.reject" onClick={onReject} disabled={frozenScreen}>
                <X aria-hidden="true" />ارفض
              </SecondaryButton>
            </div>
          )}
          {error ? <p className="request-row-error"><ShieldAlert aria-hidden="true" />{error}</p> : null}
        </div>
      </div>
      {hasThread || talking ? (
        <div className="request-thread-slot">
          <RequestThread
            item={item}
            busy={busy}
            onClose={hasThread ? undefined : () => setTalking(false)}
            onReply={(text, slots) => onReply(index, text, slots)}
            onProposal={onProposal ? () => onProposal(index) : undefined}
          />
        </div>
      ) : null}
      {rejecting ? (
        <RejectSheet
          item={item}
          busy={busy}
          onClose={onCloseReject}
          onSubmit={(reason, note, alternatives) => {
            onDecide(index, "rejected", { reasonCode: reason, note, alternatives });
            onCloseReject();
          }}
        />
      ) : null}
    </li>
  );
}

/* ── نافذةُ «ثبّت الجاهز كله» ────────────────────────────────────────────────
 * خطوةُ تأكيدٍ صريحة بالعدد والأسماء (الأستاذ والمقرّر وما يتحرّك)، ثم تقدّمٌ
 * بنداً بنداً، ثم خلاصة: ما ثُبّت، وأين توقّف ولماذا، وما بقي لم يُمسّ. */
interface BulkState {
  phase: "confirm" | "running" | "done";
  list: BulkEntry[];
  done: string[];
  current: string | null;
  failed?: { key: string; message: string };
  stopped?: boolean;
  stopping?: boolean;
}

function BulkSheet({ state, onConfirm, onStop, onClose }: {
  state: BulkState;
  onConfirm: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const total = state.list.length;
  const doneCount = state.done.length;
  const running = state.phase === "running";
  const failedAt = state.failed ? state.list.findIndex(entry => entry.key === state.failed!.key) : -1;
  const failedEntry = failedAt >= 0 ? state.list[failedAt] : undefined;
  const allDone = state.phase === "done" && doneCount === total;
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { primaryRef.current?.focus(); }, [state.phase]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !running) { event.preventDefault(); onClose(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [running, onClose]);
  return (
    <div className="inbox-bulk-sheet" role="dialog" aria-modal="true" aria-labelledby="inbox-bulk-title" aria-describedby="inbox-bulk-lead"
      onMouseDown={event => { if (event.target === event.currentTarget && !running) onClose(); }}>
      <section className="inbox-bulk-card" data-phase={state.phase} data-result={state.phase !== "done" ? undefined : allDone ? "ok" : "partial"}>
        <span className="inbox-bulk-grip" aria-hidden="true" />
        <header className="inbox-bulk-head">
          <span className="inbox-bulk-icon" aria-hidden="true"><CheckCheck /></span>
          <span className="inbox-bulk-title">
            <strong id="inbox-bulk-title">ثبّت الجاهز كله</strong>
            <small>{countOf(total, AR.change)}</small>
          </span>
          <button type="button" className="inbox-bulk-close" onClick={onClose} disabled={running} aria-label="إغلاق"
            data-guide-ignore="إغلاق نافذة «ثبّت الجاهز كله» — لا يغيّر شيئاً، ومعطَّلٌ أثناء التثبيت">
            <X aria-hidden="true" />
          </button>
        </header>
        <p id="inbox-bulk-lead" className="inbox-bulk-lead" aria-live="polite">
          {state.phase === "confirm" ? "بمسار «ثبّت» نفسه وفحوصه، بنداً بعد بند، ويتوقّف عند أول تعذّر."
            : running ? <><Loader2 aria-hidden="true" className="spin" />يثبّت {num(Math.min(total, doneCount + 1))} من {num(total)}…{state.stopping ? " · يتوقّف بعد هذا البند" : ""}</>
              : allDone ? <><Check aria-hidden="true" />ثُبّت {countOf(doneCount, AR.change)}</>
                : state.failed ? <><ShieldAlert aria-hidden="true" />توقّف عند {num(failedAt + 1)} من {num(total)}</>
                  : <><X aria-hidden="true" />أوقفتَ التثبيت</>}
        </p>
        {state.phase !== "confirm" ? (
          <div className="inbox-bulk-progress" role="progressbar" aria-label="تقدّم التثبيت" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}>
            <i style={{ inlineSize: `${total ? Math.round((doneCount / total) * 100) : 0}%` }} />
          </div>
        ) : null}
        <ol className="inbox-bulk-list">
          {state.list.map(entry => {
            const status = state.done.includes(entry.key) ? "done" : state.failed?.key === entry.key ? "failed" : state.current === entry.key ? "running" : "waiting";
            return (
              <li key={entry.key} data-state={status}>
                <span className="inbox-bulk-state" aria-hidden="true">
                  {status === "done" ? <Check /> : status === "failed" ? <X /> : status === "running" ? <Loader2 className="spin" /> : <CircleDashed />}
                </span>
                <span className="inbox-bulk-who"><b>{entry.teacher}</b><span>{entry.course}</span></span>
                <span className="inbox-bulk-move">
                  <WeekStrip days={entry.beforeDays} on={weekOf(entry.beforeDays)} compact />
                  <ArrowLeft aria-hidden="true" className="inbox-bulk-arrow" />
                  <WeekStrip days={entry.afterDays} on={weekOf(entry.afterDays)} compact />
                  <bdi dir="ltr">{entry.afterTime}</bdi>
                </span>
                <span className="sr-only">{status === "done" ? "ثُبّت" : status === "failed" ? "تعذّر" : status === "running" ? "يُثبَّت الآن" : "بالانتظار"}</span>
              </li>
            );
          })}
        </ol>
        {state.failed && failedEntry ? (
          <p className="inbox-bulk-error" role="alert">
            <ShieldAlert aria-hidden="true" />
            <span><b>{failedEntry.teacher} — {failedEntry.course}</b>{state.failed.message}</span>
          </p>
        ) : null}
        {state.phase === "done" && !allDone ? (
          <p className="inbox-bulk-sum">
            {doneCount ? `ثُبّت ${countOf(doneCount, AR.change)}` : "لم يُثبَّت شيء"} · بقي {countOf(total - doneCount, AR.change)} دون تثبيت
          </p>
        ) : null}
        <footer className="changes-extend-actions inbox-bulk-actions">
          {state.phase === "confirm" ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}
                data-guide-ignore="تراجعٌ عن «ثبّت الجاهز كله» قبل أن يبدأ — لا يغيّر شيئاً">تراجع</button>
              <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onConfirm}
                data-guide-ignore="تأكيدُ «ثبّت الجاهز كله» بعد رؤية العدد والأسماء — كلُّ بندٍ يمرّ بزرّ «ثبّت» نفسه وفحوصه">
                <CheckCheck aria-hidden="true" />ابدأ التثبيت
              </button>
            </>
          ) : running ? (
            <button ref={primaryRef} type="button" className="btn btn-secondary" onClick={onStop} disabled={state.stopping}
              data-guide-ignore="إيقافُ التثبيت الجماعي بعد البند الجاري — لا يتراجع عمّا ثُبّت">
              {state.stopping ? "يتوقّف بعد الحالي…" : "أوقف بعد الحالي"}
            </button>
          ) : (
            <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onClose}
              data-guide-ignore="إغلاق خلاصة «ثبّت الجاهز كله» — لا يغيّر شيئاً">إغلاق</button>
          )}
        </footer>
      </section>
    </div>
  );
}

type FilterOption = { value: string; label: string; count?: number; tone?: "ok" | "warn" | "bad" };
const ALL_VALUES = new Set(["all", "0"]);

/**
 * ما يُعرض من مجموعة مرشّحات (قاعدة إخفاء الفارغ): مرشّحٌ بلا عنصرٍ تحته لا يُعرض —
 * إلا المختارُ الآن — ومجموعةٌ لم يبقَ فيها ما يُختار بينه (خيارٌ واحدٌ غير «الكل»)
 * لا تُعرض أصلاً.
 */
export function visibleFilterOptions(options: FilterOption[], value: string): FilterOption[] {
  const shown = options.filter(option => option.count !== 0 || value === option.value);
  const choices = shown.filter(option => !ALL_VALUES.has(option.value));
  if (choices.length <= 1 && (ALL_VALUES.has(value) || choices[0]?.value === value || !choices.length)) return [];
  return shown;
}

function FilterGroup({ label, value, options, onChange }: {
  label: string; value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const shown = visibleFilterOptions(options, value);
  if (!shown.length) return null;
  return (
    <div className="request-filter" role="group" aria-label={label}>
      <span className="request-filter-label">{label}</span>
      <div className="request-filter-chips">
        {shown.map(option => (
          <button
            key={option.value}
            type="button"
            className={value === option.value ? "active" : ""}
            aria-pressed={value === option.value}
            data-tone={option.tone}
            data-guide-ignore="تصفية الوارد — عرضٌ لا فعل"
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined ? <b>{option.count.toLocaleString("ar-KW-u-nu-latn")}</b> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* رسائلُ الحفظ كُتبت لنموذج «الجدول الدراسي» — «الحقول بالأحمر» لا معنى لها
   هنا حيث لا حقول. فتُقال بما يعنيه البندُ نفسُه. */
const inboxMessage = (raw: string) => {
  const text = String(raw || "");
  if (/الحقول المطلوبة|المبنى|القاعة غير/.test(text)) return "هذا الموعد مسجّلٌ في الجدول بلا مبنى أو قاعة معتمدة، فلا يُنقل قبل تحديدها. افتحه في «الجدول الدراسي» وحدّد قاعته، ثم ثبّت.";
  if (/مقفل|عند التسجيل/.test(text)) return "الجدول عند التسجيل الآن، والتعديل مقفلٌ حتى يُقبل أو يُرجَع.";
  if (/انتهى هذا الفصل/.test(text)) return text;
  return text || "تعذّر التثبيت.";
};

/* ── الشاشة ─────────────────────────────────────────────────────────────── */

const INBOX_DAY_NAMES: Record<string, string> = {
  fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس",
};

export default function InstructorInbox({ scopes, powerAdmin = false, onNavigate }: Props) {
  const [terms, setTerms] = useState<AdTerm[] | null>(null);
  const [termId, setTermId] = useState(0);
  /* فصلٌ سابق: رغباتُه تُقرأ ولا يُقرَّر فيها (والخادم يرفض أيضاً). الأزرار تبقى معطَّلة لا محذوفة. */
  const frozen = useTermFrozen(termId, terms);
  /* الكلية والقسم من النطاق المشترك (src/utils/sharedScope.ts)، معروضين على
     نطاق القارئ؛ وافتراض الشاشة أدناه («أوّل كلية») لا يُكتب فيه. */
  const [collegeId, setCollegeId] = useState(() => resolveSharedScope(readSharedScope(), { scopes, isAdmin: powerAdmin }).collegeId);
  const [sectionId, setSectionId] = useState(() => resolveSharedScope(readSharedScope(), { scopes, isAdmin: powerAdmin }).sectionId);
  const [rows, setRows] = useState<InboxRequest[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [familyColleges, setFamilyColleges] = useState<Array<{ id: number; name: string }>>([]);
  /* النطاق مطويٌّ على الجوال: سطرٌ يقول أين أنت، والتغيير بضغطة. */
  const [scopeOpen, setScopeOpen] = useState(false);
  const [currentRows, setCurrentRows] = useState<Map<number, FSchedule>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [showUnchanged, setShowUnchanged] = useState(false);
  /* المقترحات الدراسية: قائمتها في النطاق، والمساحة المفتوحة الآن (إن وُجدت). */
  const [proposals, setProposals] = useState<StaffProposalView[]>([]);
  const [workspace, setWorkspace] = useState<OpenWorkspace | null>(null);
  const personChoicesRef = useRef<ReturnType<typeof proposalLauncherChoices>>([]);
  /* ── المرشّحات ──────────────────────────────────────────────────────────
     أربعةُ أسئلةٍ يسألها المنسّق فعلاً: ما الذي ينتظرني؟ أيُّ نوع؟ ما الجاهزُ
     منه؟ وفي أيّ قسم؟ وكلٌّ منها زرٌّ واحد، لا قائمةٌ منسدلة. */
  const [stateFilter, setStateFilter] = useState<"pending" | "fixed" | "rejected" | "all" | "confirmed-unchanged" | "absent">("pending");
  const [actionFilter, setActionFilter] = useState<"all" | "change" | "add" | "delete">("all");
  const [verdictFilter, setVerdictFilter] = useState<"all" | "clear" | "exception" | "conflict">("all");
  const [deptFilter, setDeptFilter] = useState(0);
  /* D2/F3: «🎓 تدريب» — طلباتُ مرحلة التدريب وحدها (المصدرُ الواحد: ‎isTaRequest(row)‎). */
  const [taOnly, setTaOnly] = useState(false);
  const [instructorFilter, setInstructorFilter] = useState(0);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [quick, setQuick] = useState<{ row: InboxRequest; index: number; after?: number[]; seed: QuickSeed } | null>(null);
  /* تنبيهاتٌ لا تمنع (انتقالٌ ضيّق بين مبنيين…) بعد تثبيتٍ نجح. */
  const [notice, setNotice] = useState<string | null>(null);
  /* المساحة تعمل على الجوال أيضاً: الجدول يتحوّل إلى يومٍ واحدٍ بخطٍّ زمني حين يضيق العرض. */
  /* أيُّ طريقٍ فتح المساحة (المنتقي أو بطاقة الطلب): تُرفق بها طلباتُ الشخص نفسه كلُّها —
     بنين وبنات وكلُّ كلية — فيرى صورته الكاملة ويتنقّل بينها (r2). */
  const openStudyProposal = (target: OpenWorkspace) => {
    if (target.siblings) { setWorkspace(target); return; }
    const person = personChoicesRef.current.find(choice => choice.requests.some(entry => entry.id === target.requestId));
    setWorkspace({ ...target, siblings: person && person.requests.length > 1 ? person.requests : undefined });
  };
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  /* خريطةُ «تكدّس الطلبات» مطويّةٌ على الهاتف خلف رأسها؛ على الحاسوب واللوحيّ مفتوحةٌ دائماً (CSS). */
  const [heatOpen, setHeatOpen] = useState(false);

  /* ── «ثبّت الجاهز كله» ────────────────────────────────────────────────────
     كلُّ صفٍّ معروض يبلّغ هنا أهو جاهزٌ (reportBulk)، فيُعدّ الجاهزُ ممّا تراه
     العين لا من حكمٍ ثانٍ. والتثبيتُ نفسُه هو `decide` — زرُّ «ثبّت» بخادمه
     وفحوصه ومعاينته — بنداً بعد بند، ويتوقّف عند أول تعذّر ويقوله. */
  const [bulkPool, setBulkPool] = useState<Record<string, BulkEntry>>({});
  const reportBulk = useCallback((key: string, entry: BulkEntry | null) => {
    setBulkPool(prev => {
      if (!entry) {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev[key] && JSON.stringify(prev[key]) === JSON.stringify(entry) ? prev : { ...prev, [key]: entry };
    });
  }, []);
  const [bulk, setBulk] = useState<BulkState | null>(null);
  const bulkStop = useRef(false);
  const bulkTrigger = useRef<HTMLButtonElement>(null);
  /* آخرُ سببٍ ردّ به الخادمُ تثبيتاً — يقرؤه التثبيتُ الجماعيّ ليقول أين توقّف ولماذا. */
  const decideFailure = useRef("");

  /* ── ما يراه صاحبُ الصلاحية الكاملة ──────────────────────────────────────
   *
   * قوائمُ الكلية والقسم كانت تُبنى من نطاق الحساب وحدَه. وهو صوابٌ لمن له
   * نطاق، وخطأٌ لمن لا نطاقَ له لأن له الكلَّ: صاحبُ الصلاحية الكاملة كان يرى
   * الكليتين المسندتين إليه فقط، ويظنّ أن النظام لا يعرف غيرهما.
   *
   * والقاعدةُ مستقرّةٌ في الشاشات القديمة: الكتالوجُ كاملاً لمن له الكلّ،
   * ومُصفّىً بالنطاق لمن سواه. فتُقرأ هنا بالقاعدة نفسِها، لا بقاعدةٍ ثانيةٍ
   * تشبهها. */
  const [catalog, setCatalog] = useState<{
    colleges: Array<{ AdCollegeId: number; AdCollegeName: string }>;
    sections: Array<{ AdSectionId: number; AdCollegeId: number; AdSectionName: string }>;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await request("/api/terms");
        const list: AdTerm[] = Array.isArray(data) ? data : (data.terms || []);
        setTerms(list);
        setTermId(current => current || resolveSharedScope(readSharedScope(), {
          scopes, isAdmin: powerAdmin, terms: list,
          fallbackTermId: currentTermId(list) || Number(list[list.length - 1]?.AdTermId || 0),
        }).termId);
      } catch (e: any) { setError(e.message); setTerms([]); }
    })();
  }, []);

  /* ولا يُقرأ الكتالوجُ إلا لمن يحتاجه: من له نطاقٌ يكفيه نطاقُه، ورحلتان
     إضافيتان في كل فتحةِ شاشةٍ ثمنٌ بلا مقابل. */
  useEffect(() => {
    if (!powerAdmin) { setCatalog(null); return; }
    void (async () => {
      try {
        const [colleges, sections] = await Promise.all([request("/api/colleges"), request("/api/sections")]);
        setCatalog({
          colleges: Array.isArray(colleges) ? colleges : (colleges.colleges || []),
          sections: Array.isArray(sections) ? sections : (sections.sections || []),
        });
      } catch { setCatalog(null); }
    })();
  }, [powerAdmin]);

  /* النطاقُ الافتراضيُّ نطاقُ الحساب حين يكون واحداً: من له قسمٌ واحدٌ لا
     يُسأل عن قسمه في كل فتحة. */
  /* جاء من إشعار: يفتح على قسم الطلب نفسه، لا على نطاقٍ فارغ. */
  useEffect(() => {
    /* القارئ الوحيد للتركيز (notifyFocus.ts): يأخذه لهذه الشاشة وحدها، ويكتبه في
       النطاق المشترك — هدفٌ صريحٌ يغلب. */
    const focus = takeNotifyFocus("instructorRequests");
    if (focus?.collegeId) { setCollegeId(focus.collegeId); setSectionId(focus.sectionId || 0); }
  }, []);

  /* تغيّرٌ من شاشةٍ أخرى أو لسانٍ آخر يُعرض على النطاق ثم يُتبع. */
  /* قائمةُ الفصل: ما فيه بيانات للنطاق المختار، والحالي دائماً (useScopedTerms). */
  const scopedTerms = useScopedTerms<AdTerm>(terms, collegeId, sectionId, termId, setTermId);
  const sharedScope = useSharedScope((incoming) => {
    const next = resolveSharedScope(incoming, { scopes, isAdmin: powerAdmin, terms: terms || undefined, fallbackTermId: termId });
    setCollegeId(next.collegeId);
    setSectionId(next.sectionId);
    if (next.termId) setTermId(next.termId);
  });

  useEffect(() => {
    /* ومن له الكلُّ لا يُختار له شيء: اختيارُ أوّلِ كليةٍ في الكتالوج يُخفي
       عنه البقيّةَ خلف قراءةٍ بدأت بلا طلبه. */
    if (collegeId || powerAdmin || !scopes.length) return;
    const first = Number(scopes[0].AdCollegeId) || 0;
    setCollegeId(first);
    /* قسمٌ واحد في الكلية: يُختار له، ومنتقيه لا يُرسم (singleDepartmentOf). */
    const only = singleDepartmentOf(scopes, first);
    if (only) setSectionId(only);
  }, [scopes, collegeId, powerAdmin]);

  /* والمنتقي المخفيّ لا يترك القيمة فارغة: أيّ طريقٍ وصل بالكلية (إشعار، تبديل)
     يُعاد قسمُه إلى القسم الوحيد، فيبقى الطلبُ يحمل sectionId. */
  useEffect(() => {
    const only = singleDepartmentOf(scopes, collegeId, powerAdmin);
    if (only && sectionId !== only) setSectionId(only);
  }, [scopes, collegeId, sectionId, powerAdmin]);

  const load = useCallback(async () => {
    if (!collegeId || !termId) { setRows(null); return; }
    setError(null);
    try {
      const data = await request(`/api/instructor-requests?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      setRows((data.rows || []).slice().sort((a: any, b: any) => byArabic(a.instructorName, b.instructorName)));
      setTotals(data.totals || null);
      setFamilyColleges(Array.isArray(data.familyColleges) ? data.familyColleges : []);
      const scopesInFamily = Array.isArray(data.familyScopes) ? data.familyScopes : [{ collegeId, sectionId, collegeName: "" }];
      setCurrentRows(new Map((data.currentRows || []).map((row: FSchedule) => [Number(row.id), row])));
      /* المقترحات تأتي بعد الطلبات ولا تُوقف عرضها إن تعذّرت. */
      Promise.all(scopesInFamily.map((scope: any) => proposalApi.list(Number(scope.collegeId), Number(scope.sectionId), termId)))
        .then(results => setProposals([...new Map(results.flatMap(result => result.proposals || []).map(view => [view.proposal.id, view])).values()]))
        .catch(() => undefined);
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [collegeId, sectionId, termId]);

  useEffect(() => { void load(); }, [load]);
  /* الواردُ حيّ: طلبٌ يصل أو قرارٌ من زميلٍ يُعيد القراءةَ بهدوء، فلا يُثبِّت
     اثنان البندَ نفسه ولا ينتظر أحدٌ زرَّ تحديث. */
  /* يسمع ولا يُبقي خيطاً مفتوحاً: نبضةُ اللسان (utils/livePulse.ts) تقول «في
     الجرس جديد» خلال ثوانٍ، فيُقرأ الواردُ كما كان يُقرأ. وتنام مع اللسان
     (pageAwake.ts)، وحين يصحو يقرأ مرّةً واحدةً ليلحق بما فاته — عند الصحوة
     وحدها، لا كلما تغيّر النطاق (فذاك يقرؤه الأثرُ الذي فوقه). */
  const pageAwake = usePageAwake();
  const inboxSlept = useRef(false);
  useEffect(() => {
    if (!pageAwake) { inboxSlept.current = true; return; }
    if (inboxSlept.current) { inboxSlept.current = false; void load(); }
    let timer = 0;
    const soon = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 900); };
    const stopPulse = onLiveSignal(["notify"], soon);
    return () => { window.clearTimeout(timer); stopPulse(); };
  }, [pageAwake, load]);

  const collegeOptions = useMemo(() => {
    if (catalog) {
      return catalog.colleges
        .map(row => ({ value: Number(row.AdCollegeId), label: String(row.AdCollegeName || `كلية ${row.AdCollegeId}`) }))
        .filter(item => item.value)
        .sort((a, b) => byArabic(a.label, b.label));
    }
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      const id = Number(scope.AdCollegeId);
      if (id && !seen.has(id)) seen.set(id, String(scope.AdCollegeName || `كلية ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes, catalog]);

  const sectionOptions = useMemo(() => {
    if (catalog) {
      return catalog.sections
        .filter(row => !collegeId || Number(row.AdCollegeId) === collegeId)
        .map(row => ({ value: Number(row.AdSectionId), label: String(row.AdSectionName || `قسم ${row.AdSectionId}`) }))
        .filter(item => item.value)
        .sort((a, b) => byArabic(a.label, b.label));
    }
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      if (collegeId && Number(scope.AdCollegeId) !== collegeId) continue;
      const id = Number(scope.AdSectionId);
      if (id && !seen.has(id)) seen.set(id, String(scope.AdSectionName || `قسم ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes, collegeId, catalog]);

  const needle = ask.trim();
  /* شخصٌ واحدٌ مرّةً واحدة، و«هيئة تدريسية» ليست أستاذاً في الوارد (N1). */
  const instructorChoices = useMemo(() => inboxInstructorChoices(rows || []), [rows]);
  const visible = useMemo(() => {
    const chosen = instructorFilter ? instructorChoices.find(choice => choice.ids.includes(instructorFilter)) : undefined;
    return (rows || [])
      .filter(row => !isPlaceholderInboxRow(row))
      .filter(row => !needle || row.instructorName.includes(needle))
      .filter(row => !instructorFilter || (chosen ? chosen.ids.includes(Number(row.AdInstructorId)) : Number(row.AdInstructorId) === instructorFilter));
  }, [rows, needle, instructorFilter, instructorChoices]);

  /* «تكدّس الطلبات»: كم موعداً مطلوباً يبدأ في كل خليّة (يوم × وقت بداية).
     عدٌّ لا غير، من بنود الطلبات المُجابة المحمَّلة أصلاً في الشاشة — لا
     جلبَ جديداً، ولا تعريفاً للتعارض بين أستاذين. بنودُ «أبقِ» و«احذف» لا
     تُعدّ لأنها ليست موعداً مطلوباً. */
  const heat = useMemo(() => buildInboxHeat(rows || [], day => Boolean(INBOX_DAY_NAMES[day as keyof typeof INBOX_DAY_NAMES])), [rows]);
  /* «فتحوا ولم يجيبوا» و«لم يفتحوا» يقرآن صفةَ الرابط نفسها: رابطُ العرض فقط لا ينتظر جواباً (D2). */
  const openedQuiet = openedNotAnswered(rows || []).length;

  /* الأساتذةُ الذين في الوارد فعلاً، مرتّبون أبجدياً بحسب الاسم — كقائمة الأستاذ في
     «الجدول الدراسي». */
  const { lookup: visitingLookup, isVisiting: lookupVisiting } = useVisitingLookup(termId);
  const rowVisiting = (row: InboxRequest) => lookupVisiting(row.AdInstructorId, row.AdCollegeId, row.AdSectionId);
  /* صفوفُ المنتقي، وأشخاصُها (شخصٌ واحدٌ بطلباته كلها) — المصدرُ نفسه لمنتقي «مقترح دراسي» ولإرفاق طلبات الشخص بالمساحة. */
  const launcherRows = useMemo(() => (rows || []).map(row => ({ id: row.id, AdInstructorId: row.AdInstructorId, instructorName: row.instructorName, AdCollegeId: row.AdCollegeId, AdSectionId: row.AdSectionId, sectionName: row.sectionName, requestCollegeName: row.requestCollegeName, changedCount: row.changedCount, visiting: rowVisiting(row) })), [rows, visitingLookup]);
  const personChoices = useMemo(() => proposalLauncherChoices(launcherRows, collegeId), [launcherRows, collegeId]);
  personChoicesRef.current = personChoices;
  const instructorOptions = useMemo(() => instructorChoices.map(choice => {
    const own = (rows || []).filter(entry => choice.ids.includes(Number(entry.AdInstructorId)));
    /* المنتدبُ يُوسم بشارته ولو جاء بسجلّين: يُمثَّل الشخصُ بصفّه المنتدب إن وُجد. */
    const row = own.find(entry => rowVisiting(entry)) || own[0];
    return { value: choice.ids[0], changed: own.some(entry => entry.changedCount > 0), label: withVisitingSuffix(row.instructorName, rowVisiting(row)) };
  }).map(({ changed, ...option }) => changed ? { ...option, label: `${option.label} · طلب تعديلاً` } : option)
    .sort((a, b) => byArabic(a.label, b.label)), [instructorChoices, rows, visitingLookup]);

  const itemFilter = useCallback((item: InstructorRequestItem) => {
    if (stateFilter === "confirmed-unchanged") return false;
    const state = item.decision?.state;
    if (stateFilter === "pending" && state) return false;
    if (stateFilter === "fixed" && state !== "fixed") return false;
    if (stateFilter === "rejected" && state !== "rejected") return false;
    if (actionFilter !== "all" && item.action !== actionFilter) return false;
    if (verdictFilter !== "all" && (item.verdict || "clear") !== verdictFilter) return false;
    return true;
  }, [stateFilter, actionFilter, verdictFilter]);

  /* الأقسامُ التي في الوارد فعلاً — لا كلُّ أقسام الكلية. */
  const departments = useMemo(() => {
    const seen = new Map<number, { name: string; count: number }>();
    for (const row of rows || []) {
      if (!row.changedCount && !isUnchangedConfirmed(row)) continue;
      const id = Number(row.AdSectionId);
      const entry = seen.get(id) || { name: String(row.sectionName || `قسم ${id}`), count: 0 };
      entry.count += 1;
      seen.set(id, entry);
    }
    return [...seen].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => byArabic(a.name, b.name));
  }, [rows]);

  const counts = useMemo(() => {
    const all = (rows || []).flatMap(row => (row.items || []).filter(item => item.action !== "keep" && !(item as any).hidden));
    return {
      pending: all.filter(item => !item.decision?.state).length,
      fixed: all.filter(item => item.decision?.state === "fixed").length,
      rejected: all.filter(item => item.decision?.state === "rejected").length,
      all: all.length,
      change: all.filter(item => item.action === "change").length,
      add: all.filter(item => item.action === "add").length,
      delete: all.filter(item => item.action === "delete").length,
      clear: all.filter(item => (item.verdict || "clear") === "clear").length,
      exception: all.filter(item => item.verdict === "exception").length,
      conflict: all.filter(item => item.verdict === "conflict").length,
      confirmedUnchanged: (rows || []).filter(row => isUnchangedConfirmed(row)).length,
      /* «لم يشاركوا» (D1): لم يرسلوا شيئاً — فتحوا أو لم يفتحوا — وروابطُ العرض وحده لا تُعدّ (D2). */
      absent: notParticipated((rows || []).filter(row => !isPlaceholderInboxRow(row))).length,
    };
  }, [rows]);

  const visibleConfirmedUnchanged = visible.filter(row => isUnchangedConfirmed(row)
    && (!deptFilter || Number(row.AdSectionId) === deptFilter));
  const changed = stateFilter === "confirmed-unchanged" ? [] : visible.filter(row => (!deptFilter || Number(row.AdSectionId) === deptFilter)
    && (!taOnly || isTaRequest(row))
    && (row.changedCount > 0
      ? (row.items || []).some(item => item.action !== "keep" && !(item as any).hidden && itemFilter(item))
      /* ملاحظةٌ عامة بلا بنودٍ مغيَّرة: تُقرأ بطاقةً، لا تُدفن في «الجدول كما هو». */
      : Boolean(row.note) && row.status !== "sent"));
  const changedGroups = useMemo(() => {
    const groups = new Map<string, InboxRequest[]>();
    changed.forEach(row => {
      const name = String(row.requestCollegeName || "موقع غير محدد");
      groups.set(name, [...(groups.get(name) || []), row]);
    });
    return [...groups.entries()].sort(([a], [b]) => byArabic(a, b));
  }, [changed]);
  const unchanged = visible.filter(row => row.status !== "sent" && row.changedCount === 0 && !row.note && !isUnchangedConfirmed(row));
  const silent = notOpened<InboxRequest>(visible);
  const absentRows: InboxRequest[] = notParticipated<InboxRequest>(visible);

  /**
   * التثبيت.
   *
   * الخطوةُ الأولى هي الحفظُ الحقيقي عبر `/api/schedules` — بحمولةِ الصفّ كما
   * هو الآن وقد تغيّر فيه اليومُ والوقتُ وحدهما. والثانيةُ تسجيلُ القرار. ولو
   * أخفقت الأولى لم تقع الثانية: قرارٌ مسجّلٌ بلا أثرٍ في الجدول أسوأُ من
   * قرارٍ لم يُسجَّل، لأنه يقول للأستاذ «ثُبّت» ولم يُثبَّت شيء.
   */
  const decide = async (row: InboxRequest, index: number, state: "fixed" | "rejected", extra: any = {}): Promise<boolean> => {
    if (frozen) return false;
    const key = `${row.id}:${index}`;
    /* ما ثُبّت قد كُتب في الجدول: لا يُعاد (كان يُنشئ صفّاً مكرّراً أو يناقض الجدول). */
    if (row.items[index]?.decision?.state === "fixed") return true;
    /* البنودُ المترابطة (ما يُفرغ وقتَ هذا البند) لا تُثبَّت هنا واحداً واحداً: تُرسل
       مع البند إلى مسار التثبيت الذرّي، فيُفحص الكلُّ على الجدول النهائي ويُكتب معاً أو لا يُكتب. */
    const after: number[] = state === "fixed" && Array.isArray(extra?.after) ? (extra.after as number[]) : [];
    /* الإضافةُ تُفتح بطاقةً سريعة في مكانها — كبطاقة «الجدول الدراسي» —
       بالمقرّر والأيام والوقت من طلب الأستاذ، والشعبةُ والقاعةُ قرارُ القسم. */
    if (state === "fixed" && row.items[index]?.action === "add" && !row.items[index]?.offeringRowIds?.length) {
      const item = row.items[index];
      const slots = item.slots || [];
      const dayNames = slots.map(slot => INBOX_DAY_NAMES[slot.day] || slot.day).join(" · ");
      setQuickError(null);
      setQuick({
        row, index, after,
        seed: {
          instructorRequestId: row.id,
          day: (slots[0]?.day || "fsunday") as any,
          dayLabel: dayNames,
          days: [...new Set(slots.map(slot => slot.day))] as any,
          fixedSlots: slots.map(slot => ({ day: INBOX_DAY_NAMES[slot.day] || slot.day, start: slot.start, end: slot.end })),
          deferLiveCheck: after.length > 0,
          start: slots[0]?.start || "08:00",
          end: slots[0]?.end || "08:50",
          x: Number(extra?.anchor?.x || window.innerWidth / 2),
          y: Number(extra?.anchor?.y || window.innerHeight / 3),
          instructorId: Number(row.AdInstructorId),
          room: "", hall: "",
          /* أولُ قاعةٍ يثبت النظامُ أنها خاليةٌ في هذا الوقت: تُملأ سلفاً فيكفي المنسّقَ أن يحفظ. */
          suggestion: (() => {
            const first = (item.roomOptions || [])[0];
            return first ? { room: first.room, hall: first.hall, buildingId: first.buildingId, roomId: first.roomId, companionRoomId: first.companionRoomId, companionRoomLabel: first.companionRoomLabel, locationStatus: "VERIFIED" as const } : undefined;
          })(),
        },
      });
      return true;
    }
    setBusyKey(key);
    setError(null);
    setRowErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    try {
      if (state === "fixed") {
        const item = row.items[index];
        if (item.action === "add" && !item.offeringRowIds?.length) {
          /* لا يُتوقّع هنا (الإضافة تفتح بطاقتها أعلاه)؛ يبقى طريقُ الورشة إن وصل. */
          const slots = item.slots || [];
          putHandoff({
            requestId: row.id, requestRevision: row.requestRevision || 0, itemIndex: index, instructorId: Number(row.AdInstructorId), instructorName: row.instructorName,
            courseId: Number(item.after?.courseId || 0), collegeId: Number(item.after?.collegeId || row.AdCollegeId),
            sectionId: Number(item.after?.sectionId || row.AdSectionId), termId: Number(row.AdTermId),
            days: slots.map(slot => slot.day) as any, start: slots[0]?.start || "", end: slots[0]?.end || "",
          });
          onNavigate?.("schedules");
          return true;
        }
        const payload = { itemIndex: index, itemId: requestItemId(item), after, requestRevision: row.requestRevision || 0, revs: revsFor(row, [...after, index]) };
        if (!(await previewAndConfirm(row, payload))) return false;
        const result = await request(`/api/instructor-requests/${row.id}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await load();
        announceApplied(result);
        return true;
      }
      await request(`/api/instructor-requests/${row.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex: index, itemId: requestItemId(row.items[index]), requestRevision: row.requestRevision || 0, state, ...extra, current: undefined, after: undefined }),
      });
      await load();
      return true;
    } catch (e: any) { decideFailure.current = inboxMessage(e.message); setRowErrors(prev => ({ ...prev, [key]: inboxMessage(e.message) })); return false; }
    finally { setBusyKey(null); }
  };

  /* ── ردُّ القسم في حوار البند ─────────────────────────────────────────────
     رسالةٌ وأوقاتٌ مقترحة تصل الأستاذَ في صفحته. لا حفظَ في الجدول هنا. */
  const reply = async (row: InboxRequest, index: number, text: string, slots: any[]) => {
    if (frozen) return;
    const key = `${row.id}:${index}`;
    setBusyKey(key);
    setRowErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    try {
      await request(`/api/instructor-requests/${row.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex: index, itemId: requestItemId(row.items[index]), requestRevision: row.requestRevision || 0, text, slots }),
      });
      await load();
    } catch (e: any) { setRowErrors(prev => ({ ...prev, [key]: inboxMessage(e.message) })); }
    finally { setBusyKey(null); }
  };

  /* ── حفظُ البطاقة السريعة ─────────────────────────────────────────────────
     الحفظُ عبر `/api/schedules` نفسه — فيرث كلَّ تحقّقه — ثم يُسجَّل القرار
     بمعرّف الصفّ الناتج. وإن رُفض الحفظ قيل السببُ على البطاقة نفسها. */
  const saveQuick = async (draft: QuickDraft) => {
    if (!quick || frozen) return;
    const { row, index } = quick;
    const item = row.items[index];
    const expectedCourse = Number(item.after?.courseId || 0);
    if (draft.courseId && expectedCourse && Number(draft.courseId) !== expectedCourse) {
      setQuickError("هذا البند لمقرّر الأستاذ المطلوب؛ لإضافة مقرّرٍ آخر استعمل الجدول الدراسي.");
      return;
    }
    if (item.decision?.state === "fixed") { setQuick(null); return; }
    setQuickSaving(true); setQuickError(null);
    try {
      /* الإضافةُ وقرارُها نداءٌ واحد: لا صفَّ يتيماً إن تعذّر القرار، ولا صفَّ ثانياً عند الإعادة. */
      const after = quick.after || [];
      const payload = {
        itemIndex: index, after, requestRevision: row.requestRevision || 0, revs: revsFor(row, after),
        add: {
          courseId: expectedCourse, scode: draft.scode, start: draft.start, end: draft.end,
          room: draft.room, hall: draft.hall, buildingId: draft.buildingId, roomId: draft.roomId, locationStatus: draft.locationStatus, companionRoomId: draft.companionRoomId,
        },
      };
      if (!(await previewAndConfirm(row, payload))) return;
      const result = await request(`/api/instructor-requests/${row.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setQuick(null);
      await load();
      announceApplied(result);
    } catch (e: any) { setQuickError(e.message); }
    finally { setQuickSaving(false); }
  };

  /* ختمُ الإصدار: رقمُ كل صفٍّ كما رآه المنسّق، فلا يكتب التثبيتُ فوق تعديلِ زميلٍ أحدث. */
  const revsFor = (row: InboxRequest, indexes: number[]) => Object.fromEntries(indexes
    .flatMap(i => {
      const item = row.items[i];
      const offeringIds = new Set((item?.offeringRows || []).map(offering => Number(offering.id)));
      return [item?.rowId, ...(item?.offeringRowIds || [])]
        .filter(id => id != null).map(id => [Number(id), item?.offeringRows?.find(offering => Number(offering.id) === Number(id))?.rev
          ?? (currentRows.get(Number(id)) as any)?.rev ?? (offeringIds.has(Number(id)) ? undefined : 0)] as const)
        .filter(([, rev]) => rev !== undefined);
    }));

  /* ── المعاينة قبل الكتابة ─────────────────────────────────────────────────
     الخادمُ يفحص الجدول كما سيصير (بلا كتابة). فإن كان التثبيتُ صفّاً واحداً بلا
     تنبيه مضى مباشرة؛ وإن كان أكثرَ من خطوة (سلسلة، أو أوقاتٌ مختلفة تصير صفوفاً)
     أو فيه تنبيه، عُرض ما سيُكتب ليقرّه المنسّق. وما لا يجوز يُردّ هنا بسببه قبل أي كتابة. */
  const previewAndConfirm = async (row: InboxRequest, payload: any): Promise<boolean> => {
    const preview = await request(`/api/instructor-requests/${row.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, preview: true }),
    });
    const plan: any[] = Array.isArray(preview?.plan) ? preview.plan : [];
    const warn: string[] = [...new Set<string>((preview?.warnings || []).map((w: any) => String(w?.message || "")).filter(Boolean))];
    if (plan.length <= 1 && !warn.length) return true;
    const verb: Record<string, string> = { update: "نقل", create: "إضافة", delete: "حذف" };
    const lines = plan.map(step => `• ${verb[step.action] || step.action}: ${(step.days || []).map((d: string) => INBOX_DAY_NAMES[d] || d).join(" و")} ${step.start || ""}–${step.end || ""}${step.room ? ` · ${step.room}` : ""}`);
    return window.confirm(`سيُكتب في الجدول الدراسي:\n${lines.join("\n")}${warn.length ? `\n\nتنبيه: ${warn.join(" · ")}` : ""}\n\nمتابعة؟`);
  };

  /* ما كُتب فعلاً يُقال، والتنبيهاتُ التي لا تمنع تُعرض. */
  const announceApplied = (result: any) => {
    const plan: any[] = Array.isArray(result?.applied) ? result.applied : [];
    const created = plan.filter(step => step.action === "create").length;
    const warn: string[] = (Array.isArray(result?.warnings) ? result.warnings : []).map((w: any) => String(w?.message || "")).filter(Boolean);
    const parts = [
      /* بعد «في» يُجرّ المثنّى: «في موعدين» لا «في موعدان». */
      created > 1 ? `ثُبّت في ${countOf(created, oblique(AR.appointment))} لأن أوقاته مختلفة بين الأيام.` : "",
      warn.length ? `تنبيه: ${[...new Set(warn)].join(" · ")}` : "",
    ].filter(Boolean);
    setNotice(parts.length ? parts.join(" ") : null);
  };

  /* ── تشغيلُ «ثبّت الجاهز كله» ─────────────────────────────────────────────
     بنداً بعد بند بـ`decide` نفسها (زرّ «ثبّت»: المعاينةُ ثم /apply ثم قراءةُ
     الوارد). وقبل كل بندٍ يُنتظر الواردُ الجديد وفحصُ صفّه الحيّ، فإن لم يعد
     جاهزاً — أو ردّه الخادم — توقّف هنا وقيل السبب، ولا يُمسّ ما بعده. */
  const latest = useRef({ rows, pool: bulkPool, decide });
  latest.current = { rows, pool: bulkPool, decide };
  const bulkOrder = useMemo(() => new Map(changedGroups.flatMap(([, groupRows]) => groupRows).map((row, at) => [row.id, at] as const)), [changedGroups]);
  const bulkReady = useMemo(() => (Object.values(bulkPool) as BulkEntry[])
    .filter(entry => entry.ready && bulkOrder.has(entry.requestId))
    .sort((a, b) => (bulkOrder.get(a.requestId)! - bulkOrder.get(b.requestId)!) || a.index - b.index), [bulkPool, bulkOrder]);
  const settledEntry = async (key: string, rowsBefore: InboxRequest[] | null): Promise<BulkEntry | null> => {
    const started = Date.now();
    while (Date.now() - started < 15000) {
      const now = latest.current;
      const fresh = rowsBefore === null || now.rows !== rowsBefore;
      const entry = now.pool[key];
      if (fresh && entry?.ready) return entry;
      if (fresh && !entry && Date.now() - started > 2000) return null;
      await new Promise(resolve => window.setTimeout(resolve, 120));
    }
    return latest.current.pool[key]?.ready ? latest.current.pool[key] : null;
  };
  const openBulk = () => {
    if (frozen || busyKey || !bulkReady.length) return;
    bulkStop.current = false;
    setBulk({ phase: "confirm", list: bulkReady, done: [], current: null });
  };
  const closeBulk = () => {
    if (bulk?.phase === "running") return;
    setBulk(null);
    window.requestAnimationFrame(() => bulkTrigger.current?.focus());
  };
  const runBulk = async () => {
    if (!bulk || bulk.phase !== "confirm" || frozen) return;
    const list = bulk.list;
    const done: string[] = [];
    const stopAt = (key: string, message: string) => setBulk(state => state ? { ...state, phase: "done", current: null, failed: { key, message } } : state);
    bulkStop.current = false;
    setBulk(state => state ? { ...state, phase: "running", current: list[0]?.key || null } : state);
    let rowsBefore: InboxRequest[] | null = null;
    for (const entry of list) {
      if (bulkStop.current) { setBulk(state => state ? { ...state, phase: "done", current: null, stopped: true } : state); return; }
      setBulk(state => state ? { ...state, current: entry.key } : state);
      const ready = await settledEntry(entry.key, rowsBefore);
      const now = latest.current;
      const row = (now.rows || []).find(candidate => candidate.id === entry.requestId);
      const item = row?.items?.[entry.index];
      const same = Boolean(item) && requestItemId(item!) === entry.itemId;
      /* ثبّته زميلٌ في الأثناء: هو ثابتٌ كما أُريد، فلا يُعاد ولا يُعدّ تعذّراً. */
      if (same && item!.decision?.state === "fixed") { done.push(entry.key); setBulk(state => state ? { ...state, done: [...done] } : state); continue; }
      if (!row || !same) { stopAt(entry.key, "تغيّر هذا الطلب منذ فُتحت النافذة — راجعه في بطاقته."); return; }
      if (item!.decision?.state) { stopAt(entry.key, "قُرّر هذا البند منذ فُتحت النافذة — راجعه في بطاقته."); return; }
      if (!ready) { stopAt(entry.key, "لم يعد جاهزاً بعد ما ثُبّت قبله — افتح بطاقته وراجعه."); return; }
      decideFailure.current = "";
      rowsBefore = now.rows;
      const ok = await now.decide(row, entry.index, "fixed", { after: [] });
      if (!ok) { stopAt(entry.key, decideFailure.current || "لم تُؤكَّد معاينةُ ما سيُكتب، فتوقّف التثبيت هنا."); return; }
      done.push(entry.key);
      setBulk(state => state ? { ...state, done: [...done] } : state);
    }
    setBulk(state => state ? { ...state, phase: "done", current: null } : state);
  };


  /* فحصُ البطاقة: السؤالُ نفسُه للخادم بالقاعة والشعبة المختارتين. يُحفظ الجوابُ
     بمفتاح المسوّدة، فتقرؤه البطاقةُ متى وصل. */
  // The card now owns one server-backed conflict and validation check.
  const nextSectionFor = (courseId: number) =>
    nextCourseSectionCode(currentRows.values(), courseId, Number(termId));

  const selects: ScopeAskSelect[] = [
    { key: "college", label: "الكلية", value: collegeId, placeholder: "اختر الكلية", options: collegeOptions },
    { key: "section", label: "القسم", value: sectionId, placeholder: "كل أقسام الكلية", options: sectionOptions, disabled: !collegeId },
    { key: "term", label: "الفصل", value: termId, placeholder: "اختر الفصل", options: scopedTerms.map(row => ({ value: row.AdTermId, label: row.AdTermName })) },
    { key: "instructor", label: "الأستاذ", value: instructorFilter, placeholder: "كل الأساتذة", options: instructorOptions, disabled: !instructorOptions.length },
  ];

  if (!terms) return <MicroLoader label="يقرأ الفصول…" />;

  return (
    <TermFrozenContext.Provider value={frozen}>
    <div className="content-stack changes-screen visual-minimal inbox-studio" data-term-frozen-scope={frozen || undefined}>
      <PageTitle
        action={rows && rows.length ? <ProposalLauncherBar rows={launcherRows} preferCollegeId={collegeId} proposals={proposals} onOpen={openStudyProposal} /> : undefined}
        eyebrow={<><Inbox aria-hidden="true" /> رغبات الأساتذة</>}
        subtitle="ما طلبه الأساتذة على مسوّداتهم، لا الجدول كله"
      >
        وارد الأساتذة
      </PageTitle>
      <TermFrozenRibbon termId={termId} terms={terms} onGoCurrent={id => { sharedScope.pick({ termId: id }); setTermId(id); }} />

      {(() => {
        const label = (key: string) => {
          const select = selects.find(item => item.key === key);
          const hit = select?.options.find((option: any) => String(option.value) === String(select.value));
          return hit ? String((hit as any).label) : "";
        };
        const parts = [label("college"), sectionId ? label("section") : "كل الأقسام", label("term"), instructorFilter ? label("instructor") : ""].filter(Boolean);
        return (
          <details className="inbox-scope" open={scopeOpen} onToggle={event => setScopeOpen((event.currentTarget as HTMLDetailsElement).open)}>
            <summary data-guide-ignore="طيُّ نطاق الوارد وفتحه — عرضٌ لا فعل">
              <SlidersHorizontal aria-hidden="true" /><span>{parts.join(" · ") || "اختر النطاق"}</span><em>{"تغيير"}</em><ChevronDown aria-hidden="true" />
            </summary>
            <ScopeAskBar
        idPrefix="requests-inbox"
        label="نطاق الوارد"
        ask={ask}
        onAskChange={setAsk}
        onAskSubmit={setAsk}
        askPlaceholder="اسأل: باسم الأستاذ"
        onClear={() => { setAsk(""); setInstructorFilter(0); }}
        selects={trimScopeSelects(selects, scopes, powerAdmin)}
        onSelect={(key, value) => {
          const id = Number(value) || 0;
          if (key === "instructor") { setInstructorFilter(id); return; }
          setInstructorFilter(0);
          if (key === "college") {
            const only = singleDepartmentOf(scopes, id, powerAdmin) ?? 0;
            sharedScope.pick({ collegeId: id, sectionId: only });
            setCollegeId(id); setSectionId(only);
          }
          else if (key === "section") { sharedScope.pick({ sectionId: id }); setSectionId(id); }
          else { sharedScope.pick({ termId: id }); setTermId(id); }
        }}
      />
          </details>
        );
      })()}

      {error ? <Notice type="error" onDismiss={() => setError(null)}>{error}</Notice> : null}
      {notice ? <Notice type="info" onDismiss={() => setNotice(null)}>{notice}</Notice> : null}

      {!collegeId || !termId ? (
        <EmptyState title="اختر النطاق" detail="اختر الكلية والفصل، واترك القسم فارغاً لعرض وارد الكلية كاملاً." />
      ) : !rows ? (
        <MicroLoader label="يقرأ الوارد…" />
      ) : !rows.length ? (
        <EmptyState
          title="لم تُرسَل مسوّدات بعد"
          detail="تُرسل مسوّدات الجدول للأساتذة من شاشة النسخ، فيفتح كلٌّ منهم جدوله ويقول رأيه فيه."
        />
      ) : (
        <>
          {/* لمحةٌ بصرية: حلقة الإجابة وتفصيلها، وخريطة «تكدّس الطلبات». المقامُ
              هو الطلباتُ المُرسلة في هذا النطاق، لا كلُّ الأساتذة. */}
          {totals ? (
            <div className="inbox-glance">
              <section className="glance-card glance-ring" role="status" aria-label="تغطية الإجابة">
                <div className="glance-ring-top">
                  <MiniRing value={Number(totals.sent || 0) > 0 ? Math.round((Number(totals.answered || 0) / Number(totals.sent || 1)) * 100) : null} size={60} decorative className="glance-ring-dial">{num(Number(totals.answered || 0))}</MiniRing>
                  <div className="glance-ring-text">
                    <b>أجاب: {num(Number(totals.answered || 0))} من {num(Number(totals.sent || 0))}</b>
                    <span>من الطلبات المُرسلة في هذا النطاق</span>
                  </div>
                </div>
                {/* الفعلُ يطابق عددَه: «1 لم يفتح»، «2 لم يفتحا»، «3 لم يفتحوا». */}
                <div className="glance-legend">
                  {openedQuiet ? <div data-tone="opened"><MailOpen aria-hidden="true" /><b>{num(openedQuiet)}</b><span>{nounFor(openedQuiet, AR.openedQuietVerb)}</span></div> : null}
                  {totals.unopened ? <div data-tone="unopened"><MailQuestion aria-hidden="true" /><b>{num(Number(totals.unopened))}</b><span>{nounFor(Number(totals.unopened), AR.openedLinkVerb)}</span></div> : null}
                  {totals.settled ? <div data-tone="settled"><ShieldCheck aria-hidden="true" /><b>{num(Number(totals.settled))}</b><span>انتهى</span></div> : null}
                  {totals?.changed ? <div><Replace aria-hidden="true" /><b>{num(Number(totals.changed))}</b><span>{nounFor(Number(totals.changed), AR.askedChangeVerb)}</span></div> : null}
                  {totals?.unchanged ? <div data-tone="unchanged"><Equal aria-hidden="true" /><b>{num(Number(totals.unchanged))}</b><span>بلا تغيير</span></div> : null}
                </div>
              </section>
              {heat.times.length ? (
                /* على الهاتف تنطوي الخريطة خلف رأسها (زرٌّ صغير) فيصل أولُ طلبٍ إلى أعلى الشاشة؛
                   وعلى الحاسوب واللوحيّ تبقى مفتوحةً كاملةً ولا يظهر الزرّ. */
                <section className="glance-card glance-heat" aria-label="تكدس الطلبات" data-open={heatOpen ? "1" : undefined}>
                  <header>
                    <Grid3x3 aria-hidden="true" /><b>تكدس الطلبات</b><span>مواعيدُ البدء المطلوبة</span>
                    {heat.short.size ? <em className="heat-short-flag"><ShieldAlert aria-hidden="true" /> {countOf(heat.short.size, AR.appointment)} بلا قاعاتٍ تكفي</em> : null}
                    <button
                      type="button"
                      className="glance-heat-toggle"
                      aria-expanded={heatOpen}
                      aria-controls="inbox-heat-body"
                      data-guide-ignore="طيّ خريطة «تكدس الطلبات» وفتحها على الهاتف — عرضٌ لا فعل"
                      onClick={() => setHeatOpen(open => !open)}
                    >
                      <span className="sr-only">{heatOpen ? "اطوِ خريطة التكدس" : "اعرض خريطة التكدس"}</span>
                      <ChevronDown aria-hidden="true" />
                    </button>
                  </header>
                  <div className="glance-heat-body" id="inbox-heat-body">
                    <div className="heat-grid" role="table" aria-label="عدد المواعيد المطلوبة لكل يوم ووقت بدء">
                      <div className="heat-row heat-head" role="row">
                        <span aria-hidden="true" />
                        {Object.values(INBOX_DAY_NAMES).map(name => <span key={name} role="columnheader">{name}</span>)}
                      </div>
                      {heat.times.map(time => (
                        <div className="heat-row" role="row" key={time}>
                          <time role="rowheader">{time}</time>
                          {Object.entries(INBOX_DAY_NAMES).map(([day, name]) => {
                            const count = heat.cells.get(`${day}|${time}`) || 0;
                            const level = count ? Math.max(1, Math.ceil((count / heat.max) * 4)) : 0;
                            const lack = heat.short.get(`${day}|${time}`);
                            return (
                              <span key={day} role="cell" className="heat-cell" data-heat={level} data-short={lack ? "1" : undefined}
                                title={`${name} ${time}: ${countOf(count, AR.appointment)}${lack ? ` — ${countOf(lack.asks, AR.request)} والمتاح ${countOf(lack.rooms, AR.room)} فقط` : ""}`}
                                aria-label={`${name} ${time}: ${countOf(count, AR.appointment)}${lack ? ` — عجز قاعات: ${countOf(lack.asks, AR.request)} و${countOf(lack.rooms, AR.room)}` : ""}`}>
                                {""}
                              </span>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <footer className="heat-legend" aria-hidden="true">
                      <span>أقل</span>
                      {[0, 1, 2, 3, 4].map(level => <span key={level} className="heat-swatch heat-cell" data-heat={level} />)}
                      <span>أكثر</span>
                      {heat.short.size ? <><span className="heat-swatch heat-cell" data-heat="3" data-short="1" /><span>عجز قاعات</span></> : null}
                    </footer>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {silent.length ? (
            <div className="request-silent">
              <MailQuestion aria-hidden="true" />
              <span>{countOf(silent.length, AR.instructor)} {nounFor(silent.length, AR.openedLinkVerb)} الرابط بعد</span>
              <div className="request-silent-links">
                {silent.slice(0, 12).map(row => {
                  const reach = reachAboutCard(
                    { AdInstructorName: row.instructorName, AdInstructorMobile: row.instructorMobile },
                    `${location.origin}/r/${row.linkId}`,
                    "reminder",
                  );
                  return reach.href ? (
                    <a key={row.id} href={reach.href} target="_blank" rel="noreferrer noopener" className="request-remind">
                      <Send aria-hidden="true" /> {row.instructorName}{rowVisiting(row) ? <VisitingBadge compact /> : null}
                    </a>
                  ) : (
                    <span key={row.id} className="request-remind" data-blocked="true" title={reach.blocked || ""}>
                      <Link2 aria-hidden="true" /> {row.instructorName}{rowVisiting(row) ? <VisitingBadge compact /> : null}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          {unchanged.length ? (
            <button
              type="button"
              className="request-unchanged"
              aria-expanded={showUnchanged}
              data-guide-ignore="طيُّ من لم يغيّروا شيئاً — عرضٌ لا فعل"
              onClick={() => setShowUnchanged(open => !open)}
            >
              <ChevronDown aria-hidden="true" data-open={showUnchanged || undefined} />
              <Check aria-hidden="true" />
              {countOf(unchanged.length, AR.instructor)} {nounFor(unchanged.length, AR.saidVerb)} «الجدول كما هو»
              {showUnchanged ? <em>{unchanged.map(row => withVisitingSuffix(row.instructorName, rowVisiting(row))).join(" · ")}</em> : null}
            </button>
          ) : null}

          {(() => {
            /* المجموعاتُ مبنيّةٌ مرّةً: منها يُعرف أيبقى في الشريط ما يُختار، فلا
               يبقى رمزُ المرشّحات وحده فوق لا شيء (قاعدة إخفاء الفارغ). */
            const stateOptions: FilterOption[] = [
              { value: "pending", label: "بانتظار قرارك", count: counts.pending, tone: "warn" },
              { value: "fixed", label: "ثُبّت", count: counts.fixed, tone: "ok" },
              { value: "rejected", label: "رُفض", count: counts.rejected, tone: "bad" },
              { value: "all", label: "الكل", count: counts.all },
              { value: "absent", label: "لم يشاركوا", count: counts.absent, tone: "warn" },
            ];
            const actionOptions: FilterOption[] = [
              { value: "all", label: "الكل" },
              { value: "change", label: "تعديل", count: counts.change },
              { value: "add", label: "إضافة", count: counts.add },
              { value: "delete", label: "حذف", count: counts.delete },
            ];
            const verdictOptions: FilterOption[] = [
              { value: "all", label: "الكل" },
              { value: "clear", label: "متاح", count: counts.clear, tone: "ok" },
              { value: "exception", label: "استثناء", count: counts.exception, tone: "warn" },
              { value: "conflict", label: "ممنوع", count: counts.conflict, tone: "bad" },
            ];
            const deptOptions: FilterOption[] = departments.length > 1 && !sectionId
              ? [{ value: "0", label: "كل الأقسام" }, ...departments.map(dept => ({ value: String(dept.id), label: dept.name.replace(/^قسم\s+/, ""), count: dept.count }))]
              : [];
            const filtered = stateFilter !== "pending" || actionFilter !== "all" || verdictFilter !== "all" || Boolean(deptFilter);
            const any = filtered
              || counts.confirmedUnchanged > 0
              || visibleFilterOptions(stateOptions, stateFilter === "confirmed-unchanged" ? "all" : stateFilter).length || visibleFilterOptions(actionOptions, actionFilter).length
              || visibleFilterOptions(verdictOptions, verdictFilter).length || visibleFilterOptions(deptOptions, String(deptFilter)).length;
            if (!any) return null;
            return (
          <div className="request-filters" role="toolbar" aria-label="تصفية الوارد">
            <span className="request-filters-mark" aria-hidden="true"><SlidersHorizontal /></span>
            <FilterGroup label="الحالة" value={stateFilter === "confirmed-unchanged" ? "all" : stateFilter} onChange={value => setStateFilter(value as any)} options={stateOptions} />
            {counts.confirmedUnchanged ? (
              <button
                type="button"
                className={`request-confirmed-filter${stateFilter === "confirmed-unchanged" ? " active" : ""}`}
                aria-pressed={stateFilter === "confirmed-unchanged"}
                data-guide-ignore="فلتر من ثبّت جدوله كما هو — عرضٌ للمعلومية فقط"
                onClick={() => {
                  setStateFilter(current => current === "confirmed-unchanged" ? "pending" : "confirmed-unchanged");
                  setActionFilter("all"); setVerdictFilter("all");
                }}
              >
                <ShieldCheck aria-hidden="true" /> ثبّتوا جداولهم كما هي <b>{num(counts.confirmedUnchanged)}</b>
              </button>
            ) : null}
            {(rows || []).some(isTaRequest) ? (
              <button type="button" className={`request-confirmed-filter${taOnly ? " active" : ""}`} aria-pressed={taOnly}
                data-guide-ignore="فلتر مرحلة التدريب — عرضٌ لا فعل" onClick={() => setTaOnly(on => !on)}>
                🎓 تدريب <b>{num((rows || []).filter(isTaRequest).length)}</b>
              </button>
            ) : null}
            <details className="request-filters-more" open={actionFilter !== "all" || verdictFilter !== "all" || Boolean(deptFilter)}>
              <summary data-guide-ignore="مرشّحاتٌ إضافية — عرضٌ لا فعل">أكثر</summary>
              <FilterGroup label="النوع" value={actionFilter} onChange={value => setActionFilter(value as any)} options={actionOptions} />
              <FilterGroup label="الفحص" value={verdictFilter} onChange={value => setVerdictFilter(value as any)} options={verdictOptions} />
              {deptOptions.length ? (
                <FilterGroup label="القسم" value={String(deptFilter)} onChange={value => setDeptFilter(Number(value) || 0)} options={deptOptions} />
              ) : null}
            </details>
            {filtered ? (
              <button type="button" className="request-filters-reset" data-guide-ignore="إعادة المرشّحات — عرضٌ لا فعل" onClick={() => { setStateFilter("pending"); setActionFilter("all"); setVerdictFilter("all"); setDeptFilter(0); }}>
                <X aria-hidden="true" /> إعادة
              </button>
            ) : null}
          </div>
            );
          })()}

          {/* حاويةٌ كتلية (لا شبكة) كي يلتصق شريطُ «ثبّت الجاهز كله» بأسفل الشاشة طوال القائمة. */}
          <div className="inbox-deck">
          {stateFilter === "absent" ? (absentRows.length ? (
            <section className="request-absent-list" aria-label="أساتذة لم يشاركوا">
              {absentRows.map(row => {
                const reach = reachAboutCard(
                  { AdInstructorName: row.instructorName, AdInstructorMobile: row.instructorMobile },
                  `${location.origin}/r/${row.linkId}`,
                  "reminder",
                );
                return (
                  <article className="request-absent-row" key={row.id} data-opened={row.linkOpenedAt ? "1" : undefined}>
                    <span className="request-absent-icon" title={row.linkOpenedAt ? "فتح ولم يرسل" : "لم يفتح الرابط"}>
                      {row.linkOpenedAt ? <MailOpen aria-hidden="true" /> : <UserX aria-hidden="true" />}
                    </span>
                    <strong>{withVisitingSuffix(row.instructorName, rowVisiting(row))}</strong>
                    {reach.href ? (
                      <a href={reach.href} target="_blank" rel="noreferrer noopener" className="request-remind" aria-label={`ذكّر ${row.instructorName}`}>
                        <BellRing aria-hidden="true" /> ذكّر
                      </a>
                    ) : (
                      <span className="request-remind" data-blocked="true" title={reach.blocked || ""}><Link2 aria-hidden="true" /></span>
                    )}
                  </article>
                );
              })}
            </section>
          ) : (
            <EmptyState title="الجميع شارك" detail="لا أستاذَ في هذا النطاق بلا ردّ." />
          )) : stateFilter === "confirmed-unchanged" ? (visibleConfirmedUnchanged.length ? (
            <section className="request-confirmed-list" aria-label="أساتذة ثبّتوا جداولهم دون تعديل">
              {visibleConfirmedUnchanged.map(row => (
                <article className="request-confirmed-row" key={row.id}>
                  <span className="request-confirmed-icon"><ShieldCheck aria-hidden="true" /></span>
                  <span className="request-confirmed-copy">
                    <strong>{withVisitingSuffix(row.instructorName, rowVisiting(row))}</strong>
                    <small>ثبّت جدوله كما هو</small>
                  </span>
                  <time dateTime={unchangedConfirmedAt(row)}>{unchangedConfirmedDateTime(unchangedConfirmedAt(row))}</time>
                </article>
              ))}
              <p>للمعلومية فقط · لا يلزم أي إجراء من القسم</p>
            </section>
          ) : (
            <EmptyState title="لا توجد تثبيتات كما هي" detail="لا يوجد أستاذ ضمن هذا النطاق ثبّت جدوله دون تعديل." />
          )) : changed.length ? (
            <div className="request-family">
              {familyColleges.length > 1 ? <div className="request-family-banner"><strong>رغبات عائلة القسم</strong><span>{familyColleges.map(item => item.name).join(" · ")}</span></div> : null}
              {changedGroups.map(([collegeName, groupRows]) => <section className="request-family-group" key={collegeName} aria-label={`رغبات ${collegeName}`}>
                <header><h3>{collegeName}</h3><span>{countOf(groupRows.length, AR.instructor)}</span></header>
                <div className="request-deck">
                  {groupRows.map(row => (
                    <RequestCard
                      key={row.id}
                      row={row}
                      currentRows={currentRows}
                      busyKey={busyKey}
                      filter={itemFilter}
                      rowErrors={rowErrors}
                      proposals={proposals.filter(view => view.proposal.requestId === row.id)}
                      onOpenProposal={openStudyProposal}
                      onDecide={(index, state, extra) => void decide(row, index, state, extra)}
                      onReply={(index, text, slots) => void reply(row, index, text, slots)}
                      onBulk={reportBulk}
                    />
                  ))}
                </div>
              </section>)}
            </div>
          ) : (
            <EmptyState
              title={needle ? "لا نتائج" : stateFilter === "pending" && counts.all ? "لا شيء ينتظرك" : "لا تعديلات تنتظر"}
              detail={needle ? "لا أستاذَ يطابق البحث." : stateFilter === "pending" && counts.all ? "قرّرتَ في كل الطلبات. غيّر «الحالة» لترى ما ثُبّت أو رُفض." : "كلُّ من أجاب قَبِل جدوله كما أرسله القسم."}
            />
          )}
          {/* ── شريطُ «ثبّت الجاهز كله» ── يظهر حين يكون في المعروض بندٌ جاهزٌ بلا موانع،
              ويلتصق بأسفل الشاشة كشريط الحفظ في «موعد جديد». لا يظهر بلا جاهز ولا في فصلٍ سابق. */}
          {bulkReady.length && !frozen && stateFilter !== "absent" && stateFilter !== "confirmed-unchanged" ? (
            <div className="inbox-bulk" role="region" aria-label="تثبيت الجاهز">
              <span className="inbox-bulk-mark" aria-hidden="true"><CheckCheck /></span>
              <span className="inbox-bulk-text"><b>{countOf(bulkReady.length, AR.change)}</b> {nounFor(bulkReady.length, AR.readyAdj)} بلا موانع</span>
              <button
                ref={bulkTrigger}
                type="button"
                className="btn btn-primary inbox-bulk-go"
                disabled={Boolean(busyKey) || Boolean(bulk)}
                onClick={openBulk}
                data-guide-ignore="يفتح تأكيد «ثبّت الجاهز كله»: يعرض العدد والأسماء، ولا يُثبَّت شيءٌ قبل الموافقة — ثم كلُّ بندٍ بزرّ «ثبّت» نفسه"
              >
                <CheckCheck aria-hidden="true" />ثبّت الجاهز كله ({num(bulkReady.length)})
              </button>
            </div>
          ) : null}
          </div>
        </>
      )}

      {quick ? (() => {
        const item = quick.row.items[quick.index];
        return (
          <QuickCreatePopover
            seed={quick.seed}
            courses={[{ AdCourseId: Number(item.after?.courseId || 0), CourseName: String(item.after?.courseName || "مقرر"), CourseCode: "", ...item.courseRequirements } as any]}
            instructors={[{ AdInstructorId: Number(quick.row.AdInstructorId), AdInstructorName: quick.row.instructorName } as any]}
            collegeId={Number(item.after?.collegeId || quick.row.AdCollegeId)}
            sectionId={Number(item.after?.sectionId || quick.row.AdSectionId)}
            termId={Number(quick.row.AdTermId)}
            initialCourseId={Number(item.after?.courseId || 0)}
            durationForDay={() => {
              const [sh, sm] = quick.seed.start.split(":").map(Number), [eh, em] = quick.seed.end.split(":").map(Number);
              return (eh * 60 + em) - (sh * 60 + sm);
            }}
            conflictOf={() => null}
            nextSectionCode={nextSectionFor}
            saving={quickSaving}
            error={quickError}
            onCancel={() => setQuick(null)}
            onExpand={(draft) => {
              // Carry the coordinator's actual choices into the full editor.
              // Distinct time groups cannot be represented by one editor row.
              const slots = item.slots || [];
              if (new Set(slots.map(slot => `${slot.start}|${slot.end}`)).size > 1) {
                setQuickError("هذا الطلب يتضمن أوقاتاً مختلفة. اعتمد المجموعات من الوارد حتى لا يفقد أي موعد وقته.");
                return;
              }
              putHandoff({
                requestId: quick.row.id, requestRevision: quick.row.requestRevision || 0, itemIndex: quick.index, companionRoomId: draft.companionRoomId,
                instructorId: Number(quick.row.AdInstructorId), instructorName: quick.row.instructorName,
                courseId: Number(item.after?.courseId || 0),
                collegeId: Number(item.after?.collegeId || quick.row.AdCollegeId),
                sectionId: Number(item.after?.sectionId || quick.row.AdSectionId),
                termId: Number(quick.row.AdTermId),
                days: slots.map(slot => slot.day) as any,
                start: draft.start, end: draft.end,
                scode: draft.scode, buildingId: draft.buildingId, roomId: draft.roomId,
                room: draft.room, hall: draft.hall, locationStatus: draft.locationStatus,
              });
              setQuick(null);
              onNavigate?.("schedules");
            }}
            onCreate={(draft) => void saveQuick(draft)}
          />
        );
      })() : null}

      {workspace ? (
        <React.Suspense fallback={<MicroLoader label="يفتح مساحة المقترح…" />}>
          <StudyProposalWorkspace
            key={workspace.requestId}
            requestId={workspace.requestId}
            siblings={workspace.siblings}
            onSwitch={requestId => setWorkspace({ requestId, siblings: workspace.siblings })}
            proposalId={workspace.proposalId}
            itemIndex={workspace.itemIndex ?? null}
            startWith={workspace.startWith ?? null}
            onClose={() => { setWorkspace(null); void load(); }}
            onChanged={() => void load()}
          />
        </React.Suspense>
      ) : null}

      {bulk ? (
        <BulkSheet
          state={bulk}
          onConfirm={() => void runBulk()}
          onStop={() => { bulkStop.current = true; setBulk(state => state ? { ...state, stopping: true } : state); }}
          onClose={closeBulk}
        />
      ) : null}
    </div>
    </TermFrozenContext.Provider>
  );
}
