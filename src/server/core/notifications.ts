/**
 * ── الإشعاراتُ والجرس ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { onSchedulesInvalidated } from "../../db/referenceCache";
import { planningTermCandidates } from "../../utils/termSequence";
import { createTtlMemo, type StudentQueueEntry } from "../notificationCache";

/**
 * ── الجرس لفصلين: الجاري، وفصل التخطيط (N18) ────────────────────────────────
 *
 * دورةُ الاعتماد تجري غالباً على الفصل التالي والجاري يُدرَّس. فيُقرأ الجرس
 * للجاري ولفصل التخطيط (planningTermCandidates في termSequence.ts: أحدثُ فصلٍ
 * لم ينتهِ وفيه نشاط)، وكلُّ بندٍ من فصل التخطيط يحمل اسمَ فصله ومعرّفه.
 * ومن سأل عن فصلٍ بعينه (termId) يُجاب عنه وحده.
 */
/* مجموعُ كشف الطلبة لكل فصل، محفوظاً دقيقة — القاعدة في src/server/notificationCache.ts.
   يُمحى عند كتابة الكشف، ووصول استبيان، ونبضِ نسخةٍ أخرى. والمفتاحُ يحمل جلسة
   العرض التجريبي: لكلِّ جلسةٍ بياناتُها. */
export const studentQueueMemo = createTtlMemo<Map<string, StudentQueueEntry>>({ ttlMs: 60_000 });

/* موانعُ القسم المعتمد في جرس العميدين (N20): كانت تُسأل بـblockingConflictCount
   لكل قسمٍ معتمد مع كل نداء — قراءتان لجدول الفصل وفحصُ تعارضٍ كامل لكل قسم.
   فصار جدولُ الفصل الذي قرأه الجرس مرّةً يُعدّ لكل قسمٍ في الذاكرة (كما يفعل
   الوارد)، ويُحفظ العدُّ لكل فصلٍ وقسم حتى يتغيّر جدولٌ (onSchedulesInvalidated
   ونبضُ النسخ الأخرى) أو تمضي دقيقة. */
export const bellBlockingMemo = createTtlMemo<number>({ ttlMs: 60_000 });
onSchedulesInvalidated(() => bellBlockingMemo.invalidate());

export async function bellPlanningTermId(terms: any[]): Promise<number> {
  for (const candidate of planningTermCandidates(terms as any)) {
    const [approvals, rows] = await Promise.all([
      Repository.getScheduleApprovalsForTerm(candidate),
      Repository.getSchedulesByScope({ termId: candidate }),
    ]);
    if (approvals.length || rows.length) return candidate;
  }
  return 0;
}
