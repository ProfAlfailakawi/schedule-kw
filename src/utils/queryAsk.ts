/**
 * ── السؤال المكتوب في مركز الاستعلام: من الجملة إلى المرشّحات ─────────────────
 *
 * `parseNaturalQuery` يفهم اليوم والساعة ونوع السؤال. وهذه الطبقة تربط ما فهمه
 * ببيانات الشاشة نفسها: أيُّ أستاذ، وأيُّ مقرر (باسمه أو برقمه)، وأيُّ قاعة
 * (7/31 أو 901A01-101). ولها ثلاثة أجوبة لا رابع لها:
 *
 *  - «ok»     فُهم السؤال كله: مرشّحاتٌ وعدسة.
 *  - «choose» الاسم يطابق أكثر من واحد: «هل تقصد؟» بخياراتٍ يضغطها القارئ.
 *  - «unknown» لم يُفهم شيء: لا يتغيّر شيءٌ على الشاشة، وتُقال جملةٌ تشرح ما يُكتب.
 *
 * حتميةٌ بالكامل وعلى الجهاز نفسه: لا يُرسل شيء، والسؤال نفسه يعطي الجواب نفسه.
 */
import { DAY_LABELS, parseNaturalQuery, toEnglishDigits } from "./naturalQuery";

export type AskLens = "list" | "week" | "instructor" | "room" | "time";

export interface AskPatch {
  day?: number;
  startTime?: string;
  endTime?: string;
  building?: string;
  hall?: string;
  instructorId?: number;
  courseId?: number;
  courseCode?: string;
}

export interface AskOption { label: string; patch: AskPatch; lens: AskLens }

export type AskAnswer =
  | { kind: "ok"; patch: AskPatch; lens: AskLens; said: string[]; freeRooms: boolean; roomDay: number | "week" | null }
  | { kind: "choose"; question: string; options: AskOption[]; said: string[] }
  | { kind: "unknown"; hint: string };

export interface AskContext {
  instructors: ReadonlyArray<{ id: number; name: string }>;
  courses: ReadonlyArray<{ id: number; name: string; codes: string[] }>;
  buildings: ReadonlyArray<{ id: string; code: string }>;
  rooms: ReadonlyArray<{ id: string; code: string; buildingId: string }>;
}

export const ASK_HINT = "لم أفهم السؤال — جرّب: قاعات فارغة الثلاثاء 10، أو «جدول أحمد» أو «0109101» أو «7/31»";
const MAX_OPTIONS = 6;

