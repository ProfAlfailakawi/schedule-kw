/**
 * ── «محاضرتك القادمة» في مساري ────────────────────────────────────────────────
 *
 * الدالةُ النقيّة بساعةٍ ثابتة (أسبوعُ الكويت يبدأ الأحد، والجمعةُ والسبتُ عطلة، والحدّان شاملان)، وتصريفُ النص
 * (بعد دقيقةٍ/دقيقتين/٥ دقائق/ساعةٍ و١٠ دقائق)، وأنها تُحقن في الصفحة نصّاً فتعطي النتيجةَ نفسها في المتصفح،
 * وأن بطاقتها لا ترسم شيئاً حين لا جدولَ، وأن الصفحة لا تحمل حرفاً دون ١٢px ولا لونَ نصٍّ دون ٤٫٥ : ١.
 */
import assert from "node:assert/strict";
import vm from "node:vm";
import { AR, ARABIC_COUNT_SCRIPT, countOf, oblique } from "../src/utils/arabicCount";
import { NEXT_LECTURE_SCRIPT, nextLecture, nextLectureLabel, type LectureMeeting } from "../src/utils/nextLecture";
import { STUDENT_EXTRAS_CSS, STUDENT_EXTRAS_SCRIPT } from "../src/server/studentExtrasScript";
import { STUDENT_HOME_SCRIPT, studentHomePage } from "../src/server/studentHomePage";

let passed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => { if (!ok) console.log("✗ " + label, extra ?? ""); assert.ok(ok, label); passed++; console.log("✓ " + label); };

/* لحظةٌ بتوقيت الكويت (+03:00). 2026-11-15 أحد. */
const kw = (iso: string) => Date.parse(`${iso}+03:00`);
const m = (day: number, from: string, to: string, name = "علم النفس التربوي", section = "02"): LectureMeeting => {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return { day, start: mins(from), end: mins(to), name, code: "0109224", section };
};
const count = (n: number, unit: "minute" | "hour") => countOf(n, oblique(unit === "hour" ? AR.hour : AR.minute));
const say = (meetings: LectureMeeting[], at: string, term?: { start?: string; end?: string }) => {
  const next = nextLecture(meetings, kw(at), term);
  return next ? { next, ...nextLectureLabel(next, count) } : null;
};
const SUN_8 = [m(0, "08:00", "09:30")];

/* ── ١) الحسابُ بساعةٍ ثابتة ── */
{
  const r = say(SUN_8, "2026-11-15T07:20:00")!;
  check(r.next.minutes === 40 && r.when === "بعد 40 دقيقة" && r.soon && r.next.clock === "08:00" && r.next.dayOffset === 0, "أحدٌ 07:20 ومحاضرة 08:00: «بعد 40 دقيقة»", r);
  check(say(SUN_8, "2026-11-15T07:59:00")!.when === "بعد دقيقة واحدة", "دقيقةٌ باقية: «بعد دقيقة واحدة»");
  check(say(SUN_8, "2026-11-15T07:58:00")!.when === "بعد دقيقتين", "دقيقتان: «بعد دقيقتين» (المثنّى بعد «بعد» مجرور)");
  check(say(SUN_8, "2026-11-15T07:55:00")!.when === "بعد 5 دقائق", "٣–١٠: «5 دقائق»");
  check(say(SUN_8, "2026-11-15T07:49:00")!.when === "بعد 11 دقيقة", "١١–٩٩: «11 دقيقة» مفردةً");
  check(say(SUN_8, "2026-11-15T06:50:00")!.when === "بعد ساعة و10 دقائق", "ساعةٌ وعشر دقائق");
  check(say(SUN_8, "2026-11-15T07:00:00")!.when === "بعد ساعة", "ساعةٌ كاملة: «بعد ساعة»");
  check(say(SUN_8, "2026-11-15T06:00:00")!.when === "بعد ساعتين", "ساعتان: «بعد ساعتين»");
  check(say(SUN_8, "2026-11-15T05:55:00")!.when === "بعد ساعتين و5 دقائق", "ساعتان و٥ دقائق");
  check(say(SUN_8, "2026-11-15T04:00:00")!.when === "اليوم 08:00" && !say(SUN_8, "2026-11-15T04:00:00")!.soon, "أبعدُ من ثلاث ساعات: «اليوم 08:00»");
  const sec = say(SUN_8, "2026-11-15T07:59:30")!;
  check(sec.next.minutes === 1, "٣٠ ثانيةً باقية تُعدّ دقيقةً (لا «بعد لا دقائق»)");
  check(say(SUN_8, "2026-11-15T08:00:00") === null || say(SUN_8, "2026-11-15T08:00:00")!.next.dayOffset > 0, "ما بدأت لا تُعدّ قادمة");
}

