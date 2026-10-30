/**
 * ── «👣 الأثر»: من فعل ماذا (docs/OWNER_FEEDBACK_2026-10-30.md، الملاحظة 9) ─────────────
 *
 *  T1  بلا خادم: جدولُ الرؤية بحرف قرار المالك — كلُّ صفةٍ ترى ما في الجدول بالضبط، لا أكثر ولا أقل.
 *  T2  بلا خادم: ما يُسجَّل — مساراتُ الكتابة وحدها، ولا «فتح» ولا POST يحسب ولا يكتب؛ وكلُّ قاعدةٍ لها مسارٌ حيّ.
 *  T3  بلا خادم: السطرُ نفسه — الفاعلُ وفريقُه والنطاقُ والنوعُ وقبل ← بعد؛ وإعادةُ حفظٍ بلا فرقٍ لا تُكتب.
 *  T4  بلا خادم: المدة — الفصلُ الجاري والسابق له فقط.
 *  T5  بلا خادم: القراءةُ خفيفة (مفهرسةٌ، محدودة، بحقولٍ مسمّاة)، ولا تعديلَ ولا حذفَ في المخزن ولا في المسارات.
 *  T6  بلا خادم: مساراتُ الكتابة المطلوبة تقول ما فعلت (noteTrail أو auditChanges).
 *  T7  خادمٌ حيّ: كلُّ صفةٍ في الصندوق تقرأ من الخادم ما في الجدول بالضبط، والأقدمُ من المدة لا يظهر.
 *  T8  خادمٌ حيّ: القراءةُ لا تُكتب؛ وتعديلٌ حقيقيّ يُكتب ببصمته، وإعادةُ الحفظ بلا فرقٍ لا تُكتب.
 *  T9  خادمٌ حيّ: العضوُ يرى حركاته هو وحدها، ورئيسُ فريقه يراها.
 *  T10 خادمٌ حيّ: للقراءة فقط — لا تعديلَ ولا حذفَ ولا إضافةَ ولو لمدير النظام.
 */
import fs from "node:fs";
import path from "node:path";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import {
  classifyTrailRoute, TRAIL_ROUTES, trailAudience, trailEntryVisible, trailPeriod, trailPersonFilterKeys, trailPersonKey, trailReadKeys,
  type ActivityTrailEntry, type TrailSeat, type TrailViewer,
} from "../src/utils/activityTrail";
import { buildTrailEntry } from "../src/server/activityTrail";
import { civilTailOf } from "../src/utils/seats";
import { currentTrailStampOwner, forgetTrailStamps, keepTrailStamp, readTrailStamp, setTrailStampOwner } from "../src/components/trail/trailStampMemory";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};
const same = (a: Iterable<unknown>, b: Iterable<unknown>) => JSON.stringify([...new Set(a)].map(String).sort()) === JSON.stringify([...new Set(b)].map(String).sort());

