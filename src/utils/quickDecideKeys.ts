/**
 * ── اختصاراتُ «قرار سريع» في كشف التسجيل: لمن تُقرأ الضغطة؟ ─────────────────
 *
 * كان مستمعُ النافذة يتجاهل الحقولَ وحدها ثم يقرأ Enter موافقةً — والتركيزُ على زرّ «تخطّ» أو «رفض» أو
 * «تراجع» في ورقة السبب: فيضغط المستخدمُ Enter على زرٍّ ويُكتب قرارُ موافقةٍ لم يُرِده.
 *
 * فصارت القاعدةُ هنا، صرفةً بلا DOM لتُفحص في الاختبار:
 *  - النافذةُ معلّقةٌ (ورقةُ السبب مفتوحة فوقها) ← لا شيء.
 *  - الضغطةُ من داخل نافذةٍ أخرى ← لا شيء، ولا حتى Escape.
 *  - Escape يُغلق.
 *  - الضغطةُ على عنصرٍ تفاعليّ (حقل، زر، رابط، role=button…) ← لا شيء: للعنصر فعلُه هو.
 *  - وإلا: Enter موافقة، R/ر ردّ، السهمُ الأيسر أو المسافة تخطٍّ.
 */
export interface QuickKeyTarget {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

export type QuickDecideAction = "approve" | "reject" | "skip" | "close";

const INTERACTIVE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A", "SUMMARY", "OPTION"]);
const INTERACTIVE_SELECTOR = "button,a[href],input,textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[contenteditable=true]";
const DIALOG_SELECTOR = "[role=dialog],[role=alertdialog],[aria-modal=true],dialog";

export function quickDecideKeyAction(key: string, target: QuickKeyTarget | null | undefined, options: {
  /** ورقةُ السبب (أو أيُّ نافذةٍ فوق القرار السريع) مفتوحة. */
  suspended: boolean;
  /** عنصرُ نافذة القرار السريع نفسها: الضغطةُ من داخل نافذةٍ غيرها لا تُقرأ هنا. */
  dialog?: unknown;
}): QuickDecideAction | null {
  if (options.suspended) return null;
  const owner = target?.closest?.(DIALOG_SELECTOR) ?? null;
  if (owner && options.dialog && owner !== options.dialog) return null;
  if (key === "Escape") return "close";
  const tag = String(target?.tagName || "").toUpperCase();
  if (INTERACTIVE_TAGS.has(tag) || target?.isContentEditable) return null;
  if (target?.closest?.(INTERACTIVE_SELECTOR)) return null;
  if (key === "Enter") return "approve";
  if (key === "r" || key === "R" || key === "ر") return "reject";
  if (key === "ArrowLeft" || key === " ") return "skip";
  return null;
}
