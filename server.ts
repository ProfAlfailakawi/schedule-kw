import "./src/server/core/boot";
import { RequestReservationConflict } from "./src/utils/instructorRequestReservations";
import express, { Request, Response, NextFunction } from "express";
import compression from "compression";
import path from "path";
import fs from "fs";
import { randomBytes } from "crypto";
import { initDatabase, Repository } from "./src/db/repository";
import { loadLimitOf, loadTermContext, withLoadPolicies } from "./src/utils/teachingLoad";
import { coerceScopeValues } from "./src/utils/scopeContext";
import { readOnlyRefusal, roleWriteDecision } from "./src/server/roleGuard";
import { registerStudyProposalRoutes } from "./src/server/studyProposalRoutes";
import { termIsFrozen, TERM_FROZEN_MESSAGE } from "./src/utils/termSequence";
import { createLinkMissGuard } from "./src/server/anonymousGuard";
import { PUBLIC_LINK_PAGE_PREFIXES } from "./src/utils/demoLinkToken";
import { verificationCode } from "./src/utils/approvalWorkflow";
import { DEFAULT_MIGRATION_ROLE, isAcademicRole, isReadOnlyRole, roleLabel } from "./src/utils/academicRoles";
import { AR, countOf, oblique } from "./src/utils/arabicCount";
import type { DegreeRule } from "./src/utils/degreeRules";
import type { PlanRuleCandidate } from "./src/utils/graduationPlan";
import { adInjection, registerAdsRoutes } from "./src/server/adsRoutes";
import { registerStudentDoorRoutes, scheduleStudentProfilePurge } from "./src/server/studentDoorRoutes";
import { registerStudentShowcase } from "./src/server/studentShowcase";
import { registerPlanReviewRoutes } from "./src/server/planReviewRoutes";
import { registerPlanSheetRoutes } from "./src/server/planSheetRoutes";
import { registerSimulationRoutes, scheduleRadarAutoRun } from "./src/server/simulationRoutes";
import { registerInsightRoutes } from "./src/server/insightRoutes";
import { registerTimeMachineRoutes } from "./src/server/timeMachineRoutes";
import { registerRoomDoorRoutes } from "./src/server/roomDoorRoutes";
import { scheduleAutoTermJob } from "./src/server/autoTerms";
import { registerPushRoutes } from "./src/server/pushRoutes";
import { eligibleHallsForSection } from "./src/utils/locationRegistry";
import { state } from "./src/server/core/state";
import { noteScheduleMutation, scheduleLockRefusal } from "./src/server/core/approvals";
import { passwordChangeGate } from "./src/server/accountPassword";
import { type AuthenticatedRequest, authMiddleware, bindPublicLinkContext, DEMO_READ_ONLY_PREFIXES, getCookies, isPowerUser, requireAnyPermission, requireAuth, requirePermission, requirePowerAdmin, requireRootAdmin, ROOT_ADMIN_USER_ID } from "./src/server/core/auth";
import { API_PERFORMANCE_LIMIT, apiPerformanceSamples, asyncSafe } from "./src/server/core/http";
import { instructorRequestDepartmentScopes, resolveRequestLink, verifyRequestSigner } from "./src/server/core/instructorRequests";
import { broadcastNotify, broadcastStudentNotifySoon, listenForScheduleChangesAcrossInstances } from "./src/server/core/liveChannel";
import { canonicalizeHistoricalLocationForRuntime, canonicalizeLocationForWrite, confirmedDepartmentRoomIds, dataContextCacheKey, readLocationRegistry } from "./src/server/core/locations";
import { studentQueueMemo } from "./src/server/core/notifications";
import { sortTermsNewestServer } from "./src/server/core/ordering";
import { publicPageNonce } from "./src/server/core/publicPages";
import { rateLimitPublic, requestLinkLimit } from "./src/server/core/rateLimits";
import { scheduleConflicts } from "./src/server/core/scheduleConflicts";
import { readSchedulesForRequest, termEndedForReading } from "./src/server/core/scheduleReads";
import { scheduleLengthIssue } from "./src/server/core/scheduleRules";
import { createScheduleHandler, runScheduleHandler, updateScheduleHandler } from "./src/server/core/scheduleWrites";
import { isScopeAllowed } from "./src/server/core/scope";
import { graduateProofCore, graduateSubmitCheck, graduateThreshold, graduationCandidatesForSection, isSummerTerm, openStudentIdentity, sealStudentIdentity, studentIdentityKey, surveyFingerprint } from "./src/server/core/studentIdentity";
import { captureScopeVersion, recordVersionAfter } from "./src/server/core/versions";
import { readLiveVisitingRoster } from "./src/server/core/visiting";
import { registerAdminRoutes } from "./src/server/routes/adminRoutes";
import { registerApprovalsRoutes } from "./src/server/routes/approvalsRoutes";
import { registerAuthRoutes } from "./src/server/routes/authRoutes";
import { registerCoursesRoutes } from "./src/server/routes/coursesRoutes";
import { registerDashboardRoutes } from "./src/server/routes/dashboardRoutes";
import { registerDraftsRoutes } from "./src/server/routes/draftsRoutes";
import { registerGuideRoutes } from "./src/server/routes/guideRoutes";
import { registerHallBarterRoutes } from "./src/server/routes/hallBarterRoutes";
import { registerInstructorRequestsRoutes } from "./src/server/routes/instructorRequestsRoutes";
import { registerInstructorsRoutes } from "./src/server/routes/instructorsRoutes";
import { registerIntelligenceInsightRoutes } from "./src/server/routes/intelligenceInsightRoutes";
import { registerIntelligenceRoutes } from "./src/server/routes/intelligenceRoutes";
import { registerLocationsRoutes } from "./src/server/routes/locationsRoutes";
import { registerNotificationsRoutes } from "./src/server/routes/notificationsRoutes";
import { registerOfferingRoutes } from "./src/server/routes/offeringRoutes";
import { registerPdfImportRoutes } from "./src/server/routes/pdfImportRoutes";
import { registerPlanningRoutes } from "./src/server/routes/planningRoutes";
import { registerPublicCalendarRoutes } from "./src/server/routes/publicCalendarRoutes";
import { registerPublicRequestRoutes } from "./src/server/routes/publicRequestRoutes";
import { registerPublicStaffRoutes } from "./src/server/routes/publicStaffRoutes";
import { registerReferenceRoutes } from "./src/server/routes/referenceRoutes";
import { registerReportsRoutes } from "./src/server/routes/reportsRoutes";
import { registerScheduleImportRoutes } from "./src/server/routes/scheduleImportRoutes";
import { registerScheduleLiveRoutes } from "./src/server/routes/scheduleLiveRoutes";
import { registerScheduleNotesRoutes } from "./src/server/routes/scheduleNotesRoutes";
import { registerScheduleReviewRoutes } from "./src/server/routes/scheduleReviewRoutes";
import { registerSchedulesRoutes } from "./src/server/routes/schedulesRoutes";
import { registerScheduleToolsRoutes } from "./src/server/routes/scheduleToolsRoutes";
import { registerShareRoutes } from "./src/server/routes/shareRoutes";
import { registerSmartImportRoutes } from "./src/server/routes/smartImportRoutes";
import { registerStudentRegistrationRoutes } from "./src/server/routes/studentRegistrationRoutes";
import { registerSurveyRoutes } from "./src/server/routes/surveyRoutes";
import { registerSystemRoutes } from "./src/server/routes/systemRoutes";
import { registerUsersRoutes } from "./src/server/routes/usersRoutes";
import { registerSeatsRoutes, seatMemberGuard } from "./src/server/seatsRoutes";
import { registerSectionRequestsRoutes } from "./src/server/sectionRequestsRoutes";
import { registerScheduleHoldsRoutes } from "./src/server/scheduleHoldsRoutes";
import { registerAppointmentMetricsRoutes } from "./src/server/appointmentMetrics";
import { registerVerifyRoutes } from "./src/server/routes/verifyRoutes";

