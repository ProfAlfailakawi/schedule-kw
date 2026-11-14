/**
 * «مساري»: سهولةُ الاستعمال واللمس والمفردات — دوالُّ الصفحة النقية تُشغَّل في vm (بلا متصفح).
 *   U1 بحثٌ عربيٌّ متسامح.
 *   U2 منتقي الوحدات: ثلاثةُ أهدافٍ ثابتة عند أيّ سقف (٣…٣٠)، كلٌّ ٤٤px فأكثر.
 *   U3 «رغباتي» قائمةٌ واحدة: الضمّ يضمّ، والاستبدالُ يسأل أولاً.
 *   U4 انتهاءُ الجلسة: أيُّ ‎401 signed-out‎ من ‎/api/public/me/*‎ حالةٌ واحدة، وما كُتب يُحفظ لصاحبه وحده.
 *   U5 التخصصات: الفشلُ لا يُخزَّن فارغاً، والرجوعُ من المسار يعمل.
 *   U6 تغييرُ الرمز: مرتان، وعين، وعمرُ الجلسة نفسه.
 *   U7 اللمسُ ٤٤px والخطُّ ١٢px.
 *   U8 مفرداتُ الطالب: لا رادار ولا تذكرة ولا محاكاة ولا لغةُ الأقسام، وأرقامٌ لاتينية.
 */
import fs from "node:fs";
import { runInNewContext } from "node:vm";
import { STUDENT_HOME_SCRIPT, STUDENT_HOME_CSS } from "../src/server/studentHomePage";
import { STUDENT_MAP_SCRIPT } from "../src/server/studentMapUi";
import { MASARI_ACK_CSS } from "../src/server/masariDisclaimer";
import { buildStudentNotices } from "../src/utils/studentNotices";
import { countOf, AR } from "../src/utils/arabicCount";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const fn = (name: string) => {
  const begin = STUDENT_HOME_SCRIPT.indexOf("function " + name + "(");
  if (begin < 0) throw new Error("missing " + name);
  const next = STUDENT_HOME_SCRIPT.indexOf("\nfunction ", begin + 1);
  return STUDENT_HOME_SCRIPT.slice(begin, next < 0 ? undefined : next);
};
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
const base = () => ({ countOf, AR, esc, ic: (n: string) => `<i data-i="${n}"></i>`, toast: () => {}, closeSheet: () => {} });

/* U1 */
{
  const ctx: any = {};
  runInNewContext(fn("arNorm") + ";this.n=arNorm;", ctx);
  check(ctx.n("الإرشاد النفسيّ") === ctx.n("الارشاد النفسي") && ctx.n("رياض الأطفال") === ctx.n("رياض الاطفال"), "U1 الهمزات والتشكيل لا تُفشل المطابقة");
  check(ctx.n("التربية") === ctx.n("التربيه") && ctx.n("مستوى") === ctx.n("مستوي") && ctx.n("تـربـية") === ctx.n("تربية") && ctx.n("آداب") === ctx.n("اداب"), "U1 التاء المربوطة والألف المقصورة والتطويل والمدّ");
  check(/arNorm\(s\.name\)\.indexOf\(t\)/.test(STUDENT_HOME_SCRIPT) && /arNorm\(c\.name\+" "\+c\.code\)/.test(STUDENT_HOME_SCRIPT), "U1 تُطبَّق على الجانبين في بحث التخصص وبحث المقررات");
}

