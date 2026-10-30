/**
 * ── موقعُ البند ومرشّحُ «الموقع» في «وارد الأساتذة» ─────────────────────────
 *
 *   C1 كلُّ بندٍ يحمل موقعه — تعديلاً وحذفاً وإضافة — من البند نفسه: الإضافةُ حيث
 *      اختار الأستاذ، والتعديلُ والحذفُ حيث يقع الصفّ، وإلا فموقعُ الرابط.
 *   C2 الوسمُ قصير: «بنين»/«بنات»، و«الجهراء - بنات» حين يلزم التمييز.
 *   C3 المرشّح: المواقعُ التي في الوارد وحدها بعدد بنودها؛ يُخفي البنودَ خارج الموقع،
 *      ويُخفي الطلبَ الذي لم يبقَ فيه بندٌ في الموقع.
 *   C4 يُتذكَّر الاختيار لكل حسابٍ على جهازه، وموقعٌ غاب عن الوارد يعود «الكل».
 *   C5 الشاشة: الوسمُ في كل أنواع البنود وفي رأس البطاقة، والمرشّحُ يعمل مع البقية.
 */
import fs from "fs";
import path from "path";
import {
  effectiveCampus, inboxCampusKey, inboxCampusLabels, inboxCampusOptions, inboxCollegeNames, itemInCampus,
  readInboxCampus, requestInCampus, requestItemCollegeId, writeInboxCampus,
} from "../src/utils/inboxCampus";
import { visibleFilterOptions } from "../src/components/InstructorInbox";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const BOYS = "كلية التربية الأساسية - بنين";
const GIRLS = "كلية التربية الأساسية - بنات";
const JAHRA = "كلية التربية الأساسية - الجهراء - بنات";

/* طلبٌ من رابط البنات، فيه تعديلٌ في البنات، وحذفٌ في البنين، وإضافةٌ في الجهراء،
   وبندٌ «كما هو» لا يُعدّ. وطلبٌ ثانٍ كلُّه في البنين، وثالثٌ ملاحظةٌ بلا بنود. */
const mixed = {
  AdCollegeId: 2, requestCollegeName: GIRLS,
  items: [
    { action: "change", before: { collegeId: 2, collegeName: GIRLS } },
    { action: "delete", before: { collegeId: 1, collegeName: BOYS } },
    { action: "add", after: { collegeId: 3, collegeName: JAHRA } },
    { action: "keep", before: { collegeId: 1 } },
    { action: "change", hidden: true, before: { collegeId: 1 } },
  ],
};
const boysOnly = { AdCollegeId: 1, requestCollegeName: BOYS, items: [{ action: "change", before: { collegeId: 1 } }, { action: "delete", before: {} }] };
const noteOnly = { AdCollegeId: 2, requestCollegeName: GIRLS, note: "ملاحظة", items: [{ action: "keep", before: { collegeId: 2 } }] };
/* طلبٌ قديم: لقطاتُه بلا موقع، فيتبع البندُ موقعَ الرابط. */
const legacy = { AdCollegeId: 1, requestCollegeName: BOYS, items: [{ action: "add", after: {} }] };

/* ── C1 ─────────────────────────────────────────────────────────────────── */
check(requestItemCollegeId(mixed, mixed.items[0]) === 2, "C1 التعديلُ في موقع صفّه (بنات)");
check(requestItemCollegeId(mixed, mixed.items[1]) === 1, "C1 الحذفُ في موقع صفّه ولو اختلف عن موقع الرابط (بنين)");
check(requestItemCollegeId(mixed, mixed.items[2]) === 3, "C1 الإضافةُ حيث اختار الأستاذ (الجهراء)");
check(requestItemCollegeId(boysOnly, boysOnly.items[1]) === 1 && requestItemCollegeId(legacy, legacy.items[0]) === 1,
  "C1 لقطةٌ بلا موقع تعود إلى موقع الرابط");

/* ── C2 ─────────────────────────────────────────────────────────────────── */
const two = inboxCampusLabels([BOYS, GIRLS]);
check(two.get(BOYS) === "بنين" && two.get(GIRLS) === "بنات", `C2 «بنين» و«بنات»: ${[...two.values()].join(" · ")}`);
const three = inboxCampusLabels([BOYS, GIRLS, JAHRA]);
check(three.get(GIRLS) === "بنات" && three.get(JAHRA) === "الجهراء - بنات" && three.get(BOYS) === "بنين",
  `C2 الجهراء تتميّز عن البنات: ${[...three.values()].join(" · ")}`);
check(inboxCampusLabels([GIRLS]).get(GIRLS) === "بنات", "C2 موقعٌ واحد يأخذ وسمه القصير ولا يُترك بلا وسم");
const twoFamilies = inboxCampusLabels([GIRLS, "كلية العلوم الصحية - بنات"]);
check(new Set(twoFamilies.values()).size === 2, `C2 عائلتان مختلفتان تتمايزان: ${[...twoFamilies.values()].join(" · ")}`);

const names = inboxCollegeNames([mixed, boysOnly, noteOnly, legacy]);
check(names.get(1) === BOYS && names.get(2) === GIRLS && names.get(3) === JAHRA, "C2 أسماءُ المواقع من اللقطات واسم الرابط");
const otherName = inboxCollegeNames([{ AdCollegeId: 9, requestCollegeName: "كلية أخرى", items: [] }], [{ id: 9, name: "كلية العلوم" }]);
check(otherName.get(9) === "كلية العلوم", "C2 «كلية أخرى» لا تغلب الاسمَ الحقيقي من الكتالوج");

