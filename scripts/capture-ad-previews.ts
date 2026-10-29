/**
 * ── لقطاتُ الشاشات الحقيقية لمعاينة مواضع الإعلانات ─────────────────────────────────
 *
 * أداةُ تطويرٍ تُشغَّل يدوياً حين يتغيّر شكلُ إحدى الصفحات الأربع، لا في البناء:
 *
 *   DATA_MODE=demo PORT=3101 npx tsx server.ts          # خادمٌ تجريبي
 *   PLAYWRIGHT_MODULE=/path/to/playwright npx tsx scripts/capture-ad-previews.ts http://localhost:3101
 *
 * تفتح الصفحاتِ الحقيقية في البيئة التجريبية («مساري» و«تذكرتي» وجدول القسم العام ولوحة الكادر)، وتُركّب في موضع كل إعلانٍ
 * فراغاً بمقاسه الحقيقي وبأصناف الإعلان نفسها (نصُّ `adClientScript` الفعلي يحقن أنماطه)، ثم تلتقط الصفحة وتسجّل إحداثيات كل موقع
 * في `public/ad-previews/manifest.json`. شاشة الإدارة تضع إعلان الشركة التجريبي فوق هذه الإحداثيات تماماً.
 * لا بياناتٍ حقيقية: كلُّها من الصندوق التجريبي.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { AD_CLIENT_SCRIPT } from "../src/server/adClientScript";
import { AD_SLOTS } from "../src/utils/adsEngine";

const base = (process.argv[2] || "http://localhost:3101").replace(/\/$/, "");
const out = path.resolve("public/ad-previews");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

interface Rect { x: number; y: number; w: number; h: number }
interface Surface { image: string; width: number; height: number; title: string; slots: Record<string, Rect> }
const manifest: { generatedAt: string; surfaces: Record<string, Surface> } = { generatedAt: new Date().toISOString(), surfaces: {} };

const specOf = (id: string) => AD_SLOTS.find(s => s.id === id)!;
const INTRO: Record<string, string> = {
  break: "لديك فراغٌ يوم الإثنين من 10:00 ص إلى 12:00 م. استراحتك برعاية:",
  nearby: "بين محاضرتيك يوم الأحد أنت في المبنى نفسه. استراحتك القريبة برعاية:",
  afterclass: "تنتهي محاضراتك يوم الثلاثاء عند 12:00 م. وقتك بعدها برعاية:",
  course: "مقرراتك هذا الفصل برعاية:",
};

/** يُركّب في الصفحة فراغاتِ الإعلان بمقاساتها وأصنافها الحقيقية، ويعيد إحداثيات كل فراغ بالنسبة إلى أعلى الصفحة. */
const PLACE = `(plan) => {
  const mk = (box, p) => {
    box.className = "adx on" + (p.intro ? " brk" : "");
    box.textContent = "";
    if (p.intro) { const i = document.createElement("p"); i.className = "adx-intro"; i.textContent = p.intro; box.appendChild(i); }
    const part = (cls, id, w, h, tag) => { const d = document.createElement("div"); d.className = cls; const s = document.createElement("div"); s.className = "adx-stage"; s.style.aspectRatio = w + " / " + h; s.dataset.adPreview = id; d.appendChild(s); const t = document.createElement("span"); t.className = "adx-tag"; t.textContent = tag; d.appendChild(t); return d; };
    if (p.sponsor) { const sp = part("adx-sp", "sponsor", 640, 80, "برعاية"); box.appendChild(sp); }
    box.appendChild(part("adx-main", p.id, p.w, p.h, "إعلان"));
    const n = document.createElement("p"); n.className = "adx-note"; n.textContent = "نقيس عدد المشاهدات والنقرات دون تتبّع هويتك. كيف نقيس؟"; box.appendChild(n);
  };
  for (const p of plan) {
    let host = p.host ? document.querySelector(p.host) : null;
    if (!host) { host = document.createElement("aside"); const where = p.into ? document.querySelector(p.into) : document.body; (where || document.body).appendChild(host); }
    mk(host, p);
  }
  const rects = {};
  for (const el of document.querySelectorAll("[data-ad-preview]")) { const r = el.getBoundingClientRect(); const key = el.dataset.adPreview; if (!rects[key]) rects[key] = { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; }
  return rects;
}`;

