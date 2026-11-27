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
 *  U11 بعد «تجربة النظام» أو الدخول بكلمة السر: لا نافذةَ بصمةٍ جارية ولا إعادةٌ مؤجّلة ولا تلقائيةٌ حتى خروجٍ صريح
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
check(/<PasskeyEntry onSuccess=\{onLoginSuccess\} \/>/.test(login) && /\{recovery \? null : passkeyOnly/.test(login) && /<PasskeyEntry compact onSuccess=\{onLoginSuccess\}/.test(login), "U1 يُعرض في شاشة الدخول (بطاقةً مضغوطة على جهازٍ مسجَّل) لا في استعادة كلمة السر");
check(/\{recovery \|\| passkeyOnly \? null : \(/.test(login), "U1 البطاقةُ المضغوطة تُخفي حقلَي الدخول حتى يُختار «كلمة السر» (على طريقة مراس)");

/* U2: تعديلُ Login.tsx محصور */
const loginLines = login.split("\n").filter(line => /Passkey/.test(line));
check(loginLines.length <= 6, "U2 Login.tsx: ذِكرُ البصمة محصور (استيرادٌ وحالةُ البطاقة وموضعا العرض وسطرا إنهاء التلقائية عند الدخول بغيرها)");
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
check(/passkeyDeviceRemembered\(\)/.test(manager) && /البصمة مفعّلة على هذا الجهاز/.test(manager) && /thisDevice && items\.length && !reRegister/.test(manager), "U9 جهازٌ مسجَّل لا يُعرض له «فعّل» بل حالة «مفعّلة على هذا الجهاز»");
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
check(/schedule-passkey-device/.test(util) && /schedule-passkey-offer/.test(util) && /schedule-passkey-name/.test(util) && (util.match(/safeStorage\.set\(/g) || []).length === 3, "U9 ثلاث علامات فقط في المتصفح عبر التخزين الآمن: الجهاز، والعرض، واسمُ الترحيب");
check(!/localStorage|sessionStorage/.test(all), "U9 لا وصولَ مباشراً إلى localStorage (يفشل في وضع الخصوصية)");
check(!/console\./.test(all), "U9 لا طباعةَ للطرفية في الواجهة");

/* U10: الدخولُ بالبصمة تلقائياً (طلب المالك، طريقة «مراس») */
check(/safeStorage\.get\(AUTO_KEY, "session"\)/.test(entry) && /if \(!ready \|\| skipAuto\.current \|\| autoTried\(\) \|\| autoSuppressed\(\)\) return;\s*markAutoTried\(\);/.test(entry), "U10 محاولةٌ تلقائية واحدة لكل تبويب، تُعلَّم قبل أن تبدأ");
check(/visibilityState !== "visible"/.test(entry) && /AUTO_SETTLE_MS = 450/.test(entry), "U10 بعد ظهور الصفحة واستقرار الواجهة");
check(/if \(ceremonyBusy \|\| /.test(entry) && /let ceremonyBusy = false;/.test(entry), "U10 لا نافذتا بصمة في آنٍ واحد");
check(/isInvitationHash\(window\.location\.hash\)/.test(entry) && /has\("username"\)/.test(entry), "U10 لا تلقائيةَ عند فتح بطاقة دخول أو رابطٍ باسم مستخدم");
check(/arrivedForAnotherLogin\(\)\) \{ skipAuto\.current = true; markAutoTried\(\); \}/.test(entry), "U10 بطاقةُ دخولٍ لغيره تُعلَّم في التبويب فلا تعود التلقائيةُ بعد حذف الرابط");
check((app.match(/suppressPasskeyAuto\(\);/g) || []).length === 2, "U10 الخروجُ الصريح يوقف التلقائية في التبويب");
check(/!\(automatic && failure\?\.failure === "cancelled"\)/.test(entry), "U10 إلغاءُ النافذة التلقائية صامت");
check(/hiddenAt = ceremonyBusy \? 0 : Date\.now\(\)/.test(entry), "U10 نافذةُ البصمة نفسها لا تُحسب غياباً فلا تُعيد التلقائية بعد إلغائها (لا حلقة)");
check(/if \(automatic && failure\?\.failure === "cancelled" && !\(error as any\)\?\.notFocused\) safeStorage\.set\(SUPPRESS_KEY, "1", "session"\);/.test(entry) && /autoSuppressed\(\)\) return;/.test(entry), "U10 إلغاءُ النافذة التلقائية يوقفها في الجلسة (والرفضُ لعدم التركيز لا يوقفها)");
check(/export const suppressPasskeyAuto = \(\) => \{ sessionOpen = false; safeStorage\.remove\(AUTO_KEY, "session"\); safeStorage\.remove\(SUPPRESS_KEY, "session"\); \};/.test(entry), "U10 الخروجُ الصريح يرفع الإيقاف فتعود المحاولةُ التلقائية مرةً في الدخول القادم");
/* U11: «تجربة النظام» (والدخولُ بكلمة السر) تُنهي البصمةَ التلقائية — تسجيلُ المالك: ظلّت النافذةُ تعود فوق لوحة التجربة */
check(/export const endPasskeyAuto = \(\) => \{ sessionOpen = true; markAutoTried\(\); safeStorage\.set\(SUPPRESS_KEY, "1", "session"\); dropRetry\(\); abortPasskeyLogin\(\); \};/.test(entry), "U11 endPasskeyAuto: يُعلِّم الجلسة ويُلغي الإعادةَ المؤجّلة ويُغلق النافذةَ الجارية");
check(/const enterDemo = async \(\) => \{[\s\S]*?if \(!demoEnabled\) return;[\s\S]*?endPasskeyAuto\(\);[\s\S]*?fetch\("\/api\/auth\/demo"/.test(login), "U11 ضغطةُ «تجربة النظام» نفسُها تُنهي التلقائية قبل طلب الجلسة");
check(/const signedIn = \([^)]*\) => \{ endPasskeyAuto\(\); onLoginSuccess\(data\); \};/.test(login) && (login.match(/signedIn\((data|session)\);/g) || []).length === 3 && (login.match(/\bonLoginSuccess\((data|session)\)/g) || []).length === 1, "U11 كلُّ دخولٍ بغير البصمة (التجربة، كلمة السر، الاستعادة) يمرّ بـ signedIn");
check(/<PasskeyEntry onSuccess=\{onLoginSuccess\} \/>/.test(login), "U11 الدخولُ بالبصمة نفسُه لا يُنهي التلقائية (الخروجُ الصريح يعيدها كما كانت)");
check(/return \(\) => \{ mounted\.current = false; dropRetry\(\); \};/.test(entry), "U11 خروجُ المكوّن من الشاشة يُلغي الإعادةَ المؤجّلة (focus والمهلة)");
check(/const stop = \(\) => \{ fired = true; window\.removeEventListener\("focus", retry\); window\.clearTimeout\(timer\); \};/.test(entry) && /cancelRetry = stop;/.test(entry), "U11 الإعادةُ المؤجّلة قابلةٌ للإلغاء: تُزال الأذنُ ويُمسح المؤقّت");
check(/if \(ceremonyBusy \|\| \(automatic && \(!mounted\.current \|\| autoSuppressed\(\)\)\)\) return;/.test(entry), "U11 لا نافذةَ تلقائية من مكوّنٍ خرج من الشاشة ولا بعد جلسةٍ فُتحت");
check(/if \(!mounted\.current \|\| \(automatic && sessionOpen\)\) return;/.test(entry) && /if \(\(error as any\)\?\.aborted \|\| !mounted\.current\) return;/.test(entry), "U11 نتيجةُ نافذةٍ أُغلقت أو تأخّرت لا تُستدعى ولا تُعرض لها رسالة");
check(/if \(cancelled \|\| autoSuppressed\(\)\) return;/.test(entry), "U11 المؤقّتُ المسلَّح قبل الدخول لا يفتح النافذة بعده");
check(/signal: controller\.signal/.test(util) && /export function abortPasskeyLogin\(\)/.test(util), "U11 النافذةُ مربوطةٌ بـ AbortController وتُغلق بـ abortPasskeyLogin");
check(/elapsedMs < NOT_FOCUSED_WITHIN_MS/.test(util), "U11 ✕ من صاحب الجهاز لا يُحسب «بلا تركيز» فلا يُعاد ثلاث مرات (الرفضُ لعدم التركيز فوريّ)");

/* U11 سلوكاً: نافذةٌ معلّقة تُغلق بـ abortPasskeyLogin، والرفضُ العامّ يُفرَّق بالزمن */
{
  const g = globalThis as any;
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
  g.window = { localStorage: storage, sessionStorage: storage, PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: async () => true } };
  g.atob ??= (t: string) => Buffer.from(t, "base64").toString("binary");
  let getImpl: (opts: any) => Promise<any> = async () => null;
  Object.defineProperty(g, "navigator", { configurable: true, value: { userAgent: "test", credentials: { create: async () => null, get: (opts: any) => getImpl(opts) } } });
  g.fetch = async () => ({ ok: true, status: 200, json: async () => ({ challenge: "AAAA", rpId: "localhost", timeout: 60000, allowCredentials: [] }) });
  const { loginWithPasskey, abortPasskeyLogin } = await import("../src/utils/passkeys");
  const generic = "The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.";
  const deny = () => Object.assign(new Error(generic), { name: "NotAllowedError" });

  let sawSignal = false;
  getImpl = (opts: any) => new Promise((_, reject) => { sawSignal = Boolean(opts.signal); opts.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); });
  const pending = loginWithPasskey().then(() => null, (e: any) => e);
  await new Promise(r => setTimeout(r, 10));
  abortPasskeyLogin();
  const aborted: any = await pending;
  check(sawSignal && aborted?.failure === "cancelled" && aborted?.aborted === true, "U11 سلوكاً: abortPasskeyLogin يُغلق النافذةَ المعلّقة بإلغاءٍ صامت (aborted)");

  getImpl = async () => { throw deny(); };
  const instant: any = await loginWithPasskey().then(() => null, (e: any) => e);
  check(instant?.notFocused === true && !instant?.aborted, "U11 سلوكاً: رفضٌ فوريٌّ بالنصّ العامّ ← «بلا تركيز» فتُعاد المحاولة");

  const realNow = Date.now;
  getImpl = async () => { const t = realNow(); Date.now = () => t + 5000; throw deny(); };
  const late: any = await loginWithPasskey().then(() => null, (e: any) => e).finally(() => { Date.now = realNow; });
  check(late?.failure === "cancelled" && late?.notFocused === false, "U11 سلوكاً: النصُّ نفسُه بعد أن رآها صاحبُها (✕) ← إلغاءٌ واعٍ يوقف التلقائية، لا إعادة");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
