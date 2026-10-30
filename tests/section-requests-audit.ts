/**
 * ── «طلب شعبة»: الإرشاد ← لجنة الجدول ← التسجيل (src/utils/sectionRequests.ts) ──────────
 *
 *  Q1  بلا خادم: آلةُ الحالة — أُرسل ← فُتحت الشعبة ← اعتُمد (ن من م) ← سُجّل، والرفضُ بسببه في كل خطوة.
 *  Q2  بلا خادم: الاعتمادُ الجزئي، والتسجيلُ لمن اعتُمد وحده، ولا يُنزع اعتمادُ من سُجّل، وطلبٌ بعددٍ بلا قائمة.
 *  Q3  بلا خادم: من يفعل ماذا (الإرشاد، اللجنة، التسجيل، العرض الصرف، مرشدُ قسمٍ آخر).
 *  Q4  بلا خادم: «الصق القائمة» (أرقامٌ عربية، فواصل، تكرار)، والفترة، وحارسُ الأدوار، ونصُّ التنبيهات.
 *  Q5  خادمٌ في العملية (صندوق العرض): الرحلةُ كاملة بالأدوار الحقيقية، والنطاق، والهوية، والجرس، وتنبيهات الجوال.
 */
import express from "express";
import { createECDH, randomBytes } from "node:crypto";
import { Repository } from "../src/db/repository";
import {
  approveStudents, countsOf, declineRequest, linkSections, markRegistered, matchesPeriod, parsePastedStudents, periodOfStart, powersFor,
  stageOf, timelineOf, unlinkSection, withdrawRequest, type SectionRequest, type SectionRequestActorFacts,
} from "../src/utils/sectionRequests";
import { readOnlyRefusal, roleWriteDecision } from "../src/server/roleGuard";
import { sectionRequestMessage } from "../src/server/pushMessages";
import { registerPushRoutes } from "../src/server/pushRoutes";
import { registerSectionRequestsRoutes, sectionRequestNotices } from "../src/server/sectionRequestsRoutes";
import { sealStudentIdentity, surveyFingerprint } from "../src/server/core/studentIdentity";
import { isScopeAllowed } from "../src/server/core/scope";
import { isPowerUser } from "../src/server/core/auth";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};

const AT = "2026-10-30T08:00:00.000Z";
const base = (over: Partial<SectionRequest> = {}): SectionRequest => ({
  id: "1:test", termId: 1, collegeId: 1, sectionId: 1, fromSectionId: 2, courseId: 10, period: "evening", count: 100,
  students: [{ id: "s1", source: "paste" }, { id: "s2", source: "masari", needId: "n2" }, { id: "s3", source: "paste" }],
  sections: [], createdAt: AT, updatedAt: AT, createdBy: { userId: 19, name: "مرشد", role: "advisor" },
  events: [{ kind: "sent", at: AT, by: "مرشد" }], ...over,
});
const next = (out: any) => { if ("refuse" in out) throw new Error(out.refuse.error); return out.next as SectionRequest; };

/* ── Q1 ── */
{
  let request = base();
  check(stageOf(request) === "sent" && timelineOf(request).map(step => step.done).join() === "true,false,false,false", "Q1 الطلبُ الجديد «أُرسل»، والمحطاتُ الثلاث الباقية لم تُنجز");
  const early = approveStudents(request, ["s1"], "لجنة", AT);
  check("refuse" in early && early.refuse.status === 409, "Q1 لا اعتمادَ قبل أن تُربط شعبة", early);
  request = next(linkSections(request, [{ scheduleId: 7, sectionCode: "503", capacity: 50 }], "لجنة", AT));
  check(stageOf(request) === "opened" && timelineOf(request)[1].detail === "503" && request.sections[0].capacity === 50, "Q1 ربطُ الشعبة: «فُتحت الشعبة» برقمها وسعتها", request.sections);
  const twice = linkSections(request, [{ scheduleId: 7, sectionCode: "503" }], "لجنة", AT);
  check("refuse" in twice, "Q1 الشعبةُ نفسها لا تُربط مرتين");
  const unlinked = next(unlinkSection(request, "503", "لجنة", AT));
  check(stageOf(unlinked) === "sent" && unlinked.events.at(-1)?.kind === "unlinked", "Q1 فكُّ الشعبة قبل الاعتماد يعيده «أُرسل» ويُكتب في سجلّه");
  request = next(approveStudents(request, ["s1", "s2"], "لجنة", AT));
  check(stageOf(request) === "approved" && timelineOf(request)[2].detail === "2 من 3", "Q1 الاعتماد: «اعتُمد 2 من 3»", timelineOf(request)[2]);
  check("refuse" in unlinkSection(request, "503", "لجنة", AT) && "refuse" in linkSections(request, [{ scheduleId: 8, sectionCode: "504" }], "لجنة", AT),
    "Q1 بعد الاعتماد لا تُفكّ شعبةٌ ولا تُضاف");
  check("refuse" in withdrawRequest(request, "مرشد", AT) && "refuse" in declineRequest(request, "سبب", "لجنة", AT), "Q1 لا سحبَ ولا اعتذارَ بعد الاعتماد");
  request = next(markRegistered(request, ["s1"], true, "تسجيل", AT));
  check(stageOf(request) === "registering" && timelineOf(request)[3].detail === "1 من 2", "Q1 «سُجّل 1 من 2»", timelineOf(request)[3]);
  request = next(markRegistered(request, ["s2"], true, "تسجيل", AT));
  check(stageOf(request) === "registered" && timelineOf(request).every(step => step.done) && timelineOf(request)[3].detail === "الكل (2)", "Q1 «سُجّل الكل»: المحطاتُ الأربع منجزة");
}

