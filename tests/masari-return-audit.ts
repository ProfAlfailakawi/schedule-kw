/**
 * ما يُعيد الطالبَ إلى «مساري»: رادارُ الزملاء بحدٍّ أدنى يحمي الأفراد، و«ماذا لو» للتخرّج، وتذكيرُ التقويم، ومشاركةُ الجدول،
 * وتثبيتٌ مستقلّ. الدوالُّ النقية تُشغَّل في vm؛ والباقي بقراءة المصدر.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { PEER_COURSE_MIN, peerCourseCounts } from "../src/utils/studentProfile";
import { STUDENT_HOME_SCRIPT, studentHomePage } from "../src/server/studentHomePage";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => { if (!ok) console.log("✗ " + label, extra ?? ""); assert.ok(ok, label); passed++; console.log("✓ " + label); };
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/* ١. رادار الزملاء: حدٌّ أدنى، وتكرارُ المقرر في رغبات طالبٍ واحد يُعدّ مرة */
const wishers = [
  ...Array.from({ length: 6 }, () => ({ courseIds: [104] })),
  ...Array.from({ length: 3 }, () => ({ courseIds: [105, 105, 105] })),
  { courseIds: [104, 104] }, { courseIds: [] }, {},
];
const counts = peerCourseCounts(wishers);
check(PEER_COURSE_MIN === 5, "الحدُّ الأدنى لعرض عددِ مقرر خمسة");
check(counts[104] === 7 && counts[105] === undefined, "٧ طلبوا ١٠٤ فيظهر، وثلاثةٌ طلبوا ١٠٥ (ولو كرّروه) فيُحجب", counts);
check(Object.keys(peerCourseCounts([{ courseIds: [1] }, { courseIds: [1] }])).length === 0, "اثنان لا يظهران");
const routes = read("src/server/studentDoorRoutes.ts");
check(/const byCourse = show \? stat\.byCourse : \{\}/.test(routes), "أعدادُ المقررات لا تُرسل إلا في القسم الكبير (عشرةُ ملفاتٍ فأكثر)");

/* ٢. السكربت: دوالُّ ماذا لو والتقويم */
const fn = (name: string, next: string) => {
  const begin = STUDENT_HOME_SCRIPT.indexOf("function " + name + "(");
  const end = STUDENT_HOME_SCRIPT.indexOf(next, begin + 1);
  assert.ok(begin >= 0 && end > begin, "تستخرج " + name);
  return STUDENT_HOME_SCRIPT.slice(begin, end);
};
const ctx: Record<string, any> = {
  countOf: (n: number, unit: string) => `${n} ${unit}`,
  AR: { unit: "وحدة", term: "فصل", year: "سنة" },
};
runInNewContext([
  "var SUMMER_UNITS=6;",
  fn("whatIf", "function whatIfLine("), fn("whatIfLine", "function wireWhatIf("),
  fn("icsEsc", "function icsDay("), fn("icsDay", "function icsNext("), fn("icsNext", "function icsText("), fn("icsText", "function downloadBlob("),
  "this.whatIf=whatIf;this.whatIfLine=whatIfLine;this.icsText=icsText;this.icsNext=icsNext;this.icsDay=icsDay;",
].join("\n"), ctx);

const a = ctx.whatIf(90, 15, false), b = ctx.whatIf(90, 12, false), c = ctx.whatIf(90, 15, true);
check(a.regular === 6 && a.summers === 0 && a.years === 3, "٩٠ وحدة بمعدل ١٥: ستة فصول، ثلاث سنوات", a);
check(b.regular === 8 && b.total === 8, "بمعدل ١٢: ثمانية فصول", b);
check(c.regular <= a.regular && c.regular + c.summers === c.total && c.summers >= 1, "مع الصيفي تدخل فصولٌ صيفية، وعددُ الفصول العادية لا يزيد", c);
const d100 = ctx.whatIf(100, 15, false), d100s = ctx.whatIf(100, 15, true);
check(d100.years === 4 && d100s.years === 3, "١٠٠ وحدة: أربع سنوات بلا صيفي، وثلاث معه", [d100, d100s]);
check(ctx.whatIf(0, 15, true).total === 0 && ctx.whatIf(90, 0, false).total === 0, "لا متبقٍّ أو لا وحدات: صفر، بلا حلقةٍ لا تنتهي");
check(ctx.whatIf(10000, 12, true).total <= 60, "سقفٌ للحلقة");
check(/ستة|6 فصل/.test(ctx.whatIfLine(a, 15, false)) || ctx.whatIfLine(a, 15, false).includes("6 فصل"), "السطر يقول عدد الفصول", ctx.whatIfLine(a, 15, false));
check(ctx.whatIfLine(ctx.whatIf(0, 15, false), 15, false) === "أكملت وحدات الصحيفة.", "من أكمل صحيفته يُقال له ذلك");

