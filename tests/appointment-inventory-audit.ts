/**
 * جردُ ضوابط محرّر «موعد جديد / تعديل موعد» (إعادة التصميم البصرية W8).
 *
 * الغاية: لا يضيع أي ضابطٍ تفاعلي. `tests/fixtures/appointment-controls-baseline.json` لقطةٌ للمحرّر القديم
 * (كل زرٍّ وحقلٍ وقائمةٍ ورابط: اسمه الظاهر، وسم data-guide-*، والحالة التي يظهر فيها). هذا الاختبار:
 *   1. ساكن: كلُّ اسمٍ ثابتٍ في اللقطة ما زال موجوداً في مصدر المكوّنات.
 *   2. حيّ (يُتخطّى بوضوح إن تعذّر تشغيل خادم تجربة): يقود المتصفح إلى الحالات نفسها ويتأكد أن كل ضابطٍ
 *      في اللقطة ما زال موجوداً ويمكن بلوغه بتفاعلٍ واحدٍ أو اثنين (فتحُ قائمة = تفاعل).
 * إعادة توليد اللقطة (لا تُنفَّذ إلا على المحرّر القديم): npx tsx tests/appointment-inventory-audit.ts --capture
 * إضافة حالة التعديل وحدها (على المحرّر القديم): INV_BASE=http://127.0.0.1:PORT npx tsx tests/appointment-inventory-audit.ts --capture-edit
 * المنفذ: INV_BASE أو 4540 (يُشغَّل خادمٌ مؤقت إن لم يكن حيّاً).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

/* playwright لا يدخل package.json (قاعدة المستودع): يُحمَّل من التثبيت العام إن وُجد، وإلا يُتخطّى الجزء الحيّ. */
type Page = any;
let chromium: any = null;
try { chromium = createRequire(import.meta.url)(createRequire(import.meta.url).resolve("playwright", { paths: [process.cwd(), "/opt/node22/lib/node_modules", "/usr/lib/node_modules", "/usr/local/lib/node_modules"] })).chromium; } catch { chromium = null; }

const BASE = process.env.INV_BASE || "http://127.0.0.1:4540";
const FIXTURE = path.join("tests", "fixtures", "appointment-controls-baseline.json");
const CAPTURE = process.argv.includes("--capture");
/* --capture-edit: يضيف حالة «edit-mode» وحدها إلى اللقطة القائمة (على المحرّر القديم) دون المساس بسائر الحالات. */
const CAPTURE_EDIT = process.argv.includes("--capture-edit");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 800)); }
};

type Control = { name: string; kind: string; guide: string };
type Baseline = Record<string, Control[]>;

/* يُنفَّذ داخل الصفحة: كل ضابطٍ تفاعلي مرئي داخل المحرّر (أو حاويات الحوار والدرج الملحقة به). */
const COLLECT = `(() => {
  const root = document.querySelector('.schedule-editor') || document.body;
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const nameOf = e => {
    const a = e.getAttribute('aria-label'); if (a) return a.trim();
    if (e.id) { const l = document.querySelector('label[for="' + e.id + '"]'); if (l) return l.textContent.trim().replace(/\\s+/g, ' '); }
    const wrap = e.closest('label'); if (wrap && e.tagName !== 'BUTTON') return wrap.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40);
    const t = (e.textContent || '').trim().replace(/\\s+/g, ' ');
    if (t) return t.slice(0, 40);
    return (e.getAttribute('title') || e.getAttribute('placeholder') || e.getAttribute('name') || '').trim();
  };
  const sel = 'button, input, select, textarea, a[href], [role=button], [role=menuitem], [role=switch], [role=tab], [role=combobox]';
  const out = []; const seen = new Set();
  for (const e of root.querySelectorAll(sel)) {
    if (!vis(e)) continue;
    const kind = e.tagName.toLowerCase() + (e.type && e.tagName === 'INPUT' ? ':' + e.type : '');
    const guide = [...e.attributes].filter(x => x.name.startsWith('data-guide')).map(x => x.name + '=' + x.value).join(' ').slice(0, 120);
    const name = nameOf(e); if (!name && !guide) continue;
    /* أسماء المحتوى المتغيّر (أسماء المقررات والأساتذة والقاعات والأرقام) لا تُجرد. */
    const key = kind + '|' + name + '|' + guide; if (seen.has(key)) continue; seen.add(key);
    out.push({ name, kind, guide });
  }
  return out;
})()`;

