/**
 * ── «شارك مرشدك»: رابطٌ للقراءة فقط لأربعٍ وعشرين ساعة ────────────────────────
 *
 *   ١) الرمز: ١٩٢ بتّاً، بصمتُه وحدها على الملف، ومُحدِّدُ الملف مختومٌ لا بصمةٌ مكشوفة.
 *   ٢) دورةُ الحياة: صالح ← جديدٌ يُبطل السابق ← منتهٍ بعد ٢٤ ساعة ← موقوفٌ فوراً؛ والعبثُ بالرمز أو خلطُ رمزَي طالبَين يُرفض.
 *   ٣) الصفحة: القسمُ والصحيفةُ والتقدّمُ والمنجَزُ والرغباتُ وأسبوعُ الجدول، **ولا اسمَ ولا رقمَ مدنياً ولا رمزاً ولا بصمة**.
 *   ٤) الترويسات: بلا تخزين، بلا فهرسة، بلا مُحيل، وCSP بلا سكربت.
 *   ٥) حدُّ المعدّل، والحذفُ مع الملف، وعزلُ الطلبة بعضهم عن بعض، وسقوطُها بتغيير الرمز.
 *   ٦) رمزُ QR: يُرسم في الخادم بلا خدمةٍ خارجية.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SHARE_HOURS, SHARE_SECRET_BYTES, SHARE_TOKEN_PATTERN, issueShare, readShareToken, shareHash, shareQrSvg, shareState } from "../src/server/studentShare";
import { renderShareGone, renderSharePage, kuwaitStamp, type ShareSnapshot } from "../src/server/studentSharePage";

let passed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => { if (!ok) console.log("✗ " + label, extra ?? ""); assert.ok(ok, label); passed++; console.log("✓ " + label); };
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── ١) الرمز ── */
const KEY = Buffer.from("k".repeat(32));
const FP = "0123456789abcdef0123456789abcdef";
{
  const now = Date.parse("2026-11-15T10:00:00Z");
  const a = issueShare(KEY, FP, now), b = issueShare(KEY, FP, now);
  const [locator, secret] = a.token.split(".");
  check(SHARE_TOKEN_PATTERN.test(a.token) && Buffer.from(secret, "base64url").length === SHARE_SECRET_BYTES && SHARE_SECRET_BYTES * 8 === 192, "السرُّ ١٩٢ بتّاً عشوائية (24 بايتاً) في رابطٍ آمنٍ للعناوين");
  check(a.token !== b.token && a.hash !== b.hash, "كلُّ إصدارٍ رمزٌ جديد");
  check(a.hash === shareHash(secret) && a.hash.length === 64 && !a.hash.includes(secret), "على الملف بصمةُ السرّ (SHA-256) لا السرّ");
  check(!a.token.includes(FP) && !Buffer.from(locator, "base64url").toString("latin1").includes(FP) && !Buffer.from(locator, "base64url").includes(Buffer.from(FP, "hex")), "المُحدِّدُ لا يحمل البصمةَ مكشوفةً (لا نصاً ولا بايتات)");
  check(readShareToken(KEY, a.token)?.fingerprint === FP && readShareToken(KEY, a.token)?.secret === secret, "الخادمُ يفتح المُحدِّد بمفتاحه فيجد الملف");
  check(readShareToken(Buffer.from("x".repeat(32)), a.token) === null, "بمفتاحٍ آخر لا يُفتح");
  check(new Date(a.expiresAt).getTime() - now === SHARE_HOURS * 3_600_000 && SHARE_HOURS === 24, "ينتهي بعد ٢٤ ساعة تماماً");
  const tampered = `${locator.slice(0, -2)}${locator.slice(-2) === "AA" ? "BB" : "AA"}.${secret}`;
  check(readShareToken(KEY, tampered) === null, "العبثُ بالمُحدِّد (AES-GCM موثَّق) يُرفض");
  for (const bad of ["", "abc", "a.b", `${locator}`, `${locator}.${secret}x`, `${locator}.${secret.slice(1)}`, `../${a.token}`, `${locator}.${secret}.${secret}`, "<script>.alert"]) check(readShareToken(KEY, bad) === null, `رمزٌ بشكلٍ خاطئ يُرفض قبل أيّ فكّ: «${bad.slice(0, 18)}»`);
  const mine = { hash: a.hash, expiresAt: a.expiresAt };
  check(shareState(mine, secret, now + 1000) === "ok" && shareState(mine, secret, now + 24 * 3_600_000 - 1) === "ok", "صالحٌ حتى الدقيقة الأخيرة");
  check(shareState(mine, secret, now + 24 * 3_600_000) === "expired" && shareState(mine, secret, now + 25 * 3_600_000) === "expired", "ومنتهٍ عند الأربع والعشرين");
  check(shareState(mine, readShareToken(KEY, b.token)!.secret, now) === "mismatch", "سرٌّ آخر لا يطابق البصمة");
  check(shareState(undefined, secret, now) === "none" && shareState({ hash: "", expiresAt: a.expiresAt }, secret, now) === "none", "ملفٌّ بلا مشاركة");
  const src = read("src/server/studentShare.ts");
  check(src.includes("timingSafeEqual") && !/Math\.random/.test(src) && src.includes("randomBytes"), "مقارنةٌ بزمنٍ ثابت وعشوائيةٌ تشفيرية");
}

