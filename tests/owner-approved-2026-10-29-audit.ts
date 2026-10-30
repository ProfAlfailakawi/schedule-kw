/**
 * ── إصلاحاتٌ أقرّها المالك (2026-10-29)، وتُحرس هنا ─────────────────────────────
 *
 *  O1 حساباتُ الأقسام والكليات الجديدة: كلمةٌ أولى عشوائية لكل حساب (تُعاد للمسؤول) وعلامةُ
 *     MustChangePassword — لا 12345678 الموحّدة. ومن يدخل بالموحّدة القديمة يُعلَّم، والخادمُ
 *     لا يفتح له غير ‎/auth/*‎ حتى يغيّرها. والرابطُ القصير /i/<login> يحمل الاسم وحده.
 *  O2 «بديل اليوم» لا يُرسل جوّالَ أستاذٍ من خارج حلقة أقسام القارئ (contactViaDepartment).
 *  O3 القسمُ لا يغيّر الرقمَ المدني ولا الاسمَ لسجلّ منتدبٍ مشترك؛ والجوّالُ له.
 *
 * خادمٌ حقيقيّ في وضع التجربة على منفذٍ حرّ (helpers/liveServer)، وفحوصٌ بلا خادم.
 */
import fs from "node:fs";
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { Repository } from "../src/db/repository";
import { provisionCollegeUsers, provisionSectionUsers } from "../src/server/sectionUsers";
import { LEGACY_SHARED_PASSWORD, newPasswordProblem, passwordChangeGate } from "../src/server/accountPassword";
import { validateCivilId } from "../src/utils/civilId";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};

/* ── O1 بلا خادم: الإنشاء بمستودعٍ مزيّف يسجّل ما يُكتب ── */
{
  const users: any[] = [];
  const assigns = new Map<number, any[]>();
  const security = new Map<number, number[]>();
  const fake = {
    getUsers: async () => users,
    getUserAssigns: async (id: number) => assigns.get(id) || [],
    getSecurityByUser: async (id: number) => (security.get(id) || []).map(FormNameId => ({ FormNameId })),
    saveSecurityByUser: async (id: number, forms: number[]) => { security.set(id, forms); },
    saveUserAssigns: async (id: number, rows: any[]) => { assigns.set(id, rows); },
    createUser: async (row: any) => { const user = { ...row, SystemUserId: users.length + 100 }; users.push(user); return user; },
    hashPassword: Repository.hashPassword,
    encryptPasswordForVault: Repository.encryptPasswordForVault,
  };
  const college = { AdCollegeId: 7, AdCollegeCode: "TST", AdCollegeName: "كلية الاختبار" };
  const section = { AdSectionId: 70, AdSectionCode: "11", AdSectionName: "قسم الاختبار" };
  const made = [...await provisionSectionUsers(fake, college, section), ...await provisionCollegeUsers(fake, college)];
  check(made.length === 5 && made.every(row => row.status === "created"), "O1 أُنشئت حساباتُ القسم الثلاثة والكلية الاثنان", made);
  check(users.every(user => !Repository.verifyPassword(LEGACY_SHARED_PASSWORD, user.SystemUserPass)), "O1 لا حسابَ جديد يقبل الكلمة الموحّدة 12345678");
  check(users.every(user => user.MustChangePassword === true), "O1 كلُّ حسابٍ جديد مُعلَّمٌ بتغيير كلمته عند أول دخول");
  check(made.every(row => typeof row.password === "string" && row.password.length >= 10 && Repository.verifyPassword(row.password, users.find(user => user.SystemUserLogin === row.login).SystemUserPass)),
    "O1 الكلمةُ الأولى تُعاد للمسؤول وتطابق الحساب");
  check(new Set(made.map(row => row.password)).size === made.length, "O1 لكل حسابٍ كلمتُه (لا كلمة مشتركة)");
  const again = await provisionSectionUsers(fake, college, section);
  check(again.every(row => row.status === "exists" && !row.password), "O1 إعادةُ الإنشاء لا تمسّ حساباً قائماً ولا تكشف كلمته");
}

