import React from "react";
import { DoorOpen } from "lucide-react";
import type { FSchedule } from "../types";

/** Identifies the second occupied physical room on an academic appointment. */
export default function CompanionFacilityBadge({ row, compact = false }: { row: Pick<FSchedule, "companionRoomId" | "companionRoomLabel">; compact?: boolean }) {
  const label = String(row.companionRoomLabel || "").trim();
  if (!row.companionRoomId && !label) return null;
  return (
    <span className={`companion-facility-badge${compact ? " is-compact" : ""}`} data-companion-facility="true" title={`المرفق المرافق${label ? `: ${label}` : ""}`} aria-label={`المرفق المرافق${label ? `: ${label}` : ""}`} dir="rtl">
      <DoorOpen aria-hidden="true" />
      <span>مرفق</span>
      {label ? <bdi dir="ltr">{label}</bdi> : null}
    </span>
  );
}
