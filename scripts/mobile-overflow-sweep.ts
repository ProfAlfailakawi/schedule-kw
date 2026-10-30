/**
 * مسحُ «الخروج عن عرض الهاتف» في الموقع كله — خادمُ ديمو خاصّ بمنفذٍ خاص، يُطفأ بعدها.
 *
 * يمرّ على كل شاشةٍ رئيسية بكل صفةٍ تجريبية، ثم يفتح النوافذ والأوراق المعروفة،
 * ويقيس عند كل مشهد:
 *   1) الصفحة: `document.scrollingElement.scrollWidth <= innerWidth`.
 *   2) كل نافذةٍ/ورقةٍ مفتوحة: `el.scrollWidth <= el.clientWidth + 1`.
 *   3) كل عنصرٍ يبرز عن حافة الشاشة وليس داخل حاويةٍ تُمرَّر أفقياً عن قصد
 *      (جدولٌ عريض أو شريطُ بطاقات) — يُذكر أعلاه فقط لا كلُّ أبنائه.
 *
 *   PLAYWRIGHT=<مسار playwright> npx tsx scripts/mobile-overflow-sweep.ts
 *   SWEEP_PORT=<منفذ خادمٍ قائم>  — بلا خادمٍ خاص.
 *   SWEEP_WIDTHS=390,360 · SWEEP_ROLES=admin,departmentHead · SWEEP_ONLY=routes|dialogs
 *   ENGINE=webkit  — يحتاج PLAYWRIGHT بإصدارٍ معه WebKit مثبّت.
 *   SWEEP_SHOTS=<مجلد>  — لقطةٌ لكل مشهدٍ فيه مخالفة.
 *
 * يخرج بـ 1 إن وُجدت مخالفة، ويطبع قائمتها مجمّعةً بالشاشة.
 * تنبيه: Chromium لا يرسم حقول التاريخ/الساعة كما يرسمها iPhone؛ تلك تُحرس
 * بقاعدة CSS (tests/mobile-overflow-css-audit.ts) وتُرى على Safari الحقيقي.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT || "playwright");
const ENGINE = process.env.ENGINE === "webkit" ? "webkit" : "chromium";
const browserType = pw[ENGINE];
const PORT = Number(process.env.SWEEP_PORT || 3000 + Math.floor(Math.random() * 900));
const OWN = !process.env.SWEEP_PORT;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = String(process.env.SWEEP_WIDTHS || "390,360").split(",").map(Number).filter(Boolean);
const ROLES = String(process.env.SWEEP_ROLES || "admin,departmentHead,committeeChair,advisor,registrarStaff,dean,standard").split(",").filter(Boolean);
const ONLY = process.env.SWEEP_ONLY || "";
const SHOTS = process.env.SWEEP_SHOTS ? path.resolve(process.env.SWEEP_SHOTS) : "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const J = async (r: any) => { try { return await r.json(); } catch { return {}; } };
const note = (line: string) => console.log(line);

const ROUTES: Array<[string, string]> = [
  ["لوحة التحكم", "/Home/Index"],
  ["الجدول", "/FSchedule/Index"],
  ["جدول القسم", "/FSchedule/DepartmentSchedule"],
  ["نسخ الجدول", "/FSchedule/CopySchedule"],
  ["مركز الذكاء", "/Schedule/Intelligence"],
  ["آلة الزمن", "/FSchedule/TimeMachine"],
  ["التغييرات والمواعيد", "/FSchedule/Changes"],
  ["صندوق الطلبات", "/FSchedule/InstructorRequests"],
  ["ورقة التسجيل", "/FSchedule/StudentRegistration"],
  ["مراجعة الخطة", "/FSchedule/PlanReview"],
  ["محاكي الشعب", "/FSchedule/Rehearsal"],
  ["بحث أستاذ", "/FSchedule/InstructorReport"],
  ["بحث قاعة", "/FSchedule/RoomReport"],
  ["بحث وقت", "/FSchedule/TimeReport"],
  ["بحث قاعة ووقت", "/FSchedule/RoomTimeReport"],
  ["بحث متقدّم", "/FSchedule/MainReport"],
  ["تقرير القسم", "/FSchedule/MainScheduleReport"],
  ["تقرير أستاذ", "/FSchedule/InstructorReportRPT"],
  ["تقرير قاعة", "/FSchedule/RoomReportRPT"],
  ["تقرير وقت", "/FSchedule/TimeReportRPT"],
  ["تقرير قاعة ووقت", "/FSchedule/RoomTimeReportRPT"],
  ["الفصول", "/AdTerm/Index"],
  ["الكليات", "/AdCollege/Index"],
  ["الأقسام", "/AdSection/Index"],
  ["الأساتذة", "/AdInstructor/Index"],
  ["المقررات", "/AdCourse/Index"],
  ["المستخدمون", "/SystemUser/Index"],
  ["المقاعد والرتب", "/SystemUser/Seats"],
  ["الصلاحيات", "/FormSecurity/Index"],
  ["النطاقات", "/AdCollegeUserAssign/Index"],
  ["سجل التدقيق", "/System/AuditLog"],
  ["القاعات", "/System/Locations"],
  ["إعداد القاعات", "/System/LocationSetup"],
  ["ساعات الأقسام", "/System/SectionHours"],
  ["العبء التدريسي", "/System/TeachingLoad"],
  ["النسخ الاحتياطي", "/System/Backup"],
  ["الجمهور", "/System/Audience"],
  ["الإعلانات", "/System/Ads"],
  ["عن النظام", "/Public/Aboutus"],
];

/** يقيس في الصفحة: الوثيقة، النوافذ المفتوحة، والعناصر البارزة عن الحافة. */
const AUDIT = `(() => {
  const W = innerWidth, tol = 1;
  const se = document.scrollingElement || document.documentElement;
  const out = { doc: se.scrollWidth - W, dialogs: [], offenders: [] };
  const label = el => {
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : "";
    const aria = el.getAttribute("aria-label") ? "[" + el.getAttribute("aria-label").slice(0, 24) + "]" : "";
    return el.tagName.toLowerCase() + id + cls + aria;
  };
  const trail = el => { const parts = []; for (let n = el; n && n !== document.body && parts.length < 4; n = n.parentElement) parts.unshift(label(n)); return parts.join(" > "); };
  const visible = el => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  /* حاويةٌ تُمرَّر أفقياً عن قصد، أو تقصّ، فما بداخلها ليس «خارج الشاشة». */
  const scrollsX = el => { const cs = getComputedStyle(el); return /auto|scroll|hidden|clip/.test(cs.overflowX) && el !== document.body && el !== document.documentElement; };
  const insideScroller = el => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { if (scrollsX(n)) { const r = n.getBoundingClientRect(); if (r.left >= -tol && r.right <= W + tol) return n; } } return null; };
  const dialogs = [...document.querySelectorAll('[role=dialog],[aria-modal=true],dialog[open],.share-sheet,.seat-drawer,.sheet,.drawer,[class*="-sheet"]:not(.share-step)')].filter(visible);
  for (const d of new Set(dialogs)) {
    const cs = getComputedStyle(d);
    const over = d.scrollWidth - d.clientWidth;
    const r = d.getBoundingClientRect();
    if ((over > tol && !/hidden|clip/.test(cs.overflowX)) || r.right > W + tol || r.left < -tol) out.dialogs.push({ el: trail(d), over, left: Math.round(r.left), right: Math.round(r.right) });
  }
  const seen = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" && el.getBoundingClientRect().width >= W - 1) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= W + tol && r.left >= -tol) continue;
    const scroller = insideScroller(el);
    if (scroller) {
      /* داخل حاويةٍ مقصوصة: المخالفة أن يبرز عن الحاوية نفسها وهي لا تُمرَّر (hidden/clip تقصّ المحتوى = محتوى مخفيّ). */
      const scs = getComputedStyle(scroller);
      if (/auto|scroll/.test(scs.overflowX)) continue;
      if (scroller.closest('[role=dialog],[aria-modal=true],.share-sheet') && /hidden|clip/.test(scs.overflowX)) { /* نافذة تقصّ: يُبلَّغ إن خرج عن النافذة */ }
      else continue;
    }
    if (seen.some(s => s.contains(el))) continue;
    seen.push(el);
    out.offenders.push({ el: trail(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
  }
  /* حقلٌ أعرضُ من خانته: input/select/textarea يبرز عن صندوق أبيه. */
  out.spills = [];
  for (const el of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]),select,textarea")) {
    if (!visible(el) || !el.parentElement) continue;
    const p = el.parentElement, pr = p.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (/auto|scroll/.test(getComputedStyle(p).overflowX)) continue;
    if (r.left < pr.left - tol || r.right > pr.right + tol) out.spills.push({ el: trail(el), by: Math.round(Math.max(pr.left - r.left, r.right - pr.right)) });
  }
  /* زرُّ إغلاقٍ مثبَّت (sticky/fixed/absolute) يغطّي نصّاً أو عنصرَ تحكّمٍ من محتوى نافذته. */
  out.floating = [];
  const inter = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  for (const btn of document.querySelectorAll('button[aria-label^="إغلاق"],button[class*="close"]')) {
    if (!visible(btn) || btn.closest(".toast-layer,.sidebar")) continue;
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top || !(top === btn || btn.contains(top))) continue;
    let pinned = null;
    for (let n = btn; n && n !== document.body; n = n.parentElement) { const pos = getComputedStyle(n).position; if (/sticky|fixed/.test(pos)) { pinned = n; break; } }
    /* المثبَّتُ هو النافذةُ كلها (fixed)؟ فالزرّ يتحرّك معها ولا يطفو فوق محتواها إلا إن كان هو نفسه مثبَّتاً. */
    if (!pinned || pinned.matches('[role=dialog],[aria-modal=true],.share-sheet,[class*="backdrop"],[class*="-sheet"],aside')) continue;
    const root = btn.closest('[role=dialog],[aria-modal=true],.share-sheet,[class*="-sheet"],[class*="drawer"]:not(button),main') || document.body;
    const hits = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t && hits.length < 2; t = walker.nextNode()) {
      if (!t.textContent.trim() || pinned.contains(t.parentElement) || !visible(t.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      for (const rr of range.getClientRects()) if (inter(rr, r)) {
        /* النصّ تحت الزرّ فعلاً (لا فوقه): الزرّ هو الأعلى عند نقطة التقاطع. */
        const x = (Math.max(rr.left, r.left) + Math.min(rr.right, r.right)) / 2, y = (Math.max(rr.top, r.top) + Math.min(rr.bottom, r.bottom)) / 2;
        const atop = document.elementFromPoint(x, y);
        if (atop && (atop === btn || btn.contains(atop) || pinned.contains(atop))) { hits.push("«" + t.textContent.trim().slice(0, 24) + "» في " + label(t.parentElement)); break; }
      }
    }
    /* أو يغطّي بطاقةً/صندوقاً مرسوماً (خلفية أو إطار) — إلا إن كان المثبَّتُ شريطاً معتماً بعرض النافذة (رأسٌ حقيقي). */
    const pcs = getComputedStyle(pinned), pr = pinned.getBoundingClientRect(), rr0 = root.getBoundingClientRect();
    const opaqueBar = pinned !== btn && !/rgba\(0, 0, 0, 0\)|transparent/.test(pcs.backgroundColor) && pr.width >= rr0.width - 2;
    if (!hits.length && !opaqueBar) {
      const painted = el => { const c = getComputedStyle(el); return !/rgba\(0, 0, 0, 0\)|transparent/.test(c.backgroundColor) || parseFloat(c.borderTopWidth) > 0 || parseFloat(c.borderLeftWidth) > 0; };
      for (const [x, y] of [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]) {
        const under = document.elementsFromPoint(x, y).find(u => u !== btn && !btn.contains(u) && !u.contains(btn) && !pinned.contains(u) && root.contains(u) && u !== root && painted(u));
        if (under) { hits.push("صندوق " + label(under)); break; }
      }
    }
    if (hits.length) out.floating.push({ el: trail(btn), over: hits });
  }
  /* عمودٌ ضيّق يكسر النصَّ كلمةً في كل سطر: تُعدّ أسطرُ النصّ الظاهر نفسه (لا ارتفاعُ الصندوق). */
  out.cramped = [];
  const hiddenText = el => el.closest(".sr-only,.dna-sr,.visually-hidden,[aria-hidden=true]");
  for (const el of document.body.querySelectorAll("p,span,b,strong,small,em,h1,h2,h3,h4,h5,label,dt,dd,li,td,th,button,a")) {
    if (!visible(el) || hiddenText(el)) continue;
    const texts = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    const text = texts.map(n => n.textContent).join(" ").trim();
    const words = text.split(/\s+/).filter(w => w.length > 1);
    if (words.length < 3) continue;
    const tops = new Set();
    for (const n of texts) { const range = document.createRange(); range.selectNodeContents(n); for (const rr of range.getClientRects()) if (rr.width > 0) tops.add(Math.round(rr.top / 4)); }
    const lines = tops.size, r = el.getBoundingClientRect();
    if (lines >= words.length && lines >= 3) out.cramped.push({ el: trail(el), text: text.slice(0, 30), width: Math.round(r.width), lines });
  }
  out.offenders = out.offenders.slice(0, 12); out.spills = out.spills.slice(0, 8); out.cramped = out.cramped.slice(0, 8);
  return out;
})()`;

