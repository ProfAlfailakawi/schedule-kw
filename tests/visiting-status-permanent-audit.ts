/**
 * ── صفة «منتدب» دائمة (قرار المالك ٢٠٢٦/١٠/٢٣) ───────────────────────────────
 * الأستاذ منتدبٌ ما دام في دليل منتدبي القسم، في كل الفصول، ولا يزول إلا بتحويله من
 * بطاقة الأستاذ إلى معيّن. روسترُ الفصل يحدد من يُدرِّس فيه فقط، فلا يملأ منتقيَ الأساتذة
 * بكل المنتدبين. وسببُ «تعارض» يُكتب تحت رقائق الموعد لا يُعدّ وحده.
 */
import fs from "fs";
import path from "path";
import { visitingByScope } from "../src/utils/liveVisiting";
import { readServerSource } from "./helpers/serverSource.mjs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`  ✓ ${label}`); } else { failed++; console.log(`  ✗ ${label}`); } };
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const scopes = [{ collegeId: 1, sectionId: 1 }];
const known = (id: number) => id > 0;
const directoryOnly: any[] = [{ collegeId: 1, sectionId: 1, instructorIds: [10], kind: "directory" }];
for (const term of [5, 6, 99]) check(visitingByScope(directoryOnly, term, known, scopes)["1:1"]?.join() === "10", `الفصل ${term}: منتدبُ الدليل منتدبٌ بلا روستر`);
check(!visitingByScope([{ collegeId: 1, sectionId: 1, instructorIds: [10], kind: "directory" }, { collegeId: 1, sectionId: 1, instructorIds: [11], kind: "roster", termId: 5 }] as any, 5, known, scopes)["1:1"]?.includes(11), "من في روستر الفصل وليس في الدليل ليس منتدباً");
check(!visitingByScope([{ collegeId: 1, sectionId: 1, instructorIds: [12], kind: "roster", termId: 3 }] as any, 5, known, scopes)["1:1"], "قسمٌ بلا دليلٍ لا يُنتدَب فيه من مرّ في روستر فصلٍ قديم");

const server = readServerSource();
const status = server.slice(server.indexOf("async function readVisitingStatus("), server.indexOf("async function readVisitingStatus(") + 1500);
check(/getDepartmentDelegates\(collegeId, sectionId\)/.test(status) && /getExplicitDirectoryScopes\(\)/.test(status) && /saved \|\| !termId \? directory/.test(status), "الخادم يقرأ الصفة من دليل القسم، وقسمٌ بلا دليلٍ محفوظ يُقرأ له روسترُ الفصل وحده (كما visitingByScope)");
check(/visitingStatusIds/.test(server) && /visitingInstructorIds,/.test(server), "حمولةُ الجدول تحمل الصفةَ (للشارة) وروسترَ الفصل (للمنتقي) معاً");
const client = read("src/components/Schedules.tsx");
check(/data\?\.visitingStatusIds/.test(client) && /\[\.\.\.scheduled, \.\.\.scopedRoster, \.\.\.visitingRosterIds\]/.test(client), "الشارةُ من الصفة، ومنتقي الأساتذة من روستر الفصل وحده");
check(/context-conflict-list/.test(client) && /conflict\.message/.test(client) && /conflict\.detail/.test(client), "لوحة الموعد تكتب سبب التعارض (لا عدَّه فقط)");

const picker = read("src/components/InstructorPicker.tsx");
check(/visitingRosterIds/.test(picker) && /rosterSet\.has\(person\.AdInstructorId\)/.test(picker) && /visitingSet\.has\(person\.AdInstructorId\) \? <VisitingBadge/.test(picker), "منتقي الأستاذ: القائمةُ من روستر الفصل والشارةُ من الصفة الدائمة");
check(/visitingRosterIds=\{pickerVisitingRosterIds\}/.test(client), "شاشة الجدول تمرّر روستر الفصل للمنتقي (فلا يظهر منتدبُ فصلٍ آخر في «موعد جديد»)");

check(/outsideTermRoster\(person\)/.test(picker) && /visitingSet\.has\(id\) && !rosterSet\.has\(id\)/.test(picker), "منتدبٌ غير مختار للفصل يُخفى من المنتقي أياً كان مصدر اسمه (الأرشيف/البحث)");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
