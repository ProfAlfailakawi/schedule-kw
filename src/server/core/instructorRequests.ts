/**
 * ── طلباتُ الأساتذة: السياقُ والحكمُ على البنود ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { roomSuitability } from "../../utils/roomSuitability";
import { instructorWeekAfter, requestIdentity, rowsForRequestSlots } from "../../utils/instructorRequestWeek";
import { rankRequestRooms } from "../../utils/requestRoomRanking";
import { liveReservations, occupiedRowsForRequest } from "../../utils/instructorRequestReservations";
import { Request, Response } from "express";
import { Repository } from "../../db/repository";
import { onSchedulesInvalidated } from "../../db/referenceCache";
import { normalizeCivilId, validateCivilId } from "../../utils/civilId";
import { findConflicts, timeToMinutes } from "../../utils/scheduleIntelligence";
import { termChronology } from "../../utils/termSequence";
import type { FSchedule, InstructorRequest, InstructorRequestItem } from "../../types";
import { departmentFamily } from "../../utils/sectionLabel";
import { requestWindowOpen as requestWindowOpenPolicy } from "../../utils/instructorRequestWindows";
import { periodBalanceFinding, reviewSchedule } from "../../utils/scheduleRegulations";
import { learnRhythm } from "../../utils/departmentRhythm";
import { readStudentDemand, cohortPairs } from "../../utils/studentDemand";
import { dayKeysOf } from "../../utils/instructorRequestItems";
import { judgeRequest, type RequestDayKey } from "../../utils/instructorRequestVerdict";
import { learnCourseNature, type CourseNature } from "../../utils/courseNature";
import { scheduleDayWindowMinutes } from "../../utils/scheduleTime";
import { eligibleHallsForSection, roomKeyOf, rowOccupiesRoom } from "../../utils/locationRegistry";
import { approvedBarterReservation, borrowerOutsideApprovedWindow } from "../../utils/hallBarterWindow";
import { confirmedDepartmentRoomIds, dataContextCacheKey, readLocationRegistry } from "./locations";
import { arabicUiCollator } from "./ordering";
import { scheduleOverlap } from "./scheduleRules";
import { publicAttemptReserve, shareLinkStillReadable } from "./shareLinks";
import { placeholderInstructorIds } from "./smartImport";

/* ══════════════════════════════════════════════════════════════════════════
   طلباتُ الأساتذة على مسوّداتهم
   ══════════════════════════════════════════════════════════════════════════

   القسم ينسخ الجدول من فصلٍ ماضٍ ثم يرسله للأساتذة، أو يرسله ثم ينسخ. وفي
   الحالتين يفتح الأستاذُ رابطَه فيرى مسوّدةَ جدوله هو — لا جدولَ القسم ولا
   جدولَ زميل — فيقول «أبقِه» أو «عدّله» أو «احذفه» أو «أضف».

   وثلاثةُ حدودٍ تُفرَض هنا في الخادم، لا في الصفحة، لأن الصفحةَ عند صاحبها:

   ١) الرابطُ هو الهويّة. لا حساب، ولا رقمٌ مدنيٌّ يُسأل عنه، ولا طريقَ من
      رابطٍ إلى طلبِ غيره. وما يُقرأ ويُكتب محدودٌ بالسجلّ الذي يشير إليه.

   ٢) القاعةُ لا تُرسَل. مهما حسب النظامُ من مرشّحاتٍ للقسم، فما يغادر إلى
      صفحة الأستاذ قيمةٌ منطقيةٌ واحدة: متاحٌ أو لا. تجريدُها يقع في
      `stripForInstructor` وحدها، فلا موضعَ آخرَ يمكن أن ينساه.

   ٣) الحكمُ يُعاد حسابُه في الخادم دائماً. ما يصل من الصفحة يومٌ وبدايةٌ
      واختيار؛ وأيُّ حُكمٍ يصحبه يُطرح ويُعاد بناؤه من الجدول الحقيقي، وإلا
      لأرسل من يعرف كيف يُعدّل الطلبَ حُكماً يقول «خالٍ من التعارض».

   ولا شيء هنا يكتب في جدول. التثبيتُ يمرّ بمسارات الحفظ نفسها التي يستعملها
   المنسّق بيده (`/api/schedules`)، فيرث التحقّقَ والنسخَ والتدقيقَ وتقريرَ
   التغييرات كما هي؛ وهذا المسار يسجّل القرارَ بعدها فقط.
   ══════════════════════════════════════════════════════════════════════════ */

export const REQUEST_LINK_DAYS = 21;

/** الموعد العام والاستثناء الفردي محكومان بدالة واحدة في الخادم. */
export const requestWindowOpen = (request: InstructorRequest): boolean => requestWindowOpenPolicy(request);

/** Requests from earlier schedule generations remain in history, never in active views. */
export async function currentInstructorRequestGeneration<T extends InstructorRequest>(requests: readonly T[]): Promise<T[]> {
  const scopes = new Map<string, { collegeId: number; sectionId: number; termId: number }>();
  for (const row of requests) {
    const scope = { collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId), termId: Number(row.AdTermId) };
    scopes.set(`${scope.collegeId}:${scope.sectionId}:${scope.termId}`, scope);
  }
  const generations = new Map<string, number>();
  await Promise.all([...scopes].map(async ([key, scope]) => {
    const value = await Repository.getInstructorRequestGeneration(scope.collegeId, scope.sectionId, scope.termId);
    generations.set(key, value.generation);
  }));
  return requests.filter(row => Number(row.scheduleGeneration || 0) === generations.get(`${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}:${Number(row.AdTermId)}`));
}

