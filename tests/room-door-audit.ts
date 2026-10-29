/**
 * ── بابُ القاعة وشاشةُ الممر ─────────────────────────────────────────────────
 *
 *   R1  الحال عند ساعاتٍ ثابتة بتوقيت الكويت: فاضية، مشغولة، تبدأ بعد، عطلة،
 *       خارج الفصل، ومحاضرةٌ أُلغيت اليوم تُرى فاضيةً بوسمها — على أسبوعٍ مبنيٍّ
 *       من صفوف الجدول نفسها (شعبتان معاً، قاعةٌ مشتركة بين قسمين، صفٌّ قديمٌ نصّي).
 *   R2  النصُّ الذي يُرسل إلى المتصفّح هو نفسُه الذي يحسب في الخادم، ويعمل وحده.
 *   R3  الرمز: ثابتٌ بين الإقلاعات، مستقلٌّ عن CALENDAR_SECRET، مختلفٌ لكل قاعة ومبنى.
 *   R4  لا اسمَ أستاذ ولا معرّفَ في البيانات، والصفحةُ عربيةٌ من اليمين بسكربتٍ مختوم.
 *   R5  لوحةُ المبنى بالدور ثم الرقم، والروابطُ لمدير السجل وحده، والحدُّ يعمل.
 *   R6  ملصقاتُ الأبواب: A4، أربعةٌ في الصفحة، برمز QR من المولّد المحلّي.
 */
import fs from "fs";
import os from "os";
import path from "path";
import vm from "vm";
import express from "express";
import type { AddressInfo } from "net";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 600) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const at = (iso: string) => Date.parse(iso);

