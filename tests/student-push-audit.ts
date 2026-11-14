/**
 * ── «تذكير يصل وحده» في مساري (Web Push للطالب) ───────────────────────────────
 *
 *   ١) القرارُ النقيّ: أيُّ رسالةٍ تستحق الآن، بساعةٍ ثابتة (صباحُ آخر يومٍ للرغبات، يومٌ قبل الدور، جاهزيةُ الجدول، ساعاتُ الهدوء).
 *   ٢) الاشتراكُ والإيقاف: على ملفّه وحده، بلا رقمٍ مدني ولا بصمةٍ في أيّ ردّ أو رسالة؛ والحدُّ خمسةُ أجهزة.
 *   ٣) المُرسِل المجدول: مرةٌ لكل طالبٍ في الفصل (علامةٌ ذرّية — نسختان معاً لا تُكرّران)، ولكل طالبٍ ما يخصّه وحده.
 *   ٤) 410/404: الاشتراكُ المنتهي يُمحى من الملف.
 *   ٥) بلا مفاتيح أو بإيقافٍ صريح: لا شيءَ يُرمى ولا يُرسل، والواجهةُ تعرف السبب.
 *   ٦) يسقط الاشتراكُ بتغيير الرمز وبالاستعادة، وتبقى علاماتُ «أُرسل».
 *   ٧) الصفحة: زرُّ التفعيل والإيقاف، والعرضُ الواحد، والأسبابُ حين يتعذّر.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { STUDENT_PUSH_KINDS, pushMarkerKey, pushTestMessage, studentPushDue, studentPushMessage, type StudentPushFacts } from "../src/utils/studentPush";
import { STUDENT_EXTRAS_SCRIPT } from "../src/server/studentExtrasScript";
import { CIVIL, CODE_HASH, NAME, SECTION_A, SECTION_B, boot, device, kw } from "./helpers/studentExtrasHarness";

let passed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => { if (!ok) console.log("✗ " + label, extra ?? ""); assert.ok(ok, label); passed++; console.log("✓ " + label); };
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── ١) القرارُ النقيّ ── */
{
  const base: StudentPushFacts = { hour: 9, today: "2026-11-20", termId: 1, mode: "wishes", until: "2026-11-20", planReady: false, roundStart: "", sent: {} };
  check(studentPushDue(base) === "wishes-close", "آخرُ يومٍ للرغبات صباحاً: «الرغبات تُغلق اليوم»");
  check(studentPushDue({ ...base, until: "2026-11-21" }) === null, "قبل آخر يومٍ: لا شيء");
  check(studentPushDue({ ...base, hour: 13 }) === null, "بعد الظهر: فاتَ وقتُها");
  check(studentPushDue({ ...base, hour: 7 }) === null && studentPushDue({ ...base, hour: 21 }) === null && studentPushDue({ ...base, hour: 2 }) === null, "ساعاتُ الهدوء (قبل 08:00 وبعد 21:00): لا شيء");
  check(studentPushDue({ ...base, hour: 8 }) === "wishes-close" && studentPushDue({ ...base, hour: 11 }) === "wishes-close", "من 08:00 إلى 11:59");
  check(studentPushDue({ ...base, mode: "frozen" }) === null, "ليست مرحلةَ الرغبات: لا إغلاقَ يُذكَّر به");
  check(studentPushDue({ ...base, sent: { [pushMarkerKey(1, "wishes-close")]: "2026-11-20T06:00:00Z" } }) === null, "أُرسلت في هذا الفصل: لا تُعاد");
  check(studentPushDue({ ...base, termId: 2, sent: { [pushMarkerKey(1, "wishes-close")]: "x" } }) === "wishes-close", "علامةُ فصلٍ آخر لا تمنع هذا الفصل (مرةٌ لكل فصل)");
  check(studentPushDue({ ...base, termId: 0 }) === null, "بلا فصل: لا شيء");
  const round: StudentPushFacts = { ...base, mode: "frozen", until: "", roundStart: "2026-11-21" };
  check(studentPushDue(round) === "round-tomorrow", "دورُه يبدأ غداً: «يبدأ تسجيلك غداً»");
  check(studentPushDue({ ...round, roundStart: "2026-11-22" }) === null && studentPushDue({ ...round, roundStart: "2026-11-20" }) === null && studentPushDue({ ...round, roundStart: "" }) === null, "غيرُ غدٍ أو غيرُ معروف: لا شيء");
  check(studentPushDue({ ...round, roundStart: "2026-12-01", today: "2026-11-30" }) === "round-tomorrow", "عبور الشهر");
  check(studentPushDue({ ...round, roundStart: "2027-01-01", today: "2026-12-31" }) === "round-tomorrow", "عبور السنة");
  check(studentPushDue({ ...base, mode: "frozen", until: "", planReady: true }) === "plan-ready", "ظهر له جدولٌ مقترح: «جدولك المقترح جاهز»");
  check(studentPushDue({ ...base, mode: "frozen", until: "", planReady: true, sent: { [pushMarkerKey(1, "plan-ready")]: "x" } }) === null, "ومرةٌ واحدة");
  const both = { ...base, planReady: true, roundStart: "2026-11-21" };
  check(studentPushDue(both) === "wishes-close", "اجتماعُ أكثر من رسالة: واحدةٌ في كل مرور، وأولاها بالفوات");
  check(studentPushDue({ ...both, sent: { [pushMarkerKey(1, "wishes-close")]: "x" } }) === "round-tomorrow" && studentPushDue({ ...both, sent: { [pushMarkerKey(1, "wishes-close")]: "x", [pushMarkerKey(1, "round-tomorrow")]: "x" } }) === "plan-ready", "ثم التي تليها في المرور التالي");
  for (const kind of STUDENT_PUSH_KINDS) {
    const text = `${studentPushMessage(kind).title} ${studentPushMessage(kind).body}`;
    check(studentPushMessage(kind).title.length <= 30 && studentPushMessage(kind).body.length <= 40 && studentPushMessage(kind).url === "/me", `رسالة ${kind}: قصيرةٌ وتفتح /me`);
    check(!/[A-Za-z]{2,}/.test(text) && !/\d{3,}/.test(text) && !text.includes("سارة"), `رسالة ${kind}: بلا اسمٍ ولا رقم ولا لاتينية`);
  }
  check(studentPushMessage("wishes-close").title === "الرغبات تُغلق اليوم" && studentPushMessage("plan-ready").title === "جدولك المقترح جاهز" && studentPushMessage("round-tomorrow").title === "يبدأ تسجيلك غداً", "النصوص كما اعتمدها المالك");
  check(!/الرادار|تذكرتي|المحاكاة/.test(JSON.stringify(STUDENT_PUSH_KINDS.map(studentPushMessage))), "مفرداتُ مساري: لا «الرادار»");
  check(pushTestMessage().title === "هكذا يصلك التذكير", "رسالةُ التجربة");
}

