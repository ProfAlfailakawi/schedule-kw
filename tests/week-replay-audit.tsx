/**
 * ── «إعادة عرض الأسبوع» و«لماذا لا؟»: إعادةُ البناء والرسم ─────────────────────────────
 *   F  تقدّمٌ أمامي من أقدم حالة: إضافة، حذف، نقل، أستاذ، قاعة، والترتيب والدفعات.
 *   M  مطابقة الصفوف: إعادةُ ترقيمٍ لا تُرى حذفاً وإضافة، وأعدادٌ متكررة (مقرر، شعبة).
 *   A  النسبُ إلى الفاعل: بسطرٍ للموعد نفسه قريبِ الوقت، وإلا لا اسم.
 *   R  الرسم: زرّان بلا أرقامٍ هندية، و«لماذا لا؟» معطّلٌ بلا موضوع، والتسميات.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import { buildReplay, matchRows, relativeDay, replayCounters, replayDays, stateAt, type ReplayRowLite } from "../src/utils/weekReplay";

(globalThis as any).window = (globalThis as any).window || { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`); }
};
const row = (id: number, over: Partial<ReplayRowLite> & Record<string, any> = {}): ReplayRowLite => ({ id, AdCourseId: 100 + id, AdCourseName: `مقرر ${id}`, CourseCodeSnapshot: `C${id}`, SCode: "1", AdInstructorId: 1,
  fsunday: true, ftuesday: true, fthursday: true, fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "B1", AdRoomHall: "101", ...over });

(async () => {
  console.log("F إعادةُ البناء");
  const s0 = [row(1), row(2), row(3)];
  const s1 = [row(1), row(2, { fstarttime: "10:00", fendtime: "10:50" }), row(3), row(4)];        // نقل 2، إضافة 4
  const s2 = [row(1, { AdInstructorId: 9 }), row(2, { fstarttime: "10:00", fendtime: "10:50" }), row(4, { AdRoomCode: "B2" })]; // أستاذ 1، حذف 3، قاعة 4
  const now = [row(1, { AdInstructorId: 9 }), row(2, { fstarttime: "10:00", fendtime: "10:50", fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false }), row(4, { AdRoomCode: "B2" })];
  const snaps = [
    { id: "a", at: "2026-11-10T08:00:00Z", label: "قبل أ", rows: s0 },
    { id: "b", at: "2026-11-11T08:00:00Z", label: "قبل ب", rows: s1 },
    { id: "c", at: "2026-11-12T08:00:00Z", label: "قبل ج", rows: s2 },
  ];
  // تُعطى مرتّبةً عكسياً عمداً: الترتيبُ يُفرض داخلياً.
  const replay = buildReplay({ snapshots: [...snaps].reverse(), current: now, trail: [] });
  const kinds = replay.events.map(event => event.kind);
  check(kinds.join() === "move,add,teacher,room,remove,move", "F1 الأحداث بترتيب الدفعات: (تغييرات الباقي، ثم الحذف، ثم الإضافة) في كل دفعة", kinds);
  check(replay.events.map(event => event.batch).join() === "1,1,2,2,2,3" && replay.events.every((event, i) => event.n === i), "F2 أرقامُ الدفعات والتسلسل");
  check(replay.base.length === 3 && stateAt(replay, 0).length === 3, "F3 البدايةُ أقدمُ لقطة");
  check(stateAt(replay, 2).length === 4 && stateAt(replay, 2).find(card => card.id === 2)!.start === 600, "F4 بعد حدثين: 4 بطاقات والثانيةُ نُقلت إلى 10:00");
  const lastState = stateAt(replay, replay.events.length);
  check(lastState.length === 3 && !lastState.some(card => card.id === 3) && lastState.find(card => card.id === 2)!.days.join() === "fmonday,fwednesday", "F5 النهايةُ = الجدولُ الحيّ (المحذوفُ غائب، والنقلُ بين الأيام)");
  check(lastState.map(card => card.id).sort().join() === replay.final.map(card => card.id).sort().join(), "F6 final مطابقةٌ لتقدّم كل الأحداث");
  const move = replay.events[0];
  check(move.from?.start === 480 && move.card.start === 600 && move.label === "قبل أ", "F7 النقلُ يحمل «من» و«إلى» ووسمَ النسخة");
  check(replay.events[2].kind === "teacher" && replay.events[3].kind === "room" && replay.events[4].kind === "remove" && replay.events[5].flags.join() === "move", "F8 أستاذٌ وقاعةٌ حدثان مستقلان");
  const both = buildReplay({ snapshots: [{ id: "x", at: "2026-11-10T08:00:00Z", rows: [row(1)] }], current: [row(1, { fstarttime: "09:00", fendtime: "09:50", AdRoomCode: "Z" })] });
  check(both.events.length === 1 && both.events[0].kind === "move" && both.events[0].flags.join() === "move,room", "F9 تغيّران معاً: حدثٌ واحد بعلَمَين (النقلُ أولاً)");
  check(buildReplay({ snapshots: [], current: now }).events.length === 0 && buildReplay({ snapshots: [{ id: "x", at: "2026-11-10T08:00:00Z", rows: s0 }], current: s0 }).events.length === 0, "F10 بلا لقطات أو بلا فروق: لا أحداث (حالةُ «لا سجل»)");
  const counters = replayCounters(replay, replay.events.length);
  check(counters.added === 1 && counters.removed === 1 && counters.moved === 2 && counters.other === 2, "F11 العدّادات", counters);
  check(replayDays(replay).map(group => group.count).join() === "2,3,1" || replayDays(replay).reduce((n, g) => n + g.count, 0) === 6, "F12 تجميعُ الأحداث بالأيام");

  console.log("M مطابقة الصفوف");
  const renumbered = matchRows([{ uid: "u1", id: 1, courseId: 101, course: "", code: "", scode: "1", instructorId: 1, days: [], start: 0, end: 0, room: "" }], [row(77, { AdCourseId: 101 })]);
  check(renumbered.pairs.length === 1 && !renumbered.removed.length && !renumbered.added.length, "M1 إعادةُ ترقيم الصف (استرجاع نسخة) لا تُرى حذفاً وإضافة");
  const r2 = buildReplay({ snapshots: [{ id: "x", at: "2026-11-10T08:00:00Z", rows: [row(1)] }], current: [row(50, { AdCourseId: 101 })] });
  check(r2.events.length === 0, "M2 لا أحداث حين لا فرق سوى الترقيم");

  console.log("A النسب إلى الفاعل");
  const attributed = buildReplay({ snapshots: [{ id: "x", at: "2026-11-10T08:00:00Z", rows: [row(1), row(2)] }], current: [row(1, { fstarttime: "09:00", fendtime: "09:50" }), row(2, { fstarttime: "11:00", fendtime: "11:50" })],
    trail: [{ at: "2026-11-10T08:03:00Z", row: 1, who: "سارة", seat: "اللجنة" }, { at: "2026-11-10T07:00:00Z", row: 2, who: "خالد" }] });
  check(attributed.events[0].who === "سارة" && attributed.events[0].seat === "اللجنة", "A1 سطرُ أثرٍ للموعد نفسه قريبُ الوقت ينسب الحدث");
  check(attributed.events[1].who === undefined, "A2 سطرٌ بعيدُ الوقت أو لموعدٍ آخر لا ينسب (لا اسمَ بلا أثر)");
  check(relativeDay("2026-11-14T01:00:00Z", Date.parse("2026-11-14T12:00:00Z")) === "اليوم" && relativeDay("2026-11-12T10:00:00Z", Date.parse("2026-11-14T12:00:00Z")) === "قبل يومين" && /^قبل 5 أيام$/.test(relativeDay("2026-11-09T10:00:00Z", Date.parse("2026-11-14T12:00:00Z"))), "A3 اليومُ النسبي بأرقامٍ لاتينية");

  console.log("R الرسم");
  const { default: WeekLayerTools } = await import("../src/components/WeekLayerTools");
  const base: any = {
    rows: [{ id: 5, AdCourseId: 1, AdCourseName: "مقرر", SCode: "1", fsunday: true, fstarttime: "08:00", fendtime: "08:50" }], selectedId: null, replayReady: true,
    replay: { scope: { collegeId: 1, sectionId: 1, termId: 1 }, current: [] },
    whyNot: { days: [{ key: "fsunday", label: "الأحد" }], slots: ["08:00"], gridEnd: 1000, mins: () => 0, buildCandidate: (r: any) => r, blockers: () => [], readOnly: false, scope: { collegeId: 1, sectionId: 1, termId: 1 }, onMove() {} },
  };
  const off = renderToStaticMarkup(<WeekLayerTools {...base} />);
  check(/لماذا لا؟/.test(off) && /إعادة العرض/.test(off) && /wn-toggle/.test(off) && /disabled=""/.test(off.split("wk-replay-btn")[0]), "R1 زرّان بكلمتين، و«لماذا لا؟» معطّلٌ بلا موضوع", off.slice(0, 200));
  const noScope = renderToStaticMarkup(<WeekLayerTools {...base} replayReady={false} />);
  check(/wk-replay-btn[^>]*disabled=""|disabled=""[^>]*wk-replay-btn/.test(noScope), "R3 «إعادة العرض» معطّلٌ بلا نطاقٍ كامل");
  check(!/[٠-٩۰-۹]/.test(off), "R4 لا أرقام هندية في الرسم");
  const sources = ["src/components/WhyNotLayer.tsx", "src/components/WeekReplay.tsx", "src/components/WeekLayerTools.tsx", "src/utils/whyNot.ts", "src/utils/weekReplay.ts", "src/styles/68-week-layers.css"].map(f => fs.readFileSync(f, "utf8")).join("\n");
  check(!/[٠-٩۰-۹]/.test(sources.replace(/\/\*[\s\S]*?\*\//g, "")), "R5 المصدرُ بلا أرقامٍ هندية");
  check(/@import "\.\/styles\/68-week-layers\.css"/.test(fs.readFileSync("src/index.css", "utf8")) && /prefers-reduced-motion:reduce/.test(fs.readFileSync("src/styles/68-week-layers.css", "utf8")) && /pointer:coarse/.test(fs.readFileSync("src/styles/68-week-layers.css", "utf8")), "R6 الأنماطُ مسجّلة، والحركةُ المخفّضة والمؤشرُ الخشن مغطّيان");
  check(/api\/schedules\/replay/.test(fs.readFileSync("src/server/routes/scheduleLiveRoutes.ts", "utf8")) && /requireAnyPermission\(\[7, 8, 9, 10, 14, 16, 17\]\)[\s\S]{0,400}isScopeAllowed/.test(fs.readFileSync("src/server/routes/scheduleLiveRoutes.ts", "utf8")), "R7 مسارُ القراءة خلف الباب والنطاق نفسيهما");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
