/**
 * ── «اكتب الموعد بسطرٍ واحد» (إعادة تصميم «موعد جديد»، الفكرة 1) ─────────────────
 *
 * في لوحة أوامر الجدول (⌘K / Ctrl+K) يكتب المنسّق الموعدَ سطراً واحداً —
 * «0109105 ش503 د. نورة ن ر 8:00-9:15 901A01/104» — فيظهر في أعلى اللوحة أمرٌ
 * واحد «أنشئ هذا الموعد» ومعه صورتُه: المقرر والشعبة والأستاذ والأيام والوقت
 * والقاعة، ما فُهم مملوءٌ وما لم يُفهم «؟» متقطّع. وتنفيذُه يفتح المحررَ نفسَه
 * (openCreate) بما فُهم، وفحوصُ المحرر الحيّة تعمل كما تعمل لكل إدخال.
 *
 * أولاً القراءةُ الخالصة (src/utils/oneLineAppointment.ts) بحالاتٍ كثيرة: الأرقام
 * العربية والفارسية، حروف الأيام، قاعدة «1–6 بعد الظهر»، اللواحق، المدى، الالتباس،
 * وما لم يُفهم. ثم القاعةُ من السجل الرسمي، ثم الربطُ في اللوحة والمحرر.
 */
import fs from "node:fs";
import { AR, countOf } from "../src/utils/arabicCount";
import {
  normalizeOneLine,
  offerOneLine,
  oneLineCreateSeed,
  oneLinePlace,
  oneLineStrength,
  parseOneLineAppointment,
  type OneLineContext,
  type OneLineReading,
} from "../src/utils/oneLineAppointment";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 700)); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

const courses = [
  { AdCourseId: 1, CourseName: "مبادئ الإحصاء", CourseCode: "0109105" },
  { AdCourseId: 2, CourseName: "الإحصاء التطبيقي", CourseCode: "109106" },
  { AdCourseId: 3, CourseName: "رياضيات 1", CourseCode: 109101 },
  { AdCourseId: 4, CourseName: "رياضيات 2", CourseCode: "0109102" },
  { AdCourseId: 5, CourseName: "كيمياء الأملاح", CourseCode: "0110201" },
  { AdCourseId: 6, CourseName: "تحليل البيانات", CourseCode: "0109300" },
  { AdCourseId: 7, CourseName: "تحليل البيانات", CourseCode: "0109301" },
  { AdCourseId: 9, CourseName: "مختبر البيانات", CourseCode: "0109300" },
];
const instructors = [
  { AdInstructorId: 11, AdInstructorName: "نورة سالم العنزي" },
  { AdInstructorId: 12, AdInstructorName: "د. محمد عبدالله الكندري" },
  { AdInstructorId: 13, AdInstructorName: "محمد أحمد الرشيدي" },
  { AdInstructorId: 14, AdInstructorName: "أمل يوسف" },
  { AdInstructorId: 15, AdInstructorName: "علي حسن" },
  { AdInstructorId: 16, AdInstructorName: "علياء خالد" },
  { AdInstructorId: 17, AdInstructorName: "عبد الرحمن فهد" },
  { AdInstructorId: 18, AdInstructorName: "خميس مبارك" },
];
const ctx: OneLineContext = { courses, instructors, window: { start: "08:00", end: "20:00" } };
const line = (text: string, context: OneLineContext = ctx) => parseOneLineAppointment(text, context);
const days = (reading: OneLineReading) => (reading.seed.days || []).join("+");
const time = (reading: OneLineReading) => `${reading.seed.start || ""}-${reading.seed.end || ""}`;
const MW = "fmonday+fwednesday", STT = "fsunday+ftuesday+fthursday";

