/**
 * ── «نسيت كلمة السر؟» لكل الموظفين (ملاحظة المالك 6) ────────────────────────────
 *
 * خادمٌ صغير بالمسارات الحقيقية ومخزنٌ في الذاكرة (لا قاعدة ولا منفذ 3000):
 *  N  جوابٌ واحدٌ محايد: اسمٌ غير موجود = أرقامٌ خاطئة = حسابُ إدارة = بلا رقمٍ مدني = موقوف.
 *  L  خمسُ محاولاتٍ خاطئة تُقفل الاسم مدّةً — والاسمُ غيرُ الموجود يُقفل كالموجود؛ والقفلُ يتضاعف.
 *  R  حدٌّ لكل عنوان، وحدٌّ لكل اسمٍ في الساعة.
 *  K  التحقق لا يغيّر شيئاً: الكلمةُ القديمة تعمل حتى تُحفظ الجديدة؛ ثم تسقط وتُغلق الجلسات.
 *  T  التذكرةُ لمرةٍ واحدة، وتسقط بمضيّ عشر دقائق أو بتغيّر الكلمة.
 *  H  استعادةُ حساب رئيس تُشعر مدير النظام؛ والمستخدمُ العادي لا يوقظه.
 *  A  سجلُّ تدقيقٍ لكل محاولة، بلا الأرقام ولا الكلمة.
 *  P  حسابُ الإدارة مستثنى ولو صحّت أرقامه.
 */
import express from "express";
import type { AddressInfo } from "net";
import { createHash, randomBytes } from "crypto";
import fs from "fs";
import {
  RECOVERY_NEUTRAL, RECOVERY_TICKET_MS, guardAfterFailure, emptyGuard, RECOVERY_BASE_LOCK_MS, RECOVERY_MAX_LOCK_MS,
  recoveryNotifications, registerStaffRecoveryRoutes, type RecoveryAccount, type RecoveryEvent,
} from "../src/server/staffRecovery";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const hash = (value: string) => `h:${createHash("sha256").update(value).digest("hex")}`;
const word = () => randomBytes(9).toString("base64url");

function world() {
  let clock = Date.parse("2026-11-13T08:00:00Z");
  const docs = new Map<string, any>();
  const audits: any[] = [];
  const notified: RecoveryEvent[] = [];
  const ended: number[] = [];
  const passwordWrites: number[] = [];
  let retries = 0;
  const headPass = word(), staffPass = word(), adminPass = word(), bareSecret = word();
  const users: RecoveryAccount[] = [
    { SystemUserId: 10, Name: "رئيس قسم الرياضيات", SystemUserLogin: "math.head", SystemUserPass: hash(headPass), IsActive: true, IsLocked: false, Role: "departmentHead", AdInstructorId: 501 },
    { SystemUserId: 11, Name: "منسق", SystemUserLogin: "staff.one", SystemUserPass: hash(staffPass), IsActive: true, IsLocked: false, Role: "standard", AdInstructorId: 502 },
    { SystemUserId: 12, Name: "مدير النظام", SystemUserLogin: "power", SystemUserPass: hash(adminPass), IsActive: true, IsLocked: false, IsAdminUser: true, AdInstructorId: 503 },
    { SystemUserId: 13, Name: "بلا رقم", SystemUserLogin: "no.civil", SystemUserPass: hash(bareSecret), IsActive: true, IsLocked: false, Role: "committeeChair" },
    { SystemUserId: 14, Name: "موقوف", SystemUserLogin: "frozen", SystemUserPass: hash(word()), IsActive: false, IsLocked: false, AdInstructorId: 504 },
  ];
  const civil: Record<number, string> = { 501: "1234", 502: "5678", 503: "9999", 504: "4444" };
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  registerStaffRecoveryRoutes(app, {
    isDemo: () => false,
    rootAdminId: 1,
    findUser: async login => users.find(user => user.SystemUserLogin === login),
    getUser: async id => users.find(user => user.SystemUserId === id),
    civilTail: async user => civil[Number(user.AdInstructorId || 0)] || "",
    getDoc: async id => docs.get(id) ?? null,
    /* كمعاملة Firestore: تُقرأ اللقطة، ثم لحظةُ انتظار، فإن تغيّرت الوثيقةُ أُعيدت الدالةُ على الجديد (المحاولةُ الأولى تُرمى). */
    updateDoc: async (id, fn) => {
      for (;;) {
        const snap = docs.get(id) ?? null;
        const out: any = fn(snap);
        await new Promise(resolve => setTimeout(resolve, 5));
        if ((docs.get(id) ?? null) !== snap) { retries += 1; continue; }
        if ("refuse" in out) return { ok: false, result: out.refuse };
        docs.set(id, out.next);
        return { ok: true, result: out.result };
      }
    },
    saveDoc: async (id, row) => { docs.set(id, row); },
    hash, vault: () => "", verify: (password, stored) => hash(password) === stored,
    setPassword: async (id, fields) => { passwordWrites.push(id); Object.assign(users.find(user => user.SystemUserId === id)!, fields); },
    endSessions: async id => { ended.push(id); },
    audit: async entry => { audits.push(entry); },
    notifyAdmins: async event => { notified.push(event); },
    now: () => clock,
    minResponseMs: 0,
    ipLimit: 1000,
  });
  return { app, docs, audits, notified, ended, users, headPass, passwordWrites, retries: () => retries, advance: (ms: number) => { clock += ms; }, now: () => clock };
}

