/**
 * ── معاينةُ البطاقة بقرار الإصدار نفسه ──────────────────────────────────────
 *
 * المعاينةُ تُري البطاقةَ التي سيُصدرها «أرسل» بالضبط، فتمرّ بالقاعدة نفسها (reissueMove):
 *   - أرسله وينتظر القسم («keep»)  ← طلبُه كما هو، ولا تتغيّر إلا الصفةُ والمقررات (والموعدُ لا يُمسّ).
 *   - لم يُرسله بعد («extend»)     ← طلبُه بالموعد الجديد والصفة والمقررات.
 *   - ثُبّت أو لا طلبَ له («fresh») ← طلبٌ جديد بحالة «أُرسل» من جدوله، بلا قراراتٍ ولا حوار.
 * خالصةٌ بلا قاعدة بيانات؛ لا يُحفظ منها شيء.
 */
import type { InstructorRequest } from "../types";
import { reissueMove, type ReissueMove } from "./requestReissue";

export function previewCardRequest(
  held: InstructorRequest | null | undefined,
  fresh: () => InstructorRequest,
  options: { mode: "view" | "edit"; closesAt: string; now: string; offered?: number[] | null },
): { move: ReissueMove; request: InstructorRequest } {
  const move = reissueMove(held);
  const offered = (base: InstructorRequest) => (options.offered === undefined ? base.offeredCourseIds ?? null : options.offered);
  if (held && move === "keep") return { move, request: { ...held, linkMode: options.mode, offeredCourseIds: offered(held) } };
  if (held && move === "extend") {
    return { move, request: { ...held, linkMode: options.mode, offeredCourseIds: offered(held),
      window: { opensAt: held.window?.opensAt || options.now, closesAt: options.closesAt } } };
  }
  const base = fresh();
  return { move: "fresh", request: { ...base, linkMode: options.mode, offeredCourseIds: options.offered ?? null,
    window: { opensAt: options.now, closesAt: options.closesAt }, status: "sent" } };
}
