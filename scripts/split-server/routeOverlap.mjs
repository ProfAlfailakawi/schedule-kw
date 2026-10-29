/**
 * ── هل يلتقي مساران على طلبٍ واحد؟ ──────────────────────────────────────────
 *
 * Express يجرّب طبقاتِ الموجّه بترتيب تسجيلها، فترتيبُ طبقتين لا يهمّ إلا إن
 * أمكن أن يطابقهما طلبٌ واحد. هذه الوحدةُ تجيب عن ذلك لطبقتين، وتستعملها أداةُ
 * التقسيم (لتعرف أيُّ نقلٍ يحفظ الترتيبَ اللازم) واختبارُ تكافؤ الموجّه (ليحكم).
 *
 * الطريقة: عيّنةُ عناوين من كل مسار — يُملأ كلُّ مقطعٍ متغيّر (:id) بقيمةٍ عامة،
 * وبالمقطع الحرفيّ المقابل له في المسار الآخر — ثم تُختبر كلُّ عيّنة على التعبيرين
 * المنتظمين اللذين يبنيهما Express نفسه (path-to-regexp). وهذا أشدُّ من «عيّنةُ كلٍّ
 * على تعبير الآخر» وحدها: كلُّ تعارضٍ تجده تلك تجده هذه.
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const expressDir = path.dirname(require.resolve(path.join(process.cwd(), "node_modules/express/package.json")));
const pathRegexp = require(require.resolve("path-to-regexp", { paths: [expressDir] }));

const ALL = "*";

/** طرقُ الطبقة: الطريقُ get يجيب head أيضاً؛ use و all تجيب كلَّ شيء. */
export function methodSet(kind, methods) {
  if (kind === "middleware") return new Set([ALL]);
  const set = new Set();
  for (const m of methods) {
    const lower = String(m).toLowerCase();
    if (lower === "all" || lower === "_all") return new Set([ALL]);
    set.add(lower);
    if (lower === "get") set.add("head");
  }
  return set;
}

export function methodsOverlap(a, b) {
  if (a.has(ALL) || b.has(ALL)) return true;
  for (const m of a) if (b.has(m)) return true;
  return false;
}

/** يبني التعبيرَ المنتظم كما يبنيه Layer في Express 4. */
export function layerRegexp(paths, end) {
  return pathRegexp(paths.length === 1 ? paths[0] : paths, [], { sensitive: false, strict: false, end });
}

const GENERIC = "x1";

function segmentsOf(p) {
  return String(p).split("/").slice(1);
}

/** عيّناتٌ من مسار، مع تلميحاتٍ من مقاطع المسار الآخر. */
function samplesFor(p, hintPaths) {
  if (p === "*" || p === "/*") return ["/" + GENERIC, "/"];
  const segs = segmentsOf(p);
  const hints = hintPaths.map(segmentsOf);
  let acc = [""];
  segs.forEach((seg, i) => {
    const options = new Set();
    const dynamic = seg.includes(":") || seg.includes("*") || seg.includes("(");
    if (!dynamic) options.add("/" + seg);
    else {
      options.add("/" + GENERIC);
      for (const h of hints) if (h[i] !== undefined && h[i] !== "" && !/[:*(]/.test(h[i])) options.add("/" + h[i]);
      if (/\?$/.test(seg)) options.add(""); // مقطعٌ اختياري
    }
    const next = [];
    for (const prefix of acc) for (const o of options) next.push(prefix + o);
    acc = next.slice(0, 512);
  });
  const out = new Set(acc.map(s => s || "/"));
  // مسارٌ أطول تحت البادئة (للوسيط) وصيغةٌ بشرطةٍ في آخرها
  for (const s of [...out]) { out.add(s.replace(/\/$/, "") + "/" + GENERIC); out.add(s.endsWith("/") ? s : s + "/"); }
  return [...out];
}

/**
 * طبقةٌ للمقارنة: { kind: "route"|"middleware", methods: Set, paths: string[]|null, regexp }.
 * paths=null: لا يُعرف المسار (يُعدّ ملتقياً مع كل شيء ما لم يُعطَ regexp).
 * @param {{ kind: string, methods?: string[], paths: string[] | null, regexp?: RegExp | null }} spec
 * @returns {{ kind: string, methods: Set<string>, paths: string[] | null, regexp: any }}
 */
export function makeLayer({ kind, methods = [], paths, regexp }) {
  const end = kind !== "middleware";
  const rx = regexp || (paths ? layerRegexp(paths, end) : null);
  return { kind, methods: methodSet(kind, methods), paths, regexp: rx };
}

/** هل يمكن أن يطابق طلبٌ واحدٌ الطبقتين معاً؟ */
export function layersOverlap(a, b) {
  if (!methodsOverlap(a.methods, b.methods)) return false;
  if (!a.regexp || !b.regexp) return true; // مجهولٌ: يُفترض الالتقاء (أحوط)
  if (a.regexp.fast_slash || b.regexp.fast_slash) return true;
  const aPaths = a.paths || [];
  const bPaths = b.paths || [];
  if (!aPaths.length || !bPaths.length) return true;
  const candidates = new Set();
  for (const p of aPaths) for (const s of samplesFor(p, bPaths)) candidates.add(s);
  for (const p of bPaths) for (const s of samplesFor(p, aPaths)) candidates.add(s);
  for (const url of candidates) {
    a.regexp.lastIndex = 0; b.regexp.lastIndex = 0;
    if (a.regexp.test(url) && b.regexp.test(url)) return true;
  }
  return false;
}
