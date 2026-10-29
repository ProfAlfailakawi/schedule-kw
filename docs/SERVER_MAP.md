# خريطةُ الخادم

> مولَّدةٌ بـ `node scripts/split-server/split.mjs` — لا تُحرَّر باليد؛ تُعاد مع كل تشغيل.

المرحلة: `routes`. حجمُ `server.ts` بعد التقسيم: 929 سطراً (كان 26188).

## البنية

- `server.ts` — جذرُ التركيب: إنشاءُ `app`، الوسائطُ العامة بترتيبها، استدعاءاتُ `register*` بالترتيب الذي يحفظ أسبقيةَ الطرق المتلاقية، و`startServer`.
- `src/server/core/` — المساعداتُ المشتركة والوسائطُ والحالة. `core/boot.ts` أولُ ما يستورده `server.ts`: يحمّل الوحداتِ الأصلية بترتيبها القديم ثم يستدعي `configureRuntimeEnvironment()` قبل أن تُحمَّل أيُّ وحدةٍ مقسومة. `core/state.ts` يجمع متغيّراتِ `let` التي تُكتب من أكثر من وحدة (`state.x`).
- `src/server/pages/` — بُناةُ الصفحات العامة بأنماطها وسكربتاتها.
- `src/server/routes/` — `registerXRoutes(app)`: طرقُ كل مجالٍ بترتيبها الأصلي، ومساعداتُها التي لا يستعملها غيرُها.

الوحداتُ المقسومة تستورد ما تحتاجه من `core/` مباشرة؛ فلا `deps` في دوال التسجيل الجديدة (كانت `deps` في الوحدات القديمة لأن ما تحتاجه كان حبيسَ `server.ts`). ولا وحدةَ تستورد `server.ts` (يتحقق منه `test:server-parity`).

نصُّ كل جملةٍ منقولٌ بالبايت مع تعليقاته؛ لا يُمسّ إلا بإضافة `export` وبـ`state.x`. والطرقُ داخل دوال التسجيل بلا إزاحة: إزاحةُ سطرٍ داخل قالبٍ نصّيّ تغيّر ما يُرسَل.

## إعادةُ التقسيم على main أحدث

```sh
# فرعُ التقسيم ما زال مفتوحاً وتقدّم main: دمجٌ (لا rebase)، وserver.ts من main كما هو
git fetch origin && git merge --no-commit origin/main
git show origin/main:server.ts > server.ts                # لا يُحلّ تعارضٌ في الكود المنقول باليد
git checkout --theirs -- <اختبارٌ متعارض>                  # ثم تعيد الأداةُ توجيهَه إلى readServerSource()
npx tsx tests/server-route-parity-audit.ts --update        # ١) لقطتا الموجّه والصفحات من server.ts غير المقسوم ← commit
cp server.ts /tmp/server.orig.ts
node scripts/split-server/split.mjs --plan                 # تقرير: مساراتٌ بلا قاعدة، أحجام، دوالُ تسجيلٍ مقسومة
node scripts/split-server/split.mjs --write --phase routes --source /tmp/server.orig.ts  # (أو pages ثم helpers ثم routes، commit لكلٍّ)
npx tsx tests/server-route-parity-audit.ts && npm run lint
```

كلُّ مرحلةٍ تُكتب كاملةً من `server.ts` الأصلي (تمسح `src/server/{core,routes,pages}` المولَّدة وتعيد كتابتها)، وتعيد توجيهَ الاختبارات التي تقرأ نصَّ `server.ts` إلى `readServerSource()` (`tests/helpers/serverSource.mjs`). مسارٌ جديد بلا قاعدة يوقف الأداة: أضِفه إلى `routes` في `scripts/split-server/mapping.mjs`. ومساعدٌ جديد يتبع مستعمليه تلقائياً (وحدةٌ واحدة تستعمله ← إليها؛ أكثر ← وحدةُ منطقته في `regions`).

## الوحدات

| الملف | الأسطر | المحتوى |
|---|---:|---|
| `server.ts` | 929 | جذرُ التركيب |
| `src/server/core/approvals.ts` | 374 | الاعتماد: الأقفال والمعاملات وتسجيلُ التغيير |
| `src/server/core/auth.ts` | 299 | الجلسة والهوية والصلاحيات (authMiddleware، requireAuth، requirePermission…) |
| `src/server/core/authority.ts` | 259 | مقارنةُ ملف الجهة الرسمية (PDF) بالجدول |
| `src/server/core/boot.ts` | 198 | الإقلاع: ترتيبُ تحميل الوحدات الأصلية ثم ضبطُ البيئة |
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
| `src/server/core/publicPages.ts` | 127 | الصفحاتُ العامة: تلميحُ التجربة وسياسةُ المحتوى |
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
| `src/server/pages/instructorRequestPage.ts` | 1041 | صفحةُ طلب الأستاذ (/r/:token) |
| `src/server/pages/publicInvalidLinkPage.ts` | 15 | صفحةُ الرابط غير الصالح |
| `src/server/pages/staffCardPage.ts` | 595 | بطاقةُ الأستاذ العامة |
| `src/server/pages/studentCaseStatusPage.ts` | 144 | صفحةُ «حالة طلبي» للطالب |
| `src/server/pages/studentSchedulePage.ts` | 438 | جدولُ الطالب العام |
| `src/server/pages/surveyPages.ts` | 434 | استبيانُ الطلبة وصفحةُ الحالة الفردية |
| `src/server/routes/adminRoutes.ts` | 227 | النسخُ الاحتياطي وسجلُّ التدقيق |
| `src/server/routes/approvalsRoutes.ts` | 974 | الاعتمادُ والتوقيع |
| `src/server/routes/authRoutes.ts` | 796 | الدخولُ والجلسة والبيئةُ التجريبية |
| `src/server/routes/coursesRoutes.ts` | 657 | المقرراتُ والخططُ الدراسية وأنواعُ القاعات |
| `src/server/routes/dashboardRoutes.ts` | 482 | اللوحةُ والرحلةُ والبحث |
| `src/server/routes/draftsRoutes.ts` | 499 | المسوّداتُ والنسخُ ومقارنةُ الفصول |
| `src/server/routes/guideRoutes.ts` | 186 | الدليلُ الذكي وقياسُ الواجهة |
| `src/server/routes/hallBarterRoutes.ts` | 469 | تبادلُ القاعات |
| `src/server/routes/instructorRequestsRoutes.ts` | 970 | طلباتُ الأساتذة (جهةُ المنسّق) |
| `src/server/routes/instructorsRoutes.ts` | 632 | الأساتذة والزائرون والمندوبون |
| `src/server/routes/intelligenceInsightRoutes.ts` | 651 | قراءاتُ الذكاء: الحيّ ولماذا والانجرافُ والانتقال |
| `src/server/routes/intelligenceRoutes.ts` | 779 | ورشةُ الذكاء: القيودُ وغرفةُ القرار والمساعد |
| `src/server/routes/locationsRoutes.ts` | 452 | سجلُّ المواقع وإعدادُ المباني والقاعات |
| `src/server/routes/notificationsRoutes.ts` | 311 | الإشعارات |
| `src/server/routes/offeringRoutes.ts` | 315 | عروضُ المقررات ومرحلةُ المساعدين ومقاعدُ المرشدين |
| `src/server/routes/pdfImportRoutes.ts` | 959 | استيرادُ ملفات PDF |
| `src/server/routes/planningRoutes.ts` | 934 | التخطيط: فجوةُ الشعب والطلبُ والتسجيلُ وبناءُ الشعب |
| `src/server/routes/publicCalendarRoutes.ts` | 256 | التقويمُ العام (ICS) |
| `src/server/routes/publicRequestRoutes.ts` | 1422 | طلبُ الأستاذ العام (/r) |
| `src/server/routes/publicStaffRoutes.ts` | 747 | صفحاتُ الأستاذ والطالب العامة (/s /t /me) |
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
- `registerPublicStaffRoutes(app)` — 7 طريقاً، من `src/server/routes/publicStaffRoutes.ts`
- `registerSurveyRoutes(app)` — 8 طريقاً، من `src/server/routes/surveyRoutes.ts`
- `registerStudentRegistrationRoutes(app)` — 3 طريقاً، من `src/server/routes/studentRegistrationRoutes.ts`
- `registerInstructorRequestsRoutes(app)` — 7 طريقاً، من `src/server/routes/instructorRequestsRoutes.ts`
- `registerPublicRequestRoutes(app)` — 16 طريقاً، من `src/server/routes/publicRequestRoutes.ts`
- `registerOfferingRoutes(app)` — 10 طريقاً، من `src/server/routes/offeringRoutes.ts`
- `registerVerifyRoutes(app)` — 2 طريقاً، من `src/server/routes/verifyRoutes.ts`

## خريطةُ النقل: الطرق

