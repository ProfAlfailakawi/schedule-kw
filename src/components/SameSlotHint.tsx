import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, BookOpen, CheckCircle2, GraduationCap, Layers, Link2, UserRound, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { capSameSlot, sameSlotOf, slotMinutes, SLOT_DAYS, type SameSlotQuery, type SameSlotResult, type SlotDay, type SlotRow } from "../utils/sameSlot";
import { coreqFindings, partnersOfCourse } from "../utils/coreqSections";

/**
 * «في الوقت نفسه» — شارةٌ صغيرة تظهر فقط حين يوجد موعدٌ آخر في اليوم والساعة ذاتهما،
 * وبلمسها تُفتح ورقةٌ مضغوطة بمقرراتِ تلك الساعة. تنبيهٌ هادئ لا يمنع الحفظ ولا يُفتح وحده.
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
  className?: string;
}

/** مقرناتُ القسم من صحيفته: جلبةٌ واحدة لكل قسم في الجلسة، وتفشلُ بصمت (الزينة لا تكسر شاشة). */
const pairsCache = new Map<number, number[][]>();
const pairsPending = new Map<number, Promise<void>>();
function useCoreqPairs(collegeId: number | undefined, sectionId: number | undefined): number[][] {
  const [pairs, setPairs] = useState<number[][]>(() => (sectionId ? pairsCache.get(sectionId) : undefined) || []);
  useEffect(() => {
    if (!sectionId) { setPairs([]); return; }
    const cached = pairsCache.get(sectionId);
    if (cached) { setPairs(cached); return; }
    let live = true;
    let job = pairsPending.get(sectionId);
    if (!job) {
      job = fetch(`/api/schedules/coreq-pairs?collegeId=${collegeId || 0}&sectionId=${sectionId}`, { credentials: "include" })
        .then(response => (response.ok ? response.json() : { pairs: [] }))
        .then(data => { pairsCache.set(sectionId, Array.isArray(data?.pairs) ? data.pairs : []); })
        .catch(() => { pairsCache.set(sectionId, []); })
        .finally(() => { pairsPending.delete(sectionId); });
      pairsPending.set(sectionId, job);
    }
    void job.then(() => { if (live) setPairs(pairsCache.get(sectionId) || []); });
    return () => { live = false; };
  }, [collegeId, sectionId]);
  return pairs;
}

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
  const { rows, courseOf, instructorName, days, start, end, excludeId, skipIds, courseId, sectionId, termId, collegeId, scode, className } = props;
  const skipKey = [...(skipIds || [])].join(",");
  const queryKey = `${days.join("+")}|${start}|${end}|${excludeId ?? ""}|${skipKey}|${courseId ?? ""}|${sectionId ?? ""}|${termId ?? ""}`;
  const query = useSettled<SameSlotQuery>(
    { days, start, end, excludeId, skipIds: skipKey ? skipKey.split(",") : [], courseId, sectionId, termId, codeOf: (id) => courseOf(id)?.CourseCode },
    queryKey,
  );

  /* المقرن: تداخلٌ (لا تطابقٌ تام) مع مقرر الموعد التوأم، ومعه: هل بقيت شعبةٌ بديلة؟ */
  const pairs = useCoreqPairs(collegeId, sectionId);
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
    }));
  }, [pairs, courseId, sectionId, scode, termId, rows, query, excludeId]);

  /* ما يرويه بطاقةُ المقرن لا يُعاد في قائمة «الوقت نفسه». */
  const twinIds = useMemo(() => twins.flatMap(twin => twin.overlapRowIds).map(String), [twins]);
  /* الصفوف تتجدد حياً؛ الاستعلام وحده يُؤخَّر. */
  const result: SameSlotResult<R> = useMemo(() => sameSlotOf<R>(rows, { ...query, skipIds: [...(query.skipIds || []), ...twinIds], codeOf: (id) => courseOf(id)?.CourseCode }), [rows, query, twinIds]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [phone, setPhone] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const count = result.count;
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
      const height = sheet.current?.offsetHeight || 260;
      let left = anchor.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = anchor.bottom + 8;
      if (top + height > window.innerHeight - 8) top = Math.max(8, anchor.top - height - 8);
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, count, twinCount]);

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

  const capped = capSameSlot(result.days, 6);
  const anyLevel = result.days.some(day => day.items.some(item => item.sameLevel));
  const several = result.days.length > 1;
  const chosenLabels = SLOT_DAYS.filter(day => days.includes(day.key)).map(day => day.label);
  const dayWords = result.days.length && (days.length === 1 || !several)
    ? result.days[0].label
    : (several ? result.days : chosenLabels.map(label => ({ label }))).map(day => day.label).join(" · ");
  const label = [count ? `${countOf(count, AR.course)} في الوقت نفسه` : "", twinCount ? "مقرن متداخل" : ""].filter(Boolean).join("، ");
  const timeText = formatScheduleTimeRange(start, end);
  const ownName = courseOf(Number(courseId))?.CourseName || "هذا المقرر";
  const segments = capped.days.flatMap(day => day.items)
    .filter((item, index, list) => list.findIndex(other => String(other.row.id) === String(item.row.id)) === index).slice(0, 6);

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
        style={!phone && pos ? { left: pos.left, top: pos.top } : undefined}
      >
        <header className="same-slot-head">
          <span className="same-slot-mark" aria-hidden="true"><Layers /></span>
          <strong id={titleId}>{dayWords} · <bdi dir="ltr">{timeText}</bdi></strong>
          <button type="button" className="same-slot-close" aria-label="إغلاق" data-guide-ignore="يطوي الورقة؛ لا يحفظ شيئاً" onClick={() => { setOpen(false); button.current?.focus({ preventScroll: true }); }}>
            <X aria-hidden="true" />
          </button>
        </header>
        {count ? <>
        <div className="same-slot-bar" aria-hidden="true">
          {segments.map((item, index) => (
            <i key={`${item.row.id}-${index}`} style={{ background: `hsl(${hueOf(Number(item.row.AdCourseId) || index)} 48% 56%)` }} />
          ))}
        </div>
        {anyLevel ? <p className="same-slot-legend"><GraduationCap aria-hidden="true" />نفس المستوى — الطلاب أنفسهم غالباً</p> : null}
        <div className="same-slot-body">
          {capped.days.map(day => (
            <section key={day.day} className="same-slot-day" aria-label={day.label}>
              {several ? <h4>{day.label}</h4> : null}
              <ul>
                {day.items.map(({ row, sameLevel }, index) => {
                  const course = courseOf(Number(row.AdCourseId));
                  const name = row.AdCourseName || course?.CourseName || "موعد آخر";
                  const who = instructorName && row.AdInstructorId ? instructorName(Number(row.AdInstructorId)) : "";
                  const hue = hueOf(Number(row.AdCourseId) || index);
                  return (
                    <li key={`${row.id}-${day.day}`} className={sameLevel ? "is-level" : undefined} style={{ ["--ss-hue" as any]: hue }}>
                      <span className="same-slot-icon" aria-hidden="true"><BookOpen /></span>
                      <span className="same-slot-main">
                        <b>{name}</b>
                        <small>
                          {course?.CourseCode ? <bdi dir="ltr">{course.CourseCode}</bdi> : null}
                          {who ? <span className="same-slot-who"><UserRound aria-hidden="true" />{who}</span> : null}
                        </small>
                      </span>
                      {row.SCode ? <span className="same-slot-chip">شعبة <bdi dir="ltr">{row.SCode}</bdi></span> : null}
                      {sameLevel ? <span className="same-slot-level" title="نفس المستوى" role="img" aria-label="نفس المستوى"><GraduationCap /></span> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
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

/**
 * التوأم: عقدتان (هذا المقرر ومقرنه) يصل بينهما رابط، وشريطان رفيعان بمحور واحد:
 * الأخضر الهادئ وقتٌ خالٍ والعنبريُّ تداخل. سطرٌ واحد يقول: مقرنه — وهل بقيت شعبةٌ بديلة.
 * النصُّ البديلُ كاملٌ لقارئ الشاشة، فلا يقوم المعنى على اللون وحده.
 */
function TwinNode({ twin, own, courseOf }: {
  twin: { partnerCourseId: number; alternative: boolean; row?: SlotRow & { AdCourseName?: string } };
  own: { name: string; start: string; end: string };
  courseOf: (courseId: number) => CourseLite | undefined;
}) {
  const partnerName = twin.row?.AdCourseName || courseOf(twin.partnerCourseId)?.CourseName || "مقرنه";
  const a0 = slotMinutes(own.start), a1 = slotMinutes(own.end);
  const b0 = slotMinutes(twin.row?.fstarttime), b1 = slotMinutes(twin.row?.fendtime);
  const ok = [a0, a1, b0, b1].every(Number.isFinite);
  const lo = ok ? Math.min(a0, b0) : 0, hi = ok ? Math.max(a1, b1) : 1, span = Math.max(1, hi - lo);
  const pct = (value: number) => ((value - lo) / span) * 100;
  const o0 = ok ? Math.max(a0, b0) : 0, o1 = ok ? Math.min(a1, b1) : 0;
  const bar = (from: number, to: number) => (
    <div className="twin-track" aria-hidden="true">
      <i className="is-free" style={{ insetInlineStart: `${pct(from)}%`, width: `${Math.max(2, pct(to) - pct(from))}%` }} />
      {o1 > o0 ? <i className="is-overlap" style={{ insetInlineStart: `${pct(o0)}%`, width: `${Math.max(2, pct(o1) - pct(o0))}%` }} /> : null}
    </div>
  );
  const verdict = twin.alternative ? "توجد شعبة بديلة" : "لا بديل";
  const spoken = `مقرنه ${partnerName} يتداخل في الوقت. ${verdict}.`;
  return (
    <section className={`twin-card${twin.alternative ? " has-alt" : " no-alt"}`} role="group" aria-label={spoken}>
      <div className="twin-nodes" aria-hidden="true">
        <span className="twin-node"><BookOpen /><b>{own.name}</b></span>
        <span className="twin-link"><Link2 /></span>
        <span className="twin-node"><BookOpen /><b>{partnerName}</b></span>
      </div>
      {ok ? (
        <div className="twin-bars" aria-hidden="true">
          {bar(a0, a1)}
          {bar(b0, b1)}
        </div>
      ) : null}
      <p className="twin-line">
        {twin.alternative ? <CheckCircle2 aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}
        <span>مقرنه</span><em>·</em><strong>{verdict}</strong>
      </p>
    </section>
  );
}
