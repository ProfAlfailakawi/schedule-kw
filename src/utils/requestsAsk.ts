/**
 * ── سؤالٌ بالعربية فوق وارد الأساتذة (IR-REQ-034) ────────────────────────────
 *
 * المنسّقُ يكتب كما يتكلّم: «مين طلب الصباح؟»، «طلبات الأحد المرفوضة»، «من لم يفتح الرابط»،
 * «إضافات بنات الأحد». هذا الملفُّ يقرؤها فيُخرج مرشّحاً للعرض: اليومَ، وفترةَ اليوم، ونوعَ البند،
 * وحالتَه، والموقع (بنين/بنات)، وما بقي نصّاً يُطابَق باسم الأستاذ — فيعمل الحقلُ نفسُه بحثاً بالاسم كما كان.
 *
 * **يقرأ ولا يقرّر.** لا يمسّ جدولاً ولا قراراً ولا خادماً؛ أسوأُ ما يفعله خطؤه أن تظهر بطاقاتٌ أقلّ،
 * ولهذا يُعرض ما فُهم سطراً تحت الحقل («فهمتُ: …») ليصحّحه القارئُ بمسحٍ واحد.
 *
 * **ولا يخمّن.** كلُّ كلمةٍ تُلتقط بصيغتها لا بجزءٍ منها: «ثبت» لا تُلتقط من اسمٍ يحويها. وما لم يُفهم يبقى
 * اسماً يُبحث عنه؛ وجملةٌ لا يُفهم منها شيءٌ ولا يبقى منها اسمٌ تُقال كذلك ولا تمسّ المرشّحات القائمة.
 * وهذه الدالّةُ خالصةٌ بلا واجهة ولا قاعدة بيانات، فتُختبر وحدها (tests/requests-ask-audit.ts).
 */
import { arabicMatchKey } from "./arabicText";
import { toEnglishDigits } from "./digits";
import type { Campus } from "./campus";

export type AskDay = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
export type AskPeriod = "morning" | "noon" | "evening";
export type AskAction = "change" | "add" | "delete";
/** `unopened` و`absent` عمودان على الصفّ (لم يفتح/لم يشارك)، والباقي على البند. */
export type AskState = "pending" | "fixed" | "rejected" | "absent" | "unopened";

export interface RequestsAsk {
  days: AskDay[];
  periods: AskPeriod[];
  actions: AskAction[];
  state: AskState | "";
  campus: Campus | "";
  /** ما بقي بعد نزع ما فُهم: اسمُ الأستاذ. */
  text: string;
  /** وصفُ ما فُهم بلا بادئة («الأحد · مرفوض»)، أو فارغ. */
  note: string;
  /** هل فُهمت كلمةُ سؤالٍ واحدةٌ على الأقل (يومٌ، فترة، نوع، حالة، موقع)؟ */
  understood: boolean;
}

export const EMPTY_REQUESTS_ASK: RequestsAsk = { days: [], periods: [], actions: [], state: "", campus: "", text: "", note: "", understood: false };

/** فتراتُ اليوم بساعة البداية: صباحٌ قبل الثانية عشرة، ظهرٌ حتى الثالثة، ومساءٌ بعدها. */
export const PERIOD_HOURS = { noonFrom: 12, eveningFrom: 15 } as const;

export function periodOfStart(start: unknown): AskPeriod | null {
  const match = /(\d{1,2}):(\d{2})/.exec(toEnglishDigits(start));
  if (!match) return null;
  const hour = Number(match[1]);
  return hour < PERIOD_HOURS.noonFrom ? "morning" : hour < PERIOD_HOURS.eveningFrom ? "noon" : "evening";
}