/* ── T1: جدولُ الرؤية ─────────────────────────────────────────────────────── */
{
  const seats: TrailSeat[] = [
    { userId: 10, role: "dean", colleges: [1], sections: [] },
    { userId: 11, role: "viceDean", colleges: [1], sections: [] },
    { userId: 15, role: "departmentHead", colleges: [1], sections: ["1:1"] },
    { userId: 30, role: "departmentHead", colleges: [1], sections: ["1:2"] },
    { userId: 40, role: "departmentHead", colleges: [2], sections: ["2:7"] },
    { userId: 16, role: "committeeChair", colleges: [1], sections: ["1:1"] },
    { userId: 31, role: "committeeChair", colleges: [1], sections: ["1:2"] },
    { userId: 19, role: "advisor", colleges: [1], sections: ["1:1"] },
    { userId: 22, role: "collegeRegistrar", colleges: [1], sections: [] },
    { userId: 32, role: "collegeRegistrar", colleges: [2], sections: [] },
    { userId: 13, role: "registrarHead", colleges: [1, 2], sections: [] },
    { userId: 12, role: "registrarDean", colleges: [1, 2], sections: [] },
    { userId: 14, role: "registrarStaff", colleges: [1], sections: ["1:1"] },
    { userId: 17, role: "standard", colleges: [1], sections: ["1:1"] },
  ];
  /* حركةٌ للرئيس في كل فريق، وأعضاءٌ في اللجنة والتسجيل، وعضوٌ «تحت رئيس القسم» ونائبُه. */
  const entry = (u: number, m = "h", dk: ActivityTrailEntry["dk"] = m === "h" ? "holder" : "member") => ({ u, m, dk, key: trailPersonKey(u, m === "h" ? undefined : m) });
  const all = [
    ...seats.map(seat => entry(seat.userId)),
    entry(16, "sara"), entry(16, "khaled"), entry(22, "huda"), entry(13, "lulwa"), entry(32, "badr"),
    entry(15, "under-head"), entry(15, "deputy-head", "deputy"),
  ];
  const keysOf = (viewer: Partial<TrailViewer> & { userId: number }) => {
    const seat = seats.find(row => row.userId === viewer.userId);
    const audience = trailAudience({ isAdmin: false, kind: "holder", seatRole: seat?.role || "standard", colleges: seat?.colleges || [], sections: seat?.sections || [], ...viewer } as TrailViewer, seats);
    return all.filter(row => trailEntryVisible(audience, row)).map(row => row.key);
  };
  const holder = (u: number) => trailPersonKey(u);
  const team = (u: number) => all.filter(row => row.u === u).map(row => row.key);
  check(same(keysOf({ userId: 0, isAdmin: true }), all.map(row => row.key)), "T1 مدير النظام يرى كلَّ شيء");
  check(same(keysOf({ userId: 10 }), [holder(11), holder(15), holder(30), trailPersonKey(15, "deputy-head")]),
    "T1 العميد: العميدُ المساعد ورؤساءُ أقسام كليته فقط — لا من تحت رئيس القسم، ولا كليةٌ أخرى", keysOf({ userId: 10 }));
  check(keysOf({ userId: 11 }).length === 0 && trailAudience({ userId: 11, isAdmin: false, kind: "holder", seatRole: "viceDean", colleges: [1], sections: [] }, seats).mode === "none",
    "T1 العميد المساعد: لا شيء");
  check(same(keysOf({ userId: 15 }), [...team(15), ...team(16), ...team(19)]),
    "T1 رئيس القسم: الجدولُ والإرشادُ في قسمه مع فرقهما (لا قسمٌ آخر ولا التسجيل)", keysOf({ userId: 15 }));
  check(same(keysOf({ userId: 16 }), team(16)), "T1 رئيس لجنة الجدول: فريقُه");
  check(same(keysOf({ userId: 19 }), team(19)), "T1 رئيس الإرشاد (مرشد القسم): فريقُه");
  check(same(keysOf({ userId: 22 }), team(22)), "T1 رئيس التسجيل (رئيس تسجيل الكلية): فريقُه");
  check(same(keysOf({ userId: 13 }), [...team(13), ...team(22), ...team(32)]), "T1 المسجّل العام: رؤساءُ التسجيل وكلُّ فرقهم", keysOf({ userId: 13 }));
  check(same(keysOf({ userId: 12 }), [...team(13), ...team(22), ...team(32)]), "T1 عميد القبول والتسجيل: المسجّلُ العام ورؤساءُ التسجيل وفرقُهم", keysOf({ userId: 12 }));
  check(same(keysOf({ userId: 16, kind: "member", memberId: "sara" }), [trailPersonKey(16, "sara")]), "T1 العضو: حركاتُه هو فقط");
  check(same(keysOf({ userId: 22, kind: "member", memberId: "huda", seatRole: "collegeRegistrar" }), [trailPersonKey(22, "huda")]), "T1 وموظفةُ التسجيل في فريقٍ: حركاتُها هي فقط");
  check(same(keysOf({ userId: 14 }), [holder(14)]) && same(keysOf({ userId: 17 }), [holder(17)]), "T1 موظفُ التسجيل بحسابه والمستخدمُ العادي: حركاتُهما فقط");
  check(same(keysOf({ userId: 16, kind: "deputy", memberId: "sara" }), team(16)), "T1 النائبُ يعمل بصفة الرئيس فيرى فريقَه");
  /* الحركةُ على فريقٍ بيد غيره (تسليمُ رئاسته بيد المسجّل العام) تُقرأ في أثر ذلك الفريق. */
  const handover = { u: 13, m: "h", dk: "holder" as const, tu: 22 };
  const audience22 = trailAudience({ userId: 22, isAdmin: false, kind: "holder", seatRole: "collegeRegistrar", colleges: [1], sections: [] }, seats);
  check(trailEntryVisible(audience22, handover), "T1 تسليمُ رئاسة فريقٍ بيد غيره يظهر في أثر ذلك الفريق");
  const keys = trailReadKeys(trailAudience({ userId: 15, isAdmin: false, kind: "holder", seatRole: "departmentHead", colleges: [1], sections: ["1:1"] }, seats), [5, 4]);
  check(keys.length === 6 && keys.every(key => key.field === "team"), "T1 القراءةُ سؤالٌ مفهرسٌ لكل فريقٍ في كل فصل", keys);
  /* مراجعة #332: حركةُ نائب رئيس القسم تحت مفتاح عضويته — والعميدُ يقرأ فريقَ رئيس القسم كلَّه ثم يصفّي. */
  const deanAudience = trailAudience({ userId: 10, isAdmin: false, kind: "holder", seatRole: "dean", colleges: [1], sections: [] }, seats);
  const deanKeys = trailReadKeys(deanAudience, [5]);
  check(deanKeys.some(key => key.field === "team" && key.value === "15:5") && deanKeys.some(key => key.field === "team" && key.value === "30:5")
    && !deanKeys.some(key => key.field === "person"), "T1 العميدُ يقرأ فرقَ رؤساء الأقسام (فلا تسقط حركةُ النائب)", deanKeys);
  const deputyRow = { u: 15, m: "deputy-head", dk: "deputy" as const, team: "15:5" };
  const underRow = { u: 15, m: "under-head", dk: "member" as const, team: "15:5" };
  check(deanKeys.some(key => key.value === deputyRow.team) && trailEntryVisible(deanAudience, deputyRow) && !trailEntryVisible(deanAudience, underRow),
    "T1 حركةُ النائب تُقرأ وتُرى، وعضوٌ تحت رئيس القسم يُقرأ ولا يُرى");
  /* مرشّحُ الشخص يُسأل بمفتاحه هو، ولمن في الرؤية وحده. */
  const headAudience = trailAudience({ userId: 15, isAdmin: false, kind: "holder", seatRole: "departmentHead", colleges: [1], sections: ["1:1"] }, seats);
  const memberAudience = trailAudience({ userId: 16, isAdmin: false, kind: "member", memberId: "sara", seatRole: "committeeChair", colleges: [1], sections: ["1:1"] }, seats);
  check(same(trailPersonFilterKeys(headAudience, [5, 4], "16~sara").map(k => k.value), ["16~sara:5", "16~sara:4"])
    && trailPersonFilterKeys(headAudience, [5], "22~huda").length === 0
    && trailPersonFilterKeys(memberAudience, [5], "16~h").length === 0
    && same(trailPersonFilterKeys(memberAudience, [5], "16~sara").map(k => k.value), ["16~sara:5"])
    && same(trailPersonFilterKeys(deanAudience, [5], "15~deputy-head").map(k => k.value), ["15~deputy-head:5"]),
    "T1 مرشّحُ الشخص: مفتاحُه هو لمن في الرؤية، ولا مفتاحَ لمن خارجها (وما يعود يُصفّى بالحكم نفسه سطراً سطراً)");
}

