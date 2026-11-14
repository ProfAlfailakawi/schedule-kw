/**
 * ── عدّةُ اختبار إضافات «مساري» (التنبيهات والمشاركة) داخل العملية ─────────────
 *
 * قاعدةُ بياناتٍ مؤقتة بفصلٍ ومقرراتٍ وشعبٍ موقَّعة وتذكرتَين، ومسارات `registerStudentExtras` على خادمٍ express
 * حقيقيّ بباب جلسةٍ وهميّ (الترويسة x-fp تحدّد الطالب) — فتُختبر المساراتُ والمخزنُ والمُرسِل بلا شبكة ولا خدمة دفع:
 * الإرسالُ يمرّ بـ`fetchImpl` يسجّل ما أُرسل ويفكّ تشفيره بمفتاح الجهاز الوهمي.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import type { StudentProfile } from "../../src/types";
import { b64u, decryptPushPayload, deriveVapidKeys, type PushFetch } from "../../src/server/webPush";
import { planProgress } from "../../src/utils/studentProfile";

export const KEY = Buffer.from("k".repeat(32));
export const VAPID = deriveVapidKeys("student-extras-test-secret");
export const NAME = "سارة محمد العتيبي";
export const CIVIL = "299010112345";
export const CODE_HASH = "SCRYPT-HASH-DO-NOT-LEAK";
export const SECTION_A = 11, SECTION_B = 12;

export interface Device { endpoint: string; keys: { p256dh: string; auth: string }; priv: string }
export function device(name: string): Device {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const auth = randomBytes(16);
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) }, priv: b64u(ecdh.getPrivateKey()) };
}

/** يوم بتوقيت الكويت + ساعة → لحظةٌ بالميلي ثانية. */
export const kw = (date: string, time: string) => Date.parse(`${date}T${time}:00+03:00`);

