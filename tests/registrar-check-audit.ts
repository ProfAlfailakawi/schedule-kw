/**
 * فحصُ جدول التسجيل (المقارنة النقيّة): كلُّ نوعٍ من النتائج على حدة —
 * مطابق، وخلل (الوقت/الأيام/القاعة/الأستاذ/شعبةٌ على طرفٍ واحد)، وما لم يُنفَّذ
 * (تعديلٌ بعد آخر إرسال ما زال الملف يعرض قديمه)، وما يحتاج نظراً (التباسٌ
 * ومطابقةٌ تقريبية وخانةٌ غير مؤكدة) — ثم الفراغ، والنطاق، وأنّ المقارنة لا تمسّ مدخلاتها.
 */
import { checkRegistrarPdf, liveSectionTexts, namesAgree, slimPdfRow, type RegistrarCheckInput } from "../src/utils/registrarCheck";
import { buildRequestItems, settleSavedItems, isTheirs, notesCohort, notesProgress, theirFields, requestProgress, tickRequestItem, verifyRequestItems } from "../src/utils/registrarRequest";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail, null, 1).slice(0, 1500)); }
};

const names = {
  instructorById: new Map<number, string>([[7, "أحمد علي الصالح"], [8, "منى خالد العتيبي"], [9, "سعد فهد المطيري"], [10, "عبدالله عبدالعزيز عبدالله الرشيدي"], [11, "فهد بوحمد العلي"]]),
  courseCodeById: new Map<number, string>([[1, "0109105"], [2, "0109106"], [3, "0109107"], [4, "0109205"], [5, "0209105"], [6, "0109112"], [7, "0109114"]]),
  courseNameById: new Map<number, string>([[1, "أسس التعلم"], [2, "تصميم التعليم"], [3, "الوسائط"], [4, "مقرر آخر"], [5, "مقرر بنهايةٍ واحدة"], [6, "مقرر ١١٢"], [7, "مقرر ١١٤"]]),
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
  check(result.counts.matched === 2 && result.counts.mismatch === 0 && result.counts.notSent === 0 && result.counts.notApplied === 0 && result.counts.review === 0, "جدولان متطابقان: كلّها مطابقة", result.counts);
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

/* ١-ج) ملفُّ فرعٍ يطبع الشعبة بخانتين (01، 2) وجدولُنا 501، 502: الشعبةُ نفسها، لا «تحتاج نظرك» */
{
  const two = run({
    live: [live(1, "501", [1, 3], "11:00", "12:20"), live(1, "502", [1, 3], "12:30", "13:50"), live(6, "504", [1, 3], "17:00", "18:20")],
    pdf: [pdf(1, "01", [1, 3], "11:00", "12:20", { referenceNumber: "1825" }), pdf(1, "2", [1, 3], "12:30", "13:50", { referenceNumber: "1826" }), pdf(6, "04", [1, 3], "17:00", "18:20", { referenceNumber: "1241" })],
  });
  check(two.counts.matched === 3 && two.counts.review === 0 && two.counts.mismatch === 0, "شعبتُهم 01 و2 و04 هي شعبتنا 501 و502 و504: مطابقةٌ بلا «تحتاج نظرك»", two.findings);
  const ids = two.identities || [];
  check(ids.length === 3 && ids.every(item => item.certain && /^50\d$/.test(item.theirs.section) && item.theirs.crn), "وتُعرف بيقين فيُعتمد مرجعيُّها، ورقمُ شعبتنا لا يتغيّر", ids);
  const same = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(1, "501", [2], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00")] });
  check(same.findings.some(item => item.group === "matched" && item.section === "1"), "شعبةٌ عندنا برقم 1 نفسه تبقى هي النظير، لا 501", same.findings);
}

/* ١-د) قبلنا قاعتَهم: فرقٌ في تقريرٍ محفوظ يزول حين يصير جدولُنا كما في ملفهم، ولو لم تُحفظ صفوفُ الملف */
{
  const before = run({ live: [live(1, "501", [1, 3], "11:00", "12:20", { AdRoomHall: "G23", referenceNumber: "1825" }), live(2, "501", [0], "08:00", "09:00", { AdRoomHall: "G23", referenceNumber: "1900" })],
    pdf: [pdf(1, "501", [1, 3], "11:00", "12:20", { AdRoomHall: "G21", referenceNumber: "1825" }), pdf(2, "501", [0], "10:00", "11:00", { AdRoomHall: "G21", referenceNumber: "1900" })] });
  const saved = buildRequestItems(before);
  check(saved.length === 2 && saved[0].fields.some(f => f.field === "room"), "قبل التعديل: فرقُ القاعة بندٌ في التقرير", saved);
  const nowRows = [live(1, "501", [1, 3], "11:00", "12:20", { AdRoomHall: "G21", referenceNumber: "1825" }), live(2, "501", [0], "08:00", "09:00", { AdRoomHall: "G21", referenceNumber: "1900" })];
  const settled = settleSavedItems(saved, liveSectionTexts(nowRows, names));
  check(settled.gone === 1 && settled.items.length === 1, "بعد أن جعلنا قاعتَنا قاعتَهم: يزول البندُ الذي لم يبقَ فيه فرق", settled);
  check(settled.items[0].fields.map(f => f.field).join() === "time" && settled.items[0].since === "changed", "والبندُ الذي بقي فيه فرقُ الوقت يبقى بالوقت وحده", settled.items);
  const untouched = settleSavedItems(saved, liveSectionTexts([live(1, "501", [1, 3], "11:00", "12:20", { AdRoomHall: "G23", referenceNumber: "1825" }), live(2, "501", [0], "08:00", "09:00", { AdRoomHall: "G23", referenceNumber: "1900" })], names));
  check(untouched.gone === 0 && untouched.items.every(item => !item.since), "جدولٌ لم يتغيّر: التقريرُ كما حُفظ", untouched);
  check(settleSavedItems(saved, new Map()).items.length === 2, "شعبةٌ لا تُعرف في الجدول تبقى كما حُفظت");
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
  const f = only(stale, "notSent")[0];
  check(f?.kind === "notChanged" && f.fields[0].field === "time" && f.fields[0].was === "08:00–09:15" && f.fields[0].ours === "09:00–10:15" && f.fields[0].pdf === "08:00–09:15", "تعديلٌ بعد آخر إرسال والملف على القديم: «تعديل جديد لم يُرسل بعد» بالقديم والمطلوب", f);
  check(stale.counts.mismatch === 0 && stale.baseline.available, "ولا يُحسب خللاً مرتين");

  const done = run({ live: now, sent, pdf: [pdf(1, "1", [0, 2], "09:00", "10:15")] });
  check(done.counts.matched === 1 && done.counts.notSent === 0, "تعديلٌ نُفِّذ فعلاً: مطابق", done.findings);

  const other = run({ live: now, sent, pdf: [pdf(1, "1", [0, 2], "11:00", "12:15")] });
  check(only(other, "mismatch").length === 1 && only(other, "notSent").length === 0, "ملفٌ يخالف القديم والجديد معاً: خللٌ لا «لم يُنفَّذ»", other.findings);

  const untouched = run({ live: [live(1, "1", [0], "08:00", "09:00")], sent: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "10:00", "11:00")] });
  check(only(untouched, "mismatch").length === 1 && only(untouched, "notSent").length === 0, "ما لم نعدّله نحن وغيّره التسجيل: خلل", untouched.findings);

  const mixed = run({
    live: [live(1, "1", [0], "09:00", "10:00", { AdRoomHall: "A1" })], sent: [live(1, "1", [0], "08:00", "09:00", { AdRoomHall: "A1" })],
    pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdRoomHall: "Q7" })],
  });
  check(only(mixed, "notSent")[0]?.fields[0]?.field === "time" && only(mixed, "mismatch")[0]?.fields[0]?.field === "room", "الشعبة نفسها: وقتٌ لم يُنفَّذ وقاعةٌ خلل في بطاقتين", mixed.findings);

  const notAdded = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], sent: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00")] });
  check(only(notAdded, "notSent")[0]?.kind === "notAdded" && only(notAdded, "mismatch").length === 0, "شعبةٌ أُضيفت بعد الإرسال ولم تظهر", notAdded.findings);
  const addedAndShown = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], sent: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "1", [2], "10:00", "11:00")] });
  check(addedAndShown.counts.matched === 2, "شعبةٌ أُضيفت وظهرت: مطابقة", addedAndShown.findings);

  const notRemoved = run({ live: [live(1, "1", [0], "08:00", "09:00")], sent: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "1", [2], "10:00", "11:00")] });
  check(only(notRemoved, "notSent")[0]?.kind === "notRemoved", "شعبةٌ حُذفت بعد الإرسال وما زالت في الملف", notRemoved.findings);
  const removedGone = run({ live: [live(1, "1", [0], "08:00", "09:00")], sent: [live(1, "1", [0], "08:00", "09:00"), live(2, "1", [2], "10:00", "11:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00")] });
  check(removedGone.counts.matched === 1 && removedGone.counts.notSent === 0 && removedGone.counts.mismatch === 0, "حُذفت وغابت عن الملف: لا شيء", removedGone.findings);

  const instNot = run({ live: [live(1, "1", [0], "08:00", "09:00", { AdInstructorId: 8 })], sent: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 7 })] });
  check(only(instNot, "notSent")[0]?.fields[0]?.field === "instructor", "أستاذٌ بُدّل ولم يُنفَّذ", instNot.findings);
}

