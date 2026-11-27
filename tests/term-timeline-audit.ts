/**
 * آلة الزمن (FR-SCH-102): شريطٌ عبر فصول القسم يحوّل بصمة القسم ونبض القاعات من فصلٍ إلى فصل.
 * الحساب خالص: ترتيب الشريط، وموضع السحب، والتحوّل بين بصمتين، و«أين تكرر الضغط»، وشريط النمو.
 * والخادم يقرأ فقط ببوابة البصمة نفسها؛ والفصل السابق للقراءة في النبض (لا ترتيب ولا حفظ).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { buildFingerprint, fingerprintGeometry, type FingerprintRowInput } from "../src/utils/deptFingerprint";
import {
  growthDelta, growthSeries, morphAt, morphRingAt, morphStats, orderTimeline, prepareMorph, pressuredHalls, repeatedPressure, scarLines,
  scrubPoint, seriesAt, shortTermName, sparkAt, sparkPoints, timelineEntry, timelineSpan,
  FINGERPRINT_SCAR_MAX, REPEATED_PRESSURE_MIN, TIME_MACHINE_MAX_TERMS, type TimelineTerm,
} from "../src/utils/termTimeline";
import { earlierTerms } from "../src/server/routes/deptFingerprintRoutes";

const source = (path: string) => readFileSync(path, "utf8");
const days = (...on: number[]) => [0, 1, 2, 3, 4].map(day => on.includes(day));
const row = (hall: string, section: string, seats: number, capacity: number, on: number[], start: string, end: string): FingerprintRowInput => ({
  hallKey: `id:${hall}`, hallName: `B1/${hall}`, capacity, courseId: 1, courseCode: "0109105", courseName: "مدخل", section, seats, days: days(...on), start, end,
});

/* فصلان: الأول قاعتان (101 فيها شعبةٌ فوق السعة)، والثاني ثلاث قاعات (101 ما زالت مضغوطة، و103 جديدة). */
const older = buildFingerprint({ sectionName: "القسم", termName: "الفصل الأول 2024/2025", rows: [
  row("101", "01", 50, 40, [0, 2], "08:00", "09:15"),
  row("102", "02", 20, 40, [1, 3], "10:00", "11:15"),
] });
const newer = buildFingerprint({ sectionName: "القسم", termName: "الفصل الثاني 2024/2025", rows: [
  row("101", "01", 50, 40, [0, 2], "08:00", "09:15"),
  row("102", "02", 30, 40, [1, 3], "10:00", "11:15"),
  row("103", "03", 25, 30, [4], "12:00", "13:50"),
  row("103", "04", 45, 30, [0], "14:00", "15:15"),
] });

/* ── ملخّص الفصل: أرقامٌ ومدى وقاعاتٌ مضغوطة وختم، بلا صفوف ولا أسماء أساتذة ── */
const e1 = timelineEntry(older, { termId: 3, termName: "الفصل الأول 2024/2025", current: false });
const e2 = timelineEntry(newer, { termId: 4, termName: "الفصل الثاني 2024/2025", current: true, seal: { termName: "x", acceptedAt: null, date: "" } });
assert.deepEqual(e1.stats, { sections: 2, weeklyHours: older.stats.weeklyHours, halls: 2 });
assert.deepEqual(e1.pressured.map(h => h.key), ["id:101"]);
assert.deepEqual(pressuredHalls(newer).map(h => [h.key, h.over]), [["id:101", 2], ["id:103", 1]], "الأكثر فوق السعة أولاً");
assert.equal(e1.seal, null);
assert.ok(e2.seal && e2.current);
assert.ok(!/slots|courseName|Instructor|CivilId/.test(JSON.stringify(e1)), "الملخّص بلا صفوف ولا أستاذ ولا رقم مدني");

