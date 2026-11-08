/**
 * ── «نشر ← بطاقة الأستاذ» لكل شخص (قرار المالك 2026-11-08) ──
 *
 *   course-defaults  مقرراتُ القسم بجهتَي الصحيفة، وتاريخُ تدريس كل أستاذ — لورقة «المقررات» (✏️ و🎓).
 *   preview          بطاقتُه كما يراها، بمسار القراءة نفسه (serveRequestCard) — لا يُصدَر شيء ولا يُسجَّل فتح.
 *   preview-page     صفحةُ البطاقة نفسها في وضع المعاينة.
 *   follow-up        ✉️ لم يفتح · 👀 فتح · ✅ ردّ لكل من وصلته بطاقة، ومن لم يرد.
 *   remind           «ذكّر من لم يرد»: لمن لم يرد في ✏️ وحده، بقناة التسليم القائمة (كرتُه، وواتساب بيد المنسّق).
 *
 * كلُّها بإذن القسم (7) ونطاقه، وبلا رقمٍ مدني ولا قاعة.
 */
import type { Express, Response } from "express";
import { Repository } from "../../db/repository";
import type { InstructorRequest } from "../../types";
import { type AuthenticatedRequest, requirePermission } from "../core/auth";
import { isScopeAllowed } from "../core/scope";
import { staffFamilyScopes } from "../core/staffCard";
import { currentInstructorRequestGeneration, instructorRequestSectionCourses, requestWindowOpen } from "../core/instructorRequests";
import { exclusionRefusal, readCardExclusions } from "../core/cardRecipients";
import { placeholderInstructorIds } from "../core/smartImport";
import { termChronologyServer } from "../core/ordering";
import { publicPageNonce } from "../core/publicPages";
import { planBadgesFor, sheetSidesFor } from "../planBadgeShared";
import { pushHooks } from "../pushRoutes";
import { serveRequestCard } from "./publicRequestRoutes";
import { instructorRequestPage } from "../pages/instructorRequestPage";
import { followUpState, reminderTargets } from "../../utils/cardRecipients";
import { latestRequestByInstructor } from "../../utils/requestReissue";
import { linkMode } from "../../utils/linkMode";
import { requestItemFromRow } from "../../utils/instructorRequestItems";
import { normalizeInstructorDeadline } from "../../utils/instructorRequestWindows";
import { isTrainingAssistant } from "../../utils/taConversion";
import { byCourseNumber } from "../../utils/sheetMembership";

const scopeOf = (source: any) => ({ collegeId: Number(source?.collegeId || 0), sectionId: Number(source?.sectionId || 0), termId: Number(source?.termId || 0) });

async function familyRequests(collegeId: number, sectionId: number, termId: number): Promise<InstructorRequest[]> {
  const family = await staffFamilyScopes(collegeId, sectionId);
  return currentInstructorRequestGeneration((await Promise.all(family.map(scope => Repository.getInstructorRequests(scope.collegeId, scope.sectionId, termId)))).flat());
}

/** أحدثُ بطاقةٍ 👁️/✏️ لكل أستاذ (🎓 لها لوحتُها). */
const latestCards = (rows: InstructorRequest[]) =>
  latestRequestByInstructor(rows.filter(row => row.status !== "superseded" && linkMode(row) !== "ta"));