const app = express();
/**
 * Cloud Run terminates TLS at exactly one front-end proxy and sets a trustworthy
 * X-Forwarded-For. Without this, Express reports every external caller as the
 * proxy's own address, so `req.ip` is identical for the whole internet — which
 * collapsed the login/staff-lookup rate limiters into a single shared bucket
 * (one abuser could 429 every user worldwide, and per-attacker isolation was
 * gone). Trusting one hop restores the real client IP as the limiter key.
 */
app.set("trust proxy", 1);
/* المنفذُ ثابتٌ (3000) في كل بيئة. والتجريبيُّ وحده (DATA_MODE=demo) يقبل PORT ليُشغَّل بجانب خادمٍ آخر في بيئات التطوير والاختبار؛
   فلا يتغيّر المنفذُ في أي نشرٍ حقيقيّ (Cloud Run ينشر بـDATA_MODE=firestore). */
const PORT = process.env.DATA_MODE === "demo" && Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;
for (const verb of ["get", "post", "put", "patch", "delete", "all", "use"] as const) {
  const original = (app as any)[verb].bind(app);
  (app as any)[verb] = (...args: any[]) => original(...args.map(asyncSafe));
}
// The last line of defence: whatever escapes everything above is written down,
// and the university's server keeps serving.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandled-rejection] الخادم مستمر في العمل:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("[uncaught-exception] الخادم مستمر في العمل:", error?.stack || error);
});

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!process.env.APPLET_ID) {
    res.setHeader("X-Frame-Options", "DENY");
  }
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  /**
   * ── HSTS ────────────────────────────────────────────────────────────────────
   * Cloud Run already redirects http to https; this makes the browser refuse the
   * insecure hop in the first place, which is the half a redirect cannot cover.
   * Production only: a `localhost` development origin pinned to https would be
   * unreachable, and the pin lasts a year.
   */
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  /**
   * ── CSP: the half that cannot break a working page ──────────────────────────
   *
   * A full policy for the application shell would have to account for its inline
   * boot script, its module bundle, its workers and its wasm — and getting one of
   * those wrong is a white screen, not a warning. That policy is not written
   * blind; the generated public pages below carry a strict one instead, because
   * their markup is entirely server-authored and can be nonced with confidence.
   *
   * What is set here is the subset that restricts nothing the application does
   * and still closes real classes of attack: no plugins, no injected <base> to
   * re-point every relative URL, no form posting to a foreign origin, and no
   * framing outside the hosted preview iframe.
   */
  const cspFrameAncestors = process.env.APPLET_ID ? "" : "; frame-ancestors 'none'";
  res.setHeader("Content-Security-Policy", `object-src 'none'; base-uri 'self'; form-action 'self'${cspFrameAncestors}`);
  next();
});
// Every text response leaves the building gzipped. The largest payloads here —
// a term's schedule rows, the intelligence readings, the app bundle itself —
// are JSON and JavaScript, which compress to a quarter of their size or less;
// on Cloud Run the wire is the slow part, not the CPU. Event streams are left
// alone (compression buffers them into silence), and anything under 1KB is not
// worth the header.
app.use(compression({
  threshold: 1024,
  filter: (req: any, res: any) => {
    const type = String(res.getHeader("Content-Type") || "");
    // Streams must not be buffered: SSE, and the NDJSON progress the PDF reader
    // emits line by line. Compressing either holds every line until the end,
    // which is exactly the frozen wait the progress bar exists to remove.
    if (type.includes("text/event-stream") || type.includes("x-ndjson")) return false;
    return compression.filter(req, res);
  },
}) as any);
// Full-system backups are intentionally compressed and can be much larger than
// ordinary API payloads. Give only the backup upload endpoints a larger raw
// body allowance; every other JSON route keeps the tight 1 MB limit.
app.use(["/api/system-backup/preview", "/api/system-backup/import", "/api/system-backup/import-jobs"], express.raw({
  type: ["application/gzip", "application/octet-stream", "application/json"],
  limit: "30mb",
}));
/* المسودة تحمل الجدول كله (وخط أساس PDF معه)، فحدّ 1 MB العام يرفض قسماً
   كبيراً قبل أن يصل إلى المسار. safeDraftRows يقصّ كل حقل ويحدّ الصفوف بـ450،
   والمسار نفسه يرفض ما لا تتسعه وثيقة Firestore (DRAFT_DOCUMENT_MAX_BYTES). */
app.use("/api/intelligence/drafts", express.json({ limit: "4mb" }));
app.use(express.json({ limit: "1mb" }));

// CSRF hardening without changing the legacy UI: reject cross-site state-changing API requests.
// SameSite=Lax cookies provide a second browser-level layer.
app.use((req, res, next) => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (!mutating || !req.path.startsWith("/api/")) { next(); return; }

  const fetchSite = req.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    res.status(403).json({ error: "الطلب غير مسموح" });
    return;
  }

  const origin = req.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.get("host")) {
        res.status(403).json({ error: "الطلب غير مسموح" });
        return;
      }
    } catch {
      res.status(403).json({ error: "الطلب غير مسموح" });
      return;
    }
  }
  next();
});
app.use("/api/public", rateLimitPublic);
app.use("/api/public/request/:token", requestLinkLimit);
/* نبضُ الزوار والإعلانُ يُحقنان في الصفحات العامة وحدها (انظر server/adsRoutes). */
app.use(adInjection());
registerSystemRoutes(app);

app.use("/api", (req, res, next) => {
  if (!state.databaseDown || req.path === "/landing/inquiry") { next(); return; }
  res.status(503).type("application/json; charset=utf-8").send(JSON.stringify({
    error: "الخدمة متوقفة: تعذر الاتصال بقاعدة البيانات الحقيقية.",
    ref: state.databaseDownRef,
  }));
});
/* صفحاتُ الروابط تعدّ الرموزَ التي لا تطابق شيئاً، لا من يفتحها (anonymousGuard.ts):
   شبكةُ الجامعة تفتح ألف رابطٍ صحيح ولا تُحجب، ومن يخمّن يُوقَف قبل أن يُسأل عنه أحد. */
app.use(PUBLIC_LINK_PAGE_PREFIXES.map(prefix => `${prefix}:token`), createLinkMissGuard());
app.use(PUBLIC_LINK_PAGE_PREFIXES.map(prefix => `${prefix}:token`), bindPublicLinkContext);

