/**
 * ما يعرضه البرنامج عربيةٌ فصحى. قال المالك عن شاشةٍ كُتب فيها «ليش؟»:
 * «لا تكتب كويتي … لازم كل البرنامج لغة عربية».
 *
 * يقرأ هذا الحارسُ نصوصَ الواجهة في src/ (السلاسل، وقوالب النص، ونصوص JSX —
 * ومنها صفحاتُ الخادم وسكربتاتها المضمّنة) ويفشل إن وجد كلمةً عاميّة من قائمةٍ
 * قصيرة لا لبس فيها، كاملةً لا جزءاً من كلمة، ويذكر الملف والسطر.
 *
 * لا يقرأ التعليقات (فيها اقتباساتٌ من كلام المالك)، ولا ما يُطابَق به كلامُ
 * المستخدم: التعابير النمطية، ووسيطَ test/includes/match، ومصفوفات keywords —
 * فالمرشد يفهم «شلون» ويجيب بالفصحى. وما بقي مشروعاً بعد ذلك في ALLOW.
 */
import fs from "fs";
import path from "path";
import ts from "typescript";
import { matchesInboxAsk, parseInboxAsk, type InboxAskCandidate } from "../src/utils/inboxAsk";
import { parseNaturalQuery } from "../src/utils/naturalQuery";

/** كلماتٌ عاميّة لا تأتي في الفصحى بهذا الرسم، وبجانب كلٍّ بديلُها. */
const COLLOQUIAL: Record<string, string> = {
  "ليش": "لماذا",
  "شنو": "ماذا / ما",
  "الحين": "الآن",
  "وايد": "كثيراً",
  "شلون": "كيف",
  "اشلون": "كيف",
  "علشان": "لكي / لأن",
  "عشان": "لكي / لأن",
  "هني": "هنا",
  "هنيه": "هنا",
  "وين": "أين",
  "صج": "صحيح",
  "منو": "مَن",
  "جذي": "هكذا",
  "خلّ": "دع / اجعل",
  "خله": "دعه / اجعله",
  "خليه": "دعه / اجعله",
  "اللي": "الذي / التي / ما",
  "فاضية": "فارغة",
  "فاضي": "فارغ",
  "يبي": "يريد",
  "تبي": "تريد",
  "ماكو": "لا يوجد",
  "شي": "شيء",
  "تقدر": "يمكنك / تستطيع",
  "اللحين": "الآن",
  "هذي": "هذه",
  // سبق أن اختار المالك «لديك» و«يصبح» في بطاقة الأستاذ (teacher-card-r4-audit R5).
  "عندك": "لديك",
  "يصير": "يصبح",
  "تصير": "تصبح",
  "كرت": "بطاقة",
  "الكرت": "البطاقة",
  "الأدمن": "مدير النظام",
  "للأدمن": "لمدير النظام",
};

/** مواضعُ مشروعة: [ملف، الكلمة، سبب]. أبقِها قصيرة. */
const ALLOW: Array<[string, string, string]> = [
  // كلماتُ توقّفٍ يُسقطها مركزُ الوارد من سؤال المستخدم — لا تُعرض.
  ["src/utils/inboxAsk.ts", "اللي", "كلمة توقّف في فهم السؤال"],
  ["src/utils/inboxAsk.ts", "شنو", "كلمة توقّف في فهم السؤال"],
  ["src/utils/inboxAsk.ts", "عندك", "كلمة توقّف في فهم السؤال"],
];

const LETTERS = "ء-يٱ-ۓً-ْـ";
const TOKEN = new RegExp(`(?:^|[^${LETTERS}])[وف]?(${Object.keys(COLLOQUIAL).sort((a, b) => b.length - a.length).join("|")})(?=$|[^${LETTERS}])`, "g");

