/**
 * ── النبضة: الخيطُ يُفتح حين يكون معك أحد ─────────────────────────────────
 *
 * A stream held open for a coordinator alone on their board kept Cloud Run
 * billing all day for nobody. Screens now ask a short question instead (who
 * else is here, has anything changed) and open the stream only when someone
 * is. This audit checks, without a browser and without waiting:
 *   P) the server's answer — company counts people at their screens, not tabs;
 *   C) the change clocks — a sandbox hears real news, never another sandbox's;
 *   B) the beacon no longer echoes an instance's own write back to it;
 *   T) the tab's pulse on a simulated clock — its rhythm, its sleep, its
 *      signals, and the answers it must ignore;
 *   W) the wiring — which screens listen, which still stream, and when.
 */
import fs from "fs";
import path from "path";
import { companyOn, createChangeClock, sweepPulses, PULSE_TTL_MS, type PulseEntry } from "../src/server/livePulse";
import { foreignWrites } from "../src/db/beaconEcho";
import { roleWriteDecision } from "../src/server/roleGuard";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const between = (text: string, from: string, to: string) => {
  const start = text.indexOf(from);
  return start < 0 ? "" : text.slice(start, text.indexOf(to, start + from.length));
};

/* ── P) من معي على هذا الجدول ── */
{
  const now = 1_000_000;
  const board = "1:2:3";
  const pulse = (userId: number, extra: Partial<PulseEntry> = {}): PulseEntry => ({ userId, scopeKey: board, active: true, seenAt: now, ...extra });
  check(companyOn(board, 7, [], [], now) === 0, "P1 وحدي على الجدول: لا أحد");
  check(companyOn(board, 7, [pulse(7), pulse(7)], [{ userId: 7, scopeKey: board, seenAt: now }], now) === 0, "P2 ألساني الأخرى ليست رفقة");
  check(companyOn(board, 7, [pulse(9)], [], now) === 1, "P3 زميلٌ على الجدول نفسه: واحد");
  check(companyOn(board, 7, [pulse(9), pulse(9), pulse(9)], [{ userId: 9, scopeKey: board, seenAt: now }], now) === 1, "P4 زميلٌ بثلاثة ألسنةٍ وبثٍّ قديم: شخصٌ واحد");
  check(companyOn(board, 7, [pulse(9, { active: false })], [], now) === 0, "P5 شاشةٌ متروكة على الجدار ليست رفقة");
  check(companyOn(board, 7, [pulse(9, { seenAt: now - PULSE_TTL_MS - 1 })], [], now) === 0, "P6 لسانٌ سكت دقيقةً ونصفاً غادر");
  check(companyOn(board, 7, [pulse(9, { scopeKey: "1:2:4" })], [], now) === 0, "P7 فصلٌ آخر جدولٌ آخر");
  check(companyOn("", 7, [pulse(9, { scopeKey: "" })], [], now) === 0, "P8 الجرس بلا جدول لا رفقة له ولا يُحسب رفقة");
  check(companyOn(board, 7, [], [{ userId: 9, scopeKey: board, seenAt: now }], now) === 1, "P9 لسانٌ ما زال على النسخة القديمة (بثٌّ بلا نبضة) يُرى ويُلتقى");
  check(companyOn(board, 7, [pulse(9, { scopeKey: `demo:x:${board}` })], [], now) === 0, "P10 صندوقُ عرضٍ بالأرقام نفسها ليس الجدولَ الحقيقي");
  check(companyOn(board, 7, [pulse(9), pulse(11), pulse(0)], [], now) === 2, "P11 اثنان معي؛ ومن لا هوية له لا يُعدّ");
  const map = new Map<string, PulseEntry>([["old", pulse(9, { seenAt: now - PULSE_TTL_MS - 5 })], ["fresh", pulse(11)]]);
  sweepPulses(map, now);
  check(!map.has("old") && map.has("fresh"), "P12 الكنسُ ينسى من سكت ويُبقي الحاضر");
}