export function registerPublishCardsRoutes(app: Express): void {

app.get("/api/instructor-requests/course-defaults", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = scopeOf(req.query);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const family = await staffFamilyScopes(collegeId, sectionId);
  const [catalogue, history, terms, allCourses, instructors] = await Promise.all([
    instructorRequestSectionCourses(sectionId),
    Promise.all(family.map(scope => Repository.getSchedulesByScope({ collegeId: scope.collegeId, sectionId: scope.sectionId }))),
    Repository.getTerms(),
    Repository.getCourses(),
    Repository.getInstructors(),
  ]);
  const courses = (catalogue as any[]).filter(row => Number(row.AdCollegeId) === collegeId)
    .map(row => ({ id: Number(row.AdCourseId), name: String(row.CourseName || ""), code: String(row.CourseCode || "") })).filter(row => row.id)
    .sort(byCourseNumber((course: { code: string; name: string }) => course.code, course => course.name));
  const ids = courses.map(course => course.id);
  const [sides, badges] = await Promise.all([sheetSidesFor(sectionId, ids), planBadgesFor(ids.map(courseId => ({ courseId, sectionId })))]);
  const planLabel = ids.map(id => badges[`${sectionId}:${id}`]).find(Boolean) || "";
  /* «درّسه» = فصلٌ أسبق بالتسلسل الزمني في عائلة القسم (القاعدةُ نفسُها في «من يدرّس كل مقرر»). */
  const target = (terms as any[]).find(row => Number(row.AdTermId) === termId);
  const rank = termChronologyServer(target);
  const earlier = new Set<number>((terms as any[]).filter(row => termChronologyServer(row) < rank).map(row => Number(row.AdTermId)));
  const rows = history.flat() as any[];
  const placeholders = placeholderInstructorIds(instructors as any[]);
  const wanted = new Set<number>([
    ...rows.filter(row => Number(row.AdTermId) === termId).map(row => Number(row.AdInstructorId || 0)),
    ...(instructors as any[]).filter(isTrainingAssistant).map(row => Number(row.AdInstructorId)),
  ].filter(id => id && !placeholders.has(id)));
  const courseName = new Map((allCourses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const taught: Record<string, Array<{ id: number; name: string }>> = {};
  for (const row of rows) {
    const id = Number(row.AdInstructorId || 0), courseId = Number(row.AdCourseId || 0);
    if (!wanted.has(id) || !courseId || !earlier.has(Number(row.AdTermId))) continue;
    const list = taught[String(id)] ||= [];
    if (!list.some(entry => entry.id === courseId)) list.push({ id: courseId, name: courseName.get(courseId) || String(row.AdCourseName || "") });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ courses: courses.map(course => ({ ...course, side: sides?.[course.id] || null })), planLabel, taught });
});

/* ── المعاينة ─────────────────────────────────────────────────────────────── */
app.get("/api/instructor-requests/preview", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = scopeOf(req.query);
  const instructorId = Number(req.query.instructorId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  if (!Number.isSafeInteger(instructorId) || instructorId <= 0) { res.status(400).json({ error: "اختر الأستاذ." }); return; }
  const excluded = await readCardExclusions(collegeId, sectionId, termId);
  if (excluded.has(instructorId)) { res.status(400).json({ error: exclusionRefusal(excluded.get(instructorId)!), code: "card-excluded" }); return; }
  const mode = req.query.mode === "view" ? "view" : "edit";
  const family = await staffFamilyScopes(collegeId, sectionId);
  const [familyRows, termRows, courses, colleges, requests] = await Promise.all([
    Promise.all(family.map(scope => Repository.getSchedulesByScope({ collegeId: scope.collegeId, sectionId: scope.sectionId, termId }))),
    Repository.getSchedulesByScope({ termId }),
    Repository.getCourses(),
    Repository.getColleges(),
    familyRequests(collegeId, sectionId, termId),
  ]);
  if (!familyRows.flat().some((row: any) => Number(row.AdInstructorId) === instructorId)) { res.status(404).json({ error: "الأستاذ ليس في جدول هذه العائلة والفصل." }); return; }
  /* مقرراتُ المعاينة كما ستُرسل: «courseIds» قائمةٌ (أو «all» بلا قيد)؛ غيابُها = ما في بطاقته الآن. */
  const rawIds = typeof req.query.courseIds === "string" ? req.query.courseIds : undefined;
  const chosen = rawIds === undefined ? undefined : rawIds === "all" || !rawIds ? null
    : [...new Set(rawIds.split(",").map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 400);
  const closesAt = normalizeInstructorDeadline(String(req.query.closesAt || "")) || new Date(Date.now() + 7 * 86400000).toISOString();
  const held = latestCards(requests).get(instructorId);
  const courseName = new Map((courses as any[]).map(row => [Number(row.AdCourseId), String(row.CourseName || "")]));
  const collegeNameById = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const now = new Date().toISOString();
  /* بطاقتُه القائمة إن كانت، بالصفة والموعد والمقررات التي ستُرسل؛ وإلا بطاقةٌ تُبنى في الذاكرة كما يبنيها الإصدار. لا يُحفظ شيء. */
  const request: InstructorRequest = held ? {
    ...held, linkMode: mode, window: { opensAt: held.window?.opensAt || now, closesAt },
    offeredCourseIds: chosen === undefined ? held.offeredCourseIds ?? null : chosen,
  } : {
    id: "preview", AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId, AdInstructorId: instructorId,
    linkId: "preview", linkMode: mode, window: { opensAt: now, closesAt }, source: "draft", status: "sent",
    offeredCourseIds: chosen ?? null,
    items: (termRows as any[]).filter(row => Number(row.AdInstructorId) === instructorId)
      .map(row => requestItemFromRow(row, courseName.get(Number(row.AdCourseId)) || String(row.AdCourseName || ""), collegeNameById)),
    timeline: [], createdAt: now,
  } as InstructorRequest;
  await serveRequestCard(req, res, { link: { id: "preview" }, request }, true);
});

app.get("/api/instructor-requests/preview-page", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = scopeOf(req.query);
  const instructorId = Number(req.query.instructorId || 0);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId) || !instructorId) { res.status(403).type("text/plain; charset=utf-8").send("خارج نطاق القسم والفصل."); return; }
  const person = (await Repository.getInstructors()).find(row => Number(row.AdInstructorId) === instructorId);
  const params = new URLSearchParams({ collegeId: String(collegeId), sectionId: String(sectionId), termId: String(termId), instructorId: String(instructorId),
    mode: req.query.mode === "view" ? "view" : "edit",
    ...(typeof req.query.courseIds === "string" ? { courseIds: req.query.courseIds.slice(0, 4000) } : {}),
    ...(typeof req.query.closesAt === "string" ? { closesAt: req.query.closesAt.slice(0, 40) } : {}) });
  res.setHeader("Cache-Control", "no-store");
  res.type("text/html; charset=utf-8").send(instructorRequestPage("preview", publicPageNonce(res), "", {
    api: `/api/instructor-requests/preview?${params}`, name: String(person?.AdInstructorName || "الأستاذ"),
  }));
});

