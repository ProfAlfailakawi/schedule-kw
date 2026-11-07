/**
 * ── إمكانيةُ الوصول: الأسماء (NFR-022) والتباين (NFR-021) وأهدافُ اللمس (NFR-020) ──
 *
 * فحصٌ ثابت (بلا متصفح) لـ src/**\/*.tsx وصفحات الخادم العامة:
 *  1) كلُّ <input> و<select> و<textarea> له aria-label أو aria-labelledby،
 *     أو تسميةٌ ظاهرة: <label> تحيط به بنصّ، أو <label htmlFor> تشير إلى معرّفه.
 *  2) كلُّ <button> لا يحمل نصّاً (أيقونةٌ فقط) له aria-label أو aria-labelledby.
 *  3) في الصفحات العامة: أزرارُ النسخ والإغلاق (×) لها aria-label صريح.
 *  4) الدرجُ المغلق خارج ترتيب Tab.
 *  5) ألوانُ النص في الوضع الفاتح ≥ 4.5:1 على كل أرضيات التطبيق، والحالاتُ على صبغتها.
 *  6) طبقةُ أهداف اللمس العامة (52-touch-targets.css) مستوردةٌ آخراً وتغطّي الأصناف كلها.
 * والقياسُ الحيّ بالمتصفح يعدّ الأسماء الفارغة والتباين وأهداف اللمس على الشاشات نفسها.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

let passed = 0, failed = 0;
function check(condition: boolean, name: string, detail: string[] = []) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); for (const d of detail.slice(0, 80)) console.log("    " + d); }
}
const root = process.cwd();
const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});

/* استثناءٌ صريح: [ملف، علامة، سبب]. فارغٌ اليوم؛ يُضاف إليه ما لا مفرّ منه وحده. */
const ALLOW: Array<[string, string, string]> = [];
const allowed = (file: string, tag: string) => ALLOW.some(([f, t]) => file.endsWith(f) && t === tag);

/* ── 1+2) JSX ── */
const BUTTON_WRAPPERS = new Set(["PrimaryButton", "SecondaryButton", "GhostButton"]);
/* TermSelect قائمةٌ حقيقية تمرّر خصائصها إلى <select>، فتُعامل معاملته. */
const CONTROLS = new Set(["input", "select", "textarea", "TermSelect"]);
const attrsOf = (el: ts.JsxOpeningLikeElement) => {
  const out = new Map<string, ts.JsxAttribute["initializer"] | true>();
  let spread = false;
  for (const p of el.attributes.properties) {
    if (ts.isJsxSpreadAttribute(p)) { spread = true; continue; }
    out.set(p.name.getText(), p.initializer ?? true);
  }
  return { attrs: out, spread };
};
const literal = (init: ts.JsxAttribute["initializer"] | true | undefined): string | null => {
  if (!init || init === true) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) return init.expression.text;
  return null;
};
const exprText = (init: ts.JsxAttribute["initializer"] | true | undefined) => (!init || init === true) ? "" : init.getText().replace(/\s+/g, "");
const tagName = (el: ts.JsxOpeningLikeElement) => el.tagName.getText();
const childrenOf = (node: ts.Node): readonly ts.JsxChild[] => ts.isJsxElement(node) ? node.children : [];
const openingOf = (node: ts.Node) => ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;

