import CourseTags from "./CourseTags";
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, BookOpen, Check, CheckCircle2, Clock3, Copy, GraduationCap, Layers, Link2, LockOpen, UserRound, X } from "lucide-react";
import { AR, countOf, oblique } from "../utils/arabicCount";
import { formatScheduleTimeRange, scheduleClockForDisplay, scheduleDayWindowMinutes, type ScheduleDayWindow } from "../utils/scheduleTime";
import { capSameSlot, sameSlotOf, slotMinutes, SLOT_DAYS, type SameSlotItem, type SameSlotQuery, type SameSlotResult, type SlotDay, type SlotRow } from "../utils/sameSlot";
import { sameLevelLookup, unlockLookup, type UnlockGroup } from "../utils/planPeers";
import { coreqFindings, coreqFreeTime, partnersOfCourse, type CoreqFreeTime } from "../utils/coreqSections";

/**
 * «في الوقت نفسه» — شارةٌ صغيرة تظهر فقط حين يوجد موعدٌ آخر في اليوم والساعة ذاتهما، أو قرينٌ
 * من صحيفته يتداخل وقته، أو شعبةٌ من المقرر نفسه متداخلة أو قريبة، وبلمسها تُفتح ورقةٌ مضغوطة بمقرراتها. تنبيهٌ هادئ لا يمنع الحفظ ولا يُفتح وحده.
 *
 * تقرأ الصفوفَ التي تحمّلها صفحةُ الجدول أصلاً (بلا طلبٍ جديد)، ولا تعرض القاعات أبداً،
 * وتُظهر اسمَ الأستاذ فقط إن مُرّرت دالةُ الأسماء (الشاشةُ نفسها تُظهرها لهذه الصفة).
 */

type CourseLite = { CourseCode?: string; CourseName?: string };

export interface SameSlotHintProps<R extends SlotRow & { AdCourseName?: string; AdInstructorId?: number }> {
  rows: readonly R[];
  courseOf: (courseId: number) => CourseLite | undefined;
  /** اسم الأستاذ؛ لا تُمرَّر فلا يظهر أي اسم. */
  instructorName?: (instructorId: number) => string;
  days: readonly SlotDay[];
  start: string;
  end: string;
  excludeId?: number | string | null;
  skipIds?: Iterable<number | string>;
  courseId?: number;
  sectionId?: number;
  termId?: number;
  /** القسمُ والكلية: لقراءة مقرنات صحيفته (مرةً واحدة، مخبَّأة). */
  collegeId?: number;
  /** رقمُ الشعبة الجاري إدخالُها (لحساب «شعبة بديلة»). */
  scode?: string;
  /** يومُ القسم كما يقرؤه محرر الموعد (لحساب أقرب وقتٍ خالٍ من المقرن). */
  dayWindow?: ScheduleDayWindow | null;
  className?: string;
}

/** ما تقوله صحائفُ القسم: جلبةٌ واحدة لكل قسم في الجلسة، وتفشلُ بصمت (الزينة لا تكسر شاشة). */
interface PlanFacts { pairs: number[][]; levelGroups: number[][]; unlockGroups: UnlockGroup[]; chainPairs: number[][] }
const NO_FACTS: PlanFacts = { pairs: [], levelGroups: [], unlockGroups: [], chainPairs: [] };
const pairsCache = new Map<number, PlanFacts>();
const pairsPending = new Map<number, Promise<void>>();
function usePlanFacts(collegeId: number | undefined, sectionId: number | undefined): PlanFacts {
  const [facts, setFacts] = useState<PlanFacts>(() => (sectionId ? pairsCache.get(sectionId) : undefined) || NO_FACTS);
  useEffect(() => {
    if (!sectionId) { setFacts(NO_FACTS); return; }
    const cached = pairsCache.get(sectionId);
    if (cached) { setFacts(cached); return; }
    let live = true;
    let job = pairsPending.get(sectionId);
    if (!job) {
      job = fetch(`/api/schedules/coreq-pairs?collegeId=${collegeId || 0}&sectionId=${sectionId}`, { credentials: "include" })
        .then(response => (response.ok ? response.json() : NO_FACTS))
        .then(data => {
          pairsCache.set(sectionId, {
            pairs: Array.isArray(data?.pairs) ? data.pairs : [],
            levelGroups: Array.isArray(data?.levelGroups) ? data.levelGroups : [],
            unlockGroups: Array.isArray(data?.unlockGroups) ? data.unlockGroups : [],
            chainPairs: Array.isArray(data?.chainPairs) ? data.chainPairs : [],
          });
        })
        .catch(() => { pairsCache.set(sectionId, NO_FACTS); })
        .finally(() => { pairsPending.delete(sectionId); });
      pairsPending.set(sectionId, job);
    }
    void job.then(() => { if (live) setFacts(pairsCache.get(sectionId) || NO_FACTS); });
    return () => { live = false; };
  }, [collegeId, sectionId]);
  return facts;
}

