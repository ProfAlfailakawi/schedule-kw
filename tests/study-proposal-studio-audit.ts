/**
 * ── استوديو المقترح الدراسي: «ما تغيّر» والشعب الشاغرة ────────────────────────
 *
 * ١) سلوكٌ نقيّ: `proposalChangeSet` يقرأ الجدول الناتج والأشباح فيصنّف كلَّ مادة
 *    (مضاف · منقول · بديل · يخرج) ويعدّ الثابت، ويربط مفتاحَي «قبل» و«بعد» بتغييرهما،
 *    ويعرف ما تغيّر في المنقول (الأيام · الوقت · المكان) — على المعاينة الفورية
 *    (`localAfter`) بالشكل نفسه الذي يعيده المحرّك.
 * ٢) عقود: مسار الشواغر يمرّ بالفحص نفسه (`evaluateProposal`)، والإسناد بضغطة يبني
 *    العملية بالمسار نفسه (`draftToOp`)، والمساحة لم تعد محجوبةً عن الجوال.
 * ٣) حيّ (خادم العرض): كلُّ شعبةٍ شاغرةٍ تأخذ حكماً؛ «متوافقة» تعني أن إسنادها كما هي
 *    يمرّ بالفحص الكامل بلا مانعٍ ولا ملاحظة؛ وبعد إسنادها تصير «في المقترح».
 */
import fs from "node:fs";
import { spawn, type ChildProcess } from "child_process";
import type { StudyProposalOp } from "../src/types";
import { changedFields, proposalChangeSet, type GridItem } from "../src/utils/studyProposal";
import { localAfter } from "../src/components/proposal/useProposalWorkspace";
import { waitForDemoSeed } from "./helpers/demoSeed";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

/* ═══ ١) سلوكٌ نقيّ ═══════════════════════════════════════════════════════ */
const item = (key: string, rowId: number, state: GridItem["state"], days: GridItem["days"], start: string, end: string, extra: Partial<GridItem> = {}): GridItem => ({
  key, rowId, state, courseName: `مقرر ${rowId}`, courseCode: `C${rowId}`, SCode: "501", days, start, end, place: "B1 · 101", placeKnown: true, ...extra,
});

{
  const after: GridItem[] = [
    item("row:1", 1, "current", ["fsunday", "ftuesday"], "08:00", "09:15"),
    item("row:2", 2, "modified", ["fmonday", "fwednesday"], "14:00", "15:15", { opId: "e1" }),
    item("new:c1", -1000, "proposed", ["fthursday"], "10:00", "12:30", { opId: "c1" }),
    item("row:9", 9, "proposed", ["fsunday"], "12:00", "13:15", { opId: "r1" }),
    item("row:5", 5, "outside", ["fmonday"], "08:00", "09:00"),
  ];
  const ghosts: GridItem[] = [
    item("old:2", 2, "out", ["fsunday", "ftuesday"], "10:00", "11:15", { opId: "e1" }),
    item("old:3", 3, "out", ["fthursday"], "08:00", "09:15", { opId: "r1", outAction: "unassign" }),
    item("old:4", 4, "out", ["fmonday"], "11:00", "12:15", { opId: "x1", outAction: "delete" }),
  ];
  const set = proposalChangeSet(after, ghosts);
  check(set.added.length === 1 && set.added[0].opId === "c1", "شعبةٌ جديدة بلا موضعٍ قديم = «مضاف»", set.added);
  check(set.moved.length === 1 && set.moved[0].before?.key === "old:2" && set.moved[0].after?.key === "row:2", "تعديل موعدٍ قائم = «منقول» بموضعَيه قبل وبعد", set.moved);
  check(set.moved[0].fields.join() === "days,time", "المنقول يعرف ما تغيّر: الأيام والوقت لا المكان", set.moved[0].fields);
  check(set.replaced.length === 1 && set.replaced[0].before?.rowId === 3 && set.replaced[0].after?.rowId === 9, "استبدالٌ يُخرج موعداً ويُدخل غيره = «بديل»", set.replaced);
  check(set.removed.length === 1 && set.removed[0].before?.key === "old:4", "شبحٌ بلا داخلٍ = «يخرج»", set.removed);
  check(set.unchanged.length === 2 && set.unchanged.every(i => i.state === "current" || i.state === "outside"), "ما لم يمسّه المقترح «ثابت»", set.unchanged.map(i => i.key));
  check(set.all.map(c => c.kind).join() === "added,moved,replaced,removed", "الترتيب: مضاف، منقول، بديل، يخرج");
  check(set.byKey.get("old:2") === set.byKey.get("row:2") && set.byKey.get("old:2")?.kind === "moved", "مفتاحا «قبل» و«بعد» يشيران إلى التغيير نفسه (لسطر «كان…» على الجدول)");
  check(!set.byKey.has("row:1"), "الموعد الثابت لا تغيير له على الجدول");
  check(proposalChangeSet([item("draft", -1, "draft", ["fsunday"], "08:00", "09:00")], []).all.length === 0, "المحاضرة الجاري إعدادها ليست تغييراً بعد");
  check(changedFields(item("a", 1, "current", ["ftuesday", "fsunday"], "08:00", "09:15"), item("b", 1, "current", ["fsunday", "ftuesday"], "08:00", "09:15")).length === 0,
    "ترتيبُ الأيام لا يُعدّ تغييراً");
  check(changedFields(item("a", 1, "current", ["fsunday"], "08:00", "09:15"), item("b", 1, "current", ["fsunday"], "08:00", "09:15", { place: "B2 · 7" })).join() === "place",
    "تغيّر القاعة وحدها يُعلَّم «المكان»");
}

