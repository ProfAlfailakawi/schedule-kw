/**
 * «من عنده بطاقةٌ سارية» (المالك 2026-11-14) — رحلةٌ حيّة على صندوق الديمو:
 *   C1 /live-cards لا يُقرأ بلا جلسة، ويُسمّي أصحاب البطاقات السارية بلا رقمٍ مدني ولا رابط؛
 *   C2 «تكرار» (الافتراضي): الرابطُ نفسه والموعدُ الجديد؛
 *   C3 «تبديل»: رابطٌ جديد يُبطل القديم، والطلبُ نفسُه يبقى (لا طلبَ ثانياً)؛
 *   C4 «تخطّي»: من يُتخطّى لا يُمسّ طلبُه ولا رابطُه؛
 *   C5 السجلُّ يقول ما حدث (جديد/جُدّد/بُدّل/تُخطّي).
 */
import { spawn, type ChildProcess } from "child_process";
import fs from "node:fs";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { normalizeInstructorDeadline } from "../src/utils/instructorRequestWindows";

const PORT = Number(process.env.CARDS_FLOW_PORT || 3800 + Math.floor(Math.random() * 300));
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};
async function http(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set ? set.split(";")[0] : undefined };
}
let child: ChildProcess | null = null;
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
const SCOPE = "collegeId=1&sectionId=1&termId=1";
const BODY = { collegeId: 1, sectionId: 1, termId: 1, source: "draft" };
const ahead = (days: number) => { const d = new Date(Date.now() + days * 86400000); return `${d.toISOString().slice(0, 10)}T22:30`; };

/* بصمةُ طلبٍ: ما يجب ألّا يتغيّر لمن لم يُختر. */
const print = (r: any) => JSON.stringify([r.id, r.linkId, r.linkMode, r.status, r.window?.opensAt, r.window?.closesAt, r.requestRevision ?? null, (r.items || []).length]);

async function main() {
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 1000)); }
  const login = await http("POST", "/api/auth/demo", {});
  const cookie = login.cookie!;
  await waitForDemoSeed(BASE, cookie);
  await http("POST", "/api/demo/role", { role: "admin" }, cookie);
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);
  const recipients = await A("GET", `/api/instructor-requests/recipients?${SCOPE}`);
  const people: any[] = Array.isArray(recipients.json) ? recipients.json : [];
  const allIds = people.map(p => Number(p.AdInstructorId));
  const inbox = async () => ((await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows || []) as any[];
  const mineOf = async (id: number) => (await inbox()).filter(r => Number(r.AdInstructorId) === id && r.status !== "superseded");
  const live = async () => ((await A("GET", `/api/instructor-requests/live-cards?${SCOPE}`)).json.cards || []) as any[];

  /* C1 */
  const noSession = await http("GET", `/api/instructor-requests/live-cards?${SCOPE}`);
  check(noSession.status === 401 || noSession.status === 403, "C1 /live-cards لا يُقرأ بلا جلسة", noSession.status);
  const sendFirst = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(5), mode: "edit", instructorIds: allIds });
  check(sendFirst.status === 200, "تجهيز: إرسالٌ أول لكل الأساتذة", sendFirst.json);
  const cards = await live();
  /* من أرسل طلبَه وينتظر قرار القسم لا يُستبدل رابطُه: نختار من لم يُرسل. */
  const free = cards.filter(c => c.awaiting === false).map(c => Number(c.instructorId));
  const [id1, id2] = free;
  check(free.length >= 2, "تجهيز: أستاذان بطاقتُهما سارية ولم يُرسلا طلبَهما", cards);
  check(cards.some(c => c.awaiting === true), "C1 ومن أرسل طلبه وينتظر القسم يُعلَّم awaiting (لا يُمسّ)");
  const c1 = cards.find(c => c.instructorId === id1);
  check(c1 && c1.awaiting === false && String(c1.name).trim() && c1.closesAt, "C1 صاحبُ بطاقةٍ سارية يظهر باسمه وموعده", cards);
  check(cards.every(c => !("AdInstructorCivil" in c) && !("linkId" in c) && !("linkId" in c)), "C1 بلا رقمٍ مدني ولا رابط");

  /* C2 تكرار: الرابطُ نفسه والموعدُ الجديد */
  const linkBefore = (await mineOf(id1))[0]?.linkId;
  const newer = ahead(9);
  const repeat = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: newer, mode: "edit", instructorIds: [id1] });
  const afterRepeat = (await mineOf(id1))[0];
  check(repeat.status === 200 && afterRepeat?.linkId === linkBefore, "C2 «تكرار»: الرابطُ نفسه", { before: linkBefore, after: afterRepeat?.linkId });
  check((await mineOf(id1)).length === 1, "C2 ولا طلبَ ثانياً");

  /* C3 تبديل: رابطٌ جديد يُبطل القديم */
  const replace = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: newer, mode: "edit", instructorIds: [id1], cardAction: "replace" });
  const afterReplace = await mineOf(id1);
  check(replace.status === 200 && afterReplace.length === 1, "C3 «تبديل»: الطلبُ نفسه لا ثانٍ", afterReplace.length);
  check(afterReplace[0]?.linkId && afterReplace[0].linkId !== linkBefore, "C3 الرابطُ جديدٌ يختلف عن القديم", { before: linkBefore, after: afterReplace[0]?.linkId });
  const stale = await A("GET", `/api/share/${encodeURIComponent(String(linkBefore))}`);
  check(stale.status !== 200 || stale.json?.revoked === true || /منته|موقوف|revoked/i.test(JSON.stringify(stale.json)), "C3 والرابطُ القديم لم يعد يعمل", { status: stale.status });

  /* C4 تخطّي: من يُتخطّى لا يُمسّ */
  const print = (r: any) => JSON.stringify([r.id, r.linkId, r.linkMode, r.status, r.window?.closesAt]);
  const before2 = (await mineOf(id2)).map(print);
  const skip = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(12), mode: "edit", instructorIds: [id1, id2], skipInstructorIds: [id2] });
  const issuedIds = (skip.json.issued || []).map((r: any) => Number(r.instructorId));
  check(skip.status === 200 && issuedIds.includes(id1) && !issuedIds.includes(id2), "C4 المتخطَّى لا يُصدَر له", skip.json);
  check(JSON.stringify((await mineOf(id2)).map(print)) === JSON.stringify(before2), "C4 وطلبُه ورابطُه وموعدُه كما هي");
  const skipAll = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(12), mode: "edit", skipInstructorIds: [id2] });
  check(skipAll.status === 200 && !(skipAll.json.issued || []).some((r: any) => Number(r.instructorId) === id2), "C4 وللجميع: «تخطّي» يستثني أصحابه");

  /* C5 السجل */
  const log: any[] = (await A("GET", `/api/instructor-requests/send-log?${SCOPE}`)).json || [];
  check(log.length >= 5 && log.every(e => "fresh" in e && "renewed" in e && "skipped" in e), "C5 كلُّ سطرٍ في السجل يحمل ما حدث");
  check(log.some(e => e.replaced === true), "C5 سطرُ «التبديل» موسوم");
  check(log.some(e => e.skipped >= 1), "C5 سطرُ «التخطّي» موسوم");
  check(log.every(e => new Set(e.names).size === e.names.length), "C5 لا اسمَ مكرّراً في السطر الواحد");
}

main().catch(error => { failed++; console.error(error); }).finally(() => {
  stop();
  console.log(`\nPublish live-cards audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
