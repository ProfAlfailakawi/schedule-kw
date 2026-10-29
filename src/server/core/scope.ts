/**
 * ── نطاقُ القارئ: الكلية والقسم وما يُسمح له برؤيته ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { departmentFamily } from "../../utils/sectionLabel";
import { isReadOnlyRole, roleDefinition } from "../../utils/academicRoles";
import type { AuthenticatedRequest } from "./auth";

// Check if section/college is in user's academic scopes
export function isScopeAllowed(req: AuthenticatedRequest, collegeId: number, sectionId: number): boolean {
  if (!req.user) return false;
  if (req.user.IsAdminUser) return true;
  /**
   * ── «كل الكليات» إذنٌ، لا لقطةٌ تشيخ ──────────────────────────────────────
   *
   * صفةُ التسجيل نطاقُها الجامعة كلها، وكان ذلك يُكتب صفّاً لكل كليةٍ موجودة
   * يوم الحفظ. والكلياتُ تُنشأ بعده: كليةٌ أُضيفت أمس لا صفَّ لها، فيُردّ عنها
   * رئيسُ التسجيل — بصمت، وشاشتُه تعده بأن اللاحق مشمول.
   *
   * فصارت الصفةُ نفسها هي الإذن. والصفوفُ تبقى تُكتب لأن شاشاتٍ أخرى تقرؤها
   * لتعرف أقسامَ الحساب، لكنها لم تعد مصدرَ الحكم — فلا يشيخ الحكمُ بشيخوختها.
   */
  if (roleDefinition(req.user.Role).scopeMode === "allColleges") return true;
  if (!req.scopes) return false;
  // If sectionId is 0, we check if user has access to ANY section in this college
  if (sectionId === 0) {
    return req.scopes.some(s => s.AdCollegeId === collegeId);
  }
  /**
   * ── «الكلية كلها»: صفٌّ واحد بقسم صفر ───────────────────────────────────
   *
   * صفوف النطاق تُكتب دائماً بقسمٍ حقيقي — شاشة النطاقات ترفض الصفر صراحةً —
   * فالصفر لم يكن له معنى في هذا الجدول، وهذه الدالّة لم تكن تعرفه: كانت تطلب
   * تطابقاً حرفياً على رقم القسم، فصفٌّ بقسمٍ صفر لا يُجيز قسماً واحداً.
   *
   * والصفات التي نطاقها كليةٌ كاملة — العميد ومساعده وعمداء التسجيل — تحتاج
   * أن تقرأ كل أقسام كليتها، بما يُنشأ منها غداً. فكتابةُ صفٍّ لكل قسم كانت
   * ستشيخ عند أول قسمٍ جديد، ويعود المدير ليضيفه يدوياً.
   *
   * فصار الصفر يعني «الكلية كلها» — لكن لهذه الصفات وحدها. والقيد مقصود: صفٌّ
   * بقسمٍ صفر قد يكون موجوداً في بيانات سنواتٍ مضت لحسابٍ لا علاقة له بهذا،
   * وتوسيعُ صلاحيته لأنه صادف الشكلَ نفسه توسيعٌ صامت لا يقبله أحد.
   */
  const scopeMode = roleDefinition(req.user.Role).scopeMode;
  if (scopeMode === "college" || scopeMode === "allColleges") {
    if (req.scopes.some(s => s.AdCollegeId === collegeId && Number(s.AdSectionId) === 0)) return true;
  }
  return req.scopes.some(s => s.AdCollegeId === collegeId && s.AdSectionId === sectionId);
}

// Filter arrays based on allowed user scopes
/**
 * ── سؤالٌ واحد، جوابٌ واحد ──────────────────────────────────────────────────
 *
 * هذه الدالّة وأختُها `isScopeAllowed` تسألان الشيء نفسه: أيرى هذا الحسابُ هذا
 * القسم؟ وكانتا تجيبان بمنطقين منفصلين متطابقين — فلمّا تعلّمت إحداهما أن صفّاً
 * بقسمٍ صفر يعني الكلية كلها، بقيت الأخرى لا تعرفه.
 *
 * وأثرُ الافتراق ليس رفضاً ظاهراً بل أسوأ منه: العميد يمرّ من الحارس فلا يُردّ،
 * ثم تُصفّى بياناتُه هنا فتخرج فارغة. شاشةٌ تفتح بلا شيء، بلا رسالة، بلا سبب
 * ظاهر — وهو أعسرُ ما يُشخَّص.
 *
 * فصار الجواب من موضعٍ واحد. وأيُّ قاعدةِ نطاقٍ تُضاف غداً تُكتب مرّةً وتسري
 * على الاثنتين.
 */