{
  /* المعاينةُ الفورية (قبل ردّ الخادم) تعطي الشكلَ نفسه: تعديلٌ = منقول، إسنادُ شاغرة = مضاف. */
  const current: GridItem[] = [
    item("row:1", 1, "current", ["fsunday", "ftuesday"], "08:00", "09:15"),
    item("row:2", 2, "current", ["fmonday", "fwednesday"], "10:00", "11:15"),
  ];
  const snap = (id: number, days: any[], s: string, e: string) => ({
    id, rev: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: id, courseName: `مقرر ${id}`, courseCode: `C${id}`, SCode: "501",
    AdInstructorId: 7, days, fstarttime: s, fendtime: e, AdRoomCode: "B1", AdRoomHall: "101",
  });
  const spec = (id: number, days: any[], s: string, e: string) => ({
    AdCollegeId: 1, AdSectionId: 1, AdCourseId: id, courseName: `مقرر ${id}`, courseCode: `C${id}`, SCode: "501", days, fstarttime: s, fendtime: e,
    AdRoomCode: "B1", AdRoomHall: "101", roomId: "r101", buildingId: "b1", locationStatus: "VERIFIED" as const,
  });
  const ops: StudyProposalOp[] = [
    { id: "e1", kind: "edit", source: snap(2, ["fmonday", "fwednesday"], "10:00", "11:15"), target: spec(2, ["fmonday", "fwednesday"], "12:30", "13:45") },
    { id: "a1", kind: "assign", source: { ...snap(30, ["fthursday"], "09:00", "11:30"), AdInstructorId: 99 }, target: spec(30, ["fthursday"], "09:00", "11:30") },
  ];
  const preview = localAfter(current, ops);
  const set = proposalChangeSet(preview.items, preview.ghosts);
  check(set.moved.length === 1 && set.moved[0].fields.join() === "time", "المعاينة الفورية: التعديل «منقول» والوقت وحده تغيّر", set.moved);
  check(set.added.length === 1 && set.added[0].after?.rowId === 30, "المعاينة الفورية: إسناد شاغرة «مضاف»", set.added);
  check(set.unchanged.length === 1 && set.unchanged[0].key === "row:1", "المعاينة الفورية: الباقي «ثابت»");
}

/* ═══ ٢) عقود المصدر ═════════════════════════════════════════════════════ */
{
  const read = (file: string) => fs.readFileSync(file, "utf8");
  const routes = read("src/server/studyProposalRoutes.ts");
  const engine = read("src/server/studyProposalEngine.ts");
  const hook = read("src/components/proposal/useProposalWorkspace.ts");
  const grid = read("src/components/proposal/ProposalWeekGrid.tsx");
  const inbox = read("src/components/InstructorInbox.tsx");
  const css = read("src/styles/14-proposal.css");
  check(/app\.post\("\/api\/study-proposals\/vacancies", staff, heavyLimit/.test(routes), "مسار الشواغر مسجَّل بصلاحية القسم وحدّ الطلبات");
  const rank = engine.slice(engine.indexOf("export async function rankVacancies"));
  check(/evaluateProposal\(deps, req, \{ \.\.\.input, ops: \[\.\.\.input\.ops, op\] \}, world\)/.test(rank), "حكم الشاغرة من الفحص الكامل نفسه على المقترح كلّه (لا حكمٌ ثانٍ)");
  check(/specOfSnapshot\(source\)/.test(rank) && /kind: "assign"/.test(rank), "الشاغرة تُفحص «كما هي» (إسنادٌ بلا تعديل)");
  check(/result\.counts\.blockers > baseBlockers/.test(rank), "شاغرةٌ تُحدث مانعاً في بقية المقترح ليست متوافقة");
  check(/draftToOp\(draftFromFaculty\(blankDraft\("assign"\), entry\), dctx\)/.test(hook), "الإسناد بضغطة يبني العملية بمسار النموذج نفسه");
  check(/proposalChangeSet\(afterItems, ghostItems\)/.test(hook), "«ما تغيّر» يُحسب من الجدول المعروض نفسه");
  check(/function DayView/.test(grid) && /WEEK_MIN_WIDTH/.test(grid), "الجدول يتحوّل إلى يومٍ واحد بخطٍّ زمني حين يضيق");
  check(/\.sp-wk-hours\{position:sticky;inset-inline-start:0/.test(css) && /\.sp-wk-corner,\.sp-wk-day\{position:sticky;inset-block-start:0/.test(css), "عمود الوقت ورأس الأيام ثابتان أثناء التمرير");
  check(/container-type:inline-size;container-name:spweek/.test(css), "التخطيط يتبع عرض الجدول لا عرض الشاشة");
  check(!/متاح من الكمبيوتر/.test(inbox) && !/min-width: 900px\)"\)\.matches\) \{\s*setNotice/.test(inbox), "مساحة المقترح لم تعد محجوبةً عن الجوال");
}

/* ═══ ٣) حيّ: خادم العرض ═══════════════════════════════════════════════════ */
const BASE = process.env.PROPOSAL_TEST_BASE || "http://localhost:3000";
type Res = { status: number; json: any; cookie?: string };
async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Res> {
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set ? set.split(";")[0] : undefined };
}
let child: ChildProcess | null = null;
const serverUp = async () => { try { return (await fetch(BASE + "/api/demo/config")).ok; } catch { return false; } };
function stopServer() {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
}
async function ensureServer() {
  if (await serverUp()) return;
  const port = new URL(BASE).port || "3000";
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: port }, stdio: "ignore", detached: true });
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

