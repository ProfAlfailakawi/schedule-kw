/**
 * ── «منتدب» في المخرجات التي يصنعها الخادم ───────────────────────────────────
 *
 * قاعدة المالك: الشارة بجانب كل اسم أستاذٍ يظهر لموعد، «في كل مكان» — الصفحاتُ العامة والتصدير
 * منها. هذا الفحص يتحقق: حمولةُ المشاركة تحمل علمَ visiting بقسم الرابط (ومخفيّةً مع الأسماء)،
 * والصفحتان العامتان ترسمانها بأنماطها هي، وملفُّ التقويم يلحق اللاحقة، والإكسل يقرّر لكل صفٍّ
 * بقسمه، وشاشةُ تنزيل الشعب ترسمها، ومواضعُ النصّ تلحق اللاحقة حيث النطاق معلوم.
 */
import fs from "fs";
import path from "path";
import { buildCalendar } from "../src/utils/icalendar";
import { withVisitingSuffix, VISITING_SUFFIX } from "../src/components/VisitingBadge";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const server = read("server.ts");
const slice = (from: string, length: number) => { const at = server.indexOf(from); return at < 0 ? "" : server.slice(at, at + length); };

/* ── التقويم: سلوكٌ حقيقي ─────────────────────────────────────────────── */
const lecture = (id: number, instructor: string, instructorVisiting?: boolean) => ({
  id, title: "مقرر", code: "101", section: "1", instructor, instructorVisiting, start: "08:00", end: "09:20", days: [0, 2],
});
const ics = buildCalendar({ name: "جدول", weeks: 15, startDate: "2026-09-06", endDate: "2026-12-20", lectures: [lecture(1, "د. سالم", true), lecture(2, "د. ماجد", false), lecture(3, "د. نورة")] } as any).replace(/\r?\n /g, "");
check(ics.includes(`الأستاذ: د. سالم${VISITING_SUFFIX}`), "ملفّ التقويم يلحق «· منتدب» باسم المنتدب");
check(ics.includes("الأستاذ: د. ماجد") && !ics.includes(`د. ماجد${VISITING_SUFFIX}`), "ولا يلحقها بمن ليس منتدباً");
check(ics.includes("الأستاذ: د. نورة") && !ics.includes(`د. نورة${VISITING_SUFFIX}`), "ولا بمن لا علم عنده");
check(withVisitingSuffix("س", true) === `س${VISITING_SUFFIX}`, "اللاحقةُ النصية هي المشتركة");

/* ── حمولة المشاركة ─────────────────────────────────────────────────── */
const payload = slice("async function buildSharePayload(", 2800);
check(/visitingChecker\(termId, \[\{ collegeId: link\.AdCollegeId, sectionId: link\.AdSectionId \}\]\)/.test(payload), "الحمولة تقرأ دفتر المنتدبين بقسم الرابط وفصله مرةً واحدة");
check(/visiting: showNames && isVisiting\(row\.AdInstructorId, link\.AdCollegeId, link\.AdSectionId\)/.test(payload), "ويحمل كل صفٍّ علمَ visiting");
check(/showNames = link\.showInstructors !== false/.test(payload) && /isVisiting = showNames \?/.test(payload), "ولا علم ولا قراءة حين تُخفى الأسماء");
check(/instructorVisiting: row\.visiting/.test(slice('app.get("/api/public/ics/:token"', 2200)), "والتقويم العام يمرّر العلم");

