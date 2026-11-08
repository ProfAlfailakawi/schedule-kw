/**
 * ── كرت الأستاذ: «في الوقت نفسه» والشعبة الأخرى من المقرر نفسه (المالك 2026-11-08) ──
 *
 *   1) تلميحٌ خفيف: وقتٌ يتداخل مع قرين «تفتح» أو «تُؤخذ معًا» من صحيفة القسم يُقال بسطرٍ قصير،
 *      وعند الفتح أسماءُ المقررات وحدها بأيقونة العلاقة. لا أستاذ ولا شعبة ولا وقت غيره ولا قاعة.
 *      وما وافق الوقتَ بلا علاقة لا يُقال للأستاذ. ولا يمنع الإرسال.
 *   2) شعبةٌ أخرى من المقرر نفسه في الوقت نفسه: تنبيهٌ واضح لا يمنع (كان يمنع)، بقاعدة القسم نفسها
 *      (تداخلٌ لا تلاصق، رقمُ الشعبة بـsectionCodeKey، وصفوفُ «وضع تجربة» لا تُعدّ).
 */
import { readFileSync } from "node:fs";
import { teacherPeerNote, teacherPeerLine } from "../src/utils/teacherPeerNote";
import { judgeRequest, headlineReasonOf, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import { sameCourseSectionClash } from "../src/utils/scheduleRegulations";
import { sameLevelLookup, unlockLookup } from "../src/utils/planPeers";
import { roomKeyOf } from "../src/utils/locationRegistry";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: unknown, name: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); }
};
const read = (path: string) => readFileSync(path, "utf8");

const TEACHER = 7, OTHER = 8;
const row = (over: Partial<FSchedule> = {}): FSchedule => ({
  id: 50, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20, AdCourseId: 200, AdCourseName: "مقرر", SCode: "01", AdInstructorId: OTHER,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, fstarttime: "09:30", fendtime: "10:20",
  AdRoomCode: "أ", AdRoomHall: "101", ...over,
} as FSchedule);

