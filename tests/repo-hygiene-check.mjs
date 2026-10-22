/**
 * ── فحص نظافة المستودع (يعمل في كل Pull Request) ───────────────────────────
 *
 * يمنع أن يحمل المستودع أسماء أدوات المساعدة البرمجية بوصفها أسماء لمكوّنات
 * المشروع أو علامةً على طريقة تطويره، ويمنع إدخال ملفات برومبتات أو تعليمات
 * مؤقتة، ويكتشف المراجع المكسورة والملفات التطويرية المهجورة.
 *
 * ما لا يفحصه عمداً: أسماء الخدمات التي يعتمد عليها البرنامج فعلاً
 * (Gemini وOpenAI وغيرها) وأسماء الوظائف التشغيلية مثل «copilot» في واجهة
 * الذكاء الاصطناعي. تغيير هذه الأسماء يغيّر سلوك النظام، فهي خارج الفحص.
 *
 * يعمل بلا شبكة. وفي GitHub Actions يقرأ هذه المتغيرات إن وُجدت:
 *   HYGIENE_BRANCH        اسم الفرع                (github.head_ref)
 *   HYGIENE_PR_TITLE      عنوان الـPull Request
 *   HYGIENE_PR_BODY       وصف الـPull Request
 *   HYGIENE_COMMIT_RANGE  نطاق الالتزامات مثل origin/main..HEAD
 *
 * الاستثناءات المبرَّرة في scripts/hygiene-allowlist.json، والملفات القديمة
 * التي لا تُمنع لكنها لا تتكاثر في scripts/hygiene-baseline.json.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const failures = [];
const notes = [];
const fail = (what, fix) => failures.push({ what, fix });

/* ── أسماء أدوات التطوير. مقصودٌ حدودُ الكلمة وحالةُ الأحرف: «codeX» متغيّر برمجي. */
const TOOL_WORD = /\b(?:Claude|CLAUDE|claude|Codex|CODEX|codex|ChatGPT|CHATGPT|chatgpt|Jules|JULES|jules|Anthropic|ANTHROPIC|anthropic)\b/;
const TOOL_PATH = /(?:^|[\/._-])(?:claude|codex|chatgpt|jules|anthropic|cursorrules|copilot-instructions)(?:$|[\/._-])/i;
const TOOL_PATH_EXACT = [/^\.claude(\/|$)/, /^\.codex(\/|$)/, /^\.cursor(\/|$)/, /^\.cursorrules$/, /^\.github\/copilot-instructions\.md$/, /^CLAUDE\.md$/i];
const GENERIC_HINT = "صِف الوظيفة نفسها (مثل feature/teaching-load أو fix/student-registration أو maintenance/firestore-config) بدل اسم الأداة.";

/* ── ملفات برومبتات وتعليمات تطوير مؤقتة ومهجورة. */
const TEMP_FILE_PATTERNS = [
  /(^|\/)[^/]*(?:HANDOFF-PROMPT|_PROMPT|-PROMPT|TASK_PROMPT)[^/]*\.(?:md|txt)$/i,
  /(^|\/)(?:INSTALL-IN-[A-Z-]+|README-APPLY)[^/]*$/,
  /(^|\/)\.cleanup-delete-list[^/]*$/,
  /\.(?:orig|rej|bak|rej\.tmp)$/,
  /(^|\/)apply-fixes[^/]*$/,
  /(^|\/)JULES_TASK/i,
];

/* ── قراءة الإعدادات. */
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const allow = readJson("scripts/hygiene-allowlist.json", { paths: [], contentIn: [] });
const baseline = new Set(readJson("scripts/hygiene-baseline.json", { legacyFiles: [] }).legacyFiles);
const allowedPath = (p) => allow.paths.includes(p);
const allowedContent = (p) => allow.contentIn.includes(p);

/* ── الملفات المتتبَّعة. */
let files;
try {
  files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean);
} catch {
  console.error("✗ فحص النظافة يحتاج مستودع Git."); process.exit(2);
}
const fileSet = new Set(files);

/* ١. أسماء الملفات والمجلدات، والملفات المؤقتة. */
for (const p of files) {
  if (allowedPath(p)) continue;
  if (TOOL_PATH_EXACT.some(r => r.test(p)) || TOOL_PATH.test(p)) {
    fail(`اسم المسار «${p}» يحمل اسم أداة تطوير.`, `أعد تسمية الملف باسم يصف وظيفته. ${GENERIC_HINT}`);
  }
  if (TEMP_FILE_PATTERNS.some(r => r.test(p)) && !baseline.has(p)) {
    fail(`«${p}» يبدو ملف برومبت أو تعليمات تطوير مؤقتة أو أثراً مهجوراً.`,
      "لا تُدخِله في المستودع. إن كان جزءاً دائماً من التوثيق فأعد تسميته بوصف هندسي (مثل docs/MAINTENANCE_REVIEW_RULES.md) أو أضفه إلى scripts/hygiene-allowlist.json مع سبب.");
  }
}
for (const legacy of baseline) {
  if (!fileSet.has(legacy)) notes.push(`ملف قديم في خط الأساس لم يعد موجوداً: ${legacy} — احذفه من scripts/hygiene-baseline.json.`);
}

