/**
 * ── اقتراحات «بدّل القاعتين» للموعد المفتوح ──
 * سؤالٌ واحدٌ للخادم (/api/schedules/room-swap-ideas) كلما اكتمل المقرر والأيام والوقت أو تغيّرت القاعة؛
 * يُجاب بلا شيء في الحالة العادية، فلا تظهر البطاقة إلا حين تكون القاعة غير ملائمة أو لا قاعةَ ملائمةً حرّة.
 * للقراءة فقط؛ والتنفيذ يبقى عبر النقل الذرّي في Schedules.
 */
import { useEffect, useState } from "react";
import type { RoomSwap } from "../utils/appointmentRoomSwap";

export function useRoomSwaps(body: Record<string, unknown> | null, refresh: unknown = 0): RoomSwap[] {
  const [swaps, setSwaps] = useState<RoomSwap[]>([]);
  const key = body ? JSON.stringify(body) : "";
  useEffect(() => {
    setSwaps([]);
    if (!key) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/schedules/room-swap-ideas", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: key, signal: controller.signal })
        .then(response => (response.ok ? response.json() : null))
        .then(data => { if (Array.isArray(data?.swaps)) setSwaps(data.swaps); })
        .catch(() => { /* اقتراحٌ اختياري: الفشل صمتٌ لا خطأ */ });
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, refresh]);
  return swaps;
}

/** جسمُ الطلب من حقول النموذج (الأيام والوقت والقاعة الحالية)؛ null ما لم يكتمل الموعد. */
export function roomSwapBody(form: Record<string, any>, excludeId: number): Record<string, unknown> | null {
  const days = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"];
  if (!Number(form.AdCollegeId || 0) || !Number(form.AdSectionId || 0) || !Number(form.AdTermId || 0) || !Number(form.AdCourseId || 0)
    || !form.fstarttime || !form.fendtime || !days.some(day => form[day])) return null;
  const body: Record<string, unknown> = {
    AdCollegeId: form.AdCollegeId, AdSectionId: form.AdSectionId, AdTermId: form.AdTermId, AdCourseId: form.AdCourseId,
    fstarttime: form.fstarttime, fendtime: form.fendtime, excludeId,
    roomId: form.roomId || "", buildingId: form.buildingId || "", AdRoomCode: form.AdRoomCode || "", AdRoomHall: form.AdRoomHall || "",
    locationStatus: form.locationStatus || "",
  };
  for (const day of days) body[day] = Boolean(form[day]);
  return body;
}
