/**
 * ── اسمٌ واحد لكل شاشة، ولا ملفّ ميتاً (المالك 2026-11-14) ─────────────────────
 *
 *   N1 اسمُ الشاشة في القائمة هو عنوانُ صفحتها: رغبات الأساتذة، مراجعة الصحيفة، رادار التسجيل،
 *      النسخة الاحتياطية، إضافة المباني والقاعات، أوقات دوام الأقسام؛ و«الإرشاد» اسمُ المجموعة وتبويبها.
 *   N2 أسماءُ الوجهات (viewLabels) أسماءُ أزرارها: «الرئيسية» و«الجدول الدراسي».
 *   N3 التجربتان لا تتبادلان الاسم: «تجربة آمنة» في الجدول الدراسي، و«البيئة التجريبية» للعرض التجريبي.
 *   N4 الملفان الميتان حُذفا ولا يستوردهما شيء.
 */
import fs from "fs";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const app = read("src/App.tsx");
const title = (file: string) => (read(file).match(/>([^<>{}]+)<\/PageTitle>/g) || []).map(text => text.slice(1, -"</PageTitle>".length).trim());
const titleBlock = (file: string, name: string) => new RegExp(`<PageTitle[\\s\\S]{0,400}?>\\s*${name}\\s*</PageTitle>`).test(read(file));

check(/label="رغبات الأساتذة"/.test(app) && titleBlock("src/components/InstructorInbox.tsx", "رغبات الأساتذة"), "N1 «رغبات الأساتذة» في القائمة وعنوان الصفحة");
check(/label="مراجعة الصحيفة"/.test(app) && title("src/components/PlanReview.tsx").includes("مراجعة الصحيفة"), "N1 «مراجعة الصحيفة» في القائمة وعنوان الصفحة");
check(/label="رادار التسجيل"/.test(app) && title("src/components/RegistrationRehearsal.tsx").includes("رادار التسجيل")
  && /label: "رادار التسجيل"/.test(read("src/components/RegistrationTabs.tsx")), "N1 «رادار التسجيل» في القائمة والتبويب وعنوان الصفحة");
check(/title="الإرشاد"/.test(app) && /aria-label="الإرشاد"/.test(read("src/components/RegistrationTabs.tsx")), "N1 «الإرشاد» اسمُ المجموعة وتبويبها");
const admin = read("src/components/AdminUsers.tsx");
check(/label: "النسخة الاحتياطية"/.test(admin) && />النسخة الاحتياطية<\/PageTitle>/.test(admin) && !/خزنة النظام/.test(admin.replace(/data-guide-ignore="[^"]*"/g, "")),
  "N1 «النسخة الاحتياطية» في القائمة وعنوان الصفحة");
check(/label: "إضافة المباني والقاعات"/.test(admin) && title("src/components/LocationQuickSetup.tsx").includes("إضافة المباني والقاعات"), "N1 «إضافة المباني والقاعات»");
check(/label: "أوقات دوام الأقسام"/.test(admin) && title("src/components/SectionScheduleHours.tsx").includes("أوقات دوام الأقسام"), "N1 «أوقات دوام الأقسام»");
check(/dashboard: "الرئيسية"/.test(app) && /label="الرئيسية"/.test(app) && /schedules: "الجدول الدراسي"/.test(app) && /label="الجدول الدراسي"/.test(app),
  "N2 أسماءُ الوجهات أسماءُ أزرارها");

const schedules = read("src/components/Schedules.tsx");
check(/practiceMode \? "حذف من التجربة الآمنة"/.test(schedules) && !/النسخة التجريبية/.test(schedules), "N3 الجدول الدراسي يقول «تجربة آمنة» لا «النسخة التجريبية»");
check(/طُبعت الورقة من البيئة التجريبية/.test(read("src/server/reportStampPage.ts")), "N3 ورقةُ العرض التجريبي من «البيئة التجريبية»");

const dead = ["src/components/ScheduleSignature.tsx", "src/components/LocationRegistryAdmin.tsx"];
const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? sources(`${dir}/${entry.name}`) : /\.(tsx?|mjs)$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
const importers = sources("src").filter(file => /from "\.\/(ScheduleSignature|LocationRegistryAdmin)"|import\("\.\/(ScheduleSignature|LocationRegistryAdmin)"\)/.test(read(file)));
check(dead.every(file => !fs.existsSync(file)) && importers.length === 0, "N4 الملفان الميتان محذوفان ولا يستوردهما شيء");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