/* ── O1 بلا خادم: البوّابة وقواعد الكلمة الجديدة ── */
{
  const run = (user: any, path: string) => {
    let status = 0, body: any = null, passedOn = false;
    const res: any = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; } };
    passwordChangeGate({ user, path } as any, res, () => { passedOn = true; });
    return { status, body, passedOn };
  };
  const flagged = { SystemUserId: 9, MustChangePassword: true };
  const blocked = run(flagged, "/schedules");
  check(!blocked.passedOn && blocked.status === 403 && blocked.body?.code === "password-change-required", "O1 الحسابُ المعلَّم لا يقرأ ‎/api/schedules‎", blocked);
  check(run(flagged, "/users").status === 403 && run(flagged, "/department-delegates/5").status === 403, "O1 ولا يكتب في غيرها");
  check(["/auth/change-password", "/auth/me", "/auth/logout", "/auth/login", "/health"].every(path => run(flagged, path).passedOn), "O1 ويبقى له الدخول والتغيير والخروج");
  check(run({ SystemUserId: 9 }, "/schedules").passedOn && run(undefined, "/schedules").passedOn, "O1 ومن لا علامة عليه لا يُمسّ");
  check(newPasswordProblem("old-pass-1", LEGACY_SHARED_PASSWORD) !== null && newPasswordProblem("old-pass-1", "old-pass-1") !== null && newPasswordProblem("old-pass-1", "short") !== null && newPasswordProblem("old-pass-1", "a-new-pass-2") === null,
    "O1 الكلمة الجديدة: لا الموحّدة، ولا الحالية، ولا القصيرة");

  const server = fs.readFileSync("server.ts", "utf8");
  check(server.indexOf('app.use("/api", passwordChangeGate') > server.indexOf('app.use("/api", authMiddleware'), "O1 البوّابة على ‎/api‎ بعد معرفة الهوية");
  const auth = fs.readFileSync("src/server/routes/authRoutes.ts", "utf8");
  const login = auth.slice(auth.indexOf('app.post("/api/auth/login"'), auth.indexOf('app.post("/api/auth/change-password"'));
  check(/password === LEGACY_SHARED_PASSWORD[\s\S]*MustChangePassword: true/.test(login) && login.indexOf("MustChangePassword: true") < login.indexOf("createSession("),
    "O1 الدخولُ بالكلمة الموحّدة يُعلِّم الحساب قبل فتح الجلسة (لا قفل)");
  const change = auth.slice(auth.indexOf('app.post("/api/auth/change-password"'), auth.indexOf('app.post("/api/auth/logout"'));
  /* الحاليةُ مشروطةٌ إلا لجلسةٍ فُتحت للتوّ بالكلمة الأولى (tests/first-login-password-audit.tsx). */
  const rules = fs.readFileSync("src/server/accountPassword.ts", "utf8");
  check(change.includes("decidePasswordChange(") && rules.includes("verify(current, user.SystemUserPass)") && rules.includes("newPasswordProblem(current, next)") && change.includes("MustChangePassword: false"),
    "O1 التغييرُ يشترط الكلمة الحالية (إلا لجلسة الكلمة الأولى) ويرفع العلامة");
  check(!fs.readFileSync("src/components/AccountInvitation.tsx", "utf8").includes("12345678") && !fs.readFileSync("src/utils/invitationLink.ts", "utf8").includes("12345678"),
    "O1 بطاقةُ الدعوة لا تحمل كلمةً موحّدة");
}