async function serverUp() { try { return (await fetch(BASE + "/api/demo/config")).ok; } catch { return false; } }
let child: ChildProcess | null = null;
let priv = "";
function stop() { if (!child?.pid) return; try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } if (priv) fs.rmSync(priv, { recursive: true, force: true }); }
async function ensureServer(): Promise<boolean> {
  if (await serverUp()) return true;
  const port = new URL(BASE).port || "4540";
  priv = fs.mkdtempSync(path.join(os.tmpdir(), "inv-priv-"));
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: port, SCHEDULE_PRIVATE_DIR: priv }, stdio: "ignore", detached: true });
  for (let i = 0; i < 90; i++) { if (await serverUp()) return true; await sleep(1000); }
  return false;
}

async function openEditor(browser: any, width: number) {
  const c = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, locale: "ar-KW", hasTouch: width < 500, isMobile: width < 500 });
  if (!(await c.request.post(BASE + "/api/auth/demo", { data: {} })).ok()) throw new Error("login");
  for (let i = 0; i < 360; i++) { const s = await (await c.request.get(BASE + "/api/demo/seed-status")).json().catch(() => ({})); if (s.status === "ready") break; await sleep(500); }
  if (!(await c.request.post(BASE + "/api/demo/role", { data: { role: "admin" } })).ok()) throw new Error("role");
  const p = await c.newPage();
  await p.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" }); await sleep(2500);
  await p.keyboard.press("Escape").catch(() => {});
  const skip = p.locator(".ob-root .ob-skip").first();
  if (await skip.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) await skip.click().catch(() => {});
  return p;
}
async function newAppointment(p: Page) {
  await p.locator('button:has-text("إضافة موعد")').first().click();
  await p.waitForSelector(".appt-layout"); await sleep(700);
}
/* اسمٌ مستقر: الأرقام والأزمنة `#`، وأيام «ضع الموعد» تُدمج، ويُقصّ الاسم — فلا تكسر الاختبارَ بياناتُ العرض ولا صياغةُ التسمية الفرعية. */
const norm = (name: string) => name.replace(/[0-9٠-٩]+(:[0-9]+)?/g, "#").replace(/(ضع الموعد)\s*\S+\s.*/, "$1").replace(/^(نبض الطلبة).*/, "$1").replace(/^(أحد|اثنين|ثلاثاء|أربعاء|خميس)[·\s].*/, "نمط الأيام").replace(/\s+/g, " ").trim().slice(0, 14);
const collect = async (p: Page): Promise<Control[]> => {
  const raw = await p.evaluate(COLLECT) as Control[];
  const seen = new Set<string>(); const out: Control[] = [];
  for (const c of raw) { const n = norm(c.name); const k = c.kind + "|" + n; if (!n || seen.has(k)) continue; seen.add(k); out.push({ name: n, kind: c.kind, guide: c.guide.replace(/=.*$/, "") }); }
  return out;
};
async function fillCourseTeacher(p: Page) {
  await p.locator(".appt-step").first().locator("button, input").first().click(); await sleep(400);
  await p.keyboard.type("تص"); await sleep(700);
  await p.locator("[role=option]").first().click(); await sleep(1200);
  await p.locator(".instructor-trigger").click(); await sleep(700);
  await p.locator("[role=option], .instructor-option").nth(2).click(); await sleep(1800);
}
async function typeStart(p: Page, v: string) {
  const start = p.locator(".time-field").nth(0);
  await start.click(); await p.keyboard.press("Control+A"); await p.keyboard.type(v); await p.keyboard.press("Tab"); await sleep(1600);
}

