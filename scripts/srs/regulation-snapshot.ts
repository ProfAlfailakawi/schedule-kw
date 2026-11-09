/**
 * لقطةُ اللائحة كما يطبّقها الكود (docs/srs/regulation.snapshot.json).
 *
 * لا رقمَ يُنسخ هنا باليد: كلُّ قيمةٍ تُقرأ من src/utils/scheduleRegulations.ts نفسها — بالدوال
 * المصدَّرة، أو بسؤال الدالة نفسها (سُلّمُ البدايات من startLadderNote، والأطوالُ المقبولة من
 * lectureLengthProblem، وحدودُ التتابع ونسبُ الفترتين من reviewSchedule). وبنودُ المراجعة
 * (الشدّة وأثرُها على الاعتماد ومصدرُها) تُستخرج بتشغيل reviewSchedule على جداول صغيرة تُطلق
 * كلَّ بندٍ مرّة، فإن غيّر الكودُ شدّةَ بندٍ أو أثرَه تغيّرت اللقطة وفشل اختبارُ المزامنة.
 *
 *   tsx scripts/srs/regulation-snapshot.ts          # يكتب اللقطة (يشغّله npm run srs:sync)
 *   tests/srs-regulation-sync-audit.ts               # يعيد بناءها في الذاكرة ويقارن
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DAY_KEYS, DAY_NAMES, DECISION_1913_LABEL, LONG_LECTURE_MINUTES, SHORT_LECTURE_MINUTES,
  expectedMinutesForDay, requiredGapForDay, ladderStepForDays, startLadderNote, lectureLengthProblem,
  maxWeeklyMinutesFor, patternLibraryByHours, periodBalanceFinding, periodBalanceSnapshot, reviewSchedule,
  type DayKey, type RegulationContext,
} from "../../src/utils/scheduleRegulations";
import { DEFAULT_SCHEDULE_DAY_START_TIME, DEFAULT_SCHEDULE_DAY_END_TIME } from "../../src/utils/scheduleTime";

export const SNAPSHOT_FILE = "docs/srs/regulation.snapshot.json";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (v: string) => { const [h, m] = v.split(":").map(Number); return h * 60 + m; };

/* ── جداولُ صغيرة تُطلق بنود reviewSchedule ─────────────────────────────── */
let nextId = 1;
type Row = Record<string, unknown> & { id: number };
const row = (over: Partial<Row> & { days: DayKey[]; from: string; to: string }): Row => {
  const { days, from, to, ...rest } = over;
  const out: Row = { id: nextId++, AdCourseId: 101, SCode: "1", AdCollegeId: 1, AdSectionId: 1, AdInstructorId: 11, fstarttime: from, fendtime: to, ...rest } as Row;
  for (const day of DAY_KEYS) out[day] = days.includes(day);
  return out;
};
const course = (id: number, extra: Record<string, unknown> = {}) => [id, { AdCourseId: id, CourseCode: `01091${String(id).padStart(2, "0")}`, CourseName: `مقرر ${id}`, CourseHours: 3, AdSectionId: 1, ...extra }] as const;
const people = new Map<number, any>([11, 12, 13].map(id => [id, { AdInstructorId: id, AdInstructorName: `أستاذ ${id}` }]));
const review = (rows: Row[], extra: Partial<RegulationContext> = {}, courses: Array<readonly [number, any]> = [course(101)]) =>
  reviewSchedule({ rows: rows as any, courses: new Map(courses) as any, instructors: people, ...extra });

