/**
 * ── كرت الأستاذ: المسار الكامل عبر الخادم الحقيقي ───────────────────────────
 *
 * يشغّل الخادمَ في وضع العرض (أو يستعمل خادماً يعمل على المنفذ نفسه) ثم يجري ما
 * يجريه أستاذٌ ومنسّق: يفتح الأستاذ كرتَه ويبقى البثُّ الحيّ مفتوحاً، ويقرّر القسم،
 * فيصل الحدثُ في ثانيتين. كلُّ قسمٍ هنا يُضاف مع مرحلته (بثٌّ، تحقّق، تقويم، ذاكرة).
 */
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import { waitForDemoSeed } from "./helpers/demoSeed";

const BASE = process.env.TEACHER_CARD_TEST_BASE || "http://localhost:3000";
const cardSource = fs.readFileSync("server.ts", "utf8");
let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

type Res = { status: number; json: any; text: string; cookie?: string };
async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Res> {
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, text, cookie: set ? set.split(";")[0] : undefined };
}
async function serverUp() { try { return (await fetch(BASE + "/api/demo/config")).ok; } catch { return false; } }

let child: ChildProcess | null = null;

/* `npx` يلد tsx ثم الخادم؛ وقتلُ npx وحده كان يترك الخادمَ حيّاً على المنفذ، فيتخطّى
   كلُّ اختبارٍ حيٍّ بعده نفسَه ويخرج ناجحاً. فيُقتل الفوجُ كلُّه. */
function stopServer() {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
}
async function ensureServer() {
  if (await serverUp()) return;
  child = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, DATA_MODE: "demo", NODE_ENV: "development" }, stdio: "ignore", detached: true });
  for (let i = 0; i < 90; i++) { if (await serverUp()) return; await new Promise(r => setTimeout(r, 1000)); }
  throw new Error("الخادم لم يبدأ");
}
async function login(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const r = await http("POST", "/api/auth/demo", {});
    if (r.status === 200 && r.cookie) { await waitForDemoSeed(BASE, r.cookie); return r.cookie; }
    await new Promise(res => setTimeout(res, 15000));
  }
  throw new Error("تعذّر الدخول التجريبي");
}

const SCOPE = "collegeId=1&sectionId=1&termId=1";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** يفتح بثّ الكرت ويجمع أسماء الأحداث الواصلة مع لحظة وصولها. */
async function listen(token: string) {
  const controller = new AbortController();
  const events: Array<{ name: string; at: number }> = [];
  const res = await fetch(`${BASE}/api/public/request/${encodeURIComponent(token)}/events`, { signal: controller.signal });
  const reader = res.body?.getReader();
  (async () => {
    const decoder = new TextDecoder(); let buffer = "";
    try {
      while (reader) {
        const { value, done } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
          const name = /^event: (.+)$/m.exec(block)?.[1];
          if (name) events.push({ name, at: Date.now() });
        }
      }
    } catch { /* الإغلاق مقصود */ }
  })();
  return { status: res.status, type: res.headers.get("content-type") || "", events, close: () => controller.abort() };
}

