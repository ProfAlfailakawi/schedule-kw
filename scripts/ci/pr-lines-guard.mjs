#!/usr/bin/env node
/**
 * حارسُ الأسطر المضافة في طلب الدمج (قرار المالك 2026-11-09: «كل شيء أوتو وباحترافية»).
 *
 * شروطُ المالك على الكود المُسلَّم لا يحرسها فحصُ نظافة المستودع وحده ولا فحصُ الوثيقة (عباراتُها هي).
 * فهذا الحارس يقرأ **الأسطر التي يضيفها الطلب وحدها** ويرفض ما في قائمة العبارات المحجوزة أدناه:
 * أسماءً وعباراتٍ محجوزة، ومعرّفاتٍ خاصةً بالمالك خارج ملفات النشر والإعداد.
 * لا يلمس ما قبله: الأسطر القديمة تُنظَّف عند تجهيز نسخة التسليم، فلا يتأخر منعُ الجديد حتى ذلك.
 *
 * العباراتُ نفسُها مخزَّنةٌ مرمَّزةً (base64) فلا يقرؤها من يفتح الملف، وهي تُفكُّ عند التشغيل.
 * استثناءٌ مقصود لسطرٍ بعينه: اكتب في السطر نفسه  lines-guard: allow <السبب>  (السببُ إلزامي وتراه المراجعة).
 *
 * في CI على pull_request: node scripts/ci/pr-lines-guard.mjs HEAD^1
 * محلياً: node scripts/ci/pr-lines-guard.mjs <base> [head]
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const decode = text => Buffer.from(text, "base64").toString("utf8");
const RULES = [
  { id: "tools", flags: "i", source: "KGNsYXVkZXxhbnRocm9waWN8Y2hhdGdwdHxvcGVuYWl8XC5jdXJzb3JydWxlc3xcYmFpZGVyXGJ8Z2l0aHViWyAtXT9jb3BpbG90fGNvcGlsb3QtaW5zdHJ1Y3Rpb25zKQ==", why: "اسم محجوز (قائمة العبارات المحجوزة مخزّنة مرمّزة)" },
  { id: "tools-case", flags: "", source: "XGIoQ29kZXh8Q09ERVh8Y29kZXgpXGI=", why: "اسم محجوز (قائمة العبارات المحجوزة مخزّنة مرمّزة)" },
  { id: "ai-wording", flags: "i", source: "KNiw2YPYp9ihXHMq2KfYtdi32YbYp9i52YooPyFccyrZgdmKXHMq2KfZhNiq2LnZhNmK2YUpfNin2YTYsNmD2KfYoVxzKtin2YTYp9i12LfZhtin2LnZiig/IVxzKtmB2YpccyrYp9mE2KrYudmE2YrZhSl8YXJ0aWZpY2lhbFxzK2ludGVsbGlnZW5jZXxtYWNoaW5lXHMrbGVhcm5pbmd8XGJMTE1zP1xiKQ==", why: "عبارة محجوزة تصف النظام (الاسم المسموح الوحيد لخدمة خارجية: Gemini)" },
  { id: "ai-short", flags: "", source: "XGJBSVxi", why: "عبارة محجوزة تصف النظام (الاسم المسموح الوحيد لخدمة خارجية: Gemini)" },
  { id: "owner-ids", flags: "i", source: "KFByb2ZBbGZhaWxha2F3aXxnZW4tbGFuZy1jbGllbnR8c2NoZWR1bGUtODYzZWJ8YWktc3R1ZGlvLXNjaGVkdWxlfEBob3RtYWlsXC5jb218QGdtYWlsXC5jb218QG91dGxvb2tcLmNvbXxhaF9mQCk=", why: "معرّف خاص بالمالك (مسموح في ملفات النشر والإعداد وحدها)" }
].map(rule => ({ ...rule, re: new RegExp(decode(rule.source), rule.flags) }));

/* ما لا يُفحص أبداً: ثنائيٌّ ومولَّد وبياناتٌ حقيقية (عناوين مقررات)، وملفات هذه الحراسة نفسها. */
const SKIP = [
  /^package-lock\.json$/, /^docs\/srs\/pdf\//, /^tests\/fixtures\//, /^public\/plans\//,
  /^src\/data\/technologyEducationCurricula\.ts$/, /^src\/server\/planSheetReferenceLayout\.ts$/,
  /^scripts\/ci\/pr-lines-guard\.mjs$/, /^tests\/pr-lines-guard-audit\.ts$/, /^tests\/repo-hygiene-guard\.mjs$/, /^scripts\/srs\/lib\/common\.mjs$/,
  /\.(png|jpe?g|webp|gif|ico|pdf|woff2?|ttf|otf|traineddata|zip)$/i,
];
/* معرّفاتُ المالك مسموحةٌ حيث يقتضيها النشر والإعداد وفحوصُهما. */
const OWNER_IDS_OK = [
  /^\.github\/workflows\//, /^firebase[^/]*\.json$/, /^firestore\./, /^cloudbuild\.yaml$/, /^Dockerfile$/, /^\.env\.example$/,
  /^tests\/deploy-target-guard\.mjs$/, /^tests\/firestore-target-audit\.ts$/, /^scripts\/loadtest\//, /^scripts\/firestore-backup\.md$/,
  /^docs\/DELIVERY_OPERATIONS\.md$/, /^scripts\/srs\//, /^scripts\/ci\//,
];
const ALLOW = /lines-guard:\s*allow\s+\S/;