/* U2 */
{
  for (const [lo, hi] of [[12, 15], [12, 21], [3, 30], [12, 12]]) {
    const ctx: any = { ...base(), lim: (k: string) => (k === "wishUnitsMin" ? lo : hi) };
    runInNewContext(fn("unitPicker") + ";this.u=unitPicker;", ctx);
    const html: string = ctx.u("wu", 99, false);
    const buttons = (html.match(/<button/g) || []).length, ranges = (html.match(/type="range"/g) || []).length;
    check(buttons === 2 && ranges === 1 && html.includes(`min="${lo}"`) && html.includes(`max="${hi}"`) && html.includes(`value="${hi}"`), `U2 سقف ${hi}: زرّان ومسطرةٌ واحدة لا ${hi - lo + 1} زرّاً، والقيمةُ مقصوصةٌ إلى الحدّ`);
  }
  const rule = (sel: string) => (STUDENT_HOME_CSS.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}")) || [])[1] || "";
  check(/inline-size:56px/.test(rule(".up-b")) && /block-size:56px/.test(rule(".up-b")) && /block-size:44px/.test(rule(".up-r")) && /block-size:48px/.test(rule(".up.sm .up-b")), "U2 أهدافُ المنتقي ٥٦/٤٨px والمسطرة ٤٤px");
  check(!/class="seg fit"[^']*data-n=/.test(STUDENT_HOME_SCRIPT) && /unitPicker\("wu"/.test(STUDENT_HOME_SCRIPT) && /unitPicker\("wiu"/.test(STUDENT_HOME_SCRIPT), "U2 الرغبات و«ماذا لو؟» على المنتقي نفسه، لا صفّ أزرارٍ يضيق");
  check(/e\.target\.closest\("\.up"\)/.test(STUDENT_HOME_SCRIPT), "U2 سحبُ المسطرة لا يقلّب شرائح الرغبات");
}

/* U3 */
{
  const make = (saved: number[] | null) => {
    const calls: any[] = [], sheets: string[] = [], done: any[] = [];
    const ctx: any = {
      ...base(), KM: undefined,
      S: { state: { term: { id: 7 }, profile: { wishes: saved ? { termId: 7, targetUnits: 14, courseIds: saved, constraints: { freeDay: true } } : null } }, offered: { courses: [{ id: 1, name: "أ" }, { id: 2, name: "ب" }, { id: 3, name: "ج" }] } },
      fitUnits: (u: number) => Math.max(12, Math.min(15, Math.round(Number(u)) || 15)),
      api: (method: string, url: string, body: any) => { calls.push({ method, url, body }); return { then: (f: any) => f({ ok: true, status: 200, d: { wishes: { ...body, termId: 7 } } }) }; },
      sheet: (h: string) => { sheets.push(h); },
      wishesSaved: (w: any) => done.push(w),
      document: { getElementById: () => ({ addEventListener: () => {} }) },
    };
    runInNewContext([fn("curWishes"), fn("wishName"), fn("saveWishCourses"), "this.save=saveWishCourses;"].join("\n"), ctx);
    return { ctx, calls, sheets, done };
  };
  const m = make([1]); m.ctx.save([2, 3], { mode: "merge" });
  check(m.calls.length === 1 && m.calls[0].body.courseIds.join() === "1,2,3" && m.calls[0].body.targetUnits === 14 && m.calls[0].body.constraints.freeDay === true, "U3 «أضف إلى رغباتي» يضمّ إلى القائمة ويبقي وحداتها وقيودها", m.calls);
  const r = make([1, 2]); r.ctx.save([2, 3], { mode: "set" });
  check(r.calls.length === 0 && r.sheets.length === 1 && /سيُزال من رغباتك/.test(r.sheets[0]) && r.sheets[0].includes("«أ»"), "U3 ما يُزيل من القائمة يسمّيه ويسأل قبل أي كتابة", r.sheets);
  const n = make(null); n.ctx.save([1, 2], { mode: "set", units: 13 });
  check(n.calls.length === 1 && n.sheets.length === 0 && n.calls[0].body.targetUnits === 13, "U3 قائمةٌ فارغة: يُحفظ مباشرة بوحدات المقترح");
  const big = make([1]); big.ctx.save(Array.from({ length: 12 }, (_, i) => i + 10), { mode: "merge" });
  check(big.calls.length === 0, "U3 فوق ١٢ مقرراً: لا كتابة (يُطلب حذفُ بعضها)");
  check(/saveWishCourses\(kmCartIds\(\),\{mode:"set"/.test(STUDENT_MAP_SCRIPT) && /saveWishCourses\(a\.picks\.map[^;]*mode:"merge"/.test(STUDENT_HOME_SCRIPT) && /function tkSaveWishes\(cur,btn\)\{saveWishCourses\(/.test(STUDENT_HOME_SCRIPT), "U3 المداخل الأربعة تمرّ بدالةٍ واحدة");
  const labels = (STUDENT_HOME_SCRIPT + STUDENT_MAP_SCRIPT).match(/(أضف إلى رغباتي|احفظ في رغباتي|اجعلها رغباتي|استخدمها في رغباتي|أضفها إلى رغباتي)/g) || [];
  check(!labels.some(l => /اجعلها|استخدمها|أضفها/.test(l)) && labels.length >= 3, "U3 التسميات: «أضف إلى رغباتي» للضمّ و«احفظ في رغباتي» للتحرير فقط", labels);
  check(/KM\.cart=\{\};\(w&&w\.courseIds\|\|\[\]\)\.forEach/.test(STUDENT_HOME_SCRIPT), "U3 بعد الحفظ تتبع سلّةُ «خطتي» القائمةَ");
}

/* U4 */
{
  const hits: string[] = [];
  const respond = (status: number, body: any) => Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(JSON.stringify(body)) });
  let next: any = null;
  const ctx: any = { fetch: () => next, setTimeout, clearTimeout, AbortController, Promise, sessionExpired: () => hits.push("x") };
  runInNewContext(fn("api").replace(/^function api/, "var API_TIMEOUT_MS=15000,API_WRITE_DEADLINE_MS=30000;function api") + ";this.api=api;", ctx);
  const run = async () => {
    next = respond(401, { code: "signed-out" }); await ctx.api("PUT", "/api/public/me/wishes", {});
    next = respond(401, { code: "signed-out" }); await ctx.api("GET", "/api/public/me/cases");
    next = respond(401, { code: "bad-code" }); await ctx.api("POST", "/api/public/me/enter", {});
    next = respond(401, { code: "bad-code" }); await ctx.api("POST", "/api/public/me/code", {});
    next = respond(500, {}); await ctx.api("GET", "/api/public/me/notices");
  };
  await run();
  check(hits.length === 2, "U4 انتهاءُ الجلسة في قراءةٍ أو كتابة ← حالةٌ واحدة؛ والرمزُ الخاطئ لا يُعدّ انتهاءً", hits);

  const sctx: any = {
    fitUnits: () => 15, KM: { ready: false },
    S: { view: "home", state: { term: { id: 7 }, profile: { createdAt: "2026-01-01", sectionId: 3, wishes: { termId: 7, targetUnits: 15, courseIds: [1], constraints: {} } } }, wDraft: { targetUnits: 13, courseIds: [1, 2], constraints: {} }, wStep: 2 },
  };
  runInNewContext([fn("curWishes"), fn("normW"), fn("rescueOwner"), fn("rescueSave"), fn("rescueTake"), "this.save=rescueSave;this.take=rescueTake;"].join("\n"), sctx);
  check(sctx.save() === true && sctx.S.rescue.wish.step === 2 && sctx.S.rescue.wish.draft.targetUnits === 13, "U4 مسودةُ الرغبات المعدَّلة تُمسَك بشريحتها (في ذاكرة الصفحة)", sctx.S.rescue);
  sctx.S.state.profile.createdAt = "2026-05-05";
  check(sctx.take() === null && sctx.S.rescue === null, "U4 ملفٌّ آخر على الجهاز: لا يُعاد له شيء ويُمحى الممسوك");
  sctx.S.state.profile.createdAt = "2026-01-01"; sctx.S.wDraft = { targetUnits: 12, courseIds: [], constraints: {} }; sctx.save();
  check(sctx.take()?.wish?.draft.targetUnits === 12, "U4 صاحبُ الملف نفسه يستعيده");
  sctx.S.state.profile.createdAt = "2026-01-01"; sctx.S.wDraft = { targetUnits: 15, courseIds: [1], constraints: {} };
  check(sctx.save() === false, "U4 مسودةٌ لم تتغيّر: لا شيء يُحفظ ولا يُقال «أعدنا»");
  check(/if\(v==="expired"\)return viewExpired\(\)/.test(STUDENT_HOME_SCRIPT) && /انتهت جلستك/.test(STUDENT_HOME_SCRIPT) && !/S\.state\.signedIn=false;setView\("gate"\)\}return\}/.test(STUDENT_HOME_SCRIPT + STUDENT_MAP_SCRIPT), "U4 لا معالجةَ ‎401‎ متفرقة: الحالةُ الواحدة وحدها");
  check(/function quietFail\(/.test(STUDENT_HOME_SCRIPT) && ["ما الجديد؟", "حالاتي", "جدولي المقترح", "خطتي", "طلب للقسم"].every(t => STUDENT_HOME_SCRIPT.includes(`quietFail(host,"${t}"`)), "U4 بطاقاتُ الرئيسية الفاشلة سطرٌ هادئ بزرّ إعادة لا اختفاء");
}

/* U5 */
{
  const ctx: any = { S: { track: "boys", catalog: null, catalogErr: "" }, encodeURIComponent };
  ctx.api = () => ({ then: (f: any) => f({ ok: false, status: 0, d: { error: "تعذّر الاتصال" } }) });
  runInNewContext(fn("ensureCatalog") + ";this.e=ensureCatalog;", ctx);
  let called = 0; ctx.e(() => called++);
  check(called === 1 && ctx.S.catalog === null && ctx.S.catalogErr === "تعذّر الاتصال", "U5 فشلُ التخصصات لا يُخزَّن فارغاً");
  ctx.api = () => ({ then: (f: any) => f({ ok: true, status: 200, d: { specializations: [{ id: 1, name: "أ" }] } }) }); ctx.e(() => called++);
  check(ctx.S.catalog.length === 1 && !ctx.S.catalogErr, "U5 الإعادةُ تحمّلها");
  check(/history\.pushState\(\{masari:"track"\}/.test(STUDENT_HOME_SCRIPT) && /window\.addEventListener\("popstate"/.test(STUDENT_HOME_SCRIPT) && /id="bktr"/.test(STUDENT_HOME_SCRIPT) && /id="catr"/.test(STUDENT_HOME_SCRIPT), "U5 الرجوعُ من المسار بزرٍّ وبزرّ المتصفح، وزرُّ إعادةٍ للتخصصات");
}

/* U6 */
{
  const sheet = fn("sheetCode");
  check(/otp\("o3"/.test(sheet) && /eyeBtn\("keye"\)/.test(sheet) && /الرمزان الجديدان غير متطابقين/.test(sheet) && /b===c&&a!==b/.test(sheet), "U6 الرمزُ الجديد مرتين، وعين، وعدمُ التطابق في مكانه");
  check(/remember:keep/.test(sheet) && /S\.state\.session&&S\.state\.session\.remember/.test(sheet) && !/remember:S\.remember/.test(sheet), "U6 عمرُ الجلسة الجديدة من الجلسة الجارية لا من متغيّرٍ يضيع بالتحديث");
  const routes = fs.readFileSync("src/server/studentDoorRoutes.ts", "utf8");
  check(/session: session \? \{ remember: session\.exp - Date\.now\(\) > SESSION_HOURS \* 3_600_000 \} : null/.test(routes), "U6 الخادمُ يقول في state هل الجلسة «هذا جهازي»");
}

/* U7 */
{
  const css = STUDENT_HOME_CSS + MASARI_ACK_CSS;
  const px = (re: RegExp) => Number((css.match(re) || [])[1] || 0);
  check(px(/\.chp\{min-block-size:(\d+)px/) >= 44 && px(/\.rp \.why button\{min-block-size:(\d+)px/) >= 44 && px(/\.seg\.sm2 button\{min-block-size:(\d+)px/) >= 44, "U7 الشعب البديلة وأسباب التعثر و«أسبوعي/قائمة» ٤٤px");
  check(px(/\.kc-add\{[^}]*inline-size:(\d+)px/) >= 44 && px(/\.km-f\{[^}]*min-block-size:(\d+)px/) >= 44 && px(/\.ks\{[^}]*block-size:(\d+)px/) >= 44 && px(/\.kd-x\{[^}]*inline-size:(\d+)px/) >= 44 && px(/\.kdot\{[^}]*block-size:(\d+)px/) >= 44, "U7 أزرارُ «خطتي» (إضافة، تصفية، سلاسل، إغلاق، أقراص) ٤٤px");
  const small = [...css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1])).filter(n => n < 12);
  check(!/\.mack-step small\{[^}]*font-size:1[01]/.test(css) && small.every(n => n === 11), "U7 لا خطَّ تحت ١٢px إلا شبكةُ الأسبوع (١١px)", small);
}

/* U8 */
{
  const studentText = (src: string) => [...src.matchAll(/["'«]([^"'«»]*[؀-ۿ][^"'«»]*)["'»]/g)].map(m => m[1]).join(" | ");
  const page = studentText(STUDENT_HOME_SCRIPT + STUDENT_MAP_SCRIPT);
  check(!/رادار|تذكرت|المحاكاة|صاحب القرار|صاحبُ القرار|تُدخل جداولها|مُجمَّد|داخل SCHEDULE/.test(page), "U8 الصفحة بلا رادار ولا تذكرة ولا محاكاة ولا لغة الأقسام");
  const manifest = JSON.parse(fs.readFileSync("public/me.webmanifest", "utf8"));
  check(!/تذكرت|المتوقع/.test(manifest.name + manifest.description) && /رغباتي/.test(manifest.description) && /جدولي المقترح/.test(manifest.description) && /خطتي/.test(manifest.description), "U8 manifest بالمفردات الثلاث");
  const notices = buildStudentNotices({ setupDone: true, phase: { mode: "report", canEditWishes: false, canReport: true, line: "" }, hasWishes: true, ticket: { stale: false, window: 1, of: 2, windowName: "مبكر", start: "1 نوفمبر", end: "7 نوفمبر" }, reportAnswered: false, reportCourses: 0, cases: [], opened: [{ courseId: 4, name: "تفسير", section: "02", wished: true }, { courseId: 5, name: "فقه", section: "", wished: false }] });
  const all = notices.map(n => n.title + " " + (n.detail || "")).join(" | ");
  check(!/تذكرت|صاحب|→/.test(all) && /1 نوفمبر إلى 7 نوفمبر/.test(all), "U8 «ما الجديد؟» بلا تذكرة ولا سهمٍ معكوس بين تاريخين", all);
  check(notices.some(n => n.id === "opened:4" && n.title === "فُتحت شعبة في «تفسير» — كنتَ ممن طلبوه") && notices.some(n => n.id === "opened:5" && !/ممن طلبوه/.test(n.title)), "U8 «أغلق الحلقة»: من كان المقرر في رغباته يُقال له إنه ممن طلبوه، وغيرُه لا");
  check(!/ → /.test(STUDENT_HOME_SCRIPT) && /" إلى "\+fmtShort\(w\.end\)/.test(STUDENT_HOME_SCRIPT), "U8 بين تاريخين «إلى» لا سهم");
  const routes = fs.readFileSync("src/server/studentDoorRoutes.ts", "utf8");
  check(!/[٠-٩]/.test((routes.match(/fail\(res,[^;]*;/g) || []).join("")) && !/المحاكاة|داخل SCHEDULE/.test((routes.match(/fail\(res,[^;]*;|registered: "[^"]*"/g) || []).join("")), "U8 رسائلُ الخادم للطالب بأرقامٍ لاتينية وبلا محاكاة");
  check(/أنت أول من أرسل رغباته في قسمك/.test(STUDENT_HOME_SCRIPT) && !/أنت واحدٌ من/.test(STUDENT_HOME_SCRIPT), "U8 «أنت أول من أرسل» حين يكون واحداً");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