/* ── الصفحتان العامتان ───────────────────────────────────────────────── */
check(/const PUBLIC_VISITING_BADGE_CSS = `\.visiting-badge/.test(server), "للصفحات العامة أنماطها لـ visiting-badge (لا تصلها أنماط التطبيق)");
const constCss = (server.match(/const PUBLIC_VISITING_BADGE_CSS = `(.*?)`;\n/s) || [])[1] || "";
check(server.includes("${PUBLIC_VISITING_BADGE_CSS}") && server.split(constCss).length === 3, "وتُدرج في صفحة الأسبوع /s (بالثابت) وصفحة الطلبة /t (نصٌّ مطابق، لأن تدقيق الصياغة يبنيها معزولة)");
check(/class="visiting-badge compact">منتدب<\/span>` : ""\}<\/i>/.test(server), "صفحة الأسبوع ترسم الشارة في خلية الجدول");
check(/<span>\$\{esc\(row\.instructor\)\}\$\{row\.visiting \?/.test(server), "وفي القائمة اليومية");
check(/function whoPill\(r\)[^\n]*visBadge\(r\)/.test(server) && /function visBadge\(r\) \{ return r\.visiting \?/.test(server), "صفحة الطلبة ترسم الشارة في قرص الأستاذ");
check(/r\.instructor === first\.instructor && !!r\.visiting === !!first\.visiting/.test(server), "وإدماج الأستاذ المشترك لا يخلط منتدباً بغيره باسمٍ واحد");
check(/"الأستاذ: " \+ r\.instructor \+ \(r\.visiting \? " · منتدب" : ""\)/.test(server), "وتلميحُ الشعبة يذكرها");

/* ── الإكسل ──────────────────────────────────────────────────────────── */
const excel = slice('app.get("/api/reports/excel/:type"', 8500);
check(/visitingChecker\(resolvedTermId, schedules\.map\(s => \(\{ collegeId: s\.AdCollegeId, sectionId: s\.AdSectionId \}\)\)\)/.test(excel), "الإكسل يقرأ دفتر كل قسمٍ متميّز مرة");
check(/"أستاذ المقرر": inst\?\.AdInstructorName \? withVisitingSuffix\(inst\.AdInstructorName, isVisitingRow\(s\.AdInstructorId, s\.AdCollegeId, s\.AdSectionId\)\)/.test(excel), "ويقرّر لكل صفٍّ بقسمه هو");
const checker = slice("async function visitingChecker(", 1300);
check(/wanted\.set\(`\$\{collegeId\}:\$\{sectionId\}`/.test(checker) && /byScope\.get\(`\$\{Number\(collegeId\) \|\| 0\}:\$\{Number\(sectionId\) \|\| 0\}`\)\?\.has\(Number\(instructorId\)\)/.test(checker), "والمقرِّر يفصل بين الأقسام: منتدبٌ في قسمٍ وعضوٌ في آخر");

/* ── بطاقة الأستاذ: المغطّي ─────────────────────────────────────────── */
check(/withVisitingSuffix\(entry\.coverInstructorName, coverIsVisiting\(entry\.coverInstructorId, row\?\.AdCollegeId, row\?\.AdSectionId\)\)/.test(server), "«يغطّيها …» يلحق اللاحقة بقسم المحاضرة المغطّاة");

/* ── تنزيل الشعب ─────────────────────────────────────────────────────── */
const build = read("src/components/SectionBuild.tsx");
check(/instructorId: number; visiting\?: boolean/.test(build), "نوع الموضع يحمل visiting");
check((build.match(/<VisitingBadge compact \/>/g) || []).length === 2, "وشاشة تنزيل الشعب ترسم الشارة في الموضعين (المعلّق والمختار)");
check(/placementVisiting\(p\.instructorId, collegeId, sectionId\)/.test(slice('app.post("/api/section-build/preview"', 1500)), "والمعاينة تحسب العلم من دفتر القسم، لا من الاسم");
check(!/visiting/.test(slice('app.post("/api/section-build/apply"', 600)), "ولا يدخل العلم ما يُنزَّل");

/* ── نصوص الخادم ─────────────────────────────────────────────────────── */
check(/withVisitingSuffix\(instructor\?\.AdInstructorName\|\|"",Boolean\(instructor\?\.AdInstructorName\)&&instructorIsVisiting\)\} لديه محاضرة متداخلة/.test(server), "رسالة تعارض الأستاذ تلحقها بقسم الموعد المفحوص");
check(/paletteVisiting\(row\.AdInstructorId, row\.AdCollegeId, row\.AdSectionId\)/.test(server), "عنوان بحث لوحة الأوامر الفرعي يلحقها بقسم الصفّ");
check(/shapeVisiting\(row\.AdInstructorId, row\.AdCollegeId, row\.AdSectionId\)/.test(server) && (server.match(/shapeVisiting = await visitingChecker/g) || []).length === 2, "ونتائج البحث الطبيعي كذلك");
check((server.match(/instructor:withVisitingSuffix\(instructors\.find/g) || []).length === 2, "ومعاينة النقل بالكلام (المسارين) تلحقها");

/* ── ما لا يُوسَم ────────────────────────────────────────────────────── */
check(!/withVisitingSuffix\([^)]*person\.AdInstructorName/.test(server), "اسمُ صاحب البطاقة في عنوان تقويمه لا يُوسَم");
check(!/visiting/.test(read("src/server/signatureVerifyPage.ts")), "ولا صفحة التحقق من التوقيع");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
