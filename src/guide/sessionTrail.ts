/**
 * ── أثر الجلسة ──
 *
 * آخر الأفعال ذات المعنى في هذه الجلسة، في الذاكرة فقط: معرّفات ميزات ثابتة،
 * لا أسماء ولا قاعات ولا نصوص. تموت بإغلاق الصفحة ولا تُرسل إلى أي جهة.
 * في الحزمة الرئيسية لأن الأفعال تقع قبل أن يُحمَّل المرشد.
 */
const LIMIT = 8;
let trail: Array<{ id: string; at: number }> = [];

export function noteSessionAction(id: string) {
  if (!id || !/^[a-zA-Z0-9.:_-]{1,80}$/.test(id)) return;
  if (trail[trail.length - 1]?.id === id) return;
  trail = [...trail, { id, at: Date.now() }].slice(-LIMIT);
}
export const sessionTrail = () => trail.map(item => item.id);
export const clearSessionTrail = () => { trail = []; };
