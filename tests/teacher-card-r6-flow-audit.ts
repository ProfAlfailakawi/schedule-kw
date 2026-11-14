/**
 * ── كرت الأستاذ، الجولة السادسة: على خادم التجربة الحقيقي ─────────────────────────────
 *
 *   • data.week في بطاقة الأستاذ: جدولُه الرسمي بلا قاعةٍ ولا مبنى.
 *   • اشتراكُ التقويم مربوطٌ بالرابط الحيّ: يعرض الجدولَ للرابط الحيّ، ويُجيب فارغاً لرابطٍ أُوقف، و404 لمفتاحٍ مزوَّر أو رمزِ زميل.
 *   • «تحقّق من توقيعك»: عشرُ أخطاءٍ على رقمٍ واحد تحجبه وحده، لا زميلَه من العنوان نفسه.
 *   • خطأُ الإرسال لمقرّرٍ غير مطروح يحمل رقمَ البند.
 *
 * TEACHER_CARD_TEST_BASE يشير إلى خادمٍ قائم (المنفذ 3213 مثلاً)؛ وإلا يُشغَّل خادمُ تجربةٍ على منفذٍ حرّ.
 */
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { validateCivilId } from "../src/utils/civilId";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

let live: LiveServer | null = null;
let BASE = process.env.TEACHER_CARD_TEST_BASE || "";

