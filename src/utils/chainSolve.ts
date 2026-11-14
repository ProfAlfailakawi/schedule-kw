/**
 * ── «حلّ بسلسلة»: المحرّك الموجود، بمدخلات النموذج ──────────────────────────────
 *
 * عند تعارض الموعد الذي يُبنى الآن (أستاذٌ مشغول أو قاعةٌ محجوزة) يقترح «بديل» وقتاً آخر لهذا الموعد وحده.
 * هنا الوجهة الثانية: يبقى موعدك مكانه، وتتحرّك مواعيدُ أخرى قائمة (حتى ثلاثة) بدومينو واحد يُفرغ المكان.
 *
 * لا محرّكَ ثانياً ولا بابَ كتابةٍ ثانياً:
 *   • البحث: findRepairChain (src/utils/repairChain.ts) — موعدك صفٌّ مؤقتٌ على اللوحة لا يُزاح (immovable).
 *   • الاعتماد: سيناريو آلة الزمن نفسه (POST /api/time-machine/scenarios ثم …/apply) فيُكتب كلُّه أو لا شيء،
 *     ويعيد الخادمُ فحصَ الأسبوع النهائي بمعالجَي الحفظ. هذا الملف يبني تغييراتِ TmChange فقط.
 *
 * دالةٌ نقيّة: لا شبكة ولا حالة. لا تُحرّك أبداً: صفّاً مجمّداً/معتمداً مقفلاً، ولا صفَّ قسمٍ لا يملك المستخدم تعديله،
 * ولا صفّاً عليه حجزُ طلب أو يعدّله زميلٌ الآن.
 */
import type { FSchedule } from "../types";
import { SCHEDULE_DAYS, activeDays, fastConflictScan, isBlockingConflict, timeToMinutes, type DayKey } from "./scheduleIntelligence";
import { findRepairChain, type RepairMove } from "./repairChain";
import { roomIdentityKey } from "./locationRegistry";
import { conflictKind } from "./appointmentVerdict";
import type { TmChange } from "./timeMachine";
import { AR, countOf } from "./arabicCount";

/** أقصى عدد نقلات في السلسلة (قرار المالك). */
export const CHAIN_MAX_MOVES = 3;
/** معرّفُ صفّ المسوّدة على اللوحة المؤقتة: سالبٌ فلا يصطدم بصفٍّ حقيقي ولا يُرسل للخادم. */
export const CHAIN_DRAFT_ID = -1_000_000_007;

export type ChainReason = "frozen" | "locked" | "foreign" | "held" | "none" | "other" | "too-long" | "no-chain" | "invalid";

/** كلمةٌ واحدة وأيقونةٌ لكل سبب (الاسم من lucide-react، تختاره الشاشة). */
export const CHAIN_REASON: Record<ChainReason, { word: string; icon: "snowflake" | "lock" | "building" | "clock" | "check" | "alert" | "layers" | "route" | "pencil" }> = {
  frozen: { word: "الفصل مجمّد", icon: "snowflake" },
  locked: { word: "الجدول معتمد", icon: "lock" },
  foreign: { word: "موعد قسمٍ آخر", icon: "building" },
  held: { word: "محجوز لطلب", icon: "clock" },
  none: { word: "لا شيء يُزاح", icon: "check" },
  other: { word: "مانعٌ من نوعٍ آخر", icon: "alert" },
  "too-long": { word: "تحتاج أكثر من 3 نقلات", icon: "layers" },
  "no-chain": { word: "لا سلسلة آمنة", icon: "route" },
  invalid: { word: "أكمل الموعد أولاً", icon: "pencil" },
};

export interface ChainDraft {
  courseId?: number;
  courseName?: string;
  courseCode?: string;
  sectionCode?: string;
  instructorId?: number;
  room?: { buildingId?: string; roomId?: string; code?: string; hall?: string } | null;
  days: readonly DayKey[];
  start: string;
  end: string;
  /** الموعد المعدَّل: صفُّه الأصلي يُسقط من اللوحة (يحلّ الجديد محلّه). */
  editId?: number;
}

