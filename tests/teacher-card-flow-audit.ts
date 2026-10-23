/**
 * ── كرت الأستاذ: المسار الكامل عبر الخادم الحقيقي ───────────────────────────
 *
 * يشغّل الخادمَ في وضع العرض (أو يستعمل خادماً يعمل على المنفذ نفسه) ثم يجري ما
 * يجريه أستاذٌ ومنسّق: يفتح الأستاذ كرتَه ويبقى البثُّ الحيّ مفتوحاً، ويقرّر القسم،
 * فيصل الحدثُ في ثانيتين. كلُّ قسمٍ هنا يُضاف مع مرحلته (بثٌّ، تحقّق، تقويم، ذاكرة).
 */
import { spawn, type ChildProcess } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";

const BASE = process.env.TEACHER_CARD_TEST_BASE || "http://localhost:3000";
let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

type Res = { status: number; json: any; text: string; cookie?: string };
async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Res> {
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, text, cookie: set ? set.split(";")[0] : undefined };
}
async function serverUp() { try { return (await fetch(BASE + "/api/demo/config")).ok; } catch { return false; } }

let child: ChildProcess | null = null;
async function ensureServer() {
  if (await serverUp()) return;
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development" }, stdio: "ignore" });
  for (let i = 0; i < 90; i++) { if (await serverUp()) return; await new Promise(r => setTimeout(r, 1000)); }
  throw new Error("الخادم لم يبدأ");
}
async function login(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const r = await http("POST", "/api/auth/demo", {});
    if (r.status === 200 && r.cookie) { await waitForDemoSeed(BASE, r.cookie); return r.cookie; }
    await new Promise(res => setTimeout(res, 15000));
  }
  throw new Error("تعذّر الدخول التجريبي");
}

const SCOPE = "collegeId=1&sectionId=1&termId=1";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** يفتح بثّ الكرت ويجمع أسماء الأحداث الواصلة مع لحظة وصولها. */
async function listen(token: string) {
  const controller = new AbortController();
  const events: Array<{ name: string; at: number }> = [];
  const res = await fetch(`${BASE}/api/public/request/${encodeURIComponent(token)}/events`, { signal: controller.signal });
  const reader = res.body?.getReader();
  (async () => {
    const decoder = new TextDecoder(); let buffer = "";
    try {
      while (reader) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
          const name = /^event: (.+)$/m.exec(block)?.[1];
          if (name) events.push({ name, at: Date.now() });
        }
      }
    } catch { /* الإغلاق مقصود */ }
  })();
  return { status: res.status, type: res.headers.get("content-type") || "", events, close: () => controller.abort() };
}

async function main() {
  await ensureServer();
  const cookie = await login();
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);
  const rows = (await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows as any[];
  const pick = (status: string) => rows.find(r => r.status === status && (r.items || []).some((i: any) => i.action === "change"));

  /* ═══ المرحلة ٢: البثّ الحيّ ═══════════════════════════════════════════ */
  const target = pick("submitted") || pick("in-review");
  check(!!target, "يوجد طلبٌ مرسَلٌ فيه تعديل للاختبار");
  const bad = await http("GET", "/api/public/request/demo.invalid-token-value/events");
  check(bad.status >= 400 && bad.status < 500, "رابطٌ غير صالح لا يفتح بثّاً", bad.status);

  const stream = await listen(target.linkId);
  check(stream.status === 200 && /text\/event-stream/.test(stream.type), "البثّ يُفتح بالرابط الشخصيّ ويعلن نوعه");
  await wait(300);
  check(stream.events.some(e => e.name === "ready"), "ويبدأ بحدث الجاهزية");
  const idx = target.items.findIndex((i: any) => i.action === "change");
  const sentAt = Date.now();
  const decided = await A("POST", `/api/instructor-requests/${target.id}/decide`, { itemIndex: idx, state: "rejected", reasonCode: "department", note: "اختبار", alternatives: [{ day: "fmonday", days: ["fmonday", "fwednesday"], start: "08:00", end: "09:20" }] });
  check(decided.status === 200, "القسم يقرّر", decided.status);
  await wait(1500);
  const changed = stream.events.find(e => e.name === "changed");
  check(!!changed && changed.at - sentAt < 2000, "الحدثُ يصل الأستاذَ خلال ثانيتين من قرار القسم");

  /* البثُّ لا يحمل شيئاً من الطلب: نوعٌ ولحظةٌ فقط. */
  stream.close();
  const raw = await new Promise<string>(async resolve => {
    const c = new AbortController(); let all = "";
    const r = await fetch(`${BASE}/api/public/request/${encodeURIComponent(target.linkId)}/events`, { signal: c.signal });
    const rd = r.body!.getReader(); const dec = new TextDecoder();
    setTimeout(async () => {
      await A("POST", `/api/instructor-requests/${target.id}/reply`, { itemIndex: idx, text: "نصٌّ سرّيّ لا يجوز أن يظهر في البثّ" });
      setTimeout(() => { c.abort(); resolve(all); }, 600);
    }, 200);
    try { for (;;) { const { value, done } = await rd.read(); if (done) break; all += dec.decode(value); } } catch { /* abort */ }
  });
  check(/event: changed/.test(raw) && !/سرّيّ|رُفض|المحاضرة|room|قاعة/.test(raw), "ولا يحمل البثُّ نصَّ الرسالة ولا قاعةً ولا قراراً");

  /* سقفُ الاتصالات لكل طلب. */
  const many = await Promise.all([1, 2, 3, 4, 5, 6].map(() => listen(target.linkId).catch(() => null)));
  const refused = many.filter(m => m && m.status === 429).length;
  check(refused >= 1, "اتصالاتٌ كثيرة بالرابط الواحد تُرفض بدل أن تتراكم", many.map(m => m?.status));
  many.forEach(m => m?.close());

  console.log(`\nTeacher card flow audit: ${passed} passed, ${failed} failed`);
  child?.kill();
  process.exit(failed ? 1 : 0);
}
main().catch(error => { console.error(error); child?.kill(); process.exit(1); });
