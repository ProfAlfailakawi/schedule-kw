/**
 * فحصُ جدول التسجيل (المقارنة النقيّة): كلُّ نوعٍ من النتائج على حدة —
 * مطابق، وخلل (الوقت/الأيام/القاعة/الأستاذ/شعبةٌ على طرفٍ واحد)، وما لم يُنفَّذ
 * (تعديلٌ بعد آخر إرسال ما زال الملف يعرض قديمه)، وما يحتاج نظراً (التباسٌ
 * ومطابقةٌ تقريبية وخانةٌ غير مؤكدة) — ثم الفراغ، والنطاق، وأنّ المقارنة لا تمسّ مدخلاتها.
 */
import { checkRegistrarPdf, slimPdfRow, type RegistrarCheckInput } from "../src/utils/registrarCheck";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail, null, 1).slice(0, 1500)); }
};

const names = {
  instructorById: new Map<number, string>([[7, "أحمد علي الصالح"], [8, "منى خالد العتيبي"], [9, "سعد فهد المطيري"]]),
  courseCodeById: new Map<number, string>([[1, "0109105"], [2, "0109106"], [3, "0109107"], [4, "0109205"], [5, "0209105"]]),
  courseNameById: new Map<number, string>([[1, "أسس التعلم"], [2, "تصميم التعليم"], [3, "الوسائط"], [4, "مقرر آخر"], [5, "مقرر بنهايةٍ واحدة"]]),
};
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
let nextId = 100;
const live = (course: number, section: string, days: number[], start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id: nextId++, AdCourseId: course, SCode: section, AdInstructorId: 7, AdRoomCode: "012B07", AdRoomHall: "A1",
  fstarttime: start, fendtime: end, ...Object.fromEntries(DAYS.map((key, i) => [key, days.includes(i)])), ...extra,
});
const pdf = (course: number, section: string, days: number[], start: string, end: string, extra: Record<string, unknown> = {}) => ({
  AdCourseId: course, sourceCourseCode: String(names.courseCodeById.get(course)).slice(-3), sourceSectionText: section, SCode: section,
  AdInstructorId: 7, sourceInstructorText: "", AdRoomCode: "012B07", AdRoomHall: "A1", sourcePage: 1, sourceReadMode: "pdf-text",
  fstarttime: start, fendtime: end, ...Object.fromEntries(DAYS.map((key, i) => [key, days.includes(i)])), ...extra,
});
const run = (input: Partial<RegistrarCheckInput>) => checkRegistrarPdf({ live: [], pdf: [], names, ...input });
const only = (result: ReturnType<typeof run>, group: string) => result.findings.filter(item => item.group === group);

/* ١) المطابق */
{
  const result = run({ live: [live(1, "1", [0, 2], "08:00", "09:15"), live(2, "2", [1, 3], "10:00", "11:15")], pdf: [pdf(1, "1", [0, 2], "08:00", "09:15"), pdf(2, "2", [1, 3], "10:00", "11:15")] });
  check(result.counts.matched === 2 && result.counts.mismatch === 0 && result.counts.notCarried === 0 && result.counts.review === 0, "جدولان متطابقان: كلّها مطابقة", result.counts);
  check(result.percent === 100, "النسبة ١٠٠٪ حين يتطابق كل شيء", result.percent);
  check(result.baseline.available === false, "بلا نسخةِ إرسال: الأساس غير متاح");
  const leading = run({ live: [live(1, "01", [0], "08:00", "09:00")], pdf: [pdf(1, "١", [0], "٠٨:٠٠", "٠٩:٠٠", { sourceCourseCode: "٠١٠٩١٠٥" })] });
  check(leading.counts.matched === 1, "الأصفار الزائدة في رقم الشعبة والأرقام الهندية والرمز الكامل لا تُحدث فرقاً", leading.findings);
}