/* ── المستودع المحلّي: فصلٌ جارٍ وفصلٌ قادم، ومبنىً بقاعاته، وأساتذةٌ بأسماء ─────────── */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-room-door-"));
const INSTRUCTOR_NAMES = ["د. سارة المطيري", "د. خالد العنزي", "أ. بديل الإلغاء"];
const row = (id: number, sectionId: number, courseId: number, code: string, days: Partial<Record<"fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday", boolean>>, start: string, end: string, place: Record<string, unknown>, termId = 1) => ({
  id, AdCollegeId: 5, AdSectionId: sectionId, AdTermId: termId, AdCourseId: courseId, AdCourseName: `مقرر ${code}`, SCode: code,
  AdInstructorId: sectionId === 1 ? 1 : 2, fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, ...days,
  fstarttime: start, fendtime: end, ...place,
});
const F01 = { buildingId: "building_011B05", roomId: "room_011B05_F01", AdRoomCode: "011B05", AdRoomHall: "F01", locationStatus: "VERIFIED" };
const G02 = { buildingId: "building_011B05", roomId: "room_011B05_G02", AdRoomCode: "011B05", AdRoomHall: "G02", locationStatus: "VERIFIED" };
const course = (id: number, sectionId: number, code: string, name: string) => ({ AdCourseId: id, AdCollegeId: 5, AdSectionId: sectionId, CourseCode: code, CourseName: name, CourseCredit: 3, CourseHours: 3, MaxStudent: 30 });
const room = (code: string, sectionIds: number[], extra: Record<string, unknown> = {}) => ({
  id: `room_011B05_${code}`, buildingId: "building_011B05", buildingCode: "011B05", canonicalCode: code, active: true, aliases: [],
  collegeIds: [5], sectionIds, primarySectionIds: sectionIds, shared: sectionIds.length > 1, historicalUsageCount: 0,
  confidence: "CONFIRMED", source: "TEST", adminVerified: true, evidence: [], auditHistory: [], ...extra,
});
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
  users: [], formNames: [], formSecurity: [], collegeUserAssign: [], rooms: [], courseTransitions: [],
  terms: [
    { AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 15 },
    { AdTermId: 2, AdTermName: "الفصل الثاني 2026/2027", AdTermStart: "2027-01-31", AdTermWeeks: 15 },
  ],
  colleges: [{ AdCollegeId: 5, AdCollegeCode: "B", AdCollegeName: "كلية التربية الأساسية - بنين" }],
  sections: [
    { AdSectionId: 1, AdCollegeId: 5, AdSectionCode: "09", AdSectionName: "تكنولوجيا التعليم" },
    { AdSectionId: 2, AdCollegeId: 5, AdSectionCode: "10", AdSectionName: "التربية الفنية" },
  ],
  instructors: [
    { AdInstructorId: 1, AdInstructorName: INSTRUCTOR_NAMES[0], AdInstructorCivil: "300010100122", AdSectionId: 1 },
    { AdInstructorId: 2, AdInstructorName: INSTRUCTOR_NAMES[1], AdInstructorCivil: "300123100006", AdSectionId: 2 },
  ],
  courses: [
    course(11, 1, "0109105", "مدخل إلى تكنولوجيا التعليم"), course(12, 2, "0110108", "الرسم الحرّ"),
    course(13, 1, "0109122", "إنتاج الوسائل"), course(14, 1, "0109221", "التصميم التعليمي"), course(15, 1, "0109224", "التعلم الإلكتروني"),
    course(16, 1, "0109999", "مقرر الفصل القادم"),
  ],
  schedules: [
    /* شعبتان من المقرر نفسه في الوقت نفسه: محاضرةٌ واحدة «01 · 02». */
    row(101, 1, 11, "01", { fsunday: true, ftuesday: true }, "08:00", "09:15", F01),
    row(102, 1, 11, "02", { fsunday: true, ftuesday: true }, "08:00", "09:15", F01),
    /* قاعةٌ مشتركة: قسمٌ آخر في القاعة نفسها. */
    row(103, 2, 12, "01", { fsunday: true, ftuesday: true }, "09:30", "10:45", F01),
    /* صفٌّ قديمٌ نصّي بلا معرّف: يشغل القاعة نفسها. */
    row(104, 1, 13, "03", { fsunday: true }, "12:00", "13:15", { AdRoomCode: "011B05", AdRoomHall: "F01" }),
    row(105, 1, 14, "01", { fthursday: true }, "14:00", "15:15", F01),
    row(106, 1, 15, "01", { fthursday: true }, "15:30", "16:45", F01),
    /* قاعةٌ أخرى في المبنى. */
    row(107, 2, 12, "02", { fsunday: true }, "10:00", "11:15", G02),
    /* الفصلُ القادم في القاعة نفسها والوقت نفسه: لا يظهر — البابُ يقول ما يُدرَّس الآن. */
    row(201, 1, 16, "01", { fsunday: true }, "10:00", "11:15", F01, 2),
  ],
  scheduleWeekExceptions: [
    { id: "x1", createdAt: "2026-11-01T06:00:00Z", scheduleId: 106, AdCollegeId: 5, AdSectionId: 1, AdTermId: 1, date: "2026-11-05", kind: "cancel", SystemUserId: 1, userName: "رئيس القسم" },
    { id: "x2", createdAt: "2026-11-01T06:00:00Z", scheduleId: 105, AdCollegeId: 5, AdSectionId: 1, AdTermId: 1, date: "2026-11-05", kind: "cover", coverInstructorId: 9, coverInstructorName: INSTRUCTOR_NAMES[2], SystemUserId: 1, userName: "رئيس القسم" },
  ],
  locationBuildings: [
    { id: "building_011B05", officialCode: "011B05", sitePrefix: "011B", prefix: "011", siteLetter: "B", buildingNumber: "5", siteName: "", branchName: "كلية التربية الأساسية - بنين", description: "مبنى القاعات", active: true, aliases: [], collegeIds: [5], sectionIds: [1, 2], historicalUsageCount: 0, roomCount: 5, confidence: "CONFIRMED", source: "TEST", adminVerified: true, evidence: [], auditHistory: [] },
  ],
  locationRooms: [
    room("F01", [1, 2]), room("G02", [2]), room("F10", [1]), room("S01", [1]), room("L01", [1]), room("G01", [1]),
    room("F99", [1], { active: false }),
  ],
}), { mode: 0o600 });

