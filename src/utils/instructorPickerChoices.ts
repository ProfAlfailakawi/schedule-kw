/**
 * ── منتقيات الأستاذ: الشخصُ مرّةً واحدة، باسمه وحده ─────────────────────────
 *
 * ملاحظةُ المالك (r4) ثم (r2 «خطأ فادح»): في «وارد رغبات الأساتذة» كان منتقي «مقترح
 * دراسي» يُفرد الشخصَ سطراً لكل طلب — والطلبُ يصدر لكل (سجلِّ أستاذ × قسم × كلية) —
 * فظهر «د. أحمد الفيلكاوي · قسم تكنولوجيا التعليم — كلية التربية الأساسية - بنات»
 * ثم «… - بنين»، وكذلك الشعيب والمنيفي والكندري وحيدر.
 *
 * القاعدة الواحدة للمنتقيات الآن:
 *   - الهويةُ مفتاحُ الاسم (personIdentityKey ← instructorIdentityKey مع أرقام الاسم):
 *     سجلّان باسمٍ واحد، أو طلبان في البنين والبنات، شخصٌ واحد وسطرٌ واحد.
 *   - السطرُ اسمُ الشخص وحده (ومعه وسمُ «منتدب» إن كان)، بلا قسمٍ ولا كلية ولا جوال.
 *   - وسمُ الموقع (بنين/بنات/الكلية) يُرسم داخل ما يُفتح — على كل طلبٍ وكل موعد —
 *     لا في المنتقي (campusChip.ts).
 *   - الفعلُ لكل معرّف (إعادةُ فتح الرابط لأستاذ في شاشة النشر) يقع على كل سجلّات الشخص.
 */
import { instructorIdentityKey, placeholderInstructorIds } from "./instructorIdentity";
import { campusChipOf, campusChips } from "./campusChip";

export interface LauncherRequestRow {
  id: string;
  AdInstructorId: number | string;
  instructorName: string;
  AdCollegeId?: number | string;
  AdSectionId?: number | string;
  sectionName?: string;
  requestCollegeName?: string;
  changedCount?: number;
  visiting?: boolean;
}

export interface LauncherChoice {
  /** الطلبُ الذي يُفتح عليه المقترح أولاً (قيمةُ الخيار). */
  value: string;
  name: string;
  /** لم يعد يُكتب بعد الاسم شيء: الشخصُ مرّةً واحدة باسمه وحده (r2). يبقى الحقلُ فارغاً لمن يقرؤه. */
  hint: string;
  visiting: boolean;
  /** كلُّ طلباته في الوارد — طلبٌ لكل (سجلٍّ × قسمٍ × كلية) — الأوّلُ هو `value`. */
  requests: LauncherPersonRequest[];
}

export interface LauncherPersonRequest {
  id: string;
  /** وسمُ الموقع الصغير («بنين»/«بنات» أو اسمُ الكلية) — يُرسم داخل المساحة، لا في المنتقي. */
  campus: string;
  collegeName: string;
  sectionName: string;
  changedCount: number;
  /** منتدبٌ في قسم هذا الطلب. */
  visiting: boolean;
}

/* مفتاحُ الهوية يُسقط الأرقام (لا اسمَ فيه رقم)، فـ«عضو هيئة تدريس تجريبي 5» و«… 6» كانا مفتاحاً واحداً؛
   الأرقامُ في الاسم جزءٌ من هويته هنا. */
export const personIdentityKey = (name: string, id: number | string) => {
  const key = instructorIdentityKey(String(name || ""));
  const digits = (String(name || "").match(/[0-9٠-٩]+/g) || []).join(",");
  return key ? `${key}${digits ? `#${digits}` : ""}` : `id:${Number(id)}`;
};
const identityOf = personIdentityKey;
const ar = (a: string, b: string) => a.localeCompare(b, "ar", { numeric: true });

/**
 * سجلّاتُ الشخص نفسه في سجلّ الأساتذة: معرّفُه، ومعه كلُّ معرّفٍ يحمل الاسمَ نفسه بالهوية
 * (بنين وبنات، أو سجلٌّ مكرّر). لا تُضمّ «هيئة تدريسية» أبداً — ليست شخصاً.
 */
export function personRecordIds(
  instructors: ReadonlyArray<{ AdInstructorId: number | string; AdInstructorName?: unknown }>,
  instructorId: number,
): Set<number> {
  const ids = new Set<number>([Number(instructorId)]);
  const self = instructors.find(person => Number(person.AdInstructorId) === Number(instructorId));
  const placeholders = placeholderInstructorIds(instructors as any);
  if (!self || placeholders.has(Number(instructorId))) return ids;
  const key = identityOf(String(self.AdInstructorName || ""), instructorId);
  if (key.startsWith("id:")) return ids;
  for (const person of instructors) {
    const id = Number(person.AdInstructorId);
    if (!id || placeholders.has(id)) continue;
    if (identityOf(String(person.AdInstructorName || ""), id) === key) ids.add(id);
  }
  return ids;
}

