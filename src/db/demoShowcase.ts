/**
 * ── مشهد العرض: ما يشرحه العارضُ من أول مقرر في الجدول ───────────────────────
 *
 * بياناتٌ تجريبيةٌ حتميةٌ تُضاف إلى صندوق الديمو وحده (لا يقرؤها الحقيقي ولا يكتب فيها):
 *
 *   • أول مقرر في قائمة الجدول (رمزه الأصغر) «مقدمة في التعلم الرقمي»: في موعده تماماً — اليومُ والبدايةُ والنهاية —
 *     مقرران آخران من القسم، أحدهما بمستواه والآخر بمستوى مختلف. فتُرى في «موعد جديد» أنّ «في الوقت نفسه» ثلاثةٌ،
 *     وتُقدَّم «نفس المستوى» في ورقة الموعد (إجباريان بالمستوى نفسه في الصحيفة).
 *   • مثال المالك: «اللوحات» 12–16 الخميس، فموعدٌ لـ«الشفافيات» 11–15 يتداخل معه، ومعاً يفتحان «المجسمات والعرائس»
 *     (الصحيفة السابقة)؛ و«ورشة» بعد الظهر في الوقت المتداخل، مقررٌ عام خارج الصحائف كلها، فلا وسمَ له ولا تداخل.
 *   • توأمان (مقرنان) في الصحيفة الفعّالة:
 *       ١) «مقدمة في التعلم الرقمي» و«تطبيقات في التعلم الرقمي»: شعبةٌ واحدةٌ لكلٍّ وتتداخلان ← «يتداخل مع مقرنه»
 *          و«لا بديل».
 *       ٢) «مهارات البحث الرقمي» و«مصادر المعلومات الرقمية»: شعبةٌ لأولهما تتداخل مع شعبةٍ من الثاني، وللثاني
 *          شعبةٌ ثانيةٌ خاليةٌ من التداخل ← «توجد شعبة بديلة» والتنبيه يسكت.
 *   • سياسةُ التنقّل التجريبية ٦٠ دقيقة للأزواج الثلاثة، وكليةٌ باسم «الجهراء» في «مساري» التجريبي: موعدُها يلي موعداً
 *     رئيسياً بنصف ساعة فيُرى التلميح الهادئ (studentShowcase.ts).
 *
 * ملفٌّ خالصٌ بلا قراءةٍ ولا كتابة؛ يُختبر في tests/demo-showcase-audit.ts.
 */
import type { AdCourse, FSchedule } from "../types";

export const DEMO_SHOWCASE_TERM_ID = 1;
export const DEMO_SHOWCASE_SECTION_ID = 1;

/** مقرراتُ المشهد: [الرمز، الاسم، الساعات، السعة]. الرمزُ الأول أصغرُ رمزٍ في القسم فيتصدّر القائمة. */
export const DEMO_SHOWCASE_COURSES: ReadonlyArray<readonly [code: string, name: string, hours: number, max: number]> = [
  ["0109101", "مقدمة في التعلم الرقمي", 3, 40],
  ["0109102", "تطبيقات في التعلم الرقمي", 3, 40],
  ["0109103", "مهارات البحث الرقمي", 3, 40],
  ["0109104", "مصادر المعلومات الرقمية", 3, 40],
  ["0109201", "تصميم الواجهات التعليمية", 3, 40],
];
export const DEMO_SHOWCASE_TOP_CODE = "0109101";
/** مقررٌ عام ليس في أي صحيفة: يظهر بالتطابق التام صفّاً عادياً، ولا يُوسم بمستوى ولا بفتح. */
export const DEMO_SHOWCASE_GENERAL_COURSE = ["0109215", "ورشة إنتاج وسائل تعليمية خاصة", 3, 40] as const;
/** التوأمان في قاعدة الصحيفة (`coreq`): الأول بلا بديل، والثاني له شعبةٌ بديلة. */
export const DEMO_SHOWCASE_COREQ: ReadonlyArray<readonly [string, string]> = [["0109101", "0109102"], ["0109103", "0109104"]];
export const DEMO_SHOWCASE_COMPULSORY: ReadonlySet<string> = new Set(["0109101", "0109102"]);
/** مستوى كل مقرر من رقمه كالبقية (يُكتب في قاعدة الصحيفة). */
export const DEMO_SHOWCASE_LEVEL: Record<string, number> = { "0109101": 100, "0109102": 100, "0109103": 100, "0109104": 100, "0109201": 200 };

const THU = { fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: true };
const MON_WED = { fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false };