/** جدولٌ يُطلق بنداً بعينه (وبنوداً غيره أحياناً: يُؤخذ منها ما ظهر أول مرة). */
function probes(): Array<{ rule: string; rows: Row[]; extra?: Partial<RegulationContext>; courses?: Array<readonly [number, any]> }> {
  const theory = [course(201, { CourseTeachingMode: "theoretical", CourseHours: 3 })];
  return [
    { rule: "section-hours-under", rows: [row({ days: ["fsunday"], from: "08:00", to: "08:50" })] },
    { rule: "regulation-ladder", rows: [row({ days: ["fsunday"], from: "08:30", to: "09:20" })] },
    { rule: "theoretical-pattern", courses: theory, rows: [row({ AdCourseId: 201, days: ["fsunday", "fmonday"], from: "08:00", to: "08:50" })] },
    { rule: "fixed-course-time", rows: [row({ days: ["fsunday"], from: "08:00", to: "08:50" }), row({ days: ["ftuesday"], from: "09:00", to: "09:50" })] },
    { rule: "sections-same-hour", rows: [row({ SCode: "1", days: ["fsunday"], from: "08:00", to: "08:50" }), row({ SCode: "2", AdInstructorId: 12, days: ["fsunday"], from: "08:00", to: "08:50" })] },
    { rule: "consecutive-long-lecture", rows: ["08:00", "09:30", "11:00"].map((from, i) => row({ AdCourseId: 101 + i, SCode: String(i + 1), days: ["fmonday"], from, to: clock(toMin(from) + 80) })),
      courses: [course(101), course(102), course(103)] },
    { rule: "consecutive-one-hour", rows: ["08:00", "09:00", "10:00", "11:00"].map((from, i) => row({ AdCourseId: 101 + i, SCode: String(i + 1), days: ["fsunday"], from, to: clock(toMin(from) + 50) })),
      courses: [course(101), course(102), course(103), course(104)] },
    { rule: "rotation", rows: [row({ days: ["fsunday", "ftuesday", "fthursday"], from: "08:00", to: "08:50" })], extra: { previousRows: [row({ days: ["fsunday", "ftuesday", "fthursday"], from: "08:00", to: "08:50" })] as any } },
    { rule: "period-balance", rows: Array.from({ length: 4 }, (_, i) => row({ AdCourseId: 300 + i, AdInstructorId: 0, days: ["fsunday"], from: "15:00", to: "15:50" })) },
    { rule: "capacity-range", rows: [row({ AdCourseId: 401, days: ["fsunday"], from: "08:00", to: "08:50" })],
      courses: [course(401, { CourseTeachingMode: "theoretical", MaxStudent: 80 })], extra: { capacity: { specialization: "theoretical", excused: new Set<string>() } } },
    { rule: "meeting-window", rows: [row({ days: ["fsunday"], from: "12:00", to: "12:50" })], extra: { meeting: { day: "fsunday", from: "12:00", to: "13:00" } } },
    { rule: "incomplete", rows: [row({ AdInstructorId: 0, days: ["fsunday"], from: "08:00", to: "08:50" })] },
  ];
}

/** القواعدُ التي يكتبها reviewSchedule في الكود: كلُّ «rule» حرفيّ وكلُّ بندِ تتابع. */
export function declaredRules(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "src/utils/scheduleRegulations.ts"), "utf8");
  const out = new Set<string>();
  for (const m of src.matchAll(/\brule:\s*"([a-z0-9-]+)"/g)) out.add(m[1]);
  for (const m of src.matchAll(/appendConsecutiveFinding\([^;]*?"([a-z0-9-]+)"\);/g)) out.add(m[1]);
  return [...out];
}

function findingCatalogue() {
  const seen = new Map<string, { rule: string; article: string; severity: string; source: string; approvalEffect: string }>();
  for (const probe of probes()) {
    const findings = review(probe.rows, probe.extra, probe.courses);
    const hit = findings.find(item => item.rule === probe.rule);
    if (!hit) throw new Error(`لم يُطلق الجدولُ التجريبي البندَ ${probe.rule}`);
    seen.set(hit.rule, { rule: hit.rule, article: hit.article, severity: hit.severity, source: hit.source, approvalEffect: hit.approvalEffect });
  }
  const declared = declaredRules();
  const missing = declared.filter(rule => !seen.has(rule));
  if (missing.length) throw new Error(`بنود في reviewSchedule بلا جدولٍ تجريبي في اللقطة: ${missing.join("، ")}`);
  return [...seen.values()];
}

