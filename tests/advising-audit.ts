/**
 * ── «الإرشاد»: كشف التسجيل ورادار التسجيل — مراجعةُ ما أُصلح (بلا خادم) ─────────────────
 *
 *  A  «قرار سريع»: Enter على زرٍّ أو رابطٍ أو role=button أو من نافذةٍ أخرى لا يوافق، ولا شيء وورقةُ السبب مفتوحة.
 *  B  ورقةُ السبب لا تُغلق قبل الحفظ، ولها Escape وتركيزٌ داخلها؛ والكشفُ لا يرسم ردّاً قديماً تحت قسمٍ جديد.
 *  C  الرحلةُ بوحدةٍ واحدة (الطالب)، والمقرّرُ الذي ألغاه الطالب لا يُعدّ منتظراً.
 *  D  رابطُ الشعبة المفتوحة يبقى بعد القرار التالي، وحذفُها صريحٌ محروس لا صامت.
 *  E  طلبات الشعب: الطلب بالعدد يُكمل ويُغلق، ولا طلبان مفتوحان للمقرر نفسه، والسعةُ تُجمع وتُمحى عند الإغلاق.
 *  F  رصيد مقاعد المرشد: التراجعُ عن آخر إضافةٍ لصاحبها، والبتُّ للمسؤول، ولا استثناءان معلّقان، وحدٌّ واحد، والفصلُ السابق.
 *  G  الرادار: «حدّث الرادار» بفاصلٍ أدنى، ونصوصٌ صادقة، والنوافذ، والتصدير، والبحث، وبابُ ٧/١٤.
 *  H  المجموعةُ في القائمة: الأسماءُ واحدة، والعميدان يقرآن، ولا تنزيلَ لملخّص الرادار عند كل عودة.
 */
import fs from "node:fs";
import { quickDecideKeyAction, type QuickKeyTarget } from "../src/utils/quickDecideKeys";
import {
  approveStudents, closableAfterApproval, countsOf, declineRequest, linkSections, markRegisteredCount, openDuplicateOf, planCapacities, stageOf, withdrawRequest,
  type SectionRequest, type SectionRequestLink,
} from "../src/utils/sectionRequests";
import { mineIn, normalizeQuotaConfig, pendingExceptionOf, SEAT_CONFIG_MAX, seatWritePowers, undoLastAdd, type SeatLedger } from "../src/utils/advisorSeats";
import { manualRunWaitSeconds, radarManualGapMs } from "../src/utils/radarRunGap";
import { journeyFromViews, viewStatuses } from "../src/components/StudentCaseStatus";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");

