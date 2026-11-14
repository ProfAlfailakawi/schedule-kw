/**
 * إعادة تصميم محرّر الموعد (W8): ساكنٌ + وحدات خالصة. لا يعتمد على متصفح.
 * الجرد الحيّ للضوابط في appointment-inventory-audit.ts.
 */
import fs from "node:fs";
import { lectureSegments, segmentsLabel } from "../src/utils/lectureSegments";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
};
const read = (f: string) => fs.readFileSync(f, "utf8");
const editor = read("src/components/Schedules.tsx");
const css = read("src/styles/70-appointment-redesign.css");
const chips = read("src/components/RegulationPatternChips.tsx");

check(segmentsLabel(lectureSegments(170)) === "50 + 10 + 50 + 10 + 50", "S1 170د = 50+10+50+10+50");
check(segmentsLabel(lectureSegments(110)) === "50 + 10 + 50", "S2 110د = 50+10+50");
check(lectureSegments(50).length === 1 && lectureSegments(80).length === 1 && lectureSegments(0).length === 0, "S3 ما لا يطابق الإيقاع مقطعٌ واحد، والصفر لا شيء");

check(css.includes('@import') === false && !/prefers-color-scheme\s*:\s*dark|data-theme=["']dark|\.dark\b/.test(css), "C1 ملف التصميم فاتحٌ وحده: لا داكن");
check(/prefers-reduced-motion:reduce/.test(css) && /appt-fold/.test(css) && /appt-travel/.test(css), "C2 الحركتان (طيّ الخطوة · انتقال الحفظ) معطّلتان مع تقليل الحركة");
check(read("src/index.css").includes("70-appointment-redesign.css"), "C3 الملف مسجَّل في index.css");
check(/stroke-dashoffset/.test(css) && /tabular-nums/.test(css), "C4 أيقونة الصحّ ترسم نفسها · أرقامٌ جدولية");

check(!/className="appt-sum"/.test(editor), "E1 شريط الحفظ بلا شرائح الملخّص المكرّرة");
check(/className="appt-progress"/.test(editor) && /studioProgress/.test(editor), "E2 خيط التقدّم");
check(/data-ctype=/.test(editor), "E3 لون نوع المقرر على البطاقة");
check(/aria-haspopup="true" aria-expanded=\{studioHelpersOpen\}/.test(editor) && /event\.key === "Escape" && studioHelpersOpen/.test(editor) && />مساعدات<ChevronDown/.test(editor), "E4 قائمة «مساعدات» بمفتاحٍ وأسهمٍ وEsc");
check(/appt-usual/.test(editor) && /املأ كالمعتاد/.test(editor) && /اقترح لي وقتاً وقاعة/.test(editor) && /<LectureStickChips/.test(editor), "E5 المساعدات الثلاث ما زالت موجودة");
check(/<ConflictTimeline card=/.test(editor) && /overlapMinutes/.test(editor) && /تداخل <bdi/.test(read("src/components/ConflictTimeline.tsx")), "E6 بطاقة المانع: شريطان وتداخل بالدقائق");
check(/<DurationBar segments=\{lectureSegments\(studioDuration\)\}/.test(editor), "E7 شريط المدة المجزَّأ");
check(/travelSavedCard\(/.test(editor) && /prefers-reduced-motion/.test(read("src/utils/saveTravel.ts")), "E8 انتقال البطاقة عند الحفظ مع احترام تقليل الحركة");
check(/أنماط أخرى/.test(chips) && /regulation-chips-apply/.test(chips) && /fit === "off" && onApplyBest/.test(chips), "E9 النمط المنصوح أولاً والبقية تحت «أنماط أخرى»، و«طبّق النمط» فوريّ عند المخالفة");
check(/appt-status-more/.test(editor) && /احفظ الموعد/.test(editor) && /requestClose\(\)\} loading=\{saving\}/.test(editor), "E10 الشريط: حبّة الحالة (التفاصيل داخلها) + حفظ + إلغاء");
check(/PersonChips visiting=/.test(editor.slice(editor.indexOf('aria-label="الأستاذ" data-appt-step="teacher"'))), "E11 وسوم الأستاذ (زائر/تدريب) باقيةٌ في صفّ الأستاذ بعد حذف الشرائح");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