/* ٥) «تحتاج نظرك»: لا تخمين */
{
  const noSection = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "", [2], "10:00", "11:00", { sourceSectionText: "", SCode: "" })] });
  check(only(noSection, "review").length === 1 && only(noSection, "review")[0].kind === "noKey" && only(noSection, "mismatch").length === 0, "صفٌّ بلا رقم شعبة: يُسأل عنه ولا يُحسب خللاً", noSection.findings);
  const noCode = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "1", [0], "08:00", "09:00"), pdf(2, "1", [2], "10:00", "11:00", { sourceCourseCode: "", AdCourseId: 0, AdCourseName: "غير مقروء" })] });
  check(only(noCode, "review")[0]?.kind === "noKey", "صفٌّ بلا رمز مقرر: تحتاج نظرك", noCode.findings);

  /* الموعد نفسه برقم شعبةٍ آخر (بلا رقمٍ مرجعي): التسجيل يعيد الترقيم، فاختلاف الرقم وحده ليس فرقاً. */
  const renumbered = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "5", [0], "08:00", "09:00")] });
  const rn = only(renumbered, "matched")[0];
  check(renumbered.counts.matched === 1 && renumbered.counts.mismatch === 0 && renumbered.counts.review === 0 && rn?.section === "1" && rn.pdfSection === "5" && !rn.fields.length, "رقم شعبةٍ مختلف والموعد نفسه: مطابق، والرقمان يُحفظان بهدوء", renumbered.findings);
  const twins = run({ live: [live(1, "1", [0], "08:00", "09:00", { AdRoomHall: "" }), live(1, "2", [0], "08:00", "09:00", { AdRoomHall: "" })], pdf: [pdf(1, "7", [0], "08:00", "09:00", { AdRoomHall: "" })] });
  check(twins.counts.matched === 0 && only(twins, "review")[0]?.kind === "ambiguous", "موعدان متطابقان عندنا ورقمٌ غريب عندهم: لا تخمين", twins.findings.map(x => `${x.group}:${x.kind}`));

  /* بلا اتفاقٍ في الموعد يبقى المطابقةُ التقريبية بالمقرر وحده كما كانت. */
  const fuzzyOnly = run({ live: [live(1, "1", [0], "08:00", "09:00")], pdf: [pdf(1, "5", [1], "10:00", "11:00")] });
  const fz = only(fuzzyOnly, "review")[0];
  check(fz?.kind === "fuzzy" && fuzzyOnly.counts.matched === 0 && fuzzyOnly.counts.mismatch === 0, "شعبةٌ بالمقرر نفسه ورقمٍ ووقتٍ مختلفين: مطابقةٌ تقريبية في «تحتاج نظرك»", fuzzyOnly.findings);

  /* إعادة ترقيمٍ متشابك: الأرقامُ تقع صدفةً على مواعيد غيرها، والمواعيدُ هي المعتبرة. */
  const rotated = run({
    live: [live(1, "6", [0, 2], "12:00", "12:50"), live(1, "7", [0, 2], "10:00", "10:50"), live(1, "10", [1, 3], "08:00", "09:20")],
    pdf: [pdf(1, "5", [0, 2], "10:00", "10:50"), pdf(1, "6", [0, 2], "12:00", "12:50"), pdf(1, "7", [1, 3], "08:00", "09:20")],
  });
  check(rotated.counts.mismatch === 0 && rotated.counts.review === 0 && rotated.counts.matched === 3, "ترقيمٌ مزاح: لا خللَ كاذب، والمواعيدُ تُطابَق بمواعيدها", rotated.findings.map(x => `${x.kind}:${x.section}`));
  const roomFirst = run({
    live: [live(1, "1", [0], "08:00", "09:00", { AdRoomCode: "012B08", AdRoomHall: "G20" }), live(1, "2", [0], "08:00", "09:00", { AdRoomCode: "012B08", AdRoomHall: "G26" })],
    pdf: [pdf(1, "8", [0], "08:00", "09:00", { AdRoomCode: "012B08", AdRoomHall: "G26" })],
  });
  const picked = only(roomFirst, "matched")[0];
  check(picked?.section === "2" && picked.pdfSection === "8", "عند تساوي الموعد تُقدَّم الشعبةُ المتفقة القاعة", roomFirst.findings.map(x => `${x.kind}:${x.section}:${x.fields.map(f => f.field)}`));
  const realChange = run({ live: [live(1, "6", [0, 2], "12:00", "12:50")], pdf: [pdf(1, "6", [0, 2], "14:00", "14:50")] });
  check(only(realChange, "mismatch")[0]?.kind === "fields", "الرقم نفسه والوقت مختلف ولا موعدَ يوافقه: يبقى خللاً حقيقياً", realChange.findings);

  /* ملفُّهم فيه شعبتان من مقررٍ له عندنا شعبٌ كثيرة ولا موعدَ يحسم: كلتاهما «تحتاج نظرك»، لا «ليست عندكم». */
  const twoUnclear = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(1, "2", [1], "08:00", "09:00")], pdf: [pdf(1, "9", [3], "13:00", "14:00"), pdf(1, "8", [4], "13:00", "14:00")] });
  check(only(twoUnclear, "review").filter(x => x.kind === "ambiguous").length === 2 && !twoUnclear.findings.some(x => x.kind === "onlyPdf" || x.kind === "onlyOurs"), "صفّان ملتبسان بالمقرر نفسه: كلاهما «تحتاج نظرك»، ولا «ليست عندكم» ولا «غابت»", twoUnclear.findings.map(x => `${x.group}:${x.kind}:${x.section}`));
  const manySections = run({ live: [live(1, "1", [0], "08:00", "09:00"), live(1, "2", [1], "08:00", "09:00")], pdf: [pdf(1, "9", [3], "13:00", "14:00")] });
  check(only(manySections, "review")[0]?.kind === "ambiguous" && manySections.counts.mismatch === 0, "المقرر له شعبٌ كثيرة والرقم غير موجود: التباس", manySections.findings);

  const byName = run({ live: [live(1, "3", [0], "08:00", "09:00")], pdf: [pdf(1, "3", [0], "08:00", "09:00", { sourceCourseCode: "999", AdCourseId: 0, AdCourseName: "أسس التعلم" })] });
  check(only(byName, "mismatch")[0]?.kind === "misplaced" && byName.counts.matched === 0, "رمزٌ آخر والموعد والأستاذ أنفسهم: «ظهرت بخطأ»", byName.findings);
  const byNameOnly = run({ live: [live(1, "3", [0], "08:00", "09:00")], pdf: [pdf(1, "3", [2], "11:00", "12:00", { sourceCourseCode: "999", AdCourseId: 0, AdCourseName: "أسس التعلم" })] });
  check(only(byNameOnly, "review")[0]?.kind === "fuzzy" && byNameOnly.counts.matched === 0, "الرمز لا يوافق والاسم يوافق بلا موعد: تقريبية في «تحتاج نظرك»", byNameOnly.findings);

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
  check(badIdentity.counts.matched === 1, "رقم شعبة غير مؤكد لا يضرّ: الهويةُ بالمقرر والموعد لا بالرقم", badIdentity.findings);
  const badCourse = run({
    live: [live(1, "1", [0], "08:00", "09:00")],
    pdf: [pdf(1, "1", [0], "08:00", "09:00", { sourceReadMode: "ocr-grid", importEvidence: { course: { confidence: "REVIEW_REQUIRED" } } })],
  });
  check(badCourse.counts.matched === 0 && only(badCourse, "review")[0]?.kind === "unreadable", "رمز مقرر غير مؤكد: لا هويةٌ دقيقة", badCourse.findings);
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

