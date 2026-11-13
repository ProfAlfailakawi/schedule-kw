/**
 * ── «مقترح دراسي» من بند الطلب إلى موعده الأصلي (ملاحظة المالك 11) ──────────
 *
 * كان «إعداد مقترح دراسي» على البند يفتح مساحةً أخرى تختلف عن الموعد المعتاد
 * فتربك، ثم أُضيف زرٌّ ثانٍ ينقل إلى الموعد. صار البندُ يفتح الموعدَ الأصلي في
 * «إدارة الجدول» بنموذجه المعتاد بضغطةٍ واحدة، والوقتُ الذي طلبه الأستاذ معبّأٌ
 * فيه ليُحفظ أو يُعدَّل بفحوصه وتعارضاته المعتادة.
 *
 * يُحمل في `sessionStorage` (التبويب وحده) ويُمحى بأوّل قراءة، كبذرة الإضافة
 * في `requestHandoff.ts`: رابطٌ يُشارَك لا يحمل قراراً قديماً.
 */

export type OpenRowDay = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";

const DAY_KEYS: OpenRowDay[] = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
const KEY = "schedule:open-row";
/** بذرةٌ أقدم من هذا لا تُزرع: فتحُ الجدول بعد ساعةٍ لا يعني «افتح ذلك الموعد». */
const MAX_AGE_MS = 10 * 60 * 1000;

export interface RequestedChange { days: OpenRowDay[]; start: string; end: string }

export interface OpenRowRequest {
  rowId: number;
  /** ما طلبه الأستاذ — يُعبّأ في النموذج. يغيب حين تختلف أوقاتُ الأيام فيُفتح الموعد كما هو. */
  change?: RequestedChange;
  teacher?: string;
  at: number;
}

const TIME = /^\d{1,2}:\d{2}$/;

/** الوقتُ المطلوب للبند حين يكون واحداً لكل أيامه؛ وإلا `null`. */
export function requestedChangeOf(item: { action?: string; slots?: Array<{ day?: string; days?: string[]; start?: string; end?: string }> }): RequestedChange | null {
  if (item.action !== "change") return null;
  const slots = item.slots || [];
  if (!slots.length) return null;
  if (new Set(slots.map(slot => `${slot.start}|${slot.end}`)).size !== 1) return null;
  const start = String(slots[0].start || "");
  const end = String(slots[0].end || "");
  if (!TIME.test(start) || !TIME.test(end)) return null;
  const wanted = new Set(slots.flatMap(slot => (slot.days?.length ? slot.days : [slot.day])).map(String));
  const days = DAY_KEYS.filter(day => wanted.has(day));
  return days.length ? { days, start, end } : null;
}

export function putOpenRow(request: Omit<OpenRowRequest, "at">): void {
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ ...request, at: Date.now() })); }
  catch { /* تخزينٌ ممنوع: يُفتح الجدول بلا موعدٍ مفتوح. */ }
}

/** يُقرأ مرّةً ويُمحى، ويُتحقّق من شكله قبل تصديقه. */
export function takeOpenRow(now = Date.now()): OpenRowRequest | null {
  let raw: string | null = null;
  try { raw = window.sessionStorage.getItem(KEY); window.sessionStorage.removeItem(KEY); }
  catch { return null; }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OpenRowRequest>;
    const rowId = Number(value.rowId || 0);
    const at = Number(value.at || 0);
    if (!Number.isInteger(rowId) || rowId <= 0) return null;
    if (!at || now - at > MAX_AGE_MS || at - now > 60_000) return null;
    const change = value.change && Array.isArray(value.change.days)
      && TIME.test(String(value.change.start || "")) && TIME.test(String(value.change.end || ""))
      ? { days: DAY_KEYS.filter(day => value.change!.days.includes(day)), start: String(value.change.start), end: String(value.change.end) }
      : undefined;
    return {
      rowId,
      change: change?.days.length ? change : undefined,
      teacher: typeof value.teacher === "string" ? value.teacher.slice(0, 120) : undefined,
      at,
    };
  } catch { return null; }
}

/** حقولُ النموذج التي يغيّرها الوقتُ المطلوب. */
export function changeFormPatch(change: RequestedChange): Record<string, boolean | string> {
  const patch: Record<string, boolean | string> = {};
  DAY_KEYS.forEach(day => { patch[day] = change.days.includes(day); });
  patch.fstarttime = change.start;
  patch.fendtime = change.end;
  return patch;
}

/** سطرٌ واحدٌ يقول للمنسّق ما الذي عُبّئ ومن أين. */
export function openRowNotice(request: OpenRowRequest, dayNames: Record<string, string>): string {
  const who = request.teacher || "الأستاذ";
  if (!request.change) return `الموعد الأصلي من طلب ${who}. عدّله هنا بالنموذج المعتاد.`;
  const days = request.change.days.map(day => dayNames[day] || day).join(" · ");
  return `الموعد الأصلي، والوقت الذي طلبه ${who} معبّأ: ${days} ${request.change.start}–${request.change.end}. احفظ أو عدّل.`;
}
