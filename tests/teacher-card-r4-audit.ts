/**
 * ── كرت الأستاذ: الجولة الرابعة (ملاحظات المالك r4) ──────────────────────────
 *
 *   R1  «لاصق بمحاضرتي» بلا «🏫 نفس القاعة» ولا «🏢 نفس المبنى»: الردُّ لا يحملهما، والكرتُ لا يرسمهما.
 *   R2  صفحةُ المقترح الدراسي للأستاذ بلا قاعةٍ ولا مبنى ولا «المكان» — في الصفحة وفي ردّ الخادم.
 *   R3  «أكمل أيام المقرر»: حبوبُ أنماطٍ تلتفّ ولا تتراكب، وسطرُ «ينتهي» مجموعٌ بالساعة.
 *   R4  منتقي الأستاذ في الوارد: الشخصُ مرّةً واحدة، والاسمُ المتكرّر بتمييزٍ صغير.
 *   R5  نصوصُ الكرت بالفصحى: «لديك» لا «عندك».
 */
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { bestPerSide, stickForTeacher, topSticks, type StickJudged } from "../src/utils/lectureStick";
import { withoutProposalPlaces } from "../src/utils/proposalTeacherView";
import { instructorPickerLabels, proposalLauncherChoices } from "../src/utils/instructorPickerChoices";
import { TEACHER_CARD_EXTRAS_JS } from "../src/server/teacherCardExtras";
import { REQUEST_VISUAL_CSS, REQUEST_VISUAL_JS } from "../src/server/requestVisual";
import { REQUEST_V3_CSS, REQUEST_V4_CSS } from "../src/server/requestPageStyles";
import { instructorRequestPage } from "../src/server/pages/instructorRequestPage";
import { studyProposalPage } from "../src/server/studyProposalPage";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const server = readServerSource();
const read = (file: string) => readFileSync(file, "utf8");

/* ── السكربتُ نفسه يُترجَم: خطأُ اقتباسٍ واحد في قالبٍ نصّي يُبقي الكرتَ على «يفتح…» ─ */
for (const [name, html] of [["كرت الأستاذ", instructorRequestPage("tok", "nonce")], ["صفحة المقترح", studyProposalPage("tok", "pid", "nonce")]] as const) {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(code => code.trim());
  const errors: string[] = [];
  for (const code of scripts) { try { new vm.Script(code); } catch (error: any) { errors.push(String(error?.message || error)); } }
  check(scripts.length > 0 && !errors.length, `سكربتُ ${name} يُترجَم بلا خطأ`, errors);
}

/* ── R1 ─────────────────────────────────────────────────────────────── */
const judged: StickJudged[] = [
  { anchorRowId: 1, side: "after", days: ["fsunday"] as any, start: "10:00", end: "11:15", shift: 0, tone: "ok", sameRoom: true, sameBuilding: true },
  { anchorRowId: 1, side: "before", days: ["fsunday"] as any, start: "06:30", end: "07:45", shift: 0, tone: "ok", sameRoom: false, sameBuilding: true },
];
const sent = JSON.stringify({ best: bestPerSide(judged).map(stickForTeacher), top: topSticks(judged).map(stickForTeacher) });
check(!/sameRoom|sameBuilding/.test(sent) && topSticks(judged)[0].sameRoom, "R1 الترتيبُ بالقاعة في الخادم، وما يصل الأستاذ بلا sameRoom/sameBuilding", sent);
check(server.includes("best: bestPerSide(judged).map(stickForTeacher), top: topSticks(judged).map(stickForTeacher)"), "R1 مسارُ «لاصق بمحاضرتي» يمرّ بـ stickForTeacher");
check(!/sameRoom|sameBuilding|نفس القاعة|نفس المبنى|🏢/.test(TEACHER_CARD_EXTRAS_JS), "R1 زرُّ قبلها/بعدها: الوقتُ وإزاحتُه فقط، بلا «نفس القاعة/المبنى»");
check(TEACHER_CARD_EXTRAS_JS.includes("tcShift(c)") && TEACHER_CARD_EXTRAS_JS.includes('"⬅️ قبلها"') && TEACHER_CARD_EXTRAS_JS.includes('"➡️ بعدها"'),
  "R1 ومنطقُ قبلها/بعدها والإزاحة باقٍ كما هو");
