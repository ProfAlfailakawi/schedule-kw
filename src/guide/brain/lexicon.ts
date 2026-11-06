/**
 * ── معجم الفهم ──
 *
 * يفهم العامية الكويتية والإنجليزية ويرجعهما إلى مفهومٍ واحد. هذا الفهم داخلي
 * فقط: لا يظهر شيء من هذا المعجم للمستخدم، فنصوص الواجهة فصحى دائماً.
 * كل سطر: المفهوم ثم كل ما يُقال عنه (بعد التطبيع).
 */
const RAW: Record<string, string> = {
  جدول: "جدول جداول جدولي جدولنا الجدول schedule timetable table",
  مقرر: "مقرر مقررات ماده مواد الماده كورس كورسات شعبه شعب سكشن course subject section lecture محاضره محاضرات حصه حصص class",
  قاعه: "قاعه قاعات غرفه غرف كلاس هول room hall rooms",
  مبني: "مبني مباني عماره عمارات بنايه building",
  استاذ: "استاذ اساتذه استاذه دكتور دكتوره دكاتره الدكتور مدرس مدرسين عضو اعضاء محاضر instructor teacher professor doctor dr",
  طالب: "طالب طلبه طلاب طالبه student students",
  فصل_دراسي: "فصل فصول ترم تيرم سمستر term semester",
  قسم: "قسم اقسام department",
  كليه: "كليه كليات college faculty",
  وقت: "وقت اوقات ساعه ساعات موعد مواعيد توقيت صبح صباح الصباح الصبح ظهر الظهر مساء time slot morning",
  نقل: "نقل انقل ينقل نقله اودي ودي اودي احول حول تحويل تحريك حرك move transfer اسحب سحب",
  تغيير: "تغيير غير يغير اغير بدل ابدل بدلي تبديل استبدال استبدل تعديل عدل اعدل عدلي change edit modify replace update swap",
  اضافه: "اضافه اضيف ضيف زود اضف نزل create add new انشاء انشي جديد",
  حذف: "حذف احذف امسح شيل مسح ازاله delete remove",
  بحث: "بحث ابحث دور ادور اللقي القي احصل search find look لقي",
  طباعه: "طباعه اطبع اطلع_ورق print pdf",
  تقرير: "تقرير تقارير report reports كشف",
  استعلام: "استعلام استعلامات query inquiry lookup",
  تصدير: "تصدير صدر اصدر نزل_ملف export excel اكسل download تنزيل",
  استيراد: "استيراد استورد ارفع رفع ملف import upload رفعت",
  نشر: "نشر انشر ينشر publish share مشاركه شارك",
  رابط: "رابط لنك link url",
  اعتماد: "اعتماد اعتمد اعتمدي approve approval موافقه وافق قبول اقبل accept",
  رفض: "رفض ارفض reject decline",
  ارجاع: "ارجاع ارجع رجع رد return send_back",
  تراجع: "تراجع ارجع_عن undo الغي الغاء ضيعت غلطت غلطه خطا rollback revert",
  استعاده: "استعاده استرجاع استرجع رجع_نسخه restore recover",
  نسخ: "نسخ انسخ copy duplicate",
  نسخه_احتياطيه: "احتياط احتياطيه باكب backup",
  تعارض: "تعارض تعارضات تداخل تداخلات تضارب تصادم تعارضت يتعارض clash conflict overlap",
  صلاحيات: "صلاحيات صلاحيه اذن اذونات permission permissions access رول role دور_مستخدم",
  مستخدم: "مستخدم مستخدمين يوزر يوزرات حساب حسابات موظف user users account",
  رغبات: "رغبات رغبه طلبات طلب تفضيلات يبي_يعدل wishes requests request preference",
  مقترح: "مقترح مقترحات عرض_مقترح اقتراح proposal offer",
  توقيع: "توقيع وقع اوقع sign signature",
  ارسال: "ارسال ارسل اسلم تسليم سلم ودز دز send submit",
  موعد_نهائي: "مهله ديدلاين deadline اخر_موعد",
  تمديد: "تمديد مدد extension اتمدد",
  ملاحظه: "ملاحظه ملاحظات تعليق تعليقات note comment notes",
  تجربه: "تجربه جرب اجرب جربي تدريب تمرين جرّب practice try sandbox simulation محاكاه",
  سيناريو: "سيناريو سيناريوهات ماذا_لو scenario whatif",
  طوارئ: "طوارئ معتذر اعتذر تعطلت خربت emergency",
  ذكاء: "ذكاء الذكاء ذكي intelligence ai",
  تركيز: "تركيز ركز هدوء تشتيت focus",
  نصاب: "نصاب النصاب حمل load عبء overload",
  دوام: "دوام الدوام بدايه_اليوم نهايه_اليوم working_hours hours",
  صحيفه: "صحيفه خطه_دراسيه الخطه plan مسبق مسبقات prerequisite",
  قائمه: "قائمه ليست list",
  اسبوع: "اسبوع اسبوعي الاسبوع week weekly",
  ازدحام: "ازدحام زحمه زحام مزدحم ضغط crowd congestion busy",
  تسجيل: "تسجيل سجل_الطلبه registration register",
  سجل: "سجل لوق سجلات log audit history تاريخ",
  فريق: "فريق فرق لجنه لجان رئيس_لجنه team committee",
  نطاق: "نطاق نطاقات scope",
  اعلان: "اعلان اعلانات دعايه بانر ads ad advertisement",
  جمهور: "جمهور زوار زيارات audience visitors",
  مرشد: "مرشد الدليل دليل مساعد المساعد guide helper help",
};

