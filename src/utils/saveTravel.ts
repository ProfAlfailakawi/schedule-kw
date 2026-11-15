/**
 * الحركة الثانية في المحرّر (والأخيرة): عند نجاح الحفظ تنتقل بطاقةٌ صغيرة من النموذج إلى مكانها في أسبوع الأستاذ،
 * وفي الأثناء يظهر نموذج «الشعبة التالية». DOM خالص بلا حالة React، ويُعطَّل مع تقليل الحركة أو غياب الأسبوع.
 */
export function travelSavedCard(label: string, doc: Document = document): boolean {
  try {
    const win = doc.defaultView;
    if (!win || win.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    const from = doc.querySelector<HTMLElement>(".schedule-editor .appt-form");
    const to = doc.querySelector<HTMLElement>("[data-mini-week='true']");
    if (!from || !to) return false;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    if (!a.width || !b.width) return false;
    const card = doc.createElement("div");
    card.className = "appt-travel";
    card.setAttribute("aria-hidden", "true");
    card.textContent = label;
    const startX = a.left + a.width / 2, startY = Math.min(Math.max(a.top + 80, 80), win.innerHeight - 80);
    card.style.cssText = `left:${startX}px;top:${startY}px`;
    doc.body.appendChild(card);
    const dx = b.left + b.width / 2 - startX, dy = b.top + Math.min(b.height / 2, 260) - startY;
    card.animate?.([
      { transform: "translate(-50%,-50%) scale(1)", opacity: 0.98 },
      { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.55)`, opacity: 0.2 },
    ], { duration: 620, easing: "cubic-bezier(.3,.7,.2,1)", fill: "forwards" });
    win.setTimeout(() => card.remove(), 680);
    return true;
  } catch { return false; }
}
