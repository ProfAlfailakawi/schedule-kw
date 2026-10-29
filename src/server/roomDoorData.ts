/**
 * ── بياناتُ باب القاعة: من صفوف الفصل إلى أسبوع قاعةٍ واحدة ─────────────────
 *
 * دوالُّ نقيّة لا تقرأ قاعدة البيانات: يُعطيها المسارُ صفوفَ الفصل والمقرراتِ
 * والإلغاءات والسجل، فتُخرج ما تحتاجه الصفحة — وما تحتاجه وحده.
 *
 * ما يخرج من هنا هو كلُّ ما يصل المتصفّح: رمزُ المقرر واسمُه والشعبةُ والوقت.
 * لا اسمَ أستاذ، ولا عددَ طلبة، ولا معرّفَ صفٍّ أو مقرر — الصفحةُ عامّةٌ على باب.
 *
 * والقاعةُ تُعرف بهويتها في السجل (roomIdentityKeys / roomKeyOf في
 * utils/locationRegistry): الصفُّ المربوط بمعرّفها، والصفُّ القديم الذي يحمل
 * رمزَي المبنى والقاعة نصّاً، والمرفقُ المرافق الذي يُحجز مع قاعةٍ أساسية —
 * القاعدةُ نفسها التي يقرأ بها مقترحُ القاعات الإشغال، فلا تُرى قاعةٌ فاضيةً هنا
 * وهي محجوزةٌ هناك.
 */
import type { AdCourse, AdTerm, FSchedule, MasterBuilding, MasterRoom, ScheduleWeekException } from "../types";
import { roomIdentityKeys, roomKeyOf } from "../utils/locationRegistry";
import { buildingNumberLabel, officialSiteLabel } from "../utils/locationCollegePrefixes";
import { currentTermId } from "../utils/termSequence";
import {
  DOOR_SOON_MINUTES, compareDoorRooms, doorClockAt, doorTermDates, doorWeekDates, roomFloor, toDoorMinute,
  type DoorDay, type DoorLecture, type DoorSlot, type DoorTerm,
} from "../utils/roomDoor";

const DAY_FLAGS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

/** فهرسُ الفصل الجاري: صفوفُ كل قاعة بمفتاح هويتها، والمقررات، وتواريخُ الإلغاء لكل موعد. */
export interface DoorTermIndex {
  termId: number;
  byRoom: Map<string, FSchedule[]>;
  courses: Map<number, AdCourse>;
  cancels: Map<number, Set<string>>;
}

export function buildDoorTermIndex(input: {
  termId: number;
  rows: readonly FSchedule[];
  courses: readonly AdCourse[];
  exceptions: readonly ScheduleWeekException[];
  /** يحوّل الصفَّ القديم (رمزٌ نصّي أو صيغةٌ تاريخية) إلى هويته في السجل، بنطاق كليته. */
  normalize?: (row: FSchedule) => FSchedule;
}): DoorTermIndex {
  const byRoom = new Map<string, FSchedule[]>();
  for (const raw of input.rows) {
    if (Number(raw.AdTermId) !== Number(input.termId)) continue;
    const row = input.normalize ? input.normalize(raw) : raw;
    for (const key of roomIdentityKeys(row)) {
      const list = byRoom.get(key);
      if (list) list.push(row); else byRoom.set(key, [row]);
    }
  }
  const cancels = new Map<number, Set<string>>();
  for (const entry of input.exceptions) {
    if (entry.kind !== "cancel" || Number(entry.AdTermId) !== Number(input.termId)) continue;
    const id = Number(entry.scheduleId);
    const dates = cancels.get(id) || new Set<string>();
    dates.add(String(entry.date).slice(0, 10));
    cancels.set(id, dates);
  }
  return { termId: input.termId, byRoom, courses: new Map(input.courses.map(course => [Number(course.AdCourseId), course])), cancels };
}

/** المفتاحان اللذان تُعرف بهما القاعة: معرّفُها، ونصُّ مبناها وقاعتها (للصفوف القديمة). */
export function doorRoomKeys(room: Pick<MasterRoom, "id" | "canonicalCode" | "buildingCode">, building?: Pick<MasterBuilding, "officialCode"> | null): string[] {
  return [...new Set([
    roomKeyOf(room.id, "", ""),
    roomKeyOf("", building?.officialCode || room.buildingCode, room.canonicalCode),
  ].filter(Boolean))];
}

