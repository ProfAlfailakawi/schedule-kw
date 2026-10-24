#!/usr/bin/env node
/**
 * ── اختبار تحمّل «مساري» (/me): طلبةٌ يصلون تباعاً ويمرّون بالرحلة كاملة ─────
 *
 * كلُّ طالبٍ مصطنع يمرّ بما يمرّ به الطالبُ في أول زيارة أيامَ الرغبات:
 *   الصفحة ← الحالة ← الأقسام ← «هل لي ملف؟» ← إنشاء الملف والدخول ← الصحيفة
 *   ← حفظ القسم والمنجز ← الرئيسية ← حفظ الرغبات ← عدّاد الرغبات ← الحالة مرةً أخرى.
 *
 * الوصولُ مفتوح (open model): يصل الطلبةُ بمعدّلٍ ثابت (--rate في الثانية) ولا
 * ينتظر الواصلُ خروجَ من قبله، كما في يوم الرغبات الحقيقي. والرقمُ المدني
 * مصطنعٌ صالحُ الخانة الأخيرة، فلا بيانَ حقيقياً في أي طلب.
 *
 * وضعا الشبكة:
 *   --nat     كلُّ الطلبة من عنوانٍ واحد (شبكة الجامعة أو مشغّل الجوال خلف NAT).
 *   --spread  لكل طالبٍ عنوانُه (X-Forwarded-For؛ الخادم يثق بوكيلٍ واحد).
 *
 * لا يُوجَّه إلا إلى خادمٍ محلي على محاكٍ محلي (انظر seed-emulator.ts): يرفض
 * أي عنوانٍ غير localhost، فلا يمكن أن يُطلق على الموقع الحقيقي بالخطأ.
 *
 *   node scripts/loadtest/student-door.mjs --base http://127.0.0.1:3000 --students 600 --rate 10 --nat
 */
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] && !args[at + 1].startsWith("--") ? args[at + 1] : fallback;
};
const BASE = opt("base", "http://127.0.0.1:3000");
const STUDENTS = Number(opt("students", 300));
const RATE = Number(opt("rate", 5));
const MODE = args.includes("--spread") ? "spread" : "nat";
const SECTIONS = String(opt("sections", "1,2,3")).split(",").map(Number).filter(Boolean);
const JSON_OUT = opt("json", "");

if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE)) {
  console.error(`يرفض السكربت: ${BASE} ليس خادماً محلياً. اختبار التحمّل لا يُطلق على الموقع الحقيقي.`);
  process.exit(1);
}

/* رقمٌ مدني مصطنع بخانة تحقّقٍ صحيحة (الخوارزمية نفسها في src/utils/civilId.ts). */
const WEIGHTS = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
function syntheticCivil() {
  for (;;) {
    const digits = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10));
    const check = 11 - (digits.reduce((sum, d, i) => sum + d * WEIGHTS[i], 0) % 11);
    if (check >= 0 && check <= 9) return digits.join("") + check;
  }
}
function syntheticCode() {
  for (;;) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    if (!/^(\d)\1+$/.test(code) && !"0123456789".includes(code) && !"9876543210".includes(code)) return code;
  }
}

const stats = new Map(); // step -> { ms: number[], codes: Map<status, n> }
function record(step, ms, status) {
  if (!stats.has(step)) stats.set(step, { ms: [], codes: new Map() });
  const s = stats.get(step);
  s.ms.push(ms);
  s.codes.set(status, (s.codes.get(status) || 0) + 1);
}

async function call(step, path, { method = "GET", body, cookie, ip } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (ip) headers["x-forwarded-for"] = ip;
  const started = performance.now();
  let status = 0, json = null, setCookie = "";
  try {
    const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    status = res.status;
    setCookie = res.headers.get("set-cookie") || "";
    const text = await res.text();
    try { json = JSON.parse(text); } catch { json = null; }
  } catch {
    status = "ERR";
  }
  record(step, performance.now() - started, status);
  return { status, json, setCookie };
}