/* ٨) الرقم المرجعي من مصدر تقرير التغييرات: هويةٌ لا يهزّها إعادةُ الترقيم */
{
  const crnOf = (pairs: Array<[{ id: number }, string]>) => new Map(pairs.map(([row, crn]) => [row.id, crn]));
  const a = live(1, "501", [0, 2], "08:00", "09:15", { referenceNumber: "11064" });
  const b = live(2, "502", [1, 3], "10:00", "11:15", { referenceNumber: "11065" });
  const renum = run({ live: [a, b], pdf: [pdf(1, "507", [0, 2], "08:00", "09:15", { referenceNumber: "2041" }), pdf(2, "501", [1, 3], "10:00", "11:15", { referenceNumber: "2026" })], crn: { byId: crnOf([[a, "2041"], [b, "2026"]]) } });
  check(renum.counts.matched === 2 && renum.findings.every(x => x.match === "crn") && renum.findings.find(x => x.crn === "2041")?.pdfSection === "507", "الرقم المرجعي يحسم الهوية، ورقمُ الشعبة المختلف (حتى المتقاطع) ليس فرقاً", renum.findings);
  check(renum.findings.find(x => x.crn === "2026")?.section === "502", "رقم الحقل في صفّنا (11064) لا يُستعمل حين يُمرَّر مصدر التقرير");

  /* رقمان مرجعيان ثابتان تبادلا الوقت: خللان في الوقت، لا «ترقيمٌ آخر» بلا فرق. */
  const s1 = live(1, "501", [0, 2], "08:00", "09:15"), s2 = live(1, "502", [0, 2], "10:00", "11:15");
  const swappedTimes = run({ live: [s1, s2], pdf: [pdf(1, "501", [0, 2], "10:00", "11:15", { referenceNumber: "2041" }), pdf(1, "502", [0, 2], "08:00", "09:15", { referenceNumber: "2042" })], crn: { byId: crnOf([[s1, "2041"], [s2, "2042"]]) } });
  const timeFaults = only(swappedTimes, "mismatch").filter(x => x.kind === "fields" && x.fields.some(f => f.field === "time"));
  check(timeFaults.length === 2 && swappedTimes.counts.matched === 0 && swappedTimes.counts.review === 0, "الرقمان المرجعيان أنفسهما والوقتان متبادلان: خللان في الوقت", swappedTimes.findings.map(x => `${x.group}:${x.kind}:${x.crn}`));
  const room = run({ live: [a], pdf: [pdf(1, "507", [0, 2], "08:00", "09:15", { referenceNumber: "2041", AdRoomHall: "Z9" })], crn: { byId: crnOf([[a, "2041"]]) } });
  const r = only(room, "mismatch")[0];
  check(r?.kind === "fields" && r.crn === "2041" && r.action === "edit" && r.fields.map(x => x.field).join() === "room", "فرق القاعة بالرقم المرجعي: بطاقةٌ واحدة «عدّلوا»", room.findings);

  /* أرسلناه ولم يُنفَّذ: الأصلُ 08:00، أرسلنا 09:00، وملفُّهم ما زال على الأصل. */
  const original = [{ ...pdf(1, "507", [0, 2], "08:00", "09:15"), referenceNumber: "2041" }];
  const now = live(1, "501", [0, 2], "09:00", "10:15");
  const sentNow = { ...now };
  const notApplied = run({ live: [now], sent: [sentNow], pdf: [pdf(1, "507", [0, 2], "08:00", "09:15", { referenceNumber: "2041" })], crn: { byId: crnOf([[now, "2041"]]), original } });
  check(only(notApplied, "notApplied")[0]?.fields[0]?.field === "time" && notApplied.counts.mismatch === 0 && notApplied.counts.notSent === 0, "أرسلنا الوقت الجديد وما زال ملفُّهم على الأصل: «أرسلناه ولم يُنفَّذ»", notApplied.findings);
  /* تعديلٌ جديد لم يُرسل: أرسلنا 09:00 وملفُّهم 09:00، ثم غيّرناه إلى 10:00. */
  const newer = { ...now, fstarttime: "10:00", fendtime: "11:15" };
  const notSent = run({ live: [newer], sent: [sentNow], pdf: [pdf(1, "507", [0, 2], "09:00", "10:15", { referenceNumber: "2041" })], crn: { byId: crnOf([[newer, "2041"]]), original } });
  check(only(notSent, "notSent")[0]?.fields[0]?.was === "09:00–10:15" && notSent.counts.notApplied === 0 && notSent.counts.mismatch === 0, "تعديلٌ بعد آخر إرسال: «تعديل جديد لم يُرسل بعد» لا لومٌ عليهم", notSent.findings);

  /* حذفٌ طلبناه وما زال، وحذفٌ جديد لم يُرسل. */
  const gone = [{ ...pdf(2, "502", [1], "10:00", "11:00"), referenceNumber: "3000" }];
  const askedDelete = run({ live: [now], sent: [sentNow], pdf: [pdf(1, "507", [0, 2], "09:00", "10:15", { referenceNumber: "2041" }), pdf(2, "509", [1], "10:00", "11:00", { referenceNumber: "3000" })], crn: { byId: crnOf([[now, "2041"]]), original: [...original, ...gone] } });
  const del = only(askedDelete, "notApplied")[0];
  check(del?.kind === "notRemoved" && del.crn === "3000" && del.action === "delete", "حذفٌ أرسلناه ولم يُنفَّذ: «احذفوا» برقمه المرجعي", askedDelete.findings);
  const removedLater = { ...live(2, "502", [1], "10:00", "11:00"), id: 777 };
  const newDelete = run({ live: [now], sent: [sentNow, removedLater], pdf: [pdf(1, "507", [0, 2], "09:00", "10:15", { referenceNumber: "2041" }), pdf(2, "509", [1], "10:00", "11:00", { referenceNumber: "3000" })], crn: { byId: new Map([[now.id, "2041"], [777, "3000"]]), original: [...original, ...gone] } });
  check(only(newDelete, "notSent")[0]?.kind === "notRemoved", "حذفٌ بعد آخر إرسال: «لم يُرسل بعد»", newDelete.findings);

  /* رقمُنا المرجعي غاب عن ملفهم: يُبحث بالموعد، ويُنبَّه إلى الرقم الجديد. */
  const moved = run({ live: [now], pdf: [pdf(1, "507", [0, 2], "09:00", "10:15", { referenceNumber: "9999" })], crn: { byId: crnOf([[now, "2041"]]), original } });
  check(only(moved, "review")[0]?.kind === "crnChanged" && moved.counts.mismatch === 0, "رقمٌ مرجعيٌّ غاب ووُجدت الشعبة برقمٍ جديد: «تحتاج نظرك»", moved.findings);
  const vanished = run({ live: [now], pdf: [pdf(4, "1", [3], "13:00", "14:00", { referenceNumber: "5555" })], crn: { byId: crnOf([[now, "2041"]]), original } });
  check(only(vanished, "mismatch").some(x => x.kind === "onlyOurs" && x.crn === "2041" && x.action === "add"), "رقمٌ مرجعيٌّ غاب ولا نظير له: يُطلب", vanished.findings);
}

