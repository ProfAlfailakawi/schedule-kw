/**
 * لقطات «قبل/بعد» لركن الودجت (WebKit)، مع رسم إطار الركن المحجوز (70px × clamp(64,30vh,200)) فوق اللقطة.
 *   PLAYWRIGHT_MODULE=<مسار playwright> PLAYWRIGHT_BROWSERS_PATH=… \
 *   node docs/iphone-duo-widget-corner/shots.mjs <قبل|بعد> <DUO_BASE> [المجلد]
 * يحتاج خادماً تجريبياً قائماً (DATA_MODE=demo). الإطار يُرسم في اللقطة وحدها (حدودٌ حمراء)، لا في الموقع.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const [, , label, base, outDir = "docs/iphone-duo-widget-corner"] = process.argv;
if (!label || !base) { console.error("الاستعمال: shots.mjs <before|after> <base> [out]"); process.exit(2); }
const prefix = /after|بعد/.test(label) ? "after" : "before";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = [[382, 580], [669, 867], [951, 585]];
/* الرئيسية بعد الدخول لكل مقاس، والدخول (غير مسجَّل) والقائمة الجانبية على الطولي الصغير. */
const SCENES = [
  { id: "", route: "/Home/Index", authed: true },
  { id: "-login", route: "/", authed: false, only: ["382x580", "669x867"] },
  { id: "-sidebar", route: "/Home/Index", authed: true, only: ["382x580"], open: "button[aria-label='فتح القائمة']" },
];

const browser = await webkit.launch();
const seed = await browser.newContext();
const login = await seed.request.post(base + "/api/auth/demo", { data: {} });
const session = (String(login.headers()["set-cookie"] || "").match(/session_id=([^;]+)/) || [])[1];
for (let i = 0; i < 360; i++) { const s = await (await seed.request.get(base + "/api/demo/seed-status")).json().catch(() => ({})); if (s.status === "ready") break; await sleep(500); }
await seed.close();
fs.mkdirSync(outDir, { recursive: true });
for (const [w, h] of SIZES) {
  const key = `${w}x${h}`;
  for (const scene of SCENES) {
    if (scene.only && !scene.only.includes(key)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, userAgent: UA, locale: "ar-KW", reducedMotion: "reduce" });
    await ctx.addInitScript(() => { const read = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return String(k).startsWith("schedule-onboarding") ? "done" : read.call(this, k); }; });
    if (scene.authed) await ctx.addCookies([{ name: "session_id", value: session, url: base }]);
    const page = await ctx.newPage();
    await page.goto(base + scene.route, { waitUntil: "domcontentloaded", timeout: 90000 });
    await sleep(3000);
    if (scene.open) { await page.evaluate((sel) => [...document.querySelectorAll(sel)].find((b) => b.offsetParent)?.click(), scene.open); await sleep(1200); }
    await page.evaluate(([vw, vh]) => {
      const H = Math.min(200, Math.max(64, vh * 0.3));
      const d = document.createElement("div");
      d.style.cssText = `position:fixed;right:0;top:0;width:70px;height:${H}px;box-sizing:border-box;border:2px solid #e11d48;background:rgba(225,29,72,.12);z-index:2147483647;pointer-events:none`;
      document.body.appendChild(d);
    }, [w, h]);
    const file = path.join(outDir, `${prefix}${scene.id}-${key}.png`);
    await page.screenshot({ path: file });
    console.log("saved", file, fs.statSync(file).size);
    await ctx.close();
  }
}
await browser.close();
