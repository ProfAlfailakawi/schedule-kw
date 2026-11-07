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
  const skip = String(excludeId ?? "");
  const live = rows.filter(row => Number(row.id) >= 0 && String(row.id) !== skip);
  const ownCode = codeOf(candidate);
  /* شعبُ هذا المقرر: الشعبةُ الجارية بمواعيدها كلها (الموعدُ الجديد وإخوته)، وبقية الشعب كما هي. */
  const mine = sectionsOf(live, courseId);
  const others = mine.filter(section => !ownCode || codeOf(section[0]) !== ownCode);
  const siblings = ownCode ? mine.find(section => codeOf(section[0]) === ownCode) || [] : [];
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

/** أزواجُ المقرنات → مقرناتُ مقررٍ بعينه في الاتجاهين. */
export function partnersOfCourse(pairs: Iterable<readonly number[]>, courseId: number): number[] {
  const out = new Set<number>();
  for (const [a, b] of pairs) {
    if (Number(a) === courseId && b) out.add(Number(b));
    if (Number(b) === courseId && a) out.add(Number(a));
  }
  return [...out];
}
