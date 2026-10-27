/**
 * ── مسح الجدول بالكامل: من يملكه ومتى، ثم المسار عبر الخادم الحقيقي ─────────
 */
import { spawn, type ChildProcess } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { scheduleIsSigned, wipeDecision, type WipeContext } from "../src/utils/scheduleWipePolicy";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

/* ── القاعدة ─────────────────────────────────────────────────────────────── */
const base: WipeContext = { isAdmin: false, role: "committeeChair", termId: 7, currentTermId: 6, planningTermIds: [7], termClosed: false, approvalStatus: "drafting", signatureCount: 0 };
check(wipeDecision(base).allowed, "رئيس لجنة الجدول يمسح جدول الفصل الذي يُعَدّ");
check(wipeDecision({ ...base, isAdmin: true, role: undefined }).allowed, "والأدمن كذلك");
for (const role of ["departmentHead", "standard", "registrarHead", "dean", "advisor", undefined]) {
  check(!wipeDecision({ ...base, role }).allowed, `ولا يمسحه غيرهما (${role || "بلا صفة"})`);
}
check(!wipeDecision({ ...base, termId: 6 }).allowed, "الفصل الجاري لا يُمسح ولو لرئيس اللجنة");
check(!wipeDecision({ ...base, isAdmin: true, termId: 6 }).allowed, "ولا للأدمن");
check(!wipeDecision({ ...base, termId: 5, planningTermIds: [7] }).allowed, "ولا فصلٌ سابق");
check(!wipeDecision({ ...base, termClosed: true }).allowed, "ولا فصلٌ منتهٍ");
check(!wipeDecision({ ...base, approvalStatus: "committee", signatureCount: 1 }).allowed, "بعد التوقيع لا يمسحه رئيس اللجنة");
check(wipeDecision({ ...base, isAdmin: true, approvalStatus: "head", signatureCount: 2 }).allowed, "وبعد التوقيع يمسحه الأدمن وحده");
check(scheduleIsSigned("drafting", 1) && scheduleIsSigned("submitted", 0) && !scheduleIsSigned("drafting", 0) && !scheduleIsSigned(undefined, 0), "التوقيع: توقيعٌ واحد أو حالةٌ بعد الإعداد");

/* ── ما لا يكشفه وضع العرض (Firestore وتزامن الكتابة) ───────────────────────── */
{
  const fs = await import("node:fs");
  const server = fs.readFileSync("server.ts", "utf8");
  const restore = server.slice(server.indexOf('app.post("/api/schedules/wipe-scope/restore"'), server.indexOf("// --- SMART SCHEDULE WORKSPACE"));
  check(restore.includes("Repository.getScheduleVersionById("), "الإرجاع يقرأ النسخة كاملةً بصفوفها (قائمة Firestore بلا صفوف)");
  check(restore.includes("expectCurrentCount: 0"), "والفراغ يُفحص داخل قفل الكتابة نفسه");
  const wipe = server.slice(server.indexOf('app.post("/api/schedules/wipe-scope"'), server.indexOf('app.post("/api/schedules/wipe-scope/restore"'));
  const repo = fs.readFileSync("src/db/repository.ts", "utf8");
  check(wipe.includes("expectCurrentCount: state.rows.length") && wipe.includes("WIPE_MAX_ROWS"), "والمسح مشروطٌ بالعدد داخل القفل وبحدّ ما يُرجَع");
  check(wipe.includes("advanceInstructorRequestGeneration") && repoHasGenerationReset(), "والمسح يبدأ جيلاً جديداً للرغبات من دون حذف أرشيف الجولات السابقة");
  check((repo.match(/throw new ScopeChangedError/g) || []).length === 2, "والشرط في المسارين (Firestore والذاكرة)");
  function repoHasGenerationReset() { return repo.includes("advanceInstructorRequestGeneration") && repo.includes("scheduleGeneration: current.generation"); }
}

