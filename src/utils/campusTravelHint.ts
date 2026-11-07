/**
 * ── تلميحُ التنقّل بين الحرمين في «مساري» ─────────────────────────────────────
 *
 * تلميحٌ هادئ لا يمنع ولا يغيّر اختياراً: موعدان متتاليان في اليوم نفسه من حرمين مختلفين
 * والفاصلُ بينهما أقصرُ من مدة التنقّل المضبوطة في سياسة التنقّل. المدةُ تأتي من وثيقة السياسة
 * وحدها، ولا يُعرف المستثنَون من الأساتذة هنا (لا شأن للطالب بهم).
 *
 * `shortTravelGap` هي رياضةُ الفارق الوحيدة: يستعملها فحصُ الأساتذة (`travelShortfalls`) وهذا التلميح.
 * والدالتان تحت ذاتيتا الاعتماد (لا يستدعي إلا إحداهما الأخرى) لأن «مساري» تتسلّمهما نصّاً (TRAVEL_HINT_SCRIPT).
 */

/** الفارقُ بين موعدين لا يتداخلان إن كان أقصر من `need`، وإلا -1 (كافٍ أو متداخلان أو لا مدة). */
export function shortTravelGap(need: number, aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  if (!(need > 0)) return -1;
  const gap = aStart >= bEnd ? aStart - bEnd : bStart >= aEnd ? bStart - aEnd : -1;
  return gap >= 0 && gap < need ? gap : -1;
}

export interface TravelHintSlot { id: string; day: number; start: number; end: number; /** مفتاحُ الحرم؛ الغائبُ = الرئيسي. */ c?: string }
export interface TravelHint { id: string; day: number; need: number; gap: number }

/**
 * `minutes`: دقائقُ كل زوجٍ بمفتاح السياسة («fahaheel|jahra»…).
 * يُرجع تلميحاً واحداً لكل زوجٍ متتالٍ ضيّق، يحمل معرّفَ الموعد اللاحق؛ وبحدّ أقصى اثنين لكل يوم.
 */
export function travelHints(minutes: Record<string, number>, slots: ReadonlyArray<TravelHintSlot>, perDay?: number): TravelHint[] {
  const limit = perDay || 2;
  const byDay: Record<string, TravelHintSlot[]> = {};
  slots.forEach(slot => { (byDay[slot.day] = byDay[slot.day] || []).push(slot); });
  const out: TravelHint[] = [];
  Object.keys(byDay).sort((x, y) => Number(x) - Number(y)).forEach(day => {
    const list = byDay[day].slice().sort((x, y) => x.start - y.start || x.end - y.end);
    let shown = 0;
    for (let n = 1; n < list.length && shown < limit; n++) {
      const a = list[n - 1], b = list[n], ca = a.c || "main", cb = b.c || "main";
      if (ca === cb) continue;
      const need = Number((minutes || {})[[ca, cb].sort().join("|")]) || 0;
      const gap = shortTravelGap(need, a.start, a.end, b.start, b.end);
      if (gap >= 0) { out.push({ id: b.id, day: Number(day), need, gap }); shown++; }
    }
  });
  return out;
}

/** للصفحات المُصيَّرة في الخادم: النصُّ نفسه لا نسخةٌ ثانية. يعرّف `shortTravelGap` و`travelHints`. */
export const TRAVEL_HINT_SCRIPT = `var shortTravelGap=(${shortTravelGap.toString()});var travelHints=(${travelHints.toString()});`;