/* يقود المحرّر عبر الحالات ويستدعي `visit(state)` عند كلٍّ منها. */
async function drive(p: Page, visit: (state: string) => Promise<void>) {
  await newAppointment(p);
  await visit("empty");
  await fillCourseTeacher(p);
  await visit("course-teacher");
  await p.locator(".day-pills label").nth(0).click(); await sleep(900);
  const start = p.locator(".time-field").nth(0);
  await start.click(); await p.keyboard.type("14"); await p.keyboard.press("Enter"); await sleep(1500);
  await visit("days-time");
  await typeStart(p, "1000");
  await p.locator(".time-field").nth(1).click().catch(() => {}); await p.keyboard.press("Control+A"); await p.keyboard.type("1120"); await p.keyboard.press("Tab"); await sleep(1500);
  await visit("off-pattern");
  await typeStart(p, "830");
  await visit("teacher-conflict");
  await typeStart(p, "12");
  const place = p.locator("[data-appt-step=place]"); await place.scrollIntoViewIfNeeded().catch(() => {}); await sleep(400);
  await place.locator('button:has-text("اقترح قاعة متاحة"), button:has-text("اقترح لي وقتاً وقاعة")').first().click().catch(() => {}); await sleep(2500);
  await visit("room-suggestions");
  const card = place.locator('button:has-text("901A01/S01")').first();
  if (await card.count()) { await card.click(); await sleep(1800); }
  await visit("ready");
  await p.locator(".appt-status-more, .appt-status button, .appt-status").first().click().catch(() => {}); await sleep(900);
  await visit("checks-open");
  await p.keyboard.press("Escape"); await sleep(400);
}

/* وضع التعديل: موعدٌ قائم من قائمة الجدول بزرّ «تعديل» المرئي في صفّه (لا يغيّر شيئاً). */
async function openExistingEdit(p: Page, base: string): Promise<boolean> {
  await p.goto(base + "/FSchedule/Index", { waitUntil: "domcontentloaded" }); await sleep(2500);
  await p.keyboard.press("Escape").catch(() => {});
  const edit = p.locator("button.icon-action-edit:visible, button[aria-label=\"تعديل\"]:visible").first();
  if (!(await edit.count())) return false;
  await edit.click().catch(() => {}); await sleep(2000);
  return (await p.locator(".appt-layout").count()) > 0;
}

function sourceText() {
  const files = fs.readdirSync("src/components").filter(f => f.endsWith(".tsx")).map(f => path.join("src/components", f));
  return files.map(f => fs.readFileSync(f, "utf8")).join("\n");
}

