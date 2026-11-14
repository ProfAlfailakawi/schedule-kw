/**
 * ── مساري: استعادةُ الرمز عبر القسم، وحراسةُ الباب، والتقويم ───────────────────
 *
 * خادمٌ صغيرٌ في العملية نفسها (منفذٌ عشوائيّ، لا 3000) بالمسارات الحقيقية ومستودعٍ محليٍّ في مجلدٍ مؤقت:
 *  A  ملفٌّ أنشأه غيرُ صاحبه برقمه المدني: القسمُ يُصدر رمزاً، فيعود الملفُّ لصاحبه وتسقط جلساتُ المنتحل كلُّها.
 *  B  رمزُ القسم: ستة أرقام، يومٌ واحد، مرةٌ واحدة، والجديدُ يُلغي السابق؛ بصمتُه لا هو؛ النطاقُ والصلاحية؛ حدٌّ لكل موظف.
 *  C  فتحُ الصفحة بجلسةٍ لا يُلغي «نسيت رمزي»؛ الرمزُ وحده يُلغيه («أبقِ ملفّي»، تغييرُ الرمز، الدخول، الاستعادة).
 *  D  أخطاءُ الرمز الحالي في «غيّر الرمز» و«احذف ملفّي» تُعدّ على قفل الملف (٥ ← ١٥ دقيقة).
 *  E  حدُّ الكتابة لكل طالب: الجلسةُ تسبق الرقمَ المدنيَّ في الجسم، فتبديلُه لا يصنع حدّاً جديداً.
 *  F  التذكيرُ بجلسةٍ ونوعين معروفين؛ واشتراكُ «جدولي المقترح» برابطٍ ثابتٍ مختوم يسقط بتغيير الرمز أو الحذف.
 */
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { StudentProfile } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

const DAY = 86_400_000;
const W = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const civilFrom = (seed: number) => {
  for (let n = seed; ; n += 1) {
    const body = "2990101" + String(n).padStart(4, "0");
    const sum = body.split("").reduce((s, d, i) => s + Number(d) * W[i], 0);
    const c = 11 - (sum % 11);
    if (c <= 9) return body.slice(0, 11) + c;
  }
};
const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/* ── المستودع: محليٌّ في مجلدٍ مؤقت ── */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-recovery-"));
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  users: [], formNames: [], formSecurity: [], collegeUserAssign: [], studentProfiles: [], studentNeeds: [], rooms: [], instructors: [],
  terms: [{ AdTermId: 1, AdTermName: "الفصل الثاني 2026/2027", AdTermStart: add(today, 40), AdTermWeeks: 15, AdTermClosed: false, AdTermSubmissionDeadline: add(today, -8),
    AdTermStudentPhases: { wishesOpen: add(today, -3), wishesClose: add(today, 10), rounds: [{ id: "r1", name: "مبكر", start: add(today, 16), end: add(today, 22) }], requestsClose: add(today, 60) } }],
  colleges: [{ AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية التربية الأساسية — بنين" }],
  sections: [{ AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: "قسم التربية الإسلامية" }, { AdSectionId: 12, AdCollegeId: 1, AdSectionCode: "ARB", AdSectionName: "قسم اللغة العربية" }],
  courses: [{ AdCourseId: 101, AdCollegeId: 1, AdSectionId: 11, CourseCode: "ISL101", CourseName: "أصول التربية، مدخل", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 }],
  curriculumPlans: [], curriculumPlanCourses: [], courseTransitions: [],
  schedules: [{ id: 1, AdCollegeId: 1, AdSectionId: 11, AdTermId: 1, AdCourseId: 101, AdCourseName: "أصول التربية، مدخل", SCode: "501", AdInstructorId: 1,
    fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false, fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "A", AdRoomHall: "1" }],
  scheduleApprovals: [{ id: "a1", AdCollegeId: 1, AdSectionId: 11, AdTermId: 1, status: "head" }],
}), { mode: 0o600 });
process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase();
console.warn = quiet;
const { registerStudentDoorRoutes } = await import("../src/server/studentDoorRoutes");
const { registerStudentRecoveryRoutes, RECOVERY_TTL_MS, RECOVERY_ISSUES_PER_HOUR } = await import("../src/server/studentRecovery");
const { issuerOf } = await import("../src/server/studentRecoveryWiring");

