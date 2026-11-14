/**
 * ── «يوم التسجيل الحي» ───────────────────────────────────────────────────────
 *  U  المنطق النقيّ (src/utils/liveBoard.ts): حالات الامتلاء، الترتيب بالإلحاح، العمر والقِدَم، المصدر الأحدث.
 *  P  الخصوصية: حمولةُ اللوحة أعدادٌ فقط، بلا أسماء ولا معرّفات طلبة.
 *  S  التوصيل: المسارُ بحارس الرادار، وبابُ الفصل المجمَّد، والنبضةُ الحيّة، وتركيبُ الشاشة، وحارسُ «اعتمد الشعبة».
 */
import fs from "node:fs";
import path from "node:path";
import {
  alternativeAnchors, asOfLine, buildLiveBoard, coursesNeedingAlternative, fillRatio, fillState, freshestSource, freshnessOf, headerOf, isRegistrationDay,
  orderBoard, STALE_ACTIVE_MS, STALE_IDLE_MS, type BoardCourseSignal, type BoardSectionInput,
} from "../src/utils/liveBoard";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── U: الحالات ── */
check(fillRatio(5, 0) === null && fillRatio(5, -1) === null, "بلا سعةٍ لا نسبة (لا قسمةَ على صفر ولا تخمين)");
check(fillState(null) === null, "بلا نسبةٍ لا حالة");
check(fillState(0.79) === "open" && fillState(0.8) === "filling" && fillState(0.99) === "filling" && fillState(1) === "full" && fillState(1.2) === "full", "العتبات: متاح دون ٨٠٪، يمتلئ من ٨٠٪، ممتلئ عند ١٠٠٪");

const NOW = Date.parse("2026-11-14T10:00:00Z");
const sec = (key: string, courseId: number, over: Partial<BoardSectionInput> = {}): BoardSectionInput => ({
  key, courseId, collegeId: 1, sectionId: 11, code: `C${courseId}`, name: `مقرر ${courseId}`, sectionCode: key, time: "08:00 - 09:15", capacity: 30, simTaken: 0, advisorAdded: 0, ...over,
});
const none: BoardCourseSignal = { reportedRegistered: 0, reportedFull: 0, approved: 0, requestRegistered: 0, simWaiting: 0 };
const stamps = (reports: string | null, requests: string | null, sim: string | null) => ([
  { source: "reports" as const, asOf: reports, present: Boolean(reports) },
  { source: "requests" as const, asOf: requests, present: Boolean(requests) },
  { source: "simulation" as const, asOf: sim, present: Boolean(sim) },
]);

const board = buildLiveBoard({
  sections: [sec("101", 1, { simTaken: 10 }), sec("201", 2, { simTaken: 30 }), sec("301", 3, { simTaken: 26 }), sec("302", 3, { simTaken: 20 }), sec("401", 4, { simTaken: 29 }), sec("501", 5, { capacity: 0, simTaken: 0 })],
  courses: new Map<number, BoardCourseSignal>([
    [2, { ...none, simWaiting: 7 }], [3, { ...none, reportedFull: 4 }], [4, { ...none, simWaiting: 2 }],
  ]),
  stamps: stamps(null, null, "2026-11-14T09:30:00Z"), now: NOW, roundActive: true,
});
const byKey = new Map(board.rows.map(row => [row.key, row] as const));
check(byKey.get("101")?.state === "open", "١٠ من ٣٠ ← متاح");
check(byKey.get("201")?.state === "full" && byKey.get("201")?.waiting === 7, "٣٠ من ٣٠ ← ممتلئ ومعه ٧ منتظرين من المحاكاة");
check(byKey.get("401")?.state === "filling" && byKey.get("401")?.needsAlternative, "٢٩ من ٣٠ ويوجد منتظرون ← يمتلئ ويحتاج بديلاً");
check(byKey.get("501")?.state === null && byKey.get("501")?.fill === null, "شعبةٌ بلا سعة ← حالةٌ غير معروفة لا مخمَّنة");
check(byKey.get("302")?.state === "filling" && byKey.get("302")?.source === "reports" && byKey.get("302")?.lowerBound, "من قال «لم أجد مقعداً» يرفع شعب المقرر إلى «يمتلئ» ويُنسب الرقم إلى أجوبة الطلبة");
check(byKey.get("301")?.waiting === 4 && byKey.get("301")?.waitingSource === "reports", "المنتظرون الحقيقيون يغلبون تقدير المحاكاة");
check(board.rows[0].key === "201", "الأول: الممتلئ وفيه منتظرون");
check(board.rows.map(row => row.key).join() === "201,301,302,401,101,501", "الترتيب بالإلحاح ثم المنتظرين ثم الامتلاء");
check(board.counts.waiting === 7 + 4 + 2, "المنتظرون يُعدّون لكل مقررٍ مرةً واحدة لا بعدد شعبه");

