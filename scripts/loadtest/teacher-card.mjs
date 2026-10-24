#!/usr/bin/env node
/**
 * ── اختبار تحمّل كرت الأستاذ (/r/:token): ألفُ أستاذٍ يفتحون ويعدّلون ويوقّعون ────────
 *
 * يلزمه ملفٌ من seed-teachers.ts (الأساتذة وأرقامهم المصطنعة ومفتاح مديرٍ مصطنع). يسجّل المديرُ دخوله ويصدر
 * الروابط لأقسام الفصل (--issue)، ثم يصل الأساتذة بمعدّلٍ ثابت (--rate في الثانية؛ open model) ويمرّ كلٌّ بما يمرّ به أستاذ:
 *   الصفحة ← الطلب ← عادات الأيام ← بثٌّ حيٌّ مفتوح (SSE) ← [فحصُ تعديل ← فحصُ الأوقات] ← توقيعٌ وإرسال ← إعادةُ فتح.
 * الخليط: ٤٠٪ يقرؤون فقط، ٣٥٪ يغيّرون موعداً، ١٠٪ يضيفون، ١٠٪ يحذفون، ٥٪ يخطئون في رقمهم المدني قبل أن يصيبوه.
 * ثم يقيس المديرُ شاشةَ الطلبات الواردة بألف طلب.
 *
 * لا يُوجَّه إلا إلى خادمٍ محلي: يرفض أي عنوانٍ غير localhost، فلا يُطلق على الموقع الحقيقي.
 *
 * --nat: كلُّ الأساتذة من عنوانٍ واحد (شبكة الجامعة). الافتراضي لكلِّ أستاذٍ عنوانُه (X-Forwarded-For؛ الخادم يثق بوكيلٍ واحد).
 *
 *   node scripts/loadtest/teacher-card.mjs --teachers /tmp/lt/teachers.json --issue --rate 20 --count 1000 --hold 8000
 */