/* ── مراجعة #332: ذاكرةُ البصمة لصاحب الجلسة وحده ───────────────────────── */
{
  forgetTrailStamps();
  setTrailStampOwner("16::");
  keepTrailStamp(currentTrailStampOwner(), 418, { who: "د. منى", at: "2026-10-30T07:00:00Z", kind: "edit" });
  const mine = readTrailStamp(418)?.who === "د. منى";
  setTrailStampOwner("10::");
  const afterSwitch = readTrailStamp(418);
  keepTrailStamp("16::", 418, { who: "د. منى", at: "2026-10-30T07:00:00Z", kind: "edit" });
  const lateAnswer = readTrailStamp(418);
  setTrailStampOwner("16::");
  const backAgain = readTrailStamp(418);
  keepTrailStamp(currentTrailStampOwner(), 419, { who: "سارة", at: "2026-10-30T07:00:00Z", kind: "add" });
  forgetTrailStamps();
  setTrailStampOwner("17::");
  check(mine && afterSwitch === undefined && lateAnswer === undefined && backAgain === undefined && readTrailStamp(419) === undefined,
    "مراجعة: البصمةُ المحفوظة لا تصل جلسةً أخرى على الجهاز نفسه (تبديلُ الهوية والخروجُ يمحوانها، والجوابُ المتأخر لا يُحفظ لغير سائله)");
  const source = fs.readFileSync("src/App.tsx", "utf8");
  check(/forgetTrailStamps\(\);/.test(source) && /setTrailStampOwner\(user \?/.test(source) && !/new Map<number/.test(fs.readFileSync("src/components/trail/TrailStamp.tsx", "utf8")),
    "مراجعة: الواجهةُ تربط الذاكرة بالجلسة وتمحوها عند الخروج، ولا ذاكرةَ بمعرّف الموعد وحده");
  const sheet = fs.readFileSync("src/components/trail/TrailSheet.tsx", "utf8");
  check(/query\.set\("person", person\)/.test(sheet) && /query\.set\("kind", kind\)/.test(sheet) && /\[person, kind\]\);/.test(sheet),
    "مراجعة: مرشّحا الشخص والنوع يُسألان على الخادم عند كل تغيير");
}

