/**
 * ── حارس ركن الودجت (iPhone Duo) — Playwright WebKit ─────────────────────────
 *
 * على الدوو الحقيقي تطفو ودجتُ النظام (المصباح + الحساب/الموقع + الوقت + البطارية) فوق
 * الزاوية العلوية اليمنى الفيزيائية، وهي ليست من safe-area. هذا الحارس يقيس في متصفحٍ
 * حيٍّ أن لا شيءَ مهماً يقع تحتها.
 *
 * المنطقة (مستقلةٌ عن متغيّرات الصفحة، فلا يصدّق الحارسُ ما يُراد إثباته):
 *   x ≥ vw − 96   و   y ≤ clamp(64, 31% × vh, 270)    (فيزيائياً: يمين الشاشة الفعلي)
 * «المهم»: نصٌّ مرئي، a/button/input/select/textarea/[role=tab]/[role=button]/img/svg/canvas.
 * يُستثنى ما لا يحمل نصاً ولا تفاعلاً (خلفيةٌ ممتدة) أو ما عُلِّم data-duo-bleed، وتُسجَّل الاستثناءات.
 * وما غطّاه عنصرٌ آخر في النقطة نفسها (نافذةٌ معتِّمة فوق الصفحة) لا يُحتسب مرتين: يُحتسب الغاطي.
 *
 * يتحقق أيضاً أن المنطقة نشطة (--duo-widget-w = 96px) على كل مقاسات الدوو، وصفرٌ على غيرها
 * (iPhone وiPad والحاسوب)، وأن ‎?duo-debug=1‎ يرسم الإطار.
 *
 * التشغيل (يشغّل خادماً تجريبياً بنفسه ما لم يُعطَ DUO_BASE):
 *   npm run test:duo-widget                 # المصفوفة المختصرة
 *   DUO_FULL=1 npm run test:duo-widget      # كل مقاس × فاتح/داكن × نص 100%/200% × كل المشاهد
 *   DUO_SHOTS=<مجلد> ...                    # لقطات لكل مقاس رئيسي
 * يحتاج حزمة playwright فيها WebKit (PLAYWRIGHT_MODULE يحدد مسارها إن لم تكن في node_modules).
 * لا يمسّ بياناتٍ حقيقية: الدخول تجريبي (DATA_MODE=demo) على مجلدٍ مؤقت.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, "playwright", "/opt/node22/lib/node_modules/playwright", "/opt/node-tools/node_modules/playwright"].filter(Boolean);
  for (const id of candidates) {
    try { const mod = require(id); if (mod.webkit) return mod; } catch { /* التالي */ }
  }
  console.error("تعذّر تحميل playwright (WebKit). ثبّته أو حدّد PLAYWRIGHT_MODULE.");
  process.exit(2);
}
const { webkit } = loadPlaywright();

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const APP_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
/* مقاساتٌ أطول للتطبيق: بلا أشرطة Safari يكون الارتفاع أكبر. */
const APP_TALL = [[382, 720], [382, 780], [382, 844], [470, 900], [440, 660], [480, 720], [669, 1000], [951, 700]];
const WIDGET_W = 96;
const zoneHeight = (vh) => Math.min(270, Math.max(64, vh * 0.31));

/* مقاسات الدوو المعروفة، طولياً وعرضياً (بتبديل العرض والارتفاع). كلها يجب أن تفعّل المنطقة. */
const DUO = [[382, 580], [470, 780], [594, 368], [669, 867], [951, 585], [457, 678], [457, 760], [720, 900], [951, 669], [951, 800]];
const DUO_POSES = [];
for (const [w, h] of DUO) for (const [a, b] of [[w, h], [h, w]]) if (!(a < b && a > 720) && !DUO_POSES.some(([x, y]) => x === a && y === b)) DUO_POSES.push([a, b]); /* طوليٌّ أعرض من 720 لا يُحجز له */
/* أجهزةٌ أخرى: يجب أن تبقى المنطقة 0 عليها. */
const OTHERS = [[844, 390], [932, 430], [744, 1133], [768, 1024], [1024, 768], [1180, 820], [1280, 800]];

const FULL = process.env.DUO_FULL === "1";
const SHOTS = process.env.DUO_SHOTS || "";
const MAIN = new Set(["382x580", "457x678", "669x867", "951x585"]);