import fs from "node:fs";
const args = process.argv.slice(2);
const opt = (name, fallback) => { const at = args.indexOf(`--${name}`); return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : fallback; };
const BASES = String(opt("base", "http://127.0.0.1:3000")).split(",");
for (const base of BASES) if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(base)) { console.error(`يرفض: ${base} ليس خادماً محلياً.`); process.exit(1); }
const NAT = args.includes("--nat");
const TEACHERS = opt("teachers", "/tmp/lt/teachers.json"), LINKS = opt("links", "/tmp/lt/links.json");
const RATE = Number(opt("rate", 20)), COUNT = Number(opt("count", 1000)), HOLD = Number(opt("hold", 8000)), JSON_OUT = opt("json", "");
const seed = JSON.parse(fs.readFileSync(TEACHERS, "utf8"));
const pick = list => list[Math.floor(Math.random() * list.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const stats = new Map();
const record = (step, ms, status) => { if (!stats.has(step)) stats.set(step, { ms: [], codes: new Map() }); const s = stats.get(step); s.ms.push(ms); s.codes.set(status, (s.codes.get(status) || 0) + 1); };
async function baseCall(base, step, path, { method = "GET", body, cookie, headers = {}, ip } = {}) {
  const h = { accept: "application/json", ...headers };
  if (ip && !NAT) h["x-forwarded-for"] = ip;
  if (body !== undefined) h["content-type"] = "application/json";
  if (cookie) h.cookie = cookie;
  const t = performance.now(); let status = 0, json = null, text = "", setCookie = "";
  try {
    const res = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    status = res.status; setCookie = res.headers.get("set-cookie") || ""; text = await res.text();
    try { json = JSON.parse(text); } catch { json = null; }
  } catch { status = "ERR"; }
  record(step, performance.now() - t, status);
  return { status, json, text, setCookie };
}

const call = baseCall;
/* ── المدير: دخولٌ وإصدارُ الروابط (أو قراءةُ ما صدر) ── */
let links = {};
if (args.includes("--issue")) {
  const r = await call(BASES[0], "admin login", "/api/auth/login", { method: "POST", body: { username: seed.login, password: seed.password } });
  if (r.status !== 200) { console.error("تعذّر دخول المدير المصطنع", r.status, r.text.slice(0, 200)); process.exit(1); }
  const cookie = r.setCookie.split(";")[0];
  const closesAt = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  for (const sectionId of seed.sections) {
    const issued = await call(BASES[0], "admin issue links", "/api/instructor-requests/issue", { method: "POST", cookie, body: { collegeId: seed.collegeId, sectionId, termId: seed.termId, closesAt } });
    if (issued.status !== 200) { console.error("تعذّر الإصدار", sectionId, issued.status, issued.text.slice(0, 300)); process.exit(1); }
    for (const row of issued.json.issued) links[row.instructorId] = { linkId: row.linkId, sectionId };
  }
  fs.writeFileSync(LINKS, JSON.stringify({ cookie, links }), { mode: 0o600 });
  console.error(`صدرت ${Object.keys(links).length} روابط.`);
}
const saved = JSON.parse(fs.readFileSync(LINKS, "utf8")); links = saved.links; const adminCookie = saved.cookie;
const crowd = seed.teachers.filter(t => links[t.id]).slice(0, COUNT);

/* ── الأستاذ ── */
const STARTS = ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30"];
const sse = { opened: 0, events: 0, failed: 0 };
let done = 0, signed = 0, wrongCivilOk = 0, blockedByRate = 0;
const failures = new Map();
const fail = step => failures.set(step, (failures.get(step) || 0) + 1);
async function teacher(index, t) {
  const base = BASES[index % BASES.length], token = encodeURIComponent(links[t.id].linkId), P = `/api/public/request/${token}`;
  const ok = r => typeof r.status === "number" && r.status < 400;
  const controller = new AbortController();
  const ip = `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`;
  const call = (b, step, path, o = {}) => baseCall(b, step, path, { ...o, ip });
  try {
    let r = await call(base, "page /r", `/r/${token}`);
    if (!ok(r)) return fail("page /r");
    r = await call(base, "GET request", P);
    if (!ok(r)) return fail("GET request");
    const req = r.json.request, items = req.items || [];
    const courseIds = [...new Set(items.map(i => i.before?.courseId).filter(Boolean))];
    if (courseIds.length) await call(base, "GET day-habits", `${P}/day-habits?courses=${courseIds.join(",")}`);
    /* البثُّ الحيّ: يبقى مفتوحاً طوال جلسة الأستاذ. */
    fetch(base + `${P}/events`, { signal: controller.signal, headers: NAT ? {} : { "x-forwarded-for": ip } }).then(async res => {
      sse.opened++; const reader = res.body.getReader(); const dec = new TextDecoder();
      try { for (;;) { const { value, done: end } = await reader.read(); if (end) break; sse.events += (dec.decode(value).match(/^event:/gm) || []).length; } } catch {}
    }).catch(() => { if (!controller.signal.aborted) sse.failed++; });

    const roll = Math.random() * 100;
    await sleep(500 + Math.random() * 2000); /* يقرأ الصفحة */
    const payload = items.map(i => ({ rowId: i.rowId, action: "keep", days: [], start: "" }));
    let note = "";
    if (roll >= 40 && roll < 75 && items.length) {                     /* تعديل موعد */
      const at = Math.floor(Math.random() * items.length), item = items[at];
      const days = Math.random() < 0.15 ? ["fsunday", "ftuesday"] : (item.slots || []).map(s => s.day);
      const start = pick(STARTS);
      payload[at] = { rowId: item.rowId, action: "change", days, start };
      const body = { itemIndex: at, rowId: item.rowId, action: "change", days, start, items: payload };
      await call(base, "POST check", `${P}/check`, { method: "POST", body });
      await call(base, "POST check-times", `${P}/check-times`, { method: "POST", body: { itemIndex: at, items: payload, starts: STARTS } });
    } else if (roll >= 75 && roll < 85 && items.length) {              /* حذف */
      const at = Math.floor(Math.random() * items.length);
      payload[at] = { rowId: items[at].rowId, action: "delete", days: [], start: "" };
    } else if (roll >= 85 && roll < 95 && r.json.courses?.length) {    /* إضافة */
      const c = pick(r.json.courses);
      const add = { rowId: null, action: "add", courseId: c.id, collegeId: c.collegeId, sectionId: c.sectionId, days: ["fsunday", "ftuesday"], start: pick(STARTS) };
      payload.push(add);
      await call(base, "POST check", `${P}/check`, { method: "POST", body: { itemIndex: payload.length - 1, action: "add", courseId: c.id, collegeId: c.collegeId, sectionId: c.sectionId, days: add.days, start: add.start, items: payload } });
    }
    if (roll < 40) { await sleep(HOLD * Math.random()); return void done++; }   /* قرأ ولم يرسل */
    if (roll >= 95) {                                                   /* يخطئ في رقمه ثم يصيب */
      const wrong = await call(base, "POST submit(wrong civil)", P, { method: "POST", body: { civil: "000000000000", items: payload, note } });
      if (wrong.status === 429) blockedByRate++; else if (ok(wrong)) wrongCivilOk++;
    }
    const sent = await call(base, "POST submit", P, { method: "POST", body: { civil: t.civil, items: payload, note } });
    if (!ok(sent)) { if (sent.status === 429) blockedByRate++; return fail("POST submit"); }
    signed++;
    await call(base, "GET request(again)", P);
    await call(base, "GET movement", `${P}/movement`);
    await sleep(HOLD * Math.random());
    done++;
  } finally { controller.abort(); }
}

const started = performance.now(), running = [];
for (let i = 0; i < crowd.length; i++) { running.push(teacher(i, crowd[i]).catch(() => fail("exception"))); await sleep(1000 / RATE); }
await Promise.all(running);
const seconds = (performance.now() - started) / 1000;

/* ── شاشة القسم بألف طلب ── */
const inbox = [];
for (const sectionId of seed.sections) {
  const t = performance.now();
  const r = await call(BASES[0], "admin GET inbox", `/api/instructor-requests?collegeId=${seed.collegeId}&sectionId=${sectionId}&termId=${seed.termId}`, { cookie: adminCookie });
  inbox.push({ sectionId, status: r.status, ms: Math.round(performance.now() - t), rows: r.json?.rows?.length, kb: Math.round(r.text.length / 1024) });
}

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0;
const rows = [...stats].map(([step, s]) => { const sorted = s.ms.slice().sort((a, b) => a - b); return { step, n: sorted.length, p50: Math.round(pct(sorted, 50)), p95: Math.round(pct(sorted, 95)), p99: Math.round(pct(sorted, 99)), max: Math.round(sorted.at(-1) || 0), codes: JSON.stringify(Object.fromEntries(s.codes)) }; });
const total = rows.reduce((n, r) => n + r.n, 0);
const summary = { teachers: crowd.length, ratePerSecond: RATE, seconds: Math.round(seconds), bases: BASES.length, journeysOk: done + signed - 0, signed, failures: Object.fromEntries(failures), requests: total, requestsPerSecond: Math.round(total / seconds), sse, wrongCivilAccepted: wrongCivilOk, rateLimited429: blockedByRate, inbox };
console.log(JSON.stringify(summary, null, 2)); console.table(rows);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ summary, rows }, null, 2));
process.exit(0);
