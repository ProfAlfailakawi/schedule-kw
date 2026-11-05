/**
 * ── الكلمة الأولى المؤقتة وحدود الإعارة (ملاحظات المالك 2026-11-05: 2، 12، 25) ──
 *
 *  ١) الكلمة الأولى: سبعة أيام من الإصدار، ثم يُرفض الدخول بها حتى يُعاد إصدارها؛ ولا تمسّ كلمةً اختارها صاحبها.
 *  ٢) لا نصّ للكلمة في الحساب؛ وكلمةٌ يعيّنها مسؤولٌ لغيره تُغيَّر عند الدخول.
 *  ٣) المُعير خارج الإعارة حرّ، وداخلها ممنوع حتى يُنهيها؛ والوقت المشغول لا يُعرض للمستعير.
 *  ٤) الرسم الصغير يجمع المعار والمستعار.
 */
import fs from "node:fs";
import { adminSetPasswordFields, DEFAULT_FIRST_PASSWORD, defaultFirstPasswordFields, initialPasswordExpired, newPasswordProblem } from "../src/server/accountPassword";
import { holderCardModel, FIRST_PASSWORD_DAYS } from "../src/utils/seatAccessCard";
import { loanStripOf, scheduleOccupiesApprovedBarterWindow, scheduleViolatesApprovedBarterWindow } from "../src/utils/hallBarterWindow";

let failed = 0;
function check(ok: unknown, label: string, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) { failed += 1; if (detail !== undefined) console.log(detail); }
}
const read = (path: string) => fs.readFileSync(path, "utf8");
const DAY = 86_400_000;
const issuedAt = Date.parse("2026-11-05T08:00:00Z");

{
  const fields = defaultFirstPasswordFields("hash-value", "vault-value", issuedAt);
  check(fields.MustChangePassword === true, "P1 الإصدار يُلزم بالتغيير");
  check(Date.parse(fields.InitialPasswordExpiresAt) === issuedAt + FIRST_PASSWORD_DAYS * DAY && FIRST_PASSWORD_DAYS === 7, "P1 المدة سبعة أيام من الإصدار");
  check(!Object.values(fields).includes(DEFAULT_FIRST_PASSWORD), "P1 لا نصّ للكلمة في حقول الحساب");
  check(!initialPasswordExpired(fields, issuedAt + 7 * DAY - 1), "P1 قبل اللحظة الأخيرة تعمل");
  check(initialPasswordExpired(fields, issuedAt + 7 * DAY), "P1 بعد سبعة أيام تسقط");
  check(!initialPasswordExpired({ ...fields, MustChangePassword: false }, issuedAt + 30 * DAY), "P1 من اختار كلمته لا تمسّه المدة");
  check(!initialPasswordExpired({ MustChangePassword: true }, issuedAt + 30 * DAY), "P1 حسابٌ قديم بلا ختم لا يُقفل");
  check(newPasswordProblem("something-else", DEFAULT_FIRST_PASSWORD) !== null, "P1 لا تُختار الافتراضية كلمةً دائمة");
}

