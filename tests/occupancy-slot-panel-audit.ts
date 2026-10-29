/**
 * ── لوحة خانة «نسبة الإشغال»: مواقع لا جملة، وأسماء كاملة لا مقصوصة ─────────
 *
 * قال المالك عن اللوحة القديمة «عالج هنا»: عنوانها يسرد كليات العائلة جملةً
 * طويلة، وكل صفٍّ يقصّ المقرر والأستاذ إلى أحرف («أخلاقيا…»، «د. بدو…») ويعيد
 * «كلية التربية الأساسية - بنات» في كل سطر. هذا الاختبار يحرس البديل:
 * رقائق المواقع بأسمائها القصيرة وأعدادها، والصفوف مجموعةً تحت مواقعها، ولا
 * صنفَ قصٍّ على اسم المقرر أو الأستاذ، والرقيقة تُرشِّح.
 */
import fs from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import OccupancySlotPanel, { SLOT_SEARCH_FROM, type SlotPanelRow } from "../src/components/OccupancySlotPanel";
import { campusShortLabels, groupSlotRows, matchesSlotQuery, visibleSlotGroups } from "../src/utils/occupancySlot";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const GIRLS = "كلية التربية الأساسية - بنات";
const BOYS = "كلية التربية الأساسية - بنين";
const JAHRA = "كلية التربية الأساسية - بنات - الجهراء";
const FAHAHEEL = "كلية التربية الأساسية - بنات - الفحيحيل";

/* ── الاسم القصير: ما يميّز الموقع بين أخواته ─────────────────────────────── */
const labels = campusShortLabels([GIRLS, BOYS, JAHRA, FAHAHEEL]);
check(labels.get(GIRLS) === "بنات" && labels.get(BOYS) === "بنين" && labels.get(JAHRA) === "الجهراء" && labels.get(FAHAHEEL) === "الفحيحيل",
  "الكليات الأربع: بنات · بنين · الجهراء · الفحيحيل");
check(campusShortLabels([GIRLS]).get(GIRLS) === "التربية الأساسية - بنات", "موقعٌ واحد يبقى اسمه بلا «كلية» — «بنات» وحدها لا تميّز كلية");
const twins = campusShortLabels(["كلية العلوم - بنات", "كلية التمريض - بنات"]);
check(twins.get("كلية العلوم - بنات") === "العلوم - بنات" && twins.get("كلية التمريض - بنات") === "التمريض - بنات",
  "آخر مقطعٍ متكرّر لا يُكتفى به: يبقى ما يميّز");

/* ── الصفوف تحت مواقعها ──────────────────────────────────────────────────── */
let id = 1;
const row = (campusId: number, campusName: string, course: string, teacher: string, start: string, extra: Partial<SlotPanelRow> = {}): SlotPanelRow => ({
  id: id++, course, teacher, campusId, campusName, code: "0109108", section: "502", room: "012B08/F09",
  start, end: "13:50", visiting: false, ...extra,
});
const LONG_COURSE = "أخلاقيات المهنة والتشريعات التربوية في دولة الكويت";
const LONG_TEACHER = "د. بدور عبدالله محمد الصالح";
const rows: SlotPanelRow[] = [
  row(1, GIRLS, LONG_COURSE, LONG_TEACHER, "11:00"),
  row(2, BOYS, "أسس تكنولوجيا التعليم", "د. غيداء", "11:00", { room: "011B17/G23", section: "501", code: "0109105" }),
  row(1, GIRLS, "الحاسوب في التعليم", "د. شوق", "11:00", { room: "", code: "0109344" }),
  row(3, JAHRA, "تصميم التعليم", "د. علي", "12:00", { visiting: true }),
];
const groups = groupSlotRows(rows, [1, 2, 3]);
check(groups.map(group => group.label).join(" ") === "بنات بنين الجهراء", "المجموعات بترتيب العائلة (الموقع المفتوح أولاً) وبأسمائها القصيرة");
check(groups[0].rows.length === 2 && groups[0].rows[0].course === LONG_COURSE && groups[0].rows[1].course === "الحاسوب في التعليم",
  "وداخل الموقع ترتيب الوقت كما جاء");
check(groupSlotRows(rows, [3]).map(group => group.campusId)[0] === 3, "والترتيب يتبع العائلة لا ترتيب الصفوف");

/* ── الرقيقة تُرشِّح، والبحث يضيّق ───────────────────────────────────────── */
check(visibleSlotGroups(groups, null, "").reduce((sum, group) => sum + group.rows.length, 0) === 4, "«الكل» يعرض كل المحاضرات");
const onlyBoys = visibleSlotGroups(groups, 2, "");
check(onlyBoys.length === 1 && onlyBoys[0].campusId === 2 && onlyBoys[0].rows.length === 1, "رقيقة «بنين» تعرض محاضرات بنين وحدها");
check(visibleSlotGroups(groups, null, "الحاسوب").flatMap(group => group.rows).map(item => item.course).join() === "الحاسوب في التعليم", "البحث باسم المقرر");
check(visibleSlotGroups(groups, null, "غيداء").length === 1 && visibleSlotGroups(groups, null, "G23").length === 1 && visibleSlotGroups(groups, null, "0109105").length === 1,
  "وبالأستاذ والقاعة ورقم المقرر");
