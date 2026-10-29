/**
 * ── محرّك فحص المقترح الدراسي (الخادم) ──────────────────────────────────────
 *
 * يبني «الجدول الناتج» بتطبيق عمليات المقترح على نسخةٍ من جدول الفصل في
 * الذاكرة، ثم يسأل بوابةَ الحفظ نفسها (`scheduleConflicts`) عن كل موعدٍ داخلٍ
 * إلى جدول الأستاذ — فلا يكون هناك فاحصٌ ثانٍ يحكم بغير ما تحكم به شاشة
 * «إضافة موعد». ما ليس مانعاً هناك (ما عُلِّم soft) يبقى ملاحظةً هنا ولا يصير
 * مانعاً.
 *
 * ما يُكشف للمستخدم محدودٌ بصلاحيته: موعدُ أستاذٍ في قسمٍ خارج نطاقه يظهر
 * إشغالاً وحسب — لا مقرّر ولا شعبة ولا كلية.
 */
import { Repository } from "../db/repository";
import type {
  AdCourse, AdInstructor, FSchedule, StudyProposalDayKey, StudyProposalOp, StudyProposalRowSnapshot,
} from "../types";
import { isBlockingConflict, timeToMinutes, minutesToTime } from "../utils/scheduleIntelligence";
import { placeholderInstructorIds } from "../utils/instructorIdentity";
import { reviewSchedule, effectiveCourseHours, maxWeeklyMinutesFor, sectionWeeklyHours } from "../utils/scheduleRegulations";
import { learnCourseNature } from "../utils/courseNature";
import { confirmedDepartmentRoomIds, eligibleHallsForSection, rowOccupiesRoom } from "../utils/locationRegistry";
import { mergeRegistryWithSeed } from "./locationRegistryEngine";
import {
  applyProposalOps, daysLabel, daysOf, durationOf, GridItem, placeLabel, ProposalEvaluation, ProposalFinding,
  proposalDrift, proposalMetrics, snapshotOf, specOfSnapshot, validateOps, PROPOSAL_DAY_KEYS, PROPOSAL_DAY_NAMES, type ProposalCatalog,
  type OpIssue, type VacancyFit, type VacancyVerdict,
} from "../utils/studyProposal";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START, isValidClock, scheduleDayWindowMinutes, withinScheduleDay } from "../utils/scheduleTime";
import { AR, countOf } from "../utils/arabicCount";
import { loadCapOf } from "../utils/teachingLoad";

export interface EngineDeps {
  scheduleConflicts: (req: any, row: any, excludeId?: number, hypothetical?: FSchedule[]) => Promise<any[]>;
  scheduleLockRefusal: (req: any, collegeId: number, sectionId: number, termId: number, options?: { registrarLock?: boolean }) => Promise<string | null>;
  /** هل يملك المستخدم الكتابة في هذا القسم؟ */
  canWrite: (req: any, collegeId: number, sectionId: number) => boolean;
  /** هل يحق له رؤية تفاصيل هذا الموعد؟ */
  canSee: (req: any, collegeId: number, sectionId: number) => boolean;
  /** صلاحية المكان وتوحيده بقواعد الحفظ نفسها (المبنى والقاعة ونطاق القسم). */
  canonicalizeLocation?: (row: any, collegeId: number, sectionId: number) => Promise<{ ok: boolean; message?: string; canonical?: any }>;
}

export interface EvaluateInput {
  instructorId: number;
  termId: number;
  collegeId: number;
  sectionId: number;
  ops: StudyProposalOp[];
  proposalId?: string;
  /** عمليات بعينها فقط (التثبيت الجزئي). */
  onlyOpIds?: string[];
  /** يتخطى فحص القفل (للإرسال: القفل يمنع التثبيت لا الإرسال). */
  includeLock?: boolean;
}

