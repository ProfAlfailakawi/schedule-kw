/**
 * ── «الحرم كله مدينة» (FR-SCH-100) ──────────────────────────────────────────
 *
 * يحرس الحساب النقي (utils/campusCity): صاحب كل قاعة وكل مبنى، والمبنى المشترك
 * يُرسم مرةً واحدة في حيّ القسم الغالب بنصيب كل قسم، وحال كل حيٍّ في لحظة،
 * ومخطّط المدينة (لا تتداخل الأحياء، وكل قاعةٍ داخل حيّها، وأول الأقسام يميناً).
 * ثم يحرس التوصيل: نطاق العميد كليته وحدها، والمسارات المقروءة هي مسارات بطاقة
 * العميد نفسها بلا كتابة، والبطاقة لا تظهر لرئيس القسم ولا للأستاذ، والهاتف بلا
 * مجسّم، والرابط إلى النبض يحمل «من الحرم كله».
 */
import fs from "fs";
import path from "path";
import { buildPulseModel } from "../src/utils/hallPulse";
import { buildCampusCity, busiestCityMinute, cityAt, cityCurve, districtFocusHall, districtOrder, layoutCampus, moodOf } from "../src/utils/campusCity";
import { resolveSharedScope } from "../src/utils/sharedScope";
import { parsePulseFocus, pulseFocusHref } from "../src/utils/pulseLink";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/* ── كليةٌ صغيرة: ثلاثة أقسام، ومبنى مشترك، وقاعةٌ لا لقاء فيها ── */
const registry = {
  buildings: [
    { id: "bA", officialCode: "901A01", buildingNumber: "1" },
    { id: "bB", officialCode: "901A02", buildingNumber: "2" },
    { id: "bC", officialCode: "901A03", buildingNumber: "3" },
  ],
  rooms: [
    { id: "a101", buildingId: "bA", canonicalCode: "101", capacity: 30, roomType: "قاعة" },
    { id: "a102", buildingId: "bA", canonicalCode: "102", capacity: 40, roomType: "قاعة" },
    { id: "a201", buildingId: "bA", canonicalCode: "201", capacity: 40, roomType: "قاعة" },
    { id: "b101", buildingId: "bB", canonicalCode: "101", capacity: 50, roomType: "قاعة" },
    { id: "c101", buildingId: "bC", canonicalCode: "101", capacity: 35, roomType: "قاعة", primarySectionIds: [3] },
  ],
};
const row = (id: number, sec: number, course: number, room: string, start: string, end: string, days: Record<string, boolean>) => ({
  id, AdSectionId: sec, AdCourseId: course, roomId: room, fstarttime: start, fendtime: end, ...days,
});
const SUN = { fsunday: true }, MON = { fmonday: true };
const rows = [
  row(1, 1, 10, "a101", "10:00", "11:15", SUN), // قسم 1: 45 طالباً في 30 مقعداً — مضغوطة
  row(2, 1, 11, "a102", "10:00", "11:15", SUN), // قسم 1
  row(3, 1, 11, "a102", "12:00", "13:15", { ...SUN, ...MON }),
  row(4, 2, 12, "a201", "10:00", "11:15", SUN), // قسم 2 في مبنى قسم 1
  row(5, 2, 12, "b101", "08:00", "09:15", SUN),
  row(6, 2, 12, "b101", "11:30", "12:45", SUN),
];
const courses = [
  { AdCourseId: 10, MaxStudent: 45 },
  { AdCourseId: 11, MaxStudent: 30 },
  { AdCourseId: 12, MaxStudent: 25 },
];
const departments = [{ id: 1, name: "تكنولوجيا التعليم" }, { id: 2, name: "التربية الفنية" }, { id: 3, name: "التصميم التعليمي" }];
const model = buildPulseModel({ rows, courses, registry, includeUnusedRegistryHalls: true });
const city = buildCampusCity({ model, departments, registryRooms: registry.rooms });

