import fs from "node:fs";
import path from "node:path";
import { approvedBarterReservation, borrowerOutsideApprovedWindow } from "../src/utils/hallBarterWindow";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`✓ ${label}`); } else { failed++; console.error(`✗ ${label}`); } };
const root = process.cwd();
const server = fs.readFileSync(path.join(root, "server.ts"), "utf8");
const page = server.slice(server.indexOf("function publicItemId"), server.indexOf("function askAccept"));
const decide = server.slice(server.indexOf('app.post("/api/instructor-requests/:id/decide"'), server.indexOf('app.post("/api/instructor-requests/:id/apply"'));
const departmentReply = server.slice(server.indexOf('app.post("/api/instructor-requests/:id/reply"'), server.indexOf('app.get("/api/public/request/:token"'));
const publicReply = server.slice(server.indexOf('app.post("/api/public/request/:token/reply"'), server.indexOf("function instructorRequestPage"));
const submit = server.slice(server.indexOf('app.post("/api/public/request/:token",'), server.indexOf('app.post("/api/public/request/:token/reply"'));
const inbox = fs.readFileSync(path.join(root, "src/components/InstructorInbox.tsx"), "utf8");
const repository = fs.readFileSync(path.join(root, "src/db/repository.ts"), "utf8");

check(decide.includes("requireInstructorRequestRevision(req, res, stored)") && decide.includes("instructorRequestItemIdentity(item)"), "قرار القسم يشترط نسخة الطلب وهوية البند الحالية");
check(departmentReply.includes("requireInstructorRequestRevision(req, res, stored)") && departmentReply.includes("instructorRequestItemIdentity(item)"), "رد القسم يشترط نسخة الطلب وهوية البند الحالية");
check(publicReply.includes("requireInstructorRequestRevision(req, res, resolved.request)") && publicReply.includes("instructorRequestItemIdentity(item)"), "رد الأستاذ يشترط النسخة وهوية البند قبل التوقيع");
check(publicReply.includes("requestOfferIdentity(itemIdentity, chosen)"), "قبول البديل مربوط بهوية العرض ومحتواه، لا الفهرس وحده");
check(submit.includes("requireInstructorRequestRevision(req, res, resolved.request)"), "إرسال الطلب يرفض غياب الختم بدلاً من قبول عميل قديم");
check(inbox.includes("requestRevision: row.requestRevision || 0, state") && inbox.includes("requestRevision: row.requestRevision || 0, text"), "واجهة الوارد ترسل ختم النسخة في القرار والرد");
check(page.includes("requestRevision:data.request.requestRevision||0") && page.includes("proposalId:accept===null?undefined:publicProposalId"), "صفحة الأستاذ ترسل النسخة وهوية المقترح الذي وقّع عليه");
check(server.includes("const normalizedAction = unchanged ? \"keep\" : action") && server.includes("after: normalizedAction === \"keep\""), "التعديل المطابق للأصل يُطبّع إلى keep في الخادم ولا ينشئ حجزاً زائداً");

const windows = [{ status: "approved", requesterCollegeId: 2, requesterSectionId: 8, day: "fsunday", startTime: "08:00", endTime: "09:00" }];
check(Boolean(approvedBarterReservation(windows, "fsunday", "08:00", "08:50", 1, 4)), "قاعة المالك محجوبة داخل نافذة إعارتها لقسم آخر");
check(!approvedBarterReservation(windows, "fsunday", "09:00", "09:50", 1, 4), "نافذة الإعارة لا تحجب الوقت الذي يليها");
check(borrowerOutsideApprovedWindow(windows, "fsunday", "08:00", "08:50", 2, 8) === false, "المستعير مسموح داخل نافذته");
check(borrowerOutsideApprovedWindow(windows, "fmonday", "08:00", "08:50", 2, 8), "المستعير ممنوع في يوم غير معتمد");
check(server.includes("approvedBarterReservation(sameRoomBarterWindows") && server.includes("approvedBarterReservation(windows, day"), "الحكم المركزي وحكم البطاقة يستخدمان قاعدة نافذة الاستعارة المشتركة");
check(repository.includes('collection("hallBarterRequests").where("AdTermId", "in", [termId, String(termId)])')
  && repository.includes("eligibleProposals") && repository.includes("borrowerOutsideApprovedWindow"), "حجز الطلب يعيد فحص نوافذ الاستعارة داخل معاملة الحجز قبل اختيار القاعة");
const barterUpdate = repository.slice(repository.indexOf("updateHallBarterRequest: async"), repository.indexOf("// --- Week exceptions"));
check(barterUpdate.includes("runTransaction") && barterUpdate.includes("ledgerRef") && barterUpdate.includes("conflictForApproval")
  && barterUpdate.includes("scheduleDocs"), "اعتماد الاستعارة يتزامن ذرياً مع حجوزات الطلبات والجدول الرسمي");

console.log(`\n${passed} نجح، ${failed} فشل`);
process.exitCode = failed ? 1 : 0;
