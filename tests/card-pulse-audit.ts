/**
 * ── «نبض الكروت» و«ذكّر الباقين» ──────────────────────────────────────────────
 *   P1  مرحلةُ كل بطاقة: لم يفتح · فتح · أرسل · ينتظر قرارك · مكتمل؛ رابطُ العرض فقط والمستبدَلة خارج العدّ.
 *   P2  العدُّ والمعرّفات ونسبةُ من ردّ.
 *   P3  من يُذكَّر: العرضُ والتدريبُ والمستبعَدُ ومن أرسل ومن انتهت نافذتُه ومن ذُكِّر قريباً؛ والاستثناءُ الفرديّ يمدّ النافذة.
 *   P4  الحدُّ على الضاغط (ست مرات في الساعة).
 *   P5  الواجهة: المراحلُ تُصفّي، والزرُّ بورقة تأكيد، والحالةُ done في العدّاد.
 *   P6  المسارُ على خادمٍ حيّ: dryRun بلا كتابة، الإرسالُ يُلحق remindedAt، لا تذكيرَ ثانياً قريباً (429)، النطاقُ (403)، والحدُّ على الضاغط.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cardPulse, planReminders, pulseStageOf, remindBurst, skipTally, REMIND_BURST_MAX, REMIND_COOLDOWN_MS } from "../src/utils/cardPulse";
import { inboxFacetCounts } from "../src/utils/inboxFacets";

let passed = 0;
const ok = (condition: unknown, name: string, detail?: unknown) => { if (!condition && detail !== undefined) console.log(JSON.stringify(detail).slice(0, 800)); assert.ok(condition, name); passed++; console.log(`✓ ${name}`); };
const item = (state?: string, action = "change") => ({ action, ...(state ? { decision: { state } } : {}) }) as any;
const row = (extra: Record<string, unknown> = {}) => ({ id: String(Math.random()), status: "sent", ...extra }) as any;

/* ── P1 ── */
ok(pulseStageOf(row()) === "unopened", "P1 أُرسلت ولم تُفتح = لم يفتح");
ok(pulseStageOf(row({ linkOpenedAt: "2026-11-01T00:00:00Z" })) === "opened", "P1 فتح ولم يرسل = فتح");
ok(pulseStageOf(row({ status: "submitted", submittedAt: "x", items: [item(), item("fixed")] })) === "awaiting", "P1 بندٌ بلا قرار = ينتظر قرارك");
ok(pulseStageOf(row({ status: "in-review", submittedAt: "x", items: [item("fixed"), item("rejected")] })) === "complete", "P1 كلُّ البنود مقرَّرة = مكتمل");
ok(pulseStageOf(row({ status: "submitted", submittedAt: "x", items: [item(undefined, "keep")], note: "ملاحظة" })) === "awaiting", "P1 ملاحظةٌ بلا بنود تنتظر القسم");
ok(pulseStageOf(row({ status: "settled", submittedAt: "x", items: [], timeline: [{ kind: "unchanged-confirmed", at: "x" }] })) === "sent", "P1 ثبّت جدولَه كما هو = أرسل ولا قرارَ عليك");
ok(pulseStageOf(row({ linkMode: "view" })) === null && pulseStageOf(row({ status: "superseded" })) === null, "P1 رابطُ العرض فقط والمستبدَلة خارج العدّ");
ok(pulseStageOf(row({ status: "submitted", submittedAt: "x", items: [{ action: "change", hidden: true } as any] })) !== "awaiting", "P1 بندٌ مخفيٌّ عن القارئ لا يجعل الطلب ينتظره");

/* ── P2 ── */
{
  const rows = [row({ id: "a" }), row({ id: "b", linkOpenedAt: "x" }), row({ id: "v", linkMode: "view" }), row({ id: "c", status: "submitted", submittedAt: "x", items: [item()] }),
    row({ id: "d", status: "settled", submittedAt: "x", items: [item("fixed")] }), row({ id: "t", linkMode: "ta" })];
  const p = cardPulse(rows);
  ok(p.total === 5 && p.counts.unopened === 2 && p.counts.opened === 1 && p.counts.awaiting === 1 && p.counts.complete === 1 && p.counts.sent === 0, "P2 العدُّ بلا رابط العرض (والتدريبُ يُعدّ)", p.counts);
  ok(p.ids.unopened.join() === "a,t" && !Object.values(p.ids).flat().includes("v"), "P2 المعرّفات حسب المرحلة، ورابطُ العرض غائب");
  ok(p.repliedPercent === 40 && cardPulse([]).repliedPercent === null && cardPulse([]).total === 0, "P2 نسبةُ من ردّ، وبلا بطاقات لا نسبة");
}

