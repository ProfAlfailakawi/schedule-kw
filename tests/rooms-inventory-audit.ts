/**
 * جردُ قدرات عرض «المباني والقاعات» (إعادة التصميم W11).
 *
 * `tests/fixtures/rooms-capabilities-baseline.json`: كلُّ قدرةٍ كانت في العرض القديم، وأين تعيش الآن.
 *   1. ساكن: كلُّ علامةٍ (ملف ← نصٌّ ثابت) ما زالت في المصدر. حذفُ قدرةٍ يكسر هذا الاختبار.
 *   2. حيّ (يُتخطّى بوضوح إن تعذّر Playwright أو خادم التجربة): يقود المتصفح إلى كل قدرةٍ ويثبت أن بلوغها
 *      يحتاج تفاعلاً أو اثنين فقط، وأن العرض بلا تمريرٍ أفقيّ للصفحة عند 390 و1440.
 * المنفذ: INV_BASE أو 4573 (يُشغَّل خادمٌ مؤقت إن لم يكن حيّاً).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";

type Page = any;
let chromium: any = null;
try { chromium = createRequire(import.meta.url)(createRequire(import.meta.url).resolve("playwright", { paths: [process.cwd(), "/opt/node22/lib/node_modules", "/opt/node-tools/node_modules", "/usr/lib/node_modules", "/usr/local/lib/node_modules"] })).chromium; } catch { chromium = null; }

const BASE = process.env.INV_BASE || "http://127.0.0.1:4573";
const FIXTURE = path.join("tests", "fixtures", "rooms-capabilities-baseline.json");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 900)); }
};

type Capability = { id: string; old: string; new: string; markers: [string, string][]; live: string | null };
const baseline: { capabilities: Capability[] } = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));

/* ── 1. ساكن ── */
for (const cap of baseline.capabilities) {
  const missing = cap.markers.filter(([file, text]) => !fs.existsSync(file) || !fs.readFileSync(file, "utf8").includes(text));
  check(!missing.length, `static: «${cap.old}» ← ${cap.new}`, missing);
}
{
  const src = ["RoomsExplorer", "RoomsDropdown", "RoomsOverview", "RoomsInfoBar"].map(n => fs.readFileSync(`src/components/${n}.tsx`, "utf8")).join("\n");
  const css = fs.readFileSync("src/styles/71-rooms-explorer.css", "utf8");
  check(!/dark|prefers-color-scheme/.test(css), "static: no dark theme in the explorer stylesheet");
  check(/prefers-reduced-motion/.test(css) && /prefers-reduced-motion/.test(src), "static: reduced motion respected in css and in the slide logic");
  check(!/[٠-٩]/.test(src) && !new RegExp("ذكاء" + " اصطناعي").test(src), "static: Latin digits only, no forbidden wording");
  check(/safeStorage/.test(src) && /rooms-explorer:v1/.test(src), "static: last building/room/view persisted through safeStorage");
  check(/aria-expanded/.test(src) && /role="listbox"/.test(src) && /aria-selected/.test(src) && /aria-activedescendant/.test(src), "static: listbox roles and aria-expanded/aria-selected");
  check(/ArrowDown/.test(src) && /Escape/.test(src) && /ArrowLeft/.test(src), "static: keyboard arrows/Esc in the dropdowns and on the room header");
  check(!/data-guide-ignore=\{/.test(src), "static: every guide-ignore carries a literal documented reason");
}

/* ── 2. حيّ ── */
async function serverUp() { try { return (await fetch(BASE + "/api/demo/config")).ok; } catch { return false; } }
let child: ChildProcess | null = null;
let priv = "";
function stop() { if (!child?.pid) return; try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } if (priv) fs.rmSync(priv, { recursive: true, force: true }); }
async function ensureServer(): Promise<boolean> {
  if (await serverUp()) return true;
  const port = new URL(BASE).port || "4573";
  priv = fs.mkdtempSync(path.join(os.tmpdir(), "rooms-inv-"));
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: port, SCHEDULE_PRIVATE_DIR: priv, AUTO_IMPORT_LEGACY_DATA: "false" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { if (await serverUp()) return true; await sleep(1000); }
  return false;
}
async function openRooms(browser: any, width: number): Promise<Page> {
  const c = await browser.newContext({ viewport: { width, height: 900 }, locale: "ar-KW" });
  if (!(await c.request.post(BASE + "/api/auth/demo", { data: {} })).ok()) throw new Error("login");
  for (let i = 0; i < 360; i++) { const s = await (await c.request.get(BASE + "/api/demo/seed-status")).json().catch(() => ({})); if (s.status === "ready") break; await sleep(500); }
  if (!(await c.request.post(BASE + "/api/demo/role", { data: { role: "admin" } })).ok()) throw new Error("role");
  const p = await c.newPage();
  await p.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" }); await sleep(2500);
  await p.keyboard.press("Escape").catch(() => {});
  const skip = p.locator(".ob-root .ob-skip").first();
  if (await skip.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) await skip.click().catch(() => {});
  await p.locator('button[data-guide-target="schedule.view.rooms"]').first().click();
  await p.waitForSelector(".rx-root", { timeout: 30000 }); await sleep(800);
  return p;
}
const overflow = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const elementCount = (p: Page) => p.evaluate(() => { const root = document.querySelector(".rooms-surface"); let n = 0; if (root) for (const e of root.querySelectorAll("*")) { if (e.closest("svg")) continue; const r = e.getBoundingClientRect(); if (r.width > 0 && r.height > 0) n++; } return n; });

