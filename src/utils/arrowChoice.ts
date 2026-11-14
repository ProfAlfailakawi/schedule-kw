/**
 * ── الأسهم داخل مجموعة اختيار (tablist / radiogroup) ─────────────────────────
 *
 * مجموعةٌ معلنةٌ «tablist» أو «radiogroup» يتوقّع قارئُ الشاشة أن تتنقّل بين
 * عناصرها بالأسهم، لا بـTab وحده. يُركَّب على الحاوية (onKeyDown): السهم ينقل
 * التركيز إلى الجار ويختاره، وHome/End إلى الطرفين. في الاتجاه من اليمين لليسار
 * يكون السهم الأيسر هو «التالي»، كما يُقرأ السطر.
 */
export function arrowChoice(event: { key: string; currentTarget: HTMLElement; target: EventTarget | null; preventDefault: () => void }): void {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"],[role="radio"]'))
    .filter(item => !(item as HTMLButtonElement).disabled);
  if (!items.length) return;
  const index = Math.max(0, items.indexOf(event.target as HTMLElement));
  const rtl = typeof getComputedStyle === "function" && getComputedStyle(event.currentTarget).direction === "rtl";
  const step = event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight") ? 1
    : event.key === "ArrowUp" || event.key === (rtl ? "ArrowRight" : "ArrowLeft") ? -1 : 0;
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + step + items.length) % items.length;
  event.preventDefault();
  items[next].focus();
  items[next].click();
}
