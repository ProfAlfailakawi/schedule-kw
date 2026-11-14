/**
 * ── «قاعات بلا سعة» ───────────────────────────────────────────────────────────
 *
 *   G1  الحساب الخالص: لا تُحسب إلا القاعةُ الفعّالة المعتمدة؛ الصفرُ والفراغُ وغيرُ الرقم = بلا سعة؛ صفرُ قاعات = بلا نسبة؛
 *       ١٠٠٪ لا تظهر وفي القاعات نقص، والترتيبُ بالمبنى ثم الرقم.
 *   G2  الرقمُ المُدخل: عددٌ صحيحٌ موجب ≤ ٢٠٠٠، بالأرقام العربية والهندية، وكلُّ رفضٍ بنصّه.
 *   G3  المسارُ على خادمٍ حيّ: يطابق عدَّ القاعات في السجل؛ حفظُ السعة بمسار التعديل القائم يُنقص النقصَ ويُسجَّل في سجلّ القاعة؛
 *       الأرقامُ الفاسدة تُردّ بـ400؛ القاعةُ الموقوفة لا تُحسب؛ وغيرُ حساب الإدارة الرئيسي لا يقرأ ولا يكتب (403)، وبلا دخولٍ 401.
 *   G4  الواجهةُ: اللوحةُ أعلى الشاشة، والمفاتيحُ والتراجعُ المتفائل في مصدرها.
 */
import fs from "node:fs";
import { CAPACITY_GAP_MAX, capacityPercent, hasRegisteredCapacity, parseGapCapacity, roomCapacityGaps } from "../src/utils/roomCapacityGaps";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};
const mk = (id: string, code: string, extra: Record<string, unknown> = {}, building = "B1") => ({
  id, buildingId: `b_${building}`, buildingCode: building, canonicalCode: code, active: true, aliases: [], collegeIds: [1], sectionIds: [1], shared: false,
  historicalUsageCount: 0, confidence: "CONFIRMED", source: "t", adminVerified: true, evidence: [], auditHistory: [], ...extra,
}) as any;

/* ── G1 ── */
{
  const rooms = [
    mk("a", "F10", { capacity: 40 }), mk("b", "F2"), mk("c", "F1", { capacity: null }), mk("d", "G1", { capacity: 0 }, "B2"),
    mk("e", "H1", { capacity: "x" as any }, "B2"), mk("f", "X1", { active: false }), mk("g", "Y1", { confidence: "SUGGESTED" }), mk("h", "K1", { capacity: 25.5 }),
  ];
  const report = roomCapacityGaps(rooms, [{ id: "b_B1", officialCode: "B1" }, { id: "b_B2", officialCode: "B2" }]);
  check(report.total === 6 && report.withCapacity === 1 && report.missing === 5, "G1 لا تُحسب الموقوفةُ ولا غيرُ المعتمدة؛ والصفرُ والنصُّ والكسرُ بلا سعة", report);
  check(report.gaps.map(room => room.fullCode).join() === "B1F1,B1F2,B1K1,B2G1,B2H1", "G1 الترتيبُ بالمبنى ثم رقم القاعة (F2 قبل F10)", report.gaps.map(room => room.fullCode));
  check(report.percent === 17 && roomCapacityGaps([]).percent === null && roomCapacityGaps([]).total === 0, "G1 ٦ قاعات وسعةٌ واحدة = ١٧٪، وصفرُ قاعات بلا نسبة");
  check(capacityPercent(1000, 999) === 99 && capacityPercent(1000, 1) === 1 && capacityPercent(3, 3) === 100 && capacityPercent(3, 0) === 0, "G1 ١٠٠٪ لا تظهر وفي القاعات نقص، ولا ٠٪ وفيها سعة");
  check(roomCapacityGaps([mk("z", "A1", { capacity: 30 })]).percent === 100 && !roomCapacityGaps([mk("z", "A1", { capacity: 30 })]).gaps.length, "G1 كلُّها لها سعة = ١٠٠٪ وقائمةٌ فارغة");
  check(hasRegisteredCapacity({ capacity: 1 }) && !hasRegisteredCapacity({ capacity: undefined }) && !hasRegisteredCapacity({ capacity: -4 }), "G1 تعريفُ «سعةٌ مسجّلة»");
  const noCode = roomCapacityGaps([{ ...mk("n", "N1"), buildingCode: "" }], [{ id: "b_B1", officialCode: "ZZ9" }]);
  check(noCode.gaps[0].fullCode === "ZZ9N1", "G1 رمزُ المبنى يُؤخذ من السجل حين يغيب عن القاعة");
}

