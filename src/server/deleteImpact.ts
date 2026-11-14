/**
 * ── «لو حذفت؟»: حقائقُ الحذف على الخادم، ومصدرٌ واحد لـ«ما الذي يمنع؟» ───────────
 *
 * حرّاسُ الحذف في المسارات (referenceRoutes/coursesRoutes/instructorsRoutes/usersRoutes)
 * وخريطةُ التأكيد (GET /api/delete-impact/:entity/:id) تستدعيان `deleteBlockers` نفسَها:
 * الحقائقُ من `deleteGuardFacts` والحكمُ من `blockersFor` (utils/deleteImpact.ts). فلا يَعِد
 * التأكيدُ بما يرفضه الحذف ولا العكس. وما فوق ذلك (عدّاداتُ المرتبطات) قراءةٌ فقط
 * لا تؤثّر في المنع، وبلا أيّ بياناتٍ شخصية — أعدادٌ وأسماءُ دخولٍ سمّاها الحارسُ أصلاً.
 */
import type { Response } from "express";
import { Repository } from "../db/repository";
import { accountsScopedTo } from "../utils/academicGuards";
import { currentTermId } from "../utils/termSequence";
import { readSeatLedger } from "./seats";
import { userDeleteRefusal, type GuardActor } from "./userAdminGuards";
import { ROOT_ADMIN_USER_ID } from "./core/auth";
import { readLocationRegistry } from "./core/locations";
import { sortTermsNewestServer, termChronologyServer } from "./core/ordering";
import type { FSchedule, MasterRoom } from "../types";
import {
  appointmentGroup, appointmentsTotal, blockersFor, bucketAppointments, compactGroups, groupsTotal, legacyRoomKey,
  type AppointmentBuckets, type DeleteBlocker, type DeleteEntity, type DeleteImpact, type GuardFactsByEntity,
  type ImpactGroup, type ImpactWarning, type TermBucketContext,
} from "../utils/deleteImpact";

export interface DeleteGuardContext { actor?: GuardActor }

/** رفضُ الحذف كما كان يُكتب في المسار: الحالةُ والنصّ وما يلحق به. */
export function refuseWithBlocker(res: Response, blocker: DeleteBlocker): void {
  res.status(blocker.status).json({ error: blocker.message, ...(blocker.body || {}) });
}

/** حقائقُ المنع وحدها — الاستعلاماتُ نفسها التي كانت في الحرّاس، بلا زيادة. */
export async function deleteGuardFacts<E extends DeleteEntity>(entity: E, id: number, ctx: DeleteGuardContext = {}): Promise<GuardFactsByEntity[E]> {
  const facts = await guardFactsOf(entity, id, ctx);
  return facts as GuardFactsByEntity[E];
}

async function scopedAccounts(target: { collegeId?: number; sectionId?: number }): Promise<string[]> {
  const [users, assigns] = await Promise.all([Repository.getUsers(), Repository.getCollegeUserAssigns()]);
  return accountsScopedTo(users as any[], assigns as any[], target);
}

async function guardFactsOf(entity: DeleteEntity, id: number, ctx: DeleteGuardContext): Promise<unknown> {
  switch (entity) {
    case "term":
      return { appointments: (await Repository.hasSchedulesForTerm(id)) ? 1 : 0 };
    case "college":
      return { sections: (await Repository.getSectionsByCollege(id)).length, scopedAccounts: await scopedAccounts({ collegeId: id }) };
    case "section":
      return { courses: (await Repository.getCoursesBySection(id)).length, scopedAccounts: await scopedAccounts({ sectionId: id }) };
    case "instructor":
      return { appointments: (await Repository.hasSchedulesForInstructor(id)) ? 1 : 0 };
    case "course": {
      const course = await Repository.getCourseById(id);
      let curriculumSectionId: number | null = null;
      if (course) {
        const memberships = await Repository.getCurriculumPlanCourses(course.AdSectionId);
        if (memberships.some(row => Number(row.AdCourseId) === id)) curriculumSectionId = Number(course.AdSectionId);
      }
      return { curriculumSectionId, appointments: (await Repository.hasSchedulesForCourse(id)) ? 1 : 0 };
    }
    case "user": {
      const users = await Repository.getUsers();
      const target = users.find(user => Number(user.SystemUserId) === id);
      const refusal = userDeleteRefusal({ actor: ctx.actor || { id: 0, permissions: [] }, rootId: ROOT_ADMIN_USER_ID, target: target as any, users: users as any });
      return { found: Boolean(target), refusal };
    }
    default:
      return {};
  }
}

