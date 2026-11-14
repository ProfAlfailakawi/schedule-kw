/**
 * ── «أدوات الجدول»: ثلاث مجموعات، ولا شيء ضاع (المالك 2026-11-14) ─────────────
 *
 *   G1 الزرّ «أدوات الجدول» (لا «أدوات البيانات») في الجدول الدراسي وعنوان النافذة.
 *   G2 المجموعات بترتيبها: «التخطيط» (تخطيط الشعب، كل المقررات، الطلب الفعلي) ← «الأساتذة»
 *      (الأساتذة، المنتدبون، استبدال، تحويل هيئة التدريب) ← «الملفات» (استيراد، تصدير، نشر).
 *   G3 الفصل الأرشيف: «الملفات» وحدها بـ«تصدير» و«نشر» — لا استيراد ولا تخطيط ولا أساتذة.
 *   G4 «تحويل هيئة التدريب» انتقل من «المزيد» إلى «الأساتذة» بنسخته الآمنة وتراجعه.
 *   G5 «الصحيفة» في «نشر» لرئيس لجنة الجدول والمدير، ولا تغيب في الأرشيف؛ والخادم يقبل رئيس اللجنة.
 *   G6 شارتا «التخطيط» و«الطلب الفعلي» في شريط الاعتماد تفتحان لسانيهما، والقائمة باقيةٌ بسهمها.
 *   G7 «حفظ العرض الحالي» و«تركيز» في قائمة العروض وحدها؛ و«تجربة آمنة» زرٌّ ظاهرٌ كما كان؛ ولوحة الأوامر باقية.
 */
import fs from "fs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const schedules = read("src/components/Schedules.tsx");
const transfer = read("src/components/ScheduleTransfer.tsx");
const ta = read("src/components/TAConversionPanel.tsx");
const views = read("src/components/ScheduleViewsMenu.tsx");
const bar = read("src/components/ApprovalBar.tsx");
const gap = read("src/components/SectionGapNote.tsx");
const demand = read("src/components/ActualDemandAlert.tsx");
const sheets = read("src/server/planSheetRoutes.ts");

check(/<ArrowLeftRight \/> أدوات الجدول/.test(schedules) && !/أدوات البيانات/.test(schedules) && /<h2>\{termEnded \? "تصدير · نشر" : "أدوات الجدول"\}<\/h2>/.test(transfer),
  "G1 «أدوات الجدول» على الزرّ وفي عنوان النافذة");

const nav = transfer.slice(transfer.indexOf('className={`transfer-tabs transfer-tabs--grouped'), transfer.indexOf("</nav>"));
const at = (needle: string) => nav.indexOf(needle);
const order = ['id="transfer-group-planning"', 'goTab("planning")', 'goTab("courses")', 'goTab("demand")',
  'id="transfer-group-people"', 'goTab("roster")', 'goTab("visiting")', 'goTab("retire")', 'goTab("ta")',
  'id="transfer-group-files"', 'goTab("import")', 'goTab("export")', 'goTab("publish")'];
check(order.every(needle => at(needle) >= 0) && order.every((needle, index) => index === 0 || at(order[index - 1]) < at(needle)),
  "G2 المجموعات وألسنتُها بالترتيب: التخطيط ← الأساتذة ← الملفات");
check(/>التخطيط<\/span>/.test(nav) && />الأساتذة<\/span>/.test(nav) && />الملفات<\/span>/.test(nav) && /is-planning" role="group"/.test(nav),
  "G2 عناوينُ المجموعات الثلاث، و«التخطيط» أبرزها");
check((nav.match(/role="group"/g) || []).length === 3, "G2 ثلاث مجموعات لا غير");
check(/useState<Tab>\(\(\) => initialTab \|\| \(termEnded \? "export" : "planning"\)\)/.test(transfer), "G2 النافذةُ تُفتح على «تخطيط الشعب» أو على اللسان المطلوب");

