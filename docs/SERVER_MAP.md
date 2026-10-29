# خريطةُ الخادم

> مولَّدةٌ بـ `node scripts/split-server/split.mjs` — لا تُحرَّر باليد؛ تُعاد مع كل تشغيل.

المرحلة: `routes`. حجمُ `server.ts` بعد التقسيم: 920 سطراً (كان 26151).

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
| `server.ts` | 920 | جذرُ التركيب |
| `src/server/core/approvals.ts` | 374 | الاعتماد: الأقفال والمعاملات وتسجيلُ التغيير |
| `src/server/core/auth.ts` | 299 | الجلسة والهوية والصلاحيات (authMiddleware، requireAuth، requirePermission…) |
| `src/server/core/authority.ts` | 259 | مقارنةُ ملف الجهة الرسمية (PDF) بالجدول |
| `src/server/core/boot.ts` | 196 | الإقلاع: ترتيبُ تحميل الوحدات الأصلية ثم ضبطُ البيئة |
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
| `src/server/pages/staffCardPage.ts` | 595 | بطاقةُ الأستاذ العامة |
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
| `GET /api/demo/config` | 998 | `src/server/routes/systemRoutes.ts` |
| `GET /api/version` | 1010 | `src/server/routes/systemRoutes.ts` |
| `GET /api/health` | 1015 | `src/server/routes/systemRoutes.ts` |
| `POST /api/auth/demo` | 2647 | `src/server/routes/authRoutes.ts` |
| `POST /api/demo/role` | 2679 | `src/server/routes/authRoutes.ts` |
| `GET /i/:username` | 2705 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/login` | 2714 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/logout` | 2773 | `src/server/routes/authRoutes.ts` |
| `GET /api/auth/me` | 2823 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/heartbeat` | 2840 | `src/server/routes/authRoutes.ts` |
| `POST /api/demo/reset` | 2862 | `src/server/routes/authRoutes.ts` |
| `GET /api/demo/teacher-card` | 2887 | `src/server/routes/authRoutes.ts` |
| `GET /api/demo/seed-status` | 2908 | `src/server/routes/authRoutes.ts` |
| `POST /api/auth/presence` | 2937 | `src/server/routes/authRoutes.ts` |
| `GET /api/dashboard` | 2983 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/journey` | 3199 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/search` | 3247 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/colleges` | 3353 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/colleges` | 3365 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/colleges/:id` | 3379 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/colleges/:id` | 3399 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/colleges/:id/mobility` | 3415 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/colleges/:id/mobility` | 3434 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/sections` | 3446 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/schedule-day-window` | 3453 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/admin/section-schedule-windows` | 3460 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/admin/section-schedule-windows` | 3467 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/admin/teaching-load` | 3490 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/admin/teaching-load` | 3507 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/teaching-load/status` | 3516 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/sections` | 3534 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/sections/:id` | 3554 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/sections/:id` | 3579 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/terms` | 3597 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/terms/scoped` | 3608 | `src/server/routes/referenceRoutes.ts` |
| `POST /api/terms` | 3632 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/terms/:id` | 3647 | `src/server/routes/referenceRoutes.ts` |
| `DELETE /api/terms/:id` | 3665 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/instructors` | 3759 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/instructors` | 3881 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/instructors/:id` | 3928 | `src/server/routes/instructorsRoutes.ts` |
| `DELETE /api/instructors/:id` | 3966 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/location-room-types` | 3993 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/admin/location-room-types` | 4008 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/admin/location-room-types` | 4016 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/admin/location-room-types/:type` | 4028 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/admin/location-room-types/:type` | 4047 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/courses` | 4064 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/curriculum/sections/:sectionId` | 4147 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans` | 4154 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/curriculum/plans/:planId` | 4164 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans/:planId/courses` | 4194 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/curriculum/plans/:planId/courses/:courseId` | 4209 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/transitions` | 4235 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/curriculum/transitions/:id` | 4260 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/curriculum/plans/:planId/archive-readiness` | 4291 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/curriculum/plans/:planId/archive` | 4298 | `src/server/routes/coursesRoutes.ts` |
| `POST /api/courses` | 4331 | `src/server/routes/coursesRoutes.ts` |
| `PUT /api/courses/:id` | 4396 | `src/server/routes/coursesRoutes.ts` |
| `DELETE /api/courses/:id` | 4566 | `src/server/routes/coursesRoutes.ts` |
| `GET /api/schedules/events` | 5837 | `src/server/routes/scheduleLiveRoutes.ts` |
| `GET /api/schedules/pulse` | 5908 | `src/server/routes/scheduleLiveRoutes.ts` |
| `POST /api/schedules/pulse` | 5931 | `src/server/routes/scheduleLiveRoutes.ts` |
| `GET /api/schedules/workspace` | 6018 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules` | 6199 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/hall-barter` | 6258 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests` | 6265 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests/:id/respond` | 6286 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/hall-barter/requests/:id/cancel` | 6345 | `src/server/routes/hallBarterRoutes.ts` |
| `GET /api/hall-barter/inbox` | 6367 | `src/server/routes/hallBarterRoutes.ts` |
| `POST /api/schedules/import-preflight` | 6398 | `src/server/routes/scheduleImportRoutes.ts` |
| `POST /api/schedules/check-conflicts` | 6484 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/review-readiness` | 6513 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/outside-clashes` | 6659 | `src/server/routes/scheduleReviewRoutes.ts` |
| `POST /api/intelligence/nl-move` | 6716 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/nl-schedule` | 6856 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/schedules/move-batch` | 6934 | `src/server/routes/scheduleReviewRoutes.ts` |
| `GET /api/schedules/export` | 7039 | `src/server/routes/scheduleImportRoutes.ts` |
| `POST /api/schedules/import` | 7128 | `src/server/routes/scheduleImportRoutes.ts` |
| `GET /api/visiting-roster` | 7291 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/visiting-lookup` | 7334 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/reports/visiting-roster` | 7342 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/visiting-teaching` | 7361 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/instructors/:id/affiliation` | 7381 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/instructor-affiliations` | 7413 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/delegates` | 7450 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/visiting-roster` | 7466 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/department-delegates` | 7480 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/department-delegates/instructor` | 7491 | `src/server/routes/instructorsRoutes.ts` |
| `PUT /api/department-delegates/:instructorId` | 7515 | `src/server/routes/instructorsRoutes.ts` |
| `DELETE /api/department-delegates/:instructorId` | 7538 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/instructors/:id/visiting-state` | 7558 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/instructors/:id/visiting-conversion` | 7583 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/visiting-roster/instructor` | 7602 | `src/server/routes/instructorsRoutes.ts` |
| `POST /api/visiting-roster/copy` | 7617 | `src/server/routes/instructorsRoutes.ts` |
| `GET /api/reports/visiting-history` | 7635 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/department-rooms` | 7699 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/department-rooms` | 7706 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/location-registry` | 7711 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/companion-rooms` | 7841 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/location-registry/pending` | 7864 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-registry` | 7880 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-setup` | 7894 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-setup/buildings` | 7898 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-setup/buildings/:id` | 7914 | `src/server/routes/locationsRoutes.ts` |
| `DELETE /api/admin/location-setup/buildings/:id` | 7925 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-setup/rooms` | 7934 | `src/server/routes/locationsRoutes.ts` |
| `DELETE /api/admin/location-setup/rooms/:id` | 7954 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/buildings` | 7960 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/buildings/:id` | 7983 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/rooms` | 7998 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/rooms/:id` | 8014 | `src/server/routes/locationsRoutes.ts` |
| `PUT /api/admin/location-registry/review/:id` | 8084 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/admin/location-registry/migration/preview` | 8089 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/migration/apply` | 8092 | `src/server/routes/locationsRoutes.ts` |
| `POST /api/admin/location-registry/migration/:id/rollback` | 8115 | `src/server/routes/locationsRoutes.ts` |
| `GET /api/schedules/ta-conversion` | 8156 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/ta-conversion` | 8168 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/replace-instructor` | 8217 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/schedules/replace-instructor/history` | 8268 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/courses/nature` | 8285 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/rooms/owner` | 8309 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/suggest-slots` | 8334 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/placeholder-action` | 8521 | `src/server/routes/scheduleToolsRoutes.ts` |
| `GET /api/schedules/:id/exceptions` | 8653 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/:id/exceptions` | 8660 | `src/server/routes/schedulesRoutes.ts` |
| `DELETE /api/schedules/:id/exceptions/:exceptionId` | 8725 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/:id/substitutes` | 8743 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/meeting-participants` | 8876 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules/meeting-slots` | 8893 | `src/server/routes/scheduleToolsRoutes.ts` |
| `POST /api/schedules` | 9089 | `src/server/routes/schedulesRoutes.ts` |
| `PUT /api/schedules/:id` | 9281 | `src/server/routes/schedulesRoutes.ts` |
| `DELETE /api/schedules/:id` | 9309 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/copy-preview` | 9313 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/apply-proposal` | 9510 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/copy` | 9517 | `src/server/routes/schedulesRoutes.ts` |
| `GET /api/schedules/wipe-scope` | 9603 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/wipe-scope` | 9617 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/schedules/wipe-scope/restore` | 9664 | `src/server/routes/schedulesRoutes.ts` |
| `POST /api/telemetry/client` | 9702 | `src/server/routes/guideRoutes.ts` |
| `POST /api/guide/intent` | 9913 | `src/server/routes/guideRoutes.ts` |
| `GET /api/intelligence/guide-friction` | 9953 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/experience-health` | 9993 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/open-decisions` | 10015 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/open-decisions` | 10032 | `src/server/routes/intelligenceRoutes.ts` |
| `PATCH /api/intelligence/open-decisions/:id` | 10045 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/operations-review` | 10058 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/policy-simulate` | 10070 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/overview` | 10091 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/spatial-burnout` | 10137 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/conflict-solutions` | 10144 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/ripple/:id` | 10154 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/lookups` | 10174 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/genome` | 10191 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/constraints` | 10201 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/constraints` | 10206 | `src/server/routes/intelligenceRoutes.ts` |
| `PUT /api/intelligence/constraints/:id` | 10229 | `src/server/routes/intelligenceRoutes.ts` |
| `DELETE /api/intelligence/constraints/:id` | 10235 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/war-room` | 10253 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/autopilot` | 10269 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/evaluate` | 10275 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/auto-schedule` | 10286 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/copilot` | 10303 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/context/:id` | 10481 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/replay/:id` | 10541 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/room` | 10574 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/professor/:id` | 10598 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/comments/:scheduleId` | 10602 | `src/server/routes/intelligenceRoutes.ts` |
| `POST /api/intelligence/comments/:scheduleId` | 10605 | `src/server/routes/intelligenceRoutes.ts` |
| `PUT /api/intelligence/comments/:scheduleId/:commentId` | 10608 | `src/server/routes/intelligenceRoutes.ts` |
| `GET /api/intelligence/drafts` | 10620 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/smart-import` | 10624 | `src/server/routes/smartImportRoutes.ts` |
| `POST /api/intelligence/pdf-import/bootstrap-section` | 10805 | `src/server/routes/pdfImportRoutes.ts` |
| `POST /api/intelligence/pdf-import` | 10874 | `src/server/routes/pdfImportRoutes.ts` |
| `POST /api/intelligence/drafts` | 11625 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/drafts/:id/import-report` | 11738 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/approvals` | 12257 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/approvals/term` | 12311 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/sign` | 12372 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/withdraw` | 12451 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/head-return` | 12482 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/acknowledge-additions` | 12507 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/submit` | 12577 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/return` | 12600 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/accept` | 12638 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/deadline` | 12683 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/student-phases` | 12708 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extension` | 12744 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extensions` | 12783 | `src/server/routes/approvalsRoutes.ts` |
| `POST /api/approvals/extension-request` | 12855 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/schedule-notes` | 13032 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes` | 13052 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes/:id/rebut` | 13121 | `src/server/routes/scheduleNotesRoutes.ts` |
| `POST /api/schedule-notes/:id/verdict` | 13147 | `src/server/routes/scheduleNotesRoutes.ts` |
| `DELETE /api/schedule-notes/:id` | 13181 | `src/server/routes/scheduleNotesRoutes.ts` |
| `GET /api/notifications` | 13397 | `src/server/routes/notificationsRoutes.ts` |
| `POST /api/notifications/seen` | 13473 | `src/server/routes/notificationsRoutes.ts` |
| `GET /api/approvals/badge` | 13518 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/approvals/inbox` | 13530 | `src/server/routes/approvalsRoutes.ts` |
| `GET /api/reports/schedule-changes` | 13669 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/authority-pdf-diff` | 13952 | `src/server/routes/reportsRoutes.ts` |
| `PUT /api/intelligence/drafts/:id` | 13982 | `src/server/routes/draftsRoutes.ts` |
| `PATCH /api/intelligence/drafts/:id/rows/:rowId` | 13985 | `src/server/routes/draftsRoutes.ts` |
| `DELETE /api/intelligence/drafts/:id/rows/:rowId` | 14014 | `src/server/routes/draftsRoutes.ts` |
| `DELETE /api/intelligence/drafts/:id/rows` | 14033 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/drafts/:id/publish` | 14042 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/versions` | 14289 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/versions/compare` | 14292 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/versions/:id/restore` | 14295 | `src/server/routes/draftsRoutes.ts` |
| `GET /api/intelligence/compare-terms` | 14299 | `src/server/routes/draftsRoutes.ts` |
| `POST /api/intelligence/import-preview` | 14344 | `src/server/routes/smartImportRoutes.ts` |
| `GET /api/intelligence/living` | 14398 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/why` | 14457 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/why-not` | 14470 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/decision-memory` | 14484 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/decision-memory` | 14490 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/context-copilot` | 14498 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/emergency` | 14516 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/department-start-rhythm` | 14551 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/settled-drift` | 14575 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/rollover` | 14694 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/genesis` | 14758 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/brief` | 14822 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/meeting-minutes` | 14826 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/intelligence/safety-net` | 14830 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `POST /api/intelligence/safety-net/:id/undo` | 14834 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `GET /api/system-backup/status` | 14848 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/export-jobs` | 14873 | `src/server/routes/adminRoutes.ts` |
| `DELETE /api/system-backup/export-jobs` | 14879 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export-jobs/:id` | 14884 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/export-jobs/:id/step` | 14888 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export-jobs/:id/download` | 14893 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/export` | 14907 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/preview` | 14911 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import-jobs` | 14934 | `src/server/routes/adminRoutes.ts` |
| `GET /api/system-backup/import-jobs/:id` | 14944 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import-jobs/:id/step` | 14948 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/import` | 14953 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/reset` | 14957 | `src/server/routes/adminRoutes.ts` |
| `POST /api/system-backup/undo` | 14970 | `src/server/routes/adminRoutes.ts` |
| `GET /api/audit-logs` | 14984 | `src/server/routes/adminRoutes.ts` |
| `GET /api/admin-user-options` | 14989 | `src/server/routes/adminRoutes.ts` |
| `GET /api/admin-instructor-options` | 14995 | `src/server/routes/adminRoutes.ts` |
| `GET /api/roles` | 15073 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users` | 15080 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users` | 15103 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/grant-decision-centre` | 15195 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users/department-heads/preview` | 15232 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/department-heads` | 15236 | `src/server/routes/usersRoutes.ts` |
| `GET /api/users/advisors/preview` | 15261 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/advisors` | 15265 | `src/server/routes/usersRoutes.ts` |
| `POST /api/users/advisors/consolidate` | 15296 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/users/:id` | 15338 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/users/:id` | 15448 | `src/server/routes/usersRoutes.ts` |
| `GET /api/permissions/forms` | 15456 | `src/server/routes/usersRoutes.ts` |
| `GET /api/permissions` | 15460 | `src/server/routes/usersRoutes.ts` |
| `POST /api/permissions` | 15464 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/permissions/:id` | 15473 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/permissions/:id` | 15480 | `src/server/routes/usersRoutes.ts` |
| `GET /api/user-scopes` | 15492 | `src/server/routes/usersRoutes.ts` |
| `POST /api/user-scopes` | 15496 | `src/server/routes/usersRoutes.ts` |
| `PUT /api/user-scopes/:id` | 15505 | `src/server/routes/usersRoutes.ts` |
| `DELETE /api/user-scopes/:id` | 15514 | `src/server/routes/usersRoutes.ts` |
| `GET /api/reports/excel/:type` | 15525 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/search/natural` | 15649 | `src/server/routes/dashboardRoutes.ts` |
| `GET /api/reports/department-balance` | 15811 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/reports/room-load` | 15893 | `src/server/routes/reportsRoutes.ts` |
| `GET /api/share` | 16447 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share` | 16475 | `src/server/routes/shareRoutes.ts` |
| `DELETE /api/share/:id` | 16548 | `src/server/routes/shareRoutes.ts` |
| `GET /api/share/:id/faculty` | 16617 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share/:id/personal` | 16637 | `src/server/routes/shareRoutes.ts` |
| `POST /api/share/:id/sent` | 16678 | `src/server/routes/shareRoutes.ts` |
| `GET /api/share-personal` | 16690 | `src/server/routes/shareRoutes.ts` |
| `GET /api/registration-stats` | 16725 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/preview` | 16930 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/apply` | 16948 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/review-rows` | 17004 | `src/server/routes/planningRoutes.ts` |
| `POST /api/section-build/undo` | 17044 | `src/server/routes/planningRoutes.ts` |
| `GET /api/forecast/term` | 17070 | `src/server/routes/planningRoutes.ts` |
| `PUT /api/registration-stats` | 17092 | `src/server/routes/planningRoutes.ts` |
| `POST /api/registration-stats/remaining-pdf` | 17159 | `src/server/routes/planningRoutes.ts` |
| `POST /api/registration-stats/remaining-cells` | 17211 | `src/server/routes/planningRoutes.ts` |
| `GET /api/public/schedule/:token` | 17234 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics/:token` | 17306 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics/:token/:key` | 17363 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/cal/:token/:key` | 17388 | `src/server/routes/publicCalendarRoutes.ts` |
| `GET /api/public/ics-reminder` | 17418 | `src/server/routes/publicCalendarRoutes.ts` |
| `POST /api/public/staff/:token/note` | 17522 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /api/degree-rules` | 17873 | `src/server/routes/referenceRoutes.ts` |
| `PUT /api/degree-rules/:sectionId` | 17895 | `src/server/routes/referenceRoutes.ts` |
| `GET /api/public/survey/:token` | 17936 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/identity-status` | 17996 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/proof-status` | 18044 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token/proof` | 18169 | `src/server/routes/surveyRoutes.ts` |
| `POST /api/public/survey/:token` | 18209 | `src/server/routes/surveyRoutes.ts` |
| `GET /api/schedules/section-gap/decisions` | 18416 | `src/server/routes/planningRoutes.ts` |
| `PUT /api/schedules/section-gap/decisions` | 18422 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/section-gap` | 18445 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/section-gap/staffing` | 18459 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/openings-preview` | 18518 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/academic-advice` | 18544 | `src/server/routes/planningRoutes.ts` |
| `GET /api/schedules/demand` | 18557 | `src/server/routes/planningRoutes.ts` |
| `GET /api/student-registration` | 18853 | `src/server/routes/studentRegistrationRoutes.ts` |
| `POST /api/student-registration/:id/course-state` | 19007 | `src/server/routes/studentRegistrationRoutes.ts` |
| `POST /api/student-registration/:id/case-state` | 19196 | `src/server/routes/studentRegistrationRoutes.ts` |
| `GET /api/schedules/staff-inbox` | 19253 | `src/server/routes/planningRoutes.ts` |
| `POST /api/public/staff/:token/forget` | 19285 | `src/server/routes/publicStaffRoutes.ts` |
| `POST /api/public/staff/:token` | 19291 | `src/server/routes/publicStaffRoutes.ts` |
| `POST /api/instructor-requests/issue` | 21363 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/instructor-requests/exceptions` | 21575 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/exception/revoke` | 21598 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/instructor-requests` | 21624 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/decide` | 21774 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/apply` | 21950 | `src/server/routes/instructorRequestsRoutes.ts` |
| `POST /api/instructor-requests/:id/reply` | 22228 | `src/server/routes/instructorRequestsRoutes.ts` |
| `GET /api/public/request/:token` | 22272 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token` | 22414 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/reply` | 22584 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/reply-batch` | 22678 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check` | 23754 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/academic-advice` | 23839 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check-batch` | 23873 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/previous` | 23924 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/events` | 23988 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/check-times` | 24033 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/hold` | 24099 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/public/request/:token/movement` | 24135 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /r/:token` | 24193 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/interest` | 24248 | `src/server/routes/publicRequestRoutes.ts` |
| `POST /api/public/request/:token/stick` | 24268 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /api/course-offering` | 24333 | `src/server/routes/offeringRoutes.ts` |
| `PUT /api/course-offering` | 24364 | `src/server/routes/offeringRoutes.ts` |
| `GET /api/ta-phase` | 24429 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/allowed` | 24467 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/open` | 24484 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/ta-phase/close` | 24508 | `src/server/routes/offeringRoutes.ts` |
| `GET /api/advisor-seats` | 24545 | `src/server/routes/offeringRoutes.ts` |
| `PUT /api/advisor-seats/config` | 24561 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/advisor-seats/add` | 24571 | `src/server/routes/offeringRoutes.ts` |
| `POST /api/advisor-seats/exception` | 24594 | `src/server/routes/offeringRoutes.ts` |
| `GET /r/:token/proposal/:pid` | 24608 | `src/server/routes/publicRequestRoutes.ts` |
| `GET /verify ، /verify/:code` | 24634 | `src/server/routes/verifyRoutes.ts` |
| `POST /api/public/verify` | 24639 | `src/server/routes/verifyRoutes.ts` |
| `POST /api/public/survey/:token/my-case` | 24744 | `src/server/routes/surveyRoutes.ts` |
| `GET /m/:token` | 24973 | `src/server/routes/surveyRoutes.ts` |
| `GET /q/:token` | 24986 | `src/server/routes/surveyRoutes.ts` |
| `GET /me ، /me/` | 25159 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /api/public/students/:token` | 25604 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /t/:token` | 25619 | `src/server/routes/publicStaffRoutes.ts` |
| `GET /s/:token` | 25633 | `src/server/routes/publicStaffRoutes.ts` |