check(matchesSlotQuery(rows[0], "اخلاقيات المهنه") && matchesSlotQuery(rows[0], "بدور الصالح"), "البحث يتسامح في الهمزة والتاء المربوطة وترتيب الكلمات");
check(visibleSlotGroups(groups, 2, "الحاسوب").length === 0, "والرقيقة مع البحث معاً");

/* ── اللوحة كما تُرسم ────────────────────────────────────────────────────── */
const html = renderToStaticMarkup(React.createElement(OccupancySlotPanel, {
  day: "الاثنين", range: "12:00–13:00", rate: 53, busyRooms: 17, totalRooms: 32, rows, campusOrder: [1, 2, 3], onClose: () => {},
}));
const lists = html.match(/<ol class="occupancy-slot-rows">[^]*?<\/ol>/g) || [];
check(lists.length === 3 && lists.every(list => !list.includes("كلية")), "اسم الكلية لا يتكرّر داخل الصفوف");
check((html.match(/class="occupancy-slot-group"/g) || []).length === 3 && (html.match(/class="occupancy-slot-group-head"/g) || []).length === 3,
  "ثلاث مجموعات، لكل موقعٍ رأسٌ صغير واحد");
check(/aria-pressed="true"[^>]*>الكل <b>4<\/b>/.test(html) && /data-campus="2" aria-pressed="false"[^>]*>بنين <b>1<\/b>/.test(html),
  "رقائق المواقع بأعدادها، و«الكل» مختارة أولاً");
check(!/عائلة القسم/.test(html), "لا جملة «عائلة القسم — …» في العنوان");
check(html.includes(LONG_COURSE) && html.includes(LONG_TEACHER), "اسم المقرر واسم الأستاذ كاملين في الصفحة");
check(/dir="ltr">12:00–13:00</.test(html), "الوقت باتجاهٍ ثابت: لا ينقلب «13:00–12:00» داخل نصٍّ عربي");
check(/<b>17<\/b> من 32 قاعة/.test(html) && html.includes("53٪") && html.includes("dna-ring"), "حلقة الإشغال ١٧/٣٢ · ٥٣٪");
check(html.includes('class="occupancy-slot-code" dir="ltr">0109108<'), "رقم المقرر رقيقةٌ هادئة بسبع خانات");
check(html.includes("بلا قاعة") && html.includes("visiting-badge"), "المحاضرة بلا قاعة تقولها، والمنتدب بشارته");
check(!html.includes("occupancy-slot-search"), `البحث لا يظهر لأقل من ${SLOT_SEARCH_FROM} محاضرات`);
const many = Array.from({ length: SLOT_SEARCH_FROM }, (_, index) => row(1, GIRLS, `مقرر ${index}`, "د. س", "08:00"));
const single = renderToStaticMarkup(React.createElement(OccupancySlotPanel, {
  day: "الأحد", range: null, rate: 40, busyRooms: null, totalRooms: 10, rows: many, scopeLabel: "الموقع — بنات", onClose: () => {},
}));
check(single.includes("occupancy-slot-search") && single.includes('type="search"'), "وتطول القائمة فيظهر البحث");
check(!single.includes("occupancy-slot-campuses") && !single.includes("occupancy-slot-group-head"), "موقعٌ واحد: لا رقائق ولا رؤوس مجموعات");
check(single.includes("اليوم كله") && single.includes("إشغال اليوم كله"), "واليوم كله يقول ذلك بدل الساعة");

/* ── لا صنف قصٍّ على المقرر أو الأستاذ ──────────────────────────────────── */
const css = fs.readFileSync(path.join(process.cwd(), "src/styles/39-occupancy-heat.css"), "utf8");
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`(?:^|[},])\\s*${escaped}\\s*\\{([^}]*)\\}`, "gm"))].map(match => match[1]).join(";");
};
for (const selector of [".occupancy-slot-name", ".occupancy-slot-teacher", ".occupancy-slot-teacher-name", ".occupancy-slot-course"]) {
  const body = rule(selector);
  check(!/text-overflow\s*:\s*ellipsis|white-space\s*:\s*nowrap|-webkit-line-clamp/.test(body), `${selector}: لا قصّ بالنقاط ولا سطرٌ واحدٌ قسري`);
}
check(/\.occupancy-slot-name\{[^}]*white-space:normal/.test(css) && /\.occupancy-slot-teacher-name\{[^}]*white-space:normal/.test(css),
  "والاسم الطويل ينزل سطراً ثانياً");
check(/@media \(max-width:760px\)\{[^]*grid-template-areas:"time course" "time teacher" "time meta"/.test(css), "على الهاتف الصفّ مكدّس: الوقت في الطرف وما سواه تحته");
check(/grid-template-areas:"time course teacher meta"/.test(css), "وعلى الحاسوب أعمدة");

/* ── موصولة بالعدسة ──────────────────────────────────────────────────────── */
const reports = fs.readFileSync(path.join(process.cwd(), "src/components/Reports.tsx"), "utf8");
const lensBlock = reports.slice(reports.indexOf(') : lens === "occupancy" ? ('), reports.indexOf(') : lens === "visiting" ? ('));
check(lensBlock.length > 0 && lensBlock.includes("<OccupancySlotPanel") && !lensBlock.includes("occupancy-pick-rows"), "عدسة نسبة الإشغال تفتح اللوحة الجديدة لا القديمة");
check(reports.includes("campusOrder={occupancyCampusOrder}") && reports.includes("familyScopes.map(scope => scope.collegeId)"), "وترتيب المواقع من عائلة القسم");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