/* ٩) إضافةٌ ظهرت عندهم بمقررٍ آخر أو يومٍ آخر */
{
  const ours114 = live(7, "501", [0, 2], "08:00", "09:15", { AdInstructorId: 9 });
  const added = live(6, "502", [1, 3], "11:00", "12:20", { AdInstructorId: 8 });
  const theirs = [pdf(7, "501", [0, 2], "08:00", "09:15", { referenceNumber: "2041", AdInstructorId: 9 }), pdf(7, "504", [1, 3], "11:00", "12:20", { referenceNumber: "10212", AdInstructorId: 8 })];
  const res = run({ live: [ours114, added], sent: [ours114, added], pdf: theirs, crn: { byId: new Map([[ours114.id, "2041"], [added.id, ""]]), original: [{ ...theirs[0] }] } });
  const m = only(res, "mismatch")[0];
  check(m?.kind === "misplaced" && m.crn === "10212" && m.fields.some(x => x.field === "course" && x.ours.includes("0109112") && x.pdf.includes("0109114")) && m.action === "edit", "إضافتنا 112 ظهرت عندهم 114 برقم 10212: «ظهرت بخطأ» بالمقرر", res.findings);
  check(res.counts.matched === 1 && !only(res, "mismatch").some(x => x.kind === "onlyOurs" || x.kind === "onlyPdf"), "ولا تُعدّ إضافةً مفقودة ولا شعبةً زائدة", res.findings);
  const wrongDay = run({ live: [added], pdf: [pdf(6, "504", [0, 2], "11:00", "12:20", { AdInstructorId: 8 })] });
  check(only(wrongDay, "mismatch")[0]?.kind === "misplaced" && only(wrongDay, "mismatch")[0].fields.some(x => x.field === "days"), "إضافةٌ ظهرت بيومٍ آخر: «ظهرت بخطأ» بالأيام", wrongDay.findings);
  const two = run({ live: [added], pdf: [pdf(7, "504", [1, 3], "11:00", "12:20", { AdInstructorId: 8 }), pdf(4, "505", [1, 3], "11:00", "12:20", { AdInstructorId: 8 })] });
  check(only(two, "review")[0]?.kind === "ambiguous" && !only(two, "mismatch").some(x => x.kind === "misplaced"), "شبيهان بالوقت والأستاذ: لا تخمين — «تحتاج نظرك»", two.findings);
  const noTeacher = run({ live: [added], pdf: [pdf(7, "504", [1, 3], "11:00", "12:20", { AdInstructorId: 0 })] });
  check(!noTeacher.findings.some(x => x.kind === "misplaced"), "بلا أستاذٍ مطبوع لا دليلَ على أنها إضافتنا", noTeacher.findings);
}

