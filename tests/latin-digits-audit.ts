/**
 * ── الأرقام لاتينية (0-9) فقط، في كل الشاشات والصفحات والتقارير ─────────────────────────────
 *
 * قرارُ المالك: لا أرقامَ هندية (٠-٩) ولا علامةَ «٪» ولا فاصلتان عربيتان (٫ ٬) تظهر للمستخدم. ويفلت هذا بطرق ثلاث:
 *   ١) نصٌّ مكتوبٌ بأرقامٍ هندية في الكود («آخر ٧ أيام»)؛
 *   ٢) تنسيقٌ بلغةٍ عربية بلا `-u-nu-latn` (ar-KW في المتصفح يُخرج «١٤‏/١١‏/٢٠٢٦»)، أو بلا لغةٍ فيتبع لغةَ المتصفح؛
 *   ٣) دالّةٌ تُحوّل الأرقامَ اللاتينية إلى هندية وقتَ التشغيل (كانت AN في صفحة الأستاذ).
 *
 * المسموح: أكوادُ التحويل التي تقرأ ما يكتبه المستخدم بالأرقام الهندية وتحوّله إلى لاتينية (replace(/[٠-٩]/…) و"٠١٢٣٤٥٦٧٨٩".indexOf(…))،
 * والتعليقات؛ وسطرٌ مقصودٌ حقاً يحمل `latin-digits: allow <السبب>`.
 * بلا خادم ولا متصفح.
 */
import fs from "node:fs";
import path from "node:path";

let failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => { if (!ok) failed++; console.log(`${ok ? "✓" : "✗"} ${label}`); if (!ok && extra) console.log(extra); };

