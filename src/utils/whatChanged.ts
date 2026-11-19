/**
 * ── ماذا غيّرنا؟ ─────────────────────────────────────────────────────────────
 *
 * بعد جلسة عملٍ طويلة لا يعرف القسمُ ماذا غيّر بالضبط. والجوابُ في النُّسَخ:
 * كلُّ تعديلٍ يسبقه لقطةٌ «قبل …» تحفظ الجدولَ كما كان لحظتَها، باسم من عدّل.
 *
 * فالحصيلةُ مقارنةٌ واحدة بين أقدم لقطةٍ في الفترة (الجدولُ قبل أول تعديلٍ فيها)
 * والجدولِ الحيّ الآن، بالمقارِن نفسه الذي يقرأ به التسجيلُ «ما تحرّك»
 * (diffSchedules: المعرّف ثم المقرر والشعبة ثم المقرر والموعد). فما عُدّل ثم
 * أُرجع يختفي، وما نُقل مرّتين يظهر من أوّله إلى آخره.
 *
 * و«كل الخطوات» تقرأ اللقطاتِ متتاليةً: الخطوةُ i هي الفرقُ بين لقطتها
 * واللقطةِ التي بعدها (أو الجدولِ الحيّ للأحدث)، ومن عدّلها صاحبُ لقطتها.
 *
 * دالّةٌ نقيّة: لا تقرأ قاعدةً ولا ساعة. الخادمُ يختار النُّسخ، وهذه تحسب.
 */
import type { FSchedule } from "../types";
import { diffSchedules, fieldValue, type DiffEntry, type DiffNames } from "./scheduleDiff";

export type ChangeTag = "moved" | "room" | "instructor" | "added" | "removed" | "course";
export const CHANGE_TAGS: ChangeTag[] = ["moved", "room", "instructor", "added", "removed", "course"];

export interface WcSlot {
  /** 0 الأحد … 4 الخميس */
  days: number[];
  start: string;
  end: string;
  room: string;
  instructor: string;
  course: string;
  section: string;
}

export interface WcEntry {
  key: string;
  kind: "added" | "removed" | "changed";
  scheduleId: number;
  courseId: number;
  courseCode: string;
  courseName: string;
  section: string;
  before: WcSlot | null;
  after: WcSlot | null;
  tags: ChangeTag[];
  /** من عدّل هذه الشعبة في الفترة، بترتيب أول ظهور. */
  by: string[];
  /** آخر لحظة مسّها فيها أحد. */
  at?: string;
}

export interface WcStep {
  at: string;
  by: string;
  label: string;
  entries: WcEntry[];
}

export interface WcVersion {
  id: string;
  createdAt: string;
  userName?: string;
  label?: string;
  rows: FSchedule[];
}

export interface WhatChangedNames extends DiffNames {
  courseCodeById?: Map<number, string>;
}

export interface WhatChanged {
  entries: WcEntry[];
  counts: Record<ChangeTag, number> & { total: number };
  steps: WcStep[];
}

const DAY_FIELDS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
/** حرفُ اليوم في الشارة: ح ن ث ر خ. */
export const DAY_LETTERS = ["ح", "ن", "ث", "ر", "خ"];

function clock(value: unknown): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? "").trim());
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : String(value ?? "").trim();
}

function slotOf(row: any, names?: WhatChangedNames): WcSlot {
  return {
    days: DAY_FIELDS.map((field, index) => (row?.[field] ? index : -1)).filter(index => index >= 0),
    start: clock(row?.fstarttime),
    end: clock(row?.fendtime),
    room: fieldValue(row, "room", names),
    instructor: fieldValue(row, "instructor", names),
    course: fieldValue(row, "course", names),
    section: fieldValue(row, "sectionCode", names),
  };
}

/** «الأحد · الثلاثاء» ← [0, 2]: القيمةُ التي كتبها المقارِن تعود أياماً. */
function daysFromText(text: string): number[] {
  return text.split("·").map(part => DAY_NAMES.indexOf(part.trim())).filter(index => index >= 0);
}

function sectionNumber(value: unknown): string {
  const text = String(value ?? "").trim();
  return text.replace(/\D/g, "").replace(/^0+/, "") || text;
}

function toEntry(entry: DiffEntry, names?: WhatChangedNames): WcEntry {
  const row: any = entry.row;
  const courseId = Number(row?.AdCourseId || 0);
  const now = slotOf(row, names);
  let before: WcSlot | null = null, after: WcSlot | null = null;
  const tags = new Set<ChangeTag>();
  if (entry.kind === "added") { after = now; tags.add("added"); }
  else if (entry.kind === "removed") { before = now; tags.add("removed"); }
  else {
    after = now;
    before = { ...now, days: [...now.days] };
    for (const change of entry.changes) {
      if (change.field === "days") { before.days = daysFromText(change.before); tags.add("moved"); }
      else if (change.field === "time") {
        const [start, end] = change.before.split("–").map(part => part.trim());
        before.start = start || ""; before.end = end || ""; tags.add("moved");
      } else if (change.field === "room") { before.room = change.before; tags.add("room"); }
      else if (change.field === "instructor") { before.instructor = change.before; tags.add("instructor"); }
      else if (change.field === "course") { before.course = change.before; tags.add("course"); }
      else if (change.field === "sectionCode") { before.section = change.before; tags.add("course"); }
    }
  }
  return {
    key: `${entry.kind}:${entry.scheduleId}`,
    kind: entry.kind,
    scheduleId: entry.scheduleId,
    courseId,
    courseCode: names?.courseCodeById?.get(courseId) || "",
    courseName: now.course,
    section: now.section,
    before, after,
    tags: CHANGE_TAGS.filter(tag => tags.has(tag)),
    by: [],
  };
}

