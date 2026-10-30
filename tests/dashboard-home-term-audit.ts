/**
 * ── لوحة البداية تفتح على الفصل الذي تعمل فيه المؤسسة ─────────────────────────
 *
 * كانت تفتح على أحدث فصلٍ في القائمة، فإذا أُنشئ الفصلُ التالي للتخطيط فتح
 * العميدُ (لا يرى إلا المعتمد) بيتاً من صفر: أسبوعٌ فارغ و«الجدول سليم».
 *
 *  H1–H8  القاعدة وحدها (src/utils/homeTerm.ts) على فصولٍ مصنوعة.
 *  S1–S8  الأسلاك: الخادم واللوحة والقراءتان الثقيلتان والإنذار المبكر.
 *  L1–L6  حيّاً على الخادم التجريبي: فصلٌ صيفيٌّ جديد قيد الإعداد، والعميد.
 */
import fs from "node:fs";
import { chooseHomeTerm, homeTermCandidates, upcomingHomeTerm } from "../src/utils/homeTerm";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { waitForDemoSeed } from "./helpers/demoSeed";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); if (extra !== undefined) console.log(JSON.stringify(extra, null, 2).slice(0, 2000)); }
};

/* ── H: القاعدة ── */
const NOW = Date.parse("2026-10-30T09:00:00");
const terms = [
  { AdTermId: 6, AdTermName: "الفصل الثاني 2025/2026", AdTermStart: "2026-02-01", AdTermWeeks: 15, AdTermClosed: true },
  { AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 15 },
  { AdTermId: 2, AdTermName: "الفصل الثاني 2026/2027", AdTermStart: "2027-02-14", AdTermWeeks: 15 },
  { AdTermId: 9, AdTermName: "الفصل الصيفي 2026/2027" },
];
const counts = (map: Record<number, number>) => (id: number) => map[id] || 0;

{
  check(homeTermCandidates(terms, NOW)[0] === 1, "H1 الجاري تشغيلياً يُجرَّب أولاً، لا أحدثُ فصلٍ في القائمة", homeTermCandidates(terms, NOW));
  const plain = await chooseHomeTerm(terms, 0, counts({ 1: 40, 2: 13, 9: 0 }), NOW);
  check(plain.termId === 1 && !plain.explicit && !plain.fallback, "H2 بلا اختيار: الفصلُ الجاري وإن وُجد أحدثُ منه", plain);
  const deanEmptyNewest = await chooseHomeTerm(terms, 0, counts({ 1: 40, 9: 0 }), NOW);
  check(deanEmptyNewest.termId === 1, "H3 فصلٌ جديد فارغ لا يفتح البيتَ على صفر", deanEmptyNewest);
  const onlyPast = await chooseHomeTerm(terms, 0, counts({ 6: 7 }), NOW);
  check(onlyPast.termId === 6 && onlyPast.fallback, "H4 لا شيء للقارئ في الجاري: أحدثُ فصلٍ له فيه ما يُرى", onlyPast);
  const nextOnly = await chooseHomeTerm(terms, 0, counts({ 2: 4, 6: 7 }), NOW);
  check(nextOnly.termId === 2, "H5 والأحدثُ أولاً بين الفصول التي فيها شيء", nextOnly);
  const nothing = await chooseHomeTerm(terms, 0, counts({}), NOW);
  check(nothing.termId === 1 && nothing.defaultTermId === 1, "H6 لا شيء في أيّ فصل: يبقى الجاري (وتقول اللوحة إنه فارغ)", nothing);
  const chosen = await chooseHomeTerm(terms, 9, counts({ 1: 40 }), NOW);
  check(chosen.termId === 9 && chosen.explicit && chosen.defaultTermId === 1, "H7 الاختيار الصريح يُحترم ولو كان فارغاً، والافتراضُ محفوظٌ للعودة", chosen);
  const gone = await chooseHomeTerm(terms, 404, counts({ 1: 40 }), NOW);
  check(gone.termId === 1 && !gone.explicit, "H8 فصلٌ محفوظٌ زال: يرجع إلى الافتراض", gone);
  check(upcomingHomeTerm(terms, 1, NOW)?.AdTermId === 2 && upcomingHomeTerm(terms, 2, NOW)?.AdTermId === 9 && upcomingHomeTerm(terms, 9, NOW) === null,
    "H9 «الفصل القادم قيد الإعداد» أقربُ فصلٍ بعد المعروض، ولا قادمَ بعد الأخير");
  check(upcomingHomeTerm(terms, 6, NOW)?.AdTermId === 2 && ![1, 2, 6, 9].some(id => upcomingHomeTerm(terms, id, NOW)?.AdTermId === 6),
    "H10 والمغلقُ لا يُعرض قادماً أبداً");
}

