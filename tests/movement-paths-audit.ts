/**
 * ── مسارات التنقّل: المسار، وتقدير المشي، والتنبيهات، والترتيب ───────────────
 *
 * يحرس src/utils/movementPaths: ترتيب محاضرات اليوم، وأن تقدير المشي يزيد من
 * القاعة نفسها إلى الطابق نفسه إلى طابقٍ آخر إلى مبنى آخر، وأن التنبيهات الثلاثة
 * (انتقالٌ ضيّق، فراغٌ طويل للدفعة، ذهابٌ وإياب) تقع عند عتباتها المسمّاة لا قبلها،
 * وأن «أصعب التنقلات» يضع الضيّق أولاً، وأن «اقترح قاعة أقرب» لا يقترح إلا قاعةً
 * أقرب فعلاً ومن النوع نفسه وفارغة ومقروءاً إشغالها، وأن العلامة تقف عند المحطة
 * أثناء المحاضرة وتمشي بين المحطتين. ثم التوصيل: لا يظهر في عدسة التقارير.
 */
import fs from "fs";
import path from "path";
import { buildPulseModel, hallFreeFor, layoutHalls, originalAssignment, type PulseLayout } from "../src/utils/hallPulse";
import {
  BUILDING_CHANGE_MIN, LONG_IDLE_GAP_MIN, TIGHT_BUILDING_GAP_MIN, buildPaths, hopScore, markerAt, nearerHalls, rankHops, walkEstimate, pulseCohortsAccess,
} from "../src/utils/movementPaths";
import { affectedPaths, applyWhatIf, dropStatus, pushWhatIf, tightCount } from "../src/utils/pulseWhatIf";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const registry = {
  buildings: [{ id: "b1", officialCode: "901A01", buildingNumber: "1" }, { id: "b2", officialCode: "901A02", buildingNumber: "2" }],
  rooms: [
    { id: "r101", buildingId: "b1", canonicalCode: "101", capacity: 40 },
    { id: "r102", buildingId: "b1", canonicalCode: "102", capacity: 40 },
    { id: "r103", buildingId: "b1", canonicalCode: "103", capacity: 40 },
    { id: "r201", buildingId: "b1", canonicalCode: "201", capacity: 40 },
    { id: "r301", buildingId: "b2", canonicalCode: "301", capacity: 60 },
    { id: "rL", buildingId: "b1", canonicalCode: "L01", capacity: 30, roomType: "مختبر حاسوب" },
  ],
};
const courses = [1, 2, 3, 4, 5, 6].map(id => ({ AdCourseId: id, CourseName: `مقرر ${id}`, MaxStudent: 30 }));
let next = 1;
const row = (course: number, teacher: number, room: string, start: string, end: string, scode = "01", days = { fsunday: true }) =>
  ({ id: next++, AdSectionId: 9, AdCourseId: course, AdInstructorId: teacher, SCode: scode, fstarttime: start, fendtime: end, roomId: room, ...days });
const rows = [
  /* الأستاذ 7: 101 ← 301 (مبنى آخر بفجوة 5 دقائق: ضيّق) ← 102 (رجوع إلى المبنى الأول: ذهابٌ وإياب) */
  row(1, 7, "r101", "08:00", "09:15"),
  row(2, 7, "r301", "09:20", "10:35"),
  row(3, 7, "r102", "11:00", "12:15"),
  /* الأستاذ 8: القاعة نفسها مرتين — لا تنبيه */
  row(4, 8, "r103", "08:00", "09:15"),
  row(5, 8, "r103", "09:30", "10:45"),
  /* دفعة «المستوى نفسه» ش 02: محاضرتان بينهما أربع ساعات (فراغٌ طويل) */
  row(1, 9, "r201", "08:00", "09:15", "02"),
  row(3, 10, "r101", "13:30", "14:45", "02"),
];
const roomLoad = { checkedRoomIds: registry.rooms.map(r => r.id), rooms: [] };
const model = buildPulseModel({ rows, courses, registry, roomLoad, includeUnusedRegistryHalls: true, requireOccupancyCheck: true });
const layout: PulseLayout = layoutHalls(model.halls);
const base = originalAssignment(model);
const key = (id: string) => `id:${id}`;