/** موقعُ البند: الإضافةُ حيث اختار الأستاذ، والتعديلُ والحذفُ حيث يقع الصفُّ نفسُه.
 *  والطلباتُ القديمة التي لا تحمل موقعاً تعود إلى موقع الرابط، كما كانت. */
export function requestItemScope(request: InstructorRequest, item: InstructorRequestItem): { collegeId: number; sectionId: number } {
  const snapshot = item.action === "add" ? item.after : item.before;
  return {
    collegeId: Number(snapshot?.collegeId || request.AdCollegeId || 0),
    sectionId: Number(snapshot?.sectionId || request.AdSectionId || 0),
  };
}


/**
 * ما درج عليه المقرّر في فصولٍ سابقة (طولُ لقائه حين يُدرَّس يوماً واحداً). يُقرأ تاريخُه مرّةً كلَّ عشر دقائق
 * لكل مقرّر، لا مع كل نقرة: الحكمُ يتكرّر عند كل تعديلٍ في الصفحة.
 */
const courseHabitMemo = new Map<string, { at: number; nature: CourseNature | null }>();
onSchedulesInvalidated(() => courseHabitMemo.clear());
/* `beforeTermId` يحصر التعلّمَ في الفصول التي سبقته: يُستعمل لبناء الأنماط المقترحة وحدها. بلا قيمةٍ يبقى كما كان. */
export async function courseHabit(courseId: number, beforeTermId = 0): Promise<CourseNature | null> {
  if (!courseId) return null;
  const key = `${dataContextCacheKey(courseId)}:${beforeTermId}`;
  const held = courseHabitMemo.get(key);
  if (held && Date.now() - held.at < 10 * 60_000) return held.nature;
  let nature: CourseNature | null = null;
  try {
    const [history, terms] = await Promise.all([Repository.getScheduleHistoryForCourses([courseId]), Repository.getTerms()]);
    const ranks = Object.fromEntries(terms.map(term => [Number(term.AdTermId), termChronology(term)]));
    nature = learnCourseNature(courseId, history.filter(row => !beforeTermId || (ranks[Number(row.AdTermId)] ?? Number(row.AdTermId)) < (ranks[beforeTermId] ?? beforeTermId)));
    if (nature) nature.termRanks = ranks;
  } catch { nature = null; }
  if (courseHabitMemo.size > 800) courseHabitMemo.clear();
  courseHabitMemo.set(key, { at: Date.now(), nature });
  return nature;
}

/** يقرأ الرابط ويعيد السجلّ، أو الخطأَ بحالته. */
export async function resolveRequestLink(token: string) {
  const wanted = String(token || "");
  /* الرابطُ وطلبُه يُقرآن معاً: معرّفُ الرابط هو الرمز نفسُه، فلا حاجة لانتظار الأول قبل سؤال الثاني (رحلةٌ أقلّ في كل نداء). */
  const [link, early] = await Promise.all([
    Repository.getShareLink(wanted),
    wanted ? Repository.getInstructorRequestByLink(wanted).catch(() => undefined) : Promise.resolve(undefined),
  ]) as [Awaited<ReturnType<typeof Repository.getShareLink>>, InstructorRequest | undefined | null];
  if (!link || link.revoked) return { error: "الرابط غير موجود أو تم إيقافه", status: 404 } as const;
  if (link.kind !== "request") return { error: "هذا الرابط ليس طلبَ جدول", status: 404 } as const;
  if (!await shareLinkStillReadable(link)) return { error: "انتهت صلاحية هذا الرابط", status: 410 } as const;
  const request: InstructorRequest | undefined | null = link.id === wanted && early ? early : await Repository.getInstructorRequestByLink(link.id);
  if (!request) return { error: "لا يوجد طلبٌ مرتبطٌ بهذا الرابط", status: 404 } as const;
  if (!(await Repository.isInstructorRequestInCurrentGeneration(request)))
    return { error: "أُغلقت هذه الجولة بعد استبدال الجدول. استخدم رابط الجولة الحالية.", status: 410 } as const;
  return { link, request } as const;
}

/**
 * كتالوجُ القسم لبطاقة الأستاذ يجب أن يأتي من الكتالوج الكامل لا من استعلام
 * Firestore مباشر على AdSectionId. البيانات الموروثة لا تحمل هذا الحقل دائماً
 * بالنوع النصي نفسه: قد يكون رقماً أو نصاً أو نصاً فيه مسافات. Firestore
 * يطابق النوع والقيمة حرفياً، فيسقط بعض المقررات من الاستعلام بينما Number
 * يثبت أنها للقسم نفسه. لذلك نقرأ المرجع الكامل (وهو cached أصلاً) ثم نطبّع
 * هوية القسم في الذاكرة. هذا المسار عام لبطاقة الأستاذ فقط حتى لا نحوّل كل
 * قوائم التطبيق الصغيرة إلى مسحٍ كامل للكتالوج.
 */
export async function instructorRequestSectionCourses(sectionIdValue: unknown) {
  const sectionId = Number(sectionIdValue || 0);
  if (!sectionId) return [] as any[];
  /* The professor chooses from the department catalogue, not from the rows
     that happen to be offered this term. `getCoursesBySection` already
     normalizes legacy numeric/string AdSectionId values; the operational
     set then removes only courses that are explicitly archived. */
  const [courses, operationalIds] = await Promise.all([
    Repository.getCoursesBySection(sectionId),
    Repository.getOperationalCourseIds(sectionId),
  ]);
  return courses.filter(row => operationalIds.has(Number(row.AdCourseId))) as any[];
}

/**
 * A request link belongs to one department, not to one campus. The same academic
 * department may exist in Basic Education Girls, Jahra, Commercial Studies, or
 * another college/site. We resolve those sibling sections by academic identity
 * and expose only those scopes — never unrelated university departments.
 */
