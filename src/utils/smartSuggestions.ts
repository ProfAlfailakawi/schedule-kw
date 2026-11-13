/**
 * ── اقتراحاتٌ ذكية فوق الجدول الحيّ ─────────────────────────────────────────
 *
 * أربعة أسئلة يسألها رئيس اللجنة كل فصل، كلُّها دالّاتٌ نقيّة فوق سياق آلة الزمن
 * (TmContext) ومحرّكاتها، بلا كتابة ولا شبكة:
 *   ١) أستاذٌ بدل «هيئة تدريسية» أو هيئة التدريب: عضوٌ حقيقيٌّ متاحٌ في الوقت نفسه
 *      وتحت نصابه يأخذ الشعبة.
 *   ٢) قاعةٌ في مكانها: مقررٌ في قاعةٍ من غير نوعه وقاعتُه الملائمة فارغة في وقته،
 *      فيعود إليها — ويُفسح مكانه لمقررٍ يحتاج تلك القاعة إن وُجد.
 *   ٣) «أريد حذف مقرر»: حكمٌ واضح (يُنصح / بحذر / لا يُنصح) بأسبابه.
 *   ٤) تحويل النمط: كتلةٌ واحدة طويلة ← نمطٌ بيومين من المكتبة بأطواله وسُلّم بداياته؛ ما يُوفَّر وما يُستهلك.
 *
 * كلُّ تغييرٍ مقترح يمرّ بفحص الحفظ نفسه (لا تعارض جديد، والصفوف المغيّرة نظيفة)
 * قبل أن يُعرض، ولا يُعتمد إلا من منضدة السيناريو (اعتمادٌ ذرّي واستعادة بنقرة).
 */
import type { FSchedule } from "../types";
import {
  TM_DAYS, applyChanges, blockingConflicts, changeId, changedRowsClear, compareBoards, courseMapOf, dayLabel, hallKey, hallLabel, hallOfRow,
  limitOf, placeholderIdsOf, rowHall, scopeOf, sectionKey, tmCourseNumber, verifyNoNewBlocking,
  type TmChange, type TmContext, type TmDelta, type TmHall,
} from "./timeMachine";
import { activeDays, minutesToTime, timeToMinutes, type DayKey } from "./scheduleIntelligence";
import { weeklyLoadOf } from "./instructorRequestVerdict";
import { effectiveCourseHours, ladderStartNear, patternOnDays, type DayKey as RegulationDay } from "./scheduleRegulations";
import { roomIdentityKey } from "./locationRegistry";
import { roomSuitability } from "./roomSuitability";
import { isTrainingAssistant } from "./taConversion";
import { isAssignableInstructor } from "./instructorStatus";
import { AR, countOf } from "./arabicCount";

export interface SmartSuggestion {
  id: string;
  kind: "faculty" | "room";
  title: string;
  /** سببٌ أو سببان، بكلماتٍ قليلة. */
  why: string[];
  changes: TmChange[];
  delta: TmDelta;
}

const busyOverlap = (a: FSchedule, days: DayKey[], start: number, end: number) =>
  days.some(day => (a as any)[day]) && timeToMinutes(a.fstarttime) < end && start < timeToMinutes(a.fendtime);

/** مقبولٌ للعرض: لا تعارض جديد، والصفوف المغيّرة تمرّ بفحص الحفظ. */
function safe(base: FSchedule[], changes: TmChange[], context: TmContext): FSchedule[] | null {
  const after = applyChanges(base, changes);
  return verifyNoNewBlocking(base, after, context) && changedRowsClear(base, after, context) ? after : null;
}

/* ── ١) عضوُ هيئة تدريس بدل «هيئة تدريسية» أو هيئة التدريب ─────────────── */

