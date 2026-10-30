/**
 * ── قبل إرسال كرت الأستاذ: هل في الصحيفة مقرراتٌ «لم نصل بعد» إليها؟ ─────────────
 *
 * في النشر ← كرت الأستاذ، حين يرسل المسؤول بصفةٍ يختار فيها الأستاذُ مقرراته (✏️ طلب تعديل،
 * 🎓 مرحلة التدريب) — لا 👁️ للعرض فقط — يُقرأ حكمُ الوصول للنطاق نفسه الذي يُنشر، بالقاعدة
 * نفسها التي يرسم بها الكرت (src/utils/courseReach.ts ← /api/course-offering)، فإن كان فيه
 * مقررٌ مقفل ظهرت ورقةُ تأكيدٍ صغيرة: العددُ والقائمةُ و«افتحه للطرح» لكلِّ مقرر.
 *
 *   • لا مقفل ⇒ لا ورقة: يُرسل فوراً كما كان.
 *   • تعذّرت القراءة ⇒ يُرسل كما كان (ويُسجَّل): الفحصُ تنبيهٌ لا يمنع الإرسال أبداً.
 *   • ما أغلقه المسؤول أصلاً (🔒 غير مطروح، 🌱 مستقبلي) لا يُعدّ: الكرتُ لا يرسمه «لم نصل بعد».
 *   • سريع: ما قرأته لوحةُ حالة الطرح قبل قليل يُستعمل كما هو (ذاكرةٌ قصيرة بالنطاق).
 */
import { offeringView, type CourseOfferingDoc } from "./courseOffering";
import { reachLocked, splitBySheet, type CourseReach, type ReachSheetKind } from "./courseReach";
import { AR, countOf } from "./arabicCount";
import type { LinkMode } from "./linkMode";

export interface OfferingSnapshot {
  doc?: CourseOfferingDoc | null;
  reach?: {
    known?: boolean;
    courses: Record<number, CourseReach>;
    sheets: Array<{ kind: ReachSheetKind; courseIds: number[] }>;
  } | null;
  courses: Array<{ id: number; name: string; code: string; sections?: number }>;
}

export type PrepublishSheet = "new" | "old" | "only";

export interface PrepublishRow {
  courseId: number;
  code: string;
  name: string;
  sheet: PrepublishSheet;
  /** السببُ بلا «لم نصل بعد» المكرّرة في الرأس: «المتطلب 210 لم يُطرح». */
  reason: string;
  /** فُتح للطرح من الورقة نفسها: يبقى في مكانه بـ🔓. */
  opened: boolean;
}

/** الصفاتُ التي يختار فيها الأستاذ مقرراته: ✏️ و🎓. 👁️ للعرض فقط لا يُفحص. */
export const choosesCourses = (mode: LinkMode) => mode === "edit" || mode === "ta";

/** «لم نصل بعد إلى هذا المستوى — المتطلب 210 لم يُطرح» ← «المتطلب 210 لم يُطرح». */
export function shortReason(reason: string): string {
  const text = String(reason || "").trim();
  const cut = text.indexOf(" — ");
  return cut >= 0 ? text.slice(cut + 3).trim() : text;
}

const SHEET_ORDER: Record<PrepublishSheet, number> = { new: 0, only: 1, old: 2 };

/** المقرراتُ التي سيراها الأستاذ في كرته رماديةً 🔒 «لم نصل بعد» — بالقاعدة نفسها (withReach). */
export function lockedForPublish(snapshot: OfferingSnapshot | null | undefined): PrepublishRow[] {
  const reach = snapshot?.reach;
  if (!reach?.courses) return [];
  const courses = snapshot?.courses || [];
  const split = splitBySheet(courses.map(course => course.id), reach.sheets || []);
  const fresh = new Set(split.new);
  return courses
    .filter(course => reachLocked(reach.courses[course.id]) && offeringView(snapshot?.doc, course.id, Number(course.sections || 0)).selectable)
    .map(course => ({
      courseId: course.id,
      code: String(course.code || ""),
      name: String(course.name || ""),
      sheet: (split.tabs ? (fresh.has(course.id) ? "new" : "old") : "only") as PrepublishSheet,
      reason: shortReason(reach.courses[course.id]?.reason || ""),
      opened: false,
    }))
    .sort((a, b) => SHEET_ORDER[a.sheet] - SHEET_ORDER[b.sheet] || a.code.localeCompare(b.code));
}

/** بعد «افتحه للطرح»: كلُّ صفٍّ لم يعد مقفلاً في الحكم الجديد يصير 🔓 في مكانه (والتوأمُ معه). */
export function markOpened(rows: ReadonlyArray<PrepublishRow>, reach: OfferingSnapshot["reach"]): PrepublishRow[] {
  return rows.map(row => {
    const verdict = reach?.courses?.[row.courseId];
    return row.opened || (verdict && !reachLocked(verdict)) ? { ...row, opened: true } : row;
  });
}

