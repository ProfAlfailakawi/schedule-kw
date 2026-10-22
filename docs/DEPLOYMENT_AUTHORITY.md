# سلطة النشر الإنتاجي

الموقع الرسمي: `https://schedule-kw.com`، الخدمة Cloud Run `schedule` في المشروع `gen-lang-client-0379571946`،
المنطقة `europe-west1`. يُنشَر منها صورةٌ واحدة فقط (`gcloud run deploy schedule --image=...`).

## القاعدة

مستودعٌ واحد فقط يملك سلطة النشر في كل وقت. سير «Deploy SCHEDULE» لا يعمل إلا إذا ضُبط متغيّر المستودع
`PRODUCTION_DEPLOY_ENABLED` على `true` (Settings ← Secrets and variables ← Actions ← Variables).
هذا المستودع يبدأ والمتغير غير مضبوط، أي أن النشر منه معطّل.

## التحويل من المستودع السابق (بالترتيب، ولا يُنفَّذ بالتوازي)

1. في Google Cloud (مشروع `schedule-863eb`، Workload Identity Federation، المزوّد `schedule`): اسمح لمصدر هذا المستودع
   (شرط السمة `assertion.repository`) إضافةً إلى المستودع السابق، دون إزالة القديم بعد. هذه خطوة أمنية يجريها المالك.
2. شغّل «Comprehensive CI» على `main` هنا حتى ينجح.
3. اضبط `PRODUCTION_DEPLOY_ENABLED=true` هنا، ثم شغّل «Deploy SCHEDULE» يدوياً (`workflow_dispatch`).
4. تحقّق أن `schedule-kw.com/sw.js` يعيد رقم البناء نفسه الذي تعيده الخدمة مباشرةً (الأمران في AGENTS.md).
5. فقط بعد نجاح ما سبق: عطّل النشر في المستودع السابق (احذف أو اضبط `PRODUCTION_DEPLOY_ENABLED` إلى غير `true` هناك)
   ثم أزل مصدره من شرط Workload Identity.
6. لا يُحذف المستودع السابق إلا بقرار مستقل.

## الرجوع

أعد `PRODUCTION_DEPLOY_ENABLED=true` في المستودع السابق واضبطه في هذا إلى غير `true`. وللرجوع عن إصدار معيب:
وجّه الحركة إلى المراجعة السابقة السليمة من Cloud Run (قراءة آخر مراجعة سليمة من صفحة Revisions) دون المساس بربط الدومين.