export interface LoadedWorld {
  termRows: FSchedule[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  colleges: Array<{ AdCollegeId: number; AdCollegeName: string }>;
  sections: Array<{ AdSectionId: number; AdCollegeId: number; AdSectionName: string }>;
  catalog: ProposalCatalog;
  placeholders: Set<number>;
  instructor?: AdInstructor;
  term?: { AdTermId: number; AdTermName: string; AdTermClosed?: boolean };
}

export async function loadWorld(termId: number, instructorId: number): Promise<LoadedWorld> {
  const [termRows, courses, instructors, colleges, sections, terms] = await Promise.all([
    Repository.getSchedulesByScope({ termId }) as Promise<FSchedule[]>,
    Repository.getCourses() as Promise<AdCourse[]>,
    Repository.getInstructors() as Promise<AdInstructor[]>,
    Repository.getColleges() as Promise<any[]>,
    Repository.getSections() as Promise<any[]>,
    Repository.getTerms() as Promise<any[]>,
  ]);
  const courseById = new Map<number, AdCourse>(courses.map(row => [Number(row.AdCourseId), row]));
  const instructorNameById = new Map<number, string>(instructors.map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  return {
    termRows, courses, instructors, colleges, sections,
    catalog: { courseById: courseById as any, instructorNameById },
    placeholders: placeholderInstructorIds(instructors as any),
    instructor: instructors.find(row => Number(row.AdInstructorId) === instructorId),
    term: terms.find(row => Number(row.AdTermId) === termId),
  };
}

export const keyOfRow = (id: number) => `row:${id}`;
export const keyOfNew = (opId: string) => `new:${opId}`;

export function gridItem(
  row: FSchedule, world: LoadedWorld, deps: EngineDeps, req: any,
  patch: Partial<GridItem> & Pick<GridItem, "state" | "key">,
): GridItem {
  const visible = deps.canSee(req, Number(row.AdCollegeId), Number(row.AdSectionId));
  const days = daysOf(row as any);
  if (!visible) {
    return {
      rowId: Number(row.id), courseName: "", courseCode: "", SCode: "", days,
      start: String(row.fstarttime || ""), end: String(row.fendtime || ""),
      place: "", placeKnown: false, outside: true,
      ...patch, state: "outside" as const,
    } as GridItem;
  }
  const course = world.catalog.courseById.get(Number(row.AdCourseId));
  const place = placeLabel(row);
  const college = world.colleges.find(c => Number(c.AdCollegeId) === Number(row.AdCollegeId));
  const section = world.sections.find(c => Number(c.AdSectionId) === Number(row.AdSectionId));
  return {
    rowId: Number(row.id),
    courseName: String(course?.CourseName || row.CourseNameSnapshot || row.AdCourseName || ""),
    courseCode: String(course?.CourseCode || row.CourseCodeSnapshot || ""),
    SCode: String(row.SCode ?? ""),
    days, start: String(row.fstarttime || ""), end: String(row.fendtime || ""),
    place: place.text, placeKnown: place.known,
    collegeName: college?.AdCollegeName, sectionName: section?.AdSectionName,
    src: {
      courseId: Number(row.AdCourseId), collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId), rev: Number(row.rev || 0),
      buildingId: row.buildingId, roomId: row.roomId, locationStatus: row.locationStatus,
      roomCode: String(row.AdRoomCode || ""), roomHall: String(row.AdRoomHall || ""),
    },
    ...patch,
  } as GridItem;
}

const dayOverlap = (a: FSchedule, b: FSchedule): { day?: StudyProposalDayKey; start?: string; end?: string } => {
  const day = PROPOSAL_DAY_KEYS.find(key => Boolean((a as any)[key]) && Boolean((b as any)[key]));
  if (!day) return {};
  const start = Math.max(timeToMinutes(a.fstarttime), timeToMinutes(b.fstarttime));
  const end = Math.min(timeToMinutes(a.fendtime), timeToMinutes(b.fendtime));
  return end > start ? { day, start: minutesToTime(start), end: minutesToTime(end) } : { day };
};

const REASON_BY_TYPE: Record<string, { reason: string; fix: string }> = {
  instructor: { reason: "الأستاذ لا يحضر محاضرتين في وقتٍ واحد.", fix: "غيّر اليوم أو الوقت، أو جرّب أحد الأوقات البديلة." },
  room: { reason: "القاعة لا تُشغل بمحاضرتين في وقتٍ واحد.", fix: "اختر قاعةً أخرى أو غيّر الوقت." },
  duplicate: { reason: "يوجد موعدٌ مطابقٌ تماماً لنفس المقرر والشعبة.", fix: "تأكد أن المادة لا تُضاف مرتين، أو غيّر رقم الشعبة." },
  hallBarter: { reason: "القاعة محجوزةٌ لقسمٍ آخر عبر استعارة القاعات.", fix: "اختر قاعةً أخرى أو اطلب نافذةً من «استعارة القاعات»." },
  hallBarterWindow: { reason: "الموعد خارج نافذة الاستعارة المعتمدة للقاعة.", fix: "اجعل الموعد داخل النافذة المعتمدة أو اطلب نافذةً إضافية." },
  roomScope: { reason: "القاعة مسجّلةٌ لقسمٍ آخر ولا تُستعمل إلا بنافذة استعارةٍ معتمدة.", fix: "اختر قاعةً من قاعات القسم أو اطلب استعارة." },
  cohort: { reason: "مقرّران يشترك فيهما طلابٌ حسب استبيان القسم.", fix: "راجع إن كان التقاؤهما مقبولاً أو غيّر أحد الوقتين." },
  doorway: { reason: "الفاصل بين محاضرتين في القاعة نفسها أقصر من المقرّر.", fix: "أضف فاصلاً كافياً بين المحاضرتين إن أمكن." },
  sectionTwice: { reason: "الشعبة نفسها مسجّلة بالأيام والوقت نفسيهما في موضعين.", fix: "تأكد أنهما شعبتان مقصودتان." },
};

function makeId(parts: Array<string | number>): string {
  return parts.join(":");
}

/** Same clock, section hours and weekly course load as the Add/Edit save routes.
 * Read the proposed final timetable, not the pre-edit rows, for weekly load.
 */
export async function proposalSchedulePreflight(
  row: FSchedule, provisional: readonly FSchedule[], world: LoadedWorld,
): Promise<string[]> {
  const issues: string[] = [];
  if (!PROPOSAL_DAY_KEYS.some(day => Boolean((row as any)[day]))) issues.push("يجب اختيار يوم واحد على الأقل للمحاضرة");
  if (!isValidClock(row.fstarttime) || !isValidClock(row.fendtime)) {
    issues.push("وقت المحاضرة غير صالح: الساعة بين 0 و23 والدقيقة بين 0 و59");
    return issues;
  }
  const section = await Repository.getSectionById(Number(row.AdSectionId));
  const bounds = scheduleDayWindowMinutes(section);
  if (!withinScheduleDay(timeToMinutes(row.fstarttime), timeToMinutes(row.fendtime), bounds)) {
    issues.push(`وقت المحاضرة يجب أن يكون بين ${bounds.startTime} و${bounds.endTime}`);
  }

  // An unchanged inherited lecture shape must not newly reject existing data.
  const original = world.termRows.find(item => Number(item.id) === Number(row.id));
  const unchangedShape = original
    && String(original.fstarttime) === String(row.fstarttime)
    && String(original.fendtime) === String(row.fendtime)
    && PROPOSAL_DAY_KEYS.every(day => Boolean((original as any)[day]) === Boolean((row as any)[day]));
  if (unchangedShape) return issues;
  const courseId = Number(row.AdCourseId);
  const course = world.catalog.courseById.get(courseId);
  const hours = effectiveCourseHours(course as any);
  if (hours > 0) {
    const siblings = provisional.filter(item =>
      Number(item.id) !== Number(row.id)
      && Number(item.AdCourseId) === courseId && String(item.SCode || "") === String(row.SCode || "")
      && Number(item.AdCollegeId) === Number(row.AdCollegeId)
      && Number(item.AdSectionId) === Number(row.AdSectionId)
      && Number(item.AdTermId) === Number(row.AdTermId));
    /* المصدر الواحد نفسه الذي يقرأ به الحفظ: الكتلة بنمط ساعات المقرر، والنسخة المطابقة لا تضاعف. */
    const total = sectionWeeklyHours(row, siblings, hours).total;
    if (total > maxWeeklyMinutesFor(hours)) {
      // Add/Edit makes the identical historical-nature exception.
      const history = await Repository.getScheduleHistoryForCourses([courseId]);
      const nature = learnCourseNature(courseId, history as FSchedule[]);
      const habitual = nature && nature.confidence !== "low" ? nature.meetingMinutes : undefined;
      if (!habitual) issues.push(`ساعات هذا المقرر المعتمدة ${countOf(hours, AR.hour)} أسبوعيًا، والمجموع بعد هذا الموعد يزيدها (${countOf(Math.round(total / 50), AR.hour)} تقريبًا). لا يُحفظ ما يزيد على الساعات المعتمدة`);
    }
  }
  return issues;
}

export async function evaluateProposal(deps: EngineDeps, req: any, input: EvaluateInput, preloaded?: LoadedWorld): Promise<ProposalEvaluation> {
  const world = preloaded || await loadWorld(input.termId, input.instructorId);
  const incompleteReasons: string[] = [];
  const onlyOpIds = input.onlyOpIds ? new Set(input.onlyOpIds) : undefined;
  const ops = input.ops.filter(op => !onlyOpIds || onlyOpIds.has(op.id));
  const placeholderId = [...world.placeholders].sort((a, b) => a - b)[0] || null;

  const instructorRowsBefore = world.termRows.filter(row => Number(row.AdInstructorId) === input.instructorId);
  const opIssues: OpIssue[] = validateOps(ops);
  const invalidOps = new Set(opIssues.map(issue => issue.opId).filter(Boolean));
  const validOps = ops.filter(op => !invalidOps.has(op.id));
  const drift = proposalDrift(ops, world.termRows, world.placeholders, { instructorId: input.instructorId });
  const driftOps = new Set(drift.map(d => d.opId));

  const applied = applyProposalOps(world.termRows, validOps.filter(op => !driftOps.has(op.id)), {
    instructorId: input.instructorId, termId: input.termId, placeholderId,
  });
  const appliedErrors = new Map(applied.errors.map(e => [e.opId, e]));

  const findings: ProposalFinding[] = [];
  const addFinding = (finding: Omit<ProposalFinding, "id">) => {
    const id = makeId([finding.code, finding.opId || "-", findings.length]);
    findings.push({ ...finding, id });
    return id;
  };

  /* ── ما لا يُفحص ولماذا ───────────────────────────────────────────────── */
  if (!ops.length) incompleteReasons.push("لم تُضف مادةٌ إلى المقترح بعد.");
  for (const issue of opIssues) {
    if (!issue.opId) continue;
    incompleteReasons.push(issue.message);
  }
  for (const issue of drift) {
    addFinding({
      kind: "blocker", code: `drift-${issue.code}`, title: "تغيّرت بيانات الجدول بعد إعداد المادة", detail: issue.message,
      reason: "المقترح مبنيٌّ على لقطةٍ لم تعد تطابق الجدول الحالي.",
      fix: "أعد اختيار الشعبة أو الموعد من القائمة لتحديث اللقطة ثم راجع الفحص.", opId: issue.opId,
    });
  }
  for (const error of applied.errors) {
    addFinding({ kind: "blocker", code: `apply-${error.code}`, title: "تعذّر تطبيق المادة", detail: error.message, opId: error.opId,
      fix: error.code === "no-placeholder" ? "اختر «حذف الموعد» إن كان مصرحاً لك به، أو أضف سجل «هيئة تدريسية»." : "راجع المادة من القائمة." });
  }

  /* ── الصلاحيات والقفل والمقرر المؤرشف ─────────────────────────────────── */
  const lockCache = new Map<string, string | null>();
  const archived = new Map<number, Set<number>>();
  for (const op of validOps) {
    const scopes: Array<{ collegeId: number; sectionId: number; label: string }> = [
      { collegeId: op.target.AdCollegeId, sectionId: op.target.AdSectionId, label: "الشعبة المقترحة" },
    ];
    if (op.out) scopes.push({ collegeId: op.out.snapshot.AdCollegeId, sectionId: op.out.snapshot.AdSectionId, label: "الموعد الخارج" });
    if (op.source) scopes.push({ collegeId: op.source.AdCollegeId, sectionId: op.source.AdSectionId, label: "الموعد المرجعي" });
    for (const scope of scopes) {
      if (!deps.canWrite(req, scope.collegeId, scope.sectionId)) {
        addFinding({
          kind: "blocker", code: "scope-denied", title: "خارج صلاحياتك", opId: op.id,
          detail: `${scope.label} تتبع قسماً لا تملك التعديل فيه.`,
          reason: "التثبيت يمرّ بصلاحيات الحفظ نفسها.", fix: "اطلب من صاحب القسم إعداد هذه المادة.",
        });
      }
      if (input.includeLock) {
        const lockKey = `${scope.collegeId}:${scope.sectionId}`;
        if (!lockCache.has(lockKey)) lockCache.set(lockKey, await deps.scheduleLockRefusal(req, scope.collegeId, scope.sectionId, input.termId));
        const lock = lockCache.get(lockKey);
        if (lock) addFinding({
          kind: "blocker", code: "schedule-locked", title: "الجدول مقفل الآن", detail: lock, opId: op.id,
          reason: "اعتماد الجدول أو إغلاق الفصل يمنع التعديل.", fix: "انتظر فتح الجدول أو راجع من يملك الصلاحية.",
        });
      }
    }
    if (op.kind === "create" || (op.kind === "replace" && op.incoming === "create")) {
      const sectionId = op.target.AdSectionId;
      if (!archived.has(sectionId)) archived.set(sectionId, await Repository.getOperationalCourseIds(sectionId));
      if (!archived.get(sectionId)!.has(op.target.AdCourseId)) addFinding({
        kind: "blocker", code: "course-archived", title: "المقرر مؤرشف", opId: op.id,
        detail: `${op.target.courseName || "المقرر"} مؤرشف أكاديمياً ولا يُضاف إلى جدولٍ جديد.`,
        fix: "اختر مقرراً قائماً في الكتالوج.",
      });
      const taken = world.termRows.some(row => Number(row.AdCourseId) === op.target.AdCourseId && String(row.SCode) === String(op.target.SCode));
      if (taken) addFinding({
        kind: "blocker", code: "section-code-taken", title: "رقم الشعبة مستخدم", opId: op.id,
        detail: `الشعبة ${op.target.SCode} موجودةٌ فعلاً لـ ${op.target.courseName || "هذا المقرر"} في هذا الفصل.`,
        reason: "الشعبة المقترحة جديدة، فلا يجوز أن تشارك رقماً قائماً.", fix: "استعمل الرقم المقترح التالي.",
      });
    }
  }

  /* ── الحكم على كل موعدٍ داخل: بوابة الحفظ نفسها على الجدول الناتج ───── */
  const seenPairs = new Set<string>();
  const gridKeyOf = (opId: string) => {
    const row = applied.incoming.get(opId);
    return row ? (Number(row.id) < 0 ? keyOfNew(opId) : keyOfRow(Number(row.id))) : "";
  };
  for (const op of validOps) {
    const row = applied.incoming.get(op.id);
    if (!row || driftOps.has(op.id) || appliedErrors.has(op.id)) continue;
    let raw: any[] = [];
    let candidate: FSchedule = row;
    if (deps.canonicalizeLocation) {
      try {
        const located = await deps.canonicalizeLocation({ ...row }, Number(row.AdCollegeId), Number(row.AdSectionId));
        if (!located.ok) {
          addFinding({
            kind: "blocker", code: "location-invalid", opId: op.id, title: "المكان غير صالح",
            detail: located.message || "المبنى أو القاعة لا يوافق سجل الأماكن.",
            reason: "الحفظ يتحقق من المكان بالقواعد نفسها.", fix: "اختر المبنى والقاعة من القائمة.",
          });
          continue;
        }
        candidate = { ...row, ...(located.canonical || {}) } as FSchedule;
      } catch { /* the gate below still speaks for the raw hall */ }
    }
    try {
      const issues = await proposalSchedulePreflight(candidate, applied.rows, world);
      if (issues.length) {
        for (const issue of issues) addFinding({
          kind: "blocker", code: "schedule-validation", title: "قواعد موعد جديد تمنع الموعد",
          detail: issue, opId: op.id, gridKeys: [gridKeyOf(op.id)].filter(Boolean),
          reason: "هذا الشرط يطبّق أيضاً عند حفظ الموعد من الجدول الدراسي.",
          fix: "راجع التوقيت أو الأيام أو الساعات الأسبوعية للمقرر.",
        });
        continue;
      }
    } catch (error) {
      incompleteReasons.push(`تعذّر فحص قواعد حفظ ${op.target.courseName || "مادة"}: ${(error as Error)?.message || "خطأ غير متوقع"}.`);
      continue;
    }
    try {
      raw = await deps.scheduleConflicts(req, { ...candidate, AdTermId: input.termId }, Number(row.id), applied.rows);
    } catch (error) {
      incompleteReasons.push(`تعذّر فحص ${op.target.courseName || "مادة"}: ${(error as Error)?.message || "خطأ غير متوقع"}.`);
      continue;
    }
    for (const conflict of raw) {
      const otherId = Number(conflict.otherId || 0);
      const pair = otherId ? `${conflict.type}|${[Number(row.id), otherId].sort((x, y) => x - y).join("|")}` : "";
      if (pair) { if (seenPairs.has(pair)) continue; seenPairs.add(pair); }
      const blocking = !conflict.soft && (isBlockingConflict(conflict) || ["hallBarter", "hallBarterWindow", "roomScope"].includes(conflict.type));
      const informational = ["memory", "rhythm"].includes(conflict.type);
      const kind = blocking ? "blocker" : informational ? "info" : "review";
      const other = otherId ? world.termRows.find(r => Number(r.id) === otherId) || applied.rows.find(r => Number(r.id) === otherId) : undefined;
      const shared = other ? dayOverlap(row, other) : { day: PROPOSAL_DAY_KEYS.find(k => Boolean((row as any)[k])) };
      const keys = [gridKeyOf(op.id)];
      if (other && Number(other.AdInstructorId) === input.instructorId) {
        keys.push(Number(other.id) < 0 ? (() => { for (const [id, r] of applied.incoming) if (Number(r.id) === Number(other.id)) return keyOfNew(id); return ""; })() : keyOfRow(Number(other.id)));
      }
      const advice = REASON_BY_TYPE[String(conflict.type)] || { reason: "", fix: "" };
      addFinding({
        kind, code: String(conflict.type || "conflict"),
        title: String(conflict.message || "نتيجة فحص"),
        detail: String(conflict.detail || ""),
        reason: advice.reason || undefined, fix: advice.fix || undefined,
        opId: op.id, gridKeys: keys.filter(Boolean),
        day: shared.day as StudyProposalDayKey | undefined, start: (shared as any).start, end: (shared as any).end,
      });
    }
  }

  /* ── ملاحظات اللائحة: تُقال ولا تمنع ──────────────────────────────────── */
  const incomingIds = new Set([...applied.incoming.values()].map(row => Number(row.id)));
  if (incomingIds.size) {
    try {
      const touchedScopes = new Set([...applied.incoming.values()].map(row => `${row.AdCollegeId}:${row.AdSectionId}`));
      const around = applied.rows.filter(row => touchedScopes.has(`${row.AdCollegeId}:${row.AdSectionId}`) || Number(row.AdInstructorId) === input.instructorId);
      const review = reviewSchedule({
        rows: around, courses: world.catalog.courseById as any,
        instructors: new Map(world.instructors.map(row => [Number(row.AdInstructorId), row])),
      }).filter(finding => finding.rowIds.some(id => incomingIds.has(Number(id))));
      for (const finding of review) {
        const opEntry = [...applied.incoming.entries()].find(([, row]) => finding.rowIds.includes(Number(row.id)));
        addFinding({
          kind: finding.approvalEffect === "note" ? "info" : "review", code: `regulation:${finding.rule}`,
          title: finding.title, detail: finding.detail, reason: finding.article ? `المرجع: ${finding.article}` : undefined,
          opId: opEntry?.[0], gridKeys: opEntry ? [gridKeyOf(opEntry[0])] : undefined,
        });
      }
    } catch { incompleteReasons.push("تعذّر تطبيق ملاحظات اللائحة على الجدول الناتج."); }
  }

  /* ── المواد المقترحة نفسُها لأكثر من أستاذ ───────────────────────────── */
  if (input.proposalId !== undefined) {
    const others = (await Repository.getStudyProposalsByTerm(input.termId))
      .filter(p => p.id !== input.proposalId && p.sentVersion > 0 && !["withdrawn", "committed", "expired"].includes(p.status));
    for (const op of validOps) {
      if (!op.source || op.kind === "edit") continue;
      const sharing = others.filter(p => p.ops.some(o => o.source?.id === op.source!.id && o.kind !== "edit"));
      if (sharing.length) addFinding({
        kind: "review", code: "shared-section", opId: op.id, title: "الشعبة مقترحةٌ أيضاً في مقترحٍ آخر",
        detail: `هذه الشعبة واردةٌ في ${sharing.length === 1 ? "مقترحٍ نشطٍ آخر" : `${sharing.length} مقترحاتٍ نشطةٍ أخرى`}. الإرسال لا يحجزها؛ من يوافق أولاً ويُثبَّت أولاً يأخذها.`,
        reason: "المقترح المرسل ليس حجزاً فعلياً للشعبة.", fix: "حدّد لمن تُسند الشعبة قبل التثبيت.",
      });
    }
  }

  /* ── الأثر على الجدول الناتج ───────────────────────────────────────────── */
  const instructorRowsAfter = applied.rows.filter(row => Number(row.AdInstructorId) === input.instructorId);
  const before = proposalMetrics(instructorRowsBefore, world.catalog.courseById);
  const after = proposalMetrics(instructorRowsAfter, world.catalog.courseById);
  const loadCap = loadCapOf(world.instructor) || null;
  if (after.unknown.includes("load")) addFinding({
    kind: "info", code: "load-unknown", title: "تعذّر حساب النصاب",
    detail: "ساعات بعض المقررات غير مسجّلة في الكتالوج، فلا يُعرض نصابٌ تخميني.", fix: "سجّل الساعات المعتمدة للمقرر.",
  });
  else if (loadCap && after.loadUnits !== null && after.loadUnits > loadCap) addFinding({
    kind: "review", code: "load-over", title: "النصاب بعد المقترح يتجاوز المسجّل",
    detail: `النصاب بعد المقترح ${countOf(after.loadUnits, AR.hour)} والمسجّل ${countOf(loadCap, AR.hour)}.`,
    reason: "النصاب يُحسب بالساعات المعتمدة لكل شعبةٍ مرّة.", fix: "راجع المواد أو وافق على التجاوز بقرار القسم.",
  });
  for (const op of validOps) {
    if (op.target.locationStatus === "PENDING_ROOM" || !op.target.roomId) addFinding({
      kind: "info", code: "place-pending", opId: op.id, title: "القاعة لم تُحدد",
      detail: `${op.target.courseName || "المادة"} بلا قاعةٍ محدّدة؛ يُعاد فحص القاعة عند تحديدها.`,
    });
  }
  for (const out of applied.outgoing) addFinding({
    kind: "info", code: "outgoing", opId: out.opId,
    title: out.action === "delete" ? "سيُحذف موعدٌ من الجدول" : "سيخرج موعدٌ من جدول الأستاذ",
    detail: `${world.catalog.courseById.get(Number(out.before.AdCourseId))?.CourseName || out.before.AdCourseName || "المقرر"} (شعبة ${out.before.SCode}) — ${out.action === "delete" ? "حذف الموعد من جدول القسم" : "يُفكّ إسناده فقط ويبقى في جدول القسم"}.`,
  });

  /* ── الشبكتان ─────────────────────────────────────────────────────────── */
  const beforeItems = instructorRowsBefore.map(row => gridItem(row, world, deps, req, { state: "current", key: keyOfRow(Number(row.id)) }));
  const afterItems: GridItem[] = [];
  const ghosts: GridItem[] = [];
  const incomingById = new Map<number, string>();
  for (const [opId, row] of applied.incoming) incomingById.set(Number(row.id), opId);
  const opById = new Map(ops.map(op => [op.id, op]));
  for (const row of instructorRowsAfter) {
    const opId = incomingById.get(Number(row.id));
    const op = opId ? opById.get(opId) : undefined;
    if (!op) afterItems.push(gridItem(row, world, deps, req, { state: "current", key: keyOfRow(Number(row.id)) }));
    else if (op.kind === "edit") {
      afterItems.push(gridItem(row, world, deps, req, { state: "modified", key: keyOfRow(Number(row.id)), opId, replaces: keyOfRow(Number(row.id)) }));
      const old = world.termRows.find(r => Number(r.id) === Number(op.source!.id));
      if (old) ghosts.push(gridItem(old, world, deps, req, { state: "out", key: `old:${op.source!.id}`, opId, replaces: keyOfRow(Number(row.id)) }));
    } else {
      afterItems.push(gridItem(row, world, deps, req, { state: "proposed", key: Number(row.id) < 0 ? keyOfNew(opId!) : keyOfRow(Number(row.id)), opId }));
    }
  }
  for (const out of applied.outgoing) {
    ghosts.push(gridItem(out.before, world, deps, req, { state: "out", key: `old:${out.rowId}`, opId: out.opId, outAction: out.action }));
  }

  /* ── حالة كل مادة والجاهزية للإرسال ──────────────────────────────────── */
  const perOp: ProposalEvaluation["perOp"] = {};
  for (const op of ops) {
    const opKey = gridKeyOf(op.id);
    const own = findings.filter(f => f.opId === op.id || (opKey && f.gridKeys?.includes(opKey)));
    const ids = [...new Set(own.map(f => f.id))];
    const unchecked = invalidOps.has(op.id) || (!applied.incoming.has(op.id) && !driftOps.has(op.id) && !appliedErrors.has(op.id));
    perOp[op.id] = {
      state: own.some(f => f.kind === "blocker") ? "blocked" : unchecked ? "unchecked" : own.some(f => f.kind === "review") ? "review" : "ok",
      findingIds: ids,
    };
  }
  const counts = {
    blockers: findings.filter(f => f.kind === "blocker").length,
    reviews: findings.filter(f => f.kind === "review").length,
    infos: findings.filter(f => f.kind === "info").length,
  };
  const complete = incompleteReasons.length === 0;
  const reasons: string[] = [];
  if (!ops.length) reasons.push("أضف مادةً واحدةً على الأقل.");
  if (!complete && ops.length) reasons.push("بيانات المقترح أو الفحص غير مكتملة.");
  if (counts.blockers) reasons.push(`يوجد ${countOf(counts.blockers, AR.blocker)}.`);
  return {
    status: complete ? "complete" : "partial",
    incompleteReasons,
    computedAt: new Date().toISOString(),
    before: { items: beforeItems, metrics: before },
    after: { items: afterItems, ghosts, metrics: after },
    loadCap,
    findings, counts, perOp, drift, opIssues,
    readiness: { canSend: ops.length > 0 && complete && counts.blockers === 0 && drift.length === 0, reasons },
  };
}

/* ── الأوقات البديلة ─────────────────────────────────────────────────────── */

export interface AlternativeSuggestion {
  days: StudyProposalDayKey[];
  start: string;
  end: string;
  /** Optional real official room: changing room is a first-class repair. */
  room?: { buildingId: string; roomId: string; AdRoomCode: string; AdRoomHall: string; locationStatus: "VERIFIED" };
  reasons: string[];
  blockers: number;
  reviews: number;
  gapDelta: number;
}

const SHORT_FAMILY: StudyProposalDayKey[] = ["fsunday", "ftuesday", "fthursday"];

function dayVariants(days: StudyProposalDayKey[]): StudyProposalDayKey[][] {
  const out: StudyProposalDayKey[][] = [days];
  if (days.every(d => SHORT_FAMILY.includes(d))) {
    const n = days.length;
    const subsets: StudyProposalDayKey[][] = [];
    for (let mask = 1; mask < 8; mask++) {
      const subset = SHORT_FAMILY.filter((_, i) => mask & (1 << i));
      if (subset.length === n && subset.join() !== days.join()) subsets.push(subset);
    }
    out.push(...subsets);
  }
  return out;
}

/**
 * يقترح أوقاتاً بديلةً لمادةٍ متعارضة. النمطُ والمدة محفوظان: تتحرك البداية،
 * وقد تتبدّل أيامُ اللقاء داخل الأسرة نفسها فقط (٥٠ دقيقة لا تُجعل ٨٠).
 * كلُّ بديلٍ يمرّ ببوابة الحفظ على الجدول الناتج للمقترح كلّه.
 */
export async function suggestAlternatives(
  deps: EngineDeps, req: any, input: EvaluateInput, opId: string, world?: LoadedWorld,
): Promise<{ suggestions: AlternativeSuggestion[]; note?: string }> {
  const w = world || await loadWorld(input.termId, input.instructorId);
  const op = input.ops.find(o => o.id === opId);
  if (!op) return { suggestions: [], note: "المادة غير موجودة في المقترح." };
  const duration = durationOf(op.target);
  const baseStart = timeToMinutes(op.target.fstarttime);
  if (!(duration > 0) || !Number.isFinite(baseStart)) return { suggestions: [], note: "حدّد وقت البداية والنهاية أولاً." };

  const baseEval = await evaluateProposal(deps, req, input, w);
  const baseGap = baseEval.after.metrics.gapMinutes;
  const baseDays = baseEval.after.metrics.attendanceDays;
  const without = applyProposalOps(w.termRows, input.ops.filter(o => o.id !== opId), {
    instructorId: input.instructorId, termId: input.termId, placeholderId: [...w.placeholders][0] || null,
  });
  // The source row of the operation is being moved/reassigned, so do not count
  // its old occupancy as a conflict in the quick prefilter.
  const ignoreIds = new Set([op.source?.id, op.out?.snapshot.id].filter((id): id is number => typeof id === "number"));
  const others = without.rows.filter(row => !ignoreIds.has(Number(row.id)));

  const [storedBuildings, storedRooms, requests, section, pinnedRooms] = await Promise.all([
    Repository.getLocationBuildings(), Repository.getLocationRooms(),
    Repository.getHallBarterRequests(input.termId), Repository.getSectionById(op.target.AdSectionId),
    Repository.getPinnedDepartmentRooms(op.target.AdCollegeId, op.target.AdSectionId),
  ]);
  const registry = Repository.isDemoRequest()
    ? { buildings: storedBuildings, rooms: storedRooms }
    : mergeRegistryWithSeed({ buildings: storedBuildings, rooms: storedRooms });
  const borrowIds = new Set(requests.filter(request => request.status === "approved"
    && Number(request.requesterCollegeId) === op.target.AdCollegeId
    && Number(request.requesterSectionId) === op.target.AdSectionId && request.roomId)
    .map(request => String(request.roomId)));
  const pinnedRoomIds = confirmedDepartmentRoomIds(registry, pinnedRooms, op.target.AdCollegeId);
  const official = eligibleHallsForSection(registry, op.target.AdSectionId, borrowIds, pinnedRoomIds);
  type Room = NonNullable<AlternativeSuggestion["room"]>;
  const rooms: Room[] = official.map(hall => ({
    buildingId: hall.buildingId, roomId: hall.roomId, AdRoomCode: hall.room, AdRoomHall: hall.hall, locationStatus: "VERIFIED",
  }));
  // Preserve the currently picked room even if historical room rights changed:
  // the final server verdict will decide whether it remains eligible.
  if (op.target.buildingId && op.target.roomId && !rooms.some(room => room.roomId === op.target.roomId)) {
    rooms.push({ buildingId: op.target.buildingId, roomId: op.target.roomId,
      AdRoomCode: op.target.AdRoomCode, AdRoomHall: op.target.AdRoomHall, locationStatus: "VERIFIED" });
  }
  const candidateRooms: Array<Room | null> = rooms.length ? rooms : [null];
  const bounds = scheduleDayWindowMinutes(section);
  const variants = dayVariants(daysOf(op.target));
  const course = w.catalog.courseById.get(Number(op.target.AdCourseId)) as any;
  const expectedType = String(course?.CourseRoomType || "").trim();
  const neededCapacity = Number(course?.MaxStudent || 0);
  const masterById = new Map(registry.rooms.map(room => [String(room.id), room]));

  const options: Array<{ days: StudyProposalDayKey[]; start: number; room: Room | null; rank: number }> = [];
  for (const days of variants) {
    for (let start = bounds.start; start + duration <= bounds.end; start += 10) {
      const shifted = start !== baseStart || days.join() !== daysOf(op.target).join();
      for (const room of candidateRooms) {
        const roomChanged = room ? String(room.roomId) !== String(op.target.roomId || "") : false;
        if (!shifted && !roomChanged) continue;
        const dayShift = days.join() === daysOf(op.target).join() ? 0 : 90;
        let rank = Math.abs(start - baseStart) + dayShift + (roomChanged ? 14 : 0);
        const record = room ? masterById.get(room.roomId) : undefined;
        if (expectedType && record?.roomType && record.roomType !== expectedType) rank += 35;
        if (neededCapacity > 0 && Number(record?.capacity) > 0 && Number(record?.capacity) < neededCapacity) rank += 45;
        options.push({ days, start, room, rank });
      }
    }
  }
  options.sort((a, b) => a.rank - b.rank || a.start - b.start);

  const suggestions: AlternativeSuggestion[] = [];
  let evaluated = 0;
  const MAX_FULL_CHECKS = 100;
  for (const candidate of options) {
    if (suggestions.length >= 4 || evaluated >= MAX_FULL_CHECKS) break;
    const end = candidate.start + duration;
    const busyInstructor = others.some(row => Number(row.AdInstructorId) === input.instructorId
      && candidate.days.some(day => Boolean((row as any)[day]))
      && candidate.start < timeToMinutes(row.fendtime) && timeToMinutes(row.fstarttime) < end);
    if (busyInstructor) continue;
    if (candidate.room && others.some(row =>
      candidate.days.some(day => Boolean((row as any)[day]))
      && candidate.start < timeToMinutes(row.fendtime) && timeToMinutes(row.fstarttime) < end
      && rowOccupiesRoom(row, candidate.room!.roomId, candidate.room!.AdRoomCode, candidate.room!.AdRoomHall))) continue;
    const nextOps: StudyProposalOp[] = input.ops.map(o => o.id !== opId ? o : ({
      ...o, target: {
        ...o.target, days: candidate.days, fstarttime: minutesToTime(candidate.start), fendtime: minutesToTime(end),
        ...(candidate.room || {}),
      },
    }));
    evaluated++;
    const result = await evaluateProposal(deps, req, { ...input, ops: nextOps }, w);
    // Never call an alternative good if any of the other items became blocked.
    if (!result.readiness.canSend || result.status !== "complete") continue;
    const changedRoom = candidate.room && String(candidate.room.roomId) !== String(op.target.roomId || "");
    const reasons: string[] = [];
    if (changedRoom) reasons.push(`قاعة بديلة ${candidate.room!.AdRoomCode}/${candidate.room!.AdRoomHall}`);
    if (candidate.start === baseStart && candidate.days.join() === daysOf(op.target).join()) reasons.push("يحافظ على الأيام والوقت الأصليين");
    const gapDelta = result.after.metrics.gapMinutes - baseGap;
    if (gapDelta < 0) reasons.push(`يقلّل الفراغات بمقدار ${countOf(-gapDelta, AR.minute)}`);
    else if (gapDelta === 0) reasons.push("لا يزيد الفراغات بين المحاضرات");
    if (result.after.metrics.attendanceDays <= baseDays) reasons.push(result.after.metrics.attendanceDays < baseDays ? "يقلّل أيام الحضور" : "يُبقي أيام الحضور");
    if (candidate.days.join() !== daysOf(op.target).join()) reasons.push(`أيام بديلة من النمط نفسه (${daysLabel(candidate.days)})`);
    const own = result.findings.filter(f => f.opId === opId);
    suggestions.push({
      days: candidate.days, start: minutesToTime(candidate.start), end: minutesToTime(end),
      ...(candidate.room ? { room: candidate.room } : {}),
      reasons, blockers: 0, reviews: own.filter(f => f.kind === "review").length, gapDelta,
    });
  }
  suggestions.sort((a, b) => a.reviews - b.reviews || a.gapDelta - b.gapDelta);
  const partial = evaluated >= MAX_FULL_CHECKS && suggestions.length < 4;
  return {
    suggestions,
    ...(!suggestions.length
      ? { note: partial ? "لم يظهر حل في نطاق البحث الأول. جرّب تغيير الأيام أو القاعة؛ لم يُفحص كل احتمال." : "لم يظهر وقت أو قاعة بديلة صالحة في النطاق المتاح." }
      : partial ? { note: "النتائج من نطاق البحث الأول؛ قد توجد خيارات أخرى." } : {}),
  };
}

/* ── الشعب الشاغرة («هيئة تدريسية») ─────────────────────────────────────────
 * لكل شعبةٍ شاغرةٍ في النطاق: هل تُسند لهذا الأستاذ كما هي بلا أي تعارض؟
 * لا حكمَ جديد هنا: التداخلُ مع محاضراته يُستبعد أولاً (أرخص سؤال)، ثم يمرّ
 * المرشّحُ بالفحص الكامل نفسه (`evaluateProposal`) على المقترح كلّه مضافاً إليه
 * «إسناد الشعبة كما هي». «جاهزة» تعني: لا مانع ولا ملاحظة عليها، والفحص مكتمل،
 * ولم يزد عددُ الموانع في بقية المقترح.
 */
export async function rankVacancies(
  deps: EngineDeps, req: any, input: EvaluateInput, rows: readonly FSchedule[], world: LoadedWorld,
  options: { maxChecks?: number; preferSectionId?: number } = {},
): Promise<{ vacancies: VacancyVerdict[]; checked: number; total: number; partial: boolean }> {
  const maxChecks = Math.max(0, options.maxChecks ?? 24);
  const placeholderId = [...world.placeholders].sort((a, b) => a - b)[0] || null;
  const applied = applyProposalOps(world.termRows, input.ops, { instructorId: input.instructorId, termId: input.termId, placeholderId });
  const mine = applied.rows.filter(row => Number(row.AdInstructorId) === input.instructorId);
  const used = new Set(input.ops.map(op => op.source?.id).filter((id): id is number => typeof id === "number"));
  const nameOf = (row: FSchedule) => String(world.catalog.courseById.get(Number(row.AdCourseId))?.CourseName || row.AdCourseName || "");

  const verdicts: VacancyVerdict[] = [];
  const candidates: FSchedule[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (used.has(id)) { verdicts.push({ rowId: id, fit: "used" }); continue; }
    const days = daysOf(row as any);
    const s = timeToMinutes(row.fstarttime), e = timeToMinutes(row.fendtime);
    const clash = mine.find(other => Number(other.id) !== id && days.some(day => Boolean((other as any)[day]))
      && s < timeToMinutes(other.fendtime) && timeToMinutes(other.fstarttime) < e);
    if (clash) { verdicts.push({ rowId: id, fit: "clash", clashWith: nameOf(clash) || "محاضرة" }); continue; }
    candidates.push(row);
  }
  const prefer = Number(options.preferSectionId || 0);
  candidates.sort((a, b) => (Number(b.AdSectionId) === prefer ? 1 : 0) - (Number(a.AdSectionId) === prefer ? 1 : 0)
    || timeToMinutes(a.fstarttime) - timeToMinutes(b.fstarttime) || Number(a.id) - Number(b.id));

  const baseBlockers = input.ops.length ? (await evaluateProposal(deps, req, input, world)).counts.blockers : 0;
  let checked = 0;
  for (const row of candidates) {
    const id = Number(row.id);
    if (checked >= maxChecks) { verdicts.push({ rowId: id, fit: "unchecked" }); continue; }
    checked++;
    const source = snapshotOf(row, world.catalog);
    const opId = `vacancy-${id}`;
    const op: StudyProposalOp = { id: opId, kind: "assign", source, target: specOfSnapshot(source) };
    try {
      const result = await evaluateProposal(deps, req, { ...input, ops: [...input.ops, op] }, world);
      const own = result.findings.filter(f => f.opId === opId && f.kind !== "info");
      const state = result.perOp[opId]?.state;
      const fit: VacancyFit = state === "blocked" || result.counts.blockers > baseBlockers ? "blocked"
        : state === "unchecked" || result.status !== "complete" ? "unchecked"
          : state === "review" ? "review" : "ready";
      verdicts.push({
        rowId: id, fit,
        notes: own.slice(0, 2).map(f => ({ kind: f.kind, title: f.title })),
        after: {
          loadUnits: result.after.metrics.loadUnits, sections: result.after.metrics.sections,
          attendanceDays: result.after.metrics.attendanceDays, gapMinutes: result.after.metrics.gapMinutes,
        },
      });
    } catch {
      verdicts.push({ rowId: id, fit: "unchecked" });
    }
  }
  const rank: Record<VacancyFit, number> = { ready: 0, review: 1, unchecked: 2, blocked: 3, clash: 4, used: 5 };
  const order = new Map(candidates.map((row, index) => [Number(row.id), index]));
  verdicts.sort((a, b) => rank[a.fit] - rank[b.fit] || (order.get(a.rowId) ?? 1e6) - (order.get(b.rowId) ?? 1e6) || a.rowId - b.rowId);
  return { vacancies: verdicts, checked, total: rows.length, partial: candidates.length > checked };
}

export { snapshotOf, PROPOSAL_DAY_NAMES };
export type { StudyProposalRowSnapshot };
