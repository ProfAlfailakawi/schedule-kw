/**
 * ── منتقيات الأستاذ: الشخصُ مرّةً واحدة، والاسمُ المتكرّر بتمييزٍ صغير ──────
 *
 * ملاحظةُ المالك (r4): في «وارد الأساتذة» يظهر «د. أحمد الفيلكاوي» مرّتين في
 * منتقي «مقترح دراسي». السبب: المنتقي كان يُفرد كلَّ طلبٍ سطراً، والطلبُ
 * يصدر لكل (سجلِّ أستاذ × قسم). و«د. أحمد الفيلكاوي» له سجلّان في سجلّ
 * الأساتذة بمعرّفين (والمشكلةُ نفسُها حُلّت لمنتقي التصفية في N1 —
 * inboxInstructorChoices — ولم تُطبَّق على منتقي المقترح). وكذلك «هيئة
 * تدريسية» — اسمٌ لا شخص — كانت تظهر بعدد سجلاتها.
 *
 * القاعدة هنا واحدة للمنتقيات:
 *   - الهويةُ مفتاحُ الاسم (instructorIdentityKey): «د. أحمد الفيلكاوي» بسجلّين
 *     في القسم نفسه شخصٌ واحد وسطرٌ واحد.
 *   - الشخصُ نفسُه في قسمين مختلفين طلبان حقيقيان مختلفان (المقترحُ يُكتب في
 *     نطاق طلبه): يبقى سطران، ولكلٍّ اسمُ قسمه تمييزاً صغيراً لا تكراراً.
 *   - سجلّان مختلفان بالاسم نفسه حين يكون الفعلُ لكل معرّفٍ على حدة (إعادةُ
 *     فتح الرابط لأستاذ): لا يُدمجان، بل يُميَّزان بآخر أرقام الجوال، وإلا برقم السجل.
 */
import { instructorIdentityKey, placeholderInstructorIds } from "./instructorIdentity";

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
  /** الطلبُ الذي يُفتح عليه المقترح. */
  value: string;
  name: string;
  /** تمييزٌ صغير يظهر بعد الاسم حين يتكرّر الشخص في أكثر من قسم. */
  hint: string;
  visiting: boolean;
}

/* مفتاحُ الهوية يُسقط الأرقام (لا اسمَ فيه رقم)، فـ«عضو هيئة تدريس تجريبي 5» و«… 6» كانا مفتاحاً واحداً؛
   الأرقامُ في الاسم جزءٌ من هويته هنا. */
const identityOf = (name: string, id: number | string) => {
  const key = instructorIdentityKey(String(name || ""));
  const digits = (String(name || "").match(/[0-9٠-٩]+/g) || []).join(",");
  return key ? `${key}${digits ? `#${digits}` : ""}` : `id:${Number(id)}`;
};
const ar = (a: string, b: string) => a.localeCompare(b, "ar", { numeric: true });

/** منتقي «مقترح دراسي» في الوارد: سطرٌ لكل (شخص × قسم)، بلا «هيئة تدريسية». */
export function proposalLauncherChoices(rows: readonly LauncherRequestRow[]): LauncherChoice[] {
  const placeholders = placeholderInstructorIds(rows.map(row => ({ AdInstructorId: row.AdInstructorId, AdInstructorName: row.instructorName })));
  const people = new Map<string, Map<string, LauncherRequestRow[]>>();
  for (const row of rows) {
    if (!row?.id || placeholders.has(Number(row.AdInstructorId))) continue;
    const person = identityOf(row.instructorName, row.AdInstructorId);
    const scope = `${Number(row.AdCollegeId || 0)}:${Number(row.AdSectionId || 0)}`;
    const scopes = people.get(person) || new Map<string, LauncherRequestRow[]>();
    scopes.set(scope, [...(scopes.get(scope) || []), row]);
    people.set(person, scopes);
  }
  const out: LauncherChoice[] = [];
  for (const scopes of people.values()) {
    const picked = [...scopes.values()].map(list =>
      /* سجلّان للشخص في القسم نفسه: الطلبُ الذي فيه تعديلٌ أولى، ثم الأوّل كما وصل. */
      [...list].sort((a, b) => Number((b.changedCount || 0) > 0) - Number((a.changedCount || 0) > 0))[0]);
    const many = picked.length > 1;
    const sectionCounts = new Map<string, number>();
    for (const row of picked) sectionCounts.set(String(row.sectionName || ""), (sectionCounts.get(String(row.sectionName || "")) || 0) + 1);
    for (const row of picked) {
      const section = String(row.sectionName || "").trim();
      const college = String(row.requestCollegeName || "").trim();
      const hint = !many ? ""
        : section && (sectionCounts.get(section) || 0) === 1 ? section
        : [section, college].filter(Boolean).join(" — ") || `قسم ${Number(row.AdSectionId || 0)}`;
      out.push({ value: row.id, name: String(row.instructorName || "").trim(), hint, visiting: Boolean(row.visiting) });
    }
  }
  return out.sort((a, b) => ar(a.name, b.name) || ar(a.hint, b.hint));
}

export interface PickerPerson {
  AdInstructorId: number | string;
  AdInstructorName: string;
  AdInstructorMobile?: string;
}

/**
 * عناوينُ منتقٍ يعمل لكل معرّفٍ على حدة: الاسمُ وحده إن لم يتكرّر، وإلا الاسمُ
 * ومعه آخرُ أربعة أرقامٍ من الجوال (إن اختلفت بين السجلات)، وإلا «سجل رقم …».
 */
export function instructorPickerLabels(people: readonly PickerPerson[]): Map<number, string> {
  const groups = new Map<string, PickerPerson[]>();
  for (const person of people) {
    const key = identityOf(person.AdInstructorName, person.AdInstructorId);
    groups.set(key, [...(groups.get(key) || []), person]);
  }
  const labels = new Map<number, string>();
  for (const list of groups.values()) {
    const tails = list.map(person => String(person.AdInstructorMobile || "").replace(/\D/g, "").slice(-4));
    const tailsDiffer = tails.every(Boolean) && new Set(tails).size === list.length;
    list.forEach((person, index) => {
      const name = String(person.AdInstructorName || "").trim();
      const id = Number(person.AdInstructorId);
      labels.set(id, list.length < 2 ? name : `${name} · ${tailsDiffer ? `جوال …${tails[index]}` : `سجل رقم ${id}`}`);
    });
  }
  return labels;
}