/* ── الخادم: المساراتُ الحقيقية، ومفاتيحُ ثابتة، وموظفٌ يُختار برأس الطلب ── */
const KEY = Buffer.from("r".repeat(32));
const fingerprintOf = async (civil: string) => createHmac("sha256", "fp-secret").update(`need|${civil}`).digest("hex").slice(0, 32);
const seal = async (value: string) => `sealed:${Buffer.from(value).toString("base64url")}`;
const unseal = async (cipher?: string) => (cipher && cipher.startsWith("sealed:") ? Buffer.from(cipher.slice(7), "base64url").toString() : "");
let clock = Date.now();
const STAFF: Record<string, { user: any; permissions: number[]; scopes: Array<{ AdCollegeId: number; AdSectionId: number }> }> = {
  isl: { user: { SystemUserId: 41, Name: "موظف قسم الإسلامية", Role: "advisor" }, permissions: [14], scopes: [{ AdCollegeId: 1, AdSectionId: 11 }] },
  arb: { user: { SystemUserId: 42, Name: "موظف قسم العربية", Role: "committeeChair" }, permissions: [7], scopes: [{ AdCollegeId: 1, AdSectionId: 12 }] },
  admin: { user: { SystemUserId: 1, Name: "مدير النظام", IsAdminUser: true }, permissions: [], scopes: [] },
  dean: { user: { SystemUserId: 43, Name: "العميد", Role: "dean" }, permissions: [7, 14], scopes: [{ AdCollegeId: 1, AdSectionId: 11 }] },
  none: { user: { SystemUserId: 44, Name: "بلا صلاحية", Role: "standard" }, permissions: [8], scopes: [{ AdCollegeId: 1, AdSectionId: 11 }] },
  busy: { user: { SystemUserId: 45, Name: "موظف كثير الإصدار", Role: "advisor" }, permissions: [14], scopes: [{ AdCollegeId: 1, AdSectionId: 11 }] },
};
const app = express();
app.use(express.json());
app.use((req, _res, next) => { const who = STAFF[String(req.headers["x-staff"] || "")]; if (who) Object.assign(req, who); next(); });
registerStudentRecoveryRoutes(app, {
  issuer: issuerOf, fingerprint: fingerprintOf, identityKey: async () => KEY,
  getProfile: fp => Repository.getStudentProfile(fp), updateProfile: (fp, fn) => Repository.updateStudentProfile(fp, fn),
  openIdentity: unseal, sectionName: async id => (id === 11 ? "قسم التربية الإسلامية" : "قسم اللغة العربية"), now: () => clock,
});
registerStudentDoorRoutes(app, { surveyFingerprint: fingerprintOf, sealIdentity: seal, openIdentity: unseal, identityKey: async () => KEY, isProduction: () => false });
const server = app.listen(0);
await new Promise(resolve => server.once("listening", resolve));
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

