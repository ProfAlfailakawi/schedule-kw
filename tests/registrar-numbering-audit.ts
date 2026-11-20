/**
 * ترقيم التسجيل (دوالّ نقيّة): الرقم المطبوع في الاستيراد، والرقم التالي بلا ملء فراغ
 * ولا عودةِ رقمٍ محذوف، وخطة «اعتمد ترقيم التسجيل» (اليقين، والتخطّي، والتصادم).
 */
import { assignAuthoritySections, authoritySectionUncertain, printedAuthoritySection } from "../src/utils/authorityAcademicCodes";
import { awaitingRegistrarNumber, mergeLedgersFromRows, nextCourseSection, nextSectionNumber, planRegistrarNumbering, recordSectionNumbers, sectionNumberOf } from "../src/utils/registrarNumbering";
import { checkRegistrarPdf, looksForeign, type RegistrarIdentity } from "../src/utils/registrarCheck";
import { nextCourseSectionCode } from "../src/utils/nextCourseSectionCode";
import { nextSectionCodeFrom } from "../src/utils/studyProposal";
import { roleWriteDecision } from "../src/server/roleGuard";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail, null, 1).slice(0, 1500)); }
};

/* ١) الاستيراد: ملفٌّ من طبقة النص يحفظ الرقم المطبوع والمرجعي، والمسح يولّد */
{
  const text = (order: number, course: number, section: string, crn: string, extra: Record<string, unknown> = {}) =>
    ({ sourceOrder: order, AdCourseId: course, sourceSectionText: section, referenceNumber: crn, sourceReadMode: "pdf-text", SCode: "", ...extra });
  const rows = assignAuthoritySections([text(1, 1, "529", "2095"), text(2, 1, "503", "2071"), text(3, 2, "501", "2163")]);
  check(rows.map(r => r.SCode).join() === "529,503,501", "طبقة النص: الرقم المطبوع يبقى رقم الشعبة (بلا إعادة ترقيم)", rows);
  check(rows.map(r => r.referenceNumber).join() === "2095,2071,2163", "والرقم المرجعي المطبوع يبقى كما هو");
  check(rows.every(r => !authoritySectionUncertain(r)), "ولا علامة «رقم غير مؤكد» على المطبوع");

  const twoLines = assignAuthoritySections([text(1, 1, "506", "2041"), text(2, 1, "506", "2041", { fmonday: true })]);
  check(twoLines.every(r => r.SCode === "506"), "شعبةٌ بموعدين (مرجعيٌّ واحد) شعبةٌ واحدة برقمها المطبوع", twoLines);

  const collide = assignAuthoritySections([text(1, 1, "505", "2001"), text(2, 1, "505", "2002"), text(3, 1, "507", "2003")]);
  check(collide[2].SCode === "507" && collide[0].SCode === "508" && collide[1].SCode === "509", "رقمٌ مطبوع تكرّر لشعبتين: يُولَّد لهما بعد أكبر رقمٍ مطبوع، ويبقى غيرُه", collide);
  check(collide[0].SCode !== collide[1].SCode && authoritySectionUncertain(collide[0]) && authoritySectionUncertain(collide[1]) && !authoritySectionUncertain(collide[2]), "والمولَّدان «رقم غير مؤكد» للمراجعة");

  const scan = assignAuthoritySections([
    { sourceOrder: 1, AdCourseId: 1, sourceSectionText: "1504", referenceNumber: "13319", sourceReadMode: "ocr-grid", SCode: "" },
    { sourceOrder: 2, AdCourseId: 1, sourceSectionText: "503", referenceNumber: "13320", sourceReadMode: "ocr-grid", SCode: "" },
  ]);
  check(scan.map(r => r.SCode).join() === "501,502", "المسح (OCR): الترقيم المولَّد 501، 502 بترتيب الظهور", scan);
  check(scan.every(r => authoritySectionUncertain(r)), "والمسح كله «رقم غير مؤكد»");
  check(printedAuthoritySection({ sourceReadMode: "pdf-text", sourceSectionText: "01" }) === "", "رقمٌ مطبوع خارج 501–999 (01) لا يُحفظ");
  const outOfRange = assignAuthoritySections([text(1, 1, "01", "1"), text(2, 1, "02", "2")]);
  check(outOfRange.map(r => r.SCode).join() === "501,502", "ويولَّد له 501…", outOfRange);
  const noCourse = assignAuthoritySections([text(1, 0, "529", "1")]);
  check(noCourse[0].SCode === "", "مقررٌ لم تثبت هويته لا يُعطى شعبة");
  const generatedAfterPrinted = assignAuthoritySections([text(1, 1, "", "9"), text(2, 1, "540", "10")]);
  check(generatedAfterPrinted[0].SCode === "541" && generatedAfterPrinted[1].SCode === "540", "المولَّد في ملفٍّ مطبوع يبدأ بعد أكبر مطبوع فلا يصطدم به", generatedAfterPrinted);
}

