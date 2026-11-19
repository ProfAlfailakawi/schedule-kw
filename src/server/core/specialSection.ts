/**
 * ── شعبةٌ لمقررٍ بطبيعةٍ خاصة: نظريُّها وعمليُّها في حفظٍ واحدٍ ذرّي ──────────────────────
 *
 * الأيامُ ومدّةُ كلِّ لقاءٍ بحرية بين مدد اللائحة، واللقاءُ العمليُّ لازمٌ بمكانه (src/utils/specialNature.ts).
 * شعبةٌ ناقصةُ الساعات لا يقبلها حفظُ صفٍّ واحد، فتُحفظ لقاءاتُها معاً: كلُّ لقاءٍ يمرّ فحصاً جافّاً من مسار الحفظ نفسه
 * (النطاق، القفل، المكان، المرفق، التعارض، الساعات، العملي) على الأسبوع كما سيصير بلقاءاتها كلِّها، ثم تُكتب
 * في معاملةٍ واحدة (Repository.commitScheduleChangeSet) أو لا يُكتب شيء. مخالفاتُ اللائحة التي تُسأل تُجمع في ردٍّ واحد (409).
 *
 * بابان يمرّان من هنا بالحكم نفسه: «موعد» (POST /api/schedules/special-section)، وموافقةُ اللجنة على طلب طالبٍ
 * تفتح له شعبةً في الجدول (POST /api/student-registration/:id/course-state) — فالمقرر الخاص لا يُفتح له لقاءٌ واحدٌ ناقص.
 */
import { Repository, ScheduleRevisionConflict } from "../../db/repository";
import type { FSchedule, ScheduleOrigin } from "../../types";
import { RequestHoldConflict, RequestReservationConflict } from "../../utils/instructorRequestReservations";
import { nextCourseSectionCode } from "../../utils/nextCourseSectionCode";
import { sectionCodeKey } from "../../utils/sameSlot";
import { isSpecialNature, meetingLengthIssue, specialShapeSummary } from "../../utils/specialNature";
import { noteScheduleMutation } from "./approvals";
import type { AuthenticatedRequest } from "./auth";
import { canonicalizeHistoricalLocationForRuntime, readLocationRegistry } from "./locations";
import { applyRequestHoldOverride, noteDepartmentAddition, noteRequestHoldOverride, requestHoldRefusal } from "./scheduleConflicts";
import { SCHEDULE_DAY_KEYS, sectionShapeIssue } from "./scheduleRules";
import { createScheduleHandler, regulationGate, runScheduleHandler } from "./scheduleWrites";
import { isScopeAllowed } from "./scope";
import { placeholderInstructorIds } from "./smartImport";
import { captureScopeVersion, recordVersionAfter } from "./versions";

export interface SpecialSectionInput {
  collegeId: number;
  sectionId: number;
  termId: number;
  courseId: number;
  /** رقمُ الشعبة؛ فارغٌ يعني «الرقم الحرّ التالي لهذا المقرر في الفصل» (فتحُ شعبةٍ لطلب طالب). */
  code?: string;
  instructorId: number;
  meetings: any[];
  /** فحصٌ جافّ: يمرّ كلُّ ما سبق، وتُعاد مخالفاتُ اللائحة التي ستُسأل، ولا يُكتب شيء. */
  dryRun?: boolean;
  /** مصدرُ الشعبة حين لا تأتي من يدٍ في الورشة (حالة طالب). يُكتب على كل لقاء. */
  origin?: ScheduleOrigin;
}

export interface SpecialSectionOutcome {
  status: number;
  json: any;
  rows?: FSchedule[];
  audit?: string;
  trail?: { target: string; after: string; scope: { collegeId: number; sectionId: number; termId: number }; row: number };
}

const PLACE_KEYS = ["AdRoomCode", "AdRoomHall", "buildingId", "roomId", "locationStatus", "sourceBuildingText", "sourceRoomText", "companionRoomId", "companionRoomLabel"] as const;

