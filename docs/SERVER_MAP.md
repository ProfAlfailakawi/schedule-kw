# خريطةُ الخادم

> مولَّدةٌ بـ `node scripts/split-server/split.mjs` — لا تُحرَّر باليد؛ تُعاد مع كل تشغيل.

المرحلة: `routes`. حجمُ `server.ts` بعد التقسيم: 911 سطراً (كان 26066).

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
| `server.ts` | 911 | جذرُ التركيب |
| `src/server/core/approvals.ts` | 374 | الاعتماد: الأقفال والمعاملات وتسجيلُ التغيير |
| `src/server/core/auth.ts` | 299 | الجلسة والهوية والصلاحيات (authMiddleware، requireAuth، requirePermission…) |
| `src/server/core/authority.ts` | 259 | مقارنةُ ملف الجهة الرسمية (PDF) بالجدول |
| `src/server/core/boot.ts` | 194 | الإقلاع: ترتيبُ تحميل الوحدات الأصلية ثم ضبطُ البيئة |
| `src/server/core/demo.ts` | 44 | البيئة التجريبية: قصصُ العرض وطلبُ الأستاذ التجريبي |
| `src/server/core/gemini.ts` | 95 | طبقةُ النموذج اللغوي: نيّةُ الدليل وطلبُ الجدولة |
| `src/server/core/hallBarter.ts` | 52 | تبادلُ القاعات: الحالة المشتركة والفحوص |
| `src/server/core/http.ts` | 89 | أدواتُ HTTP: asyncSafe، حدُّ التزامن، قراءةُ النسخ الاحتياطية |
| `src/server/core/input.ts` | 46 | تنظيفُ المدخلات وحدودُها |
| `src/server/core/instructorRequests.ts` | 605 | طلباتُ الأساتذة: السياقُ والحكمُ على البنود |
| `src/server/core/liveChannel.ts` | 248 | القناة الحيّة: بثُّ التغييرات والحضور |
| `src/server/core/locations.ts` | 96 | سجلُّ المواقع والقاعات: القراءة والتوحيد قبل الكتابة |
| `src/server/core/notes.ts` | 80 | ملاحظاتُ الجدول وحالاتُها |
| `src/server/core/notifications.ts` | 44 | الإشعاراتُ والجرس |
| `src/server/core/ordering.ts` | 69 | الترتيبُ العربي للأسماء والفصول |
| `src/server/core/planning.ts` | 71 | التخطيط: فجوةُ الشعب وتقريرُ المتبقي |
| `src/server/core/publicPages.ts` | 125 | الصفحاتُ العامة: تلميحُ التجربة وسياسةُ المحتوى |
| `src/server/core/rateLimits.ts` | 94 | حدودُ المعدّل للدخول والروابط العامة |
| `src/server/core/rhythm.ts` | 147 | إيقاعُ القسم وانجرافُ المواعيد |
| `src/server/core/scheduleConflicts.ts` | 357 | فاحصُ التعارضات وحجوزُ الطلبات |
| `src/server/core/scheduleReads.ts` | 129 | قراءةُ الجدول بحسب القارئ والفصل |
| `src/server/core/scheduleRules.ts` | 197 | قواعدُ الموعد: الأيام والأطوال والقاعات والتنقّل |
| `src/server/core/scheduleWrites.ts` | 586 | إنشاءُ صفوف الجدول وتعديلُها وحذفُها وتطبيقُ المقترحات |
| `src/server/core/scope.ts` | 153 | نطاقُ القارئ: الكلية والقسم وما يُسمح له برؤيته |
| `src/server/core/shareLinks.ts` | 145 | روابطُ المشاركة العامة |
| `src/server/core/smartImport.ts` | 394 | قواعدُ الاستيراد الذكي وفحصُ الصفوف |
| `src/server/core/staffCard.ts` | 135 | بطاقةُ الأستاذ وسجلُّ الحركة |
| `src/server/core/state.ts` | 33 | متغيّراتُ الحالة المشتركة (تُكتب من أكثر من وحدة) |
| `src/server/core/studentIdentity.ts` | 338 | هويةُ الطالب وقواعدُ التخرّج وإثباتُه |
| `src/server/core/versions.ts` | 129 | نسخُ النطاق قبل الكتابة وبعدها، وتأكيدُ الاستبدال |
| `src/server/core/visiting.ts` | 78 | الأساتذةُ الزائرون: القراءة والفحص |
| `src/server/pages/instructorRequestPage.ts` | 1037 | صفحةُ طلب الأستاذ (/r/:token) |
| `src/server/pages/publicInvalidLinkPage.ts` | 15 | صفحةُ الرابط غير الصالح |
| `src/server/pages/staffCardPage.ts` | 571 | بطاقةُ الأستاذ العامة |
| `src/server/pages/studentCaseStatusPage.ts` | 144 | صفحةُ «حالة طلبي» للطالب |
| `src/server/pages/studentSchedulePage.ts` | 438 | جدولُ الطالب العام |
| `src/server/pages/surveyPages.ts` | 434 | استبيانُ الطلبة وصفحةُ الحالة الفردية |
| `src/server/routes/adminRoutes.ts` | 227 | النسخُ الاحتياطي وسجلُّ التدقيق |
| `src/server/routes/approvalsRoutes.ts` | 974 | الاعتمادُ والتوقيع |
| `src/server/routes/authRoutes.ts` | 794 | الدخولُ والجلسة والبيئةُ التجريبية |
| `src/server/routes/coursesRoutes.ts` | 657 | المقرراتُ والخططُ الدراسية وأنواعُ القاعات |
| `src/server/routes/dashboardRoutes.ts` | 482 | اللوحةُ والرحلةُ والبحث |
| `src/server/routes/draftsRoutes.ts` | 499 | المسوّداتُ والنسخُ ومقارنةُ الفصول |
| `src/server/routes/guideRoutes.ts` | 186 | الدليلُ الذكي وقياسُ الواجهة |
| `src/server/routes/hallBarterRoutes.ts` | 469 | تبادلُ القاعات |
| `src/server/routes/instructorRequestsRoutes.ts` | 966 | طلباتُ الأساتذة (جهةُ المنسّق) |
| `src/server/routes/instructorsRoutes.ts` | 622 | الأساتذة والزائرون والمندوبون |
| `src/server/routes/intelligenceInsightRoutes.ts` | 651 | قراءاتُ الذكاء: الحيّ ولماذا والانجرافُ والانتقال |
| `src/server/routes/intelligenceRoutes.ts` | 779 | ورشةُ الذكاء: القيودُ وغرفةُ القرار والمساعد |
| `src/server/routes/locationsRoutes.ts` | 452 | سجلُّ المواقع وإعدادُ المباني والقاعات |
| `src/server/routes/notificationsRoutes.ts` | 311 | الإشعارات |
| `src/server/routes/offeringRoutes.ts` | 313 | عروضُ المقررات ومرحلةُ المساعدين ومقاعدُ المرشدين |
| `src/server/routes/pdfImportRoutes.ts` | 959 | استيرادُ ملفات PDF |
| `src/server/routes/planningRoutes.ts` | 934 | التخطيط: فجوةُ الشعب والطلبُ والتسجيلُ وبناءُ الشعب |
| `src/server/routes/publicCalendarRoutes.ts` | 253 | التقويمُ العام (ICS) |
| `src/server/routes/publicRequestRoutes.ts` | 1418 | طلبُ الأستاذ العام (/r) |
| `src/server/routes/publicStaffRoutes.ts` | 694 | صفحاتُ الأستاذ والطالب العامة (/s /t /me) |
| `src/server/routes/referenceRoutes.ts` | 413 | البياناتُ المرجعية: الكليات والأقسام والفصول والعبء |
| `src/server/routes/reportsRoutes.ts` | 894 | التقارير |
| `src/server/routes/scheduleImportRoutes.ts` | 347 | استيرادُ الجدول وتصديرُه |
| `src/server/routes/scheduleLiveRoutes.ts` | 119 | بثُّ الجدول الحيّ ونبضتُه |
| `src/server/routes/scheduleNotesRoutes.ts` | 200 | ملاحظاتُ الجدول |
| `src/server/routes/scheduleReviewRoutes.ts` | 444 | مراجعةُ الجدول: التعارضاتُ والجاهزيةُ والنقلُ الجماعي |
| `src/server/routes/scheduleToolsRoutes.ts` | 623 | أدواتُ الجدول: اقتراحُ المواعيد والاستبدالُ والاجتماعات |
| `src/server/routes/schedulesRoutes.ts` | 569 | الجدول: القراءة والكتابة والنسخ والمسح |
| `src/server/routes/shareRoutes.ts` | 298 | روابطُ المشاركة |
| `src/server/routes/smartImportRoutes.ts` | 206 | الاستيرادُ الذكي |
| `src/server/routes/studentRegistrationRoutes.ts` | 534 | تسجيلُ الطلبة |
| `src/server/routes/surveyRoutes.ts` | 594 | استبيانُ الطلبة وحالاتُهم (/q /m) |
| `src/server/routes/systemRoutes.ts` | 53 | النظام: الإصدار والصحة وإعداداتُ التجربة |
| `src/server/routes/usersRoutes.ts` | 545 | المستخدمون والصلاحيات والنطاقات |
| `src/server/routes/verifyRoutes.ts` | 99 | التحقّقُ من رمز التوقيع |

## ترتيبُ التسجيل في server.ts