export async function instructorRequestDepartmentScopes(request: InstructorRequest) {
  const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
  const base = (sections as any[]).find(row => Number(row.AdSectionId) === Number(request.AdSectionId));
  if (!base) return [] as Array<{ collegeId: number; collegeName: string; sectionId: number }>;
  const collegeNameById = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  /* Restrict additions to the exact scientific department family used by
     publication and reviews. Fuzzy matching is only suitable for imports. */
  const family = departmentFamily(sections as any[], Number(base.AdCollegeId), Number(base.AdSectionId));
  const familyKeys = new Set(family.map(scope => `${scope.collegeId}:${scope.sectionId}`));
  const scopes = (sections as any[])
    .filter(row => familyKeys.has(`${Number(row.AdCollegeId)}:${Number(row.AdSectionId)}`))
    .map(row => ({
      collegeId: Number(row.AdCollegeId || 0),
      collegeName: collegeNameById.get(Number(row.AdCollegeId || 0)) || "",
      sectionId: Number(row.AdSectionId || 0),
    }))
    .filter(scope => scope.collegeId && scope.sectionId);
  const unique = [...new Map(scopes.map(scope => [`${scope.collegeId}:${scope.sectionId}`, scope])).values()];
  const defaultCollege = (name: string) => /التربية\s*الأساسية.*بنات/.test(String(name || "")) ? 0 : 1;
  return unique.sort((a, b) => defaultCollege(a.collegeName) - defaultCollege(b.collegeName)
    || arabicUiCollator.compare(a.collegeName, b.collegeName));
}

/**
 * يبني سياقَ الحكم من الجدول الحقيقي.
 *
 * يُقرأ الفصلُ كلُّه مرّةً واحدةً لكل نداء، لا مرّةً لكل بند: طلبٌ فيه عشرةُ
 * بنودٍ كان سيقرأ الجدولَ عشراً، وأساتذةٌ خمسون يفتحون روابطهم في يومٍ واحد.
 */
export async function buildRequestContext(request: InstructorRequest) {
  return requestContextFor(await buildSharedRequestContext(request), request);
}

/**
 * السياقُ المشترك لنطاقٍ واحد (فصل/كلية/قسم): يُبنى مرّةً لعشرات الطلبات في
 * الوارد. لا يستثني حجزَ أحد — الاستثناءُ لكل طلبٍ في `requestContextFor`.
 */
export async function buildSharedRequestContext(request: InstructorRequest) {
  const [allRows, courses, instructors, needs, ledger] = await Promise.all([
    Repository.getSchedulesByScope({ termId: Number(request.AdTermId) }),
    Repository.getCourses(),
    Repository.getInstructors(),
    Repository.getStudentNeeds(Number(request.AdCollegeId), Number(request.AdSectionId), Number(request.AdTermId)).catch(() => []),
    Repository.getInstructorRequestReservations(Number(request.AdTermId)),
  ]);
  const officialRows = allRows as FSchedule[];
  const scopeRows = (allRows as any[]).filter(row =>
    Number(row.AdCollegeId) === Number(request.AdCollegeId) && Number(row.AdSectionId) === Number(request.AdSectionId));
  const demand = readStudentDemand(needs as any[], courses as any[]);
  /* سُلّمُ البدايات يُجمع من أنماط القسم كلها بلا تكرار: الأحد والثلاثاء
     والخميس نمطٌ، والاثنين والأربعاء نمطٌ آخر، ولكلٍّ سُلّمُه. وأخذُ أحدهما
     وحده كان يُخفي نصفَ ما يدرّس به القسم فعلاً. */
  const rhythm = learnRhythm(scopeRows as any[]);
  const ladder = [...new Set(rhythm.patterns.flatMap(pattern => pattern.ladder))];
  const roomKeys = [...new Set((scopeRows as any[]).map(row => roomKeyOf(row.roomId, row.AdRoomCode, row.AdRoomHall)).filter(Boolean))];
  return {
    termId: Number(request.AdTermId),
    allRows: officialRows as any[],
    officialRows, reservationsAll: liveReservations(ledger), reservations: liveReservations(ledger),
    ownerRequestId: "" as string,
    views: new Map<string, any>(),
    scopeRows,
    courses: new Map((courses as any[]).map(row => [Number(row.AdCourseId), row])),
    instructors: new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), row])),
    cohortPairs: cohortPairs(demand),
    knownRoomKeys: roomKeys,
    startLadder: ladder,
  };
}

type SharedRequestContext = Awaited<ReturnType<typeof buildSharedRequestContext>>;
/** سياقُ طلبٍ بعينه: الجدولُ الرسميُّ وحجوزُ غيره، لا حجوزُه هو (A1). يُحفظ لكل طلب فلا يُعاد حسابه مع كل وقتٍ في خريطة الأوقات. */
export function requestContextFor(shared: SharedRequestContext, request: InstructorRequest): SharedRequestContext {
  if (shared.ownerRequestId === request.id) return shared;
  const held = shared.views.get(request.id);
  if (held) return held;
  const view: SharedRequestContext = {
    ...shared,
    ownerRequestId: request.id,
    reservations: shared.reservationsAll.filter(entry => entry.requestId !== request.id),
    allRows: occupiedRowsForRequest(shared.officialRows, shared.reservationsAll, shared.termId, request.id) as any[],
  };
  shared.views.set(request.id, view);
  return view;
}

/** Constraints are local to the college/section where the requested lecture
 * will live, while instructor clashes remain institution-wide for the term. */
