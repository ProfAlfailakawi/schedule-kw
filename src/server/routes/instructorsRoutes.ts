/**
 * ── الأساتذة والزائرون والمندوبون ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response } from "express";
import { Repository } from "../../db/repository";
import { normalizeCivilId, validateCivilId } from "../../utils/civilId";
import { visitingByScope } from "../../utils/liveVisiting";
import { departmentFamilyResolver } from "../../utils/sectionLabel";
import { readConversionState, runVisitingConversion } from "../../db/visitingConversion";
import { storableMobile, whatsappNumber } from "../../utils/reachInstructor";
import { expandScopeSections } from "../readScope";
import { isFacultyPlaceholder, singleFacultyPlaceholder, withoutFacultyPlaceholderCivil } from "../../utils/placeholderInstructor";
import { isReadOnlyRole } from "../../utils/academicRoles";
import { foldInstructorText } from "../../utils/instructorIdentity";
import { type AuthenticatedRequest, requireAnyPermission, requirePermission } from "../core/auth";
import { dataContextCacheKey } from "../core/locations";
import { sortArabicNamed, sortTermsNewestServer } from "../core/ordering";
import { filterByScope, instructorsForReader, isScopeAllowed } from "../core/scope";
import { collegeFallbackInstructorIds, placeholderInstructorIds } from "../core/smartImport";
import { readLiveVisitingRoster } from "../core/visiting";

/**
 * ── الرقم المدني والهاتف لأهل القسم وحدهم ──────────────────────────────────
 *
 * دليلُ الأساتذة جامعيٌّ عمداً: القسمُ يُسند مقرّراً لأستاذٍ من كليةٍ أخرى،
 * فيبحث عنه بالاسم. لكنّ القائمة كانت تصل حسابَ القسم بالرقم المدني والهاتف
 * لكل موظّفٍ في الجامعة — بياناتٌ شخصية لأناسٍ لا صلة لقسمه بهم.
 *
 * فالحلقة: من درّس في نطاق القارئ (في أي فصل)، أو ضمّه دليلُ قسمٍ في نطاقه،
 * أو قائمةُ منتدبيه. هؤلاء يصلون كما هم — التقريرُ المطبوع يحمل رقمَهم
 * المدني. ومن سواهم يصل باسمه، وبآخر أربعة أرقامٍ من رقمه المدني فقط (يُفرَّق
 * بها بين اسمين متطابقين)، وبلا هاتف. الإدارةُ، وصاحبُ شاشة الأساتذة (٣)،
 * يرونه كاملاً؛ وصفاتُ الاطّلاع لا ترى الرقم أصلاً (instructorsForReader).
 */
const instructorCircleCache = new Map<string, { at: number; ids: Set<number> }>();
async function instructorCircleFor(req: AuthenticatedRequest): Promise<Set<number> | null> {
  if (!req.user || req.user.IsAdminUser || isReadOnlyRole(req.user.Role)) return null;
  const granted = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId));
  if (granted.map(Number).includes(3)) return null;
  const sections = await Repository.getSections();
  const own = expandScopeSections(sections, (collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId));
  const key = dataContextCacheKey(`${req.user.SystemUserId}:${[...own].sort((a, b) => a - b).join(",")}`);
  const hit = instructorCircleCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  const scopeRows = sections.filter(row => own.has(Number(row.AdSectionId)));
  const groups = await Promise.all(scopeRows.map(async row => {
    const [taught, directory] = await Promise.all([
      Repository.getInstructorsByScope(Number(row.AdSectionId), 0),
      Promise.all([
        Repository.getDepartmentDelegates(Number(row.AdCollegeId), Number(row.AdSectionId)),
        Repository.getDepartmentFaculty(Number(row.AdCollegeId), Number(row.AdSectionId)),
      ]).then(lists => lists.flat()),
    ]);
    return [...taught.map(person => Number(person.AdInstructorId)), ...directory.map(Number)];
  }));
  const ids = new Set<number>(groups.flat().filter(Boolean));
  if (instructorCircleCache.size > 500) instructorCircleCache.clear();
  instructorCircleCache.set(key, { at: Date.now(), ids });
  return ids;
}