/** صفوفُ قاعةٍ واحدة في الفصل، بلا تكرار (صفٌّ يطابق بالمعرّف وبالنص معاً يُعدّ مرّة). */
export function doorRowsForRoom(index: DoorTermIndex, room: Pick<MasterRoom, "id" | "canonicalCode" | "buildingCode">, building?: Pick<MasterBuilding, "officialCode"> | null): FSchedule[] {
  const seen = new Map<number, FSchedule>();
  for (const key of doorRoomKeys(room, building)) for (const row of index.byRoom.get(key) || []) seen.set(Number(row.id), row);
  return [...seen.values()];
}

/**
 * أسبوعُ القاعة من الأحد إلى الخميس، بتواريخ الأسبوع المعروض. شعبتان من المقرر
 * نفسه في الوقت نفسه محاضرةٌ واحدة («01 · 02»)، ولا تُعدّ ملغاةً إلا إذا أُلغيت
 * كلُّ شعبها في ذلك التاريخ.
 */
export function doorWeek(rows: readonly FSchedule[], courses: ReadonlyMap<number, AdCourse>, cancels: ReadonlyMap<number, ReadonlySet<string>>, weekDates: readonly string[]): DoorDay[] {
  return DAY_FLAGS.map((flag, wd) => {
    const date = weekDates[wd] || "";
    const merged = new Map<string, DoorLecture & { sections: Set<string>; all: number; off: number }>();
    for (const row of rows) {
      if (!row[flag]) continue;
      const s = toDoorMinute(row.fstarttime), e = toDoorMinute(row.fendtime);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
      const course = courses.get(Number(row.AdCourseId));
      const code = String(course?.CourseCode || row.CourseCodeSnapshot || "").trim();
      const title = String(row.AdCourseName || course?.CourseName || row.CourseNameSnapshot || "").trim();
      const key = `${code || title}|${s}|${e}`;
      const cancelled = Boolean(date && cancels.get(Number(row.id))?.has(date));
      const entry = merged.get(key) || { s, e, start: String(row.fstarttime).slice(0, 5), end: String(row.fendtime).slice(0, 5), code, title, sec: "", sections: new Set<string>(), all: 0, off: 0 };
      const section = String(row.SCode || "").trim();
      if (section) entry.sections.add(section);
      entry.all += 1;
      if (cancelled) entry.off += 1;
      merged.set(key, entry);
    }
    const lectures: DoorLecture[] = [...merged.values()]
      .map(({ sections, all, off, ...lecture }) => ({
        ...lecture,
        sec: [...sections].sort((a, b) => a.localeCompare(b, "en", { numeric: true })).join(" · "),
        ...(off && off === all ? { x: 1 } : {}),
      }))
      .sort((a, b) => a.s - b.s || a.e - b.e || a.code.localeCompare(b.code));
    return { wd, date, lectures };
  });
}

/** نسخةُ اللوحة من الأسبوع: الوقتُ والرمز وحدهما، لكل قاعةٍ في المبنى. */
export type DoorBoardLecture = DoorSlot & { start: string; end: string; code: string };
export const boardWeek = (week: readonly DoorDay[]): DoorDay<DoorBoardLecture>[] =>
  week.map(day => ({ wd: day.wd, date: day.date, lectures: day.lectures.map(({ s, e, start, end, code, x }) => ({ s, e, start, end, code, ...(x ? { x } : {}) })) }));

/**
 * الفصلُ الذي تتحدّث عنه الأبواب: الفصلُ الجاري تشغيلياً (currentTermId) — لا
 * فصلُ «مساري» (pickDoorTerm)، فذاك يشير في موسم التسجيل إلى الفصل القادم، والبابُ
 * يقول ما يُدرَّس فيه الآن. ومعه أقربُ بدايةِ فصلٍ قادمة، لتقولها الصفحةُ خارج الفصل.
 */
export function currentDoorTerm(terms: readonly AdTerm[], nowMs: number): { term: AdTerm | null; door: DoorTerm | null; inSession: boolean; upcoming: string } {
  const id = currentTermId(terms as any, nowMs);
  const term = terms.find(item => Number(item.AdTermId) === Number(id)) || null;
  const dates = doorTermDates(term);
  const today = doorClockAt(nowMs).date;
  let upcoming = "";
  for (const item of terms) {
    if (item.AdTermClosed === true) continue;
    const range = doorTermDates(item);
    if (range && range.start > today && (!upcoming || range.start < upcoming)) upcoming = range.start;
  }
  const door = term ? { name: String(term.AdTermName || ""), start: dates?.start || "", end: dates?.end || "" } : null;
  const inSession = Boolean(door) && (!door!.start || door!.start <= today) && (!door!.end || today <= door!.end);
  return { term, door, inSession, upcoming };
}