/* ── Q2 ── */
{
  let request = next(linkSections(base(), [{ scheduleId: 7, sectionCode: "503" }], "لجنة", AT));
  request = next(approveStudents(request, ["s2"], "لجنة", AT));
  const counts = countsOf(request);
  check(counts.approved === 1 && counts.notApproved === 2 && counts.undecided === 0, "Q2 الاعتمادُ الجزئي: من لم يُختر «لم يُعتمد» ويبقى في الكشف", counts);
  const notApproved = markRegistered(request, ["s1"], true, "تسجيل", AT);
  check("refuse" in notApproved && /اعتُمد/.test(notApproved.refuse.error), "Q2 لا يُسجَّل من لم يُعتمد", notApproved);
  request = next(markRegistered(request, ["s2"], true, "تسجيل", AT));
  const strip = approveStudents(request, ["s1"], "لجنة", AT);
  check("refuse" in strip, "Q2 إعادةُ الاعتماد لا تنزع اعتمادَ من سُجّل");
  const widened = next(approveStudents(request, ["s1", "s2"], "لجنة", AT));
  check(countsOf(widened).approved === 2 && stageOf(widened) === "registering", "Q2 ويُعاد الاعتمادُ ليشمل طالباً آخر ما دام من سُجّل باقياً");
  const undo = next(markRegistered(widened, ["s2"], false, "تسجيل", AT));
  check(countsOf(undo).registered === 0 && stageOf(undo) === "approved", "Q2 التسجيلُ يتراجع عن تعليمٍ خاطئ");
  const empty = approveStudents(next(linkSections(base(), [{ scheduleId: 7, sectionCode: "503" }], "لجنة", AT)), [], "لجنة", AT);
  check("refuse" in empty && empty.refuse.status === 400, "Q2 لا اعتمادَ بلا طالبٍ واحد على الأقل");
  const countOnly = next(approveStudents(next(linkSections(base({ students: [] }), [{ scheduleId: 7, sectionCode: "503" }], "لجنة", AT)), [], "لجنة", AT));
  check(stageOf(countOnly) === "approved" && timelineOf(countOnly)[2].detail === "100 طالب", "Q2 طلبٌ بعددٍ بلا قائمة يُعتمد عددُه كلُّه", timelineOf(countOnly)[2]);
  const declined = declineRequest(base(), "  ", "لجنة", AT);
  check("refuse" in declined && declined.refuse.status === 400, "Q2 الاعتذارُ بسطرٍ يصل الإرشاد، لا فارغاً");
  const closed = next(declineRequest(base(), "لا أستاذ متاح مساءً", "لجنة", AT));
  check(stageOf(closed) === "declined" && closed.closedNote === "لا أستاذ متاح مساءً" && "refuse" in linkSections(closed, [{ scheduleId: 7, sectionCode: "1" }], "لجنة", AT),
    "Q2 بعد الاعتذار يُغلق الطلب ولا تُربط به شعبة");
  check(stageOf(next(withdrawRequest(base(), "مرشد", AT))) === "withdrawn", "Q2 الإرشادُ يسحب طلبه قبل الاعتماد");
}

