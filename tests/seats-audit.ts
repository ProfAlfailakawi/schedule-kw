/**
 * ── الكراسي: الكرسي ثابت والشخص يتبدّل (docs/SEATS.md) ─────────────────────────
 *
 *  S1  بلا خادم: من في الجلسة، والاسمُ الذي يُكتب، والتسليمُ يجمّد الفريق، والنائبُ ينتهي بتاريخه.
 *  S2  بلا خادم: صفاتُ التسجيل — المسجّلُ العام يضع الموعد ويمدّد، ورئيسُ تسجيل الكلية يمدّد فقط.
 *  S3  بلا خادم: حارسُ العضو — يعمل، ولا يوقّع، ولا يدير، ولا يغيّر كلمة السر؛ والنائبُ يوقّع.
 *  S4  خادمٌ حيّ (تجربة): مدير النظام يسجّل الشاغل، فيصل اسمُه الجلسةَ والسجلّ.
 *  S5  الشاغلُ يضيف عضواً من أساتذة القسم، والعضوُ يدخل برابطه وآخر أربعة أرقام، ويعمل باسمه ولا يوقّع.
 *  S6  التسليم: كلمةٌ أولى، وتغييرٌ إجباري، والفريقُ يُجمَّد ورابطُه لا يفتح، ثم «مستمر» يعيده برابطه نفسه.
 *  S7  مكتب التسجيل: موظفٌ بنطاقٍ محدد يعمل بصفة «موظف التسجيل» وفي نطاقه وحده؛ ولا نطاقَ أوسع من الكرسي.
 *  S8  رئيسُ تسجيل الكلية يمدّد لكليته ولا يضع موعد الفصل.
 *  S9  الحرم: كرسيٌّ واحد لبنين وبنات والفحيحيل؛ الموظف بكليةٍ وقسمٍ من أيّها؛ ورفعُ حرمٍ يُسقطه من نطاق الموظف.
 */
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { activeDeputy, civilTailOf, handOverLedger, resolveSeatActor, scopeWithin, seatActorDisplayName, seatActorRole, whatsappNumber, emptySeatLedger, type SeatLedger } from "../src/utils/seats";
import { canExtendDeadline, canManageDeadline, canReviewSubmissions, roleDefinition } from "../src/utils/academicRoles";
import { inboxAudience } from "../src/utils/inboxAudience";
import { seatMemberGuard } from "../src/server/seatsRoutes";
import { campusFamilies, campusFamilyName } from "../src/utils/campusFamily";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

