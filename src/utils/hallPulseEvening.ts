/**
 * ── نبض القاعات: «ضمّ المساء» (نقيّ بلا React ولا three.js) ──────────────────
 *
 * بعد الثانية ظهراً تتبعثر شعبٌ قليلة على طوابق كثيرة. هذا الملف يقترح جمعها في
 * أقل عددٍ من الطوابق: كل شعبةٍ مسائية (تبدأ في الثانية أو بعدها) تنتقل إلى قاعةٍ
 * من نوعها تتّسع لها (typeFits عبر compatible) وفارغةٍ في أيامها كلها طوال وقتها
 * (فحص hallFreeFor نفسه في «رتّب قاعاتي»)، فتنطفئ بقية الطوابق مساءً.
 *
 * الناتج خطةٌ بصيغة «رتّب قاعاتي» نفسها (DayPlan): تُراجَع في لوحة المراجعة ذاتها
 * وتُحفظ من مسار النقل المعتاد (/api/schedules/move-batch) لرئيس اللجنة وحده.
 * لا يكتب هذا الملف شيئاً.
 */
import { AR, countOf, nounFor, type ArabicNoun } from "./arabicCount";
import { compatible, fitScore, hallFreeFor, type Assignment, type DayPlan, type PlanGroup, type PulseDay, type PulseHall, type PulseModel, type PulseSession } from "./hallPulse";

export const FLOOR: ArabicNoun = { one: "طابق", two: "طابقان", few: "طوابق", many: "طابقاً" };
export const CLOSES: ArabicNoun = { one: "تُغلق", two: "تُغلقان", few: "تُغلق", many: "تُغلق" };

/** عدد الطوابق مجروراً (بعد «على» و«في» و«بدل»): «طابقين» لا «طابقان». */
export const floorsAfterPreposition = (count: number) => (count === 2 ? "طابقين" : countOf(count, FLOOR));

/** «N قاعات تُغلق مساءً · طابقٌ واحد بدل M»: سطر «ضمّ المساء» في المشهد وفي المجلس. */
export function eveningSummary(closedHalls: number, floorsAfter: number, floorsBefore: number): string {
  const halls = closedHalls ? `${countOf(closedHalls, AR.room)} ${nounFor(closedHalls, CLOSES)} مساءً` : "لا قاعة تُغلق مساءً";
  const floors = floorsAfter === 1 ? "طابقٌ واحد" : countOf(floorsAfter, FLOOR);
  /* «بدل» تجرّ ما بعدها: «بدل طابقين». */
  return `${halls} · ${floors} بدل ${floorsAfterPreposition(floorsBefore)}`;
}

/** المساء: كل شعبةٍ تبدأ في الثانية ظهراً أو بعدها. */
export const EVENING_START = 14 * 60;
export const isEveningSession = (s: Pick<PulseSession, "start">) => s.start >= EVENING_START;

/** الطابق مبنىً ورقماً: «012B01|2». */
export const floorKeyOf = (h: Pick<PulseHall, "buildingCode" | "floor">) => `${h.buildingCode}|${h.floor}`;

export interface EveningFootprint {
  /** شعب المساء في اليوم. */
  sessions: PulseSession[];
  /** القاعات التي تضيئها شعب المساء. */
  halls: Set<string>;
  /** الطوابق التي فيها قاعةٌ مضاءة مساءً. */
  floors: Set<string>;
}

/** ما تضيئه شعب المساء في اليوم بحسب الإسناد: قاعاتها وطوابقها. */
export function eveningFootprint(model: PulseModel, assignment: Assignment, day: PulseDay): EveningFootprint {
  const sessions = model.sessions.filter(s => s.days.includes(day) && isEveningSession(s));
  const halls = new Set<string>(), floors = new Set<string>();
  for (const s of sessions) {
    const h = model.hallByKey.get(assignment.get(s.id) || s.hallKey);
    if (!h) continue;
    halls.add(h.key); floors.add(floorKeyOf(h));
  }
  return { sessions, halls, floors };
}

export interface EveningPlan {
  day: PulseDay;
  /** الخطة بصيغة «رتّب قاعاتي»؛ null حين لا يُجمع شيء. */
  plan: DayPlan | null;
  /** لماذا لا خطة: لا مساء، أو طابقٌ واحد أصلاً، أو لا نقلة تُطفئ طابقاً. */
  reason: "ok" | "none" | "single" | "stuck";
  before: { halls: number; floors: number; sessions: number };
  after: { halls: number; floors: number };
  /** القاعات التي كانت تضيء مساءً ولا تضيء بعد الجمع (تنطفئ في المشهد). */
  closedHalls: string[];
  /** ما يُغلق صافياً: المضاءة قبل الجمع ناقص المضاءة بعده (قاعةٌ تستقبل شعبةً قد تضيء). */
  closed: number;
  /** الطوابق التي تنطفئ مساءً، والطوابق التي تبقى مضاءة. */
  closedFloors: string[];
  keptFloors: string[];
}

