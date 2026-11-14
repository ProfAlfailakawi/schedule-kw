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
const NORMALIZER_SPANS = /٠١٢٣٤٥٦٧٨٩|۰۱۲۳۴۵۶۷۸۹|\[\\?d?٠-٩|٠-٩|۰-۹|\[0٠\]|\[[^\]]*[٫٬][^\]]*\]|\/[٫٬]\/[gimsuy]*|["']?[٠-٩۰-۹]["']?\s*:\s*["']?\d["']?/g;
/** سطرٌ بعد حذف مواضع كود التحويل منه: ما بقي من أرقامٍ هندية فهو نصٌّ يظهر للمستخدم. */
const withoutNormalizers = (line: string) => line.replace(NORMALIZER_SPANS, "");
const DIGIT_LITERAL = "[\"'`](?:٠١٢٣٤٥٦٧٨٩|۰۱۲۳۴۵۶۷۸۹)[\"'`]";
/** ما يُنتج أرقاماً هندية من لاتينية (الفحصُ على الملف كلِّه لا سطراً سطراً). */
const PRODUCERS: RegExp[] = [
  new RegExp(DIGIT_LITERAL + "\\s*(?:\\.charAt\\(|\\.at\\(|\\.split\\(|\\.slice\\(|\\.substr|\\[)"),
  new RegExp("\\.\\.\\." + DIGIT_LITERAL),
  new RegExp("Array\\.from\\(\\s*" + DIGIT_LITERAL),
  /nu-arab/,
];
const ALLOW = /latin-digits:\s*allow\s+\S/;
/** تنسيقٌ مرتبط بلغةٍ عربية بلا -u-nu-latn (المقارنةُ والترتيبُ لا تُخرج أرقاماً فلا تدخل هنا). */
const ARABIC_LOCALE_FORMAT = /(?:Intl\.(?:NumberFormat|DateTimeFormat|RelativeTimeFormat)|toLocale(?:Date|Time)?String)\(\s*["'`]ar(?:-[A-Z]{2})?["'`]/g;
/** تنسيقٌ بلا لغةٍ صريحة: يتبع لغةَ المتصفح (وقد تكون عربيةً فتخرج هندية). */
const DEFAULT_LOCALE_FORMAT = /toLocale(?:Date|Time)?String\(\s*(?:undefined\s*[,)]|\))|Intl\.(?:NumberFormat|DateTimeFormat)\(\s*(?:undefined\s*[,)]|\))/;

/** يحذف التعليقات مع احترام النصوص: «//» داخل نصٍّ ليست تعليقاً. */
function stripComments(source: string): string {
  let out = "", i = 0, quote = "";
  while (i < source.length) {
    const ch = source[i], next = source[i + 1];
    /* داخل «`» (صفحاتٌ كاملة تُكتب قالباً) تعليقاتُ CSS/JS فيها تعليقاتٌ أيضاً؛ داخل ' و" لا. */
    if (quote && quote !== "`") {
      out += ch;
      if (ch === "\\") { out += next ?? ""; i += 2; continue; }
      if (ch === quote || ch === "\n") quote = "";
      i++; continue;
    }
    if (ch === "/" && next === "*") { const end = source.indexOf("*/", i + 2); const stop = end < 0 ? source.length : end + 2; out += source.slice(i, stop).replace(/[^\n]/g, ""); i = stop; continue; }
    if (ch === "/" && next === "/" && source[i - 1] !== ":") { while (i < source.length && source[i] !== "\n") i++; continue; }
    if (quote === "`") { out += ch; if (ch === "\\") { out += next ?? ""; i += 2; continue; } if (ch === "`") quote = ""; i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    out += ch; i++;
  }
  return out;
}

export function scanText(source: string): Array<{ line: number; kind: string; text: string }> {
  const raw = source.split("\n"), clean = stripComments(source), code = clean.split("\n"), found: Array<{ line: number; kind: string; text: string }> = [];
  const allowed = (line: number) => ALLOW.test(raw[line - 1] || "");
  const add = (line: number, kind: string) => { if (!allowed(line) && !found.some(hit => hit.line === line && hit.kind === kind)) found.push({ line, kind, text: (raw[line - 1] || "").trim().slice(0, 140) }); };
  const lineOf = (index: number) => clean.slice(0, index).split("\n").length;
  for (const pattern of PRODUCERS) { const hit = pattern.exec(clean); if (hit) add(lineOf(hit.index), "producer"); }
  /* متغيّرٌ يحمل مجموعةَ الأرقام ثم يُفهرَس به أو يُفكَّك: إنتاجٌ ولو بُعد التعريف. */
  for (const def of clean.matchAll(new RegExp("(?:const|let|var)\\s+(\\w+)\\s*(?::[^=]+)?=\\s*" + DIGIT_LITERAL, "g"))) {
    const use = new RegExp("\\b" + def[1] + "\\s*(?:\\[|\\.charAt\\(|\\.at\\(|\\.split\\(|\\.map\\()|\\.\\.\\." + def[1] + "\\b|Array\\.from\\(\\s*" + def[1] + "\\b").exec(clean.slice((def.index ?? 0) + def[0].length));
    if (use) add(lineOf((def.index ?? 0) + def[0].length + use.index), "producer");
  }
  for (const hit of clean.matchAll(ARABIC_LOCALE_FORMAT)) {
    const call = clean.slice(hit.index, (hit.index ?? 0) + 200).split(/\)\s*[;,.]|\)\s*\n/)[0];
    if (!/nu-latn/.test(call)) add(lineOf(hit.index ?? 0), "locale");
  }
  code.forEach((line, index) => {
    if (DEFAULT_LOCALE_FORMAT.test(line)) add(index + 1, "default-locale");
    if (ARABIC_DIGIT.test(withoutNormalizers(line))) add(index + 1, "digits");
  });
  return found.sort((a, b) => a.line - b.line);
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

check(scanText("const D = \"٠١٢٣٤٥٦٧٨٩\"; const f = n => String(n).split(\"\").map(c => D[+c]).join(\"\");").some(hit => hit.kind === "producer"), "C12 متغيّرٌ يحمل الأرقام الهندية ويُفهرَس به يُلتقط");
check(scanText("const a = [...\"٠١٢٣٤٥٦٧٨٩\"];").some(hit => hit.kind === "producer") && scanText("new Intl.NumberFormat('ar', { numberingSystem: 'x' }); f('ar-u-nu-arab')").some(hit => hit.kind === "producer"), "C13 الانتشارُ و nu-arab يُلتقطان");
check(scanText("x.replace(/٫/g, '.') + ' ٣ أيام'").some(hit => hit.kind === "digits"), "C14 كودُ التحويل في السطر لا يُعفي نصاً هندياً بجانبه");
check(scanText("const f = new Intl.NumberFormat(\n  \"ar-KW\",\n  { a: 1 });").some(hit => hit.kind === "locale"), "C15 استدعاءٌ متعدّد الأسطر بلا -u-nu-latn يُلتقط");
check(scanText("const u = \"http://x\"; const t = \"٣ أيام\";").some(hit => hit.kind === "digits"), "C16 «//» داخل نصٍّ لا تُخفي ما بعدها");
check(scanText("const D = \"٠١٢٣٤٥٦٧٨٩\"; const i = D.indexOf(c);").length === 0, "C17 البحثُ في مجموعة الأرقام (indexOf) مسموح");

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
