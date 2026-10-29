/**
 * ── «نُحدّث البرنامج» بدل صفحة Google الإنجليزية ─────────────────────────────
 *
 *   U1) sw.js: التنقّلُ بـ 500/502/503/504 أو بانقطاعٍ والجهازُ متّصل ← صفحةُ التحديث (503، no-store)،
 *       لشاشات التطبيق وللصفحات المستقلّة (/r/ /s/ /d/ /b/ …) معاً؛ والنجاحُ يمرّ كما هو.
 *   U2) لا يمسّ /api ولا غيرَ GET ولا غيرَ التنقّل، ولا يحفظ جوابَ 5xx في أيّ ذاكرة؛
 *       والكرتُ وباب القاعة لا يُجابان من هيكل التطبيق أبداً؛ ودون اتصالٍ يبقى الهيكل.
 *   U3) التثبيتُ يحفظ الصفحة في ذاكرةٍ ثابتة يُبقيها التفعيل؛ وCLEAR_API_CACHE و__BUILD__ باقيان.
 *   U4) push-sw.js (عاملُ بطاقة الأستاذ، خارج نطاق sw.js): الخطأ وحده يُبدَّل.
 *   U5) الصفحة: مستقلّة بلا رابطٍ خارجي، RTL، نهاري/ليلي، فصحى، تسأل /api/health
 *       كل ٣ ثوانٍ وتتباطأ، وتعيد فتح الرابط نفسه، ولا تدور في حلقة.
 *   U6) التطبيق: 5xx بغير JSON على /api ← شريطٌ هادئ لا لافتةُ خطأ؛ والاستعادةُ لا تمسح
 *       شيئاً والخادمُ لا يُجيب؛ وفحصُ الإصدار لا يقرأ صفحةَ الخطأ.
 *   U7) scripts/verify-pwa.mjs ما زال ينجح.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { execFileSync } from "child_process";
import { isPlatformUpdating, UPDATING_MESSAGE } from "../src/utils/updatingNotice";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail ?? ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const ORIGIN = "https://schedule-kw.com";
const PAGE = read("public/updating.html");
const pathOf = (key: any) => new URL(typeof key === "string" ? key : key.url, ORIGIN).pathname;
const html = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
const GOOGLE_502 = "<html><title>Error 502 (Server Error)!!1</title><p>Error: Server Error. Please try again in 30 seconds.</p></html>";

type Net = (pathname: string) => Promise<Response>;
/** A worker in a sandbox with an in-memory Cache Storage that records every write. */
function worker(file: string, net: Net, options: { online?: boolean } = {}) {
  const source = read(file);
  const handlers: Record<string, (event: any) => void> = {};
  const store = new Map<string, Map<string, Response>>();
  const writes: Array<{ cache: string; key: string; status: number }> = [];
  const open = async (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      put: async (key: any, response: Response) => { writes.push({ cache: name, key: pathOf(key), status: response.status }); entries.set(pathOf(key), response.clone()); },
      match: async (key: any) => entries.get(pathOf(key))?.clone(),
      addAll: async (list: string[]) => { for (const item of list) { const r = await net(pathOf(item)); if (r.ok) entries.set(pathOf(item), r); } },
    };
  };
  const caches = { open, keys: async () => [...store.keys()], delete: async (name: string) => store.delete(name) };
  const self: any = {
    addEventListener: (type: string, fn: any) => { handlers[type] = fn; },
    location: { origin: ORIGIN }, skipWaiting() {}, clients: { claim() {} },
    navigator: { onLine: options.online ?? true }, registration: { scope: `${ORIGIN}/r/tok` },
  };
  vm.runInNewContext(source, { self, URL, Response, Promise, JSON, String, Date, Math, caches, fetch: (request: any) => net(pathOf(request)) });
  const lifecycle = async (type: string, data?: unknown) => {
    const waits: Promise<unknown>[] = [];
    handlers[type]({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  };
  const request = async (pathname: string, init: { mode?: string; method?: string } = {}) => {
    let answer: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    handlers.fetch({
      request: { url: `${ORIGIN}${pathname}`, mode: init.mode ?? "navigate", method: init.method ?? "GET" },
      respondWith: (p: Promise<Response>) => { answer = p; }, waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    let response: Response | null = null, error: unknown = null;
    try { response = answer ? await answer : null; } catch (e) { error = e; }
    await Promise.all(waits); await tick(); await tick();
    return { answered: answer !== null, response, error };
  };
  return { lifecycle, request, store, writes, open };
}

/** The network as the platform answers mid-deploy: the page itself is still reachable for install. */
const deploying = (status: number | "drop"): Net => async pathname => {
  if (pathname === "/updating.html") return html(PAGE);
  if (status === "drop") throw new TypeError("Failed to fetch");
  return html(GOOGLE_502, status);
};
const isUpdatingPage = async (response: Response | null) =>
  Boolean(response) && response!.status === 503 && response!.headers.get("cache-control") === "no-store"
  && /text\/html/.test(response!.headers.get("content-type") || "") && (await response!.clone().text()).includes("نُحدّث البرنامج الآن");

/* ══ U1 ═══════════════════════════════════════════════════════════════════════ */
{
  for (const status of [500, 502, 503, 504] as const) {
    const sw = worker("public/sw.js", deploying(status));
    await sw.lifecycle("install");
    const app = await sw.request("/FSchedule/Index");
    const card = await sw.request("/r/AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    check(await isUpdatingPage(app.response) && await isUpdatingPage(card.response), `U1 تنقّلٌ بـ ${status} ← صفحةُ التحديث (503، no-store) للتطبيق وللبطاقة`);
  }
  {
    const sw = worker("public/sw.js", deploying(502));
    await sw.lifecycle("install");
    const pages = ["/s/tok", "/q/tok", "/m/tok", "/t/tok", "/d/tok", "/b/tok", "/me", "/plans/x.html", "/partners/tok"];
    const results = await Promise.all(pages.map(p => sw.request(p)));
    const ok = await Promise.all(results.map(r => isUpdatingPage(r.response)));
    check(ok.every(Boolean), "U1 والصفحاتُ المستقلّة كلّها (/s/ /q/ /m/ /t/ /d/ /b/ /me /plans/ /partners/)", pages.filter((_, i) => !ok[i]));
  }
  {
    const sw = worker("public/sw.js", deploying("drop"));
    await sw.lifecycle("install");
    check(await isUpdatingPage((await sw.request("/FSchedule/Index")).response) && await isUpdatingPage((await sw.request("/d/tok")).response),
      "U1 انقطاعُ الطلب والجهازُ متّصل ← صفحةُ التحديث");
  }
  {
    const page = html("<p>the real card</p>");
    const sw = worker("public/sw.js", async pathname => pathname === "/updating.html" ? html(PAGE) : page.clone());
    await sw.lifecycle("install");
    const card = await sw.request("/r/tok"), app = await sw.request("/FSchedule/Index");
    check(card.response?.status === 200 && (await card.response!.text()) === "<p>the real card</p>" && app.response?.status === 200,
      "U1 والجوابُ الناجح يمرّ كما هو");
    const redirect = worker("public/sw.js", async () => new Response(null, { status: 302, headers: { Location: "/q/tok" } }));
    check((await redirect.request("/s/tok")).response?.status === 302, "U1 والتحويلُ (302) يمرّ كما هو");
  }
}

/* ══ U2 ═══════════════════════════════════════════════════════════════════════ */
{
  const sw = worker("public/sw.js", deploying(502));
  await sw.lifecycle("install");
  const api = await sw.request("/api/schedules?termId=1", { mode: "cors" });
  const apiNav = await sw.request("/api/export/schedule.xlsx");
  const version = await sw.request("/api/version", { mode: "cors" });
  check(api.response?.status === 502 && !(await isUpdatingPage(api.response)) && !apiNav.answered && !version.answered,
    "U2 طلباتُ /api لا تُبدَّل (ولا تنقّلُ /api)");
  const post = await sw.request("/FSchedule/Index", { method: "POST" });
  check(!post.answered, "U2 وغيرُ GET لا يمسّه العامل");
  const fonts = await sw.request("/fonts/x.woff2", { mode: "no-cors" });
  check(fonts.response?.status === 502, "U2 والملفّاتُ غيرُ المحفوظة تعود بجوابها (ليست تنقّلاً)");
  const fiveXX = sw.writes.filter(w => w.status >= 500);
  check(fiveXX.length === 0, "U2 لا يُحفظ جوابُ 5xx في أيّ ذاكرة", fiveXX);
  check(!sw.writes.some(w => w.key === "/index.html"), "U2 ولا يُحفظ شيءٌ مكان هيكل التطبيق أثناء التحديث");

  const ok = worker("public/sw.js", async pathname => pathname === "/updating.html" ? html(PAGE) : html(`<p>${pathname}</p>`));
  await ok.lifecycle("install");
  ok.writes.length = 0; // the install itself stores "/" as the shell
  for (const p of ["/r/tok", "/s/tok", "/d/tok", "/b/tok", "/me", "/updating.html"]) await ok.request(p);
  check(!ok.writes.some(w => w.key === "/index.html"), "U2 البطاقةُ وبابُ القاعة وصفحةُ التحديث نفسها لا تُحفظ هيكلاً للتطبيق");
  await ok.request("/FSchedule/Index");
  check(ok.writes.some(w => w.key === "/index.html"), "U2 وشاشاتُ التطبيق ما زالت تُحفظ هيكلاً");

  const offline = worker("public/sw.js", async pathname => { if (pathname === "/updating.html" || pathname === "/") return html(pathname === "/" ? "<p>app shell</p>" : PAGE); throw new TypeError("offline"); }, { online: false });
  await offline.lifecycle("install");
  const shell = await offline.request("/FSchedule/Index");
  check(shell.response && (await shell.response.text()) === "<p>app shell</p>", "U2 ودون اتصالٍ حقيقي يفتح التطبيقُ من هيكله كما كان");

  const icon = worker("public/sw.js", deploying(502));
  const iconCache = await icon.open("schedule-shell-__BUILD__");
  await iconCache.put("/schedule-icon.svg", new Response("<svg>cached</svg>", { status: 200 }));
  const answered = await icon.request("/schedule-icon.svg", { mode: "no-cors" });
  check(answered.response?.status === 200 && (await answered.response!.text()) === "<svg>cached</svg>", "U2 وخطٌّ أو أيقونةٌ أثناء التحديث تُجاب من النسخة المحفوظة");
}

/* ══ U3 ═══════════════════════════════════════════════════════════════════════ */
{
  const source = read("public/sw.js");
  const sw = worker("public/sw.js", deploying(502));
  await sw.lifecycle("install");
  check(sw.store.get("schedule-updating")?.has("/updating.html"), "U3 التثبيتُ يحفظ الصفحة في ذاكرة schedule-updating");
  (await sw.open("schedule-old-build")).put("/x", new Response("x"));
  await sw.lifecycle("activate");
  check(sw.store.has("schedule-updating") && !sw.store.has("schedule-old-build"), "U3 والتفعيلُ يُبقيها ويمسح ذاكرةَ الإصدارات السابقة");
  await sw.lifecycle("message", { type: "CLEAR_API_CACHE" });
  check(source.includes('const BUILD="__BUILD__"') && /CLEAR_API_CACHE/.test(source) && source.includes('"/plans/"') && source.includes('"/_ads/"'),
    "U3 ختمُ البناء ورسالةُ CLEAR_API_CACHE والاستثناءاتُ باقية");

  const empty = worker("public/sw.js", async pathname => pathname === "/updating.html" ? html(PAGE) : html(GOOGLE_502, 502));
  const raw = await empty.request("/r/tok");
  check(raw.response?.status === 502, "U3 وبلا صفحةٍ محفوظة يعود الجوابُ كما جاء (لا شيءَ أسوأ من قبل)");
  const refill = worker("public/sw.js", async pathname => pathname === "/updating.html" ? html(PAGE) : html("<p>ok</p>"));
  await refill.request("/r/tok");
  check(refill.store.get("schedule-updating")?.has("/updating.html"), "U3 وتنقّلٌ ناجح يعيد حفظها إن مُسحت");
}

/* ══ U4 ═══════════════════════════════════════════════════════════════════════ */
{
  const push = worker("public/push-sw.js", deploying(503));
  await push.lifecycle("install");
  check(await isUpdatingPage((await push.request("/r/tok")).response), "U4 push-sw.js: بطاقةُ الأستاذ بـ 503 ← صفحةُ التحديث");
  const dropped = worker("public/push-sw.js", deploying("drop"));
  await dropped.lifecycle("install");
  check(await isUpdatingPage((await dropped.request("/r/tok")).response), "U4 وبانقطاع الطلب كذلك");
  const fine = worker("public/push-sw.js", async pathname => pathname === "/updating.html" ? html(PAGE) : html("<p>card</p>"));
  const card = await fine.request("/r/tok");
  check(card.response?.status === 200 && (await card.response!.text()) === "<p>card</p>", "U4 والنجاحُ يمرّ كما هو");
  check(!(await fine.request("/api/public/card/tok", { mode: "cors" })).answered && !(await fine.request("/r/tok", { method: "POST" })).answered,
    "U4 ولا يمسّ غيرَ التنقّل ولا غيرَ GET");
  check(push.writes.every(w => w.cache === "schedule-updating" && w.key === "/updating.html" && w.status === 200), "U4 ولا يحفظ إلا صفحةَ التحديث");
}

/* ══ U5 ═══════════════════════════════════════════════════════════════════════ */
{
  check(!/https?:\/\//i.test(PAGE) && !/\bsrc=/i.test(PAGE) && !/<link\b/i.test(PAGE) && !/@import/i.test(PAGE)
    && (PAGE.match(/url\("([^"]+)"\)/g) || []).every(u => /^url\("\/fonts\//.test(u)),
    "U5 مستقلّة: لا رابطَ خارجي ولا ملفَّ مُلحق، والخطُّ خطُّ البرنامج من الموقع نفسه وحده");
  check(/<html lang="ar" dir="rtl">/.test(PAGE) && /prefers-color-scheme:dark/.test(PAGE) && /name="viewport"/.test(PAGE) && /prefers-reduced-motion/.test(PAGE),
    "U5 عربيةٌ من اليمين، بنهاري وليلي، للهاتف والحاسوب، وتحترم تقليل الحركة");
  check(PAGE.includes("نُحدّث البرنامج الآن ✨") && PAGE.includes("لحظاتٍ ونعود") && PAGE.includes("أعد المحاولة الآن"), "U5 النصوص المطلوبة");
  const visible = PAGE.replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  const audit = read("tests/standard-arabic-ui-audit.ts");
  const words = [...(audit.slice(audit.indexOf("const COLLOQUIAL"), audit.indexOf("};", audit.indexOf("const COLLOQUIAL"))).matchAll(/"([^"]+)":/g))].map(m => m[1]);
  const L = "ء-يٱ-ۓً-ْـ";
  const hits = words.filter(w => new RegExp(`(?:^|[^${L}])[وف]?${w}(?=$|[^${L}])`).test(visible));
  check(words.length > 20 && hits.length === 0, "U5 فصحى: لا كلمةَ من قائمة العاميّة", hits);

  const script = /<script>([\s\S]*?)<\/script>/.exec(PAGE)?.[1] || "";
  const run = (options: { health: boolean[]; recent?: number[]; pathname?: string; online?: boolean }) => {
    const timers: Array<{ fn: () => void; ms: number }> = [];
    const asked: string[] = [];
    const nodes: Record<string, any> = {};
    const node = (id: string) => (nodes[id] ??= { textContent: "", addEventListener() {} });
    const store: Record<string, string> = options.recent ? { "schedule-updating-reloads": JSON.stringify(options.recent) } : {};
    const location = { pathname: options.pathname ?? "/r/tok", reloads: 0, replaced: "", reload() { this.reloads++; }, replace(url: string) { this.replaced = url; } };
    let call = 0;
    const context: any = {
      document: { getElementById: node, addEventListener() {}, hidden: false },
      window: { addEventListener() {} }, navigator: { onLine: options.online ?? true }, location,
      sessionStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
      setTimeout: (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
      fetch: (url: string, init: any) => { asked.push(`${url}|${init?.cache}`); const ok = options.health[Math.min(call++, options.health.length - 1)]; return Promise.resolve({ ok }); },
      AbortController, JSON, Date, Math,
    };
    vm.runInNewContext(script, context);
    const step = async () => { const timer = timers.filter(t => t.ms !== 8000).shift()!; timers.splice(timers.indexOf(timer), 1); timer.fn(); await tick(); await tick(); return timer.ms; };
    return { timers, asked, location, nodes, step, store };
  };
  {
    const page = run({ health: [false, false, true] });
    const delays = [await page.step(), await page.step(), await page.step()];
    check(delays.every(ms => ms === 3000) && page.asked.every(a => a === "/api/health|no-store") && page.location.reloads === 1,
      "U5 تسأل /api/health كل ٣ ثوانٍ، فإذا أجاب أعادت فتح الرابط نفسه", { delays, asked: page.asked, reloads: page.location.reloads });
  }
  {
    const page = run({ health: [false] });
    const delays: number[] = [];
    for (let i = 0; i < 16; i++) delays.push(await page.step());
    check(delays[0] === 3000 && delays[delays.length - 1] > 3000 && delays.every(ms => ms <= 15000) && delays.every((ms, i) => i === 0 || ms >= delays[i - 1]) && page.location.reloads === 0,
      "U5 وتتباطأ تدريجياً حتى ١٥ ثانية ما دام الخادم لا يجيب", delays);
  }
  {
    const now = Date.now();
    const page = run({ health: [true], recent: [now - 5000, now - 4000, now - 3000] });
    const delay = await page.step();
    check(delay === 30000 && page.nodes.lead.textContent.includes("وقتاً أطول"), "U5 ولا تدور في حلقة: ثلاثُ إعاداتٍ في دقيقتين ← مرّةٌ كل نصف دقيقة");
  }
  {
    const page = run({ health: [true], pathname: "/updating.html" });
    await page.step();
    check(page.location.replaced === "/" && page.location.reloads === 0, "U5 ومن فتحها باسمها يعود إلى البداية");
  }
  {
    const page = run({ health: [true], online: false });
    await page.step();
    check(page.asked.length === 0 && page.nodes.title.textContent.includes("لا اتصال"), "U5 ودون اتصالٍ تقول ذلك ولا تسأل الخادم");
  }
}

/* ══ U6 ═══════════════════════════════════════════════════════════════════════ */
{
  check(isPlatformUpdating(502, "text/html; charset=UTF-8") && isPlatformUpdating(503, "") && isPlatformUpdating(500, "text/html") && isPlatformUpdating(504, null)
    && !isPlatformUpdating(503, "application/json; charset=utf-8") && !isPlatformUpdating(404, "text/html") && !isPlatformUpdating(200, "text/html"),
    "U6 5xx بغير JSON وحده جوابُ المنصّة؛ أخطاءُ البرنامج (JSON) تبقى كما هي");
  check(UPDATING_MESSAGE.includes("نُحدّث البرنامج"), "U6 والرسالةُ هادئة");
  const main = read("src/main.tsx");
  const wrapper = main.slice(main.indexOf("const customFetch"), main.indexOf("}) as typeof window.fetch;"));
  check(/isPlatformUpdating\(response\.status,contentType\)/.test(wrapper) && /showUpdatingNotice\(serverAnswers\)/.test(wrapper) && wrapper.indexOf("isPlatformUpdating") < wrapper.indexOf("response.clone().json()"),
    "U6 غلافُ fetch يعرف جوابَ المنصّة قبل قراءته JSON ويُظهر الشريط");
  const recovery = main.slice(main.indexOf("const recoverFromStaleBuild=async()=>{"), main.indexOf("window.addEventListener(\"vite:preloadError\""));
  check(recovery.indexOf("await serverAnswers()") > 0 && recovery.indexOf("await serverAnswers()") < recovery.indexOf("safeStorage.set(RECOVERY_KEY") && recovery.indexOf("await serverAnswers()") < recovery.indexOf("caches.delete"),
    "U6 استعادةُ main.tsx تسأل الخادم قبل أن تمسح شيئاً");
  const version = main.slice(main.indexOf("const checkVersion = async"), main.indexOf("window.addEventListener(\"pageshow\""));
  check(version.indexOf("if (!response.ok) return;") > 0 && version.indexOf("if (!response.ok) return;") < version.indexOf("response.json()"), "U6 وفحصُ الإصدار لا يقرأ صفحةَ الخطأ ولا يمسّ مفتاحَ المحاولة");
  check(/SERVER_BACK_EVENT, \(\) => \{ void checkVersion\(\); \}/.test(main), "U6 وحين يعود الخادم يُسأل عن الإصدار فوراً");
  const index = read("index.html");
  const recover = index.slice(index.indexOf("function recover(detail)"), index.indexOf("function wipeAndReload()"));
  check(/serverUp\(function \(up\) \{\s*if \(up\) wipeAndReload\(\); else awaitServer\(\);/.test(recover) && !/caches\.delete|unregister/.test(recover)
    && /#boot\.updating #boot-updating\{display:block\}/.test(index) && index.includes("نُحدّث البرنامج الآن ✨"),
    "U6 حارسُ الإقلاع: الخادمُ لا يجيب ← «نُحدّث البرنامج» وانتظار، لا مسح");
}

/* ══ U7 ═══════════════════════════════════════════════════════════════════════ */
{
  let ok = true, output = "";
  try { output = execFileSync(process.execPath, ["scripts/verify-pwa.mjs"], { encoding: "utf8" }); } catch (e: any) { ok = false; output = String(e.stdout || e.message); }
  check(ok && output.includes("PWA guard passed"), "U7 scripts/verify-pwa.mjs ما زال ينجح", output);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