- `registerSystemRoutes(app)` — 3 طريقاً، من `src/server/routes/systemRoutes.ts`
- `registerAuthRoutes(app)` — 11 طريقاً، من `src/server/routes/authRoutes.ts`
- `registerDashboardRoutes(app)` — 4 طريقاً، من `src/server/routes/dashboardRoutes.ts`
- `registerReferenceRoutes(app)` — 23 طريقاً، من `src/server/routes/referenceRoutes.ts`
- `registerInstructorsRoutes(app)` — 18 طريقاً، من `src/server/routes/instructorsRoutes.ts`
- `registerCoursesRoutes(app)` — 18 طريقاً، من `src/server/routes/coursesRoutes.ts`
- `registerScheduleLiveRoutes(app)` — 3 طريقاً، من `src/server/routes/scheduleLiveRoutes.ts`
- `registerSchedulesRoutes(app)` — 15 طريقاً، من `src/server/routes/schedulesRoutes.ts`
- `registerHallBarterRoutes(app)` — 5 طريقاً، من `src/server/routes/hallBarterRoutes.ts`
- `registerScheduleImportRoutes(app)` — 3 طريقاً، من `src/server/routes/scheduleImportRoutes.ts`
- `registerScheduleReviewRoutes(app)` — 4 طريقاً، من `src/server/routes/scheduleReviewRoutes.ts`
- `registerIntelligenceInsightRoutes(app)` — 17 طريقاً، من `src/server/routes/intelligenceInsightRoutes.ts`
- `registerReportsRoutes(app)` — 8 طريقاً، من `src/server/routes/reportsRoutes.ts`
- `registerLocationsRoutes(app)` — 20 طريقاً، من `src/server/routes/locationsRoutes.ts`
- `registerScheduleToolsRoutes(app)` — 10 طريقاً، من `src/server/routes/scheduleToolsRoutes.ts`
- `registerGuideRoutes(app)` — 2 طريقاً، من `src/server/routes/guideRoutes.ts`
- `registerIntelligenceRoutes(app)` — 29 طريقاً، من `src/server/routes/intelligenceRoutes.ts`
- `registerDraftsRoutes(app)` — 12 طريقاً، من `src/server/routes/draftsRoutes.ts`
- `registerSmartImportRoutes(app)` — 2 طريقاً، من `src/server/routes/smartImportRoutes.ts`
- `registerPdfImportRoutes(app)` — 2 طريقاً، من `src/server/routes/pdfImportRoutes.ts`
- `registerApprovalsRoutes(app)` — 16 طريقاً، من `src/server/routes/approvalsRoutes.ts`
- `registerScheduleNotesRoutes(app)` — 5 طريقاً، من `src/server/routes/scheduleNotesRoutes.ts`
- `registerNotificationsRoutes(app)` — 2 طريقاً، من `src/server/routes/notificationsRoutes.ts`
- `registerAdminRoutes(app)` — 17 طريقاً، من `src/server/routes/adminRoutes.ts`
- `registerUsersRoutes(app)` — 20 طريقاً، من `src/server/routes/usersRoutes.ts`
- `registerShareRoutes(app)` — 7 طريقاً، من `src/server/routes/shareRoutes.ts`
- `registerPlanningRoutes(app)` — 17 طريقاً، من `src/server/routes/planningRoutes.ts`
- `registerPublicCalendarRoutes(app)` — 5 طريقاً، من `src/server/routes/publicCalendarRoutes.ts`
- `registerPublicStaffRoutes(app)` — 6 طريقاً، من `src/server/routes/publicStaffRoutes.ts`
- `registerSurveyRoutes(app)` — 8 طريقاً، من `src/server/routes/surveyRoutes.ts`
- `registerStudentRegistrationRoutes(app)` — 3 طريقاً، من `src/server/routes/studentRegistrationRoutes.ts`
- `registerInstructorRequestsRoutes(app)` — 7 طريقاً، من `src/server/routes/instructorRequestsRoutes.ts`
- `registerPublicRequestRoutes(app)` — 16 طريقاً، من `src/server/routes/publicRequestRoutes.ts`
- `registerOfferingRoutes(app)` — 10 طريقاً، من `src/server/routes/offeringRoutes.ts`
- `registerVerifyRoutes(app)` — 2 طريقاً، من `src/server/routes/verifyRoutes.ts`

## خريطةُ النقل: الطرق

