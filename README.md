# Schedule Academic Workspace

This is an operational/admin system for deterministic academic timetabling. Reliability, authentication, authorization, and order integrity are more important than refactoring aesthetics.

## Architecture

- **Core Engine:** A deterministic scheduling engine with comprehensive tests verifying schedule conflict correctness, location/building/room integrity, and legacy migration parity.
- **Comprehension Layer:** A Google Gemini-powered comprehension layer that *reads and explains* only. It never writes directly to the database without passing the deterministic validators and obtaining explicit user confirmation.
- **Frontend UI:** Designed for stability and accessibility, preserving legacy-data compatibility and business rules.

## Setup and Testing

- Ensure you use \`npm ci\` for dependency resolution instead of \`npm install\` to preserve Docker reproducibility.
- **Typecheck:** \`npm run lint\`
- **Unit and Regression Tests:** \`npm test\`
- **Gemini Comprehension Layer Tests:** \`npm run test:gemini-layer\`

## Deployment and CI

- **Production Build:** \`npm run build\`
- The project is configured with a strict CI pipeline (`.github/workflows/ci.yml`) that ensures all tests, typechecks, and builds pass before any merge.
- Deployment to the official Cloud Run service is defined in `.github/workflows/deploy-schedule.yml`. It runs automatically after the CI workflow completes successfully for a push to `main`, and can also be started manually with `workflow_dispatch`. It then verifies that the official domain serves the deployed build. See `docs/DELIVERY_OPERATIONS.md` and `docs/SAFE_DEPLOYMENT.md` before changing anything related to deployment.

## Recovery Documentation

Always use branches and PRs for changes, and maintain a clear rollback plan. Do not redesign the UI or rewrite working scheduling logic unless addressing a defect supported by tests.

## Standing Rules (owner decisions)

These are fixed decisions by the system owner. Do not change them without the owner's explicit request.

- ⚠️ **Course numbers are 7 digits only.** Every course number a reader sees (printed report, query screen, Excel export) is the Authority number: college (2) + department (2) + course (3), e.g. `01` + `09` + `105` = `0109105`. The catalogue usually stores only the last 3 digits, so never render `CourseCode` or `CourseCodeSnapshot` directly, and never render `AdCourseId` (an internal id). Build the number with `authorityCourseCode()` and the department key from `authorityDepartmentCode()` in `src/utils/authorityAcademicCodes.ts`; on the query screen use `courseNumberOf`. Guarded by `npm run test:course-number-seven-digit`.
- **Header decides the department (SWRSCHA PDF).** The department and branch come from the page header, even when a course number carries another department's code. A missing department or course is created only after one confirmation, under its printed number and name, with the usual permission; a three-digit tail alone never links (0114464 is not 0120464). Scans never create.
- ⚠️ **Printed reports keep their design.** Fix values and data, not the layout. A layout change that cannot be avoided must reuse the existing print classes and be checked on a Chrome-printed A4 landscape PDF before merging.

## Requirements Document (SRS) — وثيقة المتطلبات

The system has a bilingual (Arabic/English) Software Requirements Specification under `docs/srs/`. It is the contract between the owners, the university and the code, so it must never fall behind.

- ⚠️ **Any change that adds, changes or removes a feature updates its requirement in the same change.** Requirements live in `docs/srs/modules/*.json` (one file per module; schema and style in `docs/srs/AUTHORING.md`). Each requirement lists the code files that implement it and the tests that prove it.
- `npm run test:srs-doc` (part of `npm test`, so part of the automated checks) fails the merge when: a source file belongs to no module; a server route was added or removed without `npm run srs:sync`; a referenced file does not exist; a banned wording appears; or the PDFs are older than the written content (`npm run srs:pdf` regenerates them into `docs/srs/pdf/`).
- Every pull request that changes product code must also change something under `docs/srs/` (the requirement of the feature that changed). If the change truly alters nothing the SRS describes (an internal fix, performance, tests), write `[srs: no change]` (or `[srs: بلا تغيير]`) in the pull request title or description with the reason. The CI step "SRS pull-request guard" (`scripts/srs/pr-guard.mjs`) refuses anything else.
- The interactive page is rebuilt on every deployment by `npm run build` and served at a private, secret URL (`/srs/<key>/`, handled by `src/server/srsDoc.ts`). Only the SHA-256 of the key is stored (`docs/srs/access.sha256`); the key itself is never committed. Rotating the key means replacing that hash.
- Counts, coverage, endpoint totals and screenshots-free statistics are extracted from the repository on every build — they are never typed by hand.

> ⚠️ **رقم المقرر سبع خانات فقط:** الكلية (2) ثم القسم (2) ثم المقرر (3)، مثل `0109105`. لا تُعرض الخانات الثلاث المخزّنة ولا `AdCourseId`. **وتصميم التقارير المطبوعة لا يُمسّ:** الإصلاح في البيانات لا في الشكل.
