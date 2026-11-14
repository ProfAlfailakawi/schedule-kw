/**
 * ?duo-debug=1 — تشخيص ركن الودجت على الجهاز (للمالك).
 *
 * يُحمَّل ديناميكياً من main.tsx ولا يُحمَّل بلا المعامل. يرسم إطار الركن المحجوز (حدودٌ حمراء شفافة، بلا التقاط
 * لمس) ولوحةً صغيرة بيسار الشاشة وأسفلها (خارج الركن) فيها: قيم safe-area، وأبعاد النافذة وvisualViewport، واتجاه
 * الصفحة، وهل التطبيق مثبَّت (standalone)، وهل يعمل داخل Capacitor، وهل الركن نشطٌ وقيم المتغيّرات.
 * لا يكتب ولا يرسل شيئاً: يقرأ ويرسم. الفحصُ على الجهاز: افتح الرابط وتأكّد أن الإطار الأحمر لا يغطّي شيئاً، وأرسل لقطة.
 */
const NOMINAL_W = 96;
const nominalH = () => Math.min(270, Math.max(64, window.innerHeight * 0.31));

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function safeAreaProbe() {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:0;height:0;"
    + "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const out = { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
  probe.remove();
  return out;
}

/** معايرة حيّة على الجهاز: ?duo-debug=1&duo-w=110&duo-h=270 تبدّل المتغيّرين على الجذر (بوجود duo-debug=1 وحده). */
function applyCalibration() {
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const [param, prop] of [["duo-w", "--duo-widget-w"], ["duo-h", "--duo-widget-h"]] as const) {
    const n = Number(q.get(param));
    if (q.has(param) && Number.isFinite(n) && n >= 0 && n <= 600) { document.documentElement.style.setProperty(prop, `${n}px`); out[param] = `${n}px`; }
  }
  return out;
}

export function mountDuoDebug() {
  if (document.querySelector("[data-duo-debug]")) return;
  const calibrated = applyCalibration();
  const frame = document.createElement("div");
  frame.setAttribute("data-duo-debug", "frame");
  frame.setAttribute("aria-hidden", "true");
  const panel = document.createElement("pre");
  panel.setAttribute("data-duo-debug", "panel");
  panel.setAttribute("dir", "ltr");
  document.body.append(frame, panel);

  const render = () => {
    const root = getComputedStyle(document.documentElement);
    const w = px(root.getPropertyValue("--duo-widget-w"));
    const gap = px(root.getPropertyValue("--duo-widget-gap"));
    const hRaw = root.getPropertyValue("--duo-widget-h").trim();
    const active = w > 0;
    const vv = window.visualViewport;
    const sa = safeAreaProbe();
    const cap = (window as any).Capacitor;
    let native: string;
    try { native = String(Boolean(cap?.isNativePlatform?.())); } catch { native = "error"; }
    let platform = "";
    try { platform = String(cap?.getPlatform?.() || cap?.platform || ""); } catch { platform = "error"; }
    const ua = navigator.userAgent;
    const standalone = (navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    /* نشطٌ: الإطار هو المتغيّران نفسهما (فيرى المالك ما تحجزه الصفحة فعلاً)؛ وإلا فالمقاس الاسمي بلونٍ باهت. */
    const frameW = active ? w : NOMINAL_W;
    const frameH = active ? frame.getBoundingClientRect().height || nominalH() : nominalH();
    frame.style.cssText = `position:fixed;top:0;right:0;width:${active ? "var(--duo-widget-w)" : NOMINAL_W + "px"};height:${active ? "var(--duo-widget-h)" : nominalH() + "px"};box-sizing:border-box;`
      + `border:2px solid rgba(220,38,38,${active ? ".9" : ".35"});background:rgba(220,38,38,${active ? ".12" : ".04"});`
      + "pointer-events:none;z-index:2147483646";
    panel.style.cssText = "position:fixed;left:8px;bottom:8px;margin:0;max-width:calc(100vw - 96px);padding:8px 10px;"
      + "font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;background:rgba(17,24,39,.88);"
      + "border-radius:10px;white-space:pre-wrap;pointer-events:none;z-index:2147483647";
    const measuredH = frame.getBoundingClientRect().height;
    panel.textContent = [
      `duo-widget: ${active ? "ACTIVE" : "inactive (this size is not Duo)"}`,
      `--duo-widget-w=${w}px gap=${gap}px h=${hRaw || "0px"}`,
      `frame: ${Math.round(frameW)} x ${Math.round(measuredH || frameH)} px, physical top-right`,
      `safe-area t/r/b/l: ${sa.top} / ${sa.right} / ${sa.bottom} / ${sa.left}`,
      `inner: ${window.innerWidth} x ${window.innerHeight}`,
      `visualViewport: ${vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)} @ ${vv.scale.toFixed(2)}x` : "n/a"}`,
      `dir: ${document.documentElement.dir || document.dir || "ltr"}  orient: ${window.matchMedia("(orientation:portrait)").matches ? "portrait" : "landscape"}`,
      `calibration: ${Object.keys(calibrated).length ? JSON.stringify(calibrated) : "none (add &duo-w=110&duo-h=270)"}`,
      "send a screenshot with the frame; adjust duo-w/duo-h until the red frame covers the capsule",
      `standalone: ${standalone}  navigator.standalone: ${String((navigator as any).standalone)}`,
      `Capacitor: ${native === "true" ? `native ${platform || "?"}` : cap ? `present, native=${native}` : "absent (Safari tab)"}`,
      `UA: ${/Safari\//.test(ua) ? "has Safari/ (browser)" : "no Safari/ (WKWebView app)"}  ${/iPhone|iPad/.test(ua) ? "iOS" : "other"}`,
    ].join("\n");
  };
  render();
  window.addEventListener("resize", render);
  window.visualViewport?.addEventListener("resize", render);
  window.addEventListener("orientationchange", render);
}
