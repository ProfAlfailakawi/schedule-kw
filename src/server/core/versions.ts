/**
 * ── نسخُ النطاق قبل الكتابة وبعدها، وتأكيدُ الاستبدال ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import { onSchedulesInvalidated } from "../../db/referenceCache";
import type { WholesaleAction } from "../../utils/approvalWorkflow";
import { describeScopeChanges, fingerprintOfSignatures, replacementLoss, scopeBase, scopeSignatures, type ScopeBase } from "../../utils/scopeFingerprint";
import { AR, countOf } from "../../utils/arabicCount";
import type { AuthenticatedRequest } from "./auth";

/**
 * ── ما بعد التغيير هو أساسُ التراجع عنه ────────────────────────────────
 * النسخة تُؤخذ قبل التغيير الذي تحميه. فحين يُطلب التراجع لاحقاً، السؤال
 * ليس «هل تغيّر الجدول منذ النسخة؟» — تغيّر، وهذا هو التغيير نفسه — بل «هل
 * تغيّر شيءٌ آخر بعده؟». فيُسجَّل الجدولُ كما صار، ويُقارن به عند الاسترجاع
 * (scopeOverwriteRefusal).
 *
 * و«كما صار» يُحسب من الصفوف التي كتبها الطلب نفسه، داخل الطلب وقبل الردّ
 * (recordVersionAfter) — لا بإعادة قراءة النطاق بعد انتهاء الردّ: تلك القراءة
 * كانت تلتقط تعديلَ زميلٍ وقع بينهما، فيُحسب من «ما صار» بعد عمليتنا، ثم
 * يمحوه التراجعُ بلا سؤال. ومن لا يكتب صفوفاً (قرارات الاعتماد) يقول
 * `{ unchanged: true }` فيكون أساسُها ما التُقط.
 */
export async function captureScopeVersion(req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number, label: string, source: "manual"|"draft"|"publish"|"undo"|"copy"|"import" = "manual", options: { unchanged?: boolean } = {}) {
  if (!req.user) return undefined;
  /* النسخةُ شاهدٌ على الجدول كما هو الآن، فتُقرأ من المخزَّن لا من ذاكرة القراءة:
     لقطةٌ من الذاكرة كانت تحفظ الحالةَ التي قبل آخر نشرٍ أو تراجع، باسمٍ يقول غير ذلك. */
  const rows = await Repository.getSchedulesByScope({ collegeId, sectionId, termId }, { fresh: true });
  const version = await Repository.createScheduleVersion({
    SystemUserId: Number(req.user.SystemUserId), userName: String(req.user.Name || req.user.SystemUserLogin || ""),
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, label, source, rows
  });
  if (options.unchanged) await recordVersionAfter(version, rows);
  return version;
}

/** «ما صار» بعد العملية، من صفوفها هي: دالّةٌ على ما قبلها، أو الصفوف المكتوبة نفسها. */
export async function recordVersionAfter(
  version: { id?: string; rows?: any[] } | undefined,
  after: any[] | ((before: any[]) => any[]),
): Promise<void> {
  if (!version?.id) return;
  const rows = typeof after === "function" ? after(version.rows || []) : after;
  try { await Repository.setScheduleVersionBase(version.id, scopeBase(rows)); }
  catch (error) { console.error("[versions] تعذّر تسجيل أساس النسخة:", error instanceof Error ? error.message : error); }
}

/* ── «x-schedule-confirm» قد يحمل أكثر من موافقة ───────────────────────────
   «publish» أو «restore» تقول «أريد هذا الفعل»، و«overwrite-newer» تقول «وأعرف
   أنه سيمحو ما تغيّر بعد أساسه». تُرسلان معاً مفصولتين بفاصلة. */
export function confirmTokens(req: AuthenticatedRequest): Set<string> {
  return new Set(String(req.get("x-schedule-confirm") || "").split(",").map(token => token.trim()).filter(Boolean));
}

/**
 * ── لا يُمحى ما تغيّر بعد الأساس دون أن يُسمّى ─────────────────────────────
 * The live scope against the base a draft or version was built on. Equal, or no
 * base recorded (older objects): nothing to say. Different, and the caller has
 * not said «overwrite-newer»: a refusal that lists what would be lost.
 */
