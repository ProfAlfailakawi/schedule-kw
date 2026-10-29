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

/* ── الموعدُ لقاءاتٌ لا خاناتٌ متفرّقة ──────────────────────────────────────
 * الشعبةُ قد تلتقي في أيامٍ بأوقاتٍ أو قاعاتٍ مختلفة. مقارنةُ مجموعة الأيام
 * ومجموعة الأوقات كلٌّ وحده تُضيّع من يلتقي متى: تبديلُ «الأحد 08:00 / الاثنين
 * 10:00» إلى «الأحد 10:00 / الاثنين 08:00» كان يُقرأ «كما هو». فيُفكّ كلُّ صفٍّ
 * إلى لقاءات (يومٌ + بدايةٌ + نهايةٌ + أستاذٌ + قاعة)، ويُقارن اللقاء بنظيره في يومه. */
interface Meeting { day: string; time: string; instructor: string; room: string }
function meetingsOf(rows: Row[]): Map<string, Meeting[]> {
  const out = new Map<string, Meeting[]>();
  for (const row of rows) for (const day of DAY_KEYS) {
    if (!row[day]) continue;
    const meeting = { day, time: `${clock(row.fstarttime)}-${clock(row.fendtime)}`, instructor: String(Number(row.AdInstructorId) || 0), room: String(row.AdRoomHall || "").trim() ? roomOf(row) : String(row.roomId || "") };
    out.set(day, [...(out.get(day) || []), meeting]);
  }
  for (const list of out.values()) list.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}

/** ما تغيّر بين موعدَي الشعبة نفسها. خانةٌ لم تُحسم في الملف (أستاذٌ أو قاعةٌ بلا مطابقة) ملاحظةُ معاينة لا تغيير. */
export function meetingChanges(before: Row[], after: Row[]): DiffField[] {
  const a = meetingsOf(before), b = meetingsOf(after);
  const fields = new Set<DiffField>();
  for (const day of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(day) || [], y = b.get(day) || [];
    if (x.length !== y.length) { fields.add("days"); if (!x.length || !y.length) continue; }
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
      if (x[i].time !== y[i].time) fields.add("time");
      if (y[i].instructor !== "0" && x[i].instructor !== y[i].instructor) fields.add("instructor");
      if (y[i].room && x[i].room !== y[i].room) fields.add("room");
    }
  }
  return (["days", "time", "instructor", "room"] as DiffField[]).filter(field => fields.has(field));
}

export function importDiff(current: readonly Row[], incoming: readonly Row[]): ImportDiff {
  const before = group(current), after = group(incoming);
  const added: DiffEntry[] = [], removed: DiffEntry[] = [], changed: DiffEntry[] = [];
  let same = 0;
  for (const [key, rows] of after) {
    const old = before.get(key);
    if (!old) { added.push({ key, label: labelOf(rows), after: rows[0] }); continue; }
    const fields = meetingChanges(old, rows);
    if (fields.length) changed.push({ key, label: labelOf(rows), before: old[0], after: rows[0], fields });
    else same += 1;
  }
  for (const [key, rows] of before) if (!after.has(key)) removed.push({ key, label: labelOf(rows), before: rows[0] });
  const byLabel = (a: DiffEntry, b: DiffEntry) => a.label.localeCompare(b.label, "ar", { numeric: true });
  return { added: added.sort(byLabel), removed: removed.sort(byLabel), changed: changed.sort(byLabel), same, current: before.size, incoming: after.size };
}
