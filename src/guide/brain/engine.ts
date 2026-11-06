/**
 * ── عقل المرشد ──
 *
 * يعمل كله داخل المتصفح بلا أي طلب شبكي ولا تكلفة تشغيل. يبني فهرساً من بنك
 * المعرفة (عناوين وأسئلة مصاغة بالفصحى والكويتية والإنجليزية)، ثم يرتب بالوزن:
 * كلمة نادرة أثقل من كلمة شائعة، وتطابق المفهوم أثقل من التصحيح الإملائي،
 * والشاشة الحالية تُرجّح عند التقارب فقط.
 *
 * الصلاحيات ليست هنا: يصله من الخارج ما يجوز عرضه فقط (canAccessGuideFeature)،
 * فلا يمكن أن يظهر لدور ما لا يصل إليه ولو كان أقرب جواب.
 */
import { normalizeText, stem, tokenize, editDistance } from "./normalize";
import { CONCEPT_OF, INTENT_WORDS, LIVE_ROUTES, OFF_TOPIC, PHRASES, STOPWORDS } from "./lexicon";

export type BankDoc = { id: string; title: string; ask: string[]; view?: string };
type Term = { key: string; weight: number };
type Doc = { id: string; view?: string; title: Set<string>; phrases: Array<{ text: string; terms: Set<string> }>; terms: Set<string> };
export type GuideIndex = { docs: Doc[]; df: Map<string, number>; vocabulary: string[]; total: number };

export type RankContext = { view?: string; recentFeatureIds?: string[]; boostFeatureIds?: string[] };
export type Hit = { id: string; score: number; confidence: number };
export type Understood =
  | { kind: "answer"; id: string; confidence: number; query: string }
  | { kind: "live"; ids: string[]; query: string }
  | { kind: "unsure"; closest: string[]; query: string };

const prepare = (value: string) => {
  let text = normalizeText(value);
  for (const [pattern, word] of PHRASES) text = text.replace(pattern, word);
  return text;
};

function termKey(token: string): string {
  const direct = CONCEPT_OF.get(token);
  if (direct) return direct;
  const stemmed = stem(token);
  return CONCEPT_OF.get(stemmed) || stemmed;
}

function termsOf(text: string): string[] {
  const out: string[] = [];
  const tokens = tokenize(prepare(text));
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    // «مو الوقت»: المنفي ليس المطلوب، فلا يُحتسب.
    if ((token === "مو" || token === "مب" || token === "مش" || token === "not") && tokens[i + 1]) { i += 1; continue; }
    if (STOPWORDS.has(token) || INTENT_WORDS[token]) continue;
    if (token.length < 2) continue;
    out.push(termKey(token));
  }
  return out;
}

export function buildIndex(docs: BankDoc[]): GuideIndex {
  const df = new Map<string, number>();
  const built: Doc[] = docs.map(doc => {
    const title = new Set(termsOf(doc.title));
    const phrases = doc.ask.map(text => ({ text: prepare(text), terms: new Set(termsOf(text)) }));
    const terms = new Set<string>([...title, ...phrases.flatMap(p => [...p.terms])]);
    terms.forEach(term => df.set(term, (df.get(term) || 0) + 1));
    return { id: doc.id, view: doc.view, title, phrases, terms };
  });
  return { docs: built, df, vocabulary: [...df.keys()], total: built.length };
}

/** يصحح كلمة خارج المفردات إلى أقرب كلمة منها، بسماحٍ يتناسب مع طولها. */
function correct(index: GuideIndex, term: string): string | null {
  if (index.df.has(term)) return term;
  if (term.length < 5) return null;
  const limit = term.length >= 8 ? 2 : 1;
  let best: string | null = null, bestDistance = limit + 1, bestDf = 0;
  for (const word of index.vocabulary) {
    if (Math.abs(word.length - term.length) > limit || word[0] !== term[0] && limit === 1) continue;
    const distance = editDistance(term, word, limit);
    const df = index.df.get(word) || 0;
    if (distance < bestDistance || (distance === bestDistance && df > bestDf)) { best = word; bestDistance = distance; bestDf = df; }
  }
  return bestDistance <= limit ? best : null;
}

function queryTerms(index: GuideIndex, query: string): Term[] {
  const seen = new Set<string>();
  const out: Term[] = [];
  for (const raw of termsOf(query)) {
    let key = correct(index, raw);
    let penalty = 1;
    if (!key) {
      // كلمات مُصححة تُعاد إلى مفهومها: «تعارظ» ← «تعارض».
      const concept = [...CONCEPT_OF.keys()].find(word => word.length >= 4 && raw.length >= 4 && editDistance(raw, word, 1) <= 1);
      key = concept ? CONCEPT_OF.get(concept)! : null;
      penalty = .85;
    } else if (key !== raw) penalty = .85;
    if (!key || seen.has(key) || !index.df.has(key)) { if (!key) out.push({ key: raw, weight: 0 }); continue; }
    seen.add(key);
    const df = index.df.get(key) || 1;
    out.push({ key, weight: penalty * (1 + Math.log((index.total + 1) / df)) });
  }
  return out;
}

