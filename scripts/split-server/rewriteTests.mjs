/**
 * ── الاختباراتُ التي تقرأ نصَّ server.ts تقرأ النصَّ كلَّه ───────────────────────
 *
 * كلُّ قراءةٍ لنصّ server.ts في tests/ وscripts/ — fs.readFileSync("server.ts")،
 * readFileSync(path.join(process.cwd(), "server.ts"))، read("server.ts")... — تصير
 * readServerSource() من tests/helpers/serverSource.mjs: server.ts ثم وحداتُه المقسومة.
 * ما يُسأل عنه لا يتغيّر؛ يتغيّر أين يُبحث. وما لا يطابق هذه الصيغ يُطبع لمراجعته
 * (والرقعُ في scripts/split-server/patches/ لِما يحتاج يداً).
 */
import fs from "node:fs";
import path from "node:path";
import { serverSourceFiles } from "../../tests/helpers/serverSource.mjs";

const READ_FILE = /(?:\bfs\.)?\breadFileSync\(\s*(?:"server\.ts"|'server\.ts'|(?:path\.)?join\(\s*(?:process\.cwd\(\)|root|ROOT)\s*,\s*["']server\.ts["']\s*\)|new URL\(\s*["']\.\.\/server\.ts["']\s*,\s*import\.meta\.url\s*\))\s*,\s*["']utf-?8["']\s*\)/g;
const READ_HELPER = /\b(?:read|source)\(\s*["']server\.ts["']\s*\)/g;
const SKIP = new Set(["tests/server-route-parity-audit.ts", "tests/helpers/serverSource.mjs"]);

function importLine(file) {
  const rel = path.relative(path.dirname(file), "tests/helpers/serverSource.mjs").split(path.sep).join("/");
  return `import { readServerSource } from "${rel.startsWith(".") ? rel : "./" + rel}";`;
}

/** يضيف الاستيراد بعد آخر استيرادٍ في رأس الملف. */
function addImport(text, line) {
  if (text.includes(line)) return text;
  const lines = text.split("\n");
  let last = -1;
  let inComment = false;
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (inComment) { if (l.includes("*/")) inComment = false; continue; }
    if (/^\s*\/\*/.test(l) && !l.includes("*/")) { inComment = true; continue; }
    if (/^import\b/.test(l)) {
      last = i;
      // استيرادٌ يمتدّ أسطراً
      while (!/from\s+["'][^"']+["'];?\s*$|^import\s+["'][^"']+["'];?\s*$/.test(lines[last]) && last < lines.length - 1) last += 1;
      i = last;
      continue;
    }
    if (l.trim() === "" || /^\s*(\/\/|\*|\/\*)/.test(l) || /^#!/.test(l)) continue;
    if (last >= 0) break;
  }
  if (last < 0) {
    let at = 0;
    if (lines[0]?.startsWith("#!")) at = 1;
    lines.splice(at, 0, line);
  } else lines.splice(last + 1, 0, line);
  return lines.join("\n");
}

/**
 * قواعدُ لصيغٍ أخرى:
 *  - { file: "server.ts", contains: "…" } (قوائمُ استثناءٍ بملفّها): يصير الملفَّ الذي فيه النصُّ الآن؛
 *  - "server.ts" عنصراً في مصفوفة ملفاتٍ تُقرأ واحداً واحداً: ...serverSourceFiles()
 *    (إلا في ملفٍّ يمشي src/ كلَّه أصلاً، فالوحداتُ المقسومة فيه)؛
 *  - استخراجُ دالةِ صفحةٍ من نصّ server.ts: يُقرأ من وحدتها في src/server/pages.
 */
function relocateAllowEntries(text, root) {
  return text.replace(/\{\s*file:\s*"server\.ts",\s*contains:\s*("(?:[^"\\]|\\.)*")/g, (whole, lit) => {
    let needle;
    try { needle = JSON.parse(lit); } catch { return whole; }
    const files = serverSourceFiles(root);
    const home = files.find(f => fs.readFileSync(path.join(root, f), "utf8").includes(needle));
    return home && home !== "server.ts" ? whole.replace('"server.ts"', JSON.stringify(home)) : whole;
  });
}

function spreadFileLists(text) {
  if (/walk\(\s*(?:join\(\s*ROOT\s*,\s*)?"src"/.test(text)) return text;
  return text.replace(/(\[\s*)"server\.ts"(\s*,)/g, "$1...serverSourceFiles()$2").replace(/(\[\s*\n\s*)"server\.ts"(\s*,)/g, "$1...serverSourceFiles()$2");
}

const PAGE_EXTRACTION = [
  {
    file: "tests/public-pages-syntax-audit.ts",
    from: 'const file = path.join(process.cwd(), "server.ts");\nconst source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);',
    to: 'const file = path.join(process.cwd(), "server.ts");\nconst source = ts.createSourceFile(file, readServerSource(), ts.ScriptTarget.ES2022, true);',
  },
];

/* اختباراتُ Python: تأخذ النصَّ نفسه من المساعد عبر node */
const PY_READ = /\(ROOT\s*\/\s*['"]server\.ts['"]\)\.read_text\(\)|\b(?:txt|read)\(\s*['"]server\.ts['"]\s*\)/g;
const PY_HELPER = `
def read_server_source():
    """server.ts وما قُسّم منه بترتيبه القديم — tests/helpers/serverSource.mjs."""
    import subprocess, pathlib
    root = pathlib.Path(__file__).resolve().parent.parent
    code = "import { readServerSource } from './tests/helpers/serverSource.mjs'; process.stdout.write(readServerSource())"
    return subprocess.check_output(["node", "--input-type=module", "-e", code], cwd=root, text=True)
`;
function rewritePython(root, changed) {
  for (const name of fs.readdirSync(path.join(root, "tests")).filter(f => f.endsWith(".py"))) {
    const file = `tests/${name}`;
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (!PY_READ.test(text)) continue;
    PY_READ.lastIndex = 0;
    let next = text.replace(PY_READ, "read_server_source()");
    if (!next.includes("def read_server_source(")) {
      const lines = next.split("\n");
      let last = 0;
      lines.forEach((l, i) => { if (/^(import|from)\s/.test(l)) last = i; });
      lines.splice(last + 1, 0, PY_HELPER);
      next = lines.join("\n");
    }
    fs.writeFileSync(path.join(root, file), next);
    changed.push(file);
  }
}

export function rewriteTests(root = process.cwd()) {
  const changed = [];
  const review = [];
  const files = [];
  for (const dir of ["tests", "scripts"]) {
    const walk = d => {
      for (const entry of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = `${d}/${entry.name}`;
        if (entry.isDirectory()) { if (!["fixtures", "split-server", "node_modules"].includes(entry.name)) walk(rel); continue; }
        if (/\.(ts|tsx|mjs|js)$/.test(entry.name) && !SKIP.has(rel)) files.push(rel);
      }
    };
    walk(dir);
  }
  for (const file of files) {
    const abs = path.join(root, file);
    const text = fs.readFileSync(abs, "utf8");
    if (!text.includes("server.ts")) continue;
    let next = text.replace(READ_FILE, "readServerSource()").replace(READ_HELPER, "readServerSource()");
    next = relocateAllowEntries(next, root);
    next = spreadFileLists(next);
    for (const rule of PAGE_EXTRACTION) if (rule.file === file) next = next.replace(rule.from, rule.to);
    if (next !== text) {
      const names = ["readServerSource", "serverSourceFiles"].filter(n => new RegExp(`\\b${n}\\(`).test(next.replace(/^import .*$/gm, "")));
      const spec = importLine(file).match(/from "(.*)";/)[1];
      next = next.split("\n").filter(l => !(l.startsWith("import {") && l.endsWith(`from "${spec}";`))).join("\n");
      if (names.length) next = addImport(next, `import { ${names.join(", ")} } from "${spec}";`);
      fs.writeFileSync(abs, next);
      changed.push(file);
    }
    // ما بقي يذكر server.ts قراءةً لا تشغيلاً: للمراجعة
    const rest = next.split("\n").filter(l => /["'`]server\.ts["'`]|\/server\.ts["']/.test(l) && !/spawn|"tsx"|--import|tsx server\.ts|pkill|import\(["']\.\.\/server\.ts["']\)/.test(l));
    if (rest.length) review.push(`${file}: ${rest.map(l => l.trim().slice(0, 120)).join(" | ")}`);
  }
  rewritePython(root, changed);
  return { changed, review };
}