async function live() {
  await ensureServer();
  const cookie = await login();
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);
  const rows = (await A("GET", "/api/instructor-requests?collegeId=1&sectionId=1&termId=1")).json.rows as any[];
  check(Array.isArray(rows) && rows.length > 0, "في الوارد طلباتٌ للأساتذة", rows?.length);
  let tested = false;
  for (const request of rows || []) {
    const ctx = (await A("GET", `/api/study-proposals/context?requestId=${request.id}`)).json;
    if (!ctx?.faculty?.length || ctx.term?.frozen) continue;
    const first = await A("POST", "/api/study-proposals/vacancies", { requestId: request.id, ops: [] });
    check(first.status === 200 && Array.isArray(first.json.vacancies), "مسار الشواغر يجيب", first.json);
    const verdicts = first.json.vacancies as any[];
    check(verdicts.length === ctx.faculty.length && ctx.faculty.every((f: any) => verdicts.some(v => v.rowId === f.snapshot.id)),
      "لكل شعبةٍ شاغرةٍ في السياق حكمٌ واحد", { verdicts: verdicts.length, faculty: ctx.faculty.length });
    const fits = new Set(["ready", "review", "blocked", "clash", "used", "unchecked"]);
    check(verdicts.every(v => fits.has(v.fit)), "الأحكام من المجموعة المعروفة فقط", verdicts.map(v => v.fit));
    const mine = ctx.current.items as any[];
    for (const v of verdicts.filter(x => x.fit === "clash")) {
      const f = ctx.faculty.find((e: any) => e.snapshot.id === v.rowId).snapshot;
      const overlaps = mine.some(m => m.days.some((d: string) => f.days.includes(d)) && m.start < f.fendtime && f.fstarttime < m.end);
      check(overlaps && Boolean(v.clashWith), "«تتداخل» تعني تداخلاً فعلياً مع محاضرة الأستاذ وتسمّيها", v);
    }
    const ready = verdicts.find(v => v.fit === "ready");
    if (!ready) { console.log("— لا شاغرةَ متوافقة لهذا الأستاذ؛ نجرّب طلباً آخر"); continue; }
    const entry = ctx.faculty.find((e: any) => e.snapshot.id === ready.rowId);
    const op = { id: "studio-a1", kind: "assign", source: entry.snapshot, target: { ...entry.snapshot, days: entry.snapshot.days } };
    const evaluated = (await A("POST", "/api/study-proposals/evaluate", { requestId: request.id, ops: [op] })).json.evaluation;
    check(evaluated?.perOp?.["studio-a1"]?.state === "ok" && evaluated.readiness.canSend === true,
      "«متوافقة 100٪» = إسنادها كما هي يمرّ بالفحص الكامل بلا مانعٍ ولا ملاحظة", evaluated?.perOp);
    check(ready.after && ready.after.sections === ctx.current.metrics.sections + 1, "أثر الشاغرة محسوبٌ من المحرّك (شعبةٌ زائدة)", ready.after);
    const second = await A("POST", "/api/study-proposals/vacancies", { requestId: request.id, ops: [op] });
    check(second.json.vacancies.find((v: any) => v.rowId === ready.rowId)?.fit === "used", "بعد إسنادها تصير «في المقترح» ولا تُعرض للإسناد مرتين");
    const bad = await A("POST", "/api/study-proposals/vacancies", { requestId: request.id, ops: "x" });
    check(bad.status === 400, "مواد غير صالحة تُرفض", bad.status);
    tested = true;
    break;
  }
  check(tested, "وُجد في العرض أستاذٌ له شاغرةٌ متوافقة واختُبر مسارها كاملاً");
  const noAuth = await http("POST", "/api/study-proposals/vacancies", { requestId: rows?.[0]?.id, ops: [] });
  check(noAuth.status === 401 || noAuth.status === 403, "بلا جلسةٍ لا يُجاب", noAuth.status);
}

live().catch(error => { console.error(error); failed++; })
  .finally(() => { stopServer(); console.log(`\n${passed} passed, ${failed} failed`); setTimeout(() => process.exit(failed ? 1 : 0), 200); });
