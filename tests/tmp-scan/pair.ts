import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const files: string[] = [];
const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx$/.test(e.name)) files.push(p); } };
walk("src");
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n: ts.Node) => {
    if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      const text = n.expression.getText(sf);
      const m = /^([\w.?!]+?)\??\.name$/.exec(text.trim());
      const mc = /^([\w.?!()]+?)\??\.(CourseCode|courseCode)$/.exec(text.trim());
      if (m || mc) {
        let el: ts.Node = n.parent; let p = el.parent; while (p && !ts.isJsxElement(p) && !ts.isJsxFragment(p)) p = p.parent;
        const scope = (p || el).getText(sf);
        const obj = m ? m[1].replace(/[?!]/g, "") : "";
        const pair = m && new RegExp(`\\b${obj.replace(/\./g, "\\??\\.")}\\??\\.(code|courseCode|CourseCode)\\b`).test(scope);
        const nameNear = /CourseName|courseName|\.name\b/.test(scope);
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        if (!/<CourseTags\b/.test(scope)) {
          if (pair) console.log(`PAIR ${file}:${line}  ${text}`);
          else if (mc && !nameNear) console.log(`CODE ${file}:${line}  ${text}`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
