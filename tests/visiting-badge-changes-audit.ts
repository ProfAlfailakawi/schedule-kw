/**
 * ── المنتدب يحمل شارتَه في تقرير تغييرات الجدول ──────────────────────────────
 *
 * كان صفُّ التقرير يعرض اسم الأستاذ وحده، فلا يُعرف المنتدبُ فيه كما يُعرف في بقية
 * الشاشات. الخادمُ يحمل علمَ «visiting» مع كل صفٍّ، والواجهةُ والملفُّ (dossier) ترسمان الشارة.
 */
import fs from "fs";
import path from "path";
import { buildApprovalDossier } from "../src/utils/approvalDossier";
import { approvalScopeKey } from "../src/utils/approvalScope";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const server = read("server.ts");
const display = server.slice(server.indexOf("const asDisplayRow = (row: any) => ({"), server.indexOf("const asDisplayRow = (row: any) => ({") + 400);
check(/readVisitingStatus\(collegeId, sectionId\)/.test(server.slice(server.indexOf("visitingIdsForReport") - 20, server.indexOf("visitingIdsForReport") + 200)), "الخادم يقرأ دفتر المنتدبين الحيّ لنطاق التقرير");
check(/visiting: visitingIdsForReport\.has\(Number\(row\.AdInstructorId\)\)/.test(display), "ويحمل علمَ المنتدب مع كل صفٍّ يعرضه");
check(/\{row\.visiting \? <VisitingBadge compact \/> : null\}/.test(read("src/components/ScheduleChanges.tsx")), "وصفُّ التقرير يرسم الشارة بجانب الأستاذ");
check(/rows\.some\(row => row\.visiting\)/.test(read("src/components/ScheduleChanges.tsx")), "وملاحظاتُ المراجعة تُظهرها بجانب اسم الأستاذ");
check(/item\.visiting \? <VisitingBadge compact \/> : null/.test(read("src/components/ApprovalDossier.tsx")), "وملفُّ الاعتماد يرسمها");

const scope = { collegeId: 1, sectionId: 2, termId: 3 };
const key = approvalScopeKey(scope);
const entry = (id: number, visiting: boolean) => ({
  kind: "added" as const, scheduleId: id, row: { AdCollegeId: 1, AdSectionId: 2, AdTermId: 3 }, changes: [],
  display: { courseCode: "112", course: "مقدمة", sectionCode: String(id), days: "الأحد", time: "08:00", room: "A1", instructor: "د. سالم", visiting },
});
const model: any = buildApprovalDossier({
  scope, names: { college: "كلية", section: "قسم", term: "الفصل الأول" },
  report: { scopeKey: key, data: {
    baselineSource: "authority", authoritySource: { sourceFileName: "a.pdf", publishedAt: "2026-09-01T10:00:00Z" }, rowCount: 10, statusLabel: "عند التسجيل",
    approval: { AdCollegeId: 1, AdSectionId: 2, AdTermId: 3, status: "submitted", currentRound: 1, signatures: [], rounds: [] },
    diff: { entries: [entry(1, true), entry(2, false)], counts: { added: 2, changed: 0, removed: 0, unchanged: 8 } },
  } as any },
  readiness: { scopeKey: key, data: { blockers: [], warnings: [], blockingConflicts: 0, blockingRows: 0 } as any },
  printedAt: new Date(2026, 9, 2, 12, 0, 0),
});
const flags = (model.groups as any[]).flatMap(group => group.items).map((item: any) => item.visiting);
check(flags.length === 2 && flags.filter(Boolean).length === 1, "نموذج الملف يحمل علمَ المنتدب لمن هو منتدب وحده");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