const DAY_WORDS: Array<[RegExp, AskDay]> = [
  [/^(?:ال)?احد$/, "fsunday"],
  [/^(?:ال)?(?:اثنين|اتنين)$/, "fmonday"],
  [/^(?:ال)?ثلاث(?:اء|ا)$/, "ftuesday"],
  [/^(?:ال)?اربع(?:اء|ا)$/, "fwednesday"],
  [/^(?:ال)?خميس$/, "fthursday"],
];
const DAY_STEM: Record<AskDay, string> = { fsunday: "احد", fmonday: "اثنين", ftuesday: "ثلاث", fwednesday: "اربع", fthursday: "خميس" };
const DAY_LABEL: Record<AskDay, string> = { fsunday: "الأحد", fmonday: "الاثنين", ftuesday: "الثلاثاء", fwednesday: "الأربعاء", fthursday: "الخميس" };
const PERIOD_WORDS: Array<[RegExp, AskPeriod]> = [
  [/^(?:ال)?(?:صباح\S*|صبح\S*)$/, "morning"],
  [/^(?:ال)?ظهر\S*$/, "noon"],
  [/^(?:ال)?(?:مساء\S*|مسائ\S*|عصر\S*)$/, "evening"],
];
const PERIOD_LABEL: Record<AskPeriod, string> = { morning: "صباحاً", noon: "ظهراً", evening: "مساءً" };
const ACTION_WORDS: Array<[RegExp, AskAction]> = [
  [/^(?:ال)?(?:اضاف\S*)$/, "add"],
  [/^(?:ال)?(?:حذف\S*|محذوف\S*|الغاء|الغاءات)$/, "delete"],
  [/^(?:ال)?(?:تعديل\S*|معدل\S*|نقل|منقول\S*|تغيير\S*)$/, "change"],
];
const ACTION_LABEL: Record<AskAction, string> = { add: "إضافة", delete: "حذف", change: "تعديل" };
const CAMPUS_WORDS: Array<[RegExp, Campus]> = [
  [/^(?:ال)?(?:بنين|ذكور)$/, "boys"],
  [/^(?:ال)?(?:بنات|اناث|طالبات)$/, "girls"],
];
const CAMPUS_LABEL: Record<Campus, string> = { boys: "بنين", girls: "بنات" };

/**
 * الحالاتُ عباراتٌ لا كلمات: «لم يفتح الرابط» غيرُ «فتح»، و«لم يشارك» غيرُ «شارك». تُنزع من النصّ المُطبَّع
 * قبل التقطيع، الأطولُ والأدقُّ أولاً. والحدودُ مسافاتٌ لا `\b` (حدُّ الكلمة في جافاسكربت لاتينيٌّ ولا يعرف الحرف العربي).
 */
const S = "(?<=\\s)";
const E = "(?=\\s)";
const STATE_PHRASES: Array<[RegExp, AskState]> = [
  [new RegExp(`${S}(?:لم|ما|لا)\\s+(?:يفتح|فتح|يفتحو|فتحو|تفتح)\\S*(?:\\s+(?:ال)?رابط\\S*)?${E}`, "g"), "unopened"],
  [new RegExp(`${S}غير\\s+(?:ال)?(?:فاتح|فاتحين)\\S*(?:\\s+(?:ال)?رابط\\S*)?${E}`, "g"), "unopened"],
  [new RegExp(`${S}(?:لم|ما|لا)\\s+(?:يشارك|شارك|يرسل|ارسل|يرد|رد|يجيب|اجاب|يجاوب|جاوب|يستجيب)\\S*${E}`, "g"), "absent"],
  [new RegExp(`${S}غير\\s+(?:ال)?(?:مشارك|مشاركين|راد|ردين|مجيب)\\S*${E}`, "g"), "absent"],
  [new RegExp(`${S}(?:لم|ما|لا)\\s+(?:يقرر|تقرر|قررت|اقرر|تقرري|نقرر)\\S*${E}`, "g"), "pending"],
  [new RegExp(`${S}(?:ال)?(?:بانتظار|منتظر\\S*|معلق\\S*|ينتظر\\S*)(?:\\s+(?:قرارك|القرار|قراري))?${E}`, "g"), "pending"],
  [new RegExp(`${S}(?:ال)?(?:مرفوض\\S*|رفض\\S*|رفضت|ارفض\\S*)${E}`, "g"), "rejected"],
  [new RegExp(`${S}(?:ال)?(?:مثبت\\S*|ثبت\\S*|ثبتت|مقبول\\S*|وافقت)${E}`, "g"), "fixed"],
];
const STATE_LABEL: Record<AskState, string> = {
  pending: "بانتظار قرارك", fixed: "ثُبّت", rejected: "رُفض", absent: "لم يشاركوا", unopened: "لم يفتحوا الرابط",
};