process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
delete process.env.ROOM_DOOR_FAKE_NOW;
const quiet = console.warn; console.warn = () => {};
const { Repository, initDatabase } = await import("../src/db/repository");
await initDatabase();
console.warn = quiet;
const door = await import("../src/utils/roomDoor");
const data = await import("../src/server/roomDoorData");
const secret = await import("../src/server/roomDoorSecret");
const calendar = await import("../src/server/calendarSecret");
const pageModule = await import("../src/server/roomDoorPage");
const { registerRoomDoorRoutes } = await import("../src/server/roomDoorRoutes");

/* ── R1: الحال عند ساعاتٍ ثابتة ─────────────────────────────────────────────── */
const terms = await Repository.getTerms();
const registry = { buildings: await Repository.getLocationBuildings(), rooms: await Repository.getLocationRooms() };
const index = data.buildDoorTermIndex({
  termId: 1, rows: await Repository.getSchedulesByScope({ termId: 1 }), courses: await Repository.getCourses(), exceptions: await Repository.getScheduleWeekExceptions(1),
});
const f01 = registry.rooms.find(item => item.canonicalCode === "F01")!;
const building = registry.buildings[0];
const roomAt = (iso: string) => data.roomDoorData({ room: f01, building, index, terms, nowMs: at(iso), build: "test-build", boardHref: "/b/x" });
const viewAt = (iso: string) => { const d = roomAt(iso); return { d, v: door.doorViewAt(d, d.at, door.doorStatusAt, door.doorClockAt) }; };
{
  const { d, v } = viewAt("2026-11-01T10:20:00+03:00");
  check(v.state === "busy" && door.doorSentence(v) === "مشغولة · 0110108 — تنتهي 10:45", "R1 مشغولة (الأحد 10:20): المقرر ووقتُ انتهائه", door.doorSentence(v));
  const sunday = d.week[0].lectures;
  check(sunday.length === 3 && sunday[0].sec === "01 · 02" && sunday[0].code === "0109105", "R1 شعبتان معاً في الوقت نفسه محاضرةٌ واحدة «01 · 02»", sunday);
  check(sunday.some(l => l.code === "0110108"), "R1 القاعةُ المشتركة تعرض محاضرة القسم الآخر");
  check(sunday.some(l => l.code === "0109122" && l.start === "12:00"), "R1 الصفُّ القديم بنصّ المبنى والقاعة يشغلها كذلك");
  check(!d.week.some(day => day.lectures.some(l => l.code === "0109999")), "R1 الفصلُ القادم لا يظهر: البابُ يقرأ الفصل الجاري (currentTermId)");
  check(d.term?.name === "الفصل الأول 2026/2027" && d.term.start === "2026-09-13" && d.term.end === "2026-12-24", "R1 حدّا الفصل من تاريخ بدئه وأسابيعه", d.term);
}
{
  const { v } = viewAt("2026-11-01T09:20:00+03:00");
  check(v.state === "soon" && v.status?.left === 10 && door.doorSentence(v) === "تبدأ بعد 10 د · 0110108", "R1 تبدأ بعد 10 د (الأحد 09:20)", door.doorSentence(v));
}
{
  const { v } = viewAt("2026-11-01T11:00:00+03:00");
  check(v.state === "free" && door.doorSentence(v) === "فاضية — حتى 12:00", "R1 فاضية — حتى 12:00 (الأحد 11:00)", door.doorSentence(v));
  const late = viewAt("2026-11-01T14:00:00+03:00").v;
  check(late.state === "free" && door.doorSentence(late) === "فاضية — بقية اليوم" && late.next?.wd === 2 && late.next.lecture.start === "08:00",
    "R1 بعد آخر محاضرة: فاضية بقية اليوم، والتاليةُ الثلاثاء 08:00", late.next);
  const early = viewAt("2026-11-01T07:10:00+03:00").v;
  check(early.state === "free" && early.status?.until === 480, "R1 قبل الدوام: فاضية حتى أول محاضرة");
}
{
  const { d, v } = viewAt("2026-11-06T10:00:00+03:00");
  check(v.state === "weekend" && door.doorSentence(v) === "عطلة نهاية الأسبوع", "R1 الجمعة: عطلة نهاية الأسبوع");
  check(d.week[0].date === "2026-11-08" && v.next?.wd === 0 && v.next.lecture.start === "08:00", "R1 العطلةُ تشير إلى الأحد القادم وأولِ محاضرته", { week: d.week[0].date, next: v.next });
  check(viewAt("2026-11-07T23:30:00+03:00").v.state === "weekend", "R1 السبت ليلاً عطلةٌ كذلك (بتوقيت الكويت لا العالمي)");
}
{
  const after = viewAt("2026-12-27T10:00:00+03:00");
  check(after.v.state === "outside" && after.d.week.length === 0 && door.doorSentence(after.v) === "خارج الفصل الدراسي", "R1 بعد نهاية الفصل: خارج الفصل، بلا محاضرات");
  check(after.d.upcoming === "2027-01-31", "R1 وخارجَه تُقال بدايةُ الفصل القادم", after.d.upcoming);
  const before = viewAt("2026-09-01T10:00:00+03:00");
  check(before.v.state === "outside" && before.d.upcoming === "2026-09-13", "R1 قبل بداية الفصل: خارج الفصل، ويبدأ 13 سبتمبر", before.d.upcoming);
}
{
  const { d, v } = viewAt("2026-11-05T15:40:00+03:00");
  const thursday = d.week[4].lectures;
  check(thursday.find(l => l.code === "0109224")?.x === 1 && !thursday.find(l => l.code === "0109221")?.x, "R1 الإلغاءُ لتاريخه ولموعده وحده (التغطيةُ بأستاذٍ بديل ليست إلغاءً)", thursday);
  check(v.state === "free" && v.cancelledNow?.code === "0109224" && door.doorSentence(v) === "فاضية — بقية اليوم", "R1 أُلغيت اليوم: فاضيةٌ في وقتها، والمحاضرةُ موسومة", door.doorSentence(v));
  const sameTimeNextWeek = viewAt("2026-11-12T15:40:00+03:00").v;
  check(sameTimeNextWeek.state === "busy", "R1 الخميس التالي: المحاضرةُ نفسها تعود مشغولة");
  check(viewAt("2026-11-05T14:30:00+03:00").v.state === "busy", "R1 محاضرةُ التغطية تبقى مشغولة");
}
{
  /* الدقيقةُ الحدّية: النهايةُ ليست من المحاضرة، والبدايةُ منها. */
  const slots = [{ s: 480, e: 555 }, { s: 570, e: 645 }];
  check(door.doorStatusAt(slots, 555, 15).kind === "soon" && door.doorStatusAt(slots, 570, 15).kind === "busy" && door.doorStatusAt(slots, 554, 15).kind === "busy",
    "R1 الحدود: 09:15 انتهت الأولى، 09:30 بدأت الثانية");
  check(door.doorStatusAt([{ s: 480, e: 555, x: 1 }], 500, 15).kind === "free", "R1 الملغاةُ لا تشغل القاعة");
  check(door.doorClockAt(at("2026-11-01T21:30:00Z")).date === "2026-11-02" && door.doorClockAt(at("2026-11-01T21:30:00Z")).weekday === 1, "R1 بعد منتصف الليل في الكويت يومٌ جديد ولو كان العالميُّ أمسِ");
  check(door.roomFloor("G09").label === "الدور الأرضي" && door.roomFloor("F20").rank === 1 && door.roomFloor("205").label === "الدور الثاني" && door.roomFloor("L01").label === "مرافق أخرى",
    "R1 الدورُ من رمز القاعة، وما لا يُقرأ «مرافق أخرى»");
}

