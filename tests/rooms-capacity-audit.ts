/**
 * سعةُ القاعة ونوعها في مستكشف القاعات.
 *   1. نقيّ: cleanCapacity / roomFactsText / roomFactsByKey / roomMatchesNeed (المعلوم المخالف يُسقط، المجهول يبقى موسوماً، لا صفرَ ولا رقمَ مخترع).
 *   2. ساكن: المصدر هو /api/location-registry الموجود (لا طلبَ لكل قاعة، ولا مسارٌ جديد).
 *   3. حيّ على التجربة (منفذ CAP_BASE أو 4591): عناصر القائمة تعرض «N مقعداً · مختبر» حين تُعرف، والشريحة والتصفية تعملان.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { cleanCapacity, isLabRoomType, roomFactsByKey, roomFactsText, roomMatchesNeed } from "../src/utils/roomFacts";
import { parseRoomQuery } from "../src/utils/roomQuery";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 700)); }
};

/* ── 1. نقيّ ── */
check(cleanCapacity(40) === 40 && cleanCapacity("40") === 40, "capacity: positive numbers pass");
check([0, -3, NaN, null, undefined, "", "abc"].every(v => cleanCapacity(v) === null), "capacity: 0/negative/NaN/empty are unknown, never 0");
check(roomFactsText({ capacity: 40, roomType: "مختبر حاسب" }) === "40 مقعداً · مختبر", "text: «40 مقعداً · مختبر»");
check(roomFactsText({ capacity: 40, roomType: "قاعة تدريس" }) === "40 مقعداً", "text: classroom shows capacity only");
check(roomFactsText({ capacity: null, roomType: "lab" }) === "مختبر", "text: unknown capacity silently omitted");
check(roomFactsText({ capacity: 0 }) === "" && roomFactsText({}) === "" && roomFactsText(null) === "", "text: nothing known = empty (no 0, no invented number)");
check(!/\b0\b|لا مقاعد/.test(roomFactsText({ capacity: 0, roomType: "x" })), "text: never prints 0");
check(isLabRoomType("مختبر") && isLabRoomType("معمل لغات") && isLabRoomType("Computer Lab") && !isLabRoomType("قاعة تدريس") && !isLabRoomType(undefined), "lab detection");

const registry = {
  buildings: [{ id: "b1", officialCode: "901A01" }],
  rooms: [
    { id: "r1", buildingId: "b1", canonicalCode: "104", capacity: 50, roomType: "قاعة تدريس", sectionRoomTypes: { "7": "مختبر" } },
    { id: "r2", buildingId: "b1", canonicalCode: "105", capacity: 0 },
    { id: "r3", buildingId: "nope", canonicalCode: "106", capacity: 30 },
  ],
};
const keyOf = (b: string, h: string) => `${b}|${h}`.toLowerCase();
const facts = roomFactsByKey(registry, keyOf, 0);
check(facts.get("901a01|104")?.capacity === 50 && facts.get("901a01|104")?.roomType === "قاعة تدريس", "registry: general type for no section");
check(roomFactsByKey(registry, keyOf, 7).get("901a01|104")?.roomType === "مختبر", "registry: section-specific type wins");
check(facts.get("901a01|105")?.capacity === null && !facts.has("901a01|106"), "registry: zero capacity unknown; orphan room skipped");
check(roomFactsByKey(null, keyOf, 0).size === 0 && roomFactsByKey({ rooms: "x" }, keyOf, 0).size === 0, "registry: bad payload tolerated");

const q = parseRoomQuery;
const big = { capacity: 80, roomType: "قاعة" }, small = { capacity: 20, roomType: "قاعة" }, lab = { capacity: 30, roomType: "مختبر" }, none = {};
check(roomMatchesNeed(big, [], q("40 مقعد")).match && !roomMatchesNeed(small, [], q("40 مقعد")).match, "need: known small room removed, big kept");
const unknownCap = roomMatchesNeed(none, [], q("40 مقعد"));
check(unknownCap.match && unknownCap.capacityUnknown, "need: unknown capacity kept and flagged");
check(roomMatchesNeed(lab, [], q("مختبر")).match && !roomMatchesNeed(big, [], q("مختبر")).match, "need: lab filter removes known non-lab");
const unknownType = roomMatchesNeed({ capacity: 60 }, [], q("مختبر"));
check(unknownType.match && unknownType.typeUnknown && !unknownType.capacityUnknown, "need: unknown type kept and flagged");
check(!roomMatchesNeed(lab, [], q("40 مقعد مختبر")).match && roomMatchesNeed({ capacity: 45, roomType: "lab" }, [], q("40 مقعد مختبر")).match, "need: capacity and lab combine");
const busy = [{ fmonday: true, fstarttime: "09:00", fendtime: "10:30" }];
check(!roomMatchesNeed(big, busy, q("40 مقعد الاثنين 10")).match && roomMatchesNeed(big, busy, q("40 مقعد الاثنين 11")).match, "need: day/time still applied with capacity");
const plain = roomMatchesNeed(none, [], q("الاثنين 10"));
check(roomMatchesNeed(none, [], q("0 مقعد")).capacityUnknown === false, "need: «0 مقعد» is not a condition");
check(plain.match && !plain.capacityUnknown && !plain.typeUnknown, "need: time-only query flags nothing");