/** ما يمنع الحذف الآن، بترتيب الحارس. الحارسُ يرفض بـ[0]، والخريطةُ تعرضها كلَّها. */
export async function deleteBlockers(entity: DeleteEntity, id: number, ctx: DeleteGuardContext = {}): Promise<DeleteBlocker[]> {
  return blockersFor(entity, await deleteGuardFacts(entity, id, ctx) as never);
}

/* ── الفصول: الجاري وما بعده وما قبله (كما كان يعدّ به الخادمُ مواعيدَ القاعة) ── */
export async function termBucketContext(): Promise<TermBucketContext> {
  const terms = await Repository.getTerms();
  const activeId = currentTermId(terms as any) || Number(sortTermsNewestServer(terms)[0]?.AdTermId || 0);
  const activeTerm = terms.find(term => Number(term.AdTermId) === activeId);
  const activeChronology = activeTerm ? termChronologyServer(activeTerm) : Number.NEGATIVE_INFINITY;
  const laterIds = new Set(terms.filter(term => Number(term.AdTermId) !== activeId && termChronologyServer(term) > activeChronology).map(term => Number(term.AdTermId)));
  return { activeId, laterIds };
}

/**
 * مواعيدُ القاعات أو المبنى: بالمعرّف أو بالرمز القديم في المبنى نفسه — الجاري وما بعده وما قبله.
 * `locationUsage` أدناه هي نفسُها بحقلين (الإيقافُ لا يعدّ السابقَ)، وبها يعدّ مسارُ الحذف الفعلي.
 */
export async function locationUsageBuckets(rooms: MasterRoom[]): Promise<AppointmentBuckets> {
  if (!rooms.length) return { current: 0, later: 0, past: 0 };
  const ctx = await termBucketContext();
  const ids = new Set(rooms.map(room => room.id));
  const legacy = new Set(rooms.map(room => `${room.buildingId}|${room.canonicalCode}`));
  const uses = (row: FSchedule) => (row.roomId && ids.has(String(row.roomId))) || (!row.roomId && legacy.has(legacyRoomKey(row.buildingId, row.AdRoomHall)));
  const used = (await Repository.getSchedules()).filter(uses);
  return bucketAppointments(used, ctx);
}
export async function locationUsage(rooms: MasterRoom[]): Promise<{ current: number; future: number }> {
  const buckets = await locationUsageBuckets(rooms);
  return { current: buckets.current, future: buckets.later };
}

const bucketsFromTermCounts = (counts: Map<number, number>, ctx: TermBucketContext): AppointmentBuckets => {
  const out: AppointmentBuckets = { current: 0, later: 0, past: 0 };
  for (const [term, n] of counts) {
    if (term === ctx.activeId) out.current += n;
    else if (ctx.laterIds.has(term)) out.later += n;
    else out.past += n;
  }
  return out;
};

const item = (id: string, noun: ImpactGroup["items"][number]["noun"], count: number, when?: string) => ({ id, noun, count, when });
const group = (id: string, title: string, items: ImpactGroup["items"]): ImpactGroup => ({ id, title, items });
const settle = async <T>(work: Promise<T>, fallback: T): Promise<T> => { try { return await work; } catch { return fallback; } };

interface Detail { name: string; groups: ImpactGroup[]; warnings?: ImpactWarning[]; requiresConfirm?: boolean }

