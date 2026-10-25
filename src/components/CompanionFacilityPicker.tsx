import React, { useEffect, useState } from "react";
import type { AdCourse, FSchedule } from "../types";

type Option = { id: string; label: string; available: boolean };
type Props = {
  course?: AdCourse;
  form: Partial<FSchedule>;
  excludeId?: number;
  onChange: (patch: Partial<FSchedule>) => void;
};

/** A campus-wide, time-aware picker; the server is the final authority on availability. */
export default function CompanionFacilityPicker({ course, form, excludeId, onChange }: Props) {
  const requiredType = String(course?.CourseCompanionRoomType || "").trim();
  const [rooms, setRooms] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const days = (["fsunday","fmonday","ftuesday","fwednesday","fthursday"] as const)
    .filter(day => Boolean(form[day])).join(",");
  useEffect(() => {
    if (!requiredType || !form.AdCollegeId || !form.AdSectionId || !form.AdCourseId || !form.buildingId) {
      setRooms([]); setError(""); setLoading(false); return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      collegeId: String(form.AdCollegeId),
      sectionId: String(form.AdSectionId),
      termId: String(form.AdTermId || ""),
      courseId: String(form.AdCourseId),
      buildingId: String(form.buildingId),
      excludeId: String(excludeId || 0),
      days, start: String(form.fstarttime || ""), end: String(form.fendtime || "")
    });
    setLoading(true); setError(""); setRooms([]);
    fetch(`/api/companion-rooms?${params.toString()}`, { signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "تعذر فحص الاستوديوهات");
        return data;
      })
      .then(data => { if (!controller.signal.aborted) setRooms(Array.isArray(data.rooms) ? data.rooms : []); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "تعذر جلب الاستوديوهات"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requiredType, form.AdCollegeId, form.AdSectionId, form.AdTermId, form.AdCourseId, form.buildingId, form.fstarttime, form.fendtime, days, excludeId]);
  if (!requiredType) return null;
  const chosen = String(form.companionRoomId || "");
  const listed = rooms.some(room => room.id === chosen);
  return <div className="location-registry-picker" data-companion-facility="true">
    <label>
      <span>المرفق المرافق · {requiredType} <b>*</b></span>
      <select
        aria-label="المرفق المرافق الإلزامي"
        value={listed ? chosen : ""}
        disabled={loading || !form.buildingId}
        onChange={event => {
          const room = rooms.find(option => option.id === event.target.value);
          onChange({ companionRoomId: room?.id || "", companionRoomLabel: room?.label || "" });
        }}
        required
      >
        <option value="">{loading ? "جارٍ فحص المرافق…" : "اختر المرفق المتاح طوال الموعد"}</option>
        {rooms.map(room => <option key={room.id} value={room.id} disabled={!room.available && room.id !== chosen}>
          {room.label}{room.available ? " · متاح" : room.id === chosen ? " · محجوز لهذا الموعد" : " · مشغول"}
        </option>)}
      </select>
    </label>
    <small>يُحجز هذا المرفق مع القاعة الأساسية طوال مدة الموعد، دون إنشاء موعد آخر.</small>
    {!loading && !error && !rooms.length && form.buildingId ? <small role="status">لا توجد مرافق من نوع «{requiredType}» مخصصة للمرافقة في هذا الموقع. راجع أنواع القاعات وسياسة الحجز.</small> : null}
    {error ? <small role="alert">{error}</small> : null}
  </div>;
}
