/**
 * «تذكّرني على هذا الجهاز» لبطاقة الأستاذ: المفتاح موقّع ومربوط بالرابط، لا يحمل
 * رقماً مدنياً، وكوكيه لا تقرؤه الصفحة، وكل بوابات البطاقة تبقى كما هي.
 */
import { readFileSync } from "node:fs";
import {
  STAFF_DEVICE_COOKIE, STAFF_DEVICE_MAX_DAYS, clearStaffDeviceCookie, deriveStaffDeviceSecret, signStaffDevice,
  staffDeviceCookie, staffDeviceExpiry, verifyStaffDevice,
} from "../src/server/staffDeviceKey";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

const secret = deriveStaffDeviceSecret("", "shared-secret-for-test");
const now = Date.parse("2026-10-29T08:00:00Z");
const end = now + 30 * 86_400_000;
const key = signStaffDevice(secret, "tokA", 42, end);

check(verifyStaffDevice(secret, "tokA", key, now) === 42, "مفتاحٌ صحيح يعيد رقم الأستاذ الداخلي");
check(verifyStaffDevice(secret, "tokB", key, now) === null, "المفتاح لا يصلح لرابطٍ آخر");
check(verifyStaffDevice(secret, "tokA", key, end + 1) === null, "المفتاح لا يصلح بعد انتهائه");
check(verifyStaffDevice(deriveStaffDeviceSecret("", "another"), "tokA", key, now) === null, "المفتاح لا يصلح بسرٍّ آخر");
check(verifyStaffDevice(secret, "tokA", key.replace(".42.", ".43."), now) === null, "تغيير رقم الأستاذ يُبطل التوقيع");
check(verifyStaffDevice(secret, "tokA", key.replace(`.${end}.`, `.${end + 86_400_000}.`), now) === null, "تمديد الانتهاء يُبطل التوقيع");
check(verifyStaffDevice(secret, "tokA", key.slice(0, -2) + "xx", now) === null, "التوقيع المعدّل مرفوض");
for (const bad of ["", "v1", "v2.42.1.x", "v1.-1.9999999999999.x", "v1.abc.1.x", null, undefined]) {
  check(verifyStaffDevice(secret, "tokA", bad, now) === null, `قيمةٌ مشوّهة مرفوضة: ${String(bad)}`);
}
check(key.split(".").length === 4 && key.split(".")[1] === "42" && signStaffDevice.length === 4, "المفتاح أربعة أجزاء: النسخة ورقم الأستاذ الداخلي والانتهاء والتوقيع — لا رقم مدني");
check(deriveStaffDeviceSecret("env-wins", "shared") === "env-wins", "STAFF_DEVICE_SECRET إن ضُبط هو الحَكَم");
check(deriveStaffDeviceSecret("", "shared") !== deriveStaffDeviceSecret("", "shared2"), "السرّ المشتق يتبع السرّ المشترك");

const linkEnd = new Date(now + 10 * 86_400_000).toISOString();
check(staffDeviceExpiry(linkEnd, now) === Date.parse(linkEnd), "الانتهاء لا يتجاوز نهاية الرابط");
check(staffDeviceExpiry(new Date(now + 999 * 86_400_000).toISOString(), now) === now + STAFF_DEVICE_MAX_DAYS * 86_400_000, "والسقف 180 يوماً ولو طال الرابط");

const header = staffDeviceCookie("tok A", key, end, true, now);
check(header.startsWith(`${STAFF_DEVICE_COOKIE}=`), "اسم الكوكي ثابت");
check(/; HttpOnly/.test(header) && /; SameSite=Strict/.test(header) && /; Secure/.test(header), "HttpOnly وSameSite=Strict وSecure في الإنتاج");
check(header.includes("Path=/api/public/staff/tok%20A;"), "مسار الكوكي هذا الرابط وحده");
check(/Max-Age=2592000/.test(header), "عمر الكوكي حتى انتهاء المفتاح");
check(!/; Secure/.test(staffDeviceCookie("t", key, end, false, now)), "بلا Secure خارج الإنتاج (تطوير محلي)");
check(/Max-Age=0/.test(clearStaffDeviceCookie("t", true)), "«انسَ هذا الجهاز» يمسح الكوكي");

const server = readServerSource();
const route = server.slice(server.indexOf('app.post("/api/public/staff/:token", async'), server.indexOf("/* The old `staff-ics?civil=…` route is gone."));
check(route.indexOf("STAFF_DEVICE_COOKIE]) {") > -1 && route.indexOf("STAFF_DEVICE_COOKIE]) {") < route.indexOf("publicAttemptReserve("), "فتحٌ بلا رقمٍ ولا مفتاح لا يُحسب محاولة");
check(/!who\.byDevice && req\.body\?\.remember === true/.test(route), "المفتاح يُعطى بعد التحقق بالرقم المدني وطلب «تذكّرني» فقط");
check(route.indexOf("signStaffDevice(") > route.indexOf("const card = await buildStaffCard("), "ولا يُوقَّع إلا بعد نجاح بوابات البطاقة");
check(/remembered,/.test(route), "الصفحة تعرف أن الجهاز متذكَّر لتُظهر «انسَ هذا الجهاز»");
const build = server.slice(server.indexOf("async function buildStaffCard("), server.indexOf("// Security gate: the instructor must actually appear in the link's OWN term"));
check(/isFacultyPlaceholder\(person\)/.test(build) && /Number\(link\.AdInstructorId\) !== Number\(person\.AdInstructorId\)/.test(build), "بوابتا «هيئة تدريسية» والرابط الشخصي تبقيان لمفتاح الجهاز");
const note = server.slice(server.indexOf('app.post("/api/public/staff/:token/note"'), server.indexOf('app.post("/api/public/staff/:token/note"') + 2600);
check(/staffIdentityFrom\(req, token\)/.test(note) && /Number\(card\.instructorId\)/.test(note), "الملاحظة تأخذ صاحبها من البوابة نفسها لا من بحثٍ ثانٍ بالرقم");
check(/app\.post\("\/api\/public\/staff\/:token\/forget"/.test(server), "مسار «انسَ هذا الجهاز» موجود");
check(/id="remember"/.test(server) && /remember:Boolean\(rememberBox&&rememberBox\.checked\)/.test(server), "خانة «تذكّرني» تُرسل مع الرقم");
check(/localStorage\.setItem\("sk-dev:"\+TOKEN,"1"\)/.test(server) && !/localStorage\.setItem\("sk-civil/.test(server), "الجهاز يحفظ علامةً فقط، لا الرقم المدني");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