const planningGroup = nav.slice(0, at('id="transfer-group-files"'));
check((planningGroup.match(/\{termEnded \? null : \(/g) || []).length === 2, "G3 التخطيط والأساتذة يغيبان في الأرشيف");
const files = nav.slice(at('id="transfer-group-files"'));
check(/\{termEnded \? null : \(\s*<button[\s\S]{0,300}?goTab\("import"\)/.test(files) && !/termEnded \? null : \(\s*<button[^\n]*goTab\("export"\)/.test(files)
  && /useEffect\(\(\) => \{ if \(termEnded && tab !== "export" && tab !== "publish"\) setTab\("export"\); \}, \[termEnded, tab\]\);/.test(transfer),
  "G3 والأرشيف «تصدير» و«نشر» وحدهما");

check(!/import TAConversionPanel/.test(schedules) && !/setTaConversionOpen/.test(schedules), "G4 لا «تحويل هيئة التدريب» في «المزيد»");
check(/<TAConversionPanel embedded collegeId=\{collegeId\}/.test(transfer) && /useDialogDismiss\(!embedded, onClose\)/.test(ta)
  && /undoVersionId/.test(ta) && /نسخة آمنة قبل التحويل/.test(ta) && /void undo\(\)/.test(ta),
  "G4 وهو في «الأساتذة» بنسخته الآمنة وتراجعه");
check(/visitingRosterIds=\{pickerVisitingRosterIds\}/.test(schedules) && /visitingIds=\{visitingIds\}/.test(schedules), "G4 بشارات المنتدبين نفسها");

const publish = transfer.slice(transfer.indexOf('{tab === "publish" ? ('), transfer.indexOf('{tab === "ta" ? ('));
check(/\{canPublishSheets \? \(/.test(publish) && /<PlanSheetPublisher focusSectionId=/.test(publish)
  && publish.indexOf("<PlanSheetPublisher") > publish.indexOf("termIsArchive(") && !/termIsArchive\([^)]*\)[^?]*\?[^:]*:\s*<PlanSheetPublisher/.test(publish),
  "G5 «الصحيفة» في «نشر»، خارج شرط الأرشيف");
check(/canPublishSheets=\{isPowerAdmin \|\| roleDefinition\(\(user as any\)\?\.Role\)\.id === "committeeChair"\}/.test(schedules),
  "G5 لرئيس لجنة الجدول والمدير");
check(/roleId\(req\) === "committeeChair" && deps\.isScopeAllowed\(req, collegeId, sectionId\)/.test(sheets), "G5 والخادم يقبل رئيس اللجنة في نطاقه");
const chair = read("src/utils/academicRoles.ts");
check(/id: "committeeChair"[\s\S]{0,400}formIds: \[SCHEDULE_WORKSPACE/.test(chair), "G5 ورئيس اللجنة يفتح الجدول الدراسي (فيصل إلى أدوات الجدول)");

check(/onOpenTool\?: \(tab: "planning" \| "demand"\) => void;/.test(bar) && /onOpen=\{onOpenTool \? \(\) => onOpenTool\("planning"\) : undefined\}/.test(bar)
  && /onOpen=\{onOpenTool \? \(\) => onOpenTool\("demand"\) : undefined\}/.test(bar), "G6 الشارتان تفتحان لسانيهما");
check(/apb-badge-chev[^>]*aria-expanded=\{open\} onClick=\{onToggle\}/.test(gap) && /apb-badge-chev[^>]*aria-expanded=\{open\} onClick=\{onToggle\}/.test(demand),
  "G6 والقائمة باقيةٌ بسهمها (لا يضيع «عالج» ولا قرارات التخطيط)");
check(/onOpenTool=\{tab => \{[^}]*setTransferTab\(tab\); setTransferOpen\(true\);/.test(schedules) && /initialTab=\{transferTab\}/.test(schedules), "G6 والجدول يفتح النافذة على اللسان");

check(!/<Bookmark aria-hidden="true" \/> حفظ العرض الحالي/.test(schedules) && !/<Focus \/> \{focusMode \? "إنهاء التركيز" : "تركيز"\}/.test(schedules),
  "G7 لا «حفظ العرض الحالي» ولا «تركيز» في «المزيد»");
check(/<span>حفظ العرض الحالي<\/span>/.test(views) && /\{focusMode \? "إنهاء التركيز" : "تركيز"\}/.test(views) && !/if \(!views\.length\) return null;/.test(views)
  && /onToggleFocus=\{phoneReadOnly \? undefined :/.test(schedules), "G7 وهما في قائمة العروض، والقائمة حاضرةٌ ولو بلا عروض");
check(/<FlaskConical aria-hidden="true" \/> تجربة آمنة/.test(schedules) && /title="وضع تجربة"/.test(schedules), "G7 «تجربة آمنة» زرٌّ ظاهرٌ بشارة «وضع تجربة»");
check(/id: "views\.save", group: "العروض المحفوظة", label: "حفظ العرض الحالي"/.test(schedules) && /id: "schedule\.focus"/.test(schedules), "G7 ولوحة الأوامر باقيةٌ بأمريها");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