/* ── 1) التلميح: الأسماءُ وحدها ─────────────────────────────────────────────── */
{
  /* 100 و200 يفتحان 900 معاً؛ 100 و300 إجباريان من مستوى واحد؛ 400 لا علاقة له. */
  const unlockOf = unlockLookup([{ nextCourseId: 900, nextCourseName: "مشروع", courseIds: [100, 200], blocked: [] }]);
  const sameLevel = sameLevelLookup([{ courseIds: [100, 300], blocked: [] }]);
  const names = new Map([[200, "الرسم الحر"], [300, "تاريخ الفن"], [400, "مقرر عام"], [100, "التصميم"]]);
  const base = { courseId: 100, sectionId: 5, termId: 20, collegeId: 1, instructorId: TEACHER, sameLevel, unlockOf, nameOf: (id: number) => names.get(id) || "" };
  const slot = (start: string, end: string, day = "fsunday") => [{ day, start, end }];

  const unlock = teacherPeerNote([row()], { ...base, slots: slot("09:00", "09:50") });
  check(unlock?.relation === "unlock" && unlock.courses.length === 1 && unlock.courses[0].name === "الرسم الحر" && unlock.courses[0].relation === "unlock",
    "1 تداخلٌ جزئي مع قرين «تفتح»: اسمُه بعلاقته", unlock);
  const shown = JSON.stringify(unlock);
  check(!/د\. |"01"|09:30|10:20|101|"id"|AdInstructor|SCode/.test(shown) && Object.keys(unlock || {}).sort().join() === "courses,line,relation"
    && unlock!.courses.every(course => Object.keys(course).sort().join() === "name,relation"),
    "1 لا أستاذ ولا شعبة ولا وقت غيره ولا قاعة ولا معرّف", shown);
  check(unlock?.line === "يتداخل مع مقرر يفتح معه مقرراً تالياً" && teacherPeerLine("unlock", 1) === unlock?.line, "1 سطرٌ قصير بصيغة «تفتح»");

  const level = teacherPeerNote([row({ AdCourseId: 300 })], { ...base, slots: slot("09:00", "09:50") });
  check(level?.relation === "level" && level.courses[0]?.name === "تاريخ الفن" && level.line === "يتداخل مع مقرر يُؤخذ معه", "1 «تُؤخذ معًا»: السطرُ والاسم", level);
  const both = teacherPeerNote([row(), row({ id: 51, AdCourseId: 300 })], { ...base, slots: slot("09:00", "09:50") });
  check(both?.relation === "unlock" && both.courses.map(course => course.relation).join() === "unlock,level" && both.line === "يتداخل مع مقررات تفتح معه مقرراً تالياً",
    "1 العلاقتان معاً: «تفتح» أولاً، والجمعُ بلا رقم", both);
  check(!teacherPeerNote([row({ AdCourseId: 400 })], { ...base, slots: slot("09:30", "10:20") }), "1 الوقتُ نفسه بلا علاقة: لا يُقال للأستاذ");
  check(!teacherPeerNote([row()], { ...base, slots: slot("08:40", "09:30") }), "1 التلاصق ليس تداخلاً");
  check(!teacherPeerNote([row()], { ...base, slots: slot("09:00", "09:50", "fmonday") }), "1 يومٌ آخر لا يتداخل");
  check(!teacherPeerNote([row({ AdSectionId: 6 })], { ...base, slots: slot("09:00", "09:50") }), "1 قسمٌ آخر لا يُعدّ");
  check(!teacherPeerNote([row({ AdTermId: 21 })], { ...base, slots: slot("09:00", "09:50") }), "1 فصلٌ آخر لا يُعدّ");
  check(!teacherPeerNote([row({ AdCollegeId: 2 })], { ...base, slots: slot("09:00", "09:50") }), "1 كليةٌ أخرى لا تُعدّ");
  check(!teacherPeerNote([row({ AdInstructorId: TEACHER })], { ...base, slots: slot("09:00", "09:50") }), "1 محاضرتُه هو يحكمها تعارضُ الأستاذ لا التلميح");
  check(!teacherPeerNote([row({ id: -5 })], { ...base, slots: slot("09:00", "09:50") }), "1 صفُّ «وضع تجربة» لا يُعدّ");
  check(!teacherPeerNote([row({ AdCourseId: 100, SCode: "02" })], { ...base, slots: slot("09:00", "09:50") }), "1 شعبةُ المقرر نفسه ليست قريناً (لها تنبيهها)");
  check(!teacherPeerNote([row()], { ...base, slots: slot("09:00", "09:50"), sameLevel: undefined, unlockOf: undefined }), "1 بلا صحيفة: صمت");
  check(!teacherPeerNote([row()], { ...base, nameOf: () => "", slots: slot("09:00", "09:50") }), "1 مقررٌ بلا اسم لا يُعرض رقماً");
  const twoDays = teacherPeerNote([row(), row({ id: 52, fsunday: false, ftuesday: true })], { ...base, slots: [...slot("09:00", "09:50"), ...slot("09:00", "09:50", "ftuesday")] });
  check(twoDays?.courses.length === 1, "1 المقررُ الواحد مرةً واحدة وإن تعددت أيامه وشعبه", twoDays);
}

