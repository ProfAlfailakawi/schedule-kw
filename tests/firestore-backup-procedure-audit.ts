/**
 * إجراء النسخ الاحتياطي والاسترجاع (FR-OPS-026): الوثيقة تحمل أوامر التفعيل والاسترجاع والتحقق كاملة.
 * التفعيل نفسه قرار جهة الاستضافة على مشروعها؛ هذا الفحص يضمن ألا يُحذف من الإجراء خطوة.
 */
import fs from "node:fs";

const doc = fs.readFileSync("scripts/firestore-backup.md", "utf8");
let passed = 0, failed = 0;
const check = (ok: boolean, name: string) => { if (ok) { passed++; console.log(`✓ ${name}`); } else { failed++; console.log(`✗ ${name}`); } };

check(/gcloud firestore databases update[\s\S]*?--enable-pitr/.test(doc), "تفعيل الاسترجاع الزمني (PITR)");
check(/gcloud firestore databases update[\s\S]*?--delete-protection/.test(doc), "تفعيل حماية الحذف");
check(/gcloud firestore databases restore[\s\S]*?--snapshot-time/.test(doc), "الاسترجاع إلى لحظة محددة في قاعدة جديدة");
check(/gcloud firestore export "gs:\/\//.test(doc), "تصدير يدوي إلى سلة التخزين");
check(/gcloud scheduler jobs create http[\s\S]*?exportDocuments/.test(doc), "تصدير يومي مجدول");
check(/gcloud firestore import[\s\S]*?schedule-drill/.test(doc), "التحقق باستيراد النسخة إلى قاعدة اختبار منفصلة لا إلى الإنتاج");

console.log(`\nfirestore backup procedure audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
