/**
 * ── الأبوابُ المجهولة: الخطأُ يُحسب، والنجاحُ لا يُحجب ──────────────────────
 *
 * src/server/anonymousGuard.ts, asked the two questions that matter:
 *
 *   - Does a crowd stay free? A college is one NAT address: hundreds of real
 *     sessions and links from one req.ip, with the odd mistyped link among
 *     them, must never meet a 429.
 *   - Does a guesser stop? An address that only fails — sessions that do not
 *     exist, tokens that match nothing — stops costing reads.
 *
 * G1–G3   the cookie shape, and the memory of sessions that are gone;
 * G4–G6   the lookup budget: a campus passes, an inventor of ids stops;
 * G7–G11  the link pages, on a real Express server with forwarded addresses;
 * G12     and server.ts asks all of this before it asks Firestore.
 */
import fs from "node:fs";
import express from "express";
import type { AddressInfo } from "node:net";
import { createDeadSessionMemory, createLinkMissGuard, createSessionLookupBudget, isSessionIdShape } from "../src/server/anonymousGuard";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const hex = (n: number) => "0123456789abcdef".repeat(8).slice(0, n);

/* G1 — only what the server mints is ever looked up. */
check(isSessionIdShape(`sess_${hex(64)}`) && isSessionIdShape(`demo_${hex(64)}`), "G1a معرّفا الخادم (sess_ وdemo_) يُعرفان");
check(![`sess_${hex(63)}`, `sess_${hex(64)}0`, `sess_${hex(64).toUpperCase()}`, "test_session", "sess_x", "", `x_${hex(64)}`, undefined, 42]
  .some(isSessionIdShape), "G1 وما سواهما — قصيرٌ أو طويلٌ أو بحروفٍ كبيرة أو مخترَع — لا يُسأل عنه");

/* G2–G3 — a session that is gone is asked about once. */
let clock = 1_000_000;
const memory = createDeadSessionMemory({ ttlMs: 60_000, capacity: 20, now: () => clock });
memory.remember("sess_a");
check(memory.knows("sess_a") && !memory.knows("sess_b"), "G2a الجلسةُ الغائبة تُذكر، وغيرُها لا");
clock += 60_001;
check(!memory.knows("sess_a") && memory.size() === 0, "G2 وتُنسى بعد مدّتها، فلا تبقى الذاكرة إلى الأبد");
for (let i = 0; i < 100; i++) memory.remember(`sess_${i}`);
check(memory.size() === 20 && memory.knows("sess_99") && !memory.knows("sess_0"), "G3 وطوفانُ معرّفاتٍ جديدة يُخرج الأقدم ولا يكبّر الذاكرة", memory.size());

/* G4–G6 — the lookup budget. */
const campus = createSessionLookupBudget();
let campusRefused = 0;
for (let i = 0; i < 2_000; i++) {
  const attempt = campus.reserve("campus");
  if (!attempt) { campusRefused++; continue; }
  /* One stale cookie in ten: tabs left open past their session. */
  if (i % 10 !== 0) attempt.release(true);
}
check(campusRefused === 0, "G4 شبكةُ جامعة: ألفا جلسةٍ من عنوانٍ واحد، فيها مئتا جلسةٍ منتهية — لا يُردّ أحد", campusRefused);

const inventor = createSessionLookupBudget();
let asked = 0;
for (let i = 0; i < 1_000; i++) if (inventor.reserve("inventor")) asked++;
check(asked === 120, "G5 عنوانٌ يخترع معرّفات: يُسأل عن مئةٍ وعشرين، ثم تُقرأ البقيةُ مجهولةً بلا قراءة", asked);

const hidden = createSessionLookupBudget();
let hiddenAsked = 0;
for (let i = 0; i < 5_000; i++) {
  const attempt = hidden.reserve("hidden");
  if (!attempt) continue;
  hiddenAsked++;
  if (i % 2 === 0) attempt.release(true);
}
check(hiddenAsked < 2_600 && hiddenAsked > 2_000, "G6 ومن يخلط تخمينَه بنجاحاتٍ مصطنعة يقف عند السقف المطلق", hiddenAsked);