/* ── الخادم ──────────────────────────────────────────────────────────────── */
const BASE = process.env.WIPE_TEST_BASE || "http://localhost:3000";
type Res = { status: number; json: any; cookie?: string };
async function http(method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Promise<Res> {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set ? set.split(";")[0] : undefined };
}
const serverUp = async () => { try { return (await fetch(BASE + "/api/demo/config")).ok; } catch { return false; } };
let child: ChildProcess | null = null;
function stopServer() { if (!child?.pid) return; try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
async function ensureServer() {
  if (await serverUp()) return;
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development" }, stdio: "ignore", detached: true });
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

async function main() {
  await ensureServer();
  const cookie = await login();
  const A = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => http(method, path, body, cookie, headers);
  const terms = (await A("GET", "/api/terms")).json as any[];
  console.log("الفصول:", terms.map(t => `${t.AdTermId}:${t.AdTermName}:${t.AdTermClosed}`).join(" | "));
  const scopeQ = (termId: number) => `collegeId=1&sectionId=1&termId=${termId}`;
  const rowsOf = async (termId: number) => (await A("GET", `/api/schedules?${scopeQ(termId)}`)).json as any[];

  /* الفصل الجاري: الحالة تقول لا، والمسح يُرفض ولو بكل التأكيدات. */
  const statuses = await Promise.all(terms.map(async t => ({ t, s: (await A("GET", `/api/schedules/wipe-scope?${scopeQ(Number(t.AdTermId))}`)).json })));
  const current = statuses.find(x => !x.s.canWipe && /الجاري/.test(String(x.s.reason || "")));
  check(Boolean(current), "الفصل الجاري: الحالة تمنع المسح وتقول لماذا", statuses.map(x => x.s));
  if (current) {
    const before = (await rowsOf(Number(current.t.AdTermId))).length;
    const r = await A("POST", "/api/schedules/wipe-scope", { collegeId: 1, sectionId: 1, termId: Number(current.t.AdTermId), expectedCount: before, confirmName: current.s.sectionName }, { "x-schedule-confirm": "wipe-scope" });
    check(r.status === 403, "ومسحُه يُرفض من الخادم", r);
    check((await rowsOf(Number(current.t.AdTermId))).length === before, "ولم يُمس منه صف");
  }

  /* فصلٌ يُعَدّ: يُنشأ إن لم يوجد، ويُبذر فيه جدولٌ بالنسخ من الجاري. */
  let planning = statuses.find(x => x.s.canWipe);
  if (!planning && current) {
    const name = `اختبار مسح ${Date.now()}`;
    const made = await A("POST", "/api/terms", { AdTermName: "الفصل الثاني 2099/2100", AdTermClosed: false, name });
    console.log("إنشاء فصل:", made.status, JSON.stringify(made.json).slice(0, 200));
  }
  const terms2 = (await A("GET", "/api/terms")).json as any[];
  const statuses2 = await Promise.all(terms2.map(async t => ({ t, s: (await A("GET", `/api/schedules/wipe-scope?${scopeQ(Number(t.AdTermId))}`)).json })));
  planning = statuses2.find(x => x.s.canWipe);
  check(Boolean(planning), "يوجد فصلٌ يُعَدّ يُسمح فيه بالمسح", statuses2.map(x => [x.t.AdTermName, x.s.reason]));
  if (!planning || !current) return;
  const termId = Number(planning.t.AdTermId);
  if (!(await rowsOf(termId)).length) {
    /* بذرٌ من الجدول الجاري عبر مسار الإنشاء العادي نفسه، برقم شعبةٍ جديد. */
    const source = (await rowsOf(Number(current.t.AdTermId))).slice(0, 6);
    let n = 0;
    for (const row of source) {
      const { id, rev, ...rest } = row;
      const made = await A("POST", "/api/schedules", { ...rest, AdTermId: termId, SCode: String(901 + n++) });
      if (made.status !== 201) console.log("بذر مرفوض:", made.status, JSON.stringify(made.json).slice(0, 160));
    }
  }
  const rows = await rowsOf(termId);
  check(rows.length > 0, "في الفصل الذي يُعَدّ جدولٌ للتجربة", rows.length);
  if (!rows.length) return;
  const status = (await A("GET", `/api/schedules/wipe-scope?${scopeQ(termId)}`)).json;
  check(status.canWipe && status.count === rows.length && Boolean(status.sectionName), "الحالة تعطي العدد واسم القسم", status);
  const body = { collegeId: 1, sectionId: 1, termId, expectedCount: rows.length, confirmName: status.sectionName };

  const noToken = await A("POST", "/api/schedules/wipe-scope", body);
  check(noToken.status === 409, "بلا تأكيدٍ صريح يُرفض", noToken);
  const wrongName = await A("POST", "/api/schedules/wipe-scope", { ...body, confirmName: "قسم آخر" }, { "x-schedule-confirm": "wipe-scope" });
  check(wrongName.status === 409 && wrongName.json.code === "wipe-name", "واسمُ قسمٍ لا يطابق يُرفض", wrongName);
  const wrongCount = await A("POST", "/api/schedules/wipe-scope", { ...body, expectedCount: rows.length + 1 }, { "x-schedule-confirm": "wipe-scope" });
  check(wrongCount.status === 409 && wrongCount.json.code === "wipe-count", "وعددٌ تغيّر يُرفض", wrongCount);
  check((await rowsOf(termId)).length === rows.length, "ولم يُمس شيء بعد كل الرفض");
  const otherRowsBefore = (await rowsOf(Number(current.t.AdTermId))).length;

  const wiped = await A("POST", "/api/schedules/wipe-scope", body, { "x-schedule-confirm": "wipe-scope" });
  check(wiped.status === 200 && wiped.json.deleted === rows.length && Boolean(wiped.json.backupId) && Number(wiped.json.scheduleGeneration) > 0, "المسح ينجح ويحفظ نسخة احتياطية ويبدأ جيلاً جديداً", wiped);
  check((await rowsOf(termId)).length === 0, "والجدول صار فارغاً");
  check((await rowsOf(Number(current.t.AdTermId))).length === otherRowsBefore, "وجدول الفصل الجاري لم يُمس");

  const after = (await A("GET", `/api/schedules/wipe-scope?${scopeQ(termId)}`)).json;
  check(after.canRestore && after.lastWipe?.count === rows.length, "زرُّ الإرجاع يظهر بعدد ما مُسح", after);
  const restoreNoToken = await A("POST", "/api/schedules/wipe-scope/restore", { collegeId: 1, sectionId: 1, termId, versionId: after.lastWipe?.id });
  check(restoreNoToken.status === 409, "والإرجاع بلا تأكيد يُرفض", restoreNoToken);
  const restored = await A("POST", "/api/schedules/wipe-scope/restore", { collegeId: 1, sectionId: 1, termId, versionId: after.lastWipe?.id }, { "x-schedule-confirm": "wipe-restore" });
  check(restored.status === 200 && restored.json.restored === rows.length, "الإرجاع يعيد الصفوف كلها", restored);
  const back = await rowsOf(termId);
  const key = (r: any) => [r.AdCourseId, r.SCode, r.AdInstructorId, r.fstarttime, r.fendtime, r.fsunday, r.fmonday, r.ftuesday, r.fwednesday, r.fthursday, r.AdRoomCode, r.AdRoomHall].join("|");
  check(JSON.stringify(back.map(key).sort()) === JSON.stringify(rows.map(key).sort()), "والصفوف المُرجَعة هي نفسها (المقرر والشعبة والأستاذ والوقت والقاعة)");
  const again = (await A("GET", `/api/schedules/wipe-scope?${scopeQ(termId)}`)).json;
  check(!again.canRestore, "وبعد الإرجاع لا يظهر زرُّ الإرجاع (الجدول ليس فارغاً)");
}

main()
  .catch(error => { failed++; console.error(error); })
  .finally(() => { stopServer(); console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); });