/* ٢) الرقم التالي: بعد الأكبر، بلا ملء فراغ، ولا يعود رقمٌ محذوف */
{
  check(nextSectionNumber([]) === "501", "لا شعب ⇒ 501");
  check(nextSectionNumber([501, 503]) === "504", "بلا ملء فراغ: 501 و503 ⇒ 504");
  check(nextSectionNumber([501, 502], 506) === "507", "سجلّ الفصل (506 حُذفت) يمنع عودتها ⇒ 507");
  check(nextSectionNumber(["01", "22", 1001]) === "501", "أرقامٌ خارج المدى لا تُبنى عليها");
  check(sectionNumberOf("٥٢٩") === 529 && sectionNumberOf("1504") === null, "الأرقام الهندية تُقرأ، وما خرج عن المدى يُهمل");
  const ledger = recordSectionNumbers({ "9": 505 }, [{ AdCourseId: 9, SCode: "503" }, { AdCourseId: 9, SCode: "507" }, { AdCourseId: 4, SCode: "529" }]);
  check(ledger["9"] === 507 && ledger["4"] === 529, "السجلّ يكبر ولا ينقص", ledger);
  check(recordSectionNumbers(ledger, [{ AdCourseId: 9, SCode: "501" }])["9"] === 507, "رقمٌ أصغر لا يُنقص السجلّ");
  const rows = [{ id: 1, AdCourseId: 9, AdTermId: 2, SCode: "501" }, { id: 2, AdCourseId: 9, AdTermId: 2, SCode: "502" }];
  check(nextCourseSection(rows, 9, 2) === "503" && nextCourseSection(rows, 9, 2, { ledger: { "9": 510 } }) === "511", "مقررٌ في فصل: من صفوفه ومن سجلّه");
  check(nextCourseSectionCode(rows as any, 9, 2, null, { "9": 510 }) === "511" && nextSectionCodeFrom([501, 502], 510) === "511", "الأبواب كلها (النموذج والمقترح) تمرّ بالدالة نفسها");
  check(nextCourseSection(rows, 9, 3) === "501", "فصلٌ آخر لا يؤثر");
  /* اللوحة: أُنشئت 502 ثم حُذفت دون مغادرة الصفحة — السجلّ المحلي يحفظها فلا تعود. */
  const scopeKey = "6|7|107";
  const withCreated = mergeLedgersFromRows({}, [{ AdCollegeId: 6, AdSectionId: 7, AdTermId: 107, AdCourseId: 9, SCode: "501" }, { AdCollegeId: 6, AdSectionId: 7, AdTermId: 107, AdCourseId: 9, SCode: "502" }]);
  const afterDelete = mergeLedgersFromRows(withCreated, [{ AdCollegeId: 6, AdSectionId: 7, AdTermId: 107, AdCourseId: 9, SCode: "501" }]);
  check(nextCourseSection([{ id: 1, AdCourseId: 9, AdTermId: 107, SCode: "501" }], 9, 107, { ledger: afterDelete[scopeKey] }) === "503", "إنشاء 502 ثم حذفها في الصفحة نفسها: المقترح 503 لا 502", afterDelete);
  check(mergeLedgersFromRows(afterDelete, [{ AdCollegeId: 6, AdSectionId: 7, AdTermId: 107, AdCourseId: 9, SCode: "501" }]) === afterDelete, "صفوفٌ بلا رقمٍ جديد لا تغيّر السجلّ (لا إعادة رسمٍ بلا داعٍ)");
  check(awaitingRegistrarNumber({ referenceNumber: "" }) && !awaitingRegistrarNumber({ referenceNumber: "2041" }), "بلا رقمٍ مرجعي ⇒ «بانتظار رقم التسجيل»");
}

