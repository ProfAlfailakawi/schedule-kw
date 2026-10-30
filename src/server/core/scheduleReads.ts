/**
 * ── قراءةُ الجدول بحسب القارئ والفصل ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { termHasEnded } from "../../utils/termSequence";
import type { AdTerm, FSchedule } from "../../types";
import { chooseHomeTerm, type HomeTermChoice } from "../../utils/homeTerm";
import { expandScopeSections } from "../readScope";
import { finalSourceFor, type Finality } from "../../utils/finality";
import { roleDefinition } from "../../utils/academicRoles";
import type { AuthenticatedRequest } from "./auth";
import { filterByScope, isScopeAllowed } from "./scope";

/**
 * The scoped read, shaped by who is asking.
 *
 * A department coordinator's account already says which sections are theirs, so
 * a request with no section filter must not scan the whole university term and
 * throw the surplus away — it reads the handful of sections the account owns,
 * which is the same answer at a fraction of the weight. The administrator keeps
 * the wide read, because for them the wide read is the answer.
 */
/**
 * ── العميد يرى الجدولَ النهائي وحده ──────────────────────────────────────────
 *
 * العميد والعميد المساعد لا يتابعان المسوّدة: يريان كلَّ قسمٍ كما قبِله
 * التسجيل آخرَ مرّة. فقسمٌ معتمدٌ الآن يُقرأ حيّاً — لأن أيَّ تعديلٍ بعد القبول
 * يعيده للتسجيل فوراً — وقسمٌ عاد للتسجيل بعد قبولٍ سابق يُقرأ من نسخة ذلك
 * القبول، وقسمٌ لم يُقبل قطّ لا يظهر.
 */
export function readsFinalSchedulesOnly(req: AuthenticatedRequest): boolean {
  const id = roleDefinition(req.user?.Role).id;
  return !req.user?.IsAdminUser && (id === "dean" || id === "viceDean");
}

/**
 * الفصلُ منتهٍ؟ أُغلق صراحةً أو انقضت نافذته (القاعدة المستقرّة: termHasEnded).
 */
export async function termEndedForReading(termId: number): Promise<boolean> {
  const term = (await Repository.getTerms()).find(item => Number(item.AdTermId) === Number(termId));
  return Boolean(term && (term.AdTermClosed === true || termHasEnded(term as any)));
}

