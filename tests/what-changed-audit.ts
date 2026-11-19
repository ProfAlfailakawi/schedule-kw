/**
 * «ماذا غيّرنا؟» — الحصيلةُ الصافية بين بداية الفترة والآن، وكل الخطوات بترتيبها
 * ومن عدّلها (src/utils/whatChanged.ts). دالّةٌ نقيّة: لقطاتٌ مصنوعة وجدولٌ حيّ.
 */
import { summarizeWhatChanged, whatChangedText, entryLine, type WcVersion } from "../src/utils/whatChanged";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, detail?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 900)); }
};

const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 1, AdSectionId: 11, AdTermId: 5, AdCourseId: 301, SCode: "1", AdInstructorId: 7,
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
  fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "012B07", AdRoomHall: "A1", ...extra,
}) as any;
const other = row(2, { AdCourseId: 302, SCode: "1", fstarttime: "11:00", fendtime: "12:15" });
const names = {
  instructorById: new Map([[7, "أحمد علي"], [8, "سارة محمد"]]),
  courseById: new Map([[301, "أسس التعلم"], [302, "تصميم التعليم"], [303, "القياس"]]),
  courseCodeById: new Map([[301, "105"], [302, "106"], [303, "107"]]),
};
let clock = 0;
const v = (rows: any[], userName = "رئيس اللجنة", label = "قبل تعديل موعد دراسي"): WcVersion =>
  ({ id: `v${++clock}`, createdAt: `2026-11-19T08:${String(clock).padStart(2, "0")}:00.000Z`, userName, label, rows });

/* ١) نقلٌ ثم إرجاع: لا شيء. */
{
  const start = [row(1), other];
  const moved = [row(1, { fstarttime: "10:00", fendtime: "11:15" }), other];
  const result = summarizeWhatChanged({ versions: [v(start), v(moved)], live: start, names });
  check(result.entries.length === 0 && result.counts.total === 0, "نُقل ثم أُرجع: الصافي لا شيء", result.entries);
  check(result.steps.length === 2, "والخطوتان باقيتان في «كل الخطوات»", result.steps.length);
}

/* ٢) نقلٌ مرّتين: من الأوّل إلى الآخر. */
{
  const start = [row(1), other];
  const mid = [row(1, { fstarttime: "10:00", fendtime: "11:15" }), other];
  const end = [row(1, { fsunday: false, ftuesday: false, fmonday: true, fwednesday: true, fstarttime: "12:00", fendtime: "13:15" }), other];
  const result = summarizeWhatChanged({ versions: [v(start, "أ"), v(mid, "ب")], live: end, names });
  const [entry] = result.entries;
  check(result.entries.length === 1 && entry.kind === "changed" && entry.tags.join() === "moved", "نُقل مرّتين: بطاقةٌ واحدة «نُقلت»", result.entries);
  check(entry.before?.start === "08:00" && entry.before?.days.join() === "0,2" && entry.after?.start === "12:00" && entry.after?.days.join() === "1,3", "من البداية (ح ث 08:00) إلى النهاية (ن ر 12:00)", entry);
  check(entry.by.join() === "أ,ب" && entry.at === result.steps[1].at, "ومن عدّلها: الاثنان بالترتيب، وآخرُ لحظة", entry);
  check(result.counts.moved === 1 && result.counts.total === 1, "العدّ: نُقلت ١ من ١", result.counts);
}

/* ٣) إضافةٌ ثم حذف: لا شيء. */
{
  const start = [row(1)];
  const added = [row(1), row(9, { AdCourseId: 303, SCode: "2" })];
  const result = summarizeWhatChanged({ versions: [v(start), v(added)], live: start, names });
  check(result.entries.length === 0, "أُضيفت ثم حُذفت: لا شيء", result.entries);
  check(result.steps.length === 2 && result.steps[0].entries[0].kind === "added" && result.steps[1].entries[0].kind === "removed", "والخطوات: أُضيفت ثم حُذفت", result.steps);
}

/* ٤) حذفٌ ثم إعادةٌ بمعرّفٍ جديد: كما هي، أو «عُدّلت» إن اختلفت (pairKeyed). */
{
  const start = [row(1), other];
  const removed = [other];
  const same = summarizeWhatChanged({ versions: [v(start), v(removed)], live: [row(50), other], names });
  check(same.entries.length === 0, "حُذفت ثم أُعيدت كما هي بمعرّفٍ جديد: لا شيء", same.entries);
  const differ = summarizeWhatChanged({ versions: [v(start, "أ"), v(removed, "ب")], live: [row(51, { AdRoomHall: "B2" }), other], names });
  check(differ.entries.length === 1 && differ.entries[0].kind === "changed" && differ.entries[0].tags.join() === "room", "وأُعيدت بقاعةٍ أخرى: «قاعة» لا حذف وإضافة", differ.entries);
  check(differ.entries[0].by.join() === "أ,ب", "ومن عدّلها يُعرف بالمقرر والشعبة رغم تغيّر المعرّف", differ.entries[0]);
}