async function shoot(page: any, key: string, title: string, plan: unknown[], opts: { width: number; maxHeight: number; clipFrom?: string; tail?: boolean; ext?: "jpeg" }) {
  await page.addScriptTag({ content: AD_CLIENT_SCRIPT });      // يحقن أنماطَ الإعلان وحدها (بلا pulse ولا data-slot)
  const rects: Record<string, Rect> = await page.evaluate(`(${PLACE})(${JSON.stringify(plan)})`);
  await page.waitForTimeout(400);
  const full = await page.evaluate(() => ({ h: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) }));
  const bottoms = Object.values(rects).map(r => r.y + r.h);
  const lastAd = Math.max(...bottoms) + 90;       // أسفل آخر فراغٍ إعلاني وبعده هامشٌ قصير
  let top = 0;
  if (opts.clipFrom) top = Math.max(0, await page.evaluate((sel: string) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().y + scrollY - 24 : 0; }, opts.clipFrom));
  /* صفحةٌ أطول من الحدّ (جدول القسم) يُؤخذ ذيلُها الذي فيه الإعلان: الإعلان يقع في أسفل الصفحة دائماً. */
  if (opts.tail) top = Math.max(0, Math.min(full.h, lastAd) - opts.maxHeight);
  const height = Math.min(opts.maxHeight, Math.max(240, Math.min(full.h, lastAd) - top));
  const file = `${key}.jpg`;
  await page.screenshot({ path: path.join(out, file), type: "jpeg", quality: 82, clip: { x: 0, y: top, width: opts.width, height }, fullPage: true });
  const slots: Record<string, Rect> = {};
  for (const [id, r] of Object.entries(rects)) slots[id] = { x: Math.round(r.x), y: Math.round(r.y - top), w: Math.round(r.w), h: Math.round(r.h) };
  manifest.surfaces[key] = { image: `/ad-previews/${file}`, width: opts.width, height: Math.round(height), title, slots };
  console.log(`✓ ${key}: ${opts.width}×${Math.round(height)} · ${Object.keys(slots).join(", ")}`);
}

/** يُسكّن الصفحة قبل اللقطة: بلا حركةٍ ولا ظهورٍ تدريجي، والشريط السفلي الثابت (يعلو الشاشة) مخفي. */
async function calm(page: any) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}.fade{opacity:1!important;transform:none!important}.tabs,nav.tabs{display:none!important}" });
  await page.waitForTimeout(500);
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium" });

  /* ١. «مساري» (جوال): الصفحة الرئيسية، ثم «تذكرتي» بلحظاتها الأربع. */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ar-KW", bypassCSP: true });
    await ctx.route(/\/_ads\/|\/_pulse/, route => route.abort());   // لا إعلانَ حقيقياً ولا نبضَ: اللقطة بفراغاتٍ نظيفة
    const page = await ctx.newPage();
    await page.goto(`${base}/me/demo`, { waitUntil: "networkidle" }); await page.waitForTimeout(2500);
    await calm(page);
    await shoot(page, "me", "«مساري» · الرئيسية", [{ host: "#adx-me-box", id: "me", w: specOf("me").width, h: specOf("me").height, sponsor: true }], { width: 390, maxHeight: 4200, ext: "jpeg" });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ar-KW", bypassCSP: true });
    await ctx.route(/\/_ads\/|\/_pulse/, route => route.abort());   // لا إعلانَ حقيقياً ولا نبضَ: اللقطة بفراغاتٍ نظيفة
    const page = await ctx.newPage();
    await page.goto(`${base}/me/demo`, { waitUntil: "networkidle" }); await page.waitForTimeout(2500);
    await calm(page);
    await page.evaluate(`(() => { const d = document.getElementById("later"); if (d) d.open = true; })()`);
    await page.waitForTimeout(1500);
    const plan = ["break", "nearby", "afterclass", "course"].map(id => ({ into: "#ticket section.tk", id, w: specOf(id).width, h: specOf(id).height, intro: INTRO[id] }));
    await shoot(page, "ticket", "«تذكرتي» داخل «مساري»", plan, { width: 390, maxHeight: 4200, clipFrom: "#ticket", ext: "jpeg" });
    await ctx.close();
  }

  /* ٢. جدول القسم العام (رابطٌ حقيقي من الصندوق التجريبي) ولوحة الكادر. */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1900 }, locale: "ar-KW", bypassCSP: true });
    await ctx.route(/\/_ads\/|\/_pulse/, route => route.abort());   // لا إعلانَ حقيقياً ولا نبضَ: اللقطة بفراغاتٍ نظيفة
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: "networkidle" });
    await page.evaluate(`fetch("/api/auth/demo", { method: "POST" })`);
    await page.waitForTimeout(8000);
    const token: string = await page.evaluate(`fetch("/api/share?collegeId=1&sectionId=1&termId=1").then(r => r.json()).then(list => (list.find(l => l.kind === "department") || {}).id || "")`);
    if (token) {
      const pub = await ctx.newPage();
      await pub.goto(`${base}/s/${encodeURIComponent(token)}`, { waitUntil: "networkidle" }); await pub.waitForTimeout(2000);
      await shoot(pub, "schedule", "الجدول العام", [{ id: "schedule", w: specOf("schedule").width, h: specOf("schedule").height, sponsor: true }], { width: 1280, maxHeight: 1100, tail: true, ext: "jpeg" });
      await pub.close();
    } else console.log("✗ لا رابط جدول للقسم في الصندوق التجريبي");

    await page.goto(`${base}/`, { waitUntil: "networkidle" }); await page.waitForTimeout(2500);
    await page.keyboard.press("Escape"); await page.waitForTimeout(800);       // يُغلق جولة التعريف
    await shoot(page, "staff", "لوحة الأساتذة والإداريين", [{ into: ".content-frame", id: "dashboard", w: specOf("dashboard").width, h: specOf("dashboard").height, sponsor: true }], { width: 1280, maxHeight: 2600, ext: "jpeg" });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`→ ${path.join(out, "manifest.json")}`);
}

main().catch(error => { console.error(error); process.exit(1); });
