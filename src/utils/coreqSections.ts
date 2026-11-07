/**
 * ── المقرن (التوأم): هل يُجبَر الطلبة على التداخل؟ ───────────────────────────────
 *
 * مقرران يُسجَّلان معاً (`coreq` في قاعدة الصحيفة). موعدٌ جديد يتداخل مع موعدٍ من مقرنه لا يعني
 * شيئاً إن كان للمقررين شعبٌ كثيرة تتيح ترتيباً خالياً من التداخل: شعبة ١ من هذا مع شعبة ٢ من ذاك.
 * فلا تحذيرَ إلا حين تتداخل **كلُّ** التركيبات بين شعب المقررين في الفصل نفسه.
 *
 * ملفٌّ خالص (بلا قراءةٍ ولا كتابة) يقرؤه الخادم لتنبيه «موعد» اللين، ويقرؤه المتصفح لورقة
 * «في الوقت نفسه» على الصفوف المحمّلة نفسها؛ فلا يختلفان. حتميٌّ ورخيص: عددُ الشعب بالعشرات.
 */
import { SLOT_DAYS, slotMinutes, type SlotRow } from "./sameSlot";

export interface CoreqFinding {
  /** مقررٌ مقرِنٌ تداخل معه الموعد. */
  partnerCourseId: number;
  /** مواعيدُه المتداخلة مع الموعد نفسه. */
  overlapRowIds: Array<number | string>;
  /** تركيبةٌ واحدة على الأقل بين الشعب بلا تداخل. */
  alternative: boolean;
}

const overlaps = (a: SlotRow, b: SlotRow): boolean => {
  const aFrom = slotMinutes(a.fstarttime), aTo = slotMinutes(a.fendtime);
  const bFrom = slotMinutes(b.fstarttime), bTo = slotMinutes(b.fendtime);
  if (![aFrom, aTo, bFrom, bTo].every(Number.isFinite) || aTo <= aFrom || bTo <= bFrom) return false;
  return SLOT_DAYS.some(day => a[day.key] && b[day.key]) && aFrom < bTo && bFrom < aTo;
};

const codeOf = (row: SlotRow) => String(row.SCode ?? "").trim();

