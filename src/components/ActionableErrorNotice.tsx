import { Ban, CloudOff, FileQuestion, Hourglass, RefreshCw, ServerCrash, TriangleAlert, WifiOff, X } from "lucide-react";
import type { ActionableError } from "../utils/actionableError";

const ICONS = {
  offline: WifiOff, permission: Ban, missing: FileQuestion, validation: TriangleAlert,
  busy: Hourglass, server: ServerCrash, unknown: CloudOff,
} as const;

/** Icon + reason + retry (K3). The technical line is for administrators only. */
export default function ActionableErrorNotice({ error, onRetry, onDismiss, showTechnical, retrying }: {
  error: ActionableError;
  onRetry?: () => void;
  onDismiss?: () => void;
  showTechnical?: boolean;
  retrying?: boolean;
}) {
  const Icon = ICONS[error.kind] || CloudOff;
  return (
    <div className={`actionable-error kind-${error.kind}`} role="alert" data-error-kind={error.kind}>
      <span className="actionable-error-icon" aria-hidden="true"><Icon /></span>
      <span className="actionable-error-copy">
        <strong>{error.title}</strong>
        <small>{error.reason}</small>
        {showTechnical && error.technical ? <code dir="ltr">{error.technical}</code> : null}
      </span>
      {error.retryable && onRetry ? (
        <button type="button" className="actionable-error-retry" onClick={onRetry} disabled={retrying}
          data-guide-ignore="إعادة محاولة القراءة التي تعذّرت فقط">
          <RefreshCw aria-hidden="true" className={retrying ? "spin" : undefined} /> أعد المحاولة
        </button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="actionable-error-dismiss" onClick={onDismiss} aria-label="إغلاق"
          data-guide-ignore="إغلاق رسالة الخطأ فقط"><X aria-hidden="true" /></button>
      ) : null}
    </div>
  );
}
