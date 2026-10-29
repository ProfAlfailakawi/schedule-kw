/**
 * ── نواقص البيانات إشعارٌ لا مانع (قاعدة المالك 2026-09-27) ───────────────
 * «التوقيع لا يمنعه إلا تعارضٌ ماديّ». جدولٌ ببياناتٍ ناقصة وبلا تعارضٍ يُوقَّع؛
 * وجدولٌ فيه تعارضٌ حقيقي لا يُوقَّع. وعدّ النواقص يُطبّع القاعات النصّية
 * بالتطبيع نفسه الذي تُعدّ به الموانع.
 *
 * واستثناءٌ واحدٌ طلبه المالك: **سعة الشعبة** غير المسجّلة لمقرّرٍ في الجدول تمنع التوقيع
 * (`capacityGapItems` ← `canSign({ missingCapacity })`)، وبقيةُ النواقص إشعارٌ كما كانت.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canSign, emptyApproval } from "../src/utils/approvalWorkflow";
import { approvalBlockerSummary } from "../src/utils/scheduleBlockers";
import { capacityGapItems, computeScheduleDataReadiness } from "../src/utils/scheduleDataReadiness";
import { createDemoSandboxState } from "../src/db/demoSandbox";
import { readServerSource } from "./helpers/serverSource.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const course = { AdCourseId: 5, CourseCode: "C101", CourseName: "مقرر", CourseCredit: 3, CourseHours: 3, MaxStudent: 30, CourseRoomType:"تدريسية",CourseTeachingMode:"theoretical" };
const room = (id: string, capacity: number | null) => ({ id, buildingCode: "012", canonicalCode: id.toUpperCase(), capacity,roomType:"تدريسية" });
const row = (id: number, o: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 5, AdInstructorId: 7, SCode: String(id),
  fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "09:15", roomId: "f13", buildingId: "012", AdRoomCode: "012", AdRoomHall: "F13", ...o,
}) as any;
const base = { courses: [course], instructorIds: new Set([7, 8]) };

/* متطلبا المقرر إلزاميان في سياق الجدول، وخياراتهما قيم النظام المعروفة. */
{
  const rows=[row(1)];
  const missing=computeScheduleDataReadiness({...base,courses:[{...course,CourseRoomType:"",CourseTeachingMode:""}],rows,rooms:[room("f13",40)],roomTypeOptions:["تدريسية","مختبر"]});
  const item=missing.items.find(entry=>entry.kind==="course");
  check(item?.fields.includes("نوع القاعة المناسب")&&item.fields.includes("طبيعة التدريس"),"يعرض اسم المقرر والحقلين الناقصين لاستكمالهما من شريط الاعتماد");
  check(item?.choices?.["نوع القاعة المناسب"].join("|")==="تدريسية|مختبر"&&item?.choices?.["طبيعة التدريس"].includes("field_training"),"قوائم الاستكمال محصورة بالقيم المسجلة وأنواع التدريس المعروفة");
  const wrong=computeScheduleDataReadiness({...base,courses:[{...course,CourseRoomType:"قاعة مخترعة",CourseTeachingMode:"invented"}],rows,rooms:[room("f13",40)],roomTypeOptions:["تدريسية"]});
  check(wrong.items.some(entry=>entry.kind==="course"&&entry.fields.includes("نوع القاعة المناسب")&&entry.fields.includes("طبيعة التدريس")),"القيم غير المسجلة لا تُعدّ استكمالاً صالحاً للتوقيع");
  const retired=computeScheduleDataReadiness({...base,courses:[{...course,CourseRoomType:"قديم"}],rows,rooms:[{...room("f13",40),roomType:"قديم",active:false,confidence:"CONFIRMED"}]});
  check(retired.items.some(entry=>entry.kind==="course"&&entry.fields.includes("نوع القاعة المناسب")&&!entry.choices?.["نوع القاعة المناسب"].includes("قديم")),"القاعات غير النشطة لا تضيف خيارات قديمة لاختيار نوع القاعة");
}

