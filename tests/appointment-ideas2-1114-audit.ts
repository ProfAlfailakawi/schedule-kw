/**
 * ── مراجعة «موعد» 2026-11-14 (٣): «أفضل وقت» وسطرُ أثر الحفظ والخانات الأخفّ ───────────────
 *
 *  C  تغطية المقرر كله (studentFitOf.withCoverage): من يجد شعبةً تناسبه قبل الموعد وبعده؛ شعبةٌ بديلةٌ سليمة تُبقيه مخدوماً؛
 *     مقررٌ بلا شعبة يخدم 0٪؛ وبلا الخيار لا تُحسب (لا تثقل قراءة الخانات الكثيرة).
 *  I  saveImpactOf: الخريجون أولاً، ولا سطرَ إن لم يتغيّر الرقم، وبلا تغطيةٍ لا شيء.
 *  S  الربط في المصدر: زرّ «أفضل وقت»، وسطر الأثر بكلمة «يناسب» لا «خدمة»، والخانات الأخفّ، والورقة الأنحف على الجوال.
 */
import fs from "node:fs";
import { studentFitOf } from "../src/utils/studentFit";
import { saveImpactOf } from "../src/components/StudentPulse";
import type { DemandCourse, DemandMatch, DemandReport } from "../src/utils/actualDemand";
import type { ClashRow } from "../src/utils/actualDemandGraduates";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};

const course = (code: string, programs: Array<[string, number, number]>): DemandCourse => {
  const boys = programs.reduce((s, p) => s + p[1], 0), girls = programs.reduce((s, p) => s + p[2], 0);
  return { code, name: `مقرر ${code}`, units: 3, offered: { boys: 0, girls: 0 }, average: { boys: 0, girls: 0 }, students: { boys, girls, total: boys + girls },
    suggested: { boys: 0, girls: 0, total: 0 }, programs: programs.map(([c, b, g]) => ({ code: c, name: c, boys: b, girls: g, total: b + g })) };
};
const graduates: DemandReport = { termLabel: "", department: "ت", facultyCount: 0, legalLoad: 0, warnings: [], courses: [
  course("0109468", [["BA-0115", 10, 6]]), course("0109491", [["BA-0115", 4, 3], ["BA-0136", 2, 0]]),
] };
const matches = new Map<string, DemandMatch>([
  ["0109468", { code: "0109468", status: "matched", courseIds: [1, 2] }],
  ["0109491", { code: "0109491", status: "matched", courseIds: [3, 4] }],
]);
const members = [{ collegeId: 11, track: "boys" as const }, { collegeId: 12, track: "girls" as const }];
const row = (id: number, courseId: number, college: number, code: string, days: string[], start: string, end: string): ClashRow =>
  ({ id, AdCourseId: courseId, AdCollegeId: college, SCode: code, fstarttime: start, fendtime: end, ...Object.fromEntries(days.map(d => [d, true])) });
const other = row(1, 3, 11, "01", ["fsunday", "ftuesday"], "08:00", "09:20");   // 0109491: شعبةٌ وحيدة
const clashing = row(-1, 1, 11, "01", ["fsunday", "ftuesday"], "08:00", "09:20"); // 0109468 فوقها

/* C */
const first = studentFitOf({ general: null, graduates, matches, members, rows: [other], candidate: clashing, withCoverage: true });
check(first?.graduates?.percent === 60 && first.graduates.coverage?.before === 0 && first.graduates.coverage.after === 60, "C1 أولُ شعبةٍ للمقرر: 0٪ ← 60٪ (المحجوبون ٤ من ١٠)", first?.graduates);
const free = studentFitOf({ general: null, graduates, matches, members, rows: [other], candidate: row(-1, 1, 11, "01", ["fsunday", "ftuesday"], "10:00", "11:20"), withCoverage: true });
check(free?.graduates?.coverage?.before === 0 && free.graduates.coverage.after === 100, "C2 وقتٌ لا يحجب أحداً: 0٪ ← 100٪", free?.graduates);
const spare = row(5, 1, 11, "02", ["fthursday"], "13:00", "14:20");
const second = studentFitOf({ general: null, graduates, matches, members, rows: [other, spare], candidate: clashing, withCoverage: true });
check(second?.graduates?.coverage?.before === 100 && second.graduates.coverage.after === 100, "C3 شعبةٌ بديلةٌ سليمة تُبقي الطلبة مخدومين: ١٠٠٪ ← ١٠٠٪", second?.graduates?.coverage);
const edit = studentFitOf({ general: null, graduates, matches, members, rows: [other, row(9, 1, 11, "01", ["fsunday", "ftuesday"], "08:00", "09:20")],
  candidate: row(9, 1, 11, "01", ["fsunday", "ftuesday"], "10:00", "11:20"), replaces: 9, withCoverage: true });