/* ── أ. القراءة ── */
{
  const a = line("503 نورة اثنين أربعاء 8");
  check(a.seed.sectionCode === "503" && a.seed.instructorId === 11 && days(a) === MW && time(a) === "08:00-" && !a.unknown.length,
    "R1 «503 نورة اثنين أربعاء 8»: الشعبة والأستاذة والاثنين·الأربعاء و08:00 (والنهاية يكملها النمط)", a);
  const b = line("0109105 ش503 د. نورة ن ر 8:00-9:15 901A01/104");
  check(b.seed.courseId === 1 && b.seed.sectionCode === "503" && b.seed.instructorId === 11 && days(b) === MW && time(b) === "08:00-09:15"
    && b.seed.roomCode === "901A01" && b.seed.roomHall === "104" && !b.unknown.length,
    "R2 السطر الكامل: رمز المقرر · ش503 · د. نورة · ن ر · 8:00-9:15 · 901A01/104", b);
  check(b.parts.course === "مبادئ الإحصاء" && b.parts.section === "503" && b.parts.teacher === "نورة سالم العنزي"
    && b.parts.days === "الاثنين · الأربعاء" && b.parts.time === "08:00 – 09:15" && b.parts.room === "901A01/104",
    "R3 الأجزاء الستة جاهزةٌ للعرض بأسمائها", b.parts);

  check(normalizeOneLine("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹") === "0123456789 0123456789", "R4 الأرقام العربية والفارسية تُقرأ أرقاماً");
  const arabic = line("٠١٠٩١٠٥ ش٥٠٣ ن ر ٨:٣٠");
  check(arabic.seed.courseId === 1 && arabic.seed.sectionCode === "503" && days(arabic) === MW && arabic.seed.start === "08:30", "R5 سطرٌ بأرقامٍ عربية كله", arabic);
  check(line("۸:۳۰").seed.start === "08:30" && line("٨٫٣٠").seed.start === "08:30" && line("08.30").seed.start === "08:30",
    "R6 «۸:۳۰» و«٨٫٣٠» (الفاصلة العربية) و«08.30» وقتٌ واحد");
  const marks = line("‏نورة‏ ن ر 8");
  const forms = line("ﻧﻮﺭﺓ ﺍﻻﺛﻨﻴﻦ 8");
  check(marks.seed.instructorId === 11 && days(marks) === MW && forms.seed.instructorId === 11 && days(forms) === "fmonday",
    "R7 علامات الاتجاه الملصوقة وأشكال العرض (PDF) لا تغيّر القراءة");
  check(days(line("الأَرْبِعَاء")) === "fwednesday" && days(line("الخمـيس")) === "fthursday", "R8 التشكيل والتطويل يُطويان");

  /* الأيام */
  check(days(line("حثخ 10")) === STT && days(line("ح ث خ")) === STT && days(line("نر")) === MW, "D1 حروف الجدول: «حثخ» و«ح ث خ» و«نر»");
  check(days(line("الخميس الأحد")) === "fsunday+fthursday", "D2 الأيام بترتيب الأسبوع لا بترتيب الكتابة");
  check(days(line("الأحد والثلاثاء")) === "fsunday+ftuesday" && days(line("الاثنين و الأربعاء")) === MW, "D3 «و» ملتصقةً ومنفصلة");
  check(["اثنين، أربعاء", "اثنين·أربعاء", "اثنين-أربعاء", "اثنين,أربعاء", "ن، ر"].every(text => days(line(text)) === MW), "D4 الفاصلة العربية و«·» و«-» بين الأيام");
  check(["الإثنين اربعاء", "إثنين الاربعاء", "اثنين أربعاء", "الاتنين الأربعاء"].every(text => days(line(text)) === MW)
    && days(line("الثلاثاء")) === "ftuesday" && days(line("احد")) === "fsunday", "D5 بـ«ال» وبدونها وبصور الهمزة");
  const initial = line("ر. الشمري");
  check(!initial.seed.days && initial.unknown.includes("ر."), "D6 «ر.» حرفٌ أول من اسم، لا الأربعاء", initial);
  const named = line("د. خميس ن ر 9");
  check(named.seed.instructorId === 18 && days(named) === MW, "D7 «د. خميس» أستاذٌ لا يوم — اللقب يقرأ ما بعده أولاً", named);

  /* الوقت */
  check(line("2").seed.start === "14:00" && line("1:30").seed.start === "13:30" && line("6").seed.start === "18:00" && line("12").seed.start === "12:00",
    "T1 قاعدة الظهر: 1–6 بلا لاحقة بعد الظهر (2→14:00، 6→18:00) و12 ظهراً");
  const seven = line("7");
  check(!seven.seed.start && seven.unknown.includes("7") && line("7", { courses, instructors }).seed.start === "07:00",
    "T2 «7» = 07:00، وهو قبل يوم القسم فلا يُملأ ويُقال «لم يُفهم»؛ وبلا نافذةٍ يُقبل", seven);
  check(line("7م").seed.start === "19:00" && line("11ص").seed.start === "11:00" && line("12م").seed.start === "12:00"
    && line("٢ م").seed.start === "14:00" && line("2pm").seed.start === "14:00" && line("2:30pm").seed.start === "14:30",
    "T3 اللواحق «ص»/«م» (ملتصقةً ومنفصلة) وam/pm تفرض الفترة");
  const early = line("2 ص");
  check(!early.seed.start && early.unknown.includes("2 ص"), "T4 «2 ص» خارج اليوم الدراسي: لا يُثنى إليه، يُقال", early);
  check(["8-9:15", "8 الى 9:15", "من 8 إلى 9:15", "8:00 - 9:15", "8:00 – 9:15", "8 حتى 9:15", "من الساعة 8 إلى 9:15"].every(text => time(line(text)) === "08:00-09:15"),
    "T5 المدى: «8-9:15» و«8 الى 9:15» و«من 8 إلى 9:15» وصورُها");
  check(time(line("12-1")) === "12:00-13:00" && time(line("1-2:15 م")) === "13:00-14:15" && time(line("11-1 م")) === "11:00-13:00",
    "T6 المدى عبر الظهر، ولاحقةٌ بعد المدى لطرفيه إلا إن قلبت ترتيبهما");
  const backwards = line("9-8");
  check(time(backwards) === "09:00-" && backwards.unknown.includes("8"), "T7 نهايةٌ قبل البداية ليست نهاية: تبقى البداية ويُقال الباقي", backwards);
  const late = line("21:00");
  check(!late.seed.start && late.unknown.includes("21:00") && !line("8 م").seed.start, "T8 بعد نهاية اليوم (21:00، 8 م = 20:00) لا يُملأ", late);
  check(line("الساعة 9").seed.start === "09:00" && line("س 9").seed.start === "09:00", "T9 «الساعة 9»");
  const twoNumbers = line("12 8:30");
  check(twoNumbers.seed.start === "08:30" && twoNumbers.seed.sectionCode === "12", "T10 وقتٌ صريح يجعل العدد المجرد شعبةً", twoNumbers);

  /* الشعبة */
  check(["ش503", "ش 503", "شعبة 503", "الشعبة 503", "#503", "# 503"].every(text => line(text).seed.sectionCode === "503"), "S1 «ش503» و«شعبة 503» و«#503» وصورها");
  check(line("01 8").seed.sectionCode === "01" && line("01 8").seed.start === "08:00" && line("503-504").seed.sectionCode === "503",
    "S2 عددٌ مجرد من خانتين أو ثلاث شعبةٌ إن لم يكن وقتاً");

  /* المقرر */
  check(line("109105").seed.courseId === 1 && line("0109101").seed.courseId === 3, "C1 الرمز بالأصفار البادئة أو بدونها، ورمزٌ مخزّنٌ رقماً");
  const missingCode = line("0999999");
  check(!missingCode.seed.courseId && missingCode.unknown.includes("0999999") && oneLineStrength(missingCode) === 0, "C2 رمزٌ ليس في مقررات القسم يُقال ولا يُخمَّن", missingCode);
  check(line("مبادئ الإحصاء 501 ح ث خ 9").seed.courseId === 1 && line("مباد احصاء").seed.courseId === 1, "C3 الاسم كاملاً أو أوائلَ كلماته");
  const both = line("الإحصاء");
  check(!both.seed.courseId && both.ambiguous.course?.length === 2 && oneLineStrength(both) === 1, "C4 كلمةٌ في مقررين: لا اختيار، والاسمان للعرض", both);
  check(line("الإحصاء التطبيقي").seed.courseId === 2, "C5 أطول تطابقٍ يحسم (الإحصاء التطبيقي لا مبادئ الإحصاء)");
  const twins = line("تحليل البيانات");
  check(!twins.seed.courseId && twins.ambiguous.course?.join("|") === "تحليل البيانات · 0109300|تحليل البيانات · 0109301", "C6 اسمٌ واحد برمزين: الالتباس يُعرض بالرمزين", twins);
  const maths = line("رياضيات 2 ن ر 10");
  check(maths.seed.courseId === 4 && maths.seed.start === "10:00" && days(maths) === MW, "C7 رقمٌ من اسم المقرر («رياضيات 2») لا يُقرأ وقتاً", maths);
  const copied = line("0109105 مبادئ الإحصاء ش503 د. نورة ن ر 8");
  check(copied.seed.courseId === 1 && copied.seed.instructorId === 11 && !copied.unknown.length, "C8 الاسمُ المنسوخ بجانب الرمز يؤكده ولا يُعدّ «لم يُفهم»", copied);
  check(line("0109300 مختبر").seed.courseId === 9 && line("0109300 تحليل").seed.courseId === 6 && (line("0109300").ambiguous.course || []).length === 2,
    "C9 رمزٌ لمقررين يحسمه الاسم بجانبه، وبدونه يبقى ملتبساً");
  check(line("0109101 رياضيات 1 ن ر 8").seed.start === "08:00", "C10 «رياضيات 1» بعد الرمز: الواحد من الاسم والوقت 8");

  /* الأستاذ */
  const two = line("محمد 8");
  check(!two.seed.instructorId && two.ambiguous.teacher?.length === 2 && two.seed.start === "08:00", "P1 «محمد» لأستاذين: «؟» ولا اختيار", two);
  check(line("محمد الكندري").seed.instructorId === 12, "P2 الكلمة الثانية تحسم");
  check(line("علي").seed.instructorId === 15 && line("علي 9").seed.instructorId === 15, "P3 الكلمة الكاملة تقدَّم على أول الكلمة («علي» لا «علياء»)، و«علي» ليست حرف جر");
  check(line("عليا").seed.instructorId === 16, "P4 أول الكلمة يكفي حين لا تطابقٌ كامل");
  check(line("الدكتورة نورة").seed.instructorId === 11 && line("أ. أمل").seed.instructorId === 14 && line("د.محمد الرشيدي").seed.instructorId === 13,
    "P5 الألقاب تُترك («الدكتورة»، «أ.»، «د.» ملتصقة)");
  check(line("عبدالرحمن").seed.instructorId === 17 && line("عبد الرحمن").seed.instructorId === 17, "P6 «عبدالرحمن» = «عبد الرحمن»");
  check(line("أمل").seed.instructorId === 14 && !line("أمل").seed.courseId && line("كيمياء").seed.courseId === 5,
    "P7 «أمل» زميلةٌ لا أوّلُ «الأملاح»؛ و«كيمياء» مقرر");
  const pair = line("نورة محمد");
  check(!pair.seed.instructorId && pair.ambiguous.teacher?.length === 3, "P8 كلمتان لشخصين مختلفين: لا يُختار أحد", pair);

  /* القاعة */
  check(["901A01/104", "901A01 104", "قاعة 104 مبنى 901A01", "مبنى 901A01 قاعة 104"].every(text => line(text).parts.room === "901A01/104"),
    "M1 «901A01/104» و«901A01 104» و«قاعة 104 مبنى 901A01»");
  check(line("مبنى 901A01").seed.roomCode === "901A01" && !line("مبنى 901A01").seed.roomHall && line("F16").seed.roomHall === "F16", "M2 المبنى وحده، والقاعة وحدها");
  const notHall = line("901A01 08:30");
  check(notHall.seed.roomCode === "901A01" && !notHall.seed.roomHall && notHall.seed.start === "08:30", "M3 وقتٌ بعد المبنى ليس قاعة", notHall);
  check(line("901A01 104 ش503").seed.sectionCode === "503", "M4 أرقام القاعة لا تُقرأ شعبةً ولا وقتاً");

  /* ما لم يُفهم */
  const tomorrow = line("بكرة 503");
  check(tomorrow.unknown.join() === "بكرة" && tomorrow.seed.sectionCode === "503", "U1 «بكرة» يُقال كما كُتب ولا يُسقط", tomorrow);
  check(!line("إضافة موعد").unknown.length && !line("موعد جديد 503 نورة").unknown.length, "U2 كلمات الوصل («موعد»، «جديد»، «إضافة») تُقرأ ولا تُعدّ «لم يُفهم»");
  check(oneLineStrength(line("")) === 0 && oneLineStrength(line("عرض الأسبوع")) === 0 && oneLineStrength(line("التلوين حسب الأستاذ")) === 0,
    "U3 أسماء الأوامر لا تُقرأ موعداً");
}

