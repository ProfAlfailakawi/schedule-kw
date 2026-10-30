/**
 * ── طلبُ الأستاذ العام (/r) ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 * الطرقُ في دالة التسجيل بعمودها الأصلي بلا إزاحة، فلا يتغيّر حرفٌ في قالبٍ نصّيّ تُرسله.
 */
import type { Express } from "express";
import { academicAdviceForScope } from "../academicAdvisoryData";
import { appendRequestThread, THREAD_TEXT_LIMIT, negotiationState } from "../../utils/instructorRequestThread";
import { historicalLectureMinutes, buildHistoricalTimeModel } from "../../utils/advancedIntelligence";
import { instructorWeekAfter } from "../../utils/instructorRequestWeek";
import { RequestReservationConflict, REQUEST_RACE_LOST, withoutRoomNames, type RequestReservationProposal } from "../../utils/instructorRequestReservations";
import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "crypto";
import { Repository } from "../../db/repository";
import { findConflicts, minutesToTime, timeToMinutes } from "../../utils/scheduleIntelligence";
import type { FSchedule, InstructorRequest, InstructorRequestItem, InstructorRequestSignature, InstructorRequestEventKind } from "../../types";
import { studyProposalPage } from "../studyProposalPage";
import { pickPreviousRequest } from "../../utils/previousTermRequest";
import { chosenAlternativeIndex } from "../../utils/requestAlternatives";
import { firstInstructorEditAt, movementAfterInstructorEdit } from "../../utils/instructorMovementWindow";
import { canConfirmUnchanged, isUnchangedConfirmed, unchangedConfirmationKind, unchangedScheduleFingerprint } from "../../utils/instructorRequestConfirmation";
import { verificationCode } from "../../utils/approvalWorkflow";
import { DAY_KEYS, DAY_NAMES, effectiveCourseHours, expectedMinutesForDay, patternsForHours } from "../../utils/scheduleRegulations";
import { planBadgesFor, serviceCourseKeys } from "../planBadgeShared";
import { dayKeysOf, DAY_LETTERS, requestItemFromRow } from "../../utils/instructorRequestItems";
import { endForRequest, headlineReasonOf, rowFromRequest, weeklyLoadOf, type RequestDayKey, type RequestedRow } from "../../utils/instructorRequestVerdict";
import { offeringStatesForTerm } from "../offeringStates";
import { pushHooks } from "../pushRoutes";
import { linkMode, modeAllowsFreeEdit, modeAllowsWrite } from "../../utils/linkMode";
import { bestPerSide, stickCandidates, stickForTeacher, topSticks, type StickAnchor, type StickJudged } from "../../utils/lectureStick";
import { offeringBlocked, offeringView, toggleInterest, type CourseInterestDoc, type CourseOfferingDoc } from "../../utils/courseOffering";
import { reachLocked, withReach } from "../../utils/courseReach";
import { reachForScope, reachOf } from "../courseReachShared";
import { allowedFor, countdown, loadRing, type TaPhaseDoc } from "../../utils/taPhase";
import { loadLimitOf, loadNisabOf } from "../../utils/teachingLoad";
import { habitualBlockMinutes } from "../../utils/courseNature";
import { isValidClock, normalizeClock } from "../../utils/scheduleTime";
import { roomKeyOf } from "../../utils/locationRegistry";
import { instructorRequestProposalIdentity } from "../../utils/instructorRequestProposalIdentity";
import { buildRequestContext, courseHabit, currentInstructorRequestGeneration, instructorRequestDepartmentScopes, instructorRequestItemIdentity, instructorRequestSectionCourses, judgeRequestItems, requestContextFor, requestItemScope, requestRulesForScope, requestWindowOpen, requireInstructorRequestRevision, resolveRequestLink, taPhaseId, verifyRequestSigner } from "../core/instructorRequests";
import { broadcastNotify } from "../core/liveChannel";
import { dataContextCacheKey } from "../core/locations";
import { arabicUiCollator, courseNameCollator } from "../core/ordering";
import { demoPageHint, publicPageNonce } from "../core/publicPages";
import { requestTokenKey } from "../core/rateLimits";
import { mixedPatternNotice } from "../core/scheduleRules";
import { calendarKey, stableCalendarPath } from "../core/shareLinks";
import { placeholderInstructorIds } from "../core/smartImport";
import { movementHistoryScopes, scheduleMovementEntries } from "../core/staffCard";
import { surveyFingerprint } from "../core/studentIdentity";
import { instructorRequestPage } from "../pages/instructorRequestPage";
import { publicInvalidLinkPage } from "../pages/publicInvalidLinkPage";

/* طلبُ الأستاذ وردُّه من رابطه العام: حدٌّ سخيٌّ لإنسانٍ يكتب، فوق عدّاد
   المحاولات الموقّعة (publicAttempts) لا بدلاً منه. */
const rateLimitPublicRequest = rateLimit({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: requestTokenKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
});

/* فتحُ بثّ الكرت الحيّ: إنسانٌ يقلّب تبويبات هاتفه لا يتجاوز بضعَ مراتٍ في الدقيقة، وإعادةُ الاتصال تتراجع أُسّياً من جهة الصفحة. والحدُّ سخيٌّ لأن شبكةَ الجامعة تشترك في عنوانٍ واحدٍ: أربعون أستاذاً يفتحون روابطهم في الدقيقة نفسها لا يُحجب منهم أحد. */
const rateLimitCardEvents = rateLimit({
  windowMs: 60_000,
  limit: 120,
  keyGenerator: requestTokenKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
});

function stripForInstructor(request: InstructorRequest) {
  return {
    ...request,
    scheduleGeneration: undefined,
    /* والتوقيعُ يصل بتاريخه ورمزه، لا ببصمته: البصمةُ تُطابَق في الخادم ولا
       تُعرض، وإرسالُها إلى المتصفّح يجعلها رقماً يُجرَّب عليه. */
    signatureHistory: undefined,
    archivedItems: undefined,
    signature: request.signature
      ? { at: request.signature.at, verifyCode: request.signature.verifyCode, fingerprint: "" }
      : undefined,
    /* سطرُ «عُدّل الموعد» يكتبه تعديلُ القسم («القاعة 7/31 ← 8/22»): يصل الأستاذَ بلا جزء القاعة أصلاً،
       وتعديلٌ لم يمسّ إلا القاعةَ لا يصله حدثاً (لا اسمَ ولا تلميحَ — المالك 2026-10-29). */
    timeline: (request.timeline || []).flatMap(event => {
      if (!event.detail) return [event];
      const detail = withoutRoomNames(event.detail);
      return detail ? [{ ...event, detail }] : [];
    }),
    items: (request.items || []).map(item => {
      /* القاعةُ لا تصل الأستاذ (قرار المالك 2026-10-29: «مخفية اكيد متعمدة»): المرشّحاتُ وتفاصيلُها،
         و«الأنسب» (roomPick في ما حُفظ قبل القرار)، والمحجوزةُ، والمبدَّلة — كلُّها للقسم. يرى roomAvailable وحده. */
      const { roomCandidates, roomOptions, offeringRows, roomPick, reservedRoom, roomSwitch, ...rest } = item;
      const itemId = instructorRequestItemIdentity(item);
      const identify = (slot: any) => ({ ...slot,
        proposalId: instructorRequestProposalIdentity(itemId, slot) });
      return {
        ...rest,
        ...(rest.decision ? { decision: { ...rest.decision,
          ...(rest.decision.alternatives ? { alternatives: rest.decision.alternatives.map(identify) } : {}) } } : {}),
        ...(rest.thread ? { thread: rest.thread.map(message => ({ ...message,
          ...(message.slots ? { slots: message.slots.map(identify) } : {}) })) } : {}),
        /* لا «كان» ولا «طلب» تحمل قاعة: الصفحةُ لا تعرضها، والقرارُ أن لا تصل. */
        before: rest.before ? { ...rest.before, room: undefined } : rest.before,
        after: rest.after ? { ...rest.after, room: undefined } : rest.after,
        /* حالةُ الحوار تُحسب هنا بالقاعدة الواحدة، والصفحةُ تعرضها ولا تستنتجها. */
        negotiation: negotiationState(rest),
        /* القرارُ يصل كما هو: سببُه وبدائلُه من حقّه. أما أسماءُ من قرّر فتبقى
           صفةً لا اسماً، وهي تُكتب كذلك أصلاً. */
      };
    }),
  };
}
const habitBlockFor = async (courseId: number, termId: number) => habitualBlockMinutes(await courseHabit(courseId), termId);

/** مدّةُ لقاءٍ ممتدٍّ من نصّ وقت البند «16:00 – 19:50» حين يكون يوماً واحداً. */
function blockMinutesOfItem(item: InstructorRequestItem | undefined): number | undefined {
  const before = item?.before;
  const m = /(\d{1,2}:\d{2})\D+(\d{1,2}:\d{2})/.exec(String(before?.time || ""));
  if (!m || String(before?.days || "").split("·").filter(part => part.trim()).length !== 1) return undefined;
  const span = timeToMinutes(m[2]) - timeToMinutes(m[1]);
  /* يومٌ واحد بطولٍ يخالف محاضرةَ ذلك اليوم (٧٥ دقيقةً يومَ خميس) يبقى طولُه إن نُقل، لا لما فوق ٨٠ وحده. */
  const dayKey = DAY_KEYS[DAY_NAMES.indexOf(String(before?.days || "").trim())];
  return span > 80 || (dayKey && span > 0 && span !== expectedMinutesForDay(dayKey)) ? span : undefined;
}

/* قرارُ القسم يخصّ ما طُلب يومَ قُرِّر. أستاذٌ رُفض بندُه فغيّر وقتَه وأعاد
   الإرسال طلب شيئاً جديداً، فلا يبقى عليه «رُفض» عن طلبٍ لم يعد قائماً — ولا
   «ثُبّت» عن موعدٍ غير الذي ثُبّت. وما لم يتغيّر يبقى قرارُه كما هو. */
function decisionStillApplies(stored: InstructorRequestItem | undefined, action: string, days: string[], start: string): boolean {
  if (!stored?.decision) return false;
  if (stored.action !== action) return false;
  if (action !== "change" && action !== "add") return true;
  const was = (stored.slots || []).map(slot => String(slot.day)).sort().join(",");
  return was === [...days].sort().join(",") && String(stored.slots?.[0]?.start || "") === start;
}

/* الإضافةُ لا معرّفَ لها يُطابَق به، فكانت كلُّ إعادةِ إرسالٍ تمحو قرارَها:
   إضافةٌ ثبّتها القسم تعود «بانتظار المراجعة»، وقد تُضاف مرّةً ثانية. فتُطابَق
   بما يعرّفها — المقرّر وموقعه وأيامه وبدايته — وكلُّ سابقةٍ تُستعمل مرّةً. */
function priorAddFor(previous: InstructorRequestItem[] | undefined, used: Set<number>, courseId: number,
  collegeId: number, sectionId: number, days: string[], start: string): InstructorRequestItem | undefined {
  const wantDays = [...days].sort().join(",");
  const index = (previous || []).findIndex((item, at) => !used.has(at)
    && item.action === "add"
    && Number(item.after?.courseId || 0) === courseId
    && Number(item.after?.collegeId || 0) === collegeId
    && Number(item.after?.sectionId || 0) === sectionId
    && (item.slots || []).map(slot => String(slot.day)).sort().join(",") === wantDays
    && String(item.slots?.[0]?.start || "") === start);
  if (index < 0) return undefined;
  used.add(index);
  return (previous || [])[index];
}

async function requestSlotsForCourse(request: InstructorRequest, courseId: number, days: RequestDayKey[], start: string, block?: number) {
  const [history, terms, course] = await Promise.all([Repository.getScheduleHistoryForCourses([courseId]), Repository.getTerms(), Repository.getCourseById(courseId)]);
  const model = buildHistoricalTimeModel(history, terms, 10, Number(request.AdTermId));
  const flags = Object.fromEntries(DAY_KEYS.map(day => [day, days.includes(day)]));
  const approved = patternsForHours(effectiveCourseHours(course)).find(pattern => days.length === 1
    ? pattern.days.length === 1 : pattern.days.length === days.length && pattern.days.every(day => days.includes(day)));
  return days.map(day => {
    /* يومٌ واحد بلا طولٍ معروفٍ للصفّ: نمطُ اليوم الواحد في اللائحة (ثلاث ساعات = ١٧٠ د) هو الطول، لا طولُ
       اليوم في تاريخ المقرّر — ذاك جاء من نمط الاثنين والأربعاء (٧٥–٨٠ د) فكان يقصّر «الأربعاء وحده» عن ساعاته
       ويمنعه بـ«لا يغطّيها» وهو نمطٌ معتمد (ملاحظة المالك r4). عادةُ المقرّر بيومٍ واحد تصل هنا `block` فتبقى أولى. */
    const length = days.length === 1 && block ? block
      : days.length === 1 && approved ? approved.minutesPerDay[0]
      : historicalLectureMinutes(model, { ...flags, AdCourseId: courseId }, day, approved?.minutesPerDay[days.length === 1 ? 0 : approved.days.indexOf(day)]);
    return { day, start, end: minutesToTime(timeToMinutes(start) + length) };
  });
}