/* ١-ب) هوية الشعبة: المرجعي ثم المطبوع ثم المولَّد */
{
  const viaCrn = run({ live: [live(1, "501", [0], "08:00", "09:00", { referenceNumber: "13319" })], pdf: [pdf(1, "3", [0], "08:00", "09:00", { SCode: "999", referenceNumber: "13319" })] });
  check(viaCrn.counts.matched === 1 && viaCrn.findings[0].section === "501", "المرجعي (CRN) يحسم الهوية ولو اختلف رقمُ الشعبة المطبوع والمولَّد", viaCrn.findings);
  const viaGenerated = run({ live: [live(1, "501", [0], "08:00", "09:00")], pdf: [pdf(1, "3", [0], "08:00", "09:00", { SCode: "501" })] });
  check(viaGenerated.counts.matched === 1, "ترقيم الاستيراد المولَّد (501) يطابق شعبتنا", viaGenerated.findings);
  const crnWrongCourse = run({ live: [live(1, "501", [0], "08:00", "09:00", { referenceNumber: "13319" })], pdf: [pdf(2, "7", [0], "08:00", "09:00", { SCode: "7", referenceNumber: "13319" })] });
  check(crnWrongCourse.counts.matched === 0 && crnWrongCourse.counts.mismatch + crnWrongCourse.counts.review >= 1, "مرجعيٌّ واحد لمقررٍ آخر لا يُعدّ مطابقاً", crnWrongCourse.findings);
  const crnNoCode = run({ live: [live(1, "501", [0], "08:00", "09:00", { referenceNumber: "13319" })], pdf: [pdf(1, "", [0], "08:00", "09:00", { sourceCourseCode: "", sourceSectionText: "", SCode: "", AdCourseId: 0, referenceNumber: "13319" })] });
  check(crnNoCode.counts.matched === 1, "المرجعيُّ وحده يكفي حين لم يُقرأ الرمز ولا الشعبة", crnNoCode.findings);
}

/* ٢) الخلل بحسب الخانة */
{
  const time = run({ live: [live(1, "1", [0, 2], "08:00", "09:15")], pdf: [pdf(1, "1", [0, 2], "09:00", "10:15")] });
  const f = only(time, "mismatch")[0];
  check(f?.kind === "fields" && f.fields.length === 1 && f.fields[0].field === "time" && f.fields[0].ours === "08:00–09:15" && f.fields[0].pdf === "09:00–10:15", "اختلاف الوقت: ما عندنا وما في الملف", f);
  check(typeof f?.scheduleId === "number" && f.scheduleId >= 100, "الخلل يحمل معرّف موعدنا لزر «افتح الموعد»", f);

  const days = run({ live: [live(1, "1", [0, 2], "08:00", "09:15")], pdf: [pdf(1, "1", [1, 3], "08:00", "09:15")] });
  check(only(days, "mismatch")[0]?.fields.map(x => x.field).join() === "days" && only(days, "mismatch")[0].fields[0].ours === "الأحد · الثلاثاء", "اختلاف الأيام بأسمائها", only(days, "mismatch"));

  const room = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdRoomHall: "B2" })] });
  check(only(room, "mismatch")[0]?.fields[0]?.field === "room", "اختلاف القاعة", only(room, "mismatch"));

  const instructor = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 8 })] });
  const inst = only(instructor, "mismatch")[0];
  check(inst?.fields[0]?.field === "instructor" && inst.fields[0].ours.includes("أحمد") && inst.fields[0].pdf.includes("منى"), "اختلاف الأستاذ بالاسمين", inst);

  const blank = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 0 })] });
  check(blank.counts.matched === 1, "عمود الأستاذ الفارغ في الملف «غير معروف» لا «تغيّر»", blank.findings);
  const placeholder = run({ names: { ...names, placeholderIds: new Set([35]) }, live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 35 })] });
  check(placeholder.counts.matched === 1 && placeholder.reading.notCompared.instructor === 1, "«هيئة تدريسية» في الملف ليست أستاذاً: لا يُحكم بها", placeholder.findings);
  const blankRoom = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdRoomCode: "", AdRoomHall: "" })] });
  check(blankRoom.counts.matched === 1, "قاعةٌ لم تُطبع لا تُعدّ خللاً", blankRoom.findings);

  const swap = run({
    live: [live(1, "1", [0], "08:00", "09:00"), live(1, "1", [1], "10:00", "11:00")],
    pdf: [pdf(1, "1", [0], "10:00", "11:00"), pdf(1, "1", [1], "08:00", "09:00")],
  });
  check(only(swap, "mismatch")[0]?.fields[0]?.field === "time", "تبديل وقتَي يومين يُقرأ خللاً لا «كما هو»", swap.findings);

  /* أيامٌ لم تُقرأ في الملف: الوقت والقاعة يبقيان قابلَين للمقارنة، والأيام تُعدّ «لم تُقارَن» لا مطابقة */
  const dayless = run({ live: [live(1, "1", [0, 2], "08:00", "09:15")], pdf: [pdf(1, "1", [], "09:00", "10:15")] });
  check(only(dayless, "mismatch")[0]?.fields.map(x => x.field).join() === "time" && dayless.reading.notCompared.days === 1, "أيامٌ لم تُقرأ: يُقارَن الوقت، وتُحصى الأيام «لم تُقارَن»", dayless);
  const printedRoom = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdRoomCode: "012B07", AdRoomHall: "", sourceRoomText: "105" })] });
  check(only(printedRoom, "mismatch")[0]?.fields[0]?.pdf.includes("105"), "قاعةٌ غير مسجّلة تُقارَن وتُعرض كما طُبعت", printedRoom.findings);

  const several = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "09:00", "10:00", { AdRoomHall: "Z9", AdInstructorId: 9 })] });
  check(only(several, "mismatch")[0]?.fields.length === 3, "عدّة خانات في بطاقة واحدة", only(several, "mismatch"));
}

