/**
 * ── تدقيق الإدخال الصوتيّ ───────────────────────────────────────────────────
 *
 * السكربتُ يُجمَّع كما يصل إلى المتصفّح ويُشغَّل بمحرّك V8 فوق دوم مصغّرٍ وخدمة كلامٍ
 * مزيّفة وساعةٍ يتحكّم بها الاختبار. فتُفحص القواعدُ التي لا يجوز أن تنكسر: الزرّ لا
 * يُرسم بلا الواجهة، والنصُّ يُقصّ عند الحدّ، والأرقام لاتينية والأوقات HH:MM، والعدّادُ
 * ينتهي بالتوقّف وحده، وخطأُ الميكروفون يُترك الحقلَ للكتابة، ولا شيءَ يُرسَل.
 */
import fs from "fs";
import vm from "vm";
import { ARABIC_COUNT_SCRIPT } from "../src/utils/arabicCount";
import { VOICE_INPUT_CSS, VOICE_INPUT_JS, VOICE_INPUT_LIMIT, VOICE_INPUT_SECONDS } from "../src/server/voiceInputScript";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

/* ── دومٌ مصغّر: ما يلمسه السكربتُ وحده ─────────────────────────────────── */
function makeWorld(withApi: boolean) {
  let now = 1_000_000;
  const timers: Array<{ fn: () => void; every: number; at: number; id: number }> = [];
  let timerId = 0;
  const recs: any[] = [];
  const attrs = (init: Record<string, string>) => {
    const a: Record<string, string> = { ...init };
    return { get: (k: string) => (k in a ? a[k] : null), set: (k: string, v: string) => { a[k] = v; } };
  };
  const mk = (tag: string, init: Record<string, string> = {}) => {
    const a = attrs(init);
    const el: any = {
      tag, value: "", onclick: null as null | (() => void), children: [] as any[], text: "", style: {},
      getAttribute: (k: string) => a.get(k), setAttribute: (k: string, v: string) => a.set(k, v),
      classList: { on: false, toggle(_: string, on: boolean) { this.on = on; } },
      querySelector: (sel: string) => el.children.find((c: any) => sel === "[data-vi-sec]" ? c.tag === "sec" : sel === ".vi-arc" ? c.tag === "arc" : sel === "[data-vi-msg]" ? c.tag === "msg" : sel === "[data-vi-count]" ? c.tag === "count" : false) || null,
    };
    Object.defineProperty(el, "textContent", { get: () => el.text, set: (v: string) => { el.text = String(v); } });
    return el;
  };
  const field = mk("textarea", { "data-vi-field": "msg" });
  const box = mk("div", { "data-vi": "msg" });
  const msg = mk("msg"), count = mk("count"), sec = mk("sec"), arc = mk("arc");
  box.children = [count, msg];
  const btn = mk("button", { "data-mic": "msg" });
  btn.children = [sec, arc];
  const nodes: Record<string, any[]> = { "[data-mic]": [btn], "[data-vi-field]": [field] };
  const listeners: Record<string, Array<(e: any) => void>> = {};
  const document: any = {
    visibilityState: "visible",
    querySelectorAll: (sel: string) => ({ forEach: (fn: (e: any) => void) => (nodes[sel] || []).forEach(fn) }),
    querySelector: (sel: string) => sel === '[data-vi-field="msg"]' ? field : sel === '[data-vi="msg"]' ? box : null,
    addEventListener: (type: string, fn: (e: any) => void) => { (listeners[type] ||= []).push(fn); },
  };
  class FakeRec {
    lang = ""; interimResults = false; continuous = false; maxAlternatives = 0; started = 0; stopped = 0;
    onresult: any = null; onerror: any = null; onend: any = null;
    constructor() { recs.push(this); }
    start() { this.started++; }
    stop() { this.stopped++; }
  }
  const win: any = withApi ? { webkitSpeechRecognition: FakeRec } : {};
  const sandbox: any = {
    window: win, document, Date: { now: () => now }, String, Math, Array, Number, Object, RegExp,
    setInterval: (fn: () => void, every: number) => { const id = ++timerId; timers.push({ fn, every, at: now, id }); return id; },
    clearInterval: (id: number) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setTimeout: (fn: () => void, ms: number) => { const id = ++timerId; const due = now + ms; const t: any = { id, every: ms, at: now, fn: () => { if (now >= due) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); fn(); } } }; timers.push(t); return id; },
    fetch: () => { throw new Error("لا شبكةَ في الإملاء"); },
    XMLHttpRequest: function () { throw new Error("لا شبكةَ في الإملاء"); },
  };
  vm.runInNewContext(`${ARABIC_COUNT_SCRIPT}\n${VOICE_INPUT_JS}\nthis.VI=VI;this.viNormalize=viNormalize;this.viJoin=viJoin;`, sandbox, { timeout: 1000 });
  const advance = (ms: number) => { const step = 100; for (let t = 0; t < ms; t += step) { now += step; [...timers].forEach(x => x.fn()); } };
  const say = (rec: any, parts: Array<{ t: string; final: boolean }>) =>
    rec.onresult({ results: parts.map(p => Object.assign([{ transcript: p.t }], { isFinal: p.final })) });
  return { sandbox, field, btn, box, msg, count, sec, arc, recs, advance, say, texts: [] as string[], listeners, document };
}

