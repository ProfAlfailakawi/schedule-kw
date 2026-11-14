/**
 * ── الدرجة العلمية الناقصة تمنع التوقيع كسعة الشعبة (المالك 2026-11-14) ──────────────
 *   K1 أستاذٌ له مواعيد في الجدول ولا درجةَ له: يُعدّ مرّةً واحدة (لا مرّةً لكل موعد) ويمنع `canSign`؛
 *   K2 خارجَ العدّ: المنتدبون والمتقاعدون و«هيئة تدريسية»، ومن له درجة؛ ولا عدَّ إن لم تُعرَّف درجاتٌ في النصاب؛
 *   K3 `canSign` يرفض بالرمز missing-ranks ويسمّي العدد، وبعد الاستكمال يُسمح؛ والسعةُ تسبق الدرجة في الرسالة؛
 *   K4 الخادم: `missingRanks` في حالة الاعتماد وفي حارس التوقيع نفسه، والواجهةُ تخفي «جاهز للتوقيع» وتعرض «الدرجة ناقصة»؛
 *   K5 حيٌّ على الديمو: حالةُ الاعتماد تحمل missingRanks وأسماءَهم في dataReadiness.items.
 */
import { readFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canSign, emptyApproval } from "../src/utils/approvalWorkflow";
import { computeScheduleDataReadiness, rankGapItems } from "../src/utils/scheduleDataReadiness";
import { waitForDemoSeed } from "./helpers/demoSeed";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const course = { AdCourseId: 5, CourseCode: "C101", CourseName: "مقرر", CourseCredit: 3, CourseHours: 3, MaxStudent: 30, CourseRoomType: "تدريسية", CourseTeachingMode: "theoretical" };
const room = { id: "f13", buildingCode: "012", canonicalCode: "F13", capacity: 40, roomType: "تدريسية" };
const row = (id: number, instructor: number) => ({
  id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 5, AdInstructorId: instructor, SCode: String(id),
  fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "09:15", roomId: "f13", buildingId: "012", AdRoomCode: "012", AdRoomHall: "F13",
}) as any;
const names = new Map([[7, "د. أحمد"], [8, "د. سالم"], [9, "منتدب"], [10, "متقاعد"], [11, "هيئة تدريسية"]]);
const gap = (opts: { hasRanks?: boolean; ranked?: number[]; excluded?: number[]; rows: any[] }) => computeScheduleDataReadiness({
  rows: opts.rows, courses: [course], instructorIds: new Set([7, 8, 9, 10, 11]), rooms: [room], roomTypeOptions: ["تدريسية"],
  rankGap: { hasRanks: opts.hasRanks ?? true, rankedIds: new Set(opts.ranked || []), excludedIds: new Set(opts.excluded || []), nameById: names },
});

