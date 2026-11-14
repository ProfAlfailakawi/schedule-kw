/**
 * ── «اكتب الموعد بسطرٍ واحد» ─────────────────────────────────────────────────
 *
 * The coordinator knows the appointment before the editor opens: it is one
 * line on the sheet in front of them — «0109105 ش503 د. نورة ن ر 8:00-9:15
 * 901A01/104». The form asks for it field by field, six choices in six places.
 * The command palette reads the line instead and offers one command on top,
 * «أنشئ هذا الموعد», drawn as the parts it understood.
 *
 * Deterministic on purpose — no model, and no guess beyond the lists the
 * screen already holds: the open department's courses and the staff its
 * picker offers. What is matched is filled; what is missing or unclear stays a
 * dashed «؟» and is decided in the editor, whose live checks run as they do for
 * any other entry. Nothing here saves anything.
 *
 * The reading, in order — each part is cut out of the line before the next looks:
 *   • the room — «901A01/104», «901A01 104», «قاعة 104 مبنى 901A01». Its digits
 *     must never be read as an hour or a section, so it goes first;
 *   • the section, when it is said to be one — «ش503», «شعبة 503», «#503»;
 *   • the time — «8:30», «08.30», «٨:٣٠», «8 م», «0800», «1400», ranges «8-9:20»
 *     and «من 8 إلى 9:20», spoken forms «8 ونص» (08:30), «9 الا ربع» (08:45),
 *     «الساعة ثنتين». ONE shared rule (clockInput.ts) for every screen: an hour
 *     of 1–7 typed without minutes-zero or period is the afternoon (13–19), 8–12
 *     as typed, 13–23 as typed; «ص»/«م»/«الصبح»/«العصر»/«الظهر» force the period,
 *     a time outside the department's day is not bent into it: it is reported,
 *     not filled; an invalid clock («14:60», «24:00», «8:5») is reported whole and
 *     never leaks into the section; two clocks («8:00 9:20») are start and end;
 *   • a title — «د.»، «الدكتورة»، «أ.» — and the name that follows it;
 *   • the course — a 6–7 digit code (with or without leading zeros), or the
 *     longest run of words found in one course name;
 *   • the days — names with or without «ال» (and dialect «الثلوث»), joined any way
 *     people join them, and the timetable's letters «ح ن ث ر خ». Saturday and
 *     Friday are not teaching days: they are reported with a reason in `notes`;
 *   • the teacher — the words that remain, by word prefix;
 *   • and a bare number last: a lone 1–2 digit hour, a lone 2–3 digit section.
 * Anything left over is handed back in `unknown`, never silently dropped.
 *
 * Spoken Kuwaiti phrasing (the voice input feeds this same parser): the verbs
 * «حط، ضيف، سوي، أضف، ابي» and «حق» are glue, and number words (واحدة، ثنتين،
 * ثلاثة … عشرة، حداشر، ثناشر) are read as the hour after «الساعة» or before a
 * period/fraction word: «حط التصميم التعليمي حق د. أحمد أحد وثلاثاء الساعة ثنتين»
 * is the course by name, the instructor, Sunday+Tuesday and 14:00.
 */
import { DAY_KEYS, DAY_NAMES, type DayKey } from "./scheduleRegulations";
import { afternoonHour, parseTypedClock } from "./clockInput";
import { foldInstructorText, instructorCleanName } from "./instructorIdentity";
import {
  canonicalRoomShape,
  normalizeLocationToken,
  resolveBuilding,
  resolveBuildingFromUniqueRoom,
  roomGroups,
  type LocationRegistry,
} from "./locationRegistry";

export type OneLineCourse = { AdCourseId: number; CourseName: string; CourseCode: string | number };
export type OneLineInstructor = { AdInstructorId: number; AdInstructorName: string };

export interface OneLineContext {
  courses: readonly OneLineCourse[];
  instructors: readonly OneLineInstructor[];
  /** The department's teaching day, «HH:MM». */
  window?: { start: string; end: string };
}

export interface OneLineSeed {
  courseId?: number;
  sectionCode?: string;
  instructorId?: number;
  days?: DayKey[];
  start?: string;
  end?: string;
  roomCode?: string;
  roomHall?: string;
}

/** What each understood part says, ready to be shown. */
export interface OneLineParts {
  course?: string;
  section?: string;
  teacher?: string;
  days?: string;
  time?: string;
  room?: string;
}

export interface OneLineReading {
  seed: OneLineSeed;
  parts: OneLineParts;
  /** What was typed and not understood, as typed. */
  unknown: string[];
  /** More than one match: the names, so the reader sees why nothing was chosen. */
  ambiguous: { teacher?: string[]; course?: string[] };
  /** Why something was left out (e.g. Saturday is not a teaching day), ready to show. */
  notes?: string[];
}

/* ── The line as one alphabet ─────────────────────────────────────────────── */

/**
 * Two digit sets, Arabic punctuation, presentation forms, bidi marks pasted
 * from a PDF, harakat and tatweel: none of them changes what was meant, so all
 * of them are folded away before anything is read.
 */
