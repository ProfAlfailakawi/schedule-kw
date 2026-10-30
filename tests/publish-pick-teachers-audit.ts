/**
 * «نشر ← بطاقة الأستاذ ← لمن؟ ← أساتذة محددون» — رحلةٌ حيّة على صندوق الديمو (خادمٌ خاصٌّ بمنفذٍ خاص):
 *   P1 قائمةُ «من يمكن أن يُرسَل إليه» هي أساتذةُ جدول العائلة، بلا «هيئة تدريسية» ولا رقمٍ مدني؛
 *   P2 قائمةٌ فارغة (أو غيرُ قائمة، أو معرّفٌ من خارج العائلة) تُرفض ولا تصير «للجميع»، ولا يُكتب شيء؛
 *   P3 الإرسالُ لمختارين يُنشئ/يحدّث طلباتهم وحدهم بالموعد المختار — وطلباتُ غيرهم وروابطُهم كما هي؛
 *   P4 ولا يغيّر الموعدَ العام لبطاقات العائلة؛ وصفةُ «للعرض فقط» تصل المختارين وحدهم؛
 *   P5 الواجهة: ورقةُ «لم نصل بعد» تسبق الإرسالَ المحدد، والقائمةُ تُرسل ولو فارغةً فيرفضها الخادم.
 */
import { spawn, type ChildProcess } from "child_process";
import fs from "node:fs";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { normalizeInstructorDeadline } from "../src/utils/instructorRequestWindows";

const PORT = Number(process.env.PICK_FLOW_PORT || 3800 + Math.floor(Math.random() * 300));
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

function staticChecks() {
  const publish = fs.readFileSync("src/components/SchedulePublish.tsx", "utf8");
  const picker = fs.readFileSync("src/components/PublishRecipientPicker.tsx", "utf8");
  check(/guardSend\(picking \? sendPicked : create\)/.test(publish), "P5 الإرسالُ المحدد يمرّ بورقة «لم نصل بعد» (guardSend) قبل أن يُرسل");
  check(publish.includes("...(instructorIds ? { instructorIds } : {})"), "P5 القائمةُ تُرسل ولو فارغة — فيرفضها الخادم ولا تصير «للجميع»");
  check(/disabled=\{[^}]*\(picking && !pickedPeople\.length\)/.test(publish), "P5 زرُّ الإرسال معطّلٌ حتى يُختار أحد");
  check(publish.includes('if (!ids.length) { setError("اختر أستاذاً واحداً على الأقل."); return; }'), "P5 ولا يُرسل بلا اختيار وإن نُقر");
  check(picker.includes("instructorPickerPeople(") && picker.includes("<PersonChips"), "P1 سطرٌ لكل شخص (هويةٌ واحدة لسجلّيه) ومعه وسومُه");
  check(picker.includes("/api/instructor-requests/recipients"), "P1 القائمةُ من مصدر الإصدار نفسه");
  check(/sendMode !== "ta" \? <AudiencePicker/.test(publish), "«لمن؟» للعرض والتعديل؛ ومرحلةُ التدريب تختار مدرّبيها في لوحتها");
}