/* ── القاعدتان الخالصتان ────────────────────────────────────────────────── */
const world = makeWorld(true);
const { viNormalize, viJoin } = world.sandbox as { viNormalize: (t: string) => string; viJoin: (b: string, c: string, l: number) => string };
check(viNormalize("الساعة ٩:٣٠ صباحاً") === "الساعة 09:30 صباحاً", "الأرقام العربية تصير لاتينية والوقت HH:MM");
check(viNormalize("اجتماع ۱۰:۰۵") === "اجتماع 10:05", "والفارسية كذلك");
check(viNormalize("من 8:00 إلى 9 : 30") === "من 08:00 إلى 09:30", "وفراغٌ حول النقطتين لا يمنع التوحيد");
check(viNormalize("الساعة 25:99") === "الساعة 25:99", "ما ليس ساعةً من اليوم يبقى كما قيل");
check(viNormalize("نسبة 1.5 فقط") === "نسبة 1.5 فقط", "ولا يُمسّ عددٌ عشريّ");
check(viNormalize("  كثير   من   الفراغ ") === "كثير من الفراغ", "الفراغاتُ المتكرّرة تُطوى");
check(viJoin("مرحباً", "٩:٣٠", 400) === "مرحباً 09:30", "الضمُّ إلى ما كُتب بيدٍ يضع فراغاً واحداً");
check(viJoin("سبق ", "نص", 400) === "سبق نص", "ولا يكرّره حين ينتهي بفراغ");
check(viJoin("", "نص", 400) === "نص", "وفي حقلٍ فارغٍ لا فراغ في أوله");
check(viJoin("أ".repeat(390), "ب".repeat(50), VOICE_INPUT_LIMIT).length === VOICE_INPUT_LIMIT, "النصُّ يُقصّ عند أربعمئة حرف");
check(VOICE_INPUT_LIMIT === 400 && VOICE_INPUT_SECONDS === 30, "الحدّان: أربعمئة حرف وثلاثون ثانية");

/* ── بلا الواجهة: لا زرَّ إطلاقاً ───────────────────────────────────────── */
const plain = makeWorld(false);
check(plain.sandbox.VI.html("msg") === "" && plain.sandbox.VI.ok() === false, "متصفّحٌ بلا خدمة كلام لا يُرسم له زرٌّ ولا زرٌّ معطَّل");
check(world.sandbox.VI.html("msg").includes('data-mic="msg"') && /لا يُحفظ الصوت/.test(world.sandbox.VI.html("msg")), "ومع الواجهة يُرسم الزرّ وتحته سطرُ «لا يُحفظ الصوت»");