export function facultySwaps(context: TmContext, max = 4): SmartSuggestion[] {
  const base = [...context.rows, ...context.outside];
  const inScope = scopeOf(context);
  const placeholders = placeholderIdsOf(context);
  const people = new Map(context.instructors.map(person => [Number(person.AdInstructorId), person] as const));
  const courses = courseMapOf(context);
  const weak = (id: number) => placeholders.has(id) || isTrainingAssistant(people.get(id));
  const faculty = context.instructors.filter(person => {
    const id = Number(person.AdInstructorId);
    return id > 0 && !weak(id) && isAssignableInstructor(person);
  });
  const sections = new Map<string, FSchedule[]>();
  for (const row of base.filter(inScope)) {
    if (!weak(Number(row.AdInstructorId))) continue;
    const key = sectionKey(row);
    sections.set(key, [...(sections.get(key) || []), row]);
  }
  const out: SmartSuggestion[] = [];
  for (const [key, rows] of sections) {
    const courseId = Number(key.split("|")[0]);
    const course = courses.get(courseId);
    const hours = effectiveCourseHours(course);
    const ids = new Set(rows.map(row => Number(row.id)));
    const ranked = faculty.map(person => {
      const id = Number(person.AdInstructorId);
      const mine = base.filter(row => Number(row.AdInstructorId) === id && !ids.has(Number(row.id)));
      const free = rows.every(row => !mine.some(other => busyOverlap(other, activeDays(row), timeToMinutes(row.fstarttime), timeToMinutes(row.fendtime))));
      if (!free) return null;
      const load = weeklyLoadOf(mine, courses);
      const limit = limitOf(context, id);
      if (limit !== null && load + hours > limit) return null;
      const teaches = mine.some(row => Number(row.AdCourseId) === courseId);
      const spare = limit === null ? null : limit - load;
      return { person, id, teaches, spare, rank: (teaches ? 0 : 20) + (spare === null ? 8 : Math.max(0, 10 - spare)) };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item)).sort((a, b) => a.rank - b.rank);
    const holder = people.get(Number(rows[0].AdInstructorId));
    const holderLabel = placeholders.has(Number(rows[0].AdInstructorId)) ? "هيئة تدريسية" : `TA ${holder?.AdInstructorName || ""}`.trim();
    for (const pick of ranked) {
      const change: TmChange = {
        id: changeId("f"), op: "assign", rowIds: rows.map(row => Number(row.id)), instructorId: pick.id,
        label: `${tmCourseNumber(course, context)} ش${rows[0].SCode} ← ${pick.person.AdInstructorName}`,
        why: `بدل ${holderLabel}`,
      };
      const after = safe(base, [change], context);
      if (!after) continue;
      out.push({
        id: change.id, kind: "faculty", title: change.label,
        why: [`بدل ${holderLabel}`, "متاحٌ في الوقت نفسه", pick.teaches ? "يدرّس المقرر" : pick.spare !== null ? `نصاب متاح ${pick.spare}` : ""].filter(Boolean),
        changes: [change], delta: compareBoards(base, after, context),
      });
      break;
    }
    if (out.length >= max) break;
  }
  return out;
}

/* ── ٢) القاعة في مكانها: النوعُ الملائم فارغٌ في الوقت نفسه ────────────── */

function hallFree(board: FSchedule[], hall: TmHall, days: DayKey[], start: number, end: number, ignore: Set<number>): boolean {
  const key = hallKey(hall);
  return !board.some(row => !ignore.has(Number(row.id)) && roomIdentityKey(row) === key && busyOverlap(row, days, start, end));
}

