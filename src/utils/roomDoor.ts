/**
 * ── بابُ القاعة: ما الذي يجري فيها الآن؟ ─────────────────────────────────────
 *
 * ملصقٌ على باب كل قاعة، وشاشةٌ في الممر. والسؤالُ واحد في الموضعين: أهي
 * فاضية، أم مشغولة، أم تبدأ فيها محاضرةٌ بعد دقائق؟ والجوابُ يُحسب هنا مرّةً
 * واحدة، ويُرسل نصُّه نفسُه إلى المتصفّح (ROOM_DOOR_ENGINE_SCRIPT) — كما يُرسل
 * countOf في arabicCount.ts — فلا يفترق ما يقوله الخادم عمّا تقوله الشاشة،
 * ولا ما يُختبر عمّا يُعرض.
 *
 * لذلك الدوالُّ الثلاث (doorClockAt, doorStatusAt, doorViewAt) مكتوبةٌ بلا
 * دالّةٍ داخلية ولا إغلاقٍ ولا const/let ولا سهمٍ ولا قالبٍ نصّي: تعمل كما هي
 * في متصفّح شاشةٍ قديمة في ممرّ، وما تحتاجه من أخواتها يُمرَّر إليها معاملاً
 * (لا اسماً قد يغيّره المُجمِّع).
 *
 * الوقتُ وقتُ الكويت دائماً (UTC+3 بلا توقيتٍ صيفي)، أيّاً كانت ساعةُ الخادم
 * أو الجهاز: «الآن» يُشتقّ من لحظةٍ عالمية واحدة.
 */
import { compareLocationCodes, normalizeLocationToken } from "./locationRegistry";
import { defaultTermDates, termEndDate } from "./termSequence";

/** محاضرةٌ تبدأ خلال هذه الدقائق تجعل القاعة «تبدأ بعد…» لا «فاضية». */
export const DOOR_SOON_MINUTES = 15;
/** حدّا الخطّ الزمني لليوم: من الثامنة صباحاً إلى الثامنة مساءً. */
export const DOOR_DAY_START = 8 * 60;
export const DOOR_DAY_END = 20 * 60;
export const DOOR_DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
export const DOOR_MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"] as const;

/** محاضرةٌ في يومٍ واحد: دقيقةُ البدء والانتهاء من منتصف الليل، وx = أُلغيت في ذلك التاريخ. */
export interface DoorSlot { s: number; e: number; x?: number }

export interface DoorLecture extends DoorSlot {
  start: string;
  end: string;
  /** رمزُ المقرر كما يُطبع (سبعُ خانات في هذه الجامعة). */
  code: string;
  title: string;
  /** رموزُ الشعب مجموعةً («01 · 02») حين تُدرَّس شعبتان معاً في القاعة نفسها. */
  sec: string;
}

/** يومٌ من الأحد إلى الخميس: رقمُه (0 = الأحد)، وتاريخُه في هذا الأسبوع، ومحاضراتُه مرتّبة. */
export interface DoorDay<L extends DoorSlot = DoorLecture> { wd: number; date: string; lectures: L[] }

export interface DoorTerm { name: string; start: string; end: string }

export interface DoorClock { date: string; weekday: number; minute: number }

export type DoorStatusKind = "free" | "busy" | "soon";
export interface DoorStatus {
  kind: DoorStatusKind;
  /** موضعُ المحاضرة الجارية في القائمة، أو ‎-1‎. */
  current: number;
  /** موضعُ المحاضرة التالية اليوم (غير الملغاة)، أو ‎-1‎. */
  next: number;
  /** الدقيقةُ التي تتبدّل عندها الحال: نهايةُ الجارية، أو بدايةُ التالية، أو ‎-1‎ (بقيةُ اليوم). */
  until: number;
  /** الدقائقُ الباقية حتى `until`، أو ‎-1‎. */
  left: number;
}

export type DoorState = "busy" | "free" | "soon" | "weekend" | "outside";

export interface DoorView<L extends DoorSlot = DoorLecture> {
  clock: DoorClock;
  /** in · before · after · none — موقعُ اليوم من الفصل الجاري. */
  termState: "in" | "before" | "after" | "none";
  state: DoorState;
  today: L[];
  status: DoorStatus | null;
  /** المحاضرةُ التالية — اليوم أو في يومٍ لاحق من الأسبوع — أو null. */
  next: { lecture: L; wd: number; sameDay: boolean } | null;
  /** محاضرةٌ أُلغيت اليوم ووقتُها الآن: القاعة فاضية بسببها. */
  cancelledNow: L | null;
}