/* عنصرٌ أيقونيّ: مكوّنٌ بحرفٍ كبير بلا أبناء نصّية، أو svg، أو ما عليه aria-hidden. */
function isIconish(node: ts.Node): boolean {
  if (ts.isJsxText(node)) return !node.getText().trim();
  if (ts.isJsxExpression(node)) {
    const e = node.expression;
    if (!e) return true;
    return iconExpr(e);
  }
  const open = openingOf(node);
  if (!open) return false;
  const name = tagName(open);
  const { attrs } = attrsOf(open);
  if (attrs.has("aria-hidden") && exprText(attrs.get("aria-hidden")) !== "{false}") return true;
  if (name === "svg" || name === "img" && !literal(attrs.get("alt"))) return true;
  if (isIconName(name) && ts.isJsxSelfClosingElement(node)) return true;
  if (/^(span|i|b|em|small)$/.test(name) && ts.isJsxElement(node)) return node.children.every(isIconish);
  if (/^(span|i)$/.test(name) && ts.isJsxSelfClosingElement(node)) return true;
  return false;
}
function iconExpr(e: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(e)) return iconExpr(e.expression);
  if (ts.isConditionalExpression(e)) return iconExpr(e.whenTrue) && iconExpr(e.whenFalse);
  if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) return iconExpr(e.right) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || iconExpr(e.left));
  if (e.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) return isIconish(e);
  if (ts.isJsxFragment(e)) return e.children.every(isIconish);
  return false;
}
/* عناصرُ JSX التي قد يعيدها تعبير: فرعا الشرط وطرفا && و||. */
function jsxIn(e: ts.Expression): ts.Node[] {
  if (ts.isParenthesizedExpression(e)) return jsxIn(e.expression);
  if (ts.isConditionalExpression(e)) return [...jsxIn(e.whenTrue), ...jsxIn(e.whenFalse)];
  if (ts.isBinaryExpression(e)) return [...jsxIn(e.left), ...jsxIn(e.right)];
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e)) return [e];
  return [];
}
/* نصٌّ ظاهر داخل تسمية: نصٌّ حرفيّ أو تعبيرٌ ليس أيقونة، خارج العنصر نفسه. */
function hasText(node: ts.Node, skip: ts.Node): boolean {
  for (const c of childrenOf(node)) {
    if (c === skip) continue;
    if (ts.isJsxText(c)) { if (c.getText().trim()) return true; continue; }
    if (ts.isJsxExpression(c)) {
      if (!c.expression || iconExpr(c.expression)) continue;
      /* تعبيرٌ يعيد عناصر فقط (شرطٌ بين عنصرين): يُنظر في العناصر نفسها. */
      const els = jsxIn(c.expression);
      if (els.length && onlyJsx(c.expression)) { if (els.some(e => hasTextNode(e, skip))) return true; continue; }
      return true;
    }
    if (hasTextNode(c, skip)) return true;
  }
  return false;
}
/* عنصرٌ ابنٌ للتسمية: الحقولُ والأزرارُ داخلها ليست نصّاً لها. */
function hasTextNode(c: ts.Node, skip: ts.Node): boolean {
  {
    const open = openingOf(c);
    if (open && (CONTROLS.has(tagName(open)) || tagName(open) === "button" || BUTTON_WRAPPERS.has(tagName(open)))) return false;
    if (open && attrsOf(open).attrs.has("aria-hidden")) return false;
    if (ts.isJsxElement(c) && hasText(c, skip)) return true;
    if (ts.isJsxSelfClosingElement(c) && /^[A-Z]/.test(tagName(c)) && !isIconish(c)) return true;
  }
  return false;
}
function onlyJsx(e: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(e)) return onlyJsx(e.expression);
  if (ts.isConditionalExpression(e)) return onlyJsx(e.whenTrue) && onlyJsx(e.whenFalse);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return onlyJsx(e.right);
  return e.kind === ts.SyntaxKind.NullKeyword || ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e);
}

/* أسماءُ الأيقونات في الملف الجاري: مستوردةٌ من مكتبة الأيقونات أو من ملفٍّ اسمه icon، أو تنتهي بـ Icon. */
let iconNames = new Set<string>();
const collectIcons = (sf: ts.SourceFile) => {
  iconNames = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/lucide|icon/i.test(st.moduleSpecifier.text)) continue;
    const b = st.importClause?.namedBindings;
    if (b && ts.isNamedImports(b)) for (const el of b.elements) iconNames.add(el.name.text);
    if (st.importClause?.name) iconNames.add(st.importClause.name.text);
  }
};
const isIconName = (name: string) => iconNames.has(name) || /Icon$/.test(name);

