/**
 * ── حماية الخريجين عند السحب (2026-11-14) ─────────────────────────────────────────────
 *
 *  G  graduateReadOf: التعارض الذي لا مفرّ منه يتقدّم ويحمرّ؛ وإلا نسبةُ من يناسبهم الموضع بلونها (85/60)؛ والخريجون أولاً
 *     ثم الطلبة؛ وبلا تقريرٍ لا سطر.
 *  S  الربط في المصدر: السطر في لوحة القراءة ومعاينة القرار، وردُّ فحص الموعد نفسه يحمله في المسارين (الفوري والغني)، فلا طلبَ ثانياً.
 */
import fs from "node:fs";
import { graduateReadOf } from "../src/components/SchedulePhysics/GraduateRead";
import type { StudentFit } from "../src/utils/studentFit";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};
const side = (percent: number | null, blocked: number, need = 22) => ({ need, fit: need - blocked, blocked, percent, clashes: [] });
const fit = (graduates: ReturnType<typeof side> | null, students: ReturnType<typeof side> | null = null): StudentFit =>
  ({ track: "boys", sections: { before: 1, after: 1 }, graduates, students });

/* G */
const impact = graduateReadOf({ impact: { graduates: 3, pairs: ["0109468 × 0109491", "0109220 × 0109221", "x × y"] }, fit: fit(side(62, 8)) });
check(impact?.tone === "bad" && impact.kind === "grad" && impact.text === "تعارضٌ لا مفرّ منه لـ3 خريجين" && impact.percent === 62, "G1 التعارض الذي لا مفرّ منه يتقدّم: أحمر، والنسبة معه", impact);
check(impact?.pairs.length === 2, "G1 زوجان من المقررات على الأكثر");
check(graduateReadOf({ fit: fit(side(96, 1)) })?.tone === "good" && graduateReadOf({ fit: fit(side(96, 1)) })?.text === "يحجب خريج واحد عن مقررٍ آخر", "G2 96٪: أخضر، والعدد بمعدوده («خريج واحد»)");
check(graduateReadOf({ fit: fit(side(72, 6)) })?.tone === "warn" && graduateReadOf({ fit: fit(side(72, 6)) })?.text === "يحجب 6 خريجين عن مقررٍ آخر", "G3 72٪: كهرماني («6 خريجين»)");
check(graduateReadOf({ fit: fit(side(59, 9)) })?.tone === "bad" && graduateReadOf({ fit: fit(side(85, 3)) })?.tone === "good" && graduateReadOf({ fit: fit(side(60, 9)) })?.tone === "warn", "G4 حدود الألوان 85 و60");
check(graduateReadOf({ fit: fit(side(100, 0)) })?.text === "لا يحجب أحداً من 22 خريجاً", "G5 لا حجب: «لا يحجب أحداً من 22 خريجاً» (العدد بمعدوده)");
const students = graduateReadOf({ fit: fit(null, side(78, 5, 40)) });
check(students?.kind === "stud" && students.text === "يحجب 5 طلاب عن مقررٍ آخر" && students.tone === "warn", "G6 بلا خريجين: الطلبة", students);
check(graduateReadOf({ fit: fit(side(70, 4), side(99, 0)) })?.kind === "grad", "G7 الخريجون أولاً ولو وُجد الطلبة");
check(graduateReadOf(null) === null && graduateReadOf({}) === null && graduateReadOf({ impact: { graduates: 0 }, fit: null }) === null, "G8 بلا تقريرٍ أو أثر: لا سطر");
check(graduateReadOf({ fit: fit(side(null, 0)) }) === null, "G9 تقريرٌ بلا تفصيل برامج (نسبة null): لا سطر");

/* S */
const read = (file: string) => fs.readFileSync(file, "utf8");
const layer = read("src/components/SchedulePhysics/SchedulePhysicsLayer.tsx"), preview = read("src/components/SchedulePhysics/ScheduleDecisionPreview.tsx");
const schedules = read("src/components/Schedules.tsx"), types = read("src/components/SchedulePhysics/types.ts"), css = read("src/styles/58-appt-ideas.css");
check(/<GraduateRead graduates=\{decision\?\.graduates\} \/>/.test(layer), "S1 لوحة القراءة عند الخانة تعرض سطر الخريجين");
check(/decision\?\.graduates \? <div className="decision-graduates/.test(preview), "S2 معاينة قرار النقل تعرضه كذلك");
check((schedules.match(/graduates: \{ impact: (?:conflictData|response)\.graduateImpact \|\| null, fit: (?:conflictData|response)\.studentFit \|\| null \}/g) || []).length === 2, "S3 المساران (الغني والفوري) يحملانه من ردّ فحص الموعد نفسه");
check(!/api\/schedules\/graduate/.test(schedules) && /graduates\?: \{ impact/.test(types), "S4 لا طلبَ ثانياً، والنوع يعرّفه");
check(/\.physics-conflict-row\.is-grad\.tone-bad/.test(css) && /\.physics-grad-pct/.test(css) && /\.physics-conflict-row\.is-grad:not\(\.is-stud\)/.test(css), "S5 الأنماط: لون الحال والنسبة");

console.log(`\ngraduate-drag-1114 audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
