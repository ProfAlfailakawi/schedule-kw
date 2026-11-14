/**
 * ── ما لم يُحسب ──────────────────────────────────────────────────────────────
 *
 * عدساتُ القاعات والإشغال والمصفوفة تحسب القاعاتِ الرسميةَ الموثّقةَ وحدها (بنودُ الجودة تُقال في موضعها لا
 * تُضخّم رقماً). فمن يقرأ «٣٠٪» يجب أن يعرف أن موعداً أو اثنين استُبعدا ولماذا. هنا: كل موعدٍ استُبعد، وسببه.
 */
import type { FSchedule } from "../types";
import { daysOf } from "./queryWhatIf";

export type ExcludedReason = "pending" | "review" | "invalid" | "noRoom" | "noTime" | "noDays";
export interface ExcludedRow { row: FSchedule; reason: ExcludedReason }

const minutesOf = (value: unknown) => { const [h, m] = String(value || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : NaN; };

export function excludedFromRooms(rows: ReadonlyArray<FSchedule>): ExcludedRow[] {
  const out: ExcludedRow[] = [];
  for (const row of rows) {
    const from = minutesOf(row.fstarttime), to = minutesOf(row.fendtime);
    let reason: ExcludedReason | null = null;
    if (!(to > from)) reason = "noTime";
    else if (!daysOf(row).length) reason = "noDays";
    else if (row.locationStatus === "PENDING_ROOM") reason = "pending";
    else if (row.locationStatus === "LOCATION_REVIEW_REQUIRED") reason = "review";
    else if (row.locationStatus === "INVALID_HISTORICAL") reason = "invalid";
    else if (!row.roomId) reason = "noRoom";
    if (reason) out.push({ row, reason });
  }
  return out;
}

export const EXCLUDED_REASON_LABEL: Record<ExcludedReason, string> = {
  pending: "قاعةٌ بانتظار التثبيت", review: "قاعةٌ تحتاج مراجعة", invalid: "قاعةٌ قديمةٌ غير صالحة",
  noRoom: "بلا قاعة", noTime: "بلا وقتٍ صالح", noDays: "بلا أيام",
};
