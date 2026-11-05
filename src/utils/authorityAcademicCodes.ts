/**
 * Academic number rules for the Authority (SWRSCHA) timetable.
 *
 * The document's scientific-department key is NOT the local AdSectionCode by
 * itself. It is the college code followed by the local department code:
 *   college 01 + department 01 => 0101
 * and a course key is that four-digit department key + the three-digit course
 * number:
 *   0101 + 102 => 0101102
 *
 * The catalogue remains the authority. These helpers only reconcile the
 * document representation with the already-stored college/department/course
 * codes; they never invent a college, department or course identity.
 */
export const academicDigits = (value: unknown): string => String(value ?? "")
  .normalize("NFKC")
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .replace(/\D/g, "");

/**
 * رقم المقرر في الكتالوج كما يقارَن بما تطبعه الهيئة. ثلثا مقررات 0114 في كتالوج
 * الإنتاج مخزّنة بصفرها الأول ساقطاً (114101، نقلها جدول حوّلها أرقاماً)، وأمامها
 * صفوف كاملة (0114101) وقصيرة (101). الست خانات التي تبدأ بغير صفر مفتاح كامل فقد
 * صفره: كل مفاتيح الهيئة تبدأ بصفر الكلية (0x)، ولا يوجد مفتاح يبدأ بـ1.
 */
export function authorityCatalogueCourseDigits(value: unknown): string {
  const digits = academicDigits(value);
  return /^1\d{5}$/.test(digits) ? `0${digits}` : digits;
}

/** Return the document-level department key represented by this catalogue row. */
export function authorityDepartmentCode(collegeCode: unknown, sectionCode: unknown): string {
  const collegeRaw = academicDigits(collegeCode);
  /* The live catalogue commonly stores the BRANCH/site code (011, 012, 022,
     0420, 0520...) in AdCollegeCode, while SWRSCHA's scientific-department
     identity uses the two-digit COLLEGE authority printed separately in the
     header: 01, 02, 04, 05.... The first two digits are therefore the stable
     college authority boundary. This preserves Basic Education 011/012 as 01
     while correctly mapping Commercial Girls 022 -> 02, Technology Girls
     0420 -> 04, Nursing Girls 0520 -> 05, and the equivalent branches. */
  const college = !collegeRaw
    ? ""
    : collegeRaw.length >= 2
      ? collegeRaw.slice(0, 2)
      : collegeRaw.padStart(2, "0");
  const section = academicDigits(sectionCode);
  if (!section) return "";

  /* كلية التربية الأساسية (01) هي المسار الذهبي القائم — بنات وبنين — فلا
     نعيد تفسير أي كود كامل فيها. هذا يحافظ حرفياً على السلوك الذي يعمل الآن. */
  if (college === "01") {
    if (section.length >= 4 && section.startsWith(college)) return section;
    if (section.length <= 2) return `${college}${section.padStart(2, "0")}`;
    return section;
  }

  /* في الكليات الأخرى قد يحتفظ كتالوج النظام بهوية القسم المشتركة كما أُنشئت
     أصلاً تحت كلية أخرى (مثال: 0101 للتربية الإسلامية)، بينما SWRSCHA يطبع
     هوية الوثيقة بحسب كلية التقرير نفسها: 02 + 01 => 0201، 04 + 01 => 0401.
     أول رقمين ملك للكلية، وآخر رقمين هما القسم العلمي المحلي؛ لذلك نعيد ربط
     الكود ذي الأربع خانات بالكلية المختارة فقط، من دون تغيير هوية القسم المحلية.
     هذا لا يوسّع المطابقة بين الأقسام: 0201 لا يمكن أن يطابق 0202. */
  if (college.length === 2 && section.length === 4) {
    return section.startsWith(college) ? section : `${college}${section.slice(-2)}`;
  }

  // Some installations already store the complete document key in AdSectionCode.
  if (section.length >= 4 && (!college || section.startsWith(college))) return section;

  // SWRSCHA uses two digits for college + two digits for the scientific dept.
  // The live catalogue may store 1 instead of 01, so padding happens only at
  // the representation boundary; no catalogue identity is invented here.
  if (college.length === 2 && section.length <= 2) return `${college}${section.padStart(2, "0")}`;

  // Fail closed for unusual legacy codes: compare only the exact stored code.
  return section;
}

