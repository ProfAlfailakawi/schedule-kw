/**
 * ── زرعُ نسخةٍ تجريبية لاختبار التحمّل: المحاكي المحلي وحده ─────────────────
 *
 * يكتب بيانات الصندوق التجريبي (createDemoSandboxState: كليات وأقسام ومقررات
 * وفصول وجداول مُصطنعة، بلا أي بيانٍ حقيقي) في محاكي Firestore المحلي، ويفتح
 * «مرحلة الرغبات» في الفصل الجاري، ليجري عليها سكربت التحمّل (student-door.mjs).
 *
 * لا يعمل إلا على محاكٍ محلي: يرفض إن لم يُضبط FIRESTORE_EMULATOR_HOST على
 * localhost/127.0.0.1، فلا يمكن أن يكتب في قاعدة الجامعة ولو ضُبطت متغيراتها.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_PROJECT_ID=schedule-loadtest npx tsx scripts/loadtest/seed-emulator.ts
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createDemoSandboxState } from "../../src/db/demoSandbox";

const host = String(process.env.FIRESTORE_EMULATOR_HOST || "");
if (!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) {
  console.error("يرفض السكربت العمل: FIRESTORE_EMULATOR_HOST يجب أن يشير إلى محاكٍ محلي (127.0.0.1:PORT).");
  process.exit(1);
}
const projectId = process.env.FIREBASE_PROJECT_ID || "schedule-loadtest";
initializeApp({ projectId });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const state = createDemoSandboxState();
const today = new Date();
const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
/* الفصل الجاري في «مرحلة الرغبات» اليوم: هي المرحلة التي يدخلها كل الطلبة خلال ساعات. */
const current = state.terms[0];
current.AdTermStudentPhases = {
  wishesOpen: day(-1), wishesClose: day(10),
  rounds: [{ id: "early", name: "التسجيل المبكر", start: day(11), end: day(14) }],
  requestsClose: day(30), updatedAt: today.toISOString(), updatedBy: "اختبار التحمّل",
};

const collections: Array<[string, any[], (row: any) => string]> = [
  ["users", state.users, row => `user_${row.SystemUserId}`],
  ["terms", state.terms, row => `term_${row.AdTermId}`],
  ["colleges", state.colleges, row => `college_${row.AdCollegeId}`],
  ["sections", state.sections, row => `section_${row.AdSectionId}`],
  ["instructors", state.instructors, row => `instructor_${row.AdInstructorId}`],
  ["courses", state.courses, row => `course_${row.AdCourseId}`],
  ["schedules", state.schedules, row => `schedule_${row.id}`],
  ["rooms", state.rooms, row => `room_${row.AdRoomId}`],
];

for (const [name, rows, idOf] of collections) {
  for (let offset = 0; offset < rows.length; offset += 400) {
    const batch = db.batch();
    rows.slice(offset, offset + 400).forEach(row => batch.set(db.collection(name).doc(idOf(row)), row));
    await batch.commit();
  }
  console.log(`${name}: ${rows.length}`);
}
console.log(`الفصل «${current.AdTermName}» في مرحلة الرغبات (${day(-1)} ← ${day(10)}). الأقسام: ${state.sections.map(s => s.AdSectionId).join(", ")}`);