/**
 * منتقي «مقترح دراسي» في الوارد: **الشخصُ مرّةً واحدة باسمه وحده** (ملاحظة المالك r2 —
 * «خطأ فادح»: كان يظهر «د. أحمد الفيلكاوي · قسم … — كلية التربية الأساسية - بنات» ثم «… - بنين»).
 * الطلبُ يصدر لكل (سجلٍّ × قسمٍ × كلية)، فيُجمع كلُّ ذلك تحت الشخص؛ واختيارُه يفتح المساحةَ على
 * طلبه الأوّل ومعه بقيةُ طلباته (يُنتقل بينها داخل المساحة بوسم الموقع)، وجدولُه الكامل.
 * لا «هيئة تدريسية».
 *
 * الطلبُ الأوّل: ما في كلية الشاشة الحالية (`preferCollegeId`)، ثم ما فيه تعديل، ثم أوّلُ ما وصل.
 */
export function proposalLauncherChoices(rows: readonly LauncherRequestRow[], preferCollegeId = 0): LauncherChoice[] {
  const placeholders = placeholderInstructorIds(rows.map(row => ({ AdInstructorId: row.AdInstructorId, AdInstructorName: row.instructorName })));
  const people = new Map<string, LauncherRequestRow[]>();
  for (const row of rows) {
    if (!row?.id || placeholders.has(Number(row.AdInstructorId))) continue;
    const person = identityOf(row.instructorName, row.AdInstructorId);
    people.set(person, [...(people.get(person) || []), row]);
  }
  const out: LauncherChoice[] = [];
  for (const list of people.values()) {
    const ordered = list.map((row, at) => ({ row, at })).sort((a, b) =>
      Number(Boolean(preferCollegeId) && Number(b.row.AdCollegeId) === preferCollegeId) - Number(Boolean(preferCollegeId) && Number(a.row.AdCollegeId) === preferCollegeId)
      || Number((b.row.changedCount || 0) > 0) - Number((a.row.changedCount || 0) > 0)
      || a.at - b.at).map(entry => entry.row);
    const chips = campusChips(ordered.map(row => String(row.requestCollegeName || "")));
    const first = ordered[0];
    out.push({
      value: first.id,
      name: String(first.instructorName || "").trim(),
      hint: "",
      visiting: ordered.some(row => row.visiting === true),
      requests: ordered.map(row => {
        const collegeName = String(row.requestCollegeName || "").trim();
        return {
          id: row.id, collegeName, sectionName: String(row.sectionName || "").trim(), changedCount: Number(row.changedCount || 0), visiting: Boolean(row.visiting),
          campus: chips.get(collegeName.replace(/\s+/g, " ")) || (collegeName ? campusChipOf(collegeName) : String(row.sectionName || "").trim()),
        };
      }),
    });
  }
  return out.sort((a, b) => ar(a.name, b.name));
}

export interface PickerPerson {
  AdInstructorId: number | string;
  AdInstructorName: string;
  AdInstructorMobile?: string;
}

export interface PickerPersonChoice {
  /** أوّلُ معرّفٍ للشخص — قيمةُ الخيار. */
  value: number;
  /** كلُّ معرّفاته في القائمة: الفعلُ يقع عليها كلّها. */
  ids: number[];
  label: string;
}

/**
 * منتقٍ يعمل بالمعرّف (إعادةُ فتح التعديل لأستاذ): الشخصُ مرّةً واحدة باسمه، ومعه كلُّ
 * معرّفاته — سجلّان لاسمٍ واحد لا يُعرضان «… · جوال …1234» و«… · جوال …5678» بعد اليوم.
 */
export function instructorPickerPeople(people: readonly PickerPerson[]): PickerPersonChoice[] {
  const groups = new Map<string, PickerPersonChoice>();
  for (const person of people) {
    const id = Number(person.AdInstructorId);
    if (!id) continue;
    const key = identityOf(person.AdInstructorName, id);
    const held = groups.get(key);
    if (held) { if (!held.ids.includes(id)) held.ids.push(id); }
    else groups.set(key, { value: id, ids: [id], label: String(person.AdInstructorName || "").trim() });
  }
  return [...groups.values()].sort((a, b) => ar(a.label, b.label));
}