/* ٣) شعبةٌ على طرفٍ واحد */
{
  const onlyPdf = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "1", [2], "10:00", "11:00")] });
  check(only(onlyPdf, "mismatch").length === 1 && only(onlyPdf, "mismatch")[0].kind === "onlyPdf" && onlyPdf.counts.matched === 1, "شعبةٌ في الملف وليست عندنا", onlyPdf.findings);
  const onlyOurs = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00")] });
  check(only(onlyOurs, "mismatch")[0]?.kind === "onlyOurs" && typeof only(onlyOurs, "mismatch")[0].scheduleId === "number", "شعبةٌ عندنا غابت عن الملف", onlyOurs.findings);
}

/* ٤) ما لم يُنفَّذ بعد الإرسال */
{
  const sent = [live(1, "1", [0, 2], "08:00", "09:15")];
  const now = [live(1, "1", [0, 2], "09:00", "10:15")];
  const stale = run({ live: now, sent, pdf: [pdf(1, "1", [0, 2], "08:00", "09:15")] });
  const f = only(stale, "notCarried")[0];
  check(f?.kind === "notChanged" && f.fields[0].field === "time" && f.fields[0].was === "08:00–09:15" && f.fields[0].ours === "09:00–10:15" && f.fields[0].pdf === "08:00–09:15", "تعديلٌ لم يُنفَّذ: القديم والمطلوب وما في الملف", f);
  check(stale.counts.mismatch === 0 && stale.baseline.available, "ولا يُحسب خللاً مرتين");

  const done = run({ live: now, sent, pdf: [pdf(1, "1", [0, 2], "09:00", "10:15")] });
  check(done.counts.matched === 1 && done.counts.notCarried === 0, "تعديلٌ نُفِّذ فعلاً: مطابق", done.findings);

  const other = run({ live: now, sent, pdf: [pdf(1, "1", [0, 2], "11:00", "12:15")] });
  check(only(other, "mismatch").length === 1 && only(other, "notCarried").length === 0, "ملفٌ يخالف القديم والجديد معاً: خللٌ لا «لم يُنفَّذ»", other.findings);

  const untouched = run({ live: [live(1, "1", [0], "08:00", "09:00")], sent: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "10:00", "11:00")] });
  check(only(untouched, "mismatch").length === 1 && only(untouched, "notCarried").length === 0, "ما لم نعدّله نحن وغيّره التسجيل: خلل", untouched.findings);

  const mixed = run({
    live: [live(1, "1", [0], "09:00", "10:00", { AdRoomHall: "A1" })], sent: [live(1, "1", [0], "08:00", "09:00", { AdRoomHall: "A1" })],
    pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdRoomHall: "Q7" })],
  });
  check(only(mixed, "notCarried")[0]?.fields[0]?.field === "time" && only(mixed, "mismatch")[0]?.fields[0]?.field === "room", "الشعبة نفسها: وقتٌ لم يُنفَّذ وقاعةٌ خلل في بطاقتين", mixed.findings);

  const notAdded = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], sent: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00")] });
  check(only(notAdded, "notCarried")[0]?.kind === "notAdded" && only(notAdded, "mismatch").length === 0, "شعبةٌ أُضيفت بعد الإرسال ولم تظهر", notAdded.findings);
  const addedAndShown = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], sent: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "1", [2], "10:00", "11:00")] });
  check(addedAndShown.counts.matched === 2, "شعبةٌ أُضيفت وظهرت: مطابقة", addedAndShown.findings);

  const notRemoved = run({ live: [live(1, "1", [0], "08:00", "09:00")], sent: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "1", [2], "10:00", "11:00")] });
  check(only(notRemoved, "notCarried")[0]?.kind === "notRemoved", "شعبةٌ حُذفت بعد الإرسال وما زالت في الملف", notRemoved.findings);
  const removedGone = run({ live: [live(1, "1", [0], "08:00", "09:00")], sent: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00")] });
  check(removedGone.counts.matched === 1 && removedGone.counts.notCarried === 0 && removedGone.counts.mismatch === 0, "حُذفت وغابت عن الملف: لا شيء", removedGone.findings);

  const instNot = run({ live: [live(1, "1", [0], "08:00", "09:00", { AdInstructorId: 8 })], sent: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 7 })] });
  check(only(instNot, "notCarried")[0]?.fields[0]?.field === "instructor", "أستاذٌ بُدّل ولم يُنفَّذ", instNot.findings);
}

