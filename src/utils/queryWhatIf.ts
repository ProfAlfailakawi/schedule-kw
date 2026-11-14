/**
 * ── «لو نقلتُ… ماذا يتعارض؟» (قراءةٌ فقط) ────────────────────────────────────
 *
 * جملةٌ مثل «لو نقلت شعبة 101 للثلاثاء 10» تُجاب هنا بالأرقام ولا يتغيّر شيءٌ في الجدول: تُحسب لكل شعبةٍ
 * من المقرر خانتُها الجديدة (المدةُ هي هي، واليومُ والساعةُ كما قيل)، ثم تُفحص ضد ما في القسم المقروء
 * (القاعةُ نفسها، والأستاذُ نفسه) وضد حجوزات القاعات في الجامعة كلها (من مسار الإشغال: ما ليس لنطاقك
 * يُعدّ «حجزاً خارجياً» بلا أسماء). والعمل الفعلي يبقى في ورشة الجدول وبفاحصها.
 */
import type { FSchedule } from "../types";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "./scheduleTime";
import { DAY_FLAGS } from "./naturalQuery";

export interface ExternalBusy { roomId: string; day: number; from: number; to: number; mine: boolean }

export interface WhatIfConflict { kind: "room" | "instructor" | "external"; /** من يتعارض معه، بلا اسمِ أستاذٍ من قسمٍ آخر. */ withLabel: string }

export interface WhatIfMatch {
  row: FSchedule;
  newDays: number[];
  from: number;
  to: number;
  conflicts: WhatIfConflict[];
  /** يخرج عن ساعات الدوام الشامل. */
  outsideHours: boolean;
  /** لا تغيير فعلي: الخانةُ هي نفسها. */
  unchanged: boolean;
}

const minutesOf = (value: unknown) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export const daysOf = (row: FSchedule): number[] => DAY_FLAGS.flatMap((flag, day) => ((row as any)[flag] ? [day] : []));
const overlap = (aFrom: number, aTo: number, bFrom: number, bTo: number) => aFrom < bTo && aTo > bFrom;

export function whatIfMove(input: {
  rows: ReadonlyArray<FSchedule>;
  /** رقم المقرر كما كتبه القارئ: ثلاث خانات أو سبع. */
  code: string;
  day: number | null;
  time: string | null;
  courseNumberOf: (row: FSchedule) => string;
  courseCodeOf: (row: FSchedule) => string;
  courseNameOf: (row: FSchedule) => string;
  roomKeyOf: (row: FSchedule) => string;
  external?: ReadonlyArray<ExternalBusy>;
}): WhatIfMatch[] {
  const code = String(input.code || "").trim();
  if (!code || (input.day === null && !input.time)) return [];
  const targets = input.rows.filter(row => {
    const full = input.courseNumberOf(row);
    return input.courseCodeOf(row) === code || full === code || (code.length === 3 && full.endsWith(code));
  });
  return targets.map(row => {
    const duration = Math.max(0, minutesOf(row.fendtime) - minutesOf(row.fstarttime));
    const from = input.time ? minutesOf(input.time) : minutesOf(row.fstarttime);
    const to = from + duration;
    const newDays = input.day !== null ? [input.day] : daysOf(row);
    const roomKey = input.roomKeyOf(row);
    const conflicts: WhatIfConflict[] = [];
    for (const other of input.rows) {
      if (other.id === row.id) continue;
      const shared = daysOf(other).filter(day => newDays.includes(day));
      if (!shared.length || !overlap(from, to, minutesOf(other.fstarttime), minutesOf(other.fendtime))) continue;
      const label = `${input.courseNameOf(other)} · ${other.SCode || "—"}`;
      if (roomKey && input.roomKeyOf(other) === roomKey) conflicts.push({ kind: "room", withLabel: label });
      if (row.AdInstructorId && other.AdInstructorId === row.AdInstructorId) conflicts.push({ kind: "instructor", withLabel: label });
    }
    if (row.roomId) {
      const taken = (input.external || []).filter(slot => !slot.mine && slot.roomId === String(row.roomId) && newDays.includes(slot.day) && overlap(from, to, slot.from, slot.to));
      if (taken.length) conflicts.push({ kind: "external", withLabel: "" });
    }
    const sameDays = JSON.stringify(newDays) === JSON.stringify(daysOf(row));
    return {
      row, newDays, from, to, conflicts,
      outsideHours: from < SCHEDULE_DAY_START || to > SCHEDULE_DAY_END,
      unchanged: sameDays && from === minutesOf(row.fstarttime),
    };
  });
}
