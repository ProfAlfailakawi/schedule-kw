/**
 * ── محرك الجولة والوعي بالموقف ──
 * شاشة مصغّرة بدل المتصفح: العناصر تظهر بحسب الشاشة والأوامر، والوقت يُدار يدوياً.
 * عشر جولات كاملة عبر الأدوار، ثم ما يجب ألا يحدث: اختفاء صامت أو تكرار خطوة.
 */
import { GUIDE_FEATURES, allAllowedGuideFeatures, featureById, loadGuideProfile, type GuideFeature } from "../src/guide/smartGuide";
import { answerSteps, buildTour, type TourEnv, type TourStepSpec } from "../src/guide/tour/tours";
import { TourRunner, type TourSnapshot } from "../src/guide/tour/runner";
import { anonymizeQuestion, finishedTours, greetingFor, loadTourProgress, readSituation, saveTourProgress, situationAnswer, suggestFor, unfinishedTour } from "../src/guide/awareness";
import { clearSessionTrail, noteSessionAction, sessionTrail } from "../src/guide/sessionTrail";

let failed = 0;
const check = (ok: unknown, label: string) => { if (!ok) { failed += 1; console.error(`✗ ${label}`); } };

function harness(env: TourEnv, opts: { absent?: (s: TourStepSpec) => boolean } = {}) {
  const queue: Array<{ fn: () => void; id: number }> = [];
  let seq = 0, selection = env.selectedId || 0, state: TourSnapshot | null = null, finished: boolean | null = null;
  const log: string[] = [];
  const runner = new TourRunner<object>({
    find: s => opts.absent?.(s) ? null : {},
    command: s => log.push(`cmd:${s.command?.type}`),
    reveal: s => log.push(`reveal:${s.target}`),
    navigate: v => { log.push(`nav:${v}`); env.activeView = v; },
    bring: () => log.push("bring"),
    selection: () => selection,
    later: (fn) => { const id = ++seq; queue.push({ fn, id }); return id; },
    cancel: id => { const i = queue.findIndex(q => q.id === id); if (i >= 0) queue.splice(i, 1); },
    onChange: s => { state = s; },
    onFinish: c => { finished = c; },
  });
  const tick = (n = 1) => { for (let i = 0; i < n; i += 1) { const job = queue.shift(); job?.fn(); } };
  return { runner, tick, log, get state() { return state!; }, get finished() { return finished; }, select: (v: number) => { selection = v; } };
}
const walk = (feature: GuideFeature, env: TourEnv) => {
  const plan = buildTour(feature, env);
  const h = harness(env);
  h.runner.start(plan.steps);
  let guard = 0;
  while (h.finished === null && guard++ < 40) {
    if (h.state.status === "waiting") { h.select(99); h.tick(); continue; }
    check(h.state.status === "showing", `${feature.id}: خطوة ظاهرة (${h.state.status})`);
    h.runner.next();
  }
  check(h.finished === true, `${feature.id}: اكتملت`);
  return h;
};

const roles: Array<[string, number[], boolean, boolean]> = [["مدير", Array.from({ length: 20 }, (_, i) => i), true, true], ["قسم", [7, 8, 9, 10, 14], false, false], ["مسؤول", [2, 3, 4, 5, 6, 7, 11, 12, 15], false, true]];
const tours: Array<[string, string, Partial<TourEnv>]> = [
  ["مدير", "schedule.action.move-room", {}], ["قسم", "schedule.action.move-room", { activeView: "schedules", scheduleView: "rooms" }],
  ["قسم", "schedule.action.change-time", { activeView: "schedules" }], ["قسم", "schedule.action.change-instructor", { activeView: "schedules", selectedId: 5 }],
  ["قسم", "schedule.tool.review", {}], ["قسم", "schedule.publish", {}], ["مدير", "page.backup", {}],
  ["مسؤول", "page.users", {}], ["مسؤول", "page.courses", { activeView: "courses" }], ["قسم", "page.reportDepartment", {}],
];
for (const [role, id, patch] of tours) {
  const [, perms, root, admin] = roles.find(r => r[0] === role)!;
  const feature = allAllowedGuideFeatures(perms, root, admin).find(f => f.id === id);
  check(feature, `${role} يصل إلى ${id}`);
  if (feature) walk(feature, { activeView: "dashboard", ...patch });
}