// A dedicated demo service binds every API request to the caller's own in-memory sandbox.
// No demo request can fall through to another visitor's state. Production mode bypasses this entirely.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/public/")) { bindPublicLinkContext(req, res, next); return; }
  const sessionId = getCookies(req)["session_id"];
  // /journey is intentionally a marketing read of the real institutional
  // aggregate. On a real deployment it must never inherit a visitor's
  // synthetic Demo sandbox. A DATA_MODE=demo deployment has no institutional
  // data at all (its base state is empty), so there the visitor's own sandbox
  // is the only truthful source and Journey reads it.
  if (!sessionId?.startsWith("demo_") || req.path === "/auth/demo" || (req.path === "/journey" && !Repository.isDemoMode())) { next(); return; }
  (req as AuthenticatedRequest).demoSessionId = sessionId;
  if (!Repository.runDemoSandbox(sessionId, next)) next();
});

// Only the API needs to know who is calling. Stylesheets, fonts and the shell
// were paying for an identity lookup they never read.
app.use("/api", authMiddleware as express.RequestHandler);
/* حسابٌ عليه اختيارُ كلمة سرّه (كلمةٌ أولى، أو الموحّدةُ القديمة) لا يصل إلى غير ‎/auth/*‎ حتى يغيّرها. */
app.use("/api", passwordChangeGate as express.RequestHandler);
app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!Repository.isDemoRequest() || req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") { next(); return; }
  if (req.path === "/auth/logout" || req.path === "/auth/heartbeat" || req.path === "/auth/presence" || req.path === "/demo/reset" || req.path === "/demo/role") { next(); return; }
  if (DEMO_READ_ONLY_PREFIXES.some(prefix => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    res.status(403).json({ error: "هذه شاشة عرض في البيئة التجريبية. الإدارة الحقيقية محمية ولا يمكن تعديلها من Demo." });
    return;
  }
  next();
});

/* ══════════════════════════════════════════════════════════════════════════
   حارس الأدوار: نقطة واحدة، لا مئة
   ══════════════════════════════════════════════════════════════════════════

   هذا الخادم ملفٌّ واحد فيه مئة وثمانية عشر مساراً يكتب. ولو استُوثق الدور في
   كل واحدٍ منها لكان النسيان في واحدٍ فقط كافياً ليُفتح للعميد بابُ تعديلٍ لا
   يعلم به أحد — والباب الذي يُنسى مرّة يُنسى ثانيةً مع كل مسارٍ جديد.

   فالحارس هنا، مرّةً واحدة، على مدخل ‎/api‎ كله، بنفس النمط الذي يحمي به
   النظام بيئته التجريبية أصلاً: أيُّ طلبٍ ليس قراءةً، من دورٍ قارئ، يُرفض —
   مهما كانت الشاشات في FormSecurity، ومهما فُعل بأزرار الواجهة.

   وله بابٌ ضيّق واحد: مسارات دورة الاعتماد. لأن الملاحظة والتوقيع والإرجاع
   والقبول ليست تعديلاً على الجدول؛ هي الطريقة التي يشارك بها القارئ دون أن
   يمسّ صفاً واحداً. وحتى هذا الباب مقسومٌ بالدور: من يوقّع ليس من يُرجع، ومن
   يمدّد ليس من يعلّق — والتفصيل في كل مسارٍ على حدة.

   أمّا أدوار العرض الصرف — العميد والعميد المساعد وعميد التسجيل — فلا تمرّ من
   هذا الباب أصلاً: لا تكتب شيئاً البتّة، ولا حتى ملاحظة.                     */

app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const verdict = roleWriteDecision({
    method: req.method,
    path: req.path,
    authenticated: Boolean(req.user),
    powerUser: Boolean(req.user) && isPowerUser(req),
    role: req.user?.Role,
  });
  if (verdict.allowed) { next(); return; }
  res.status(403).json(readOnlyRefusal(req.user?.Role));
});
/* عضوُ فريق الكرسي يعمل ولا يوقّع ولا يدير الكرسيَّ ولا يغيّر كلمة سرّه (docs/SEATS.md). */
app.use("/api", seatMemberGuard as express.RequestHandler);
/* حارسُ الزملاء يجدّد حجزه كل 45 ثانية، ومقياسُ الإدخال مجهولُ الهوية: لا يدخلان عيّناتِ الأداء
   ولا سجلَّ العمليات — الأولُ نبضٌ يدفن السجلّ، والثاني يُربط هناك بصاحبه (appointmentMetrics.ts). */
const QUIET_API_PATHS = new Set(["/schedule-holds", "/metrics/appointment-entry"]);
app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (req.path === "/health" || req.path === "/telemetry/client" || QUIET_API_PATHS.has(req.path)) { next(); return; }
  const started = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const q:any = req.query || {}, b:any = req.body || {};
    apiPerformanceSamples.push({
      at: Date.now(), path: req.path, method: req.method, durationMs: Math.round(durationMs), status: res.statusCode,
      userId: Number(req.user?.SystemUserId || 0),
      collegeId: Number(q.collegeId || q.AdCollegeId || b.collegeId || b.AdCollegeId || 0),
      sectionId: Number(q.sectionId || q.AdSectionId || b.sectionId || b.AdSectionId || 0),
      termId: Number(q.termId || q.AdTermId || b.termId || b.AdTermId || 0),
    });
    if (apiPerformanceSamples.length > API_PERFORMANCE_LIMIT) apiPerformanceSamples.splice(0, apiPerformanceSamples.length - API_PERFORMANCE_LIMIT);
  });
  next();
});