/* ── تقدير المشي ── */
const same = walkEstimate(model, layout, key("r101"), key("r101"));
const floor = walkEstimate(model, layout, key("r101"), key("r102"));
const upstairs = walkEstimate(model, layout, key("r101"), key("r201"));
const other = walkEstimate(model, layout, key("r101"), key("r301"));
check(same.kind === "same-hall" && same.minutes === 0, "القاعة نفسها: صفر دقيقة");
check(floor.kind === "same-floor" && floor.minutes > 0, "الطابق نفسه: مشيٌ قصير");
check(upstairs.kind === "floor" && upstairs.minutes > floor.minutes, "طابقٌ آخر أبعد من الطابق نفسه");
check(other.kind === "building" && other.minutes >= BUILDING_CHANGE_MIN && other.minutes > upstairs.minutes, "مبنى آخر أبعد من طابقٍ آخر، ولا يقل عن كلفة الخروج والدخول");

/* ── المسارات والتنبيهات ── */
const names = (id: number) => `أستاذ ${id}`;
const cohorts = [{ key: "L1", label: "دفعة: مقرر 1، مقرر 3", courseIds: new Set([1, 3]) }];
const paths = buildPaths(model, base, layout, "fsunday", { instructorName: names, cohorts });
const t7 = paths.find(x => x.id === "t:7")!, t8 = paths.find(x => x.id === "t:8")!, c = paths.find(x => x.kind === "cohort" && x.label.endsWith("ش 02"))!;
check(Boolean(t7 && t8 && c), "مسارٌ لكل أستاذٍ له محاضرتان، ولكل دفعةٍ (مستوى × رمز شعبة)");
check(t7.stops.map(st => st.hallKey).join() === [key("r101"), key("r301"), key("r102")].join(), "المحطات بترتيب المحاضرات في اليوم");
check(t7.hops[0].kind === "building" && t7.hops[0].gap === 5 && t7.hops[0].flags.includes("tight"), `مبنى آخر بفجوة 5 دقائق (≤ ${TIGHT_BUILDING_GAP_MIN}): انتقالٌ ضيّق`);
check(t7.hops[1].flags.includes("pingpong"), "رجوعٌ إلى المبنى الأول بعده: ذهابٌ وإياب");
check(t8.hops[0].kind === "same-hall" && t8.hops[0].flags.length === 0, "القاعة نفسها: لا تنبيه");
check(c.hops[0].gap === 255 && c.hops[0].flags.includes("idle") && c.hops[0].gap >= LONG_IDLE_GAP_MIN, "دفعةٌ بفراغ أربع ساعات وربع: فراغٌ طويل");
check(!t7.hops.some(h => h.flags.includes("idle")), "الفراغ الطويل تنبيهٌ للدفعات لا للأساتذة");
check(paths.every(pth => pth.label && !/\d{9,}/.test(pth.label)), "لا رقم مدني في أسماء المسارات");

/* العتبة نفسها: 10 دقائق ضيّق، و11 ليس ضيّقاً إن كفى المشي. */
{
  let k = 500;
  const r2 = [
    { id: k++, AdSectionId: 9, AdCourseId: 1, AdInstructorId: 3, fstarttime: "08:00", fendtime: "09:00", roomId: "r101", fsunday: true },
    { id: k++, AdSectionId: 9, AdCourseId: 2, AdInstructorId: 3, fstarttime: "09:10", fendtime: "10:00", roomId: "r301", fsunday: true },
    { id: k++, AdSectionId: 9, AdCourseId: 1, AdInstructorId: 4, fstarttime: "08:00", fendtime: "09:00", roomId: "r102", fsunday: true },
    { id: k++, AdSectionId: 9, AdCourseId: 2, AdInstructorId: 4, fstarttime: "09:31", fendtime: "10:00", roomId: "r301", fsunday: true },
  ];
  const m2 = buildPulseModel({ rows: r2, courses, registry, roomLoad, includeUnusedRegistryHalls: true, requireOccupancyCheck: true });
  const l2 = layoutHalls(m2.halls);
  const p2 = buildPaths(m2, originalAssignment(m2), l2, "fsunday", { instructorName: names });
  check(p2.find(x => x.id === "t:3")!.hops[0].flags.includes("tight"), "عشر دقائق إلى مبنى آخر: ضيّق (العتبة شاملة)");
  check(!p2.find(x => x.id === "t:4")!.hops[0].flags.includes("tight"), "واحدٌ وثلاثون دقيقة إلى مبنى آخر: ليس ضيّقاً");
}

/* ── الترتيب ── */
const ranked = rankHops(paths);
check(ranked.length >= 3 && ranked[0].hop.flags.includes("tight"), "«أصعب التنقلات»: الضيّق أولاً");
check(ranked.every((r, i) => i === 0 || ranked[i - 1].hop.score >= r.hop.score), "مرتّبةٌ بالصعوبة تنازلياً");
check(ranked.every(r => r.hop.flags.length > 0), "لا يدخلها إلا انتقالٌ عليه تنبيه");
check(hopScore({ flags: ["tight"], gap: 5, walk: 8 }) > hopScore({ flags: ["pingpong"], gap: 40, walk: 3 }) && hopScore({ flags: ["pingpong"], gap: 40, walk: 3 }) > hopScore({ flags: ["idle"], gap: 200, walk: 2 }), "الضيّق أصعب من الذهاب والإياب، وهو أصعب من الفراغ");

