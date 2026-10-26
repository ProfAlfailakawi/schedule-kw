/**
 * مكتبةُ الأنماط: رسمٌ للعرض فقط، في موضعين (شاشة تعديل موعد الأستاذ، وشاشة الجدول).
 */
import fs from "fs";
import { PATTERN_LIBRARY_CSS, PATTERN_LIBRARY_ICON, patternLibraryHtml } from "../src/utils/patternLibraryView";
import { patternLibraryInput } from "../src/utils/patternLibraryInput";
import { patternLibraryByHours } from "../src/utils/scheduleRegulations";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };

const html = patternLibraryHtml(patternLibraryInput());
const library = patternLibraryByHours();
const total = library.reduce((sum, group) => sum + group.patterns.length, 0);
check((html.match(/<figure class="plib-pat"/g) || []).length === total, `كلُّ نمطٍ في المكتبة يُرسم (${total})`);
check((html.match(/class="plib-group"/g) || []).length === library.length, "ومجموعةٌ لكل عدد ساعات");
check(/aria-label="[^"]*80 \+ 80 \+ 50 د"/.test(html), "نمط ٨٠+٨٠+٥٠ المعتمد يظهر بوصفه المقروء");
check(/50د[\s\S]*10د[\s\S]*80د[\s\S]*15د/.test(html), "ومفتاحٌ بطول المحاضرة والفاصل: ٥٠/١٠ و٨٠/١٥");
const fourHourBlock = library.find(group => group.hours === 4)?.patterns.find(pattern => pattern.id === "4h-block");
check(fourHourBlock?.minutesPerDay[0] === 230 && fourHourBlock.weeklyMinutes === 200, "كتلة الأربع ساعات العملية 230 زمنية وتحسب 200 دقيقة تدريس (50×4 + 10×3)");
check(!/تاريخ/.test(html), "ولا كلمة «تاريخي» في النص");
check(!html.includes("<script") && !/on\w+=/.test(html), "والرسم نصٌّ ثابت بلا سكربت");
check(PATTERN_LIBRARY_ICON.includes("<svg") && PATTERN_LIBRARY_CSS.includes(".plib-pat"), "أيقونةٌ وأنماطٌ جاهزة");
const server = fs.readFileSync("server.ts", "utf8");
const editHtml = server.slice(server.indexOf("function editHtml(it,i)"), server.indexOf("function editHtml(it,i)") + 700);
check(/class="plib"/.test(editHtml) && /أيام المحاضرة/.test(editHtml), "في صفحة الأستاذ: الأيقونة داخل شاشة تعديل الموعد عند «أيام المحاضرة»");
check(!/<div class="hd">[^]*?class="plib"/.test(server.slice(server.indexOf('<div class="hd">'), server.indexOf('<div class="hd">') + 900)), "وليست في رأس الصفحة");
const schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check(schedules.includes("<PatternLibraryButton data-guide-ignore=") && schedules.includes('import PatternLibraryButton from "./PatternLibraryButton"'), "وفي شاشة الجدول: أيقونةٌ في شريط الأدوات");
console.log(`\nPattern library audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