/* الحقيقةُ ترفع ولا تخفض */
const raised = buildLiveBoard({
  sections: [sec("101", 1, { capacity: 40, simTaken: 4 })],
  courses: new Map([[1, { ...none, reportedRegistered: 38, requestRegistered: 2 }]]), stamps: stamps("2026-11-14T09:59:00Z", null, "2026-11-14T08:00:00Z"), now: NOW, roundActive: true,
}).rows[0];
check(raised.state === "full" && raised.source === "reports" && raised.lowerBound, "مسجَّلون فعلاً بقدر السعة ← ممتلئٌ رغم أن المحاكاة تقول ١٠٪ (حدٌّ أدنى من الأجوبة)");
const lowReal = buildLiveBoard({
  sections: [sec("101", 1, { simTaken: 30 })], courses: new Map([[1, { ...none, reportedRegistered: 1 }]]), stamps: stamps("2026-11-14T09:00:00Z", null, "2026-11-14T09:00:00Z"), now: NOW, roundActive: true,
}).rows[0];
check(lowReal.state === "full" && lowReal.source === "simulation" && !lowReal.lowerBound, "الأجوبةُ القليلة لا تخفض ما تقوله المحاكاة");
const pending = buildLiveBoard({
  sections: [sec("101", 1, { simTaken: 5 })], courses: new Map([[1, { ...none, approved: 10, requestRegistered: 4 }]]), stamps: stamps(null, "2026-11-14T09:00:00Z", null), now: NOW, roundActive: true,
}).rows[0];
check(pending.waiting === 6 && pending.waitingSource === "requests", "المعتمَدون ولم يُسجَّلوا بعد = منتظرون من طلبات الشعب");

/* ── ترتيبٌ مستقر وأولويات ── */
const ordered = orderBoard([
  { state: "open" as const, waiting: 0, fill: 0.1, code: "A", sectionCode: "1" }, { state: "filling" as const, waiting: 0, fill: 0.9, code: "B", sectionCode: "1" },
  { state: "full" as const, waiting: 0, fill: 1, code: "C", sectionCode: "1" }, { state: "filling" as const, waiting: 3, fill: 0.85, code: "D", sectionCode: "1" },
  { state: "full" as const, waiting: 2, fill: 1, code: "E", sectionCode: "1" }, { state: null, waiting: 0, fill: null, code: "F", sectionCode: "1" },
]);
check(ordered.map(row => row.code).join("") === "ECDBAF", "الممتلئ (بمنتظرين ثم بلا) يسبق «يمتلئ»، وفي كل درجةٍ من فيه منتظرون أولاً، والمجهول آخراً");
check(alternativeAnchors(board.rows).size === coursesNeedingAlternative(board.rows, 99).length && coursesNeedingAlternative(board.rows, 2).length === 2, "البديلُ لمقررٍ مرةً واحدة وبحدٍّ أعلى");
check(!alternativeAnchors(board.rows).has("101") && !alternativeAnchors(board.rows).has("501"), "المتاح والمجهول لا يحتاجان بديلاً");

