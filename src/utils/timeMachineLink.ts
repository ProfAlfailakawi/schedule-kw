/**
 * ── روابط آلة الزمن من الشاشات الأخرى ──
 *
 * التنبؤ والتخطيط يريان المشكلة («هذا المقرر يحتاج شعبةً أخرى») ولا يملكان
 * حلّها؛ آلةُ الزمن تملك الحلول ولا ترى المشكلة حتى تُكتب لها. فالرابطُ جملةٌ
 * واحدة تُحمل في العنوان: تفتح الآلةُ عليها، فتُكتب في خانة الطوارئ وتُحلّ
 * فوراً، ثم تُمحى من العنوان فلا يعيد التحديثُ تشغيلها.
 *
 * والجملةُ نفسُها التي يكتبها المستخدم بيده — لا صيغةٌ خاصة — فقارئٌ واحدٌ
 * (parseProblem) يفهم الاثنين، ولا يفهم الرابطُ شيئاً لا تفهمه الخانة.
 */

/** مسار آلة الزمن في التطبيق (pathByView.timeMachine). */
export const TIME_MACHINE_PATH = "/FSchedule/TimeMachine";
const ASK = "ask";
const MAX_ASK = 200;

export function timeMachineHref(ask: string): string {
  return `${TIME_MACHINE_PATH}?${ASK}=${encodeURIComponent(String(ask || "").trim().slice(0, MAX_ASK))}`;
}

/** جملةُ «طلبٍ زائد» على مقرر برمزه: ما يكتبه المستخدم في خانة الطوارئ. */
export const demandAsk = (code: string) => `زاد الطلب على ${String(code || "").trim()}`;

/**
 * يفتح آلة الزمن على الجملة. يمرّ بالمسار الذي يقرؤه التطبيق عند الرجوع
 * والتقدّم (popstate)، فيبقى زرُّ الرجوع يعيد المستخدم إلى حيث كان.
 */
export function openInTimeMachine(ask: string): void {
  if (typeof window === "undefined" || !String(ask || "").trim()) return;
  window.history.pushState({}, "", timeMachineHref(ask));
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "auto" });
}

/** يقرأ الجملة من عنوانٍ ما، دون أن يمسّه. */
export function askFromSearch(search: string): string {
  return (new URLSearchParams(search || "").get(ASK) || "").trim().slice(0, MAX_ASK);
}

/** يقرأ الجملة من عنوان الصفحة ثم يمحوها منه: تُحلّ مرّةً واحدة. */
export function takeTimeMachineAsk(): string {
  if (typeof window === "undefined") return "";
  const ask = askFromSearch(window.location.search);
  const params = new URLSearchParams(window.location.search);
  if (params.has(ASK)) {
    params.delete(ASK);
    const rest = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`);
  }
  return ask;
}