/** يقيس في الصفحة (نصٌّ لا دالة ليبقى واحداً في كل محرك). يعيد المخالفات والاستثناءات. */
const AUDIT = `((W, H) => {
  const vw = innerWidth, vh = innerHeight;
  const inter = (r) => { const l = Math.max(r.left, vw - W, 0), t = Math.max(r.top, 0), rt = Math.min(r.right, vw), b = Math.min(r.bottom, H, vh); return rt - l > 0.5 && b - t > 0.5 ? { l, t, r: rt, b } : null; };
  const visible = (el) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden" || +s.opacity < 0.02) return false; } return true; };
  const clipBox = (el, r) => { let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) { const s = getComputedStyle(n); if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const p = n.getBoundingClientRect(); if (s.overflowX !== "visible") { box.l = Math.max(box.l, p.left); box.r = Math.min(box.r, p.right); } if (s.overflowY !== "visible") { box.t = Math.max(box.t, p.top); box.b = Math.min(box.b, p.bottom); } }
    return { left: box.l, top: box.t, right: box.r, bottom: box.b }; };
  const label = (el) => { const id = el.id ? "#" + el.id : ""; const cls = typeof el.className === "string" ? el.className.trim().split(/\\s+/).slice(0, 2).map((c) => "." + c).join("") : ""; return el.tagName.toLowerCase() + id + cls; };
  const bleed = (el) => !!el.closest("[data-duo-bleed]");
  const out = { violations: [], bleed: [], checked: 0 };
  const seen = new Set();
  const report = (el, kind, text, hit) => {
    const key = el.tagName + "|" + kind + "|" + Math.round(hit.l) + "," + Math.round(hit.t) + "|" + text; if (seen.has(key)) return; seen.add(key);
    /* مغطّى بعنصرٍ آخر في النقطة نفسها؟ فالغاطي هو الذي يُقاس. */
    const cx = (hit.l + hit.r) / 2, cy = (hit.t + hit.b) / 2; const top = document.elementFromPoint(Math.min(cx, vw - 1), Math.min(cy, vh - 1));
    if (top && top !== el && !el.contains(top) && !top.contains(el)) return;
    out.violations.push({ kind, el: label(el), text: text.slice(0, 40), x: Math.round(hit.l), y: Math.round(hit.t), w: Math.round(hit.r - hit.l), h: Math.round(hit.b - hit.t) });
  };
  /* 1) النصوص. */
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue || "").replace(/\\s+/g, " ").trim(); if (!text) continue;
    const el = node.parentElement; if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TITLE)$/.test(el.tagName) || !visible(el)) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    for (const rect of range.getClientRects()) { if (rect.width < 1 || rect.height < 1) continue; const hit = inter(clipBox(el, rect)); if (!hit) continue;
      out.checked++; if (bleed(el)) { out.bleed.push(label(el) + " «" + text.slice(0, 20) + "»"); continue; } report(el, "text", text, hit); }
  }
  /* 2) التفاعل والصور. */
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,[role=tab],[role=button],[role=link],[role=menuitem],img,svg,canvas,video,[data-logo]';
  for (const el of document.querySelectorAll(sel)) {
    if (el.tagName.toLowerCase() !== "svg" && el.closest("svg")) continue;
    if (el.tagName.toLowerCase() === "svg" && el.parentElement && el.parentElement.closest("svg")) continue;
    if (!visible(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const hit = inter(clipBox(el, r)); if (!hit) continue; out.checked++;
    const tag = el.tagName.toLowerCase(); const s = getComputedStyle(el);
    const decorative = (tag === "svg" || tag === "img" || tag === "canvas") && (el.getAttribute("aria-hidden") === "true" || s.pointerEvents === "none") && !el.closest("a,button,[role=button],[role=tab]");
    if (bleed(el) || decorative) { out.bleed.push(label(el) + (bleed(el) ? " [data-duo-bleed]" : " [زخرفة]")); continue; }
    report(el, tag, (el.getAttribute("aria-label") || el.textContent || el.getAttribute("alt") || "").replace(/\\s+/g, " ").trim(), hit);
  }
  return out;
})`;

async function freePort() {
  return new Promise((resolve, reject) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); s.on("error", reject); });
}

