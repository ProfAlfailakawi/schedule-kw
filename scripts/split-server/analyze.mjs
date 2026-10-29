/**
 * ── قراءةُ server.ts قبل تقسيمه ──────────────────────────────────────────────
 *
 * يحوّل الملفَّ إلى «وحدات»: كلُّ جملةٍ في المستوى الأعلى وحدةٌ (والتعريفاتُ
 * المتكرّرة لدالةٍ واحدة — overloads — وحدةٌ واحدة). ولكلِّ وحدةٍ نصُّها كما هو
 * (مع تعليقاتها السابقة لها)، وما تُعرّفه من أسماء، وما تستعمله من أسماء المستوى
 * الأعلى: أهو استعمالُ قيمةٍ أم نوع، أيُكتب فيه، أيُقرأ ساعةَ تحميل الوحدة.
 *
 * يُحلّ كلُّ اسمٍ بمُدقّق TypeScript نفسه (بلا حلّ للاستيرادات ولا مكتبات)،
 * فالاسمُ المحجوب بمتغيّرٍ محليّ لا يُعدّ استعمالاً للاسم الأعلى.
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules/typescript"));

export { ts };

const ROUTE_VERBS = new Set(["get", "post", "put", "patch", "delete", "all", "head", "options"]);

/** هل العقدةُ داخل جسم دالة (فلا تُنفَّذ ساعةَ تحميل الوحدة)؟ */
function insideFunctionBody(node, stopAt) {
  for (let cur = node.parent; cur && cur !== stopAt; cur = cur.parent) {
    if (ts.isFunctionLike(cur) && !ts.isFunctionTypeNode(cur) && !ts.isConstructorTypeNode(cur) && !ts.isCallSignatureDeclaration(cur) && !ts.isMethodSignature(cur) && !ts.isIndexSignatureDeclaration(cur) && !ts.isConstructSignatureDeclaration(cur)) return true;
    if (ts.isPropertyDeclaration(cur) && !(ts.getCombinedModifierFlags(cur) & ts.ModifierFlags.Static)) return true;
  }
  return false;
}

/** موضعُ كتابةٍ في المتغيّر: x = ، x += ، x++ ، [x] = ... */
function isWriteReference(id) {
  let node = id;
  let parent = node.parent;
  // التفكيكُ في طرف الإسناد الأيسر: [a, b] = ... أو ({ a } = ...)
  while (parent && (ts.isArrayLiteralExpression(parent) || ts.isParenthesizedExpression(parent) || ts.isSpreadElement(parent) || ts.isShorthandPropertyAssignment(parent) || ts.isPropertyAssignment(parent) || ts.isObjectLiteralExpression(parent))) {
    if (ts.isPropertyAssignment(parent) && parent.name === node) return false;
    node = parent;
    parent = node.parent;
  }
  if (!parent) return false;
  if (ts.isBinaryExpression(parent) && parent.left === node) {
    const k = parent.operatorToken.kind;
    return k >= ts.SyntaxKind.FirstAssignment && k <= ts.SyntaxKind.LastAssignment;
  }
  if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) return node === id;
  if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === node) return true;
  return false;
}

/** يُرجِع مسارات الطريق إن كانت حرفيّة: "/a" أو ["/a", "/b"] */
function literalPaths(arg) {
  if (!arg) return null;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) return [arg.text];
  if (ts.isArrayLiteralExpression(arg) && arg.elements.every(e => ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))) return arg.elements.map(e => e.text);
  return null;
}

function declaredNames(st) {
  if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st) || ts.isModuleDeclaration(st)) return st.name ? [st.name.text] : [];
  if (ts.isVariableStatement(st)) {
    const out = [];
    const visit = name => {
      if (ts.isIdentifier(name)) out.push(name.text);
      else for (const el of name.elements) if (!ts.isOmittedExpression(el)) visit(el.name);
    };
    for (const d of st.declarationList.declarations) visit(d.name);
    return out;
  }
  return [];
}

function declKind(st) {
  if (ts.isFunctionDeclaration(st)) return "function";
  if (ts.isClassDeclaration(st)) return "class";
  if (ts.isInterfaceDeclaration(st)) return "interface";
  if (ts.isTypeAliasDeclaration(st)) return "type";
  if (ts.isEnumDeclaration(st)) return "enum";
  if (ts.isVariableStatement(st)) {
    const f = st.declarationList.flags;
    return f & ts.NodeFlags.Let ? "let" : f & ts.NodeFlags.Const ? "const" : "var";
  }
  return null;
}