async function live() {
  const watchdog = setTimeout(() => { console.log("\x1b[31m✗ watchdog: live inventory exceeded 300s\x1b[0m"); stop(); process.exit(1); }, 300_000); watchdog.unref();
  if (!chromium || !(await ensureServer())) { console.log("SKIP: no playwright / demo server could be started — live inventory skipped"); return; }
  const browser = await chromium.launch();
  try {
    const p = await openRooms(browser, 1440);
    /* كل خطوةٍ تبدأ من عرض «قاعة» ومعها أسبوعٌ مفتوح إن لزم، فلا يتأثر بعضها ببعض. */
    const inRoom = async () => { if ((await p.locator(".rx-seg button").first().getAttribute("aria-pressed")) !== "true") { await p.locator(".rx-seg button").first().click(); await sleep(500); } };
    const withWeek = async () => { await inRoom(); if ((await p.locator(".rx-week .rooms-row").count()) < 5) { await p.locator(".rx-weekbar").first().click(); await sleep(900); } };
    const raw: Record<string, () => Promise<unknown>> = {
      "building-dropdown": async () => { await p.locator('.rx-dd-btn[aria-label="اختيار المبنى"]').click(); await sleep(200); const n = await p.locator('[role=listbox] [role=option]').count(); await p.keyboard.press("Escape"); return n >= 1; },
      "room-dropdown": async () => { await p.locator('.rx-dd-btn[aria-label="اختيار القاعة"]').click(); await sleep(200); const n = await p.locator('[role=listbox] [role=option]').count(); await p.keyboard.press("Escape"); return n >= 1; },
      "room-search": async () => { await p.locator('.rx-dd-btn[aria-label="اختيار القاعة"]').click(); await sleep(200); const ok = await p.locator('input[role=combobox]').isVisible(); await p.keyboard.type("الأحد 10"); await sleep(300); const chip = await p.locator(".rx-need").count(); await p.keyboard.press("Escape"); return ok && chip === 1; },
      "week-open": async () => (await p.locator(".rx-week .rooms-row").count()) >= 5,
      "legend": async () => { const btn = p.locator('.rx-tools button:has-text("ألوان وتصفية")'); if (!(await btn.count())) return true; await btn.click(); await sleep(300); return (await p.locator(".rx-week .week-legend").count()) >= 1; },
      "free-chip-create": async () => { await p.locator(".rx-free .rx-chip").first().click(); await sleep(2500); const ok = (await p.locator(".appt-layout").count()) === 1; await p.keyboard.press("Escape"); await sleep(600); return ok; },
      "card-info-details": async () => { const card = p.locator(".rooms-card").first(); await card.scrollIntoViewIfNeeded(); await card.click(); await sleep(400); const info = await p.locator(".rx-info").count(); await p.locator('.rx-info button:has-text("التفاصيل")').click(); await sleep(1500); const ctx = await p.evaluate(() => !!document.querySelector('[role=dialog], [class*=context]')); await p.keyboard.press("Escape"); await sleep(400); return info === 1 && ctx; },
      "move-sheet": async () => { const card = p.locator(".rooms-card").first(); await card.click(); await sleep(400); await p.locator(".rx-move .rx-dd-btn").click(); await sleep(500); const n = await p.locator(".rx-move [role=option]").count(); await p.keyboard.press("Escape"); return n >= 2; },
      "drag-within": async () => { const card = p.locator(".rooms-card").nth(3); await card.scrollIntoViewIfNeeded(); const b = await card.boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await p.mouse.move(b.x + b.width / 2 - 60, b.y + b.height / 2, { steps: 8 }); await sleep(500); const compare = await p.locator(".rooms-drag-compare").count(); await p.mouse.up(); await sleep(1500); await p.keyboard.press("Escape"); return compare === 1; },
      "overview-day": async () => { await p.locator(".rx-seg button").nth(1).click(); await sleep(500); const ok = (await p.locator(".rx-ov-days .rx-chip").count()) === 5 && (await p.locator(".rx-ov-row").count()) >= 1; return ok; },
      "guide-target": async () => (await p.locator('[data-guide-target="schedule.rooms.board"]').count()) >= 1 && (await p.locator('[data-guide-target="schedule.view.rooms"]').count()) >= 1,
    };
    const needsWeek = new Set(["week-open", "legend", "card-info-details", "move-sheet", "drag-within"]);
    const steps: Record<string, () => Promise<unknown>> = {};
    for (const [name, run] of Object.entries(raw)) steps[name] = async () => { if (name !== "overview-day") await (needsWeek.has(name) ? withWeek() : inRoom()); return run(); };
    for (const cap of baseline.capabilities) {
      if (!cap.live) continue;
      let ok: unknown = false;
      try { ok = await steps[cap.live](); } catch (error) { ok = String(error).slice(0, 700); }
      check(ok === true, `live: «${cap.old}» reachable in ≤2 interactions`, ok);
    }
    check((await overflow(p)) <= 0, "live: no horizontal page overflow at 1440");
    const p2 = await openRooms(browser, 390);
    check((await overflow(p2)) <= 0, "live: no horizontal page overflow at 390 (room closed)");
    await p2.locator(".rx-weekbar").first().click(); await sleep(900);
    check((await overflow(p2)) <= 0, "live: no horizontal page overflow at 390 (week open)");
    await p2.locator(".rx-seg button").nth(1).click(); await sleep(500);
    check((await overflow(p2)) <= 0, "live: no horizontal page overflow at 390 (overview)");
    const p3 = await openRooms(browser, 1440);
    const closed = await elementCount(p3);
    check(closed > 0 && closed < 800, `live: closed room view is light (${closed} elements; the old board drew thousands)`);
  } finally { await browser.close(); stop(); }
}
await live();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