export async function requestRulesForScope(
  context: Awaited<ReturnType<typeof buildRequestContext>>,
  collegeId: number,
  sectionId: number,
  termId: number,
) {
  const scopeRows = context.allRows.filter(row =>
    Number(row.AdCollegeId) === Number(collegeId) && Number(row.AdSectionId) === Number(sectionId));
  const needs = await Repository.getStudentNeeds(collegeId, sectionId, termId).catch(() => []);
  const courseRows = [...context.courses.values()];
  const demand = readStudentDemand(needs as any[], courseRows as any[]);
  const rhythm = learnRhythm(scopeRows as any[]);
  const startLadder = [...new Set(rhythm.patterns.flatMap(pattern => pattern.ladder))];
  /* القاعاتُ المعروفة هي قاعاتُ القسم في السجلّ + المستعارة المعتمدة — القاعدةُ
     نفسُها التي تستعملها شاشةُ الجدول («اقترح قاعة»)، لا قاعاتُ صفوفه القائمة:
     قسمٌ بشعبةٍ واحدةٍ له قاعةٌ واحدةٌ معروفة، فإن شغلتها محاضرةٌ أخرى لأستاذه
     قال النموذجُ «لا قاعة» والسجلُّ مليءٌ بالخالية. */
  const [registry, barter, pinnedRooms] = await Promise.all([readLocationRegistry(), Repository.getHallBarterRequests(termId).catch(() => [] as any[]), Repository.getPinnedDepartmentRooms(collegeId, sectionId)]);
  const borrowed = new Set((barter as any[]).filter(item => item.status === "approved" && Number(item.requesterCollegeId) === Number(collegeId)
    && Number(item.requesterSectionId) === Number(sectionId) && item.roomId).map(item => String(item.roomId)));
  const pinned = confirmedDepartmentRoomIds(registry, pinnedRooms, Number(collegeId));
  const halls = eligibleHallsForSection(registry, Number(sectionId), borrowed, pinned);
  const roomAliases: Record<string, string> = {};
  const registryKeys = halls.map(hall => {
    const key = roomKeyOf(hall.roomId, hall.room, hall.hall);
    roomAliases[key] = roomKeyOf("", hall.room, hall.hall);
    return key;
  });
  /* Historical text-only rows are evidence for display, not reservable room
     identities. Never let them make the early verdict say "available" when
     submission cannot create a physical reservation from the same room set. */
  const knownRoomKeys = [...new Set(registryKeys)];
  /* تفاصيلُ القاعة (مبنى وقاعة ومعرّفاها) لكل مفتاحٍ من السجلّ: قاعةٌ خاليةٌ لم تظهر يوماً في صفوف القسم لا تُوجد في scopeRows،
     فكانت خياراتُ نموذج الإضافة السريع تخرج فارغةً مع أن الحكم وجد لها قاعة. */
  const hallByKey = new Map<string, { room: string; hall: string; buildingId: any; roomId: any }>();
  halls.forEach((hall, index) => hallByKey.set(registryKeys[index], { room: String(hall.room || ""), hall: String(hall.hall || ""), buildingId: hall.buildingId, roomId: hall.roomId }));
  /* أوقاتُ دوام القسم من شاشة المشرف («أوقات الدوام للأقسام»)، لا حدٌّ عامٌّ واحد. */
  const dayWindow = scheduleDayWindowMinutes(await Repository.getSectionById(sectionId).catch(() => null));
  const roomEligible = (key: string, day: RequestDayKey, start: string, end: string) => {
    const hall = hallByKey.get(key);
    const record = registry.rooms.find(room => room.id === hall?.roomId);
    if (!record) return false;
    const windows = (barter as any[]).filter(item => String(item.roomId) === String(record.id));
    if (approvedBarterReservation(windows, day, start, end, collegeId, sectionId)
      || borrowerOutsideApprovedWindow(windows, day, start, end, collegeId, sectionId)) return false;
    if (record.sectionIds.includes(sectionId) || pinned.has(record.id)) return true;
    return windows.some(item => item.status === "approved" && Number(item.requesterCollegeId) === collegeId
      && Number(item.requesterSectionId) === sectionId && item.day === day
      && timeToMinutes(item.startTime) <= timeToMinutes(start) && timeToMinutes(item.endTime) >= timeToMinutes(end));
  };
  const selectedCourseFit = (key: string, courseId: number) => {
    const hall = hallByKey.get(key), room = registry.rooms.find(room => room.id === hall?.roomId), course = context.courses.get(courseId);
    const fit = roomSuitability(course, room);
    return fit.typeRank * 1000 + fit.adjustment;
  };
  return { scopeRows, cohortPairs: cohortPairs(demand), startLadder, knownRoomKeys, roomAliases, hallByKey, registry, roomEligible, selectedCourseFit, dayStart: dayWindow.start, dayEnd: dayWindow.end };
}
/**
 * يُعيد حساب حُكم كل بند من الجدول الحقيقي.
 *
 * يُستدعى عند كل قراءةٍ وكل إرسال، لأن الجدول يتحرّك تحت الطلب: وقتٌ كان
 * متاحاً يومَ فُتح الرابط قد يكون أُخذ قبل أن يضغط الأستاذ إرسال، وحُكمٌ
 * محفوظٌ من أمس يكذب بصمت.
 */
