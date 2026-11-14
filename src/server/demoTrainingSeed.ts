/**
 * ── «🎓 عضو تدريب» في التجربة: مرحلةُ تدريبٍ مفتوحة ومدرّبان بطلبين ──────────────────────
 *
 * شارةُ «تدريب» وشريحةُ «عضو تدريب» في منتقي الأستاذ داخل الموعد تُبنيان من طلباتٍ بصفة «ta»
 * (src/utils/linkMode.ts) لا من الفئة وحدها؛ والصندوقُ فيه مدرّبان (DEMO_TA_INSTRUCTOR_IDS) بلا طلبٍ
 * فكانت الشريحةُ والشارةُ لا تظهران. هنا تُبذر المرحلةُ كأنّ القسم فتحها أمس بموجتين بالدوالّ نفسها
 * التي يكتب بها الخادمُ الحقيقي (createShareLink / createInstructorRequest):
 *   • الموجة الأولى: المدرّب 29 — فتح رابطه ولم يختر بعد.
 *   • الموجة الثانية: المدرّب 30 — وصله الرابطُ ولم يفتحه.
 * ولكلٍّ منهما مقررٌ مسموحٌ من الشعب الشاغرة («هيئة تدريسية») في جدول الفصل.
 *
 * يُبذر داخل صندوق الزائر وحده (Repository.isDemoRequest)، مرةً واحدةً (لا يكرّر)، ولا يلمس بيانات الجامعة.
 */
import { Repository } from "../db/repository";
import { DEMO_TA_INSTRUCTOR_IDS } from "../db/demoSandbox";
import { placeholderInstructorIds } from "./core/smartImport";
import { taPhaseId } from "./core/instructorRequests";
import { DEMO_STORY_SCOPE } from "./core/demo";
import { vacantSections, type TaPhaseDoc } from "../utils/taPhase";

const HOUR = 3_600_000;

export async function seedDemoTrainingPhase(): Promise<void> {
  if (!Repository.isDemoRequest()) return;
  const { collegeId, sectionId, termId } = DEMO_STORY_SCOPE;
  const id = taPhaseId(collegeId, sectionId, termId);
  if (await Repository.getFeatureDoc<TaPhaseDoc>("taPhases", id)) return;
  const [instructors, rows] = await Promise.all([
    Repository.getInstructors(termId),
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
  ]);
  const vacant = vacantSections(rows as any, placeholderInstructorIds(instructors as any));
  const [firstTa, secondTa] = DEMO_TA_INSTRUCTOR_IDS;
  const now = Date.now();
  const iso = (offsetHours: number) => new Date(now + offsetHours * HOUR).toISOString();
  /* الشعبُ الشاغرة بالترتيب الثابت: لكلّ مدرّبٍ مقررُها، وإن قلّت الشعبُ فالأول للاثنين. */
  const courseFor = (n: number) => vacant[Math.min(n, vacant.length - 1)]?.courseId;
  const allowed: Record<string, number[]> = {};
  [firstTa, secondTa].forEach((ta, n) => { const course = courseFor(n); if (course) allowed[String(ta)] = [course]; });
  const doc: TaPhaseDoc = {
    id, AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    openedAt: iso(-26), openedBy: "رئيس القسم (عرض تجريبي)", closesAt: iso(24 * 4), reminderHours: 24, allowedCourses: allowed,
    waves: [
      { n: 1, instructorIds: [firstTa], sendAt: iso(-26), sentAt: iso(-26) },
      { n: 2, instructorIds: [secondTa], sendAt: iso(-14), sentAt: iso(-14) },
    ],
  };
  await Repository.saveFeatureDoc("taPhases", id, doc);
  for (const wave of doc.waves) {
    for (const instructorId of wave.instructorIds) {
      const link = await Repository.createShareLink({
        AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, label: `مرحلة التدريب — ${instructorId}`,
        expiresAt: iso(24 * 30), SystemUserId: 0, userName: "", showInstructors: false, kind: "request", AdInstructorId: instructorId,
      } as any);
      await Repository.createInstructorRequest({
        AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdInstructorId: instructorId,
        linkId: link.id, window: { opensAt: wave.sentAt!, closesAt: doc.closesAt }, source: "draft", status: "sent", linkMode: "ta",
        items: [], ...(instructorId === firstTa ? { linkOpenedAt: iso(-20) } : {}),
        timeline: [{ kind: "link-created", at: wave.sentAt!, by: "القسم", detail: `🎓 مرحلة التدريب · موجة ${wave.n}` }],
      } as any);
    }
  }
}
