/**
 * ── أين يقع البند؟ موقعُ كل بندٍ في «وارد الأساتذة» ومرشّحُه ────────────────
 *
 * كانت «الإضافة» وحدها تكتب «كلية التربية الأساسية - بنات» تحت المقرّر، و«التعديل»
 * و«الحذف» بلا موقع — والمنسّقُ الذي يتابع البنين والبنات والجهراء من كرسيٍّ واحد
 * لا يعرف أين يقع الموعدُ إلا بفتح الجدول. فصار لكل بندٍ وسمٌ صغير بموقعه
 * («بنات»، «الجهراء - بنات»)، من البند نفسه: الإضافةُ حيث اختار الأستاذ، والتعديلُ
 * والحذفُ حيث يقع الصفُّ — القاعدةُ نفسها في الخادم (requestItemScope).
 *
 * والمرشّحُ «الموقع» يقرأ الموقعَ نفسه: بندٌ خارج الموقع المختار لا يُعرض، وطلبٌ لم
 * يبقَ فيه بندٌ في الموقع لا يُعرض. ويُتذكَّر الاختيارُ لكل حسابٍ على جهازه.
 */
import { safeStorage } from "./safeStorage";
import { compactCampusLabels } from "./campusChips";
import { campusChipOf, campusChips } from "./campusChip";
import { campusOf } from "./campus";

export interface CampusRowLike {
  AdCollegeId: number | string;
  requestCollegeName?: string;
  note?: string;
  items?: CampusItemLike[];
}

export interface CampusItemLike {
  action: string;
  hidden?: boolean;
  before?: { collegeId?: number; collegeName?: string };
  after?: { collegeId?: number; collegeName?: string };
}

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const familyKeyOf = (name: string) => clean(name).split(/\s+-\s+/)[0];

/** بندٌ يُنظر فيه: لا «كما هو» ولا ما أُخفي عن هذا النطاق. */
export const isCampusItem = (item: CampusItemLike) => item.action !== "keep" && !item.hidden;

/** موقعُ البند: الإضافةُ حيث اختار الأستاذ، والتعديلُ والحذفُ حيث يقع الصفّ، وإلا فموقعُ الرابط. */
export function requestItemCollegeId(row: CampusRowLike, item: CampusItemLike): number {
  const snapshot = item.action === "add" ? item.after : item.before;
  return Number(snapshot?.collegeId || row.AdCollegeId || 0);
}

/** أسماءُ الكليات كما يعرفها الوارد: من اللقطات، ومن اسم كلية الرابط، ومن قائمةٍ إضافية (عائلة القسم، الكتالوج). */
export function inboxCollegeNames(
  rows: readonly CampusRowLike[],
  extra: Iterable<{ id: number; name: string }> = [],
): Map<number, string> {
  const names = new Map<number, string>();
  const put = (id: unknown, name: unknown) => {
    const key = Number(id || 0);
    const text = clean(name);
    if (key && text && !names.has(key)) names.set(key, text);
  };
  for (const row of rows) {
    for (const item of row.items || []) {
      put(item.after?.collegeId, item.after?.collegeName);
      put(item.before?.collegeId, item.before?.collegeName);
    }
  }
  for (const { id, name } of extra) put(id, name);
  for (const row of rows) if (clean(row.requestCollegeName) !== "كلية أخرى") put(row.AdCollegeId, row.requestCollegeName);
  return names;
}

/**
 * وسمٌ قصير لكل اسم كلية: «بنين»/«بنات» حين تكفي، و«الجهراء - بنات» حين يلزم
 * التمييز داخل عائلةٍ واحدة (compactCampusLabels)، وأقصرُ ما يميّز بين عائلاتٍ
 * مختلفة (campusChips). واسمٌ واحد يأخذ وسمه بلا سياق (campusChipOf).
 */