/** تسمية قديمة يكتبها الناس؛ تُفهم ولا تُعرض. */
const LEGACY = { synonyms: "كرسي كراسي" };
RAW.فريق += ` ${LEGACY.synonyms}`;

export const CONCEPT_OF = new Map<string, string>();
for (const [concept, words] of Object.entries(RAW)) {
  CONCEPT_OF.set(concept, concept);
  for (const word of words.split(/\s+/)) if (!word.includes("_")) CONCEPT_OF.set(word, concept);
}
/** عبارات متعددة الكلمات تُستبدل قبل التقطيع. */
export const PHRASES: Array<[RegExp, string]> = [
  [/ماذا لو|شنو لو|what if/g, "سيناريو"],
  [/اخر موعد|اخر تاريخ/g, "مهله"],
  [/رقم مدني|الرقم المدني/g, "بطاقه"],
  [/خطه دراسيه|الخطه الدراسيه/g, "صحيفه"],
  [/نسخه احتياطيه|نسخه احتياط|باك اب|back up/g, "احتياط"],
  [/عضو هيئه التدريس|اعضاء هيئه التدريس|هيئه التدريس/g, "استاذ"],
  [/ساعه الدوام|وقت الدوام|ساعات الدوام|بدايه الدوام|نهايه الدوام/g, "دوام"],
  [/مو راضي|ما يقبل|لا يقبل|ما يرضي|ما ينحفظ|مو قاعد/g, "مشكله"],
];

/** أفعال النية: يبحث عن كيف / أين / لماذا لترجيح نوع الجواب. */
export const INTENT_WORDS: Record<string, string> = {
  شلون:"how",كيف:"how",طريقه:"how",how:"how",خطوات:"how",
  وين:"where",اين:"where",فين:"where",where:"where",مكان:"where",
  ليش:"why",لماذا:"why",ليه:"why",why:"why",سبب:"why",
  شنو:"what",ماذا:"what",ما:"what",what:"what",معني:"what",
};

export const STOPWORDS = new Set("في من الي الى علي عن مع هذا هذه ذلك تلك هل او ان اذا لو هو هي انا نحن انت ابي ابغي اريد اود ودي يبي تبي ممكن لو_سمحت لاني كان كانت يكون بعد قبل ثم لكن بس جذي كذا هني هنا هناك شي شيء اي كل لازم ابيك عطني عطيني قولي قل وش لي لك عند عندي عندنا the a an to of in on for is are do does can i my me how what where why with please and or احدد اعرف اشوف افتح اسوي سوي اختار يسوي يشوف اقدر نقدر يقدر اخلي خلني خله استخدم ابدا طيب حق حقي حقه شي له لها see show want need get use".split(" "));

/** ما يخرج عن عالم البرنامج: سؤال عنه يُجاب بصدق أنه خارج ما يعرفه المرشد. */
export const OFF_TOPIC = /(?:^|\s)(?:ال)?(?:جو|طقس|حر|مطر|راتب|رواتب|معاش|مطعم|مطاعم|اكل|غدا|قصيده|شعر|نكته|مباراه|مباريات|كوره|سياره|زواج|فلم|فيلم|اغنيه|سفر|weather|salary|restaurant|poem|joke|match|football|movie)(?:\s|$)/;

/** أسئلة البيانات الحية: المرشد لا يقرأ البيانات، فيقول ذلك ويدل على الشاشة. */
export type LiveRoute = { pattern: RegExp; featureIds: string[] };
export const LIVE_ROUTES: LiveRoute[] = [
  { pattern: /(قاعه|هول|غرفه|room).*(فاضي|فارغ|متاح|free|empty|available|فاضيه|مشغول)|(فاضي|فارغ|فاضيه|free|empty).*(قاعه|هول|غرفه|room)/, featureIds:["page.searchRoomTime","page.searchRoom"] },
  { pattern: /(كم|عدد|how many|how much).*(ساعه|ساعات|نصاب|hours)/, featureIds:["page.teachingLoad","page.searchInstructor"] },
  { pattern: /(كم|عدد|how many).*(طالب|طلبه|طلاب|student)/, featureIds:["page.studentRegistration"] },
  { pattern: /(كم|عدد|how many).*(محاضر|شعب|شعبه|مقرر|ماده|مواد|lecture|course|class|section)/, featureIds:["intelligence.ask-table","page.searchInstructor"] },
  { pattern: /(كم|عدد|how many).*(تعارض|تداخل|clash|conflict)/, featureIds:["schedule.tool.review"] },
  { pattern: /(منو|من|who|مين)\s+(يدرس|يدرس|درس|teaches|عنده|عندها|يعطي|تدرس|في قاعه|بالقاعه)/, featureIds:["page.searchInstructor","intelligence.ask-table"] },
  { pattern: /(متي|وقت شنو|when).*(فاضي|فاضيه|متاح|free|محاضرته|محاضرتها)|(فاضي|فاضيه)\s*(الدكتور|الدكتوره|د |الاستاذ)/, featureIds:["page.searchInstructor"] },
  { pattern: /(جدول|محاضرات|محاضره)\s+(الدكتور|الدكتوره|دكتور|دكتوره|د|الاستاذ|استاذ|Dr)\s+\S+/, featureIds:["page.searchInstructor"] },
  { pattern: /(ما|شنو|شنهي|what).*(حاله|status).*(جدول|القسم|التسليم)\b.*(الان|الحين|now)?/, featureIds:["page.scheduleChanges"] },
];