export function normalizeOneLine(text: string): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[​-‏‪-‮⁦-⁩؜﻿]/g, "")
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/(\d)\s*ـ+\s*(?=\d)/g, "$1-")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/٫/g, ".")
    .replace(/[،؛٬]/g, ",")
    .replace(/[‐-―−]/g, "-")
    .replace(/[«»"“”„'‘’`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One spelling per word: the instructor-identity law, used for every name here. */
const fold = (value: string) => foldInstructorText(value);
const withoutAl = (word: string) => (word.startsWith("ال") && word.length > 3 ? word.slice(2) : word);
const pad = (value: number) => String(value).padStart(2, "0");
const minutesOf = (clock: string) => {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};
const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");

/* ── Vocabulary — written as people write it, folded by the same law as the line ── */

const DAY_SPELLINGS: Array<[DayKey, string[]]> = [
  ["fsunday", ["أحد", "الأحد", "sun", "sunday"]],
  ["fmonday", ["اثنين", "الاثنين", "إثنين", "الإثنين", "اتنين", "الاتنين", "mon", "monday"]],
  ["ftuesday", ["ثلاثاء", "الثلاثاء", "ثلثاء", "الثلثاء", "ثلوث", "الثلوث", "ثلاثا", "tue", "tues", "tuesday"]],
  ["fwednesday", ["أربعاء", "الأربعاء", "wed", "wednesday"]],
  ["fthursday", ["خميس", "الخميس", "thu", "thur", "thurs", "thursday"]],
];
const DAY_WORDS = new Map<string, DayKey>(DAY_SPELLINGS.flatMap(([key, spellings]) => spellings.map(spelling => [fold(spelling), key] as [string, DayKey])));
/** Not teaching days: said back with a reason, never read as a different day. */
const NON_TEACHING = new Map<string, string>([
  ["سبت", "السبت"], ["السبت", "السبت"], ["جمعه", "الجمعة"], ["الجمعه", "الجمعة"], ["sat", "السبت"], ["saturday", "السبت"], ["fri", "الجمعة"], ["friday", "الجمعة"],
].map(([word, label]) => [fold(word), label] as [string, string]));
/** The timetable's own shorthand: one letter a day. */
const DAY_LETTERS = new Map<string, DayKey>([["ح", "fsunday"], ["ن", "fmonday"], ["ث", "ftuesday"], ["ر", "fwednesday"], ["خ", "fthursday"]]);

/** Titles are how a name is written, not who it is (the picker drops them too). */
const TITLES = new Set([
  "د", "دكتور", "الدكتور", "دكتورة", "الدكتورة", "أ", "أستاذ", "الأستاذ", "أستاذة", "الأستاذة", "أد",
  "بروف", "بروفيسور", "البروفيسور", "م", "مهندس", "المهندس", "dr", "prof", "mr", "mrs", "ms",
].map(fold));

/**
 * Glue words: read past, never reported as not understood. «على» is left out
 * on purpose — folded, it is «علي», and a colleague's name outranks a preposition.
 */
const FILLERS = new Set([
  "و", "من", "إلى", "حتى", "في", "مع", "يوم", "أيام", "الأيام", "اليوم",
  "الساعة", "ساعة", "س", "قاعة", "القاعة", "مبنى", "المبنى", "شعبة", "الشعبة", "ش", "مقرر", "المقرر", "مادة", "المادة",
  "موعد", "الموعد", "جديد", "أضف", "إضافة", "أنشئ", "وقت", "الوقت", "add", "new",
  "حط", "ضيف", "سوي", "سو", "ابي", "ابغى", "أبغي", "ابا", "حق", "ويوم", "لو سمحت", "الله يخليك",
].map(fold));

/* ── Patterns cut from the line ───────────────────────────────────────────── */

/* A token may stand after the start, a space or punctuation — never inside a
   word. Group 1 is always that boundary, kept when the match is cut out. */
const B = "(^|[^\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
const BUILDING = "\\d{1,6}[A-Za-z]\\d{1,3}";
const HALL = "[A-Za-z]{0,3}\\d{1,4}[A-Za-z]?";
/* «م.» / «ص.» followed by a dot is a title («م. أحمد»), never a period. */
const SUFFIX = "(الصباح|الصبح|صباحا|صباح|صبح|ص(?!\\.)|المساء|مساء|مسا|م(?!\\.)|الظهر|ظهرا|ظهر|العصر|عصرا|عصر|المغرب|مغرب|بالليل|الليل|ليلا|am|pm|a\\.m\\.?|p\\.m\\.?)";
const ATOM = `(\\d{1,2})(?:\\s*[:.]\\s*(\\d{2}))?(?:\\s*${SUFFIX}${END})?${END}`;
const JOIN = "(?:-|إلى|الى|إلي|الي|حتى|حتي|ل|to)";

const RE = {
  roomSlash: new RegExp(`${B}(${BUILDING})\\s*/\\s*(${HALL})${END}`, "gu"),
  roomHallWord: new RegExp(`${B}(?:ال)?قاع[ةه]\\s*[:#]?\\s*(${HALL})${END}`, "gu"),
  roomBuildingWord: new RegExp(`${B}(?:ال)?مبن[ىي]\\s*[:#]?\\s*(${BUILDING}|\\d{1,6})${END}`, "gu"),
  roomPair: new RegExp(`${B}(${BUILDING})\\s+([A-Za-z]{1,3}\\d{1,4}[A-Za-z]?|\\d{2,4})(?![\\p{L}\\p{N}]|\\s*[:.]\\s*\\d)`, "gu"),
  roomBuilding: new RegExp(`${B}(${BUILDING})${END}`, "gu"),
  roomHall: new RegExp(`${B}([A-Za-z]{1,3}\\d{1,4}[A-Za-z]?)${END}`, "gu"),
  section: new RegExp(`${B}(?:(?:ال)?شعب[ةه]|ش|#)\\s*[.:#-]?\\s*(\\d{1,4})${END}`, "gu"),
  timeRange: new RegExp(`${B}(?:من\\s*)?${ATOM}\\s*${JOIN}\\s*${ATOM}`, "giu"),
  timeClock: new RegExp(`${B}(?:(?:ال)?ساع[ةه]\\s*|من\\s*|س\\s*)?(\\d{1,2})\\s*[:.]\\s*(\\d{2})(?:\\s*${SUFFIX}${END})?${END}`, "giu"),
  timeSuffix: new RegExp(`${B}(?:(?:ال)?ساع[ةه]\\s*|من\\s*)?(\\d{1,2})\\s*${SUFFIX}${END}`, "giu"),
  timeWord: new RegExp(`${B}(?:(?:ال)?ساع[ةه]|س|من)\\s*(\\d{1,2})(?:\\s*${SUFFIX}${END})?${END}`, "giu"),
  /* «8 ونص» «9 وربع» «10 ونص صباحا» */
  timeFraction: new RegExp(`${B}(?:(?:ال)?ساع[ةه]\\s*|من\\s*)?(\\d{1,2})\\s*(?:و\\s*)?(نص|نصف|ربع|ثلث)(?:\\s*${SUFFIX}${END})?${END}`, "giu"),
  /* «9 الا ربع» = 08:45 */
  timeToQuarter: new RegExp(`${B}(?:(?:ال)?ساع[ةه]\\s*|من\\s*)?(\\d{1,2})\\s*(?:إلا|الا|إلى|الى)\\s*(ربع|ثلث|خمس)(?:\\s*${SUFFIX}${END})?${END}`, "giu"),
  /* a clock-shaped thing that is not a clock: said whole, never split into hour + section */
  badClock: new RegExp(`${B}(\\d{1,2}\\s*:\\s*\\d{1,2}|\\d{2}\\s*\\.\\s*\\d{2})${END}`, "gu"),
};

/** A cut: what was read leaves the line, and nothing is read across the gap. */
const BREAK = " \u0001 ";

function cutAll(line: string, pattern: RegExp, accept: (match: RegExpExecArray) => boolean): string {
  let out = "", last = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) {
    if (!match[0].length) { pattern.lastIndex += 1; continue; }
    if (!accept(match)) continue;
    out += line.slice(last, match.index) + (match[1] ?? "") + BREAK;
    last = match.index + match[0].length;
  }
  return out + line.slice(last);
}

type Meridiem = "am" | "pm" | "noon" | "";
const meridiemOf = (suffix: string | undefined): Meridiem => {
  const value = String(suffix || "").toLowerCase();
  if (!value) return "";
  if (/^(ص|الصباح|الصبح|صباح|صباحا|صبح|am|a\.m\.?)$/.test(value)) return "am";
  if (/^(الظهر|ظهر|ظهرا)$/.test(value)) return "noon";
  return "pm";
};
/** «8» is the morning, «2» and «7» the afternoon (clockInput's one rule), «8 م» the evening; the minutes must exist. */
function clockOf(hourText: string, minuteText: string | undefined, meridiem: Meridiem): string | null {
  const hour = Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  let h = hour;
  if (meridiem === "pm") { if (h < 12) h += 12; }
  else if (meridiem === "noon") { if (h < 10) h += 12; }
  else if (meridiem === "am") { if (h === 12) h = 0; }
  else h = afternoonHour(h, hourText.length === 2 && hourText.startsWith("0"));
  if (h > 23) return null;
  return `${pad(h)}:${pad(minute)}`;
}
const typedClock = (hour: string, minute: string | undefined, suffix: string | undefined) =>
  `${hour}${minute === undefined ? "" : `:${minute}`}${suffix ? ` ${suffix}` : ""}`;

/* ── Tokens of what is left ───────────────────────────────────────────────── */

type Token = {
  raw: string;
  word: string;
  segment: number;
  used: boolean;
  /** Read as the teacher's name: it follows a title and names someone. */
  teacher?: boolean;
};

const isNumber = (token: Token) => /^\d+$/.test(token.word);
const isWord = (token: Token) => /\p{L}/u.test(token.word) && !isNumber(token);

function tokensOf(line: string): Token[] {
  const tokens: Token[] = [];
  line.split("\u0001").forEach((segment, index) => {
    segment
      .replace(/\.(?=\p{L})/gu, ". ")
      .split(/[^\p{L}\p{N}.#]+/u)
      .forEach(raw => {
        const bare = raw.replace(/^[.#]+|[.#]+$/g, "");
        if (!bare) return;
        const word = fold(bare.replace(/[.#]/g, "")).replace(/\s+/g, "");
        if (!word) return;
        tokens.push({ raw: raw.replace(/^#+/, ""), word, segment: index, used: false });
      });
  });
  return tokens;
}

/* ── Names, folded once per object ────────────────────────────────────────── */

type NameIndex = { words: string[]; joined: string[] };
const courseIndex = new WeakMap<object, NameIndex>();
const teacherIndex = new WeakMap<object, NameIndex>();
function indexOf(cache: WeakMap<object, NameIndex>, owner: object, name: string, clean: boolean): NameIndex {
  let entry = cache.get(owner);
  if (!entry) {
    const words = (clean ? instructorCleanName(name) : fold(name)).split(" ").filter(Boolean);
    entry = { words, joined: words.slice(1).map((word, i) => words[i] + word) };
    cache.set(owner, entry);
  }
  return entry;
}

/** 2 a whole word, 1 the start of one, 0 nothing. */
function wordMatch(token: string, word: string, prefixFrom: number): number {
  if (token === word || withoutAl(token) === withoutAl(word)) return 2;
  if (token.length >= prefixFrom && (word.startsWith(token) || withoutAl(word).startsWith(withoutAl(token)))) return 1;
  return 0;
}

/** How a typed name word meets a person's name — «عبدالرحمن» meets «عبد الرحمن». */
function teacherScore(token: string, index: NameIndex): number {
  let best = 0;
  for (const word of index.words.concat(index.joined)) {
    best = Math.max(best, wordMatch(token, word, 2));
    if (best === 2) break;
  }
  return best;
}

/** The best alignment of a run of tokens inside one course name: 2 every word whole, 1 some only begun, 0 none. */
function runScore(run: Token[], words: string[]): number {
  let best = 0;
  for (let at = 0; at + run.length <= words.length && best < 2; at += 1) {
    let worst = 2;
    for (let i = 0; i < run.length && worst; i += 1) {
      worst = Math.min(worst, isNumber(run[i]) ? (run[i].word === words[at + i] ? 2 : 0) : wordMatch(run[i].word, words[at + i], 3));
    }
    best = Math.max(best, worst);
  }
  return best;
}

/* ── Spoken number words (Kuwaiti dialect and standard), read only where an hour is meant ── */

const NUMBER_WORDS = new Map<string, number>([
  [["واحدة", "واحد", "وحدة", "وحده"], 1], [["ثنتين", "اثنتين", "ثنتان", "اثنتان", "ثنتي"], 2], [["ثلاثة", "ثلاث", "تلاث", "تلاثة"], 3],
  [["أربعة", "اربع", "أربع", "اربعه"], 4], [["خمسة", "خمس", "خمسه"], 5], [["ستة", "ست", "سته"], 6], [["سبعة", "سبع", "سبعه"], 7],
  [["ثمانية", "ثماني", "ثمان", "ثمنية", "ثمانيه"], 8], [["تسعة", "تسع", "تسعه"], 9], [["عشرة", "عشر", "عشره"], 10],
  [["حداشر", "احداشر", "احدعش", "إحدعش", "حدعش"], 11], [["ثناشر", "طناشر", "اثنعش", "اثناشر"], 12],
].flatMap(([words, value]) => (words as string[]).map(word => [fold(word), value as number] as [string, number])));
const TWO_WORD_NUMBERS = new Map<string, number>([["احدي عشر", 11], ["احد عشر", 11], ["اثنا عشر", 12], ["اثني عشر", 12], ["اثني عشر", 12], ["اثنيعشر", 12]].map(([w, n]) => [fold(String(w)), Number(n)] as [string, number]));
const HOUR_LEAD = new Set(["ساعه", "الساعه", "س", "من", "الي", "الى", "حتي", "حتى"].map(fold));
const HOUR_TAIL = /^(?:و?نص|و?نصف|و?ربع|و?ثلث|الا|ص|م|صباحا|مساء|ظهرا|عصرا|الصبح|الصباح|العصر|الظهر|المغرب|الليل|بالليل)$/;
const FRACTION_WORD = /^(?:نص|نصف|ربع|ثلث)$/;

/** «الساعة ثنتين» → «الساعة 2»; «ثلاثة العصر» → «3 العصر». A number word elsewhere is left alone. */
function spokenNumbers(line: string): string {
  const words = line.split(" ");
  const folded = words.map(word => fold(word));
  const out: string[] = [];
  for (let at = 0; at < words.length; at += 1) {
    const prev = at ? folded[at - 1] : "";
    const tailAt = (index: number) => HOUR_TAIL.test(folded[index] ?? "") || (folded[index] === "و" && FRACTION_WORD.test(folded[index + 1] ?? ""));
    const pair = at + 1 < words.length ? TWO_WORD_NUMBERS.get(`${folded[at]} ${folded[at + 1]}`) : undefined;
    if (pair !== undefined && (HOUR_LEAD.has(prev) || tailAt(at + 2))) { out.push(String(pair)); at += 1; continue; }
    const value = NUMBER_WORDS.get(folded[at]);
    const strict = folded[at] === fold("اثنين");
    if (value !== undefined && (HOUR_LEAD.has(prev) || tailAt(at + 1)) && !(strict && !HOUR_LEAD.has(prev))) { out.push(String(value)); continue; }
    if (strict && (prev === fold("الساعة") || prev === fold("ساعة") || prev === "س")) { out.push("2"); continue; }
    out.push(words[at]);
  }
  return out.join(" ");
}

/* ── The reading ──────────────────────────────────────────────────────────── */

export function parseOneLineAppointment(text: string, ctx: OneLineContext): OneLineReading {
  const reading: OneLineReading = { seed: {}, parts: {}, unknown: [], ambiguous: {}, notes: [] };
  const normalized = normalizeOneLine(text);
  if (!normalized) return reading;
  const { seed, parts, unknown, ambiguous } = reading;
  const notes = reading.notes!;
  const clockShape = /^\d{1,2}:\d{2}$/;
  const window = ctx.window && clockShape.test(ctx.window.start) && clockShape.test(ctx.window.end) ? ctx.window : undefined;
  let line = ` ${spokenNumbers(normalized)} `;

  /* 1 — the room. */
  let building = "", hall = "";
  const takeBuilding = (value: string) => { if (building) return false; building = value.toUpperCase(); return true; };
  const takeHall = (value: string) => { if (hall) return false; hall = value.toUpperCase(); return true; };
  const takePair = (match: RegExpExecArray) => {
    if (building || hall) return false;
    takeBuilding(match[2]);
    takeHall(match[3]);
    return true;
  };
  line = cutAll(line, RE.roomSlash, takePair);
  line = cutAll(line, RE.roomHallWord, match => takeHall(match[2]));
  line = cutAll(line, RE.roomBuildingWord, match => takeBuilding(match[2]));
  line = cutAll(line, RE.roomPair, takePair);
  line = cutAll(line, RE.roomBuilding, match => takeBuilding(match[2]));
  line = cutAll(line, RE.roomHall, match => takeHall(match[2]));
  if (building) seed.roomCode = building;
  if (hall) seed.roomHall = hall;
  if (building || hall) parts.room = building && hall ? `${building}/${hall}` : building || hall;

  /* 2 — the section, when it is said to be one. */
  line = cutAll(line, RE.section, match => {
    if (seed.sectionCode) return false;
    seed.sectionCode = match[2];
    return true;
  });

  /* 3 — the time. One reading only; one outside the department's day is said back, not bent. */
  let timeRead = false;
  const placeTime = (start: string, end: string | null, typed: string) => {
    timeRead = true;
    const fits = !window || (minutesOf(start) >= minutesOf(window.start) && minutesOf(start) < minutesOf(window.end)
      && (!end || minutesOf(end) <= minutesOf(window.end)));
    if (!fits) { unknown.push(typed.trim()); return; }
    seed.start = start;
    if (end) seed.end = end;
  };
  line = cutAll(line, RE.timeRange, match => {
    if (timeRead) return false;
    const endMeridiem = meridiemOf(match[7]);
    const end = clockOf(match[5], match[6], endMeridiem);
    /* «1-2:15 م»: a suffix after the range speaks for both ends — unless that puts the start after the end («11-1 م»). */
    let start = clockOf(match[2], match[3], meridiemOf(match[4]) || endMeridiem);
    if (!match[4] && endMeridiem && start && end && minutesOf(start) >= minutesOf(end)) start = clockOf(match[2], match[3], "");
    if (!start) return false;
    /* «6-8»: a start read as afternoon (1–7) pulls an unmarked end after it («8» = 20:00), as «6-7:20» is 18:00–19:20. */
    let finalEnd = end;
    if (start && minutesOf(start) >= 13 * 60 && !match[7] && (!end || minutesOf(end) <= minutesOf(start))) {
      const later = clockOf(match[5], match[6], "pm");
      if (later && minutesOf(later) > minutesOf(start)) finalEnd = later;
    }
    if (finalEnd && minutesOf(finalEnd) > minutesOf(start)) {
      placeTime(start, finalEnd, match[0].slice((match[1] ?? "").length));
    } else {
      /* An end that does not follow the start is not an end: the start stands, the rest is said back. */
      placeTime(start, null, typedClock(match[2], match[3], match[4]));
      unknown.push(typedClock(match[5], match[6], match[7]));
    }
    return true;
  });
  const single = (hourAt: number, minuteAt: number | null, suffixAt: number | null, shift = 0) => (match: RegExpExecArray) => {
    let clock = clockOf(match[hourAt], minuteAt === null ? undefined : match[minuteAt], suffixAt === null ? "" : meridiemOf(match[suffixAt]));
    if (!clock) return false;
    if (shift) { const moved = minutesOf(clock) + shift; if (moved < 0 || moved >= 24 * 60) return false; clock = `${pad(Math.floor(moved / 60))}:${pad(moved % 60)}`; }
    const typed = match[0].slice((match[1] ?? "").length);
    /* A second clock after a first («8:00 9:20») is the end. */
    if (timeRead) {
      if (!seed.start || seed.end || minutesOf(clock) <= minutesOf(seed.start)) return false;
      if (window && minutesOf(clock) > minutesOf(window.end)) { unknown.push(typed.trim()); return true; }
      seed.end = clock;
      return true;
    }
    placeTime(clock, null, typed);
    return true;
  };
  const fractionMinutes: Record<string, number> = { "نص": 30, "نصف": 30, "ربع": 15, "ثلث": 20 };
  const toMinutes: Record<string, number> = { "ربع": -15, "ثلث": -20, "خمس": -12 };
  const fraction = (match: RegExpExecArray) => {
    if (timeRead) return false;
    const start = clockOf(match[2], undefined, meridiemOf(match[4]));
    if (!start) return false;
    const minutes = minutesOf(start) + fractionMinutes[match[3]];
    placeTime(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`, null, match[0].slice((match[1] ?? "").length));
    return true;
  };
  line = cutAll(line, RE.timeFraction, fraction);
  line = cutAll(line, RE.timeToQuarter, ((match: RegExpExecArray) => {
    if (timeRead) return false;
    const base = clockOf(match[2], undefined, meridiemOf(match[4]));
    if (!base) return false;
    const minutes = minutesOf(base) + toMinutes[match[3]];
    if (minutes < 0) return false;
    placeTime(`${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`, null, match[0].slice((match[1] ?? "").length));
    return true;
  }));
  line = cutAll(line, RE.timeClock, single(2, 3, 4));
  line = cutAll(line, RE.timeSuffix, single(2, null, 3));
  line = cutAll(line, RE.timeWord, single(2, null, 3));
  /* «14:60» «24:00» «8:5»: said whole as not understood — their digits never become a section or an hour. */
  line = cutAll(line, RE.badClock, match => { unknown.push(match[2].replace(/\s+/g, "")); return true; });

  const tokens = tokensOf(line);
  const free = (token: Token) => !token.used;
  const people = ctx.instructors.map(person => ({ person, index: indexOf(teacherIndex, person, person.AdInstructorName, true) }));
  const matchesOf = (word: string) => {
    const found = new Map<number, number>();
    if (word.length < 2) return found;
    for (const { person, index } of people) {
      const score = teacherScore(word, index);
      if (score) found.set(Number(person.AdInstructorId), score);
    }
    return found;
  };

  /* 4 — a title, and the name that follows it: the words after «د.» that keep naming someone.
     Read before the days, so «د. خميس» is a colleague and not Thursday. */
  tokens.forEach((token, at) => {
    if (!free(token) || !TITLES.has(token.word)) return;
    token.used = true;
    let pool: Set<number> | null = null;
    for (let next = at + 1; next < tokens.length && next <= at + 4; next += 1) {
      const candidate = tokens[next];
      if (!free(candidate) || candidate.segment !== token.segment || !isWord(candidate) || TITLES.has(candidate.word)) break;
      const narrowed: Set<number> = new Set([...matchesOf(candidate.word).keys()].filter(id => !pool || pool.has(id)));
      if (!narrowed.size) break;
      pool = narrowed;
      candidate.teacher = true;
    }
  });
  const open = (token: Token) => free(token) && !token.teacher;

  /* 5 — a course code: six or seven digits, leading zeros or not. */
  const settleCourse = (found: OneLineCourse[]) => {
    const distinct = [...new Map(found.map(course => [Number(course.AdCourseId), course])).values()];
    if (distinct.length === 1) {
      seed.courseId = Number(distinct[0].AdCourseId);
      parts.course = String(distinct[0].CourseName || distinct[0].CourseCode);
      return;
    }
    const names = distinct.map(course => String(course.CourseName));
    const twins = new Set(names).size < names.length;
    ambiguous.course = distinct.map(course => (twins ? `${course.CourseName} · ${course.CourseCode}` : String(course.CourseName)));
  };
  let coded: OneLineCourse[] = [];
  const codeToken = tokens.find(token => open(token) && /^\d{6,7}$/.test(token.word));
  if (codeToken) {
    codeToken.used = true;
    const wanted = digitsOnly(codeToken.word);
    coded = ctx.courses.filter(course => digitsOnly(course.CourseCode) === wanted);
    if (!coded.length) unknown.push(codeToken.raw);
  }

  /* 6 — the days: names, «و» and commas between them, and the timetable's letters. */
  const days = new Set<DayKey>();
  for (const token of tokens) {
    if (!open(token)) continue;
    const word = token.word;
    const named = DAY_WORDS.get(word) || (word.startsWith("و") ? DAY_WORDS.get(word.slice(1)) : undefined);
    if (named) { days.add(named); token.used = true; continue; }
    const rest = NON_TEACHING.get(word) || (word.startsWith("و") ? NON_TEACHING.get(word.slice(1)) : undefined);
    if (rest) {
      token.used = true;
      unknown.push(token.raw);
      notes.push(`${rest} ليس يوم دوام: الدوام من الأحد إلى الخميس`);
      continue;
    }
    /* «ر.» is an initial, not Wednesday: the letters are written bare. */
    if (token.raw.endsWith(".")) continue;
    const letters = [...word];
    if (letters.length <= 3 && new Set(letters).size === letters.length && letters.every(letter => DAY_LETTERS.has(letter))) {
      letters.forEach(letter => days.add(DAY_LETTERS.get(letter)!));
      token.used = true;
    }
  }
  if (days.size) {
    seed.days = DAY_KEYS.filter(key => days.has(key));
    parts.days = seed.days.map(key => DAY_NAMES[DAY_KEYS.indexOf(key)]).join(" · ");
  }

  /* 7 — a course by name: the longest run of words that course names hold. After
     a code, the same search runs over the coded course(s) only — the name copied
     beside the code confirms it (and is not «not understood»), and a code shared
     by two courses is narrowed by it. */
  const pool = coded.length ? coded : ctx.courses;
  let byName: OneLineCourse[] = [];
  if (pool.length) {
    const named = pool.map(course => ({ course, words: indexOf(courseIndex, course, course.CourseName, false).words }));
    let best: { from: number; length: number; quality: number; scored: Array<{ course: OneLineCourse; score: number; exact: boolean }> } | null = null;
    for (let from = 0; from < tokens.length; from += 1) {
      const first = tokens[from];
      if (!open(first) || !isWord(first) || FILLERS.has(first.word)) continue;
      for (let length = Math.min(6, tokens.length - from); length >= 1; length -= 1) {
        if (best && length < best.length) break;
        const run = tokens.slice(from, from + length);
        if (!run.every(token => open(token) && token.segment === first.segment) || FILLERS.has(run[run.length - 1].word)) continue;
        if (run.reduce((sum, token) => sum + token.word.length, 0) < 2) continue;
        const scored = named
          .map(({ course, words }) => ({ course, score: runScore(run, words), exact: false, words }))
          .filter(entry => entry.score)
          .map(entry => ({ course: entry.course, score: entry.score, exact: entry.score === 2 && run.length === entry.words.length }));
        if (!scored.length) continue;
        const quality = Math.max(...scored.map(entry => entry.score));
        /* One word that names a colleague whole and a course only by its start is the colleague. */
        if (length === 1 && quality < 2 && [...matchesOf(first.word).values()].includes(2)) continue;
        if (!best || length > best.length || quality > best.quality) best = { from, length, quality, scored };
        break;
      }
    }
    if (best) {
      tokens.slice(best.from, best.from + best.length).forEach(token => { token.used = true; });
      const exact = best.scored.filter(entry => entry.exact);
      const whole = best.scored.filter(entry => entry.score === 2);
      byName = (exact.length ? exact : whole.length ? whole : best.scored).map(entry => entry.course);
    }
  }
  if (coded.length || byName.length) settleCourse(byName.length ? byName : coded);

  /* 8 — the teacher: the name after a title if there is one, otherwise the words left. */
  const named = tokens.filter(token => token.teacher && free(token));
  const words = named.length ? named : tokens.filter(token => open(token) && isWord(token) && !FILLERS.has(token.word) && token.word.length >= 2);
  const sets = words.map(token => ({ token, found: matchesOf(token.word) })).filter(entry => entry.found.size);
  if (sets.length) {
    sets.forEach(entry => { entry.token.used = true; });
    let pool = [...sets[0].found.keys()].filter(id => sets.every(entry => entry.found.has(id)));
    /* Two words that name two different people: neither is chosen, both are shown. */
    if (!pool.length) pool = [...new Set(sets.flatMap(entry => [...entry.found.keys()]))];
    const whole = pool.filter(id => sets.every(entry => !entry.found.has(id) || entry.found.get(id) === 2));
    const chosen = new Set(whole.length ? whole : pool);
    const matched = ctx.instructors.filter(person => chosen.has(Number(person.AdInstructorId)));
    if (matched.length === 1) {
      seed.instructorId = Number(matched[0].AdInstructorId);
      parts.teacher = String(matched[0].AdInstructorName || "");
    } else if (matched.length > 1) {
      ambiguous.teacher = matched.map(person => String(person.AdInstructorName));
    }
  }

  /* 9 — a bare number: a lone hour, then a lone section. */
  const numbers = tokens.filter(token => free(token) && isNumber(token));
  if (!timeRead) {
    const hourLike = (token: Token) => {
      const value = Number(token.word);
      if (token.word.length === 1) return value >= 1;
      return token.word.length === 2 && value <= 23 && (token.word[0] !== "0" || value >= 7);
    };
    /* «0800» «1400» «930»-shaped: read by clockInput's rule, like the editor's time box. A 3-digit number is a
       time only in the unmistakable «8xx/9xx» shapes (800, 815, 830, 845, 930...) — «503» stays a section. */
    const compact = numbers.find(token => /^\d{4}$/.test(token.word) || /^[89](?:00|15|30|45)$/.test(token.word));
    const compactClock = compact ? parseTypedClock(compact.word).clock : "";
    if (compact && compactClock) { compact.used = true; placeTime(compactClock, null, compact.raw); }
    else {
      const hour = numbers.find(token => token.word.length === 1 && hourLike(token)) || numbers.find(hourLike);
      const start = hour ? clockOf(hour.word, undefined, "") : null;
      if (hour && start) { hour.used = true; placeTime(start, null, hour.raw); }
    }
  }
  if (!seed.sectionCode) {
    const section = numbers.find(token => free(token) && /^\d{2,3}$/.test(token.word));
    if (section) { section.used = true; seed.sectionCode = section.word; }
  }
  if (seed.sectionCode) parts.section = seed.sectionCode;
  if (seed.start) parts.time = seed.end ? `${seed.start} – ${seed.end}` : seed.start;

  /* 10 — what is left is said back. */
  tokens.forEach(token => {
    if (token.used || FILLERS.has(token.word)) return;
    unknown.push(token.raw);
  });
  if (!notes.length) delete reading.notes;
  return reading;
}

/* ── Using the reading ────────────────────────────────────────────────────── */

/** How many of the six parts the line gave (an ambiguous course or teacher counts: it was named). */
export function oneLineStrength(reading: OneLineReading): number {
  const { parts, ambiguous } = reading;
  return [
    parts.course || ambiguous.course?.length,
    parts.section,
    parts.teacher || ambiguous.teacher?.length,
    parts.days,
    parts.time,
    parts.room,
  ].filter(Boolean).length;
}

/**
 * Offer «أنشئ هذا الموعد»? Two parts are a line. One part is a line only when
 * the words name no listed command — «حفظ» must still reach «حفظ العرض الحالي»
 * even in a department where someone is called «حفظي».
 */
export function offerOneLine(reading: OneLineReading, listed: number): boolean {
  const strength = oneLineStrength(reading);
  return strength >= 2 || (strength === 1 && listed === 0);
}

/**
 * The editor's seed (Schedules' CreateSeed). A course with no section typed
 * takes the next free section, exactly as choosing the course in the editor
 * does; the first day travels as `day` so a start with no end gets that day's
 * lecture length until the course pattern completes it.
 */
export function oneLineCreateSeed(reading: OneLineReading, suggestedSection = "") {
  const { seed } = reading;
  const out: { courseId?: number; sectionCode?: string; instructorId?: number; days?: DayKey[]; day?: DayKey; start?: string; end?: string } = {};
  if (seed.courseId) out.courseId = seed.courseId;
  const section = seed.sectionCode || (seed.courseId ? String(suggestedSection || "") : "");
  if (section) out.sectionCode = section;
  if (seed.instructorId) out.instructorId = seed.instructorId;
  if (seed.days?.length) { out.days = [...seed.days]; out.day = seed.days[0]; }
  if (seed.start) out.start = seed.start;
  if (seed.start && seed.end) out.end = seed.end;
  return out;
}

export type OneLinePlace = {
  buildingId: string;
  AdRoomCode: string;
  roomId?: string;
  AdRoomHall: string;
  locationStatus?: "VERIFIED";
};

/**
 * The typed room, as the official record the editor's picker would offer.
 *
 * «لا كتابة يدوية للقاعة»: a room is booked only from the department's list,
 * so the line never writes a raw string into the form. The building must
 * resolve uniquely in the registry the picker reads; the hall must be one the
 * picker lists for this department (its own, shared, or an approved
 * borrowing) and bookable on its own. A building without its hall is still
 * half the answer, and is returned as such.
 */
export function oneLinePlace(
  payload: { buildings?: LocationRegistry["buildings"]; rooms?: LocationRegistry["rooms"]; borrowedRoomIds?: unknown[] } | null | undefined,
  roomCode: string | undefined,
  roomHall: string | undefined,
  context: { collegeId: number; sectionId: number },
): { place: OneLinePlace; hallFound: boolean } | null {
  const code = normalizeLocationToken(roomCode);
  const hallToken = normalizeLocationToken(roomHall);
  if (!payload || (!code && !hallToken)) return null;
  const registry: LocationRegistry = {
    buildings: (payload.buildings || []).map(item => ({ ...item, aliases: item.aliases || [], collegeIds: item.collegeIds || [], sectionIds: item.sectionIds || [], evidence: item.evidence || [] })),
    rooms: (payload.rooms || []).map(item => ({ ...item, aliases: item.aliases || [], collegeIds: item.collegeIds || [], sectionIds: item.sectionIds || [], evidence: item.evidence || [] })),
  };
  const building = code
    ? resolveBuilding(registry, code, context).value
    : resolveBuildingFromUniqueRoom(registry, hallToken).value;
  if (!building) return null;
  const base: OneLinePlace = { buildingId: building.id, AdRoomCode: building.officialCode, roomId: undefined, AdRoomHall: "" };
  if (!hallToken) return { place: base, hallFound: false };
  const groups = roomGroups(registry, building.id, context.sectionId);
  const borrowed = new Set((payload.borrowedRoomIds || []).map(String));
  const offered = [...groups.own, ...groups.shared, ...registry.rooms.filter(room => room.buildingId === building.id && borrowed.has(String(room.id)))]
    .filter(room => !room.bookingPolicy || room.bookingPolicy === "normal");
  const shape = canonicalRoomShape(hallToken);
  const halls = [...new Map(offered
    .filter(room => normalizeLocationToken(room.canonicalCode) === hallToken
      || room.aliases.some(alias => normalizeLocationToken(alias.value) === hallToken)
      || Boolean(shape && canonicalRoomShape(room.canonicalCode) === shape))
    .map(room => [room.id, room])).values()];
  if (halls.length !== 1) return { place: base, hallFound: false };
  return { place: { ...base, roomId: halls[0].id, AdRoomHall: halls[0].canonicalCode, locationStatus: "VERIFIED" }, hallFound: true };
}
