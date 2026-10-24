/**
 * ── زرعُ ألفِ أستاذٍ مصطنع لاختبار كرت الأستاذ (/r/:token) على Firestore ─────
 *
 * يُضاف إلى ما زرعه seed-emulator.ts (الكلية والأقسام الثلاثة والمقررات والفصل): أساتذةٌ بأرقامٍ مدنيةٍ مصطنعة،
 * لكلٍّ منهم ثلاثُ محاضراتٍ منسوخةٌ من جدول القسم بقاعاتٍ فريدة، ومديرٌ مصطنع بكلمة سرٍّ عشوائية لإصدار الروابط.
 * كلمةُ السر والأرقام تُكتب في ملفٍ محليٍّ (--out) ولا تُطبع.
 *
 * لا يعمل إلا على قاعةٍ مؤقتةٍ اسمُها loadtest في المشروع المذكور، وبلا محاكٍ، وإلا رفض:
 *
 *   FIREBASE_PROJECT_ID=gen-lang-client-0379571946 FIREBASE_DATABASE_ID=loadtest \
 *     npx tsx scripts/loadtest/seed-teachers.ts --real-database loadtest --teachers 1000 --out /tmp/lt/teachers.json
 */
import fs from "node:fs";
import { randomBytes, scryptSync } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createDemoSandboxState } from "../../src/db/demoSandbox";

const args = process.argv.slice(2);
const opt = (name: string, fallback = "") => { const at = args.indexOf(`--${name}`); return at >= 0 && args[at + 1] ? args[at + 1] : fallback; };
if (opt("real-database") !== "loadtest" || process.env.FIREBASE_DATABASE_ID !== "loadtest"
    || process.env.FIREBASE_PROJECT_ID !== "gen-lang-client-0379571946" || process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("يرفض: يتطلب --real-database loadtest وFIREBASE_DATABASE_ID=loadtest والمشروع gen-lang-client-0379571946 وبلا محاكٍ.");
  process.exit(1);
}
const COUNT = Math.max(1, Math.min(5000, Number(opt("teachers", "1000"))));
const OUT = opt("out", "/tmp/lt/teachers.json");
initializeApp({ projectId: "gen-lang-client-0379571946" });
const db = getFirestore("loadtest");
db.settings({ ignoreUndefinedProperties: true });
if (!(await db.collection("users").limit(1).get()).size) { console.error("يرفض: شغّل seed-emulator.ts أولاً."); process.exit(1); }
if ((await db.collection("users").doc("user_9001").get()).exists) { console.error("يرفض: الأساتذة مزروعون من قبل."); process.exit(1); }

const WEIGHTS = [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const syntheticCivil = (): string => {
  for (;;) {
    const digits = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10));
    const check = 11 - (digits.reduce((sum, d, i) => sum + d * WEIGHTS[i], 0) % 11);
    if (check >= 0 && check <= 9) return digits.join("") + check;
  }
};

const state = createDemoSandboxState();
const CURRENT = state.terms[0].AdTermId;
const templates = new Map<number, any[]>();
for (const row of state.schedules as any[]) {
  if (Number(row.AdTermId) !== Number(CURRENT)) continue;
  const list = templates.get(Number(row.AdSectionId)); if (list) list.push(row); else templates.set(Number(row.AdSectionId), [row]);
}
const sections = [...templates.keys()].sort();
let nextRowId = Math.max(...(state.schedules as any[]).map(row => Number(row.id) || 0)) + 1000;
const instructors: any[] = [], rows: any[] = [], teachers: any[] = [];
for (let k = 0; k < COUNT; k += 1) {
  const id = 1001 + k, sectionId = sections[k % sections.length], pool = templates.get(sectionId)!;
  const civil = syntheticCivil();
  instructors.push({ AdInstructorId: id, AdInstructorCivil: civil, AdInstructorName: `عضو هيئة تدريس اختبار ${k + 1}`, AdInstructorMobile: `5100${String(k + 1).padStart(4, "0")}`, AdInstructorLoad: 18 });
  for (let j = 0; j < 3; j += 1) {
    const base = pool[(k * 3 + j * 7) % pool.length];
    rows.push({ ...base, id: nextRowId++, AdInstructorId: id, SCode: String(50 + (k % 40)).padStart(2, "0"),
      AdRoomCode: `LT${k + 1}`, AdRoomHall: String(j + 1), buildingId: `building_lt${k + 1}`, roomId: `room_lt${k + 1}_${j + 1}` });
  }
  teachers.push({ id, civil, sectionId });
}
const salt = randomBytes(16), password = randomBytes(12).toString("base64url");
const admin = { SystemUserId: 9001, Name: "مدير اختبار التحمّل", SystemUserLogin: "loadtest.admin", SystemUserPass: `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`,
  SystemUserPassVault: "", IsAdminUser: true, IsActive: true, IsLocked: false, IsDeleted: false };
const writes: Array<[string, any]> = [
  ...instructors.map(row => [`instructors/instructor_${row.AdInstructorId}`, row] as [string, any]),
  ...rows.map(row => [`schedules/schedule_${row.id}`, row] as [string, any]),
  ["users/user_9001", admin], ["formSecurity/permission_9001", { legacyId: 9001, SystemUserId: 9001, FormNameId: 7 }],
];
for (let at = 0; at < writes.length; at += 400) {
  const batch = db.batch();
  for (const [path, data] of writes.slice(at, at + 400)) batch.set(db.doc(path), data);
  await batch.commit();
}
fs.mkdirSync(OUT.replace(/\/[^/]*$/, ""), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ login: "loadtest.admin", password, termId: CURRENT, collegeId: 1, sections, teachers }), { mode: 0o600 });
console.log(`زُرع ${instructors.length} أستاذاً و${rows.length} محاضرة على ${sections.length} أقسام؛ المفاتيح في ${OUT}`);