/* ── Q3 ── */
{
  const facts = (over: Partial<SectionRequestActorFacts>): SectionRequestActorFacts => ({
    role: "standard", power: false, viewerOnly: false, advisor: false, registrar: false, schedules: false, courseScope: false, fromScope: false, ...over,
  });
  const advisor = powersFor(facts({ role: "advisor", advisor: true, fromScope: true }));
  check(advisor.read && advisor.advising && !advisor.committee && !advisor.registration, "Q3 مرشدُ القسم المرسِل: يرسل ويقرأ، ولا يفتح ولا يعتمد ولا يسجّل", advisor);
  const otherAdvisor = powersFor(facts({ role: "advisor", advisor: true, fromScope: false, courseScope: true }));
  check(!otherAdvisor.read, "Q3 مرشدُ قسم المقرر لا يقرأ كشفَ مرشدٍ آخر لأن المقرر في قسمه");
  const committee = powersFor(facts({ role: "committeeChair", schedules: true, courseScope: true }));
  check(committee.committee && committee.read && !committee.advising && !committee.registration, "Q3 لجنةُ قسم المقرر تفتح وتربط وتعتمد", committee);
  check(!powersFor(facts({ role: "committeeChair", schedules: true, courseScope: false })).read, "Q3 لجنةُ قسمٍ آخر لا ترى الطلب");
  const registrar = powersFor(facts({ role: "collegeRegistrar", registrar: true, courseScope: true }));
  check(registrar.registration && !registrar.committee && registrar.read, "Q3 التسجيلُ في نطاقه يعتمد ويسجّل");
  const dean = powersFor(facts({ role: "dean", viewerOnly: true, courseScope: true }));
  check(dean.read && !dean.advising && !dean.committee && !dean.registration, "Q3 العميدُ يقرأ بلا زرّ");
  const regDean = powersFor(facts({ role: "registrarDean", viewerOnly: true, registrar: true, courseScope: true }));
  check(regDean.read && !regDean.registration, "Q3 عميدُ التسجيل يقرأ ولا يسجّل");
  const head = powersFor(facts({ role: "departmentHead", courseScope: true }));
  check(head.read && !head.committee, "Q3 رئيسُ القسم يقرأ ولا يفتح شعبة (لا يملك الورشة)");
  check(Object.values(powersFor(facts({ power: true }))).every(Boolean), "Q3 مدير النظام كلُّ الأطراف");
}