/* ── «اقترح قاعة أقرب» ── */
const tight = t7.hops[0];
const nears = nearerHalls(model, base, layout, tight);
const nowWalk = walkEstimate(model, layout, tight.from.hallKey, tight.to.hallKey).minutes;
check(nears.length > 0, "انتقالٌ ضيّق إلى مبنى آخر: تُقترح قاعةٌ أقرب");
check(nears.every(x => x.walk < nowWalk), "كل مقترحٍ أقرب فعلاً من القاعة الحالية");
check(nears.every(x => !x.hall.lab), "ومن النوع نفسه (لا مختبر لمحاضرةٍ نظرية)");
check(nears.every(x => hallFreeFor(model, base, x.hall.key, model.sessionById.get(x.sessionId)!)), "وكل مقترحٍ فارغٌ في أيام الشعبة ووقتها كله");
check(!nears.some(x => x.hall.key === key("r103") && x.sessionId === tight.to.sessionId), "ولا قاعةٌ مشغولة وقتها (103 تشغلها شعبةٌ 09:30)");
{
  const blind = buildPulseModel({ rows, courses, registry, roomLoad: { rooms: [] }, includeUnusedRegistryHalls: true, requireOccupancyCheck: true });
  const lb = layoutHalls(blind.halls);
  const pb = buildPaths(blind, originalAssignment(blind), lb, "fsunday", { instructorName: names });
  check(nearerHalls(blind, originalAssignment(blind), lb, pb.find(x => x.id === "t:7")!.hops[0]).length === 0, "وقاعةٌ لم يُقرأ إشغالها لا تُقترح");
}

/* ── العلامة ── */
check(markerAt(t7, 8 * 60 + 30).hop === null && markerAt(t7, 8 * 60 + 30).stop === 0, "أثناء المحاضرة الأولى: العلامة عند محطتها");
const mid = markerAt(t7, 9 * 60 + 17);
check(mid.hop === 0 && mid.progress > 0.3 && mid.progress < 0.7, "بين محاضرتين: العلامة في منتصف الطريق تقريباً");
check(markerAt(t7, 11 * 60 + 30).stop === 2 && markerAt(t7, 11 * 60 + 30).hop === null, "في المحاضرة الثالثة: عند المحطة الثالثة");