let finished = 0, succeeded = 0;
const failures = new Map(); // first failing step -> count
async function student(index) {
  const ip = MODE === "spread" ? `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}` : undefined;
  const civil = syntheticCivil(), code = syntheticCode();
  const sectionId = SECTIONS[index % SECTIONS.length];
  const fail = step => { failures.set(step, (failures.get(step) || 0) + 1); };
  const ok = r => typeof r.status === "number" && r.status < 400;
  try {
    let r = await call("page /me", "/me", { ip });
    if (!ok(r)) return fail("page /me");
    r = await call("GET state", "/api/public/me/state", { ip });
    if (!ok(r)) return fail("GET state");
    r = await call("GET catalog", "/api/public/me/catalog?track=boys", { ip });
    if (!ok(r)) return fail("GET catalog");
    r = await call("POST identity", "/api/public/me/identity", { method: "POST", body: { civil }, ip });
    if (!ok(r)) return fail("POST identity");
    r = await call("POST enter(create)", "/api/public/me/enter", { method: "POST", body: { civil, code, create: true, agree: true, name: "طالب اختبار التحمل", remember: false }, ip });
    if (!ok(r)) return fail("POST enter(create)");
    const cookie = r.setCookie.split(";")[0];
    r = await call("GET plan", `/api/public/me/plan?sectionId=${sectionId}`, { cookie, ip });
    if (!ok(r)) return fail("GET plan");
    /* ما يعلّمه الطالبُ «منجزاً»: أولُ مقررين بلا مسبقات، والرغباتُ من الباقي. */
    const courses = (r.json?.plans?.[0]?.courses || []);
    const passed = courses.filter(c => !c.prereq).slice(0, 2).map(c => c.id);
    const wanted = courses.filter(c => !c.prereq && !passed.includes(c.id)).slice(0, 5).map(c => c.id);
    r = await call("PUT profile", "/api/public/me/profile", { method: "PUT", body: { sectionId, passedCourseIds: passed }, cookie, ip });
    if (!ok(r)) return fail("PUT profile");
    r = await call("GET home", "/api/public/me/home", { cookie, ip });
    if (!ok(r)) return fail("GET home");
    r = await call("PUT wishes", "/api/public/me/wishes", { method: "PUT", body: { targetUnits: 15, courseIds: wanted, constraints: {} }, cookie, ip });
    if (!ok(r)) return fail("PUT wishes");
    r = await call("GET wishes-count", "/api/public/me/wishes-count", { cookie, ip });
    if (!ok(r)) return fail("GET wishes-count");
    r = await call("GET state(again)", "/api/public/me/state", { cookie, ip });
    if (!ok(r)) return fail("GET state(again)");
    succeeded++;
  } finally {
    finished++;
  }
}

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : 0;
const started = performance.now();
const running = [];
for (let i = 0; i < STUDENTS; i++) {
  running.push(student(i));
  await new Promise(resolve => setTimeout(resolve, 1000 / RATE));
}
await Promise.all(running);
const seconds = (performance.now() - started) / 1000;

const rows = [...stats].map(([step, s]) => {
  const sorted = s.ms.slice().sort((a, b) => a - b);
  return { step, n: sorted.length, p50: Math.round(pct(sorted, 50)), p95: Math.round(pct(sorted, 95)), p99: Math.round(pct(sorted, 99)), max: Math.round(sorted[sorted.length - 1] || 0), codes: Object.fromEntries(s.codes) };
});
const total = rows.reduce((n, r) => n + r.n, 0);
const summary = {
  mode: MODE, students: STUDENTS, ratePerSecond: RATE, seconds: Math.round(seconds),
  journeysOk: succeeded, journeysFailed: STUDENTS - succeeded, successRate: `${((succeeded / STUDENTS) * 100).toFixed(1)}%`,
  requests: total, requestsPerSecond: Math.round(total / seconds), firstFailingStep: Object.fromEntries(failures),
};
console.log(JSON.stringify(summary, null, 2));
console.table(rows.map(r => ({ ...r, codes: JSON.stringify(r.codes) })));
if (JSON_OUT) (await import("node:fs")).writeFileSync(JSON_OUT, JSON.stringify({ summary, rows }, null, 2));
