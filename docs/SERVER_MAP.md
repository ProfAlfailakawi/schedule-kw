# خريطةُ الخادم

> مولَّدةٌ بـ `node scripts/split-server/split.mjs` — لا تُحرَّر باليد؛ تُعاد مع كل تشغيل.

المرحلة: `pages`. حجمُ `server.ts` بعد التقسيم: 23375 سطراً (كان 25999).

## البنية

- `server.ts` — جذرُ التركيب: إنشاءُ `app`، الوسائطُ العامة بترتيبها، استدعاءاتُ `register*` بالترتيب الذي يحفظ أسبقيةَ الطرق المتلاقية، و`startServer`.
- `src/server/core/` — المساعداتُ المشتركة والوسائطُ والحالة. `core/boot.ts` أولُ ما يستورده `server.ts`: يحمّل الوحداتِ الأصلية بترتيبها القديم ثم يستدعي `configureRuntimeEnvironment()` قبل أن تُحمَّل أيُّ وحدةٍ مقسومة. `core/state.ts` يجمع متغيّراتِ `let` التي تُكتب من أكثر من وحدة (`state.x`).
- `src/server/pages/` — بُناةُ الصفحات العامة بأنماطها وسكربتاتها.
- `src/server/routes/` — `registerXRoutes(app)`: طرقُ كل مجالٍ بترتيبها الأصلي، ومساعداتُها التي لا يستعملها غيرُها.

الوحداتُ المقسومة تستورد ما تحتاجه من `core/` مباشرة؛ فلا `deps` في دوال التسجيل الجديدة (كانت `deps` في الوحدات القديمة لأن ما تحتاجه كان حبيسَ `server.ts`). ولا وحدةَ تستورد `server.ts` (يتحقق منه `test:server-parity`).

نصُّ كل جملةٍ منقولٌ بالبايت مع تعليقاته؛ لا يُمسّ إلا بإضافة `export` وبـ`state.x`. والطرقُ داخل دوال التسجيل بلا إزاحة: إزاحةُ سطرٍ داخل قالبٍ نصّيّ تغيّر ما يُرسَل.

## إعادةُ التقسيم على main أحدث

```sh
git switch -c refactor/server-split origin/main          # فرعٌ جديد من main الأحدث
git checkout <فرع التقسيم السابق> -- scripts/split-server tests/server-route-parity-audit.ts tests/helpers/serverSource.mjs
# ثم أضف test:server-parity إلى package.json وtests/suite.txt إن لم يكونا
npx tsx tests/server-route-parity-audit.ts --update        # ١) لقطتا الموجّه والصفحات من server.ts غير المقسوم ← commit
cp server.ts /tmp/server.orig.ts
node scripts/split-server/split.mjs --plan                 # تقرير: مساراتٌ بلا قاعدة، أحجام، دوالُ تسجيلٍ مقسومة
node scripts/split-server/split.mjs --write --phase pages   --source /tmp/server.orig.ts  # ← commit
node scripts/split-server/split.mjs --write --phase helpers --source /tmp/server.orig.ts  # ← commit
node scripts/split-server/split.mjs --write --phase routes  --source /tmp/server.orig.ts  # ← commit
npx tsx tests/server-route-parity-audit.ts && npm run lint
```

كلُّ مرحلةٍ تُكتب كاملةً من `server.ts` الأصلي (تمسح `src/server/{core,routes,pages}` المولَّدة وتعيد كتابتها)، وتعيد توجيهَ الاختبارات التي تقرأ نصَّ `server.ts` إلى `readServerSource()` (`tests/helpers/serverSource.mjs`). مسارٌ جديد بلا قاعدة يوقف الأداة: أضِفه إلى `routes` في `scripts/split-server/mapping.mjs`. ومساعدٌ جديد يتبع مستعمليه تلقائياً (وحدةٌ واحدة تستعمله ← إليها؛ أكثر ← وحدةُ منطقته في `regions`).

## الوحدات

| الملف | الأسطر | المحتوى |
|---|---:|---|
| `server.ts` | 23375 | جذرُ التركيب |
| `src/server/core/boot.ts` | 192 | الإقلاع: ترتيبُ تحميل الوحدات الأصلية ثم ضبطُ البيئة |
| `src/server/pages/instructorRequestPage.ts` | 1035 | صفحةُ طلب الأستاذ (/r/:token) |
| `src/server/pages/publicInvalidLinkPage.ts` | 15 | صفحةُ الرابط غير الصالح |
| `src/server/pages/staffCardPage.ts` | 571 | بطاقةُ الأستاذ العامة |
| `src/server/pages/studentCaseStatusPage.ts` | 144 | صفحةُ «حالة طلبي» للطالب |
| `src/server/pages/studentSchedulePage.ts` | 438 | جدولُ الطالب العام |
| `src/server/pages/surveyPages.ts` | 434 | استبيانُ الطلبة وصفحةُ الحالة الفردية |

## ترتيبُ التسجيل في server.ts


## خريطةُ النقل: الطرق