/* ── الصاحب ── */
check(city.hallOwner.get("id:a101") === 1 && city.hallOwner.get("id:a102") === 1, "قاعة يدرّس فيها قسمٌ وحده: صاحبها ذلك القسم");
check(city.hallOwner.get("id:a201") === 2, "قاعة قسم 2 في مبنى يغلب عليه قسم 1: تبقى لقسم 2");
check(city.hallOwner.get("id:c101") === 3, "قاعة بلا لقاء: صاحبها القسم الأساسي في سجلّ المواقع");
const bA = city.buildings.find(b => b.code === "901A01")!;
check(Boolean(bA) && bA.owner === 1 && bA.shared, "المبنى المشترك: صاحبه القسم الأكثر دقائق فيه، ومعلَّمٌ مشتركاً");
check(bA.shares.map(s => s.dept).join(",") === "1,2" && bA.shares[0].weight > bA.shares[1].weight, "نصيب كل قسمٍ من المبنى المشترك، الأكبر أولاً");
check(city.buildings.filter(b => b.code === "901A01").length === 1, "المبنى المشترك يُرسم مرةً واحدة");
const d1 = city.districtOf.get(1)!, d2 = city.districtOf.get(2)!, d3 = city.districtOf.get(3)!;
check(d1.buildings.join() === "901A01" && d2.buildings.join() === "901A02" && d3.buildings.join() === "901A03", "كل مبنى في حيّ صاحبه وحده");
check(d2.halls.includes("id:a201") && d2.halls.includes("id:b101"), "قاعات القسم في حيّه ولو كانت في مبنى غيره");
check(city.districts.length === 3 && !city.districtOf.has(0), "لا حيّ «مشترك» حين يُعرف صاحب كل مبنى");

const lonely = buildCampusCity({ model: buildPulseModel({ rows: [], courses: [], registry: { buildings: registry.buildings, rooms: [{ id: "z", buildingId: "bB", canonicalCode: "9" }] }, includeUnusedRegistryHalls: true }), departments });
check(lonely.districtOf.has(0) && lonely.districtOf.get(0)!.halls.length === 1, "قاعةٌ لا يُعرف قسمها: حيٌّ «قاعات مشتركة» فلا تختفي");
check(lonely.districts.filter(d => d.dept.id > 0).every(d => !d.buildings.length), "قسمٌ بلا مبنى: حيٌّ فارغ يبقى على الخريطة");
const dup = buildCampusCity({ model, departments: [...departments, { id: 1, name: "مكرر" }, { id: 0, name: "صفر" }], registryRooms: registry.rooms });
check(dup.districts.length === 3, "قسمٌ مكرر أو برقم صفر لا يصنع حيّاً");

/* ── اللحظة ── */
const at10 = cityAt(city, "fsunday", 10 * 60 + 30);
const n1 = at10.districts.get(1)!, n2 = at10.districts.get(2)!, n3 = at10.districts.get(3)!;
check(n1.inUse === 2 && n1.pressed === 1 && n1.mood === "choke", "الأحد 10:30: قسم 1 يشغل قاعتين إحداهما مضغوطة — «يختنق»");
check(n2.inUse === 1 && n2.pressed === 0 && n2.mood === "calm", "وقسم 2 قاعةٌ واحدة من قاعتيه — «هادئ»");
check(n3.inUse === 0 && n3.empty === 1 && n3.mood === "idle", "وقسم 3 لا شيء — «خالٍ» بقاعته الفارغة");
check(at10.total.inUse === 3 && at10.total.pressed === 1 && at10.total.empty === 2 && at10.total.halls === 5, "مجموع الكلية من الإشغال نفسه");
check(at10.halls.get("id:a101")!.fit === "pressed" && at10.halls.get("id:a201")!.dept === 2, "لون القاعة من ملاءمتها، وقسمها من شاغلها");
check(moodOf({ inUse: 3, pressed: 0, load: 0.75 }) === "busy" && moodOf({ inUse: 0, pressed: 0, load: 0 }) === "idle", "المزاج: حملٌ عالٍ مزدحم، ولا شيء خالٍ");
check(districtOrder(city, at10).map(d => d.dept.id).join() === "1,2,3", "القائمة: الأشدّ ضغطاً أولاً");
check(districtFocusHall(city, at10, 1) === "id:a101", "نبض القسم يُفتح على أشدّ قاعاته الآن");
check(districtFocusHall(city, at10, 3) === "id:c101", "وقسمٌ بلا محاضرةٍ الآن: على أولى قاعاته");
check(busiestCityMinute(city, "fsunday") === 10 * 60, "أزحم لحظةٍ في الأحد: العاشرة (ثلاث قاعات)");
check(busiestCityMinute(city, "fthursday") === null, "يومٌ بلا محاضرات: لا لحظة مخترعة");
const curve = cityCurve(city, "fsunday", 30);
check(curve.some(p => p.minute === 600 && p.busy === 3 && p.pressed === 1), "منحنى اليوم يعرف ضغط العاشرة");