/* G7–G11 — the link pages, on a real server. */
const app = express();
app.set("trust proxy", true);
app.use("/s/:token", createLinkMissGuard());
app.get("/s/:token", (req, res) => {
  const token = String(req.params.token);
  if (token.startsWith("ok")) { res.send("page"); return; }
  if (token.startsWith("gone")) { res.status(410).send("expired"); return; }
  res.status(404).send("no such link");
});
app.get("/s/:token/extra", (_req, res) => { res.status(404).send("nothing here"); });
const server = app.listen(0);
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const open = (path: string, ip: string) => fetch(base + path, { headers: { "x-forwarded-for": ip } });
const statuses = async (paths: string[], ip: string) => {
  const out: number[] = [];
  for (const path of paths) out.push((await open(path, ip)).status);
  return out;
};

try {
  const crowd = await statuses(Array.from({ length: 1_000 }, (_, i) => i % 10 === 0 ? `/s/typo${i}` : `/s/ok${i}`), "10.0.0.1");
  check(!crowd.includes(429), "G7 جامعةٌ تفتح ألف رابط، فيها مئةٌ مكتوبةٌ خطأً — أكثرُ من حدّ المخمّن — ولا يُحجب أحد: نجاحاتُها رصيدُها", crowd.filter(s => s === 429).length);

  const guesses = await statuses(Array.from({ length: 40 }, (_, i) => `/s/guess${i}`), "10.0.0.2");
  const blocked = await open("/s/ok-real", "10.0.0.2");
  const body = await blocked.text();
  check(guesses.every(s => s === 404) && blocked.status === 429, "G8 من يخمّن أربعين رمزاً لا يطابق شيئاً يُوقَف قبل أن يُسأل عن الحادي والأربعين", { guesses: guesses.slice(-3), after: blocked.status });
  check(/روابطُ كثيرة/.test(body) && Number(blocked.headers.get("retry-after")) > 0, "G9 ويُقال له ذلك بالعربية، ومتى يعود");

  const expired = await statuses(Array.from({ length: 100 }, (_, i) => `/s/gone${i}`), "10.0.0.3");
  check(!expired.includes(429), "G10 رابطٌ انتهت صلاحيته (410) ليس تخميناً: مئةٌ منها لا تُوقف أحداً");

  const sub = await statuses(Array.from({ length: 100 }, (_, i) => `/s/ok${i}/extra`), "10.0.0.4");
  const thenPage = await open("/s/ok-after", "10.0.0.4");
  check(sub.every(s => s === 404) && thenPage.status === 200, "G11 وما تحت الرابط من طلباتٍ أخرى لا يُعدّ على القارئ", { last: sub.at(-1), page: thenPage.status });
} finally {
  server.close();
}

/* G12 — the server asks the guard before Firestore. */
const source = fs.readFileSync("server.ts", "utf8");
const auth = source.slice(source.indexOf("async function authMiddleware"), source.indexOf("async function authMiddleware") + 4_000);
const at = (needle: string) => auth.indexOf(needle);
check(at("isSessionIdShape(sessionId)") > 0 && at("isSessionIdShape(sessionId)") < at("Repository.getSession(sessionId)"), "G12a المعرّفُ المخترَع يُردّ قبل أن تُسأل قاعدةُ البيانات");
check(at("deadSessions.knows(sessionId)") > 0 && at("deadSessions.knows(sessionId)") < at("Repository.getSession(sessionId)"), "G12b والجلسةُ الغائبة تُعرف من الذاكرة قبل السؤال");
check(at("sessionLookups.reserve(") > 0 && at("sessionLookups.reserve(") < at("Repository.getSession(sessionId)") && at("lookup?.release(true)") > 0, "G12c والسؤالُ يُحجز من رصيد العنوان، ويُردّ إليه حين تُوجد الجلسة");
const logout = source.slice(source.indexOf('app.post("/api/auth/logout"'), source.indexOf('app.post("/api/auth/logout"') + 1_200);
check(/if \(isSessionIdShape\(sessionId\)\) await Repository\.deleteSession/.test(logout) && logout.includes("deadSessions.remember(sessionId)"), "G12d والخروجُ لا يكتب حذفاً لمعرّفٍ مخترَع، ويذكر الجلسةَ ميّتة");
const guardAt = source.indexOf("createLinkMissGuard()");
check(guardAt > 0 && guardAt < source.indexOf("bindPublicLinkContext);") && guardAt < source.indexOf('app.get("/r/:token"'), "G12 وحارسُ الروابط قبل صفحاتها، فيُوقَف المخمّن قبل أن تُقرأ قاعدةُ البيانات");

console.log(`\nAnonymous guard audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
