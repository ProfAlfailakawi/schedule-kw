/**
 * iPhone Duo — مصفوفة الوضعيات على WebKit (الكتاب المفتوح، والطاولة، والمطوي).
 *
 * يقيس على خادمٍ تجريبي قائم (DATA_MODE=demo) ولا يكتب شيئاً:
 *   - التمرير الأفقي للصفحة (scrollWidth − innerWidth).
 *   - الكعب: كلُّ نصٍّ أو عنصر تحكّم يقطع منطقة المنتصف (W/2 ± spine/2) حين
 *     يكون المقاس «شاشةً داخلية» (كتلة الكتاب في 55-duo-adaptive.css).
 *   - المقصوص: عنوانٌ أو زرٌّ يبرز عن الشاشة أو يقصّه أبٌ مقصوص.
 *   - أهداف اللمس الأصغر من 44px (عدداً، وأوّلها بالاسم).
 *   - عمودٌ ضيّق يكسر النصّ كلمةً في كل سطر.
 *
 *   DUO_BASE=http://127.0.0.1:5120 \
 *   NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *   node docs/iphone-duo-final/duo-book-audit.mjs [matrix|live|stress|dialogs|entry|tabs|all] [out.json]
 *
 * يحتاج playwright فيه WebKit. لا يثبّت متصفحاً ولا يمسّ بياناتٍ حقيقية.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { webkit } = require(process.env.PLAYWRIGHT || "playwright");
const BASE = process.env.DUO_BASE || "http://127.0.0.1:5120";
const MODE = process.argv[2] || "matrix";
const OUT = process.argv[3] || "";
const SHOTS = process.env.DUO_SHOTS || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export const POSES = {
  A: [[382, 580], [385, 571], [320, 568]],
  B: [[594, 368]],
  C: [[669, 867]],
  D: [[951, 585]],
  E: [[951, 350], [600, 350]],
  F: [[669, 520], [600, 480]],
  G: [[768, 1024], [1024, 768], [1280, 800], [1440, 900]],
  H: [[360, 640], [390, 844], [844, 390]],
  /* K: أطراف نطاق الدوو (طولي حتى 720، وعرضي حتى 1000) — يُشغَّل صراحةً: DUO_POSES=K */
  K: [[660, 800], [700, 900], [720, 900], [880, 585], [1000, 600]],
  /* P: مقاسات iPad (يجب ألا يظهر فيها كتابٌ ولا كعب؛ تُقاس ولا تُحتسب مخالفة كعب) */
  P: [[744, 1133], [768, 1024], [768, 920], [810, 990], [820, 1180], [834, 1112], [1024, 690], [1024, 768], [1133, 660], [1180, 735]],
  S: [[320, 350], [320, 600], [320, 900], [470, 350], [470, 600], [470, 900], [620, 350], [620, 600], [620, 900]],
};

const ROUTES = (process.env.DUO_ROUTES || [
  /* كل وجهةٍ في القائمة الجانبية (نفس قائمة scripts/mobile-overflow-sweep.ts) */
  "/Home/Index", "/FSchedule/Index", "/FSchedule/DepartmentSchedule", "/FSchedule/CopySchedule", "/Schedule/Intelligence",
  "/FSchedule/TimeMachine", "/FSchedule/Changes", "/FSchedule/InstructorRequests", "/FSchedule/StudentRegistration",
  "/FSchedule/PlanReview", "/FSchedule/Rehearsal", "/FSchedule/InstructorReport", "/FSchedule/RoomReport", "/FSchedule/TimeReport",
  "/FSchedule/RoomTimeReport", "/FSchedule/MainReport", "/FSchedule/MainScheduleReport", "/FSchedule/InstructorReportRPT",
  "/FSchedule/RoomReportRPT", "/FSchedule/TimeReportRPT", "/FSchedule/RoomTimeReportRPT", "/AdTerm/Index", "/AdCollege/Index",
  "/AdSection/Index", "/AdInstructor/Index", "/AdCourse/Index", "/SystemUser/Index", "/SystemUser/Seats", "/FormSecurity/Index",
  "/AdCollegeUserAssign/Index", "/System/AuditLog", "/System/Locations", "/System/LocationSetup", "/System/SectionHours",
  "/System/TeachingLoad", "/System/Backup", "/System/Audience", "/System/Ads", "/Public/Aboutus", "/no-such-page",
].join(",")).split(",");