/**
 * ── رموز قسم التربية القديم (0114) ────────────────────────────────────────
 *
 * تقسيم قسم «علم التربية» القديم (14) إلى «الأصول والإدارة التربوية» (20) و«المناهج
 * وطرق التدريس» (21) لم يغيّر أرقام المقررات عند الهيئة: رأس الصفحة يطبع 0120 أو
 * 0121، والمقررات تحته مطبوعة 0114xxx، وقد تجاورها في الصفحة نفسها مقررات 0120xxx
 * (تقرير SWRSCHA للفصل الثاني 2026-2027). وهي القائمة الوحيدة التي تسمح بعبور رمز
 * قسم إلى قسم، ومصدرها ما طُبع لا قاعدة عامة: «كل ما يُطبع تحت الرأس مقبول» يعني
 * قبول أي خطأ طباعة أو تقرير مختلط، فكل زوج غير مذكور هنا يُرفض كما كان.
 *
 * قسم علم النفس (15) ورث بعض أرقام 14 أيضاً، لكن الملف لا يطبع تحته 0114 فلا يُضاف.
 */
const AUTHORITY_INHERITED_COURSE_PREFIXES:Readonly<Record<string,readonly string[]>>={
  "0120":["0114"],
  "0121":["0114"],
};

/** رموز المقررات التي يصح أن تُطبع تحت رأس هذا القسم: رمزه أولاً ثم الموروث. */
export function authorityCoursePrefixes(departmentCode: unknown): string[] {
  const department = academicDigits(departmentCode);
  return department ? [department, ...(AUTHORITY_INHERITED_COURSE_PREFIXES[department] || [])] : [];
}

/**
 * رقمٌ موروث يطابق صف كتالوج القسم القصير (101) بالخانات الثلاث فقط، ومن هنا لا
 * يُستعمل وحده: 0114464 القديم مقرر غير 0120464 الجديد (انظر sheetReconcile)،
 * فالمستدعي يشترط أن يوافق الاسمُ المطبوع اسمَ المقرر وألا يطبع الملف رقم القسم
 * نفسه بالذيل ذاته. والمفتاح الكامل لا يُعبَر: 0120101 في الكتالوج ليس 0114101.
 */
export function authorityInheritedCourseMatches(sourceCode: unknown, catalogueCourseCode: unknown, departmentCode: unknown): boolean {
  const source = academicDigits(sourceCode), course = authorityCatalogueCourseDigits(catalogueCourseCode), department = academicDigits(departmentCode);
  if (source.length !== 7 || !course || course.length > 3) return false;
  if (!(AUTHORITY_INHERITED_COURSE_PREFIXES[department] || []).includes(source.slice(0, 4))) return false;
  return source.slice(-3) === course.padStart(3, "0");
}

/** Compare a document department key to the current catalogue scope. */
export function authorityDepartmentMatches(sourceCode: unknown, collegeCode: unknown, sectionCode: unknown): boolean {
  const source = academicDigits(sourceCode);
  const local = academicDigits(sectionCode);
  const college = academicDigits(collegeCode);
  const composite = authorityDepartmentCode(collegeCode, sectionCode);
  if (!source) return false;

  // When the college is known, SWRSCHA's department identity is the composite
  // key (college + local scientific department). Accepting local `01` beside
  // expected `0101` would recreate the exact ambiguity that broke PDF import.
  if (college && composite) return source === composite;
  return source === local;
}

/**
 * Exact course-key reconciliation. The Arabic course name is intentionally not
 * accepted as identity evidence. The source number must identify the catalogue
 * row either in its stored representation or in SWRSCHA's full 7-digit form.
 */
