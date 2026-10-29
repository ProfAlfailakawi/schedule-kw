/**
 * ── صفحاتُ الأستاذ والطالب العامة (/s /t /me) ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { Request, Response } from "express";
import { Repository } from "../../db/repository";
import { normalizeCivilId, sameCivilId } from "../../utils/civilId";
import { currentTermId, termPhase } from "../../utils/termSequence";
import type { ScheduleShareLink, InstructorRequest } from "../../types";
import { departmentFamilyResolver } from "../../utils/sectionLabel";
import { enrichCompanionRoomTypes } from "../../utils/companionRoomDisplay";
import { clearStaffDeviceCookie, createStaffDeviceSecretResolver, signStaffDevice, staffDeviceCookie, staffDeviceExpiry, verifyStaffDevice, STAFF_DEVICE_COOKIE } from "../staffDeviceKey";
import { individualExceptionOpen } from "../../utils/instructorRequestWindows";
import { negotiationState } from "../../utils/instructorRequestThread";
import { instructorScheduleFingerprint } from "../../utils/scheduleFingerprint";
import { isFacultyPlaceholder } from "../../utils/placeholderInstructor";
import { APPROVAL_STATUS_LABEL } from "../../utils/approvalWorkflow";
import { AR, nounFor } from "../../utils/arabicCount";
import { studentHomePage } from "../studentHomePage";
import { weeklyLoadOf } from "../../utils/instructorRequestVerdict";
import { CALENDAR_LINKS_CLIENT_JS } from "../../utils/calendarLinks";
import { withVisitingSuffix } from "../../utils/visitingText";
import { firstLast } from "../../utils/weekVisual";
import { formatScheduleTimeRange } from "../../utils/scheduleTime";
import { PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR } from "../publicTheme";
import { getCookies } from "../core/auth";
import { currentInstructorRequestGeneration, requestWindowOpen } from "../core/instructorRequests";
import { readLocationRegistry } from "../core/locations";
import { sortTermsNewestServer } from "../core/ordering";
import { demoPageHint, publicPageNonce } from "../core/publicPages";
import { weekExceptionDayKey } from "../core/scheduleRules";
import { buildSharePayload, calendarKey, publicAttemptReserve, resolveShareToken, SHARE_DAY_KEYS, SHARE_DAY_NAMES, shareDayIndexes, shareLinkStillReadable, stableCalendarPath } from "../core/shareLinks";
import { liveStaffPublication, movementHistoryScopes, scheduleMovementEntries, staffFamilyShareLinks } from "../core/staffCard";
import { visitingChecker } from "../core/visiting";
import { publicInvalidLinkPage } from "../pages/publicInvalidLinkPage";
import { staffCardPage } from "../pages/staffCardPage";
import { studentSchedulePage } from "../pages/studentSchedulePage";

/* `options.termId` يقرأ فصلاً غير فصل الرابط (رابط الطلبة: الجاري)، و
   `finalOnly` يقصر القراءة على المعتمد (finalRowsOnly) — للأبواب العامة للطلبة. */
/**
 * شارة «منتدب» في الصفحات العامة (/s و/t): الصفحةُ تحمل أنماطها بنفسها فلا تصلها أنماط التطبيق،
 * فهذه هي القاعدة نفسها (src/styles/05-schedule.css) بالاسم نفسه `visiting-badge`.
 */
const PUBLIC_VISITING_BADGE_CSS = `.visiting-badge,.meta .visiting-badge,.pill.who .visiting-badge,.pub-week .slot .visiting-badge{display:inline-flex;align-items:center;justify-content:center;flex:none;min-height:18px;padding:1px 6px;margin-inline-start:5px;border:1px solid color-mix(in srgb,var(--brass,#a8792a) 42%,var(--line));border-radius:999px;background:color-mix(in srgb,var(--brass,#a8792a) 10%,var(--card,#fff));color:color-mix(in srgb,var(--brass,#a8792a) 88%,var(--ink));font-size:11px;font-weight:700;font-style:normal;line-height:1.15;white-space:nowrap;vertical-align:middle;overflow:visible;text-overflow:clip}
@media print{.visiting-badge,.meta .visiting-badge,.pill.who .visiting-badge,.pub-week .slot .visiting-badge{border-color:#9a7a43;background:#faf5e9;color:#6e521f}}`;

/** هويةُ الأستاذ في البطاقة: رقمُه المدني، أو مفتاحُ جهازٍ موقّعٌ يحمل رقمه الداخلي («تذكّرني»). */
type StaffIdentity = string | { instructorId: number };