async function finalRowsWithFinality(rows: FSchedule[], termId: number): Promise<{ rows: FSchedule[]; finality: Record<string, Finality> }> {
  const [approvals, termEnded] = await Promise.all([Repository.getScheduleApprovalsForTerm(termId), termEndedForReading(termId)]);
  const byScope = new Map<string, typeof approvals[number]>(approvals.map(item => [`${Number(item.AdCollegeId)}:${Number(item.AdSectionId)}`, item]));
  const groups = new Map<string, FSchedule[]>();
  for (const row of rows) {
    const key = `${Number(row.AdCollegeId || 0)}:${Number(row.AdSectionId || 0)}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const out: FSchedule[] = [];
  const finality: Record<string, Finality> = {};
  for (const [key, live] of groups) {
    const source = finalSourceFor(byScope.get(key), termEnded);
    if (source.kind === "none") continue;
    if (source.kind === "live") { out.push(...live); finality[key] = source.finality; continue; }
    const version = await Repository.getScheduleVersionById(source.versionId);
    if (version?.rows?.length) { out.push(...(version.rows as FSchedule[])); finality[key] = "accepted"; }
    else if (termEnded) { out.push(...live); finality[key] = "historical"; }
  }
  return { rows: out, finality };
}

export async function finalRowsOnly(rows: FSchedule[], termId: number): Promise<FSchedule[]> {
  return (await finalRowsWithFinality(rows, termId)).rows;
}

/**
 * `out.finality` — لمن يرى النهائيَّ وحده: صفةُ كل قسمٍ ظهر («accepted» أو
 * «historical»)، ليقول التقرير أيَّها معتمدٌ وأيَّها منفَّذٌ قبل دورة الاعتماد.
 */
export async function readSchedulesForRequest(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number, out?: { finality?: Record<string, Finality> }): Promise<FSchedule[]> {
  const rows = await readLiveSchedulesForRequest(req, collegeId, sectionId, termId);
  if (!readsFinalSchedulesOnly(req)) return rows;
  const final = await finalRowsWithFinality(rows, termId);
  if (out) out.finality = final.finality;
  return final.rows;
}

/**
 * ── كل ما في نطاق القارئ لفصلٍ واحد ─────────────────────────────────────────
 *
 * البحث ولوحة البداية وقائمة الأساتذة كانت تجمع أرقامَ الأقسام من صفوف النطاق
 * الخام، فيسقط صفُّ «الكلية كلها» (قسم صفر) ويرى العميدُ ومساعدُه لا شيء.
 * هنا تُشتقّ الأقسامُ من الحَكَم (`expandScopeSections`)، وتُقرأ الكليةُ
 * المغطّاة كاملةً بقراءةٍ واحدة. ومن يقرأ النهائيَّ وحده (العميد) يُعطى النهائي.
 */
export async function scopeSectionIdsFor(req: AuthenticatedRequest): Promise<Set<number>> {
  const sections = await Repository.getSections();
  return expandScopeSections(sections, (collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId));
}

export async function readLiveSchedulesForRequest(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number): Promise<FSchedule[]> {
  if (!req.user?.IsAdminUser && !sectionId) {
    /* نطاقُ الكلية كاملةً (قسمٌ صفر) يُقرأ بالكلية: العميد لا يملك قائمةَ أقسامٍ
       في نطاقه، يملك الكلية. وكانت القراءة تُسقط الصفر فلا يرى شيئاً. */
    let wholeColleges = [...new Set((req.scopes || [])
      .filter(scope => Number(scope.AdSectionId) === 0 && (!collegeId || Number(scope.AdCollegeId) === collegeId))
      .map(scope => Number(scope.AdCollegeId)).filter(Boolean))];
    /* ومن نطاقُه كلُّ الكليات لا يُقرأ له الفصلُ كلُّه بلا اختيار: يختار كليةً. */
    if (!collegeId && wholeColleges.length > 1) wholeColleges = [];
    const scopeSectionIds = [...new Set((req.scopes || [])
      .filter(scope => !collegeId || Number(scope.AdCollegeId) === collegeId)
      .filter(scope => !wholeColleges.includes(Number(scope.AdCollegeId)))
      .map(scope => Number(scope.AdSectionId)).filter(Boolean))];
    const groups = await Promise.all([
      ...wholeColleges.map(id => Repository.getSchedulesByScope({ collegeId: id, termId })),
      ...scopeSectionIds.map(scopeSectionId => Repository.getSchedulesByScope({ sectionId: scopeSectionId, termId })),
    ]);
    return filterByScope(req, groups.flat());
  }
  return filterByScope(req, await Repository.getSchedulesByScope({ collegeId, sectionId, termId }));
}

/* ── المقرر المؤرشف لا يُوضع في جدولٍ حالي — بأي باب ──────────────────────
   الإضافة والنسخ والاستيراد ترفض مقرراً أُرشف أكاديمياً، و«بداية الفصل» كانت
   تنسخه كما هو من الفصل السابق، فيعود المقرر الذي أُخرج من الخطة إلى جدول
   الفصل الجديد من الباب الخلفي. القراءة هنا واحدة يستعملها النسخ وبداية الفصل. */
export async function splitArchivedCourseRows<T extends { AdCourseId?: unknown }>(rows: T[], sectionId: number): Promise<{ operational: T[]; archived: T[] }> {
  const operationalIds = await Repository.getOperationalCourseIds(sectionId);
  const operational: T[] = [], archived: T[] = [];
  for (const row of rows) (operationalIds.has(Number(row.AdCourseId)) ? operational : archived).push(row);
  return { operational, archived };
}

/**
 * ── ما يراه القارئ من فصلٍ في لوحة البداية ──
 *
 * القراءةُ نفسها التي تعرضها اللوحة: الإدارةُ الفصلَ كلَّه، وغيرُها أقسامَ نطاقه
 * (والعميدان النهائيَّ وحده) ومواعيدَه هو إن كان أستاذاً. `scopedRaw` قبل تصفية
 * النهائي، ليُعرف أن الفصل «ينتظر الاعتماد» لا أنه فارغ.
 */
export async function homeRowsFor(req: AuthenticatedRequest, termId: number, sectionIds?: Set<number>): Promise<{ all: FSchedule[]; scopedRaw: FSchedule[]; scoped: FSchedule[]; personal: FSchedule[]; visible: number }> {
  const all = termId ? await Repository.getSchedulesByScope({ termId }) : [];
  if (req.user?.IsAdminUser) return { all, scopedRaw: all, scoped: all, personal: [], visible: all.length };
  const own = sectionIds || await scopeSectionIdsFor(req);
  const scopedRaw = all.filter(row => own.has(Number(row.AdSectionId)));
  const scoped = readsFinalSchedulesOnly(req) ? await finalRowsOnly(scopedRaw, termId) : scopedRaw;
  const linked = Number(req.user?.AdInstructorId || 0);
  const personal = linked ? all.filter(row => row.AdInstructorId === linked) : [];
  return { all, scopedRaw, scoped, personal, visible: scoped.length + personal.length };
}

/**
 * فصلُ لوحة البداية لهذا القارئ (src/utils/homeTerm.ts): اختيارُه الصريح، وإلا
 * الجاري تشغيلياً، وإلا أحدثُ فصلٍ له فيه ما يُرى.
 */
export async function resolveHomeTerm(req: AuthenticatedRequest, terms: AdTerm[], requestedTermId: number, sectionIds?: Set<number>): Promise<HomeTermChoice> {
  const own = req.user?.IsAdminUser ? undefined : (sectionIds || await scopeSectionIdsFor(req));
  return chooseHomeTerm(terms as any, requestedTermId, async termId => (await homeRowsFor(req, termId, own)).visible);
}