/* ٥) «تحتاج نظرك»: لا تخمين */
{
  const noSection = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "", [2], "10:00", "11:00", { sourceSectionText: "", SCode: "" })] });
  check(only(noSection, "review").length === 1 && only(noSection, "review")[0].kind === "noKey" && only(noSection, "mismatch").length === 0, "صفٌّ بلا رقم شعبة: يُسأل عنه ولا يُحسب خللاً", noSection.findings);
  const noCode = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "1", [2], "10:00", "11:00", { sourceCourseCode: "", AdCourseId: 0, AdCourseName: "غير مقروء" })] });
  check(only(noCode, "review")[0]?.kind === "noKey", "صفٌّ بلا رمز مقرر: تحتاج نظرك", noCode.findings);

  /* الموعد نفسه برقم شعبةٍ آخر: نوعٌ مستقلٌّ في «تحتاج نظرك» بالرقمين، لا خللٌ ولا مطابقة. */
  const renumbered = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "5", [0], "08:00", "09:00")] });
  const rn = only(renumbered, "review")[0];
  check(rn?.kind === "renumbered" && rn.match === "fuzzy" && rn.fields.some(x => x.field === "section" && x.ours === "1" && x.pdf === "5") && renumbered.counts.matched === 0 && renumbered.counts.mismatch === 0, "الموعد نفسه برقم شعبةٍ مختلف: «تحتاج نظرك» برقمَيه لا مطابقٌ ولا خلل", renumbered.findings);

  /* بلا اتفاقٍ في الموعد يبقى المطابقةُ التقريبية بالمقرر وحده كما كانت. */
  const fuzzyOnly = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "5", [1], "10:00", "11:00")] });
  const fz = only(fuzzyOnly, "review")[0];
  check(fz?.kind === "fuzzy" && fuzzyOnly.counts.matched === 0 && fuzzyOnly.counts.mismatch === 0, "شعبةٌ بالمقرر نفسه ورقمٍ ووقتٍ مختلفين: مطابقةٌ تقريبية في «تحتاج نظرك»", fuzzyOnly.findings);

  /* إعادة ترقيمٍ متشابك: الأرقامُ تقع صدفةً على مواعيد غيرها، والمواعيدُ هي المعتبرة. */
  const rotated = run({
    live: [live(1, "6", [0, 2], "12:00", "12:50"), live(1, "7", [0, 2], "10:00", "10:50"), live(1, "10", [1, 3], "08:00", "09:20")],
    pdf: [pdf(1, "5", [0, 2], "10:00", "10:50"), pdf(1, "6", [0, 2], "12:00", "12:50"), pdf(1, "7", [1, 3], "08:00", "09:20")],
  });
  check(rotated.counts.mismatch === 0 && only(rotated, "mismatch").length === 0 && only(rotated, "review").length === 2 && only(rotated, "matched").length === 1, "ترقيمٌ مزاح: لا خللَ كاذب؛ المتطابقُ مطابق والمزاحُ «تحتاج نظرك»", rotated.findings.map(x => `${x.kind}:${x.section}`));
  const roomFirst = run({
    live: [live(1, "1", [0], "08:00", "09:00", { AdRoomCode: "012B08", AdRoomHall: "G20" }), live(1, "2", [0], "08:00", "09:00", { AdRoomCode: "012B08", AdRoomHall: "G26" })],
    pdf: [pdf(1, "8", [0], "08:00", "09:00", { AdRoomCode: "012B08", AdRoomHall: "G26" })],
  });
  const picked = only(roomFirst, "review").find(x => x.kind === "renumbered");
  check(picked?.fields.length === 1 && picked.fields[0].ours === "2", "عند تساوي الموعد تُقدَّم الشعبةُ المتفقة القاعة", roomFirst.findings.map(x => `${x.kind}:${x.section}:${x.fields.map(f => f.field)}`));
  const realChange = run({ live: [live(1, "6", [0, 2], "12:00", "12:50")], pdf: [pdf(1, "6", [0, 2], "14:00", "14:50")] });
  check(only(realChange, "mismatch")[0]?.kind === "fields", "الرقم نفسه والوقت مختلف ولا موعدَ يوافقه: يبقى خللاً حقيقياً", realChange.findings);

  const manySections = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(1, "2", [1], "08:00", "09:00")], pdf: [pdf(1, "9", [3], "13:00", "14:00")] });
  check(only(manySections, "review")[0]?.kind === "ambiguous" && manySections.counts.mismatch === 0, "المقرر له شعبٌ كثيرة والرقم غير موجود: التباس", manySections.findings);

  const byName = run({ live: [live(1, "3", [0], "08:00", "09:00")], pdf: [pdf(1, "3", [0], "08:00", "09:00", { sourceCourseCode: "999", AdCourseId: 0, AdCourseName: "أسس التعلم" })] });
  check(only(byName, "review")[0]?.kind === "fuzzy" && byName.counts.matched === 0, "الرمز لا يوافق والاسم يوافق: تقريبية في «تحتاج نظرك»", byName.findings);

  const collision = run({
    live: [live(1, "1", [0], "08:00", "09:00"), live(5, "1", [1], "08:00", "09:00")],
    pdf: [pdf(1, "1", [0], "08:00", "09:00")],
  });
  check(only(collision, "review")[0]?.kind === "ambiguous" && collision.counts.matched === 0, "مقرران بالرمز نفسه: لا يُحسم", collision.findings);

  const lowConfidence = run({
    live: [live(1, "1", [0], "08:00", "09:00")],
    pdf: [pdf(1, "1", [0], "09:00", "10:00", { sourceReadMode: "ocr-grid", importEvidence: { time: { confidence: "REVIEW" }, course: { confidence: "CONFIRMED" } } })],
  });
  check(only(lowConfidence, "review")[0]?.kind === "unreadable" && only(lowConfidence, "mismatch").length === 0 && lowConfidence.reading.uncertainRows === 1, "خانةٌ لم تُقرأ بيقين: لا خلل مُدّعى — تحتاج نظرك", lowConfidence.findings);
  const confident = run({
    live: [live(1, "1", [0], "08:00", "09:00")],
    pdf: [pdf(1, "1", [0], "09:00", "10:00", { sourceReadMode: "ocr-grid", importEvidence: { time: { confidence: "CONFIRMED" } } })],
  });
  check(only(confident, "mismatch").length === 1, "المقروءة بيقين تُحكم", confident.findings);

  const nameOnly = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 0, sourceInstructorText: "عبدالله الراشد" })] });
  check(only(nameOnly, "review")[0]?.fields[0]?.field === "instructor" && only(nameOnly, "mismatch").length === 0, "اسمٌ مطبوعٌ لم يُربط بسجل ولا يشبه اسمنا: تحتاج نظرك", nameOnly.findings);
  const nameSame = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 0, sourceInstructorText: "د. أحمد علي" })] });
  check(nameSame.counts.matched === 1, "اسمٌ مطبوعٌ يحتويه اسمنا: مطابق", nameSame.findings);
}