/* ── المخطّط ── */
const L = layoutCampus(city);
check(L.spots.size === model.halls.length, "كل قاعةٍ لها موضعٌ في المدينة");
check(L.buildings.length === city.buildings.length && new Set(L.buildings.map(b => b.code)).size === L.buildings.length, "كل مبنى يُرسم مرةً واحدة");
const overlap = (a: typeof L.districts[0], b: typeof L.districts[0]) => a.x0 < b.x0 + b.w && b.x0 < a.x0 + a.w && a.z0 - a.d < b.z0 && b.z0 - b.d < a.z0;
let clean = true;
for (let i = 0; i < L.districts.length; i++) for (let j = i + 1; j < L.districts.length; j++) if (overlap(L.districts[i], L.districts[j])) clean = false;
check(clean, "الأحياء لا تتداخل، وبينها شوارع");
let inside = true;
for (const d of city.districts) {
  const rect = L.districts.find(x => x.dept === d.dept.id)!;
  for (const code of d.buildings) for (const key of city.buildings.find(b => b.code === code)!.halls) {
    const s = L.spots.get(key)!;
    if (!(s.x > rect.x0 && s.x < rect.x0 + rect.w && s.z < rect.z0 && s.z > rect.z0 - rect.d)) inside = false;
  }
}
check(inside, "قاعات كل مبنى داخل أرض حيّه (ومنها قاعة القسم الآخر في المبنى المشترك)");
const firstRow = L.districts.filter(d => d.z0 === 0);
check(firstRow.length >= 2 && firstRow[0].dept === 1 && firstRow[0].x0 > firstRow[1].x0, "القراءة من اليمين: أول الأقسام يمين صفّه");
const many = layoutCampus(buildCampusCity({ model, departments: Array.from({ length: 16 }, (_, i) => ({ id: i + 1, name: `قسم ${i + 1}` })), registryRooms: registry.rooms }));
check(many.districts.length === 16 && new Set(many.districts.map(d => d.z0)).size >= 3, "ستة عشر قسماً: صفوفٌ من الأحياء لا شريطٌ طويل");

/* ── نطاق العميد ── */
const deanScopes = [
  { AdCollegeId: 1, AdSectionId: 1, AdCollegeWide: true },
  { AdCollegeId: 1, AdSectionId: 2, AdCollegeWide: true },
];
const forced = resolveSharedScope({ collegeId: 7, sectionId: 0, termId: 1 }, { scopes: deanScopes, isAdmin: false, fallbackTermId: 1 });
check(forced.collegeId === 1, "العميد: كليةٌ غير كليته في النطاق المحفوظ تُردّ إلى كليته");

