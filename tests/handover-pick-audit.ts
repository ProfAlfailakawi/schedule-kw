/**
 * ── تسليم الرئاسة: الرئيسُ الجديد يُختار من الأساتذة القائمين بالبحث (docs/SEATS.md) ──
 *
 *  H1  بلا خادم: البحثُ يطبّع العربية (تشكيل، همزات، ياء، تاء مربوطة)، وحرفان فأكثر، وسقفُ ثمانية.
 *  H2  بلا خادم: الجوالُ من سجلّ الأستاذ، ولا يُطلب إلا إن غاب.
 *  H3  خادمٌ حيّ (تجربة): النطاقُ يحرسه الخادم — رئيسُ القسم من قسمه، والعميدُ من كليته، وما خارجهما مرفوض.
 *  H4  خادمٌ حيّ: لا اسمَ يُكتب ولا قائمةَ تُعرض (لا مصفوفةَ مرشّحين في تفاصيل الكرسي، ولا عدّاد).
 */
import { waitForDemoSeed } from "./helpers/demoSeed";
import { startDemoServer, type LiveServer } from "./helpers/liveServer";
import { HANDOVER_SEARCH_MAX_RESULTS, handoverSearchKey, handoverSearchTokens, matchHandoverCandidates, resolveHandoverPhone } from "../src/utils/handoverPick";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};

/* ── H1 ── */
{
  const pool = [
    { id: 1, name: "د. أحمد الفيلكاوي" }, { id: 2, name: "د. منى العتيبي" }, { id: 3, name: "أ. مَنى المطيري" },
    { id: 4, name: "د. هالة الرشيدي" }, { id: 5, name: "د. فاطمة الكندري" }, { id: 6, name: "د. علياء السالم" },
    ...Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, name: `د. سالم رقم ${i + 1}` })),
  ];
  check(handoverSearchKey("أَحْمَد") === handoverSearchKey("احمد") && handoverSearchKey("فاطمه") === handoverSearchKey("فاطمة") && handoverSearchKey("هدى") === handoverSearchKey("هدي"),
    "H1 التشكيل والهمزات والتاء المربوطة صورةٌ واحدة");
  check(matchHandoverCandidates(pool, "احمد").map(r => r.id).join() === "1", "H1 «احمد» يجد «أحمد»");
  check(matchHandoverCandidates(pool, "منى").map(r => r.id).sort().join() === "2,3", "H1 «منى» تجد الاسمين رغم التشكيل والألقاب");
  check(matchHandoverCandidates(pool, "د. منى").map(r => r.id).sort().join() === "2,3", "H1 اللقبُ في الاستعلام لا يكسر البحث");
  check(matchHandoverCandidates(pool, "م").length === 0 && matchHandoverCandidates(pool, "").length === 0 && matchHandoverCandidates(pool, "  ").length === 0 && matchHandoverCandidates(pool, "د م").length === 0, "H1 أقلُّ من حرفين: لا نتيجة");
  check(handoverSearchTokens("سا").length === 1 && handoverSearchTokens("س ا").length === 0, "H1 كلمةٌ من حرفين شرطٌ للبحث");
  const many = matchHandoverCandidates(pool, "سالم");
  check(many.length === HANDOVER_SEARCH_MAX_RESULTS && HANDOVER_SEARCH_MAX_RESULTS === 8, "H1 سقفُ النتائج ثمانية مهما كثر المطابقون", many.length);
  check(matchHandoverCandidates(pool, "سالم", 100).length === 21, "H1 السقفُ الافتراضي هو الحارس لا غيره (علياء السالم ضمن مطابقي سالم)");
  check(matchHandoverCandidates(pool, "منى العتيبي").map(r => r.id).join() === "2", "H1 كلمتان: كلتاهما تُطابق");
  check(matchHandoverCandidates(pool, "سالم")[0].name.startsWith("د. سالم"), "H1 من يبدأ اسمُه بالكلمة يسبق من تقع في وسطه");
}