/* ── مجرى الإملاء ───────────────────────────────────────────────────────── */
const w = makeWorld(true);
const typed: Array<[string, string]> = [];
w.sandbox.VI.wire((k: string, v: string) => typed.push([k, v]));
w.field.value = "بدأتُ بيدي";
check(w.recs.length === 0, "لا إذنَ ولا خدمةَ قبل الضغط: لا يبدأ شيءٌ عند فتح الصفحة");
w.btn.onclick();
const rec = w.recs[0];
check(w.recs.length === 1 && rec.started === 1, "الضغطةُ الأولى تبدأ الإملاء");
check(rec.lang === "ar" && rec.interimResults === true, "بالعربية وبنصٍّ مؤقّتٍ يتكوّن أمام العين");
w.say(rec, [{ t: "الساعة ٩:٣٠", final: false }]);
check(w.field.value === "بدأتُ بيدي الساعة 09:30", "النصُّ المؤقّت يظهر في الحقل مُطبَّعاً", w.field.value);
w.say(rec, [{ t: "الساعة ٩:٣٠ مناسبة", final: true }, { t: " لي ", final: false }]);
check(w.field.value === "بدأتُ بيدي الساعة 09:30 مناسبة لي", "والمستقرّ مع المؤقّت يُضمّان", w.field.value);
check(typed.some(([k, v]) => k === "msg" && v === w.field.value), "ويُبلَّغ الحقلُ المرتبط (حالة الصفحة) بكل تغيّر");
check(w.btn.getAttribute("aria-pressed") === "true" && /30/.test(w.btn.getAttribute("aria-label")), "الزرّ يعلن أنه يسجّل وكم تبقّى", w.btn.getAttribute("aria-label"));
check(w.sec.text === "30", "والرقمُ في منتصف الحلقة ثلاثون");
w.advance(10_000);
check(w.sec.text === "20" && Math.abs(Number(w.arc.style.strokeDashoffset) - (100 - (20 / 30) * 100)) < 1, "وبعد عشر ثوانٍ عشرون والحلقةُ تفرغ بنسبتها", [w.sec.text, w.arc.style.strokeDashoffset]);
w.advance(20_500);
check(w.sandbox.VI.active === null && rec.stopped >= 1, "عند الصفر يتوقّف التسجيلُ وحده");
check(w.field.value === "بدأتُ بيدي الساعة 09:30 مناسبة" || w.field.value.startsWith("بدأتُ بيدي الساعة 09:30 مناسبة"), "وما لم يُحسم من الكلام لا يُثبَّت", w.field.value);
check(w.btn.getAttribute("aria-pressed") === "false" && w.sec.text === "", "ويعود الزرّ إلى حاله");

/* ── الآيفون: كلامٌ مؤقّتٌ كلُّه، وإيقافٌ باليد، ثم إملاءٌ ثانٍ ─────────────── */
{
  const i = makeWorld(true);
  i.sandbox.VI.wire(() => {});
  i.field.value = "";
  i.btn.onclick();
  const first = i.recs[0];
  i.say(first, [{ t: "أرغب بالصباح", final: false }]);
  i.btn.onclick(); // إيقافٌ باليد قبل أن يُحسم شيء
  check(i.field.value === "أرغب بالصباح", "الإيقافُ باليد لا يمحو ما ظهر (المؤقّتُ يُثبَّت)", i.field.value);
  i.btn.onclick(); // ضغطةٌ ثالثة والتسجيلُ الأول لم يُغلق بعد
  check(i.recs.length === 1, "ولا يبدأ تسجيلٌ جديد قبل أن يُغلق المتصفّحُ السابق");
  first.onend && first.onend();
  const second = i.recs[1];
  check(Boolean(second) && second.started === 1, "فإذا أُغلق بدأ الإملاءُ الثاني وحده");
  i.say(second, [{ t: "ويوم الأحد", final: false }]);
  check(i.field.value === "أرغب بالصباح ويوم الأحد", "والثاني يُضاف إلى الأول ولا يمحوه", i.field.value);
  i.btn.onclick();
  check(i.field.value === "أرغب بالصباح ويوم الأحد", "وإيقافُ الثاني يُبقي النصّ كله", i.field.value);
  /* وإن لم يُبلغ المتصفّحُ بالإغلاق أبداً لا يُحبس الزرّ: يُفتح بعد مهلة. */
  i.btn.onclick();
  i.advance(1500);
  check(i.recs.length === 3 && i.recs[2].started === 1, "وإن تأخّر إغلاقُ المتصفّح يبدأ الجديدُ بعد مهلةٍ قصيرة");
}