export function rank(index: GuideIndex, query: string, allowed: Set<string> | null, ctx: RankContext = {}): Hit[] {
  const terms = queryTerms(index, query);
  const totalWeight = terms.reduce((sum, term) => sum + (term.weight || 1.4), 0);
  if (!totalWeight) return [];
  const text = prepare(query);
  const hits: Hit[] = [];
  for (const doc of index.docs) {
    if (allowed && !allowed.has(doc.id)) continue;
    let bestPhrase = 0;
    for (const phrase of doc.phrases) {
      if (phrase.text === text) { bestPhrase = 1.2; break; }
      if (!phrase.terms.size) continue;
      let shared = 0, phraseWeight = 0;
      phrase.terms.forEach(key => {
        const weight = 1 + Math.log((index.total + 1) / (index.df.get(key) || 1));
        phraseWeight += weight;
        if (terms.some(term => term.key === key)) shared += weight;
      });
      const queryShared = terms.reduce((sum, term) => sum + (phrase.terms.has(term.key) ? (term.weight || 0) : 0), 0);
      const dice = (2 * Math.min(shared, queryShared + .001)) / (phraseWeight + totalWeight);
      if (dice > bestPhrase) bestPhrase = dice;
    }
    let bag = 0, titleHit = 0;
    for (const term of terms) {
      if (doc.terms.has(term.key)) bag += term.weight;
      if (doc.title.has(term.key)) titleHit += term.weight;
    }
    const coverage = bag / totalWeight;
    let score = bestPhrase * .62 + coverage * .3 + (titleHit / totalWeight) * .12;
    if (!score) continue;
    if (ctx.view && doc.view === ctx.view) score += .025;
    if (ctx.boostFeatureIds?.includes(doc.id)) score += .05;
    if (ctx.recentFeatureIds?.includes(doc.id)) score += .012;
    hits.push({ id: doc.id, score, confidence: Math.min(1, score) });
  }
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** يقسم السؤال المركب إلى أجزاء، ويترك «و» الملتصقة بالاسم في مكانها. */
export function splitQuestion(query: string): string[] {
  const clean = String(query || "").trim();
  const parts = clean
    .split(/[؟?!\n؛;]+|(?:\s+(?:وبعدين|وبعدها|وكمان|وأيضاً|وأيضا|وايضا|ثم|وبعد كذا|and also|and then|then)\s+)|(?:\s+و(?=(?:شلون|كيف|وين|أين|اين|ليش|لماذا|شنو|ماذا|متى|هل|ابي|أبي|أريد|اريد|طريقة|كمان)\s*))|(?:\s+و(?=[اأإ](?!ل)\S{2,}))|(?:\s+and\s+(?=how|where|why|what|can|see|check|view|print|export|add|send)\b)/i)
    .map(part => part.trim())
    .filter(part => termsOf(part).length > 0);
  // جزء من كلمة واحدة بلا فعل تكملةٌ لما قبله، لا سؤال مستقل: «الأساتذة والأقسام».
  const merged: string[] = [];
  for (const part of parts) {
    if (merged.length && tokenize(prepare(part)).length < 2) merged[merged.length - 1] += ` ${part}`;
    else merged.push(part);
  }
  return merged.length ? merged.slice(0, 3) : [clean];
}

export const CONFIDENCE_THRESHOLD = .34;
const LIVE_HINT = /الان|الحين|اليوم|هاليوم|now|today/;

export function isLiveQuestion(query: string): string[] | null {
  const text = prepare(query);
  if (/استعلام/.test(text)) return null;
  if (/شلون|كيف|طريقه|how do|how can|how to|وين اقدر|اين اجد/.test(text) && !LIVE_HINT.test(text)) return null;
  for (const route of LIVE_ROUTES) if (route.pattern.test(text)) return route.featureIds;
  return null;
}

export function understand(index: GuideIndex, query: string, allowed: Set<string> | null, ctx: RankContext = {}): Understood[] {
  return splitQuestion(query).map(part => {
    const live = isLiveQuestion(part);
    if (live) return { kind: "live" as const, ids: live.filter(id => !allowed || allowed.has(id)).slice(0, 1), query: part };
    if (OFF_TOPIC.test(prepare(part))) return { kind: "unsure" as const, closest: [], query: part };
    const hits = rank(index, part, allowed, ctx);
    const top = hits[0];
    if (top && top.confidence >= CONFIDENCE_THRESHOLD) return { kind: "answer" as const, id: top.id, confidence: top.confidence, query: part };
    return { kind: "unsure" as const, closest: hits.filter(hit => hit.score > .08).slice(0, 3).map(hit => hit.id), query: part };
  });
}

/** يبقي من السؤال كلمات البرنامج والأدوات فقط؛ كل كلمة أخرى قد تكون اسماً فتُطمس. */
export function maskUnknownWords(index: GuideIndex, text: string): string {
  return tokenize(prepare(text)).map(token => {
    if (STOPWORDS.has(token) || INTENT_WORDS[token]) return token;
    const key = termKey(token);
    return index.df.has(key) ? token : "…";
  }).join(" ").replace(/(?:… ?){2,}/g, "… ").trim().slice(0, 100);
}