/* ── C) ساعةُ التغيير ── */
{
  const clock = createChangeClock(1000);
  check(clock.read() === 1000 && clock.read("s1") === 1000, "C1 تبدأ من لحظة تشغيل الخادم لا من الصفر");
  clock.bump("", 2000);
  check(clock.read() === 2000 && clock.read("s1") === 2000, "C2 خبرٌ حقيقيٌّ يبلغ الجميع، وصناديقَ العرض أيضاً");
  clock.bump("s1", 3000);
  check(clock.read() === 2000 && clock.read("s1") === 3000 && clock.read("s2") === 2000, "C3 خبرُ صندوقٍ لا يبلغ إلا صندوقه");
  clock.bump("", 1500);
  check(clock.read() === 2000, "C4 الوقتُ لا يرجع إلى الوراء");
  const busy = createChangeClock(0);
  for (let i = 0; i < 300; i++) busy.bump(`s${i}`, 10 + i);
  busy.bump("", 1_000_000);
  busy.bump("late", 2_000_000);
  check(busy.read("late") === 2_000_000 && busy.read("s5") === 1_000_000, "C5 صناديقٌ كثيرة تُنسى دون أن يضيع خبرٌ حديث");
}

/* ── B) المنارةُ لا تُعيد للنسخة كتابتَها ── */
{
  check(foreignWrites({ serial: 4, mine: 2 }, { serial: 5, mine: 3 }) === 0, "B1 كتابتي عادت إليّ: ليست خبراً");
  check(foreignWrites({ serial: 4, mine: 2 }, { serial: 5, mine: 2 }) === 1, "B2 كتابةُ نسخةٍ أخرى: خبر");
  check(foreignWrites({ serial: 4, mine: 2 }, { serial: 7, mine: 4 }) === 1, "B3 لقطةٌ واحدة جمعت كتابتين لي وواحدةً لغيري: خبرٌ واحد لا يضيع");
  check(foreignWrites({ serial: 9, mine: 5 }, { serial: 9, mine: 0 }) === 1, "B4 سجلُّ الكُتّاب مُحي: يُعامل خبراً، فالخطأ في جهة الحذر");
  check(foreignWrites({ serial: 9, mine: 5 }, { serial: 2, mine: 5 }) === 1, "B5 عدّادٌ رجع إلى الوراء (وثيقةٌ أُعيد إنشاؤها): خبر");
  const repo = read("src/db/repository.ts");
  const mark = between(repo, "markSchedulesChanged: async", "watchSchedulesChanged:");
  const watch = between(repo, "watchSchedulesChanged:", "getVisitingRosterMember:");
  check(/writers: \{ \[BEACON_WRITER\]: FieldValue\.increment\(1\) \}/.test(mark), "B6 كلُّ كتابةٍ تُعدّ باسم كاتبها");
  check(/foreignWrites\(last, next\)/.test(watch) && /if \(foreign > 0\) onChange\(\);/.test(watch), "B7 والمستمع لا يوقظ إلا لكتابة غيره");
}