/** [رمز المقرر، الشعبة، الأيام، البداية، النهاية، القاعة، الأستاذ]. القاعاتُ والأساتذةُ لا يزاحمون أحداً في ساعتهم. */
export const DEMO_SHOWCASE_ROWS: ReadonlyArray<readonly [code: string, scode: string, days: typeof THU, start: string, end: string, hall: string, instructorId: number]> = [
  /* الخميس مئةٌ وسبعون دقيقة: نمطٌ معتمدٌ في مكتبة الأنماط (لا تنبيه «طولٌ خارج مكتبة الأنماط»). */
  ["0109101", "01", THU, "09:00", "11:50", "103", 9],
  ["0109102", "01", THU, "09:00", "11:50", "104", 10],
  ["0109201", "01", THU, "09:00", "11:50", "302", 11],
  ["0109103", "01", THU, "12:00", "14:50", "101", 7],
  ["0109104", "01", THU, "12:30", "15:20", "301", 10],
  ["0109104", "02", MON_WED, "15:30", "16:45", "104", 11],
  /* شعبةٌ بعد الظهر للمقرر الأخير: تُبقي نسبةَ الصباحية في الديمو كما كانت (71٪ فوق الحدّ، لاختبار تنبيه م.7/2). */
  ["0109201", "02", MON_WED, "14:00", "15:15", "103", 7],
  /* مثال المالك (0109258 مبذور في القسم) والورشة بجانبه. */
  ["0109258", "02", THU, "12:00", "16:00", "302", 11],
  ["0109215", "01", THU, "14:00", "15:15", "103", 9],
];

export function demoShowcaseCourses(firstId: number, collegeId: number): AdCourse[] {
  return [...DEMO_SHOWCASE_COURSES, DEMO_SHOWCASE_GENERAL_COURSE].map(([code, name, hours, max], index) => ({
    AdCourseId: firstId + index, AdCollegeId: collegeId, AdSectionId: DEMO_SHOWCASE_SECTION_ID,
    CourseCode: code, CourseName: name, CourseCredit: hours, CourseHours: hours, MaxStudent: max,
  }));
}

export function demoShowcaseRows(courses: readonly AdCourse[], firstRowId: number, collegeId: number, termId: number,
  hallFields: (hall: string) => Partial<FSchedule>): FSchedule[] {
  return DEMO_SHOWCASE_ROWS.map(([code, scode, days, start, end, hall, instructorId], index) => {
    const course = courses.find(item => item.CourseCode === code);
    if (!course) throw new Error(`مقرر المشهد غير موجود: ${code}`);
    return {
      id: firstRowId + index, AdCollegeId: collegeId, AdSectionId: DEMO_SHOWCASE_SECTION_ID, AdTermId: termId,
      AdCourseId: course.AdCourseId, AdCourseName: course.CourseName, SCode: scode, AdInstructorId: instructorId,
      ...days, fstarttime: start, fendtime: end, ...hallFields(hall), fdetail: "", rev: 0,
    } as FSchedule;
  });
}

/**
 * قواعدُ الصحيفة لمقررات المشهد: اختياريةٌ بلا مجموعة وبمستوى رمزها، والتوأمان في الاتجاه الأول فقط (قراءةُ الأزواج تكمّل الاتجاه).
 * اختياريةً لا إجبارية: الإجباريُّ يدخل «مرشَّح التسجيل» في رادار الديمو فيزيحُ طلبَ المقررات الضيّقة التي يعرضها الرادار.
 * إلا زوج «نفس المستوى» في المشهد (DEMO_SHOWCASE_COMPULSORY): إجباريان، فالمستوى لا يُقرأ إلا من إجباريَّين في صحيفة.
 */
export function demoShowcaseRules(idByCode: (code: string) => number) {
  return DEMO_SHOWCASE_COURSES.map(([code]) => {
    const twin = DEMO_SHOWCASE_COREQ.find(([first]) => first === code)?.[1];
    return {
      courseId: idByCode(code), kind: DEMO_SHOWCASE_COMPULSORY.has(code) ? "compulsory" as const : "elective" as const, level: DEMO_SHOWCASE_LEVEL[code],
      ...(twin ? { coreq: [idByCode(twin)] } : {}),
    };
  });
}

/* ── الجهراء: كليةٌ باسمٍ وهمي في «مساري» التجريبي ─────────────────────────────
 * «الجهراء» في الاسم يكفي ليُعرف الموقعُ (campusOf). في صندوق الإدارة قسمٌ وحيدٌ بقرارٍ (اختباراتُ النطاق الواحد)،
 * فلا كليةَ ثانيةً هناك؛ والحرمُ يُرى في «مساري» (studentShowcase.ts) وتُختبر قاعدتُه المشتركة في الاختبار نفسه. */
export const DEMO_JAHRA_COLLEGE_NAME = "كلية الدراسات التطبيقية - الجهراء (تجريبي)";

/** سياسةُ التنقّل التجريبية: ستون دقيقةً للأزواج الثلاثة، بالشكل الذي يحفظه الخادم (cleanTravelPolicy). */
export const DEMO_TRAVEL_MINUTES = 60;
export function demoTravelPolicyDoc() {
  const pairs: Record<string, { minutes: number; required: boolean }> = {};
  for (const key of ["fahaheel|jahra", "jahra|main", "fahaheel|main"]) pairs[key] = { minutes: DEMO_TRAVEL_MINUTES, required: false };
  return { pairs, exemptInstructorIds: [] as number[] };
}