// عطل «نقل مقرر»: من شاشة أخرى تُفتح القائمة ثم يتم الانتقال ثم تظهر خطوة فعلية.
const move = featureById("schedule.action.move-room")!;
const crossing = walk(move, { activeView: "dashboard" });
check(crossing.log.includes("reveal:page.schedules") && crossing.log.includes("nav:schedules"), "العبور بين الشاشات");
check(buildTour(move, { activeView: "schedules", scheduleView: "rooms" }).steps[0].id === "pick", "لا تكرار لفتح عرض القاعات");
check(buildTour(move, { activeView: "schedules", selectedId: 3, scheduleView: "rooms" }).steps[0].selector === '[data-row-id="3"]', "المحدد يبدأ من بطاقته");
check(buildTour(move, { activeView: "schedules", phoneReadOnly: true }).note, "الهاتف يقول الحقيقة");

check(buildTour(featureById("schedule.publish")!, { activeView: "schedules" }).steps[0].press, "النشر يفتح تبويبه");

for (const f of GUIDE_FEATURES) check(answerSteps(buildTour(f, { activeView: "x" })).length === buildTour(f, { activeView: "x" }).steps.length, `عدد خطوات الجواب والجولة: ${f.id}`);
check(buildTour(move, { activeView: "dashboard", dock: ["schedules"] }).steps[0].selector === '[data-guide-dock="schedules"]', "الطريق الظاهر قبل الدرج");
const clicked = harness({ activeView: "x" });
clicked.runner.start([{ id: "a", target: "t", navigate: "v", text: "ن" }, { id: "b", target: "u", text: "م" }]);
clicked.runner.targetClicked(0);
check(clicked.state.index === 1 && !clicked.log.includes("nav:v"), "ضغط العنصر يكمل الخطوة بلا انتقال مكرر");
clicked.runner.targetClicked(0);
check(clicked.state.index === 1 && clicked.finished === null, "ضغطة متأخرة لا تُحسب على الخطوة التالية");
clicked.runner.targetClicked(1);
check(clicked.finished === true, "ضغط آخر عنصر ينهي الجولة");

// عنصر غائب: يقال ذلك وتبقى الجولة حية.
const lost = harness({ activeView: "x" }, { absent: () => true });
lost.runner.start([{ id: "a", target: "t", text: "ن" }, { id: "b", target: "u", text: "م" }]);
lost.tick(60);
check(lost.state.status === "missing" && lost.finished === null, "الغائب لا يُخفي الجولة");
lost.tick(200);
check(lost.state.status === "missing" && lost.finished === null, "ولا تنتهي مع الزمن");
lost.runner.skipStep();
check(lost.state.index === 1, "تخطي الخطوة ممكن");

// خطوة اختيارية تُتجاوز، وانتظار الاختيار لا يتقدم وحده.
const opt = harness({ activeView: "x" }, { absent: s => s.id === "nav" });
opt.runner.start([{ id: "nav", target: "t", navigate: "v", optional: true, text: "ن" }, { id: "b", target: "u", text: "م" }]);
opt.tick(14);
check(opt.state.index === 1 && opt.log.includes("nav:v"), "عنصر قائمة غائب لا يوقف الانتقال");
const wait = harness({ activeView: "x" });
wait.runner.start([{ id: "pick", selector: "[data-row-id]", needs: "selection", text: "ن" }, { id: "b", target: "u", text: "م" }]);
wait.tick(30);
check(wait.state.status === "waiting" && wait.state.index === 0, "ينتظر الاختيار");
wait.select(4); wait.tick();
check(wait.state.index === 1, "يكمل بعد الاختيار");

