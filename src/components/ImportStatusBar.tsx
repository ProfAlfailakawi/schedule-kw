/**
 * ── شريطُ الاستيراد: حالةٌ واحدة، وزرٌّ واحد، في متناول اليد دائماً ──
 *
 * كان زرّ النشر تحت جدولٍ طويل، و«طبّق» في بطاقةٍ أخرى، و«إغلاق» في موضعٍ ثالث؛ فالناس
 * يسألون: أين التطبيق؟ هذا الشريط يلتصق بأسفل النافذة ولا يغطّي شيئاً، ولا يملك منطقاً:
 * الحالة من importGateState، والأفعال هي أفعال الشاشة نفسها، فلا طريق جديد للكتابة.
 */
import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, CornerDownLeft, Loader2, RotateCcw, Undo2, X } from "lucide-react";
import type { ImportGateState } from "../utils/importGate";
import { AR, countOf } from "../utils/arabicCount";
import { PrimaryButton, SecondaryButton } from "./ui";
import "../styles/42-import-bar.css";

export default function ImportStatusBar({ state, applyLabel, confirmText, busy, onApply, onJump, onRetry, onClose, blockedVerb = "تمنع النشر", extra, message, applied, planning, inline }: {
  state: ImportGateState;
  applyLabel: React.ReactNode;
  /** إن وُجد فالتطبيق خطوتان: طلبٌ ثم تأكيد (تجربة بلا حفظ). */
  confirmText?: string;
  busy: boolean;
  onApply: () => void;
  onJump: () => void;
  onRetry: () => void;
  onClose: () => void;
  blockedVerb?: string;
  /** زرٌّ ثانوي مشروط بالجاهزية نفسها (حفظ كمسودة في مركز الذكاء). */
  extra?: React.ReactNode;
  /** خطأ الخادم عند اليد التي ضغطت. */
  message?: React.ReactNode;
  applied?: { text: string; onUndo?: () => void } | null;
  planning?: boolean;
  /** داخل صفحة لا نافذة: يلتصق فوق شريط الجوال. */
  inline?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (state.kind !== "ready" && state.kind !== "unverified") setConfirming(false); }, [state.kind]);
  const close = <SecondaryButton type="button" className="import-bar-close" onClick={onClose} disabled={busy} data-guide-ignore="يغلق المعاينة بلا كتابة"><X aria-hidden="true" />إغلاق</SecondaryButton>;
  const apply = confirmText
    ? <PrimaryButton type="button" className="import-bar-apply" onClick={() => setConfirming(true)} disabled={busy} data-guide-ignore="يطلب تأكيداً قبل استبدال الجدول بالملف">{applyLabel}</PrimaryButton>
    : <PrimaryButton type="button" className="import-bar-apply" onClick={onApply} disabled={busy} data-guide-ignore="إجراء استيراد له تحقق ومراجعة ونقطة أمان خاصة داخل نفس النافذة">{applyLabel}</PrimaryButton>;

  let icon: React.ReactNode, title: React.ReactNode, detail: React.ReactNode = null, actions: React.ReactNode;
  const kind = applied ? "applied" : state.kind;
  if (applied) {
    icon = <Check aria-hidden="true" />; title = applied.text;
    actions = <>{applied.onUndo ? <SecondaryButton type="button" onClick={applied.onUndo} disabled={busy} data-guide-ignore="تراجعٌ عن تطبيق الاستيراد إلى النسخة المحفوظة قبله"><Undo2 aria-hidden="true" />تراجع</SecondaryButton> : null}{close}</>;
  } else if (confirming && confirmText) {
    icon = <AlertTriangle aria-hidden="true" />; title = confirmText;
    actions = <>
      <PrimaryButton type="button" className="import-bar-apply" onClick={() => { setConfirming(false); onApply(); }} disabled={busy} data-guide-ignore="تأكيد استبدال الجدول بالملف؛ كتابةٌ واحدة لها نقطة تراجع">نعم، طبّق</PrimaryButton>
      <SecondaryButton type="button" onClick={() => setConfirming(false)} disabled={busy} data-guide-ignore="إلغاء التأكيد">إلغاء</SecondaryButton>
    </>;
  } else if (state.kind === "checking") {
    icon = <Loader2 className="import-bar-spin" aria-hidden="true" />; title = "يفحص"; detail = state.step; actions = close;
  } else if (state.kind === "blocked") {
    icon = <AlertTriangle aria-hidden="true" />;
    title = state.count ? `${countOf(state.count, AR.note)} ${blockedVerb}` : state.first;
    detail = state.count ? state.first : null;
    actions = <>{state.count ? <PrimaryButton type="button" className="import-bar-jump" onClick={onJump} data-guide-ignore="ينقل إلى أول ملاحظة في المعاينة؛ لا يكتب شيئاً"><CornerDownLeft aria-hidden="true" />اذهب إلى أول ملاحظة</PrimaryButton> : null}{close}</>;
  } else if (state.kind === "baseline-failed") {
    icon = <AlertTriangle aria-hidden="true" />; title = "تعذّرت قراءة جدول الفصل الحالي"; detail = "بدونه لا يُرسم الفرق.";
    actions = <><SecondaryButton type="button" onClick={onRetry} disabled={busy} data-guide-ignore="إعادة قراءة جدول الفصل الحالي للمقارنة؛ لا تكتب"><RotateCcw aria-hidden="true" />أعد المحاولة</SecondaryButton>{close}</>;
  } else if (state.kind === "unverified") {
    icon = <AlertTriangle aria-hidden="true" />; title = "تعذّر الفحص"; detail = "يفحص الخادم الجدول عند النشر.";
    actions = <>{apply}{extra}<SecondaryButton type="button" onClick={onRetry} disabled={busy} data-guide-ignore="إعادة فحص التعارض؛ لا تكتب"><RotateCcw aria-hidden="true" />أعد الفحص</SecondaryButton>{close}</>;
  } else {
    icon = <Check aria-hidden="true" />; title = "اكتمل الفحص";
    actions = <>{apply}{extra}{close}</>;
  }

  return (
    <div className={`import-bar is-${kind}${planning ? " is-planning" : ""}${inline ? " is-inline" : ""}`} data-state={kind} data-import-bar="true">
      {message}
      <div className="import-bar-row">
        <div className="import-bar-status" role="status" aria-live="polite">
          <span className="import-bar-mark">{icon}</span>
          <span className="import-bar-copy"><strong>{title}</strong>{detail ? <small>{detail}</small> : null}</span>
        </div>
        <div className="import-bar-actions">{actions}</div>
      </div>
    </div>
  );
}
