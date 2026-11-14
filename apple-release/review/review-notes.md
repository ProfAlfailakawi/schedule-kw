# ملاحظات المراجعة — SCHEDULE

**ملاحظة للمراجع (EN):** SCHEDULE is a native shell around our production service at https://schedule-kw.com. Native features: offline detection and banner with automatic recovery, pull-to-refresh, swipe navigation, resume-last-page, iPad multitasking and Mac (Apple silicon) support.

- حساب التجربة: OWNER-TODO: موافقة الجهة التعليمية المالكة للبيانات قبل أي توزيع.
- المدفوعات: لا يوجد.
- مخاطر المراجعة: بيانات طلبة — لا توزيع قبل موافقة الجهة.
- حذف الحساب (5.1.1(v)): بعد تسجيل الدخول، أيقونة «طلب حذف الحساب» (مستخدم عليه علامة ×) في بطاقة المستخدم أسفل القائمة الجانبية، بجوار «تسجيل الخروج». خطوتان: بيان ثم تأكيد بكلمة السر. يسجَّل طلب معلّق (`POST /api/account/deletion-request`، محدود المعدل) مع سطر تدقيق وتنبيه لمدير النظام في الجرس، وتُغلق الجلسات ويخرج المستخدم. لا يُحذف الحساب فورًا: ينفّذه مدير النظام خلال 30 يومًا (`GET /api/admin/account-deletion-requests`). الدخول التجريبي وحساب الإدارة الرئيسي لا يسجّلان طلبًا حقيقيًا. لا تسجيل ذاتي في التطبيق.
