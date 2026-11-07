/**
 * أدواتٌ مشتركة لمنظومة وثيقة المتطلبات (docs/srs): قراءةُ الوحدات، قائمةُ ملفات المستودع،
 * مطابقةُ الأنماط، وقائمةُ العبارات الممنوعة. لا تعتمد على أي حزمة.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
export const SRS_DIR = path.join(ROOT, "docs/srs");
export const MODULES_DIR = path.join(SRS_DIR, "modules");

export const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

export function loadMeta() { return readJson(path.join(SRS_DIR, "meta.json")); }
/** ادّعاءات إضافية لملفاتٍ لا تذكرها وحدةٌ في sources: { رمز_الوحدة: [أنماط] }. */
export function loadClaims() {
  const f = path.join(SRS_DIR, "claims.json");
  return fs.existsSync(f) ? readJson(f) : {};
}
export function loadActors() { return readJson(path.join(SRS_DIR, "actors.json")); }

export function loadModules() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  return fs.readdirSync(MODULES_DIR).filter(n => n.endsWith(".json")).sort()
    .map(name => ({ file: `docs/srs/modules/${name}`, data: readJson(path.join(MODULES_DIR, name)) }))
    .sort((a, b) => (a.data.order ?? 999) - (b.data.order ?? 999));
}

let trackedCache = null;
/** ملفاتُ المستودع المتتبَّعة (وغير المتجاهَلة) بمساراتٍ نسبية. */
export function trackedFiles() {
  if (trackedCache) return trackedCache;
  try {
    const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, maxBuffer: 1 << 28 }).toString("utf8");
    trackedCache = out.split("\0").filter(Boolean).filter(f => fs.existsSync(path.join(ROOT, f)));
  } catch {
    trackedCache = [];
    const walk = (dir, rel = "") => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if ([".git", "node_modules", "dist"].includes(e.name)) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), r); else trackedCache.push(r);
      }
    };
    walk(ROOT);
  }
  return trackedCache;
}

/** نمطُ glob بسيط: ** عبر المجلدات، * داخل اسم، ? حرفٌ واحد. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; if (glob[i + 1] === "/") i++; } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

/** يزيل لاحقة #رمز أو :سطر من مرجع دليل. */
export const stripRef = ref => String(ref).replace(/[#:].*$/, "");

/**
 * عباراتٌ لا تظهر في الوثيقة ولا في صفحتها: طريقةُ إعداد النظام لا تُذكر،
 * وصفةُ «ذكاء» لا تُوصَف بها ميزاتُه. Gemini يُذكر بالاسم في وحدات الاستيراد والتحليلات
 * والواجهات الخارجية والمتطلبات غير الوظيفية فقط.
 */
export const FORBIDDEN = [
  /ذكاء\s*اصطناعي/u, /الذكاء\s*الاصطناعي/u, /(?<![\u0600-\u06FF])(?:ال)?ذكاء(?![\u0600-\u06FF])/u, /(?<![\u0600-\u06FF])(?:ال)?ذكي(?:ة|ّة)?(?![\u0600-\u06FF])/u,
  /\bA\.?I\.?\b(?!\w)/, /artificial\s+intelligence/i, /machine\s+learning/i, /\bLLMs?\b/, /\bGPT/i, /chat\s?bot/i,
  /language\s+model/i, /generative/i, /\bintelligen(?:t|ce)\b/i, /\bsmart\b/i, /نموذج\s+لغوي/u, /تعلّ?م\s+الآلة/u,
  /ProfAlfailakawi/i, /gen-lang-client/i, /schedule-863eb/i, /روبوت\s+محادثة/u, /مولَّد\s+آلياً/u, /auto-?generated\s+by/i,
];
export const GEMINI_ALLOWED_MODULES = new Set(["IMP", "INT", "EXT", "NFR"]);

/** كلُّ النصوص داخل بنيةٍ JSON مع مساراتها. */
export function* walkStrings(node, trail = "") {
  if (typeof node === "string") { yield [trail, node]; return; }
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) yield* walkStrings(node[i], `${trail}[${i}]`); return; }
  if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) yield* walkStrings(v, trail ? `${trail}.${k}` : k);
}

export function forbiddenHits(text, { allowGemini = false } = {}) {
  const hits = [];
  for (const re of FORBIDDEN) { const m = re.exec(text); if (m) hits.push(m[0]); }
  if (!allowGemini && /gemini/i.test(text)) hits.push("Gemini");
  return hits;
}
