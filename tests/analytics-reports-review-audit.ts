/**
 * ── مركز التحليل، الطبقة الحية، مراجعة الصحيفة، التقارير: ما وجدته مراجعة المتطلبات ──
 *
 *   I  مركز التحليل: لا تبويب استيراد ميت (الاستيراد في «نقل الجدول» وحده)،
 *      وسجل النسخ وغرفة القرار والطيار الآلي بالعربية، ولوحة القواعد كما يحكم الخادم.
 *   L  الطبقة الحية: «لماذا» و«المحضر» و«المساعد» في الشريط، والإدارة الرئيسية بقاعدة الخادم.
 *   P  مراجعة الصحيفة: حذف المجموعة بتأكيد، واستيراد ورقة القواعد وتصحيح الكتالوج موصولان.
 *   R  التقارير: سجل الانتداب يُبقي من خرج من الدليل بعلامته، وتعليق صفحة العدالة صادق.
 */
import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const between = (text: string, from: string, to: string) => {
  const start = text.indexOf(from);
  return start < 0 ? "" : text.slice(start, text.indexOf(to, start + from.length));
};

/* ── I ── */
{
  const intel = read("src/components/IntelligenceWorkspace.tsx");
  check(/type Tab = "command" \| "copilot" \| "twin" \| "whatif" \| "history";/.test(intel) && !/tab === "import"/.test(intel),
    "I1 لا تبويب «استيراد» لا يُفتح: النوع والعرض بلا import");
  check(!/importSmartFile|fillUnreadCellsSmart|importPdf|importExcel|approveAndPublishPdf|downloadImportTemplate|smartRetry|importErrorModal/.test(intel),
    "I2 أدوات الاستيراد المكررة وعرض القراءة الأدق أُزيلت من مركز التحليل");
  check(!/Gemini|Smart Import/.test(intel), "I3 لا عرض لإعادة القراءة عبر الخدمة الخارجية في مركز التحليل");
  const server = read("src/server/routes/pdfImportRoutes.ts") + read("src/server/routes/intelligenceRoutes.ts") + read("src/server/routes/intelligenceInsightRoutes.ts") + read("src/server/routes/scheduleImportRoutes.ts");
  const allServer = fs.readdirSync(path.join(process.cwd(), "src/server/routes")).map(f => read(`src/server/routes/${f}`)).join("\n") + read("server.ts");
  check(allServer.includes("/api/intelligence/smart-import") && allServer.includes("/api/intelligence/pdf-import") && Boolean(server),
    "I4 مسارات الخادم للاستيراد باقية (تستعملها شاشة نقل الجدول)");
  const transfer = read("src/components/ScheduleTransfer.tsx");
  check(/smart-import|pdf-import/.test(transfer), "I5 الاستيراد ما زال متاحاً من نافذة نقل الجدول");

  const timeline = between(intel, "{versionSourceLabel(v.source)}", "</Badge>");
  check(Boolean(timeline) && !/\{v\.source\}/.test(intel), "I6 شارة سجل النسخ لا تطبع الرمز الخام (publish/undo)");
  check(/publish: "نشر"/.test(intel) && /undo: "تراجع"/.test(intel) && /import: "استيراد"/.test(intel) && /manual: "حفظ يدوي"/.test(intel),
    "I7 لكل مصدر نسخة اسم عربي");
  check(!/افتح في Twin/.test(intel) && /افتح في النسخة التجريبية/.test(intel), "I8 زر غرفة القرار بالعربية");
  check(!/endpoint للنشر/.test(intel) && /ولا يملك\s+صلاحية النشر/.test(intel), "I9 تنبيه الطيار الآلي بلا كلمة إنجليزية");

  check(/const canEditRules = isPowerAdmin;/.test(intel) && /const isPowerAdmin = Boolean\(user\?\.IsAdminUser/.test(intel),
    "I10 الكتابة في لوحة القواعد للإدارة الرئيسية وحدها (requirePowerAdmin)");
  check(/\{canEditRules \? \(\s*<div className="constraint-form">/.test(intel) && /للقراءة فقط/.test(intel) && /لإدارة النظام الرئيسية وحدها/.test(intel),
    "I11 غير المخوَّل يرى القواعد بملاحظة واضحة بدل نموذج الإضافة");
  check(/\{canEditRules \? \(\s*<button\s+className="constraint-toggle"/.test(intel) && /\{canEditRules \? \(\s*<button\s+data-guide-ignore="حذف قاعدة/.test(intel),
    "I12 زرّا التبديل والحذف يظهران لمن يقبله الخادم وحده");
  const routes = read("src/server/routes/intelligenceRoutes.ts");
  const allowed = (routes.match(/const allowed=new Set\(\[([^\]]+)\]\)/) || [])[1] || "";
  const kinds = [...allowed.matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
  check(kinds.length === 6 && kinds.every(kind => intel.includes(`<option value="${kind}">`)),
    "I13 النموذج يعرض أنواع القواعد الستة التي يقبلها الخادم (ومنها فاصل القاعة)");
  check(/constraintDraft\.type === "room_doorway" \? \(\s*<Field label="الفاصل بالدقائق">/.test(intel) && /min="1"\s+max="60"/.test(intel),
    "I14 فاصل القاعة بحقله: دقائق من ١ إلى ٦٠ كما يقصّها الخادم");
  check(/maxMinutes: e\.target\.value === "room_doorway" \? 10 : e\.target\.value === "max_instructor_gap" \? 120/.test(intel),
    "I15 تبديل النوع يضع قيمة دقائق تناسبه (لا ١٢٠ دقيقة لفاصل الباب)");
}

/* ── L ── */
{
  const living = read("src/components/LivingScheduleLayer.tsx");
  const scenes = read("src/components/LivingScheduleScenes.tsx");
  check(/const power = Boolean\(user\?\.IsAdminUser \|\| user\?\.IsRootAdmin\);/.test(living) && !/const power = Boolean\(user\?\.SystemUserId\)/.test(living),
    "L1 «الإدارة الرئيسية» بقاعدة الخادم (isPowerUser) لا بمجرد تسجيل الدخول");
  /* «مركز القرار» صار بطاقاتٍ في «مركز الذكاء»: كل مشهدٍ في بطاقته. */
  const iw = read("src/components/IntelligenceWorkspace.tsx");
  check(["why", "copilot", "meeting", "genesis", "topology", "brief", "memory"].every(id => iw.includes(`embeddedScenes={["${id}"]}`)) && iw.includes('embeddedScenes={["pulse", "health"]}'),
    "L2 مشاهد «لماذا» و«المساعد» و«المحضر» وبقية المشاهد في بطاقاتها بمركز الذكاء");
  check(/const point = isPowerAdmin \? safetyPoints\.get\(String\(v\.id\)\) : null;/.test(iw) && /if \(approveCard !== "versions" \|\| !isPowerAdmin/.test(iw), "L3 شبكة الأمان (في «سجل النسخ») بأثرها واسترجاعها للإدارة الرئيسية وحدها");
  check(/if \(next === "memory" && !power\) return;/.test(living) && /shows\("memory"\) && power/.test(living) && /ledgerTab === "memory" && isPowerAdmin/.test(iw) && /isPowerAdmin \? \[\{ value: "memory"/.test(iw),
    "L4 الذاكرة والشبكة لا تُفتحان ولا تُقرآن لغير الإدارة الرئيسية");
  check(/onRemember=\{power \? \(\) => open\("memory"\) : undefined\}/.test(living) && /onRemember\?: \(\) => void;/.test(scenes) && /\{onRemember \? <button onClick=\{onRemember\}>افتح الذاكرة<\/button> : null\}/.test(scenes),
    "L5 «ذاكرة القرار» تُفتح من «لماذا» لمن يملكها، ويُقرأ التحذير لغيره بلا زر");
  check(!/savePlan|خطة إنقاذ/.test(living), "L6 لا دالة «خطة إنقاذ» لا تُستدعى");
  check(/scene === "memory" && embeddedScenes\?\.includes\("why"\)/.test(living) && living.includes("العودة إلى «لماذا»"), "L7 «ذاكرة القرار» المفتوحة من «لماذا» تعود إليه في البطاقة نفسها");
  /* مراجعة PR #488 */
  check(/useEffect\(\(\) => \{\s*if \(scene === "memory" && power\) void loadMemory\(\);/.test(living),
    "L8 لسانُ «ذاكرة القرار» في «دفتر القرار» يقرأ الذاكرة حين يُعرض (لا يمرّ بـopen)");
  const genesisMutations = ["saveGenesisRow", "deleteGenesisRow", "deleteAllGenesisRows"].map(name => between(living, `const ${name} = async`, "finally {"));
  check(genesisMutations.every(body => body.includes("onDraftsChanged?.();")) && living.includes('onClick={() => { onDraftsChanged?.(); onNavigate?.("drafts"); }}'),
    "L9 تعديلُ صفوف مسودة «بداية الفصل» وحذفُها يعيدان قراءة «المسودات» قبل «فتح» و«انشرها من المسودات»");
  check(/published\.undoVersions\.map\(/.test(iw) && /for \(const point of points\)/.test(iw) && iw.includes("undoPublishPoints(publishUndo.points"),
    "L10 «تراجع عن النشر» يسترجع كلَّ نسخ ما قبل النشر (نشرٌ عبر عدة مواقع)، لا أولاها فقط");
}

/* ── P ── */
{
  const ui = read("src/components/PlanReview.tsx");
  const groups = between(ui, "function GroupsPanel", "\n}\n");
  check(/const \[confirmDelete, setConfirmDelete\] = useState<string \| null>\(null\);/.test(groups) && /onClick=\{\(\) => setConfirmDelete\(g\.id\)\}/.test(groups) && !/onClick=\{\(\) => onDelete\(g\.id\)\}/.test(groups),
    "P1 زر حذف المجموعة يفتح تأكيداً لا يحذف");
  check(/className="pr-confirm" role="alertdialog"/.test(groups) && /setConfirmDelete\(null\); onDelete\(g\.id\);/.test(groups) && /نعم، احذف/.test(groups) && /تراجع/.test(groups),
    "P2 التأكيد مضمَّن بنمط اعتماد الصحيفة (pr-confirm) وبه تراجع");
  check(/<ImportPanel onDone=\{reloadAfterImport\} \/>/.test(ui) && /status\?\.canImport \? <PlanSheetUpload/.test(ui),
    "P3 استيراد ورقة القواعد (Excel/CSV) معروض للحساب الرئيسي وحده (canImport) بين أدوات الصيانة");
  check(/<CurriculumReferenceReview[\s\S]{0,200}onCatalogAction=\{onNavigate \? openCatalogCorrection : undefined\}/.test(ui) && /canApply=\{Boolean\(status\.canImport\)\}/.test(ui),
    "P4 صحيفة التخرج للقسم المرجعي موصولة، ومنها يُفتح تصحيح الكتالوج");
}

/* ── R ── */
{
  const reports = read("src/components/Reports.tsx");
  const history = between(reports, "const visitingHistoryRows = useMemo", "}, [visitingHistory, instructorById]);");
  check(Boolean(history) && !/\.filter\(person => instructorById\.has/.test(history) && /live\?\.AdInstructorName \|\| person\.name/.test(history),
    "R1 سجل الانتداب لا يُسقط من غاب عن قائمة الأساتذة المحمّلة (FR-RPT-011)");
  check((reports.match(/person\.listedNow === false \? <small className="visiting-history-left">لم يعد في دليل القسم<\/small>/g) || []).length === 2,
    "R2 علامة «لم يعد في دليل القسم» على الشاشة والورقة");
  const fairness = between(reports, 'if (kind === "fairness") {', "const pages");
  check(/fairnessRows: 11,/.test(reports) && /أحد عشر صفاً/.test(fairness) && !/Ten rows/.test(fairness), "R3 تعليق ورقة العدالة يطابق ميزانها (١١ صفاً)");
}

{
  const route = read("src/server/routes/intelligenceRoutes.ts");
  check(/maxMinutes:\(type==="max_instructor_gap"\|\|type==="room_doorway"\)\?maxMinutes:undefined/.test(route), "S1 قاعدة الفاصل بين محاضرتين تُحفظ بدقائقها فتعمل");
  check(/type==="room_doorway"\?`القسم كله: فاصل/.test(route), "S2 قاعدة الفاصل لها وصفها لا وصف فراغ الأستاذ");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