/* ── G2 ── */
{
  const ok = (raw: unknown) => { const r = parseGapCapacity(raw); return r.ok ? r.value : null; };
  check(ok("40") === 40 && ok(" 25 ") === 25 && ok("٣٠") === 30 && ok("۱۲۰") === 120 && ok(String(CAPACITY_GAP_MAX)) === CAPACITY_GAP_MAX && ok(1) === 1, "G2 الأرقامُ الصحيحة تُقبل بالعربية والهندية والحدّان");
  const bad = (raw: unknown) => { const r = parseGapCapacity(raw); return r.ok ? "" : r.error; };
  check(bad("") === "اكتب عدد المقاعد." && bad(undefined) === "اكتب عدد المقاعد.", "G2 الفارغُ يُطلب");
  check(bad("0") === "السعة لا تقلّ عن مقعدٍ واحد." && bad("-5") === "عددٌ صحيحٌ فقط، بلا فواصل.", "G2 الصفرُ والسالب");
  check(bad("12.5") === "عددٌ صحيحٌ فقط، بلا فواصل." && bad("1e3") === "عددٌ صحيحٌ فقط، بلا فواصل." && bad("abc") === "عددٌ صحيحٌ فقط، بلا فواصل.", "G2 الكسورُ والأسّ والنصوصُ");
  check(/2[,٬]?000/.test(bad("2001")) && /2[,٬]?000/.test(bad("999999")), "G2 فوق الحدّ يُرفض بنصٍّ يذكر الحدّ", bad("2001"));
}