/** هل الجملةُ استدعاءٌ على app (app.get(...)/app.use(...)/...)؟ */
function appCall(st) {
  if (!ts.isExpressionStatement(st)) return null;
  const e = st.expression;
  if (!ts.isCallExpression(e) || !ts.isPropertyAccessExpression(e.expression)) return null;
  const target = e.expression.expression;
  if (!ts.isIdentifier(target) || target.text !== "app") return null;
  return { verb: e.expression.name.text, args: e.arguments };
}

/**
 * يحلّل المصدر ويُرجع الوحدات.
 * @param {string} text نصُّ server.ts
 * @param {string} fileName
 */
export function analyzeServer(text, fileName = "server.ts") {
  const host = ts.createCompilerHost({}, true);
  const original = host.getSourceFile;
  const absolute = path.resolve(fileName);
  host.getSourceFile = (name, lang, onError, create) => {
    if (path.resolve(name) === absolute) return ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    return original.call(host, name, lang, onError, create);
  };
  host.fileExists = name => path.resolve(name) === absolute;
  host.readFile = name => (path.resolve(name) === absolute ? text : undefined);
  const program = ts.createProgram([absolute], { noResolve: true, noLib: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, types: [], skipLibCheck: true }, host);
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(absolute);
  if (!sf) throw new Error("لم يُقرأ " + fileName);

  /* ── حدودُ نصّ كل جملة: تعليقُ آخر السطر يبقى مع الجملة التي قبله ── */
  const statements = [...sf.statements];
  const starts = [];
  const ends = [];
  let cursor = 0;
  for (let i = 0; i < statements.length; i += 1) {
    const st = statements[i];
    starts.push(cursor);
    let end = st.end;
    const trailing = ts.getTrailingCommentRanges(text, end) || [];
    for (const c of trailing) end = Math.max(end, c.end);
    ends.push(end);
    cursor = end;
  }
  const tail = text.slice(cursor);

  /* ── وحدات: التعريفاتُ المتتالية لدالةٍ واحدة تتّحد ── */
  const units = [];
  for (let i = 0; i < statements.length; i += 1) {
    const st = statements[i];
    const prev = units[units.length - 1];
    if (prev && ts.isFunctionDeclaration(st) && st.name && prev.kind === "decl" && prev.declKind === "function" && prev.names[0] === st.name.text && !prev.nodes[prev.nodes.length - 1].body) {
      prev.nodes.push(st);
      prev.end = ends[i];
      continue;
    }
    const unit = { index: units.length, nodes: [st], start: starts[i], end: ends[i] };
    if (ts.isImportDeclaration(st)) unit.kind = "import";
    else if (declKind(st)) { unit.kind = "decl"; unit.declKind = declKind(st); unit.names = declaredNames(st); }
    else {
      const call = appCall(st);
      if (call && ROUTE_VERBS.has(call.verb)) {
        unit.kind = "route";
        unit.verb = call.verb;
        unit.paths = literalPaths(call.args[0]);
        unit.pathText = call.args[0] ? call.args[0].getText(sf) : "";
      } else if (call) {
        unit.kind = "app";
        unit.verb = call.verb;
        if (call.verb !== "use") unit.paths = []; // app.set / app.disable: لا طبقةَ في الموجّه
        else if (call.args.length < 2) unit.paths = ["/"]; // وسيطٌ عامّ لكل طلب
        else unit.paths = literalPaths(call.args[0]); // null = مسارٌ لا يُعرف إلا ساعةَ التشغيل
      } else unit.kind = "stmt";
    }
    units.push(unit);
  }
  for (const u of units) {
    u.text = text.slice(u.start, u.end);
    if (u.kind === "import") {
      // تعليقٌ قبل استيرادٍ في وسط الملف يصف ما بعده: ينتقل مع الجملة التالية
      const lead = text.slice(u.start, u.nodes[0].getStart(sf));
      if (lead.trim()) {
        const next = units.slice(u.index + 1).find(v => v.kind !== "import");
        if (next) next.prefix = (next.prefix || "") + lead.replace(/\s+$/, "");
      }
    }
    u.line = sf.getLineAndCharacterOfPosition(u.nodes[0].getStart(sf)).line + 1;
    u.endLine = sf.getLineAndCharacterOfPosition(u.nodes[u.nodes.length - 1].end).line + 1;
    u.lines = u.text.split("\n").length;
  }

  /* ── أسماءُ المستوى الأعلى ← الوحدة التي تعرّفها ── */
  const symbolOwner = new Map(); // ts.Symbol -> { unit, name, importInfo? }
  const imports = new Map(); // localName -> { unit, spec, imported, kind: default|named|namespace, typeOnly }
  for (const u of units) {
    if (u.kind === "import") {
      const st = u.nodes[0];
      const spec = st.moduleSpecifier.text;
      const clause = st.importClause;
      u.spec = spec;
      u.bindings = [];
      if (!clause) { u.sideEffectOnly = true; continue; }
      const clauseTypeOnly = clause.isTypeOnly;
      const add = (nameNode, info) => {
        const sym = checker.getSymbolAtLocation(nameNode);
        const entry = { unit: u.index, spec, local: nameNode.text, pos: nameNode.pos, ...info };
        imports.set(nameNode.text, entry);
        u.bindings.push(entry);
        if (sym) symbolOwner.set(sym, { unit: u.index, name: nameNode.text, importInfo: entry });
      };
      if (clause.name) add(clause.name, { kind: "default", imported: "default", typeOnly: clauseTypeOnly });
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) add(clause.namedBindings.name, { kind: "namespace", imported: "*", typeOnly: clauseTypeOnly });
        else for (const el of clause.namedBindings.elements) add(el.name, { kind: "named", imported: (el.propertyName || el.name).text, typeOnly: clauseTypeOnly || el.isTypeOnly });
      }
      continue;
    }
    if (u.kind !== "decl") continue;
    for (const st of u.nodes) {
      const nameNodes = [];
      if (ts.isVariableStatement(st)) {
        const visit = name => {
          if (ts.isIdentifier(name)) nameNodes.push(name);
          else for (const el of name.elements) if (!ts.isOmittedExpression(el)) visit(el.name);
        };
        for (const d of st.declarationList.declarations) visit(d.name);
      } else if (st.name) nameNodes.push(st.name);
      for (const n of nameNodes) {
        const sym = checker.getSymbolAtLocation(n);
        if (sym) symbolOwner.set(sym, { unit: u.index, name: n.text });
      }
    }
  }

  /* ── المراجع ── */
  const isDeclarationName = id => {
    const p = id.parent;
    if (!p) return false;
    if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isEnumDeclaration(p) || ts.isTypeParameterDeclaration(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) && p.name === id) return true;
    if (ts.isBindingElement(p)) return p.name === id || p.propertyName === id;
    if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isMethodSignature(p) || ts.isGetAccessor(p) || ts.isSetAccessor(p) || ts.isEnumMember(p) || ts.isPropertyAccessExpression(p)) && p.name === id) return true;
    if (ts.isQualifiedName(p) && p.right === id) return true;
    if ((ts.isLabeledStatement(p) || ts.isBreakStatement(p) || ts.isContinueStatement(p)) && p.label === id) return true;
    if (ts.isExportSpecifier(p)) return false;
    return false;
  };

  for (const u of units) {
    u.refs = new Map(); // name -> { value, type, write, evalTime, positions: [{start,end,shorthand}] }
    if (u.kind === "import") continue;
    const unitRoot = u.nodes[0];
    const visit = node => {
      if (ts.isIdentifier(node) && !isDeclarationName(node)) {
        let sym;
        let shorthand = false;
        if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
          sym = checker.getShorthandAssignmentValueSymbol(node.parent);
          shorthand = true;
        } else sym = checker.getSymbolAtLocation(node);
        const owner = sym && symbolOwner.get(sym);
        if (owner && owner.unit !== u.index) {
          let r = u.refs.get(owner.name);
          if (!r) { r = { value: false, type: false, write: false, evalTime: false, positions: [] }; u.refs.set(owner.name, r); }
          const inType = ts.isPartOfTypeNode(node) || (ts.isExpressionWithTypeArguments(node.parent) && ts.isHeritageClause(node.parent.parent) && (node.parent.parent.token === ts.SyntaxKind.ImplementsKeyword || ts.isInterfaceDeclaration(node.parent.parent.parent)));
          if (inType) r.type = true; else r.value = true;
          if (!inType && isWriteReference(node)) r.write = true;
          if (!inType && !insideFunctionBody(node, null)) r.evalTime = true;
          r.positions.push({ start: node.getStart(sf), end: node.end, shorthand, inType });
        } else if (owner && owner.unit === u.index && u.kind === "decl") {
          // مرجعٌ ذاتيّ (دالةٌ تستدعي نفسها) — لا شيء
        }
      }
      ts.forEachChild(node, visit);
    };
    for (const st of u.nodes) visit(st);
    void unitRoot;
  }

  return { sf, text, units, imports, tail, checker, program };
}

/** نصُّ مسار الطريق للعرض. */
export function describeUnit(u) {
  if (u.kind === "route") return `${u.verb.toUpperCase()} ${u.paths ? u.paths.join(" | ") : u.pathText}`;
  if (u.kind === "decl") return `${u.declKind} ${u.names.join(", ")}`;
  if (u.kind === "app") return `app.${u.verb}(${u.paths ? u.paths.join(",") : "…"})`;
  return u.text.trim().split("\n").filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l))[0]?.slice(0, 80) || "";
}