check(!/tone:"room"/.test(read("src/server/core/staffCard.ts").replace(/if \(withRooms && movementRoom[\s\S]*?\n/, "")) || read("src/server/core/staffCard.ts").includes("if (withRooms && movementRoom(was)!==movementRoom(now))"),
  "R1 حركةُ جدول الأستاذ في صفحة الطلب لا تقول «تغيّر مكانُ محاضرتها»");

/* ── R2 ─────────────────────────────────────────────────────────────── */
const view = withoutProposalPlaces({
  id: "p", ops: [{ target: { courseName: "م", days: ["fsunday"], start: "08:00", end: "09:15", place: "901A01 · 101", placeKnown: true, collegeName: "ك" }, before: { days: [], start: "", end: "", place: "B · 7" } }],
  schedule: { before: { items: [{ key: "row:1", place: "901A01 · 101", placeKnown: true, src: { roomCode: "901A01", roomHall: "101", buildingId: "b", roomId: "r" } }] }, after: { items: [], ghosts: [{ key: "old:1", place: "x" }] } },
  history: [{ version: 1, sentAt: "2026-10-29T08:00:00.000Z", message: "رسالة" }],
});
const viewText = JSON.stringify(view);
check(!/place|placeKnown|roomCode|roomHall|roomId|buildingId|901A01|"src"/.test(viewText) && viewText.includes("رسالة") && viewText.includes("collegeName"),
  "R2 نسخةُ الأستاذ من المقترح بلا place/placeKnown/src في أي عمق، وما سواها كما هو", viewText);
check(read("src/server/studyProposalRoutes.ts").includes("return withoutProposalPlaces(await publicViewWithPlaces(proposal, world, full));"), "R2 كلُّ مخرجٍ للأستاذ (القائمة، المقترح، الرد) يمرّ بالنزع");
check(!/AdRoomHall \|\| ""\) !== \(op\.target\.AdRoomHall/.test(read("src/server/studyProposalRoutes.ts")), "R2 «عُدّل ليلائم جدولك» لا يُحسب بتغيّر القاعة");
{
  const page = studyProposalPage("tok", "pid", "nonce").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"room":\{[^}]*\}/g, "").replace(/"building":\{[^}]*\}/g, "");
  const leaks = [...page.matchAll(/.{0,20}(قاعة|القاعة|المبنى|مبنى|المكان|مكانها|مكانه|🏢|🏫).{0,20}/g)].map(m => m[0]);
  check(!leaks.length, "R2 صفحةُ المقترح كما تصل المتصفّح بلا «القاعة» ولا «المكان» ولا «المبنى»", leaks.slice(0, 4));
}

/* ── R3 ─────────────────────────────────────────────────────────────── */
check((REQUEST_V3_CSS + REQUEST_V4_CSS).includes(".heat-key span[data-heat]{") && !/\.heat-key span\{/.test(REQUEST_V3_CSS + REQUEST_V4_CSS),
  "R3 شرطةُ لون المفتاح على span[data-heat] وحدها — كانت «span» عامّةً تضغط الجملة والحبوب إلى 16×4 فتتراكب");
check(/\.heat-key\.heat-shape\[role=status\]\{display:grid;grid-template-columns:auto minmax\(0,1fr\)/.test(REQUEST_VISUAL_CSS) && REQUEST_VISUAL_CSS.includes(".heat-key.heat-shape>.alts.shapes{grid-column:1/-1"),
  "R3 «أكمل أيام المقرر» رأسٌ ثم صفُّ الحبوب بعرض البطاقة");
check(/\.alts\.shapes\{display:flex;flex-wrap:wrap;gap:8px\}/.test(REQUEST_VISUAL_CSS) && /\.alts\.shapes button\{[^}]*white-space:nowrap[^}]*\}/.test(REQUEST_VISUAL_CSS) && /\.alts\.shapes button\{[^}]*border-radius:999px/.test(REQUEST_VISUAL_CSS),
  "R3 الحبوبُ تلتفّ أسطراً، وكلُّ حبّةٍ لا تنكسر داخلها");
