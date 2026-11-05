/**
 * ── شريط الاستيراد: حالة واحدة، ولا «جاهز» قبل اكتمال الفحوص ──
 * شكوى المالك: علامة صح ثم خطأ، و«أين التطبيق؟». الفحص هنا على الدالة نفسها التي تقرؤها الشاشة،
 * ثم على مواضع الوصل في المصدر: زرّ كتابة واحد، ولا علامة نجاح أثناء الفحص، والشريط آخر النافذة.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { IMPORT_BASELINE_STEP, IMPORT_CHECK_STEP, importGateSettled, importGateState, importRowsSignature, type ImportGateInput } from "../src/utils/importGate";
import { readPreflightAnswer } from "../src/hooks/useImportPreflight";

const read = (path: string) => fs.readFileSync(path, "utf8");
let passed = 0;
const check = (ok: unknown, name: string) => { assert.ok(ok, name); passed += 1; };
const base: ImportGateInput = { preflight: "done", issues: [], hasContent: true };

/* 1) الترتيب: لا نتيجة أثناء أي فحص، ولو كانت الملاحظات المحلية معروفة. */
check(importGateState({ ...base, preflight: "pending" }).kind === "checking", "1.1 فحص جارٍ = يفحص");
check(importGateState({ ...base, preflight: "pending", issues: ["الصف 1"] }).kind === "checking", "1.2 لا عدّ ملاحظات قبل اكتمال الفحص");
check((importGateState({ ...base, preflight: "pending" }) as any).step === IMPORT_CHECK_STEP, "1.3 خطوة الفحص بكلمات بسيطة");
check((importGateState({ ...base, baselinePending: true }) as any).step === IMPORT_BASELINE_STEP, "1.4 جدول الفصل لم يصل: يفحص");
check((importGateState({ ...base, readingStep: "قراءة" }) as any).step === "قراءة", "1.5 قراءة الملف جارية: يفحص");
check(importGateState(base).kind === "ready", "1.6 اكتملت الفحوص بلا ملاحظات: جاهز");
const blocked = importGateState({ ...base, issues: ["أ", "ب"] });
check(blocked.kind === "blocked" && blocked.count === 2 && blocked.first === "أ", "1.7 منع: العدد وأول ملاحظة");
check(importGateState({ ...base, preflight: "failed" }).kind === "unverified", "1.8 تعذّر الفحص لا يُقال «جاهز»");
check(importGateState({ ...base, preflight: "failed", issues: ["أ"] }).kind === "blocked", "1.9 ملاحظة معروفة تمنع ولو تعذّر الفحص");
check(importGateState({ ...base, baselineFailed: true }).kind === "baseline-failed", "1.10 تعذّرت قراءة الجدول الحالي");
check(importGateState({ ...base, hasContent: false }).kind === "blocked", "1.11 جدول فارغ لا يُنشر");
check(!importGateSettled({ kind: "checking", step: "" }) && !importGateSettled({ kind: "unverified" }) && importGateSettled({ kind: "ready" }) && importGateSettled({ kind: "blocked", count: 1, first: "" }), "1.12 العلامة الخضراء بعد النتيجة وحدها");

/* 2) لا تسلسل يمرّ بـ«جاهز» ثم يعود «ممنوعاً» لنفس الصفوف. */
const sequence: ImportGateInput[] = [
  { ...base, preflight: "pending", readingStep: "قراءة" }, { ...base, preflight: "pending" }, { ...base, issues: ["تعارض"] },
];
const kinds = sequence.map(input => importGateState(input).kind);
check(kinds.join() === "checking,checking,blocked", "2.1 الانتقال: يفحص ← النتيجة مباشرة");

/* 3) جواب الفحص. */
const rows: any[] = [{ sourceOrder: 0, AdCourseId: 1, SCode: "501" }, { sourceOrder: 1, AdCourseId: 2, SCode: "501" }];
const answer = readPreflightAnswer({ conflicts: [{ message: "حجز مزدوج", rowIndex: 1, otherIndex: null, otherLabel: "قسم آخر" }], issues: ["السطر 1: وقت غير صالح"] }, rows);
check(answer.issues[0] === "الصف 2: حجز مزدوج مع موعد محفوظ في قسم آخر.", "3.1 التعارض يسمّي الطرف الآخر");
check(answer.rowChecks.length === 1 && answer.rowChecks[0].row === 1, "3.2 رفض الحفظ يصل صفه");
check(Object.keys(answer.notes).length === 2, "3.3 الملاحظات على خلايا الصفين");
check(importRowsSignature(rows) === importRowsSignature(rows.map(row => ({ ...row, importEvidence: { x: 1 } }))), "3.4 دليل الصف لا يعيد الفحص");
check(importRowsSignature(rows) !== importRowsSignature([{ ...rows[0], fstarttime: "08:00" }, rows[1]]), "3.5 تغيّر الوقت يعيد الفحص");