/* ── ٢) المسارات والمخزن ── */
const h = await boot();
const { call, open, toDevice, state, Repository } = h;
const FP_A = "a".repeat(32), FP_B = "b".repeat(32);
await h.put(h.mkProfile(FP_A, SECTION_A));
await h.put(h.mkProfile(FP_B, SECTION_B));
const dA = device("student-a-phone"), dA2 = device("student-a-tablet"), dB = device("student-b-phone");
const leaks = (value: unknown) => { const text = typeof value === "string" ? value : JSON.stringify(value); return [FP_A, FP_B, CIVIL, NAME, CODE_HASH, "CIPHER"].filter(secret => text.includes(secret)); };
try {
  check((await call("GET", "/api/public/me/extras")).status === 401 && (await call("POST", "/api/public/me/push", { subscription: dA })).status === 401, "بلا جلسةٍ: ٤٠١");
  const first = await call("GET", "/api/public/me/extras", undefined, FP_A);
  check(first.status === 200 && first.json.push.configured === true && first.json.push.publicKey.length > 60 && first.json.push.count === 0 && first.json.push.offerNow === true, "الحالة: مفعَّلةٌ على الخادم، لا جهازَ بعد، ويُعرض التفعيلُ مرة", first.json?.push);
  check(first.headers.get("cache-control") === "no-store" && leaks(first.text).length === 0, "الردُّ بلا تخزين ولا رقمَ مدنياً ولا بصمةً ولا اسماً ولا رمزاً", leaks(first.text));

  check((await call("POST", "/api/public/me/push", { subscription: { endpoint: "https://evil.example/x", keys: dA.keys } }, FP_A)).status === 400, "رابطٌ خارج خدمات الدفع: ٤٠٠");
  check((await call("POST", "/api/public/me/push", { subscription: { endpoint: dA.endpoint, keys: { p256dh: "AAAA", auth: "BBBB" } } }, FP_A)).status === 400, "مفتاحٌ فاسد: ٤٠٠");
  check((await call("POST", "/api/public/me/push", {}, FP_A)).status === 400, "بلا اشتراك: ٤٠٠");
  const sub = await call("POST", "/api/public/me/push", { subscription: { endpoint: dA.endpoint, keys: dA.keys } }, FP_A);
  check(sub.status === 200 && sub.json.ok && sub.json.count === 1 && sub.json.id.length === 64 && leaks(sub.text).length === 0, "اشتراكُ جهازٍ: يُحفظ ويعود معرّفٌ مجزّأ لا الرابط", sub.json);
  check(!sub.text.includes("fcm.googleapis.com"), "ولا يُعاد رابطُ الاشتراك");
  let stored = (await Repository.getStudentProfile(FP_A))!;
  check(stored.pushOn === true && stored.push!.subs.length === 1 && stored.push!.subs[0].endpoint === dA.endpoint, "الاشتراكُ على ملفّه ومعه pushOn");
  await call("POST", "/api/public/me/push", { subscription: { endpoint: dA.endpoint, keys: dA.keys } }, FP_A);
  stored = (await Repository.getStudentProfile(FP_A))!;
  check(stored.push!.subs.length === 1, "الجهازُ الواحد سجلٌّ واحد مهما اشترك");
  check((await call("GET", "/api/public/me/extras", undefined, FP_A)).json.push.offerNow === false, "اشتراكُه يُسقط العرض");
  check((await Repository.getStudentProfile(FP_B))!.pushOn === undefined, "ملفُّ غيره لم يُمسّ");

  /* حدُّ الأجهزة: الأقدمُ يسقط */
  const many = Array.from({ length: 6 }, (_, i) => device(`many-${i}`));
  for (const d of many) await call("POST", "/api/public/me/push", { subscription: { endpoint: d.endpoint, keys: d.keys } }, FP_A);
  stored = (await Repository.getStudentProfile(FP_A))!;
  check(stored.push!.subs.length === 5 && !stored.push!.subs.some(s => s.endpoint === dA.endpoint) && stored.push!.subs.some(s => s.endpoint === many[5].endpoint), "خمسةُ أجهزةٍ على الأكثر: الأقدمُ يسقط");
  const off = await call("POST", "/api/public/me/push/off", {}, FP_A);
  check(off.json.ok && off.json.count === 0, "«أوقف التنبيهات» بلا رابط: كلُّ أجهزته");
  stored = (await Repository.getStudentProfile(FP_A))!;
  check(stored.pushOn === undefined && stored.push!.subs.length === 0, "لا pushOn بعد آخر جهاز");

  /* الإيقاف لجهازٍ بعينه، والرابطُ لا يمسّ ملفَّ غيره */
  await call("POST", "/api/public/me/push", { subscription: { endpoint: dA.endpoint, keys: dA.keys } }, FP_A);
  await call("POST", "/api/public/me/push", { subscription: { endpoint: dA2.endpoint, keys: dA2.keys } }, FP_A);
  await call("POST", "/api/public/me/push", { subscription: { endpoint: dB.endpoint, keys: dB.keys } }, FP_B);
  check((await call("POST", "/api/public/me/push/off", { endpoint: dB.endpoint }, FP_A)).json.count === 2, "رابطُ جهازِ غيره لا يُسقط شيئاً من أجهزتي");
  check((await Repository.getStudentProfile(FP_B))!.push!.subs.length === 1, "ولا يمسّ ملفَّه");
  check((await call("POST", "/api/public/me/push/off", { endpoint: dA2.endpoint }, FP_A)).json.count === 1, "إيقافُ جهازٍ بعينه");

  /* ── التجربة: إلى أجهزتي وحدها ── */
  state.sent.length = 0;
  const test = await call("POST", "/api/public/me/push/test", {}, FP_A);
  check(test.json.ok && test.json.sent === 1 && state.sent.length === 1 && state.sent[0].endpoint === dA.endpoint, "«جرّب تنبيهاً»: إلى جهاز صاحبه وحده");
  check(toDevice(dB.endpoint).length === 0, "ولا شيءَ إلى جهاز طالبٍ آخر");
  const opened = open(state.sent[0], dA);
  check(opened.title === "هكذا يصلك التذكير" && opened.url === "/me" && leaks(opened).length === 0, "نصُّه قصيرٌ بلا اسمٍ ولا رقمٍ ولا بصمة", opened);
  check(leaks(JSON.stringify(state.sent[0].body.toString("latin1"))).length === 0 && !state.sent[0].body.toString("utf8").includes(FP_A), "ولا يظهر في الجسم المشفَّر ما يدلّ على صاحبه");
  check((await call("POST", "/api/public/me/push/test", {}, "c".repeat(32))).status === 401, "بلا ملف: ٤٠١");
  await h.put(h.mkProfile("d".repeat(32), SECTION_A));
  check((await call("POST", "/api/public/me/push/test", {}, "d".repeat(32))).status === 409, "بلا جهاز: ٤٠٩ «فعّل التنبيهات أولاً»");
  for (let i = 0; i < 5; i += 1) await call("POST", "/api/public/me/push/test", {}, FP_A);
  check((await call("POST", "/api/public/me/push/test", {}, FP_A)).status === 429, "حدٌّ لكل جهاز: لا إغراقَ بالتجربة");

  /* «لاحقاً» */
  await h.put(h.mkProfile("e".repeat(32), SECTION_A));
  check((await call("GET", "/api/public/me/extras", undefined, "e".repeat(32))).json.push.offerNow === true, "ملفٌّ كامل بلا جهاز: يُعرض عليه");
  await call("POST", "/api/public/me/push/offered", {}, "e".repeat(32));
  check((await call("GET", "/api/public/me/extras", undefined, "e".repeat(32))).json.push.offerNow === false, "«لاحقاً»: لا يُعاد عليه العرض");
  await h.put({ ...h.mkProfile("f".repeat(32), SECTION_A), AdSectionId: 0, AdCollegeId: 0, passedCourseIds: [] });
  check((await call("GET", "/api/public/me/extras", undefined, "f".repeat(32))).json.push.offerNow === false, "ملفٌّ لم يكتمل (بلا قسم): لا عرض");

  /* ── ٣) المُرسِل المجدول ── */
  const { runStudentPushTick, voidedStudentSecrets, PUSH_TICK_PAGE } = await import("../src/server/studentExtras");
  // أبقِ طالبَين فقط: أ (جهازان) وب (جهاز)
  for (const fp of ["d", "e", "f"].map(c => c.repeat(32))) await Repository.updateStudentProfile(fp, () => null);
  await call("POST", "/api/public/me/push", { subscription: { endpoint: dA2.endpoint, keys: dA2.keys } }, FP_A);
  state.sent.length = 0;
  state.clockMs = kw("2026-11-20", "03:00");
  let report = await runStudentPushTick({ ...h.options, lock: false });
  check(report.reason === "quiet-hours" && state.sent.length === 0, "03:00: ساعاتُ الهدوء، لا يُرسل ولا يقرأ");
  state.clockMs = kw("2026-11-20", "13:00");
  report = await runStudentPushTick({ ...h.options, lock: false });
  check(report.sent === 0 && state.sent.length === 0, "13:00 في آخر يومٍ: فاتَ وقتُ «تُغلق اليوم»");
  state.clockMs = kw("2026-11-20", "09:00");
  const [one, two] = await Promise.all([runStudentPushTick({ ...h.options, lock: false }), runStudentPushTick({ ...h.options, lock: false })]);
  check(state.sent.length === 3 && one.sent + two.sent === 3, "صباحُ آخر يوم: نسختان معاً — ثلاثةُ تنبيهاتٍ فقط (جهازان لأ وجهازٌ لب) لا ستة", state.sent.length);
  check(toDevice(dA.endpoint).length === 1 && toDevice(dA2.endpoint).length === 1 && toDevice(dB.endpoint).length === 1, "كلُّ جهازٍ تنبيهٌ واحد، إلى صاحبه");
  const msg = open(toDevice(dA.endpoint)[0], dA);
  check(msg.title === "الرغبات تُغلق اليوم" && msg.tag === "masari-wishes-close" && leaks(msg).length === 0, "نصُّه «الرغبات تُغلق اليوم» بلا اسمٍ ولا رقمٍ ولا بصمة", msg);
  check(open(toDevice(dB.endpoint)[0], dB).title === "الرغبات تُغلق اليوم", "ولطالبٍ آخر رسالتُه هو");
  const fa = (await Repository.getStudentProfile(FP_A))!;
  check(fa.push!.sent![pushMarkerKey(1, "wishes-close")] === new Date(kw("2026-11-20", "09:00")).toISOString() && Boolean(fa.push!.subs[0].lastSentAt), "علامةُ «أُرسل» بوقتها على ملفّه (ومعها آخرُ إرسال لجهازه)");
  state.sent.length = 0;
  state.clockMs = kw("2026-11-20", "10:00");
  await runStudentPushTick({ ...h.options, lock: false });
  check(state.sent.length === 0, "مرورٌ آخر في اليوم نفسه: لا تكرار (مرةٌ لكل طالبٍ في الفصل)");
  /* قفلُ النسخ: نسخةٌ واحدة تمسح في الساعة */
  state.clockMs = kw("2026-11-21", "09:00");
  const locked1 = await runStudentPushTick({ ...h.options });
  const locked2 = await runStudentPushTick({ ...h.options });
  check(!locked1.locked && locked2.locked === true, "قفلٌ في قاعدة البيانات: النسخةُ الثانية تتخطّى المسحَ المكرّر");

  /* ── جاهزيةُ الجدول ويومُ ما قبل الدور ── */
  await h.seedTickets([{ fp: FP_A, sid: SECTION_A, window: 1 }, { fp: FP_B, sid: SECTION_B, window: 1 }]);
  state.sent.length = 0;
  state.clockMs = kw("2026-11-22", "10:00"); // بعد إغلاق الرغبات: مجمَّد، قبل الدور
  report = await runStudentPushTick({ ...h.options, lock: false });
  check(state.sent.length === 3 && open(toDevice(dA.endpoint)[0], dA).title === "جدولك المقترح جاهز", "بعد التجميد وظهور الجدول: «جدولك المقترح جاهز» لكل جهاز", state.sent.length);
  state.sent.length = 0;
  await runStudentPushTick({ ...h.options, lock: false });
  check(state.sent.length === 0, "ومرةٌ واحدة");
  state.sent.length = 0;
  state.clockMs = kw("2026-11-24", "10:00"); // الدور يبدأ 2026-11-25
  await runStudentPushTick({ ...h.options, lock: false });
  check(state.sent.length === 3 && open(toDevice(dA.endpoint)[0], dA).title === "يبدأ تسجيلك غداً", "قبل دوره بيوم: «يبدأ تسجيلك غداً»");
  state.sent.length = 0;
  await runStudentPushTick({ ...h.options, lock: false });
  check(state.sent.length === 0, "ومرةٌ واحدة");
  const sentKeys = Object.keys((await Repository.getStudentProfile(FP_A))!.push!.sent!).sort();
  check(sentKeys.join() === ["1:plan-ready", "1:round-tomorrow", "1:wishes-close"].join(), "ثلاثُ علاماتٍ لفصلٍ واحد", sentKeys);

  /* ── الأساس عند الاشتراك: ما هو قائمٌ لا يُعاد خبراً ── */
  await h.put(h.mkProfile("9".repeat(32), SECTION_A));
  await h.seedTickets([{ fp: FP_A, sid: SECTION_A }, { fp: FP_B, sid: SECTION_B }, { fp: "9".repeat(32), sid: SECTION_A }]);
  state.clockMs = kw("2026-11-22", "10:00");
  await call("POST", "/api/public/me/push", { subscription: device("late-joiner") }, "9".repeat(32));
  state.sent.length = 0;
  await runStudentPushTick({ ...h.options, lock: false });
  check(state.sent.filter(entry => entry.endpoint.endsWith("late-joiner")).length === 0, "من اشترك والجدولُ ظاهرٌ له: لا «جاهز» (ما يتغيّر بعد اشتراكه هو الخبر)");
  check(Boolean((await Repository.getStudentProfile("9".repeat(32)))!.push!.sent![pushMarkerKey(1, "plan-ready")]), "أُثبت أساساً في علاماته");

  /* ── ٤) 410 ── */
  const gone = device("gone-device");
  await h.put(h.mkProfile("8".repeat(32), SECTION_A));
  await call("POST", "/api/public/me/push", { subscription: { endpoint: gone.endpoint, keys: gone.keys } }, "8".repeat(32));
  await call("POST", "/api/public/me/push", { subscription: { endpoint: dA.endpoint, keys: dA.keys } }, "8".repeat(32));
  state.status.set(gone.endpoint, 410);
  const bad = await call("POST", "/api/public/me/push/test", {}, "8".repeat(32));
  check(bad.json.removed === 1, "خدمةُ الدفع ردّت ٤١٠: يُحصى محذوفاً");
  check((await Repository.getStudentProfile("8".repeat(32)))!.push!.subs.map(s => s.endpoint).join() === dA.endpoint, "ويُمحى من الملف؛ ويبقى الجهازُ السليم");
  const g2 = device("gone-404");
  await call("POST", "/api/public/me/push", { subscription: { endpoint: g2.endpoint, keys: g2.keys } }, "8".repeat(32));
  await Repository.updateStudentProfile("8".repeat(32), c => (c ? { ...c, push: { ...c.push!, subs: c.push!.subs.filter(s => s.endpoint === g2.endpoint) } } : undefined));
  state.status.set(g2.endpoint, 404);
  await call("POST", "/api/public/me/push/test", {}, "8".repeat(32));
  const after410 = (await Repository.getStudentProfile("8".repeat(32)))!;
  check(after410.push!.subs.length === 0 && after410.pushOn === undefined, "٤٠٤ كذلك؛ وآخرُ جهازٍ يُسقط pushOn فلا يقرؤه المُرسِل");
  /* انتهاءٌ أثناء المرور المجدول */
  const g3 = device("gone-scheduled");
  await h.put(h.mkProfile("7".repeat(32), SECTION_A));
  await call("POST", "/api/public/me/push", { subscription: { endpoint: g3.endpoint, keys: g3.keys } }, "7".repeat(32));
  state.status.set(g3.endpoint, 410);
  state.clockMs = kw("2026-11-20", "09:30");
  await Repository.updateStudentProfile("7".repeat(32), c => (c ? { ...c, push: { ...c.push!, sent: {} } } : undefined));
  report = await runStudentPushTick({ ...h.options, lock: false });
  check(report.removed >= 1 && (await Repository.getStudentProfile("7".repeat(32)))!.pushOn === undefined, "والمرورُ المجدول يمحو المنتهي أيضاً");
  state.status.clear();

  /* ── ٥) بلا إعدادٍ: لا شيءَ يُرمى ── */
  state.vapid = false;
  const off1 = await call("GET", "/api/public/me/extras", undefined, FP_A);
  check(off1.status === 200 && off1.json.push.configured === false && off1.json.push.publicKey === "" && off1.json.push.offerNow === false, "بلا مفاتيح: الحالةُ تقول «غير مفعَّلة» ولا عرضَ");
  const off2 = await call("POST", "/api/public/me/push", { subscription: { endpoint: dA.endpoint, keys: dA.keys } }, FP_A);
  check(off2.status === 503 && off2.json.code === "push-off", "الاشتراكُ: ٥٠٣ برمزٍ مفهوم لا خطأٌ مرمي");
  state.sent.length = 0;
  const tickOff = await runStudentPushTick({ ...h.options, lock: false });
  check(tickOff.reason === "push-not-configured" && state.sent.length === 0, "المُرسِلُ المجدول: لا يرمي ولا يُرسل");
  state.vapid = true;
  process.env.STUDENT_PUSH = "off";
  check((await call("GET", "/api/public/me/extras", undefined, FP_A)).json.push.configured === false && (await runStudentPushTick({ ...h.options, lock: false })).reason === "push-not-configured", "STUDENT_PUSH=off يوقفها صراحةً");
  delete process.env.STUDENT_PUSH;
  check((await call("GET", "/api/public/me/extras", undefined, FP_A)).json.push.configured === true, "ويعود بحذفه");

  /* ── ٦) يسقط بتغيير الرمز والاستعادة ── */
  const cur = (await Repository.getStudentProfile(FP_A))!;
  const voided = voidedStudentSecrets({ ...cur, share: { hash: "h", createdAt: "x", expiresAt: "y" } });
  check(voided.pushOn === undefined && voided.share === undefined && voided.push!.subs.length === 0 && Object.keys(voided.push!.sent || {}).length === 3, "voidedStudentSecrets: الأجهزةُ والمشاركة تسقط، وعلاماتُ «أُرسل» تبقى");
  const routes = read("src/server/studentDoorRoutes.ts");
  const codeBlock = routes.slice(routes.indexOf('app.post("/api/public/me/code"'), routes.indexOf('app.post("/api/public/me/keep"'));
  const recoverBlock = routes.slice(routes.indexOf('app.post("/api/public/me/recover"'), routes.indexOf("app.get(\"/api/public/me/reminder\""));
  check(codeBlock.includes("...voidedStudentSecrets(current)") && recoverBlock.includes("...voidedStudentSecrets(current)"), "تغييرُ الرمز والاستعادة كلاهما يُسقطان الأجهزةَ والمشاركة");
  const profilePurge = read("src/server/studentExtras.ts");
  check(/setInterval\(tick, 3_600_000\)\.unref/.test(profilePurge) && /setTimeout\(tick, 2 \* 60_000\)\.unref/.test(profilePurge), "المُرسِلُ المجدول لا يحجز الإغلاق ويبدأ متأخراً (لا يعطّل الإقلاع)");
  check(read("server.ts").includes("scheduleStudentPush("), "الخادمُ يجدول المُرسِل عند الإقلاع");
  check(PUSH_TICK_PAGE <= 500, "دفعاتٌ محدودة");
  check(!/civil|fingerprint/i.test(JSON.stringify(studentPushMessage("plan-ready"))), "الرسالةُ نفسُها لا تحمل حقلاً للهوية");
} finally { await h.closeAll(); }