/* ── P3 ── */
{
  const now = Date.parse("2026-11-14T12:00:00Z");
  const open = { opensAt: "2026-11-01T00:00:00Z", closesAt: "2026-12-01T00:00:00Z" }, closed = { opensAt: "2026-10-01T00:00:00Z", closesAt: "2026-11-05T00:00:00Z" };
  const mk = (id: number, extra: Record<string, unknown> = {}) => ({ AdInstructorId: id, status: "sent", window: open, ...extra }) as any;
  const rows = [mk(1), mk(2, { linkOpenedAt: "x" }), mk(3, { linkMode: "view" }), mk(4, { linkMode: "ta" }), mk(5), mk(6, { submittedAt: "x" }), mk(7, { status: "submitted" }), mk(8, { window: closed }),
    mk(9, { window: closed, individualException: { opensAt: "2026-11-01T00:00:00Z", closesAt: "2026-12-30T00:00:00Z", grantedAt: "x", grantedBy: "x", reason: "x" } }),
    mk(10, { remindedAt: ["2026-11-14T10:00:00Z"] }), mk(11, { remindedAt: ["2026-11-14T05:00:00Z"] })];
  const windowOpen = (r: any) => now >= Date.parse(r.window.opensAt) && now <= Date.parse(r.window.closesAt) || Boolean(r.individualException && now <= Date.parse(r.individualException.closesAt));
  const plan = planReminders(rows, { now, windowOpen, excluded: new Map([[5, "visiting"]]) });
  ok(plan.targets.map(r => r.AdInstructorId).join() === "1,2,9,11", "P3 الهدفُ: من لم يفتح ومن فتح، والاستثناءُ الفرديّ يمدّ النافذة، ومن ذُكِّر قبل أكثر من ست ساعات", plan.targets.map(r => r.AdInstructorId));
  const why = Object.fromEntries(plan.skipped.map(s => [s.row.AdInstructorId, s.reason]));
  ok(why[3] === "view" && why[4] === "ta" && why[5] === "excluded" && why[6] === "answered" && why[7] === "answered" && why[8] === "closed" && why[10] === "recent", "P3 سببُ كلِّ استبعاد", why);
  ok(skipTally(plan.skipped).find(t => t.reason === "answered")?.count === 2, "P3 عدُّ الاستبعاد بالسبب");
  ok(planReminders([mk(1, { remindedAt: [new Date(now - REMIND_COOLDOWN_MS).toISOString()] })], { now, windowOpen }).targets.length === 1
    && planReminders([mk(1, { remindedAt: [new Date(now - REMIND_COOLDOWN_MS + 1000).toISOString()] })], { now, windowOpen }).targets.length === 0, "P3 حدُّ الست ساعات بالثانية");
}

/* ── P4 ── */
{
  const now = 10_000_000;
  ok(remindBurst([], now).allowed && remindBurst(Array(REMIND_BURST_MAX - 1).fill(now - 1000), now).allowed && !remindBurst(Array(REMIND_BURST_MAX).fill(now - 1000), now).allowed, "P4 ست ضغطاتٍ في الساعة ثم المنع");
  ok(remindBurst(Array(REMIND_BURST_MAX).fill(now - 3_700_000), now).allowed, "P4 ما خرج من نافذة الساعة لا يُحسب");
  ok(remindBurst(Array(REMIND_BURST_MAX).fill(now - 1000), now).retryAfterMs > 3_000_000, "P4 زمنُ الانتظار يُقال");
}

/* ── P5 ── */
{
  const inbox = fs.readFileSync("src/components/InstructorInbox.tsx", "utf8");
  const cp = fs.readFileSync("src/components/inbox/CardPulse.tsx", "utf8");
  ok(/<CardPulse rows=\{pulseRows as any\}/.test(inbox) && /const pickPulse/.test(inbox) && /stage === "sent" \? "confirmed-unchanged"/.test(inbox), "P5 المراحلُ تُصفّي القائمة (لم يفتحوا وفتحوا ← «لم يشاركوا»، أرسلوا ← «ثبّتوا كما هي»…)");
  ok(/dryRun: true/.test(cp) && /أرسل التذكير/.test(cp) && /remind-pending/.test(cp), "P5 ورقةُ تأكيدٍ بالعدد (dryRun) قبل الإرسال");
  ok(!/request-silent/.test(inbox) && !/glance-ring/.test(inbox), "P5 سطرُ «لم يفتحوا» وحلقةُ «أجاب» القديمان حلّ محلَّهما الشريط");
  const items = [{ state: "fixed", action: "change" }, { state: undefined, action: "add" }];
  ok(inboxFacetCounts(items as any, { state: "done", action: "all", verdict: "all" }).all === 2 && inboxFacetCounts(items as any, { state: "pending", action: "all", verdict: "all" }).pending === 1, "P5 العدّادُ يقبل حالة «مكتمل»");
}

