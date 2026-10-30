import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AlertTriangle, BookOpen, Building2, Calculator, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, Clock3, History, Info, Printer, TrendingUp, UserRound, Wrench, X } from "lucide-react";
import type { AdCollege, AdCourse, AdInstructor, FSchedule } from "../types";
import { PrintLetterhead, PrintPortal, PrimaryButton, SecondaryButton, useDialogDismiss } from "./ui";
import VisitingBadge, { VISITING_SUFFIX, withVisitingSuffix } from "./VisitingBadge";
import PagedFindingList from "./PagedFindingList";
import { packPrintFindings, type PrintFindingPiece } from "../utils/printFindingPages";
import {
  DAY_KEYS, DAY_NAMES, DECISION_1912_LABEL, isDecision1912Finding, periodBalanceSnapshot, PERIOD_BALANCE_MIN_SECTIONS, reviewSchedule,
  type DayKey, type RegulationFinding
} from "../utils/scheduleRegulations";
import type { CourseNature } from "../utils/courseNature";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { blockingRowIds, describeWarnings, doubleEntryCount, placeholderInstructorIds, readScopeConflicts, type ReviewBlocker } from "../utils/scheduleBlockers";
import { blockingSummaryPhrase } from "../utils/approvalWorkflow";
import { roomIdentityKey, roomDisplay } from "../utils/locationRegistry";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { rowsInApprovalScope } from "../utils/approvalScope";
import { approvalScoreBreakdown } from "../utils/approvalScore";
import { showPwaPrintHelp } from "../utils/pwaPrintHelp";
import CourseTags from "./CourseTags";
import PeriodBalanceInfographic from "./PeriodBalanceInfographic";
import { ReachReviewNotes } from "./CourseReach";
import { shortCourseCode } from "../utils/courseReach";

/**
 * The last read before a schedule is adopted.
 *
 * Everything the product knows how to check, run at once against the whole
 * term, and reported as a single page a department head can sign. It is
 * deliberately a review and not a gate: the regulation is the standard, the
 * department is the authority, and every finding names the article it came from
 * so a coordinator can judge whether the exception is justified rather than
 * simply obeying a red box.
 */

interface Props {
  rows: FSchedule[];
  courses: Map<number, AdCourse>;
  colleges: Map<number, AdCollege>;
  instructors: Map<number, AdInstructor>;
  visitingIds?: Iterable<number>;
  previousRows?: FSchedule[];
  /** What each course has habitually been, learned from every term on record. */
  nature?: Map<number, CourseNature> | null;
  scopeLine: string;
  collegeId: number;
  sectionId: number;
  termId: number;
  meeting?: { day: DayKey; from: string; to: string } | null;
  onClose: () => void;
  onFocusRows?: (ids: number[]) => void;
}

type ReviewFindingGroup = RegulationFinding & {
  groupKey: string;
  groupedItems: RegulationFinding[];
  groupedCount: number;
};

/**
 * The title without the count it carries.
 *
 * A rule that fires on five appointments titles itself «خارج المعتاد تاريخياً (5)»,
 * and one that fires on two titles itself «… (2)». Both are the same finding, but
 * the count was part of the grouping key — so the review listed the same heading
 * three and four times, each with its own little number, and the reader had to
 * add them up. The number belongs to the group, not to its name.
 */
const findingBaseTitle = (title: string) =>
  String(title || "").replace(/\s*\([\d\u0660-\u0669\u06F0-\u06F9\u066B\u066C,،\s]+\)\s*$/u, "").trim();

const groupFindingKey = (finding: RegulationFinding) =>
  [finding.approvalEffect, finding.source, finding.article, findingBaseTitle(finding.title)].join("::");

/**
 * A material blocker is what canSign refuses: a teacher or a room in two places
 * at once, or the same entry twice. Everything else — the decision's articles,
 * an unfinished row — wants treatment but does not stop a signature, so it is
 * never listed under «يوجد ما يمنع الاعتماد» (I2).
 */
const MATERIAL_BLOCKER_ARTICLE = "موانع الحفظ";
const isMaterialFinding = (finding: RegulationFinding) =>
  finding.source === "readiness" && finding.approvalEffect === "block" && finding.article === MATERIAL_BLOCKER_ARTICLE;

const findingStatus = (finding: RegulationFinding) => {
  if (isMaterialFinding(finding)) return "مانع اعتماد";
  if (finding.approvalEffect === "block") return "يحتاج معالجة";
  if (finding.source === "decision-1912") return finding.approvalEffect === "review" ? "مراجعة لائحية" : "ملاحظة لائحية";
  if (finding.source === "history") return "سياق تاريخي";
  if (finding.source === "department") return "سياسة القسم";
  return "مراجعة";
};

/** Visual tone follows what the finding does to a signature, not its analytical severity. */
const findingTone = (finding: RegulationFinding): "high" | "medium" | "low" =>
  isMaterialFinding(finding) ? "high" : finding.approvalEffect === "block" || finding.approvalEffect === "review" ? "medium" : "low";
const findingIcon = (finding: RegulationFinding) => {
  const tone = findingTone(finding);
  return tone === "high" ? <AlertTriangle /> : tone === "medium" ? <Info /> : <CheckCircle2 />;
};

/**
 * One person, once — with their sections folded beneath.
 *
 * A single lecturer can trip a finding in six sections, and printing the name
 * six times turned a list of people into a list of rows. This shows the name and
 * how many times it recurs; pressing it reveals exactly which sections, so the
 * reader sees who first and the detail only when they ask for it.
 */
/* أول يومٍ في الأسبوع ثم ساعة البدء — قراءةُ الأستاذ لأسبوعه، لا ترتيبُ الإدخال. */
const firstDayIndex = (row: FSchedule) => { const i = DAY_KEYS.findIndex(key => (row as any)[key]); return i < 0 ? DAY_KEYS.length : i; };
const byWeekTime = (a: FSchedule, b: FSchedule) =>
  firstDayIndex(a) - firstDayIndex(b) || String(a.fstarttime || "").localeCompare(String(b.fstarttime || "")) || String(a.SCode || "").localeCompare(String(b.SCode || ""));