/* ── R2: نصُّ المتصفّح هو نصُّ الخادم ─────────────────────────────────────────── */
{
  check(!door.ROOM_DOOR_ENGINE_SCRIPT.includes("__name") && !/\b(const|let)\b|=>|`/.test(door.ROOM_DOOR_ENGINE_SCRIPT), "R2 نصُّ المحرّك بلا أسماءٍ مضافة ولا const/let ولا سهم (شاشاتٌ قديمة)");
  const sandbox: Record<string, any> = {};
  vm.createContext(sandbox);
  vm.runInContext(door.ROOM_DOOR_ENGINE_SCRIPT, sandbox);
  const clocks = ["2026-11-01T10:20:00+03:00", "2026-11-01T09:20:00+03:00", "2026-11-01T11:00:00+03:00", "2026-11-06T10:00:00+03:00", "2026-12-27T10:00:00+03:00", "2026-11-05T15:40:00+03:00"];
  const same = clocks.every(iso => {
    const d = roomAt(iso);
    sandbox.D = JSON.parse(JSON.stringify(d));
    const server = door.doorViewAt(d, d.at, door.doorStatusAt, door.doorClockAt);
    const client = vm.runInContext(`(function(){var v=doorViewAt(D,${d.at},doorStatusAt,doorClockAt);return JSON.stringify([v,doorSentence(v)])})()`, sandbox);
    return client === JSON.stringify([server, door.doorSentence(server)]);
  });
  check(same, "R2 المتصفّحُ والخادمُ يقولان الحالَ نفسها عند الساعات الست");
}

/* ── R3: الرمز ────────────────────────────────────────────────────────────────── */
const shared = await Repository.getSharedServerSecret();
{
  const key = secret.deriveRoomDoorKey(shared);
  const token = secret.roomDoorToken(key, f01.id);
  check(/^[A-Za-z0-9_-]{16}$/.test(token) && token === secret.roomDoorToken(secret.deriveRoomDoorKey(shared), f01.id), "R3 الرمزُ ستّ عشرة خانة، وهو نفسُه في كل اشتقاق");
  check(token !== secret.roomDoorToken(key, "room_011B05_G02") && token !== secret.buildingDoorToken(key, f01.id), "R3 لكل قاعةٍ رمزُها، ولا يلتبس رمزُ قاعةٍ برمز مبنى");
  check(key !== calendar.deriveCalendarSecret("", shared) && key !== calendar.deriveCalendarSecret("rotated-calendar-secret", shared), "R3 مفتاحُ الأبواب غيرُ مفتاح التقويم (وسمٌ خاص)");
  const sources = ["src/server/roomDoorSecret.ts", "src/server/roomDoorRoutes.ts", "src/server/roomDoorData.ts", "src/utils/roomDoor.ts"].map(read).join("\n");
  check(!/process\.env\.CALENDAR_SECRET|process\.env\[["']CALENDAR_SECRET|from ["'][./]*(?:server\/)?calendarSecret["']/.test(sources), "R3 لا يُقرأ CALENDAR_SECRET ولا مفتاحُ التقويم في مسار الأبواب");
  check(secret.parseDoorToken(token)?.token === token && secret.parseDoorToken(`demo.${"a".repeat(10)}.${token}`)?.demoTag === "a".repeat(10)
    && secret.parseDoorToken("../etc") === null && secret.parseDoorToken(`${token}x`) === null, "R3 قراءةُ الرمز صارمة: حقيقيٌّ أو تجريبيٌّ بوسمه، ولا شيء غيرهما");
}

/* ── R4/R5: المسارات على مستودعٍ حقيقي ─────────────────────────────────────────── */
const NONCE_SEEN: string[] = [];
const publicPageNonce = (res: express.Response) => {
  const nonce = Buffer.from(String(Math.random())).toString("base64");
  NONCE_SEEN.push(nonce);
  res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'`);
  return nonce;
};
let clockNow = at("2026-11-01T10:20:00+03:00");
const mount = () => {
  const app = express();
  app.use((req: any, _res, next) => { if (req.headers["x-who"] === "admin") req.user = { SystemUserId: 1, IsAdminUser: true }; next(); });
  registerRoomDoorRoutes(app, {
    publicPageNonce,
    readLocationRegistry: async () => ({ buildings: await Repository.getLocationBuildings(), rooms: await Repository.getLocationRooms() }),
    normalizeLocation: rowIn => rowIn,
    requireRegistryAdmin: [(req: any, res, next) => (req.user ? next() : res.status(401).json({ error: "سجّل الدخول" }))],
    now: () => clockNow,
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (url: string, who = "") => {
    const res = await fetch(base + url, { headers: who ? { "x-who": who } : {} });
    const text = await res.text();
    let json: any = null; try { json = JSON.parse(text); } catch { /* صفحة */ }
    return { status: res.status, text, json, headers: res.headers };
  };
  return { server, call };
};

const key = secret.deriveRoomDoorKey(shared);
const f01Token = secret.roomDoorToken(key, f01.id);
const boardToken = secret.buildingDoorToken(key, building.id);
{
  process.env.CALENDAR_SECRET = "first-calendar-secret";
  const { server, call } = mount();
  try {
    const page = await call(`/d/${f01Token}`);
    const csp = page.headers.get("content-security-policy") || "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] || "";
    const scripts = page.text.match(/<script\b[^>]*>/g) || [];
    check(page.status === 200 && /<html lang="ar" dir="rtl">/.test(page.text), "R4 صفحةُ القاعة تُفتح بالرمز: عربيةٌ من اليمين");
    check(Boolean(nonce) && scripts.length > 0 && scripts.every(tag => tag.includes(`nonce="${nonce}"`)), "R4 كلُّ سكربتٍ يحمل رقمَ الصفحة الخاص (CSP nonce)", { nonce, scripts });
    check(/noindex/.test(page.headers.get("x-robots-tag") || "") && /noindex/.test(page.text) && page.headers.get("cache-control") === "no-store", "R4 لا فهرسة ولا تخزين (X-Robots-Tag وmeta)");
    check(page.text.includes("مشغولة · 0110108 — تنتهي 10:45") && page.text.includes(">F01<"), "R4 الحالُ مكتوبةٌ في الصفحة قبل السكربت", page.text.slice(page.text.indexOf('<main'), page.text.indexOf('</main>')));
    check(page.text.includes(`/b/${boardToken}`), "R4 الصفحةُ تدلّ على لوحة المبنى (القاعاتُ الفاضية بجوارها)");

    const live = await call(`/d/${f01Token}/now`);
    const body = JSON.stringify(live.json);
    check(live.status === 200 && live.json?.kind === "room" && live.json.week.length === 5 && live.json.at === clockNow, "R4 البياناتُ الحيّة: أسبوعُ القاعة ولحظةُ الخادم");
    check(!INSTRUCTOR_NAMES.some(name => body.includes(name) || page.text.includes(name)), "R4 لا اسمَ أستاذ في البيانات ولا في الصفحة (ولا اسمَ البديل)");
    check(!/Instructor|instructor|Civil|civil|MaxStudent|AdCourseId|scheduleId|"id":/.test(body) && !/300010100122|300123100006/.test(body + page.text), "R4 لا معرّفَ ولا رقمَ مدنيّاً ولا عددَ طلبة");
    const keys = new Set<string>();
    for (const day of live.json.week) for (const lecture of day.lectures) Object.keys(lecture).forEach(k => keys.add(k));
    check([...keys].every(k => ["s", "e", "start", "end", "code", "title", "sec", "x"].includes(k)), "R4 المحاضرةُ: الرمزُ والاسمُ والشعبةُ والوقتُ وحدها", [...keys]);

    const bad = await call(`/d/${"A".repeat(16)}`);
    check(bad.status === 404 && /<html lang="ar" dir="rtl">/.test(bad.text) && !bad.text.includes("F01"), "R4 رمزٌ لا يشير إلى قاعة: صفحةٌ هادئة بلا تفاصيل");
    check((await call(`/d/${secret.roomDoorToken(key, "room_011B05_F99")}`)).status === 404, "R4 القاعةُ المعطّلة في السجل لا تُفتح");
    check((await call(`/d/not-a-token/now`)).status === 404, "R4 رمزٌ مشوّه: لا شيء");

    const screen = await call(`/d/${f01Token}?screen=1`);
    check(screen.status === 200 && screen.text.includes('<html lang="ar" dir="rtl" class="screen">') && screen.text.includes('id="clk"')
      && /wakeLock/.test(screen.text) && /\/api\/version/.test(screen.text) && screen.text.includes('content="dark"'), "R4 وضعُ الشاشة: داكن، بساعة، يُبقي الشاشة مستيقظة، ويتبع الإصدار");

    const board = await call(`/b/${boardToken}/now`);
    const codes = (board.json?.rooms || []).map((item: any) => item.code);
    check(board.status === 200 && JSON.stringify(codes) === JSON.stringify(["G01", "G02", "F01", "F10", "S01", "L01"]), "R5 لوحةُ المبنى: الأرضي ثم الأول ثم الثاني ثم المرافق، وبالرقم داخل الدور (والمعطّلةُ خارجها)", codes);
    check(board.json.rooms.every((item: any) => /^\/d\/[A-Za-z0-9_-]{16}$/.test(item.href)) && board.json.rooms.find((item: any) => item.code === "F01").href === `/d/${f01Token}`, "R5 كلُّ بلاطةٍ تفتح صفحةَ قاعتها");
    const boardBody = JSON.stringify(board.json);
    check(!INSTRUCTOR_NAMES.some(name => boardBody.includes(name)) && !/title|sec"/.test(boardBody), "R5 اللوحةُ: الوقتُ والرمزُ وحدهما");
    const boardPage = await call(`/b/${boardToken}?screen=1`);
    check(boardPage.status === 200 && boardPage.text.includes('class="screen"') && /function fit\(\)/.test(boardPage.text), "R5 لوحةُ الممر: تملأ الشاشة بلا تمرير");

    check((await call(`/api/room-door/links?buildingId=${building.id}`)).status === 401, "R5 الروابطُ لا تُعطى بلا دخول");
    const links = await call(`/api/room-door/links?buildingId=${building.id}`, "admin");
    check(links.status === 200 && links.json.building.board === `/b/${boardToken}` && links.json.building.screen === `/b/${boardToken}?screen=1`
      && links.json.rooms.find((item: any) => item.code === "F01")?.url === `/d/${f01Token}` && !links.json.rooms.some((item: any) => item.code === "F99"),
    "R5 مديرُ السجل يأخذ رابطَ كل قاعة ولوحةَ المبنى وشاشتَه", links.json);
  } finally { server.close(); }

  /* تدويرُ سرّ التقويم وإقلاعٌ جديد: الملصقُ المطبوع يعمل كما هو. */
  process.env.CALENDAR_SECRET = "rotated-calendar-secret";
  const again = mount();
  try {
    const page = await again.call(`/d/${f01Token}`);
    check(page.status === 200 && page.text.includes(">F01<"), "R3 بعد تدوير CALENDAR_SECRET وإقلاعٍ جديد: الملصقُ القديم يفتح قاعته");
    clockNow = at("2026-11-05T15:40:00+03:00");
    const cancelled = await again.call(`/d/${f01Token}`);
    check(cancelled.text.includes("فاضية — بقية اليوم"), "R4 صفحةُ اليوم الملغاة محاضرتُه تقول «فاضية»", cancelled.text.slice(cancelled.text.indexOf("<main"), cancelled.text.indexOf("</main>")));
  } finally { again.server.close(); delete process.env.CALENDAR_SECRET; }

  process.env.ROOM_DOOR_PER_IP_PER_MINUTE = "3";
  const limited = mount();
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await limited.call(`/d/${f01Token}/now`)).status);
    check(statuses.slice(0, 3).every(code => code === 200) && statuses[4] === 429, "R5 الحدُّ لكل عنوان يعمل (٤٢٩ بعده)", statuses);
  } finally { limited.server.close(); delete process.env.ROOM_DOOR_PER_IP_PER_MINUTE; }
}