/** يقيس في الصفحة. يُرسل نصاً لا دالة كي يبقى واحداً في كل محرك. */
const AUDIT = `(() => {
  const W = innerWidth, H = innerHeight, tol = 1;
  const css = getComputedStyle(document.documentElement);
  const spineW = parseFloat(css.getPropertyValue("--book-spine")) || 32;
  const book = matchMedia("screen and (min-width:721px) and (max-width:1000px) and (min-height:520px) and (max-height:960px) and (orientation:landscape)").matches;
  const s0 = W / 2 - spineW / 2 + 1, s1 = W / 2 + spineW / 2 - 1;
  const se = document.scrollingElement || document.documentElement;
  const label = el => {
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
    const t = (el.getAttribute("aria-label") || el.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 22);
    return el.tagName.toLowerCase() + id + cls + (t ? "«" + t + "»" : "");
  };
  const visible = el => { const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  /* المستطيل المرئي فعلاً: يُقصّ بكل أبٍ يقصّ أو يمرّر. */
  const visRect = el => {
    const r = el.getBoundingClientRect();
    let L = r.left, R = r.right, T = r.top, B = r.bottom;
    /* عنصرٌ ثابت (fixed) لا يقصّه أبٌ مقصوص: يُرسم على الشاشة نفسها. */
    if (getComputedStyle(el).position === "fixed") return { left: L, right: R, top: T, bottom: B, w: R - L, h: B - T, raw: r };
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) {
        const p = n.getBoundingClientRect();
        if (/hidden|clip|auto|scroll/.test(cs.overflowX)) { L = Math.max(L, p.left); R = Math.min(R, p.right); }
        if (/hidden|clip|auto|scroll/.test(cs.overflowY)) { T = Math.max(T, p.top); B = Math.min(B, p.bottom); }
      }
      if (cs.position === "fixed") break;
    }
    return { left: L, right: R, top: T, bottom: B, w: R - L, h: B - T, raw: r };
  };
  const INTERACTIVE = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=link],[role=checkbox],[role=switch],[role=menuitem]";
  const out = { book, W, H, doc: se.scrollWidth - W, spine: [], clipped: [], tap: 0, tapList: [], cramped: [] };
  const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (el.closest(".sr-only,.dna-sr,.visually-hidden,[aria-hidden=true],.no-screen")) continue;
    if (!visible(el)) continue;
    const isInt = el.matches(INTERACTIVE);
    const isText = hasOwnText(el) || /^(INPUT|SELECT|TEXTAREA|IMG|CANVAS|TD|TH)$/.test(el.tagName);
    if (!isInt && !isText) continue;
    const v = visRect(el);
    if (v.w <= 1 || v.h <= 1) continue;
    if (v.bottom < -2000 || v.top > se.scrollHeight + 2000) continue;
    if (book && v.raw.width < W * 0.9 && v.left < s1 && v.right > s0) out.spine.push(label(el) + " [" + Math.round(v.left) + "…" + Math.round(v.right) + "]");
    if (isInt) {
      const r = v.raw;
      const inlineLink = el.tagName === "A" && getComputedStyle(el).display === "inline";
      if (!inlineLink && !el.matches("input[type=checkbox],input[type=radio]") && (r.width < 44 - tol || r.height < 44 - tol)) { out.tap++; if (out.tapList.length < 8) out.tapList.push(label(el) + " " + Math.round(r.width) + "×" + Math.round(r.height)); }
    }
    if (el.matches("h1,h2,h3,button,input,select,label") && (v.raw.left < -tol || v.raw.right > W + tol || (v.w + 2 < v.raw.width && v.raw.width < W))) {
      /* داخل حاويةٍ تُمرَّر أفقياً عن قصد: ليس مقصوصاً، يُصل إليه بالتمرير. */
      let scroller = false;
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { if (/auto|scroll/.test(getComputedStyle(n).overflowX) && n.scrollWidth > n.clientWidth + 1) { scroller = true; break; } }
      if (!scroller) out.clipped.push(label(el) + " [" + Math.round(v.raw.left) + "…" + Math.round(v.raw.right) + " / مرئي " + Math.round(v.w) + "]");
    }
  }
  for (const el of document.body.querySelectorAll("p,span,b,strong,small,h1,h2,h3,h4,label,dt,dd,li,td,th,button,a")) {
    if (!visible(el) || el.closest(".sr-only,[aria-hidden=true]")) continue;
    const texts = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
    const text = texts.map(n => n.textContent).join(" ").trim();
    const words = text.split(/\\s+/).filter(w => w.length > 1);
    if (words.length < 3) continue;
    const tops = new Set();
    for (const n of texts) { const range = document.createRange(); range.selectNodeContents(n); for (const rr of range.getClientRects()) if (rr.width > 0) tops.add(Math.round(rr.top / 4)); }
    if (tops.size >= words.length && tops.size >= 3) out.cramped.push(label(el));
  }
  out.spine = [...new Set(out.spine)].slice(0, 12); out.clipped = out.clipped.slice(0, 10); out.cramped = out.cramped.slice(0, 8);
  return out;
})()`;

