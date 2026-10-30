/**
 * ── شاراتُ المقرر: قاعدةٌ واحدة، وكلُّ ما ينطبق، بترتيبٍ ثابت ─────────────────
 *
 * ملاحظةُ المالك: «مهارات تكنولوجيا التعليم» متطلبُ كليةٍ وفي صحيفة 2026 معاً، فكانت
 * القائمةُ تُظهر «متطلب كلية» وحدها. المقررُ قد يحمل أكثرَ من وسم، فتُعرض كلُّها هنا،
 * وبالترتيب نفسه في كل شاشة:
 *
 *   ١. الصحيفة      «صحيفة 2026» (من /api/plan-badges)، وإلا «🆕 صحيفة جديدة» لمقررٍ
 *                   في الصحيفة الجديدة وحدها لا يُعرف اسمُ صحيفته.
 *   ٢. نوعُ المتطلب «متطلب كلية» · «متطلب جامعة» · «متطلب قسم» · «اختياري».
 *                   «إجباري» لا يُوسم: هو الأصل في كل مقرر (CURRICULUM_SHEET_RULES §١٠).
 *   ٣. الوصول       «🔒 لم نصل بعد» — في الشاشات التي تعرض حكم الوصول أصلاً.
 *
 * ملفٌّ خالصٌ بلا React: يقرؤه مكوّنُ الواجهة (CourseTags) وبطاقةُ الأستاذ في الخادم.
 */

export type CourseTagKey = "sheet" | "kind" | "reach";
export type RequirementKind = "college" | "university" | "department" | "elective";

export const COURSE_TAG_ORDER: readonly CourseTagKey[] = ["sheet", "kind", "reach"];
export const REQUIREMENT_LABEL: Record<RequirementKind, string> = {
  college: "متطلب كلية",
  university: "متطلب جامعة",
  department: "متطلب قسم",
  elective: "اختياري",
};
export const NEW_SHEET_TAG = "🆕 صحيفة جديدة";
export const REACH_LOCKED_TAG = "🔒 لم نصل بعد";
/** فاصلُ الوسوم في نصّ خيار القائمة (SearchableSelect.badge). */
export const COURSE_TAG_SEP = " · ";

export interface CourseTag {
  key: CourseTagKey;
  label: string;
  /** يظهر في الطباعة؟ تصميمُ التقارير المطبوعة مجمّد: الصحيفةُ ومتطلبُ الخدمة كما كانا، ولا وسمَ جديد. */
  print: boolean;
}

export interface CourseTagFacts {
  /** اسمُ الصحيفة كما تحسبه /api/plan-badges («صحيفة 2026»). */
  sheet?: string | null;
  /** من الصحيفة الجديدة وحدها (حين لا يُعرف اسمُ صحيفته). */
  newSheet?: boolean;
  kind?: RequirementKind | null;
  /** النوعُ آتٍ من صحائف أقسامٍ أخرى (مقرر خدمة) — هو ما كانت تطبعه الشارةُ قبل. */
  service?: boolean;
  reachLocked?: boolean;
}

const isKind = (value: unknown): value is RequirementKind =>
  value === "college" || value === "university" || value === "department" || value === "elective";

/** كلُّ وسوم المقرر بترتيبها الثابت: الصحيفة ← نوعُ المتطلب ← الوصول. */
export function courseTagsOf(facts: CourseTagFacts | null | undefined): CourseTag[] {
  const tags: CourseTag[] = [];
  const sheet = String(facts?.sheet || "").trim() || (facts?.newSheet ? NEW_SHEET_TAG : "");
  if (sheet) tags.push({ key: "sheet", label: sheet, print: true });
  if (isKind(facts?.kind)) tags.push({ key: "kind", label: REQUIREMENT_LABEL[facts!.kind!], print: Boolean(facts?.service) });
  if (facts?.reachLocked) tags.push({ key: "reach", label: REACH_LOCKED_TAG, print: false });
  return tags;
}

