/**
 * ── لا طلبَ يُرسَل لمن يُرفَض له سلفاً ─────────────────────────────────────────
 *
 * حارسٌ ساكن (بلا متصفح): الشاشاتُ التي كانت تسأل الخادمَ عمّا لا تملك الصفةُ بابَه فتجمع 403 في الشبكة
 * والمحطة صارت تسأل بعد أن تتحقق من الصلاحية نفسها التي يتحقق منها الخادم:
 *
 *  1) `/api/schedules/demand` يشترط الشاشة ٧ على الخادم؛ فكشفُ التسجيل لا يقرؤه إلا بـ `canReadDemand`.
 *  2) `/api/section-requests/compose` يشترط أن يكون الحساب مرشداً (أو إدارة)؛ فلوحة الطلبات لا تسأل إلا بـ `mayCompose`.
 *  3) الخادم لم يُخفَّف: الشرطان ما زالا في المسارين.
 */
import fs from "node:fs";
import path from "node:path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

const registration = flat(read("src/components/StudentRegistration.tsx"));
const panel = flat(read("src/components/sectionRequests/SectionRequestsPanel.tsx"));
const app = flat(read("src/App.tsx"));
const planning = read("src/server/routes/planningRoutes.ts");
const requests = read("src/server/sectionRequestsRoutes.ts");

check(/if \(!canReadDemand \|\| !collegeId \|\| !sectionId \|\| !termId\) \{ setOpenings\(new Map\(\)\); return; \}/.test(registration),
  "كشف التسجيل لا يسأل عن الطلب والسعة بلا صلاحية الجدول");
check(/if \(!mayCompose \|\| !collegeId \|\| !sectionId \|\| !termId\) return;/.test(panel),
  "لوحة طلبات الشعب لا تسأل عن نموذج الإرشاد لغير المرشد");
check((app.match(/canReadDemand=\{hasPerm\(7\)\}/g) || []).length === 2, "التطبيق يمرّر الشاشة ٧ إلى كشف التسجيل في الموضعين");
check((app.match(/mayCompose=\{isPowerAdmin \|\| sessionRole\.id === "advisor"\}/g) || []).length === 2, "التطبيق يمرّر صفة المرشد أو الإدارة في الموضعين");
check(/app\.get\("\/api\/schedules\/demand", requirePermission\(7\)/.test(planning), "الخادم ما زال يشترط الشاشة ٧ لاقتراحات فتح الشعب");
check(/"\/api\/section-requests\/compose", requireRegistrationSheet[\s\S]{0,700}powersFor\(facts\)\.advising\) \{ fail\(res, 403/.test(requests),
  "الخادم ما زال يرفض غير المرشد في نموذج الإرشاد");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