function ReviewPersonGroup({ group, courses, colleges, visitingIds }: { group: { who: string; rows: FSchedule[] }; courses: Map<number, AdCourse>; colleges: Map<number, AdCollege>; visitingIds: Set<number> }) {
  const who = group.who;
  const rows = React.useMemo(() => [...group.rows].sort(byWeekTime), [group.rows]);
  const visiting = rows.some(row => visitingIds.has(Number(row.AdInstructorId)));
  const sectionCount = new Set(rows.map(row => `${row.AdCourseId}:${row.SCode}`)).size;
  // Presentation-only grouping: same rows, same finding, grouped for reading.
  const courseGroups = React.useMemo(() => {
    const grouped = new Map<number, FSchedule[]>();
    rows.forEach(row => grouped.set(Number(row.AdCourseId), [...(grouped.get(Number(row.AdCourseId)) || []), row]));
    return [...grouped.entries()].map(([courseId, items]) => {
      const course = courses.get(courseId);
      return {
        courseId,
        code: course?.CourseCode || items[0]?.AdCourseName || "—",
        name: course?.CourseName || items[0]?.AdCourseName || "مقرر غير مسمى",
        college: course ? colleges.get(Number(course.AdCollegeId))?.AdCollegeName || "" : "",
        sectionCount: new Set(items.map(row => String(row.SCode))).size,
        days: DAY_KEYS.map((key, index) => ({
          key, title: DAY_NAMES[index],
          appointments: items.filter(row => Boolean((row as any)[key]))
            .sort((a, b) => String(a.fstarttime || "").localeCompare(String(b.fstarttime || ""))),
        })).filter(item => item.appointments.length > 0),
        withoutDay: items.filter(row => !DAY_KEYS.some(day => Boolean((row as any)[day]))),
      };
    });
  }, [rows, courses, colleges]);
  return (
    <details className="review-person">
      <summary className="review-person-head" data-guide-ignore="طيّ شعب أستاذ داخل ملاحظة مراجعة — عرض فقط، لا يغيّر الجدول">
        <span className="review-person-avatar" aria-hidden="true"><UserRound /></span>
        <span className="review-person-identity">
          <strong className="schedule-instructor-with-badge">{who}{visiting ? <VisitingBadge compact /> : null}</strong>
          <small><BookOpen aria-hidden="true" /> {countOf(courseGroups.length, AR.course)} <span aria-hidden="true">·</span> {countOf(sectionCount, AR.section)}</small>
        </span>
        <span className="review-person-count">{countOf(sectionCount, AR.section)}</span>
        <ChevronDown className="review-person-chevron" aria-hidden="true" />
      </summary>
      <div className="review-person-rows review-course-deck">
          {courseGroups.map(course => (
            <section key={course.courseId} className="review-course-card" aria-label={course.name}>
              <header className="review-course-heading">
                <span className="review-course-glyph" aria-hidden="true"><BookOpen /></span>
                <span className="review-course-identity">
                  <strong>{course.name}</strong>
                  <small dir="ltr">{course.code}</small>
                  {course.college ? <small className="review-course-college">{course.college}</small> : null}
                </span>
                <span className="review-course-count">{countOf(course.sectionCount, AR.section)}</span>
              </header>
              <div className="review-course-days">
                {course.days.map(day => (
                  <div className="review-course-day" key={day.key}>
                    <span className="review-day-label"><CalendarDays aria-hidden="true" /> {day.title}</span>
                    <div className="review-slot-flow" role="list" aria-label={`مواعيد ${day.title}`}>
                      {day.appointments.map(row => (
                        <span className="review-slot" role="listitem" key={row.id}>
                          <b>شعبة {row.SCode || "—"}</b>
                          <time dir="ltr"><Clock3 aria-hidden="true" />{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</time>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {course.withoutDay.map(row => (
                  <div className="review-course-day" key={row.id}>
                    <span className="review-day-label">بلا أيام</span>
                    <span className="review-slot"><b>شعبة {row.SCode || "—"}</b></span>
                  </div>
                ))}
              </div>
            </section>
          ))}
      </div>
    </details>
  );
}

function HistoryInfographic({rows,courses}:{rows:FSchedule[];courses:Map<number,AdCourse>}){
  const distinctCourses=new Set(rows.map(row=>row.AdCourseId)).size;
  return <div className="history-review-infographic">
    <div className="history-review-kpis"><article><History/><strong>10+</strong><span>سنوات في السجل</span></article><article><ClipboardCheck/><strong>{rows.length.toLocaleString("ar-KW-u-nu-latn")}</strong><span>{nounFor(rows.length, AR.appointment)} {nounFor(rows.length, AR.differentAdj)}</span></article><article><CalendarDays/><strong>{distinctCourses.toLocaleString("ar-KW-u-nu-latn")}</strong><span>{nounFor(distinctCourses, AR.course)} {nounFor(distinctCourses, AR.affectedAdj)}</span></article></div>
    <PagedFindingList items={rows} pageSize={8} label="المواعيد المختلفة عن المعتاد" listClassName="history-review-cards"
      getKey={row=>String(row.id)}
      searchText={row=>{const course=courses.get(row.AdCourseId);return `${course?.CourseName||row.AdCourseName||""} ${course?.CourseCode||""} ${row.SCode}`;}}
      renderItem={row=>{
      const course=courses.get(row.AdCourseId),dayText=DAY_KEYS.filter(key=>(row as any)[key]).map(key=>DAY_NAMES[DAY_KEYS.indexOf(key)]).join(" · ");
      return <article><span className="history-review-icon"><Clock3/></span><div><strong>{course?.CourseName||row.AdCourseName||"مقرر"}<CourseTags courseId={row.AdCourseId} /></strong><small><b dir="ltr">{course?.CourseCode||"—"}</b> · شعبة {row.SCode}</small></div><time dir="ltr">{formatScheduleTimeRange(row.fstarttime,row.fendtime)}</time><p><CalendarDays/>{dayText||"بلا أيام"}<Building2/>{row.AdRoomCode}/{row.AdRoomHall}</p></article>;
    }} />
  </div>;
}

/** What the server read for the whole department family (all its colleges). */
interface FamilyReading {
  rows: FSchedule[];
  previousRows: FSchedule[];
  nature: Record<string, CourseNature>;
  courses: AdCourse[];
  instructors: AdInstructor[];
  members?: Array<{ collegeId: number; sectionId: number }>;
}

export default function ScheduleReview({ rows: rowsProp, courses: coursesProp, colleges, instructors: instructorsProp, visitingIds, previousRows: previousRowsProp, nature: natureProp, scopeLine, collegeId, sectionId, termId, meeting, onClose, onFocusRows }: Props) {
  /* ── القسمُ واحدٌ في كلياته ────────────────────────────────────────────────
     «تكنولوجيا التعليم» بنين وبنات قسمٌ واحد، وأساتذته يدرّسون فيهما معاً. فمن
     فتح أيَّ العضوين رأى التقريرَ نفسه: مواعيدُ العائلة كلها وحِملُ الأستاذ
     كاملاً. ما دام الخادم لم يردّ، أو تعذّر، فالنطاقُ المحلّي (كلية + قسم) هو
     البديل. الاعتمادُ والحفظ يبقيان لكل كليةٍ على حدة. */
  const [family, setFamily] = useState<FamilyReading | null>(null);
  const localRows = useMemo(() => rowsInApprovalScope(rowsProp, { collegeId, sectionId, termId }), [rowsProp, collegeId, sectionId, termId]);
  const rows = family?.rows ?? localRows;
  const courses = useMemo(() => {
    if (!family) return coursesProp;
    const merged = new Map(coursesProp);
    family.courses.forEach(course => { if (!merged.has(Number(course.AdCourseId))) merged.set(Number(course.AdCourseId), course); });
    return merged;
  }, [family, coursesProp]);
  const instructors = useMemo(() => {
    if (!family) return instructorsProp;
    const merged = new Map(instructorsProp);
    family.instructors.forEach(person => { if (!merged.has(Number(person.AdInstructorId))) merged.set(Number(person.AdInstructorId), person); });
    return merged;
  }, [family, instructorsProp]);
  /* ── لا خلط بين الكليات (I3) ─────────────────────────────────────────────
     العائلة تُقرأ لسببٍ واحد: حِملُ الأستاذ الذي يدرّس في بنين وبنات معاً
     (التتابع م.6/2،3). أمّا الدرجة والموانع وملاحظات المقرر والشعبة فتُحسب
     لمواعيد الكلية المفتوحة وحدها — هي ما يُوقَّع عليه. والرأس يقول ذلك صراحةً. */
  const scopeRows = useMemo(
    () => (family ? rows.filter(row => Number(row.AdCollegeId) === Number(collegeId) && Number(row.AdSectionId) === Number(sectionId)) : rows),
    [family, rows, collegeId, sectionId],
  );
  const scopeIds = useMemo(() => new Set(scopeRows.map(row => Number(row.id))), [scopeRows]);
  const otherColleges = family ? Math.max(0, (family.members?.length || 1) - 1) : 0;
  const scopeLabel = scopeLine;
  const familyNote = otherColleges > 0
    ? `الدرجة والموانع لهذه الكلية وحدها · حِمل الأستاذ المشترك يُقرأ مع ${countOf(otherColleges, AR.college)} أخرى من القسم`
    : "";
  const loadedIds = useMemo(() => new Set(localRows.map(row => row.id)), [localRows]);
  const previousRows = family?.previousRows ?? previousRowsProp;
  const nature = useMemo(
    () => (family ? new Map(Object.entries(family.nature || {}).map(([id, value]) => [Number(id), value as CourseNature])) : natureProp),
    [family, natureProp]
  );
  const visitingIdSet = useMemo(() => new Set(Array.from(visitingIds || [], Number).filter(Boolean)), [visitingIds]);
  const baseFindings = useMemo(
    () => reviewSchedule({ rows, courses, instructors, previousRows, meeting, nature }),
    [rows, courses, instructors, previousRows, meeting, nature]
  );
  const decisionFindings = useMemo(() => baseFindings.filter(isDecision1912Finding), [baseFindings]);
  const periodBalance = useMemo(() => periodBalanceSnapshot(rows), [rows]);
  const [serverBlockers, setServerBlockers] = useState<Array<{id:string;type:string;title:string;detail:string;rowIds:number[];subjectKey?:string;subjectLabel?:string}>>([]);
  /* What the same reading says without counting it: the same section in two
     halls or with two teachers (قاعدة المالك 2026-09-27). */
  const [serverWarnings, setServerWarnings] = useState<ReviewBlocker[]>([]);
  /* The bar's two numbers, as the server read them for the same scope. */
  const [serverSummary, setServerSummary] = useState<{ conflicts: number; rows: number; duplicates: number } | null>(null);
  const [readinessChecked, setReadinessChecked] = useState(false);
  /* عرضٌ فقط: هل رأى هذا الفتحُ «أتحقق…» ثم صار نتيجة؟ — لإبراز العنوان مرّةً واحدة. لا يدخل في منطق الحكم. */
  const sawChecking = useRef(false);
  if (!readinessChecked) sawChecking.current = true;
  const [readinessError, setReadinessError] = useState(false);
  const [quietOpen, setQuietOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  useDialogDismiss(true, onClose);

  useEffect(() => {
    if (!collegeId || !sectionId || !termId) { setFamily(null); setServerBlockers([]); setServerWarnings([]); setReadinessChecked(true); setReadinessError(true); return; }
    const controller = new AbortController();
    /* ما قرأه الخادم لنطاقٍ سابق لا يبقى معروضاً تحت النطاق الجديد. */
    setFamily(null); setServerBlockers([]); setServerWarnings([]); setServerSummary(null);
    setReadinessChecked(false);
    setReadinessError(false);
    void fetch(`/api/schedules/review-readiness?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}&family=1`, { credentials: "include", signal: controller.signal })
      .then(async response => response.ok ? response.json() : Promise.reject(new Error("readiness")))
      .then(data => {
        setFamily(data?.family && Array.isArray(data.family.rows) ? data.family as FamilyReading : null);
        setServerBlockers(Array.isArray(data?.blockers) ? data.blockers : []);
        setServerWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
        setServerSummary({ conflicts: Number(data?.blockingConflicts || 0), rows: Number(data?.blockingRows || 0), duplicates: Number(data?.blockingDuplicates || 0) });
      })
      .catch(error => { if (error?.name !== "AbortError") { setServerBlockers([]); setServerWarnings([]); setReadinessError(true); } })
      .finally(() => { if (!controller.signal.aborted) setReadinessChecked(true); });
    return () => controller.abort();
  }, [collegeId, sectionId, termId, localRows]);

  /* The offline fallback reads the same rule the server does — «هيئة تدريسية»
     included — so losing the network never changes what counts as a blocker.
     One sweep, both halves: what blocks, and what is only said. */
  const localReading = useMemo(() => readScopeConflicts(rows, rows, { placeholderInstructorIds: placeholderInstructorIds(instructors.values()) }), [rows, instructors]);
  const localConflicts = localReading.blocking;
  const localWarnings = useMemo(() => describeWarnings(localReading.warnings, rows, rows, {
    courseName: new Map([...courses.values()].map(course => [Number(course.AdCourseId), String(course.CourseCode || course.CourseName || "")] as [number, string])),
  }), [localReading, rows, courses]);
  const localBlockers = useMemo(() => localConflicts
    .map(item => ({
      id: `local-conflict:${[item.rowId, item.otherId].sort((a, b) => a - b).join(":")}`,
      type: item.type,
      title: item.message,
      detail: item.detail,
      rowIds: [Number(item.rowId), Number(item.otherId)].filter(Boolean),
    })), [localConflicts]);
  const serverRead = readinessChecked && !readinessError;
  /* Only the opened college's feet of each conflict: a clash that lives wholly
     in a sister college is that college's to sign, not this one's (I3). */
  const activeBlockers = useMemo(() => (serverRead ? serverBlockers : localBlockers)
    .map(item => ({ ...item, rowIds: (Array.isArray(item.rowIds) ? item.rowIds : []).map(Number).filter(id => scopeIds.has(id)) }))
    .filter(item => item.rowIds.length > 0), [serverRead, serverBlockers, localBlockers, scopeIds]);
  const activeWarnings = serverRead ? serverWarnings : localWarnings;
  void activeWarnings;
  /* The headline is the ApprovalBar's: blocking conflicts (pairs), then the
     appointments they touch — read from the same scoped list as the cards. */
  const blockerSummary = useMemo(() => {
    if (!family && serverRead && serverSummary) return serverSummary;
    if (!family && !serverRead) return { conflicts: localConflicts.length, rows: blockingRowIds(localConflicts, rows).length, duplicates: doubleEntryCount(localConflicts) };
    const conflicts = activeBlockers.filter(item => !String(item.type || "").startsWith("hallBarter"));
    return {
      conflicts: conflicts.length,
      rows: new Set(conflicts.flatMap(item => item.rowIds)).size,
      duplicates: conflicts.filter(item => item.type === "duplicate").length,
    };
  }, [family, serverRead, serverSummary, localConflicts, rows, activeBlockers]);

  const blockerFindings = useMemo<RegulationFinding[]>(() => activeBlockers.map((item, index) => ({
    rule: item.id || `approval-blocker-${index}`,
    article: MATERIAL_BLOCKER_ARTICLE,
    severity: "high",
    source: "readiness",
    approvalEffect: "block",
    title: item.title || "يوجد مانع اعتماد",
    detail: item.detail || "راجع الموعد قبل الاعتماد.",
    subjectKey: item.subjectKey,
    subjectLabel: item.subjectLabel,
    rowIds: Array.isArray(item.rowIds) ? item.rowIds.map(Number).filter(Boolean) : [],
  })), [activeBlockers]);
  /* ── يُقال ولا يمنع ────────────────────────────────────────────────────
     الشعبة نفسها مسجّلة مرتين في قاعتين أو بأستاذين: ليست تعارضاً مادّياً
     فلا تدخل «يمنع الاعتماد»، ولا تُسكَت — بندٌ «للمراجعة» بجانب الموانع. */
  const warningFindings = useMemo<RegulationFinding[]>(() => activeWarnings.map((item, index) => ({
    rule: item.id || `section-twice-${index}`,
    article: "لا يمنع الاعتماد",
    severity: "medium",
    source: "readiness",
    approvalEffect: "review",
    title: item.title || "الشعبة نفسها مسجّلة مرتين في الوقت نفسه",
    detail: item.detail || "",
    subjectKey: item.subjectKey,
    subjectLabel: item.subjectLabel,
    rowIds: Array.isArray(item.rowIds) ? item.rowIds.map(Number).filter(Boolean) : [],
  })), [activeWarnings]);
  /* Scoped to the opened college (I3). An instructor-load finding keeps its
     sister-college feet as context — the same person teaches both — but only
     appears when this college is one of them. */
  const inScope = React.useCallback((finding: RegulationFinding): RegulationFinding | null => {
    const crossCollege = finding.rule.startsWith("consecutive-");
    const touched = finding.rowIds.filter(id => scopeIds.has(Number(id)));
    if (!touched.length) return null;
    return crossCollege ? finding : { ...finding, rowIds: touched };
  }, [scopeIds]);
  const readinessFindings = useMemo(() => baseFindings.filter(finding => finding.source === "readiness").map(inScope).filter(Boolean) as RegulationFinding[], [baseFindings, inScope]);
  const regulationFindings = useMemo(() => decisionFindings.filter(finding => finding.approvalEffect === "block").map(inScope).filter(Boolean) as RegulationFinding[], [decisionFindings, inScope]);
  // Approval reads in a predictable order: material blockers (what canSign
  // refuses), then the decision's findings that need treatment. Only the first
  // shelf is «يوجد ما يمنع الاعتماد» (I2).
  const findings = useMemo(
    () => [...blockerFindings, ...readinessFindings.filter(finding => finding.approvalEffect === "block"), ...regulationFindings],
    [blockerFindings, readinessFindings, regulationFindings]
  );
  const unclassifiedCourses = useMemo(() => new Set(scopeRows.filter(row => {
    const course = courses.get(Number(row.AdCourseId));
    const hours = Number(course?.CourseHours || course?.CourseCredit || 0);
    return (hours === 3 || hours === 4) && !course?.CourseTeachingMode;
  }).map(row => Number(row.AdCourseId))).size, [scopeRows, courses]);
  const groupedFindings = useMemo<ReviewFindingGroup[]>(() => {
    const buckets = new Map<string, { base: RegulationFinding; items: RegulationFinding[]; rowIds: Set<number> }>();
    for (const finding of findings) {
      const key = groupFindingKey(finding);
      const bucket = buckets.get(key) || { base: finding, items: [], rowIds: new Set<number>() };
      bucket.items.push(finding);
      finding.rowIds.forEach(id => bucket.rowIds.add(id));
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].map(([groupKey, bucket]) => ({
      ...bucket.base,
      title: findingBaseTitle(bucket.base.title) || bucket.base.title,
      groupKey,
      rowIds: [...bucket.rowIds],
      groupedItems: bucket.items,
      groupedCount: bucket.items.length,
      detail: bucket.items.length > 1 ? `جُمع هنا ${countOf(bucket.items.length, AR.conflict)} ${nounFor(bucket.items.length, AR.similarAdj)} في بند واحد.` : bucket.base.detail,
    }));
  }, [findings]);
  /* سُلّمُ البدايات وأطوالُ المكتبة (المالك 2026-10-30): تنبيهٌ لائحيّ لا يمنع الاعتماد ولا يُنقص الدرجة. يُرى في سطر
     الملاحظات مع غيره، فيعرف القسمُ مواعيدَه القائمة خارج السُّلّم وإن كان الحفظُ يمرّ بها تنبيهاً. */
  const ladderNotes = useMemo<ReviewFindingGroup[]>(() => {
    const items = decisionFindings.filter(finding => finding.rule === "regulation-ladder").map(inScope).filter(Boolean) as RegulationFinding[];
    if (!items.length) return [];
    const rowIds = [...new Set(items.flatMap(item => item.rowIds))];
    return [{
      ...items[0], title: "خارج سُلّم اللائحة", groupKey: "regulation-ladder", rowIds, groupedItems: items, groupedCount: items.length,
      detail: items.map(item => item.detail).slice(0, 3).join("؛ ") + (items.length > 3 ? `؛ و${countOf(items.length - 3, AR.course)} غيرها` : ""),
    }];
  }, [decisionFindings, inScope]);
  /* What actually stops a signature: the material conflicts canSign refuses. */
  const blocking = findings.filter(isMaterialFinding);
  const regulationGroups = useMemo(() => groupedFindings.filter(finding => !isMaterialFinding(finding)), [groupedFindings]);

  /**
   * The score, traceable (I2): one formula, one ring cut by category, and for
   * each category the score it would leave behind once fixed.
   */
  const breakdown = useMemo(() => approvalScoreBreakdown(
    scopeRows.map(row => Number(row.id)),
    [
      ...(blocking.length ? [{ key: "material", label: "تعارض مادّي", tone: "block" as const, rowIds: blocking.flatMap(finding => finding.rowIds) }] : []),
      ...regulationGroups.map(group => ({ key: group.groupKey, label: group.title, tone: "regulation" as const, rowIds: group.rowIds })),
    ],
  ), [scopeRows, blocking, regulationGroups]);
  const score = breakdown.score;

  /**
   * The schedule as a bar rather than a list.
   *
   * Every appointment of the opened college is counted once, at the worst thing
   * said about it, so the bar adds up to the schedule itself.
   */
  const spread = useMemo(() => {
    const high = breakdown.segments.filter(segment => segment.tone === "block").reduce((sum, segment) => sum + segment.count, 0);
    const medium = breakdown.segments.filter(segment => segment.tone === "regulation").reduce((sum, segment) => sum + segment.count, 0);
    return { high, medium, low: 0, clean: breakdown.clean, total: Math.max(1, breakdown.total) };
  }, [breakdown]);
  const share = (value: number) => `${(value / spread.total) * 100}%`;
  const spreadLabel = {
    high: `${countOf(spread.high, AR.appointment)} ${nounFor(spread.high, AR.blockVerb)} الاعتماد`,
    medium: `${countOf(spread.medium, AR.appointment)} للمعالجة`,
    low: countOf(spread.low, AR.note),
    clean: `${countOf(spread.clean, AR.appointment)} ${nounFor(spread.clean, AR.soundAdj)}`,
  };
  const tone = blocking.length ? "danger" : score >= 85 ? "good" : "warn";
  const scoreTone = score >= 85 ? "good" : score >= 70 ? "warn" : "danger";
  // A ring drawn as a single arc: circumference 100 makes the maths the score.
  const ringLength = 2 * Math.PI * 26;
  /* The on-screen ring is cut by category: each slice is the appointments that
     category is first to touch; the green part is the score itself. */
  const ringSlices = useMemo(() => {
    let offset = 0;
    const slices: Array<{ key: string; tone: string; length: number; offset: number; label: string }> = [];
    const push = (key: string, toneName: string, count: number, label: string) => {
      if (!count) return;
      const length = (count / Math.max(1, breakdown.total)) * ringLength;
      slices.push({ key, tone: toneName, length, offset, label });
      offset += length;
    };
    push("clean", "clean", breakdown.clean, "سليم");
    breakdown.segments.forEach((segment, index) => push(segment.key, segment.tone === "block" ? "block" : `reg-${index % 4}`, segment.count, segment.label));
    return slices;
  }, [breakdown, ringLength]);

  const byId = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows]);

  /* نصوص الملاحظات (عناوين وتفاصيل وعناوين الحالات) تحمل أسماء الأساتذة مدموجةً في جُمل جاهزة من الخادم
     أو من المحرّك المحلي، فلا تُرسم شارةً بل تُلحق اللاحقةَ النصيةَ بكل اسمٍ لمنتدبٍ بين صفوف الملاحظة. */
  const markVisitingNames = (text: string, rowIds: number[]) => {
    let out = String(text || "");
    if (!out || !visitingIdSet.size) return out;
    const names = new Set<string>();
    for (const id of rowIds || []) {
      const row = byId.get(id);
      if (!row || !visitingIdSet.has(Number(row.AdInstructorId))) continue;
      const name = instructors.get(row.AdInstructorId)?.AdInstructorName;
      if (name) names.add(name);
    }
    const all = [...names];
    all.filter(name => !all.some(other => other !== name && other.includes(name)))
      .forEach(name => { if (!out.includes(`${name}${VISITING_SUFFIX}`)) out = out.split(name).join(`${name}${VISITING_SUFFIX}`); });
    return out;
  };

  const groupEntitySummary = (finding: ReviewFindingGroup) => {
    const affectedRows = finding.rowIds.map(id => byId.get(id)).filter(Boolean) as FSchedule[];
    if (finding.title.includes("أستاذ")) {
      const names = [...new Set(affectedRows.map(row => withVisitingSuffix(instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ", visitingIdSet.has(Number(row.AdInstructorId)))))];
      if (names.length === 1) return names[0];
      if (names.length > 1) return `أساتذة ${names.length.toLocaleString("ar-KW-u-nu-latn")}`;
    }
    if (finding.title.includes("قاعة")) {
      const rooms = [...new Map(affectedRows.map(row => [roomIdentityKey(row), roomDisplay(row)] as const).filter(([key])=>Boolean(key))).values()];
      if (rooms.length === 1) return `القاعة ${rooms[0]}`;
      if (rooms.length > 1) return countOf(rooms.length, AR.room);
    }
    if (finding.source === "history") return "السجل التاريخي";
    if (finding.source === "department") return "سياسة القسم";
    return finding.rowIds.length ? countOf(finding.rowIds.length, AR.appointment) : "تنبيه تشغيلي";
  };

  const findingPreview = (finding: ReviewFindingGroup) => {
    const entity = groupEntitySummary(finding);
    /* ملاحظةُ السُّلّم مجمّعةٌ بالمقرّرات لا بالتعارضات: لا يُقال «٢٧ تعارضاً» عن مواعيد لا تتعارض. */
    if (finding.rule === "regulation-ladder") return `${entity} · ${countOf(finding.groupedCount, AR.course)} · تنبيه لائحي لا يمنع`;
    if (finding.groupedCount > 1) return `${entity} · ${countOf(finding.groupedCount, AR.conflict)}`;
    if (finding.approvalEffect === "block") return `${entity} · يحتاج معالجة قبل الاعتماد`;
    if (finding.source === "decision-1912") return `${entity} · تنبيه لائحي`;
    if (finding.source === "history") return `${entity} · استنتاج تاريخي`;
    return entity;
  };

  const findingExplanation = (finding: ReviewFindingGroup) => {
    if (finding.rule === "consecutive-long-lecture" || finding.rule === "consecutive-one-hour") {
      return "تجاوزت مواعيد العضو الحد المسموح به من الشعب المتتالية في اليوم نفسه. راجع الشعب والمواعيد أدناه.";
    }
    return finding.detail;
  };

  const printReview = React.useCallback(() => {
    if (typeof window === "undefined") return;
    if (showPwaPrintHelp()) return;
    flushSync(() => {});
    const ua = navigator.userAgent || "";
    const isWebKitSafari = /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|Android)/i.test(ua);
    /* Landscape like every other sheet this program prints; Safari cannot be
       told that through `@page`, so it is told through geometry instead. */
    if (isWebKitSafari) document.documentElement.dataset.printRotate = "1";
    let leftForPrint = false;
    let resumed = false;
    const resume = () => {
      if (resumed) return;
      resumed = true;
      window.removeEventListener("afterprint", resume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      delete document.documentElement.dataset.printRotate;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") leftForPrint = true;
      else if (leftForPrint) resume();
    };
    window.addEventListener("afterprint", resume, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    let invoked = false;
    if (!invoked && isWebKitSafari && typeof document.execCommand === "function") {
      try { invoked = document.execCommand("print"); } catch { invoked = false; }
    }
    if (!invoked) window.print();
    window.setTimeout(() => { if (!leftForPrint) resume(); }, 2500);
  }, []);
  const describe = (row?: FSchedule) => {
    if (!row) return "";
    const days = DAY_KEYS.filter(key => (row as any)[key]).map(key => DAY_NAMES[DAY_KEYS.indexOf(key)]).join("، ");
    const code = courses.get(row.AdCourseId)?.CourseCode || row.AdCourseName || "";
    const who = withVisitingSuffix(instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ", visitingIdSet.has(Number(row.AdInstructorId)));
    return `${code} · شعبة ${row.SCode} · ${who} · ${days || "بلا أيام"} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`;
  };

  const renderCompactRows = (rowIds: number[]) => {
    const uniqueRows = [...new Set(rowIds)].map(id => byId.get(id)).filter(Boolean) as FSchedule[];
    if (!uniqueRows.length) return null;
    /* When every row belongs to the same person, the heading above has already
       said so — repeating the name on each line is the same word six times and
       pushes the thing that actually differs (section, days, hour) aside. */
    return (
      <>
        <div className="review-subject-rows">
          {uniqueRows.map(row => {
            const days = DAY_KEYS.filter(key => (row as any)[key]).map(key => DAY_NAMES[DAY_KEYS.indexOf(key)]).join("، ");
            const course = courses.get(row.AdCourseId);
            const code = course?.CourseCode || row.AdCourseName || "—";
            const courseName = course?.CourseName || row.AdCourseName || "مقرر غير مسمى";
            const who = instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ";
            return (
              <article key={`subject-row-${row.id}`} className="review-row-card compact review-identity-row">
                <span className="rrc-code" dir="ltr">{code}</span>
                <div className="rrc-main">
                  <strong className="review-row-course-name">{courseName}</strong>
                  <small className="review-row-owner"><UserRound aria-hidden="true" />{who}{visitingIdSet.has(Number(row.AdInstructorId)) ? <VisitingBadge compact /> : null}</small>
                  <small className="review-row-days"><CalendarDays aria-hidden="true" />شعبة {row.SCode} · {days || "بلا أيام"}</small>
                </div>
                <time className="rrc-time" dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</time>
              </article>
            );
          })}
        </div>
      </>
    );
  };

  /* الورقةُ تطبع كلَّ موعد: تُرصّ الملاحظاتُ بطولها، وما زاد عن صفحةٍ يُكمَل
     بعنوان «تتمة» في التي تليها (printFindingPages). */
  const printPages = packPrintFindings<ReviewFindingGroup>(groupedFindings, finding => finding.rowIds);
  const firstPrintPage = printPages[0] || [];
  const printFollowupPages = printPages.slice(1);
  const renderPrintFinding = ({ finding, rowIds, part, parts }: PrintFindingPiece<ReviewFindingGroup>) => (
    <article className={`print-review-finding severity-${findingTone(finding)}`} key={`${finding.groupKey}:${part}`}>
      <header><b className="print-finding-index">{findingIcon(finding)}</b><div><strong>{markVisitingNames(finding.title, finding.rowIds)}{parts > 1 ? ` · ${part === 1 ? "يتبع" : "تتمة"} (${part.toLocaleString("ar-KW-u-nu-latn")} من ${parts.toLocaleString("ar-KW-u-nu-latn")})` : ""}</strong><span>{finding.groupedCount > 1 ? `${countOf(finding.groupedCount, AR.conflict)} · ${finding.detail}` : finding.detail}</span></div><em>{finding.article}</em><i>{findingStatus(finding)}</i></header>
      {rowIds.length ? <div className="print-review-rows">{rowIds.map(id => <span key={id}>{describe(byId.get(id))}</span>)}</div> : null}
    </article>
  );


  /**
   * Two shelves, because two kinds of finding are being read for two reasons.
   *
   * A block or a review is a question addressed to the reader: it wants a
   * decision before the schedule is adopted. A «ملاحظة» is not — it is the
   * system saying it noticed something and is fine either way. Six of those,
   * each rendered as a full card the height of a real problem, is how a clean
   * schedule ends up looking alarming: the reader scrolls past six tall red-
   * shaped things to reach the one that actually matters.
   *
   * So the notes collapse into a single line that names them and counts them.
   * Nothing is hidden — the line lists what is inside and opens to the exact
   * same cards. Below the threshold they stay expanded, because folding two
   * notes behind a click buys nothing.
   */
  const pressingFindings = groupedFindings.filter(finding => finding.approvalEffect !== "note");
  const quietFindings = [...groupedFindings.filter(finding => finding.approvalEffect === "note"), ...ladderNotes];
  const quietNames = quietFindings.slice(0, 3).map(finding => finding.title).join(" · ");
  const quietPreview = quietFindings.length > 3
    ? `${quietNames} · و${(quietFindings.length - 3).toLocaleString("ar-KW-u-nu-latn")} غيرها`
    : quietNames;
  const quietRows = new Set(quietFindings.flatMap(finding => finding.rowIds)).size;

  /* ── قائمةُ الملاحظة كاملةً، صفحةً صفحة (PagedFindingList) ──────────────
     كانت تعرض اثني عشر أستاذاً ثم تكتفي بعدّ الباقين؛ والآن كلُّهم هنا، ببحثٍ حين
     تطول القائمة، و«أظهرها على الجدول» باقٍ تحتها لمن أراد الجدول. */
  const rowSearchText = (row: FSchedule) => {
    const course = courses.get(row.AdCourseId);
    return `${instructors.get(row.AdInstructorId)?.AdInstructorName || ""} ${course?.CourseCode || ""} ${course?.CourseName || row.AdCourseName || ""} ${row.SCode}`;
  };
  const sectionsOf = (rows: FSchedule[]) => new Set(rows.map(row => `${row.AdCourseId}:${row.SCode}`)).size;

  const renderFindingPeople = (finding: ReviewFindingGroup) => {
    const groups = new Map<string, { who: string; rows: FSchedule[] }>();
    for (const id of new Set(finding.rowIds)) {
      const row = byId.get(id);
      if (!row) continue;
      const who = instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ";
      const key = `${row.AdInstructorId}:${who}`;
      const bucket = groups.get(key) || { who, rows: [] };
      bucket.rows.push(row);
      groups.set(key, bucket);
    }
    const people = [...groups.entries()];
    const allRows = people.flatMap(([, group]) => group.rows);
    return (
      <PagedFindingList
        items={people}
        pageSize={8}
        label={`أساتذة «${findingBaseTitle(finding.title)}»`}
        summary={<><b>{countOf(people.length, AR.instructor)}</b><span>{countOf(sectionsOf(allRows), AR.section)}</span></>}
        getKey={([key]) => key}
        searchText={([, group]) => `${group.who} ${group.rows.map(rowSearchText).join(" ")}`}
        renderItem={([, group]) => <ReviewPersonGroup group={group} courses={courses} colleges={colleges} visitingIds={visitingIdSet} />}
      />
    );
  };

  const renderFindingSubjects = (finding: ReviewFindingGroup) => {
    const subjects = new Map<string, { label: string; items: RegulationFinding[] }>();
    finding.groupedItems.forEach((item, index) => {
      const key = item.subjectKey || `case:${index}`;
      const bucket = subjects.get(key) || { label: item.subjectLabel || groupEntitySummary(finding), items: [] };
      bucket.items.push(item);
      subjects.set(key, bucket);
    });
    const entries = [...subjects.entries()];
    const rowCount = new Set(finding.groupedItems.flatMap(item => item.rowIds)).size;
    return (
      <PagedFindingList
        items={entries}
        pageSize={6}
        label={`حالات «${findingBaseTitle(finding.title)}»`}
        listClassName="review-subject-list"
        summary={<><b>{countOf(entries.length, AR.occurrence)}</b>{rowCount ? <span>{countOf(rowCount, AR.appointment)}</span> : null}</>}
        getKey={([key]) => key}
        searchText={([, subject]) => `${subject.label} ${[...new Set(subject.items.flatMap(item => item.rowIds))].map(id => byId.get(id)).filter(Boolean).map(row => rowSearchText(row as FSchedule)).join(" ")}`}
        renderItem={([, subject]) => {
          const uniqueDetails = [...new Set(subject.items.map(item => item.detail).filter(Boolean))];
          const subjectRowIds = [...new Set(subject.items.flatMap(item => item.rowIds))];
          return (
            <section className="review-subject">
              <header>
                <strong>{markVisitingNames(subject.label, subjectRowIds)}</strong>
                <small>{finding.rule === "regulation-ladder" ? "تنبيه لائحي" : countOf(subject.items.length, AR.conflict)}</small>
              </header>
              <div className="review-subject-cases">
                {renderCompactRows(subjectRowIds)}
                {!subjectRowIds.length && uniqueDetails.length ? <p className="review-subject-summary">{markVisitingNames(uniqueDetails[0], subjectRowIds)}</p> : null}
              </div>
            </section>
          );
        }}
      />
    );
  };

  /* ── بندٌ واحد، بطاقةٌ واحدة ─────────────────────────────────────────────
     كانت البنود تُعرض مرتين: قائمةٌ فوق فيها «83 ← 98» و«عالج» بعدد مواعيد
     الكلية المفتوحة (8)، ثم البطاقات نفسها تحتها بعدد مواعيد القسم في كلياته كلها
     (24). فصار البند الواحد رقمين. الآن البطاقة وحدها: عددُها مواعيدُ الكلية التي
     تُحسب عليها الدرجة (scoreSegmentOf)، وفيها ما تصير إليه الدرجة و«عالج». */
  /* لكل بطاقةٍ أثرُها هي: الموانع المادية تُفكّ بطاقةً بطاقة (الحلقة تجمعها شريحةً واحدة)،
     والسليمُ لا يتغيّر — الاتحادُ نفسه — فالدرجة واحدة في الرأس والبطاقات. */
  const cardBreakdown = useMemo(() => approvalScoreBreakdown(
    scopeRows.map(row => Number(row.id)),
    groupedFindings.map(group => ({ key: group.groupKey, label: group.title, tone: isMaterialFinding(group) ? "block" as const : "regulation" as const, rowIds: group.rowIds })),
  ), [scopeRows, groupedFindings]);
  const scoreSegmentOf = (finding: ReviewFindingGroup) => cardBreakdown.segments.find(segment => segment.key === finding.groupKey);
  const renderFinding = (finding: ReviewFindingGroup) => {
    const scoped = finding.rowIds.filter(id => scopeIds.has(Number(id)));
    const elsewhere = finding.rowIds.length - scoped.length;
    const segment = scoreSegmentOf(finding);
    const gain = segment ? segment.projected - score : 0;
    const focusable = scoped.filter(id => loadedIds.has(id));
    return (
            <details key={finding.groupKey} className={`review-finding severity-${findingTone(finding)}`} data-review-finding={finding.groupKey}>
              <summary data-guide-ignore="فتح تفاصيل ملاحظة داخل مراجعة الاعتماد فقط">
                <span className="review-mark" aria-hidden="true">{findingIcon(finding)}</span>
                <span className="review-copy">
                  <strong>{markVisitingNames(finding.title, finding.rowIds)}</strong>
                  <small>{findingPreview(finding)}</small>
                  {scoped.length ? (
                    <span className="finding-share-wrap">
                      <span className="finding-share-count" title={elsewhere > 0 ? `و${countOf(elsewhere, AR.appointment)} في كلية أخرى من القسم لا تُحسب في هذه الدرجة` : undefined}>
                        <b>{finding.groupedCount.toLocaleString("ar-KW-u-nu-latn")}</b>
                        <span>{finding.rule === "regulation-ladder" ? nounFor(finding.groupedCount, AR.course) : finding.groupedCount === 1 ? "تعارض" : "تعارضات"}</span>
                        <i>·</i>
                        <span data-finding-count={scoped.length}>{countOf(scoped.length, AR.appointment)} {nounFor(scoped.length, AR.affectedAdj)}</span>
                      </span>
                      <span className="finding-share" aria-hidden="true">
                        <i style={{ width: `${Math.min(100, (scoped.length / spread.total) * 100)}%` }} />
                      </span>
                    </span>
                  ) : null}
                </span>
                <span className="review-finding-side">
                  <span className="review-finding-tags"><em>{finding.article}</em><i>{findingStatus(finding)}</i></span>
                  {segment && gain > 0 ? (
                    <span className="review-score-fix-gain" data-score-fix={segment.key} title={`لو عولج هذا البند وحده تصبح الدرجة ${segment.projected}`}>
                      <TrendingUp aria-hidden="true" />
                      <b>{score.toLocaleString("ar-KW-u-nu-latn")}</b><i aria-hidden="true">←</i><b>{segment.projected.toLocaleString("ar-KW-u-nu-latn")}</b>
                      <em>+{gain.toLocaleString("ar-KW-u-nu-latn")}</em>
                    </span>
                  ) : null}
                  {onFocusRows && focusable.length ? (
                    <button type="button" className="review-score-fix-act"
                      data-guide-ignore="يُبرز مواعيد البند على الجدول للمعالجة، لا يغيّر شيئاً"
                      title="أظهر مواعيد هذا البند على الجدول لمعالجتها"
                      onClick={event => { event.preventDefault(); event.stopPropagation(); onFocusRows(focusable); onClose(); }}>
                      <Wrench aria-hidden="true" /> عالج
                    </button>
                  ) : null}
                </span>
              </summary>
              <div className="review-rows">
                  <div className="review-finding-detail">
                      {finding.data && finding.groupedCount === 1 ? <PeriodBalanceInfographic {...finding.data} /> : (
                        <details className="review-rule-explainer">
                          <summary><Info aria-hidden="true" /> شرح الملاحظة <ChevronDown aria-hidden="true" /></summary>
                          <p>{markVisitingNames(findingExplanation(finding), finding.rowIds)}</p>
                        </details>
                      )}
                  </div>
                  {finding.rowIds.length ? (
                    <>
                      {finding.source === "history" ? (
                        <HistoryInfographic rows={finding.rowIds.map(id=>byId.get(id)).filter(Boolean) as FSchedule[]} courses={courses} />
                      ) : finding.groupedCount > 1 ? (
                        renderFindingSubjects(finding)
                      ) : (
                        renderFindingPeople(finding)
                      )}
                    </>
                  ) : null}
              </div>
            </details>
    );
  };


  return (
    // The printable sheet lives inside this dialog, so the wrapper itself can
    // never be `no-print` — doing so hid the very report the print button was
    // meant to produce. Only the on-screen dialog is suppressed on paper.
    <div className="review-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="review-sheet no-print visual-minimal" role="dialog" aria-modal="true" aria-label="مراجعة الاعتماد">
        <header className={`review-head tone-${tone}`}>
          <svg className={`review-ring score-tone-${scoreTone}`} viewBox="0 0 64 64" role="img" aria-label={`مطابقة ${DECISION_1912_LABEL} ${score} من 100`}>
            <title>{breakdown.formula}</title>
            <circle className="ring-track" cx="32" cy="32" r="26" />
            {/* One slice per category, starting at twelve o'clock: green is the score. */}
            <g className="ring-slices">
              {ringSlices.map(slice => (
                <circle
                  key={slice.key}
                  className={`ring-slice ring-slice-${slice.tone}`}
                  cx="32" cy="32" r="26"
                  strokeDasharray={`${Math.max(0, slice.length - (ringSlices.length > 1 ? 0.8 : 0))} ${ringLength}`}
                  strokeDashoffset={-slice.offset}
                ><title>{slice.label}</title></circle>
              ))}
            </g>
            <text x="32" y="34" className="ring-number">{score.toLocaleString("ar-KW-u-nu-latn")}</text>
            <text x="32" y="45" className="ring-unit">/ 100</text>
          </svg>
          <div className="review-title">
            <span className="surface-kicker">مراجعة الاعتماد · {DECISION_1912_LABEL}</span>
            <h2 data-resolved={readinessChecked && sawChecking.current ? "" : undefined}>{!readinessChecked ? "أتحقق من الموانع…" : blocking.length ? "يوجد ما يمنع الاعتماد" : readinessError ? "تعذر فحص الموانع خارج القسم" : regulationGroups.length ? "لا مانع للتوقيع · بنود للمعالجة" : unclassifiedCourses ? "يلزم استكمال بيانات التدريس" : "لا توجد موانع ظاهرة"}</h2>
            <p>{scopeLabel}</p>
            {familyNote ? <small className="review-scope-note" data-review-scope="college"><Building2 aria-hidden="true" /> {familyNote}</small> : null}
            {readinessChecked && unclassifiedCourses ? <small className="review-data-gap"><Info aria-hidden="true" /> {countOf(unclassifiedCourses, AR.course)} بلا طبيعة تدريس؛ لم يُفحص نمط المادة 7/8 لها.</small> : null}
            {readinessChecked && blockerSummary.conflicts > 0 ? <strong className="review-blocker-headline" data-review-headline="blocking">يمنع الاعتماد: {blockingSummaryPhrase(blockerSummary.conflicts, blockerSummary.rows, blockerSummary.duplicates)}</strong> : null}
            {readinessError ? <small>تمت مراجعة قرار 1913/2016 محلياً، لكن تعذر التأكد الآن من الحجوزات المتعارضة خارج نطاق القسم.</small> : null}
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق"><X /></button>
        </header>


        {/* The whole term as one bar: every appointment counted once. */}
        <div className="review-spread" role="img" aria-label="توزيع المواعيد حسب الملاحظات">
          <div className="spread-bar">
            {spread.high ? <i className="seg-high" style={{ width: share(spread.high) }} title={spreadLabel.high} /> : null}
            {spread.medium ? <i className="seg-medium" style={{ width: share(spread.medium) }} title={spreadLabel.medium} /> : null}
            {spread.low ? <i className="seg-low" style={{ width: share(spread.low) }} title={spreadLabel.low} /> : null}
            {spread.clean ? <i className="seg-clean" style={{ width: share(spread.clean) }} title={spreadLabel.clean} /> : null}
          </div>
          {/* Appointments, said with their noun: «5 مواعيد تمنع» can never be
              read as «5 موانع» beside the bar's conflict count. */}
          <div className="spread-keys">
            {/* مفتاحٌ لكل شريحةٍ لها مواعيد — «لا مواعيد تمنع» لا يُكتب مفتاحاً (قاعدة إخفاء الفارغ). */}
            {spread.high ? <span className="seg-high"><AlertTriangle aria-hidden="true" /><b>{countOf(spread.high, AR.appointment)}</b><small>{nounFor(spread.high, AR.blockVerb)}</small></span> : null}
            {spread.medium ? <span className="seg-medium"><Wrench aria-hidden="true" /><b>{countOf(spread.medium, AR.appointment)}</b><small>للمعالجة</small></span> : null}
            {spread.low ? <span className="seg-low"><ClipboardCheck aria-hidden="true" /><b>{countOf(spread.low, AR.note)}</b></span> : null}
            {spread.clean ? <span className="seg-clean"><CheckCircle2 aria-hidden="true" /><b>{countOf(spread.clean, AR.appointment)}</b><small>{nounFor(spread.clean, AR.soundAdj)}</small></span> : null}
          </div>
        </div>

        {/* ── من أين جاءت الدرجة، وماذا يرفعها (I2) ─────────────────────── */}
        {readinessChecked && breakdown.total ? (
          <section className="review-score-plan" aria-label="معادلة الدرجة">
            <p className="review-score-formula" data-review-formula=""><Calculator aria-hidden="true" /><span dir="rtl">{breakdown.formula}</span></p>
          </section>
        ) : null}


        <section className="review-period-rule" aria-labelledby="review-period-title" data-open={periodOpen || undefined}>
          <button type="button" className="review-period-toggle" aria-expanded={periodOpen} aria-controls="review-period-content" onClick={() => setPeriodOpen(value => !value)} data-guide-ignore="طيّ أو فتح تفاصيل توزيع الصباحي والمسائي داخل المراجعة">
            <span><Clock3 aria-hidden="true"/><b id="review-period-title">توزيع الفترتين</b><em>قرار 1913/2016 · م.7/2</em></span>
            {periodBalance ? <small>صباحي {periodBalance.morning}٪ · مسائي {periodBalance.evening}٪</small> : null}
            <ChevronDown aria-hidden="true"/>
          </button>
          {periodOpen ? <div id="review-period-content" className="review-period-content">
            <div className="review-period-hours"><span><b>الصباحي</b><small>08:00–14:00</small><strong>50–70٪</strong></span><i aria-hidden="true"/><span><b>المسائي</b><small>14:00–20:00</small><strong>30–50٪</strong></span></div>
            {periodBalance && periodBalance.sections >= PERIOD_BALANCE_MIN_SECTIONS
              ? <PeriodBalanceInfographic {...periodBalance} />
              : <p>{periodBalance ? `قراءة التوزيع بعد ${countOf(PERIOD_BALANCE_MIN_SECTIONS, AR.appointment)}: الصباحي ${periodBalance.morning}٪ · المسائي ${periodBalance.evening}٪ (${countOf(periodBalance.sections, AR.appointment)}).` : "لا توجد مواعيد ضمن الفترتين حالياً."}</p>}
          </div> : null}
        </section>

        <div className="review-body">
          {/* «لم نصل بعد»: ملاحظةٌ على شعب المقررات التي لم يصلها الفرع — لا تمنع ولا تدخل الدرجة. */}
          <ReachReviewNotes rows={scopeRows} termId={termId}
            courseLabel={id => ({ code: shortCourseCode(courses.get(id)?.CourseCode), name: String(courses.get(id)?.CourseName || "") })} />
          {groupedFindings.length ? (
            <>
              {pressingFindings.map(renderFinding)}
                  {!quietFindings.length ? null : quietFindings.length < 3 ? quietFindings.map(renderFinding) : (
                <section className={`review-quiet ${quietOpen ? "open" : ""}`}>
                  <button
                    type="button"
                    className="review-quiet-toggle"
                    data-guide-ignore="طيّ الملاحظات اللائحية داخل نافذة المراجعة فقط"
                    onClick={() => setQuietOpen(current => !current)}
                    aria-expanded={quietOpen}
                  >
                    <span className="review-mark" aria-hidden="true"><CheckCircle2 /></span>
                    <span className="review-copy">
                      <strong>{countOf(quietFindings.length, AR.note)} لا {nounFor(quietFindings.length, AR.blockFemVerb)} الاعتماد</strong>
                      <small>{quietPreview}</small>
                    </span>
                    <i>{countOf(quietRows, AR.appointment)}</i>
                    <ChevronDown aria-hidden="true" />
                  </button>
                  {quietOpen ? <div className="review-quiet-list">{quietFindings.map(renderFinding)}</div> : null}
                </section>
              )}
            </>
          ) : (
            <div className="review-clear">
              <CheckCircle2 />
              <strong>لا ملاحظات</strong>
              <span>{unclassifiedCourses ? `${countOf(unclassifiedCourses, AR.course)} بلا طبيعة تدريس؛ نمط المادة 7/8 غير مفحوص.` : "لا توجد موانع ظاهرة في هذا الفحص."}</span>
            </div>
          )}
        </div>

        <footer className="review-foot">
          <PrimaryButton
            type="button"
            className="review-print-icon-button"
            data-guide-ignore="طباعة تقرير المراجعة لا تغيّر الجدول ولا تحتاج ميزة مستقلة"
            onClick={printReview}
            aria-label="طباعة تقرير الاعتماد"
            title="طباعة تقرير الاعتماد"
          >
            <Printer aria-hidden="true" />
          </PrimaryButton>
          <SecondaryButton type="button" className="review-close-icon-button" data-guide-ignore="إغلاق نافذة مراجعة الاعتماد فقط" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></SecondaryButton>
        </footer>
      </section>

      {/* The signed sheet. */}
      <PrintPortal>
        <div className="print-sheet-modal">
          <div className="print-report print-wide print-query-report print-review-report">
            <section className="print-explicit-page print-review-page">
              <PrintLetterhead title={`مراجعة الاعتماد · ${DECISION_1912_LABEL}`} scope={scopeLabel} />
              <section className={`print-review-hero tone-${tone}`}>
                <svg className={`print-review-ring score-tone-${scoreTone}`} viewBox="0 0 64 64" aria-label={`مطابقة ${DECISION_1912_LABEL} ${score} من 100`}>
                  <circle className="ring-track" cx="32" cy="32" r="26" />
                  <circle className="ring-value" cx="32" cy="32" r="26" strokeDasharray={`${(score / 100) * ringLength} ${ringLength}`} />
                  <text x="32" y="34" className="ring-number">{score.toLocaleString("ar-KW-u-nu-latn")}</text>
                  <text x="32" y="45" className="ring-unit">/ 100</text>
                </svg>
                <div><small>مراجعة الاعتماد · {DECISION_1912_LABEL}</small><strong>{blocking.length ? "يوجد ما يمنع الاعتماد" : readinessError ? "تعذر فحص الموانع خارج القسم" : unclassifiedCourses ? "يلزم استكمال بيانات التدريس" : "لا توجد موانع ظاهرة"}</strong><span>{scopeLabel}</span>{unclassifiedCourses ? <small>{countOf(unclassifiedCourses, AR.course)} بلا طبيعة تدريس؛ نمط 7/8 غير مفحوص.</small> : null}</div>
              </section>
              <div className="print-review-spread" role="img" aria-label="توزيع المواعيد حسب نتيجة المراجعة">
                <div className="print-spread-bar">
                  {spread.high ? <i className="seg-high" style={{ width: share(spread.high) }} /> : null}
                  {spread.medium ? <i className="seg-medium" style={{ width: share(spread.medium) }} /> : null}
                  {spread.low ? <i className="seg-low" style={{ width: share(spread.low) }} /> : null}
                  {spread.clean ? <i className="seg-clean" style={{ width: share(spread.clean) }} /> : null}
                </div>
                {blockerSummary.conflicts > 0 ? <p className="print-blocker-headline">يمنع الاعتماد: {blockingSummaryPhrase(blockerSummary.conflicts, blockerSummary.rows, blockerSummary.duplicates)}</p> : null}
                <div className="print-spread-keys">{spread.high ? <span className="seg-high">{spreadLabel.high}</span> : null}{spread.medium ? <span className="seg-medium">{spreadLabel.medium}</span> : null}{spread.low ? <span className="seg-low">{spreadLabel.low}</span> : null}{spread.clean ? <span className="seg-clean">{spreadLabel.clean}</span> : null}</div>
              </div>
              <section className="print-review-findings">
                {findings.length ? firstPrintPage.map(renderPrintFinding) : <div className="print-review-clear"><CheckCircle2 /><strong>{unclassifiedCourses ? "فحص غير مكتمل" : "لا توجد موانع ظاهرة"}</strong><span>{unclassifiedCourses ? `${countOf(unclassifiedCourses, AR.course)} بلا طبيعة تدريس؛ نمط المادة 7/8 غير مفحوص.` : "لا توجد موانع ظاهرة في هذا الفحص."}</span></div>}
              </section>
              {!printFollowupPages.length ? (
                <div className="print-signatures print-explicit-page-meta">
                  <div><span>منسق الجدول</span><i /></div>
                  <div><span>رئيس القسم العلمي</span><i /></div>
                  <div><span>التاريخ</span><i /></div>
                </div>
              ) : null}
            </section>
            {printFollowupPages.map((page, pageIndex) => (
              <section className="print-explicit-page print-review-page" key={`review-page-${pageIndex + 2}`}>
                <PrintLetterhead title={`مراجعة الاعتماد · متابعة الملاحظات (${pageIndex + 2})`} scope={scopeLabel} />
                <div className="print-review-page-kicker">
                  <small>متابعة التقرير</small>
                  <strong>تفاصيل إضافية من مراجعة الاعتماد</strong>
                  <span>صفحة {(pageIndex + 2).toLocaleString("ar-KW-u-nu-latn")}</span>
                </div>
                      <section className="print-review-findings print-review-findings--followup">
                  {page.map(renderPrintFinding)}
                </section>
                {pageIndex === printFollowupPages.length - 1 ? (
                  <div className="print-signatures print-explicit-page-meta">
                    <div><span>منسق الجدول</span><i /></div>
                    <div><span>رئيس القسم العلمي</span><i /></div>
                    <div><span>التاريخ</span><i /></div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </PrintPortal>
    </div>
  );
}

export { ClipboardCheck as ReviewIcon };