/* ── Q4 ── */
{
  const rows = parsePastedStudents("٠٠٠٠٠٠٠٠٠٠١١\tسارة أحمد\nمحمد علي، 000000000022\n\nسارة أحمد ٠٠٠٠٠٠٠٠٠٠١١\nس\n1234567890123 خالد\nنورة");
  check(rows.length === 4 && rows[0].civil === "000000000011" && rows[0].name === "سارة أحمد" && rows[1].civil === "000000000022" && rows[1].name === "محمد علي",
    "Q4 الصق: رقمٌ مدنيٌّ بأرقامٍ عربية وفواصل وتبويب، والاسمُ معه بأي ترتيب", rows);
  check(rows[2].name === "خالد" && rows[2].civil === "" && rows[3].name === "نورة", "Q4 رقمٌ من ثلاثة عشر رقماً ليس رقماً مدنياً، والاسمُ وحده يكفي", rows.slice(2));
  check(!rows.some(row => row.name === "س"), "Q4 سطرٌ بلا رقمٍ ولا اسمٍ مفهوم يُهمل، والمكررُ مرّةً واحدة");
  check(periodOfStart("08:00") === "morning" && periodOfStart("13:59") === "morning" && periodOfStart("14:00") === "evening" && periodOfStart("17:30") === "evening", "Q4 الفترة: قبل الثانية صباحية");
  check(matchesPeriod("any", "18:00") && matchesPeriod("evening", "16:00") && !matchesPeriod("morning", "16:00"), "Q4 «أي فترة» توافق كل موعد");

  const decide = (role: string, path: string, method = "POST") => roleWriteDecision({ method, path, authenticated: true, powerUser: false, role });
  check(decide("advisor", "/section-requests").allowed && decide("advisor", "/section-requests/1:x/withdraw").allowed, "Q4 حارسُ الأدوار: المرشدُ يرسل ويسحب (بابٌ ضيّق)");
  check(decide("registrarStaff", "/section-requests/1:x/register").allowed && decide("collegeRegistrar", "/section-requests/1:x/approve").allowed, "Q4 والتسجيلُ يعتمد ويسجّل");
  check(!decide("dean", "/section-requests").allowed && !decide("registrarDean", "/section-requests/1:x/register").allowed, "Q4 والعرضُ الصرف لا يكتب");
  check(!decide("advisor", "/schedules").allowed && !decide("advisor", "/section-requestsX").allowed, "Q4 ولا يتّسع الباب: المرشدُ لا يكتب في الجدول ولا في مسارٍ يشبه الاسم");
  check(readOnlyRefusal("dean").readOnly === true, "Q4 رسالةُ الرفض كما هي");

  const sent = sectionRequestMessage("sent", { id: "1:abc", courseName: "مقدمة في التربية", count: 100, period: "مسائية" });
  check(sent.title === "📨 طلب شعبة من الإرشاد — «مقدمة في التربية»" && sent.body === "100 طالب · مسائية" && sent.url === "/FSchedule/StudentRegistration" && sent.tag === "section-request-1:abc",
    "Q4 تنبيهُ اللجنة: المقرر والعدد والفترة، ويفتح كشف التسجيل", sent);
  const approved = sectionRequestMessage("approved-advising", { id: "1:abc", courseName: "مقدمة", approved: 80, listed: 100 });
  check(approved.title === "✅ تم الاعتماد — «مقدمة»" && approved.body === "اعتُمد 80 من 100", "Q4 تنبيهُ الإرشاد: «تم الاعتماد» ومن اعتُمد", approved);
  check(sectionRequestMessage("approved-registration", { id: "x", courseName: "مقدمة", approved: 3 }).title === "🎓 للتسجيل: 3 طلاب في «مقدمة»", "Q4 تنبيهُ التسجيل بالعدد");
}

