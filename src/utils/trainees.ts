/**
 * ── «🎓 تدريب»: مَن في مرحلة التدريب في هذا النطاق ──────────────────────────
 *
 * المتدرّبُ (المدرّب المساعد في مرحلة التدريب) هو مَن طلبُه في القسم والفصل بصفة 🎓
 * (`InstructorRequest.linkMode === "ta"`، src/utils/linkMode.ts) — لا يُخمَّن من غير ذلك.
 * الوارد يقرؤه من صفوفه مباشرة (isTaRequest)؛ وبقيةُ الشاشات (المنتقيات، الأسبوع المصغّر،
 * التقارير) تقرأ معرّفاتهم من ‎/api/ta-trainees‎ مرّةً لكل نطاق، تُشارَك بين المكوّنات.
 * الوسمُ زينة: إن رُفضت القراءة (صلاحية) لا يظهر شيءٌ ولا تتعطّل الشاشة.
 */
import { useEffect, useState } from "react";

const EMPTY: ReadonlySet<number> = new Set();
const cache = new Map<string, ReadonlySet<number>>();
/* فتحُ مرحلة التدريب يغيّر مَن هو متدرّب: ما قُرئ قبل نصف دقيقة يُقرأ من جديد عند أول شاشةٍ تطلبه. */
const readAt = new Map<string, number>();
const FRESH_MS = 30_000;
const inflight = new Map<string, Promise<ReadonlySet<number>>>();
const listeners = new Map<string, Set<(ids: ReadonlySet<number>) => void>>();

const keyOf = (collegeId: number, sectionId: number, termId: number) => `${collegeId}:${sectionId}:${termId}`;

async function load(key: string, collegeId: number, sectionId: number, termId: number): Promise<ReadonlySet<number>> {
  if (inflight.has(key)) return inflight.get(key)!;
  const task = (async () => {
    try {
      const response = await fetch(`/api/ta-trainees?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include" });
      const data = response.ok ? await response.json().catch(() => ({})) : {};
      const ids: ReadonlySet<number> = new Set((Array.isArray(data?.ids) ? data.ids : []).map(Number).filter(Boolean));
      cache.set(key, ids);
      readAt.set(key, Date.now());
      listeners.get(key)?.forEach(listener => listener(ids));
      return ids;
    } catch { return cache.get(key) || EMPTY; }
    finally { inflight.delete(key); }
  })();
  inflight.set(key, task);
  return task;
}

/** معرّفاتُ المتدرّبين في القسم والفصل (فارغةٌ حتى تصل، أو بلا نطاق). */
export function useTrainees(collegeId: unknown, sectionId: unknown, termId: unknown): ReadonlySet<number> {
  const c = Number(collegeId) || 0, s = Number(sectionId) || 0, t = Number(termId) || 0;
  const key = keyOf(c, s, t);
  const [ids, setIds] = useState<ReadonlySet<number>>(() => cache.get(key) || EMPTY);
  useEffect(() => {
    if (!c || !s || !t) { setIds(EMPTY); return; }
    const set = listeners.get(key) || new Set();
    set.add(setIds);
    listeners.set(key, set);
    setIds(cache.get(key) || EMPTY);
    if (!cache.has(key) || Date.now() - (readAt.get(key) || 0) > FRESH_MS) void load(key, c, s, t);
    return () => { set.delete(setIds); };
  }, [key, c, s, t]);
  return ids;
}

/** هل هذا الشخص متدرّبٌ في النطاق؟ (للشاشات التي تعرض شخصاً واحداً: رأس المقترح الدراسي ونماذجه.) */
export function useIsTrainee(instructorId: unknown, collegeId: unknown, sectionId: unknown, termId: unknown): boolean {
  return useTrainees(collegeId, sectionId, termId).has(Number(instructorId) || 0);
}
