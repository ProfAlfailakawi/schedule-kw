/**
 * ── محاضرات خانةٍ من «نسبة الإشغال»: مجموعةً بمواقعها ───────────────────────
 *
 * الخانة في عائلة القسم تجمع محاضرات كلياتٍ يتكرّر صدر اسمها: «كلية التربية
 * الأساسية - بنات»، «... - بنين»، «... - بنات - الجهراء». كان الاسم كاملاً
 * يُعاد في كل صفّ ويُسرد في عنوان اللوحة جملةً طويلة. هنا يُختصر كل اسمٍ إلى
 * ما يميّزه بين أخواته (بنات · بنين · الجهراء · الفحيحيل)، وتُجمع الصفوف تحت
 * موقعها، ويُبحث فيها بالمقرر أو الأستاذ أو الرمز أو القاعة أو الشعبة.
 */
import { collegeShortName } from "./sectionLabel";

const parts = (name: string) => collegeShortName(name).split(/\s+[-–—]\s+/).map(part => part.trim()).filter(Boolean);

/**
 * أقصر اسمٍ يميّز كل موقعٍ بين أخواته: آخر مقطعٍ إن لم يتكرّر، وإلا ما بعد
 * الصدر المشترك، وإلا الاسم بلا «كلية». موقعٌ واحد يبقى اسمه كما هو.
 */
export function campusShortLabels(names: readonly string[]): Map<string, string> {
  const unique = [...new Set(names.map(name => String(name || "").trim()).filter(Boolean))];
  const out = new Map<string, string>();
  if (unique.length < 2) { unique.forEach(name => out.set(name, collegeShortName(name))); return out; }
  const split = unique.map(parts);
  let common = 0;
  while (split.every(item => item.length > common && item[common] === split[0][common])) common++;
  const rests = split.map(item => item.slice(common));
  const lasts = rests.map(rest => rest[rest.length - 1] || "");
  const lastsUnique = lasts.every(Boolean) && new Set(lasts).size === lasts.length;
  unique.forEach((name, index) => {
    const rest = rests[index];
    out.set(name, lastsUnique ? lasts[index] : rest.length ? rest.join(" - ") : collegeShortName(name));
  });
  return out;
}

export interface SlotRow {
  id: number | string;
  course: string;
  code: string;
  section: string;
  room: string;
  teacher: string;
  campusId: number;
  campusName: string;
}

export interface SlotGroup<T extends SlotRow> {
  campusId: number;
  label: string;
  rows: T[];
}

/** الصفوف تحت مواقعها بترتيب `order` (الموقع المفتوح أولاً)، وترتيبها داخل الموقع كما جاءت (بالوقت). */
export function groupSlotRows<T extends SlotRow>(rows: readonly T[], order: readonly number[] = []): SlotGroup<T>[] {
  const labels = campusShortLabels(rows.map(row => row.campusName));
  const groups = new Map<number, SlotGroup<T>>();
  rows.forEach(row => {
    const group = groups.get(row.campusId) || { campusId: row.campusId, label: labels.get(String(row.campusName || "").trim()) || row.campusName || "—", rows: [] };
    group.rows.push(row);
    groups.set(row.campusId, group);
  });
  const rank = (id: number) => { const at = order.indexOf(id); return at < 0 ? order.length : at; };
  return [...groups.values()].sort((a, b) => rank(a.campusId) - rank(b.campusId));
}

/** يُطبّع للبحث: بلا تشكيل، وهمزات الألف ألف، والتاء المربوطة هاء، والياء الأخيرة ياء. */
export const slotSearchKey = (value: unknown) => String(value ?? "")
  .toLowerCase()
  .replace(/[ً-ْـ]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ة/g, "ه")
  .replace(/ى/g, "ي")
  .replace(/\s+/g, " ")
  .trim();

export function matchesSlotQuery(row: SlotRow, query: string): boolean {
  const words = slotSearchKey(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = slotSearchKey([row.course, row.code, row.section, row.room, row.teacher].join(" "));
  return words.every(word => hay.includes(word));
}

/** ما تعرضه اللوحة: رقيقة الموقع المختارة (أو الكل) ثم البحث؛ والمجموعة الفارغة لا تُعرض. */
export function visibleSlotGroups<T extends SlotRow>(groups: readonly SlotGroup<T>[], campus: number | null, query: string): SlotGroup<T>[] {
  return groups
    .filter(group => campus == null || group.campusId === campus)
    .map(group => ({ ...group, rows: group.rows.filter(row => matchesSlotQuery(row, query)) }))
    .filter(group => group.rows.length);
}
