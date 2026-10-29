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
- ⚠️ **Printed reports keep their design.** Fix values and data, not the layout. A layout change that cannot be avoided must reuse the existing print classes and be checked on a Chrome-printed A4 landscape PDF before merging.

> ⚠️ **رقم المقرر سبع خانات فقط:** الكلية (2) ثم القسم (2) ثم المقرر (3)، مثل `0109105`. لا تُعرض الخانات الثلاث المخزّنة ولا `AdCourseId`. **وتصميم التقارير المطبوعة لا يُمسّ:** الإصلاح في البيانات لا في الشكل.
