/**
 * ── «طلب حذف الحساب» من التطبيق ──────────────────────────────────────────────
 * خادمٌ صغيرٌ بالمسارات الحقيقية ومخزنٌ في الذاكرة:
 *  A  بلا جلسة: 401. تجريبيّ: 403 ولا شيءَ يُخزَّن. حسابُ الإدارة الرئيسي: 403.
 *  B  كلمةٌ خاطئة أو ناقصة: 400 ولا طلب، وتُدقَّق المحاولةُ الخاطئة بلا كلمة سر.
 *  C  الصحيحة: طلبٌ معلّق بموعد 30 يوماً، سطرُ تدقيق، تنبيهٌ للمدير، إغلاقُ الجلسات، مسحُ الكوكي.
 *  D  الطلبُ المكرَّر لا يُنشئ ثانياً ولا يكرّر التنبيه.
 *  E  حدُّ المعدّل: السابعةُ في الربع ساعة 429.
 *  F  قائمةُ المدير لمدير النظام وحده؛ والإغلاقُ يُدقَّق، ويُسمح بطلبٍ جديد بعده.
 *  G  لا كلمةَ سرٍّ في المخزن ولا في السجل.
 *  H  الواجهةُ والحُرّاس: الزرُّ يُخفى عن التجريبي والجذر، والمسارُ مفتوحٌ لصفات الاطّلاع ومغلقٌ على عضو الفريق،
 *     والسياسةُ وملاحظاتُ المراجعة تذكر 30 يوماً.
 */
import express from "express";
import type { AddressInfo } from "net";
import fs from "fs";
import { ACCOUNT_DELETION_DAYS, pendingDeletionNotifications, registerAccountDeletionRoutes, type DeletionRequest } from "../src/server/accountDeletion";
import { roleWriteDecision } from "../src/server/roleGuard";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const SECRET = "Correct-Horse-9";
async function world(opts: { demo?: boolean } = {}) {
  const clock = Date.parse("2026-11-15T08:00:00Z");
  const docs = new Map<string, DeletionRequest>();
  const audits: any[] = [], notified: DeletionRequest[] = [], ended: number[] = [];
  const users: any[] = [
    { SystemUserId: 7, Name: "رئيس قسم", SystemUserLogin: "head.one", SystemUserPass: `h:${SECRET}`, Role: "departmentHead" },
    { SystemUserId: 8, Name: "عميد", SystemUserLogin: "dean.one", SystemUserPass: `h:${SECRET}`, Role: "dean" },
    { SystemUserId: 1, Name: "الإدارة", SystemUserLogin: "root", SystemUserPass: `h:${SECRET}`, IsAdminUser: true },
    { SystemUserId: 2, Name: "مدير ثانٍ", SystemUserLogin: "power", SystemUserPass: `h:${SECRET}`, IsAdminUser: true },
  ];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { const id = Number(req.header("x-user") || 0); if (id) (req as any).user = users.find(u => u.SystemUserId === id); next(); });
  registerAccountDeletionRoutes(app, {
    isDemo: () => Boolean(opts.demo), rootAdminId: 1, now: () => clock,
    isPower: req => Boolean((req as any).user?.IsAdminUser),
    getUser: async id => users.find(u => u.SystemUserId === id),
    verify: (p, stored) => stored === `h:${p}`,
    updateDoc: async (id, fn) => { const out = fn(docs.get(id) ?? null); if ("refuse" in out) return { ok: false, result: out.refuse }; docs.set(id, out.next); return { ok: true, result: out.result }; },
    listDocs: async () => [...docs.values()],
    audit: async e => { audits.push(e); },
    endSessions: async id => { ended.push(id); },
    notifyAdmins: async r => { notified.push(r); },
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, user: number | null, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(user ? { "x-user": String(user) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) as any, cookie: res.headers.get("set-cookie") || "" };
  };
  return { docs, audits, notified, ended, call, close: () => server.close(), clock };
}