/* ── S1 ── */
{
  const seat = { Name: "رئيس لجنة الجدول — قسم الاختبار", Role: "committeeChair", AdInstructorId: 0 };
  const ledger: SeatLedger = {
    ...emptySeatLedger(16),
    holder: { name: "د. منى", instructorId: 5, since: "2026-01-01", by: "مدير النظام" },
    members: [
      { id: "m1", name: "سارة", instructorId: 6, status: "active", addedAt: "", addedBy: "" },
      { id: "m2", name: "خالد", instructorId: 7, status: "ended", addedAt: "", addedBy: "" },
    ],
  };
  check(resolveSeatActor(seat, emptySeatLedger(16), undefined) === undefined, "S1 كرسيٌّ بلا شاغلٍ مسجّل يبقى كما هو (لا يتغيّر شيءٌ يوم النشر)");
  const holder = resolveSeatActor(seat, ledger, undefined)!;
  check(holder?.kind === "holder" && seatActorDisplayName(holder) === "رئيس لجنة الجدول — قسم الاختبار · د. منى", "S1 جلسةُ الشاغل تحمل اسمه بعد اسم الكرسي", holder);
  const member = resolveSeatActor(seat, ledger, "m1")!;
  check(member?.kind === "member" && seatActorDisplayName(member).endsWith("· سارة") && seatActorRole(member) === "committeeChair", "S1 عضو اللجنة يعمل بصفة الكرسي وباسمه هو", member);
  check(resolveSeatActor(seat, ledger, "m2") === null && resolveSeatActor(seat, ledger, "ghost") === null, "S1 عضوٌ انتهت عضويته أو لا وجود له: جلستُه لا تُقرأ");
  const handed = handOverLedger(ledger, { name: "د. فهد", instructorId: 9, since: "2026-09-01T00:00:00.000Z", by: "مدير النظام" }, "مدير النظام");
  check(handed.holder?.name === "د. فهد" && handed.members.find(m => m.id === "m1")?.status === "frozen" && handed.members.find(m => m.id === "m2")?.status === "ended", "S1 التسليم: شاغلٌ جديد، والعامل يُجمَّد، والمنتهي يبقى منتهياً", handed.members);
  check(handed.history.some(e => e.kind === "handover" && e.detail === "د. منى ← د. فهد"), "S1 التسليم يُكتب في تاريخ الكرسي: من ← إلى", handed.history);
  check(resolveSeatActor(seat, handed, "m1") === null, "S1 العضو المجمَّد لا يعمل حتى يقرّر الشاغل الجديد");
  const withDeputy: SeatLedger = { ...ledger, deputy: { memberId: "m1", name: "سارة", until: "2026-10-31", setAt: "", setBy: "" } };
  const deputy = resolveSeatActor(seat, withDeputy, "m1", new Date("2026-10-30T10:00:00Z"))!;
  check(deputy?.kind === "deputy" && seatActorDisplayName(deputy).includes("سارة (نائباً عن د. منى)"), "S1 النائب يوقّع باسمه نائباً عن الشاغل", deputy);
  check(activeDeputy(withDeputy, new Date("2026-11-01T10:00:00Z")) === null, "S1 النيابة تنتهي بعد آخر يومٍ فيها وحدها");
  check(civilTailOf("٢٨٠٠١٠١٢٣٤٥٦") === "3456" && civilTailOf("12") === "", "S1 آخر أربعة أرقام (والأرقام العربية تُقرأ)");
  check(whatsappNumber("99887766") === "96599887766" && whatsappNumber("+965 9988 7766") === "96599887766" && whatsappNumber("123") === "", "S1 رقم واتساب الكويتي");
  const allowed = { allColleges: false, colleges: new Set([1]), sections: new Set(["2:5"]) };
  check(scopeWithin({ AdCollegeId: 1, AdSectionId: 3 }, allowed) && scopeWithin({ AdCollegeId: 2, AdSectionId: 5 }, allowed) && !scopeWithin({ AdCollegeId: 2, AdSectionId: 0 }, allowed) && !scopeWithin({ AdCollegeId: 3, AdSectionId: 1 }, allowed),
    "S1 نطاق الموظف داخل نطاق من أضافه، ولا أوسع");
}

/* ── S2 ── */
{
  check(roleDefinition("registrarHead").label === "المسجّل العام" && canManageDeadline("registrarHead") && canExtendDeadline("registrarHead"), "S2 المسجّل العام يضع الموعد ويمدّده");
  check(roleDefinition("collegeRegistrar").scopeMode === "college" && !canManageDeadline("collegeRegistrar") && canExtendDeadline("collegeRegistrar") && canReviewSubmissions("collegeRegistrar"),
    "S2 رئيس تسجيل الكلية: كليته، يمدّد ويراجع، ولا يضع الموعد");
  const audience = inboxAudience("collegeRegistrar");
  check(audience.deadlinesPanel === "read" && audience.extendActions === true, "S2 لوحة المواعيد قراءةً لرئيس تسجيل الكلية، وأزرار التمديد له", audience);
  check(!canExtendDeadline("registrarStaff") && !canExtendDeadline("registrarDean"), "S2 الموظف وعميد التسجيل لا يمدّدان");
}

/* ── S3 ── */
{
  const run = (actor: any, method: string, path: string) => {
    let status = 0, passedOn = false;
    const res: any = { status(code: number) { status = code; return this; }, json() { return this; } };
    seatMemberGuard({ user: actor ? { SeatActor: actor } : {}, method, path } as any, res, () => { passedOn = true; });
    return { status, passedOn };
  };
  const member = { kind: "member" }, deputy = { kind: "deputy" }, holder = { kind: "holder" };
  check(run(member, "PUT", "/schedules/5").passedOn && run(member, "POST", "/schedule-notes").passedOn, "S3 العضو يعدّل الجدول ويعلّق");
  check(run(member, "POST", "/approvals/sign").status === 403 && run(member, "POST", "/approvals/withdraw").status === 403, "S3 العضو لا يوقّع ولا يسحب توقيعاً");
  check(run(member, "POST", "/seats/16/members").status === 403 && run(member, "POST", "/seats/16/handover").status === 403 && run(member, "POST", "/auth/change-password").status === 403, "S3 ولا يدير الكرسيّ ولا يغيّر كلمة سرّه");
  check(run(member, "POST", "/seats/switch").passedOn && run(member, "GET", "/seats/mine").passedOn, "S3 ويتنقّل بين كراسيه ويقرأ فريقه");
  check(run(deputy, "POST", "/approvals/sign").passedOn && run(deputy, "POST", "/seats/16/members").status === 403, "S3 النائب يوقّع ولا يدير الفريق");
  check(run(holder, "POST", "/approvals/sign").passedOn && run(undefined, "POST", "/approvals/sign").passedOn, "S3 الشاغل ومن لا كرسيَّ له لا يمسّهما الحارس");
}

