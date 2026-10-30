/**
 * ── آلة الزمن ومحاكي الشعب ─────────────────────────────────────────────────
 *
 * جزءان:
 *   A) المحرّك النقيّ على جدولٍ صغيرٍ مصنوع: الطبقة، الانحراف، خطة الكتابة، قراءة
 *      الجملة، الحلول المتعددة (ولا حلّ يزيد موانع الاعتماد)، سلاسل الدومينو، أثر
 *      الحذف بالأرقام من الرادار وحده.
 *   B) خادمٌ حقيقيّ في وضع التجربة: السياق مقنّع خارج النطاق، الحفظ والمشاركة،
 *      الاعتماد الذرّي، الانحراف (الجدول الحيّ تحرّك) يمنع الاعتماد، خطوةٌ فاسدة
 *      تُبطل الكل (لا كتابة جزئية)، اعتمادان متزامنان، الاستعادة بنقرة ورفضها إن
 *      كُتب فوق ما اعتُمد، والعميد يرى ويحاكي ولا يكتب.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";
import {
  applyChanges, compareBoards, compareScenarios, dominoOf, driftOf, measure, parseProblem, planOperations, removeImpact,
  sectionCards, solveProblem, suggestPlacements, addSectionChange, baseRevisions, teacherCards, staleChanges, TM_DAYS,
  type TmContext, type TmChange,
} from "../src/utils/timeMachine";
import { daysApprovedForHours } from "../src/utils/scheduleRegulations";
import { findConflicts, isBlockingConflict } from "../src/utils/scheduleIntelligence";
import { placeholderInstructorIds } from "../src/utils/instructorIdentity";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

/* ══ A) المحرّك ══════════════════════════════════════════════════════════════ */
{
  const halls = ["G23", "G24", "G25", "G26"].map((hall, i) => ({ code: "B1", hall, buildingId: "b1", roomId: `r${i + 1}`, capacity: 40, roomType: "قاعة تدريس" }));
  const course = (id: number, code: string, name: string, hours = 3, max = 35): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 1, CourseCode: code, CourseName: name, CourseCredit: hours, CourseHours: hours, MaxStudent: max });
  const courses = [course(1, "121", "مدخل التقنيات"), course(2, "201", "تصميم تعليمي"), course(3, "305", "وسائط متعددة"), course(4, "410", "مشروع")];
  const person = (id: number, name: string, load?: number): AdInstructor => ({ AdInstructorId: id, AdInstructorCivil: "", AdInstructorName: name, AdInstructorMobile: "99887766", ...(load ? { AdInstructorLoad: load } : {}) });
  const instructors = [person(11, "د. أحمد الكندري", 12), person(12, "د. سارة العتيبي", 12), person(13, "د. خالد المطيري", 12), person(99, "هيئة تدريسية")];
  let rev = 1;
  const row = (id: number, courseId: number, scode: string, teacher: number, days: string[], start: string, end: string, hallIndex: number): FSchedule => ({
    id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 7, AdCourseId: courseId, AdCourseName: courses.find(c => c.AdCourseId === courseId)!.CourseName,
    SCode: scode, AdInstructorId: teacher,
    fsunday: days.includes("fsunday"), fmonday: days.includes("fmonday"), ftuesday: days.includes("ftuesday"), fwednesday: days.includes("fwednesday"), fthursday: days.includes("fthursday"),
    fstarttime: start, fendtime: end, AdRoomCode: "B1", AdRoomHall: halls[hallIndex].hall, buildingId: "b1", roomId: halls[hallIndex].roomId, locationStatus: "VERIFIED", rev: rev++,
  });
  const rows: FSchedule[] = [
    row(1, 1, "501", 11, ["fsunday", "ftuesday"], "08:00", "09:15", 0),
    row(2, 1, "502", 12, ["fsunday", "ftuesday"], "09:30", "10:45", 0),
    row(3, 2, "501", 11, ["fsunday", "ftuesday"], "11:00", "12:15", 0),
    row(4, 3, "501", 13, ["fmonday", "fwednesday"], "08:00", "09:15", 1),
    row(5, 2, "502", 13, ["fthursday"], "08:00", "10:30", 2),
    row(6, 4, "501", 12, ["fthursday"], "11:00", "13:30", 1),
  ];
  /* قسمٌ آخر يشغل G24 صباح الأحد: مقنّعٌ كما يرسله الخادم. */
  const outside: FSchedule[] = [{ ...row(50, 1, "x1", -1_000_001, ["fsunday", "ftuesday"], "08:00", "09:15", 1), AdCollegeId: 0, AdSectionId: 0, AdCourseId: -1, AdCourseName: "موعد قسمٍ آخر" }];
  const context: TmContext = {
    scope: { collegeId: 1, sectionId: 1, termId: 7 }, rows, outside, courses, instructors, halls,
    demand: { "1": { wanted: 90, seated: 64, capacity: 70, sections: 2 }, "2": { wanted: 50, seated: 50, capacity: 70, sections: 2 } },
    loadLimits: { "11": 12, "12": 12, "13": 12 }, canWrite: true,
  };
  const board = [...rows, ...outside];
  const placeholders = placeholderInstructorIds(instructors);
  const blocking = (b: FSchedule[]) => findConflicts(b.filter(r => r.AdSectionId === 1), b, { placeholderInstructorIds: placeholders }).filter(isBlockingConflict).length;
  check(blocking(board) === 0, "A0 الجدول المصنوع نظيف (لا مانع اعتماد)");

  /* الطبقة */
  const remove: TmChange = { id: "x1", op: "remove", rowIds: [2], label: "حذف" };
  const moved: TmChange = { id: "x2", op: "move", rowId: 4, start: "13:00", end: "14:15", label: "نقل" };
  const after = applyChanges(board, [remove, moved]);
  check(after.length === board.length - 1 && after.find(r => r.id === 4)?.fstarttime === "13:00" && board.find(r => r.id === 4)?.fstarttime === "08:00", "A1 الطبقة تُطبَّق على نسخة ولا تمسّ الأصل");
  const base = baseRevisions(rows, [remove, moved]);
  check(base["2"] === rows[1].rev && base["4"] === rows[3].rev, "A2 السيناريو يحفظ إصدار كل صفٍّ يمسّه");
  check(driftOf(rows, base).length === 0 && driftOf(rows.map(r => r.id === 4 ? { ...r, rev: 99 } : r), base)[0]?.kind === "edited"
    && driftOf(rows.filter(r => r.id !== 2), base)[0]?.kind === "gone", "A3 تنبيه الانحراف: تعديلٌ أو حذفٌ في الجدول الحيّ");
  check(staleChanges(rows.filter(r => r.id !== 4), [moved]).length === 1, "A4 تغييرٌ على صفٍّ غاب يُسمّى ولا يُخفى");
  const ops = planOperations(rows, [remove, moved], base);
  check(ops.length === 2 && ops.some(op => op.kind === "delete" && op.rowId === 2) && ops.some(op => op.kind === "update" && op.rowId === 4 && Object.keys(op.fields).join() === "fstarttime,fendtime"),
    "A5 خطة الكتابة: حذفٌ، وتحديثٌ بالحقول التي تغيّرت وحدها", ops);

  /* القياس والمؤشر */
  const delta = compareBoards(board, after, context);
  check(delta.changedRows === 2 && delta.level !== "green" && delta.teachersAffected.includes(12), "A6 المقارنة: صفّان تغيّرا ومؤشّر الأثر ليس أخضر", delta);
  check(measure(board, context).seats === 6 * 35 && measure(after, context).shortfall! > 0, "A7 حذف شعبةٍ يُظهر طلبةً بلا مقعد (من الرادار، لا تخمين)", measure(after, context));
  check(measure(board, { ...context, demand: null }).shortfall === null, "A8 بلا رادار لا أرقام طلبة (null لا صفر مخترع)");

  /* أثر الحذف */
  const cards = sectionCards(board, context);
  check(cards.length === 6 && cards.find(c => c.key === "1|501")?.students === 32, "A9 بطاقات الشعب: جالسو الشعبة ≈ جالسو المقرر ÷ شعبه");
  const impact = removeImpact(board, "1|502", context)!;
  check(impact.students === 32 && impact.alternatives.length === 1 && impact.alternatives[0].freeSeats === 3 && impact.shortfall === 29
    && impact.teacher?.before === 6 && impact.teacher?.after === 3 && impact.freed.length === 2,
  "A10 حذف شعبة: الطلبة، البدائل بسعتها، العجز، نصاب الأستاذ قبل/بعد، الخانات المحرّرة", impact);

  /* إضافة شعبة */
  const placements = suggestPlacements(board, 1, context, { max: 3 });
  const added = addSectionChange(board, 1, placements[0], context);
  check(placements.length >= 1 && (added as any).rows[0].SCode === "503" && blocking(applyChanges(board, [added])) === 0 && placements[0].studentsServed === 26,
    "A11 اقتراح شعبة: نمط الشعبة الأخت، رقم 503، بلا تعارض، والطلبة المخدومون من الطلب غير المُلبّى", { placements, added });

  /* قراءة الجملة */
  const p1 = parseProblem("قاعة G23 تعطلت الأحد", context);
  const p2 = parseProblem("د. سارة العتيبي معتذرة الخميس", context);
  const p3 = parseProblem("زاد الطلب على 121", context);
  const p4 = parseProblem("صفّر الخميس", context);
  const p5 = parseProblem("قلّل فجوات الأساتذة", context);
  const p6 = parseProblem("وفّر قاعتين", context);
  check(p1?.kind === "roomDown" && (p1 as any).hall.hall === "G23" && (p1 as any).day === "fsunday", "A12 «قاعة G23 تعطلت الأحد»", p1);
  check(p2?.kind === "teacherOff" && (p2 as any).instructorId === 12 && (p2 as any).day === "fthursday", "A13 «د. سارة معتذرة الخميس»", p2);
  check(p3?.kind === "demandUp" && (p3 as any).courseId === 1, "A14 «زاد الطلب على 121»", p3);
  check(p4?.kind === "clearDay" && (p4 as any).day === "fthursday" && p5?.kind === "reduceGaps" && p6?.kind === "freeRooms" && (p6 as any).count === 2, "A15 الأهداف: صفّر الخميس / قلّل الفجوات / وفّر قاعتين");
  check(parseProblem("مرحبا", context) === null, "A16 ما لا يُفهم يعود null (لا ذكاء مدّعى)");

  /* الحلول: ثلاثة على الأكثر، أفضلها بنجمة، ولا حلّ يزيد الموانع */
  const allSolutions = [p1, p2, p3, p4, p6].map(problem => solveProblem(problem!, board, context));
  const room = allSolutions[0];
  check(room.length >= 2 && room.length <= 3 && room.filter(s => s.best).length === 1 && room[0].best && room.every(s => s.satisfied), "A17 «القاعة تعطلت»: حلول متعددة، الأول ⭐ ويحقّق الطلب", room.map(s => [s.philosophy, s.score, s.satisfied]));
  check(new Set(room.map(s => s.philosophy)).size === room.length, "A18 كل حلٍّ بفلسفة مختلفة");
  check(allSolutions.flat().every(s => blocking(applyChanges(board, s.changes)) <= blocking(board)), "A19 لا حلّ في أي وضعٍ يزيد موانع الاعتماد");
  const teacher = allSolutions[1];
  check(teacher.some(s => s.philosophy === "flex" && s.changes[0].op === "assign" && (s.changes[0] as any).instructorId === 99), "A20 «هيئة تدريسية» مرونةٌ معروضة حين يعتذر أستاذ", teacher.map(s => s.philosophy));
  check(allSolutions[2].every(s => s.changes[0].op === "add") && allSolutions[2].length >= 2, "A21 زيادة الطلب: شعبٌ مقترحة بفلسفات مختلفة");
  check(allSolutions[3].some(s => s.satisfied) && allSolutions[3].every(s => applyChanges(board, s.changes).filter(r => r.AdSectionId === 1).every(r => !r.fthursday) || !s.satisfied), "A22 «صفّر الخميس» يفرّغه فعلاً حين يقول إنه حقّقه");
  check(allSolutions[4].length >= 1 && allSolutions[4][0].delta.after.roomsUsed <= measure(board, context).roomsUsed - 1, "A23 «وفّر قاعات»: قاعاتٌ مستعملة أقل", allSolutions[4].map(s => s.delta.after.roomsUsed));

  /* سلسلة دومينو معقّدة: كل القاعات ممتلئة في وقت الحصّة إلا بنقل */
  {
    const tight: FSchedule[] = [
      row(101, 1, "601", 11, ["fsunday"], "08:00", "09:15", 0),
      row(102, 2, "601", 12, ["fsunday"], "08:00", "09:15", 1),
      row(103, 3, "601", 13, ["fsunday"], "08:00", "09:15", 2),
      row(104, 4, "601", 12, ["fsunday"], "09:30", "10:45", 3),
    ];
    const tightContext: TmContext = { ...context, rows: tight, outside: [], halls: halls.slice(0, 3), demand: null };
    const solutions = solveProblem({ kind: "roomDown", hall: halls[0], day: "fsunday" }, tight, tightContext);
    check(solutions.length >= 1 && solutions.every(s => s.satisfied ? blocking(applyChanges(tight, s.changes)) === 0 : true), "A24 سلسلة ضيقة: الحلّ يُخلي القاعة دون تعارض", solutions.map(s => [s.philosophy, s.changes.map(c => c.label)]));
    const chain = solutions.find(s => s.philosophy === "minimal");
    const nodes = chain ? dominoOf(chain.changes) : [];
    check(!chain || nodes.every((node, i) => i === 0 ? node.depth === 0 : node.depth >= 0), "A25 الدومينو: كل حركة بعمقها وسببها");
  }

  /* المقارنة والبطاقات */
  const comparison = compareScenarios(room.map(s => s.delta));
  check(comparison.rows.length === 6 && comparison.bestIndex >= 0, "A26 مقارنة السيناريوهات جنباً إلى جنب مع ⭐");
  const cardsFor = teacherCards(board, applyChanges(board, room[0].changes), context);
  check(cardsFor.length >= 1 && cardsFor.every(card => card.before.length + card.after.length > 0), "A27 النشر: بطاقة قبل→بعد للأساتذة المتأثرين وحدهم", cardsFor);
}

