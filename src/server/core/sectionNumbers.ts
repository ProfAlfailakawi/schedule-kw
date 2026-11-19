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
import { recordSectionNumbers, type SectionNumberLedger } from "../../utils/registrarNumbering";

export interface SectionNumberDoc { id: string; courses: SectionNumberLedger; updatedAt: string }

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
      if (current && JSON.stringify(courses) === JSON.stringify(current.courses)) return { refuse: null };
      return { next: { id, courses, updatedAt: new Date().toISOString() }, result: null };
    });
  } catch (error) {
    console.error("[section-numbers] تعذّر تحديث سجلّ أرقام الشعب:", error instanceof Error ? error.message : error);
  }
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