/* ── G4 ── */
{
  const src = fs.readFileSync("src/components/LocationCapacityGaps.tsx", "utf8");
  const host = fs.readFileSync("src/components/LocationQuickSetup.tsx", "utf8");
  check(host.indexOf("<LocationCapacityGaps") > host.indexOf("{header}") && host.indexOf("<LocationCapacityGaps") < host.indexOf("<LocationRoomTypeManager"), "G4 اللوحةُ أعلى الشاشة قبل أنواع القاعات");
  check(/event\.key === "Enter"/.test(src) && /focusNeighbour/.test(src) && /setOptimistic\(current => \{ const next = \{ \.\.\.current \}; delete next\[room\.id\]/.test(src), "G4 Enter يحفظ وينقل التركيز، والتراجعُ المتفائل يُعيد البطاقة");
  check(/\/api\/admin\/location-registry\/rooms\//.test(src) && !/\/api\/admin\/location-setup\/rooms/.test(src), "G4 الحفظُ بمسار تعديل القاعة القائم لا بمسارٍ ثانٍ");
  check(/AR\.room/.test(src), "G4 اتفاقُ العدد والمعدود بـcountOf");
}

/* ── G3 ── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("capacity-gaps");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = (url: string, init: RequestInit = {}, withCookie = true) => fetch(BASE + url, { ...init, redirect: "manual", headers: { ...(withCookie ? { cookie } : {}), origin: BASE, ...(init.body ? { "content-type": "application/json" } : {}) } });
  const json = async (url: string, init: RequestInit = {}, withCookie = true) => { const r = await call(url, init, withCookie); let body: any = null; try { body = await r.json(); } catch { /* */ } return { status: r.status, body }; };
  const as = async (role: string) => json("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) });
  const put = (id: string, body: unknown) => json(`/api/admin/location-registry/rooms/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) });

  check((await json("/api/admin/location-setup/capacity-gaps", {}, false)).status === 401, "G3 بلا دخول: 401");
  await as("admin");
  const setup = (await json("/api/admin/location-setup")).body as { rooms: any[] };
  const counted = setup.rooms.filter(room => room.active && room.confidence === "CONFIRMED");
  const hasCap = (room: any) => Number.isInteger(Number(room.capacity)) && Number(room.capacity) >= 1 && room.capacity != null;
  const first = await json("/api/admin/location-setup/capacity-gaps");
  check(first.status === 200 && first.body.total === counted.length && first.body.missing === counted.filter(room => !hasCap(room)).length && first.body.gaps.length === first.body.missing
    && first.body.withCapacity === counted.filter(hasCap).length, "G3 الأرقامُ تطابق عدَّ قاعات السجل الفعّالة المعتمدة", { total: first.body.total, expected: counted.length });
  check(first.body.gaps.every((room: any) => room.id && room.fullCode && "roomType" in room) && !JSON.stringify(first.body).includes("auditHistory"), "G3 قراءةٌ خفيفة: لا سجلَّ تدقيق ولا حقولَ ثقيلة");

  /* قاعةٌ ذات سعة نُفرغها فتصير نقصاً، ثم نحفظ لها سعةً. */
  const target = counted.find(room => hasCap(room));
  if (!target) throw new Error("لا قاعةَ ذات سعة في بيانات التجربة");
  const cleared = await put(target.id, { capacity: null });
  check(cleared.status === 200, "G3 الإفراغُ بالمسار القائم", cleared);
  const afterClear = (await json("/api/admin/location-setup/capacity-gaps")).body;
  check(afterClear.missing === first.body.missing + 1 && afterClear.gaps.some((room: any) => room.id === target.id), "G3 القاعةُ المُفرَغة تدخل قائمةَ النقص", { missing: afterClear.missing });

  for (const bad of [0, -3, 2.5, 5001, "abc"]) {
    const rejected = await put(target.id, { capacity: bad });
    check(rejected.status === 400 && /سعة القاعة/.test(String(rejected.body?.error)), `G3 السعةُ ${JSON.stringify(bad)} تُردّ بـ400 بنصّها`, rejected);
  }
  const unchanged = (await json("/api/admin/location-setup/capacity-gaps")).body;
  check(unchanged.missing === afterClear.missing, "G3 الرفضُ لا يغيّر شيئاً");

  const saved = await put(target.id, { capacity: 36 });
  check(saved.status === 200 && saved.body.capacity === 36, "G3 حفظُ السعة", saved);
  const history = saved.body.auditHistory || [];
  const last = history[history.length - 1] || {};
  check(last.action === "UPDATE" && last.after?.capacity === 36 && last.byUserId, "G3 سجلُّ تدقيق القاعة يحمل التعديلَ ومن فعله", last);
  const afterSave = (await json("/api/admin/location-setup/capacity-gaps")).body;
  check(afterSave.missing === first.body.missing && !afterSave.gaps.some((room: any) => room.id === target.id) && afterSave.percent === first.body.percent, "G3 بعد الحفظ تخرج القاعةُ ويعود الاكتمالُ");

  /* قاعةٌ بلا سعةٍ تُوقَف فلا تُحسب. */
  const victim = afterSave.gaps[0];
  if (victim) {
    const off = await put(victim.id, { active: false });
    const afterOff = (await json("/api/admin/location-setup/capacity-gaps")).body;
    check(off.status === 200 && afterOff.total === afterSave.total - 1 && afterOff.missing === afterSave.missing - 1 && !afterOff.gaps.some((room: any) => room.id === victim.id), "G3 القاعةُ الموقوفة لا تُحسب في الحلقة ولا في القائمة", afterOff);
    await put(victim.id, { active: true });
  }

  /* النطاق: ما سوى حساب الإدارة الرئيسي لا يقرأ ولا يكتب. */
  for (const role of ["departmentHead", "advisor"]) {
    await as(role);
    const read = await json("/api/admin/location-setup/capacity-gaps");
    const write = await put(target.id, { capacity: 99 });
    check(read.status === 403 && write.status === 403, `G3 ${role}: لا قراءةَ ولا كتابة (403)`, { read: read.status, write: write.status });
  }
  await as("admin");
  const final = await json("/api/admin/location-setup");
  check(final.body.rooms.find((room: any) => room.id === target.id)?.capacity === 36, "G3 ولم تمسّ محاولاتُ غير المدير السعة");
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ الاختبار تعثّر\x1b[0m", error instanceof Error ? error.stack : error);
} finally {
  await server?.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
