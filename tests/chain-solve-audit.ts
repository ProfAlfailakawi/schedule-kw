/**
 * ── «حلّ بسلسلة»: المحوّل النقيّ فوق findRepairChain ─────────────────────────────
 *
 *   A  سلسلة بنقلة واحدة تُخلي القاعة، وتغييراتُها بصيغة آلة الزمن.
 *   B  سلسلة بنقلتين (دومينو) والأسبوعان قبل/بعد.
 *   C  أسبابُ العجز: مجمّد، معتمد، قسمٌ آخر، حجز، لا شيء يُزاح، لا سلسلة.
 *   D  صفٌّ مقفل لا يُنقل أبداً؛ وسقفُ الثلاث نقلات.
 *   E  التغييراتُ تُخلي موعدك فعلاً عند تطبيقها (applyChanges) بلا تعارضٍ جديد.
 *   F  سطرُ الأثر على الطلبة، وأرقامٌ لاتينية.
 */
import { solveChain, chainImpactLine, CHAIN_DRAFT_ID, CHAIN_MAX_MOVES, CHAIN_REASON, type ChainSolveInput } from "../src/utils/chainSolve";
import { applyChanges } from "../src/utils/timeMachine";
import { fastConflictScan, minutesToTime } from "../src/utils/scheduleIntelligence";
import type { FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};

const SCOPE = { collegeId: 1, sectionId: 1, termId: 1 };
const ROOMS = [{ roomId: "r1", buildingId: "b1", code: "101", hall: "A" }, { roomId: "r2", buildingId: "b1", code: "102", hall: "A" }];
let nextId = 1;
const row = (over: Partial<FSchedule> & { room?: number; days?: Array<"fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday">; start: string; dur?: number; teacher: number }): FSchedule => {
  const room = ROOMS[over.room ?? 0];
  const days = over.days || ["fsunday", "ftuesday", "fthursday"];
  const [h, m] = over.start.split(":").map(Number);
  const id = Number(over.id) || nextId++;
  return {
    id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 100 + id, AdCourseName: `مقرر ${id}`, CourseCodeSnapshot: `C${id}`, SCode: "1",
    AdInstructorId: over.teacher, fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
    ...Object.fromEntries(days.map(day => [day, true])),
    fstarttime: over.start, fendtime: minutesToTime(h * 60 + m + (over.dur ?? 50)),
    AdRoomCode: room.code, AdRoomHall: room.hall, buildingId: room.buildingId, roomId: room.roomId, locationStatus: "VERIFIED", rev: 1,
    ...over,
  } as unknown as FSchedule;
};
const draftAt = (start: string, teacher: number, room = 0) => ({
  courseName: "موعدك", courseCode: "NEW", sectionCode: "9", instructorId: teacher, room: ROOMS[room],
  days: ["fsunday", "ftuesday", "fthursday"] as const, start, end: minutesToTime(Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + 50),
});
const base = (rows: FSchedule[], over: Partial<ChainSolveInput> = {}): ChainSolveInput => ({ draft: draftAt("08:00", 900), rows, scope: SCOPE, ...over });
const STARTS = Array.from({ length: 12 }, (_, i) => `${String(8 + i).padStart(2, "0")}:00`);

/** كلُّ (قاعة، ساعة) مشغولة بأستاذٍ مختلف، إلا ما يُستثنى. */
function packed(skip: (room: number, start: string) => boolean = () => false, patch?: (room: number, start: string) => Partial<FSchedule> & { start?: string; teacher?: number }) {
  const rows: FSchedule[] = [];
  let teacher = 1000;
  for (let room = 0; room < ROOMS.length; room += 1) for (const start of STARTS) {
    if (skip(room, start)) continue;
    rows.push(row({ room, start, teacher: teacher++, ...(patch?.(room, start) || {}) } as any));
  }
  return rows;
}