export function roomSwaps(context: TmContext, max = 4): SmartSuggestion[] {
  const base = [...context.rows, ...context.outside];
  const inScope = scopeOf(context);
  const courses = courseMapOf(context);
  const fitOf = (row: FSchedule, hall: TmHall | null) => roomSuitability(courses.get(Number(row.AdCourseId)), hall ? { roomType: hall.roomType, capacity: hall.capacity } : null);
  const scopeRows = base.filter(inScope);
  /* مقررٌ له نوعُ قاعةٍ مسجّل، وهو الآن في قاعةٍ من نوعٍ آخر. */
  const misplaced = scopeRows.filter(row => {
    const expected = String(courses.get(Number(row.AdCourseId))?.CourseRoomType || "").trim();
    const hall = hallOfRow(row, context.halls);
    return expected && hall?.roomType && hall.roomType !== expected;
  });
  const out: SmartSuggestion[] = [];
  const used = new Set<number>();
  for (const row of misplaced) {
    if (used.has(Number(row.id))) continue;
    const course = courses.get(Number(row.AdCourseId));
    const expected = String(course?.CourseRoomType || "").trim();
    const days = activeDays(row), start = timeToMinutes(row.fstarttime), end = timeToMinutes(row.fendtime);
    const own = hallOfRow(row, context.halls);
    const proper = context.halls
      .filter(hall => hall.roomType === expected && hallKey(hall) !== roomIdentityKey(row))
      .map(hall => ({ hall, fit: fitOf(row, hall) }))
      .filter(item => item.fit.typeRank === 2)
      .sort((a, b) => b.fit.adjustment - a.fit.adjustment);
    for (const { hall } of proper) {
      if (!hallFree(base, hall, days, start, end, new Set([Number(row.id)]))) continue;
      const first: TmChange = {
        id: changeId("r"), op: "move", rowId: Number(row.id), hall,
        label: `${tmCourseNumber(course, context)} ش${row.SCode} ← ${hallLabel(hall)}`,
        why: `${expected} · كان في ${hallLabel(row)}`,
      };
      const changes: TmChange[] = [first];
      const why = [`${hallLabel(hall)} ${expected} وفارغة في وقته`];
      /* يُفسح القاعة القديمة لمقررٍ يحتاج نوعها وهو اليوم في غير مكانه. */
      if (own?.roomType) {
        const moved = applyChanges(base, changes);
        const taker = misplaced.find(other => other !== row && !used.has(Number(other.id))
          && String(courses.get(Number(other.AdCourseId))?.CourseRoomType || "").trim() === own.roomType
          && hallFree(moved, own, activeDays(other), timeToMinutes(other.fstarttime), timeToMinutes(other.fendtime), new Set([Number(other.id)])));
        if (taker) {
          changes.push({
            id: changeId("r"), op: "move", rowId: Number(taker.id), hall: own, cause: first.id,
            label: `${tmCourseNumber(courses.get(Number(taker.AdCourseId)), context)} ش${taker.SCode} ← ${hallLabel(own)}`,
            why: `تحرّرت ${hallLabel(own)} وهي ${own.roomType}`,
          });
          why.push(`تُفسح ${hallLabel(own)} لمقررٍ يحتاجها`);
        }
      }
      const after = safe(base, changes, context);
      if (!after) continue;
      changes.forEach(change => used.add(Number((change as any).rowId)));
      out.push({ id: first.id, kind: "room", title: changes.map(change => change.label).join(" · "), why, changes, delta: compareBoards(base, after, context) });
      break;
    }
    if (out.length >= max) break;
  }
  return out;
}

/* ── ٣) «أريد حذف مقرر»: حكمٌ بأسبابه ─────────────────────────────────── */

export type RemovalTone = "go" | "care" | "stop";
export interface RemovalReason { tone: RemovalTone; text: string }
export interface RemovalVerdict {
  courseId: number;
  label: string;
  tone: RemovalTone;
  headline: string;
  reasons: RemovalReason[];
  sections: number;
  changes: TmChange[];
  delta: TmDelta | null;
}

const KIND_LABEL: Record<string, string> = { compulsory: "إجباري في الصحيفة", college: "متطلب كلية", university: "متطلب جامعة", elective: "اختياري" };