/* ── T2: ما يُسجَّل ─────────────────────────────────────────────────────── */
{
  const views = [
    ["GET", "/schedules"], ["GET", "/schedules/5/history"], ["GET", "/activity-trail"], ["GET", "/section-requests"],
    ["POST", "/schedules/check-conflicts"], ["POST", "/schedules/suggest-slots"], ["POST", "/schedules/meeting-slots"], ["POST", "/schedules/import-preflight"],
    ["POST", "/section-build/preview"], ["POST", "/seats/switch"], ["POST", "/notifications/seen"], ["POST", "/demo/role"],
    ["POST", "/public/team/abc"], ["POST", "/schedule-holds"], ["DELETE", "/schedule-holds"], ["POST", "/telemetry/client"],
    ["POST", "/auth/login"], ["POST", "/push/subscribe"], ["POST", "/study-proposals/evaluate"], ["POST", "/intelligence/import-preview"],
  ];
  const leaked = views.filter(([method, p]) => classifyTrailRoute(method, p));
  check(leaked.length === 0, "T2 لا يُسجَّل فتحٌ ولا اطّلاع، ولا طلبٌ يحسب ولا يكتب، ولا تبديلُ صفةٍ ولا تفضيل", leaked);
  const writes: Array<[string, string, string]> = [
    ["POST", "/schedules", "add"], ["PUT", "/schedules/12", "edit"], ["DELETE", "/schedules/12", "delete"],
    ["POST", "/section-requests", "add"], ["POST", "/section-requests/ab:1/approve", "approve"], ["POST", "/section-requests/ab/register", "register"],
    ["POST", "/advisor-seats/add", "add"], ["POST", "/student-registration/n1/course-state", "register"],
    ["POST", "/approvals/sign", "approve"], ["POST", "/approvals/submit", "send"], ["POST", "/approvals/accept", "approve"],
    ["POST", "/intelligence/drafts/d1/publish", "send"], ["POST", "/plan-sheets/publish", "send"],
    ["POST", "/seats/16/handover", "handover"], ["POST", "/seats/16/members", "add"], ["POST", "/seats/16/deputy", "handover"],
  ];
  const wrong = writes.filter(([method, p, kind]) => classifyTrailRoute(method, p)?.kind !== kind);
  check(wrong.length === 0, "T2 مساراتُ الكتابة المطلوبة تُسجَّل بنوعها (الجدول، طلب الشعبة، مقاعد المرشد، التسجيل، الاعتماد، النشر، تسليم الفريق)", wrong);

  /* كلُّ قاعدةٍ في الجدول تطابق مساراً مسجّلاً فعلاً: لا قاعدةَ تموت بصمتٍ حين يتغيّر اسمُ مسار. */
  const files: string[] = ["server.ts"];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, e.name); if (e.isDirectory()) walk(full); else if (/\.ts$/.test(e.name)) files.push(full); } };
  walk("src/server");
  const routes: Array<[string, string]> = [];
  for (const file of files) {
    for (const m of fs.readFileSync(file, "utf8").matchAll(/app\.(post|put|patch|delete)\(\s*"\/api(\/[^"]*)"/g)) {
      routes.push([m[1].toUpperCase(), m[2].replace(/:(\w+)/g, (_x, name) => /^(id|rowId|exceptionId)$/.test(name) && !/mid|token|pid/.test(name) ? "123" : "x1")]);
    }
  }
  const dead = TRAIL_ROUTES.filter(r => !routes.some(([method, p]) => method === r.method && r.path.test(p))).map(r => `${r.method} ${r.path}`);
  check(routes.length > 150 && dead.length === 0, "T2 كلُّ قاعدةٍ في جدول الأثر لها مسارُ كتابةٍ حيّ", dead);
}