async function instructorRequestItemsFromPayload(request: InstructorRequest, sent: any[]): Promise<InstructorRequestItem[]> {
  const before = new Map((request.items || []).map(item => [String(item.rowId ?? `add:${item.action}`), item]));
  const [courses, allowedCourseOptions] = await Promise.all([
    Repository.getCourses(),
    instructorRequestCourseOptions(request),
  ]);
  const courseName = new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const allowedCourseMap = new Map(allowedCourseOptions.map(option =>
    [`${option.collegeId}:${option.sectionId}:${option.id}`, option]));

  const items: InstructorRequestItem[] = [];
  const usedPriorAdds = new Set<number>();
  const termRows = sent.some(entry => entry?.offeringId) ? await Repository.getSchedulesByScope({ termId: Number(request.AdTermId) }) : [];
  const placeholders = sent.some(entry => entry?.offeringId) ? placeholderInstructorIds(await Repository.getInstructors()) : new Set<number>();
  const seenRows = new Set<number>();
  const seenOfferings = new Set<number>();
  for (const entry of sent) {
    const action = ["keep", "change", "delete", "add"].includes(String(entry?.action)) ? String(entry.action) : "keep";
    const rowId = entry?.rowId == null ? null : Number(entry.rowId);
    const stored = rowId == null ? undefined : before.get(String(rowId));
    if (rowId != null && !stored) throw new Error("أحد المواعيد ليس ضمن جدولك.");

    if (rowId != null && seenRows.has(rowId)) throw new Error("الموعد مكرر في الطلب.");
    if (rowId != null) seenRows.add(rowId);
    const priorById = entry?.itemId ? request.items.find(item => item.itemId === entry.itemId) : undefined;
    if (entry?.offeringId) {
      const prior = request.items.find(item => item.offeringRowIds?.includes(Number(entry.offeringId)));
      if (prior?.decision?.state === "fixed" || (prior?.decision?.state === "rejected" && !entry.retryOffering)) { items.push(prior); continue; }
      const first = termRows.find(row => Number(row.id) === Number(entry.offeringId));
      const option = first && allowedCourseMap.get(`${first.AdCollegeId}:${first.AdSectionId}:${first.AdCourseId}`);
      if (!first || !option) throw new Error("الشعبة المختارة خارج مقررات قسمك.");
      /* «لم نصل بعد»: الشعبةُ الشاغرة لمقررٍ لم يصله الفرعُ لا تُختار (ما اختير قبلُ يبقى للقسم يقرّره). */
      if (!prior && reachLocked(await reachOf(Number(first.AdCollegeId), Number(first.AdSectionId), Number(request.AdTermId), Number(first.AdCourseId)))) throw new Error("لم نصل بعد إلى مستوى هذا المقرر في هذا الفرع.");
      const group = termRows.filter(row => Number(row.AdCourseId) === Number(first.AdCourseId) && Number(row.AdSectionId) === Number(first.AdSectionId) && String(row.SCode) === String(first.SCode));
      if (!group.every(row => placeholders.has(Number(row.AdInstructorId)) && !seenOfferings.has(Number(row.id)))) throw new Error("لم تعد الشعبة متاحة للاختيار.");
      group.forEach(row => seenOfferings.add(Number(row.id)));
      const slots = group.flatMap(row => dayKeysOf(row).map(day => ({ day, start: row.fstarttime, end: row.fendtime })));
      items.push({ itemId: prior?.itemId || randomUUID(), rowId: null, action: "add", offeringRowIds: group.map(row => Number(row.id)),
        offeringRows: group.map(row => ({ id: Number(row.id), rev: Number(row.rev || 0), instructorId: Number(row.AdInstructorId) })),
        after: { courseId: option.id, courseName: option.name, collegeId: option.collegeId, sectionId: option.sectionId, collegeName: option.collegeName,
          sectionCode: String(first.SCode), days: [...new Set(slots.map(slot => DAY_LETTERS[slot.day]))].join(" · "), time: slots.map(slot => `${slot.start} – ${slot.end}`).filter((time, at, all) => all.indexOf(time) === at).join(" / ") },
        slots, excuse: String(entry.excuse || "").slice(0, 400) || undefined, thread: prior?.thread, threadHistory: prior?.threadHistory,
        decisionHistory: [...(prior?.decisionHistory || []), ...(prior?.decision ? [prior.decision] : [])], decision: undefined });
      continue;
    }
    const courseId = action === "add" ? Number(entry?.courseId || 0) : Number(stored?.before?.courseId || 0);
    const selectedCollegeId = action === "add" ? Number(entry?.collegeId || 0) : Number(request.AdCollegeId);
    const selectedSectionId = action === "add" ? Number(entry?.sectionId || 0) : Number(request.AdSectionId);
    const allowedOption = action === "add"
      ? allowedCourseMap.get(`${selectedCollegeId}:${selectedSectionId}:${courseId}`)
      : undefined;
    if (action === "add" && !allowedOption) {
      throw new Error("المقرّر المضاف ليس من كتالوج قسمك في الكلية المختارة.");
    }
    const targetScheduleScope = action === "add" ? {
      AdCollegeId: selectedCollegeId,
      AdSectionId: selectedSectionId,
    } : {};

    const days = Array.isArray(entry?.days)
      ? [...new Set((entry.days as any[]).map(String))].filter((day): day is RequestDayKey =>
          ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].includes(day))
      : [];
    const start = isValidClock(entry?.start) ? normalizeClock(entry.start) : "";
    const blockMin = blockMinutesOfItem(stored) ?? (days.length === 1 && action !== "keep" && action !== "delete" ? await habitBlockFor(courseId, Number(request.AdTermId)) : undefined);
    const originalClocks = String(stored?.before?.time || "").match(/\d{1,2}:\d{2}/g) || [];
    const originalDays = String(stored?.before?.days || "").split("·").map(day => day.trim()).sort().join("|");
    const unchanged = action === "change" && originalClocks[0] === start && days.map(day => DAY_LETTERS[day]).sort().join("|") === originalDays;
    const slots = unchanged && originalClocks[1] ? days.map(day => ({ day, start, end: originalClocks[1] }))
      : start && days.length ? await requestSlotsForCourse(request, courseId, days, start, blockMin) : [];
    const end = slots[0]?.end || "";

    const prior = action === "add" ? (priorById || priorAddFor(request.items, usedPriorAdds, courseId, selectedCollegeId, selectedSectionId, days, start)) : stored;
    if (prior?.decision?.state === "fixed") {
      if (!decisionStillApplies(prior, action, days, start)) throw new Error("سبق تثبيت هذا البند. اطلب جولة تعديل جديدة من القسم.");
      items.push(prior); continue;
    }
    const normalizedAction = unchanged ? "keep" : action;
    items.push({
      itemId: prior?.itemId || randomUUID(),
      ...(prior?.thread?.length ? { thread: prior.thread } : {}),
      threadHistory: prior?.threadHistory,
      decisionHistory: [...(prior?.decisionHistory || []), ...(prior?.decision && !decisionStillApplies(prior, action, days, start) ? [prior.decision] : [])],
      rowId,
      action: normalizedAction as any,
      before: action === "add"
        ? {
            courseId,
            courseName: allowedOption?.name || courseName.get(courseId) || "",
            ...targetScheduleScope,
            collegeId: allowedOption?.collegeId,
            collegeName: allowedOption?.collegeName,
            sectionId: allowedOption?.sectionId,
            sectionCode: "",
            days: "",
            time: "",
          }
        : stored?.before,
      after: normalizedAction === "keep" || action === "delete" ? stored?.before : {
        courseId,
        courseName: allowedOption?.name || courseName.get(courseId) || stored?.before?.courseName || "",
        ...(action === "add" && allowedOption ? {
          ...targetScheduleScope,
          collegeId: allowedOption.collegeId,
          collegeName: allowedOption.collegeName,
          sectionId: allowedOption.sectionId,
        } : {}),
        sectionCode: String(stored?.before?.sectionCode || ""),
        days: days.map(day => DAY_LETTERS[day]).join(" · "),
        time: `${start} – ${end}`,
      },
      slots,
      excuse: String(entry?.excuse || "").trim().slice(0, 400) || undefined,
      decision: action === "add"
        ? (decisionStillApplies(prior, action, days, start) ? prior?.decision : undefined)
        : decisionStillApplies(stored, action, days, start) ? stored?.decision : undefined,
    });
  }
  for (const item of request.items) if (item.decision?.state === "fixed" && !items.some(next => next.itemId === item.itemId || (item.rowId != null && next.rowId === item.rowId))) items.push(item);
  return items;
}

/**
 * الطلب الذي لم يُرسَل بعد هو نافذة على جدول الأستاذ الحي، لا صورة إصدار
 * الرابط. قد تضيف اللجنة موعداً ثانياً أو ثالثاً بعد إرسال الرابط؛ إبقاء
 * اللقطة القديمة كان يخفيه عن الأستاذ، وخصوصاً حين تحمل المواعيد الاسم نفسه.
 * بعد الإرسال تتوقف المزامنة تماماً حتى يبقى ما وقّعه الأستاذ ثابتاً.
 */
async function refreshUnsubmittedInstructorRequest(request: InstructorRequest): Promise<InstructorRequest> {
  if (request.status !== "sent") return request;
  /* جدولُه في الفصل كلِّه، بكل كلياته — ما تعرضه «بطاقتي» نفسُه. */
  const [termRows, courses, colleges] = await Promise.all([
    Repository.getSchedulesByScope({ termId: Number(request.AdTermId) }),
    Repository.getCourses(),
    Repository.getColleges(),
  ]);
  const own = (termRows as any[]).filter(row =>
    Number(row.AdInstructorId) === Number(request.AdInstructorId));
  const courseName = new Map((courses as any[]).map(row =>
    [Number(row.AdCourseId), String(row.CourseName || row.CourseCode || "")]));
  const collegeNameById = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  if (request.source === "previous-term" && !own.length) return request;
  const nextItems: InstructorRequestItem[] = own.map(row =>
    requestItemFromRow(row, courseName.get(Number(row.AdCourseId)) || String(row.AdCourseName || ""), collegeNameById));
  const shape = (items: InstructorRequestItem[]) => items.map(item => [
    Number(item.rowId || 0), item.before?.courseId, item.before?.sectionCode, item.before?.collegeId || 0,
    item.slots?.map(slot => `${slot.day}:${slot.start}:${slot.end}`).join("|"),
  ].join("~")).sort().join("||");
  if (shape(nextItems) === shape(request.items || [])) return request;
  return Repository.saveInstructorRequest({ ...request, items: nextItems });
}

/**
 * قائمة الإضافة تأتي أولاً من الجدول الأصلي المعتمد للقسم، لا من الصفوف التي
 * وصلت إلى جدول العمل بعد النسخ. قد ينسخ المنسّق مقرراً واحداً فقط، بينما
 * يحتوي أصل الهيئة على عشرات المقررات؛ الاعتماد على الحاضر يجعل البقية
 * تختفي. ندمج الأصل مع الكتالوج احتياطاً، ونوحّد المقرر بهويته ثم برمزه واسمه.
 */
type InstructorRequestCourseOption = {
  id: number;
  name: string;
  code: string;
  collegeId: number;
  collegeName: string;
  sectionId: number;
  /** مقررُ خدمةٍ تطلبه أقسامٌ أخرى: يظهر بجانبه «متطلب». */
  service?: boolean;
};

/**
 * Full operational catalogue for this academic department across every college
 * where it exists. The professor chooses the college explicitly, then a course;
 * the link's issuing college no longer limits what can be requested.
 */