/* ── التوصيل ── */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const pulse = read("src/components/hallPulse/HallPulse.tsx");
const scene = read("src/components/hallPulse/pulseScene.ts");
check(/const pathsAllowed = context === "workshop" \|\| context === "dean"/.test(pulse), "المسارات في الورشة ولوحة العميد وحدهما، لا في عدسة التقارير");
check(/nearerHalls\(model, assignment, layout, hop\)/.test(pulse) && /previewSessionMove/.test(pulse) && /savePending/.test(pulse), "«اقترح قاعة أقرب» يمرّ بالمراجعة ثم الحفظ المعتاد");
check(/setPath\(/.test(scene) && /setMarker\(/.test(scene) && /clearPath\(\)/.test(scene), "المشهد يرسم المسار ويمحوه ويُفرغ موارده");
check(/تقدير/.test(pulse) && /HOP_FLAG_LABEL/.test(pulse), "المشي موسومٌ «تقدير»، والتنبيهات بأسمائها");

/* ── دفعات القسم للعميد: قراءةٌ فقط لكليته وحدها ── */
{
  const base = { isAdmin: false, deanReader: true, scopeAllowed: true, collegeId: 3, sectionId: 31, sectionCollegeId: 3 };
  check(pulseCohortsAccess(base) === 200, "العميد يقرأ دفعات قسمٍ من كليته");
  check(pulseCohortsAccess({ ...base, scopeAllowed: false }) === 403, "ويُردّ عن كليةٍ ليست في نطاقه");
  check(pulseCohortsAccess({ ...base, sectionCollegeId: 4 }) === 403, "ويُردّ عن قسمٍ من كليةٍ أخرى ولو أرسل رقم كليته");
  check(pulseCohortsAccess({ ...base, sectionCollegeId: 0 }) === 403, "وعن قسمٍ غير موجود");
  check(pulseCohortsAccess({ ...base, deanReader: false }) === 403, "ومن ليس عميداً ولا عميداً مساعداً (الأستاذ وغيره) يُردّ ولو كان القسم في نطاقه");
  check(pulseCohortsAccess({ ...base, sectionId: 0 }) === 400 && pulseCohortsAccess({ ...base, collegeId: 0 }) === 400, "وبلا قسمٍ أو كلية: طلبٌ ناقص");
  check(pulseCohortsAccess({ ...base, deanReader: false, scopeAllowed: false, isAdmin: true }) === 200 && pulseCohortsAccess({ ...base, isAdmin: true, sectionCollegeId: 4 }) === 403, "والمدير يقرأ، ولا يُخلط قسمٌ بكليةٍ غير كليته");
  const reports = read("src/server/routes/reportsRoutes.ts");
  const route = reports.slice(reports.indexOf('app.get("/api/reports/pulse-cohorts"'), reports.indexOf('app.get("/api/reports/room-load"'));
  check(/requireAnyPermission\(\[7, 8, 9, 10, 14, 16, 17\]\)/.test(route) && /pulseCohortsAccess\(\{[\s\S]*deanReader: readsFinalSchedulesOnly\(req\), scopeAllowed: isScopeAllowed\(req, collegeId, sectionId\)/.test(route), "المسار يحكم بالحَكَم نفسه: صفة العميد ونطاق الحساب وكلية القسم");
  check(/verdict === 403[\s\S]*sectionPlanFacts\(sectionId\)/.test(route) && /levelGroups: facts\.levelGroups\.map\(group => \(\{ courseIds: group\.courseIds \}\)\)/.test(route), "ولا يُقرأ شيءٌ قبل الحكم، ولا يعود إلا أرقام مقررات كل مستوى");
  check(!/Repository\.(save|set|update|delete|add|create|write)/i.test(route) && !/app\.(post|put|patch|delete)\("\/api\/reports\/pulse-cohorts/.test(reports), "قراءةٌ فقط: لا كتابة في المسار");
  check(/context !== "workshop" && context !== "dean"/.test(pulse) && /\/api\/reports\/pulse-cohorts/.test(pulse) && /cohortState\.scope === nameScope/.test(pulse), "العميد يرى مسارات الدفعات أيضاً، وما جُلب لقسمٍ لا يُعرض لغيره");
}

/* ── «ماذا لو، باللمس» (FR-SCH-101): المسارات وتنبيهاتها تُعاد قراءتها على نقلات المعاينة ── */
{
  /* الأستاذ 7: شعبة 301 (مبنى آخر بفجوة 5 دقائق) تُسحب إلى 103 في المبنى الأول — فارغةٌ 09:20؟ لا: 103 مشغولة 09:30 للأستاذ 8، فتُسحب إلى 201 بدلها. */
  const s301 = model.sessions.find(s => s.hallKey === key("r301"))!;
  check(dropStatus(model, base, s301.id, key("r103")).tone === "red" && /تتعارض/.test(dropStatus(model, base, s301.id, key("r103")).reason), "103 مشغولة 09:30 للأستاذ 8: حمراء بسبب التعارض");
  const to201 = dropStatus(model, base, s301.id, key("r201"));
  check(to201.tone === "green", `201 فارغة ومن النوع وتتّسع: خضراء (${to201.reason})`);
  const pushed = pushWhatIf(model, base, [], s301.id, key("r201"));
  const after = applyWhatIf(base, pushed.stack);
  const pathsAfter = buildPaths(model, after, layout, "fsunday", { instructorName: names, cohorts });
  const t7After = pathsAfter.find(x => x.id === "t:7")!;
  check(pushed.accepted && t7After.stops[1].hallKey === key("r201"), "المسار يمرّ بالقاعة الجديدة فور المعاينة");
  check(!t7After.hops[0].flags.includes("tight") && !t7After.hops[1].flags.includes("pingpong"), "زال الانتقال الضيّق والذهاب والإياب بعد النقلة");
  check(tightCount(paths) > tightCount(pathsAfter), `الانتقالات الضيّقة تقلّ (${tightCount(paths)} ← ${tightCount(pathsAfter)})`);
  check(affectedPaths(pathsAfter, new Set([s301.id])).map(p => p.id).join() === "t:7", "المسار المتأثّر بالنقلة هو مسار أستاذها وحده");
  check(rankHops(pathsAfter).every(r => r.path.id !== "t:7" || !r.hop.flags.includes("tight")), "«أصعب التنقلات» يُعاد ترتيبه بلا انتقال الأستاذ 7 الضيّق");
  check(buildPaths(model, base, layout, "fsunday", { instructorName: names, cohorts }).find(x => x.id === "t:7")!.hops[0].flags.includes("tight"), "والجدول الأصلي لم يتغيّر: المعاينة نسخة");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
