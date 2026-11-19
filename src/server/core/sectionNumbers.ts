/**
 * ── سجلّ أرقام الشعب في الفصل: لا يعود رقمٌ حُذف ─────────────────────────────
 *
 * الشعبة الجديدة رقمُها التالي بعد أكبر رقمٍ للمقرر في الفصل (registrarNumbering).
 * والجدول وحده لا يكفي: شعبةٌ حُذفت يغيب رقمها عنه فيعود لشعبةٍ أخرى، والتسجيل قد
 * رآه. فيُحفظ لكل نطاقٍ أكبرُ رقمٍ رآه البرنامج لكل مقرر — يكبر ولا ينقص — من كل
 * إضافةٍ وحذفٍ يمرّ بـ noteScheduleMutation. وأولُ قراءةٍ لنطاقٍ بلا سجلّ تبنيه من
 * الجدول ومن آخر النسخ المحفوظة (ما حُذف قبل وجود السجلّ).
 */
import { Repository } from "../../db/repository";
import { nextCourseSection, recordSectionNumbers, sectionNumberOf, type SectionNumberLedger } from "../../utils/registrarNumbering";

/** courses: أكبر رقمٍ لكل مقرر (للرقم التالي). used: كلُّ رقمٍ رآه السجلّ لكل مقرر (لرفض العودة إليه). */
export interface SectionNumberDoc { id: string; courses: SectionNumberLedger; used?: Record<string, number[]>; updatedAt: string }

/** يضمّ أرقام صفوفٍ إلى قائمة المستعمل لكل مقرر (مرتّبةً بلا تكرار). */
function recordUsed(used: Record<string, number[]> | undefined, rows: readonly Scoped[]): Record<string, number[]> {
  const out: Record<string, number[]> = { ...(used || {}) };
  for (const row of rows) {
    const courseId = Number(row?.AdCourseId || 0), number = sectionNumberOf(row?.SCode);
    if (!(courseId > 0) || number === null) continue;
    const list = out[String(courseId)] || [];
    if (!list.includes(number)) out[String(courseId)] = [...list, number].sort((a, b) => a - b);
  }
  return out;
}

export const sectionNumberDocId = (collegeId: number, sectionId: number, termId: number) => `${termId}:${collegeId}:${sectionId}`;

type Scoped = { AdCourseId?: unknown; SCode?: unknown; AdCollegeId?: unknown; AdSectionId?: unknown; AdTermId?: unknown };
const inScope = (collegeId: number, sectionId: number, termId: number) => (row: Scoped) =>
  (row.AdCollegeId === undefined || Number(row.AdCollegeId) === collegeId)
  && (row.AdSectionId === undefined || Number(row.AdSectionId) === sectionId)
  && (row.AdTermId === undefined || Number(row.AdTermId) === termId);

/** يضمّ أرقام صفوفٍ إلى سجلّ نطاقها. لا يرمي: السجلّ مساعدٌ لا يوقف حفظاً. */
export async function recordSectionNumberLedger(collegeId: number, sectionId: number, termId: number, rows: readonly Scoped[]): Promise<void> {
  const scoped = rows.filter(Boolean).filter(inScope(collegeId, sectionId, termId));
  if (!collegeId || !sectionId || !termId || !scoped.length) return;
  const id = sectionNumberDocId(collegeId, sectionId, termId);
  try {
    await Repository.updateFeatureDoc<SectionNumberDoc, null>("sectionNumbers", id, current => {
      const courses = recordSectionNumbers(current?.courses, scoped);
      const used = recordUsed(current?.used, scoped);
      if (current && JSON.stringify(courses) === JSON.stringify(current.courses) && JSON.stringify(used) === JSON.stringify(current.used || {})) return { refuse: null };
      return { next: { id, courses, used, updatedAt: new Date().toISOString() }, result: null };
    });
  } catch (error) {
    console.error("[section-numbers] تعذّر تحديث سجلّ أرقام الشعب:", error instanceof Error ? error.message : error);
  }
}

/** السجلّ المحفوظ وحده (قراءةٌ واحدة لوثيقته، بلا جدولٍ ولا نسخ): لمن معه صفوف النطاق أصلاً. */
export async function readStoredSectionNumberLedger(collegeId: number, sectionId: number, termId: number): Promise<SectionNumberLedger | null> {
  return (await Repository.getFeatureDoc<SectionNumberDoc>("sectionNumbers", sectionNumberDocId(collegeId, sectionId, termId)))?.courses || null;
}

/** سجلّ النطاق: المحفوظ، وإلا يُبنى مرّةً من الجدول وآخر النسخ ويُحفظ. */
export async function readSectionNumberLedger(collegeId: number, sectionId: number, termId: number): Promise<SectionNumberLedger> {
  const id = sectionNumberDocId(collegeId, sectionId, termId);
  const [stored, live] = await Promise.all([
    Repository.getFeatureDoc<SectionNumberDoc>("sectionNumbers", id),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
  ]);
  if (stored?.courses) return recordSectionNumbers(stored.courses, live as Scoped[]);
  const versions = await Repository.getScheduleVersionsWithRows(collegeId, sectionId, termId, 24).catch(() => []);
  const seen: Scoped[] = [...(live as Scoped[]), ...versions.flatMap(version => (version.rows || []) as Scoped[])];
  await recordSectionNumberLedger(collegeId, sectionId, termId, seen);
  return recordSectionNumbers(null, seen.filter(inScope(collegeId, sectionId, termId)));
}

/**
 * شعبةٌ جديدة برقمٍ لا يُقبل: رقمٌ داخل المدى، لا تحمله شعبةٌ قائمة للمقرر (فليس لقاءً آخر
 * لشعبةٍ موجودة)، وقد استُعمل للمقرر في الفصل من قبل ثم حُذف. فراغٌ لم يُستعمل قط يُقبل
 * إن كتبه المستخدم بيده. يُرجع السببَ والرقمَ التالي، وإلا null.
 */
export async function reusedSectionNumber(collegeId: number, sectionId: number, termId: number, courseId: number, code: unknown): Promise<{ error: string; suggested: string } | null> {
  const number = sectionNumberOf(code);
  if (number === null) return null;
  const live = await Repository.getSchedulesByScope({ collegeId, sectionId, termId });
  if ((live as Scoped[]).some(row => Number(row.AdCourseId) === courseId && sectionNumberOf(row.SCode) === number)) return null;
  const ledger = await readSectionNumberLedger(collegeId, sectionId, termId).catch(() => null);
  const doc = await Repository.getFeatureDoc<SectionNumberDoc>("sectionNumbers", sectionNumberDocId(collegeId, sectionId, termId)).catch(() => null);
  if (!ledger || !(doc?.used?.[String(courseId)] || []).includes(number)) return null;
  const suggested = nextCourseSection(live as any[], courseId, termId, { ledger });
  return { error: `رقم الشعبة ${number} استُعمل لهذا المقرر في الفصل من قبل؛ الشعبة الجديدة تأخذ الرقم التالي ${suggested}.`, suggested };
}