async function detailOf(entity: DeleteEntity, id: number, scopedNames: string[]): Promise<Detail | null> {
  switch (entity) {
    case "term": {
      const term = (await Repository.getTerms()).find(row => Number(row.AdTermId) === id);
      if (!term) return null;
      const [rows, needs, requests, proposals, holds, approvals, comments, barters] = await Promise.all([
        settle(Repository.getSchedulesByScope({ termId: id }), []),
        settle(Repository.getStudentNeedsForTerm(id), []),
        settle(Repository.getInstructorRequests(0, 0, id), []),
        settle(Repository.getStudyProposalsByTerm(id), []),
        settle(Repository.getInstructorRequestReservations(id), []),
        settle(Repository.getScheduleApprovalsForTerm(id), []),
        settle(Repository.getScheduleCommentsForTerm(id), []),
        settle(Repository.getHallBarterRequests(id), []),
      ]);
      return {
        name: term.AdTermName,
        groups: [
          group("appointments", "المواعيد في الجدول", [item("appointments-term", "appointment", rows.length, "في هذا الفصل")]),
          group("students", "رغبات الطلبة", [item("student-needs", "request", needs.length, "من الطلبة")]),
          group("instructors", "رغبات الأساتذة ومقترحات الدراسة", [
            item("instructor-requests", "request", requests.length, "من الأساتذة"),
            item("study-proposals", "proposal", proposals.length),
            item("request-holds", "booking", holds.length, "مؤقتاً لطلباتهم"),
          ]),
          group("schedule", "اعتماد الجدول وملاحظاته", [
            item("approvals", "approval", approvals.length, "للجداول"),
            item("comments", "note", comments.length, "على المواعيد"),
            item("barters", "request", barters.length, "لتبادل القاعات"),
          ]),
        ],
      };
    }
    case "college": {
      const college = await Repository.getCollegeById(id);
      if (!college) return null;
      const [sections, courses, assigns, plans, sheets, registry] = await Promise.all([
        Repository.getSectionsByCollege(id),
        Repository.getCourses(),
        Repository.getCollegeUserAssigns(),
        Repository.getAllCurriculumPlans(),
        Repository.listPublishedSheets(),
        readLocationRegistry(),
      ]);
      return {
        name: college.AdCollegeName,
        groups: [
          group("structure", "هيكل الكلية", [
            item("sections", "department", sections.length),
            item("courses", "course", courses.filter(course => Number(course.AdCollegeId) === id).length, "في أقسامها"),
          ]),
          group("accounts", "الحسابات ونطاقاتها", [
            item("scoped-accounts", "account", scopedNames.length, "نطاقها في الكلية"),
            item("scopes", "range", assigns.filter(row => Number(row.AdCollegeId) === id).length, "مسجّلة لحساباتٍ في الكلية"),
          ]),
          group("curriculum", "الصحائف الأكاديمية", [
            item("plans", "sheet", plans.filter(plan => Number(plan.AdCollegeId) === id).length),
            item("published-sheets", "sheet", sheets.filter(sheet => Number(sheet.AdCollegeId) === id).length, "منشورة للطلبة"),
          ]),
          group("locations", "المباني والقاعات", [
            item("buildings", "building", registry.buildings.filter(row => row.active && (row.collegeIds || []).includes(id)).length),
            item("rooms", "room", registry.rooms.filter(row => row.active && (row.collegeIds || []).includes(id)).length),
          ]),
        ],
      };
    }
    case "section": {
      const section = await Repository.getSectionById(id);
      if (!section) return null;
      const collegeId = Number(section.AdCollegeId);
      const [courses, rows, ctx, plans, planCourses, transitions, sheets, assigns, needs, faculty, registry] = await Promise.all([
        Repository.getCoursesBySection(id),
        settle(Repository.getSchedulesByScope({ sectionId: id }), []),
        termBucketContext(),
        Repository.getCurriculumPlans(id),
        Repository.getCurriculumPlanCourses(id),
        settle(Repository.getCourseTransitions(id), []),
        Repository.listPublishedSheets(),
        Repository.getCollegeUserAssigns(),
        settle(Repository.getStudentNeedHistory(collegeId, id), []),
        settle(Repository.getDepartmentFaculty(collegeId, id), []),
        readLocationRegistry(),
      ]);
      return {
        name: section.AdSectionName,
        groups: [
          appointmentGroup(bucketAppointments(rows, ctx)),
          group("courses", "المقررات والصحائف", [
            item("courses", "course", courses.length),
            item("plans", "sheet", plans.length, "أكاديمية"),
            item("plan-courses", "course", planCourses.length, "داخل الصحائف"),
            item("published-sheets", "sheet", sheets.filter(sheet => Number(sheet.AdSectionId) === id).length, "منشورة للطلبة"),
            item("transitions", "record", transitions.length, "من انتقال المقررات بين الصحائف"),
          ]),
          group("accounts", "الحسابات ونطاقاتها", [
            item("scoped-accounts", "account", scopedNames.length, "نطاقها في القسم"),
            item("scopes", "range", assigns.filter(row => Number(row.AdSectionId) === id).length, "مسجّلة لحساباتٍ في القسم"),
          ]),
          group("people", "الطلبة والأساتذة", [
            item("student-needs", "request", needs.length, "من الطلبة عبر الفصول"),
            item("faculty", "instructor", faculty.length, "في سجل القسم"),
          ]),
          group("locations", "القاعات", [item("rooms", "room", registry.rooms.filter(row => row.active && (row.sectionIds || []).includes(id)).length, "تخدم القسم")]),
        ],
        warnings: [{ code: "placeholder-faculty", message: "يُحذف معه سجلّ «هيئة تدريسية» الخاص به إن لم يُستعمل في أي موعد." }],
      };
    }
    case "instructor": {
      const [person, counts, ctx, requests, links, users] = await Promise.all([
        Repository.getInstructorById(id),
        Repository.countSchedulesByTerm("AdInstructorId", id),
        termBucketContext(),
        settle(Repository.getInstructorRequestsByInstructor(id), []),
        settle(Repository.getShareLinksByInstructor(id), []),
        Repository.getUsers(),
      ]);
      if (!person) return null;
      const proposals = (await Promise.all(requests.map(row => settle(Repository.getStudyProposalsByRequest(row.id), [])))).reduce((sum, rows) => sum + rows.length, 0);
      return {
        name: person.AdInstructorName,
        groups: [
          appointmentGroup(bucketsFromTermCounts(counts, ctx)),
          group("requests", "الرغبات ومقترحات الدراسة", [
            item("instructor-requests", "request", requests.length, "مرفوعة منه"),
            item("study-proposals", "proposal", proposals),
          ]),
          group("links", "الروابط والحسابات", [
            item("share-links", "shareLink", links.length, "باسمه"),
            item("linked-accounts", "account", users.filter(user => !user.IsDeleted && Number(user.AdInstructorId) === id).length, "مربوطة بلوحته"),
          ]),
        ],
        warnings: person.AdInstructorStatus ? [] : [{ code: "retire-instead", message: "إن أردت إخفاءه من الإسناد مع بقاء بياناته فاجعله «متقاعداً» بدل الحذف." }],
      };
    }
    case "course": {
      const course = await Repository.getCourseById(id);
      if (!course) return null;
      const sectionId = Number(course.AdSectionId);
      const [counts, ctx, planCourses, plans, transitions, needs] = await Promise.all([
        Repository.countSchedulesByTerm("AdCourseId", id),
        termBucketContext(),
        Repository.getCurriculumPlanCourses(sectionId),
        Repository.getCurriculumPlans(sectionId),
        settle(Repository.getCourseTransitions(sectionId), []),
        settle(Repository.getStudentNeedHistory(Number(course.AdCollegeId), sectionId), []),
      ]);
      const planIds = new Set(planCourses.filter(row => Number(row.AdCourseId) === id).map(row => row.planId));
      return {
        name: course.CourseName,
        groups: [
          appointmentGroup(bucketsFromTermCounts(counts, ctx)),
          group("curriculum", "الصحائف الأكاديمية", [
            item("plans", "sheet", plans.filter(plan => planIds.has(plan.id)).length, "يرد المقرر فيها"),
            item("transitions", "record", transitions.filter(row => Number(row.fromCourseId) === id || Number(row.toCourseId) === id).length, "من انتقال المقررات"),
          ]),
          group("students", "رغبات الطلبة", [item("student-needs", "request", needs.filter(row => (row.courseIds || []).map(Number).includes(id)).length, "تذكر المقرر")]),
        ],
      };
    }
    case "user": {
      const [users, scopes, permissions, ledger] = await Promise.all([
        Repository.getUsers(),
        Repository.getUserAssigns(id),
        Repository.getSecurityByUser(id),
        settle(readSeatLedger(id), null),
      ]);
      const user = users.find(row => Number(row.SystemUserId) === id);
      if (!user) return null;
      const members = (ledger?.members || []).filter(member => member.status !== "ended");
      return {
        name: String(user.Name || user.SystemUserLogin || id),
        groups: [
          group("access", "الصلاحيات والنطاقات", [
            item("permissions", "permission", permissions.length, "تُحذف معه"),
            item("scopes", "range", scopes.length, "من الكليات والأقسام تُحذف معه"),
          ]),
          group("seat", "الفريق على هذا الحساب", [
            item("seat-members", "person", members.length, "في فريقه"),
            item("seat-holder", "person", ledger?.holder ? 1 : 0, "يشغل الحساب الآن"),
          ]),
          group("instructor", "الارتباط بلوحة أستاذ", [item("linked-instructor", "instructor", Number(user.AdInstructorId) > 0 ? 1 : 0, "مربوط بهذا الحساب")]),
        ],
      };
    }
    default:
      return null;
  }
}