/** آخر أربعة أرقام، والباقي نقاط: «••••••••1234». */
function maskCivilTail(civil: unknown): string {
  const digits = String(civil ?? "").trim();
  if (!digits) return "";
  return `${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

async function instructorsForScope<T extends { AdInstructorId: number; AdInstructorCivil?: string; AdInstructorMobile?: string }>(req: AuthenticatedRequest, list: T[], exactCivil = ""): Promise<T[]> {
  const readable = instructorsForReader(req, list).map(withoutFacultyPlaceholderCivil);
  const circle = await instructorCircleFor(req);
  if (!circle) return readable;
  return readable.map(person => circle.has(Number(person.AdInstructorId)) || (exactCivil && String(person.AdInstructorCivil || "").trim() === exactCivil)
    ? person
    : { ...person, AdInstructorCivil: maskCivilTail(person.AdInstructorCivil), AdInstructorMobile: "" });
}

/** Read-only counterpart for the inquiry centre. Report permissions must be
 * able to see the current visiting roster without granting the data-editing
 * permission used by the schedule transfer tool. */
/**
 * ── من هو منتدبٌ في أي قسم، دفعةً واحدة ─────────────────────────────────────
 *
 * الشارةُ «منتدب» تظهر بجانب اسم الأستاذ في كل شاشة، والمنتدبُ يُعرف بقسمه وفصله. كانت
 * كل شاشةٍ تحمل قائمتَها الخاصة أو لا تحمل شيئاً، فاختفت الشارةُ من شاشاتٍ لا تعرف إلا
 * الاسم. هذه النقطةُ تُعطي الجميعَ قائمةً واحدة: مفتاحُ «كلية:قسم» ← معرّفاتُ منتدبيه
 * في الفصل، بالقاعدة نفسها التي يقرأ بها `readLiveVisitingRoster` (دليلُ العائلة مع روستر
 * الفصل). وتقتصر على أقسام القارئ.
 */
async function visitingLookupFor(allowedSections: Array<{ AdCollegeId: number; AdSectionId: number }>, allSections: any[], termId: number): Promise<Record<string, number[]>> {
  const [affiliations, instructors, explicitDirectories] = await Promise.all([
    Repository.getDelegateAffiliations(), Repository.getInstructors(), Repository.getExplicitDirectoryScopes(),
  ]);
  const known = new Set(instructors.map(person => Number(person.AdInstructorId)));
  return visitingByScope(
    affiliations, termId, id => known.has(id),
    allowedSections.map(section => ({ collegeId: Number(section.AdCollegeId), sectionId: Number(section.AdSectionId) })),
    departmentFamilyResolver(allSections),
    explicitDirectories,
  );
}

export function registerInstructorsRoutes(app: Express): void {

app.get("/api/instructors", requireAnyPermission([3, 7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const sectionId = Number(req.query.sectionId || 0);
  const collegeId = Number(req.query.collegeId || 0);
  const termId = Number(req.query.termId || 0);
  const query = String(req.query.q || "").trim();
  const limit = Math.max(1, Math.min(60, Number(req.query.limit || 40)));
  /* القارئ (صفات الاطّلاع) يرى الاسم ولا يرى الرقم المدني ولا الهاتف (N13). */
  const civilQuery = String(req.query.q || "").replace(/\D/g, "");
  const send = async <T extends { AdInstructorId: number; AdInstructorCivil?: string; AdInstructorMobile?: string }>(list: T[]) =>
    res.json(await instructorsForScope(req, list, civilQuery));

  // If query is provided, search across the university instructors catalog
  if (query) {
    /* قانون هوية الاسم المشترك نفسه الذي تحكم به مطابقة الاستيراد — همزات
       الألف، ى=ي، ؤ=و، ئ=ي، الهمزة الساقطة، وحتى المسافات: البحث يجب أن يجد
       كل من تجده المطابقة، وإلا وقف المستخدم أمام «لا نتيجة» لشخص موجود. */
    const fold = foldInstructorText;
    const needle = fold(query);
    const needleSpaceless = needle.replace(/ /g, "");
    /* ── الرقم المدني يُطابَق كاملاً أو لا يُطابَق ──────────────────────────
     *
     * The name is matched by substring, as a search should be. The civil id
     * was matched the same way, across the WHOLE university and with no scope
     * filter — which turned this search into an oracle: type six digits, read
     * back the person and the remaining six. Anyone holding a schedule
     * permission could complete a partially known national id for any
     * employee of the university.
     *
     * A full exact match is kept, because it is a real workflow: a coordinator
     * adding a lecturer from another college has the whole number on paper,
     * and finding them is what prevents a duplicate record being created for
     * somebody who already exists. Knowing the whole number is not a search;
     * it is already knowing the answer. */
    const digits = needle.replace(/\D/g, "");
    const allInstructors = await Repository.getInstructors();
    const filtered = allInstructors.filter(person => {
      if (isFacultyPlaceholder(person)) return false; // university search is for real people
      const name = fold(person.AdInstructorName);
      if (name.includes(needle)) return true;
      if (needleSpaceless.length >= 4 && name.replace(/ /g, "").includes(needleSpaceless)) return true;
      const civil = String(person.AdInstructorCivil || "").trim();
      return Boolean(digits) && digits.length === civil.length && digits === civil;
    });
    await send(sortArabicNamed(filtered, row => row.AdInstructorName).slice(0, limit));
    return;
  }

  if (sectionId) {
    /* الحَكَم الواحد: صفُّ «الكلية كلها» يجيز أقسامها (N8). */
    const sectionRow = (await Repository.getSections()).find(row => Number(row.AdSectionId) === sectionId);
    const canReadSection = Boolean(sectionRow && isScopeAllowed(req, Number(sectionRow.AdCollegeId), sectionId));
    if (!canReadSection) { res.status(403).json({ error: "القسم خارج نطاق صلاحيتك" }); return; }
    const termScoped = termId ? await Repository.getInstructorsByScope(sectionId, termId) : [];
    const allDeptHistorical = await Repository.getInstructorsByScope(sectionId, 0);
    // «يدرّس هذا الفصل» must make a delegate selectable before their first row
    // exists. Merge the term roster into the ordinary scoped staff list.
    const rosterIds = collegeId && termId ? await Repository.getVisitingRoster(collegeId, sectionId, termId) : [];
    /* دليل القسم اليدوي جزء من «أساتذة القسم» قبل أول جدول يُنشر: من سجّله
       المنسّق عضواً يجب أن يظهر هنا فوراً، لا بعد أول نشر يشتقّ منه التاريخ. */
    const sectionFacultyIds = collegeId ? await Repository.getDepartmentFaculty(collegeId, sectionId) : [];
    const directoryIds = collegeId
      ? [...await Repository.getDepartmentDelegates(collegeId, sectionId), ...sectionFacultyIds]
      : [];
    const manualIds = [...new Set([...rosterIds, ...directoryIds].map(Number).filter(Boolean))];
    const manualPeople = manualIds.length
      ? (await Repository.getInstructors()).filter(person => manualIds.includes(Number(person.AdInstructorId)))
      : [];
    const merged = [...new Map([...allDeptHistorical, ...termScoped, ...manualPeople].map(person => [Number(person.AdInstructorId), person])).values()];
    /* «هيئة تدريسية» ليست شخصاً، ولا قسمَ يُحرَم منها: القسم الذي لا سجلَّ له بهذا المعنى بعد
       (قسمٌ جديد لا تاريخ له) تُعرض له سجلات الأقسام الأخرى لتُختار من القائمة، كما تقول
       المطابقة نفسها («لقسم آخر ولا سجلّ لهذا القسم بعد؛ اخترها من القائمة»). والقسم الذي
       له سجلُّه لا تتغير قائمته. سجلات الكلية نفسها أولاً، وإلا فسجلات الجامعة. */
    const allPeople = await Repository.getInstructors();
    const placeholderIds = placeholderInstructorIds(allPeople as any);
    if (placeholderIds.size && !merged.some(person => placeholderIds.has(Number(person.AdInstructorId)))) {
      const placeholders = (allPeople as any[]).filter(person => placeholderIds.has(Number(person.AdInstructorId)));
      const collegeIds = new Set(await collegeFallbackInstructorIds(Number(sectionRow?.AdCollegeId || 0)));
      const sameCollege = placeholders.filter(person => collegeIds.has(Number(person.AdInstructorId)));
      // Legacy fallback must not put several foreign placeholders in one selector.
      const fallback = (sameCollege.length ? sameCollege : placeholders)[0];
      if (fallback) merged.push(fallback as any);
    }
    await send(singleFacultyPlaceholder(sortArabicNamed(merged, row => row.AdInstructorName), sectionFacultyIds));
    return;
  }

  // A wider lookup
  if (collegeId && !req.user?.IsAdminUser && !req.scopes?.some(scope => scope.AdCollegeId === collegeId)) {
    res.status(403).json({ error: "الكلية خارج نطاق صلاحيتك" });
    return;
  }
  const instructors = collegeId
    ? await Repository.getInstructorsByScheduleScope({ collegeId, termId })
    : await Repository.getInstructors();
  await send(sortArabicNamed(instructors, row => row.AdInstructorName));
});

/* ── الإضافة السريعة أثناء بناء الجدول ────────────────────────────────────────
 *
 * قائمة أستاذ المقرر تعرض «إضافة أستاذ جديد» في شاشات الجدول والاستيراد، لكن
 * الحفظ كان محجوزاً لشاشة إدارة الأساتذة وحدها، فيقابل المنسّق رسالة «هذه
 * الشاشة مخصصة لإدارة النظام الرئيسية» بعد أن يكون قد كتب الاسم والرقم المدني.
 * زميل جديد التحق بالقسم لا يجوز أن يكون طريقاً مسدوداً في منتصف الجدول.
 *
 * الإنشاء وحده هو ما فُتح، ولصلاحية بناء الجدول (٧) وحدها إلى جانب شاشة إدارة
 * الأساتذة (٣) — وهي الصلاحية الوحيدة بين صلاحيات الجدول التي تكتب أصلاً. أما
 * ٨ و٩ و١٠ و١٤ و١٦ و١٧ فشاشات قراءة وتقارير: قراءتها لدليل الأساتذة لا تعني
 * حقاً في إنشاء سجل جديد يحمل رقماً مدنياً ويبقى في الجامعة كلها.
 * وبنفس تحققات شاشة الإدارة: رقم مدني صحيح ولا تكرار. التعديل والحذف يبقيان
 * لإدارة النظام، لأنهما يمسّان سجلات قائمة وارتباطاتها. */
/* ── «موجود عندنا للقسم» تصير حقيقة يعرفها النظام ────────────────────────────
 *
 * كل ما يعرفه النظام عن انتماء أستاذ إلى قسم كان مشتقاً من جداول منشورة، فلا
 * وجود له قبل أول نشر. أضاف المنسّق زملاءه واحداً واحداً وهو يرى أنهم «عندنا
 * في القسم»، والنظام لا يرى إلا سجلات جامعية عائمة: فالاسم الشائع لا يجد
 * نطاقاً يُحسم فيه، و«هيئة تدريسية» تضيع بين نسخ الجامعة، وتبقى الخانات
 * «غير محسوم» عن أشخاص أمامه في القائمة.
 *
 * فالإضافة من سياق قسمٍ تسجّل العضوية في دليل القسم اليدوي نفسه الذي تقرأه
 * مطابقة الاستيراد وبوابة النشر — عضوية معلنة، لا مشتقة. ورقم مدني مسجّل
 * مسبقاً لم يعد طريقاً مسدوداً: صاحبه يُضمّ إلى القسم ويُعاد كاختيار، لأن
 * «أريده عندنا» مطلبٌ مشروع لشخص موجود، لا محاولة تكرار له. */
app.post("/api/instructors", requireAnyPermission([3, 7]), async (req: AuthenticatedRequest, res: Response) => {
  const { AdInstructorName, AdInstructorMobile } = req.body;
  /* الرقم يُخزَّن بصيغته الواحدة، فيطابقه كلُّ بابٍ يبحث به (بطاقتي، التوقيع، الاستيراد). */
  const AdInstructorCivil = normalizeCivilId(req.body?.AdInstructorCivil);
  if (!AdInstructorCivil || !String(AdInstructorName || "").trim()) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }

  // Do not let a person manually register another faculty placeholder.
  if (isFacultyPlaceholder({ AdInstructorId: 1, AdInstructorName })) {
    res.status(400).json({ error: "«هيئة تدريسية» سجل افتراضي ينشئه النظام للقسم، وليس أستاذاً جديداً." });
    return;
  }
  // Validate Civil ID
  const valResult = validateCivilId(AdInstructorCivil);
  if (!valResult.isValid) {
    res.status(400).json({ error: valResult.message });
    return;
  }

  const collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0);
  const scoped = Boolean(collegeId && sectionId && isScopeAllowed(req, collegeId, sectionId));
  /* الضمّ ذرّي: إضافتان متزامنتان لا تمحو إحداهما عضوَ الأخرى. */
  const enrol = async (instructorId: number) => {
    if (!scoped) return;
    await Repository.addDepartmentFaculty(collegeId, sectionId, Number(instructorId));
  };

  const exists = await Repository.getInstructorByCivil(AdInstructorCivil);
  if (exists) {
    if (scoped) {
      await enrol(Number(exists.AdInstructorId));
      res.json({ ...exists, existing: true });
      return;
    }
    // Naming the existing record turns a dead end into the next step: search by
    // the civil id and pick the person who is already there.
    res.status(400).json({ error: `هذا الرقم المدني مسجّل بالفعل باسم «${String(exists.AdInstructorName || "").trim()}» — ابحث عنه بالرقم المدني واختره.` });
    return;
  }

  const newIns = await Repository.createInstructor(AdInstructorCivil, AdInstructorName, AdInstructorMobile || "", req.body?.AdInstructorCategory === "ta" ? "ta" : null);
  await enrol(Number(newIns.AdInstructorId));
  res.status(201).json(newIns);
});

app.put("/api/instructors/:id", requirePermission(3), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { AdInstructorName, AdInstructorMobile } = req.body;
  /* الرقم يُخزَّن بصيغته الواحدة، فيطابقه كلُّ بابٍ يبحث به (بطاقتي، التوقيع، الاستيراد). */
  const AdInstructorCivil = normalizeCivilId(req.body?.AdInstructorCivil);
  const statusRaw = req.body?.AdInstructorStatus;
  const status = statusRaw === "retired" || statusRaw === "sabbatical" ? statusRaw : null;
  const category = !Object.prototype.hasOwnProperty.call(req.body || {}, "AdInstructorCategory")
    ? undefined : req.body.AdInstructorCategory === "ta" ? "ta" : null;
  /* النصابُ رقمٌ موجبٌ معقول، أو لا شيء. وحدُّه الأعلى ليس تجميلاً: نصابٌ
     مكتوبٌ خطأً بأربعة أرقام يجعل القيدَ صامتاً إلى الأبد بلا أن يعرف أحد. */
  const loadRaw = Number(req.body?.AdInstructorLoad);
  const load = Number.isFinite(loadRaw) && loadRaw > 0 && loadRaw <= 40 ? loadRaw : null;
  if (!AdInstructorCivil || !String(AdInstructorName || "").trim()) {
    res.status(400).json({ error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
    return;
  }

  const valResult = validateCivilId(AdInstructorCivil);
  if (!valResult.isValid) {
    res.status(400).json({ error: valResult.message });
    return;
  }

  const exists = await Repository.getInstructorByCivil(AdInstructorCivil);
  if (exists && exists.AdInstructorId !== id) {
    res.status(400).json({ error: "تم التسجيل من قبل" });
    return;
  }

  try {
    const updated = await Repository.updateInstructor(id, AdInstructorCivil, AdInstructorName, AdInstructorMobile || "", status, load, category);
    res.json(updated);
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

app.delete("/api/instructors/:id", requirePermission(3), async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  // Legacy SQL has FSchedule -> AdInstructor FK. Do not silently orphan schedule
  // rows: block the delete while any schedule still references this instructor.
  if (await Repository.hasSchedulesForInstructor(id)) {
    res.status(409).json({ error: "لا يمكن حذف عضو هيئة التدريس لوجود بيانات مرتبطة به في الجدول الدراسي" });
    return;
  }
  await Repository.deleteInstructor(id);
  res.json({ success: true });
});

/**
 * The department's seconded staff for this term.
 *
 * Visiting instructors are a different thing from the permanent register: they
 * change every term, they belong to the department that invited them, and next
 * term usually starts from the same list. Keeping the roster per scope and per
 * term makes "copy last term's visitors" a single press instead of retyping
 * twenty names, and lets the schedule mark who is seconded without inventing a
 * second kind of person in the data.
 */
app.get("/api/visiting-roster", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.query.collegeId || 0);
  const sectionId = Number(req.query.sectionId || 0);
  const termId = Number(req.query.termId || 0);
  if (!collegeId || !sectionId || !termId) { res.json({ instructorIds: [] }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  const { instructorIds, instructors } = await readLiveVisitingRoster(collegeId, sectionId, termId);
  res.json({ instructorIds, instructors });
});

app.get("/api/visiting-lookup", requireAnyPermission([3, 7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  const termId = Number(req.query.termId || 0);
  if (!termId) { res.json({ termId: 0, scopes: {} }); return; }
  const allSections = await Repository.getSections();
  /* أقسامُ القارئ وحدها (حارسُ النطاق)؛ والدالةُ لا تعرف غيرها. */
  res.json({ termId, scopes: await visitingLookupFor(filterByScope(req, allSections as any[]), allSections as any[], termId) });
});

// A delegate badge is global to the person, but department directories are not.
/** ── لكل اسم نسبه ──────────────────────────────────────────────────────────
 *  «منتدب» وحده لا يقول لمن، فتبقى الإدارة أمام اسم بلا قسم. وأعضاء هيئة
 *  التدريس في هذا النظام لا يحملون قسماً في سجلهم أصلاً: انتماؤهم مستنتج من
 *  عملهم ومن أدلة الأقسام. فتُجمع هنا نسبتان صريحتان لكل شخص، كلٌّ باسم قسمها:
 *  «انتداب» من دليل القسم أو روستر الفصل، و«تدريس» من جدول الفصل الأحدث —
 *  استعلام واحد مفهرس، لا مسحٌ لتاريخ الجامعة كله.
 */
/** نسبة شخص واحد عبر كل الفصول: استعلام مفهرس على معرّفه وحده، يُسأل عند فتح
 *  بطاقته لا عند عرض القائمة — فالقائمة تبقى خفيفة والسجل يبقى كاملاً. */
app.get("/api/instructors/:id/affiliation", requireAnyPermission([3, 7]), async (req: AuthenticatedRequest, res: Response) => {
  const instructorId = Number(req.params.id || 0);
  if (!instructorId) { res.status(400).json({ error: "معرّف الأستاذ غير صالح" }); return; }
  const [scopes, sections, colleges, terms, directories] = await Promise.all([
    Repository.getInstructorTeachingScopes(instructorId), Repository.getSections(), Repository.getColleges(),
    Repository.getTerms(), Repository.getDelegateAffiliations(),
  ]);
  const sectionName = new Map((sections as any[]).map(item => [Number(item.AdSectionId), String(item.AdSectionName || "")]));
  const collegeName = new Map((colleges as any[]).map(item => [Number(item.AdCollegeId), String(item.AdCollegeName || "")]));
  const termName = new Map((terms as any[]).map(item => [Number(item.AdTermId), String(item.AdTermName || "")]));
  const delegate = new Map<string, any>();
  for (const row of directories) {
    if (row.kind !== "directory" || !row.instructorIds.includes(instructorId)) continue;
    delegate.set(`${row.collegeId}:${row.sectionId}`, {
      collegeId: row.collegeId, sectionId: row.sectionId,
      section: sectionName.get(row.sectionId) || "", college: collegeName.get(row.collegeId) || "",
    });
  }
  /* أين يدرّس الأستاذ، لكن داخل نطاق القارئ وحده: كليةُ غيره وقسمُه ليسا من
     شأن حساب القسم (الإدارة ترى كل شيء). */
  const inScope = (collegeId: number, sectionId: number) => Boolean(req.user?.IsAdminUser) || isScopeAllowed(req, Number(collegeId), Number(sectionId));
  res.json({
    instructorId,
    teaching: scopes.filter(scope => inScope(scope.collegeId, scope.sectionId)).map(scope => ({
      collegeId: scope.collegeId, sectionId: scope.sectionId,
      section: sectionName.get(scope.sectionId) || "", college: collegeName.get(scope.collegeId) || "",
      rows: scope.rows, terms: scope.termIds.map(id => termName.get(id) || String(id)).filter(Boolean),
    })),
    delegate: [...delegate.values()].filter(entry => inScope(entry.collegeId, entry.sectionId)),
  });
});

app.get("/api/instructor-affiliations", requireAnyPermission([3, 7]), async (req: AuthenticatedRequest, res: Response) => {
  const terms = await Repository.getTerms();
  const latestTermId = Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
  const [affiliations, sections, colleges, latestRows] = await Promise.all([
    Repository.getDelegateAffiliations(), Repository.getSections(), Repository.getColleges(),
    latestTermId ? Repository.getSchedulesByScope({ termId: latestTermId }) : Promise.resolve([] as any[]),
  ]);
  const sectionName = new Map((sections as any[]).map(item => [Number(item.AdSectionId), String(item.AdSectionName || "")]));
  const collegeName = new Map((colleges as any[]).map(item => [Number(item.AdCollegeId), String(item.AdCollegeName || "")]));
  const byInstructor = new Map<number, { delegate: Map<string, any>; teaching: Map<string, any> }>();
  const slot = (id: number) => {
    let entry = byInstructor.get(id);
    if (!entry) { entry = { delegate: new Map(), teaching: new Map() }; byInstructor.set(id, entry); }
    return entry;
  };
  const place = (id: number, collegeId: number, sectionId: number, kind: "delegate" | "teaching") => {
    if (!id || !sectionId) return;
    /* خريطةُ الجامعة كلها للإدارة؛ ولغيرها ما يقع في نطاقه وحده. */
    if (!req.user?.IsAdminUser && !isScopeAllowed(req, collegeId, sectionId)) return;
    const key = `${collegeId}:${sectionId}`;
    slot(id)[kind].set(key, {
      collegeId, sectionId,
      section: sectionName.get(sectionId) || "",
      college: collegeName.get(collegeId) || "",
    });
  };
  /* الانتداب الحالي من دليل القسم وحده؛ روستر فصلٍ مضى تاريخٌ لا يُبقي «منتدب لدى» بعد التحويل. */
  for (const row of affiliations) if (row.kind === "directory") for (const id of row.instructorIds) place(id, row.collegeId, row.sectionId, "delegate");
  for (const row of latestRows as any[]) place(Number(row.AdInstructorId || 0), Number(row.AdCollegeId || 0), Number(row.AdSectionId || 0), "teaching");
  res.json({
    termId: latestTermId,
    affiliations: Object.fromEntries([...byInstructor].map(([id, entry]) => [id, {
      delegate: [...entry.delegate.values()], teaching: [...entry.teaching.values()],
    }])),
  });
});

app.get("/api/delegates", requireAnyPermission([3, 7, 8, 9, 10, 14, 16, 17]), async (req: AuthenticatedRequest, res: Response) => {
  /* الإدارة ترى منتدبي الجامعة؛ وغيرُها منتدبي أدلّة أقسامه وحدها. */
  if (req.user?.IsAdminUser) { res.json({ instructorIds: await Repository.getAllDelegateInstructorIds() }); return; }
  /* والقسمُ عائلةٌ عبر كلياته: منتدبو أخته في كليةٍ أخرى منتدبوه. */
  const [directories, sections] = await Promise.all([Repository.getDelegateAffiliations(), Repository.getSections()]);
  const familyOf = departmentFamilyResolver(sections);
  const allowedFamilies = new Set((sections as any[]).filter(sec => isScopeAllowed(req, Number(sec.AdCollegeId), Number(sec.AdSectionId))).map(sec => familyOf(Number(sec.AdCollegeId), Number(sec.AdSectionId))));
  const ids = new Set<number>();
  for (const row of directories) {
    if (row.kind !== "directory") continue;
    if (!allowedFamilies.has(familyOf(Number(row.collegeId), Number(row.sectionId)))) continue;
    for (const id of row.instructorIds) ids.add(Number(id));
  }
  res.json({ instructorIds: [...ids] });
});

app.put("/api/visiting-roster", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId = Number(req.body?.collegeId || 0);
  const sectionId = Number(req.body?.sectionId || 0);
  const termId = Number(req.body?.termId || 0);
  const ids: number[] = Array.isArray(req.body?.instructorIds) ? req.body.instructorIds.map(Number).filter(Boolean) : [];
  if (!collegeId || !sectionId || !termId) { res.status(400).json({ error: "حدد الكلية والقسم والفصل." }); return; }
  if (!isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  /* عضويةُ الفصل تُختار من دليل القسم (أو ممّن في الفصل أصلاً)، لا من أرقامٍ
     حرّة: رقمُ أيِّ موظفٍ في الجامعة كان يدخل الفصل، ثم «نسخ الفصل» يرفعه إلى
     دليل القسم الدائم، فتُقرأ بياناته كاملةً ويُعدَّل سجلُّه. والإضافةُ برقمٍ
     مدنيٍّ جديد لها بابُها (/api/visiting-roster/instructor). */
  const [currentRoster, directory] = await Promise.all([
    Repository.getVisitingRoster(collegeId, sectionId, termId),
    Repository.getDepartmentDelegates(collegeId, sectionId),
  ]);
  const known = new Set<number>([...currentRoster, ...directory].map(Number));
  if (ids.some(id => !known.has(Number(id)))) { res.status(400).json({ error: "أضف المنتدب إلى قائمة القسم أولاً (بالرقم المدني)، ثم حدّده لهذا الفصل." }); return; }
  // Term membership is deliberately independent of the permanent department
  // directory. Removing somebody from this term never deletes them from the
  // department's own delegate list.
  res.json({ instructorIds: await Repository.saveVisitingRoster(collegeId, sectionId, termId, ids) });
});

/** Persistent delegate directory owned by one department. */
app.get("/api/department-delegates", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const [ids,people]=await Promise.all([Repository.getDepartmentDelegates(collegeId,sectionId),Repository.getInstructors()]);
  const wanted=new Set(ids.map(Number));
  res.json({instructorIds:ids,instructors:people.filter(person=>wanted.has(Number(person.AdInstructorId)))});
});

/** Add a person to this department's permanent visiting directory. The civil
 * number is the shared identity, so the same person may be added to another
 * department without creating a second instructor record. */
app.post("/api/department-delegates/instructor", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),termId=Number(req.body?.termId||0);
  const civil=normalizeCivilId(req.body?.AdInstructorCivil);
  const name=String(req.body?.AdInstructorName||"").trim().slice(0,100);
  if(!collegeId||!sectionId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const check=validateCivilId(civil);
  if(!check.isValid||name.length<3){res.status(400).json({error:check.isValid?"اكتب اسم المنتدب كاملاً":check.message});return;}
  /* المنتدبُ بلا جوّالٍ لا تصله بطاقته: القسمُ الذي يضيفه يكتب رقمه. */
  const mobile=storableMobile(req.body?.AdInstructorMobile);
  if(mobile===null){res.status(400).json({error:"رقم الجوّال غير صالح — ثمانية أرقام تبدأ بـ5 أو 6 أو 9، أو رقمٌ دوليّ كامل."});return;}
  let person=await Repository.getInstructorByCivil(civil);
  if(!person) person=await Repository.createInstructor(civil,name,mobile);
  /* شخصٌ موجودٌ من قبل (منتدبٌ لقسمٍ آخر): يُكمَّل رقمُه إن كان بلا رقم، ولا
     يُكتب فوق رقمٍ سجّله غيرُ هذا القسم. */
  else if(mobile&&!whatsappNumber(person.AdInstructorMobile)) person=await Repository.updateInstructor(Number(person.AdInstructorId),String(person.AdInstructorCivil||civil),String(person.AdInstructorName||name),mobile,(person as any).AdInstructorStatus||null,(person as any).AdInstructorLoad??null);
  const directory=await Repository.getDepartmentDelegates(collegeId,sectionId);
  if(directory.includes(Number(person.AdInstructorId))){res.status(409).json({error:"هذا المنتدب موجود بالفعل في قائمة هذا القسم.",person});return;}
  await Repository.addDepartmentDelegate(collegeId,sectionId,Number(person.AdInstructorId));
  const instructorIds=await Repository.getDepartmentDelegates(collegeId,sectionId);
  let roster:number[]|undefined;
  if(termId){const current=await Repository.getVisitingRoster(collegeId,sectionId,termId);roster=await Repository.saveVisitingRoster(collegeId,sectionId,termId,[...current,Number(person.AdInstructorId)]);}
  res.status(201).json({person,instructorIds,roster});
});

app.put("/api/department-delegates/:instructorId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),instructorId=Number(req.params.instructorId||0);
  if(!collegeId||!sectionId||!instructorId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const directory=await Repository.getDepartmentDelegates(collegeId,sectionId);
  if(!directory.includes(instructorId)){res.status(404).json({error:"المنتدب غير موجود في قائمة هذا القسم"});return;}
  const civil=normalizeCivilId(req.body?.AdInstructorCivil);
  const name=String(req.body?.AdInstructorName||"").trim().slice(0,100);
  const check=validateCivilId(civil);
  if(!check.isValid||name.length<3){res.status(400).json({error:check.isValid?"اكتب اسم المنتدب كاملاً":check.message});return;}
  const collision=await Repository.getInstructorByCivil(civil);
  if(collision&&Number(collision.AdInstructorId)!==instructorId){res.status(409).json({error:"هذا الرقم المدني مرتبط بمنتدب آخر."});return;}
  const existing=await Repository.getInstructorById(instructorId);
  if(!existing){res.status(404).json({error:"المنتدب غير موجود"});return;}
  /* الجوّالُ لمن يديره هذا القسم (تحقّقنا أعلاه أنه في قائمته). غيابُ الحقل
     يُبقي الرقم كما هو؛ والحقلُ الفارغ يمحوه صراحةً. */
  const hasMobile=Object.prototype.hasOwnProperty.call(req.body||{},"AdInstructorMobile");
  const mobile=hasMobile?storableMobile(req.body?.AdInstructorMobile):String(existing.AdInstructorMobile||"");
  if(mobile===null){res.status(400).json({error:"رقم الجوّال غير صالح — ثمانية أرقام تبدأ بـ5 أو 6 أو 9، أو رقمٌ دوليّ كامل."});return;}
  /* والنصابُ يُحمل كما هو: التعديلُ هنا لا يمسّه، وكان يمحوه. */
  const person=await Repository.updateInstructor(instructorId,civil,name,mobile,(existing as any).AdInstructorStatus||null,(existing as any).AdInstructorLoad??null);
  res.json(person);
});

app.delete("/api/department-delegates/:instructorId", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.query.collegeId||0),sectionId=Number(req.query.sectionId||0),termId=Number(req.query.termId||0),instructorId=Number(req.params.instructorId||0);
  if(!collegeId||!sectionId||!instructorId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const current=await Repository.getDepartmentDelegates(collegeId,sectionId);
  const instructorIds=await Repository.saveDepartmentDelegates(collegeId,sectionId,current.filter(id=>Number(id)!==instructorId));
  // Removing a delegate from the department is effective immediately for the
  // open term, but previous-term rosters are deliberately left untouched.
  // This prevents a stale current roster from keeping the schedule badge alive
  // while preserving the historical evidence promised by the UI.
  let roster:number[]|undefined;
  if(termId){
    const currentRoster=await Repository.getVisitingRoster(collegeId,sectionId,termId);
    roster=await Repository.saveVisitingRoster(collegeId,sectionId,termId,currentRoster.filter(id=>Number(id)!==instructorId));
  }
  res.json({instructorIds,...(roster?{roster}:{})});
});

/** ── تحويل منتدب ⇄ معيّن من شاشة تعديل الأستاذ ──────────────────────────────
 *  الحالة: أين هو منتدبٌ (داخل نطاق القارئ)، والأقسام التي يحقّ له الانتداب
 *  إليها، والفصول القابلة للكتابة (الحالي وحده؛ الماضي تاريخٌ لا يُكتب). */
app.get("/api/instructors/:id/visiting-state", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const instructorId = Number(req.params.id || 0);
  if (!Number.isInteger(instructorId) || instructorId <= 0) { res.status(400).json({ error: "معرّف الأستاذ غير صالح" }); return; }
  const [state, sections, colleges, terms] = await Promise.all([
    readConversionState(instructorId), Repository.getSections(), Repository.getColleges(), Repository.getTerms(),
  ]);
  const collegeName = new Map((colleges as any[]).map(c => [Number(c.AdCollegeId), String(c.AdCollegeName || "")]));
  const sectionName = new Map((sections as any[]).map(s => [Number(s.AdSectionId), String(s.AdSectionName || "")]));
  const label = (c: number, s: number) => [sectionName.get(s), collegeName.get(c)].filter(Boolean).join(" · ");
  const allowed = (c: number, s: number) => isScopeAllowed(req, c, s);
  const past = new Set(state.pastTermIds);
  res.json({
    instructorId,
    currentTermId: state.currentTermId,
    futureTermIds: state.futureTermIds,
    delegate: state.directory.filter(d => allowed(d.collegeId, d.sectionId)).map(d => ({ ...d, label: label(d.collegeId, d.sectionId) })),
    rosters: state.rosters.filter(r => allowed(r.collegeId, r.sectionId)).map(r => ({ ...r, label: label(r.collegeId, r.sectionId), past: past.has(r.termId) })),
    scopes: (sections as any[]).filter(s => allowed(Number(s.AdCollegeId), Number(s.AdSectionId)))
      .map(s => ({ collegeId: Number(s.AdCollegeId), sectionId: Number(s.AdSectionId), label: label(Number(s.AdCollegeId), Number(s.AdSectionId)) })),
    terms: (terms as any[]).filter(t => !past.has(Number(t.AdTermId))).map(t => ({ termId: Number(t.AdTermId), name: String(t.AdTermName || "") })),
  });
});

/** التنفيذ (أو المعاينة بـ dryRun): كل قسمٍ في الطلب يُفحص بنطاق القارئ،
 *  والخطة من planVisitingConversion وحدها. لا يُمسّ جدولٌ ولا روستر فصلٍ مضى. */
app.post("/api/instructors/:id/visiting-conversion", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const instructorId = Number(req.params.id || 0);
  const direction = req.body?.direction;
  if (!Number.isInteger(instructorId) || instructorId <= 0) { res.status(400).json({ error: "معرّف الأستاذ غير صالح" }); return; }
  if (direction !== "toAppointed" && direction !== "toVisiting") { res.status(400).json({ error: "اتجاه التحويل غير معروف." }); return; }
  const rawScopes: unknown[] = Array.isArray(req.body?.scopes) ? req.body.scopes.slice(0, 50) : [];
  const scopes = rawScopes.map((s: any) => ({ collegeId: Number(s?.collegeId || 0), sectionId: Number(s?.sectionId || 0) }));
  if (scopes.some(s => !Number.isInteger(s.collegeId) || !Number.isInteger(s.sectionId) || s.collegeId <= 0 || s.sectionId <= 0)) { res.status(400).json({ error: "قسمٌ أو كليةٌ غير صالحة في الطلب." }); return; }
  if (!scopes.every(s => isScopeAllowed(req, s.collegeId, s.sectionId))) { res.status(403).json({ error: "خارج صلاحيات الأقسام المسموحة لك" }); return; }
  if (!(await Repository.getInstructorById(instructorId))) { res.status(404).json({ error: "الأستاذ غير موجود" }); return; }
  const request = direction === "toVisiting"
    ? { direction, instructorId, scopes, termId: Number(req.body?.termId || 0) } as const
    : { direction, instructorId, scopes } as const;
  const result = await runVisitingConversion(request, { dryRun: Boolean(req.body?.dryRun) });
  if (result.errors.length) { res.status(400).json({ error: result.errors.join(" "), errors: result.errors, changes: [] }); return; }
  res.json(result);
});

/** Backwards-compatible creation path now writes the department directory too. */
app.post("/api/visiting-roster/instructor", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),termId=Number(req.body?.termId||0);
  const civil=normalizeCivilId(req.body?.AdInstructorCivil);
  const name=String(req.body?.AdInstructorName||"").trim().slice(0,100);
  if(!collegeId||!sectionId||!termId||!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const check=validateCivilId(civil);if(!check.isValid||name.length<3){res.status(400).json({error:check.isValid?"اكتب اسم المنتدب كاملاً":check.message});return;}
  let person=await Repository.getInstructorByCivil(civil);if(!person)person=await Repository.createInstructor(civil,name,"");
  const directory=await Repository.getDepartmentDelegates(collegeId,sectionId);
  if(!directory.includes(Number(person.AdInstructorId)))await Repository.saveDepartmentDelegates(collegeId,sectionId,[...directory,Number(person.AdInstructorId)]);
  const current=await Repository.getVisitingRoster(collegeId,sectionId,termId);
  await Repository.saveVisitingRoster(collegeId,sectionId,termId,[...current,Number(person.AdInstructorId)]);
  res.status(201).json(person);
});

/** Start this term's roster from selected people in another term. */
app.post("/api/visiting-roster/copy", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const collegeId=Number(req.body?.collegeId||0),sectionId=Number(req.body?.sectionId||0),fromTermId=Number(req.body?.fromTermId||0),toTermId=Number(req.body?.toTermId||0);
  if(!collegeId||!sectionId||!fromTermId||!toTermId){res.status(400).json({error:"حدد الفصلين."});return;}
  if(!isScopeAllowed(req,collegeId,sectionId)){res.status(403).json({error:"خارج صلاحيات الأقسام المسموحة لك"});return;}
  const source:number[]=await Repository.getVisitingRoster(collegeId,sectionId,fromTermId);
  const rawRequested:unknown[]=Array.isArray(req.body?.instructorIds)?req.body.instructorIds:[];
  const requested:number[]=rawRequested.length
    ? rawRequested.map((value:unknown)=>Number(value)).filter((value:number)=>Number.isFinite(value)&&value>0)
    : source;
  const sourceSet=new Set<number>(source.map(Number));
  const selected:number[]=[...new Set<number>(requested.filter((id:number)=>sourceSet.has(id)))];
  const target:number[]=await Repository.getVisitingRoster(collegeId,sectionId,toTermId);
  const merged:number[]=[...new Set<number>([...target,...selected].map(Number))];
  const directory:number[]=await Repository.getDepartmentDelegates(collegeId,sectionId);
  await Repository.saveDepartmentDelegates(collegeId,sectionId,[...new Set<number>([...directory,...selected].map(Number))]);
  res.json({instructorIds:await Repository.saveVisitingRoster(collegeId,sectionId,toTermId,merged),copied:selected.length});
});
}
