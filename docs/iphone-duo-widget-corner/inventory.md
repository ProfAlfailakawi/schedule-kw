# جرد السطوح (ركن الودجت)

المصدر: `position:fixed|sticky` في `src` و`public` (204 قاعدة في ملفات CSS؛ 265 مطابقة بما فيها TS/HTML). «حارس» = قيس بالحارس الحيّ (WebKit، Safari والتطبيق المُحاكى)؛ «قاعدة» = قاعدة CSS كُتبت ولم يُقَس سطحها آلياً.

| السطح | الملف / المحدد | ما فُعل | التحقق |
|---|---|---|---|
| الشريط العلوي | `07-responsive.css` `.mobile-topbar` | `padding-right` = s3 + inset (`55-duo-adaptive.css`) | حارس |
| زر المرشد | `35-visual-polish.css` `.smart-guide-fab` | `right` = 61px + inset | حارس |
| الدرج/الفهرس | `03-shell.css` `.sidebar` | `padding-right` = safe + inset | حارس (sidebar-open) |
| صفحة العمل | `.content-frame` | عمود عائم `::before` بعرض inset−gutter وارتفاع H−topbar−s6؛ يُعطَّل في الكتاب | حارس (home, schedule, intel, 404, about) |
| الرسائل العابرة | `02-primitives.css` `.toast-layer` | `padding-right` + inset | قاعدة |
| النوافذ المركزية (~55 خلفية inset:0: `*-backdrop`, `*-scrim` ذات ابنٍ dialog) | `[class*=backdrop|scrim]:has(>[role=dialog])` | `padding-right` = s3 + inset | حارس (البحث الشامل، الأثر) + قاعدة لبقيتها |
| درج التفاصيل / مركز الذكاء (ورقة سفلية) | `.schedule-context`, `.intel-drawer` | `left:s3; right:auto; width:min(560px,100vw−inset−s3)` | حارس (modal-details) |
| أدراج وأوراق على الحافة اليسرى | `.catalog-form-drawer`, `.trail-sheet`, `.seat-drawer`, `.query-detail-panel`, `.appt-drawer`, `.wish-sheet` | `max-inline-size` = 100vw − inset − s3 | قاعدة (trail-sheet حارس) |
| الدرج اليميني | `14-proposal.css` `.sp-more-drawer` | `inset-inline-start` = inset + `max-inline-size` | قاعدة |
| الإشعارات | `.notify-panel`, `.notify-toast` | `max-width` = 100vw − 16 − inset | قاعدة |
| رفض النقل / خطأ صندوق الوارد / شريط المرشد | `.move-refusal`, `.inbox-pilot-sheet-error`, `.guide-point-bar` | `right` + inset | قاعدة |
| رؤوس لاصقة قرب الأعلى | `.insight-page-head`, `.insight-page-nav`, `.intelligence-scenes`, `.location-admin-tabs` | `margin-right` = inset | قاعدة |
| الدخول | `.apex-login-kicker`, `h1`, `>p`, `.apex-access-head` | `margin-right` = inset (البطاقة والخلفية تمتدّ) | حارس (login) |
| شريط «ثبّت» PWA | `InstallApp.tsx` | يُخفى داخل Capacitor | قاعدة (منطق) |
| صفحتا الغلاف المحليتان | `apple/www/index.html`, `offline.html` | `padding-right:104px` بالاستعلامات نفسها | قاعدة |
| الكعب (الكتاب) | `.app-shell::before` | لا يحتاج (pointer-events:none، لا نص) | لا يحتاج |

**لا يحتاج** (لا يقطع الركن أو بلا محتوى): خلفيات ملء الشاشة بلا نص (`.jr-weather`, `.choreo-stage`, `.guide-tour-dim`)، الأشرطة السفلية (`.mobile-bottom-dock`, `.schedule-dock`, `.undo-bar`, `.hall-barter-inbox`, `.keymove-bar`, `.tm-basket-dock`, `.pwa-print-notice`)، ما يلتصق باليسار (`.notify-bell`, `.jr-close`, `.schedule-focus-exit`, `.undo-log-open`)، رؤوس الجداول اللاصقة داخل أطر التمرير (`th{top:0}`، وهي داخل العمود العائم)، وقواعد الطباعة.

**غير معالج (قيد):** عناصر يحدّد JS موضعها قرب نقطة اللمس (`.week-peek`, `.time-counter-pop`, `.quick-create`, `.mini-week.is-floating`, جولة المرشد `.guide-tour-card`, `.guide-ghost-card`)؛ و`.day-substitute`/`.meeting-slots` المتمركزة بـtransform؛ وبقية الأدراج لم تُفتح آلياً.
