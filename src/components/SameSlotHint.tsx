import CourseTags from "./CourseTags";
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, BookOpen, Check, CheckCircle2, ChevronDown, Clock3, Copy, GraduationCap, Layers, Link2, LockOpen, UserRound, X } from "lucide-react";
import { AR, countOf, oblique } from "../utils/arabicCount";
import { formatScheduleTimeRange, scheduleClockForDisplay, scheduleDayWindowMinutes, type ScheduleDayWindow } from "../utils/scheduleTime";
import { sameSlotGroups, sameSlotOf, sameSlotSheet, slotMinutes, SLOT_DAYS, visibleSections, type SameSlotCourseRow, type SameSlotGroup, type SameSlotGroupKind, type SameSlotItem, type SameSlotQuery, type SameSlotResult, type SameSlotView, type SlotDay, type SlotRow } from "../utils/sameSlot";
import { sameLevelLookup, unlockLookup } from "../utils/planPeers";
import { cachedPlanFacts, loadPlanFacts, NO_PLAN_FACTS, type PlanFacts } from "../utils/planFactsCache";
import { coreqFindings, coreqFreeTime, coreqScopeRows, partnersOfCourse, type CoreqFreeTime } from "../utils/coreqSections";

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
  softSkipIds?: Iterable<number | string>;
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

/** ما تقوله صحائفُ القسم، من مخبأ المتصفح (src/utils/planFactsCache.ts). */
function usePlanFacts(collegeId: number | undefined, sectionId: number | undefined): PlanFacts {
  const [facts, setFacts] = useState<PlanFacts>(() => cachedPlanFacts(sectionId) || NO_PLAN_FACTS);
  useEffect(() => {
    if (!sectionId) { setFacts(NO_PLAN_FACTS); return; }
    const cached = cachedPlanFacts(sectionId);
    if (cached) { setFacts(cached); return; }
    let live = true;
    void loadPlanFacts(collegeId, sectionId).then(next => { if (live) setFacts(next); });
    return () => { live = false; };
  }, [collegeId, sectionId]);
  return facts;
}

/** وسمُ المقررات التي تُؤخذ في فصلٍ واحد: سطرُ مجموعتها ووصفُها. كلمةٌ واحدة هنا تغيّرها كلَّها. */
const TAKEN_TOGETHER = "تُؤخذ معًا";

/** وجوهُ المجموعات في رقائق الورقة وسطورها: أيقونةٌ، والاسمُ لقارئ الشاشة وسطرِ المجموعة.
    «المقرر نفسه» أولاً لأن نسيانَ شعبةٍ مكررة أسهلُ ما يقع. */
