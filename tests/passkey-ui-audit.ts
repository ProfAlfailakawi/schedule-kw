/**
 * ── «الدخول بالبصمة»: واجهةٌ هادئةٌ صادقةٌ بالفصحى ──────────────────────────────
 *  U1  زرُّ الدخول لا يظهر إلا بدعم WebAuthn ومنصّةٍ تتحقّق من صاحبها وجهازٍ سُجّل من قبل؛ والتراجعُ للنموذج العادي
 *  U2  عدا ما يخصّ شاشة الدخول: تعديلُ Login.tsx سطران (استيراد + موضع) لا أكثر
 *  U3  العرضُ بعد الدخول مرةً: يُحفظ الرفضُ لكل جهاز، ولا يُعرض إلا بوجود خادمٍ يقبل
 *  U4  الإدارةُ بجوار الحساب: قائمة، تفعيل، إزالةٌ بتأكيد، ونصٌّ يقول السقف
 *  U5  كلُّ زرٍّ لا يغيّر بيانات الجدول يحمل data-guide-ignore، ولكل أيقونةٍ وحدَها اسمٌ (aria-label)
 *  U6  النصوصُ بالفصحى: بلا لهجة، ورسائلُ الأخطاء صادقةٌ (إلغاء، عدمُ دعم، غيرُ مسجَّل، انتهاءُ المهلة)
 *  U7  CSS: أهدافُ 44px، ألوانٌ من الرموز (وضعٌ داكن)، وعرضُ 375px
 *  U8  التطبيقُ الرسمي (WKWebView): كشفُ الميزة لا تخمينُ المنصّة، ولا يُمسّ التسليمُ AppHandoffEntry
 *  U9  لا يُخزَّن في المتصفح غيرُ علامتين غيرِ حسّاستين، ولا يُكتب مفتاحٌ ولا معرّفٌ في السجلّ
 */
import fs from "node:fs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const entry = read("src/components/PasskeyEntry.tsx"), offer = read("src/components/PasskeyOffer.tsx"), manager = read("src/components/PasskeyManager.tsx");
const util = read("src/utils/passkeys.ts"), login = read("src/components/Login.tsx"), app = read("src/App.tsx"), css = read("src/styles/73-passkeys.css");

