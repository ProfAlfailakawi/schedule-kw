import React from "react";
import { DoorOpen } from "lucide-react";
import type { FSchedule } from "../types";

/** Only show a saved companion booking, labeled with its actual registered room type. */
export default function CompanionFacilityBadge({ row, compact = false }: { row: Pick<FSchedule, "companionRoomId" | "companionRoomLabel" | "companionRoomType">; compact?: boolean }) {
  if (!String(row.companionRoomId || "").trim()) return null;
  const label = String(row.companionRoomLabel || "").trim();
  const type = String(row.companionRoomType || "").trim() || "مرفق";
  return (
    <span className={`companion-facility-badge${compact ? " is-compact" : ""}`} data-companion-facility="true" title={`المرفق المرافق · ${type}${label ? ` · ${label}` : ""}`} aria-label={`المرفق المرافق · ${type}${label ? ` · ${label}` : ""}`} dir="rtl">
      <DoorOpen aria-hidden="true" />
      <span>{type}</span>
      {label ? <bdi dir="ltr">{label}</bdi> : null}
    </span>
  );
}