// Additive audit trail for successful state-changing API calls. No request body is stored,
// so passwords and other sensitive values never enter the operational history.
app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  /**
   * Sign-ins belong in the record, and so do refusals.
   *
   * The trail used to skip everything under /auth/ and everything that failed —
   * so the two questions an investigation actually opens with ("who was in the
   * system that afternoon?" and "did anyone try and get turned away?") had no
   * answer at all. Login, logout and denied attempts are recorded now; the
   * heartbeat is not, because a heartbeat every four minutes per person would
   * bury the log it is written in.
   */
  /**
   * The path is read NOW, not when the response finishes.
   *
   * Express rewrites `req.url` while dispatching mounted middleware and puts it
   * back afterwards — so by the time the `finish` event fires, `req.path` is the
   * full original path again. Reading it there labelled every sign-in as a
   * sign-out, and derived the entity from "api" instead of the collection.
   */
  const routePath = req.path;
  const authKind = routePath === "/auth/login" ? "login" : routePath === "/auth/logout" ? "logout" : null;
  const authEvent = authKind !== null;
  /* «المقروء» في الجرس تفضيلٌ لا تعديل، ويُكتب مع كل ضغطة على إشعار: تسجيله
     يدفن السجلّ كما يدفنه النبض. */
  const skip = (routePath.startsWith("/auth/") && !authEvent) || routePath.endsWith("/check-conflicts") || routePath === "/telemetry/client" || routePath === "/notifications/seen" || QUIET_API_PATHS.has(routePath);
  if (!mutating || skip) { next(); return; }
  const startedUser = req.user ? { id: Number(req.user.SystemUserId), name: String(req.user.Name || req.user.SystemUserLogin || "") } : null;
  res.on("finish", () => {
    // A login has no `req.user` when it starts — the account is only known once
    // it succeeds — so the auth trail reads the id the handler left behind.
    const actor = startedUser
      || (authEvent && res.locals?.auditUser ? res.locals.auditUser as { id: number; name: string } : null)
      || (authEvent ? { id: 0, name: String(req.body?.username || "مجهول") } : null);
    if (!actor) return;
    const refused = res.statusCode >= 400;
    // Everything that changed state is kept; of the refusals, only the ones
    // worth investigating — a rejected login, a permission wall, a conflict.
    if (refused && !authEvent && ![403, 409].includes(res.statusCode)) return;
    if (!refused && !startedUser && !authEvent) return;
    const pieces = routePath.split("/").filter(Boolean);
    /* بعض المعالجات تسمّي كيانها ومعرّفه بنفسها (الإعلانات: «admin/ads/…» لا يقول شيئاً)؛ وإلا فمن المسار كما كان. */
    const entity = (res.locals?.auditEntity as string | undefined) || pieces[0] || "system";
    const entityId = (res.locals?.auditEntityId as string | undefined) || (pieces.length > 1 ? pieces[pieces.length - 1] : undefined);
    const action = routePath.includes("/safety-net/") && routePath.endsWith("/undo")
      ? "تراجع"
      : routePath.includes("/versions/") && routePath.endsWith("/restore")
        ? "استرجاع"
        : routePath.includes("/drafts/") && routePath.endsWith("/publish")
          ? "نشر"
          : routePath.includes("/copy")
            ? "نسخ"
            : req.method === "POST"
              ? "إضافة"
              : req.method === "DELETE"
                ? "حذف"
                : "تعديل";
    const finalAction = authKind
      ? (authKind === "login" ? (refused ? "محاولة دخول مرفوضة" : "تسجيل دخول") : "تسجيل خروج")
      : refused
        ? (res.statusCode === 403 ? `${action} — مرفوض (خارج الصلاحية)` : `${action} — مرفوض (تعارض)`)
        : action;
    void Repository.createAuditLog({
      SystemUserId: actor.id, userName: actor.name, method: req.method, path: req.originalUrl,
      action: finalAction, entity, entityId,
      // What actually changed, when the handler was able to say. A log that
      // records "موعد #418 عُدّل" answers nothing; the question is always
      // "from what, to what".
      changes: (res.locals?.auditChanges as string | undefined) || undefined,
      /* الصفوفُ التي مسّها الطلب حين لا يحمل مسارُه معرّفها (إضافةٌ، اعتمادُ اقتراح): لتُقرأ «لماذا؟» من الموعد. */
      rowIds: Array.isArray(res.locals?.auditRowIds) ? (res.locals.auditRowIds as number[]).slice(0, 10) : undefined,
      status: res.statusCode
    }).catch(error => console.error("Audit log write failed:", error));
  });
  next();
});
registerAuthRoutes(app);
registerDashboardRoutes(app);
registerReferenceRoutes(app);
registerInstructorsRoutes(app);
registerCoursesRoutes(app);
for (const prefix of ["/api/approvals", "/api/schedule-notes", "/api/instructor-requests"]) {
  app.use(prefix, (req: Request, res: Response, next: NextFunction) => {
    const demoSessionId = (req as AuthenticatedRequest).demoSessionId || "";
    if (req.method !== "GET") res.on("finish", () => { if (res.statusCode < 300) broadcastNotify(demoSessionId); });
    next();
  });
}
app.use("/api/student-registration", (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET") res.on("finish", () => {
    if (res.statusCode >= 300) return;
    studentQueueMemo.invalidate();
    broadcastStudentNotifySoon();
  });
  next();
});
registerScheduleLiveRoutes(app);
registerSchedulesRoutes(app);
registerHallBarterRoutes(app);
registerScheduleImportRoutes(app);
registerScheduleReviewRoutes(app);
registerIntelligenceInsightRoutes(app);
registerReportsRoutes(app);
registerLocationsRoutes(app);
registerScheduleToolsRoutes(app);
registerGuideRoutes(app);
registerIntelligenceRoutes(app);
registerDraftsRoutes(app);
registerSmartImportRoutes(app);
registerPdfImportRoutes(app);
registerApprovalsRoutes(app);
registerScheduleNotesRoutes(app);
registerNotificationsRoutes(app);
registerAdminRoutes(app);
registerUsersRoutes(app);
registerSeatsRoutes(app);
/* حارسُ الزملاء: حجزٌ ليّن لدقيقتين يراه من يبني موعداً معك، ومقياسُ إدخال المواعيد (مجهول الهوية). */
registerScheduleHoldsRoutes(app);
registerAppointmentMetricsRoutes(app);
registerShareRoutes(app);
registerPlanningRoutes(app);
registerPublicCalendarRoutes(app);
registerPublicStaffRoutes(app);
registerSurveyRoutes(app);
registerStudentRegistrationRoutes(app);
/* «طلب شعبة»: الإرشاد ← لجنة الجدول ← التسجيل، ببطاقاتٍ في كشف التسجيل (src/utils/sectionRequests.ts). */
registerSectionRequestsRoutes(app);
registerInstructorRequestsRoutes(app);
registerPublicRequestRoutes(app);

/* ── المقترح الدراسي: ما يعدّه القسم للأستاذ من عدة مواد ─────────────────────
   كلُّ ما يلزمه من هذا الملف يُحقَن حقناً: الفاحصُ هو scheduleConflicts نفسه
   (على الجدول الناتج)، والتثبيتُ يمرّ بصلاحيات الحفظ وقفل الجدول والنسخ نفسها. */