const manual = [{ ...rows[0], importEvidence: { instructor: { source: "MANUAL" } } }, rows[1]];
check(importRowsSignature(rows) !== importRowsSignature(manual), "3.6 «تثبيت» يغيّر المصدر لا الرقم، فيُعاد الفحص");
check(importRowsSignature(rows) !== importRowsSignature([{ ...rows[0], importEvidence: { instructor: { method: "EXACT_FULL" } } }, rows[1]]), "3.7 برهان الاسم الكامل يعيد الفحص");
check(importRowsSignature(rows) !== importRowsSignature([{ ...rows[0], locationStatus: "PENDING_ROOM" }, rows[1]]), "3.8 «بانتظار التثبيت» يعيد الفحص");

/* 4) الوصل في المصدر. */
const transfer = read("src/components/ScheduleTransfer.tsx");
const dry = read("src/components/ImportDryRun.tsx");
const paged = read("src/components/PagedImportPreview.tsx");
const intel = read("src/components/IntelligenceWorkspace.tsx");
const bar = read("src/components/ImportStatusBar.tsx");
const hook = read("src/hooks/useImportPreflight.ts");
const css = read("src/styles/42-import-bar.css");
const server = read("src/server/routes/scheduleImportRoutes.ts");
check((transfer.match(/saveExcelDraft\(true/g) || []).length === 1, "4.1 طريق كتابة واحد في الشاشة: الشريط");
check(!/PrimaryButton/.test(dry) || !/طبّق/.test(dry.match(/<PrimaryButton[\s\S]*?<\/PrimaryButton>/)?.[0] || ""), "4.2 لا «طبّق» ثانٍ في بطاقة التجربة");
check(!/onApply|onUndo|onCancel/.test(dry), "4.3 البطاقة تقول الفرق وحده");
check(/if \(!publishGateSatisfied\) return;/.test(transfer), "4.4 لا كتابة أثناء الفحص ولو وصل الضغط");
check(/checking \? <Loader2[\s\S]{0,60}<CheckCircle2/.test(paged) && /if \(checking\) return/.test(paged), "4.5 لا علامة صح على صفحة أثناء الفحص");
check(/importSettled[\s\S]{0,40}\?<span className="ready">/.test(transfer), "4.6 بطاقة «جاهز للنشر» بعد النتيجة وحدها");
check(/useImportPreflight/.test(intel) && /<ImportStatusBar/.test(intel) && /importPreflight\.state !== "pending"/.test(intel), "4.7 مركز الذكاء يقرأ الفحص نفسه والشريط نفسه");
check(!/اعتمد وانزّل الجدول كاملاً<\/PrimaryButton>/.test(intel), "4.8 لا زر اعتماد ثانٍ هناك");
check(/answeredRef\.current \? IMPORT_EDIT_DEBOUNCE_MS : 0/.test(hook), "4.9 الملف الجديد يُفحص بلا مهلة");
check(/\[enabled, collegeId, sectionId, termId, signature, importLayout, attempt\]/.test(hook) && !/xlsxPreview/.test(hook), "4.10 إعادة الفحص بالتوقيع، لا بهوية المصفوفة");
check(/failed: true/.test(hook) && /import-preflight/.test(hook), "4.11 تعذّر الفحص لا يُقرأ نجاحاً");
check(/validateSmartRows\(rows\.map\(row=>\(\{\.\.\.row\}\)\)/.test(server) && /checkConflicts:false/.test(server), "4.12 الفحص يسأل ما يرفضه الحفظ، على نسخة، بالدالة نفسها");
check(/position:sticky;inset-block-end:0/.test(css) && /safe-area-inset-bottom/.test(css), "4.13 ملتصق بالأسفل مع منطقة الأمان");
check(/>\.import-bar\)>header\{position:sticky/.test(css), "4.14 إغلاق الرأس لا يغيب");
check(/\.import-bar\.is-inline\{inset-block-end:calc\(var\(--dock-h/.test(css), "4.15 في الصفحة يلتصق فوق شريط الجوال");
const sheet = transfer.slice(transfer.lastIndexOf("<ImportStatusBar"));
check(/<\/section>\s*<\/div>/.test(sheet), "4.16 الشريط آخر ما في النافذة، فلا يغطّي محتوى");
check(/إغلاق/.test(bar) && (bar.match(/import-bar-close/g) || []).length === 1, "4.17 «إغلاق» واحد بموضع ثابت");

console.log(`${passed} passed, 0 failed`);