export function filterByScope<T extends { AdCollegeId: number; AdSectionId: number }>(req: AuthenticatedRequest, list: T[]): T[] {
  if (!req.user) return [];
  if (req.user.IsAdminUser) return list;
  if (!req.scopes) return [];
  return list.filter(item => {
    const sectionId = Number(item.AdSectionId);
    /**
     * صفٌّ بقسمٍ صفر ليس سؤالاً عن الكلية.
     *
     * لِـ`isScopeAllowed` معنيان للصفر بحسب موضعه: صفرٌ في السؤال يعني «أله
     * شيءٌ في هذه الكلية؟» وهو سؤالُ شاشةٍ لا سؤالُ صفّ؛ وصفرٌ في صفّ النطاق
     * يعني «الكلية كلها» لصفاتها وحدها.
     *
     * ولمّا صارت التصفية تسأل الحارسَ نفسه، صار صفٌّ بياناتُه ناقصةُ القسم —
     * من ترحيلٍ قديم أو استيرادٍ بلا قسم — يدخل من باب المعنى الأول: يُسأل عنه
     * بصفر، فيُجاب «نعم» لكل من له أيُّ شيءٍ في تلك الكلية، أيّاً كانت صفته.
     * وهذا توسيعٌ لم يُقصد، وليس من عمل هذه الإضافة أن يقع.
     *
     * فالصفُّ الناقص يُطلب له تطابقٌ حرفيّ، كما كان قبل التوحيد تماماً.
     */
    if (sectionId <= 0) {
      return req.scopes!.some(s => s.AdCollegeId === Number(item.AdCollegeId) && Number(s.AdSectionId) === 0);
    }
    return isScopeAllowed(req, Number(item.AdCollegeId), sectionId);
  });
}

// Legacy FSchedule.fdetail stores weekday numbers, not display names:
// 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday.
export function legacyFDetail(days: { fsunday?: unknown; fmonday?: unknown; ftuesday?: unknown; fwednesday?: unknown; fthursday?: unknown }): string {
  return [
    days.fsunday && "1",
    days.fmonday && "2",
    days.ftuesday && "3",
    days.fwednesday && "4",
    days.fthursday && "5"
  ].filter(Boolean).join(",");
}

export function safeSystemUser(user: any) {
  const { SystemUserPass: _passwordHash, SystemUserPassVault: _passwordVault, ...safe } = user || {};
  return safe;
}

/** Read-only department analysis uses the established department family mapping. */
export async function intelligenceReadScopes(req: AuthenticatedRequest, collegeId: number, sectionId: number) {
  if ((req.query.analysisScope || req.body?.analysisScope) !== "department") return [{ collegeId, sectionId }];
  const sections = await Repository.getSections();
  return departmentFamily(sections, collegeId, sectionId)
    .filter(scope => isScopeAllowed(req, scope.collegeId, scope.sectionId));
}

export async function scopedScheduleUniverse(collegeId: number, sectionId: number, termId: number) {
  const [rows, universe] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId, sectionId, termId }),
    Repository.getSchedulesByScope({ termId })
  ]);
  return { rows, universe };
}

// --- INSTRUCTORS API ---

/**
 * The teaching register.
 *
 * The whole register is a hundred kilobytes and every screen was loading it to
 * name the dozen people who teach in one department. Passing `sectionId`
 * answers with the staff who actually appear in that department's term, which
 * is what a picker opens on; the full register is still one request away for
 * the moment someone searches beyond their own department; that search itself
 * returns at most forty matching people instead of the whole register.
 */
/**
 * ── بياناتُ الأستاذ الشخصية لا تصل القارئ ───────────────────────────────────
 *
 * صفاتُ الاطّلاع (العميدان، التسجيل، رئيس القسم) تفتح تقرير القسم (١٤) فتقرأ
 * دليلَ الأساتذة — وكان يصلها الرقمُ المدني والهاتف لكل أستاذ. لا عمل لها بهما:
 * لا تُنشئ أستاذاً ولا تطابق هويةً. فيُحذفان هنا، لكل مسارٍ يعيد الدليل.
 */
export function instructorsForReader<T extends { AdInstructorCivil?: string; AdInstructorMobile?: string }>(req: AuthenticatedRequest, list: T[]): T[] {
  if (req.user?.IsAdminUser || !isReadOnlyRole(req.user?.Role)) return list;
  return list.map(person => ({ ...person, AdInstructorCivil: "", AdInstructorMobile: "" }));
}
