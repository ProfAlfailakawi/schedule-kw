/**
 * Non-blocking academic timetable advice.
 * Course progression is always read from APPROVED curriculum rules. Wishes are
 * not registrar enrolments; unverified legacy answers never become student counts.
 * This module is pure and never changes a save / sign / publish verdict.
 */
import { prereqMet, coreqMet } from "./curriculumRules";
import { normalizeClock } from "./scheduleTime";
import type { AdCourse, CurriculumRuleSet, FSchedule, StudentProfile } from "../types";

export interface AcademicPlanView {
  planId: string;
  courseIds: number[];
  rules: CurriculumRuleSet["rules"];
  groups: CurriculumRuleSet["groups"];
}
export interface AcademicSlot { day: string; start: string; end: string }
export interface AcademicOffering { section: string; slots: AcademicSlot[] }
export interface AcademicPair {
  a: number; b: number; nameA: string; nameB: string;
  /** Verified for this term against the student's own approved plan and passed courses. */
  shared: number;
  basis: "wishes" | "curriculum";
  /** One or more existing section combinations overlap. */
  overlap: boolean;
  /** Another EXISTING combination of sections avoids an overlap. */
  hasAlternative: boolean;
  /** Every existing combination overlaps; higher scheduling priority. */
  unavoidable: boolean;
  aOfferings: AcademicOffering[];
  bOfferings: AcademicOffering[];
}
export interface AcademicTimePreference { courseId: number; name: string; wanted: number; period: "morning" | "afternoon" }
export interface AcademicReading { pairs: AcademicPair[]; timePreferences: AcademicTimePreference[]; assessed: number; source: "approved-plans-and-wishes"; nonBlocking: true; decisionLab?: import("./academicDecisionLab").AcademicDecisionLab }
export interface AcademicInput {
  collegeId: number; sectionId: number; termId: number;
  plans: AcademicPlanView[];
  profiles: readonly StudentProfile[];
  courses: readonly AdCourse[];
  rows: readonly FSchedule[];
}
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
/* «09:00:00» و«9:00» ساعةٌ كـ«09:00»: كان النمطُ الصارم يُسقط موعداً مخزّناً بالثواني فيختفي تعارضٌ حقيقي. */
const minutes = (v: string) => { const x = /^(\d{2}):(\d{2})$/.exec(normalizeClock(v)); return x ? Number(x[1]) * 60 + Number(x[2]) : -1; };
const keyOf = (a: number, b: number) => Math.min(a, b) + "|" + Math.max(a, b);
const slotsOverlap = (a: AcademicSlot[], b: AcademicSlot[]) =>
  a.some(x => b.some(y => x.day === y.day && minutes(x.start) >= 0 && minutes(y.start) >= 0 &&
    minutes(x.start) < minutes(y.end) && minutes(y.start) < minutes(x.end)));

/** Only mandatory precedences make same-term enrolment impossible.
 * An "anyOf" option does not prohibit taking A with B when a different
 * alternative prerequisite has already been passed.
 */
