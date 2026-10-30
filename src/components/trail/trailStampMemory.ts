/**
 * ذاكرةُ بصمة «آخر تعديل» في المتصفّح: دقيقةٌ لكل موعد، **لصاحب الجلسة وحده**.
 *
 * الخادمُ يقول لكلّ قارئٍ ما يحقّ له (الاسمَ أو اسمَ الفريق)، فالجوابُ ملكُ من سأل. على جهازٍ مشترك
 * لا يرى من دخل بعده جوابَ من خرج: المفتاحُ يحمل هوية الجلسة (الحساب والعضو)، وتبديلُ الهوية
 * أو الخروجُ يمحو الذاكرة كلها.
 */
export type TrailStampValue = { who: string; at: string; kind: string } | null;

const MEMORY_MS = 60_000;
const LIMIT = 400;
let owner = "";
const memory = new Map<string, { at: number; stamp: TrailStampValue }>();

/** هويةُ الجلسة الآن («حساب:عضو»). هويةٌ غيرُ السابقة تمحو ما حُفظ. */
export function setTrailStampOwner(next: string): void {
  if (next === owner) return;
  owner = next;
  memory.clear();
}

export function currentTrailStampOwner(): string { return owner; }

export function forgetTrailStamps(): void {
  owner = "";
  memory.clear();
}

export function readTrailStamp(rowId: number, now = Date.now()): TrailStampValue | undefined {
  if (!owner) return undefined;
  const held = memory.get(`${owner}|${rowId}`);
  return held && now - held.at < MEMORY_MS ? held.stamp : undefined;
}

/** يُحفظ الجوابُ لمن سأل فقط: إن تبدّلت الهويةُ والسؤالُ في الطريق، لا يُحفظ. */
export function keepTrailStamp(askedBy: string, rowId: number, stamp: TrailStampValue, now = Date.now()): void {
  if (!askedBy || askedBy !== owner) return;
  memory.set(`${owner}|${rowId}`, { at: now, stamp });
  if (memory.size > LIMIT) memory.delete(memory.keys().next().value as string);
}
