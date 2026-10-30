import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, CalendarOff, Check, ChevronDown, DoorOpen, Hourglass, Info, Pin, Plus, Star, X } from "lucide-react";
import type { AdCourse, FSchedule } from "../types";
import type { AppointmentVerdict } from "../utils/appointmentVerdict";
import { DAY_KEYS, type DayKey } from "../utils/scheduleRegulations";
import { courseLabel } from "../utils/courseLabel";
import { AR, countOf } from "../utils/arabicCount";
import {
  adjacentPlacement, adjacentRoom, clampFloatRect, compactSpan, drawnPlacement, freeTargets, goldenTargets, inRoom, parseFloatRect, roomBlocks, roomReady,
  spotCrowds, teacherHeader, teacherLectures, teacherRows, toClock, toMin, weekColumns,
  type DrawnPlacement, type FloatRect, type MiniLecture, type MiniRoom, type MiniRoomPick, type MiniSpan, type MiniTarget,
} from "../utils/teacherMiniWeek";
import { safeStorage } from "../utils/safeStorage";
import VisitingBadge from "./VisitingBadge";

/**
 * ── جدول الأستاذ المصغّر (N3) ──────────────────────────────────────────────────
 * يظهر حين يُختار أستاذ في أي نموذج موعد: أسبوعه في خمسة أعمدة على محورٍ مضغوط،
 * والموعد الجاري شبحٌ أخضر (سليم) أو مخطّطٌ أحمر (يتعارض — الحكم الواحد نفسه في لوحة
 * الفحص)، وخاناتٌ حرّة تتّسع لنمط المقرر «+»، و«قبلها/بعدها» على حافّتي كل محاضرة.
 * الترويسة: حلقة النصاب (الآن ← بعد)، أيام الحضور، الفراغات، وشارة «منتدب».
 * يُطوى ويتذكّر حالته؛ وعلى الشاشة الضيقة شريطٌ سفليّ يُسحب.
 *
 * R4 «نافذة الأسبوع» (إضافاتٌ لا تمسّ ما سبق): أيام الموعد أعمدةٌ أعرض بترويسةٍ ممتلئة، وطيٌّ
 * تلقائي لا يُكتب (autoCollapse)، ونافذةٌ تطفو بسحب ترويستها وتعود بنقرتين (dockable)، ورسمُ
 * موعدٍ بالسحب على فراغ، والقاعة المختارة (room): حجوزها مخطّطةٌ نحاسية وما يناسب الاثنين ذهبيّ.
 */
const DAY_SHORT: Record<DayKey, string> = { fsunday: "أحد", fmonday: "اثنين", ftuesday: "ثلاثاء", fwednesday: "أربعاء", fthursday: "خميس" };
const DAY_FULL: Record<DayKey, string> = { fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس" };
/* المسار كبيرٌ الآن (ملاحظة المالك 2026-10-29: «صغير جداً»): نصف الصفحة على سطح المكتب،
   وشريطٌ سفليّ طويل على الهاتف — ويتّسع بارتفاع النافذة. */
const TRACK = { side: [380, 640], compact: [240, 400], sheet: [300, 560] } as const;
function trackFor(kind: keyof typeof TRACK, viewport: number) {
  const [min, max] = TRACK[kind];
  const want = kind === "side" ? viewport - 300 : kind === "sheet" ? viewport * 0.58 : viewport * 0.44;
  return Math.round(Math.max(min, Math.min(max, want)));
}
/** عرض الشاشة دون شريط التمرير (كما تُقاس حوافّ النافذة العائمة)، وارتفاعها. */
const viewportNow = () => typeof window === "undefined" ? { width: 1280, height: 900 }
  : { width: document.documentElement?.clientWidth || window.innerWidth || 1280, height: window.innerHeight || 900 };
function useViewportSize() {
  const read = viewportNow;
  const [size, setSize] = useState(read);
  useEffect(() => {
    const sync = () => setSize(previous => {
      const next = read();
      return next.width === previous.width && next.height === previous.height ? previous : next;
    });
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  return size;
}

/* ── إظهارٌ/إخفاءٌ يُتذكَّر لكل مستخدم على هذا الجهاز ───────────────────────────
   مفتاحٌ واحد يقرؤه المحرر الكامل و«موعد جديد» السريع، وحدثٌ يزامن النوافذ المفتوحة. */
const ENABLED_EVENT = "teacher-mini-week:enabled";
const enabledKey = (userId: number) => `teacher-mini-week:enabled:${userId}`;
export function useMiniWeekEnabled(userId: number): [boolean, (next: boolean) => void] {
  const key = enabledKey(userId);
  const [enabled, setEnabledState] = useState(() => safeStorage.get(key) !== "off");
  useEffect(() => {
    setEnabledState(safeStorage.get(key) !== "off");
    const sync = () => setEnabledState(safeStorage.get(key) !== "off");
    window.addEventListener(ENABLED_EVENT, sync);
    return () => window.removeEventListener(ENABLED_EVENT, sync);
  }, [key]);
  const setEnabled = (next: boolean) => {
    safeStorage.set(key, next ? "on" : "off");
    setEnabledState(next);
    window.dispatchEvent(new Event(ENABLED_EVENT));
  };
  return [enabled, setEnabled];
}

/** مفتاح «جدول الأستاذ» بجانب حقل الأستاذ: يطفئه أو يعيده، ويُتذكَّر. */
export function MiniWeekToggle({ enabled, onChange, compact = false }: { enabled: boolean; onChange: (next: boolean) => void; compact?: boolean }) {
  const Icon = enabled ? CalendarDays : CalendarOff;
  return <button type="button" className={`mini-week-toggle${enabled ? " is-on" : ""}${compact ? " is-compact" : ""}`} role="switch" aria-checked={enabled}
    title={enabled ? "إخفاء جدول الأستاذ (يُتذكَّر)" : "إظهار جدول الأستاذ"} onClick={() => onChange(!enabled)}
    data-guide-ignore="يظهر جدول الأستاذ المصغّر أو يخفيه، ويتذكّر الاختيار على هذا الجهاز؛ لا يغيّر الموعد">
    <Icon aria-hidden="true" />{compact ? null : <span>جدول الأستاذ</span>}<i className="mini-week-toggle-track" aria-hidden="true"><i /></i>
  </button>;
}

export interface MiniPick { day: DayKey; start: string; end: string; days: DayKey[]; room?: MiniRoomPick }

/** ما تقوله الشاشة عن الموعد الجاري: من الحكم الواحد (appointmentVerdict). */
export type MiniVerdict = Pick<AppointmentVerdict, "state" | "blockers"> & Partial<Pick<AppointmentVerdict, "checks">>;

/**
 * الشبح أحمر حين يتعارض الموعد في أسبوع الأستاذ نفسه (بطاقتا «الأستاذ» و«الوقت»)، لا لمانعٍ
 * آخر لا يخص أسبوعه (الشعبة، القاعة، النطاق): كان مانعُ ساعات الشعبة يرسم الكتلة حمراء بعلامة X
 * وبطاقة الأستاذ تقول «سليم» (ملاحظة المالك 2026-10-29).
 */
export function ghostBlockers(verdict: MiniVerdict) {
  if (!verdict.checks) return verdict.blockers;
  return verdict.checks.filter(check => (check.kind === "teacher" || check.kind === "time") && check.state === "block")
    .flatMap(check => check.details.filter(detail => detail.blocks));
}

type Tone = "clean" | "blocked" | "checking" | "idle";

const daysText = (days: readonly DayKey[]) => days.map(day => DAY_SHORT[day]).join("·");
const hoursText = (minutes: number) => String(Math.round(minutes / 6) / 10);
/** «فراغات ساعة ونصف» بالعدّ العربي الواحد (arabicCount)، لا رقمٌ قبل معدودٍ مكتوبٍ باليد. */
const gapWords = (minutes: number) => minutes > 0 ? `فراغات ${countOf(minutes / 60, AR.hour)}` : "بلا فراغات";

function useMedia(query: string, enabled: boolean) {
  const read = () => enabled && typeof window !== "undefined" && Boolean(window.matchMedia?.(query).matches);
  const [match, setMatch] = useState(read);
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.matchMedia) { setMatch(false); return; }
    const media = window.matchMedia(query);
    const sync = () => setMatch(media.matches);
    sync();
    media.addEventListener?.("change", sync);
    return () => media.removeEventListener?.("change", sync);
  }, [query, enabled]);
  return match;
}