/* ── ب. العرض والبذرة ── */
{
  check(!offerOneLine(line("حفظ"), 1) && !offerOneLine(line("بكرة"), 0), "O1 لا أمر «أنشئ» لكلامٍ بلا جزء");
  check(offerOneLine(line("8"), 0) && !offerOneLine(line("8"), 2) && offerOneLine(line("503 8"), 3),
    "O2 جزءٌ واحد يُعرض حين لا يطابق الكلامُ أمراً مسرودا؛ وجزءان يُعرضان دائماً");
  check(countOf(15, AR.instructor) === "15 أستاذاً" && countOf(2, AR.course) === "مقرران" && countOf(3, AR.instructor) === "3 أساتذة",
    "O3 عدد المرشّحين بقاعدة العدد والمعدود");

  const full = oneLineCreateSeed(line("0109105 ش503 د. نورة ن ر 8:00-9:15"), "501");
  check(full.courseId === 1 && full.sectionCode === "503" && full.instructorId === 11 && full.days?.join("+") === MW && full.day === "fmonday"
    && full.start === "08:00" && full.end === "09:15", "B1 البذرة: الشعبة المكتوبة تغلب المقترحة، والأيام كلها واليوم الأول لطول المحاضرة", full);
  const offered = oneLineCreateSeed(line("0109105 ن ر 10"), "501");
  check(offered.sectionCode === "501" && offered.start === "10:00" && offered.end === undefined, "B2 مقررٌ بلا شعبة: الشعبة التالية كما في المحرر، وبدايةٌ بلا نهاية", offered);
  const noCourse = oneLineCreateSeed(line("نورة 10"), "501");
  check(!noCourse.sectionCode && !noCourse.courseId && noCourse.instructorId === 11, "B3 بلا مقرر لا شعبةَ مقترحة", noCourse);
}

