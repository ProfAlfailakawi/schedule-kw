/**
 * ── بابٌ واحد بين الجدول و«مركز الذكاء» ───────────────────────────────────
 *
 * «مركز القرار» كان نافذةً فوق الجدول؛ صار بطاقاتٍ في «مركز الذكاء». فما كان
 * يُفتح هناك (الحلقات الثلاث، «بداية الفصل») يُفتح الآن على بطاقته مباشرةً،
 * وما كان يعود منه إلى الجدول («افتح الموعد الأصلي»، «افتح في نموذج التعديل»)
 * يعود بتسليمٍ صريح تقرؤه شاشةُ الجدول مرةً واحدة.
 */

export const INTELLIGENCE_PATH = "/Schedule/Intelligence";
export const SCHEDULE_OPEN_EDIT_KEY = "schedule-open-edit";

/** يفتح «مركز الذكاء» على مرحلةٍ وبطاقة، داخل التطبيق نفسه (خطوةٌ في التاريخ). */
export function openIntelligenceCard(stage: "command" | "copilot" | "twin" | "whatif" | "history", card?: string) {
  const params = new URLSearchParams({ stage });
  if (card) params.set("card", card);
  window.history.pushState({}, "", `${INTELLIGENCE_PATH}?${params.toString()}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "auto" });
}

export interface ScheduleEditHandoff {
  /** المواعيد بالترتيب: الأول يُفتح، والبقية طابورُ التعديل نفسه. */
  ids: number[];
  /** بديلٌ مقترح يُملأ به نموذجُ الموعد الأول قبل الحفظ (لا يُحفظ وحده). */
  candidate?: Record<string, unknown>;
  createdAt: number;
}

/** يسلّم الجدولَ موعداً (أو طابوراً) ليفتحه في نموذج التعديل، ثم ينتقل إليه. */
export function openInScheduleEditor(ids: number[], candidate?: Record<string, unknown>) {
  const clean = [...new Set(ids.map(Number).filter(Boolean))];
  if (!clean.length) return;
  try {
    sessionStorage.setItem(SCHEDULE_OPEN_EDIT_KEY, JSON.stringify({ ids: clean, candidate, createdAt: Date.now() } satisfies ScheduleEditHandoff));
  } catch { /* private mode: the schedule simply opens without the form */ }
  window.location.assign("/FSchedule/Index");
}

/** يقرأ التسليم مرةً واحدة؛ تسليمٌ أقدم من عشر دقائق لا يُفتح. */
export function takeScheduleEditHandoff(): ScheduleEditHandoff | null {
  try {
    const raw = sessionStorage.getItem(SCHEDULE_OPEN_EDIT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SCHEDULE_OPEN_EDIT_KEY);
    const value = JSON.parse(raw) as ScheduleEditHandoff;
    if (!Array.isArray(value?.ids) || !value.ids.length || Date.now() - Number(value.createdAt || 0) > 10 * 60 * 1000) return null;
    return value;
  } catch { return null; }
}

/** يقرأ التسليم دون استهلاكه (لينتظر الجدولُ صفوفه). */
export function peekScheduleEditHandoff(): boolean {
  try { return Boolean(sessionStorage.getItem(SCHEDULE_OPEN_EDIT_KEY)); } catch { return false; }
}