const ics = String(ctx.icsText("تذكير؛ مهم, جداً", "2026-11-15", "سطر1\nسطر2"));
check(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR") && ics.includes("DTSTART;VALUE=DATE:20261115") && ics.includes("DTEND;VALUE=DATE:20261116"), "ملف التقويم يوماً كاملاً: يبدأ في ١٥ وينتهي قبل ١٦");
check(ics.includes("SUMMARY:تذكير\\؛ مهم") === false && ics.includes("SUMMARY:تذكير\;") === false && ics.includes("SUMMARY:تذكير؛ مهم\\, جداً"), "الفاصلة تُهرَّب والفاصلةُ العربية تبقى كما هي", ics.split("\r\n").find(l => l.startsWith("SUMMARY")));
const asciiSemi = String(ctx.icsText("دور 1; الفصل الأول, ملاحظة", "2026-11-15", "أ;ب\\ج"));
check(asciiSemi.includes("SUMMARY:دور 1\\; الفصل الأول\\, ملاحظة") && asciiSemi.includes("DESCRIPTION:أ\\;ب\\\\ج"), "الفاصلة المنقوطة اللاتينية والفاصلة والشرطة المائلة تُهرَّب بشرطةٍ حقيقية (RFC 5545)", asciiSemi.split("\r\n").filter(l => /^(SUMMARY|DESCRIPTION)/.test(l)));
check(ics.includes("DESCRIPTION:سطر1\\nسطر2") && (ics.match(/BEGIN:VALARM/g) || []).length === 2 && ics.includes("TRIGGER:-PT15H") && ics.includes("TRIGGER:PT8H"), "تنبيهان: ٩ صباحاً قبل اليوم، و٨ صباحاً فيه، والأسطر تُهرَّب");
check(ctx.icsNext("2026-12-31") === "20270101" && ctx.icsNext("2028-02-28") === "20280229", "اليومُ التالي يعبر الشهر والسنة والكبيس");
check(!/civil|الرقم المدني|\d{12}/.test(ics), "لا هويةَ في ملف التقويم");

/* ٣. المصدر */
check(/function tkShareImage\(cur\)/.test(STUDENT_HOME_SCRIPT) && /navigator\.canShare/.test(STUDENT_HOME_SCRIPT) && /toBlob\(/.test(STUDENT_HOME_SCRIPT), "مشاركة الجدول صورةً: canvas ثم مشاركة النظام أو تنزيل");
const shareBody = fn("tkShareImage", "/* ── خطتي");
check(!/identity|civil|\.name\b.*profile/.test(shareBody.replace(/it\.name/g, "")) && /sectionName/.test(shareBody), "الصورة تحمل اسمَ القسم والفصل لا اسمَ الطالب ولا رقمَه");
check(/data-act="share"/.test(STUDENT_HOME_SCRIPT) && /data-act="ics"/.test(STUDENT_HOME_SCRIPT) && /id="icsNext"/.test(STUDENT_HOME_SCRIPT), "أزرار المشاركة والتذكير موجودة في الجدول والرحلة");
check(/function peerTag\(/.test(STUDENT_HOME_SCRIPT) && (STUDENT_HOME_SCRIPT.match(/peerTag\(/g) || []).length >= 4, "«يريده N طالباً» يظهر في قائمة المطروح والرغبات وإضافة مقرر");

/* ٤. تثبيتٌ مستقلّ */
const manifest = JSON.parse(read("public/me.webmanifest"));
check(manifest.start_url.startsWith("/me") && manifest.scope === "/me" && manifest.display === "standalone" && manifest.dir === "rtl" && manifest.lang === "ar", "manifest مساري: يبدأ من /me ونطاقه /me");
check(manifest.icons.some((i: any) => i.purpose === "maskable") && manifest.icons.every((i: any) => fs.existsSync(path.join(process.cwd(), "public", i.src))), "أيقوناتُه موجودةٌ فعلاً، وفيها قابلةٌ للقصّ");
check(studentHomePage("n").includes('<link rel="manifest" href="/me.webmanifest">'), "الصفحة تعلن manifest الخاصّ بها لا manifest التطبيق الإداري");
check(/"manifest-src 'self'"/.test(readServerSource()), "سياسة CSP تسمح بـ manifest من الموقع نفسه (وإلا حُجب الرابط)");
check(JSON.parse(read("public/manifest.webmanifest")).scope === "/", "manifest التطبيق الإداري لم يُمسّ");

console.log(`\n${passed} passed, 0 failed`);