/** كلماتُ السؤال العامّة: تصف الوارد نفسه لا أستاذاً بعينه، وبقاؤها نصَّ بحثٍ يُفرغ الشاشةَ بلا سبب. */
const STOP_WORDS = new Set([
  "من", "مين", "منو", "شو", "شنو", "وش", "ايش", "هل", "ما", "لم", "لا", "كم", "عدد", "وين", "اللي", "التي", "الذي", "الذين", "الي",
  "في", "على", "عن", "عند", "مع", "و", "او", "ثم", "كل", "جميع", "اي", "هذا", "هذه", "ذلك", "هو", "هي",
  "طلب", "طلبات", "طلبوا", "طلبت", "طلبه", "الطلبات", "الطلب", "رغبه", "رغبات", "الرغبات", "رغبوا",
  "يوم", "ايام", "الايام", "اليوم", "بند", "بنود", "البنود", "موعد", "مواعيد", "المواعيد", "محاضره", "محاضرات",
  "استاذ", "اساتذه", "الاساتذه", "الاستاذ", "دكاتره", "الوارد", "قرار", "قراري", "قرارك", "الرابط", "رابط", "رابطه",
  "اعرض", "اعرضلي", "ابي", "ابغي", "اريد", "ابغى", "لي", "ليه", "فقط", "بس", "حق", "الخاصه", "الخاص",
]);

