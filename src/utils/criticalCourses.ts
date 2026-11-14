/**
 * ── «المقرر الحرج»: ما يؤخّر تأخيرُه التخرّجَ فصلاً كاملاً ──────────────────────
 *
 * سلسلةُ المسبقات تفرض حدّاً أدنى للفصول: مقررٌ في أول سلسلةٍ من أربع حلقات لا يُتخرَّج قبل أربعة فصولٍ من تسجيله،
 * مهما خفّ الحِمل. فإن كانت أطولُ سلسلةٍ تمرّ به تساوي فصولَ تخرّج الطالب (أو تزيد) فلا هامشَ له: تأخيرُه فصلاً
 * يؤخّر آخرَ حلقةٍ فصلاً، فيؤخّر التخرّج.
 *
 *   الفصولُ المتبقية T = أكبرُ الاثنين: تقديرُ الوحدات (ما بقي ÷ وحداته في الفصل) وأطولُ سلسلةٍ متبقية.
 *   طولُ السلسلة عبر المقرر L = عمقُه (أطولُ ما قبله + ١) + ارتفاعُه (أطولُ ما بعده + ١) − ١.
 *   حرجٌ ⇔ L ≥ T وL ≥ ٢ (جزءٌ من سلسلة، لا مقررٌ منفرد).
 *
 * لا اختراعَ بيانات: الحلقاتُ من مسبقات الصحيفة المعتمدة وحدها. صحيفةٌ بلا مسبقات ⇒ لا شيء حرج.
 * «أحدُ هذه» (بدائل) لا يُلزم مقرراً بعينه: يُحسب العمقُ بأقصر البدائل، ولا يُجعل أحدُها حرجاً بها إلا إن كان بديلاً وحيداً.
 * الاختياريُّ لا يُحسب: يُستبدل بغيره فلا يُلزم سلسلة.
 *
 * الدالةُ مكتفيةٌ بنفسها (بلا مرجعٍ خارجها، `function` و`var` فقط) لأن الصفحة تحقنها نصّاً بـ toString
 * كما تُحقن countOf: حسابٌ واحد في الخادم والاختبار والمتصفح.
 */
export interface CriticalInput {
  /** مقرراتُ الصحيفة؛ `compulsory` للإجباري (ما يُلزم الطالب بعينه). */
  courses: Array<{ id: number; compulsory: boolean }>;
  /** مسبقاتُ كل مقرر: كلُّها (`all`) وأحدُ كلِّ مجموعة (`anyOf`). */
  rules: Record<number, { all: number[]; anyOf: number[][] } | undefined>;
  passed: number[];
  /** فصولُ التخرّج بتقدير الوحدات (كما تعرضها الصفحة). */
  termsLeft: number;
}
export interface CriticalResult {
  /** المقرراتُ الحرجة، مرتّبةً بالرقم. */
  ids: number[];
  /** الفصولُ المتبقية بعد حساب السلاسل. */
  terms: number;
  /** أطولُ سلسلةٍ متبقية (بالفصول). */
  longest: number;
}