/** مسارُ git قد يأتي مقتبساً بهروب ثماني (أسماء غير لاتينية)؛ يُفكّ ثم تُحذف بادئة الوجهة. */
export function diffPath(raw) {
  let text = raw.replace(/\t.*$/, "");
  if (text.startsWith('"') && text.endsWith('"')) {
    const bytes = [];
    const body = text.slice(1, -1);
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch !== "\\") { bytes.push(...Buffer.from(ch, "utf8")); continue; }
      const octal = /^[0-7]{3}/.exec(body.slice(i + 1));
      if (octal) { bytes.push(parseInt(octal[0], 8)); i += 3; continue; }
      const next = body[++i];
      bytes.push(({ n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11 })[next] ?? next.charCodeAt(0));
    }
    text = Buffer.from(bytes).toString("utf8");
  }
  return text === "/dev/null" ? text : text.replace(/^b\//, "");
}

export const isSkipped = file => SKIP.some(re => re.test(file));
export const ruleApplies = (rule, file) => !(rule.id === "owner-ids" && OWNER_IDS_OK.some(re => re.test(file)));

/** يقرأ ناتجَ git diff -U0 ويعيد المخالفات: [{ file, line, rule, why, text }]. */
export function scanDiffText(diff) {
  const found = [];
  let file = "", line = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) { file = diffPath(raw.slice(4)); continue; }
    if (raw.startsWith("--- ")) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) { line = Number(hunk[1]); continue; }
    if (!raw.startsWith("+") || !file || file === "/dev/null") continue;
    const text = raw.slice(1);
    const at = line++;
    if (isSkipped(file) || ALLOW.test(text)) continue;
    for (const rule of RULES) {
      if (!ruleApplies(rule, file)) continue;
      const match = rule.re.exec(text);
      if (match) found.push({ file, line: at, rule: rule.id, why: rule.why, text: match[0] });
    }
  }
  return found;
}

function main() {
  const event = process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)
    ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : null;
  const base = process.argv[2] || event?.pull_request?.base?.sha;
  if (!base) { console.log("حارس الأسطر: لا أساس للمقارنة (ليس طلب دمج) — لا شيء يُفحص."); return 0; }
  const head = process.argv[3] || "HEAD";
  const diff = execFileSync("git", ["-c", "core.quotepath=false", "diff", "-U0", "--no-color", "--diff-filter=AMR", base, head], { encoding: "utf8", maxBuffer: 1 << 29 });
  const found = scanDiffText(diff);
  if (!found.length) { console.log("✓ حارس الأسطر: الأسطر المضافة نظيفة."); return 0; }
  console.error(`✗ حارس الأسطر: ${found.length} سطراً مضافاً يخالف شروط التسليم:`);
  for (const item of found.slice(0, 40)) console.error(`  ${item.file}:${item.line}  [${item.rule}] ${item.why} — «${item.text}»`);
  if (found.length > 40) console.error(`  … و${found.length - 40} غيرها`);
  console.error("  أزل العبارة أو أعد صياغتها. وإن كان السطرُ مقصوداً حقاً فاكتب فيه: lines-guard: allow <السبب>");
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