/** نصُّ قالب الخادم قد يحمل سكربتاً مضمّناً بتعليقاته: تُسقط تعليقاته قبل الفحص. */
const stripEmbeddedComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[\s;{}()])\/\/[^\n]*/g, (m, lead) => lead + " ".repeat(m.length - lead.length))
      .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));

const MATCHERS = new Set(["test", "includes", "match", "matchAll", "search", "startsWith", "endsWith", "indexOf", "replace", "replaceAll", "split"]);

/** سلسلةٌ يُطابَق بها كلامُ المستخدم لا تُعرض عليه. */
function isInputMatcher(node: ts.Node): boolean {
  for (let cur: ts.Node | undefined = node.parent, depth = 0; cur && depth < 6; cur = cur.parent, depth++) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      if (ts.isPropertyAccessExpression(callee) && MATCHERS.has(callee.name.text)) return true;
      if (ts.isIdentifier(callee) && callee.text === "RegExp") return true;
      return false;
    }
    if (ts.isNewExpression(cur) && ts.isIdentifier(cur.expression) && cur.expression.text === "RegExp") return true;
    if (ts.isPropertyAssignment(cur) && /^(keywords|aliases|synonyms)$/.test(cur.name.getText())) return true;
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) return false;
  }
  return false;
}

type Hit = { file: string; line: number; word: string; text: string };