/**
 * يجمع شعب المساء في أقل عددٍ من الطوابق، طابقاً بعد طابق (جشعٌ مفحوص):
 *  - الطابق الذي لا يُنقل منه شيء (شعبةٌ بلا عدد طلبة أو قاعتها مجهولة السعة) يبقى مضاءً،
 *    فيُملأ أولاً بما يتّسع له؛
 *  - ثم يُختار في كل مرة الطابق الذي يستوعب أكثر الشعب الباقية (من فيه أصلاً يبقى مكانه)،
 *    والأكبر عدداً تُجلس أولاً في أصغر قاعةٍ تتّسع لها؛
 *  - وفي الآخر تُلغى كل نقلةٍ لم تُطفئ طابقها (بقي مضاءً لشعبةٍ أخرى)، فلا نقلة بلا ثمرة.
 * كل نقلةٍ تُفحص بـ compatible وhallFreeFor على أيام الشعبة كلها، كما في planDay.
 */
export function planEvening(model: PulseModel, base: Assignment, day: PulseDay): EveningPlan {
  const before = eveningFootprint(model, base, day);
  const empty = (reason: EveningPlan["reason"]): EveningPlan => ({
    day, plan: null, reason,
    before: { halls: before.halls.size, floors: before.floors.size, sessions: before.sessions.length },
    after: { halls: before.halls.size, floors: before.floors.size }, closedHalls: [], closed: 0, closedFloors: [], keptFloors: [...before.floors],
  });
  if (!before.sessions.length) return empty("none");
  if (before.floors.size <= 1) return empty("single");

  const assignment: Assignment = new Map(base);
  const hallOf = (s: PulseSession) => model.hallByKey.get(assignment.get(s.id) || s.hallKey);
  const floorOfSession = (s: PulseSession) => { const h = hallOf(s); return h ? floorKeyOf(h) : ""; };
  const hallsByFloor = new Map<string, PulseHall[]>();
  for (const h of model.halls) { const k = floorKeyOf(h); (hallsByFloor.get(k) || hallsByFloor.set(k, []).get(k)!).push(h); }
  /* شاغلو كل قاعة في الإسناد الملتزم به: فحصٌ سريع قبل الفحص الكامل عند الالتزام. */
  const occupants = new Map<string, PulseSession[]>();
  const index = () => {
    occupants.clear();
    for (const s of model.sessions) { const k = assignment.get(s.id) || s.hallKey; (occupants.get(k) || occupants.set(k, []).get(k)!).push(s); }
  };
  index();
  const clash = (a: PulseSession, b: PulseSession) => a.id !== b.id && a.start < b.end && b.start < a.end && a.days.some(d => b.days.includes(d));
  const quickFree = (h: PulseHall, s: PulseSession, added: ReadonlyMap<string, PulseSession[]>) => {
    if ((occupants.get(h.key) || []).some(o => clash(o, s))) return false;
    if ((added.get(h.key) || []).some(o => clash(o, s))) return false;
    return !(model.foreignBusy.get(h.key) || []).some(w => s.days.includes(w.day) && s.start < w.to && w.from < s.end);
  };
  const movable = (s: PulseSession) => Boolean(s.students && hallOf(s)?.capacity);

  const kept = new Set<string>();
  before.sessions.forEach(s => { if (!movable(s)) kept.add(floorOfSession(s)); });
  let remaining = before.sessions.filter(s => movable(s) && !kept.has(floorOfSession(s)));
  const origin = new Map<number, string>();

  /** يحاول إجلاس الباقين في طابقٍ واحد: من فيه يبقى، والآخرون في أصغر قاعةٍ تتّسع لهم. */
  const simulate = (floor: string) => {
    const placed: Array<{ s: PulseSession; to: string | null }> = [];
    const added = new Map<string, PulseSession[]>();
    const halls = hallsByFloor.get(floor) || [];
    const order = remaining.slice().sort((a, b) => (b.students || 0) - (a.students || 0) || a.start - b.start || a.id - b.id);
    for (const s of order) {
      if (floorOfSession(s) === floor) { placed.push({ s, to: null }); continue; }
      let best: PulseHall | null = null, bs = Infinity;
      for (const h of halls) {
        if (!compatible(model, s, h) || !quickFree(h, s, added)) continue;
        const sc = fitScore(s.students!, h.capacity) * 1000 + (h.capacity || 0);
        if (sc < bs) { bs = sc; best = h; }
      }
      if (best) { placed.push({ s, to: best.key }); (added.get(best.key) || added.set(best.key, []).get(best.key)!).push(s); }
    }
    return placed;
  };
  const commit = (floor: string, placed: ReturnType<typeof simulate>) => {
    const done = new Set<number>();
    for (const p of placed) {
      if (p.to) {
        /* الفحص الكامل نفسه في «رتّب قاعاتي» قبل أن تُعتمد النقلة. */
        if (!hallFreeFor(model, assignment, p.to, p.s)) continue;
        if (!origin.has(p.s.id)) origin.set(p.s.id, assignment.get(p.s.id) || p.s.hallKey);
        assignment.set(p.s.id, p.to);
      }
      done.add(p.s.id);
    }
    kept.add(floor);
    remaining = remaining.filter(s => !done.has(s.id));
    index();
  };

  /* الطوابق الباقية أصلاً تُملأ أولاً. */
  for (const floor of [...kept]) if (remaining.length) commit(floor, simulate(floor));
  const usage = (floor: string) => before.sessions.filter(s => floorOfSession(s) === floor).length;
  while (remaining.length) {
    let bestFloor = "", bestPlaced: ReturnType<typeof simulate> = [], bestKey: number[] = [];
    for (const floor of [...hallsByFloor.keys()].sort()) {
      if (kept.has(floor)) continue;
      const placed = simulate(floor);
      if (!placed.length) continue;
      /* أكثر الشعب، ثم أقل النقلات، ثم الطابق المضاء أصلاً، ثم الأدنى. */
      const key = [placed.length, -placed.filter(p => p.to).length, usage(floor), -Number(floor.split("|").pop() || 0)];
      if (!bestFloor || lexicallyGreater(key, bestKey)) { bestFloor = floor; bestPlaced = placed; bestKey = key; }
    }
    if (!bestFloor) break;
    commit(bestFloor, bestPlaced);
  }

  /* نقلةٌ لم تُطفئ طابقها لا ثمرة لها: تُلغى ما دامت قاعتها الأولى فارغةً لها. */
  const lit = () => eveningFootprint(model, assignment, day).floors;
  for (const [sid, from] of [...origin.entries()].reverse()) {
    const s = model.sessionById.get(sid)!;
    const fromHall = model.hallByKey.get(from);
    if (!fromHall || !lit().has(floorKeyOf(fromHall))) continue;
    if (!hallFreeFor(model, assignment, from, s)) continue;
    assignment.set(sid, from);
    origin.delete(sid);
  }

  const after = eveningFootprint(model, assignment, day);
  const moves = [...origin.entries()].filter(([sid, from]) => (assignment.get(sid) || "") !== from);
  if (!moves.length || after.floors.size >= before.floors.size) return empty("stuck");
  const groups: PlanGroup[] = moves
    .map(([sid, from]) => ({ s: model.sessionById.get(sid)!, from }))
    .sort((a, b) => a.s.start - b.s.start || a.s.id - b.s.id)
    .map(({ s, from }, i) => ({ id: i, moves: [{ sessionId: s.id, from, to: assignment.get(s.id)! }], deps: [] as number[], on: true, start: s.start }));
  /* الاعتماد كما في planDay: نقلةٌ تدخل قاعةً تُفرغها نقلةٌ أخرى في وقتٍ متداخل تعتمد عليها،
     فاستبعاد المُفرِغة يُسقط الداخلة (toggleGroup) ولا تبقى شعبتان في قاعةٍ واحدة. */
  for (const g of groups) {
    const mv = g.moves[0], s = model.sessionById.get(mv.sessionId)!;
    for (const o of groups) {
      if (o === g) continue;
      const om = o.moves[0], os = model.sessionById.get(om.sessionId)!;
      if (om.from === mv.to && clash(s, os) && !g.deps.includes(o.id)) g.deps.push(o.id);
    }
  }
  return {
    day, reason: "ok",
    plan: { day, groups, unsolved: [] },
    before: { halls: before.halls.size, floors: before.floors.size, sessions: before.sessions.length },
    after: { halls: after.halls.size, floors: after.floors.size },
    closedHalls: [...before.halls].filter(k => !after.halls.has(k)),
    closed: Math.max(0, before.halls.size - after.halls.size),
    closedFloors: [...before.floors].filter(k => !after.floors.has(k)),
    keptFloors: [...after.floors],
  };
}

function lexicallyGreater(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** أزحم لحظةٍ في المساء (أكثر شعب المساء حضوراً، والأبكر عند التساوي): بها يُفتح المشهد بعد الجمع. */
export function busiestEveningMinute(model: PulseModel, day: PulseDay): number | null {
  let best: number | null = null, bestCount = 0;
  const list = model.sessions.filter(s => s.days.includes(day) && isEveningSession(s));
  for (let m = EVENING_START; m < model.dayEnd; m += 5) {
    const count = list.filter(s => m >= s.start && m < s.end).length;
    if (count > bestCount) { bestCount = count; best = m; }
  }
  return best;
}