/* ── A ─────────────────────────────────────────────────────────────────────── */
{
  /* عنصرٌ مصغّر: وسمُه، وأسلافُه بوسومهم وأدوارهم — يكفي لـclosest بالمحدِّدات التي تسألها القاعدة. */
  type Node = { tag: string; role?: string; modal?: boolean; parent?: Node };
  const matches = (node: Node, selector: string) => selector.split(",").some(part => {
    const s = part.trim();
    if (s.startsWith("[role=")) return node.role === s.slice(6, -1);
    if (s === "[aria-modal=true]") return Boolean(node.modal);
    if (s === "a[href]") return node.tag === "A";
    return node.tag.toLowerCase() === s;
  });
  const el = (node: Node): QuickKeyTarget & { node: Node } => ({
    node, tagName: node.tag,
    closest: (selector: string) => { for (let at: Node | undefined = node; at; at = at.parent) if (matches(at, selector)) return at; return null; },
  });
  const quick: Node = { tag: "DIV", role: "dialog", modal: true };
  const card: Node = { tag: "ARTICLE", parent: quick };
  const skipButton = el({ tag: "BUTTON", parent: card });
  const sheet: Node = { tag: "DIV", role: "dialog", modal: true };
  const sheetConfirm = el({ tag: "BUTTON", parent: sheet });
  const bare = el({ tag: "BODY" });
  const span = el({ tag: "SPAN", parent: { tag: "DIV", role: "button", parent: card } });

  check(quickDecideKeyAction("Enter", skipButton, { suspended: false, dialog: quick }) === null, "A1 Enter والتركيزُ على «تخطّ» (زر) لا يوافق — الخطأ الذي ظهر حيّاً");
  check(quickDecideKeyAction("Enter", el({ tag: "A", parent: card }), { suspended: false, dialog: quick }) === null, "A2 ولا على رابط");
  check(quickDecideKeyAction("Enter", span, { suspended: false, dialog: quick }) === null, "A3 ولا داخل [role=button]");
  check(quickDecideKeyAction("Enter", sheetConfirm, { suspended: false, dialog: quick }) === null && quickDecideKeyAction("Escape", sheetConfirm, { suspended: false, dialog: quick }) === null,
    "A4 ولا من نافذةٍ أخرى — ولا حتى Escape");
  check(["Enter", "r", "Escape", " "].every(key => quickDecideKeyAction(key, bare, { suspended: true, dialog: quick }) === null), "A5 ورقةُ السبب مفتوحة: لا اختصارَ يُقرأ");
  check(quickDecideKeyAction("Enter", bare, { suspended: false, dialog: quick }) === "approve" && quickDecideKeyAction("Enter", el(card), { suspended: false, dialog: quick }) === "approve",
    "A6 Enter بلا عنصرٍ تفاعليّ يوافق كما كان");
  check(quickDecideKeyAction("r", bare, { suspended: false }) === "reject" && quickDecideKeyAction("ر", bare, { suspended: false }) === "reject"
    && quickDecideKeyAction("ArrowLeft", bare, { suspended: false }) === "skip" && quickDecideKeyAction(" ", bare, { suspended: false }) === "skip"
    && quickDecideKeyAction("Escape", skipButton, { suspended: false, dialog: quick }) === "close", "A7 R/ر ردّ، والسهمُ والمسافة تخطٍّ، وEscape يغلق ولو من زرٍّ داخل النافذة");
  check(quickDecideKeyAction("Enter", el({ tag: "INPUT", parent: card }), { suspended: false, dialog: quick }) === null, "A8 والحقولُ كما كانت");
  const screen = read("src/components/StudentRegistration.tsx");
  check(screen.includes("quickDecideKeyAction(event.key, event.target as HTMLElement | null, { suspended, dialog: scrim.current })")
    && screen.includes("suspended={Boolean(rejecting)}") && !/tag === "INPUT" \|\| tag === "TEXTAREA" \|\| tag === "SELECT"\) return;\s*\n\s*if \(event.key === "Escape"\)/.test(screen),
    "A9 النافذةُ تسأل القاعدةَ نفسها، وتُعلَّق ما دامت ورقةُ السبب مفتوحة");
}

/* ── B ─────────────────────────────────────────────────────────────────────── */
{
  const screen = read("src/components/StudentRegistration.tsx");
  check(/const saved = !course[\s\S]{0,400}if \(saved\) setRejecting\(null\);/.test(screen) && !/const target = rejecting;\s*\n\s*setRejecting\(null\);/.test(screen),
    "B1 ورقةُ السبب تُغلق بعد حفظٍ ناجح فقط، فلا يضيع السببُ والسطرُ عند الرفض");
  check(screen.includes('if (event.key === "Escape") { event.stopPropagation(); if (!busy) onClose(); return; }') && screen.includes('card.current?.querySelector<HTMLElement>("select")?.focus()'),
    "B2 ورقةُ السبب: Escape يُغلقها، والتركيزُ يبدأ على السبب ويبقى داخلها");
  check(screen.includes("const seq = ++loadSeq.current;") && screen.includes("if (seq !== loadSeq.current) return;") && screen.includes("useEffect(() => { setRows(null); setTotals(null); setLoadFailed(null); }, [collegeId, sectionId, termId]);"),
    "B3 ردٌّ بطيءٌ لقسمٍ سابق لا يُرسم تحت القسم الجديد");
  check(screen.includes('loadFailed.code === "not-signed" ? "لم يُوقَّع جدولُ القسم بعد"') && !/catch \(e: any\) \{ setError\(e\.message\); setRows\(\[\]\); \}/.test(screen),
    "B4 قراءةٌ مردودة تُقال بسببها، لا «لا طلبات بعد»");
  check(screen.includes("error={rejecting ? null : error}") && screen.includes('className="qd-error" role="alert"'), "B5 خطأُ القرار يُقال داخل النافذة لا خلف ستارتها");
}