export interface DoorBuildingInfo { code: string; number: string; name: string; site: string }

export function doorBuildingInfo(building: MasterBuilding | undefined, fallbackCode: string): DoorBuildingInfo {
  if (!building) return { code: fallbackCode, number: "", name: "", site: "" };
  const prefix = String(building.sitePrefix || building.officialCode.slice(0, 4)).toUpperCase();
  return {
    code: building.officialCode,
    number: buildingNumberLabel(building),
    name: String(building.description || "").trim(),
    site: officialSiteLabel(prefix, building.siteName || building.branchName),
  };
}

/** ما يصل صفحةَ القاعة: هويتها، والفصل، وأسبوعُها، ورابطُ لوحة مبناها. */
export interface RoomDoorData {
  kind: "room";
  /** لحظةُ الخادم (ملّي ثانية): يضبط بها المتصفّحُ فرقَ ساعته. */
  at: number;
  build: string;
  soon: number;
  room: { code: string; floor: string; building: DoorBuildingInfo };
  term: DoorTerm | null;
  upcoming: string;
  week: DoorDay[];
  board: string;
}

export interface BoardDoorData {
  kind: "board";
  at: number;
  build: string;
  soon: number;
  building: DoorBuildingInfo;
  term: DoorTerm | null;
  upcoming: string;
  rooms: Array<{ code: string; floor: string; rank: number; href: string; week: DoorDay<DoorBoardLecture>[] }>;
}

export function roomDoorData(input: {
  room: MasterRoom; building?: MasterBuilding; index: DoorTermIndex | null; terms: readonly AdTerm[];
  nowMs: number; build: string; boardHref: string;
}): RoomDoorData {
  const term = currentDoorTerm(input.terms, input.nowMs);
  const clock = doorClockAt(input.nowMs);
  const week = term.inSession && input.index
    ? doorWeek(doorRowsForRoom(input.index, input.room, input.building), input.index.courses, input.index.cancels, doorWeekDates(clock.date, clock.weekday))
    : [];
  return {
    kind: "room", at: input.nowMs, build: input.build, soon: DOOR_SOON_MINUTES,
    room: { code: input.room.canonicalCode, floor: roomFloor(input.room.canonicalCode).label, building: doorBuildingInfo(input.building, input.room.buildingCode) },
    term: term.door, upcoming: term.inSession ? "" : term.upcoming, week, board: input.boardHref,
  };
}

export function boardDoorData(input: {
  building: MasterBuilding; rooms: Array<{ room: MasterRoom; href: string }>; index: DoorTermIndex | null; terms: readonly AdTerm[];
  nowMs: number; build: string;
}): BoardDoorData {
  const term = currentDoorTerm(input.terms, input.nowMs);
  const clock = doorClockAt(input.nowMs);
  const dates = doorWeekDates(clock.date, clock.weekday);
  return {
    kind: "board", at: input.nowMs, build: input.build, soon: DOOR_SOON_MINUTES,
    building: doorBuildingInfo(input.building, input.building.officialCode),
    term: term.door, upcoming: term.inSession ? "" : term.upcoming,
    rooms: [...input.rooms]
      .sort((a, b) => compareDoorRooms(a.room.canonicalCode, b.room.canonicalCode))
      .map(({ room, href }) => {
        const floor = roomFloor(room.canonicalCode);
        const week = term.inSession && input.index
          ? boardWeek(doorWeek(doorRowsForRoom(input.index, room, input.building), input.index.courses, input.index.cancels, dates))
          : [];
        return { code: room.canonicalCode, floor: floor.label, rank: floor.rank, href, week };
      }),
  };
}

/** القاعاتُ التي تُطبع لها ملصقات وتظهر في اللوحة: فعّالةٌ ومؤكَّدة في السجل. */
export const doorRoomEligible = (room: MasterRoom): boolean => room.active !== false && room.confidence === "CONFIRMED";
export const doorBuildingEligible = (building: MasterBuilding): boolean => building.active !== false && building.confidence === "CONFIRMED";
