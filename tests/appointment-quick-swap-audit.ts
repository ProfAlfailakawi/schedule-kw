/**
 * ── التبديل السريع داخل الموعد ──────────────────────────────────────────────
 *  U  دالّةٌ نقيّة: المصدرُ مدرّبٌ أو شاغر من المقرر والفصل نفسيهما، والاتجاهُ إلى الأستاذ الحقيقي وحده.
 *  W  الواجهة: أيقونةٌ بجانب الوقت وتبويبان «تدريب» و«هيئة تدريسية» بلا عدّاد ولا نصاب مدرّبين.
 *  S  الحفظ: مسار التعديل (PUT) القائم نفسه بتراجع، بلا مسارِ خادمٍ جديد ولا طلب موافقة من الأستاذ.
 */
import fs from "node:fs";
import { quickSwapAfter, quickSwapMine, quickSwapSources } from "../src/utils/appointmentQuickSwap";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra ?? ""); }
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const row = (id: number, instructor: number, extra: any = {}): any => ({ id, AdTermId: 1, AdCourseId: 10, AdInstructorId: instructor, SCode: String(id), fsunday: true, ftuesday: true, fstarttime: "14:00", fendtime: "15:00", AdRoomCode: "R", AdRoomHall: "1", ...extra });
const TRAINEE = 50, VACANT = 90, TEACHER = 7;
const mine = quickSwapMine({ fsunday: true, ftuesday: true, fstarttime: "15:00", fendtime: "16:00", AdRoomCode: "A", AdRoomHall: "2" });
const rows = [row(1, TRAINEE), row(2, VACANT, { fstarttime: "15:00", fendtime: "16:00" }), row(3, 33), row(4, TRAINEE, { AdCourseId: 11 }), row(5, TRAINEE, { AdTermId: 2 }), row(6, TEACHER, { fstarttime: "14:00", fendtime: "15:00", fsunday: true, ftuesday: false, fmonday: false })];
const base = { rows, teacherId: TEACHER, courseId: 10, termId: 1, editId: 0, traineeIds: new Set([TRAINEE]), placeholderIds: new Set([VACANT]), mine };
const list = quickSwapSources(base);
check(list.map(item => item.rowId).sort().join() === "1,2", "U1 المصدرُ مدرّبٌ أو شاغر من المقرر والفصل نفسيهما فقط", list.map(i => i.rowId));
check(list.find(item => item.rowId === 1)?.kind === "trainee" && list.find(item => item.rowId === 2)?.kind === "vacant", "U2 النوعُ تدريب/شاغر");
check(list.find(item => item.rowId === 2)?.sameTime === true && list.find(item => item.rowId === 1)?.sameTime === false, "U3 sameTime يقارن أيام الموعد ووقته");
check(list.find(item => item.rowId === 1)?.freeAtIts === false && list.find(item => item.rowId === 1)?.freeAtMine === true, "U4 تداخل الأستاذ في وقتها (14:00) وحرّيته في وقت موعدي (15:00)");
check(quickSwapSources({ ...base, teacherId: TRAINEE }).length === 0 && quickSwapSources({ ...base, teacherId: VACANT }).length === 0, "U5 لا تبديلَ إلى مدرّبٍ أو شاغر (الهدف تقليلُهما)");
check(quickSwapSources({ ...base, editId: 1 }).map(i => i.rowId).join() === "2", "U6 الموعدُ المفتوح للتعديل لا يُعرض");
const its = quickSwapAfter(rows[0], TEACHER, "its", mine) as any, withMine = quickSwapAfter(rows[0], TEACHER, "mine", mine) as any;
check(its.AdInstructorId === TEACHER && its.fstarttime === "14:00" && its.AdRoomCode === "R", "U7 «بوقتها»: الأستاذ وحده يتبدّل");
check(withMine.AdInstructorId === TEACHER && withMine.fstarttime === "15:00" && withMine.fendtime === "16:00" && withMine.AdRoomCode === "A" && withMine.fmonday === false, "U8 «بوقتي»: أيامُ الموعد ووقتُه وقاعتُه");
check(quickSwapMine({ fsunday: true, fstarttime: "08:00" }) === null, "U9 بلا وقتٍ مكتمل لا «بوقتي»");

const comp = read("src/components/AppointmentQuickSwap.tsx"), schedules = read("src/components/Schedules.tsx"), css = read("src/styles/71-quick-swap.css");
check(/role="tablist"/.test(comp) && />تدريب</.test(comp) && />هيئة تدريسية</.test(comp) && /aria-label="تبديل سريع/.test(comp), "W1 تبويبان «تدريب» و«هيئة تدريسية» وأيقونةٌ بتسمية");
check(!/نصاب|load/i.test(comp), "W2 لا نصابَ مدرّبين ولا عدّاد في الواجهة");
check(/studioWasMark\(studioTimeWas, "time"\)\}\n\s*<AppointmentQuickSwap/.test(schedules), "W3 الأيقونة بجانب عنوان خطوة الوقت");
check(/data-guide-ignore/.test(comp) && /Escape/.test(comp) && /aria-expanded/.test(comp), "W4 إرشادٌ وإغلاقٌ بـEscape وحالةُ توسّع");
check(/qs-panel\{position:fixed|\.qs-panel\{position:fixed/.test(css) && /prefers-reduced-motion|max-width:640px/.test(css), "W5 على الهاتف لوحةٌ سفليّة");
check(/applyQuickSwap = async[\s\S]{0,1400}method: "PUT"[\s\S]{0,900}offerUndo\([\s\S]{0,200}restoreStep\(before\)/.test(schedules), "S1 الحفظُ بمسار PUT القائم وتراجعٌ بلقطة الصفّ");
check(/mode === "mine" && editor === "create"\) \{ clearDraft\(\); back\(\)/.test(schedules), "S2 «بوقتي» تستهلك مسودةَ الموعد الجديد فلا نسخةَ مكررة");
check(!/ta-trainee-names|quick-swap/.test(read("src/server/routes/scheduleToolsRoutes.ts")) && !/confirm|visualConfirm|decide/.test(comp), "S3 لا مسارَ خادمٍ جديد ولا طلبَ موافقة من الأستاذ");
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