/** كم لقاءً تشغله كلُّ قاعةٍ في الفصل — للتوزيع العادل في اختيار القاعة. يُحسب مرّةً للسياق. */
const roomUsageMemo = new WeakMap<object, Map<string, number>>();
function roomUsageOf(context: { officialRows: FSchedule[] }): Map<string, number> {
  let usage = roomUsageMemo.get(context.officialRows);
  if (usage) return usage;
  usage = new Map();
  for (const row of context.officialRows) {
    const id = String((row as any).roomId || "");
    if (id) usage.set(id, (usage.get(id) || 0) + dayKeysOf(row).length);
  }
  roomUsageMemo.set(context.officialRows, usage);
  return usage;
}
/** يحسب قيمةً لمفتاحٍ مرةً واحدة ولو سأل عنها كثيرون معاً: النتيجةُ تُحفظ في الخريطة، والرحلةُ الجارية تُشارَك. */
const rulesInflight = new WeakMap<Map<string, any>, Map<string, Promise<any>>>();
async function rulesOnce<T>(cache: Map<string, T>, key: string, make: () => Promise<T>): Promise<T> {
  if (cache.has(key)) return cache.get(key) as T;
  let flights = rulesInflight.get(cache);
  if (!flights) { flights = new Map(); rulesInflight.set(cache, flights); }
  let flight = flights.get(key);
  if (!flight) { flight = make().then(value => { cache.set(key, value); flights!.delete(key); return value; }, error => { flights!.delete(key); throw error; }); flights.set(key, flight); }
  return flight;
}
export async function judgeRequestItems(request: InstructorRequest, options: {
  forDepartment?: boolean;
  /** سياقٌ بُني مرّةً لحزمةِ أحكامٍ متتابعة (خريطة الأوقات): لا يُعاد بناؤه ولا تُعاد قراءةُ قواعد النطاق لكل وقت. */
  context?: Awaited<ReturnType<typeof buildRequestContext>>;
  rulesCache?: Map<string, any>;
} = {}): Promise<InstructorRequest> {
  /* السياقُ قد يُبنى مرّةً لطلباتٍ كثيرة؛ ما يراه هذا الطلب يُشتقّ منه هنا دائماً. */
  const context = requestContextFor(options.context || await buildSharedRequestContext(request), request);
  /* نافذةُ الطلبات تحدّ إرسالَ الأستاذ، لا قرارَ القسم: بعد إغلاقها كان كلُّ
     بندٍ يُعلَّم «انتهت مدّة استقبال الطلبات» مانعاً، فيتعطّل «ثبّت» على ما
     لم يُقرَّر بعد. فالقسمُ يرى الحكمَ بلا شرط النافذة. */
  const open = options.forDepartment ? true : requestWindowOpen(request);
  const instructorRows = context.allRows.filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));
  const mine = context.scopeRows.filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));

  /* ── جدولُ الأستاذ بعد الحزمة، لا قبلها ────────────────────────────────
   *
   * الحكمُ يُقاس على ما سيكون، لا على ما هو كائن: حزمةٌ تنقل محاضرتين إلى
   * الساعة نفسها لا تصطدم إحداهما بالأخرى في الجدول القديم، لأن أيّاً منهما
   * لم تكن هناك بعد. فتُبنى صفوفُه بعد الطلب مرّةً واحدةً للحزمة كلها، ثم
   * يُقاس كلُّ بندٍ عليها — فيرى البندُ إخوتَه.
   *
   * والإضافةُ تأخذ هويّةً مؤقّتةً سالبةً فريدة، لأن إضافتين بلا معرّفٍ كانتا
   * صفّاً واحداً في نظر محرّك التعارض فيتخطّى المقارنةَ بينهما.
   */
  const tempIdFor = (index: number) => -(index + 1);
  const requestRowIds = new Set((request.items || []).map(item => Number(item.rowId || 0)).filter(Boolean));
  const rowsAfter: any[] = instructorWeekAfter(request, context.allRows);

  const rulesByScope: Map<string, Awaited<ReturnType<typeof requestRulesForScope>>> = options.rulesCache || new Map();
  /* نطاقاتُ البنود المختلفة تُقرأ معاً لا واحداً بعد واحد، ونطاقٌ يسأل عنه عشراتُ الطلبات في آنٍ واحد (شاشة القسم) يُحسب مرةً واحدة. */
  const scopesNeeded = new Map<string, { collegeId: number; sectionId: number }>();
  for (const item of (request.items || [])) {
    const original = item.rowId == null ? undefined : instructorRows.find(row => Number(row.id) === Number(item.rowId));
    const selectedCourse = context.courses.get(Number(item.after?.courseId || item.before?.courseId || 0));
    const collegeId = Number(item.after?.collegeId || selectedCourse?.AdCollegeId || original?.AdCollegeId || request.AdCollegeId);
    const sectionId = Number(item.after?.sectionId || selectedCourse?.AdSectionId || original?.AdSectionId || request.AdSectionId);
    scopesNeeded.set(`${collegeId}:${sectionId}`, { collegeId, sectionId });
  }
  await Promise.all([...scopesNeeded].map(([key, scope]) =>
    rulesOnce(rulesByScope, key, () => requestRulesForScope(context, scope.collegeId, scope.sectionId, Number(request.AdTermId)))));

  /* تاريخُ المقرّرات التي يمسّها الطلب: يقرأ منه الحكمُ طولَ لقاء الشعب ذات اليوم الواحد. */
  const habits = new Map<number, CourseNature>();
  const priorHabits = new Map<number, CourseNature>();
  await Promise.all([...new Set((request.items || []).filter(item => item.action === "change" || item.action === "add")
    .map(item => Number(item.after?.courseId || item.before?.courseId || 0)).filter(Boolean))].map(async courseId => {
    const [nature, prior] = await Promise.all([courseHabit(courseId), courseHabit(courseId, Number(request.AdTermId))]);
    if (nature) habits.set(courseId, nature);
    if (prior) priorHabits.set(courseId, prior);
  }));

  const items = (request.items || []).map((item, index) => {
    const slot = item.slots?.[0];
    const days = (item.slots || []).map(entry => entry.day as RequestDayKey);
    const original = item.rowId == null ? undefined : instructorRows.find(row => Number(row.id) === Number(item.rowId));
    const selectedCourse = context.courses.get(Number(item.after?.courseId || item.before?.courseId || 0));
    const targetCollegeId = Number(item.after?.collegeId || selectedCourse?.AdCollegeId || original?.AdCollegeId || request.AdCollegeId);
    const targetSectionId = Number(item.after?.sectionId || selectedCourse?.AdSectionId || original?.AdSectionId || request.AdSectionId);
    const rules = rulesByScope.get(`${targetCollegeId}:${targetSectionId}`)!;
    if (item.decision?.state === "fixed" || item.decision?.state === "rejected") return item;
    const companionType = String(selectedCourse?.CourseCompanionRoomType || "");
    const candidateIds = new Set(rowsForRequestSlots(item.slots || [], {}, requestIdentity(item, index)).map(row => Number(row.id)));
    const facilityWeek = [...context.allRows.filter(row => Number(row.AdInstructorId) !== Number(request.AdInstructorId)), ...rowsAfter]
      .filter(row => !candidateIds.has(Number(row.id)));
    const facilityFor = (key: string, slots: Array<{ day: string; start: string; end: string }>) => {
      const primary = rules.hallByKey.get(key);
      const building = rules.registry.buildings.find(building => building.id === primary?.buildingId);
      return rules.registry.rooms.find(room => {
        const place = rules.registry.buildings.find(building => building.id === room.buildingId);
        return room.active && room.confidence === "CONFIRMED" && room.bookingPolicy === "companion_only" && room.roomType === companionType
          && place?.active && place.confidence === "CONFIRMED" && building && place.officialCode.slice(0, 4) === building.officialCode.slice(0, 4)
          && !facilityWeek.some(row => rowOccupiesRoom(row, room.id, place.officialCode, room.canonicalCode)
            && slots.some(slot => Boolean((row as any)[slot.day]) && scheduleOverlap(slot.start, slot.end, row.fstarttime, row.fendtime)));
      });
    };
    /* ── القاعةُ الأنسب (C2) ── الإلزاميُّ في الحكم نفسه (خلوٌّ، أهلية الكلية والقسم، المرفق)، والسعةُ والتفضيلُ هنا. */
    const courseIdOfItem = Number(item.after?.courseId || item.before?.courseId || 0);
    const itemDays = new Set((item.slots || []).map(entry => String(entry.day)));
    const sameDayMine = rowsAfter.filter(row => Number(row.id) !== Number(item.rowId) && [...itemDays].some(day => Boolean((row as any)[day])));
    const rankedRooms = item.offeringRowIds?.length ? [] : rankRequestRooms(rules.knownRoomKeys.map(key => {
      const hall = rules.hallByKey.get(key), room = rules.registry.rooms.find(entry => entry.id === hall?.roomId);
      return { key, roomId: hall?.roomId ? String(hall.roomId) : undefined, buildingId: hall?.buildingId ? String(hall.buildingId) : undefined,
        capacity: Number((room as any)?.capacity || 0), fit: rules.selectedCourseFit(key, courseIdOfItem), sectionIds: (room as any)?.sectionIds || [] };
    }), {
      courseSectionId: targetSectionId,
      nearBuildingIds: new Set(sameDayMine.map(row => String((row as any).buildingId || "")).filter(Boolean)),
      previousRoomIds: new Set([original, ...instructorRows.filter(row => Number(row.AdCourseId) === courseIdOfItem)]
        .map(row => String((row as any)?.roomId || "")).filter(Boolean)),
      seats: Number(selectedCourse?.MaxStudent || 0),
      usage: roomUsageOf(context),
      facility: Boolean(companionType),
    });
    const rankedByKey = new Map(rankedRooms.map(room => [room.key, room]));
    const verdict = judgeRequest({
      rowId: item.offeringRowIds?.[0] ?? item.rowId,
      tempId: tempIdFor(index),
      slots: item.slots as any,
      relatedRowIds: item.offeringRowIds,
      action: item.action,
      AdCourseId: Number(item.after?.courseId || item.before?.courseId || 0),
      days: days.length ? days : [],
      start: slot?.start || "",
    }, {
      instructorId: Number(request.AdInstructorId),
      allRows: context.allRows,
      instructorRowsAfter: rowsAfter,
      courses: context.courses,
      instructors: context.instructors,
      cohortPairs: rules.cohortPairs,
      knownRoomKeys: item.offeringRowIds?.length ? [] : rankedRooms.map(room => room.key),
      roomCollegeId: targetCollegeId,
      roomEligible: rules.roomEligible,
      roomSlotsEligible: companionType && !item.offeringRowIds?.length ? (key, slots) => Boolean(facilityFor(key, slots)) : undefined,
      placeholderInstructorIds: placeholderInstructorIds([...context.instructors.values()]),
      roomAliases: rules.roomAliases,
      startLadder: rules.startLadder,
      dayStart: rules.dayStart,
      dayEnd: rules.dayEnd,
      windowOpen: open,
      instructorLoad: Number(context.instructors.get(Number(request.AdInstructorId))?.AdInstructorLoad || 0) || null,
      /* ورقةُ رفض القسم تعرض بدائلَ لكل بند، ولو كان متاحاً (مراجعة البروفة). */
      offerAlternatives: Boolean(options.forDepartment),
      nature: habits,
      suggestNature: priorHabits,
      termId: Number(request.AdTermId),
    });
    if (item.offeringRowIds?.length) {
      verdict.nearestTimes = [];
      const ids = new Set(item.offeringRowIds);
      const targets = rowsAfter.filter(row => ids.has(Number(row.id)));
      const week = [...context.allRows.filter(row => !ids.has(Number(row.id)) && Number(row.AdInstructorId) !== Number(request.AdInstructorId)), ...rowsAfter.filter(row => !ids.has(Number(row.id)))];
      if (findConflicts(targets, week).some(conflict => conflict.type === "room")) {
        verdict.kind = "conflict"; verdict.reasons.push({ source: "room", text: "قاعة الشعبة مشغولة في موعدها؛ يحتاج القسم معالجة الموعد.", blocking: true });
      }
    }
    const withFacility = new Map<string, { companionRoomId: string; companionRoomLabel: string }>();
    if (companionType && !item.offeringRowIds?.length) {
      for (const key of verdict.roomCandidates) {
        const facility = facilityFor(key, item.slots || []);
        if (facility) withFacility.set(key, { companionRoomId: facility.id, companionRoomLabel: `${rules.registry.buildings.find(building => building.id === facility.buildingId)?.officialCode} / ${facility.canonicalCode}` });
      }
      verdict.roomCandidates = verdict.roomCandidates.filter(key => withFacility.has(key));
      if (!verdict.roomCandidates.length) {
        verdict.kind = "conflict";
        verdict.reasons.push({ source: "room", text: "لا يتوفر المرفق المرافق المطلوب طوال الموعد. جرّب وقتاً آخر أو راجع القسم.", blocking: true });
      }
    }
    /* ── القاعةُ تتبع الموعدَ المنقول (A2/C7) ─────────────────────────────────
     * نقلُ موعدٍ قائمٍ يُبقي قاعتَه إن كانت خاليةً في الوقت الجديد — وتُقدَّم على
     * غيرها فلا تتبدّل بلا سبب. فإن شغلها غيرُه وكانت قاعاتٌ صالحةٌ خالية، فليس
     * هذا «ممنوعاً»: تُبدَّل إلى الأنسب (rankRequestRooms) ويُقال ذلك سطراً واحداً،
     * والتثبيتُ يكتب القاعةَ الجديدة. كان الصفُّ يحتفظ بقاعته المشغولة فيقول الفحصُ
     * الحيّ «القاعة مشغولة» والحكمُ نفسُه يعدّ ثلاث عشرة قاعةً خالية. */
    const originalKey = item.action === "change" && original ? roomKeyOf((original as any).roomId, original.AdRoomCode, original.AdRoomHall) : "";
    if (originalKey && verdict.roomCandidates.includes(originalKey))
      verdict.roomCandidates = [originalKey, ...verdict.roomCandidates.filter(key => key !== originalKey)];
    const originalTaken = Boolean(originalKey) && !verdict.roomCandidates.includes(originalKey) && context.allRows.some(row =>
      Number(row.id) !== Number(original!.id) && Number(row.AdInstructorId) !== Number(request.AdInstructorId)
      && rowOccupiesRoom(row, (original as any).roomId, original!.AdRoomCode, original!.AdRoomHall)
      && (item.slots || []).some(slot => Boolean((row as any)[slot.day]) && scheduleOverlap(slot.start, slot.end, row.fstarttime, row.fendtime)));
    return {
      ...item,
      ...(originalTaken && verdict.roomCandidates[0] && rules.hallByKey.get(verdict.roomCandidates[0]) ? (() => {
        const to = rules.hallByKey.get(verdict.roomCandidates[0])!;
        return { roomSwitch: { from: [original!.AdRoomCode, original!.AdRoomHall].filter(Boolean).join("/"),
          to: { roomId: String(to.roomId || ""), buildingId: String(to.buildingId || ""), room: to.room, hall: to.hall, ...withFacility.get(verdict.roomCandidates[0]) } } };
      })() : { roomSwitch: undefined }),
      courseRequirements: selectedCourse ? { CourseRoomType: selectedCourse.CourseRoomType, CourseTeachingMode: selectedCourse.CourseTeachingMode,
        CourseCompanionRoomType: selectedCourse.CourseCompanionRoomType, MaxStudent: selectedCourse.MaxStudent } : undefined,
      verdict: verdict.kind,
      reasons: verdict.reasons,
      roomCandidates: verdict.roomCandidates,
      roomAvailable: verdict.roomAvailable,
      /* تفاصيلُ أولى القاعات الخالية (مبنى وقاعة) ليُملأ بها نموذجُ الإضافة السريع: للقسم وحده. */
      roomOptions: verdict.roomCandidates.map(key => {
        const registered = rules.hallByKey.get(key);
        if (registered) return { key, room: registered.room, hall: registered.hall, buildingId: registered.buildingId, roomId: registered.roomId, ...withFacility.get(key), why: rankedByKey.get(key)?.why || [] };
        const known: any = rules.scopeRows.find(row => row.roomId && roomKeyOf(row.roomId, row.AdRoomCode, row.AdRoomHall) === key);
        return known ? { key, room: String(known.AdRoomCode || ""), hall: String(known.AdRoomHall || ""), buildingId: known.buildingId, roomId: known.roomId } : null;
      }).filter(Boolean) as any,
      nearestTimes: verdict.nearestTimes.map(entry => ({ day: entry.day, days: entry.days, start: entry.start, end: entry.end })),
      /* لا «الأنسب» للأستاذ (قرار المالك 2026-10-29): الترتيبُ أعلاه يقرّر الحجزَ لحظةَ الإرسال، ويراه القسمُ وحده. */
      shapes: verdict.shapes,
      advice: verdict.advice || (!item.offeringRowIds?.length && !rules.knownRoomKeys.length
        ? "يحتاج القسم التحقق من القاعة قبل الاعتماد؛ بيانات القاعات المتاحة غير مكتملة."
        : (() => { const hall = rules.hallByKey.get(verdict.roomCandidates[0]); const room = rules.registry.rooms.find(room => room.id === hall?.roomId);
          const fit = roomSuitability(selectedCourse, room);
          return fit.reasons.some(reason => /مختلف|أقل/.test(reason)) ? "يمكن تقديم الطلب؛ ملاءمة نوع القاعة أو سعتها تحتاج مراجعة القسم." : undefined; })()),
      block: verdict.blockMinutes || (item.slots?.length === 1 ? timeToMinutes(item.slots[0].end) - timeToMinutes(item.slots[0].start) : undefined),
    } as InstructorRequestItem;
  });

  /* ملاحظاتُ اللائحة التي لا تمنع (م.7/5 وم.7/2) كما تبدو بعد الطلب كلِّه: تُعرض للأستاذ تنبيهاً لا مانعاً. */
  const notes: Array<{ kind: "sections" | "balance"; article: string; courseIds: number[]; data?: any }> = [];
  try {
    const scopeRows = (rulesByScope.get(`${request.AdCollegeId}:${request.AdSectionId}`)?.scopeRows || []) as any[];
    const mineAfter = new Set(rowsAfter.map(row => Number(row.id)));
    const scopeAfter = scopeRows.filter(row => Number(row.AdInstructorId) !== Number(request.AdInstructorId)).concat(rowsAfter as any[]);
    const found = reviewSchedule({ rows: scopeAfter as any, courses: context.courses as any, instructors: context.instructors as any });
    const sameHour = found.find(item => item.rule === "sections-same-hour");
    if (sameHour) {
      const mine = scopeAfter.filter(row => (sameHour.rowIds || []).map(Number).includes(Number(row.id)) && mineAfter.has(Number(row.id)));
      if (mine.length) notes.push({ kind: "sections", article: "م.7/5", courseIds: [...new Set(mine.map(row => Number(row.AdCourseId)))] });
    }
    const balance = periodBalanceFinding(scopeAfter as any);
    if (balance?.data) notes.push({ kind: "balance", article: "م.7/2", courseIds: [], data: balance.data });
  } catch { /* اللائحة تنبيهٌ يُعرض، فتعذّر حسابها لا يوقف الفحص */ }

  return { ...request, items, notes } as typeof request & { notes: typeof notes };
}