/* ٥-ب) الثقة قبل التساوي، والقاعة/الأستاذ لكل لقاء */
{
  const equalUncertain = run({
    live: [live(1, "1", [0], "08:00", "09:00")],
    pdf: [pdf(1, "1", [0], "08:00", "09:00", { sourceReadMode: "ocr-grid", importEvidence: { time: { confidence: "REVIEW_REQUIRED" } } })],
  });
  check(equalUncertain.counts.matched === 0 && equalUncertain.counts.review === 1 && equalUncertain.percent === 0, "وقتٌ مساوٍ لكن قراءته غير مؤكدة: تحتاج نظرك لا مطابق ولا ١٠٠٪", equalUncertain);
  const badIdentity = run({
    live: [live(1, "1", [0], "08:00", "09:00")],
    pdf: [pdf(1, "1", [0], "08:00", "09:00", { sourceReadMode: "ocr-grid", importEvidence: { section: { confidence: "REVIEW_REQUIRED" }, time: { confidence: "CONFIRMED" } } })],
  });
  check(badIdentity.counts.matched === 0 && only(badIdentity, "review")[0]?.kind === "unreadable", "رقم شعبة غير مؤكد: لا هويةٌ دقيقة", badIdentity.findings);
  const swapped = run({
    live: [live(1, "1", [0], "08:00", "09:00", { AdRoomHall: "A1", AdInstructorId: 7 }), live(1, "1", [1], "08:00", "09:00", { AdRoomHall: "B2", AdInstructorId: 8 })],
    pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdRoomHall: "B2", AdInstructorId: 8 }), pdf(1, "1", [1], "08:00", "09:00", { AdRoomHall: "A1", AdInstructorId: 7 })],
  });
  const fields = only(swapped, "mismatch")[0]?.fields.map(x => x.field).sort().join();
  check(swapped.counts.matched === 0 && fields === "instructor,room", "تبديل القاعة والأستاذ بين يومين خلل لا مطابق", swapped.findings);
}