/* ٢. المحتوى: التعليقات والتوثيق وكل نص (غير الثنائي). */
const SKIP_CONTENT = /(^|\/)(package-lock\.json|.*\.(?:png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|traineddata|gz|zip|xlsx?|svg))$/i;
const decoder = new TextDecoder("utf-8", { fatal: false });
const texts = new Map();
for (const p of files) {
  if (SKIP_CONTENT.test(p)) continue;
  try { if (statSync(p).size > 3_000_000) continue; } catch { continue; }
  const buffer = readFileSync(p);
  if (buffer.includes(0)) continue;
  texts.set(p, decoder.decode(buffer));
}
for (const [p, text] of texts) {
  if (p === "tests/repo-hygiene-check.mjs" || allowedContent(p)) continue;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const hit = lines[i].match(TOOL_WORD);
    if (hit) fail(`${p}:${i + 1} يذكر أداة التطوير «${hit[0]}».`,
      "اكتب ما يشرحه التغيير نفسه لا من نفّذه (مثل «مراجعة الكود على #184»). إن كان الاسم خدمة يعتمد عليها البرنامج فعلاً فأضف الملف إلى contentIn في scripts/hygiene-allowlist.json مع سبب.");
  }
}

/* ٣. المراجع المكسورة: روابط Markdown النسبية، وإشارات `docs/...` داخل ملفات التوثيق. */
const refSources = [...texts.keys()].filter(p => /\.md$/i.test(p));
for (const p of refSources) {
  const text = texts.get(p);
  const check = (target, how) => {
    const clean = target.split("#")[0].split("?")[0].trim();
    if (!clean || /^(?:[a-z]+:|\/\/|mailto:)/i.test(clean) || clean.startsWith("/")) return;
    const resolved = normalize(clean.startsWith("docs/") || !clean.startsWith(".") ? clean : join(dirname(p), clean)).replace(/\\/g, "/");
    const candidates = [resolved, normalize(join(dirname(p), clean)).replace(/\\/g, "/")];
    if (!candidates.some(c => fileSet.has(c) || [...fileSet].some(f => f.startsWith(c.replace(/\/?$/, "/"))))) {
      fail(`${p} يشير إلى «${clean}» (${how}) وهو غير موجود.`, "أصلِح المسار أو أزل المرجع أو أعد الملف المطلوب.");
    }
  };
  for (const m of text.matchAll(/\]\((\.{0,2}\/?[^)\s]+\.(?:md|txt|json|ya?ml|mjs|ts|tsx))(?:#[^)]*)?\)/g)) check(m[1], "رابط");
  for (const m of text.matchAll(/`((?:docs|tests|scripts|src)\/[A-Za-z0-9_./-]+\.(?:md|txt|json|ya?ml|mjs|ts|tsx))`/g)) check(m[1], "إشارة");
}

/* ٤. الفرع والالتزامات وعنوان الـPull Request ووصفه — بالقدر الذي توفره البيئة. */
const branch = process.env.HYGIENE_BRANCH || "";
if (branch && !/^(?:dependabot|renovate)\//.test(branch)) {
  const hit = branch.match(TOOL_WORD) || (TOOL_PATH.test(branch) ? [branch] : null);
  if (hit) fail(`اسم الفرع «${branch}» يحمل اسم أداة تطوير.`, `أنشئ فرعاً جديداً باسم وظيفي وافتح الـPull Request منه. ${GENERIC_HINT}`);
  else if (!/^(?:feature|fix|maintenance|docs|test|refactor|hotfix|release)\/[a-z0-9][a-z0-9._-]*$/.test(branch)) {
    notes.push(`تنبيه (لا يمنع الدمج): الفرع «${branch}» لا يتبع feature|fix|maintenance|docs|test|refactor/<وصف-بحروف-صغيرة>.`);
  }
}
for (const [label, value] of [["عنوان الـPull Request", process.env.HYGIENE_PR_TITLE], ["وصف الـPull Request", process.env.HYGIENE_PR_BODY]]) {
  const hit = value && value.match(TOOL_WORD);
  if (hit) fail(`${label} يذكر أداة التطوير «${hit[0]}».`, "عدّل النص ليصف التغيير البرمجي الحقيقي فقط.");
}
const range = process.env.HYGIENE_COMMIT_RANGE || "";
if (range) {
  try {
    const log = execFileSync("git", ["log", "--format=%H%x1f%B%x1e", range], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    for (const entry of log.split("\x1e").map(s => s.trim()).filter(Boolean)) {
      const [sha, message = ""] = entry.split("\x1f");
      const hit = message.match(TOOL_WORD);
      if (hit) fail(`رسالة الالتزام ${sha.slice(0, 8)} تذكر «${hit[0]}».`,
        "أعد كتابة الرسالة لتشرح التغيير البرمجي (git commit --amend أو rebase تفاعلي في فرعك قبل الدمج). لا تعدّل بيانات المؤلف.");
    }
  } catch (error) {
    notes.push(`تعذّر قراءة نطاق الالتزامات «${range}»؛ لم تُفحص رسائل الالتزام: ${String(error.message).split("\n")[0]}`);
  }
}

/* ── النتيجة. */
for (const note of notes) console.log(`• ${note}`);
if (failures.length) {
  console.error(`\n✗ فحص نظافة المستودع: ${failures.length} مشكلة\n`);
  for (const f of failures.slice(0, 60)) console.error(`  - ${f.what}\n    الإصلاح: ${f.fix}`);
  if (failures.length > 60) console.error(`  … و${failures.length - 60} أخرى.`);
  process.exit(1);
}
console.log(`✓ فحص نظافة المستودع: ${files.length} ملفاً، ${texts.size} نصاً، لا مخالفات.`);