/** معرّفُ المبنى/القاعة نصٌّ (building_… / room_…)، فلهما خريطةٌ منفصلة. */
async function locationDetail(entity: "room" | "building", id: string): Promise<{ detail: Detail; buckets: AppointmentBuckets } | null> {
  const registry = await readLocationRegistry();
  if (entity === "room") {
    const room = registry.rooms.find(row => row.id === id);
    if (!room) return null;
    const buckets = await locationUsageBuckets([room]);
    return {
      buckets,
      detail: {
        name: `${room.buildingCode}${room.canonicalCode}`,
        groups: [appointmentGroup(buckets), group("sections", "الأقسام", [item("sections", "department", (room.sectionIds || []).length, "تستعمل القاعة")])],
      },
    };
  }
  const building = registry.buildings.find(row => row.id === id);
  if (!building) return null;
  const rooms = registry.rooms.filter(row => row.buildingId === building.id);
  const buckets = await locationUsageBuckets(rooms);
  return {
    buckets,
    detail: {
      name: building.officialCode,
      groups: [
        appointmentGroup(buckets),
        group("rooms", "القاعات", [item("rooms", "room", rooms.filter(row => row.active).length, "فعّالة تُوقف معه")]),
        group("sections", "الأقسام", [item("sections", "department", (building.sectionIds || []).length, "مرتبطة بالمبنى")]),
      ],
    },
  };
}