const tsxFiles = walk(path.join(root, "src")).filter(f => f.endsWith(".tsx"));
const jsxMissing: string[] = [];
let scannedControls = 0, scannedIconButtons = 0;
for (const file of tsxFiles) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  collectIcons(sf);
  /* معرّفاتٌ مشار إليها بـ htmlFor (حرفيةً أو تعبيراً). */
  const htmlFor = new Set<string>();
  const visitFor = (n: ts.Node) => {
    const open = openingOf(n);
    if (open && tagName(open) === "label") { const v = attrsOf(open).attrs.get("htmlFor"); if (v) htmlFor.add(literal(v) ?? exprText(v)); }
    ts.forEachChild(n, visitFor);
  };
  visitFor(sf);
  const rel = path.relative(root, file);
  const report = (node: ts.Node, tag: string) => {
    if (allowed(rel, tag)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    jsxMissing.push(`${rel}:${line + 1} <${tag}>`);
  };
  /* <Field label> يربط تسميته بأول حقلٍ أصليّ بين أبنائه (withControlId في ui.tsx). */
  const fieldBound = new Set<ts.Node>();
  /* فرعا الشرط بديلان: أولُ حقلٍ في كلٍّ منهما هو المربوط حين يُرسم. */
  const firstControls = (n: ts.Node): ts.Node[] => {
    for (const c of childrenOf(n)) {
      const alternatives: ts.Node[] = ts.isJsxExpression(c) && c.expression ? jsxIn(c.expression) : [c];
      const found: ts.Node[] = [];
      for (const x of alternatives) {
        const o = openingOf(x);
        if (!o) continue;
        const t = tagName(o);
        if (CONTROLS.has(t)) found.push(x);
        else if (/^[a-z]/.test(t)) found.push(...firstControls(x));
      }
      if (found.length) return found;
    }
    return [];
  };
  const visit = (n: ts.Node, labels: ts.JsxElement[]) => {
    const open = openingOf(n);
    let nextLabels = labels;
    if (open) {
      const tag = tagName(open);
      if (tag === "Field" && ts.isJsxElement(n) && attrsOf(open).attrs.has("label")) { for (const f of firstControls(n)) fieldBound.add(f); }
      const { attrs, spread } = attrsOf(open);
      const named = attrs.has("aria-label") || attrs.has("aria-labelledby") || spread;
      if (tag === "label" && ts.isJsxElement(n)) nextLabels = [...labels, n];
      if (CONTROLS.has(tag)) {
        const type = literal(attrs.get("type"));
        /* ملفٌّ مخفيّ بالخاصية hidden، أو حقلُ «مطلوب» ظلّيٌّ مخفيٌّ عن قارئ الشاشة: خارج شجرة الوصول. */
        const offTree = attrs.has("hidden") || (exprText(attrs.get("aria-hidden")) === '"true"' && exprText(attrs.get("tabIndex")) === "{-1}");
        if (type !== "hidden" && !offTree) {
          scannedControls++;
          const id = attrs.get("id");
          const linked = id && (htmlFor.has(literal(id) ?? "") || htmlFor.has(exprText(id)));
          const wrapped = labels.some(l => hasText(l, n)) || fieldBound.has(n);
          const valueButton = (type === "submit" || type === "button") && attrs.has("value");
          if (!named && !linked && !wrapped && !valueButton) report(n, tag);
        }
      }
      /* أزرارُ ui.tsx تمرّر خصائصها إلى <button>، فتُفحص مثله. */
      if (tag === "button" || BUTTON_WRAPPERS.has(tag)) {
        const kids = childrenOf(n).filter(c => !(ts.isJsxText(c) && !c.getText().trim()));
        const iconOnly = kids.length > 0 && kids.every(isIconish);
        const empty = kids.length === 0 && !attrs.has("children") && !attrs.has("dangerouslySetInnerHTML");
        if (iconOnly || empty) {
          scannedIconButtons++;
          if (!named) report(n, "button");
        }
      }
    }
    ts.forEachChild(n, c => visit(c, nextLabels));
  };
  visit(sf, []);
}
check(scannedControls > 300, `فُحص ${scannedControls} حقلاً وقائمةً في ${tsxFiles.length} ملفاً`);
check(scannedIconButtons > 50, `فُحص ${scannedIconButtons} زرّاً أيقونياً`);
check(jsxMissing.length === 0, "كلُّ حقلٍ وقائمةٍ وزرٍّ أيقونيّ في الواجهة له اسم", jsxMissing);