/* ── S: الأسلاك ── */
{
  const read = (file: string) => fs.readFileSync(file, "utf8");
  const routes = read("src/server/routes/dashboardRoutes.ts");
  const dash = routes.slice(routes.indexOf('app.get("/api/dashboard"'), routes.indexOf('app.get("/api/journey"'));
  check(/const home = await resolveHomeTerm\(req, terms, Number\(req\.query\.termId \|\| 0\), assignedSectionIds\)/.test(dash)
    && /const latestTermId = home\.termId;/.test(dash) && !/sortTermsNewestServer\(terms\)\[0\]/.test(dash),
    "S1 /api/dashboard يقرأ فصلَه من resolveHomeTerm، لا من أحدث فصلٍ في القائمة");
  check(/sortTermsNewestServer\(terms\)\.map/.test(dash) && !/id <= latestTermId/.test(dash), "S2 خطُّ الفصول بالترتيب الزمني لا بالمعرّف");
  check(/empty: visibleCount === 0/.test(dash) && /upcoming: upcoming \?/.test(dash), "S3 الجوابُ يقول إن الفصل فارغ ويسمّي القادم");
  for (const [file, route] of [["src/server/routes/intelligenceRoutes.ts", "overview"], ["src/server/routes/intelligenceInsightRoutes.ts", "living"]]) {
    const text = read(file);
    const body = text.slice(text.indexOf(`app.get("/api/intelligence/${route}"`), text.indexOf(`app.get("/api/intelligence/${route}"`) + 400);
    check(body.includes('resolveSmartContext(req, { homeTerm: req.query.home === "1" })'), `S4 /api/intelligence/${route}?home=1 يحلّل فصلَ اللوحة نفسه`);
  }
  const ui = read("src/components/Dashboard.tsx");
  check(/termEmpty\?<section className="deck-decision level-info deck-term-empty"/.test(ui) && /const decisionSource:DecisionItem\[\]=termEmpty\?\[\]/.test(ui),
    "S5 «الجدول سليم» لا يُقال عن فصلٍ لا صفَّ فيه؛ حالةُ فراغٍ بدلها");
  check(/termScope\.pick\(\{termId\}\)/.test(ui) && /readSharedScope\(\)\.termId/.test(ui), "S6 الاختيارُ الصريح من النطاق المشترك ويُحفظ فيه");
  check(/fallbackTermId=\{home\?\.termId/.test(ui) && /fallbackTermId \}\)/.test(read("src/components/TermForecast.tsx")),
    "S7 الإنذار المبكر بلا فصلٍ مختار يقرأ فصلَ اللوحة");
  check(/\? Number\(currentTermId\(sortedTerms as any\) \|\| sortedTerms\[0\]\?\.AdTermId \|\| 0\)/.test(read("src/components/Reports.tsx")),
    "S8 التقارير (ولوحة القرار فيها): فصلٌ محفوظٌ زال يرجع إلى الجاري لا إلى أحدث فصل");
}

/* ── L: حيّاً ── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("dashboard-home-term");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(BASE + url, { ...init, headers: { cookie, ...(init.body ? { "content-type": "application/json" } : {}) } });
    return { status: response.status, json: await response.json().catch(() => null) as any };
  };
  /* كما في الإنتاج: أُنشئ الفصلُ التالي للتخطيط ولم يُعتمد فيه شيء. */
  const created = await call("/api/terms", { method: "POST", body: JSON.stringify({ AdTermName: "الفصل الصيفي 2026/2027" }) });
  const summerId = Number(created.json?.AdTermId || 0);
  check(created.status === 201 && summerId > 0, "L0 فصلٌ صيفيٌّ جديد قيد الإعداد", created);
  const admin = (await call("/api/dashboard")).json;
  check(admin?.home && admin.latestTermId !== summerId && admin.workspace.activeSchedules > 0, "L1 الإدارة: البيت على الجاري لا على الصيفي الفارغ", admin?.home);
  const role = await call("/api/demo/role", { method: "POST", body: JSON.stringify({ role: "dean" }) });
  check(role.status === 200, "L2 صفةُ العميد");
  const dean = (await call("/api/dashboard")).json;
  const week = (dean?.workspace?.weekdayLoad || []).reduce((sum: number, day: any) => sum + Number(day.count || 0), 0);
  check(dean?.latestTermId === dean?.home?.currentTermId && !dean.home.empty && dean.workspace.activeSchedules > 0 && week > 0,
    `L3 العميد يفتح على الفصل الجاري بمواعيدَ معتمدة وحملِ أسبوع (${dean?.latestTermName} · ${dean?.workspace?.activeSchedules} · ${week})`, dean?.home);
  check(dean?.home?.upcoming && dean.home.upcoming.termId !== dean.latestTermId, `L4 والشارةُ تسمّي الفصل القادم قيد الإعداد (${dean?.home?.upcoming?.termName})`, dean?.home);
  const empty = (await call(`/api/dashboard?termId=${summerId}`)).json;
  check(empty?.latestTermId === summerId && empty.home.explicit && empty.home.empty && empty.home.defaultTermId === dean.latestTermId,
    "L5 اختيارُ الصيفي صراحةً يُحترم، ويُقال إنه فارغ، ويبقى طريقُ العودة", empty?.home);
  check((empty?.history || []).every((h: any) => h.termId !== summerId || h.schedules === 0) && (dean?.history || []).length >= 2 && dean.history.every((h: any) => h.schedules > 0),
    "L6 خطُّ الفصول للعميد بلا فصلٍ فارغ، ويعدّ المعتمد وحده", dean?.history);
} finally {
  await server?.stop();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
