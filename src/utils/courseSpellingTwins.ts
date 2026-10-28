/**
 * ── مقرران باسمٍ واحد وإملاءين (G5) ──────────────────────────────────────────
 * «اداره مراكز مصادر التعلم» و«إدارة مراكز مصادر التعلم» مقررٌ واحد كُتب مرتين.
 * القاعدة الواحدة للإملاء هي courseNameRelation (الهمزات، التاء المربوطة، «ال»، المسافات)
 * — نفسها التي تقرر بها مراجعة الصحيفة أن الاسمين إملاءٌ لا مقرران. هنا تُجمع الأسماء
 * المتطابقة إملاءً ليُقترح دمجها؛ لا يُحذف شيءٌ ولا يُدمج إلا بتأكيد المسؤول من «فحص المكرر».
 */
import { courseNameRelation } from "./courseNameRelation";

/** مجموعات الأسماء التي هي إملاءٌ واحد (مجموعتان فأكثر فقط). */
export function spellingTwinGroups(names: readonly string[]): string[][] {
  const unique = [...new Set(names.map(name => String(name || "").trim()).filter(Boolean))];
  const groups: string[][] = [];
  const taken = new Set<string>();
  for (let i = 0; i < unique.length; i++) {
    if (taken.has(unique[i])) continue;
    const group = [unique[i]];
    for (let j = i + 1; j < unique.length; j++) {
      if (taken.has(unique[j])) continue;
      const relation = courseNameRelation(unique[i], unique[j]);
      if (relation === "same" || relation === "spelling") group.push(unique[j]);
    }
    if (group.length > 1) { group.forEach(name => taken.add(name)); groups.push(group); }
  }
  return groups;
}

/** إملاءات الاسم الأخرى في القائمة نفسها (فارغة إن لم يكن له توأم). */
export function spellingTwinsOf(name: string, names: readonly string[]): string[] {
  const target = String(name || "").trim();
  if (!target) return [];
  return spellingTwinGroups(names).find(group => group.includes(target))?.filter(item => item !== target) || [];
}