async function buildStaffCard(link: ScheduleShareLink, identity: StaffIdentity, requestedTermId = 0) {
  const byDevice = typeof identity === "object" && identity !== null;
  const civil = byDevice ? "" : String(identity);
  const digits = byDevice ? "" : normalizeCivilId(civil);
  if (!byDevice && digits.length < 8) return null;

  const [instructors, courses, colleges, terms, sections] = await Promise.all([
    Repository.getInstructors(), Repository.getCourses(), Repository.getColleges(), Repository.getTerms(), Repository.getSections()
  ]);
  /* مفتاحُ الجهاز يعيّن الأستاذ برقمه الداخلي، ثم تمرّ البوابات نفسها التي تمرّ بها الهوية بالرقم المدني. */
  const person = byDevice
    ? instructors.find(row => Number(row.AdInstructorId) === Number((identity as { instructorId: number }).instructorId))
    : instructors.find(row => sameCivilId(row.AdInstructorCivil, digits));
  // A demo sandbox deliberately includes fictitious civil IDs: let its
  // instructor card keep working. Production must never authenticate an
  // artificial "هيئة تدريسية" identity as a real professor.
  if (!person || (!Repository.isDemoRequest() && isFacultyPlaceholder(person))) return null;
  /* ── الرابطُ الشخصي لا يُفتح إلا لصاحبه ────────────────────────────────────
   * رابطُ القسم مع رقمِ زميلٍ مدنيّ كان يفتح بطاقةَ الزميل وتاريخَ طلباته
   * وقراراتِ القسم فيها. فالرابطُ الذي يرسله القسم لكل أستاذٍ مقيّدٌ برقمه:
   * غيرُه يلقى الجوابَ الواحد نفسه (404). ورابطُ القسم العام يبقى للجدول
   * وحده، بلا طلباتٍ ولا قراراتٍ ولا ملاحظات رفض. */
  const personal = Number(link.AdInstructorId || 0) > 0;
  if (personal && Number(link.AdInstructorId) !== Number(person.AdInstructorId)) return null;

  // Security gate: the instructor must actually appear in the link's OWN term, so
  // a wrong number and "teaches nothing" stay one indistinguishable 404 at the
  // door. Only after passing may they pin another term (Idea 2).
  const linkRows = (await Repository.getSchedulesByScope({ termId: link.AdTermId }))
    .filter(row => row.AdInstructorId === person.AdInstructorId);
  const linkTermRequests = await currentInstructorRequestGeneration((await Repository.getInstructorRequests(0, 0, Number(link.AdTermId)))
    .filter(request => Number(request.AdInstructorId) === Number(person.AdInstructorId)));
  const linkHistoryScopes = movementHistoryScopes(linkTermRequests, { collegeId: Number(link.AdCollegeId), sectionId: Number(link.AdSectionId) });
  /* ومن حُذف كلُّ ما يدرّسه في هذا الفصل بعد أن كان له فيه جدول، تُفتح بطاقتُه
     فارغةً مع حركته — ليرى ما حدث لا «لا توجد بطاقة». ومن لم يدرّس هنا قطّ
     يبقى جوابُه الـ404 الواحد نفسه. */
  if (!linkRows.length) {
    const trace = await scheduleMovementEntries(Number(person.AdInstructorId), Number(link.AdTermId), [], new Map(), { historyScopes: linkHistoryScopes });
    if (!trace.some(entry => entry.tone === "gone")) return null;
  }

  // The card covers the college that issued the link, so an instructor teaching
  // several of its sections sees one complete week rather than a fragment.
  const displayTermId = requestedTermId && terms.some(t => t.AdTermId === requestedTermId) ? requestedTermId : link.AdTermId;
  const rows = displayTermId === link.AdTermId
    ? linkRows
    : (await Repository.getSchedulesByScope({ termId: displayTermId }))
        .filter(row => row.AdInstructorId === person.AdInstructorId);

  // Every request remains attached to the lecture's real college + section.
// A link issued by one campus must never hide requests from another campus.
  /* طلباتُه في الفصل كلِّه: الطلبُ يحمل جدولَه بكل كلياته، فلا يُبحث عنه
     بكليةٍ بعينها. */
  const requestRows = displayTermId === link.AdTermId ? linkTermRequests : await currentInstructorRequestGeneration((await Repository.getInstructorRequests(0, 0, Number(displayTermId)))
    .filter(request => Number(request.AdInstructorId) === Number(person.AdInstructorId)));
  /* ── بابُ الطلب بعد الرقم المدني، في الرابطين ─────────────────────────────
     a966906 حجب روابطَ الطلب عن رابط القسم، فاختفى بابُ التعديل من بطاقة كل
     أستاذٍ فتحها من رابط القسم — وهو الطريق الذي ينشره القسم. والرقمُ المدنيُّ
     المطابَق بسجلّه (أعلاه) هو إثباتُ الهوية، كتوقيع الطلب نفسه: فلا يصل رابطُ
     الطلب إلا صاحبَه، ولا يصل قبل التحقق. ويبقى ما حماه a966906 فعلاً: الرابطُ
     الشخصيُّ لا يُفتح برقم زميل، وتاريخُ القرارات خارج رابط القسم العام. */
  const requestLinksById = new Map((await Repository.getShareLinksByIds(requestRows.map(request => request.linkId))).map(requestLink => [requestLink.id, requestLink]));
  const familyOfRequest = departmentFamilyResolver(sections);
  const familySeeds = new Map<string, { collegeId: number; sectionId: number }>();
  for (const request of requestRows) {
    const key = familyOfRequest(Number(request.AdCollegeId), Number(request.AdSectionId));
    if (!familySeeds.has(key)) familySeeds.set(key, { collegeId: Number(request.AdCollegeId), sectionId: Number(request.AdSectionId) });
  }
  /* «طلب تعديل الجدول» يتبع نشرَ بطاقة العائلة، لا روابطَ الطلب التي
     سُكّت في الماضي: إيقاف النشر يلغي ظهور النوافذ غير المستحقة. */
  const publishedFamilies = new Set<string>();
  await Promise.all([...familySeeds].map(async ([key, scope]) => {
    const links = await staffFamilyShareLinks(scope.collegeId, scope.sectionId, Number(displayTermId));
    if (links.some(liveStaffPublication)) publishedFamilies.add(key);
  }));
  const eligibleRequests: Array<{ request: InstructorRequest; windowOpen: boolean }> = [];
  for (const request of requestRows) {
    const familyKey = familyOfRequest(Number(request.AdCollegeId), Number(request.AdSectionId));
    if (!publishedFamilies.has(familyKey)) continue;
    const requestLink = requestLinksById.get(request.linkId);
    if (!requestLink || requestLink.revoked || !await shareLinkStillReadable(requestLink, terms as any)) continue;
    eligibleRequests.push({ request, windowOpen: requestWindowOpen(request) });
  }
  /* إن وصل طلبٌ فعليٌّ فلا نخفيه لصالح مسودة أحدث. أما المسوداتُ
     المتعددة في مواقع العائلة، فيظهر أحدث رابط صالح واحد فقط. */
  const respondedFamilies = new Set(eligibleRequests.filter(entry =>
    entry.windowOpen && entry.request.status !== "sent").map(entry =>
      familyOfRequest(Number(entry.request.AdCollegeId), Number(entry.request.AdSectionId))));
  const seenUnsent = new Set<string>();
  const requestLinks = eligibleRequests
    .sort((a, b) => String(b.request.createdAt).localeCompare(String(a.request.createdAt)))
    .filter(({ request, windowOpen }) => {
      const key = familyOfRequest(Number(request.AdCollegeId), Number(request.AdSectionId));
      if (!windowOpen || request.status !== "sent") return true;
      if (respondedFamilies.has(key) || seenUnsent.has(key)) return false;
      seenUnsent.add(key);
      return true;
    })
    .map(({ request, windowOpen }) => ({
      linkId: request.linkId,
      sectionId: Number(request.AdSectionId),
      sectionName: sections.find(row => Number(row.AdSectionId) === Number(request.AdSectionId))?.AdSectionName || "القسم",
      collegeName: colleges.find(item => Number(item.AdCollegeId) === Number((request as any).AdCollegeId))?.AdCollegeName || "",
      status: request.status,
      windowOpen,
      closesAt: request.window?.closesAt || "",
      proposed: (request.items || []).filter(item => negotiationState(item) === "proposed").length,
    }));

  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));

  const toMinutes = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const shaped = enrichCompanionRoomTypes(rows, rows.some(row => Boolean(row.companionRoomId)) ? (await readLocationRegistry()).rooms : [])
    .map(row => ({
      id: row.id,
      courseId: row.AdCourseId ?? null,
      code: courseById.get(row.AdCourseId)?.CourseCode || "",
      name: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
      section: row.SCode || "",
      college: colleges.find(item => Number(item.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeName || "",
      department: sections.find(item => Number(item.AdSectionId) === Number(row.AdSectionId))?.AdSectionName || "",
      start: row.fstarttime, end: row.fendtime,
      /* النطاقُ يُعرض بعقد الجامعة الواحد (النهاية - البداية، معزولاً) من
         ‎formatScheduleTimeRange‎، لا بترتيبٍ تكتبه الصفحةُ بنفسها. */
      timeRange: formatScheduleTimeRange(row.fstarttime, row.fendtime),
      days: shareDayIndexes(row),
      room: row.AdRoomCode || "", hall: row.AdRoomHall || "",
      companionRoomId: row.companionRoomId || "", companionRoomLabel: row.companionRoomLabel || "",
      companionRoomType: row.companionRoomType || ""
    }))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  const weeklyMinutes = shaped.reduce(
    (total, row) => total + Math.max(0, toMinutes(row.end) - toMinutes(row.start)) * row.days.length, 0
  );
  /* ساعاتُ التدريس على الساعة غيرُ ما يُحاسَب به النصاب: النصابُ يُعدّ بساعات
     المقرّر المعتمدة لكل شعبة (‎weeklyLoadOf‎، القاعدة نفسها التي يحكم بها فحصُ
     الطلبات). فتقول البطاقة الرقمين باسميهما، لا رقماً واحداً يُقرأ خطأً. */
  const loadUnits = weeklyLoadOf(rows as any, courseById as any);
  const byDay = SHARE_DAY_NAMES.map((name, index) => {
    const dayRows = shaped.filter(row => row.days.includes(index));
    // A gap is idle time between two of the day's own lectures — the thing an
    // instructor actually plans around.
    const gaps: Array<{ from: string; to: string; minutes: number }> = [];
    for (let i = 1; i < dayRows.length; i++) {
      const idle = toMinutes(dayRows[i].start) - toMinutes(dayRows[i - 1].end);
      if (idle >= 30) gaps.push({ from: dayRows[i - 1].end, to: dayRows[i].start, minutes: idle });
    }
    const first = dayRows[0], last = dayRows[dayRows.length - 1];
    return {
      name, rows: dayRows, gaps,
      span: first ? { from: first.start, to: last.end } : null
    };
  });

  const teachingColleges = [...new Set(shaped.map(row => row.college).filter(Boolean))];

  /* ── ما يقع في أسبوعيه القادمين، وحالةُ اعتماد كل قسمٍ يدرّس فيه ──────────
   * الإلغاءُ والتغطيةُ بتاريخٍ محدّد كانا يصلان إلى تقويمه وحده؛ البطاقةُ نفسُها
   * لا تقولهما. وحالةُ الاعتماد (قيد الإعداد… معتمد) تقول له هل جدولُه نهائي.
   * كلاهما للقراءة فقط، ولا يُكشف فيهما جدولُ أحدٍ غيره. */
  const kuwaitToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuwait", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const horizon = new Date(Date.parse(`${kuwaitToday}T00:00:00Z`) + 14 * 86400000).toISOString().slice(0, 10);
  const [termExceptions, termApprovals, displayTermRows] = await Promise.all([
    Repository.getScheduleWeekExceptions(Number(displayTermId)),
    Repository.getScheduleApprovalsForTerm(Number(displayTermId)),
    displayTermId === link.AdTermId ? Promise.resolve(null) : Repository.getSchedulesByScope({ termId: displayTermId }),
  ]);
  const allTermRows = (displayTermRows || await Repository.getSchedulesByScope({ termId: link.AdTermId })) as any[];
  const termRowById = new Map(allTermRows.map(row => [Number(row.id), row]));
  const ownIds = new Set(rows.map(row => Number(row.id)));
  const courseLabel = (row: any) => row?.AdCourseName || courseById.get(row?.AdCourseId)?.CourseName || courseById.get(row?.AdCourseId)?.CourseCode || "محاضرة";
  const upcomingEntries = termExceptions
    .filter(entry => entry.date >= kuwaitToday && entry.date <= horizon)
    .filter(entry => ownIds.has(Number(entry.scheduleId)) || (entry.kind === "cover" && Number(entry.coverInstructorId) === Number(person.AdInstructorId)));
  /* المغطّي زميلٌ قد يكون منتدباً في قسم المحاضرة المغطّاة: يُقرأ بنطاق صفّها هي. */
  const coverIsVisiting = await visitingChecker(Number(displayTermId), upcomingEntries
    .filter(entry => entry.kind === "cover" && ownIds.has(Number(entry.scheduleId)))
    .map(entry => termRowById.get(Number(entry.scheduleId))).filter(Boolean)
    .map((row: any) => ({ collegeId: row.AdCollegeId, sectionId: row.AdSectionId })));
  const upcomingExceptions = upcomingEntries
    .map(entry => {
      const row = termRowById.get(Number(entry.scheduleId));
      const mine = ownIds.has(Number(entry.scheduleId));
      return {
        date: entry.date,
        day: SHARE_DAY_NAMES[SHARE_DAY_KEYS.indexOf(weekExceptionDayKey(entry.date) as any)] || "",
        course: courseLabel(row),
        timeRange: row ? formatScheduleTimeRange(row.fstarttime, row.fendtime) : "",
        kind: !mine ? "covering" as const : entry.kind === "cancel" ? "cancelled" as const : "handed" as const,
        text: !mine ? "تغطّي هذه المحاضرة ليومٍ واحد"
          : entry.kind === "cancel" ? "أُلغيت هذا اليوم"
          : `يغطّيها ${entry.coverInstructorName ? withVisitingSuffix(entry.coverInstructorName, coverIsVisiting(entry.coverInstructorId, row?.AdCollegeId, row?.AdSectionId)) : "زميل"} هذا اليوم`,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  /* ── المنتقي يعرض فصولَ مواعيده وحدَها ───────────────────────────────────
   * أستاذٌ لا يدرّس إلا في فصلٍ واحد كانت قائمتُه تعرض كلَّ فصول النظام، وأغلبُها
   * بطاقةٌ فارغة. فالفصلُ يظهر إن كان له فيه جدول، ويبقى المعروضُ حالياً دائماً
   * ليجد المنتقي خيارَه المحدَّد. */
  /* استعلامٌ واحد مفهرس على معرّف الأستاذ، لا مسحُ جداول كل فصلٍ في الجامعة. */
  const ownTermIds = new Set((await Repository.getInstructorTeachingScopes(Number(person.AdInstructorId)))
    .flatMap(scope => scope.termIds.map(Number)));
  const termsWithOwnRows = terms.filter(term => ownTermIds.has(Number(term.AdTermId)));
  if (!termsWithOwnRows.some(term => Number(term.AdTermId) === Number(displayTermId))) {
    const shown = terms.find(term => Number(term.AdTermId) === Number(displayTermId));
    if (shown) termsWithOwnRows.push(shown);
  }
  const departmentScopes = new Map<string, { collegeId: number; sectionId: number }>();
  for (const row of rows) departmentScopes.set(`${row.AdCollegeId}:${row.AdSectionId}`, { collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId) });
  const departmentApprovals = [...departmentScopes.values()].map(scope => {
    const approval = termApprovals.find(item => Number(item.AdCollegeId) === scope.collegeId && Number(item.AdSectionId) === scope.sectionId);
    const status = approval?.status || "drafting";
    return {
      department: sections.find(item => Number(item.AdSectionId) === scope.sectionId)?.AdSectionName || "القسم",
      college: colleges.find(item => Number(item.AdCollegeId) === scope.collegeId)?.AdCollegeName || "",
      label: APPROVAL_STATUS_LABEL[status],
      status,
    };
  });

  return {
    name: person.AdInstructorName || "",
    college: teachingColleges.length > 1 ? "كل مواقعك" : (teachingColleges[0] || colleges.find(row => row.AdCollegeId === link.AdCollegeId)?.AdCollegeName || ""),
    colleges: teachingColleges,
    term: terms.find(row => row.AdTermId === displayTermId)?.AdTermName || "",
    termId: displayTermId,
    // Newest first, so the instructor can pin any semester from the card (Idea 2).
    availableTerms: sortTermsNewestServer(termsWithOwnRows).map(t => ({ id: t.AdTermId, name: t.AdTermName })),
    /* الفصل التشغيلي يأتي من حالة الفصول، لا من الرابط. رابطٌ قديم يظل باباً
       آمناً لبطاقة صاحبه، لكنه لا يجعل فصله جارياً إلى الأبد. */
    liveTermId: currentTermId(terms as any),
    /* «سابق» لفصلٍ انقضى وحده؛ القادمُ قادمٌ، ويُضاف تقويمُه من الآن. */
    termPhase: termPhase(terms.find(row => row.AdTermId === displayTermId) as any, currentTermId(terms as any)),
    expiresAt: link.expiresAt,
    /* الاستثناء الشخصي يغيّر موعد الكتابة الظاهر لهذا الأستاذ فقط. */
    requestsCloseAt: eligibleRequests.find(entry => entry.windowOpen && individualExceptionOpen(entry.request.individualException))?.request.individualException?.closesAt || link.requestsCloseAt || "",
    // The subscription key. Handed out only here — after the card has already
    // established who is holding it — so the civil ID never reaches a URL.
    calendarKey: await calendarKey(link.id, person.AdInstructorId),
    /* M3: الاشتراكُ الثابت — يتبع الأستاذ لا هذه البطاقة، فلا يموت بإعادة النشر. */
    calendarFeed: await stableCalendarPath(link.id, person.AdInstructorId),
    weeklyMinutes,
    loadUnits,
    /* أسماءُ الأعداد تُصاغ هنا بالقاعدة الواحدة (‎nounFor‎)، والصفحة تعرضها. */
    countNouns: {
      lectures: nounFor(shaped.length, AR.lecture),
      days: nounFor(byDay.filter(day => day.rows.length).length, AR.day),
      rooms: nounFor(new Set(shaped.map(row => `${row.room}/${row.hall}`).filter(value => value !== "/")).size, AR.room),
      units: nounFor(loadUnits, AR.unit),
    },
    lectureCount: shaped.length,
    dayCount: byDay.filter(day => day.rows.length).length,
    rooms: Array.from(new Set(shaped.map(row => `${row.room}/${row.hall}`).filter(value => value !== "/"))),
    longestGap: Math.max(0, ...byDay.flatMap(day => day.gaps.map(gap => gap.minutes))),
    byDay,
    rows: shaped,
    /* بطاقةٌ من رابط القسم العام لا تحمل طلباتٍ ولا قرارات؛ تقول ذلك للأستاذ. */
    personal,
    instructorId: Number(person.AdInstructorId),
    fingerprint: instructorScheduleFingerprint(rows as any),
    upcomingExceptions,
    departmentApprovals,
    requestLinks,
  };
}
const staffDeviceSecret = createStaffDeviceSecretResolver(() => process.env.STAFF_DEVICE_SECRET, () => Repository.getSharedServerSecret());
const staffCookieSecure = process.env.NODE_ENV === "production";
/* الرقمُ المدني إن أُرسل، وإلا مفتاحُ الجهاز من الكوكي — والمفتاحُ لا يصلح إلا لرمز هذا الرابط. */
async function staffIdentityFrom(req: Request, token: string): Promise<{ identity: StaffIdentity; byDevice: boolean } | null> {
  const civil = String((req.body || {}).civil || "");
  if (civil) return { identity: civil, byDevice: false };
  const raw = getCookies(req)[STAFF_DEVICE_COOKIE];
  if (!raw) return null;
  const instructorId = verifyStaffDevice(await staffDeviceSecret(), token, raw);
  return instructorId ? { identity: { instructorId }, byDevice: true } : null;
}

/**
 * ── بطاقة الأستاذ تتكلّم ────────────────────────────────────────────────────
 *
 * This is the only place in the system where a person with no account proves
 * who they are, and until now that proof was spent entirely on a read.
 *
 * Every disruption in a department begins with exactly that person — the
 * lecture they cannot give next Tuesday, the hall that is too small, the clash
 * with the exam they were told about yesterday — and it currently reaches the
 * coordinator by telephone, where it is written on nothing and lost.
 *
 * The system has no way to SEND — it does not even store an email address — but
 * it needs none in order to RECEIVE. It needs only identity, and the card has
 * already established that: the same link, the same civil ID, the same rate
 * limit, the same single indistinguishable answer for a wrong number and for
 * someone who teaches nothing.
 *
 * Three walls, because an unauthenticated write deserves them:
 *   1. The card is rebuilt from scratch, so a note can only be attached to a
 *      lecture this instructor actually teaches.
 *   2. It writes a NOTE beside an appointment. It is structurally incapable of
 *      touching the appointment — there is no path from here to a schedule row.
 *   3. A daily cap per instructor on top of the per-link rate limit.
 */
const STAFF_NOTES_PER_DAY = 8;

export function registerPublicStaffRoutes(app: Express): void {

app.post("/api/public/staff/:token/note", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "staff") { res.status(404).json({ error: "هذا الرابط ليس بطاقة أستاذ" }); return; }
  const attempt = publicAttemptReserve(token, req.ip || "unknown");
  if (!attempt) {
    res.status(429).json({ error: "محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة." });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const who = await staffIdentityFrom(req, token);
  const card = who ? await buildStaffCard(resolved.link, who.identity, Number(body.termId || 0)) : null;
  if (!card) { res.status(404).json({ error: "لا توجد بطاقة بهذا الرقم في هذا الفصل" }); return; }
  attempt.release();
  if (!card.liveTermId || Number(card.termId) !== Number(card.liveTermId)) {
    res.status(409).json({ error: "هذا الفصل للاطلاع فقط. اختر الفصل الجاري للإبلاغ." });
    return;
  }

  const scheduleId = Number(body.scheduleId || 0);
  const lecture = card.rows.find(row => row.id === scheduleId);
  // The wall that matters: a note may only be left beside a lecture that is
  // actually on this instructor's own card.
  if (!lecture) { res.status(404).json({ error: "هذا الموعد ليس ضمن جدولك" }); return; }

  /* صاحبُ البطاقة كما عيّنته البوابة نفسُها — بالرقم المدني أو بمفتاح الجهاز — لا بحثٌ ثانٍ. */
  const instructors = await Repository.getInstructors();
  const person = instructors.find(row => Number(row.AdInstructorId) === Number(card.instructorId));
  if (!person) { res.status(404).json({ error: "لا توجد بطاقة بهذا الرقم في هذا الفصل" }); return; }

  if (await Repository.countStaffNotesToday(person.AdInstructorId) >= STAFF_NOTES_PER_DAY) {
    res.status(429).json({ error: "بلغتَ حدّ الملاحظات اليومي. تواصل مع منسّق القسم مباشرة." });
    return;
  }

  const kind = body.kind === "apology" ? "apology" : "change";
  const text = String(body.text || "").trim().slice(0, 400);
  const day = (value: unknown) => {
    const raw = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : undefined;
  };
  const fromDate = day(body.fromDate), toDate = day(body.toDate);
  if (!text && kind === "change") { res.status(400).json({ error: "اكتب سطراً واحداً يوضّح المطلوب" }); return; }

  const headline = kind === "apology" ? "اعتذار عن محاضرة" : "طلب تعديل";
  const when = fromDate ? (toDate && toDate !== fromDate ? ` (${fromDate} — ${toDate})` : ` (${fromDate})`) : "";
  /* The note is filed where the LECTURE lives, not where the link points. A
     staff link is issued for a whole college with no section of its own, so
     taking the scope from the link filed every note under section zero — and
     the department's tray, which asks by section, never saw one. */
  const actual = await Repository.getScheduleById(lecture.id);
  const row = await Repository.createScheduleComment({
    SystemUserId: 0,
    userName: person.AdInstructorName || "أستاذ",
    scheduleId: lecture.id,
    AdCollegeId: Number(actual?.AdCollegeId || resolved.link.AdCollegeId),
    AdSectionId: Number(actual?.AdSectionId || 0),
    AdTermId: Number(actual?.AdTermId || card.termId),
    text: `${headline}${when}${text ? ` — ${text}` : ""}`,
    source: "staff-card",
    fromInstructorId: person.AdInstructorId,
    kind, fromDate, toDate,
  } as any);

  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  // The instructor is told it landed, so they do not phone to ask whether it did.
  res.status(201).json({ id: row.id, createdAt: row.createdAt, text: row.text });
});

/* «انسَ هذا الجهاز»: يمسح المفتاح من هذا الجهاز وحده. لا يحتاج هوية، فلا يكشف شيئاً. */
app.post("/api/public/staff/:token/forget", (req: Request, res: Response) => {
  res.setHeader("Set-Cookie", clearStaffDeviceCookie(String(req.params.token || ""), staffCookieSecure));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true });
});

app.post("/api/public/staff/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token || "");
  const resolved = await resolveShareToken(token);
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "staff") { res.status(404).json({ error: "هذا الرابط ليس بطاقة أستاذ" }); return; }
  /* فتحٌ بلا رقمٍ ولا مفتاحِ جهاز لا يُحسب محاولةً: الصفحة تسأل بصمتٍ عن جهازٍ متذكَّر. */
  if (!String(req.body?.civil || "") && !getCookies(req)[STAFF_DEVICE_COOKIE]) {
    res.status(404).json({ error: "لا توجد بطاقة بهذا الرقم في هذا الفصل" }); return;
  }
  const attempt = publicAttemptReserve(token, req.ip || "unknown");
  if (!attempt) {
    res.status(429).json({ error: "محاولات كثيرة. انتظر عشر دقائق ثم أعد المحاولة." });
    return;
  }
  const who = await staffIdentityFrom(req, token);
  // مفتاحُ جهازٍ لم يعد صالحاً يُمسح ويُطلب الرقم كالعادة — بلا تمييزٍ عن «لا بطاقة».
  if (!who) {
    if (getCookies(req)[STAFF_DEVICE_COOKIE]) res.setHeader("Set-Cookie", clearStaffDeviceCookie(token, staffCookieSecure));
    res.status(404).json({ error: "لا توجد بطاقة بهذا الرقم في هذا الفصل" }); return;
  }
  const card = await buildStaffCard(resolved.link, who.identity, Number(req.body?.termId || 0));
  // One answer for a wrong number and for someone with no lectures this term:
  // the page must not become a way to test which numbers exist.
  if (!card) {
    if (who.byDevice) res.setHeader("Set-Cookie", clearStaffDeviceCookie(token, staffCookieSecure));
    res.status(404).json({ error: "لا توجد بطاقة بهذا الرقم في هذا الفصل" }); return;
  }
  attempt.release();
  /* «تذكّرني»: بعد التحقق بالرقم المدني وحده، يُعطى الجهازُ مفتاحاً موقّعاً لهذا الرابط وهذا الأستاذ. */
  let remembered = who.byDevice;
  if (!who.byDevice && req.body?.remember === true) {
    const expiresAt = staffDeviceExpiry(resolved.link.expiresAt);
    if (expiresAt > Date.now()) {
      const value = signStaffDevice(await staffDeviceSecret(), token, Number(card.instructorId), expiresAt);
      res.setHeader("Set-Cookie", staffDeviceCookie(token, value, expiresAt, staffCookieSecure));
      remembered = true;
    }
  }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  /* «منذ زيارتك الأخيرة»: ما حُفظ من الزيارة السابقة يُعاد، ثم تُسجَّل هذه. */
  const { instructorId: cardInstructorId, fingerprint: cardFingerprint, ...visible } = card;
  const previousVisit = resolved.link.marks?.[String(cardInstructorId)];
  if (Number(card.termId) === Number(resolved.link.AdTermId)) {
    void Repository.markShareLinkInstructor(resolved.link.id, cardInstructorId, { seenAt: new Date().toISOString(), seenFingerprint: cardFingerprint }).catch(() => undefined);
  }
  res.setHeader("Cache-Control", "no-store");
  /* خريطةُ القسم التفاعلية: رابطٌ واحد يظهر في البطاقة إن كان لقسم الرابط صحيفةٌ منشورة، وإلا لا شيء. */
  const mapSectionId = Number(resolved.link.AdSectionId || 0);
  const planMapUrl = mapSectionId > 0 && (await Repository.listPublishedSheets().catch(() => [])).some(sheet => Number(sheet.AdSectionId) === mapSectionId) ? `/plans/s${mapSectionId}/` : "";
  res.json({
    ...visible,
    remembered,
    planMapUrl,
    lastSeenAt: previousVisit?.seenAt || "",
    changedSinceLastVisit: Boolean(previousVisit?.seenFingerprint) && Number(card.termId) === Number(resolved.link.AdTermId)
      && previousVisit!.seenFingerprint !== cardFingerprint,
  });
});
app.get(["/me", "/me/"], (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const track: "boys" | "girls" | "" = req.query.track === "boys" ? "boys" : req.query.track === "girls" ? "girls" : "";
  res.send(studentHomePage(publicPageNonce(res), track));
});