/* ── Q5: خادمٌ في العملية ── */
const SANDBOX = `demo_section_requests_${Date.now()}`;
Repository.createDemoSandbox(SANDBOX, 10 * 60_000);
const sent: string[] = [];
const app = express();
app.use(express.json());
app.use((req, _res, next) => { if (!Repository.runDemoSandbox(SANDBOX, next)) next(); });
app.use(async (req: any, res, next) => {
  const id = Number(req.headers["x-test-user"] || 0);
  if (id) {
    req.user = await Repository.getUserById(id);
    req.scopes = await Repository.getUserAssigns(id);
    req.permissions = (await Repository.getSecurityByUser(id)).map((item: any) => Number(item.FormNameId));
  }
  /* حارسُ الأدوار كما في server.ts: يُسأل قبل كل مسار. */
  if (req.path.startsWith("/api/")) {
    const verdict = roleWriteDecision({ method: req.method, path: req.path.slice(4), authenticated: Boolean(req.user), powerUser: isPowerUser(req), role: req.user?.Role });
    if (!verdict.allowed) { res.status(403).json(readOnlyRefusal(req.user?.Role)); return; }
  }
  next();
});
const requireAuth = (req: any, res: any, next: any) => (req.user ? next() : res.status(401).json({ error: "الرجاء تسجيل الدخول أولاً" }));
registerPushRoutes(app, {
  requireAuth, isScopeAllowed: (req, c, s) => isScopeAllowed(req, c, s), isPowerUser: req => isPowerUser(req),
  resolveCard: async () => null, readEnv: () => ({}),
  fetchImpl: async url => { sent.push(url); return { status: 201 }; },
});
registerSectionRequestsRoutes(app);
app.get("/test/notices", requireAuth, async (req: any, res) => { res.json(await sectionRequestNotices(req, [Number(req.query.termId)])); });
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const BASE = `http://127.0.0.1:${(server.address() as any).port}`;
const call = async (user: number, method: string, url: string, body?: unknown) => {
  const response = await fetch(BASE + url, { method, headers: { "Content-Type": "application/json", "x-test-user": String(user) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) as any };
};
const inSandbox = <T>(fn: () => Promise<T>) => Repository.withDemoSandbox(SANDBOX, fn);
const device = (name: string) => {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
};

const ADVISOR = 19, COMMITTEE = 16, REGISTRAR = 22, DEAN = 10, HEAD = 15;
try {
  const TERM = 1;
  const rows = await inSandbox(() => Repository.getSchedulesByScope({ collegeId: 1, sectionId: 1, termId: TERM })) as any[];
  const courses = await inSandbox(() => Repository.getCourses()) as any[];
  const target = rows.find(row => courses.some(course => Number(course.AdCourseId) === Number(row.AdCourseId) && Number(course.AdCollegeId) === 1 && Number(course.AdSectionId) === 1));
  check(Boolean(target), "Q5 في صندوق العرض شعبةٌ لمقررٍ من القسم في الفصل", rows.length);
  const courseId = Number(target?.AdCourseId || 0);

  /* طالبٌ طلب المقرر من «مساري» (باب الطالب D5): هويتُه مختومة كما في الطلبات الحقيقية. */
  const need = await inSandbox(async () => Repository.saveStudentNeed({
    fingerprint: await surveyFingerprint("000000000011"), AdCollegeId: 1, AdSectionId: 1, surveySectionId: 1, AdTermId: TERM,
    courseIds: [courseId], requestType: "new-course",
    nameCipher: await sealStudentIdentity("ريم الاختبار"), civilCipher: await sealStudentIdentity("000000000011"),
  } as any, { byKind: true }));

  for (const [user, name] of [[ADVISOR, "advisor"], [COMMITTEE, "committee"], [REGISTRAR, "registrar"], [DEAN, "dean"]] as const) {
    await call(user, "POST", "/api/push/subscribe", { subscription: device(name) });
  }

  const compose = await call(ADVISOR, "GET", `/api/section-requests/compose?collegeId=1&sectionId=1&termId=${TERM}`);
  const listed = compose.body?.courses?.find((row: any) => row.id === courseId);
  check(compose.status === 200 && listed?.masari === 1 && compose.body.courses[0].masari >= 1, "Q5 المرشد: مقرراتُ الحرم، والمطلوبُ من «مساري» أولاً بعدده", listed);
  check((await call(DEAN, "GET", `/api/section-requests/compose?collegeId=1&sectionId=1&termId=${TERM}`)).status === 403
    && (await call(COMMITTEE, "GET", `/api/section-requests/compose?collegeId=1&sectionId=1&termId=${TERM}`)).status === 403, "Q5 «طلب شعبة» للإرشاد وحده (لا العميد ولا اللجنة)");
  const candidates = await call(ADVISOR, "GET", `/api/section-requests/candidates?collegeId=1&sectionId=1&termId=${TERM}&courseId=${courseId}`);
  check(candidates.status === 200 && candidates.body.rows.length === 1 && candidates.body.rows[0].name === "ريم الاختبار" && candidates.body.rows[0].civilTail === "0011" && !("civil" in candidates.body.rows[0]),
    "Q5 طلبةُ «مساري» بالاسم وآخر أربعة أرقام، لا الرقم المدني كاملاً", candidates.body);

  check((await call(ADVISOR, "POST", "/api/section-requests", { collegeId: 1, fromSectionId: 2, termId: TERM, courseId, period: "evening", count: 5 })).status === 403, "Q5 المرشد لا يرسل باسم قسمٍ خارج نطاقه");
  check((await call(COMMITTEE, "POST", "/api/section-requests", { collegeId: 1, fromSectionId: 1, termId: TERM, courseId, period: "evening", count: 5 })).status === 403, "Q5 اللجنة لا ترسل طلب شعبة");
  check((await call(ADVISOR, "POST", "/api/section-requests", { collegeId: 1, fromSectionId: 1, termId: TERM, courseId, period: "night", count: 5 })).status === 400, "Q5 فترةٌ غير معروفة تُرفض");

  sent.length = 0;
  const created = await call(ADVISOR, "POST", "/api/section-requests", {
    collegeId: 1, fromSectionId: 1, termId: TERM, courseId, period: "evening", count: 100,
    needIds: [need.id], pasted: "000000000011 ريم الاختبار\nهند الاختبار 000000000033\nدانة الاختبار", note: "دفعةُ المحوّلين",
  });
  check(created.status === 201 && created.body.students === 3 && created.body.count === 100, "Q5 الإرسال: طالبةٌ من «مساري» واثنتان ملصقتان (المكرر مرّة)، والعددُ 100", created.body);
  const id = String(created.body?.id || "");
  const stored: any = await inSandbox(() => Repository.getFeatureDoc("sectionRequests", id));
  check(Boolean(stored) && !JSON.stringify(stored).includes("000000000033") && !JSON.stringify(stored).includes("هند الاختبار") && stored.students[0].needId === need.id,
    "Q5 لا اسمَ ولا رقمَ مكشوفاً في الوثيقة المحفوظة (مختومان)، وطالبةُ «مساري» بمعرّف طلبها");
  check(sent.some(url => url.endsWith("/committee")) && !sent.some(url => url.endsWith("/advisor") || url.endsWith("/dean")), "Q5 تنبيهُ الجوال يصل اللجنة وحدها عند الإرسال", sent);

  const asCommittee = await call(COMMITTEE, "GET", `/api/section-requests?termId=${TERM}`);
  const card = asCommittee.body?.rows?.find((row: any) => row.id === id);
  check(card?.stage === "sent" && card.powers.committee && !card.powers.registration && card.students.map((s: any) => s.name).join("|") === "ريم الاختبار|هند الاختبار|دانة الاختبار",
    "Q5 اللجنة ترى البطاقة بأسماء الطلبة وزرَّها", card?.students);
  check(card?.available?.some((row: any) => row.sectionCode === String(target.SCode)), "Q5 وتُعرض لها شعبُ المقرر القائمة لتُربط بلمسة", card?.available);
  const asDean = await call(DEAN, "GET", `/api/section-requests?termId=${TERM}`);
  const deanCard = asDean.body?.rows?.find((row: any) => row.id === id);
  check(Boolean(deanCard) && deanCard.students.every((s: any) => /^طالب \d+$/.test(s.name) && !s.civilTail) && !Object.values(deanCard.powers).some(Boolean) && !deanCard.available.length,
    "Q5 العميد يرى الخطَّ الزمني والعدد بلا أسماء ولا أزرار", deanCard?.students);
  const asHead = await call(HEAD, "GET", `/api/section-requests?termId=${TERM}`);
  check(asHead.body?.rows?.some((row: any) => row.id === id && !row.powers.committee), "Q5 رئيسُ القسم يقرأ ولا يفتح شعبة");

  check((await call(ADVISOR, "POST", `/api/section-requests/${encodeURIComponent(id)}/approve`, { all: true })).status === 403, "Q5 الإرشادُ لا يعتمد");
  check((await call(COMMITTEE, "POST", `/api/section-requests/${encodeURIComponent(id)}/approve`, { all: true })).status === 409, "Q5 لا اعتمادَ قبل ربط شعبة");
  check((await call(REGISTRAR, "POST", `/api/section-requests/${encodeURIComponent(id)}/link`, { scheduleIds: [target.id] })).status === 403, "Q5 الربطُ للجنة لا للتسجيل");
  const linked = await call(COMMITTEE, "POST", `/api/section-requests/${encodeURIComponent(id)}/link`, { scheduleIds: [target.id] });
  check(linked.status === 200 && linked.body.sections[0].sectionCode === String(target.SCode) && linked.body.capacity === 100, "Q5 اللجنة تربط الشعبة بلمسة، وسعتُها من العدد", linked.body);
  const config: any = await inSandbox(() => Repository.getFeatureDoc("advisorSeatLedgers", `config:1:1:${TERM}`));
  check(Number(config?.capacityBySection?.[`${TERM}:${courseId}:${String(target.SCode)}`]) === 100, "Q5 السعةُ كُتبت في رصيد مقاعد المرشد (السعة الأساسية للشعبة)", config?.capacityBySection);
  check((await call(REGISTRAR, "POST", `/api/section-requests/${encodeURIComponent(id)}/register`, { all: true })).status === 409, "Q5 لا تسجيلَ قبل الاعتماد");

  const ids = card.students.map((s: any) => s.id);
  sent.length = 0;
  const approved = await call(COMMITTEE, "POST", `/api/section-requests/${encodeURIComponent(id)}/approve`, { studentIds: ids.slice(0, 2) });
  check(approved.status === 200 && approved.body.counts.approved === 2 && approved.body.counts.notApproved === 1, "Q5 اعتمادٌ جزئي: طالبتان من ثلاث", approved.body);
  check(sent.some(url => url.endsWith("/advisor")) && sent.some(url => url.endsWith("/registrar")) && !sent.some(url => url.endsWith("/dean")), "Q5 «تم الاعتماد» يصل الإرشادَ والتسجيلَ على الجوال", sent);
  const advisorBell = (await call(ADVISOR, "GET", `/test/notices?termId=${TERM}`)).body as any[];
  check(advisorBell.some(item => item.tone === "done" && /تم الاعتماد/.test(item.title) && /2 من 3/.test(item.title) && item.view === "studentRegistration"), "Q5 جرسُ الإرشاد: «تم الاعتماد — 2 من 3»", advisorBell);
  const registrarBell = (await call(REGISTRAR, "GET", `/test/notices?termId=${TERM}`)).body as any[];
  check(registrarBell.some(item => item.tone === "action" && /سجّل طالبين/.test(item.title)), "Q5 جرسُ التسجيل: «سجّل طالبين»", registrarBell);
  const committeeBell = (await call(COMMITTEE, "GET", `/test/notices?termId=${TERM}`)).body as any[];
  check(!committeeBell.some(item => String(item.id).startsWith(`section-request:${id}`)), "Q5 وما عاد ينتظر اللجنة شيءٌ منه", committeeBell);

  const advisorView = (await call(ADVISOR, "GET", `/api/section-requests?termId=${TERM}`)).body.rows.find((row: any) => row.id === id);
  check(advisorView.students.filter((s: any) => s.approved === true).length === 2 && advisorView.students.find((s: any) => s.approved === false)?.name === "دانة الاختبار",
    "Q5 الكشفُ الواصل للإرشاد يبيّن من اعتُمد ومن لم يُعتمد");
  check((await call(REGISTRAR, "POST", `/api/section-requests/${encodeURIComponent(id)}/register`, { studentIds: [ids[2]] })).status === 409, "Q5 التسجيل لا يسجّل من لم يُعتمد");
  check((await call(ADVISOR, "POST", `/api/section-requests/${encodeURIComponent(id)}/register`, { all: true })).status === 403, "Q5 الإرشادُ لا يسجّل");
  const registered = await call(REGISTRAR, "POST", `/api/section-requests/${encodeURIComponent(id)}/register`, { all: true });
  check(registered.status === 200 && registered.body.counts.registered === 2, "Q5 التسجيل: «سُجّلوا كلهم»", registered.body);
  const final = (await call(ADVISOR, "GET", `/api/section-requests?termId=${TERM}`)).body.rows.find((row: any) => row.id === id);
  check(final.stage === "registered" && final.timeline.every((step: any) => step.done) && final.timeline[3].detail === "الكل (2)", "Q5 الخطُّ الزمني للجميع: أُرسل ← فُتحت ← اعتُمد 2 من 3 ← سُجّل الكل", final.timeline);
  check((await call(ADVISOR, "POST", `/api/section-requests/${encodeURIComponent(id)}/withdraw`, {})).status === 409, "Q5 لا سحبَ بعد الاعتماد");

  /* طلبٌ ثانٍ تعتذر عنه اللجنة. */
  const second = await call(ADVISOR, "POST", "/api/section-requests", { collegeId: 1, fromSectionId: 1, termId: TERM, courseId, period: "morning", count: 12 });
  const secondId = String(second.body?.id || "");
  check(second.status === 201 && second.body.students === 0, "Q5 طلبٌ بالعدد وحده يُرسل");
  check((await call(COMMITTEE, "POST", `/api/section-requests/${encodeURIComponent(secondId)}/decline`, { note: "" })).status === 400, "Q5 الاعتذارُ بلا سبب يُرفض");
  check((await call(COMMITTEE, "POST", `/api/section-requests/${encodeURIComponent(secondId)}/decline`, { note: "لا قاعة صباحية" })).status === 200, "Q5 اللجنة تعتذر بسطر");
  const declinedBell = (await call(ADVISOR, "GET", `/test/notices?termId=${TERM}`)).body as any[];
  check(declinedBell.some(item => item.tone === "alert" && /اعتذرت/.test(item.title) && item.detail === "لا قاعة صباحية"), "Q5 والاعتذارُ يصل جرسَ الإرشاد بسببه", declinedBell);
  check((await call(COMMITTEE, "POST", `/api/section-requests/${encodeURIComponent("1:missing")}/link`, { scheduleIds: [1] })).status === 404, "Q5 طلبٌ لا وجود له: 404");
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ Q5 تعثّر الخادم\x1b[0m", error instanceof Error ? error.stack : error);
} finally {
  server.close();
  Repository.dropDemoSandbox(SANDBOX);
}

console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