/**
 * ساعةُ الكويت من لحظةٍ عالمية: التاريخ ويومُ الأسبوع (0 = الأحد) والدقيقةُ من منتصف الليل.
 * مكتوبةٌ لتُرسل كما هي إلى المتصفّح (انظر رأس الملف).
 */
export function doorClockAt(ms: number): DoorClock {
  var d = new Date(Number(ms) + 10800000);
  var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  return {
    date: y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day,
    weekday: d.getUTCDay(),
    minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/**
 * حالُ القاعة عند دقيقةٍ من اليوم.
 *
 *   مشغولة — محاضرةٌ غير ملغاة بدأت ولم تنتهِ (إن تداخلت اثنتان فالأسبقُ بدءاً).
 *   تبدأ بعد… — لا جارية، والتاليةُ تبدأ خلال `soonMinutes`.
 *   فاضية — وإلا؛ حتى بداية التالية، أو بقيةَ اليوم.
 *
 * الملغاةُ اليوم (x) لا تشغل القاعة ولا تكون «التالية».
 */
export function doorStatusAt(slots: ReadonlyArray<DoorSlot>, minute: number, soonMinutes: number): DoorStatus {
  var cur = -1, next = -1, i, item;
  for (i = 0; i < slots.length; i++) {
    item = slots[i];
    if (!item || item.x) continue;
    if (item.s <= minute && minute < item.e) {
      if (cur < 0 || item.s < slots[cur].s) cur = i;
    } else if (item.s > minute) {
      if (next < 0 || item.s < slots[next].s) next = i;
    }
  }
  if (cur >= 0) return { kind: "busy", current: cur, next: next, until: slots[cur].e, left: slots[cur].e - minute };
  if (next >= 0 && slots[next].s - minute <= soonMinutes) return { kind: "soon", current: -1, next: next, until: slots[next].s, left: slots[next].s - minute };
  if (next >= 0) return { kind: "free", current: -1, next: next, until: slots[next].s, left: slots[next].s - minute };
  return { kind: "free", current: -1, next: -1, until: -1, left: -1 };
}

/**
 * ما تعرضه الصفحة عند لحظةٍ: موقعُ اليوم من الفصل، وعطلةُ نهاية الأسبوع، ومحاضراتُ
 * اليوم، والحال، والتاليةُ ولو في يومٍ لاحق، والملغاةُ التي وقتُها الآن.
 *
 * `statusAt` و`clockAt` هما doorStatusAt وdoorClockAt — يُمرَّران معاملين لأن
 * النصّ نفسه يعمل في المتصفّح، حيث لا يُضمن اسمٌ أعطاه المُجمِّع لأختيهما.
 */
export function doorViewAt<L extends DoorSlot>(
  data: { term: DoorTerm | null; week: ReadonlyArray<DoorDay<L>>; soon: number },
  ms: number,
  statusAt: (slots: ReadonlyArray<DoorSlot>, minute: number, soonMinutes: number) => DoorStatus,
  clockAt: (ms: number) => DoorClock,
): DoorView<L> {
  var clock = clockAt(ms);
  var week = data.week || [];
  var term = data.term;
  var termState: DoorView<L>["termState"] = "in";
  var i, j, k, day, lecture, copy: any;
  if (!term) termState = "none";
  else if (term.start && clock.date < term.start) termState = "before";
  else if (term.end && clock.date > term.end) termState = "after";

  /* محاضراتُ اليوم: يومُ هذا التاريخ نفسه؛ فإن لم يكن (صفحةٌ بقيت مفتوحةً إلى أسبوعٍ لاحق
     بلا اتصال) فنمطُ اليوم نفسه من الأسبوع بلا إلغاءاتٍ — الإلغاءُ لتاريخٍ بعينه. */
  var today: L[] = [];
  var found = false;
  for (i = 0; i < week.length; i++) {
    if (week[i].date === clock.date) { today = week[i].lectures.slice(); found = true; break; }
  }
  if (!found && clock.weekday <= 4) {
    for (i = 0; i < week.length; i++) {
      if (week[i].wd !== clock.weekday) continue;
      for (j = 0; j < week[i].lectures.length; j++) {
        copy = {};
        for (k in week[i].lectures[j]) if (Object.prototype.hasOwnProperty.call(week[i].lectures[j], k)) copy[k] = (week[i].lectures[j] as any)[k];
        copy.x = 0;
        today.push(copy);
      }
    }
  }

  var state: DoorState;
  var status: DoorStatus | null = null;
  if (termState !== "in" && termState !== "none") state = "outside";
  else if (termState === "none" && !week.length) state = "outside";
  else if (clock.weekday > 4) state = "weekend";
  else {
    status = statusAt(today, clock.minute, data.soon);
    state = status.kind;
  }

  var cancelledNow: L | null = null;
  if (status) {
    for (i = 0; i < today.length; i++) {
      lecture = today[i];
      if (lecture.x && lecture.s <= clock.minute && clock.minute < lecture.e) { cancelledNow = lecture; break; }
    }
  }

  /* التالية: من اليوم إن بقي فيه شيء، وإلا أولُ محاضرةٍ في الأيام التالية (ثم الأسبوعُ القادم). */
  var next: DoorView<L>["next"] = null;
  if (state !== "outside") {
    if (status && status.next >= 0) next = { lecture: today[status.next], wd: clock.weekday, sameDay: true };
    else {
      var start = clock.weekday > 4 ? 0 : clock.weekday + 1;
      for (k = 0; k < 5 && !next; k++) {
        var wd = (start + k) % 5;
        day = null;
        for (i = 0; i < week.length; i++) if (week[i].wd === wd) { day = week[i]; break; }
        if (!day) continue;
        var best = -1;
        for (j = 0; j < day.lectures.length; j++) {
          /* إلغاءُ هذا الأسبوع لا يُسقط محاضرة الأسبوع القادم: ما عاد إلى يومٍ مضى فهو من الأسبوع القادم. */
          if (day.lectures[j].x && !(clock.weekday <= 4 && wd <= clock.weekday)) continue;
          if (best < 0 || day.lectures[j].s < day.lectures[best].s) best = j;
        }
        if (best >= 0) next = { lecture: day.lectures[best], wd: wd, sameDay: false };
      }
    }
  }
  return { clock: clock, termState: termState, state: state, today: today, status: status, next: next, cancelledNow: cancelledNow };
}

/**
 * الحالُ جملةً واحدة كما كتبها صاحبُ النظام: «فاضية — حتى 12:00»،
 * «مشغولة · ACC 101 — تنتهي 10:50»، «تبدأ بعد 10 د · ACC 101». تُقرأ لقارئ
 * الشاشة، وتُرسم قبل أن يعمل السكربت.
 */
export function doorSentence(view: Pick<DoorView<DoorSlot & { code?: string; title?: string }>, "state" | "status" | "today">): string {
  var st = view.status, l, at, t = "";
  if (view.state === "weekend") return "عطلة نهاية الأسبوع";
  if (view.state === "outside") return "خارج الفصل الدراسي";
  if (!st) return "";
  at = st.until;
  if (at >= 0) t = (Math.floor(at / 60) < 10 ? "0" : "") + Math.floor(at / 60) + ":" + (at % 60 < 10 ? "0" : "") + (at % 60);
  if (view.state === "busy") { l = view.today[st.current]; return "مشغولة · " + (l.code || l.title || "") + " — تنتهي " + t; }
  if (view.state === "soon") { l = view.today[st.next]; return "تبدأ بعد " + st.left + " د · " + (l.code || l.title || ""); }
  return at >= 0 ? "فاضية — حتى " + t : "فاضية — بقية اليوم";
}

/**
 * نصُّ الدوال للمتصفّح. يُحقن مرّةً في سكربت الصفحة فيُعرّف doorClockAt
 * وdoorStatusAt وdoorViewAt وdoorSentence بالتواقيع نفسها.
 */
export const ROOM_DOOR_ENGINE_SCRIPT =
  `var doorClockAt=(${doorClockAt.toString()});var doorStatusAt=(${doorStatusAt.toString()});var doorViewAt=(${doorViewAt.toString()});var doorSentence=(${doorSentence.toString()});`;

/** «08:30» ← 510؛ وما لا يُقرأ وقتاً ← NaN. */
export function toDoorMinute(value: unknown): number {
  const match = /^\s*(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  if (!match) return NaN;
  const hours = Number(match[1]), minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : NaN;
}

/** 510 ← «08:30». */
export function doorTime(minute: number): string {
  const m = Math.max(0, Math.round(minute));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** «الخميس 29 أكتوبر» من تاريخٍ تقويمي. */
export function doorDateLabel(date: string): string {
  const [y, m, d] = String(date).split("-").map(Number);
  if (!y || !m || !d) return "";
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DOOR_DAY_NAMES[weekday]} ${d} ${DOOR_MONTH_NAMES[m - 1]}`;
}

const DAY_MS = 86_400_000;
const ymd = (at: number) => new Date(at).toISOString().slice(0, 10);

/**
 * تواريخُ الأحد إلى الخميس للأسبوع الذي تُعرض عليه الصفحة: أسبوعُ اليوم، وفي
 * الجمعة والسبت الأسبوعُ القادم — فالعطلةُ تشير إلى الأحد المقبل لا الماضي.
 */
export function doorWeekDates(date: string, weekday: number): string[] {
  const base = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(base)) return [];
  const sunday = base + (weekday <= 4 ? -weekday : 7 - weekday) * DAY_MS;
  return [0, 1, 2, 3, 4].map(offset => ymd(sunday + offset * DAY_MS));
}

/**
 * بدايةُ الفصل ونهايتُه تاريخين تقويميين — بالترتيب نفسه الذي يحكم termWindow:
 * ما أدخله المنسّق (البداية وعدد الأسابيع) أولاً، ثم التقويمُ الافتراضي من اسمه.
 */
export function doorTermDates(term: { AdTermName?: string; AdTermStart?: string; AdTermWeeks?: number } | null | undefined): { start: string; end: string } | null {
  if (!term) return null;
  const start = String(term.AdTermStart || "");
  const weeks = Number(term.AdTermWeeks || 0);
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && weeks > 0 && Number.isFinite(Date.parse(`${start}T00:00:00Z`))) return { start, end: termEndDate(start, weeks) };
  const dates = defaultTermDates(term.AdTermName);
  return dates ? { start: dates.start, end: dates.end } : null;
}

/* ── الأدوار: رمزُ القاعة يحمل دورَها ────────────────────────────────────────
 *
 * في مباني هذه الجامعة: G أرضي، F أول، S ثانٍ (G09، F20، S04)، والقاعاتُ
 * المرقّمة بالمئات (101، 205) دورُها خانةُ المئات. وما لا يُقرأ منه دورٌ
 * («L01» مختبر، «SS03»، «ST1») يُجمع تحت «مرافق أخرى» بعد الأدوار — لا يُخمَّن له دور. */
const FLOOR_BY_LETTER: Record<string, { rank: number; label: string }> = {
  B: { rank: -1, label: "السرداب" },
  G: { rank: 0, label: "الدور الأرضي" },
  F: { rank: 1, label: "الدور الأول" },
  S: { rank: 2, label: "الدور الثاني" },
  T: { rank: 3, label: "الدور الثالث" },
};
const FLOOR_ORDINALS = ["الأرضي", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع"];
export const OTHER_FLOOR = { rank: 99, label: "مرافق أخرى" } as const;

export function roomFloor(code: unknown): { rank: number; label: string } {
  const token = normalizeLocationToken(code);
  const lettered = /^([A-Z])\d{1,3}[A-Z]?$/.exec(token);
  if (lettered && FLOOR_BY_LETTER[lettered[1]]) return FLOOR_BY_LETTER[lettered[1]];
  const numbered = /^(\d)(\d{2})[A-Z]?$/.exec(token);
  if (numbered) {
    const floor = Number(numbered[1]);
    return { rank: floor, label: `الدور ${FLOOR_ORDINALS[floor]}` };
  }
  return OTHER_FLOOR;
}

/** ترتيبُ لوحة المبنى: الدورُ أولاً ثم رقمُ القاعة (F02 قبل F10). */
export function compareDoorRooms(a: string, b: string): number {
  return roomFloor(a).rank - roomFloor(b).rank || compareLocationCodes(a, b);
}