function entriesOf(before: FSchedule[], after: FSchedule[], names?: WhatChangedNames): WcEntry[] {
  return diffSchedules(before, after, names).entries.map(entry => toEntry(entry, names));
}

const identityOf = (entry: Pick<WcEntry, "courseId" | "section">) => (entry.courseId ? `${entry.courseId}|${sectionNumber(entry.section)}` : "");

/**
 * versions: لقطاتُ الفترة **من الأقدم إلى الأحدث**، وأُولاها حالُ الجدول عند بدايتها.
 * baselineRows: أساسٌ صريح إن كان غيرَ أُولى اللقطات (قائمةٌ مقصوصة، أو نسخةُ الإرسال).
 */
export function summarizeWhatChanged(input: {
  versions: WcVersion[];
  live: FSchedule[];
  names?: WhatChangedNames;
  baselineRows?: FSchedule[];
}): WhatChanged {
  const { versions, live, names } = input;
  const baseline = input.baselineRows ?? versions[0]?.rows;
  const counts = { moved: 0, room: 0, instructor: 0, added: 0, removed: 0, course: 0, total: 0 };
  if (!baseline) return { entries: [], counts, steps: [] };

  const steps: WcStep[] = [];
  versions.forEach((version, index) => {
    const after = versions[index + 1]?.rows ?? live;
    const entries = entriesOf(version.rows || [], after, names);
    if (!entries.length) return;
    const by = String(version.userName || "").trim();
    for (const entry of entries) { entry.by = by ? [by] : []; entry.at = version.createdAt; }
    steps.push({ at: version.createdAt, by, label: String(version.label || ""), entries });
  });

  /* من مسّ الشعبة: بمعرّف الصفّ، ثم بالمقرر ورقم الشعبة لصفٍّ أُعيد إنشاؤه بمعرّفٍ جديد. */
  const touchedById = new Map<number, { by: string[]; at: string }>();
  const touchedByIdentity = new Map<string, { by: string[]; at: string }>();
  const note = (map: Map<any, { by: string[]; at: string }>, key: unknown, by: string, at: string) => {
    if (key === "" || key === 0) return;
    const current = map.get(key) || { by: [], at };
    if (by && !current.by.includes(by)) current.by.push(by);
    if (String(at) > String(current.at)) current.at = at;
    map.set(key, current);
  };
  for (const step of steps) for (const entry of step.entries) {
    note(touchedById, entry.scheduleId, step.by, step.at);
    note(touchedByIdentity, identityOf(entry), step.by, step.at);
  }

  const entries = entriesOf(baseline, live, names).map(entry => {
    const found = [touchedById.get(entry.scheduleId), touchedByIdentity.get(identityOf(entry))].filter(Boolean) as Array<{ by: string[]; at: string }>;
    if (!found.length) return entry;
    /* الترتيب بأوّل لحظة: من حذف الأصل قبل من أعاد إنشاءه. */
    const by = [...new Set(found.flatMap(item => item.by))];
    const firstAt = new Map<string, string>();
    for (const step of steps) for (const item of step.entries) {
      if (step.by && !firstAt.has(step.by) && (item.scheduleId === entry.scheduleId || (identityOf(entry) !== "" && identityOf(item) === identityOf(entry)))) firstAt.set(step.by, step.at);
    }
    by.sort((a, b) => String(firstAt.get(a) || "").localeCompare(String(firstAt.get(b) || "")));
    const at = found.map(item => item.at).sort().pop();
    return { ...entry, by, at };
  });
  for (const entry of entries) for (const tag of entry.tags) counts[tag] += 1;
  counts.total = entries.length;
  return { entries, counts, steps };
}

/* ── نصٌّ يُلصق في المحادثة: سطرٌ لكل شعبة ──────────────────────────────── */

function daysWords(days: number[]): string {
  return days.map(index => DAY_NAMES[index]).join(" ");
}

function whenText(slot: WcSlot): string {
  return [daysWords(slot.days), slot.start && slot.end ? `${slot.start}–${slot.end}` : ""].filter(Boolean).join(" ");
}

export function entryLine(entry: WcEntry): string {
  const head = [entry.courseCode, entry.courseName, entry.section && entry.section !== "—" ? `ش${entry.section}` : ""].filter(Boolean).join(" ");
  if (entry.kind === "added" && entry.after) return `➕ أُضيفت: ${head} — ${whenText(entry.after)}، ${entry.after.room}، ${entry.after.instructor}`;
  if (entry.kind === "removed" && entry.before) return `✖️ حُذفت: ${head} — ${whenText(entry.before)}`;
  const parts: string[] = [];
  const { before, after } = entry;
  if (before && after) {
    if (entry.tags.includes("moved")) parts.push(`${whenText(before)} ← ${whenText(after)}`);
    if (entry.tags.includes("room")) parts.push(`القاعة ${before.room} ← ${after.room}`);
    if (entry.tags.includes("instructor")) parts.push(`الأستاذ ${before.instructor} ← ${after.instructor}`);
    if (entry.tags.includes("course")) parts.push(`${before.course} ش${before.section} ← ${after.course} ش${after.section}`);
  }
  return `🔁 ${head}: ${parts.join("، ")}`;
}

export function whatChangedText(result: Pick<WhatChanged, "entries">, title: string): string {
  if (!result.entries.length) return `${title}\nلا تعديلات في هذه الفترة`;
  return [title, ...result.entries.map(entryLine)].join("\n");
}
