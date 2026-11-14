/** شعبٌ يطلبها الطلبة في «مساري»: حسابٌ حتميّ (⌈الطلبة ÷ السعة⌉) + عرضٌ هادئ بلا كتابة.
 *  تخطيطُ الشعب نفسه (تقرير التسجيل) في tests/section-plan-audit.ts وtests/section-plan-surfaces-audit.ts. */
import React from "react";
import fs from "fs";
import { renderToStaticMarkup } from "react-dom/server";
import { studentGaps, type GapCourse } from "../src/utils/sectionGap";
import { SectionGapPanel } from "../src/components/SectionGapNote";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra)); }
};
const c = (id: number, code: string, capacity: number, existing: number, students: number): GapCourse => ({ id, code, name: `مقرر ${code}`, capacity, existing, students });

/* رغبات الطلبة وحدها (إشارة «مساري»): ⌈الطلبة ÷ السعة⌉. 180÷30 = 6 والموجود 5 ← ناقصة 1؛ 90÷30 = 3 والموجود 3 ← كافية. */
const byStudents = studentGaps([c(1, "101", 30, 5, 180), c(2, "102", 30, 3, 90), c(3, "103", 0, 0, 500), c(4, "104", 40, 0, 0), c(5, "105", 25, 1, 101)]);
check(byStudents.map(g => g.id).join() === "5,1", "الطلب ÷ السعة: ‎101 ينقصه 1، ‎105 ينقصه 4 (⌈101÷25⌉−1 = 4)، والترتيب الأكثر نقصاً أولاً", byStudents);
check(byStudents.every(g => g.basis === "students"), "إشارة الطلبة: الأساس طلب الطلبة");
check(!byStudents.some(g => g.id === 3 || g.id === 4), "سعةٌ مجهولة أو طلبٌ صفر ← لا اقتراح مختلق");

check(studentGaps([]).length === 0 && studentGaps([c(1, "101", 30, 9, 100)]).length === 0, "لا نقص ← قائمةٌ فارغة (لا شارة)");
const many = Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, code: `9${i}`, name: `مقرر ${i}`, existing: 1, required: 2 + i, extra: 1 + i, basis: "students" as const, demand: 50 }));
const html = renderToStaticMarkup(React.createElement(SectionGapPanel, { items: byStudents.concat(many), kind: "students", onClose: () => {} }));
check(html.includes("شعبٌ يطلبها الطلبة في «مساري»") && html.includes("اختياري") && html.includes("طالب") && !html.includes("كشف المتبقي"), "قائمة «مساري»: عنوانها وعدد الطلبة، ولا شيء من التخطيط القديم");
check(!html.includes("<a ") && !html.includes("<input") && !html.includes("<form"), "العرض: بلا رابطٍ ولا حقلٍ ولا نموذج");
const shownRows = (html.match(/<li/g) || []).length;
check(shownRows === 5 && html.includes("الكل ("), "العرض: خمسة أسطر ثم «الكل»", { shownRows });
check(!renderToStaticMarkup(React.createElement(SectionGapPanel, { items: byStudents, kind: "students", onClose: () => {} })).includes("الكل ("), "قائمةٌ قصيرة بلا «الكل»");
const alpha = renderToStaticMarkup(React.createElement(SectionGapPanel, { items: [many[2], many[0]], onClose: () => {} }));
check(alpha.indexOf(many[0].name) < alpha.indexOf(many[2].name), "القائمة أبجدية باسم المقرر");

/* ── علامةُ المقرر في مفتاح الألوان، وجرسُ «مساري»، وتلميحُ الأيقونة ── */
import { buildMasariGapNotifications } from "../src/utils/featureNotifications";
const bell = buildMasariGapNotifications([{ collegeId: 1, sectionId: 6, sectionName: "الدراسات الإسلامية", courses: 1 }, { collegeId: 1, sectionId: 2, sectionName: "علم البيانات", courses: 3 }, { collegeId: 1, sectionId: 9, sectionName: "الرياضيات", courses: 0 }], 2, "الفصل الثاني");
check(bell.length === 2 && bell[0].title === "طلبة «مساري» يحتاجون شعباً في مقرر واحد" && bell[1].title === "طلبة «مساري» يحتاجون شعباً في 3 مقررات" && bell.every(item => item.view === "schedules" && item.tone === "action" && item.termId === 2), "جرس «مساري»: سطرٌ لكل قسمٍ له نقص، بعدّ عربيّ سليم، ولا سطر لقسمٍ بلا نقص", bell.map(item => item.title));
check(bell[0].id !== buildMasariGapNotifications([{ collegeId: 1, sectionId: 6, sectionName: "x", courses: 2 }])[0].id, "تغيّر العدد يصير إشعاراً جديداً");
const bar = fs.readFileSync("src/components/ApprovalBar.tsx", "utf8");
const server = readServerSource(), schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check(server.includes("cachedSectionGap") && server.includes("buildMasariGapNotifications(found") && /\["standard", "committeeChair", "departmentHead"\]\.includes\(role\) && !isPowerUser\(req\)/.test(server), "الجرس لعاملي القسم وحدهم، وبقراءةٍ مخبّأةٍ دقيقة");
check(schedules.includes("onStudentGaps={setStudentGaps}") && schedules.includes("week-legend-need") && schedules.includes('hueBy === "course"'), "علامة «+N» على شارة المقرر في مفتاح الألوان، للمقررات فقط");
check((schedules.match(/\{needMark\(item\.key\)\}/g) || []).length === 3, "العلامة في مفاتيح الألوان الثلاثة: القائمة والأسبوع والقاعات");
check(bar.includes("() => onStudentGaps?.([])"), "زوال الشريط يمحو علاماته");
check(/slice\(0, 30\);\s*const found/.test(server) && !/slice\(0, 4\);\s*const found/.test(server), "يُفحص كل أقسام العامل ثم يُقتصر الناتج على أربعة");
check(!bar.includes("QuickPlanSheet") && !bar.includes("showQuickCompareBadge") && bar.includes("<SectionPlanBadge") && bar.includes("<SectionGapBadge items={gap.studentItems}"), "شريط الاعتماد: شارةُ التخطيط الواحدة وشارةُ «مساري»، ولا أيقونة كشف المتبقي");

console.log(`\nSection gap audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