/* ٦) الفراغ والنطاق */
{
  const emptyPdf = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [] });
  check(emptyPdf.empty === "pdfEmpty" && emptyPdf.percent === null, "ملفٌ بلا صفوف مقروءة: تُقال العلّة لا «كل شيء مطابق»", emptyPdf);
  const emptyLive = run({ live: [], pdf: [pdf(1, "1", [0], "08:00", "09:00")] });
  check(emptyLive.empty === "liveEmpty" && emptyLive.percent === null, "جدولٌ فارغ عندنا", emptyLive);
  const both = run({});
  check(both.empty === "both" && both.counts.total === 0, "لا شيء على الطرفين");
  const cross = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "1", [1], "08:00", "09:00", { scopeMismatchType: "CROSS_BRANCH" })] });
  check(cross.counts.matched === 1 && cross.counts.mismatch === 0 && cross.reading.outOfScopeRows === 1, "صفوف موقعٍ آخر من الفرع تُستبعد وتُعدّ ولا تُحسب خللاً", cross);
}

/* ٧) القراءة محضة */
{
  const deep = <T,>(value: T): T => { if (value && typeof value === "object") { Object.values(value as object).forEach(deep); Object.freeze(value); } return value; };
  const input = deep({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "09:00", "10:00")], sent: [live(1, "1", [0], "08:00", "09:00")] });
  let threw = false;
  try { checkRegistrarPdf({ ...input, names }); } catch { threw = true; }
  check(!threw, "المدخلات المجمّدة لا تُكتب: المقارنة لا تمسّها");
  const a = JSON.stringify(checkRegistrarPdf({ ...input, names })), b = JSON.stringify(checkRegistrarPdf({ ...input, names }));
  check(a === b, "النتيجة ثابتةٌ لمدخلٍ واحد");
  const slim = slimPdfRow({ ...pdf(1, "1", [0], "08:00", "09:00"), ocrLine: "x".repeat(5000), importEvidence: { time: { confidence: "CONFIRMED", reason: "y".repeat(900) }, foo: { confidence: "CONFIRMED" } } });
  check(!("ocrLine" in slim) && JSON.stringify(slim).length < 900 && !("foo" in (slim.importEvidence || {})), "الصف النحيف يقصّ الحقول والنصوص الطويلة");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