check(!/\.sp\{|\.sp b\{|\.sp u\{/.test(REQUEST_VISUAL_CSS), "R3 قواعدُ «.sp» القديمة المتضاربة (عمودٌ ثم صفٌّ ثم خطُّ آلةٍ كاتبة) أُزيلت");
{
  const noop = () => undefined;
  const sandbox: any = { document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] }, window: { addEventListener: noop }, setTimeout: noop };
  vm.createContext(sandbox);
  /* دوالُّ السكربت تُرفع قبل تنفيذه، فما يلمس الصفحةَ بعدها (host, document) لا يمنع قراءتها هنا. */
  try { vm.runInContext(`function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
    function gi(n){return '<svg data-i="'+n+'"></svg>'}
    var DN={fsunday:"الأحد",fmonday:"الاثنين",ftuesday:"الثلاثاء",fwednesday:"الأربعاء",fthursday:"الخميس"};
    function fmtDays(ds){return ds.map(function(d){return DN[d]}).join(" · ")}
    function courseOf(){return ""} function verdictText(){return ""} function countOf(){return ""} var AR={};
    ${REQUEST_VISUAL_JS};`, sandbox); } catch { /* ما بعد التعريفات يحتاج صفحة */ }
  const two = sandbox.skShape("الاثنين 80د · الأربعاء 80د");
  check(/<span class="shp-days"><u>ن<\/u><u>ر<\/u><\/span><span class="shp-min"><b>80<\/b>د<\/span>/.test(two), "R3 نمطٌ بدقائق واحدة: دائرتا اليومين ثم «80 د» مرّةً واحدة", two);
  const mixed = sandbox.skShape("الاثنين 170د · الأربعاء 110د");
  check((mixed.match(/class="shp-seg"/g) || []).length === 2 && mixed.includes("<small>170</small>") && mixed.includes("<small>110</small>"), "R3 دقائقُ مختلفة: كلُّ يومٍ بدقائقه", mixed);
  const usual = sandbox.skShape("المعتاد تاريخياً: الأحد 75د · الثلاثاء 75د");
  check(usual.includes('class="shp-usual"') && !usual.includes("المعتاد تاريخياً:") && usual.includes("<u>ح</u><u>ث</u>"), "R3 «المعتاد تاريخياً» أيقونةٌ صغيرة لا جملةٌ داخل الحبّة", usual);
  const ends = sandbox.skEnds([{ day: "fmonday", end: "10:45" }, { day: "fwednesday", end: "10:45" }, { day: "fsunday", end: "10:45" }, { day: "fthursday", end: "10:20" }], [], "");
  check((ends.match(/class="ends-g"/g) || []).length === 2 && ends.indexOf("<u>ح</u><u>ن</u><u>ر</u>") >= 0 && ends.includes(">10:20<"),
    "R3 «ينتهي»: الأيامُ ذاتُ النهاية الواحدة حبّةٌ واحدة بترتيب الأسبوع، والنهايةُ الأخرى حبّةٌ ثانية", ends);
}
check(read("src/server/pages/instructorRequestPage.ts").includes("+skEnds(it.computedSlots,it.days,endOf(it.days,it.start,it.blk))+"), "R3 سطرُ «ينتهي» في الكرت يُرسم بـ skEnds");

/* ── R4 ─────────────────────────────────────────────────────────────── */
{
  const rows = [
    { id: "r1", AdInstructorId: 11, instructorName: "د. أحمد الفيلكاوي", AdCollegeId: 1, AdSectionId: 1, sectionName: "تكنولوجيا التعليم", changedCount: 0 },
    { id: "r2", AdInstructorId: 12, instructorName: "د. أحمد الفيلكاوي", AdCollegeId: 1, AdSectionId: 1, sectionName: "تكنولوجيا التعليم", changedCount: 2 },
    { id: "r3", AdInstructorId: 13, instructorName: "د. آلاء جابر ذياب", AdCollegeId: 1, AdSectionId: 1, sectionName: "تكنولوجيا التعليم" },
    { id: "r4", AdInstructorId: 900, instructorName: "هيئة تدريسية", AdCollegeId: 1, AdSectionId: 1 },
    { id: "r5", AdInstructorId: 901, instructorName: "هيئة تدريسية 2", AdCollegeId: 1, AdSectionId: 1 },
  ];
  const choices = proposalLauncherChoices(rows);
  const names = choices.map(c => c.name);
  check(names.filter(n => n === "د. أحمد الفيلكاوي").length === 1, "R4 سجلّان لـ«د. أحمد الفيلكاوي» في القسم نفسه سطرٌ واحد", choices);
  check(choices.find(c => c.name === "د. أحمد الفيلكاوي")?.value === "r2", "R4 والسطرُ يفتح الطلبَ الذي فيه تعديل");
  check(!names.some(n => n.startsWith("هيئة")), "R4 ولا «هيئة تدريسية» في المنتقي");
  const numbered = proposalLauncherChoices([5, 6, 7].map(n => ({ id: `t${n}`, AdInstructorId: n, instructorName: `عضو هيئة تدريس تجريبي ${n}`, AdCollegeId: 1, AdSectionId: 1 })));
  check(numbered.length === 3, "R4 اسمان يختلفان برقمٍ فقط شخصان لا شخصٌ واحد", numbered);
  const visiting = proposalLauncherChoices([{ id: "v", AdInstructorId: 40, instructorName: "د. منتدب زائر", AdCollegeId: 1, AdSectionId: 1, visiting: true }]);
  check(visiting[0]?.visiting === true, "R4 وشارةُ المنتدب تبقى على خياره");
  const twoScopes = proposalLauncherChoices([
    { id: "a", AdInstructorId: 11, instructorName: "د. أحمد الفيلكاوي", AdCollegeId: 1, AdSectionId: 1, sectionName: "تكنولوجيا التعليم" },
    { id: "b", AdInstructorId: 11, instructorName: "د. أحمد  الفيلكاوى", AdCollegeId: 1, AdSectionId: 2, sectionName: "المكتبات" },
  ]);
  check(twoScopes.length === 2 && twoScopes.every(c => c.hint) && new Set(twoScopes.map(c => c.hint)).size === 2,
    "R4 الشخصُ نفسُه في قسمين: سطران، ولكلٍّ اسمُ قسمه تمييزاً لا تكراراً", twoScopes);
  const labels = instructorPickerLabels([
    { AdInstructorId: 11, AdInstructorName: "د. أحمد الفيلكاوي", AdInstructorMobile: "99001234" },
    { AdInstructorId: 12, AdInstructorName: "د. أحمد الفيلكاوي", AdInstructorMobile: "66005678" },
    { AdInstructorId: 13, AdInstructorName: "د. آلاء جابر ذياب" },
  ]);
  check(labels.get(11) === "د. أحمد الفيلكاوي · جوال …1234" && labels.get(12) === "د. أحمد الفيلكاوي · جوال …5678" && labels.get(13) === "د. آلاء جابر ذياب",
    "R4 منتقي «إعادة فتح لأستاذ»: الاسمُ المتكرّر يُميَّز بآخر أرقام الجوال، والفريدُ كما هو", [...labels]);
  const noMobile = instructorPickerLabels([{ AdInstructorId: 11, AdInstructorName: "د. سالم العلي" }, { AdInstructorId: 12, AdInstructorName: "د. سالم العلي" }]);
  check(noMobile.get(11) === "د. سالم العلي · سجل رقم 11" && noMobile.get(12) === "د. سالم العلي · سجل رقم 12", "R4 وبلا جوال: رقمُ السجل");
  const parts = read("src/components/proposal/ProposalInboxParts.tsx"), publish = read("src/components/SchedulePublish.tsx"), inbox = read("src/components/InstructorInbox.tsx");
  check(parts.includes("proposalLauncherChoices(rows)") && parts.includes("choices.map(choice =>") && !parts.includes("rows.map(row => <option"), "R4 منتقي «مقترح دراسي» يبني من proposalLauncherChoices");
  check(inbox.includes("AdInstructorId: row.AdInstructorId, instructorName: row.instructorName, AdCollegeId: row.AdCollegeId, AdSectionId: row.AdSectionId"), "R4 والوارد يمرّر ما يُعرف به الشخص ونطاقُه");
  check(publish.includes("instructorPickerLabels(manageFaculty)") && publish.includes("manageLabels.get(Number(person.AdInstructorId))"), "R4 ومنتقي «إعادة فتح لأستاذ» في شاشة النشر كذلك");
  check(inbox.includes("inboxInstructorChoices(rows || [])"), "R4 ومنتقي التصفية في الوارد باقٍ على الهوية (N1)");
}

/* ── R5 ─────────────────────────────────────────────────────────────── */
{
  const card = instructorRequestPage("tok", "nonce").replace(/\/\*[\s\S]*?\*\//g, "");
  const dialect = /(^|[^ء-ي])(عندك|عندي|عشان|علشان|شلون|ليش|وايد|اللحين|الحين|شنو|هذي|جذي|ماكو|يبي|تبي|ابي|أبي)(?=[^ء-ي]|$)/;
  check(!dialect.test(card), "R5 الكرتُ (وكرتُ المدرّب) بلا ألفاظٍ عامّية: «لديك» لا «عندك»", (dialect.exec(card) || [])[0]);
  check(card.includes('"لديك محاضرة"') && card.includes("يوم فارغ لديك") && card.includes("لديك تعديل لم يُرسل"), "R5 البدائلُ الفصيحة في مواضعها");
  check(read("src/components/InstructorInbox.tsx").includes("أُرسل قبل أن يصبح الإرسال توقيعاً"), "R5 والوارد: «يصبح» لا «يصير»");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