let server: ChildProcess | null = null;
async function startServer() {
  if (OWN) server = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 180; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) return; } catch { /* يقلع */ } await sleep(1000); }
  throw new Error("server did not start");
}
const stopServer = () => { if (server?.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { server.kill("SIGKILL"); } } };

async function demoContext(browser: any, width: number) {
  const phone = width < 1000;
  const context = await browser.newContext(phone
    ? { viewport: { width, height: width <= 360 ? 780 : 844 }, deviceScaleFactor: 2, isMobile: ENGINE === "chromium", hasTouch: true, userAgent: UA, locale: "ar-KW", colorScheme: "light" }
    : { viewport: { width, height: 900 }, deviceScaleFactor: 1, locale: "ar-KW", colorScheme: "light" });
  await context.addInitScript(() => {
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) { return String(key).startsWith("schedule-onboarding") ? "done" : read.call(this, key); };
  });
  const login = await context.request.post(BASE + "/api/auth/demo", { data: {}, timeout: 180000 });
  if (!login.ok()) throw new Error("demo login " + login.status());
  for (let i = 0; i < 360; i++) { const s = await J(await context.request.get(BASE + "/api/demo/seed-status")); if (s.status === "ready") break; await sleep(500); }
  return context;
}

type Finding = { width: number; role: string; scene: string; doc: number; dialogs: any[]; offenders: any[]; spills?: any[]; floating?: any[]; cramped?: any[] };
const findings: Finding[] = [];
let scenes = 0;
async function measure(page: any, width: number, role: string, scene: string) {
  scenes++;
  await sleep(500);
  const r = await page.evaluate(AUDIT).catch((error: any) => ({ doc: 0, dialogs: [], offenders: [{ el: "تعذّر القياس: " + String(error?.message || error).split("\n")[0] }] }));
  r.spills ||= []; r.floating ||= []; r.cramped ||= [];
  if (r.doc > 1 || r.dialogs.length || r.offenders.length || r.spills.length || r.floating.length || r.cramped.length) {
    findings.push({ width, role, scene, ...r });
    note(`✗ [${width}·${role}] ${scene} — الصفحة +${r.doc}px · نوافذ ${r.dialogs.length} · بارز ${r.offenders.length} · حقول ${r.spills.length} · ✕ طافٍ ${r.floating.length} · ضيّق ${r.cramped.length}`);
    for (const d of r.dialogs) note(`    ▣ ${d.el}  (+${d.over}px، ${d.left}…${d.right})`);
    for (const o of r.offenders) note(`    • ${o.el}  (${o.left}…${o.right})`);
    for (const o of r.spills) note(`    ⇥ حقل ${o.el}  (+${o.by}px)`);
    for (const o of r.floating) note(`    ✕ ${o.el}  فوق ${o.over.join(" | ")}`);
    for (const o of r.cramped) note(`    ⫼ «${o.text}» ${o.el}  (${o.width}px، ${o.lines} أسطر)`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${width}-${role}-${scene.replace(/[^\p{L}\p{N}]+/gu, "-")}.png`) }).catch(() => undefined);
  } else note(`✓ [${width}·${role}] ${scene}`);
}

const clickText = (page: any, text: string, scope = "button,a,[role=tab],summary") => page.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)})].find(x => x.offsetParent && ((x.innerText || "").trim() === ${JSON.stringify(text)} || x.getAttribute("aria-label") === ${JSON.stringify(text)} || x.getAttribute("title") === ${JSON.stringify(text)})); if (b) b.click(); return !!b; })()`);
const closeAll = async (page: any) => { for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(() => undefined); await sleep(150); } };
async function goto(page: any, route: string) {
  await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("main, .app-shell, .user-card", { timeout: 120000, state: "attached" }).catch(() => undefined);
  await sleep(1800);
  await clickText(page, "تخطّي");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
  await sleep(600);
}
const step = async (label: string, fn: () => Promise<void>) => { try { await fn(); } catch (error: any) { note(`⚠️ ${label}: ${String(error?.message || error).split("\n")[0]}`); } };

/** النوافذ والأوراق: كلٌّ يُفتح من مكانه كما يفتحه المستخدم. */
async function dialogs(page: any, width: number, role: string) {
  const M = (scene: string) => measure(page, width, role, scene);
  await step("موعد جديد", async () => {
    await goto(page, "/FSchedule/Index");
    if (await clickText(page, "إضافة موعد")) { await sleep(1200); await M("الجدول › موعد جديد"); }
    await closeAll(page);
  });
  await step("النشر", async () => {
    await goto(page, "/FSchedule/Index");
    if (!(await clickText(page, "أدوات البيانات"))) { await clickText(page, "المزيد"); await sleep(300); await clickText(page, "أدوات البيانات"); }
    await sleep(900);
    await clickText(page, "نشر"); await sleep(900);
    if (!(await clickText(page, "نشر الجدول"))) return;
    await sleep(1200);
    await M("النشر › لمن");
    for (const kind of ["جدول القسم", "مساري"]) {
      const b = page.locator(`.share-kind button[title^='${kind}']`);
      if (await b.count()) { await b.first().click(); await sleep(400); if (kind === "جدول القسم") { await page.locator("#publish-step-kind button:has-text('التالي')").click(); await sleep(700); await M("النشر › جدول القسم › الصلاحية"); await page.locator("#publish-step-options button:has-text('رجوع')").click(); await sleep(400); } else await M("النشر › مساري"); }
    }
    await page.locator(".share-kind button[title='بطاقة الأستاذ']").click();
    await page.locator("#publish-step-kind button:has-text('التالي')").click();
    await sleep(800);
    const modes = ["للعرض فقط", "طلب تعديل", "مرحلة التدريب"];
    for (let i = 0; i < 3; i++) {
      const mode = page.locator(".send-mode button").nth(i);
      if (!(await mode.count())) continue;
      await mode.click(); await sleep(1500);
      await M(`النشر › بطاقة الأستاذ › ${modes[i]}`);
      const offering = page.locator("#publish-offering summary");
      if (i === 1 && await offering.count()) {
        await offering.click(); await sleep(2500);
        await M("النشر › حالة طرح المقررات");
        await page.evaluate(`document.querySelector(".share-sheet").scrollTop = 1200`); await sleep(500);
        await M("النشر › حالة طرح المقررات (مُمرَّرة)");
        await offering.click(); await sleep(400);
      }
    }
    if (await clickText(page, "سجل النشر")) { await sleep(1500); await M("النشر › الروابط وسجلّها"); }
    await closeAll(page);
  });
  await step("فريقي", async () => {
    await goto(page, "/Home/Index");
    if (width < 1000) { await clickText(page, "فتح القائمة"); await sleep(500); }
    if (await clickText(page, "فريقي")) { await sleep(1200); await M("فريقي"); }
    await closeAll(page);
  });
  await step("الأثر", async () => {
    await goto(page, "/Home/Index");
    if (width < 1000) { await clickText(page, "فتح القائمة"); await sleep(500); }
    const trail = page.locator(".user-card-tools .trail-open");
    if (await trail.count()) { await trail.first().click(); await sleep(1500); await M("👣 الأثر"); }
    await closeAll(page);
  });
  await step("درج مركز الذكاء", async () => {
    await goto(page, "/Schedule/Intelligence");
    await page.evaluate(`document.querySelector("#insight-tab-rooms")?.click()`); await sleep(1200);
    const opened = await page.evaluate(`(() => { const b = document.querySelector("#insight-panel-rooms .intel-rank-list button"); if (b) { b.scrollIntoView(); b.click(); } return !!b; })()`);
    if (!opened) return;
    await page.locator(".intel-drawer").waitFor({ timeout: 30000 }); await sleep(1200);
    await M("مركز الذكاء › درج القاعة");
    await page.evaluate(`document.querySelector(".intel-drawer").scrollTop = 600`); await sleep(500);
    await M("مركز الذكاء › درج القاعة (مُمرَّر)");
    await closeAll(page);
  });
  await step("أدوات البيانات", async () => {
    await goto(page, "/FSchedule/Index");
    if (!(await clickText(page, "أدوات البيانات"))) { await clickText(page, "المزيد"); await sleep(300); await clickText(page, "أدوات البيانات"); }
    await sleep(1000);
    if (await page.locator(".transfer-sheet").count()) await M("الجدول › أدوات البيانات");
    await closeAll(page);
  });
  for (const [name, route] of [["الفصول", "/AdTerm/Index"], ["الأقسام", "/AdSection/Index"], ["الأساتذة", "/AdInstructor/Index"], ["المقررات", "/AdCourse/Index"]] as const) {
    await step(`نموذج ${name}`, async () => {
      await goto(page, route);
      const opened = await page.evaluate(`(() => { const b = [...document.querySelectorAll("button")].find(x => x.offsetParent && /^(إضافة|جديد|\\+)/.test((x.innerText || x.getAttribute("aria-label") || "").trim())); if (b) b.click(); return !!b; })()`);
      if (!opened) return;
      await sleep(1200);
      if (!(await page.locator(".catalog-form-drawer").count())) return;
      await M(`${name} › نموذج الإضافة`);
      await page.evaluate(`document.querySelector(".catalog-form-drawer").scrollTop = 600`); await sleep(400);
      await M(`${name} › نموذج الإضافة (مُمرَّر)`);
      await closeAll(page);
    });
  }
  await step("المواعيد", async () => {
    await goto(page, "/FSchedule/Changes");
    for (const tab of ["المواعيد", "مواعيد التسليم", "آخر موعد"]) if (await clickText(page, tab)) { await sleep(1200); await M(`التغييرات › ${tab}`); break; }
  });
}

async function run(browser: any, width: number) {
  for (const role of ROLES) {
    const context = await demoContext(browser, width);
    if (role !== "admin") { const r = await context.request.post(BASE + "/api/demo/role", { data: { role } }); if (!r.ok()) { note(`⚠️ صفة ${role}: ${r.status()}`); await context.close(); continue; } }
    else await context.request.post(BASE + "/api/demo/role", { data: { role: "admin" } });
    const page = await context.newPage();
    if (ONLY !== "dialogs") for (const [name, route] of ROUTES) await step(`${role} ${name}`, async () => { await goto(page, route); await M(page, width, role, name); });
    if (ONLY !== "routes" && (role === "admin" || role === "departmentHead" || role === "committeeChair")) await dialogs(page, width, role);
    await context.close();
  }
}
const M = (page: any, width: number, role: string, scene: string) => measure(page, width, role, scene);

(async () => {
  await startServer();
  const browser = await browserType.launch();
  try { for (const width of WIDTHS) await run(browser, width); }
  finally { await browser.close(); stopServer(); }
  note(`\n${scenes} مشهداً · ${findings.length} مخالفة`);
  const byScene = new Map<string, Finding[]>();
  for (const f of findings) byScene.set(f.scene, [...(byScene.get(f.scene) || []), f]);
  for (const [scene, list] of byScene) note(`  ${scene}: ${[...new Set(list.map(f => `${f.width}/${f.role}`))].join("، ")}`);
  process.exit(findings.length ? 1 : 0);
})().catch(error => { console.error(error); stopServer(); process.exit(2); });