/* ── T) نبضةُ اللسان على ساعةٍ مُحاكاة ── */
type Answer = { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;
let clockNow = 0;
let timers: Array<{ at: number; fn: () => void; id: number }> = [];
let timerId = 1;
const listeners: Record<string, Array<() => void>> = {};
const docListeners: Record<string, Array<() => void>> = {};
const asked: string[] = [];
const beacons: string[] = [];
const answers: Answer[] = [];
const fakeWindow = {
  setTimeout: (fn: () => void, ms = 0) => { const id = timerId++; timers.push({ at: clockNow + ms, fn, id }); return id; },
  clearTimeout: (id: number) => { timers = timers.filter(timer => timer.id !== id); },
  addEventListener: (name: string, fn: () => void) => { (listeners[name] ||= []).push(fn); },
  removeEventListener: (name: string, fn: () => void) => { listeners[name] = (listeners[name] || []).filter(item => item !== fn); },
};
const fakeDocument = {
  hidden: false,
  addEventListener: (name: string, fn: () => void) => { (docListeners[name] ||= []).push(fn); },
  removeEventListener: (name: string, fn: () => void) => { docListeners[name] = (docListeners[name] || []).filter(item => item !== fn); },
};
Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true, writable: true });
Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true, writable: true });
Object.defineProperty(globalThis, "navigator", { value: { sendBeacon: (url: string) => { beacons.push(url); return true; } }, configurable: true, writable: true });
Object.defineProperty(globalThis, "fetch", {
  value: async (url: string) => {
    asked.push(url);
    const answer = await (answers.shift() || { status: 200, body: { company: 0, changedAt: 0, notifiedAt: 0 } });
    return { status: answer.status, ok: answer.status >= 200 && answer.status < 300, json: async () => answer.body };
  },
  configurable: true, writable: true,
});
const realNow = Date.now;
Date.now = () => clockNow;
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const advance = async (ms: number) => {
  const end = clockNow + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at);
    const due = timers[0];
    if (!due || due.at > end) break;
    timers.shift();
    clockNow = due.at;
    due.fn();
    await settle();
  }
  clockNow = end;
  await settle();
};
const visibility = async (hidden: boolean) => {
  fakeDocument.hidden = hidden;
  for (const fn of [...(docListeners.visibilitychange || [])]) fn();
  await settle();
};
const answer = (body: Record<string, unknown>) => answers.push({ status: 200, body: { company: 0, changedAt: 0, notifiedAt: 0, ...body } });