/** الوسومُ نصّاً واحداً لخيار القائمة: «صحيفة 2026 · متطلب كلية». */
export function courseTagsText(tags: readonly CourseTag[]): string | undefined {
  return tags.map(tag => tag.label).join(COURSE_TAG_SEP) || undefined;
}

const KIND_BY_LABEL = new Map<string, RequirementKind>(Object.entries(REQUIREMENT_LABEL).map(([kind, label]) => [label, kind as RequirementKind]));

/** العكس: نصُّ الخيار إلى وسومه، مرتّبةً (والقديمُ «متطلب» وحده = «متطلب كلية»). */
export function parseCourseTagsText(text: string | null | undefined): CourseTag[] {
  const facts: CourseTagFacts = {};
  for (const raw of String(text || "").split(COURSE_TAG_SEP)) {
    const part = raw.trim();
    if (!part) continue;
    if (part === REACH_LOCKED_TAG) facts.reachLocked = true;
    else if (KIND_BY_LABEL.has(part)) { facts.kind = KIND_BY_LABEL.get(part)!; facts.service = facts.kind === "college" || facts.kind === "university"; }
    else if (part === "متطلب") { facts.kind = "college"; facts.service = true; }
    else if (!facts.sheet) facts.sheet = part;
  }
  return courseTagsOf(facts);
}

/** نوعُ القاعدة في الصحيفة إلى وسمه: «إجباري» بلا وسم. */
export function requirementKindOfRule(kind: unknown): RequirementKind | null {
  if (kind === "college" || kind === "university" || kind === "elective") return kind;
  return null;
}

/**
 * نوعُ مقررٍ في صحائف قسمه الحيّة: القاعدةُ الحاكمة أولاً — الجديدةُ الفعّالة قبل الانتقالية — ثم يُقرَّر الوسم منها.
 * فـ«إجباري» في الجديدة يمحو «اختياري» الانتقالية (لا يُبحث عن أول قاعدةٍ لها وسم).
 */
export function authoritativeRequirementKind(rules: ReadonlyArray<{ kind?: unknown; active: boolean }>): RequirementKind | null {
  const ruling = rules.find(rule => rule.active) || rules[0];
  return ruling ? requirementKindOfRule(ruling.kind) : null;
}

/* ── الشكلُ نفسه في صفحات الخادم (بطاقة الأستاذ ومرحلة التدريب) ─────────────────────────────────
   الصحيفة ثم نوعُ المتطلب في سطرٍ واحد، بالنصوص أعلاه. «لم نصل بعد» في البطاقة سطرٌ مستقلٌّ بسببه تحت
   المقرر (tcCourseLock) فلا يتكرّر وسماً. يقرأ من بيانات الصفحة: planBadges و courseKinds («قسم:مقرر» ← قيمة)
   و serviceCourses (قائمة «قسم:مقرر»). هنا لا في ملفٍّ خادميّ: الملفُّ بلا استيراد فيُقرأ من الخادم والواجهة والاختبار. */
export const COURSE_TAGS_CSS = `.ctags{display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;margin-inline-start:7px;vertical-align:middle;max-width:100%}
.ctags>.sk-plan-tag,.ctags>.req-tag{margin:0!important}`;

export const COURSE_TAGS_JS = `var CTAG_KIND=${JSON.stringify(REQUIREMENT_LABEL)};
function courseTagsHtml(cid,sid){var key=Number(sid)+":"+Number(cid),sheet=((data&&data.planBadges)||{})[key]||"",kind=((data&&data.courseKinds)||{})[key]||(((data&&data.serviceCourses)||[]).indexOf(key)>=0?"college":""),h="";
 if(sheet)h+='<span class="sk-plan-tag">'+esc(sheet)+'</span>';
 if(kind&&CTAG_KIND[kind])h+='<i class="req-tag">'+esc(CTAG_KIND[kind])+'</i>';
 return h?'<span class="ctags">'+h+'</span>':""}`;