/** الخريطةُ كاملة: المرتبطاتُ مجمّعةً، والعقباتُ من الدالة نفسها التي يرفض بها الحذف. */
export async function computeDeleteImpact(entity: DeleteEntity, rawId: string, ctx: DeleteGuardContext = {}): Promise<DeleteImpact | null> {
  const id = Number(rawId);
  if (entity === "room" || entity === "building") {
    const found = await locationDetail(entity, String(rawId));
    if (!found) return null;
    const requiresConfirm = found.buckets.current + found.buckets.later > 0;
    return {
      entity, id: String(rawId), name: found.detail.name,
      groups: compactGroups(found.detail.groups),
      blockers: blockersFor(entity, {} as never),
      warnings: requiresConfirm ? [{ code: "location-in-use", message: "تبقى هذه المواعيد كما هي في سجلها، ويلزم تأكيدٌ صريح للإيقاف." }] : [],
      requiresConfirm,
      total: appointmentsTotal(found.buckets),
    };
  }
  if (!Number.isFinite(id) || id <= 0) return null;
  /* العقباتُ أولاً: بالحقائق نفسها التي يقرؤها الحارس، قبل أيّ عدٍّ إضافي. */
  const facts = await deleteGuardFacts(entity, id, ctx);
  const blockers = blockersFor(entity, facts as never);
  const names = (facts as { scopedAccounts?: string[] }).scopedAccounts || [];
  const detail = await detailOf(entity, id, names);
  if (!detail) return null;
  const groups = compactGroups(detail.groups);
  return { entity, id: String(id), name: detail.name, groups, blockers, warnings: detail.warnings || [], requiresConfirm: false, total: groupsTotal(groups) };
}
