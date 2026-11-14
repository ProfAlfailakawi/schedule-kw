/**
 * ── من يحتاج إرسالاً الآن؟ ─────────────────────────────────────────────────────────
 * عند «أساتذة محددون» لا يبدأ المنسّقُ من قائمةٍ فارغة ولا من الكل: يبدأ بمن لم يصله شيء، أو لم يفتح رابطَه، أو فتح ولم يردّ، أو
 * بطاقتُه عرضٌ لا تعديلَ فيه وهو يريد له التعديل. ومن ردّ وبطاقتُه سليمةٌ لا يُعاد له شيءٌ بلا حاجة. الجملةُ قبل الإرسال تقول
 * بالعدد لمن سيصل ولماذا — واختيارُ المنسّق يغلب الاقتراحَ دائماً. دوالُّ خالصة، والمصدرُ حالاتُ المتابعة التي يقرؤها الخادم.
 */
import { AR, countOf, nounFor, type ArabicNoun } from "./arabicCount";

export type SendNeed = "new" | "unopened" | "unreplied" | "viewOnly";
export const SEND_NEEDS: readonly SendNeed[] = ["new", "unopened", "unreplied", "viewOnly"];

export interface FollowEntry {
  state: "sent" | "opened" | "replied";
  mode: string;
  status?: string;
  /** نافذةُ طلبه مفتوحة الآن؟ غيابُها = مفتوحة (ردودٌ قديمة لا تحملها). */
  windowOpen?: boolean;
}

const RANK: Record<FollowEntry["state"], number> = { sent: 0, opened: 1, replied: 2 };

/** حاجةُ شخصٍ واحد (كلُّ سجلّاته): null = لا يحتاج إرسالاً. */
export function sendNeed(entries: readonly FollowEntry[], sendMode: "view" | "edit"): SendNeed | null {
  if (!entries.length) return "new";
  if (sendMode === "view") return null;
  const best = [...entries].sort((a, b) => RANK[b.state] - RANK[a.state])[0];
  if (best.mode === "view") return "viewOnly";
  if (best.state === "sent") return "unopened";
  if (best.state === "opened") return "unreplied";
  /* ردّ، وبطاقتُه عرضٌ لأن نافذتَه أُغلقت والقسمُ لم يُنهِ طلبَه: تحتاج فتحَ التعديل. */
  return best.windowOpen === false && best.status !== "settled" ? "viewOnly" : null;
}

const verb = (one: string, two: string, many: string): ArabicNoun => ({ one, two, few: many, many });
const LABEL: Record<SendNeed, ArabicNoun> = {
  new: verb("لم تصله بعد", "لم تصلهما بعد", "لم تصلهم بعد"),
  unopened: verb("لم يفتح", "لم يفتحا", "لم يفتحوا"),
  unreplied: verb("لم يردّ", "لم يردّا", "لم يردّوا"),
  viewOnly: verb("للعرض فقط", "للعرض فقط", "للعرض فقط"),
};

export function needTally(needs: ReadonlyArray<SendNeed | null>): Record<SendNeed, number> {
  const tally: Record<SendNeed, number> = { new: 0, unopened: 0, unreplied: 0, viewOnly: 0 };
  for (const need of needs) if (need) tally[need] += 1;
  return tally;
}

/** «سيصل إلى 12 أستاذاً: 5 لم يفتحوا · 3 لم يردّوا» — الأسبابُ لمن لها عدد. */
export function needsSentence(total: number, tally: Record<SendNeed, number>): string {
  const head = `سيصل إلى ${countOf(total, AR.instructor)}`;
  const parts = SEND_NEEDS.filter(need => tally[need] > 0)
    .map(need => `${Number(tally[need]).toLocaleString("ar-KW-u-nu-latn")} ${nounFor(tally[need], LABEL[need])}`);
  return parts.length ? `${head}: ${parts.join(" · ")}` : head;
}