const lockedWord = (n: number) => (n === 1 ? "مقفل" : n === 2 ? "مقفلان" : "مقفلة");
const SHEET_WORD: Record<PrepublishSheet, string> = { new: " من الصحيفة الجديدة", old: " من الصحيفة القديمة", only: "" };

/** «🔒 23 مقرراً من الصحيفة الجديدة مقفلة — لم نصل بعد إلى مستواها» (العدُّ لما بقي مقفلاً). */
export function prepublishHeadline(rows: ReadonlyArray<PrepublishRow>): { icon: "🔒" | "🔓"; text: string; locked: number } {
  const left = rows.filter(row => !row.opened);
  if (!left.length) return { icon: "🔓", text: "فُتحت كلها للطرح", locked: 0 };
  const sheets = new Set(left.map(row => row.sheet));
  const where = sheets.size === 1 ? SHEET_WORD[left[0].sheet] : "";
  return { icon: "🔒", text: `${countOf(left.length, AR.course)}${where} ${lockedWord(left.length)} — لم نصل بعد إلى مستواها`, locked: left.length };
}

/** المجموعات بالصحيفة (الجديدة أولاً)، لكلٍّ عددُ ما بقي مقفلاً. */
export function prepublishGroups(rows: ReadonlyArray<PrepublishRow>): Array<{ sheet: PrepublishSheet; rows: PrepublishRow[]; locked: number }> {
  const out: Array<{ sheet: PrepublishSheet; rows: PrepublishRow[]; locked: number }> = [];
  for (const sheet of ["new", "only", "old"] as const) {
    const list = rows.filter(row => row.sheet === sheet);
    if (list.length) out.push({ sheet, rows: list, locked: list.filter(row => !row.opened).length });
  }
  return out;
}

/**
 * البوّابة: صفةٌ لا يختار فيها الأستاذ ⇒ يُرسل. وإلا يُقرأ الحكم؛ لا مقفل ⇒ يُرسل؛
 * تعذّرت القراءة ⇒ يُسجَّل ويُرسل؛ وإلا تُعرض الورقة (warn) ولا يُرسل حتى يختار المسؤول.
 */
export async function gatePublish(options: {
  mode: LinkMode;
  read: () => Promise<OfferingSnapshot | null>;
  send: () => unknown;
  warn: (rows: PrepublishRow[]) => void;
  log?: (message: string, error: unknown) => void;
}): Promise<"sent" | "warned"> {
  if (!choosesCourses(options.mode)) { await options.send(); return "sent"; }
  let rows: PrepublishRow[] = [];
  try { rows = lockedForPublish(await options.read()); }
  catch (error) { (options.log || ((message, e) => console.warn(message, e)))("prepublish reach check failed; sending as before", error); rows = []; }
  if (!rows.length) { await options.send(); return "sent"; }
  options.warn(rows);
  return "warned";
}

/* ── ذاكرةٌ قصيرة بالنطاق: ما قرأته لوحةُ حالة الطرح يُعاد استعماله، و«افتحه للطرح» يُبلَّغ للوحة ── */
const TTL_MS = 30_000;
const memory = new Map<string, { at: number; snapshot: OfferingSnapshot }>();
const listeners = new Set<(key: string, snapshot: OfferingSnapshot) => void>();

export const offeringScopeKey = (collegeId: number, sectionId: number, termId: number) => `${Number(collegeId)}:${Number(sectionId)}:${Number(termId)}`;

export function rememberOffering(key: string, snapshot: OfferingSnapshot, at = Date.now()): void {
  memory.set(key, { at, snapshot });
  for (const listener of listeners) listener(key, snapshot);
}

/** حكمٌ جديد بعد «افتحه للطرح» يُلصق على ما في الذاكرة ويُبلَّغ لمن يستمع (لوحة حالة الطرح). */
export function rememberReach(key: string, reach: OfferingSnapshot["reach"]): void {
  const hit = memory.get(key);
  if (!hit || !reach) return;
  rememberOffering(key, { ...hit.snapshot, reach });
}

export function recentOffering(key: string, now = Date.now()): OfferingSnapshot | null {
  const hit = memory.get(key);
  return hit && now - hit.at < TTL_MS ? hit.snapshot : null;
}

export function onOfferingChange(listener: (key: string, snapshot: OfferingSnapshot) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function forgetOfferingMemory(): void { memory.clear(); }

/** يقرأ حالة الطرح للنطاق (من الذاكرة إن كانت حديثة). يرمي عند الفشل — والبوّابة تُرسل حينها. */
export async function readOffering(collegeId: number, sectionId: number, termId: number, fetchImpl: typeof fetch = fetch): Promise<OfferingSnapshot> {
  const key = offeringScopeKey(collegeId, sectionId, termId);
  const hit = recentOffering(key);
  if (hit) return hit;
  const response = await fetchImpl(`/api/course-offering?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
  if (!response.ok) throw new Error(`course-offering ${response.status}`);
  const snapshot = await response.json() as OfferingSnapshot;
  if (!snapshot || !Array.isArray(snapshot.courses)) throw new Error("course-offering: unreadable");
  rememberOffering(key, snapshot);
  return snapshot;
}