/* ── أسئلةٌ للدوال نفسها ─────────────────────────────────────────────────── */
function ladderFor(day: DayKey, end: number) {
  const out: string[] = [];
  for (let m = 0; m < end; m++) if (!startLadderNote([day], clock(m))) out.push(clock(m));
  return out;
}
function acceptedLengths(day: DayKey, hours: number) {
  const out: number[] = [];
  for (let len = 1; len <= 12 * 60; len++) {
    const r: any = { fstarttime: "08:00", fendtime: clock(8 * 60 + len) };
    for (const d of DAY_KEYS) r[d] = d === day;
    if (lectureLengthProblem(r, hours) === null) out.push(len);
  }
  return out;
}
function consecutiveLimits() {
  const run = (n: number, minutes: number, gap: number, day: DayKey) => {
    nextId = 5000;
    const rows: Row[] = []; let at = 8 * 60;
    for (let i = 0; i < n; i++) { rows.push(row({ AdCourseId: 401 + i, SCode: String(i + 1), days: [day], from: clock(at), to: clock(at + minutes) })); at += minutes + gap; }
    return review(rows, {}, rows.map(r => course(Number(r.AdCourseId)))).map(f => f.rule);
  };
  const firstN = (minutes: number, rule: string) => { for (let n = 2; n < 10; n++) if (run(n, minutes, 10, "fmonday").includes(rule)) return n; return 0; };
  let longOver = 0; for (let d = 40; d <= 120; d++) if (run(3, d, 10, "fmonday").includes("consecutive-long-lecture")) { longOver = d - 1; break; }
  let gap = -1; for (let g = 0; g <= 60; g++) if (run(3, 80, g, "fmonday").includes("consecutive-long-lecture")) gap = g;
  return { longLectureOverMinutes: longOver, maxLongInRow: firstN(80, "consecutive-long-lecture") - 1, maxOneHourInRow: firstN(50, "consecutive-one-hour") - 1, consecutiveGapMinutes: gap };
}
function periodBalance() {
  const one = (m: number) => periodBalanceSnapshot([{ fstarttime: clock(m) } as any]);
  const counted = [...Array(24 * 60).keys()].filter(m => one(m));
  const morning = counted.filter(m => one(m)!.morningCount === 1);
  const accepted: number[] = [];
  for (let k = 0; k <= 100; k++) {
    const rows = Array.from({ length: 100 }, (_, i) => ({ fstarttime: i < k ? "09:00" : "15:00" }));
    if (!periodBalanceFinding(rows as any)) accepted.push(k);
  }
  return {
    morning: { from: clock(morning[0]), to: clock(morning[morning.length - 1] + 1) },
    evening: { from: clock(morning[morning.length - 1] + 1), to: clock(counted[counted.length - 1] + 1) },
    morningShare: { min: accepted[0], max: accepted[accepted.length - 1] },
  };
}

export function regulationSnapshot() {
  const end = toMin(DEFAULT_SCHEDULE_DAY_END_TIME);
  const days = DAY_KEYS.map((key, i) => {
    const ladder = ladderFor(key, end);
    return {
      key, name: DAY_NAMES[i],
      family: expectedMinutesForDay(key) === LONG_LECTURE_MINUTES ? "long" : "short",
      lectureMinutes: expectedMinutesForDay(key), gapMinutes: requiredGapForDay(key), ladderStep: ladderStepForDays([key]),
      firstStart: ladder[0], ladder,
      acceptedLengths: acceptedLengths(key, 5),
    };
  });
  return {
    source: "src/utils/scheduleRegulations.ts",
    decisionLabel: DECISION_1913_LABEL,
    teachingDay: { from: DEFAULT_SCHEDULE_DAY_START_TIME, to: DEFAULT_SCHEDULE_DAY_END_TIME },
    lectureMinutes: { short: SHORT_LECTURE_MINUTES, long: LONG_LECTURE_MINUTES },
    mixedLadderStep: ladderStepForDays(["fsunday", "fmonday"]),
    days,
    weeklyCap: { formula: "round(round(hours) × 50 × 1.1)", byHours: [1, 2, 3, 4, 5].map(hours => ({ hours, base: hours * 50, max: maxWeeklyMinutesFor(hours) })) },
    library: patternLibraryByHours(),
    consecutive: consecutiveLimits(),
    periodBalance: periodBalance(),
    findings: findingCatalogue(),
  };
}

export const snapshotText = () => JSON.stringify(regulationSnapshot(), null, 1) + "\n";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = snapshotText();
  fs.writeFileSync(path.join(ROOT, SNAPSHOT_FILE), text);
  const snap = JSON.parse(text);
  console.log(`✓ لقطة اللائحة: ${snap.library.reduce((n: number, g: any) => n + g.patterns.length, 0)} نمطاً، ${snap.findings.length} بنود مراجعة → ${SNAPSHOT_FILE}`);
}