/* ── C ─────────────────────────────────────────────────────────────────────── */
{
  const rows = [
    { courses: [{ settled: false }, { settled: false }] },
    { courses: [{ settled: true, state: "awaiting-registration", droppedByStudent: true }] },
    { courses: [{ settled: true, state: "awaiting-registration" }, { settled: true, state: "registered" }] },
  ];
  check(viewStatuses(rows[1]).length === 0, "C1 مقرّرٌ ألغاه الطالب لا ينتظر أحداً");
  const journey = journeyFromViews(rows);
  check(journey.all === 3 && journey.pending === 1 && journey.approved === 1 && journey.registered === 1, "C2 كلُّ محطةٍ تعدّ طلبةً، لا مقرّرات", journey);
  const screen = read("src/components/StudentRegistration.tsx");
  check(screen.includes("totals={journey}") && screen.includes("for (const status of new Set(rowStatuses(row)))"), "C3 الشاشةُ ترسم الرحلةَ والمرشّحات بوحدة الطالب");
  check(read("src/server/routes/studentRegistrationRoutes.ts").includes("!course.readOnly && !course.droppedByStudent"), "C4 والخادمُ لا يعدّ الملغى في المجاميع");
}

/* ── D ─────────────────────────────────────────────────────────────────────── */
{
  const repo = read("src/db/repository.ts");
  check(repo.includes('existing?.scheduleId && !("scheduleId" in next)') && repo.includes(".filter(([, value]) => value !== undefined)"),
    "D1 القرارُ التالي لا يمحو رابطَ الشعبة المفتوحة، ويُمحى صراحةً وحده");
  const routes = read("src/server/routes/studentRegistrationRoutes.ts");
  check(routes.includes('app.post("/api/student-registration/:id/close-opened-section"') && routes.includes("row.origin?.refId !== openingRef")
    && routes.includes('state.state !== "committee-rejected" && state.state !== "rejected"') && routes.includes("runScheduleHandler(deleteScheduleHandler"),
    "D2 حذفُ الشعبة: لطلبٍ لم يُوافَق عليه، ولصفٍّ مرجعُه هذا الطلب، وبمسار الحذف المعتاد");
  check(/close-opened-section[\s\S]{0,700}refuseIfTermFrozen/.test(routes) && routes.includes('granted.includes(7) && !req.user?.IsAdminUser'), "D3 ومحروسٌ بالفصل السابق وصلاحية الجدول");
  const screen = read("src/components/StudentRegistration.tsx");
  check(/closeOpenedSection[\s\S]{0,300}visualConfirm\(/.test(screen) && screen.includes("احذف الشعبة من الجدول"), "D4 الشاشةُ تعرض الحذفَ بزرٍّ وتسأل قبله — لا حذفَ صامت");
  check(routes.includes('viewer === "registration" ? "registration" : "department"'), "D5 «إعادة للانتظار» من التسجيل تُنسب إلى التسجيل");
}

/* ── E ─────────────────────────────────────────────────────────────────────── */
{
  const AT = "2026-11-14T08:00:00.000Z";
  const base = (patch: Partial<SectionRequest> = {}): SectionRequest => ({
    id: "1:a", termId: 1, collegeId: 1, sectionId: 2, fromSectionId: 3, courseId: 9, period: "any", count: 40, students: [], sections: [],
    createdAt: AT, updatedAt: AT, createdBy: { userId: 1, name: "م", role: "advisor" }, events: [], ...patch,
  });
  const next = (out: any) => { if ("refuse" in out) throw new Error(out.refuse.error); return out.next as SectionRequest; };
  let countOnly = next(approveStudents(next(linkSections(base(), [{ scheduleId: 7, sectionCode: "501" }], "لجنة", AT)), [], "لجنة", AT));
  check(countsOf(countOnly).approved === 40 && countsOf(countOnly).registered === 0 && stageOf(countOnly) === "approved", "E1 الطلبُ بالعدد المعتمَد: معتمَدُه عددُه كلُّه — فلا يقول الجرسُ «سجّل 0»", countsOf(countOnly));
  check(closableAfterApproval(countOnly) && stageOf(next(withdrawRequest(countOnly, "مرشد", AT))) === "withdrawn" && stageOf(next(declineRequest(countOnly, "لا قاعة", "لجنة", AT))) === "declined",
    "E2 ويُغلق بعد اعتماده ما لم يُسجَّل منه أحد");
  countOnly = next(markRegisteredCount(countOnly, 25, "تسجيل", AT));
  check(stageOf(countOnly) === "registering" && !closableAfterApproval(countOnly) && "refuse" in withdrawRequest(countOnly, "مرشد", AT), "E3 سُجّل بعضُه: «يُسجَّل»، ولا يُغلق بعده");
  countOnly = next(markRegisteredCount(countOnly, 40, "تسجيل", AT));
  check(stageOf(countOnly) === "registered" && "refuse" in markRegisteredCount(countOnly, 41, "تسجيل", AT) && "refuse" in markRegisteredCount(countOnly, 40, "تسجيل", AT), "E4 العددُ كلُّه يُكمل الطلب، وما فوقه أو المكرّرُ يُردّ");
  const listed = next(approveStudents(next(linkSections(base({ students: [{ id: "s1", source: "paste" }] }), [{ scheduleId: 7, sectionCode: "501" }], "لجنة", AT)), ["s1"], "لجنة", AT));
  check(!closableAfterApproval(listed) && "refuse" in withdrawRequest(listed, "مرشد", AT) && "refuse" in markRegisteredCount(listed, 1, "تسجيل", AT), "E5 الطلبُ بقائمة: لا يُغلق بعد الاعتماد، ويُسجَّل بأسمائه");
  const open = base();
  check(openDuplicateOf([open], { termId: 1, collegeId: 1, fromSectionId: 3, courseId: 9 })?.id === "1:a" && !openDuplicateOf([{ ...open, closed: "withdrawn" }], open)
    && !openDuplicateOf([{ ...open, approvedAt: AT }], open) && !openDuplicateOf([open], { ...open, courseId: 10 }), "E6 طلبٌ مفتوحٌ للمقرر نفسه من القسم نفسه يُعرف مكرّراً؛ والمغلقُ والمعتمَد لا");
  const routes = read("src/server/sectionRequestsRoutes.ts");
  check(routes.includes("openDuplicateOf(await termRequests(termId), request)") && routes.includes('code: "duplicate-request"') && routes.includes("withSerialLock(`section-request:"), "E7 الخادمُ يردّ المكرّرَ تحت قفل");
  /* السعة: طلبان من ٥٠ على شعبةٍ واحدة يكتبان ١٠٠؛ وإغلاقُ أحدهما يُبقي ٥٠؛ وسعةُ المسؤول لا تُمسّ. */
  const key = (code: string) => `1:9:${code}`;
  const link = (code: string, extra: Partial<SectionRequestLink> = {}): SectionRequestLink => ({ scheduleId: 1, sectionCode: code, linkedAt: AT, by: "لجنة", ...extra });
  const a = planCapacities([link("501")], 50, {}, key);
  check(a.writes[key("501")] === 50, "E8 الطلبُ الأول يكتب نصيبه", a.writes);
  const b = planCapacities([link("501")], 50, { [key("501")]: 50 }, key, [], 200, { [key("501")]: { shares: 50, applied: [50] } });
  check(b.writes[key("501")] === 100 && b.sections[0].appliedCapacity === 100, "E9 والثاني على الشعبة نفسها يجمع: ١٠٠ لا ٥٠", b.writes);
  const close = planCapacities([], 50, { [key("501")]: 100 }, key, [link("501", { capacity: 50, appliedCapacity: 100 })], 200, { [key("501")]: { shares: 50, applied: [100] } });
  check(close.writes[key("501")] === 50, "E10 إغلاقُ أحدهما يُبقي نصيبَ الآخر", close.writes);
  const lone = planCapacities([], 50, { [key("501")]: 50 }, key, [link("501", { capacity: 50, appliedCapacity: 50 })]);
  check(lone.writes[key("501")] === null, "E11 وإغلاقُ الوحيد يمحو ما كتبه", lone.writes);
  const admin = planCapacities([link("501")], 50, { [key("501")]: 35 }, key, [], 200, { [key("501")]: { shares: 20, applied: [20] } });
  check(!(key("501") in admin.writes), "E12 سعةٌ كتبها المسؤول لا تُمسّ ولو كان على الشعبة طلبٌ آخر", admin.writes);
  check(/declineRequest\(current[\s\S]{0,300}rebalanceCapacities\(next\)/.test(routes) && /withdrawRequest\(current[\s\S]{0,300}rebalanceCapacities\(next\)/.test(routes) && routes.includes("const live = request.closed ? [] : (request.sections || []);"),
    "E13 الاعتذارُ والسحب يُعيدان توزيع السعة (طلبٌ مغلق لا يحجز شيئاً)");
  check(routes.includes("if (left <= 0) continue;") && routes.includes("markRegisteredCount(current, wanted"), "E14 الجرسُ لا يقول «سجّل 0»، والتسجيلُ يكتب عدد الطلب بلا قائمة");
  const panel = read("src/components/sectionRequests/SectionRequestsPanel.tsx");
  check(/confirmWithdraw[\s\S]{0,200}visualConfirm\(/.test(panel) && /confirmApproveAll[\s\S]{0,200}visualConfirm\(/.test(panel) && panel.includes("onClick={() => void confirmWithdraw()}")
    && panel.includes("if (all) void confirmApproveAll({ all: true }, row.students.length)"), "E15 السحبُ واعتمادُ الكل يُسألان قبلهما");
  check(panel.includes('className="srq-done"') && panel.includes("frozen={frozen}") && panel.includes("setCandidatesError(") && panel.includes("طلبات الشعب: {error}"),
    "E16 المغلقُ مطويّ، والفصلُ السابق يعطّل، وأخطاءُ القراءة تُقال");
}

/* ── F ─────────────────────────────────────────────────────────────────────── */
{
  const ledger: SeatLedger = { id: "1:9:501", courseId: 9, capacity: 30, adds: [
    { advisorId: 5, advisorName: "أ", count: 3, at: "1" }, { advisorId: 6, advisorName: "ب", count: 1, at: "2" }, { advisorId: 5, advisorName: "أ", count: 1, at: "3" }] };
  const undone = undoLastAdd(ledger, 5);
  check(Boolean(undone) && undone!.removed.at === "3" && undone!.next.adds.length === 2 && undone!.next.adds.some(add => add.advisorId === 6), "F1 التراجعُ يمحو آخرَ إضافةٍ لصاحبها وحده");
  check(undoLastAdd(ledger, 7) === null && mineIn(ledger, 5).added === 4 && mineIn(ledger, 5).last === 1, "F2 من لم يُضف لا يتراجع؛ وما أضافه كلٌّ يُعدّ له");
  const advisor = seatWritePowers({ power: false, readOnly: true, advisor: true, granted: [14] });
  const dean = seatWritePowers({ power: false, readOnly: true, advisor: false, granted: [14] });
  const chair = seatWritePowers({ power: false, readOnly: false, advisor: false, granted: [7] });
  const head14 = seatWritePowers({ power: false, readOnly: false, advisor: false, granted: [14] });
  check(advisor.canAdd && !advisor.canConfigure && !dean.canAdd && !dean.canConfigure && chair.canAdd && chair.canConfigure && head14.canAdd && !head14.canConfigure,
    "F3 الإضافةُ للمرشد ولصفةٍ تكتب، والإعدادُ والبتُّ لصاحب الجدول (٧) — كما يحرس الخادم");
  check(pendingExceptionOf([{ key: "k", status: "pending", byId: 5 }], "k", 5) !== null && pendingExceptionOf([{ key: "k", status: "declined", byId: 5 }], "k", 5) === null
    && pendingExceptionOf([{ key: "k", status: "pending", byId: 6 }], "k", 5) === null, "F4 طلبُ استثناءٍ معلّقٌ لي على الشعبة نفسها يمنع الثاني");
  check(SEAT_CONFIG_MAX === 200 && normalizeQuotaConfig({ capacityDefault: 500, global: 999 }, "x").capacityDefault === 200, "F5 الحدُّ ٢٠٠ في الخادم");
  const panel = read("src/components/AdvisorSeatsPanel.tsx");
  check(!panel.includes("max={500}") && panel.includes("max={max}") && panel.includes("data.maxConfig || SEAT_CONFIG_MAX"), "F6 والحدُّ نفسُه في خانة الإدخال");
  check(panel.includes("{canAdd ? <>") && panel.includes("const canAdd = data.canAdd !== false && !frozen;") && panel.includes("🔒 فصلٌ سابق"), "F7 لا زرَّ لمن يردّه الخادم، ولا كتابةَ في فصلٍ سابق");
  check(panel.includes('"/api/advisor-seats/undo"') && panel.includes('"/api/advisor-seats/exception/resolve"') && /catch \(e: any\) \{\s*\n\s*say\(key/.test(panel), "F8 التراجعُ والبتُّ في الشاشة، والخطأُ يُقال على البطاقة");
  const routes = read("src/server/routes/offeringRoutes.ts");
  for (const path of ["/api/advisor-seats/config", "/api/advisor-seats/add", "/api/advisor-seats/undo", "/api/advisor-seats/exception\"", "/api/advisor-seats/exception/resolve"]) {
    const at = routes.indexOf(path.endsWith("\"") ? `"${path}` : `"${path}"`);
    check(at > 0 && routes.slice(at, at + 900).includes("refuseIfTermFrozen(res, termId)"), `F9 ${path.replace("\"", "")}: الفصلُ السابق يُردّ`);
  }
  check(routes.includes("undoLastAdd(") && routes.includes("res.locals.auditChanges = `مرشد: تراجع عن") && routes.includes('code: "duplicate-exception"'), "F10 التراجعُ مدقَّق، والاستثناءُ المكرّر مردود");
  check(read("src/server/roleGuard.ts").includes('"/advisor-seats/undo"'), "F11 حارسُ الأدوار يفتح التراجعَ للمرشد كما يفتح الإضافة");
}

/* ── G ─────────────────────────────────────────────────────────────────────── */
{
  check(manualRunWaitSeconds(new Date(1_000_000).toISOString(), 1_000_000 + 30_000, 120_000) === 90 && manualRunWaitSeconds(new Date(1_000_000).toISOString(), 1_000_000 + 121_000, 120_000) === 0
    && manualRunWaitSeconds(undefined, 5, 120_000) === 0 && manualRunWaitSeconds(new Date(1_000_000).toISOString(), 1_000_001, 0) === 0, "G1 الفاصلُ الأدنى: كم بقي، و0 بلا تشغيلٍ سابق أو بفاصلٍ ملغى");
  check(radarManualGapMs({}) === 120_000 && radarManualGapMs({ RADAR_MANUAL_GAP_SECONDS: "0" }) === 0 && radarManualGapMs({ RADAR_MANUAL_GAP_SECONDS: "30" }) === 30_000, "G2 الافتراضيُّ دقيقتان، ويُضبط بمتغيّر البيئة");
  const routes = read("src/server/simulationRoutes.ts");
  check(routes.includes('code: "too-soon"') && routes.includes("manualRunWaitSeconds(last?.ranAt, Date.now(), radarManualGapMs())"), "G3 POST /api/simulation/run يردّ تشغيلاً قبل انقضاء الفاصل");
  check(["summary", "insight", "outcome"].every(name => routes.includes(`app.get("/api/simulation/${name}", deps.requireAuth, radarReader,`)) && routes.includes("id === 7 || id === 14"),
    "G4 مساراتُ شاشة الرادار ببابها: ٧ أو ١٤ أو إدارة النظام");
  const radar = read("src/components/RegistrationRehearsal.tsx");
  check(radar.includes("حدّث الرادار") && radar.includes("data?.canRun && !frozen") && radar.includes("/يُحدَّث الآن|قبل قليل/"), "G5 «حدّث الرادار» لمن يشغّله، و«قبل قليل» ليس خطأً يُقال");
  check(radar.includes("التحديثُ التلقائي متوقف") && !radar.includes("لا حاجة إلى تشغيله يدوياً."), "G6 النصوصُ صادقةٌ حين يتوقف التلقائي");
  check(radar.includes('className="sm-windows"') && radar.includes("[`نافذة ${index + 1}`, count]"), "G7 نوافذُ التسجيل في الشاشة وفي التقرير");
  check(radar.includes('scenario === "projected" ? data.projectedCourses || [] : data.courses || []).map(c => [') && radar.includes(".toLowerCase().includes(needle)"), "G8 التقريرُ للمصدر المختار، والبحثُ بلا حساسيةٍ لحالة الأحرف");
  check(!radar.includes("const coverage") && !radar.includes("const maxWindow") && ["ApplyProposal", "postScheduleProposal", "postWhatIf", "formatScheduleTimeRange"].every(name => radar.includes(name)),
    "G9 لا متغيّرات ميتة، والاستيراداتُ التي يحتاجها العملُ الجاري باقية");
  const data = read("src/server/simulationData.ts");
  check(data.includes("Number(catalogOwner?.AdSectionId) || base.sectionId"), "G10 المقرّرُ يُنسب إلى مالكه في الكتالوج لا إلى قسم أول شعبة");
}

/* ── H ─────────────────────────────────────────────────────────────────────── */
{
  const app = read("src/App.tsx");
  check(!app.includes('fetch("/api/simulation/summary"') && app.includes("const simulationVisible = Boolean(user) && (isPowerAdmin || hasPerm(7) || hasPerm(14));"),
    "H1 ظهورُ الرادار من الأذونات، بلا تنزيل الملخّص كاملاً عند كل عودة");
  check(app.includes('case "studentRegistration":') && /return hasPerm\(7\) \|\| hasPerm\(14\) \? \(/.test(app) && app.includes("{allowed.schedule || hasPerm(14) || simulationVisible ? ("),
    "H2 صفاتُ العرض الصرف تقرأ المجموعة (FR-STU-016)، والخادمُ يحجب الهوية ويقول canWrite=false");
  const tabs = read("src/components/RegistrationTabs.tsx");
  check(tabs.includes('label: "رادار التسجيل"') && app.includes('label="رادار التسجيل"') && read("src/components/RegistrationRehearsal.tsx").includes(")}>رادار التسجيل</PageTitle>"),
    "H3 «رادار التسجيل» اسمٌ واحد في القائمة والتبويب والعنوان");
  check(read("src/components/StudentRegistration.tsx").includes('<ClipboardList aria-hidden="true" /> الإرشاد</>') && read("src/components/RegistrationRehearsal.tsx").includes('eyebrow="الإرشاد"'),
    "H4 وعنوانُ المجموعة «الإرشاد» فوق الشاشتين");
  const all = ["src/components/RegistrationTabs.tsx", "src/components/RegistrationRehearsal.tsx", "src/App.tsx"].map(read).join("\n");
  check(!all.includes("رادار يوم التسجيل"), "H5 لا اسمَ ثانياً للرادار");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
