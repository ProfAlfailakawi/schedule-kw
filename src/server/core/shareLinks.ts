/**
 * ── روابطُ المشاركة العامة ──
 *
 * نُقل من server.ts نقلاً بلا تغيير (scripts/split-server؛ الخريطة في docs/SERVER_MAP.md):
 * نصُّ كل جملةٍ وترتيبُها كما كانا، إلا `export` على ما تستعمله وحداتٌ أخرى،
 * و`state.x` لمتغيّرٍ مشترك يُكتب من أكثر من وحدة.
 */
import { Repository } from "../../db/repository";
import type { FSchedule, ScheduleShareLink } from "../../types";
import { calendarFeedKey, createCalendarSecretResolver, personCalendarKey } from "../calendarSecret";
import { readsUntilTermEnd, shareLinkReadable } from "../../utils/shareLinkLifetime";
import { createAttemptLimiter, limiterOptionsFromEnv } from "../publicAttemptLimiter";
import { finalRowsOnly } from "./scheduleReads";
import { visitingChecker } from "./visiting";

// ============================================================================
// READ-ONLY PUBLICATION — share links, public page, calendar subscription
// A token is a long random string, expires on its own, and never exposes a
// civil ID, phone number, account or any scope beyond the one it was made for.
// ============================================================================

export const SHARE_DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
export const SHARE_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const SHARE_ICS_DAYS = ["SU", "MO", "TU", "WE", "TH"];

export function shareDayIndexes(row: FSchedule): number[] {
  return SHARE_DAY_KEYS.map((key, index) => (row as any)[key] ? index : -1).filter(index => index >= 0);
}

/** هل ما زال الرابطُ مقروءاً؟ القاعدة (وأيُّ الأنواع يُقرأ حتى نهاية فصله —
 *  بطاقاتُ الأساتذة بنوعيها، القسمِ والشخصي، ورابطُ الطلب) في
 *  src/utils/shareLinkLifetime.ts وحدها. الفصلُ لا يُقرأ إلا إن مضى تاريخُ الرابط. */
export async function shareLinkStillReadable(link: ScheduleShareLink, knownTerms?: Array<{ AdTermId: number; AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number }>): Promise<boolean> {
  if (!link.expiresAt || Date.parse(String(link.expiresAt)) >= Date.now() || !readsUntilTermEnd(link.kind)) {
    return shareLinkReadable(link, undefined as any);
  }
  const term = (knownTerms || await Repository.getTerms()).find(row => Number(row.AdTermId) === Number(link.AdTermId));
  return shareLinkReadable(link, term);
}

/** Resolves a token to its live scope, or explains precisely why it cannot be read. */
export async function resolveShareToken(token: string) {
  const link = await Repository.getShareLink(String(token || ""));
  if (!link || link.revoked) return { error: "الرابط غير موجود أو تم إيقافه", status: 404 as const };
  if (!await shareLinkStillReadable(link)) return { error: "انتهت صلاحية هذا الرابط", status: 410 as const };
  return { link };
}

export async function buildSharePayload(link: ScheduleShareLink, options: { termId?: number; finalOnly?: boolean } = {}) {
  const termId = Number(options.termId || link.AdTermId);
  const [liveRows, courses, instructors, sections, colleges, terms] = await Promise.all([
    Repository.getSchedulesByScope({ collegeId: link.AdCollegeId, sectionId: link.AdSectionId, termId }),
    Repository.getCourses(), Repository.getInstructors(), Repository.getSections(), Repository.getColleges(), Repository.getTerms()
  ]);
  const rows = options.finalOnly ? await finalRowsOnly(liveRows, termId) : liveRows;
  const courseById = new Map(courses.map(row => [row.AdCourseId, row]));
  const instructorById = new Map(instructors.map(row => [row.AdInstructorId, row]));
  /* الشارة «منتدب» تتبع الاسم: لا اسمَ حين تُخفى الأسماء فلا علامة، ويُحسب النطاق مرةً للرابط كله. */
  const showNames = link.showInstructors !== false;
  const isVisiting = showNames ? await visitingChecker(termId, [{ collegeId: link.AdCollegeId, sectionId: link.AdSectionId }]) : () => false;
  return {
    label: link.label,
    college: colleges.find(row => row.AdCollegeId === link.AdCollegeId)?.AdCollegeName || "",
    section: sections.find(row => row.AdSectionId === link.AdSectionId)?.AdSectionName || "",
    term: terms.find(row => row.AdTermId === termId)?.AdTermName || "",
    expiresAt: link.expiresAt,
    showInstructors: link.showInstructors !== false,
    rows: rows
      .slice()
      .sort((a, b) => String(a.fstarttime).localeCompare(String(b.fstarttime)))
      .map(row => ({
        id: row.id,
        code: courseById.get(row.AdCourseId)?.CourseCode || "",
        name: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
        section: row.SCode || "",
        start: row.fstarttime,
        end: row.fendtime,
        days: shareDayIndexes(row),
        room: row.AdRoomCode || "",
        hall: row.AdRoomHall || "",
        // Carried for the calendar feed: a subscriber's copy of an appointment
        // is only replaced when the version it holds is older than this one.
        rev: Number(row.rev || 0),
        instructor: showNames ? (instructorById.get(row.AdInstructorId)?.AdInstructorName || "") : "",
        visiting: showNames && isVisiting(row.AdInstructorId, link.AdCollegeId, link.AdSectionId)
      }))
  };
}

