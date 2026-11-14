/**
 * ── الخروج عن النمط تنبيهٌ ⚠️ لا مانع، والحكمُ واحدٌ للشريط واللوحة (قرار المالك + تدقيق 2026-11-14) ──
 *  V1 regulation=off: ملاحظةٌ لا تمنع الحفظ (canSave) وتبقى مانعاتُ الحقيقة (تعارض، حقول ناقصة، يوم الجامعة).
 *  V2 نصُّ الخادم المانع يبقى مانعاً كما قاله ولا يتكرر.
 *  V3 regulationIssues (من الخادم) ملاحظاتٌ في بطاقة الوقت بلا تكرار، وتُعدّ مع الملاحظات.
 *  V4 missingAppointmentFields = ما يشترطه save(): معرّف المبنى ومعرّف القاعة (أو «بانتظار القاعة») والشعبة.
 *  P1 AppointmentChecksPanel: regulationNotes تُسرد وتُعدّ، والعنوان «يفحص…» لا «جاهز» أثناء الفحص.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { appointmentSaveGaps, appointmentVerdict, missingAppointmentFields, withRegulationNotes } from "../src/utils/appointmentVerdict";
import AppointmentChecksPanel from "../src/components/AppointmentChecksPanel";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra === undefined ? "" : JSON.stringify(extra).slice(0, 500)); }
};
const form: any = { AdCourseId: 1, SCode: "501", AdInstructorId: 7, buildingId: "b", roomId: "r", AdRoomCode: "901A01", AdRoomHall: "L01", fsunday: true, fstarttime: "09:00", fendtime: "09:30" };

/* V1 */
const warn = appointmentVerdict({ form, validationIssues: [], conflicts: [], regulation: "off", regulationNote: "مدة 30د لا توافق النمط" });
check(warn.canSave && !warn.blockers.length && warn.state === "notes" && warn.notes.some(n => n.id === "regulation" && !n.blocks), "V1 خارج النمط: ملاحظةٌ لا مانع، والحفظ متاح", warn);
check(warn.checks.find(c => c.kind === "time")?.state === "warn", "V1 بطاقة الوقت «تنبيه» لا «تعارض»");
const hard = appointmentVerdict({ form, validationIssues: ["وقت المحاضرة يجب أن يكون ضمن الدوام الشامل (08:00–20:00)"], conflicts: [], regulation: "off" });
check(!hard.canSave && hard.blockers.length === 1, "V1 مانعُ يوم الجامعة يبقى مانعاً");
const clash = appointmentVerdict({ form, validationIssues: [], conflicts: [{ type: "instructor", severity: "high", message: "الأستاذ لديه محاضرة" }], regulation: "off" });
check(!clash.canSave && clash.blockers.length === 1, "V1 التعارضُ الحقيقي يبقى مانعاً");
check(appointmentVerdict({ form, validationIssues: [], conflicts: [], regulation: "fits" }).state === "ready", "V1 الموافق للنمط «جاهز»");
const pending = appointmentVerdict({ form, validationIssues: [], conflicts: [], regulation: "off", checking: true });
check(!pending.canSave && pending.state === "checking", "V1 أثناء الفحص لا حفظ");

/* V2 */
const server = appointmentVerdict({ form, validationIssues: ["مدة الموعد 30د لا توافق النمط المعتمد (أحد · 170د): النهاية 11:50."], conflicts: [], regulation: "off", regulationNote: "x" });
check(!server.canSave && server.blockers.length === 1 && !server.notes.some(n => n.id === "regulation"), "V2 مانعُ الخادم يبقى كما قاله بلا تكرار", server);