## خريطةُ النقل: التعريفات والجمل

| الاسم | النوع | السطر القديم | الملف الجديد |
|---|---|---:|---|
| `configureRuntimeEnvironment();` | جملة | 238 | `src/server/core/boot.ts` |
| `app` | const | 240 | `server.ts` |
| `app.set("trust proxy", 1);` | app | 249 | `server.ts` |
| `PORT` | const | 252 | `server.ts` |
| `arabicUiCollator` | const | 259 | `src/server/core/ordering.ts` |
| `foldHeaderIdentity` | const | 260 | `src/server/core/ordering.ts` |
| `isSpecialEducationIdentity` | const | 265 | `src/server/core/ordering.ts` |
| `academicSectionNameMatches` | const | 277 | `src/server/core/ordering.ts` |
| `sortArabicNamed` | const | 289 | `src/server/core/ordering.ts` |
| `verifiedRoomKey` | const | 291 | `src/server/core/ordering.ts` |
| `verifiedBuildingKey` | const | 295 | `src/server/core/ordering.ts` |
| `termChronologyServer` | const | 299 | `src/server/core/ordering.ts` |
| `sortTermsNewestServer` | const | 305 | `src/server/core/ordering.ts` |
| `dataContextCacheKey` | const | 319 | `src/server/core/locations.ts` |
| `locationRegistryCache` | const | 321 | `src/server/core/locations.ts` |
| `readLocationRegistry` | function | 322 | `src/server/core/locations.ts` |
| `invalidateLocationRegistry` | function | 336 | `src/server/core/locations.ts` |
| `provisionBranchSiteLocationsFromAuthority` | function | 356 | `src/server/routes/pdfImportRoutes.ts` |
| `confirmedDepartmentRoomIds` | const | 427 | `src/server/core/locations.ts` |
| `DepartmentRoomReference` | type | 428 | `src/server/routes/locationsRoutes.ts` |
| `canonicalizeLocationForWrite` | function | 430 | `src/server/core/locations.ts` |
| `canonicalizeHistoricalLocationForRuntime` | function | 469 | `src/server/core/locations.ts` |
| `asyncSafe` | const | 496 | `src/server/core/http.ts` |
| `for (const verb of ["get", "post", "put", "patch", "delete", "all", "u` | جملة | 510 | `server.ts` |
| `process.on("unhandledRejection", (reason) => {` | جملة | 516 | `server.ts` |
| `process.on("uncaughtException", (error) => {` | جملة | 519 | `server.ts` |
| `app.disable("x-powered-by");` | app | 523 | `server.ts` |
| `app.use((req, res, next) => {` | app | 524 | `server.ts` |
| `app.use(compression({` | app | 565 | `server.ts` |
| `app.use(["/api/system-backup/preview", "/api/system-backup/import", "/` | app | 579 | `server.ts` |
| `   كبيراً قبل أن يصل إلى المسار. safeDraftRows يقصّ كل حقل ويحدّ الصفو` | app | 586 | `server.ts` |
| `app.use(express.json({ limit: "1mb" }));` | app | 587 | `server.ts` |
| `app.use((req, res, next) => {` | app | 591 | `server.ts` |
| `getCookies` | function | 617 | `src/server/core/auth.ts` |
| `loginAttempts` | const | 632 | `src/server/routes/authRoutes.ts` |
| `rateLimitLogin` | function | 633 | `src/server/routes/authRoutes.ts` |
| `rateLimitHeavyReport` | const | 666 | `src/server/routes/reportsRoutes.ts` |
| `requestTokenKey` | const | 680 | `src/server/core/rateLimits.ts` |
| `REQUEST_IP_CEILING` | const | 684 | `src/server/core/rateLimits.ts` |
| `REQUEST_TOKEN_CEILING` | const | 685 | `src/server/core/rateLimits.ts` |
| `rateLimitPublicRequest` | const | 688 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitCardEvents` | const | 698 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitDocumentRead` | const | 709 | `src/server/routes/planningRoutes.ts` |
| `rateLimitDemoRole` | const | 717 | `src/server/routes/authRoutes.ts` |
| `readRateLimitEnv` | function | 743 | `src/server/core/rateLimits.ts` |
| `PUBLIC_RATE_LIMIT_MAX` | const | 750 | `src/server/core/rateLimits.ts` |
| `PUBLIC_RATE_LIMIT_WINDOW_MS` | const | 751 | `src/server/core/rateLimits.ts` |
| `publicRequestWindows` | const | 752 | `src/server/core/rateLimits.ts` |
| `publicRateLimitSweptAt` | let | 753 | `src/server/core/rateLimits.ts` |
| `rateLimitPublic` | function | 755 | `src/server/core/rateLimits.ts` |
| `app.use("/api/public", rateLimitPublic);` | app | 788 | `server.ts` |
| `requestLinkLimit` | const | 789 | `src/server/core/rateLimits.ts` |
| `app.use("/api/public/request/:token", requestLinkLimit);` | app | 795 | `server.ts` |
| `app.use(adInjection());` | app | 797 | `server.ts` |
| `SERVER_IDLE_SESSION_MS` | const | 799 | `src/server/core/auth.ts` |
| `DEMO_SESSION_TTL_MS` | const | 800 | `src/server/core/auth.ts` |
| `AuthenticatedRequest` | interface | 803 | `src/server/core/auth.ts` |
| `AUTH_CACHE_MS` | const | 829 | `src/server/core/auth.ts` |
| `authCache` | const | 830 | `src/server/core/auth.ts` |
| `SESSION_TOUCH_EVERY_MS` | const | 851 | `src/server/core/auth.ts` |
| `sessionTouchedAt` | const | 852 | `src/server/core/auth.ts` |
| `touchSession` | function | 854 | `src/server/core/auth.ts` |
| `forgetAuthSession` | function | 871 | `src/server/routes/authRoutes.ts` |
| `Repository.onIdentityChanged?.(() => authCache.clear());` | جملة | 875 | `src/server/core/auth.ts` |
| `deadSessions` | const | 880 | `src/server/core/auth.ts` |
| `sessionLookups` | const | 881 | `src/server/core/auth.ts` |
| `sessionLookupRefusedLoggedAt` | let | 882 | `src/server/core/auth.ts` |
| `authMiddleware` | function | 884 | `src/server/core/auth.ts` |
| `databaseDown` | let | 973 | `src/server/core/state.ts` |
| `databaseDownRef` | let | 984 | `src/server/core/state.ts` |
| `app.use("/api", (req, res, next) => {` | app | 1023 | `server.ts` |
| `bindPublicLinkContext` | function | 1040 | `src/server/core/auth.ts` |
| `   شبكةُ الجامعة تفتح ألف رابطٍ صحيح ولا تُحجب، ومن يخمّن يُوقَف قبل أ` | app | 1049 | `server.ts` |
| `app.use(PUBLIC_LINK_PAGE_PREFIXES.map(prefix => `${prefix}:token`), bi` | app | 1050 | `server.ts` |
| `app.use("/api", (req: Request, res: Response, next: NextFunction) => {` | app | 1054 | `server.ts` |
| `app.use("/api", authMiddleware as express.RequestHandler);` | app | 1069 | `server.ts` |
| `DEMO_READ_ONLY_PREFIXES` | const | 1073 | `src/server/core/auth.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1074 | `server.ts` |
| `   حارس الأدوار: نقطة واحدة، لا مئة` | app | 1104 | `server.ts` |
| `ApiPerformanceSample` | type | 1116 | `src/server/core/http.ts` |
| `apiPerformanceSamples` | const | 1117 | `src/server/core/http.ts` |
| `API_PERFORMANCE_LIMIT` | const | 1118 | `src/server/core/http.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1119 | `server.ts` |
| `app.use("/api", (req: AuthenticatedRequest, res: Response, next: NextF` | app | 1139 | `server.ts` |
| `DEMO_SESSION_GONE` | const | 1224 | `src/server/core/auth.ts` |
| `signInRequiredMessage` | function | 1225 | `src/server/core/auth.ts` |
| `requireAuth` | function | 1230 | `src/server/core/auth.ts` |
| `powerOnlyFormIds` | const | 1240 | `src/server/core/auth.ts` |
| `DECISION_CENTRE_FORM_ID` | const | 1243 | `src/server/routes/usersRoutes.ts` |
| `isPowerUser` | function | 1244 | `src/server/core/auth.ts` |
| `requirePowerAdmin` | function | 1247 | `src/server/core/auth.ts` |
| `ROOT_ADMIN_USER_ID` | const | 1253 | `src/server/core/auth.ts` |
| `requireRootAdmin` | function | 1254 | `src/server/core/auth.ts` |
| `SYSTEM_BACKUP_MAX_BYTES` | const | 1263 | `src/server/routes/adminRoutes.ts` |
| `gunzipBounded` | function | 1278 | `src/server/routes/adminRoutes.ts` |
| `readSystemBackupBody` | function | 1302 | `src/server/routes/adminRoutes.ts` |
| `limitConcurrency` | function | 1328 | `src/server/core/http.ts` |
| `documentReadingGate` | const | 1353 | `src/server/core/http.ts` |
| `requirePermission` | function | 1356 | `src/server/core/auth.ts` |
| `requireAnyPermission` | function | 1381 | `src/server/core/auth.ts` |
| `isScopeAllowed` | function | 1401 | `src/server/core/scope.ts` |
| `filterByScope` | function | 1457 | `src/server/core/scope.ts` |
| `legacyFDetail` | function | 1486 | `src/server/core/scope.ts` |
| `safeSystemUser` | function | 1496 | `src/server/core/scope.ts` |
| `captureScopeVersion` | function | 1515 | `src/server/core/versions.ts` |
| `recordVersionAfter` | function | 1527 | `src/server/core/versions.ts` |
| `confirmTokens` | function | 1540 | `src/server/core/versions.ts` |
| `scopeOverwriteRefusal` | function | 1550 | `src/server/core/versions.ts` |
| `replacementAction` | function | 1571 | `src/server/core/versions.ts` |
| `safeImportEvidence` | function | 1580 | `src/server/core/smartImport.ts` |
| `PdfImportReceipt` | type | 1601 | `src/server/core/smartImport.ts` |
| `signPdfImportReceipt` | function | 1602 | `src/server/routes/pdfImportRoutes.ts` |
| `verifyPdfImportReceipt` | function | 1608 | `src/server/routes/draftsRoutes.ts` |
| `DRAFT_DOCUMENT_MAX_BYTES` | const | 1622 | `src/server/routes/draftsRoutes.ts` |
| `safeDraftRows` | function | 1624 | `src/server/core/smartImport.ts` |
| `AUTHORITY_PDF_COMPARE_FIELDS` | const | 1670 | `src/server/core/authority.ts` |
| `authorityCourseCodeMap` | function | 1680 | `src/server/core/authority.ts` |
| `buildAuthorityPdfDiff` | function | 1685 | `src/server/core/authority.ts` |
| `inferAuthorityBranchCode` | function | 1885 | `src/server/core/authority.ts` |
| `branchOwnScopes` | function | 1898 | `src/server/core/smartImport.ts` |
| `placeholderInstructorIds` | function | 1919 | `src/server/core/smartImport.ts` |
| `approvalBlockerOptions` | function | 1928 | `src/server/core/smartImport.ts` |
| `blockingImportConflicts` | function | 1936 | `src/server/core/smartImport.ts` |
| `collegeFallbackInstructorIds` | function | 1958 | `src/server/core/smartImport.ts` |
| `visitingToFacultyPlan` | function | 1977 | `src/server/core/smartImport.ts` |
| `departmentInstructorIdSet` | function | 1995 | `src/server/core/smartImport.ts` |
| `validateSmartRows` | function | 2024 | `src/server/core/smartImport.ts` |
| `mapSmartIssuesToRows` | function | 2135 | `src/server/core/smartImport.ts` |
| `smartContextFrom` | function | 2157 | `src/server/core/smartImport.ts` |
| `resolveSmartContext` | function | 2178 | `src/server/core/smartImport.ts` |
| `breathe` | const | 2214 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `intelligenceReadScopes` | function | 2217 | `src/server/core/scope.ts` |
| `scopedScheduleUniverse` | function | 2224 | `src/server/core/scope.ts` |
| `clientScopeDetails` | function | 2235 | `src/server/routes/authRoutes.ts` |
| `demoSessionPayload` | function | 2304 | `src/server/routes/authRoutes.ts` |
| `readDemoIdentity` | function | 2316 | `src/server/routes/authRoutes.ts` |
| `DEMO_STORY_SCOPE` | const | 2340 | `src/server/core/demo.ts` |
| `demoSeedJobs` | const | 2341 | `src/server/routes/authRoutes.ts` |
| `demoSeedStatus` | const | 2342 | `src/server/routes/authRoutes.ts` |
| `scheduleDemoExtras` | function | 2348 | `src/server/routes/authRoutes.ts` |
| `seedDemoTeacherCourses` | function | 2377 | `src/server/routes/authRoutes.ts` |
| `seedDemoAvailableCourses` | function | 2418 | `src/server/routes/authRoutes.ts` |
| `seedDemoStories` | function | 2474 | `src/server/routes/authRoutes.ts` |
| `roleDescriptor` | function | 2796 | `src/server/routes/authRoutes.ts` |
| `demoTeacherRequest` | function | 2880 | `src/server/core/demo.ts` |
| `PRESENCE_DAYS` | const | 2930 | `src/server/routes/authRoutes.ts` |
| `cleanMarkPart` | const | 2931 | `src/server/routes/authRoutes.ts` |
| `TEXT_LIMIT` | const | 3307 | `src/server/core/input.ts` |
| `cleanText` | function | 3311 | `src/server/core/input.ts` |
| `boundedInt` | function | 3320 | `src/server/core/input.ts` |
| `boundedDecimal` | function | 3329 | `src/server/routes/coursesRoutes.ts` |
| `COURSE_LIMIT` | const | 3341 | `src/server/routes/coursesRoutes.ts` |
| `courseNumberIssue` | function | 3344 | `src/server/routes/coursesRoutes.ts` |
| `collegeMobilityHistoryCache` | const | 3414 | `src/server/routes/referenceRoutes.ts` |
| `teachingLoadHoursForTerm` | function | 3484 | `src/server/routes/referenceRoutes.ts` |
| `scopedTermsCache` | const | 3607 | `src/server/routes/referenceRoutes.ts` |
| `instructorsForReader` | function | 3698 | `src/server/core/scope.ts` |
| `instructorCircleCache` | const | 3716 | `src/server/routes/instructorsRoutes.ts` |
| `instructorCircleFor` | function | 3717 | `src/server/routes/instructorsRoutes.ts` |
| `maskCivilTail` | function | 3744 | `src/server/routes/instructorsRoutes.ts` |
| `instructorsForScope` | function | 3750 | `src/server/routes/instructorsRoutes.ts` |
| `courseNameCollator` | const | 3980 | `src/server/core/ordering.ts` |
| `sortCoursesByName` | const | 3981 | `src/server/core/ordering.ts` |
| `curriculumOverview` | function | 4127 | `src/server/routes/coursesRoutes.ts` |
| `curriculumArchiveReadiness` | function | 4267 | `src/server/routes/coursesRoutes.ts` |
| `committeeCatalogEditAllowed` | function | 4316 | `src/server/routes/coursesRoutes.ts` |
| `refuseCommitteeCatalogEdit` | function | 4327 | `src/server/routes/coursesRoutes.ts` |
| `SCHEDULE_DAY_KEYS` | const | 4592 | `src/server/core/scheduleRules.ts` |
| `scheduleOverlap` | const | 4609 | `src/server/core/scheduleRules.ts` |
| `sectionScheduleWindowCache` | const | 4611 | `src/server/core/scheduleRules.ts` |
| `sectionScheduleWindow` | function | 4612 | `src/server/core/scheduleRules.ts` |
| `mixedPatternNotice` | function | 4622 | `src/server/core/scheduleRules.ts` |
| `scheduleLengthIssue` | function | 4633 | `src/server/core/scheduleRules.ts` |
| `scheduleLengthNotice` | function | 4652 | `src/server/routes/scheduleReviewRoutes.ts` |
| `schedulePayloadIssues` | function | 4659 | `src/server/core/scheduleRules.ts` |
| `roomOwnership` | function | 4675 | `src/server/core/scheduleRules.ts` |
| `roomScopeNotice` | function | 4704 | `src/server/core/scheduleConflicts.ts` |
| `HALL_BARTER_MIN_WINDOW_MINUTES` | const | 4721 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_MAX_OPPORTUNITIES` | const | 4722 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_DAY_LABEL` | const | 4723 | `src/server/core/hallBarter.ts` |
| `HALL_BARTER_STALE_DAYS` | const | 4726 | `src/server/routes/hallBarterRoutes.ts` |
| `HALL_BARTER_STALE_REASON` | const | 4727 | `src/server/routes/hallBarterRoutes.ts` |
| `sweepStaleHallBarter` | function | 4729 | `src/server/routes/hallBarterRoutes.ts` |
| `HallCampusGender` | type | 4741 | `src/server/routes/hallBarterRoutes.ts` |
| `hallCampusGender` | function | 4742 | `src/server/routes/hallBarterRoutes.ts` |
| `sameHallCampusGender` | function | 4752 | `src/server/routes/hallBarterRoutes.ts` |
| `hallBarterSerial` | let | 4759 | `src/server/core/state.ts` |
| `hallBarterBoardCache` | const | 4760 | `src/server/core/hallBarter.ts` |
| `academicStartYear` | function | 4762 | `src/server/core/hallBarter.ts` |
| `recentTenYearTermIds` | function | 4766 | `src/server/routes/intelligenceRoutes.ts` |
| `rowOccupiesWindow` | function | 4775 | `src/server/routes/hallBarterRoutes.ts` |
| `barterRequestRoomKey` | function | 4795 | `src/server/core/hallBarter.ts` |
| `barterRequestMatchesRow` | function | 4798 | `src/server/core/hallBarter.ts` |
| `barterRequestOverlaps` | function | 4799 | `src/server/routes/hallBarterRoutes.ts` |
| `hallBarterAllowsRoomUse` | function | 4804 | `src/server/core/hallBarter.ts` |
| `hallBarterRequestShape` | function | 4813 | `src/server/routes/hallBarterRoutes.ts` |
| `buildHallBarterBoard` | function | 4831 | `src/server/routes/hallBarterRoutes.ts` |
| `normalizedBuilding` | function | 5064 | `src/server/core/scheduleRules.ts` |
| `travelPairKey` | function | 5065 | `src/server/core/scheduleRules.ts` |
| `travelMinutesFor` | function | 5066 | `src/server/core/scheduleRules.ts` |
| `rowsOverlapOnDay` | function | 5076 | `src/server/routes/intelligenceRoutes.ts` |
| `spatialBurnoutAnalysis` | function | 5077 | `src/server/routes/intelligenceRoutes.ts` |
| `roomIsFreeForRow` | function | 5103 | `src/server/routes/intelligenceRoutes.ts` |
| `roomCastlingProposals` | function | 5111 | `src/server/routes/intelligenceRoutes.ts` |
| `CAMPUS_LABEL` | const | 5142 | `src/server/core/scheduleConflicts.ts` |
| `interCampusWarnings` | function | 5152 | `src/server/core/scheduleConflicts.ts` |
| `describeScheduleChange` | function | 5196 | `src/server/core/scheduleRules.ts` |
| `DepartmentStyle` | interface | 5229 | `src/server/core/rhythm.ts` |
| `NO_COHORT` | const | 5237 | `src/server/core/rhythm.ts` |
| `rhythmCache` | const | 5238 | `src/server/core/rhythm.ts` |
| `rhythmRefreshing` | const | 5239 | `src/server/core/rhythm.ts` |
| `RHYTHM_STALE_MS` | const | 5245 | `src/server/core/rhythm.ts` |
| `styleOf` | const | 5246 | `src/server/core/rhythm.ts` |
| `departmentStyle` | function | 5248 | `src/server/core/rhythm.ts` |
| `readDepartmentStyle` | function | 5265 | `src/server/core/rhythm.ts` |
| `scheduleConflicts` | function | 5323 | `src/server/core/scheduleConflicts.ts` |
| `applyRequestHoldOverride` | function | 5545 | `src/server/core/scheduleConflicts.ts` |
| `noteRequestHoldOverride` | function | 5563 | `src/server/core/scheduleConflicts.ts` |
| `requestHoldRefusal` | function | 5582 | `src/server/core/scheduleConflicts.ts` |
| `PresenceMark` | interface | 5620 | `src/server/core/liveChannel.ts` |
| `ScheduleEventClient` | interface | 5629 | `src/server/core/liveChannel.ts` |
| `scheduleEventClients` | const | 5646 | `src/server/core/liveChannel.ts` |
| `scheduleEventTimer` | let | 5647 | `src/server/core/liveChannel.ts` |
| `scheduleEventSerial` | let | 5648 | `src/server/core/liveChannel.ts` |
| `scheduleChangeClock` | const | 5651 | `src/server/core/liveChannel.ts` |
| `notifyClock` | const | 5652 | `src/server/core/liveChannel.ts` |
| `broadcastScheduleChange` | function | 5654 | `src/server/core/liveChannel.ts` |
| `broadcastNotify` | function | 5674 | `src/server/core/liveChannel.ts` |
| `for (const prefix of ["/api/approvals", "/api/schedule-notes", "/api/i` | جملة | 5683 | `server.ts` |
| `broadcastStudentNotifySoon` | const | 5694 | `src/server/core/liveChannel.ts` |
| `app.use("/api/student-registration", (req: Request, res: Response, nex` | app | 5695 | `server.ts` |
| `PRESENCE_STALE_MS` | const | 5709 | `src/server/core/liveChannel.ts` |
| `PRESENCE_GONE_MS` | const | 5710 | `src/server/core/liveChannel.ts` |
| `presenceDirty` | const | 5711 | `src/server/core/liveChannel.ts` |
| `presenceFlushTimer` | let | 5712 | `src/server/core/liveChannel.ts` |
| `emptyMark` | const | 5714 | `src/server/core/liveChannel.ts` |
| `boardScopeKey` | const | 5715 | `src/server/core/liveChannel.ts` |
| `hasMark` | const | 5716 | `src/server/core/liveChannel.ts` |
| `presenceRoster` | function | 5726 | `src/server/core/liveChannel.ts` |
| `broadcastPresence` | function | 5746 | `src/server/core/liveChannel.ts` |
| `markPresenceDirty` | function | 5759 | `src/server/core/liveChannel.ts` |
| `setInterval(() => {` | جملة | 5777 | `src/server/core/liveChannel.ts` |
| `pendingScheduleSessions` | const | 5795 | `src/server/core/liveChannel.ts` |
| `onSchedulesInvalidated(() => {` | جملة | 5796 | `src/server/core/liveChannel.ts` |
| `stopScheduleBeacon` | let | 5820 | `src/server/core/liveChannel.ts` |
| `listenForScheduleChangesAcrossInstances` | function | 5821 | `src/server/core/liveChannel.ts` |
| `pulseClients` | const | 5907 | `src/server/routes/scheduleLiveRoutes.ts` |
| `readLiveVisitingRoster` | function | 5951 | `src/server/core/visiting.ts` |
| `readVisitingStatus` | function | 5971 | `src/server/core/visiting.ts` |
| `visitingChecker` | function | 5992 | `src/server/core/visiting.ts` |
| `readsFinalSchedulesOnly` | function | 6092 | `src/server/core/scheduleReads.ts` |
| `termEndedForReading` | function | 6100 | `src/server/core/scheduleReads.ts` |
| `finalRowsWithFinality` | function | 6105 | `src/server/core/scheduleReads.ts` |
| `finalRowsOnly` | function | 6126 | `src/server/core/scheduleReads.ts` |
| `readSchedulesForRequest` | function | 6134 | `src/server/core/scheduleReads.ts` |
| `scopeSectionIdsFor` | function | 6150 | `src/server/core/scheduleReads.ts` |
| `readScopedTermRows` | function | 6155 | `src/server/routes/dashboardRoutes.ts` |
| `readLiveSchedulesForRequest` | function | 6177 | `src/server/core/scheduleReads.ts` |
| `checkLengthIssue` | function | 6453 | `src/server/routes/scheduleReviewRoutes.ts` |
| `checkLocationIssues` | function | 6465 | `src/server/routes/scheduleReviewRoutes.ts` |
| `previewNaturalLanguageMove` | function | 6760 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `executeGeminiScheduleCalls` | function | 6815 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `dropStaleHallIdentity` | function | 6901 | `src/server/routes/scheduleReviewRoutes.ts` |
| `movedRowsCollisions` | function | 6913 | `src/server/routes/scheduleReviewRoutes.ts` |
| `hallTextChangedWithoutIdentity` | function | 6926 | `src/server/routes/scheduleReviewRoutes.ts` |
| `wholeCollegeSectionIds` | function | 7302 | `src/server/routes/reportsRoutes.ts` |
| `visitingLookupFor` | function | 7321 | `src/server/routes/instructorsRoutes.ts` |
| `locationIdList` | const | 7872 | `src/server/routes/locationsRoutes.ts` |
| `locationAliases` | const | 7873 | `src/server/routes/locationsRoutes.ts` |
| `officialBuildingCollegeIds` | const | 7874 | `src/server/routes/locationsRoutes.ts` |
| `taConversionState` | function | 8126 | `src/server/routes/scheduleToolsRoutes.ts` |
| `WEEK_EXCEPTION_DATE` | const | 8636 | `src/server/routes/schedulesRoutes.ts` |
| `weekExceptionDayKey` | function | 8638 | `src/server/core/scheduleRules.ts` |
| `readScheduleForException` | function | 8645 | `src/server/routes/schedulesRoutes.ts` |
| `meetingExcludedIds` | function | 8843 | `src/server/core/scheduleRules.ts` |
| `requireMeetingAccess` | const | 8857 | `src/server/routes/scheduleToolsRoutes.ts` |
| `meetingDepartmentPeople` | function | 8864 | `src/server/routes/scheduleToolsRoutes.ts` |
| `SCHEDULE_ORIGIN_KINDS` | const | 8931 | `src/server/core/scheduleWrites.ts` |
| `scheduleOriginOf` | function | 8932 | `src/server/core/scheduleWrites.ts` |
| `companionBookingFor` | function | 8947 | `src/server/core/scheduleWrites.ts` |
| `createScheduleHandler` | const | 8965 | `src/server/core/scheduleWrites.ts` |
| `updateScheduleHandler` | const | 9091 | `src/server/core/scheduleWrites.ts` |
| `deleteScheduleHandler` | const | 9283 | `src/server/core/scheduleWrites.ts` |
| `InnerScheduleResult` | interface | 9340 | `src/server/core/scheduleWrites.ts` |
| `runScheduleHandler` | function | 9342 | `src/server/core/scheduleWrites.ts` |
| `PROPOSAL_ORIGIN_LABEL` | const | 9368 | `src/server/core/scheduleWrites.ts` |
| `PROPOSAL_DAYS` | const | 9371 | `src/server/core/scheduleWrites.ts` |
| `dayFlagsOf` | const | 9372 | `src/server/core/scheduleWrites.ts` |
| `dayOfRow` | const | 9373 | `src/server/core/scheduleWrites.ts` |
| `dayLabelOf` | const | 9374 | `src/server/core/scheduleWrites.ts` |
| `editBodyFor` | function | 9377 | `src/server/core/scheduleWrites.ts` |
| `ProposalOutcome` | interface | 9391 | `src/server/core/scheduleWrites.ts` |
| `applyProposalCore` | function | 9393 | `src/server/core/scheduleWrites.ts` |
| `wipeScopeState` | function | 9572 | `src/server/routes/schedulesRoutes.ts` |
| `wipeScopeOf` | const | 9601 | `src/server/routes/schedulesRoutes.ts` |
| `GuideIntentPayload` | type | 9731 | `src/server/routes/guideRoutes.ts` |
| `deterministicGuideIntent` | function | 9742 | `src/server/routes/guideRoutes.ts` |
| `serverCanExposeGuideFeature` | function | 9762 | `src/server/routes/guideRoutes.ts` |
| `requestGuideAIIntent` | function | 9773 | `src/server/routes/guideRoutes.ts` |
| `GeminiPart` | type | 9828 | `src/server/core/gemini.ts` |
| `geminiOutputText` | function | 9830 | `src/server/core/gemini.ts` |
| `geminiFunctionCalls` | function | 9838 | `src/server/core/gemini.ts` |
| `requestGeminiScheduleLayer` | function | 9846 | `src/server/core/gemini.ts` |
| `emptyScopeGuidance` | function | 10245 | `src/server/routes/intelligenceRoutes.ts` |
| `authorityBaselineForScope` | function | 11697 | `src/server/core/authority.ts` |
| `authorityDraftForScope` | function | 11714 | `src/server/routes/reportsRoutes.ts` |
| `scheduleLockRefusal` | function | 11787 | `src/server/core/approvals.ts` |
| `registrarNotesInRound` | function | 11831 | `src/server/core/approvals.ts` |
| `termIsClosed` | function | 11838 | `src/server/core/approvals.ts` |
| `approvalTransaction` | function | 11856 | `src/server/routes/approvalsRoutes.ts` |
| `approvalScopeLabel` | function | 11881 | `src/server/routes/approvalsRoutes.ts` |
| `withEvent` | function | 11893 | `src/server/core/approvals.ts` |
| `noteScheduleMutation` | function | 11908 | `src/server/core/approvals.ts` |
| `ApprovalEventWriter` | type | 11957 | `src/server/core/approvals.ts` |
| `amendmentAfterEdit` | function | 11958 | `src/server/core/approvals.ts` |
| `settleAmendmentMarker` | function | 11978 | `src/server/core/approvals.ts` |
| `settlePendingAmendmentInLock` | function | 11987 | `src/server/routes/approvalsRoutes.ts` |
| `settlePendingAmendment` | function | 11997 | `src/server/routes/approvalsRoutes.ts` |
| `applyScheduleMutation` | function | 12005 | `src/server/core/approvals.ts` |
| `wholesaleRefusal` | function | 12067 | `src/server/core/approvals.ts` |
| `countBlockingConflicts` | function | 12083 | `src/server/core/approvals.ts` |
| `blockingConflictCount` | function | 12089 | `src/server/routes/reportsRoutes.ts` |
| `blockingSummaryFor` | function | 12099 | `src/server/routes/approvalsRoutes.ts` |
| `regulationNoticesForScope` | function | 12109 | `src/server/core/approvals.ts` |
| `regulationNoticeCount` | function | 12156 | `src/server/routes/approvalsRoutes.ts` |
| `readApproval` | function | 12161 | `src/server/core/approvals.ts` |
| `readDeadlineFor` | function | 12167 | `src/server/core/approvals.ts` |
| `approvalActor` | function | 12176 | `src/server/routes/approvalsRoutes.ts` |
| `approvalScopeFromBody` | function | 12185 | `src/server/routes/approvalsRoutes.ts` |
| `refuseIfTermClosed` | function | 12196 | `src/server/core/approvals.ts` |
| `refuseIfTermFrozen` | function | 12216 | `src/server/core/approvals.ts` |
| `refuseIfStale` | function | 12227 | `src/server/routes/approvalsRoutes.ts` |
| `scheduleDataReadiness` | function | 12235 | `src/server/routes/approvalsRoutes.ts` |
| `submitToRegistrar` | function | 12531 | `src/server/routes/approvalsRoutes.ts` |
| `EXTENSION_ACTIONS` | const | 12780 | `src/server/routes/approvalsRoutes.ts` |
| `EXTENSIONS_MAX_TARGETS` | const | 12781 | `src/server/routes/approvalsRoutes.ts` |
| `NOTE_FIELDS` | const | 12895 | `src/server/routes/scheduleNotesRoutes.ts` |
| `NOTE_FIELD_LABEL` | const | 12896 | `src/server/core/notes.ts` |
| `noteFieldValue` | function | 12908 | `src/server/core/notes.ts` |
| `noteState` | function | 12926 | `src/server/core/notes.ts` |
| `notesWithState` | function | 12943 | `src/server/core/notes.ts` |
| `noteSuggestions` | function | 12974 | `src/server/routes/reportsRoutes.ts` |
| `REGISTRAR_NOTIFY_ROLES` | const | 13218 | `src/server/routes/notificationsRoutes.ts` |
| `studentQueueMemo` | const | 13230 | `src/server/core/notifications.ts` |
| `studentQueueForTerm` | function | 13231 | `src/server/routes/notificationsRoutes.ts` |
| `bellBlockingMemo` | const | 13244 | `src/server/core/notifications.ts` |
| `onSchedulesInvalidated(() => bellBlockingMemo.invalidate());` | جملة | 13245 | `src/server/core/notifications.ts` |
| `bellBlockingCount` | function | 13246 | `src/server/routes/notificationsRoutes.ts` |
| `bellPlanningTermId` | function | 13254 | `src/server/core/notifications.ts` |
| `notificationItemsForTerm` | function | 13265 | `src/server/routes/notificationsRoutes.ts` |
| `approvalBadgeForTerm` | function | 13481 | `src/server/routes/approvalsRoutes.ts` |
| `hydrateVersionRows` | function | 14353 | `src/server/core/versions.ts` |
| `briefChangedSince` | function | 14364 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `rowSignatureServer` | function | 14372 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `livingResponseCache` | const | 14394 | `src/server/core/versions.ts` |
| `LIVING_RESPONSE_TTL_MS` | const | 14395 | `src/server/routes/intelligenceInsightRoutes.ts` |
| `onSchedulesInvalidated(() => livingResponseCache.clear());` | جملة | 14396 | `src/server/core/versions.ts` |
| `driftCache` | const | 14546 | `src/server/core/rhythm.ts` |
| `historicalTimeCache` | const | 14547 | `src/server/core/rhythm.ts` |
| `driftSerial` | let | 14548 | `src/server/core/rhythm.ts` |
| `onSchedulesInvalidated(() => { driftSerial += 1; historicalTimeCache.c` | جملة | 14549 | `src/server/core/rhythm.ts` |
| `splitArchivedCourseRows` | function | 14751 | `src/server/core/scheduleReads.ts` |
| `applyRoleTemplate` | function | 15017 | `src/server/routes/usersRoutes.ts` |
| `applyRoleScopeOnly` | function | 15064 | `src/server/routes/usersRoutes.ts` |
| `sanitizeAssigns` | function | 15165 | `src/server/routes/usersRoutes.ts` |
| `departmentHeadPlan` | function | 15217 | `src/server/routes/usersRoutes.ts` |
| `advisorPlan` | function | 15225 | `src/server/routes/usersRoutes.ts` |
| `balanceScopeLabel` | function | 15803 | `src/server/routes/reportsRoutes.ts` |
| `SHARE_DAY_KEYS` | const | 15951 | `src/server/core/shareLinks.ts` |
| `SHARE_DAY_NAMES` | const | 15952 | `src/server/core/shareLinks.ts` |
| `SHARE_ICS_DAYS` | const | 15953 | `src/server/core/shareLinks.ts` |
| `SHARE_MAX_DAYS` | const | 15954 | `src/server/routes/shareRoutes.ts` |
| `shareDayIndexes` | function | 15956 | `src/server/core/shareLinks.ts` |
| `shareLinkStillReadable` | function | 15963 | `src/server/core/shareLinks.ts` |
| `resolveShareToken` | function | 15972 | `src/server/core/shareLinks.ts` |
| `PUBLIC_VISITING_BADGE_CSS` | const | 15985 | `src/server/routes/publicStaffRoutes.ts` |
| `buildSharePayload` | function | 15988 | `src/server/core/shareLinks.ts` |
| `publicAttempts` | const | 16045 | `src/server/core/shareLinks.ts` |
| `publicAttemptKey` | const | 16046 | `src/server/core/shareLinks.ts` |
| `publicAttemptReserve` | const | 16049 | `src/server/core/shareLinks.ts` |
| `staffLookupAllowed` | function | 16052 | `src/server/routes/surveyRoutes.ts` |
| `MovementEntry` | type | 16065 | `src/server/core/staffCard.ts` |
| `MOVEMENT_REJECT_REASON` | const | 16070 | `src/server/core/staffCard.ts` |
| `requestMovementEntries` | function | 16075 | `src/server/core/staffCard.ts` |
| `movementHistoryScopes` | function | 16110 | `src/server/core/staffCard.ts` |
| `scheduleMovementEntries` | function | 16118 | `src/server/core/staffCard.ts` |
| `StaffIdentity` | type | 16165 | `src/server/routes/publicStaffRoutes.ts` |
| `buildStaffCard` | function | 16167 | `src/server/routes/publicStaffRoutes.ts` |
| `staffFamilyScopes` | function | 16435 | `src/server/core/staffCard.ts` |
| `staffFamilyShareLinks` | function | 16438 | `src/server/core/staffCard.ts` |
| `liveStaffPublication` | const | 16443 | `src/server/core/staffCard.ts` |
| `shareLinkLabel` | function | 16466 | `src/server/core/shareLinks.ts` |
| `isPersonalStaffLink` | const | 16595 | `src/server/routes/shareRoutes.ts` |
| `personalLinkEligibleIds` | function | 16597 | `src/server/routes/shareRoutes.ts` |
| `staffLinkFamilyAllowed` | const | 16611 | `src/server/routes/shareRoutes.ts` |
| `readSectionBuild` | function | 16833 | `src/server/routes/planningRoutes.ts` |
| `authorityDepartmentKeyOf` | function | 17103 | `src/server/routes/planningRoutes.ts` |
| `REMAINING_SEASONS` | const | 17115 | `src/server/core/planning.ts` |
| `REMAINING_SEASON_NAMES` | const | 17116 | `src/server/routes/planningRoutes.ts` |
| `remainingContext` | function | 17117 | `src/server/routes/planningRoutes.ts` |
| `remainingTermRefusal` | function | 17133 | `src/server/routes/planningRoutes.ts` |
| `reportTermLabelOf` | function | 17146 | `src/server/routes/planningRoutes.ts` |
| `remainingWarnings` | function | 17150 | `src/server/routes/planningRoutes.ts` |
| `remainingAssessment` | function | 17155 | `src/server/routes/planningRoutes.ts` |
| `TERM_WEEKS` | const | 17257 | `src/server/routes/publicCalendarRoutes.ts` |
| `sendCalendar` | function | 17268 | `src/server/routes/publicCalendarRoutes.ts` |
| `calendarSecret` | const | 17347 | `src/server/core/shareLinks.ts` |
| `staffDeviceSecret` | const | 17348 | `src/server/routes/publicStaffRoutes.ts` |
| `staffCookieSecure` | const | 17349 | `src/server/routes/publicStaffRoutes.ts` |
| `staffIdentityFrom` | function | 17351 | `src/server/routes/publicStaffRoutes.ts` |
| `calendarKey` | const | 17360 | `src/server/core/shareLinks.ts` |
| `holdsLiveCardLink` | function | 17398 | `src/server/routes/publicCalendarRoutes.ts` |
| `stableCalendarPath` | const | 17408 | `src/server/core/shareLinks.ts` |
| `sendInstructorCalendar` | function | 17429 | `src/server/routes/publicCalendarRoutes.ts` |
| `STAFF_NOTES_PER_DAY` | const | 17520 | `src/server/routes/publicStaffRoutes.ts` |
| `studentCaseSecretPromise` | let | 17615 | `src/server/core/studentIdentity.ts` |
| `studentCaseSecret` | const | 17616 | `src/server/core/studentIdentity.ts` |
| `surveyFingerprint` | const | 17617 | `src/server/core/studentIdentity.ts` |
| `studentIdentityKey` | const | 17620 | `src/server/core/studentIdentity.ts` |
| `sealStudentIdentity` | const | 17621 | `src/server/core/studentIdentity.ts` |
| `openStudentIdentity` | const | 17626 | `src/server/core/studentIdentity.ts` |
| `canSeeStudentIdentity` | const | 17648 | `src/server/core/studentIdentity.ts` |
| `studentIdentityFor` | const | 17649 | `src/server/core/studentIdentity.ts` |
| `degreeRuleFromName` | const | 17657 | `src/server/core/studentIdentity.ts` |
| `degreeRuleForSection` | const | 17671 | `src/server/core/studentIdentity.ts` |
| `storedDegreeRuleForSection` | const | 17685 | `src/server/core/studentIdentity.ts` |
| `planDegreeRule` | const | 17700 | `src/server/core/studentIdentity.ts` |
| `graduationCandidatesForSection` | const | 17716 | `src/server/core/studentIdentity.ts` |
| `graduationRuleFor` | const | 17726 | `src/server/core/studentIdentity.ts` |
| `isSummerTerm` | const | 17740 | `src/server/core/studentIdentity.ts` |
| `graduateThreshold` | const | 17741 | `src/server/core/studentIdentity.ts` |
| `STUDENT_PROOF_TTL_MS` | const | 17744 | `src/server/core/studentIdentity.ts` |
| `issueStudentProof` | const | 17745 | `src/server/core/studentIdentity.ts` |
| `studentProofExpired` | const | 17751 | `src/server/core/studentIdentity.ts` |
| `verifyStudentProof` | const | 17754 | `src/server/core/studentIdentity.ts` |
| `normalizeCaseRef` | const | 17767 | `src/server/routes/surveyRoutes.ts` |
| `priorNeedForHand` | const | 17769 | `src/server/routes/surveyRoutes.ts` |
| `caseRefMatches` | const | 17777 | `src/server/routes/surveyRoutes.ts` |
| `maskedInitial` | const | 17779 | `src/server/routes/surveyRoutes.ts` |
| `CASE_REF_REQUIRED` | const | 17780 | `src/server/routes/surveyRoutes.ts` |
| `reusableGraduateVerification` | const | 17788 | `src/server/routes/surveyRoutes.ts` |
| `normalizeStudentIdentityName` | const | 17819 | `src/server/routes/surveyRoutes.ts` |
| `reusableStudentIdentity` | const | 17826 | `src/server/routes/surveyRoutes.ts` |
| `asciiDigits` | const | 17843 | `src/server/core/studentIdentity.ts` |
| `surveyCohort` | const | 17845 | `src/server/core/studentIdentity.ts` |
| `surveyActiveCourseIds` | const | 17860 | `src/server/core/studentIdentity.ts` |
| `surveyCourseIdsForSection` | function | 17862 | `src/server/routes/surveyRoutes.ts` |
| `surveyTermEnded` | const | 17926 | `src/server/core/studentIdentity.ts` |
| `SURVEY_TERM_ENDED` | const | 17927 | `src/server/routes/surveyRoutes.ts` |
| `surveyPayloadCache` | const | 17933 | `src/server/core/studentIdentity.ts` |
| `SURVEY_PAYLOAD_TTL_MS` | const | 17934 | `src/server/routes/surveyRoutes.ts` |
| `STUDENT_PROOF_MAX_BYTES` | const | 18066 | `src/server/routes/surveyRoutes.ts` |
| `STUDENT_PROOF_TOO_LARGE` | const | 18067 | `src/server/routes/surveyRoutes.ts` |
| `studentProofBody` | const | 18068 | `src/server/routes/surveyRoutes.ts` |
| `readStudentProofBody` | const | 18069 | `src/server/routes/surveyRoutes.ts` |
| `GraduateProofSink` | type | 18077 | `src/server/core/studentIdentity.ts` |
| `graduateProofCore` | function | 18078 | `src/server/core/studentIdentity.ts` |
| `graduateSubmitCheck` | function | 18182 | `src/server/core/studentIdentity.ts` |
| `curriculumLabelsFor` | const | 18348 | `src/server/core/planning.ts` |
| `sectionGapCache` | const | 18367 | `src/server/routes/notificationsRoutes.ts` |
| `cachedSectionGap` | function | 18368 | `src/server/routes/notificationsRoutes.ts` |
| `sectionGapData` | function | 18376 | `src/server/core/planning.ts` |
| `sectionGapStaffing` | function | 18474 | `src/server/routes/planningRoutes.ts` |
| `canWriteRegistration` | const | 18780 | `src/server/routes/studentRegistrationRoutes.ts` |
| `grantedPermissions` | const | 18789 | `src/server/routes/studentRegistrationRoutes.ts` |
| `owningSectionsInScopeFor` | const | 18800 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_COURSE_STATES` | const | 18807 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_REJECT_REASONS` | const | 18808 | `src/server/routes/studentRegistrationRoutes.ts` |
| `STUDENT_COMMITTEE_REASONS` | const | 18809 | `src/server/routes/studentRegistrationRoutes.ts` |
| `RegistrationViewer` | type | 18820 | `src/server/routes/studentRegistrationRoutes.ts` |
| `registrationViewer` | const | 18821 | `src/server/routes/studentRegistrationRoutes.ts` |
| `reachedRegistration` | const | 18824 | `src/server/routes/studentRegistrationRoutes.ts` |
| `registrarBlockReason` | function | 18844 | `src/server/routes/studentRegistrationRoutes.ts` |
| `demoPageHint` | function | 19393 | `src/server/core/publicPages.ts` |
| `publicPageNonce` | function | 19435 | `src/server/core/publicPages.ts` |
| `staffCardPage` | function | 19460 | `src/server/pages/staffCardPage.ts` |
| `surveyPage` | function | 20056 | `src/server/pages/surveyPages.ts` |
| `studentCaseSurveyPage` | function | 20390 | `src/server/pages/surveyPages.ts` |
| `REQUEST_LINK_DAYS` | const | 20491 | `src/server/core/instructorRequests.ts` |
| `requestWindowOpen` | const | 20494 | `src/server/core/instructorRequests.ts` |
| `currentInstructorRequestGeneration` | function | 20497 | `src/server/core/instructorRequests.ts` |
| `requireCurrentInstructorRequestGeneration` | function | 20511 | `src/server/routes/instructorRequestsRoutes.ts` |
| `requestItemScope` | function | 20519 | `src/server/core/instructorRequests.ts` |
| `requestForDepartment` | function | 20534 | `src/server/routes/instructorRequestsRoutes.ts` |
| `stripForInstructor` | function | 20551 | `src/server/routes/publicRequestRoutes.ts` |
| `courseHabitMemo` | const | 20594 | `src/server/core/instructorRequests.ts` |
| `onSchedulesInvalidated(() => courseHabitMemo.clear());` | جملة | 20595 | `src/server/core/instructorRequests.ts` |
| `courseHabit` | function | 20597 | `src/server/core/instructorRequests.ts` |
| `habitBlockFor` | const | 20613 | `src/server/routes/publicRequestRoutes.ts` |
| `blockMinutesOfItem` | function | 20616 | `src/server/routes/publicRequestRoutes.ts` |
| `decisionStillApplies` | function | 20629 | `src/server/routes/publicRequestRoutes.ts` |
| `priorAddFor` | function | 20640 | `src/server/routes/publicRequestRoutes.ts` |
| `requestSlotsForCourse` | function | 20655 | `src/server/routes/publicRequestRoutes.ts` |
| `instructorRequestItemsFromPayload` | function | 20667 | `src/server/routes/publicRequestRoutes.ts` |
| `resolveRequestLink` | function | 20788 | `src/server/core/instructorRequests.ts` |
| `instructorRequestSectionCourses` | function | 20814 | `src/server/core/instructorRequests.ts` |
| `refreshUnsubmittedInstructorRequest` | function | 20834 | `src/server/routes/publicRequestRoutes.ts` |
| `InstructorRequestCourseOption` | type | 20864 | `src/server/routes/publicRequestRoutes.ts` |
| `instructorRequestDepartmentScopes` | function | 20881 | `src/server/core/instructorRequests.ts` |
| `instructorRequestCourseOptions` | function | 20909 | `src/server/routes/publicRequestRoutes.ts` |
| `originalOffering` | function | 20940 | `src/server/routes/publicRequestRoutes.ts` |
| `availableInstructorOfferings` | function | 20945 | `src/server/routes/publicRequestRoutes.ts` |
| `requestReservationProposals` | function | 20984 | `src/server/routes/publicRequestRoutes.ts` |
| `buildRequestContext` | function | 21003 | `src/server/core/instructorRequests.ts` |
| `buildSharedRequestContext` | function | 21011 | `src/server/core/instructorRequests.ts` |
| `SharedRequestContext` | type | 21044 | `src/server/core/instructorRequests.ts` |
| `requestContextFor` | function | 21046 | `src/server/core/instructorRequests.ts` |
| `requestRulesForScope` | function | 21062 | `src/server/core/instructorRequests.ts` |
| `roomUsageMemo` | const | 21127 | `src/server/core/instructorRequests.ts` |
| `roomUsageOf` | function | 21128 | `src/server/core/instructorRequests.ts` |
| `rulesInflight` | const | 21140 | `src/server/core/instructorRequests.ts` |
| `rulesOnce` | function | 21141 | `src/server/core/instructorRequests.ts` |
| `judgeRequestItems` | function | 21149 | `src/server/core/instructorRequests.ts` |
| `requireInstructorRequestRevision` | function | 21759 | `src/server/core/instructorRequests.ts` |
| `instructorRequestItemIdentity` | function | 21771 | `src/server/core/instructorRequests.ts` |
| `ApplyOp` | type | 21933 | `src/server/routes/instructorRequestsRoutes.ts` |
| `daysFlags` | const | 21938 | `src/server/routes/instructorRequestsRoutes.ts` |
| `rowBodyOf` | const | 21939 | `src/server/routes/instructorRequestsRoutes.ts` |
| `requestDayPatterns` | function | 22365 | `src/server/routes/publicRequestRoutes.ts` |
| `verifyRequestSigner` | function | 22383 | `src/server/core/instructorRequests.ts` |
| `instructorRequestPage` | function | 22752 | `src/server/pages/instructorRequestPage.ts` |
| `previousTermMemo` | const | 23923 | `src/server/routes/publicRequestRoutes.ts` |
| `cardStreams` | const | 23976 | `src/server/routes/publicRequestRoutes.ts` |
| `cardStreamTotal` | let | 23977 | `src/server/routes/publicRequestRoutes.ts` |
| `CARD_STREAMS_PER_REQUEST` | const | 23978 | `src/server/routes/publicRequestRoutes.ts` |
| `CARD_STREAMS_TOTAL` | const | 23979 | `src/server/routes/publicRequestRoutes.ts` |
| `Repository.onInstructorRequestSaved(info => {` | جملة | 23980 | `src/server/routes/publicRequestRoutes.ts` |
| `rateLimitCheckTimes` | const | 24025 | `src/server/routes/publicRequestRoutes.ts` |
| `REQUEST_HOLD_TTL_MS` | const | 24098 | `src/server/routes/publicRequestRoutes.ts` |
| `registerStudyProposalRoutes(app, {` | جملة | 24164 | `server.ts` |
| `publicInvalidLinkPage` | function | 24189 | `src/server/pages/publicInvalidLinkPage.ts` |
| `offeringViewsFor` | function | 24210 | `src/server/routes/publicRequestRoutes.ts` |
| `coursesWithOffering` | function | 24229 | `src/server/routes/publicRequestRoutes.ts` |
| `taPhaseId` | const | 24240 | `src/server/core/instructorRequests.ts` |
| `taPhaseForRequest` | function | 24243 | `src/server/routes/publicRequestRoutes.ts` |
| `sendTaWave` | function | 24383 | `src/server/routes/offeringRoutes.ts` |
| `dispatchTaWaves` | function | 24413 | `src/server/routes/offeringRoutes.ts` |
| `setInterval(() => {` | جملة | 24518 | `src/server/routes/offeringRoutes.ts` |
| `seatConfigId` | const | 24523 | `src/server/routes/offeringRoutes.ts` |
| `seatSections` | function | 24525 | `src/server/routes/offeringRoutes.ts` |
| `rateLimitVerifySignature` | const | 24625 | `src/server/routes/verifyRoutes.ts` |
| `SURVEY_STATUS_GRACE_MS` | const | 24731 | `src/server/routes/surveyRoutes.ts` |
| `resolveSurveyStatusToken` | function | 24732 | `src/server/routes/surveyRoutes.ts` |
| `studentCaseStatusPage` | function | 24845 | `src/server/pages/studentCaseStatusPage.ts` |
| `registerPlanReviewRoutes(app, {` | جملة | 25003 | `server.ts` |
| `planSheetTemplate` | let | 25014 | `server.ts` |
| `for (const candidate of [path.join(process.cwd(), "public", "plans", "` | جملة | 25015 | `server.ts` |
| `{` | جملة | 25018 | `server.ts` |
| `registerAdsRoutes(app, { requireAuth, requireRootAdmin, publicPageNonc` | جملة | 25029 | `server.ts` |
| `registerRoomDoorRoutes(app, {` | جملة | 25032 | `server.ts` |
| `registerSimulationRoutes(app, {` | جملة | 25040 | `server.ts` |
| `registerInsightRoutes(app, {` | جملة | 25047 | `server.ts` |
| `registerTimeMachineRoutes(app, {` | جملة | 25054 | `server.ts` |
| `registerStudentShowcase(app, { identityKey: studentIdentityKey, sealId` | جملة | 25132 | `server.ts` |
| `registerStudentDoorRoutes(app, {` | جملة | 25133 | `server.ts` |
| `STUDENT_QR_DAYS` | const | 25173 | `src/server/routes/shareRoutes.ts` |
| `studentSchedulePage` | function | 25175 | `src/server/pages/studentSchedulePage.ts` |
| `migrateLegacyAccountsToCommitteeRole` | function | 25861 | `server.ts` |
| `SCHEDULE_WORKSPACE_FORM_ID` | const | 25888 | `server.ts` |
| `reconcileDepartmentHeadPermissions` | function | 25889 | `server.ts` |
| `startServer` | function | 25906 | `server.ts` |
| `startServer().catch(error => {` | جملة | 26148 | `server.ts` |
