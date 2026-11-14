/**
 * ── إصلاحات لوحة الجدول وأدواتها (مراجعة الوثيقة) ─────────────────────────────
 *
 * كل بندٍ هنا عيبٌ وجدته مراجعة المتطلبات بين ما تقوله الشاشة وما تفعله:
 * قراءة الخانة بأطوال اللائحة نفسها، وعبارة النسخ كما يرفضه الخادم، والنقل
 * الجماعي موصولاً، والتنبيهات معروضة، ووسما «الآن/التالي» للفصل الجاري وحده،
 * وأوامر الكتابة لمن يعدّل، والقفل قبل فتح المحرر، و«وضع تجربة» لا يكتب شيئاً،
 * وموقع الفرع، ونموذج Excel برقم المقرر الكامل.
 */
import fs from "node:fs";
import path from "node:path";
import { DECISION_1913_LABEL, expectedMinutesForDay } from "../src/utils/scheduleRegulations";
import { pickLive } from "../src/utils/weekVisual";
import { isCampusCollege } from "../src/utils/collegeTrack";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const schedules = read("src/components/Schedules.tsx");
const review = read("src/components/ScheduleReview.tsx");
const transfer = read("src/components/ScheduleTransfer.tsx");
const tours = read("src/guide/tour/tours.ts");
/** مقطعٌ من المصدر يبدأ بتعريف الدالة، بطولٍ يكفي لما يُفحص فيه. */
const bodyOf = (src: string, head: string, length = 1600) => {
  const at = src.indexOf(head);
  return at < 0 ? "" : src.slice(at, at + length);
};

/* 1 ── readPlacement بأطوال اللائحة نفسها ─────────────────────────────────── */
const placement = bodyOf(schedules, "const readPlacement = useCallback", 3200);
check(expectedMinutesForDay("fsunday") === 50 && expectedMinutesForDay("fmonday") === 80, "اللائحة: 50 دقيقة للأحد و80 للاثنين");
check(placement.includes("const expected = expectedMinutesForDay(day as RegDayKey);"), "قراءة الخانة تأخذ الطول المتوقع من دالة اللائحة نفسها");
check(!/\?\s*90\s*:\s*60/.test(placement), "لا 60/90 مكتوبة باليد في قراءة الخانة");

/* 2 ── عبارة النسخ تطابق رفض الخادم ───────────────────────────────────────── */
check(!schedules.includes("سيُضاف الجديد بجانب الموجود"), "لا تَعِد شاشة النسخ بإضافة بجانب الموجود");
check(schedules.includes("لا يُنسخ إلى فصلٍ فيه مواعيد؛ اختر فصلاً وجهةً فارغاً"), "تقول شاشة النسخ إن الوجهة يجب أن تكون فارغة");

