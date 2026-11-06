/**
 * ── ملاحظات المالك 2026-11-06: زر الدرجة العلمية، والمنتدبون، وبطاقة الدخول ──
 *
 * ١) محرّر الدرجة يُفتح من داخل ورقة أدوات الجدول (طبقتها 500)، فلا يبقى تحتها بطبقة 121،
 *    والزرّ لا يختفي بصمت، وخطأ الحفظ يُقال داخل المحرّر لا خلفه.
 * ٢) المنتدب خارج «الأساتذة» قراءةً وكتابةً، إلا إن كان في هيئة القسم؛ والمتقاعد وTA باقيان.
 * ٣) بطاقة الكرسي في «الفرق» وحدها، ولا حسابَ يفقد بابه الوحيد إلى بطاقة.
 */
import fs from "fs";
import { rosterMemberIds } from "../src/utils/rosterGroups";
import { hasTeamCard } from "../src/utils/seats";

let failed = 0;
const check = (ok: boolean, label: string) => { if (!ok) { failed++; process.exitCode = 1; } console.log(`${ok ? "✓" : "✗"} ${label}`); };
const read = (file: string) => fs.readFileSync(file, "utf8");
const flat = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");

/* ١ */
const css = flat(read("src/styles/04-screens.css")), details = flat(read("src/styles/09-details.css"));
const z = (source: string, selector: string) => Number(source.match(new RegExp(`${selector.replace(/[.-]/g, "\\$&")}\\{[^}]*?z-index:(\\d+)`))?.[1] || 0);
const sheet = z(details, ".transfer-backdrop");
check(sheet > 0 && z(css, ".catalog-form-drawer.is-raised") > sheet && z(css, ".catalog-form-backdrop.is-raised") > sheet, "الدرج المرفوع فوق طبقة ورقة الأدوات");
const roster = read("src/components/DepartmentRoster.tsx"), editor = read("src/components/LoadException.tsx"), ui = read("src/components/ui.tsx");
check(/<LoadExceptionEditor[^>]*\braised\b/.test(roster), "محرّر الدرجة في «الأساتذة» مرفوع");
check(/CatalogFormDrawer label=[^>]*raised=\{raised\}/.test(editor) && /raised \? "is-raised"/.test(ui), "المرفوع يصل الدرج وخلفيته");
check(!/roster\.enabled \? <button/.test(roster) && /الدرجة العلمية<\/button>/.test(roster), "زر الدرجة لا يتعلّق بتفعيل النصاب");
check(/roster\.ranks\.length/.test(roster) && /note=\{editorNote\}/.test(roster), "تعطيل النصاب وخلوّ الدرجات يُقالان في المحرّر");
check(/error=\{error\}/.test(roster) && /problem \|\| error/.test(editor), "خطأ الحفظ يظهر داخل المحرّر");

/* ٢ */
const members = (delegates: number[], faculty: number[], taught: number[], people: any[] = []) => [...rosterMemberIds({ delegates, faculty, taught, people })].sort((a, b) => a - b);
check(members([9], [1], [1, 2, 9]).join() === "1,2", "المنتدب الذي درّس في القسم لا يدخل");
check(members([1], [1], [1]).join() === "1", "المنتدب الذي هو من هيئة القسم يبقى");
check(members([9, 8], [], [9, 8], [{ AdInstructorId: 9, AdInstructorStatus: "retired" }, { AdInstructorId: 8, AdInstructorCategory: "ta" }]).join() === "8,9", "المتقاعد وTA باقيان");
check(members([9], [], [9], [{ AdInstructorId: 9, AdInstructorStatus: "sabbatical" }]).join() === "", "التفرّغ وحده لا يُبقي منتدباً");
check(members([], [3], [0, null, 4]).join() === "3,4", "صفٌّ بلا أستاذ لا يصير عضواً");
const routes = read("src/server/routes/instructorsRoutes.ts");
const ids = routes.split("async function sectionRosterIds(")[1].split('app.get("/api/section-roster"')[0];
check(/readVisitingStatus\(collegeId, sectionId\)/.test(ids) && /rosterMemberIds\(/.test(ids), "الاختبار نفسه لصفة «منتدب» بعائلة القسم");
check((routes.match(/sectionRosterIds\(collegeId, sectionId\)/g) || []).length >= 2, "القراءة والكتابة بعضوية واحدة");

/* ٣ */
check(hasTeamCard({ Role: "departmentHead" }) && hasTeamCard({ Role: "committeeChair" }), "للكراسي بطاقة في «الفرق»");
check(!hasTeamCard({ Role: "standard" }) && !hasTeamCard({ Role: "dean", IsAdminUser: true }), "المستخدم العادي وحساب الإدارة ليسا في «الفرق»");
const users = read("src/components/AdminUsers.tsx"), panel = read("src/components/seats/SeatPanel.tsx");
check(/hasTeamCard\(selected\)[\s\S]{0,420}: <AccountInvitation /.test(users), "«المستخدمون» تُبقي البطاقة لمن لا كرسيّ له وحده");
check(/detail\.canManage && source === "seat" \? <button[^\n]*البطاقة/.test(panel) && /detail\.holder \|\| \{ name: detail\.seat\.name \}/.test(panel), "فريقٌ بلا رئيس مسجَّل له بطاقة في «الفرق»");
check(/isPowerUser/.test(read("src/server/seatsRoutes.ts")) && /const powerOnlyFormIds = new Set\(\[[^\]]*\b11\b/.test(read("src/server/core/auth.ts")), "من يرى «المستخدمون» يصل «الفرق» (صلاحية 11 لمدير النظام)");

console.log(failed ? `${failed} فشل` : "اكتمل");
