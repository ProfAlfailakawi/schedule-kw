# Schedule Academic Workspace (SCHEDULE)

An operational/admin system for deterministic academic timetabling: terms, colleges, departments, courses, faculty, buildings and halls, the weekly schedule, its approval cycle, faculty requests, section planning, student services and printed reports. Reliability, authentication, authorization and data integrity matter more than refactoring aesthetics. A Google Gemini layer reads and explains only; every schedule write passes the deterministic validators and an explicit user confirmation.

- **Live:** <https://schedule-kw.com> (sign-in required for the workspace; a sandboxed demo entry is enabled — `GET /api/demo/config`)
- **Health / build:** <https://schedule-kw.com/api/health> · <https://schedule-kw.com/api/version>

[![Comprehensive CI](https://github.com/ProfAlfailakawi/schedule-kw/actions/workflows/ci.yml/badge.svg)](https://github.com/ProfAlfailakawi/schedule-kw/actions/workflows/ci.yml) [![Deploy SCHEDULE](https://github.com/ProfAlfailakawi/schedule-kw/actions/workflows/deploy-schedule.yml/badge.svg)](https://github.com/ProfAlfailakawi/schedule-kw/actions/workflows/deploy-schedule.yml) <!-- lines-guard: allow CI badge URLs must name the repository -->

> The full, per-requirement specification lives in the SRS under [docs/srs/](docs/srs/) (one JSON file per module in [docs/srs/modules/](docs/srs/modules/)). This README is the map; the SRS is the contract.

## خريطة الميزات / Feature map

Workspace routes need a signed-in account with the matching permission and scope. Public routes marked `:token` open only with a personal link issued by the system.

| الميزة / Feature | ما تفعله / What it does | الرابط المباشر / Live route | الشيفرة / Code | الحالة / Status |
|---|---|---|---|---|
| Sign-in, roles and scopes | Login, first-password choice, users, permissions, college/department scopes, audit log, access cards | [/SystemUser/Index](https://schedule-kw.com/SystemUser/Index) | [Login.tsx](src/components/Login.tsx), [AdminUsers.tsx](src/components/AdminUsers.tsx), [authRoutes.ts](src/server/routes/authRoutes.ts), [usersRoutes.ts](src/server/routes/usersRoutes.ts), [core/auth.ts](src/server/core/auth.ts) | يعمل |
| Reference data | Terms, colleges, departments, courses (7-digit authority numbers), faculty, visiting-to-appointed conversion, teaching load | [/AdTerm/Index](https://schedule-kw.com/AdTerm/Index), [/AdCourse/Index](https://schedule-kw.com/AdCourse/Index) | [Terms.tsx](src/components/Terms.tsx), [Courses.tsx](src/components/Courses.tsx), [Instructors.tsx](src/components/Instructors.tsx), [referenceRoutes.ts](src/server/routes/referenceRoutes.ts), [coursesRoutes.ts](src/server/routes/coursesRoutes.ts), [instructorsRoutes.ts](src/server/routes/instructorsRoutes.ts) | يعمل |
| Buildings and halls | One registry of buildings/halls and hall types, campus travel policy, occupancy grid | [/System/LocationSetup](https://schedule-kw.com/System/LocationSetup) | [LocationQuickSetup.tsx](src/components/LocationQuickSetup.tsx), [locationsRoutes.ts](src/server/routes/locationsRoutes.ts), [core/locations.ts](src/server/core/locations.ts), [core/travelPolicy.ts](src/server/core/travelPolicy.ts) | يعمل |
| Hall barter | Lend/borrow halls between departments with conflict checks | inside the schedule | [HallBarterBoard.tsx](src/components/HallBarterBoard.tsx), [hallBarterRoutes.ts](src/server/routes/hallBarterRoutes.ts) | يعمل |
| Room door pages | Live "now / next" page per hall or building | `/d/:token`, `/b/:token` | [RoomDoorTools.tsx](src/components/RoomDoorTools.tsx), [roomDoorRoutes.ts](src/server/roomDoorRoutes.ts) | يعمل |
| Schedule workshop (deterministic engine) | Week/list/rooms views; every appointment checked for instructor/room/section conflicts, regulation day patterns, lecture lengths, minimum course hours and capacity before it is written; undo and versions | [/FSchedule/Index](https://schedule-kw.com/FSchedule/Index) | [Schedules.tsx](src/components/Schedules.tsx), [schedulesRoutes.ts](src/server/routes/schedulesRoutes.ts), [core/scheduleConflicts.ts](src/server/core/scheduleConflicts.ts), [core/scheduleRules.ts](src/server/core/scheduleRules.ts), [core/capacityRules.ts](src/server/core/capacityRules.ts), [core/scheduleWrites.ts](src/server/core/scheduleWrites.ts) | يعمل |
| Regulation exception | Explicit confirmation before saving an appointment outside the approved patterns (regulation 1913/2016) | inside the schedule | [RegulationExceptionSheet.tsx](src/components/RegulationExceptionSheet.tsx), [docs/srs/regulation.json](docs/srs/regulation.json) | يعمل |
| Teacher mini-week | Small button on each appointment opens the instructor's week and load across the department family | inside the schedule | [TeacherMiniWeek.tsx](src/components/TeacherMiniWeek.tsx) | يعمل |
| Department teaching hours & meeting slots | Per-department day window; "when can we meet?" free-slot finder | [/System/SectionHours](https://schedule-kw.com/System/SectionHours) | [SectionScheduleHours.tsx](src/components/SectionScheduleHours.tsx), [MeetingSlots.tsx](src/components/MeetingSlots.tsx), [scheduleToolsRoutes.ts](src/server/routes/scheduleToolsRoutes.ts) | يعمل |
| Department schedule, copy and publish | Department view, copy a term, publish faculty cards to chosen recipients | [/FSchedule/DepartmentSchedule](https://schedule-kw.com/FSchedule/DepartmentSchedule), [/FSchedule/CopySchedule](https://schedule-kw.com/FSchedule/CopySchedule) | [DepartmentSchedule.tsx](src/components/DepartmentSchedule.tsx), [SchedulePublish.tsx](src/components/SchedulePublish.tsx), [publishCardsRoutes.ts](src/server/publishCardsRoutes.ts) | يعمل |
| Import (Excel / PDF / scans) | Schedule transfer with dry run and paged preview; SWRSCHA PDF import where the page header decides the department; optional Gemini-assisted reading of scans (needs `GEMINI_API_KEY`, results still go through preview and validators) | [/FSchedule/CopySchedule](https://schedule-kw.com/FSchedule/CopySchedule) | [ScheduleTransfer.tsx](src/components/ScheduleTransfer.tsx), [scheduleImportRoutes.ts](src/server/routes/scheduleImportRoutes.ts), [pdfImportRoutes.ts](src/server/routes/pdfImportRoutes.ts), [smartImportRoutes.ts](src/server/routes/smartImportRoutes.ts), [geminiScheduleLayer.ts](src/utils/geminiScheduleLayer.ts) | يعمل |
| Approval cycle | Approval bar, submission deadlines, approval review and dossier, signatures, read-only past terms | inside the schedule | [ApprovalBar.tsx](src/components/ApprovalBar.tsx), [ScheduleReview.tsx](src/components/ScheduleReview.tsx), [ApprovalDossier.tsx](src/components/ApprovalDossier.tsx), [approvalsRoutes.ts](src/server/routes/approvalsRoutes.ts) | يعمل |
| Schedule changes report | Registrar inbox and printed changes report (re-added sections shown as edits with a reference number) | [/FSchedule/Changes](https://schedule-kw.com/FSchedule/Changes) | [ScheduleChanges.tsx](src/components/ScheduleChanges.tsx), [AuthorityPdfReport.tsx](src/components/AuthorityPdfReport.tsx) | يعمل |
| Signature verification | Public check of a signed document code | `/verify/:vid` | [verifyRoutes.ts](src/server/routes/verifyRoutes.ts) | يعمل |
| Faculty requests | Instructor request card with availability and holds; coordinator inbox | [/FSchedule/InstructorRequests](https://schedule-kw.com/FSchedule/InstructorRequests), `/r/:token` | [InstructorInbox.tsx](src/components/InstructorInbox.tsx), [instructorRequestsRoutes.ts](src/server/routes/instructorRequestsRoutes.ts), [publicRequestRoutes.ts](src/server/routes/publicRequestRoutes.ts), [instructorRequestPage.ts](src/server/pages/instructorRequestPage.ts) | يعمل |
| Faculty card and calendar | Personal faculty card and ICS calendar feed | `/s/:token`, `/t/:token` | [staffCardPage.ts](src/server/pages/staffCardPage.ts), [publicStaffRoutes.ts](src/server/routes/publicStaffRoutes.ts), [publicCalendarRoutes.ts](src/server/routes/publicCalendarRoutes.ts) | يعمل |
| Section planning and curricula | Section gap, section build, curriculum plans, plan review, plan sheet upload and publishing, study proposal | [/FSchedule/PlanReview](https://schedule-kw.com/FSchedule/PlanReview), [/plans/](https://schedule-kw.com/plans/) | [SectionPlanning.tsx](src/components/SectionPlanning.tsx), [CurriculumPlans.tsx](src/components/CurriculumPlans.tsx), [PlanReview.tsx](src/components/PlanReview.tsx), [planningRoutes.ts](src/server/routes/planningRoutes.ts), [planSheetRoutes.ts](src/server/planSheetRoutes.ts), [StudyProposalWorkspace.tsx](src/components/proposal/StudyProposalWorkspace.tsx), [studyProposalRoutes.ts](src/server/studyProposalRoutes.ts) | يعمل |
| Masari (student door) | Student home: expected schedule, wishes, ticket, registration and request status | [/me](https://schedule-kw.com/me), `/q/:token`, `/m/:token` | [studentHomePage.ts](src/server/studentHomePage.ts), [studentDoorRoutes.ts](src/server/studentDoorRoutes.ts), [surveyRoutes.ts](src/server/routes/surveyRoutes.ts), [studentCaseStatusPage.ts](src/server/pages/studentCaseStatusPage.ts) | يعمل |
| Student registration and advising | Registration sheet, section requests, advisor seats, registration rehearsal | [/FSchedule/StudentRegistration](https://schedule-kw.com/FSchedule/StudentRegistration), [/SystemUser/Seats](https://schedule-kw.com/SystemUser/Seats), [/FSchedule/Rehearsal](https://schedule-kw.com/FSchedule/Rehearsal) | [StudentRegistration.tsx](src/components/StudentRegistration.tsx), [SectionRequestsPanel.tsx](src/components/sectionRequests/SectionRequestsPanel.tsx), [SeatsAdmin.tsx](src/components/seats/SeatsAdmin.tsx), [seatsRoutes.ts](src/server/seatsRoutes.ts), [RegistrationRehearsal.tsx](src/components/RegistrationRehearsal.tsx), [simulationRoutes.ts](src/server/simulationRoutes.ts) | يعمل |
| Analytics Center | Scoped readings, next-term forecast, decision lab and smart suggestions (instructor instead of placeholder, room in place, course removal, pattern change); suggestions are proposals that go through the validators | [/Schedule/Intelligence](https://schedule-kw.com/Schedule/Intelligence) | [IntelligenceWorkspace.tsx](src/components/IntelligenceWorkspace.tsx), [intelligenceRoutes.ts](src/server/routes/intelligenceRoutes.ts), [intelligenceInsightRoutes.ts](src/server/routes/intelligenceInsightRoutes.ts), [predictiveInsight.ts](src/server/predictiveInsight.ts) | يعمل |
| Time machine and drafts | Try changes on a copy, compare, apply in one piece, go back with one click | [/FSchedule/TimeMachine](https://schedule-kw.com/FSchedule/TimeMachine) | [TimeMachine.tsx](src/components/TimeMachine.tsx), [timeMachineRoutes.ts](src/server/timeMachineRoutes.ts), [draftsRoutes.ts](src/server/routes/draftsRoutes.ts), [core/versions.ts](src/server/core/versions.ts) | يعمل |
| Guide | In-app guide and tours (local index, lazy-loaded) | inside the workspace | [GuideAssistant.tsx](src/components/guide/GuideAssistant.tsx), [docs/GUIDE.md](docs/GUIDE.md) | يعمل |
| Reports and printing | Query screens and printed reports by department, instructor, room, time and room-time | [/FSchedule/MainScheduleReport](https://schedule-kw.com/FSchedule/MainScheduleReport) | [Reports.tsx](src/components/Reports.tsx), [ReportChoicePanel.tsx](src/components/ReportChoicePanel.tsx), [reportsRoutes.ts](src/server/routes/reportsRoutes.ts) | يعمل |
| Notifications and activity | Bell, web push, activity trail, row "why?", live channel | inside the workspace | [NotificationCenter.tsx](src/components/NotificationCenter.tsx), [PushCard.tsx](src/components/PushCard.tsx), [pushRoutes.ts](src/server/pushRoutes.ts), [TrailSheet.tsx](src/components/trail/TrailSheet.tsx), [notificationsRoutes.ts](src/server/routes/notificationsRoutes.ts) | يعمل |
| Home dashboard | Scope bar, decision card, readiness signals, today's lectures, term story | [/Home/Index](https://schedule-kw.com/Home/Index) | [Dashboard.tsx](src/components/Dashboard.tsx), [dashboardRoutes.ts](src/server/routes/dashboardRoutes.ts) | يعمل |
| Ads and audience | Campaigns, placements, audience dashboard (main administrator only, not in demo) | [/System/Ads](https://schedule-kw.com/System/Ads), [/measurement](https://schedule-kw.com/measurement) | [AdsManager.tsx](src/components/AdsManager.tsx), [adsRoutes.ts](src/server/adsRoutes.ts) | يعمل |
| Backup and system vault | Full export/import/reset/undo for the root account | [/System/Backup](https://schedule-kw.com/System/Backup) | [adminRoutes.ts](src/server/routes/adminRoutes.ts) | يعمل |
| Demo sandbox | Isolated demo session with role switching | via the sign-in screen | [authRoutes.ts](src/server/routes/authRoutes.ts), [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md) | يعمل |
| Public pages | Landing page, presentation deck, privacy policy | [/landing/](https://schedule-kw.com/landing/), [/schedule-presentation.html](https://schedule-kw.com/schedule-presentation.html), [/privacy-policy.html](https://schedule-kw.com/privacy-policy.html) | [public/landing/index.html](public/landing/index.html), [public/schedule-presentation.html](public/schedule-presentation.html), [public/privacy-policy.html](public/privacy-policy.html) | يعمل |
| Requirements document (SRS) | Bilingual SRS rebuilt on every build and served at a private URL | private (`/srs/<key>/`) | [srsDoc.ts](src/server/srsDoc.ts), [docs/srs/](docs/srs/) | يعمل |
| Native iOS/iPadOS/Mac shell | Capacitor shell, store metadata and a release script; not part of the web deploy | — | [apple/](apple/), [apple/apple-release.sh](apple/apple-release.sh), [apple-release/](apple-release/) | تجريبي |

## Architecture

- **Stack:** React 19 + Vite 6 front end ([src/App.tsx](src/App.tsx), [src/components/](src/components/)); Express 4 server in TypeScript ([server.ts](server.ts)) bundled with esbuild to `dist/server.cjs`; Firestore through `firebase-admin` / `@google-cloud/firestore` ([src/db/](src/db/)); Tesseract.js and pdf.js for scans and PDFs; optional Google Gemini for reading and explaining ([src/server/core/gemini.ts](src/server/core/gemini.ts)).
- **Server layout** (generated map: [docs/SERVER_MAP.md](docs/SERVER_MAP.md)):
  - [server.ts](server.ts) — composition root: middleware order and `register*Routes(app)` calls.
  - [src/server/core/](src/server/core/) — shared state, auth and scope, conflict checker, schedule rules and writes, versions.
  - [src/server/routes/](src/server/routes/) — one `registerXRoutes` module per domain (schedules, approvals, imports, planning, reports, users…).
  - [src/server/pages/](src/server/pages/) — server-rendered public pages (`/r`, `/s`, student pages).
- **Key endpoints:** `GET /api/health`, `GET /api/version` ([systemRoutes.ts](src/server/routes/systemRoutes.ts)); `POST /api/auth/login`, `GET /api/auth/me` ([authRoutes.ts](src/server/routes/authRoutes.ts)); schedule read/write ([schedulesRoutes.ts](src/server/routes/schedulesRoutes.ts)); conflicts and readiness ([scheduleReviewRoutes.ts](src/server/routes/scheduleReviewRoutes.ts)); approvals ([approvalsRoutes.ts](src/server/routes/approvalsRoutes.ts)). The full endpoint list is extracted into [docs/srs/endpoints.snapshot.json](docs/srs/endpoints.snapshot.json).
- **Gemini boundary:** model calls are reduced to read/simulate functions — write flags such as `commit`/`save` are stripped and unknown functions dropped ([geminiScheduleLayer.ts](src/utils/geminiScheduleLayer.ts), tested by [tests/gemini-schedule-layer.ts](tests/gemini-schedule-layer.ts)). Nothing it returns is saved without the deterministic validators and a user confirmation.

## Run locally

Requires Node.js 20+ (CI uses Node 22) and Python 3 for the data audits. Copy [.env.example](.env.example) to `.env` and fill it locally; never commit real values.

```sh
npm ci            # use ci, not install, to keep Docker builds reproducible
npm run dev       # tsx server.ts on PORT (default 3000)
```

| Script | What it runs |
|---|---|
| `npm run dev` | Build stamp, then `tsx server.ts` (dev server with Vite middleware) |
| `npm run lint` | Build stamp, then `tsc --noEmit` (typecheck) |
| `npm test` | [scripts/run-tests.mjs](scripts/run-tests.mjs): every script listed in [tests/suite.txt](tests/suite.txt); `npm test -- --quick` skips [tests/slow.txt](tests/slow.txt); known failures in [tests/known-failures.txt](tests/known-failures.txt) |
| `npm run build` | PWA/brand/guide checks, guide tests and performance budget, `vite build`, SRS page, esbuild server bundle, service-worker stamp |
| `npm start` | `NODE_ENV=production node dist/server.cjs` |
| `npm run test:gemini-layer` | Gemini boundary tests |
| `npm run test:conflicts` | Conflict-checker parity tests |
| `npm run test:srs-doc` | SRS consistency check (part of `npm test`) |
| `npm run srs:sync` / `npm run srs:pdf` | Refresh the endpoint snapshot / regenerate SRS PDFs |
| `npm run audit:deploy` | Deployment audit ([scripts/deployment-audit.mjs](scripts/deployment-audit.mjs)) |
| `npm run protect:data` | Protect private local state ([scripts/protect-private-state.mjs](scripts/protect-private-state.mjs)) |

Each `test:*` script in [package.json](package.json) runs one audit under [tests/](tests/); the suite runner is the source of truth for which ones gate CI.

## Tests and quality gates

- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) ("Comprehensive CI") on every pull request and push to `main`: SRS pull-request guard and added-lines guard (pull requests only), [deploy target guard](tests/deploy-target-guard.mjs), [repository hygiene guard](tests/repo-hygiene-guard.mjs), `npm ci`, `npm run lint`, `npm test` (quick on pull requests, full on `main`), `npm run build`, then an isolated demo-API scope check (`npm run test:intelligence-api`).
- **Engine correctness:** [tests/conflict-parity.ts](tests/conflict-parity.ts), [tests/regulation-exception.ts](tests/regulation-exception.ts), [tests/capacity-limits-audit.ts](tests/capacity-limits-audit.ts), [tests/lecture-length-audit.ts](tests/lecture-length-audit.ts), [tests/course-number-seven-digit-audit.ts](tests/course-number-seven-digit-audit.ts).
- **Gemini boundary:** [tests/gemini-schedule-layer.ts](tests/gemini-schedule-layer.ts).
- **Data integrity:** [tests/legacy-data-audit.py](tests/legacy-data-audit.py), [tests/parity_audit.py](tests/parity_audit.py), [tests/location-registry-audit.py](tests/location-registry-audit.py).

## Deployment

- **Workflow:** [.github/workflows/deploy-schedule.yml](.github/workflows/deploy-schedule.yml) ("Deploy SCHEDULE").
- **Trigger:** automatic `workflow_run` after "Comprehensive CI" completes successfully for a **push to `main`**, or manual `workflow_dispatch`. It runs only in the production repository and only when the repository variable `PRODUCTION_DEPLOY_ENABLED` is `true` (the owner's kill switch).
- **What it does:** refuses any commit whose full CI run on `main` has not passed, builds one immutable Docker image ([Dockerfile](Dockerfile)), deploys it to the official Cloud Run service in `europe-west1`, then checks that <https://schedule-kw.com/sw.js> serves the same `BUILD` stamp as the service.
- **No path filter:** neither workflow has `paths` / `paths-ignore`, so a documentation-only merge to `main` (including this README) runs the full CI and, if it passes, redeploys the same code.
- [cloudbuild.yaml](cloudbuild.yaml) is not the deploy path (no trigger uses it). Read [docs/DELIVERY_OPERATIONS.md](docs/DELIVERY_OPERATIONS.md) and [docs/SAFE_DEPLOYMENT.md](docs/SAFE_DEPLOYMENT.md) before changing anything deployment-related.

## Recovery

Always use branches and pull requests, and keep a clear rollback plan. Do not redesign the UI or rewrite working scheduling logic unless addressing a defect supported by tests.

## Standing Rules (owner decisions)

These are fixed decisions by the system owner. Do not change them without the owner's explicit request.

- ⚠️ **Course numbers are 7 digits only.** Every course number a reader sees (printed report, query screen, Excel export) is the Authority number: college (2) + department (2) + course (3), e.g. `01` + `09` + `105` = `0109105`. The catalogue usually stores only the last 3 digits, so never render `CourseCode` or `CourseCodeSnapshot` directly, and never render `AdCourseId` (an internal id). Build the number with `authorityCourseCode()` and the department key from `authorityDepartmentCode()` in [src/utils/authorityAcademicCodes.ts](src/utils/authorityAcademicCodes.ts); on the query screen use `courseNumberOf`. Guarded by `npm run test:course-number-seven-digit`.
- **Header decides the department (SWRSCHA PDF).** The department and branch come from the page header, even when a course number carries another department's code. A missing department or course is created only after one confirmation, under its printed number and name, with the usual permission; a three-digit tail alone never links (0114464 is not 0120464). Scans never create.
- ⚠️ **Printed reports keep their design.** Fix values and data, not the layout. A layout change that cannot be avoided must reuse the existing print classes and be checked on a Chrome-printed A4 landscape PDF before merging.

## Requirements Document (SRS) — وثيقة المتطلبات

The system has a bilingual (Arabic/English) Software Requirements Specification under [docs/srs/](docs/srs/). It is the contract between the owners, the university and the code, so it must never fall behind.

- ⚠️ **Any change that adds, changes or removes a feature updates its requirement in the same change.** Requirements live in `docs/srs/modules/*.json` (one file per module; schema and style in [docs/srs/AUTHORING.md](docs/srs/AUTHORING.md)). Each requirement lists the code files that implement it and the tests that prove it.
- `npm run test:srs-doc` (part of `npm test`, so part of the automated checks) fails the merge when: a source file belongs to no module; a server route was added or removed without `npm run srs:sync`; a referenced file does not exist; a banned wording appears; or the PDFs are older than the written content (`npm run srs:pdf` regenerates them into `docs/srs/pdf/`).
- Every pull request that changes product code must also change something under `docs/srs/` (the requirement of the feature that changed). If the change truly alters nothing the SRS describes (an internal fix, performance, tests), write `[srs: no change]` (or `[srs: بلا تغيير]`) in the pull request title or description with the reason. The CI step "SRS pull-request guard" ([scripts/srs/pr-guard.mjs](scripts/srs/pr-guard.mjs)) refuses anything else. README-only changes are not product code and pass this guard.
- The CI step "Added-lines guard" ([scripts/ci/pr-lines-guard.mjs](scripts/ci/pr-lines-guard.mjs), tested by `npm run test:pr-lines-guard`) reads only the lines a pull request adds and refuses reserved wording and owner-private identifiers outside deployment files. A deliberate exception needs `lines-guard: allow <reason>` on the same line.
- The interactive page is rebuilt on every deployment by `npm run build` and served at a private, secret URL (`/srs/<key>/`, handled by [src/server/srsDoc.ts](src/server/srsDoc.ts)). Only the SHA-256 of the key is stored ([docs/srs/access.sha256](docs/srs/access.sha256)); the key itself is never committed. Rotating the key means replacing that hash.
- Counts, coverage, endpoint totals and screenshots-free statistics are extracted from the repository on every build — they are never typed by hand.

> ⚠️ **رقم المقرر سبع خانات فقط:** الكلية (2) ثم القسم (2) ثم المقرر (3)، مثل `0109105`. لا تُعرض الخانات الثلاث المخزّنة ولا `AdCourseId`. **وتصميم التقارير المطبوعة لا يُمسّ:** الإصلاح في البيانات لا في الشكل.

آخر تحديث للتوثيق: 2026-11-12