/* ── قرارُ القسم على بند ─────────────────────────────────────────────────── */

export function requireInstructorRequestRevision(req: Request, res: Response, request: InstructorRequest) {
  const raw = (req.body as any)?.requestRevision;
  if (raw == null || String(raw).trim() === "" || !Number.isSafeInteger(Number(raw)) || Number(raw) < 0) {
    res.status(428).json({ error: "حدّث الطلب وأعد المحاولة؛ رقم النسخة مطلوب.", code: "request-revision-required" });
    return false;
  }
  if (Number(raw) !== Number(request.requestRevision || 0)) {
    res.status(409).json({ error: "تغيّر الطلب بعد فتحه. حدّث البيانات؛ مسودتك محفوظة.", code: "request-revision" });
    return false;
  }
  return true;
}
export function instructorRequestItemIdentity(item: InstructorRequestItem) {
  return String(item.itemId || (item.rowId != null ? `row:${item.rowId}` : `add:${(item.offeringRowIds || []).join(",")}`));
}

/**
 * توقيعُ الأستاذ على ما يرسله من بابه — الطلبُ كلُّه أو ردٌّ في حوار بند.
 * يُعيد رقمَه المطبَّع حين يطابق سجلَّه، أو "" وقد أُجيب الطلبُ بسببه.
 */
