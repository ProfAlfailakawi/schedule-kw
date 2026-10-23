/**
 * ── «منتدب»: قائمةٌ واحدة لكل الشاشات ───────────────────────────────────────
 * القاعدةُ نفسُها التي تقرأ بها الشاشاتُ الحاليّة (دليل العائلة + روستر الفصل)، لكن
 * دفعةً واحدة بمفتاح «كلية:قسم»؛ ومنها تسأل أيُّ شاشةٍ بلا طلبٍ خاص.
 */
import fs from "fs";
import path from "path";
import { visitingByScope } from "../src/utils/liveVisiting";
import { departmentFamilyResolver } from "../src/utils/sectionLabel";
import { invalidateVisitingLookup, isVisitingIn, loadVisitingLookup } from "../src/utils/visitingLookup";
import { VISITING_SUFFIX, withVisitingSuffix } from "../src/components/VisitingBadge";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`); }
};

const known = (id: number) => id < 100;
const sections = [
  { AdSectionId: 1, AdCollegeId: 1, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdSectionId: 2, AdCollegeId: 2, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdSectionId: 3, AdCollegeId: 1, AdSectionName: "قسم التصميم" },
];
const familyOf = departmentFamilyResolver(sections as any);
const scopes = sections.map(s => ({ collegeId: s.AdCollegeId, sectionId: s.AdSectionId }));
const affiliations: any[] = [
  { collegeId: 1, sectionId: 1, instructorIds: [10, 11], kind: "directory" },
  { collegeId: 1, sectionId: 1, instructorIds: [10, 12], kind: "roster", termId: 5 },
  { collegeId: 2, sectionId: 2, instructorIds: [11], kind: "roster", termId: 5 },
  { collegeId: 1, sectionId: 3, instructorIds: [12], kind: "directory" },
  { collegeId: 1, sectionId: 3, instructorIds: [12, 999], kind: "roster", termId: 5 },
  { collegeId: 1, sectionId: 1, instructorIds: [11], kind: "roster", termId: 6 },
];

const lookup = visitingByScope(affiliations, 5, known, scopes, familyOf);
check(JSON.stringify(lookup["1:1"]?.slice().sort()) === "[10,11]", "قسمٌ في دليله منتدبان وفي روستر الفصل: يظهر من هو في الاثنين (12 في الروستر وحده ليس منتدباً)");
check(lookup["2:2"]?.slice().sort().join() === "10,11", "والقسمُ عائلةٌ عبر كلياته: الأختُ في كلية أخرى ترى منتدبي العائلة");
const legacy: any[] = [{ collegeId: 1, sectionId: 3, instructorIds: [12], kind: "roster", termId: 5 }, { collegeId: 1, sectionId: 3, instructorIds: [13], kind: "roster", termId: 4 }];
check(visitingByScope(legacy, 5, known, scopes, familyOf)["1:3"]?.join() === "12", "قسمٌ بلا دليلٍ محفوظ: دليلُه كلُّ من مرّ في روستره فيظهر منتدبُ الفصل (والفصلُ الآخر لا يدخل)");
check(JSON.stringify(lookup["1:3"]) === "[12]" && !lookup["1:3"].includes(999), "والمعرّفُ المجهول لا يُحسب منتدباً");
check(!visitingByScope(legacy, 5, known, scopes, familyOf, [{ collegeId: 1, sectionId: 3 }])["1:3"], "ودليلٌ محفوظٌ فارغٌ عمداً (أُزيل آخرُ منتدب) لا يُزرع من التاريخ فلا يظهر المحوَّلون منتدبين");
check(!visitingByScope(affiliations, 7, known, scopes, familyOf)["1:1"], "فصلٌ بلا روستر: لا منتدبين (الدليلُ وحده لا يكفي)");
check(visitingByScope(affiliations, 6, known, scopes, familyOf)["1:1"]?.join() === "11", "وروستر فصلٍ آخر لا يختلط: الفصل 6 فيه 11 وحده");

check(isVisitingIn({ termId: 5, scopes: lookup }, 12, 1, 3) && !isVisitingIn({ termId: 5, scopes: lookup }, 12, 1, 1), "المنتدبُ يُعرف بقسمه: 12 منتدبٌ في قسم التصميم لا في تكنولوجيا التعليم");
check(!isVisitingIn(null, 10, 1, 1) && !isVisitingIn({ termId: 5, scopes: lookup }, "x", 1, 1), "بلا قراءة أو معرّفٍ فاسد: لا شارة");

check(withVisitingSuffix("أ. سالم", true) === `أ. سالم${VISITING_SUFFIX}` && withVisitingSuffix("أ. سالم", false) === "أ. سالم", "لاحقةُ الأماكن النصية «· منتدب» لمن هو منتدب وحده");

(async () => {
  let calls = 0;
  const fake = (async () => { calls++; return { ok: true, json: async () => ({ scopes: { "1:1": ["10", 11] } }) } as any; }) as unknown as typeof fetch;
  invalidateVisitingLookup();
  const a = await loadVisitingLookup(5, fake), b = await loadVisitingLookup(5, fake);
  check(calls === 1 && a === b && a.scopes["1:1"].join() === "10,11", "تُقرأ مرةً لكل فصل وتُحفظ، وتُحوَّل المعرّفات أرقاماً");
  invalidateVisitingLookup();
  await loadVisitingLookup(5, fake);
  check(calls === 2, "وبعد تعديل المنتدبين (invalidate) تُقرأ من جديد");
  const broken = (async () => ({ ok: false }) as any) as unknown as typeof fetch;
  invalidateVisitingLookup();
  const failed1 = await loadVisitingLookup(9, broken);
  check(Object.keys(failed1.scopes).length === 0, "وإن تعذّرت القراءة: لا شارات ولا خطأ يُرمى");
  check(Object.keys((await loadVisitingLookup(0, fake)).scopes).length === 0, "وفصلٌ بلا رقم: قائمةٌ فارغة بلا طلب");

  const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
  check(/app\.get\("\/api\/visiting-lookup", requireAnyPermission\(\[3, 7, 8, 9, 10, 14, 16, 17\]\)/.test(server), "والنقطة /api/visiting-lookup موجودة بصلاحيات القراءة نفسها");
  const route = server.slice(server.indexOf('app.get("/api/visiting-lookup"'), server.indexOf('app.get("/api/reports/visiting-roster"'));
  check(/filterByScope\(req, allSections as any\[\]\)/.test(route), "وتقتصر على أقسام القارئ (الحارسُ ظاهرٌ في المعالج نفسه)");
  const hook = fs.readFileSync(path.join(process.cwd(), "src/hooks/useVisitingLookup.ts"), "utf8");
  check(/lookup\.termId === \(Number\(termId\) \|\| 0\)/.test(hook), "وقراءةُ فصلٍ سابق لا يُجاب بها عن فصلٍ جديد ريثما تصل");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
