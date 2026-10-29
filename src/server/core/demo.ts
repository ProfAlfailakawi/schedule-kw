/**
 * ── البيئة التجريبية: قصصُ العرض وطلبُ الأستاذ التجريبي ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import type { InstructorRequest } from "../../types";
import { currentInstructorRequestGeneration } from "./instructorRequests";

/*
 * ── قصّةٌ لكل صفة، من أول نظرة ──────────────────────────────────────────────
 *
 * الجداولُ ودورةُ الاعتماد مبذورةٌ في demoSandbox.ts. وما يحتاج مفاتيحَ الخادم
 * — بصمةَ الرقم المدني وختمَ هوية الطالب، وحُكمَ النظام على طلب الأستاذ —
 * يُبذر هنا، بالدوالّ نفسها التي يكتب بها الحقيقي، داخل صندوق الزائر:
 *
 *   • رابطا القسم: بطاقاتُ الأساتذة، واستبيانُ المقررات — فيجدهما المنسّق في
 *     لوحة النشر كما يجدهما في الحقيقي، ويجرّبهما الأستاذُ والطالب.
 *   • قاعدةُ التخرّج لعلوم الحاسب — فطلبُ الخريج ممكنٌ في الاستبيان.
 *   • أربعُ حالات طلبة: خريجٌ وافقت عليه اللجنة وينتظر التسجيل، وتعارضُ مقرّرين
 *     ينتظر اللجنة، وفتحُ مقرّرٍ سجّله التسجيل، وآخرُ لم توافق عليه اللجنة.
 *   • طلبا أستاذين: واحدٌ وصل وينتظر القسم، وآخرُ قُرّر برفضٍ وبدائل.
 *
 * كلُّ الأسماء والأرقام وهمية (generateSyntheticCivilId).
 */
export const DEMO_STORY_SCOPE = { collegeId: 1, sectionId: 1, termId: 1 } as const;

/**
 * ── «جرّب كأستاذ»: كرتُ الأستاذ في الديمو ────────────────────────────────────
 *
 * تحت «جرّب كطالب» في شريط الديمو. يفتح «بطاقة الأستاذ» (`/s/demo.…`) أولاً: يكتب الزائرُ رقمَ أستاذٍ
 * وهمي (في تلميح الصفحة مع زرّ نسخ) ثم يصل منها إلى طلب تعديل الجدول (`/r/demo.…`) فيغيّر أيامَه ويوقّع. يُفضَّل أستاذٌ فتح رابطه ولم يرسل شيئاً بعد، لتكون التجربةُ من أولها. والمسارُ رابطٌ
 * عادي (لا JavaScript): إن لم يكتمل البذرُ بعدُ أجاب بصفحةٍ تعيد المحاولة وحدها كل ثانيتين.
 */
/** أستاذُ التجربة: من فتح رابطه ولم يرسل (ثم من لم يرسل) — يُبذر طلبُه في صندوق الزائر. */
export async function demoTeacherRequest(): Promise<InstructorRequest | undefined> {
  const { collegeId, sectionId, termId } = DEMO_STORY_SCOPE;
  const requests = await Repository.getInstructorRequests(collegeId, sectionId, termId);
  const active = (await currentInstructorRequestGeneration(requests)).filter(row => row.status !== "superseded");
  return active.find(row => !row.submittedAt && row.linkOpenedAt) || active.find(row => !row.submittedAt) || active[0];
}