type Res = { status: number; json: any; text: string; cookies: string[]; headers: Headers };
async function http(method: string, url: string, body?: unknown, cookie = "", headers: Record<string, string> = {}): Promise<Res> {
  const res = await fetch(BASE + url, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  return { status: res.status, json, text, cookies: (res.headers as any).getSetCookie?.() || [], headers: res.headers };
}
const cookieOf = (r: Res) => (r.cookies.find(c => c.startsWith("sh_session=")) || "").split(";")[0];
const issue = (civil: string, staff = "isl") => http("POST", "/api/student-recovery/code", { civil }, "", { "x-staff": staff });
const create = async (civil: string, code: string, name = "طالب تجريبي ثلاثي") => http("POST", "/api/public/me/enter", { civil, code, create: true, agree: true, name, remember: true });
const profileOf = async (civil: string) => (await Repository.getStudentProfile(await fingerprintOf(civil))) as StudentProfile;

try {
  /* ── A + B: المنتحلُ أولاً، ثم صاحبُ الرقم يستعيد ملفّه من قسمه ── */
  {
    const V = civilFrom(1);
    const made = await create(V, "135790", "منتحل باسم آخر");
    check(made.status === 201, "A المنتحل ينشئ الملفَّ برقمٍ مدنيٍّ ليس له", made.json);
    const impostor1 = cookieOf(made);
    const impostor2 = cookieOf(await http("POST", "/api/public/me/enter", { civil: V, code: "135790", remember: true }));
    check(Boolean(impostor1 && impostor2), "A وله جلستان (جهازان)");
    const who = await http("POST", "/api/public/me/identity", { civil: V });
    check(who.json.exists === true && who.json.since === String((await profileOf(V)).createdAt).slice(0, 10), "A صاحبُ الرقم يرى تاريخَ إنشاء ملفٍّ لم يُنشئه (يومٌ لا ساعة)", who.json);
    check((await http("POST", "/api/public/me/recover", { civil: V, recovery: "123456", code: "482615" })).json.code === "no-recovery", "B بلا رمزٍ من القسم: لا استعادة");
    await Repository.updateStudentProfile(await fingerprintOf(V), current => (current ? { ...current, AdCollegeId: 1, AdSectionId: 11 } : undefined));

    check((await issue(V, "arb")).json.code === "out-of-scope", "B موظفُ قسمٍ آخر لا يُصدر رمزاً لملفٍّ خارج نطاقه");
    check((await issue(V, "dean")).status === 403 && (await issue(V, "none")).status === 403 && (await http("POST", "/api/student-recovery/code", { civil: V })).status === 401, "B صفةُ العرض الصرف ومن بلا إذن كشف التسجيل والزائرُ بلا حساب: مرفوضون");
    check((await issue("123456789012")).json.code === "bad-civil" && (await issue(civilFrom(900))).json.code === "no-profile", "B رقمٌ غير صحيح، ورقمٌ بلا ملف");

    const first = await issue(V);
    check(first.status === 200 && /^\d{6}$/.test(first.json.code) && first.json.replaced === false, "B موظفُ قسمه يُصدر رمزاً من ستة أرقام", first.json);
    check(first.json.civilMasked === `•••••••••${V.slice(-3)}` && !first.text.includes(V) && first.json.name === "منتحل باسم آخر" && first.json.sectionName === "قسم التربية الإسلامية", "B الموظفُ يرى آخرَ ثلاثة أرقام والاسمَ المحفوظ (ليطابقه بالبطاقة) لا الرقمَ كاملاً");
    check(Math.abs(Date.parse(first.json.expiresAt) - clock - RECOVERY_TTL_MS) < 2000, "B صالحٌ يوماً واحداً");
    const stored = await profileOf(V);
    check(Boolean(stored.recovery?.hash) && !JSON.stringify(stored).includes(`"${first.json.code}"`) && stored.recovery?.issuedById === 41 && stored.recovery?.issuedByName === "موظف قسم الإسلامية", "B يُحفظ بصمةُ الرمز ومن أصدره، لا الرمزُ نفسُه", stored.recovery);
    const second = await issue(V, "admin");
    check(second.status === 200 && second.json.replaced === true && second.json.code !== undefined, "B مديرُ النظام يُصدر لكل قسم، والجديدُ يُلغي السابق");
    check((await profileOf(V)).recoveryLog?.length === 2, "B سجلُّ الإصدار على الملف: من ومتى");
    const old = await http("POST", "/api/public/me/recover", { civil: V, recovery: first.json.code === second.json.code ? "000000" : first.json.code, code: "482615" });
    check(old.status === 401 && old.json.code === "bad-recovery" && old.json.attemptsLeft === 4, "B الرمزُ السابق سقط، وخطؤه يُعدّ", old.json);
    check((await profileOf(V)).codeFailures?.count === 1, "B خطأُ رمز القسم يُعدّ على قفل الملف نفسه");
    check((await http("POST", "/api/public/me/recover", { civil: V, recovery: second.json.code, code: "111111" })).json.code === "weak-code", "B الرمزُ الشخصيُّ الجديد يُفحص كالإنشاء");

    /* وطلبُ حذفٍ معلَّق (مثلاً طلبه صاحبُه قبل أن يذهب إلى قسمه) */
    await http("POST", "/api/public/me/reset", { civil: V });
    check((await profileOf(V)).resetRequestedAt, "A طلبُ حذفٍ معلَّق قبل الاستعادة");
    const back = await http("POST", "/api/public/me/recover", { civil: V, recovery: second.json.code, code: "482615", remember: true });
    check(back.status === 200 && Boolean(cookieOf(back)) && back.json.profile, "A برمز القسم ورمزٍ جديد يدخل صاحبُ الرقم ملفَّه", back.json);
    const owner = cookieOf(back);
    check((await http("GET", "/api/public/me/profile", undefined, impostor1)).status === 401 && (await http("GET", "/api/public/me/profile", undefined, impostor2)).status === 401, "A كلُّ جلسات المنتحل سقطت (نسخةُ الرمز تغيّرت)");
    check((await http("GET", "/api/public/me/profile", undefined, owner)).status === 200, "A وجلسةُ صاحبه تعمل");
    const after = await profileOf(V);
    check(!after.recovery && !after.resetRequestedAt && after.deleteReason !== "reset" && !after.codeFailures && Boolean(after.recoveryLog?.[1]?.usedAt), "A سقط الرمزُ (مرةٌ واحدة) وطلبُ الحذف وعدّادُ الأخطاء، وسُجّل وقتُ الاستعمال", after);
    check((await http("POST", "/api/public/me/recover", { civil: V, recovery: second.json.code, code: "864209" })).json.code === "no-recovery", "B الرمزُ لا يُستعمل مرتين");
    check((await http("POST", "/api/public/me/enter", { civil: V, code: "135790" })).status === 401 && (await http("POST", "/api/public/me/enter", { civil: V, code: "482615" })).status === 200, "A رمزُ المنتحل لا يفتح، والجديدُ يفتح");

    /* رمزٌ يُخطأ فيه خمساً يسقط؛ ورمزٌ مضى يومُه لا يصلح */
    const third = await issue(V);
    let last: Res | null = null;
    for (let i = 0; i < 5; i += 1) last = await http("POST", "/api/public/me/recover", { civil: V, recovery: third.json.code === "000000" ? "111111" : "000000", code: "864209" });
    check(last?.json.code === "recovery-void" && !(await profileOf(V)).recovery, "B خمسةُ أخطاءٍ تُسقط رمزَ القسم فيُطلب غيرُه", last?.json);
    check((await http("POST", "/api/public/me/recover", { civil: V, recovery: third.json.code, code: "864209" })).status === 423, "B والملفُّ مقفولٌ ربع ساعة (القفلُ نفسُه في الدخول)");
    await Repository.updateStudentProfile(await fingerprintOf(V), current => (current ? { ...current, codeFailures: undefined } : undefined));
    clock = Date.now() - RECOVERY_TTL_MS - 60_000;
    const stale = await issue(V);
    clock = Date.now();
    check((await http("POST", "/api/public/me/recover", { civil: V, recovery: stale.json.code, code: "864209" })).json.code === "no-recovery", "B رمزٌ مضى يومُه لا يصلح");

    for (let i = 0; i < RECOVERY_ISSUES_PER_HOUR; i += 1) await issue(V, "busy");
    check((await issue(V, "busy")).status === 429 && (await issue(V, "isl")).status === 200, `B حدُّ الإصدار لكل موظف (${RECOVERY_ISSUES_PER_HOUR} في الساعة)، وغيرُه لا يتأثّر`);
    const fresh = civilFrom(2);
    await create(fresh, "246813");
    check((await issue(fresh, "arb")).status === 200, "B ملفٌّ لم يُكمل إعداد قسمه: يُصدر له موظفُ أيّ قسمٍ له الإذن (البطاقةُ أمامه)");
  }

  /* ── C: فتحُ الصفحة لا يُلغي «نسيت رمزي» ── */
  {
    const P = civilFrom(30);
    const session = cookieOf(await create(P, "908172"));
    check((await http("POST", "/api/public/me/reset", { civil: P })).status === 200, "C طلبُ حذف");
    const pendingAt = (await profileOf(P)).deleteAt;
    await Repository.updateStudentProfile(await fingerprintOf(P), current => (current ? { ...current, lastSeenAt: new Date(Date.now() - 3 * DAY).toISOString() } : undefined));
    const state = await http("GET", "/api/public/me/state", undefined, session);
    check(state.json.signedIn === true && state.json.profile?.resetPending === true, "C الجلسةُ تفتح الصفحة، وتُقال لصاحبها: طُلب حذفُ ملفّك", state.json.profile?.resetPending);
    const touched = await profileOf(P);
    check(Boolean(touched.resetRequestedAt) && touched.deleteAt === pendingAt && touched.deleteReason === "reset" && Date.parse(touched.lastSeenAt) > Date.now() - 60_000, "C ولا يُلغى الطلب ولا يُمدّ موعدُه (الحضورُ وحده يُكتب)", touched);
    await http("PUT", "/api/public/me/name", { name: "اسم مصحح للطالب" }, session);
    check((await http("POST", "/api/public/me/identity", { civil: P })).json.resetPending === true, "C ولا يُلغيه حفظٌ بالجلسة");
    check((await http("POST", "/api/public/me/keep", { code: "000000" }, session)).json.code === "bad-code", "C «أبقِ ملفّي» يطلب الرمز");
    const kept = await http("POST", "/api/public/me/keep", { code: "908172" }, session);
    check(kept.status === 200 && kept.json.profile?.resetPending === false && (await http("POST", "/api/public/me/identity", { civil: P })).json.resetPending === false, "C الرمزُ الصحيح يُلغي الطلب");
    check((await profileOf(P)).deleteReason !== "reset", "C ويعود عمرُ الملف العادي");
    await http("POST", "/api/public/me/reset", { civil: P });
    const changed = await http("POST", "/api/public/me/code", { oldCode: "908172", newCode: "864209" }, session);
    check(changed.status === 200 && !(await profileOf(P)).resetRequestedAt, "C تغييرُ الرمز إدخالٌ للرمز: يُلغي الطلبَ أيضاً");
  }

  /* ── D: أخطاءُ الرمز الحالي تُعدّ على قفل الملف ── */
  {
    const D = civilFrom(60);
    const session = cookieOf(await create(D, "357913"));
    const first = await http("POST", "/api/public/me/forget", { code: "000000" }, session);
    check(first.json.code === "bad-code" && first.json.attemptsLeft === 4 && (await profileOf(D)).codeFailures?.count === 1, "D خطأٌ في «احذف ملفّي» يُعدّ على الملف", first.json);
    let last: Res | null = null;
    for (let i = 0; i < 4; i += 1) last = await http("POST", "/api/public/me/code", { oldCode: "000000", newCode: "864209" }, session);
    check(last?.json.code === "locked" && (await profileOf(D)).codeFailures?.lockedUntil, "D والخامسُ في «غيّر الرمز» يقفل الملف", last?.json);
    const blocked = await http("POST", "/api/public/me/code", { oldCode: "357913", newCode: "864209" }, session);
    check(blocked.status === 423 && blocked.json.retryInSeconds > 0, "D والرمزُ الصحيح بعده لا يمرّ: ٤٢٣", blocked.json);
    check((await http("POST", "/api/public/me/forget", { code: "357913" }, session)).status === 423 && (await http("POST", "/api/public/me/enter", { civil: D, code: "357913" })).status === 423, "D القفلُ واحدٌ في الحذف والدخول");
    check(Boolean(await profileOf(D)), "D والملفُّ باقٍ");
  }

  /* ── F: التذكيرُ بجلسةٍ ونوعين، واشتراكُ «جدولي المقترح» ── */
  {
    const S = civilFrom(80);
    let session = cookieOf(await create(S, "591357"));
    check((await http("GET", "/api/public/me/reminder?kind=next")).status === 401, "F التذكيرُ يحتاج جلسة");
    check((await http("GET", "/api/public/me/reminder?kind=anything", undefined, session)).json.code === "bad-kind", "F نوعٌ غير معروف: ٤٠٠");
    const next = await http("GET", "/api/public/me/reminder?kind=next&t=" + encodeURIComponent("خبرٌ مزوّر") + "&d=2030-01-01", undefined, session);
    check(next.status === 200 && /text\/calendar/.test(next.headers.get("content-type") || "") && next.headers.get("cache-control") === "no-store", "F ملفُّ تقويمٍ بلا تخزين", next.status);
    check(!next.text.includes("خبرٌ مزوّر") && next.text.includes("الفصل الثاني 2026/2027") && next.text.includes(`DTSTART;VALUE=DATE:${add(today, 10).replace(/-/g, "")}`), "F العنوانُ والتاريخ من الخادم (المحطةُ القادمة)، وما في الرابط يُهمل", next.text.slice(0, 400));
    check(next.text.includes("TRIGGER:-PT15H") && next.text.includes("TRIGGER:PT8H"), "F التنبيهان: ٩ صباح الأمس و٨ صباح اليوم");
    check((await http("GET", "/api/public/me/reminder?kind=round", undefined, session)).json.code === "no-date", "F لا جدولَ مقترحاً بعد: لا تذكيرَ بدور");

    const link = await http("GET", "/api/public/me/calendar", undefined, session);
    const feedPath = new URL(link.json.https).pathname;
    const fp = await fingerprintOf(S);
    check(link.status === 200 && /^\/api\/public\/me\/cal\/[A-Za-z0-9_-]{40,}\.ics$/.test(feedPath) && link.json.apple.startsWith("webcal://") && link.json.google.includes("calendar.google.com") && link.json.outlook.includes("outlook.live.com"), "F رابطُ الاشتراك: webcal لآيفون، وجوجل وأوتلوك", link.json);
    check(!link.text.includes(fp) && !link.text.includes(S), "F لا رقمَ مدنياً ولا بصمةَ مكشوفة في الرابط");
    check((await http("GET", "/api/public/me/calendar", undefined, session)).json.https === link.json.https, "F الرابطُ ثابت");
    const empty = await http("GET", feedPath);
    check(empty.status === 200 && empty.text.startsWith("BEGIN:VCALENDAR\r\n") && empty.text.includes("TZID:Asia/Kuwait") && !empty.text.includes("BEGIN:VEVENT") && empty.text.includes("X-WR-CALNAME:جدولي المقترح — مساري"), "F بلا كوكي، وقبل الجدول المقترح: تقويمٌ صالحٌ فارغ باسمه", empty.text.slice(0, 300));
    const tag = empty.headers.get("etag") || "";
    check(Boolean(tag) && (await http("GET", feedPath, undefined, "", { "if-none-match": tag })).status === 304, "F ETag و٣٠٤ كتقويم الأستاذ");

    /* جدولٌ مقترح: تذكرةٌ من الرادار بشعبةٍ وقّع قسمُها جدولَها */
    await Repository.updateStudentProfile(fp, current => (current ? { ...current, AdCollegeId: 1, AdSectionId: 11 } : undefined));
    await Repository.saveRegistrationRun({ id: "1", termId: 1, runId: "run-1", ranAt: new Date().toISOString(), ranBy: "اختبار", students: 1, withoutRules: 0, defaulted: 0, rounds: 1, windows: [1] } as any,
      [{ id: `1_${fp}`, termId: 1, runId: "run-1", fp, planId: "", window: 1, remainingUnits: 3, defaulted: false, plans: [{ label: "A", units: 3, items: [{ courseId: 101, offeringId: "1|1|11|101|501", tight: false }] }], unmet: [] }]);
    const full = await http("GET", feedPath);
    const unfold = full.text.replace(/\r\n[ \t]/g, "");
    check(full.status === 200 && (unfold.match(/BEGIN:VEVENT/g) || []).length === 1 && unfold.includes("SUMMARY:ISL101 · أصول التربية، مدخل") && unfold.includes("DESCRIPTION:الرمز: ISL101\\nالشعبة: 501"), "F يتحدّث وحده: الجدولُ المقترح يظهر في الاشتراك نفسه", unfold.slice(0, 900));
    check(/DTSTART;TZID=Asia\/Kuwait:\d{8}T080000/.test(unfold) && /RRULE:FREQ=WEEKLY;UNTIL=\d{8}T235959Z;BYDAY=SU,TU/.test(unfold), "F بتوقيت الكويت، أسبوعياً حتى نهاية الفصل");
    check(full.headers.get("etag") !== tag, "F ووسمٌ جديد فيُعاد التحميل");
    const round = await http("GET", "/api/public/me/reminder?kind=round", undefined, session);
    check(round.status === 200 && round.text.includes("SUMMARY:موعد تسجيلي — دور 1 من 1") && round.text.includes(`DTSTART;VALUE=DATE:${add(today, 16).replace(/-/g, "")}`), "F تذكيرُ دور التسجيل من التذكرة", round.text.slice(0, 300));

    const tampered = feedPath.replace(/([A-Za-z0-9_-])\.ics$/, (_m, c) => `${c === "A" ? "B" : "A"}.ics`);
    check((await http("GET", tampered)).status === 404 && (await http("GET", "/api/public/me/cal/short.ics")).status === 404, "F مفتاحٌ معبوثٌ به: ٤٠٤");
    const rotated = await http("POST", "/api/public/me/code", { oldCode: "591357", newCode: "864213" }, session);
    session = cookieOf(rotated);
    check((await http("GET", feedPath)).status === 404, "F تغييرُ الرمز يُبطل الرابطَ القديم");
    const nextLink = new URL((await http("GET", "/api/public/me/calendar", undefined, session)).json.https).pathname;
    check(nextLink !== feedPath && (await http("GET", nextLink)).status === 200, "F ورابطٌ جديدٌ يعمل");
    await http("POST", "/api/public/me/forget", { code: "864213" }, session);
    check((await http("GET", nextLink)).status === 404, "F حذفُ الملف يُبطله");
  }

  /* ── E: حدُّ الكتابة لكل طالب لا يُتجاوز بتبديل الرقم المدني في الجسم (آخراً: يستنفد حدَّ هذه الجلسة) ── */
  {
    const E = civilFrom(120), other = civilFrom(140);
    const session = cookieOf(await create(E, "713579"));
    const otherSession = cookieOf(await create(other, "713579"));
    let limited = 0;
    for (let i = 0; i < 64; i += 1) {
      const r = await http("POST", "/api/public/me/reset", { civil: civilFrom(2000 + i * 3) }, session);
      if (r.status === 429) limited += 1;
    }
    check(limited >= 3, "E بجلسةٍ: تبديلُ الرقم المدني في كل طلب لا يصنع حدّاً جديداً (٦٠ في الدقيقة للطالب)", limited);
    check((await http("PUT", "/api/public/me/name", { name: "طالب آخر ثلاثي" }, otherSession)).status === 200, "E وطالبٌ آخر من العنوان نفسه لا يتأثّر");
    let anon = 0;
    for (let i = 0; i < 64; i += 1) if ((await http("POST", "/api/public/me/reset", { civil: civilFrom(5000 + i * 3) })).status === 429) anon += 1;
    check(anon === 0, "E وبلا جلسة يبقى الحدُّ لكل رقمٍ مدني وسقفُ العنوان (لا يتغيّر للقادمين الجدد)");
  }
} catch (error) {
  check(false, `خطأ غير متوقع: ${error instanceof Error ? error.stack : error}`);
} finally {
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