| الطريق | السطر القديم | الملف الجديد |
|---|---:|---|
| `GET /api/demo/config` | 996 | `src/server/routes/systemRoutes.ts` |
| `GET /api/version` | 1008 | `src/server/routes/systemRoutes.ts` |
| `GET /api/health` | 1013 | `src/server/routes/systemRoutes.ts` |
| `POST /api/auth/demo` | 2645 | `src/server/routes/authRoutes.ts` |
| `POST /api/demo/role` | 2677 | `src/server/routes/authRoutes.ts` |
| `GET /i/:username` | 2703 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/login` | 2712 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/logout` | 2771 | `src/server/routes/authRoutes.ts` |
| `GET /api/auth/me` | 2821 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/heartbeat` | 2838 | `src/server/routes/authRoutes.ts` |
| `POST /api/demo/reset` | 2860 | `src/server/routes/authRoutes.ts` |
| `GET /api/demo/teacher-card` | 2885 | `src/server/routes/authRoutes.ts` |
| `GET /api/demo/seed-status` | 2906 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/presence` | 2935 | `src/server/routes/authRoutes.ts` |
| `GET /api/dashboard` | 2981 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/journey` | 3197 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/search` | 3245 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/colleges` | 3351 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/colleges` | 3363 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/colleges/:id` | 3377 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/colleges/:id` | 3397 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/colleges/:id/mobility` | 3413 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/colleges/:id/mobility` | 3432 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/sections` | 3444 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/schedule-day-window` | 3451 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/admin/section-schedule-windows` | 3458 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/admin/section-schedule-windows` | 3465 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/admin/teaching-load` | 3488 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/admin/teaching-load` | 3505 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/teaching-load/status` | 3514 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/sections` | 3532 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/sections/:id` | 3552 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/sections/:id` | 3577 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/terms` | 3595 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/terms/scoped` | 3606 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/terms` | 3630 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/terms/:id` | 3645 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/terms/:id` | 3663 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/instructors` | 3757 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/instructors` | 3879 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/instructors/:id` | 3926 | `src/server/routes/instructorsRoutes.ts` |
| `DELETE /api/instructors/:id` | 3964 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/location-room-types` | 3991 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/admin/location-room-types` | 4006 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/admin/location-room-types` | 4014 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/admin/location-room-types/:type` | 4026 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/admin/location-room-types/:type` | 4045 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/courses` | 4062 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/curriculum/sections/:sectionId` | 4145 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans` | 4152 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/curriculum/plans/:planId` | 4162 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans/:planId/courses` | 4192 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/curriculum/plans/:planId/courses/:courseId` | 4207 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/transitions` | 4233 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/curriculum/transitions/:id` | 4258 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/curriculum/plans/:planId/archive-readiness` | 4289 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans/:planId/archive` | 4296 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/courses` | 4329 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/courses/:id` | 4394 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/courses/:id` | 4564 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/schedules/events` | 5835 | `src/server/routes/scheduleLiveRoutes.ts` |
| `GET /api/schedules/pulse` | 5906 | `src/server/routes/scheduleLiveRoutes.ts` |
| `POST /api/schedules/pulse` | 5929 | `src/server/routes/scheduleLiveRoutes.ts` |
| `GET /api/schedules/workspace` | 6016 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules` | 6197 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/hall-barter` | 6256 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests` | 6263 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests/:id/respond` | 6284 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests/:id/cancel` | 6343 | `src/server/routes/hallBarterRoutes.ts` |
| `GET /api/hall-barter/inbox` | 6365 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/schedules/import-preflight` | 6396 | `src/server/routes/scheduleImportRoutes.ts` |
| `POST /api/schedules/check-conflicts` | 6482 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/review-readiness` | 6511 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/outside-clashes` | 6657 | `src/server/routes/scheduleReviewRoutes.ts` |
| `POST /api/intelligence/nl-move` | 6714 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/nl-schedule` | 6854 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/schedules/move-batch` | 6932 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/export` | 7037 | `src/server/routes/scheduleImportRoutes.ts` |
| `POST /api/schedules/import` | 7126 | `src/server/routes/scheduleImportRoutes.ts` |
| `GET /api/visiting-roster` | 7289 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/visiting-lookup` | 7332 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/reports/visiting-roster` | 7340 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/visiting-teaching` | 7359 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/instructors/:id/affiliation` | 7379 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/instructor-affiliations` | 7411 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/delegates` | 7448 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/visiting-roster` | 7464 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/department-delegates` | 7478 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/department-delegates/instructor` | 7489 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/department-delegates/:instructorId` | 7513 | `src/server/routes/instructorsRoutes.ts` |
| `DELETE /api/department-delegates/:instructorId` | 7536 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/instructors/:id/visiting-state` | 7556 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/instructors/:id/visiting-conversion` | 7581 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/visiting-roster/instructor` | 7600 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/visiting-roster/copy` | 7615 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/reports/visiting-history` | 7633 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/department-rooms` | 7697 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/department-rooms` | 7704 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/location-registry` | 7709 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/companion-rooms` | 7839 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/location-registry/pending` | 7862 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-registry` | 7878 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-setup` | 7892 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-setup/buildings` | 7896 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-setup/buildings/:id` | 7912 | `src/server/routes/locationsRoutes.ts` |
| `DELETE /api/admin/location-setup/buildings/:id` | 7923 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-setup/rooms` | 7932 | `src/server/routes/locationsRoutes.ts` |
| `DELETE /api/admin/location-setup/rooms/:id` | 7952 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/buildings` | 7958 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/buildings/:id` | 7981 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/rooms` | 7996 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/rooms/:id` | 8012 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/review/:id` | 8082 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-registry/migration/preview` | 8087 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/migration/apply` | 8090 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/migration/:id/rollback` | 8113 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/schedules/ta-conversion` | 8154 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/ta-conversion` | 8166 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/replace-instructor` | 8215 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/schedules/replace-instructor/history` | 8266 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/courses/nature` | 8283 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/rooms/owner` | 8307 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/suggest-slots` | 8332 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/placeholder-action` | 8519 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/schedules/:id/exceptions` | 8651 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/:id/exceptions` | 8658 | `src/server/routes/schedulesRoutes.ts` |
| `DELETE /api/schedules/:id/exceptions/:exceptionId` | 8723 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/:id/substitutes` | 8741 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/meeting-participants` | 8874 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/meeting-slots` | 8891 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules` | 9087 | `src/server/routes/schedulesRoutes.ts` |
| `PUT /api/schedules/:id` | 9279 | `src/server/routes/schedulesRoutes.ts` |
| `DELETE /api/schedules/:id` | 9307 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/copy-preview` | 9311 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/apply-proposal` | 9508 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/copy` | 9515 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/wipe-scope` | 9601 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/wipe-scope` | 9615 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/wipe-scope/restore` | 9662 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/telemetry/client` | 9700 | `src/server/routes/guideRoutes.ts` |
| `POST /api/guide/intent` | 9911 | `src/server/routes/guideRoutes.ts` |
| `GET /api/intelligence/guide-friction` | 9951 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/experience-health` | 9991 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/open-decisions` | 10013 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/open-decisions` | 10030 | `src/server/routes/intelligenceRoutes.ts` |
| `PATCH /api/intelligence/open-decisions/:id` | 10043 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/operations-review` | 10056 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/policy-simulate` | 10068 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/overview` | 10089 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/spatial-burnout` | 10135 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/conflict-solutions` | 10142 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/ripple/:id` | 10152 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/lookups` | 10172 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/genome` | 10189 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/constraints` | 10199 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/constraints` | 10204 | `src/server/routes/intelligenceRoutes.ts` |
| `PUT /api/intelligence/constraints/:id` | 10227 | `src/server/routes/intelligenceRoutes.ts` |
| `DELETE /api/intelligence/constraints/:id` | 10233 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/war-room` | 10251 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/autopilot` | 10267 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/evaluate` | 10273 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/auto-schedule` | 10284 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/copilot` | 10301 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/context/:id` | 10479 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/replay/:id` | 10539 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/room` | 10572 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/professor/:id` | 10596 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/comments/:scheduleId` | 10600 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/comments/:scheduleId` | 10603 | `src/server/routes/intelligenceRoutes.ts` |
| `PUT /api/intelligence/comments/:scheduleId/:commentId` | 10606 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/drafts` | 10618 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/smart-import` | 10622 | `src/server/routes/smartImportRoutes.ts` |
| `POST /api/intelligence/pdf-import/bootstrap-section` | 10803 | `src/server/routes/pdfImportRoutes.ts` |
| `POST /api/intelligence/pdf-import` | 10872 | `src/server/routes/pdfImportRoutes.ts` |
| `POST /api/intelligence/drafts` | 11623 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/drafts/:id/import-report` | 11736 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/approvals` | 12255 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/approvals/term` | 12309 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/sign` | 12370 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/withdraw` | 12449 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/head-return` | 12480 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/acknowledge-additions` | 12505 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/submit` | 12575 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/return` | 12598 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/accept` | 12636 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/deadline` | 12681 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/student-phases` | 12706 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extension` | 12742 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extensions` | 12781 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extension-request` | 12853 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/schedule-notes` | 13030 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes` | 13050 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes/:id/rebut` | 13119 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes/:id/verdict` | 13145 | `src/server/routes/scheduleNotesRoutes.ts` |
| `DELETE /api/schedule-notes/:id` | 13179 | `src/server/routes/scheduleNotesRoutes.ts` |
| `GET /api/notifications` | 13395 | `src/server/routes/notificationsRoutes.ts` |
| `POST /api/notifications/seen` | 13471 | `src/server/routes/notificationsRoutes.ts` |
| `GET /api/approvals/badge` | 13516 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/approvals/inbox` | 13528 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/reports/schedule-changes` | 13667 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/authority-pdf-diff` | 13950 | `src/server/routes/reportsRoutes.ts` |
| `PUT /api/intelligence/drafts/:id` | 13980 | `src/server/routes/draftsRoutes.ts` |
| `PATCH /api/intelligence/drafts/:id/rows/:rowId` | 13983 | `src/server/routes/draftsRoutes.ts` |
| `DELETE /api/intelligence/drafts/:id/rows/:rowId` | 14012 | `src/server/routes/draftsRoutes.ts` |
| `DELETE /api/intelligence/drafts/:id/rows` | 14031 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/drafts/:id/publish` | 14040 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/versions` | 14287 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/versions/compare` | 14290 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/versions/:id/restore` | 14293 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/compare-terms` | 14297 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/import-preview` | 14342 | `src/server/routes/smartImportRoutes.ts` |
| `GET /api/intelligence/living` | 14396 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/why` | 14455 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/why-not` | 14468 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/decision-memory` | 14482 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/decision-memory` | 14488 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/context-copilot` | 14496 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/emergency` | 14514 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/department-start-rhythm` | 14549 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/settled-drift` | 14573 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/rollover` | 14692 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/genesis` | 14756 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/brief` | 14820 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/meeting-minutes` | 14824 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/safety-net` | 14828 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/safety-net/:id/undo` | 14832 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/system-backup/status` | 14846 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/export-jobs` | 14871 | `src/server/routes/adminRoutes.ts` |
| `DELETE /api/system-backup/export-jobs` | 14877 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export-jobs/:id` | 14882 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/export-jobs/:id/step` | 14886 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export-jobs/:id/download` | 14891 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export` | 14905 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/preview` | 14909 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import-jobs` | 14932 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/import-jobs/:id` | 14942 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import-jobs/:id/step` | 14946 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import` | 14951 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/reset` | 14955 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/undo` | 14968 | `src/server/routes/adminRoutes.ts` |
| `GET /api/audit-logs` | 14982 | `src/server/routes/adminRoutes.ts` |
| `GET /api/admin-user-options` | 14987 | `src/server/routes/adminRoutes.ts` |
| `GET /api/admin-instructor-options` | 14993 | `src/server/routes/adminRoutes.ts` |
| `GET /api/roles` | 15071 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users` | 15078 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users` | 15101 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/grant-decision-centre` | 15193 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users/department-heads/preview` | 15230 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/department-heads` | 15234 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users/advisors/preview` | 15259 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/advisors` | 15263 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/advisors/consolidate` | 15294 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/users/:id` | 15336 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/users/:id` | 15446 | `src/server/routes/usersRoutes.ts` |
| `GET /api/permissions/forms` | 15454 | `src/server/routes/usersRoutes.ts` |
| `GET /api/permissions` | 15458 | `src/server/routes/usersRoutes.ts` |
| `POST /api/permissions` | 15462 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/permissions/:id` | 15471 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/permissions/:id` | 15478 | `src/server/routes/usersRoutes.ts` |
| `GET /api/user-scopes` | 15490 | `src/server/routes/usersRoutes.ts` |
| `POST /api/user-scopes` | 15494 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/user-scopes/:id` | 15503 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/user-scopes/:id` | 15512 | `src/server/routes/usersRoutes.ts` |
| `GET /api/reports/excel/:type` | 15523 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/search/natural` | 15647 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/reports/department-balance` | 15809 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/room-load` | 15891 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/share` | 16437 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share` | 16465 | `src/server/routes/shareRoutes.ts` |
| `DELETE /api/share/:id` | 16538 | `src/server/routes/shareRoutes.ts` |
| `GET /api/share/:id/faculty` | 16607 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share/:id/personal` | 16627 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share/:id/sent` | 16668 | `src/server/routes/shareRoutes.ts` |
| `GET /api/share-personal` | 16680 | `src/server/routes/shareRoutes.ts` |
| `GET /api/registration-stats` | 16715 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/preview` | 16920 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/apply` | 16938 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/review-rows` | 16994 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/undo` | 17034 | `src/server/routes/planningRoutes.ts` |
| `GET /api/forecast/term` | 17060 | `src/server/routes/planningRoutes.ts` |
| `PUT /api/registration-stats` | 17082 | `src/server/routes/planningRoutes.ts` |
| `POST /api/registration-stats/remaining-pdf` | 17149 | `src/server/routes/planningRoutes.ts` |
| `POST /api/registration-stats/remaining-cells` | 17201 | `src/server/routes/planningRoutes.ts` |
| `GET /api/public/schedule/:token` | 17224 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics/:token` | 17296 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics/:token/:key` | 17342 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/cal/:token/:key` | 17367 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics-reminder` | 17397 | `src/server/routes/publicCalendarRoutes.ts` |
| `POST /api/public/staff/:token/note` | 17501 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /api/degree-rules` | 17851 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/degree-rules/:sectionId` | 17873 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/public/survey/:token` | 17914 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/identity-status` | 17974 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/proof-status` | 18022 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/proof` | 18147 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token` | 18187 | `src/server/routes/surveyRoutes.ts` |
| `GET /api/schedules/section-gap/decisions` | 18394 | `src/server/routes/planningRoutes.ts` |
| `PUT /api/schedules/section-gap/decisions` | 18400 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/section-gap` | 18423 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/section-gap/staffing` | 18437 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/openings-preview` | 18496 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/academic-advice` | 18522 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/demand` | 18535 | `src/server/routes/planningRoutes.ts` |
| `GET /api/student-registration` | 18831 | `src/server/routes/studentRegistrationRoutes.ts` |
| `POST /api/student-registration/:id/course-state` | 18985 | `src/server/routes/studentRegistrationRoutes.ts` |
| `POST /api/student-registration/:id/case-state` | 19174 | `src/server/routes/studentRegistrationRoutes.ts` |
| `GET /api/schedules/staff-inbox` | 19231 | `src/server/routes/planningRoutes.ts` |
| `POST /api/public/staff/:token` | 19262 | `src/server/routes/publicStaffRoutes.ts` |
| `POST /api/instructor-requests/issue` | 21286 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/instructor-requests/exceptions` | 21498 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/exception/revoke` | 21521 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/instructor-requests` | 21547 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/decide` | 21697 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/apply` | 21873 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/reply` | 22151 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/public/request/:token` | 22195 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token` | 22337 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/reply` | 22507 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/reply-batch` | 22601 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check` | 23677 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/academic-advice` | 23762 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check-batch` | 23796 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/previous` | 23847 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/events` | 23911 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check-times` | 23956 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/hold` | 24022 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/movement` | 24058 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /r/:token` | 24116 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/interest` | 24171 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/stick` | 24191 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/course-offering` | 24256 | `src/server/routes/offeringRoutes.ts` |
| `PUT /api/course-offering` | 24287 | `src/server/routes/offeringRoutes.ts` |
| `GET /api/ta-phase` | 24352 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/allowed` | 24390 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/open` | 24407 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/close` | 24431 | `src/server/routes/offeringRoutes.ts` |
| `GET /api/advisor-seats` | 24468 | `src/server/routes/offeringRoutes.ts` |
| `PUT /api/advisor-seats/config` | 24484 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/advisor-seats/add` | 24494 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/advisor-seats/exception` | 24517 | `src/server/routes/offeringRoutes.ts` |
| `GET /r/:token/proposal/:pid` | 24531 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /verify ، /verify/:code` | 24557 | `src/server/routes/verifyRoutes.ts` |
| `POST /api/public/verify` | 24562 | `src/server/routes/verifyRoutes.ts` |
| `POST /api/public/survey/:token/my-case` | 24667 | `src/server/routes/surveyRoutes.ts` |
| `GET /m/:token` | 24896 | `src/server/routes/surveyRoutes.ts` |
| `GET /q/:token` | 24909 | `src/server/routes/surveyRoutes.ts` |
| `GET /me ، /me/` | 25074 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /api/public/students/:token` | 25519 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /t/:token` | 25534 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /s/:token` | 25548 | `src/server/routes/publicStaffRoutes.ts` |

## خريطةُ النقل: التعريفات والجمل

| الاسم | النوع | السطر القديم | الملف الجديد |
|---|---|---:|---|
| `configureRuntimeEnvironment();` | جملة | 236 | `src/server/core/boot.ts` |
| `app` | const | 238 | `server.ts` |
| `app.set("trust proxy", 1);` | app | 247 | `server.ts` |
| `PORT` | const | 250 | `server.ts` |
| `arabicUiCollator` | const | 257 | `src/server/core/ordering.ts` |
| `foldHeaderIdentity` | const | 258 | `src/server/core/ordering.ts` |
| `isSpecialEducationIdentity` | const | 263 | `src/server/core/ordering.ts` |
| `academicSectionNameMatches` | const | 275 | `src/server/core/ordering.ts` |
| `sortArabicNamed` | const | 287 | `src/server/core/ordering.ts` |
| `verifiedRoomKey` | const | 289 | `src/server/core/ordering.ts` |
| `verifiedBuildingKey` | const | 293 | `src/server/core/ordering.ts` |
| `termChronologyServer` | const | 297 | `src/server/core/ordering.ts` |
| `sortTermsNewestServer` | const | 303 | `src/server/core/ordering.ts` |
| `dataContextCacheKey` | const | 317 | `src/server/core/locations.ts` |
| `locationRegistryCache` | const | 319 | `src/server/core/locations.ts` |
| `readLocationRegistry` | function | 320 | `src/server/core/locations.ts` |
| `invalidateLocationRegistry` | function | 334 | `src/server/core/locations.ts` |
| `provisionBranchSiteLocationsFromAuthority` | function | 354 | `src/server/routes/pdfImportRoutes.ts` |
| `confirmedDepartmentRoomIds` | const | 425 | `src/server/core/locations.ts` |
| `DepartmentRoomReference` | type | 426 | `src/server/routes/locationsRoutes.ts` |
| `canonicalizeLocationForWrite` | function | 428 | `src/server/core/locations.ts` |
| `canonicalizeHistoricalLocationForRuntime` | function | 467 | `src/server/core/locations.ts` |
| `asyncSafe` | const | 494 | `src/server/core/http.ts` |
| `for (const verb of ["get", "post", "put", "patch", "delete", "all", "u` | جملة | 508 | `server.ts` |
| `process.on("unhandledRejection", (reason) => {` | جملة | 514 | `server.ts` |
| `process.on("uncaughtException", (error) => {` | جملة | 517 | `server.ts` |
| `app.disable("x-powered-by");` | app | 521 | `server.ts` |
| `app.use((req, res, next) => {` | app | 522 | `server.ts` |
| `app.use(compression({` | app | 563 | `server.ts` |
| `app.use(["/api/system-backup/preview", "/api/system-backup/import", "/` | app | 577 | `server.ts` |
| `   كبيراً قبل أن يصل إلى المسار. safeDraftRows يقصّ كل حقل ويحدّ الصفو` | app | 584 | `server.ts` |
| `app.use(express.json({ limit: "1mb" }));` | app | 585 | `server.ts` |
| `app.use((req, res, next) => {` | app | 589 | `server.ts` |
| `getCookies` | function | 615 | `src/server/core/auth.ts` |
| `loginAttempts` | const | 630 | `src/server/routes/authRoutes.ts` |
| `rateLimitLogin` | function | 631 | `src/server/routes/authRoutes.ts` |
| `rateLimitHeavyReport` | const | 664 | `src/server/routes/reportsRoutes.ts` |
| `requestTokenKey` | const | 678 | `src/server/core/rateLimits.ts` |
| `REQUEST_IP_CEILING` | const | 682 | `src/server/core/rateLimits.ts` |
| `REQUEST_TOKEN_CEILING` | const | 683 | `src/server/core/rateLimits.ts` |
| `rateLimitPublicRequest` | const | 686 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitCardEvents` | const | 696 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitDocumentRead` | const | 707 | `src/server/routes/planningRoutes.ts` |
| `rateLimitDemoRole` | const | 715 | `src/server/routes/authRoutes.ts` |
| `readRateLimitEnv` | function | 741 | `src/server/core/rateLimits.ts` |
| `PUBLIC_RATE_LIMIT_MAX` | const | 748 | `src/server/core/rateLimits.ts` |
| `PUBLIC_RATE_LIMIT_WINDOW_MS` | const | 749 | `src/server/core/rateLimits.ts` |
| `publicRequestWindows` | const | 750 | `src/server/core/rateLimits.ts` |
| `publicRateLimitSweptAt` | let | 751 | `src/server/core/rateLimits.ts` |
| `rateLimitPublic` | function | 753 | `src/server/core/rateLimits.ts` |
| `app.use("/api/public", rateLimitPublic);` | app | 786 | `server.ts` |
| `requestLinkLimit` | const | 787 | `src/server/core/rateLimits.ts` |
| `app.use("/api/public/request/:token", requestLinkLimit);` | app | 793 | `server.ts` |
| `app.use(adInjection());` | app | 795 | `server.ts` |
| `SERVER_IDLE_SESSION_MS` | const | 797 | `src/server/core/auth.ts` |
| `DEMO_SESSION_TTL_MS` | const | 798 | `src/server/core/auth.ts` |
| `AuthenticatedRequest` | interface | 801 | `src/server/core/auth.ts` |
| `AUTH_CACHE_MS` | const | 827 | `src/server/core/auth.ts` |
| `authCache` | const | 828 | `src/server/core/auth.ts` |
| `SESSION_TOUCH_EVERY_MS` | const | 849 | `src/server/core/auth.ts` |
| `sessionTouchedAt` | const | 850 | `src/server/core/auth.ts` |
| `touchSession` | function | 852 | `src/server/core/auth.ts` |
| `forgetAuthSession` | function | 869 | `src/server/routes/authRoutes.ts` |
| `Repository.onIdentityChanged?.(() => authCache.clear());` | جملة | 873 | `src/server/core/auth.ts` |
| `deadSessions` | const | 878 | `src/server/core/auth.ts` |
| `sessionLookups` | const | 879 | `src/server/core/auth.ts` |
| `sessionLookupRefusedLoggedAt` | let | 880 | `src/server/core/auth.ts` |
| `authMiddleware` | function | 882 | `src/server/core/auth.ts` |
| `databaseDown` | let | 971 | `src/server/core/state.ts` |
| `databaseDownRef` | let | 982 | `src/server/core/state.ts` |
| `app.use("/api", (req, res, next) => {` | app | 1021 | `server.ts` |
| `bindPublicLinkContext` | function | 1038 | `src/server/core/auth.ts` |
| `   شبكةُ الجامعة تفتح ألف رابطٍ صحيح ولا تُحجب، ومن يخمّن يُوقَف قبل أ` | app | 1047 | `server.ts` |
| `app.use(PUBLIC_LINK_PAGE_PREFIXES.map(prefix => `${prefix}:token`), bi` | app | 1048 | `server.ts` |
| `app.use("/api", (req: Request, res: Response, next: NextFunction) => {` | app | 1052 | `server.ts` |
| `app.use("/api", authMiddleware as express.RequestHandler);` | app | 1067 | `server.ts` |
| `DEMO_READ_ONLY_PREFIXES` | const | 1071 | `src/server/core/auth.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1072 | `server.ts` |
| `   حارس الأدوار: نقطة واحدة، لا مئة` | app | 1102 | `server.ts` |
| `ApiPerformanceSample` | type | 1114 | `src/server/core/http.ts` |
| `apiPerformanceSamples` | const | 1115 | `src/server/core/http.ts` |
| `API_PERFORMANCE_LIMIT` | const | 1116 | `src/server/core/http.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1117 | `server.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1137 | `server.ts` |
| `DEMO_SESSION_GONE` | const | 1222 | `src/server/core/auth.ts` |
| `signInRequiredMessage` | function | 1223 | `src/server/core/auth.ts` |
| `requireAuth` | function | 1228 | `src/server/core/auth.ts` |
| `powerOnlyFormIds` | const | 1238 | `src/server/core/auth.ts` |
| `DECISION_CENTRE_FORM_ID` | const | 1241 | `src/server/routes/usersRoutes.ts` |
| `isPowerUser` | function | 1242 | `src/server/core/auth.ts` |
| `requirePowerAdmin` | function | 1245 | `src/server/core/auth.ts` |
| `ROOT_ADMIN_USER_ID` | const | 1251 | `src/server/core/auth.ts` |
| `requireRootAdmin` | function | 1252 | `src/server/core/auth.ts` |
| `SYSTEM_BACKUP_MAX_BYTES` | const | 1261 | `src/server/routes/adminRoutes.ts` |
| `gunzipBounded` | function | 1276 | `src/server/routes/adminRoutes.ts` |
| `readSystemBackupBody` | function | 1300 | `src/server/routes/adminRoutes.ts` |
| `limitConcurrency` | function | 1326 | `src/server/core/http.ts` |
| `documentReadingGate` | const | 1351 | `src/server/core/http.ts` |
| `requirePermission` | function | 1354 | `src/server/core/auth.ts` |
| `requireAnyPermission` | function | 1379 | `src/server/core/auth.ts` |
| `isScopeAllowed` | function | 1399 | `src/server/core/scope.ts` |
| `filterByScope` | function | 1455 | `src/server/core/scope.ts` |
| `legacyFDetail` | function | 1484 | `src/server/core/scope.ts` |
| `safeSystemUser` | function | 1494 | `src/server/core/scope.ts` |
| `captureScopeVersion` | function | 1513 | `src/server/core/versions.ts` |
| `recordVersionAfter` | function | 1525 | `src/server/core/versions.ts` |
| `confirmTokens` | function | 1538 | `src/server/core/versions.ts` |
| `scopeOverwriteRefusal` | function | 1548 | `src/server/core/versions.ts` |
| `replacementAction` | function | 1569 | `src/server/core/versions.ts` |
| `safeImportEvidence` | function | 1578 | `src/server/core/smartImport.ts` |
| `PdfImportReceipt` | type | 1599 | `src/server/core/smartImport.ts` |
| `signPdfImportReceipt` | function | 1600 | `src/server/routes/pdfImportRoutes.ts` |
| `verifyPdfImportReceipt` | function | 1606 | `src/server/routes/draftsRoutes.ts` |
| `DRAFT_DOCUMENT_MAX_BYTES` | const | 1620 | `src/server/routes/draftsRoutes.ts` |
| `safeDraftRows` | function | 1622 | `src/server/core/smartImport.ts` |
| `AUTHORITY_PDF_COMPARE_FIELDS` | const | 1668 | `src/server/core/authority.ts` |
| `authorityCourseCodeMap` | function | 1678 | `src/server/core/authority.ts` |
| `buildAuthorityPdfDiff` | function | 1683 | `src/server/core/authority.ts` |
| `inferAuthorityBranchCode` | function | 1883 | `src/server/core/authority.ts` |
| `branchOwnScopes` | function | 1896 | `src/server/core/smartImport.ts` |
| `placeholderInstructorIds` | function | 1917 | `src/server/core/smartImport.ts` |
| `approvalBlockerOptions` | function | 1926 | `src/server/core/smartImport.ts` |
| `blockingImportConflicts` | function | 1934 | `src/server/core/smartImport.ts` |
| `collegeFallbackInstructorIds` | function | 1956 | `src/server/core/smartImport.ts` |
| `visitingToFacultyPlan` | function | 1975 | `src/server/core/smartImport.ts` |
| `departmentInstructorIdSet` | function | 1993 | `src/server/core/smartImport.ts` |
| `validateSmartRows` | function | 2022 | `src/server/core/smartImport.ts` |
| `mapSmartIssuesToRows` | function | 2133 | `src/server/core/smartImport.ts` |
| `smartContextFrom` | function | 2155 | `src/server/core/smartImport.ts` |
| `resolveSmartContext` | function | 2176 | `src/server/core/smartImport.ts` |
| `breathe` | const | 2212 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `intelligenceReadScopes` | function | 2215 | `src/server/core/scope.ts` |
| `scopedScheduleUniverse` | function | 2222 | `src/server/core/scope.ts` |
| `clientScopeDetails` | function | 2233 | `src/server/routes/authRoutes.ts` |
| `demoSessionPayload` | function | 2302 | `src/server/routes/authRoutes.ts` |
| `readDemoIdentity` | function | 2314 | `src/server/routes/authRoutes.ts` |
| `DEMO_STORY_SCOPE` | const | 2338 | `src/server/core/demo.ts` |
| `demoSeedJobs` | const | 2339 | `src/server/routes/authRoutes.ts` |
| `demoSeedStatus` | const | 2340 | `src/server/routes/authRoutes.ts` |
| `scheduleDemoExtras` | function | 2346 | `src/server/routes/authRoutes.ts` |
| `seedDemoTeacherCourses` | function | 2375 | `src/server/routes/authRoutes.ts` |
| `seedDemoAvailableCourses` | function | 2416 | `src/server/routes/authRoutes.ts` |
| `seedDemoStories` | function | 2472 | `src/server/routes/authRoutes.ts` |
| `roleDescriptor` | function | 2794 | `src/server/routes/authRoutes.ts` |
| `demoTeacherRequest` | function | 2878 | `src/server/core/demo.ts` |
| `PRESENCE_DAYS` | const | 2928 | `src/server/routes/authRoutes.ts` |
| `cleanMarkPart` | const | 2929 | `src/server/routes/authRoutes.ts` |
| `TEXT_LIMIT` | const | 3305 | `src/server/core/input.ts` |
| `cleanText` | function | 3309 | `src/server/core/input.ts` |
| `boundedInt` | function | 3318 | `src/server/core/input.ts` |
| `boundedDecimal` | function | 3327 | `src/server/routes/coursesRoutes.ts` |
| `COURSE_LIMIT` | const | 3339 | `src/server/routes/coursesRoutes.ts` |
| `courseNumberIssue` | function | 3342 | `src/server/routes/coursesRoutes.ts` |
| `collegeMobilityHistoryCache` | const | 3412 | `src/server/routes/referenceRoutes.ts` |
| `teachingLoadHoursForTerm` | function | 3482 | `src/server/routes/referenceRoutes.ts` |
| `scopedTermsCache` | const | 3605 | `src/server/routes/referenceRoutes.ts` |
| `instructorsForReader` | function | 3696 | `src/server/core/scope.ts` |
| `instructorCircleCache` | const | 3714 | `src/server/routes/instructorsRoutes.ts` |
| `instructorCircleFor` | function | 3715 | `src/server/routes/instructorsRoutes.ts` |
| `maskCivilTail` | function | 3742 | `src/server/routes/instructorsRoutes.ts` |
| `instructorsForScope` | function | 3748 | `src/server/routes/instructorsRoutes.ts` |
| `courseNameCollator` | const | 3978 | `src/server/core/ordering.ts` |
| `sortCoursesByName` | const | 3979 | `src/server/core/ordering.ts` |
| `curriculumOverview` | function | 4125 | `src/server/routes/coursesRoutes.ts` |
| `curriculumArchiveReadiness` | function | 4265 | `src/server/routes/coursesRoutes.ts` |
| `committeeCatalogEditAllowed` | function | 4314 | `src/server/routes/coursesRoutes.ts` |
| `refuseCommitteeCatalogEdit` | function | 4325 | `src/server/routes/coursesRoutes.ts` |
| `SCHEDULE_DAY_KEYS` | const | 4590 | `src/server/core/scheduleRules.ts` |
| `scheduleOverlap` | const | 4607 | `src/server/core/scheduleRules.ts` |
| `sectionScheduleWindowCache` | const | 4609 | `src/server/core/scheduleRules.ts` |
| `sectionScheduleWindow` | function | 4610 | `src/server/core/scheduleRules.ts` |
| `mixedPatternNotice` | function | 4620 | `src/server/core/scheduleRules.ts` |
| `scheduleLengthIssue` | function | 4631 | `src/server/core/scheduleRules.ts` |
| `scheduleLengthNotice` | function | 4650 | `src/server/routes/scheduleReviewRoutes.ts` |
| `schedulePayloadIssues` | function | 4657 | `src/server/core/scheduleRules.ts` |
| `roomOwnership` | function | 4673 | `src/server/core/scheduleRules.ts` |
| `roomScopeNotice` | function | 4702 | `src/server/core/scheduleConflicts.ts` |
| `HALL_BARTER_MIN_WINDOW_MINUTES` | const | 4719 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_MAX_OPPORTUNITIES` | const | 4720 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_DAY_LABEL` | const | 4721 | `src/server/core/hallBarter.ts` |
| `HALL_BARTER_STALE_DAYS` | const | 4724 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_STALE_REASON` | const | 4725 | `src/server/routes/hallBarterRoutes.ts` |
| `sweepStaleHallBarter` | function | 4727 | `src/server/routes/hallBarterRoutes.ts` |
| `HallCampusGender` | type | 4739 | `src/server/routes/hallBarterRoutes.ts` |
| `hallCampusGender` | function | 4740 | `src/server/routes/hallBarterRoutes.ts` |
| `sameHallCampusGender` | function | 4750 | `src/server/routes/hallBarterRoutes.ts` |
| `hallBarterSerial` | let | 4757 | `src/server/core/state.ts` |
| `hallBarterBoardCache` | const | 4758 | `src/server/core/hallBarter.ts` |
| `academicStartYear` | function | 4760 | `src/server/core/hallBarter.ts` |
| `recentTenYearTermIds` | function | 4764 | `src/server/routes/intelligenceRoutes.ts` |
| `rowOccupiesWindow` | function | 4773 | `src/server/routes/hallBarterRoutes.ts` |
| `barterRequestRoomKey` | function | 4793 | `src/server/core/hallBarter.ts` |
| `barterRequestMatchesRow` | function | 4796 | `src/server/core/hallBarter.ts` |
| `barterRequestOverlaps` | function | 4797 | `src/server/routes/hallBarterRoutes.ts` |
| `hallBarterAllowsRoomUse` | function | 4802 | `src/server/core/hallBarter.ts` |
| `hallBarterRequestShape` | function | 4811 | `src/server/routes/hallBarterRoutes.ts` |
| `buildHallBarterBoard` | function | 4829 | `src/server/routes/hallBarterRoutes.ts` |
| `normalizedBuilding` | function | 5062 | `src/server/core/scheduleRules.ts` |
| `travelPairKey` | function | 5063 | `src/server/core/scheduleRules.ts` |
| `travelMinutesFor` | function | 5064 | `src/server/core/scheduleRules.ts` |
| `rowsOverlapOnDay` | function | 5074 | `src/server/routes/intelligenceRoutes.ts` |
| `spatialBurnoutAnalysis` | function | 5075 | `src/server/routes/intelligenceRoutes.ts` |
| `roomIsFreeForRow` | function | 5101 | `src/server/routes/intelligenceRoutes.ts` |
| `roomCastlingProposals` | function | 5109 | `src/server/routes/intelligenceRoutes.ts` |
| `CAMPUS_LABEL` | const | 5140 | `src/server/core/scheduleConflicts.ts` |
| `interCampusWarnings` | function | 5150 | `src/server/core/scheduleConflicts.ts` |
| `describeScheduleChange` | function | 5194 | `src/server/core/scheduleRules.ts` |
| `DepartmentStyle` | interface | 5227 | `src/server/core/rhythm.ts` |
| `NO_COHORT` | const | 5235 | `src/server/core/rhythm.ts` |
| `rhythmCache` | const | 5236 | `src/server/core/rhythm.ts` |
| `rhythmRefreshing` | const | 5237 | `src/server/core/rhythm.ts` |
| `RHYTHM_STALE_MS` | const | 5243 | `src/server/core/rhythm.ts` |
| `styleOf` | const | 5244 | `src/server/core/rhythm.ts` |
| `departmentStyle` | function | 5246 | `src/server/core/rhythm.ts` |
| `readDepartmentStyle` | function | 5263 | `src/server/core/rhythm.ts` |
| `scheduleConflicts` | function | 5321 | `src/server/core/scheduleConflicts.ts` |
| `applyRequestHoldOverride` | function | 5543 | `src/server/core/scheduleConflicts.ts` |
| `noteRequestHoldOverride` | function | 5561 | `src/server/core/scheduleConflicts.ts` |
| `requestHoldRefusal` | function | 5580 | `src/server/core/scheduleConflicts.ts` |
| `PresenceMark` | interface | 5618 | `src/server/core/liveChannel.ts` |
| `ScheduleEventClient` | interface | 5627 | `src/server/core/liveChannel.ts` |
| `scheduleEventClients` | const | 5644 | `src/server/core/liveChannel.ts` |
| `scheduleEventTimer` | let | 5645 | `src/server/core/liveChannel.ts` |
| `scheduleEventSerial` | let | 5646 | `src/server/core/liveChannel.ts` |
| `scheduleChangeClock` | const | 5649 | `src/server/core/liveChannel.ts` |
| `notifyClock` | const | 5650 | `src/server/core/liveChannel.ts` |
| `broadcastScheduleChange` | function | 5652 | `src/server/core/liveChannel.ts` |
| `broadcastNotify` | function | 5672 | `src/server/core/liveChannel.ts` |
| `for (const prefix of ["/api/approvals", "/api/schedule-notes", "/api/i` | جملة | 5681 | `server.ts` |
| `broadcastStudentNotifySoon` | const | 5692 | `src/server/core/liveChannel.ts` |
| `app.use("/api/student-registration", (req: Request, res: Response, nex` | app | 5693 | `server.ts` |
| `PRESENCE_STALE_MS` | const | 5707 | `src/server/core/liveChannel.ts` |
| `PRESENCE_GONE_MS` | const | 5708 | `src/server/core/liveChannel.ts` |
| `presenceDirty` | const | 5709 | `src/server/core/liveChannel.ts` |
| `presenceFlushTimer` | let | 5710 | `src/server/core/liveChannel.ts` |
| `emptyMark` | const | 5712 | `src/server/core/liveChannel.ts` |
| `boardScopeKey` | const | 5713 | `src/server/core/liveChannel.ts` |
| `hasMark` | const | 5714 | `src/server/core/liveChannel.ts` |
| `presenceRoster` | function | 5724 | `src/server/core/liveChannel.ts` |
| `broadcastPresence` | function | 5744 | `src/server/core/liveChannel.ts` |
| `markPresenceDirty` | function | 5757 | `src/server/core/liveChannel.ts` |
| `setInterval(() => {` | جملة | 5775 | `src/server/core/liveChannel.ts` |
| `pendingScheduleSessions` | const | 5793 | `src/server/core/liveChannel.ts` |
| `onSchedulesInvalidated(() => {` | جملة | 5794 | `src/server/core/liveChannel.ts` |
| `stopScheduleBeacon` | let | 5818 | `src/server/core/liveChannel.ts` |
| `listenForScheduleChangesAcrossInstances` | function | 5819 | `src/server/core/liveChannel.ts` |
| `pulseClients` | const | 5905 | `src/server/routes/scheduleLiveRoutes.ts` |
| `readLiveVisitingRoster` | function | 5949 | `src/server/core/visiting.ts` |
| `readVisitingStatus` | function | 5969 | `src/server/core/visiting.ts` |
| `visitingChecker` | function | 5990 | `src/server/core/visiting.ts` |
| `readsFinalSchedulesOnly` | function | 6090 | `src/server/core/scheduleReads.ts` |
| `termEndedForReading` | function | 6098 | `src/server/core/scheduleReads.ts` |
| `finalRowsWithFinality` | function | 6103 | `src/server/core/scheduleReads.ts` |
| `finalRowsOnly` | function | 6124 | `src/server/core/scheduleReads.ts` |
| `readSchedulesForRequest` | function | 6132 | `src/server/core/scheduleReads.ts` |
| `scopeSectionIdsFor` | function | 6148 | `src/server/core/scheduleReads.ts` |
| `readScopedTermRows` | function | 6153 | `src/server/routes/dashboardRoutes.ts` |
| `readLiveSchedulesForRequest` | function | 6175 | `src/server/core/scheduleReads.ts` |
| `checkLengthIssue` | function | 6451 | `src/server/routes/scheduleReviewRoutes.ts` |
| `checkLocationIssues` | function | 6463 | `src/server/routes/scheduleReviewRoutes.ts` |
| `previewNaturalLanguageMove` | function | 6758 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `executeGeminiScheduleCalls` | function | 6813 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `dropStaleHallIdentity` | function | 6899 | `src/server/routes/scheduleReviewRoutes.ts` |
| `movedRowsCollisions` | function | 6911 | `src/server/routes/scheduleReviewRoutes.ts` |
| `hallTextChangedWithoutIdentity` | function | 6924 | `src/server/routes/scheduleReviewRoutes.ts` |
| `wholeCollegeSectionIds` | function | 7300 | `src/server/routes/reportsRoutes.ts` |
| `visitingLookupFor` | function | 7319 | `src/server/routes/instructorsRoutes.ts` |
| `locationIdList` | const | 7870 | `src/server/routes/locationsRoutes.ts` |
| `locationAliases` | const | 7871 | `src/server/routes/locationsRoutes.ts` |
| `officialBuildingCollegeIds` | const | 7872 | `src/server/routes/locationsRoutes.ts` |
| `taConversionState` | function | 8124 | `src/server/routes/scheduleToolsRoutes.ts` |
| `WEEK_EXCEPTION_DATE` | const | 8634 | `src/server/routes/schedulesRoutes.ts` |
| `weekExceptionDayKey` | function | 8636 | `src/server/core/scheduleRules.ts` |
| `readScheduleForException` | function | 8643 | `src/server/routes/schedulesRoutes.ts` |
| `meetingExcludedIds` | function | 8841 | `src/server/core/scheduleRules.ts` |
| `requireMeetingAccess` | const | 8855 | `src/server/routes/scheduleToolsRoutes.ts` |
| `meetingDepartmentPeople` | function | 8862 | `src/server/routes/scheduleToolsRoutes.ts` |
| `SCHEDULE_ORIGIN_KINDS` | const | 8929 | `src/server/core/scheduleWrites.ts` |
| `scheduleOriginOf` | function | 8930 | `src/server/core/scheduleWrites.ts` |
| `companionBookingFor` | function | 8945 | `src/server/core/scheduleWrites.ts` |
| `createScheduleHandler` | const | 8963 | `src/server/core/scheduleWrites.ts` |
| `updateScheduleHandler` | const | 9089 | `src/server/core/scheduleWrites.ts` |
| `deleteScheduleHandler` | const | 9281 | `src/server/core/scheduleWrites.ts` |
| `InnerScheduleResult` | interface | 9338 | `src/server/core/scheduleWrites.ts` |
| `runScheduleHandler` | function | 9340 | `src/server/core/scheduleWrites.ts` |
| `PROPOSAL_ORIGIN_LABEL` | const | 9366 | `src/server/core/scheduleWrites.ts` |
| `PROPOSAL_DAYS` | const | 9369 | `src/server/core/scheduleWrites.ts` |
| `dayFlagsOf` | const | 9370 | `src/server/core/scheduleWrites.ts` |
| `dayOfRow` | const | 9371 | `src/server/core/scheduleWrites.ts` |
| `dayLabelOf` | const | 9372 | `src/server/core/scheduleWrites.ts` |
| `editBodyFor` | function | 9375 | `src/server/core/scheduleWrites.ts` |
| `ProposalOutcome` | interface | 9389 | `src/server/core/scheduleWrites.ts` |
| `applyProposalCore` | function | 9391 | `src/server/core/scheduleWrites.ts` |
| `wipeScopeState` | function | 9570 | `src/server/routes/schedulesRoutes.ts` |
| `wipeScopeOf` | const | 9599 | `src/server/routes/schedulesRoutes.ts` |
| `GuideIntentPayload` | type | 9729 | `src/server/routes/guideRoutes.ts` |
| `deterministicGuideIntent` | function | 9740 | `src/server/routes/guideRoutes.ts` |
| `serverCanExposeGuideFeature` | function | 9760 | `src/server/routes/guideRoutes.ts` |
| `requestGuideAIIntent` | function | 9771 | `src/server/routes/guideRoutes.ts` |
| `GeminiPart` | type | 9826 | `src/server/core/gemini.ts` |
| `geminiOutputText` | function | 9828 | `src/server/core/gemini.ts` |
| `geminiFunctionCalls` | function | 9836 | `src/server/core/gemini.ts` |
| `requestGeminiScheduleLayer` | function | 9844 | `src/server/core/gemini.ts` |
| `emptyScopeGuidance` | function | 10243 | `src/server/routes/intelligenceRoutes.ts` |
| `authorityBaselineForScope` | function | 11695 | `src/server/core/authority.ts` |
| `authorityDraftForScope` | function | 11712 | `src/server/routes/reportsRoutes.ts` |
| `scheduleLockRefusal` | function | 11785 | `src/server/core/approvals.ts` |
| `registrarNotesInRound` | function | 11829 | `src/server/core/approvals.ts` |
| `termIsClosed` | function | 11836 | `src/server/core/approvals.ts` |
| `approvalTransaction` | function | 11854 | `src/server/routes/approvalsRoutes.ts` |
| `approvalScopeLabel` | function | 11879 | `src/server/routes/approvalsRoutes.ts` |
| `withEvent` | function | 11891 | `src/server/core/approvals.ts` |
| `noteScheduleMutation` | function | 11906 | `src/server/core/approvals.ts` |
| `ApprovalEventWriter` | type | 11955 | `src/server/core/approvals.ts` |
| `amendmentAfterEdit` | function | 11956 | `src/server/core/approvals.ts` |
| `settleAmendmentMarker` | function | 11976 | `src/server/core/approvals.ts` |
| `settlePendingAmendmentInLock` | function | 11985 | `src/server/routes/approvalsRoutes.ts` |
| `settlePendingAmendment` | function | 11995 | `src/server/routes/approvalsRoutes.ts` |
| `applyScheduleMutation` | function | 12003 | `src/server/core/approvals.ts` |
| `wholesaleRefusal` | function | 12065 | `src/server/core/approvals.ts` |
| `countBlockingConflicts` | function | 12081 | `src/server/core/approvals.ts` |
| `blockingConflictCount` | function | 12087 | `src/server/routes/reportsRoutes.ts` |
| `blockingSummaryFor` | function | 12097 | `src/server/routes/approvalsRoutes.ts` |
| `regulationNoticesForScope` | function | 12107 | `src/server/core/approvals.ts` |
| `regulationNoticeCount` | function | 12154 | `src/server/routes/approvalsRoutes.ts` |
| `readApproval` | function | 12159 | `src/server/core/approvals.ts` |
| `readDeadlineFor` | function | 12165 | `src/server/core/approvals.ts` |
| `approvalActor` | function | 12174 | `src/server/routes/approvalsRoutes.ts` |
| `approvalScopeFromBody` | function | 12183 | `src/server/routes/approvalsRoutes.ts` |
| `refuseIfTermClosed` | function | 12194 | `src/server/core/approvals.ts` |
| `refuseIfTermFrozen` | function | 12214 | `src/server/core/approvals.ts` |
| `refuseIfStale` | function | 12225 | `src/server/routes/approvalsRoutes.ts` |
| `scheduleDataReadiness` | function | 12233 | `src/server/routes/approvalsRoutes.ts` |
| `submitToRegistrar` | function | 12529 | `src/server/routes/approvalsRoutes.ts` |
| `EXTENSION_ACTIONS` | const | 12778 | `src/server/routes/approvalsRoutes.ts` |
| `EXTENSIONS_MAX_TARGETS` | const | 12779 | `src/server/routes/approvalsRoutes.ts` |
| `NOTE_FIELDS` | const | 12893 | `src/server/routes/scheduleNotesRoutes.ts` |
| `NOTE_FIELD_LABEL` | const | 12894 | `src/server/core/notes.ts` |
| `noteFieldValue` | function | 12906 | `src/server/core/notes.ts` |
| `noteState` | function | 12924 | `src/server/core/notes.ts` |
| `notesWithState` | function | 12941 | `src/server/core/notes.ts` |
| `noteSuggestions` | function | 12972 | `src/server/routes/reportsRoutes.ts` |
| `REGISTRAR_NOTIFY_ROLES` | const | 13216 | `src/server/routes/notificationsRoutes.ts` |
| `studentQueueMemo` | const | 13228 | `src/server/core/notifications.ts` |
| `studentQueueForTerm` | function | 13229 | `src/server/routes/notificationsRoutes.ts` |
| `bellBlockingMemo` | const | 13242 | `src/server/core/notifications.ts` |
| `onSchedulesInvalidated(() => bellBlockingMemo.invalidate());` | جملة | 13243 | `src/server/core/notifications.ts` |
| `bellBlockingCount` | function | 13244 | `src/server/routes/notificationsRoutes.ts` |
| `bellPlanningTermId` | function | 13252 | `src/server/core/notifications.ts` |
| `notificationItemsForTerm` | function | 13263 | `src/server/routes/notificationsRoutes.ts` |
| `approvalBadgeForTerm` | function | 13479 | `src/server/routes/approvalsRoutes.ts` |
| `hydrateVersionRows` | function | 14351 | `src/server/core/versions.ts` |
| `briefChangedSince` | function | 14362 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `rowSignatureServer` | function | 14370 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `livingResponseCache` | const | 14392 | `src/server/core/versions.ts` |
| `LIVING_RESPONSE_TTL_MS` | const | 14393 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `onSchedulesInvalidated(() => livingResponseCache.clear());` | جملة | 14394 | `src/server/core/versions.ts` |
| `driftCache` | const | 14544 | `src/server/core/rhythm.ts` |
| `historicalTimeCache` | const | 14545 | `src/server/core/rhythm.ts` |
| `driftSerial` | let | 14546 | `src/server/core/rhythm.ts` |
| `onSchedulesInvalidated(() => { driftSerial += 1; historicalTimeCache.c` | جملة | 14547 | `src/server/core/rhythm.ts` |
| `splitArchivedCourseRows` | function | 14749 | `src/server/core/scheduleReads.ts` |
| `applyRoleTemplate` | function | 15015 | `src/server/routes/usersRoutes.ts` |
| `applyRoleScopeOnly` | function | 15062 | `src/server/routes/usersRoutes.ts` |
| `sanitizeAssigns` | function | 15163 | `src/server/routes/usersRoutes.ts` |
| `departmentHeadPlan` | function | 15215 | `src/server/routes/usersRoutes.ts` |
| `advisorPlan` | function | 15223 | `src/server/routes/usersRoutes.ts` |
| `balanceScopeLabel` | function | 15801 | `src/server/routes/reportsRoutes.ts` |
| `SHARE_DAY_KEYS` | const | 15949 | `src/server/core/shareLinks.ts` |
| `SHARE_DAY_NAMES` | const | 15950 | `src/server/core/shareLinks.ts` |
| `SHARE_ICS_DAYS` | const | 15951 | `src/server/core/shareLinks.ts` |
| `SHARE_MAX_DAYS` | const | 15952 | `src/server/routes/shareRoutes.ts` |
| `shareDayIndexes` | function | 15954 | `src/server/core/shareLinks.ts` |
| `shareLinkStillReadable` | function | 15961 | `src/server/core/shareLinks.ts` |
| `resolveShareToken` | function | 15970 | `src/server/core/shareLinks.ts` |
| `PUBLIC_VISITING_BADGE_CSS` | const | 15983 | `src/server/routes/publicStaffRoutes.ts` |
| `buildSharePayload` | function | 15986 | `src/server/core/shareLinks.ts` |
| `publicAttempts` | const | 16043 | `src/server/core/shareLinks.ts` |
| `publicAttemptKey` | const | 16044 | `src/server/core/shareLinks.ts` |
| `publicAttemptReserve` | const | 16047 | `src/server/core/shareLinks.ts` |
| `staffLookupAllowed` | function | 16050 | `src/server/routes/surveyRoutes.ts` |
| `MovementEntry` | type | 16063 | `src/server/core/staffCard.ts` |
| `MOVEMENT_REJECT_REASON` | const | 16068 | `src/server/core/staffCard.ts` |
| `requestMovementEntries` | function | 16073 | `src/server/core/staffCard.ts` |
| `movementHistoryScopes` | function | 16108 | `src/server/core/staffCard.ts` |
| `scheduleMovementEntries` | function | 16116 | `src/server/core/staffCard.ts` |
| `buildStaffCard` | function | 16162 | `src/server/routes/publicStaffRoutes.ts` |
| `staffFamilyScopes` | function | 16425 | `src/server/core/staffCard.ts` |
| `staffFamilyShareLinks` | function | 16428 | `src/server/core/staffCard.ts` |
| `liveStaffPublication` | const | 16433 | `src/server/core/staffCard.ts` |
| `shareLinkLabel` | function | 16456 | `src/server/core/shareLinks.ts` |
| `isPersonalStaffLink` | const | 16585 | `src/server/routes/shareRoutes.ts` |
| `personalLinkEligibleIds` | function | 16587 | `src/server/routes/shareRoutes.ts` |
| `staffLinkFamilyAllowed` | const | 16601 | `src/server/routes/shareRoutes.ts` |
| `readSectionBuild` | function | 16823 | `src/server/routes/planningRoutes.ts` |
| `authorityDepartmentKeyOf` | function | 17093 | `src/server/routes/planningRoutes.ts` |
| `REMAINING_SEASONS` | const | 17105 | `src/server/core/planning.ts` |
| `REMAINING_SEASON_NAMES` | const | 17106 | `src/server/routes/planningRoutes.ts` |
| `remainingContext` | function | 17107 | `src/server/routes/planningRoutes.ts` |
| `remainingTermRefusal` | function | 17123 | `src/server/routes/planningRoutes.ts` |
| `reportTermLabelOf` | function | 17136 | `src/server/routes/planningRoutes.ts` |
| `remainingWarnings` | function | 17140 | `src/server/routes/planningRoutes.ts` |
| `remainingAssessment` | function | 17145 | `src/server/routes/planningRoutes.ts` |
| `TERM_WEEKS` | const | 17247 | `src/server/routes/publicCalendarRoutes.ts` |
| `sendCalendar` | function | 17258 | `src/server/routes/publicCalendarRoutes.ts` |
| `calendarSecret` | const | 17337 | `src/server/core/shareLinks.ts` |
| `calendarKey` | const | 17339 | `src/server/core/shareLinks.ts` |
| `holdsLiveCardLink` | function | 17377 | `src/server/routes/publicCalendarRoutes.ts` |
| `stableCalendarPath` | const | 17387 | `src/server/core/shareLinks.ts` |
| `sendInstructorCalendar` | function | 17408 | `src/server/routes/publicCalendarRoutes.ts` |
| `STAFF_NOTES_PER_DAY` | const | 17499 | `src/server/routes/publicStaffRoutes.ts` |
| `studentCaseSecretPromise` | let | 17593 | `src/server/core/studentIdentity.ts` |
| `studentCaseSecret` | const | 17594 | `src/server/core/studentIdentity.ts` |
| `surveyFingerprint` | const | 17595 | `src/server/core/studentIdentity.ts` |
| `studentIdentityKey` | const | 17598 | `src/server/core/studentIdentity.ts` |
| `sealStudentIdentity` | const | 17599 | `src/server/core/studentIdentity.ts` |
| `openStudentIdentity` | const | 17604 | `src/server/core/studentIdentity.ts` |
| `canSeeStudentIdentity` | const | 17626 | `src/server/core/studentIdentity.ts` |
| `studentIdentityFor` | const | 17627 | `src/server/core/studentIdentity.ts` |
| `degreeRuleFromName` | const | 17635 | `src/server/core/studentIdentity.ts` |
| `degreeRuleForSection` | const | 17649 | `src/server/core/studentIdentity.ts` |
| `storedDegreeRuleForSection` | const | 17663 | `src/server/core/studentIdentity.ts` |
| `planDegreeRule` | const | 17678 | `src/server/core/studentIdentity.ts` |
| `graduationCandidatesForSection` | const | 17694 | `src/server/core/studentIdentity.ts` |
| `graduationRuleFor` | const | 17704 | `src/server/core/studentIdentity.ts` |
| `isSummerTerm` | const | 17718 | `src/server/core/studentIdentity.ts` |
| `graduateThreshold` | const | 17719 | `src/server/core/studentIdentity.ts` |
| `STUDENT_PROOF_TTL_MS` | const | 17722 | `src/server/core/studentIdentity.ts` |
| `issueStudentProof` | const | 17723 | `src/server/core/studentIdentity.ts` |
| `studentProofExpired` | const | 17729 | `src/server/core/studentIdentity.ts` |
| `verifyStudentProof` | const | 17732 | `src/server/core/studentIdentity.ts` |
| `normalizeCaseRef` | const | 17745 | `src/server/routes/surveyRoutes.ts` |
| `priorNeedForHand` | const | 17747 | `src/server/routes/surveyRoutes.ts` |
| `caseRefMatches` | const | 17755 | `src/server/routes/surveyRoutes.ts` |
| `maskedInitial` | const | 17757 | `src/server/routes/surveyRoutes.ts` |
| `CASE_REF_REQUIRED` | const | 17758 | `src/server/routes/surveyRoutes.ts` |
| `reusableGraduateVerification` | const | 17766 | `src/server/routes/surveyRoutes.ts` |
| `normalizeStudentIdentityName` | const | 17797 | `src/server/routes/surveyRoutes.ts` |
| `reusableStudentIdentity` | const | 17804 | `src/server/routes/surveyRoutes.ts` |
| `asciiDigits` | const | 17821 | `src/server/core/studentIdentity.ts` |
| `surveyCohort` | const | 17823 | `src/server/core/studentIdentity.ts` |
| `surveyActiveCourseIds` | const | 17838 | `src/server/core/studentIdentity.ts` |
| `surveyCourseIdsForSection` | function | 17840 | `src/server/routes/surveyRoutes.ts` |
| `surveyTermEnded` | const | 17904 | `src/server/core/studentIdentity.ts` |
| `SURVEY_TERM_ENDED` | const | 17905 | `src/server/routes/surveyRoutes.ts` |
| `surveyPayloadCache` | const | 17911 | `src/server/core/studentIdentity.ts` |
| `SURVEY_PAYLOAD_TTL_MS` | const | 17912 | `src/server/routes/surveyRoutes.ts` |
| `STUDENT_PROOF_MAX_BYTES` | const | 18044 | `src/server/routes/surveyRoutes.ts` |
| `STUDENT_PROOF_TOO_LARGE` | const | 18045 | `src/server/routes/surveyRoutes.ts` |
| `studentProofBody` | const | 18046 | `src/server/routes/surveyRoutes.ts` |
| `readStudentProofBody` | const | 18047 | `src/server/routes/surveyRoutes.ts` |
| `GraduateProofSink` | type | 18055 | `src/server/core/studentIdentity.ts` |
| `graduateProofCore` | function | 18056 | `src/server/core/studentIdentity.ts` |
| `graduateSubmitCheck` | function | 18160 | `src/server/core/studentIdentity.ts` |
| `curriculumLabelsFor` | const | 18326 | `src/server/core/planning.ts` |
| `sectionGapCache` | const | 18345 | `src/server/routes/notificationsRoutes.ts` |
| `cachedSectionGap` | function | 18346 | `src/server/routes/notificationsRoutes.ts` |
| `sectionGapData` | function | 18354 | `src/server/core/planning.ts` |
| `sectionGapStaffing` | function | 18452 | `src/server/routes/planningRoutes.ts` |
| `canWriteRegistration` | const | 18758 | `src/server/routes/studentRegistrationRoutes.ts` |
| `grantedPermissions` | const | 18767 | `src/server/routes/studentRegistrationRoutes.ts` |
| `owningSectionsInScopeFor` | const | 18778 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_COURSE_STATES` | const | 18785 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_REJECT_REASONS` | const | 18786 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_COMMITTEE_REASONS` | const | 18787 | `src/server/routes/studentRegistrationRoutes.ts` |
| `RegistrationViewer` | type | 18798 | `src/server/routes/studentRegistrationRoutes.ts` |
| `registrationViewer` | const | 18799 | `src/server/routes/studentRegistrationRoutes.ts` |
| `reachedRegistration` | const | 18802 | `src/server/routes/studentRegistrationRoutes.ts` |
| `registrarBlockReason` | function | 18822 | `src/server/routes/studentRegistrationRoutes.ts` |
| `demoPageHint` | function | 19340 | `src/server/core/publicPages.ts` |
| `publicPageNonce` | function | 19382 | `src/server/core/publicPages.ts` |
| `staffCardPage` | function | 19407 | `src/server/pages/staffCardPage.ts` |
| `surveyPage` | function | 19979 | `src/server/pages/surveyPages.ts` |
| `studentCaseSurveyPage` | function | 20313 | `src/server/pages/surveyPages.ts` |
| `REQUEST_LINK_DAYS` | const | 20414 | `src/server/core/instructorRequests.ts` |
| `requestWindowOpen` | const | 20417 | `src/server/core/instructorRequests.ts` |
| `currentInstructorRequestGeneration` | function | 20420 | `src/server/core/instructorRequests.ts` |
| `requireCurrentInstructorRequestGeneration` | function | 20434 | `src/server/routes/instructorRequestsRoutes.ts` |
| `requestItemScope` | function | 20442 | `src/server/core/instructorRequests.ts` |
| `requestForDepartment` | function | 20457 | `src/server/routes/instructorRequestsRoutes.ts` |
| `stripForInstructor` | function | 20474 | `src/server/routes/publicRequestRoutes.ts` |
| `courseHabitMemo` | const | 20517 | `src/server/core/instructorRequests.ts` |
| `onSchedulesInvalidated(() => courseHabitMemo.clear());` | جملة | 20518 | `src/server/core/instructorRequests.ts` |
| `courseHabit` | function | 20520 | `src/server/core/instructorRequests.ts` |
| `habitBlockFor` | const | 20536 | `src/server/routes/publicRequestRoutes.ts` |
| `blockMinutesOfItem` | function | 20539 | `src/server/routes/publicRequestRoutes.ts` |
| `decisionStillApplies` | function | 20552 | `src/server/routes/publicRequestRoutes.ts` |
| `priorAddFor` | function | 20563 | `src/server/routes/publicRequestRoutes.ts` |
| `requestSlotsForCourse` | function | 20578 | `src/server/routes/publicRequestRoutes.ts` |
| `instructorRequestItemsFromPayload` | function | 20590 | `src/server/routes/publicRequestRoutes.ts` |
| `resolveRequestLink` | function | 20711 | `src/server/core/instructorRequests.ts` |
| `instructorRequestSectionCourses` | function | 20737 | `src/server/core/instructorRequests.ts` |
| `refreshUnsubmittedInstructorRequest` | function | 20757 | `src/server/routes/publicRequestRoutes.ts` |
| `InstructorRequestCourseOption` | type | 20787 | `src/server/routes/publicRequestRoutes.ts` |
| `instructorRequestDepartmentScopes` | function | 20804 | `src/server/core/instructorRequests.ts` |
| `instructorRequestCourseOptions` | function | 20832 | `src/server/routes/publicRequestRoutes.ts` |
| `originalOffering` | function | 20863 | `src/server/routes/publicRequestRoutes.ts` |
| `availableInstructorOfferings` | function | 20868 | `src/server/routes/publicRequestRoutes.ts` |
| `requestReservationProposals` | function | 20907 | `src/server/routes/publicRequestRoutes.ts` |
| `buildRequestContext` | function | 20926 | `src/server/core/instructorRequests.ts` |
| `buildSharedRequestContext` | function | 20934 | `src/server/core/instructorRequests.ts` |
| `SharedRequestContext` | type | 20967 | `src/server/core/instructorRequests.ts` |
| `requestContextFor` | function | 20969 | `src/server/core/instructorRequests.ts` |
| `requestRulesForScope` | function | 20985 | `src/server/core/instructorRequests.ts` |
| `roomUsageMemo` | const | 21050 | `src/server/core/instructorRequests.ts` |
| `roomUsageOf` | function | 21051 | `src/server/core/instructorRequests.ts` |
| `rulesInflight` | const | 21063 | `src/server/core/instructorRequests.ts` |
| `rulesOnce` | function | 21064 | `src/server/core/instructorRequests.ts` |
| `judgeRequestItems` | function | 21072 | `src/server/core/instructorRequests.ts` |
| `requireInstructorRequestRevision` | function | 21682 | `src/server/core/instructorRequests.ts` |
| `instructorRequestItemIdentity` | function | 21694 | `src/server/core/instructorRequests.ts` |
| `ApplyOp` | type | 21856 | `src/server/routes/instructorRequestsRoutes.ts` |
| `daysFlags` | const | 21861 | `src/server/routes/instructorRequestsRoutes.ts` |
| `rowBodyOf` | const | 21862 | `src/server/routes/instructorRequestsRoutes.ts` |
| `requestDayPatterns` | function | 22288 | `src/server/routes/publicRequestRoutes.ts` |
| `verifyRequestSigner` | function | 22306 | `src/server/core/instructorRequests.ts` |
| `instructorRequestPage` | function | 22675 | `src/server/pages/instructorRequestPage.ts` |
| `previousTermMemo` | const | 23846 | `src/server/routes/publicRequestRoutes.ts` |
| `cardStreams` | const | 23899 | `src/server/routes/publicRequestRoutes.ts` |
| `cardStreamTotal` | let | 23900 | `src/server/routes/publicRequestRoutes.ts` |
| `CARD_STREAMS_PER_REQUEST` | const | 23901 | `src/server/routes/publicRequestRoutes.ts` |
| `CARD_STREAMS_TOTAL` | const | 23902 | `src/server/routes/publicRequestRoutes.ts` |
| `Repository.onInstructorRequestSaved(info => {` | جملة | 23903 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitCheckTimes` | const | 23948 | `src/server/routes/publicRequestRoutes.ts` |
| `REQUEST_HOLD_TTL_MS` | const | 24021 | `src/server/routes/publicRequestRoutes.ts` |
| `registerStudyProposalRoutes(app, {` | جملة | 24087 | `server.ts` |
| `publicInvalidLinkPage` | function | 24112 | `src/server/pages/publicInvalidLinkPage.ts` |
| `offeringViewsFor` | function | 24133 | `src/server/routes/publicRequestRoutes.ts` |
| `coursesWithOffering` | function | 24152 | `src/server/routes/publicRequestRoutes.ts` |
| `taPhaseId` | const | 24163 | `src/server/core/instructorRequests.ts` |
| `taPhaseForRequest` | function | 24166 | `src/server/routes/publicRequestRoutes.ts` |
| `sendTaWave` | function | 24306 | `src/server/routes/offeringRoutes.ts` |
| `dispatchTaWaves` | function | 24336 | `src/server/routes/offeringRoutes.ts` |
| `setInterval(() => {` | جملة | 24441 | `src/server/routes/offeringRoutes.ts` |
| `seatConfigId` | const | 24446 | `src/server/routes/offeringRoutes.ts` |
| `seatSections` | function | 24448 | `src/server/routes/offeringRoutes.ts` |
| `rateLimitVerifySignature` | const | 24548 | `src/server/routes/verifyRoutes.ts` |
| `SURVEY_STATUS_GRACE_MS` | const | 24654 | `src/server/routes/surveyRoutes.ts` |
| `resolveSurveyStatusToken` | function | 24655 | `src/server/routes/surveyRoutes.ts` |
| `studentCaseStatusPage` | function | 24768 | `src/server/pages/studentCaseStatusPage.ts` |
| `registerPlanReviewRoutes(app, {` | جملة | 24926 | `server.ts` |
| `planSheetTemplate` | let | 24937 | `server.ts` |
| `for (const candidate of [path.join(process.cwd(), "public", "plans", "` | جملة | 24938 | `server.ts` |
| `{` | جملة | 24941 | `server.ts` |
| `registerAdsRoutes(app, { requireAuth, requireRootAdmin, publicPageNonc` | جملة | 24952 | `server.ts` |
| `registerSimulationRoutes(app, {` | جملة | 24955 | `server.ts` |
| `registerInsightRoutes(app, {` | جملة | 24962 | `server.ts` |
| `registerTimeMachineRoutes(app, {` | جملة | 24969 | `server.ts` |
| `registerStudentShowcase(app, { identityKey: studentIdentityKey, sealId` | جملة | 25047 | `server.ts` |
| `registerStudentDoorRoutes(app, {` | جملة | 25048 | `server.ts` |
| `STUDENT_QR_DAYS` | const | 25088 | `src/server/routes/shareRoutes.ts` |
| `studentSchedulePage` | function | 25090 | `src/server/pages/studentSchedulePage.ts` |
| `migrateLegacyAccountsToCommitteeRole` | function | 25776 | `server.ts` |
| `SCHEDULE_WORKSPACE_FORM_ID` | const | 25803 | `server.ts` |
| `reconcileDepartmentHeadPermissions` | function | 25804 | `server.ts` |
| `startServer` | function | 25821 | `server.ts` |
| `startServer().catch(error => {` | جملة | 26063 | `server.ts` |