/* ── ترتيب الشريط: الأقدم أولاً، والجاري آخره، بلا تكرار، وبحدٍّ أقصى ── */
const fake = (termId: number, current = false, pressured: string[] = [], sections = 10): TimelineTerm => ({
  termId, termName: `فصل ${termId}`, current, stats: { sections, weeklyHours: sections * 3, halls: 4 }, span: { from: 480, to: 1020 },
  pressured: pressured.map(key => ({ key, name: key.toUpperCase(), over: 1 })), seal: null,
});
assert.deepEqual(orderTimeline([fake(9, true), fake(1), fake(2), fake(1)]).map(t => t.termId), [1, 2, 9]);
assert.equal(orderTimeline(Array.from({ length: 20 }, (_, i) => fake(i + 1, i === 19))).length, TIME_MACHINE_MAX_TERMS);
assert.equal(orderTimeline(Array.from({ length: 20 }, (_, i) => fake(i + 1, i === 19))).at(-1)!.termId, 20, "الجاري يبقى ولو كثرت الفصول");
assert.deepEqual(timelineSpan([{ span: { from: 480, to: 900 } }, { span: { from: 420, to: 1020 } }]), { from: 420, to: 1020 });

/* ── الفصول الأسبق على الخادم: ما للقسم فيه قاعة، قبل الجاري، الأحدث أولاً ── */
const terms = [
  { AdTermId: 1, AdTermName: "الفصل الأول 2023/2024", AdTermStart: "2023-09-10" },
  { AdTermId: 2, AdTermName: "الفصل الثاني 2023/2024", AdTermStart: "2024-02-10" },
  { AdTermId: 3, AdTermName: "الفصل الأول 2024/2025", AdTermStart: "2024-09-10" },
  { AdTermId: 4, AdTermName: "الفصل الثاني 2024/2025", AdTermStart: "2025-02-10" },
] as any;
const rowsOf = [1, 3, 4].map(termId => ({ AdTermId: termId, roomId: "r1" })).concat([{ AdTermId: 2, roomId: "" } as any]) as any;
assert.deepEqual(earlierTerms(terms, rowsOf, terms[3]).map(t => t.termId), [3, 1], "الفصل بلا قاعة لا يدخل الشريط");

/* ── الاسم القصير تحت العلامة ── */
assert.equal(shortTermName("الفصل الأول 2023/2024"), "الأول 23/24");
assert.equal(shortTermName("الفصل الصيفي 2025/2026"), "الصيفي 25/26");
assert.equal(shortTermName("Spring 2025-2026"), "Spring 25/26");
assert.equal(shortTermName("خريف"), "خريف");

/* ── موضع السحب: فصلان ونسبةٌ بينهما، وما قارب الفصل فصل ── */
assert.deepEqual(scrubPoint(0, 4), { from: 0, to: 1, t: 0, nearest: 0 });
assert.deepEqual(scrubPoint(3, 4), { from: 2, to: 3, t: 1, nearest: 3 });
assert.deepEqual(scrubPoint(1.25, 4), { from: 1, to: 2, t: 0.25, nearest: 1 });
assert.equal(scrubPoint(1.75, 4).nearest, 2);
assert.equal(scrubPoint(2.999, 4).t, 1);
assert.deepEqual(scrubPoint(9, 1), { from: 0, to: 0, t: 0, nearest: 0 });
assert.equal(scrubPoint(-3, 4).from, 0);