/* K1 */
{
  const result = gap({ rows: [row(1, 7), row(2, 7), row(3, 8)] });
  const items = rankGapItems(result.items);
  check(items.length === 2 && items.map(item => item.label).sort().join("|") === ["د. أحمد", "د. سالم"].sort().join("|"), "K1 أستاذان بلا درجة يُعدّان، وأحمدُ بموعدين مرّةً واحدة", items);
  check(items.every(item => item.kind === "instructor" && item.fields.includes("الدرجة العلمية")), "K1 البندُ باسمه وحقلُه «الدرجة العلمية»");
}
/* K2 */
{
  const rows = [row(1, 7), row(2, 9), row(3, 10), row(4, 11), row(5, 8)];
  const items = rankGapItems(gap({ rows, ranked: [8], excluded: [9, 10, 11] }).items);
  check(items.length === 1 && items[0].id === "7", "K2 المنتدبُ والمتقاعد و«هيئة تدريسية» ومن له درجةٍ خارج العدّ", items);
  check(rankGapItems(gap({ rows, hasRanks: false }).items).length === 0, "K2 ولا عدَّ إن لم تُعرَّف درجاتٌ في النصاب بعد");
  check(rankGapItems(computeScheduleDataReadiness({ rows, courses: [course], instructorIds: new Set([7]), rooms: [room], roomTypeOptions: ["تدريسية"] }).items).length === 0, "K2 وبلا rankGap (استعمالٌ قديم) لا شيءَ يتغيّر");
}
/* K3 */
{
  const approval = emptyApproval(1, 5, 20);
  const blocked = canSign(approval, "committee", { blockingConflicts: 0, rowCount: 3, missingRanks: 2 });
  check(blocked.ok === false && (blocked as any).code === "missing-ranks" && blocked.message.includes("درجة"), "K3 canSign يرفض بالرمز missing-ranks وبرسالةٍ تقول الدرجة", blocked);
  check(canSign(approval, "committee", { blockingConflicts: 0, rowCount: 3, missingRanks: 0 }).ok === true, "K3 وبعد الاستكمال يُسمح");
  const both = canSign(approval, "committee", { blockingConflicts: 0, rowCount: 3, missingCapacity: 1, missingRanks: 2 });
  check((both as any).code === "missing-capacity", "K3 والسعةُ تسبق الدرجة في الرسالة حين يجتمعان");
  const conflict = canSign(approval, "committee", { blockingConflicts: 1, rowCount: 3, missingRanks: 2 });
  check((conflict as any).code === "blocking-conflicts", "K3 والتعارضُ المادي يسبقهما");
}
/* K4 */
{
  const server = readFileSync(join(ROOT, "src/server/routes/approvalsRoutes.ts"), "utf8");
  const bar = readFileSync(join(ROOT, "src/components/ApprovalBar.tsx"), "utf8");
  const sched = readFileSync(join(ROOT, "src/components/Schedules.tsx"), "utf8");
  check(server.includes("missingRanks: rankGapItems(readiness.items).length,") && /canSign\(approval, stage, \{[^}]*missingRanks: rankGapItems\(readiness\.items\)\.length/.test(server), "K4 الخادم: في حالة الاعتماد وفي حارس التوقيع نفسه");
  check(server.includes("readVisitingStatus(collegeId, sectionId, termId)") && server.includes('person.AdInstructorStatus === "retired"') && server.includes("facultyPlaceholderIds"), "K4 المنتدبون والمتقاعدون وهيئة التدريس خارج العدّ في الخادم");
  check(bar.includes("canSignNow && blockingConflicts === 0 && missingCapacity === 0 && missingRanks === 0 &&") && bar.includes("{missingRanks > 0 ? (") && !bar.includes("{ranksBlockSign ? (") && bar.includes("بلا درجة علمية") && bar.includes("onOpenInstructors"), "K4 الواجهة: لا «جاهز للتوقيع» مع درجةٍ ناقصة، والشارةُ ظاهرةٌ للجميع دائماً وتفتح «الأساتذة»");
  const pres = readFileSync(join(ROOT, "src/utils/approvalBarPresence.ts"), "utf8");
  check(pres.includes("missingRanks") && bar.includes("    missingRanks,\n"), "K4b الشريطُ يُرسم حين توجد درجاتٌ ناقصة ولو لا شيء ينتظر");
  /* زرُّ التوقيع نفسه يُعطَّل بالدرجة الناقصة كالسعة — لا الشارةُ وحدها (عيبٌ وُجد بعد النشر 2026-11-14: بقي الزرُّ مفعّلاً). */
  check(/disabled=\{busy \|\| blockingConflicts > 0 \|\| capacityBlocksSign \|\| ranksBlockSign \|\| requiredCourseFieldsBlocksSign\}/.test(bar) && bar.includes("اختر الدرجة العلمية لكل أستاذ قبل التوقيع"), "K4 زرُّ التوقيع معطّلٌ بالدرجة الناقصة وتلميحُه يقول السبب");
  check(sched.includes('onOpenInstructors={() => { if (!showMobileReadOnlyGate() && !refuseInPractice()) { setTransferTab("roster"); setTransferOpen(true); } }}'), "K4 والشارةُ تفتح أدوات الجدول على تبويب «الأساتذة» (لوحة استكمال الدرجات)");
}

/* K5 حيّ */
const PORT = Number(process.env.RANK_GAP_PORT || 4600 + Math.floor(Math.random() * 300));
const BASE = `http://127.0.0.1:${PORT}`;
let child: ChildProcess | null = null;
const stop = () => { if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } } };
async function http(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json: any = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, cookie: set ? set.split(";")[0] : undefined };
}
async function live() {
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development", PORT: String(PORT) }, stdio: "ignore", detached: true });
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/api/demo/config")).ok) break; } catch { /* يقلع */ } await new Promise(r => setTimeout(r, 1000)); }
  const login = await http("POST", "/api/auth/demo", {}); const cookie = login.cookie!;
  await waitForDemoSeed(BASE, cookie);
  await http("POST", "/api/demo/role", { role: "admin" }, cookie);
  const state = await http("GET", "/api/approvals?collegeId=1&sectionId=1&termId=1", undefined, cookie);
  const ranks = await http("GET", "/api/section-roster/ranks", undefined, cookie);
  const hasRanks = Array.isArray(ranks.json.ranks) && ranks.json.ranks.length > 0;
  check(state.status === 200 && typeof state.json.missingRanks === "number", "K5 حالةُ الاعتماد تحمل missingRanks", { status: state.status, keys: Object.keys(state.json).slice(0, 12) });
  const gapItems = (state.json.dataReadiness?.items || []).filter((item: any) => item.kind === "instructor");
  check(!hasRanks || state.json.missingRanks === gapItems.length, "K5 والعدّادُ = أسماءُ بنود dataReadiness (instructor)", { missing: state.json.missingRanks, items: gapItems.length });
  check(!hasRanks || state.json.missingRanks > 0, "K5 في الديمو أساتذةٌ بلا درجة فيُعدّون", state.json.missingRanks);
  /* بعد إسناد درجةٍ لواحدٍ منهم ينقص العدّ بواحد */
  if (hasRanks && gapItems.length) {
    const target = Number(gapItems[0].id);
    const set = await http("PUT", `/api/section-roster/${target}`, { collegeId: 1, sectionId: 1, termId: 1, load: { rankId: ranks.json.ranks[0].id } }, cookie);
    const after = await http("GET", "/api/approvals?collegeId=1&sectionId=1&termId=1", undefined, cookie);
    check(set.status === 200 && after.json.missingRanks === state.json.missingRanks - 1, "K5 إسنادُ درجةٍ لأستاذٍ واحد ينقص العدّ بواحد", { before: state.json.missingRanks, after: after.json.missingRanks, set: set.status });
  }
}
live().catch(error => { failed++; console.error(error); }).finally(() => {
  stop();
  console.log(`\nRank gap sign audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