export function criticalCourses(input: CriticalInput): CriticalResult {
  var empty = { ids: [] as number[], terms: Math.max(0, Math.round(Number(input && input.termsLeft) || 0)), longest: 0 };
  if (!input || !input.courses || !input.rules) return empty;
  var passed: Record<number, boolean> = {}, remaining: Record<number, boolean> = {}, list: number[] = [], i: number, j: number;
  for (i = 0; i < (input.passed || []).length; i++) passed[Number(input.passed[i])] = true;
  for (i = 0; i < input.courses.length; i++) {
    var c = input.courses[i];
    if (c && c.compulsory && !passed[c.id] && !remaining[c.id]) { remaining[c.id] = true; list.push(c.id); }
  }
  /* الحلقةُ الإلزامية: مسبقٌ في «كلها» لم يُجتز، أو بديلٌ وحيدٌ لم يُجتز في مجموعةٍ لم تُستوفَ. البدائلُ المتعددة تُحفظ للعمق وحده. */
  var hard: Record<number, number[]> = {}, soft: Record<number, number[][]> = {}, edges = 0;
  for (i = 0; i < list.length; i++) {
    var id = list[i], rule = input.rules[id], h: number[] = [], s: number[][] = [];
    if (rule) {
      for (j = 0; j < (rule.all || []).length; j++) {
        var p = Number(rule.all[j]);
        if (remaining[p] && p !== id && h.indexOf(p) < 0) h.push(p);
      }
      for (j = 0; j < (rule.anyOf || []).length; j++) {
        var group = rule.anyOf[j] || [], met = false, open: number[] = [], k: number;
        for (k = 0; k < group.length; k++) { if (passed[Number(group[k])]) met = true; else if (remaining[Number(group[k])] && Number(group[k]) !== id) open.push(Number(group[k])); }
        if (met || !open.length) continue;
        if (open.length === 1) { if (h.indexOf(open[0]) < 0) h.push(open[0]); } else s.push(open);
      }
    }
    hard[id] = h; soft[id] = s; edges += h.length + s.length;
  }
  if (!edges) return empty;
  /* العمق (أطولُ ما قبله + ١) والارتفاع (أطولُ ما بعده + ١) بالتكرار حتى يستقرّا: بلا دوالَّ داخلية (تُحقن نصّاً)،
     والدورانُ في صحيفةٍ خاطئة يتوقف عند عدد المقررات فلا يُعلّق الحساب. */
  var depth: Record<number, number> = {}, height: Record<number, number> = {}, after: Record<number, number[]> = {}, round: number, changed = true;
  for (i = 0; i < list.length; i++) { depth[list[i]] = 1; height[list[i]] = 1; }
  for (i = 0; i < list.length; i++) for (j = 0; j < hard[list[i]].length; j++) (after[hard[list[i]][j]] = after[hard[list[i]][j]] || []).push(list[i]);
  /* في صحيفةٍ سليمة (بلا دوران) لا يتجاوز عمقٌ عددَ المقررات؛ بلوغُ ما فوقه دليلُ دوران: بياناتٌ لا يُبنى عليها، فلا شيء حرج. */
  var cap = list.length + 1;
  for (round = 0; changed && round <= cap; round++) {
    changed = false;
    for (i = 0; i < list.length; i++) {
      var x = list[i], best = 0, a: number, b: number;
      for (a = 0; a < hard[x].length; a++) best = Math.max(best, depth[hard[x][a]]);
      for (a = 0; a < soft[x].length; a++) {
        var low = Infinity;
        for (b = 0; b < soft[x][a].length; b++) low = Math.min(low, depth[soft[x][a][b]]);
        if (low < Infinity) best = Math.max(best, low);
      }
      var tall = 0, nexts = after[x] || [];
      for (a = 0; a < nexts.length; a++) tall = Math.max(tall, height[nexts[a]]);
      if (best + 1 > depth[x] && best + 1 <= cap) { depth[x] = best + 1; changed = true; }
      if (tall + 1 > height[x] && tall + 1 <= cap) { height[x] = tall + 1; changed = true; }
    }
  }
  var longest = 0, chain: Record<number, number> = {};
  for (i = 0; i < list.length; i++) if (depth[list[i]] >= cap || height[list[i]] >= cap) return empty;
  for (i = 0; i < list.length; i++) { chain[list[i]] = depth[list[i]] + height[list[i]] - 1; longest = Math.max(longest, chain[list[i]]); }
  var terms = Math.max(empty.terms, longest), ids: number[] = [];
  for (i = 0; i < list.length; i++) if (chain[list[i]] >= 2 && chain[list[i]] >= terms) ids.push(list[i]);
  ids.sort(function (x, y) { return x - y; });
  return { ids: ids, terms: terms, longest: longest };
}

/** للصفحة: الدالةُ نفسُها نصّاً (كـ ARABIC_COUNT_SCRIPT). */
export const CRITICAL_COURSES_SCRIPT = `var criticalCourses=(${criticalCourses.toString()});`;