// الوعي بالموقف.
const dom = (map: Record<string, Record<string, string>>) => ({ query: (s: string) => map[s] ? { getAttribute: (n: string) => map[s][n] ?? null } : null });
const blocked = readSituation("schedules", { selected: { id: 9, conflict: false, course: "س", room: "ق" } }, [], dom({ "[data-import-bar]": { "data-state": "blocked" } }));
check(blocked.dialog === "import" && situationAnswer(blocked)?.key === "import-blocked", "بعد تعثر الاستيراد يعرض الإصلاح");
check(!JSON.stringify(blocked).includes("ق\""), "الموقف لا يحمل اسم مقرر ولا قاعة");
check(greetingFor(blocked).includes("الاستيراد"), "التحية تعرف الموقع");
const conflict = readSituation("schedules", { selected: { id: 9, conflict: true } }, [], dom({}));
check(situationAnswer(conflict)?.featureId === "schedule.tool.review", "تعارض المحدد يقود إلى المراجعة");
const all = new Map(GUIDE_FEATURES.map(f => [f.id, f]));
const profile = loadGuideProfile(0);
const picked = readSituation("schedules", { selected: { id: 9 } }, [], dom({}));
const sug = suggestFor(picked, all, profile);
check(sug.length <= 3 && sug[0].id === "schedule.action.change-time", "الاقتراح يتبع المحدد");
check(suggestFor(readSituation("dashboard", {}, [], dom({ "[data-guide-blocker]": {} })), all, profile)[0].id === "schedule.tool.review", "المانع يتقدم الاقتراحات");
const editing = suggestFor(readSituation("schedules", {}, [], dom({ "[data-guide-editor-field]": {} })), all, profile);
check(editing[0].id === "schedule.action.quick-fill", "المحرر المفتوح يغيّر الاقتراح");
const restricted = new Map([...all].filter(([id]) => id !== "schedule.action.change-time"));
check(!suggestFor(picked, restricted, profile).some(f => f.id === "schedule.action.change-time"), "الاقتراح يحترم الصلاحية");
clearSessionTrail(); noteSessionAction("schedule.undo"); noteSessionAction("schedule.undo"); noteSessionAction("اسم أستاذ");
check(sessionTrail().join() === "schedule.undo", "الأثر معرّفات فقط بلا تكرار");
check(!suggestFor(readSituation("schedules", {}, sessionTrail(), dom({})), new Map([["schedule.undo", all.get("schedule.undo")!]]), profile).length, "لا يقترح ما فعلته للتو");

const box: Record<string, string> = {};
const store = { getItem: (k: string) => box[k] ?? null, setItem: (k: string, v: string) => { box[k] = v; } };
saveTourProgress(1, "page.users", { step: 2, total: 5 }, store);
check(unfinishedTour(loadTourProgress(1, store))?.step === 2, "الجولة المتروكة تُستكمل");
saveTourProgress(1, "page.users", { step: 4, total: 5, done: true }, store);
check(!unfinishedTour(loadTourProgress(1, store)) && finishedTours(loadTourProgress(1, store)).has("page.users"), "المنتهية لا تُعاد");
check(!Object.values(box).join().match(/[؀-ۿ]/), "التقدم بلا نص عربي");
check(!/أحمد/.test(anonymizeQuestion("جدول د. أحمد الكندري 123")) && !/123/.test(anonymizeQuestion("رقم 123")), "التنظيف يزيل الأسماء والأرقام");

if (failed) { console.error(`فشل جولات المرشد: ${failed}`); process.exit(1); }
console.log(`جولات المرشد سليمة: ${tours.length} جولات كاملة عبر ${roles.length} أدوار، والوعي بالموقف.`);
