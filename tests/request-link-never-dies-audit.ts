/**
 * رابطُ الأستاذ لا يموت إلا بيد القسم أو بانتهاء صلاحيته هو (شكوى المالك 2026-11-14:
 * «أرسلنا لمجموعة ثم لمجموعة ثانية، والرابط الأول مُسح، وهذا خطأ — ما انتهى وقتُه ولا حذفتُه»).
 *   S  حارسٌ ساكن: لا إيقافَ لرابطٍ في الإصدار إلا بالتبديل الصريح، واستبدالُ الجدول لا يُوقف رابطاً.
 *   L  رحلةٌ حيّة على صندوق الديمو (منفذ 3674): مجموعةٌ أولى ثم ثانية ثم إعادةُ إرسالٍ لأحدهم ←
 *      الرابطُ الأول نفسُه يبقى يُقرأ، ولا رابطَ جديداً له، وسجلُّ الطلب يُسجّل «أُعيد الإرسال بالرابط نفسه».
 */
import { spawn, type ChildProcess } from "child_process";
import fs from "node:fs";
import { waitForDemoSeed } from "./helpers/demoSeed";

const PORT = Number(process.env.LINK_SAFETY_PORT || 3674);
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};

function staticChecks() {
  const routes = fs.readFileSync("src/server/routes/instructorRequestsRoutes.ts", "utf8");
  const repo = fs.readFileSync("src/db/repository.ts", "utf8");
  const issue = routes.slice(routes.indexOf('app.post("/api/instructor-requests/issue"'), routes.indexOf('app.get("/api/instructor-requests/send-log"'));
  check((issue.match(/revokeShareLink\(/g) || []).length === 1 && issue.includes("if (forceNewLink) {"), "S الإصدارُ لا يُوقف رابطاً إلا بالتبديل الصريح");
  check(issue.includes("reuseLiveRequestLink(held.linkId)") && issue.includes("reuseLiveRequestLink(closedRequestOf.get(instructorId)?.linkId)"), "S إعادةُ الإرسال والجولةُ الجديدة تُعيدان استعمال الحيّ");
  check(issue.includes('"أُعيد الإرسال بالرابط نفسه"'), "S وسجلُّ الطلب يكتب إعادةَ الإرسال");
  const supersede = repo.slice(repo.indexOf("supersedeInstructorRequestsForScope: async"), repo.indexOf("المقترحات الدراسية"));
  check(!supersede.includes("revokeShareLink("), "S استبدالُ الجدول لا يُوقف رابطاً");
  const wipe = fs.readFileSync("src/server/routes/schedulesRoutes.ts", "utf8");
  check(wipe.includes("openRounds") && wipe.includes("ولم يُوقف أيّ رابط"), "S القسمُ يُخبَر بعدد الجولات قبل المسح، والتدقيقُ يقول إن لا رابطَ أُوقف");
  const wipeUi = fs.readFileSync("src/components/WipeScheduleButton.tsx", "utf8");
  check(wipeUi.includes('data-testid="wipe-open-rounds"'), "S وتظهر الجولاتُ التي ستُغلق في ورقة التأكيد");
}

async function http(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { text }; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, text, cookie: set ? set.split(";")[0] : undefined };
}
let child: ChildProcess | null = null;
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
const SCOPE = "collegeId=1&sectionId=1&termId=1";
const BODY = { collegeId: 1, sectionId: 1, termId: 1, source: "draft" };
const ahead = (days: number) => `${new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)}T22:30`;

async function liveChecks() {
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 1000)); }
  const login = await http("POST", "/api/auth/demo", {});
  const cookie = login.cookie!;
  await waitForDemoSeed(BASE, cookie);
  await http("POST", "/api/demo/role", { role: "admin" }, cookie);
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);
  const inbox = async () => ((await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows || []) as any[];
  const latestOf = async (id: number) => (await inbox()).filter(r => Number(r.AdInstructorId) === id && r.status !== "superseded")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const people: any[] = (await A("GET", `/api/instructor-requests/recipients?${SCOPE}`)).json;
  const held = new Set((await inbox()).map(r => Number(r.AdInstructorId)));
  const fresh = people.filter(p => !held.has(Number(p.AdInstructorId)));
  const [a, b] = (fresh.length >= 2 ? fresh : people).map(p => Number(p.AdInstructorId));

  /* المجموعةُ الأولى: أ. ثم الثانية: ب. */
  const first = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(3), mode: "edit", instructorIds: [a] });
  check(first.status === 200, "L الإرسالُ للمجموعة الأولى", first.json);
  const reqA = await latestOf(a);
  const linkA = String(reqA?.linkId || "");
  check(linkA && (await http("GET", `/api/public/request/${linkA}`)).status === 200, "L رابطُ المجموعة الأولى يُقرأ");
  const second = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(4), mode: "edit", instructorIds: [b] });
  check(second.status === 200, "L الإرسالُ للمجموعة الثانية", second.json);
  check((await http("GET", `/api/public/request/${linkA}`)).status === 200, "L والرابطُ الأول ما زال يُقرأ بعد الإرسال للثانية");
  /* إعادةُ الإرسال لأ بموعدٍ أبعد: الرابطُ نفسُه، وموعدٌ جديد. */
  const again = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(9), mode: "edit", instructorIds: [a, b] });
  check(again.status === 200, "L إعادةُ الإرسال للمجموعتين معاً", again.json);
  const reqA2 = await latestOf(a);
  check(String(reqA2?.linkId) === linkA, "L الرابطُ نفسُه لأ — لم يُنشأ بديلٌ", { before: linkA, after: reqA2?.linkId });
  check((await http("GET", `/api/public/request/${linkA}`)).status === 200, "L ويُقرأ");
  check(Date.parse(reqA2?.window?.closesAt || "") > Date.parse(reqA?.window?.closesAt || ""), "L بالموعد الجديد", { was: reqA?.window?.closesAt, now: reqA2?.window?.closesAt });
  check((reqA2?.timeline || []).some((e: any) => String(e.detail || "").includes("بالرابط نفسه")), "L والسجلُّ يقول: أُعيد الإرسال بالرابط نفسه", reqA2?.timeline);
  const ids = new Set((await inbox()).filter(r => Number(r.AdInstructorId) === a && r.status !== "superseded").map(r => r.id));
  check(ids.size === 1, "L وطلبٌ واحدٌ جارٍ لأ لا اثنان", [...ids]);
  const shares: any[] = (await A("GET", `/api/share?${SCOPE}`)).json || [];
  check(!shares.some(l => l.id === linkA && l.revoked), "L ولا شيءَ موقوفٌ في قائمة الروابط");
}

async function main() {
  staticChecks();
  if (process.argv.includes("--static")) return;
  await liveChecks();
}
main().catch(error => { failed++; console.error(error); }).finally(() => {
  stop();
  console.log(`\nRequest link safety audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