/* ── ج. القاعة من السجل الرسمي (القائمة هي الإذن) ── */
{
  const building = (id: string, officialCode: string, buildingNumber: string) =>
    ({ id, officialCode, buildingNumber, aliases: [], collegeIds: [1], sectionIds: [2], confidence: "CONFIRMED", evidence: [], active: true });
  const room = (id: string, buildingId: string, canonicalCode: string, extra: Record<string, unknown> = {}) =>
    ({ id, buildingId, buildingCode: "", canonicalCode, aliases: [], collegeIds: [1], sectionIds: [2], shared: false, active: true, confidence: "CONFIRMED", evidence: [], ...extra });
  const registry: any = {
    buildings: [building("b1", "901A01", "1"), building("b2", "901A02", "2")],
    rooms: [
      room("r101", "b1", "101"),
      room("r102", "b1", "102", { bookingPolicy: "companion_only" }),
      room("rF16", "b2", "F16"),
      room("r103", "b2", "103", { sectionIds: [7] }),
    ],
    borrowedRoomIds: [],
  };
  const scope = { collegeId: 1, sectionId: 2 };
  const exact = oneLinePlace(registry, "901A01", "101", scope);
  check(exact?.hallFound && exact.place.buildingId === "b1" && exact.place.AdRoomCode === "901A01" && exact.place.roomId === "r101"
    && exact.place.AdRoomHall === "101" && exact.place.locationStatus === "VERIFIED", "L1 مبنى وقاعة من قائمة القسم: سجلٌّ رسميٌّ موثَّق", exact);
  const companion = oneLinePlace(registry, "901A01", "102", scope);
  check(companion && !companion.hallFound && companion.place.buildingId === "b1" && !companion.place.roomId, "L2 قاعةٌ «مرفق مرافق فقط» لا تُحجز وحدها: يبقى المبنى", companion);
  check(!oneLinePlace(registry, "901A02", "103", scope)?.hallFound && oneLinePlace({ ...registry, borrowedRoomIds: ["r103"] }, "901A02", "103", scope)?.hallFound,
    "L3 قاعةُ قسمٍ آخر لا تُختار إلا باستعارةٍ معتمدة");
  const hallOnly = oneLinePlace(registry, "", "F16", scope);
  check(hallOnly?.hallFound && hallOnly.place.buildingId === "b2", "L4 القاعة وحدها تدلّ على مبناها حين تكون فريدة", hallOnly);
  check(oneLinePlace(registry, "999Z99", "1", scope) === null && oneLinePlace(null, "901A01", "101", scope) === null, "L5 مبنى غير معروف أو سجلٌّ لم يصل: لا شيء يُكتب");
  check(oneLinePlace({ buildings: [{ ...building("b1", "901A01", "1"), aliases: undefined }] as any, rooms: [] }, "901A01", "", scope)?.place.buildingId === "b1",
    "L6 سجلٌّ بلا أسماءٍ بديلة لا يُسقط القراءة");
}