/* ضغطةٌ ثانية أثناء الإملاء توقفه */
const t2 = makeWorld(true); t2.sandbox.VI.wire();
t2.btn.onclick(); t2.btn.onclick();
check(t2.sandbox.VI.active === null && t2.recs[0].stopped >= 1, "الضغطةُ الثانية تُوقف الإملاء");

/* الحدّ: لا يتجاوز الحقلُ أربعمئة حرف مهما طال الكلام */
const t3 = makeWorld(true); t3.sandbox.VI.wire();
t3.btn.onclick(); t3.say(t3.recs[0], [{ t: "كلمة ".repeat(200), final: true }]);
check(t3.field.value.length <= 400, "طولُ الحقل بعد كلامٍ طويل لا يتجاوز الحدّ", t3.field.value.length);
check(/\/ 400$/.test(t3.count.text), "والعدّاد يقول كم كُتب من أربعمئة", t3.count.text);

/* الأخطاء: جملةٌ قصيرة ويبقى الحقلُ للكتابة */
for (const [code, expect] of [["not-allowed", /لم يُسمح للميكروفون/], ["no-speech", /لم نسمع/], ["audio-capture", /لا يوجد ميكروفون/], ["network", /تعذّر الاتصال بخدمة الكلام/]] as const) {
  const e = makeWorld(true); e.sandbox.VI.wire(); e.field.value = "نصّي";
  e.btn.onclick(); e.recs[0].onerror({ error: code });
  check(expect.test(e.msg.text) && e.sandbox.VI.active === null && e.field.value === "نصّي", `خطأ ${code}: جملةٌ قصيرة والحقلُ كما هو`, e.msg.text);
}
const aborted = makeWorld(true); aborted.sandbox.VI.wire(); aborted.btn.onclick(); aborted.recs[0].onerror({ error: "aborted" });
check(aborted.sandbox.VI.active !== null, "إلغاءٌ نفّذناه نحن ليس خطأً يُقال");

/* انتهاءٌ مبكّر بصمتٍ: يُستأنف بحدٍّ ولا يدور بلا نهاية */
const gap = makeWorld(true); gap.sandbox.VI.wire(); gap.btn.onclick();
for (let i = 0; i < 6; i++) gap.recs[gap.recs.length - 1].onend?.();
check(gap.recs[0].started + (gap.recs.length - 1) <= 4 || gap.sandbox.VI.restarts <= 3, "الاستئنافُ بعد صمتٍ محدودٌ بثلاث مرّات", gap.sandbox.VI.restarts);

/* ما لا يجوز: لا شبكة ولا تخزين في سكربت الإملاء */
check(!/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|MediaRecorder|getUserMedia/.test(VOICE_INPUT_JS), "السكربتُ لا يرسل ولا يخزّن ولا يسجّل صوتاً: لا شبكةَ ولا تخزينَ ولا MediaRecorder");