/* 3 ── النقل الجماعي موصول، والعدسة و«نقش» أُزيلا ─────────────────────────── */
check(!schedules.includes("{false ? <button"), "زر النقل الجماعي لم يعد خلف false");
check(/\{canEditSchedule && !phoneReadOnly \? <button[\s\S]{0,200}week-pick-toggle/.test(schedules), "زر «نقل جماعي» يظهر لمن يعدّل على غير الهاتف");
check(/id: "schedule\.pick"[\s\S]{0,400}setPicking\(v => !v\)/.test(schedules), "لوحة الأوامر تحمل «نقل جماعي»");
check(!/const \[lens, setLens\]/.test(schedules) && !schedules.includes("lensClass(") && !schedules.includes("lensRoomBusy"), "حالة العدسة الميتة أُزيلت");
check(!schedules.includes("setColorBlind") && !schedules.includes("data-colorblind") && !schedules.includes("textureFor("), "مفتاح «نقش» الميت أُزيل ولا يُطبَّق من عرضٍ محفوظ");
check(schedules.includes("colorBlind: false,"), "العرض المحفوظ يكتب الحقل مطفأً ليبقى شكله");

/* 4 ── التنبيهات تُعرض بجانب الموانع ──────────────────────────────────────── */
check(!review.includes("void activeWarnings"), "التنبيهات لم تعد تُحسب وتُرمى");
check(review.includes("{warningGroups.map(renderFinding)}"), "بطاقات التنبيه تُرسم بعد الموانع");
check(/warningFindings = useMemo[\s\S]{0,400}approvalEffect: "review"/.test(review), "التنبيه «للمراجعة» لا «مانع»");
check(!/const findings = useMemo\([\s\S]{0,200}warningFindings/.test(review), "التنبيهات لا تدخل قائمة الموانع ولا الدرجة");

/* 5 ── «يعمل الآن/التالي» للفصل الجاري وحده ──────────────────────────────── */
check(schedules.includes("pickLive(filteredRows as any, termIsRunning ? todayKey : null, nowMinutes)"), "وسما القائمة مشروطان بالفصل الجاري");
{
  const rows = [{ id: 1, fsunday: true, fstarttime: "08:00", fendtime: "09:00" }, { id: 2, fsunday: true, fstarttime: "10:00", fendtime: "11:00" }];
  const live = pickLive(rows as any, "fsunday" as any, 8 * 60 + 30);
  const past = pickLive(rows as any, null, 8 * 60 + 30);
  check(live.running.has(1) && live.next === 2, "الفصل الجاري: الأول يعمل والثاني التالي");
  check(past.running.size === 0 && past.next === null, "فصلٌ غير جارٍ: لا وسم");
}

/* 6 ── عبارة لوحة السياق باسم الزر الحقيقي ─────────────────────────────────── */
check(!schedules.includes("ضغط «موافق»") && schedules.includes("ضغط «احفظ الموعد»"), "«لن يُحفظ شيء قبل ضغط «احفظ الموعد»»");

/* 7 ── أوامر الكتابة لمن يعدّل لا للإدارة وحدها ───────────────────────────── */
check(schedules.includes("const canEditSchedule = isPowerAdmin || (permissions.includes(7) && !isReadOnlyRole(user?.Role));"), "من يعدّل: الإدارة أو صاحب الشاشة 7 بصفة غير قرائية");
check(schedules.includes("return canEditSchedule || !writes.has(command.id) ? command"), "أوامر الكتابة في اللوحة تتبع canEditSchedule");
check(/const writes = new Set\(\["schedule\.create", "schedule\.pick", "schedule\.undo", "schedule\.clash"/.test(schedules), "إضافة وتراجع وتداخل ونقل جماعي من أوامر الكتابة");
check(bodyOf(schedules, "const pickUpWithKeyboard = useCallback", 200).includes("if (!canEditSchedule || saving) return;"), "الالتقاط بالمسافة لمن يعدّل");
check(schedules.includes('const oneLineOffered = commands.some(command => command.id === "schedule.create" && command.visible !== false);'), "سطر الموعد يتبع ظهور «إضافة موعد»");

/* 8 ── القفل يمنع فتح محرر التعديل كالإضافة ───────────────────────────────── */
{
  const openEdit = bodyOf(schedules, "openEdit = (row: FSchedule) => {", 400);
  const lock = bodyOf(schedules, "const lockRefusesEdit = () => {", 200);
  check(openEdit.includes("if (showMobileReadOnlyGate() || lockRefusesEdit()) return;"), "التعديل يُمنع عند القفل قبل فتح المحرر");
  check(lock.includes("if (!approvalLock) return false;") && lock.includes("setError(approvalLock);"), "بعبارة القفل نفسها التي تمنع الإضافة");
}

/* 9 ── اسم الثابت يطابق قيمته ──────────────────────────────────────────────── */
check(DECISION_1913_LABEL === "قرار 1913/2016", "DECISION_1913_LABEL = «قرار 1913/2016»");
{
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
  const stale = walk(path.join(process.cwd(), "src")).filter(file => fs.readFileSync(file, "utf8").includes("DECISION_1912_LABEL"));
  check(stale.length === 0, `لا أثر للاسم القديم DECISION_1912_LABEL (${stale.length})`);
}

/* 10 ── «وضع تجربة» لا يكتب في الجدول الحقيقي ─────────────────────────────── */
{
  const literal = schedules.match(/export const PRACTICE_READ_POSTS = \/(.+)\/;/);
  const readPosts = literal ? new RegExp(literal[1]) : null;
  check(Boolean(readPosts), "قائمة الطلبات القارئة معرَّفة");
  if (readPosts) {
    check(readPosts.test("/api/schedules/check-conflicts") && readPosts.test("/api/intelligence/ripple/12") && readPosts.test("/api/intelligence/why-not"), "فحص التعارض وقراءات الشرح تبقى أثناء التجربة");
    check(!readPosts.test("/api/schedules/move-batch") && !readPosts.test("/api/schedules") && !readPosts.test("/api/schedules/copy")
      && !readPosts.test("/api/intelligence/versions/9/restore") && !readPosts.test("/api/intelligence/safety-net/3/undo")
      && !readPosts.test("/api/intelligence/comments/4") && !readPosts.test("/api/schedules/placeholder-action"), "النقل والإنشاء والنسخ والاسترجاع والتعليقات تُمنع أثناء التجربة");
  }
  const fetchJson = bodyOf(schedules, "const fetchJson = async (url: string, options?: RequestInit) => {", 900);
  check(fetchJson.includes("if (mutating && practiceModeRef.current && !PRACTICE_READ_POSTS.test(url)) throw new Error(PRACTICE_WRITE_BLOCKED);"), "fetchJson يرفض كل كتابة أثناء التجربة قبل الشبكة والطابور");
  check(fetchJson.indexOf("PRACTICE_READ_POSTS.test(url)") < fetchJson.indexOf("!navigator.onLine"), "الحاجز قبل طابور ما دون الاتصال");
  const guarded: Array<[string, string]> = [
    ["const runUndoEntry = async", "التراجع"],
    ["const applyRepair = useCallback(async", "سلسلة الإصلاح"],
    ["const copySchedule = async", "نسخ الفصل"],
    ["const undoCopy = async", "التراجع عن النسخ"],
    ["const undoPhysicsDecision = async", "استرجاع نقطة الأمان"],
    ["const placeholderAction = async", "أفعال الخانة المؤقتة"],
    ["const requestBorrow = async", "طلب استعارة قاعة"],
    ["const addComment = async", "إضافة تعليق"],
    ["const resolveComment = async", "حسم تعليق"],
    ["const createQuick = async", "الإضافة السريعة"],
    ["const moveSchedule = async", "النقل بالتأكيد"],
  ];
  guarded.forEach(([head, label]) => check(bodyOf(schedules, head, 700).includes("if (refuseInPractice()) return;"), `${label}: يُمنع أثناء التجربة بعبارة واضحة`));
  const roomMove = bodyOf(schedules, "const commitRoomMove = async", 6000);
  check(/if \(practiceModeRef\.current\) \{[\s\S]{0,400}setRows\(current => current\.map[\s\S]{0,400}return;\s*\}\s*setSaving\(true\);/.test(roomMove), "نقل القاعات يُحاكى محلياً أثناء التجربة قبل أي كتابة");
  check(schedules.includes("{practiceMode ? null : <WipeScheduleButton"), "مسح الجدول يغيب أثناء التجربة");
  check((schedules.match(/!showMobileReadOnlyGate\(\) && !refuseInPractice\(\)\) (?:\{ [^}]*)?setTransferOpen\(true\)/g) || []).length >= 4, "أدوات الجدول لا تُفتح أثناء التجربة (الشريط والحالة الفارغة والمرشد وشارتا الاعتماد)");
  /* «تحويل هيئة التدريب» صار داخل «أدوات الجدول ← الأساتذة» (المالك 2026-11-14)، فيُمنع بمنعها. */
  check(schedules.includes("!refuseInPractice()) setGenesisFromEmpty(true)") && !schedules.includes("setTaConversionOpen")
    && fs.readFileSync("src/components/ScheduleTransfer.tsx", "utf8").includes("<TAConversionPanel embedded"), "بداية الفصل وتحويل هيئة التدريب يُمنعان أثناء التجربة");
  check(schedules.includes("workspaceToolsOpen && !practiceMode && mode === \"schedule\""), "سوق استعارة القاعات يغيب أثناء التجربة");
  check(/if \(refuseInPractice\(\)\) return;\s*setInbox\(current => current\.filter/.test(schedules), "حسم رسالة الأستاذ يُمنع أثناء التجربة");
}

/* 11 ── المرشد يبدأ التجربة من باب ظاهر ───────────────────────────────────── */
{
  const door = schedules.match(/\{workspaceToolsOpen && !practiceMode && !phoneReadOnly && mode === "schedule" \? <GhostButton[\s\S]{0,500}?<\/GhostButton>/);
  check(Boolean(door) && door![0].includes('data-guide-target="schedule.practice"') && door![0].includes('type: "practice.start"'), "زر «تجربة آمنة» في «المزيد» يحمل هدف المرشد ويبدأ التجربة");
  check(/IN_MORE = new Set\(\[[^\]]*"schedule\.practice"/.test(tours), "جولة المرشد تفتح «المزيد» قبل الإشارة إلى التجربة");
  check(/if \(detail\.type === "showTarget"\) \{\s*setWorkspaceToolsOpen\(true\);/.test(schedules), "أمر «أظهر الهدف» يفتح «المزيد»");
}

/* 12 ── موقع الفرع بقاعدة مواقع البنات نفسها ──────────────────────────────── */
{
  check(transfer.includes('const branchSite = isCampusCollege(String(collegeName || ""));'), "كشف الفرع بقاعدة collegeTrack");
  check(isCampusCollege("كلية أ - الجهراء - بنات") && isCampusCollege("كلية أ - الفحيحيل - بنات"), "موقعا البنات الفرعيان فرعان");
  check(!isCampusCollege("كلية أ - بنات") && !isCampusCollege("كلية أ - بنين"), "كلية البنات الأساس وكلية البنين ليستا فرعاً");
  const base = transfer.match(/const baseCollegeName = String\(collegeName \|\| ""\)\.replace\(\/(.+?)\/g, ""\)/);
  const strip = base ? new RegExp(base[1], "g") : null;
  check(Boolean(strip) && "كلية أ - الجهراء - بنات".replace(strip!, "").trim() === "كلية أ - بنات", "الأساس هو الاسم بلا مقطع الموقع أينما جاء");
  check(Boolean(strip) && "كلية أ - الفحيحيل".replace(strip!, "").trim() === "كلية أ", "ومقطع الموقع في آخر الاسم يُحذف كذلك");
}

/* 13 ── نموذج Excel برقم المقرر الكامل ────────────────────────────────────── */
{
  const template = bodyOf(transfer, "const downloadTemplate = async", 2600);
  const samples = [...template.matchAll(/\["F1\d", [^\]]*"(\d+)"\]/g)].map(match => match[1]);
  check(samples.length === 2 && samples.every(code => /^\d{7}$/.test(code)), `صفّا المثال برقم مقرر سبع خانات (${samples.join("، ")})`);
}

/* 14 ── لا عبارة إنجليزية في نص التقدّم ────────────────────────────────────── */
check(!transfer.includes("Smart Import"), "لا «Smart Import» في شاشة أدوات البيانات");
check(transfer.includes('"قراءة أدق للصفحات المتعثرة"'), "نص التقدّم عربي خالص");
check(/mode === "schedule" && !practiceMode && filterCollege[\s\S]{0,200}<ApprovalBar/.test(schedules) && schedules.includes("practice-approval-paused"), "شريط الاعتماد موقوف في التجربة الآمنة فلا توقيع ولا إرسال حقيقي");
check(transfer.includes('"08:00-08:50", "الأحد - الثلاثاء"') && !transfer.includes('"08:00-09:20", "الأحد - الثلاثاء"'), "مثال النموذج للأحد والثلاثاء 50 دقيقة كما في اللائحة");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
