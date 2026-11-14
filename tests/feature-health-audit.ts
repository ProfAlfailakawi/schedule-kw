/**
 * ── «سلامة الميزات الجديدة» داخل «سلامة النظام» ───────────────────────────────
 *
 *   U  التجميعُ الخالص (src/utils/featureHealth.ts): كلُّ بطاقةٍ بمدخلاتٍ ثابتة، وفارغةً، ونطاقُ الفصل، وعدّاداتُ الأيام.
 *   V  نموذجُ العرض: صفرٌ خافتٌ بلا زرٍّ معطّل، «غير مفعّل» بلا مفاتيح، «انتبه» حيث يجب فقط، «تعذّرت القراءة» لبطاقةٍ وحدها.
 *   H  المسارُ على HTTP داخل العملية: ٤٠١ و٤٠٣ والشكلُ، ولا مفتاحَ هويةٍ ولا قيمةَ هويةٍ في الجسم، وفشلُ مصدرٍ يعزل بطاقتَه.
 *   C  عدّادُ فتحات رابط المرشد: يزيد، بلا هوية، ويُمحى مع الملف؛ وعدّادُ الأجهزة المُزالة؛ وإنشاءُ الرابط.
 *   S  التوصيل: الحارس، ولا مسارَ كتابة، والواجهةُ (حالةٌ حيّة، تحديثٌ ٤٤ بكسل، لا «٪»، لا زرَّ معطّلاً للصفر).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import {
  FEATURE_DAY_KEEP, FEATURE_FORBIDDEN_KEY, FEATURE_TILE_IDS, RECOVERY_EXPIRING_MS, ROOMS_ATTENTION_PERCENT, bumpDay, buildFeaturePayload, cardsTile,
  featureRange, masariTile, pushTile, recoveryTile, roomsTile, runTileProbes, shareTile, unreadableTile, type FeatureProfile, type FeatureTile,
} from "../src/utils/featureHealth";
import { PUSH_OFF_NOTE, TONE_WORD, tileView } from "../src/utils/featureHealthView";
import { CIVIL, CODE_HASH, NAME, SECTION_A, boot, kw } from "./helpers/studentExtrasHarness";

let passed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => { if (!ok) console.log("✗ " + label, extra ?? ""); assert.ok(ok, label); passed++; console.log("✓ " + label); };
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const NOW = kw("2026-11-20", "15:00");
const RANGE = featureRange({ AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 15 }, NOW);
const iso = (day: string, time = "10:00") => new Date(kw(day, time)).toISOString();
const NONE = { hour: 15, wishesCloseToday: false, roundTomorrow: false };

/* ── U: عدّاداتُ الأيام ── */
{
  const a = bumpDay(undefined, "2026-11-20");
  check(a["2026-11-20"] === 1 && Object.keys(a).length === 1, "أول يومٍ يبدأ بواحد");
  const b = bumpDay(a, "2026-11-20", 2);
  check(b["2026-11-20"] === 3 && a["2026-11-20"] === 1, "يزيد دون تغيير المدخل");
  check(Object.keys(bumpDay({}, "غير يوم")).length === 0 && Object.keys(bumpDay({}, "2026-1-2")).length === 0, "يومٌ بشكلٍ فاسد لا يُكتب");
  let big: Record<string, number> = {};
  for (let i = 0; i < FEATURE_DAY_KEEP + 30; i += 1) big = bumpDay(big, new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
  check(Object.keys(big).length === FEATURE_DAY_KEEP && !big["2026-01-01"] && Object.values(big).every(n => typeof n === "number"), "لا يحتفظ بأكثر من ١٢٠ يوماً والقيمُ أرقامٌ فقط");
  check(featureRange(null, NOW).to > NOW && NOW - featureRange(null, NOW).from === FEATURE_DAY_KEEP * 86_400_000, "بلا فصلٍ ولا تواريخ: آخرُ ١٢٠ يوماً");
  check(RANGE.from <= kw("2026-09-13", "10:00") && RANGE.to > kw("2026-12-20", "10:00"), "نافذةُ الفصل من تواريخه");
}

/* ── U: تنبيهات الهاتف ── */
const sub = { id: "s1", endpoint: "https://push.example/ENDPOINT-SECRET", keys: { p256dh: "P256-SECRET", auth: "AUTH-SECRET" }, createdAt: iso("2026-11-01") };
const pushProfile = (extra: Partial<FeatureProfile["push"]> & { subs?: any[] } = {}): FeatureProfile => ({ push: { subs: [sub], ...extra } });
{
  const empty = pushTile([], 1, RANGE, true, NONE);
  check(empty.ok && !empty.attention && empty.v.enabled === 0 && empty.v.sent === 0 && empty.v.removed === 0, "فارغ: أصفارٌ بلا انتباه ولا خطأ");
  const t = pushTile([
    pushProfile({ sent: { "1:wishes-close": iso("2026-11-20", "08:30"), "1:plan-ready": "baseline", "2:round-tomorrow": iso("2026-05-01") }, removedDays: { "2026-11-10": 2, "2026-03-01": 9 } }),
    pushProfile({ sent: { "1:round-tomorrow": iso("2026-11-19"), "1:plan-ready": iso("2026-11-18") } }),
    { push: { subs: [] } },
    {},
  ], 1, RANGE, true, NONE);
  check(t.v.enabled === 2 && t.v.wishes === 1 && t.v.round === 1 && t.v.plan === 1 && t.v.sent === 3, "الأجهزةُ المفعّلة والرسائلُ لكل نوعٍ لهذا الفصل فقط (و«baseline» ليست رسالة)", t.v);
  check(t.v.removed === 2, "الأجهزةُ المُزالة ضمن نافذة الفصل وحدها", t.v);
  const noKeys = pushTile([pushProfile()], 1, RANGE, false, { hour: 15, wishesCloseToday: true, roundTomorrow: true });
  check(noKeys.v.configured === false && !noKeys.attention, "بلا مفاتيح: غيرُ مفعّل ولا «انتبه» (لا يُنتظر إرسال)");
  const missed = pushTile([pushProfile()], 1, RANGE, true, { hour: 15, wishesCloseToday: true, roundTomorrow: false });
  check(missed.attention, "مفعّل وآخرُ يومٍ للرغبات بعد الظهر ولا رسالة: انتبه");
  check(!pushTile([pushProfile()], 1, RANGE, true, { hour: 9, wishesCloseToday: true, roundTomorrow: false }).attention, "قبل نهاية نافذة الصباح: لا انتباه بعد");
  check(!pushTile([pushProfile({ sent: { "1:wishes-close": iso("2026-11-20", "08:30") } })], 1, RANGE, true, { hour: 15, wishesCloseToday: true, roundTomorrow: false }).attention, "أُرسلت: لا انتباه");
  check(pushTile([pushProfile()], 1, RANGE, true, { hour: 22, wishesCloseToday: false, roundTomorrow: true }).attention, "يبدأ التسجيل غداً ولم يُرسل التذكير بعد التاسعة مساءً: انتبه");
  check(!pushTile([], 1, RANGE, true, { hour: 15, wishesCloseToday: true, roundTomorrow: true }).attention, "لا أحدَ مفعّلاً: لا انتباه");
}

/* ── U: شارك مرشدك ── */
{
  check(JSON.stringify(shareTile([], RANGE, NOW).v) === JSON.stringify({ created: 0, valid: 0, opened: 0 }), "فارغ: أصفار");
  const t = shareTile([
    { share: { hash: "H", createdAt: iso("2026-11-20"), expiresAt: iso("2026-11-21") }, shareStats: { made: { "2026-11-20": 2, "2026-02-01": 4 }, opens: { "2026-11-20": 3 } } },
    { share: { hash: "H", createdAt: iso("2026-11-10"), expiresAt: iso("2026-11-11") }, shareStats: { made: { "2026-11-10": 1 } } },
    {},
  ], RANGE, NOW);
  check(t.v.created === 3 && t.v.valid === 1 && t.v.opened === 3 && !t.attention, "أُنشئت هذا الفصل وصالحةٌ الآن وفُتحت", t.v);
}

/* ── U: رموز الاستعادة ── */
{
  check(recoveryTile([], RANGE, NOW).v.issued === 0, "فارغ: أصفار");
  const live = (hoursLeft: number) => iso("2026-11-20", "15:00").replace(/.*/, new Date(NOW + hoursLeft * 3_600_000).toISOString());
  const issuedAt = new Date(NOW - 3_600_000).toISOString();
  const t = recoveryTile([
    { recoveryLog: [{ at: iso("2026-11-01"), byId: 7, byName: "موظف", usedAt: iso("2026-11-01", "12:00") }, { at: iso("2026-11-05"), byId: 7, byName: "موظف" }, { at: iso("2026-03-05"), byId: 7, byName: "موظف" }] },
    { recoveryLog: [{ at: issuedAt, byId: 8, byName: "آخر" }], recovery: { hash: "H", issuedAt, expiresAt: live(3), issuedById: 8, issuedByName: "آخر" } },
    { recoveryLog: [{ at: issuedAt, byId: 8, byName: "آخر" }], recovery: { hash: "H", issuedAt, expiresAt: live(20), issuedById: 8, issuedByName: "آخر" } },
    { recoveryLog: [{ at: iso("2026-11-02"), byId: 8, byName: "آخر" }], recovery: { hash: "H", issuedAt: iso("2026-11-02"), expiresAt: new Date(NOW - 1000).toISOString(), issuedById: 8, issuedByName: "آخر" } },
  ], RANGE, NOW);
  check(t.v.issued === 5 && t.v.used === 1 && t.v.lapsed === 2 && t.v.pending === 2 && t.v.expiringSoon === 1, "أُصدرت ٥ (ضمن الفصل): استُعمل ١، منتهٍ أو مُلغى ٢، قائمٌ ٢، ينتهي قريباً ١", t.v);
  check(t.attention && RECOVERY_EXPIRING_MS === 6 * 3_600_000, "ينتهي دون استعمالٍ خلال ٦ ساعات: انتبه");
  check(!recoveryTile([{ recoveryLog: [{ at: issuedAt, byId: 1, byName: "x" }], recovery: { hash: "H", issuedAt, expiresAt: live(20), issuedById: 1, issuedByName: "x" } }], RANGE, NOW).attention, "قائمٌ بعيد الانتهاء: لا انتباه");
  check(!/موظف|آخر|byName|byId/.test(JSON.stringify(t)), "لا اسمَ موظفٍ في الخرج");
}

/* ── U: القاعات والبطاقات ومساري ── */
{
  const none = roomsTile({ total: 0, missing: 0 });
  check(none.v.percent === null && !none.attention, "لا قاعات معتمدة: لا نسبة ولا انتباه");
  check(!roomsTile({ total: 10, missing: 3 }).attention && roomsTile({ total: 10, missing: 4 }).attention && ROOMS_ATTENTION_PERCENT === 30, "٣٠٪ بالضبط لا تنبّه، وما فوقها ينبّه");
  check(roomsTile({ total: 3, missing: 1 }).v.percent === 33, "النسبةُ مقرَّبة");
  const empty = cardsTile([]);
  check(empty.v.total === 0 && empty.v.opened === 0 && empty.v.sent === 0 && empty.v.settled === 0, "بطاقاتٌ فارغة: أصفار");
  const rows: any[] = [
    { status: "sent", submittedAt: undefined, items: [], timeline: [] },
    { status: "sent", linkOpenedAt: iso("2026-11-10"), items: [], timeline: [{ at: iso("2026-11-10"), kind: "opened" }] },
    { status: "settled", submittedAt: iso("2026-11-11"), items: [{ action: "move", decision: { state: "accepted" } }] },
    { status: "submitted", submittedAt: iso("2026-11-11"), items: [{ action: "move" }] },
    { status: "superseded" },
  ];
  const c = cardsTile(rows); const cv = c.v as Record<string, number>;
  check(cv.sent >= cv.settled && cv.opened >= cv.sent && cv.total <= rows.length && cv.settled <= cv.total, "فُتحت ≥ أُرسلت ≥ سُوّيت، ولا تتجاوز المجموع", c.v);
  const m = masariTile([
    { createdAt: iso("2026-11-01"), wishes: { termId: 1, targetUnits: 15, courseIds: [1, 2], constraints: {}, updatedAt: "" } },
    { createdAt: iso("2026-02-01"), wishes: { termId: 1, targetUnits: 15, courseIds: [], constraints: {}, updatedAt: "" } },
    { createdAt: iso("2026-02-01"), wishes: { termId: 9, targetUnits: 15, courseIds: [3], constraints: {}, updatedAt: "" } },
    {},
  ], 1, RANGE);
  check(m.v.profiles === 4 && m.v.created === 1 && m.v.withWishes === 1, "ملفاتٌ ٤، جديدةٌ هذا الفصل ١، لها رغباتٌ فيه ١ (رغباتٌ فارغة أو لفصلٍ آخر لا تُعدّ)", m.v);
  check(masariTile([], 0, RANGE).v.withWishes === 0, "بلا فصل: لا رغبات");
}

/* ── U: الحمولة وعزل الفشل ── */
{
  const tiles = await runTileProbes([
    { id: "push", run: () => { throw new Error("boom"); } },
    { id: "share", run: async () => { throw new Error("secret-detail"); } },
    { id: "rooms", run: async () => roomsTile({ total: 5, missing: 1 }) },
  ]);
  check(!tiles[0].ok && !tiles[1].ok && tiles[2].ok, "فشلُ مصدرٍ يعزل بطاقتَه فقط");
  check(!JSON.stringify(tiles).includes("secret-detail") && !JSON.stringify(tiles).includes("boom"), "نصُّ الخطأ لا يصل الحمولة");
  const payload = buildFeaturePayload(tiles, 1, NOW, false);
  check(payload.tiles.map(x => x.id).join() === FEATURE_TILE_IDS.join() && payload.tiles.length === 6, "ست بطاقاتٍ بترتيبٍ ثابتٍ، والناقصةُ تُكمَل «تعذّرت»");
  check(!payload.tiles.find(x => x.id === "cards")!.ok, "بطاقةٌ لم تُقرأ أصلاً تظهر تعذّرت لا تُحذف");
}

/* ── V: نموذجُ العرض ── */
{
  const allEmpty = FEATURE_TILE_IDS.map(id => tileView(id === "push" ? pushTile([], 1, RANGE, true, NONE) : id === "share" ? shareTile([], RANGE, NOW) : id === "recovery" ? recoveryTile([], RANGE, NOW)
    : id === "rooms" ? roomsTile({ total: 0, missing: 0 }) : id === "cards" ? cardsTile([]) : masariTile([], 1, RANGE)));
  check(allEmpty.every(v => v.tone === "empty" && !v.attention), "الفارغُ يُعرض «لا بيانات بعد» خافتاً لا خطأً");
  check(allEmpty.every(v => v.bars.every(b => b.zero) && v.chips.every(c => c.zero)), "الأصفارُ وسمُها zero (خافتةٌ) لا أزرارٌ");
  const off = tileView(pushTile([pushProfile()], 1, RANGE, false, NONE));
  check(off.tone === "idle" && off.note === PUSH_OFF_NOTE && off.hint.length > 0 && off.big === null && off.bars.length === 0, "بلا مفاتيح: «غير مفعّل: لا مفاتيح إرسال» وتلميحٌ بسطرٍ واحد");
  const warn = tileView(pushTile([pushProfile()], 1, RANGE, true, { hour: 15, wishesCloseToday: true, roundTomorrow: false }));
  check(warn.tone === "warn" && warn.attention && warn.attentionLine.length > 0, "«انتبه» حين يلزم");
  const ok = tileView(roomsTile({ total: 10, missing: 2 }));
  check(ok.tone === "ok" && !ok.attention && ok.ring === 20 && ok.ringLabel === "20%" && ok.big === "2", "قاعاتٌ بلا سعة: حلقةٌ ٢٠% بلا انتباه");
  check(tileView(roomsTile({ total: 10, missing: 5 })).tone === "warn", "أكثر من ٣٠%: انتبه");
  const unreadable = tileView(unreadableTile("cards"));
  check(unreadable.tone === "unknown" && unreadable.note === "تعذّرت القراءة" && TONE_WORD.unknown === "تعذّرت القراءة", "تعذّرت القراءة لبطاقتها");
  const text = JSON.stringify([...allEmpty, off, warn, ok]);
  check(!/[٠-٩٪]/.test(text), "أرقامٌ لاتينية فقط، ولا «٪»");
  check(!/\b(AI)\b|ذكاء اصطناعي|الذكاء الاصطناعي/.test(text), "لا ألفاظَ ممنوعة في النصوص");
  check(tileView({ id: "share", ok: true, attention: false, v: { created: 4, valid: 1, opened: 0 } }).bars.map(b => b.max).every(n => n === 4), "أشرطةُ البطاقة بمقياسٍ واحد");
}

/* ── H و C: على HTTP داخل العملية ── */
{
  const env = await boot();
  const { Repository, mkProfile, put, call, base } = env;
  const { featureHealthHandler, computeFeatureHealth } = await import("../src/server/featureHealth");
  const { requireAuth, requireRootAdmin } = await import("../src/server/core/auth");
  const { countShareOpen, voidedStudentSecrets } = await import("../src/server/studentExtras");

  const hex = (c: string) => c.repeat(32);
  const FP_A = hex("a"), FP_B = hex("b"), FP_C = hex("c"), FP_D = hex("d");
  const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
  const dayNow = new Date().toISOString().slice(0, 10);
  await put(mkProfile(FP_A, SECTION_A, {
    push: { subs: [sub], sent: { "1:wishes-close": nowIso(-3_600_000) }, removedDays: { [dayNow]: 2 } }, pushOn: true,
    share: { hash: "HASH-DO-NOT-LEAK", createdAt: nowIso(), expiresAt: nowIso(3_600_000) }, shareStats: { made: { [dayNow]: 1 }, opens: { [dayNow]: 4 } },
    createdAt: nowIso(-86_400_000),
  }));
  const issuedAt = nowIso(-3_600_000);
  await put(mkProfile(FP_B, SECTION_A, {
    recoveryLog: [{ at: nowIso(-86_400_000 * 3), byId: 1, byName: NAME, usedAt: nowIso(-86_400_000 * 2) }, { at: issuedAt, byId: 1, byName: NAME }],
    recovery: { hash: "RECOVERY-HASH-DO-NOT-LEAK", issuedAt, expiresAt: nowIso(2 * 3_600_000), issuedById: 1, issuedByName: NAME },
  }));
  await put(mkProfile(FP_C, SECTION_A, { wishes: undefined }));

  /* خادمٌ صغير: مستخدمٌ وهميّ بالترويسة، والحارسان الحقيقيان، والمعالج الحقيقي. */
  const app = express();
  app.use((req: any, _res, next) => { const id = req.headers["x-user"]; if (id) req.user = { SystemUserId: Number(id), IsAdminUser: Number(id) === 2 }; next(); });
  app.get("/api/system-health/features", requireAuth, requireRootAdmin, featureHealthHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const feat = `http://127.0.0.1:${(server.address() as any).port}/api/system-health/features`;
  const get = async (user?: number, query = "") => {
    const res = await fetch(feat + query, { headers: user ? { "x-user": String(user) } : {} });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, text, json, headers: res.headers };
  };

  check((await get()).status === 401, "بلا دخول: ٤٠١");
  check((await get(2)).status === 403, "مديرٌ آخر (ليس الحساب الرئيسي): ٤٠٣");
  check((await get(5)).status === 403, "مستخدمٌ عاديّ: ٤٠٣");
  const okRes = await get(1);
  check(okRes.status === 200 && okRes.headers.get("cache-control") === "no-store", "الحساب الرئيسي: ٢٠٠ بلا تخزين في المتصفح");
  const body = okRes.json;
  check(Array.isArray(body.tiles) && body.tiles.length === 6 && body.tiles.map((x: any) => x.id).join() === FEATURE_TILE_IDS.join(), "الشكل: ست بطاقاتٍ بالترتيب");
  check(body.tiles.every((x: any) => x.ok === true && typeof x.attention === "boolean" && x.v && typeof x.v === "object"), "كلُّ بطاقةٍ مقروءة بأرقامٍ وعلامات");
  const tileOf = (id: string) => body.tiles.find((x: any) => x.id === id);
  check(tileOf("push").v.enabled === 1 && tileOf("push").v.wishes === 1 && tileOf("push").v.removed === 2 && tileOf("push").v.configured === true, "تنبيهات الهاتف من الملفات", tileOf("push").v);
  check(tileOf("share").v.created === 1 && tileOf("share").v.valid === 1 && tileOf("share").v.opened === 4, "شارك مرشدك من الملفات", tileOf("share").v);
  check(tileOf("recovery").v.issued === 2 && tileOf("recovery").v.used === 1 && tileOf("recovery").v.pending === 1 && tileOf("recovery").v.expiringSoon === 1 && tileOf("recovery").attention, "رموز الاستعادة: ينتهي قريباً ينبّه", tileOf("recovery").v);
  check(tileOf("masari").v.profiles === 3 && tileOf("masari").v.withWishes === 2, "مساري: ٣ ملفات، ٢ لها رغبات", tileOf("masari").v);
  check(typeof tileOf("rooms").v.total === "number" && typeof tileOf("cards").v.total === "number", "القاعات والبطاقات مقروءةٌ بلا خطأ");

  /* لا مفتاحَ هويةٍ ولا قيمةَ هوية: نمشي على الـJSON كلِّه. */
  const keys: string[] = [];
  const walk = (value: any) => { if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { keys.push(k); walk(v); } };
  walk(body);
  check(keys.length > 20 && !keys.some(k => FEATURE_FORBIDDEN_KEY.test(k)), "لا مفتاحَ يدلّ على هوية (civil/fingerprint/name/token/hash…)", keys.filter(k => FEATURE_FORBIDDEN_KEY.test(k)));
  const leaks = [NAME, CIVIL, CODE_HASH, FP_A, FP_B, "HASH-DO-NOT-LEAK", "RECOVERY-HASH-DO-NOT-LEAK", "ENDPOINT-SECRET", "P256-SECRET", "AUTH-SECRET", "CIVIL-CIPHER", "NAME-CIPHER"];
  check(leaks.every(s => !okRes.text.includes(s)), "لا اسمَ ولا رقمَ مدنياً ولا بصمةً ولا رمزاً ولا اشتراكاً في الجسم");
  check(JSON.stringify(body).length < 2000, "الحمولةُ صغيرة (أعدادٌ فقط)");

  /* تخبئة دقيقة: تغييرٌ بعد القراءة لا يظهر قبل «تحديث». */
  await put(mkProfile(FP_D, SECTION_A, { shareStats: { opens: { [dayNow]: 10 } } }));
  check((await get(1)).json.tiles.find((x: any) => x.id === "share").v.opened === 4, "المقروء من الذاكرة ضمن الدقيقة");
  check((await get(1, "?fresh=1")).json.tiles.find((x: any) => x.id === "share").v.opened === 14, "«تحديث» (fresh=1) يتجاوز الذاكرة");

  /* فشلُ مصدرٍ يعزل بطاقته: قراءةُ ملفات الطلبة تسقط فتسقط بطاقاتُها الأربع، وتبقى القاعاتُ والبطاقات. */
  {
    const original = Repository.listStudentProfiles;
    (Repository as any).listStudentProfiles = async () => { throw new Error("db down"); };
    const degraded = await computeFeatureHealth(Date.now());
    (Repository as any).listStudentProfiles = original;
    const byId = Object.fromEntries(degraded.tiles.map(x => [x.id, x]));
    check(!byId.push.ok && !byId.share.ok && !byId.recovery.ok && !byId.masari.ok && byId.rooms.ok && byId.cards.ok, "فشلُ ملفات الطلبة يُسقط بطاقاتِها وحدها");
    check(!JSON.stringify(degraded).includes("db down"), "ولا يتسرّب نصُّ الخطأ");
  }
  /* لا مفاتيح إرسال: تُقرأ البطاقةُ «غير مفعّل». */
  {
    process.env.STUDENT_PUSH = "off";
    const off = await computeFeatureHealth(Date.now());
    delete process.env.STUDENT_PUSH;
    check(off.tiles.find(x => x.id === "push")!.v.configured === false, "STUDENT_PUSH=off: بلا مفاتيح إرسال");
  }
  /* بلا بياناتٍ أصلاً. */
  {
    for (const fp of [FP_A, FP_B, FP_C, FP_D]) await Repository.updateStudentProfile(fp, () => null);
    const empty = await computeFeatureHealth(Date.now());
    check(empty.tiles.every(x => x.ok) && empty.tiles.find(x => x.id === "masari")!.v.profiles === 0 && empty.tiles.find(x => x.id === "share")!.v.created === 0, "بلا ملفاتٍ: أصفارٌ لا أخطاء");
  }

  /* ── C: عدّادُ الفتحات ── */
  const FP_S = hex("5");
  await put(mkProfile(FP_S, SECTION_A));
  const made = await call("POST", "/api/public/me/share", {}, FP_S);
  check(made.status === 200 && made.json.url, "إنشاءُ الرابط");
  const afterMake = (await Repository.getStudentProfile(FP_S))!;
  const madeDays = Object.entries(afterMake.shareStats?.made || {});
  check(madeDays.length === 1 && madeDays[0][1] === 1 && /^\d{4}-\d{2}-\d{2}$/.test(madeDays[0][0]) && !afterMake.shareStats?.opens, "إنشاؤه يزيد عدّاد اليوم واحداً ولا فتحاتٍ بعد");
  const link = new URL(made.json.url).pathname;
  const page = await fetch(base + link);
  check(page.status === 200, "الصفحةُ تُفتح");
  await fetch(base + link); await fetch(base + link);
  const afterOpen = (await Repository.getStudentProfile(FP_S))!;
  const openCount = Object.values(afterOpen.shareStats?.opens || {}).reduce((a, b) => a + b, 0);
  check(openCount === 3 && Object.keys(afterOpen.shareStats!.opens!).length === 1, "كلُّ فتحةٍ تزيد عدّاد اليوم (٣)");
  check(JSON.stringify(afterOpen.shareStats).match(/[a-f0-9]{32}/) === null && Object.values(afterOpen.shareStats!.opens!).every(n => typeof n === "number"), "المخزَّن أرقامٌ لكل يومٍ فقط: لا زائرَ ولا عنوانَ ولا بصمة");
  const keysStored = Object.keys(afterOpen.shareStats!).sort().join();
  check(keysStored === "made,opens", "حقلان فقط: made وopens");
  const bad = await fetch(base + link.slice(0, -3) + "AAA");
  check(bad.status === 404, "رمزٌ فاسد: ٤٠٤");
  check(Object.values((await Repository.getStudentProfile(FP_S))!.shareStats!.opens!).reduce((a, b) => a + b, 0) === 3, "الرفضُ لا يعدّ فتحةً");
  const off = await call("POST", "/api/public/me/share/off", {}, FP_S);
  check(off.status === 200 && (await fetch(base + link)).status === 404, "إيقاف المشاركة: الصفحةُ تُغلق");
  const afterOff = (await Repository.getStudentProfile(FP_S))!;
  check(!afterOff.share && Object.values(afterOff.shareStats!.opens!).reduce((a, b) => a + b, 0) === 3, "والفتحةُ المغلقة لا تُعدّ، والأرقامُ السابقة باقية");
  await countShareOpen(FP_S);
  check(Object.values((await Repository.getStudentProfile(FP_S))!.shareStats!.opens!).reduce((a, b) => a + b, 0) === 3, "عدُّ فتحةٍ لملفٍّ بلا رابطٍ لا يفعل شيئاً");
  await countShareOpen(hex("9"));
  check(await Repository.getStudentProfile(hex("9")) === undefined, "ولا ينشئ ملفاً لبصمةٍ مجهولة");
  const again = await call("POST", "/api/public/me/share", {}, FP_S);
  check(again.status === 200 && Object.values((await Repository.getStudentProfile(FP_S))!.shareStats!.made!).reduce((a, b) => a + b, 0) === 2, "رابطٌ جديد: عدّاد الإنشاء ٢ والفتحاتُ السابقة باقية");
  await Repository.updateStudentProfile(FP_S, () => null);
  check(await Repository.getStudentProfile(FP_S) === undefined, "حذفُ الملف يمحو العدّادات معه (لا نسخةَ أخرى منها)");
  const shareStore = JSON.stringify((Repository as any).listFeatureDocs ? await Repository.listFeatureDocs("pushCooldowns" as any) : []);
  check(!shareStore.includes("opens"), "لا وثيقةَ مجمَّعةً أخرى تحفظ الفتحات");

  /* الأجهزة المُزالة: تبقى بعد إسقاط الاشتراكات (تغيير الرمز أو الاستعادة). */
  const voided = voidedStudentSecrets(mkProfile(FP_A, SECTION_A, { push: { subs: [sub], sent: { "1:plan-ready": "x" }, removedDays: { "2026-11-01": 3 } } }));
  check(voided.push!.subs.length === 0 && voided.push!.removedDays!["2026-11-01"] === 3 && voided.push!.sent!["1:plan-ready"] === "x", "تغيير الرمز يُسقط الأجهزة ويُبقي عدّاد المُزالة وعلاماتِ الإرسال");

  await new Promise<void>(resolve => server.close(() => resolve()));
  await env.closeAll();
}

/* ── C2: إزالة الأجهزة المنتهية تُعدّ ── */
{
  const env = await boot();
  const { Repository, mkProfile, put, state, options } = env;
  const { runStudentPushTick } = await import("../src/server/studentExtras");
  const { device } = await import("./helpers/studentExtrasHarness");
  const dev = device("gone-1");
  const fp = "7".repeat(32);
  await put(mkProfile(fp, SECTION_A, { pushOn: true, push: { subs: [{ id: "gone-1", endpoint: dev.endpoint, keys: dev.keys, createdAt: "2026-11-01T00:00:00.000Z" }], sent: {} } }));
  state.status.set(dev.endpoint, 410);
  state.clockMs = kw("2026-11-20", "09:00");
  const report = await runStudentPushTick({ ...options, lock: false });
  const after = (await Repository.getStudentProfile(fp))!;
  const total = Object.values(after.push?.removedDays || {}).reduce((a, b) => a + b, 0);
  check(report.removed === 1 && after.pushOn === undefined && total === 1, "410: الجهازُ يُمحى ويُعدّ يومَ الإزالة (١)", { report, removedDays: after.push?.removedDays });
  check(Object.keys(after.push?.removedDays || {})[0] === "2026-11-20", "تاريخُ الإزالة بتوقيت الكويت");
  await env.closeAll();
}

/* ── S: التوصيل والواجهة ── */
{
  const routes = read("src/server/routes/adminRoutes.ts");
  check(/app\.get\("\/api\/system-health\/features", requireAuth, requireRootAdmin, featureHealthHandler\)/.test(routes), "المسار بحارس سلامة النظام نفسه (requireAuth ثم requireRootAdmin)");
  check(!/app\.(post|put|patch|delete)\("\/api\/system-health/.test(routes), "لا مسارَ كتابة");
  const server = read("src/server/featureHealth.ts");
  check(/FEATURE_CACHE_MS/.test(server) && /createTtlMemo/.test(server) && /canBypassHealthCache/.test(server), "تخبئةٌ دقيقة ومنعُ إغراق «تحديث»");
  check(/runTileProbes/.test(server) && !/console\.(log|warn)/.test(server), "كلُّ بطاقةٍ في فحصٍ معزول ولا يُسجَّل شيءٌ");
  check(!/AdInstructorName|nameCipher|civilCipher|codeHash|fingerprint\b/.test(server), "الخادمُ لا يلمس حقول الهوية");
  const ui = read("src/components/FeatureHealth.tsx");
  check(/role="status" aria-live="polite"/.test(ui) && /<span>تحديث<\/span>/.test(ui) && /fresh=1/.test(ui), "حالةٌ حيّة وزرُّ «تحديث» بتسميةٍ ظاهرة وقراءةٌ حيّة");
  check(/visibilityState === "visible"/.test(ui) && /FEATURE_REFRESH_MS/.test(ui), "تنعيشٌ دقيقةً والتبويبُ ظاهر");
  check((ui.match(/<button/g) || []).length === 2 && (ui.match(/data-guide-ignore=/g) || []).length === 2, "زرّان فقط (تحديث وإعادة المحاولة) وكلٌّ بسببٍ موثَّق للدليل");
  check(!/disabled=\{[^}]*(zero|value)/.test(ui), "لا زرَّ معطّلاً بسبب صفر");
  check(/aria-label=\{`\$\{view\.title\}/.test(ui) && /role="img"/.test(ui), "الأرقامُ والحلقةُ بتسمياتٍ لقارئ الشاشة");
  const sh = read("src/components/SystemHealth.tsx");
  check(/import FeatureHealth from "\.\/FeatureHealth"/.test(sh) && /<FeatureHealth \/>/.test(sh), "داخل لوحة «سلامة النظام» نفسها (للحساب الذي يراها فقط)");
  const css = read("src/styles/64-system-health.css");
  const fh = css.slice(css.indexOf("«سلامة الميزات الجديدة»"));
  check(/\.fh-refresh,\.fh-retry\{[^}]*min-block-size:44px[^}]*min-inline-size:44px/.test(fh) || /\.fh-refresh,\.fh-retry\{[^}]*min-inline-size:44px[^}]*min-block-size:44px/.test(fh), "هدفُ اللمس ٤٤ بكسل");
  const sizes = [...fh.matchAll(/font-size:([\d.]+)rem/g)].map(m => Number(m[1]));
  check(sizes.length > 5 && sizes.every(s => s >= 0.75), "الخطوطُ ≥ ١٢ بكسل (٠٫٧٥rem)", sizes);
  check(/\.fh-grid\{[^}]*grid-template-columns:minmax\(0,1fr\)/.test(fh) && /min-width:960px\)\{\.fh-grid\{grid-template-columns:repeat\(3,/.test(fh) && /min-width:640px\)\{\.fh-grid\{grid-template-columns:repeat\(2,/.test(fh), "الجوالُ عمودٌ واحد، والحاسوبُ ٣×٢");
  check(!/[٠-٩٪]/.test(ui + read("src/utils/featureHealth.ts") + read("src/utils/featureHealthView.ts")), "لا أرقامَ عربية-هندية ولا «٪» في المصادر");
  check(/prefers-reduced-motion/.test(fh), "يحترم تقليلَ الحركة");
  const page = read("src/server/studentSharePage.ts");
  check(!/shareStats|opens/.test(page), "صفحةُ المرشد نفسُها لا تعرض العدّادات");
  const extras = read("src/server/studentExtras.ts");
  check(/countShareOpen\(profile\.fingerprint, clock\)/.test(extras) && !/req\.(ip|headers|get\()/.test(extras.slice(extras.indexOf("export async function countShareOpen"), extras.indexOf("export async function studentPushConfigured"))), "عدُّ الفتحة لا يقرأ عنواناً ولا ترويسةً");
}

console.log(`\n${passed} فحصاً ناجحاً`);