async function main() {
  const watchdog = setTimeout(() => { console.log("\x1b[31m✗ watchdog: live inventory exceeded 360s\x1b[0m"); stop(); process.exit(1); }, 360_000); watchdog.unref();
  if (!CAPTURE && !CAPTURE_EDIT) {
    const base: Baseline = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    const src = sourceText();
    /* 1. ساكن: الأسماء الثابتة (قصيرة، عربية، لا أرقام) موجودة في المصدر. */
    const names = new Set<string>();
    for (const list of Object.values(base)) for (const c of list) if (c.name && /^[؀-ۿ «»؟،\s]+$/.test(c.name) && c.name.length >= 2) names.add(c.name);
    const missing = [...names].filter(n => !src.includes(n.replace(/\s+/g, " ")) && !src.includes(n.split(" ")[0]));
    check(names.size > 20 && !missing.length, `static: ${names.size} control labels from the baseline still exist in the sources`, missing);
    /* 2. حيّ. */
    if (!chromium || !(await ensureServer())) { console.log("SKIP: no playwright / demo server could be started — live inventory skipped"); stop(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); }
    const browser = await chromium.launch();
    try {
      const p = await openEditor(browser, 1440);
      const lost: any[] = [], deep: any[] = [];
      const visit = async (state: string) => {
        console.log("state:", state);
        /* أسبوع الأستاذ (خلاياه وأزرار الالتصاق وإغلاقه) يتغيّر بالبيانات والتخطيط ويملكه عاملٌ آخر؛ والدرج المفتوح يحجب ما خلفه فيُتحقق من ضوابط الصفحة في حالة «ready». */
        const gridish = (c: Control) => /^(ضع الموعد|بعدها|قبلها|إغلاق جدول الأ)/.test(c.name);
        const readyNames = new Set((base["ready"] || []).map(c => c.kind + "|" + c.name));
        const want = (base[state] || []).map(c => ({ ...c, name: norm(c.name) })).filter(c => !gridish(c) && !(state === "checks-open" && readyNames.has(c.kind + "|" + c.name)) && !(state === "checks-open" && c.name === "نبض الطلبة")) /* بطاقةُ نبض الطلبة انتقل زرُّها إلى «مساعدات» (قرار المالك 2026-11-15) ويُفحص وصولُه في حالات ready وdays-time؛ ولا يُنقر تحت لوحة الفحص المفتوحة */;
        const have = await collect(p);
        const has = (list: Control[], c: Control) => list.some(h => h.name === c.name && h.kind === c.kind);
        const missing = want.filter(c => !has(have, c));
        if (!missing.length) return;
        /* تفاعلٌ واحد: افتح كل قائمةٍ/قسمٍ مطويّ مرةً وجمّع ما ظهر، ثم قارن (الدرج المفتوح يُحسب تفاعلاً ثانياً). */
        const union: Control[] = [];
        const menus = p.locator(".schedule-editor .appt-helpers-menu, .schedule-editor .regulation-chips-more");
        const rest = p.locator('.schedule-editor [aria-expanded="false"]:not(.appt-status):not(.appt-helpers-menu):not(.regulation-chips-more), .schedule-editor [aria-haspopup]:not(.appt-helpers-menu)');
        const nm = await menus.count(), nr = Math.min(await rest.count(), 8);
        for (let i = 0; i < nm + nr; i++) {
          const t = i < nm ? menus.nth(i) : rest.nth(i - nm);
          if (!(await t.isVisible({ timeout: 500 } as any).catch(() => false))) continue;
          await t.click({ timeout: 800 }).catch(() => {}); await sleep(200);
          union.push(...await collect(p));
          if ((await t.getAttribute("aria-expanded", { timeout: 500 }).catch(() => null)) === "true") await t.click({ timeout: 800 }).catch(() => {});
        }
        for (const c of missing) (has(union, c) ? deep : lost).push({ state, ...c });
      };
      await drive(p, visit);
      /* وضع التعديل (بعد أن فُقد سابقاً من الجرد): موعدٌ قائم يُفتح بزرّ «تعديل» في صفّه. */
      if (base["edit-mode"]) { const opened = await openExistingEdit(p, BASE); check(opened, "live: edit mode opens from an existing row"); if (opened) await visit("edit-mode"); }
      console.log("reachable only via a menu/disclosure:", deep.length);
      check(!lost.length, "live: every baseline control is still reachable in its state (<= 2 interactions)", lost);
    } finally { await browser.close(); stop(); }
  } else if (CAPTURE_EDIT) {
    if (!(await ensureServer())) throw new Error("no server");
    const browser = await chromium.launch();
    const merged: Baseline = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    try {
      const p = await openEditor(browser, 1440);
      if (!(await openExistingEdit(p, BASE))) throw new Error("edit mode did not open");
      merged["edit-mode"] = await collect(p);
    } finally { await browser.close(); stop(); }
    fs.writeFileSync(FIXTURE, JSON.stringify(merged, null, 1) + "\n");
    console.log("edit-mode added:", merged["edit-mode"].length, "controls; states kept:", Object.keys(merged).join(","));
    return;
  } else {
    if (!(await ensureServer())) throw new Error("no server");
    const browser = await chromium.launch();
    const out: Baseline = {};
    try {
      const p = await openEditor(browser, 1440);
      await drive(p, async state => { out[state] = await collect(p); });
      if (await openExistingEdit(p, BASE)) out["edit-mode"] = await collect(p);
    } finally { await browser.close(); stop(); }
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, JSON.stringify(out, null, 1) + "\n");
    console.log("baseline written:", Object.entries(out).map(([k, v]) => `${k}=${v.length}`).join(" "));
    return;
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { stop(); console.error(e); process.exit(1); });