const ARABIC_DIGIT = /[٠-٩۰-۹٪٫٬]/;
/** كودُ تحويلٍ من الهندية إلى اللاتينية: يحمل مجموعةَ الأرقام الهندية لأنه يقرؤها لا ينتجها. */
const NORMALIZER = /٠١٢٣٤٥٦٧٨٩|۰۱۲۳۴۵۶۷۸۹|\[\\?d?٠-٩|٠-٩|۰-۹|\[0٠\]|0x0660|0x06f0|0x06F0|ARABIC_DIGITS|ARABIC_INDIC|EASTERN_INDIC|\\u0660|DIG=|\[[^\]]*[٫٬][^\]]*\]|\/[٫٬]\/[gimsuy]*/;
/** ما يُنتج أرقاماً هندية من لاتينية: يُرفض ولو حمل مجموعةَ الأرقام. */
const PRODUCER = /["'`](?:٠١٢٣٤٥٦٧٨٩|۰۱۲۳۴۵۶۷۸۹)["'`]\s*(?:\.charAt\(|\.at\(|\[)/;
const ALLOW = /latin-digits:\s*allow\s+\S/;
/** تنسيقٌ مرتبط بلغةٍ عربية بلا -u-nu-latn (المقارنةُ والترتيبُ لا تُخرج أرقاماً فلا تدخل هنا). */
const ARABIC_LOCALE_FORMAT = /(?:Intl\.(?:NumberFormat|DateTimeFormat|RelativeTimeFormat)|toLocale(?:Date|Time)?String)\(\s*["'`]ar(?:-[A-Z]{2})?["'`]/;
/** تنسيقٌ بلا لغةٍ صريحة: يتبع لغةَ المتصفح (وقد تكون عربيةً فتخرج هندية). */
const DEFAULT_LOCALE_FORMAT = /toLocale(?:Date|Time)?String\(\s*(?:undefined\s*[,)]|\))|Intl\.(?:NumberFormat|DateTimeFormat)\(\s*(?:undefined\s*[,)]|\))/;

function stripComments(source: string): string {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ""));
  return noBlock.split("\n").map(line => line.replace(/(?<![:"'`])\/\/.*$/, "")).join("\n");
}

export function scanText(source: string): Array<{ line: number; kind: string; text: string }> {
  const raw = source.split("\n"), code = stripComments(source).split("\n"), found: Array<{ line: number; kind: string; text: string }> = [];
  code.forEach((line, index) => {
    const original = raw[index] || "";
    if (ALLOW.test(original)) return;
    if (PRODUCER.test(line)) { found.push({ line: index + 1, kind: "producer", text: original.trim().slice(0, 140) }); return; }
    if (ARABIC_LOCALE_FORMAT.test(line) && !/nu-latn/.test(line)) found.push({ line: index + 1, kind: "locale", text: original.trim().slice(0, 140) });
    if (DEFAULT_LOCALE_FORMAT.test(line)) found.push({ line: index + 1, kind: "default-locale", text: original.trim().slice(0, 140) });
    if (ARABIC_DIGIT.test(line) && !NORMALIZER.test(line)) found.push({ line: index + 1, kind: "digits", text: original.trim().slice(0, 140) });
  });
  return found;
}

/* ── ضوابط الحارس نفسه: يلتقط الخلل ويُسقط ما يجب إسقاطه ─────────────────────────────── */
check(scanText("<span>آخر ٧ أيام</span>").length === 1, "C1 نصٌّ بأرقامٍ هندية يُلتقط");
check(scanText("const t = `${n}٪ من التخرج`;").length === 1, "C2 علامة «٪» تُلتقط");
check(scanText(".replace(/[٠-٩]/g, d => String(\"٠١٢٣٤٥٦٧٨٩\".indexOf(d)))").length === 0, "C3 كودُ تحويلٍ من الهندية إلى اللاتينية مسموح");
check(scanText("// تعليقٌ فيه ٣ أيام\n/* وآخر ٤ */").length === 0, "C4 التعليقات مسموحة");
check(scanText("const s = \"٠١٢٣٤٥٦٧٨٩\".charAt(+d);").some(hit => hit.kind === "producer"), "C5 دالّةٌ تُنتج الهندية من اللاتينية تُلتقط ولو حملت مجموعةَ الأرقام");
check(scanText("d.toLocaleDateString(\"ar-KW\")").some(hit => hit.kind === "locale"), "C6 ar-KW بلا -u-nu-latn يُلتقط");
check(scanText("d.toLocaleDateString(\"ar-KW-u-nu-latn\")").length === 0 && scanText("a.localeCompare(b, \"ar\")").length === 0 && scanText("new Intl.Collator(\"ar\", { numeric: true })").length === 0, "C7 ar-KW-u-nu-latn والمقارنةُ والترتيب مسموحة");
check(scanText("d.toLocaleDateString()").some(hit => hit.kind === "default-locale") && scanText("n.toLocaleString(undefined, { a: 1 })").some(hit => hit.kind === "default-locale"), "C8 تنسيقٌ بلا لغةٍ صريحة يُلتقط");
check(scanText("const x = \"٣\"; // latin-digits: allow مثالٌ في دليل المستخدم").length === 0, "C9 الاستثناءُ المكتوب بسببه مسموح");
check(scanText("var x = '٫'").length === 1, "C10 الفاصلةُ العربية خارج كود التحويل تُلتقط");
check(scanText(".replace(/٫/g, \".\")").length === 0 && scanText("s.replace(/[:٫.]/g, \":\")").length === 0 && scanText(".replace(/[٠-٩۰-۹]/g, d => ARABIC_DIGITS[d] || d)").length === 0, "C11 تحويلُ الفاصلة العربية وخريطةُ الهندية إلى اللاتينية مسموحان");

/* ── المستودع نفسه ──────────────────────────────────────────────────────────── */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "fonts", "generated"]);
function walk(dir: string, exts: readonly string[], out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, exts, out);
    else if (exts.some(ext => name.endsWith(ext)) && stat.size < 3_000_000) out.push(full);
  }
  return out;
}
const files = [...walk("src", [".ts", ".tsx", ".js", ".mjs"]), "server.ts", ...walk("public", [".html", ".js"])].filter(file => fs.existsSync(file));
const violations: string[] = [];
for (const file of files) {
  for (const hit of scanText(fs.readFileSync(file, "utf8"))) violations.push(`${file}:${hit.line} [${hit.kind}] ${hit.text}`);
}
check(files.length > 300, `R0 فُحص ${files.length} ملفاً`);
check(violations.length === 0, `R1 لا أرقامَ هندية ولا «٪» ولا تنسيقاً بلا -u-nu-latn في الواجهة والصفحات (${violations.length} مخالفة)`, violations.slice(0, 25).join("\n"));

/* CSS: لا محتوى مولَّد بأرقامٍ هندية. */
const cssHits: string[] = [];
for (const file of walk("src", [".css"])) {
  const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ""));
  css.split("\n").forEach((line, index) => { if (ARABIC_DIGIT.test(line)) cssHits.push(`${file}:${index + 1}`); });
}
check(cssHits.length === 0, `R2 لا أرقامَ هندية في ملفات الأنماط (${cssHits.length})`, cssHits.slice(0, 10).join("\n"));

const nfr = JSON.parse(fs.readFileSync("docs/srs/modules/18-nfr.json", "utf8"));
check(nfr.requirements.some((requirement: any) => /Latin digits/i.test(requirement.text?.en || "") && (requirement.evidence?.tests || []).includes("tests/latin-digits-audit.ts")), "R3 القاعدةُ موثّقةٌ في وثيقة المتطلبات بهذا الاختبار دليلاً");

console.log(failed ? `\n${failed} فحصاً فشل` : "\nكل الفحوص نجحت");
process.exit(failed ? 1 : 0);