/* ── العمر والقِدَم ── */
check(freshnessOf("2026-11-14T09:59:30Z", NOW, true).ageLine === "الآن", "أقلُّ من دقيقة ← «الآن»");
check(freshnessOf("2026-11-14T09:15:00Z", NOW, true).ageLine === "منذ 45 د", "منذ ٤٥ دقيقة");
check(!freshnessOf(new Date(NOW - STALE_ACTIVE_MS + 1000).toISOString(), NOW, true).stale && freshnessOf(new Date(NOW - STALE_ACTIVE_MS - 1000).toISOString(), NOW, true).stale, "في الجولة: ما فوق ثلاث ساعات قديم");
check(!freshnessOf(new Date(NOW - STALE_ACTIVE_MS - 1000).toISOString(), NOW, false).stale && freshnessOf(new Date(NOW - STALE_IDLE_MS - 1000).toISOString(), NOW, false).stale, "خارج الجولة: الحدّ يومان");
check(freshnessOf(null, NOW, true).stale && freshnessOf("ليس تاريخاً", NOW, true).ageLine === "غير مؤرَّخ", "بلا تاريخٍ ← قديمٌ وغير مؤرَّخ (لا ندّعي حداثة)");
const best = freshestSource(stamps("2026-11-14T08:00:00Z", "2026-11-14T09:00:00Z", "2026-11-14T07:00:00Z"));
check(best?.source === "requests", "المصدر الأحدث هو المعروض");
check(freshestSource(stamps(null, null, null)) === null, "لا تاريخَ لأي مصدر ← لا مصدر");
const simOnly = headerOf(stamps(null, null, "2026-11-14T09:00:00Z"), NOW, true);
check(simOnly.simulationOnly && simOnly.source === "simulation", "إن كان الأحدث (والوحيد) محاكاةً قيل ذلك في الرأس");
const mixed = headerOf(stamps("2026-11-14T09:50:00Z", null, "2026-11-14T09:55:00Z"), NOW, true);
check(!mixed.simulationOnly && mixed.source === "simulation", "وجودُ عدٍّ حقيقي ينفي «محاكاةٌ فقط» ولو كانت المحاكاة أحدث");
check(asOfLine(simOnly, "١٤ نوفمبر ١٢:٠٠").startsWith("آخر تحديث للأرقام: ١٤ نوفمبر ١٢:٠٠") && asOfLine(simOnly, "x").includes("· المصدر: محاكاة الرادار"), "سطر «آخر تحديث للأرقام … · المصدر …»");
check(headerOf(stamps(null, null, null), NOW, true).stale && headerOf(stamps(null, null, null), NOW, true).source === null, "لا مصدرَ ← تحذيرُ قِدَم");
check(isRegistrationDay("round") && !isRegistrationDay("between") && !isRegistrationDay("wishes") && !isRegistrationDay(undefined), "يومُ التسجيل = جولةٌ جارية فقط");