export interface ChainSolveInput {
  draft: ChainDraft;
  /** مواعيد الفصل كما يعرفها المحرّر (النطاق وما حوله). */
  rows: readonly FSchedule[];
  /** تعارضاتُ الخادم كما في المحرّر (أنواع appointmentVerdict). */
  conflicts?: readonly any[];
  scope: { collegeId: number; sectionId: number; termId: number };
  frozen?: boolean;
  /** جدولُ القسم معتمدٌ ومقفل (approvalLock في الشاشة). */
  approvalLocked?: boolean;
  /** صفٌّ بعينه مقفل. */
  isRowLocked?: (row: FSchedule) => boolean;
  /** هل يملك المستخدم تعديل هذا الصف؟ (يُشتق من النطاق إن غاب.) */
  canEditRow?: (row: FSchedule) => boolean;
  /** معرّفات صفوفٍ عليها حجزُ طلب أو يعدّلها زميلٌ الآن. */
  heldRowIds?: Iterable<number>;
  /** حجوزُ المسوّدات الجارية (scheduleHolds): تُعامل صفوفاً وهميةً لا تُزاح. */
  holds?: ReadonlyArray<{ days: readonly string[]; start: string; end: string; roomCode?: string; roomHall?: string; instructorId?: number; editId?: number }>;
  placeholderInstructorIds?: Iterable<number>;
  courseHours?: (row: FSchedule) => number;
  courseLabel?: (row: FSchedule) => { code: string; name: string };
  maxMoves?: number;
}

export interface ChainSlot { days: DayKey[]; start: string; end: string; room: string; hall: string }
export interface ChainStep {
  rowId: number;
  courseCode: string;
  courseName: string;
  section: string;
  instructorId: number;
  from: ChainSlot;
  to: ChainSlot;
  /** ما يُفرغه هذا النقل لمن قبله في السلسلة. */
  freed: Array<"teacher" | "room">;
  roomChanged: boolean;
  because: string;
}
export interface ChainBlock { id: number; day: DayKey; from: number; to: number; tone: "draft" | "moved" | "base"; clash: boolean; label: string }
export interface ChainWeek { blocks: ChainBlock[]; from: number; to: number }
export interface ChainEffects {
  moves: number;
  teachers: number;
  rooms: number;
  roomChanges: number;
  dayChanges: number;
  instructorIds: number[];
  conflictsBefore: number;
  conflictsAfter: number;
}
export interface ChainSolution {
  ok: boolean;
  canApply: boolean;
  reasonIfNot: ChainReason | null;
  steps: ChainStep[];
  /** تغييراتُ آلة الزمن الجاهزة للحفظ كسيناريو ثم الاعتماد. */
  changes: TmChange[];
  weeks: { before: ChainWeek; after: ChainWeek };
  effects: ChainEffects;
  /** موانعُ من نوعٍ آخر (غير الأستاذ والقاعة) تبقى بعد السلسلة. */
  remainingBlocks: number;
}

const BRANCH_BUDGETS = [6, 16] as const;
const EMPTY_WEEK: ChainWeek = { blocks: [], from: 8 * 60, to: 14 * 60 };
const EMPTY_EFFECTS: ChainEffects = { moves: 0, teachers: 0, rooms: 0, roomChanges: 0, dayChanges: 0, instructorIds: [], conflictsBefore: 0, conflictsAfter: 0 };
const fail = (reason: ChainReason, remainingBlocks = 0): ChainSolution => ({
  ok: false, canApply: false, reasonIfNot: reason, steps: [], changes: [],
  weeks: { before: EMPTY_WEEK, after: EMPTY_WEEK }, effects: EMPTY_EFFECTS, remainingBlocks,
});

const dayFlags = (days: readonly DayKey[]) => Object.fromEntries(SCHEDULE_DAYS.map(day => [day.key, days.includes(day.key)])) as Record<DayKey, boolean>;

function draftRowOf(input: ChainSolveInput): FSchedule {
  const { draft, scope } = input;
  const room = draft.room;
  return {
    id: CHAIN_DRAFT_ID, AdCollegeId: scope.collegeId, AdSectionId: scope.sectionId, AdTermId: scope.termId,
    AdCourseId: Number(draft.courseId) || -1, AdCourseName: draft.courseName || "موعدك", CourseCodeSnapshot: draft.courseCode,
    SCode: draft.sectionCode || "draft", AdInstructorId: Number(draft.instructorId) || 0,
    ...dayFlags(draft.days), fstarttime: draft.start, fendtime: draft.end,
    AdRoomCode: room?.code || "", AdRoomHall: room?.hall || "", buildingId: room?.buildingId, roomId: room?.roomId,
    locationStatus: room?.roomId || room?.code ? "VERIFIED" : "PENDING_ROOM",
  } as unknown as FSchedule;
}