export function authorityCourseCodeMatches(sourceCode: unknown, catalogueCourseCode: unknown, departmentCode: unknown): boolean {
  const source = academicDigits(sourceCode);
  const course = authorityCatalogueCourseDigits(catalogueCourseCode);
  const department = academicDigits(departmentCode);
  if (!source || !course) return false;
  if (source === course) return true;
  /* مقررٌ رقمه خانتان (99) تطبعه الهيئة بست خانات لا سبع: 013099 هو 0130 + 099. */
  if (source.length === 6 && department.length === 4 && source.startsWith(department))
    return authorityCourseCodeMatches(`${department}0${source.slice(4)}`, catalogueCourseCode, departmentCode);

  // Catalogue frequently stores only the three-digit course number (e.g. 102),
  // while SWRSCHA prints the complete key (e.g. 0101102).
  const tail = course.length >= 3 ? course.slice(-3) : course.padStart(3, "0");
  /* مفتاح الكتالوج الكامل (7 خانات) قد يحمل كلية أخرى أُنشئ تحتها أولاً
     (0101101 لمقرر يطبعه تقرير الكلية 02 بـ 0201101)، لكن القسم المحلي
     (الخانتان 3–4) جزء من الهوية: 0102102 مقرر قسم آخر، لا 0101102. */
  if (course.length === 7 && department.length === 4 && course.slice(2, 4) !== department.slice(2, 4)) return false;
  if (course.length >= 4 && course.length < 7) return false;
  if (department && source === `${department}${tail}`) return true;

  // A clean three-digit source is acceptable only against the same three-digit
  // catalogue number; uniqueness inside the selected department is checked by
  // the caller before a canonical row is chosen.
  return source.length === 3 && source === tail;
}

/**
 * ── رقم المقرر المعتمد: سبع خانات، ولا غيرها ─────────────────────────────
 *
 * ⚠️ قاعدةٌ ثابتة من مالك النظام: كل رقم مقرر يراه القارئ — تقريرٌ مطبوع، أو
 * استعلامٌ على الشاشة، أو ملف Excel — يُكتب بخاناته السبع كما تطبعه الهيئة:
 * الكلية (2) ثم القسم (2) ثم المقرر نفسه (3):
 *   01 + 09 + 105 => 0109105
 * والكتالوج يحفظ غالباً الخانات الثلاث وحدها (105)، فلا تُعرض CourseCode ولا
 * CourseCodeSnapshot مباشرةً، ولا AdCourseId أبداً (رقمٌ داخلي للنظام). يُمرَّر
 * الرمز المخزَّن ومفتاح القسم ذو الخانات الأربع (authorityDepartmentCode) إلى
 * هذه الدالة. وما لا يُبنى بثقة يُعاد كما خُزّن، فلا تُختلق هوية مقرر.
 * القاعدة مكتوبة في README (Standing Rules)، ويحرسها tests/course-number-seven-digit-audit.ts.
 */
export function authorityCourseCode(catalogueCourseCode: unknown, departmentCode: unknown): string {
  const stored = String(catalogueCourseCode ?? "").normalize("NFKC").trim();
  const course = academicDigits(stored);
  const department = academicDigits(departmentCode);
  // رمزٌ فيه غير الأرقام ليس رقم مقرر للهيئة: يُعرض كما هو ولا تُنتزع منه أرقام.
  if (!course || course.length !== stored.replace(/\s/g, "").length) return stored;
  if (department.length !== 4) return course;
  if (course.length <= 3) return `${department}${course.padStart(3, "0")}`;
  /* المفتاح الكامل من القسم نفسه ربما أُنشئ تحت كليةٍ أخرى أولاً، والهيئة تطبعه
     بكلية التقرير (0101101 يُطبع 0201101 في الكلية 02). أما مفتاح قسمٍ آخر
     فيبقى كما هو: 0102102 مقرر قسمٍ آخر لا يُعاد ربطه. */
  if (course.length === 7) return course.slice(2, 4) === department.slice(2, 4) ? `${department}${course.slice(-3)}` : course;
  return course;
}

/** Normalize a section value exactly as printed by SWRSCHA.
 *
 * Section numbering is not globally fixed. Older reports may print 501/502…
 * (and may legitimately skip a number), while newer reports can print 01/02…
 * or even 1 without a leading zero. The section cell is therefore source
 * identity, not a value that may be regenerated from row order.
 */
export function normalizeAuthoritySectionCode(value: unknown): string {
  const raw = String(value ?? "")
    .normalize("NFKC")
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .trim();
  if (!/^\d{1,4}$/.test(raw)) return "";
  if (Number(raw) <= 0) return "";
  return raw;
}

export function authoritySectionCodeLooksPlausible(value: unknown): boolean {
  return Boolean(normalizeAuthoritySectionCode(value));
}