/* ── التحوّل بين بصمتين: طرفاه هما الصورتان، والوسط بينهما، والزائل يذوي والجديد ينمو ── */
const span = timelineSpan([e1, e2]);
const pair = prepareMorph(older, newer, span);
const ga = fingerprintGeometry(older, { span }), gb = fingerprintGeometry(newer, { span });
const atStart = morphAt(pair, 0), atEnd = morphAt(pair, 1), mid = morphAt(pair, 0.5);
assert.deepEqual(atStart.arcs.map(a => a.d).sort(), ga.arcs.map(a => a.d).sort(), "عند 0: أقواس الفصل الأول نفسها");
assert.deepEqual(atEnd.arcs.map(a => a.d).sort(), gb.arcs.map(a => a.d).sort(), "عند 1: أقواس الفصل الثاني نفسها");
assert.deepEqual(atEnd.petals.map(p => [Math.round(p.x2), Math.round(p.y2)]), gb.petals.map(p => [Math.round(p.x2), Math.round(p.y2)]));
const ring101 = pair.rings.find(r => r.key === "id:101")!, ring103 = pair.rings.find(r => r.key === "id:103")!;
assert.ok(ring101.a && ring101.b && ring103.b && !ring103.a);
const r101 = morphRingAt(ring101, 0.5);
assert.ok(Math.abs(r101.r - (ring101.a!.r + ring101.b!.r) / 2) < 1e-9 && r101.alpha === 1, "الحلقة الباقية تنتقل إلى منتصف الطريق");
assert.equal(morphRingAt(ring103, 0.25).alpha, 0.25, "الحلقة الجديدة تولد");
assert.equal(mid.arcs.filter(a => (a.alpha ?? 1) < 1).length, 2, "قوسا القاعة الجديدة وحدهما بين الولادة والذبول");
assert.ok(mid.arcs.every(a => a.hall === -1 && a.slot === -1), "بين فصلين لا يُشار إلى قوس");
assert.equal(morphAt(pair, 0.001).arcs.filter(a => (a.alpha ?? 1) < 1).length, 0, "الأقواس الجديدة لا تُرسم قبل أن يكون لها سُمك");
assert.deepEqual(morphStats(older, newer, 0.5), { ...newer.stats, halls: Math.round(2.5), sections: 3, weeklyHours: Math.round((older.stats.weeklyHours + newer.stats.weeklyHours) / 2) });
assert.equal(morphStats(older, newer, 0.2).peak, older.stats.peak, "الذروة للفصل الأقرب");
assert.ok(!/[٠-٩۰-۹]/.test(JSON.stringify([mid, morphStats(older, newer, 0.5)])), "أرقام لاتينية فقط");

/* ── أين تكرر الضغط: في فصلين فأكثر من الظاهرة، الأكثر تكراراً أولاً ── */
const strip = [fake(1, false, ["a", "b"]), fake(2, false, ["a"]), fake(3, false, ["a", "c"]), fake(4, true, ["b", "c"])];
const repeated = repeatedPressure(strip);
assert.equal(REPEATED_PRESSURE_MIN, 2);
assert.deepEqual(repeated.map(r => [r.key, r.count, r.termIds]), [["a", 3, [1, 2, 3]], ["b", 2, [1, 4]], ["c", 2, [3, 4]]]);
assert.deepEqual(repeatedPressure(strip, 3).map(r => r.key), ["a"]);
assert.deepEqual(repeatedPressure([fake(1, false, ["a"]), fake(2, true, ["b"])]), [], "قاعةٌ ضاقت مرةً واحدة ليست تكراراً");
assert.deepEqual(repeatedPressure([e1, e2]).map(r => r.key), ["id:101"], "101 مضغوطة في الفصلين");
assert.equal(repeatedPressure([fake(1, false, ["a"]), fake(1, false, ["a"])]).length, 0, "الفصل نفسه لا يُعدّ مرتين");

/* ── الندوب: في فراغ الخميس–الأحد وحده، خطٌّ لكل فصلٍ حتى أربعة ── */
assert.equal(FINGERPRINT_SCAR_MAX, 4);
assert.equal(scarLines(200, 30, 3).length, 3);
assert.equal(scarLines(200, 30, 9).length, 4);
assert.equal(scarLines(200, 30, 0).length, 0);
for (const line of scarLines(140, 12, 4)) {
  const angle = (x: number, y: number) => (Math.atan2(y - 722, x - 500) * 180) / Math.PI;
  const a = angle(line.x1, line.y1);
  assert.ok(a > -126 - 2.75 && a < -126 + 2.75, `الندبة في فراغ الخميس–الأحد (${a.toFixed(2)})`);
}