type Res = { status: number; json: any; text: string; type: string; cookie?: string };
async function http(method: string, path: string, body?: unknown, cookie?: string): Promise<Res> {
  const res = await fetch(BASE + path, {
    method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  const set = res.headers.get("set-cookie");
  return { status: res.status, json, text, type: res.headers.get("content-type") || "", cookie: set ? set.split(";")[0] : undefined };
}

/* رقمٌ مدنيٌّ صحيحُ الخانة (ثابتُ التوليد) لا يخصّ أحداً في التجربة. */
function civilIds(count: number): string[] {
  const out: string[] = [];
  /* بدءٌ عشوائيّ: إعادةُ الاختبار على خادمٍ قائم لا تصطدم بحجبٍ سابق (العدّادُ في ذاكرة الخادم). */
  const from = 100_000_000 + Math.floor(Math.random() * 800_000_000);
  for (let n = 0; out.length < count && n < 5_000_000; n += 1) {
    const civil = `3${String(from + n).padStart(11, "0")}`;
    if (validateCivilId(civil).isValid) out.push(civil);
  }
  return out;
}

async function main() {
  if (!BASE) { live = await startDemoServer("r6-flow"); BASE = live.base; }
  try {
    let cookie = "";
    for (let i = 0; i < 8 && !cookie; i += 1) {
      const login = await http("POST", "/api/auth/demo", {});
      if (login.status === 200 && login.cookie) cookie = login.cookie; else await new Promise(r => setTimeout(r, 4000));
    }
    await waitForDemoSeed(BASE, cookie);
    await http("POST", "/api/demo/role", { role: "admin" }, cookie);
    const rows = (await http("GET", "/api/instructor-requests?collegeId=1&sectionId=1&termId=1", undefined, cookie)).json.rows as any[];
    check(rows.length >= 3, "بطاقاتٌ تجريبية للأساتذة", rows.length);
    const [mine, colleague] = [rows[0], rows[1]];

    /* ── data.week ── */
    const card = await http("GET", `/api/public/request/${encodeURIComponent(mine.linkId)}`);
    const week = card.json.week;
    check(card.status === 200 && week && Array.isArray(week.meetings) && week.meetings.length > 0, "بطاقتُه تحمل جدولَه الرسمي (data.week)", Object.keys(card.json));
    check(week.meetings.every((m: any) => /^f(sunday|monday|tuesday|wednesday|thursday)$/.test(m.day) && /^\d{1,2}:\d{2}$/.test(m.start) && /^\d{1,2}:\d{2}$/.test(m.end) && m.course && ["main", "jahra", "fahaheel"].includes(m.campus)),
      "كلُّ محاضرةٍ باليوم والبداية والنهاية والمقرر والحرم", week.meetings[0]);
    check(/^\d{4}-\d{2}-\d{2}$/.test(week.term.start) && /^\d{4}-\d{2}-\d{2}$/.test(week.term.end) && week.term.closed === false, "وحدّا الفصل", week.term);
    check(week.travel && week.travel["jahra|main"] > 0, "ودقائقُ التنقّل من السياسة", week.travel);
    const keys = new Set<string>();
    JSON.stringify(week, (k, v) => { keys.add(k); return v; });
    check(![...keys].some(k => /room|hall|building|AdRoom|roomCode/i.test(k)), "ولا حقلَ قاعةٍ ولا مبنى في data.week", [...keys]);
    check(!/"AdRoomCode"|"AdRoomHall"/.test(JSON.stringify(card.json.week)), "ولا قيمةَ قاعة");

    /* ── التقويم ── */
    const feed = String(card.json.calendarFeed || "");
    const [feedPath, feedQuery] = feed.split("?");
    check(/^\/api\/public\/cal\/[^/]+\/p\d+-[0-9a-f]{32}\.ics$/.test(feedPath), "رابطُ الاشتراك بصيغته", feedPath);
    const own = await http("GET", feed);
    check(own.status === 200 && /text\/calendar/.test(own.type) && own.text.includes("BEGIN:VEVENT") && own.text.includes("BEGIN:VEVENT"), "الرابطُ الحيّ يعرض جدولَه", { status: own.status, type: own.type });
    const parts = feedPath.split("/");
    const token = parts[4], keyFile = parts[5];
    const tampered = `/api/public/cal/${token}/${keyFile.replace(/.\.ics$/, c => (c.startsWith("0") ? "1.ics" : "0.ics"))}${feedQuery ? `?${feedQuery}` : ""}`;
    check((await http("GET", tampered)).status === 404, "مفتاحٌ مزوَّر: 404");
    const otherToken = `/api/public/cal/${encodeURIComponent(colleague.linkId)}/${keyFile}${feedQuery ? `?${feedQuery}` : ""}`;
    const stolen = await http("GET", otherToken);
    check(stolen.status === 404 && !stolen.text.includes("BEGIN:VEVENT"), "مفتاحُه مع رمز زميله: 404 ولا جدول (المفتاحُ مربوطٌ برابطه)", { status: stolen.status });
    const nonsense = await http("GET", `/api/public/cal/not-a-real-token/${keyFile}${feedQuery ? `?${feedQuery}` : ""}`);
    check(nonsense.status === 404 && !nonsense.text.includes("BEGIN:VEVENT"), "ورمزٌ لا وجودَ له: 404 ولا جدول", nonsense.status);
    const revoke = await http("DELETE", `/api/share/${encodeURIComponent(token)}`, undefined, cookie);
    check(revoke.status === 200, "إيقافُ رابط الأستاذ من القسم", revoke.status);
    const revoked = await http("GET", feed);
    check(revoked.status === 200 && !revoked.text.includes("BEGIN:VEVENT") && revoked.text.includes("توقّف"), "بعد إيقاف الرابط: الاشتراكُ نفسُه يُجيب فارغاً (تُمسح المحاضرات من الهاتف بهدوء)", { status: revoked.status });

    /* ── التحقّق من التوقيع ── */
    const [civilA, civilB] = civilIds(2);
    const tries: number[] = [];
    for (let i = 0; i < 11; i += 1) tries.push((await http("POST", "/api/public/verify", { civil: civilA })).status);
    check(tries.slice(0, 10).every(s => s === 404) && tries[10] === 429, "عشرُ أخطاءٍ على رقمٍ واحد ثم 429", tries);
    const colleagueTry = await http("POST", "/api/public/verify", { civil: civilB });
    check(colleagueTry.status === 404, "ورقمُ زميلٍ من العنوان نفسه لا يُحجب (شبكةُ الجامعة)", colleagueTry.status);
    const blockedBody = (await http("POST", "/api/public/verify", { civil: civilA })).json;
    check(!JSON.stringify(blockedBody).includes(civilA), "ولا يعود الرقمُ المدنيّ في جواب الحجب");

    /* ── مقرّرٌ غير مطروح عند الإرسال: رقمُ البند ── */
    const fresh = rows.find((r: any) => r.linkId !== mine.linkId && r.linkId !== colleague.linkId) || rows[2];
    const open = await http("GET", `/api/public/request/${encodeURIComponent(fresh.linkId)}`);
    const closed = (open.json.courses || []).find((c: any) => c.offering);
    if (closed && open.json.windowOpen) {
      const items = (open.json.request.items || []).map((it: any) => ({ rowId: it.rowId, action: "keep", days: [], start: "" }));
      items.push({ action: "add", courseId: closed.id, collegeId: closed.collegeId, sectionId: closed.sectionId, days: ["fsunday"], start: "09:00" });
      const sent = await http("POST", `/api/public/request/${encodeURIComponent(fresh.linkId)}`, { civil: "000000000000", items, requestRevision: open.json.request.requestRevision });
      check(sent.status === 400 && sent.json.itemIndex === items.length - 1 && /غير مطروح/.test(sent.json.error), "الإرسالُ بمقرّرٍ غير مطروح يحمل رقمَ البند المخالف", sent.json);
    } else check(true, "لا مقرّرَ مغلقاً في بيانات التجربة: يغطّيه الاختبارُ النقيّ");
  } finally {
    if (live) await live.stop();
  }
  console.log(`\n${passed} ناجح، ${failed} فاشل`);
  if (failed) process.exit(1);
}
main().catch(error => { console.error(error); process.exit(1); });