/* ── R4: نصُّ الصفحة نفسُه لا يحمل ما ليس له ─────────────────────────────────── */
{
  const d = roomAt("2026-11-01T10:20:00+03:00");
  const html = pageModule.roomDoorPage(d, { nonce: "N0NCE", screen: false, live: "/d/x/now", self: "/d/x" });
  check(!/`|\$\{/.test(html.slice(html.indexOf("<script"), html.lastIndexOf("</script>"))), "R4 السكربتُ نصٌّ عادي بلا قالبٍ متروك");
  check(!new RegExp(String.fromCharCode(0x2028) + "|" + String.fromCharCode(0x2029)).test(html), "R4 لا فاصلَ سطرٍ يونيكودي يكسر سكربت متصفّحٍ قديم");
  const server = read("server.ts");
  check((server.match(/registerRoomDoorRoutes\(app,/g) || []).length === 1 && server.includes('import { registerRoomDoorRoutes } from "./src/server/roomDoorRoutes"'), "R5 المسارات مسجّلةٌ في الخادم مرّةً واحدة");
  const sw = read("public/sw.js");
  check(/startsWith\("\/d\/"\)\|\|url\.pathname\.startsWith\("\/b\/"\)\)return;/.test(sw), "R5 عاملُ الخدمة لا يحفظ صفحات الأبواب مكان هيكل التطبيق");
}

/* ── R6: ملصقاتُ الأبواب ─────────────────────────────────────────────────────── */
{
  const { roomDoorStickerSheet } = await import("../src/utils/roomDoorStickers");
  const factory = (await import("../src/utils/qrcodeGenerator.js" as string)).default as (t: number, e: string) => any;
  const qr = (url: string) => { const code = factory(0, "M"); code.addData(url); code.make(); return code; };
  const url = `https://schedule-kw.com/d/${f01Token}`;
  const code = qr(url);
  check(code.getModuleCount() <= 29, "R6 الرابطُ القصير يعطي رمز QR صغيراً (مربّعاتٌ كبيرة تُقرأ من بعيد)", code.getModuleCount());
  const svg = code.createSvgTag({ scalable: true, margin: 2 });
  const rooms = ["F01", "F10", "G02", "S01", "L01"].map(name => ({ code: name, floor: "الدور الأول", url, qrSvg: svg }));
  const html = roomDoorStickerSheet({ building: { code: "011B05", number: "5", name: "مبنى القاعات", site: "التربية الأساسية - بنين" }, rooms, origin: "https://schedule-kw.com" });
  check(/@page\{size:A4 portrait;margin:0\}/.test(html) && (html.match(/<section class="sheet">/g) || []).length === 2 && (html.match(/class="cell"/g) || []).length === 5 && (html.match(/class="cell blank"/g) || []).length === 3,
    "R6 ورقةُ A4، أربعةُ ملصقاتٍ في الصفحة (خمسُ قاعات ← صفحتان)");
  check(rooms.every(item => html.includes(`<bdi>${item.code}</bdi>`)) && html.includes("مبنى 5 · <bdi>011B05</bdi>") && (html.match(/📱 امسح لتعرف القاعة الآن/g) || []).length === 5
    && (html.match(/<svg/g) || []).length === 5 && html.includes(`schedule-kw.com/d/${f01Token}`), "R6 كلُّ ملصق: رمزُ القاعة كبيراً، والمبنى، والـQR، و«امسح لتعرف القاعة الآن»");
  const hostile = roomDoorStickerSheet({ building: { code: "B<1>", number: "", name: "", site: "" }, rooms: [{ code: "<img src=x onerror=1>", url, qrSvg: "<svg onload=alert(1)></svg>" }], origin: "https://x" });
  check(!hostile.includes("<img") && !hostile.includes("onload=") && hostile.includes("&lt;img"), "R6 لا يدخل الورقةَ نصٌّ أو SVG غيرُ مأمون");
  const tools = read("src/components/RoomDoorTools.tsx");
  check(/import\("\.\.\/utils\/qrcodeGenerator"\)/.test(tools) && !/https?:\/\/[^"'`\s]*qr/i.test(tools), "R6 الرمزُ يُرسم بالمولّد المحلّي عند الطلب (كما في «مساري»)، لا بخدمةٍ خارجية");
  const admin = read("src/components/LocationRegistryAdmin.tsx");
  check(admin.includes("<RoomDoorBuildingActions links={doorLinks}/>") && admin.includes("<RoomDoorQr links={doorLinks} roomId={room.id}/>") && tools.includes("🖨️ ملصقات الأبواب") && tools.includes("🖥️ شاشة الممر"),
    "R6 شاشةُ المباني والقاعات: «🖨️ ملصقات الأبواب» و«🖥️ شاشة الممر» للمبنى، وزرُّ QR لكل قاعة");
}

console.log(`\nRoom door audit: ${passed} passed, ${failed} failed`);
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