/** الجدولُ المعتمد للفصل الجاري، لرابط الطلبة وحده. */
app.get("/api/public/students/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (resolved.link.kind !== "students") { res.status(404).json({ error: "هذا الرابط ليس جدول الطلبة" }); return; }
  const terms = await Repository.getTerms();
  const termId = currentTermId(terms) || Number(resolved.link.AdTermId);
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  res.setHeader("Cache-Control", "no-store");
  /* المعتمد أولاً؛ وقبل الاعتماد يُعرض الجدول الحالي موسوماً «مبدئي» — قرار
     المالك ٢٠٢٦/١٠/١: الطالب يحتاجه ليخطّط تسجيله قبل التوقيع. */
  const approved = await buildSharePayload(resolved.link, { termId, finalOnly: true });
  const payload = approved.rows?.length ? approved : await buildSharePayload(resolved.link, { termId });
  res.json({ ...payload, provisional: !approved.rows?.length && Boolean(payload.rows?.length), expiresAt: undefined, label: undefined });
});

app.get("/t/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const esc = (value: string) => String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  if ("error" in resolved || resolved.link.kind !== "students") {
    res.status("error" in resolved ? resolved.status : 404).send(publicInvalidLinkPage(esc("error" in resolved ? resolved.error : "هذا الرابط ليس جدول الطلبة")));
    return;
  }
  const sections = await Repository.getSections();
  const title = sections.find(row => row.AdSectionId === resolved.link.AdSectionId)?.AdSectionName || "جدول القسم";
  res.send(studentSchedulePage(resolved.link.id, esc(title), publicPageNonce(res)));
});