{
  const pulse = await import("../src/utils/livePulse");
  const signals: string[] = [];
  const states: Array<{ company: number; connected: boolean }> = [];

  answer({ changedAt: 100, notifiedAt: 50 });
  const stopBoard = pulse.onLiveSignal(["schedules"], stamps => signals.push(`schedules@${stamps.changedAt}`));
  await settle();
  check(asked.length === 1 && /active=1/.test(asked[0]), "T1 أوّلُ مشترك: سؤالٌ فوري، والشخص حاضر", asked);
  check(signals.length === 0, "T2 الجوابُ الأول نقطةُ البدء لا خبر", signals);

  answer({ changedAt: 100, notifiedAt: 50 });
  await advance(14_999);
  check(asked.length === 1, "T3 لا سؤال قبل خمس عشرة ثانية", asked.length);
  await advance(1);
  check(asked.length === 2 && signals.length === 0, "T4 بعدها سؤال، ولا جديد فلا إشارة", { asked: asked.length, signals });

  answer({ changedAt: 200, notifiedAt: 50 });
  await advance(15_000);
  check(signals.join() === "schedules@200", "T5 تغيّر الجدول: إشارةٌ واحدة تحمل الوقت", signals);

  const bell: string[] = [];
  const stopBell = pulse.onLiveSignal(["notify"], () => bell.push("notify"));
  answer({ changedAt: 200, notifiedAt: 60 });
  await advance(15_000);
  check(bell.length === 1 && signals.length === 1, "T6 خبرُ الجرس يوقظ الجرس وحده", { bell, signals });

  answer({ changedAt: 150, notifiedAt: 60 });
  await advance(15_000);
  answer({ changedAt: 200, notifiedAt: 60 });
  await advance(15_000);
  check(signals.length === 1, "T7 نسخةٌ أقدم أجابت بوقتٍ أصغر: لا يُعاد خبرٌ قديم كأنه جديد", signals);

  pulse.onLiveState(state => states.push({ ...state }));
  answer({ changedAt: 200, notifiedAt: 60, company: 2 });
  pulse.setLiveScope({ collegeId: 1, sectionId: 2, termId: 3 });
  pulse.setLiveScope({ collegeId: 1, sectionId: 2, termId: 3 });
  const before = asked.length;
  await advance(50);
  check(asked.length === before + 1 && /college=1&section=2&term=3/.test(asked[asked.length - 1]), "T8 الانتقالُ إلى جدولٍ يُعلن فوراً، ومرّتان بلا تغيير سؤالٌ واحد", asked.slice(before));
  check(states[states.length - 1]?.company === 2 && states[states.length - 1]?.connected === true, "T9 الرفقة تصل الجدول", states);

  // A question about board A is out when the reader moves to board B.
  let release: (value: { status: number; body?: unknown }) => void = () => undefined;
  answers.push(new Promise(resolve => { release = resolve; }));
  answer({ changedAt: 200, notifiedAt: 60, company: 0 });
  await advance(15_000);
  pulse.setLiveScope({ collegeId: 1, sectionId: 2, termId: 4 });
  await advance(50);
  release({ status: 200, body: { company: 5, changedAt: 200, notifiedAt: 60 } });
  await settle();
  check(!states.some(state => state.company === 5), "T10 جوابٌ عن جدولٍ غادرناه لا يُحسب رفقةً على الجديد", states);
  check(/term=4/.test(asked[asked.length - 1]) && states[states.length - 1]?.company === 0, "T11 والسؤالُ عن الجديد يُطرح حالما يعود القديم", asked.slice(-2));

  // Ten minutes without a touch: the tab is a display now. The last touch is
  // made here, so the ten minutes are counted from a known moment.
  for (const fn of [...(listeners.pointermove || [])]) fn();
  answer({ changedAt: 200, notifiedAt: 60 });
  const beforeIdle = asked.length;
  await advance(10 * 60_000);
  const idleAsks = asked.slice(beforeIdle);
  check(idleAsks.length > 0 && /active=0/.test(idleAsks[idleAsks.length - 1]), "T12 بعد عشر دقائق بلا لمسة يقول للخادم: شاشةٌ لا شخص", idleAsks.slice(-1));
  const drowsyFrom = asked.length;
  await advance(59_000);
  check(asked.length === drowsyFrom, "T13 والشاشةُ تسأل كل دقيقة لا كل خمس عشرة ثانية", asked.length - drowsyFrom);
  await advance(1_000);
  check(asked.length === drowsyFrom + 1, "T14 …فتبقى على الجدار محدّثةً خلال دقيقة", asked.length - drowsyFrom);

  // A touch brings the person back at once.
  answer({ changedAt: 200, notifiedAt: 60 });
  const beforeTouch = asked.length;
  for (const fn of [...(listeners.pointermove || [])]) fn();
  await settle();
  check(asked.length === beforeTouch + 1 && /active=1/.test(asked[asked.length - 1]), "T15 لمسةٌ واحدة: حاضرٌ من جديد، ويُقال فوراً", asked.slice(beforeTouch));

  // Hidden: a grace minute, then silence.
  await visibility(true);
  const beforeHide = asked.length;
  await advance(60_000);
  const afterGrace = asked.length;
  await advance(30 * 60_000);
  check(asked.length === afterGrace && afterGrace - beforeHide <= 4, "T16 لسانٌ مخفيّ: دقيقةُ سماح ثم صمتٌ تام", { duringGrace: afterGrace - beforeHide, after: asked.length - afterGrace });

  answer({ changedAt: 900, notifiedAt: 60 });
  await visibility(false);
  check(asked.length === afterGrace + 1 && signals[signals.length - 1] === "schedules@900", "T17 عودةُ اللسان: سؤالٌ فوري، وما فات يصل خبراً واحداً", { asked: asked.length - afterGrace, signals });

  // No permission is a fact, not a hiccup.
  answers.push({ status: 403, body: { error: "no" } });
  await advance(15_000);
  const refusedAt = asked.length;
  await advance(10 * 60_000);
  check(asked.length === refusedAt && states[states.length - 1]?.connected === false, "T18 حسابٌ بلا صلاحية: يتوقف السؤال، والجدولُ يعرف أنه غير متصل", asked.length - refusedAt);

  stopBoard(); stopBell();
  check(beacons.length === 0, "T19 ما دام مستمعٌ واحد باقياً لا يُعلن الرحيل", beacons);
}
Date.now = realNow;

