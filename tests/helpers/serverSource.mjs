/**
 * ── نصُّ الخادم كلّه: server.ts وما قُسّم منه، بترتيبه القديم ───────────────────
 *
 * كان كلُّ شيءٍ في server.ts، فكانت اختباراتٌ كثيرة تقرؤه وتسأل: أهذا السطرُ فيه؟
 * وكثيرٌ منها يقطع منه ما بين علامتين (من «function x» إلى الطريق الذي بعدها).
 * ثم قُسّم إلى وحداتٍ تحت src/server/{core,pages,routes} (scripts/split-server)،
 * فصار هذا الملفُّ يعيد جمعَ النصّ كما كان: جملُ المستوى الأعلى من server.ts
 * والوحدات — وجملُ دوال register* من داخلها — مرتّبةً بترتيبها في server.ts قبل
 * التقسيم (tests/fixtures/server-split-order.json، تكتبه أداةُ التقسيم)، بلا
 * `export` الذي أضافه النقل. وما أُضيف بعد التقسيم يأخذ مكانه بعد الجملة التي
 * تسبقه في ملفه. لا يُغيّر شيئاً مما يُسأل عنه؛ يغيّر أين يُبحث فقط.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const SPLIT_DIRS = ["src/server/core", "src/server/pages", "src/server/routes"];
export const ORDER_FILE = "tests/fixtures/server-split-order.json";

/** server.ts أولاً، ثم وحداتُ كل مجلدٍ بترتيب أسمائها. */
export function serverSourceFiles(root = process.cwd()) {
  const files = ["server.ts"];
  for (const dir of SPLIT_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).filter(f => f.endsWith(".ts")).sort()) files.push(`${dir}/${name}`);
  }
  return files;
}

/** مفتاحُ جملةٍ في المستوى الأعلى: يبقى هو هو بعد نقلها. */
export function statementKey(ts, st, sf) {
  const nameOf = n => (n && ts.isIdentifier(n) ? n.text : "");
  if (ts.isImportDeclaration(st)) return "import";
  if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) return `decl:${nameOf(st.name)}`;
  if (ts.isVariableStatement(st)) return `decl:${st.declarationList.declarations.map(d => d.name.getText(sf)).join(",")}`;
  if (ts.isExpressionStatement(st) && ts.isCallExpression(st.expression) && ts.isPropertyAccessExpression(st.expression.expression) && st.expression.expression.expression.getText(sf) === "app") {
    const arg = st.expression.arguments[0];
    return `app:${st.expression.expression.name.text} ${arg ? arg.getText(sf).slice(0, 200) : ""}`;
  }
  return `stmt:${st.getText(sf).replace(/\s+/g, " ").slice(0, 120)}`;
}

const isRegisterFunction = (ts, st) => ts.isFunctionDeclaration(st) && st.name && /^register\w*Routes\d*$/.test(st.name.text) && st.body
  && st.parameters.length === 1 && ts.isIdentifier(st.parameters[0].name) && st.parameters[0].name.text === "app";

const cache = new Map();

/** النصُّ مجموعاً بترتيب server.ts القديم (أو ملفاً بعد ملفٍّ إن لم يُقسَم). */
export function readServerSource(root = process.cwd()) {
  if (cache.has(root)) return cache.get(root);
  const files = serverSourceFiles(root);
  const orderPath = path.join(root, ORDER_FILE);
  if (files.length === 1 || !fs.existsSync(orderPath)) {
    const plain = files.map(file => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
    cache.set(root, plain);
    return plain;
  }
  const ts = require("typescript");
  const order = new Map(JSON.parse(fs.readFileSync(orderPath, "utf8")).keys.map((k, i) => [k, i]));
  const seen = new Map();
  const chunks = [];
  files.forEach((file, fileIndex) => {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    let last = -1, step = 0;
    const take = statements => {
      for (const st of statements) {
        if (file !== "server.ts" && isRegisterFunction(ts, st)) { take(st.body.statements); continue; }
        const base = statementKey(ts, st, sf);
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        const known = order.get(n === 1 ? base : `${base}#${n}`);
        let at;
        if (base === "import") at = -1;
        else if (known !== undefined) { at = known; last = known; step = 0; }
        else { step += 1; at = last + step / 10000; }
        let chunk = st.getFullText(sf);
        if (file !== "server.ts" && base === "import" && ts.isStringLiteral(st.moduleSpecifier) && st.moduleSpecifier.text.startsWith(".")) {
          // مسارُ الاستيراد كما يُكتب من server.ts: "../../utils/x" ← "./src/utils/x"
          const spec = st.moduleSpecifier;
          let rooted = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec.text));
          if (!rooted.startsWith(".")) rooted = "./" + rooted;
          const off = spec.getStart(sf) - st.getFullStart();
          chunk = chunk.slice(0, off) + JSON.stringify(rooted) + chunk.slice(off + spec.getWidth(sf));
        }
        if (file !== "server.ts") {
          const exp = (ts.canHaveModifiers(st) ? ts.getModifiers(st) || [] : []).find(m => m.kind === ts.SyntaxKind.ExportKeyword);
          if (exp) { const off = exp.getStart(sf) - st.getFullStart(); chunk = chunk.slice(0, off) + chunk.slice(off + "export ".length); }
        }
        chunks.push({ at, fileIndex, pos: st.pos, chunk });
      }
    };
    take(sf.statements);
  });
  chunks.sort((a, b) => a.at - b.at || a.fileIndex - b.fileIndex || a.pos - b.pos);
  const joined = chunks.map(c => c.chunk).join("") + "\n";
  cache.set(root, joined);
  return joined;
}
