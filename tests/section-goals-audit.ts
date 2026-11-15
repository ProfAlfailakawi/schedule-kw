/**
 * ── أهداف «نزّل الشعب»: ترتيبٌ فقط، والقيود الصلبة كما هي ──
 * (١) «متوازن» والغياب يخرجان المخرج الأصلي بعينه (بصمةٌ مثبَّتة من قبل إضافة الأهداف).
 * (٢) لا هدفٌ يُنتج تعارضاً ولا يتجاوز نصاباً ولا يضع شعبةً في قاعةٍ مزدحمة.
 * (٣) كل هدفٍ يفعل ما يقوله حين يوجد أكثر من حلٍّ مشروع.
 */
import { readSectionOpenings } from "../src/utils/sectionOpening";
import { demandFromTargets, gapRows } from "../src/utils/sectionBuild";
import { SECTION_GOALS, bestPerMetric, goalMetrics, isSectionGoal, type SectionGoal } from "../src/utils/sectionGoals";
import { findConflicts } from "../src/utils/scheduleIntelligence";
import type { AdCourse, AdInstructor, FSchedule, MasterRoom } from "../src/types";

const check = (ok: boolean, label: string) => { if (!ok) throw new Error(`✗ ${label}`); console.log(`✓ ${label}`); };
const mk = (id: number, code: string): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 11, CourseCode: code, CourseName: `مقرر ${code}`, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
const courses = [mk(1, "0101101"), mk(2, "0101102"), mk(3, "0101201")];
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const row = (id: number, courseId: number, scode: string, room: string, start: string, instructor: number, building = "b"): FSchedule => ({
  id, AdCollegeId: 1, AdSectionId: 11, AdTermId: 7, AdCourseId: courseId, AdCourseName: `مقرر ${courseId}`, SCode: scode, AdInstructorId: instructor,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: start, fendtime: start.replace(/^(\d\d)/, h => String(Number(h) + 1).padStart(2, "0")),
  AdRoomCode: room, AdRoomHall: "1", buildingId: building, roomId: room, locationStatus: "VERIFIED",
} as any);
const week = [row(1, 1, "1", "r1", "08:00", 1), row(2, 1, "2", "r1", "09:00", 1), row(10, 2, "1", "r2", "08:00", 2)];
const history = [...week, row(20, 3, "1", "r3", "11:00", 3, "c"), row(21, 1, "9", "r2", "12:00", 2), row(22, 1, "8", "r3", "12:00", 3, "c"), row(23, 3, "2", "r1", "13:00", 1)];
const gaps = gapRows(courses, new Map([[1, 4], [2, 3], [3, 2]]), week);
const levelOf = (id: number) => id === 3 ? 2 : 1;
const demand = demandFromTargets(gaps, () => 30, levelOf);
const people: AdInstructor[] = [1, 2, 3].map(id => ({ AdInstructorId: id, AdInstructorName: `أستاذ ${id}`, AdInstructorCivil: "", AdInstructorMobile: "", AdInstructorLoad: 30 } as any));
const rooms: MasterRoom[] = [["r1", "b"], ["r2", "b"], ["r3", "c"]].map(([id, b]) => ({ id, buildingId: b, buildingCode: b.toUpperCase(), canonicalCode: id, capacity: 40, active: true, aliases: [], collegeIds: [1], sectionIds: [11], shared: false, historicalUsageCount: 1, confidence: "CONFIRMED", source: "T", adminVerified: true, evidence: [], auditHistory: [] } as any));
const rhythm: any = { forDay: () => ({ ladder: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00"] }), patterns: [{ durationMinutes: 60 }], learnedFrom: { rows: 1, terms: 1 } };
const run = (goal?: SectionGoal) => readSectionOpenings(week, week, courses, people, history, demand, null, rhythm, 0, 999, rooms, 7, ...(goal ? [goal] : [])) as any;
const flat = (reading: any) => reading.proposals.flatMap((p: any) => p.placements.map((pl: any) => ({ c: p.courseId, ...pl })));

check(isSectionGoal("rooms") && !isSectionGoal("x") && SECTION_GOALS.length === 4 && SECTION_GOALS[0].id === "balanced", "أربعة أهداف أولها «متوازن»");
const base = flat(run());
check(base.length >= 4, "الأساس يضع شعباً فعلاً");
check(JSON.stringify(run("balanced")) === JSON.stringify(run()), "«متوازن» = الغياب حرفاً بحرف");
/* بصمة المخرج الأصلي قبل إضافة الأهداف (من HEAD): يتغيّر بتغيّر المحرّك لا بالأهداف. */
const PINNED = '[[1,"fsunday","09:00","r3",2,"501"],[1,"fsunday","10:00","r2",1,"502"],[2,"fsunday","13:00","r1",2,"501"],[2,"fmonday","08:00","r1",2,"502"],[3,"fmonday","11:00","r1",3,"501"],[3,"fmonday","11:00","r2",1,"502"]]';
check(JSON.stringify(base.map((p: any) => [p.c, p.day, p.start, p.roomId, p.instructorId, p.sectionCode])) === PINNED, "المخرج الأصلي لم يتغيّر");

const invariants = (goal: SectionGoal) => {
  const reading = run(goal), placed = flat(reading);
  const added: FSchedule[] = placed.map((pl: any, i: number) => ({ ...row(100 + i, pl.c, pl.sectionCode, pl.roomId, pl.start, pl.instructorId, pl.buildingId), fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, [pl.day]: true, fendtime: pl.end } as any));
  const all = [...week, ...added];
  const pairs = new Set<string>(demand.pairs.map(p => `${p.a}|${p.b}`));
  check(findConflicts(added, all, { cohortPairs: pairs, doorwayMinutes: 0 }).length === 0, `${goal}: لا تعارض`);
  const overlap = (a: any, b: any) => a !== b && DAYS.some(d => a[d] && b[d]) && a.fstarttime < b.fendtime && b.fstarttime < a.fendtime && (a.roomId === b.roomId || a.AdInstructorId === b.AdInstructorId);
  check(added.every(a => all.every(b => !overlap(a, b))), `${goal}: لا قاعة مزدوجة ولا أستاذ في مكانين`);
  check(placed.every((p: any) => rooms.some(r => r.id === p.roomId && r.capacity >= 30) && /^[5-9]\d\d$/.test(p.sectionCode)), `${goal}: قاعاتٌ موثّقة تتّسع، ورموزٌ صالحة`);
  check(placed.length === base.length, `${goal}: لا يُسقط ما وضعه الأساس (${placed.length})`);
  check(reading.proposals.every((p: any) => p.placements.length <= p.needed), `${goal}: لا يزيد على المطلوب`);
  return placed;
};
const byGoal = Object.fromEntries(SECTION_GOALS.map(g => [g.id, invariants(g.id)])) as Record<SectionGoal, any[]>;

const loadSpread = (placed: any[]) => { const n = new Map<number, number>(); for (const p of placed) n.set(p.instructorId, (n.get(p.instructorId) || 0) + 1); return [...n.values()]; };
check(Math.max(...loadSpread(byGoal.teachers)) <= Math.max(...loadSpread(byGoal.balanced)), "راحة الأساتذة: لا أسوأ توزيعاً من المتوازن");
check(new Set(byGoal.rooms.map((p: any) => p.roomId)).size <= new Set(byGoal.balanced.map((p: any) => p.roomId)).size, "قاعات أقل: ليست أكثر قاعاتٍ من المتوازن");
check(new Set(byGoal.rooms.map((p: any) => p.buildingId)).size <= new Set(byGoal.balanced.map((p: any) => p.buildingId)).size, "قاعات أقل: ليست أكثر مبانيَ من المتوازن");
const metricsOf = (goal: SectionGoal) => {
  const reading = run(goal);
  return goalMetrics(reading.proposals.map((p: any) => ({ courseId: p.courseId, remaining: p.needed, unplaced: p.needed - p.placements.length, reason: p.unplacedReason || "", placements: p.placements })), week, levelOf);
};
const students = metricsOf("students"), balanced = metricsOf("balanced");
check(students.gapMinutes <= balanced.gapMinutes, `الطلبة أولاً: فراغٌ ${students.gapMinutes} ≤ ${balanced.gapMinutes}`);
check(SECTION_GOALS.every(g => metricsOf(g.id).clashes === 0 && metricsOf(g.id).placed === balanced.placed), "المقاييس: لا تعارض وعدد الموضوع ثابت");
const best = bestPerMetric(SECTION_GOALS.map(g => ({ goal: g.id, metrics: metricsOf(g.id) })));
check(Object.values(best).every(list => list.length < 4), "النجمة لا تُمنح عند التعادل التام");
check(bestPerMetric([{ goal: "balanced", metrics: { ...balanced, rooms: 3 } }, { goal: "rooms", metrics: { ...balanced, rooms: 1 } }]).rooms.join() === "rooms", "النجمة للأقل قاعاتٍ");
console.log("OK");