/* ── 3) صفحات الخادم العامة: قوالب نصّية ── */
const serverPages = [
  "src/server/core/publicPages.ts",
  ...walk(path.join(root, "src/server")).map(f => path.relative(root, f)).filter(f => /Page[s]?\.ts$|Ui\.ts$|Pages\.ts$|Visual\.ts$|Kit\.ts$|Script\.ts$|Styles\.ts$/.test(f) && f.endsWith(".ts")),
  "src/server/routes/publicRequestRoutes.ts",
  "src/server/routes/publicStaffRoutes.ts",
  "src/server/routes/surveyRoutes.ts",
].filter((f, i, a) => a.indexOf(f) === i && fs.existsSync(path.join(root, f)));
const pageMissing: string[] = [];
let scannedPage = 0;
/* تعبيرٌ وسط القالب يُعدّ نصّاً إلا إن كان استدعاءَ أيقونة (gi/ic/…_ICON). */
const visibleText = (html: string) => html
  .replace(/\b(gi|ic|icon|whyIcon)\((?:[^()]|\([^()]*\))*\)|\b[A-Z_]+_ICON\b/g, " ICON ")
  .replace(/'\s*\+[\s\S]*?\+\s*'/g, m => /^['+\s]*(ICON[\s+]*)*['+\s]*$/.test(m) ? " " : " X ")
  .replace(/\$\{[\s\S]*?\}/g, m => /^\$\{\s*ICON\s*\}$/.test(m) ? " " : " X ")
  .replace(/ICON/g, " ")
  .replace(/<svg[\s\S]*?<\/svg>/g, " ")
  .replace(/<[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/[a-z]+>/g, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&[a-z#0-9]+;/g, " ")
  .replace(/[×✕✖⨯↻⟳⧉⎘+\-–·•›‹«»\s]|\\n/g, "");
for (const rel of serverPages) {
  const text = fs.readFileSync(path.join(root, rel), "utf8");
  const forIds = new Set([...text.matchAll(/<label[^>]*\sfor=\\?"([^"\\]+)\\?"/g)].map(m => m[1]));
  for (const m of text.matchAll(/<(input|select|textarea|button)\b([^>]*)>/g)) {
    const [whole, tag, attrs] = m;
    const at = m.index!;
    /* علامةٌ داخل تعليقٍ لا تُعدّ. */
    const head = text.slice(0, at);
    if (head.lastIndexOf("/*") > head.lastIndexOf("*/") && !/["'`]$/.test(head.trimEnd())) continue;
    if (/type=\\?["']?hidden/.test(attrs)) continue;
    const named = /aria-label(ledby)?=/.test(attrs);
    const line = text.slice(0, at).split("\n").length;
    if (tag === "button") {
      const end = text.indexOf("</button>", at);
      const inner = end > 0 && end - at < 1200 ? text.slice(at + whole.length, end) : "X";
      const label = visibleText(inner);
      const copyOrClose = /close|copy|نسخ|إغلاق|dismiss/i.test(attrs) || /^[×✕✖]$/.test(inner.trim());
      /* زرٌّ فارغ بمعرّفٍ يملؤه سكربت الصفحة (getElementById/foldHead) نصُّه يُكتب عند الرسم. */
      const id = attrs.match(/\sid=\\?["']([^"'\\]+)/)?.[1];
      const filled = !inner.trim() && !!id && text.split(`"${id}"`).length > 2;
      if ((!label && !filled) || copyOrClose) { scannedPage++; if (!named) pageMissing.push(`${rel}:${line} <button${attrs.slice(0, 60)}>`); }
      continue;
    }
    scannedPage++;
    const id = attrs.match(/\sid=\\?"([^"\\]+)/)?.[1] ?? attrs.match(/\sid='([^']+)'/)?.[1];
    const linked = id && forIds.has(id);
    const before = text.slice(Math.max(0, at - 600), at);
    const wrapped = before.lastIndexOf("<label") > before.lastIndexOf("</label>");
    if (!named && !linked && !wrapped && !/type=\\?["']?(submit|button)/.test(attrs)) pageMissing.push(`${rel}:${line} <${tag}${attrs.slice(0, 60)}>`);
  }
}
check(scannedPage > 20, `فُحص ${scannedPage} حقلاً وزرَّ نسخٍ/إغلاقٍ/أيقونةٍ في ${serverPages.length} قالباً للخادم`);
check(pageMissing.length === 0, "حقولُ الصفحات العامة وأزرارُ النسخ والإغلاق فيها لها اسمٌ صريح", pageMissing);

/* ── 4) الدرجُ المغلق خارج ترتيب Tab: مخفيٌّ (visibility) حتى يُفتح ── */
const responsive = fs.readFileSync(path.join(root, "src/styles/07-responsive.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");
check(/\.sidebar\{[^}]*visibility:hidden/.test(responsive) && /\.sidebar\.open\{[^}]*visibility:visible/.test(responsive),
  "الدرجُ الجانبي المغلق مخفيٌّ عن Tab وقارئ الشاشة، ويظهر عند فتحه");

/* ── 5) التباين: رموزُ الألوان نفسها، لا قيمٌ متفرّقة ── */
const foundation = fs.readFileSync(path.join(root, "src/styles/01-foundation.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const lightRoot = foundation.slice(0, foundation.indexOf("}", foundation.indexOf("--warning:")));
const token = (name: string) => lightRoot.match(new RegExp(`--${name}:(#[0-9a-fA-F]{6})`))?.[1] || "";
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lum = (hex: string) => { const [r, g, b] = rgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const grounds = ["surface", "surface-2", "surface-3", "canvas", "canvas-2"];
const lowText: string[] = [];
for (const ink of ["ink", "ink-2", "muted", "muted-2", "accent", "accent-strong", "brass", "info", "success", "warning", "danger"])
  for (const ground of grounds) { const r = ratio(token(ink), token(ground)); if (!(r >= 4.5)) lowText.push(`--${ink} على --${ground}: ${r.toFixed(2)}`); }
for (const s of ["info", "success", "warning", "danger", "accent", "brass"]) {
  const soft = token(`${s}-soft`);
  if (soft) { const r = ratio(token(s), soft); if (!(r >= 4.5)) lowText.push(`--${s} على صبغته: ${r.toFixed(2)}`); }
}
check(token("muted-2") !== "" && token("warning") !== "", "رموزُ الألوان مقروءة من 01-foundation.css");
check(lowText.length === 0, "كلُّ لون نصٍّ في الوضع الفاتح ≥ 4.5:1 على كل أرضية وعلى صبغته", lowText);
/* نصٌّ خافت بالشفافية كان ينزل دون الحدّ: يُخفَّض بالخلفية أو بلونٍ مقروء. */
const css = (f: string) => fs.readFileSync(path.join(root, f), "utf8").replace(/\s+/g, "");
check(!/\.srq-card\[data-stage="withdrawn"\],\.srq-card\[data-stage="declined"\]\{[^}]*opacity/.test(css("src/components/sectionRequests/section-requests.css"))
  && !/\.roster-tabsbuttonb\{[^}]*opacity/.test(css("src/components/registration-tabs.css"))
  && !/\.changes-moveds\{[^}]*opacity/.test(css("src/styles/11-approval.css"))
  && !/\.changes-note-fieldem\{[^}]*opacity/.test(css("src/styles/11-approval.css")),
  "بطاقاتُ الطلبات المنتهية وعدّادُ الألسنة والقيمُ السابقة في التغييرات بلا شفافيةٍ تُنزل تباينها");

/* ── 6) أهدافُ اللمس ── */
const touch = css("src/styles/52-touch-targets.css").replace(/\/\*.*?\*\//g, "");
const imports = [...css("src/index.css").matchAll(/@import"\.\/styles\/([^"]+)";/g)].map(m => m[1]);
const at = imports.indexOf("52-touch-targets.css");
check(at > imports.indexOf("07-responsive.css") && at > imports.indexOf("35-visual-polish.css") && at > imports.indexOf("49-admin-touch.css") && at > imports.indexOf("50-touch-contrast.css"),
  "طبقةُ أهداف اللمس تُستورد بعد طبقات اللمس السابقة، فتغلبها");
check(touch.startsWith("@media(pointer:coarse),(max-width:760px){"), "الطبقةُ للمس والعرض الضيّق وحدهما: سطحُ المكتب بلا تغيير");
check(["button:not(", "summary", "select", "a.btn", "input:not(", "label:has(>input:is([type=checkbox],[type=radio]))", "[role=tab]"].every(k => touch.includes(k))
  && /\{min-block-size:var\(--ix-tap\)!important\}/.test(touch) && /\{min-inline-size:var\(--ix-tap\)!important\}/.test(touch),
  "الأزرار والقوائم والحقول والألسنة وروابطُ الأزرار: 44px حدّاً أدنى");
check(/:where\(button\[aria-label\]:is\(:has\(>svg:only-child\),:empty\)[^)]*\)\)::after\{content:"";position:absolute;inset-block:min\(0px,calc\(\(100%-var\(--ix-tap\)\)\/2\)\)/.test(touch),
  "الأزرارُ الأيقونية: طبقةٌ شفافة تبلغ 44 ولا يتغيّر رسمُها");
check(/--ix-tap:44px/.test(foundation), "مقاسُ اللمس المريح 44px رمزٌ واحد");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
