/**
 * ── نصوص التطبيق الرسمي: لا «Safari» ولا «المتصفح» ولا إملاء بلا إذن ───────────
 * التطبيق (WKWebView) لا يُظهر لمستخدمه كلمة Safari/المتصفح، ولا زرَّ إملاءٍ حتى يحمل الغلاف نصوصَ إذن الميكروفون.
 * والمتصفح كما كان.
 */
import fs from "node:fs";
import vm from "node:vm";

let failed = 0;
const check = (ok: unknown, label: string) => { if (ok) console.log(`\x1b[32m✓ ${label}\x1b[0m`); else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const read = (f: string) => fs.readFileSync(f, "utf8");

const handoff = read("src/components/AppHandoffEntry.tsx");
const visible = handoff.replace(/data-guide-ignore="[^"]*"/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
check(!/Safari|سفاري|المتصفح/.test(visible), "C1 AppHandoffEntry: لا Safari ولا «المتصفح» في ما يراه المستخدم");

const passkey = read("src/components/PasskeyManager.tsx");
check(/isNativeApp\(\) \? "هذا الجهاز" : "هذا المتصفح أو الجهاز"/.test(passkey), "C2 PasskeyManager: «هذا الجهاز» في التطبيق، والنص القديم في المتصفح");
check(/isNativeApp\(\) \? "تعذّر النسخ\. حاول مرة أخرى\." : "تعذّر النسخ\. حاول مرة أخرى من متصفح يدعم الحافظة\."/.test(read("src/components/AccessCard.tsx")), "C3 AccessCard: نصٌّ محايد في التطبيق");
check(/const supported = !isNativeApp\(\) && Boolean\(ctor\(\)\)/.test(read("src/hooks/useSpeechAsk.ts")), "C4 useSpeechAsk: لا زرّ ميكروفون في التطبيق");

/* الإملاء المرسَل من الخادم: نُشغّل VI.ok في بيئتين. */
const src = read("src/server/voiceInputScript.ts");
const m = src.match(/VI\.native=function[\s\S]*?VI\.ok=function\(\)\{[^}]*\};/);
check(!!m, "C5 VI.ok موجودة");
if (m) {
  const run = (win: any) => { const ctx: any = { window: win, VI: { Rec: () => win.SpeechRecognition || null } }; vm.createContext(ctx); vm.runInContext(m[0], ctx); return ctx.VI.ok(); };
  const speech = function () {};
  check(run({ SpeechRecognition: speech }) === true, "C6 المتصفح: الإملاء يظهر كما كان");
  check(run({ SpeechRecognition: speech, Capacitor: { isNativePlatform: () => true } }) === false, "C7 التطبيق: لا إملاء");
}

/* الإشعارات: لا دليلَ تثبيت ولا نصَّ «متصفحك» في التطبيق (حالةُ gxPushState تنتهي بـ null هناك). */
const extras = read("src/server/studentExtrasScript.ts");
check(/function gxPushState\(\)\{var d=GX\.d&&GX\.d\.push;if\(!d\|\|gxNative\(\)\)return Promise\.resolve\(null\)/.test(extras), "C8 studentExtras: لا بطاقة إشعارات ولا «متصفحك لا يدعم» في التطبيق");
const push = read("src/utils/pushClient.ts");
check(/isNativeApp\(\)/.test(push), "C9 pushClient يتخطّى التطبيق");

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nOK");