/* ── W) الأسلاك ── */
{
  const server = read("server.ts");
  const pulseRoute = between(server, 'app.get("/api/schedules/pulse"', 'app.post("/api/schedules/pulse"');
  check(/requireAnyPermission\(\[7, 8, 9, 10, 14, 16, 17\]\)/.test(pulseRoute), "W1 النبضة خلف باب البثّ نفسه");
  check(/isScopeAllowed\(req, collegeId, sectionId\)/.test(pulseRoute) && /boardScopeKey\(req, collegeId, sectionId, termId\)/.test(pulseRoute), "W2 وخلف جداره: لا يُدّعى جدولٌ لا يحقّ لصاحبه");
  check(!/await |Repository\./.test(pulseRoute), "W3 والجواب من الذاكرة: لا قراءة قاعدة بيانات لكل نبضة");
  check(/scheduleChangeClock\.bump\(demoSessionId, changedAt\)/.test(server) && /data: \{"changedAt":\$\{changedAt\}\}/.test(server), "W4 البثّ والنبضة يحملان الوقت نفسه للتغيير الواحد");
  const presencePost = between(server, 'app.post("/api/auth/presence"', 'app.get("/api/dashboard"');
  check(/record\.scopeKey = boardScopeKey\(req, collegeId, sectionId, termId\)/.test(presencePost), "W5 علامةُ زائر العرض تبقى في صندوقه ولا تظهر على جدولٍ حقيقي");

  for (const file of ["src/components/NotificationCenter.tsx", "src/components/Reports.tsx", "src/components/InstructorInbox.tsx", "src/components/StudentRegistration.tsx"]) {
    const source = read(file);
    check(!/new EventSource\(/.test(source) && /onLiveSignal\(/.test(source), `W6 ${path.basename(file)} يسمع النبضة ولا يُبقي خيطاً مفتوحاً`);
  }
  const board = read("src/components/Schedules.tsx");
  const stream = between(board, 'if (mode !== "schedule" || !workspaceReady || !pageAwake || !liveShared', "}, [mode, workspaceReady, pageAwake, liveShared]);");
  check(stream.includes("new EventSource("), "W7 الجدول يفتح البثّ حين يكون معه أحد — وحينها فقط");
  check(/presence\.resend\(\);/.test(stream), "W8 وحين يُفتح يُرسل موضعه كاملاً، فالمحرّرُ المفتوح يُرى فوراً");
  check(/setLiveScope\(\{ collegeId: filterCollege, sectionId: filterSection, termId: filterTerm \}\)/.test(board), "W9 والجدول يُخبر النبضة بمكانه");
  check(/changedAt <= lastStreamChange\.current/.test(board), "W10 ونبضةٌ تكرّر ما قاله البثّ لا تُعيد القراءة");
  check(/liveFeed \|\| liveState\.connected \? "on" : ""/.test(board), "W11 النقطةُ الحيّة لا تقول «غير متصل» لمن تحدّثه النبضة");
  const center = read("src/components/NotificationCenter.tsx");
  check(/window\.setInterval\(load, 5 \* 60_000\)/.test(center), "W12 الجرسُ يقرأ احتياطاً كل خمس دقائق لا كل دقيقة");
  const main = read("src/main.tsx");
  check(/window\.setInterval\(\(\) => \{ if \(!document\.hidden\) void checkVersion\(\); \}, 120_000\)/.test(main), "W13 فحصُ الإصدار لا يسأل من لسانٍ مخفيّ");
  const app = read("src/App.tsx");
  check((app.match(/if \(!pageAwake\) return;/g) || []).length >= 3, "W14 شاراتُ الشريط الثلاث تستريح مع اللسان");
  for (const role of ["departmentHead", "dean", "advisor", "standard"]) {
    const verdict = roleWriteDecision({ method: "POST", path: "/schedules/pulse", authenticated: true, powerUser: false, role } as any);
    check(verdict.allowed, `W15 رحيلُ لسانٍ ليس كتابة بيانات: يمرّ لصفة «${role}» للاطّلاع`, verdict);
  }
  check(!roleWriteDecision({ method: "PUT", path: "/schedules/1", authenticated: true, powerUser: false, role: "departmentHead" } as any).allowed, "W16 والاستثناءُ لا يفتح كتابةً على المواعيد");
}

console.log(`\nLive pulse audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