export async function verifyRequestSigner(request: InstructorRequest, req: Request, res: Response): Promise<string> {
  const signScope = `request:${request.id}`;
  const signAttempt = publicAttemptReserve(signScope, req.ip || "unknown");
  if (!signAttempt) {
    res.status(429).json({ error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." });
    return "";
  }
  const civil = normalizeCivilId(req.body?.civil);
  const civilCheck = validateCivilId(civil);
  if (!civilCheck.isValid) {
    /* فشلُ رقم التحقق يسبق أيَّ مطابقة، فلا يُقال إنه خالف بيانات البطاقة: لم تُقرأ بعدُ. */
    res.status(400).json({ error: "الرقم المدني غير مكتمل أو فيه خطأ كتابة. راجعه وأعد المحاولة." });
    return "";
  }
  const signer = (await Repository.getInstructors() as any[])
    .find(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));
  /* والجوابُ واحدٌ سواءٌ أخطأ الرقمَ أم لم يكن في سجلّه رقمٌ أصلاً: التفريقُ
     بينهما يقول لمن يجرّب أيُّ الأساتذة مسجَّلٌ رقمُه. */
  /* والرقمُ المخزونُ يُطبَّع كما يُطبَّع المُرسَل: سجلٌّ كُتب بأرقامٍ عربيةٍ أو
     فارسية — وبابُ الأساتذة يقبلها — كان `\D` يمحوه كلَّه فيصير فارغاً، فلا
     يطابق شيئاً أبداً. وصاحبُه يدخل رقمَه الصحيح فيُردّ، مرّةً بعد مرّة، بلا
     سببٍ يظهر له ولا للقسم. */
  const storedCivil = normalizeCivilId(signer?.AdInstructorCivil);
  if (!storedCivil || storedCivil !== civil) {
    res.status(403).json({ error: "الرقم المدني لا يطابق صاحب هذا الرابط." });
    return "";
  }
  signAttempt.release();
  return civil;
}

export const taPhaseId = (collegeId: number, sectionId: number, termId: number) => `${collegeId}:${sectionId}:${termId}`;
