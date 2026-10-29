/**
 * ── المقترحُ الدراسي كما يصل الأستاذ: بلا قاعةٍ ولا مبنى ───────────────────
 *
 * قرارُ المالك (2026-10-29): الأستاذ لا يرى أيَّ معلومةٍ عن القاعة أو المبنى —
 * لا اسماً ولا رمزاً ولا «القاعة لم تُحدد» ولا «المكان». صفحةُ المقترح
 * (/r/:token/proposal/:pid) كانت تقرأ من ردّ الخادم `place` و`placeKnown` و`src`
 * (وفيه رمزُ المبنى ورقمُ القاعة). فتُنزع هذه المفاتيح من كل ما يُرسَل إلى
 * الأستاذ نزعاً عامّاً في أيّ عمق، لا حقلاً حقلاً يُنسى منه واحد.
 *
 * شاشةُ القسم لا تمرّ من هنا: هي تبني من `staffView` وتعرض القاعة كما هي.
 */
const PLACE_KEYS = new Set([
  "place", "placeKnown", "src",
  "roomCode", "roomHall", "roomId", "buildingId", "locationStatus",
  "AdRoomCode", "AdRoomHall",
]);

export function withoutProposalPlaces<T>(view: T): T {
  if (Array.isArray(view)) return view.map(entry => withoutProposalPlaces(entry)) as unknown as T;
  if (!view || typeof view !== "object") return view;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(view as Record<string, unknown>)) {
    if (PLACE_KEYS.has(key)) continue;
    out[key] = withoutProposalPlaces(value);
  }
  return out as T;
}
