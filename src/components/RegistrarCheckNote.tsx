/**
 * ── تنبيهُ «في فحص التسجيل» تحت شريط التراجع ─────────────────────────────────
 *
 * من يعدّل شعبةً قرأها آخرُ فحصٍ محفوظ لملف التسجيل يُقال له ذلك لحظة الحفظ: التقريرُ
 * يُحسب على الجدول متى فُتح، فيظهر التعديلُ فيه بنداً يُطلب من التسجيل. قراءةٌ لا فعل.
 * المفاتيح تُقرأ مرّةً لكل نطاق (الرقم المرجعي، وإلا المقرر والشعبة).
 */
import React, { useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { checkCrnKey, checkPairKey, type RegistrarCheckKeys } from "../utils/registrarRequest";
import { openMatchReport } from "../utils/openMatchReport";
import { requestDay } from "./RegistrarRequests";

const cache = new Map<string, Promise<RegistrarCheckKeys | null>>();
function keysFor(collegeId: number, sectionId: number, termId: number) {
  const key = `${collegeId}:${sectionId}:${termId}`;
  if (!cache.has(key)) {
    cache.set(key, fetch(`/api/schedules/registrar-requests/keys?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(data => (data?.keys as RegistrarCheckKeys) || null)
      .catch(() => { cache.delete(key); return null; }));
  }
  return cache.get(key)!;
}
/** بعد حفظ فحصٍ جديد تُنسى المفاتيح القديمة. */
export const forgetRegistrarCheckKeys = () => cache.clear();

type RowLike = { id?: number | string; referenceNumber?: string; AdCourseId?: number; SCode?: string };

/** معرّفاتُ الصفوف التي يمسّها تراجعٌ ما: مساراتُ `/api/schedules/<id>`. */
export const undoRowIds = (steps: ReadonlyArray<{ url: string }>) =>
  steps.map(step => Number(/^\/api\/schedules\/(\d+)$/.exec(step.url)?.[1] || 0)).filter(Boolean);

export default function RegistrarCheckNote({ collegeId, sectionId, termId, rowIds, rows }: {
  collegeId: number; sectionId: number; termId: number; rowIds: number[]; rows: readonly RowLike[];
}) {
  const [keys, setKeys] = useState<RegistrarCheckKeys | null>(null);
  useEffect(() => {
    let alive = true;
    if (!collegeId || !sectionId || !termId) { setKeys(null); return; }
    void keysFor(collegeId, sectionId, termId).then(found => { if (alive) setKeys(found); });
    return () => { alive = false; };
  }, [collegeId, sectionId, termId]);
  if (!keys || !rowIds.length) return null;
  const crns = new Set(keys.crns), pairs = new Set(keys.pairs);
  const touched = rows.some(row => rowIds.includes(Number(row.id)) && (
    (checkCrnKey(row.referenceNumber) && crns.has(checkCrnKey(row.referenceNumber))) || pairs.has(checkPairKey(row.AdCourseId, row.SCode))
  ));
  if (!touched) return null;
  return (
    <span className="undo-registrar-note">
      <ClipboardCheck aria-hidden="true" />
      هذه الشعبة في فحص التسجيل ({requestDay(keys.at)})، ويظهر تعديلها في تقرير المطابقة.
      <button type="button" data-guide-ignore="يفتح تقرير مطابقة التسجيل في مركز الاستعلام — تنقّلٌ لا فعل" onClick={openMatchReport}>افتح التقرير</button>
    </span>
  );
}