async function instructorRequestCourseOptions(request: InstructorRequest): Promise<InstructorRequestCourseOption[]> {
  const scopes = await instructorRequestDepartmentScopes(request);
  const services = await serviceCourseKeys();
  const groups = await Promise.all(scopes.map(async scope => {
    /* Opening the professor request must stay cheap. The operational catalogue
     * is already the source of truth for additions; rebuilding historical
     * authority baselines for every sibling college made the public page wait
     * on heavyweight history reads before it could paint. */
    const catalogue = await instructorRequestSectionCourses(scope.sectionId);
    /* A course required by another college remains owned by its department;
       a service label cannot expand the professor's allowed course scope. */
    return (catalogue as any[])
      .filter(row => Number(row.AdSectionId) === scope.sectionId && Number(row.AdCollegeId) === scope.collegeId)
      .map(row => ({
      id: Number(row.AdCourseId || 0),
      name: String(row.CourseName || row.AdCourseName || "").trim(),
      code: String(row.CourseCode || row.AdCourseCode || "").trim(),
      collegeId: scope.collegeId,
      collegeName: scope.collegeName,
      sectionId: scope.sectionId,
      ...(services.has(`${Number(row.AdCourseId || 0)}:${scope.sectionId}`) ? { service: true } : {}),
    })).filter(option => option.id && option.name);
  }));
  const options = new Map<string, InstructorRequestCourseOption>();
  groups.flat().forEach(option => options.set(`${option.collegeId}:${option.sectionId}:${option.id}`, option));
  return [...options.values()].sort((a, b) =>
    a.collegeId === b.collegeId
      ? courseNameCollator.compare(a.name, b.name)
      : arabicUiCollator.compare(a.collegeName, b.collegeName));
}

function originalOffering(item: InstructorRequestItem, rows: FSchedule[]) {
  return rows.find(row => item.offeringRowIds?.includes(Number(row.id)));
}