/* ── P6 ── */
const port = Number(process.env.CARD_PULSE_PORT || 3236);
const base = `http://127.0.0.1:${port}`;
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "card-pulse-"));
Object.assign(process.env, { DATA_MODE: "demo", NODE_ENV: "development", PORT: String(port), SCHEDULE_PRIVATE_DIR: privateDir, AUTO_IMPORT_LEGACY_DATA: "false", DISABLE_HMR: "true" });
let exitCode = 0;
try {
  await import("../server.ts");
  for (let attempt = 0; attempt < 200; attempt++) {
    try { if ((await fetch(`${base}/api/demo/config`)).ok) break; } catch { /* يقلع */ }
    if (attempt === 199) throw new Error("server did not start");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const { Repository } = await import("../src/db/repository");
  const termId = 990214, collegeId = 1, sectionId = 1;
  const future = "2099-01-01T00:00:00.000Z", past = "2020-01-02T00:00:00.000Z";
  let person: any; let make: (extra?: Record<string, unknown>, scope?: { collegeId: number; sectionId: number }) => Promise<string>;
  let A = "", B = "", V = "", D = "", E = "", F = "", G = "", H = "", OUT = "";
  const login = await fetch(`${base}/api/auth/demo`, { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  for (let i = 0; i < 600; i++) { const s = await (await fetch(`${base}/api/demo/seed-status`, { headers: { cookie } })).json() as any; if (s.status === "ready") break; await new Promise(r => setTimeout(r, 300)); }
  for (let i = 0; i < 600; i++) { const s = await (await fetch(`${base}/api/demo/seed-status`, { headers: { cookie } })).json() as any; if (s.status === "ready") break; await new Promise(r => setTimeout(r, 300)); }
  const sessionId = (cookie.match(/session_id=([^;]+)/) || [])[1] || "";
  const inSandbox = <T,>(fn: () => Promise<T>) => Repository.withDemoSandbox(sessionId, fn);
  await inSandbox(async () => {
  const { generateSyntheticCivilId } = await import("../src/utils/civilId");
  make = async (extra: Record<string, unknown> = {}, scope = { collegeId, sectionId }) => { person = await Repository.createInstructor(generateSyntheticCivilId(), "أستاذ نبض الكروت", "55500214"); return (await Repository.createInstructorRequest({
    AdCollegeId: scope.collegeId, AdSectionId: scope.sectionId, AdTermId: termId, AdInstructorId: person.AdInstructorId, linkId: `pulse-${Math.random().toString(36).slice(2)}`,
    window: { opensAt: "2020-01-01T00:00:00.000Z", closesAt: future }, source: "draft", status: "sent", items: [], timeline: [], ...extra } as any)).id; };
  A = await make(); B = await make({ linkOpenedAt: "2026-11-01T00:00:00.000Z" }); V = await make({ linkMode: "view" }); D = await make({ status: "submitted", submittedAt: "2026-11-01T00:00:00.000Z" });
  E = await make({ remindedAt: [new Date(Date.now() - 3_600_000).toISOString()] }); F = await make({ window: { opensAt: "2020-01-01T00:00:00.000Z", closesAt: past } });
  G = await make({ window: { opensAt: "2020-01-01T00:00:00.000Z", closesAt: past }, individualException: { opensAt: "2020-01-01T00:00:00.000Z", closesAt: future, grantedAt: past, grantedBy: "x", reason: "x" } });
  H = await make({ linkMode: "ta" });
  OUT = await make({}, { collegeId, sectionId: 999991 });
  });
  const call = async (url: string, init: RequestInit = {}) => { const r = await fetch(base + url, { ...init, headers: { cookie, origin: base, "content-type": "application/json" } }); let body: any = null; try { body = await r.json(); } catch { /* */ } return { status: r.status, body }; };
  const as = (role: string) => call("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) });
  const remind = (requestIds: string[], dryRun = false, tid = termId) => call("/api/instructor-requests/remind-pending", { method: "POST", body: JSON.stringify({ termId: tid, requestIds, dryRun }) });
  const stamps = () => inSandbox(async () => Object.fromEntries((await Repository.getInstructorRequests(0, 0, termId)).map(r => [r.id, (r.remindedAt || []).length])));

  await as("admin");
  const all = [A, B, V, D, E, F, G, H];
  const dry = await remind(all, true);
  const targets = (dry.body?.targets || []).map((t: any) => t.id).sort();
  ok(dry.status === 200 && JSON.stringify(targets) === JSON.stringify([A, B, G].sort()), "P6 dryRun: من لم يفتح ومن فتح ومن له استثناءٌ فرديّ", dry.body);
  const reasons = Object.fromEntries((dry.body.skipped || []).map((s: any) => [s.id, s.reason]));
  ok(reasons[V] === "view" && reasons[H] === "ta" && reasons[D] === "answered" && reasons[E] === "recent" && reasons[F] === "closed", "P6 أسبابُ الاستبعاد: عرض · تدريب · أرسل · ذُكّر قريباً · انتهت نافذته", reasons);
  const before = await stamps();
  ok(Object.values(before).every(n => n === (before[E] === 1 ? n : 0)) && before[A] === 0, "P6 dryRun لا يكتب شيئاً");

  const badTerm = await remind([A], true, 0);
  const tooMany = await call("/api/instructor-requests/remind-pending", { method: "POST", body: JSON.stringify({ termId, requestIds: Array.from({ length: 601 }, (_, i) => `x${i}`) }) });
  ok(badTerm.status === 400 && tooMany.status === 400, "P6 فصلٌ ناقصٌ أو أكثرُ من ٦٠٠ بطاقة: 400");

  const sent = await remind(all);
  ok(sent.status === 200 && sent.body.reminded.length === 3 && sent.body.delivery === "demo" && sent.body.reminded.every((r: any) => r.linkId && "mobile" in r), "P6 الإرسال: ثلاثةٌ بروابطهم", sent.body);
  const after = await stamps();
  ok(after[A] === 1 && after[B] === 1 && after[G] === 1 && after[V] === 0 && after[D] === 0 && after[H] === 0 && after[F] === 0, "P6 remindedAt يُلحق بالثلاثة وحدهم");
  const again = await remind([A, B, G]);
  ok(again.status === 429 && again.body.code === "reminder-rate-limited", "P6 تذكيرٌ ثانٍ فوراً: 429 (لا إلحاحَ على من ذُكِّر)", again.body);
  const none = await remind([V, H, D]);
  ok(none.status === 409 && none.body.code === "nothing-to-remind", "P6 لا أحدَ يلزمه التذكير: 409");

  /* الحدُّ على الضاغط: ست ضغطاتٍ ناجحة في الساعة (واحدةٌ مضت) */
  for (let i = 1; i < REMIND_BURST_MAX; i++) { const fresh = await inSandbox(() => make()); const r = await remind([fresh]); assert.equal(r.status, 200, `ضغطة ${i + 1}`); }
  const seventh = await remind([await inSandbox(() => make())]);
  ok(seventh.status === 429 && seventh.body.code === "reminder-rate-limited" && Number(seventh.body.retryAfterSeconds) > 0, "P6 الضغطةُ السابعة في الساعة: 429 مع زمن الانتظار", seventh.body);
  ok((await remind([await inSandbox(() => make())], true)).status === 200, "P6 والمعاينةُ (dryRun) لا يحدّها الحدّ");

  /* النطاق */
  const outAdmin = await remind([OUT], true);
  ok(outAdmin.status === 200 && outAdmin.body.targets.length === 1, "P6 المدير يرى كلَّ نطاق");
  await as("departmentHead");
  const denied = await remind([OUT], true);
  const deniedSend = await remind([OUT]);
  ok(denied.status === 403 && deniedSend.status === 403, "P6 رئيسُ القسم لا يذكّر بطاقةً خارج نطاقه (403)", { denied: denied.status, deniedSend: deniedSend.status });
  const mixed = await remind([OUT, await inSandbox(() => make())], true);
  ok([200, 403].includes(mixed.status) && !JSON.stringify(mixed.body).includes(OUT), "P6 وما خرج عن النطاق لا يظهر أبداً في أي جواب", mixed.body);
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  fs.rmSync(privateDir, { recursive: true, force: true });
  console.log(`\n${passed} passed${exitCode ? ", FAILED" : ""}`);
  process.exit(exitCode);
}