export function courseRemovalVerdict(context: TmContext, courseId: number): RemovalVerdict | null {
  const base = [...context.rows, ...context.outside];
  const inScope = scopeOf(context);
  const courses = courseMapOf(context);
  const course = courses.get(Number(courseId));
  if (!course) return null;
  const label = `${tmCourseNumber(course, context)} ${course.CourseName}`;
  const rows = base.filter(row => inScope(row) && Number(row.AdCourseId) === Number(courseId));
  const sections = new Set(rows.map(sectionKey)).size;
  const reasons: RemovalReason[] = [];
  const push = (tone: RemovalTone, text: string) => reasons.push({ tone, text });
  if (!rows.length) {
    return { courseId, label, tone: "go", headline: "غير مطروح هذا الفصل — لا شيء يُحذف", reasons: [], sections: 0, changes: [], delta: null };
  }
  /* الطلبة: الطلب الفعلي من تقرير التسجيل أولاً (أرقامٌ حقيقية)، ثم الرادار ثم كشف المتبقي. */
  const actual = context.actualDemand?.[String(courseId)];
  if (actual) {
    if (actual.graduates > 0) push("stop", `يمسّ ${countOf(actual.graduates, AR.graduate)} (تقرير التسجيل)`);
    if (actual.students > 0) push(actual.students >= 20 ? "stop" : "care", `${countOf(actual.students, AR.student)} يحتاجونه (تقرير التسجيل)`);
    else push("go", "لا طالب يحتاجه في تقرير التسجيل");
  }
  const demand = context.demand?.[String(courseId)];
  if (demand) {
    if (demand.seated > 0) push("stop", `${countOf(demand.seated, AR.student)} جالسون فيه الآن`);
    else if (demand.wanted > 0) push("care", `${countOf(demand.wanted, AR.student)} يطلبونه`);
    else push("go", "لا طلب عليه في الرادار");
  }
  const remainingKnown = context.registration?.remaining ? String(courseId) in context.registration.remaining : false;
  const remaining = Number(context.registration?.remaining?.[String(courseId)] || 0);
  if (remaining > 0) push("stop", `${countOf(remaining, AR.student)} لم يجتازوه بعد (كشف المتبقي) — قد يتأخر تخرّجهم`);
  /* غيابُ الدليل ليس صفراً: بلا رادارٍ ولا كشفِ متبقٍّ لهذا المقرر لا يُقال «آمن». */
  if (!actual && !demand && !remainingKnown) push("care", "لا بيانات طلبة له (لا رادار ولا كشف متبقٍّ) — أثره على الطلبة غير معروف");
  /* الصحيفة: النوع والمستوى وما يفتحه. */
  const fact = context.plan?.[String(courseId)];
  if (fact?.kind === "compulsory") push("stop", KIND_LABEL.compulsory);
  else if (fact?.kind && KIND_LABEL[fact.kind]) push(fact.kind === "elective" ? "go" : "care", KIND_LABEL[fact.kind]);
  if (fact?.level) push(fact.level >= 300 ? "care" : "go", `المستوى ${fact.level}`);
  const unlocks = (fact?.unlocks || []).map(id => courses.get(id)).filter(Boolean);
  if (unlocks.length) push("stop", `متطلبٌ سابق لـ ${unlocks.slice(0, 3).map(item => tmCourseNumber(item, context)).join("، ")}${unlocks.length > 3 ? "…" : ""}`);
  if (!context.plan) push("care", "لا قواعد صحيفة معتمدة للقسم — الأثر على الخطة غير معروف");
  /* الأساتذة: النصاب بعد الحذف. */
  const ids = new Set(rows.map(row => Number(row.id)));
  const after = base.filter(row => !ids.has(Number(row.id)));
  const placeholders = placeholderIdsOf(context);
  const teachers = [...new Set(rows.map(row => Number(row.AdInstructorId)))].filter(id => id > 0 && !placeholders.has(id));
  const people = new Map(context.instructors.map(person => [Number(person.AdInstructorId), person] as const));
  for (const id of teachers) {
    const limit = limitOf(context, id);
    if (limit === null || limit <= 0) continue;
    const before = weeklyLoadOf(base.filter(row => Number(row.AdInstructorId) === id), courses);
    const left = weeklyLoadOf(after.filter(row => Number(row.AdInstructorId) === id), courses);
    if (left < limit && before >= limit) push("care", `${people.get(id)?.AdInstructorName || "أستاذ"}: النصاب ${before} ← ${left} من ${limit}`);
  }
  /* القاعات: ما يتحرّر. */
  const slots = rows.reduce((sum, row) => sum + activeDays(row).length, 0);
  push("go", `تتحرّر ${countOf(slots, AR.slot)} في ${[...new Set(rows.map(row => hallLabel(row)))].join("، ")}`);
  const tone: RemovalTone = reasons.some(item => item.tone === "stop") ? "stop" : reasons.some(item => item.tone === "care") ? "care" : "go";
  const headline = tone === "stop" ? "لا يُنصح بحذفه" : tone === "care" ? "ممكن بحذر" : "حذفه آمن";
  const changes: TmChange[] = [...new Set(rows.map(sectionKey))].map(key => ({
    id: changeId("x"), op: "remove" as const, rowIds: rows.filter(row => sectionKey(row) === key).map(row => Number(row.id)),
    label: `حذف ${tmCourseNumber(course, context)} ش${key.split("|")[1]}`,
  }));
  const order: Record<RemovalTone, number> = { stop: 0, care: 1, go: 2 };
  reasons.sort((a, b) => order[a.tone] - order[b.tone]);
  return { courseId, label, tone, headline, reasons, sections, changes, delta: compareBoards(base, after, context) };
}