/* ── شريط النمو ── */
const series = growthSeries(strip.map((t, i) => ({ ...t, stats: { sections: 10 + i * 2, weeklyHours: 30 + i, halls: 4 + (i > 1 ? 1 : 0) } })));
assert.deepEqual(series.sections, [10, 12, 14, 16]);
assert.equal(seriesAt(series.sections, 1.5), 13);
assert.equal(seriesAt(series.sections, 99), 16);
assert.equal(growthDelta(series.sections), "+6");
assert.equal(growthDelta([5, 3]), "−2");
assert.equal(growthDelta([5]), "");
const points = sparkPoints([0, 5, 10], 100, 30);
assert.ok(points[0].x > points[2].x, "الأقدم يميناً والجاري يساراً");
assert.ok(points[2].y < points[0].y, "الأكبر أعلى");
assert.deepEqual(sparkAt([0, 5, 10], 100, 30, 2), points[2]);

/* ── الخادم: مسارٌ يقرأ فقط ببوابة البصمة ونطاقها ومخبئها، ولا صفوف في جوابه ── */
const route = source("src/server/routes/deptFingerprintRoutes.ts");
const timeline = route.slice(route.indexOf('app.get("/api/dept-fingerprint/timeline"'));
assert.ok(timeline.length > 500, "مسار الشريط موجود");
assert.ok(/mayReadFingerprint\(req\)/.test(timeline) && /isScopeAllowed\(req, collegeId, sectionId\)/.test(timeline), "البوابة والنطاق نفسهما");
assert.ok(/cached\(`timeline:/.test(timeline) && /cached\(`rows:\$\{collegeId\}:\$\{sectionId\}`/.test(timeline), "المخبأ نفسه بمفتاح جلسة التجربة");
assert.ok(/timelineEntry\(/.test(timeline) && !/res\.json\(\{[^}]*rows/.test(timeline), "يُرسل الملخّص لا الصفوف");
assert.ok(!/Repository\.(save|update|delete|upsert|set|add|create|write)[A-Z]/.test(route), "لا كتابة");

/* ── الشاشة: البصمة تتحوّل وتقرأ الفصل كسولاً، والنبض للقراءة في الفصل السابق ── */
const shared = source("src/components/TermTimeline.tsx");
assert.ok(/فصلٌ سابق — للقراءة/.test(shared) && /type="range"/.test(shared) && /aria-valuetext/.test(shared));
assert.ok(/prefers-reduced-motion: reduce/.test(shared) && /opts\.reduced \|\| ms <= 0/.test(shared), "تقليل الحركة: انتقالٌ فوري");
assert.ok(!/method:\s*"(POST|PUT|PATCH|DELETE)"/.test(shared), "قراءة فقط");
const fp = source("src/components/DeptFingerprint.tsx");
assert.ok(/readFingerprintCached\(\{ \.\.\.scope, termId \}\)/.test(fp) && /prepareMorph\(/.test(fp) && /morphAt\(pair, point\.t\)/.test(fp), "البصمة تُقرأ كسولاً وتتحوّل");
assert.ok(/onOpenPulse && !pastView/.test(fp), "الفصل السابق بلا «اذهب إليها في النبض»");
const pulse = source("src/components/hallPulse/HallPulse.tsx");
assert.ok(/const canSave = canSaveRole && !past;/.test(pulse), "الفصل السابق: لا حفظ ولا ترتيب ولا «ماذا لو» ولا ضمّ مساء");
assert.ok(/context === "workshop" && sectionId > 0 && termId > 0 && !props\.phone/.test(pulse), "الشريط في ورشة القسم وليس على الهاتف");
assert.ok(/regContext && regList && !past/.test(pulse) && /setWhatIf\(\[\]\)/.test(pulse), "لا طبقة تسجيل ولا نقلات معلّقة في فصلٍ سابق");
assert.ok(/tmBlocked = whatIf\.length > 0/.test(pulse), "لا تُفتح فوق نقلاتٍ لم تُحفظ");
assert.ok(/\}, \[flat, hasHalls, layout, reduced, narrow, canSaveRole\]\);/.test(pulse), "تبدّل الفصل لا يعيد بناء المشهد");
const scene = source("src/components/hallPulse/pulseScene.ts");
assert.ok(/absent\?: boolean/.test(scene) && /presK/.test(scene) && /hp-tag-scar/.test(scene), "القاعة تذوي وتعود، والندوب على لافتتها");

console.log("term-timeline-audit: ok");