const GROUP_FACE: Record<SameSlotGroupKind, { name: string; Icon: typeof Copy }> = {
  course: { name: "المقرر نفسه", Icon: Copy },
  unlock: { name: "تفتح مقرراً تالياً", Icon: LockOpen },
  level: { name: TAKEN_TOGETHER, Icon: GraduationCap },
  time: { name: "في الوقت نفسه", Icon: Clock3 },
};

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
  const { rows, courseOf, instructorName, days, start, end, excludeId, skipIds, softSkipIds, courseId, sectionId, termId, collegeId, scode, dayWindow, className } = props;
  const skipKey = [...(skipIds || [])].join(",");
  const softSkipKey = [...(softSkipIds || [])].join(",");
  const queryKey = `${days.join("+")}|${start}|${end}|${excludeId ?? ""}|${skipKey}|${softSkipKey}|${courseId ?? ""}|${sectionId ?? ""}|${termId ?? ""}|${collegeId ?? ""}|${scode ?? ""}`;
  const query = useSettled<SameSlotQuery>(
    { days, start, end, excludeId, skipIds: skipKey ? skipKey.split(",") : [], softSkipIds: softSkipKey ? softSkipKey.split(",") : [], courseId, sectionId, termId, collegeId, scode, codeOf: (id) => courseOf(id)?.CourseCode },
    queryKey,
  );

  /* المقرن: تداخلٌ (لا تطابقٌ تام) مع مقرر الموعد التوأم، ومعه: هل بقيت شعبةٌ بديلة؟ */
  const { pairs, levelGroups, unlockGroups } = usePlanFacts(collegeId, sectionId);
  const { start: dayStart, end: dayEnd } = scheduleDayWindowMinutes(dayWindow);
  const twins = useMemo(() => {
    if (!courseId || !pairs.length) return [];
    const partners = partnersOfCourse(pairs, courseId);
    if (!partners.length) return [];
    const flags: Partial<SlotRow> = {};
    for (const day of SLOT_DAYS) flags[day.key] = query.days.includes(day.key);
    const candidate: SlotRow = { id: -1, AdCourseId: courseId, AdSectionId: sectionId, SCode: scode, fstarttime: query.start, fendtime: query.end, ...flags };
    const scoped = coreqScopeRows(rows, { sectionId, termId });
    return coreqFindings(candidate, scoped, partners, excludeId).map(finding => ({
      ...finding,
      row: scoped.find(row => String(row.id) === String(finding.overlapRowIds[0])) as (R | undefined),
      free: coreqFreeTime(candidate, scoped, finding.partnerCourseId, { start: dayStart, end: dayEnd }, excludeId),
    }));
  }, [pairs, courseId, sectionId, scode, termId, rows, query, excludeId, dayStart, dayEnd]);

  /* ما يرويه بطاقةُ المقرن لا يُعاد في قائمة «الوقت نفسه»، إلا ما يفتحانه معاً: البطاقةُ لا تقوله. */
  const twinIds = useMemo(() => twins.flatMap(twin => twin.overlapRowIds).map(String), [twins]);
  /* الصفوف تتجدد حياً؛ الاستعلام وحده يُؤخَّر. */
  const sameLevel = useMemo(() => sameLevelLookup(levelGroups), [levelGroups]);
  const unlockOf = useMemo(() => unlockLookup(unlockGroups), [unlockGroups]);
  const result: SameSlotResult<R> = useMemo(() => sameSlotOf<R>(rows, { ...query, softSkipIds: [...(query.softSkipIds || []), ...twinIds], codeOf: (id) => courseOf(id)?.CourseCode, sameLevel, unlockOf }), [rows, query, twinIds, sameLevel, unlockOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => sameSlotGroups(result.items), [result]);
  const [open, setOpen] = useState(false);
  /* رقاقةُ النوع المختارة و«+n» المفتوح: يعودان إلى «الكل» مطوياً كلما طُويت الورقة. */
  const [view, setView] = useState<SameSlotView>("all");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (!open) { setView("all"); setExpanded(false); } }, [open]);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const tabList = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [phone, setPhone] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  /* العددُ صفوفُ المقررات كما تُرى: شعبُ المقرر الواحد صفٌّ واحد؛ وشعبُ المقرر نفسه تُعدّ شُعَباً. */
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const sectionCount = groups.filter(group => group.kind === "course").reduce((sum, group) => sum + group.rows.reduce((n, row) => n + row.sections.length, 0), 0);
  const otherRows = groups.filter(group => group.kind !== "course").flatMap(group => group.rows);
  const partialCount = otherRows.filter(row => !row.exact).length;
  const exactCount = otherRows.length - partialCount;
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
  }, [open, result, twinCount, view, expanded]);

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

  const shown = sameSlotSheet<R>(groups, view, expanded);
  const shownRows = shown.groups.flatMap(group => group.rows);
  const chosen = SLOT_DAYS.filter(day => days.includes(day.key));
  const several = chosen.length > 1;
  const label = [
    exactCount ? `${countOf(exactCount, AR.course)} في الوقت نفسه` : "",
    partialCount ? `تداخل مع ${countOf(partialCount, oblique(AR.course))} من أقرانه في الصحيفة` : "",
    sectionCount ? `${countOf(sectionCount, AR.section)} من المقرر نفسه في الوقت نفسه أو قريبة منه` : "",
    twinCount ? "مقرن متداخل" : "",
  ].filter(Boolean).join("، ");
  const timeText = formatScheduleTimeRange(start, end);
  const ownName = courseOf(Number(courseId))?.CourseName || "هذا المقرر";

  /* الرقائق: «الكل» ثم نوعٌ لكل مجموعة؛ والأسهم بينها (في الاتجاه من اليمين: اليسارُ هو التالي). */
  const views: SameSlotView[] = shown.tabs.length ? ["all", ...shown.tabs.map(tab => tab.kind)] : [];
  const tabId = (key: SameSlotView) => `${titleId}-tab-${key}`;
  const panelId = `${titleId}-panel`;
  const pick = (next: SameSlotView, focus = false) => {
    setView(next);
    if (focus) tabList.current?.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus();
  };
  const onTabKey = (event: React.KeyboardEvent) => {
    const at = views.indexOf(shown.view);
    const step = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
    const next = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : step ? (at + step + views.length) % views.length : -1;
    if (next < 0) return;
    event.preventDefault();
    pick(views[next], true);
  };
  const tabNode = (key: SameSlotView) => {
    const tab = shown.tabs.find(item => item.kind === key);
    const face = key === "all" ? { name: "الكل", Icon: Layers } : GROUP_FACE[key];
    const number = !tab ? count : key === "course" ? tab.sectionCount : tab.rowCount;
    const counted = !tab ? countOf(count, AR.course) : key === "course" ? countOf(tab.sectionCount, AR.section) : countOf(tab.rowCount, AR.course);
    const selected = shown.view === key;
    return (
      <button key={key} id={tabId(key)} data-view={key} type="button" role="tab" aria-selected={selected} aria-controls={panelId} tabIndex={selected ? 0 : -1}
        className={`same-slot-tab is-${key}${selected ? " is-active" : ""}`} aria-label={`${face.name}: ${counted}`} title={face.name}
        data-guide-ignore="يعرض نوعاً من المقررات في الورقة؛ لا يحفظ شيئاً" onClick={() => pick(key)}>
        <face.Icon aria-hidden="true" /><b dir="ltr">{number}</b>
      </button>
    );
  };

  const legendNode = (group: SameSlotGroup<R>) => {
    /* في «الكل» يُعرض صفٌّ واحد؛ والباقي «+n» على سطر مجموعته يفتح رقاقتها. */
    const all = groups.filter(item => item.key === group.key).reduce((sum, item) => sum + item.rows.length, 0);
    const extra = shown.tabs.length && shown.view === "all" ? all - group.rows.length : 0;
    const more = extra ? (
      <button type="button" className="same-slot-legend-more" aria-label={`إظهار الكل: ${countOf(all, AR.course)}`} data-guide-ignore="يعرض بقية المجموعة؛ لا يحفظ شيئاً" onClick={() => pick(group.kind)}>
        <bdi dir="ltr">+{extra}</bdi>
      </button>
    ) : null;
    if (group.unlock) return <p className="same-slot-legend is-unlock"><LockOpen aria-hidden="true" />تفتح: <b>{group.unlock.names[0]}</b>{group.unlock.names.length > 1 ? <bdi dir="ltr">+{group.unlock.names.length - 1}</bdi> : null}{more}</p>;
    if (group.kind === "level") return <p className="same-slot-legend"><GraduationCap aria-hidden="true" />{TAKEN_TOGETHER}{more}</p>;
    if (group.kind === "course") return <p className="same-slot-legend is-course"><Copy aria-hidden="true" />{GROUP_FACE[group.kind].name}{more}</p>;
    /* الوقتُ نفسه بلا سطر حين يكون وحده، كما كان. */
    return shown.tabs.length ? <p className="same-slot-legend"><Clock3 aria-hidden="true" />{GROUP_FACE[group.kind].name}{more}</p> : null;
  };

  const rowNode = (courseRow: SameSlotCourseRow<R>, index: number) => {
    const { row, sameLevel: level, sameCourse, unlock } = courseRow.sections[0];
    const course = courseOf(Number(row.AdCourseId));
    const name = row.AdCourseName || course?.CourseName || "موعد آخر";
    /* الأستاذُ حين تشترك فيه الشعبُ كلُّها؛ وإلا لا اسم. */
    const teachers = [...new Set(courseRow.sections.map(section => Number(section.row.AdInstructorId) || 0))];
    const who = instructorName && teachers.length === 1 && teachers[0] ? instructorName(teachers[0]) : "";
    const hue = hueOf(Number(row.AdCourseId) || index);
    const { sections, hidden } = visibleSections(courseRow);
    const codes = courseRow.sections.map(section => section.row.SCode).filter(Boolean) as string[];
    /* شعبٌ مدموجة بأيامٍ مختلفة: كلُّ رقاقةٍ تحمل أيامها، فلا يضيع أيُّ شعبةٍ تتداخل في أيِّ يوم. */
    const daysDiffer = several && new Set(courseRow.sections.map(section => section.days.join("+"))).size > 1;
    const daysOf = (section: SameSlotCourseRow<R>["sections"][number]) => SLOT_DAYS.filter(day => section.days.includes(day.key)).map(day => day.short).join("·");
    return (
      <li key={courseRow.key} className={[level || unlock ? "is-level" : "", courseRow.exact ? "" : "is-partial"].filter(Boolean).join(" ") || undefined} style={{ ["--ss-hue" as any]: hue }}>
        <span className="same-slot-icon" aria-hidden="true"><BookOpen /></span>
        <span className="same-slot-main">
          <b>{name}</b>
          <small>
            {course?.CourseCode ? <bdi dir="ltr">{course.CourseCode}</bdi> : null}
            <CourseTags courseId={row.AdCourseId} />
            {who ? <span className="same-slot-who"><UserRound aria-hidden="true" />{who}</span> : null}
            {several ? <span className="same-slot-days">{SLOT_DAYS.filter(day => courseRow.days.includes(day.key)).map(day => <i key={day.key}>{day.short}</i>)}</span> : null}
          </small>
        </span>
        {courseRow.sections.length === 1
          ? (row.SCode ? <span className="same-slot-chip">شعبة <bdi dir="ltr">{row.SCode}</bdi></span> : null)
          : codes.length ? (
            <span className="same-slot-sections" role="img" aria-label={`${countOf(codes.length, AR.section)}: ${courseRow.sections.filter(section => section.row.SCode).map(section => daysDiffer ? `${section.row.SCode} (${daysOf(section)})` : String(section.row.SCode)).join("، ")}`}>
              {sections.map(section => section.row.SCode ? <span key={String(section.row.id)} className="same-slot-chip"><bdi dir="ltr">{section.row.SCode}</bdi>{daysDiffer ? <small className="same-slot-chip-days">{daysOf(section)}</small> : null}</span> : null)}
              {hidden ? <bdi className="same-slot-chip is-more" dir="ltr">+{hidden}</bdi> : null}
            </span>
          ) : null}
        {unlock ? <span className="same-slot-level" title="يفتحان معاً مقرراً تالياً" role="img" aria-label="يفتحان معاً مقرراً تالياً"><LockOpen /></span> : null}
        {level ? <span className="same-slot-level" title={TAKEN_TOGETHER} role="img" aria-label={TAKEN_TOGETHER}><GraduationCap /></span> : null}
        {sameCourse ? <span className="same-slot-level" title="المقرر نفسه" role="img" aria-label="المقرر نفسه"><Copy /></span> : null}
        {courseRow.exact ? null : <OverlapSpan own={{ start: query.start, end: query.end }} sections={courseRow.sections} drawn={sections} near={courseRow.near} />}
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
        {views.length ? (
          <div ref={tabList} className="same-slot-tabs" role="tablist" aria-label="أنواع ما في الوقت نفسه" onKeyDown={onTabKey}>
            {views.map(tabNode)}
          </div>
        ) : null}
        <div className="same-slot-bar" aria-hidden="true">
          {shownRows.map((courseRow, index) => (
            <i key={courseRow.key} style={{ background: `hsl(${hueOf(Number(courseRow.sections[0].row.AdCourseId) || index)} 48% 56%)` }} />
          ))}
        </div>
        <div className="same-slot-body" id={panelId} {...(views.length ? { role: "tabpanel", "aria-labelledby": tabId(shown.view) } : {})}>
          {shown.groups.map(group => (
            <section key={group.key} className="same-slot-day">
              {legendNode(group)}
              <ul>{group.rows.map(rowNode)}</ul>
            </section>
          ))}
          {shown.hidden && !views.length ? (
            <button type="button" className="same-slot-more" aria-label={`إظهار البقية: ${countOf(shown.hidden, AR.course)}`} data-guide-ignore="يُظهر بقية المقررات في الورقة؛ لا يحفظ شيئاً" onClick={() => setExpanded(true)}>
              <bdi dir="ltr">+{shown.hidden}</bdi><ChevronDown aria-hidden="true" />
            </button>
          ) : null}
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
        className={`same-slot-chip-btn${open ? " is-open" : ""}${sectionCount ? " has-dup" : ""}${className ? ` ${className}` : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        data-guide-ignore="يفتح ورقةً تعرض المقررات في الوقت نفسه؛ لا يحفظ شيئاً"
        onClick={() => setOpen(value => !value)}
      >
        {count ? <><Layers aria-hidden="true" /><b dir="ltr">{count}</b></> : null}
        {twinCount ? <Link2 aria-hidden="true" /> : null}
        {sectionCount ? <span className="same-slot-dup" aria-hidden="true"><Copy /></span> : null}
      </button>
      {open ? createPortal(sheetNode, document.body) : null}
    </>
  );
}

/** الوقتُ بدقائقه كما يُعرض في الجدول. */
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const clockOf = (minutes: number) => scheduleClockForDisplay(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`);

/**
 * التداخل الجزئي: وقتُ الصف نفسه (عنوانُ الورقة لا يصفه)، وشريطان بمحورٍ واحد بلغة بطاقة المقرن:
 * الأعلى هذا الموعد والأسفل ذاك، والعنبريُّ موضعُ التداخل. والقريبةُ بلا عنبري: يُرى الفاصلُ بينهما.
 * الصفُّ المدموج: شريطٌ رفيع لكل شعبةٍ مرسومة تحت شريط الموعد بالمحور نفسه، ووقتُه من أبكرها إلى آخرها،
 * والوصفُ المقروء يسمّي كلَّ شعبةٍ بوقتها.
 */
function OverlapSpan({ own, sections, drawn, near }: { own: { start: string; end: string }; sections: readonly SameSlotItem<SlotRow>[]; drawn: readonly SameSlotItem<SlotRow>[]; near: boolean }) {
  const a0 = slotMinutes(own.start), a1 = slotMinutes(own.end);
  const spans = drawn.map(({ row, kind }) => ({ id: String(row.id), b0: slotMinutes(row.fstarttime), b1: slotMinutes(row.fendtime), near: kind === "near" }));
  const lo = Math.min(a0, ...spans.map(s => s.b0)), span = Math.max(1, Math.max(a1, ...spans.map(s => s.b1)) - lo);
  const pct = (value: number) => ((value - lo) / span) * 100;
  const segment = (kind: string, from: number, to: number) => (
    <i className={kind} style={{ insetInlineStart: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }} />
  );
  const cutOf = (s: (typeof spans)[number]) => (s.near ? null : segment("is-overlap", Math.max(a0, s.b0), Math.min(a1, s.b1)));
  const sayOne = ({ row, kind }: SameSlotItem<SlotRow>) => `${kind === "near" ? "قريبة" : kind === "exact" ? "الوقت نفسه" : "تداخل جزئي"}، وقته ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`;
  const row = sections[0].row;
  const single = sections.length === 1;
  const first = Math.min(...sections.map(s => slotMinutes(s.row.fstarttime))), last = Math.max(...sections.map(s => slotMinutes(s.row.fendtime)));
  const time = single ? formatScheduleTimeRange(row.fstarttime, row.fendtime) : formatScheduleTimeRange(hhmm(first), hhmm(last));
  const spoken = single ? sayOne(sections[0]) : sections.map(s => `شعبة ${s.row.SCode || ""}: ${sayOne(s)}`).join("؛ ");
  return (
    <span className={`same-slot-span${near ? " is-near" : ""}`} role="img" aria-label={spoken} title={near ? "قريبة" : "تداخل جزئي"}>
      <Clock3 />
      <strong dir="ltr">{time}</strong>
      <span className="same-slot-tracks">
        <span className="twin-track">{segment("is-free", a0, a1)}{spans.map(s => <React.Fragment key={s.id}>{cutOf(s)}</React.Fragment>)}</span>
        {spans.map(s => <span key={s.id} className="twin-track">{segment("is-free", s.b0, s.b1)}{cutOf(s)}</span>)}
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
