/**
 * ── المستبعَدون من بطاقة الأستاذ 👁️/✏️ لعائلة القسم في الفصل ──
 *
 * القاعدةُ في src/utils/cardRecipients.ts (قرار المالك 2026-11-08)؛ هنا قراءةُ وقائعها:
 * منتدبو كل موقعٍ في العائلة، والمصنَّفون «TA»، ومن طلبُه 🎓، ومن اختير في موجات مرحلة التدريب.
 * يقرؤها الإصدارُ والقائمةُ والمعاينةُ والتذكير — فلا تفترق قائمةٌ عن إصدار.
 */
import { Repository } from "../../db/repository";
import { cardExclusions, type ExclusionReason } from "../../utils/cardRecipients";
import type { TaPhaseDoc } from "../../utils/taPhase";
import { taPhaseId } from "./instructorRequests";
import { staffFamilyScopes } from "./staffCard";
import { readVisitingStatus } from "./visiting";

export async function readCardExclusions(collegeId: number, sectionId: number, termId: number): Promise<Map<number, ExclusionReason>> {
  const family = await staffFamilyScopes(collegeId, sectionId);
  const [visiting, instructors, requests, phases] = await Promise.all([
    Promise.all(family.map(scope => readVisitingStatus(scope.collegeId, scope.sectionId, termId))),
    Repository.getInstructors(),
    Promise.all(family.map(scope => Repository.getInstructorRequests(scope.collegeId, scope.sectionId, termId))),
    Promise.all(family.map(scope => Repository.getFeatureDoc<TaPhaseDoc>("taPhases", taPhaseId(scope.collegeId, scope.sectionId, termId)))),
  ]);
  return cardExclusions({
    instructors: instructors as any[],
    visitingIds: visiting.flatMap(row => row.instructorIds),
    requests: requests.flat(),
    /* موجاتُ مرحلةٍ مفتوحة وحدها: مرحلةٌ أُغلقت لا تُبقي أصحابها خارج بطاقة القسم. */
    taPhaseIds: phases.filter(doc => doc && !doc.closedAt).flatMap(doc => (doc!.waves || []).flatMap(wave => wave.instructorIds || [])),
  });
}

export const exclusionRefusal = (reason: ExclusionReason) => reason === "visiting"
  ? "المنتدبون لا تصلهم بطاقة الأستاذ."
  : "المتدرّب يصله ما يخصّه من «🎓 مرحلة التدريب» وحدها.";