| الطريق | السطر القديم | الملف الجديد |
|---|---:|---|
| `GET /api/demo/config` | 963 | `server.ts` |
| `GET /api/version` | 975 | `server.ts` |
| `GET /api/health` | 980 | `server.ts` |
| `POST /api/auth/demo` | 2607 | `server.ts` |
| `POST /api/demo/role` | 2639 | `server.ts` |
| `GET /i/:username` | 2665 | `server.ts` |
| `POST /api/auth/login` | 2674 | `server.ts` |
| `POST /api/auth/logout` | 2733 | `server.ts` |
| `GET /api/auth/me` | 2780 | `server.ts` |
| `POST /api/auth/heartbeat` | 2797 | `server.ts` |
| `POST /api/demo/reset` | 2819 | `server.ts` |
| `GET /api/demo/teacher-card` | 2844 | `server.ts` |
| `GET /api/demo/seed-status` | 2865 | `server.ts` |
| `POST /api/auth/presence` | 2894 | `server.ts` |
| `GET /api/dashboard` | 2940 | `server.ts` |
| `GET /api/journey` | 3156 | `server.ts` |
| `GET /api/search` | 3204 | `server.ts` |
| `GET /api/colleges` | 3310 | `server.ts` |
| `POST /api/colleges` | 3322 | `server.ts` |
| `PUT /api/colleges/:id` | 3336 | `server.ts` |
| `DELETE /api/colleges/:id` | 3356 | `server.ts` |
| `GET /api/colleges/:id/mobility` | 3372 | `server.ts` |
| `PUT /api/colleges/:id/mobility` | 3391 | `server.ts` |
| `GET /api/sections` | 3403 | `server.ts` |
| `GET /api/schedule-day-window` | 3410 | `server.ts` |
| `GET /api/admin/section-schedule-windows` | 3417 | `server.ts` |
| `PUT /api/admin/section-schedule-windows` | 3424 | `server.ts` |
| `GET /api/admin/teaching-load` | 3447 | `server.ts` |
| `PUT /api/admin/teaching-load` | 3464 | `server.ts` |
| `GET /api/teaching-load/status` | 3473 | `server.ts` |
| `POST /api/sections` | 3491 | `server.ts` |
| `PUT /api/sections/:id` | 3511 | `server.ts` |
| `DELETE /api/sections/:id` | 3536 | `server.ts` |
| `GET /api/terms` | 3554 | `server.ts` |
| `GET /api/terms/scoped` | 3565 | `server.ts` |
| `POST /api/terms` | 3589 | `server.ts` |
| `PUT /api/terms/:id` | 3604 | `server.ts` |
| `DELETE /api/terms/:id` | 3622 | `server.ts` |
| `GET /api/instructors` | 3716 | `server.ts` |
| `POST /api/instructors` | 3838 | `server.ts` |
| `PUT /api/instructors/:id` | 3885 | `server.ts` |
| `DELETE /api/instructors/:id` | 3923 | `server.ts` |
| `GET /api/location-room-types` | 3950 | `server.ts` |
| `GET /api/admin/location-room-types` | 3965 | `server.ts` |
| `POST /api/admin/location-room-types` | 3973 | `server.ts` |
| `PUT /api/admin/location-room-types/:type` | 3985 | `server.ts` |
| `DELETE /api/admin/location-room-types/:type` | 4004 | `server.ts` |
| `GET /api/courses` | 4021 | `server.ts` |
| `GET /api/curriculum/sections/:sectionId` | 4104 | `server.ts` |
| `POST /api/curriculum/plans` | 4111 | `server.ts` |
| `PUT /api/curriculum/plans/:planId` | 4121 | `server.ts` |
| `POST /api/curriculum/plans/:planId/courses` | 4151 | `server.ts` |
| `DELETE /api/curriculum/plans/:planId/courses/:courseId` | 4166 | `server.ts` |
| `POST /api/curriculum/transitions` | 4192 | `server.ts` |
| `DELETE /api/curriculum/transitions/:id` | 4217 | `server.ts` |
| `GET /api/curriculum/plans/:planId/archive-readiness` | 4248 | `server.ts` |
| `POST /api/curriculum/plans/:planId/archive` | 4255 | `server.ts` |
| `POST /api/courses` | 4288 | `server.ts` |
| `PUT /api/courses/:id` | 4353 | `server.ts` |
| `DELETE /api/courses/:id` | 4523 | `server.ts` |
| `GET /api/schedules/events` | 5794 | `server.ts` |
| `GET /api/schedules/pulse` | 5865 | `server.ts` |
| `POST /api/schedules/pulse` | 5888 | `server.ts` |
| `GET /api/schedules/workspace` | 5975 | `server.ts` |
| `GET /api/schedules` | 6156 | `server.ts` |
| `GET /api/hall-barter` | 6215 | `server.ts` |
| `POST /api/hall-barter/requests` | 6222 | `server.ts` |
| `POST /api/hall-barter/requests/:id/respond` | 6243 | `server.ts` |
| `POST /api/hall-barter/requests/:id/cancel` | 6302 | `server.ts` |
| `GET /api/hall-barter/inbox` | 6324 | `server.ts` |
| `POST /api/schedules/import-preflight` | 6355 | `server.ts` |
| `POST /api/schedules/check-conflicts` | 6441 | `server.ts` |
| `GET /api/schedules/review-readiness` | 6470 | `server.ts` |
| `GET /api/schedules/outside-clashes` | 6616 | `server.ts` |
| `POST /api/intelligence/nl-move` | 6673 | `server.ts` |
| `POST /api/intelligence/nl-schedule` | 6813 | `server.ts` |
| `POST /api/schedules/move-batch` | 6891 | `server.ts` |
| `GET /api/schedules/export` | 6996 | `server.ts` |
| `POST /api/schedules/import` | 7085 | `server.ts` |
| `GET /api/visiting-roster` | 7248 | `server.ts` |
| `GET /api/visiting-lookup` | 7291 | `server.ts` |
| `GET /api/reports/visiting-roster` | 7299 | `server.ts` |
| `GET /api/reports/visiting-teaching` | 7318 | `server.ts` |
| `GET /api/instructors/:id/affiliation` | 7338 | `server.ts` |
| `GET /api/instructor-affiliations` | 7370 | `server.ts` |
| `GET /api/delegates` | 7407 | `server.ts` |
| `PUT /api/visiting-roster` | 7423 | `server.ts` |
| `GET /api/department-delegates` | 7437 | `server.ts` |
| `POST /api/department-delegates/instructor` | 7448 | `server.ts` |
| `PUT /api/department-delegates/:instructorId` | 7472 | `server.ts` |
| `DELETE /api/department-delegates/:instructorId` | 7495 | `server.ts` |
| `GET /api/instructors/:id/visiting-state` | 7515 | `server.ts` |
| `POST /api/instructors/:id/visiting-conversion` | 7540 | `server.ts` |
| `POST /api/visiting-roster/instructor` | 7559 | `server.ts` |
| `POST /api/visiting-roster/copy` | 7574 | `server.ts` |
| `GET /api/reports/visiting-history` | 7592 | `server.ts` |
| `GET /api/department-rooms` | 7656 | `server.ts` |
| `POST /api/department-rooms` | 7663 | `server.ts` |
| `GET /api/location-registry` | 7668 | `server.ts` |
| `GET /api/companion-rooms` | 7798 | `server.ts` |
| `GET /api/location-registry/pending` | 7821 | `server.ts` |
| `GET /api/admin/location-registry` | 7837 | `server.ts` |
| `GET /api/admin/location-setup` | 7851 | `server.ts` |
| `POST /api/admin/location-setup/buildings` | 7855 | `server.ts` |
| `PUT /api/admin/location-setup/buildings/:id` | 7871 | `server.ts` |
| `DELETE /api/admin/location-setup/buildings/:id` | 7882 | `server.ts` |
| `POST /api/admin/location-setup/rooms` | 7891 | `server.ts` |
| `DELETE /api/admin/location-setup/rooms/:id` | 7911 | `server.ts` |
| `POST /api/admin/location-registry/buildings` | 7917 | `server.ts` |
| `PUT /api/admin/location-registry/buildings/:id` | 7940 | `server.ts` |
| `POST /api/admin/location-registry/rooms` | 7955 | `server.ts` |
| `PUT /api/admin/location-registry/rooms/:id` | 7971 | `server.ts` |
| `PUT /api/admin/location-registry/review/:id` | 8041 | `server.ts` |
| `GET /api/admin/location-registry/migration/preview` | 8046 | `server.ts` |
| `POST /api/admin/location-registry/migration/apply` | 8049 | `server.ts` |
| `POST /api/admin/location-registry/migration/:id/rollback` | 8072 | `server.ts` |
| `GET /api/schedules/ta-conversion` | 8113 | `server.ts` |
| `POST /api/schedules/ta-conversion` | 8125 | `server.ts` |
| `POST /api/schedules/replace-instructor` | 8174 | `server.ts` |
| `GET /api/schedules/replace-instructor/history` | 8225 | `server.ts` |
| `GET /api/courses/nature` | 8242 | `server.ts` |
| `GET /api/rooms/owner` | 8266 | `server.ts` |
| `POST /api/schedules/suggest-slots` | 8291 | `server.ts` |
| `POST /api/schedules/placeholder-action` | 8478 | `server.ts` |
| `GET /api/schedules/:id/exceptions` | 8610 | `server.ts` |
| `POST /api/schedules/:id/exceptions` | 8617 | `server.ts` |
| `DELETE /api/schedules/:id/exceptions/:exceptionId` | 8682 | `server.ts` |
| `GET /api/schedules/:id/substitutes` | 8700 | `server.ts` |
| `GET /api/schedules/meeting-participants` | 8833 | `server.ts` |
| `POST /api/schedules/meeting-slots` | 8850 | `server.ts` |
| `POST /api/schedules` | 9046 | `server.ts` |
| `PUT /api/schedules/:id` | 9238 | `server.ts` |
| `DELETE /api/schedules/:id` | 9266 | `server.ts` |
| `GET /api/schedules/copy-preview` | 9270 | `server.ts` |
| `POST /api/schedules/apply-proposal` | 9467 | `server.ts` |
| `POST /api/schedules/copy` | 9474 | `server.ts` |
| `GET /api/schedules/wipe-scope` | 9560 | `server.ts` |
| `POST /api/schedules/wipe-scope` | 9574 | `server.ts` |
| `POST /api/schedules/wipe-scope/restore` | 9621 | `server.ts` |
| `POST /api/telemetry/client` | 9659 | `server.ts` |
| `POST /api/guide/intent` | 9870 | `server.ts` |
| `GET /api/intelligence/guide-friction` | 9910 | `server.ts` |
| `GET /api/intelligence/experience-health` | 9950 | `server.ts` |
| `GET /api/intelligence/open-decisions` | 9972 | `server.ts` |
| `POST /api/intelligence/open-decisions` | 9989 | `server.ts` |
| `PATCH /api/intelligence/open-decisions/:id` | 10002 | `server.ts` |
| `GET /api/intelligence/operations-review` | 10015 | `server.ts` |
| `POST /api/intelligence/policy-simulate` | 10027 | `server.ts` |
| `GET /api/intelligence/overview` | 10048 | `server.ts` |
| `GET /api/intelligence/spatial-burnout` | 10094 | `server.ts` |
| `POST /api/intelligence/conflict-solutions` | 10101 | `server.ts` |
| `POST /api/intelligence/ripple/:id` | 10111 | `server.ts` |
| `GET /api/intelligence/lookups` | 10131 | `server.ts` |
| `GET /api/intelligence/genome` | 10148 | `server.ts` |
| `GET /api/intelligence/constraints` | 10158 | `server.ts` |
| `POST /api/intelligence/constraints` | 10163 | `server.ts` |
| `PUT /api/intelligence/constraints/:id` | 10186 | `server.ts` |
| `DELETE /api/intelligence/constraints/:id` | 10192 | `server.ts` |
| `POST /api/intelligence/war-room` | 10210 | `server.ts` |
| `POST /api/intelligence/autopilot` | 10226 | `server.ts` |
| `POST /api/intelligence/evaluate` | 10232 | `server.ts` |
| `POST /api/intelligence/auto-schedule` | 10243 | `server.ts` |
| `POST /api/intelligence/copilot` | 10260 | `server.ts` |
| `GET /api/intelligence/context/:id` | 10438 | `server.ts` |
| `GET /api/intelligence/replay/:id` | 10498 | `server.ts` |
| `GET /api/intelligence/room` | 10531 | `server.ts` |
| `GET /api/intelligence/professor/:id` | 10555 | `server.ts` |
| `GET /api/intelligence/comments/:scheduleId` | 10559 | `server.ts` |
| `POST /api/intelligence/comments/:scheduleId` | 10562 | `server.ts` |
| `PUT /api/intelligence/comments/:scheduleId/:commentId` | 10565 | `server.ts` |
| `GET /api/intelligence/drafts` | 10577 | `server.ts` |
| `POST /api/intelligence/smart-import` | 10581 | `server.ts` |
| `POST /api/intelligence/pdf-import/bootstrap-section` | 10762 | `server.ts` |
| `POST /api/intelligence/pdf-import` | 10831 | `server.ts` |
| `POST /api/intelligence/drafts` | 11582 | `server.ts` |
| `GET /api/intelligence/drafts/:id/import-report` | 11695 | `server.ts` |
| `GET /api/approvals` | 12214 | `server.ts` |
| `GET /api/approvals/term` | 12268 | `server.ts` |
| `POST /api/approvals/sign` | 12329 | `server.ts` |
| `POST /api/approvals/withdraw` | 12408 | `server.ts` |
| `POST /api/approvals/head-return` | 12439 | `server.ts` |
| `POST /api/approvals/acknowledge-additions` | 12464 | `server.ts` |
| `POST /api/approvals/submit` | 12534 | `server.ts` |
| `POST /api/approvals/return` | 12557 | `server.ts` |
| `POST /api/approvals/accept` | 12595 | `server.ts` |
| `POST /api/approvals/deadline` | 12640 | `server.ts` |
| `POST /api/approvals/student-phases` | 12665 | `server.ts` |
| `POST /api/approvals/extension` | 12701 | `server.ts` |
| `POST /api/approvals/extensions` | 12740 | `server.ts` |
| `POST /api/approvals/extension-request` | 12812 | `server.ts` |
| `GET /api/schedule-notes` | 12989 | `server.ts` |
| `POST /api/schedule-notes` | 13009 | `server.ts` |
| `POST /api/schedule-notes/:id/rebut` | 13078 | `server.ts` |
| `POST /api/schedule-notes/:id/verdict` | 13104 | `server.ts` |
| `DELETE /api/schedule-notes/:id` | 13138 | `server.ts` |
| `GET /api/notifications` | 13354 | `server.ts` |
| `POST /api/notifications/seen` | 13430 | `server.ts` |
| `GET /api/approvals/badge` | 13475 | `server.ts` |
| `GET /api/approvals/inbox` | 13487 | `server.ts` |
| `GET /api/reports/schedule-changes` | 13626 | `server.ts` |
| `GET /api/reports/authority-pdf-diff` | 13909 | `server.ts` |
| `PUT /api/intelligence/drafts/:id` | 13939 | `server.ts` |
| `PATCH /api/intelligence/drafts/:id/rows/:rowId` | 13942 | `server.ts` |
| `DELETE /api/intelligence/drafts/:id/rows/:rowId` | 13971 | `server.ts` |
| `DELETE /api/intelligence/drafts/:id/rows` | 13990 | `server.ts` |
| `POST /api/intelligence/drafts/:id/publish` | 13999 | `server.ts` |
| `GET /api/intelligence/versions` | 14246 | `server.ts` |
| `GET /api/intelligence/versions/compare` | 14249 | `server.ts` |
| `POST /api/intelligence/versions/:id/restore` | 14252 | `server.ts` |
| `GET /api/intelligence/compare-terms` | 14256 | `server.ts` |
| `POST /api/intelligence/import-preview` | 14301 | `server.ts` |
| `GET /api/intelligence/living` | 14355 | `server.ts` |
| `POST /api/intelligence/why` | 14414 | `server.ts` |
| `POST /api/intelligence/why-not` | 14427 | `server.ts` |
| `GET /api/intelligence/decision-memory` | 14441 | `server.ts` |
| `POST /api/intelligence/decision-memory` | 14447 | `server.ts` |
| `POST /api/intelligence/context-copilot` | 14455 | `server.ts` |
| `POST /api/intelligence/emergency` | 14473 | `server.ts` |
| `GET /api/intelligence/department-start-rhythm` | 14508 | `server.ts` |
| `GET /api/intelligence/settled-drift` | 14532 | `server.ts` |
| `GET /api/intelligence/rollover` | 14651 | `server.ts` |
| `POST /api/intelligence/genesis` | 14715 | `server.ts` |
| `GET /api/intelligence/brief` | 14779 | `server.ts` |
| `POST /api/intelligence/meeting-minutes` | 14783 | `server.ts` |
| `GET /api/intelligence/safety-net` | 14787 | `server.ts` |
| `POST /api/intelligence/safety-net/:id/undo` | 14791 | `server.ts` |
| `GET /api/system-backup/status` | 14805 | `server.ts` |
| `POST /api/system-backup/export-jobs` | 14830 | `server.ts` |
| `DELETE /api/system-backup/export-jobs` | 14836 | `server.ts` |
| `GET /api/system-backup/export-jobs/:id` | 14841 | `server.ts` |
| `POST /api/system-backup/export-jobs/:id/step` | 14845 | `server.ts` |
| `GET /api/system-backup/export-jobs/:id/download` | 14850 | `server.ts` |
| `GET /api/system-backup/export` | 14864 | `server.ts` |
| `POST /api/system-backup/preview` | 14868 | `server.ts` |
| `POST /api/system-backup/import-jobs` | 14891 | `server.ts` |
| `GET /api/system-backup/import-jobs/:id` | 14901 | `server.ts` |
| `POST /api/system-backup/import-jobs/:id/step` | 14905 | `server.ts` |
| `POST /api/system-backup/import` | 14910 | `server.ts` |
| `POST /api/system-backup/reset` | 14914 | `server.ts` |
| `POST /api/system-backup/undo` | 14927 | `server.ts` |
| `GET /api/audit-logs` | 14941 | `server.ts` |
| `GET /api/admin-user-options` | 14946 | `server.ts` |
| `GET /api/admin-instructor-options` | 14952 | `server.ts` |
| `GET /api/roles` | 15030 | `server.ts` |
| `GET /api/users` | 15037 | `server.ts` |
| `POST /api/users` | 15060 | `server.ts` |
| `POST /api/users/grant-decision-centre` | 15152 | `server.ts` |
| `GET /api/users/department-heads/preview` | 15189 | `server.ts` |
| `POST /api/users/department-heads` | 15193 | `server.ts` |
| `GET /api/users/advisors/preview` | 15218 | `server.ts` |
| `POST /api/users/advisors` | 15222 | `server.ts` |
| `POST /api/users/advisors/consolidate` | 15253 | `server.ts` |
| `PUT /api/users/:id` | 15295 | `server.ts` |
| `DELETE /api/users/:id` | 15405 | `server.ts` |
| `GET /api/permissions/forms` | 15413 | `server.ts` |
| `GET /api/permissions` | 15417 | `server.ts` |
| `POST /api/permissions` | 15421 | `server.ts` |
| `PUT /api/permissions/:id` | 15430 | `server.ts` |
| `DELETE /api/permissions/:id` | 15437 | `server.ts` |
| `GET /api/user-scopes` | 15449 | `server.ts` |
| `POST /api/user-scopes` | 15453 | `server.ts` |
| `PUT /api/user-scopes/:id` | 15462 | `server.ts` |
| `DELETE /api/user-scopes/:id` | 15471 | `server.ts` |
| `GET /api/reports/excel/:type` | 15482 | `server.ts` |
| `GET /api/search/natural` | 15606 | `server.ts` |
| `GET /api/reports/department-balance` | 15768 | `server.ts` |
| `GET /api/reports/room-load` | 15850 | `server.ts` |
| `GET /api/share` | 16396 | `server.ts` |
| `POST /api/share` | 16424 | `server.ts` |
| `DELETE /api/share/:id` | 16497 | `server.ts` |
| `GET /api/share/:id/faculty` | 16566 | `server.ts` |
| `POST /api/share/:id/personal` | 16586 | `server.ts` |
| `POST /api/share/:id/sent` | 16627 | `server.ts` |
| `GET /api/share-personal` | 16639 | `server.ts` |
| `GET /api/registration-stats` | 16674 | `server.ts` |
| `POST /api/section-build/preview` | 16879 | `server.ts` |
| `POST /api/section-build/apply` | 16897 | `server.ts` |
| `POST /api/section-build/review-rows` | 16953 | `server.ts` |
| `POST /api/section-build/undo` | 16993 | `server.ts` |
| `GET /api/forecast/term` | 17019 | `server.ts` |
| `PUT /api/registration-stats` | 17041 | `server.ts` |
| `POST /api/registration-stats/remaining-pdf` | 17108 | `server.ts` |
| `POST /api/registration-stats/remaining-cells` | 17160 | `server.ts` |
| `GET /api/public/schedule/:token` | 17183 | `server.ts` |
| `GET /api/public/ics/:token` | 17254 | `server.ts` |
| `GET /api/public/ics/:token/:key` | 17300 | `server.ts` |
| `GET /api/public/cal/:token/:key` | 17321 | `server.ts` |
| `GET /api/public/ics-reminder` | 17339 | `server.ts` |
| `POST /api/public/staff/:token/note` | 17437 | `server.ts` |
| `GET /api/degree-rules` | 17787 | `server.ts` |
| `PUT /api/degree-rules/:sectionId` | 17809 | `server.ts` |
| `GET /api/public/survey/:token` | 17850 | `server.ts` |
| `POST /api/public/survey/:token/identity-status` | 17910 | `server.ts` |
| `POST /api/public/survey/:token/proof-status` | 17958 | `server.ts` |
| `POST /api/public/survey/:token/proof` | 18083 | `server.ts` |
| `POST /api/public/survey/:token` | 18123 | `server.ts` |
| `GET /api/schedules/section-gap/decisions` | 18330 | `server.ts` |
| `PUT /api/schedules/section-gap/decisions` | 18336 | `server.ts` |
| `GET /api/schedules/section-gap` | 18359 | `server.ts` |
| `GET /api/schedules/section-gap/staffing` | 18373 | `server.ts` |
| `GET /api/schedules/openings-preview` | 18432 | `server.ts` |
| `GET /api/schedules/academic-advice` | 18458 | `server.ts` |
| `GET /api/schedules/demand` | 18471 | `server.ts` |
| `GET /api/student-registration` | 18767 | `server.ts` |
| `POST /api/student-registration/:id/course-state` | 18921 | `server.ts` |
| `POST /api/student-registration/:id/case-state` | 19110 | `server.ts` |
| `GET /api/schedules/staff-inbox` | 19167 | `server.ts` |
| `POST /api/public/staff/:token` | 19198 | `server.ts` |
| `POST /api/instructor-requests/issue` | 21221 | `server.ts` |
| `GET /api/instructor-requests/exceptions` | 21433 | `server.ts` |
| `POST /api/instructor-requests/exception/revoke` | 21456 | `server.ts` |
| `GET /api/instructor-requests` | 21482 | `server.ts` |
| `POST /api/instructor-requests/:id/decide` | 21632 | `server.ts` |
| `POST /api/instructor-requests/:id/apply` | 21808 | `server.ts` |
| `POST /api/instructor-requests/:id/reply` | 22086 | `server.ts` |
| `GET /api/public/request/:token` | 22130 | `server.ts` |
| `POST /api/public/request/:token` | 22272 | `server.ts` |
| `POST /api/public/request/:token/reply` | 22442 | `server.ts` |
| `POST /api/public/request/:token/reply-batch` | 22536 | `server.ts` |
| `POST /api/public/request/:token/check` | 23610 | `server.ts` |
| `GET /api/public/request/:token/academic-advice` | 23695 | `server.ts` |
| `POST /api/public/request/:token/check-batch` | 23729 | `server.ts` |
| `GET /api/public/request/:token/previous` | 23781 | `server.ts` |
| `GET /api/public/request/:token/events` | 23845 | `server.ts` |
| `POST /api/public/request/:token/check-times` | 23890 | `server.ts` |
| `POST /api/public/request/:token/hold` | 23956 | `server.ts` |
| `GET /api/public/request/:token/movement` | 23991 | `server.ts` |
| `GET /r/:token` | 24049 | `server.ts` |
| `POST /api/public/request/:token/interest` | 24104 | `server.ts` |
| `POST /api/public/request/:token/stick` | 24124 | `server.ts` |
| `GET /api/course-offering` | 24189 | `server.ts` |
| `PUT /api/course-offering` | 24220 | `server.ts` |
| `GET /api/ta-phase` | 24285 | `server.ts` |
| `POST /api/ta-phase/allowed` | 24323 | `server.ts` |
| `POST /api/ta-phase/open` | 24340 | `server.ts` |
| `POST /api/ta-phase/close` | 24364 | `server.ts` |
| `GET /api/advisor-seats` | 24401 | `server.ts` |
| `PUT /api/advisor-seats/config` | 24417 | `server.ts` |
| `POST /api/advisor-seats/add` | 24427 | `server.ts` |
| `POST /api/advisor-seats/exception` | 24450 | `server.ts` |
| `GET /r/:token/proposal/:pid` | 24464 | `server.ts` |
| `GET /verify ، /verify/:code` | 24490 | `server.ts` |
| `POST /api/public/verify` | 24495 | `server.ts` |
| `POST /api/public/survey/:token/my-case` | 24600 | `server.ts` |
| `GET /m/:token` | 24829 | `server.ts` |
| `GET /q/:token` | 24842 | `server.ts` |
| `GET /me ، /me/` | 25007 | `server.ts` |
| `GET /api/public/students/:token` | 25452 | `server.ts` |
| `GET /t/:token` | 25467 | `server.ts` |
| `GET /s/:token` | 25481 | `server.ts` |