export async function createSpecialSection(req: AuthenticatedRequest, input: SpecialSectionInput): Promise<SpecialSectionOutcome> {
  const { collegeId, sectionId, termId, courseId, instructorId } = input;
  const meetings = Array.isArray(input.meetings) ? input.meetings : [];
  const fail = (status: number, json: any): SpecialSectionOutcome => ({ status, json: { ...json, applied: false } });
  if (![collegeId, sectionId, termId, courseId, instructorId].every(value => Number(value) > 0)) return fail(400, { error: "الرجاء إدخال الحقول المطلوبة بالأحمر" });
  if (!isScopeAllowed(req, collegeId, sectionId) && !req.user?.IsAdminUser) return fail(403, { error: "خارج صلاحيات الأقسام المسموحة لك" });
  if (meetings.length < 1 || meetings.length > 6) return fail(400, { error: "لقاءات الشعبة من واحدٍ إلى ستة." });
  const course = await Repository.getCourseById(courseId);
  if (!course || Number(course.AdCollegeId) !== collegeId || Number(course.AdSectionId) !== sectionId) return fail(400, { error: "المقرر المختار غير صالح" });
  if (!isSpecialNature(course)) return fail(400, { error: "هذا المقرر ليس بطبيعةٍ خاصة؛ احفظه من نموذج الموعد المعتاد." });
  if (!meetings.some(meeting => meeting?.practical === true)) return fail(400, { error: "حدّد اللقاء العملي ومكانه قبل الحفظ." });

  const termRows = await Repository.getSchedulesByScope({ termId });
  const code = String(input.code ?? "").trim() || nextCourseSectionCode(termRows, courseId, termId, null);
  const taken = termRows.some(row => Number(row.AdCourseId) === courseId && Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId && sectionCodeKey(row.SCode) === sectionCodeKey(code));
  if (taken) {
    const fresh = nextCourseSectionCode(termRows, courseId, termId, null);
    return { status: 409, json: { error: `الشعبة ${code} موجودةٌ لهذا المقرر في الفصل؛ عدّل لقاءاتها من الجدول، أو اختر شعبةً جديدة (${fresh}).`, code: "section-exists", freshSection: fresh, applied: false } };
  }
  /* مدةُ كل لقاءٍ أولاً: سطرٌ يسمّي اللقاءَ المخالف أصدقُ من «الساعات ناقصة» التي يسبّبها. */
  for (const meeting of meetings) {
    const days = SCHEDULE_DAY_KEYS.filter(day => meeting?.[day] === true);
    if (!days.length) return fail(400, { error: "كلُّ لقاءٍ يحتاج يوماً واحداً على الأقل." });
    const issue = meetingLengthIssue(days as any, meeting?.fstarttime, meeting?.fendtime);
    if (issue) return fail(400, { error: issue, issues: [{ type: "validation", severity: "high", message: issue }] });
  }
  const overrideRequestHolds = Array.isArray(req.body?.overrideRequestHolds) ? req.body.overrideRequestHolds : undefined;
  const overrides = input.dryRun ? [] : await applyRequestHoldOverride(req);
  const owners = (req as any).__requestReservationOwner || "";

  const bodies = meetings.map((meeting, index) => {
    const body: any = {
      AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdCourseId: courseId, SCode: code,
      AdInstructorId: Number(meeting?.AdInstructorId || instructorId) || instructorId,
      fstarttime: meeting?.fstarttime, fendtime: meeting?.fendtime,
      practical: meeting?.practical === true,
      ...(input.origin ? { origin: input.origin } : {}),
    };
    for (const day of SCHEDULE_DAY_KEYS) body[day] = meeting?.[day] === true;
    for (const key of PLACE_KEYS) if (meeting?.[key] !== undefined) body[key] = meeting[key];
    if (overrideRequestHolds) body.overrideRequestHolds = overrideRequestHolds;
    return { body, tempId: -900200 - index };
  });
  const finalWeek: FSchedule[] = [...termRows, ...bodies.map(item => ({ ...item.body, id: item.tempId } as FSchedule))];
  const weekFor = (tempId: number) => finalWeek.filter(row => Number(row.id) !== tempId);
  const gate = regulationGate(req);
  const warnings: any[] = [];
  const planned: any[] = [];
  for (const item of bodies) {
    const dry = await runScheduleHandler(createScheduleHandler, req, { body: item.body, hypotheticalWeek: weekFor(item.tempId), dryRun: true, regulation: true });
    if (dry.status >= 400) return fail(dry.status, dry.body && typeof dry.body === "object" ? dry.body : { error: "تعذّر التنفيذ." });
    planned.push(dry.body.row);
    warnings.push(...(dry.body?.warnings || []));
    gate.note(dry);
  }
  if (input.dryRun) return { status: 200, json: { ok: true, dryRun: true, sectionCode: code, warnings, regulation: gate.issues } };
  const exception = gate.refusal();
  if (exception) return fail(409, exception);

  const version = await captureScopeVersion(req, collegeId, sectionId, termId, "قبل إضافة شعبةٍ بطبيعةٍ خاصة", "manual");
  const registry = await readLocationRegistry();
  const instructors = await Repository.getInstructors();
  let committed: { rows: FSchedule[]; deletedIds: number[] };
  try {
    committed = await Repository.commitScheduleChangeSet(termId, planned.map(body => ({ kind: "create" as const, body })),
      row => canonicalizeHistoricalLocationForRuntime(row, registry), placeholderInstructorIds(instructors as any), async (rows, week) => {
        for (const row of rows) { const issue = await sectionShapeIssue(row, week, { skipPattern: true }); if (issue) throw new RequestReservationConflict(issue); }
      }, owners);
  } catch (error: any) {
    if (error instanceof RequestHoldConflict) return fail(409, await requestHoldRefusal([error.holdRequestId], [error.holdItemId]));
    return fail(error instanceof ScheduleRevisionConflict || error instanceof RequestReservationConflict ? 409 : 503, { error: error?.message || "تعذّر التنفيذ. لم يُحفظ أي تغيير." });
  }
  try {
    await recordVersionAfter(version, before => [...before, ...committed.rows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId)]);
    await noteScheduleMutation(req, collegeId, sectionId, termId, { kind: "add", rows: committed.rows } as any);
  } catch { warnings.push({ message: "حُفظت الشعبة؛ تعذّر تحديث سجل النسخة أو الإشعار." }); }
  if (overrides.length) await noteRequestHoldOverride(overrides, committed.rows[0] || null, String(req.user?.Name || "القسم"));
  if (!(req as any).__requestReservationOwner && !input.origin) for (const row of committed.rows) await noteDepartmentAddition(row, String(req.user?.Name || "القسم")).catch(() => undefined);
  const name = String(course.CourseName || "مقرر");
  const shape = specialShapeSummary(committed.rows as any[]);
  return {
    status: 201,
    rows: committed.rows,
    audit: `إضافة شعبة ${code} لـ«${name}» بطبيعةٍ خاصة: ${shape}${gate.auditSuffix()}`,
    trail: { target: `${name} · ش${code}`, after: shape, scope: { collegeId, sectionId, termId }, row: Number(committed.rows[0]?.id || 0) },
    json: { ok: true, rows: committed.rows, undo: committed.rows.map(row => ({ method: "DELETE" as const, url: `/api/schedules/${row.id}` })), warnings },
  };
}
