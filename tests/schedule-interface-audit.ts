import assert from "node:assert/strict";
import fs from "node:fs";

const schedule = fs.readFileSync("src/components/Schedules.tsx", "utf8");
const location = fs.readFileSync("src/components/LocationPicker.tsx", "utf8");
const styles = fs.readFileSync("src/styles/05-schedule.css", "utf8");

assert.match(schedule, /setHueFocus\(current\s*=>\s*current\.has\(key\)\s*\?\s*new Set\(\)\s*:\s*new Set\(\[key\]\)\)/,
  "اختيار هوية جديدة في فلتر الجدول يستبدل السابقة، وإعادة اختيارها يمسح الفلتر");
assert.match(schedule, /const changeHueBasis = \(basis: "course" \| "instructor" \| "room"\)[^]*setHueFocus\(new Set\(\)\)/,
  "التبديل بين الأستاذ والمقرر والقاعة يمسح مرشح النوع السابق قبل اختيار الجديد");
assert.match(schedule, /setHueFocus\(new Set\(view\.filters\.hueFocus\.slice\(0, 1\)\)\)/,
  "العروض المحفوظة القديمة لا تعيد أكثر من فلتر واحد");
assert.doesNotMatch(schedule, /اضغط غيره لإضافته للمقارنة/,
  "واجهة الفلتر لا توحي بتجميع أسماء الأساتذة والقاعات");
assert.match(schedule, /room-suggest-card-icon[^]*<DoorOpen \/>/,
  "اقتراح القاعة يعرض رمز القاعة");
const roomSuggestions = schedule.slice(schedule.indexOf('className="room-suggest-list"'), schedule.indexOf('className="room-suggest-empty"'));
assert.match(roomSuggestions, /room-suggest-card-action[^]*<CheckCircle2 aria-hidden="true"\s*\/>/,
  "اقتراح القاعة يوضح فعل الاختيار بأيقونة");
assert.match(styles, /\.room-suggest-list>button\{[^}]*grid-template-columns:34px minmax\(0,1fr\) auto/,
  "بطاقات القاعات المقترحة تحافظ على محاذاة الاسم والشرح والفعل");
assert.match(schedule, /showDepartmentHistory=\{editor === "edit"\}/,
  "سجل القاعات التاريخي يظهر عند تعديل موعد فقط، لا عند إنشاء موعد");
assert.match(location, /showDepartmentHistory&&restrictedHistoricalRooms\.length/,
  "اقتراحات الاستعارة التاريخية نفسها تظل مرتبطة بعرض التاريخ");

console.log("schedule-interface-audit ok");