/* ── في الصفحة ──────────────────────────────────────────────────────────── */
const server = fs.readFileSync("server.ts", "utf8");
const page = server.slice(server.indexOf("function instructorRequestPage"), server.indexOf('app.get("/r/:token"'));
check(/\$\{VOICE_INPUT_JS\}/.test(page) && /\$\{VOICE_INPUT_CSS\}/.test(page), "الصفحة تحمل سكربت الإملاء وأنماطه");
check(/data-vi-field="msg"/.test(page) && /VI\.html\("msg"\)/.test(page), "الزرّ بجانب حقل الرسالة للقسم");
check(/data-vi-field="ex-'\+i\+'"/.test(page) && /VI\.html\("ex-"\+i\)/.test(page), "وبجانب حقل سبب الاستثناء");
check(/maxlength="'\+\$\{VOICE_INPUT_LIMIT\}\+'"/.test(page), "وحدُّ الحقلين من الثابت نفسه");
check(/VI\.wire\(function\(key,value\)\{if\(key\.indexOf\("ex-"\)===0/.test(page), "وما يُملى في سبب الاستثناء يصل حالةَ الصفحة فيُرسَل مع الطلب");
check(!/صوتي|voice|dictat/i.test(server.slice(server.indexOf('app.post("/api/public/request/:token/reply"'), server.indexOf("function instructorRequestPage"))), "ولا يُسجَّل في الخادم أنّ الرسالة كانت صوتية");
check(/prefers-reduced-motion/.test(VOICE_INPUT_CSS) && /\.vi-arc/.test(VOICE_INPUT_CSS) && /var\(--accent\)/.test(VOICE_INPUT_CSS), "الحلقةُ بلون الهوية والنبضُ يحترم تقليل الحركة");
check(/data-show="1" placeholder="'\+\(it\.tone==="warn"\?"سبب الاستثناء — إلزامي":"ملاحظة للقسم — اختياري"\)\+'">/.test(page) && !/\(it\.tone==="warn"\?VI\.html\("ex-"\+i\)/.test(page), "خانةُ الملاحظة والميكروفون على كل موعدٍ يُعدَّل (والإلزام للاستثناء وحده)، لا حين يُطلب استثناءٌ فقط");

/* ملاحظةٌ عامة للقسم من أول فتح الصفحة، لا مرتبطة ببندٍ ولا بردّ القسم. */
check(/data-vi-field="gen"/.test(page) && /VI\.html\("gen"\)/.test(page) && /id="genNote"/.test(page), "خانةُ ملاحظةٍ عامة بميكروفونها على الصفحة من البداية");
check(/body:JSON\.stringify\(\{civil:civil,items:payloadItems\(\),note:noteNow\(\)\}\)/.test(page), "والملاحظةُ تُرسل مع الطلب");
check(/if\(key==="gen"\)\{genNote=value/.test(page) && /note:noteNow\(\),items:payloadItems\(\)/.test(page), "وما يُملى فيها يصل الحالةَ والمسودّة فلا يضيع عند إعادة الرسم");
const submitHandler = server.slice(server.indexOf('app.post("/api/public/request/:token"'), server.indexOf("ردُّ الأستاذ في حوار البند"));
check(/String\(req\.body\?\.note \|\| ""\)\.trim\(\)\.slice\(0, 400\)/.test(submitHandler) && /note: generalNote \|\| undefined/.test(submitHandler), "الخادم يحفظها نصاً حتى ٤٠٠ حرف، ولا تدخل في الحكم على البنود");
const inbox = fs.readFileSync("src/components/InstructorInbox.tsx", "utf8");
check(/row\.note \? <p className="request-note">/.test(inbox) && /!items\.length && !row\.note/.test(inbox) && /Boolean\(row\.note\) && row\.status !== "sent"/.test(inbox), "والوارد يعرضها، وملاحظةٌ بلا بنودٍ مغيَّرة تبقى بطاقةً لا تُدفن في «الجدول كما هو»");

console.log(`\nVoice input audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