export async function scopeOverwriteRefusal(
  req: AuthenticatedRequest, collegeId: number, sectionId: number, termId: number, base: ScopeBase,
): Promise<{ error: string; code: string; changes: string[]; total: number } | null> {
  if (!base?.baseSignatures || !base.baseFingerprint) return null;
  if (confirmTokens(req).has("overwrite-newer")) return null;
  /* «N تغييراً ستُمحى» عددٌ يقرّر به الإنسان أن يمحو: يُحسب على الجدول الحيّ الآن. */
  const live = await Repository.getSchedulesByScope({ collegeId, sectionId, termId }, { fresh: true });
  if (fingerprintOfSignatures(scopeSignatures(live)) === base.baseFingerprint) return null;
  const courses = await Repository.getCoursesBySection(sectionId).catch(() => [] as any[]);
  const nameOf = new Map((courses as any[]).map(course => [Number(course.AdCourseId), String(course.CourseName || "")]));
  const changes = describeScopeChanges(base.baseSignatures, live, id => nameOf.get(id) || "");
  /* Only new ids for the very same appointments: nothing would be erased. */
  if (!changes.length) return null;
  return {
    error: `تغيّر الجدول بعد أن أُخذت هذه النسخة: ${countOf(changes.length, AR.change)} ستُمحى إن تابعت. لم يُكتب شيء.`,
    code: "scope-changed-since-base",
    changes: changes.slice(0, 40),
    /* القائمة تُقصّ عند أربعين سطراً؛ العددُ الكامل يُرسل وحده كي لا يقول الحوار «40» عن مئة. */
    total: changes.length,
  };
}

/* ── الموعد النهائي يقيس أثر الاستبدال، لا اسم الزر ─────────────────────────
   استيرادُ ملفٍّ ونسخُ فصلٍ تسليمٌ شامل بطبيعته. أما نشرُ مسودةٍ عادية أو
   استرجاعُ نسخةٍ أو التراجعُ عن قرار فيُقاس بما يمحوه فعلاً من الجدول الحيّ،
   بقاعدة الحذف الجماعي نفسها (isWholesaleChange). */
export async function replacementAction(
  collegeId: number, sectionId: number, termId: number, nextRows: any[], kind?: "import" | "copy-term",
): Promise<WholesaleAction> {
  if (kind) return { kind };
  const live = await Repository.getSchedulesByScope({ collegeId, sectionId, termId }, { fresh: true });
  const loss = replacementLoss(live, nextRows);
  return { kind: "bulk-delete", deleting: loss.deleting, total: loss.total };
}

/* ── قائمة النسخ لا تحمل صفوفها ──────────────────────────────────────────
   في Firestore تُقرأ قائمة النسخ بلا لقطاتها عمداً (getScheduleVersions)،
   فمن يقارن بها يجد نسخةً فارغة: «الملخص» قال إن كل موعد تغيّر، وسجلّ الأستاذ
   قال عن كل محاضرة «أُضيفت». ما يحتاج اللقطة يطلبها بمعرّفها. */
export async function hydrateVersionRows<T extends { id: string; rows?: any[]; rowCount?: number }>(versions: T[]): Promise<T[]> {
  return Promise.all(versions.map(async version => {
    /* rowCount 0 is a genuinely empty snapshot; an older document without a
       count is fetched too, since an empty list there proves nothing. */
    if ((version.rows && version.rows.length) || version.rowCount === 0) return version;
    const full = await Repository.getScheduleVersionById(version.id).catch(() => undefined);
    return full ? { ...version, rows: full.rows || [] } : version;
  }));
}


// --- LIVING SCHEDULE LAYER --------------------------------------------------
// All routes below are additive. They read the verified schedule tables and either
// return analysis or create a draft/memory record; none bypasses the existing
// schedule CRUD validation or publication gate.
/**
 * ── ردّ التحليل يُحسب مرة، لا مرة لكل سائل ──────────────────────────────────
 *
 * The living reading hydrates the university's whole term and runs six
 * analyses over it. Measured on production, a cold run cost the single-threaded
 * server up to 27 seconds — and every viewer of the same term paid it again
 * after the row-cache turned over, even though the answer had not changed.
 *
 * The finished JSON is therefore kept per scope and served as-is. Nothing new
 * decides when it dies: it is cleared by exactly the two signals that already
 * clear every schedule cache in this file — a write on this instance
 * (onSchedulesInvalidated) and the cross-instance beacon below — plus a short
 * TTL as the same parachute the row cache wears. Demo sessions bypass it
 * entirely: their world is per-visitor and must never leak between sandboxes.
 */
export const livingResponseCache = new Map<string, { at: number; body: string }>();
onSchedulesInvalidated(() => livingResponseCache.clear());
