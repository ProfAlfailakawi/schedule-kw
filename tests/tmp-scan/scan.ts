import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const ROOT = process.cwd();
const files: string[] = [];
const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx$/.test(e.name)) files.push(p); } };
walk(path.join(ROOT, "src"));
const COURSE = /\b(CourseName|courseName|AdCourseName|CourseNameSnapshot|course_name)\b|\b\w*[cC]ourse\w*\??\.name\b/;
const PERSON = /\b(AdInstructorName|instructorName|InstructorName|teacherName|TeacherName)\b|\b\w*([iI]nstructor|[tT]eacher)\w*\??\.name\b/;
const kind = process.argv[2] || "course";
const RE = kind === "course" ? COURSE : PERSON;
const COVER = kind === "course" ? /<CourseTags\b|courseTagsHtml/ : /<PersonChips\b|personChips\(/;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n: ts.Node) => {
    if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      const text = n.expression.getText(sf);
      if (RE.test(text) && !/^\s*\(?\s*\w+\s*=>/.test(text) && !text.includes("<")) {
        let el: ts.Node = n.parent; let covered = false;
        for (let i = 0; i < 3 && el; i++) { if (COVER.test(el.getText(sf))) { covered = true; break; } let p = el.parent; while (p && !ts.isJsxElement(p) && !ts.isJsxFragment(p)) p = p.parent; if (!p) break; el = p; }
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        if (!covered) console.log(`${path.relative(ROOT, file)}:${line}  ${text.slice(0, 110).replace(/\s+/g, " ")}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