/* ── T3: السطرُ نفسه ─────────────────────────────────────────────────────── */
{
  const member = { SystemUserId: 16, Name: "رئيس لجنة الجدول — قسم الاختبار · سارة", Role: "committeeChair", SeatActor: { kind: "member", name: "سارة", memberId: "m1", seatName: "رئيس لجنة الجدول — قسم الاختبار", seatRole: "committeeChair" } };
  const row = buildTrailEntry({
    method: "PUT", path: "/schedules/418", user: member, term: 5, at: "2026-10-30T07:20:00.000Z",
    body: { AdCollegeId: 1, AdSectionId: 2, AdTermId: 6 },
    locals: { auditChanges: "الوقت 08:00–09:15 ← 10:00–11:15", trail: { target: "مدخل · ش501", before: "08:00–09:15", after: "10:00–11:15", row: 418 } },
  })!;
  check(Boolean(row) && row.u === 16 && row.m === "m1" && row.dk === "member" && row.who === "سارة" && row.seat === "رئيس لجنة الجدول — قسم الاختبار" && row.role === "committeeChair",
    "T3 الفاعلُ باسمه وفريقُه باسم الفريق وصفتُه", row);
  check(row.kind === "edit" && row.area === "schedule" && row.target === "مدخل · ش501" && row.before === "08:00–09:15" && row.after === "10:00–11:15" && row.detail?.includes("←"),
    "T3 ماذا، على ماذا، قبل ← بعد", row);
  check(row.c === 1 && row.s === 2 && row.t === 6 && row.term === 5 && row.row === 418 && row.team === "16:5" && row.person === "16~m1:5",
    "T3 النطاقُ وفصلُ المعدَّل، والفصلُ التشغيلي مفتاحاً للقراءة", row);
  check(buildTrailEntry({ method: "PUT", path: "/schedules/418", user: member, term: 5, locals: { trail: { skip: true } } }) === null, "T3 إعادةُ حفظٍ بلا فرقٍ لا تُكتب");
  check(buildTrailEntry({ method: "POST", path: "/schedules/check-conflicts", user: member, term: 5, locals: {} }) === null, "T3 فحصُ التعارض لا يُكتب");
  const admin = { SystemUserId: 1, Name: "مدير النظام", IsAdminUser: true };
  const handover = buildTrailEntry({ method: "POST", path: "/seats/22/handover", user: admin, term: 5, locals: { auditChanges: "تسليم رئيس تسجيل الكلية: أ ← ب" } })!;
  check(handover.kind === "handover" && handover.area === "team" && handover.tu === 22 && handover.team === "22:5" && handover.role === "admin",
    "T3 تسليمُ رئاسة فريقٍ يُكتب في أثر ذلك الفريق", handover);
  const long = buildTrailEntry({ method: "POST", path: "/approvals/sign", user: admin, term: 5, locals: { auditChanges: "س".repeat(900) } })!;
  check((long.detail || "").length <= 220 && JSON.stringify(long).length < 900, "T3 السطرُ خفيف: النصُّ مقصوص", JSON.stringify(long).length);
}

/* ── T4: المدة ─────────────────────────────────────────────────────────── */
{
  const ordered = [{ AdTermId: 7, AdTermName: "القادم" }, { AdTermId: 6, AdTermName: "الجاري" }, { AdTermId: 5, AdTermName: "السابق" }, { AdTermId: 4, AdTermName: "الأقدم" }];
  const period = trailPeriod(ordered, 6);
  check(period.current?.id === 6 && period.previous?.id === 5, "T4 المدة: الفصلُ الجاري والسابق له، لا القادم ولا الأقدم", period);
}

