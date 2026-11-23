/**
 * ── الطباعة داخل التطبيق الرسمي (WKWebView) ─────────────────────────────────
 * window.open("") يُرجع null هناك وجسرُ الطباعة يطبع الإطارَ الرئيسي وحده: فالطباعةُ في طبقةٍ داخل الصفحة،
 * ولا مسارَ Safari (execCommand) ولا إشعارُ «افتح في Safari». والمتصفح كما كان.
 */
import fs from "node:fs";
import { extractPrintParts, printInPage, PRINT_SHEET_ID } from "../src/utils/printEngine";

let failed = 0;
const check = (ok: unknown, label: string) => { if (ok) console.log(`\x1b[32m✓ ${label}\x1b[0m`); else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const read = (f: string) => fs.readFileSync(f, "utf8");

const HTML = "<!doctype html><html><head><style>.a{color:red}</style></head><body><p class=\"sheet\">x</p><script>alert(1)</script></body></html>";
const p = extractPrintParts(HTML);
check(/\.a\{color:red\}/.test(p.css) && /sheet/.test(p.body), "P1 تُستخرج الأنماط والجسم");

const nodes: any[] = [];
const mk = (tag: string): any => ({ tag, attrs: {} as any, removed: false, setAttribute(k: string, v: string) { this.attrs[k] = v; },
  remove() { this.removed = true; }, addEventListener() {}, querySelector: () => ({ addEventListener() {} }), set innerHTML(v: string) { this._h = v; }, get innerHTML() { return this._h; } });
const doc: any = { createElement: mk, getElementById: () => null, head: { appendChild: (n: any) => nodes.push(n) }, body: { appendChild: (n: any) => nodes.push(n) } };
let printed = 0;
const close = printInPage(HTML, doc, () => { printed++; });
const overlay = nodes.find(n => n.id === PRINT_SHEET_ID);
check(overlay && /sheet/.test(overlay.innerHTML), "P2 الورقةُ في طبقةٍ داخل الصفحة (لا نافذة)");
close(); check(overlay.removed, "P3 الإغلاق يزيل الطبقة");

const sheet = read("src/utils/printEngine.ts");
check(/if \(isNativeApp\(\)\) \{ printInPage\(html\); return true; \}\n\s*const win = window\.open/.test(sheet), "P4 التطبيق: طبقةٌ داخلية قبل أي window.open؛ المتصفح: نافذةٌ كما كان");
check(/@media print\{body>\*:not\(#\$\{PRINT_SHEET_ID\}\)\{display:none/.test(sheet), "P5 @media print تُخفي بقيّة التطبيق");
check(!/سمح المتصفّح/.test(read("src/components/RoomDoorTools.tsx")) && !/اسمح بالنوافذ المنبثقة/.test(read("src/components/PlanSheetPublisher.tsx")), "P6 لا رسالةُ «النوافذ المنبثقة» ");
check(/printSheet\(html/.test(read("src/components/MasariQrButton.tsx")) && /printSheet\(html/.test(read("src/components/PlanSheetPublisher.tsx")) && /printInPage\(html\)/.test(read("src/components/RoomDoorTools.tsx")), "P7 المواضع الثلاثة تستعمل الطباعة الداخلية في التطبيق");

const pwa = read("src/utils/pwaPrintHelp.ts");
check(/if \(isNativeApp\(\) \|\| !isIosStandalonePwa\(\)\) return false;/.test(pwa), "P8 لا إشعارَ «افتح في Safari» في التطبيق");
check(/canExecCommandPrint = \(\) => isSafariPrint\(\) && !isNativeApp\(\)/.test(read("src/utils/printEngine.ts")) && /canExecCommandPrint\(\) && typeof document\.execCommand/.test(read("src/components/RegistrarRequests.tsx")), "P9 RegistrarRequests/printEngine: لا execCommand في التطبيق");
check(/SAFARI_PRINT_ENGINE && !isNativeApp\(\) && typeof document\.execCommand/.test(read("src/components/Reports.tsx")), "P10 Reports: لا execCommand في التطبيق");
check(/isWebKitSafari && !isNativeApp\(\) && typeof document\.execCommand/.test(read("src/components/ScheduleReview.tsx")), "P11 ScheduleReview: لا execCommand في التطبيق");
check(/data-print-rotate|printRotate/.test(read("src/utils/printEngine.ts")) && /isSafariPrint\(\) \|\| isIosChromePrint\(\)/.test(read("src/utils/printEngine.ts")), "P12 تدويرُ الورقة العرضية في WebKit باقٍ كما كان");

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log("\nOK");