(async () => {
  /* ── A: نقلةٌ واحدة ─────────────────────────────────────────────────── */
  {
    const blocker = row({ room: 0, start: "08:00", teacher: 500 });
    const other = row({ room: 1, start: "13:00", teacher: 501 });
    const out = solveChain(base([blocker, other]));
    check(out.ok && out.canApply && out.steps.length === 1 && out.reasonIfNot === null, "A1 قاعةٌ محجوزة: نقلةٌ واحدة تكفي", out.reasonIfNot);
    check(out.steps[0]?.rowId === blocker.id && out.steps[0].freed.includes("room") && !out.steps[0].freed.includes("teacher"), "A2 الخطوة تُفرغ القاعة لا الأستاذ", out.steps[0]);
    const change: any = out.changes[0];
    check(change?.op === "move" && change.rowId === blocker.id && change.days?.length && /^\d\d:\d\d$/.test(change.start) && change.hall?.code, "A3 تغييرٌ بصيغة آلة الزمن (move + days + start + hall)", change);
    check(out.effects.moves === 1 && out.effects.teachers === 1 && out.effects.conflictsAfter <= out.effects.conflictsBefore, "A4 الأثر: نقلة، أستاذٌ واحد، بلا تعارضٍ أكثر", out.effects);
    const teacherBlock = solveChain(base([row({ room: 1, start: "08:00", teacher: 900 }), row({ room: 0, start: "13:00", teacher: 502 })]));
    check(teacherBlock.ok && teacherBlock.steps[0]?.freed.includes("teacher"), "A5 أستاذٌ مشغول: الخطوة تُفرغ الأستاذ", teacherBlock.steps[0]);
    const edit = row({ room: 0, start: "08:00", teacher: 900, id: 777 });
    const edited = solveChain(base([edit, other], { draft: { ...draftAt("08:00", 900), editId: 777 } }));
    check(!edited.ok && edited.reasonIfNot === "none", "A6 تعديل موعدٍ قائم: صفُّه الأصلي لا يُعدّ عائقاً لنفسه", edited.reasonIfNot);
  }

  /* ── B: دومينو بنقلتين ─────────────────────────────────────────────── */
  const twoMoveRows = () => {
    /* كل خانةٍ مشغولة بنمط أحد-ثلاثاء-خميس؛ ثغرتان لا تصلحان للنقل المباشر:
       ٢/١٩:٠٠ يشغل ثلاثاءَه وخميسَه موعدٌ ثنائي (ث-خ)، و٢/١٨:٠٠ يشغل أحدَه موعدٌ أحدي. */
    const rows = packed((room, start) => room === 1 && (start === "19:00" || start === "18:00"));
    const tth = row({ room: 1, start: "19:00", teacher: 801, days: ["ftuesday", "fthursday"] });
    const sun = row({ room: 1, start: "18:00", teacher: 802, days: ["fsunday"] });
    return { rows: [...rows, tth, sun], tth, sun };
  };
  {
    const { rows } = twoMoveRows();
    const out = solveChain(base(rows));
    check(out.ok && out.steps.length >= 2 && out.steps.length <= CHAIN_MAX_MOVES, "B1 تحتاج دومينو: أكثر من نقلة وأقل من الحدّ", { ok: out.ok, n: out.steps.length, why: out.reasonIfNot });
    check(out.ok && out.changes.length === out.steps.length && out.changes[1]?.cause === out.changes[0]?.id && out.changes[0]?.cause === undefined, "B2 السببُ يسلسل الخطوات (cause) ليرسم الدومينو", out.changes.map(item => [item.id, item.cause]));
    check(out.ok && out.steps[1].freed.length > 0, "B3 كل نقلةٍ تُفرغ لمن قبلها ما يشاركها", out.steps.map(step => step.freed));
    check(out.ok && out.weeks.before.blocks.some(block => block.tone === "draft" && block.clash) && out.weeks.after.blocks.some(block => block.tone === "draft" && !block.clash)
      && out.weeks.before.blocks.some(block => block.tone === "moved") && out.weeks.after.blocks.some(block => block.tone === "moved") && out.weeks.after.to > out.weeks.after.from, "B4 أسبوعان: قبل (موعدك يصطدم) وبعد (يدخل)", out.weeks.before.blocks.length);
    const one = solveChain(base(rows, { maxMoves: 1 }));
    check(!one.ok && (one.reasonIfNot === "no-chain" || one.reasonIfNot === "too-long"), "B5 السقف نقلةٌ واحدة: لا سلسلةَ بنقلتين", one.reasonIfNot);
    const big = solveChain(base(rows, { maxMoves: 9 }));
    check(big.steps.length <= CHAIN_MAX_MOVES && CHAIN_MAX_MOVES === 3, "B6 سقفٌ صلبٌ ثلاثُ نقلات مهما طُلب", big.steps.length);
  }

  /* ── C: أسبابُ العجز ───────────────────────────────────────────────── */
  {
    const blocker = row({ room: 0, start: "08:00", teacher: 500 });
    const spare = row({ room: 1, start: "13:00", teacher: 501 });
    check(solveChain(base([blocker, spare], { frozen: true })).reasonIfNot === "frozen", "C1 الفصل مجمّد");
    check(solveChain(base([blocker, spare], { approvalLocked: true })).reasonIfNot === "locked", "C2 الجدول معتمدٌ مقفل");
    check(solveChain(base([blocker, spare], { isRowLocked: item => item.id === blocker.id })).reasonIfNot === "locked", "C3 الصفُّ العائق مقفل");
    check(solveChain(base([{ ...blocker, AdSectionId: 2 } as FSchedule, spare])).reasonIfNot === "foreign", "C4 الصفُّ العائق من قسمٍ آخر");
    check(solveChain(base([blocker, spare], { canEditRow: item => item.id !== blocker.id })).reasonIfNot === "foreign", "C5 لا يملك المستخدم تعديله");
    check(solveChain(base([blocker, spare], { heldRowIds: [blocker.id] })).reasonIfNot === "held", "C6 عليه حجزُ طلب");
    check(solveChain(base([spare, row({ room: 0, start: "13:00", teacher: 503 })], { holds: [{ days: ["fsunday", "ftuesday", "fthursday"], start: "08:00", end: "08:50", roomCode: "101", roomHall: "A", instructorId: 1 }] })).reasonIfNot === "held", "C7 حجزُ زميلٍ يبني موعداً الآن: لا يُزاح");
    check(solveChain(base([spare])).reasonIfNot === "none", "C8 لا عائقَ يُزاح");
    check(solveChain({ ...base([blocker]), draft: { ...draftAt("08:00", 900), days: [] } }).reasonIfNot === "invalid", "C9 موعدٌ غير مكتمل");
    const full = packed();
    const jam = solveChain(base(full));
    check(!jam.ok && !jam.canApply && jam.reasonIfNot === "no-chain" && jam.steps.length === 0 && jam.changes.length === 0, "C10 لوحةٌ ممتلئةٌ بلا ثغرة: «لا سلسلة آمنة» بسببٍ واحد", jam.reasonIfNot);
    const both = solveChain(base([row({ room: 0, start: "08:00", teacher: 900 }), row({ room: 1, start: "08:00", teacher: 500 })]));
    check(CHAIN_REASON[both.reasonIfNot || "no-chain"].word.length > 0 && Object.values(CHAIN_REASON).every(item => item.word && item.icon), "C11 لكل سببٍ كلمةٌ وأيقونة");
    const tooMany = solveChain(base([...Array.from({ length: 4 }, (_, i) => row({ room: 0, start: "08:00", teacher: 600 + i, days: ["fsunday"], id: 900 + i } as any))], { draft: { ...draftAt("08:00", 900), room: null } }));
    check(tooMany.reasonIfNot === "none", "C12 بلا قاعةٍ مختارة لا يُعدّ التعارضُ إلا بالأستاذ", tooMany.reasonIfNot);
  }

  /* ── D: صفٌّ مقفل لا يُنقل أبداً ───────────────────────────────────── */
  {
    const { rows, tth, sun } = twoMoveRows();
    const locked = new Set([tth.id, sun.id]);
    const out = solveChain(base(rows, { isRowLocked: item => locked.has(item.id) }));
    check(out.steps.every(step => !locked.has(step.rowId)) && out.changes.every((change: any) => !locked.has(change.rowId)), "D1 صفوفٌ مقفلة لا تظهر في السلسلة أبداً", out.steps.map(step => step.rowId));
    const lockedAll = new Set(rows.map(item => item.id));
    lockedAll.delete(rows[0].id);
    const only = solveChain(base(rows, { isRowLocked: item => lockedAll.has(item.id) }));
    check(only.steps.every(step => step.rowId === rows[0].id), "D2 لا يُنقل إلا غير المقفل", only.steps.map(step => step.rowId));
  }

  /* ── E: التطبيقُ يُخلي موعدك بلا تعارضٍ جديد ────────────────────────── */
  {
    const cases: Array<[string, FSchedule[]]> = [["نقلة", [row({ room: 0, start: "08:00", teacher: 500 }), row({ room: 1, start: "13:00", teacher: 501 })]], ["دومينو", twoMoveRows().rows]];
    for (const [name, rows] of cases) {
      const out = solveChain(base([...rows]));
      const after = applyChanges([...rows], out.changes);
      const mine = { ...rows[0], id: 99999, AdInstructorId: 900, ...Object.fromEntries(["fsunday", "ftuesday", "fthursday"].map(day => [day, true])), fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "101", AdRoomHall: "A", roomId: "r1", buildingId: "b1" } as FSchedule;
      const beforePairs = fastConflictScan([...rows, mine]).pairs, restPairs = fastConflictScan(rows).pairs, afterPairs = fastConflictScan([...after, mine]).pairs;
      check(out.ok && afterPairs <= restPairs && afterPairs < beforePairs, `E ${name}: بعد التطبيق موعدك بلا تعارض (${beforePairs} ← ${afterPairs})`, { restPairs });
    }
    check(CHAIN_DRAFT_ID < 0, "E3 صفُّ المسوّدة سالبُ المعرّف فلا يصل الخادم");
  }

  /* ── F: الأثر على الطلبة والأرقام ───────────────────────────────────── */
  {
    check(chainImpactLine({ helped: 0, harmed: 0, harmedOutside: 0 }).text === "لا يمسّ طلبة" && chainImpactLine({ helped: 0, harmed: 0 }).tone === "good", "F1 لا أحد: «لا يمسّ طلبة» أخضر");
    const some = chainImpactLine({ helped: 3, harmed: 5, harmedOutside: 0 });
    check(some.count === 8 && some.tone === "warn" && /8/.test(some.text) && /^يمسّ/.test(some.text), "F2 «يمسّ 8 …» عنبري حين ثمة متضرّر", some);
    check(chainImpactLine(null).tone === "idle" && chainImpactLine(null).count === null, "F3 بلا رادار: لا رقمَ مخترع");
    const texts = JSON.stringify([some, chainImpactLine({ helped: 12, harmed: 0 }), CHAIN_REASON]);
    check(!/[\u0660-\u0669\u06F0-\u06F9]/.test(texts), "F4 أرقامٌ لاتينية فقط");
  }

  console.log(`\nchain-solve audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