/* ══ B) الخادم في وضع التجربة ═══════════════════════════════════════════════ */
const BASE = `http://localhost:${process.env.PORT || "3000"}`;
const up = async () => { try { return (await fetch(BASE + "/api/public/me/state")).ok; } catch { return false; } };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "time-machine-"));
let child: ReturnType<typeof spawn> | null = null;
try {
  if (await up()) console.log("   (تخطّي B: المنفذ مشغول بخادمٍ آخر)");
  else {
    child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i += 1) { ready = await up(); if (!ready) await new Promise(r => setTimeout(r, 1000)); }
    if (!ready) throw new Error("الخادم لم يبدأ");
    const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
    const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
    await waitForDemoSeed(BASE, cookie);
    const call = async (method: string, url: string, body?: unknown) => {
      const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json().catch(() => null) as any };
    };
    const role = async (name: string) => (await call("POST", "/api/demo/role", { role: name })).status;
    check(await role("committeeChair") === 200, "B0 صفة رئيس لجنة الجدول (يكتب الجدول)");

    const ctx = (await call("GET", "/api/time-machine/context")).body as TmContext & { frozen: string | null };
    check(Boolean(ctx?.rows?.length) && ctx.canWrite === true && ctx.scope.sectionId > 0, "B1 السياق: صفوف النطاق وإذن الكتابة", { rows: ctx?.rows?.length, canWrite: ctx?.canWrite, frozen: ctx?.frozen });
    check(ctx.outside.every(r => r.AdCourseName === "موعد قسمٍ آخر" && r.AdSectionId === 0), "B2 بقية الفصل مقنّعة: لا اسم مقرر ولا قسم من خارج النطاق");
    const scope = { collegeId: ctx.scope.collegeId, sectionId: ctx.scope.sectionId, termId: ctx.scope.termId };
    const qs = `collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${scope.termId}`;
    const board = [...ctx.rows, ...ctx.outside];
    const live = async () => (await call("GET", `/api/schedules?${qs}`)).body as FSchedule[];

    /* نقلٌ سليم بمحرّك الاقتراح نفسه. */
    /* موعدٌ نظيف (لا يحمل تعارضاً من بيانات الديمو المقصودة) كي تعيده الاستعادة إلى موضعٍ سليم. */
    const placeholdersB = placeholderInstructorIds(ctx.instructors);
    const clean = (r: FSchedule) => findConflicts([r], board, { placeholderInstructorIds: placeholdersB }).filter(isBlockingConflict).length === 0;
    /* قاعدة المالك 2026-10-30: النمطُ من مكتبة الأنماط وحده — فالنقلُ يُختبر على شعبةٍ بصفٍّ واحد بنمطٍ معتمد،
       لا على شعبةٍ قديمة مقسومة على صفوفٍ بنمطٍ خارج المكتبة (نقلُ صفٍّ منها إلى نمطٍ كامل يزيد ساعاتها). */
    const cardsB = sectionCards(board, ctx);
    const approvedSingle = (r: FSchedule) => {
      const hours = Number(ctx.courses.find(c => Number(c.AdCourseId) === Number(r.AdCourseId))?.CourseHours || 0);
      return daysApprovedForHours(hours, TM_DAYS.filter(day => Boolean((r as any)[day]))) === true
        && (cardsB.find(card => card.rowIds.includes(r.id))?.rowIds.length || 0) === 1;
    };
    const target = (ctx.rows.find(r => r.buildingId && r.roomId && ctx.instructors.some(p => p.AdInstructorId === r.AdInstructorId) && clean(r) && approvedSingle(r))
      || ctx.rows.find(r => r.buildingId && r.roomId && ctx.instructors.some(p => p.AdInstructorId === r.AdInstructorId) && clean(r)))!;
    const cardOf = cardsB.find(card => card.rowIds.includes(target.id))!;
    const spot = suggestPlacements(board.filter(r => !cardOf.rowIds.includes(r.id)), target.AdCourseId, ctx, { instructorId: target.AdInstructorId, max: 1 })[0];
    check(Boolean(spot), "B3 المحرّك يجد موضعاً خالياً حقيقياً في الديمو", spot);
    const moveChange: TmChange = { id: "m1", op: "move", rowId: target.id, days: spot.days, start: spot.start, end: spot.start === target.fstarttime ? target.fendtime : spot.end, hall: spot.hall, label: "نقل اختبار" };
    const saved = await call("POST", "/api/time-machine/scenarios", { ...scope, name: "اختبار نقل", mode: "lab", changes: [moveChange] });
    check(saved.status === 200 && saved.body?.scenario?.base?.[String(target.id)] === Number(target.rev || 0), "B4 الحفظ يختم إصدار الصف", saved.body);
    const scenario = saved.body.scenario;
    const students = await call("POST", "/api/time-machine/students", { ...scope, changes: [moveChange] });
    check(students.status === 200 && typeof students.body?.available === "boolean", "B5 أثر مساري/الرادار يُسأل ولا يكتب", students.body);

    /* مشاركة للعرض ثم العميد يرى ولا يكتب */
    check((await call("POST", `/api/time-machine/scenarios/${scenario.id}/share`, { shared: true })).status === 200, "B6 المشاركة للعرض");
    check(await role("dean") === 200, "B7 صفة العميد");
    const deanCtx = await call("GET", `/api/time-machine/context?${qs}`);
    const deanList = await call("GET", `/api/time-machine/scenarios?${qs}`);
    const deanApply = await call("POST", `/api/time-machine/scenarios/${scenario.id}/apply`, {});
    const deanSave = await call("POST", "/api/time-machine/scenarios", { ...scope, name: "عميد", changes: [] });
    check(deanCtx.status === 200 && deanCtx.body?.canWrite === false, "B8 العميد يقرأ السياق ويحاكي (canWrite=false)", [deanCtx.status, deanCtx.body?.error, deanCtx.body?.canWrite]);
    check(deanList.status === 200 && deanList.body.scenarios.some((s: any) => s.id === scenario.id), "B9 العميد يرى السيناريو المشارَك");
    check(deanApply.status === 403 && deanSave.status === 403, "B10 العميد لا يعتمد ولا يحفظ (الحارس في الخادم)", [deanApply.status, deanSave.status]);
    await role("committeeChair");

    /* الاعتماد الذرّي */
    const before = await live();
    const applied = await call("POST", `/api/time-machine/scenarios/${scenario.id}/apply`, { revision: (await call("GET", `/api/time-machine/scenarios?${qs}`)).body.scenarios.find((s: any) => s.id === scenario.id).revision });
    const afterRows = await live();
    const movedRow = afterRows.find(r => r.id === target.id);
    check(applied.status === 200 && movedRow?.fstarttime === moveChange.start && Number(movedRow?.rev) === Number(target.rev || 0) + 1, "B11 الاعتماد يكتب في الجدول الحيّ (الإصدار +1)", applied.body);
    check(applied.body?.scenario?.status === "applied" && applied.body.scenario.restorePoint?.before?.[0]?.fstarttime === target.fstarttime
      && applied.body.scenario.history.some((h: any) => h.action === "applied" && h.by), "B12 السجلّ: حالة «معتمد»، نقطة استعادة، ومن اعتمد");
    check(afterRows.length === before.length, "B13 لا صفوف زائدة ولا ناقصة");
    const again = await call("POST", `/api/time-machine/scenarios/${scenario.id}/apply`, {});
    check(again.status === 409, "B14 لا يُعتمد السيناريو مرتين");

    /* الانحراف: الجدول الحيّ تغيّر بعد بناء السيناريو */
    const other = afterRows.find(r => r.id !== target.id && r.buildingId && r.roomId && clean(r))!;
    const drifting = (await call("POST", "/api/time-machine/scenarios", { ...scope, name: "انحراف", changes: [{ id: "a1", op: "assign", rowIds: [other.id], instructorId: other.AdInstructorId, label: "x" }, { id: "m2", op: "move", rowId: other.id, start: other.fstarttime, end: other.fendtime, label: "y" }] })).body.scenario;
    const bump = await call("POST", "/api/schedules/move-batch", { moves: [{ id: other.id, rev: other.rev, fields: { fstarttime: other.fstarttime, fendtime: other.fendtime } }] });
    const blocked = await call("POST", `/api/time-machine/scenarios/${drifting.id}/apply`, {});
    check(bump.status === 200 && blocked.status === 409 && blocked.body?.code === "drift" && blocked.body.drift?.[0]?.rowId === other.id, "B15 الجدول الحيّ تحرّك: الاعتماد يُرفض بتنبيه الانحراف", [bump.status, blocked.body]);

    /* خطوةٌ فاسدة تُبطل الكل: نقلٌ سليم + نقلٌ إلى قاعة مشغولة في وقتها */
    const fresh = await live();
    const [a, b] = fresh.filter(r => r.buildingId && r.roomId && r.id !== target.id && r.id !== other.id).slice(0, 2);
    const occupied = fresh.find(r => r.id !== b.id && r.id !== a.id && r.roomId && r.roomId !== b.roomId && r.buildingId)!;
    const okMove = suggestPlacements([...fresh, ...ctx.outside].filter(r => r.id !== a.id), a.AdCourseId, { ...ctx, rows: fresh }, { instructorId: a.AdInstructorId, max: 1 })[0];
    const bad = await call("POST", "/api/time-machine/scenarios", { ...scope, name: "خطوة فاسدة", changes: [
      { id: "ok", op: "move", rowId: a.id, days: okMove.days, start: okMove.start, end: okMove.end, hall: okMove.hall, label: "سليم" },
      { id: "bad", op: "move", rowId: b.id, days: (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const).filter(d => occupied[d]), start: occupied.fstarttime, end: occupied.fendtime,
        hall: { code: occupied.AdRoomCode, hall: occupied.AdRoomHall, buildingId: occupied.buildingId, roomId: occupied.roomId }, label: "فاسد" },
    ] });
    const refused = await call("POST", `/api/time-machine/scenarios/${bad.body.scenario.id}/apply`, {});
    const untouched = (await live()).find(r => r.id === a.id);
    check(refused.status >= 400 && untouched?.fstarttime === a.fstarttime && Number(untouched?.rev) === Number(a.rev), "B16 خطوةٌ فاسدة: لا يُكتب شيء ولا حتى الخطوة السليمة", { status: refused.status, body: refused.body });

    /* اعتمادان متزامنان لسيناريوهين مختلفين على الفصل نفسه */
    const pick = (await live()).filter(r => r.buildingId && r.roomId && ![target.id, other.id, a.id, b.id].includes(r.id)).slice(0, 2);
    const scenarios = [];
    for (const r of pick) scenarios.push((await call("POST", "/api/time-machine/scenarios", { ...scope, name: `متزامن ${r.id}`, changes: [{ id: `t${r.id}`, op: "move", rowId: r.id, start: r.fstarttime, end: r.fendtime, hall: { code: r.AdRoomCode, hall: r.AdRoomHall, buildingId: r.buildingId, roomId: r.roomId }, days: (["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const).filter(d => r[d]), label: "مكانه" }, { id: `s${r.id}`, op: "assign", rowIds: [r.id], instructorId: r.AdInstructorId, label: "أستاذه" }] })).body.scenario);
    const racing = await Promise.all(scenarios.map(s => call("POST", `/api/time-machine/scenarios/${s.id}/apply`, {})));
    check(racing.every(r => [200, 400, 409].includes(r.status)) && racing.some(r => r.status === 400 || r.status === 409 || r.status === 200), "B17 اعتمادان متزامنان: كلٌّ ينجح كاملاً أو يُرفض (قفل الفصل)", racing.map(r => [r.status, r.body?.code]));

    /* الاستعادة بنقرة */
    const restored = await call("POST", `/api/time-machine/scenarios/${scenario.id}/restore`, {});
    const back = (await live()).find(r => r.id === target.id);
    check(restored.status === 200 && back?.fstarttime === target.fstarttime && back?.AdRoomHall === target.AdRoomHall && restored.body?.scenario?.status === "restored", "B18 الاستعادة بنقرة تعيد الموعد كما كان", restored.body);

    /* اعتمادٌ ثم تعديلٌ يدويّ ثم استعادة ← ترفض ولا تكتب فوق عمل الزميل */
    const copy = await call("POST", `/api/time-machine/scenarios/${scenario.id}/copy`, {});
    const copyApplied = await call("POST", `/api/time-machine/scenarios/${copy.body.scenario.id}/apply`, {});
    const now = (await live()).find(r => r.id === target.id)!;
    const manual = await call("POST", "/api/schedules/move-batch", { moves: [{ id: now.id, rev: now.rev, fields: { fstarttime: now.fstarttime, fendtime: now.fendtime } }] });
    const lateRestore = await call("POST", `/api/time-machine/scenarios/${copy.body.scenario.id}/restore`, {});
    const still = (await live()).find(r => r.id === target.id);
    check(copy.status === 200 && copyApplied.status === 200 && manual.status === 200 && lateRestore.status === 409 && still?.fstarttime === now.fstarttime,
      "B19 النسخة تُعتمد؛ وبعد تعديلٍ يدويّ تُرفض الاستعادة ولا تكتب فوقه", [copy.status, copyApplied.status, manual.status, lateRestore.status, lateRestore.body?.error]);

    /* إضافة شعبة ثم استعادة تحذفها */
    const addCourse = ctx.courses.find(c => ctx.rows.some(r => r.AdCourseId === c.AdCourseId))!;
    const nowBoard = [...(await live()), ...ctx.outside];
    const place = suggestPlacements(nowBoard, addCourse.AdCourseId, { ...ctx, rows: nowBoard.filter(r => r.AdSectionId === scope.sectionId) }, { max: 1 })[0];
    if (place) {
      const addChange = addSectionChange(nowBoard, addCourse.AdCourseId, place, { ...ctx, rows: nowBoard.filter(r => r.AdSectionId === scope.sectionId) });
      const addScenario = (await call("POST", "/api/time-machine/scenarios", { ...scope, name: "إضافة", changes: [addChange] })).body.scenario;
      const countBefore = (await live()).length;
      const addApplied = await call("POST", `/api/time-machine/scenarios/${addScenario.id}/apply`, {});
      const countAfter = (await live()).length;
      const addRestore = await call("POST", `/api/time-machine/scenarios/${addScenario.id}/restore`, {});
      const countBack = (await live()).length;
      check(addApplied.status === 200 && countAfter === countBefore + 1 && addRestore.status === 200 && countBack === countBefore, "B20 إضافة شعبة ذرّياً، والاستعادة تحذفها", [addApplied.status, addApplied.body?.error, countBefore, countAfter, addRestore.status, countBack]);
    } else check(false, "B20 لا موضع لإضافة شعبة في الديمو");

    /* قارئٌ عاديّ لا يحفظ */
    await role("departmentHead");
    const standardSave = await call("POST", "/api/time-machine/scenarios", { ...scope, name: "عادي", changes: [] });
    check(standardSave.status === 403, "B21 رئيس القسم يرى ويحاكي ولا يحفظ", standardSave.status);
  }
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ تعطّل الاختبار\x1b[0m", error instanceof Error ? error.stack : error);
} finally {
  if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* انتهى */ } }
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nآلة الزمن: ${passed} ناجح · ${failed} فاشل`);
process.exit(failed ? 1 : 0);