export async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-extras-"));
  const courses: any[] = [], planCourses: any[] = [], schedules: any[] = [];
  const names: Record<number, string[]> = { [SECTION_A]: ["أصول التربية", "فقه العبادات", "علوم القرآن", "السيرة النبوية"], [SECTION_B]: ["النحو", "الصرف", "البلاغة", "الأدب"] };
  let id = 100, row = 1;
  for (const sid of [SECTION_A, SECTION_B]) names[sid].forEach((name, i) => {
    id += 1;
    courses.push({ AdCourseId: id, AdCollegeId: 1, AdSectionId: sid, CourseCode: `${sid === SECTION_A ? "ISL" : "ARB"}${100 + i}`, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
    planCourses.push({ id: `p${id}`, planId: `plan-${sid}`, AdCollegeId: 1, AdSectionId: sid, AdCourseId: id, createdAt: "2026-01-01" });
    if (i < 3) schedules.push({ id: row++, AdCollegeId: 1, AdSectionId: sid, AdTermId: 1, AdCourseId: id, AdCourseName: name, SCode: "01", AdInstructorId: 1,
      fsunday: i % 2 === 0, fmonday: false, ftuesday: i % 2 === 0, fwednesday: false, fthursday: i === 1, fstarttime: `${8 + i * 2}:00`, fendtime: `${9 + i * 2}:30`, AdRoomCode: "R1", AdRoomHall: "", CourseCredit: 3 });
  });
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [],
    terms: [{ AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 15, AdTermClosed: false,
      AdTermStudentPhases: { wishesOpen: "2026-11-01", wishesClose: "2026-11-20", rounds: [{ id: "r1", name: "مبكر", start: "2026-11-25", end: "2026-11-30" }], requestsClose: "2027-01-31" } }],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية التربية الأساسية" }],
    sections: [{ AdSectionId: SECTION_A, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: "قسم التربية الإسلامية" }, { AdSectionId: SECTION_B, AdCollegeId: 1, AdSectionCode: "ARB", AdSectionName: "قسم اللغة العربية" }],
    instructors: [{ AdInstructorId: 1, AdInstructorName: "د. تجريبي", AdInstructorCivil: "", AdInstructorMobile: "" }],
    courses, curriculumPlans: [{ id: `plan-${SECTION_A}`, AdCollegeId: 1, AdSectionId: SECTION_A, name: "الصحيفة الجديدة", status: "active", createdAt: "2026-02-01" }, { id: `plan-${SECTION_B}`, AdCollegeId: 1, AdSectionId: SECTION_B, name: "صحيفة العربية", status: "active", createdAt: "2026-02-01" }],
    curriculumPlanCourses: planCourses, courseTransitions: [], schedules, rooms: [], studentNeeds: [], studentProfiles: [],
    scheduleApprovals: [{ id: "a1", AdCollegeId: 1, AdSectionId: SECTION_A, AdTermId: 1, status: "accepted" }, { id: "a2", AdCollegeId: 1, AdSectionId: SECTION_B, AdTermId: 1, status: "accepted" }],
    featureDocs: { universityStudentSettings: { university: { maxUnits: 18 } } },
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn, log = console.log; console.warn = () => {}; console.log = () => {};
  const { Repository, initDatabase } = await import("../../src/db/repository");
  await initDatabase();
  console.warn = quiet; console.log = log;
  const { registerStudentExtras } = await import("../../src/server/studentExtras");

  const courseOf = (sid: number) => courses.filter(c => c.AdSectionId === sid);
  const catalogOf = (sid: number) => ({ courses: new Map(courseOf(sid).map(c => [c.AdCourseId as number, { code: c.CourseCode as string, name: c.CourseName as string, credit: 3 }])) });

  /** ملفٌّ كاملٌ بكل ما يجب ألّا يخرج: الاسمُ المختوم والرمزُ المُلحَّم والبصمة. */
  const mkProfile = (fp: string, sid: number, extra: Partial<StudentProfile> = {}): StudentProfile => ({
    id: fp, fingerprint: fp, AdCollegeId: 1, AdSectionId: sid, curriculumPlanId: `plan-${sid}`,
    passedCourseIds: [courseOf(sid)[0].AdCourseId], passedUnits: 3, codeHash: CODE_HASH, codeSalt: "SALT", nameCipher: "NAME-CIPHER-XYZ", civilCipher: "CIVIL-CIPHER-XYZ",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z", deleteAt: "2099-01-01T00:00:00.000Z", deleteReason: "initial",
    wishes: { termId: 1, targetUnits: 15, courseIds: [courseOf(sid)[1].AdCourseId, courseOf(sid)[2].AdCourseId], constraints: {}, updatedAt: "2026-11-02T00:00:00.000Z" } as any,
    ...extra,
  });
  const put = (profile: StudentProfile) => Repository.updateStudentProfile(profile.fingerprint, () => profile);

  /** ملخّصُ الملف كما يُعيده الباب لصاحبه (فيه الاسمُ — لذا يُنتقى منه ولا يُمرَّر كلُّه). */
  const summaryOf = async (profile: StudentProfile) => {
    const sectionName = String(((await Repository.getSections()) as any[]).find(s => s.AdSectionId === profile.AdSectionId)?.AdSectionName || "");
    const catalog = catalogOf(profile.AdSectionId);
    const credit = new Map([...catalog.courses].map(([cid, c]) => [cid, c.credit]));
    const progress = planProgress(courseOf(profile.AdSectionId).map(c => c.AdCourseId), profile.passedCourseIds, credit);
    return { sectionName, planName: profile.curriculumPlanId === `plan-${SECTION_A}` ? "الصحيفة الجديدة" : "صحيفة العربية", progress, identity: { name: NAME, civilMasked: "•••••••••345" }, fingerprint: profile.fingerprint };
  };

  const state = { clockMs: kw("2026-11-20", "09:00"), sent: [] as Array<{ endpoint: string; body: Buffer }>, status: new Map<string, number>(), vapid: true };
  const fetchImpl: PushFetch = async (url, init) => { state.sent.push({ endpoint: url, body: Buffer.from(init.body) }); return { status: state.status.get(url) || 201 }; };
  const options = { vapid: async () => { if (!state.vapid) throw new Error("not configured"); return VAPID; }, fetchImpl, now: () => state.clockMs };

  const app = express();
  app.use(express.json());
  const ctx = {
    requireDoor: (async (req: any, res: any, next: any) => {
      const fp = String(req.headers["x-fp"] || "");
      const profile = fp ? await Repository.getStudentProfile(fp) : undefined;
      if (!profile) { res.status(401).json({ error: "انتهت جلستك.", code: "signed-out" }); return; }
      res.locals.door = { fingerprint: fp, profile };
      next();
    }) as express.RequestHandler,
    doorOf: (res: any) => res.locals.door,
    writeLimit: [] as express.RequestHandler[],
    identityKey: async () => KEY,
    summaryOf,
    sectionCatalog: async (sid: number) => catalogOf(sid),
    fail: (res: any, status: number, error: string, code?: string) => { res.status(status).json({ error, ...(code ? { code } : {}) }); },
  };
  registerStudentExtras(app, ctx, options);
  const server: Server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (method: string, url: string, body?: unknown, fp?: string) => {
    const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(fp ? { "x-fp": fp } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* صفحة */ }
    return { status: res.status, headers: res.headers, text, json };
  };
  /** يفكّ ما أُرسل إلى جهازٍ وهمي بمفتاحه. */
  const open = (entry: { body: Buffer }, dev: Device) => JSON.parse(decryptPushPayload(entry.body, dev.priv, dev.keys.auth).toString("utf8"));
  const toDevice = (url: string) => state.sent.filter(entry => entry.endpoint === url);

  /** تذاكرُ الفصل (تُحفظ معاً: الحفظُ يستبدل تذاكرَ الفصل كلَّها): الخطة «أ» ثلاثُ شعبٍ من جدول قسم الطالب الموقَّع. */
  const seedTickets = async (entries: Array<{ fp: string; sid: number; window?: number }>) => {
    const run: any = { id: "1", termId: 1, runId: "run-1", ranAt: "2026-11-21T00:00:00.000Z", ranBy: "test", students: entries.length, withoutRules: 0, defaulted: 0, rounds: 1, windows: [], courses: [], stale: false };
    const tickets: any[] = entries.map(({ fp, sid, window }) => ({ id: `1_${fp}`, termId: 1, runId: "run-1", fp, planId: `plan-${sid}`, window: window || 1, remainingUnits: 9, defaulted: false, unmet: [],
      plans: [{ label: "A", units: 9, items: courseOf(sid).slice(0, 3).map(c => ({ courseId: c.AdCourseId, offeringId: `1|1|${sid}|${c.AdCourseId}|01`, tight: false })) }] }));
    await Repository.saveRegistrationRun(run, tickets);
  };
  const closeAll = () => new Promise<void>(resolve => server.close(() => resolve()));
  return { Repository, mkProfile, put, call, open, toDevice, state, seedTickets, closeAll, options, courseOf, base };
}