/* ── ٤) تحويل النمط: كتلةٌ طويلة ← نمطٌ بيومين من المكتبة على سُلّم البدايات (قراءةٌ فقط) ── */

export interface PatternCandidate { rowId: number; label: string; day: DayKey; start: string; end: string; hall: string; minutes: number }

/** صفوفٌ في يومٍ واحد مدتها ساعتان ونصف أو أكثر: مرشّحةٌ للقسمة على يومين. */
export function patternCandidates(context: TmContext): PatternCandidate[] {
  const courses = courseMapOf(context);
  return context.rows.filter(scopeOf(context)).map(row => {
    const days = activeDays(row);
    const minutes = timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime);
    if (days.length !== 1 || minutes < 150) return null;
    const course = courses.get(Number(row.AdCourseId));
    return { rowId: Number(row.id), label: `${tmCourseNumber(course, context)} ش${row.SCode} ${course?.CourseName || ""}`.trim(), day: days[0], start: row.fstarttime, end: row.fendtime, hall: hallLabel(row), minutes };
  }).filter((item): item is PatternCandidate => Boolean(item))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

export interface PatternRowResult {
  rowId: number;
  label: string;
  before: string;
  after: string;
  hall: string;
  /** القاعة نفسها، أو بديلٌ ملائم، أو لا مكان. */
  room: "same" | "other" | "none";
  teacherFree: boolean;
  approved: boolean | null;
}
export interface PatternResult {
  rows: PatternRowResult[];
  /** أيامُ القاعات المشغولة (قاعة × يوم) قبل وبعد. */
  roomDays: { before: number; after: number };
  /** نوافذُ متصلة ≥ ٣ ساعات في قاعات هذه المقررات، قبل وبعد. */
  longWindows: { before: number; after: number };
  blocking: { before: number; after: number };
}

function longWindowsIn(board: FSchedule[], halls: string[], minutes = 180): number {
  let count = 0;
  const open = timeToMinutes("08:00"), close = timeToMinutes("20:00");
  for (const key of halls) for (const day of TM_DAYS) {
    const busy = board.filter(row => roomIdentityKey(row) === key && (row as any)[day])
      .map(row => [timeToMinutes(row.fstarttime), timeToMinutes(row.fendtime)] as const).sort((a, b) => a[0] - b[0]);
    let cursor = open;
    for (const [start, end] of busy) { if (start - cursor >= minutes) count += 1; cursor = Math.max(cursor, end); }
    if (close - cursor >= minutes) count += 1;
  }
  return count;
}