function scanFile(file: string, source = fs.readFileSync(file, "utf8")): Hit[] {
  if (!/[؀-ۿ]/.test(source)) return [];
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".jsx") ? ts.ScriptKind.JSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const hits: Hit[] = [];
  const visit = (node: ts.Node) => {
    let text: string | null = null;
    let start = 0;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      start = node.getStart(sf);
      text = source.slice(start, node.getEnd());
      if (!ts.isStringLiteral(node)) text = stripEmbeddedComments(text);
      if (isInputMatcher(node)) text = null;
    } else if (ts.isJsxText(node)) {
      start = node.getStart(sf);
      text = source.slice(start, node.getEnd());
    }
    if (text) {
      for (const m of text.matchAll(TOKEN)) {
        const word = m[1];
        const at = start + (m.index ?? 0) + m[0].indexOf(word);
        const { line } = sf.getLineAndCharacterOfPosition(at);
        const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
        if (ALLOW.some(([f, w]) => f === rel && w === word)) continue;
        hits.push({ file: rel, line: line + 1, word, text: source.split("\n")[line].trim().slice(0, 140) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

// الحارسُ نفسه يُمسك ما يجب أن يُمسك، ويترك ما يجب أن يُترك.
check([..."ليش انتقل؟".matchAll(TOKEN)].length === 1, "يُمسك «ليش» كلمةً كاملة");
check([..."وين القاعة".matchAll(TOKEN)].length === 1, "يُمسك «وين» بعد واو العطف أيضاً");
check([..."التعيين والبين".matchAll(TOKEN)].length === 0, "لا يُمسك «ين» داخل كلمة");
check([..."منوّع ومنوال".matchAll(TOKEN)].length === 0, "لا يُمسك «منو» جزءاً من كلمة");
check([..."شيء وأشياء".matchAll(TOKEN)].length === 0, "«شيء» الفصحى لا تُمسك");

// والقراءةُ نفسها: نصُّ الواجهة يُمسك، والتعليقُ وما يُطابَق به كلامُ المستخدم يُترك.
const probe = [
  `/* سأل المالك: «ليش؟» */`,
  `const a = "ليش انتقل؟";`,
  `const b = <p>وين القاعة</p>;`,
  `const c = /شلون|كيف/.test(q);`,
  `const d = q.includes("وين المشكلة");`,
  `const e = { keywords: ["كرت", "بطاقة"] };`,
  "const f = `<script>/* شنو */ var x='هني';</script>`;",
].join("\n");
const probed = scanFile("probe.tsx", probe).map(h => `${h.line}:${h.word}`).join(" ");
check(probed === "2:ليش 3:وين 7:هني", `القارئ يُمسك نصوص الواجهة ويترك التعليقات والمطابقة (${probed})`);

const files = walk("src");
const hits = files.flatMap(file => scanFile(file));
for (const h of hits) console.log(`  ${h.file}:${h.line}  «${h.word}» ← ${COLLOQUIAL[h.word]}\n      ${h.text}`);
check(hits.length === 0, `نصوص الواجهة في src/ (${files.length} ملفاً) بلا كلمةٍ عاميّة`);

/* ── الأمثلةُ المعروضة يفهمها قارئُها ──────────────────────────────────────
   صار المثال فصيحاً («التي لديها»، «فارغة»، «من لديه») فيجب أن يفهمه المحلّل
   الذي يُكتب له، وتبقى العاميّة مفهومةً لمن اعتادها. تُقرأ الأمثلة من الشاشة
   نفسها، فإن تغيّر مثالٌ اختُبر الجديد. */
{
  const changes = fs.readFileSync("src/components/ScheduleChanges.tsx", "utf8");
  const inboxExamples = [...changes.matchAll(/askPlaceholder=\{[^}]*\}/g)].flatMap(m => [...m[0].matchAll(/"اسأل: ([^"]+)"/g)].map(x => x[1]));
  check(inboxExamples.length === 2, `أمثلةُ الوارد مقروءةٌ من الشاشة (${inboxExamples.join(" | ")})`);
  const row: InboxAskCandidate = { status: "submitted", late: true, blockingConflicts: 1, openNotes: 1, sectionName: "قسم الرياضيات", collegeName: "كلية التربية الأساسية" };
  for (const example of [...inboxExamples, "الأقسام المتأخرة اللي عندها موانع", "المتأخر أو اللي فيه ملاحظات"]) {
    const ask = parseInboxAsk(example);
    check(ask.understood && ask.lateOnly && ask.signals.length === 1 && ask.text === "" && matchesInboxAsk(row, ask),
      `الوارد يفهم «${example}» كلَّه ولا يُبقي نصَّ بحثٍ يُفرغ الشاشة`);
  }

  const reports = fs.readFileSync("src/components/Reports.tsx", "utf8");
  const roomExamples = [...reports.matchAll(/(?:اسأل|جرّب): (قاعات [^"<]+?)(?="|<)/g)].map(m => m[1].trim());
  check(roomExamples.length === 2, `أمثلةُ استعلام القاعات مقروءةٌ من الشاشة (${roomExamples.join(" | ")})`);
  for (const example of [...roomExamples, "قاعات فاضية الثلاثاء 10"]) {
    const q = parseNaturalQuery(example);
    check(q.intent === "freeRooms" && q.day === 2 && q.time === "10:00", `الاستعلام يفهم «${example}» قاعاتٍ فارغةً الثلاثاء 10:00`);
  }

  const intel = fs.readFileSync("src/components/IntelligenceWorkspace.tsx", "utf8");
  const intelRoutes = fs.readFileSync("src/server/routes/intelligenceRoutes.ts", "utf8");
  const chip = (intel.match(/"(من لديه [^"]+)"/) || [])[1] || "";
  const normalized = chip.replace(/[؟?]/g, "").toLowerCase();
  check(Boolean(chip) && intelRoutes.includes("/^من\\s/.test(normalized)") && /^من\s/.test(normalized) && /فراغ/.test(normalized),
    `مثالُ مركز الذكاء «${chip}» سؤالٌ عن القسم كلّه (لا عن أستاذٍ اسمُه «لديه») ويُجاب بالفراغات`);
}

// كلُّ استثناءٍ ما زال يقابل موضعاً حقيقياً — لا يبقى استثناءٌ ميّت.
for (const [file, word, why] of ALLOW) {
  const src = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  check(new RegExp(`(?:^|[^${LETTERS}])${word}(?=$|[^${LETTERS}])`).test(src), `الاستثناء ما زال في موضعه: ${file} «${word}» (${why})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