/** حروفٌ تتبدّل في الكتابة ولا يتغيّر بها المعنى: الهمزات والتاء المربوطة والألف المقصورة والتشكيل. */
export function askNormalize(value: unknown): string {
  return toEnglishDigits(String(value ?? ""))
    .normalize("NFKC")
    .replace(/[ً-ْـ​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/* كلماتٌ تحمل نوع السؤال لا موضوعه، فتُنزع قبل البحث عن اسمٍ أو مقرر. */
const FILLER = new Set([
  "جدول", "مواعيد", "موعد", "محاضرات", "محاضره", "حصص", "حصه", "نصاب", "فراغات", "فراغ", "فجوات", "فجوه",
  "عند", "في", "يوم", "الساعه", "ساعه", "من", "الى", "الي", "متى", "وين", "اين", "كم", "هل", "شو", "ما", "ماهي",
  "قاعه", "قاعات", "غرفه", "غرف", "فاضيه", "فاضي", "فارغه", "فارغ", "متاحه", "متاح", "شاغره", "شاغر",
  "د", "د.", "ا.د", "ا.د.", "دكتور", "الدكتور", "دكتوره", "الدكتوره", "استاذ", "الاستاذ", "استاذه", "الاستاذه",
  "مقرر", "المقرر", "ماده", "الماده", "شعبه", "الشعبه", "ص", "م", "صباحا", "مساء", "مساءا", "عصرا", "الصبح",
  "اليوم", "الان", "الحين",
]);
const DAY_WORD = /^(?:ال)?(?:احد|اثنين|ثلاثاء|اربعاء|خميس)$/;

/** ما يبقى من الجملة بعد نزع الأيام والأرقام وكلمات السؤال: هو الاسم المقصود إن وُجد. */
export function askSubject(text: string): string {
  return askNormalize(text)
    .replace(/[0-9:\/\-‑–.,،؟?!]+/g, " ")
    .split(" ")
    .filter(word => word && !FILLER.has(word) && !DAY_WORD.test(word) && !/^[a-z]{1,3}$/.test(word))
    .join(" ")
    .trim();
}

const ROOM_TOKEN = /([0-9a-z؀-ۿ]{1,8})\s*[\/\-‑–]\s*([0-9a-z]{1,6})/i;
const COURSE_NUMBER = /(?:^|\D)(\d{7}|\d{3})(?:\D|$)/;

/** يحوّل الجملة إلى جواب، من بيانات الشاشة وحدها. */
export function resolveAsk(text: string, context: AskContext): AskAnswer {
  const raw = String(text || "").trim();
  if (!raw) return { kind: "unknown", hint: ASK_HINT };
  const question = parseNaturalQuery(raw);
  const plain = askNormalize(raw);
  const patch: AskPatch = {};
  const said: string[] = [];

  if (question.day !== null) { patch.day = question.day; said.push(DAY_LABELS[question.day]); }

  /* ── القاعة: «7/31» أو «901A01-101»، من السجل الرسمي وحده ── */
  let roomFound = false;
  const roomMatch = plain.match(ROOM_TOKEN);
  if (roomMatch) {
    const [, code, hall] = roomMatch;
    const building = context.buildings.find(item => askNormalize(item.code) === askNormalize(code));
    const room = building ? context.rooms.find(item => item.buildingId === building.id && askNormalize(item.code) === askNormalize(hall)) : undefined;
    if (building) {
      patch.building = building.id;
      if (room) patch.hall = room.id;
      said.push(room ? `${building.code}/${room.code}` : `المبنى ${building.code}`);
      roomFound = true;
    }
  }

  /* ── رقم المقرر: سبع خانات أو ثلاث، ولا يُقرأ ساعةً ── */
  let codeFound = false;
  const withoutRoom = roomMatch ? plain.replace(roomMatch[0], " ") : plain;
  const numberMatch = withoutRoom.match(COURSE_NUMBER);
  if (numberMatch) {
    const code = numberMatch[1];
    const course = context.courses.find(item => item.codes.some(value => askNormalize(value) === code));
    if (course) { patch.courseCode = code; said.push(`المقرر ${code}`); codeFound = true; }
  }

  /* ── الاسم: أستاذٌ أولاً، ثم مقرر ──
     يُقارن الاسم بعد نزع الكلمات نفسها من الطرفين («في»، «د.»…)، فـ«مقدمة في التعلم»
     يطابق المقرر كما كُتب. ورقمٌ في الجملة يطابق رقماً في الاسم («تجريبي 9») يحسم
     بين المتشابهين، ولا يُقرأ عندها ساعة. */
  const subject = askSubject(raw);
  const wantsFreeRooms = question.intent === "freeRooms";
  let nameLens: AskLens | null = null;
  let numberUsedByName = false;
  if (subject && subject.length >= 2 && !wantsFreeRooms) {
    const numbers = (withoutRoom.match(/\d+/g) || []).filter(value => value.length <= 3);
    let people = context.instructors.filter(person => askSubject(person.name).includes(subject));
    if (people.length > 1 && numbers.length) {
      const narrowed = people.filter(person => numbers.some(value => new RegExp(`(^|\\s)${value}(\\s|$)`).test(askNormalize(person.name))));
      if (narrowed.length) { people = narrowed; numberUsedByName = true; }
    }
    const courses = uniqueBy(context.courses.filter(course => askSubject(course.name).includes(subject)), course => askNormalize(course.name));
    const exactCourse = courses.find(course => askSubject(course.name) === subject);
    if (people.length === 1 && !exactCourse) {
      patch.instructorId = people[0].id; said.push(people[0].name); nameLens = "instructor";
    } else if (exactCourse || (courses.length === 1 && !people.length)) {
      const course = exactCourse || courses[0];
      patch.courseId = course.id; said.push(course.name); nameLens = "list";
    } else if (people.length + courses.length > 1) {
      const lensFor = (fallback: AskLens): AskLens => (question.intent === "gaps" ? "week" : fallback);
      const options: AskOption[] = [
        ...people.slice(0, MAX_OPTIONS).map(person => ({ label: person.name, patch: { ...patch, instructorId: person.id }, lens: lensFor("instructor") })),
        ...courses.slice(0, Math.max(0, MAX_OPTIONS - Math.min(people.length, MAX_OPTIONS))).map(course => ({ label: `المقرر: ${course.name}`, patch: { ...patch, courseId: course.id }, lens: lensFor("list") })),
      ];
      return { kind: "choose", question: subject, options, said };
    }
  }

  /* ── الوقت: ساعةٌ مدتها ساعة. ورقمُ مقررٍ أو رقمٌ في اسمٍ لا يُقرأ ساعة. ── */
  const time = codeFound || numberUsedByName ? null : question.time;
  if (time) {
    const [hour, minute] = time.split(":").map(Number);
    patch.startTime = time;
    patch.endTime = `${String(Math.min(23, hour + 1)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    said.push(time);
  }

  const understood = question.day !== null || Boolean(time) || roomFound || codeFound || nameLens !== null || wantsFreeRooms;
  if (!understood) return { kind: "unknown", hint: subject ? `لم أجد «${subject}» بين الأساتذة والمقررات في هذا النطاق — ${ASK_HINT.replace(/^لم أفهم السؤال — /, "")}` : ASK_HINT };

  const lens: AskLens =
    wantsFreeRooms || (roomFound && !nameLens && !codeFound) ? "room"
    : question.intent === "gaps" ? "week"
    : nameLens ? nameLens
    : codeFound ? "list"
    : time || question.day !== null ? "time"
    : "list";
  /* سؤال القاعات الفارغة عن الإتاحة لا عن مواعيد أحد: لا أستاذ فيه. */
  if (wantsFreeRooms) { delete patch.instructorId; delete patch.courseId; }
  return { kind: "ok", patch, lens, said, freeRooms: wantsFreeRooms, roomDay: wantsFreeRooms ? (question.day ?? "week") : null };
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => { const k = key(item); if (seen.has(k)) return false; seen.add(k); return true; });
}
