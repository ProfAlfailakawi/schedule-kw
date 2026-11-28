import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT!);
const BASE = "http://127.0.0.1:" + (process.env.SCREENS_PORT || 3471);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar-KW" });
  await context.addInitScript(() => { const read = Storage.prototype.getItem; Storage.prototype.getItem = function (key: string) { return String(key).startsWith("schedule-onboarding") ? "done" : read.call(this, key); }; });
  await context.request.post(BASE + "/api/auth/demo", { data: {} });
  for (let i = 0; i < 300; i++) { const s = await (await context.request.get(BASE + "/api/demo/seed-status")).json(); if (s.status === "ready") break; await sleep(500); }
  await context.request.post(BASE + "/api/demo/role", { data: { role: "admin" } });
  const page = await context.newPage();
  await page.goto(BASE + "/FSchedule/Index");
  await page.getByRole("button", { name: "إضافة موعد" }).first().waitFor({ timeout: 180000 });
  await sleep(1500);
  const step = process.argv[2] || "";
  for (const text of step.split("|").filter(Boolean)) {
    const ok = await page.evaluate(`(() => { const b = [...document.querySelectorAll("button, summary, a, [role=tab]")].find(x => x.offsetParent && (x.innerText.trim() === ${JSON.stringify(text)} || x.getAttribute("title") === ${JSON.stringify(text)} || x.getAttribute("data-guide-target") === ${JSON.stringify(text)})); if (b) b.click(); return !!b; })()`);
    console.log("click", text, ok); await sleep(8000);
  }
  const buttons = await page.evaluate(`[...document.querySelectorAll("button, [role=tab], summary")].filter(x => x.offsetParent).map(x => (x.innerText.trim() || x.getAttribute("title") || "").replace(/\\s+/g, " ").slice(0, 40)).filter(Boolean).filter(t => !/^(تعديل|حذف)$/.test(t)).slice(0, 90).join(" | ")`);
  console.log(buttons);
  await page.screenshot({ path: process.argv[3] || "/private/tmp/claude-501/-Users-prof-ahmadalfailakawi-schedule-kw/9703d943-b1a1-422f-8156-b23b0d2232fa/scratchpad/dbg.png" });
  await browser.close();
})();
