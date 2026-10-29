import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, CalendarOff, Check, ChevronDown, Hourglass, Plus, X } from "lucide-react";
import type { AdCourse, FSchedule } from "../types";
import type { AppointmentVerdict } from "../utils/appointmentVerdict";
import { DAY_KEYS, type DayKey } from "../utils/scheduleRegulations";
import { courseLabel } from "../utils/courseLabel";
import { AR, countOf } from "../utils/arabicCount";
import {
  adjacentPlacement, adjacentRoom, compactSpan, freeTargets, teacherHeader, teacherLectures, teacherRows, toClock, toMin,
  type MiniLecture, type MiniRoomPick, type MiniSpan, type MiniTarget,
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
function useViewportHeight() {
  const read = () => typeof window === "undefined" ? 900 : window.innerHeight || 900;
  const [height, setHeight] = useState(read);
  useEffect(() => {
    const sync = () => setHeight(read());
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  return height;
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

/** حلقة النصاب: القوس الثابت ما يحمله الآن، والقوس الفاتح ما يضيفه هذا الموعد. */
function LoadRing({ now, after, nisab }: { now: number; after: number; nisab: number }) {
  const radius = 19, circumference = 2 * Math.PI * radius;
  const scale = Math.max(1, nisab > 0 ? Math.max(nisab, after) : after);
  const nowLength = (Math.min(now, scale) / scale) * circumference;
  const addLength = (Math.max(0, Math.min(after, scale) - Math.min(now, scale)) / scale) * circumference;
  const over = nisab > 0 && after > nisab;
  const tick = nisab > 0 && after > nisab ? (nisab / scale) * 360 : null;
  return <span className={`mini-week-ring${over ? " is-over" : ""}`} aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <circle className="mini-week-ring-track" cx="24" cy="24" r={radius} />
      {nowLength > 0 ? <circle className="mini-week-ring-now" cx="24" cy="24" r={radius} strokeDasharray={`${nowLength} ${circumference}`} /> : null}
      {addLength > 0 ? <circle className="mini-week-ring-add" cx="24" cy="24" r={radius} strokeDasharray={`${addLength} ${circumference}`} strokeDashoffset={-nowLength} /> : null}
      {tick !== null ? <line className="mini-week-ring-tick" x1="24" y1="1.5" x2="24" y2="9" transform={`rotate(${tick} 24 24)`} /> : null}
    </svg>
    <b>{after}</b>
  </span>;
}

export default function TeacherMiniWeek({
  teacherId, teacherName, nisab = 0, visiting = false, rows, termId, collegeId, excludeId = 0, original = null,
  draft, verdict, checked = true, course, courses, window: dayWindow, userId = 0, fixedDays, onPick, variant = "side",
}: {
  teacherId: number;
  teacherName: string;
  nisab?: number;
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
}) {
  const bodyId = useId();
  const sheet = useMedia("(max-width: 1100px)", variant === "side");
  const storageKey = `teacher-mini-week:${variant}${sheet ? ":sheet" : ""}:${userId}`;
  const storedOpen = (key: string) => {
    const value = safeStorage.get(key);
    return value === "open" ? true : value === "closed" ? false : !sheet;
  };
  const [open, setOpenState] = useState(() => storedOpen(storageKey));
  useEffect(() => { setOpenState(storedOpen(storageKey)); }, [storageKey]);
  const setOpen = (next: boolean) => { setOpenState(next); safeStorage.set(storageKey, next ? "open" : "closed"); };

  /* إغلاقٌ سريع: زرّ X، وEsc (للشريط السفلي أو حين يكون التركيز داخله)، والسحب لأسفل. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const inside = Boolean(shell.current && document.activeElement && shell.current.contains(document.activeElement));
      if (!sheet && !inside) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet]);
  const viewport = useViewportHeight();

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

  /* معاينة قبل الضغط: «+» يضيء خانات النمط كلها، و«قبلها/بعدها» يرسم حدّ الموضع. */
  const [preview, setPreview] = useState<(MiniTarget & { stick: boolean }) | null>(null);
  const [active, setActive] = useState("");
  useEffect(() => { setPreview(null); }, [ghostKey, teacherId]);

  const trackHeight = trackFor(sheet ? "sheet" : variant, viewport);
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

  /* الشريط السفلي (الشاشة الضيقة): سحبٌ لأعلى يفتح ولأسفل يطوي، والضغط يبدّل. */
  const shell = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
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
  } : {};

  const loadDelta = header.loadAfter - header.loadNow;
  const over = header.nisab > 0 && header.loadAfter > header.nisab;
  const dayDelta = header.daysAfter - header.daysNow;
  const gapDelta = header.gapAfter - header.gapNow;
  const facts = `النصاب ${header.loadNow} ← ${header.loadAfter}${header.nisab ? ` من ${header.nisab}` : ""} · أيام الحضور ${header.daysAfter} · ${gapWords(header.gapAfter)}`;

  return <section ref={shell} className={`mini-week is-${variant}${sheet ? " is-sheet" : ""}${open ? " is-open" : ""}`}
    aria-label={`أسبوع ${teacherName || "الأستاذ"}`} data-mini-week="true" style={{ "--mw-track": `${trackHeight}px` } as React.CSSProperties}>
    {sheet ? <span className="mini-week-grip" aria-hidden="true" /> : null}
    <button type="button" className="mini-week-head" aria-expanded={open} aria-controls={bodyId} title={facts}
      onClick={() => { if (swallowClick.current) { swallowClick.current = false; return; } setOpen(!open); }}
      {...headHandlers}
      data-guide-ignore="يطوي جدول الأستاذ المصغّر أو يفتحه؛ لا يغيّر الموعد">
      <LoadRing now={header.loadNow} after={header.loadAfter} nisab={header.nisab} />
      <span className="mini-week-who">
        <b><span className="mini-week-name">{teacherName || "الأستاذ"}</span>{visiting ? <VisitingBadge compact /> : null}</b>
        <span className="mini-week-facts">
          <em className={`is-load${over ? " is-over" : loadDelta > 0 ? " is-up" : ""}`} aria-label={`النصاب ${header.loadNow} ثم ${header.loadAfter}`}>
            <span dir="ltr">{header.loadNow}</span><ArrowLeft aria-hidden="true" /><span dir="ltr">{header.loadAfter}{header.nisab ? <small>/{header.nisab}</small> : null}</span>
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
    {open ? <button type="button" className="mini-week-close" aria-label="إغلاق جدول الأستاذ" title="إغلاق (Esc)" onClick={() => setOpen(false)}
      data-guide-ignore="يطوي جدول الأستاذ المصغّر؛ لا يغيّر الموعد"><X aria-hidden="true" /></button> : null}
    {open ? <div className="mini-week-body" id={bodyId}>
      <div className="mini-week-days" aria-hidden="true">
        <span />
        {DAY_KEYS.map(day => <span key={day} className={ghost?.days.includes(day) ? "is-draft" : ""}>{DAY_SHORT[day]}</span>)}
      </div>
      <div className="mini-week-canvas">
        <div className="mini-week-axis" aria-hidden="true">
          {ticks.map((value, index) => index % labelEvery === 0
            ? <span key={value} style={{ top: `${at(value)}%` }}>{value / 60}</span> : null)}
        </div>
        <div className="mini-week-grid" onMouseLeave={() => setPreview(null)}>
          {DAY_KEYS.map(day => <div key={day} className={`mini-week-track${ghost?.days.includes(day) ? " is-draft" : ""}`} data-day={day}>
            {ticks.map(value => <i key={value} className="mini-week-tick" style={{ top: `${at(value)}%` }} aria-hidden="true" />)}
            {targets.filter(target => target.day === day).map(target => {
              const lit = Boolean(preview && !preview.stick && preview.start === target.start && preview.days.includes(day) && preview.days.join() === target.days.join());
              return <button type="button" key={`t-${target.start}`} className={`mini-week-target${lit ? " is-lit" : ""}`} style={place(target.start, target.end)}
                title={`${toClock(target.start)}–${toClock(target.end)} · ${daysText(target.days)}`}
                aria-label={`ضع الموعد ${DAY_FULL[day]} ${toClock(target.start)} (${daysText(target.days)})`}
                onMouseEnter={hover(target)} onFocus={hover(target)} onBlur={hover(null)} onClick={() => pick(target)}
                data-guide-ignore="يملأ اليوم والبداية والنهاية وأيام النمط في النموذج؛ لا يحفظ شيئاً"><Plus aria-hidden="true" /></button>;
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
            {ghost && ghost.days.includes(day) ? <span key={`g-${ghostKey}`} className={`mini-week-ghost is-${tone === "checking" ? settled.current : tone}${tone === "checking" ? " is-checking" : ""}`}
              style={place(ghost.start, ghost.end)} role="img"
              aria-label={tone === "blocked" ? "الموعد الجاري يتعارض" : tone === "checking" ? "الموعد الجاري قيد الفحص" : tone === "idle" ? "الموعد الجاري — لم يُفحص بعد" : "الموعد الجاري سليم"}>
              {tone === "blocked" || tone === "clean" ? <i className="mini-week-ghost-mark" aria-hidden="true">{tone === "blocked" ? <X /> : <Check />}</i> : null}
            </span> : null}
          </div>)}
        </div>
      </div>
    </div> : null}
  </section>;
}