/* ── الرابط إلى النبض ── */
const href = pulseFocusHref({ collegeId: 1, sectionId: 2, termId: 1, hall: "id:a201", day: 0, at: 630, from: "campus" });
const back = parsePulseFocus(href.slice(href.indexOf("?")));
check(Boolean(back) && back!.from === "campus" && back!.sectionId === 2 && back!.hall === "id:a201" && back!.at === 630, "رابط النبض من الحرم كله: القسم والقاعة والساعة، ومصدره");
const plain = parsePulseFocus(pulseFocusHref({ collegeId: 1, sectionId: 2, termId: 1, hall: "id:a201", day: 0, at: 630 }).split("?")[1]);
check(Boolean(plain) && plain!.from === undefined, "ورابط البصمة كما كان بلا مصدر");

/* ── التوصيل ── */
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const comp = read("src/components/hallPulse/CampusCity.tsx");
const scene = read("src/components/hallPulse/campusScene.ts");
const card = read("src/components/hallPulse/DeanHallPulseCard.tsx");
const dash = read("src/components/Dashboard.tsx");
const lazy = read("src/components/hallPulse/CampusCityLazy.tsx");
const urls = [...comp.matchAll(/(?:get|fetch)\(\s*[`"]([^`"?$]+)/g)].map(m => m[1]).sort();
check(JSON.stringify([...new Set(urls)]) === JSON.stringify(["/api/courses", "/api/location-registry", "/api/reports/room-load", "/api/schedules"]),
  "المدينة تقرأ مسارات نبض العميد نفسها وحدها: " + [...new Set(urls)].join("، "));
check(!/method\s*:/.test(comp) && !/method\s*:/.test(scene), "لا كتابة: لا طلب بغير القراءة");
check(!/instructor|AdInstructor|CivilId|civil/i.test(comp) && !/instructor/i.test(scene), "لا اسم أستاذ ولا رقم مدني في المدينة");
check(/lazy\(\(\) => import\("\.\/CampusCity"\)\)/.test(lazy) && /import\("\.\/campusScene"\)/.test(comp), "المدينة ومشهدها كسولان، لا في الحزمة الأولى");
check(/InstancedMesh/.test(scene) && (scene.match(/new THREE\.InstancedMesh/g) || []).length >= 4, "القاعات دفعاتٌ (InstancedMesh) لا شبكةٌ لكل قاعة");
check(/prefers-reduced-motion/.test(comp) && /reduced \? 1/.test(scene), "تقليل الحركة: لا طيران ولا تنفّس");
check(/isPhoneDevice/.test(comp) && /const twoD = phone \|\| narrow \|\| cramped/.test(comp) && /flat = twoD/.test(comp), "الهاتف والشاشة الضيقة: خريطةٌ مسطّحة بلا مجسّم");
check(/campusWebglAvailable/.test(comp) && /setSceneFailed\(true\)/.test(comp), "بلا WebGL: الخريطة المسطّحة");
check(/className="cc-list"/.test(comp) && /aria-label=\{`\$\{districtSpeech/.test(comp), "قائمة الأحياء أزرارٌ مقروءة لقارئ الشاشة ولوحة المفاتيح");
check(/\(roleId==="dean"\|\|roleId==="viceDean"\)&&!termEmpty\?<DeanHallPulseCard/.test(dash) && /:power&&!termEmpty\?<DeanHallPulseCard admin/.test(dash),
  "البطاقة للعميدين ولمسؤول النظام وحدهم، لا لرئيس القسم ولا للأستاذ");
check(/if \(admin\)[\s\S]{0,400}openInApp\(next \? pulseFocusHref\(next\)/.test(card), "المسؤول: الحي يفتح النبض في شاشة الجدول برابطه (pulseLink)");
check(/setView\("pulse"\)/.test(card) && /from: "campus"/.test(card), "العميد: الحي يفتح نبض القسم في البطاقة نفسها (لا يملك شاشة الجدول)");
check(/leavePulse/.test(card) && /cameFrom\.sectionId/.test(card), "العودة من نبض القسم تعيد قسم النطاق كما كان");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