/* ── S9 بلا خادم: الحرم تُجمع بكليتها ── */
{
  const families = campusFamilies([
    { AdCollegeId: 1, AdCollegeName: "كلية التربية الأساسية - بنين" },
    { AdCollegeId: 2, AdCollegeName: "كلية التربية الأساسية - بنات" },
    { AdCollegeId: 3, AdCollegeName: "كلية التربية الأساسية - الفحيحيل - بنات" },
    { AdCollegeId: 4, AdCollegeName: "كلية الدراسات التكنولوجية" },
  ]);
  const basic = families.find(row => row.familyName === "كلية التربية الأساسية");
  check(families.length === 2 && basic?.colleges.length === 3 && basic.colleges.map(c => c.chip).join("|") === "بنين|بنات|الفحيحيل - بنات",
    "S9 حرمُ الكلية الواحدة زرٌّ واحد، وكلُّ حرمٍ وسمٌ قصير", families);
  check(campusFamilyName(["كلية التربية الأساسية - بنين", "كلية التربية الأساسية - بنات"]) === "كلية التربية الأساسية" && campusFamilyName(["كلية الحقوق"]) === "كلية الحقوق",
    "S9 اسمُ الكرسي اسمُ الكلية للحرم كلها، واسمُ الحرم إن كان واحداً");
}