const holdRowsOf = (input: ChainSolveInput): FSchedule[] => (input.holds || []).map((hold, index) => {
  /* الحجز يعرف رمز القاعة واسمها فقط: نأخذ معرّفها من صفٍّ يجلس فيها ليُقرأ مفتاحُها كما تُقرأ بقية الصفوف. */
  const seat = input.rows.find(item => String(item.AdRoomCode || "") === String(hold.roomCode || "") && String(item.AdRoomHall || "") === String(hold.roomHall || "") && item.roomId);
  return ({
  id: -3_000_000_000 - index, AdCollegeId: 0, AdSectionId: 0, AdTermId: input.scope.termId, AdCourseId: -(5000 + index), AdCourseName: "حجز", SCode: `hold:${index}`,
  AdInstructorId: Number(hold.instructorId) || 0,
  ...dayFlags(activeDaysOf(hold.days)), fstarttime: hold.start, fendtime: hold.end,
  AdRoomCode: hold.roomCode || "", AdRoomHall: hold.roomHall || "", roomId: seat?.roomId, buildingId: seat?.buildingId,
  } as unknown as FSchedule);
});
const activeDaysOf = (days: readonly string[]): DayKey[] => SCHEDULE_DAYS.map(day => day.key).filter(key => days.includes(key));

const slotOf = (row: FSchedule): ChainSlot => ({ days: activeDays(row), start: row.fstarttime, end: row.fendtime, room: String(row.AdRoomCode || ""), hall: String(row.AdRoomHall || "") });

/** ما يشترك فيه صفّان زمناً: أستاذٌ (شخصٌ حقيقي) أو قاعة. */
function sharedBetween(a: FSchedule, b: FSchedule, placeholders: ReadonlySet<number>): Array<"teacher" | "room"> {
  if (a.id === b.id) return [];
  const days = activeDays(a);
  if (!days.some(day => Boolean((b as any)[day]))) return [];
  if (!(timeToMinutes(a.fstarttime) < timeToMinutes(b.fendtime) && timeToMinutes(b.fstarttime) < timeToMinutes(a.fendtime))) return [];
  const out: Array<"teacher" | "room"> = [];
  const person = Number(a.AdInstructorId) || 0;
  if (person && !placeholders.has(person) && Number(b.AdInstructorId) === person) out.push("teacher");
  const room = roomIdentityKey(a);
  if (room && roomIdentityKey(b) === room) out.push("room");
  return out;
}

const withMove = (row: FSchedule, move: RepairMove): FSchedule => ({
  ...row, ...dayFlags(move.days), fstarttime: move.start, fendtime: move.end,
  buildingId: move.buildingId, roomId: move.roomId, AdRoomCode: move.roomCode, AdRoomHall: move.roomHall, locationStatus: "VERIFIED",
} as FSchedule);

function weekOf(blocks: ChainBlock[]): ChainWeek {
  if (!blocks.length) return EMPTY_WEEK;
  const lo = Math.floor(Math.min(...blocks.map(block => block.from)) / 60) * 60;
  const hi = Math.ceil(Math.max(...blocks.map(block => block.to)) / 60) * 60;
  return { blocks, from: lo, to: Math.max(hi, lo + 4 * 60) };
}

