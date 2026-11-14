# Security Notes

- قاعدة الإنتاج النهائية هي Firestore عبر Express backend موثوق؛ `firestore.rules` تمنع القراءة والكتابة المباشرة من Browser (`allow read, write: if false`).
- تهيئة Firestore تُنتظر قبل تشغيل الخادم. عند قاعدة اختبار فارغة يمكن استيراد Snapshot القديم ثم التحقق من Counts قبل قبول أول Login.
- Session cookies هي HttpOnly وSameSite، وتصبح Secure في الإنتاج.
- الطلبات التي تغيّر الحالة تخضع لفحوص Origin/Fetch Metadata بالإضافة إلى حماية الكوكي.
- تسجيل الدخول Rate-limited.
- السطح العام `/api/public/*` Rate-limited كذلك: 60 طلباً/دقيقة لكل IP افتراضياً، ويُضبط عبر `PUBLIC_RATE_LIMIT_MAX` و`PUBLIC_RATE_LIMIT_WINDOW_MS` (القيمة `0` تعطّله). العدّاد في ذاكرة النسخة الواحدة، فهو تقليل ضرر لا حماية من فيضان موزّع — انظر `SECURITY-TODO.md` بند 3.
- Authorization مفروض على الخادم. إخفاء Icon من الواجهة ليس صلاحية بحد ذاته.
- `IsAdminUser` يحافظ على سلوك Legacy الخاص بنطاق البيانات، لكنه لا يمنح FormSecurity screen permissions تلقائياً.
- المستخدم العادي مقيد بنطاقات `AdCollegeUserAssign` حيث يطبقها النظام القديم.
- كلمات السر الأصلية لا تُخزن Plain Text في `database/db.json`. Authentication يستخدم salted scrypt hashes.
- كلمة السر لا تصل إلى أي متصفح، ولا حتى للمدير: `GET /api/users` يرسل `HasPassword` فقط. نسخة التوافق القديمة ما زالت تُكتب AES-256-GCM في `SystemUserPassVault` بمفتاح منفصل (DR-ACC-035)، لكن **لا يوجد أي Endpoint يفكّها**، وكل الاستجابات تحذف hash والـvault (`safeSystemUser`). شاشة `SystemUser` القديمة التي كانت تعرض الكلمة لم تعد تفعل.
- حُرّاس شاشة المستخدمين على الخادم (`src/server/userAdminGuards.ts`): حساب الإدارة الرئيسي لا يعدّله ولا يحذفه ولا يغيّر صلاحياته إلا صاحبه؛ لا يوقف أحدٌ حسابه ولا يقفله ولا يحذفه ولا ينزع عنه «مدير» أو الشاشتين 11 و12؛ لا يُنزع آخر مدير فاعل؛ منح «مدير» للحساب الرئيسي وحده؛ تغيير الصفة يلزمه الشاشة 12؛ كلمة يكتبها مسؤول 8 أحرف على الأقل، وكلمتك أنت لا تُغيَّر من هناك إلا بالحالية.
- في حزمة الاختبار الخاصة يوجد مفتاح `database/legacy-password-vault.key` حتى تعمل شاشة SystemUser القديمة فوراً. في الإنتاج انقل نفس المفتاح إلى Secret manager/`PASSWORD_VAULT_KEY` واحذف الملف من مساحة الكود بعد التأكد من إعداد السر.
- IDs الجديدة في Firestore تُحجز عبر transaction-backed counters لتجنب التصادم.
- Snapshot الحالي يحتوي PII حقيقية بناءً على طلب مالك النظام. لذلك `database/db.json` ومفتاح الخزنة موجودان في `.gitignore` ولا يجوز نشرهما، ولا نشر أي قاعدة بيانات حقيقية أو أسرار أخرى، داخل أي Repository عام أو حزمة توزيع/أرشيف قابلة للوصول من خارج الجهات المصرّح لها.
- لا يوجد service-account JSON أو SQL connection string أو `.bak` أو MDF/LDF داخل patch.