async function serve(app: express.Express) {
  const server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown, ip = "10.0.0.1") => {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => ({})) as any };
  };
  return { server, post };
}

async function main() {
  /* ── N · جوابٌ محايد ─────────────────────────────────────────────────── */
  {
    const w = world();
    const { server, post } = await serve(w.app);
    const unknown = await post("/api/auth/recover/verify", { username: "nobody", tail: "1234" });
    const wrong = await post("/api/auth/recover/verify", { username: "math.head", tail: "0000" });
    const power = await post("/api/auth/recover/verify", { username: "power", tail: "9999" }, "10.0.0.2");
    const bare = await post("/api/auth/recover/verify", { username: "no.civil", tail: "1234" }, "10.0.0.3");
    const frozen = await post("/api/auth/recover/verify", { username: "frozen", tail: "4444" }, "10.0.0.4");
    const all = [unknown, wrong, power, bare, frozen];
    check(all.every(r => r.status === 400 && r.json.error === RECOVERY_NEUTRAL && Object.keys(r.json).length === 1), "N الاسمُ المعدوم والأرقامُ الخاطئة والإدارةُ والبلا رقم والموقوف: الجوابُ نفسه", all);
    check(!JSON.stringify(all).includes("ticket"), "N لا تذكرة في أيٍّ منها");
    /* P: الإدارةُ مستثناة ولو صحّت أرقامها */
    check(power.status === 400, "P حسابُ إدارة النظام لا يُستعاد من شاشة الدخول ولو صحّت أرقامه");
    /* A: كلُّ محاولةٍ في السجل، بلا الأرقام */
    check(w.audits.length === 5 && w.audits.every(entry => /تحقق مرفوض/.test(entry.action)), "A كلُّ محاولةٍ مرفوضة في سجل التدقيق", w.audits);
    check(!JSON.stringify(w.audits).match(/1234|0000|9999|4444/), "A السجلُّ لا يحمل الأرقام");
    check(w.audits.some(entry => entry.userId === 0 && entry.name === "nobody"), "A الاسمُ المعدوم يُسجَّل بما كُتب، بلا حساب");
    server.close();
  }

  /* ── L · القفل ───────────────────────────────────────────────────────── */
  {
    const w = world();
    const { server, post } = await serve(w.app);
    for (const login of ["math.head", "ghost.user"]) {
      const answers = [];
      for (let i = 0; i < 5; i++) answers.push(await post("/api/auth/recover/verify", { username: login, tail: "0000" }, `10.1.${i}.1`));
      check(answers.every(r => r.status === 400), `L ${login}: خمسُ خاطئة تُجاب بالمحايد`);
      const sixth = await post("/api/auth/recover/verify", { username: login, tail: login === "math.head" ? "1234" : "0000" }, "10.9.9.9");
      check(sixth.status === 429 && sixth.json.code === "recovery-locked" && !sixth.json.ticket, `L ${login}: السادسةُ مقفلة — حتى بالأرقام الصحيحة`, sixth);
    }
    const lockedKnown = await post("/api/auth/recover/verify", { username: "math.head", tail: "1234" }, "10.8.8.8");
    const lockedGhost = await post("/api/auth/recover/verify", { username: "ghost.user", tail: "1234" }, "10.8.8.9");
    check(lockedKnown.status === lockedGhost.status && lockedKnown.json.error === lockedGhost.json.error, "L الاسمُ المعدوم يُقفل كالموجود (لا تعداد بالقفل)");
    w.advance(RECOVERY_BASE_LOCK_MS + 1000);
    const after = await post("/api/auth/recover/verify", { username: "math.head", tail: "1234" }, "10.7.7.7");
    check(after.status === 200 && typeof after.json.ticket === "string", "L بعد انقضاء المدة يُقبل الصحيح", after);
    const g = guardAfterFailure({ ...emptyGuard("x", 0), failures: 4, lockouts: 1 }, 0);
    check(g.lockedUntil === RECOVERY_BASE_LOCK_MS * 2, "L القفلُ الثاني ضعفُ الأول");
    const g9 = guardAfterFailure({ ...emptyGuard("x", 0), failures: 4, lockouts: 20 }, 0);
    check(g9.lockedUntil === RECOVERY_MAX_LOCK_MS, "L ولا يتجاوز يوماً");
    check(!Array.from(w.docs.keys()).some(key => key.includes("math") || key.includes("ghost")), "L الحارسُ على بصمة الاسم لا على الاسم");
    server.close();
  }

  /* ── R · حدُّ العنوان وحدُّ الاسم ─────────────────────────────────────── */
  {
    const w = world();
    const { server, post } = await serve(w.app);
    let accountLimited = false;
    for (let i = 0; i < 9; i++) {
      const r = await post("/api/auth/recover/verify", { username: "staff.one", tail: "5678" }, `10.2.${i}.1`);
      if (i === 8) accountLimited = r.status === 429;
    }
    check(accountLimited, "R الاسمُ الواحد: ثماني محاولاتٍ في الساعة ثم يُوقف — ولو صحّت");
    server.close();
    const app2 = express(); app2.set("trust proxy", 1); app2.use(express.json());
    /* حدُّ العنوان بقيمته الافتراضية (10 في ربع ساعة) */
    registerStaffRecoveryRoutes(app2, { isDemo: () => false, rootAdminId: 1, findUser: async () => undefined, getUser: async () => undefined, civilTail: async () => "", getDoc: async () => null, updateDoc: async (_id: string, fn: any) => { fn(null); return { ok: true }; }, saveDoc: async () => undefined, hash, vault: () => "", verify: () => false, setPassword: async () => undefined, endSessions: async () => undefined, audit: async () => undefined, notifyAdmins: async () => undefined, minResponseMs: 0 });
    const s2 = await serve(app2);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await s2.post("/api/auth/recover/verify", { username: `u${i}`, tail: "1111" }, "10.3.3.3")).status);
    check(statuses.slice(0, 10).every(code => code === 400) && statuses[10] === 429, "R العنوانُ الواحد: عشرُ محاولاتٍ في ربع ساعة ثم يُوقف", statuses);
    s2.server.close();
  }

  /* ── K / T / H · التذكرة والكلمة الجديدة والإشعار ─────────────────────── */
  {
    const w = world();
    const { server, post } = await serve(w.app);
    const before = w.users[0].SystemUserPass;
    const ok = await post("/api/auth/recover/verify", { username: "math.head", tail: "1234" });
    check(ok.status === 200 && ok.json.ticket && Object.keys(ok.json).sort().join() === "expiresAt,ticket", "K التحققُ الصحيح يعطي تذكرةً وحدها", ok.json);
    check(w.users[0].SystemUserPass === before && !w.ended.length, "K التحققُ لا يغيّر الكلمة ولا يغلق جلسة — القديمةُ تعمل حتى تُحفظ الجديدة");
    check(w.audits.some(entry => /تحقق ناجح/.test(entry.action)), "A التحققُ الناجح في السجل");
    check(!Array.from(w.docs.keys()).some(key => key.includes(ok.json.ticket)), "T التذكرةُ محفوظةٌ ببصمتها لا بنصّها");
    const short = await post("/api/auth/recover/complete", { ticket: ok.json.ticket, newPassword: "short" });
    check(short.status === 400 && w.users[0].SystemUserPass === before, "K كلمةٌ قصيرة تُرفض ولا يتغيّر شيء");
    const same = await post("/api/auth/recover/complete", { ticket: ok.json.ticket, newPassword: w.headPass });
    check(same.status === 400 && /غير السابقة/.test(same.json.error), "K الكلمةُ السابقة نفسها تُرفض", same.json);
    const fresh = word() + "Aa1";
    const done = await post("/api/auth/recover/complete", { ticket: ok.json.ticket, newPassword: fresh });
    check(done.status === 200 && done.json.login === "math.head", "K الكلمةُ الجديدة تُحفظ", done.json);
    check(w.users[0].SystemUserPass === hash(fresh) && w.users[0].SystemUserPass !== before, "K الآن فقط تسقط القديمة");
    check(w.ended.includes(10), "K وتُغلق جلساتُ الحساب كلُّها");
    check((w.users[0] as any).MustChangePassword === false, "K لا يُطلب تغييرٌ آخر بعدها");
    const again = await post("/api/auth/recover/complete", { ticket: ok.json.ticket, newPassword: word() + "Bb2" });
    check(again.status === 400 && again.json.code === "recovery-ticket" && w.users[0].SystemUserPass === hash(fresh), "T التذكرةُ لمرةٍ واحدة");
    check(w.notified.length === 1 && w.notified[0].userId === 10 && w.notified[0].login === "math.head", "H استعادةُ رئيس القسم تُشعر مدير النظام", w.notified);
    check(!JSON.stringify(w.notified).includes(fresh) && !JSON.stringify(w.audits).includes(fresh), "A لا كلمةَ في الإشعار ولا في السجل");
    const bell = recoveryNotifications(w.notified, w.now());
    check(bell.length === 1 && bell[0].tone === "alert" && /رئيس قسم الرياضيات/.test(bell[0].title), "H تظهر في جرس مدير النظام");

    /* المستخدمُ العادي: يُستعاد ولا يوقظ الإدارة */
    const staff = await post("/api/auth/recover/verify", { username: "staff.one", tail: "5678" }, "10.4.4.4");
    await post("/api/auth/recover/complete", { ticket: staff.json.ticket, newPassword: word() + "Cc3" }, "10.4.4.4");
    check(w.notified.length === 1, "H المستخدمُ العادي يُستعاد بلا إشعارٍ للإدارة");

    /* T: تسقط بعد عشر دقائق، وبتغيّر الكلمة */
    const late = await post("/api/auth/recover/verify", { username: "math.head", tail: "1234" }, "10.5.5.5");
    w.advance(RECOVERY_TICKET_MS + 1);
    const expired = await post("/api/auth/recover/complete", { ticket: late.json.ticket, newPassword: word() + "Dd4" }, "10.5.5.5");
    check(expired.status === 400 && expired.json.code === "recovery-ticket", "T تسقط التذكرةُ بعد عشر دقائق");
    const raced = await post("/api/auth/recover/verify", { username: "math.head", tail: "1234" }, "10.6.6.6");
    w.users[0].SystemUserPass = hash(word());
    const stale = await post("/api/auth/recover/complete", { ticket: raced.json.ticket, newPassword: word() + "Ee5" }, "10.6.6.6");
    check(stale.status === 400 && stale.json.code === "recovery-ticket", "T وتسقط إن تغيّرت الكلمة بعدها (أعادها المدير مثلاً)");
    const forged = await post("/api/auth/recover/complete", { ticket: "x".repeat(43), newPassword: word() + "Ff6" }, "10.6.6.7");
    check(forged.status === 400 && forged.json.code === "recovery-ticket", "T تذكرةٌ مزوّرة تُرفض");
    server.close();
  }

  /* ── T · تذكرةٌ واحدة لطلبين متزامنين: معاملةٌ تُعاد لا تُحفظ بها كلمةٌ ثانية ── */
  {
    const w = world();
    const { server, post } = await serve(w.app);
    const ok = await post("/api/auth/recover/verify", { username: "math.head", tail: "1234" });
    const first = word() + "Gg7", second = word() + "Hh8";
    const [a, b] = await Promise.all([
      post("/api/auth/recover/complete", { ticket: ok.json.ticket, newPassword: first }, "10.10.0.1"),
      post("/api/auth/recover/complete", { ticket: ok.json.ticket, newPassword: second }, "10.10.0.2"),
    ]);
    const statuses = [a.status, b.status].sort().join();
    check(statuses === "200,400", "T طلبان متزامنان بالتذكرة نفسها: يُقبل واحدٌ ويُرفض الآخر", [a, b]);
    check(w.retries() > 0, "T المعاملةُ أُعيدت فعلاً (تصادمٌ محاكى)");
    check(w.passwordWrites.length === 1, "T كلمةٌ واحدة تُكتب — الخاسرُ لا يكتب فوق الفائز", w.passwordWrites);
    const winner = a.status === 200 ? first : second;
    check(w.users[0].SystemUserPass === hash(winner), "T الكلمةُ الباقية كلمةُ الطلب المقبول");
    check(w.notified.length === 1, "H إشعارٌ واحد لا اثنان");
    server.close();
  }

  /* ── البيئة التجريبية، والواجهة ─────────────────────────────────────── */
  {
    const app = express(); app.set("trust proxy", 1); app.use(express.json());
    registerStaffRecoveryRoutes(app, { isDemo: () => true } as any);
    const { server, post } = await serve(app);
    const demo = await post("/api/auth/recover/verify", { username: "x", tail: "1234" });
    check(demo.status === 403, "لا استعادة في البيئة التجريبية");
    server.close();
  }
  const login = fs.readFileSync("src/components/Login.tsx", "utf8");
  check(/\/api\/auth\/recover\/verify/.test(login) && /\/api\/auth\/recover\/complete/.test(login), "الواجهة: «نسيت كلمة السر؟» تُجري الخطوتين الحقيقيتين");
  check(!/رئيس الفريق: يعيد مدير النظام تعيين كلمة السر/.test(login), "الواجهة: النصُّ الشارح القديم أُزيل");
  check(/autoComplete="new-password"/.test(login) && /أعد كتابتها/.test(login), "الواجهة: كلمةٌ جديدة مع تأكيدها");
  const server = fs.readFileSync("server.ts", "utf8");
  check(/registerStaffRecoveryRoutes\(app, staffRecoveryDeps\(\)\);/.test(server), "الخادم يسجّل المسارين");
  const wiring = fs.readFileSync("src/server/staffRecoveryWiring.ts", "utf8");
  check(/isPowerUser\(account as any\)/.test(wiring) && /saveFeatureDoc\(COLLECTION, `event_/.test(wiring), "الإشعار: تنبيهٌ لأجهزة الإدارة وأثرٌ في جرسها");
  check(/ledger\?\.holder/.test(wiring) && /AdInstructorCivil/.test(wiring), "الرقمُ المدني لمن يجلس على الحساب الآن");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch(error => { console.error(error); process.exit(1); });