export function solveChain(input: ChainSolveInput): ChainSolution {
  const { draft, scope } = input;
  const maxMoves = Math.max(1, Math.min(CHAIN_MAX_MOVES, input.maxMoves ?? CHAIN_MAX_MOVES));
  if (!draft.days.length || !draft.start || !draft.end || timeToMinutes(draft.end) <= timeToMinutes(draft.start)) return fail("invalid");
  if (input.frozen) return fail("frozen");
  if (input.approvalLocked) return fail("locked");

  const placeholders = new Set<number>(Array.from<number>(input.placeholderInstructorIds ?? []).map(Number).filter(Boolean));
  const held = new Set<number>(Array.from<number>(input.heldRowIds ?? []).map(Number));
  (input.holds || []).forEach(hold => { if (hold.editId) held.add(Number(hold.editId)); });
  const draftRow = draftRowOf(input);
  const baseRows = [
    ...input.rows.filter(row => Number(row.AdTermId) === scope.termId && Number(row.id) !== Number(draft.editId || 0)),
    ...holdRowsOf(input),
  ];
  const label = input.courseLabel || ((row: FSchedule) => ({ code: String(row.CourseCodeSnapshot || row.sourceCourseCode || "").trim() || String(row.AdCourseName || "").slice(0, 8), name: String(row.AdCourseName || "") }));

  const inScope = (row: FSchedule) => Number(row.AdCollegeId) === scope.collegeId && Number(row.AdSectionId) === scope.sectionId;
  const reasonOfLock = (row: FSchedule): ChainReason | null => {
    if (row.id === CHAIN_DRAFT_ID) return "held";
    if (Number(row.id) <= 0 || held.has(Number(row.id))) return "held";
    if (!inScope(row) || (input.canEditRow && !input.canEditRow(row))) return "foreign";
    if (input.isRowLocked?.(row)) return "locked";
    return null;
  };
  const immovable = (row: FSchedule) => reasonOfLock(row) !== null;

  const blocking = (input.conflicts || []).filter(conflict => isBlockingConflict(conflict) && !conflict?.holdRequestId);
  const remainingBlocks = blocking.filter(conflict => { const kind = conflictKind(conflict); return kind !== "teacher" && kind !== "room"; }).length;

  const blockers = baseRows.map(row => ({ row, shared: sharedBetween(draftRow, row, placeholders) })).filter(item => item.shared.length);
  if (!blockers.length) return fail(remainingBlocks ? "other" : "none", remainingBlocks);
  for (const { row } of blockers) { const why = reasonOfLock(row); if (why) return fail(why, remainingBlocks); }
  if (blockers.length > maxMoves) return fail("too-long", remainingBlocks);

  const pairsOf = (rows: FSchedule[]) => fastConflictScan(rows, { placeholderInstructorIds: placeholders }).pairs;
  const withDraft = (rows: FSchedule[]) => [...rows, draftRow];
  const baseNoDraft = pairsOf(baseRows);
  const collisionsOfDraft = (rows: FSchedule[]) => rows.filter(row => sharedBetween(draftRow, row, placeholders).length);

  let board = withDraft(baseRows);
  const conflictsBefore = pairsOf(board);
  const moves: RepairMove[] = [];
  const causeOf: Array<number> = [];     // فهرس النقلة التي سبّبت هذه (‑1 = موعدك)
  const freedOf: Array<Array<"teacher" | "room">> = [];

  for (const { row: blocker0 } of blockers) {
    const current = board.find(row => row.id === blocker0.id)!;
    if (!sharedBetween(draftRow, current, placeholders).length) continue;   // أخلاه نقلٌ سابق
    const remaining = maxMoves - moves.length;
    if (remaining <= 0) return fail("too-long", remainingBlocks);
    const hitsBefore = collisionsOfDraft(board).length;
    const solved = (next: FSchedule[]) => {
      const mine = next.find(row => row.id === current.id);
      if (!mine || sharedBetween(draftRow, mine, placeholders).length) return false;
      if (collisionsOfDraft(next).length >= hitsBefore) return false;
      return pairsOf(next.filter(row => row.id !== CHAIN_DRAFT_ID)) <= baseNoDraft;
    };
    /* الاتساع يتّسع عند العجز فقط: الجولةُ الأولى بالافتراضي السريع، والثانية تفتح خياراتٍ أكثر لكل بطاقة. */
    let chain: ReturnType<typeof findRepairChain> = null;
    for (const maxBranch of BRANCH_BUDGETS) {
      chain = findRepairChain(current, board, { maxDepth: remaining, maxBranch, immovable, placeholderInstructorIds: placeholders, courseHours: input.courseHours, solved });
      if (chain) break;
    }
    if (!chain) return fail(moves.length ? "too-long" : "no-chain", remainingBlocks);
    const start = moves.length;
    chain.moves.forEach((move, index) => {
      const placedDisplacer = index === 0 ? draftRow : withMove(chain.moves[index - 1].before, chain.moves[index - 1]);
      causeOf.push(index === 0 ? -1 : start + index - 1);
      freedOf.push(sharedBetween(placedDisplacer, move.before, placeholders));
    });
    moves.push(...chain.moves);
    board = board.map(row => { const move = chain.moves.find(item => item.id === row.id); return move ? withMove(row, move) : row; });
  }

  if (!moves.length) return fail("none", remainingBlocks);
  if (collisionsOfDraft(board).length || pairsOf(board.filter(row => row.id !== CHAIN_DRAFT_ID)) > baseNoDraft) return fail("no-chain", remainingBlocks);

  const steps: ChainStep[] = moves.map((move, index) => {
    const names = label(move.before);
    const to = slotOf(board.find(row => row.id === move.id)!);
    const from = slotOf(move.before);
    return {
      rowId: move.id, courseCode: names.code, courseName: names.name, section: String(move.before.SCode ?? "").trim(),
      instructorId: Number(move.before.AdInstructorId) || 0, from, to,
      freed: freedOf[index], roomChanged: from.room !== to.room || from.hall !== to.hall, because: move.because,
    };
  });

  const changes: TmChange[] = moves.map((move, index) => ({
    id: `chain${index + 1}`, op: "move", rowId: move.id, days: move.days, start: move.start, end: move.end,
    hall: { code: move.roomCode, hall: move.roomHall, buildingId: move.buildingId, roomId: move.roomId },
    label: `${steps[index].courseCode} ش${steps[index].section}`.trim(),
    why: move.because, cause: causeOf[index] >= 0 ? `chain${causeOf[index] + 1}` : undefined,
  }));

  /* الأسبوعان: الصفوف التي تتحرّك + ما يشاركها الأستاذ أو القاعة (سياقاً) + موعدك. */
  const movedIds = new Set(moves.map(move => move.id));
  const involvedTeachers = new Set<number>([Number(draft.instructorId) || 0, ...steps.map(step => step.instructorId)].filter(n => n && !placeholders.has(n)));
  /* السياقُ: أسابيعُ الأساتذة المعنيّين فقط (القاعاتُ تزدحم بما يُخفي الدومينو). */
  const context = (rows: FSchedule[]) => rows.filter(row => row.id !== CHAIN_DRAFT_ID && !movedIds.has(row.id) && involvedTeachers.has(Number(row.AdInstructorId)));
  const blocksFor = (rows: FSchedule[], moved: FSchedule[], clashing: Set<number>): ChainBlock[] => {
    const out: ChainBlock[] = [];
    const push = (row: FSchedule, tone: ChainBlock["tone"]) => {
      const names = row.id === CHAIN_DRAFT_ID ? { code: draft.courseCode || draft.courseName || "", name: draft.courseName || "" } : label(row);
      activeDays(row).forEach(day => out.push({ id: row.id, day, from: timeToMinutes(row.fstarttime), to: timeToMinutes(row.fendtime), tone, clash: clashing.has(row.id), label: names.code }));
    };
    context(rows).forEach(row => push(row, "base"));
    moved.forEach(row => push(row, "moved"));
    push(draftRow, "draft");
    return out;
  };
  const beforeMoved = moves.map(move => move.before);
  const afterMoved = moves.map(move => board.find(row => row.id === move.id)!);
  const beforeClash = new Set<number>([CHAIN_DRAFT_ID, ...collisionsOfDraft(withDraft(baseRows)).map(row => row.id)]);
  const weeks = {
    before: weekOf(blocksFor(baseRows, beforeMoved, beforeClash)),
    after: weekOf(blocksFor(board.filter(row => row.id !== CHAIN_DRAFT_ID), afterMoved, new Set())),
  };

  const instructorIds = [...new Set(steps.map(step => step.instructorId).filter(Boolean))];
  const effects: ChainEffects = {
    moves: steps.length,
    teachers: instructorIds.length,
    rooms: new Set(steps.map(step => `${step.to.room}|${step.to.hall}`)).size,
    roomChanges: steps.filter(step => step.roomChanged).length,
    dayChanges: steps.filter(step => step.from.days.join() !== step.to.days.join()).length,
    instructorIds, conflictsBefore, conflictsAfter: pairsOf(board.filter(row => row.id !== CHAIN_DRAFT_ID)),
  };
  return { ok: true, canApply: true, reasonIfNot: null, steps, changes, weeks, effects, remainingBlocks };
}