export function mandatoryPrecedes(rules: AcademicPlanView["rules"], earlier: number, later: number): boolean {
  const map = new Map(rules.map(r => [r.courseId, r.prereq?.all || []]));
  const seen = new Set<number>();
  const visit = (at: number): boolean => {
    if (seen.has(at)) return false;
    seen.add(at);
    for (const parent of map.get(at) || []) {
      if (parent === earlier || visit(parent)) return true;
    }
    return false;
  };
  return visit(later);
}
export function analyseAcademicAdvice(input: AcademicInput): AcademicReading {
  const courseById = new Map(input.courses.map(c => [Number(c.AdCourseId), c]));
  const byPlan = new Map(input.plans.map(p => [p.planId, p]));
  const eligibleCount = new Map<string, number>();
  const periodDemand = new Map<string, number>();
  let assessed = 0;

  for (const person of input.profiles) {
    if (Number(person.AdCollegeId) !== input.collegeId || Number(person.AdSectionId) !== input.sectionId ||
      Number(person.wishes?.termId) !== input.termId) continue;
    const plan = byPlan.get(String(person.curriculumPlanId || ""));
    if (!plan) continue; // No approved plan: no eligibility assertion.
    const allowed = new Set(plan.courseIds);
    const rules = new Map(plan.rules.map(r => [Number(r.courseId), r]));
    const passed = new Set((person.passedCourseIds || []).map(Number));
    const registering = new Set((person.wishes?.courseIds || []).map(Number));
    const units = Number(person.passedUnits) || 0;
    const candidates = [...registering].filter(id => allowed.has(id) && !passed.has(id) && courseById.has(id) &&
      prereqMet(rules.get(id)?.prereq, passed, units) &&
      coreqMet(rules.get(id)?.coreq, passed, registering)).sort((a, b) => a - b);
    assessed++;
    // Restrictions are distinct from mere preferences. Only eligible requests count.
    for (const id of candidates) {
      if (person.wishes?.constraints?.noMorning === true)
        periodDemand.set(id + "|afternoon", (periodDemand.get(id + "|afternoon") || 0) + 1);
      if (person.wishes?.constraints?.noAfternoon === true)
        periodDemand.set(id + "|morning", (periodDemand.get(id + "|morning") || 0) + 1);
    }
    for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i], b = candidates[j];
      if (mandatoryPrecedes(plan.rules, a, b) || mandatoryPrecedes(plan.rules, b, a)) continue;
      const key = keyOf(a, b);
      eligibleCount.set(key, (eligibleCount.get(key) || 0) + 1);
    }
  }

  // These are ACTUAL timetable rows, not proposed times. Keep separate sections
  // separate: a clash of one pair is not proof that every combination clashes.
  const offerings = new Map<number, Map<string, AcademicOffering>>();
  for (const row of input.rows) {
    if (Number(row.AdTermId) !== input.termId || Number(row.AdCollegeId) !== input.collegeId) continue;
    const cid = Number(row.AdCourseId);
    if (!courseById.has(cid)) continue;
    const section = String(row.SCode || row.id);
    const id = cid + "|" + Number(row.AdSectionId) + "|" + section;
    const group = offerings.get(cid) || new Map<string, AcademicOffering>();
    const offer = group.get(id) || { section, slots: [] };
    for (const day of DAYS) if (row[day] && minutes(String(row.fstarttime)) >= 0 && minutes(String(row.fendtime)) > minutes(String(row.fstarttime))) {
      if (!offer.slots.some(s => s.day === day && s.start === normalizeClock(row.fstarttime) && s.end === normalizeClock(row.fendtime)))
        offer.slots.push({ day, start: normalizeClock(row.fstarttime), end: normalizeClock(row.fendtime) });
    }
    group.set(id, offer); offerings.set(cid, group);
  }
  const listed = new Set<string>();
  // Wish pairs (at least 3 students to avoid disclosure / one-off anomalies).
  for (const [key, n] of eligibleCount) if (n >= 3) listed.add(key);
  // Curriculum siblings: potential coordination opportunity, never a
  // claim that a particular student wants or can register both.
  for (const plan of input.plans) {
    const own = plan.rules.filter(r => plan.courseIds.includes(r.courseId) &&
      Number(courseById.get(r.courseId)?.AdSectionId) === input.sectionId);
    for (let i = 0; i < own.length; i++) for (let j = i + 1; j < own.length; j++) {
      const a = own[i], b = own[j];
      if (!a.prereq?.all?.length || !b.prereq?.all?.length ||
        !a.prereq.all.some(id => b.prereq!.all.includes(id))) continue;
      if (mandatoryPrecedes(plan.rules, a.courseId, b.courseId) || mandatoryPrecedes(plan.rules, b.courseId, a.courseId)) continue;
      listed.add(keyOf(a.courseId, b.courseId));
    }
  }
  const pairs: AcademicPair[] = [];
  for (const key of listed) {
    const [a, b] = key.split("|").map(Number);
    const ac = courseById.get(a), bc = courseById.get(b);
    if (!ac || !bc || (Number(ac.AdSectionId) !== input.sectionId && Number(bc.AdSectionId) !== input.sectionId)) continue;
    const ao = [...(offerings.get(a)?.values() || [])].filter(o => o.slots.length);
    const bo = [...(offerings.get(b)?.values() || [])].filter(o => o.slots.length);
    // One missing course is an opening/registration issue, not a timetable conflict.
    if (!ao.length || !bo.length) continue;
    const combinations = ao.flatMap(x => bo.map(y => slotsOverlap(x.slots, y.slots)));
    const overlap = combinations.some(Boolean);
    const basis = (eligibleCount.get(key) || 0) >= 3 ? "wishes" : "curriculum";
    if (!overlap && basis === "curriculum") continue;
    pairs.push({
      a, b, nameA: String(ac.CourseName || ac.CourseCode), nameB: String(bc.CourseName || bc.CourseCode),
      shared: basis === "wishes" ? eligibleCount.get(key)! : 0, basis,
      overlap, hasAlternative: combinations.some(x => !x), unavoidable: combinations.length > 0 && combinations.every(Boolean),
      aOfferings: ao, bOfferings: bo,
    });
  }
  // A course meets a restriction only if an EXISTING full section fits it on every day.
  // Noon is the boundary; do not call a 12:30 class "morning".
  const timePreferences: AcademicTimePreference[] = [...periodDemand].flatMap(([key, wanted]) => {
    if (wanted < 3) return [];
    const [rawId, rawPeriod] = key.split("|");
    const courseId = Number(rawId);
    const period = rawPeriod as AcademicTimePreference["period"];
    const offered = [...(offerings.get(courseId)?.values() || [])].filter(o => o.slots.length);
    if (!offered.length) return [];
    const fits = (slot: AcademicSlot) => period === "afternoon"
      ? minutes(slot.start) >= 12 * 60
      : minutes(slot.end) <= 12 * 60;
    if (offered.some(section => section.slots.every(fits))) return [];
    return [{ courseId, name: String(courseById.get(courseId)?.CourseName || ""), wanted, period }];
  }).sort((a, b) => b.wanted - a.wanted || a.name.localeCompare(b.name, "ar")).slice(0, 24);
  // Priority: students likely affected first, then pairs without any existing alternative.
  pairs.sort((a, b) => (b.basis === "wishes" ? b.shared : 0) - (a.basis === "wishes" ? a.shared : 0) ||
    Number(b.unavoidable) - Number(a.unavoidable) || Number(b.overlap) - Number(a.overlap) ||
    a.nameA.localeCompare(b.nameA, "ar"));
  return { pairs: pairs.slice(0, 160), timePreferences, assessed, source: "approved-plans-and-wishes", nonBlocking: true };
}
