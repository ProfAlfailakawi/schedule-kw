/**
 * ── معاينة المواقع للشركات (إعلانٌ تجريبي للأدمن) ──────────────────────────────
 * رسمٌ في المتصفح وحده داخل شاشة الإعلانات: لا حفظ ولا مسار خادم، ويحمل وسم «تجريبي»، ويقرأ سعة
 * المواقع الحقيقية. هنا يُحرس العقد: من أين تأتي المواقع، ولا شيء يُكتب، وكل زرٍّ مسجّل في المرشد.
 */
import fs from "node:fs";
import path from "node:path";
import { SAMPLE_BRANDS, SAMPLE_NAME_MAX, customBrand } from "../src/components/ads/SampleAd";
import { slotAvailability } from "../src/components/ads/PlacementPreview";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

check(SAMPLE_BRANDS.length >= 3 && SAMPLE_BRANDS[0].name === "آبل", "شركاتٌ جاهزة للمعاينة أولها «آبل»");
check(customBrand("   ") === null, "اسمٌ فارغ لا يصنع شركة");
check(customBrand("ب".repeat(80))?.name.length === SAMPLE_NAME_MAX, "الاسم المكتوب يُقصّ عند الحدّ");
check(customBrand("شركة الأفق")?.hue === customBrand("شركة   الأفق")?.hue, "اللونُ ثابتٌ من الاسم ولو تغيّرت المسافات");

const slot = (over: object) => ({ id: "me", label: "مساري", where: "", hint: "", audience: "students", width: 640, height: 200, capacity: 5, live: 0, nextFree: "", ...over }) as any;
check(slotAvailability(slot({ live: 3 })).free === 2 && !slotAvailability(slot({ live: 3 })).full, "السعة المتبقية من بيانات الموقع");
check(slotAvailability(slot({ live: 5, nextFree: "2026-11-12" })).full, "موقعٌ ممتلئ يُعلَّم ممتلئاً");
check(slotAvailability(slot({ exclusive: true, capacity: 1, live: 0 })).text.includes("حصري"), "الموقع الحصري يُقال إنه لحملةٍ واحدة");
check(slotAvailability(slot({ exclusive: true, capacity: 1, live: 1 })).full, "والحصريُّ المحجوز ممتلئ");

const mgr = read("src/components/AdsManager.tsx");
const prev = read("src/components/ads/PlacementPreview.tsx");
const sample = read("src/components/ads/SampleAd.tsx");
check(mgr.includes('["preview", "معاينة للشركات"') && mgr.includes("<PlacementPreview data={data} onStart={startAt} />"), "تبويبُ «معاينة للشركات» في شاشة الإعلانات");
check(!/fetch\(|api\(|localStorage|sessionStorage/.test(prev + sample), "المعاينة بلا شبكة ولا تخزين: لا تصل إلى أحد");
check(sample.includes("تجريبي") && sample.includes('role="img"'), "وسمُ «تجريبي» على الإعلان وبديلٌ نصّي للقارئ");
check((prev.match(/<(button|input)/g) || []).length === (prev.match(/data-guide-ignore=/g) || []).length, "كل أزرار المعاينة وحقلها مسجّلة في المرشد");
check(mgr.includes("{ ...blankForm(data), slot, company }"), "«ابدأ حملة هنا» يفتح المعالج على الموقع المختار");
check(read("src/App.tsx").includes('return user.IsRootAdmin && !user.IsDemo ? <AdsManager />'), "الشاشة تبقى للإدارة الرئيسية وحدها");
check(read("src/styles/25-partners.css").includes("@media print{.ad-preview{display:none!important}}"), "لا تُطبع المعاينة");

console.log(`\nAds preview audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
