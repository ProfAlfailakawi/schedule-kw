import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
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
  /* الاختيار الحالي يُقرأ من مرجع لا من مفاتيح الجلب: اختيارُ مرفقٍ لا يعيد فحص كل المرافق
     (كان كل ربطٍ آلي يطلق جلباً ثانياً بلا داعٍ). */
  const chosenRef = useRef(String(form.companionRoomId || ""));
  chosenRef.current = String(form.companionRoomId || "");
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
      .then(data => {
        if (controller.signal.aborted) return;
        const nextRooms = Array.isArray(data.rooms) ? data.rooms : [];
        setRooms(nextRooms);
        const current = chosenRef.current;
        const currentOption = nextRooms.find((room: Option) => room.id === current);
        /* يجري ربط المرِفق تلقائياً بأول خيارٍ متاح طوال الموعد؛ وإن بقي
           الاختيار الحالي صالحاً نحافظ عليه. الخادم يعيد التحقق عند الحفظ. */
        if (!currentOption?.available) {
          const firstAvailable = nextRooms.find((room: Option) => room.available);
          if ((firstAvailable?.id || "") !== current) onChange({ companionRoomId: firstAvailable?.id || "", companionRoomLabel: firstAvailable?.label || "" });
        }
      })
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
        {rooms.map(room => <option key={room.id} value={room.id} disabled={!room.available}>
          {room.label}{room.available ? " · متاح" : " · مشغول في هذا الوقت"}
        </option>)}
      </select>
    </label>
    {/* سطرٌ واحد بأيقونة بدل ثلاث جمل: مربوط ✓ · مشغول ⚠️ · لا مرفق ⛔ */}
    {!loading && listed && rooms.find(room=>room.id===chosen)?.available ? <small role="status" className="companion-state is-ok" title="يُحجز المرفق مع القاعة الأساسية طوال الموعد دون موعد آخر"><Check aria-hidden="true" />مربوط ومتاح طوال الموعد</small> : null}
    {!loading && chosen && rooms.some(room=>room.id===chosen&&!room.available) ? <small role="alert" className="companion-state is-warn"><AlertTriangle aria-hidden="true" />مشغول الآن — اختر غيره</small> : null}
    {!loading && !error && !rooms.length && form.buildingId ? <small role="status" className="companion-state is-block" title="راجع أنواع القاعات وسياسة الحجز"><X aria-hidden="true" />لا «{requiredType}» للمرافقة في هذا الموقع</small> : null}
    {error ? <small role="alert">{error}</small> : null}
  </div>;
}