/* ── C3 ─────────────────────────────────────────────────────────────────── */
const options = inboxCampusOptions([mixed, boysOnly, noteOnly], names);
const byId = new Map(options.map(option => [option.collegeId, option]));
check(byId.get(1)?.count === 3 && byId.get(2)?.count === 1 && byId.get(3)?.count === 1,
  `C3 العدّ ببنود كل موقع (لا «كما هو» ولا المخفيّ): ${options.map(o => `${o.chip}=${o.count}`).join(" · ")}`);
check(options.length === 3 && byId.get(3)?.chip === "الجهراء - بنات", "C3 المواقعُ الموجودة وحدها، بوسومها");
check(options.map(option => option.chip).join(" · ") === "بنين · بنات · الجهراء - بنات", `C3 الترتيب: بنين ثم بنات ثم الفروع (${options.map(o => o.chip).join(" · ")})`);
const choices = [{ value: "0", label: "الكل" }, ...options.map(o => ({ value: String(o.collegeId), label: o.chip, count: o.count }))];
check(visibleFilterOptions(choices, "0").length === 4, "C3 المرشّح يُرسم حين يكون في الوارد أكثرُ من موقع");
const single = inboxCampusOptions([boysOnly], names);
check(visibleFilterOptions([{ value: "0", label: "الكل" }, ...single.map(o => ({ value: String(o.collegeId), label: o.chip, count: o.count }))], "0").length === 0,
  "C3 موقعٌ واحد لا يُرسم له مرشّح");

check(mixed.items.filter(item => item.action !== "keep" && !item.hidden && itemInCampus(mixed, item, 1)).map(item => item.action).join() === "delete",
  "C3 «بنين» يُبقي من الطلب المختلط حذفَه وحده");
check(mixed.items.filter(item => item.action !== "keep" && !item.hidden && itemInCampus(mixed, item, 0)).length === 3, "C3 «الكل» يُبقي البنودَ كلَّها");
check(requestInCampus(mixed, 3) && !requestInCampus(boysOnly, 3) && !requestInCampus(boysOnly, 2),
  "C3 طلبٌ بلا بندٍ في الموقع المختار يُخفى");
check(requestInCampus(noteOnly, 2) && !requestInCampus(noteOnly, 1), "C3 ملاحظةٌ بلا بنود تتبع موقعَ رابطها");

/* ── C4 ─────────────────────────────────────────────────────────────────── */
check(inboxCampusKey(7) === "inbox-campus-7" && inboxCampusKey("x") === "inbox-campus-0", "C4 مفتاحٌ لكل حساب");
writeInboxCampus(7, 2);
writeInboxCampus(8, 3);
check(readInboxCampus(7) === 2 && readInboxCampus(8) === 3, "C4 الاختيار يُحفظ ويُقرأ لكل حسابٍ وحده");
writeInboxCampus(7, 0);
check(readInboxCampus(7) === 0 && readInboxCampus(8) === 3, "C4 «الكل» يمحو اختيار صاحبه وحده");
check(effectiveCampus(3, options) === 3 && effectiveCampus(42, options) === 0 && effectiveCampus(0, options) === 0,
  "C4 موقعٌ غاب عن الوارد يعود «الكل»");

/* ── C5 ─────────────────────────────────────────────────────────────────── */
const inbox = read("src/components/InstructorInbox.tsx");
const rowSource = inbox.slice(inbox.indexOf("function RequestRow("), inbox.indexOf("function RequestRow(") + 9000);
check(/<span className="request-where">[\s\S]{0,400}<CampusChip label=\{campus/.test(rowSource)
  && !/item\.action === "add" && item\.after\?\.collegeName \? <small>/.test(inbox),
  "C5 وسمُ الموقع في كل بند (لا شرطَ «إضافة»)، بجانب الشعبة");
check(/campus=\{campusLabels\.get\(requestItemCollegeId\(row as any, item as any\)\)\}/.test(inbox), "C5 الوسمُ من موقع البند نفسه");
check(/request-card-section[\s\S]{0,200}cardCampuses\.map\(label => <CampusChip/.test(inbox), "C5 ووسمُ المواقع في رأس البطاقة بجانب القسم");
check(/<FilterGroup label="الموقع" value=\{String\(campusFilter\)\} onChange=\{value => pickCampus/.test(inbox), "C5 مرشّح «الموقع» في شريط المرشّحات");
check(/itemFilter = useCallback\(\(item: InstructorRequestItem, row: InboxRequest\)[\s\S]{0,200}itemInCampus\(/.test(inbox)
  && /filter\(entry\.item, row\)/.test(inbox), "C5 البنودُ داخل البطاقة تُرشَّح بالموقع");
check(/absentRows[^\n]*requestInCampus\(row as any, campusFilter\)/.test(inbox)
  && /visibleConfirmedUnchanged[\s\S]{0,200}requestInCampus\(row as any, campusFilter\)/.test(inbox)
  && /ta: inCampus\.filter\(isTaRequest\)/.test(inbox),
  "C5 يعمل مع «لم يشاركوا» و«ثبّتوا كما هي» و«🎓 تدريب»");
check(/writeInboxCampus\(sharedScopeUser\(\), collegeId\)/.test(inbox) && /readInboxCampus\(sharedScopeUser\(\)\)/.test(inbox),
  "C5 الاختيار يُتذكَّر لصاحب الحساب");
const css = read("src/styles/46-inbox-campus.css");
check(read("src/index.css").includes('@import "./styles/46-inbox-campus.css";') && /\.request-campus\{[^}]*var\(--brass\)/.test(css)
  && !/#[0-9a-f]{3,6}/i.test(css), "C5 الوسمُ برموز التصميم وحدها (الوضع الداكن)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