{
  check(adminSetPasswordFields("Chosen-by-admin").MustChangePassword === true && adminSetPasswordFields("Chosen-by-admin").InitialPasswordExpiresAt === "", "P2 كلمة المسؤول تُغيَّر بلا مدة");
  check(Boolean(adminSetPasswordFields(DEFAULT_FIRST_PASSWORD, issuedAt).InitialPasswordExpiresAt), "P2 الافتراضية من «المستخدمون» لها مدتها أيضاً");
  const auth = read("src/server/routes/authRoutes.ts");
  const login = auth.slice(auth.indexOf('app.post("/api/auth/login"'), auth.indexOf('app.post("/api/auth/change-password"'));
  check(login.indexOf("verifyPassword") < login.indexOf("initialPasswordExpired(") && login.indexOf("initialPasswordExpired(") < login.indexOf("createSession"), "P2 الرفض بعد التحقق وقبل الجلسة");
  const change = auth.slice(auth.indexOf('app.post("/api/auth/change-password"'), auth.indexOf('app.post("/api/auth/logout"'));
  check(change.includes('InitialPasswordExpiresAt: ""') && change.includes("deleteOtherSessionsForUser"), "P2 التغيير يمحو المدة ويغلق الجلسات الأخرى");
  const seats = read("src/server/seatsRoutes.ts");
  check(!seats.includes("generateInitialPassword"), "P2 بطاقات الرؤساء بالكلمة الافتراضية");
  check(/"\/api\/seats\/:id\/first-password", requirePowerAdmin/.test(seats) && seats.includes("if (!seat.MustChangePassword)"), "P2 إعادة الإصدار للمدير، ولا تمحو كلمة اختارها صاحبها");
  check(!/SystemUserPass: DEFAULT_FIRST_PASSWORD/.test(seats), "P2 لا تُكتب الكلمة نصّاً");
  const base = { origin: "https://schedule-kw.com", login: "seat-login", seatName: "فريق", roleLabel: "رئيس", holderName: "اسم", mustChangePassword: true };
  check(holderCardModel({ ...base, expired: true }).note.includes("انتهت"), "P2 البطاقة تقول إن الكلمة انتهت");
}

{
  const loan = { status: "approved", day: "fmonday", startTime: "11:00", endTime: "12:00", roomId: "room-1", requesterCollegeId: 1, requesterSectionId: 20, ownerCollegeId: 1, ownerSectionId: 10 };
  const lenderRow = (start: string, end: string) => ({ roomId: "room-1", AdCollegeId: 1, AdSectionId: 10, fmonday: true, fstarttime: start, fendtime: end }) as any;
  check(scheduleViolatesApprovedBarterWindow(lenderRow("11:00", "12:00"), [loan]), "L1 المعير داخل الإعارة: ممنوع");
  check(!scheduleViolatesApprovedBarterWindow(lenderRow("09:00", "10:00"), [loan]), "L1 المعير خارج الإعارة: مسموح");
  check(!scheduleViolatesApprovedBarterWindow(lenderRow("11:00", "12:00"), [{ ...loan, status: "cancelled", revokedApprovedWindow: true }]), "L1 بعد إنهاء الإعارة: مسموح");
  check(scheduleOccupiesApprovedBarterWindow(lenderRow("11:30", "12:30"), loan), "L2 موعدٌ قائم يُحسب شاغلاً للنافذة");
  const routes = read("src/server/routes/hallBarterRoutes.ts");
  check(routes.includes("const roomRows=occupyingRows.filter") && routes.includes("reservationRows(holdEntries,termId)"), "L2 الوقت المشغول أو المحجوز لا يُعرض للمستعير");
  check(routes.includes("clash:clashesWithHolder(request)"), "L2 ما شُغل بعد الطلب يظهر تعارضاً للطرفين");
  check(routes.includes('"/api/hall-barter/requests/:id/end"') && /isScopeAllowed\(req,request\.ownerCollegeId,request\.ownerSectionId\)/.test(routes.slice(routes.indexOf("/end\""))), "L3 الإنهاء للقسم المضيف");

  const strip = loanStripOf([loan, { ...loan, day: "fsunday", startTime: "08:00", endTime: "09:30", requesterSectionId: 10, ownerSectionId: 30 }, { ...loan, status: "pending" }], 1, 10);
  check(strip.lentMinutes === 60 && strip.borrowedMinutes === 90, "L4 الرسم يجمع المعتمد فقط", strip);
  check(strip.days.length === 5 && strip.days[1].segments[0]?.kind === "lent" && strip.days[0].segments[0]?.kind === "borrowed", "L4 لكل يوم شريطه", strip.days);
  check(loanStripOf([loan], 1, 99).lentMinutes === 0, "L4 قسمٌ لا صلة له: لا شيء");
}

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log("first-password-room-loans audit passed");