async function main() {
  const w = await world();
  const post = (user: number | null, password?: unknown) => w.call("POST", "/api/account/deletion-request", user, { password });
  check((await post(null, SECRET)).status === 401, "A بلا جلسة: 401");
  check((await post(1, SECRET)).status === 403 && w.docs.size === 0, "A حسابُ الإدارة الرئيسي لا يطلب من هنا");
  const none = await post(7);
  check(none.status === 400 && w.docs.size === 0, "B بلا كلمة سر: 400", none);
  const wrong = await post(7, "nope");
  check(wrong.status === 400 && w.docs.size === 0, "B كلمةٌ خاطئة: 400 ولا طلب", wrong);
  check(w.audits.length === 1 && w.audits[0].action === "account-deletion-refused" && !JSON.stringify(w.audits).includes("nope"), "B المحاولةُ الخاطئة تُدقَّق بلا كلمة", w.audits);

  const ok = await post(7, SECRET);
  const stored = [...w.docs.values()][0];
  check(ok.status === 200 && ok.body.created === true && /30 يوماً/.test(ok.body.message), "C نجاحٌ ورسالةٌ تذكر 30 يوماً", ok.body);
  check(stored?.status === "pending" && stored.userId === 7 && Date.parse(stored.dueBy) - Date.parse(stored.requestedAt) === ACCOUNT_DELETION_DAYS * 86_400_000, "C طلبٌ معلّق بموعد 30 يوماً", stored);
  check(w.audits.some(a => a.action === "account-deletion-request" && a.userId === 7), "C سطرُ تدقيق");
  check(w.notified.length === 1 && w.ended.join() === "7", "C تنبيهُ المدير وإغلاقُ الجلسات");
  check(/session_id=;.*Max-Age=0/.test(ok.cookie), "C مسحُ الكوكي", ok.cookie);
  const again = await post(7, SECRET);
  check(again.status === 200 && again.body.created === false && w.docs.size === 1 && w.notified.length === 1, "D المكرَّر لا يُنشئ ولا يكرّر التنبيه", again.body);
  check(!JSON.stringify([...w.docs.values()]).includes(SECRET) && !JSON.stringify(w.audits).includes(SECRET), "G لا كلمةَ سرٍّ في المخزن ولا السجل");

  check((await post(8, SECRET)).status === 200, "H صفةُ اطّلاع (عميد) تستطيع الطلب عبر الخادم");
  for (let i = 0; i < 6; i++) await post(2, "bad");
  const limited = [await post(2, "bad")];
  check(limited.some(r => r.status === 429), "E حدُّ المعدّل بعد ست محاولات", limited.map(r => r.status));

  check((await w.call("GET", "/api/admin/account-deletion-requests", 7)).status === 403, "F القائمةُ ممنوعةٌ على غير المدير");
  const list = await w.call("GET", "/api/admin/account-deletion-requests", 1);
  check(list.status === 200 && list.body.length === 2 && list.body.every((r: any) => r.status === "pending"), "F القائمةُ للمدير", list.body);
  check((await w.call("POST", `/api/admin/account-deletion-requests/${stored.id}/resolve`, 7, {})).status === 403, "F الإغلاقُ ممنوعٌ على غير المدير");
  const resolved = await w.call("POST", `/api/admin/account-deletion-requests/${stored.id}/resolve`, 1, { note: "حُذف" });
  check(resolved.status === 200 && w.docs.get("u7")?.status === "done" && w.audits.some(a => a.action === "account-deletion-resolved"), "F الإغلاقُ يُدقَّق", resolved.body);
  check((await w.call("POST", `/api/admin/account-deletion-requests/${stored.id}/resolve`, 1, {})).status === 409, "F إغلاقٌ ثانٍ 409");
  check(pendingDeletionNotifications([...w.docs.values()], w.clock).length === 1, "F الجرسُ لا يعرض المُغلَق");
  check(pendingDeletionNotifications([{ ...stored, status: "pending" }], Date.parse(stored.dueBy) + 1)[0].tone === "alert", "F المتأخّرُ تنبيهٌ أحمر");
  w.close();

  const demo = await world({ demo: true });
  const d = await demo.call("POST", "/api/account/deletion-request", 7, { password: SECRET });
  check(d.status === 403 && demo.docs.size === 0 && demo.notified.length === 0 && demo.audits.length === 0, "A التجريبيُّ لا يسجّل طلباً حقيقياً", d.body);
  check((await demo.call("GET", "/api/admin/account-deletion-requests", 1)).status === 403, "A قائمةُ المدير مغلقةٌ في التجريبي");
  demo.close();

  const read = (p: string) => fs.readFileSync(p, "utf8");
  check(roleWriteDecision({ method: "POST", path: "/account/deletion-request", authenticated: true, powerUser: false, role: "dean" }).allowed, "H المسارُ مفتوحٌ لصفات الاطّلاع");
  check(/MEMBER_BLOCKED = \[[^\]]*"\/account\/deletion-request"/.test(read("src/server/seatsRoutes.ts")), "H عضوُ الفريق ممنوع");
  const app = read("src/App.tsx");
  check(/!user\.IsDemo && !user\.IsRootAdmin \? \([\s\S]{0,200}setDeletionOpen\(true\)/.test(app), "H الزرُّ مخفيٌّ عن التجريبي والجذر");
  check(/api\/account\/deletion-request/.test(read("src/components/AccountDeletion.tsx")) && /type="password"/.test(read("src/components/AccountDeletion.tsx")), "H الواجهةُ تطلب كلمة السر");
  check(/30 يوماً/.test(read("public/privacy-policy.html")) && /طلب حذف الحساب/.test(read("public/privacy-policy.html")), "H السياسةُ تذكر الطلب و30 يوماً");
  check(/30 يومًا/.test(read("apple-release/review/review-notes.md")) && /30 يومًا/.test(read("apple-release/privacy/privacy.md")), "H ملاحظاتُ المراجعة تذكر 30 يوماً");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