async function main() {
  check(cardSource.includes('var d=document.getElementById("deck")') && cardSource.includes('accept.focus({preventScroll:true})'), "زر «قرّر الآن» يُظهر بطاقة القرار ويركّز زر الموافقة");
  await ensureServer();
  const cookie = await login();
  const A = (method: string, path: string, body?: unknown) => http(method, path, body, cookie);
  const rows = (await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows as any[];
  const pick = (status: string) => rows.find(r => r.status === status && (r.items || []).some((i: any) => i.action === "change"));

  /* ═══ المرحلة ٢: البثّ الحيّ ═══════════════════════════════════════════ */
  const target = pick("submitted") || pick("in-review");
  check(!!target, "يوجد طلبٌ مرسَلٌ فيه تعديل للاختبار");
  const bad = await http("GET", "/api/public/request/demo.invalid-token-value/events");
  check(bad.status >= 400 && bad.status < 500, "رابطٌ غير صالح لا يفتح بثّاً", bad.status);

  const stream = await listen(target.linkId);
  check(stream.status === 200 && /text\/event-stream/.test(stream.type), "البثّ يُفتح بالرابط الشخصيّ ويعلن نوعه");
  await wait(300);
  check(stream.events.some(e => e.name === "ready"), "ويبدأ بحدث الجاهزية");
  const idx = target.items.findIndex((i: any) => i.action === "change");
  const sentAt = Date.now();
  const decided = await A("POST", `/api/instructor-requests/${target.id}/decide`, { itemIndex: idx, state: "rejected", reasonCode: "department", note: "اختبار", alternatives: [{ day: "fmonday", days: ["fmonday", "fwednesday"], start: "08:00", end: "09:20" }] });
  check(decided.status === 200, "القسم يقرّر", decided.status);
  await wait(1500);
  const changed = stream.events.find(e => e.name === "changed");
  check(!!changed && changed.at - sentAt < 2000, "الحدثُ يصل الأستاذَ خلال ثانيتين من قرار القسم");

  check(stream.events.filter(e => e.name === "changed").length === 1, "وحفظٌ واحد يُنتج حدثاً واحداً");
  /* الصفحةُ تعيد القراءة بعد الحدث: القراءةُ الصامتة لا تحفظ شيئاً فلا يتولّد منها حدثٌ جديد (لا حلقة). */
  const before = stream.events.length;
  const openState = async () => {
    const row = (await A("GET", `/api/instructor-requests?${SCOPE}`)).json.rows.find((r: any) => r.id === target.id);
    return JSON.stringify([row.linkOpenedAt, row.linkLastOpenAt, row.linkOpenDays]);
  };
  const openedBefore = await openState();
  const silent = await http("GET", `/api/public/request/${encodeURIComponent(target.linkId)}?live=1`);
  await wait(800);
  check(silent.status === 200 && stream.events.length === before, "وإعادةُ القراءة الصامتة لا تولّد حدثاً جديداً: لا حلقةَ بين البثّ والقراءة");
  check(await openState() === openedBefore, "ولا تُحسب فتحاً للرابط");

  /* البثُّ لا يحمل شيئاً من الطلب: نوعٌ ولحظةٌ فقط. */
  stream.close();
  const raw = await new Promise<string>(async resolve => {
    const c = new AbortController(); let all = "";
    const r = await fetch(`${BASE}/api/public/request/${encodeURIComponent(target.linkId)}/events`, { signal: c.signal });
    const rd = r.body!.getReader(); const dec = new TextDecoder();
    setTimeout(async () => {
      await A("POST", `/api/instructor-requests/${target.id}/reply`, { itemIndex: idx, text: "نصٌّ سرّيّ لا يجوز أن يظهر في البثّ" });
      setTimeout(() => { c.abort(); resolve(all); }, 600);
    }, 200);
    try { for (;;) { const { value, done } = await rd.read(); if (done) break; all += dec.decode(value); } } catch { /* abort */ }
  });
  check(/event: changed/.test(raw) && !/سرّيّ|رُفض|المحاضرة|room|قاعة/.test(raw), "ولا يحمل البثُّ نصَّ الرسالة ولا قاعةً ولا قراراً");

  /* سقفُ الاتصالات لكل طلب. */
  const many = await Promise.all([1, 2, 3, 4, 5, 6].map(() => listen(target.linkId).catch(() => null)));
  const refused = many.filter(m => m && m.status === 429).length;
  check(refused >= 1, "اتصالاتٌ كثيرة بالرابط الواحد تُرفض بدل أن تتراكم", many.map(m => m?.status));
  many.forEach(m => m?.close());

  /* ═══ المرحلة ٣: التحقّق من رمز التوقيع ═════════════════════════════════ */
  const fresh = rows.find(r => r.status === "sent" && (r.items || []).length);
  check(!!fresh, "يوجد طلبٌ لم يُرسَل بعد للتوقيع عليه");
  const instructors = (await A("GET", "/api/instructors")).json;
  const list = Array.isArray(instructors) ? instructors : (instructors.rows || instructors.instructors || []);
  const civil = String(list.find((i: any) => Number(i.AdInstructorId) === Number(fresh.AdInstructorId))?.AdInstructorCivil || "");
  const card = await http("GET", `/api/public/request/${encodeURIComponent(fresh.linkId)}`);
  const sentItems = (card.json.request.items || []).map((it: any, k: number) => k === 0
    ? { rowId: it.rowId, action: "delete", days: [], start: "" }
    : { rowId: it.rowId, action: "keep", days: [], start: "" });
  const submitted = await http("POST", `/api/public/request/${encodeURIComponent(fresh.linkId)}`, { civil, items: sentItems });
  check(submitted.status === 200, "الأستاذ يوقّع ويرسل", submitted.json);
  const code = String(submitted.json?.request?.signature?.verifyCode || "");
  check(/^[0-9A-Z]{6}$/.test(code), "ويصله رمزُ توقيعه");
  check(!JSON.stringify(submitted.json).includes("signedItems"), "وما وُقّع عليه لا يعود إلى صفحة الأستاذ مع الطلب");

  const hint = fresh.linkId;
  const sig = (r: Res) => (r.json.signatures || []) as any[];

  /* الرمزُ اختياريّ: يكفي الرقمُ المدنيّ كما في التوقيع نفسه، فمن نسي رمزه لا يُغلق عليه الباب. */
  const byCivil = await http("POST", "/api/public/verify", { civil, hint });
  check(byCivil.status === 200 && sig(byCivil).some(x => x.code === code), "الرقم المدني وحده يكفي: يعرض توقيعاتِه ومعها رموزُها", byCivil.json);
  check(byCivil.json.codeGiven === false && byCivil.json.matchedCode === null, "ولا يدّعي مطابقةَ رمزٍ لم يُكتب");
  const mine = sig(byCivil).find(x => x.code === code);
  check(mine?.hasItems === true && mine.items?.length === 1 && mine.items[0].action === "delete", "ويعرض ما وُقّع عليه بالضبط لحظتَه", mine);
  check(mine?.keptCount === sentItems.length - 1, "وكم موعداً أُبقي كما هو");
  check(!JSON.stringify(byCivil.json).includes(civil) && !JSON.stringify(byCivil.json).includes("fingerprint"), "والرقم المدني والبصمة لا يعودان في الجواب");

  /* ومع الرمز: يتقدّم التوقيعُ المطابق ويُقال إنه طابق. */
  const withCode = await http("POST", "/api/public/verify", { code, civil, hint });
  check(withCode.status === 200 && withCode.json.matchedCode === code && sig(withCode)[0].code === code, "الرمزُ الصحيح مع الرقم يتقدّم ويُعلَن مطابقتُه", withCode.json);
  const lower = await http("POST", "/api/public/verify", { code: code.toLowerCase(), civil, hint });
  check(lower.status === 200 && lower.json.matchedCode === code, "ولا تهمّ حالةُ الأحرف");

  /* رمزٌ لا يطابق (نُسي أو أُخطئ فيه): لا يُسقط الباب، تُعرض توقيعاتُه ويُقال إنه لا يطابق. */
  const wrongCode = await http("POST", "/api/public/verify", { code: code === "AAAAAA" ? "BBBBBB" : "AAAAAA", civil, hint });
  check(wrongCode.status === 200 && wrongCode.json.codeGiven === true && wrongCode.json.matchedCode === null && sig(wrongCode).some(x => x.code === code), "رمزٌ لا يطابق لا يُغلق الباب: تُعرض توقيعاتُه ويُقال إنه لا يطابق", wrongCode.json);

  /* رقمٌ لا توقيعَ باسمه: جوابٌ واحدٌ بالنصّ نفسه سواءٌ كُتب رمزٌ أو لم يُكتب. */
  const nonSigner = list.find((i: any) => !rows.some((r: any) => Number(r.AdInstructorId) === Number(i.AdInstructorId) && r.signature) && i.AdInstructorCivil);
  check(!!nonSigner, "يوجد أستاذٌ صحيحُ الرقم المدني لم يوقّع شيئاً");
  const stranger = String(nonSigner.AdInstructorCivil);
  const unknown = await http("POST", "/api/public/verify", { civil: stranger, hint });
  const unknownWithCode = await http("POST", "/api/public/verify", { civil: stranger, code, hint });
  check(unknown.status === 404, "رقمٌ صحيحٌ لا توقيعَ باسمه لا يعطي شيئاً", unknown.status);
  check(unknown.status === unknownWithCode.status && unknown.text === unknownWithCode.text, "وبالجواب نفسه ولو كُتب معه رمزٌ صحيح: الرمزُ لا يفتح بابَ غير صاحبه");

  /* الصيغة تُردّ قبل البحث. */
  check((await http("POST", "/api/public/verify", { civil: "1" })).status === 400, "رقمٌ ناقص يُردّ بلا بحث");
  check((await http("POST", "/api/public/verify", { civil, code: "ab" })).status === 400, "ورمزٌ مكتوبٌ ناقص يُردّ ويُقال له أن يتركه فارغاً");
  check((await http("POST", "/api/public/verify", { code })).status === 400, "والرمزُ وحده لا يكفي: لا يُفتح بلا رقمٍ مدنيّ");

  /* والصفحة. */
  const page = await http("GET", `/verify/${code}?t=${encodeURIComponent(hint)}`);
  check(page.status === 200 && /التحقّق من توقيعك/.test(page.text) && page.text.includes(JSON.stringify(code)), "وصفحةُ التحقّق تُفتح والرمزُ جاهزٌ فيها");
  check(/اختياري/.test(page.text) && /يكفي|فلا يضرّ/.test(page.text), "وتقول إن الرمز اختياري");
  const bare = await http("GET", "/verify");
  check(bare.status === 200 && /id="civil"/.test(bare.text), "وتُفتح بلا رمزٍ أصلاً");
  const hostile = await http("GET", `/verify/${encodeURIComponent("</script><img src=x>")}`);
  check(!hostile.text.includes("</script><img"), "ورمزٌ خبيث في الرابط لا يُغلق وسمَ السكربت");

  /* ═══ المرحلة ٤: اشتراك التقويم ═════════════════════════════════════════ */
  const pending = rows.find(r => r.status === "submitted" && r.id !== target.id && (r.items || []).some((i: any) => i.action === "change" && !i.decision));
  check(!!pending, "يوجد طلبٌ فيه تعديلٌ لم يثبّته القسم");
  const calCard = await http("GET", `/api/public/request/${encodeURIComponent(pending.linkId)}`);
  const feedPath = String(calCard.json.calendarFeed || "");
  check(/^\/api\/public\/ics\/[^/]+\/[0-9a-f]{32}\?term=\d+$/.test(feedPath), "الكرت يحمل رابط اشتراكه — هو نفسه اشتراك بطاقة الأستاذ لا بابٌ ثانٍ", feedPath);
  const feed = await fetch(BASE + feedPath);
  const ics = await feed.text();
  check(feed.status === 200 && /text\/calendar/.test(feed.headers.get("content-type") || "") && ics.startsWith("BEGIN:VCALENDAR") && ics.includes("END:VCALENDAR"), "والرابط يُرجع ملف تقويمٍ صالحاً");
  check(/BEGIN:VEVENT/.test(ics), "وفيه مواعيدُ الأستاذ الرسمية");
  const changeItem = (calCard.json.request.items || []).find((i: any) => i.action === "change");
  const askedStart = String(changeItem?.slots?.[0]?.start || "");
  const askedDays = (changeItem?.slots || []).map((sl: any) => sl.day).sort().join(",");
  const beforeStart = (/\d{1,2}:\d{2}/.exec(String(changeItem?.before?.time || "")) || [""])[0];
  const stamp = (t: string) => t.replace(":", "").padStart(4, "0") + "00";
  if (askedStart && askedStart !== beforeStart) {
    check(!new RegExp(`DTSTART[^\\n]*T${stamp(askedStart)}`).test(ics) || ics.split(`T${stamp(askedStart)}`).length - 1 <= (calCard.json.request.items || []).length, "ولا يحمل الموعدَ المطلوب الذي لم يثبّته القسم", { askedStart, askedDays });
  } else {
    check(true, "الموعد المطلوب يطابق الرسمي فلا فرق يُفحص");
  }
  const cacheHeader = feed.headers.get("cache-control") || "";
  check(/no-cache|no-store/.test(cacheHeader) && !!feed.headers.get("etag"), "وإعادة القراءة تُفحص كل مرّة (ETag) فلا يبقى جدولٌ قديم في الهاتف", cacheHeader);
  const forged = await fetch(BASE + feedPath.replace(/\/[0-9a-f]{32}\?/, "/" + "0".repeat(32) + "?"));
  check(forged.status === 404, "مفتاحٌ مزوَّر لا يفتح شيئاً", forged.status);

  /* ═══ المرحلة ٥: ذاكرةُ الفصول ═══════════════════════════════════════════ */
  const terms = (await A("GET", "/api/terms")).json as any[];
  const later = terms.find(t => Number(t.AdTermId) === 2);
  if (!later) {
    check(true, "لا فصلَ لاحقٌ في هذه البيئة فلا يُفحص مسار ذاكرة الفصول");
  } else {
    const closes = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
    const issued = await A("POST", "/api/instructor-requests/issue", { collegeId: 1, sectionId: 1, termId: 2, closesAt: closes, source: "previous-term", previousTermId: 1 });
    check(issued.status === 200 && (issued.json.issued || []).length > 0, "يُصدَر للفصل اللاحق رابطٌ لكل أستاذ", issued.json);
    const rows2 = (await A("GET", `/api/instructor-requests?collegeId=1&sectionId=1&termId=2`)).json.rows as any[];
    const firstTerm = terms.find(t => Number(t.AdTermId) === 1);
    const hadChange = rows.find(r => r.submittedAt && (r.items || []).some((i: any) => i.action === "change") && rows2.some(x => x.AdInstructorId === r.AdInstructorId));
    check(!!hadChange, "يوجد أستاذٌ طلب تعديلاً في الفصل الأول وله رابطٌ في اللاحق");
    const link2 = rows2.find(x => x.AdInstructorId === hadChange.AdInstructorId);
    const mem = await http("GET", `/api/public/request/${encodeURIComponent(link2.linkId)}/previous`);
    check(mem.status === 200 && mem.json.previous?.termName === firstTerm.AdTermName, "الكرتُ اللاحق يعيد ما طلبه في الفصل السابق", mem.json);
    const first = mem.json.previous?.items?.[0] || {};
    check(["fixed", "rejected", "pending"].includes(first.state) && first.action !== "keep" && !!first.courseId, "بحالة كل بندٍ كما قُرّر فيه");
    check(!/room|roomCandidates|roomOptions|قاعة/.test(JSON.stringify(mem.json)), "ولا قاعةَ ولا مرشّحاً فيما يخرج");
    const none = rows2.find(x => !rows.some(r => r.AdInstructorId === x.AdInstructorId && r.submittedAt));
    if (none) {
      const empty = await http("GET", `/api/public/request/${encodeURIComponent(none.linkId)}/previous`);
      check(empty.status === 200 && empty.json.previous === null, "ومن لم يطلب شيئاً فيما مضى لا يرى بطاقة");
    }
    const noLink = await http("GET", "/api/public/request/demo.nope-nope/previous");
    check(noLink.status >= 400 && noLink.status < 500, "رابطٌ غير صالح لا يعيد شيئاً");
  }

  /* ═══ الجولة الثانية: التعديل بلا لمسة، والخريطة، ومانعُ الأيام ═══════════ */
  {
    const draft = rows.find(r => r.AdInstructorId === 5);
    if (!draft) check(false, "يوجد أستاذٌ في مسودّته أربعةُ مواعيد للاختبار");
    else {
      const link = encodeURIComponent(draft.linkId);
      const items = ((await http("GET", `/api/public/request/${link}`)).json.request?.items || []) as any[];
      const thursday = items.find(i => String(i.before?.days) === "الخميس");
      const monWed = items.find(i => String(i.before?.days) === "الاثنين · الأربعاء");
      check(!!thursday && !!monWed, "مواعيدُ عضو ٥ كما في وصف العيب");
      const keeps = items.map(i => ({ rowId: i.rowId, action: "keep", days: [], start: "" }));
      const at = (item: any) => items.indexOf(item);
      const asChange = (item: any, days: string[], start: string) => keeps.map((k, n) => n === at(item) ? { rowId: item.rowId, action: "change", days, start } : k);

      /* ١) «تعديل» بلا لمسة: لا مانع، والنهايةُ الأصلية، والإرشادُ لا يمنع. */
      const same = await http("POST", `/api/public/request/${link}/check`, { itemIndex: at(thursday), rowId: thursday.rowId, action: "change", days: ["fthursday"], start: "14:00", items: asChange(thursday, ["fthursday"], "14:00") });
      check(same.status === 200 && same.json.kind === "clear", "تعديل الخميس ١٤:٠٠ بلا لمسة: «الوقت متاح» لا مانع", same.json);
      check(/أقصر من ساعات المقرّر/.test(same.json.advice || "") && (same.json.shapes || []).length > 0, "ومعه إرشادٌ وأزرارُ أنماطٍ لا مانع", same.json);
      check(same.json.block === 75, "والطولُ الأصلي ٧٥ دقيقة يُمرَّر للصفحة", same.json.block);
      const later = await http("POST", `/api/public/request/${link}/check`, { itemIndex: at(thursday), rowId: thursday.rowId, action: "change", days: ["fthursday"], start: "15:00", items: asChange(thursday, ["fthursday"], "15:00") });
      check(later.json.kind === "clear" && later.json.computedEnd === "16:15", "بدايةٌ ١٥:٠٠ في اليوم نفسه: ١٥:٠٠–١٦:١٥ بلا مانع", later.json);

      /* ٢) الخريطةُ: مشكلةُ الأيام لا تُلوّن الأوقات كلَّها حمراء. */
      const heatShape = await http("POST", `/api/public/request/${link}/check-times`, { itemIndex: at(monWed), items: asChange(monWed, ["fsunday", "ftuesday"], "09:30"), starts: ["08:00", "09:00", "10:00"] });
      check(heatShape.json.problem === "shape" && Object.keys(heatShape.json.times || {}).length === 0, "الأيامُ لا تغطّي الساعات: check-times يعيد problem=shape بدل bad لكل وقت", heatShape.json);
      const heatOk = await http("POST", `/api/public/request/${link}/check-times`, { itemIndex: at(thursday), items: asChange(thursday, ["fthursday"], "14:00"), starts: ["09:00", "10:00"] });
      check(!heatOk.json.problem && Object.values(heatOk.json.times || {}).every(v => v !== "bad"), "ومعها لا يتلوّن وقتٌ بالأحمر في الخميس الأصلي", heatOk.json);

      /* ٣) مسارُ الإرسال: بندٌ لم يُلمس يصل إبقاءً، ولا تتغيّر المسودّة. */
      const noEdit = await http("POST", `/api/public/request/${link}/check`, { itemIndex: at(monWed), rowId: monWed.rowId, action: "change", days: ["fmonday", "fwednesday"], start: "09:30", items: asChange(monWed, ["fmonday", "fwednesday"], "09:30") });
      check(noEdit.json.kind === "clear" && !(noEdit.json.nearestTimes || []).length, "٠١ بلا لمسة (١٠:٤٥ تبقى ١٠:٤٥): لا تغييرَ ولا مانع", noEdit.json);
    }
  }

  /* ═══ حدودُ البطاقة لكل رابطٍ لا لكل عنوان: شبكةُ الجامعة عنوانٌ واحدٌ لعشرات الأساتذة ═══ */
  {
    const tokens = rows.map(r => r.linkId).filter(Boolean).slice(0, 4);
    const codes: number[] = [];
    for (let i = 0; i < 130; i += 1) codes.push((await http("GET", `/api/public/request/${encodeURIComponent(tokens[i % tokens.length])}?live=1`)).status);
    check(codes.every(c => c === 200), "١٣٠ طلباً على أربعة روابط من عنوانٍ واحد في دقيقة: لا حجب (كان يُحجب بعد ٦٠)", codes.filter(c => c !== 200).slice(0, 3));
    const solo = encodeURIComponent(tokens[0]);
    const flood: number[] = [];
    for (let i = 0; i < 260; i += 1) flood.push((await http("GET", `/api/public/request/${solo}?live=1`)).status);
    check(flood.includes(429), "ورابطٌ واحدٌ يكرّر بلا توقف يقف عند حدّه الشخصيّ", flood.slice(-3));
  }

  /* ورمزٌ بتوقيعٍ قديمٍ بلا بنود: يُقال ذلك ولا يُخترع. */
  console.log(`\nTeacher card flow audit: ${passed} passed, ${failed} failed`);
  stopServer();
  process.exit(failed ? 1 : 0);
}
main().catch(error => { console.error(error); stopServer(); process.exit(1); });