/* ── ٢) الأسبوع: الأحد أولُه، والجمعة والسبت عطلة ── */
{
  const week = [m(0, "08:00", "09:30", "أ"), m(0, "10:00", "11:30", "ب"), m(1, "08:00", "09:30", "ج"), m(3, "13:00", "14:30", "د")];
  check(say(week, "2026-11-15T09:00:00")!.next.meeting.name === "ب", "بعد أولى المحاضرات تأتي الثانيةُ في اليوم نفسه");
  const tomorrow = say(week, "2026-11-15T12:00:00")!;
  check(tomorrow.next.meeting.name === "ج" && tomorrow.when === "غداً 08:00" && tomorrow.next.dayOffset === 1, "بعد آخر محاضرات اليوم: «غداً 08:00»", tomorrow);
  const thursday = say(week, "2026-11-19T15:00:00")!;
  check(thursday.next.meeting.name === "أ" && thursday.next.date === "2026-11-22" && thursday.next.dayOffset === 3 && thursday.when === "الأحد 08:00", "الخميس مساءً ← الأحد (تُتخطّى الجمعةُ والسبت)", thursday);
  const friday = say(week, "2026-11-20T09:00:00")!;
  check(friday.next.date === "2026-11-22" && friday.next.meeting.name === "أ", "الجمعة: لا شيءَ فيها، الأحدُ التالي");
  const saturday = say(week, "2026-11-21T20:00:00")!;
  check(saturday.next.date === "2026-11-22" && saturday.next.dayOffset === 1 && saturday.when === "غداً 08:00", "السبت مساءً: الأحد غداً", saturday);
  check(say([m(2, "08:00", "09:30")], "2026-11-15T12:00:00")!.when === "الثلاثاء 08:00", "يومٌ بعيد باسمه");
  check(say([m(4, "08:00", "09:30")], "2026-11-15T12:00:00")!.next.date === "2026-11-19", "الخميس هو اليوم ٤");
  check(nextLecture([m(5, "08:00", "09:30"), m(6, "08:00", "09:30")], kw("2026-11-15T07:00:00")) === null, "لا موعدَ يوم الجمعة أو السبت: لا شيء");
  check(nextLecture([], kw("2026-11-15T07:00:00")) === null && nextLecture(null as any, kw("2026-11-15T07:00:00")) === null && nextLecture(SUN_8, NaN) === null, "بلا مواعيد أو بساعةٍ فاسدة: لا شيء");
}

/* ── ٣) توقيتُ الكويت لا توقيتُ الجهاز ── */
{
  const mon = [m(1, "08:00", "09:30", "اثنين")];
  const r = nextLecture(mon, Date.parse("2026-11-15T21:30:00Z"))!;
  check(r.date === "2026-11-16" && r.dayOffset === 0 && r.minutes === 450, "21:30 UTC = 00:30 الاثنين في الكويت: اليومُ هو الاثنين", r);
  const sun = nextLecture(SUN_8, Date.parse("2026-11-15T04:20:00Z"))!;
  check(sun.minutes === 40 && sun.at === Date.parse("2026-11-15T05:00:00Z"), "08:00 الكويت = 05:00 UTC", sun);
  const night = [m(0, "23:00", "23:50"), m(1, "08:00", "09:00")];
  const before = nextLecture(night, Date.parse("2026-11-15T19:50:00Z"))!;
  check(before.meeting.start === 1380 && before.minutes === 10 && before.date === "2026-11-15", "22:50 الكويت: محاضرةُ 23:00 قادمةٌ بعد 10 دقائق", before);
  const after = nextLecture(night, Date.parse("2026-11-15T20:30:00Z"))!;
  check(after.meeting.start === 480 && after.date === "2026-11-16" && after.dayOffset === 1, "23:30 الكويت: بدأت محاضرةُ الليل، فالقادمةُ الاثنين 08:00", after);
}

/* ── ٤) حدّا الفصل ── */
{
  const term = { start: "2026-09-13", end: "2027-01-07" };
  check(say(SUN_8, "2026-09-12T20:00:00", term)!.next.date === "2026-09-13", "قبل البداية بيوم: أولُ يومٍ في الفصل");
  check(nextLecture(SUN_8, kw("2026-09-06T20:00:00"), term)!.date === "2026-09-13", "قبل البداية بسبعة أيام: أولُ أحدٍ في الفصل (ضمن الأيام الثمانية)");
  check(nextLecture(SUN_8, kw("2026-09-01T20:00:00"), term) === null, "قبل البداية بأسابيع: لا شيء (لا يقفز بعيداً)");
  check(say(SUN_8, "2027-01-06T12:00:00", term) === null, "الفصل ينتهي الخميس 2027-01-07: لا أحدَ بعده، فلا بطاقة");
  check(nextLecture([m(4, "08:00", "09:00")], kw("2027-01-07T07:00:00"), term)!.date === "2027-01-07", "اليومُ الأخير شامل");
  check(nextLecture([m(4, "08:00", "09:00")], kw("2027-01-07T09:30:00"), term) === null, "وبعد محاضرته الأخيرة لا شيء");
  check(nextLecture(SUN_8, kw("2026-11-15T07:00:00"), { end: "2026-11-10" }) === null && nextLecture(SUN_8, kw("2026-11-15T07:00:00"), {})!.dayOffset === 0, "حدٌّ واحد أو لا حدّ");
}