/* ١٠) الأسماء المقصوصة والألقاب و«بو» */
{
  check(namesAgree("عبدالله عبدالعزيز عبدالله ال", "عبدالله عبدالعزيز عبدالله الرشيدي"), "الاسم المقصوص يوافق الكامل");
  check(namesAgree("أ.د. فهد بو حمد", "فهد بوحمد العلي") && namesAgree("د.فهد بوحمد", "فهد بو حمد"), "«بو حمد» = «بوحمد» والألقاب لا تُحسب");
  check(namesAgree("عبد الله الصالح", "عبدالله الصالح"), "«عبد الله» = «عبدالله»");
  check(!namesAgree("فهد", "فهد بوحمد") && !namesAgree("فهد بوحمد", "فهد العلي"), "الاسم الأول وحده لا يكفي، واسمان مختلفان لا يتفقان");
  const truncated = run({ live: [live(1, "1", [0], "08:00", "09:00", { AdInstructorId: 10 })], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 0, sourceInstructorText: "عبدالله عبدالعزيز عبدالله ال" })] });
  check(truncated.counts.matched === 1, "اسمٌ مقصوص في الملف: مطابق لا «تحتاج نظرك»", truncated.findings);
  const wrongLink = run({ live: [live(1, "1", [0], "08:00", "09:00", { AdInstructorId: 11 })], pdf: [pdf(1, "1", [0], "08:00", "09:00", { AdInstructorId: 9, sourceInstructorText: "د. فهد بو حمد" })] });
  check(wrongLink.counts.matched === 1, "قارئٌ ربط الاسم المقصوص بشخصٍ آخر، والمطبوعُ يوافق أستاذنا: مطابق", wrongLink.findings);
}