/* ٣) هوية الفحص: الرقم المرجعي، أو المقرر والموعد والأستاذ منفردةً */
const names = { instructorById: new Map<number, string>([[7, "أحمد علي الصالح"], [8, "منى خالد العتيبي"]]), courseCodeById: new Map<number, string>([[1, "0109112"], [2, "0109114"]]), courseNameById: new Map<number, string>([[1, "أ"], [2, "ب"]]) };
const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
let nextId = 100;
const live = (course: number, section: string, crn: string, day: number, start: string, teacher = 7) => ({
  id: nextId++, AdCourseId: course, SCode: section, referenceNumber: crn, AdInstructorId: teacher, AdRoomCode: "012B08", AdRoomHall: "G20",
  fstarttime: start, fendtime: start.replace(/^(\d\d)/, h => String(Number(h) + 1).padStart(2, "0")), ...Object.fromEntries(DAYS.map((key, i) => [key, i === day])),
});
const pdf = (course: number, section: string, crn: string, day: number, start: string, teacher = 7, extra: Record<string, unknown> = {}) => ({
  AdCourseId: course, sourceCourseCode: String(names.courseCodeById.get(course)), sourceSectionText: section, SCode: section, referenceNumber: crn,
  AdInstructorId: teacher, AdRoomCode: "012B08", AdRoomHall: "G20", sourcePage: 1, sourceReadMode: "pdf-text",
  fstarttime: start, fendtime: start.replace(/^(\d\d)/, h => String(Number(h) + 1).padStart(2, "0")), ...Object.fromEntries(DAYS.map((key, i) => [key, i === day])), ...extra,
});
{
  const ours = [live(1, "505", "2041", 1, "11:00"), live(1, "506", "", 2, "09:00"), live(1, "507", "", 3, "10:00", 7), live(1, "508", "", 3, "10:00", 8)];
  const theirs = [pdf(1, "506", "2041", 1, "11:00"), pdf(1, "539", "10191", 2, "09:00"), pdf(1, "540", "10192", 3, "10:00", 7), pdf(1, "541", "10193", 3, "10:00", 8)];
  const result = checkRegistrarPdf({ live: ours, pdf: theirs, names });
  const by = (section: string) => result.identities.find(item => item.ours.section === section)!;
  check(by("505")?.how === "crn" && by("505").certain && by("505").theirs.section === "506", "بالرقم المرجعي: مؤكدة ورقمها عندهم 506", result.identities);
  check(by("506")?.how === "slot" && by("506").certain && by("506").theirs.crn === "10191", "شعبةٌ جديدة بلا مرجعي: عُرفت بالمقرر والموعد والأستاذ منفردة", by("506"));
  check(by("507")?.certain && by("508")?.certain && by("507").theirs.section === "540" && by("508").theirs.section === "541", "موعدٌ واحد لشعبتين بأستاذين: كلٌّ تُعرف بأستاذها", [by("507"), by("508")]);
  const twin = checkRegistrarPdf({ live: [live(1, "507", "", 3, "10:00"), live(1, "508", "", 3, "10:00")], pdf: [pdf(1, "540", "10192", 3, "10:00"), pdf(1, "541", "10193", 3, "10:00")], names });
  check(twin.identities.every(item => !item.certain), "موعدٌ واحد لشعبتين بالأستاذ نفسه: لا يقين، لا تخمين", twin.identities);
  /* شعبةٌ حذفناها ثم أعدناها بلا مرجعي، وملفُّهم يطبعها برقمها القديم. */
  const recreated = checkRegistrarPdf({
    live: [live(1, "536", "", 0, "08:00")], pdf: [pdf(1, "563", "3752", 0, "08:00")], names,
    crn: { byId: new Map(), original: [{ ...pdf(1, "563", "3752", 0, "08:00") }] },
  });
  check(recreated.identities.length === 1 && recreated.identities[0].certain && recreated.identities[0].theirs.crn === "3752", "المحذوفة المُعادة تُعرف برقمها القديم عندهم (لا «احذفوا» و«أضيفوا»)", recreated.findings);
  check(!recreated.findings.some(f => f.kind === "notRemoved" || f.kind === "onlyOurs" || f.kind === "onlyPdf"), "ولا تُطلب حذفاً ولا إضافة", recreated.findings.map(f => f.kind));
  const staff = checkRegistrarPdf({ live: [live(1, "501", "2712", 0, "08:00", 99)], pdf: [pdf(1, "502", "2712", 0, "08:00", 98, { sourceInstructorText: "هيئة تدريسية" })], names: { ...names, placeholderIds: new Set([98, 99]) } });
  check(staff.counts.matched === 1 && staff.counts.review === 0, "«هيئة تدريسية» على الطرفين: مطابقة، لا «قراءة غير مؤكدة»", staff.findings);
  const foreign = checkRegistrarPdf({ live: [0, 1, 2, 3, 4].map(i => live(1, String(501 + i), String(100 + i), i % 5, "08:00")), pdf: [0, 1, 2, 3, 4].map(i => pdf(2, String(601 + i), String(900 + i), i % 5, "13:00")), names });
  const allRooms = checkRegistrarPdf({ live: [0, 1, 2, 3, 4].map(i => live(1, String(501 + i), String(200 + i), i % 5, "08:00")), pdf: [0, 1, 2, 3, 4].map(i => pdf(1, String(601 + i), String(200 + i), i % 5, "08:00", 7, { AdRoomHall: "Z9" })), names });
  check(allRooms.counts.matched === 0 && !looksForeign(allRooms), "ملفٌّ صحيح تغيّرت قاعاتُ شعبه كلها: ليس «لا يشبه جدولكم» (عُرفت بالمرجعي)", allRooms.counts);
  check(looksForeign(foreign) && !looksForeign(result), "ملفٌّ لا تطابق منه شعبةٌ واحدة: «لا يشبه جدولكم» (قسمٌ أو فصلٌ آخر)", foreign.counts);
  const scanned = checkRegistrarPdf({ live: [live(1, "505", "2041", 1, "11:00")], pdf: [pdf(1, "506", "2041", 1, "11:00", 7, { sourceReadMode: "ocr-grid", importEvidence: { section: { confidence: "REVIEW_REQUIRED" } } })], names });
  check(scanned.identities.length === 1 && !scanned.identities[0].certain, "ملفٌّ ممسوح: رقمه لا يُعتمد", scanned.identities);
}