/* ── ٧) الصفحة ── */
{
  const s = STUDENT_EXTRAS_SCRIPT;
  check(s.includes('"/api/public/me/push"') && s.includes('"/api/public/me/push/off"') && s.includes('"/api/public/me/push/test"') && s.includes('"/api/public/me/push/offered"'), "الصفحة تنادي مساراتِ الاشتراك والإيقاف والتجربة والعرض");
  check(s.includes("فعّل التنبيهات") && s.includes("أوقف التنبيهات") && s.includes("لاحقاً"), "الأزرارُ بمفرداتها");
  check(s.includes('register("/push-sw.js",{scope:"/me"})') && s.includes("userVisibleOnly:true"), "عاملُ التنبيهات بنطاق /me، ومرئيّةُ التنبيه");
  check(s.includes("التنبيهات غير مفعّلة على هذا الخادم") && s.includes("متصفحك لا يدعم التنبيهات") && s.includes("الإذن مرفوض") && s.includes("أضف مساري إلى الشاشة الرئيسية"), "الأسبابُ حين يتعذّر: خادمٌ بلا إعداد، متصفحٌ لا يدعم، إذنٌ مرفوض، آيفون خارج الشاشة الرئيسية");
  check(/if\(st\.why\)h\+=.{0,200}disabled/.test(s), "وزرُّ التفعيل يُعطَّل مع السبب");
  check(s.includes("d.offerNow") && s.includes("gx-olater"), "العرضُ الأول بـ«لاحقاً»");
  check(!/localStorage|sessionStorage|indexedDB/.test(s), "بلا تخزينٍ في المتصفح");
  check(read("public/push-sw.js").includes('"/me"') && read("public/push-sw.js").includes("isPublicPage"), "عاملُ التنبيهات يفتح /me في لسانٍ جديد لا في التطبيق");
}

console.log(`\n${passed} فحصاً نجحت.`);
process.exit(0);