/** وسمُ المقررات التي تُؤخذ في فصلٍ واحد: سطرُ مجموعتها ووصفُها. كلمةٌ واحدة هنا تغيّرها كلَّها. */
const TAKEN_TOGETHER = "تُؤخذ معًا";

/** بنودُ الورقة متجاورةً تحت سطر مجموعتها: «تفتح» أو TAKEN_TOGETHER أو بلا سطر. */
function groupedRows<R>(items: readonly SameSlotItem<R>[]) {
  const groups: Array<{ key: string; items: SameSlotItem<R>[] }> = [];
  for (const item of items) {
    const key = item.unlock ? `unlock|${item.unlock.names.join("|")}` : item.sameLevel ? "level" : "plain";
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}

/** ما يقف فوق ورقة الموعد على الحاسوب: شريط الجوال وترويسة الصفحة، ما دام ظاهراً فوق الشارة. */
const SHEET_CEILING = ".mobile-topbar, .page-heading";

/** تأخيرٌ قصير: لا حسابَ عند كل ضغطة مفتاح. */
function useSettled<T>(value: T, key: string, ms = 180): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return settled;
}

const hueOf = (seed: number) => (Math.abs(Math.round(seed)) * 47) % 360;

export default function SameSlotHint<R extends SlotRow & { AdCourseName?: string; AdInstructorId?: number }>(props: SameSlotHintProps<R>) {
  const { rows, courseOf, instructorName, days, start, end, excludeId, skipIds, courseId, sectionId, termId, collegeId, scode, dayWindow, className } = props;
  const skipKey = [...(skipIds || [])].join(",");
  const queryKey = `${days.join("+")}|${start}|${end}|${excludeId ?? ""}|${skipKey}|${courseId ?? ""}|${sectionId ?? ""}|${termId ?? ""}|${collegeId ?? ""}|${scode ?? ""}`;
  const query = useSettled<SameSlotQuery>(
    { days, start, end, excludeId, skipIds: skipKey ? skipKey.split(",") : [], courseId, sectionId, termId, collegeId, scode, codeOf: (id) => courseOf(id)?.CourseCode },
    queryKey,
  );

  /* المقرن: تداخلٌ (لا تطابقٌ تام) مع مقرر الموعد التوأم، ومعه: هل بقيت شعبةٌ بديلة؟ */
  const { pairs, levelGroups, unlockGroups, chainPairs } = usePlanFacts(collegeId, sectionId);
  const { start: dayStart, end: dayEnd } = scheduleDayWindowMinutes(dayWindow);
  const twins = useMemo(() => {
    if (!courseId || !pairs.length) return [];
    const partners = partnersOfCourse(pairs, courseId);
    if (!partners.length) return [];
    const flags: Partial<SlotRow> = {};
    for (const day of SLOT_DAYS) flags[day.key] = query.days.includes(day.key);
    const candidate: SlotRow = { id: -1, AdCourseId: courseId, AdSectionId: sectionId, SCode: scode, fstarttime: query.start, fendtime: query.end, ...flags };
    const scoped = rows.filter(row => (!sectionId || !row.AdSectionId || Number(row.AdSectionId) === Number(sectionId)) && (!termId || !row.AdTermId || Number(row.AdTermId) === Number(termId)));
    return coreqFindings(candidate, scoped, partners, excludeId).map(finding => ({
      ...finding,
      row: scoped.find(row => String(row.id) === String(finding.overlapRowIds[0])) as (R | undefined),
      free: coreqFreeTime(candidate, scoped, finding.partnerCourseId, { start: dayStart, end: dayEnd }, excludeId),
    }));
  }, [pairs, courseId, sectionId, scode, termId, rows, query, excludeId, dayStart, dayEnd]);

  /* ما يرويه بطاقةُ المقرن لا يُعاد في قائمة «الوقت نفسه». */
  const twinIds = useMemo(() => twins.flatMap(twin => twin.overlapRowIds).map(String), [twins]);
  /* الصفوف تتجدد حياً؛ الاستعلام وحده يُؤخَّر. */
  const sameLevel = useMemo(() => sameLevelLookup(levelGroups, chainPairs), [levelGroups, chainPairs]);
  const unlockOf = useMemo(() => unlockLookup(unlockGroups, chainPairs), [unlockGroups, chainPairs]);
  const result: SameSlotResult<R> = useMemo(() => sameSlotOf<R>(rows, { ...query, skipIds: [...(query.skipIds || []), ...twinIds], codeOf: (id) => courseOf(id)?.CourseCode, sameLevel, unlockOf }), [rows, query, twinIds, sameLevel, unlockOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [phone, setPhone] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  const count = result.count;
  const { partialCount, sectionCount } = result;
  const twinCount = twins.length;
  /* لا شيءَ يُقال ← تُطوى الورقةُ المفتوحة معه. */
  useEffect(() => { if (!count && !twinCount && open) setOpen(false); }, [count, twinCount, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const isPhone = window.matchMedia("(max-width: 640px)").matches;
      setPhone(isPhone);
      const anchor = button.current?.getBoundingClientRect();
      if (isPhone || !anchor) { setPos(null); return; }
      const width = Math.min(330, window.innerWidth - 16);
      const height = sheet.current?.scrollHeight || 260;
      let left = anchor.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      /* لا تغطي الورقةُ الترويسة: تبقى تحتها وتُمرَّر من داخلها إن ضاق المكان. */
      const ceiling = [...document.querySelectorAll(SHEET_CEILING)].reduce((lowest, element) => {
        const box = element.getBoundingClientRect();
        return box.height && box.bottom > 0 && box.bottom <= anchor.top ? Math.max(lowest, box.bottom) : lowest;
      }, 0) + 8;
      const below = window.innerHeight - 8 - (anchor.bottom + 8), above = anchor.top - 8 - ceiling;
      const under = height <= below || below >= above;
      const maxHeight = Math.max(160, Math.min(height, under ? below : above));
      setPos({ left, maxHeight, top: under ? anchor.bottom + 8 : Math.max(ceiling, anchor.top - 8 - maxHeight) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, result, twinCount]);

  useEffect(() => {
    if (!open) return;
    sheet.current?.focus({ preventScroll: true });
    /* Esc يطوي الورقةَ وحدَها: لا يغلق البطاقةَ ولا المحرر من تحتها. */
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus({ preventScroll: true });
    };
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (sheet.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", away, true);
    return () => { window.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", away, true); };
  }, [open]);

  if (!count && !twinCount) return null;

  const capped = capSameSlot(result.items);
  const chosen = SLOT_DAYS.filter(day => days.includes(day.key));
  const several = chosen.length > 1;
  const exactCount = count - partialCount - sectionCount;
  const label = [
    exactCount ? `${countOf(exactCount, AR.course)} في الوقت نفسه` : "",
    partialCount ? `تداخل مع ${countOf(partialCount, oblique(AR.course))} مما يُؤخذ معه` : "",
    sectionCount ? `${countOf(sectionCount, AR.section)} من المقرر نفسه بوقت قريب` : "",
    twinCount ? "مقرن متداخل" : "",
  ].filter(Boolean).join("، ");
  const timeText = formatScheduleTimeRange(start, end);
  const ownName = courseOf(Number(courseId))?.CourseName || "هذا المقرر";

  const rowNode = ({ row, days: rowDays, sameLevel: level, sameCourse, unlock, kind }: SameSlotItem<R>, index: number) => {
    const course = courseOf(Number(row.AdCourseId));
    const name = row.AdCourseName || course?.CourseName || "موعد آخر";
    const who = instructorName && row.AdInstructorId ? instructorName(Number(row.AdInstructorId)) : "";
    const hue = hueOf(Number(row.AdCourseId) || index);
    return (
      <li key={row.id} className={[level || unlock ? "is-level" : "", kind === "exact" ? "" : "is-partial"].filter(Boolean).join(" ") || undefined} style={{ ["--ss-hue" as any]: hue }}>
        <span className="same-slot-icon" aria-hidden="true"><BookOpen /></span>
        <span className="same-slot-main">
          <b>{name}</b>
          <small>
            {course?.CourseCode ? <bdi dir="ltr">{course.CourseCode}</bdi> : null}
            <CourseTags courseId={row.AdCourseId} />
            {who ? <span className="same-slot-who"><UserRound aria-hidden="true" />{who}</span> : null}
            {several ? <span className="same-slot-days">{SLOT_DAYS.filter(day => rowDays.includes(day.key)).map(day => <i key={day.key}>{day.short}</i>)}</span> : null}
          </small>
        </span>
        {row.SCode ? <span className="same-slot-chip">شعبة <bdi dir="ltr">{row.SCode}</bdi></span> : null}
        {unlock ? <span className="same-slot-level" title="يفتحان معاً مقرراً تالياً" role="img" aria-label="يفتحان معاً مقرراً تالياً"><LockOpen /></span> : null}
        {level ? <span className="same-slot-level" title={TAKEN_TOGETHER} role="img" aria-label={TAKEN_TOGETHER}><GraduationCap /></span> : null}
        {sameCourse ? <span className="same-slot-level" title="المقرر نفسه" role="img" aria-label="المقرر نفسه"><Copy /></span> : null}
        {kind === "exact" ? null : <OverlapSpan own={{ start: query.start, end: query.end }} row={row} near={kind === "near"} />}
      </li>
    );
  };

  const sheetNode = (
    <div className={`same-slot-layer${phone ? " is-phone" : ""}`}>
      {phone ? <div className="same-slot-backdrop" aria-hidden="true" onPointerDown={() => setOpen(false)} /> : null}
      <div
        ref={sheet}
        className="same-slot-sheet"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={!phone && pos ? { left: pos.left, top: pos.top, maxHeight: pos.maxHeight } : undefined}
      >
        <header className="same-slot-head">
          <span className="same-slot-mark" aria-hidden="true"><Layers /></span>
          <strong id={titleId}>
            <span className="same-slot-days">{chosen.map(day => <i key={day.key}>{several ? day.short : day.label}</i>)}</span>
            <bdi className="same-slot-time" dir="ltr">{timeText}</bdi>
          </strong>
          <button type="button" className="same-slot-close" aria-label="إغلاق" data-guide-ignore="يطوي الورقة؛ لا يحفظ شيئاً" onClick={() => { setOpen(false); button.current?.focus({ preventScroll: true }); }}>
            <X aria-hidden="true" />
          </button>
        </header>
        {count ? <>
        <div className="same-slot-bar" aria-hidden="true">
          {capped.items.map((item, index) => (
            <i key={String(item.row.id)} style={{ background: `hsl(${hueOf(Number(item.row.AdCourseId) || index)} 48% 56%)` }} />
          ))}
        </div>
        <div className="same-slot-body">
          {groupedRows(capped.items).map(group => {
            const unlock = group.items[0].unlock;
            return (
              <section key={group.key} className="same-slot-day">
                {unlock ? (
                  <p className="same-slot-legend is-unlock"><LockOpen aria-hidden="true" />تفتح: <b>{unlock.names[0]}</b>{unlock.names.length > 1 ? <bdi dir="ltr">+{unlock.names.length - 1}</bdi> : null}</p>
                ) : group.key === "level" ? (
                  <p className="same-slot-legend"><GraduationCap aria-hidden="true" />{TAKEN_TOGETHER}</p>
                ) : null}
                <ul>{group.items.map(rowNode)}</ul>
              </section>
            );
          })}
          {capped.hidden ? <p className="same-slot-more"><bdi dir="ltr">+{capped.hidden}</bdi></p> : null}
        </div>
        </> : null}
        {twins.map(twin => <React.Fragment key={twin.partnerCourseId}><TwinNode twin={twin} own={{ name: ownName, start: query.start, end: query.end }} courseOf={courseOf} /></React.Fragment>)}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`same-slot-chip-btn${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        data-guide-ignore="يفتح ورقةً تعرض المقررات في الوقت نفسه؛ لا يحفظ شيئاً"
        onClick={() => setOpen(value => !value)}
      >
        {count ? <><Layers aria-hidden="true" /><b dir="ltr">{count}</b></> : null}
        {twinCount ? <Link2 aria-hidden="true" /> : null}
      </button>
      {open ? createPortal(sheetNode, document.body) : null}
    </>
  );
}

/** الوقتُ بدقائقه كما يُعرض في الجدول. */
const clockOf = (minutes: number) => scheduleClockForDisplay(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`);

/**
 * التداخل الجزئي: وقتُ الصف نفسه (عنوانُ الورقة لا يصفه)، وشريطان بمحورٍ واحد بلغة بطاقة المقرن:
 * الأعلى هذا الموعد والأسفل ذاك، والعنبريُّ موضعُ التداخل. والقريبةُ بلا عنبري: يُرى الفاصلُ بينهما.
 */
function OverlapSpan({ own, row, near }: { own: { start: string; end: string }; row: SlotRow; near: boolean }) {
  const a0 = slotMinutes(own.start), a1 = slotMinutes(own.end);
  const b0 = slotMinutes(row.fstarttime), b1 = slotMinutes(row.fendtime);
  const lo = Math.min(a0, b0), span = Math.max(1, Math.max(a1, b1) - lo);
  const pct = (value: number) => ((value - lo) / span) * 100;
  const segment = (kind: string, from: number, to: number) => (
    <i className={kind} style={{ insetInlineStart: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }} />
  );
  const cut = near ? null : segment("is-overlap", Math.max(a0, b0), Math.min(a1, b1));
  const time = formatScheduleTimeRange(row.fstarttime, row.fendtime);
  return (
    <span className={`same-slot-span${near ? " is-near" : ""}`} role="img" aria-label={`${near ? "قريبة" : "تداخل جزئي"}، وقته ${time}`} title={near ? "قريبة" : "تداخل جزئي"}>
      <Clock3 />
      <strong dir="ltr">{time}</strong>
      <span className="same-slot-tracks">
        <span className="twin-track">{segment("is-free", a0, a1)}{cut}</span>
        <span className="twin-track">{segment("is-free", b0, b1)}{cut}</span>
      </span>
      {near ? <em>قريبة</em> : null}
    </span>
  );
}

/**
 * التوأم: عقدتان (هذا المقرر ومقرنه) يصل بينهما رابط، وشريطان رفيعان بمحور واحد:
 * الأخضر الهادئ وقتٌ والعنبريُّ تداخل، والمحاطُ بالأخضر هو المكان الخالي، ووسمُه تحته مباشرة:
 * الوقتُ نفسه، أو الشعبةُ الخالية. لا سطرَ زائد ولا لوحة: الرسم يقول الخبر والكلمات أقلّ ما يمكن.
 * النصُّ الكامل لقارئ الشاشة، فلا يقوم المعنى على اللون وحده.
 */
function TwinNode({ twin, own, courseOf }: {
  twin: { partnerCourseId: number; alternative: boolean; free: CoreqFreeTime; row?: SlotRow & { AdCourseName?: string } };
  own: { name: string; start: string; end: string };
  courseOf: (courseId: number) => CourseLite | undefined;
}) {
  const partnerName = twin.row?.AdCourseName || courseOf(twin.partnerCourseId)?.CourseName || "مقرنه";
  const { placement, partnerSection, ownSection, sectionSpans } = twin.free;
  const a0 = slotMinutes(own.start), a1 = slotMinutes(own.end);
  const b0 = slotMinutes(twin.row?.fstarttime), b1 = slotMinutes(twin.row?.fendtime);
  const ok = [a0, a1, b0, b1].every(Number.isFinite);
  /* يُرسم للمقرن ما يخصّ الخبر: الشعبةُ التي يخلو منها الوقت المقترح، وإلا الموعدُ المتداخل. */
  const partnerSpans: Array<readonly [number, number]> = placement && sectionSpans.length ? sectionSpans : [[b0, b1]];
  const clean = partnerSection ? sectionSpans : [];
  const freeWindow = placement ? [[placement.start, placement.end] as const] : [];
  const edges = ok ? [a0, a1, ...[...partnerSpans, ...clean, ...freeWindow].flat()] : [0, 1];
  const lo = Math.min(...edges), hi = Math.max(...edges), span = Math.max(1, hi - lo);
  const pct = (value: number) => ((value - lo) / span) * 100;
  const segment = (kind: string, from: number, to: number) => (
    <i key={`${kind}-${from}`} className={kind} style={{ insetInlineStart: `${pct(from)}%`, width: `${Math.max(2, pct(to) - pct(from))}%` }} />
  );
  const cuts = partnerSpans.map(([from, to]) => [Math.max(a0, from), Math.min(a1, to)] as const).filter(([from, to]) => to > from);
  const verdict = twin.alternative ? "" : "لا بديل";
  const sideWord = placement?.side === "after" ? "بعد" : "قبل";
  const clock = placement ? clockOf(placement.side === "after" ? placement.start : placement.end) : "";
  const fact = placement ? `يخلو ${sideWord} ${clock}`
    : partnerSection ? `يخلو مع شعبة ${partnerSection} من مقرنه`
    : ownSection ? `يخلو بشعبة ${ownSection} من هذا المقرر`
    : "";
  const spoken = `مقرنه ${partnerName} يتداخل في الوقت. ${[verdict, fact].filter(Boolean).join(". ") || "توجد شعبة بديلة"}.`;
  /* الوسمُ تحت مكانه على الشريط؛ والكلمتان الثابتتان تنتقلان إلى الجهة الأخرى فلا يتزاحمان. */
  const spot = freeWindow[0] || clean[0];
  const at = spot ? pct((spot[0] + spot[1]) / 2) : 100;
  const hasMark = Boolean(fact);
  return (
    <section className={`twin-card${twin.alternative ? " has-alt" : " no-alt"}`} role="group" aria-label={spoken}>
      <div className="twin-nodes" aria-hidden="true">
        <span className="twin-node"><BookOpen /><b>{own.name}</b></span>
        <span className="twin-link"><Link2 /></span>
        <span className="twin-node"><BookOpen /><b>{partnerName}</b></span>
      </div>
      {ok ? (
        <div className="twin-bars" aria-hidden="true">
          <div className="twin-track">
            {segment("is-free", a0, a1)}
            {cuts.map(([from, to]) => segment("is-overlap", from, to))}
            {freeWindow.map(([from, to]) => segment("is-window", from, to))}
          </div>
          <div className="twin-track">
            {partnerSpans.map(([from, to]) => segment("is-free", from, to))}
            {cuts.map(([from, to]) => segment("is-overlap", from, to))}
            {clean.map(([from, to]) => segment("is-window", from, to))}
          </div>
        </div>
      ) : null}
      <p className={`twin-line${hasMark && at < 50 ? " is-flip" : ""}`}>
        {twin.alternative ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
        <span>مقرنه</span>
        {verdict ? <><em>·</em><strong>{verdict}</strong></> : !hasMark ? <><em>·</em><strong>توجد شعبة بديلة</strong></> : null}
        {hasMark ? (
          <span className="twin-mark" style={{ ["--at" as any]: `${at}%` }} title={fact}>
            {placement ? <Clock3 aria-hidden="true" /> : <Check aria-hidden="true" />}
            {placement ? <>{sideWord} <strong dir="ltr">{clock}</strong></>
              : <>{partnerSection ? "مع شعبة " : "بشعبة "}<strong dir="ltr">{partnerSection || ownSection}</strong></>}
          </span>
        ) : null}
      </p>
    </section>
  );
}