/* ٤) الخطة: ما يتغيّر، وما يُتخطّى، والتصادم */
{
  const id = (ref: string, ids: number[], ours: [string, string], theirs: [string, string], certain = true, course = 1): RegistrarIdentity =>
    ({ ref, ids, courseId: course, courseCode: "0109112", courseName: "أ", ours: { section: ours[0], crn: ours[1] }, theirs: { section: theirs[0], crn: theirs[1] }, how: "crn", certain, ...(certain ? {} : { reason: "ملتبس" }) });
  const rows = [{ id: 1, AdCourseId: 1, SCode: "503" }, { id: 2, AdCourseId: 1, SCode: "504" }, { id: 3, AdCourseId: 1, SCode: "505" }, { id: 4, AdCourseId: 1, SCode: "505" }, { id: 5, AdCourseId: 1, SCode: "510" }];
  const swap = planRegistrarNumbering([id("a", [1], ["503", "11085"], ["504", "2045"]), id("b", [2], ["504", "11086"], ["503", "2046"])], rows);
  check(swap.changes.length === 2 && !swap.collisions.length && swap.writable, "تبادل رقمين بين شعبتين ليس تصادماً", swap);
  const twoLines = planRegistrarNumbering([id("c", [3, 4], ["505", "11092"], ["506", "2041"])], rows);
  check(twoLines.changes[0].ids.join() === "3,4", "شعبةٌ بصفّين: يتغيّر الصفّان معاً");
  const clash = planRegistrarNumbering([id("a", [1], ["503", "1"], ["510", "2"]), id("c", [3, 4], ["505", "3"], ["506", "4"])], rows);
  check(clash.changes.map(c => c.ref).join() === "c" && clash.collisions.length === 1 && clash.collisions[0].section === "510", "رقمٌ عندهم تحمله شعبةٌ أخرى عندنا (510): لا يُكتب، ويُسمّى، والباقي يُكتب", clash);
  const chain = planRegistrarNumbering([id("a", [1], ["503", "1"], ["510", "2"]), id("b", [2], ["504", "1"], ["503", "2"])], rows);
  check(!chain.changes.length && chain.collisions.length >= 2 && !chain.writable, "التصادم يتسلسل: بقاءُ 503 على رقمه يمنع من أراده", chain);
  const skip = planRegistrarNumbering([id("x", [5], ["510", ""], ["520", "9"], false)], rows);
  check(!skip.changes.length && skip.skipped.length === 1 && skip.skipped[0].reason === "ملتبس", "غير المؤكد يُتخطّى ويُسمّى سببه", skip);
  const same = planRegistrarNumbering([id("y", [5], ["510", "9"], ["510", "9"])], rows);
  check(same.aligned === 1 && !same.changes.length && !same.writable, "المطابق رقماً لا يُكتب");
  const onlyOne = planRegistrarNumbering([id("a", [1], ["503", ""], ["511", "2"]), id("c", [3, 4], ["505", "3"], ["506", "4"])], rows, { only: ["a"] });
  check(onlyOne.changes.length === 1 && onlyOne.changes[0].ref === "a" && onlyOne.changes[0].isNew, "«اعتمد» لشعبةٍ جديدة واحدة: تتغيّر وحدها", onlyOne);
  const fields = Object.keys(onlyOne.changes[0].to).sort().join();
  check(fields === "crn,section", "التغيير رقمُ الشعبة والمرجعي وحدهما");
}

/* ٥) حارس الصفات: الفحصُ للقسم وحده (قرار المالك 2026-11-20): موظف التسجيل (صفةُ اطّلاع) لا يشطب ولا يحفظ */
{
  const tick = (role: string, path = "/schedules/registrar-requests/107:6:7:ab/tick", method = "POST") => roleWriteDecision({ method, path, authenticated: true, powerUser: false, role }).allowed;
  check(!tick("registrarStaff") && !tick("collegeRegistrar") && !tick("registrarHead"), "التسجيل المراجع لا يشطب بنود فحص القسم: صفتُه للاطّلاع");
  check(!tick("registrarStaff", "/schedules/registrar-requests") && !tick("registrarStaff", "/schedules/registrar-requests/x", "DELETE") && !tick("dean"), "ولا يحفظ طلباً ولا يحذفه، ولا يشطب غيرُ التسجيل");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