app.get("/s/:token", async (req: Request, res: Response) => {
  const resolved = await resolveShareToken(String(req.params.token));
  const esc = (value: string) => String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  res.setHeader("Cache-Control", "no-store");
  // `res.type("html; charset=utf-8")` is not a shorthand Express understands —
  // it fell through to application/octet-stream, so phones offered to download
  // the page instead of showing it. Set the header outright.
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if ("error" in resolved) {
    res.status(resolved.status).send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>SCHEDULE</title><link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png"><style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}:root{${PUBLIC_LIGHT_VARS}}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal}p{font-size:15px;color:var(--muted)}</style></head><body><div style="text-align:center"><div style="font:600 13px/1 system-ui;letter-spacing:.24em;color:var(--brass)">SCHEDULE</div><p>${esc(resolved.error)}</p></div></body></html>`);
    return;
  }
  if (resolved.link.kind === "staff") {
    res.send(staffCardPage(resolved.link.id, esc(resolved.link.label || "بطاقة الأستاذ"), publicPageNonce(res), await demoPageHint(resolved.link, "staff")));
    return;
  }
  /* ── رابطُ الطلب له بابُه وحدَه ───────────────────────────────────────────
   *
   * كان هذا البابُ يُعالج «بطاقة الأستاذ» ثم يسقط بما سواها إلى جدول القسم
   * كاملاً — ومنه رابطُ الطلب. فمن نسخه من هنا أو فتحه بهذا المسار يرى جدولَ
   * القسم كلَّه بدل نموذج صاحبه: تسريبٌ لا يشتكي منه أحد، لأن الصفحةَ تُفتح
   * وتعمل.
   *
   * والتحويلُ لا المنعُ: الرمزُ رمزُ صاحبه، وإنما أُخطئ في بابه. */
  if (resolved.link.kind === "request") {
    res.redirect(302, `/r/${encodeURIComponent(resolved.link.id)}`);
    return;
  }
  /* والاستبيانُ كذلك: رابطُ الطلبة يفتح الاستبيان وحالةَ الطلب، لا جدولَ القسم. */
  if (resolved.link.kind === "survey") {
    res.redirect(302, `/q/${encodeURIComponent(resolved.link.id)}`);
    return;
  }
  /* ورابطُ الطلبة يفتح جدولَ الفصل الجاري المعتمد، لا نسخةَ الفصل الذي أُصدر فيه. */
  if (resolved.link.kind === "students") {
    res.redirect(302, `/t/${encodeURIComponent(resolved.link.id)}`);
    return;
  }
  void Repository.touchShareLink(resolved.link.id).catch(() => undefined);
  const payload = await buildSharePayload(resolved.link);
  const byDay = SHARE_DAY_NAMES.map((name, index) => ({
    name, index,
    rows: payload.rows.filter(row => row.days.includes(index)).sort((a, b) => String(a.start).localeCompare(String(b.start)))
  })).filter(day => day.rows.length);

  /**
   * The published page IS the approved report.
   *
   * The application already has one week format everyone signs off on — the
   * reports' five-column table, a day per column and the day's lectures
   * stacked inside it in time order. The share page used to draw its own
   * absolutely-positioned grid instead, with no lane logic, so two lectures
   * at the same hour painted on top of each other and one of them simply
   * vanished. A table cannot overlap by construction: every lecture is a row
   * in its day's stack, however crowded the hour. Same markup shape, same
   * borders, same order as the printed report.
   */
  /* Rows are the starting hours, read down the right edge; days run across
     the top — the exact shape of the paper sheet this page replaces. A cell
     holds whatever begins at that hour on that day. */
  const startTimes = [...new Set(payload.rows.map(row => String(row.start)))].sort();
  const slotHtml = (row: typeof payload.rows[number]) => `<span class="slot">
      <b>${esc(row.name)}</b>
      ${row.code || row.section ? `<small dir="ltr">${esc(row.code || "")}${row.section ? ` · ${esc(row.section)}` : ""}</small>` : ""}
      <time dir="ltr">${esc(row.start)} – ${esc(row.end)}</time>
      ${row.room || row.hall ? `<time dir="ltr">${esc([row.room, row.hall].filter(Boolean).join("/"))}</time>` : ""}
      ${row.instructor ? `<i>${esc(firstLast(row.instructor))}${row.visiting ? `<span class="visiting-badge compact">منتدب</span>` : ""}</i>` : ""}
    </span>`;
  const tableBody = startTimes.map(start => `<tr>
    <th class="t" dir="ltr">${esc(start)}</th>
    ${SHARE_DAY_NAMES.map((_, dayIndex) =>
      `<td>${payload.rows
        .filter(row => row.days.includes(dayIndex) && String(row.start) === start)
        .map(slotHtml).join("")}</td>`).join("")}
  </tr>`).join("");
  const expires = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date(payload.expiresAt));
  const icsUrl = `/api/public/ics/${encodeURIComponent(resolved.link.id)}`;
  const nonce = publicPageNonce(res);

  res.send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${PUBLIC_THEME_COLOR}">
<meta name="robots" content="noindex,nofollow">
<title>${esc(payload.section)} · ${esc(payload.term)}</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}
:root{${PUBLIC_LIGHT_VARS}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-size:15px;line-height:1.6;font-synthesis:none;font-kerning:normal;-webkit-font-smoothing:antialiased}
.wrap{max-width:760px;margin:0 auto;padding:24px 18px 56px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.mark{font:600 12px/1 system-ui;letter-spacing:.24em;color:var(--brass)}
h1{margin:18px 0 4px;font-size:26px;font-weight:600;letter-spacing:0}
.sub{color:var(--muted);font-size:14px}
.tools{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 8px}
.tools a{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 16px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);text-decoration:none;font-size:14px;font-weight:600}
.tools a.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
section{margin-top:26px}
h2{margin:0 0 10px;font-size:13px;font-weight:600;letter-spacing:0;color:var(--brass)}
article{display:grid;grid-template-columns:76px minmax(0,1fr);gap:14px;padding:14px 0;border-bottom:1px solid var(--line)}
article:last-child{border-bottom:0}
time{direction:ltr;font:600 14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);white-space:nowrap}
time small{display:block;color:var(--muted);font-weight:400}
b{display:block;font-size:15px;font-weight:600}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.meta span{padding:2px 9px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--muted);font-size:12px}
${PUBLIC_VISITING_BADGE_CSS}
.code{direction:ltr;unicode-bidi:isolate;color:var(--brass);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
footer{margin-top:36px;padding-top:16px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.empty{padding:48px 0;text-align:center;color:var(--muted)}
/* The approved report table, on screen: five equal day columns, the day's
   lectures stacked inside in time order. Nothing is positioned, so nothing
   can overlap. */
.pub-week{width:100%;margin-top:26px;border-collapse:collapse;table-layout:fixed;background:var(--card);border-radius:14px;overflow:hidden}
.pub-week th{padding:10px 6px;text-align:center;font-size:12.5px;font-weight:600;color:var(--brass);border:1px solid var(--line);background:rgba(19,24,23,.03)}
.pub-week td{border:1px solid var(--line);padding:0;vertical-align:top}
.pub-week th.t{width:58px;font:600 11px/1.4 ui-monospace,Menlo,monospace;color:var(--accent);vertical-align:top;padding-top:10px}
/* عنوانُ العمود «الوقت» كلمةٌ عربية: بخطٍّ أحاديّ العرض تتفكّك حروفُها
   «الـوقـت». الأرقامُ تحته تبقى أحادية العرض لتصطفّ. */
.pub-week thead th.t{font-family:inherit;font-size:11.5px;letter-spacing:0}
.pub-week tbody th.t{background:rgba(19,24,23,.02)}
.pub-week .slot{display:block;padding:9px 10px;border-bottom:1px dashed var(--line)}
.pub-week .slot:last-child{border-bottom:0}
.pub-week .slot b{display:block;font-size:12.5px;font-weight:600;line-height:1.35}
.pub-week .slot small{display:block;margin-top:1px;font:600 11px/1.4 ui-monospace,Menlo,monospace;color:var(--brass)}
.pub-week .slot{min-width:0;overflow:hidden}.pub-week .slot small,.pub-week .slot time{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pub-week .slot time{display:block;margin-top:2px;font:600 11px/1.4 ui-monospace,Menlo,monospace;color:var(--accent);white-space:nowrap}
.pub-week .slot time+time{color:var(--muted);margin-top:0}
.pub-week .slot i{display:block;margin-top:2px;font-style:normal;font-size:11px;color:var(--muted)}
.listing{margin-top:30px}
/* Phone: one chip per day with that day's real lecture count, jumping to its list. */
.daystrip{display:flex;gap:6px;margin:20px 0 0;padding:0;list-style:none}
.daystrip li{flex:1;min-width:0;display:flex}.daystrip a{flex:1;min-width:0;display:grid;justify-items:center;align-content:center;gap:3px;min-height:56px;padding:6px 2px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--ink);text-decoration:none;font-size:12px;font-weight:600}
.daystrip a b{font-size:16px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;line-height:1.2}
.daystrip a span{font-size:11px;color:var(--muted);white-space:nowrap}
.daystrip i{display:flex;gap:2px;justify-content:center;min-height:5px}.daystrip i u{inline-size:5px;block-size:5px;border-radius:50%;background:var(--accent)}
.listing section{scroll-margin-top:12px}.listing h2{display:flex;align-items:center;gap:8px}.listing h2 em{font-style:normal;min-inline-size:22px;padding:1px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:700;text-align:center;font-variant-numeric:tabular-nums}
.listing article{position:relative}.listing article::before{content:"";position:absolute;inset-block:0;inset-inline-start:83px;inline-size:2px;background:var(--line)}
@media (max-width:640px){.pub-week{display:none}}
@media (min-width:641px){.listing,.daystrip{display:none}}
@media print{
  .pub-week{display:table;background:#fff;border-radius:0}
  .pub-week th{color:#111;background:#f0f0ec;border-color:#9aa3a0}
  .pub-week td{border-color:#9aa3a0}
  .pub-week .slot{border-bottom-color:#ccc}
  .pub-week .slot b{color:#111}
  .pub-week .slot small{color:#555}
  .pub-week .slot time{color:#111}
  .pub-week .slot time+time,.pub-week .slot i{color:#444}
  .listing{display:none}
}
@media print{body{background:#fff;color:#000}.tools,.daystrip{display:none}article,header,footer{border-color:#ccc}.meta span{border-color:#ccc;background:#fff}time{color:#000}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <span style="display:inline-flex;align-items:center;gap:10px"><img src="/schedule-icon.svg" alt="" width="28" height="28" style="border-radius:8px"><span class="mark">SCHEDULE</span></span>
    <span class="sub">${esc(payload.college)}</span>
  </header>
  <h1>${esc(payload.section)}</h1>
  <p class="sub">${esc(payload.term)}</p>
  <div class="tools">
    <!-- Rewritten to webcal: on load, so a phone subscribes to the department's
         week instead of keeping one copy that stops being true after the first
         change. The https address stays as the fallback for anything that does
         not know the scheme. -->
    <a class="primary" id="icsLink" href="${icsUrl}">Apple · إضافة إلى التقويم</a>
    <a id="icsGoogle" href="${icsUrl}" target="_blank" rel="noopener">Google</a>
    <a id="icsOutlook" href="${icsUrl}" target="_blank" rel="noopener">Outlook</a>
    <script nonce="${nonce}">${CALENDAR_LINKS_CLIENT_JS}(function(){var L=calLinks(location.origin+"${icsUrl}",${JSON.stringify(String(payload.section || "الجدول")).replace(/</g, "\\u003c")});
      var a=document.getElementById("icsLink"),g=document.getElementById("icsGoogle"),o=document.getElementById("icsOutlook");
      if(a) a.href=L.apple; if(g) g.href=L.google; if(o) o.href=L.outlook;})();</script>
    <a href="javascript:window.print()">طباعة</a>
  </div>
  ${payload.rows.length ? `<table class="pub-week">
    <colgroup><col style="width:58px">${SHARE_DAY_NAMES.map(() => `<col>`).join("")}</colgroup>
    <thead><tr><th class="t">الوقت</th>${SHARE_DAY_NAMES.map(name => `<th>${esc(name)}</th>`).join("")}</tr></thead>
    <tbody>${tableBody}</tbody>
  </table>` : ""}
  ${byDay.length ? `<ul class="daystrip">${SHARE_DAY_NAMES.map((name, index) => { const day = byDay.find(d => d.index === index); return day ? `<li><a href="#day-${day.index}"><span>${esc(day.name)}</span><b>${day.rows.length}</b><i>${day.rows.slice(0, 5).map(() => "<u></u>").join("")}</i></a></li>` : `<li><a aria-disabled="true" style="opacity:.55;pointer-events:none"><span>${esc(name)}</span><b>0</b><i></i></a></li>`; }).join("")}</ul>` : ""}
  <div class="listing">
  ${byDay.length ? byDay.map(day => `<section id="day-${day.index}">
    <h2>${esc(day.name)}<em>${day.rows.length}</em></h2>
    ${day.rows.map(row => `<article>
      <time>${esc(row.start)}<small>${esc(row.end)}</small></time>
      <div>
        <b>${esc(row.name)}</b>
        <div class="meta">
          ${row.code ? `<span class="code">${esc(row.code)}</span>` : ""}
          ${row.section ? `<span>شعبة ${esc(row.section)}</span>` : ""}
          ${row.room || row.hall ? `<span>${esc([row.room, row.hall].filter(Boolean).join(" / "))}</span>` : ""}
          ${row.instructor ? `<span>${esc(row.instructor)}${row.visiting ? `<span class="visiting-badge compact">منتدب</span>` : ""}</span>` : ""}
        </div>
      </div>
    </article>`).join("")}
  </section>`).join("") : `<p class="empty">لا توجد مواعيد منشورة</p>`}
  </div>
  <footer>
    <span>عرض للقراءة فقط</span>
    <span>ينتهي ${esc(expires)}</span>
  </footer>
</div>
</body>
</html>`);
});
}