export function inboxCampusLabels(collegeNames: Iterable<string>): Map<string, string> {
  const names = [...new Set([...collegeNames].map(clean).filter(Boolean))];
  const out = new Map<string, string>();
  if (names.length === 1) { out.set(names[0], campusChipOf(names[0]) || names[0]); return out; }
  if (new Set(names.map(familyKeyOf)).size === 1) {
    const { chips } = compactCampusLabels(names);
    names.forEach((name, index) => out.set(name, chips[index] || campusChipOf(name) || name));
    return out;
  }
  const chips = campusChips(names);
  names.forEach(name => out.set(name, chips.get(name) || campusChipOf(name) || name));
  return out;
}

export interface CampusOption { collegeId: number; name: string; chip: string; count: number }

/* الترتيب: الحرمُ الرئيسة أولاً (بنين ثم بنات)، ثم الفروع (الجهراء، الفحيحيل…) بأسمائها. */
const campusRank = (name: string) => (clean(name).split(/\s+-\s+/).length - 1) * 10 + (campusOf(name) === "boys" ? 0 : campusOf(name) === "girls" ? 1 : 2);

/** المواقعُ التي في الوارد فعلاً، بعدد بنودها: بنين · بنات · ثم الفروع. */
export function inboxCampusOptions(rows: readonly CampusRowLike[], names: Map<number, string>): CampusOption[] {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const items = (row.items || []).filter(isCampusItem);
    if (!items.length && clean(row.note)) {
      const id = Number(row.AdCollegeId || 0);
      if (id) counts.set(id, counts.get(id) || 0);
    }
    for (const item of items) {
      const id = requestItemCollegeId(row, item);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  const nameOf = (id: number) => names.get(id) || `كلية ${id}`;
  const labels = inboxCampusLabels([...counts.keys()].map(nameOf));
  return [...counts.entries()]
    .map(([collegeId, count]) => ({ collegeId, name: nameOf(collegeId), chip: labels.get(clean(nameOf(collegeId))) || nameOf(collegeId), count }))
    .sort((a, b) => campusRank(a.name) - campusRank(b.name) || a.name.localeCompare(b.name, "ar"));
}

/** هل يُعرض البندُ في الموقع المختار؟ صفرٌ = كلُّ المواقع. */
export const itemInCampus = (row: CampusRowLike, item: CampusItemLike, campusId: number) =>
  !campusId || requestItemCollegeId(row, item) === campusId;

/** هل يبقى الطلبُ في الموقع المختار؟ يبقى ما دام فيه بندٌ واحد فيه، وملاحظةٌ بلا بنود تتبع موقعَ الرابط. */
export function requestInCampus(row: CampusRowLike, campusId: number): boolean {
  if (!campusId) return true;
  const items = (row.items || []).filter(isCampusItem);
  if (!items.length) return Number(row.AdCollegeId) === campusId;
  return items.some(item => itemInCampus(row, item, campusId));
}

/** المختارُ يُعمل به ما دام في الوارد؛ وموقعٌ غاب عنه (فصلٌ آخر، نطاقٌ آخر) يعود «الكل» بلا أن يُمحى. */
export const effectiveCampus = (stored: number, options: readonly CampusOption[]) =>
  stored && options.some(option => option.collegeId === stored) ? stored : 0;

/* ── التذكّر: لكل حسابٍ مفتاحه على هذا الجهاز ─────────────────────────────── */
export const INBOX_CAMPUS_PREFIX = "inbox-campus-";
export const inboxCampusKey = (userId: number | string) => `${INBOX_CAMPUS_PREFIX}${Number(userId) || 0}`;

export function readInboxCampus(userId: number | string): number {
  const value = Number(safeStorage.get(inboxCampusKey(userId)) || 0);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function writeInboxCampus(userId: number | string, collegeId: number): void {
  if (collegeId > 0) safeStorage.set(inboxCampusKey(userId), String(Math.trunc(collegeId)));
  else safeStorage.remove(inboxCampusKey(userId));
}