async function startServer() {
  if (process.env.DUO_BASE) return { base: process.env.DUO_BASE, stop: () => {} };
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "duo-widget-"));
  const child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(port), SCHEDULE_PRIVATE_DIR: dir }, stdio: "ignore", detached: true });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 180; i++) { try { const r = await fetch(base + "/api/health"); if (r.ok) break; } catch { /* لم يبدأ بعد */ } await sleep(1000); }
  return { base, stop: () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* انتهى */ } fs.rmSync(dir, { recursive: true, force: true }); } };
}

let results = [];
let failures = 0;
const fail = (msg) => { failures++; console.log("  ✗ " + msg); };

async function main() {
  const server = await startServer();
  const BASE = server.base;
  let browser = await webkit.launch();
  const relaunch = async () => { try { await browser.close(); } catch { /* مغلق */ } browser = await webkit.launch(); };
  let session = process.env.DUO_SESSION || "";
  try {
    const first = await browser.newContext({ locale: "ar-KW" });
    if (!session) {
      const login = await first.request.post(BASE + "/api/auth/demo", { data: {}, timeout: 180000 });
      if (!login.ok()) throw new Error("demo login " + login.status());
      session = (String(login.headers()["set-cookie"] || "").match(/session_id=([^;]+)/) || [])[1] || "";
    }
    for (let i = 0; i < 360; i++) { const s = await (await first.request.get(BASE + "/api/demo/seed-status")).json().catch(() => ({})); if (s.status === "ready") break; await sleep(500); }
    await first.close();

    const newContext = async ([width, height], { scheme = "light", authed = true, app = false } = {}) => {
      if (!browser.isConnected()) await relaunch();
      const context = await browser.newContext({ viewport: { width, height }, screen: { width, height }, deviceScaleFactor: app ? 2 : 1, hasTouch: true, isMobile: app, userAgent: app ? APP_UA : UA, locale: "ar-KW", colorScheme: scheme, reducedMotion: "reduce" });
      if (app) await context.addInitScript(() => {
        /* غلاف Capacitor (WKWebView) مُحاكى: لا navigator.standalone ولا display-mode، وwindow.Capacitor موجود. */
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", platform: "ios" };
        try { Object.defineProperty(navigator, "standalone", { get: () => undefined }); } catch { /* ثابت */ }
      });
      await context.addInitScript(() => {
        const read = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) { return String(key).startsWith("schedule-onboarding") ? "done" : read.call(this, key); };
      });
      if (authed && session) await context.addCookies([{ name: "session_id", value: session, url: BASE }]);
      return context;
    };
    const settle = async (page, ms = 1600) => { await page.waitForSelector("main, .app-shell, .apex-login, body", { state: "attached", timeout: 60000 }).catch(() => {}); await sleep(ms); };
    const go = async (page, route) => { await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 90000 }); await settle(page); };
    const click = (page, fn) => page.evaluate(fn);
    const clickText = (page, re) => click(page, `(() => { const re = ${re}; const b = [...document.querySelectorAll("button,a,[role=button]")].find((x) => x.offsetParent && re.test((x.innerText || x.getAttribute("aria-label") || "").trim())); if (b) b.click(); return !!b; })()`);

    /* المشاهد: كلٌّ يفتح حالةً ثم يُقاس. */
    const scenes = [
      { id: "login", authed: false, run: async (p) => { await go(p, "/"); } },
      { id: "home", run: async (p) => { await go(p, "/Home/Index"); } },
      { id: "schedule", run: async (p) => { await go(p, "/FSchedule/Index"); } },
      { id: "intel", run: async (p) => { await go(p, "/Schedule/Intelligence"); } },
      { id: "sidebar-open", run: async (p) => { await go(p, "/Home/Index"); await p.evaluate(`[...document.querySelectorAll("button[aria-label='فتح القائمة']")].find((b) => b.offsetParent)?.click()`); await sleep(900); } },
      { id: "modal-search", run: async (p) => { await go(p, "/Home/Index"); await clickText(p, "/بحث شامل|فتح البحث الشامل/"); await sleep(900); } },
      { id: "modal-details", run: async (p) => { await go(p, "/FSchedule/Index"); await p.evaluate(`document.querySelector(".agenda-card")?.click()`); await sleep(900); } },
      { id: "modal-tools", run: async (p) => { await go(p, "/FSchedule/Index"); if (!(await clickText(p, "/^أدوات الجدول$/"))) { await clickText(p, "/^المزيد$/"); await sleep(500); await clickText(p, "/^أدوات الجدول$/"); } await sleep(1100); } },
      { id: "trail-sheet", run: async (p) => { await go(p, "/Home/Index"); await p.evaluate(`document.querySelector(".user-card-tools .trail-open")?.click()`); await sleep(900); } },
      /* درج «الدخول بالبصمة» (CatalogFormDrawer) يُفتح من الدرج الجانبي: يُفحص أن لا محتوى يخرج عن صندوقه، وأن لا سلفَ له
         يقصّه (حاوية تمرير/تحويل) — على iOS داخل التطبيق كان .sidebar.open يقصّ يساره. */
      { id: "passkey-drawer", contain: ".catalog-form-drawer", run: async (p) => { await go(p, "/Home/Index"); await p.evaluate(`[...document.querySelectorAll("button[aria-label='فتح القائمة']")].find((b) => b.offsetParent)?.click()`); await sleep(700); if (!(await click(p, `(() => { const b = document.querySelector("button[aria-label='الدخول بالبصمة']"); if (b) b.click(); return !!b; })()`))) throw new Error("زر الدخول بالبصمة غير موجود"); await sleep(1100); } },
      { id: "public-about", authed: false, run: async (p) => { await go(p, "/Public/Aboutus"); } },
      { id: "not-found", run: async (p) => { await go(p, "/no-such-page"); } },
    ];

    const only = process.env.DUO_ONLY ? process.env.DUO_ONLY.split(",") : null;
    const ctxKinds = process.env.DUO_CTX ? process.env.DUO_CTX.split(",") : ["safari", "app"];
    const entries = [];
    for (const kind of ctxKinds) for (const p of (kind === "app" ? [...DUO_POSES, ...APP_TALL] : DUO_POSES)) if (!only || only.includes(p.join("x"))) entries.push({ kind, size: p });
    const sceneIds = process.env.DUO_SCENES ? process.env.DUO_SCENES.split(",") : null;
    const sceneList = scenes.filter((s) => !sceneIds || sceneIds.includes(s.id));
    const variants = (size) => {
      const key = size.join("x");
      const list = [{ scheme: "light", text: 100 }];
      if (process.env.DUO_LIGHT_ONLY !== "1" && (FULL || ["382x580", "457x678", "457x760", "669x867", "951x585", "580x382"].includes(key))) list.push({ scheme: "dark", text: 100 }, { scheme: "light", text: 200 });
      return list;
    };

    console.log(`المنطقة: x ≥ vw − ${WIDGET_W}، y ≤ clamp(64, 31%·vh, 270) — WebKit ${browser.version()} — ${BASE}`);
    for (const { kind, size } of entries) {
      const isApp = kind === "app";
      const [w, h] = size; const key = size.join("x");
      for (const variant of variants(size)) {
        const tag = `${isApp ? "[app] " : ""}${key} ${variant.scheme}${variant.text === 200 ? " نص200%" : ""}`;
        if (!browser.isConnected()) await relaunch();
        for (const scene of sceneList) {
          for (let attempt = 1; attempt <= 2; attempt++) {
          const context = await newContext(size, { scheme: variant.scheme, authed: scene.authed !== false, app: isApp });
          let page; let retry = false;
          try {
            page = await context.newPage();
            await scene.run(page);
            if (variant.text === 200) { await page.addStyleTag({ content: "html{font-size:200%}" }); await sleep(500); }
            const vars = await page.evaluate(`(() => { const s = getComputedStyle(document.documentElement); return { w: s.getPropertyValue("--duo-widget-w").trim(), h: s.getPropertyValue("--duo-widget-h").trim(), gap: s.getPropertyValue("--duo-widget-gap").trim() }; })()`);
            const m = await page.evaluate(`${AUDIT}(${WIDGET_W}, ${zoneHeight(h)})`);
            results.push({ ctx: kind, size: key, variant: tag, scene: scene.id, vars, ...m });
            const bad = m.violations.length;
            console.log(`${bad ? "✗" : "✓"} ${tag} · ${scene.id} — فُحص ${m.checked}، مخالفات ${bad}، خلفيات مستثناة ${m.bleed.length}`);
            if (scene.contain) {
              const c = await page.evaluate(`(() => { const d = document.querySelector(${JSON.stringify(scene.contain)}); if (!d) return { missing: true }; const r = d.getBoundingClientRect(); const out = []; for (const el of d.querySelectorAll("*")) { const b = el.getBoundingClientRect(); if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") continue; if (b.left < r.left - 1 || b.right > r.right + 1) out.push((el.className && String(el.className).slice(0, 40) || el.tagName) + " [" + Math.round(b.left) + "→" + Math.round(b.right) + "]"); } for (let a = d.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX !== "visible" || s.overflowY !== "visible" || s.transform !== "none" || s.filter !== "none" || s.contain !== "none") out.push("حاويةٌ قاصّة: " + a.tagName + "." + String(a.className).slice(0, 40)); } return { box: [Math.round(r.left), Math.round(r.right)], sw: d.scrollWidth, cw: d.clientWidth, out }; })()`);
              if (c.missing) fail(`${tag} · ${scene.id}: ${scene.contain} لم يُفتح`);
              else { const over = c.out.length || c.sw > c.cw + 1; console.log(`${over ? "✗" : "✓"} ${tag} · ${scene.id} احتواء — الصندوق ${c.box.join("→")} scrollWidth ${c.sw}/${c.cw}، خارجه ${c.out.length}`); for (const o of c.out.slice(0, 4)) console.log(`     ▸ ${o}`); if (over) failures += Math.max(1, c.out.length); }
            }
            if (vars.w !== `${WIDGET_W}px`) fail(`${tag} · ${scene.id}: --duo-widget-w = «${vars.w}» والمتوقع ${WIDGET_W}px`);
            for (const v of m.violations.slice(0, 6)) console.log(`     ▸ ${v.kind} ${v.el} «${v.text}» عند x=${v.x} y=${v.y} (${v.w}×${v.h})`);
            if (bad) failures += bad;
            if (SHOTS && MAIN.has(key) && variant.scheme === "light" && variant.text === 100) {
              fs.mkdirSync(SHOTS, { recursive: true });
              await page.screenshot({ path: path.join(SHOTS, `${kind}-${key}-${scene.id}.png`) });
            }
          } catch (error) {
            const msg = String(error.message).split("\n")[0];
            if (attempt === 1 && /closed|crash|disconnected/i.test(msg)) retry = true; else fail(`${tag} · ${scene.id}: ${msg}`);
          }
          try { await context.close(); } catch { /* المتصفح أُغلق */ }
          if (!retry) break;
          }
        }
      }
    }

    /* الأجهزة الأخرى: المنطقة صفر، فلا يتأثر شيء. */
    console.log("— أجهزةٌ أخرى: المنطقة يجب أن تكون 0 —");
    for (const size of OTHERS) {
      const context = await newContext(size); const page = await context.newPage();
      try {
        await go(page, "/Home/Index");
        const w = await page.evaluate(`getComputedStyle(document.documentElement).getPropertyValue("--duo-widget-w").trim()`);
        const ok = w === "0px"; console.log(`${ok ? "✓" : "✗"} ${size.join("x")} --duo-widget-w=${w}`); if (!ok) fail(`${size.join("x")} لا يجب أن تكون المنطقة نشطة`);
      } catch (error) { fail(`${size.join("x")}: ${String(error.message).split("\n")[0]}`); }
      await context.close();
    }

    /* ضابطٌ سلبي: الحارس يجب أن يلتقط تقاطعاً معروفاً، والمنطقة المحلولة بالمتغيّرات يجب أن تساوي المنطقة المتوقعة (فلا يمرّ بلا قياس). */
    console.log("— ضابط سلبي وحلّ المتغيّرات —");
    for (const size of [[382, 580], [457, 678], [951, 585]]) {
      const context = await newContext(size); const page = await context.newPage();
      try {
        await go(page, "/Home/Index");
        const probe = await page.evaluate(`(() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;visibility:hidden;left:0;top:0;width:var(--duo-widget-w);height:var(--duo-widget-h)"; document.body.appendChild(d); const r = d.getBoundingClientRect(); d.remove(); return { w: r.width, h: r.height }; })()`);
        const wantH = zoneHeight(size[1]);
        const okZone = probe.w === WIDGET_W && Math.abs(probe.h - wantH) < 1.5 && probe.w > 0 && probe.h > 0;
        console.log(`${okZone ? "✓" : "✗"} ${size.join("x")} المنطقة المحلولة ${probe.w}×${probe.h.toFixed(1)} (المتوقع ${WIDGET_W}×${wantH.toFixed(1)})`); if (!okZone) fail(`${size.join("x")} المنطقة المحلولة ${probe.w}×${probe.h}`);
        await page.evaluate(`(() => { const b = document.createElement("button"); b.textContent = "ضابط"; b.id = "duo-negative-control"; b.style.cssText = "position:fixed;top:8px;right:8px;z-index:2147483000;width:40px;height:40px"; document.body.appendChild(b); })()`);
        const m = await page.evaluate(`${AUDIT}(${WIDGET_W}, ${zoneHeight(size[1])})`);
        const caught = m.violations.some((v) => /duo-negative-control|button/.test(v.el));
        console.log(`${caught ? "✓" : "✗"} ${size.join("x")} الحارس يلتقط زراً موضوعاً عمداً داخل المنطقة`); if (!caught) fail(`${size.join("x")}: الضابط السلبي لم يُلتقط`);
      } catch (error) { fail(`ضابط ${size.join("x")}: ${String(error.message).split("\n")[0]}`); }
      await context.close();
    }

    /* التطبيق الأصلي على الخارجية طولاً: iOS يبلغ عمود الودجت يميناً (data-widget-side=right، ‎--duo-ir‎ = 84pt
       يحاكي safe-area-inset-right)، وpublishDuoGeometry يكتب ‎--duo-widget-w/-h‎. لا زرّ ثابتٌ/عائم يقع في مستطيل
       الودجت (96×235 كما في لقطة المالك 2026-11-26: «+» كان عند y≈183–231). */
    console.log("— التطبيق الأصلي: لا زرّ عائم تحت عمود الودجت —");
    for (const size of [[457, 678], [466, 678]]) {
      const context = await newContext(size, { app: true });
      await context.addInitScript(() => {
        let watched = false;
        const apply = () => { const root = document.documentElement; if (!root) return;
          if (!watched) { watched = true; new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ["data-widget-side"] }); }
          root.dataset.duoNativeRegions = "true";
          root.style.setProperty("--duo-widget-w", "96px"); root.style.setProperty("--duo-widget-h", "235px"); root.style.setProperty("--duo-widget-gap", "0px"); root.style.setProperty("--duo-ir", "84px");
          if (root.dataset.widgetSide !== "right") root.dataset.widgetSide = "right"; };
        document.addEventListener("DOMContentLoaded", apply); setTimeout(apply, 50); apply();
      });
      const page = await context.newPage();
      try {
        await go(page, "/FSchedule/Index"); await page.waitForSelector(".schedule-dock>.dock-add", { timeout: 30000 }).catch(() => {}); await sleep(800);
        const hits = await page.evaluate(`(() => { const vw = innerWidth; const z = [vw - 96, 0, vw, 235]; const out = []; let n = 0;
          for (const el of document.querySelectorAll("button,a[href],[role=button]")) { let fixed = false; for (let a = el; a && a !== document.body; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === "fixed" || p === "sticky") { fixed = true; break; } } if (!fixed) continue;
            const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || el.closest("[hidden]")) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; n++;
            if (r.right > z[0] + 0.5 && r.left < z[2] && r.top < z[3] - 0.5 && r.bottom > z[1]) out.push((el.className && String(el.className).split(" ")[0] || el.tagName) + " [" + [r.left, r.top, r.right, r.bottom].map(Math.round).join(",") + "]"); }
          const dock = document.querySelector(".schedule-dock>.dock-add"); return { n, out, dbg: [document.documentElement.dataset.widgetSide, getComputedStyle(document.documentElement).getPropertyValue("--duo-ir"), !!document.querySelector(".schedule-dock"), location.pathname].join(" "), device: document.documentElement.dataset.device, dock: dock ? Math.round(dock.getBoundingClientRect().top) : null }; })()`);
        const ok = hits.device === "duo" && hits.dock !== null && hits.out.length === 0;
        console.log(`${ok ? "✓" : "✗"} [app] ${size.join("x")} schedule — أزرار ثابتة ${hits.n}، أعلى «+» y=${hits.dock}، في الودجت ${hits.out.length} ${hits.dbg}`);
        for (const o of hits.out) console.log(`     ▸ ${o}`);
        if (!ok) fail(`[app] ${size.join("x")}: زرّ عائم تحت عمود الودجت أو الدوو غير مكتشف (${hits.device}، dock ${hits.dock})`);
      } catch (error) { fail(`[app] ${size.join("x")} native: ${String(error.message).split("\n")[0]}`); }
      await context.close();
    }

    /* صفحة التشخيص المخفية. */
    console.log("— ?duo-debug=1 —");
    {
      const context = await newContext([382, 580]); const page = await context.newPage();
      await go(page, "/Home/Index"); const none = await page.locator("[data-duo-debug]").count();
      await go(page, "/Home/Index?duo-debug=1"); await sleep(800);
      const info = await page.evaluate(`(() => { const f = document.querySelector("[data-duo-debug=frame]"); const p = document.querySelector("[data-duo-debug=panel]"); const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }; return { frame: r(f), panel: r(p), pe: f ? getComputedStyle(f).pointerEvents : "", text: p ? p.innerText : "" }; })()`);
      const okAbsent = none === 0; console.log(`${okAbsent ? "✓" : "✗"} بدون المعامل لا يُحمَّل شيء`); if (!okAbsent) fail("صفحة التشخيص تُحمَّل بلا معامل");
      const frameOk = info.frame && Math.abs(info.frame.r - 382) < 1.5 && info.frame.l > 382 - WIDGET_W - 2 && info.pe === "none";
      console.log(`${frameOk ? "✓" : "✗"} الإطار مرسوم عند الزاوية وpointer-events:none`); if (!frameOk) fail("إطار التشخيص غير صحيح: " + JSON.stringify(info.frame));
      const panelOut = info.panel && !(info.panel.r > 382 - WIDGET_W && info.panel.t < zoneHeight(580));
      console.log(`${panelOut ? "✓" : "✗"} اللوحة خارج المنطقة`); if (!panelOut) fail("لوحة التشخيص داخل المنطقة");
      const textOk = /safe-area/.test(info.text) && /Capacitor/.test(info.text) && /standalone/.test(info.text) && /UA:/.test(info.text);
      console.log(`${textOk ? "✓" : "✗"} اللوحة تعرض safe-area وstandalone وCapacitor`); if (!textOk) fail("نص لوحة التشخيص ناقص");
      if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, "debug-382x580.png") }); }
      await context.close();
      /* السياق «تطبيق»: اللوحة تقول native ios وأن UA بلا Safari/. */
      const appCtx = await newContext([382, 580], { app: true }); const appPage = await appCtx.newPage();
      await go(appPage, "/Home/Index?duo-debug=1"); await sleep(800);
      const appText = await appPage.evaluate(`document.querySelector("[data-duo-debug=panel]")?.innerText || ""`);
      const appOk = /Capacitor: native ios/.test(appText) && /no Safari\//.test(appText) && /ACTIVE/.test(appText);
      console.log(`${appOk ? "✓" : "✗"} لوحة التشخيص في سياق التطبيق: native ios، بلا Safari/، الركن نشط`); if (!appOk) fail("لوحة التشخيص في سياق التطبيق: " + appText.replace(/\n/g, " | "));
      await appCtx.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }

  const checked = results.reduce((n, r) => n + r.checked, 0);
  const bleeds = results.reduce((n, r) => n + r.bleed.length, 0);
  console.log(`\nحالات: ${results.length}، عناصر مفحوصة: ${checked}، مخالفات: ${results.reduce((n, r) => n + r.violations.length, 0)}، خلفيات/زخارف مستثناة: ${bleeds}`);
  if (process.env.DUO_REPORT) fs.writeFileSync(process.env.DUO_REPORT, JSON.stringify({ cases: results.length, checked, bleeds, failures, results }, null, 1));
  if (failures) { console.log(`\x1b[31mفشل: ${failures}\x1b[0m`); process.exit(1); }
  console.log("\x1b[32mنجح: صفر عناصر مهمة تحت ركن الودجت\x1b[0m");
}
main().catch((e) => { console.error(e); process.exit(1); });