/** Only a public placeholder section is exposed, never another professor's timetable. */
async function availableInstructorOfferings(request: InstructorRequest, context?: Awaited<ReturnType<typeof buildRequestContext>>) {
  const ctx = context ? requestContextFor(context, request) : await buildRequestContext(request);
  const allowed = await instructorRequestCourseOptions(request);
  const scopeKeys = new Set(allowed.map(course => `${course.collegeId}:${course.sectionId}:${course.id}`));
  const placeholders = placeholderInstructorIds([...ctx.instructors.values()]);
  const claimed = new Set(ctx.reservations.flatMap(entry => entry.offeringRowIds));
  const selected = new Set(request.items.filter(item => item.decision?.state !== "rejected").flatMap(item => item.offeringRowIds || []));
  const groups = new Map<string, FSchedule[]>();
  for (const row of ctx.officialRows) {
    if (!scopeKeys.has(`${row.AdCollegeId}:${row.AdSectionId}:${row.AdCourseId}`)) continue;
    const key = `${row.AdCollegeId}:${row.AdSectionId}:${row.AdCourseId}:${row.SCode}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const mine = instructorWeekAfter(request, ctx.allRows);
  const load = loadLimitOf(ctx.instructors.get(Number(request.AdInstructorId)));
  const result: Array<{ id: number; courseId: number; courseName: string; sectionCode: string; collegeId: number; sectionId: number; collegeName: string; slots: Array<{ day: RequestDayKey; start: string; end: string }> }> = [];
  const rulesCache = new Map<string, Awaited<ReturnType<typeof requestRulesForScope>>>();
  for (const list of groups.values()) {
    if (!list.every(row => placeholders.has(Number(row.AdInstructorId)) && !claimed.has(Number(row.id)) && !selected.has(Number(row.id)))) continue;
    /* لا نعرض شعبةً كقابلة للحجز إذا لم يكن لموعدها أي معرّف قاعة فعلي؛ وإلا
       أمكن لطلبين حجز الوقت نفسه بلا مورد مكاني يدخل سجل الحجوزات. */
    if (!list.every(row => roomKeyOf(row.roomId, row.AdRoomCode, row.AdRoomHall))) continue;
    const first = list[0], course = ctx.courses.get(Number(first.AdCourseId));
    if (load !== null && weeklyLoadOf(mine, ctx.courses as any) + effectiveCourseHours(course) > load) continue;
    const key = `${first.AdCollegeId}:${first.AdSectionId}`;
    if (!rulesCache.has(key)) rulesCache.set(key, await requestRulesForScope(ctx, Number(first.AdCollegeId), Number(first.AdSectionId), Number(request.AdTermId)));
    const rules = rulesCache.get(key)!;
    const assigned = list.map(row => ({ ...row, AdInstructorId: Number(request.AdInstructorId) }));
    const ids = new Set(list.map(row => Number(row.id)));
    const week = [...ctx.allRows.filter(row => !ids.has(Number(row.id)) && Number(row.AdInstructorId) !== Number(request.AdInstructorId)), ...mine];
    if (findConflicts(assigned, week, { cohortPairs: rules.cohortPairs, placeholderInstructorIds: placeholders }).some(conflict => conflict.type === "instructor" || conflict.type === "room")) continue;
    const option = allowed.find(option => option.id === Number(first.AdCourseId) && option.sectionId === Number(first.AdSectionId));
    result.push({ id: Number(first.id), courseId: Number(first.AdCourseId), courseName: String(course?.CourseName || ""), sectionCode: String(first.SCode || ""),
      collegeId: Number(first.AdCollegeId), sectionId: Number(first.AdSectionId), collegeName: option?.collegeName || "",
      slots: list.flatMap(row => dayKeysOf(row).map(day => ({ day, start: row.fstarttime, end: row.fendtime }))) });
  }
  return result.sort((a, b) => courseNameCollator.compare(a.courseName, b.courseName) || a.sectionCode.localeCompare(b.sectionCode));
}

async function requestReservationProposals(request: InstructorRequest): Promise<RequestReservationProposal[]> {
  const official = await Repository.getSchedulesByScope({ termId: Number(request.AdTermId) });
  return request.items.filter(item => item.action !== "keep" && item.action !== "delete" && item.decision?.state !== "fixed" && item.decision?.state !== "rejected").map(item => {
    const scope = requestItemScope(request, item);
    const existing = originalOffering(item, official);
    const rooms = existing ? []
      : (item.roomOptions || []).map(room => ({ roomId: room.roomId, buildingId: room.buildingId, room: room.room, hall: room.hall, companionRoomId: room.companionRoomId, companionRoomLabel: room.companionRoomLabel }));
    return { itemId: item.itemId!, instructorId: Number(request.AdInstructorId), collegeId: scope.collegeId, sectionId: scope.sectionId,
      courseId: Number(item.after?.courseId || item.before?.courseId), slots: item.slots || [], rooms,
      offeringRowIds: item.offeringRowIds || [], offeringRows: item.offeringRows };
  });
}

/** أنماطُ أيام اللائحة لكل مقرر — من patternsForHours وحدها، لا جدولٌ ثانٍ في الصفحة. */
async function requestDayPatterns(courseIds: number[]): Promise<Record<number, string[][]>> {
  const wanted = new Set(courseIds.filter(id => id > 0));
  if (!wanted.size) return {};
  const catalogue = await Repository.getCourses();
  const out: Record<number, string[][]> = {};
  for (const course of catalogue as any[]) {
    const id = Number(course.AdCourseId);
    if (!wanted.has(id)) continue;
    const patterns = patternsForHours(effectiveCourseHours(course)).filter(pattern => pattern.days.length > 1).map(pattern => [...pattern.days]);
    if (patterns.length) out[id] = patterns;
  }
  return out;
}

/**
 * ── ذاكرةُ الفصول ───────────────────────────────────────────────────────────
 *
 * أستاذٌ يفتح كرتَ فصلٍ جديد وقد طلب في الفصل الماضي الشيءَ نفسه. هذا المسارُ يعيد
 * له ما طلبه وكيف قُرّر فيه، ليُعيد الطلبَ بضغطةٍ إن شاء — مسودةً في صفحته لا
 * إرسالاً. يُقرأ عند الطلب لا مع فتح الكرت: مسحُ فصلٍ كاملٍ ثمنٌ لا يُدفع كلَّ
 * مرّة، ويُحفظ جوابُه دقائقَ في الذاكرة. ويمرّ بالتجريد نفسه الذي يمرّ به الطلبُ
 * الحاليّ، فلا يخرج منه ما هو للقسم وحده.
 */
const previousTermMemo = new Map<string, { at: number; value: unknown }>();

/**
 * ── بثُّ الكرت الحيّ ────────────────────────────────────────────────────────
 *
 * ردُّ القسم يصل الأستاذَ وصفحتُه مفتوحة، فيرى «قرارك» في لحظته بلا إعادة تحميل.
 * البثُّ لا يحمل شيئاً من الطلب: نوعُ الحدث ولحظتُه، والصفحةُ تسأل بعدها عن
 * جدولها بالمسار العادي نفسِه (فتبقى القراءةُ حيث التجريدُ واحد، لا نسخةً ثانية).
 * ولا يُفتح إلا بالرابط الشخصيّ نفسه، ولكل طلبٍ سقفٌ من الاتصالات، فلا يصير بابُه
 * عدّاً مفتوحاً من الاتصالات المعلّقة.
 */
const cardStreams = new Map<string, Set<Response>>();
let cardStreamTotal = 0;
const CARD_STREAMS_PER_REQUEST = 4;
const CARD_STREAMS_TOTAL = 600;
Repository.onInstructorRequestSaved(info => {
  const open = cardStreams.get(info.id);
  if (!open?.size) return;
  const payload = `event: changed\ndata: ${JSON.stringify({ kind: info.kind, at: info.at })}\n\n`;
  for (const response of open) {
    try { response.write(payload); } catch { if (open.delete(response)) cardStreamTotal -= 1; }
  }
});

/**
 * ── خريطةُ الأوقات ─────────────────────────────────────────────────────────
 *
 * بعد أن يختار الأستاذ أيامَه يرى على كل وقتِ بدايةٍ شريطاً: أخضر يمرّ، أصفر يحتاج سبب استثناء، أحمر لا يمكن. فلا
 * يجرّب الأوقاتَ واحداً واحداً ليعرف. والحكمُ هو الحكمُ نفسه (judgeRequestItems) على حزمته كلها، لا تقديرٌ ثانٍ.
 * ولا يُقرأ شيءٌ لكل وقت: السياقُ وقواعدُ النطاق تُبنى مرّةً للطلب كله، وعددُ الأوقات محدود.
 */
const rateLimitCheckTimes = rateLimit({
  windowMs: 60_000,
  limit: 90,
  keyGenerator: requestTokenKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "محاولاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد المحاولة." },
});

/**
 * ── حجزُ التحرير والتسابق (C3) ─────────────────────────────────────────────
 *
 * حين يختار الأستاذ وقتاً يُحجز له مؤقّتاً (عشر دقائق) داخل معاملة الدفتر نفسها
 * التي يمرّ بها الإرسال: أوّلُ من يختار يأخذ، ويختفي الوقتُ من خريطة زملائه عند
 * تحديثها. ومن سبقه زميلٌ يُقال له ذلك بسطرٍ واحد ومعه أقربُ بديلين صالحين —
 * من الحكم نفسه (judgeRequestItems)، لا من تقديرٍ ثانٍ. الحجزُ لا يمنع القسم.
 */
const REQUEST_HOLD_TTL_MS = 10 * 60_000;

/* ══════════════════════════════════════════════════════════════════════════════
 * ملاحظات المالك 2026-10-28 — مساراتٌ مضافة في كتلةٍ واحدة (لا تمسّ قلب الكرت):
 *   C5 حالة طرح المقرر + 🌟 الاهتمام المستقبلي · C6 لاصق بمحاضرتي · F1–F3 مرحلة التدريب
 *   L3 رصيد مقاعد المرشد. الحكمُ على أي وقتٍ = judgeRequestItems (محرّكٌ واحد).
 * ══════════════════════════════════════════════════════════════════════════════ */

/** حالةُ الطرح لكل مقرر في خيارات الكرت (نطاقُ المقرر نفسه: كليته وقسمه). */
async function offeringViewsFor(termId: number, options: Array<{ id: number; collegeId: number; sectionId: number }>) {
  const scopes = [...new Set(options.map(option => `${option.collegeId}:${option.sectionId}`))];
  const [docs, termRows] = await Promise.all([
    Promise.all(scopes.map(key => Repository.getFeatureDoc<CourseOfferingDoc>("courseOfferingStates", `${key}:${termId}`))),
    Repository.getSchedulesByScope({ termId }),
  ]);
  const docByScope = new Map(scopes.map((key, index) => [key, docs[index]]));
  const sectionsOf = (collegeId: number, sectionId: number, courseId: number) => new Set((termRows as any[])
    .filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId && Number(row.AdCourseId) === courseId)
    .map(row => String(row.SCode || row.id))).size;
  /* «لم نصل بعد» لكل فرعٍ من المصدر الواحد (courseReachShared)؛ و«افتحه للطرح» محسوبٌ فيه. */
  const reachByScope = new Map(await Promise.all(scopes.map(async key => {
    const [collegeId, sectionId] = key.split(":").map(Number);
    return [key, await reachForScope(collegeId, sectionId, termId)] as const;
  })));
  const views = new Map<string, ReturnType<typeof offeringView> & { reach?: "locked" }>();
  for (const option of options) {
    const doc = docByScope.get(`${option.collegeId}:${option.sectionId}`);
    const reach = reachByScope.get(`${option.collegeId}:${option.sectionId}`)?.courses[Number(option.id)];
    views.set(`${option.collegeId}:${option.sectionId}:${option.id}`, withReach(offeringView(doc, option.id, doc ? sectionsOf(option.collegeId, option.sectionId, option.id) : 0), reach));
  }
  return views;
}

/** ما يُرسل للكرت من مقررات القسم بعد حالة الطرح: المخفيّ لا يُرسل، والمقفل يُرسل باهتاً للنجمة. */
function coursesWithOffering<T extends { id: number; collegeId: number; sectionId: number }>(courses: T[], views: Map<string, ReturnType<typeof offeringView> & { reach?: "locked" }>) {
  return courses.flatMap(course => {
    const view = views.get(`${course.collegeId}:${course.sectionId}:${course.id}`);
    if (!view || (view.state === "offered" && view.selectable)) return [course];
    if (view.hidden) return [];
    return view.selectable
      ? [{ ...course, offeringNote: `${view.icon} ${view.line}` }]
      /* «لم نصل بعد»: السببُ سطرٌ مستقلّ تحت المقرر (tcCourseLock)، لا ذيلٌ في سطر الرمز. */
      : [{ ...course, ...(view.reach ? {} : { offeringNote: `${view.icon} ${view.line}` }), offering: { state: view.state, icon: view.icon, line: view.line, ...(view.reach ? { reach: view.reach } : {}) } }];
  });
}

/** الشعبُ الشاغرة (كرتُ الأستاذ والمدرّب): شعبةُ مقررٍ «لم نصل بعد» تُعرض رماديةً بسببها ولا تُختار. */
async function lockUnreached<T extends { courseId: number; collegeId: number; sectionId: number }>(options: T[], termId: number): Promise<Array<T & { locked?: string }>> {
  const scopes = new Map<string, Awaited<ReturnType<typeof reachForScope>>>();
  for (const option of options) {
    const key = `${option.collegeId}:${option.sectionId}`;
    if (!scopes.has(key)) scopes.set(key, await reachForScope(option.collegeId, option.sectionId, termId));
  }
  return options.map(option => {
    const reach = scopes.get(`${option.collegeId}:${option.sectionId}`)?.courses[Number(option.courseId)];
    return reachLocked(reach) ? { ...option, locked: reach!.reason } : option;
  });
}

/** مرحلةُ التدريب التي يتبعها طلبُ مدرّب: وثيقةُ نطاق الطلب. */
async function taPhaseForRequest(request: InstructorRequest) {
  return Repository.getFeatureDoc<TaPhaseDoc>("taPhases", taPhaseId(Number(request.AdCollegeId), Number(request.AdSectionId), Number(request.AdTermId)));
}

export function registerPublicRequestRoutes(app: Express): void {

/* ── بابُ الأستاذ ────────────────────────────────────────────────────────── */

app.get("/api/public/request/:token", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }

  /* أولُ فتحٍ يُسجَّل مرّةً واحدة. وهو لا يقول «وصلت الرسالة» — يقول «فُتح
     الرابط»، وهذا كلُّ ما يعرفه النظام بصدق. */
  let request = await refreshUnsubmittedInstructorRequest(resolved.request);
  const openedAt = new Date().toISOString();
  /* إعادةُ الجلب الصامتة (عودةٌ إلى الصفحة، أو بثٌّ من القسم) ليست «فتحاً»: لو عُدّت لانتفخ عدّادُ الفتح بلا أن يفتح أحد. */
  const silent = String(req.query.live || "") === "1";
  if (!silent) void Repository.touchShareLink(resolved.link.id).catch(() => undefined);

  /* تسجيلُ الفتح وقوائمُ الصفحة والحكمُ على البنود لا يعتمد أحدُها على الآخر: تُقرأ معاً، ثم يُدمج الفتحُ في النتيجة (حقولُ العدّ والحركة وحدها). */
  const [opened, [instructors, terms, courses, serviceKeys, calendarToken], judgedBeforeOpen] = await Promise.all([
    silent ? Promise.resolve(null) : Repository.recordInstructorRequestOpen(request.id, openedAt),
    Promise.all([
      Repository.getInstructors(Number(request.AdTermId)), Repository.getTerms(),
      instructorRequestCourseOptions(request),
      serviceCourseKeys(),
      calendarKey(resolved.link.id, Number(request.AdInstructorId)),
    ]),
    judgeRequestItems(request),
  ]);
  const judgedRequest = opened
    ? {
        ...judgedBeforeOpen, ...opened.fields,
        ...(opened.first && !(request.timeline || []).some(event => event.kind === "link-opened" && event.at === openedAt) ? { timeline: [...(request.timeline || []), { kind: "link-opened" as const, at: openedAt }] } : {}),
      } as typeof judgedBeforeOpen
    : judgedBeforeOpen;
  if (opened) request = { ...request, ...opened.fields, ...(opened.first && !(request.timeline || []).some(event => event.kind === "link-opened" && event.at === openedAt) ? { timeline: [...(request.timeline || []), { kind: "link-opened" as const, at: openedAt }] } : {}) };
  const person = (instructors as any[]).find(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));
  const term = (terms as any[]).find(row => Number(row.AdTermId) === Number(request.AdTermId));
  /* مقرراتُ الخدمة في هذا الطلب (موعدٌ قائم أو مضاف): يظهر بجانب اسمها «متطلب». وسمٌ فقط. */
  const serviceCourses = [...new Set([
    ...(request.items || []).map(item => {
      const courseId = Number(item.after?.courseId || item.before?.courseId || 0);
      const sectionId = Number(item.after?.sectionId || item.before?.sectionId || request.AdSectionId);
      return courseId && serviceKeys.has(`${courseId}:${sectionId}`) ? `${sectionId}:${courseId}` : "";
    }),
    ...(courses as any[]).filter(option => option.service).map(option => `${Number(option.sectionId)}:${Number(option.id)}`),
  ].filter(Boolean))];

  /* مرجع الصحيفة نفسه في الجدول، مع ضبط هوية المقرر وقسمه. */
  const planBadges = await planBadgesFor([
    ...(request.items || []).map(item => ({
      courseId: item.after?.courseId || item.before?.courseId,
      sectionId: item.after?.sectionId || item.before?.sectionId || request.AdSectionId,
    })),
    ...(courses as any[]).map(option => ({ courseId: option.id, sectionId: option.sectionId })),
  ]);

  /* E1/C4/F3: صفةُ الرابط تحكم الكتابة — للعرض فقط لا يكتب أبداً، ومرحلةُ التدريب لا تكتب إلا شعبةً شاغرة. */
  const mode = linkMode(resolved.request);
  const open = mode !== "view" && requestWindowOpen(request);
  const taDoc = mode === "ta" ? await taPhaseForRequest(request) : null;
  const taAllowed = allowedFor(taDoc, Number(request.AdInstructorId));
  const termStates = await offeringStatesForTerm(Number(request.AdTermId));
  const offerings = open ? await lockUnreached((await availableInstructorOfferings(request)).filter(option => (!taAllowed || taAllowed.has(Number(option.courseId))) && !offeringBlocked(termStates, Number(option.courseId))), Number(request.AdTermId)) : [];
  /* C5: حالةُ الطرح على مقررات الإضافة الحرّة (المخفيّ لا يُرسل، والمقفل باهتٌ بنجمة). */
  const offeringViews = mode === "edit" ? await offeringViewsFor(Number(request.AdTermId), courses as any[]) : new Map();
  const interestDocs = mode === "edit" ? await Promise.all([...new Set((courses as any[]).map(c => `${c.collegeId}:${c.sectionId}:${Number(request.AdTermId)}`))]
    .map(id => Repository.getFeatureDoc<CourseInterestDoc>("courseInterest", id))) : [];
  const interest = interestDocs.flatMap(doc => Object.entries(doc?.byCourse || {}).filter(([, ids]) => (ids as number[]).includes(Number(request.AdInstructorId))).map(([cid]) => Number(cid)));
  const taHours = mode === "ta" ? weeklyLoadOf((await Repository.getSchedulesByScope({ termId: Number(request.AdTermId) })).filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId)) as any,
    new Map((await Repository.getCourses()).map(row => [Number(row.AdCourseId), row])) as any) : 0;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    request: stripForInstructor(judgedRequest),
    serviceCourses,
    planBadges,
    instructorName: String(person?.AdInstructorName || ""),
    termName: String(term?.AdTermName || ""),
    mode,
    windowOpen: open,
    availableOfferings: offerings,
    ...(mode === "ta" ? {
      ta: taDoc ? { closesAt: taDoc.closesAt, remind: countdown(taDoc).remind } : { closesAt: request.window?.closesAt || "" },
      taLoad: loadRing(taHours, loadNisabOf(person).nisab, loadNisabOf(person).overtime, loadNisabOf(person).limited),
    } : {}),
    interest,
    /* اشتراكُ التقويم هو نفسُه المبنيّ لبطاقة الأستاذ (/m): الرابطُ الشخصيّ مفتاحُه، فلا بابَ ثانٍ ولا خلاصةَ ثانية.
       يقرأ جدولَه الرسميَّ وحدَه — ما ثبّته القسم — لا ما يُطلب ولا المسودة، ويتحدّث من نفسه عند كل تثبيت. */
    calendarFeed: `${await stableCalendarPath(resolved.link.id, Number(request.AdInstructorId))}?term=${Number(request.AdTermId)}`,
    calendarLegacyKey: calendarToken,
    /* مقررات هذا القسم العلمي في كل كليةٍ يوجد فيها؛ الكلية تُختار صراحةً قبل المقرر.
       للعرض فقط ومرحلة التدريب: لا إضافةَ حرّة، فلا مقررات. */
    courses: mode === "edit" ? coursesWithOffering(courses as any[], offeringViews) : [],
    /* أنماطُ اللائحة لكل مقرر (B1/B2/B3): مصدرُها الواحد patternsForHours — يُكمَل بها اليومُ الأول ضغطةً واحدة. */
    dayPatterns: await requestDayPatterns([...(request.items || []).map(item => Number(item.after?.courseId || item.before?.courseId || 0)), ...(courses as any[]).map(option => Number(option.id))]),
  });
});

app.post("/api/public/request/:token", rateLimitPublicRequest, async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (!requireInstructorRequestRevision(req, res, resolved.request)) return;
  if (isUnchangedConfirmed(resolved.request)) { res.status(409).json({ error: "تم تثبيت جدولك مسبقاً دون تعديلات." }); return; }
  const postMode = linkMode(resolved.request);
  if (postMode === "view") { res.status(403).json({ error: "هذا الرابط للعرض فقط." }); return; }
  if (!requestWindowOpen(resolved.request)) {
    res.status(403).json({ error: "انتهت مدّة استقبال الطلبات لهذا الفصل." });
    return;
  }
  /* F3: في مرحلة التدريب لا يُطلب إلا شعبةٌ شاغرة قائمة — لا وقتَ ولا شعبةَ ولا قاعةَ جديدة. */
  if (postMode === "ta" && (Array.isArray(req.body?.items) ? req.body.items : []).some((item: any) => item && item.action !== "keep" && !item.offeringId)) {
    res.status(400).json({ error: "في مرحلة التدريب تختار من الشعب الشاغرة فقط." });
    return;
  }
  /* C5: مقررٌ غير مطروح لا يُضاف ولو أُرسل من خارج الواجهة. */
  if (postMode === "edit") {
    const adds = (Array.isArray(req.body?.items) ? req.body.items : []).filter((item: any) => item?.action === "add" && !item.offeringId);
    if (adds.length) {
      const views = await offeringViewsFor(Number(resolved.request.AdTermId), adds.map((item: any) => ({ id: Number(item.courseId), collegeId: Number(item.collegeId), sectionId: Number(item.sectionId) })));
      if ([...views.values()].some(view => !view.selectable)) { res.status(400).json({ error: "مقررٌ مختار غير مطروح هذا الفصل." }); return; }
    }
  }
  /* ── وفصلٌ انتهى لا يُطلب فيه ─────────────────────────────────────────────
   *
   * قد يُجمَّد الفصلُ بعد إصدار الروابط: فالنافذةُ ما زالت مفتوحةً بتاريخها،
   * والجدولُ صار لا يُعدَّل. ولو قُبل الطلبُ هنا لوقف صاحبُه ينتظر قراراً لا
   * يمكن أن يقع، ولا شيءَ يقول له لماذا.
   *
   * ويُقال له بلفظٍ يخصّه: هو لا يعرف «لجنة الجدول» ولا شأنَ له بها، وإنما
   * يحتاج أن يعرف أن البابَ أُغلق وأن عليه مراجعة قسمه. */
  const closedTerm = (await Repository.getTerms())
    .find(row => Number(row.AdTermId) === Number(resolved.request.AdTermId));
  if (closedTerm?.AdTermClosed === true) {
    res.status(409).json({ error: "انتهى هذا الفصل الدراسي، ولم يعد جدولُه يقبل التعديل. راجع قسمك إن كان لديك ما يلزم." });
    return;
  }

  /* ── التوقيع ─────────────────────────────────────────────────────────────
   *
   * ضغطةُ «أرسل» وحدَها لا تُثبت شيئاً. الرابطُ يصل في واتساب، ويُعاد توجيهه
   * إلى مجموعةٍ أو زميل، ويُفتح من هاتفٍ ليس هاتفَه — فيصل القسمَ طلبٌ باسمه
   * لم يكتبه. وهو ما يُنكره عند أوّل خلاف، ولا شيء في السجلّ يردّ عليه.
   *
   * فيُطلب رقمُه المدنيُّ عند الإرسال ويُطابَق بسجلّه: الشيءُ الذي لا يعرفه
   * عنه غيرُه. وحينئذٍ تصير الضغطةُ توقيعاً.
   *
   * ولا يُحفظ الرقمُ نفسُه — بصمتُه تكفي لإثبات أنه هو — ويُحدُّ التخمينُ
   * بالحدّ نفسِه المفروض على بطاقة الأستاذ وحالة الطالب، وإلا صار البابُ
   * مجرَّبا عليه بالأرقام.
   */
  const civil = await verifyRequestSigner(resolved.request, req, res);
  if (!civil) return;

  const sent = Array.isArray(req.body?.items) ? (req.body.items as any[]) : null;
  if (!sent) { res.status(400).json({ error: "لم يصل شيء." }); return; }
  if (sent.length > 200) { res.status(400).json({ error: "عدد البنود أكبر من المعقول." }); return; }

  /* البنودُ تُعاد بناؤها من المخزون لا من المُرسَل: ما يُقبل من الصفحة أربعةُ
     حقولٍ لا غير — ما طُلب، وأيُّ مقرّر، وأيُّ أيام، وأيُّ بداية. ولو قُبل
     الباقي لأرسل من يعرف كيف يُعدّل الطلبَ لقطةً تقول ما لم يكن. */
  const before = new Map((resolved.request.items || []).map(item => [String(item.rowId), item]));
  let items: InstructorRequestItem[];
  try { items = await instructorRequestItemsFromPayload(resolved.request, sent); }
  catch (error: any) { res.status(400).json({ error: error.message || "تعذّر قراءة الطلب." }); return; }

  const judged = await judgeRequestItems({ ...resolved.request, items });

  /* الحدُّ الذي يجعل الحُكمَ حُكماً: ما مُنع لا يُقبل، ولو وصل من صفحةٍ تقول
     إنه سليم. والسببُ يُعاد إلى صاحبه ليعرف أيَّ بندٍ يُصلح. */
  const blocked = judged.items.findIndex(item => item.verdict === "conflict");
  if (blocked >= 0) {
    res.status(400).json({
      error: judged.items[blocked].reasons?.find(reason => reason.blocking)?.text || "أحد البنود لا يمكن إرساله.",
      itemIndex: blocked,
    });
    return;
  }
  /* والاستثناءُ بلا سببٍ مكتوبٍ ليس استثناءً — هو طلبٌ بلا حجّة. */
  const unexcused = judged.items.findIndex(item => item.verdict === "exception" && !item.excuse);
  if (unexcused >= 0) {
    res.status(400).json({ error: "اكتب سبب الاستثناء للبند المُعلَّم بالأصفر.", itemIndex: unexcused });
    return;
  }

  const at = new Date().toISOString();
  /* ورمزُ التحقّق يُشتقّ كما يُشتقّ رمزُ توقيع الجدول: من الطلب وصاحبه ولحظته
     — فورقةٌ في ملفٍّ بعد شهرين تُطابَق بنسخةٍ في النظام، لا تشبه غيرَها. */
  const asText = (snapshot?: { days?: string; time?: string }) => [snapshot?.days, snapshot?.time].filter(Boolean).join(" · ");
  const signature: InstructorRequestSignature = {
    at,
    fingerprint: await surveyFingerprint(civil),
    verifyCode: verificationCode(resolved.request.id, Number(resolved.request.AdInstructorId), at),
    /* ما وُقّع عليه يُحفظ لحظتَه: الطلبُ يتغيّر بعدها فلا يبقى فيه ما كان. */
    signedItems: judged.items.filter(item => item.action !== "keep").map(item => ({
      action: item.action,
      courseName: String((item.action === "add" ? item.after : item.before)?.courseName || item.after?.courseName || ""),
      ...((item.action === "add" ? item.after : item.before)?.collegeName ? { collegeName: String((item.action === "add" ? item.after : item.before)?.collegeName) } : {}),
      ...(item.action !== "add" && asText(item.before) ? { was: asText(item.before) } : {}),
      asked: item.action === "delete" ? "حذف المقرر من الجدول" : asText(item.after),
    })),
    keptCount: judged.items.filter(item => item.action === "keep").length,
  };
  const changed = judged.items.filter(item => item.action !== "keep").length;
  /* «اخترتَ بديلاً» يُسجَّل حين يطابق ما أرسله بندٌ مرفوضٌ أحدَ بدائل القسم —
     فيقرأ القسمُ في الخط الزمني أن ما عرضه قُبل، لا أنه طلبٌ جديد. */
  const alternativeEvents = sent.flatMap((entry, index) => {
    const rowId = entry?.rowId == null ? null : Number(entry.rowId);
    const stored = rowId == null
      ? (resolved.request.items || []).find(item => item.action === "add" && item.decision?.state === "rejected"
          && Number(item.after?.courseId || 0) === Number(entry?.courseId || 0))
      : before.get(String(rowId));
    if (stored?.decision?.state !== "rejected") return [];
    const chosen = chosenAlternativeIndex(stored.decision.alternatives as any, Array.isArray(entry?.days) ? entry.days.map(String) : [], String(entry?.start || ""));
    return chosen >= 0 ? [{ kind: "alternative-chosen" as InstructorRequestEventKind, at, itemIndex: index, detail: String(chosen + 1) }] : [];
  });
  /* ملاحظةُ الأستاذ العامة للقسم عن بناء جدوله: نصٌّ حرٌّ اختياري، لا يدخل في الحكم على البنود. */
  const generalNote = String(req.body?.note || "").trim().slice(0, 400);
  // Only a genuine LIVE unmodified timetable can be confirmed immediately.
  let liveRows: FSchedule[] = [];
  let unchangedConfirmed = false;
  if (changed === 0) {
    liveRows = await Repository.getSchedulesByScope({ termId: Number(resolved.request.AdTermId) });
    unchangedConfirmed = canConfirmUnchanged(judged, liveRows, generalNote, resolved.request);
  }
  let saved: InstructorRequest;
  try { saved = await Repository.saveInstructorRequest({
    ...resolved.request,
    archivedItems: [...(resolved.request.archivedItems || []), ...(resolved.request.submittedAt ? resolved.request.items.filter(old => old.action === "add" && !judged.items.some(next => next.itemId && next.itemId === old.itemId)).map(item => ({ at, item })) : [])],
    items: judged.items,
    note: generalNote || undefined,
    status: unchangedConfirmed ? "settled" : "submitted",
    submittedAt: at,
    signature,
    signatureHistory: [...(resolved.request.signatureHistory || []), ...(resolved.request.signature ? [resolved.request.signature] : [])],
    timeline: [
      ...(resolved.request.timeline || []),
      ...alternativeEvents,
      { kind: "submitted", at, detail: String(changed) },
      ...(unchangedConfirmed ? [{ kind: unchangedConfirmationKind, at }] : [{ kind: "received" as const, at, by: "القسم" }]),
    ],
  }, await requestReservationProposals(judged), unchangedConfirmed
    ? { scheduleFingerprint: unchangedScheduleFingerprint(liveRows, Number(resolved.request.AdInstructorId)) }
    : undefined); }
  catch (error: any) {
    if (error instanceof RequestReservationConflict) {
      /* سبقه زميل (C3): يُعاد الحكمُ على الدفتر كما صار، فيُعرف أيُّ بندٍ خسر وما أقربُ بديلين له. */
      const again = await judgeRequestItems({ ...resolved.request, items: judged.items }, { forDepartment: true }).catch(() => null);
      const lost = again ? again.items.findIndex(item => item.verdict === "conflict") : -1;
      res.status(409).json({ error: error.message, code: error.code, draftPreserved: true,
        ...(lost >= 0 ? { itemIndex: lost, alternatives: (again!.items[lost].nearestTimes || []).slice(0, 2) } : {}) });
      return;
    }
    throw error;
  }

  res.setHeader("Cache-Control", "no-store");
  if (!unchangedConfirmed) broadcastNotify(Repository.currentDemoSessionId());
  if (!unchangedConfirmed) await pushHooks.requestSubmitted(saved);
  res.json({ request: stripForInstructor(saved), changed, unchangedConfirmed });
});

/**
 * ── ردُّ الأستاذ في حوار البند ──────────────────────────────────────────────
 *
 * يوافق على وقتٍ اقترحه القسم — فيصير هو المطلوبَ في البند، ويبقى التثبيتُ
 * للقسم بمساره المعتاد — أو يكتب ردّه ويقترح بدايةً أخرى على أيام البند.
 * وهو توقيعٌ كالإرسال نفسه، ويبقى مفتوحاً بعد إغلاق نافذة الطلبات: الحوارُ
 * يجري بعدها، ولا يُغلقه إلا فصلٌ جُمِّد.
 */
app.post("/api/public/request/:token/reply", rateLimitPublicRequest, async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (!requireInstructorRequestRevision(req, res, resolved.request)) return;
  if (!resolved.request.submittedAt) { res.status(409).json({ error: "أرسل طلبك أولاً، ثم يبدأ الحوار مع القسم." }); return; }
  const term = (await Repository.getTerms()).find(row => Number(row.AdTermId) === Number(resolved.request.AdTermId));
  if (term?.AdTermClosed === true) {
    res.status(409).json({ error: "انتهى هذا الفصل الدراسي، ولم يعد جدولُه يقبل التعديل. راجع قسمك إن كان لديك ما يلزم." });
    return;
  }
  const index = Number(req.body?.itemIndex);
  const item = (resolved.request.items || [])[index];
  if (!item) { res.status(400).json({ error: "لا يوجد بندٌ بهذا الرقم في طلبك." }); return; }
  const itemIdentity = instructorRequestItemIdentity(item);
  if (String(req.body?.itemId || "") !== itemIdentity) { res.status(409).json({ error: "تغيّر ترتيب البنود أو محتواها. حدّث الصفحة؛ مسودتك محفوظة.", code: "request-item" }); return; }
  const civil = await verifyRequestSigner(resolved.request, req, res);
  if (!civil) return;

  const now = new Date().toISOString();
  const text = String(req.body?.text || "").trim().slice(0, THREAD_TEXT_LIMIT);
  const last = (item.thread || [])[(item.thread || []).length - 1];
  /* ما يُوافَق عليه هو آخرُ ما اقترحه القسم: رسالتُه الأخيرة، أو بدائلُ رفضه. */
  const offered = negotiationState(item) !== "proposed" ? []
    : last?.from === "department" && (last.slots || []).length ? last.slots || []
    : item.decision?.alternatives || [];
  const acceptAt = req.body?.accept == null ? -1 : Number(req.body.accept);
  let next: InstructorRequestItem = item;
  let kind: InstructorRequestEventKind = "instructor-replied";
  if (acceptAt >= 0) {
    const chosen = offered[acceptAt];
    if (!chosen) { res.status(400).json({ error: "هذا المقترح لم يعد قائماً. حدّث الصفحة." }); return; }
    if (String(req.body?.proposalId || "") !== instructorRequestProposalIdentity(itemIdentity, chosen)) {
      res.status(409).json({ error: "تغيّر المقترح بعد فتح الصفحة. حدّث البيانات قبل الموافقة.", code: "request-proposal" }); return;
    }
    const days = (chosen.days?.length ? chosen.days : [chosen.day]) as RequestDayKey[];
    const slots = await requestSlotsForCourse(resolved.request, Number((item.after || item.before)?.courseId), days, chosen.start, blockMinutesOfItem(item));
    const end = slots[0]?.end || chosen.end;
    next = {
      ...item,
      action: item.action === "keep" ? "change" : item.action,
      after: { ...(item.after || item.before || { courseId: 0, courseName: "", sectionCode: "", days: "", time: "" }),
        days: days.map(day => DAY_LETTERS[day]).join(" · "), time: `${chosen.start} – ${end}` },
      slots,
      chosenAlternative: chosen,
      /* قرارٌ سابقٌ على ما كان يُطلب لا يبقى على ما اتُّفق عليه الآن. */
      decision: undefined,
      decisionHistory: [...(item.decisionHistory || []), ...(item.decision ? [item.decision] : [])],
      ...appendRequestThread(item, { from: "instructor" as const, at: now, accepted: true, slots: [chosen], ...(text ? { text } : {}) }),
    };
    kind = "proposal-accepted";
  } else {
    const start = /^\d{1,2}:\d{2}$/.test(String(req.body?.start || "")) ? String(req.body.start) : "";
    /* الأيامُ تُقترح كما تُقترح البداية، بشرط أن يبقى عددُها: المقرّرُ له ساعاتٌ في الأسبوع، وتوزيعُها على عددٍ آخر من الأيام
       قرارٌ للقسم لا للأستاذ. فمن غيّر العددَ يُقال له، ولا يُقبل بصمت. */
    const baseDays = (item.slots || []).map(slot => slot.day);
    const dayKeys = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
    const sentDays = Array.isArray(req.body?.days)
      ? [...new Set((req.body.days as unknown[]).map(String).filter(day => dayKeys.includes(day)))] : [];
    if (sentDays.length && baseDays.length && sentDays.length !== baseDays.length) {
      res.status(400).json({ error: "يبقى عدد أيام المقرر كما هو. اختر أياماً بالعدد نفسه." });
      return;
    }
    const days = (sentDays.length ? sentDays : baseDays) as typeof baseDays;
    const proposal = start && days.length && item.action !== "delete"
      ? [{ day: days[0], days, start, end: endForRequest(days as RequestDayKey[], start, blockMinutesOfItem(item)) }] : [];
    if (!text && !proposal.length) { res.status(400).json({ error: "اكتب ردّك أو اقترح وقتاً." }); return; }
    next = {
      ...item,
      ...appendRequestThread(item, { from: "instructor" as const, at: now, ...(text ? { text } : {}), ...(proposal.length ? { slots: proposal } : {}) }),
    };
  }
  const items = [...(resolved.request.items || [])];
  items[index] = next;
  const judged = await judgeRequestItems({ ...resolved.request, items }, { forDepartment: true });
  if (acceptAt >= 0 && judged.items[index]?.verdict === "conflict") {
    res.status(409).json({ error: judged.items[index].reasons?.find(reason => reason.blocking)?.text || "المقترح لم يعد متاحاً. راجع القسم." }); return;
  }
  const signature: InstructorRequestSignature = { at: now, fingerprint: await surveyFingerprint(civil),
    verifyCode: verificationCode(resolved.request.id, Number(resolved.request.AdInstructorId), now), keptCount: 0,
    signedItems: [{ action: acceptAt >= 0 ? "accept" : "reply", courseName: String((next.after || next.before)?.courseName || ""),
      asked: acceptAt >= 0 ? String(next.after?.days || "") + " · " + String(next.after?.time || "") : text || String(req.body?.start || "") }] };
  const saved = await Repository.saveInstructorRequest({
    ...resolved.request, items: judged.items, status: "in-review", signature,
    signatureHistory: [...(resolved.request.signatureHistory || []), ...(resolved.request.signature ? [resolved.request.signature] : [])],
    timeline: [...(resolved.request.timeline || []), { kind, at: now, itemIndex: index, ...(acceptAt >= 0 ? { detail: String(acceptAt + 1) } : {}) }],
  }, acceptAt >= 0 ? await requestReservationProposals(judged) : undefined);
  res.setHeader("Cache-Control", "no-store");
  broadcastNotify(Repository.currentDemoSessionId());
  await pushHooks.teacherReplied(saved, [index], acceptAt >= 0);
  res.json({ request: stripForInstructor(await judgeRequestItems(saved)) });
});

/** One signature and one request revision for the exact set of offers shown by
 * the "accept all" sheet. Sequential replies would advance the revision after
 * the first item and make later accepts bind to a different page state. */
app.post("/api/public/request/:token/reply-batch", rateLimitPublicRequest, async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  if (!requireInstructorRequestRevision(req, res, resolved.request)) return;
  if (!resolved.request.submittedAt) { res.status(409).json({ error: "أرسل طلبك أولاً، ثم يبدأ الحوار مع القسم." }); return; }
  const term = (await Repository.getTerms()).find(row => Number(row.AdTermId) === Number(resolved.request.AdTermId));
  if (term?.AdTermClosed === true) { res.status(409).json({ error: "انتهى هذا الفصل الدراسي، ولم يعد جدولُه يقبل التعديل." }); return; }
  const accepts = Array.isArray(req.body?.accepts) ? req.body.accepts : [];
  if (!accepts.length || accepts.length > 100) { res.status(400).json({ error: "لا توجد قرارات صالحة لإرسالها." }); return; }
  const indexes = new Set<number>();
  const items = [...resolved.request.items];
  const now = new Date().toISOString();
  const signedItems: InstructorRequestSignature["signedItems"] = [];
  for (const accepted of accepts) {
    const index = Number(accepted?.itemIndex);
    const item = items[index];
    if (!item || indexes.has(index)) { res.status(409).json({ error: "تغيّرت قائمة القرارات. حدّث الصفحة قبل الموافقة.", code: "request-item" }); return; }
    indexes.add(index);
    const itemId = instructorRequestItemIdentity(item);
    if (String(accepted?.itemId || "") !== itemId) { res.status(409).json({ error: "تغيّر ترتيب البنود أو محتواها. حدّث الصفحة؛ مسودتك محفوظة.", code: "request-item" }); return; }
    const last = (item.thread || []).at(-1);
    const offered = negotiationState(item) !== "proposed" ? []
      : last?.from === "department" && (last.slots || []).length ? last.slots || [] : item.decision?.alternatives || [];
    const proposalId = String(accepted?.proposalId || "");
    const chosen = offered.find(slot => instructorRequestProposalIdentity(itemId, slot) === proposalId);
    if (!chosen) { res.status(409).json({ error: "تغيّر أحد المقترحات بعد فتح صفحة الموافقة. حدّث البيانات قبل التوقيع.", code: "request-proposal" }); return; }
    const days = (chosen.days?.length ? chosen.days : [chosen.day]) as RequestDayKey[];
    const slots = await requestSlotsForCourse(resolved.request, Number((item.after || item.before)?.courseId), days, chosen.start, blockMinutesOfItem(item));
    const end = slots[0]?.end || chosen.end;
    items[index] = {
      ...item,
      action: item.action === "keep" ? "change" : item.action,
      after: { ...(item.after || item.before || { courseId: 0, courseName: "", sectionCode: "", days: "", time: "" }),
        days: days.map(day => DAY_LETTERS[day]).join(" · "), time: `${chosen.start} – ${end}` },
      slots, chosenAlternative: chosen, decision: undefined,
      decisionHistory: [...(item.decisionHistory || []), ...(item.decision ? [item.decision] : [])],
      ...appendRequestThread(item, { from: "instructor" as const, at: now, accepted: true, slots: [chosen] }),
    };
    signedItems.push({ action: "accept", courseName: String((items[index].after || items[index].before)?.courseName || ""),
      asked: String(items[index].after?.days || "") + " · " + String(items[index].after?.time || "") });
  }
  const civil = await verifyRequestSigner(resolved.request, req, res);
  if (!civil) return;
  const judged = await judgeRequestItems({ ...resolved.request, items }, { forDepartment: true });
  const conflict = [...indexes].map(index => judged.items[index]).find(item => item.verdict === "conflict");
  if (conflict) { res.status(409).json({ error: conflict.reasons?.find(reason => reason.blocking)?.text || "أحد المواعيد لم يعد متاحاً. راجع القسم." }); return; }
  const signature: InstructorRequestSignature = { at: now, fingerprint: await surveyFingerprint(civil),
    verifyCode: verificationCode(resolved.request.id, Number(resolved.request.AdInstructorId), now), keptCount: 0, signedItems };
  const saved = await Repository.saveInstructorRequest({ ...resolved.request, items: judged.items, status: "in-review", signature,
    signatureHistory: [...(resolved.request.signatureHistory || []), ...(resolved.request.signature ? [resolved.request.signature] : [])],
    timeline: [...(resolved.request.timeline || []), ...[...indexes].map(itemIndex => ({ kind: "proposal-accepted" as const, at: now, itemIndex }))],
  }, await requestReservationProposals(judged));
  res.setHeader("Cache-Control", "no-store"); broadcastNotify(Repository.currentDemoSessionId());
  await pushHooks.teacherReplied(saved, [...indexes], true);
  res.json({ request: stripForInstructor(await judgeRequestItems(saved)) });
});

/**
 * فحصُ موضعٍ واحدٍ قبل الإرسال.
 *
 * الصفحةُ تسأل عند كل تغيير، فيُقاس على الجدول الحقيقي لحظتَها: وقتٌ كان
 * متاحاً حين فُتح الرابط قد يكون أُخذ الآن. ولا يكتب شيئاً — سؤالٌ وجواب.
 */
app.post("/api/public/request/:token/check", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }

  const action = req.body?.action === "add" ? "add" : "change";
  const rowId = req.body?.rowId == null ? null : Number(req.body.rowId);
  const known = (resolved.request.items || []).find(item => item.rowId === rowId);
  if (action !== "add" && rowId != null && !known) { res.status(400).json({ error: "هذا الموعد ليس ضمن جدولك." }); return; }

  const selectedCollegeId = action === "add" ? Number(req.body?.collegeId || 0) : Number(resolved.request.AdCollegeId);
  const selectedSectionId = action === "add" ? Number(req.body?.sectionId || 0) : Number(resolved.request.AdSectionId);
  const courseId = action === "add" ? Number(req.body?.courseId || 0) : Number(known?.before?.courseId || 0);
  if (action === "add") {
    const allowed = (await instructorRequestCourseOptions(resolved.request)).some(option =>
      option.id === courseId && option.collegeId === selectedCollegeId && option.sectionId === selectedSectionId);
    if (!allowed) {
      res.status(400).json({ error: "المقرّر المضاف ليس من كتالوج قسمك في الكلية المختارة." });
      return;
    }
  }

  const sent = Array.isArray(req.body?.items) ? (req.body.items as any[]) : [{
    rowId,
    action,
    courseId: action === "add" ? courseId : undefined,
    collegeId: action === "add" ? selectedCollegeId : undefined,
    sectionId: action === "add" ? selectedSectionId : undefined,
    days: req.body?.days,
    start: req.body?.start,
  }];
  const requested: RequestedRow = {
    rowId: action === "add" ? null : rowId,
    action,
    AdCourseId: courseId,
    days: Array.isArray(req.body?.days) ? (req.body.days as any[]).map(String).filter((day): day is RequestDayKey =>
      ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].includes(day)) : [],
    start: /^\d{1,2}:\d{2}$/.test(String(req.body?.start || "")) ? String(req.body.start) : "",
  };
  const base = action === "add" ? {
    AdCollegeId: selectedCollegeId,
    AdSectionId: selectedSectionId,
    AdTermId: resolved.request.AdTermId,
    AdInstructorId: resolved.request.AdInstructorId,
    AdCourseId: courseId,
  } : {};
  const candidate = rowFromRequest(requested, base as any);
  void candidate;
  const itemIndex = Number.isInteger(Number(req.body?.itemIndex)) ? Number(req.body.itemIndex) : -1;
  let draftItems: InstructorRequestItem[];
  try {
    draftItems = await instructorRequestItemsFromPayload(resolved.request, sent);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "تعذر فحص هذا البند." });
    return;
  }

  const judged = await judgeRequestItems({ ...resolved.request, items: draftItems });
  const fallbackCourseId = courseId;
  const item = judged.items[itemIndex >= 0 ? itemIndex : 0] || judged.items.find(entry =>
    action === "add" ? entry.action === "add" && Number(entry.after?.courseId) === fallbackCourseId : Number(entry.rowId) === rowId);
  if (!item) { res.status(400).json({ error: "تعذر فحص هذا البند." }); return; }

  res.setHeader("Cache-Control", "no-store");
  /* القاعاتُ المرشّحة لا تُرسل: هذا المسار يخاطب صفحةَ الأستاذ. */
  res.json({
    kind: item.verdict || "clear",
    headline: headlineReasonOf(item.reasons)?.text || (item.verdict === "conflict" ? "هذا الموعد غير متاح." : item.verdict === "exception" ? "يحتاج سبب استثناء." : "الوقت متاح"),
    computedEnd: item.slots?.[0]?.end || "",
    roomAvailable: item.roomAvailable ?? null,
    nearestTimes: (item.nearestTimes || []).map(slot => ({ day: slot.day, days: slot.days, start: slot.start, end: slot.end })),
    shapes: item.shapes || [],
    advice: item.advice || "",
    block: item.block || 0,
    /* الخلطُ الممنوع يُرسم: النمطُ المختار بجانب المعتمد من مكتبة الأنماط. */
    ...((item.reasons || []).some((reason: any) => reason.blocking && /لا يُخلط/.test(String(reason.text || "")))
      ? { patternNotice: await mixedPatternNotice(Number(item.after?.courseId || item.before?.courseId || 0), (item.slots || []).map(slot => slot.day as RequestDayKey), Number(resolved.request.AdTermId), undefined, true).catch(() => null) }
      : {}),
    notes: ((judged as any).notes || [])
      /* نسبةُ الصباح والمساء حالُ القسم كلِّه ولا يملك الأستاذ تغييرها: تبقى في شاشة القسم ولا تُعرض له. */
      .filter((note: any) => note.kind !== "balance" && note.courseIds.includes(Number(item.after?.courseId || item.before?.courseId || 0)))
      .map((note: any) => ({ kind: note.kind, article: note.article, ...(note.data ? { data: note.data } : {}) })),
  });
});

/** Professor card: only aggregate, course-relevant suggestions for scopes on this link. */
app.get("/api/public/request/:token/academic-advice", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  const request = resolved.request;
  const scopes = new Map<string, { collegeId: number; sectionId: number }>();
  const put = (collegeId: number, sectionId: number) => {
    if (collegeId > 0 && sectionId > 0) scopes.set(collegeId + ":" + sectionId, { collegeId, sectionId });
  };
  put(Number(request.AdCollegeId), Number(request.AdSectionId));
  for (const item of request.items || []) {
    const scope = requestItemScope(request, item);
    put(Number(scope.collegeId), Number(scope.sectionId));
  }
  /* A professor can ADD any permitted department course, not only change the ones already on their card. */
  const allowedOptions = await instructorRequestCourseOptions(request);
  for (const option of allowedOptions) put(Number(option.collegeId), Number(option.sectionId));
  const owned = new Set([
    ...(request.items || []).map(item => Number(item.after?.courseId || item.before?.courseId || 0)),
    ...allowedOptions.map(option => Number(option.id)),
  ].filter(Boolean));
  try {
    const lists = await Promise.all([...scopes.values()].slice(0, 12).map(scope =>
      academicAdviceForScope(scope.collegeId, scope.sectionId, Number(request.AdTermId))));
    const pairs = lists.flatMap(reading => reading.pairs).filter(pair => owned.has(pair.a) || owned.has(pair.b));
    const timePreferences = lists.flatMap(reading => reading.timePreferences || []).filter(item => owned.has(item.courseId));
    res.setHeader("Cache-Control", "no-store");
    res.json({ pairs, timePreferences, nonBlocking: true });
  } catch {
    res.setHeader("Cache-Control", "no-store");
    res.json({ pairs: [], timePreferences: [], nonBlocking: true }); // advisory outage never blocks the teacher
  }
});

/** فحصٌ دفعي لمسودة الأستاذ: سياق الجدول وقواعد كل قسم يُبنيان مرةً واحدةً للحزمة. */
app.post("/api/public/request/:token/check-batch", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  const sent = Array.isArray(req.body?.items) ? req.body.items as any[] : [];
  if (sent.length > 80) { res.status(400).json({ error: "تجاوزت المسودة الحد الأقصى للبنود." }); return; }
  try {
    const allowedCourses = sent.some(item => item?.action === "add") ? await instructorRequestCourseOptions(resolved.request) : [];
    for (const item of sent) {
      const rowId = item?.rowId == null ? null : Number(item.rowId);
      if (item?.action !== "add" && rowId != null && !(resolved.request.items || []).some(row => Number(row.rowId) === rowId)) {
        res.status(400).json({ error: "هذا الموعد ليس ضمن جدولك." }); return;
      }
      if (item?.action === "add" && !allowedCourses.some(option => option.id === Number(item.courseId) && option.collegeId === Number(item.collegeId) && option.sectionId === Number(item.sectionId))) {
        res.status(400).json({ error: "المقرّر المضاف ليس من كتالوج قسمك في الكلية المختارة." }); return;
      }
    }
    const draftItems = await instructorRequestItemsFromPayload(resolved.request, sent);
    const judged = await judgeRequestItems({ ...resolved.request, items: draftItems });
    const results = await Promise.all(judged.items.map(async (item, itemIndex) => {
      if (item.action !== "add" && item.action !== "change") return null;
      const courseId = Number(item.after?.courseId || item.before?.courseId || 0);
      const itemNotes = ((judged as any).notes || []).filter((note: any) => note.kind !== "balance" && note.courseIds.includes(courseId))
        .map((note: any) => ({ kind: note.kind, article: note.article, ...(note.data ? { data: note.data } : {}) }));
      const mixed = (item.reasons || []).some((reason: any) => reason.blocking && /لا يُخلط/.test(String(reason.text || "")));
      return {
        itemIndex, kind: item.verdict || "clear",
        headline: headlineReasonOf(item.reasons)?.text || (item.verdict === "conflict" ? "هذا الموعد غير متاح." : item.verdict === "exception" ? "يحتاج سبب استثناء." : "الوقت متاح"),
        slots: item.slots || [], computedEnd: item.slots?.[0]?.end || "", roomAvailable: item.roomAvailable ?? null,
        nearestTimes: (item.nearestTimes || []).map(slot => ({ day: slot.day, days: slot.days, start: slot.start, end: slot.end })),
        shapes: item.shapes || [], advice: item.advice || "", block: item.block || 0,
        ...(mixed ? { patternNotice: await mixedPatternNotice(courseId, (item.slots || []).map(slot => slot.day as RequestDayKey), Number(resolved.request.AdTermId), undefined, true).catch(() => null) } : {}),
        notes: itemNotes,
      };
    }));
    res.setHeader("Cache-Control", "no-store");
    res.json({ items: results.filter(Boolean), availableOfferings: await availableInstructorOfferings({ ...resolved.request, items: draftItems }) });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "تعذر فحص المسودة." });
  }
});
app.get("/api/public/request/:token/previous", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  res.setHeader("Cache-Control", "no-store");
  const request = resolved.request;
  const memoKey = dataContextCacheKey(request.id);
  const cached = previousTermMemo.get(memoKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) { res.json(cached.value); return; }
  /* طلباتُ هذا الأستاذ وحده، لا طلباتُ كلّ من في الفصل: بضعةُ مستنداتٍ بدل المئات.
     و«السابق» بالتسلسل الزمنيّ للفصول لا بمعرّفاتها (src/utils/previousTermRequest.ts). */
  const found = pickPreviousRequest(
    await currentInstructorRequestGeneration(await Repository.getInstructorRequestsByInstructor(Number(request.AdInstructorId))),
    await Repository.getTerms() as any[],
    request,
  );
  const value = { previous: null as null | { termName: string; items: unknown[] } };
  if (found) {
    const stripped = stripForInstructor(found.request);
    const items = (stripped.items || []).filter(item => item.action !== "keep").map(item => {
      const snapshot = (item.action === "add" ? item.after : item.before) as any;
      const state = item.decision?.state === "fixed" ? "fixed" : item.decision?.state === "rejected" ? "rejected" : "pending";
      return {
        action: item.action,
        courseId: Number(snapshot?.courseId || item.after?.courseId || 0),
        courseName: String(snapshot?.courseName || item.after?.courseName || ""),
        collegeId: Number(snapshot?.collegeId || item.after?.collegeId || found!.request.AdCollegeId || 0),
        collegeName: String(snapshot?.collegeName || ""),
        sectionId: Number(snapshot?.sectionId || item.after?.sectionId || found!.request.AdSectionId || 0),
        sectionCode: String(item.before?.sectionCode || ""),
        was: [item.before?.days, item.before?.time].filter(Boolean).join(" · "),
        asked: item.action === "delete" ? "حذف المقرر من الجدول" : [item.after?.days, item.after?.time].filter(Boolean).join(" · "),
        days: (item.slots || []).map(slot => String(slot.day)),
        start: String(item.slots?.[0]?.start || ""),
        state,
      };
    });
    if (items.length) value.previous = { termName: found.termName, items };
  }
  if (previousTermMemo.size > 500) previousTermMemo.clear();
  previousTermMemo.set(memoKey, { at: Date.now(), value });
  res.json(value);
});
app.get("/api/public/request/:token/events", rateLimitCardEvents, async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  /* انقطع الاتصالُ ونحن ننتظر قراءة الرابط: لا يُسجَّل بثٌّ ميّت يأكل من السقف ولا يُنظَّف أبداً. */
  if (req.socket.destroyed || res.writableEnded) return;
  const id = String(resolved.request.id);
  const open = cardStreams.get(id) || new Set<Response>();
  if (cardStreamTotal >= CARD_STREAMS_TOTAL || open.size >= CARD_STREAMS_PER_REQUEST) {
    /* السقفُ لا يكسر الصفحة: تعود إلى القراءة عند العودة وإلى النبض البطيء. */
    res.status(429).json({ error: "اتصالاتٌ كثيرة بهذا الرابط." });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 8000\nevent: ready\ndata: {}\n\n");
  open.add(res);
  cardStreams.set(id, open);
  cardStreamTotal += 1;
  const heartbeat = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* الإغلاقُ يتولّى التنظيف */ } }, 25_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    if (open.delete(res)) cardStreamTotal -= 1;
    if (!open.size) cardStreams.delete(id);
  });
});
app.post("/api/public/request/:token/check-times", rateLimitCheckTimes, async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  res.setHeader("Cache-Control", "no-store");
  const items = Array.isArray(req.body?.items) ? (req.body.items as any[]) : null;
  const index = Number(req.body?.itemIndex);
  const entry = items && Number.isInteger(index) ? items[index] : null;
  if (!items || items.length > 200 || !entry || (entry.action !== "change" && entry.action !== "add")) {
    res.status(400).json({ error: "تعذّر فحص الأوقات لهذا البند." });
    return;
  }
  const starts = [...new Set((Array.isArray(req.body?.starts) ? req.body.starts : []).map(String)
    .filter((value: string) => /^\d{1,2}:\d{2}$/.test(value)))].slice(0, 14) as string[];
  if (!starts.length) { res.json({ times: {} }); return; }
  let base: InstructorRequestItem[];
  try {
    base = await instructorRequestItemsFromPayload(resolved.request, items.map((item, k) => k === index ? { ...item, start: "08:00" } : item));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "تعذّر فحص الأوقات لهذا البند." });
    return;
  }
  const target = base[index];
  const days = (target?.slots || []).map(slot => slot.day as RequestDayKey);
  if (!target || !days.length) { res.json({ times: {} }); return; }
  /* طولُ اللقاء كما بُني في البند (ممتدّ أو معتاد تاريخياً)، لا ما تقوله الصفحة. */
  const first = target.slots![0];
  const block = days.length === 1 ? timeToMinutes(first.end) - timeToMinutes(first.start) : undefined;
  const context = await buildRequestContext(resolved.request);
  const rulesCache = new Map<string, any>();
  const times: Record<string, "ok" | "warn" | "bad"> = {};
  /* سببُ كل وقتٍ ممنوع رمزاً واحداً يُرسم أيقونةً صغيرة (B2): مصدرُ المانع الأول (instructor · room · facility · cohort · load · regulation). */
  const why: Record<string, string> = {};
  let problemIsShape = false;
  let shapes: any[] = [];
  for (const start of starts) {
    const end = endForRequest(days, start, block && block > 0 ? block : undefined);
    const variant = base.map((item, k) => k !== index ? item : {
      ...item,
      after: { ...(item.after as any), time: `${start} – ${end}` },
      slots: target.slots!.map(slot => ({ day: slot.day, start, end: minutesToTime(timeToMinutes(start) + timeToMinutes(slot.end) - timeToMinutes(slot.start)) })),
    });
    const judged = await judgeRequestItems({ ...resolved.request, items: variant }, { context, rulesCache });
    const verdict = judged.items[index]?.verdict;
    times[start] = verdict === "conflict" ? "bad" : verdict === "exception" ? "warn" : "ok";
    const reasons = (judged.items[index]?.reasons || []) as any[];
    if (reasons.some((reason: any) => reason.code === "hours" || (reason.blocking && reason.source === "shape" && /لا يُخلط/.test(String(reason.text || ""))))) {
      problemIsShape = true;
      if (!shapes.length) shapes = (judged.items[index]?.shapes || []) as any[];
    }
    const blocking = reasons.find((reason: any) => reason.blocking);
    if (verdict === "conflict" && blocking) why[start] = blocking.source === "room" && /المرفق/.test(String(blocking.text || "")) ? "facility" : String(blocking.source || "");
  }
  /* الأيامُ لا تغطّي ساعاتِ المقرّر: الحكمُ نفسُه لكل الأوقات، فلا تُلوَّن كلُّها حمراء كأن الوقتَ هو الخطأ — وتُعرض أنماطُ اللائحة لتُكمَل بضغطة. */
  if (problemIsShape) { res.json({ times: {}, problem: "shape", shapes: shapes.slice(0, 3) }); return; }
  res.json({ times, why });
});
app.post("/api/public/request/:token/hold", rateLimitCheckTimes, async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  res.setHeader("Cache-Control", "no-store");
  /* E1: رابطُ «للعرض فقط» لا يكتب، فلا يحجز وقتاً يسبق به زملاءه. */
  if (!modeAllowsWrite(linkMode(resolved.request)) || !requestWindowOpen(resolved.request) || isUnchangedConfirmed(resolved.request)) { res.json({ held: false }); return; }
  if (req.body?.release === true) { await Repository.holdInstructorRequestSlot(resolved.request, null, 0); res.json({ held: false }); return; }
  const sent = Array.isArray(req.body?.items) ? (req.body.items as any[]) : null;
  const index = Number(req.body?.itemIndex);
  if (!sent || sent.length > 200 || !Number.isInteger(index) || !sent[index]) { res.status(400).json({ error: "تعذّر حجز هذا الموعد." }); return; }
  let items: InstructorRequestItem[];
  try { items = await instructorRequestItemsFromPayload(resolved.request, sent); }
  catch (error: any) { res.status(400).json({ error: error?.message || "تعذّر حجز هذا الموعد." }); return; }
  const judged = await judgeRequestItems({ ...resolved.request, items });
  const target = judged.items[index];
  if (!target || (target.action !== "add" && target.action !== "change") || !target.slots?.length || target.verdict === "conflict") { res.json({ held: false }); return; }
  const [proposal] = await requestReservationProposals({ ...judged, items: [target] });
  if (!proposal) { res.json({ held: false }); return; }
  try {
    const result = await Repository.holdInstructorRequestSlot(resolved.request, { ...proposal, itemId: `draft:${index}` }, REQUEST_HOLD_TTL_MS);
    /* الحجزُ يأخذ أنسبَ الخالي، والجوابُ لا يسمّيه (قرار المالك 2026-10-29: لا يصل الأستاذَ اسمٌ ولا رمز). */
    res.json({ held: true, heldUntil: result?.heldUntil });
  } catch (error: any) {
    if (!(error instanceof RequestReservationConflict)) throw error;
    /* خسر السباق: الحكمُ يُعاد على الدفتر الجديد، فيرى ما أخذه الزميل، ويقترح أقربَ بديلين. */
    const again = await judgeRequestItems({ ...resolved.request, items: judged.items.map((item, at) => at === index ? { ...item, verdict: undefined } : item) }, { forDepartment: true });
    const alternatives = (again.items[index]?.nearestTimes || []).slice(0, 2);
    res.status(409).json({ error: error.message === REQUEST_RACE_LOST ? REQUEST_RACE_LOST : error.message, code: "race-lost", alternatives });
  }
});

/**
 * حركةُ جدول صاحب الرابط الرسمية — ما تعرضه «حركة الجدول» في بطاقتي نفسُها.
 * تُقرأ حين يفتح الأستاذ تبويبَ الحركة، لا مع فتح الصفحة: نسخُ الجدول ثقيلة،
 * وفتحُ الرابط يجب أن يبقى سريعاً.
 */
app.get("/api/public/request/:token/movement", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  const request = resolved.request;
  const [termRows, courses, termRequests] = await Promise.all([
    Repository.getSchedulesByScope({ termId: Number(request.AdTermId) }),
    Repository.getCourses(),
    Repository.getInstructorRequests(0, 0, Number(request.AdTermId)),
  ]);
  const ownRequests = await currentInstructorRequestGeneration(termRequests.filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId)));
  const firstSentAt = firstInstructorEditAt(ownRequests);
  /* سجل الحركة الرسمي يبدأ من أول إرسال. شمول أقسام الطلبات القديمة يحفظ
     عرض الحذف إذا لم يبق للأستاذ أي موعد في القسم. */
  const own = (termRows as any[]).filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId));
  const courseById = new Map((courses as any[]).map(row => [Number(row.AdCourseId), row]));
  const history = firstSentAt === null ? [] : await scheduleMovementEntries(Number(request.AdInstructorId), Number(request.AdTermId), own, courseById, {
    withRooms: false,
    historyScopes: movementHistoryScopes(ownRequests, { collegeId: Number(request.AdCollegeId), sectionId: Number(request.AdSectionId) }),
  });
  const entries = movementAfterInstructorEdit(history, ownRequests)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 100);
  res.setHeader("Cache-Control", "no-store");
  res.json({ movementHistory: entries, movementSince: firstSentAt === null ? null : new Date(firstSentAt).toISOString() });
});

app.get("/r/:token", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  res.setHeader("Cache-Control", "no-store");
  if ("error" in resolved) {
    res.status(resolved.status).type("text/html; charset=utf-8").send(publicInvalidLinkPage(resolved.error));
    return;
  }
  res.type("text/html; charset=utf-8").send(instructorRequestPage(resolved.link.id, publicPageNonce(res), await demoPageHint(resolved.link, "request")));
});

/** C5 · 🌟 «اهتمام مستقبلي» من الكرت: نجمةٌ على مقررٍ غير متاح، تتجمّع قائمةً للمسؤول. */
app.post("/api/public/request/:token/interest", rateLimitPublicRequest, async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  /* 🌟 تُعرض في بطاقة «طلب تعديل» وحدها، فلا تُكتب من غيرها. */
  if (!modeAllowsFreeEdit(linkMode(resolved.request))) { res.status(403).json({ error: "هذا الرابط لا يطلب مقررات." }); return; }
  const courseId = Number(req.body?.courseId || 0), collegeId = Number(req.body?.collegeId || 0), sectionId = Number(req.body?.sectionId || 0);
  const allowed = (await instructorRequestCourseOptions(resolved.request)).some(option => option.id === courseId && option.collegeId === collegeId && option.sectionId === sectionId);
  if (!allowed) { res.status(400).json({ error: "المقرر ليس من كتالوج قسمك." }); return; }
  const id = `${collegeId}:${sectionId}:${Number(resolved.request.AdTermId)}`;
  await Repository.updateFeatureDoc<CourseInterestDoc, boolean>("courseInterest", id, current => ({
    next: toggleInterest(current, id, courseId, Number(resolved.request.AdInstructorId), req.body?.on !== false), result: true,
  }));
  res.json({ ok: true });
});

/**
 * C6 · 🧲 «لاصق بمحاضرتي»: لكل محاضرةٍ قائمة ⬅️ قبلها / ➡️ بعدها، يُحسب الوقتُ من نهايتها
 * وفاصل اللائحة ومدّة المقرر (src/utils/lectureStick.ts)، ثم يُحكم على كل مرشّحٍ بالمحرّك
 * الواحد judgeRequestItems — لا فحصَ ثانٍ هنا. نفسُ القاعة أولاً ثم نفسُ المبنى في الترتيب وحده:
 * الردُّ يمرّ بـ stickForTeacher فلا يصل الأستاذَ «نفس القاعة» ولا «نفس المبنى».
 */
app.post("/api/public/request/:token/stick", rateLimitCheckTimes, async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  if ("error" in resolved) { res.status(resolved.status).json({ error: resolved.error }); return; }
  res.setHeader("Cache-Control", "no-store");
  if (!modeAllowsFreeEdit(linkMode(resolved.request)) || !requestWindowOpen(resolved.request)) { res.status(403).json({ error: "التعديل غير متاح في هذا الرابط." }); return; }
  const items = Array.isArray(req.body?.items) ? (req.body.items as any[]) : null;
  const index = Number(req.body?.itemIndex);
  const entry = items && Number.isInteger(index) ? items[index] : null;
  if (!items || items.length > 200 || !entry || (entry.action !== "change" && entry.action !== "add")) { res.status(400).json({ error: "اختر موعداً لتلصقه." }); return; }
  const request = resolved.request;
  const context = await buildRequestContext(request);
  const rulesCache = new Map<string, any>();
  const target = items[index];
  const touched = new Set(items.map(item => Number(item?.rowId || 0)).filter(Boolean));
  const own = (context.officialRows as FSchedule[]).filter(row => Number(row.AdInstructorId) === Number(request.AdInstructorId) && !(Number(row.id) === Number(target.rowId)));
  const anchors: StickAnchor[] = own
    /* محاضرةٌ طلب الأستاذ نقلها أو حذفها ليست مرساةً ثابتة. */
    .filter(row => !touched.has(Number(row.id)) || items.some(item => Number(item?.rowId) === Number(row.id) && item.action === "keep"))
    .map(row => ({
      rowId: Number(row.id),
      title: String(context.courses.get(Number(row.AdCourseId))?.CourseName || row.AdCourseName || ""),
      days: dayKeysOf(row) as any, start: normalizeClock(row.fstarttime), end: normalizeClock(row.fendtime),
      roomKey: roomKeyOf(row.roomId, row.AdRoomCode, row.AdRoomHall), building: String(row.AdRoomCode || "").trim().toUpperCase(),
    })).filter(anchor => anchor.days.length && anchor.start && anchor.end).slice(0, 12);
  /* مدّةُ المقرر المُلصق على أيام المرساة كما يبنيها البند نفسُه (اللقاء الممتدّ وطولُه المعتاد)، لا رقمٌ عام. */
  const durations = new Map<string, number>();
  for (const anchor of anchors) {
    const key = anchor.days.join(",");
    if (durations.has(key)) continue;
    let minutes = timeToMinutes(endForRequest(anchor.days as any, "08:00")) - timeToMinutes("08:00");
    try {
      const probe = await instructorRequestItemsFromPayload(request, items.map((item, k) => k === index ? { ...item, days: anchor.days, start: "08:00" } : item));
      const slot = probe[index]?.slots?.[0];
      if (slot) minutes = timeToMinutes(slot.end) - timeToMinutes(slot.start);
    } catch { /* يبقى طولُ اللائحة */ }
    durations.set(key, minutes);
  }
  const durationFor = (days: any[]) => durations.get(days.join(",")) || 0;
  const keyBuilding = (key: string) => {
    const legacy = /^legacy:([^|]+)\|/.exec(key); if (legacy) return legacy[1].toUpperCase();
    const row = (context.officialRows as FSchedule[]).find(r => roomKeyOf(r.roomId, r.AdRoomCode, r.AdRoomHall) === key);
    return String(row?.AdRoomCode || "").trim().toUpperCase();
  };
  const judged: StickJudged[] = [];
  for (const anchor of anchors) {
    for (const side of ["before", "after"] as const) {
      for (const candidate of stickCandidates(anchor, side, durationFor)) {
        let variant: InstructorRequestItem[];
        try { variant = await instructorRequestItemsFromPayload(request, items.map((item, k) => k === index ? { ...item, days: candidate.days, start: candidate.start } : item)); }
        catch { continue; }
        const result = (await judgeRequestItems({ ...request, items: variant }, { context, rulesCache })).items[index] as any;
        const tone = result?.verdict === "conflict" ? "bad" : result?.verdict === "exception" ? "warn" : "ok";
        const rooms: string[] = result?.roomCandidates || [];
        judged.push({ ...candidate, end: result?.slots?.[0]?.end || candidate.end, tone,
          sameRoom: !!anchor.roomKey && rooms.includes(anchor.roomKey),
          sameBuilding: !!anchor.building && rooms.some(key => keyBuilding(key) === anchor.building),
          ...(tone === "bad" ? { reason: headlineReasonOf(result?.reasons)?.text || "غير متاح" } : {}) });
        if (tone === "ok") break; // الأقرب المتاح يكفي؛ لا يُفحص ما بعده
      }
    }
  }
  res.json({ anchors: anchors.map(({ roomKey, building, ...rest }) => rest), best: bestPerSide(judged).map(stickForTeacher), top: topSticks(judged).map(stickForTeacher) });
});

/** صفحةُ المقترح الدراسي للأستاذ: الرابطُ الشخصيّ نفسُه ثم معرّفُ المقترح. */
app.get("/r/:token/proposal/:pid", async (req: Request, res: Response) => {
  const resolved = await resolveRequestLink(String(req.params.token || ""));
  res.setHeader("Cache-Control", "no-store");
  if ("error" in resolved) {
    res.status(resolved.status).type("text/html; charset=utf-8").send(publicInvalidLinkPage(resolved.error));
    return;
  }
  res.type("text/html; charset=utf-8").send(studyProposalPage(resolved.link.id, String(req.params.pid || ""), publicPageNonce(res), await demoPageHint(resolved.link, "request")));
});
}