async function main() {
  staticChecks();
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 1000)); }
  const login = await http("POST", "/api/auth/demo", {});
  const cookie = login.cookie!;
  await waitForDemoSeed(BASE, cookie);
  await http("POST", "/api/demo/role", { role: "admin" }, cookie);
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);

  /* ── P1 ── */
  const recipients = await A("GET", `/api/instructor-requests/recipients?${SCOPE}`);
  const people: any[] = Array.isArray(recipients.json) ? recipients.json : [];
  check(recipients.status === 200 && people.length >= 3, "P1 قائمةُ أساتذة الجدول تُقرأ", { status: recipients.status, n: people.length });
  check(people.every(p => Number(p.AdInstructorId) > 0 && String(p.AdInstructorName).trim() && Number(p.sections) >= 1), "P1 لكلٍّ اسمٌ وعددُ شعب");
  check(people.every(p => !/هيئة\s*تدريسية/.test(String(p.AdInstructorName))), "P1 لا «هيئة تدريسية» في القائمة — ليست شخصاً");
  check(people.every(p => !("AdInstructorCivil" in p)), "P1 ولا رقمٌ مدني");
  const outsider = await http("GET", `/api/instructor-requests/recipients?${SCOPE}`);
  check(outsider.status === 401 || outsider.status === 403, "P1 القائمةُ لا تُقرأ بلا جلسة", outsider.status);

  const inbox = async () => ((await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows || []) as any[];
  const staffLinks = async () => (((await A("GET", `/api/share?${SCOPE}`)).json || []) as any[]).filter(l => l.kind === "staff" && !l.revoked)
    .map(l => `${l.id}:${l.requestsCloseAt || ""}`).sort();
  const before = await inbox();
  const linksBefore = await staffLinks();

  /* ── P2 ── */
  const empty = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(3), mode: "edit", instructorIds: [] });
  check(empty.status === 400, "P2 قائمةٌ فارغة تُرفض", empty.json);
  const notList = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(3), mode: "edit", instructorIds: "all" });
  check(notList.status === 400, "P2 وغيرُ القائمة يُرفض", notList.json);
  const stranger = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: ahead(3), mode: "edit", instructorIds: [Number(people[0]?.AdInstructorId), 987654] });
  check(stranger.status === 404, "P2 ومعرّفٌ من خارج العائلة يُرفض الإرسالُ كلُّه", stranger.json);
  check(JSON.stringify((await inbox()).map(print).sort()) === JSON.stringify(before.map(print).sort()), "P2 ولم يُكتب شيء");

  /* ── P3 ── مختاران: أحدُهما بلا طلبٍ إن وُجد (يُنشأ له)، والآخرُ أيُّ أستاذٍ آخر. */
  const held = new Set(before.map(r => Number(r.AdInstructorId)));
  const fresh = people.find(p => !held.has(Number(p.AdInstructorId)));
  const pickedIds = [...new Set([Number((fresh || people[0]).AdInstructorId), Number(people.find(p => p !== (fresh || people[0]))!.AdInstructorId)])];
  const picked = new Set(pickedIds);
  const deadline = ahead(5);
  const sent = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: deadline, mode: "edit", instructorIds: pickedIds });
  const issuedIds = new Set<number>((sent.json.issued || []).map((r: any) => Number(r.instructorId)));
  check(sent.status === 200 && sent.json.picked === true, "P3 الإرسالُ المحدد يُقبل بلا سبب", sent.json);
  check(issuedIds.size === picked.size && [...issuedIds].every(id => picked.has(id)), "P3 أُصدر للمختارين وحدهم", { issued: [...issuedIds], picked: pickedIds });
  const after = await inbox();
  const others = (rows: any[]) => rows.filter(r => !picked.has(Number(r.AdInstructorId))).map(print).sort();
  check(JSON.stringify(others(after)) === JSON.stringify(others(before)), "P3 طلباتُ غير المختارين وروابطُهم وصفاتُهم كما هي تماماً");
  check(after.filter(r => !picked.has(Number(r.AdInstructorId))).length === before.filter(r => !picked.has(Number(r.AdInstructorId))).length, "P3 ولا طلبَ جديداً لغيرهم");
  const closes = normalizeInstructorDeadline(deadline);
  for (const id of pickedIds) {
    const row = (sent.json.issued || []).find((r: any) => Number(r.instructorId) === id);
    const request = after.find(r => String(r.linkId) === String(row?.linkId));
    /* طلبٌ بلا صفةٍ مكتوبة صفتُه «طلب تعديل» (linkMode()). */
    check(request && (request.linkMode || "edit") === "edit" && (row.reissued || request.window?.closesAt === closes),
      `P3 المختار ${id}: طلبُه برابطه وبالموعد المختار (أو ينتظر قرار القسم)`, request && { mode: request.linkMode, window: request.window, reissued: row.reissued });
  }
  if (fresh) check(after.some(r => Number(r.AdInstructorId) === Number(fresh.AdInstructorId)) && !held.has(Number(fresh.AdInstructorId)), "P3 من لا طلبَ له أُنشئ له طلبُه");

  /* ── P4 ── */
  check(JSON.stringify(await staffLinks()) === JSON.stringify(linksBefore), "P4 الموعدُ العام لبطاقات العائلة لم يتغيّر");
  const viewOne = await A("POST", "/api/instructor-requests/issue", { ...BODY, closesAt: deadline, mode: "view", instructorIds: [pickedIds[0]] });
  const afterView = await inbox();
  const mine = afterView.find(r => String(r.linkId) === String((viewOne.json.issued || [])[0]?.linkId));
  check(viewOne.status === 200 && (viewOne.json.issued || []).length === 1 && (mine?.linkMode === "view" || mine?.linkMode === "ta"), "P4 «للعرض فقط» لأستاذٍ واحد تصله وحده", viewOne.json);
  check(JSON.stringify(afterView.filter(r => Number(r.AdInstructorId) !== pickedIds[0]).map(print).sort())
    === JSON.stringify(after.filter(r => Number(r.AdInstructorId) !== pickedIds[0]).map(print).sort()), "P4 والبقيةُ — ومنهم المختارُ الثاني — كما هم");
}

main().catch(error => { failed++; console.error(error); }).finally(() => {
  stop();
  console.log(`\nPublish pick-teachers audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