/* ── P: الخصوصية ── */
const json = JSON.stringify(board);
const KEYS = new Set<string>();
(function walk(value: unknown) { if (value && typeof value === "object") for (const [key, inner] of Object.entries(value)) { KEYS.add(key); walk(inner); } })(JSON.parse(json));
check(![...KEYS].some(key => /student|fingerprint|civil|nameCipher|studentName|email|phone/i.test(key)), "مفاتيح الحمولة بلا حقلِ طالبٍ ولا معرّفٍ ولا بصمة");
check(!/fingerprint|civil|cipher|studentIds?/i.test(json), "نصُّ الحمولة بلا بصمةٍ ولا رقمٍ مدني ولا قائمة معرّفات");
const KNOWN = ["header", "rows", "counts", "asOf", "source", "sourceLabel", "ageLine", "stale", "simulationOnly", "sources", "label", "present", "key", "courseId", "collegeId", "sectionId", "code", "name", "sectionCode", "time", "capacity", "fill", "state", "lowerBound", "waiting", "waitingSource", "advisorAdded", "needsAlternative", "open", "filling", "full", "unknown"];
check(![...KEYS].filter(key => !/^\d+$/.test(key)).some(key => !KNOWN.includes(key)) || (console.log([...KEYS].filter(key => !KNOWN.includes(key))), false), "الحمولةُ كلُّها حقولٌ معلومة (لا تسرّب حقلٍ جديد دون مراجعة)");
const server = read("src/server/liveBoard.ts");
check(!/nameCipher|civilCipher|getStudentNeeds|students\b.*map\(/.test(server.replace(/\/\*[\s\S]*?\*\//g, "")), "الخادم لا يقرأ هويات الطلبة ولا قوائمهم");
check(/countsOf\(request\)/.test(server) && !/request\.students/.test(server), "طلباتُ الشعب تُقرأ أعداداً عبر countsOf لا قوائمَ طلبة");

/* ── S: التوصيل ── */
const routes = read("src/server/simulationRoutes.ts");
check(/registerLiveBoardRoutes\(app, \{[^}]*radarReader/.test(routes), "المسار يُسجَّل مع radarReader نفسه");
check(/app\.get\("\/api\/simulation\/live-board", deps\.requireAuth, deps\.radarReader/.test(server), "GET /api/simulation/live-board بحارس requireAuth ثم radarReader");
check(/isScopeAllowed\(req, item\.collegeId, item\.sectionId\)|mine\(item\.collegeId, item\.sectionId\)/.test(server) && /isPowerUser\(req\)/.test(server), "نطاقُ القارئ على كل شعبة (isPowerUser أو isScopeAllowed)");
check(/collegePick/.test(server) && /sectionPick/.test(server), "منتقي الكلية والقسم يضيّق");
check(/asked && asked !== Number\(term\.AdTermId\)/.test(server), "فصلٌ غير فصل الباب (المجمَّد) لا لوحةَ له");
check(/canAdopt: writer && \(power \|\| deps\.isScopeAllowed/.test(server) && /granted\.includes\(7\)/.test(server), "canAdopt = صلاحية الجدول (٧) ونطاق قسم المقرر");
check(/baselineOf/.test(read("src/server/radarSuggestions.ts")) && /suggestionFor/.test(server), "البديل من محرّك الرادار نفسه وذاكرته");
const ui = read("src/components/LiveRegistrationBoard.tsx");
check(/onLiveSignal\(\["notify", "schedules"\]/.test(ui), "اللوحةُ تتجدّد بالنبضة الحيّة");
check(!/setInterval/.test(ui), "بلا استطلاعٍ متواصل");
check(/<SuggestionCard/.test(ui) && /canSchedule && suggestion\.canAdopt/.test(ui), "بطاقةُ البديل هي بطاقةُ الرادار نفسها، والاعتماد لمن يكتب الجدول في نطاق القسم");
check(/if \(frozen\) return null/.test(ui), "الفصل المجمَّد: لا لوحة");
check(/header\.stale/.test(ui) && /header\.simulationOnly/.test(ui) && /asOfLine/.test(ui), "الرأس: سطر آخر تحديث، وتحذير القِدَم، وقول «محاكاة»");
check(/roundActive/.test(ui) && /pick \?\? roundActive/.test(ui), "بارزةٌ تلقائياً في الجولة، وبزرٍّ في غيرها");
const rr = read("src/components/RegistrationRehearsal.tsx");
check(/<LiveRegistrationBoard[^>]*roundActive=\{data\.phase\?\.key === "round"\}/.test(rr) && /canSchedule=\{canSchedule\}/.test(rr), "الرادار يركّب اللوحة بمرحلة الفصل وصلاحية الجدول");
check(/broadcastStudentNotifySoon\(\)/.test(read("src/server/studentDoorRoutes.ts")), "جوابُ الطالب «هل سجلت؟» يوقظ النبضة");
check(/updatedAt: new Date\(\)\.toISOString\(\)/.test(read("src/db/repository.ts")) && /doc\.updatedAt = /.test(read("src/db/repository.ts")), "شظايا الأجوبة تحمل تاريخَ آخر جواب");
check(/62-live-board\.css/.test(read("src/index.css")), "الأنماط مستوردة (٦٢)");
const css = read("src/styles/62-live-board.css");
check(/min-block-size:44px/.test(css) && /max-width:480px/.test(css), "أهدافُ ٤٤px وتخطيطٌ للهاتف");
check(!/!important/.test(css), "بلا !important");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
