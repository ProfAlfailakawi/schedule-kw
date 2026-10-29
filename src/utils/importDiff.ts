/**
 * ── «تجربة بلا حفظ»: ما الذي سيتغيّر لو طُبّق الملف؟ ─────────────────────────
 *
 * مقارنةٌ نقيّة بين جدول الفصل الحالي وصفوف الملف المقروءة، شعبةً بشعبة
 * (المقرر + رقم الشعبة): ما يُضاف، وما يُحذف، وما يتغيّر (وفي أيّ خانة)، وما يبقى.
 * لا كتابة هنا ولا شبكة.
 */
import type { FSchedule } from "../types";

const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
type Row = Partial<FSchedule> & Record<string, any>;

export type DiffField = "days" | "time" | "instructor" | "room";
export const DIFF_FIELD_LABEL: Record<DiffField, string> = { days: "الأيام", time: "الوقت", instructor: "الأستاذ", room: "القاعة" };

export interface DiffEntry { key: string; label: string; before?: Row; after?: Row; fields?: DiffField[] }
export interface ImportDiff { added: DiffEntry[]; removed: DiffEntry[]; changed: DiffEntry[]; same: number; current: number; incoming: number }

const clock = (value: unknown) => String(value || "").trim().slice(0, 5);
const dayMask = (row: Row) => DAY_KEYS.map(key => (row[key] ? "1" : "0")).join("");
/** موعدُ الشعبة كلُّه (قد تكون صفوفاً بأيامٍ مختلفة) بصيغةٍ ثابتة للمقارنة. */
const signature = (rows: Row[], pick: (row: Row) => string) => [...new Set(rows.map(pick))].sort().join("|");
/* القاعة بنصّها الرسمي (المبنى-القاعة) — يحمله الطرفان — وإلا بمعرّفها. */
const roomOf = (row: Row) => {
  const text = `${row.AdRoomCode || ""}-${row.AdRoomHall || ""}`.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  return text !== "-" ? text : String(row.roomId || "");
};

export const sectionKeyOf = (row: Row) => `${Number(row.AdCourseId) || String(row.CourseCodeSnapshot || row.AdCourseName || "")}|${String(row.SCode ?? "").trim()}`;

function group(rows: readonly Row[]): Map<string, Row[]> {
  const out = new Map<string, Row[]>();
  for (const row of rows) { const key = sectionKeyOf(row); out.set(key, [...(out.get(key) || []), row]); }
  return out;
}

const labelOf = (rows: Row[]) => {
  const row = rows[0] || {};
  const name = String(row.AdCourseName || row.CourseNameSnapshot || row.CourseCodeSnapshot || "مقرر");
  return `${name} · ش${String(row.SCode ?? "").trim() || "؟"}`;
};

export function importDiff(current: readonly Row[], incoming: readonly Row[]): ImportDiff {
  const before = group(current), after = group(incoming);
  const added: DiffEntry[] = [], removed: DiffEntry[] = [], changed: DiffEntry[] = [];
  let same = 0;
  for (const [key, rows] of after) {
    const old = before.get(key);
    if (!old) { added.push({ key, label: labelOf(rows), after: rows[0] }); continue; }
    const fields: DiffField[] = [];
    if (signature(old, dayMask) !== signature(rows, dayMask)) fields.push("days");
    if (signature(old, row => `${clock(row.fstarttime)}-${clock(row.fendtime)}`) !== signature(rows, row => `${clock(row.fstarttime)}-${clock(row.fendtime)}`)) fields.push("time");
    /* خانةٌ لم تُحسم في الملف (أستاذٌ أو قاعةٌ بلا مطابقة) ملاحظةُ معاينة لا تغيير: لا تُعدّ هنا. */
    const resolved = (pick: (row: Row) => string) => rows.every(row => pick(row));
    if (resolved(row => (Number(row.AdInstructorId) > 0 ? "1" : ""))
      && signature(old, row => String(Number(row.AdInstructorId) || 0)) !== signature(rows, row => String(Number(row.AdInstructorId) || 0))) fields.push("instructor");
    if (resolved(roomOf) && signature(old, roomOf) !== signature(rows, roomOf)) fields.push("room");
    if (fields.length) changed.push({ key, label: labelOf(rows), before: old[0], after: rows[0], fields });
    else same += 1;
  }
  for (const [key, rows] of before) if (!after.has(key)) removed.push({ key, label: labelOf(rows), before: rows[0] });
  const byLabel = (a: DiffEntry, b: DiffEntry) => a.label.localeCompare(b.label, "ar", { numeric: true });
  return { added: added.sort(byLabel), removed: removed.sort(byLabel), changed: changed.sort(byLabel), same, current: before.size, incoming: after.size };
}