/**
 * ترقيم شعب جدول الجهة — القاعدة المعتمدة عند المالك (أُعيدت 2026-09-26):
 * كل مقرر يبدأ من 501 ويتقدّم 502، 503… بترتيب ظهور صفوفه في المستند.
 *
 * خلية الشعبة في المسح هي الأكثر التصاقاً بجيرانها (المرجعي ورقم المقاعد)،
 * فقراءتها الخام («1504»، «50»، «3150») كانت تدخل الجدول هويةً حين حُفظت كما
 * قُرئت (13 سبتمبر). ما طُبع يبقى شاهداً في sourceSectionText يراه المراجع؛
 * أما الرقم الذي يُنشر فمولَّد من هوية المقرر وترتيب الصفوف — لا من OCR.
 * مقررٌ لم تثبت هويته لا يُعطى شعبة.
 */
export function assignAuthoritySections<T extends {
  AdCourseId?: unknown;
  SCode?: unknown;
  sourceOrder?: unknown;
  sourceSectionText?: unknown;
  referenceNumber?: unknown;
  importEvidence?: { section?: { method?: unknown } } | unknown;
}>(input: readonly T[]): T[] {
  const rows = input.map(row => ({ ...row })) as T[];
  const ordered = rows.map((row, index) => {
    const numericOrder = Number((row as any).sourceOrder);
    return { row, index, order: Number.isFinite(numericOrder) ? numericOrder : index };
  }).sort((a, b) => a.order - b.order || a.index - b.index);
  const nextByCourse = new Map<number, number>();
  /* شعبة بموعدين: الهيئة تطبع الموعد الثاني سطراً تحت الأول، والرقم المرجعي هو
     هوية الشعبة عندها، فمرجعيٌّ واحد لمقرر واحد شعبةٌ واحدة لا شعبتان. */
  const sectionByReference = new Map<string, string>();
  for (const item of ordered) {
    const courseId = Number((item.row as any).AdCourseId || 0);
    if (!Number.isFinite(courseId) || courseId <= 0) { (item.row as any).SCode = ""; continue; }
    const reference = String((item.row as any).referenceNumber ?? "").trim();
    const sectionKey = reference ? `${courseId}|${reference}` : "";
    const known = sectionKey ? sectionByReference.get(sectionKey) : "";
    if (known) { (item.row as any).SCode = known; continue; }
    const next = (nextByCourse.get(courseId) || 500) + 1;
    nextByCourse.set(courseId, next);
    (item.row as any).SCode = String(next);
    if (sectionKey) sectionByReference.set(sectionKey, String(next));
  }
  return rows;
}

/**
 * صف لم يُربط بمقرر، ورقمه مقروء بوضوح من طبقة نص PDF: الخلل في العضوية لا في
 * القراءة، فيُعرض ما طُبع (الرقم والاسم والشعبة) بدل «رقم المقرر غير واضح».
 * المسح مستثنى عمداً: ما يقرؤه OCR قد يكون أرقاماً ملتصقة، ولا يُعرض دليلاً.
 */
export function unlinkedCourseEvidence(row: {
  AdCourseId?: unknown; sourceReadMode?: unknown; sourceCourseCode?: unknown; sourceCourseText?: unknown; sourceSectionText?: unknown;
}): { code: string; name: string; section: string } | null {
  if (Number(row.AdCourseId || 0) || row.sourceReadMode !== "pdf-text") return null;
  const code = academicDigits(row.sourceCourseCode);
  if (code.length !== 6 && code.length !== 7) return null;
  return { code, name: String(row.sourceCourseText || "").trim(), section: normalizeAuthoritySectionCode(row.sourceSectionText) };
}

/**
 * خط أساس نسخة PDF يُحفظ بلا importEvidence.
 *
 * المسودة تحمل كل صف مرتين: الصفوف بعد المراجعة، والقراءة الأولى خط أساسٍ
 * للتقرير. وبرهان القراءة (importEvidence) نصوص عربية مطوّلة — نحو ثلاثة أرباع
 * وزن الصف. فمسحٌ من 117 صفاً بلغ 1,055,956 بايت فتجاوز حد الطلب (1 MiB)
 * ورُفض نشره برسالة عامة (2026-09-30). وخط الأساس لا يقرأ البرهان أصلاً:
 * التقرير يقارن الحقول والترتيب والمرجع، وإثبات أن الصف من المستند يُقرأ من
 * الجدول الحيّ لا من الأساس. فيُنزع منه هنا، في الطلب وفي الحفظ معاً.
 */
export function withoutImportEvidence<T extends object>(input: readonly T[]): T[] {
  return input.map(row => {
    const { importEvidence: _evidence, ...rest } = row as T & { importEvidence?: unknown };
    return rest as T;
  });
}