/** يقرأ الجملة. فارغةٌ ← بلا مرشّح. */
export function parseRequestsAsk(input: string): RequestsAsk {
  const raw = String(input ?? "").trim();
  if (!raw) return EMPTY_REQUESTS_ASK;
  /* علاماتُ الترقيم تصير مسافة؛ والأرقام العربية والهمزات والتاء المربوطة تُوحَّد بمفتاح المطابقة نفسه الذي يبحث به الوارد. */
  const original = new Map<string, string>();
  for (const word of raw.replace(/[؟?!،,.:؛;()«»"]/g, " ").split(/\s+/).filter(Boolean)) original.set(arabicMatchKey(word), word);
  let rest = ` ${arabicMatchKey(raw).replace(/[؟?!،,.:؛;()«»"]/g, " ").replace(/\s+/g, " ")} `;
  const state = { value: "" as AskState | "" };
  for (const [pattern, value] of STATE_PHRASES) {
    pattern.lastIndex = 0;
    if (!pattern.test(rest)) continue;
    /* أولُ حالةٍ تُذكر هي المقصودة (ما كان أبعدَ تأخيراً في القائمة يؤخذ بعد الأدقّ)، ويُنزع كلُّ ما التُقط. */
    if (!state.value) state.value = value;
    rest = rest.replace(pattern, " ");
  }
  const days: AskDay[] = [], periods: AskPeriod[] = [], actions: AskAction[] = [];
  let campus: Campus | "" = "";
  const left: string[] = [];
  for (const word of rest.split(/\s+/).filter(Boolean)) {
    /* «والأحد» و«للأحد» و«بالصباح»: حرفُ العطف أو الجرّ المتّصل لا يمنع الفهم. */
    const bare = word.length > 3 ? word.replace(/^و(?=ال|لل|بال)/, "").replace(/^لل/, "ال").replace(/^[بل](?=ال)/, "") : word;
    const day = DAY_WORDS.find(([pattern]) => pattern.test(bare));
    const period = PERIOD_WORDS.find(([pattern]) => pattern.test(bare));
    const action = ACTION_WORDS.find(([pattern]) => pattern.test(bare));
    const site = CAMPUS_WORDS.find(([pattern]) => pattern.test(bare));
    if (day) { if (!days.includes(day[1])) days.push(day[1]); }
    else if (period) { if (!periods.includes(period[1])) periods.push(period[1]); }
    else if (action) { if (!actions.includes(action[1])) actions.push(action[1]); }
    else if (site) { if (!campus) campus = site[1]; }
    else if (!STOP_WORDS.has(word)) left.push(original.get(word) || word);
  }
  const text = left.join(" ").trim();
  const understood = days.length > 0 || periods.length > 0 || actions.length > 0 || Boolean(state.value) || Boolean(campus);
  const parts: string[] = [];
  if (state.value) parts.push(STATE_LABEL[state.value]);
  if (actions.length) parts.push(actions.map(action => ACTION_LABEL[action]).join(" أو "));
  if (days.length) parts.push(days.map(day => DAY_LABEL[day]).join(" أو "));
  if (periods.length) parts.push(periods.map(period => PERIOD_LABEL[period]).join(" أو "));
  if (campus) parts.push(CAMPUS_LABEL[campus]);
  if (text) parts.push(`الاسم يحوي «${text}»`);
  return { days, periods, actions, state: state.value, campus, text, note: parts.join(" · "), understood };
}

/** السطرُ تحت الحقل: ما فُهم، أو أنّه لم يُفهم شيء (والمرشّحاتُ القائمة باقيةٌ كما هي). */
export function requestsAskNote(rawAsk: string, ask: RequestsAsk): string | null {
  if (!String(rawAsk ?? "").trim()) return null;
  if (ask.understood) return `فهمتُ: ${ask.note}`;
  if (ask.text) return `لم أجد كلمة سؤالٍ مفهومة، فأبحث بالاسم عن «${ask.text}». المرشّحاتُ كما هي.`;
  return "لم أفهم هذه الجملة؛ المرشّحاتُ كما هي. جرّب: «طلبات الأحد المرفوضة» أو «من لم يفتح الرابط».";
}

export interface AskItemLike {
  action: string;
  slots?: Array<{ day?: string; start?: string }>;
  before?: { days?: string; time?: string };
  after?: { time?: string };
}

/** يومُ البند بمفاتيح الجدول: من أيام الطلب، وإلا من نصّ «كان» (للحذف). */
export function itemDaysOf(item: AskItemLike): AskDay[] {
  const fromSlots = (item.slots || []).map(slot => String(slot.day || "")).filter((day): day is AskDay => day in DAY_STEM);
  if (fromSlots.length) return [...new Set(fromSlots)];
  const text = arabicMatchKey(item.before?.days || "");
  return (Object.keys(DAY_STEM) as AskDay[]).filter(day => text.includes(DAY_STEM[day]));
}

/** بدايةُ البند: من أيام الطلب، وإلا من وقت «المطلوب» ثم «كان». */
export function itemStartOf(item: AskItemLike): string {
  const slot = (item.slots || []).find(entry => entry.start);
  return String(slot?.start || item.after?.time || item.before?.time || "");
}

/** هل يطابق البندُ اليومَ والفترةَ والنوعَ والموقعَ في السؤال؟ (الحالةُ عند المستدعي، فهي تُدمج مع شريحة الحالة.) */
export function itemMatchesRequestsAsk(item: AskItemLike, ask: RequestsAsk, campus?: Campus | null): boolean {
  if (ask.actions.length && !ask.actions.includes(item.action as AskAction)) return false;
  if (ask.days.length) {
    const days = itemDaysOf(item);
    if (!days.some(day => ask.days.includes(day))) return false;
  }
  if (ask.periods.length) {
    const period = periodOfStart(itemStartOf(item));
    if (!period || !ask.periods.includes(period)) return false;
  }
  if (ask.campus && campus !== ask.campus) return false;
  return true;
}

/** هل في السؤال شرطٌ على البنود نفسها (لا على الأستاذ وحده)؟ */
export const asksAboutItems = (ask: RequestsAsk): boolean =>
  ask.days.length > 0 || ask.periods.length > 0 || ask.actions.length > 0 || Boolean(ask.campus);

/** اسمُ الأستاذ يحوي كلَّ كلمات النصّ (بمفتاح المطابقة العربي)، لا الجملةَ بترتيبها. */
export function nameMatchesAsk(name: string, text: string): boolean {
  const words = arabicMatchKey(text).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const key = arabicMatchKey(name);
  return words.every(word => key.includes(word));
}