/** شعب مقرر: صفوفُه مجمّعةً برقم الشعبة (الشعبة قد تمتد على صفّين: محاضرة ومختبر). */
function sectionsOf(rows: readonly SlotRow[], courseId: number): SlotRow[][] {
  const groups = new Map<string, SlotRow[]>();
  for (const row of rows) {
    if (Number(row.AdCourseId) !== courseId) continue;
    const key = codeOf(row) || `#${row.id}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()];
}

const clash = (a: readonly SlotRow[], b: readonly SlotRow[]) => a.some(x => b.some(y => overlaps(x, y)));

/** الصفوف الحية، وشعبُ مقرر الموعد: الشعبةُ الجارية بمواعيدها كلها أولاً (الموعدُ الجديد وإخوته)، ثم بقية الشعب. */
function familyOf(candidate: SlotRow, rows: readonly SlotRow[], courseId: number, excludeId?: number | string | null) {
  const skip = String(excludeId ?? "");
  const live = rows.filter(row => Number(row.id) >= 0 && String(row.id) !== skip);
  const ownCode = codeOf(candidate);
  const mine = sectionsOf(live, courseId);
  const others = mine.filter(section => !ownCode || codeOf(section[0]) !== ownCode);
  const siblings = ownCode ? mine.find(section => codeOf(section[0]) === ownCode) || [] : [];
  return { live, others, siblings };
}

/**
 * @param candidate الموعد الذي يُنشأ أو يُعدَّل (بمقرره وشعبته وأيامه ووقته).
 * @param rows صفوف الفصل (قد يكون فيها الموعد المعدَّل نفسه: يُستثنى بـ excludeId).
 * @param partnerIds مقرناتُ مقرر الموعد (في الاتجاهين).
 * يعيد مقرناً واحداً لكل مقررٍ يتداخل معه الموعد نفسه.
 */
export function coreqFindings(
  candidate: SlotRow,
  rows: readonly SlotRow[],
  partnerIds: Iterable<number>,
  excludeId?: number | string | null,
): CoreqFinding[] {
  const courseId = Number(candidate.AdCourseId);
  if (!courseId) return [];
  const { live, others, siblings } = familyOf(candidate, rows, courseId, excludeId);
  const family: SlotRow[][] = [[candidate, ...siblings], ...others];

  const out: CoreqFinding[] = [];
  for (const partnerId of new Set([...partnerIds].map(Number).filter(id => id && id !== courseId))) {
    const theirs = sectionsOf(live, partnerId);
    const hit = theirs.flat().filter(row => overlaps(candidate, row));
    if (!hit.length) continue;
    const alternative = family.some(a => theirs.some(b => !clash(a, b)));
    out.push({ partnerCourseId: partnerId, overlapRowIds: hit.map(row => row.id as number | string), alternative });
  }
  return out;
}

/** هل يُجبَر الطلبة على التداخل مع مقرنٍ ما؟ حُكمُ تنبيه «موعد» نفسه، يقرؤه مُرتِّب الاقتراحات. */
export function coreqForcedClash(
  candidate: SlotRow,
  rows: readonly SlotRow[],
  partnerIds: Iterable<number>,
  excludeId?: number | string | null,
): boolean {
  return coreqFindings(candidate, rows, partnerIds, excludeId).some(finding => !finding.alternative);
}

/** فترةٌ بالدقائق: [بداية، نهاية). */
export type CoreqSpan = readonly [number, number];

export interface CoreqFreeTime {
  /** أقربُ وقتٍ بالمدة نفسها يخلو من شعبةٍ كاملة للمقرن، إن وُجد داخل اليوم. */
  placement?: { start: number; end: number; side: "before" | "after" };
  /** شعبةُ المقرن الخالية من الموعد في وقته الحالي: لا حاجة إلى نقله. */
  partnerSection?: string;
  /** شعبةٌ أخرى من المقرر نفسه تخلو: آخرُ ما يُقال حين لا وقتَ ولا شعبةَ للمقرن. */
  ownSection?: string;
  /** أوقاتُ شعبة المقرن المعنيّة بالخبر في الأيام المختارة، لرسمها على الشريط. */
  sectionSpans: CoreqSpan[];
}

/** أوقاتُ صفوفٍ في أيام الموعد، مدموجةً ومرتّبة. */
function spansOn(rows: readonly SlotRow[], day: SlotRow): CoreqSpan[] {
  const spans = rows
    .filter(row => SLOT_DAYS.some(item => row[item.key] && day[item.key]))
    .map(row => [slotMinutes(row.fstarttime), slotMinutes(row.fendtime)] as const)
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to > from)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [from, to] of spans) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/** أقربُ بدايةٍ خالية قبل `current` وبعده، داخل اليوم وبالمدة نفسها. التلاصقُ خالٍ. */
function nearestStarts(busy: readonly CoreqSpan[], current: number, duration: number, day: { start: number; end: number }) {
  let before: number | undefined, after: number | undefined;
  let cursor = day.start;
  for (const [from, to] of [...busy, [day.end, day.end] as CoreqSpan]) {
    const lastStart = Math.min(from, day.end) - duration;
    if (lastStart >= cursor) {
      if (lastStart < current) before = lastStart;
      if (cursor > current && after === undefined) after = cursor;
    }
    cursor = Math.max(cursor, to);
  }
  return { before, after };
}

/**
 * أين يخلو الموعد من مقرنه؟ يُسأل عن مقرنٍ تداخل معه الموعد فعلاً (coreqFindings).
 * شعبةٌ للمقرن خالية الآن ← تُسمّى ولا يُنقل الموعد. وإلا فأقربُ وقتٍ بالمدة نفسها داخل اليوم:
 * «بعد» يكفيه أن يخلو من شعبةٍ كاملة واحدة، و«قبل» يسبق شعبَ المقرن كلها ما أمكن، فإن تعذّر
 * كفته شعبةٌ واحدة (مثال المالك: شعبتا 11–15 و12–16 وموعدٌ 12–14 ← 09–11 أو 15–17).
 * عند التعادل يُقدَّم الأحدث. لا يُقترح وقتٌ لا تفيد فيه الحركة: شعبةٌ يصدمها إخوة الموعد تُستبعد.
 */
export function coreqFreeTime(
  candidate: SlotRow,
  rows: readonly SlotRow[],
  partnerId: number,
  day: { start: number; end: number },
  excludeId?: number | string | null,
): CoreqFreeTime {
  const free: CoreqFreeTime = { sectionSpans: [] };
  const courseId = Number(candidate.AdCourseId);
  const start = slotMinutes(candidate.fstarttime), end = slotMinutes(candidate.fendtime);
  if (!courseId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return free;
  const { live, others, siblings } = familyOf(candidate, rows, courseId, excludeId);
  const byCode = (a: SlotRow[], b: SlotRow[]) => codeOf(a[0]).localeCompare(codeOf(b[0]), undefined, { numeric: true });
  const sections = sectionsOf(live, partnerId).sort(byCode);
  const open = sections.filter(section => !clash(siblings, section));

  const now = open.find(section => !clash([candidate], section));
  if (now) {
    free.partnerSection = codeOf(now[0]);
    free.sectionSpans = spansOn(now, candidate);
    return free;
  }

  const duration = end - start;
  const each = open.map(section => {
    const spans = spansOn(section, candidate);
    return { spans, ...nearestStarts(spansOn([...section, ...siblings], candidate), start, duration, day) };
  });
  const afterAt = each.reduce<number | undefined>((best, item) => (item.after !== undefined && (best === undefined || item.after < best) ? item.after : best), undefined);
  const beforeAll = nearestStarts(spansOn([...open.flat(), ...siblings], candidate), start, duration, day).before;
  const beforeAt = beforeAll ?? each.reduce<number | undefined>((best, item) => (item.before !== undefined && (best === undefined || item.before > best) ? item.before : best), undefined);
  const useAfter = afterAt !== undefined && (beforeAt === undefined || afterAt - start <= start - beforeAt);
  const at = useAfter ? afterAt : beforeAt;
  if (at !== undefined) {
    free.placement = { start: at, end: at + duration, side: useAfter ? "after" : "before" };
    const shown = useAfter ? each.find(item => item.after === at) : (each.find(item => item.before === at) || each[0]);
    free.sectionSpans = shown?.spans || [];
    return free;
  }
  const spare = others.find(section => sections.some(theirs => !clash(section, theirs)));
  if (spare) free.ownSection = codeOf(spare[0]) || undefined;
  return free;
}

/** أزواجُ المقرنات → مقرناتُ مقررٍ بعينه في الاتجاهين. */
export function partnersOfCourse(pairs: Iterable<readonly number[]>, courseId: number): number[] {
  const out = new Set<number>();
  for (const [a, b] of pairs) {
    if (Number(a) === courseId && b) out.add(Number(b));
    if (Number(b) === courseId && a) out.add(Number(a));
  }
  return [...out];
}