## خريطةُ النقل: التعريفات والجمل

| الاسم | النوع | السطر القديم | الملف الجديد |
|---|---|---:|---|
| `configureRuntimeEnvironment();` | جملة | 234 | `src/server/core/boot.ts` |
| `app` | const | 236 | `server.ts` |
| `app.set("trust proxy", 1);` | app | 245 | `server.ts` |
| `PORT` | const | 248 | `server.ts` |
| `arabicUiCollator` | const | 255 | `server.ts` |
| `foldHeaderIdentity` | const | 256 | `server.ts` |
| `isSpecialEducationIdentity` | const | 261 | `server.ts` |
| `academicSectionNameMatches` | const | 273 | `server.ts` |
| `sortArabicNamed` | const | 285 | `server.ts` |
| `verifiedRoomKey` | const | 287 | `server.ts` |
| `verifiedBuildingKey` | const | 291 | `server.ts` |
| `termChronologyServer` | const | 295 | `server.ts` |
| `sortTermsNewestServer` | const | 301 | `server.ts` |
| `dataContextCacheKey` | const | 315 | `server.ts` |
| `locationRegistryCache` | const | 317 | `server.ts` |
| `readLocationRegistry` | function | 318 | `server.ts` |
| `invalidateLocationRegistry` | function | 332 | `server.ts` |
| `provisionBranchSiteLocationsFromAuthority` | function | 352 | `server.ts` |
| `confirmedDepartmentRoomIds` | const | 423 | `server.ts` |
| `DepartmentRoomReference` | type | 424 | `server.ts` |
| `canonicalizeLocationForWrite` | function | 426 | `server.ts` |
| `canonicalizeHistoricalLocationForRuntime` | function | 465 | `server.ts` |
| `asyncSafe` | const | 492 | `server.ts` |
| `for (const verb of ["get", "post", "put", "patch", "delete", "all", "u` | جملة | 506 | `server.ts` |
| `process.on("unhandledRejection", (reason) => {` | جملة | 512 | `server.ts` |
| `process.on("uncaughtException", (error) => {` | جملة | 515 | `server.ts` |
| `app.disable("x-powered-by");` | app | 519 | `server.ts` |
| `app.use((req, res, next) => {` | app | 520 | `server.ts` |
| `app.use(compression({` | app | 561 | `server.ts` |
| `app.use(["/api/system-backup/preview", "/api/system-backup/import", "/` | app | 575 | `server.ts` |
| `   كبيراً قبل أن يصل إلى المسار. safeDraftRows يقصّ كل حقل ويحدّ الصفو` | app | 582 | `server.ts` |
| `app.use(express.json({ limit: "1mb" }));` | app | 583 | `server.ts` |
| `app.use((req, res, next) => {` | app | 587 | `server.ts` |
| `getCookies` | function | 613 | `server.ts` |
| `loginAttempts` | const | 628 | `server.ts` |
| `rateLimitLogin` | function | 629 | `server.ts` |
| `rateLimitHeavyReport` | const | 662 | `server.ts` |
| `requestTokenKey` | const | 676 | `server.ts` |
| `REQUEST_IP_CEILING` | const | 680 | `server.ts` |
| `REQUEST_TOKEN_CEILING` | const | 681 | `server.ts` |
| `rateLimitPublicRequest` | const | 684 | `server.ts` |
| `rateLimitCardEvents` | const | 694 | `server.ts` |
| `rateLimitDocumentRead` | const | 705 | `server.ts` |
| `rateLimitDemoRole` | const | 713 | `server.ts` |
| `readRateLimitEnv` | function | 739 | `server.ts` |
| `PUBLIC_RATE_LIMIT_MAX` | const | 746 | `server.ts` |
| `PUBLIC_RATE_LIMIT_WINDOW_MS` | const | 747 | `server.ts` |
| `publicRequestWindows` | const | 748 | `server.ts` |
| `publicRateLimitSweptAt` | let | 749 | `server.ts` |
| `rateLimitPublic` | function | 751 | `server.ts` |
| `app.use("/api/public", rateLimitPublic);` | app | 784 | `server.ts` |
| `requestLinkLimit` | const | 785 | `server.ts` |
| `app.use("/api/public/request/:token", requestLinkLimit);` | app | 791 | `server.ts` |
| `app.use(adInjection());` | app | 793 | `server.ts` |
| `SERVER_IDLE_SESSION_MS` | const | 795 | `server.ts` |
| `DEMO_SESSION_TTL_MS` | const | 796 | `server.ts` |
| `AuthenticatedRequest` | interface | 799 | `server.ts` |
| `AUTH_CACHE_MS` | const | 825 | `server.ts` |
| `authCache` | const | 826 | `server.ts` |
| `SESSION_TOUCH_EVERY_MS` | const | 847 | `server.ts` |
| `sessionTouchedAt` | const | 848 | `server.ts` |
| `touchSession` | function | 850 | `server.ts` |
| `forgetAuthSession` | function | 867 | `server.ts` |
| `Repository.onIdentityChanged?.(() => authCache.clear());` | جملة | 871 | `server.ts` |
| `authMiddleware` | function | 873 | `server.ts` |
| `databaseDown` | let | 938 | `server.ts` |
| `databaseDownRef` | let | 949 | `server.ts` |
| `app.use("/api", (req, res, next) => {` | app | 988 | `server.ts` |
| `bindPublicLinkContext` | function | 1005 | `server.ts` |
| `app.use(PUBLIC_LINK_PAGE_PREFIXES.map(prefix => `${prefix}:token`), bi` | app | 1012 | `server.ts` |
| `app.use("/api", (req: Request, res: Response, next: NextFunction) => {` | app | 1016 | `server.ts` |
| `app.use("/api", authMiddleware as express.RequestHandler);` | app | 1031 | `server.ts` |
| `DEMO_READ_ONLY_PREFIXES` | const | 1035 | `server.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1036 | `server.ts` |
| `   حارس الأدوار: نقطة واحدة، لا مئة` | app | 1066 | `server.ts` |
| `ApiPerformanceSample` | type | 1078 | `server.ts` |
| `apiPerformanceSamples` | const | 1079 | `server.ts` |
| `API_PERFORMANCE_LIMIT` | const | 1080 | `server.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1081 | `server.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1101 | `server.ts` |
| `DEMO_SESSION_GONE` | const | 1186 | `server.ts` |
| `signInRequiredMessage` | function | 1187 | `server.ts` |
| `requireAuth` | function | 1192 | `server.ts` |
| `powerOnlyFormIds` | const | 1202 | `server.ts` |
| `DECISION_CENTRE_FORM_ID` | const | 1205 | `server.ts` |
| `isPowerUser` | function | 1206 | `server.ts` |
| `requirePowerAdmin` | function | 1209 | `server.ts` |
| `ROOT_ADMIN_USER_ID` | const | 1215 | `server.ts` |
| `requireRootAdmin` | function | 1216 | `server.ts` |
| `SYSTEM_BACKUP_MAX_BYTES` | const | 1225 | `server.ts` |
| `gunzipBounded` | function | 1240 | `server.ts` |
| `readSystemBackupBody` | function | 1264 | `server.ts` |
| `limitConcurrency` | function | 1290 | `server.ts` |
| `documentReadingGate` | const | 1315 | `server.ts` |
| `requirePermission` | function | 1318 | `server.ts` |
| `requireAnyPermission` | function | 1343 | `server.ts` |
| `isScopeAllowed` | function | 1363 | `server.ts` |
| `filterByScope` | function | 1419 | `server.ts` |
| `legacyFDetail` | function | 1448 | `server.ts` |
| `safeSystemUser` | function | 1458 | `server.ts` |
| `captureScopeVersion` | function | 1477 | `server.ts` |
| `recordVersionAfter` | function | 1489 | `server.ts` |
| `confirmTokens` | function | 1502 | `server.ts` |
| `scopeOverwriteRefusal` | function | 1512 | `server.ts` |
| `replacementAction` | function | 1533 | `server.ts` |
| `safeImportEvidence` | function | 1542 | `server.ts` |
| `PdfImportReceipt` | type | 1563 | `server.ts` |
| `signPdfImportReceipt` | function | 1564 | `server.ts` |
| `verifyPdfImportReceipt` | function | 1570 | `server.ts` |
| `DRAFT_DOCUMENT_MAX_BYTES` | const | 1584 | `server.ts` |
| `safeDraftRows` | function | 1586 | `server.ts` |
| `AUTHORITY_PDF_COMPARE_FIELDS` | const | 1632 | `server.ts` |
| `authorityCourseCodeMap` | function | 1642 | `server.ts` |
| `buildAuthorityPdfDiff` | function | 1647 | `server.ts` |
| `inferAuthorityBranchCode` | function | 1847 | `server.ts` |
| `branchOwnScopes` | function | 1860 | `server.ts` |
| `placeholderInstructorIds` | function | 1881 | `server.ts` |
| `approvalBlockerOptions` | function | 1890 | `server.ts` |
| `blockingImportConflicts` | function | 1898 | `server.ts` |
| `collegeFallbackInstructorIds` | function | 1920 | `server.ts` |
| `visitingToFacultyPlan` | function | 1939 | `server.ts` |
| `departmentInstructorIdSet` | function | 1957 | `server.ts` |
| `validateSmartRows` | function | 1986 | `server.ts` |
| `mapSmartIssuesToRows` | function | 2097 | `server.ts` |
| `smartContextFrom` | function | 2119 | `server.ts` |
| `resolveSmartContext` | function | 2140 | `server.ts` |
| `breathe` | const | 2176 | `server.ts` |
| `intelligenceReadScopes` | function | 2179 | `server.ts` |
| `scopedScheduleUniverse` | function | 2186 | `server.ts` |
| `clientScopeDetails` | function | 2197 | `server.ts` |
| `demoSessionPayload` | function | 2266 | `server.ts` |
| `readDemoIdentity` | function | 2278 | `server.ts` |
| `DEMO_STORY_SCOPE` | const | 2302 | `server.ts` |
| `demoSeedJobs` | const | 2303 | `server.ts` |
| `demoSeedStatus` | const | 2304 | `server.ts` |
| `scheduleDemoExtras` | function | 2310 | `server.ts` |
| `seedDemoTeacherCourses` | function | 2337 | `server.ts` |
| `seedDemoAvailableCourses` | function | 2378 | `server.ts` |
| `seedDemoStories` | function | 2434 | `server.ts` |
| `roleDescriptor` | function | 2753 | `server.ts` |
| `demoTeacherRequest` | function | 2837 | `server.ts` |
| `PRESENCE_DAYS` | const | 2887 | `server.ts` |
| `cleanMarkPart` | const | 2888 | `server.ts` |
| `TEXT_LIMIT` | const | 3264 | `server.ts` |
| `cleanText` | function | 3268 | `server.ts` |
| `boundedInt` | function | 3277 | `server.ts` |
| `boundedDecimal` | function | 3286 | `server.ts` |
| `COURSE_LIMIT` | const | 3298 | `server.ts` |
| `courseNumberIssue` | function | 3301 | `server.ts` |
| `collegeMobilityHistoryCache` | const | 3371 | `server.ts` |
| `teachingLoadHoursForTerm` | function | 3441 | `server.ts` |
| `scopedTermsCache` | const | 3564 | `server.ts` |
| `instructorsForReader` | function | 3655 | `server.ts` |
| `instructorCircleCache` | const | 3673 | `server.ts` |
| `instructorCircleFor` | function | 3674 | `server.ts` |
| `maskCivilTail` | function | 3701 | `server.ts` |
| `instructorsForScope` | function | 3707 | `server.ts` |
| `courseNameCollator` | const | 3937 | `server.ts` |
| `sortCoursesByName` | const | 3938 | `server.ts` |
| `curriculumOverview` | function | 4084 | `server.ts` |
| `curriculumArchiveReadiness` | function | 4224 | `server.ts` |
| `committeeCatalogEditAllowed` | function | 4273 | `server.ts` |
| `refuseCommitteeCatalogEdit` | function | 4284 | `server.ts` |
| `SCHEDULE_DAY_KEYS` | const | 4549 | `server.ts` |
| `scheduleOverlap` | const | 4566 | `server.ts` |
| `sectionScheduleWindowCache` | const | 4568 | `server.ts` |
| `sectionScheduleWindow` | function | 4569 | `server.ts` |
| `mixedPatternNotice` | function | 4579 | `server.ts` |
| `scheduleLengthIssue` | function | 4590 | `server.ts` |
| `scheduleLengthNotice` | function | 4609 | `server.ts` |
| `schedulePayloadIssues` | function | 4616 | `server.ts` |
| `roomOwnership` | function | 4632 | `server.ts` |
| `roomScopeNotice` | function | 4661 | `server.ts` |
| `HALL_BARTER_MIN_WINDOW_MINUTES` | const | 4678 | `server.ts` |
| `HALL_BARTER_MAX_OPPORTUNITIES` | const | 4679 | `server.ts` |
| `HALL_BARTER_DAY_LABEL` | const | 4680 | `server.ts` |
| `HALL_BARTER_STALE_DAYS` | const | 4683 | `server.ts` |
| `HALL_BARTER_STALE_REASON` | const | 4684 | `server.ts` |
| `sweepStaleHallBarter` | function | 4686 | `server.ts` |
| `HallCampusGender` | type | 4698 | `server.ts` |
| `hallCampusGender` | function | 4699 | `server.ts` |
| `sameHallCampusGender` | function | 4709 | `server.ts` |
| `hallBarterSerial` | let | 4716 | `server.ts` |
| `hallBarterBoardCache` | const | 4717 | `server.ts` |
| `academicStartYear` | function | 4719 | `server.ts` |
| `recentTenYearTermIds` | function | 4723 | `server.ts` |
| `rowOccupiesWindow` | function | 4732 | `server.ts` |
| `barterRequestRoomKey` | function | 4752 | `server.ts` |
| `barterRequestMatchesRow` | function | 4755 | `server.ts` |
| `barterRequestOverlaps` | function | 4756 | `server.ts` |
| `hallBarterAllowsRoomUse` | function | 4761 | `server.ts` |
| `hallBarterRequestShape` | function | 4770 | `server.ts` |
| `buildHallBarterBoard` | function | 4788 | `server.ts` |
| `normalizedBuilding` | function | 5021 | `server.ts` |
| `travelPairKey` | function | 5022 | `server.ts` |
| `travelMinutesFor` | function | 5023 | `server.ts` |
| `rowsOverlapOnDay` | function | 5033 | `server.ts` |
| `spatialBurnoutAnalysis` | function | 5034 | `server.ts` |
| `roomIsFreeForRow` | function | 5060 | `server.ts` |
| `roomCastlingProposals` | function | 5068 | `server.ts` |
| `CAMPUS_LABEL` | const | 5099 | `server.ts` |
| `interCampusWarnings` | function | 5109 | `server.ts` |
| `describeScheduleChange` | function | 5153 | `server.ts` |
| `DepartmentStyle` | interface | 5186 | `server.ts` |
| `NO_COHORT` | const | 5194 | `server.ts` |
| `rhythmCache` | const | 5195 | `server.ts` |
| `rhythmRefreshing` | const | 5196 | `server.ts` |
| `RHYTHM_STALE_MS` | const | 5202 | `server.ts` |
| `styleOf` | const | 5203 | `server.ts` |
| `departmentStyle` | function | 5205 | `server.ts` |
| `readDepartmentStyle` | function | 5222 | `server.ts` |
| `scheduleConflicts` | function | 5280 | `server.ts` |
| `applyRequestHoldOverride` | function | 5502 | `server.ts` |
| `noteRequestHoldOverride` | function | 5520 | `server.ts` |
| `requestHoldRefusal` | function | 5539 | `server.ts` |
| `PresenceMark` | interface | 5577 | `server.ts` |
| `ScheduleEventClient` | interface | 5586 | `server.ts` |
| `scheduleEventClients` | const | 5603 | `server.ts` |
| `scheduleEventTimer` | let | 5604 | `server.ts` |
| `scheduleEventSerial` | let | 5605 | `server.ts` |
| `scheduleChangeClock` | const | 5608 | `server.ts` |
| `notifyClock` | const | 5609 | `server.ts` |
| `broadcastScheduleChange` | function | 5611 | `server.ts` |
| `broadcastNotify` | function | 5631 | `server.ts` |
| `for (const prefix of ["/api/approvals", "/api/schedule-notes", "/api/i` | جملة | 5640 | `server.ts` |
| `broadcastStudentNotifySoon` | const | 5651 | `server.ts` |
| `app.use("/api/student-registration", (req: Request, res: Response, nex` | app | 5652 | `server.ts` |
| `PRESENCE_STALE_MS` | const | 5666 | `server.ts` |
| `PRESENCE_GONE_MS` | const | 5667 | `server.ts` |
| `presenceDirty` | const | 5668 | `server.ts` |
| `presenceFlushTimer` | let | 5669 | `server.ts` |
| `emptyMark` | const | 5671 | `server.ts` |
| `boardScopeKey` | const | 5672 | `server.ts` |
| `hasMark` | const | 5673 | `server.ts` |
| `presenceRoster` | function | 5683 | `server.ts` |
| `broadcastPresence` | function | 5703 | `server.ts` |
| `markPresenceDirty` | function | 5716 | `server.ts` |
| `setInterval(() => {` | جملة | 5734 | `server.ts` |
| `pendingScheduleSessions` | const | 5752 | `server.ts` |
| `onSchedulesInvalidated(() => {` | جملة | 5753 | `server.ts` |
| `stopScheduleBeacon` | let | 5777 | `server.ts` |
| `listenForScheduleChangesAcrossInstances` | function | 5778 | `server.ts` |
| `pulseClients` | const | 5864 | `server.ts` |
| `readLiveVisitingRoster` | function | 5908 | `server.ts` |
| `readVisitingStatus` | function | 5928 | `server.ts` |
| `visitingChecker` | function | 5949 | `server.ts` |
| `readsFinalSchedulesOnly` | function | 6049 | `server.ts` |
| `termEndedForReading` | function | 6057 | `server.ts` |
| `finalRowsWithFinality` | function | 6062 | `server.ts` |
| `finalRowsOnly` | function | 6083 | `server.ts` |
| `readSchedulesForRequest` | function | 6091 | `server.ts` |
| `scopeSectionIdsFor` | function | 6107 | `server.ts` |
| `readScopedTermRows` | function | 6112 | `server.ts` |
| `readLiveSchedulesForRequest` | function | 6134 | `server.ts` |
| `checkLengthIssue` | function | 6410 | `server.ts` |
| `checkLocationIssues` | function | 6422 | `server.ts` |
| `previewNaturalLanguageMove` | function | 6717 | `server.ts` |
| `executeGeminiScheduleCalls` | function | 6772 | `server.ts` |
| `dropStaleHallIdentity` | function | 6858 | `server.ts` |
| `movedRowsCollisions` | function | 6870 | `server.ts` |
| `hallTextChangedWithoutIdentity` | function | 6883 | `server.ts` |
| `wholeCollegeSectionIds` | function | 7259 | `server.ts` |
| `visitingLookupFor` | function | 7278 | `server.ts` |
| `locationIdList` | const | 7829 | `server.ts` |
| `locationAliases` | const | 7830 | `server.ts` |
| `officialBuildingCollegeIds` | const | 7831 | `server.ts` |
| `taConversionState` | function | 8083 | `server.ts` |
| `WEEK_EXCEPTION_DATE` | const | 8593 | `server.ts` |
| `weekExceptionDayKey` | function | 8595 | `server.ts` |
| `readScheduleForException` | function | 8602 | `server.ts` |
| `meetingExcludedIds` | function | 8800 | `server.ts` |
| `requireMeetingAccess` | const | 8814 | `server.ts` |
| `meetingDepartmentPeople` | function | 8821 | `server.ts` |
| `SCHEDULE_ORIGIN_KINDS` | const | 8888 | `server.ts` |
| `scheduleOriginOf` | function | 8889 | `server.ts` |
| `companionBookingFor` | function | 8904 | `server.ts` |
| `createScheduleHandler` | const | 8922 | `server.ts` |
| `updateScheduleHandler` | const | 9048 | `server.ts` |
| `deleteScheduleHandler` | const | 9240 | `server.ts` |
| `InnerScheduleResult` | interface | 9297 | `server.ts` |
| `runScheduleHandler` | function | 9299 | `server.ts` |
| `PROPOSAL_ORIGIN_LABEL` | const | 9325 | `server.ts` |
| `PROPOSAL_DAYS` | const | 9328 | `server.ts` |
| `dayFlagsOf` | const | 9329 | `server.ts` |
| `dayOfRow` | const | 9330 | `server.ts` |
| `dayLabelOf` | const | 9331 | `server.ts` |
| `editBodyFor` | function | 9334 | `server.ts` |
| `ProposalOutcome` | interface | 9348 | `server.ts` |
| `applyProposalCore` | function | 9350 | `server.ts` |
| `wipeScopeState` | function | 9529 | `server.ts` |
| `wipeScopeOf` | const | 9558 | `server.ts` |
| `GuideIntentPayload` | type | 9688 | `server.ts` |
| `deterministicGuideIntent` | function | 9699 | `server.ts` |
| `serverCanExposeGuideFeature` | function | 9719 | `server.ts` |
| `requestGuideAIIntent` | function | 9730 | `server.ts` |
| `GeminiPart` | type | 9785 | `server.ts` |
| `geminiOutputText` | function | 9787 | `server.ts` |
| `geminiFunctionCalls` | function | 9795 | `server.ts` |
| `requestGeminiScheduleLayer` | function | 9803 | `server.ts` |
| `emptyScopeGuidance` | function | 10202 | `server.ts` |
| `authorityBaselineForScope` | function | 11654 | `server.ts` |
| `authorityDraftForScope` | function | 11671 | `server.ts` |
| `scheduleLockRefusal` | function | 11744 | `server.ts` |
| `registrarNotesInRound` | function | 11788 | `server.ts` |
| `termIsClosed` | function | 11795 | `server.ts` |
| `approvalTransaction` | function | 11813 | `server.ts` |
| `approvalScopeLabel` | function | 11838 | `server.ts` |
| `withEvent` | function | 11850 | `server.ts` |
| `noteScheduleMutation` | function | 11865 | `server.ts` |
| `ApprovalEventWriter` | type | 11914 | `server.ts` |
| `amendmentAfterEdit` | function | 11915 | `server.ts` |
| `settleAmendmentMarker` | function | 11935 | `server.ts` |
| `settlePendingAmendmentInLock` | function | 11944 | `server.ts` |
| `settlePendingAmendment` | function | 11954 | `server.ts` |
| `applyScheduleMutation` | function | 11962 | `server.ts` |
| `wholesaleRefusal` | function | 12024 | `server.ts` |
| `countBlockingConflicts` | function | 12040 | `server.ts` |
| `blockingConflictCount` | function | 12046 | `server.ts` |
| `blockingSummaryFor` | function | 12056 | `server.ts` |
| `regulationNoticesForScope` | function | 12066 | `server.ts` |
| `regulationNoticeCount` | function | 12113 | `server.ts` |
| `readApproval` | function | 12118 | `server.ts` |
| `readDeadlineFor` | function | 12124 | `server.ts` |
| `approvalActor` | function | 12133 | `server.ts` |
| `approvalScopeFromBody` | function | 12142 | `server.ts` |
| `refuseIfTermClosed` | function | 12153 | `server.ts` |
| `refuseIfTermFrozen` | function | 12173 | `server.ts` |
| `refuseIfStale` | function | 12184 | `server.ts` |
| `scheduleDataReadiness` | function | 12192 | `server.ts` |
| `submitToRegistrar` | function | 12488 | `server.ts` |
| `EXTENSION_ACTIONS` | const | 12737 | `server.ts` |
| `EXTENSIONS_MAX_TARGETS` | const | 12738 | `server.ts` |
| `NOTE_FIELDS` | const | 12852 | `server.ts` |
| `NOTE_FIELD_LABEL` | const | 12853 | `server.ts` |
| `noteFieldValue` | function | 12865 | `server.ts` |
| `noteState` | function | 12883 | `server.ts` |
| `notesWithState` | function | 12900 | `server.ts` |
| `noteSuggestions` | function | 12931 | `server.ts` |
| `REGISTRAR_NOTIFY_ROLES` | const | 13175 | `server.ts` |
| `studentQueueMemo` | const | 13187 | `server.ts` |
| `studentQueueForTerm` | function | 13188 | `server.ts` |
| `bellBlockingMemo` | const | 13201 | `server.ts` |
| `onSchedulesInvalidated(() => bellBlockingMemo.invalidate());` | جملة | 13202 | `server.ts` |
| `bellBlockingCount` | function | 13203 | `server.ts` |
| `bellPlanningTermId` | function | 13211 | `server.ts` |
| `notificationItemsForTerm` | function | 13222 | `server.ts` |
| `approvalBadgeForTerm` | function | 13438 | `server.ts` |
| `hydrateVersionRows` | function | 14310 | `server.ts` |
| `briefChangedSince` | function | 14321 | `server.ts` |
| `rowSignatureServer` | function | 14329 | `server.ts` |
| `livingResponseCache` | const | 14351 | `server.ts` |
| `LIVING_RESPONSE_TTL_MS` | const | 14352 | `server.ts` |
| `onSchedulesInvalidated(() => livingResponseCache.clear());` | جملة | 14353 | `server.ts` |
| `driftCache` | const | 14503 | `server.ts` |
| `historicalTimeCache` | const | 14504 | `server.ts` |
| `driftSerial` | let | 14505 | `server.ts` |
| `onSchedulesInvalidated(() => { driftSerial += 1; historicalTimeCache.c` | جملة | 14506 | `server.ts` |
| `splitArchivedCourseRows` | function | 14708 | `server.ts` |
| `applyRoleTemplate` | function | 14974 | `server.ts` |
| `applyRoleScopeOnly` | function | 15021 | `server.ts` |
| `sanitizeAssigns` | function | 15122 | `server.ts` |
| `departmentHeadPlan` | function | 15174 | `server.ts` |
| `advisorPlan` | function | 15182 | `server.ts` |
| `balanceScopeLabel` | function | 15760 | `server.ts` |
| `SHARE_DAY_KEYS` | const | 15908 | `server.ts` |
| `SHARE_DAY_NAMES` | const | 15909 | `server.ts` |
| `SHARE_ICS_DAYS` | const | 15910 | `server.ts` |
| `SHARE_MAX_DAYS` | const | 15911 | `server.ts` |
| `shareDayIndexes` | function | 15913 | `server.ts` |
| `shareLinkStillReadable` | function | 15920 | `server.ts` |
| `resolveShareToken` | function | 15929 | `server.ts` |
| `PUBLIC_VISITING_BADGE_CSS` | const | 15942 | `server.ts` |
| `buildSharePayload` | function | 15945 | `server.ts` |
| `publicAttempts` | const | 16002 | `server.ts` |
| `publicAttemptKey` | const | 16003 | `server.ts` |
| `publicAttemptReserve` | const | 16006 | `server.ts` |
| `staffLookupAllowed` | function | 16009 | `server.ts` |
| `MovementEntry` | type | 16022 | `server.ts` |
| `MOVEMENT_REJECT_REASON` | const | 16027 | `server.ts` |
| `requestMovementEntries` | function | 16032 | `server.ts` |
| `movementHistoryScopes` | function | 16067 | `server.ts` |
| `scheduleMovementEntries` | function | 16075 | `server.ts` |
| `buildStaffCard` | function | 16121 | `server.ts` |
| `staffFamilyScopes` | function | 16384 | `server.ts` |
| `staffFamilyShareLinks` | function | 16387 | `server.ts` |
| `liveStaffPublication` | const | 16392 | `server.ts` |
| `shareLinkLabel` | function | 16415 | `server.ts` |
| `isPersonalStaffLink` | const | 16544 | `server.ts` |
| `personalLinkEligibleIds` | function | 16546 | `server.ts` |
| `staffLinkFamilyAllowed` | const | 16560 | `server.ts` |
| `readSectionBuild` | function | 16782 | `server.ts` |
| `authorityDepartmentKeyOf` | function | 17052 | `server.ts` |
| `REMAINING_SEASONS` | const | 17064 | `server.ts` |
| `REMAINING_SEASON_NAMES` | const | 17065 | `server.ts` |
| `remainingContext` | function | 17066 | `server.ts` |
| `remainingTermRefusal` | function | 17082 | `server.ts` |
| `reportTermLabelOf` | function | 17095 | `server.ts` |
| `remainingWarnings` | function | 17099 | `server.ts` |
| `remainingAssessment` | function | 17104 | `server.ts` |
| `TERM_WEEKS` | const | 17206 | `server.ts` |
| `sendCalendar` | function | 17217 | `server.ts` |
| `calendarSecret` | const | 17295 | `server.ts` |
| `calendarKey` | const | 17297 | `server.ts` |
| `stableCalendarPath` | const | 17329 | `server.ts` |
| `sendInstructorCalendar` | function | 17350 | `server.ts` |
| `STAFF_NOTES_PER_DAY` | const | 17435 | `server.ts` |
| `studentCaseSecretPromise` | let | 17529 | `server.ts` |
| `studentCaseSecret` | const | 17530 | `server.ts` |
| `surveyFingerprint` | const | 17531 | `server.ts` |
| `studentIdentityKey` | const | 17534 | `server.ts` |
| `sealStudentIdentity` | const | 17535 | `server.ts` |
| `openStudentIdentity` | const | 17540 | `server.ts` |
| `canSeeStudentIdentity` | const | 17562 | `server.ts` |
| `studentIdentityFor` | const | 17563 | `server.ts` |
| `degreeRuleFromName` | const | 17571 | `server.ts` |
| `degreeRuleForSection` | const | 17585 | `server.ts` |
| `storedDegreeRuleForSection` | const | 17599 | `server.ts` |
| `planDegreeRule` | const | 17614 | `server.ts` |
| `graduationCandidatesForSection` | const | 17630 | `server.ts` |
| `graduationRuleFor` | const | 17640 | `server.ts` |
| `isSummerTerm` | const | 17654 | `server.ts` |
| `graduateThreshold` | const | 17655 | `server.ts` |
| `STUDENT_PROOF_TTL_MS` | const | 17658 | `server.ts` |
| `issueStudentProof` | const | 17659 | `server.ts` |
| `studentProofExpired` | const | 17665 | `server.ts` |
| `verifyStudentProof` | const | 17668 | `server.ts` |
| `normalizeCaseRef` | const | 17681 | `server.ts` |
| `priorNeedForHand` | const | 17683 | `server.ts` |
| `caseRefMatches` | const | 17691 | `server.ts` |
| `maskedInitial` | const | 17693 | `server.ts` |
| `CASE_REF_REQUIRED` | const | 17694 | `server.ts` |
| `reusableGraduateVerification` | const | 17702 | `server.ts` |
| `normalizeStudentIdentityName` | const | 17733 | `server.ts` |
| `reusableStudentIdentity` | const | 17740 | `server.ts` |
| `asciiDigits` | const | 17757 | `server.ts` |
| `surveyCohort` | const | 17759 | `server.ts` |
| `surveyActiveCourseIds` | const | 17774 | `server.ts` |
| `surveyCourseIdsForSection` | function | 17776 | `server.ts` |
| `surveyTermEnded` | const | 17840 | `server.ts` |
| `SURVEY_TERM_ENDED` | const | 17841 | `server.ts` |
| `surveyPayloadCache` | const | 17847 | `server.ts` |
| `SURVEY_PAYLOAD_TTL_MS` | const | 17848 | `server.ts` |
| `STUDENT_PROOF_MAX_BYTES` | const | 17980 | `server.ts` |
| `STUDENT_PROOF_TOO_LARGE` | const | 17981 | `server.ts` |
| `studentProofBody` | const | 17982 | `server.ts` |
| `readStudentProofBody` | const | 17983 | `server.ts` |
| `GraduateProofSink` | type | 17991 | `server.ts` |
| `graduateProofCore` | function | 17992 | `server.ts` |
| `graduateSubmitCheck` | function | 18096 | `server.ts` |
| `curriculumLabelsFor` | const | 18262 | `server.ts` |
| `sectionGapCache` | const | 18281 | `server.ts` |
| `cachedSectionGap` | function | 18282 | `server.ts` |
| `sectionGapData` | function | 18290 | `server.ts` |
| `sectionGapStaffing` | function | 18388 | `server.ts` |
| `canWriteRegistration` | const | 18694 | `server.ts` |
| `grantedPermissions` | const | 18703 | `server.ts` |
| `owningSectionsInScopeFor` | const | 18714 | `server.ts` |
| `STUDENT_COURSE_STATES` | const | 18721 | `server.ts` |
| `STUDENT_REJECT_REASONS` | const | 18722 | `server.ts` |
| `STUDENT_COMMITTEE_REASONS` | const | 18723 | `server.ts` |
| `RegistrationViewer` | type | 18734 | `server.ts` |
| `registrationViewer` | const | 18735 | `server.ts` |
| `reachedRegistration` | const | 18738 | `server.ts` |
| `registrarBlockReason` | function | 18758 | `server.ts` |
| `demoPageHint` | function | 19276 | `server.ts` |
| `publicPageNonce` | function | 19318 | `server.ts` |
| `staffCardPage` | function | 19343 | `src/server/pages/staffCardPage.ts` |
| `surveyPage` | function | 19915 | `src/server/pages/surveyPages.ts` |
| `studentCaseSurveyPage` | function | 20249 | `src/server/pages/surveyPages.ts` |
| `REQUEST_LINK_DAYS` | const | 20350 | `server.ts` |
| `requestWindowOpen` | const | 20353 | `server.ts` |
| `currentInstructorRequestGeneration` | function | 20356 | `server.ts` |
| `requireCurrentInstructorRequestGeneration` | function | 20370 | `server.ts` |
| `requestItemScope` | function | 20378 | `server.ts` |
| `requestForDepartment` | function | 20393 | `server.ts` |
| `stripForInstructor` | function | 20410 | `server.ts` |
| `courseHabitMemo` | const | 20448 | `server.ts` |
| `onSchedulesInvalidated(() => courseHabitMemo.clear());` | جملة | 20449 | `server.ts` |
| `courseHabit` | function | 20451 | `server.ts` |
| `habitBlockFor` | const | 20467 | `server.ts` |
| `blockMinutesOfItem` | function | 20470 | `server.ts` |
| `decisionStillApplies` | function | 20483 | `server.ts` |
| `priorAddFor` | function | 20494 | `server.ts` |
| `requestSlotsForCourse` | function | 20509 | `server.ts` |
| `instructorRequestItemsFromPayload` | function | 20521 | `server.ts` |
| `resolveRequestLink` | function | 20642 | `server.ts` |
| `instructorRequestSectionCourses` | function | 20668 | `server.ts` |
| `refreshUnsubmittedInstructorRequest` | function | 20688 | `server.ts` |
| `InstructorRequestCourseOption` | type | 20718 | `server.ts` |
| `instructorRequestDepartmentScopes` | function | 20735 | `server.ts` |
| `instructorRequestCourseOptions` | function | 20763 | `server.ts` |
| `originalOffering` | function | 20794 | `server.ts` |
| `availableInstructorOfferings` | function | 20799 | `server.ts` |
| `requestReservationProposals` | function | 20838 | `server.ts` |
| `buildRequestContext` | function | 20857 | `server.ts` |
| `buildSharedRequestContext` | function | 20865 | `server.ts` |
| `SharedRequestContext` | type | 20898 | `server.ts` |
| `requestContextFor` | function | 20900 | `server.ts` |
| `requestRulesForScope` | function | 20916 | `server.ts` |
| `roomUsageMemo` | const | 20981 | `server.ts` |
| `roomUsageOf` | function | 20982 | `server.ts` |
| `rulesInflight` | const | 20994 | `server.ts` |
| `rulesOnce` | function | 20995 | `server.ts` |
| `judgeRequestItems` | function | 21003 | `server.ts` |
| `requireInstructorRequestRevision` | function | 21617 | `server.ts` |
| `instructorRequestItemIdentity` | function | 21629 | `server.ts` |
| `ApplyOp` | type | 21791 | `server.ts` |
| `daysFlags` | const | 21796 | `server.ts` |
| `rowBodyOf` | const | 21797 | `server.ts` |
| `requestDayPatterns` | function | 22223 | `server.ts` |
| `verifyRequestSigner` | function | 22241 | `server.ts` |
| `instructorRequestPage` | function | 22609 | `src/server/pages/instructorRequestPage.ts` |
| `previousTermMemo` | const | 23780 | `server.ts` |
| `cardStreams` | const | 23833 | `server.ts` |
| `cardStreamTotal` | let | 23834 | `server.ts` |
| `CARD_STREAMS_PER_REQUEST` | const | 23835 | `server.ts` |
| `CARD_STREAMS_TOTAL` | const | 23836 | `server.ts` |
| `Repository.onInstructorRequestSaved(info => {` | جملة | 23837 | `server.ts` |
| `rateLimitCheckTimes` | const | 23882 | `server.ts` |
| `REQUEST_HOLD_TTL_MS` | const | 23955 | `server.ts` |
| `registerStudyProposalRoutes(app, {` | جملة | 24020 | `server.ts` |
| `publicInvalidLinkPage` | function | 24045 | `src/server/pages/publicInvalidLinkPage.ts` |
| `offeringViewsFor` | function | 24066 | `server.ts` |
| `coursesWithOffering` | function | 24085 | `server.ts` |
| `taPhaseId` | const | 24096 | `server.ts` |
| `taPhaseForRequest` | function | 24099 | `server.ts` |
| `sendTaWave` | function | 24239 | `server.ts` |
| `dispatchTaWaves` | function | 24269 | `server.ts` |
| `setInterval(() => {` | جملة | 24374 | `server.ts` |
| `seatConfigId` | const | 24379 | `server.ts` |
| `seatSections` | function | 24381 | `server.ts` |
| `rateLimitVerifySignature` | const | 24481 | `server.ts` |
| `SURVEY_STATUS_GRACE_MS` | const | 24587 | `server.ts` |
| `resolveSurveyStatusToken` | function | 24588 | `server.ts` |
| `studentCaseStatusPage` | function | 24701 | `src/server/pages/studentCaseStatusPage.ts` |
| `registerPlanReviewRoutes(app, {` | جملة | 24859 | `server.ts` |
| `planSheetTemplate` | let | 24870 | `server.ts` |
| `for (const candidate of [path.join(process.cwd(), "public", "plans", "` | جملة | 24871 | `server.ts` |
| `{` | جملة | 24874 | `server.ts` |
| `registerAdsRoutes(app, { requireAuth, requireRootAdmin, publicPageNonc` | جملة | 24885 | `server.ts` |
| `registerSimulationRoutes(app, {` | جملة | 24888 | `server.ts` |
| `registerInsightRoutes(app, {` | جملة | 24895 | `server.ts` |
| `registerTimeMachineRoutes(app, {` | جملة | 24902 | `server.ts` |
| `registerStudentShowcase(app, { identityKey: studentIdentityKey, sealId` | جملة | 24980 | `server.ts` |
| `registerStudentDoorRoutes(app, {` | جملة | 24981 | `server.ts` |
| `STUDENT_QR_DAYS` | const | 25021 | `server.ts` |
| `studentSchedulePage` | function | 25023 | `src/server/pages/studentSchedulePage.ts` |
| `migrateLegacyAccountsToCommitteeRole` | function | 25709 | `server.ts` |
| `SCHEDULE_WORKSPACE_FORM_ID` | const | 25736 | `server.ts` |
| `reconcileDepartmentHeadPermissions` | function | 25737 | `server.ts` |
| `startServer` | function | 25754 | `server.ts` |
| `startServer().catch(error => {` | جملة | 25996 | `server.ts` |