check(edit?.graduates?.coverage?.before === 60 && edit.graduates.coverage.after === 100, "C4 تعديلُ موعدٍ قائم: 60٪ ← 100٪ (يُقرأ الأصل ثم الجديد)", edit?.graduates?.coverage);
const plain = studentFitOf({ general: null, graduates, matches, members, rows: [other], candidate: clashing });
check(!plain?.graduates?.coverage, "C5 بلا withCoverage لا تغطية (قراءة الخانات الكثيرة خفيفة)", plain?.graduates?.coverage);

/* I */
const impact = saveImpactOf(first);
check(impact?.kind === "grad" && impact.before === 0 && impact.after === 60, "I1 الخريجون أولاً: 0 ← 60", impact);
check(saveImpactOf(second) === null, "I2 لا سطرَ إن لم يتغيّر الرقم");
check(saveImpactOf(null) === null && saveImpactOf(plain) === null, "I3 بلا تقرير أو بلا تغطية: لا شيء");
const studentsOnly = saveImpactOf({ track: "", sections: { before: 0, after: 1 }, graduates: null, students: { need: 20, fit: 15, blocked: 5, percent: 75, clashes: [], coverage: { before: 0, after: 75 } } });
check(studentsOnly?.kind === "stud" && studentsOnly.after === 75, "I4 بلا خريجين: الطلبة", studentsOnly);

/* S */
const read = (file: string) => fs.readFileSync(file, "utf8");
const pulse = read("src/components/StudentPulse.tsx"), mini = read("src/components/TeacherMiniWeek.tsx"), schedules = read("src/components/Schedules.tsx"), css = read("src/styles/58-appt-ideas.css");
check(/className=\{`pulse-best is-\$\{best\.kind\}`\}/.test(pulse) && /best\.percent >= current \+ 5/.test(pulse), "S1 زرّ «أفضل وقت» في بطاقة النبض، ولا يظهر إلا بفارقٍ يُعتدّ به (٥ نقاط)");
check(/onBestFit/.test(mini) && /bestKey/.test(mini) && /onBestRef\.current\?\.\(null\)/.test(mini), "S2 أسبوع الأستاذ يُبلغ بأفضل خانةٍ ويسحبها عند زوالها");
check(/onPickBest=\{best => void pickBestTime\(best\)\}/.test(schedules) && /const pickBestTime = async \(best: BestTime\) => \{\s*pickFromMiniWeek\(\{ day: best\.day/.test(schedules) && /onBestFit=\{setBestTime\}/.test(schedules), "S3 الضغطة تضع الموعد بالمسار نفسه (pickFromMiniWeek) فيُفحص كأي اختيار، ثم تبحث عن القاعة");
check(/يناسب \{impact\.kind === "grad" \? "الخريجين" : "الطلبة"\}/.test(pulse) && !/خدمة الخريجين|خدمة الطلبة/.test(pulse + schedules), "S4 السطر بكلمة «يناسب» لا «خدمة»");
check(/saveImpactOf\(studentFit\)/.test(schedules) && /current === impact \? null : current/.test(schedules) && /saveImpact && editor === "index"/.test(schedules), "S5 أثرُ الحفظ يظهر لثوانٍ في المحرّر وفي اللوحة بعد إغلاق التعديل");
check(/fit-labeled/.test(mini) && /!\(fit && pixels\(target\.start, target\.end\) >= 34\)/.test(mini) && /\.mini-week-target\.fit-labeled>svg\{display:none\}/.test(css), "S6 الخانة الملوّنة: النسبة وحدها، والوقت في التلميح، و«+» عند التمرير");
check(/mini-week\.is-sheet:not\(\.is-open\) \.mini-week-facts>em:last-child:not\(\.is-load\)\{display:none\}/.test(css), "S7 ورقة الأستاذ المطويّة على الجوال: النصاب والأيام فقط");
check(!/«\+» لتضع الموعد|على «\+» فتضيء/.test(mini), "S8 التلميح لا يذكر «+» المخفيّة");

console.log(`\nappointment-ideas2-1114 audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