| الطريق | السطر القديم | الملف الجديد |
|---|---:|---|
| `GET /api/demo/config` | 1001 | `src/server/routes/systemRoutes.ts` |
| `GET /api/version` | 1013 | `src/server/routes/systemRoutes.ts` |
| `GET /api/health` | 1018 | `src/server/routes/systemRoutes.ts` |
| `POST /api/auth/demo` | 2650 | `src/server/routes/authRoutes.ts` |
| `POST /api/demo/role` | 2682 | `src/server/routes/authRoutes.ts` |
| `GET /i/:username` | 2708 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/login` | 2717 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/logout` | 2776 | `src/server/routes/authRoutes.ts` |
| `GET /api/auth/me` | 2827 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/heartbeat` | 2844 | `src/server/routes/authRoutes.ts` |
| `POST /api/demo/reset` | 2866 | `src/server/routes/authRoutes.ts` |
| `GET /api/demo/teacher-card` | 2891 | `src/server/routes/authRoutes.ts` |
| `GET /api/demo/seed-status` | 2912 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/presence` | 2941 | `src/server/routes/authRoutes.ts` |
| `GET /api/dashboard` | 2987 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/journey` | 3203 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/search` | 3251 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/colleges` | 3357 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/colleges` | 3369 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/colleges/:id` | 3383 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/colleges/:id` | 3403 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/colleges/:id/mobility` | 3419 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/colleges/:id/mobility` | 3438 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/sections` | 3450 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/schedule-day-window` | 3457 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/admin/section-schedule-windows` | 3464 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/admin/section-schedule-windows` | 3471 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/admin/teaching-load` | 3494 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/admin/teaching-load` | 3511 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/teaching-load/status` | 3520 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/sections` | 3538 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/sections/:id` | 3558 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/sections/:id` | 3583 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/terms` | 3601 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/terms/scoped` | 3612 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/terms` | 3636 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/terms/:id` | 3651 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/terms/:id` | 3669 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/instructors` | 3763 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/instructors` | 3885 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/instructors/:id` | 3932 | `src/server/routes/instructorsRoutes.ts` |
| `DELETE /api/instructors/:id` | 3970 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/location-room-types` | 3997 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/admin/location-room-types` | 4012 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/admin/location-room-types` | 4020 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/admin/location-room-types/:type` | 4032 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/admin/location-room-types/:type` | 4051 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/courses` | 4068 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/curriculum/sections/:sectionId` | 4151 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans` | 4158 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/curriculum/plans/:planId` | 4168 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans/:planId/courses` | 4198 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/curriculum/plans/:planId/courses/:courseId` | 4213 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/transitions` | 4239 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/curriculum/transitions/:id` | 4264 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/curriculum/plans/:planId/archive-readiness` | 4295 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans/:planId/archive` | 4302 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/courses` | 4335 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/courses/:id` | 4400 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/courses/:id` | 4570 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/schedules/events` | 5841 | `src/server/routes/scheduleLiveRoutes.ts` |
| `GET /api/schedules/pulse` | 5912 | `src/server/routes/scheduleLiveRoutes.ts` |
| `POST /api/schedules/pulse` | 5935 | `src/server/routes/scheduleLiveRoutes.ts` |
| `GET /api/schedules/workspace` | 6022 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules` | 6203 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/hall-barter` | 6262 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests` | 6269 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests/:id/respond` | 6290 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests/:id/cancel` | 6349 | `src/server/routes/hallBarterRoutes.ts` |
| `GET /api/hall-barter/inbox` | 6371 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/schedules/import-preflight` | 6402 | `src/server/routes/scheduleImportRoutes.ts` |
| `POST /api/schedules/check-conflicts` | 6488 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/review-readiness` | 6517 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/outside-clashes` | 6663 | `src/server/routes/scheduleReviewRoutes.ts` |
| `POST /api/intelligence/nl-move` | 6720 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/nl-schedule` | 6860 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/schedules/move-batch` | 6938 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/export` | 7043 | `src/server/routes/scheduleImportRoutes.ts` |
| `POST /api/schedules/import` | 7132 | `src/server/routes/scheduleImportRoutes.ts` |
| `GET /api/visiting-roster` | 7295 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/visiting-lookup` | 7338 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/reports/visiting-roster` | 7346 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/visiting-teaching` | 7365 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/instructors/:id/affiliation` | 7385 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/instructor-affiliations` | 7417 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/delegates` | 7454 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/visiting-roster` | 7470 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/department-delegates` | 7494 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/department-delegates/instructor` | 7505 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/department-delegates/:instructorId` | 7529 | `src/server/routes/instructorsRoutes.ts` |
| `DELETE /api/department-delegates/:instructorId` | 7552 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/instructors/:id/visiting-state` | 7572 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/instructors/:id/visiting-conversion` | 7597 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/visiting-roster/instructor` | 7616 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/visiting-roster/copy` | 7631 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/reports/visiting-history` | 7649 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/department-rooms` | 7713 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/department-rooms` | 7720 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/location-registry` | 7725 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/companion-rooms` | 7855 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/location-registry/pending` | 7878 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-registry` | 7894 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-setup` | 7908 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-setup/buildings` | 7912 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-setup/buildings/:id` | 7928 | `src/server/routes/locationsRoutes.ts` |
| `DELETE /api/admin/location-setup/buildings/:id` | 7939 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-setup/rooms` | 7948 | `src/server/routes/locationsRoutes.ts` |
| `DELETE /api/admin/location-setup/rooms/:id` | 7968 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/buildings` | 7974 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/buildings/:id` | 7997 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/rooms` | 8012 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/rooms/:id` | 8028 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/review/:id` | 8098 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-registry/migration/preview` | 8103 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/migration/apply` | 8106 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/migration/:id/rollback` | 8129 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/schedules/ta-conversion` | 8170 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/ta-conversion` | 8182 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/replace-instructor` | 8231 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/schedules/replace-instructor/history` | 8282 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/courses/nature` | 8299 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/rooms/owner` | 8323 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/suggest-slots` | 8348 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/placeholder-action` | 8535 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/schedules/:id/exceptions` | 8667 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/:id/exceptions` | 8674 | `src/server/routes/schedulesRoutes.ts` |
| `DELETE /api/schedules/:id/exceptions/:exceptionId` | 8739 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/:id/substitutes` | 8757 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/meeting-participants` | 8890 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/meeting-slots` | 8907 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules` | 9103 | `src/server/routes/schedulesRoutes.ts` |
| `PUT /api/schedules/:id` | 9295 | `src/server/routes/schedulesRoutes.ts` |
| `DELETE /api/schedules/:id` | 9323 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/copy-preview` | 9327 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/apply-proposal` | 9524 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/copy` | 9531 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/wipe-scope` | 9617 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/wipe-scope` | 9631 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/wipe-scope/restore` | 9678 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/telemetry/client` | 9716 | `src/server/routes/guideRoutes.ts` |
| `POST /api/guide/intent` | 9927 | `src/server/routes/guideRoutes.ts` |
| `GET /api/intelligence/guide-friction` | 9967 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/experience-health` | 10007 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/open-decisions` | 10029 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/open-decisions` | 10046 | `src/server/routes/intelligenceRoutes.ts` |
| `PATCH /api/intelligence/open-decisions/:id` | 10059 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/operations-review` | 10072 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/policy-simulate` | 10084 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/overview` | 10105 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/spatial-burnout` | 10151 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/conflict-solutions` | 10158 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/ripple/:id` | 10168 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/lookups` | 10188 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/genome` | 10205 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/constraints` | 10215 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/constraints` | 10220 | `src/server/routes/intelligenceRoutes.ts` |
| `PUT /api/intelligence/constraints/:id` | 10243 | `src/server/routes/intelligenceRoutes.ts` |
| `DELETE /api/intelligence/constraints/:id` | 10249 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/war-room` | 10267 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/autopilot` | 10283 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/evaluate` | 10289 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/auto-schedule` | 10300 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/copilot` | 10317 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/context/:id` | 10495 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/replay/:id` | 10555 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/room` | 10588 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/professor/:id` | 10612 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/comments/:scheduleId` | 10616 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/comments/:scheduleId` | 10619 | `src/server/routes/intelligenceRoutes.ts` |
| `PUT /api/intelligence/comments/:scheduleId/:commentId` | 10622 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/drafts` | 10634 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/smart-import` | 10638 | `src/server/routes/smartImportRoutes.ts` |
| `POST /api/intelligence/pdf-import/bootstrap-section` | 10819 | `src/server/routes/pdfImportRoutes.ts` |
| `POST /api/intelligence/pdf-import` | 10888 | `src/server/routes/pdfImportRoutes.ts` |
| `POST /api/intelligence/drafts` | 11639 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/drafts/:id/import-report` | 11752 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/approvals` | 12271 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/approvals/term` | 12325 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/sign` | 12386 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/withdraw` | 12465 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/head-return` | 12496 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/acknowledge-additions` | 12521 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/submit` | 12591 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/return` | 12614 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/accept` | 12652 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/deadline` | 12697 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/student-phases` | 12722 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extension` | 12758 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extensions` | 12797 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extension-request` | 12869 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/schedule-notes` | 13046 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes` | 13066 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes/:id/rebut` | 13135 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes/:id/verdict` | 13161 | `src/server/routes/scheduleNotesRoutes.ts` |
| `DELETE /api/schedule-notes/:id` | 13195 | `src/server/routes/scheduleNotesRoutes.ts` |
| `GET /api/notifications` | 13411 | `src/server/routes/notificationsRoutes.ts` |
| `POST /api/notifications/seen` | 13487 | `src/server/routes/notificationsRoutes.ts` |
| `GET /api/approvals/badge` | 13532 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/approvals/inbox` | 13544 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/reports/schedule-changes` | 13683 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/authority-pdf-diff` | 13966 | `src/server/routes/reportsRoutes.ts` |
| `PUT /api/intelligence/drafts/:id` | 13996 | `src/server/routes/draftsRoutes.ts` |
| `PATCH /api/intelligence/drafts/:id/rows/:rowId` | 13999 | `src/server/routes/draftsRoutes.ts` |
| `DELETE /api/intelligence/drafts/:id/rows/:rowId` | 14028 | `src/server/routes/draftsRoutes.ts` |
| `DELETE /api/intelligence/drafts/:id/rows` | 14047 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/drafts/:id/publish` | 14056 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/versions` | 14303 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/versions/compare` | 14306 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/versions/:id/restore` | 14309 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/compare-terms` | 14313 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/import-preview` | 14358 | `src/server/routes/smartImportRoutes.ts` |
| `GET /api/intelligence/living` | 14412 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/why` | 14471 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/why-not` | 14484 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/decision-memory` | 14498 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/decision-memory` | 14504 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/context-copilot` | 14512 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/emergency` | 14530 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/department-start-rhythm` | 14565 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/settled-drift` | 14589 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/rollover` | 14708 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/genesis` | 14772 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/brief` | 14836 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/meeting-minutes` | 14840 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/safety-net` | 14844 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/safety-net/:id/undo` | 14848 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/system-backup/status` | 14862 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/export-jobs` | 14887 | `src/server/routes/adminRoutes.ts` |
| `DELETE /api/system-backup/export-jobs` | 14893 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export-jobs/:id` | 14898 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/export-jobs/:id/step` | 14902 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export-jobs/:id/download` | 14907 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export` | 14921 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/preview` | 14925 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import-jobs` | 14948 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/import-jobs/:id` | 14958 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import-jobs/:id/step` | 14962 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import` | 14967 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/reset` | 14971 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/undo` | 14984 | `src/server/routes/adminRoutes.ts` |
| `GET /api/audit-logs` | 14998 | `src/server/routes/adminRoutes.ts` |
| `GET /api/admin-user-options` | 15003 | `src/server/routes/adminRoutes.ts` |
| `GET /api/admin-instructor-options` | 15009 | `src/server/routes/adminRoutes.ts` |
| `GET /api/roles` | 15087 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users` | 15094 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users` | 15117 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/grant-decision-centre` | 15209 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users/department-heads/preview` | 15246 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/department-heads` | 15250 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users/advisors/preview` | 15275 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/advisors` | 15279 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/advisors/consolidate` | 15310 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/users/:id` | 15352 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/users/:id` | 15462 | `src/server/routes/usersRoutes.ts` |
| `GET /api/permissions/forms` | 15470 | `src/server/routes/usersRoutes.ts` |
| `GET /api/permissions` | 15474 | `src/server/routes/usersRoutes.ts` |
| `POST /api/permissions` | 15478 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/permissions/:id` | 15487 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/permissions/:id` | 15494 | `src/server/routes/usersRoutes.ts` |
| `GET /api/user-scopes` | 15506 | `src/server/routes/usersRoutes.ts` |
| `POST /api/user-scopes` | 15510 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/user-scopes/:id` | 15519 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/user-scopes/:id` | 15528 | `src/server/routes/usersRoutes.ts` |
| `GET /api/reports/excel/:type` | 15539 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/search/natural` | 15663 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/reports/department-balance` | 15825 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/room-load` | 15907 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/share` | 16461 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share` | 16489 | `src/server/routes/shareRoutes.ts` |
| `DELETE /api/share/:id` | 16562 | `src/server/routes/shareRoutes.ts` |
| `GET /api/share/:id/faculty` | 16631 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share/:id/personal` | 16651 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share/:id/sent` | 16692 | `src/server/routes/shareRoutes.ts` |
| `GET /api/share-personal` | 16704 | `src/server/routes/shareRoutes.ts` |
| `GET /api/registration-stats` | 16739 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/preview` | 16944 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/apply` | 16962 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/review-rows` | 17018 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/undo` | 17058 | `src/server/routes/planningRoutes.ts` |
| `GET /api/forecast/term` | 17084 | `src/server/routes/planningRoutes.ts` |
| `PUT /api/registration-stats` | 17106 | `src/server/routes/planningRoutes.ts` |
| `POST /api/registration-stats/remaining-pdf` | 17173 | `src/server/routes/planningRoutes.ts` |
| `POST /api/registration-stats/remaining-cells` | 17225 | `src/server/routes/planningRoutes.ts` |
| `GET /api/public/schedule/:token` | 17248 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics/:token` | 17323 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics/:token/:key` | 17380 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/cal/:token/:key` | 17405 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics-reminder` | 17435 | `src/server/routes/publicCalendarRoutes.ts` |
| `POST /api/public/staff/:token/note` | 17539 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /api/degree-rules` | 17890 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/degree-rules/:sectionId` | 17912 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/public/survey/:token` | 17953 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/identity-status` | 18013 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/proof-status` | 18061 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/proof` | 18186 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token` | 18226 | `src/server/routes/surveyRoutes.ts` |
| `GET /api/schedules/section-gap/decisions` | 18433 | `src/server/routes/planningRoutes.ts` |
| `PUT /api/schedules/section-gap/decisions` | 18439 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/section-gap` | 18462 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/section-gap/staffing` | 18476 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/openings-preview` | 18535 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/academic-advice` | 18561 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/demand` | 18574 | `src/server/routes/planningRoutes.ts` |
| `GET /api/student-registration` | 18870 | `src/server/routes/studentRegistrationRoutes.ts` |
| `POST /api/student-registration/:id/course-state` | 19024 | `src/server/routes/studentRegistrationRoutes.ts` |
| `POST /api/student-registration/:id/case-state` | 19213 | `src/server/routes/studentRegistrationRoutes.ts` |
| `GET /api/schedules/staff-inbox` | 19270 | `src/server/routes/planningRoutes.ts` |
| `POST /api/public/staff/:token/forget` | 19302 | `src/server/routes/publicStaffRoutes.ts` |
| `POST /api/public/staff/:token` | 19308 | `src/server/routes/publicStaffRoutes.ts` |
| `POST /api/instructor-requests/issue` | 21382 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/instructor-requests/exceptions` | 21594 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/exception/revoke` | 21617 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/instructor-requests` | 21643 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/decide` | 21793 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/apply` | 21970 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/reply` | 22249 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/public/request/:token` | 22294 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token` | 22436 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/reply` | 22607 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/reply-batch` | 22702 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check` | 23782 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/academic-advice` | 23867 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check-batch` | 23901 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/previous` | 23952 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/events` | 24016 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check-times` | 24061 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/hold` | 24127 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/movement` | 24163 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /r/:token` | 24221 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/interest` | 24276 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/stick` | 24296 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/course-offering` | 24361 | `src/server/routes/offeringRoutes.ts` |
| `PUT /api/course-offering` | 24392 | `src/server/routes/offeringRoutes.ts` |
| `GET /api/ta-phase` | 24458 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/allowed` | 24496 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/open` | 24513 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/close` | 24537 | `src/server/routes/offeringRoutes.ts` |
| `GET /api/advisor-seats` | 24574 | `src/server/routes/offeringRoutes.ts` |
| `PUT /api/advisor-seats/config` | 24590 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/advisor-seats/add` | 24600 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/advisor-seats/exception` | 24623 | `src/server/routes/offeringRoutes.ts` |
| `GET /r/:token/proposal/:pid` | 24637 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /verify ، /verify/:code` | 24663 | `src/server/routes/verifyRoutes.ts` |
| `POST /api/public/verify` | 24668 | `src/server/routes/verifyRoutes.ts` |
| `POST /api/public/survey/:token/my-case` | 24773 | `src/server/routes/surveyRoutes.ts` |
| `GET /m/:token` | 25002 | `src/server/routes/surveyRoutes.ts` |
| `GET /q/:token` | 25015 | `src/server/routes/surveyRoutes.ts` |
| `GET /me ، /me/` | 25196 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /api/public/students/:token` | 25641 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /t/:token` | 25656 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /s/:token` | 25670 | `src/server/routes/publicStaffRoutes.ts` |

## خريطةُ النقل: التعريفات والجمل

| الاسم | النوع | السطر القديم | الملف الجديد |
|---|---|---:|---|
| `configureRuntimeEnvironment();` | جملة | 241 | `src/server/core/boot.ts` |
| `app` | const | 243 | `server.ts` |
| `app.set("trust proxy", 1);` | app | 252 | `server.ts` |
| `PORT` | const | 255 | `server.ts` |
| `arabicUiCollator` | const | 262 | `src/server/core/ordering.ts` |
| `foldHeaderIdentity` | const | 263 | `src/server/core/ordering.ts` |
| `isSpecialEducationIdentity` | const | 268 | `src/server/core/ordering.ts` |
| `academicSectionNameMatches` | const | 280 | `src/server/core/ordering.ts` |
| `sortArabicNamed` | const | 292 | `src/server/core/ordering.ts` |
| `verifiedRoomKey` | const | 294 | `src/server/core/ordering.ts` |
| `verifiedBuildingKey` | const | 298 | `src/server/core/ordering.ts` |
| `termChronologyServer` | const | 302 | `src/server/core/ordering.ts` |
| `sortTermsNewestServer` | const | 308 | `src/server/core/ordering.ts` |
| `dataContextCacheKey` | const | 322 | `src/server/core/locations.ts` |
| `locationRegistryCache` | const | 324 | `src/server/core/locations.ts` |
| `readLocationRegistry` | function | 325 | `src/server/core/locations.ts` |
| `invalidateLocationRegistry` | function | 339 | `src/server/core/locations.ts` |
| `provisionBranchSiteLocationsFromAuthority` | function | 359 | `src/server/routes/pdfImportRoutes.ts` |
| `confirmedDepartmentRoomIds` | const | 430 | `src/server/core/locations.ts` |
| `DepartmentRoomReference` | type | 431 | `src/server/routes/locationsRoutes.ts` |
| `canonicalizeLocationForWrite` | function | 433 | `src/server/core/locations.ts` |
| `canonicalizeHistoricalLocationForRuntime` | function | 472 | `src/server/core/locations.ts` |
| `asyncSafe` | const | 499 | `src/server/core/http.ts` |
| `for (const verb of ["get", "post", "put", "patch", "delete", "all", "u` | جملة | 513 | `server.ts` |
| `process.on("unhandledRejection", (reason) => {` | جملة | 519 | `server.ts` |
| `process.on("uncaughtException", (error) => {` | جملة | 522 | `server.ts` |
| `app.disable("x-powered-by");` | app | 526 | `server.ts` |
| `app.use((req, res, next) => {` | app | 527 | `server.ts` |
| `app.use(compression({` | app | 568 | `server.ts` |
| `app.use(["/api/system-backup/preview", "/api/system-backup/import", "/` | app | 582 | `server.ts` |
| `   كبيراً قبل أن يصل إلى المسار. safeDraftRows يقصّ كل حقل ويحدّ الصفو` | app | 589 | `server.ts` |
| `app.use(express.json({ limit: "1mb" }));` | app | 590 | `server.ts` |
| `app.use((req, res, next) => {` | app | 594 | `server.ts` |
| `getCookies` | function | 620 | `src/server/core/auth.ts` |
| `loginAttempts` | const | 635 | `src/server/routes/authRoutes.ts` |
| `rateLimitLogin` | function | 636 | `src/server/routes/authRoutes.ts` |
| `rateLimitHeavyReport` | const | 669 | `src/server/routes/reportsRoutes.ts` |
| `requestTokenKey` | const | 683 | `src/server/core/rateLimits.ts` |
| `REQUEST_IP_CEILING` | const | 687 | `src/server/core/rateLimits.ts` |
| `REQUEST_TOKEN_CEILING` | const | 688 | `src/server/core/rateLimits.ts` |
| `rateLimitPublicRequest` | const | 691 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitCardEvents` | const | 701 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitDocumentRead` | const | 712 | `src/server/routes/planningRoutes.ts` |
| `rateLimitDemoRole` | const | 720 | `src/server/routes/authRoutes.ts` |
| `readRateLimitEnv` | function | 746 | `src/server/core/rateLimits.ts` |
| `PUBLIC_RATE_LIMIT_MAX` | const | 753 | `src/server/core/rateLimits.ts` |
| `PUBLIC_RATE_LIMIT_WINDOW_MS` | const | 754 | `src/server/core/rateLimits.ts` |
| `publicRequestWindows` | const | 755 | `src/server/core/rateLimits.ts` |
| `publicRateLimitSweptAt` | let | 756 | `src/server/core/rateLimits.ts` |
| `rateLimitPublic` | function | 758 | `src/server/core/rateLimits.ts` |
| `app.use("/api/public", rateLimitPublic);` | app | 791 | `server.ts` |
| `requestLinkLimit` | const | 792 | `src/server/core/rateLimits.ts` |
| `app.use("/api/public/request/:token", requestLinkLimit);` | app | 798 | `server.ts` |
| `app.use(adInjection());` | app | 800 | `server.ts` |
| `SERVER_IDLE_SESSION_MS` | const | 802 | `src/server/core/auth.ts` |
| `DEMO_SESSION_TTL_MS` | const | 803 | `src/server/core/auth.ts` |
| `AuthenticatedRequest` | interface | 806 | `src/server/core/auth.ts` |
| `AUTH_CACHE_MS` | const | 832 | `src/server/core/auth.ts` |
| `authCache` | const | 833 | `src/server/core/auth.ts` |
| `SESSION_TOUCH_EVERY_MS` | const | 854 | `src/server/core/auth.ts` |
| `sessionTouchedAt` | const | 855 | `src/server/core/auth.ts` |
| `touchSession` | function | 857 | `src/server/core/auth.ts` |
| `forgetAuthSession` | function | 874 | `src/server/routes/authRoutes.ts` |
| `Repository.onIdentityChanged?.(() => authCache.clear());` | جملة | 878 | `src/server/core/auth.ts` |
| `deadSessions` | const | 883 | `src/server/core/auth.ts` |
| `sessionLookups` | const | 884 | `src/server/core/auth.ts` |
| `sessionLookupRefusedLoggedAt` | let | 885 | `src/server/core/auth.ts` |
| `authMiddleware` | function | 887 | `src/server/core/auth.ts` |
| `databaseDown` | let | 976 | `src/server/core/state.ts` |
| `databaseDownRef` | let | 987 | `src/server/core/state.ts` |
| `app.use("/api", (req, res, next) => {` | app | 1026 | `server.ts` |
| `bindPublicLinkContext` | function | 1043 | `src/server/core/auth.ts` |
| `   شبكةُ الجامعة تفتح ألف رابطٍ صحيح ولا تُحجب، ومن يخمّن يُوقَف قبل أ` | app | 1052 | `server.ts` |
| `app.use(PUBLIC_LINK_PAGE_PREFIXES.map(prefix => `${prefix}:token`), bi` | app | 1053 | `server.ts` |
| `app.use("/api", (req: Request, res: Response, next: NextFunction) => {` | app | 1057 | `server.ts` |
| `app.use("/api", authMiddleware as express.RequestHandler);` | app | 1072 | `server.ts` |
| `DEMO_READ_ONLY_PREFIXES` | const | 1076 | `src/server/core/auth.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1077 | `server.ts` |
| `   حارس الأدوار: نقطة واحدة، لا مئة` | app | 1107 | `server.ts` |
| `ApiPerformanceSample` | type | 1119 | `src/server/core/http.ts` |
| `apiPerformanceSamples` | const | 1120 | `src/server/core/http.ts` |
| `API_PERFORMANCE_LIMIT` | const | 1121 | `src/server/core/http.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1122 | `server.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1142 | `server.ts` |
| `DEMO_SESSION_GONE` | const | 1227 | `src/server/core/auth.ts` |
| `signInRequiredMessage` | function | 1228 | `src/server/core/auth.ts` |
| `requireAuth` | function | 1233 | `src/server/core/auth.ts` |
| `powerOnlyFormIds` | const | 1243 | `src/server/core/auth.ts` |
| `DECISION_CENTRE_FORM_ID` | const | 1246 | `src/server/routes/usersRoutes.ts` |
| `isPowerUser` | function | 1247 | `src/server/core/auth.ts` |
| `requirePowerAdmin` | function | 1250 | `src/server/core/auth.ts` |
| `ROOT_ADMIN_USER_ID` | const | 1256 | `src/server/core/auth.ts` |
| `requireRootAdmin` | function | 1257 | `src/server/core/auth.ts` |
| `SYSTEM_BACKUP_MAX_BYTES` | const | 1266 | `src/server/routes/adminRoutes.ts` |
| `gunzipBounded` | function | 1281 | `src/server/routes/adminRoutes.ts` |
| `readSystemBackupBody` | function | 1305 | `src/server/routes/adminRoutes.ts` |
| `limitConcurrency` | function | 1331 | `src/server/core/http.ts` |
| `documentReadingGate` | const | 1356 | `src/server/core/http.ts` |
| `requirePermission` | function | 1359 | `src/server/core/auth.ts` |
| `requireAnyPermission` | function | 1384 | `src/server/core/auth.ts` |
| `isScopeAllowed` | function | 1404 | `src/server/core/scope.ts` |
| `filterByScope` | function | 1460 | `src/server/core/scope.ts` |
| `legacyFDetail` | function | 1489 | `src/server/core/scope.ts` |
| `safeSystemUser` | function | 1499 | `src/server/core/scope.ts` |
| `captureScopeVersion` | function | 1518 | `src/server/core/versions.ts` |
| `recordVersionAfter` | function | 1530 | `src/server/core/versions.ts` |
| `confirmTokens` | function | 1543 | `src/server/core/versions.ts` |
| `scopeOverwriteRefusal` | function | 1553 | `src/server/core/versions.ts` |
| `replacementAction` | function | 1574 | `src/server/core/versions.ts` |
| `safeImportEvidence` | function | 1583 | `src/server/core/smartImport.ts` |
| `PdfImportReceipt` | type | 1604 | `src/server/core/smartImport.ts` |
| `signPdfImportReceipt` | function | 1605 | `src/server/routes/pdfImportRoutes.ts` |
| `verifyPdfImportReceipt` | function | 1611 | `src/server/routes/draftsRoutes.ts` |
| `DRAFT_DOCUMENT_MAX_BYTES` | const | 1625 | `src/server/routes/draftsRoutes.ts` |
| `safeDraftRows` | function | 1627 | `src/server/core/smartImport.ts` |
| `AUTHORITY_PDF_COMPARE_FIELDS` | const | 1673 | `src/server/core/authority.ts` |
| `authorityCourseCodeMap` | function | 1683 | `src/server/core/authority.ts` |
| `buildAuthorityPdfDiff` | function | 1688 | `src/server/core/authority.ts` |
| `inferAuthorityBranchCode` | function | 1888 | `src/server/core/authority.ts` |
| `branchOwnScopes` | function | 1901 | `src/server/core/smartImport.ts` |
| `placeholderInstructorIds` | function | 1922 | `src/server/core/smartImport.ts` |
| `approvalBlockerOptions` | function | 1931 | `src/server/core/smartImport.ts` |
| `blockingImportConflicts` | function | 1939 | `src/server/core/smartImport.ts` |
| `collegeFallbackInstructorIds` | function | 1961 | `src/server/core/smartImport.ts` |
| `visitingToFacultyPlan` | function | 1980 | `src/server/core/smartImport.ts` |
| `departmentInstructorIdSet` | function | 1998 | `src/server/core/smartImport.ts` |
| `validateSmartRows` | function | 2027 | `src/server/core/smartImport.ts` |
| `mapSmartIssuesToRows` | function | 2138 | `src/server/core/smartImport.ts` |
| `smartContextFrom` | function | 2160 | `src/server/core/smartImport.ts` |
| `resolveSmartContext` | function | 2181 | `src/server/core/smartImport.ts` |
| `breathe` | const | 2217 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `intelligenceReadScopes` | function | 2220 | `src/server/core/scope.ts` |
| `scopedScheduleUniverse` | function | 2227 | `src/server/core/scope.ts` |
| `clientScopeDetails` | function | 2238 | `src/server/routes/authRoutes.ts` |
| `demoSessionPayload` | function | 2307 | `src/server/routes/authRoutes.ts` |
| `readDemoIdentity` | function | 2319 | `src/server/routes/authRoutes.ts` |
| `DEMO_STORY_SCOPE` | const | 2343 | `src/server/core/demo.ts` |
| `demoSeedJobs` | const | 2344 | `src/server/routes/authRoutes.ts` |
| `demoSeedStatus` | const | 2345 | `src/server/routes/authRoutes.ts` |
| `scheduleDemoExtras` | function | 2351 | `src/server/routes/authRoutes.ts` |
| `seedDemoTeacherCourses` | function | 2380 | `src/server/routes/authRoutes.ts` |
| `seedDemoAvailableCourses` | function | 2421 | `src/server/routes/authRoutes.ts` |
| `seedDemoStories` | function | 2477 | `src/server/routes/authRoutes.ts` |
| `roleDescriptor` | function | 2800 | `src/server/routes/authRoutes.ts` |
| `demoTeacherRequest` | function | 2884 | `src/server/core/demo.ts` |
| `PRESENCE_DAYS` | const | 2934 | `src/server/routes/authRoutes.ts` |
| `cleanMarkPart` | const | 2935 | `src/server/routes/authRoutes.ts` |
| `TEXT_LIMIT` | const | 3311 | `src/server/core/input.ts` |
| `cleanText` | function | 3315 | `src/server/core/input.ts` |
| `boundedInt` | function | 3324 | `src/server/core/input.ts` |
| `boundedDecimal` | function | 3333 | `src/server/routes/coursesRoutes.ts` |
| `COURSE_LIMIT` | const | 3345 | `src/server/routes/coursesRoutes.ts` |
| `courseNumberIssue` | function | 3348 | `src/server/routes/coursesRoutes.ts` |
| `collegeMobilityHistoryCache` | const | 3418 | `src/server/routes/referenceRoutes.ts` |
| `teachingLoadHoursForTerm` | function | 3488 | `src/server/routes/referenceRoutes.ts` |
| `scopedTermsCache` | const | 3611 | `src/server/routes/referenceRoutes.ts` |
| `instructorsForReader` | function | 3702 | `src/server/core/scope.ts` |
| `instructorCircleCache` | const | 3720 | `src/server/routes/instructorsRoutes.ts` |
| `instructorCircleFor` | function | 3721 | `src/server/routes/instructorsRoutes.ts` |
| `maskCivilTail` | function | 3748 | `src/server/routes/instructorsRoutes.ts` |
| `instructorsForScope` | function | 3754 | `src/server/routes/instructorsRoutes.ts` |
| `courseNameCollator` | const | 3984 | `src/server/core/ordering.ts` |
| `sortCoursesByName` | const | 3985 | `src/server/core/ordering.ts` |
| `curriculumOverview` | function | 4131 | `src/server/routes/coursesRoutes.ts` |
| `curriculumArchiveReadiness` | function | 4271 | `src/server/routes/coursesRoutes.ts` |
| `committeeCatalogEditAllowed` | function | 4320 | `src/server/routes/coursesRoutes.ts` |
| `refuseCommitteeCatalogEdit` | function | 4331 | `src/server/routes/coursesRoutes.ts` |
| `SCHEDULE_DAY_KEYS` | const | 4596 | `src/server/core/scheduleRules.ts` |
| `scheduleOverlap` | const | 4613 | `src/server/core/scheduleRules.ts` |
| `sectionScheduleWindowCache` | const | 4615 | `src/server/core/scheduleRules.ts` |
| `sectionScheduleWindow` | function | 4616 | `src/server/core/scheduleRules.ts` |
| `mixedPatternNotice` | function | 4626 | `src/server/core/scheduleRules.ts` |
| `scheduleLengthIssue` | function | 4637 | `src/server/core/scheduleRules.ts` |
| `scheduleLengthNotice` | function | 4656 | `src/server/routes/scheduleReviewRoutes.ts` |
| `schedulePayloadIssues` | function | 4663 | `src/server/core/scheduleRules.ts` |
| `roomOwnership` | function | 4679 | `src/server/core/scheduleRules.ts` |
| `roomScopeNotice` | function | 4708 | `src/server/core/scheduleConflicts.ts` |
| `HALL_BARTER_MIN_WINDOW_MINUTES` | const | 4725 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_MAX_OPPORTUNITIES` | const | 4726 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_DAY_LABEL` | const | 4727 | `src/server/core/hallBarter.ts` |
| `HALL_BARTER_STALE_DAYS` | const | 4730 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_STALE_REASON` | const | 4731 | `src/server/routes/hallBarterRoutes.ts` |
| `sweepStaleHallBarter` | function | 4733 | `src/server/routes/hallBarterRoutes.ts` |
| `HallCampusGender` | type | 4745 | `src/server/routes/hallBarterRoutes.ts` |
| `hallCampusGender` | function | 4746 | `src/server/routes/hallBarterRoutes.ts` |
| `sameHallCampusGender` | function | 4756 | `src/server/routes/hallBarterRoutes.ts` |
| `hallBarterSerial` | let | 4763 | `src/server/core/state.ts` |
| `hallBarterBoardCache` | const | 4764 | `src/server/core/hallBarter.ts` |
| `academicStartYear` | function | 4766 | `src/server/core/hallBarter.ts` |
| `recentTenYearTermIds` | function | 4770 | `src/server/routes/intelligenceRoutes.ts` |
| `rowOccupiesWindow` | function | 4779 | `src/server/routes/hallBarterRoutes.ts` |
| `barterRequestRoomKey` | function | 4799 | `src/server/core/hallBarter.ts` |
| `barterRequestMatchesRow` | function | 4802 | `src/server/core/hallBarter.ts` |
| `barterRequestOverlaps` | function | 4803 | `src/server/routes/hallBarterRoutes.ts` |
| `hallBarterAllowsRoomUse` | function | 4808 | `src/server/core/hallBarter.ts` |
| `hallBarterRequestShape` | function | 4817 | `src/server/routes/hallBarterRoutes.ts` |
| `buildHallBarterBoard` | function | 4835 | `src/server/routes/hallBarterRoutes.ts` |
| `normalizedBuilding` | function | 5068 | `src/server/core/scheduleRules.ts` |
| `travelPairKey` | function | 5069 | `src/server/core/scheduleRules.ts` |
| `travelMinutesFor` | function | 5070 | `src/server/core/scheduleRules.ts` |
| `rowsOverlapOnDay` | function | 5080 | `src/server/routes/intelligenceRoutes.ts` |
| `spatialBurnoutAnalysis` | function | 5081 | `src/server/routes/intelligenceRoutes.ts` |
| `roomIsFreeForRow` | function | 5107 | `src/server/routes/intelligenceRoutes.ts` |
| `roomCastlingProposals` | function | 5115 | `src/server/routes/intelligenceRoutes.ts` |
| `CAMPUS_LABEL` | const | 5146 | `src/server/core/scheduleConflicts.ts` |
| `interCampusWarnings` | function | 5156 | `src/server/core/scheduleConflicts.ts` |
| `describeScheduleChange` | function | 5200 | `src/server/core/scheduleRules.ts` |
| `DepartmentStyle` | interface | 5233 | `src/server/core/rhythm.ts` |
| `NO_COHORT` | const | 5241 | `src/server/core/rhythm.ts` |
| `rhythmCache` | const | 5242 | `src/server/core/rhythm.ts` |
| `rhythmRefreshing` | const | 5243 | `src/server/core/rhythm.ts` |
| `RHYTHM_STALE_MS` | const | 5249 | `src/server/core/rhythm.ts` |
| `styleOf` | const | 5250 | `src/server/core/rhythm.ts` |
| `departmentStyle` | function | 5252 | `src/server/core/rhythm.ts` |
| `readDepartmentStyle` | function | 5269 | `src/server/core/rhythm.ts` |
| `scheduleConflicts` | function | 5327 | `src/server/core/scheduleConflicts.ts` |
| `applyRequestHoldOverride` | function | 5549 | `src/server/core/scheduleConflicts.ts` |
| `noteRequestHoldOverride` | function | 5567 | `src/server/core/scheduleConflicts.ts` |
| `requestHoldRefusal` | function | 5586 | `src/server/core/scheduleConflicts.ts` |
| `PresenceMark` | interface | 5624 | `src/server/core/liveChannel.ts` |
| `ScheduleEventClient` | interface | 5633 | `src/server/core/liveChannel.ts` |
| `scheduleEventClients` | const | 5650 | `src/server/core/liveChannel.ts` |
| `scheduleEventTimer` | let | 5651 | `src/server/core/liveChannel.ts` |
| `scheduleEventSerial` | let | 5652 | `src/server/core/liveChannel.ts` |
| `scheduleChangeClock` | const | 5655 | `src/server/core/liveChannel.ts` |
| `notifyClock` | const | 5656 | `src/server/core/liveChannel.ts` |
| `broadcastScheduleChange` | function | 5658 | `src/server/core/liveChannel.ts` |
| `broadcastNotify` | function | 5678 | `src/server/core/liveChannel.ts` |
| `for (const prefix of ["/api/approvals", "/api/schedule-notes", "/api/i` | جملة | 5687 | `server.ts` |
| `broadcastStudentNotifySoon` | const | 5698 | `src/server/core/liveChannel.ts` |
| `app.use("/api/student-registration", (req: Request, res: Response, nex` | app | 5699 | `server.ts` |
| `PRESENCE_STALE_MS` | const | 5713 | `src/server/core/liveChannel.ts` |
| `PRESENCE_GONE_MS` | const | 5714 | `src/server/core/liveChannel.ts` |
| `presenceDirty` | const | 5715 | `src/server/core/liveChannel.ts` |
| `presenceFlushTimer` | let | 5716 | `src/server/core/liveChannel.ts` |
| `emptyMark` | const | 5718 | `src/server/core/liveChannel.ts` |
| `boardScopeKey` | const | 5719 | `src/server/core/liveChannel.ts` |
| `hasMark` | const | 5720 | `src/server/core/liveChannel.ts` |
| `presenceRoster` | function | 5730 | `src/server/core/liveChannel.ts` |
| `broadcastPresence` | function | 5750 | `src/server/core/liveChannel.ts` |
| `markPresenceDirty` | function | 5763 | `src/server/core/liveChannel.ts` |
| `setInterval(() => {` | جملة | 5781 | `src/server/core/liveChannel.ts` |
| `pendingScheduleSessions` | const | 5799 | `src/server/core/liveChannel.ts` |
| `onSchedulesInvalidated(() => {` | جملة | 5800 | `src/server/core/liveChannel.ts` |
| `stopScheduleBeacon` | let | 5824 | `src/server/core/liveChannel.ts` |
| `listenForScheduleChangesAcrossInstances` | function | 5825 | `src/server/core/liveChannel.ts` |
| `pulseClients` | const | 5911 | `src/server/routes/scheduleLiveRoutes.ts` |
| `readLiveVisitingRoster` | function | 5955 | `src/server/core/visiting.ts` |
| `readVisitingStatus` | function | 5975 | `src/server/core/visiting.ts` |
| `visitingChecker` | function | 5996 | `src/server/core/visiting.ts` |
| `readsFinalSchedulesOnly` | function | 6096 | `src/server/core/scheduleReads.ts` |
| `termEndedForReading` | function | 6104 | `src/server/core/scheduleReads.ts` |
| `finalRowsWithFinality` | function | 6109 | `src/server/core/scheduleReads.ts` |
| `finalRowsOnly` | function | 6130 | `src/server/core/scheduleReads.ts` |
| `readSchedulesForRequest` | function | 6138 | `src/server/core/scheduleReads.ts` |
| `scopeSectionIdsFor` | function | 6154 | `src/server/core/scheduleReads.ts` |
| `readScopedTermRows` | function | 6159 | `src/server/routes/dashboardRoutes.ts` |
| `readLiveSchedulesForRequest` | function | 6181 | `src/server/core/scheduleReads.ts` |
| `checkLengthIssue` | function | 6457 | `src/server/routes/scheduleReviewRoutes.ts` |
| `checkLocationIssues` | function | 6469 | `src/server/routes/scheduleReviewRoutes.ts` |
| `previewNaturalLanguageMove` | function | 6764 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `executeGeminiScheduleCalls` | function | 6819 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `dropStaleHallIdentity` | function | 6905 | `src/server/routes/scheduleReviewRoutes.ts` |
| `movedRowsCollisions` | function | 6917 | `src/server/routes/scheduleReviewRoutes.ts` |
| `hallTextChangedWithoutIdentity` | function | 6930 | `src/server/routes/scheduleReviewRoutes.ts` |
| `wholeCollegeSectionIds` | function | 7306 | `src/server/routes/reportsRoutes.ts` |
| `visitingLookupFor` | function | 7325 | `src/server/routes/instructorsRoutes.ts` |
| `locationIdList` | const | 7886 | `src/server/routes/locationsRoutes.ts` |
| `locationAliases` | const | 7887 | `src/server/routes/locationsRoutes.ts` |
| `officialBuildingCollegeIds` | const | 7888 | `src/server/routes/locationsRoutes.ts` |
| `taConversionState` | function | 8140 | `src/server/routes/scheduleToolsRoutes.ts` |
| `WEEK_EXCEPTION_DATE` | const | 8650 | `src/server/routes/schedulesRoutes.ts` |
| `weekExceptionDayKey` | function | 8652 | `src/server/core/scheduleRules.ts` |
| `readScheduleForException` | function | 8659 | `src/server/routes/schedulesRoutes.ts` |
| `meetingExcludedIds` | function | 8857 | `src/server/core/scheduleRules.ts` |
| `requireMeetingAccess` | const | 8871 | `src/server/routes/scheduleToolsRoutes.ts` |
| `meetingDepartmentPeople` | function | 8878 | `src/server/routes/scheduleToolsRoutes.ts` |
| `SCHEDULE_ORIGIN_KINDS` | const | 8945 | `src/server/core/scheduleWrites.ts` |
| `scheduleOriginOf` | function | 8946 | `src/server/core/scheduleWrites.ts` |
| `companionBookingFor` | function | 8961 | `src/server/core/scheduleWrites.ts` |
| `createScheduleHandler` | const | 8979 | `src/server/core/scheduleWrites.ts` |
| `updateScheduleHandler` | const | 9105 | `src/server/core/scheduleWrites.ts` |
| `deleteScheduleHandler` | const | 9297 | `src/server/core/scheduleWrites.ts` |
| `InnerScheduleResult` | interface | 9354 | `src/server/core/scheduleWrites.ts` |
| `runScheduleHandler` | function | 9356 | `src/server/core/scheduleWrites.ts` |
| `PROPOSAL_ORIGIN_LABEL` | const | 9382 | `src/server/core/scheduleWrites.ts` |
| `PROPOSAL_DAYS` | const | 9385 | `src/server/core/scheduleWrites.ts` |
| `dayFlagsOf` | const | 9386 | `src/server/core/scheduleWrites.ts` |
| `dayOfRow` | const | 9387 | `src/server/core/scheduleWrites.ts` |
| `dayLabelOf` | const | 9388 | `src/server/core/scheduleWrites.ts` |
| `editBodyFor` | function | 9391 | `src/server/core/scheduleWrites.ts` |
| `ProposalOutcome` | interface | 9405 | `src/server/core/scheduleWrites.ts` |
| `applyProposalCore` | function | 9407 | `src/server/core/scheduleWrites.ts` |
| `wipeScopeState` | function | 9586 | `src/server/routes/schedulesRoutes.ts` |
| `wipeScopeOf` | const | 9615 | `src/server/routes/schedulesRoutes.ts` |
| `GuideIntentPayload` | type | 9745 | `src/server/routes/guideRoutes.ts` |
| `deterministicGuideIntent` | function | 9756 | `src/server/routes/guideRoutes.ts` |
| `serverCanExposeGuideFeature` | function | 9776 | `src/server/routes/guideRoutes.ts` |
| `requestGuideAIIntent` | function | 9787 | `src/server/routes/guideRoutes.ts` |
| `GeminiPart` | type | 9842 | `src/server/core/gemini.ts` |
| `geminiOutputText` | function | 9844 | `src/server/core/gemini.ts` |
| `geminiFunctionCalls` | function | 9852 | `src/server/core/gemini.ts` |
| `requestGeminiScheduleLayer` | function | 9860 | `src/server/core/gemini.ts` |
| `emptyScopeGuidance` | function | 10259 | `src/server/routes/intelligenceRoutes.ts` |
| `authorityBaselineForScope` | function | 11711 | `src/server/core/authority.ts` |
| `authorityDraftForScope` | function | 11728 | `src/server/routes/reportsRoutes.ts` |
| `scheduleLockRefusal` | function | 11801 | `src/server/core/approvals.ts` |
| `registrarNotesInRound` | function | 11845 | `src/server/core/approvals.ts` |
| `termIsClosed` | function | 11852 | `src/server/core/approvals.ts` |
| `approvalTransaction` | function | 11870 | `src/server/routes/approvalsRoutes.ts` |
| `approvalScopeLabel` | function | 11895 | `src/server/routes/approvalsRoutes.ts` |
| `withEvent` | function | 11907 | `src/server/core/approvals.ts` |
| `noteScheduleMutation` | function | 11922 | `src/server/core/approvals.ts` |
| `ApprovalEventWriter` | type | 11971 | `src/server/core/approvals.ts` |
| `amendmentAfterEdit` | function | 11972 | `src/server/core/approvals.ts` |
| `settleAmendmentMarker` | function | 11992 | `src/server/core/approvals.ts` |
| `settlePendingAmendmentInLock` | function | 12001 | `src/server/routes/approvalsRoutes.ts` |
| `settlePendingAmendment` | function | 12011 | `src/server/routes/approvalsRoutes.ts` |
| `applyScheduleMutation` | function | 12019 | `src/server/core/approvals.ts` |
| `wholesaleRefusal` | function | 12081 | `src/server/core/approvals.ts` |
| `countBlockingConflicts` | function | 12097 | `src/server/core/approvals.ts` |
| `blockingConflictCount` | function | 12103 | `src/server/routes/reportsRoutes.ts` |
| `blockingSummaryFor` | function | 12113 | `src/server/routes/approvalsRoutes.ts` |
| `regulationNoticesForScope` | function | 12123 | `src/server/core/approvals.ts` |
| `regulationNoticeCount` | function | 12170 | `src/server/routes/approvalsRoutes.ts` |
| `readApproval` | function | 12175 | `src/server/core/approvals.ts` |
| `readDeadlineFor` | function | 12181 | `src/server/core/approvals.ts` |
| `approvalActor` | function | 12190 | `src/server/routes/approvalsRoutes.ts` |
| `approvalScopeFromBody` | function | 12199 | `src/server/routes/approvalsRoutes.ts` |
| `refuseIfTermClosed` | function | 12210 | `src/server/core/approvals.ts` |
| `refuseIfTermFrozen` | function | 12230 | `src/server/core/approvals.ts` |
| `refuseIfStale` | function | 12241 | `src/server/routes/approvalsRoutes.ts` |
| `scheduleDataReadiness` | function | 12249 | `src/server/routes/approvalsRoutes.ts` |
| `submitToRegistrar` | function | 12545 | `src/server/routes/approvalsRoutes.ts` |
| `EXTENSION_ACTIONS` | const | 12794 | `src/server/routes/approvalsRoutes.ts` |
| `EXTENSIONS_MAX_TARGETS` | const | 12795 | `src/server/routes/approvalsRoutes.ts` |
| `NOTE_FIELDS` | const | 12909 | `src/server/routes/scheduleNotesRoutes.ts` |
| `NOTE_FIELD_LABEL` | const | 12910 | `src/server/core/notes.ts` |
| `noteFieldValue` | function | 12922 | `src/server/core/notes.ts` |
| `noteState` | function | 12940 | `src/server/core/notes.ts` |
| `notesWithState` | function | 12957 | `src/server/core/notes.ts` |
| `noteSuggestions` | function | 12988 | `src/server/routes/reportsRoutes.ts` |
| `REGISTRAR_NOTIFY_ROLES` | const | 13232 | `src/server/routes/notificationsRoutes.ts` |
| `studentQueueMemo` | const | 13244 | `src/server/core/notifications.ts` |
| `studentQueueForTerm` | function | 13245 | `src/server/routes/notificationsRoutes.ts` |
| `bellBlockingMemo` | const | 13258 | `src/server/core/notifications.ts` |
| `onSchedulesInvalidated(() => bellBlockingMemo.invalidate());` | جملة | 13259 | `src/server/core/notifications.ts` |
| `bellBlockingCount` | function | 13260 | `src/server/routes/notificationsRoutes.ts` |
| `bellPlanningTermId` | function | 13268 | `src/server/core/notifications.ts` |
| `notificationItemsForTerm` | function | 13279 | `src/server/routes/notificationsRoutes.ts` |
| `approvalBadgeForTerm` | function | 13495 | `src/server/routes/approvalsRoutes.ts` |
| `hydrateVersionRows` | function | 14367 | `src/server/core/versions.ts` |
| `briefChangedSince` | function | 14378 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `rowSignatureServer` | function | 14386 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `livingResponseCache` | const | 14408 | `src/server/core/versions.ts` |
| `LIVING_RESPONSE_TTL_MS` | const | 14409 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `onSchedulesInvalidated(() => livingResponseCache.clear());` | جملة | 14410 | `src/server/core/versions.ts` |
| `driftCache` | const | 14560 | `src/server/core/rhythm.ts` |
| `historicalTimeCache` | const | 14561 | `src/server/core/rhythm.ts` |
| `driftSerial` | let | 14562 | `src/server/core/rhythm.ts` |
| `onSchedulesInvalidated(() => { driftSerial += 1; historicalTimeCache.c` | جملة | 14563 | `src/server/core/rhythm.ts` |
| `splitArchivedCourseRows` | function | 14765 | `src/server/core/scheduleReads.ts` |
| `applyRoleTemplate` | function | 15031 | `src/server/routes/usersRoutes.ts` |
| `applyRoleScopeOnly` | function | 15078 | `src/server/routes/usersRoutes.ts` |
| `sanitizeAssigns` | function | 15179 | `src/server/routes/usersRoutes.ts` |
| `departmentHeadPlan` | function | 15231 | `src/server/routes/usersRoutes.ts` |
| `advisorPlan` | function | 15239 | `src/server/routes/usersRoutes.ts` |
| `balanceScopeLabel` | function | 15817 | `src/server/routes/reportsRoutes.ts` |
| `SHARE_DAY_KEYS` | const | 15965 | `src/server/core/shareLinks.ts` |
| `SHARE_DAY_NAMES` | const | 15966 | `src/server/core/shareLinks.ts` |
| `SHARE_ICS_DAYS` | const | 15967 | `src/server/core/shareLinks.ts` |
| `SHARE_MAX_DAYS` | const | 15968 | `src/server/routes/shareRoutes.ts` |
| `shareDayIndexes` | function | 15970 | `src/server/core/shareLinks.ts` |
| `shareLinkStillReadable` | function | 15977 | `src/server/core/shareLinks.ts` |
| `resolveShareToken` | function | 15986 | `src/server/core/shareLinks.ts` |
| `PUBLIC_VISITING_BADGE_CSS` | const | 15999 | `src/server/routes/publicStaffRoutes.ts` |
| `buildSharePayload` | function | 16002 | `src/server/core/shareLinks.ts` |
| `publicAttempts` | const | 16059 | `src/server/core/shareLinks.ts` |
| `publicAttemptKey` | const | 16060 | `src/server/core/shareLinks.ts` |
| `publicAttemptReserve` | const | 16063 | `src/server/core/shareLinks.ts` |
| `staffLookupAllowed` | function | 16066 | `src/server/routes/surveyRoutes.ts` |
| `MovementEntry` | type | 16079 | `src/server/core/staffCard.ts` |
| `MOVEMENT_REJECT_REASON` | const | 16084 | `src/server/core/staffCard.ts` |
| `requestMovementEntries` | function | 16089 | `src/server/core/staffCard.ts` |
| `movementHistoryScopes` | function | 16124 | `src/server/core/staffCard.ts` |
| `scheduleMovementEntries` | function | 16132 | `src/server/core/staffCard.ts` |
| `StaffIdentity` | type | 16179 | `src/server/routes/publicStaffRoutes.ts` |
| `buildStaffCard` | function | 16181 | `src/server/routes/publicStaffRoutes.ts` |
| `staffFamilyScopes` | function | 16449 | `src/server/core/staffCard.ts` |
| `staffFamilyShareLinks` | function | 16452 | `src/server/core/staffCard.ts` |
| `liveStaffPublication` | const | 16457 | `src/server/core/staffCard.ts` |
| `shareLinkLabel` | function | 16480 | `src/server/core/shareLinks.ts` |
| `isPersonalStaffLink` | const | 16609 | `src/server/routes/shareRoutes.ts` |
| `personalLinkEligibleIds` | function | 16611 | `src/server/routes/shareRoutes.ts` |
| `staffLinkFamilyAllowed` | const | 16625 | `src/server/routes/shareRoutes.ts` |
| `readSectionBuild` | function | 16847 | `src/server/routes/planningRoutes.ts` |
| `authorityDepartmentKeyOf` | function | 17117 | `src/server/routes/planningRoutes.ts` |
| `REMAINING_SEASONS` | const | 17129 | `src/server/core/planning.ts` |
| `REMAINING_SEASON_NAMES` | const | 17130 | `src/server/routes/planningRoutes.ts` |
| `remainingContext` | function | 17131 | `src/server/routes/planningRoutes.ts` |
| `remainingTermRefusal` | function | 17147 | `src/server/routes/planningRoutes.ts` |
| `reportTermLabelOf` | function | 17160 | `src/server/routes/planningRoutes.ts` |
| `remainingWarnings` | function | 17164 | `src/server/routes/planningRoutes.ts` |
| `remainingAssessment` | function | 17169 | `src/server/routes/planningRoutes.ts` |
| `TERM_WEEKS` | const | 17274 | `src/server/routes/publicCalendarRoutes.ts` |
| `sendCalendar` | function | 17285 | `src/server/routes/publicCalendarRoutes.ts` |
| `calendarSecret` | const | 17364 | `src/server/core/shareLinks.ts` |
| `staffDeviceSecret` | const | 17365 | `src/server/routes/publicStaffRoutes.ts` |
| `staffCookieSecure` | const | 17366 | `src/server/routes/publicStaffRoutes.ts` |
| `staffIdentityFrom` | function | 17368 | `src/server/routes/publicStaffRoutes.ts` |
| `calendarKey` | const | 17377 | `src/server/core/shareLinks.ts` |
| `holdsLiveCardLink` | function | 17415 | `src/server/routes/publicCalendarRoutes.ts` |
| `stableCalendarPath` | const | 17425 | `src/server/core/shareLinks.ts` |
| `sendInstructorCalendar` | function | 17446 | `src/server/routes/publicCalendarRoutes.ts` |
| `STAFF_NOTES_PER_DAY` | const | 17537 | `src/server/routes/publicStaffRoutes.ts` |
| `studentCaseSecretPromise` | let | 17632 | `src/server/core/studentIdentity.ts` |
| `studentCaseSecret` | const | 17633 | `src/server/core/studentIdentity.ts` |
| `surveyFingerprint` | const | 17634 | `src/server/core/studentIdentity.ts` |
| `studentIdentityKey` | const | 17637 | `src/server/core/studentIdentity.ts` |
| `sealStudentIdentity` | const | 17638 | `src/server/core/studentIdentity.ts` |
| `openStudentIdentity` | const | 17643 | `src/server/core/studentIdentity.ts` |
| `canSeeStudentIdentity` | const | 17665 | `src/server/core/studentIdentity.ts` |
| `studentIdentityFor` | const | 17666 | `src/server/core/studentIdentity.ts` |
| `degreeRuleFromName` | const | 17674 | `src/server/core/studentIdentity.ts` |
| `degreeRuleForSection` | const | 17688 | `src/server/core/studentIdentity.ts` |
| `storedDegreeRuleForSection` | const | 17702 | `src/server/core/studentIdentity.ts` |
| `planDegreeRule` | const | 17717 | `src/server/core/studentIdentity.ts` |
| `graduationCandidatesForSection` | const | 17733 | `src/server/core/studentIdentity.ts` |
| `graduationRuleFor` | const | 17743 | `src/server/core/studentIdentity.ts` |
| `isSummerTerm` | const | 17757 | `src/server/core/studentIdentity.ts` |
| `graduateThreshold` | const | 17758 | `src/server/core/studentIdentity.ts` |
| `STUDENT_PROOF_TTL_MS` | const | 17761 | `src/server/core/studentIdentity.ts` |
| `issueStudentProof` | const | 17762 | `src/server/core/studentIdentity.ts` |
| `studentProofExpired` | const | 17768 | `src/server/core/studentIdentity.ts` |
| `verifyStudentProof` | const | 17771 | `src/server/core/studentIdentity.ts` |
| `normalizeCaseRef` | const | 17784 | `src/server/routes/surveyRoutes.ts` |
| `priorNeedForHand` | const | 17786 | `src/server/routes/surveyRoutes.ts` |
| `caseRefMatches` | const | 17794 | `src/server/routes/surveyRoutes.ts` |
| `maskedInitial` | const | 17796 | `src/server/routes/surveyRoutes.ts` |
| `CASE_REF_REQUIRED` | const | 17797 | `src/server/routes/surveyRoutes.ts` |
| `reusableGraduateVerification` | const | 17805 | `src/server/routes/surveyRoutes.ts` |
| `normalizeStudentIdentityName` | const | 17836 | `src/server/routes/surveyRoutes.ts` |
| `reusableStudentIdentity` | const | 17843 | `src/server/routes/surveyRoutes.ts` |
| `asciiDigits` | const | 17860 | `src/server/core/studentIdentity.ts` |
| `surveyCohort` | const | 17862 | `src/server/core/studentIdentity.ts` |
| `surveyActiveCourseIds` | const | 17877 | `src/server/core/studentIdentity.ts` |
| `surveyCourseIdsForSection` | function | 17879 | `src/server/routes/surveyRoutes.ts` |
| `surveyTermEnded` | const | 17943 | `src/server/core/studentIdentity.ts` |
| `SURVEY_TERM_ENDED` | const | 17944 | `src/server/routes/surveyRoutes.ts` |
| `surveyPayloadCache` | const | 17950 | `src/server/core/studentIdentity.ts` |
| `SURVEY_PAYLOAD_TTL_MS` | const | 17951 | `src/server/routes/surveyRoutes.ts` |
| `STUDENT_PROOF_MAX_BYTES` | const | 18083 | `src/server/routes/surveyRoutes.ts` |
| `STUDENT_PROOF_TOO_LARGE` | const | 18084 | `src/server/routes/surveyRoutes.ts` |
| `studentProofBody` | const | 18085 | `src/server/routes/surveyRoutes.ts` |
| `readStudentProofBody` | const | 18086 | `src/server/routes/surveyRoutes.ts` |
| `GraduateProofSink` | type | 18094 | `src/server/core/studentIdentity.ts` |
| `graduateProofCore` | function | 18095 | `src/server/core/studentIdentity.ts` |
| `graduateSubmitCheck` | function | 18199 | `src/server/core/studentIdentity.ts` |
| `curriculumLabelsFor` | const | 18365 | `src/server/core/planning.ts` |
| `sectionGapCache` | const | 18384 | `src/server/routes/notificationsRoutes.ts` |
| `cachedSectionGap` | function | 18385 | `src/server/routes/notificationsRoutes.ts` |
| `sectionGapData` | function | 18393 | `src/server/core/planning.ts` |
| `sectionGapStaffing` | function | 18491 | `src/server/routes/planningRoutes.ts` |
| `canWriteRegistration` | const | 18797 | `src/server/routes/studentRegistrationRoutes.ts` |
| `grantedPermissions` | const | 18806 | `src/server/routes/studentRegistrationRoutes.ts` |
| `owningSectionsInScopeFor` | const | 18817 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_COURSE_STATES` | const | 18824 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_REJECT_REASONS` | const | 18825 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_COMMITTEE_REASONS` | const | 18826 | `src/server/routes/studentRegistrationRoutes.ts` |
| `RegistrationViewer` | type | 18837 | `src/server/routes/studentRegistrationRoutes.ts` |
| `registrationViewer` | const | 18838 | `src/server/routes/studentRegistrationRoutes.ts` |
| `reachedRegistration` | const | 18841 | `src/server/routes/studentRegistrationRoutes.ts` |
| `registrarBlockReason` | function | 18861 | `src/server/routes/studentRegistrationRoutes.ts` |
| `demoPageHint` | function | 19410 | `src/server/core/publicPages.ts` |
| `publicPageNonce` | function | 19452 | `src/server/core/publicPages.ts` |
| `staffCardPage` | function | 19479 | `src/server/pages/staffCardPage.ts` |
| `surveyPage` | function | 20075 | `src/server/pages/surveyPages.ts` |
| `studentCaseSurveyPage` | function | 20409 | `src/server/pages/surveyPages.ts` |
| `REQUEST_LINK_DAYS` | const | 20510 | `src/server/core/instructorRequests.ts` |
| `requestWindowOpen` | const | 20513 | `src/server/core/instructorRequests.ts` |
| `currentInstructorRequestGeneration` | function | 20516 | `src/server/core/instructorRequests.ts` |
| `requireCurrentInstructorRequestGeneration` | function | 20530 | `src/server/routes/instructorRequestsRoutes.ts` |
| `requestItemScope` | function | 20538 | `src/server/core/instructorRequests.ts` |
| `requestForDepartment` | function | 20553 | `src/server/routes/instructorRequestsRoutes.ts` |
| `stripForInstructor` | function | 20570 | `src/server/routes/publicRequestRoutes.ts` |
| `courseHabitMemo` | const | 20613 | `src/server/core/instructorRequests.ts` |
| `onSchedulesInvalidated(() => courseHabitMemo.clear());` | جملة | 20614 | `src/server/core/instructorRequests.ts` |
| `courseHabit` | function | 20616 | `src/server/core/instructorRequests.ts` |
| `habitBlockFor` | const | 20632 | `src/server/routes/publicRequestRoutes.ts` |
| `blockMinutesOfItem` | function | 20635 | `src/server/routes/publicRequestRoutes.ts` |
| `decisionStillApplies` | function | 20648 | `src/server/routes/publicRequestRoutes.ts` |
| `priorAddFor` | function | 20659 | `src/server/routes/publicRequestRoutes.ts` |
| `requestSlotsForCourse` | function | 20674 | `src/server/routes/publicRequestRoutes.ts` |
| `instructorRequestItemsFromPayload` | function | 20686 | `src/server/routes/publicRequestRoutes.ts` |
| `resolveRequestLink` | function | 20807 | `src/server/core/instructorRequests.ts` |
| `instructorRequestSectionCourses` | function | 20833 | `src/server/core/instructorRequests.ts` |
| `refreshUnsubmittedInstructorRequest` | function | 20853 | `src/server/routes/publicRequestRoutes.ts` |
| `InstructorRequestCourseOption` | type | 20883 | `src/server/routes/publicRequestRoutes.ts` |
| `instructorRequestDepartmentScopes` | function | 20900 | `src/server/core/instructorRequests.ts` |
| `instructorRequestCourseOptions` | function | 20928 | `src/server/routes/publicRequestRoutes.ts` |
| `originalOffering` | function | 20959 | `src/server/routes/publicRequestRoutes.ts` |
| `availableInstructorOfferings` | function | 20964 | `src/server/routes/publicRequestRoutes.ts` |
| `requestReservationProposals` | function | 21003 | `src/server/routes/publicRequestRoutes.ts` |
| `buildRequestContext` | function | 21022 | `src/server/core/instructorRequests.ts` |
| `buildSharedRequestContext` | function | 21030 | `src/server/core/instructorRequests.ts` |
| `SharedRequestContext` | type | 21063 | `src/server/core/instructorRequests.ts` |
| `requestContextFor` | function | 21065 | `src/server/core/instructorRequests.ts` |
| `requestRulesForScope` | function | 21081 | `src/server/core/instructorRequests.ts` |
| `roomUsageMemo` | const | 21146 | `src/server/core/instructorRequests.ts` |
| `roomUsageOf` | function | 21147 | `src/server/core/instructorRequests.ts` |
| `rulesInflight` | const | 21159 | `src/server/core/instructorRequests.ts` |
| `rulesOnce` | function | 21160 | `src/server/core/instructorRequests.ts` |
| `judgeRequestItems` | function | 21168 | `src/server/core/instructorRequests.ts` |
| `requireInstructorRequestRevision` | function | 21778 | `src/server/core/instructorRequests.ts` |
| `instructorRequestItemIdentity` | function | 21790 | `src/server/core/instructorRequests.ts` |
| `ApplyOp` | type | 21953 | `src/server/routes/instructorRequestsRoutes.ts` |
| `daysFlags` | const | 21958 | `src/server/routes/instructorRequestsRoutes.ts` |
| `rowBodyOf` | const | 21959 | `src/server/routes/instructorRequestsRoutes.ts` |
| `requestDayPatterns` | function | 22387 | `src/server/routes/publicRequestRoutes.ts` |
| `verifyRequestSigner` | function | 22405 | `src/server/core/instructorRequests.ts` |
| `instructorRequestPage` | function | 22777 | `src/server/pages/instructorRequestPage.ts` |
| `previousTermMemo` | const | 23951 | `src/server/routes/publicRequestRoutes.ts` |
| `cardStreams` | const | 24004 | `src/server/routes/publicRequestRoutes.ts` |
| `cardStreamTotal` | let | 24005 | `src/server/routes/publicRequestRoutes.ts` |
| `CARD_STREAMS_PER_REQUEST` | const | 24006 | `src/server/routes/publicRequestRoutes.ts` |
| `CARD_STREAMS_TOTAL` | const | 24007 | `src/server/routes/publicRequestRoutes.ts` |
| `Repository.onInstructorRequestSaved(info => {` | جملة | 24008 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitCheckTimes` | const | 24053 | `src/server/routes/publicRequestRoutes.ts` |
| `REQUEST_HOLD_TTL_MS` | const | 24126 | `src/server/routes/publicRequestRoutes.ts` |
| `registerStudyProposalRoutes(app, {` | جملة | 24192 | `server.ts` |
| `publicInvalidLinkPage` | function | 24217 | `src/server/pages/publicInvalidLinkPage.ts` |
| `offeringViewsFor` | function | 24238 | `src/server/routes/publicRequestRoutes.ts` |
| `coursesWithOffering` | function | 24257 | `src/server/routes/publicRequestRoutes.ts` |
| `taPhaseId` | const | 24268 | `src/server/core/instructorRequests.ts` |
| `taPhaseForRequest` | function | 24271 | `src/server/routes/publicRequestRoutes.ts` |
| `sendTaWave` | function | 24411 | `src/server/routes/offeringRoutes.ts` |
| `dispatchTaWaves` | function | 24441 | `src/server/routes/offeringRoutes.ts` |
| `setInterval(() => {` | جملة | 24547 | `src/server/routes/offeringRoutes.ts` |
| `seatConfigId` | const | 24552 | `src/server/routes/offeringRoutes.ts` |
| `seatSections` | function | 24554 | `src/server/routes/offeringRoutes.ts` |
| `rateLimitVerifySignature` | const | 24654 | `src/server/routes/verifyRoutes.ts` |
| `SURVEY_STATUS_GRACE_MS` | const | 24760 | `src/server/routes/surveyRoutes.ts` |
| `resolveSurveyStatusToken` | function | 24761 | `src/server/routes/surveyRoutes.ts` |
| `studentCaseStatusPage` | function | 24874 | `src/server/pages/studentCaseStatusPage.ts` |
| `registerPlanReviewRoutes(app, {` | جملة | 25032 | `server.ts` |
| `planSheetTemplate` | let | 25043 | `server.ts` |
| `for (const candidate of [path.join(process.cwd(), "public", "plans", "` | جملة | 25044 | `server.ts` |
| `{` | جملة | 25047 | `server.ts` |
| `registerAdsRoutes(app, { requireAuth, requireRootAdmin, publicPageNonc` | جملة | 25058 | `server.ts` |
| `registerRoomDoorRoutes(app, {` | جملة | 25061 | `server.ts` |
| `registerSimulationRoutes(app, {` | جملة | 25069 | `server.ts` |
| `registerInsightRoutes(app, {` | جملة | 25076 | `server.ts` |
| `registerTimeMachineRoutes(app, {` | جملة | 25083 | `server.ts` |
| `registerPushRoutes(app, {` | جملة | 25157 | `server.ts` |
| `registerStudentShowcase(app, { identityKey: studentIdentityKey, sealId` | جملة | 25169 | `server.ts` |
| `registerStudentDoorRoutes(app, {` | جملة | 25170 | `server.ts` |
| `STUDENT_QR_DAYS` | const | 25210 | `src/server/routes/shareRoutes.ts` |
| `studentSchedulePage` | function | 25212 | `src/server/pages/studentSchedulePage.ts` |
| `migrateLegacyAccountsToCommitteeRole` | function | 25898 | `server.ts` |
| `SCHEDULE_WORKSPACE_FORM_ID` | const | 25925 | `server.ts` |
| `reconcileDepartmentHeadPermissions` | function | 25926 | `server.ts` |
| `startServer` | function | 25943 | `server.ts` |
| `startServer().catch(error => {` | جملة | 26185 | `server.ts` |