registerStudyProposalRoutes(app, {
  requirePermission,
  broadcastNotify,
  resolveRequestLink: resolveRequestLink as any,
  verifyRequestSigner,
  surveyFingerprint,
  verificationCode,
  captureScopeVersion: captureScopeVersion as any,
  recordVersionAfter,
  noteScheduleMutation: noteScheduleMutation as any,
  departmentScopes: instructorRequestDepartmentScopes,
  roleLabel: roleLabel as any,
  demoSessionId: () => Repository.currentDemoSessionId(),
  scheduleConflicts: scheduleConflicts as any,
  scheduleLockRefusal: scheduleLockRefusal as any,
  canWrite: (req, collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
  canSee: (req, collegeId, sectionId) => Boolean(req?.user?.IsAdminUser) || isScopeAllowed(req, collegeId, sectionId),
  canonicalizeLocation: async (row, collegeId, sectionId) => {
    const located = await canonicalizeLocationForWrite(row, collegeId, sectionId);
    return { ok: Boolean(located.check.ok), message: located.check.issues?.[0]?.message, canonical: located.check.canonical };
  },
});
registerOfferingRoutes(app);
registerVerifyRoutes(app);

/* ── مراجعةُ الصحيفة: مسوّدةٌ للقسم، واعتمادٌ لرئيس لجنة الجدول ───────────────── */
registerPlanReviewRoutes(app, {
  requireAuth,
  isScopeAllowed: (req, collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
  isPowerUser: req => isPowerUser(req),
  isRootAdmin: req => Number(req.user?.SystemUserId) === ROOT_ADMIN_USER_ID,
  hasPermission: (req, formId) => (req.permissions || []).includes(formId),
  actorName: req => String(req.user?.Name || req.user?.SystemUserLogin || roleLabel(req.user?.Role) || ""),
});

/* ── الصحائف العامة: رئيس لجنة الجدول ينشر صحيفةً معتمدة فتصير رابطاً وQR وPDF بلا حساب ── */
/* القالبُ يُقرأ مرةً عند الإقلاع (كما صفحةُ الهبوط)، فلا قراءةَ ملفاتٍ داخل الطلب؛ ويستعمله مسارُ الصحائف العامة وخريطةُ الطالب. */
let planSheetTemplate = "";
for (const candidate of [path.join(process.cwd(), "public", "plans", "_template", "sheet.html"), path.join(process.cwd(), "dist", "plans", "_template", "sheet.html")]) {
  try { if (fs.existsSync(candidate)) { planSheetTemplate = fs.readFileSync(candidate, "utf8"); break; } } catch { /* التالي */ }
}
{
  registerPlanSheetRoutes(app, {
    requireAuth,
    isScopeAllowed: (req, collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
    isPowerUser: req => isPowerUser(req),
    actorName: req => String(req.user?.Name || req.user?.SystemUserLogin || roleLabel(req.user?.Role) || ""),
    template: planSheetTemplate,
  });
}

/* ── الإعلانات ونبضُ الزوار ولوحة الجمهور: قياسٌ مجهول، وإدارةٌ لحساب الإدارة الرئيسي ── */
registerAdsRoutes(app, { requireAuth, requireRootAdmin, publicPageNonce });

/* ── بابُ القاعة وشاشةُ الممر: ملصقٌ على كل باب ولوحةٌ لكل مبنى (قراءةٌ عامة)، وروابطُها لمدير السجل ── */
registerRoomDoorRoutes(app, {
  publicPageNonce,
  readLocationRegistry: () => readLocationRegistry(),
  normalizeLocation: (row, registry) => canonicalizeHistoricalLocationForRuntime(row, registry),
  requireRegistryAdmin: [requirePermission(7), requirePowerAdmin],
});

/* ── بروفةُ التسجيل: تشغيلٌ لإدارة النظام، وقراءةٌ بحدود النطاق ──────────────── */
registerSimulationRoutes(app, {
  requireAuth,
  isScopeAllowed: (req, collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
  isPowerUser: req => isPowerUser(req),
  actorName: req => String(req.user?.Name || req.user?.SystemUserLogin || roleLabel(req.user?.Role) || ""),
  dataContextKey: dataContextCacheKey,
});
registerInsightRoutes(app, {
  requireAuth,
  isScopeAllowed: (req, collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
  isPowerUser: req => isPowerUser(req),
});

/* ── آلة الزمن ومحاكي الشعب: قراءةٌ ومحاكاة لمن يقرأ الجدول، واعتمادٌ ذرّيّ لمن يكتبه ── */
registerTimeMachineRoutes(app, {
  requireRead: requireAnyPermission([7, 8, 9, 10, 14, 16, 17]),
  requireWrite: requirePermission(7),
  isScopeAllowed: (req, collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
  isPowerUser: req => isPowerUser(req),
  canWrite: async (req: AuthenticatedRequest) => {
    if (!req.user || isReadOnlyRole(req.user.Role)) return false;
    const granted = req.permissions ?? (await Repository.getSecurityByUser(req.user.SystemUserId)).map(item => Number(item.FormNameId));
    return granted.includes(7);
  },
  actor: (req: AuthenticatedRequest) => ({ name: String(req.user?.Name || req.user?.SystemUserLogin || ""), role: roleLabel(req.user?.Role) || "" }),
  resolveScope: async (req: AuthenticatedRequest, collegeId, sectionId, termId) => {
    const terms = sortTermsNewestServer(await Repository.getTerms());
    let scope = { collegeId, sectionId };
    if (!req.user?.IsAdminUser) {
      /* نطاقُ الكلية كاملةً (العميد) يسمح بأي قسمٍ فيها: يُقبل المطلوب إن أذن به الحَكَم، وإلا أولُ قسمٍ مسموح. */
      if (!(collegeId && sectionId && isScopeAllowed(req, collegeId, sectionId))) {
        scope = coerceScopeValues(req.scopes || [], collegeId, sectionId, false);
        if (!scope.sectionId) {
          const first = (await Repository.getSections()).find(item => (!scope.collegeId || Number(item.AdCollegeId) === scope.collegeId) && isScopeAllowed(req, Number(item.AdCollegeId), Number(item.AdSectionId)));
          scope = { collegeId: Number(first?.AdCollegeId || 0), sectionId: Number(first?.AdSectionId || 0) };
        }
      }
    } else if (!sectionId) {
      const first = (await Repository.getSections()).find(item => !collegeId || Number(item.AdCollegeId) === collegeId);
      scope = { collegeId: Number(first?.AdCollegeId || collegeId), sectionId: Number(first?.AdSectionId || 0) };
    }
    /* بلا فصلٍ مطلوب: أحدثُ فصلٍ فيه جدولٌ لهذا القسم (الفصل الأحدث قد يكون فارغاً بعد). */
    let term = termId && terms.some(item => Number(item.AdTermId) === termId) ? termId : 0;
    for (const item of term ? [] : terms) {
      if ((await Repository.getSchedulesByScope({ collegeId: scope.collegeId, sectionId: scope.sectionId, termId: Number(item.AdTermId) })).length) { term = Number(item.AdTermId); break; }
    }
    return { collegeId: scope.collegeId, sectionId: scope.sectionId, termId: term || Number(terms[0]?.AdTermId || 0) };
  },
  readScopeRows: (req: AuthenticatedRequest, collegeId, sectionId, termId) => readSchedulesForRequest(req, collegeId, sectionId, termId),
  hallsFor: async (collegeId, sectionId, termId) => {
    const [registry, barter, pinned] = await Promise.all([readLocationRegistry(), Repository.getHallBarterRequests(termId), Repository.getPinnedDepartmentRooms(collegeId, sectionId)]);
    const borrowed = new Set(barter.filter(request => request.status === "approved" && Number(request.requesterCollegeId) === collegeId && Number(request.requesterSectionId) === sectionId && request.roomId).map(request => String(request.roomId)));
    const byId = new Map(registry.rooms.map(room => [String(room.id), room]));
    return eligibleHallsForSection(registry, sectionId, borrowed, confirmedDepartmentRoomIds(registry, pinned, collegeId)).map(hall => ({
      code: hall.room, hall: hall.hall, buildingId: hall.buildingId, roomId: hall.roomId,
      capacity: byId.get(hall.roomId)?.capacity ?? null, roomType: byId.get(hall.roomId)?.roomType || "",
    }));
  },
  instructorsFor: async (collegeId, sectionId, termId) => {
    const [scoped, historical, visiting] = await Promise.all([
      Repository.getInstructorsByScope(sectionId, termId), Repository.getInstructorsByScope(sectionId, 0), readLiveVisitingRoster(collegeId, sectionId, termId),
    ]);
    return [...new Map([...historical, ...scoped, ...visiting.instructors].map(person => [Number(person.AdInstructorId), person])).values()];
  },
  coursesFor: sectionId => Repository.getOperationalCoursesBySection(sectionId),
  /* السقفُ نفسُه في كل مكان: الأعلى + الإضافي من استثناء العضو (الساري في الفصل المُحاكى) أو درجته، وإلا نصابُه
     المسجّل. والصفرُ الصريح (إعفاءٌ كامل) قيدٌ يُرسَل؛ ومن لا قيدَ له لا مفتاحَ له. */
  loadLimits: async (instructors, termId) => {
    const [config, terms] = await Promise.all([Repository.getTeachingLoadConfig(), Repository.getTerms()]);
    return Object.fromEntries(withLoadPolicies(instructors, config, loadTermContext(terms as any, termId))
      .map(person => [String(person.AdInstructorId), loadLimitOf(person)] as [string, number | null])
      .filter((entry): entry is [string, number] => entry[1] !== null));
  },
  /* فصلٌ مجمَّد أو منتهٍ: آلة الزمن تُقرأ وتُحاكى فيه ولا تكتب (كالتخطيط والاستيراد). */
  termFrozen: async termId => (termIsFrozen(termId, (await Repository.getTerms()) as any) ? TERM_FROZEN_MESSAGE
    : await termEndedForReading(termId) ? "انتهى هذا الفصل: آلة الزمن للقراءة والمحاكاة فقط." : null),
  dryRunUpdate: (req: AuthenticatedRequest, rowId, body, week, exactRestore) => runScheduleHandler(updateScheduleHandler, req, { params: { id: String(rowId) }, body, hypotheticalWeek: week, dryRun: true, exactRestore }),
  dryRunCreate: (req: AuthenticatedRequest, body, week, exactRestore) => runScheduleHandler(createScheduleHandler, req, { body, hypotheticalWeek: week, dryRun: true, exactRestore }),
  lockRefusal: (req: AuthenticatedRequest, collegeId, sectionId, termId) => scheduleLockRefusal(req, collegeId, sectionId, termId),
  captureVersion: (req: AuthenticatedRequest, collegeId, sectionId, termId, label) => captureScopeVersion(req, collegeId, sectionId, termId, label, "manual"),
  /* «ما صار» من صفوف الاعتماد نفسها (R7): يُستدعى بعد المعاملة وقبل الردّ. */
  recordVersionAfter: async (version, after) => { await recordVersionAfter(version, after); },
  noteMutation: (req: AuthenticatedRequest, collegeId, sectionId, termId, change) => noteScheduleMutation(req, collegeId, sectionId, termId, change),
  normalizer: async () => { const registry = await readLocationRegistry(); return row => canonicalizeHistoricalLocationForRuntime(row, registry); },
  lengthIssue: (row, week) => scheduleLengthIssue(row, week),
  dataContextKey: dataContextCacheKey,
});

/* ── 🔔 تنبيهاتُ الجوال (Web Push): المساراتُ والمفتاح وخطافاتُ الأحداث في src/server/pushRoutes.ts ── */
registerPushRoutes(app, {
  requireAuth,
  isScopeAllowed: (req, collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId),
  isPowerUser: req => isPowerUser(req),
  resolveCard: async token => { const resolved = await resolveRequestLink(token); return "error" in resolved ? null : { token: resolved.link.id, instructorId: Number(resolved.request.AdInstructorId) }; },
});

/* ── مساري: رابطٌ دائمٌ واحدٌ للجامعة كلها ────────────────────────────
 *
 * لا يحمل قسماً ولا فصلاً ولا رمزاً: الطالبُ هو المفتاح، والفصلُ يُقرأ من
 * التواريخ (utils/termStudentPhases). فملصقٌ يُطبع مرةً يبقى صالحاً سنين. */
/* «جرّب كطالب»: صندوقٌ خاصّ لكل زائر يُنفَّذ فيه مساري ببياناتٍ افتراضية (src/server/studentShowcase.ts). */
registerStudentShowcase(app, { identityKey: studentIdentityKey, sealIdentity: sealStudentIdentity, isProduction: () => process.env.NODE_ENV === "production" });
registerStudentDoorRoutes(app, {
  surveyFingerprint,
  sealIdentity: sealStudentIdentity,
  openIdentity: value => openStudentIdentity(value),
  identityKey: studentIdentityKey,
  isProduction: () => process.env.NODE_ENV === "production",
  planSheetTemplate,
  /* طلبُ الخريج في «مساري»: القواعدُ نفسُها التي يقرؤها الاستبيان القديم (واحدةٌ في الخادم). */
  graduate: {
    rule: async (sectionId: number, planId: string | undefined, termName: string) => {
      const candidates = await graduationCandidatesForSection(sectionId);
      const ruled = candidates.filter((row): row is PlanRuleCandidate & { rule: DegreeRule } => Boolean(row.rule));
      if (!ruled.length) return { saved: false, summer: isSummerTerm(termName) };
      const own = planId ? ruled.find(row => row.planId === planId) : undefined;
      const thresholds = ruled.map(row => graduateThreshold(row.rule, termName)).filter(n => n > 0);
      const picked = own || (ruled.length === 1 ? ruled[0] : undefined);
      return { saved: true, summer: isSummerTerm(termName), threshold: picked ? graduateThreshold(picked.rule, termName) : undefined,
        minThreshold: thresholds.length ? Math.min(...thresholds) : undefined, degreeUnits: picked ? Number(picked.rule.degreeUnits) : undefined };
    },
    proof: (input) => new Promise<{ status: number; body: any }>(resolve => {
      const sink = { status: (code: number) => ({ json: (body: any) => resolve({ status: code, body }) }), json: (body: any) => resolve({ status: 200, body }) };
      graduateProofCore(input, sink).catch((error: any) => resolve({ status: 500, body: { error: String(error?.message || "تعذّر التحقق من الصحيفة الآن. أعد المحاولة.") } }));
    }),
    submit: graduateSubmitCheck,
  },
});

// --- VITE DEV SERVER OR STATIC SERVING ---

/**
 * ── ترحيل الحسابات القائمة إلى «رئيس لجنة الجدول» ───────────────────────────
 *
 * يوم يُضاف بُعد الدور، تكون كل الحسابات الموجودة بلا دور. ولو قُرئ غيابُ
 * الدور «مستخدماً عادياً» لاختلف سلوك النظام على من يستعمله اليوم، ولو قُرئ
 * دوراً قارئاً لتوقّف بناء الجداول في الكلية كلها صباح التحديث.
 *
 * والحقيقة أبسط من الاحتمالين: كل حسابٍ قائمٍ اليوم يبني جدولاً ويرسله — أي
 * أنه «رئيس لجنة» بالتعريف. فيُكتب له ذلك مرّةً واحدة، صراحةً في السجلّ، بدل
 * أن يُستنتج عند كل قراءة.
 *
 * والعملية محايدة بالتكرار: حسابٌ له دورٌ لا يُمسّ، فإعادة التشغيل لا تُعيد
 * كتابة شيء. وحساب الإدارة الرئيسي يبقى خارجها — هو من يوزّع الأدوار، لا من
 * توزَّع عليه.
 */
async function migrateLegacyAccountsToCommitteeRole(): Promise<void> {
  try {
    const users = await Repository.getUsers();
    const pending = users.filter(user => !user.IsDeleted && !isAcademicRole((user as any).Role) && Number(user.SystemUserId) !== ROOT_ADMIN_USER_ID);
    if (!pending.length) return;
    for (const user of pending) {
      await Repository.updateUser(Number(user.SystemUserId), { Role: DEFAULT_MIGRATION_ROLE });
    }
    console.log(`[roles] رُحّل ${countOf(pending.length, AR.account)} إلى صفة «${roleLabel(DEFAULT_MIGRATION_ROLE)}».`);
  } catch (error) {
    /* الترحيل راحةٌ لا شرط: غيابُ الدور يُقرأ «رئيس لجنة» في كل موضع على أي
       حال، فلا يجوز أن يمنع فشلُه إقلاعَ الخادم. */
    console.error("[roles] تعذّر ترحيل صفات الحسابات القائمة:", error instanceof Error ? error.message : error);
  }
}

/*
 * ── مصالحةُ صلاحيات رؤساء الأقسام ─────────────────────────────────────────────
 *
 * صار رئيسُ القسم لا يملك شاشةَ الورشة (٧): يقرأ ويعلّق ويوقّع، ولا يعدّل. لكنّ
 * الحسابات المُنشأة قبل هذا التغيير تحمل صفَّ `FormSecurity` للشاشة ٧ من القالب
 * القديم، والواجهةُ تشتقّ `allowed.schedule` منه — وحفظُ الحساب لا يُعيد تطبيق
 * القالب إلا عند تغيّر الصفة. فتبقى الورشةُ مفتوحةً لهم على نشرةٍ مُحدَّثة.
 *
 * فتُزال الشاشةُ ٧ عن كل حساب صفتُه «رئيس قسم» عند الإقلاع — محايدةٌ بالتكرار،
 * ولا تمسّ صلاحياته الأخرى، ولا يمنع فشلُها الإقلاع.
 */
const SCHEDULE_WORKSPACE_FORM_ID = 7;
async function reconcileDepartmentHeadPermissions(): Promise<void> {
  try {
    const users = await Repository.getUsers();
    let changed = 0;
    for (const user of users) {
      if (user.IsDeleted || String((user as any).Role) !== "departmentHead") continue;
      const perms = (await Repository.getSecurityByUser(Number(user.SystemUserId))).map(row => Number(row.FormNameId));
      if (!perms.includes(SCHEDULE_WORKSPACE_FORM_ID)) continue;
      await Repository.saveSecurityByUser(Number(user.SystemUserId), perms.filter(id => id !== SCHEDULE_WORKSPACE_FORM_ID));
      changed++;
    }
    if (changed) console.log(`[roles] أُزيلت شاشةُ الورشة عن ${countOf(changed, oblique(AR.account))} «رئيس قسم» — يقرأ ولا يعدّل.`);
  } catch (error) {
    console.error("[roles] تعذّرت مصالحةُ صلاحيات رؤساء الأقسام:", error instanceof Error ? error.message : error);
  }
}

async function startServer() {
  // Wait for the data layer before accepting any requests. In Firestore mode this also
  // completes the one-time import of the verified legacy snapshot when the target is empty.
  /**
   * No database, no service.
   *
   * This used to log the failure and carry on listening, which produced the
   * worst possible outcome: a site that answers, renders, and shows nothing —
   * indistinguishable to the person looking at it from a site with an empty
   * schedule. On a real deployment the process now exits, so the platform keeps
   * the previous working revision serving instead of replacing it with a broken
   * one. Locally it stays up and says exactly what is wrong on every request,
   * because a developer needs to read the reason, not guess it.
   */
  /**
   * No database, no data — but in development, still a running server.
   *
   * ── NOTE TO ANY AUTOMATED EDITOR ───────────────────────────────────────────
   * If you are here because the dev server would not start, the fix is NOT to
   * make the database fall back to the packaged demo snapshot. That fallback
   * has been added and removed from this project repeatedly, and each time it
   * produced the worst possible outcome: an application that looks completely
   * healthy while showing a schedule that is not the university's. People made
   * real decisions from invented rows.
   *
   * The server already starts without a database. Only /api answers 503, so
   * Vite serves the shell, the interface loads, and it says plainly what is
   * wrong. If something still fails to boot, fix the boot — do not restore the
   * fallback, and do not widen this handler beyond /api.
   * ───────────────────────────────────────────────────────────────────────────
   *
   * On a real deployment the process exits instead, so the platform keeps the
   * previous working revision rather than replacing it with a broken one.
   */
  const isServingBuild = process.env.NODE_ENV === "production" ||
                         process.env.npm_lifecycle_event === "start" ||
                         Boolean(process.argv[1]?.endsWith("server.cjs"));
  let databaseFailure: string | null = null;
  try {
    await initDatabase();
  } catch (error) {
    databaseFailure = error instanceof Error ? error.message : String(error);
    state.databaseDownRef = randomBytes(4).toString("hex");
    console.error(`تعذر تهيئة قاعدة البيانات [${state.databaseDownRef}]:\n` + databaseFailure);
    if (isServingBuild) {
      console.error("لن يبدأ الخادم على بيانات بديلة. تبقى النسخة السابقة العاملة كما هي.");
      process.exit(1);
    }
    console.error("التطوير: الواجهة ستعمل، وكل طلبات /api سترد 503 بالسبب. لا بيانات بديلة.");
    // The guard registered at load reads this; the shell keeps serving.
    state.databaseDown = databaseFailure;
  }

  if (!databaseFailure) await migrateLegacyAccountsToCommitteeRole();
  if (!databaseFailure) await reconcileDepartmentHeadPermissions();
  /* الفصل التالي يُنشأ وحده (أكتوبر ← الثاني، يناير ← الصيفي، أبريل ← الأول). */
  if (!databaseFailure) scheduleAutoTermJob({
    isDemoMode: () => Repository.isDemoMode(),
    createTermIfAbsent: (name, dates) => Repository.createTermIfAbsent(name, dates),
    getTerms: () => Repository.getTerms() as any,
    closeTerm: term => Repository.updateTerm(term.AdTermId, term.AdTermName,
      { start: term.AdTermStart, weeks: term.AdTermWeeks, closed: true }),
    log: message => console.log(message),
  });
  /* ملفّاتُ الطلبة تُحذف وحدها حين ينتهي عمرُها (التخرّج المتوقَّع + سنة، أو الانقطاع). */
  if (!databaseFailure) scheduleStudentProfilePurge(message => console.log(message));
  if (!databaseFailure) scheduleRadarAutoRun(message => console.log(message));

  // ── تسجيل طلبات الاستعراض من صفحة الهبوط التسويقية ──────────────────────────
  app.post("/api/landing/inquiry", express.json(), (req, res) => {
    try {
      const { institution, name, email, phone, scale, message } = req.body || {};
      console.log("[landing-inquiry] New executive demo request:", {
        institution,
        name,
        email,
        phone,
        scale,
        messageLength: message ? String(message).length : 0,
        receivedAt: new Date().toISOString(),
      });
      res.json({
        success: true,
        message: "تم استلام طلبكم بنجاح. سيتواصل معكم فريقنا الأكاديمي خلال 24 ساعة.",
      });
    } catch (e: any) {
      console.error("[landing-inquiry] Failed to process inquiry:", e);
      res.status(500).json({ error: "تعذر تسجيل الطلب مؤقتاً." });
    }
  });

  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
  });

  /**
   * One request may fail. The building may not fall down.
   *
   * Express 4 does not catch a rejected promise from an async handler, so a
   * single Firestore DEADLINE_EXCEEDED used to travel all the way up as an
   * unhandled rejection — which on modern Node terminates the process. One slow
   * network moment would drop every in-flight request in the university and cut
   * every live schedule stream, and the person who saw it got a blank 503 with
   * nothing to report.
   *
   * Now the failure stops here: it is logged with its route so it can be found,
   * and the caller is answered in the language they are reading. The response
   * says only that the read failed — an internal message may name a collection
   * or a document path, and that is not a stranger's business.
   */
  app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    // The route is passed as an argument, never folded into the first string:
    // `originalUrl` is whatever a stranger typed, and the first argument to
    // console.error is a format string — a URL carrying `%s` would otherwise
    // swallow the error itself and the log would lose what it was written for.
    /* K3: a short reference ties what the reader sees to this log line, so an
       administrator can find the real cause instead of a generic sentence. */
    const ref = `E${Date.now().toString(36).slice(-5).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    console.error("[api-error] ref=%s %s %s:", ref, req.method, req.originalUrl, error?.stack || error?.message || error);
    if (res.headersSent) { try { res.end(); } catch { /* the socket is already gone */ } return; }
    if (error instanceof RequestReservationConflict) { res.status(409).json({ error: error.message, code: error.code }); return; }
    /* «حاول مرة أخرى» كذبٌ على طلبٍ أكبر من الحد: سيُرفض في كل مرة. */
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "البيانات المرسلة أكبر من الحد المسموح، ولم يُحفظ شيء. أبلغ إدارة النظام بهذه الرسالة.", code: "PAYLOAD_TOO_LARGE" });
      return;
    }
    /* جسمُ طلبٍ ليس JSON صالحاً خطأٌ من المُرسِل لا من الخادم: «حاول مرة أخرى» برمز مرجعٍ تضليلٌ له (500 كان). */
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "تعذّرت قراءة البيانات المرسلة: صيغتها غير صالحة. حدّث الصفحة وأعد المحاولة.", code: "BAD_JSON" });
      return;
    }
    res.status(500).json({ error: "تعذّر إتمام العملية الآن. حاول مرة أخرى، وإذا تكرر الأمر أبلغ إدارة النظام برمز المرجع.", code: "INTERNAL", ref });
  });

  const isProduction = process.env.NODE_ENV === "production" ||
                       process.env.npm_lifecycle_event === "start" ||
                       process.argv[1]?.endsWith("server.cjs");

  // ── توجيه صفحة الهبوط التسويقية (Quiet Luxury Landing Page) ─────────────────
  // معزولة ومستقلة تماماً: تُعرض حصراً عند طلب /landing أو /landing/ أو عبر النطاق الفرعي home.*
  // ولا تؤثر إطلاقاً على مسارات المنظومة القائمة ومساحة العمل الرئيسية.
  const isLandingRequest = (req: Request) => {
    const host = String(req.hostname || req.headers.host || "").toLowerCase();
    const cleanPath = req.path.toLowerCase();
    return host.startsWith("home.") || cleanPath === "/landing" || cleanPath === "/landing/" || cleanPath.startsWith("/landing/");
  };

  // Resolve the landing directory and read its index once, at startup — no
  // per-request filesystem access happens inside the route handlers below, which
  // keeps traversal impossible and keeps these routes off the missing-rate-limit
  // path (a hand-rolled fs read/serve inside a request handler is what triggers it).
  const landingBase = path.resolve(process.cwd(), isProduction ? "dist/landing" : "public/landing");
  const landingIndexCandidates = isProduction
    ? [path.join(process.cwd(), "dist", "landing", "index.html"), path.join(process.cwd(), "public", "landing", "index.html")]
    : [path.join(process.cwd(), "public", "landing", "index.html")];
  let landingIndexHtml = "";
  for (const candidate of landingIndexCandidates) {
    try {
      if (fs.existsSync(candidate)) { landingIndexHtml = fs.readFileSync(candidate, "utf8"); break; }
    } catch { /* fall through to the next candidate */ }
  }

  // Static sub-assets under /landing/ (css/js/images). express.static rejects
  // path traversal itself and, being library middleware rather than a hand-rolled
  // filesystem handler, is served safely without building a path from the request.
  app.use("/landing", express.static(landingBase, { index: false, fallthrough: true, redirect: false }));

  // SPA index for /landing, /landing/ and the home.* host — served from memory,
  // so a missing or unmatched asset falls through here to the landing page.
  app.use((req, res, next) => {
    if (!isLandingRequest(req)) return next();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(landingIndexHtml);
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    // Keep executable application files revalidated. A JavaScript response that
    // is interrupted in transit must never become a year-long immutable copy in
    // the browser. Fonts/images are content-addressed or stable public assets and
    // remain safely cacheable. The service worker itself is deliberately no-store
    // because its URL is not hashed.
    /**
     * A build asset's filename contains a hash of its own bytes, so the content
     * at that URL is immutable by construction — a changed file is a changed
     * URL. Revalidating those on every launch cost a network round trip per
     * asset before the application could paint, on exactly the connections that
     * can least afford one. Anything that does NOT carry a hash keeps the strict
     * revalidation rule, so an interrupted transfer of an unhashed file still
     * cannot be adopted as a long-lived copy.
     */
    const hashedAsset = /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/;
    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        if (name === "index.html" || name === "sw.js") {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        } else if (hashedAsset.test(name)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (/\.(?:js|css)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate, max-age=0");
        } else if (/\.(?:woff2?|png|svg|jpg|webp)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache, must-revalidate, max-age=0");
        }
      }
    }));
    /**
     * A missing file must answer 404, not the application shell.
     *
     * The catch-all below exists so that /FSchedule/Index reaches the router.
     * Applied to everything, it also answered requests for build assets: a tab
     * still holding the previous release asked for a chunk that no longer
     * exists and received index.html with status 200. The browser then tried to
     * run HTML as JavaScript, the module never executed, and the page stayed
     * blank with nothing in the network log looking wrong. Anything that names
     * a file — /assets/*, or a path with an extension — now fails honestly, so
     * the page's boot guard can clear the stale copy and reload.
     */
    const looksLikeFile = /\.[a-z0-9]{2,8}$/i;
    app.get("*", (req, res) => {
      if (req.path.startsWith("/assets/") || looksLikeFile.test(req.path)) {
        res.status(404).setHeader("Cache-Control", "no-store, no-cache, must-revalidate").type("text/plain; charset=utf-8").send("Not found");
        return;
      }
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // The live channel spans instances only once the database is up.
  if (!state.databaseDown) listenForScheduleChangesAcrossInstances();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(error => {
  console.error("Server initialization failed:", error);
  process.exitCode = 1;
});