/* ── S4–S9: خادمٌ حيّ ── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("seats");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = (url: string, init: RequestInit = {}) => fetch(BASE + url, { ...init, redirect: "manual", headers: { cookie, origin: BASE, ...(init.body ? { "content-type": "application/json" } : {}) } });
  const json = async (url: string, init: RequestInit = {}) => { const r = await call(url, init); let body: any = null; try { body = await r.json(); } catch { /* html */ } return { status: r.status, body }; };
  const as = async (role: string) => (await json("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) })).body?.user?.SystemUserId as number;

  /* S4 */
  await as("admin");
  const all = await json("/api/seats");
  const committee = all.body?.seats?.find((row: any) => row.role === "committeeChair" && row.id === 16);
  check(all.status === 200 && Boolean(committee) && all.body.seats.some((row: any) => row.role === "collegeRegistrar"), "S4 مدير النظام يرى الكراسي كلها، ومنها رئيس تسجيل الكلية", all.body?.seats?.map((r: any) => r.role));
  const seatDetail = await json("/api/seats/16");
  const holderPick = seatDetail.body?.holderCandidates?.[0];
  check(seatDetail.status === 200 && Boolean(holderPick), "S4 أسماءُ الشاغل من أساتذة القسم", seatDetail.body?.holderCandidates?.length);
  const setHolder = await json("/api/seats/16/holder", { method: "POST", body: JSON.stringify({ instructorId: holderPick?.id }) });
  check(setHolder.status === 200 && setHolder.body?.holder?.name === holderPick?.name, "S4 تسجيل الشاغل الحالي بلا تسليم", setHolder.body);
  await as("committeeChair");
  const me = await json("/api/auth/me");
  check(me.body?.user?.SeatActor?.kind === "holder" && String(me.body?.user?.Name || "").endsWith(`· ${holderPick?.name}`), "S4 جلسةُ الكرسي تحمل اسم شاغله", me.body?.user);

  /* S5 */
  const mine = await json("/api/seats/mine");
  const memberPick = mine.body?.candidates?.find((row: any) => row.id !== holderPick?.id);
  check(mine.body?.canManage === true && Boolean(memberPick), "S5 الشاغل يدير فريقه ويرى أساتذة القسم", mine.body?.candidates?.length);
  const outsider = await json("/api/seats/16/members", { method: "POST", body: JSON.stringify({ instructorId: 999999 }) });
  check(outsider.status === 400, "S5 لا يُضاف من ليس من أساتذة القسم", outsider.body);
  const added = await json("/api/seats/16/members", { method: "POST", body: JSON.stringify({ instructorId: memberPick?.id }) });
  const token = added.body?.token as string;
  check(added.status === 201 && /^demo\./.test(token || ""), "S5 عضوٌ جديد برابطٍ شخصي (رمز تجربة)", added.body);
  const again = await json("/api/seats/16/members", { method: "POST", body: JSON.stringify({ instructorId: memberPick?.id }) });
  check(again.status === 409, "S5 لا يُضاف العضو نفسه مرتين", again.body);
  await as("admin");
  const instructors = (await json("/api/instructors")).body as any[];
  const civil = String(instructors?.find((row: any) => Number(row.AdInstructorId) === Number(memberPick?.id))?.AdInstructorCivil || "");
  const page = await call(`/k/${encodeURIComponent(token)}`);
  const html = await page.text();
  check(page.status === 200 && html.includes(memberPick?.name) && html.includes("آخر أربعة أرقام") && /script-src 'nonce-/.test(page.headers.get("content-security-policy") || ""), "S5 صفحةُ الرابط: اسم العضو والكرسي، وتطلب الأرقام الأربعة", page.status);
  const wrong = await json(`/api/public/team/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ tail: civilTailOf(civil) === "0000" ? "1111" : "0000" }) });
  check(wrong.status === 400, "S5 أرقامٌ خاطئة لا تُدخل", wrong.body);
  const entered = await json(`/api/public/team/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify({ tail: civilTailOf(civil) }) });
  check(entered.status === 200 && entered.body?.ok === true, "S5 الأرقام الصحيحة تُدخل العضو", entered.body);
  const asMember = await json("/api/auth/me");
  check(asMember.body?.user?.SeatActor?.kind === "member" && String(asMember.body?.user?.Name || "").endsWith(`· ${memberPick?.name}`) && asMember.body?.user?.MustChangePassword !== true,
    "S5 العضو يعمل على الكرسي باسمه هو", asMember.body?.user);
  const sign = await json("/api/approvals/sign", { method: "POST", body: JSON.stringify({ collegeId: 1, sectionId: 1, termId: 1 }) });
  check(sign.status === 403 && sign.body?.code === "seat-member", "S5 العضو لا يوقّع", sign.body);
  const manage = await json("/api/seats/16/members", { method: "POST", body: JSON.stringify({ instructorId: holderPick?.id }) });
  check(manage.status === 403, "S5 العضو لا يدير الفريق", manage.body);
  const schedules = await json("/api/schedules?collegeId=1&sectionId=1&termId=1");
  check(schedules.status === 200 && Array.isArray(schedules.body), "S5 العضو يقرأ جدول القسم ويعمل عليه", schedules.status);

  /* S6 */
  await as("admin");
  const nextHolder = seatDetail.body.holderCandidates.find((row: any) => row.id !== holderPick?.id && row.id !== memberPick?.id) || seatDetail.body.holderCandidates[1];
  const handover = await json("/api/seats/16/handover", { method: "POST", body: JSON.stringify({ instructorId: nextHolder?.id }) });
  check(handover.status === 200 && String(handover.body?.password || "").length >= 10 && handover.body?.holder?.name === nextHolder?.name, "S6 التسليم: شاغلٌ جديد وكلمةٌ أولى تُعرض مرة واحدة", handover.body);
  const after = await json("/api/seats/16");
  const frozen = after.body?.team?.members?.find((row: any) => row.instructorId === memberPick?.id);
  check(after.body?.seat?.mustChangePassword === true && frozen?.status === "frozen" && after.body?.history?.[0]?.kind === "member-frozen", "S6 الحساب مُعلَّمٌ بتغيير كلمته، والفريق مجمَّد، والتاريخ يقول", { seat: after.body?.seat, frozen, h: after.body?.history?.slice(0, 2) });
  const frozenPage = await call(`/k/${encodeURIComponent(token)}`);
  check(frozenPage.status === 410 && (await frozenPage.text()).includes("شاغلٌ جديد"), "S6 رابطُ العضو المجمَّد لا يفتح، ويقول لماذا");
  const continued = await json(`/api/seats/16/members/${frozen?.id}/status`, { method: "POST", body: JSON.stringify({ status: "active" }) });
  check(continued.status === 200 && (await call(`/k/${encodeURIComponent(token)}`)).status === 200, "S6 «مستمر» يعيده برابطه نفسه", continued.body);
  const reissued = await json(`/api/seats/16/members/${frozen?.id}/link`, { method: "POST" });
  check(reissued.status === 200 && reissued.body?.token !== token && (await call(`/k/${encodeURIComponent(token)}`)).status === 410 && (await call(`/k/${encodeURIComponent(reissued.body?.token)}`)).status === 200,
    "S6 رابطٌ جديد يُبطل القديم: لكل عضوٍ رابطٌ واحدٌ صالح");
  const ended = await json(`/api/seats/16/members/${frozen?.id}/status`, { method: "POST", body: JSON.stringify({ status: "ended" }) });
  check(ended.status === 200 && (await call(`/k/${encodeURIComponent(reissued.body?.token)}`)).status === 410, "S6 انتهاء العضوية يُبطل رابطه");

  /* S7 */
  const regSeat = all.body.seats.find((row: any) => row.role === "registrarHead");
  const wide = await json(`/api/seats/${regSeat.id}/members`, { method: "POST", body: JSON.stringify({ name: "أ. سارة موظفة", civil: "290010112345", mobile: "99887766", scopes: [{ AdCollegeId: 1, AdSectionId: 1 }] }) });
  check(wide.status === 201 && wide.body?.member?.civilTail === "2345" && !("civil" in (wide.body?.member || {})), "S7 موظف التسجيل يُكتب يدوياً، ولا يُحفظ من رقمه المدني إلا آخر أربعة", wide.body);
  const collegeSeat = all.body.seats.find((row: any) => row.role === "collegeRegistrar");
  const beyond = await json(`/api/seats/${collegeSeat.id}/members`, { method: "POST", body: JSON.stringify({ name: "أ. خارج النطاق", civil: "290010199999", scopes: [{ AdCollegeId: 2, AdSectionId: 0 }] }) });
  check(beyond.status === 400, "S7 لا يُعطى موظفٌ نطاقاً أوسع من كرسيّ من أضافه", beyond.body);
  const staffToken = wide.body?.token;
  await json(`/api/public/team/${encodeURIComponent(staffToken)}`, { method: "POST", body: JSON.stringify({ tail: "2345" }) });
  const staffMe = await json("/api/auth/me");
  const staffScopes = staffMe.body?.scopes || [];
  check(staffMe.body?.role?.id === "registrarStaff" && staffMe.body?.role?.canManageDeadline === false && staffScopes.length === 1 && Number(staffScopes[0]?.AdSectionId) === 1,
    "S7 الموظف يعمل بصفة «موظف التسجيل» وفي القسم المحدد له وحده", { role: staffMe.body?.role?.id, scopes: staffScopes });
  const outOfScope = await json("/api/approvals?collegeId=1&sectionId=2&termId=1");
  check(outOfScope.status === 403, "S7 وما خارج نطاقه مغلقٌ عليه", outOfScope.status);

  /* S8 */
  await as("collegeRegistrar");
  const setDeadline = await json("/api/approvals/deadline", { method: "POST", body: JSON.stringify({ termId: 1, deadline: "2030-01-01" }) });
  check(setDeadline.status === 403, "S8 رئيس تسجيل الكلية لا يضع موعد الفصل", setDeadline.body);
  const extend = await json("/api/approvals/extensions", { method: "POST", body: JSON.stringify({ termId: 1, action: "grant", days: 3, reason: "اختبار", scope: { kind: "college", collegeId: 1 } }) });
  check(extend.status !== 403, "S8 ويمدّد لكليته", extend.body);

  /* S9: كرسيُّ رئيس تسجيلٍ لحرمين، وموظفٌ بقسمٍ من أحدهما وكليةٍ كاملةٍ من الآخر */
  await as("admin");
  const boys = await json("/api/colleges", { method: "POST", body: JSON.stringify({ AdCollegeCode: "77", AdCollegeName: "كلية الاختبار - بنين" }) });
  const girls = await json("/api/colleges", { method: "POST", body: JSON.stringify({ AdCollegeCode: "77", AdCollegeName: "كلية الاختبار - بنات" }) });
  const boysId = Number(boys.body?.AdCollegeId || boys.body?.college?.AdCollegeId || 0), girlsId = Number(girls.body?.AdCollegeId || girls.body?.college?.AdCollegeId || 0);
  check(boysId > 0 && girlsId > 0, "S9 حرمان جديدان للكلية نفسها", { boys: boys.status, girls: girls.status });
  const listed = await json("/api/seats");
  const family = listed.body?.missingCollegeRegistrars?.find((row: any) => row.familyName === "كلية الاختبار");
  check(family?.colleges?.length === 2, "S9 الحرمان بلا رئيس تسجيل يظهران زرّاً واحداً", listed.body?.missingCollegeRegistrars);
  const createdSeat = await json("/api/seats/college-registrar", { method: "POST", body: JSON.stringify({ collegeIds: [boysId, girlsId], name: "أ. رئيسة تسجيل الاختبار", mobile: "99001122" }) });
  check(createdSeat.status === 201 && createdSeat.body?.seatName === "رئيس تسجيل الكلية — كلية الاختبار", "S9 كرسيٌّ واحد للحرمين باسم الكلية", createdSeat.body);
  const second = await json("/api/seats/college-registrar", { method: "POST", body: JSON.stringify({ collegeIds: [girlsId], name: "أ. كرسيٌّ مكرر" }) });
  check(second.status === 409, "S9 ولا كرسيَّ ثانياً لحرمٍ له رئيس تسجيل", second.body);
  const seatId = Number(createdSeat.body?.seatId);
  const girlsSections = ((await json("/api/sections")).body as any[] || []).filter((row: any) => Number(row.AdCollegeId) === girlsId);
  const campusScopes = [{ AdCollegeId: boysId, AdSectionId: 0 }, ...(girlsSections[0] ? [{ AdCollegeId: girlsId, AdSectionId: Number(girlsSections[0].AdSectionId) }] : [{ AdCollegeId: girlsId, AdSectionId: 0 }])];
  const staff = await json(`/api/seats/${seatId}/members`, { method: "POST", body: JSON.stringify({ name: "أ. موظفة الحرمين", civil: "290010155555", scopes: campusScopes }) });
  check(staff.status === 201, "S9 رئيس تسجيل الكلية يعطي موظفه كليةً كاملة من حرم وقسماً من حرمٍ آخر", staff.body);
  const outside = await json(`/api/seats/${seatId}/members`, { method: "POST", body: JSON.stringify({ name: "أ. خارج الحرمين", scopes: [{ AdCollegeId: 1, AdSectionId: 1 }] }) });
  check(outside.status === 400, "S9 ولا يعطيه قسماً من كليةٍ ليست على كرسيّه", outside.body);
  const view = await json(`/api/seats/${seatId}`);
  const picked = (view.body?.campusOptions || []).flatMap((row: any) => row.colleges).filter((row: any) => row.selected).map((row: any) => row.collegeId).sort();
  check(JSON.stringify(picked) === JSON.stringify([boysId, girlsId].sort()), "S9 مدير النظام يرى حرم الكرسي", view.body?.campusOptions);
  const narrowed = await json(`/api/seats/${seatId}/colleges`, { method: "POST", body: JSON.stringify({ collegeIds: [girlsId] }) });
  check(narrowed.status === 200 && narrowed.body?.history?.[0]?.kind === "seat-colleges", "S9 رفعُ حرمٍ عن الكرسي يُكتب في تاريخه", narrowed.body?.history?.[0]);
  await json(`/api/public/team/${encodeURIComponent(staff.body?.token)}`, { method: "POST", body: JSON.stringify({ tail: "5555" }) });
  const staffSession = await json("/api/auth/me");
  const sessionColleges = new Set((staffSession.body?.scopes || []).map((row: any) => Number(row.AdCollegeId)));
  check(staffSession.body?.role?.id === "registrarStaff" && !sessionColleges.has(boysId) && (girlsSections[0] ? sessionColleges.has(girlsId) : true),
    "S9 والحرمُ المرفوع يسقط من نطاق الموظف: لا يتّسع نطاقُه على كرسيّ من أضافه", { scopes: staffSession.body?.scopes });
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ الاختبار الحيّ توقّف:\x1b[0m", error instanceof Error ? error.message : error);
} finally {
  await server?.stop();
}

/* حقول نموذج الكرسي تبقى داخل خليتها: بلا هذا يخرج حقل الجوال من البطاقة. */
{
  const css = (await import("fs")).readFileSync("src/components/seats/seats.css", "utf8");
  check(/\.seat-form-grid label,\.seat-date\{[^}]*min-inline-size:0/.test(css)
    && /\.seat-form-grid input,\.seat-date input\{[^}]*box-sizing:border-box;inline-size:100%;min-inline-size:0/.test(css),
    "حقول نموذج الكرسي لا تتجاوز خليتها");
}

console.log(`\n${passed} نجح، ${failed} فشل`);
if (failed) process.exit(1);