/* ── 2) الشعبة الأخرى: تنبيهٌ لا يمنع ──────────────────────────────────────── */
{
  const course: AdCourse = { AdCourseId: 100, AdCollegeId: 1, AdSectionId: 5, CourseCode: "C100", CourseName: "التصميم", CourseCredit: 3, CourseHours: 3, MaxStudent: 25 } as AdCourse;
  const teacher = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000007", AdInstructorName: "د. 7" } as AdInstructor;
  const mine = row({ id: 1, AdCourseId: 100, AdInstructorId: TEACHER, ftuesday: true, fthursday: true, fstarttime: "08:00", fendtime: "08:50" });
  const other = row({ id: 2, AdCourseId: 100, SCode: "02", ftuesday: true, fthursday: true, fstarttime: "16:00", fendtime: "16:50", AdRoomHall: "102" });
  const ctx = (others: FSchedule[], warns = true): VerdictContext => ({
    instructorId: TEACHER, allRows: [mine, ...others], instructorRowsAfter: [mine], courses: new Map([[100, course]]), instructors: new Map([[TEACHER, teacher]]),
    knownRoomKeys: ["101", "102", "103"].map(hall => roomKeyOf(undefined, "أ", hall)), startLadder: ["08:00", "16:00"], roomCollegeId: 1, sectionClashWarns: warns,
  });
  const ask: RequestedRow = { rowId: 1, action: "change", AdCourseId: 100, days: ["fsunday", "ftuesday", "fthursday"], start: "16:00" };
  const warned = judgeRequest(ask, ctx([other]));
  const reason = warned.reasons.find(entry => entry.code === "section-clash");
  check(reason && !reason.blocking && warned.sendable && warned.kind === "clear" && !warned.needsExcuse,
    "2 شعبةٌ أخرى في الوقت نفسه: تنبيهٌ يُرسَل معه بلا سبب استثناء", warned);
  check(reason?.text === "شعبة أخرى من المقرر نفسه في هذا الوقت، وقد لا يعتمده القسم." && !/02|102/.test(reason?.text || ""), "2 النصُّ واضح ولا يذكر رقمَ الشعبة", reason);
  check(headlineReasonOf(warned.reasons)?.code !== "section-clash" && warned.headline === "الوقت متاح", "2 سطرُ الحكم يبقى «الوقت متاح» والتنبيهُ سطرُه وحده", warned.headline);
  check(!judgeRequest(ask, ctx([other], false)).reasons.some(entry => entry.code === "section-clash"), "2 شاشاتُ القسم لا تتغيّر (لها تنبيهُها في «موعد»)");
  check(!judgeRequest(ask, ctx([{ ...other, fstarttime: "16:50", fendtime: "17:40" }])).reasons.some(entry => entry.code === "section-clash"), "2 التلاصق ليس تداخلاً");
  check(judgeRequest(ask, ctx([{ ...other, fstarttime: "16:30", fendtime: "17:20" }])).reasons.some(entry => entry.code === "section-clash"), "2 التداخلُ الجزئي يكفي");
  check(!judgeRequest(ask, ctx([{ ...other, SCode: "1" }])).reasons.some(entry => entry.code === "section-clash"), "2 «1» هي «01» نفسُها (sectionCodeKey)");
  check(!judgeRequest(ask, ctx([{ ...other, id: -9 }])).reasons.some(entry => entry.code === "section-clash"), "2 صفُّ «وضع تجربة» لا يُعدّ");
  check(judgeRequest(ask, ctx([{ ...other, id: -2_000_000_001 }])).reasons.some(entry => entry.code === "section-clash"), "2 حجزُ طلبٍ آخر يُعدّ شعبةً حقيقية");
  check(!sameCourseSectionClash(mine, [{ ...other, id: -3, fstarttime: "08:00", fendtime: "08:50" }], course), "2 والقاعدةُ الواحدة نفسُها في «موعد»: «وضع تجربة» خارجها");
}

/* ── 3) الأسلاك: الخادم والمسارات والصفحة ────────────────────────────────────── */
{
  const requests = read("src/server/core/instructorRequests.ts");
  const verdict = read("src/utils/instructorRequestVerdict.ts");
  check(/sectionClashWarns: !options\.forDepartment && !offeredByDepartment/.test(requests) && !/sectionClashBlocks/.test(requests + verdict),
    "3 كرتُ الأستاذ ينبّه ولا يمنع، وما عرضه القسمُ لا يُنبَّه عليه");
  check(/code: "section-clash", blocking: false/.test(verdict) && !/code: "section-clash", blocking: true/.test(verdict), "3 لا منعَ للشعبة الأخرى في أي مسار");
  check(/sectionPlanFacts/.test(requests) && /teacherPeerNote\(/.test(requests) && /!options\.forDepartment/.test(requests), "3 التلميحُ من حقائق الصحيفة نفسها، للأستاذ وحده");
  const routes = read("src/server/routes/publicRequestRoutes.ts");
  check((routes.match(/peers: item\.peers/g) || []).length >= 2 && (routes.match(/sameCourse: sameCourseWarned\(item\)/g) || []).length >= 2, "3 فحصُ البند وفحصُ الدفعة يحملان التلميحين");
  const page = read("src/server/pages/instructorRequestPage.ts");
  check(/function softHtml\(it\)/.test(page) && /lock-open/.test(page) && /"cap"/.test(page) && /data-peer-mark/.test(page), "3 الصفحة: أيقونةٌ بجانب الوقت، وسطرٌ يُفتح بأسماءٍ وأيقونة علاقتها");
  check(!/AdInstructorName|SCode|AdRoom/.test((page.match(/function softHtml[\s\S]*?\n/) || [""])[0]), "3 سطرُ التلميح لا يقرأ أستاذاً ولا شعبةً ولا قاعة");
}

console.log(`\n${passed} ناجح، ${failed} فاشل`);
if (failed) process.exit(1);