/**
 * The instructor card.
 *
 * Instructors outnumber accounts by an order of magnitude and will never be
 * given credentials, so the card has to work with nothing but a link. A civil
 * ID on its own would be a public directory — colleagues know each other's
 * numbers — so the link is the permission and the civil ID is only the
 * selector: without the link nothing is reachable at all, and with it a person
 * can reach exactly one card, their own, inside the college that issued it.
 *
 * Guesses are rate limited per link, a wrong number and a person who teaches
 * nothing this term get the same answer, and the card never shows a civil ID,
 * a phone number or anyone else's row.
 */
/* الحدّ مشترك بين الأبواب العامة كلها، ويعدّ الأخطاء لا الدخول — القاعدة في
   ‎src/server/publicAttemptLimiter.ts‎. */
export const publicAttempts = createAttemptLimiter(limiterOptionsFromEnv());
export const publicAttemptKey = (scope: string, ip: string) => `${scope}|${ip}`;
/* يُحجز قبل أوّل `await`: المحاولة تُحسب خطأً عند الدخول، ويُرجعها النجاح
   وحده بـ`release()`. فلا يمرّ من الطلبات المتوازية أكثرُ من الحدّ. */
export const publicAttemptReserve = (scope: string, ip: string) => publicAttempts.reserve(publicAttemptKey(scope, ip));

/** عنوانُ الرابط كما يُعرض في لوحة النشر وعلى الصفحة — لكل نوعٍ صيغتُه. */
export function shareLinkLabel(kind: "staff" | "survey" | "department" | "students", sectionName: string, termName: string): string {
  if (kind === "students") return `جدول الطلبة · ${sectionName}`.trim();
  return kind === "staff"
    ? `بطاقات الأساتذة · ${termName}`.trim()
    : kind === "survey"
      ? `استبيان المقررات · ${sectionName} · ${termName}`.trim()
      : `${sectionName} · ${termName}`.trim();
}

/**
 * ── تقويم الأستاذ ───────────────────────────────────────────────────────────
 *
 * A calendar subscription is one URL fetched by a phone forever, with no way to
 * send anything alongside it — no form, no header a person could fill in. So the
 * civil ID cannot be the key: it would sit in the URL, in the phone's account
 * settings, and in every server log that ever touches it.
 *
 * Instead the card — which has already proved who is holding it — hands out a
 * derived key: an HMAC over the link and the instructor's row id. It reveals no
 * civil ID, cannot be reversed into one, cannot be guessed without the server's
 * secret, and dies the moment the link that produced it is revoked or expires.
 */
/* السرّ لا يولَد عشوائياً عند كل إقلاع: القاعدة كلّها في ‎src/server/calendarSecret.ts‎
   (المتغيّر إن ضُبط، وإلا مشتقٌّ من السرّ المشترك المحفوظ). */
export const calendarSecret = createCalendarSecretResolver(() => process.env.CALENDAR_SECRET, () => Repository.getSharedServerSecret());

export const calendarKey = async (token: string, instructorId: number) =>
  calendarFeedKey(await calendarSecret(), token, instructorId);

/** رابطُ الاشتراك الثابت لأستاذ، نسبياً للموقع. */
export const stableCalendarPath = async (token: string, instructorId: number) =>
  `/api/public/cal/${encodeURIComponent(token)}/${personCalendarKey(await calendarSecret(), instructorId)}.ics`;
