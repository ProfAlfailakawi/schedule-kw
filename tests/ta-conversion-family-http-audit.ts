/**
 * ── تحويل هيئة التدريب إلى أستاذٍ من عائلة القسم، عبر الخادم الحقيقي (وضع العرض) ──
 *
 *  • الافتراضيُّ بلا اختيار: «هيئة تدريسية» كما كان.
 *  • من عائلة القسم (قائمة أستاذ المقرر نفسها): يُقبل ويأخذ مواعيد ذلك الاسم وحده.
 *  • من خارجها: 400 برسالة عربية، ولا يتغيّر شيء.
 *  • التراجع يعيد الأسماء كما كانت.
 *
 * المنفذ: TA_FAMILY_PORT (افتراضياً 3646). لا يُستعمل 3000 أبداً.
 */
import { spawn, type ChildProcess } from "child_process";
import { waitForDemoSeed } from "./helpers/demoSeed";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

const PORT = String(process.env.TA_FAMILY_PORT || "3646");
if (PORT === "3000") throw new Error("لا يُستعمل المنفذ 3000 في هذا الاختبار.");
const BASE = `http://localhost:${PORT}`;
type Res = { status: number; json: any; cookie?: string };
async function http(method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}): Promise<Res> {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
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
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { if (await serverUp()) return; await new Promise(r => setTimeout(r, 1000)); }
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
  const confirm = { "x-schedule-confirm": "ta-conversion" };

  /* نطاقٌ فيه ثلاثة أساتذة حقيقيون على الأقل (اثنان يصيران TA، وواحدٌ يبقى هدفاً). */
  const terms = ((await A("GET", "/api/terms")).json as any[]) || [];
  const sections = ((await A("GET", "/api/sections")).json as any[]) || [];
  let scope: { collegeId: number; sectionId: number; termId: number } | null = null;
  let rows: any[] = [];
  let staff: any[] = [];
  outer: for (const term of terms) {
    for (const section of sections.slice(0, 12)) {
      const q = `collegeId=${section.AdCollegeId}&sectionId=${section.AdSectionId}&termId=${term.AdTermId}`;
      const state = (await A("GET", `/api/schedules/ta-conversion?${q}`)).json;
      if (!state?.allowed) continue;
      const found = ((await A("GET", `/api/schedules?${q}`)).json as any[]) || [];
      const roster = ((await A("GET", `/api/instructors?${q}`)).json as any[]) || [];
      const real = roster.filter(p => found.some(r => Number(r.AdInstructorId) === Number(p.AdInstructorId)) && !/هيئة تدريسية/.test(String(p.AdInstructorName)));
      if (real.length >= 3) { scope = { collegeId: Number(section.AdCollegeId), sectionId: Number(section.AdSectionId), termId: Number(term.AdTermId) }; rows = found; staff = real; break outer; }
    }
  }
  check(Boolean(scope), "في العرض نطاقٌ قابلٌ للتعديل فيه ثلاثة أساتذة", { terms: terms.length, sections: sections.length });
  if (!scope) return;
  const q = `collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${scope.termId}`;

  /* اسمان يصيران TA بالصفة الصريحة من بطاقة الأستاذ. */
  const [ta1, ta2, keeper] = staff;
  for (const person of [ta1, ta2]) {
    const r = await A("PUT", `/api/instructors/${person.AdInstructorId}`, { ...person, AdInstructorCategory: "ta" });
    check(r.status === 200, `«${person.AdInstructorName}» صار TA`, r);
  }
  const preview = (await A("GET", `/api/schedules/ta-conversion?${q}`)).json;
  const taIds = new Set((preview.people || []).map((p: any) => Number(p.id)));
  check(taIds.has(Number(ta1.AdInstructorId)) && taIds.has(Number(ta2.AdInstructorId)), "المعاينة تعرض الاسمين", preview.people);
  const family = new Set((preview.familyIds || []).map(Number));
  check(family.has(Number(keeper.AdInstructorId)), "العائلة تضم أستاذاً يدرّس في القسم هذا الفصل", { keeper: keeper.AdInstructorId, family: [...family].slice(0, 20) });
  check(!family.has(Number(ta1.AdInstructorId)) && !family.has(Number(ta2.AdInstructorId)), "ولا تضم أعضاء TA أنفسهم");

  /* التنبيهات تُحسب للمختار فقط ولا تمنع. */
  const withChecks = (await A("GET", `/api/schedules/ta-conversion?${q}&targets=${ta1.AdInstructorId}:${keeper.AdInstructorId}`)).json;
  check(Array.isArray(withChecks.checks) && withChecks.checks.length === 1 && withChecks.checks[0].target === Number(keeper.AdInstructorId)
    && typeof withChecks.checks[0].clash === "boolean" && typeof withChecks.checks[0].over === "boolean", "تنبيهات المختار: تعارض ونصاب", withChecks.checks);
  check(withChecks.previewKey === preview.previewKey, "والاختيار لا يغيّر مفتاح المعاينة");

  /* من خارج العائلة: 400 عربية، ولا شيء يتغيّر. */
  let outsider: any = null;
  for (const section of sections) {
    if (Number(section.AdSectionId) === scope.sectionId) continue;
    const list = ((await A("GET", `/api/instructors?collegeId=${section.AdCollegeId}&sectionId=${section.AdSectionId}&termId=${scope.termId}`)).json as any[]) || [];
    outsider = (Array.isArray(list) ? list : []).find(p => !family.has(Number(p.AdInstructorId)) && !taIds.has(Number(p.AdInstructorId)) && !/هيئة تدريسية/.test(String(p.AdInstructorName)));
    if (outsider) break;
  }
  check(Boolean(outsider), "يوجد في الجامعة أستاذٌ خارج عائلة القسم");
  if (outsider) {
    const r = await A("POST", "/api/schedules/ta-conversion", { ...scope, previewKey: preview.previewKey, targets: { [ta1.AdInstructorId]: outsider.AdInstructorId } }, confirm);
    check(r.status === 400 && /ليس من أساتذة هذا القسم/.test(String(r.json.error || "")), "الغريب يُرفض برسالة عربية واضحة", r);
    const again = (await A("GET", `/api/schedules/ta-conversion?${q}`)).json;
    check(again.previewKey === preview.previewKey && again.affected === preview.affected, "ولا يتغيّر شيء بعد الرفض");
  }

  /* الاسم الأول إلى أستاذ القسم، والثاني يبقى على الافتراضي «هيئة تدريسية». */
  const before = new Map(rows.map(r => [Number(r.id), Number(r.AdInstructorId)]));
  const ta1Rows = rows.filter(r => Number(r.AdInstructorId) === Number(ta1.AdInstructorId)).map(r => Number(r.id));
  const ta2Rows = rows.filter(r => Number(r.AdInstructorId) === Number(ta2.AdInstructorId)).map(r => Number(r.id));
  const done = await A("POST", "/api/schedules/ta-conversion", { ...scope, previewKey: preview.previewKey, targets: { [ta1.AdInstructorId]: keeper.AdInstructorId, [ta2.AdInstructorId]: 0 } }, confirm);
  check(done.status === 200 && done.json.changed === ta1Rows.length + ta2Rows.length && Boolean(done.json.undoVersionId), "التحويل نجح بنسخةٍ للتراجع", done);
  const after = ((await A("GET", `/api/schedules?${q}`)).json as any[]) || [];
  const byId = new Map(after.map(r => [Number(r.id), r]));
  check(ta1Rows.every(id => Number(byId.get(id)?.AdInstructorId) === Number(keeper.AdInstructorId)), "مواعيد الاسم الأول صارت لأستاذ القسم المختار");
  const placeholderIds = new Set(ta2Rows.map(id => Number(byId.get(id)?.AdInstructorId)));
  const roster = ((await A("GET", `/api/instructors?${q}`)).json as any[]) || [];
  const placeholderNames = [...placeholderIds].map(id => String(roster.find(p => Number(p.AdInstructorId) === id)?.AdInstructorName || ""));
  check(placeholderIds.size === 1 && placeholderNames.every(name => /هيئة تدريسية/.test(name)), "والثاني بقي على الافتراضي «هيئة تدريسية»", placeholderNames);
  check(after.every(r => Number(r.AdSectionId) === scope!.sectionId), "ولا موعد خرج من القسم");
  check(after.length === rows.length, "وعدد المواعيد كما هو");

  /* التراجع. */
  const undo = await A("POST", `/api/intelligence/versions/${encodeURIComponent(done.json.undoVersionId)}/restore`, undefined, { "x-schedule-confirm": "restore" });
  check(undo.status === 200, "التراجع نجح", undo);
  const restored = ((await A("GET", `/api/schedules?${q}`)).json as any[]) || [];
  const slot = (r: any) => [r.AdCourseId, r.SCode, r.fstarttime, r.fsunday, r.fmonday, r.ftuesday, r.fwednesday, r.fthursday].join("|");
  const back = new Map(restored.map(r => [slot(r), Number(r.AdInstructorId)] as const));
  const expected = rows.map(r => [slot(r), before.get(Number(r.id))] as const);
  check(restored.length === rows.length && expected.every(([key, id]) => back.get(key) === id), "والتراجع أعاد كل اسمٍ إلى موعده");
}

main()
  .catch(error => { failed++; console.error(error); })
  .finally(() => {
    stopServer();
    console.log(`\n${passed} نجح، ${failed} فشل`);
    process.exit(failed ? 1 : 0);
  });