/** أسبوع الأستاذ في الأقسام الأخرى (ضمن صلاحية القارئ): قراءةٌ واحدة بالمسار القائم، تبقى بين الفتحات. */
const widerCache = new Map<string, FSchedule[]>();
export function useWiderWeek(teacherId: number, termId: number, refresh: unknown) {
  const key = `${termId}:${teacherId}`;
  const [state, setState] = useState<{ key: string; rows: FSchedule[] }>(() => ({ key, rows: widerCache.get(key) || [] }));
  useEffect(() => {
    setState({ key, rows: widerCache.get(key) || [] });
    if (!teacherId || !termId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/schedules?termId=${termId}&instructorId=${teacherId}`, { credentials: "include", signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(list => {
          if (!Array.isArray(list)) return;
          widerCache.set(key, list);
          setState({ key, rows: list });
        })
        .catch(() => undefined);
    }, 140);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, teacherId, termId, refresh]);
  return state.key === key ? state.rows : [];
}

/**
 * حجوز القاعة المختارة في الفصل (ضمن صلاحية القارئ): قراءةٌ واحدة بالمسار القائم بالمبنى والقاعة،
 * بالأسلوب نفسه (تأخيرٌ قصير وإلغاءٌ عند التغيّر)، وتبقى لكل فصلٍ وقاعة بين الفتحات.
 */
const roomCache = new Map<string, FSchedule[]>();
export function useRoomWeek(room: MiniRoom | null | undefined, termId: number, refresh: unknown) {
  const code = roomReady(room) ? String(room.code).trim() : "", hall = roomReady(room) ? String(room.hall).trim() : "";
  const key = code && hall && termId ? `${termId}:${code.toUpperCase()}/${hall.toUpperCase()}` : "";
  const [state, setState] = useState<{ key: string; rows: FSchedule[] }>(() => ({ key, rows: roomCache.get(key) || [] }));
  useEffect(() => {
    setState({ key, rows: roomCache.get(key) || [] });
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/schedules?termId=${termId}&building=${encodeURIComponent(code)}&hall=${encodeURIComponent(hall)}`, { credentials: "include", signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(list => {
          if (!Array.isArray(list)) return;
          roomCache.set(key, list);
          setState({ key, rows: list });
        })
        .catch(() => undefined);
    }, 140);
    return () => { window.clearTimeout(timer); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refresh]);
  return state.key === key ? state.rows : [];
}

/** حلقة النصاب: القوس الثابت ما يحمله الآن، والقوس الفاتح ما يضيفه هذا الموعد. */
/** «الإضافي» (من الدرجة العلمية أو استثناء العضو): ما بين النصاب والسقف لونٌ هادئ، والأحمرُ لما فوق السقف وحده. */
function LoadRing({ now, after, nisab, overtime = 0, limited = nisab > 0 }: { now: number; after: number; nisab: number; overtime?: number; limited?: boolean }) {
  const radius = 19, circumference = 2 * Math.PI * radius;
  const ceiling = limited ? nisab + Math.max(0, overtime) : 0;
  const scale = Math.max(1, limited ? Math.max(ceiling, after) : after);
  const nowLength = (Math.min(now, scale) / scale) * circumference;
  const addLength = (Math.max(0, Math.min(after, scale) - Math.min(now, scale)) / scale) * circumference;
  const over = limited && after > ceiling;
  const extra = !over && limited && after > nisab;
  const tick = nisab > 0 && after > nisab ? (nisab / scale) * 360 : null;
  return <span className={`mini-week-ring${over ? " is-over" : extra ? " is-overtime" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <circle className="mini-week-ring-track" cx="24" cy="24" r={radius} />
      {nowLength > 0 ? <circle className="mini-week-ring-now" cx="24" cy="24" r={radius} strokeDasharray={`${nowLength} ${circumference}`} /> : null}
      {addLength > 0 ? <circle className="mini-week-ring-add" cx="24" cy="24" r={radius} strokeDasharray={`${addLength} ${circumference}`} strokeDashoffset={-nowLength} /> : null}
      {tick !== null ? <line className="mini-week-ring-tick" x1="24" y1="1.5" x2="24" y2="9" transform={`rotate(${tick} 24 24)`} /> : null}
    </svg>
    <b>{after}</b>
  </span>;
}

/** ارتفاع الترويسة تقريباً: النافذة العائمة المطويّة تُحصر داخل الشاشة به، لا بارتفاعها مفتوحة. */
const HEAD_PX = 76;
type Drawn = DrawnPlacement & { clash: boolean; golden: boolean };

export default function TeacherMiniWeek({
  teacherId, teacherName, nisab = 0, overtime = 0, limited = nisab > 0, visiting = false, rows, termId, collegeId, excludeId = 0, original = null,
  draft, verdict, checked = true, course, courses, window: dayWindow, userId = 0, fixedDays, onPick, variant = "side",
  autoCollapse = false, dockable = false, room = null,
}: {
  teacherId: number;
  teacherName: string;
  nisab?: number;
  /** إضافيُّ العضو فوق نصابه (الأعلى + الإضافي = السقف). */
  overtime?: number;
  /** للعضو قيدٌ ولو كان صفراً (إعفاءٌ كامل باستثناء). */
  limited?: boolean;
  visiting?: boolean;
  /** صفوفٌ محمّلة أصلاً (اللوحة)؛ تُضاف إليها قراءة أسبوع الأستاذ في الأقسام الأخرى. */
  rows: readonly FSchedule[];
  termId: number;
  collegeId: number;
  /** الموعد المفتوح للتعديل: يُرسم شبحاً لا محاضرة. */
  excludeId?: number;
  /** الموعد كما كان قبل التعديل (لنصاب «الآن»). */
  original?: FSchedule | null;
  draft: Partial<FSchedule> | null;
  verdict: MiniVerdict;
  /** هل فُحص الموعد فعلاً؟ (البطاقة السريعة لا تفحص قبل اختيار المقرر) — وإلا فشبحٌ محايد لا أخضر. */
  checked?: boolean;
  course?: AdCourse | null;
  courses: Map<number, AdCourse>;
  window: MiniSpan;
  userId?: number;
  /** أيامٌ ثابتة (طلب أستاذ): لا يُقترح غيرها. */
  fixedDays?: DayKey[];
  onPick: (pick: MiniPick) => void;
  variant?: "side" | "compact";
  /** يُطوى إلى ترويسته ما دام صحيحاً (درج الفحص مفتوحاً) دون أن يُكتب في التخزين شيء؛ وضغطُ الترويسة يفتحه رغم ذلك. */
  autoCollapse?: boolean;
  /** سطح المكتب (side، لا الشريط السفلي): الترويسة مقبضٌ يُسحب فتطفو النافذة بموضعها وحجمها المحفوظين، ونقرتان تعيدانها. */
  dockable?: boolean;
  /** القاعة المختارة في النموذج: حجوزها مخطّطةٌ نحاسية، وخانات «+» الحرّة للاثنين معاً ذهبية. */
  room?: MiniRoom | null;
}) {
  const bodyId = useId();
  const sheet = useMedia("(max-width: 1100px)", variant === "side");
  const hoverable = useMedia("(hover: hover)", true);
  /* الرسم بالمؤشر: فأرةٌ أو قلم على سطح المكتب — لا الشريط السفلي ولا اللمس. */
  const canDraw = useMedia("(hover: hover) and (pointer: fine)", !sheet) && !sheet;
  const storageKey = `teacher-mini-week:${variant}${sheet ? ":sheet" : ""}:${userId}`;
  const storedOpen = (key: string) => {
    const value = safeStorage.get(key);
    return value === "open" ? true : value === "closed" ? false : !sheet;
  };
  const [stayOpen, setStayOpen] = useState(() => storedOpen(storageKey));
  useEffect(() => { setStayOpen(storedOpen(storageKey)); }, [storageKey]);
  /* طيٌّ تلقائي (autoCollapse، درج الفحص مفتوح): الترويسة وحدها، ولا يُكتب في التخزين شيء.
     ضغطُ الترويسة يفتحها رغم ذلك — تجاوزٌ محليّ يعود إلى الطيّ حين يبدأ طيٌّ تلقائي جديد. */
  const [auto, setAuto] = useState({ on: autoCollapse, override: false });
  let override = auto.override;
  if (auto.on !== autoCollapse) {
    override = autoCollapse ? false : auto.override;
    setAuto({ on: autoCollapse, override });
  }
  const open = autoCollapse ? override : stayOpen;
  const setOpen = (next: boolean) => {
    if (autoCollapse) setAuto({ on: true, override: next });
    setStayOpen(next);
    safeStorage.set(storageKey, next ? "open" : "closed");
  };
  const shell = useRef<HTMLElement | null>(null);
  const swallowClick = useRef(false);

  /* إغلاقٌ سريع: زرّ X، وEsc (للشريط السفلي أو حين يكون التركيز داخله)، والسحب لأسفل.
     وEsc أثناء رسم موعدٍ يلغي الرسم وحده. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drawing.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelDraw();
        return;
      }
      const inside = Boolean(shell.current && document.activeElement && shell.current.contains(document.activeElement));
      if (!sheet && !inside) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet, autoCollapse, storageKey]);
  const viewportSize = useViewportSize();
  const viewport = viewportSize.height;

  const wider = useWiderWeek(teacherId, termId, rows);
  const all = useMemo(() => [...rows, ...wider], [rows, wider]);
  const lectures = useMemo(() => teacherLectures(all, teacherId, termId, excludeId, collegeId), [all, teacherId, termId, excludeId, collegeId]);
  const own = useMemo(() => teacherRows(all, teacherId, termId, excludeId), [all, teacherId, termId, excludeId]);
  const before = original && Number(original.AdInstructorId) === teacherId && (!termId || Number(original.AdTermId) === termId) ? original : null;
  const header = useMemo(() => teacherHeader(own, courses, draft, nisab, before), [own, courses, draft, nisab, before]);

  const draftStart = toMin(draft?.fstarttime), draftEnd = toMin(draft?.fendtime);
  const draftDays = DAY_KEYS.filter(day => Boolean((draft as any)?.[day]));
  const ghostKey = `${draftDays.join("+")}|${draftStart}|${draftEnd}`;
  const ghost = useMemo(() => Number.isFinite(draftStart) && Number.isFinite(draftEnd) && draftEnd > draftStart && draftDays.length
    ? { days: draftDays, start: draftStart, end: draftEnd } : null, [ghostKey]);
  const draftMinutes = ghost ? ghost.end - ghost.start : 0;
  const fixedKey = (fixedDays || []).join("+");

  /* الشبح يقرأ الحكم الواحد: مانعٌ → أحمر مخطّط؛ وأثناء الفحص يبقى لونه الأخير ويخفق. */
  const settled = useRef<"clean" | "blocked" | "idle">("idle");
  const blockers = ghostBlockers(verdict);
  const tone: Tone = blockers.length ? "blocked" : verdict.state === "checking" ? "checking" : checked ? "clean" : "idle";
  if (tone !== "checking") settled.current = tone;

  const span = useMemo(() => compactSpan(dayWindow, [...lectures.map(item => item.end), ...(ghost ? [ghost.end] : [])]), [dayWindow, lectures, ghost]);
  const targets = useMemo(() => freeTargets(course, lectures, span, { fixedDays, avoid: ghost }), [course, lectures, span, fixedKey, ghost]);
  const placements = useMemo(() => new Map(lectures.map(item => [`${item.id}:${item.day}`, {
    before: adjacentPlacement(item, "before", course, lectures, dayWindow, { minutes: draftMinutes, fixedDays }),
    after: adjacentPlacement(item, "after", course, lectures, dayWindow, { minutes: draftMinutes, fixedDays }),
  }])), [lectures, course, dayWindow, draftMinutes, fixedKey]);

  /* القاعة المختارة (room): حجوزها في الفصل — ما حُمِّل في اللوحة يظهر فوراً، ثم قراءة الخادم —
     دون محاضرات الأستاذ (مرسومة) والموعد المفتوح (شبح)؛ والخانة الحرّة للاثنين ذهبية. */
  const roomOn = roomReady(room);
  const roomLabel = roomOn ? `${String(room?.code || "").trim()}/${String(room?.hall || "").trim()}` : "";
  const roomFetched = useRoomWeek(roomOn ? room : null, termId, rows);
  const roomRows = useMemo(() => roomOn ? [...rows.filter(row => inRoom(row, room)), ...roomFetched] : [], [roomOn, roomLabel, rows, roomFetched]);
  const roomBusy = useMemo(() => roomBlocks(roomRows, { teacherId, termId, excludeId }), [roomRows, teacherId, termId, excludeId]);
  const shownTargets: Array<MiniTarget & { golden?: boolean }> = useMemo(() => roomOn ? goldenTargets(targets, roomRows, { teacherId, termId, excludeId }) : targets,
    [roomOn, targets, roomRows, teacherId, termId, excludeId]);

  /* معاينة قبل الضغط: «+» يضيء خانات النمط كلها، و«قبلها/بعدها» يرسم حدّ الموضع. */
  const [preview, setPreview] = useState<(MiniTarget & { stick: boolean }) | null>(null);
  const [active, setActive] = useState("");
  useEffect(() => { setPreview(null); }, [ghostKey, teacherId]);

  /* «تطفو» (dockable، سطح المكتب): الترويسة مقبضٌ يُسحب، والموضع والحجم يُتذكَّران، ونقرتان تعيدانها. */
  const dockOn = dockable && variant === "side" && !sheet;
  const floatKey = `teacher-mini-week:float:${userId}`;
  const readFloat = () => parseFloatRect(safeStorage.json<unknown>(floatKey, null));
  const [floatRect, setFloatRect] = useState<FloatRect | null>(readFloat);
  useEffect(() => { setFloatRect(readFloat()); }, [floatKey]);
  const saveFloat = (rect: FloatRect | null) => { if (rect) safeStorage.set(floatKey, JSON.stringify(rect)); else safeStorage.remove(floatKey); };
  const floating = dockOn && Boolean(floatRect) && typeof document !== "undefined";
  const shownRect = floating && floatRect ? clampFloatRect(floatRect, viewportSize, open ? undefined : HEAD_PX) : null;
  const [moving, setMoving] = useState(false);
  const moveCleanup = useRef<(() => void) | null>(null);
  const lastToggle = useRef(0);
  useEffect(() => () => moveCleanup.current?.(), []);
  /* العائمة المفتوحة: المسار يملأ ما يتركه الرأس والمفتاح والتلميح من ارتفاعها (يُقاس ولا يُخمَّن). */
  const [floatChrome, setFloatChrome] = useState(0);
  const baseTrack = trackFor(sheet ? "sheet" : variant, viewport);
  const trackHeight = floating && open && shownRect && floatChrome > 0 ? Math.round(Math.max(160, Math.min(1400, shownRect.h - floatChrome))) : baseTrack;
  useLayoutEffect(() => {
    if (!floating || !open) return;
    const node = shell.current;
    const head = node?.querySelector<HTMLElement>(":scope > .mini-week-head");
    const body = node?.querySelector<HTMLElement>(":scope > .mini-week-body");
    const track = body?.querySelector<HTMLElement>(".mini-week-track");
    if (!node || !head || !body || !track) return;
    const extra = Math.ceil(head.offsetHeight + body.offsetHeight - track.offsetHeight + 2);
    if (Math.abs(extra - floatChrome) > 1) setFloatChrome(extra);
  });
  /* تكبيرها وتصغيرها من الزاوية يُتذكَّر (والزاوية في الواجهة العربية يسارَ الأسفل: تُثبَّت
     الحافّة اليمنى فيتبع الطرفُ المؤشر، ويُقرأ الموضع من النافذة نفسها بعد كل تغيير). */
  useEffect(() => {
    const node = shell.current;
    if (!floating || !open || !node || typeof ResizeObserver === "undefined") return;
    let timer = 0;
    const observer = new ResizeObserver(() => {
      if (moveCleanup.current) return;
      /* مقاييس التخطيط لا الصندوق المرئي: حركة الظهور (scale) لا تُحسب تصغيراً يُحفظ. */
      const box = { x: node.offsetLeft, y: node.offsetTop, w: node.offsetWidth, h: node.offsetHeight };
      setFloatRect(previous => {
        if (!previous || (Math.abs(box.w - previous.w) < 2 && Math.abs(box.h - previous.h) < 2)) return previous;
        const next = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) };
        window.clearTimeout(timer);
        timer = window.setTimeout(() => saveFloat(next), 250);
        return next;
      });
    });
    observer.observe(node);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floating, open, floatKey]);
  const redock = () => { setFloatRect(null); saveFloat(null); };

  const total = Math.max(60, span.end - span.start);
  const at = (value: number) => ((Math.min(span.end, Math.max(span.start, value)) - span.start) / total) * 100;
  const place = (from: number, to: number): React.CSSProperties => ({ top: `${at(from)}%`, height: `${Math.max(2.4, at(to) - at(from))}%` });
  const pixels = (from: number, to: number) => ((to - from) / total) * trackHeight;
  const hourPixels = (60 / total) * trackHeight;
  const ticks: number[] = [];
  for (let value = Math.ceil(span.start / 60) * 60; value <= span.end; value += 60) ticks.push(value);
  const labelEvery = hourPixels < 24 ? 2 : 1;

  const nameOf = (row: FSchedule) => String(row.AdCourseName || courses.get(Number(row.AdCourseId))?.CourseName || "");
  const pick = (target: MiniTarget, lecture?: MiniLecture) => {
    const room = lecture ? adjacentRoom(lecture, target, all, excludeId) : null;
    onPick({ day: target.day, start: toClock(target.start), end: toClock(target.end), days: target.days, room: room || undefined });
    setPreview(null);
    setActive("");
  };
  const hover = (target: MiniTarget | null, stick = false) => () => setPreview(target ? { ...target, stick } : null);

  /* «اسحب على فراغ لترسم موعداً» (فأرة/قلم على سطح المكتب): من نقطة الضغط في يومٍ واحد، بمدة
     اللائحة إن عُرفت وإلا بطول السحب (drawnPlacement)؛ والإفلات يملأ النموذج كأي «+». */
  const drawing = useRef<{ day: DayKey; pointerId: number; y: number; from: number; top: number; height: number; active: boolean; fromTarget: boolean } | null>(null);
  const [draw, setDraw] = useState<Drawn | null>(null);
  const minuteAt = (clientY: number, top: number, height: number) => span.start + ((clientY - top) / Math.max(1, height)) * total;
  const placeDrawn = (day: DayKey, from: number, to: number): Drawn | null => {
    const spot = drawnPlacement(course, day, from, to, { span, draftDays, fixedDays });
    return spot ? { ...spot, clash: spotCrowds(spot, lectures), golden: roomOn && !spotCrowds(spot, roomBusy) } : null;
  };
  const cancelDraw = () => { drawing.current = null; setDraw(null); };
  useEffect(() => { if (!open) cancelDraw(); }, [open]);
  const startDraw = (day: DayKey) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canDraw || event.button !== 0 || (event.pointerType !== "mouse" && event.pointerType !== "pen")) return;
    if ((event.target as Element).closest?.(".mini-week-chip, .mini-week-stick, .mini-week-ghost, .mini-week-draw")) return;
    /* خانات «+» تغطّي معظم الفراغ: الضغط عليها يبقى «خذ هذه الخانة»، والسحب منها يرسم. */
    const fromTarget = Boolean((event.target as Element).closest?.(".mini-week-target"));
    const box = event.currentTarget.getBoundingClientRect();
    const from = minuteAt(event.clientY, box.top, box.height);
    if (ghost && ghost.days.includes(day) && from >= ghost.start && from <= ghost.end) return;
    if (!fromTarget) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    window.clearTimeout(hoverTimer.current);
    drawing.current = { day, pointerId: event.pointerId, y: event.clientY, from, top: box.top, height: box.height, active: false, fromTarget };
  };
  const moveDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drawing.current;
    if (!state || event.pointerId !== state.pointerId) return;
    if (!state.active && Math.abs(event.clientY - state.y) < 6) return;
    if (!state.active && state.fromTarget) event.currentTarget.setPointerCapture?.(event.pointerId);
    state.active = true;
    setDraw(placeDrawn(state.day, state.from, minuteAt(event.clientY, state.top, state.height)));
  };
  const endDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drawing.current;
    if (!state || event.pointerId !== state.pointerId) return;
    drawing.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const spot = state.active ? placeDrawn(state.day, state.from, minuteAt(event.clientY, state.top, state.height)) : null;
    setDraw(null);
    if (!spot) return;
    onPick({ day: spot.day, start: toClock(spot.start), end: toClock(spot.end), days: spot.days });
    setPreview(null);
    setActive("");
  };
  const lostDraw = () => { if (drawing.current) cancelDraw(); };

  /* تركيزٌ ذكيّ: أيام الموعد أعمدةٌ عريضة (2fr) والباقي 1fr؛ ويومٌ ضيّق يتّسع حين يستقرّ عليه
     المؤشر لحظة، ولا يتبدّل التوسيع تحت مؤشرٍ ساكن (مهلةٌ قصيرة بعد كل تغيير). */
  const [hoverDay, setHoverDay] = useState<DayKey | null>(null);
  const hoverTimer = useRef(0);
  const hoverLock = useRef(0);
  const focusKey = draftDays.join("+");
  useEffect(() => { setHoverDay(null); }, [focusKey]);
  /* تطفو أو تعود: تُبنى الشبكة من جديد فلا يصلها خروج المؤشر من القديمة — تُمسح المعاينة والتوسيع. */
  useEffect(() => { setPreview(null); setHoverDay(null); }, [floating]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const columns = weekColumns(draftDays, hoverDay);
  const widen = (day: DayKey) => () => {
    if (!draftDays.length || drawing.current || moving || draftDays.includes(day) || day === hoverDay) { window.clearTimeout(hoverTimer.current); return; }
    if (Date.now() < hoverLock.current) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => { hoverLock.current = Date.now() + 320; setHoverDay(day); }, 140);
  };
  const resetHover = () => {
    window.clearTimeout(hoverTimer.current);
    if (!drawing.current) setHoverDay(null);
  };
  /* اللمس بلا مرور: نقرةٌ على فراغ يومٍ ضيّق (أو على اسمه) توسّعه كما يوسّعه المؤشر. */
  const tapWiden = (day: DayKey) => (event: React.MouseEvent<HTMLElement>) => {
    if (!draftDays.length || draftDays.includes(day) || day === hoverDay || drawing.current) return;
    if ((event.target as Element).closest?.(".mini-week-chip, .mini-week-target, .mini-week-stick")) return;
    window.clearTimeout(hoverTimer.current);
    hoverLock.current = Date.now() + 320;
    setHoverDay(day);
  };

  /* الشريط السفلي (الشاشة الضيقة): سحبٌ لأعلى يفتح ولأسفل يطوي، والضغط يبدّل. */
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const endDrag = (event: React.PointerEvent) => {
    const state = drag.current;
    drag.current = null;
    if (shell.current) shell.current.style.transform = "";
    if (!state?.moved) return;
    swallowClick.current = true;
    const dy = event.clientY - state.y;
    if (dy < -24) setOpen(true);
    else if (dy > 24) setOpen(false);
  };
  /* سطح المكتب (dockable): سحبُ الترويسة أكثر من 6px يفصل النافذة فتطفو حيث تُفلت، داخل الشاشة.
     المتابعة على النافذة كلها لا على الزرّ: النافذة تنتقل إلى جسم الصفحة أثناء السحب نفسه. */
  const startMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    swallowClick.current = false;
    moveCleanup.current?.();
    const state = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, origin: shownRect, last: null as FloatRect | null, frame: 0 };
    const isOpen = open;
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== state.id) return;
      const dx = pointer.clientX - state.x, dy = pointer.clientY - state.y;
      if (!state.moved) {
        if (Math.hypot(dx, dy) <= 6) return;
        if (!state.origin) {
          const box = shell.current?.getBoundingClientRect();
          if (!box) return;
          state.origin = { x: box.left, y: box.top, w: box.width, h: isOpen ? Math.min(box.height, window.innerHeight - 16) : Math.min(window.innerHeight - 16, 620) };
        }
        state.moved = true;
        setMoving(true);
        document.documentElement.classList.add("mini-week-moving");
      }
      const origin = state.origin!;
      state.last = clampFloatRect({ ...origin, x: origin.x + dx, y: origin.y + dy }, viewportNow(), isOpen ? undefined : HEAD_PX);
      if (!state.frame) state.frame = window.requestAnimationFrame(() => { state.frame = 0; if (state.last) setFloatRect(state.last); });
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      if (state.frame) window.cancelAnimationFrame(state.frame);
      document.documentElement.classList.remove("mini-week-moving");
      moveCleanup.current = null;
    };
    const finish = (pointer: PointerEvent) => {
      if (pointer.pointerId !== state.id) return;
      cleanup();
      if (!state.moved) return;
      setMoving(false);
      swallowClick.current = true;
      /* النقرة التي تلي السحب تُبتلع؛ وإن لم تصل (انتقلت النافذة أثناء السحب) فلا تبتلع ما بعدها. */
      window.setTimeout(() => { swallowClick.current = false; }, 0);
      if (state.last) { setFloatRect(state.last); saveFloat(state.last); }
    };
    moveCleanup.current = cleanup;
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
  };
  const headHandlers = sheet ? {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      swallowClick.current = false;
      drag.current = { y: event.clientY, moved: false };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      const dy = event.clientY - state.y;
      if (Math.abs(dy) > 6) state.moved = true;
      if (state.moved && shell.current) shell.current.style.transform = `translateY(${open ? Math.max(0, dy) : Math.min(0, dy) / 3}px)`;
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  } : dockOn ? {
    onPointerDown: startMove,
    /* نقرتان: تعود النافذة إلى مكانها، ولا تبدّلان الطيّ (تُبطَل النقرة الأولى). */
    onDoubleClick: () => {
      if (lastToggle.current && Date.now() - lastToggle.current < 800) setOpen(!open);
      lastToggle.current = 0;
      if (floatRect) redock();
    },
  } : {};

  const loadDelta = header.loadAfter - header.loadNow;
  const over = limited && header.loadAfter > header.nisab + overtime;
  const inOvertime = !over && limited && header.loadAfter > header.nisab;
  const dayDelta = header.daysAfter - header.daysNow;
  const gapDelta = header.gapAfter - header.gapNow;
  const facts = `النصاب ${header.loadNow} ← ${header.loadAfter}${limited ? ` من ${header.nisab}` : ""}${limited && overtime ? ` وإضافيّ ${overtime}` : ""} · أيام الحضور ${header.daysAfter} · ${gapWords(header.gapAfter)}`;
  const headTitle = dockOn ? `${facts}\n${floating ? "نقرتان: تعود إلى مكانها" : "اسحب الترويسة لتطفو"}` : facts;
  const ghostPill = Boolean(ghost && tone === "blocked" && pixels(ghost.start, ghost.end) >= 30);

  const rtl = typeof document === "undefined" || document.documentElement?.dir !== "ltr";
  const style = {
    "--mw-track": `${trackHeight}px`,
    ...(columns ? { "--mw-cols": columns } : null),
    ...(shownRect ? {
      ...(rtl ? { right: Math.round(viewportSize.width - shownRect.x - shownRect.w) } : { left: shownRect.x }),
      top: shownRect.y, width: shownRect.w, height: open ? shownRect.h : undefined,
    } : null),
  } as React.CSSProperties;

  const card = <section ref={shell} className={`mini-week is-${variant}${sheet ? " is-sheet" : ""}${open ? " is-open" : ""}${dockOn ? " is-dockable" : ""}${floating ? " is-floating" : ""}${moving ? " is-moving" : ""}${columns ? " is-focus" : ""}${canDraw ? " can-draw" : ""}${draw ? " is-drawing" : ""}${roomOn ? " has-room" : ""}`}
    aria-label={`أسبوع ${teacherName || "الأستاذ"}`} data-mini-week="true" style={style}>
    {sheet ? <span className="mini-week-grip" aria-hidden="true" /> : dockOn ? <span className="mini-week-grip is-dock" aria-hidden="true" /> : null}
    {dockOn && !floating ? <span className="mini-week-notch" aria-hidden="true" /> : null}
    <button type="button" className="mini-week-head" aria-expanded={open} aria-controls={bodyId} title={headTitle}
      onClick={event => {
        if (swallowClick.current) { swallowClick.current = false; return; }
        if (dockOn && event.detail > 1) return;
        if (dockOn) lastToggle.current = Date.now();
        setOpen(!open);
      }}
      {...headHandlers}
      data-guide-ignore="يطوي جدول الأستاذ المصغّر أو يفتحه؛ لا يغيّر الموعد">
      <LoadRing now={header.loadNow} after={header.loadAfter} nisab={header.nisab} overtime={overtime} limited={limited} />
      <span className="mini-week-who">
        <b><span className="mini-week-name">{teacherName || "الأستاذ"}</span>{visiting ? <VisitingBadge compact /> : null}</b>
        <span className="mini-week-facts">
          <em className={`is-load${over ? " is-over" : inOvertime ? " is-overtime" : loadDelta > 0 ? " is-up" : ""}`} aria-label={`النصاب ${header.loadNow} ثم ${header.loadAfter}`}>
            <span dir="ltr">{header.loadNow}</span><ArrowLeft aria-hidden="true" /><span dir="ltr">{header.loadAfter}{limited ? <small>/{header.nisab}{overtime ? `+${overtime}` : ""}</small> : null}</span>
          </em>
          <em className={dayDelta > 0 ? "is-up" : ""} aria-label={`أيام الحضور ${header.daysAfter}`}>
            <CalendarDays aria-hidden="true" /><span dir="ltr">{header.daysAfter}</span>{dayDelta > 0 ? <sup dir="ltr">+{dayDelta}</sup> : null}
          </em>
          <em className={gapDelta > 0 ? "is-up" : gapDelta < 0 ? "is-down" : ""} aria-label={gapWords(header.gapAfter)}>
            <Hourglass aria-hidden="true" /><span dir="ltr">{hoursText(header.gapAfter)}</span>
            {gapDelta ? (gapDelta > 0 ? <ArrowUp aria-hidden="true" className="mini-week-trend" /> : <ArrowDown aria-hidden="true" className="mini-week-trend" />) : null}
          </em>
        </span>
      </span>
      <ChevronDown className="mini-week-chevron" aria-hidden="true" />
    </button>
    {floating ? <button type="button" className="mini-week-dock" aria-label="أعد النافذة إلى مكانها" title="إلى مكانها (أو نقرتان على الترويسة)" onClick={redock}
      data-guide-ignore="يعيد نافذة أسبوع الأستاذ العائمة إلى مكانها بجانب النموذج وينسى موضعها؛ لا يغيّر الموعد"><Pin aria-hidden="true" /></button> : null}
    {open ? <button type="button" className="mini-week-close" aria-label="إغلاق جدول الأستاذ" title="إغلاق (Esc)" onClick={() => setOpen(false)}
      data-guide-ignore="يطوي جدول الأستاذ المصغّر؛ لا يغيّر الموعد"><X aria-hidden="true" /></button> : null}
    {open ? <div className="mini-week-body" id={bodyId} onMouseLeave={resetHover}>
      <div className="mini-week-days" aria-hidden="true">
        <span />
        {DAY_KEYS.map(day => <span key={day} className={draftDays.includes(day) ? "is-draft" : ""} onMouseMove={widen(day)} onClick={tapWiden(day)}>{DAY_SHORT[day]}</span>)}
      </div>
      <div className="mini-week-canvas">
        <div className="mini-week-axis" aria-hidden="true">
          {ticks.map((value, index) => index % labelEvery === 0
            ? <span key={value} style={{ top: `${at(value)}%` }}>{value / 60}</span> : null)}
        </div>
        <div className="mini-week-grid" onMouseLeave={() => setPreview(null)}>
          {DAY_KEYS.map(day => <div key={day} className={`mini-week-track${draftDays.includes(day) ? " is-draft" : ""}`} data-day={day}
            onMouseMove={widen(day)} onClick={tapWiden(day)} onPointerDown={startDraw(day)} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={cancelDraw} onLostPointerCapture={lostDraw}>
            {ticks.map(value => <i key={value} className="mini-week-tick" style={{ top: `${at(value)}%` }} aria-hidden="true" />)}
            {roomBusy.filter(item => item.day === day).map(item => {
              const name = nameOf(item.row);
              return <span key={`r-${item.id}`} className={`mini-week-room${pixels(item.start, item.end) >= 26 ? "" : " is-thin"}`} style={place(item.start, item.end)} role="img"
                aria-label={`القاعة محجوزة · ${name} · ${toClock(item.start)}–${toClock(item.end)}`}
                title={`${name}${item.row.SCode ? ` · ${item.row.SCode}` : ""}\n${toClock(item.start)}–${toClock(item.end)}`}>
                <span className="mini-week-room-text">القاعة محجوزة</span>
              </span>;
            })}
            {shownTargets.filter(target => target.day === day).map(target => {
              const lit = Boolean(preview && !preview.stick && preview.start === target.start && preview.days.includes(day) && preview.days.join() === target.days.join());
              const golden = target.golden;
              return <button type="button" key={`t-${target.start}`} className={`mini-week-target${lit ? " is-lit" : ""}${golden === true ? " is-golden" : golden === false ? " is-room-busy" : ""}`} style={place(target.start, target.end)}
                title={`${toClock(target.start)}–${toClock(target.end)} · ${daysText(target.days)}${golden === true ? " · والقاعة خالية" : golden === false ? " · القاعة محجوزة" : ""}`}
                aria-label={`ضع الموعد ${DAY_FULL[day]} ${toClock(target.start)} (${daysText(target.days)})${golden === true ? " · والقاعة خالية" : golden === false ? " · القاعة محجوزة" : ""}`}
                onMouseEnter={hover(target)} onFocus={hover(target)} onBlur={hover(null)} onClick={() => pick(target)}
                data-guide-ignore="يملأ اليوم والبداية والنهاية وأيام النمط في النموذج؛ لا يحفظ شيئاً"><Plus aria-hidden="true" />
                {pixels(target.start, target.end) >= 22 ? <span className="mini-week-target-time" dir="ltr">{toClock(target.start)}</span> : null}
                {golden === true ? <Star className="mini-week-target-star" aria-hidden="true" /> : null}
              </button>;
            })}
            {lectures.filter(item => item.day === day).map(item => {
              const key = `${item.id}:${item.day}`;
              const spot = placements.get(key);
              const height = pixels(item.start, item.end);
              const label = courseLabel(nameOf(item.row), 0.3).text || String(courses.get(Number(item.row.AdCourseId))?.CourseCode || "");
              const where = [item.row.AdRoomCode, item.row.AdRoomHall].filter(Boolean).join("/");
              return <div key={key} role="group" className={`mini-week-chip${item.otherCollege ? " is-other" : ""}${height >= 30 ? " is-tall" : height >= 15 ? "" : " is-thin"}${active === key ? " is-active" : ""}`}
                style={place(item.start, item.end)} onClick={() => setActive(value => value === key ? "" : key)}
                aria-label={`${nameOf(item.row)} · ${toClock(item.start)}–${toClock(item.end)}${item.otherCollege ? " · كلية أخرى" : ""}`}
                title={`${nameOf(item.row)}${item.row.SCode ? ` · ${item.row.SCode}` : ""}\n${toClock(item.start)}–${toClock(item.end)}${where ? ` · ${where}` : ""}${item.otherCollege ? " · كلية أخرى" : ""}`}>
                <span className="mini-week-chip-text">
                  <b>{label}</b>
                  {height >= 30 ? <small dir="ltr">{toClock(item.start)}</small> : null}
                </span>
                {spot?.before ? <button type="button" className="mini-week-stick is-before" aria-label={`قبلها · ${toClock(spot.before.start)}`} title={`قبلها · ${toClock(spot.before.start)}`}
                  onMouseEnter={hover(spot.before, true)} onFocus={hover(spot.before, true)} onBlur={hover(null)} onClick={event => { event.stopPropagation(); pick(spot.before!, item); }}
                  data-guide-ignore="يضع الموعد ملاصقاً قبل هذه المحاضرة بالفاصل المقرّر وفي قاعتها إن خلت؛ لا يحفظ"><ArrowUp aria-hidden="true" /></button> : null}
                {spot?.after ? <button type="button" className="mini-week-stick is-after" aria-label={`بعدها · ${toClock(spot.after.start)}`} title={`بعدها · ${toClock(spot.after.start)}`}
                  onMouseEnter={hover(spot.after, true)} onFocus={hover(spot.after, true)} onBlur={hover(null)} onClick={event => { event.stopPropagation(); pick(spot.after!, item); }}
                  data-guide-ignore="يضع الموعد ملاصقاً بعد هذه المحاضرة بالفاصل المقرّر وفي قاعتها إن خلت؛ لا يحفظ"><ArrowDown aria-hidden="true" /></button> : null}
              </div>;
            })}
            {preview?.stick && preview.days.includes(day) ? <span className="mini-week-preview" style={place(preview.start, preview.end)} aria-hidden="true" /> : null}
            {draw && draw.days.includes(day) ? <span className={`mini-week-draw${draw.day === day ? "" : " is-echo"}${draw.clash ? " is-clash" : roomOn ? (draw.golden ? " is-golden" : " is-room-busy") : ""}`}
              style={place(draw.start, draw.end)} aria-hidden="true">
              {draw.day === day ? <b dir="ltr">{toClock(draw.start)}–{toClock(draw.end)} · {draw.minutes}د</b> : null}
            </span> : null}
            {ghost && ghost.days.includes(day) ? <span key={`g-${ghostKey}`} className={`mini-week-ghost is-${tone === "checking" ? settled.current : tone}${tone === "checking" ? " is-checking" : ""}${ghostPill ? " has-pill" : ""}`}
              style={place(ghost.start, ghost.end)} role="img"
              aria-label={tone === "blocked" ? "الموعد الجاري يتعارض" : tone === "checking" ? "الموعد الجاري قيد الفحص" : tone === "idle" ? "الموعد الجاري — لم يُفحص بعد" : "الموعد الجاري سليم"}>
              {tone === "blocked" || tone === "clean" ? <i className="mini-week-ghost-mark" aria-hidden="true">{tone === "blocked" ? <X /> : <Check />}</i> : null}
              {ghostPill ? <em className="mini-week-ghost-pill" aria-hidden="true"><X />موعدك</em> : null}
            </span> : null}
          </div>)}
        </div>
      </div>
      {roomOn ? <div className="mini-week-legend">
        <span><i className="is-own" aria-hidden="true" />محاضرات الأستاذ</span>
        <span><i className="is-room" aria-hidden="true" />القاعة محجوزة</span>
        <span><i className="is-golden" aria-hidden="true"><Star /></i>تناسب الاثنين</span>
        <b className="mini-week-legend-room" title="القاعة المختارة في النموذج"><DoorOpen aria-hidden="true" /><bdi dir="ltr">{roomLabel}</bdi></b>
      </div> : null}
      <p className="mini-week-hint"><Info aria-hidden="true" />
        <span>{hoverable ? "مرّر على «+» فتضيء خانات النمط" : "اضغط «+» لتضع الموعد"}{canDraw ? " · اسحب على فراغ لترسم موعداً" : ""} · لا يُحفظ شيء</span>
      </p>
    </div> : null}
  </section>;
  return floating ? createPortal(card, document.body) : card;
}