/* ٥) قاعةٌ وأستاذٌ ووقتٌ معاً، ومقرر، وإضافة، وحذف — والعدّ لكل بلاطة. */
{
  const start = [row(1), other, row(3, { AdCourseId: 303, SCode: "4", fstarttime: "13:00", fendtime: "14:15" })];
  const live = [
    row(1, { AdRoomHall: "C3", AdInstructorId: 8, fstarttime: "09:30", fendtime: "10:45" }),
    { ...other, AdCourseId: 303 },
    row(4, { AdCourseId: 302, SCode: "7", fthursday: true, fsunday: false, ftuesday: false, fstarttime: "14:00", fendtime: "15:15" }),
  ];
  const result = summarizeWhatChanged({ versions: [v(start)], live, names });
  const combo = result.entries.find(entry => entry.scheduleId === 1);
  check(combo?.tags.join() === "moved,room,instructor", "موعدٌ تغيّر وقتُه وقاعتُه وأستاذُه: ثلاث شارات", combo);
  check(combo?.before?.instructor === "أحمد علي" && combo?.after?.instructor === "سارة محمد" && combo?.before?.room.includes("A1") && combo?.after?.room.includes("C3"), "الأستاذ والقاعة قبل وبعد بأسمائهما", combo);
  check(result.counts.added === 1 && result.counts.removed === 1 && result.counts.course === 1 && result.counts.room === 1 && result.counts.instructor === 1 && result.counts.moved === 1, "كل بلاطة بعددها", result.counts);
  check(result.counts.total === result.entries.length && result.entries.length === 4, "المجموع = عدد البطاقات", result.counts);
  const text = whatChangedText(result, "ماذا غيّرنا؟ — اليوم");
  check(text.split("\n").length === 5 && text.startsWith("ماذا غيّرنا؟"), "النصّ المنسوخ: عنوانٌ وسطرٌ لكل شعبة", text);
  check(/القاعة .*A1.* ← .*C3/.test(entryLine(combo!)) && entryLine(combo!).includes("الأستاذ أحمد علي ← سارة محمد"), "السطر يقول القاعة والأستاذ قبل ← بعد", entryLine(combo!));
}

/* ٦) بلا لقطاتٍ في الفترة: لا شيء، والنصّ يقول ذلك. */
{
  const result = summarizeWhatChanged({ versions: [], live: [row(1)], names });
  check(result.entries.length === 0 && result.steps.length === 0, "بلا لقطات: لا تعديلات");
  check(whatChangedText(result, "ع").includes("لا تعديلات في هذه الفترة"), "والنصّ: «لا تعديلات في هذه الفترة»");
}

/* ٧) أساسٌ صريح (نسخة الإرسال أو قائمةٌ مقصوصة) يغلب أولى اللقطات. */
{
  const sent = [row(1)];
  const tail = [row(1, { AdRoomHall: "Z1" })];
  const result = summarizeWhatChanged({ versions: [v(tail, "ب")], baselineRows: sent, live: [row(1, { AdRoomHall: "Z2" })], names });
  check(result.entries.length === 1 && result.entries[0].before?.room.includes("A1") && result.entries[0].after?.room.includes("Z2"), "الصافي من الأساس الصريح لا من أولى اللقطات", result.entries);
  check(result.steps.length === 1 && result.steps[0].by === "ب", "والخطوات من اللقطات وحدها", result.steps);
}

/* ٨) لقطةٌ بلا تغيير (توقيع، إرسال) لا تصير خطوة. */
{
  const start = [row(1)];
  const result = summarizeWhatChanged({ versions: [v(start, "أ", "توقيع رئيس القسم"), v(start, "ب")], live: [row(1, { AdInstructorId: 8 })], names });
  check(result.steps.length === 1 && result.steps[0].by === "ب", "لقطةُ التوقيع لا تصير خطوة", result.steps);
  check(result.entries[0].by.join() === "ب", "ومن عدّل هو صاحب الخطوة وحده", result.entries[0]);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