/* 0) ملاءمة القاعة مراجعة تخطيطية لا مانع اعتماد، والسعة المجهولة تبقى مجهولة. */
{
  const rows=[row(1,{SCode:"1"}),row(2,{SCode:"2",ftuesday:false,fwednesday:true})];
  const configuredCourse={...course,MaxStudent:100,CourseRoomType:"مختبر حاسوب"};
  const review=computeScheduleDataReadiness({courses:[configuredCourse],instructorIds:new Set([7]),rows,rooms:[{...room("f13",40),roomType:"تدريسية"}],roomTypeOptions:["مختبر حاسوب","تدريسية"]});
  check(review.roomFit.count===4&&review.roomFit.items.some(item=>item.kind==="capacity")&&review.roomFit.items.some(item=>item.kind==="room-type"),"يعرض تقدير التكدس واختلاف نوع القاعة للمخطط دون منع الجدول");
  const alphabetical=computeScheduleDataReadiness({
    courses:[{...course,AdCourseId:6,CourseCode:"212",CourseName:"ورشة انتاج",CourseRoomType:"مختبر"},{...course,AdCourseId:7,CourseCode:"112",CourseName:"التدريب الميداني",CourseRoomType:"مختبر"}],
    instructorIds:new Set([7]),rows:[row(1,{AdCourseId:6}),row(2,{AdCourseId:7})],rooms:[{...room("f13",10),roomType:"تدريسية"}],roomTypeOptions:["مختبر","تدريسية"],
  });
  check(alphabetical.roomFit.items.map(item=>item.courseName).join("|")==="التدريب الميداني|التدريب الميداني|ورشة انتاج|ورشة انتاج","ملاحظات ملاءمة القاعات مرتبة أبجدياً باسم المقرر");
  const unknown=computeScheduleDataReadiness({courses:[configuredCourse],instructorIds:new Set([7]),rows,rooms:[room("f13",null)],roomTypeOptions:["مختبر حاسوب","تدريسية"]});
  check(unknown.roomFit.unknownRoomCapacity===2&&!unknown.roomFit.items.some(item=>item.kind==="capacity"),"السعة غير المسجلة تُترك بلا حكم ولا تحذير زائف");
}

/* 0ب) الديمو يضم مشهداً جاهزاً لشرح فحص النوع والسعة في الجدول، بلا تفعيل في إدارة النظام. */
{
  const demo=createDemoSandboxState();
  const rows=demo.schedules.filter(item=>Number(item.AdTermId)===1&&Number(item.AdSectionId)===1);
  const review=computeScheduleDataReadiness({courses:demo.courses,instructorIds:new Set(demo.instructors.map(item=>Number(item.AdInstructorId))),rows,rooms:demo.locationRooms,roomTypeOptions:["تدريسية","مختبر","مختبر حاسوب"]});
  check(rows.some(item=>{const c=demo.courses.find(course=>Number(course.AdCourseId)===Number(item.AdCourseId));const r=demo.locationRooms.find(room=>room.id===item.roomId);return c?.CourseRoomType==="مختبر حاسوب"&&r?.roomType==="تدريسية";}),"الديمو يجهّز في الجدول مقرراً مختبرياً بقاعة تدريسية لشرح التنبيه الترويجي");
  check(review.roomFit.items.some(item=>item.kind==="room-type")&&review.roomFit.items.some(item=>item.kind==="capacity"),"مشهد الديمو يعرض ملاحظتي النوع والتكدس للمخطط قبل الاعتماد");
}