/* ── 2. ساكن ── */
const sch = fs.readFileSync("src/components/Schedules.tsx", "utf8");
const exp = fs.readFileSync("src/components/RoomsExplorer.tsx", "utf8");
check(/viewMode !== "rooms"[\s\S]{0,400}\/api\/location-registry\?\$\{query\}/.test(sch) && /roomFactsByKey\(/.test(sch), "static: one registry read when the rooms view opens (existing endpoint)");
check(!/api\/rooms\/capacity|rooms\/\$\{/.test(exp) && !/fetch\(/.test(exp), "static: the explorer itself makes no per-room request");
check(/roomFactsText\(item\)/.test(exp) && /السعة غير مسجّلة/.test(exp), "static: dropdown items show facts and the quiet unknown mark");

/* ── 3. حيّ ── */
type Page = any;
let chromium: any = null;
try { const r = createRequire(import.meta.url); chromium = r(r.resolve("playwright", { paths: [process.cwd(), "/opt/node22/lib/node_modules", "/opt/node-tools/node_modules", "/usr/lib/node_modules", "/usr/local/lib/node_modules"] })).chromium; } catch { chromium = null; }
const BASE = process.env.CAP_BASE || "http://127.0.0.1:4591";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const serverUp = async () => { try { return (await fetch(BASE + "/api/demo/config")).ok; } catch { return false; } };
let child: ChildProcess | null = null, priv = "";
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } if (priv) fs.rmSync(priv, { recursive: true, force: true }); };
async function ensureServer() {
  if (await serverUp()) return true;
  priv = fs.mkdtempSync(path.join(os.tmpdir(), "rooms-cap-"));
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: new URL(BASE).port || "4591", SCHEDULE_PRIVATE_DIR: priv, AUTO_IMPORT_LEGACY_DATA: "false" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { if (await serverUp()) return true; await sleep(1000); }
  return false;
}
async function live() {
  const watchdog = setTimeout(() => { console.log("\x1b[31m✗ watchdog 300s\x1b[0m"); stop(); process.exit(1); }, 300_000); watchdog.unref();
  if (!chromium || !(await ensureServer())) { console.log("SKIP: no playwright / demo server — live part skipped"); return; }
  const browser = await chromium.launch();
  try {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-KW" });
    if (!(await c.request.post(BASE + "/api/auth/demo", { data: {} })).ok()) throw new Error("login");
    for (let i = 0; i < 360; i++) { const s = await (await c.request.get(BASE + "/api/demo/seed-status")).json().catch(() => ({})); if (s.status === "ready") break; await sleep(500); }
    await c.request.post(BASE + "/api/demo/role", { data: { role: "admin" } });
    const p: Page = await c.newPage();
    await p.goto(BASE + "/FSchedule/Index", { waitUntil: "domcontentloaded" }); await sleep(2500);
    await p.keyboard.press("Escape").catch(() => {});
    const skip = p.locator(".ob-root .ob-skip").first();
    if (await skip.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) await skip.click().catch(() => {});
    await p.locator('button[data-guide-target="schedule.view.rooms"]').first().click();
    await p.waitForSelector(".rx-root", { timeout: 120000 }); await sleep(1500);
    const options = async () => p.locator('[role=listbox] [role=option]').evaluateAll((els: Element[]) => els.map(e => e.textContent || ""));
    await p.locator('.rx-dd-btn[aria-label="اختيار القاعة"]').click(); await sleep(400);
    const all = await options();
    check(all.length > 0, "live: room dropdown lists rooms", all);
    check(!all.some(t => /(^|\s)0 مقعد|لا مقاعد/.test(t)), "live: no «0 مقعد» anywhere", all);
    const withCap = all.filter(t => /\d+ مقعد/.test(t));
    console.log(`  info: ${withCap.length}/${all.length} rooms show a capacity`);
    check(withCap.length > 0, "live: at least one room shows «N مقعداً»", all.slice(0, 5));
    check(withCap.every(t => /^.*\d+ مقعد(اً)?/.test(t)), "live: capacity text well formed");
    const input = p.locator('input[role=combobox]');
    await input.fill("9999 مقعد"); await sleep(400);
    const chip = (await p.locator(".rx-need").first().textContent().catch(() => "")) || "";
    check(/مقعد/.test(chip) && /فأكثر/.test(chip), "live: need chip reads the capacity", chip);
    const huge = await options();
    check(huge.every(t => !/\d+ مقعد/.test(t) || false) , "live: impossible capacity removes every room with a known capacity", huge);
    check(huge.every(t => /السعة غير مسجّلة/.test(t)), "live: rooms kept by an unknown capacity carry the quiet mark", huge);
    await input.fill("1 مقعد"); await sleep(400);
    check((await options()).length === all.length, "live: «1 مقعد» keeps every room");
    await input.fill("مختبر"); await sleep(400);
    const labs = await options();
    check(labs.every(t => /مختبر|النوع غير مسجّل/.test(t)), "live: lab filter keeps only labs or unknown-type rooms", labs);
    check(/مختبر/.test((await p.locator(".rx-need").first().textContent().catch(() => "")) || ""), "live: lab chip shown");
  } finally { await browser.close(); stop(); }
}
await live();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