/* ── المتابعة ─────────────────────────────────────────────────────────────── */
app.get("/api/instructor-requests/follow-up", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = scopeOf(req.query);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const [requests, excluded, instructors] = await Promise.all([familyRequests(collegeId, sectionId, termId), readCardExclusions(collegeId, sectionId, termId), Repository.getInstructors()]);
  const latest = latestCards(requests);
  const nameOf = new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), String(row.AdInstructorName || "")]));
  res.setHeader("Cache-Control", "no-store");
  res.json({
    people: [...latest.values()].filter(row => !excluded.has(Number(row.AdInstructorId))).map(row => ({
      instructorId: Number(row.AdInstructorId), name: nameOf.get(Number(row.AdInstructorId)) || "", state: followUpState(row), mode: linkMode(row),
      remindedAt: (row.remindedAt || []).at(-1) || "",
    })),
    awaiting: reminderTargets(requests, requestWindowOpen, excluded).map(row => Number(row.AdInstructorId)),
  });
});

app.post("/api/instructor-requests/remind", requirePermission(7), async (req: AuthenticatedRequest, res: Response) => {
  const { collegeId, sectionId, termId } = scopeOf(req.body);
  if (!collegeId || !sectionId || !termId || !isScopeAllowed(req, collegeId, sectionId)) { res.status(403).json({ error: "خارج نطاق القسم والفصل." }); return; }
  const [requests, excluded, instructors] = await Promise.all([familyRequests(collegeId, sectionId, termId), readCardExclusions(collegeId, sectionId, termId), Repository.getInstructors()]);
  /* من يُذكَّر يحكم به الخادم لحظةَ الضغط، لا قائمةٌ قديمة في الصفحة. */
  const targets = reminderTargets(requests, requestWindowOpen, excluded);
  if (!targets.length) { res.status(409).json({ error: "لا أحد ينتظر رده الآن." }); return; }
  const at = new Date().toISOString();
  await Promise.all(targets.map(row => Repository.noteInstructorRequestReminded(row.id, at)));
  /* الديمو: تسليمٌ وهميّ — لا يُدفع تنبيهٌ إلى أي جهاز. والتشغيلُ الفعلي: إلى كرت من فعّل تنبيهاته فيه. */
  const demo = Repository.isDemoMode() || Repository.isDemoRequest();
  if (!demo) await pushHooks.cardReminded(targets.map(row => ({ linkId: row.linkId, closesAt: row.window?.closesAt || "" })));
  const person = new Map((instructors as any[]).map(row => [Number(row.AdInstructorId), row]));
  res.locals.auditChanges = `تذكير من لم يرد في بطاقة الأستاذ: ${targets.length}`;
  res.json({
    delivery: demo ? "demo" : "push", at,
    reminded: targets.map(row => ({
      instructorId: Number(row.AdInstructorId), name: String(person.get(Number(row.AdInstructorId))?.AdInstructorName || ""),
      mobile: String(person.get(Number(row.AdInstructorId))?.AdInstructorMobile || ""), closesAt: row.window?.closesAt || "",
    })),
  });
});
}