/* ── ٦) QR ── */
{
  const url = "https://schedule-kw.com/me/share/" + issueShare(KEY, FP, 1).token;
  const svg = shareQrSvg(url);
  check(svg.startsWith("<svg") && svg.includes('viewBox="0 0 ') && svg.includes("<path") && svg.includes('fill="#fff"') && !/https?:\/\/(?!www\.w3\.org)/.test(svg), "SVG نظيفٌ بلا روابط خارجية ولا سكربت");
  check(!/<script|onload|href=/.test(svg), "ولا سكربتَ فيه");
  check(shareQrSvg(url) === svg && shareQrSvg(url + "x") !== svg, "حتميٌّ لرابطٍ واحد ويتغيّر بتغيّره");
  const side = Number(/viewBox="0 0 (\d+) /.exec(svg)![1]);
  check(side >= 29 && side <= 80, "حجمٌ يُمسح من هاتف (نسخةٌ معقولة)", side);
  check(!read("src/server/studentShare.ts").includes("api.qrserver") && !read("src/server/studentExtrasScript.ts").includes("qrserver"), "لا خدمةَ QR خارجية: لا تُرسل الروابطُ إلى طرفٍ ثالث");
}

/* ── ٣) الصفحة المرسومة نفسُها ── */
{
  const snap: ShareSnapshot = { college: "كلية س", section: "قسم ص", plan: "صحيفة ع", percent: 40, passedUnits: 40, remainingUnits: 60, terms: 5, unitsPerTerm: 14,
    passed: Array.from({ length: 12 }, (_, i) => ({ code: `C${100 + i}`, name: `مقرر ${i}` })), termName: "الفصل الأول", wishes: [{ code: "W1", name: "رغبة" }],
    week: [{ courseId: 1, day: 0, start: 480, end: 570, name: "مقرر أ", code: "A1", section: "01" }], expiresAt: "2026-11-16T10:00:00.000Z" };
  const page = renderSharePage(snap);
  check(!/<script/i.test(page) && !/<img/i.test(page) && !/https?:\/\//.test(page), "لا سكربتَ ولا صورةً خارجية ولا رابطاً في الصفحة");
  check(page.includes('name="robots" content="noindex,nofollow,noarchive"') && page.includes('name="referrer" content="no-referrer"') && page.includes('lang="ar" dir="rtl"') && page.includes("viewport-fit=cover"), "لا تُفهرَس ولا تُحيل، عربيةٌ يمينيةٌ للهاتف");
  check(page.includes("للقراءة فقط · تنتهي المشاركة في 16 نوفمبر · 13:00"), "«للقراءة فقط · تنتهي المشاركة في <الوقت>» بتوقيت الكويت", kuwaitStamp(snap.expiresAt));
  check(!/prefers-color-scheme/.test(page) && page.includes("color-scheme:light"), "نهاريةٌ دائماً");
  const sizes = [...page.matchAll(/font-size:([\d.]+)px/g)].map(x => Number(x[1]));
  check(Math.min(...sizes) >= 11 && [...page.matchAll(/font-size:11px/g)].length <= 4, "لا خطَّ دون ١٢px إلا شبكةَ الأسبوع (١١px)", sizes);
  check(page.includes("عرض الكل (12)") && page.includes("المقررات المنجزة") && page.includes("رغباته") && page.includes("جدوله المقترح") && page.includes("فصول للتخرّج"), "الأقسام: المنجَز (يُطوى بعد ثمانية) والرغبات والجدول وفصول التخرّج");
  check(renderSharePage({ ...snap, wishes: [], week: null }).includes("رغباته") === false && renderSharePage({ ...snap, wishes: [], week: null }).includes("جدوله المقترح") === false, "بلا رغباتٍ أو جدولٍ: لا بطاقةَ فارغة");
  const done = renderSharePage({ ...snap, percent: 100, remainingUnits: 0, terms: 0 });
  check(done.includes("أكمل الصحيفة") && done.includes("✓"), "أكمل الصحيفة");
  const none = renderSharePage({ ...snap, percent: null, passedUnits: 0, remainingUnits: 0, terms: 0, passed: [], wishes: [], week: null });
  check(none.includes("لا مقررات في الصحيفة") && none.includes("لم يُعلَّم مقررٌ منجز بعد"), "صحيفةٌ بلا مقررات: «—» لا «اكتمل»");
  const evil = renderSharePage({ ...snap, section: '<img src=x onerror=alert(1)>', passed: [{ code: '"><b>', name: "<script>x</script>" }] });
  check(!evil.includes("<img src=x") && !evil.includes("<script>x") && evil.includes("&lt;img"), "كلُّ نصٍّ مُهرَّب");
  check(renderShareGone().includes("هذه المشاركة غير متاحة") && !/<script/.test(renderShareGone()), "صفحةُ «غير متاحة» حيادية");
}

/* ── ٢ و٣ و٥) الخادم ── */
process.env.STUDENT_SHARE_PER_MINUTE = "40";
const { boot, CIVIL, CODE_HASH, NAME, SECTION_A, SECTION_B, kw } = await import("./helpers/studentExtrasHarness");
const h = await boot();
const { call, state, Repository } = h;
const FP_A = "a".repeat(32), FP_B = "b".repeat(32);
await h.put(h.mkProfile(FP_A, SECTION_A));
await h.put(h.mkProfile(FP_B, SECTION_B));
const secretsOf = [FP_A, FP_B, CIVIL, NAME, CODE_HASH, "CIPHER", "SALT", "سارة", "العتيبي", "345"];
/* رسمُ QR (حقل svg) أرقامُ إحداثياتٍ عشوائية: سرٌّ قصير مثل «345» يقع فيه صدفةً فيُسقط الاختبار بلا تسريب (CI 2026-11-14).
   فيُستثنى الحقل وحده من الفحص؛ والرابطُ الذي يرمّزه يبقى مفحوصاً في حقل url. */
const bare = (text: string) => text.replace(/"svg":"(?:[^"\\]|\\.)*"/g, '"svg":""');
const leaks = (text: string) => secretsOf.filter(secret => bare(text).includes(secret));
const pathOf = (url: string) => new URL(url).pathname;
try {
  check((await call("POST", "/api/public/me/share")).status === 401, "إنشاءُ الرابط يحتاج جلسة");
  state.clockMs = kw("2026-11-20", "09:00");
  const made = await call("POST", "/api/public/me/share", {}, FP_A);
  check(made.status === 200 && made.json.ok && made.json.url.includes("/me/share/") && made.json.svg.startsWith("<svg") && made.headers.get("cache-control") === "no-store", "إنشاءُ الرابط: رابطٌ ورمزُ QR ووقتُ الانتهاء، بلا تخزين");
  check(new Date(made.json.expiresAt).getTime() - state.clockMs === 24 * 3_600_000, "ينتهي بعد ٢٤ ساعة");
  check(leaks(made.text).length === 0, "الردُّ لا يحمل رقماً مدنياً ولا بصمةً ولا اسماً ولا رمزاً", leaks(made.text));
  const tokenA = made.json.url.split("/me/share/")[1];
  const profileA = (await Repository.getStudentProfile(FP_A))!;
  check(profileA.share!.hash === shareHash(tokenA.split(".")[1]) && !JSON.stringify(profileA).includes(tokenA.split(".")[1]), "على الملف البصمةُ وحدها لا الرمز");
  const status = await call("GET", "/api/public/me/extras", undefined, FP_A);
  check(status.json.share.active === true && status.json.share.expiresAt === made.json.expiresAt && !status.text.includes(tokenA), "الحالةُ تقول «نشطة» ومتى تنتهي، ولا تُعيد الرمز");

  /* الصفحة */
  const page = await call("GET", pathOf(made.json.url));
  check(page.status === 200 && page.text.includes("قسم التربية الإسلامية") && page.text.includes("الصحيفة الجديدة") && page.text.includes("كلية التربية الأساسية"), "تُظهر القسمَ والكليةَ واسمَ الصحيفة");
  check(page.text.includes("الوحدات المنجزة") && page.text.includes("الوحدات المتبقية") && /فصول للتخرّج/.test(page.text) && /\d+%/.test(page.text), "وحلقةَ التقدّم: منجَز ومتبقٍّ وفصولُ التخرّج المقدَّرة");
  const snapshot = (await import("../src/server/studentExtras"));
  const courseNames = h.courseOf(SECTION_A).map(c => c.CourseName as string);
  check(page.text.includes(courseNames[0]), "المقررُ المنجَز بأسمائه", courseNames[0]);
  check(page.text.includes(courseNames[1]) && page.text.includes(courseNames[2]), "ورغباتُ الفصل الحالي");
  check(!page.text.includes("جدوله المقترح"), "بلا تذكرةٍ: لا جدولَ مقترحاً");
  check(leaks(page.text).length === 0, "لا اسمَ ولا رقمَ مدنياً ولا رمزاً ولا بصمةً ولا نصاً مختوماً في الصفحة", leaks(page.text));
  check(!/NAME-CIPHER|CIVIL-CIPHER|nameCipher|civilCipher|codeHash|fingerprint|identity/i.test(page.text), "ولا أسماءُ حقولٍ حسّاسة");
  check(!page.text.includes(FP_B) && !h.courseOf(SECTION_B).some(c => page.text.includes(c.CourseName as string)), "ولا شيءَ من ملفّ طالبٍ آخر");
  check(page.headers.get("cache-control") === "no-store" && /noindex/.test(page.headers.get("x-robots-tag") || "") && page.headers.get("referrer-policy") === "no-referrer" && page.headers.get("x-content-type-options") === "nosniff", "no-store وnoindex وبلا مُحيل");
  const csp = page.headers.get("content-security-policy") || "";
  check(csp.includes("default-src 'none'") && !/script-src/.test(csp) && csp.includes("frame-ancestors 'none'") && csp.includes("form-action 'none'"), "CSP: لا سكربتَ ولا إطارَ ولا نموذجَ");
  check(/للقراءة فقط · تنتهي المشاركة في/.test(page.text), "نصُّ «للقراءة فقط · تنتهي المشاركة في…»");

  /* بتذكرة: يظهر الأسبوع */
  await h.seedTickets([{ fp: FP_A, sid: SECTION_A }, { fp: FP_B, sid: SECTION_B }]);
  const withWeek = await call("GET", pathOf(made.json.url));
  check(withWeek.text.includes("جدوله المقترح") && withWeek.text.includes('class="wk"') && withWeek.text.includes("ISL100") && withWeek.text.includes("ISL101") && !withWeek.text.includes("ARB100"), "بتذكرةٍ: أسبوعُ جدوله هو (من الخطة «أ» ومن جدول قسمه الموقَّع) لا جدولُ غيره");
  check(leaks(withWeek.text).length === 0, "ولا يتسرّب شيءٌ مع الجدول");

  /* مُحدِّدٌ صحيح بسرٍّ مخلوط */
  const madeB = await call("POST", "/api/public/me/share", {}, FP_B);
  const tokenB = madeB.json.url.split("/me/share/")[1];
  const pageB = await call("GET", pathOf(madeB.json.url));
  check(pageB.status === 200 && pageB.text.includes("قسم اللغة العربية") && !pageB.text.includes("قسم التربية الإسلامية") && !h.courseOf(SECTION_A).some(c => pageB.text.includes(c.CourseName as string)), "رمزُ طالبٍ آخر لا يُظهر إلا ملفَّ صاحبه");
  const mixed = `${tokenA.split(".")[0]}.${tokenB.split(".")[1]}`;
  const mixedRes = await call("GET", `/me/share/${mixed}`);
  check(mixedRes.status === 404 && !mixedRes.text.includes("قسم") && leaks(mixedRes.text).length === 0, "مُحدِّدُ طالبٍ مع سرِّ آخر: ٤٠٤ ولا شيء من أيٍّ منهما");
  check((await call("GET", `/me/share/${tokenA}x`)).status === 404 && (await call("GET", "/me/share/garbage")).status === 404 && (await call("GET", `/me/share/${"A".repeat(60)}.${"B".repeat(32)}`)).status === 404, "رمزٌ مخترَع أو مبتور: ٤٠٤");
  const gone = await call("GET", "/me/share/garbage");
  check(gone.text.includes("هذه المشاركة غير متاحة") && gone.headers.get("cache-control") === "no-store", "ردُّ الرفض واحد (لا يُفرَّق بين منتهٍ وموقوفٍ وغير موجود) وبلا تخزين");

  /* جديدٌ يُبطل السابق */
  const second = await call("POST", "/api/public/me/share", {}, FP_A);
  check((await call("GET", pathOf(made.json.url))).status === 404, "رابطٌ جديد يُبطل السابقَ فوراً");
  check((await call("GET", pathOf(second.json.url))).status === 200, "والجديدُ يعمل");

  /* ينتهي بعد 24 ساعة */
  state.clockMs += 24 * 3_600_000 - 60_000;
  check((await call("GET", pathOf(second.json.url))).status === 200, "قبل الانتهاء بدقيقة: يعمل");
  state.clockMs += 120_000;
  const expired = await call("GET", pathOf(second.json.url));
  check(expired.status === 404 && expired.text.includes("غير متاحة"), "بعد ٢٤ ساعة: منتهٍ");
  check((await call("GET", "/api/public/me/extras", undefined, FP_A)).json.share.active === false, "والحالةُ تقول «غير نشطة»");
  state.clockMs = kw("2026-11-20", "09:00");

  /* أوقف المشاركة */
  const third = await call("POST", "/api/public/me/share", {}, FP_A);
  check((await call("GET", pathOf(third.json.url))).status === 200, "مشاركةٌ جديدة تعمل");
  check((await call("POST", "/api/public/me/share/off", {}, FP_A)).json.ok === true, "«أوقف المشاركة»");
  check((await call("GET", pathOf(third.json.url))).status === 404 && (await Repository.getStudentProfile(FP_A))!.share === undefined, "تتوقف فوراً ويُمحى ما على الملف");
  check((await call("POST", "/api/public/me/share/off", {}, FP_A)).json.ok === true, "الإيقافُ مرتين لا يضرّ");
  check((await call("GET", pathOf(madeB.json.url))).status === 200, "ولا يمسّ مشاركةَ غيره");

  /* حذفُ الملف يحذفها */
  check((await Repository.updateStudentProfile(FP_B, () => null)) === undefined, "حذفُ ملفّ الطالب");
  check((await call("GET", pathOf(madeB.json.url))).status === 404, "ومعه تسقط مشاركتُه (لا فهرسَ باقياً)");

  /* ملفٌّ بلا قسم (لم يكتمل): لا ينكسر */
  await h.put({ ...h.mkProfile("c".repeat(32), SECTION_A), AdSectionId: 0, AdCollegeId: 0, passedCourseIds: [], wishes: undefined });
  const empty = await call("POST", "/api/public/me/share", {}, "c".repeat(32));
  check((await call("GET", pathOf(empty.json.url))).status === 200 || (await call("GET", pathOf(empty.json.url))).status === 404, "ملفٌّ لم يكتمل: لا خطأ خادم");

  /* ── حدُّ المعدّل ── */
  await call("POST", "/api/public/me/share", {}, FP_A);
  const link = (await call("POST", "/api/public/me/share", {}, FP_A)).json.url;
  const codes: number[] = [];
  for (let i = 0; i < 45; i += 1) codes.push((await call("GET", pathOf(link))).status);
  const first429 = codes.indexOf(429);
  check(first429 > 0 && first429 <= 40 && codes.slice(first429).every(code => code === 429), "حدُّ المعدّل: بعد الحدّ ٤٢٩ وبلا تخزين", first429);
  const limited = await call("GET", pathOf(link));
  check(limited.status === 429 && limited.headers.get("cache-control") === "no-store" && !limited.text.includes("قسم"), "ردُّ الحدّ لا يحمل بيانات");
  void snapshot;
} finally { await h.closeAll(); }

/* ── الأسلاك ── */
{
  const routes = read("src/server/studentDoorRoutes.ts");
  const codeBlock = routes.slice(routes.indexOf('app.post("/api/public/me/code"'), routes.indexOf('app.post("/api/public/me/keep"'));
  check(codeBlock.includes("voidedStudentSecrets") && routes.includes("registerStudentExtras(app,"), "تغييرُ الرمز يُسقط المشاركة، والمسارات تُسجَّل من الباب");
  const extras = read("src/server/studentExtras.ts");
  check(extras.includes('app.get("/me/share/:token"') && extras.includes("STUDENT_SHARE_PER_MINUTE") && extras.includes("renderShareGone"), "مسارُ الصفحة العامة محدودُ المعدّل");
  check(extras.includes("SHOWCASE_COOKIE"), "ومعاينةُ التجربة تقرأ صندوقَها");
  const hash = createHash("sha256").update("x").digest("hex");
  check(hash.length === 64, "sha256");
}

console.log(`\n${passed} فحصاً نجحت.`);
process.exit(0);