/* ١١) طلبُ التعديل: البنود والشطب والتحقق الذاتي */
{
  const a = live(1, "501", [0], "08:00", "09:00");
  const b = live(2, "502", [1], "10:00", "11:00");
  const first = run({ live: [a, b], pdf: [pdf(1, "507", [0], "08:00", "09:00", { referenceNumber: "2041", AdRoomHall: "Z9" }), pdf(3, "509", [3], "12:00", "13:00", { referenceNumber: "3000" })], crn: { byId: new Map([[a.id, "2041"], [b.id, ""]]) } });
  const items = buildRequestItems(first);
  check(items.map(x => x.action).join() === "edit,add,delete" && items[0].crn === "2041" && items[2].crn === "3000", "بنود الطلب: عدّلوا ثم أضيفوا ثم احذفوا، ومفتاحها الرقم المرجعي", items);
  check(!JSON.stringify(items).includes("Civil"), "لا رقمَ مدنيّاً في البنود");
  const actor = { by: 5, byName: "موظف التسجيل", at: "2026-11-19T08:00:00Z" };
  let ticked = tickRequestItem(items, items[0].id, true, actor)!;
  ticked = tickRequestItem(ticked, items[2].id, true, actor)!;
  check(requestProgress(ticked).done === 2 && requestProgress(ticked).total === 3 && ticked[0].done?.byName === "موظف التسجيل", "الشطب باسمه ووقته، والتقدّم ٢ من ٣");
  check(tickRequestItem(items, "edit:#nope", true, actor) === null, "بندٌ غير موجود لا يُشطب");
  check(!tickRequestItem(ticked, items[0].id, false, actor)![0].done, "رفعُ الشطب");
  /* الملف التالي: القاعة صُحّحت (2041)، والمحذوفة (3000) ما زالت. */
  const second = run({ live: [a, b], pdf: [pdf(1, "507", [0], "08:00", "09:00", { referenceNumber: "2041" }), pdf(3, "509", [3], "12:00", "13:00", { referenceNumber: "3000" })], crn: { byId: new Map([[a.id, "2041"], [b.id, ""]]) } });
  const verified = verifyRequestItems(ticked, second, "2026-11-20T08:00:00Z");
  check(verified.confirmed === 1 && verified.reopened === 1 && verified.items[0].state === "confirmed" && verified.items[2].state === "reopened" && !verified.items[2].done && verified.items[2].lastDone?.by === 5, "الملف التالي: ما ظهر «تأكّد»، وما لم يظهر يعود «شُطب ولم يظهر في الملف»", verified.items);
  check(verified.items[1].state === undefined && !verified.items[1].done, "البند غير المشطوب لا يمسّه التحقق");
  check(requestProgress(verified.items).confirmed === 1 && requestProgress(verified.items).reopened === 1, "التقدّم يعدّ المؤكَّد والعائد");
  /* بلا دليلٍ موجب (حقلٌ لم يُقرأ فلا بندَ ولا مطابقة): البندُ المفتوح لا يتأكّد. */
  const noEvidence = verifyRequestItems(items, { findings: [], empty: undefined as any }, "x");
  check(noEvidence.items[0].state === undefined && noEvidence.items[1].state === undefined, "بلا مطابقةٍ مقروءة لا يتأكّد بندُ تعديلٍ ولا إضافةٍ مفتوح");
  const openOk = verifyRequestItems(items, second, "2026-11-20T08:00:00Z");
  check(openOk.items[0].state === "confirmed" && !openOk.items[0].done && openOk.items[2].state === undefined, "البندُ المفتوح يتأكّد بمطابقةٍ مقروءة بلا شطب، والمحذوفُ الباقي لا يتأكّد");
  /* ملاحظاتهم: «أُرسل ولم يُنفَّذ» وحدها، وتقدّمُها يعدّ المتأكَّد. */
  const mine = items.filter(isTheirs);
  check(mine.length === items.filter(x => x.group === "notApplied").length && items.every(x => isTheirs(x) === (x.group === "notApplied")), "ملاحظاتهم هي group=notApplied وحدها");
  /* أصلُ كل حقل: بندٌ دُمجت فيه نتيجتان يُخرج للتسجيل ما أُرسل ولم يُنفَّذ وحده. */
  const merged: any = { id: "edit:#1", action: "edit", group: "notApplied", courseCode: "1", courseName: "x", section: "1", fields: [
    { field: "room", label: "القاعة", ours: "A", pdf: "B", group: "notApplied" }, { field: "time", label: "الوقت", ours: "1", pdf: "2", group: "notSent" }] };
  check(isTheirs(merged) && theirFields(merged).length === 1 && theirFields(merged)[0].field === "room", "تقصيرُهم على مستوى الحقل: القاعة وحدها، لا تعديلُنا بعد الإرسال");
  check(buildRequestItems(second).every(item => item.fields.every(f => f.group !== undefined)), "كل حقلٍ في البند يحمل أصلَه");
  /* دفعةُ المتابعة عبر الفحوص: لا تضيع بحفظ فحصٍ أحدث. */
  const doc = (at: string, list: any[]): any => ({ id: at, at, items: list });
  const it = (id: string, state?: string): any => ({ id, group: "notApplied", fields: [], ...(state ? { state } : {}) });
  const c1 = notesCohort([doc("2026-11-20", [it("b")]), doc("2026-11-10", [it("a", "confirmed"), it("b")])]);
  check(c1.total === 2 && c1.confirmed === 1 && c1.open === 1, "فحصٌ أحدث يحمل الباقي وحده: «زال ١ من ٢ وبقي ١»", c1);
  const c2 = notesCohort([doc("2026-11-20", [it("z")]), doc("2026-11-10", [it("a"), it("b")])]);
  check(c2.total === 3 && c2.confirmed === 2 && c2.open === 1, "ما غاب من آخر فحصٍ زال، وما جدّ مفتوح", c2);
  check(notesCohort([doc("2026-11-20", []), doc("2026-11-10", [it("a")])]).open === 0, "آخرُ فحصٍ بلا ملاحظاتهم يُغلق الدفعة");
  const np = notesProgress(verified.items);
  check(np.total === mine.length && np.confirmed + np.open === np.total, "تقدّمُ الملاحظات: المتأكَّد والمفتوح يجمعان المجموع");
  const blank = verifyRequestItems(ticked, { findings: [], empty: "pdfEmpty" }, "x");
  check(blank.confirmed === 0 && blank.reopened === 0, "ملفٌّ لم يُقرأ منه شيء لا يُثبت ولا ينفي");
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