export function simulatePatternConversion(context: TmContext, rowIds: number[], target: [DayKey, DayKey]): PatternResult {
  const base = [...context.rows, ...context.outside];
  const courses = courseMapOf(context);
  const placeholders = placeholderIdsOf(context);
  let board = base;
  const results: PatternRowResult[] = [];
  const touchedHalls = new Set<string>();
  for (const id of rowIds) {
    const row = board.find(item => Number(item.id) === Number(id));
    if (!row) continue;
    const course = courses.get(Number(row.AdCourseId));
    const label = `${tmCourseNumber(course, context)} ش${row.SCode}`;
    const before = `${dayLabel(activeDays(row)[0])} ${row.fstarttime}–${row.fendtime}`;
    /* الأيامُ والأطوالُ من مكتبة الأنماط وحدها (patternOnDays)، والبدايةُ من سُلّم اللائحة (م.7/8):
       لا نصفَ مدّةٍ ولا بدايةَ خارج السُّلّم. زوجٌ ليس نمطاً لساعات المقرر لا يُحوَّل إليه. */
    const hours = effectiveCourseHours(course);
    const pattern = hours > 0 ? patternOnDays(hours, target as RegulationDay[]) : null;
    const longest = pattern ? Math.max(...pattern.minutesPerDay) : 0;
    const startText = pattern ? ladderStartNear(target as RegulationDay[], timeToMinutes(row.fstarttime), longest) : null;
    if (!pattern || !startText) {
      results.push({ rowId: Number(row.id), label, before, after: target.map(dayLabel).join(" + "), hall: "—", room: "none", teacherFree: true, approved: hours > 0 ? false : null });
      continue;
    }
    const startMin = timeToMinutes(startText);
    /* لقاءاتٌ متساوية صفٌّ واحد بيومين؛ وغيرُ المتساوية (170/110) صفٌّ لكل طول. */
    const groups = new Map<number, DayKey[]>();
    pattern.days.forEach((day, index) => groups.set(pattern.minutesPerDay[index], [...(groups.get(pattern.minutesPerDay[index]) || []), day as DayKey]));
    const meetings = [...groups.entries()].map(([minutes, days]) => ({ days, end: startMin + minutes }));
    const ignore = new Set([Number(row.id)]);
    const teacher = Number(row.AdInstructorId);
    const teacherFree = placeholders.has(teacher) || !board.some(other => !ignore.has(Number(other.id)) && Number(other.AdInstructorId) === teacher
      && meetings.some(meeting => busyOverlap(other, meeting.days, startMin, meeting.end)));
    const freeFor = (candidate: TmHall) => meetings.every(meeting => hallFree(board, candidate, meeting.days, startMin, meeting.end, ignore));
    const own = rowHall(row);
    let hall: TmHall | null = freeFor(own) ? own : null;
    let room: PatternRowResult["room"] = hall ? "same" : "none";
    if (!hall) {
      const expected = String(course?.CourseRoomType || "").trim();
      hall = context.halls.filter(item => !expected || item.roomType === expected).find(freeFor) || null;
      if (hall) room = "other";
    }
    touchedHalls.add(roomIdentityKey(row));
    if (hall) touchedHalls.add(hallKey(hall));
    results.push({
      rowId: Number(row.id),
      label, before,
      after: meetings.map(meeting => `${meeting.days.map(dayLabel).join(" + ")} ${startText}–${minutesToTime(meeting.end)}`).join(" · "),
      hall: hall ? hallLabel(hall) : "—",
      room, teacherFree, approved: true,
    });
    if (hall) {
      const [first, ...rest] = meetings;
      board = applyChanges(board, [{ id: changeId("p"), op: "move", rowId: Number(row.id), days: first.days, start: startText, end: minutesToTime(first.end), hall, label: "" }]);
      const moved = board.find(item => Number(item.id) === Number(row.id))!;
      if (rest.length) board = applyChanges(board, [{ id: changeId("p"), op: "add", label: "", rows: rest.map((meeting, index) => ({
        ...moved, id: -(Number(row.id) * 10 + index + 1), fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
        ...Object.fromEntries(meeting.days.map(day => [day, true])), fendtime: minutesToTime(meeting.end),
      }) as FSchedule) }]);
    }
  }
  const scope = scopeOf(context);
  const roomDays = (rows: FSchedule[]) => new Set(rows.filter(scope).flatMap(row => activeDays(row).map(day => `${roomIdentityKey(row)}|${day}`))).size;
  const halls = [...touchedHalls].filter(Boolean);
  const blocking = (rows: FSchedule[]) => verifyCount(rows, context);
  return {
    rows: results,
    roomDays: { before: roomDays(base), after: roomDays(board) },
    longWindows: { before: longWindowsIn(base, halls), after: longWindowsIn(board, halls) },
    blocking: { before: blocking(base), after: blocking(board) },
  };
}

function verifyCount(board: FSchedule[], context: TmContext): number {
  return blockingConflicts(board.filter(scopeOf(context)), board, placeholderIdsOf(context)).length;
}

/** المقرراتُ المطروحة في النطاق، لقائمة «احذف مقرراً». */
export function offeredCourses(context: TmContext): Array<{ id: number; label: string }> {
  const courses = courseMapOf(context);
  const ids = [...new Set(context.rows.filter(scopeOf(context)).map(row => Number(row.AdCourseId)))];
  return ids.map(id => ({ id, label: `${tmCourseNumber(courses.get(id), context)} · ${courses.get(id)?.CourseName || ""}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}