/* V3 */
const issues = [{ rule: "start-ladder", text: "البداية خارج السُّلّم (م.7/8)" }, { rule: "fixed-start", text: "وقت الشعبة الثابت (م.7/9)" }];
const withIssues = appointmentVerdict({ form, validationIssues: [], conflicts: [], regulation: "off", regulationNote: "مدة 30د", regulationIssues: issues });
check(withIssues.notes.length === 3 && withIssues.canSave && withIssues.checks.find(c => c.kind === "time")!.details.length === 3, "V3 ثلاث ملاحظات في بطاقة الوقت (النمط + اثنتان من الخادم)", withIssues.notes);
const dup = appointmentVerdict({ form, validationIssues: [], conflicts: [], regulationIssues: [issues[0], issues[0]] });
check(dup.notes.length === 1, "V3 النصُّ المكرر يُعدّ مرة");
const merged = withRegulationNotes(appointmentVerdict({ form, validationIssues: [], conflicts: [], regulation: "fits" }), issues);
check(merged.state === "notes" && merged.notes.length === 2 && merged.canSave && merged.okCount < 6, "V3 withRegulationNotes ترفع «جاهز» إلى «ملاحظات» وتحدّث العدّاد", merged);
check(withRegulationNotes(warn, [{ text: warn.notes[0].text }]) === warn, "V3 لا تكرار ← الحكمُ نفسه");

/* V4 */
const nameOnly = { AdCourseId: 1, SCode: "501", AdInstructorId: 7, AdRoomCode: "901A01", AdRoomHall: "L01", fsunday: true, fstarttime: "09:00", fendtime: "09:50" };
check(missingAppointmentFields(nameOnly as any).join() === "القاعة" && appointmentSaveGaps(nameOnly as any).join() === "building,room", "V4 رمز القاعة والقاعة نصّاً لا يكفيان (يطلب save() المعرّفين)", appointmentSaveGaps(nameOnly as any));
check(missingAppointmentFields({ ...nameOnly, buildingId: "b", roomId: "r" } as any).length === 0, "V4 المعرّفان يكفيان");
check(missingAppointmentFields({ ...nameOnly, buildingId: "b", locationStatus: "PENDING_ROOM" } as any).length === 0, "V4 «بانتظار القاعة» مع المبنى يكفي");
check(missingAppointmentFields({ ...nameOnly, buildingId: "b", roomId: "r", SCode: "" } as any).join() === "الشعبة" && missingAppointmentFields({ AdCourseId: 1, AdInstructorId: 7, fsunday: true, fstarttime: "9:00", fendtime: "9:50", buildingId: "b", roomId: "r" } as any).length === 0, "V4 الشعبةُ تُطلب حين يحملها النموذج فقط");

/* P1 */
const noop = () => undefined;
const ready = appointmentVerdict({ form, validationIssues: [], conflicts: [], regulation: "fits" });
const panel = renderToStaticMarkup(<AppointmentChecksPanel verdict={ready} checking={false} regulationNotes={issues} />);
check(/ملاحظات/.test(panel) && /البداية خارج السُّلّم/.test(panel) && /وقت الشعبة الثابت/.test(panel) && !/>جاهز</.test(panel), "P1 اللوحة تسرد regulationNotes وعنوانها «ملاحظات»", panel.slice(0, 300));
const tally = /title="تنبيهات لا تمنع الحفظ"[^>]*>.*?<\/svg>(\d+)</.exec(panel);
check(tally?.[1] === "2", "P1 عدّاد التنبيهات = ما تسرده اللوحة (2)", tally?.[0]);
const busy = renderToStaticMarkup(<AppointmentChecksPanel verdict={ready} checking={true} />);
check(/يفحص…/.test(busy) && !/checks-head-state">جاهز/.test(busy) && /aria-busy="true"/.test(busy), "P1 أثناء الفحص «يفحص…» لا «جاهز»", busy.slice(0, 400));
const busy2 = renderToStaticMarkup(<AppointmentChecksPanel verdict={pending} checking={false} />);
check(/يفحص…/.test(busy2), "P1 حكمٌ في حالة checking يكفي لـ«يفحص…»");
const idle = renderToStaticMarkup(<AppointmentChecksPanel verdict={ready} checking={false} />);
check(/>جاهز</.test(idle), "P1 بلا ملاحظات وبلا فحص: «جاهز»");
void noop;

console.log(`\nverdict-regulation-warning audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