/* ── H2 ── */
{
  const onFile = resolveHandoverPhone("50001234", "99887766");
  check("mobile" in onFile && onFile.mobile === "50001234", "H2 للأستاذ جوالٌ في السجل: يُؤخذ منه، وما يُكتب في الطلب يُهمل", onFile);
  const missing = resolveHandoverPhone("", "");
  check("error" in missing, "H2 لا جوالَ في السجل ولا في الطلب: يُطلب الجوال", missing);
  const typed = resolveHandoverPhone("  ", "99887766");
  check("mobile" in typed && typed.mobile === "99887766", "H2 لا جوالَ في السجل: يُقبل الجوالُ المكتوب", typed);
  check("error" in resolveHandoverPhone("", "123"), "H2 جوالٌ غير كويتي لا يُقبل");
}

/* ── H3–H4: خادمٌ حيّ ── */
let server: LiveServer | null = null;
try {
  server = await startDemoServer("handover-pick");
  const BASE = server.base;
  const login = await fetch(BASE + "/api/auth/demo", { method: "POST" });
  const cookie = ((login.headers as any).getSetCookie?.() as string[] || []).map(c => c.split(";")[0]).join("; ");
  await waitForDemoSeed(BASE, cookie);
  const call = (url: string, init: RequestInit = {}) => fetch(BASE + url, { ...init, redirect: "manual", headers: { cookie, origin: BASE, ...(init.body ? { "content-type": "application/json" } : {}) } });
  const json = async (url: string, init: RequestInit = {}) => { const r = await call(url, init); let body: any = null; try { body = await r.json(); } catch { /* html */ } return { status: r.status, body }; };
  const as = async (role: string) => (await json("/api/demo/role", { method: "POST", body: JSON.stringify({ role }) })).body?.user?.SystemUserId as number;
  const search = (seat: number, q: string) => json(`/api/seats/${seat}/handover-candidates?q=${encodeURIComponent(q)}`);
  const post = (url: string, body: unknown) => json(url, { method: "POST", body: JSON.stringify(body) });

  await as("admin");
  const instructors = ((await json("/api/instructors")).body as any[]).filter(row => !row.AdInstructorStatus);
  const ids = new Set(instructors.map(row => Number(row.AdInstructorId)));
  const nameOf = new Map(instructors.map(row => [Number(row.AdInstructorId), String(row.AdInstructorName)]));

  /* رئيسُ القسم: كرسيُّه 15. نطاقُ قسمه يُستخرج بالبحث نفسه من مدير النظام (لكلٍّ حدُّه في الدقيقة). */
  const scope = new Set<number>();
  for (const id of ids) {
    const found = await search(15, nameOf.get(id) || "");
    if ((found.body?.people || []).some((row: any) => Number(row.id) === id)) scope.add(id);
  }
  const deptSeat = await as("departmentHead");
  check(deptSeat === 15 && scope.size > 0 && scope.size < ids.size, "H3 للقسم نطاقٌ أضيقُ من السجلّ كلّه", { deptSeat, dept: scope.size, all: ids.size });

  const broad = await search(15, "تجريبي");
  const keys = new Set((broad.body?.people || []).flatMap((row: any) => Object.keys(row)));
  check(broad.status === 200 && broad.body?.people?.length === HANDOVER_SEARCH_MAX_RESULTS && Object.keys(broad.body).join() === "people", "H3 البحثُ يعيد ثمانيةً فقط، بلا عدّادٍ ولا حقلٍ آخر", { n: broad.body?.people?.length, keys: Object.keys(broad.body || {}) });
  check([...keys].sort().join() === "department,hasPhone,id,name", "H3 الحقولُ: الرقم والاسم والقسم ووجود الجوال، لا غير", [...keys]);
  check(broad.body.people.every((row: any) => scope.has(Number(row.id))), "H3 كلُّ المطابقين من قسم رئيس القسم");
  const tooShort = await search(15, "ت");
  const empty = await search(15, "");
  check(tooShort.status === 200 && tooShort.body?.people?.length === 0 && empty.body?.people?.length === 0, "H3 حرفٌ واحد أو لا شيء: لا أسماء", { a: tooShort.body, b: empty.body });

  const outsiders = [...ids].filter(id => !scope.has(id));
  check(outsiders.length > 0, "H3 في السجلّ أساتذةٌ من خارج القسم", { all: ids.size, scope: scope.size });
  let leaked = 0;
  for (const id of outsiders.slice(0, 6)) {
    const found = await search(15, nameOf.get(id) || "");
    if ((found.body?.people || []).some((row: any) => Number(row.id) === id)) leaked++;
  }
  check(leaked === 0, "H3 بحثُ رئيس القسم باسم أستاذٍ من خارج قسمه لا يجده", leaked);

  const noOne = await as("standard");
  const denied = await search(15, "تجريبي");
  check(noOne !== 15 && denied.status === 403, "H3 من لا يسلّم الكرسيَّ لا يبحث فيه", denied);

  /* التسليم يحرسه الخادم (من مدير النظام: التسليم الذاتي ممنوعٌ في التجربة) */
  await as("admin");
  const inside = [...scope][0];
  const outside = outsiders[0];
  const typedName = await post("/api/seats/15/handover", { name: "د. اسم مكتوب بخط اليد", mobile: "99887766" });
  check(typedName.status === 400 && /اختر/.test(typedName.body?.error || ""), "H4 اسمٌ يُكتب بدل الاختيار: مرفوض", typedName.body);
  const mixed = await post("/api/seats/15/handover", { instructorId: 0, name: "د. فهد", mobile: "99887766" });
  check(mixed.status === 400, "H4 «بلا رقم أستاذ» مرفوضٌ ولو كُتب اسمٌ وجوال", mixed.body);
  const beyond = await post("/api/seats/15/handover", { instructorId: outside });
  check(beyond.status === 400 && /ليس من أساتذة القسم/.test(beyond.body?.error || ""), "H3 التسليمُ لأستاذٍ من خارج القسم مرفوض برسالةٍ عربية", beyond.body);
  const ghost = await post("/api/seats/15/handover", { instructorId: 987654 });
  check(ghost.status === 400, "H3 رقمٌ لا وجود له مرفوض", ghost.body);
  const done = await post("/api/seats/15/handover", { instructorId: inside, mobile: "99887766" });
  const record = (await json("/api/instructors")).body.find((row: any) => Number(row.AdInstructorId) === inside);
  check(done.status === 200 && done.body?.holder?.instructorId === inside && done.body?.holder?.mobile === String(record?.AdInstructorMobile).trim() && done.body?.password === "12345678",
    "H2 التسليمُ لأستاذٍ من القسم: جوالُه من سجلّه (لا من الطلب) والكلمةُ الأولى كما كانت", done.body);
  const afterSearch = await search(15, nameOf.get(inside) || "");
  check(!(afterSearch.body?.people || []).some((row: any) => Number(row.id) === inside), "H3 الرئيسُ الحالي لا يظهر في البحث");
  const same = await post("/api/seats/15/handover", { instructorId: inside });
  check(same.status === 409, "H3 لا تسليمَ لمن هو الرئيس الآن", same.body);

  /* العميد: الكلية كلُّها */
  const deanSeat = await as("dean");
  const deanBroad = await search(deanSeat, "تجريبي");
  check(deanBroad.status === 200 && deanBroad.body?.people?.length === HANDOVER_SEARCH_MAX_RESULTS, "H3 العميدُ يبحث في كليته بالسقف نفسه", deanBroad.body?.people?.length);
  const college = new Set<number>();
  for (const id of [...ids].slice(0, 36)) {
    const found = await search(deanSeat, nameOf.get(id) || "");
    if ((found.body?.people || []).some((row: any) => Number(row.id) === id)) college.add(id);
  }
  check(college.size >= scope.size && [...scope].every(id => college.has(id)), "H3 نطاقُ الكلية يشمل القسمَ كلَّه", { college: college.size, dept: scope.size });
  const farOutside = [...ids].find(id => !college.has(id));
  const otherDept = [...college].find(id => !scope.has(id));
  await as("admin");
  if (farOutside) {
    const refused = await post(`/api/seats/${deanSeat}/handover`, { instructorId: farOutside });
    check(refused.status === 400 && /ليس من أساتذة الكلية/.test(refused.body?.error || ""), "H3 التسليمُ لأستاذٍ من خارج الكلية مرفوض", refused.body);
  } else console.log("• لا أساتذةَ خارج الكلية في بيانات التجربة: فُحص رفضُ ما خارج القسم فقط");
  if (otherDept) {
    const ok = await post(`/api/seats/${deanSeat}/handover`, { instructorId: otherDept });
    check(ok.status === 200 && ok.body?.holder?.instructorId === otherDept, "H3 العميدُ يسلّم لأستاذٍ من قسمٍ آخر في كليته", ok.body);
  } else console.log("• كلُّ أساتذة كلية التجربة في قسمٍ واحد: لم يُفحص التسليمُ العابر للأقسام");
  const deanText = await post(`/api/seats/${deanSeat}/handover`, { name: "د. اسم مكتوب" });
  check(deanText.status === 400, "H4 العميدُ لا يكتب اسماً أيضاً", deanText.body);

  /* عميد القبول والتسجيل: كلُّ الكليات، وبالبحث والاختيار وحدهما */
  const regSeat = await as("registrarDean");
  const regBroad = await search(regSeat, "تجريبي");
  check(regSeat === 12 && regBroad.status === 200 && regBroad.body?.people?.length === HANDOVER_SEARCH_MAX_RESULTS && Object.keys(regBroad.body).join() === "people", "H5 عميد القبول والتسجيل يبحث بالسقف نفسه وبلا عدّاد", regBroad.body);
  const reachable = new Set<number>();
  for (const id of [...ids].slice(0, 36)) {
    const found = await search(regSeat, nameOf.get(id) || "");
    if ((found.body?.people || []).some((row: any) => Number(row.id) === id)) reachable.add(id);
  }
  check([...college].every(id => reachable.has(id)) && reachable.size > college.size && (!farOutside || reachable.has(farOutside)), "H5 نطاقه كلُّ الكليات: يجد كلَّ أستاذٍ حتى من خارج كلية العميد", { reach: reachable.size, college: college.size, farOutside });
  await as("admin");
  const regText = await post(`/api/seats/${regSeat}/handover`, { name: "د. اسم مكتوب", mobile: "99887766" });
  check(regText.status === 400 && /اختر/.test(regText.body?.error || ""), "H5 والاسم المكتوب مرفوضٌ له أيضاً", regText.body);
  const regGhost = await post(`/api/seats/${regSeat}/handover`, { instructorId: 987654 });
  check(regGhost.status === 400, "H5 ورقمٌ لا وجود له مرفوض", regGhost.body);
  const target = farOutside || [...ids].find(id => !scope.has(id));
  const regDone = await post(`/api/seats/${regSeat}/handover`, { instructorId: target });
  check(regDone.status === 200 && regDone.body?.holder?.instructorId === target, "H5 يسلّم لأستاذٍ من أي كلية", regDone.body);
  const stillRefused = await post("/api/seats/15/handover", { instructorId: outside });
  check(stillRefused.status === 400 && /ليس من أساتذة القسم/.test(stillRefused.body?.error || ""), "H5 وسائرُ الصفات على نطاقها: رئيس القسم يُرفض له ما خارج قسمه", stillRefused.body);

  /* لا قائمةَ كاملة في تفاصيل الكرسي */
  const detail = await json("/api/seats/15");
  check(detail.status === 200 && !("holderCandidates" in (detail.body || {})) && detail.body?.canHandOver === true, "H4 تفاصيلُ الكرسي لا تحمل قائمةَ مرشّحين للتسليم", Object.keys(detail.body || {}));
} catch (error) {
  failed++;
  console.log("\x1b[31m✗ الاختبار الحيّ توقّف:\x1b[0m", error instanceof Error ? error.message : error);
} finally {
  await server?.stop();
}

console.log(`\n${passed} نجح، ${failed} فشل`);
if (failed) process.exit(1);
