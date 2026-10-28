/**
 * ── نماذج المواعيد: حكمٌ واحد، لائحةٌ واحدة، اقتراحٌ واحد ─────────────────────
 * ملاحظات المالك 2026-10-28: A3 A5 A6 A7 A8 B1 B3 G1 G2 G3 G4 G5 G6 H1 M1.
 * سلوكٌ حقيقي على الوحدات الخالصة، ثم ربطٌ في الواجهة والخادم.
 */
import fs from "node:fs";
import { pickDay, regulationChoicesForDay, regulationEnd, regulationFit, regulationChoiceFor } from "../src/utils/appointmentRegulation";
import { patternsForHours } from "../src/utils/scheduleRegulations";
import { appointmentVerdict, relevantConflicts } from "../src/utils/appointmentVerdict";
import { emptySuggestionReason, orderSuggestionCandidates, rankSuggestionCandidates, type SuggestionHall } from "../src/utils/suggestionEngine";
import { spellingTwinGroups, spellingTwinsOf } from "../src/utils/courseSpellingTwins";
import { createDemoSandboxState, DEMO_COMPANION_TYPE, DEMO_STUDIO_ROOM_ID } from "../src/db/demoSandbox";

let passed = 0, failed = 0;
function check(condition: unknown, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(file, "utf8");
const join = (days: readonly string[]) => days.join("+");

/* ── B1/B3: الإكمال اللائحي من المصدر الواحد ─────────────────────────────── */
const theory3 = { CourseHours: 3, CourseTeachingMode: "theoretical" };
const lab3 = { CourseHours: 3, CourseTeachingMode: "practical" };
{
  const sunday = pickDay(theory3, [], "fsunday", true);
  check(join(sunday.days) === "fsunday+ftuesday+fthursday", "B1: نظري 3 ساعات — ضغط الأحد يكمل الأحد·الثلاثاء·الخميس");
  check(regulationEnd(theory3, sunday.days, "08:00") === "08:50", "B1: البداية 08:00 تحسب النهاية 08:50 من نمط اللائحة");
  check(sunday.alternatives.some(choice => choice.days.length === 1 && choice.minutes === 170), "B1: البديل المعتمد الآخر (كتلة 170د) شريحة");
  const lab = pickDay(lab3, [], "fsunday", true);
  check(join(lab.days) === "fsunday" && regulationEnd(lab3, lab.days, "08:00") === "10:50", "B1: عملي 3 ساعات — كتلة واحدة 08:00 → 10:50");
  const monday = pickDay(theory3, ["fsunday", "ftuesday", "fthursday"], "fmonday", true);
  check(join(monday.days) === "fmonday+fwednesday" && regulationEnd(theory3, monday.days, "09:30") === "10:50", "B1: نمطٌ مطبَّق + ضغط الاثنين → الاثنين·الأربعاء 80د");
  const manual = pickDay(theory3, ["fsunday", "ftuesday"], "fthursday", true);
  check(join(manual.days) === "fsunday+ftuesday+fthursday", "B1: الاختيار اليدوي يُضاف يوماً يوماً");
  const unpick = pickDay(theory3, ["fsunday", "ftuesday", "fthursday"], "fthursday", false);
  check(join(unpick.days) === "fsunday+ftuesday" && unpick.applied === null, "B1: إزالة يوم تترك الباقي ويُعلَّم خارج اللائحة");
  check(regulationFit(theory3, ["fsunday", "ftuesday"], "08:00", "08:50") === "off", "B1: ⚠️ يومان لمقرر 3 ساعات خارج اللائحة");
  check(regulationFit(theory3, ["fmonday", "fwednesday"], "08:00", "09:20") === "fits", "B1: الاثنين·الأربعاء 80د يطابق");
  check(regulationFit(theory3, ["fmonday", "fwednesday"], "08:00", "09:00") === "off", "B1: المدة اليدوية المختلفة ⚠️ لا تُمنع");
  const four = regulationChoicesForDay({ CourseHours: 4 }, "ftuesday");
  check(four.length >= 3 && four.some(choice => join(choice.days) === "fsunday+ftuesday") && four.some(choice => join(choice.days) === "ftuesday+fthursday"), "B1: أكثر من نمط يضم اليوم → شرائح متعددة");
  check(regulationChoicesForDay({}, "fsunday").length === 0 && pickDay({}, [], "fsunday", true).days.length === 1, "B1: مقرر بلا ساعات — لا اختراع لنمط");
  /* B3: لا جدول أنماط ثانٍ — كل شريحة نمطٌ من patternsForHours نفسها. */
  const library = new Set(patternsForHours(3).map(pattern => pattern.minutesPerDay[0]));
  check(regulationChoicesForDay(theory3, "fwednesday").every(choice => library.has(choice.minutes)), "B3: الشرائح من patternsForHours وحدها");
  check(regulationChoiceFor(theory3, ["fsunday", "ftuesday", "fthursday"])?.minutes === 50, "B3: النمط المطابق يُقرأ من المصدر نفسه");
}

/* ── A5/A6: حكمٌ واحد لا يفحص حقلاً لم يُختر ───────────────────────────────── */
{
  const teacherClash = { type: "instructor", severity: "high", message: "الأستاذ د. شيماء لديه محاضرة متداخلة", rowId: 7 };
  const scope = { type: "roomScope", severity: "warning", message: "تنبيه نطاق القاعة" };
  const blank = { AdCourseId: 5, fsunday: true, fstarttime: "08:00", fendtime: "08:50" };
  check(relevantConflicts([teacherClash, scope], blank).length === 0, "A5: لا «تعارض أستاذ» ولا «نطاق قاعة» قبل اختيار الأستاذ والقاعة");
  const noDays = appointmentVerdict({ form: {}, validationIssues: ["يجب اختيار يوم واحد على الأقل للمحاضرة"], conflicts: [] });
  check(noDays.blockers.length === 0 && noDays.state === "empty", "A5: النموذج الجديد لا يفتح موبّخاً (اليوم حقل فارغ لا مانع)");
  const companionIssue = "المقرر يتطلب مرفقًا مرافقًا من نوع «استوديو التصوير» طوال الموعد.";
  const noBuilding = appointmentVerdict({ form: blank, validationIssues: [companionIssue], conflicts: [], companionRequired: true });
  check(noBuilding.blockers.length === 0, "A3: مانع المرفق لا يُقال قبل اختيار المبنى");
  const withBuilding = appointmentVerdict({ form: { ...blank, buildingId: "b1", roomId: "r1" }, validationIssues: [companionIssue], conflicts: [], companionRequired: true });
  check(withBuilding.blockers.length === 1 && withBuilding.checks.find(c => c.kind === "facility")?.state === "block", "A3: وبعد المبنى بلا مرفق متاح يظهر في بطاقة 🖥️ المرفق");
  const facilityChosen = appointmentVerdict({ form: { ...blank, buildingId: "b1", roomId: "r1", companionRoomId: "s1" }, validationIssues: [], conflicts: [], companionRequired: true });
  check(facilityChosen.blockers.length === 0 && facilityChosen.checks.find(c => c.kind === "facility")?.state === "ok", "A3: المرفق مختار ومتاح → لا «صحّح قبل الحفظ»");
  const full = { ...blank, AdInstructorId: 9, buildingId: "b1", roomId: "r1" };
  const verdict = appointmentVerdict({ form: full, validationIssues: [], conflicts: [teacherClash, { type: "doorway", soft: true, severity: "low", message: "الفاصل قصير" }] });
  const panelBlocks = verdict.checks.flatMap(c => c.details.filter(d => d.blocks).map(d => d.text));
  check(verdict.blockers.map(b => b.text).join("|") === panelBlocks.join("|") && verdict.state === "blocked", "A6: الشريط واللوحة يقرآن قائمة الموانع نفسها");
  check(verdict.checks.find(c => c.kind === "teacher")?.state === "block" && verdict.checks.find(c => c.kind === "room")?.state === "warn", "G2: 👤 تعارض و🏫 تنبيه بحالات منفصلة");
  check(!appointmentVerdict({ form: full, validationIssues: [], conflicts: [], checking: true }).canSave, "A6: لا حفظ والخادم لم يُجب عن القيم الحالية");
  const ready = appointmentVerdict({ form: full, validationIssues: [], conflicts: [] });
  check(ready.state === "ready" && ready.canSave && ready.okCount >= 4, "G2: موعد سليم → جاهز ✅");
}

/* ── A8: المحرّك الواحد، والسبب حين لا خيار ──────────────────────────────── */
{
  const halls: SuggestionHall[] = Array.from({ length: 20 }, (_, i) => ({ room: "B1", hall: String(100 + i), buildingId: "b", roomId: `r${i}` }));
  const busy = (roomId: string) => [{ fsunday: true, fstarttime: "08:00", fendtime: "08:50", roomId }];
  const base = { dayKeys: ["fsunday" as const], duration: 50, instructorRows: [], sectionRows: [], travelMinutes: () => 0 };
  const allBusy = rankSuggestionCandidates({ ...base, starts: [480], halls, hallRows: hall => busy(hall.roomId) as any });
  check(allBusy.candidates.length === 0 && emptySuggestionReason(allBusy.stats) === "rooms", "A8: كل القاعات محجوزة → السبب 🏫 لا صمت");
  const teacher = rankSuggestionCandidates({ ...base, starts: [480], halls, hallRows: () => [], instructorRows: [{ fsunday: true, fstarttime: "08:00", fendtime: "09:00" }] as any });
  check(teacher.candidates.length === 0 && emptySuggestionReason(teacher.stats) === "teacher", "A8: الأستاذ مشغول → السبب 👤");
  const noStudio = rankSuggestionCandidates({ ...base, starts: [480], halls, hallRows: () => [], companion: () => null });
  check(emptySuggestionReason(noStudio.stats) === "facility", "A8/A3: لا مرفق مرافق متاح → السبب 🖥️");
  const studio = rankSuggestionCandidates({ ...base, starts: [480], halls: halls.slice(0, 1), hallRows: () => [], companion: () => ({ id: "s1", label: "B9 / ST1" }) });
  check(studio.candidates[0]?.companionRoomId === "s1", "A3: الاقتراح يحمل المرفق المتاح فيملأ النموذج بالاثنين");
  const starts = Array.from({ length: 24 }, (_, i) => 480 + i * 30);
  const many = rankSuggestionCandidates({ ...base, starts, halls, hallRows: () => [] });
  check(orderSuggestionCandidates(many.candidates, true).length === many.candidates.length && many.candidates.length > 18, "A8: الترتيب لا يقصّ القائمة عند 18 — البوابة تمشي حتى تجد الصالح");
  check(new Set(orderSuggestionCandidates(many.candidates, false).map(slot => slot.start)).size === orderSuggestionCandidates(many.candidates, false).length, "A8: «وقت وقاعة» خانةٌ واحدة لكل وقت");
}

/* ── حجز طلب أستاذ (A2) يُسأل عنه ولا يُعدّ مانعاً في الحكم ── */
{
  const form = { AdCourseId: 5, AdInstructorId: 9, buildingId: "b", roomId: "r", fsunday: true, fstarttime: "08:00", fendtime: "08:50" };
  const held = appointmentVerdict({ form, validationIssues: [], conflicts: [{ type: "room", severity: "high", message: "القاعة مشغولة", holdRequestId: "req-1" }] });
  check(held.blockers.length === 0 && held.notes.length === 1 && held.canSave, "A2: حجز طلبٍ ينتظر القسم تنبيهٌ يُسأل عنه عند الحفظ لا مانع");
}

/* ── G5: إملاءان لمقرر واحد ───────────────────────────────────────────────── */
{
  const names = ["اداره مراكز مصادر التعلم", "إدارة مراكز مصادر التعلم", "تكنولوجيا التعليم", "تكنولوجيا التعلم"];
  check(spellingTwinGroups(names).length === 1 && spellingTwinsOf("إدارة مراكز مصادر التعلم", names)[0] === "اداره مراكز مصادر التعلم", "G5: «اداره/إدارة مراكز مصادر التعلم» إملاءٌ واحد");
  check(spellingTwinsOf("تكنولوجيا التعليم", names).length === 0, "G5: «التعلم» ليست «التعليم» — لا اقتراح دمج خاطئ");
}

/* ── مشهد A3 في الديمو: مقررٌ يتطلب استوديو، واستوديو مرافق، وشعبةٌ مربوطة به ── */
{
  const demo = createDemoSandboxState();
  const course = demo.courses.find(item => item.CourseCompanionRoomType === DEMO_COMPANION_TYPE);
  const studio = demo.locationRooms.find(room => room.id === DEMO_STUDIO_ROOM_ID);
  check(course && studio?.bookingPolicy === "companion_only" && studio.roomType === DEMO_COMPANION_TYPE, "A3 (ديمو): مقررٌ يتطلب «استوديو التصوير» واستوديو مرافق لا يُحجز وحده");
  check(demo.schedules.some(row => row.companionRoomId === DEMO_STUDIO_ROOM_ID && Number(row.AdCourseId) === Number(course?.AdCourseId)), "A3 (ديمو): شعبته القائمة مربوطة بالاستوديو");
}

/* ── الربط في الواجهة والخادم ─────────────────────────────────────────────── */
const editor = read("src/components/Schedules.tsx");
const quick = read("src/components/QuickCreatePopover.tsx");
const server = read("server.ts");
const picker = read("src/components/InstructorPicker.tsx");
const cards = read("src/components/RoomSuggestionCards.tsx");
const select = read("src/components/SearchableSelect.tsx");
const css = read("src/styles/36-appointment-forms.css");
const companionPicker = read("src/components/CompanionFacilityPicker.tsx");
const transfer = read("src/components/ScheduleTransfer.tsx");

const openCreate = editor.slice(editor.indexOf("const openCreate = (seed?: CreateSeed)"), editor.indexOf("openEdit = (row: FSchedule)"));
check(!/Object\.assign\(next, last\)/.test(openCreate) && /clearEditorTransients\(\)/.test(openCreate), "A5: «جديد» لا يرث آخر موعد ويمسح الفحص والاقتراحات");
check(/openEdit = \(row: FSchedule\) => \{[\s\S]{0,200}clearEditorTransients\(\)/.test(editor), "A5: «تعديل» يحمّل هذا الموعد وحده");
check(/back = \(\) => \{[\s\S]{0,300}clearEditorTransients\(\);[\s\S]{0,120}pendingHandoff\.current = null/.test(editor), "A5: الإغلاق يمسح كل شيء ومنه طلب الأستاذ المعلّق");
check(/instructorId: 0,\s*room: String\(seed\.roomCode \?\? ""\)/.test(editor), "A5: «موعد جديد» السريع لا يرث أستاذ/قاعة آخر حفظ");
check(/companionRoomId: form\.companionRoomId \|\| ""/.test(editor) && /buildingId: form\.buildingId, roomId: form\.roomId, locationStatus: form\.locationStatus, companionRoomId/.test(editor), "A3: مفتاح الفحص الحيّ يشمل المرفق والمبنى والقاعة الرسمية");
check(/buildingChanged\?\{companionRoomId:"",companionRoomLabel:""\}:\{\}/.test(editor), "A3: المرفق لا يُمحى بتطبيع الموقع، بل بتغيّر المبنى فقط");
check(!/form\.companionRoomId\]\);/.test(companionPicker) && /chosenRef\.current/.test(companionPicker), "A7: منتقي المرفق لا يعيد الجلب عند كل ربط");
check(/editorVerdict\.blockers\.length\?<div className="editor-validation-strip"/.test(editor) && /<AppointmentChecksPanel\s+verdict=\{editorVerdict\}/.test(editor) && /submitDisabled=\{Boolean\(!selectedFormDays\.length\|\|!editorVerdict\.canSave\)\}/.test(editor), "A6: الشريط واللوحة وزرّ الحفظ من editorVerdict وحده");
check(/checkCache\.current\.get\(checkPayloadKey\)/.test(editor) && /formChanged \? 160 : 600/.test(editor), "A7: ذاكرة فحص لكل قيم + إعادة فحص صامتة عند تحديث الجدول");
const checkRoute = server.slice(server.indexOf('app.post("/api/schedules/check-conflicts"'), server.indexOf('app.post("/api/schedules/check-conflicts"') + 2200);
check(/await Promise\.all\(\[/.test(checkRoute) && /scheduleConflicts\(req,row/.test(checkRoute), "A7: خطوات الفحص على الخادم متوازية");
check(/RHYTHM_STALE_MS/.test(server) && /rhythmRefreshing/.test(server), "A7: قراءة عادة القسم (عشر سنوات) لا تُعاد كاملة بعد كل حفظ");
const route = server.slice(server.indexOf('app.post("/api/schedules/suggest-slots"'), server.indexOf("/* ── استثناءات الأسبوع"));
check(/GATE_LIMIT/.test(route) && !/\.slice\(0, 18\)/.test(route), "A8: البوابة تمشي القائمة المرتّبة لا أول 18");
check(/emptySuggestionReason\(/.test(route) && /reason, note: SUGGESTION_EMPTY_WORD\[reason\]/.test(route), "A8: الردّ الفارغ يحمل سببه");
check(/companion: companionFor/.test(route), "A8/A3: المحرّك يحسب المرفق المرافق");
check(/fetchAlternatives\(/.test(editor) && !/\/api\/intelligence\/conflict-solutions", \{\s*method: "POST",\s*headers: \{ "Content-Type": "application\/json" \},\s*body: JSON\.stringify\(\{ \.\.\.form, id: editId \|\| -1 \}\)/.test(editor), "A8: «اقترح بديلاً آمناً» يسأل المحرّك نفسه");
check(/fetchSuggestions\(suggestionBody\(payload/.test(quick) && /fetchSuggestions\(suggestionBody\(\{ \.\.\.form/.test(editor), "A8: البطاقة السريعة والمحرر يسألان الباب نفسه");
check(/suggestionDuration\(\)/.test(editor) && /regulationChoiceFor\(courseById\.get/.test(editor), "A8: مدة «وقت وقاعة» من نمط اللائحة لا 60 دقيقة ثابتة");
check(/chooseFormDay\(d\.key as RegDayKey, e\.target\.checked\)/.test(editor) && /endForStart\(p, start\)/.test(editor) && /<RegulationPatternChips/.test(editor), "B1: المحرر الكامل — اليوم يكمل النمط والبداية تحسب النهاية + شرائح");
check(/pickDay\(course, \[\], seed\.day, true\)/.test(quick) && /<RegulationPatternChips compact/.test(quick) && /regulationEnd\(course, result\.days, current\.start\)/.test(quick), "B1: «موعد جديد» السريع — المقرر يكمل النمط والنهاية");
check(/\(draft\.days\?\.length \? draft\.days : \[quick\.day\]\)\.forEach/.test(editor) && /companionRoomId: draft\.companionRoomId \|\| ""/.test(editor), "B1/A3: الحفظ السريع يحفظ كل أيام النمط والمرفق المرافق");
check(/appointmentVerdict\(\{/.test(quick) && /qc-checks/.test(quick), "A6: البطاقة السريعة تقرأ الحكم الواحد");
check(/room-suggest-best/.test(cards) && /الأنسب/.test(cards) && /room-suggest-code/.test(cards) && /room-suggestion-time/.test(cards), "G1: رمز القاعة كبير + شريحة وقت + «الأنسب»");
check(/\.quick-create \.room-suggest-list\{grid-template-columns:minmax\(0,1fr\)\}/.test(css), "G1: عمودٌ واحد داخل البطاقة الضيقة فلا يتداخل النص");
check(/export function SuggestionEmpty/.test(cards) && /teacher: \{ icon: UserRound, word: "الأستاذ مشغول" \}/.test(cards), "A8: لا خيار → أيقونة وكلمة");
check(/room-replaceable/.test(cards) && /placeholderIds\.has\(Number\(row\.AdInstructorId\)\)/.test(route), "G3: 🔄 قابلة للاستبدال في نتائج البحث عن قاعة");
{
  const phRoute = server.slice(server.indexOf('app.post("/api/schedules/placeholder-action"'), server.indexOf("/* ── استثناءات الأسبوع"));
  check(/runScheduleHandler\(updateScheduleHandler[\s\S]*?dryRun: true/.test(phRoute) && /runScheduleHandler\(createScheduleHandler[\s\S]*?dryRun: true/.test(phRoute), "G3: كل خطوة تمرّ بمساري الحفظ والتعديل (فحص جافّ على الأسبوع النهائي)");
  check(/Repository\.commitScheduleChangeSet\(/.test(phRoute) && /scheduleLockRefusal\(/.test(phRoute) && /placeholderRev/.test(phRoute), "G3: تنفيذ ذرّي واحد بقفل الجدول ومراجعة النسخة");
  check(/const undo:/.test(phRoute) && /res\.locals\.auditChanges/.test(phRoute), "G3: تراجع وسجلّ تدقيق");
  check(/\/api\/schedules\/placeholder-action/.test(editor) && /offerUndo\([\s\S]{0,200}result\.undo/.test(editor), "G3: الواجهة طلبٌ واحد وتراجع من الخادم");
  check(/item\.radar \?/.test(cards) && /run && !run\.stale/.test(route), "G3: عدد الطلبة من رادار التسجيل الحالي فقط");
}
check(/بدون أستاذ بعد/.test(picker) && /instructor-group-label/.test(picker) && /members: people\.filter\(person => !visitingSet\.has/.test(picker), "G4: «بدون أستاذ بعد» مستقل، الأعضاء ثم المنتدبون بشارة");
check(/<InstructorPicker/.test(quick) && /visitingRosterIds=\{visitingRosterIds\}/.test(quick), "G4: المنتقي الموحّد في «موعد جديد» السريع");
check(/<span className="ss-option-line"><b>\{option\.label\}<\/b>\{option\.badge \? <PlanBadge text=\{option\.badge\} \/>/.test(select) && /\.plan-badge,\.course-service-badge\{flex:none;justify-self:start;align-self:center;width:max-content/.test(css), "G6/H1: الشارة الموحّدة بحجمها في القائمة المنسدلة");
check(/badge: courseOptionBadge\(\[Number\(c\.AdCourseId\)\], planBadges\)/.test(quick) && /\{selected\?\.badge \? <PlanBadge text=\{selected\.badge\} \/>/.test(select), "H1: شارة المقرر الموحّدة في البطاقة السريعة (القائمة والمختار)");
check(/course-twin-hint/.test(editor) && /spellingTwinsOf\(courseName, courseNames\)/.test(editor), "G5: اقتراح دمج لإملاءٍ آخر (بلا حذف)");
check(/importFullPage/.test(transfer) && /is-full-page/.test(css), "M1: استيراد PDF بكامل الصفحة");

{
  const ph = server.slice(server.indexOf('app.post("/api/schedules/placeholder-action"'), server.indexOf("/* ── استثناءات الأسبوع"));
  check(/applyRequestHoldOverride\(req\)/.test(ph) && /overrideRequestHolds \? \{ overrideRequestHolds \}/.test(ph) && /\}, owners\);/.test(ph) && /RequestHoldConflict/.test(ph) && /noteRequestHoldOverride\(/.test(ph), "A2/G3: الإجراء الذرّي يحترم حجوز الطلبات ويتجاوزها بتأكيد القسم كالحفظ والحذف");
  check(/withRequestHoldPrompt\(overrideRequestHolds => fetchJson\("\/api\/schedules\/placeholder-action"/.test(editor) && /withRequestHoldPrompt\(overrideRequestHolds => fetchJson\("\/api\/schedules",/.test(editor), "A2: الإجراء الذرّي والموعد السريع يسألان عن الحجز بالسؤال نفسه");
}
console.log(`\nappointment-forms audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