/* U1 */
check(/typeof window\.PublicKeyCredential === "undefined"/.test(util) && /isUserVerifyingPlatformAuthenticatorAvailable/.test(util), "U1 كشفُ الدعم: PublicKeyCredential ثم منصّةٌ تتحقّق من صاحبها");
check(/if \(!passkeyDeviceRemembered\(\)\) return;/.test(entry) && /if \(!ready\) return null;/.test(entry), "U1 الزرُّ يُحجب ما لم يُسجَّل الجهازُ ويُدعم");
check(/if \(failure\?\.failure === "not-registered"\) \{ forgetPasskeyDevice\(\)/.test(entry), "U1 مفتاحٌ أُزيل من الحساب: يُنسى الجهازُ فيختفي الزرّ");
check(/<PasskeyEntry onSuccess=\{onLoginSuccess\} \/>/.test(login) && /\{recovery \? null : <PasskeyEntry/.test(login), "U1 يُعرض في شاشة الدخول لا في استعادة كلمة السر");

/* U2: تعديلُ Login.tsx محصور */
const loginLines = login.split("\n").filter(line => /Passkey/.test(line));
check(loginLines.length === 2, "U2 Login.tsx: سطران يذكران البصمة (استيرادٌ وموضع)");
check(read("src/components/AppHandoffEntry.tsx").indexOf("Passkey") < 0, "U8 AppHandoffEntry لم يُمسّ");
check(!/Passkey/.test(read("src/utils/nativeApp.ts")) && !/Passkey/.test(read("src/server/appHandoff.ts")), "U8 التسليمُ إلى التطبيق لم يُمسّ");
check(!/isNativeApp\(\)|Capacitor|navigator\.userAgent.*wv/.test(entry + util.replace(/suggestedDeviceLabel[\s\S]*?\n}\n/, "")), "U8 يُكشف الدعم بالميزة لا بتخمين المنصّة (فيسقط الزرُّ تلقائياً في غلافٍ لا يعرضها)");

/* U3 */
check(/passkeyDeviceRemembered\(\) \|\| passkeyOfferDismissed\(\)/.test(offer) && /dismissPasskeyOffer\(\)/.test(offer), "U3 العرضُ مرةً: يُحفظ الرفضُ لهذا الجهاز");
check(/list\?\.available && list\.items\.length < list\.limit/.test(offer), "U3 لا يُعرض إن لم يقبل الخادمُ أو امتلأ السقف");
check(/<PasskeyOffer \/>/.test(app) && /<PasskeyManager onClose=\{\(\) => setPasskeysOpen\(false\)\} \/>/.test(app), "U3 مركّبٌ في القشرة، والإدارةُ في القائمة");
check(/فعّل الدخول بالبصمة على هذا الجهاز/.test(offer), "U3 نصُّ العرض كما طُلب");

/* U4 */
check(/fetchPasskeys/.test(manager) && /removePasskey/.test(manager) && /registerPasskey/.test(manager), "U4 قائمةٌ وتفعيلٌ وإزالة");
check(/confirming === item\.ref/.test(manager) && /تأكيد الإزالة/.test(manager), "U4 الإزالةُ بخطوتين (تأكيد)");
check(/بلغتَ الحدّ الأقصى/.test(manager) && /needPassword/.test(manager), "U4 يقول السقفَ ويطلب كلمةَ السر حين يطلبها الخادم");
check(/passkeysOpen/.test(app) && /<Fingerprint \/>/.test(app) && app.indexOf("setPasskeysOpen(true)") < app.indexOf("setDeletionOpen(true)"), "U4 زرٌّ في أزرار الحساب بجوار الخروج وطلب الحذف");

/* U5 */
for (const [name, text] of [["PasskeyEntry", entry], ["PasskeyOffer", offer], ["PasskeyManager", manager]] as const) {
  const buttons = [...text.matchAll(/<button\b(?:=>|[^>])*>/g)].map(match => match[0]);
  check(buttons.length > 0 && buttons.every(tag => /data-guide-ignore=/.test(tag)), `U5 ${name}: كلُّ زرٍّ فيه data-guide-ignore (${buttons.length})`);
  const iconOnly = buttons.filter(tag => !/aria-label=/.test(tag));
  check(iconOnly.every(tag => /onClick=\{\(\) => setConfirming\(""\)\}|onClick=\{close\}|onClick=\{enable\}|onClick=\{onClose\}|type="submit"/.test(tag)), `U5 ${name}: الأزرارُ بلا aria-label نصُّها ظاهر`);
}
check(/aria-label="الدخول بالبصمة"/.test(entry) && /role="alert"/.test(entry), "U5 الزرُّ باسمٍ ورسالةُ الخطأ تُعلَن");
check(/role="region" aria-label="الدخول بالبصمة"/.test(offer) && /aria-label="إغلاق وعدم العرض مرة أخرى"/.test(offer), "U5 العرضُ منطقةٌ مسمّاة وزرُّ إغلاقه مسمّى");
check(/aria-label=\{`إزالة \$\{item\.label\}`\}/.test(manager), "U5 زرُّ الإزالة المصوَّر باسمٍ يذكر الجهاز");

/* U6 */
const all = [entry, offer, manager, util].join("\n");
check(!/(?<![\u0600-\u06FF])(ليش|شلون|وين|هالحين|مب|شنو|يبي|أبي|ابي|زين)(?![\u0600-\u06FF])/.test(all), "U6 لا لهجةَ في نصوص الواجهة");
for (const [failure, fragment] of [["cancelled", "أُلغي الطلب أو انتهت مهلته"], ["unsupported", "لا يدعم الدخول بالبصمة"], ["not-registered", "غير مسجَّل"], ["expired", "انتهت مهلة الطلب"]] as const)
  check(new RegExp(`${failure.includes("-") ? `"${failure}"` : failure}: "[^"]*${fragment}`).test(util), `U6 رسالةٌ صادقة: ${failure}`);
check(/NotAllowedError/.test(util) && /PasskeyError\("cancelled"/.test(util), "U6 إلغاءُ صاحب الجهاز يُقرأ إلغاءً لا عطلاً");

/* U7 */
check(/\.passkey-go\{[^}]*min-height:44px/.test(css.replace(/\s+/g, " ").replace(/\{ /g, "{")) || /\.passkey-go\{\s*min-height:44px/.test(css), "U7 زرُّ الدخول 44px");
for (const selector of ["passkey-offer-close", "passkey-offer-yes", "passkey-plain", "passkey-danger"])
  check(new RegExp(`\\.${selector}[^{]*\\{[^}]*(min-height|height):44px`).test(css.replace(/\n/g, " ")) || new RegExp(`${selector}[^{]*\\{[^}]*(min-height|height):44px`).test(css.replace(/\n/g, " ")), `U7 ${selector} ≥ 44px`);
check(!/#[0-9a-f]{3,8}\b/i.test(css.replace(/#fff\b/g, "").replace(/rgba\(0,0,0,\.18\)/g, "")), "U7 لا ألوانَ ثابتة إلا الأبيض على الزرّ المعبّأ والظلّ — الباقي من الرموز فيتبع الوضعَ الداكن");
check(/max-width:480px/.test(css) && /inset-inline:var\(--s3\)/.test(css) && /box-sizing:border-box/.test(css), "U7 عرضُ 375px: هوامشُ وحقولٌ لا تخرج");
check(/@import "\.\/styles\/73-passkeys\.css";/.test(read("src/index.css")), "U7 الملفُّ مستورَدٌ");

/* U9 */
check(/schedule-passkey-device/.test(util) && /schedule-passkey-offer/.test(util) && (util.match(/safeStorage\.set\(/g) || []).length === 2, "U9 علامتان فقط في المتصفح، عبر التخزين الآمن");
check(!/localStorage|sessionStorage/.test(all), "U9 لا وصولَ مباشراً إلى localStorage (يفشل في وضع الخصوصية)");
check(!/console\./.test(all), "U9 لا طباعةَ للطرفية في الواجهة");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