/** سطرُ الأثر على الطلبة من ردّ POST /api/time-machine/students (impact) — لا اختراع: عدٌّ من الرادار أو «—». */
export interface ChainImpactLine { tone: "good" | "warn" | "idle"; count: number | null; text: string }
export function chainImpactLine(impact: { helped?: number; harmed?: number; harmedOutside?: number } | null | undefined): ChainImpactLine {
  if (!impact) return { tone: "idle", count: null, text: "لا رادار" };
  const harmed = Math.max(0, Number(impact.harmed) || 0) + Math.max(0, Number(impact.harmedOutside) || 0);
  const count = harmed + Math.max(0, Number(impact.helped) || 0);
  if (!count) return { tone: "good", count: 0, text: "لا يمسّ طلبة" };
  return { tone: harmed ? "warn" : "good", count, text: `يمسّ ${countOf(count, AR.student)}` };
}

/** هل يستحق حكمُ النموذج عرضَ «حلّ بسلسلة»؟ مانعُ أستاذٍ أو قاعةٍ من تعارض مواعيد (لا مانعُ لائحةٍ أو نطاق). */
export function chainOffered(verdict: { blockers: ReadonlyArray<{ blocks?: boolean; conflict?: any }> } | null | undefined): boolean {
  return Boolean(verdict?.blockers.some(item => item.blocks !== false && item.conflict && (conflictKind(item.conflict) === "teacher" || conflictKind(item.conflict) === "room")));
}