let demoSession = process.env.DUO_SESSION || "";
async function demoContext(browser, [width, height], extra = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, userAgent: UA,
    locale: "ar-KW", colorScheme: "light", reducedMotion: "reduce", ...extra,
  });
  await context.addInitScript(() => {
    const read = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) { return String(key).startsWith("schedule-onboarding") ? "done" : read.call(this, key); };
  });
  /* جلسةٌ تجريبية واحدة لكل التشغيل: الدخول التجريبي محدودُ المعدّل (429). الكعكة Secure،
     وWebKit لا يحفظها على http محلياً، فتُضاف يدوياً للمضيف نفسه. */
  if (!demoSession) {
    const login = await context.request.post(BASE + "/api/auth/demo", { data: {}, timeout: 180000 });
    if (!login.ok()) throw new Error("demo login " + login.status());
    demoSession = (String(login.headers()["set-cookie"] || "").match(/session_id=([^;]+)/) || [])[1] || "";
  }
  if (demoSession) await context.addCookies([{ name: "session_id", value: demoSession, url: BASE }]);
  for (let i = 0; i < 360; i++) { const s = await (await context.request.get(BASE + "/api/demo/seed-status")).json().catch(() => ({})); if (s.status === "ready") break; await sleep(500); }
  return context;
}

async function goto(page, route) {
  await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("main, .app-shell, .apex-login", { timeout: 60000, state: "attached" }).catch(() => undefined);
  await sleep(2200);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
}
const measure = (page) => page.evaluate(AUDIT);
const summary = (m) => `doc+${m.doc} spine ${m.spine.length} clipped ${m.clipped.length} tap<44 ${m.tap} cramped ${m.cramped.length}`;

async function matrix(browser, report) {
  const poses = (process.env.DUO_POSES || "A,B,C,D,E,F,G,H,S").split(",");
  for (const pose of poses) for (const size of POSES[pose]) {
    const context = await demoContext(browser, size);
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 120)));
    for (const route of ROUTES) {
      try {
        await goto(page, route);
        const m = await measure(page);
        report.matrix.push({ pose, size: size.join("x"), route, ...m });
        console.log(`${pose} ${size.join("x")} ${route} — ${summary(m)}`);
        for (const s of m.spine.slice(0, 4)) console.log("    ║ " + s);
        for (const s of m.clipped.slice(0, 3)) console.log("    ✂ " + s);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${pose}-${size.join("x")}${route.replace(/\//g, "_")}.jpg`), type: "jpeg", quality: 55 });
      } catch (error) { console.log(`⚠ ${pose} ${route}: ${String(error.message).split("\n")[0]}`); report.matrix.push({ pose, size: size.join("x"), route, error: String(error.message).split("\n")[0] }); }
    }
    report.pageErrors.push({ size: size.join("x"), errors });
    await context.close();
  }
}