/* ── د. الربط: اللوحة والمحرر ── */
const palette = read("src/components/CommandPalette.tsx");
const schedules = read("src/components/Schedules.tsx");
const preview = read("src/components/OneLinePreview.tsx");
const css = read("src/styles/43-one-line.css");
{
  check(/preview\?: React\.ReactNode;/.test(palette) && /dynamic\?: \(query: string, listed: number\) => ScheduleCommand\[\];/.test(palette),
    "W1 اللوحة: `dynamic(query, listed)` اختياري و`preview` على الأمر");
  check(/dynamic\(query, results\.length\)\.filter\(command => command\.visible !== false\)/.test(palette)
    && /const flat = useMemo\(\(\) => \(live\.length \? \[\.\.\.live, \.\.\.results\] : results\)/.test(palette),
    "W2 أوامر السطر فوق القائمة، وفهرسٌ واحد للوحة المفاتيح يمرّ بهما");
  check(/% flat\.length/.test(palette) && /const command = flat\[active\];/.test(palette) && !/results\[active\]/.test(palette), "W3 الأسهم وEnter على القائمة الموحّدة");
  check(palette.indexOf("{live.length ? (") > -1 && palette.indexOf("{live.length ? (") < palette.indexOf("groups.map(([group, list])"), "W4 صفُّ السطر يُرسم قبل المجموعات");
  check(/className=\{`cmdk-row cmdk-live-row/.test(palette) && /data-guide-ignore="أمرٌ صاغته اللوحة/.test(palette), "W5 زرُّ صفّ السطر جديدٌ وموثَّقٌ للمرشد");
  check(palette.includes('className={`cmdk-row ${command.enabled === false ? "is-off" : ""}`}')
    && palette.includes('{command.shortcut ? <kbd className="cmdk-shortcut">{command.shortcut}</kbd> : null}')
    && palette.includes("لا أمر بهذا الاسم.") && palette.includes('placeholder || "اكتب أمراً… مثل: أسبوع، تعارض، حفظ العرض"')
    && /command\.enabled === false\) return;/.test(palette) && /onClose\(\);\s*\/\/ After the window is gone/.test(palette),
    "W6 كل ما كان في اللوحة باقٍ: الصفوف والاختصارات والمطفأ والفارغ والنص الافتراضي وترتيب الإغلاق ثم التنفيذ");

  const seedType = schedules.slice(schedules.indexOf("type CreateSeed = {"), schedules.indexOf("type DecisionFingerprint"));
  check(/sectionCode\?: string;/.test(seedType), "E1 CreateSeed: `sectionCode`");
  const openCreate = schedules.slice(schedules.indexOf("const openCreate = (seed?: CreateSeed)"), schedules.indexOf("openEdit = (row: FSchedule)"));
  check(/const scope = createScope\(\);\s*next\.AdCollegeId = scope\.collegeId;\s*next\.AdSectionId = scope\.sectionId;\s*next\.AdTermId = scope\.termId;/.test(openCreate)
    && /const createScope = \(\) => \{[\s\S]{0,700}coerceScopeValues\(scopes, preferredCollege, preferredSection, isPowerAdmin\)[\s\S]{0,300}resolveScopeSelection\(scopes, scoped\.collegeId, isPowerAdmin\)\.defaultSectionId \|\| 0[\s\S]{0,80}termId: Number\(filterTerm\) \|\| 0/.test(schedules),
    "E2 قاعدةُ نطاق «جديد» واحدةٌ للمحرر وللسطر (createScope)");
  check(/if \(seed\?\.courseId\) \{\s*next\.AdCourseId = seed\.courseId;/.test(openCreate) && /if \(seed\?\.instructorId\) next\.AdInstructorId = seed\.instructorId;/.test(openCreate)
    && /if \(seed\?\.days\?\.length\) \{/.test(openCreate) && /if \(seed\?\.start\) \{\s*next\.fstarttime = seed\.start;/.test(openCreate)
    && /setCourseName\(seed\?\.courseId \? \(courseById\.get\(Number\(seed\.courseId\)\)\?\.CourseName \|\| ""\) : ""\);/.test(openCreate),
    "E3 openCreate يطبّق المقرر (واسمَه في المنتقي) والأستاذ والأيام والبداية كما كان");
  const cleared = openCreate.indexOf('next.SCode = "";'), seeded = openCreate.indexOf("if (seed?.sectionCode) next.SCode = seed.sectionCode;");
  check(cleared > -1 && seeded > cleared, "E4 الشعبة من السطر تُطبَّق بعد ما يمحوه بذرُ المقرر");

  check(/const oneLineOffered = commands\.some\(command => command\.id === "schedule\.create" && command\.visible !== false\);/.test(schedules)
    && /if \(!oneLineOffered\) return \[\];/.test(schedules), "E5 يُعرض حيث يُعرض «إضافة موعد» وحده");
  check(/parseOneLineAppointment\(query, \{\s*courses: oneLineCourses,\s*instructors: oneLineStaff,\s*window: \{ start: oneLineDay\.startTime, end: oneLineDay\.endTime \},/.test(schedules)
    && /if \(!offerOneLine\(reading, listed\)\) return \[\];/.test(schedules), "E6 القراءة على مقررات القسم وأساتذته ونافذة يومه");
  check(/AdInstructorStatus === "retired" \|\| person\.AdInstructorStatus === "sabbatical"/.test(schedules) && /visitingIds\.has\(id\) && !pickerVisitingRosterIds\.has\(id\)/.test(schedules),
    "E7 الأساتذة كما يعرضهم المنتقي: بلا متقاعد ولا متفرّغ ولا منتدبٍ خارج الفصل");
  check(/id: "schedule\.one-line",\s*group: "موعد جديد",\s*label: "أنشئ هذا الموعد",/.test(schedules) && /preview: <OneLinePreview reading=\{reading\} suggestedSection=\{suggested\} \/>/.test(schedules)
    && /execute: \(\) => openOneLine\(reading, suggested\)/.test(schedules), "E8 «أنشئ هذا الموعد» بصورته، وتنفيذه openOneLine");
  const opener = schedules.slice(schedules.indexOf("const openOneLine = async"), schedules.indexOf("const oneLineCommands = "));
  check(/openCreate\(seed\);/.test(opener) && /oneLineCreateSeed\(reading, suggested\)/.test(opener)
    && /nextSectionCode\(courseId, oneLineScope\.termId, null\)/.test(schedules), "E9 التنفيذ يمرّ من openCreate نفسه بالبذرة، والشعبة المقترحة من القاعدة نفسها");
  check(/regulationFit\(courseById\.get\(Number\(seed\.courseId \|\| 0\)\), seed\.days as RegDayKey\[\], seed\.start, seed\.end\) === "off"\) setTimingOverride\(true\);/.test(opener),
    "E10 نهايةٌ مكتوبة مدةٌ متعمَّدة (كالبطاقة السريعة)؛ والبداية وحدها يكملها النمط");
  check(/\/api\/location-registry\?/.test(opener) && /if \(editorRef\.current !== "create"\) return;/.test(opener) && /oneLinePlace\(registry, roomCode, roomHall/.test(opener)
    && /current\.buildingId \|\| current\.roomId \|\| current\.locationStatus/.test(opener), "E11 القاعة من سجلّ المنتقي نفسه، ولا تكتب فوق اختيارٍ قائم");
  check(/<CommandPalette\s+commands=\{commands\}\s+dynamic=\{oneLineCommands\}/.test(schedules), "E12 اللوحة تُعطى أوامر السطر");

  check(/countOf\(doubt!\.length, noun!\)/.test(preview) && /noun=\{AR\.course\}/.test(preview) && /noun=\{AR\.instructor\}/.test(preview), "V1 «؟» الالتباس بعددٍ من countOf");
  const order = ['tone="course"', 'tone="section"', 'tone="teacher"', "`ol-part ol-days", 'tone="time"', 'tone="room"'].map(token => preview.indexOf(token));
  check(order.every((at, i) => at > -1 && (i === 0 || at > order[i - 1])), "V2 الأجزاء الستة بترتيب المحرر: المقرر، الشعبة، الأستاذ، الأيام، الوقت، القاعة");
  check(!/<button/.test(preview) && /is-missing/.test(preview) && /"؟"/.test(preview), "V3 الصورة بلا أزرار داخل زرّ الصف، والناقص «؟»");

  check(css.length > 1500 && !/#[0-9a-fA-F]{3,8}\b/.test(css) && /color-mix\(in srgb,var\(--/.test(css) && /prefers-reduced-motion:reduce/.test(css)
    && /@media \(max-width:600px\)/.test(css) && /\.ol-part\.is-missing\{[^}]*border-style:dashed/.test(css),
    "V4 الأنماط رموزُ التصميم وحدها (الداكن)، والحركة تهدأ، والهاتف يلتفّ، والناقص متقطّع");

  const pkg = JSON.parse(read("package.json"));
  const suite = read("tests/suite.txt").split("\n").map(item => item.trim());
  check(pkg.scripts["test:one-line-appointment"] === "tsx tests/one-line-appointment-audit.ts" && suite.includes("test:one-line-appointment"), "Z1 في npm test");
}

console.log(`\none-line-appointment audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
