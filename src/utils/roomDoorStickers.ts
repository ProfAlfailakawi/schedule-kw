/**
 * ── ملصقاتُ الأبواب: ورقةُ طباعةٍ A4، أربعةُ ملصقاتٍ في الصفحة ───────────────
 *
 * لكل قاعةٍ ملصقٌ بحجم A6 (ربعُ A4) يُقصّ على الخطّ المنقّط: رمزُ القاعة كبيراً،
 * والمبنى، ورمزُ QR، و«امسح لتعرف القاعة الآن». والرابطُ مكتوبٌ صغيراً تحته لمن
 * لا يمسح. رمزُ QR يُرسم في المتصفّح بالمولّد المحلّي (utils/qrcodeGenerator) ويصل
 * هنا نصَّ SVG جاهزاً — لا خدمةَ خارجية، ولا شيءَ يُرسل من الورقة.
 *
 * دالّةٌ نقيّة تعيد مستنداً كاملاً يُكتب في نافذة الطباعة.
 */
import { AR, countOf } from "./arabicCount";

export interface DoorStickerRoom {
  code: string;
  floor?: string;
  /** الرابطُ الكامل الذي يحمله رمزُ QR. */
  url: string;
  /** رمزُ QR نصَّ SVG من المولّد المحلّي. */
  qrSvg: string;
}

export interface DoorStickerBuilding { code: string; number: string; name: string; site: string }

const esc = (value: unknown): string =>
  String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** SVG من المولّد كما هو، بعد التأكّد أنه SVG لا غير (لا سكربت ولا وسمٌ آخر). */
const safeSvg = (svg: string): string => {
  const text = String(svg || "").trim();
  return /^<svg[\s>]/i.test(text) && !/<script|on\w+\s*=|<foreignObject|javascript:/i.test(text) ? text : "";
};

/** طولُ الرمز يحدّد حجمه: «F01» يملأ السطر، و«G55B» أصغر قليلاً. */
const codeSize = (code: string): number => (code.length <= 3 ? 30 : code.length === 4 ? 25 : code.length <= 6 ? 19 : 14);

export const DOOR_STICKERS_PER_PAGE = 4;

export function roomDoorStickerSheet(input: { building: DoorStickerBuilding; rooms: DoorStickerRoom[]; origin: string; fontBase?: string }): string {
  const base = String(input.fontBase ?? input.origin).replace(/\/$/, "");
  const fonts = ["400", "600", "700"].map(weight =>
    `@font-face{font-family:"Plex Arabic";font-weight:${weight};font-display:block;src:url("${esc(base)}/fonts/plex-arabic-arabic-${weight}.woff2") format("woff2")}`
    + `@font-face{font-family:"Plex Arabic";font-weight:${weight};font-display:block;unicode-range:U+0000-00FF,U+2000-206F;src:url("${esc(base)}/fonts/plex-arabic-latin-${weight}.woff2") format("woff2")}`).join("");
  const b = input.building;
  const buildingLine = b.number ? `مبنى ${esc(b.number)}` : esc(b.code);
  const host = (url: string) => url.replace(/^https?:\/\//, "");
  const sticker = (room: DoorStickerRoom) => `<article class="sticker">
<header><span class="brand">SCHEDULE</span><span class="bld">${buildingLine} · <bdi>${esc(b.code)}</bdi></span></header>
<div class="room"><small>القاعة</small><b style="font-size:${codeSize(room.code)}mm"><bdi>${esc(room.code)}</bdi></b>${room.floor ? `<em>${esc(room.floor)}</em>` : ""}</div>
<div class="qr">${safeSvg(room.qrSvg)}</div>
<p class="scan">📱 امسح لتعرف القاعة الآن</p>
<p class="hint">فاضية أم مشغولة · والتالية · والأسبوع</p>
<p class="url"><bdi>${esc(host(room.url))}</bdi></p>
</article>`;
  const pages: string[] = [];
  for (let i = 0; i < input.rooms.length; i += DOOR_STICKERS_PER_PAGE) {
    const chunk = input.rooms.slice(i, i + DOOR_STICKERS_PER_PAGE);
    const cells = [...chunk.map(room => `<div class="cell">${sticker(room)}</div>`), ...Array.from({ length: DOOR_STICKERS_PER_PAGE - chunk.length }, () => `<div class="cell blank"></div>`)];
    pages.push(`<section class="sheet">${cells.join("")}</section>`);
  }
  const title = `ملصقات الأبواب · ${b.number ? `مبنى ${b.number}` : b.code}`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${fonts}
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#e9ece8;color:#131817;font-family:"Plex Arabic",-apple-system,"Segoe UI",Tahoma,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;background:#131817;color:#fff;font-size:14px}
.bar b{font-size:15px}.bar span{opacity:.8}
.bar button{font:inherit;font-weight:700;min-height:42px;padding:0 18px;border-radius:999px;border:0;background:#c79b5f;color:#1b1406;cursor:pointer}
.sheets{display:grid;justify-content:center;gap:10mm;padding:10mm 0}
.sheet{width:210mm;height:297mm;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;background:#fff;box-shadow:0 10px 40px -18px rgba(0,0,0,.45);break-after:page;page-break-after:always;overflow:hidden}
.cell{position:relative;padding:6mm;display:flex}
.cell:nth-child(odd){border-left:.3mm dashed #b7c0bb}
.cell:nth-child(-n+2){border-bottom:.3mm dashed #b7c0bb}
.sticker{flex:1;display:flex;flex-direction:column;align-items:center;border:.7mm solid #1f6b5c;border-radius:6mm;overflow:hidden;background:#fff;text-align:center}
.sticker header{align-self:stretch;display:flex;align-items:center;justify-content:space-between;gap:3mm;padding:3mm 4.5mm;background:linear-gradient(160deg,#1f6b5c,#134a3f);color:#fff}
.brand{font:600 2.6mm/1 ui-monospace,Menlo,monospace;letter-spacing:.32em;color:#e7c590}
.bld{font-size:3.5mm;font-weight:700}
.room{display:grid;justify-items:center;margin-top:3mm;line-height:1}
.room small{font-size:3.4mm;color:#5b6660;font-weight:600}
.room b{font-weight:700;line-height:1.02;letter-spacing:.02em;color:#131817;margin-top:1mm}
.room em{font-style:normal;font-size:3.2mm;color:#5b6660;font-weight:600;margin-top:1.4mm}
.qr{width:56mm;height:56mm;margin-top:3mm;padding:2mm;border-radius:3mm;background:#fff;border:.35mm solid #e3e6e0}
.qr svg{display:block;width:100%;height:100%}
.scan{margin:3mm 0 0;font-size:4.6mm;font-weight:700;color:#1f6b5c}
.hint{margin:1mm 0 0;font-size:3mm;color:#5b6660}
.url{margin:auto 0 2.6mm;font-size:2.5mm;color:#8a948f;direction:ltr}
@media print{html,body{background:#fff}.bar{display:none}.sheets{display:block;padding:0}.sheet{box-shadow:none}}
</style></head><body>
<div class="bar"><span><b>${esc(title)}</b> · ${esc(countOf(input.rooms.length, AR.room))} · A4</span><button type="button" onclick="window.print()">🖨️ طباعة</button></div>
<main class="sheets">${pages.join("")}</main>
</body></html>`;
}