let server: LiveServer | null = null;
try {
  server = await startDemoServer("owner-approved");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(BASE + url, { ...init, redirect: "manual", headers: { cookie, ...(init.body ? { "content-type": "application/json" } : {}) } });
    const text = await response.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* ليس JSON */ }
    return { status: response.status, json, text, location: response.headers.get("location") || "" };
  };
  const asRole = async (role: string) => (await call("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) })).status;

  /* O1 — الرابطُ القصير */
  const invite = await call("/i/Frenchdept");
  const hash = decodeURIComponent(invite.location.split("#invite=")[1] || "");
  check(invite.status === 302 && new URLSearchParams(hash).get("username") === "Frenchdept" && !hash.includes("password") && !invite.location.includes(LEGACY_SHARED_PASSWORD),
    "O1 ‏/i/<login> يملأ الاسم ولا يحمل كلمة سر", invite.location);

  /* رئيس لجنة الجدول: شاشة الجدول (٧) بلا شاشة الأساتذة (٣)، ونطاقُه قسمٌ واحد. */
  check(await asRole("committeeChair") === 200, "O0 التبديل إلى رئيس لجنة الجدول");
  const me = (await call("/api/auth/me")).json || {};
  check(!(me.permissions || []).includes(3) && (me.permissions || []).includes(7) && !me.user?.IsAdminUser, "O0 الصفةُ بلا شاشة الأساتذة ولا إدارة", me.permissions);
  const scopeRow = (me.scopes || []).find((row: any) => Number(row.AdSectionId ?? row.sectionId) > 0) || {};
  const collegeId = Number(scopeRow.AdCollegeId ?? scopeRow.collegeId), sectionId = Number(scopeRow.AdSectionId ?? scopeRow.sectionId);
  check(collegeId > 0 && sectionId > 0, "O0 نطاقُ القسم معروف", me.scopes);

  /* O2 — بديل اليوم */
  const terms: any[] = (await call("/api/terms")).json || [];
  const rows: any[] = [];
  for (const term of terms) {
    const listed = (await call(`/api/schedules?collegeId=${collegeId}&sectionId=${sectionId}&termId=${term.AdTermId}`)).json;
    if (Array.isArray(listed)) rows.push(...listed);
  }
  const dayKeys = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
  const dateFor = (row: any) => {
    for (let offset = 0; offset < 14; offset += 1) {
      const d = new Date(Date.UTC(2026, 9, 25 + offset));
      if (d.getUTCDay() <= 4 && row[dayKeys[d.getUTCDay()]]) return d.toISOString().slice(0, 10);
    }
    return "";
  };
  let chair: any = null, target: any = null, date = "";
  for (const row of rows.filter(item => Number(item.AdInstructorId) > 0 && item.fstarttime).slice(0, 80)) {
    date = dateFor(row);
    if (!date) continue;
    const got = await call(`/api/schedules/${row.id}/substitutes?date=${date}`);
    if (got.status === 200 && (got.json?.candidates || []).some((c: any) => c.contactViaDepartment)) { chair = got.json; target = row; break; }
  }
  check(Boolean(chair && target), "O2 بين مرشّحي بديل اليوم أستاذٌ من خارج أقسام القارئ", { rows: rows.length, terms: terms.length });
  if (chair && target) {
    const outsiders = chair.candidates.filter((c: any) => c.contactViaDepartment);
    check(outsiders.every((c: any) => c.mobile === ""), "O2 جوّالُ من هو خارج الحلقة لا يصل", outsiders);
    check(await asRole("admin") === 200, "O0 التبديل إلى مدير البيئة");
    const admin = (await call(`/api/schedules/${target.id}/substitutes?date=${date}`)).json;
    check(Array.isArray(admin?.candidates) && admin.candidates.every((c: any) => !c.contactViaDepartment), "O2 الإدارةُ ترى المرشّحين كاملين", admin?.candidates?.slice?.(0, 3));
    const withMobile = outsiders.filter((c: any) => (admin?.candidates || []).some((a: any) => a.id === c.id && a.mobile));
    check(withMobile.length > 0, "O2 والرقمُ المحجوب عن القسم موجودٌ فعلاً في السجل (الحجبُ حقيقي)", { outsiders: outsiders.length });
    check(await asRole("committeeChair") === 200, "O0 العودة إلى رئيس لجنة الجدول");
  }

  /* O3 — المنتدب: يُضاف بالرقم المدني ثم يُعدَّل. */
  const civilFrom = (start: number) => {
    for (let n = start; n < start + 100000; n += 1) {
      const head = `28${String(n).padStart(9, "0")}`;
      for (let digit = 0; digit <= 9; digit += 1) if (validateCivilId(head + digit).isValid) return head + digit;
    }
    return "";
  };
  const civil = civilFrom(437100000 + Math.floor(Math.random() * 1000000));
  check(Boolean(civil), "O0 رقمٌ مدنيّ صالح للاختبار");
  const added = await call("/api/department-delegates/instructor", { method: "POST", body: JSON.stringify({ collegeId, sectionId, AdInstructorCivil: civil, AdInstructorName: "منتدب الاختبار الأول", AdInstructorMobile: "55512345" }) });
  const delegateId = Number(added.json?.person?.AdInstructorId || 0);
  check(added.status === 201 && delegateId > 0, "O0 أُضيف منتدبٌ إلى قائمة القسم", { status: added.status, body: added.text.slice(0, 200) });
  if (delegateId) {
    const sameCivil = String(added.json.person.AdInstructorCivil || civil), sameName = String(added.json.person.AdInstructorName || "");
    const put = (body: any) => call(`/api/department-delegates/${delegateId}`, { method: "PUT", body: JSON.stringify({ collegeId, sectionId, ...body }) });
    const renamed = await put({ AdInstructorCivil: sameCivil, AdInstructorName: "اسمٌ آخر تماماً", AdInstructorMobile: "55512345" });
    check(renamed.status === 403, "O3 القسمُ لا يغيّر اسم المنتدب", { status: renamed.status, body: renamed.text.slice(0, 200) });
    const otherCivil = civilFrom(Number(sameCivil.slice(2, 11)) + 1);
    const recivil = await put({ AdInstructorCivil: otherCivil, AdInstructorName: sameName, AdInstructorMobile: "55512345" });
    check(Boolean(otherCivil) && recivil.status === 403, "O3 ولا رقمه المدني", { status: recivil.status, body: recivil.text.slice(0, 200) });
    const mobile = await put({ AdInstructorCivil: sameCivil, AdInstructorName: sameName, AdInstructorMobile: "55598765" });
    check(mobile.status === 200 && String(mobile.json?.AdInstructorMobile || "").includes("55598765") && mobile.json?.AdInstructorName === sameName,
      "O3 والجوّالُ يعدّله القسم", { status: mobile.status, body: mobile.text.slice(0, 200) });
    check(await asRole("admin") === 200, "O0 التبديل إلى مدير البيئة");
    const adminRename = await put({ AdInstructorCivil: sameCivil, AdInstructorName: "منتدب الاختبار المصحَّح", AdInstructorMobile: "55598765" });
    check(adminRename.status === 200 && adminRename.json?.AdInstructorName === "منتدب الاختبار المصحَّح", "O3 والإدارةُ تصحّح الاسم", { status: adminRename.status, body: adminRename.text.slice(0, 200) });
  }
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ تعذّر الاختبار الحيّ\x1b[0m", error);
} finally {
  await server?.stop();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