/** الانتقال الحي على صفحةٍ واحدة بلا إعادة تحميل: النص المكتوب، والتحديد، والتمرير، والنافذة المفتوحة. */
async function live(browser, report) {
  const seq = [[951, 585], [669, 867], [470, 700], [382, 580], [594, 368], [951, 350], [951, 585]];
  const context = await demoContext(browser, seq[0]);
  const page = await context.newPage();
  await goto(page, "/FSchedule/MainReport");
  await page.evaluate(() => { window.__duoMark = "same-page"; });
  const field = page.locator("main input[type=search], main input[type=text], main input:not([type])").first();
  const typed = "تكنولوجيا";
  let hasField = false;
  if (await field.count()) { await field.fill(typed); hasField = true; }
  /* تحديدُ نصٍّ في العنوان، وتمرير الصفحة. */
  await page.evaluate(() => { window.scrollTo(0, 260); });
  const steps = [];
  for (const size of seq) {
    await page.setViewportSize({ width: size[0], height: size[1] });
    await sleep(900);
    const state = await page.evaluate(() => ({
      mark: window.__duoMark || null,
      path: location.pathname,
      value: (document.querySelector("main input[type=search], main input[type=text], main input:not([type])") || {}).value || null,
      scrollY: Math.round(window.scrollY),
      book: matchMedia("screen and (min-width:721px) and (max-width:1000px) and (min-height:520px) and (max-height:960px) and (orientation:landscape)").matches,
    }));
    const m = await measure(page);
    steps.push({ size: size.join("x"), ...state, doc: m.doc, spine: m.spine.length, clipped: m.clipped.length });
    console.log(`live ${size.join("x")} — mark=${state.mark} value=${state.value} scrollY=${state.scrollY} book=${state.book} ${summary(m)}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `I-live-${size.join("x")}.jpg`), type: "jpeg", quality: 55 });
  }
  /* نافذةٌ مفتوحة تبقى مفتوحة عبر الطيّ: البحث الشامل. */
  await page.setViewportSize({ width: 951, height: 585 });
  await sleep(500);
  await page.keyboard.press("Control+k").catch(() => undefined);
  await sleep(600);
  let dialog = await page.locator("[role=dialog]:visible").count();
  if (!dialog) { await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(x => x.offsetParent && /بحث شامل|فتح البحث الشامل/.test(x.innerText + (x.getAttribute("aria-label") || ""))); b?.click(); }); await sleep(700); dialog = await page.locator("[role=dialog]:visible").count(); }
  const dialogSteps = [];
  for (const size of [[669, 867], [382, 580], [951, 350], [951, 585]]) {
    await page.setViewportSize({ width: size[0], height: size[1] }); await sleep(700);
    const open = await page.locator("[role=dialog]:visible").count();
    const m = await measure(page);
    dialogSteps.push({ size: size.join("x"), open, spine: m.spine.length, doc: m.doc });
    console.log(`live dialog ${size.join("x")} — open=${open} ${summary(m)}`);
    for (const s of m.spine.slice(0, 4)) console.log("    ║ " + s);
  }
  report.live = { hasField, typed, steps, dialogOpenedAtStart: dialog, dialogSteps, mark: await page.evaluate(() => window.__duoMark || null) };
  await context.close();
}

/** إجهاد الإتاحة: نص 200%، داكن، لوحة مفاتيح (ارتفاع 350 مع حقلٍ مركَّز)، وحواف أمان غير متناظرة. */
async function stress(browser, report) {
  const cases = [
    { name: "text-200", size: [669, 867], css: "html{font-size:200%!important;-webkit-text-size-adjust:200%}" },
    { name: "text-200", size: [951, 585], css: "html{font-size:200%!important;-webkit-text-size-adjust:200%}" },
    { name: "text-200", size: [382, 580], css: "html{font-size:200%!important;-webkit-text-size-adjust:200%}" },
    { name: "dark", size: [669, 867], extra: { colorScheme: "dark" } },
    { name: "dark", size: [951, 585], extra: { colorScheme: "dark" } },
    { name: "keyboard", size: [951, 585], keyboard: [951, 350] },
    { name: "keyboard", size: [669, 867], keyboard: [669, 360] },
    { name: "safe-area-asym", size: [951, 585], css: "/* محاكاة: حشوة مقطع الكاميرا يساراً وشريط Safari أسفل */ .app-main{padding-left:max(var(--gutter),47px)!important} .sidebar{padding-right:20px!important}" },
  ];
  const routes = ["/Home/Index", "/FSchedule/Index", "/FSchedule/MainReport", "/AdCourse/Index"];
  for (const c of cases) {
    /* bypassCSP: سياسة المحتوى تمنع حقن ورقة الأنماط التجريبية (200% والحواف)؛ للقياس وحده. */
    const context = await demoContext(browser, c.size, { bypassCSP: true, ...(c.extra || {}) });
    const page = await context.newPage();
    for (const route of routes) {
      await goto(page, route);
      if (c.css) await page.addStyleTag({ content: c.css });
      if (c.keyboard) {
        const f = page.locator("main input:visible, main select:visible").first();
        if (await f.count()) await f.focus();
        await page.setViewportSize({ width: c.keyboard[0], height: c.keyboard[1] }); await sleep(700);
      }
      await sleep(400);
      const m = await measure(page);
      const focused = c.keyboard ? await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return "none"; const r = a.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 ? "in-view" : "off-view"; }) : undefined;
      report.stress.push({ case: c.name, size: c.size.join("x"), route, focused, ...m });
      console.log(`stress ${c.name} ${c.size.join("x")} ${route} — ${summary(m)}${focused ? " focus=" + focused : ""}`);
      for (const s of m.spine.slice(0, 3)) console.log("    ║ " + s);
      if (SHOTS && route === "/FSchedule/Index") await page.screenshot({ path: path.join(SHOTS, `J-${c.name}-${c.size.join("x")}.jpg`), type: "jpeg", quality: 55 });
      if (c.keyboard) await page.setViewportSize({ width: c.size[0], height: c.size[1] });
    }
    await context.close();
  }
}

/** النوافذ والأوراق والألسنة على كل وضعية: كلٌّ يُفتح من مكانه كما يفتحه المستخدم (المسارات نفسها في mobile-overflow-sweep.ts). */
async function dialogs(browser, report) {
  const clickText = (page, text) => page.evaluate((t) => { const re = t.startsWith("/") ? new RegExp(t.slice(1, -1)) : null; const b = [...document.querySelectorAll("button,a,[role=tab],summary")].find(x => x.offsetParent && (re ? re.test((x.innerText || x.getAttribute("aria-label") || "").trim()) : ((x.innerText || "").trim() === t || x.getAttribute("aria-label") === t || x.getAttribute("title") === t))); if (b) { b.scrollIntoView({ block: "center" }); b.click(); } return !!b; }, text);
  const js = (page, code) => page.evaluate(code);
  /* [مسار، خطوات، اسم]: كل خطوة نصُّ زرٍّ أو /تعبير/ أو js:… */
  const only = process.env.DUO_SCENES ? new RegExp(process.env.DUO_SCENES) : null;
  const scenes = [
    ["/FSchedule/Index", ["إضافة موعد"], "الجدول › موعد جديد"],
    ["/FSchedule/Index", ["js:document.querySelector('.agenda-card')?.click()"], "الجدول › تفاصيل موعد"],
    ["/FSchedule/Index", ["المزيد", "/أدوات البيانات/"], "الجدول › أدوات البيانات"],
    ["/FSchedule/Index", ["المزيد", "/أدوات البيانات/", "نشر", "نشر الجدول"], "الجدول › النشر"],
    ["/Home/Index", ["فتح البحث الشامل"], "البحث الشامل"],
    ["/Home/Index", ["js:document.querySelector('.notify-bell')?.click()"], "الإشعارات"],
    ["/Home/Index", ["/فريقي|الفريق/"], "فريقي"],
    ["/Home/Index", ["js:document.querySelector('.user-card-tools .trail-open')?.click()"], "الأثر"],
    ["/Schedule/Intelligence", ["js:document.querySelector('#insight-tab-rooms')?.click()", "js:document.querySelector('#insight-panel-rooms .intel-rank-list button')?.click()"], "مركز الذكاء › درج القاعة"],
    ["/AdTerm/Index", ["/^(إضافة|جديد|إنشاء|\\+)/"], "الفصول › نموذج"],
    ["/AdSection/Index", ["/^(إضافة|جديد|إنشاء|\\+)/"], "الأقسام › نموذج"],
    ["/AdInstructor/Index", ["/^(إضافة|جديد|إنشاء|\\+)/"], "الأساتذة › نموذج"],
    ["/AdCourse/Index", ["/^(إضافة|جديد|إنشاء|\\+)/"], "المقررات › نموذج"],
    ["/FSchedule/Changes", ["عدّل المواعيد"], "التغييرات › تعديل المواعيد"],
    ["/FSchedule/Changes", ["غيّر الموعد"], "التغييرات › تغيير موعد التسليم"],
    ["/FSchedule/InstructorRequests", ["js:document.querySelector('.inbox-row, .request-row, [data-request-id]')?.click()"], "صندوق الطلبات › طلب"],
    ["/FSchedule/MainReport", ["الأسبوع"], "مركز الاستعلام › الأسبوع"],
    ["/FSchedule/MainReport", ["الأساتذة"], "مركز الاستعلام › الأساتذة"],
    ["/FSchedule/MainReport", ["المزيد"], "مركز الاستعلام › المزيد"],
  ];
  const sizes = (process.env.DUO_DIALOG_SIZES || "669x867,951x585,382x580,594x368,951x350,600x350").split(",").map((s) => s.split("x").map(Number));
  for (const size of sizes) {
    const context = await demoContext(browser, size);
    const page = await context.newPage();
    for (const [route, steps, name] of scenes) {
      if (only && !only.test(name)) continue;
      /* الجرس يُسقط WebKit في وضع الأتمتة (طلب إذن الإشعارات)، فيُتخطّى إلا بطلبٍ صريح. */
      if (name === "الإشعارات" && !process.env.DUO_NOTIFY) continue;
      try {
        await goto(page, route);
        let ok = true;
        for (const st of steps) {
          if (st.startsWith("js:")) await js(page, st.slice(3));
          else ok = (await clickText(page, st)) && ok;
          if (name === "البحث الشامل" && !ok) { await page.keyboard.press("Control+k"); ok = true; }
          await sleep(1100);
        }
        const open = await page.locator("[role=dialog]:visible, [aria-modal=true]:visible, .catalog-form-drawer:visible, .transfer-sheet:visible, .share-sheet:visible, .intel-drawer:visible").count();
        const m = await measure(page);
        report.dialogs.push({ size: size.join("x"), scene: name, clicked: ok, open, ...m });
        console.log(`dialog ${size.join("x")} ${name} — clicked=${ok} open=${open} ${summary(m)}`);
        for (const s of m.spine.slice(0, 4)) console.log("    ║ " + s);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `dlg-${size.join("x")}-${name.replace(/[^\p{L}\p{N}]+/gu, "-")}.jpg`), type: "jpeg", quality: 55 });
        for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape"); await sleep(120); }
      } catch (error) { console.log(`⚠ dialog ${name}: ${String(error.message).split("\n")[0]}`); }
    }
    await context.close();
  }
}

/** كل لسانٍ في كل صفحةٍ ذات ألسنة، على 669×867 و951×585 و382×580: لا يوسّع أيٌّ منها الوثيقة.
 *  (انحدار «القاعات × الأوقات»: كانت الوثيقة +414px على 669 فيصغّر iOS الصفحة كلها.) */
async function tabs(browser, report) {
  const routes = (process.env.DUO_TAB_ROUTES || "/FSchedule/MainReport,/FSchedule/MainScheduleReport,/Schedule/Intelligence,/FSchedule/Changes,/FSchedule/StudentRegistration,/FSchedule/TimeMachine,/System/LocationSetup,/FSchedule/InstructorRequests,/FSchedule/InstructorReport,/FSchedule/RoomReport,/FSchedule/TimeReport,/FSchedule/RoomTimeReport").split(",");
  const SEL = "main [role=tab]";
  for (const size of [[669, 867], [951, 585], [382, 580]]) {
    const context = await demoContext(browser, size);
    const page = await context.newPage();
    for (const route of routes) {
      try {
        await goto(page, route);
        const labels = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((x) => x.offsetParent).map((x) => (x.innerText || x.getAttribute("aria-label") || "").trim()).filter(Boolean), SEL);
        for (const label of labels) {
          await page.evaluate(([sel, t]) => { const x = [...document.querySelectorAll(sel)].find((y) => y.offsetParent && (y.innerText || y.getAttribute("aria-label") || "").trim() === t); x?.click(); }, [SEL, label]);
          await sleep(1300);
          const m = await measure(page);
          report.tabs.push({ size: size.join("x"), route, tab: label, ...m });
          if (m.doc > 1 || m.spine.length) console.log(`✗ tab ${size.join("x")} ${route} «${label}» — ${summary(m)}`);
        }
        console.log(`tab ${size.join("x")} ${route} — ${labels.length} ألسنة`);
      } catch (error) { console.log(`⚠ tab ${route}: ${String(error.message).split("\n")[0]}`); }
    }
    await context.close();
  }
  const bad = report.tabs.filter((t) => t.doc > 1);
  console.log(`ألسنة ${report.tabs.length} · توسّع الوثيقة ${bad.length}`);
  if (bad.length) process.exitCode = 1;
}

/** شاشة الدخول (بلا جلسة) على كل الوضعيات. */
async function entry(browser, report) {
  for (const pose of Object.keys(POSES)) for (const size of POSES[pose]) {
    const context = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, hasTouch: true, userAgent: UA, locale: "ar-KW", reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      await goto(page, "/");
      const m = await measure(page);
      report.entry.push({ pose, size: size.join("x"), route: "/ (الدخول)", ...m });
      console.log(`entry ${pose} ${size.join("x")} — ${summary(m)}`);
      for (const s of m.spine.slice(0, 4)) console.log("    ║ " + s);
      if (SHOTS && /^(C|D|E)$/.test(pose)) await page.screenshot({ path: path.join(SHOTS, `entry-${pose}-${size.join("x")}.jpg`), type: "jpeg", quality: 55 });
    } catch (error) { console.log(`⚠ entry ${size.join("x")}: ${String(error.message).split("\n")[0]}`); }
    await context.close();
  }
}

(async () => {
  const browser = await webkit.launch();
  const report = { base: BASE, engine: "webkit " + browser.version(), when: new Date().toISOString(), mode: MODE, matrix: [], live: null, stress: [], dialogs: [], entry: [], tabs: [], pageErrors: [] };
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  try {
    if (MODE === "matrix" || MODE === "all") await matrix(browser, report);
    if (MODE === "live" || MODE === "all") await live(browser, report);
    if (MODE === "stress" || MODE === "all") await stress(browser, report);
    if (MODE === "dialogs" || MODE === "all") await dialogs(browser, report);
    if (MODE === "entry" || MODE === "all") await entry(browser, report);
    if (MODE === "tabs" || MODE === "all") await tabs(browser, report);
  } finally { await browser.close(); }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  const book = report.matrix.filter((r) => r.book);
  console.log(`\nمشاهد ${report.matrix.length} · تمرير أفقي ${report.matrix.filter((r) => r.doc > 1).length} · كعب ${book.filter((r) => r.spine.length).length}/${book.length} · مقصوص ${report.matrix.filter((r) => r.clipped?.length).length}`);
})().catch((error) => { console.error(error); process.exit(2); });
