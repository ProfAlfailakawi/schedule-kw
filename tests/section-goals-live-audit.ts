/**
 * ── أهداف «نزّل الشعب» على خادمٍ حقيقيّ (وضع التجربة) ──
 * المعاينة تحسب الأهداف الأربعة في طلبٍ واحد، والإنزال يعيد الحساب بالهدف نفسه في الخادم (المتصفح لا يملي صفوفاً)،
 * وبلا هدف أو بهدفٍ مجهول = «متوازن» الأصلي، والتراجع كما هو.
 */
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
let server: LiveServer | null = null;
try {
  server = await startDemoServer("section-goals");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await fetch(BASE + url, { method, headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json().catch(() => null) as any };
  };
  for (const person of (await call("GET", "/api/instructors")).body as any[]) await call("PUT", `/api/instructors/${person.AdInstructorId}`, { ...person, AdInstructorLoad: 40 });
  const scope = { collegeId: 1, sectionId: 1, termId: 1 };
  const list = async () => (await call("GET", "/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
  const before = await list();
  const catalog = ((await call("GET", "/api/courses")).body as any[]).filter(course => Number(course.AdSectionId) === 1);
  const sectionsOf = (id: number) => new Set(before.filter(row => Number(row.AdCourseId) === id).map(row => String(row.SCode))).size;
  const plain = catalog.filter(course => !String(course.CourseCompanionRoomType || "").trim() && sectionsOf(Number(course.AdCourseId)) > 0)
    .sort((a, b) => sectionsOf(Number(b.AdCourseId)) - sectionsOf(Number(a.AdCourseId)) || Number(a.AdCourseId) - Number(b.AdCourseId));
  const [grow, second] = plain.map(course => Number(course.AdCourseId));
  const base = { ...scope, targets: { [grow]: sectionsOf(grow) + 2, [second]: sectionsOf(second) + 2 } };

  const t0 = Date.now();
  const preview = await call("POST", "/api/section-build/preview", { ...base, goal: "rooms" });
  console.log(`   زمن المعاينة بالأهداف الأربعة: ${Date.now() - t0}ms`);
  check(preview.status === 200 && preview.body.goal === "rooms" && preview.body.goals?.length === 4, "المعاينة تعيد الأهداف الأربعة في طلبٍ واحد", preview.body?.goals);
  const ids = (preview.body.goals || []).map((g: any) => g.goal).join();
  check(ids === "balanced,teachers,students,rooms", "بترتيب البطاقات", ids);
  const metricsOk = (preview.body.goals || []).every((g: any) => ["placed", "pending", "notPlaced", "needed", "rooms", "buildings", "teacherSpread", "gapMinutes", "clashes"].every(k => Number.isFinite(g.metrics[k])) && Array.isArray(g.metrics.reasons) && g.metrics.clashes === 0);
  check(metricsOk, "لكل هدفٍ مقاييسه: الموضوع وغير الموضوع والقاعات والمباني والتفاوت والفراغ والتعارض");
  check(preview.body.goals.every((g: any) => g.metrics.placed + g.metrics.pending + g.metrics.notPlaced === g.metrics.needed), "الموضوع + المعلّق + غير الموضوع = المطلوب", preview.body.goals.map((g: any) => g.metrics));
  const rooms = preview.body.goals.find((g: any) => g.goal === "rooms").metrics, balanced = preview.body.goals.find((g: any) => g.goal === "balanced").metrics;
  check(rooms.rooms <= balanced.rooms, `قاعات أقل لا تزيد على المتوازن (${rooms.rooms} ≤ ${balanced.rooms})`);
  check(preview.body.totals.placeable === rooms.placed + rooms.pending, "صفوف الجدول هي صفوف الهدف المختار", preview.body.totals);
  const same = await call("POST", "/api/section-build/preview", { ...base, goal: "balanced" }), none = await call("POST", "/api/section-build/preview", base), junk = await call("POST", "/api/section-build/preview", { ...base, goal: "zzz" });
  const sig = (r: any) => JSON.stringify(r.body.rows);
  check(sig(same) === sig(none) && sig(junk) === sig(none) && none.body.goal === "balanced", "بلا هدفٍ أو بهدفٍ مجهول = «متوازن» بالصفوف نفسها");
  const lite = await call("POST", "/api/section-build/preview", { ...base, goal: "students", compare: false });
  check(lite.status === 200 && lite.body.goals === undefined && lite.body.goal === "students", "تبديل الهدف وحده بلا مقارنة");
  check((await list()).length === before.length, "المعاينة لا تكتب شيئاً");

  /* الإنزال بالهدف المختار: يعيد الخادم الحساب بالهدف نفسه فتطابق المفاتيحُ ما عُرض. */
  const pick = preview.body.rows.flatMap((r: any) => r.placements.filter((p: any) => !p.pending).map((p: any) => `${r.courseId}:${p.sectionCode}`));
  const go = { ...base, goal: "rooms", fingerprint: preview.body.fingerprint, pick, regulationException: true };
  const applied = await call("POST", "/api/section-build/apply", go);
  check(applied.status === 200 && applied.body.applied.length === pick.length, "الإنزال بالهدف يكتب ما اختير", applied.body);
  const mine = (await list()).filter(r => r.origin?.kind === "planning");
  const target = preview.body.rows.flatMap((r: any) => r.placements.filter((p: any) => !p.pending).map((p: any) => `${r.courseId}|${p.start}|${p.roomId}|${p.instructorId}`)).sort().join();
  const written = mine.map(r => `${r.AdCourseId}|${String(r.fstarttime).slice(0, 5)}|${r.roomId}|${r.AdInstructorId}`).sort().join();
  check(written === target, "الصفوف المكتوبة هي صفوف الهدف المختار بعينها", { written, target });
  check(mine.every(r => /هدف: قاعات أقل/.test(String(r.origin?.note || ""))), "ومصدرها يذكر الهدف");
  const undone = await call("POST", "/api/section-build/undo", { ...scope, batchId: applied.body.batchId });
  check(undone.status === 200 && undone.body.removed === pick.length && (await list()).length === before.length, "التراجع يمحو الدفعة والجدول يعود كما كان", undone.body);
  /* الرفض كما كان: بصمةٌ قديمة، ومفتاحٌ مزوَّر. */
  check((await call("POST", "/api/section-build/apply", { ...go, fingerprint: "قديمة" })).status === 409, "بصمةٌ قديمة تُردّ مع الهدف");
  check((await call("POST", "/api/section-build/apply", { ...go, pick: [`${grow}:999`] })).status === 409, "مفتاحٌ مزوَّر لا يبنيه الخادم مع الهدف");
  const review = await call("POST", "/api/section-build/review-rows", { ...base, goal: "students" });
  check(review.status === 200 && review.body.added === lite.body.totals.placeable, "راجع وعدّل تحمل صفوف الهدف المختار", { added: review.body?.added, placeable: lite.body.totals.placeable });
} finally {
  await server?.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