/* ── T5: خفيفٌ وللقراءة فقط ─────────────────────────────────────────────── */
{
  const repo = fs.readFileSync("src/db/repository.ts", "utf8");
  const trailQueries = [...repo.matchAll(/collection\("activityTrail"\)([^;\n]*)/g)].map(m => m[1]);
  const reads = trailQueries.filter(q => q.includes(".where("));
  check(reads.length === 4 && reads.every(q => /\.orderBy\("at", "desc"\)\.limit\([^)]+\)\.select\(\.\.\.ACTIVITY_TRAIL_FIELDS\)/.test(q)),
    "T5 كلُّ قراءةٍ مفهرسةٌ (حقلٌ + at) ومحدودةٌ وبحقولٍ مسمّاة", trailQueries);
  const trailApi = [...repo.matchAll(/^\s{2}(\w*ActivityTrail\w*):/gm)].map(m => m[1]);
  check(!trailQueries.some(q => /\.(update|delete)\(/.test(q)) && same(trailApi, ["appendActivityTrail", "listActivityTrail", "latestActivityTrailForRow"]),
    "T5 المخزنُ يضيف ويقرأ فقط: لا دالةَ تعدّل سطراً أو تحذفه", trailApi);
  const server = fs.readFileSync("src/server/activityTrail.ts", "utf8");
  check(!/app\.(post|put|patch|delete)\(/.test(server) && /app\.all\([^)]*activity-trail[\s\S]{0,200}405/.test(server),
    "T5 لا مسارَ كتابةٍ على الأثر، وكلُّ ما سوى القراءة 405");
  const indexes = JSON.parse(fs.readFileSync("firestore.indexes.json", "utf8")).indexes.filter((i: any) => i.collectionGroup === "activityTrail");
  check(same(indexes.map((i: any) => i.fields.map((f: any) => `${f.fieldPath}:${f.order}`).join(",")), ["team:ASCENDING,at:DESCENDING", "person:ASCENDING,at:DESCENDING", "term:ASCENDING,at:DESCENDING", "row:ASCENDING,at:DESCENDING"]),
    "T5 لكل سؤالٍ فهرسُه في firestore.indexes.json", indexes);
}

/* ── T6: المساراتُ المطلوبة تقول ما فعلت ─────────────────────────────────── */
{
  const says = (file: string, needle: RegExp) => needle.test(fs.readFileSync(file, "utf8"));
  check(says("src/server/core/scheduleWrites.ts", /noteTrail\(res, \{ target: trailTarget\(newSched\)/) && says("src/server/core/scheduleWrites.ts", /noteTrail\(res, res\.locals\.auditChanges/)
    && says("src/server/core/scheduleWrites.ts", /noteTrail\(res, \{ target: trailTarget\(sched\)/), "T6 الجدول: الإضافةُ والتعديلُ والحذفُ بالمقرر والشعبة وقبل ← بعد");
  check(says("src/server/sectionRequestsRoutes.ts", /noteTrail\(res, \{ target: `طلب شعبة/), "T6 طلبُ الشعبة باسم المقرر");
  check(says("src/server/routes/offeringRoutes.ts", /noteTrail\(res, \{ target: `مقاعد المرشد/), "T6 مقاعدُ المرشد");
  check(says("src/server/routes/studentRegistrationRoutes.ts", /noteTrail\(res, \{[\s\S]{0,120}كشف التسجيل/), "T6 علاماتُ التسجيل (بلا اسم الطالب)");
  check(says("src/server/routes/approvalsRoutes.ts", /res\.locals\.auditChanges = `توقيع/) && says("src/server/routes/approvalsRoutes.ts", /res\.locals\.auditChanges = `قبول جدول/), "T6 الاعتمادُ يقول ما فعل");
  check(says("src/server/seatsRoutes.ts", /res\.locals\.auditChanges = `تسليم/), "T6 تسليمُ الفريق يقول من ← إلى");
  check(says("server.ts", /app\.use\("\/api", activityTrailRecorder\)/), "T6 الوسيطُ مركّبٌ على /api");
}

/* ── T7–T10: خادمٌ حيّ ─────────────────────────────────────────────────── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("activity-trail");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = (url: string, init: RequestInit = {}) => fetch(BASE + url, { ...init, redirect: "manual", headers: { cookie, origin: BASE, ...(init.body ? { "content-type": "application/json" } : {}) } });
  const json = async (url: string, init: RequestInit = {}) => { const r = await call(url, init); let body: any = null; try { body = await r.json(); } catch { /* html */ } return { status: r.status, body }; };
  const as = async (role: string) => (await json("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) })).body?.user?.SystemUserId as number;
  const trail = async () => (await json("/api/activity-trail")).body as { audience: string; entries: any[]; people: any[]; period: any };
  const teamsIn = (body: { entries: any[] }) => new Set(body.entries.map(row => Number(String(row.key).split("~")[0])));

  /* T7 */
  await as("admin");
  const everything = await trail();
  check(everything.audience === "all" && everything.entries.length >= 20 && everything.period?.current && everything.period?.previous, "T7 مدير النظام يرى أثرَ الصندوق كلَّه، بالفصل الجاري والسابق", { n: everything.entries.length, period: everything.period });
  check(!everything.entries.some(row => row.target === "موعدٌ قديم") && everything.entries.some(row => row.detail === "جدول الفصل السابق — الجولة 2"),
    "T7 حركةُ الفصل السابق تظهر، والأقدمُ من المدة لا يظهر لأحد");
  const expectations: Array<[string, number[], string]> = [
    ["dean", [15], "العميد: رئيسُ القسم وحده (لا اللجنة ولا الإرشاد تحته)"],
    ["departmentHead", [15, 16, 19], "رئيس القسم: نفسُه واللجنةُ والإرشادُ بفرقهم"],
    ["committeeChair", [16], "رئيس اللجنة: فريقُه"],
    ["advisor", [19], "المرشد: فريقُه"],
    ["collegeRegistrar", [22], "رئيس تسجيل الكلية: فريقُه"],
    ["registrarHead", [13, 22], "المسجّل العام: نفسُه ورؤساءُ التسجيل وفرقُهم"],
    ["registrarDean", [13, 22], "عميد التسجيل: المسجّلُ العام ورؤساءُ التسجيل وفرقُهم"],
    ["registrarStaff", [14], "موظف التسجيل بحسابه: حركاتُه"],
  ];
  for (const [role, teams, label] of expectations) {
    await as(role);
    const seen = await trail();
    check(seen.entries.length > 0 && same(teamsIn(seen), teams), `T7 ${label}`, { role, got: [...teamsIn(seen)] });
  }
  await as("departmentHead");
  const headView = await trail();
  check(["سارة", "خالد", "ريم"].every(name => headView.entries.some(row => row.who === name)) && headView.people.some(face => face.name === "سارة" && face.week > 0),
    "T7 رئيس القسم يرى أعضاء اللجنة والإرشاد بوجوهٍ وحلقات", headView.people);
  const sara = headView.people.find(face => face.name === "سارة");
  const onlySara = (await json(`/api/activity-trail?person=${encodeURIComponent(sara?.key || "")}`)).body;
  check(Boolean(sara) && onlySara.entries.length === sara.total && onlySara.entries.every((row: any) => row.key === sara.key),
    "T7 مرشّحُ الشخص على الخادم: كلُّ حركاته، بعددِ حلقته", { face: sara, n: onlySara?.entries?.length });
  const edits = (await json("/api/activity-trail?kind=edit")).body;
  check(edits.entries.length > 0 && edits.entries.every((row: any) => row.kind === "edit") && edits.entries.length === (edits.kinds?.edit || 0),
    "T7 مرشّحُ النوع على الخادم", { n: edits?.entries?.length, kinds: edits?.kinds });
  await as("viceDean");
  const vice = await trail();
  check(vice.audience === "none" && vice.entries.length === 0, "T7 العميد المساعد: لا شيء", vice);
  await as("dean");
  const deanStamp = await json(`/api/activity-trail/stamp/${everything.entries.find(row => row.row && String(row.key).startsWith("16~h"))?.row}`);
  check(deanStamp.status === 200 && deanStamp.body?.stamp && !/منى/.test(deanStamp.body.stamp.who), "T7 البصمةُ للعميد تقول الفريقَ لا اسمَ من تحت رئيس القسم", deanStamp.body);

  /* T8 */
  await as("admin");
  const before = (await trail()).entries.length;
  await json("/api/schedules?collegeId=1&sectionId=1&termId=1");
  await json("/api/schedules/1/history");
  await json("/api/schedules/check-conflicts", { method: "POST", body: JSON.stringify({ AdCollegeId: 1, AdSectionId: 1, AdTermId: 1 }) });
  await json("/api/seats/switch-options");
  await new Promise(resolve => setTimeout(resolve, 400));
  check((await trail()).entries.length === before, "T8 الفتحُ والاطّلاعُ وفحصُ التعارض لا تُكتب");
  await as("committeeChair");
  const rows = (await json("/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
  let resaved: any = null;
  for (const row of rows.slice(0, 25)) {
    const r = await json(`/api/schedules/${row.id}`, { method: "PUT", body: JSON.stringify({ ...row }) });
    if (r.status === 200) { resaved = r.body; break; }
  }
  await new Promise(resolve => setTimeout(resolve, 400));
  const afterResave = await trail();
  check(Boolean(resaved) && !afterResave.entries.some(row => row.row === resaved.id && Date.now() - Date.parse(row.at) < 60_000), "T8 إعادةُ الحفظ بلا فرقٍ لا تُكتب", resaved?.id);
  let edited: any = null;
  for (const row of rows.slice(0, 25)) {
    const r = await json(`/api/schedules/${row.id}`, { method: "PUT", body: JSON.stringify({ ...resaved && row.id === resaved.id ? resaved : row, SCode: String(900 + (Number(row.id) % 90)) }) });
    if (r.status === 200) { edited = { before: row, after: r.body }; break; }
  }
  await new Promise(resolve => setTimeout(resolve, 400));
  const afterEdit = await trail();
  const written = afterEdit.entries.find(row => edited && row.row === edited.after.id && row.kind === "edit");
  check(Boolean(written) && written.who && /ش\d+/.test(written.target) && String(written.detail || "").includes("←") && written.before && written.after,
    "T8 تعديلٌ حقيقيّ يُكتب: من، على أي موعد، قبل ← بعد", written || edited);
  const stamp = await json(`/api/activity-trail/stamp/${edited?.after?.id}`);
  check(stamp.status === 200 && stamp.body?.stamp?.who === written?.who && stamp.body?.stamp?.kind === "edit", "T8 وبصمةُ «آخر تعديل» على الموعد نفسه", stamp.body);
  await as("departmentHead");
  const note = await json("/api/schedule-notes", { method: "POST", body: JSON.stringify({ scheduleId: Number(rows[0]?.id), field: "row", text: "اختبار الأثر" }) });
  await new Promise(resolve => setTimeout(resolve, 400));
  check(note.status < 300 && (await trail()).entries.some(row => row.kind === "add" && row.target === "ملاحظة" && String(row.key).startsWith("15~")), "T8 ملاحظةُ رئيس القسم تُكتب في أثره", note.status);

  /* T9: العضو */
  await as("admin");
  const seatDetail = await json("/api/seats/16");
  const holderPick = seatDetail.body?.holderCandidates?.[0];
  await json("/api/seats/16/holder", { method: "POST", body: JSON.stringify({ instructorId: holderPick?.id }) });
  await as("committeeChair");
  const mine = await json("/api/seats/mine");
  const memberPick = mine.body?.candidates?.find((row: any) => row.id !== holderPick?.id);
  const added = await json("/api/seats/16/members", { method: "POST", body: JSON.stringify({ instructorId: memberPick?.id }) });
  await new Promise(resolve => setTimeout(resolve, 400));
  const holderView = await trail();
  check(holderView.entries.some(row => row.kind === "add" && row.target === "عضو في الفريق" && Date.now() - Date.parse(row.at) < 60_000), "T9 إضافةُ عضوٍ تُكتب في أثر الفريق", added.status);
  await as("admin");
  const instructors = (await json("/api/instructors")).body as any[];
  const civil = String(instructors?.find((row: any) => Number(row.AdInstructorId) === Number(memberPick?.id))?.AdInstructorCivil || "");
  const entered = await json(`/api/public/team/${encodeURIComponent(added.body?.token)}`, { method: "POST", body: JSON.stringify({ tail: civilTailOf(civil) }) });
  const me = await json("/api/auth/me");
  const memberId = me.body?.user?.SeatActor?.memberId;
  check(entered.status === 200 && me.body?.user?.SeatActor?.kind === "member" && Boolean(memberId), "T9 العضو دخل برابطه", me.body?.user?.SeatActor);
  const memberRows = (await json("/api/schedules?collegeId=1&sectionId=1&termId=1")).body as any[];
  let memberEdit: any = null;
  for (const row of memberRows.slice(0, 25)) {
    const r = await json(`/api/schedules/${row.id}`, { method: "PUT", body: JSON.stringify({ ...row, SCode: String(800 + (Number(row.id) % 90)) }) });
    if (r.status === 200) { memberEdit = r.body; break; }
  }
  await new Promise(resolve => setTimeout(resolve, 400));
  const own = await trail();
  check(Boolean(memberEdit) && own.audience === "self" && own.entries.length > 0 && own.entries.every(row => row.key === `16~${memberId}`) && own.entries.some(row => row.row === memberEdit.id),
    "T9 العضوُ يرى حركاته هو وحدها", { audience: own.audience, keys: [...new Set(own.entries.map(row => row.key))] });
  const sneaky = await json(`/api/activity-trail?person=${encodeURIComponent("16~h")}`);
  check(sneaky.body?.entries?.length === 0, "T9 ولا يفتح حركاتِ غيره بمرشّح الشخص", sneaky.body?.entries?.length);
  await as("committeeChair");
  check((await trail()).entries.some(row => row.key === `16~${memberId}` && row.row === memberEdit?.id), "T9 ورئيسُ الفريق يرى حركةَ العضو");

  /* T10 */
  await as("admin");
  const count = (await trail()).entries.length;
  const id = everything.entries[0]?.id;
  const attempts = await Promise.all([
    call("/api/activity-trail", { method: "POST", body: JSON.stringify({ kind: "add", who: "مزوَّر" }) }),
    call(`/api/activity-trail/${id}`, { method: "PUT", body: JSON.stringify({ who: "مزوَّر" }) }),
    call(`/api/activity-trail/${id}`, { method: "PATCH", body: JSON.stringify({ who: "مزوَّر" }) }),
    call(`/api/activity-trail/${id}`, { method: "DELETE" }),
    call("/api/activity-trail", { method: "DELETE" }),
  ]);
  const after = await trail();
  check(attempts.every(r => r.status === 405) && after.entries.length === count && after.entries.some(row => row.id === id) && !after.entries.some(row => row.who === "مزوَّر"),
    "T10 للقراءة فقط: لا إضافةَ ولا تعديلَ ولا حذفَ — ولا لمدير النظام", attempts.map(r => r.status));
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ الاختبار الحيّ توقّف:\x1b[0m", error instanceof Error ? error.stack || error.message : error);
} finally {
  await server?.stop();
}

console.log(`\n«الأثر»: ${passed} نجح، ${failed} فشل`);
if (failed) process.exit(1);