/* 1) نواقص بلا تعارضٍ ماديّ: يُوقَّع. */
{
  const rows = [row(1, { roomId: "f13" })];
  const gaps = computeScheduleDataReadiness({ ...base, courses: [{ ...course, MaxStudent: 0 }], rows, rooms: [room("f13", null)] });
  const blockers = approvalBlockerSummary(rows, rows, {});
  check(gaps.count > 0 && !gaps.ready, "الجدول فيه بياناتٌ ناقصة (سعة شعبة) — وسعة القاعة لم تعد بنداً");
  check(blockers.conflicts === 0, "ولا تعارضَ ماديّ فيه");
  const verdict = canSign(emptyApproval(1, 5, 20), "committee", { blockingConflicts: blockers.conflicts, blockingDuplicates: blockers.duplicates, rowCount: rows.length });
  check(verdict.ok === true, "نواقصُ البيانات وحدها لا تمنع التوقيع (والسعةُ لا تُحسب إلا إن مُرّرت)");
}
/* 1ج) السعةُ المسجّلة شرطٌ: مقرّرٌ بلا سعةٍ يمنع التوقيع، ونقصُ الوحدات وحده لا يمنع. */
{
  const rows = [row(1, { roomId: "f13" })];
  const noCapacity = computeScheduleDataReadiness({ ...base, courses: [{ ...course, MaxStudent: 0 }], rows, rooms: [room("f13", 40)] });
  const noCredit = computeScheduleDataReadiness({ ...base, courses: [{ ...course, CourseCredit: 0 }], rows, rooms: [room("f13", 40)] });
  check(capacityGapItems(noCapacity.items).length === 1, "مقرّرٌ في الجدول بلا سعةٍ مسجّلة يُعدّ مانعاً");
  check(capacityGapItems(noCredit.items).length === 0 && !noCredit.ready, "ونقصُ الوحدات وحده نقصٌ لا يمنع");
  const blockers = approvalBlockerSummary(rows, rows, {});
  const blocked = canSign(emptyApproval(1, 5, 20), "committee", { blockingConflicts: blockers.conflicts, rowCount: rows.length, missingCapacity: capacityGapItems(noCapacity.items).length });
  check(blocked.ok === false && (blocked as any).code === "missing-capacity" && blocked.message.includes("سعة"), "canSign يرفض بسبب «missing-capacity» برسالةٍ تذكر السعة");
  const allowed = canSign(emptyApproval(1, 5, 20), "committee", { blockingConflicts: 0, rowCount: rows.length, missingCapacity: 0 });
  check(allowed.ok === true, "وبعد تسجيل السعة يُوقَّع");
  const many = canSign(emptyApproval(1, 5, 20), "committee", { blockingConflicts: 0, rowCount: 3, missingCapacity: 3 });
  check(many.ok === false && many.message.includes("3 مقررات"), "الرسالةُ تعدّ المقرّرات الناقصة");
}
/* 1ب) «بانتظار تثبيت القاعة» (مبنى بلا قاعة مثبّتة) حالةٌ مقصودة لا بندٌ ناقص؛ وبلا مبنى تبقى ناقصة. */
{
  const pending = computeScheduleDataReadiness({ ...base, rows: [row(1, { roomId: "", buildingId: "b8", locationStatus: "PENDING_ROOM" })], rooms: [] });
  check(!pending.items.some(i => i.kind === "location" || i.kind === "room"), "مبنى محدد + قاعة بانتظار التثبيت: لا ملاحظة");
  const noBuilding = computeScheduleDataReadiness({ ...base, rows: [row(1, { roomId: "", buildingId: "", locationStatus: "PENDING_ROOM" })], rooms: [] });
  check(noBuilding.items.some(i => i.kind === "location"), "بلا مبنى ولا قاعة: تبقى ملاحظة");
}
/* 2) تعارضٌ حقيقي: لا يُوقَّع. */
{
  const rows = [row(1), row(2, { AdInstructorId: 8 })];
  const blockers = approvalBlockerSummary(rows, rows, {});
  const verdict = canSign(emptyApproval(1, 5, 20), "committee", { blockingConflicts: blockers.conflicts, blockingDuplicates: blockers.duplicates, rowCount: rows.length });
  check(blockers.conflicts > 0 && verdict.ok === false && (verdict as any).code === "blocking-conflicts", "تعارضٌ ماديّ (قاعة واحدة في الوقت نفسه) يمنع التوقيع");
}
/* 3) قاعةٌ نصّية تطابق السجل ليست ناقصة؛ المجهولة ناقصة. */
{
  const registry = [room("f13", 40)];
  const normalizeRow = (r: any) => r.roomId || String(r.AdRoomHall) !== "F13" ? r : { ...r, roomId: "f13", locationStatus: "VERIFIED" };
  const textOnly = row(1, { roomId: undefined, buildingId: undefined });
  const unknown = row(2, { roomId: undefined, buildingId: undefined, AdRoomHall: "ZZ99", fstarttime: "10:00", fendtime: "11:15" });
  const without = computeScheduleDataReadiness({ ...base, rows: [textOnly], rooms: registry });
  check(without.items.some(i => i.kind === "location"), "دون تطبيع: الصفّ النصّي يُعدّ ناقصاً (أصل التضخيم)");
  const withNorm = computeScheduleDataReadiness({ ...base, rows: [textOnly], rooms: registry, normalizeRow });
  check(withNorm.ready && withNorm.count === 0, "مع التطبيع: القاعة النصّية المطابقة للسجل ليست ناقصة");
  const both = computeScheduleDataReadiness({ ...base, rows: [textOnly, unknown], rooms: registry, normalizeRow });
  check(both.count === 1 && both.items[0].kind === "location", "والقاعة المجهولة فعلاً تبقى ناقصة");
}
/* 4) البنية: لا بوابة في الخادم، والعدّ يستعمل مطبّع الموانع نفسه. */
{
  const server = readServerSource();
  const sign = server.slice(server.indexOf('app.post("/api/approvals/sign"'), server.indexOf('app.post("/api/approvals/withdraw"'));
  check(sign.includes("requiredCourseGaps") && sign.includes("course-requirements-missing") && sign.includes("capacityGapItems(readiness.items)"), "مسار التوقيع يمنع حقلي متطلبات المقرر والسعة من خلال فحوصهما المحددة");
  const fn = server.slice(server.indexOf("async function scheduleDataReadiness"), server.indexOf('app.get("/api/approvals"'));
  check(fn.includes("normalizeRow: (row: any) => canonicalizeHistoricalLocationForRuntime(row as FSchedule, registry)"), "عدّ النواقص يطبّع الصفوف بمطبّع الموانع نفسه");
  check(fn.includes('room.confidence!=="CONFIRMED"||!room.sectionIds.includes(sectionId)'), "خيارات نوع القاعة في التوقيع تطابق الأنواع المهيأة والقاعات النشطة المؤكدة للقسم");
  const bar = readFileSync(join(ROOT, "src/components/ApprovalBar.tsx"), "utf8");
  check(bar.includes("requiredCourseFieldsBlocksSign") && bar.includes("capacityBlocksSign") && !bar.includes("تمنع التوقيع حتى"), "زرّ التوقيع يتوقف على السعة ومتطلبات المقررات ولا يغيّر قواعد بقية النواقص");
  check(bar.includes("canSignNow && blockingConflicts === 0 && missingCapacity === 0 && !requiredCourseFieldsBlocksSign ?"), "شارة «جاهز للتوقيع» لا تظهر قبل اكتمال متطلبات المقررات الإلزامية");
  check(bar.includes("capacityBlocksSign ? (") && bar.includes("السعة ناقصة"), "شارةٌ حمراء «السعة ناقصة» تفتح قائمة الإدخال");
  check(server.slice(server.indexOf('app.get("/api/approvals"'), server.indexOf('app.get("/api/approvals/term"')).includes("missingCapacity: capacityGapItems(readiness.items).length"), "حالةُ الاعتماد تحمل عدد المقرّرات بلا سعة للشريط");
  check(!bar.includes('className="apb-room-capacities"'), "لا بطاقات سعةٍ مكرّرة تحت القائمة");
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
