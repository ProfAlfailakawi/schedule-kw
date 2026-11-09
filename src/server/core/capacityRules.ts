/**
 * حدود السعة (قرار 1913/2016 م.8 و م.9) — قراءةُ استثناءات المدير ونوعِ تخصص العائلة من الوثيقة الواحدة.
 * الحكمُ نفسُه في src/utils/capacityLimits.ts؛ وهنا الوصولُ إلى البيانات وحده.
 */
import { Repository } from "../../db/repository";
import { CAPACITY_RULES_DOC, capacityContextFor, type CapacityRules } from "../../utils/capacityLimits";
import { departmentFamilyKey } from "../../utils/sectionLabel";

export async function readCapacityRules(): Promise<CapacityRules> {
  const doc = await Repository.getFeatureDoc<CapacityRules>(CAPACITY_RULES_DOC.collection, CAPACITY_RULES_DOC.id);
  return doc && typeof doc === "object" && doc.families && typeof doc.families === "object" ? doc : { families: {} };
}

/** مفتاحُ عائلة القسم لقسمٍ بعينه، أو "" إن لم يُعرف. */
export async function familyKeyOfSection(sectionId: number): Promise<string> {
  const section = (await Repository.getSections() as any[]).find(item => Number(item.AdSectionId) === Number(sectionId));
  return section ? departmentFamilyKey(section.AdSectionName) : "";
}

/** ما تحتاجه القاعدةُ لعائلة قسمٍ بعينه: نوعُ التخصص والمقرراتُ المستثناة. */
export async function capacityContextForSection(sectionId: number) {
  const [rules, key] = await Promise.all([readCapacityRules(), familyKeyOfSection(sectionId)]);
  return capacityContextFor(rules, key);
}
