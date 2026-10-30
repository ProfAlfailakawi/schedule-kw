/**
 * ── «حدّث ثم أعد» — شريطٌ هادئ بلمسةٍ واحدة ──────────────────────────────────────────────
 *
 * كتابةٌ رُدّت لأن زميلاً حفظ قبلها (src/utils/staleWrite.ts) ليست خطأً يُخيف: لم يُمسّ شيء، وكلُّ
 * ما يلزم قراءةُ ما كتبه الزميل ثم الإعادة. فلا صندوقَ أحمر: شريطٌ كهرمانيّ صغير أسفل الشاشة،
 * وزرٌّ واحد «حدّث» يقرأ من جديد ويطوي الشريط.
 */
import React, { useCallback, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { STALE_WRITE_CODE } from "../utils/staleWrite";

/** هل هذا خطأُ «حدّث ثم أعد»؟ (أدواتُ النداء تضع `code` على الخطأ.) */
export const isStaleError = (error: unknown): boolean => Boolean(error && typeof error === "object" && (error as any).code === STALE_WRITE_CODE);

/** خطأٌ يحمل رمزَ الخادم إن كان، لتعرفه الشاشة. */
export function errorWithCode(message: string, code?: unknown): Error {
  const error = new Error(message);
  if (typeof code === "string" && code) (error as any).code = code;
  return error;
}

export function useStaleWrite(onRefresh: () => unknown) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** يُمرَّر له الخطأ: إن كان «حدّث ثم أعد» فتح الشريطَ وقال true، وإلا false فتعرضه الشاشةُ كعادتها. */
  const catchStale = useCallback((error: unknown): boolean => {
    if (!isStaleError(error)) return false;
    setOpen(true);
    return true;
  }, []);
  const refresh = async () => {
    setBusy(true);
    try { await onRefresh(); } finally { setBusy(false); setOpen(false); }
  };
  const staleToast = open ? (
    <div className="stale-write-toast" role="status" aria-live="polite">
      <span className="stale-write-icon" aria-hidden="true"><RefreshCw /></span>
      <span className="stale-write-text">عدّل زميلُك هذا قبلك</span>
      <button type="button" className="stale-write-go" disabled={busy} onClick={() => void refresh()} data-guide-ignore="يقرأ ما حفظه الزميل من جديد؛ لا يكتب شيئاً">
        حدّث
      </button>
      <button type="button" className="stale-write-close" aria-label="إغلاق" onClick={() => setOpen(false)} data-guide-ignore="يطوي الشريط؛ لا يغيّر شيئاً">
        <X aria-hidden="true" />
      </button>
    </div>
  ) : null;
  return { staleToast, catchStale };
}
