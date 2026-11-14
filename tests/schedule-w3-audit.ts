/**
 * ── شاشة الجدول و«موعد»: إصلاحات المراجعة الشاملة (W3) ─────────────────────────
 * سلوكٌ حقيقي على الوحدات الخالصة (physics، فهرس الانشغال)، وربطٌ في المصدر لما لا يُختبر بلا متصفح.
 */
import fs from "node:fs";
import { buildMoveCandidate, isSamePlacement } from "../src/components/SchedulePhysics/physics";
import { buildBusyIndex, indexedBlockers } from "../src/components/SchedulePhysics/blockerIndex";

let passed = 0, failed = 0;
function check(condition: unknown, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(file, "utf8");
const mins = (clock: string) => { const [h, m] = String(clock || "0:0").split(":").map(Number); return h * 60 + m; };
const row = (patch: any) => ({ id: 1, AdCourseId: 1, AdTermId: 1, SCode: "501", AdInstructorId: 7, AdRoomCode: "A", AdRoomHall: "1", fstarttime: "10:00", fendtime: "10:50", fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false, ...patch }) as any;

/* S2: الإفلات على يومٍ خارج أيام صفٍّ متعدد الأيام تحويلُ نمط، لا «نفس الموضع». */
{
  const multi = row({ fsunday: true, ftuesday: true, fthursday: true });
  check(isSamePlacement(multi, "fsunday" as any, { day: "fmonday", start: "10:00", label: "" } as any) === false, "S2 أحد/ثلاثاء/خميس 10:00 على الاثنين 10:00 ليس نفس الموضع");
  check(isSamePlacement(multi, "fsunday" as any, { day: "ftuesday", start: "10:00", label: "" } as any) === true, "S2 الإفلات على يومٍ من أيامه بالوقت نفسه نفس الموضع");
  check(isSamePlacement(multi, "fsunday" as any, { day: "ftuesday", start: "11:00", label: "" } as any) === false, "S2 وقتٌ مختلف ليس نفس الموضع");
}
/* S3: صفٌّ بلا يوم يُوضع بالسحب؛ ونهايةٌ قبل البداية تُعدّ غير موضوعة. */
{
  const none = row({});
  const moved = buildMoveCandidate(none, { day: "fmonday", start: "09:00" } as any) as any;
  check(moved.fmonday === true && !moved.fsunday && moved.fstarttime === "09:00", "S3 الإفلات يكتب يوم الهدف على صفٍّ بلا يوم");
  check(isSamePlacement(none, "fsunday" as any, { day: "fsunday", start: "10:00", label: "" } as any) === false, "S3 صفٌّ بلا يوم لا يُعدّ نفس الموضع");
  const inverted = row({ fsunday: true, fstarttime: "10:00", fendtime: "09:00" });
  check(isSamePlacement(inverted, "fsunday" as any, { day: "fsunday", start: "10:00", label: "" } as any) === false, "S3 نهايةٌ قبل البداية تُوضع بالإفلات");
}
/* S12: فهرس الانشغال يطابق المسح الكامل القديم على بياناتٍ عشوائية، وأسرع منه. */
{
  const DAYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const roomKeyOf = (r: any) => r.AdRoomCode || r.AdRoomHall ? `${r.AdRoomCode}|${r.AdRoomHall}` : "";
  const sameRoom = (a: any, b: any) => Boolean(roomKeyOf(a)) && roomKeyOf(a) === roomKeyOf(b);
  const brute = (rows: any[], source: any, probe: any) => {
    const samePlacement = (a: any, b: any) => a.fstarttime === b.fstarttime && a.fendtime === b.fendtime && DAYS.every(d => Boolean(a[d]) === Boolean(b[d]));
    const combined = (a: any, b: any) => a.AdCourseId === b.AdCourseId && String(a.SCode) !== String(b.SCode) && Boolean(a.AdInstructorId) && a.AdInstructorId === b.AdInstructorId && sameRoom(a, b) && samePlacement(a, b);
    const out: any[] = [];
    for (const other of rows) {
      if (other.id === source.id || other.AdTermId !== probe.AdTermId || combined(probe, other)) continue;
      const shares = DAYS.some(d => probe[d] && other[d]);
      const overlaps = mins(probe.fstarttime) < mins(other.fendtime) && mins(other.fstarttime) < mins(probe.fendtime);
      if (!shares || !overlaps) continue;
      const detail = `${other.id}`;
      if (probe.AdInstructorId && probe.AdInstructorId === other.AdInstructorId) out.push(["instructor", detail]);
      if ((probe.AdRoomCode || probe.AdRoomHall) && sameRoom(probe, other)) out.push(["room", detail]);
    }
    return out;
  };
  const make = (id: number) => {
    const start = 8 * 60 + Math.floor(rnd() * 24) * 30;
    const r: any = row({ id, AdCourseId: 1 + Math.floor(rnd() * 40), SCode: String(501 + Math.floor(rnd() * 3)), AdInstructorId: Math.floor(rnd() * 80), AdRoomCode: rnd() < .1 ? "" : String.fromCharCode(65 + Math.floor(rnd() * 6)), AdRoomHall: String(1 + Math.floor(rnd() * 10)), AdTermId: rnd() < .05 ? 2 : 1 });
    if (!r.AdRoomCode) r.AdRoomHall = "";
    r.fstarttime = `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`;
    const end = start + (rnd() < .5 ? 50 : 80);
    r.fendtime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    DAYS.forEach(d => { r[d] = rnd() < .4; });
    return r;
  };
  const rows = Array.from({ length: 1000 }, (_, i) => make(i + 1));
  const probes = Array.from({ length: 7200 }, (_, i) => make(100000 + i));
  const index = buildBusyIndex(rows, roomKeyOf, mins);
  let mismatches = 0;
  for (const probe of probes.slice(0, 1500)) {
    const source = rows[Math.floor(rnd() * rows.length)];
    const a = brute(rows, source, probe), b = indexedBlockers(index, source, probe, roomKeyOf(probe), mins, other => String(other.id)).map(item => [item.type, item.detail]);
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatches++;
  }
  check(mismatches === 0, `S12 فهرس الانشغال يطابق المسح الكامل (1500 خانة × 1000 صف، فروق: ${mismatches})`);
  const source = rows[0];
  const t0 = performance.now(); for (const probe of probes) brute(rows, source, probe); const bruteMs = performance.now() - t0;
  const t1 = performance.now(); const idx2 = buildBusyIndex(rows, roomKeyOf, mins); for (const probe of probes) indexedBlockers(idx2, source, probe, roomKeyOf(probe), mins, other => String(other.id)); const indexedMs = performance.now() - t1;
  console.log(`   S12 7200 خانة × 1000 صف: المسح الكامل ${bruteMs.toFixed(0)}ms · الفهرس ${indexedMs.toFixed(0)}ms`);
  check(indexedMs < bruteMs, "S12 الفهرس أسرع من المسح الكامل");
}
/* ربطٌ في المصدر */
{
  const sch = read("src/components/Schedules.tsx");
  check(/shortcutsBlocked\(\) \|\| document\.querySelector\('\[role="dialog"\]/.test(sch), "S1 ⌘Z لا تعمل داخل حقلٍ أو مع نافذةٍ مفتوحة");
  check(!/const moveSchedule = async/.test(sch), "S14 moveSchedule الميتة حُذفت");
  check(/dragBlocked/.test(sch) && /physics\.supported, dragBlocked/.test(sch), "S4 القفل/الصلاحية/التجميد في توقيع البطاقة وبوابة السحب");
  check(/workspaceToken/.test(sch) && /rowsToken/.test(sch) && !/loadToken/.test(sch), "S8 مفتاحان وإلغاءان منفصلان للصفوف والمساحة");
  check(/practiceRealChanged/.test(sch) && /practiceScopeRef/.test(sch), "S5 شارة تغيّر الجدول الحقيقي والتحقق من النطاق عند الإنهاء");
  check(/step\.body\.rev\)\) \+ 1/.test(sch) || /Number\(step\.body\.rev\) \+ 1/.test(sch), "S6 التراجع يرفض صفاً تقدّم إصداره بعد تغييرك");
  check(/entry\.scope/.test(sch), "S6 التراجع عبر نطاقٍ آخر مرفوض");
  check(/arabicMatchKey\(deferredSearch\)/.test(sch), "S9 البحث السريع يطبّع العربية");
  check(/trapFocusRef/.test(sch) && fs.existsSync("src/hooks/useFocusTrap.ts"), "S10 حبس التركيز في النوافذ");
  check(/liveCmd\.current\.openCreate/.test(sch) && /\[approvalLock, repairing,/.test(sch), "S13 أوامر اللوحة لا تتجاوز القفل");
  check(/savingGuard/.test(sch) && /appointmentSaveGaps\(form/.test(sch), "E4 حارس إعادة الدخول وحكمٌ واحد للحقول");
  check(/openEditAlternative/.test(sch) && /editBaseline/.test(sch), "E1 البديل يفتح تعديلاً قابلاً للحفظ (أصله المحفوظ)");
  check(/carriedNotice/.test(sch), "E7 رسالة «حُفظ في موقع آخر» تنجو من clearEditorTransients");
  check(/handleSlotTaken/.test(sch) && /slot-taken/.test(sch), "E11 «سبقك زميل» ببديلين");
  check(/if \(editor === "create"\) clearDraft\(\);\s*\n\s*markChanged/.test(sch), "E5 المسودة لا تُمحى بحفظ تعديل");
  check(/timingOverride: draftOffer|draftOffer\.timingOverride/.test(sch), "E6 المسودة تستعيد التجاوز المتعمَّد");
  check(!/ScheduleTouched/.test(sch), "E10 scheduleTouched الميت حُذف");
  const cards = read("src/components/RoomSuggestionCards.tsx");
  check(/الأقرب سعة/.test(cards) && /okIndex/.test(cards), "U3 «الأنسب» لا يذهب لقاعةٍ سعتها أقل، وإلا «الأقرب سعة»");
  const css = read("src/styles/05-schedule.css") + read("src/styles/52-touch-targets.css");
  check(/scroll-padding-bottom/.test(css) && /week-moved-pill\.week-moved-pill/.test(css) && /container-type:inline-size/.test(css), "U1/S11/U2 CSS: هامش التمرير، الشارة لا تُنفخ، أعمدة ضيقة");
}
console.log(`\nW3 schedule audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