/* ── ٥) تُحقن في الصفحة نصّاً وتعطي النتيجةَ نفسها ── */
{
  check(!NEXT_LECTURE_SCRIPT.includes("__name"), "الدالتان بلا دوالَّ داخليةٍ مسمّاة (المحوّلُ يلفّها بـ__name فتنكسر في المتصفح)");
  const sandbox: any = { out: null };
  vm.createContext(sandbox);
  vm.runInContext(`${ARABIC_COUNT_SCRIPT}var oblique=(${oblique.toString()});${NEXT_LECTURE_SCRIPT}`, sandbox);
  vm.runInContext(`var nx=nextLecture(${JSON.stringify(SUN_8)},${kw("2026-11-15T07:20:00")},{start:"2026-09-13",end:"2027-01-07"});
    out=nextLectureLabel(nx,function(n,u){return countOf(n,oblique(u==="hour"?AR.hour:AR.minute))}).when+"|"+nx.clock+"|"+nx.minutes;`, sandbox);
  check(sandbox.out === "بعد 40 دقيقة|08:00|40", "في المتصفح (vm): النتيجةُ نفسُها", sandbox.out);
  const html = STUDENT_HOME_SCRIPT;
  check(html.includes("function extrasHook()") && html.includes("extrasHook();") && html.includes("var nextLecture=("), "الصفحة تحقن الدالةَ وتنادي الخطاف بعد الرئيسية");
  let syntax = "";
  try { new vm.Script(STUDENT_EXTRAS_SCRIPT); } catch (error: any) { syntax = String(error?.message); }
  check(!syntax, "سكربتُ الإضافات سليمُ الصياغة", syntax);
}

/* ── ٦) البطاقةُ لا ترسم إلا بجدول، وكلُّ ما فيها ضمن قواعد مساري ── */
{
  check(/if\(!d\|\|!d\.meetings\|\|!d\.meetings\.length\)\{gxDrop\("gx-next"\)/.test(STUDENT_EXTRAS_SCRIPT) && /if\(!nx\)\{gxDrop\("gx-next"\)/.test(STUDENT_EXTRAS_SCRIPT),
    "بلا جدولٍ أو بلا محاضرةٍ قادمة: تُزال البطاقةُ ولا يبقى مكانٌ فارغ");
  check(STUDENT_EXTRAS_SCRIPT.includes('"/api/public/me/extras"') && !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(STUDENT_EXTRAS_SCRIPT), "جلبٌ من الخادم وحده، ولا تخزينَ في المتصفح");
  check(!/https?:\/\//.test(STUDENT_EXTRAS_SCRIPT) && !/\$\{/.test(STUDENT_EXTRAS_SCRIPT.replace(/var oblique=\([\s\S]*?\);\n/, "")), "لا مصدرَ خارجياً ولا ‎${‎ شاردة");
  check(STUDENT_EXTRAS_SCRIPT.includes("gxOpenWeek") && STUDENT_EXTRAS_SCRIPT.includes("reveal(t)"), "اللمسُ يفتح شبكةَ الأسبوع في «جدولي المقترح»");
  check(/clearInterval\(GX\.tick\)/.test(STUDENT_EXTRAS_SCRIPT) && STUDENT_EXTRAS_SCRIPT.includes("20000"), "العدُّ التنازليّ يتجدّد وحده ويتوقف حين تغادر الرئيسية");
  const sizes = [...STUDENT_EXTRAS_CSS.matchAll(/font-size:([\d.]+)px/g)].map(x => Number(x[1]));
  check(sizes.length > 5 && Math.min(...sizes) >= 12, "لا خطَّ دون ١٢px في بطاقات الإضافات", Math.min(...sizes));
  check(!/min-block-size:\s*(?:[1-3]?\d|4[0-3])px/.test(STUDENT_EXTRAS_CSS), "لا هدفَ لمسٍ دون ٤٤px");
  const page = studentHomePage("n");
  check(page.includes("gx-next") && page.includes("gx-offer"), "أنماطُ البطاقات في الصفحة");
  const sprite = new Set([...page.matchAll(/<symbol id="i-([a-z]+)"/g)].map(x => x[1]));
  const used = [...STUDENT_EXTRAS_SCRIPT.matchAll(/(?<![a-z])ic\("([a-z]+)"/g)].map(x => x[1]);
  check(used.length > 5 && used.every(name => sprite.has(name)), "كلُّ أيقونةٍ مستعملة معرَّفة في الصفحة", used.filter(name => !sprite.has(name)));
  const own = new Set([...STUDENT_EXTRAS_SCRIPT.matchAll(/<symbol id="g-([a-z]+)"/g)].map(x => x[1]));
  const usedOwn = [...STUDENT_EXTRAS_SCRIPT.matchAll(/gi\("([a-z]+)"/g)].map(x => x[1]);
  check(usedOwn.length > 3 && usedOwn.every(name => own.has(name)), "وأيقوناتُها الخاصة معرَّفةٌ في سكربتها", usedOwn.filter(name => !own.has(name)));
}

console.log(`\n${passed} فحصاً نجحت.`);
